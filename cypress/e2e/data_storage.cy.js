describe('Data storage', () => {
  before(() => {
    cy.request('POST', '/api/clear');
    cy.request('PUT', '/api/settings', { autoFetchMetadata: false });
  });

  it('stores books in per-file storage accessible via API', () => {
    cy.request('POST', '/api/books', {
      title: 'Storage Test',
      authors: ['Author'],
      isbn: '9780134685991',
      location: 'shelf-S1'
    });
    cy.request('/api/books').then(res => {
      const book = res.body.books.find(b => b.title === 'Storage Test');
      expect(book).to.exist;
      expect(book.id).to.be.a('string');
      expect(book.created_at).to.be.a('string');
      expect(book.isbn).to.eq('9780134685991');
    });
  });

  it('settings persist across requests', () => {
    cy.request('PUT', '/api/settings', { autoFetchMetadata: false });
    cy.request('/api/settings').then(res => {
      expect(res.body.autoFetchMetadata).to.eq(false);
    });
  });

  it('bulk operations work correctly', () => {
    cy.request('POST', '/api/clear');
    // Create 3 books
    const ids = [];
    cy.request('POST', '/api/books', { title: 'Bulk1' }).then(r => ids.push(r.body.id));
    cy.request('POST', '/api/books', { title: 'Bulk2' }).then(r => ids.push(r.body.id));
    cy.request('POST', '/api/books', { title: 'Bulk3' }).then(r => {
      ids.push(r.body.id);
      // Bulk update location
      cy.request('PUT', '/api/books/bulk-update', {
        ids: ids,
        update: { location: 'bulk-shelf' }
      }).then(upRes => {
        expect(upRes.body.updated).to.eq(3);
      });
      // Verify
      cy.request(`/api/books/${ids[0]}`).then(r => {
        expect(r.body.location).to.eq('bulk-shelf');
      });
      // Bulk delete 2
      cy.request('POST', '/api/books/bulk-delete', {
        ids: [ids[0], ids[2]]
      }).then(delRes => {
        expect(delRes.body.deleted).to.eq(2);
      });
      // Only middle book remains
      cy.request('/api/books').then(r => {
        expect(r.body.books.length).to.eq(1);
        expect(r.body.books[0].title).to.eq('Bulk2');
      });
    });
  });

  it('clear library removes everything', () => {
    cy.request('POST', '/api/books', { title: 'ClearMe' });
    cy.request('POST', '/api/clear');
    cy.request('/api/books').then(res => {
      expect(res.body.books.length).to.eq(0);
    });
  });
});
