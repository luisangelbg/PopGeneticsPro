/* PopGeneticsPro — Block 2: the built-in data sheet.

   A spreadsheet-like grid for users who cannot upload a file: paste a block copied
   from any spreadsheet (tab-separated) or a CSV text, or type directly. The grid is
   virtualised (only the visible cells exist in the page), so thousands of rows and
   columns stay responsive. The sheet is saved in the browser as it changes, can be
   downloaded as .xlsx, .ods, .csv or .tsv, and is analysed through the same
   interpretation and checks as a file. Row numbers are the rows of the sheet, so a
   problem reported as "row 12" is row 12 here. */

(function () {

  const ROW_H = 26, HEAD_H = 26, ROWNUM_W = 52;
  const MAX_ROWS = 20000, MAX_COLS = 5000;
  const STORE_DB = 'popgeneticspro-sheet', STORE = 'sheet', KEY = 'current';

  const S = {
    cells: [],                 // array of rows, each an array of strings
    nRows: 60, nCols: 16,
    colW: 104,
    sel: { r0: 0, c0: 0, r1: 0, c1: 0 },   // anchor (r0,c0) and focus (r1,c1)
    editing: null,
    undo: [], redo: [],
    marks: new Map(),          // "r,c" or "r,*" → message
    name: 'data_sheet',
    dirty: false,
  };
  window.Sheet = S;

  let wrap, canvas, colHead, rowHead, corner, editor, keyTrap, status, dragging = false;

  /* ================================================================ model */
  const get = (r, c) => (S.cells[r] && S.cells[r][c] != null ? S.cells[r][c] : '');
  function set(r, c, v, log) {
    if (r >= MAX_ROWS || c >= MAX_COLS) return;
    while (S.cells.length <= r) S.cells.push([]);
    const row = S.cells[r];
    const old = row[c] != null ? row[c] : '';
    v = v == null ? '' : String(v);
    if (old === v) return;
    if (log) log.push([r, c, old, v]);
    row[c] = v;
    if (r >= S.nRows - 1) S.nRows = Math.min(MAX_ROWS, r + 20);
    if (c >= S.nCols - 1) S.nCols = Math.min(MAX_COLS, c + 4);
  }
  function commitLog(log, label) {
    if (!log.length) return;
    S.undo.push({ log, label });
    if (S.undo.length > 200) S.undo.shift();
    S.redo = [];
    changed();
  }
  function applyLog(entry, backwards) {
    entry.log.forEach(([r, c, a, b]) => { while (S.cells.length <= r) S.cells.push([]); S.cells[r][c] = backwards ? a : b; });
  }
  function doUndo() { const e = S.undo.pop(); if (!e) return; applyLog(e, true); S.redo.push(e); changed(); }
  function doRedo() { const e = S.redo.pop(); if (!e) return; applyLog(e, false); S.undo.push(e); changed(); }

  /* extent of the cells that hold something */
  function usedExtent() {
    let rows = 0, cols = 0;
    S.cells.forEach((row, r) => { for (let c = row.length - 1; c >= 0; c--) if (row[c] != null && String(row[c]).trim() !== '') { rows = Math.max(rows, r + 1); cols = Math.max(cols, c + 1); break; } });
    return { rows, cols };
  }
  function toRows() {
    const { rows, cols } = usedExtent();
    const out = [];
    for (let r = 0; r < rows; r++) { const row = []; for (let c = 0; c < cols; c++) row.push(get(r, c)); out.push(row); }
    return out;
  }
  function setRows(rows, name) {
    S.cells = rows.map(r => r.map(v => (v == null ? '' : String(v))));
    const ext = usedExtent();
    S.nRows = Math.max(60, ext.rows + 20);
    S.nCols = Math.max(16, ext.cols + 4);
    S.undo = []; S.redo = []; S.marks.clear();
    S.sel = { r0: 0, c0: 0, r1: 0, c1: 0 };
    if (name) S.name = name;
    changed(true);
  }

  const colLetter = n => { let s = ''; n += 1; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };

  /* ================================================================ persistence */
  let dbp = null, saveTimer = null;
  function db() {
    if (dbp) return dbp;
    dbp = new Promise(res => { try { const q = indexedDB.open(STORE_DB, 1); q.onupgradeneeded = () => q.result.createObjectStore(STORE); q.onsuccess = () => res(q.result); q.onerror = () => res(null); } catch (e) { res(null); } });
    return dbp;
  }
  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      const d = await db(); if (!d) return;
      try { d.transaction(STORE, 'readwrite').objectStore(STORE).put({ cells: S.cells, name: S.name, colW: S.colW, saved: Date.now() }, KEY); setStatusNote('saved in this browser'); } catch (e) { setStatusNote('not saved (storage unavailable)'); }
    }, 600);
  }
  async function restore() {
    const d = await db(); if (!d) return false;
    return new Promise(res => {
      try {
        const q = d.transaction(STORE, 'readonly').objectStore(STORE).get(KEY);
        q.onsuccess = () => { const v = q.result; if (v && v.cells && v.cells.some(r => r && r.some(x => x !== '' && x != null))) { S.cells = v.cells; S.name = v.name || S.name; S.colW = v.colW || S.colW; const ext = usedExtent(); S.nRows = Math.max(60, ext.rows + 20); S.nCols = Math.max(16, ext.cols + 4); res(true); } else res(false); };
        q.onerror = () => res(false);
      } catch (e) { res(false); }
    });
  }

  function changed(noSave) {
    S.dirty = true;
    render();
    updateStatus();
    if (!noSave) scheduleSave(); else scheduleSave();
  }

  /* ================================================================ parsing pasted text */
  function parseClipboard(text) {
    text = String(text).replace(/\r\n?/g, '\n').replace(/\n$/, '');
    if (!text) return [];
    /* spreadsheets put tabs between cells; plain text may use commas or semicolons */
    const lines = text.split('\n');
    const tabs = (text.match(/\t/g) || []).length;
    let delim = '\t';
    if (!tabs) {
      const sc = (lines[0].match(/;/g) || []).length, cm = (lines[0].match(/,/g) || []).length;
      delim = sc > cm ? ';' : cm ? ',' : null;
    }
    if (!delim) return lines.map(l => [l]);
    return lines.map(line => {
      const out = []; let cur = '', q = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') { if (q && line[i + 1] === '"') { cur += '"'; i++; } else if (cur === '' || q) q = !q; else cur += ch; }
        else if (ch === delim && !q) { out.push(cur); cur = ''; }
        else cur += ch;
      }
      out.push(cur);
      return out;
    });
  }

  function pasteAt(r0, c0, rows) {
    if (!rows.length) return;
    const log = [];
    const sel = S.sel;
    /* one value pasted into a selected range fills the whole range */
    const single = rows.length === 1 && rows[0].length === 1;
    const rs = Math.min(sel.r0, sel.r1), re = Math.max(sel.r0, sel.r1), cs = Math.min(sel.c0, sel.c1), ce = Math.max(sel.c0, sel.c1);
    if (single && (re > rs || ce > cs)) {
      for (let r = rs; r <= re; r++) for (let c = cs; c <= ce; c++) set(r, c, rows[0][0], log);
    } else {
      rows.forEach((row, i) => row.forEach((v, j) => set(r0 + i, c0 + j, v.trim(), log)));
      S.sel = { r0, c0, r1: r0 + rows.length - 1, c1: c0 + Math.max(...rows.map(r => r.length)) - 1 };
    }
    commitLog(log, 'paste');
  }

  function selectionTSV() {
    const { r0, c0, r1, c1 } = S.sel;
    const rs = Math.min(r0, r1), re = Math.max(r0, r1), cs = Math.min(c0, c1), ce = Math.max(c0, c1);
    const lines = [];
    for (let r = rs; r <= re; r++) { const row = []; for (let c = cs; c <= ce; c++) row.push(get(r, c)); lines.push(row.join('\t')); }
    return lines.join('\n');
  }
  function clearSelection() {
    const { r0, c0, r1, c1 } = S.sel, log = [];
    for (let r = Math.min(r0, r1); r <= Math.max(r0, r1); r++) for (let c = Math.min(c0, c1); c <= Math.max(c0, c1); c++) if (get(r, c) !== '') set(r, c, '', log);
    commitLog(log, 'clear');
  }

  /* insert or delete whole rows / columns (recorded as a full snapshot for undo) */
  function structural(fn, label) {
    const before = S.cells.map(r => r.slice());
    fn();
    const log = [];
    const R = Math.max(before.length, S.cells.length);
    for (let r = 0; r < R; r++) {
      const a = before[r] || [], b = S.cells[r] || [];
      const C = Math.max(a.length, b.length);
      for (let c = 0; c < C; c++) { const x = a[c] != null ? a[c] : '', y = b[c] != null ? b[c] : ''; if (x !== y) log.push([r, c, x, y]); }
    }
    commitLog(log, label);
  }
  const selRows = () => [Math.min(S.sel.r0, S.sel.r1), Math.max(S.sel.r0, S.sel.r1)];
  const selCols = () => [Math.min(S.sel.c0, S.sel.c1), Math.max(S.sel.c0, S.sel.c1)];
  function insertRows(below) { const [a, b] = selRows(); const n = b - a + 1, at = below ? b + 1 : a; structural(() => { S.cells.splice(at, 0, ...Array.from({ length: n }, () => [])); S.nRows = Math.min(MAX_ROWS, S.nRows + n); }, 'insert rows'); }
  function deleteRows() { const [a, b] = selRows(); structural(() => { S.cells.splice(a, b - a + 1); }, 'delete rows'); S.sel = { r0: a, c0: S.sel.c0, r1: a, c1: S.sel.c0 }; render(); }
  function insertCols(right) { const [a, b] = selCols(); const n = b - a + 1, at = right ? b + 1 : a; structural(() => { S.cells.forEach(r => { while (r.length < at) r.push(''); r.splice(at, 0, ...new Array(n).fill('')); }); S.nCols = Math.min(MAX_COLS, S.nCols + n); }, 'insert columns'); }
  function deleteCols() { const [a, b] = selCols(); structural(() => { S.cells.forEach(r => r.splice(a, b - a + 1)); }, 'delete columns'); S.sel = { r0: S.sel.r0, c0: a, r1: S.sel.r0, c1: a }; render(); }

  /* ================================================================ rendering (virtualised) */
  function build() {
    const host = el('sheetGrid');
    host.innerHTML = '';
    wrap = mk('div', { class: 'sh-wrap', tabindex: '-1' });
    canvas = mk('div', { class: 'sh-canvas' });
    colHead = mk('div', { class: 'sh-colhead' });
    rowHead = mk('div', { class: 'sh-rowhead' });
    corner = mk('div', { class: 'sh-corner', title: 'Select everything' });
    editor = mk('input', { class: 'sh-editor', type: 'text', spellcheck: 'false', autocomplete: 'off' });
    keyTrap = mk('textarea', { class: 'sh-keytrap', 'aria-label': 'Data sheet', spellcheck: 'false' });
    wrap.appendChild(canvas); wrap.appendChild(colHead); wrap.appendChild(rowHead); wrap.appendChild(corner); wrap.appendChild(editor);
    host.appendChild(wrap); host.appendChild(keyTrap);
    status = el('sheetStatus');

    wrap.addEventListener('scroll', render);
    corner.addEventListener('mousedown', e => { e.preventDefault(); S.sel = { r0: 0, c0: 0, r1: Math.max(0, usedExtent().rows - 1), c1: Math.max(0, usedExtent().cols - 1) }; focusTrap(); render(); updateStatus(); });
    wrap.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', () => { dragging = false; });
    wrap.addEventListener('dblclick', e => { const hit = cellAt(e); if (hit && hit.r >= 0 && hit.c >= 0) startEdit(false); });
    keyTrap.addEventListener('keydown', onKey);
    keyTrap.addEventListener('paste', e => { e.preventDefault(); const t = (e.clipboardData || window.clipboardData).getData('text'); pasteAt(Math.min(S.sel.r0, S.sel.r1), Math.min(S.sel.c0, S.sel.c1), parseClipboard(t)); ensureVisible(); });
    keyTrap.addEventListener('copy', e => { e.preventDefault(); e.clipboardData.setData('text/plain', selectionTSV()); flash('Copied ' + selSize() + '.'); });
    keyTrap.addEventListener('cut', e => { e.preventDefault(); e.clipboardData.setData('text/plain', selectionTSV()); clearSelection(); });
    editor.addEventListener('keydown', onEditorKey);
    editor.addEventListener('blur', () => { if (S.editing) finishEdit(true); });
    new ResizeObserver(() => render()).observe(wrap);
  }

  function focusTrap() { if (keyTrap && document.activeElement !== keyTrap) keyTrap.focus({ preventScroll: true }); }

  function render() {
    if (!wrap) return;
    const W = wrap.clientWidth, H = wrap.clientHeight;
    const sx = wrap.scrollLeft, sy = wrap.scrollTop;
    const totalW = ROWNUM_W + S.nCols * S.colW, totalH = HEAD_H + S.nRows * ROW_H;
    canvas.style.width = totalW + 'px'; canvas.style.height = totalH + 'px';
    const c0 = Math.max(0, Math.floor((sx) / S.colW) - 1), c1 = Math.min(S.nCols - 1, Math.ceil((sx + W - ROWNUM_W) / S.colW) + 1);
    const r0 = Math.max(0, Math.floor(sy / ROW_H) - 2), r1 = Math.min(S.nRows - 1, Math.ceil((sy + H - HEAD_H) / ROW_H) + 2);
    const sel = S.sel;
    const rs = Math.min(sel.r0, sel.r1), re = Math.max(sel.r0, sel.r1), cs = Math.min(sel.c0, sel.c1), ce = Math.max(sel.c0, sel.c1);
    const headerRow = el('sheetHeaderRow') ? el('sheetHeaderRow').checked : true;
    let html = '';
    for (let r = r0; r <= r1; r++) {
      const top = HEAD_H + r * ROW_H;
      const rowMark = S.marks.get(r + ',*');
      for (let c = c0; c <= c1; c++) {
        const v = get(r, c);
        const inSel = r >= rs && r <= re && c >= cs && c <= ce;
        const mark = S.marks.get(r + ',' + c) || rowMark;
        const cls = 'sh-cell' + (inSel ? ' sel' : '') + (r === sel.r1 && c === sel.c1 ? ' active' : '') + (headerRow && r === 0 ? ' head' : '') + (mark ? ' bad' : '') + (/^-?\d+([.,]\d+)?$/.test(v) ? ' num' : '');
        html += `<div class="${cls}" style="left:${ROWNUM_W + c * S.colW}px;top:${top}px;width:${S.colW}px"${mark ? ` title="${esc(mark)}"` : ''}>${esc(v)}</div>`;
      }
    }
    canvas.innerHTML = html;
    /* sticky headers */
    let ch = '';
    for (let c = c0; c <= c1; c++) ch += `<div class="sh-ch${c >= cs && c <= ce ? ' on' : ''}" data-c="${c}" style="left:${ROWNUM_W + c * S.colW - sx}px;width:${S.colW}px">${colLetter(c)}</div>`;
    colHead.innerHTML = ch;
    colHead.style.top = sy + 'px'; colHead.style.left = sx + 'px'; colHead.style.width = W + 'px';
    let rh = '';
    for (let r = r0; r <= r1; r++) rh += `<div class="sh-rh${r >= rs && r <= re ? ' on' : ''}${S.marks.has(r + ',*') ? ' bad' : ''}" data-r="${r}" style="top:${HEAD_H + r * ROW_H - sy}px">${r + 1}</div>`;
    rowHead.innerHTML = rh;
    rowHead.style.left = sx + 'px'; rowHead.style.top = sy + 'px'; rowHead.style.height = H + 'px';
    corner.style.left = sx + 'px'; corner.style.top = sy + 'px';
    if (S.editing) placeEditor();
  }

  function cellAt(e) {
    const rect = wrap.getBoundingClientRect();
    const x = e.clientX - rect.left, y = e.clientY - rect.top;
    const col = x < ROWNUM_W ? -1 : Math.floor((x - ROWNUM_W + wrap.scrollLeft) / S.colW);
    const row = y < HEAD_H ? -1 : Math.floor((y - HEAD_H + wrap.scrollTop) / ROW_H);
    return { r: row, c: col, x, y };
  }

  function onMouseDown(e) {
    if (e.target === editor) return;
    if (e.button !== 0) return;
    const hit = cellAt(e);
    if (S.editing) finishEdit(true);
    e.preventDefault();
    focusTrap();
    if (hit.r < 0 && hit.c < 0) return;
    if (hit.r < 0) {                                  // column header
      const ext = Math.max(S.nRows - 1, 0);
      S.sel = e.shiftKey ? { r0: 0, c0: S.sel.c0, r1: ext, c1: hit.c } : { r0: 0, c0: hit.c, r1: ext, c1: hit.c };
    } else if (hit.c < 0) {                           // row header
      const ext = Math.max(S.nCols - 1, 0);
      S.sel = e.shiftKey ? { r0: S.sel.r0, c0: 0, r1: hit.r, c1: ext } : { r0: hit.r, c0: 0, r1: hit.r, c1: ext };
    } else {
      if (hit.r >= S.nRows || hit.c >= S.nCols) return;
      S.sel = e.shiftKey ? { r0: S.sel.r0, c0: S.sel.c0, r1: hit.r, c1: hit.c } : { r0: hit.r, c0: hit.c, r1: hit.r, c1: hit.c };
      dragging = true;
    }
    render(); updateStatus();
  }
  function onMouseMove(e) {
    if (!dragging || !wrap) return;
    const hit = cellAt(e);
    const r = Math.max(0, Math.min(S.nRows - 1, hit.r)), c = Math.max(0, Math.min(S.nCols - 1, hit.c));
    if (r !== S.sel.r1 || c !== S.sel.c1) { S.sel.r1 = r; S.sel.c1 = c; render(); updateStatus(); }
  }

  function ensureVisible() {
    const r = S.sel.r1, c = S.sel.c1;
    const x = ROWNUM_W + c * S.colW, y = HEAD_H + r * ROW_H;
    if (x - ROWNUM_W < wrap.scrollLeft) wrap.scrollLeft = x - ROWNUM_W;
    else if (x + S.colW > wrap.scrollLeft + wrap.clientWidth) wrap.scrollLeft = x + S.colW - wrap.clientWidth;
    if (y - HEAD_H < wrap.scrollTop) wrap.scrollTop = y - HEAD_H;
    else if (y + ROW_H > wrap.scrollTop + wrap.clientHeight) wrap.scrollTop = y + ROW_H - wrap.clientHeight;
    render(); updateStatus();
  }

  function move(dr, dc, extend, jump) {
    let r = S.sel.r1, c = S.sel.c1;
    if (jump) {
      /* to the edge of the block of filled cells, as spreadsheets do */
      const filled = (rr, cc) => get(rr, cc) !== '';
      const step = () => { r += dr; c += dc; };
      const inside = () => r >= 0 && c >= 0 && r < S.nRows && c < S.nCols;
      const startFilled = filled(r, c);
      step();
      if (startFilled && inside() && filled(r, c)) { while (inside() && filled(r, c)) step(); r -= dr; c -= dc; }
      else { while (inside() && !filled(r, c)) step(); if (!inside()) { r -= dr; c -= dc; } }
    } else { r += dr; c += dc; }
    r = Math.max(0, Math.min(S.nRows - 1, r)); c = Math.max(0, Math.min(S.nCols - 1, c));
    if (r >= S.nRows - 2 && S.nRows < MAX_ROWS) S.nRows += 20;
    if (c >= S.nCols - 1 && S.nCols < MAX_COLS) S.nCols += 4;
    S.sel = extend ? { r0: S.sel.r0, c0: S.sel.c0, r1: r, c1: c } : { r0: r, c0: c, r1: r, c1: c };
    ensureVisible();
  }

  function onKey(e) {
    const mod = e.ctrlKey || e.metaKey;
    const k = e.key;
    if (mod && k.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? doRedo() : doUndo(); return; }
    if (mod && k.toLowerCase() === 'y') { e.preventDefault(); doRedo(); return; }
    if (mod && k.toLowerCase() === 'a') { e.preventDefault(); const u = usedExtent(); S.sel = { r0: 0, c0: 0, r1: Math.max(0, u.rows - 1), c1: Math.max(0, u.cols - 1) }; render(); updateStatus(); return; }
    if (mod && ['c', 'x', 'v'].includes(k.toLowerCase())) return;           // handled by the clipboard events
    const nav = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
    if (nav[k]) { e.preventDefault(); move(nav[k][0], nav[k][1], e.shiftKey, mod); return; }
    if (k === 'Tab') { e.preventDefault(); move(0, e.shiftKey ? -1 : 1, false); return; }
    if (k === 'Enter') { e.preventDefault(); if (e.shiftKey) move(-1, 0, false); else move(1, 0, false); return; }
    if (k === 'PageDown' || k === 'PageUp') { e.preventDefault(); move((k === 'PageDown' ? 1 : -1) * Math.max(1, Math.floor(wrap.clientHeight / ROW_H) - 1), 0, e.shiftKey); return; }
    if (k === 'Home') { e.preventDefault(); S.sel = mod ? { r0: 0, c0: 0, r1: 0, c1: 0 } : { r0: S.sel.r1, c0: 0, r1: S.sel.r1, c1: 0 }; ensureVisible(); return; }
    if (k === 'End') { e.preventDefault(); const u = usedExtent(); const r = mod ? Math.max(0, u.rows - 1) : S.sel.r1; S.sel = { r0: r, c0: Math.max(0, u.cols - 1), r1: r, c1: Math.max(0, u.cols - 1) }; ensureVisible(); return; }
    if (k === 'Delete' || k === 'Backspace') { e.preventDefault(); clearSelection(); return; }
    if (k === 'F2') { e.preventDefault(); startEdit(false); return; }
    if (k.length === 1 && !mod && !e.altKey) { e.preventDefault(); startEdit(true, k); }
  }

  function placeEditor() {
    const { r1: r, c1: c } = S.sel;
    editor.style.left = (ROWNUM_W + c * S.colW) + 'px';
    editor.style.top = (HEAD_H + r * ROW_H) + 'px';
    editor.style.width = Math.max(S.colW, 160) + 'px';
  }
  function startEdit(replace, firstChar) {
    const { r1: r, c1: c } = S.sel;
    S.sel = { r0: r, c0: c, r1: r, c1: c };
    S.editing = { r, c };
    placeEditor();
    editor.style.display = 'block';
    editor.value = replace ? (firstChar || '') : get(r, c);
    editor.focus();
    if (!replace) editor.select();
    render();
  }
  function finishEdit(save) {
    const ed = S.editing; if (!ed) return;
    S.editing = null;
    editor.style.display = 'none';
    if (save) { const log = []; set(ed.r, ed.c, editor.value.trim(), log); commitLog(log, 'edit'); }
    else render();
    focusTrap();
  }
  function onEditorKey(e) {
    if (e.key === 'Enter') { e.preventDefault(); finishEdit(true); move(e.shiftKey ? -1 : 1, 0, false); }
    else if (e.key === 'Tab') { e.preventDefault(); finishEdit(true); move(0, e.shiftKey ? -1 : 1, false); }
    else if (e.key === 'Escape') { e.preventDefault(); finishEdit(false); }
    else if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && !e.shiftKey) { e.preventDefault(); finishEdit(true); move(e.key === 'ArrowUp' ? -1 : 1, 0, false); }
  }

  /* ================================================================ status */
  const selSize = () => `${Math.abs(S.sel.r1 - S.sel.r0) + 1} × ${Math.abs(S.sel.c1 - S.sel.c0) + 1} cells`;
  let noteTimer = null;
  function setStatusNote(t) { const n = el('sheetSaved'); if (!n) return; n.textContent = t; clearTimeout(noteTimer); noteTimer = setTimeout(() => { n.textContent = ''; }, 2500); }
  function flash(t) { setStatusNote(t); }
  function updateStatus() {
    if (!status) return;
    const u = usedExtent();
    const { r0, c0, r1, c1 } = S.sel;
    const addr = `${colLetter(Math.min(c0, c1))}${Math.min(r0, r1) + 1}` + (r0 !== r1 || c0 !== c1 ? `:${colLetter(Math.max(c0, c1))}${Math.max(r0, r1) + 1}` : '');
    let nums = [], filled = 0;
    const cells = (Math.abs(r1 - r0) + 1) * (Math.abs(c1 - c0) + 1);
    if (cells <= 200000) for (let r = Math.min(r0, r1); r <= Math.max(r0, r1); r++) for (let c = Math.min(c0, c1); c <= Math.max(c0, c1); c++) { const v = get(r, c); if (v !== '') { filled++; const x = Number(v.replace(',', '.')); if (isFinite(x)) nums.push(x); } }
    const sum = nums.reduce((a, b) => a + b, 0);
    status.innerHTML = `<b>${addr}</b>` + (cells > 1 ? ` · ${filled} filled` + (nums.length ? ` · sum ${+sum.toFixed(6)} · mean ${+(sum / nums.length).toFixed(4)}` : '') : (get(r1, c1) !== '' ? ` · “${esc(get(r1, c1).slice(0, 60))}”` : '')) +
      ` <span class="sh-sep">|</span> data: <b>${u.rows}</b> rows × <b>${u.cols}</b> columns`;
  }

  /* ================================================================ downloads */
  function exportAs(fmt) {
    const rows = toRows();
    if (!rows.length) { showMessage('sheetMessages', 'warning', 'The sheet is empty.'); return; }
    const base = slug(el('sheetName').value || S.name || 'data_sheet');
    const asCell = v => { const t = String(v).trim(); return /^-?\d+(\.\d+)?([eE][-+]?\d+)?$/.test(t) ? Number(t) : t; };
    if (fmt === 'xlsx' || fmt === 'ods') {
      const ws = XLSX.utils.aoa_to_sheet(rows.map(r => r.map(asCell)));
      ws['!cols'] = rows[0].map((_, j) => ({ wch: Math.min(40, Math.max(8, ...rows.slice(0, 200).map(r => String(r[j] ?? '').length + 2))) }));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Data');
      const out = XLSX.write(wb, { bookType: fmt, type: 'array' });
      download(new Blob([out], { type: fmt === 'xlsx' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'application/vnd.oasis.opendocument.spreadsheet' }), base + '.' + fmt);
      return;
    }
    const delim = fmt === 'tsv' ? '\t' : fmt === 'csv-semicolon' ? ';' : ',';
    const q = v => { const s = String(v ?? ''); return new RegExp(`["\\n\\r${delim === '\t' ? '\\t' : delim}]`).test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const text = '﻿' + rows.map(r => r.map(q).join(delim)).join('\r\n') + '\r\n';
    download(text, base + (fmt === 'tsv' ? '.tsv' : fmt === 'csv-semicolon' ? '_semicolon.csv' : '.csv'), fmt === 'tsv' ? 'text/tab-separated-values;charset=utf-8' : 'text/csv;charset=utf-8');
  }

  /* ================================================================ analysis */
  function analyse() {
    clearMessages('sheetMessages');
    if (S.editing) finishEdit(true);
    const rows = toRows();
    if (rows.length < 2) { showMessage('sheetMessages', 'error', 'Paste or type at least a row of column names and one row of data.'); return; }
    const firstIsHeader = el('sheetHeaderRow').checked;
    const numeric = rows.map(r => r.map(v => { const t = String(v).trim(); if (t === '') return null; return /^-?\d+(\.\d+)?([eE][-+]?\d+)?$/.test(t) ? Number(t) : t; }));
    const name = (el('sheetName').value.trim() || S.name || 'data_sheet') + ' (data sheet)';
    S.marks.clear(); render();
    if (window.B2 && B2.interpretRows) {
      B2.interpretRows(numeric, name, { header: firstIsHeader, fromSheet: true });
      el('cardInterpret').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  /* problems found while building the dataset, drawn on the sheet */
  function markIssues(issues) {
    S.marks.clear();
    const header = (S.cells[0] || []).map(v => String(v || '').trim());
    let offset = 0;
    /* a template's declaration row is row 1, its column names row 2 */
    if (String(get(0, 0)).startsWith('#PopGeneticsPro')) offset = 1;
    const namesRow = (S.cells[offset] || []).map(v => String(v || '').trim());
    let n = 0;
    (issues || []).forEach(it => it.examples.forEach(ex => {
      /* a repeated ID names both of its rows: "A05 (row 6 and row 7)" */
      const both = String(ex).match(/\(row (\d+) and row (\d+)\)/);
      if (both) { [both[1], both[2]].forEach(k => S.marks.set((Number(k) - 1) + ',*', `${it.text}: ${ex}`)); n++; return; }
      const m = String(ex).match(/^row (\d+)(?:[^,]*)?(?:, ([^:]+))?/);
      if (!m) return;
      const r = Number(m[1]) - 1;
      const colName = m[2] ? m[2].trim() : null;
      const c = colName ? namesRow.indexOf(colName) : -1;
      S.marks.set(c >= 0 ? r + ',' + c : r + ',*', `${it.text}: ${ex}`);
      if (c >= 0 && namesRow.indexOf(colName, c + 1) === c + 1) S.marks.set(r + ',' + (c + 1), `${it.text}: ${ex}`);
      n++;
    }));
    render();
    return n;
  }

  /* ================================================================ opening the card */
  async function open(opts) {
    opts = opts || {};
    const card = el('cardSheet');
    card.style.display = '';
    if (!wrap) build();
    if (opts.rows) {
      const u = usedExtent();
      if (u.rows && !opts.force && !confirm('The data sheet already holds data. Replace them?')) { /* keep */ }
      else setRows(opts.rows, opts.name);
    } else if (!S.restored) {
      S.restored = true;
      const had = await restore();
      if (had) showMessage('sheetMessages', 'info', 'The sheet you were working on was restored from this browser.');
    }
    if (opts.name) el('sheetName').value = opts.name;
    else if (!el('sheetName').value) el('sheetName').value = S.name;
    render(); updateStatus();
    card.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setTimeout(() => { render(); focusTrap(); }, 350);
  }

  function init() {
    if (!el('cardSheet')) return;
    el('btnOpenSheet').addEventListener('click', () => open());
    el('sheetClose').addEventListener('click', () => { el('cardSheet').style.display = 'none'; });
    el('sheetUndo').addEventListener('click', () => { doUndo(); focusTrap(); });
    el('sheetRedo').addEventListener('click', () => { doRedo(); focusTrap(); });
    el('sheetRowAbove').addEventListener('click', () => { insertRows(false); focusTrap(); });
    el('sheetRowBelow').addEventListener('click', () => { insertRows(true); focusTrap(); });
    el('sheetRowDel').addEventListener('click', () => { deleteRows(); focusTrap(); });
    el('sheetColLeft').addEventListener('click', () => { insertCols(false); focusTrap(); });
    el('sheetColRight').addEventListener('click', () => { insertCols(true); focusTrap(); });
    el('sheetColDel').addEventListener('click', () => { deleteCols(); focusTrap(); });
    el('sheetAddRows').addEventListener('click', () => { S.nRows = Math.min(MAX_ROWS, S.nRows + 100); render(); focusTrap(); });
    el('sheetClear').addEventListener('click', () => { if (!usedExtent().rows || confirm('Clear the whole sheet? You can undo it.')) { structural(() => { S.cells = []; }, 'clear sheet'); S.marks.clear(); render(); } });
    el('sheetColW').addEventListener('input', e => { S.colW = Number(e.target.value); render(); scheduleSave(); });
    el('sheetHeaderRow').addEventListener('change', () => render());
    el('sheetPasteGo').addEventListener('click', () => {
      const t = el('sheetPasteBox').value;
      if (!t.trim()) return;
      const rows = parseClipboard(t);
      pasteAt(Math.min(S.sel.r0, S.sel.r1), Math.min(S.sel.c0, S.sel.c1), rows);
      el('sheetPasteBox').value = '';
      showMessage('sheetMessages', 'success', `${rows.length} rows placed from cell ${colLetter(Math.min(S.sel.c0, S.sel.c1))}${Math.min(S.sel.r0, S.sel.r1) + 1}.`);
    });
    els('[data-sheet-dl]').forEach(b => b.addEventListener('click', () => exportAs(b.dataset.sheetDl)));
    el('sheetAnalyse').addEventListener('click', analyse);
    el('sheetFromFile').addEventListener('click', () => {
      if (!window.B2 || !B2.sourceRows) { showMessage('sheetMessages', 'info', 'Load a spreadsheet or CSV file first, then open it here to correct it.'); return; }
      open({ rows: B2.sourceRows, name: (state.fileName || 'data').replace(/\.[^.]+$/, ''), force: !usedExtent().rows });
    });
    el('sheetTemplate').addEventListener('click', () => {
      if (window.Designer) Designer.open(false);
      showMessage('sheetMessages', 'info', 'Design the template below, then choose “Fill it in here” among its downloads.');
    });
  }

  document.addEventListener('DOMContentLoaded', init);
  Object.assign(S, { open, setRows, toRows, parseClipboard, pasteAt, markIssues, exportAs, render, doUndo, doRedo, get, set: (r, c, v) => { const log = []; set(r, c, v, log); commitLog(log, 'set'); } });
})();
