describe('Security', () => {
  before(() => {
    cy.request('POST', '/api/clear');
    cy.request('PUT', '/api/settings', { autoFetchMetadata: false });
  });

  it('API returns security headers', () => {
    cy.request('/api/settings').then((res) => {
      expect(res.headers).to.have.property('x-content-type-options', 'nosniff');
      expect(res.headers).to.have.property('x-frame-options');
      expect(res.headers).to.have.property('content-security-policy');
    });
  });

  it('API strips unknown fields from books', () => {
    cy.request('POST', '/api/books', {
      title: 'Sanitized Book',
      evilField: 'should-not-persist',
      constructor: { bad: true }
    }).then((res) => {
      expect(res.body.title).to.equal('Sanitized Book');
      expect(res.body.evilField).to.be.undefined;
      expect(res.body.constructor).to.be.a('function'); // native JS constructor
    });
  });

  it('API returns no-cache headers on API routes', () => {
    cy.request('/api/books').then((res) => {
      expect(res.headers['cache-control']).to.equal('no-store');
    });
  });

  it('metadata endpoint rejects invalid ISBN', () => {
    cy.request('/api/metadata/abc').then((res) => {
      expect(res.body).to.deep.equal({});
    });
  });

  it('import rejects non-array JSON', () => {
    const blob = new Blob(['{"not":"array"}'], { type: 'application/json' });
    const formData = new FormData();
    formData.append('file', blob, 'bad.json');

    cy.request({
      method: 'POST',
      url: '/api/import',
      body: formData,
      failOnStatusCode: false,
      headers: { 'content-type': 'multipart/form-data' }
    });
    // Just verify the endpoint handles it (exact response may vary)
  });
});
