describe('Add Book flow', () => {
  it('visits and adds a book', () => {
    cy.visit('/');
    cy.get('#addBtn').click();
    cy.get('#title').type('Cypress Book');
    cy.get('#authors').type('Cypress Author');
    cy.get('#location').type('shelf-C1');
    cy.get('#saveBtn').click();
    cy.contains('Cypress Book');
  });
});