describe('Import flow', () => {
  before(() => {
    cy.request('POST', '/api/clear');
  });

  beforeEach(() => {
    cy.visit('/');
  });

  it('opens import preview when JSON file is selected', () => {
    const books = [
      { title: 'Import Test A', authors: ['Auth A'], isbn: '111' },
      { title: 'Import Test B', authors: ['Auth B'], isbn: '222' }
    ];
    const blob = new Blob([JSON.stringify(books)], { type: 'application/json' });
    const file = new File([blob], 'books.json', { type: 'application/json' });
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);

    cy.get('#importFile').then($input => {
      $input[0].files = dataTransfer.files;
      $input[0].dispatchEvent(new Event('change', { bubbles: true }));
    });

    cy.get('#importPreview').should('be.visible');
    cy.get('#previewArea').should('contain', 'Import Test A');
    cy.get('#previewArea').should('contain', 'Import Test B');
  });

  it('confirm import works and shows progress', () => {
    cy.request('POST', '/api/clear');
    const books = [];
    for (let i = 0; i < 5; i++) {
      books.push({ title: 'Batch ' + i, isbn: '10' + i });
    }
    const blob = new Blob([JSON.stringify(books)], { type: 'application/json' });
    const file = new File([blob], 'books.json', { type: 'application/json' });
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);

    cy.get('#importFile').then($input => {
      $input[0].files = dataTransfer.files;
      $input[0].dispatchEvent(new Event('change', { bubbles: true }));
    });

    cy.get('#importPreview').should('be.visible');
    cy.get('#confirmImportBtn').click();
    // Modal should close after import
    cy.get('#importPreview').should('not.be.visible');
    // Books should be in the library
    cy.get('.card').should('have.length', 5);
  });

  it('applies bulk location to all imports', () => {
    cy.request('POST', '/api/clear');
    const books = [
      { title: 'Bulk Loc A', isbn: '333' },
      { title: 'Bulk Loc B', isbn: '444' }
    ];
    const blob = new Blob([JSON.stringify(books)], { type: 'application/json' });
    const file = new File([blob], 'books.json', { type: 'application/json' });
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);

    cy.get('#importFile').then($input => {
      $input[0].files = dataTransfer.files;
      $input[0].dispatchEvent(new Event('change', { bubbles: true }));
    });

    cy.get('#importPreview').should('be.visible');
    cy.get('#importLocation').type('shelf-Z9');
    cy.get('#confirmImportBtn').click();
    cy.get('#importPreview').should('not.be.visible');

    cy.request('/api/books').then(res => {
      const bulkA = res.body.books.find(b => b.title === 'Bulk Loc A');
      const bulkB = res.body.books.find(b => b.title === 'Bulk Loc B');
      expect(bulkA.location).to.eq('shelf-Z9');
      expect(bulkB.location).to.eq('shelf-Z9');
    });
  });

  it('handles TXT file with ISBNs', () => {
    const txt = '9781234567890\n9780987654321\n';
    const blob = new Blob([txt], { type: 'text/plain' });
    const file = new File([blob], 'isbns.txt', { type: 'text/plain' });
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);

    cy.get('#importFile').then($input => {
      $input[0].files = dataTransfer.files;
      $input[0].dispatchEvent(new Event('change', { bubbles: true }));
    });

    cy.get('#importPreview').should('be.visible');
    cy.get('#previewArea').should('contain', '9781234567890');
    cy.get('#previewArea').should('contain', '9780987654321');
  });

  it('cancel button closes import preview without importing', () => {
    cy.request('POST', '/api/clear');
    const books = [{ title: 'Cancel Test', isbn: '555' }];
    const blob = new Blob([JSON.stringify(books)], { type: 'application/json' });
    const file = new File([blob], 'books.json', { type: 'application/json' });
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);

    cy.get('#importFile').then($input => {
      $input[0].files = dataTransfer.files;
      $input[0].dispatchEvent(new Event('change', { bubbles: true }));
    });

    cy.get('#importPreview').should('be.visible');
    cy.get('#cancelImportBtn').click();
    cy.get('#importPreview').should('not.be.visible');

    // Nothing should be imported
    cy.request('/api/books').then(res => {
      expect(res.body.books.find(b => b.title === 'Cancel Test')).to.be.undefined;
    });
  });
});
