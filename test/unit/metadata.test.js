const metadata = require('../../lib/metadata');

// Mock node-fetch so tests don't hit real APIs
jest.mock('node-fetch', () => jest.fn());
const fetch = require('node-fetch');

function mockResponse(body, headers = {}, ok = true) {
  return {
    ok,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(typeof body === 'string' ? body : JSON.stringify(body)),
    buffer: () => Promise.resolve(Buffer.from('fake-image-data-that-is-long-enough-to-pass-the-1KB-check-' + 'x'.repeat(1000))),
    headers: {
      get: (name) => headers[name.toLowerCase()] || null
    }
  };
}

function mockImageResponse(size = 50000) {
  return {
    ok: true,
    headers: { get: (h) => ({ 'content-type': 'image/jpeg', 'content-length': String(size) }[h.toLowerCase()] || null) }
  };
}

function mockFailResponse() {
  return { ok: false, headers: { get: () => null } };
}

beforeEach(() => {
  fetch.mockReset();
});

describe('probeImage', () => {
  test('returns URL for valid image response', async () => {
    fetch.mockResolvedValue(mockImageResponse());
    const result = await metadata.probeImage('https://example.com/cover.jpg');
    expect(result).toBe('https://example.com/cover.jpg');
  });

  test('returns null for non-image content type', async () => {
    fetch.mockResolvedValue({
      ok: true,
      headers: { get: (h) => ({ 'content-type': 'text/html', 'content-length': '5000' }[h.toLowerCase()] || null) }
    });
    expect(await metadata.probeImage('https://example.com/notanimage')).toBeNull();
  });

  test('returns null for HTTP error', async () => {
    fetch.mockResolvedValue(mockFailResponse());
    expect(await metadata.probeImage('https://example.com/404')).toBeNull();
  });

  test('returns null for tiny placeholder image', async () => {
    fetch.mockResolvedValue(mockImageResponse(43));
    expect(await metadata.probeImage('https://example.com/1x1.gif')).toBeNull();
  });

  test('returns URL when content-length is unknown', async () => {
    fetch.mockResolvedValue({
      ok: true,
      headers: { get: (h) => ({ 'content-type': 'image/jpeg' }[h.toLowerCase()] || null) }
    });
    expect(await metadata.probeImage('https://example.com/cover.jpg')).toBe('https://example.com/cover.jpg');
  });

  test('returns null on network error', async () => {
    fetch.mockRejectedValue(new Error('ECONNREFUSED'));
    expect(await metadata.probeImage('https://unreachable.example.com/img.jpg')).toBeNull();
  });
});

describe('downloadCoverAsBase64', () => {
  test('returns data URI for valid image', async () => {
    const imgBuf = Buffer.alloc(2000, 0xff);
    fetch.mockResolvedValue({
      ok: true,
      headers: { get: (h) => ({ 'content-type': 'image/jpeg' }[h.toLowerCase()] || null) },
      buffer: () => Promise.resolve(imgBuf)
    });
    const result = await metadata.downloadCoverAsBase64('https://example.com/cover.jpg');
    expect(result).toMatch(/^data:image\/jpeg;base64,/);
  });

  test('strips charset from content-type in data URI', async () => {
    const imgBuf = Buffer.alloc(2000, 0xff);
    fetch.mockResolvedValue({
      ok: true,
      headers: { get: (h) => ({ 'content-type': 'image/jpeg; charset=UTF-8' }[h.toLowerCase()] || null) },
      buffer: () => Promise.resolve(imgBuf)
    });
    const result = await metadata.downloadCoverAsBase64('https://example.com/cover.jpg');
    expect(result).toMatch(/^data:image\/jpeg;base64,/);
    expect(result).not.toContain('charset');
  });

  test('returns null for non-image', async () => {
    fetch.mockResolvedValue({
      ok: true,
      headers: { get: (h) => ({ 'content-type': 'text/html' }[h.toLowerCase()] || null) },
      buffer: () => Promise.resolve(Buffer.from('not an image'))
    });
    expect(await metadata.downloadCoverAsBase64('https://example.com/page.html')).toBeNull();
  });

  test('returns null for tiny image', async () => {
    fetch.mockResolvedValue({
      ok: true,
      headers: { get: (h) => ({ 'content-type': 'image/gif' }[h.toLowerCase()] || null) },
      buffer: () => Promise.resolve(Buffer.alloc(10))
    });
    expect(await metadata.downloadCoverAsBase64('https://example.com/tiny.gif')).toBeNull();
  });

  test('returns null on error', async () => {
    fetch.mockRejectedValue(new Error('network'));
    expect(await metadata.downloadCoverAsBase64('https://example.com/fail')).toBeNull();
  });
});

