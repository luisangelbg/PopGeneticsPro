/* PopGeneticsPro — Block 2: load the data, agree on what it is, screen it.

   The rule of this block: nothing is silently assumed. Every guess the app makes
   (orientation, marker type, which column is the population) is shown, explained
   and editable before a single statistic is computed. */

(function () {

  const B2 = {
    file: null, rows: null, format: null, cfg: null, detection: null, roleOverrides: {},
  };
  window.B2 = B2;

  const EXAMPLES = [
    { file: 'data/maize_issr_races.xlsx', name: 'Maize landraces · ISSR', sub: '31 bands × 15 Mexican landraces, one bulk sample each — and the rows are loci, so the app has to notice', kind: 'dominant' },
    { file: 'data/maize_ssr_populations.csv', name: 'Maize populations · SSR', sub: '8 microsatellites, 3 populations × 25 plants, two columns per locus', kind: 'codominant' },
    { file: 'data/agave_aflp.csv', name: 'Agave · AFLP', sub: '60 bands, 4 populations × 20 plants, with coordinates', kind: 'dominant' },
    { file: 'data/pine_cpdna.fasta', name: 'Pine · chloroplast DNA', sub: '48 aligned sequences from 4 populations', kind: 'sequence' },
    { file: 'data/maize_morphology.csv', name: 'Maize · morphology', sub: '9 traits measured on the same plants', kind: 'morph' },
    { file: 'data/genera_dating.fasta', name: 'Five genera · dating with fossils', sub: 'Synthetic: 16 species of five invented genera and an outgroup, 1600 sites simulated on a known dated tree with fictitious fossils. Open Block 8 · Divergence times to date it and compare with the true ages', kind: 'sequence', dating: true },
  ];

  const KIND_LABEL = {
    codominant: 'Codominant (SSR, SNP, isozyme) — two alleles visible per locus',
    dominant: 'Dominant / binary (AFLP, ISSR, RAPD) — band present or absent',
    haploid: 'Haploid (cpDNA/mtDNA haplotype codes, one allele per locus)',
    sequence: 'Aligned DNA sequences',
    morph: 'Morphological / quantitative traits',
  };

  /* ================================================================
     loading
     ================================================================ */

  function init() {
    const dz = el('dzData');
    if (!dz) return;
    const input = el('fileInput');
    dz.addEventListener('click', () => input.click());
    dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('dragover'); });
    dz.addEventListener('dragleave', () => dz.classList.remove('dragover'));
    dz.addEventListener('drop', e => {
      e.preventDefault(); dz.classList.remove('dragover');
      if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
    });
    input.addEventListener('change', () => { if (input.files.length) handleFile(input.files[0]); });

    const row = el('exampleRow');
    EXAMPLES.forEach(ex => {
      const b = mk('button', { class: 'btn btn-secondary btn-sm' }, ex.name);
      b.title = ex.sub;
      b.addEventListener('click', () => loadExample(ex));
      row.appendChild(b);
    });

    el('sheetPicker').addEventListener('change', () => interpret(Data.sheetRows(B2.file.workbook, el('sheetPicker').value)));
    el('btnSampleSheet').addEventListener('click', () => el('sampleSheetInput').click());
    el('sampleSheetInput').addEventListener('change', e => { if (e.target.files.length) loadSampleSheet(e.target.files[0]); e.target.value = ''; });
    el('btnSampleSheetTpl').addEventListener('click', sampleSheetTemplate);
    if (el('btnConvert')) el('btnConvert').addEventListener('click', () => window.Designer && Designer.open(true));
    if (el('btnFixInSheet')) el('btnFixInSheet').addEventListener('click', async () => {
      if (!window.Sheet || !B2.sourceRows) return;
      const issues = state.data && state.data.issues;
      if (!B2.fromSheet) await Sheet.open({ rows: B2.sourceRows, name: (state.fileName || 'data').replace(/\.[^.]+$/, '') + '_corrected', force: true });
      else await Sheet.open();
      Sheet.markIssues(issues);
      B2.fromSheet = true;
    });
    ['optOrientation', 'optKind', 'optPloidy', 'optMissing', 'optHeader', 'optUnitName', 'optGenoCells'].forEach(id => {
      const n = el(id);
      if (n) n.addEventListener('change', () => { B2.roleOverrides = {}; applyOptions(); });
    });
    el('btnBuild').addEventListener('click', build);
    el('btnShowAllCols').addEventListener('change', renderRoles);
    el('btnContinue').addEventListener('click', () => continueAfter(2, 'qcMessages'));
  }

  function resetUI() {
    ['cardInterpret', 'cardRoles', 'cardQC', 'cardCapabilities', 'cardSampleSheet'].forEach(id => { const n = el(id); if (n) n.style.display = 'none'; });
    clearMessages('dataMessages');
    B2.template = null;
    B2.roleOverrides = {};
    B2.example = null;
  }

  /* a sample sheet adds populations, regions and coordinates to FASTA/VCF/… */
  function loadSampleSheet(file) {
    clearMessages('sampleSheetMessages');
    Data.readFile(file).then(f => {
      const rows = f.kind === 'workbook' ? Data.sheetRows(f.workbook, f.sheets[0]) : Data.parseDelimited(f.text);
      const tpl = Data.readTemplateHeader(rows);
      const res = Data.attachSampleSheet(state.data, tpl ? Data.trimRows(rows.slice(1)) : rows);
      const d = state.data;
      if (!res.matched) { showMessage('sampleSheetMessages', 'error', `None of the IDs in <b>${esc(file.name)}</b> matches the names in the data file (e.g. ${esc(d.ind.slice(0, 3).map(v => v.id).join(', '))}).`); return; }
      const bits = [`<b>${res.matched} of ${d.nInd}</b> ${UNIT()} matched`];
      if (res.columns.pop) bits.push(`${d.declaredPops ? d.nPops : 0} populations`);
      if (res.columns.region) bits.push(`${d.regions.length} regions`);
      if (res.columns.coords) bits.push(`${d.ind.filter(v => v.lat != null && isFinite(v.lat)).length} mapped`);
      showMessage('sampleSheetMessages', res.unmatched.length ? 'warning' : 'success', bits.join(' · ') + '.' +
        (res.unmatched.length ? ` Not in the sheet: ${esc(res.unmatched.slice(0, 6).join(', '))}${res.unmatched.length > 6 ? '…' : ''}${d.declaredPops ? ' — without a population they are left out of every population-level analysis' : ''}.` : '') +
        (res.extra.length ? ` In the sheet but not in the data: ${esc(res.extra.slice(0, 6).join(', '))}${res.extra.length > 6 ? '…' : ''}.` : ''));
      afterBuild();
    }).catch(e => showMessage('sampleSheetMessages', 'error', esc(e.message || String(e))));
  }

  function sampleSheetTemplate() {
    const d = state.data;
    if (!d) return;
    const rows = [['ID', 'Population', 'Region', 'Latitude', 'Longitude']].concat(d.ind.map(v => [v.id, d.declaredPops ? (v.pop || '') : '', v.region || '', v.lat ?? '', v.lon ?? '']));
    download(Tpl.toCSV(rows), slug(state.fileName) + '_samples.csv', 'text/csv;charset=utf-8');
  }

  /* rows typed or pasted in the built-in data sheet go through the same path as a file */
  B2.interpretRows = (rows, name, opts) => {
    opts = opts || {};
    resetUI();
    B2.file = null; B2.format = 'table'; B2.fromSheet = !!opts.fromSheet;
    state.fileName = name || 'data sheet';
    el('fileNameLabel').textContent = state.fileName;
    el('sheetRow').style.display = 'none';
    interpret(Data.trimRows(rows));
    if (opts.header === false && el('optHeader').checked) { el('optHeader').checked = false; applyOptions(); }
    showMessage('dataMessages', 'info', 'Data taken from the data sheet. Check how they were read below, then build the dataset; any problem will be marked on the sheet.');
  };

  function handleFile(file) {
    resetUI();
    B2.fromSheet = false;
    Data.readFile(file).then(f => {
      B2.file = f;
      state.fileName = f.name;
      el('fileNameLabel').textContent = f.name;
      if (f.kind === 'workbook') {
        const sp = el('sheetPicker');
        sp.innerHTML = '';
        f.sheets.forEach(s => sp.appendChild(mk('option', { value: s }, s)));
        el('sheetRow').style.display = f.sheets.length > 1 ? '' : 'none';
        interpret(Data.sheetRows(f.workbook, f.sheets[0]));
      } else {
        el('sheetRow').style.display = 'none';
        const fmt = Data.sniffFormat(f);
        B2.format = fmt;
        if (fmt === 'table') interpret(Data.parseDelimited(f.text));
        else parseSpecial(fmt, f.text);
      }
    }).catch(e => showMessage('dataMessages', 'error', esc(e.message || String(e))));
  }

  function loadExample(ex) {
    resetUI();
    B2.fromSheet = false;
    B2.example = ex;
    Data.loadExample(ex.file).then(f => {
      B2.file = f;
      state.fileName = f.name;
      el('fileNameLabel').textContent = f.name + '  (example)';
      if (f.kind === 'workbook') {
        el('sheetRow').style.display = 'none';
        interpret(Data.sheetRows(f.workbook, f.sheets[0]));
      } else {
        const fmt = Data.sniffFormat(f);
        B2.format = fmt;
        if (fmt === 'table') interpret(Data.parseDelimited(f.text));
        else parseSpecial(fmt, f.text);
      }
    }).catch(e => showMessage('dataMessages', 'error', esc(e.message || String(e))));
  }

  /* generic names of the text formats, by content and extension */
  const FORMAT_NAME = {
    fasta: 'FASTA alignment', vcf: 'VCF variant file',
    gen: '.gen population file (loci, then POP blocks)', arp: '.arp project file (profile and sample blocks)',
    str: '.str genotype file (one or two rows per individual)',
  };

  /* formats that carry their own structure need no role table */
  function parseSpecial(fmt, text) {
    try {
      const d = fmt === 'fasta' ? Data.parseFasta(text)
        : fmt === 'vcf' ? Data.parseVcf(text)
          : fmt === 'gen' ? Data.parseGenFile(text)
            : fmt === 'arp' ? Data.parseArpFile(text)
              : Data.parseStrFile(text);
      d.meta = Object.assign({ source: fmt }, d.meta);
      setUnit('individuals');
      state.data = d;
      state.format = fmt;
      showMessage('dataMessages', 'success',
        `Read as a <b>${FORMAT_NAME[fmt] || fmt}</b>: ${d.nInd} individuals, ${d.nLoci} ${d.kind === 'sequence' ? 'alignment' : 'loci'}, ${d.declaredPops ? d.nPops + ' populations' : 'no population column'}.`);
      el('cardInterpret').style.display = 'none';
      el('cardRoles').style.display = 'none';
      /* these formats rarely carry regions or coordinates (VCF not even populations) */
      el('cardSampleSheet').style.display = '';
      el('sampleSheetHint').innerHTML = `Files of this kind (${FORMAT_NAME[fmt] || fmt}) ${d.declaredPops ? 'carry populations but not regions or coordinates' : 'do not carry populations, regions or coordinates'}. To add them, load a sheet with an <b>ID</b> column (the same names as in the file) and any of <b>Population</b>, <b>Region</b>, <b>Latitude</b>, <b>Longitude</b>.`;
      clearMessages('sampleSheetMessages');
      afterBuild();
    } catch (e) {
      showMessage('dataMessages', 'error', 'This file looks like ' + fmt + ' but could not be parsed: ' + esc(e.message));
    }
  }

  /* ================================================================
     interpretation of a plain table
     ================================================================ */

  function interpret(rows) {
    if (!rows || rows.length < 2) { showMessage('dataMessages', 'error', 'The sheet has no usable rows.'); return; }
    /* the rows as they came, so the file can be opened and corrected in the data sheet */
    B2.sourceRows = rows.map(r => r.map(v => (v == null ? '' : v)));
    /* a PopGeneticsPro template declares its layout in row 1: nothing to guess */
    const tpl = Data.readTemplateHeader(rows);
    if (tpl) rows = Data.trimRows(rows.slice(1));
    B2.template = tpl;
    B2.rows = rows;
    const paramHdr = tpl ? null : Data.readParameterHeader(rows);
    const rows0 = paramHdr ? rows.slice(paramHdr.headerRow) : rows;
    const or = tpl ? { orientation: tpl.orientation, why: 'the template says so' } : Data.guessOrientation(rows0);
    B2.detection = { paramHdr, or };

    /* marker type guess */
    const work = or.orientation === 'rows-are-loci' ? Data.transpose(rows0) : rows0;
    const header = work[0].map(v => String(v ?? '').trim());
    const body = work.slice(1);
    const pairs = Data.detectCodominantPairs(header);
    const prof = Data.matrixProfile(work, 1, 1);

    /* Type the marker from the DATA columns only: a latitude column or a text ID
       would otherwise make a clean 0/1 band matrix look like measurements. */
    const profs = header.map((h, j) => Data.profileColumn(body, j));
    const namedLabel = (h, j) => RE.id.test(h) || ['pop', 'region', 'lat', 'lon'].some(k => isRoleName(k, h, profs[j]));
    const looksLabel = header.map((h, j) => {
      if (namedLabel(h, j)) return true;
      return j <= 3 && profs[j].text > profs[j].numeric;   // leading text column
    });
    const dataIdx = header.map((_, j) => j).filter(j => !looksLabel[j]);
    const frac = test => dataIdx.length ? dataIdx.filter(test).length / dataIdx.length : 0;
    const fBinary = frac(j => profs[j].binary);
    const fQuant = frac(j => profs[j].kind === 'quantitative');
    const fText = frac(j => profs[j].text > profs[j].numeric);
    /* text cells that are really genotypes ("182/186") or whole sequences; a leading
       text column may hold them, so every column not named as a label is inspected */
    const candidates = header.map((_, j) => j).filter(j => !namedLabel(header[j], j));
    const shape = candidates.map(j => ({ j, s: Data.cellShapes(body, [j]) }));
    const seqCols = shape.filter(c => c.s.n && c.s.fSeq > 0.6).length;
    const combCols = shape.filter(c => c.s.n && (c.s.fCombined > 0.6 || c.s.fLetters2 > 0.6)).length;

    let kind, kindWhy, genoCells = 'columns';
    if (tpl && tpl.kind) {
      kind = tpl.kind; genoCells = tpl.cells === 'combined' ? 'combined' : 'columns';
      kindWhy = 'row 1 of the template declares it';
    } else if (paramHdr) {
      if (paramHdr.columnsPerLocus === 1) { kind = fBinary > 0.9 ? 'dominant' : 'haploid'; kindWhy = `the parameter rows declare ${paramHdr.nLoci} loci in ${paramHdr.nGenetic} columns, one per locus`; }
      else { kind = 'codominant'; kindWhy = paramHdr.columnsPerLocus === 2 ? `the parameter rows declare ${paramHdr.nLoci} loci in ${paramHdr.nGenetic} columns, two per locus` : 'the parameter rows are there (its column count does not divide evenly by the loci — check the checks below)'; }
    } else if (fBinary > 0.9) {
      /* the 0/1 test comes first: nothing else looks like a band matrix */
      kind = 'dominant'; kindWhy = `${Math.round(fBinary * 100)}% of the data columns hold only 0 and 1`;
    } else if (seqCols >= 1) {
      kind = 'sequence'; kindWhy = `${seqCols} column${seqCols > 1 ? 's hold' : ' holds'} whole DNA sequences`;
    } else if (combCols >= 1 && combCols >= 0.5 * Math.max(1, candidates.length - 2)) {
      kind = 'codominant'; genoCells = 'combined'; kindWhy = `${combCols} columns hold whole genotypes written in one cell (e.g. 182/186)`;
    } else if (pairs.looksCodominant && pairs.pairs * 2 >= dataIdx.length * 0.8) {
      kind = 'codominant'; kindWhy = `the column names come in ${pairs.pairs} pairs, two per locus`;
    } else if (fQuant > 0.5) {
      kind = 'morph'; kindWhy = 'the data columns hold continuous measurements';
    } else if (fText > 0.6) {
      kind = 'haploid'; kindWhy = 'the data columns hold one code per locus';
    } else { kind = 'codominant'; kindWhy = 'no clearer pattern was found'; }

    el('optOrientation').value = or.orientation;
    el('optKind').value = kind;
    el('optGenoCells').value = genoCells;
    const ploidy = tpl && tpl.ploidy ? tpl.ploidy : 2;
    if (![...el('optPloidy').options].some(o => o.value === String(ploidy))) el('optPloidy').appendChild(mk('option', { value: ploidy }, ploidy + '-ploid'));
    el('optPloidy').value = String(ploidy);
    el('optMissing').value = tpl && tpl.missing != null ? tpl.missing : paramHdr && kind === 'dominant' ? '-1' : kind === 'codominant' ? '0' : '';
    el('optHeader').checked = true;
    /* a transposed band matrix (one column per race) is the layout of landrace studies */
    el('optUnitName').value = tpl && tpl.unit && UNIT_NAMES[tpl.unit] ? tpl.unit : or.orientation === 'rows-are-loci' ? 'landraces' : 'individuals';

    const why = [];
    if (tpl) {
      why.push(`this is a <b>PopGeneticsPro template</b>: row 1 declares ${tpl.loci != null ? tpl.loci + ' ' : ''}${kind === 'morph' ? 'traits' : kind === 'sequence' ? 'gene regions' : 'loci'}` +
        `${tpl.units != null ? ', ' + tpl.units + ' ' + esc(tpl.unit || 'rows') : ''}${tpl.pops ? ' in ' + tpl.pops + ' populations' : ''}, and the layout was applied exactly as declared`);
    }
    if (paramHdr) why.push(`<b>parameter rows</b> were found (${paramHdr.nLoci} loci, ${paramHdr.nInd} individuals, ${paramHdr.nPop} populations${paramHdr.regions ? ', ' + paramHdr.regions.n + ' regions' : ''}) and is being used`);
    if (!tpl) why.push(`rows are read as <b>${or.orientation === 'rows-are-loci' ? 'loci' : 'individuals'}</b> because ${or.why}`);
    const kindWord = { codominant: 'codominant', dominant: 'dominant', haploid: 'haploid', sequence: 'aligned sequences', morph: 'morphological traits' }[kind] || kind;
    why.push(`the data are <b>${kindWord}</b>${genoCells === 'combined' ? ' (one cell per genotype)' : ''} because ${kindWhy}${tpl ? '' : ` (${kind === 'sequence' ? seqCols : genoCells === 'combined' ? combCols : dataIdx.length} data columns, ${fmtPct(prof.missing / Math.max(1, prof.n))} empty)`}`);
    el('detectionText').innerHTML = (tpl ? '' : 'What the file looks like: ') + why.join('; ') + '.';

    el('cardInterpret').style.display = '';
    applyOptions();
  }

  /* rebuild the working table and the role table whenever an option changes */
  function applyOptions() {
    const paramHdr = B2.detection && B2.detection.paramHdr;
    let rows0 = paramHdr ? B2.rows.slice(paramHdr.headerRow) : B2.rows;
    const orientation = el('optOrientation').value;
    el('optGenoCellsField').style.display = el('optKind').value === 'codominant' ? '' : 'none';
    /* parameter rows keep regions as block sizes in row 1: turn them into a Region column */
    if (paramHdr && paramHdr.regions && orientation === 'rows-are-individuals' && !rows0[0].some(h => RE.region.test(String(h ?? '').trim()))) {
      let at = 0;
      const regOf = [];
      paramHdr.regions.sizes.forEach((n, k) => { for (let i = 0; i < n; i++) regOf[at++] = paramHdr.regions.names[k]; });
      rows0 = rows0.map((r, i) => r.concat(i === 0 ? ['Region'] : [regOf[i - 1] ?? null]));
    }
    let work = orientation === 'rows-are-loci' ? Data.transpose(rows0) : rows0;
    if (!el('optHeader').checked) {
      const head = work[0].map((_, j) => 'C' + (j + 1));
      work = [head, ...work];
    }
    /* After transposing, the corner cell of the file (e.g. "ISSR") was the label of the
       loci column, not of the units: it must not become the name of the units column,
       or the landraces would read as values of "ISSR". */
    B2.cornerLabel = null;
    setUnit(el('optUnitName').value);
    if (orientation === 'rows-are-loci' && el('optHeader').checked) {
      B2.cornerLabel = String(work[0][0] ?? '').trim();
      work = work.map((r, i) => (i === 0 ? [UNIT(false, true)].concat(r.slice(1)) : r));
    }
    B2.work = work;
    autoRoles();
    renderPreview();
    renderRoles();
    el('cardRoles').style.display = '';
  }

  /* A label column is recognised by its whole name, perhaps plural, with a unit or a note in brackets
     ("Latitude (°)", "Lat_N", "Poblaciones"). A name that only begins with the word ("Poblacion_origen")
     counts for a population or a region when the column holds text: "Longitud_mazorca", "Lateral_ramas",
     "Area_foliar" or "Estado_fenologico" are traits measured on the plants, not labels. */
  const WORDS = {
    pop: 'pop|population|poblaci[oó]n|site|locality|location|deme|race|raza|landrace|provenance|origin|sitio|localidad|procedencia',
    region: 'region|regi[oó]n|zone|zona|group|state|estado|area|[aá]rea|cluster|subregion|watershed|province|provincia|pa[ií]s|country',
    lat: 'lat|latitude|latitud|y_?coord|northing',
    lon: 'lon|long|longitude|longitud|x_?coord|easting',
  };
  const wholeName = w => new RegExp(`^(?:${w})(?:e?s)?\\.?(?:[\\s_-]*(?:dd|deg|dec|decimal|°|[nsewo]))?(?:\\s*[(\\[].*)?$`, 'i');
  const RE = {
    id: /^(id|ind|individual|unit|sample|plant|tree|accession|genotype|code|otu|taxon|name|clave|individuo|muestra|planta|unidad)\b/i,
    pop: wholeName(WORDS.pop), region: wholeName(WORDS.region), lat: wholeName(WORDS.lat), lon: wholeName(WORDS.lon),
  };
  const PREFIX = { pop: new RegExp(`^(?:${WORDS.pop})[\\s_.-]`, 'i'), region: new RegExp(`^(?:${WORDS.region})[\\s_.-]`, 'i') };
  const isRoleName = (key, h, prof) => RE[key].test(h) || (!!PREFIX[key] && PREFIX[key].test(h) && !!prof && prof.text > prof.numeric);

  function autoRoles() {
    const work = B2.work;
    const header = work[0].map(v => String(v ?? '').trim());
    const body = work.slice(1);
    const roles = {};
    const taken = new Set();
    const assign = (key, j) => { if (j >= 0 && !taken.has(j)) { roles[key] = j; taken.add(j); } };

    /* a column with no name and no values (the blank separator before the
       coordinates, stray formatting) is never data */
    header.forEach((h, j) => {
      if (h === '' && body.every(r => Data.isMissing(r[j]))) roles['excl_' + j] = j;
    });
    /* a template names its label columns in row 1: use exactly those */
    if (B2.template) {
      const byName = name => (name ? header.findIndex(h => h.toLowerCase() === String(name).toLowerCase()) : -1);
      const c = B2.template.cols;
      if (B2.cornerLabel != null) assign('idCol', 0);
      assign('idCol', byName(c.id));
      assign('popCol', byName(c.pop));
      assign('regionCol', byName(c.region));
      assign('latCol', byName(c.lat));
      assign('lonCol', byName(c.lon));
      B2.autoRolesResult = roles;
      B2.roles = Object.assign({}, roles, B2.roleOverrides);
      return;
    }
    /* 0. the units column created when the file was transposed is the ID column by
          construction, whatever it is called (a "Landrace" column would otherwise be
          read as a population column) */
    if (B2.cornerLabel != null) assign('idCol', 0);
    /* 1. by column name; a column named like the chosen unit is the ID column */
    header.forEach((h, j) => {
      const prof = Data.profileColumn(body, j);
      if (roles.idCol == null && (RE.id.test(h) || h.trim().toLowerCase() === UNIT(false).toLowerCase() || h.trim().toLowerCase() === UNIT().toLowerCase())) assign('idCol', j);
      else if (roles.popCol == null && isRoleName('pop', h, prof)) assign('popCol', j);
      else if (roles.regionCol == null && isRoleName('region', h, prof)) assign('regionCol', j);
      else if (roles.latCol == null && isRoleName('lat', h, prof)) assign('latCol', j);
      else if (roles.lonCol == null && isRoleName('lon', h, prof)) assign('lonCol', j);
    });
    /* 2. parameter-row layout: column 0 = individual, column 1 = population */
    if (B2.detection && B2.detection.paramHdr) {
      if (roles.idCol == null) assign('idCol', 0);
      if (roles.popCol == null) assign('popCol', 1);
    }
    /* 3. otherwise: a first text column with unique values is the ID; a second
          text column with few repeated levels is the population */
    if (roles.idCol == null) {
      const p0 = Data.profileColumn(body, 0);
      if (p0.text > p0.numeric && p0.unique === body.length) assign('idCol', 0);
      else if (p0.text > p0.numeric && p0.unique > body.length * 0.8) assign('idCol', 0);
    }
    if (roles.popCol == null) {
      for (let j = 0; j < Math.min(4, header.length); j++) {
        if (taken.has(j)) continue;
        const p = Data.profileColumn(body, j);
        if (p.text > p.numeric && p.unique > 1 && p.unique <= Math.max(2, body.length / 2)) { assign('popCol', j); break; }
      }
    }
    B2.autoRolesResult = roles;
    B2.roles = Object.assign({}, roles, B2.roleOverrides);
  }

  function renderPreview() {
    const work = B2.work;
    const header = work[0].map(v => String(v ?? '').trim());
    const maxC = Math.min(header.length, 12), maxR = Math.min(work.length - 1, 8);
    const cols = [];
    for (let j = 0; j < maxC; j++) cols.push({ key: j, label: esc(header[j] || '—'), get: r => r[j] });
    if (header.length > maxC) cols.push({ key: 'more', label: `… +${header.length - maxC}`, get: () => '…' });
    buildTable('previewTable', cols, work.slice(1, 1 + maxR));
    el('previewNote').innerHTML =
      `Interpreted as <b>${work.length - 1} rows × ${header.length} columns</b>` +
      (el('optOrientation').value === 'rows-are-loci' ? ' <i>(the file was transposed: in it, loci were the rows)</i>' : '') + '.' +
      (B2.cornerLabel ? ` The corner cell of your file, <b>“${esc(B2.cornerLabel)}”</b>, labelled the marker rows, not the units, so it was not used as a column name: the first column, now called <b>Unit</b>, holds your units (${esc(work.slice(1, 4).map(r => String(r[0])).join(', '))}…).` : '');
  }

  const ROLE_OPTIONS = [
    ['data', 'Data (locus / trait)'],
    ['idCol', 'Individual ID'],
    ['popCol', 'Population'],
    ['regionCol', 'Region / group'],
    ['latCol', 'Latitude'],
    ['lonCol', 'Longitude'],
    ['excluded', 'Ignore this column'],
  ];

  function renderRoles() {
    const work = B2.work;
    const header = work[0].map(v => String(v ?? '').trim());
    const body = work.slice(1);
    const showAll = el('btnShowAllCols').checked;
    const nShow = showAll ? header.length : Math.min(header.length, 10);
    const host = el('roleTable');
    host.innerHTML = '';
    const table = mk('table', { class: 'var-table' });
    table.innerHTML = '<thead><tr><th>#</th><th>Column</th><th>Looks like</th><th class="num">Distinct</th><th class="num">Missing</th><th>Example</th><th>Role</th></tr></thead>';
    const tb = mk('tbody');
    for (let j = 0; j < nShow; j++) {
      const p = Data.profileColumn(body, j);
      const role = roleOf(j);
      const tr = mk('tr');
      tr.innerHTML =
        `<td class="num">${j + 1}</td>` +
        `<td class="var-name">${esc(header[j] || '(unnamed)')}</td>` +
        `<td><span class="pill ${p.kind === 'binary' ? 'binary' : p.kind === 'quantitative' ? 'quant' : 'nominal'}">${p.kind}</span></td>` +
        `<td class="num">${p.unique}</td>` +
        `<td class="num">${p.missing ? fmtPct(p.missing / Math.max(1, p.n)) : '—'}</td>` +
        `<td class="geno-cell">${esc(String(p.values.slice(0, 3).join(', ')).slice(0, 26))}</td>`;
      const td = mk('td');
      const sel = mk('select');
      ROLE_OPTIONS.forEach(([v, l]) => sel.appendChild(mk('option', { value: v, selected: v === role ? '' : null }, l)));
      sel.addEventListener('change', () => {
        /* a label role belongs to a single column */
        if (sel.value !== 'data' && sel.value !== 'excluded') {
          for (const k in B2.roleOverrides) if (B2.roleOverrides[k] === j) delete B2.roleOverrides[k];
          Object.keys(B2.roles).forEach(k => { if (B2.roles[k] === j) B2.roleOverrides[k] = -1; });
          B2.roleOverrides[sel.value] = j;
        } else {
          Object.keys(B2.roles).forEach(k => { if (B2.roles[k] === j) B2.roleOverrides[k] = -1; });
          B2.roleOverrides['excl_' + j] = sel.value === 'excluded' ? j : -1;
        }
        B2.roles = Object.assign({}, B2.autoRolesResult, B2.roleOverrides);
        renderRoles();
      });
      td.appendChild(sel);
      tr.appendChild(td);
      tb.appendChild(tr);
    }
    table.appendChild(tb);
    host.appendChild(table);
    if (!showAll && header.length > nShow)
      host.appendChild(mk('p', { class: 'hint', style: 'padding:6px 12px;margin:0' },
        `${header.length - nShow} further columns are treated as data. Tick the box above to see them all.`));

    const r = B2.roles;
    const named = k => (r[k] != null && r[k] >= 0) ? esc(header[r[k]] || ('column ' + (r[k] + 1))) : null;
    const bits = [];
    const idExamples = r.idCol != null && r.idCol >= 0 ? body.slice(0, 3).map(row => String(row[r.idCol] ?? '')).filter(Boolean).join(', ') : '';
    bits.push(named('idCol') ? `${UNIT()} (IDs) from <b>${named('idCol')}</b>${idExamples ? ` — ${esc(idExamples)}, …` : ''}` : 'IDs generated automatically (Ind1, Ind2, …)');
    bits.push(named('popCol') ? `populations from <b>${named('popCol')}</b>` : `<b>no population column</b> — each row will be treated as its own ${UNIT(false)}`);
    if (named('regionCol')) bits.push(`regions from <b>${named('regionCol')}</b>`);
    if (named('latCol') && named('lonCol')) bits.push('coordinates found');
    el('roleSummary').innerHTML = bits.join(' · ') + '.';
  }

  function roleOf(j) {
    const r = B2.roles || {};
    for (const k of ['idCol', 'popCol', 'regionCol', 'latCol', 'lonCol']) if (r[k] === j) return k;
    if (r['excl_' + j] === j) return 'excluded';
    return 'data';
  }

  /* ================================================================
     build + quality control
     ================================================================ */

  function build() {
    clearMessages('dataMessages');
    try {
      const roles = {};
      /* excluded columns ride along as label roles so buildFromTable skips them */
      Object.keys(B2.roles).forEach(k => {
        const j = B2.roles[k];
        if (j == null || j < 0) return;
        if (k.startsWith('excl_')) roles['x' + j] = j; else roles[k] = j;
      });
      setUnit(el('optUnitName').value);
      const transposed = el('optOrientation').value === 'rows-are-loci';
      const hasHeader = el('optHeader').checked;
      const d = Data.buildFromTable({
        rows: B2.work,
        orientation: 'rows-are-individuals',      // already applied in applyOptions
        markerKind: el('optKind').value,
        ploidy: Number(el('optPloidy').value) || 2,
        genoCells: el('optGenoCells').value,
        coding: B2.template ? B2.template.coding : null,
        missingCode: el('optMissing').value,
        roles,
        /* so that problems can be reported with the row numbers of the user's sheet */
        transposed,
        rowOffset: B2.template ? 3 : B2.detection && B2.detection.paramHdr ? 4 : hasHeader ? 2 : 1,
        meta: { source: state.fileName, transposed },
      });
      el('cardSampleSheet').style.display = 'none';
      if (!d.nLoci && d.kind !== 'morph') throw new Error('No data columns were left after assigning roles.');
      state.data = d;
      state.format = 'table';
      afterBuild();
    } catch (e) {
      console.error(e);
      showMessage('dataMessages', 'error', 'The dataset could not be built: ' + esc(e.message));
    }
  }

  function afterBuild() {
    const d = state.data;
    const qc = Data.computeQC(d);
    state.qc = qc;
    /* images of the OTUs are kept per data file */
    if (window.OTUImg) OTUImg.useScope(state.fileName || 'default');
    state.freq = null; state.hwe = null; state.ldPairs = null; state.fst = null; state.gd = null;   // later blocks must recompute
    state.struct = null; state.dapc = null; state.assign = null; state.dna = null; state.demog = null;
    renderTemplateCheck(d);
    renderQC(d, qc);
    renderIssues(d);
    /* problems of data typed in the sheet are marked on the sheet itself */
    if (B2.fromSheet && window.Sheet && Sheet.markIssues) {
      const n = Sheet.markIssues(d.issues);
      if (n) showMessage('qcMessages', 'info', `${n} problem${n > 1 ? 's are' : ' is'} highlighted in red in the <b>data sheet</b> above; hover over a red cell to read why.`);
    }
    renderCapabilities(d, qc);
    if (el('cardDesigner') && el('cardDesigner').style.display !== 'none' && window.Designer) el('dzFromData').style.display = '';
    /* Block 3 opens as soon as there is anything to describe: with one sample
       per unit it still reports the pooled diversity and the frequency tables. */
    enableStep(3, d.nLoci > 0 || d.kind === 'morph');
    /* the report is always reachable once data exist */
    enableStep(10, true);
    /* Block 4 needs replicate individuals within at least one population: HWE
       and F_IS for codominant data, linkage disequilibrium for any marker type */
    const withReplicates = d.pops.some(p => p.idx.length >= 5);
    enableStep(4, withReplicates && d.nLoci >= 2 && d.kind !== 'morph' && d.kind !== 'sequence');
    /* Block 5 needs at least two populations with replicate individuals */
    const popsWithReps = d.pops.filter(p => p.idx.length >= 2).length;
    enableStep(5, popsWithReps >= 2 && d.nLoci >= 1 && d.kind !== 'morph');
    /* Block 6 works on any three or more units, markers or traits alike */
    enableStep(6, d.nInd >= 3);
    /* Block 7 clusters individuals from markers: needs enough of them and polymorphic loci */
    enableStep(7, d.kind !== 'morph' && d.kind !== 'sequence' && d.nInd >= 6 && (qc.nLoci - qc.monomorphic.length) >= 3);
    /* Block 8 is the sequence block */
    enableStep(8, d.kind === 'sequence' && !!d.seqs && d.nInd >= 3);
    /* Block 9: codominant populations with ≥ 10 plants, mapped individuals, or traits */
    const mapped = d.ind.filter(v => v.lat != null && isFinite(v.lat) && v.lon != null && isFinite(v.lon)).length;
    enableStep(9, (d.kind === 'codominant' && (d.ploidy || 2) === 2 && d.declaredPops && !d.singletons && d.pops.some(p => p.idx.length >= 10)) || (mapped >= 10 && d.kind !== 'morph') || d.kind === 'morph');
    el('cardQC').style.display = '';
    el('cardCapabilities').style.display = '';
    el('cardQC').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /* the declared layout (template row 1 or parameter row 1) against what was read */
  function renderTemplateCheck(d) {
    const wrap = el('tplCheckWrap');
    const gx = B2.detection && B2.detection.paramHdr;
    const spec = state.format === 'table' ? (B2.template || (gx ? { loci: gx.nLoci, units: gx.nInd, pops: gx.nPop, sizes: gx.sizes, popNames: gx.popNames, columnsPerLocus: gx.columnsPerLocus } : null)) : null;
    if (!spec) { wrap.style.display = 'none'; return; }
    const res = Tpl.check(spec, d, B2.template ? 'template' : 'paramHdr');
    wrap.style.display = '';
    el('tplCheckTitle').textContent = B2.template ? 'Checked against your template' : 'Checked against the parameter rows';
    el('tplCheckNote').innerHTML = res.ok
      ? `<span class="chk ok">✓</span> Everything declared in ${B2.template ? 'row 1 of the template' : 'the parameter rows'} matches what was read.`
      : `Differences between what ${B2.template ? 'the template declares' : 'the parameter rows declare'} and what the sheet contains. <b>Red</b> items change the analysis; <b>amber</b> ones are worth a look.`;
    const icon = s => `<span class="chk ${s}">${s === 'ok' ? '✓' : s === 'warning' ? '!' : '✕'}</span>`;
    buildTable('tplCheck', [
      { key: 'status', label: '', html: true, get: r => icon(r.status) },
      { key: 'item', label: 'Item' },
      { key: 'declared', label: 'Declared', num: true },
      { key: 'found', label: 'Found', num: true },
      { key: 'note', label: 'Note' },
    ], res.rows);
    if (res.popRows.length) {
      buildTable('tplCheckPops', [
        { key: 'status', label: '', html: true, get: r => icon(r.status) },
        { key: 'name', label: B2.template && B2.template.sampling === 'bulk' ? 'Group' : 'Population' },
        { key: 'declared', label: 'Declared n', num: true },
        { key: 'found', label: 'Rows found', num: true },
        { key: 'filled', label: 'Rows with data', num: true },
        { key: 'note', label: 'Note' },
      ], res.popRows, { limit: 100 });
    } else el('tplCheckPops').innerHTML = '';
  }

  /* values that were reinterpreted or discarded while reading the sheet */
  function renderIssues(d) {
    const list = (d.issues || []).slice().sort((a, b) => (a.level === 'error' ? 0 : 1) - (b.level === 'error' ? 0 : 1) || b.count - a.count);
    el('issueWrap').style.display = list.length ? '' : 'none';
    if (!list.length) return;
    buildTable('issueBox', [
      { key: 'level', label: '', html: true, get: r => `<span class="chk ${r.level}">${r.level === 'error' ? '✕' : '!'}</span>` },
      { key: 'text', label: 'Problem' },
      { key: 'count', label: 'Cases', num: true },
      { key: 'examples', label: 'Where (first cases)', html: true, get: r => `<span class="geno-cell" style="white-space:normal">${esc(r.examples.join(' · '))}${r.count > r.examples.length ? ' …' : ''}</span>` },
    ], list);
    const nErr = list.filter(x => x.level === 'error').reduce((a, x) => a + x.count, 0);
    /* not every error sets a value to missing (a repeated ID keeps both rows): say what needs fixing, the table says what was done */
    if (nErr) showMessage('qcMessages', 'error', `${nErr} value${nErr > 1 ? 's' : ''} in the sheet could not be read as intended — see <b>Values to fix in the sheet</b> below for what was done with each one.`);
  }

  function renderQC(d, qc) {
    const dominant = d.kind === 'dominant';
    const morph = d.kind === 'morph';
    const seq = d.kind === 'sequence';
    const poly = qc.nLoci - qc.monomorphic.length;
    const minN = Math.min(...qc.popSizes.map(p => p.n));
    const tiles = [
      [UNIT(true, true), d.nInd, d.declaredPops ? `in ${d.nPops} populations` : 'no population column'],
    ];
    if (morph) tiles.push(['Traits', (d.traits && d.traits.vars.length) || 0, 'measured on every plant']);
    else if (seq) tiles.push(['Haplotypes', d.loci[0] ? d.loci[0].alleles.length : 0, `in ${d.nInd} sequences of ${d.seqs ? d.seqs.length : '?'} bp`]);
    else tiles.push([dominant ? 'Bands' : 'Loci', qc.nLoci, `${poly} polymorphic (${fmtPct(poly / Math.max(1, qc.nLoci))})`]);
    tiles.push(['Missing data', fmtPct(qc.pMissing), qc.pMissing > 0.1 ? 'above the usual 10% limit' : 'acceptable', qc.pMissing > 0.1 ? 'warn' : 'ok']);
    if (!morph) tiles.push([dominant ? 'Mean band frequency' : 'Mean alleles per locus', dominant
      ? fmtFixed(qc.perLocus.reduce((a, p) => a + (p.bandFreq || 0), 0) / Math.max(1, qc.nLoci), 3)
      : fmtFixed(qc.meanAlleles, 2), dominant ? '' : 'Na']);
    if (qc.clonesMeaningful)
      tiles.push(['Repeated genotypes', qc.dups.length, qc.dups.length ? 'possible clones — check below' : 'none', qc.dups.length ? 'warn' : 'ok']);
    /* without a population column every row is its own group: a "smallest population of 1" would only alarm */
    if (d.declaredPops) tiles.push(['Smallest population', minN, UNIT(minN !== 1), minN < 5 ? 'warn' : 'ok']);
    statTiles('qcTiles', tiles);

    /* messages: the honest reading of the checks */
    const msg = el('qcMessages');
    clearMessages(msg);
    if (d.singletons && d.declaredPops)
      showMessage(msg, 'warning', 'Every population has a single individual. Within-population statistics (He, F<sub>IS</sub>, AMOVA) are undefined; distance-based analyses, ordination and clustering still work.');
    if (!d.declaredPops)
      showMessage(msg, 'info', `No population column was declared, so each row is treated as an independent ${UNIT(false)}. If your rows are individuals from named populations, go back and set the <b>Population</b> role.`);
    if (qc.monomorphic.length)
      showMessage(msg, 'warning', `${qc.monomorphic.length} monomorphic ${dominant ? 'band' : 'locus'}${qc.monomorphic.length > 1 ? 's' : ''} carry no information: ${esc(qc.monomorphic.slice(0, 6).join(', '))}${qc.monomorphic.length > 6 ? '…' : ''}. They are kept, but they contribute nothing to differentiation.`);
    if (dominant && (qc.rare || qc.fixed))
      showMessage(msg, 'warning', `${qc.rare} band(s) below 5% and ${qc.fixed} above 95%. Both extremes are poorly estimated from a gel and are usually dropped before analysis.`);
    if (qc.pMissing > 0.1)
      showMessage(msg, 'warning', `${fmtPct(qc.pMissing)} of the genotypes are missing. Above roughly 10%, drop the worst loci or individuals rather than letting the gaps drive the result.`);
    const badInd = qc.perInd.filter(p => p.pMissing > 0.25);
    if (badInd.length)
      showMessage(msg, 'warning', `${badInd.length} individual(s) are missing more than a quarter of their data: ${esc(badInd.slice(0, 5).map(p => p.id).join(', '))}${badInd.length > 5 ? '…' : ''}.`);
    if (qc.dups.length)
      showMessage(msg, 'warning', `${qc.dups.length} pair(s) of individuals share an identical multilocus genotype. In a clonal plant these are ramets of one genet and should be reduced to one — see the table below.`);
    if (qc.nearDups.length)
      showMessage(msg, 'info', `${qc.nearDups.length} pair(s) match at 95% or more of their loci without being identical: either close relatives, or the same plant with a scoring error.`);
    if (seq && d.loci[0]) {
      const nH = d.loci[0].alleles.length;
      showMessage(msg, 'info', `The ${d.nInd} sequences collapse into <b>${nH} haplotypes</b>${d.seqs && d.seqs.ragged ? '. <b>Warning:</b> the sequences are not all the same length, so the alignment is incomplete' : ''}. Sharing a haplotype is expected and is not a duplication problem.`);
    }
    /* "ready" only when no warning was raised above, so the card never contradicts itself */
    const warned = msg.querySelector('.msg-warning, .msg-error');
    if (!warned && !qc.dups.length && qc.pMissing < 0.05 && !qc.monomorphic.length && !(d.issues || []).length)
      showMessage(msg, 'success', 'No missing data problems, no monomorphic loci and no repeated genotypes. The matrix is ready.');
    else if (!warned && !qc.dups.length && !qc.monomorphic.length && !(d.issues || []).length)
      showMessage(msg, 'success', 'No monomorphic loci, no repeated genotypes and no unreadable values. The matrix is ready.');

    /* traits get a descriptive table instead of a locus table */
    if (el('locusTableTitle')) el('locusTableTitle').textContent = morph ? 'Trait by trait' : dominant ? 'Band by band' : seq ? 'The alignment' : 'Locus by locus';
    if (morph && d.traits) {
      const rows = d.traits.vars.map((v, j) => {
        const vals = d.traits.values.map(r => r[j]).filter(x => x != null && isFinite(x));
        const n = vals.length;
        const mean = n ? vals.reduce((a, b) => a + b, 0) / n : null;
        const sd = n > 1 ? Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1)) : null;
        return {
          name: v.name, kind: v.kind, n, missing: d.nInd - n,
          mean, sd, cv: mean ? sd / Math.abs(mean) : null,
          min: n ? Math.min(...vals) : null, max: n ? Math.max(...vals) : null,
        };
      });
      buildTable('locusTable', [
        { key: 'name', label: 'Trait' },
        { key: 'kind', label: 'Type', html: true, get: r => `<span class="pill ${r.kind === 'quantitative' ? 'quant' : 'nominal'}">${r.kind}</span>` },
        { key: 'n', label: 'n', num: true },
        { key: 'missing', label: 'Missing', num: true },
        { key: 'mean', label: 'Mean', num: true, fmt: v => fmtFixed(v, 2) },
        { key: 'sd', label: 'SD', num: true, fmt: v => fmtFixed(v, 2) },
        { key: 'cv', label: 'CV', num: true, fmt: v => fmtPct(v, 1) },
        { key: 'min', label: 'Min', num: true, fmt: v => fmtFixed(v, 2) },
        { key: 'max', label: 'Max', num: true, fmt: v => fmtFixed(v, 2) },
      ], rows);
      el('dupWrap').style.display = 'none';
      drawFigures(d, qc);
      return;
    }

    /* per-locus table */
    const locusCols = [
      { key: 'name', label: dominant ? 'Band' : 'Locus' },
      { key: 'scored', label: 'Scored', num: true },
      { key: 'pMissing', label: 'Missing', num: true, fmt: v => fmtPct(v) },
    ];
    if (dominant) locusCols.push({ key: 'bandFreq', label: 'Band freq.', num: true, fmt: v => fmtFixed(v, 3) });
    else {
      locusCols.push({ key: 'nAlleles', label: 'Alleles (Na)', num: true });
      if (d.kind === 'codominant') locusCols.push({ key: 'Ho', label: 'H<sub>o</sub>', num: true, fmt: v => fmtFixed(v, 3) });
    }
    locusCols.push({
      key: 'flag', label: 'Note', html: true,
      get: p => p.monomorphic ? '<span class="pill">monomorphic</span>'
        : (dominant && p.bandFreq < 0.05) ? '<span class="pill domin">rare band</span>'
          : (dominant && p.bandFreq > 0.95) ? '<span class="pill domin">nearly fixed</span>'
            : (p.pMissing > 0.2) ? '<span class="pill domin">many gaps</span>' : '',
    });
    buildTable('locusTable', locusCols, qc.perLocus, { limit: 200 });

    /* duplicates */
    const dupHost = el('dupBox');
    if (qc.dups.length || qc.nearDups.length) {
      const rows = qc.dups.map(([a, b]) => ({ a: d.ind[a].id, b: d.ind[b].id, pa: d.ind[a].pop || '—', pb: d.ind[b].pop || '—', sim: 1 }))
        .concat(qc.nearDups.map(([a, b, s]) => ({ a: d.ind[a].id, b: d.ind[b].id, pa: d.ind[a].pop || '—', pb: d.ind[b].pop || '—', sim: s })));
      buildTable(dupHost, [
        { key: 'a', label: 'Individual' }, { key: 'pa', label: 'Population' },
        { key: 'b', label: 'Matches' }, { key: 'pb', label: 'Population' },
        { key: 'sim', label: 'Identity', num: true, fmt: v => fmtPct(v, 1) },
      ], rows, { limit: 60 });
      el('dupWrap').style.display = '';
    } else el('dupWrap').style.display = 'none';

    drawFigures(d, qc);
  }

  function drawFigures(d, qc) {
    const D = { d, qc };
    const pal = { key: 'palette', label: 'Palette', type: 'select', options: Object.entries(Fig.paletteNames), shared: true };
    const mount = (id, spec) => {
      const host = el(id);
      if (!host) return;
      try { Fig.mount(id, spec); }
      catch (e) { console.error(id, e); host.innerHTML = `<div class="msg msg-error">Figure could not be drawn: ${esc(e.message)}</div>`; }
    };

    /* a trait matrix has no genotypes to paint; Block 3 handles traits in full */
    const hasMarkers = d.kind !== 'morph' && d.nLoci > 0;
    ['fig2Matrix', 'fig2Locus', 'fig2Spec'].forEach(id => { el(id).style.display = hasMarkers ? '' : 'none'; });
    if (!hasMarkers) {
      mountPops();
      return;
    }

    mount('fig2Matrix', {
      title: 'The genotype matrix', fileName: 'genotype_matrix',
      width: 900, height: Math.max(380, Math.min(900, 140 + d.nInd * 12)),
      defaults: {
        palette: 'cluster', mode: 'matrix', title: `${d.nInd} × ${d.nLoci} ${d.kind} matrix`,
        indLabels: d.nInd <= 60, popLines: true, legendPos: 'bottom',
      },
      controls: [
        { key: 'title', label: 'Title', type: 'text' },
        { key: 'mode', label: 'Show', type: 'select', options: [['matrix', 'the scored data'], ['missing', 'missing data only']] },
        { key: 'indLabels', label: 'Individual labels', type: 'checkbox' },
        { key: 'popLines', label: 'Separate populations', type: 'checkbox' },
        pal,
      ],
      render: cfg => P2.matrixMap(cfg, D),
    });

    mount('fig2Locus', {
      title: d.kind === 'dominant' ? 'Every band, and how informative it is' : 'Every locus, and how variable it is',
      fileName: 'locus_profile', width: 820, height: 520,
      defaults: { palette: 'cluster', sort: 'file', rowH: Math.max(10, Math.min(22, 420 / Math.max(1, d.nLoci))), values: true, legendPos: 'bottom' },
      controls: [
        { key: 'title', label: 'Title', type: 'text' },
        { key: 'sort', label: 'Order', type: 'select', options: [['file', 'as in the file'], ['value', 'by value'], ['missing', 'by missing data']] },
        { key: 'rowH', label: 'Row height', type: 'range', min: 8, max: 30, step: 1 },
        { key: 'values', label: 'Show values', type: 'checkbox' },
        pal,
      ],
      render: cfg => P2.locusProfile(cfg, D),
    });

    mountPops();

    /* with one sample per unit there is nothing to show about sample size */
    function mountPops() {
      const worth = d.declaredPops && !d.singletons;
      el('fig2Pops').style.display = worth ? '' : 'none';
      el('fig2Pops').parentElement.classList.toggle('fig-grid', worth && d.kind !== 'morph');
      if (!worth) return;
      mount('fig2Pops', {
        title: 'Sample size per population', fileName: 'sample_sizes', width: 760, height: 440,
        defaults: { palette: 'cluster', minN: 5, colourByRegion: d.regions.length > 1, sort: 'file' },
        controls: [
          { key: 'title', label: 'Title', type: 'text' },
          { key: 'minN', label: 'Minimum recommended n', type: 'number', min: 2, max: 50, step: 1 },
          { key: 'sort', label: 'Order', type: 'select', options: [['file', 'as in the file'], ['size', 'by sample size']] },
          { key: 'colourByRegion', label: 'Colour by region', type: 'checkbox' },
          pal,
        ],
        render: cfg => P2.popSizes(cfg, D),
      });
    }

    mount('fig2Spec', {
      title: d.kind === 'dominant' ? 'Distribution of band frequencies' : 'Distribution of allele frequencies',
      fileName: 'frequency_spectrum', width: 760, height: 430,
      defaults: { palette: 'cluster', bins: 10 },
      controls: [
        { key: 'title', label: 'Title', type: 'text' },
        { key: 'bins', label: 'Number of classes', type: 'range', min: 5, max: 25, step: 1 },
        pal,
      ],
      render: cfg => P2.spectrum(cfg, D),
    });
  }

  /* ================================================================
     what can honestly be run with these data
     ================================================================ */

  const CAP_LABEL = [
    ['diversity', 3, 'Diversity indices', 'Na, Ne, Ho, He, uHe, Shannon I, allelic richness'],
    ['hwe', 4, 'Hardy–Weinberg & F_IS', 'exact and chi-square tests, inbreeding, null alleles'],
    ['linkage', 4, 'Linkage disequilibrium', 'r², D′ and the multilocus r_d'],
    ['fstats', 5, 'F-statistics', 'G_ST, θ, G′_ST, Jost’s D, pairwise matrices'],
    ['amova', 5, 'AMOVA', 'hierarchical partition with permutation tests'],
    ['distance', 6, 'Genetic distances', 'Nei, Reynolds, Jaccard, Dice and relatives'],
    ['ordination', 6, 'PCoA & trees', 'ordination, NJ and UPGMA with bootstrap'],
    ['clustering', 7, 'Bayesian clustering', 'admixture MCMC, ΔK, DAPC, assignment'],
    ['sequences', 8, 'Sequence statistics', 'π, Tajima’s D, haplotype networks'],
    ['demography', 9, 'Demographic history', 'bottlenecks, N_e, mating system'],
    ['spatial', 9, 'Spatial genetic structure', 'autocorrelation, kinship, S_p'],
  ];

  function renderCapabilities(d, qc) {
    const caps = Data.capabilities(d, qc);
    const g = el('capGrid');
    g.innerHTML = '';
    CAP_LABEL.forEach(([key, block, name, sub]) => {
      const c = caps[key] || { ok: false, why: '' };
      const div = mk('div', { class: 'cap' + (c.ok ? ' ok' : ' off') });
      div.innerHTML =
        `<div class="cap-mark">${c.ok ? '✓' : '—'}</div>` +
        `<div><div class="cap-name">${name} <span class="cap-block">Block ${block}</span></div>` +
        `<div class="cap-sub">${c.ok ? sub : esc(c.why || 'not available with these data')}</div></div>`;
      g.appendChild(div);
    });
    const ok = CAP_LABEL.filter(([k]) => caps[k] && caps[k].ok).length;
    el('capSummary').innerHTML =
      `<b>${ok} of ${CAP_LABEL.length}</b> analysis families can be run on this dataset as it stands. ` +
      (d.singletons ? 'Adding replicate individuals within each population would unlock the rest.' :
        d.kind === 'dominant' ? 'Codominant markers would additionally allow heterozygosity, HWE and null-allele analyses.' : '');
  }

  document.addEventListener('DOMContentLoaded', init);
})();
