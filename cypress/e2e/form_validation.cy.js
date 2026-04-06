describe('Book form validation', () => {
  before(() => {
    cy.request('POST', '/api/clear');
    cy.request('PUT', '/api/settings', { autoFetchMetadata: false });
  });

  beforeEach(() => {
    cy.visit('/');
    cy.waitForApp();
  });

  it('requires title or ISBN', () => {
    cy.get('#addBtn').click();
    cy.get('#modal').should('be.visible');
    cy.get('#saveBtn').click();
    cy.get('#modal-error').should('be.visible');
    cy.get('#modal-error').should('contain', 'Either title or ISBN is required');
    cy.get('#modal').should('be.visible');
    cy.get('#cancelBtn').click();
  });

  it('accepts book with only title', () => {
    cy.get('#addBtn').click();
    cy.get('#modal').should('be.visible');
    cy.get('#title').type('Title Only Book');
    cy.get('#saveBtn').click();
    cy.get('#modal').should('not.be.visible');
    cy.contains('Title Only Book');
  });

  it('accepts book with only ISBN', () => {
    cy.get('#addBtn').click();
    cy.get('#modal').should('be.visible');
    cy.get('#isbn').type('9780134685991');
    cy.get('#saveBtn').click();
    cy.get('#modal').should('not.be.visible');
  });

  it('rejects invalid ISBN characters', () => {
    cy.get('#addBtn').click();
    cy.get('#modal').should('be.visible');
    cy.get('#isbn').type('abc-invalid');
    cy.get('#title').type('Bad ISBN Book');
    cy.get('#saveBtn').click();
    cy.get('#modal-error').should('be.visible');
    cy.get('#modal-error').should('contain', 'invalid characters');
    cy.get('#cancelBtn').click();
  });

  it('saves book with all fields filled', () => {
    cy.get('#addBtn').click();
    cy.get('#modal').should('be.visible');
    cy.get('#isbn').type('978-0-13-468599-1');
    cy.get('#title').type('Complete Book');
    cy.get('#authors').type('Author One, Author Two');
    cy.get('#location').type('shelf-Z1');
    cy.get('#notes').type('Some notes here');
    cy.get('#saveBtn').click();
    cy.get('#modal').should('not.be.visible');
    cy.contains('Complete Book');
  });

  it('focuses ISBN field when modal opens', () => {
    cy.get('#addBtn').click();
    cy.get('#modal').should('be.visible');
    cy.wait(150);
    cy.focused().should('have.attr', 'id', 'isbn');
    cy.get('#cancelBtn').click();
  });
});
