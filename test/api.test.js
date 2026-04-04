const request = require('supertest');
const path = require('path');

describe('API', () => {
  let server;
  beforeAll(async () => {
    const tmp = require('fs').mkdtempSync(require('os').tmpdir() + require('path').sep + 'dl-');
    process.env.DATA_DIR = tmp;
    process.env.PORT = '0';
    jest.resetModules();
    const appModule = require('../server');
    server = await appModule.start();
  });

  afterAll(async () => {
    if (server && server.close) server.close();
  });

  test('create and fetch book', async () => {
    const payload = { title: 'API Book', authors: ['X'], isbn: '000', cover: '' };
    const create = await request(server).post('/api/books').send(payload).expect(201);
    expect(create.body).toHaveProperty('id');
    expect(create.body).toHaveProperty('created_at');
    expect(create.body).toHaveProperty('updated_at');
    const id = create.body.id;
    const get = await request(server).get(`/api/books/${id}`).expect(200);
    expect(get.body.title).toBe('API Book');
    expect(get.body.authors).toEqual(['X']);
  });

  test('list books', async () => {
    const res = await request(server).get('/api/books').expect(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
  });

  test('update book', async () => {
    const create = await request(server).post('/api/books')
      .send({ title: 'Before Update', authors: ['A'] }).expect(201);
    const id = create.body.id;
    const updated = await request(server).put(`/api/books/${id}`)
      .send({ title: 'After Update', location: 'shelf-B2' }).expect(200);
    expect(updated.body.title).toBe('After Update');
    expect(updated.body.location).toBe('shelf-B2');
    expect(updated.body.authors).toEqual(['A']);
  });

  test('delete book', async () => {
    const create = await request(server).post('/api/books')
      .send({ title: 'To Delete' }).expect(201);
    const id = create.body.id;
    await request(server).delete(`/api/books/${id}`).expect(200);
    await request(server).get(`/api/books/${id}`).expect(404);
  });

  test('get nonexistent book returns 404', async () => {
    await request(server).get('/api/books/nonexistent-id').expect(404);
  });

  test('update nonexistent book returns 404', async () => {
    await request(server).put('/api/books/nonexistent-id')
      .send({ title: 'X' }).expect(404);
  });

  test('search books by query', async () => {
    await request(server).post('/api/books')
      .send({ title: 'Unique Search Term XYZ', authors: ['SearchAuth'] }).expect(201);
    const res = await request(server).get('/api/books?q=Unique+Search+Term+XYZ').expect(200);
    expect(res.body.length).toBe(1);
    expect(res.body[0].title).toBe('Unique Search Term XYZ');
  });

  test('search books by field', async () => {
    await request(server).post('/api/books')
      .send({ title: 'Field Test', authors: ['FieldAuthor99'] }).expect(201);
    const res = await request(server).get('/api/books?q=FieldAuthor99&field=authors').expect(200);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
    const res2 = await request(server).get('/api/books?q=FieldAuthor99&field=title').expect(200);
    expect(res2.body.length).toBe(0);
  });

  test('locations endpoint returns distinct locations', async () => {
    await request(server).post('/api/books')
      .send({ title: 'Loc A', location: 'shelf-A1' }).expect(201);
    await request(server).post('/api/books')
      .send({ title: 'Loc B', location: 'shelf-B1' }).expect(201);
    await request(server).post('/api/books')
      .send({ title: 'Loc A dup', location: 'shelf-A1' }).expect(201);
    const res = await request(server).get('/api/locations').expect(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toContain('shelf-A1');
    expect(res.body).toContain('shelf-B1');
    expect(res.body.filter(l => l === 'shelf-A1').length).toBe(1);
  });

  test('import JSON file', async () => {
    const books = [
      { title: 'Import One', authors: ['I1'], isbn: '111' },
      { title: 'Import Two', authors: ['I2'], isbn: '222' }
    ];
    const res = await request(server)
      .post('/api/import')
      .attach('file', Buffer.from(JSON.stringify(books)), 'test.json')
      .expect(200);
    expect(res.body.imported).toBe(2);
    expect(res.body.books.length).toBe(2);
  });

  test('import TXT file with ISBNs per line', async () => {
    const txt = '9781234567890\n9780987654321\n';
    const res = await request(server)
      .post('/api/import')
      .attach('file', Buffer.from(txt), 'isbns.txt')
      .expect(200);
    expect(res.body.imported).toBe(2);
    expect(res.body.books[0].isbn).toBe('9781234567890');
    expect(res.body.books[1].isbn).toBe('9780987654321');
  });

  test('import TXT file skips empty lines', async () => {
    const txt = '9781234567890\n\n\n9780987654321\n\n';
    const res = await request(server)
      .post('/api/import')
      .attach('file', Buffer.from(txt), 'isbns.txt')
      .expect(200);
    expect(res.body.imported).toBe(2);
  });

  test('import without file returns 400', async () => {
    await request(server).post('/api/import').expect(400);
  });

  test('import JSON with location field', async () => {
    const books = [
      { title: 'Loc Import 1', isbn: '333', location: 'shelf-C1' },
      { title: 'Loc Import 2', isbn: '444', location: 'shelf-C1' }
    ];
    const res = await request(server)
      .post('/api/import')
      .attach('file', Buffer.from(JSON.stringify(books)), 'with-loc.json')
      .expect(200);
    expect(res.body.imported).toBe(2);
    expect(res.body.books[0].location).toBe('shelf-C1');
    expect(res.body.books[1].location).toBe('shelf-C1');
  });

  test('import CSV file', async () => {
    const csv = 'title,authors,isbn\nCSV Book One,"Auth1",555\nCSV Book Two,"Auth2",666\n';
    const res = await request(server)
      .post('/api/import')
      .attach('file', Buffer.from(csv), 'books.csv')
      .expect(200);
    expect(res.body.imported).toBe(2);
    expect(res.body.books[0].title).toBe('CSV Book One');
  });

  test('created books have timestamps', async () => {
    const create = await request(server).post('/api/books')
      .send({ title: 'Timestamp Test', authors: ['T'] }).expect(201);
    expect(create.body.created_at).toBeDefined();
    expect(create.body.updated_at).toBeDefined();
    const created = new Date(create.body.created_at);
    expect(created.getTime()).not.toBeNaN();
  });

  test('update preserves created_at and updates updated_at', async () => {
    const create = await request(server).post('/api/books')
      .send({ title: 'TS Preserve', authors: ['T'] }).expect(201);
    const id = create.body.id;
    await new Promise(r => setTimeout(r, 10));
    const updated = await request(server).put(`/api/books/${id}`)
      .send({ title: 'TS Updated' }).expect(200);
    expect(updated.body.created_at).toBe(create.body.created_at);
    expect(updated.body.updated_at).not.toBe(create.body.created_at);
  });

  // --- Settings ---
  test('get default settings', async () => {
    const res = await request(server).get('/api/settings').expect(200);
    expect(res.body).toHaveProperty('autoFetchMetadata');
  });

  test('update settings', async () => {
    const res = await request(server).put('/api/settings')
      .send({ autoFetchMetadata: false }).expect(200);
    expect(res.body.autoFetchMetadata).toBe(false);
    const res2 = await request(server).get('/api/settings').expect(200);
    expect(res2.body.autoFetchMetadata).toBe(false);
  });

  test('custom fields in settings', async () => {
    const res = await request(server).put('/api/settings')
      .send({ customFields: [{ name: 'genre', label: 'Genre' }] }).expect(200);
    expect(res.body.customFields).toEqual([{ name: 'genre', label: 'Genre' }]);
    const res2 = await request(server).get('/api/settings').expect(200);
    expect(res2.body.customFields).toEqual([{ name: 'genre', label: 'Genre' }]);
  });

  // --- Bulk operations ---
  test('bulk delete', async () => {
    const c1 = await request(server).post('/api/books').send({ title: 'BulkDel1' }).expect(201);
    const c2 = await request(server).post('/api/books').send({ title: 'BulkDel2' }).expect(201);
    const c3 = await request(server).post('/api/books').send({ title: 'BulkDel3' }).expect(201);
    const res = await request(server).post('/api/books/bulk-delete')
      .send({ ids: [c1.body.id, c3.body.id] }).expect(200);
    expect(res.body.deleted).toBe(2);
    await request(server).get(`/api/books/${c1.body.id}`).expect(404);
    await request(server).get(`/api/books/${c2.body.id}`).expect(200);
    await request(server).get(`/api/books/${c3.body.id}`).expect(404);
  });

  test('bulk delete without ids returns 400', async () => {
    await request(server).post('/api/books/bulk-delete').send({}).expect(400);
  });

  test('bulk update', async () => {
    const c1 = await request(server).post('/api/books').send({ title: 'BulkUpd1' }).expect(201);
    const c2 = await request(server).post('/api/books').send({ title: 'BulkUpd2' }).expect(201);
    const res = await request(server).put('/api/books/bulk-update')
      .send({ ids: [c1.body.id, c2.body.id], update: { location: 'bulk-loc' } }).expect(200);
    expect(res.body.updated).toBe(2);
    const g1 = await request(server).get(`/api/books/${c1.body.id}`).expect(200);
    expect(g1.body.location).toBe('bulk-loc');
    expect(g1.body.title).toBe('BulkUpd1');
  });

  test('bulk update without ids returns 400', async () => {
    await request(server).put('/api/books/bulk-update').send({}).expect(400);
  });

  // --- Cover upload ---
  test('upload cover image', async () => {
    // Create a minimal valid JPEG (just headers for test)
    const jpegBuf = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, ...Buffer.alloc(100, 0x42)]);
    const res = await request(server)
      .post('/api/upload-cover')
      .attach('cover', jpegBuf, 'cover.jpg')
      .expect(200);
    expect(res.body).toHaveProperty('cover');
    expect(res.body.cover).toMatch(/^data:image\/jpeg;base64,/);
  });

  test('upload cover without file returns 400', async () => {
    await request(server).post('/api/upload-cover').expect(400);
  });

  // --- Clear library ---
  test('clear library', async () => {
    await request(server).post('/api/books').send({ title: 'ClearTest' }).expect(201);
    const before = await request(server).get('/api/books').expect(200);
    expect(before.body.length).toBeGreaterThan(0);
    await request(server).post('/api/clear').expect(200);
    const after = await request(server).get('/api/books').expect(200);
    expect(after.body.length).toBe(0);
  });
});
