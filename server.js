// server.js
const express = require('express');
const path = require('path');
const multer = require('multer');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { v4: uuidv4 } = require('uuid');
const storage = require('./lib/storage');
const metadata = require('./lib/metadata');

let csvParse;
try {
  csvParse = require('csv-parse/lib/sync');
} catch (err) {
  try {
    const mod = require('csv-parse/sync');
    csvParse = mod.parse || mod;
  } catch (err2) {
    csvParse = null;
  }
}

const app = express();
const PORT = process.env.PORT || 3000;

// --- Security middleware ---
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-eval'"], // unsafe-eval needed for zbar-wasm
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"]
    }
  },
  crossOriginEmbedderPolicy: false // allow loading external cover images
}));

app.use(cors({
  origin: process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',')
    : true, // allow all in dev; restrict in production via env var
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type']
}));

// Rate limiting
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => !!process.env.JEST_WORKER_ID // skip in tests
});
const metadataLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => !!process.env.JEST_WORKER_ID
});
app.use('/api/', apiLimiter);

// Body parsing — 5MB covers + book JSON is plenty; 50MB was excessive
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// No-cache for API responses
app.use('/api/', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

// --- Input sanitisation helpers ---
const BOOK_FIELDS = ['title', 'authors', 'isbn', 'location', 'cover', 'notes',
  'publisher', 'publishDate', 'pages', 'description', 'language'];

function sanitizeBookPayload(raw, customFields) {
  if (!raw || typeof raw !== 'object') return {};
  const out = {};
  const allowed = new Set([...BOOK_FIELDS, ...(customFields || []).map(f => f.name)]);
  for (const key of Object.keys(raw)) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
    if (!allowed.has(key)) continue;
    const val = raw[key];
    if (val === null || val === undefined) continue;
    if (key === 'authors') {
      if (Array.isArray(val)) {
        out.authors = val.filter(a => a != null).map(a => String(a).trim().slice(0, 200)).filter(Boolean);
      } else if (typeof val === 'string') {
        out.authors = val.split(/[,;]/).map(a => a.trim().slice(0, 200)).filter(Boolean);
      } else {
        out.authors = [];
      }
    } else if (key === 'pages') {
      const n = parseInt(val, 10);
      if (!isNaN(n) && n > 0 && n < 100000) out.pages = n;
    } else if (key === 'cover') {
      if (typeof val === 'string' && val.length <= 3_000_000) out.cover = val;
    } else {
      // Accept strings and coerce numbers/booleans to string
      const str = typeof val === 'string' ? val
        : (typeof val === 'number' || typeof val === 'boolean') ? String(val)
        : null;
      if (str !== null) out[key] = str.slice(0, 5000);
    }
  }
  return out;
}

function sanitizeSettingsPatch(raw) {
  if (!raw || typeof raw !== 'object') return {};
  const out = {};
  if (typeof raw.autoFetchMetadata === 'boolean') out.autoFetchMetadata = raw.autoFetchMetadata;
  if (typeof raw.warnDuplicateIsbn === 'boolean') out.warnDuplicateIsbn = raw.warnDuplicateIsbn;
  if (Array.isArray(raw.customFields)) {
    out.customFields = raw.customFields
      .filter(f => f && typeof f.name === 'string' && typeof f.label === 'string')
      .slice(0, 50) // max 50 custom fields
      .map(f => ({
        name: f.name.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 30),
        label: f.label.slice(0, 50)
      }))
      .filter(f => f.name.length > 0);
  }
  return out;
}

// File upload with restrictions
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB max per file
});

const coverUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max for covers
  fileFilter: (req, file, cb) => {
    const allowedMimes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedMimes.includes(file.mimetype)) {
      return cb(new Error('Invalid image type. Allowed: JPEG, PNG, GIF, WebP'));
    }
    cb(null, true);
  }
});

// --- Health / storage check ---
app.get('/api/health', async (req, res) => {
  const ok = await storage.checkWritable();
  res.json({ ok, writable: ok, dataDir: storage.getDataDir() });
});

// --- Settings ---
app.get('/api/settings', async (req, res) => {
  try {
    res.json(await storage.getSettings());
  } catch (err) {
    console.error('GET /api/settings error:', err);
    res.status(500).json({ error: 'Failed to load settings' });
  }
});

