const fs = require('fs').promises;
const os = require('os');
const path = require('path');

describe('storage module (per-file format)', () => {
  let DATA_DIR;
  let storage;

  beforeAll(async () => {
    DATA_DIR = await fs.mkdtemp(path.join(os.tmpdir(), 'dl-data-'));
    process.env.DATA_DIR = DATA_DIR;
    jest.resetModules();
    storage = require('../../lib/storage');
    await storage.ensureDataDirs();
  });

  afterAll(async () => {
    await fs.rm(DATA_DIR, { recursive: true, force: true });
  });

  beforeEach(() => {
    storage.resetCache();
  });

  test('save and read book', async () => {
    const book = { id: 'test-1', title: 'Test Book', authors: ['A B'], isbn: '12345' };
    await storage.saveBook(book);
    const read = await storage.readBook('test-1');
    expect(read).toBeTruthy();
    expect(read.title).toBe('Test Book');
  });

  test('listBooks returns saved books', async () => {
    const book = { id: 'test-2', title: 'Another', created_at: new Date().toISOString() };
    await storage.saveBook(book);
    const list = await storage.listBooks();
    expect(Array.isArray(list)).toBe(true);
    expect(list.find(b => b.id === 'test-2')).toBeTruthy();
  });

  test('deleteBook removes book', async () => {
    const book = { id: 'to-delete', title: 'To delete' };
    await storage.saveBook(book);
    const ok = await storage.deleteBook('to-delete');
    expect(ok).toBe(true);
    const r = await storage.readBook('to-delete');
    expect(r).toBeNull();
  });

  test('saveBooks batch save', async () => {
    const books = [
      { id: 'batch-1', title: 'Batch One' },
      { id: 'batch-2', title: 'Batch Two' }
    ];
    await storage.saveBooks(books);
    const list = await storage.listBooks();
    expect(list.find(b => b.id === 'batch-1')).toBeTruthy();
    expect(list.find(b => b.id === 'batch-2')).toBeTruthy();
  });

  test('deleteBooks removes multiple', async () => {
    await storage.saveBooks([
      { id: 'del-1', title: 'D1' },
      { id: 'del-2', title: 'D2' },
      { id: 'del-3', title: 'D3' }
    ]);
    const count = await storage.deleteBooks(['del-1', 'del-3']);
    expect(count).toBe(2);
    expect(await storage.readBook('del-1')).toBeNull();
    expect(await storage.readBook('del-2')).toBeTruthy();
    expect(await storage.readBook('del-3')).toBeNull();
  });

  test('settings CRUD', async () => {
    const s = await storage.getSettings();
    expect(s.autoFetchMetadata).toBe(true);
    await storage.updateSettings({ autoFetchMetadata: false });
    const s2 = await storage.getSettings();
    expect(s2.autoFetchMetadata).toBe(false);
  });

  test('clearAll removes everything', async () => {
    await storage.saveBook({ id: 'clear-1', title: 'C1' });
    await storage.clearAll();
    const list = await storage.listBooks();
    expect(list.length).toBe(0);
  });

  test('book persists as individual file', async () => {
    await storage.saveBook({ id: 'persist-1', title: 'Persist' });
    const bookFile = path.join(DATA_DIR, 'books', 'persist-1.json');
    const raw = await fs.readFile(bookFile, 'utf8');
    const data = JSON.parse(raw);
    expect(data.title).toBe('Persist');
    expect(data.id).toBe('persist-1');
  });

  test('settings persist in settings.json', async () => {
    await storage.updateSettings({ autoFetchMetadata: false });
    const settingsFile = path.join(DATA_DIR, 'settings.json');
    const raw = await fs.readFile(settingsFile, 'utf8');
    const data = JSON.parse(raw);
    expect(data.autoFetchMetadata).toBe(false);
  });

  test('settings include customFields', async () => {
    await storage.updateSettings({
      customFields: [{ name: 'genre', label: 'Genre' }]
    });
    const s = await storage.getSettings();
    expect(s.customFields).toEqual([{ name: 'genre', label: 'Genre' }]);
  });

  test('settings include warnDuplicateIsbn default', async () => {
    storage.resetCache();
    const s = await storage.getSettings();
    expect(s.warnDuplicateIsbn).toBe(true);
  });

  test('saveBook updates existing book', async () => {
    await storage.saveBook({ id: 'update-1', title: 'Before' });
    await storage.saveBook({ id: 'update-1', title: 'After' });
    const book = await storage.readBook('update-1');
    expect(book.title).toBe('After');
    const list = await storage.listBooks();
    const matches = list.filter(b => b.id === 'update-1');
    expect(matches.length).toBe(1);
  });

  test('listBooks sorts by created_at descending', async () => {
    await storage.clearAll();
    await storage.saveBook({ id: 'sort-1', title: 'Old', created_at: '2020-01-01T00:00:00Z' });
    await storage.saveBook({ id: 'sort-2', title: 'New', created_at: '2025-01-01T00:00:00Z' });
    const list = await storage.listBooks();
    expect(list[0].id).toBe('sort-2');
    expect(list[1].id).toBe('sort-1');
  });

  test('readBook returns null for missing id', async () => {
    const book = await storage.readBook('nonexistent-id-xyz');
    expect(book).toBeNull();
  });

  test('deleteBook returns false for missing id', async () => {
    const result = await storage.deleteBook('nonexistent-id-xyz');
    expect(result).toBe(false);
  });

  test('deleteBooks returns 0 for empty ids', async () => {
    const result = await storage.deleteBooks([]);
    expect(result).toBe(0);
  });

  test('resetCache forces reload from disk', async () => {
    await storage.saveBook({ id: 'cache-1', title: 'Cached' });
    storage.resetCache();
    const book = await storage.readBook('cache-1');
    expect(book).toBeTruthy();
    expect(book.title).toBe('Cached');
  });

  test('checkWritable returns true for writable dir', async () => {
    const ok = await storage.checkWritable();
    expect(ok).toBe(true);
    expect(storage.isWritable()).toBe(true);
  });

  test('deleteBook removes file from disk', async () => {
    await storage.saveBook({ id: 'file-del', title: 'FileDel' });
    const bookFile = path.join(DATA_DIR, 'books', 'file-del.json');
    // File should exist
    await expect(fs.access(bookFile)).resolves.toBeUndefined();
    await storage.deleteBook('file-del');
    // File should be gone
    await expect(fs.access(bookFile)).rejects.toThrow();
  });

  test('clearAll removes all book files from disk', async () => {
    await storage.saveBooks([
      { id: 'ca-1', title: 'CA1' },
      { id: 'ca-2', title: 'CA2' }
    ]);
    await storage.clearAll();
    const files = await fs.readdir(path.join(DATA_DIR, 'books'));
    const jsonFiles = files.filter(f => f.endsWith('.json'));
    expect(jsonFiles.length).toBe(0);
  });

  test('migrate from old single-file format', async () => {
    // Create an old-format library.json
    storage.resetCache();
    const oldDb = {
      settings: { autoFetchMetadata: false, customFields: [] },
      books: [
        { id: 'migrated-1', title: 'Migrated Book', isbn: '1234567890' },
        { id: 'migrated-2', title: 'Another Migrated' }
      ]
    };
    await fs.writeFile(path.join(DATA_DIR, 'library.json'), JSON.stringify(oldDb), 'utf8');
    // Clear books dir
    const booksDir = path.join(DATA_DIR, 'books');
    const existingFiles = await fs.readdir(booksDir).catch(() => []);
    for (const f of existingFiles) {
      if (f.endsWith('.json')) await fs.unlink(path.join(booksDir, f));
    }
    storage.resetCache();

    // Load should trigger migration
    const list = await storage.listBooks();
    expect(list.length).toBe(2);
    expect(list.find(b => b.id === 'migrated-1')).toBeTruthy();

    // Old file should be renamed
    const migratedExists = await fs.access(path.join(DATA_DIR, 'library.json.migrated'))
      .then(() => true).catch(() => false);
    expect(migratedExists).toBe(true);

    // Individual book files should exist
    const bookFile = path.join(booksDir, 'migrated-1.json');
    const raw = JSON.parse(await fs.readFile(bookFile, 'utf8'));
    expect(raw.title).toBe('Migrated Book');

    // Settings should be migrated
    const s = await storage.getSettings();
    expect(s.autoFetchMetadata).toBe(false);

    // Cleanup
    await fs.unlink(path.join(DATA_DIR, 'library.json.migrated')).catch(() => {});
  });

  test('handles book with large cover data', async () => {
    const largeCover = 'data:image/jpeg;base64,' + 'A'.repeat(100000);
    await storage.saveBook({ id: 'large-cover', title: 'Large', cover: largeCover });
    storage.resetCache();
    const book = await storage.readBook('large-cover');
    expect(book.cover).toBe(largeCover);
  });

  test('concurrent saves do not corrupt data', async () => {
    await storage.clearAll();
    const promises = [];
    for (let i = 0; i < 10; i++) {
      promises.push(storage.saveBook({ id: `concurrent-${i}`, title: `Book ${i}` }));
    }
    await Promise.all(promises);
    const list = await storage.listBooks();
    expect(list.length).toBe(10);
  });
});
