/* PopGeneticsPro — Block 2: the data template designer (UI).
   The engine lives in template.js (Tpl); this file only edits the design and
   shows what the sheet will look like. */

(function () {

  let ds = null;
  let timer = null;

  const CAPS = [
    ['diversity', 'Diversity'], ['hwe', 'HWE &amp; F<sub>IS</sub>'], ['linkage', 'Linkage disequilibrium'],
    ['fstats', 'F-statistics'], ['amova', 'AMOVA'], ['distance', 'Genetic distances'],
    ['ordination', 'PCoA & trees'], ['clustering', 'Bayesian clustering'], ['sequences', 'Sequence statistics'],
    ['demography', 'Bottlenecks &amp; N<sub>e</sub>'], ['spatial', 'Spatial structure'],
  ];
  const MISSING_DEFAULT = { codominant: '0', snp: '0', dominant: '-9', haploid: '0', sequence: '', morph: '' };

  const K = () => Tpl.KINDS[ds.kind];
  const later = () => { clearTimeout(timer); timer = setTimeout(refresh, 160); };

  /* ================================================================ open / close */

  function open(fromData) {
    const card = el('cardDesigner');
    if (fromData && state.data) {
      ds = Tpl.fromData(state.data, state.unit && state.unit.key);
      ds.title = (state.fileName || 'dataset').replace(/\.[^.]+$/, '');
      ds.missing = MISSING_DEFAULT[ds.kind] ?? '';
    } else if (!ds || ds.fill) {
      ds = Tpl.defaults();
    }
    card.style.display = '';
    renderAll();
    card.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function renderAll() {
    clearMessages('dzMessages');
    if (ds.fill) showMessage('dzMessages', 'info',
      `Converting <b>${esc(state.fileName || 'the loaded dataset')}</b>: ${ds.fill.nInd} ${esc(Tpl.unitWord(ds, true).toLowerCase())} and their data are written into the layout you choose below. ` +
      `<button class="btn btn-ghost btn-sm" id="dzBlank">Start a blank design instead</button>`);
    const b = el('dzBlank'); if (b) b.addEventListener('click', () => { ds = Tpl.defaults(); renderAll(); });
    el('dzFromData').style.display = state.data && !ds.fill ? '' : 'none';
    renderKinds();
    syncSampling();
    renderPops();
    renderMarkers();
    refresh();
  }

  /* ================================================================ 1 · kind */

  function renderKinds() {
    const g = el('dzKinds');
    g.innerHTML = '';
    Object.entries(Tpl.KINDS).forEach(([key, k]) => {
      const b = mk('button', { class: 'kind-tile' + (ds.kind === key ? ' active' : ''), type: 'button' });
      b.innerHTML = (Art[k.art] ? Art[k.art]() : '') + `<div class="kt-t">${k.label}</div><div class="kt-s">${k.sub}</div>`;
      if (ds.fill && ds.kind !== key) { b.disabled = true; b.style.opacity = .4; b.style.cursor = 'not-allowed'; }
      b.addEventListener('click', () => {
        if (ds.fill || ds.kind === key) return;
        ds.kind = key;
        ds.missing = MISSING_DEFAULT[key];
        if (key !== 'dominant') ds.orientation = 'rows-are-individuals';
        renderKinds(); renderMarkers(); refresh();
      });
      g.appendChild(b);
    });
  }

  /* ================================================================ 2 · sampling */

  function syncSampling() {
    const bulk = ds.sampling === 'bulk';
    el('dzUnit').value = ds.unit;
    el('dzSampling').value = ds.sampling;
    el('dzIdStyle').value = ds.idStyle;
    el('dzCoords').value = bulk && ds.coords === 'ind' ? 'pop' : ds.coords;
    el('dzUseRegion').checked = ds.useRegion;
    el('dzUseGroup').checked = ds.useGroup;
    el('dzNPops').value = ds.pops.length;
    el('dzIdField').style.display = bulk ? 'none' : '';
    el('dzAllNWrap').style.display = bulk ? 'none' : '';
    el('dzUseGroupWrap').style.display = bulk ? '' : 'none';
    el('dzNPopsLabel').firstChild.textContent = bulk ? `${Tpl.unitWord(ds, true)} ` : 'Populations ';
    el('dzSamplingHelp').textContent = bulk
      ? 'Each row is one DNA extraction of a whole unit (e.g. a landrace bulk). No within-unit statistics.'
      : 'Rows are plants; the population column groups them.';
    const coordOpts = el('dzCoords').options;
    coordOpts[1].textContent = bulk ? `One point per ${Tpl.unitWord(ds).toLowerCase()}` : 'One point per population';
    coordOpts[2].hidden = bulk;
    const locked = !!ds.fill;
    el('dzSecSampling').querySelectorAll('input, select, button').forEach(n => { if (n.id !== 'dzUnit') n.disabled = locked; });
  }

  function bindSampling() {
    el('dzUnit').addEventListener('change', e => { ds.unit = e.target.value; if (ds.unit === 'landraces' || ds.unit === 'populations') { if (ds.sampling !== 'bulk' && !ds.fill) { ds.sampling = 'bulk'; } } syncSampling(); renderPops(); refresh(); });
    el('dzSampling').addEventListener('change', e => {
      ds.sampling = e.target.value;
      /* a bulk sample is not an individual plant, and a population is not a bulk sample */
      if (ds.sampling === 'pops' && ['landraces', 'populations'].includes(ds.unit)) ds.unit = 'individuals';
      if (ds.sampling === 'bulk' && ds.unit === 'individuals') ds.unit = 'landraces';
      if (ds.sampling === 'bulk' && ds.coords === 'ind') ds.coords = 'pop';
      syncSampling(); renderPops(); refresh();
    });
    el('dzIdStyle').addEventListener('change', e => { ds.idStyle = e.target.value; refresh(); });
    el('dzCoords').addEventListener('change', e => { ds.coords = e.target.value; renderPops(); refresh(); });
    el('dzUseRegion').addEventListener('change', e => { ds.useRegion = e.target.checked; renderPops(); refresh(); });
    el('dzUseGroup').addEventListener('change', e => { ds.useGroup = e.target.checked; renderPops(); refresh(); });
    el('dzNPops').addEventListener('change', e => {
      const n = Math.max(1, Math.min(500, Math.floor(Number(e.target.value)) || 1));
      resizePops(n); e.target.value = n; renderPops(); refresh();
    });
    el('dzApplyN').addEventListener('click', () => {
      const n = Math.max(1, Math.min(5000, Math.floor(Number(el('dzAllN').value)) || 1));
      ds.pops.forEach(p => { p.n = n; }); renderPops(); refresh();
    });
  }

  function resizePops(n) {
    const bulk = ds.sampling === 'bulk';
    while (ds.pops.length < n) {
      const k = ds.pops.length + 1;
      const last = ds.pops[ds.pops.length - 1];
      ds.pops.push({ name: (bulk ? Tpl.unitWord(ds) : 'Pop') + k, n: last ? last.n : 20, region: last ? last.region : '', lat: '', lon: '', group: last ? last.group : '' });
    }
    ds.pops.length = n;
  }

  function renderPops() {
    const host = el('dzPops');
    host.innerHTML = '';
    if (ds.fill) {
      const d = ds.fill;
      host.appendChild(mk('p', { class: 'hint', style: 'margin:0' },
        `${d.nInd} rows${d.declaredPops ? ` in ${d.nPops} populations` : ''}${d.regions.length ? `, ${d.regions.length} regions` : ''}${d.ind.some(v => v.lat != null && isFinite(v.lat)) ? ', with coordinates' : ''} — taken from the loaded dataset.`));
      return;
    }
    const bulk = ds.sampling === 'bulk';
    const showN = !bulk;
    const showGroup = bulk && ds.useGroup;
    const showReg = ds.useRegion;
    const showXY = bulk ? ds.coords !== 'none' : ds.coords === 'pop';
    const t = mk('table');
    let head = `<th class="num">#</th><th>${bulk ? esc(Tpl.unitWord(ds)) + ' name' : 'Population'}</th>`;
    if (showN) head += '<th class="num">Plants (n)</th>';
    if (showGroup) head += '<th>Group</th>';
    if (showReg) head += '<th>Region</th>';
    if (showXY) head += '<th>Latitude</th><th>Longitude</th>';
    head += '<th></th>';
    t.innerHTML = `<thead><tr>${head}</tr></thead>`;
    const tb = mk('tbody');
    ds.pops.forEach((p, i) => {
      const tr = mk('tr');
      const cell = (key, type, cls, ph) => {
        const td = mk('td');
        const inp = mk('input', { type, class: cls || '', value: p[key] ?? '', placeholder: ph || '' });
        if (type === 'number') { inp.min = key === 'n' ? 1 : -180; inp.step = key === 'n' ? 1 : 'any'; }
        inp.addEventListener('input', () => { p[key] = type === 'number' && key === 'n' ? Math.max(0, Math.floor(Number(inp.value)) || 0) : inp.value; updateTotal(); later(); });
        inp.addEventListener('paste', ev => pasteColumn(ev, i, key));
        td.appendChild(inp);
        return td;
      };
      tr.appendChild(mk('td', { class: 'num' }, String(i + 1)));
      tr.appendChild(cell('name', 'text', 'nm'));
      if (showN) tr.appendChild(cell('n', 'number'));
      if (showGroup) tr.appendChild(cell('group', 'text', '', 'e.g. Cónico'));
      if (showReg) tr.appendChild(cell('region', 'text', '', 'e.g. Highlands'));
      if (showXY) { tr.appendChild(cell('lat', 'text', '', '19.43')); tr.appendChild(cell('lon', 'text', '', '-99.13')); }
      const td = mk('td');
      const rm = mk('button', { class: 'rm', type: 'button', title: 'Remove this row' }, '✕');
      rm.addEventListener('click', () => { if (ds.pops.length > 1) { ds.pops.splice(i, 1); el('dzNPops').value = ds.pops.length; renderPops(); refresh(); } });
      td.appendChild(rm); tr.appendChild(td);
      tb.appendChild(tr);
    });
    t.appendChild(tb);
    if (showN) {
      const tf = mk('tfoot');
      tf.innerHTML = `<tr><td></td><td>Total</td><td class="num" id="dzTotalN"></td><td colspan="${1 + (showReg ? 1 : 0) + (showXY ? 2 : 0)}"></td></tr>`;
      t.appendChild(tf);
    }
    host.appendChild(t);
    const add = mk('button', { class: 'btn btn-secondary btn-sm', type: 'button', style: 'margin-top:8px' }, bulk ? `+ Add a ${Tpl.unitWord(ds).toLowerCase()}` : '+ Add a population');
    add.addEventListener('click', () => { resizePops(ds.pops.length + 1); el('dzNPops').value = ds.pops.length; renderPops(); refresh(); });
    host.appendChild(add);
    updateTotal();
  }

  function updateTotal() {
    const c = el('dzTotalN');
    if (c) c.textContent = ds.pops.reduce((a, p) => a + (Number(p.n) || 0), 0);
  }

  /* pasting a column copied from a spreadsheet fills the rows downwards (tab-separated columns too) */
  function pasteColumn(ev, start, key) {
    const text = (ev.clipboardData || window.clipboardData).getData('text');
    if (!/[\r\n\t]/.test(text.trim())) return;
    ev.preventDefault();
    const lines = text.replace(/\r/g, '').split('\n').filter(l => l.trim() !== '');
    const order = ['name', ds.sampling === 'bulk' ? null : 'n', ds.sampling === 'bulk' && ds.useGroup ? 'group' : null, ds.useRegion ? 'region' : null, 'lat', 'lon'].filter(Boolean);
    const from = order.indexOf(key);
    if (start + lines.length > ds.pops.length) resizePops(start + lines.length);
    lines.forEach((l, r) => {
      l.split('\t').forEach((v, c) => {
        const k = order[from + c];
        if (!k) return;
        ds.pops[start + r][k] = k === 'n' ? Math.max(0, Math.floor(Number(v)) || 0) : v.trim();
      });
    });
    el('dzNPops').value = ds.pops.length;
    renderPops(); refresh();
  }

  /* ================================================================ 3 · markers / traits */

  function field(label, control, help) {
    const f = mk('div', { class: 'field' });
    f.appendChild(mk('label', null, label));
    f.appendChild(control);
    if (help) f.appendChild(mk('span', { class: 'field-help' }, help));
    return f;
  }
  function select(options, value, onChange) {
    const s = mk('select');
    options.forEach(([v, l]) => s.appendChild(mk('option', { value: v }, l)));
    s.value = value;
    s.addEventListener('change', () => onChange(s.value));
    return s;
  }
  function input(type, value, onInput, attrs) {
    const i = mk('input', Object.assign({ type, value: value ?? '' }, attrs || {}));
    i.addEventListener('input', () => onInput(i.value));
    return i;
  }

  function renderMarkers() {
    const host = el('dzMarkers');
    host.innerHTML = '';
    const k = K();
    el('dzMarkersTitle').textContent = { codominant: 'Loci', snp: 'SNPs', dominant: 'Bands', haploid: 'Loci', sequence: 'Gene regions', morph: 'Traits' }[ds.kind];
    const grid = mk('div', { class: 'field-grid' });
    host.appendChild(grid);
    const fill = !!ds.fill;

    if (['codominant', 'snp', 'haploid'].includes(ds.kind)) {
      if (!fill) {
        const nIn = input('number', ds.nLoci, v => { ds.nLoci = v; later(); }, { min: 1, max: 100000 });
        grid.appendChild(field(`Number of ${k.lociWord}`, nIn, 'Ignored when names are typed below.'));
        grid.appendChild(field('Name prefix', input('text', ds.prefix, v => { ds.prefix = v; later(); }, { placeholder: k.prefix }), `${ds.prefix || k.prefix}01, ${ds.prefix || k.prefix}02…`));
      }
      if (ds.kind !== 'haploid') {
        grid.appendChild(field('Ploidy', select([['2', 'Diploid'], ['3', 'Triploid'], ['4', 'Tetraploid'], ['6', 'Hexaploid']], String(ds.ploidy), v => { ds.ploidy = Number(v); refresh(); })));
        if (fill) grid.lastChild.querySelector('select').disabled = true;
        grid.appendChild(field('Genotype layout', select([['columns', `${ds.ploidy} columns per locus (one allele per column)`], ['combined', 'One cell per genotype (182/186)']], ds.genoCells, v => { ds.genoCells = v; refresh(); }),
          'Columns are safer to type; one cell per genotype is easier to read.'));
      }
      grid.appendChild(field('Missing data written as', select([['0', '0'], ['-9', '-9'], ['', 'empty cell']], ds.missing, v => { ds.missing = v; refresh(); })));
      if (!fill) {
        const ta = mk('textarea', { class: 'dz-names', placeholder: ds.kind === 'snp' ? 'S1_10234\nS1_55871\n…' : 'phi024\nphi053\numc1147\n…' });
        ta.value = ds.names;
        ta.addEventListener('input', () => { ds.names = ta.value; later(); });
        host.appendChild(field(`Or type the ${k.lociWord} names (one per line)`, ta, 'Paste them from a spreadsheet column. “NAME x 3” creates NAME_1, NAME_2, NAME_3.'));
      }
    } else if (ds.kind === 'dominant') {
      if (!fill) grid.appendChild(field('How bands are named', select([['numbered', 'Numbered (B001, B002…)'], ['primers', 'By primer (UBC807_01…)'], ['list', 'I will type the names']], ds.bandMode, v => { ds.bandMode = v; renderMarkers(); refresh(); })));
      grid.appendChild(field('Sheet orientation', select([['rows-are-individuals', 'One row per sample (recommended)'], ['rows-are-loci', 'One row per band (gel reading sheet)']], ds.orientation, v => { ds.orientation = v; refresh(); }),
        'Both are read correctly; only rows per sample can hold populations and coordinates.'));
      grid.appendChild(field('Missing data written as', select([['-9', '-9'], ['-1', '-1'], ['', 'empty cell']], ds.missing, v => { ds.missing = v; refresh(); }), 'Never use 0: it means “band absent”.'));
      if (!fill && ds.bandMode === 'numbered') {
        grid.appendChild(field('Number of bands', input('number', ds.nLoci, v => { ds.nLoci = v; later(); }, { min: 1, max: 100000 })));
        grid.appendChild(field('Name prefix', input('text', ds.prefix, v => { ds.prefix = v; later(); }, { placeholder: 'B' })));
      } else if (!fill && ds.bandMode === 'primers') {
        host.appendChild(rowTable(ds.primers, [['name', 'Primer', 'text', 'nm', 'UBC807'], ['bands', 'Scored bands', 'number', '', '10']], () => ({ name: 'Primer' + (ds.primers.length + 1), bands: 10 }), '+ Add a primer'));
      } else if (!fill) {
        const ta = mk('textarea', { class: 'dz-names', placeholder: 'UBC807 x 12\nUBC808 x 9\n…' });
        ta.value = ds.names;
        ta.addEventListener('input', () => { ds.names = ta.value; later(); });
        host.appendChild(field('Band names (one per line)', ta, '“UBC807 x 12” creates UBC807_1 … UBC807_12.'));
      }
    } else if (ds.kind === 'sequence') {
      grid.appendChild(field('File layout', select([['sheet', 'One sheet, one column per region'], ['fasta', 'FASTA file + sample sheet']], ds.seqLayout, v => { ds.seqLayout = v; refresh(); }),
        'The FASTA layout suits long alignments exported from alignment software.'));
      if (!fill) host.appendChild(rowTable(ds.regions, [['name', 'Gene region', 'text', 'nm', 'trnL-trnF'], ['length', 'Aligned length (bp, optional)', 'number', '', '850']], () => ({ name: 'Region' + (ds.regions.length + 1), length: '' }), '+ Add a region'));
    } else if (ds.kind === 'morph') {
      if (!fill) host.appendChild(rowTable(ds.traits, [['name', 'Trait', 'text', 'nm', 'PlantHeight'], ['unit', 'Unit', 'text', '', 'cm'],
        ['type', 'Type', [['quantitative', 'Continuous measurement'], ['count', 'Count'], ['ordinal', 'Ordinal scale (1–9)'], ['categorical', 'Categorical (colour, shape)'], ['binary', 'Presence / absence']]]],
        () => ({ name: 'Trait' + (ds.traits.length + 1), unit: '', type: 'quantitative' }), '+ Add a trait'));
      else host.appendChild(mk('p', { class: 'hint' }, `${ds.fill.traits.vars.length} traits taken from the loaded dataset.`));
    }
    if (fill && !['morph'].includes(ds.kind)) host.appendChild(mk('p', { class: 'hint', style: 'margin-top:8px' }, `${Tpl.locusNames(ds).length} ${k.lociWord} taken from the loaded dataset.`));
  }

  /* a small editable table bound to an array of objects */
  function rowTable(arr, cols, factory, addLabel) {
    const wrap = mk('div', { class: 'table-scroll dz-table', style: 'margin-top:8px' });
    const draw = () => {
      wrap.innerHTML = '';
      const t = mk('table');
      t.innerHTML = '<thead><tr><th class="num">#</th>' + cols.map(c => `<th>${c[1]}</th>`).join('') + '<th></th></tr></thead>';
      const tb = mk('tbody');
      arr.forEach((o, i) => {
        const tr = mk('tr');
        tr.appendChild(mk('td', { class: 'num' }, String(i + 1)));
        cols.forEach(([key, , type, cls, ph]) => {
          const td = mk('td');
          let ctl;
          if (Array.isArray(type)) { ctl = select(type, o[key], v => { o[key] = v; later(); }); }
          else {
            ctl = mk('input', { type, class: cls || '', value: o[key] ?? '', placeholder: ph || '' });
            ctl.addEventListener('input', () => { o[key] = ctl.value; later(); });
            ctl.addEventListener('paste', ev => {
              const text = (ev.clipboardData || window.clipboardData).getData('text');
              if (!/[\r\n\t]/.test(text.trim())) return;
              ev.preventDefault();
              const lines = text.replace(/\r/g, '').split('\n').filter(l => l.trim() !== '');
              const keys = cols.map(c => c[0]);
              const from = keys.indexOf(key);
              lines.forEach((l, r) => {
                if (!arr[i + r]) arr.push(factory());
                l.split('\t').forEach((v, c) => { const k2 = keys[from + c]; if (k2) arr[i + r][k2] = v.trim(); });
              });
              draw(); refresh();
            });
          }
          td.appendChild(ctl); tr.appendChild(td);
        });
        const td = mk('td');
        const rm = mk('button', { class: 'rm', type: 'button', title: 'Remove' }, '✕');
        rm.addEventListener('click', () => { if (arr.length > 1) { arr.splice(i, 1); draw(); refresh(); } });
        td.appendChild(rm); tr.appendChild(td);
        tb.appendChild(tr);
      });
      t.appendChild(tb);
      wrap.appendChild(t);
      const add = mk('button', { class: 'btn btn-secondary btn-sm', type: 'button', style: 'margin-top:8px' }, addLabel);
      add.addEventListener('click', () => { arr.push(factory()); draw(); refresh(); });
      wrap.appendChild(add);
    };
    draw();
    return wrap;
  }

  /* ================================================================ 4 · output */

  function refresh() {
    if (!ds) return;
    const k = K();
    const names = Tpl.locusNames(ds);
    const us = Tpl.units(ds);
    const sizes = Tpl.popSizes(ds);
    const fastaLayout = ds.kind === 'sequence' && ds.seqLayout === 'fasta';
    const g = Tpl.grid(ds);
    const nLabel = g.header.length - (Tpl.KINDS[ds.kind].dataKind === 'codominant' && ds.genoCells === 'columns' && ds.orientation !== 'rows-are-loci' ? names.length * ds.ploidy : ds.orientation === 'rows-are-loci' && ds.kind === 'dominant' ? us.length : names.length);
    const dataCols = g.header.length - nLabel;
    const cellsToFill = ds.orientation === 'rows-are-loci' && ds.kind === 'dominant' ? names.length * us.length : us.length * dataCols;

    statTiles('dzTiles', [
      [Tpl.unitWord(ds, true), us.length, sizes.length ? `in ${sizes.length} ${ds.sampling === 'bulk' ? 'groups' : 'populations'}` : 'no grouping column'],
      [k.lociWord.charAt(0).toUpperCase() + k.lociWord.slice(1), names.length, ds.kind === 'codominant' || ds.kind === 'snp' ? `${ds.ploidy}n · ${ds.genoCells === 'columns' ? ds.ploidy + ' columns each' : 'one cell each'}` : ''],
      ['Sheet size', `${g.rows.length + 2} × ${g.header.length}`, fastaLayout ? 'sample sheet + FASTA' : 'rows × columns, with the 2 header rows'],
      ['Cells to fill in', cellsToFill.toLocaleString('en-US'), ds.fill ? 'already filled from your data' : 'the genotype or trait cells'],
    ]);

    /* checks */
    const adv = Tpl.advice(ds);
    const ul = el('dzAdvice');
    ul.innerHTML = '';
    adv.forEach(a => ul.appendChild(mk('li', { class: a.level }, a.text)));
    if (!adv.length) ul.appendChild(mk('li', { class: 'ok' }, 'Nothing to warn about.'));
    const blocking = adv.some(a => a.level === 'error');

    /* capabilities of the planned dataset */
    const caps = Data.capabilities(Tpl.mock(ds), null);
    const cg = el('dzCaps');
    cg.innerHTML = '';
    CAPS.forEach(([key, label]) => {
      const c = caps[key];
      const on = c && c.ok;
      cg.appendChild(mk('span', { class: 'dz-cap ' + (on ? 'ok' : 'off'), title: on ? '' : (c && c.why) || '' }, label));
    });

    renderPreview(g, names, us, fastaLayout);
    renderDownloads(blocking, fastaLayout);
  }

  function renderPreview(g, names, us, fastaLayout) {
    const host = el('dzPreview');
    host.innerHTML = '';
    if (fastaLayout) {
      const pre = mk('pre', { class: 'formula', style: 'white-space:pre;margin:0' });
      pre.textContent = Tpl.fasta(ds).split('\n').slice(0, 10).map(l => (l.length > 90 ? l.slice(0, 90) + '…' : l)).join('\n') + (us.length > 5 ? '\n…' : '');
      host.appendChild(pre);
      el('dzPreviewNote').innerHTML = 'The FASTA file has a header line per sequence, <code>&gt;ID | Population</code>; paste each aligned sequence under its header. Populations, regions and coordinates also go in the sample sheet, which you load after the FASTA file.';
      return;
    }
    const sig = Tpl.signature(ds);
    const maxC = Math.min(g.header.length, 14), maxR = Math.min(g.rows.length, 7);
    const t = mk('table');
    const rowNo = n => `<td class="tpl-rowno">${n}</td>`;
    const cell = v => (v === '' || v == null ? '<td class="tpl-empty">·</td>' : `<td>${esc(String(v).length > 28 ? String(v).slice(0, 28) + '…' : v)}</td>`);
    let html = '<tbody>';
    html += `<tr class="tpl-sig">${rowNo(1)}<td colspan="${maxC + (g.header.length > maxC ? 1 : 0)}">${esc(sig.slice(0, -1).join('   '))}</td></tr>`;
    html += `<tr>${'<th class="tpl-rowno">2</th>'}${g.header.slice(0, maxC).map(h => `<th>${esc(h)}</th>`).join('')}${g.header.length > maxC ? `<th>… +${g.header.length - maxC}</th>` : ''}</tr>`;
    g.rows.slice(0, maxR).forEach((r, i) => {
      html += `<tr>${rowNo(i + 3)}${r.slice(0, maxC).map(cell).join('')}${g.header.length > maxC ? '<td class="tpl-empty">…</td>' : ''}</tr>`;
    });
    if (g.rows.length > maxR) html += `<tr>${rowNo('⋮')}<td class="tpl-empty" colspan="${maxC + (g.header.length > maxC ? 1 : 0)}">… ${g.rows.length - maxR} more rows</td></tr>`;
    html += '</tbody>';
    t.innerHTML = html;
    host.appendChild(t);
    el('dzPreviewNote').innerHTML = ds.orientation === 'rows-are-loci' && ds.kind === 'dominant'
      ? '<b>Row 1</b> declares the layout — leave it as it is. <b>Row 2</b> names the samples (one column each); from row 3 on, each row is a band: write 1 or 0 under every sample.'
      : `<b>Row 1</b> declares the layout — leave it as it is. <b>Row 2</b> names the columns. From row 3 on, one row per ${esc(Tpl.unitWord(ds).toLowerCase())}: the grey dots are the cells you fill in.`;
  }

  function renderDownloads(blocking, fastaLayout) {
    const host = el('dzDownloads');
    host.innerHTML = '';
    const base = slug(ds.title || (ds.fill ? 'dataset' : ds.kind + '_' + Tpl.KINDS[ds.kind].lociWord)) + (ds.fill ? '_popgeneticspro' : '_template');
    const card = (ext, title, sub, fn, opts) => {
      opts = opts || {};
      const b = mk('button', { class: 'dl-card' + (opts.primary ? ' primary' : ''), type: 'button', title: opts.why || '' });
      b.innerHTML = `<span class="dl-ext">${ext}</span><span><span class="dl-t">${title}</span><br><span class="dl-s">${opts.why ? esc(opts.why) : sub}</span></span>`;
      if (blocking || opts.disabled) b.disabled = true;
      b.addEventListener('click', () => {
        try { fn(); }
        catch (e) { console.error(e); showMessage('dzMessages', 'error', 'The file could not be written: ' + esc(e.message)); }
      });
      host.appendChild(b);
    };
    card('XLSX', fastaLayout ? 'Sample sheet (.xlsx)' : 'Spreadsheet template (.xlsx)', fastaLayout ? 'IDs, populations, coordinates + instructions' : 'Data, Instructions and Design sheets', () => download(Tpl.xlsx(ds), base + '.xlsx'), { primary: true });
    if (fastaLayout) {
      card('FASTA', 'FASTA skeleton', 'one header per sequence, ready to paste into', () => download(Tpl.fasta(ds), base + '.fasta', 'text/plain;charset=utf-8'));
      card('CSV', 'Sample sheet (CSV)', 'the same sample sheet as plain text', () => download(Tpl.toCSV(Tpl.sampleSheetRows(ds)), base + '_samples.csv', 'text/csv;charset=utf-8'));
    } else {
      card('CSV', 'CSV template', 'the same layout as plain text', () => download(Tpl.csv(ds), base + '.csv', 'text/csv;charset=utf-8'));
      const gx = Tpl.paramLayoutOK(ds);
      card('PARAM', 'Parameter-row layout', 'counts in row 1, names in row 2, headers in row 3', () => download(Tpl.paramLayoutCSV(ds), base.replace(/_(template|popgeneticspro)$/, '') + '_parameter_rows.csv', 'text/csv;charset=utf-8'), { disabled: !gx.ok, why: gx.ok ? '' : gx.why });
      if (ds.kind === 'sequence') card('FASTA', 'FASTA skeleton', 'if you prefer to paste sequences in a FASTA file', () => download(Tpl.fasta(ds), base + '.fasta', 'text/plain;charset=utf-8'));
    }
    if (!fastaLayout && window.Sheet) card('SHEET', 'Fill it in here', 'opens this layout in the built-in data sheet, no download needed', () => Sheet.open({ rows: Tpl.pgpRows(ds), name: base, force: !Sheet.toRows().length }), { primary: false });
    card('TXT', 'Instructions', 'how to fill in this template, and the design checks', () => download(Tpl.instructions(ds), base + '_instructions.txt', 'text/plain;charset=utf-8'));
    if (blocking) host.appendChild(mk('p', { class: 'hint', style: 'grid-column:1/-1;margin:0' }, 'Fix the items marked ✕ above to enable the downloads.'));
  }

  /* ================================================================ init */

  function init() {
    if (!el('cardDesigner')) return;
    el('btnOpenDesigner').addEventListener('click', () => open(false));
    el('dzClose').addEventListener('click', () => { el('cardDesigner').style.display = 'none'; });
    el('dzFromData').addEventListener('click', () => open(true));
    bindSampling();
  }

  document.addEventListener('DOMContentLoaded', init);
  window.Designer = { open, get design() { return ds; }, refresh };
})();
