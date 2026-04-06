// Wait for the async IIFE in app.js to finish initializing
Cypress.Commands.add('waitForApp', () => {
  cy.get('#app[data-ready="true"]', { timeout: 10000 });
});
