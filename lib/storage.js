// lib/storage.js
// File-per-book storage with fast in-memory index.
//
// Structure:
//   data/settings.json         — app settings
//   data/books/{id}.json       — one file per book (includes cover as base64)
//   data/changelog.json        — change log entries
//
// The in-memory index holds all book metadata *without* covers.
// listBooks() returns index entries (fast), readBook() reads the full file.

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

const BASE_DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const SETTINGS_FILE = path.join(BASE_DATA_DIR, 'settings.json');
const BOOKS_DIR = path.join(BASE_DATA_DIR, 'books');
const CHANGELOG_FILE = path.join(BASE_DATA_DIR, 'changelog.json');

// In-memory state
let index = null;         // Map<id, bookWithoutCover>
let settingsCache = null;
let writable = null;

const DEFAULT_SETTINGS = {
  autoFetchMetadata: true,
  warnDuplicateIsbn: true,
  customFields: []
};

// --- Helpers ---

function stripCover(book) {
  if (!book) return book;
  const { cover, ...rest } = book;
  return rest;
}

async function ensureDataDirs() {
  await fs.mkdir(BASE_DATA_DIR, { recursive: true });
  await fs.mkdir(BOOKS_DIR, { recursive: true });
}

async function atomicWrite(filePath, data) {
  const tmp = filePath + '.tmp.' + crypto.randomBytes(4).toString('hex');
  await fs.writeFile(tmp, data, 'utf8');
  await fs.rename(tmp, filePath);
}

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

function isWritable() { return writable; }
function getDataDir() { return BASE_DATA_DIR; }

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

// --- Index ---

async function loadIndex() {
  if (index) return index;
  index = new Map();
  await ensureDataDirs();

  // Migrate from old single-file format
  const oldDbFile = path.join(BASE_DATA_DIR, 'library.json');
  try {
    const raw = await fs.readFile(oldDbFile, 'utf8');
    const data = JSON.parse(raw);
    if (data && Array.isArray(data.books) && data.books.length > 0) {
      if (data.settings) {
        settingsCache = { ...DEFAULT_SETTINGS, ...data.settings };
        await atomicWrite(SETTINGS_FILE, JSON.stringify(settingsCache, null, 2));
      }
      for (const book of data.books) {
        if (!book.id) continue;
        await atomicWrite(path.join(BOOKS_DIR, book.id + '.json'), JSON.stringify(book));
        index.set(book.id, stripCover(book));
      }
      await fs.rename(oldDbFile, oldDbFile + '.migrated').catch(() => {});
      return index;
    }
  } catch (e) { /* no old file */ }

  // Load index from individual book files (reads metadata only — skips cover for speed)
  try {
    const files = await fs.readdir(BOOKS_DIR);
    const jsonFiles = files.filter(f => f.endsWith('.json'));

    // Parallel read for speed (batches of 50)
    for (let i = 0; i < jsonFiles.length; i += 50) {
      const batch = jsonFiles.slice(i, i + 50);
      const results = await Promise.allSettled(
        batch.map(f => fs.readFile(path.join(BOOKS_DIR, f), 'utf8'))
      );
      for (const r of results) {
        if (r.status !== 'fulfilled') continue;
        try {
          const book = JSON.parse(r.value);
          if (book && book.id) {
            index.set(book.id, stripCover(book));
          }
        } catch (e) { /* skip corrupt */ }
      }
    }
  } catch (e) { /* empty dir */ }

  return index;
}

// --- Books ---

async function listBooks() {
  const idx = await loadIndex();
  return [...idx.values()].sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
}

async function readBook(id) {
  // Full read including cover
  const idx = await loadIndex();
  if (!idx.has(id)) return null;
  try {
    const raw = await fs.readFile(path.join(BOOKS_DIR, id + '.json'), 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

async function getBookCover(id) {
  try {
    const raw = await fs.readFile(path.join(BOOKS_DIR, id + '.json'), 'utf8');
    const book = JSON.parse(raw);
    return book.cover || null;
  } catch (e) {
    return null;
  }
}

async function saveBook(book) {
  const idx = await loadIndex();
  idx.set(book.id, stripCover(book));
  await ensureDataDirs();
  await atomicWrite(path.join(BOOKS_DIR, book.id + '.json'), JSON.stringify(book));
  return book;
}

async function saveBooks(books) {
  const idx = await loadIndex();
  await ensureDataDirs();
  // Write in parallel batches of 20
  for (let i = 0; i < books.length; i += 20) {
    const batch = books.slice(i, i + 20);
    await Promise.all(batch.map(book => {
      idx.set(book.id, stripCover(book));
      return atomicWrite(path.join(BOOKS_DIR, book.id + '.json'), JSON.stringify(book));
    }));
  }
  return books;
}

async function deleteBook(id) {
  const idx = await loadIndex();
  if (!idx.has(id)) return false;
  idx.delete(id);
  try { await fs.unlink(path.join(BOOKS_DIR, id + '.json')); } catch (e) {}
  return true;
}

async function deleteBooks(ids) {
  const idx = await loadIndex();
  let count = 0;
  for (const id of ids) {
    if (idx.has(id)) {
      idx.delete(id);
      try { await fs.unlink(path.join(BOOKS_DIR, id + '.json')); } catch (e) {}
      count++;
    }
  }
  return count;
}

async function clearAll() {
  index = new Map();
  settingsCache = { ...DEFAULT_SETTINGS };
  await ensureDataDirs();
  await atomicWrite(SETTINGS_FILE, JSON.stringify(settingsCache, null, 2));
  try {
    const files = await fs.readdir(BOOKS_DIR);
    await Promise.all(
      files.filter(f => f.endsWith('.json')).map(f =>
        fs.unlink(path.join(BOOKS_DIR, f)).catch(() => {})
      )
    );
  } catch (e) {}
  // Clear changelog too
  try { await fs.unlink(CHANGELOG_FILE); } catch (e) {}
}

// --- Changelog ---

async function appendChangelog(entries) {
  if (!Array.isArray(entries)) entries = [entries];
  let log = [];
  try {
    const raw = await fs.readFile(CHANGELOG_FILE, 'utf8');
    log = JSON.parse(raw);
    if (!Array.isArray(log)) log = [];
  } catch (e) { /* no file yet */ }
  log.push(...entries);
  // Keep last 10000 entries
  if (log.length > 10000) log = log.slice(log.length - 10000);
  await atomicWrite(CHANGELOG_FILE, JSON.stringify(log));
}

async function getChangelog(limit, offset) {
  limit = limit || 100;
  offset = offset || 0;
  try {
    const raw = await fs.readFile(CHANGELOG_FILE, 'utf8');
    const log = JSON.parse(raw);
    if (!Array.isArray(log)) return { total: 0, entries: [] };
    // Return newest first
    const reversed = log.slice().reverse();
    return {
      total: reversed.length,
      entries: reversed.slice(offset, offset + limit)
    };
  } catch (e) {
    return { total: 0, entries: [] };
  }
}

function resetCache() {
  index = null;
  settingsCache = null;
  writable = null;
}

module.exports = {
  ensureDataDirs, listBooks, readBook, saveBook, saveBooks,
  deleteBook, deleteBooks, clearAll,
  getSettings, updateSettings, resetCache,
  checkWritable, isWritable, getDataDir,
  getBookCover, appendChangelog, getChangelog
};
