/* PopGeneticsPro — images of the OTUs (flowers, fruits, leaves, seeds, whole plants…)
   drawn around trees.

   Every image belongs to one name — a tip of a tree (species, variety, landrace,
   population) or a group. It is only drawn once the user confirms that it shows
   exactly that taxon. Adjustments are applied on a canvas and cached as a PNG
   data URL, so figures stay self-contained and export identically to SVG, PNG and
   TIFF. Images are kept in the browser (IndexedDB), per data file, and never leave
   the computer. */

(function () {

  const DB_NAME = 'popgeneticspro', STORE = 'otuImages';
  const OUT = 640;                     // side of the processed square image, px
  const MAX_ORIGINAL = 1400;           // originals are downscaled to this on import

  const recs = new Map();              // name → record
  const listeners = new Set();
  let scope = 'default';
  let dbp = null;

  const ADJ0 = { zoom: 1, dx: 0, dy: 0, rotate: 0, brightness: 0, contrast: 0, saturation: 0, warmth: 0, sharpness: 0, gray: false, removeBg: false, bgTol: 28 };

  /* ---------------- persistence ---------------- */
  function db() {
    if (dbp) return dbp;
    dbp = new Promise(resolve => {
      try {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE); };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      } catch (e) { resolve(null); }
    });
    return dbp;
  }
  const keyOf = name => scope + '::' + name;
  async function persist(rec) {
    const d = await db(); if (!d) return;
    try { const tx = d.transaction(STORE, 'readwrite'); tx.objectStore(STORE).put(Object.assign({}, rec), keyOf(rec.name)); } catch (e) { /* storage full or blocked: keep in memory */ }
  }
  async function unpersist(name) {
    const d = await db(); if (!d) return;
    try { const tx = d.transaction(STORE, 'readwrite'); tx.objectStore(STORE).delete(keyOf(name)); } catch (e) { /* ignore */ }
  }
  /* images of one data file */
  async function useScope(s) {
    scope = s || 'default';
    recs.clear();
    const d = await db();
    if (d) {
      await new Promise(resolve => {
        try {
          const tx = d.transaction(STORE, 'readonly');
          const req = tx.objectStore(STORE).openCursor();
          req.onsuccess = () => {
            const c = req.result;
            if (!c) return resolve();
            if (String(c.key).startsWith(scope + '::')) recs.set(c.value.name, c.value);
            c.continue();
          };
          req.onerror = () => resolve();
        } catch (e) { resolve(); }
      });
    }
    emit();
  }

  function emit() { listeners.forEach(fn => { try { fn(); } catch (e) { console.error(e); } }); }
  function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

  /* ---------------- image processing ---------------- */
  function loadImage(src) {
    return new Promise((resolve, reject) => { const im = new Image(); im.onload = () => resolve(im); im.onerror = () => reject(new Error('The image could not be read.')); im.src = src; });
  }
  function fileToDataURL(file) {
    return new Promise((resolve, reject) => { const fr = new FileReader(); fr.onload = () => resolve(fr.result); fr.onerror = () => reject(new Error('The file could not be read.')); fr.readAsDataURL(file); });
  }
  async function importFile(file) {
    if (!/^image\//.test(file.type) && !/\.(png|jpe?g|webp|gif|bmp|svg)$/i.test(file.name)) throw new Error(file.name + ' is not an image.');
    const src = await fileToDataURL(file);
    const im = await loadImage(src);
    const k = Math.min(1, MAX_ORIGINAL / Math.max(im.naturalWidth, im.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(im.naturalWidth * k)); c.height = Math.max(1, Math.round(im.naturalHeight * k));
    c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
    const keepAlpha = /png|webp|gif|svg/i.test(file.type) || /\.(png|webp|gif|svg)$/i.test(file.name);
    return { original: keepAlpha ? c.toDataURL('image/png') : c.toDataURL('image/jpeg', 0.92), w: c.width, h: c.height, fileName: file.name };
  }

  const clamp = v => (v < 0 ? 0 : v > 255 ? 255 : v);

  /* flood fill from the border: a plain background (paper, sky, a white sheet)
     becomes transparent, while light areas inside the object are kept */
  function removeBackground(px, W, H, tol) {
    const n = W * H;
    const idx = new Uint8Array(n);           // 1 = background
    /* reference colour: median of the border pixels */
    const border = [];
    for (let x = 0; x < W; x++) { border.push(x, (H - 1) * W + x); }
    for (let y = 0; y < H; y++) { border.push(y * W, y * W + W - 1); }
    const comp = ch => { const v = border.map(p => px[p * 4 + ch]).sort((a, b) => a - b); return v[v.length >> 1]; };
    const ref = [comp(0), comp(1), comp(2)];
    const t2 = (tol * 4.42) ** 2;            // tol 0–100 → distance in RGB space
    const near = p => { if (px[p * 4 + 3] < 10) return true; const dr = px[p * 4] - ref[0], dg = px[p * 4 + 1] - ref[1], db2 = px[p * 4 + 2] - ref[2]; return dr * dr + dg * dg + db2 * db2 <= t2; };
    const stack = [];
    border.forEach(p => { if (!idx[p] && near(p)) { idx[p] = 1; stack.push(p); } });
    while (stack.length) {
      const p = stack.pop(), x = p % W, y = (p / W) | 0;
      const nb = [x > 0 ? p - 1 : -1, x < W - 1 ? p + 1 : -1, y > 0 ? p - W : -1, y < H - 1 ? p + W : -1];
      for (const q of nb) if (q >= 0 && !idx[q] && near(q)) { idx[q] = 1; stack.push(q); }
    }
    for (let p = 0; p < n; p++) {
      if (idx[p]) { px[p * 4 + 3] = 0; continue; }
      /* soften the outline: pixels touching the background are partly transparent */
      const x = p % W, y = (p / W) | 0;
      let touch = 0;
      if (x > 0 && idx[p - 1]) touch++; if (x < W - 1 && idx[p + 1]) touch++;
      if (y > 0 && idx[p - W]) touch++; if (y < H - 1 && idx[p + W]) touch++;
      if (touch) px[p * 4 + 3] = Math.round(px[p * 4 + 3] * (1 - 0.18 * touch));
    }
  }

  function blur3(src, W, H) {
    const out = new Float32Array(src.length);
    const k = [1, 2, 1];
    const tmp = new Float32Array(src.length);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) for (let ch = 0; ch < 3; ch++) {
      let s = 0, w = 0;
      for (let d = -1; d <= 1; d++) { const xx = Math.min(W - 1, Math.max(0, x + d)); s += src[(y * W + xx) * 4 + ch] * k[d + 1]; w += k[d + 1]; }
      tmp[(y * W + x) * 4 + ch] = s / w;
    }
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) for (let ch = 0; ch < 3; ch++) {
      let s = 0, w = 0;
      for (let d = -1; d <= 1; d++) { const yy = Math.min(H - 1, Math.max(0, y + d)); s += tmp[(yy * W + x) * 4 + ch] * k[d + 1]; w += k[d + 1]; }
      out[(y * W + x) * 4 + ch] = s / w;
    }
    return out;
  }

  async function processRecord(rec, size) {
    size = size || OUT;
    const a = Object.assign({}, ADJ0, rec.adj || {});
    const im = await loadImage(rec.original);
    const c = document.createElement('canvas');
    c.width = size; c.height = size;
    const ctx = c.getContext('2d');
    const W = im.naturalWidth, H = im.naturalHeight;
    const base = Math.max(size / W, size / H) * a.zoom;       // cover the square
    const dw = W * base, dh = H * base;
    ctx.save();
    ctx.translate(size / 2, size / 2);
    ctx.rotate((a.rotate || 0) * Math.PI / 180);
    /* dx, dy in −1…1 move the image by up to half of its overflow (or of the frame when smaller) */
    const ox = Math.max((dw - size) / 2, size / 2) * a.dx, oy = Math.max((dh - size) / 2, size / 2) * a.dy;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(im, -dw / 2 - ox, -dh / 2 - oy, dw, dh);
    ctx.restore();
    const data = ctx.getImageData(0, 0, size, size);
    const px = data.data;
    if (a.removeBg) removeBackground(px, size, size, a.bgTol);
    /* tone: brightness, contrast, saturation, warmth, greyscale */
    const b = a.brightness * 2.55;
    const cc = a.contrast * 2.55, cf = (259 * (cc + 255)) / (255 * (259 - cc));
    const sat = 1 + a.saturation / 100;
    const warm = a.warmth * 0.6;
    for (let p = 0; p < px.length; p += 4) {
      if (px[p + 3] === 0) continue;
      let r = px[p], g = px[p + 1], bl = px[p + 2];
      r = cf * (r + b - 128) + 128; g = cf * (g + b - 128) + 128; bl = cf * (bl + b - 128) + 128;
      const L = 0.2126 * r + 0.7152 * g + 0.0722 * bl;
      if (a.gray) { r = g = bl = L; }
      else { r = L + (r - L) * sat; g = L + (g - L) * sat; bl = L + (bl - L) * sat; }
      r += warm; bl -= warm;
      px[p] = clamp(r); px[p + 1] = clamp(g); px[p + 2] = clamp(bl);
    }
    /* sharpness: unsharp mask above 0, a gentle blur below */
    if (a.sharpness) {
      const bl = blur3(px, size, size);
      const amt = a.sharpness / 50;
      for (let p = 0; p < px.length; p += 4) {
        if (px[p + 3] === 0) continue;
        for (let ch = 0; ch < 3; ch++) {
          const v = px[p + ch], m = bl[p + ch];
          px[p + ch] = clamp(amt > 0 ? v + amt * (v - m) : v + (-amt / 2) * (m - v));
        }
      }
    }
    ctx.putImageData(data, 0, 0);
    return c.toDataURL('image/png');
  }

  /* ---------------- records ---------------- */
  function get(name) { return recs.get(name) || null; }
  /* the image to draw for a name, only when confirmed */
  function url(name) { const r = recs.get(name); return r && r.confirmed && r.processed ? r.processed : null; }
  function names() { return [...recs.keys()]; }
  async function setImage(name, file) {
    const imp = await importFile(file);
    const old = recs.get(name);
    const rec = { name, original: imp.original, w: imp.w, h: imp.h, fileName: imp.fileName, adj: Object.assign({}, ADJ0), credit: old ? old.credit : '', license: old ? old.license : '', confirmed: false, processed: null, updated: Date.now() };
    rec.processed = await processRecord(rec);
    recs.set(name, rec); persist(rec); emit();
    return rec;
  }
  async function update(name, patch) {
    const rec = recs.get(name); if (!rec) return null;
    if (patch.adj) rec.adj = Object.assign({}, rec.adj, patch.adj);
    ['credit', 'license', 'confirmed'].forEach(k => { if (patch[k] !== undefined) rec[k] = patch[k]; });
    if (patch.adj) rec.processed = await processRecord(rec);
    rec.updated = Date.now();
    persist(rec); emit();
    return rec;
  }
  function remove(name) { recs.delete(name); unpersist(name); emit(); }

  /* file names → OTU names: "Quercus_rugosa.jpg" matches "Quercus rugosa" */
  const norm = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\.[a-z0-9]{2,4}$/, '').replace(/[^a-z0-9]+/g, '');
  function matchName(fileName, candidates) {
    const f = norm(fileName);
    let hit = candidates.find(c => norm(c) === f);
    if (hit) return hit;
    hit = candidates.filter(c => norm(c).length >= 3 && (f.startsWith(norm(c)) || f.includes(norm(c))));
    return hit.length === 1 ? hit[0] : null;
  }

  /* ================================================================
     the manager dialog
     ================================================================ */
  let modal = null, state0 = null;

  function openManager(opts) {
    opts = opts || {};
    state0 = { names: (opts.names || []).slice(), title: opts.title || 'Images of the OTUs', groupWord: opts.groupWord || 'OTU', current: null };
    if (!state0.names.length) state0.names = names();
    state0.current = opts.focus || state0.names.find(n => !recs.has(n)) || state0.names[0] || null;
    if (!modal) buildModal();
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    el('otuModalTitle').textContent = state0.title;
    renderList(); renderEditor();
  }
  function close() { if (modal) modal.style.display = 'none'; document.body.style.overflow = ''; }

  function buildModal() {
    modal = mk('div', { class: 'otu-modal', id: 'otuModal' });
    modal.innerHTML = `
      <div class="otu-dialog" role="dialog" aria-modal="true" aria-labelledby="otuModalTitle">
        <div class="otu-head">
          <div>
            <h2 id="otuModalTitle">Images of the OTUs</h2>
            <p class="hint" style="margin:2px 0 0">Flowers, fruits, leaves, seeds, whole plants or animals — one image per name, drawn next to its branch or group.</p>
          </div>
          <div class="btn-row" style="margin:0">
            <button class="btn btn-secondary btn-sm" id="otuBatch">Add several images…</button>
            <input type="file" id="otuBatchInput" accept="image/*" multiple style="display:none">
            <button class="btn btn-primary btn-sm" id="otuDone">Done</button>
          </div>
        </div>
        <div class="otu-rule">
          <b>The image must show exactly this taxon.</b> Use the same species, subspecies, variety or landrace as the OTU — never a related species, a generic stock photo or another cultivar that “looks similar”, because readers take the picture as evidence. Prefer your own voucher photographs or herbarium specimens; otherwise use an image whose licence allows reuse (for example CC BY) and credit it. An image is drawn only after you confirm it.
        </div>
        <div class="otu-body">
          <div class="otu-list" id="otuList"></div>
          <div class="otu-editor" id="otuEditor"></div>
        </div>
      </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) close(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && modal.style.display !== 'none') close(); });
    el('otuDone').addEventListener('click', close);
    el('otuBatch').addEventListener('click', () => el('otuBatchInput').click());
    el('otuBatchInput').addEventListener('change', async e => {
      const files = [...e.target.files]; e.target.value = '';
      const done = [], missed = [];
      for (const f of files) {
        const nm = matchName(f.name, state0.names);
        if (!nm) { missed.push(f.name); continue; }
        try { await setImage(nm, f); done.push(nm); } catch (err) { missed.push(f.name); }
      }
      renderList(); renderEditor();
      const box = el('otuBatchMsg');
      if (box) box.innerHTML = `${done.length} image${done.length === 1 ? '' : 's'} matched by file name${missed.length ? `; not matched: ${esc(missed.slice(0, 5).join(', '))}${missed.length > 5 ? '…' : ''} — name the files after the OTUs, or add them one by one` : ''}. Each still needs to be confirmed.`;
    });
  }

  function renderList() {
    const host = el('otuList');
    host.innerHTML = '<div class="hint" id="otuBatchMsg" style="margin:0 0 8px;font-size:.78rem"></div>';
    state0.names.forEach(nm => {
      const r = recs.get(nm);
      const st = !r ? 'none' : r.confirmed ? 'ok' : 'pending';
      const b = mk('button', { class: 'otu-item' + (nm === state0.current ? ' active' : ''), type: 'button' });
      b.innerHTML = `<span class="otu-thumb">${r && r.processed ? `<img src="${r.processed}" alt="">` : '<span>+</span>'}</span>` +
        `<span class="otu-name">${esc(nm)}</span><span class="otu-state ${st}">${st === 'ok' ? '✓' : st === 'pending' ? 'confirm' : ''}</span>`;
      b.addEventListener('click', () => { state0.current = nm; renderList(); renderEditor(); });
      host.appendChild(b);
    });
  }

  function renderEditor() {
    const host = el('otuEditor');
    host.innerHTML = '';
    const nm = state0.current;
    if (!nm) { host.innerHTML = '<p class="hint">No names to illustrate yet.</p>'; return; }
    const r = recs.get(nm);
    host.appendChild(mk('h3', { style: 'margin:0 0 8px' }, esc(nm)));
    const drop = mk('div', { class: 'otu-drop' + (r ? ' has' : '') });
    const input = mk('input', { type: 'file', accept: 'image/*', style: 'display:none' });
    drop.innerHTML = r
      ? `<div class="otu-preview"><img id="otuPrev" src="${r.processed}" alt=""><div class="otu-frame"></div></div>`
      : `<div class="otu-empty"><b>Drop an image of “${esc(nm)}” here</b><br>or click to choose one (JPG, PNG, WEBP, SVG)</div>`;
    drop.addEventListener('click', e => { if (!r || e.target.closest('.otu-empty')) input.click(); });
    drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('drag'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('drag'));
    drop.addEventListener('drop', async e => { e.preventDefault(); drop.classList.remove('drag'); if (e.dataTransfer.files[0]) await load(e.dataTransfer.files[0]); });
    input.addEventListener('change', async () => { if (input.files[0]) await load(input.files[0]); });
    const load = async f => {
      try { drop.classList.add('busy'); await setImage(nm, f); renderList(); renderEditor(); }
      catch (err) { alert(err.message); drop.classList.remove('busy'); }
    };
    const wrap = mk('div', { class: 'otu-edit-grid' });
    wrap.appendChild(drop);
    wrap.appendChild(input);
    host.appendChild(wrap);
    if (!r) return;

    const side = mk('div', { class: 'otu-controls' });
    wrap.appendChild(side);
    let timer = null;
    const apply = patch => {
      Object.assign(r.adj, patch);
      clearTimeout(timer);
      timer = setTimeout(async () => { await update(nm, { adj: r.adj }); const im = el('otuPrev'); if (im) im.src = recs.get(nm).processed; renderListThumb(nm); }, 90);
    };
    const slider = (key, label, min, max, step, fmt) => {
      const row = mk('label', { class: 'otu-slider' });
      const val = mk('span', { class: 'range-val' }, fmt ? fmt(r.adj[key]) : String(r.adj[key]));
      const inp = mk('input', { type: 'range', min, max, step, value: r.adj[key] });
      inp.addEventListener('input', () => { val.textContent = fmt ? fmt(+inp.value) : inp.value; apply({ [key]: +inp.value }); });
      inp.addEventListener('dblclick', () => { inp.value = ADJ0[key]; val.textContent = fmt ? fmt(ADJ0[key]) : String(ADJ0[key]); apply({ [key]: ADJ0[key] }); });
      row.appendChild(mk('span', null, label)); row.appendChild(inp); row.appendChild(val);
      return row;
    };
    const sec = (title) => { const h = mk('h4', { style: 'margin:10px 0 4px' }, title); side.appendChild(h); };
    sec('Framing');
    side.appendChild(slider('zoom', 'Zoom', 0.5, 4, 0.05, v => v.toFixed(2) + '×'));
    side.appendChild(slider('dx', 'Move left ↔ right', -1, 1, 0.02, v => v.toFixed(2)));
    side.appendChild(slider('dy', 'Move up ↕ down', -1, 1, 0.02, v => v.toFixed(2)));
    side.appendChild(slider('rotate', 'Rotate', -180, 180, 1, v => v + '°'));
    sec('Tone');
    side.appendChild(slider('brightness', 'Brightness', -60, 60, 1));
    side.appendChild(slider('contrast', 'Contrast', -60, 60, 1));
    side.appendChild(slider('saturation', 'Saturation', -100, 100, 1));
    side.appendChild(slider('warmth', 'Warmth', -40, 40, 1));
    side.appendChild(slider('sharpness', 'Sharpness', -100, 100, 1));
    const gray = mk('label', { class: 'checkbox-label' });
    gray.innerHTML = `<input type="checkbox" ${r.adj.gray ? 'checked' : ''}> Greyscale`;
    gray.querySelector('input').addEventListener('change', e => apply({ gray: e.target.checked }));
    side.appendChild(gray);
    sec('Background');
    const bg = mk('label', { class: 'checkbox-label' });
    bg.innerHTML = `<input type="checkbox" ${r.adj.removeBg ? 'checked' : ''}> Remove a plain background (paper, white sheet, sky)`;
    bg.querySelector('input').addEventListener('change', e => apply({ removeBg: e.target.checked }));
    side.appendChild(bg);
    side.appendChild(slider('bgTol', 'Tolerance', 2, 60, 1));
    side.appendChild(mk('p', { class: 'hint', style: 'margin:2px 0 0;font-size:.75rem' }, 'Double-click a slider to reset it.'));

    const meta = mk('div', { class: 'otu-meta' });
    meta.innerHTML = `
      <div class="field"><label>Source / credit</label><input type="text" id="otuCredit" placeholder="e.g. Photo: author, voucher or herbarium number" value="${esc(r.credit || '')}"></div>
      <div class="field"><label>Licence</label><select id="otuLicense">
        ${['', 'Own work', 'CC0', 'CC BY 4.0', 'CC BY-SA 4.0', 'CC BY-NC 4.0', 'Public domain', 'Used with permission', 'Other'].map(l => `<option ${l === (r.license || '') ? 'selected' : ''} value="${esc(l)}">${l || '— choose —'}</option>`).join('')}
      </select></div>
      <label class="otu-confirm"><input type="checkbox" id="otuConfirm" ${r.confirmed ? 'checked' : ''}>
        <span>I confirm that this image shows exactly <b>${esc(nm)}</b> — the same species or variety, not a related one — and that I may reuse it.</span></label>
      <div class="btn-row" style="margin-top:8px">
        <button class="btn btn-secondary btn-sm" id="otuReplace">Replace image</button>
        <button class="btn btn-ghost btn-sm" id="otuRemove">Remove</button>
      </div>`;
    host.appendChild(meta);
    el('otuCredit').addEventListener('change', e => update(nm, { credit: e.target.value }));
    el('otuLicense').addEventListener('change', e => update(nm, { license: e.target.value }));
    el('otuConfirm').addEventListener('change', e => { update(nm, { confirmed: e.target.checked }).then(() => renderList()); });
    el('otuReplace').addEventListener('click', () => input.click());
    el('otuRemove').addEventListener('click', () => { if (confirm(`Remove the image of “${nm}”?`)) { remove(nm); renderList(); renderEditor(); } });
  }
  function renderListThumb(nm) {
    const r = recs.get(nm);
    const items = [...document.querySelectorAll('#otuList .otu-item')];
    const it = items.find(b => b.querySelector('.otu-name').textContent === nm);
    if (it && r) { const t = it.querySelector('.otu-thumb'); t.innerHTML = `<img src="${r.processed}" alt="">`; }
  }

  /* credits of the images drawn in a figure, for captions and the report */
  function credits(list) {
    return list.map(nm => recs.get(nm)).filter(r => r && r.confirmed).map(r => `${r.name}: ${r.credit || 'source not given'}${r.license ? ' (' + r.license + ')' : ''}`);
  }

  window.OTUImg = { useScope, onChange, get, url, names, setImage, update, remove, processRecord, openManager, close, matchName, credits, ADJ0 };
})();