describe('cleanMarcText', () => {
  test('strips MARC non-sorting control characters', () => {
    // U+0098 and U+009C are MARC non-sorting indicators
    expect(metadata.cleanMarcText('\u0098Der\u009C neue Ninja')).toBe('Der neue Ninja');
  });

  test('strips HTML numeric entities for control characters', () => {
    expect(metadata.cleanMarcText('&#152;Der&#156; neue Ninja')).toBe('Der neue Ninja');
  });

  test('decodes regular HTML numeric entities', () => {
    expect(metadata.cleanMarcText('Caf&#233;')).toBe('Caf\u00e9');
  });

  test('decodes named HTML entities', () => {
    expect(metadata.cleanMarcText('Tom &amp; Jerry')).toBe('Tom & Jerry');
    expect(metadata.cleanMarcText('&lt;html&gt;')).toBe('<html>');
    expect(metadata.cleanMarcText('&quot;quoted&quot;')).toBe('"quoted"');
    expect(metadata.cleanMarcText('it&apos;s')).toBe("it's");
  });

  test('collapses multiple spaces', () => {
    expect(metadata.cleanMarcText('too   many    spaces')).toBe('too many spaces');
  });

  test('trims whitespace', () => {
    expect(metadata.cleanMarcText('  padded  ')).toBe('padded');
  });

  test('returns null/undefined as-is', () => {
    expect(metadata.cleanMarcText(null)).toBeNull();
    expect(metadata.cleanMarcText(undefined)).toBeUndefined();
    expect(metadata.cleanMarcText('')).toBe('');
  });

  test('handles combined issues (real-world DNB example)', () => {
    // Real case: "&#152;Der&#156; neue Ninja" from DNB
    expect(metadata.cleanMarcText('&#152;Der&#156; neue Ninja')).toBe('Der neue Ninja');
  });
});

describe('fetchOpenLibrary', () => {
  test('returns title, authors, publisher, and cover URLs', async () => {
    fetch.mockResolvedValue(mockResponse({
      'ISBN:9780134685991': {
        title: 'Effective Java',
        authors: [{ name: 'Joshua Bloch' }],
        publishers: [{ name: 'Addison-Wesley' }],
        publish_date: '2018',
        number_of_pages: 416,
        cover: {
          large: 'https://covers.openlibrary.org/b/isbn/9780134685991-L.jpg',
          medium: 'https://covers.openlibrary.org/b/isbn/9780134685991-M.jpg'
        }
      }
    }));
    const result = await metadata.fetchOpenLibrary('9780134685991');
    expect(result.title).toBe('Effective Java');
    expect(result.authors).toEqual(['Joshua Bloch']);
    expect(result.publisher).toBe('Addison-Wesley');
    expect(result.pages).toBe(416);
    expect(result.coverUrls.length).toBe(2);
  });

  test('returns null when ISBN not found', async () => {
    fetch.mockResolvedValue(mockResponse({}));
    expect(await metadata.fetchOpenLibrary('0000000000')).toBeNull();
  });

  test('returns empty coverUrls when no cover object', async () => {
    fetch.mockResolvedValue(mockResponse({
      'ISBN:1234567890': { title: 'No Cover Book', authors: [] }
    }));
    const result = await metadata.fetchOpenLibrary('1234567890');
    expect(result.coverUrls).toEqual([]);
  });
});

describe('fetchGoogleBooks', () => {
  test('returns metadata with HTTPS cover URL', async () => {
    fetch.mockResolvedValue(mockResponse({
      totalItems: 1,
      items: [{
        volumeInfo: {
          title: 'Clean Code',
          authors: ['Robert C. Martin'],
          publisher: 'Prentice Hall',
          publishedDate: '2008',
          pageCount: 464,
          description: 'A handbook of agile software craftsmanship',
          language: 'en',
          imageLinks: { thumbnail: 'http://books.google.com/thumbnail.jpg' }
        }
      }]
    }));
    const result = await metadata.fetchGoogleBooks('9780132350884');
    expect(result.title).toBe('Clean Code');
    expect(result.coverUrls[0]).toBe('https://books.google.com/thumbnail.jpg');
    expect(result.publisher).toBe('Prentice Hall');
    expect(result.description).toContain('agile');
  });

  test('returns null when no results', async () => {
    fetch.mockResolvedValue(mockResponse({ totalItems: 0 }));
    expect(await metadata.fetchGoogleBooks('0000000000')).toBeNull();
  });
});

