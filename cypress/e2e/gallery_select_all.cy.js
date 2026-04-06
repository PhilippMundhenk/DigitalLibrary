describe('Select All in gallery view', () => {
  before(() => {
    cy.request('POST', '/api/clear');
    cy.request('PUT', '/api/settings', { autoFetchMetadata: false });
    cy.request('POST', '/api/books', { title: 'Gallery SA 1', location: 'loc-A' });
    cy.request('POST', '/api/books', { title: 'Gallery SA 2', location: 'loc-A' });
    cy.request('POST', '/api/books', { title: 'Gallery SA 3', location: 'loc-B' });
  });

  beforeEach(() => {
    cy.visit('/');
    cy.get('.card').should('have.length', 3);
  });

  it('Select All button selects all books in gallery', () => {
    // Select one to show selection bar
    cy.get('.card-checkbox').first().click();
    cy.get('#selectionBar').should('be.visible');
    cy.get('#selAll').click();
    cy.get('#selectionCount').should('contain', '3 selected');
    cy.get('.card.selected').should('have.length', 3);
  });

  it('Select All toggles to deselect all', () => {
    cy.get('.card-checkbox').first().click();
    cy.get('#selAll').click();
    cy.get('#selectionCount').should('contain', '3 selected');
    // Click again to deselect all
    cy.get('#selAll').click();
    cy.get('#selectionBar').should('not.be.visible');
    cy.get('.card.selected').should('have.length', 0);
  });

  it('Select All respects location filter', () => {
    cy.get('#locationFilter').select('loc-A');
    cy.get('.card').should('have.length', 2);
    cy.get('.card-checkbox').first().click();
    cy.get('#selAll').click();
    cy.get('#selectionCount').should('contain', '2 selected');
    // Clean up
    cy.get('#selClear').click();
    cy.get('#locationFilter').select('');
  });

  it('bulk delete via Select All removes all books', () => {
    cy.get('.card-checkbox').first().click();
    cy.get('#selAll').click();
    cy.get('#selectionCount').should('contain', '3 selected');
    cy.on('window:confirm', () => true);
    cy.get('#selDelete').click();
    cy.get('#empty').should('be.visible');
  });
});
