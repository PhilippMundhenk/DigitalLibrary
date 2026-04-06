describe('Custom fields', () => {
  before(() => {
    cy.request('POST', '/api/clear');
    cy.request('PUT', '/api/settings', { autoFetchMetadata: false, warnDuplicateIsbn: true, customFields: [] });
  });

  it('adds a custom field in settings', () => {
    cy.visit('/');
    cy.waitForApp();
    cy.get('#settingsBtn').click();
    cy.get('#settingsModal').should('be.visible');
    cy.get('#newFieldName').type('Genre');
    cy.get('#addFieldBtn').click();
    cy.get('.custom-field-row').should('have.length', 1);
    cy.get('.custom-field-row').should('contain', 'Genre');
    cy.get('#settingsCloseBtn').click();
  });

  it('shows custom field in add/edit modal', () => {
    cy.request('PUT', '/api/settings', {
      autoFetchMetadata: false,
      customFields: [{ name: 'genre', label: 'Genre' }]
    });
    cy.visit('/');
    cy.waitForApp();
    cy.get('#addBtn').click();
    cy.get('#modal').should('be.visible');
    cy.get('#customFieldsArea').should('contain', 'Genre');
    cy.get('[data-custom-field="genre"]').should('exist');
    cy.get('#cancelBtn').click();
  });

  it('saves custom field value on book', () => {
    cy.request('PUT', '/api/settings', {
      autoFetchMetadata: false,
      customFields: [{ name: 'genre', label: 'Genre' }]
    });
    cy.visit('/');
    cy.waitForApp();
    cy.get('#addBtn').click();
    cy.get('#modal').should('be.visible');
    cy.get('#title').type('Custom Field Book');
    cy.get('#authors').type('Test Author');
    cy.get('[data-custom-field="genre"]').type('Science Fiction');
    cy.get('#saveBtn').click();
    cy.get('#modal').should('not.be.visible');
    cy.contains('Custom Field Book').click();
    cy.get('#detail').should('be.visible');
    cy.get('#detail-custom-fields').should('contain', 'Genre');
    cy.get('#detail-custom-fields').should('contain', 'Science Fiction');
  });

  it('removes custom field in settings', () => {
    cy.request('PUT', '/api/settings', {
      autoFetchMetadata: false,
      customFields: [{ name: 'genre', label: 'Genre' }]
    });
    cy.visit('/');
    cy.waitForApp();
    cy.get('#settingsBtn').click();
    cy.get('#settingsModal').should('be.visible');
    cy.get('.custom-field-row').should('have.length', 1);
    cy.get('.custom-field-row .btn-danger').click();
    cy.get('.custom-field-row').should('have.length', 0);
    cy.get('#settingsCloseBtn').click();
  });

  it('prevents duplicate custom field names', () => {
    cy.request('PUT', '/api/settings', {
      autoFetchMetadata: false,
      customFields: [{ name: 'genre', label: 'Genre' }]
    });
    cy.visit('/');
    cy.waitForApp();
    cy.get('#settingsBtn').click();
    cy.get('#settingsModal').should('be.visible');
    cy.get('#newFieldName').type('Genre');
    cy.get('#addFieldBtn').click();
    cy.get('.custom-field-row').should('have.length', 1);
    cy.get('#settingsCloseBtn').click();
  });
});
