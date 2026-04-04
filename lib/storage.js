// lib/storage.js
// Single JSON file storage for books, settings, and cover images (base64).
// File structure: { settings: {...}, books: [...] }
// Each book can have a `coverData` field with base64-encoded image data.

const fs = require('fs').promises;
const path = require('path');

const BASE_DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const DB_FILE = path.join(BASE_DATA_DIR, 'library.json');

// In-memory cache — loaded once, written on every mutation
let db = null;

const DEFAULT_SETTINGS = {
  autoFetchMetadata: true,
  customFields: []  // Array of { name: string, label: string }
};

function defaultDb() {
  return { settings: { ...DEFAULT_SETTINGS }, books: [] };
}

async function ensureDataDirs() {
  await fs.mkdir(BASE_DATA_DIR, { recursive: true });
}

async function load() {
  if (db) return db;
  try {
    await ensureDataDirs();
    const raw = await fs.readFile(DB_FILE, 'utf8');
    db = JSON.parse(raw);
    if (!db.settings) db.settings = { ...DEFAULT_SETTINGS };
    if (!Array.isArray(db.books)) db.books = [];
  } catch (e) {
    db = defaultDb();
    // Migrate from old per-file storage if books dir exists
    await migrateFromFiles();
  }
  return db;
}

async function migrateFromFiles() {
  const booksDir = path.join(BASE_DATA_DIR, 'books');
  try {
    const files = await fs.readdir(booksDir);
    for (const f of files) {
      if (!f.endsWith('.json')) continue;
      try {
        const raw = await fs.readFile(path.join(booksDir, f), 'utf8');
        db.books.push(JSON.parse(raw));
      } catch (e) { /* skip */ }
    }
    if (db.books.length > 0) {
      await save();
    }
  } catch (e) {
    // No old books dir — fresh start
  }
}

async function save() {
  await ensureDataDirs();
  await fs.writeFile(DB_FILE, JSON.stringify(db, null, 2), 'utf8');
}

async function getSettings() {
  const d = await load();
  return { ...DEFAULT_SETTINGS, ...d.settings };
}

async function updateSettings(patch) {
  const d = await load();
  Object.assign(d.settings, patch);
  await save();
  return d.settings;
}

async function listBooks() {
  const d = await load();
  // Return copy sorted by created_at desc
  return [...d.books].sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
}

async function readBook(id) {
  const d = await load();
  return d.books.find(b => b.id === id) || null;
}

async function saveBook(book) {
  const d = await load();
  const idx = d.books.findIndex(b => b.id === book.id);
  if (idx >= 0) {
    d.books[idx] = book;
  } else {
    d.books.push(book);
  }
  await save();
  return book;
}

async function saveBooks(books) {
  const d = await load();
  for (const book of books) {
    const idx = d.books.findIndex(b => b.id === book.id);
    if (idx >= 0) {
      d.books[idx] = book;
    } else {
      d.books.push(book);
    }
  }
  await save();
  return books;
}

async function deleteBook(id) {
  const d = await load();
  const idx = d.books.findIndex(b => b.id === id);
  if (idx < 0) return false;
  d.books.splice(idx, 1);
  await save();
  return true;
}

async function deleteBooks(ids) {
  const d = await load();
  const idSet = new Set(ids);
  const before = d.books.length;
  d.books = d.books.filter(b => !idSet.has(b.id));
  await save();
  return before - d.books.length;
}

async function clearAll() {
  db = defaultDb();
  await save();
}

// Reset the in-memory cache (for tests)
function resetCache() {
  db = null;
}

module.exports = {
  ensureDataDirs, listBooks, readBook, saveBook, saveBooks,
  deleteBook, deleteBooks, clearAll,
  getSettings, updateSettings, resetCache
};
