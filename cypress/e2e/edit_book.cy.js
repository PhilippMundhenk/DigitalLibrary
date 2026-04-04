describe('Edit book flow', () => {
  beforeEach(() => {
    cy.request('POST', '/api/books', {
      title: 'Editable Book',
      authors: ['Original Author'],
      location: 'shelf-E1'
    });
    cy.visit('/');
  });

  it('edits a book via detail view', () => {
    cy.contains('.card', 'Editable Book').click();
    cy.get('#detailEditBtn').click();
    cy.get('#modal').should('be.visible');
    cy.get('#title').clear().type('Updated Book Title');
    cy.get('#location').clear().type('shelf-E2');
    cy.get('#saveBtn').click();
    cy.get('#modal').should('not.be.visible');
    cy.contains('Updated Book Title').should('exist');
  });
});
