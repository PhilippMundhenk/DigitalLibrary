// Frontend: improved import preview + validation + UX tweaks
(async function () {
  const api = {
    list: (q, field) => fetch(`/api/books${q ? '?q=' + encodeURIComponent(q) + (field ? '&field=' + field : '') : ''}`).then(r=>r.json()),
    get: id => fetch(`/api/books/${id}`).then(r=>r.json()),
    create: b => fetch('/api/books', { method:'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(b) }).then(r=>r.json()),
    update: (id,b) => fetch(`/api/books/${id}`, { method:'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(b) }).then(r=>r.json()),
    delete: id => fetch(`/api/books/${id}`, { method:'DELETE' }).then(r=>r.json()),
    importFile: file => {
      const fd = new FormData(); fd.append('file', file);
      return fetch('/api/import', { method:'POST', body: fd }).then(r=>r.json());
    }
  };

  // Elements
  const searchEl = document.getElementById('search');
  const viewSel = document.getElementById('view');
  const galleryEl = document.getElementById('gallery');
  const tableEl = document.getElementById('table');
  const addBtn = document.getElementById('addBtn');
  const importFile = document.getElementById('importFile');
  const previewImportBtn = document.getElementById('previewImportBtn');
  const scanBtn = document.getElementById('scanBtn');

  // Modal fields
  const modal = document.getElementById('modal');
  const modalTitle = document.getElementById('modal-title');
  const isbnEl = document.getElementById('isbn');
  const titleEl = document.getElementById('title');
  const authorsEl = document.getElementById('authors');
  const locationEl = document.getElementById('location');
  const coverEl = document.getElementById('cover');
  const notesEl = document.getElementById('notes');
  const saveBtn = document.getElementById('saveBtn');
  const cancelBtn = document.getElementById('cancelBtn');
  const fetchMetaBtn = document.getElementById('fetchMeta');
  const modalError = document.getElementById('modal-error');

  const importPreviewModal = document.getElementById('importPreview');
  const previewArea = document.getElementById('previewArea');
  const importErrors = document.getElementById('importErrors');
  const confirmImportBtn = document.getElementById('confirmImportBtn');
  const cancelImportBtn = document.getElementById('cancelImportBtn');

  let editingId = null;
  let importPreviewEntries = [];

  function showModal(edit=null) {
    modal.classList.remove('hidden');
    modalError.style.display = 'none';
    if (edit) {
      modalTitle.textContent = 'Edit Book';
      isbnEl.value = edit.isbn || '';
      titleEl.value = edit.title || '';
      authorsEl.value = (edit.authors || []).join(', ');
      locationEl.value = edit.location || '';
      coverEl.value = edit.cover || '';
      notesEl.value = edit.notes || '';
      editingId = edit.id;
    } else {
      modalTitle.textContent = 'Add Book';
      isbnEl.value = '';
      titleEl.value = '';
      authorsEl.value = '';
      locationEl.value = '';
      coverEl.value = '';
      notesEl.value = '';
      editingId = null;
    }
  }
  function hideModal() { modal.classList.add('hidden'); }

  function validateBook(b) {
    const errors = [];
    if (!b.title && !b.isbn) errors.push('Either title or ISBN is required.');
    if (b.isbn && !/^[0-9Xx\- ]+$/.test(b.isbn)) errors.push('ISBN contains invalid characters.');
    return errors;
  }

  fetchMetaBtn.addEventListener('click', async () => {
    const isbn = isbnEl.value.trim();
    if (!isbn) return alert('ISBN required');
    fetchMetaBtn.disabled = true;
    const m = await fetchMetaByISBN(isbn);
    fetchMetaBtn.disabled = false;
    if (m) {
      if (m.title) titleEl.value = m.title;
      if (m.authors) authorsEl.value = m.authors.join(', ');
      if (m.cover) coverEl.value = m.cover;
    } else {
      alert('No metadata found');
    }
  });

  saveBtn.addEventListener('click', async () => {
    const book = {
      isbn: isbnEl.value.trim() || undefined,
      title: titleEl.value.trim() || undefined,
      authors: authorsEl.value.split(',').map(s=>s.trim()).filter(Boolean),
      location: locationEl.value.trim() || undefined,
      cover: coverEl.value.trim() || undefined,
      notes: notesEl.value.trim() || undefined
    };
    const errors = validateBook(book);
    if (errors.length) {
      modalError.textContent = errors.join(' ');
      modalError.style.display = 'block';
      return;
    }
    try {
      if (editingId) {
        await api.update(editingId, book);
      } else {
        await api.create(book);
      }
      hideModal();
      await refresh();
    } catch (e) {
      alert('Save error: ' + e.message);
    }
  });
  cancelBtn.addEventListener('click', () => hideModal());

  addBtn.addEventListener('click', () => showModal(null));

  // Import preview and validation
  previewImportBtn.addEventListener('click', async () => {
    const f = importFile.files[0];
    if (!f) return alert('Select a file first');
    const text = await f.text();
    let entries = [];
    const fn = f.name || '';
    try {
      if (fn.endsWith('.json') || text.trim().startsWith('[')) {
        entries = JSON.parse(text);
      } else {
        // parse CSV using PapaParse
        const parsed = Papa.parse(text, { header: true, dynamicTyping: false, skipEmptyLines: true });
        if (parsed.errors && parsed.errors.length) {
          importErrors.textContent = 'CSV parse errors: ' + parsed.errors.map(e=>e.message).join('; ');
          return;
        }
        entries = parsed.data;
      }
    } catch (e) {
      importErrors.textContent = 'Parse error: ' + e.message;
      return;
    }

    // Normalize and validate
    importErrors.textContent = '';
    importPreviewEntries = entries.map((r, idx) => {
      const item = {
        title: r.title || r.Title || r.name || r.Name || undefined,
        authors: (r.authors || r.authors || r.author || r.Author || '').toString().split(',').map(s=>s.trim()).filter(Boolean),
        isbn: (r.isbn || r.ISBN || '').toString(),
        location: r.location || r.Location || '',
        notes: r.notes || ''
      };
      const errors = validateBook(item);
      return { item, errors, row: idx+1 };
    });

    // Render preview
    previewArea.innerHTML = '';
    const table = document.createElement('table');
    table.className = 'table';
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    ['#','Title','Authors','ISBN','Location','Errors'].forEach(h => {
      const th = document.createElement('th'); th.textContent = h; headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);
    const tbody = document.createElement('tbody');
    for (const p of importPreviewEntries) {
      const tr = document.createElement('tr');
      const tdIdx = document.createElement('td'); tdIdx.textContent = p.row; tr.appendChild(tdIdx);
      const tdTitle = document.createElement('td'); tdTitle.textContent = p.item.title || ''; tr.appendChild(tdTitle);
      const tdAuth = document.createElement('td'); tdAuth.textContent = (p.item.authors||[]).join(', '); tr.appendChild(tdAuth);
      const tdIsbn = document.createElement('td'); tdIsbn.textContent = p.item.isbn || ''; tr.appendChild(tdIsbn);
      const tdLoc = document.createElement('td'); tdLoc.textContent = p.item.location || ''; tr.appendChild(tdLoc);
      const tdErr = document.createElement('td'); tdErr.textContent = p.errors.join('; '); tdErr.style.color = p.errors.length ? '#b22' : 'inherit'; tr.appendChild(tdErr);
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    previewArea.appendChild(table);
    importPreviewModal.classList.remove('hidden');
  });

  cancelImportBtn.addEventListener('click', () => {
    importPreviewModal.classList.add('hidden');
  });

  confirmImportBtn.addEventListener('click', async () => {
    // If any entries have errors, confirm with user
    const hasErrors = importPreviewEntries.some(p => p.errors.length);
    if (hasErrors) {
      if (!confirm('Some entries have validation errors. Import only valid entries? Press Cancel to abort.')) return;
    }
    // Build CSV/JSON blob to send for server import: We will construct a JSON array of the valid ones
    const toImport = importPreviewEntries.filter(p=>p.errors.length===0).map(p=>p.item);
    if (toImport.length === 0) {
      alert('No valid entries to import');
      return;
    }
    // Send as JSON file via FormData
    const blob = new Blob([JSON.stringify(toImport, null, 2)], { type: 'application/json' });
    const fd = new FormData();
    fd.append('file', blob, 'import.json');
    confirmImportBtn.disabled = true;
    try {
      const resp = await fetch('/api/import', { method: 'POST', body: fd }).then(r=>r.json());
      alert('Imported: ' + (resp.imported || 0));
      importPreviewModal.classList.add('hidden');
      await refresh();
    } catch (e) {
      alert('Import error: ' + e.message);
    } finally {
      confirmImportBtn.disabled = false;
    }
  });

  // Search and view
  searchEl.addEventListener('input', debounce(refresh, 300));
  viewSel.addEventListener('change', () => {
    document.getElementById('gallery').classList.toggle('hidden', viewSel.value !== 'gallery');
    document.getElementById('table').classList.toggle('hidden', viewSel.value !== 'table');
  });

  // Basic gallery render (kept simple)
  async function renderGallery(books) {
    galleryEl.innerHTML = '';
    for (const b of books) {
      const div = document.createElement('div');
      div.className = 'card';
      const img = document.createElement('img');
      img.src = b.cover || '/placeholder.png';
      img.alt = b.title || 'No title';
      const title = document.createElement('h4'); title.textContent = b.title || '(no title)';
      const p = document.createElement('p'); p.textContent = (b.authors || []).join(', ');
      const loc = document.createElement('p'); loc.textContent = b.location || '';
      const actions = document.createElement('div'); actions.style.marginTop = '6px';
      const editBtn = document.createElement('button'); editBtn.textContent = 'Edit'; editBtn.addEventListener('click', () => showModal(b));
      const delBtn = document.createElement('button'); delBtn.textContent = 'Delete'; delBtn.addEventListener('click', async () => {
        if (confirm('Delete?')) {
          await api.delete(b.id);
          await refresh();
        }
      });
      actions.appendChild(editBtn); actions.appendChild(delBtn);
      div.appendChild(img); div.appendChild(title); div.appendChild(p); div.appendChild(loc); div.appendChild(actions);
      galleryEl.appendChild(div);
    }
  }

  async function renderTable(books) {
    tableEl.innerHTML = '';
    const table = document.createElement('table');
    table.className = 'table';
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    ['Cover','Title','Authors','ISBN','Location','Actions'].forEach(h=>{
      const th = document.createElement('th'); th.textContent = h; headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);
    const tbody = document.createElement('tbody');
    for (const b of books) {
      const tr = document.createElement('tr');
      const tdCover = document.createElement('td');
      const img = document.createElement('img'); img.src = b.cover || '/placeholder.png'; img.style.width = '60px';
      tdCover.appendChild(img); tr.appendChild(tdCover);
      const tdTitle = document.createElement('td'); tdTitle.textContent = b.title || ''; tr.appendChild(tdTitle);
      const tdAuth = document.createElement('td'); tdAuth.textContent = (b.authors||[]).join(', '); tr.appendChild(tdAuth);
      const tdIsbn = document.createElement('td'); tdIsbn.textContent = b.isbn || ''; tr.appendChild(tdIsbn);
      const tdLoc = document.createElement('td'); tdLoc.textContent = b.location || ''; tr.appendChild(tdLoc);
      const tdActions = document.createElement('td');
      const editBtn = document.createElement('button'); editBtn.textContent = 'Edit'; editBtn.addEventListener('click', ()=>showModal(b));
      const delBtn = document.createElement('button'); delBtn.textContent = 'Delete'; delBtn.addEventListener('click', async ()=>{ if (confirm('Delete?')){ await api.delete(b.id); await refresh(); }});
      tdActions.appendChild(editBtn); tdActions.appendChild(delBtn);
      tr.appendChild(tdActions);
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    tableEl.appendChild(table);
  }

  async function refresh() {
    const q = searchEl.value.trim();
    const books = await api.list(q || undefined);
    await renderGallery(books);
    await renderTable(books);
  }

  // Debounce util
  function debounce(fn, t) { let tim; return (...a) => { clearTimeout(tim); tim = setTimeout(()=>fn(...a), t); }; }

  // Barcode scanner UI (unchanged)
  const scannerModal = document.getElementById('scanner');
  const scannerArea = document.getElementById('scanner-area');
  const closeScanner = document.getElementById('closeScanner');

  scanBtn.addEventListener('click', () => {
    scannerModal.classList.remove('hidden');
    startScanner();
  });
  closeScanner.addEventListener('click', () => {
    stopScanner();
    scannerModal.classList.add('hidden');
  });

  let scannerRunning = false;
  function startScanner() {
    if (scannerRunning) return;
    scannerRunning = true;
    Quagga.init({
      inputStream: {
        name: "Live",
        type: "LiveStream",
        target: scannerArea,
        constraints: { facingMode: "environment" }
      },
      decoder: {
        readers: ["ean_reader","ean_8_reader","upc_reader","upc_e_reader","code_128_reader"]
      }
    }, function (err) {
      if (err) {
        console.error(err);
        alert('Camera init error: ' + err.message);
        return;
      }
      Quagga.start();
    });
    Quagga.onDetected(d => {
      const code = d.codeResult.code;
      stopScanner();
      scannerModal.classList.add('hidden');
      showModal({ isbn: code, title: '', authors: [], location: '' });
      isbnEl.value = code;
      fetchMetaBtn.click();
    });
  }
  function stopScanner() {
    if (scannerRunning) {
      Quagga.stop();
      Quagga.offDetected();
      scannerRunning = false;
      scannerArea.innerHTML = '';
    }
  }

  // Frontend metadata fetch using OpenLibrary/GoogleBooks for quick UI response
  async function fetchMetaByISBN(isbn) {
    if (!isbn) return null;
    try {
      const ol = await fetch(`https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&format=json&jscmd=data`).then(r=>r.json());
      const key = `ISBN:${isbn}`;
      if (ol && ol[key]) {
        const it = ol[key];
        return { title: it.title, authors: (it.authors||[]).map(a=>a.name), cover: (it.cover && (it.cover.large||it.cover.medium||it.cover.small)) || `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg` };
      }
    } catch (e) {}
    try {
      const gb = await fetch(`https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}`).then(r=>r.json());
      if (gb.totalItems > 0 && gb.items && gb.items.length>0) {
        const v = gb.items[0].volumeInfo;
        return { title: v.title, authors: v.authors || [], cover: (v.imageLinks && v.imageLinks.thumbnail) || `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg` };
      }
    } catch(e) {}
    return null;
  }

  // initial refresh
  await refresh();

})();