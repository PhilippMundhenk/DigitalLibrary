const request = require('supertest');

describe('API', () => {
  let server;
  beforeAll(async () => {
    // Start app on ephemeral DATA_DIR
    const tmp = require('fs').mkdtempSync(require('os').tmpdir() + require('path').sep + 'dl-');
    process.env.DATA_DIR = tmp;
    jest.resetModules();
    const appModule = require('../server');
    server = await appModule.start();
  });

  afterAll(async () => {
    if (server && server.close) server.close();
  });

  test('create and fetch book', async () => {
    const payload = { title: 'API Book', authors: ['X'], isbn: '000' };
    const create = await request('http://localhost:3000').post('/api/books').send(payload).expect(201);
    expect(create.body).toHaveProperty('id');
    const id = create.body.id;
    const get = await request('http://localhost:3000').get(`/api/books/${id}`).expect(200);
    expect(get.body.title).toBe('API Book');
  });

  test('list books', async () => {
    const res = await request('http://localhost:3000').get('/api/books').expect(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});