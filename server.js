// server.js
// Exports the express app for testing. Starts server when run directly.

const express = require('express');
const path = require('path');
const multer = require('multer');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const storage = require('./lib/storage');
const metadata = require('./lib/metadata');
const csvParse = require('csv-parse/lib/sync');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static frontend
app.use(express.static(path.join(__dirname, 'public')));

// API: list books
app.get('/api/books', async (req, res) => {
  try {
    const { q, field } = req.query;
    const items = await storage.listBooks();
    let filtered = items;
    if (q) {
      const ql = q.toLowerCase();
      filtered = items.filter(b => {
        if (field && b[field]) {
          return String(b[field]).toLowerCase().includes(ql);
        }
        // search across key fields
        return (
          (b.title && b.title.toLowerCase().includes(ql)) ||
          (b.authors && b.authors.join(' ').toLowerCase().includes(ql)) ||
          (b.isbn && b.isbn.toLowerCase().includes(ql)) ||
          (b.location && b.location.toLowerCase().includes(ql)) ||
          (b.notes && b.notes.toLowerCase().includes(ql))
        );
      });
    }
    res.json(filtered);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// API: get book
app.get('/api/books/:id', async (req, res) => {
  try {
    const book = await storage.readBook(req.params.id);
    if (!book) return res.status(404).json({ error: 'Not found' });
    res.json(book);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: create book
app.post('/api/books', async (req, res) => {
  try {
    const payload = req.body || {};
    // If ISBN provided, try to enrich
    if (payload.isbn && (!payload.title || !payload.authors || payload.cover === undefined)) {
      const meta = await metadata.fetchByISBN(String(payload.isbn));
      // prefer payload values if present
      const merged = Object.assign({}, meta, payload);
      Object.assign(payload, merged);
    }
    const id = uuidv4();
    const now = new Date().toISOString();
    const book = Object.assign({ id, created_at: now, updated_at: now }, payload);
    await storage.saveBook(book);
    res.status(201).json(book);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: update book
app.put('/api/books/:id', async (req, res) => {
  try {
    const existing = await storage.readBook(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Not found' });
    const updated = Object.assign({}, existing, req.body, { updated_at: new Date().toISOString() });
    await storage.saveBook(updated);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: delete
app.delete('/api/books/:id', async (req, res) => {
  try {
    const ok = await storage.deleteBook(req.params.id);
    res.json({ ok });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Import endpoint
const upload = multer({ storage: multer.memoryStorage() });
app.post('/api/import', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'file required' });
    const content = req.file.buffer.toString('utf8');
    let entries = [];
    const fn = req.file.originalname || '';
    if (fn.endsWith('.json') || content.trim().startsWith('[')) {
      entries = JSON.parse(content);
    } else {
      // parse CSV
      const records = csvParse(content, { columns: true, skip_empty_lines: true });
      entries = records;
    }
    const results = [];
    for (const e of entries) {
      const payload = Object.assign({}, e);
      if (payload.isbn) {
        // try enrich
        const meta = await metadata.fetchByISBN(String(payload.isbn));
        Object.assign(payload, meta, payload);
      }
      const id = uuidv4();
      const now = new Date().toISOString();
      const book = Object.assign({ id, created_at: now, updated_at: now }, payload);
      await storage.saveBook(book);
      results.push(book);
    }
    res.json({ imported: results.length, books: results });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Fallback to index for SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

async function start() {
  await storage.ensureDataDirs();
  const server = app.listen(PORT, () => {
    console.log(`Digital Library listening on http://0.0.0.0:${PORT}`);
  });
  return server;
}

// If run directly, start server
if (require.main === module) {
  start();
}

// Export for tests
module.exports = { app, start };