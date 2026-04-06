describe('Multi-select operations', () => {
  before(() => {
    // Clear and seed
    cy.request('POST', '/api/clear');
    cy.request('PUT', '/api/settings', { autoFetchMetadata: false });
    cy.request('POST', '/api/books', { title: 'Select A', authors: ['A'], location: 'shelf-1' });
    cy.request('POST', '/api/books', { title: 'Select B', authors: ['B'], location: 'shelf-1' });
    cy.request('POST', '/api/books', { title: 'Select C', authors: ['C'], location: 'shelf-2' });
  });

  beforeEach(() => {
    cy.visit('/');
  });

  it('shows checkboxes on cards', () => {
    cy.get('.card-checkbox').should('have.length.at.least', 3);
  });

  it('selecting cards shows selection bar', () => {
    cy.get('#selectionBar').should('not.be.visible');
    cy.get('.card-checkbox').first().click();
    cy.get('#selectionBar').should('be.visible');
    cy.get('#selectionCount').should('contain', '1 selected');
  });

  it('clear selection hides selection bar', () => {
    cy.get('.card-checkbox').first().click();
    cy.get('#selectionBar').should('be.visible');
    cy.get('#selClear').click();
    cy.get('#selectionBar').should('not.be.visible');
  });

  it('bulk delete removes selected books', () => {
    cy.get('.card-checkbox').eq(0).click();
    cy.get('.card-checkbox').eq(1).click();
    cy.get('#selectionCount').should('contain', '2 selected');
    cy.on('window:confirm', () => true);
    cy.get('#selDelete').click();
    // Should have 1 book left
    cy.get('.card').should('have.length', 1);
    cy.get('#selectionBar').should('not.be.visible');
  });

  it('table view has select-all checkbox', () => {
    cy.get('#view').select('table');
    cy.get('.select-all').should('exist');
  });

  it('select-all in table selects all visible books', () => {
    cy.get('#view').select('table');
    cy.get('.select-all').click();
    cy.get('#selectionBar').should('be.visible');
    // Clear for cleanup
    cy.get('#selClear').click();
  });
});
