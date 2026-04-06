describe('ISBN-10 auto-fix', () => {
  before(() => {
    cy.request('POST', '/api/clear');
    cy.request('PUT', '/api/settings', { autoFetchMetadata: false });
  });

  beforeEach(() => {
    cy.visit('/');
    cy.waitForApp();
  });

  it('auto-fixes ISBN-10 missing X check digit', () => {
    cy.get('#addBtn').click();
    cy.get('#modal').should('be.visible');
    // 080442957 should become 080442957X (debounced fix after 300ms)
    cy.get('#isbn').type('0804429570');
    cy.get('#isbn-status', { timeout: 5000 }).should('contain', 'Fixed');
    cy.get('#isbn').should('have.value', '080442957X');
    cy.get('#cancelBtn').click();
  });

  it('shows valid for correct ISBN-13', () => {
    cy.get('#addBtn').click();
    cy.get('#modal').should('be.visible');
    cy.get('#isbn').type('9780134685991');
    cy.get('#isbn-status').should('contain', 'Valid ISBN');
    cy.get('#isbn-status').should('have.class', 'valid');
    cy.get('#cancelBtn').click();
  });

  it('shows invalid for wrong checksum', () => {
    cy.get('#addBtn').click();
    cy.get('#modal').should('be.visible');
    cy.get('#isbn').type('9780134685992');
    cy.get('#isbn-status').should('contain', 'Invalid');
    cy.get('#isbn-status').should('have.class', 'invalid');
    cy.get('#cancelBtn').click();
  });

  it('shows nothing for incomplete ISBN', () => {
    cy.get('#addBtn').click();
    cy.get('#modal').should('be.visible');
    cy.get('#isbn').type('97801');
    cy.get('#isbn-status').should('have.text', '');
    cy.get('#cancelBtn').click();
  });
});
