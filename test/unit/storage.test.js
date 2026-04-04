const fs = require('fs').promises;
const os = require('os');
const path = require('path');

describe('storage module', () => {
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

  test('data persists in single JSON file', async () => {
    await storage.saveBook({ id: 'persist-1', title: 'Persist' });
    // Check file exists
    const dbPath = path.join(DATA_DIR, 'library.json');
    const raw = await fs.readFile(dbPath, 'utf8');
    const data = JSON.parse(raw);
    expect(data.books).toBeDefined();
    expect(data.settings).toBeDefined();
    expect(data.books.find(b => b.id === 'persist-1')).toBeTruthy();
  });

  test('settings include customFields', async () => {
    await storage.updateSettings({
      customFields: [{ name: 'genre', label: 'Genre' }]
    });
    const s = await storage.getSettings();
    expect(s.customFields).toEqual([{ name: 'genre', label: 'Genre' }]);
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
    // After reset, data should reload from file
    const book = await storage.readBook('cache-1');
    expect(book).toBeTruthy();
    expect(book.title).toBe('Cached');
  });
});