app.put('/api/settings', async (req, res) => {
  try {
    const patch = sanitizeSettingsPatch(req.body);
    res.json(await storage.updateSettings(patch));
  } catch (err) {
    console.error('PUT /api/settings error:', err);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

// --- Books ---
app.get('/api/books', async (req, res) => {
  try {
    const { q, field } = req.query;
    let items = await storage.listBooks();
    if (q) {
      const ql = String(q).toLowerCase().slice(0, 200);
      const searchField = typeof field === 'string' ? field : null;
      items = items.filter(b => {
        if (searchField && b[searchField]) return String(b[searchField]).toLowerCase().includes(ql);
        return (
          (b.title && b.title.toLowerCase().includes(ql)) ||
          (b.authors && b.authors.join(' ').toLowerCase().includes(ql)) ||
          (b.isbn && b.isbn.toLowerCase().includes(ql)) ||
          (b.location && b.location.toLowerCase().includes(ql)) ||
          (b.notes && b.notes.toLowerCase().includes(ql))
        );
      });
    }
    res.json(items);
  } catch (err) {
    console.error('GET /api/books error:', err);
    res.status(500).json({ error: 'Failed to list books' });
  }
});

app.get('/api/locations', async (req, res) => {
  try {
    const items = await storage.listBooks();
    const locs = [...new Set(items.map(b => b.location).filter(Boolean))].sort();
    res.json(locs);
  } catch (err) {
    console.error('GET /api/locations error:', err);
    res.status(500).json({ error: 'Failed to list locations' });
  }
});

// --- Bulk operations (must be before :id routes) ---
app.post('/api/books/bulk-delete', async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids)) return res.status(400).json({ error: 'ids array required' });
    const safeIds = ids.filter(id => typeof id === 'string').slice(0, 1000);
    const deleted = await storage.deleteBooks(safeIds);
    res.json({ deleted });
  } catch (err) {
    console.error('POST /api/books/bulk-delete error:', err);
    res.status(500).json({ error: 'Failed to delete books' });
  }
});

app.put('/api/books/bulk-update', async (req, res) => {
  try {
    const { ids, update } = req.body;
    if (!Array.isArray(ids) || !update) return res.status(400).json({ error: 'ids and update required' });
    const safeIds = ids.filter(id => typeof id === 'string').slice(0, 1000);
    const settings = await storage.getSettings();
    const safeUpdate = sanitizeBookPayload(update, settings.customFields);
    const books = [];
    for (const id of safeIds) {
      const existing = await storage.readBook(id);
      if (existing) {
        const updated = { ...existing, ...safeUpdate, updated_at: new Date().toISOString() };
        books.push(updated);
      }
    }
    await storage.saveBooks(books);
    res.json({ updated: books.length });
  } catch (err) {
    console.error('PUT /api/books/bulk-update error:', err);
    res.status(500).json({ error: 'Failed to update books' });
  }
});

app.get('/api/books/by-isbn/:isbn', async (req, res) => {
  try {
    const isbn = String(req.params.isbn).replace(/[^0-9Xx]/g, '');
    if (!isbn) return res.json([]);
    const items = await storage.listBooks();
    const matches = items.filter(b => b.isbn && b.isbn.replace(/[^0-9Xx]/g, '') === isbn);
    res.json(matches.map(b => ({ id: b.id, title: b.title, isbn: b.isbn, authors: b.authors })));
  } catch (err) {
    console.error('GET /api/books/by-isbn error:', err);
    res.status(500).json({ error: 'Failed to check ISBN' });
  }
});

app.get('/api/books/:id', async (req, res) => {
  try {
    const book = await storage.readBook(req.params.id);
    if (!book) return res.status(404).json({ error: 'Not found' });
    res.json(book);
  } catch (err) {
    console.error('GET /api/books/:id error:', err);
    res.status(500).json({ error: 'Failed to get book' });
  }
});

app.post('/api/books', async (req, res) => {
  try {
    const settings = await storage.getSettings();
    const payload = sanitizeBookPayload(req.body, settings.customFields);
    if (payload.isbn && (!payload.title || !(payload.authors && payload.authors.length))) {
      try {
        const meta = await metadata.fetchByISBN(String(payload.isbn), { downloadCover: !payload.cover });
        const safeMeta = sanitizeBookPayload(meta, settings.customFields);
        for (const k of Object.keys(safeMeta)) {
          if (payload[k] === undefined || payload[k] === '' || (Array.isArray(payload[k]) && payload[k].length === 0)) {
            payload[k] = safeMeta[k];
          }
        }
      } catch (e) { /* continue without metadata */ }
    }
    const id = uuidv4();
    const now = new Date().toISOString();
    const book = { id, created_at: now, updated_at: now, ...payload };
    await storage.saveBook(book);
    res.status(201).json(book);
  } catch (err) {
    console.error('POST /api/books error:', err);
    res.status(500).json({ error: 'Failed to create book' });
  }
});

