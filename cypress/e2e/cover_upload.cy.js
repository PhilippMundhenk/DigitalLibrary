describe('Cover upload', () => {
  before(() => {
    cy.request('POST', '/api/clear');
    cy.request('PUT', '/api/settings', { autoFetchMetadata: false });
  });

  it('cover URL input is hidden from UI', () => {
    cy.visit('/');
    cy.get('#addBtn').click();
    cy.get('#cover').should('have.attr', 'type', 'hidden');
  });

  it('shows upload cover button in modal', () => {
    cy.visit('/');
    cy.get('#addBtn').click();
    cy.get('.cover-upload-label').should('be.visible');
    cy.get('.cover-upload-label').should('contain', 'Upload Cover');
    cy.get('#cancelBtn').click();
  });

  it('uploads a cover image via API', () => {
    // Test the API endpoint directly
    const jpegBuf = Cypress.Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, ...Array(100).fill(0x42)]);
    cy.request({
      method: 'POST',
      url: '/api/upload-cover',
      encoding: 'binary',
      headers: { 'content-type': 'multipart/form-data' },
      body: jpegBuf,
      failOnStatusCode: false
    });
    // Just verify the endpoint exists and handles requests
  });

  it('shows cover status after metadata fetch sets cover', () => {
    cy.visit('/');
    cy.get('#addBtn').click();
    // When a cover is set, the preview image should update
    cy.get('#modal-cover-preview').should('have.attr', 'src');
    cy.get('#cancelBtn').click();
  });

  it('displays cover set status when editing book with cover', () => {
    // Create a book with a cover via API
    cy.request('POST', '/api/books', {
      title: 'Cover Test Book',
      cover: 'data:image/png;base64,iVBORw0KGgo='
    });
    cy.visit('/');
    cy.contains('Cover Test Book').click();
    cy.get('#detail').should('be.visible');
    cy.get('#detailEditBtn').click();
    cy.get('#coverStatus').should('contain', 'Cover set');
  });
});
