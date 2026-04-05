(async function () {
  var PLACEHOLDER = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='240'%3E%3Crect width='180' height='240' fill='%23e2e8f0'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='%2394a3b8' font-family='sans-serif' font-size='14'%3ENo Cover%3C/text%3E%3C/svg%3E";

  function coverSrc(url) {
    if (!url) return PLACEHOLDER;
    if (url.startsWith('data:')) return url;
    return url.replace(/^http:\/\//, 'https://');
  }
  function onImgError(e) { e.target.src = PLACEHOLDER; }

  // --- ISBN checksum validation ---
  function validateISBN13(code) {
    if (!code || code.length !== 13 || !/^\d{13}$/.test(code)) return false;
    var sum = 0;
    for (var i = 0; i < 12; i++) sum += parseInt(code[i], 10) * (i % 2 === 0 ? 1 : 3);
    return (10 - (sum % 10)) % 10 === parseInt(code[12], 10);
  }
  function validateISBN10(code) {
    if (!code || code.length !== 10 || !/^[\dXx]{10}$/.test(code)) return false;
    var sum = 0;
    for (var i = 0; i < 9; i++) sum += parseInt(code[i], 10) * (i + 1);
    var check = sum % 11;
    var last = code[9].toUpperCase() === 'X' ? 10 : parseInt(code[9], 10);
    return check === last;
  }
  function validateISBNChecksum(raw) {
    var clean = raw.replace(/[\s\-]/g, '');
    if (clean.length === 13) return validateISBN13(clean);
    if (clean.length === 10) return validateISBN10(clean);
    return false;
  }
  function isCompleteISBN(raw) {
    var clean = raw.replace(/[\s\-]/g, '');
    return clean.length === 10 || clean.length === 13;
  }
  function fixISBN10CheckDigit(raw) {
    var digits = raw.replace(/[\s\-]/g, '');
    if (/^\d{9}$/.test(digits)) {
      var sum = 0;
      for (var i = 0; i < 9; i++) sum += parseInt(digits[i], 10) * (i + 1);
      var check = sum % 11;
      return digits + (check === 10 ? 'X' : String(check));
    }
    if (/^\d{9}[\dXx]$/.test(digits) && !validateISBN10(digits)) {
      return fixISBN10CheckDigit(digits.slice(0, 9));
    }
    return null;
  }

  // --- Robust API response handler ---
  function apiResponse(r) {
    return r.text().then(function (text) {
      var data;
      try { data = JSON.parse(text); } catch (e) {
        throw new Error('Server returned invalid response (HTTP ' + r.status + ')');
      }
      if (!r.ok) throw new Error(data.error || ('Server error: HTTP ' + r.status));
      return data;
    });
  }

  // --- API ---
  var api = {
    list: function (q, field) { return fetch('/api/books' + (q ? '?q=' + encodeURIComponent(q) + (field ? '&field=' + field : '') : '')).then(apiResponse); },
    get: function (id) { return fetch('/api/books/' + id).then(apiResponse); },
    create: function (b) { return fetch('/api/books', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }).then(apiResponse); },
    update: function (id, b) { return fetch('/api/books/' + id, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }).then(apiResponse); },
    del: function (id) { return fetch('/api/books/' + id, { method: 'DELETE' }).then(apiResponse); },
    bulkDelete: function (ids) { return fetch('/api/books/bulk-delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: ids }) }).then(apiResponse); },
    bulkUpdate: function (ids, upd) { return fetch('/api/books/bulk-update', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: ids, update: upd }) }).then(apiResponse); },
    fetchMeta: function (isbn) { return fetch('/api/metadata/' + encodeURIComponent(isbn)).then(apiResponse); },
    getSettings: function () { return fetch('/api/settings').then(apiResponse); },
    saveSettings: function (s) { return fetch('/api/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(s) }).then(apiResponse); },
    clearLibrary: function () { return fetch('/api/clear', { method: 'POST' }).then(apiResponse); },
    importBooks: function (books) {
      var blob = new Blob([JSON.stringify(books)], { type: 'application/json' });
      var fd = new FormData();
      fd.append('file', blob, 'import.json');
      return fetch('/api/import', { method: 'POST', body: fd }).then(apiResponse);
    },
    uploadCover: function (file) {
      var fd = new FormData();
      fd.append('cover', file);
      return fetch('/api/upload-cover', { method: 'POST', body: fd }).then(apiResponse);
    }
  };

  // --- Elements ---
  var searchEl = document.getElementById('search');
  var viewSel = document.getElementById('view');
  var locationFilter = document.getElementById('locationFilter');
  var galleryEl = document.getElementById('gallery');
  var tableEl = document.getElementById('table');
  var emptyEl = document.getElementById('empty');
  var addBtn = document.getElementById('addBtn');
  var importFile = document.getElementById('importFile');
  var scanBtn = document.getElementById('scanBtn');

  var modal = document.getElementById('modal');
  var modalTitle = document.getElementById('modal-title');
  var isbnEl = document.getElementById('isbn');
  var isbnStatus = document.getElementById('isbn-status');
  var titleEl = document.getElementById('title');
  var authorsEl = document.getElementById('authors');
  var locationEl = document.getElementById('location');
  var coverEl = document.getElementById('cover');
  var coverUpload = document.getElementById('coverUpload');
  var coverStatus = document.getElementById('coverStatus');
  var notesEl = document.getElementById('notes');
  var customFieldsArea = document.getElementById('customFieldsArea');
  var saveBtn = document.getElementById('saveBtn');
  var cancelBtn = document.getElementById('cancelBtn');
  var fetchMetaBtn = document.getElementById('fetchMeta');
  var modalError = document.getElementById('modal-error');

  var detailModal = document.getElementById('detail');
  var detailCover = document.getElementById('detail-cover');
  var detailTitle = document.getElementById('detail-title');
  var detailAuthors = document.getElementById('detail-authors');
  var detailIsbn = document.getElementById('detail-isbn');
  var detailLocation = document.getElementById('detail-location');
  var detailPublisher = document.getElementById('detail-publisher');
  var detailPublishDate = document.getElementById('detail-publishDate');
  var detailPages = document.getElementById('detail-pages');
  var detailNotes = document.getElementById('detail-notes');
  var detailAdded = document.getElementById('detail-added');
  var detailCustomFields = document.getElementById('detail-custom-fields');
  var detailEditBtn = document.getElementById('detailEditBtn');
  var detailDeleteBtn = document.getElementById('detailDeleteBtn');
  var detailCloseBtn = document.getElementById('detailCloseBtn');

  var importPreviewModal = document.getElementById('importPreview');
  var previewArea = document.getElementById('previewArea');
  var importErrors = document.getElementById('importErrors');
  var confirmImportBtn = document.getElementById('confirmImportBtn');
  var cancelImportBtn = document.getElementById('cancelImportBtn');
  var importLocationEl = document.getElementById('importLocation');
  var fetchAllMetaBtn = document.getElementById('fetchAllMetaBtn');
  var fetchAllStatus = document.getElementById('fetchAllStatus');
  var importProgress = document.getElementById('importProgress');
  var importProgressFill = document.getElementById('importProgressFill');
  var importProgressText = document.getElementById('importProgressText');

  var settingsBtn = document.getElementById('settingsBtn');
  var settingsModal = document.getElementById('settingsModal');
  var settAutoFetch = document.getElementById('settAutoFetch');
  var settWarnDuplicate = document.getElementById('settWarnDuplicate');
  var clearLibraryBtn = document.getElementById('clearLibraryBtn');
  var settingsCloseBtn = document.getElementById('settingsCloseBtn');
  var customFieldsList = document.getElementById('customFieldsList');
  var newFieldName = document.getElementById('newFieldName');
  var addFieldBtn = document.getElementById('addFieldBtn');

  var selectionBar = document.getElementById('selectionBar');
  var selectionCount = document.getElementById('selectionCount');
  var selAll = document.getElementById('selAll');
  var selSetLocation = document.getElementById('selSetLocation');
  var selDelete = document.getElementById('selDelete');
  var selClear = document.getElementById('selClear');

  var modalCoverPreview = document.getElementById('modal-cover-preview');
  var modalPreviewTitle = document.getElementById('modal-preview-title');
  var modalPreviewAuthors = document.getElementById('modal-preview-authors');
  var modalPreviewIsbn = document.getElementById('modal-preview-isbn');

  var editingId = null;
  var importPreviewEntries = [];
  var currentDetailBook = null;
  var allBooks = [];
  var settings = { autoFetchMetadata: true, warnDuplicateIsbn: true, customFields: [] };
  var isbnFetchTimeout = null;
  var selectedIds = new Set();
  var importCancelled = false;
  var focusedIndex = -1;

  // Load settings
  try {
    settings = await api.getSettings();
    if (!settings.customFields) settings.customFields = [];
    settAutoFetch.checked = settings.autoFetchMetadata !== false;
    settWarnDuplicate.checked = settings.warnDuplicateIsbn !== false;
  } catch (e) { /* defaults */ }

  // Check storage health
  try {
    var health = await fetch('/api/health').then(apiResponse);
    if (!health.writable) {
      var banner = document.createElement('div');
      banner.id = 'storageBanner';
      banner.className = 'storage-banner';
      banner.textContent = 'Warning: Data directory is not writable. Changes will not be saved. Check file permissions on the server.';
      document.getElementById('app').prepend(banner);
    }
  } catch (e) { /* ignore */ }

  // --- Custom fields ---
  function renderCustomFieldsSettings() {
    customFieldsList.innerHTML = '';
    (settings.customFields || []).forEach(function (f, idx) {
      var row = document.createElement('div');
      row.className = 'custom-field-row';
      var span = document.createElement('span');
      span.textContent = f.label || f.name;
      var btn = document.createElement('button');
      btn.className = 'btn btn-danger';
      btn.textContent = 'Remove';
      btn.addEventListener('click', function () {
        settings.customFields.splice(idx, 1);
        renderCustomFieldsSettings();
      });
      row.appendChild(span);
      row.appendChild(btn);
      customFieldsList.appendChild(row);
    });
  }

  addFieldBtn.addEventListener('click', function () {
    var name = newFieldName.value.trim();
    if (!name) return;
    var key = name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    if (!key) return;
    if (settings.customFields.find(function (f) { return f.name === key; })) return;
    settings.customFields.push({ name: key, label: name });
    newFieldName.value = '';
    renderCustomFieldsSettings();
  });

  function renderCustomFieldsInModal(book) {
    customFieldsArea.innerHTML = '';
    (settings.customFields || []).forEach(function (f) {
      var label = document.createElement('label');
      label.textContent = f.label || f.name;
      var input = document.createElement('input');
      input.dataset.customField = f.name;
      input.value = (book && book[f.name]) || '';
      label.appendChild(input);
      customFieldsArea.appendChild(label);
    });
  }

  function renderCustomFieldsInDetail(book) {
    detailCustomFields.innerHTML = '';
    (settings.customFields || []).forEach(function (f) {
      if (book[f.name]) {
        var dt = document.createElement('dt');
        dt.textContent = f.label || f.name;
        var dd = document.createElement('dd');
        dd.textContent = book[f.name];
        detailCustomFields.appendChild(dt);
        detailCustomFields.appendChild(dd);
      }
    });
  }

  function getCustomFieldValues() {
    var vals = {};
    customFieldsArea.querySelectorAll('[data-custom-field]').forEach(function (input) {
      var v = input.value.trim();
      if (v) vals[input.dataset.customField] = v;
    });
    return vals;
  }

  // --- Cover upload ---
  coverUpload.addEventListener('change', async function () {
    var file = coverUpload.files[0];
    if (!file) return;
    try {
      var result = await api.uploadCover(file);
      if (result.cover) {
        coverEl.value = result.cover;
        coverStatus.textContent = 'Cover uploaded';
        coverStatus.style.color = '#16a34a';
        updateModalPreview();
      }
    } catch (e) { alert('Upload failed: ' + e.message); }
    coverUpload.value = '';
  });

  // --- Modal preview ---
  function updateModalPreview() {
    modalCoverPreview.src = coverSrc(coverEl.value);
    modalCoverPreview.onerror = onImgError;
    modalPreviewTitle.textContent = titleEl.value.trim() || '';
    modalPreviewAuthors.textContent = authorsEl.value.trim() || '';
    modalPreviewIsbn.textContent = isbnEl.value.trim() || '';
  }
  [titleEl, authorsEl].forEach(function (el) { el.addEventListener('input', updateModalPreview); });

  // --- ISBN input validation + auto-fetch ---
  function updateIsbnStatus() {
    var raw = isbnEl.value.trim();
    if (!raw || !isCompleteISBN(raw)) {
      isbnStatus.textContent = '';
      isbnStatus.className = 'isbn-status';
      return;
    }
    if (validateISBNChecksum(raw)) {
      isbnStatus.textContent = 'Valid ISBN';
      isbnStatus.className = 'isbn-status valid';
    } else {
      var clean = raw.replace(/[\s\-]/g, '');
      if (clean.length === 10) {
        var fixed = fixISBN10CheckDigit(clean);
        if (fixed && validateISBN10(fixed)) {
          isbnStatus.textContent = 'Fixed: ' + fixed;
          isbnStatus.className = 'isbn-status valid';
          isbnEl.value = fixed;
          return;
        }
      }
      isbnStatus.textContent = 'Invalid checksum';
      isbnStatus.className = 'isbn-status invalid';
    }
  }

  isbnEl.addEventListener('input', function () {
    updateModalPreview();
    updateIsbnStatus();
    if (isbnFetchTimeout) clearTimeout(isbnFetchTimeout);
    var raw = isbnEl.value.trim();
    if (settings.autoFetchMetadata && isCompleteISBN(raw) && validateISBNChecksum(raw) && !titleEl.value.trim()) {
      isbnFetchTimeout = setTimeout(function () { fetchMetaBtn.click(); }, 500);
    }
  });

  // --- Add / Edit modal ---
  function showModal(edit) {
    modal.classList.remove('hidden');
    modalError.classList.add('hidden');
    if (edit) {
      modalTitle.textContent = 'Edit Book';
      isbnEl.value = edit.isbn || '';
      titleEl.value = edit.title || '';
      authorsEl.value = (edit.authors || []).join(', ');
      locationEl.value = edit.location || '';
      coverEl.value = edit.cover || '';
      notesEl.value = edit.notes || '';
      editingId = edit.id;
      coverStatus.textContent = edit.cover ? 'Cover set' : '';
      coverStatus.style.color = '#64748b';
    } else {
      modalTitle.textContent = 'Add Book';
      isbnEl.value = ''; titleEl.value = ''; authorsEl.value = '';
      locationEl.value = ''; coverEl.value = ''; notesEl.value = '';
      editingId = null;
      coverStatus.textContent = '';
    }
    renderCustomFieldsInModal(edit || {});
    updateModalPreview();
    updateIsbnStatus();
    // Focus ISBN field for quick entry
    setTimeout(function () { isbnEl.focus(); }, 50);
  }
  function hideModal() { modal.classList.add('hidden'); }

  function validateBook(b) {
    var errors = [];
    if (!b.title && !b.isbn) errors.push('Either title or ISBN is required.');
    if (b.isbn && !/^[0-9Xx\- ]+$/.test(b.isbn)) errors.push('ISBN contains invalid characters.');
    return errors;
  }

  fetchMetaBtn.addEventListener('click', async function () {
    var isbn = isbnEl.value.trim();
    if (!isbn) return alert('ISBN required');
    fetchMetaBtn.disabled = true;
    fetchMetaBtn.textContent = 'Fetching...';
    try {
      var m = await api.fetchMeta(isbn);
      if (m && m.title) {
        titleEl.value = m.title;
        if (m.authors) authorsEl.value = m.authors.join(', ');
        if (m.cover) {
          coverEl.value = m.cover;
          coverStatus.textContent = 'Cover found';
          coverStatus.style.color = '#16a34a';
        }
        updateModalPreview();
      } else {
        alert('No metadata found');
      }
    } catch (e) {
      alert('Fetch error: ' + e.message);
    }
    fetchMetaBtn.disabled = false;
    fetchMetaBtn.textContent = 'Fetch Metadata';
  });

  saveBtn.addEventListener('click', async function () {
    var book = {
      isbn: isbnEl.value.trim() || undefined,
      title: titleEl.value.trim() || undefined,
      authors: authorsEl.value.split(',').map(function (s) { return s.trim(); }).filter(Boolean),
      location: locationEl.value.trim() || undefined,
      cover: coverEl.value || undefined,
      notes: notesEl.value.trim() || undefined
    };
    var customVals = getCustomFieldValues();
    Object.keys(customVals).forEach(function (k) { book[k] = customVals[k]; });
    var errors = validateBook(book);
    if (errors.length) {
      modalError.textContent = errors.join(' ');
      modalError.classList.remove('hidden');
      return;
    }
    // Duplicate ISBN check
    if (!editingId && book.isbn && settings.warnDuplicateIsbn !== false) {
      try {
        var existing = await fetch('/api/books/by-isbn/' + encodeURIComponent(book.isbn)).then(apiResponse);
        if (existing && existing.length > 0) {
          var names = existing.map(function (b) { return b.title || b.isbn; }).join(', ');
          if (!confirm('A book with this ISBN already exists:\n' + names + '\n\nAdd anyway?')) {
            return;
          }
        }
      } catch (e) { /* ignore check errors */ }
    }
    saveBtn.disabled = true;
    try {
      if (editingId) { await api.update(editingId, book); }
      else { await api.create(book); }
      hideModal();
    } catch (e) {
      alert('Save error: ' + e.message);
      saveBtn.disabled = false;
      return;
    }
    saveBtn.disabled = false;
    try { await refresh(); } catch (e) { console.error('Refresh error:', e); }
  });
  cancelBtn.addEventListener('click', hideModal);
  addBtn.addEventListener('click', function () { showModal(null); });

  // --- Detail modal ---
  function showDetail(book) {
    currentDetailBook = book;
    detailCover.src = coverSrc(book.cover);
    detailCover.onerror = onImgError;
    detailTitle.textContent = book.title || '(no title)';
    detailAuthors.textContent = (book.authors || []).join(', ') || 'Unknown author';
    detailIsbn.textContent = book.isbn || '-';
    detailLocation.textContent = book.location || '-';
    detailPublisher.textContent = book.publisher || '-';
    detailPublishDate.textContent = book.publishDate || '-';
    detailPages.textContent = book.pages || '-';
    detailNotes.textContent = book.notes || '-';
    detailAdded.textContent = book.created_at ? new Date(book.created_at).toLocaleDateString() : '-';
    renderCustomFieldsInDetail(book);
    detailModal.classList.remove('hidden');
  }

  detailCloseBtn.addEventListener('click', function () { detailModal.classList.add('hidden'); });
  detailEditBtn.addEventListener('click', function () { detailModal.classList.add('hidden'); showModal(currentDetailBook); });
  detailDeleteBtn.addEventListener('click', async function () {
    if (currentDetailBook && confirm('Delete this book?')) {
      await api.del(currentDetailBook.id);
      detailModal.classList.add('hidden');
      await refresh();
    }
  });

  // --- Multi-select ---
  function updateSelectionBar() {
    var count = selectedIds.size;
    if (count > 0) {
      selectionBar.classList.remove('hidden');
      selectionCount.textContent = count + ' selected';
    } else {
      selectionBar.classList.add('hidden');
    }
    document.querySelectorAll('.card-checkbox, .row-checkbox').forEach(function (cb) {
      cb.checked = selectedIds.has(cb.dataset.id);
    });
    document.querySelectorAll('.card').forEach(function (card) {
      card.classList.toggle('selected', selectedIds.has(card.dataset.id));
    });
    document.querySelectorAll('.data-table tbody tr').forEach(function (tr) {
      tr.classList.toggle('selected', selectedIds.has(tr.dataset.id));
    });
    var selectAllCb = document.querySelector('.select-all');
    if (selectAllCb) {
      var filtered = getFilteredBooks();
      selectAllCb.checked = filtered.length > 0 && filtered.every(function (b) { return selectedIds.has(b.id); });
    }
  }

  function toggleSelect(id) {
    if (selectedIds.has(id)) selectedIds.delete(id);
    else selectedIds.add(id);
    updateSelectionBar();
  }

  selAll.addEventListener('click', function () {
    var filtered = getFilteredBooks();
    var allSelected = filtered.length > 0 && filtered.every(function (b) { return selectedIds.has(b.id); });
    if (allSelected) {
      filtered.forEach(function (b) { selectedIds.delete(b.id); });
    } else {
      filtered.forEach(function (b) { selectedIds.add(b.id); });
    }
    updateSelectionBar();
  });

  selClear.addEventListener('click', function () {
    selectedIds.clear();
    updateSelectionBar();
  });

  selDelete.addEventListener('click', async function () {
    if (!selectedIds.size) return;
    if (!confirm('Delete ' + selectedIds.size + ' books?')) return;
    await api.bulkDelete(Array.from(selectedIds));
    selectedIds.clear();
    await refresh();
  });

  selSetLocation.addEventListener('click', async function () {
    var loc = prompt('Set location for selected books:');
    if (loc === null) return;
    await api.bulkUpdate(Array.from(selectedIds), { location: loc });
    selectedIds.clear();
    await refresh();
  });

  // --- Import ---
  function renderImportPreview() {
    previewArea.innerHTML = '';
    var table = document.createElement('table');
    table.className = 'import-table';
    var thead = document.createElement('thead');
    var hr = document.createElement('tr');
    ['#', 'Title', 'Authors', 'ISBN', 'Status'].forEach(function (h) {
      var th = document.createElement('th'); th.textContent = h; hr.appendChild(th);
    });
    thead.appendChild(hr);
    table.appendChild(thead);
    var tbody = document.createElement('tbody');
    for (var p of importPreviewEntries) {
      var tr = document.createElement('tr');
      var vals = [p.row, p.item.title || '', (p.item.authors || []).join(', '), p.item.isbn || ''];
      vals.forEach(function (val) { var td = document.createElement('td'); td.textContent = val; tr.appendChild(td); });
      var tdStatus = document.createElement('td');
      if (p.errors.length) { tdStatus.textContent = p.errors.join('; '); tdStatus.className = 'row-error'; }
      else if (p.fetching) { tdStatus.textContent = 'Fetching...'; tdStatus.className = 'fetching'; }
      else if (p.imported) { tdStatus.textContent = 'Imported'; tdStatus.style.color = '#2563eb'; }
      else if (p.item.title) { tdStatus.textContent = 'Ready'; tdStatus.style.color = '#16a34a'; }
      else { tdStatus.textContent = 'ISBN only'; tdStatus.style.color = '#64748b'; }
      tr.appendChild(tdStatus);
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    previewArea.appendChild(table);
  }

  importFile.addEventListener('change', async function () {
    var f = importFile.files[0];
    if (!f) return;
    var text = await f.text();
    var entries = [];
    var fn = f.name || '';
    try {
      if (fn.endsWith('.json') || text.trim().startsWith('[')) {
        entries = JSON.parse(text);
      } else if (fn.endsWith('.txt')) {
        var lines = text.trim().split(/\r?\n/).map(function (l) { return l.trim(); }).filter(Boolean);
        entries = lines.map(function (isbn) { return { isbn: isbn }; });
      } else {
        var parsed = Papa.parse(text, { header: true, dynamicTyping: false, skipEmptyLines: true });
        if (parsed.errors && parsed.errors.length) {
          importErrors.textContent = 'CSV parse errors: ' + parsed.errors.map(function (e) { return e.message; }).join('; ');
          return;
        }
        entries = parsed.data;
      }
    } catch (e) { importErrors.textContent = 'Parse error: ' + e.message; return; }

    importErrors.textContent = '';
    importLocationEl.value = '';
    fetchAllStatus.textContent = '';
    importProgress.classList.add('hidden');
    importCancelled = false;
    importPreviewEntries = entries.map(function (r, idx) {
      var item = {
        title: r.title || r.Title || r.name || r.Name || undefined,
        authors: (r.Authors || r.authors || r.author || r.Author || '').toString().split(',').map(function (s) { return s.trim(); }).filter(Boolean),
        isbn: (r.isbn || r.ISBN || '').toString(),
        location: r.location || r.Location || '',
        notes: r.notes || ''
      };
      return { item: item, errors: validateBook(item), row: idx + 1, fetching: false, imported: false };
    });
    renderImportPreview();
    importPreviewModal.classList.remove('hidden');
    importFile.value = '';
  });

  // Fetch with retry on rate-limit (429)
  function fetchMetaWithRetry(isbn, retries) {
    retries = retries || 0;
    return api.fetchMeta(isbn).catch(function (err) {
      if (retries < 3 && err.message && err.message.indexOf('429') !== -1) {
        var delay = (retries + 1) * 2000;
        return new Promise(function (resolve) { setTimeout(resolve, delay); })
          .then(function () { return fetchMetaWithRetry(isbn, retries + 1); });
      }
      throw err;
    });
  }

  fetchAllMetaBtn.addEventListener('click', async function () {
    var isbnEntries = importPreviewEntries.filter(function (p) { return p.item.isbn && !p.item.title; });
    if (!isbnEntries.length) { fetchAllStatus.textContent = 'No ISBNs to fetch'; return; }
    fetchAllMetaBtn.disabled = true;
    var succeeded = 0;
    var failed = 0;
    var processed = 0;
    var total = isbnEntries.length;
    fetchAllStatus.textContent = 'Fetching 0/' + total + '...';

    for (var i = 0; i < isbnEntries.length; i += 3) {
      if (importCancelled) break;
      var batch = isbnEntries.slice(i, i + 3);
      batch.forEach(function (p) { p.fetching = true; });
      renderImportPreview();
      var results = await Promise.allSettled(batch.map(function (p) {
        return fetchMetaWithRetry(p.item.isbn);
      }));
      for (var j = 0; j < batch.length; j++) {
        var p = batch[j];
        p.fetching = false;
        if (results[j].status === 'fulfilled') {
          var m = results[j].value;
          if (m && m.title) {
            p.item.title = m.title;
            if (m.authors && m.authors.length) p.item.authors = m.authors;
            if (m.cover) p.item.cover = m.cover;
            succeeded++;
          }
        } else {
          failed++;
        }
        p.errors = validateBook(p.item);
        processed++;
      }
      fetchAllStatus.textContent = 'Fetching ' + processed + '/' + total + '...';
      renderImportPreview();
    }
    fetchAllMetaBtn.disabled = false;
    var msg = 'Done! ' + succeeded + '/' + total + ' fetched.';
    if (failed > 0) msg += ' ' + failed + ' failed.';
    fetchAllStatus.textContent = msg;
  });

  cancelImportBtn.addEventListener('click', function () {
    importCancelled = true;
    importPreviewModal.classList.add('hidden');
  });

  confirmImportBtn.addEventListener('click', async function () {
    importCancelled = false;
    var bulkLoc = importLocationEl.value.trim();
    if (bulkLoc) {
      importPreviewEntries.forEach(function (p) {
        if (!p.item.location) p.item.location = bulkLoc;
      });
    }
    var valid = importPreviewEntries.filter(function (p) { return p.errors.length === 0 && !p.imported; });
    var invalid = importPreviewEntries.filter(function (p) { return p.errors.length > 0; });
    if (invalid.length > 0) {
      if (!confirm('Skipping ' + invalid.length + ' invalid entries. Import ' + valid.length + ' valid entries?')) return;
    }
    if (!valid.length) { alert('No valid entries to import'); return; }

    confirmImportBtn.disabled = true;
    cancelImportBtn.disabled = true;
    importProgress.classList.remove('hidden');

    var total = valid.length;
    var done = 0;
    var batchSize = 10;
    for (var i = 0; i < valid.length; i += batchSize) {
      if (importCancelled) break;
      var batch = valid.slice(i, i + batchSize);
      var items = batch.map(function (p) { return p.item; });
      try {
        await api.importBooks(items);
        batch.forEach(function (p) { p.imported = true; });
      } catch (e) {
        importErrors.textContent = 'Import error at batch ' + (Math.floor(i / batchSize) + 1) + ': ' + e.message;
        break;
      }
      done += batch.length;
      importProgressFill.style.width = Math.round(done / total * 100) + '%';
      importProgressText.textContent = done + ' / ' + total;
      renderImportPreview();
    }
    confirmImportBtn.disabled = false;
    cancelImportBtn.disabled = false;
    if (done === total) {
      importPreviewModal.classList.add('hidden');
      await refresh();
    } else {
      renderImportPreview();
      await refresh();
    }
  });

  // --- Settings ---
  settingsBtn.addEventListener('click', function () {
    settAutoFetch.checked = settings.autoFetchMetadata !== false;
    settWarnDuplicate.checked = settings.warnDuplicateIsbn !== false;
    renderCustomFieldsSettings();
    settingsModal.classList.remove('hidden');
  });

  settingsCloseBtn.addEventListener('click', async function () {
    settings.autoFetchMetadata = settAutoFetch.checked;
    settings.warnDuplicateIsbn = settWarnDuplicate.checked;
    try {
      await api.saveSettings(settings);
    } catch (e) {
      console.error('Settings save error:', e);
    }
    settingsModal.classList.add('hidden');
  });

  clearLibraryBtn.addEventListener('click', async function () {
    if (!confirm('This will permanently delete ALL books. Are you sure?')) return;
    if (!confirm('Really? This cannot be undone!')) return;
    await api.clearLibrary();
    settingsModal.classList.add('hidden');
    selectedIds.clear();
    await refresh();
  });

  // --- Mobile sidebar ---
  var menuToggle = document.getElementById('menuToggle');
  var sidebar = document.getElementById('sidebar');
  var sidebarOverlay = document.getElementById('sidebarOverlay');
  var sidebarClose = document.getElementById('sidebarClose');
  var viewMobile = document.getElementById('viewMobile');
  var locationFilterMobile = document.getElementById('locationFilterMobile');
  var importFileMobile = document.getElementById('importFileMobile');
  var settingsBtnMobile = document.getElementById('settingsBtnMobile');

  function openSidebar() { sidebar.classList.remove('hidden'); sidebarOverlay.classList.remove('hidden'); }
  function closeSidebar() { sidebar.classList.add('hidden'); sidebarOverlay.classList.add('hidden'); }
  if (menuToggle) menuToggle.addEventListener('click', openSidebar);
  if (sidebarClose) sidebarClose.addEventListener('click', closeSidebar);
  if (sidebarOverlay) sidebarOverlay.addEventListener('click', closeSidebar);

  // Sync mobile sidebar controls with main controls
  if (viewMobile) viewMobile.addEventListener('change', function () {
    viewSel.value = viewMobile.value;
    viewSel.dispatchEvent(new Event('change'));
    closeSidebar();
  });
  if (locationFilterMobile) locationFilterMobile.addEventListener('change', function () {
    locationFilter.value = locationFilterMobile.value;
    locationFilter.dispatchEvent(new Event('change'));
    closeSidebar();
  });
  if (importFileMobile) importFileMobile.addEventListener('change', function () {
    // Copy file to main import input and trigger
    var files = importFileMobile.files;
    if (files.length) {
      var dt = new DataTransfer();
      dt.items.add(files[0]);
      importFile.files = dt.files;
      importFile.dispatchEvent(new Event('change'));
    }
    importFileMobile.value = '';
    closeSidebar();
  });
  if (settingsBtnMobile) settingsBtnMobile.addEventListener('click', function () {
    closeSidebar();
    settingsBtn.click();
  });

  // --- Search, filter, view toggle ---
  searchEl.addEventListener('input', debounce(refresh, 300));
  locationFilter.addEventListener('change', function () { renderFiltered(); });
  viewSel.addEventListener('change', function () {
    galleryEl.classList.toggle('hidden', viewSel.value !== 'gallery');
    tableEl.classList.toggle('hidden', viewSel.value !== 'table');
  });

  // --- Rendering ---
  function getFilteredBooks() {
    var loc = locationFilter.value;
    if (!loc) return allBooks;
    return allBooks.filter(function (b) { return b.location === loc; });
  }

  function updateLocationFilter(books) {
    var current = locationFilter.value;
    var locs = []; var seen = {};
    books.forEach(function (b) { if (b.location && !seen[b.location]) { seen[b.location] = true; locs.push(b.location); } });
    locs.sort();
    [locationFilter, locationFilterMobile].forEach(function (sel) {
      if (!sel) return;
      sel.innerHTML = '<option value="">All locations</option>';
      locs.forEach(function (l) {
        var opt = document.createElement('option');
        opt.value = l; opt.textContent = l;
        if (l === current) opt.selected = true;
        sel.appendChild(opt);
      });
    });
  }

  function renderFiltered() {
    var books = getFilteredBooks();
    focusedIndex = -1;
    emptyEl.classList.toggle('hidden', books.length > 0);
    galleryEl.classList.toggle('hidden', books.length === 0 || viewSel.value !== 'gallery');
    tableEl.classList.toggle('hidden', books.length === 0 || viewSel.value !== 'table');
    renderGallery(books);
    renderTable(books);
    updateSelectionBar();
  }

  function renderGallery(books) {
    galleryEl.innerHTML = '';
    for (var b of books) {
      var div = document.createElement('div');
      div.className = 'card' + (selectedIds.has(b.id) ? ' selected' : '');
      div.setAttribute('data-id', b.id);
      var cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.className = 'card-checkbox';
      cb.dataset.id = b.id;
      cb.checked = selectedIds.has(b.id);
      cb.addEventListener('click', (function (id) {
        return function (e) { e.stopPropagation(); toggleSelect(id); };
      })(b.id));
      div.appendChild(cb);
      var img = document.createElement('img');
      img.src = coverSrc(b.cover);
      img.alt = b.title || 'No title';
      img.loading = 'lazy';
      img.onerror = onImgError;
      var body = document.createElement('div');
      body.className = 'card-body';
      var h4 = document.createElement('h4'); h4.textContent = b.title || '(no title)';
      var auth = document.createElement('p'); auth.className = 'card-authors'; auth.textContent = (b.authors || []).join(', ');
      var loc = document.createElement('p'); loc.className = 'card-location'; loc.textContent = b.location || '';
      body.appendChild(h4); body.appendChild(auth); body.appendChild(loc);
      div.appendChild(img); div.appendChild(body);
      div.addEventListener('click', showDetail.bind(null, b));
      galleryEl.appendChild(div);
    }
  }

  function renderTable(books) {
    tableEl.innerHTML = '';
    var table = document.createElement('table');
    table.className = 'data-table';
    var thead = document.createElement('thead');
    var hr = document.createElement('tr');
    var thSel = document.createElement('th');
    var selAllCb = document.createElement('input');
    selAllCb.type = 'checkbox';
    selAllCb.className = 'select-all';
    selAllCb.addEventListener('click', function (e) {
      e.stopPropagation();
      var filtered = getFilteredBooks();
      if (selAllCb.checked) {
        filtered.forEach(function (b) { selectedIds.add(b.id); });
      } else {
        filtered.forEach(function (b) { selectedIds.delete(b.id); });
      }
      updateSelectionBar();
    });
    thSel.appendChild(selAllCb);
    hr.appendChild(thSel);
    ['Cover', 'Title', 'Authors', 'ISBN', 'Location'].forEach(function (h) {
      var th = document.createElement('th'); th.textContent = h; hr.appendChild(th);
    });
    thead.appendChild(hr);
    table.appendChild(thead);
    var tbody = document.createElement('tbody');
    for (var b of books) {
      var tr = document.createElement('tr');
      tr.setAttribute('data-id', b.id);
      if (selectedIds.has(b.id)) tr.classList.add('selected');
      var tdSel = document.createElement('td');
      var rowCb = document.createElement('input');
      rowCb.type = 'checkbox';
      rowCb.className = 'row-checkbox';
      rowCb.dataset.id = b.id;
      rowCb.checked = selectedIds.has(b.id);
      rowCb.addEventListener('click', (function (id) {
        return function (e) { e.stopPropagation(); toggleSelect(id); };
      })(b.id));
      tdSel.appendChild(rowCb);
      tr.appendChild(tdSel);
      var tdCover = document.createElement('td');
      var img = document.createElement('img');
      img.src = coverSrc(b.cover); img.loading = 'lazy'; img.onerror = onImgError;
      tdCover.appendChild(img); tr.appendChild(tdCover);
      var tdTitle = document.createElement('td'); tdTitle.textContent = b.title || ''; tr.appendChild(tdTitle);
      var tdAuth = document.createElement('td'); tdAuth.textContent = (b.authors || []).join(', '); tr.appendChild(tdAuth);
      var tdIsbn = document.createElement('td'); tdIsbn.textContent = b.isbn || ''; tr.appendChild(tdIsbn);
      var tdLoc = document.createElement('td'); tdLoc.textContent = b.location || ''; tr.appendChild(tdLoc);
      tr.addEventListener('click', showDetail.bind(null, b));
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    tableEl.appendChild(table);
  }

  async function refresh() {
    var q = searchEl.value.trim();
    allBooks = await api.list(q || undefined);
    updateLocationFilter(allBooks);
    renderFiltered();
  }

  function debounce(fn, t) { var tim; return function () { clearTimeout(tim); tim = setTimeout(fn, t); }; }

  // --- Barcode scanner ---
  var scannerModal = document.getElementById('scanner');
  var scannerArea = document.getElementById('scanner-area');
  var closeScanner = document.getElementById('closeScanner');
  var scannerStream = null;
  var scannerAnimFrame = null;
  var scannerRunning = false;

  function validateBarcode(code) {
    return validateISBN13(code) || validateISBN10(code);
  }

  scanBtn.addEventListener('click', async function () {
    scannerModal.classList.remove('hidden');
    await startScanner();
  });
  closeScanner.addEventListener('click', function () { stopScanner(); scannerModal.classList.add('hidden'); });

  async function startScanner() {
    if (scannerRunning) return;
    stopScanner();
    scannerArea.innerHTML = '';

    var video = document.createElement('video');
    video.setAttribute('autoplay', '');
    video.setAttribute('playsinline', '');
    video.setAttribute('muted', '');
    video.muted = true;
    video.style.width = '100%';
    video.style.display = 'block';
    scannerArea.appendChild(video);

    try {
      scannerStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
      });
    } catch (err) {
      alert('Could not access camera. Make sure camera permissions are granted and you are using HTTPS or localhost.');
      scannerModal.classList.add('hidden');
      return;
    }

    video.srcObject = scannerStream;
    await video.play();
    scannerRunning = true;

    if ('BarcodeDetector' in window) {
      scanWithNative(video);
    } else {
      scanWithZbar(video);
    }
  }

  function scanWithNative(video) {
    var detector = new BarcodeDetector({ formats: ['ean_13', 'ean_8'] });
    var lastDetected = '';
    var detectCount = 0;

    function scanFrame() {
      if (!scannerRunning) return;
      detector.detect(video).then(function (barcodes) {
        if (!scannerRunning) return;
        for (var bc of barcodes) {
          if (!validateBarcode(bc.rawValue)) continue;
          if (bc.rawValue === lastDetected) { detectCount++; } else { lastDetected = bc.rawValue; detectCount = 1; }
          if (detectCount >= 2) { onBarcodeDetected(bc.rawValue); return; }
        }
        scannerAnimFrame = requestAnimationFrame(scanFrame);
      }).catch(function () { if (scannerRunning) scannerAnimFrame = requestAnimationFrame(scanFrame); });
    }
    scannerAnimFrame = requestAnimationFrame(scanFrame);
  }

  async function scanWithZbar(video) {
    if (typeof zbarWasm === 'undefined' || !zbarWasm.scanImageData) {
      var statusEl = document.createElement('p');
      statusEl.textContent = 'Barcode library not available.';
      statusEl.style.cssText = 'color: #dc2626; text-align: center; padding: 8px;';
      scannerArea.appendChild(statusEl);
      return;
    }

    var canvas = document.createElement('canvas');
    var ctx = canvas.getContext('2d', { willReadFrequently: true });
    var lastDetected = '';
    var detectCount = 0;
    var scanning = false;
    var cropConfigs = [
      { x: 0, y: 0, w: 1, h: 1 },
      { x: 0.1, y: 0.25, w: 0.8, h: 0.5 },
      { x: 0.2, y: 0.35, w: 0.6, h: 0.3 }
    ];
    var cropIdx = 0;

    async function scanFrame() {
      if (!scannerRunning || !video.videoWidth) {
        if (scannerRunning) scannerAnimFrame = requestAnimationFrame(scanFrame);
        return;
      }
      if (scanning) {
        scannerAnimFrame = requestAnimationFrame(scanFrame);
        return;
      }
      scanning = true;
      var vw = video.videoWidth;
      var vh = video.videoHeight;
      var crop = cropConfigs[cropIdx % cropConfigs.length];
      cropIdx++;
      var sx = Math.floor(vw * crop.x);
      var sy = Math.floor(vh * crop.y);
      var sw = Math.floor(vw * crop.w);
      var sh = Math.floor(vh * crop.h);
      canvas.width = sw;
      canvas.height = sh;
      ctx.drawImage(video, sx, sy, sw, sh, 0, 0, sw, sh);
      try {
        var imageData = ctx.getImageData(0, 0, sw, sh);
        var results = await zbarWasm.scanImageData(imageData);
        if (results && results.length > 0) {
          for (var i = 0; i < results.length; i++) {
            var sym = results[i];
            var code = sym.decode ? sym.decode() : (sym.data ? new TextDecoder().decode(new Uint8Array(sym.data)) : '');
            if (!code) continue;
            if (!validateBarcode(code)) continue;
            if (code === lastDetected) { detectCount++; } else { lastDetected = code; detectCount = 1; }
            if (detectCount >= 2) { onBarcodeDetected(code); scanning = false; return; }
          }
        }
      } catch (e) { /* continue scanning */ }
      scanning = false;
      if (scannerRunning) scannerAnimFrame = requestAnimationFrame(scanFrame);
    }
    scannerAnimFrame = requestAnimationFrame(scanFrame);
  }

  function onBarcodeDetected(code) {
    stopScanner();
    scannerModal.classList.add('hidden');
    showModal({ isbn: code, title: '', authors: [], location: '' });
    isbnEl.value = code;
    isbnEl.dispatchEvent(new Event('input'));
    if (settings.autoFetchMetadata) {
      fetchMetaBtn.click();
    }
  }

  function stopScanner() {
    scannerRunning = false;
    if (scannerAnimFrame) { cancelAnimationFrame(scannerAnimFrame); scannerAnimFrame = null; }
    if (scannerStream) { scannerStream.getTracks().forEach(function (t) { t.stop(); }); scannerStream = null; }
    var video = scannerArea.querySelector('video');
    if (video) { video.srcObject = null; }
    scannerArea.innerHTML = '';
  }

  // --- Keyboard shortcuts ---
  function isAnyModalOpen() {
    return !modal.classList.contains('hidden') ||
           !detailModal.classList.contains('hidden') ||
           !settingsModal.classList.contains('hidden') ||
           !scannerModal.classList.contains('hidden') ||
           !importPreviewModal.classList.contains('hidden');
  }

  function highlightFocused(filtered) {
    document.querySelectorAll('.card.focused, .data-table tbody tr.focused').forEach(function (el) {
      el.classList.remove('focused');
    });
    if (focusedIndex < 0 || focusedIndex >= filtered.length) return;
    var book = filtered[focusedIndex];
    var card = galleryEl.querySelector('[data-id="' + book.id + '"]');
    if (card) { card.classList.add('focused'); card.scrollIntoView({ block: 'nearest' }); }
    var row = tableEl.querySelector('[data-id="' + book.id + '"]');
    if (row) { row.classList.add('focused'); row.scrollIntoView({ block: 'nearest' }); }
  }

  document.addEventListener('keydown', function (e) {
    var tag = (document.activeElement || {}).tagName || '';
    var isInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';

    // Escape: close modals or clear selection
    if (e.key === 'Escape') {
      if (!scannerModal.classList.contains('hidden')) { stopScanner(); scannerModal.classList.add('hidden'); e.preventDefault(); return; }
      if (!modal.classList.contains('hidden')) { hideModal(); e.preventDefault(); return; }
      if (!detailModal.classList.contains('hidden')) { detailModal.classList.add('hidden'); e.preventDefault(); return; }
      if (!settingsModal.classList.contains('hidden')) { settingsCloseBtn.click(); e.preventDefault(); return; }
      if (!importPreviewModal.classList.contains('hidden')) { importPreviewModal.classList.add('hidden'); e.preventDefault(); return; }
      if (selectedIds.size > 0) { selectedIds.clear(); updateSelectionBar(); e.preventDefault(); return; }
      // Blur active element
      if (isInput) { document.activeElement.blur(); e.preventDefault(); return; }
    }

    // Ctrl+Enter in modal: save
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && !modal.classList.contains('hidden')) {
      e.preventDefault(); saveBtn.click(); return;
    }

    // Don't handle other shortcuts when typing or in modals
    if (isInput) return;
    if (isAnyModalOpen()) return;

    var filtered = getFilteredBooks();

    // N: new book
    if (e.key === 'n' || e.key === 'N') {
      if (!e.ctrlKey && !e.metaKey) { e.preventDefault(); addBtn.click(); return; }
    }

    // S: scan barcode
    if (e.key === 's' || e.key === 'S') {
      if (!e.ctrlKey && !e.metaKey) { e.preventDefault(); scanBtn.click(); return; }
    }

    // Ctrl+A / Cmd+A: select all
    if ((e.ctrlKey || e.metaKey) && (e.key === 'a' || e.key === 'A')) {
      e.preventDefault();
      filtered.forEach(function (b) { selectedIds.add(b.id); });
      updateSelectionBar();
      return;
    }

    // Delete: delete selected
    if (e.key === 'Delete') {
      if (selectedIds.size > 0) { e.preventDefault(); selDelete.click(); return; }
    }

    // / or F: focus search
    if (e.key === '/' || e.key === 'f' || e.key === 'F') {
      if (!e.ctrlKey && !e.metaKey) { e.preventDefault(); searchEl.focus(); return; }
    }

    // Arrow keys: navigate books
    if (!filtered.length) return;

    if (e.key === 'ArrowDown' || e.key === 'ArrowRight' || e.key === 'j') {
      e.preventDefault();
      focusedIndex = Math.min(focusedIndex + 1, filtered.length - 1);
      highlightFocused(filtered);
      return;
    }
    if (e.key === 'ArrowUp' || e.key === 'ArrowLeft' || e.key === 'k') {
      e.preventDefault();
      focusedIndex = Math.max(focusedIndex - 1, 0);
      highlightFocused(filtered);
      return;
    }

    // Enter: open detail of focused book
    if (e.key === 'Enter' && focusedIndex >= 0 && focusedIndex < filtered.length) {
      e.preventDefault();
      showDetail(filtered[focusedIndex]);
      return;
    }

    // Space: toggle select focused book
    if (e.key === ' ' && focusedIndex >= 0 && focusedIndex < filtered.length) {
      e.preventDefault();
      toggleSelect(filtered[focusedIndex].id);
      return;
    }
  });

  // initial load
  await refresh();
})();
