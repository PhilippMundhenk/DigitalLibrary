const fetch = require('node-fetch');

const TIMEOUT = 5000;

// --- Image probing & downloading ---

async function probeImage(url) {
  try {
    const r = await fetch(url, { method: 'HEAD', timeout: TIMEOUT, redirect: 'follow' });
    if (!r.ok) return null;
    const ct = r.headers.get('content-type') || '';
    if (!ct.startsWith('image/')) return null;
    const cl = parseInt(r.headers.get('content-length') || '0', 10);
    if (cl > 0 && cl < 1000) return null;
    return url;
  } catch (e) {
    return null;
  }
}

// Download image and return as data URI (base64). Returns null on failure.
async function downloadCoverAsBase64(url) {
  try {
    const r = await fetch(url, { timeout: TIMEOUT, redirect: 'follow' });
    if (!r.ok) return null;
    let ct = r.headers.get('content-type') || 'image/jpeg';
    if (!ct.startsWith('image/')) return null;
    // Strip charset and other params — keep just the MIME type
    ct = ct.split(';')[0].trim();
    const buf = await r.buffer();
    if (buf.length < 1000) return null; // tiny placeholder
    return `data:${ct};base64,${buf.toString('base64')}`;
  } catch (e) {
    return null;
  }
}

// --- Cover sources ---

function openLibraryCoverUrl(isbn) {
  return `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg`;
}

function dnbCoverUrl(isbn) {
  return `https://portal.dnb.de/opac/mvb/cover?isbn=${isbn}`;
}

function amazonCoverUrl(isbn) {
  return `https://images-na.ssl-images-amazon.com/images/P/${isbn}.01._SCLZZZZZZZ_.jpg`;
}

