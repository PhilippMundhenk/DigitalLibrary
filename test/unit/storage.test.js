const fs = require('fs').promises;
const os = require('os');
const path = require('path');

describe('storage module', () => {
  let DATA_DIR;
  let storage;

  beforeAll(async () => {
    DATA_DIR = await fs.mkdtemp(path.join(os.tmpdir(), 'dl-data-'));
    process.env.DATA_DIR = DATA_DIR;
    // require fresh module with new env
    jest.resetModules();
    storage = require('../../lib/storage');
    await storage.ensureDataDirs();
  });

  afterAll(async () => {
    // cleanup
    await fs.rm(DATA_DIR, { recursive: true, force: true });
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

  test('deleteBook removes file', async () => {
    const book = { id: 'to-delete', title: 'To delete' };
    await storage.saveBook(book);
    const ok = await storage.deleteBook('to-delete');
    expect(ok).toBe(true);
    const r = await storage.readBook('to-delete');
    expect(r).toBeNull();
  });
});