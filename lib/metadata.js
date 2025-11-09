const fetch = require('node-fetch');

async function fetchByISBN(isbn) {
  isbn = isbn.replace(/[^0-9Xx]/g, '');
  if (!isbn) return {};
  // Try OpenLibrary
  try {
    const olUrl = `https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&format=json&jscmd=data`;
    const r = await fetch(olUrl, { timeout: 5000 });
    const data = await r.json();
    const key = `ISBN:${isbn}`;
    if (data && data[key]) {
      const item = data[key];
      const title = item.title;
      const authors = (item.authors || []).map(a => a.name);
      const cover = (item.cover && (item.cover.large || item.cover.medium || item.cover.small)) ||
        `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg`;
      return { title, authors, isbn, cover };
    }
  } catch (e) {
    // continue to Google Books
  }

  // Fallback: Google Books
  try {
    const gb = `https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}`;
    const r2 = await fetch(gb, { timeout: 5000 });
    const j2 = await r2.json();
    if (j2.totalItems > 0 && j2.items && j2.items.length > 0) {
      const v = j2.items[0].volumeInfo;
      const title = v.title;
      const authors = v.authors || [];
      const cover = (v.imageLinks && (v.imageLinks.thumbnail || v.imageLinks.smallThumbnail)) ||
        `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg`;
      return { title, authors, isbn, cover };
    }
  } catch (e) {
    // give up
  }

  return {};
}

module.exports = { fetchByISBN };