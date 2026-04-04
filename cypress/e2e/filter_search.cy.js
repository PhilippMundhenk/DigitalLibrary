describe('Filter and search', () => {
  before(() => {
    // Create books with different locations
    cy.request('POST', '/api/books', {
      title: 'Kitchen Book',
      authors: ['Chef A'],
      location: 'kitchen'
    });
    cy.request('POST', '/api/books', {
      title: 'Office Book',
      authors: ['Worker B'],
      location: 'office'
    });
    cy.request('POST', '/api/books', {
      title: 'Another Kitchen Book',
      authors: ['Chef C'],
      location: 'kitchen'
    });
  });

  beforeEach(() => {
    cy.visit('/');
  });

  it('filters books by location', () => {
    cy.get('#locationFilter').select('kitchen');
    cy.contains('Kitchen Book').should('exist');
    cy.contains('Another Kitchen Book').should('exist');
    cy.contains('Office Book').should('not.exist');
  });

  it('shows all books when All locations is selected', () => {
    cy.get('#locationFilter').select('kitchen');
    cy.contains('Office Book').should('not.exist');
    cy.get('#locationFilter').select('');
    cy.contains('Office Book').should('exist');
    cy.contains('Kitchen Book').should('exist');
  });

  it('searches books by text', () => {
    cy.get('#search').type('Kitchen');
    cy.contains('Kitchen Book').should('exist');
    cy.contains('Office Book').should('not.exist');
  });

  it('shows empty state when no results', () => {
    cy.get('#search').type('xyznonexistent1234');
    cy.get('#empty').should('be.visible');
  });
});
