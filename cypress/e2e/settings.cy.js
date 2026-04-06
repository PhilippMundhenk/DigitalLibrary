describe('Settings', () => {
  before(() => {
    cy.request('POST', '/api/clear');
    // Reset settings to defaults so auto-fetch is checked
    cy.request('PUT', '/api/settings', { autoFetchMetadata: true, warnDuplicateIsbn: true, customFields: [] });
  });

  beforeEach(() => {
    cy.visit('/');
  });

  it('opens and closes settings modal', () => {
    cy.get('#settingsBtn').click();
    cy.get('#settingsModal').should('be.visible');
    cy.get('#settingsCloseBtn').click();
    cy.get('#settingsModal').should('not.be.visible');
  });

  it('auto-fetch toggle persists', () => {
    cy.get('#settingsBtn').click();
    cy.get('#settAutoFetch').should('be.checked');
    cy.get('#settAutoFetch').uncheck();
    cy.get('#settingsCloseBtn').click();

    // Reload and verify
    cy.visit('/');
    cy.get('#settingsBtn').click();
    cy.get('#settAutoFetch').should('not.be.checked');

    // Re-enable for other tests
    cy.get('#settAutoFetch').check();
    cy.get('#settingsCloseBtn').click();
  });

  it('clear library removes all books', () => {
    // Add some books first
    cy.request('POST', '/api/books', { title: 'ClearTest1' });
    cy.request('POST', '/api/books', { title: 'ClearTest2' });
    cy.visit('/');
    cy.get('.card').should('have.length.at.least', 2);

    cy.get('#settingsBtn').click();
    // Confirm both prompts
    cy.on('window:confirm', () => true);
    cy.get('#clearLibraryBtn').click();
    cy.get('#settingsModal').should('not.be.visible');
    cy.get('#empty').should('be.visible');
  });
});
