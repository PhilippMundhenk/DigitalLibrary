describe('Keyboard shortcuts', () => {
  before(() => {
    cy.request('POST', '/api/clear');
    cy.request('PUT', '/api/settings', { autoFetchMetadata: false });
    cy.request('POST', '/api/books', { title: 'KB Book A', authors: ['Author A'], location: 'shelf-1' });
    cy.request('POST', '/api/books', { title: 'KB Book B', authors: ['Author B'], location: 'shelf-2' });
    cy.request('POST', '/api/books', { title: 'KB Book C', authors: ['Author C'], location: 'shelf-1' });
  });

  beforeEach(() => {
    cy.visit('/');
    cy.get('.card').should('have.length.at.least', 3);
  });

  it('N opens add book modal', () => {
    cy.get('body').type('n');
    cy.get('#modal').should('be.visible');
    cy.get('#modal-title').should('contain', 'Add Book');
    // Close it
    cy.get('body').type('{esc}');
    cy.get('#modal').should('not.be.visible');
  });

  it('Escape closes modals', () => {
    cy.get('#addBtn').click();
    cy.get('#modal').should('be.visible');
    cy.get('body').type('{esc}');
    cy.get('#modal').should('not.be.visible');
  });

  it('Escape clears selection', () => {
    cy.get('.card-checkbox').first().click();
    cy.get('#selectionBar').should('be.visible');
    cy.get('body').type('{esc}');
    cy.get('#selectionBar').should('not.be.visible');
  });

  it('Ctrl+A selects all books', () => {
    cy.get('body').type('{ctrl}a');
    cy.get('#selectionBar').should('be.visible');
    cy.get('#selectionCount').should('contain', '3 selected');
    // Clean up
    cy.get('body').type('{esc}');
  });

  it('/ focuses search box', () => {
    cy.get('body').type('/');
    cy.focused().should('have.attr', 'id', 'search');
  });

  it('Arrow keys navigate books and Enter opens detail', () => {
    cy.get('body').type('{downarrow}');
    cy.get('.card.focused').should('have.length', 1);
    cy.get('body').type('{downarrow}');
    cy.get('.card.focused').should('have.length', 1);
    cy.get('body').type('{enter}');
    cy.get('#detail').should('be.visible');
    cy.get('body').type('{esc}');
  });

  it('Space toggles selection of focused book', () => {
    cy.get('body').type('{downarrow}');
    cy.get('.card.focused').should('have.length', 1);
    cy.get('body').type(' ');
    cy.get('#selectionBar').should('be.visible');
    cy.get('#selectionCount').should('contain', '1 selected');
    // Clean up
    cy.get('body').type('{esc}');
  });

  it('shortcuts do not fire when typing in input', () => {
    cy.get('#search').click().type('n');
    cy.get('#modal').should('not.be.visible');
    cy.get('#search').should('have.value', 'n');
  });

  it('Ctrl+Enter saves book in modal', () => {
    cy.get('body').type('n');
    cy.get('#modal').should('be.visible');
    cy.get('#title').type('Ctrl Enter Book');
    cy.get('#authors').type('Test Author');
    cy.get('body').type('{ctrl}{enter}');
    cy.get('#modal').should('not.be.visible');
    cy.contains('Ctrl Enter Book');
  });
});
