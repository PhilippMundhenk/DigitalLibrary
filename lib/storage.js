// lib/storage.js
// Uses DATA_DIR env variable if set so tests can point to a temp directory.

const fs = require('fs').promises;
const path = require('path');

const BASE_DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const BOOKS_DIR = path.join(BASE_DATA_DIR, 'books');

async function ensureDataDirs() {
  await fs.mkdir(BOOKS_DIR, { recursive: true });
}

async function listBooks() {
  await ensureDataDirs();
  const files = await fs.readdir(BOOKS_DIR);
  const books = [];
  for (const f of files) {
    if (!f.endsWith('.json')) continue;
    try {
      const raw = await fs.readFile(path.join(BOOKS_DIR, f), 'utf8');
      books.push(JSON.parse(raw));
    } catch (e) {
      console.warn('Skip invalid file', f, e.message);
    }
  }
  // sort by created_at desc
  books.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
  return books;
}

async function readBook(id) {
  const file = path.join(BOOKS_DIR, `${id}.json`);
  try {
    const raw = await fs.readFile(file, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

async function saveBook(book) {
  await ensureDataDirs();
  const id = book.id || book._id;
  if (!id) throw new Error('book.id required');
  const file = path.join(BOOKS_DIR, `${id}.json`);
  await fs.writeFile(file, JSON.stringify(book, null, 2), 'utf8');
  return book;
}

async function deleteBook(id) {
  const file = path.join(BOOKS_DIR, `${id}.json`);
  try {
    await fs.unlink(file);
    return true;
  } catch (e) {
    return false;
  }
}

module.exports = { ensureDataDirs, listBooks, readBook, saveBook, deleteBook };