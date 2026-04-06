describe('Book detail view', () => {
  before(() => {
    cy.request('POST', '/api/clear');
    cy.request('PUT', '/api/settings', { autoFetchMetadata: false });
  });

  beforeEach(() => {
    cy.request('POST', '/api/clear');
    // Create a book via API
    cy.request('POST', '/api/books', {
      title: 'Detail Test Book',
      authors: ['Detail Author'],
      isbn: '978-0-1234-5678-9',
      location: 'shelf-D1',
      notes: 'Some notes about this book'
    });
    cy.visit('/');
  });

  it('opens detail view when clicking a book card', () => {
    cy.contains('.card', 'Detail Test Book').click();
    cy.get('#detail').should('be.visible');
    cy.get('#detail-title').should('have.text', 'Detail Test Book');
    cy.get('#detail-authors').should('contain', 'Detail Author');
    cy.get('#detail-isbn').should('contain', '978-0-1234-5678-9');
    cy.get('#detail-location').should('contain', 'shelf-D1');
    cy.get('#detail-notes').should('contain', 'Some notes about this book');
  });

  it('closes detail view with Close button', () => {
    cy.contains('.card', 'Detail Test Book').click();
    cy.get('#detail').should('be.visible');
    cy.get('#detailCloseBtn').click();
    cy.get('#detail').should('not.be.visible');
  });

  it('opens edit modal from detail view', () => {
    cy.contains('.card', 'Detail Test Book').click();
    cy.get('#detailEditBtn').click();
    cy.get('#detail').should('not.be.visible');
    cy.get('#modal').should('be.visible');
    cy.get('#title').should('have.value', 'Detail Test Book');
  });

  it('deletes a book from detail view', () => {
    cy.on('window:confirm', () => true);
    cy.contains('.card', 'Detail Test Book').click();
    cy.get('#detailDeleteBtn').click();
    cy.get('#detail').should('not.be.visible');
    cy.contains('Detail Test Book').should('not.exist');
  });
});
