describe('Table view', () => {
  before(() => {
    cy.request('POST', '/api/clear');
    cy.request('PUT', '/api/settings', { autoFetchMetadata: false });
    cy.request('POST', '/api/books', {
      title: 'Table View Book',
      authors: ['Table Author'],
      isbn: '999',
      location: 'shelf-T1'
    });
  });

  beforeEach(() => {
    cy.visit('/');
    cy.waitForApp();
  });

  it('switches to table view', () => {
    cy.get('#view').select('table');
    cy.get('#table').should('be.visible');
    cy.get('#gallery').should('not.be.visible');
    cy.get('.data-table').should('exist');
    cy.contains('td', 'Table View Book').should('exist');
  });

  it('opens detail from table row click', () => {
    cy.get('#view').select('table');
    cy.contains('tr', 'Table View Book').click();
    cy.get('#detail').should('be.visible');
    cy.get('#detail-title').should('have.text', 'Table View Book');
  });
});
