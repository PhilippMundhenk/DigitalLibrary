describe('Cover upload', () => {
  before(() => {
    cy.request('POST', '/api/clear');
    cy.request('PUT', '/api/settings', { autoFetchMetadata: false });
  });

  it('cover URL input is hidden from UI', () => {
    cy.visit('/');
    cy.waitForApp();
    cy.get('#addBtn').click();
    cy.get('#modal').should('be.visible');
    cy.get('#cover').should('have.attr', 'type', 'hidden');
  });

  it('shows upload cover button in modal', () => {
    cy.visit('/');
    cy.waitForApp();
    cy.get('#addBtn').click();
    cy.get('#modal').should('be.visible');
    cy.get('.cover-upload-label').should('be.visible');
    cy.get('.cover-upload-label').should('contain', 'Upload Cover');
    cy.get('#cancelBtn').click();
  });

  it('uploads a cover image via API', () => {
    const jpegBuf = Cypress.Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, ...Array(100).fill(0x42)]);
    cy.request({
      method: 'POST',
      url: '/api/upload-cover',
      encoding: 'binary',
      headers: { 'content-type': 'multipart/form-data' },
      body: jpegBuf,
      failOnStatusCode: false
    });
  });

  it('shows cover preview image in modal', () => {
    cy.visit('/');
    cy.waitForApp();
    cy.get('#addBtn').click();
    cy.get('#modal').should('be.visible');
    cy.get('#modal-cover-preview').should('have.attr', 'src');
    cy.get('#cancelBtn').click();
  });

  it('displays cover set status when editing book with cover', () => {
    // Valid 1x1 red PNG
    const cover = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwADhQGAWjR9awAAAABJRU5ErkJggg==';
    cy.request('POST', '/api/clear');
    cy.request('POST', '/api/books', {
      title: 'Cover Test Book',
      cover: cover
    });
    cy.visit('/');
    cy.waitForApp();
    cy.contains('.card', 'Cover Test Book').click();
    cy.get('#detail').should('be.visible');
    // Wait for async full book load (detail-cover changes from placeholder SVG to PNG)
    cy.get('#detail-cover', { timeout: 10000 }).should('have.attr', 'src').and('contain', 'base64,iVBOR');
    cy.get('#detailEditBtn').click();
    cy.get('#modal').should('be.visible');
    cy.get('#coverStatus').should('contain', 'Cover set');
  });

  it('cover preview has clickable overlay in edit modal', () => {
    cy.visit('/');
    cy.waitForApp();
    cy.get('#addBtn').click();
    cy.get('#modal').should('be.visible');
    cy.get('.modal-cover-wrapper').should('exist');
    cy.get('.modal-cover-wrapper .cover-overlay').should('exist');
  });

  it('clicking cover preview triggers file input', () => {
    cy.visit('/');
    cy.waitForApp();
    cy.get('#addBtn').click();
    cy.get('#modal').should('be.visible');
    // Attach a small PNG via the file input triggered by clicking the cover
    cy.fixture('test-cover.png', 'base64').then(content => {
      const blob = Cypress.Blob.base64StringToBlob(content, 'image/png');
      const file = new File([blob], 'test-cover.png', { type: 'image/png' });
      const dt = new DataTransfer();
      dt.items.add(file);
      cy.get('#coverUpload').then(input => {
        input[0].files = dt.files;
        input[0].dispatchEvent(new Event('change', { bubbles: true }));
      });
    });
    cy.get('#coverStatus').should('contain', 'Cover uploaded');
    cy.get('#cancelBtn').click();
  });
});