app.put('/api/books/:id', async (req, res) => {
  try {
    const existing = await storage.readBook(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Not found' });
    const settings = await storage.getSettings();
    const safeBody = sanitizeBookPayload(req.body, settings.customFields);
    const updated = { ...existing, ...safeBody, updated_at: new Date().toISOString() };
    await storage.saveBook(updated);
    res.json(updated);
  } catch (err) {
    console.error('PUT /api/books/:id error:', err);
    res.status(500).json({ error: 'Failed to update book' });
  }
});

app.delete('/api/books/:id', async (req, res) => {
  try {
    const ok = await storage.deleteBook(req.params.id);
    res.json({ ok });
  } catch (err) {
    console.error('DELETE /api/books/:id error:', err);
    res.status(500).json({ error: 'Failed to delete book' });
  }
});

// --- Metadata fetch endpoint ---
app.get('/api/metadata/:isbn', metadataLimiter, async (req, res) => {
  try {
    const isbn = String(req.params.isbn).replace(/[^0-9Xx\-\s]/g, '').slice(0, 20);
    if (!isbn) return res.status(400).json({ error: 'Invalid ISBN' });
    const meta = await metadata.fetchByISBN(isbn, { downloadCover: true });
    res.json(meta);
  } catch (err) {
    console.error('GET /api/metadata/:isbn error:', err);
    res.status(500).json({ error: 'Failed to fetch metadata' });
  }
});

// --- Import ---
app.post('/api/import', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'file required' });
    const content = req.file.buffer.toString('utf8');
    let entries = [];
    const fn = req.file.originalname || '';
    if (fn.endsWith('.json') || content.trim().startsWith('[')) {
      const parsed = JSON.parse(content);
      if (!Array.isArray(parsed)) return res.status(400).json({ error: 'JSON must be an array' });
      entries = parsed;
    } else if (fn.endsWith('.txt')) {
      const lines = content.trim().split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      entries = lines.map(isbn => ({ isbn }));
    } else {
      if (!csvParse) return res.status(500).json({ error: 'CSV parsing not available' });
      const records = csvParse(content, { columns: true, skip_empty_lines: true });
      entries = records;
    }
    // Limit import size
    if (entries.length > 10000) {
      return res.status(400).json({ error: 'Import limited to 10,000 entries' });
    }
    const settings = await storage.getSettings();
    const results = [];
    for (const e of entries) {
      try {
        const payload = sanitizeBookPayload(e, settings.customFields);
        const id = uuidv4();
        const now = new Date().toISOString();
        results.push({ id, created_at: now, updated_at: now, ...payload });
      } catch (entryErr) {
        console.error('Import entry error:', entryErr);
        // Skip bad entries instead of failing the whole import
      }
    }
    if (results.length === 0) {
      return res.status(400).json({ error: 'No valid entries to import' });
    }
    await storage.saveBooks(results);
    res.json({ imported: results.length, books: results });
  } catch (err) {
    console.error('POST /api/import error:', err);
    res.status(500).json({ error: 'Import failed' });
  }
});

// --- Cover upload ---
app.post('/api/upload-cover', coverUpload.single('cover'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'cover file required' });
    // Strip charset etc from MIME type
    const ct = (req.file.mimetype || 'image/jpeg').split(';')[0].trim();
    const b64 = req.file.buffer.toString('base64');
    res.json({ cover: `data:${ct};base64,${b64}` });
  } catch (err) {
    console.error('POST /api/upload-cover error:', err);
    res.status(500).json({ error: 'Cover upload failed' });
  }
});

// Multer error handler
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File too large' });
    }
    return res.status(400).json({ error: err.message });
  }
  if (err && err.message && err.message.includes('Invalid image type')) {
    return res.status(400).json({ error: err.message });
  }
  next(err);
});

// --- Clear library ---
app.post('/api/clear', async (req, res) => {
  try {
    await storage.clearAll();
    res.json({ ok: true });
  } catch (err) {
    console.error('POST /api/clear error:', err);
    res.status(500).json({ error: 'Failed to clear library' });
  }
});

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

async function start() {
  try {
    await storage.ensureDataDirs();
    const ok = await storage.checkWritable();
    if (!ok) {
      console.error('WARNING: Data directory is not writable! Data will NOT persist. Check permissions on:', storage.getDataDir());
    } else {
      // Ensure settings file exists on first run
      await storage.getSettings();
    }
  } catch (err) {
    console.error('Storage init error:', err);
  }
  return new Promise((resolve) => {
    const server = app.listen(PORT, () => {
      if (!process.env.JEST_WORKER_ID) {
        console.log(`Digital Library listening on http://0.0.0.0:${PORT}`);
        console.log(`Data directory: ${storage.getDataDir()}`);
      }
      resolve(server);
    });
  });
}

if (require.main === module) {
  start();
}

module.exports = { app, start };