describe('fetchDNB', () => {
  test('parses MARC21 XML response', async () => {
    const marcXml = `<?xml version="1.0"?>
    <searchRetrieveResponse>
      <records>
        <record>
          <recordData>
            <marc:record xmlns:marc="info:lc/xmlns/marcxchange-v1">
              <marc:datafield tag="245" ind1="1" ind2="0">
                <marc:subfield code="a">Sicherheit in der Automobiltechnik</marc:subfield>
                <marc:subfield code="b">Grundlagen und Praxis</marc:subfield>
              </marc:datafield>
              <marc:datafield tag="100" ind1="1" ind2=" ">
                <marc:subfield code="a">M\u00fcller, Hans</marc:subfield>
              </marc:datafield>
              <marc:datafield tag="700" ind1="1" ind2=" ">
                <marc:subfield code="a">Schmidt, Peter</marc:subfield>
              </marc:datafield>
              <marc:datafield tag="264" ind1=" " ind2="1">
                <marc:subfield code="b">Springer</marc:subfield>
                <marc:subfield code="c">2020</marc:subfield>
              </marc:datafield>
              <marc:datafield tag="300" ind1=" " ind2=" ">
                <marc:subfield code="a">350 Seiten</marc:subfield>
              </marc:datafield>
            </marc:record>
          </recordData>
        </record>
      </records>
    </searchRetrieveResponse>`;
    fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.reject('not json'),
      text: () => Promise.resolve(marcXml),
      headers: { get: () => null }
    });
    const result = await metadata.fetchDNB('9783658123456');
    expect(result.title).toBe('Sicherheit in der Automobiltechnik: Grundlagen und Praxis');
    expect(result.authors).toContain('M\u00fcller, Hans');
    expect(result.authors).toContain('Schmidt, Peter');
    expect(result.publisher).toBe('Springer');
    expect(result.pages).toBe(350);
  });

  test('cleans MARC control characters from DNB results', async () => {
    const marcXml = `<?xml version="1.0"?>
    <searchRetrieveResponse>
      <records>
        <record>
          <recordData>
            <marc:record xmlns:marc="info:lc/xmlns/marcxchange-v1">
              <marc:datafield tag="245" ind1="1" ind2="0">
                <marc:subfield code="a">&#152;Der&#156; neue Ninja</marc:subfield>
              </marc:datafield>
              <marc:datafield tag="100" ind1="1" ind2=" ">
                <marc:subfield code="a">Author Name</marc:subfield>
              </marc:datafield>
            </marc:record>
          </recordData>
        </record>
      </records>
    </searchRetrieveResponse>`;
    fetch.mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(marcXml),
      headers: { get: () => null }
    });
    const result = await metadata.fetchDNB('9783946097488');
    expect(result.title).toBe('Der neue Ninja');
    expect(result.title).not.toContain('&#');
  });

  test('returns null when no record found', async () => {
    fetch.mockResolvedValue({
      ok: true,
      text: () => Promise.resolve('<searchRetrieveResponse><numberOfRecords>0</numberOfRecords></searchRetrieveResponse>'),
      headers: { get: () => null }
    });
    expect(await metadata.fetchDNB('0000000000')).toBeNull();
  });

  test('returns null on network error', async () => {
    fetch.mockRejectedValue(new Error('timeout'));
    expect(await metadata.fetchDNB('1234567890')).toBeNull();
  });
});

