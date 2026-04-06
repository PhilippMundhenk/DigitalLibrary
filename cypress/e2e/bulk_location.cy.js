describe('Bulk set location', () => {
  before(() => {
    cy.request('POST', '/api/clear');
    cy.request('PUT', '/api/settings', { autoFetchMetadata: false });
    cy.request('POST', '/api/books', { title: 'Bulk Loc 1' });
    cy.request('POST', '/api/books', { title: 'Bulk Loc 2' });
  });

  it('sets location for selected books', () => {
    cy.visit('/');
    cy.waitForApp();
    cy.get('.card').should('have.length', 2);
    cy.get('.card-checkbox').eq(0).click();
    cy.get('.card-checkbox').eq(1).click();
    cy.get('#selectionCount').should('contain', '2 selected');

    cy.window().then((win) => {
      cy.stub(win, 'prompt').returns('new-shelf');
    });
    cy.get('#selSetLocation').click();

    cy.request('/api/books').then((res) => {
      const books = res.body.books;
      expect(books.every(b => b.location === 'new-shelf')).to.be.true;
    });
  });
});
