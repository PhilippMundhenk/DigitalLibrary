// lib/storage.js
// File-per-book storage: each book is a separate JSON file.
// Structure:
//   data/settings.json         — app settings
//   data/books/{id}.json       — one file per book (includes cover as base64)

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

const BASE_DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const SETTINGS_FILE = path.join(BASE_DATA_DIR, 'settings.json');
const BOOKS_DIR = path.join(BASE_DATA_DIR, 'books');

// In-memory cache — populated on first load
let booksCache = null;   // Map<id, book>
let settingsCache = null;
let writable = null; // null = unknown, true/false after check

const DEFAULT_SETTINGS = {
  autoFetchMetadata: true,
  warnDuplicateIsbn: true,
  customFields: []
};

async function ensureDataDirs() {
  await fs.mkdir(BASE_DATA_DIR, { recursive: true });
  await fs.mkdir(BOOKS_DIR, { recursive: true });
}

// --- Write permission check ---
async function checkWritable() {
  try {
    await ensureDataDirs();
    const testFile = path.join(BASE_DATA_DIR, '.write-test-' + crypto.randomBytes(4).toString('hex'));
    await fs.writeFile(testFile, 'test', 'utf8');
    await fs.unlink(testFile);
    writable = true;
    return true;
  } catch (e) {
    writable = false;
    return false;
  }
}

function isWritable() {
  return writable;
}

// --- Atomic file write (write to temp then rename) ---
async function atomicWrite(filePath, data) {
  const tmp = filePath + '.tmp.' + crypto.randomBytes(4).toString('hex');
  await fs.writeFile(tmp, data, 'utf8');
  await fs.rename(tmp, filePath);
}

// --- Settings ---
async function loadSettings() {
  if (settingsCache) return settingsCache;
  try {
    const raw = await fs.readFile(SETTINGS_FILE, 'utf8');
    settingsCache = { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch (e) {
    settingsCache = { ...DEFAULT_SETTINGS };
  }
  return settingsCache;
}

async function getSettings() {
  return { ...(await loadSettings()) };
}

async function updateSettings(patch) {
  const s = await loadSettings();
  Object.assign(s, patch);
  settingsCache = s;
  await ensureDataDirs();
  await atomicWrite(SETTINGS_FILE, JSON.stringify(s, null, 2));
  return { ...s };
}

// --- Books ---
async function loadBooks() {
  if (booksCache) return booksCache;
  booksCache = new Map();
  await ensureDataDirs();

  // Migrate from old single-file format if needed
  const oldDbFile = path.join(BASE_DATA_DIR, 'library.json');
  try {
    const raw = await fs.readFile(oldDbFile, 'utf8');
    const data = JSON.parse(raw);
    if (data && Array.isArray(data.books) && data.books.length > 0) {
      // Migrate settings
      if (data.settings) {
        settingsCache = { ...DEFAULT_SETTINGS, ...data.settings };
        await atomicWrite(SETTINGS_FILE, JSON.stringify(settingsCache, null, 2));
      }
      // Migrate books to individual files
      for (const book of data.books) {
        if (!book.id) continue;
        const bookFile = path.join(BOOKS_DIR, book.id + '.json');
        await atomicWrite(bookFile, JSON.stringify(book));
        booksCache.set(book.id, book);
      }
      // Rename old file to mark migration complete
      await fs.rename(oldDbFile, oldDbFile + '.migrated').catch(() => {});
      return booksCache;
    }
  } catch (e) {
    // No old DB file or parse error — proceed normally
  }

  // Load individual book files
  try {
    const files = await fs.readdir(BOOKS_DIR);
    for (const f of files) {
      if (!f.endsWith('.json')) continue;
      try {
        const raw = await fs.readFile(path.join(BOOKS_DIR, f), 'utf8');
        const book = JSON.parse(raw);
        if (book && book.id) {
          booksCache.set(book.id, book);
        }
      } catch (e) { /* skip corrupt files */ }
    }
  } catch (e) {
    // Empty books dir
  }
  return booksCache;
}

async function listBooks() {
  const cache = await loadBooks();
  return [...cache.values()].sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
}

async function readBook(id) {
  const cache = await loadBooks();
  return cache.get(id) || null;
}

async function saveBook(book) {
  const cache = await loadBooks();
  cache.set(book.id, book);
  await ensureDataDirs();
  await atomicWrite(path.join(BOOKS_DIR, book.id + '.json'), JSON.stringify(book));
  return book;
}

async function saveBooks(books) {
  const cache = await loadBooks();
  await ensureDataDirs();
  for (const book of books) {
    cache.set(book.id, book);
    await atomicWrite(path.join(BOOKS_DIR, book.id + '.json'), JSON.stringify(book));
  }
  return books;
}

async function deleteBook(id) {
  const cache = await loadBooks();
  if (!cache.has(id)) return false;
  cache.delete(id);
  try {
    await fs.unlink(path.join(BOOKS_DIR, id + '.json'));
  } catch (e) { /* file may not exist */ }
  return true;
}

async function deleteBooks(ids) {
  const cache = await loadBooks();
  let count = 0;
  for (const id of ids) {
    if (cache.has(id)) {
      cache.delete(id);
      try { await fs.unlink(path.join(BOOKS_DIR, id + '.json')); } catch (e) {}
      count++;
    }
  }
  return count;
}

async function clearAll() {
  booksCache = new Map();
  settingsCache = { ...DEFAULT_SETTINGS };
  await ensureDataDirs();
  await atomicWrite(SETTINGS_FILE, JSON.stringify(settingsCache, null, 2));
  // Remove all book files
  try {
    const files = await fs.readdir(BOOKS_DIR);
    for (const f of files) {
      if (f.endsWith('.json')) {
        await fs.unlink(path.join(BOOKS_DIR, f)).catch(() => {});
      }
    }
  } catch (e) {}
}

function resetCache() {
  booksCache = null;
  settingsCache = null;
  writable = null;
}

function getDataDir() {
  return BASE_DATA_DIR;
}

module.exports = {
  ensureDataDirs, listBooks, readBook, saveBook, saveBooks,
  deleteBook, deleteBooks, clearAll,
  getSettings, updateSettings, resetCache,
  checkWritable, isWritable, getDataDir
};