describe('findCover', () => {
  test('returns first valid cover from API candidates', async () => {
    fetch.mockResolvedValueOnce(mockImageResponse());
    const result = await metadata.findCover('9780134685991', ['https://example.com/api-cover.jpg']);
    expect(result).toBe('https://example.com/api-cover.jpg');
  });

  test('falls back to OpenLibrary cover when API candidate fails', async () => {
    fetch.mockResolvedValueOnce(mockFailResponse()); // API candidate
    fetch.mockResolvedValueOnce(mockImageResponse()); // OL cover
    fetch.mockResolvedValueOnce(mockFailResponse()); // DNB
    const result = await metadata.findCover('9780134685991', ['https://bad.com/nope.jpg']);
    expect(result).toBe('https://covers.openlibrary.org/b/isbn/9780134685991-L.jpg');
  });

  test('falls back through all sources to Amazon', async () => {
    fetch.mockResolvedValueOnce(mockFailResponse()); // API
    fetch.mockResolvedValueOnce(mockFailResponse()); // OL
    fetch.mockResolvedValueOnce(mockFailResponse()); // DNB
    fetch.mockResolvedValueOnce(mockImageResponse()); // Amazon
    const result = await metadata.findCover('9780134685991', ['https://bad.com/fail.jpg']);
    expect(result).toBe('https://images-na.ssl-images-amazon.com/images/P/9780134685991.01._SCLZZZZZZZ_.jpg');
  });

  test('returns null when all sources fail', async () => {
    fetch.mockResolvedValue(mockFailResponse());
    expect(await metadata.findCover('0000000000', [])).toBeNull();
  });

  test('converts HTTP to HTTPS for API candidates', async () => {
    fetch.mockResolvedValueOnce(mockImageResponse());
    const result = await metadata.findCover('123', ['http://insecure.com/cover.jpg']);
    expect(result).toBe('https://insecure.com/cover.jpg');
    expect(fetch).toHaveBeenCalledWith('https://insecure.com/cover.jpg', expect.anything());
  });
});

describe('fetchByISBN', () => {
  test('strips non-ISBN characters', async () => {
    fetch.mockResolvedValue(mockResponse({}));
    await metadata.fetchByISBN('978-0-13-468599-1');
    const urls = fetch.mock.calls.map(c => c[0]);
    expect(urls.some(u => u.includes('9780134685991'))).toBe(true);
  });

  test('returns empty object for empty ISBN', async () => {
    expect(await metadata.fetchByISBN('')).toEqual({});
  });

  test('returns empty object for ISBN with only dashes', async () => {
    expect(await metadata.fetchByISBN('---')).toEqual({});
  });

  test('merges data from all three sources', async () => {
    fetch.mockImplementation((url) => {
      if (url.includes('openlibrary.org/api/books')) {
        return Promise.resolve(mockResponse({
          'ISBN:9780134685991': {
            title: 'Effective Java',
            authors: [{ name: 'Joshua Bloch' }],
            cover: { large: 'https://covers.openlibrary.org/large.jpg' }
          }
        }));
      }
      if (url.includes('googleapis.com')) {
        return Promise.resolve(mockResponse({
          totalItems: 1,
          items: [{
            volumeInfo: {
              title: 'Effective Java',
              authors: ['Joshua Bloch'],
              description: 'A definitive guide',
              language: 'en',
              imageLinks: { thumbnail: 'https://google.com/thumb.jpg' }
            }
          }]
        }));
      }
      if (url.includes('services.dnb.de')) {
        return Promise.resolve({
          ok: true,
          text: () => Promise.resolve('<searchRetrieveResponse><numberOfRecords>0</numberOfRecords></searchRetrieveResponse>'),
          headers: { get: () => null }
        });
      }
      // Cover probes — first valid
      if (url.includes('covers.openlibrary.org/large')) {
        return Promise.resolve(mockImageResponse());
      }
      return Promise.resolve(mockFailResponse());
    });

    const result = await metadata.fetchByISBN('978-0-13-468599-1');
    expect(result.title).toBe('Effective Java');
    expect(result.authors).toEqual(['Joshua Bloch']);
    expect(result.cover).toBeTruthy();
    expect(result.isbn).toBe('9780134685991');
  });

  test('uses DNB when OpenLibrary and Google fail', async () => {
    fetch.mockImplementation((url) => {
      if (url.includes('openlibrary.org')) return Promise.reject(new Error('timeout'));
      if (url.includes('googleapis.com')) return Promise.resolve(mockResponse({ totalItems: 0 }));
      if (url.includes('services.dnb.de')) {
        const xml = `<searchRetrieveResponse><records><record><recordData>
          <marc:record xmlns:marc="info:lc/xmlns/marcxchange-v1">
            <marc:datafield tag="245" ind1="1" ind2="0"><marc:subfield code="a">DNB Only Title</marc:subfield></marc:datafield>
            <marc:datafield tag="100" ind1="1" ind2=" "><marc:subfield code="a">DNB Author</marc:subfield></marc:datafield>
          </marc:record></recordData></record></records></searchRetrieveResponse>`;
        return Promise.resolve({ ok: true, text: () => Promise.resolve(xml), headers: { get: () => null } });
      }
      // Cover probes
      return Promise.resolve(mockFailResponse());
    });

    const result = await metadata.fetchByISBN('9783658123456');
    expect(result.title).toBe('DNB Only Title');
    expect(result.authors).toContain('DNB Author');
  });
});