function googleBooksCoverUrl(volumeInfo) {
  if (!volumeInfo || !volumeInfo.imageLinks) return null;
  var url = volumeInfo.imageLinks.thumbnail || volumeInfo.imageLinks.smallThumbnail || null;
  if (url) return url.replace(/^http:\/\//, 'https://');
  return null;
}

// Find best cover, optionally download as base64
async function findCover(isbn, apiCovers, { asBase64 = false } = {}) {
  var candidates = [];
  if (apiCovers) {
    for (var url of apiCovers) {
      if (url) candidates.push(url.replace(/^http:\/\//, 'https://'));
    }
  }
  candidates.push(openLibraryCoverUrl(isbn));
  candidates.push(dnbCoverUrl(isbn));
  candidates.push(amazonCoverUrl(isbn));

  // Probe in parallel batches of 3
  for (var i = 0; i < candidates.length; i += 3) {
    var batch = candidates.slice(i, i + 3);
    var results = await Promise.all(batch.map(probeImage));
    for (var r of results) {
      if (r) {
        if (asBase64) return await downloadCoverAsBase64(r);
        return r;
      }
    }
  }
  return null;
}

// --- Metadata sources ---

async function fetchOpenLibrary(isbn) {
  const url = `https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&format=json&jscmd=data`;
  const r = await fetch(url, { timeout: TIMEOUT });
  const data = await r.json();
  const key = `ISBN:${isbn}`;
  if (!data || !data[key]) return null;
  const item = data[key];
  var coverUrls = [];
  if (item.cover) {
    if (item.cover.large) coverUrls.push(item.cover.large);
    if (item.cover.medium) coverUrls.push(item.cover.medium);
    if (item.cover.small) coverUrls.push(item.cover.small);
  }
  return {
    title: item.title || null,
    authors: (item.authors || []).map(a => a.name),
    publisher: item.publishers ? item.publishers.map(p => p.name).join(', ') : null,
    publishDate: item.publish_date || null,
    pages: item.number_of_pages || null,
    coverUrls
  };
}

async function fetchGoogleBooks(isbn) {
  const url = `https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}`;
  const r = await fetch(url, { timeout: TIMEOUT });
  const data = await r.json();
  if (!data.totalItems || !data.items || !data.items.length) return null;
  const v = data.items[0].volumeInfo;
  var coverUrls = [];
  var gbCover = googleBooksCoverUrl(v);
  if (gbCover) coverUrls.push(gbCover);
  return {
    title: v.title || null,
    authors: v.authors || [],
    publisher: v.publisher || null,
    publishDate: v.publishedDate || null,
    pages: v.pageCount || null,
    description: v.description || null,
    language: v.language || null,
    coverUrls
  };
}

// Clean MARC non-sorting control characters and HTML entities
function cleanMarcText(str) {
  if (!str) return str;
  // Remove MARC non-sorting indicator control characters (U+0098 START OF STRING, U+009C STRING TERMINATOR)
  str = str.replace(/[\u0088\u0089\u0098\u009C]/g, '');
  // Decode HTML numeric entities (&#152; &#156; etc.)
  str = str.replace(/&#(\d+);/g, function (_, code) {
    var c = parseInt(code, 10);
    // Control chars used as MARC delimiters — strip them
    if (c < 32 || (c >= 127 && c <= 159)) return '';
    return String.fromCharCode(c);
  });
  // Decode named HTML entities
  str = str.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'");
  // Collapse multiple spaces
  str = str.replace(/\s{2,}/g, ' ').trim();
  return str;
}

// Deutsche Nationalbibliothek (DNB) — SRU API with marcxml
async function fetchDNB(isbn) {
  const sruUrl = `https://services.dnb.de/sru/dnb?version=1.1&operation=searchRetrieve&query=isbn%3D${isbn}&recordSchema=MARC21-xml&maximumRecords=1`;
  try {
    const r = await fetch(sruUrl, { timeout: TIMEOUT });
    const xml = await r.text();
    if (!xml.includes('<record>') && !xml.includes('<record ')) return null;

    // Simple XML field extraction (no XML parser dependency)
    function marcField(tag, code) {
      // datafield with tag, then subfield with code
      const dfRe = new RegExp(`<(?:marc:)?datafield[^>]*tag="${tag}"[^>]*>([\\s\\S]*?)</(?:marc:)?datafield>`, 'g');
      let match;
      while ((match = dfRe.exec(xml)) !== null) {
        const sfRe = new RegExp(`<(?:marc:)?subfield[^>]*code="${code}"[^>]*>([^<]+)</`, 'g');
        const sf = sfRe.exec(match[1]);
        if (sf) return sf[1].trim();
      }
      return null;
    }

    function marcFieldAll(tag, code) {
      const results = [];
      const dfRe = new RegExp(`<(?:marc:)?datafield[^>]*tag="${tag}"[^>]*>([\\s\\S]*?)</(?:marc:)?datafield>`, 'g');
      let match;
      while ((match = dfRe.exec(xml)) !== null) {
        const sfRe = new RegExp(`<(?:marc:)?subfield[^>]*code="${code}"[^>]*>([^<]+)</`, 'g');
        const sf = sfRe.exec(match[1]);
        if (sf) results.push(sf[1].trim());
      }
      return results;
    }

    // MARC21 fields: 245$a=title, 100$a/700$a=authors, 260$b/264$b=publisher, 260$c/264$c=date, 300$a=pages
    var title = marcField('245', 'a');
    var subtitle = marcField('245', 'b');
    if (title && subtitle) {
      // Remove trailing punctuation from title before appending subtitle
      title = title.replace(/[\s:\/=]+$/, '');
      // Strip leading MARC punctuation indicators (= for parallel title, : for subtitle, / for responsibility)
      subtitle = subtitle.replace(/^[\s:=\/]+/, '').replace(/[\s:=\/]+$/, '');
      if (subtitle) title = title + ': ' + subtitle;
    }
    if (title) title = title.replace(/[\s:=\/]+$/, '');

    var authors = [];
    var mainAuthor = marcField('100', 'a');
    if (mainAuthor) authors.push(mainAuthor.replace(/[,.]$/, ''));
    var addAuthors = marcFieldAll('700', 'a');
    for (var a of addAuthors) authors.push(a.replace(/[,.]$/, ''));

    var publisher = marcField('264', 'b') || marcField('260', 'b');
    if (publisher) publisher = publisher.replace(/[,.]$/, '');
    var publishDate = marcField('264', 'c') || marcField('260', 'c');
    if (publishDate) publishDate = publishDate.replace(/[.]$/, '');

    var pagesRaw = marcField('300', 'a');
    var pages = null;
    if (pagesRaw) {
      var pm = pagesRaw.match(/(\d+)/);
      if (pm) pages = parseInt(pm[1], 10);
    }

    // Clean MARC control characters and HTML entities from all text fields
    title = cleanMarcText(title);
    authors = authors.map(cleanMarcText);
    publisher = cleanMarcText(publisher);
    publishDate = cleanMarcText(publishDate);

    if (!title && authors.length === 0) return null;

    return {
      title: title || null,
      authors,
      publisher: publisher || null,
      publishDate: publishDate || null,
      pages,
      coverUrls: [dnbCoverUrl(isbn)]
    };
  } catch (e) {
    return null;
  }
}

// --- Main entry: parallel fetch from all sources ---

async function fetchByISBN(isbn, { downloadCover = false } = {}) {
  isbn = isbn.replace(/[^0-9Xx]/g, '');
  if (!isbn || !/^(?:\d{9}[\dXx]|\d{13})$/.test(isbn)) return {};

  // Fetch all sources in parallel for speed
  const [olResult, gbResult, dnbResult] = await Promise.allSettled([
    fetchOpenLibrary(isbn).catch(() => null),
    fetchGoogleBooks(isbn).catch(() => null),
    fetchDNB(isbn).catch(() => null)
  ]);

  const ol = olResult.status === 'fulfilled' ? olResult.value : null;
  const gb = gbResult.status === 'fulfilled' ? gbResult.value : null;
  const dnb = dnbResult.status === 'fulfilled' ? dnbResult.value : null;

  if (!ol && !gb && !dnb) return {};

  // Merge: prefer OpenLibrary title (accurate casing), then DNB, then Google
  var title = (ol && ol.title) || (dnb && dnb.title) || (gb && gb.title) || null;
  var authors = (ol && ol.authors && ol.authors.length ? ol.authors : null)
    || (dnb && dnb.authors && dnb.authors.length ? dnb.authors : null)
    || (gb && gb.authors && gb.authors.length ? gb.authors : null)
    || undefined;
  var publisher = (ol && ol.publisher) || (dnb && dnb.publisher) || (gb && gb.publisher) || undefined;
  var publishDate = (ol && ol.publishDate) || (dnb && dnb.publishDate) || (gb && gb.publishDate) || undefined;
  var pages = (ol && ol.pages) || (dnb && dnb.pages) || (gb && gb.pages) || undefined;
  var description = (gb && gb.description) || undefined;
  var language = (gb && gb.language) || undefined;

  // Collect all cover URLs
  var allCoverUrls = [];
  if (ol && ol.coverUrls) allCoverUrls.push(...ol.coverUrls);
  if (gb && gb.coverUrls) allCoverUrls.push(...gb.coverUrls);
  if (dnb && dnb.coverUrls) allCoverUrls.push(...dnb.coverUrls);

  var cover = await findCover(isbn, allCoverUrls, { asBase64: downloadCover });

  return {
    title: title || undefined,
    authors,
    isbn,
    cover: cover || undefined,
    publisher,
    publishDate,
    pages,
    description,
    language
  };
}

module.exports = { fetchByISBN, findCover, probeImage, downloadCoverAsBase64, fetchOpenLibrary, fetchGoogleBooks, fetchDNB, cleanMarcText };
