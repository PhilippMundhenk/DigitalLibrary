describe('ISBN validation indicator', () => {
  beforeEach(() => {
    cy.visit('/');
    cy.get('#addBtn').click();
    cy.get('#modal').should('be.visible');
  });

  it('shows valid indicator for correct ISBN-13', () => {
    cy.get('#isbn').type('9780134685991');
    cy.get('#isbn-status').should('contain', 'Valid');
    cy.get('#isbn-status').should('have.class', 'valid');
  });

  it('shows invalid indicator for wrong ISBN-13 checksum', () => {
    cy.get('#isbn').type('9780134685992');
    cy.get('#isbn-status').should('contain', 'Invalid');
    cy.get('#isbn-status').should('have.class', 'invalid');
  });

  it('shows valid indicator for ISBN-13 with dashes', () => {
    cy.get('#isbn').type('978-0-13-468599-1');
    cy.get('#isbn-status').should('contain', 'Valid');
    cy.get('#isbn-status').should('have.class', 'valid');
  });

  it('shows no indicator for incomplete ISBN', () => {
    cy.get('#isbn').type('97801');
    cy.get('#isbn-status').should('have.text', '');
  });

  it('shows valid indicator for ISBN-10', () => {
    cy.get('#isbn').type('0201633612');
    cy.get('#isbn-status').should('contain', 'Valid');
  });

  it('clears indicator when ISBN is cleared', () => {
    cy.get('#isbn').type('9780134685991');
    cy.get('#isbn-status').should('contain', 'Valid');
    cy.get('#isbn').clear();
    cy.get('#isbn-status').should('have.text', '');
  });
});
