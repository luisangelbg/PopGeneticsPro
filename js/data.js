/* PopGeneticsPro — Block 2 engine: reading files, working out what they are,
   building the analysis-ready dataset and screening its quality.

   Design rule: the app never demands a header block. If a row of parameters (counts of loci, individuals, populations)
   is there it is honoured; if it is not, everything is deduced from the data and
   shown back to the user for confirmation. */

(function () {

  /* Everything that counts as "no data" in the wild */
  const MISSING_TOKENS = new Set(['', '-9', '-99', '-999', 'na', 'n/a', 'nan', '?', '.', '..', 'null', 'missing', 'x']);

  function isMissing(v, code) {
    if (v === null || v === undefined) return true;
    const s = String(v).trim().toLowerCase();
    if (s === '') return true;
    if (code != null && s === String(code).trim().toLowerCase()) return true;
    return MISSING_TOKENS.has(s);
  }

  /* ================================================================
     1 · READING FILES
     ================================================================ */

  function readFile(file) {
    return new Promise((resolve, reject) => {
      const name = file.name || 'data';
      const ext = (name.split('.').pop() || '').toLowerCase();
      const binary = ['xlsx', 'xls', 'xlsm', 'xlsb', 'ods'].includes(ext);
      const fr = new FileReader();
      fr.onerror = () => reject(new Error('The file could not be read.'));
      fr.onload = () => {
        try {
          if (binary) {
            const wb = XLSX.read(new Uint8Array(fr.result), { type: 'array' });
            resolve({ name, ext, kind: 'workbook', workbook: wb, sheets: wb.SheetNames });
          } else {
            resolve({ name, ext, kind: 'text', text: String(fr.result) });
          }
        } catch (e) { reject(e); }
      };
      if (binary) fr.readAsArrayBuffer(file); else fr.readAsText(file);
    });
  }

  /* one of the bundled example files: the copy embedded in js/examples.js is used
     first (it works from file:// too); the data/ folder is the fallback */
  function loadExample(path) {
    const ext = (path.split('.').pop() || '').toLowerCase();
    const binary = ['xlsx', 'xls'].includes(ext);
    const name = path.split('/').pop();
    const wrap = d => {
      if (binary) {
        const wb = XLSX.read(d instanceof Uint8Array ? d : new Uint8Array(d), { type: 'array' });
        return { name, ext, kind: 'workbook', workbook: wb, sheets: wb.SheetNames };
      }
      return { name, ext, kind: 'text', text: d };
    };
    const emb = typeof window !== 'undefined' && window.EXAMPLES ? window.EXAMPLES[name] : null;
    if (emb) {
      try {
        if (emb.base64) { const bin = atob(emb.base64); const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i); return Promise.resolve(wrap(u8)); }
        if (emb.text != null) return Promise.resolve(wrap(emb.text));
      } catch (e) { console.warn('embedded example unreadable, fetching instead', e); }
    }
    return fetch(path).then(r => {
      if (!r.ok) throw new Error('Example not found (' + r.status + ').');
      return binary ? r.arrayBuffer() : r.text();
    }).then(wrap).catch(e => {
      const local = typeof location !== 'undefined' && location.protocol === 'file:';
      throw new Error((local ? 'The browser blocks reading the data/ folder when the app is opened by double-click (file://). ' : '') + 'Open the app through server.ps1 (http://localhost:9000) or load your own file — it will work either way. Details: ' + (e.message || e));
    });
  }

  function sheetRows(workbook, sheetName) {
    const ws = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null, blankrows: false });
    return trimRows(rows);
  }

  /* delimiter sniffing for text tables */
  function parseDelimited(text) {
    text = String(text).replace(/^﻿/, '');   // spreadsheet programs write a byte-order mark
    const sample = text.slice(0, 5000);
    const counts = { ',': 0, ';': 0, '\t': 0 };
    sample.split(/\r?\n/).slice(0, 20).forEach(line => {
      for (const d in counts) counts[d] += (line.split(d).length - 1);
    });
    const delim = Object.keys(counts).reduce((a, b) => counts[a] >= counts[b] ? a : b);
    const rows = [];
    text.split(/\r?\n/).forEach(line => {
      if (line.trim() === '') return;
      rows.push(splitLine(line, delim).map(coerce));
    });
    return trimRows(rows);
  }

  function splitLine(line, delim) {
    const out = []; let cur = '', q = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { if (q && line[i + 1] === '"') { cur += '"'; i++; } else q = !q; }
      else if (ch === delim && !q) { out.push(cur); cur = ''; }
      else cur += ch;
    }
    out.push(cur);
    return out;
  }

  function coerce(s) {
    const t = String(s).trim();
    if (t === '') return null;
    if (/^-?\d+(\.\d+)?([eE][-+]?\d+)?$/.test(t)) return Number(t);
    return t;
  }

  /* drop fully empty rows and trailing empty columns; trim text cells */
  function trimRows(rows) {
    const out = rows
      .map(r => r.map(v => (typeof v === 'string' ? v.trim() : v)))
      .filter(r => r.some(v => v !== null && v !== undefined && v !== ''));
    let width = 0;
    out.forEach(r => { for (let j = r.length - 1; j >= 0; j--) if (r[j] !== null && r[j] !== '') { width = Math.max(width, j + 1); break; } });
    return out.map(r => { const c = r.slice(0, width); while (c.length < width) c.push(null); return c; });
  }

  /* ================================================================
     2 · WORKING OUT WHAT THE FILE IS
     ================================================================ */

  function sniffFormat(file) {
    if (file.kind === 'workbook') return 'table';
    const t = file.text;
    const head = t.slice(0, 4000);
    if (/^\s*>/.test(t)) return 'fasta';
    if (/^##fileformat=VCF/im.test(head)) return 'vcf';
    if (/\[Profile\]/i.test(head) && /NbSamples|SampleData|GenotypicData/i.test(head)) return 'arp';
    if (/^\s*pop\s*$/im.test(t) && /,/.test(t)) return 'gen';
    if (['str', 'stru'].includes(file.ext)) return 'str';
    return 'table';
  }

  /* Is this table in the parameter-row layout? Row 1 = numeric parameters, row 3 = column
     headers. We accept it, but never require it. */
  function readParameterHeader(rows) {
    if (rows.length < 4) return null;
    const r0 = rows[0];
    /* the parameters sit in A1, B1, C1, D1… — read them by position */
    const num = v => (typeof v === 'number' ? v : (typeof v === 'string' && /^\d+$/.test(v.trim()) ? Number(v) : null));
    const [nLoci, nInd, nPop] = [num(r0[0]), num(r0[1]), num(r0[2])];
    if (nLoci == null || nInd == null || nPop == null) return null;
    if (!Number.isInteger(nLoci) || !Number.isInteger(nInd) || !Number.isInteger(nPop)) return null;
    if (nInd < nPop || nPop < 1 || nLoci < 1) return null;
    const sizes = [];
    for (let j = 3; j < 3 + nPop; j++) sizes.push(num(r0[j]));
    if (sizes.some(v => v == null)) return null;
    /* sanity: the population sizes should add up to the number of individuals */
    if (sizes.reduce((a, b) => a + b, 0) !== nInd) return null;
    /* optional regions: No. of regions right after the last population size, then
       the size of each region in individuals; region names above them in row 2 */
    let regions = null;
    const nReg = num(r0[3 + nPop]);
    if (nReg != null && nReg >= 1) {
      const rs = [];
      for (let j = 4 + nPop; j < 4 + nPop + nReg; j++) rs.push(num(r0[j]));
      if (rs.every(v => v != null) && rs.reduce((a, b) => a + b, 0) === nInd)
        regions = { n: nReg, sizes: rs, names: rs.map((_, k) => String((rows[1] || [])[4 + nPop + k] ?? ('Region' + (k + 1))).trim()) };
    }
    const popNames = sizes.map((_, k) => { const v = (rows[1] || [])[3 + k]; return v == null || v === '' ? null : String(v).trim(); });
    /* genetic columns run from C to the first completely empty column; their
       number over the number of loci gives the layout (2 = codominant diploid) */
    const header = rows[2] || [], body = rows.slice(3);
    const width = Math.max(header.length, ...body.map(r => r.length));
    let gap = width;
    for (let j = 2; j < width; j++) {
      const emptyHead = header[j] == null || String(header[j]).trim() === '';
      if (emptyHead && body.every(r => r[j] == null || String(r[j]).trim() === '')) { gap = j; break; }
    }
    const nGenetic = gap - 2;
    const ratio = nGenetic / nLoci;
    return {
      nLoci, nInd, nPop, sizes, popNames, regions, title: (rows[1] || [])[0] ?? null,
      nGenetic, columnsPerLocus: Number.isInteger(ratio) ? ratio : null, gapColumn: gap < width ? gap : null,
      headerRow: 2, dataRow: 3,
    };
  }

  /* A PopGeneticsPro template carries its own layout in row 1:
     "#PopGeneticsPro template", "kind=codominant", "ploidy=2", … */
  function readTemplateHeader(rows) {
    if (!rows || !rows.length) return null;
    const first = String(rows[0][0] ?? '').trim();
    if (!/^#\s*PopGeneticsPro/i.test(first)) return null;
    const spec = {};
    rows[0].slice(1).forEach(c => {
      const m = String(c ?? '').match(/^\s*([A-Za-z_]+)\s*=\s*(.*)$/);
      if (m) spec[m[1].toLowerCase()] = m[2].trim();
    });
    const int = k => (spec[k] != null && /^\d+$/.test(spec[k]) ? Number(spec[k]) : null);
    return {
      raw: spec,
      version: spec.v || '1',
      kind: spec.kind || null,
      ploidy: int('ploidy') || null,
      cells: spec.cells || 'columns',
      coding: spec.coding || null,
      missing: spec.missing != null ? spec.missing : null,
      unit: spec.unit || null,
      orientation: spec.orientation || 'rows-are-individuals',
      sampling: spec.sampling || 'pops',
      loci: int('loci'), units: int('units'), pops: int('pops'),
      sizes: spec.sizes ? spec.sizes.split('|').map(Number) : null,
      popNames: spec.popnames ? spec.popnames.split('|').map(s => s.trim()) : null,
      cols: { id: spec.id || null, pop: spec.pop || null, region: spec.region || null, lat: spec.lat || null, lon: spec.lon || null },
      dataRow: 1,
    };
  }

  /* What the data cells look like, for the layouts plain column typing misses:
     genotypes written in one cell ("180/184", "A/G") and whole sequences in a cell. */
  const SEQ_CELL = /^[ACGTUNRYSWKMBDHV?\-.]{20,}$/i;
  function cellShapes(body, cols) {
    let n = 0, combined = 0, seq = 0, letters2 = 0;
    cols.forEach(j => body.forEach(r => {
      const v = r[j];
      if (isMissing(v)) return;
      const s = String(v).trim();
      n++;
      if (SEQ_CELL.test(s)) seq++;
      else if (/^[A-Za-z0-9.]+(\s*[\/|:]\s*[A-Za-z0-9.]+)+$/.test(s) || /^\d{2,3}-\d{2,3}$/.test(s)) combined++;
      else if (/^[ACGT]{2}$/i.test(s)) letters2++;
    }));
    return { n, fCombined: n ? combined / n : 0, fSeq: n ? seq / n : 0, fLetters2: n ? letters2 / n : 0 };
  }

  /* How the value matrix looks, ignoring the label columns */
  function matrixProfile(rows, r0, c0) {
    let n = 0, binary = 0, numeric = 0, text = 0, missing = 0;
    const values = new Set();
    for (let i = r0; i < rows.length; i++) {
      for (let j = c0; j < rows[i].length; j++) {
        const v = rows[i][j];
        n++;
        if (isMissing(v)) { missing++; continue; }
        if (typeof v === 'number') {
          numeric++;
          if (v === 0 || v === 1) binary++;
        } else text++;
        if (values.size < 60) values.add(String(v));
      }
    }
    return { n, binary, numeric, text, missing, distinct: values.size, values: [...values] };
  }

  /* Guess whether rows are individuals or loci.
     The strongest clue: a first column whose labels repeat (primer names in a
     band matrix) cannot be individual IDs. */
  function guessOrientation(rows) {
    const header = rows[0] || [];
    const body = rows.slice(1);
    const firstCol = body.map(r => String(r[0] ?? '').trim());
    const uniqueFirst = new Set(firstCol).size;
    const repeatsInFirstColumn = uniqueFirst < firstCol.length;
    const headerLabels = header.slice(1).map(v => String(v ?? '').trim());
    const uniqueHeader = new Set(headerLabels).size;
    const repeatsInHeader = uniqueHeader < headerLabels.length;
    const prof = matrixProfile(rows, 1, 1);
    const isBinary = prof.numeric > 0 && prof.binary / Math.max(1, prof.numeric) > 0.98;

    let orientation = 'rows-are-individuals', confidence = 'low', why = '';
    if (isBinary && repeatsInFirstColumn && !repeatsInHeader) {
      orientation = 'rows-are-loci'; confidence = 'high';
      why = 'the first column repeats the same labels, so they name primers or loci, not individuals';
    } else if (isBinary && repeatsInHeader && !repeatsInFirstColumn) {
      orientation = 'rows-are-individuals'; confidence = 'high';
      why = 'the header repeats labels, which is what a two-column-per-locus layout looks like';
    } else if (isBinary && body.length > 3 * Math.max(1, header.length - 1)) {
      orientation = 'rows-are-loci'; confidence = 'medium';
      why = 'there are many more rows than columns, the usual shape of a band matrix';
    } else {
      why = 'rows were taken as individuals, the most common layout';
    }
    return { orientation, confidence, why, isBinary, profile: prof };
  }

  function transpose(rows) {
    const h = rows.length, w = Math.max(...rows.map(r => r.length));
    const out = [];
    for (let j = 0; j < w; j++) {
      const r = [];
      for (let i = 0; i < h; i++) r.push(rows[i][j] ?? null);
      out.push(r);
    }
    return out;
  }

  /* Names that repeat get a numeric suffix, so every locus is addressable */
  function uniqueNames(names, fallback) {
    const seen = {}, out = [];
    names.forEach((n, i) => {
      let base = String(n ?? '').trim() || (fallback || 'L') + (i + 1);
      if (seen[base] == null) { seen[base] = 1; out.push(base); }
      else { seen[base]++; out.push(base + '_' + seen[base]); }
    });
    /* if a name repeated at all, number the first occurrence too */
    const counts = {};
    names.forEach(n => { const b = String(n ?? '').trim(); counts[b] = (counts[b] || 0) + 1; });
    return out.map((n, i) => {
      const b = String(names[i] ?? '').trim();
      return counts[b] > 1 && n === b ? b + '_1' : n;
    });
  }

  /* Column-level typing for the role table */
  function profileColumn(body, j) {
    let numeric = 0, text = 0, missing = 0;
    const vals = new Set(), all = [];
    body.forEach(r => {
      const v = r[j];
      if (isMissing(v)) { missing++; return; }
      /* "13,5" is a number written with a decimal comma (a semicolon CSV from a Spanish-language
         spreadsheet); the cell stays text, so a genotype such as "184,188" is still read as one */
      if (typeof v === 'number' || /^-?\d+,\d+$/.test(String(v).trim())) numeric++; else text++;
      if (vals.size < 200) vals.add(String(v));
      all.push(v);
    });
    const n = body.length;
    const unique = vals.size;
    const binary = all.length > 0 && all.every(v => v === 0 || v === 1 || v === '0' || v === '1');
    let kind = 'nominal';
    if (binary) kind = 'binary';
    else if (numeric > text && unique > 12) kind = 'quantitative';
    else if (numeric > text) kind = 'discrete';
    return { index: j, n, numeric, text, missing, unique, binary, kind, values: [...vals] };
  }

  /* Codominant layouts put two columns per locus: either the header repeats the
     locus name, or the second column is blank, or names end in _1/_2, A/B. */
  /* The pairing can start at any of the first few columns, because ID, population
     and coordinates sit in front of the loci. Try every offset and keep the best. */
  function detectCodominantPairs(header, maxOffset) {
    const h = header.map(v => String(v ?? '').trim());
    /* A genuine two-columns-per-locus header repeats each name EXACTLY twice.
       A band matrix grouped by primer repeats the same name many times over,
       and must not be mistaken for pairs of alleles. */
    const times = {};
    h.forEach(n => { if (n) times[n] = (times[n] || 0) + 1; });
    const overRepeated = Object.values(times).some(c => c > 2);
    const scoreAt = off => {
      let pairs = 0, singles = 0;
      for (let j = off; j + 1 < h.length; j += 2) {
        const a = h[j], b = h[j + 1];
        if (a === b && a !== '') pairs++;
        else if (b === '' && a !== '') pairs++;
        else if (/^(.+?)[._-]?(2|b|B)$/.test(b) && b.toLowerCase().replace(/[._-]?(2|b)$/i, '') === a.toLowerCase().replace(/[._-]?(1|a)$/i, '')) pairs++;
        else singles++;
      }
      return { pairs, singles, offset: off };
    };
    let best = scoreAt(0);
    for (let off = 1; off <= (maxOffset == null ? 4 : maxOffset) && off < h.length; off++) {
      const s = scoreAt(off);
      if (s.pairs > best.pairs) best = s;
    }
    return {
      looksCodominant: !overRepeated && best.pairs > 0 && best.pairs >= best.singles,
      pairs: best.pairs, singles: best.singles, offset: best.offset, overRepeated,
    };
  }

  /* ================================================================
     3 · BUILDING THE DATASET
     ================================================================ */

  /* cfg = {rows, orientation, markerKind, ploidy, missingCode, roles:{idCol,popCol,regionCol,latCol,lonCol}, dataStart} */
  function buildFromTable(cfg) {
    let rows = cfg.rows;
    if (cfg.orientation === 'rows-are-loci') rows = transpose(rows);

    const header = rows[0].map(v => (v == null ? '' : String(v).trim()));
    const body = rows.slice(1);
    const roles = cfg.roles || {};
    /* every role that is not data — the five label roles and any column the user
       chose to ignore (passed as extra keys) — is left out of the data columns */
    const labelCols = new Set(Object.values(roles).filter(v => typeof v === 'number' && v >= 0));
    const dataCols = [];
    for (let j = 0; j < header.length; j++) if (!labelCols.has(j)) dataCols.push(j);

    /* Every value the app has to reinterpret or discard is logged, so the QC card
       can say exactly which cell of the sheet to fix instead of failing silently. */
    const issues = makeIssues();
    /* where body row i sits in the user's sheet (a transposed sheet has it as a column) */
    const rowRef = i => cfg.transposed ? 'column ' + colLetter(i + 2) : 'row ' + ((cfg.rowOffset || 2) + i);
    const colName = j => header[j] || ('column ' + (j + 1));

    const ind = body.map((r, i) => {
      const num = c => {
        if (c == null || c < 0) return null;
        const v = r[c];
        if (isMissing(v)) return null;
        const x = Number(String(v).replace(',', '.'));
        if (!isFinite(x)) { issues.add('coordText', `${rowRef(i)}: “${v}” in ${colName(c)}`); return null; }
        return x;
      };
      const rec = {
        id: roles.idCol != null && roles.idCol >= 0 ? String(r[roles.idCol] ?? ('Ind' + (i + 1))).trim() : 'Ind' + (i + 1),
        pop: roles.popCol != null && roles.popCol >= 0 ? String(r[roles.popCol] ?? '').trim() : null,
        region: roles.regionCol != null && roles.regionCol >= 0 ? String(r[roles.regionCol] ?? '').trim() : null,
        lat: num(roles.latCol),
        lon: num(roles.lonCol),
      };
      if (rec.pop === '') issues.add('noPop', `${rowRef(i)} (${rec.id})`);
      return rec;
    });
    /* coordinates are degrees, or projected x/y in map units (UTM metres, for instance) when most of
       them do not fit in degrees; among degrees an impossible value would silently distort every
       distance, so it is dropped */
    const located = ind.filter(v => v.lat != null && v.lon != null);
    const outside = located.filter(v => Math.abs(v.lat) > 90 || Math.abs(v.lon) > 180).length;
    if (!(located.length && outside > located.length / 2)) ind.forEach((rec, i) => {
      if (rec.lat != null && Math.abs(rec.lat) > 90) { issues.add('coordRange', `${rowRef(i)} (${rec.id}): latitude ${rec.lat}`); rec.lat = null; }
      if (rec.lon != null && Math.abs(rec.lon) > 180) { issues.add('coordRange', `${rowRef(i)} (${rec.id}): longitude ${rec.lon}`); rec.lon = null; }
    });
    const seenId = new Map();
    ind.forEach((v, i) => { if (seenId.has(v.id)) issues.add('dupId', `${v.id} (${rowRef(seenId.get(v.id))} and ${rowRef(i)})`); else seenId.set(v.id, i); });

    const kind = cfg.markerKind;
    const combined = kind === 'codominant' && cfg.genoCells === 'combined';
    const sizeCoded = kind === 'codominant' && cfg.coding === 'size';
    const NUMERIC = /^-?\d+(\.\d+)?$/;
    const ploidy = kind === 'codominant' ? (cfg.ploidy || 2) : 1;
    const loci = [], geno = body.map(() => []);
    const mc = cfg.missingCode;

    if (kind === 'codominant' && combined) {
      /* one column per locus, the whole genotype in one cell */
      const clean = uniqueNames(dataCols.map(j => header[j]), 'Locus');
      dataCols.forEach((j, li) => {
        const alleles = new Set();
        body.forEach((r, i) => {
          const v = r[j];
          if (isMissing(v, mc)) { geno[i].push(null); return; }
          const parts = splitGenotype(v, ploidy);
          const bad = parts.some(p => isMissing(p, mc));
          /* "0/0" is a genotype not scored at all, like an empty cell: missing, but not half-scored */
          if (parts.length && parts.every(p => isMissing(p, mc))) { geno[i].push(null); return; }
          if (!parts.length || bad) { issues.add('halfScored', `${rowRef(i)}, ${colName(j)}: “${v}”`); geno[i].push(null); return; }
          if (parts.length !== ploidy) { issues.add('alleleCount', `${rowRef(i)}, ${colName(j)}: “${v}” has ${parts.length} allele${parts.length > 1 ? 's' : ''}, ploidy is ${ploidy}`); geno[i].push(null); return; }
          if (sizeCoded && parts.some(c => !NUMERIC.test(c))) { issues.add('nonNumericAllele', `${rowRef(i)}, ${colName(j)}: “${v}”`); geno[i].push(null); return; }
          parts.forEach(c => alleles.add(c));
          geno[i].push(parts);
        });
        loci.push({ name: clean[li], type: 'codominant', ploidy, alleles: sortAlleles([...alleles]) });
      });
      if (dataCols.length === 0) issues.add('emptyCols', 'no genotype columns');
    } else if (kind === 'codominant') {
      const names = [];
      for (let k = 0; k < dataCols.length; k += ploidy) names.push(header[dataCols[k]] || ('Locus' + (k / ploidy + 1)));
      const clean = uniqueNames(names, 'Locus');
      if (dataCols.length % ploidy)
        issues.add('oddColumns', `${dataCols.length} genotype columns cannot be split into loci of ${ploidy} columns; the last ${dataCols.length % ploidy} column(s) were ignored (${colName(dataCols[dataCols.length - 1])})`);
      for (let k = 0, li = 0; k + ploidy - 1 < dataCols.length; k += ploidy, li++) {
        const cols = [];
        for (let p = 0; p < ploidy; p++) cols.push(dataCols[k + p]);
        const alleles = new Set();
        body.forEach((r, i) => {
          const g = cols.map(c => r[c]);
          if (g.every(v => isMissing(v, mc))) { geno[i].push(null); return; }
          const codes = g.map(v => isMissing(v, mc) ? null : String(v).trim());
          if (codes.some(v => v === null)) {             // half-scored = missing
            issues.add('halfScored', `${rowRef(i)}, ${clean[li]}: ${g.map(v => (isMissing(v, mc) ? '·' : v)).join(' / ')}`);
            geno[i].push(null); return;
          }
          if (codes.some(c => /[/|]/.test(c))) { issues.add('combinedInColumns', `${rowRef(i)}, ${clean[li]}: “${codes.join(' ')}”`); geno[i].push(null); return; }
          /* a template that declares fragment sizes makes a letter in an allele a typo (18O for 180) */
          if (sizeCoded && codes.some(c => !NUMERIC.test(c))) { issues.add('nonNumericAllele', `${rowRef(i)}, ${clean[li]}: “${codes.join(' ')}”`); geno[i].push(null); return; }
          codes.forEach(c => alleles.add(c));
          geno[i].push(codes);
        });
        loci.push({ name: clean[li], type: 'codominant', ploidy, alleles: sortAlleles([...alleles]) });
      }
    } else if (kind === 'dominant') {
      const clean = uniqueNames(dataCols.map(j => header[j]), 'Band');
      const ONE = new Set(['1', 'p', 'present', '+', 'yes']), ZERO = new Set(['0', 'a', 'absent', '-', 'no']);
      dataCols.forEach((j, li) => {
        body.forEach((r, i) => {
          const v = r[j];
          /* −1 is a common code for a missing band score in parameter-row sheets */
          if (isMissing(v, mc) || String(v).trim() === '-1') { geno[i].push(null); return; }
          const s = String(v).trim().toLowerCase();
          if (ONE.has(s)) geno[i].push([1]);
          else if (ZERO.has(s)) geno[i].push([0]);
          else { issues.add('badBand', `${rowRef(i)}, ${clean[li]}: “${v}”`); geno[i].push(null); }
        });
        loci.push({ name: clean[li], type: 'dominant', ploidy: 1, alleles: ['0', '1'] });
      });
    } else if (kind === 'haploid') {
      const clean = uniqueNames(dataCols.map(j => header[j]), 'Locus');
      dataCols.forEach((j, li) => {
        const alleles = new Set();
        body.forEach((r, i) => {
          const v = r[j];
          if (isMissing(v, mc)) { geno[i].push(null); return; }
          const s = String(v).trim();
          if (/[\/|]/.test(s)) issues.add('twoAllelesHaploid', `${rowRef(i)}, ${clean[li]}: “${s}”`);
          alleles.add(s);
          geno[i].push([s]);
        });
        loci.push({ name: clean[li], type: 'haploid', ploidy: 1, alleles: sortAlleles([...alleles]) });
      });
    } else if (kind === 'sequence') {
      /* one column per gene region; regions are concatenated in column order */
      const parts = dataCols.map(j => ({ name: header[j] || ('Region' + (j + 1)), j }));
      const lens = parts.map(p => {
        const ls = body.map(r => (isMissing(r[p.j], mc) ? 0 : String(r[p.j]).replace(/\s+/g, '').length)).filter(x => x > 0);
        return ls.length ? Math.max(...ls) : 0;
      });
      const seqs = body.map((r, i) => parts.map((p, k) => {
        const v = r[p.j];
        if (isMissing(v, mc)) { issues.add('missingSeq', `${rowRef(i)} (${ind[i].id}), ${p.name}`); return '?'.repeat(lens[k]); }
        const s = String(v).replace(/\s+/g, '').toUpperCase();
        const badChars = s.replace(/[ACGTUNRYSWKMBDHV?\-.]/g, '');
        if (badChars) issues.add('badBase', `${rowRef(i)} (${ind[i].id}), ${p.name}: “${[...new Set(badChars)].join('')}”`);
        if (s.length !== lens[k]) issues.add('raggedSeq', `${rowRef(i)} (${ind[i].id}), ${p.name}: ${s.length} bp, longest is ${lens[k]} bp`);
        return s.replace(/U/g, 'T').replace(/\./g, '-');
      }).join(''));
      const d = seqDataset(ind, seqs, ind.map(v => v.id), Object.assign({ regions: parts.map((p, k) => ({ name: p.name, length: lens[k] })) }, cfg.meta));
      d.issues = issues.list();
      return d;
    } else if (kind === 'morph') {
      const clean = uniqueNames(dataCols.map(j => header[j]), 'Trait');
      const vars = [], values = body.map(() => []);
      dataCols.forEach((j, li) => {
        const prof = profileColumn(body, j);
        vars.push({ name: clean[li], kind: prof.kind });
        body.forEach((r, i) => {
          const v = r[j];
          if (isMissing(v, mc)) { values[i].push(null); return; }
          if (prof.numeric > prof.text && typeof v !== 'number') {
            const x = Number(String(v).replace(',', '.'));
            if (isFinite(x)) { values[i].push(x); return; }
            issues.add('traitText', `${rowRef(i)}, ${clean[li]}: “${v}”`); values[i].push(null); return;
          }
          values[i].push(v);
        });
      });
      const d = finish({ kind: 'morph', ploidy: 1, ind, loci: [], geno: body.map(() => []), traits: { vars, values }, meta: cfg.meta });
      d.issues = issues.list();
      return d;
    }

    /* rows with nothing scored and loci with nothing scored: usually template rows not filled in yet */
    body.forEach((r, i) => { if (loci.length && geno[i].every(g => g == null)) issues.add('emptyRow', `${rowRef(i)} (${ind[i].id})`); });
    loci.forEach((l, li) => { if (body.length && geno.every(g => g[li] == null)) issues.add('emptyLocus', l.name); });
    /* allele codes: fragment sizes should all be numbers */
    /* each case is reported with its row, so it can be found in the sheet */
    /* one or two text codes among numeric sizes are typos (18O for 180): kept, they would
       count as extra alleles and inflate Na, He and every distance, so the genotype is
       set to missing and the cell is reported */
    if (kind === 'codominant') loci.forEach((l, li) => {
      const nonNum = new Set(l.alleles.filter(a => !/^-?\d+(\.\d+)?$/.test(a)));
      if (!(nonNum.size && nonNum.size < l.alleles.length && (cfg.coding === 'size' || nonNum.size <= 2))) return;
      geno.forEach((g, i) => {
        const odd = g[li] ? g[li].filter(a => nonNum.has(a)) : [];
        if (odd.length) { issues.add('mixedCodes', `${rowRef(i)}, ${l.name}: “${odd.join(' ')}” among numeric alleles`); g[li] = null; }
      });
      l.alleles = l.alleles.filter(a => !nonNum.has(a));
    });

    const d = finish({ kind, ploidy, ind, loci, geno, traits: null, meta: cfg.meta });
    d.issues = issues.list();
    return d;
  }

  function colLetter(n) { let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; }

  /* collects problems by type, keeping a few examples of each */
  const ISSUE_TEXT = {
    badBand: ['error', 'band scores that are not 0 or 1 were set to missing'],
    halfScored: ['warning', 'genotypes with only some alleles scored were set to missing'],
    alleleCount: ['error', 'genotype cells with the wrong number of alleles were set to missing'],
    combinedInColumns: ['error', 'cells hold a whole genotype although the layout is one allele per column (set to missing) — if the whole sheet is written so, choose “whole genotype in one cell”'],
    oddColumns: ['error', 'the number of genotype columns does not match the ploidy'],
    twoAllelesHaploid: ['warning', 'haploid cells that look like two alleles'],
    mixedCodes: ['error', 'text codes among numeric fragment sizes (a letter O for a zero?) were set to missing'],
    nonNumericAllele: ['error', 'allele sizes that are not numbers (a letter O for a zero?) were set to missing'],
    emptyRow: ['warning', 'rows with no data at all (not filled in yet?)'],
    emptyLocus: ['warning', 'loci with no data at all (not filled in yet?)'],
    dupId: ['error', 'repeated IDs (both rows are kept: give one of them another name)'],
    noPop: ['warning', 'rows without a population name (left out of every population)'],
    coordRange: ['error', 'coordinates out of range (latitude ±90°, longitude ±180°) were set to missing'],
    coordText: ['warning', 'coordinates that are not numbers'],
    badBase: ['error', 'characters that are not IUPAC nucleotide codes'],
    raggedSeq: ['warning', 'sequences shorter than the longest one in their region (not aligned?)'],
    missingSeq: ['warning', 'sequences not entered (filled with ? so the alignment stays intact)'],
    traitText: ['warning', 'text in numeric trait columns, set to missing'],
    emptyCols: ['error', 'no data columns'],
  };
  function makeIssues() {
    const map = new Map();
    return {
      add(type, example) {
        if (!map.has(type)) map.set(type, { type, count: 0, examples: [] });
        const it = map.get(type); it.count++;
        if (it.examples.length < 6) it.examples.push(example);
      },
      list() {
        return [...map.values()].map(it => Object.assign(it, { level: (ISSUE_TEXT[it.type] || ['warning'])[0], text: (ISSUE_TEXT[it.type] || [, it.type])[1] }));
      },
    };
  }

  /* "180/184", "180-184", "A/G", "AG", "180184" (six-digit style) → allele codes */
  function splitGenotype(v, ploidy) {
    const s = String(v).trim();
    let parts = s.split(/\s*[\/|:;,]\s*|\s+/).filter(x => x !== '');
    if (parts.length === 1 && /^\d{2,3}-\d{2,3}$/.test(s)) parts = s.split('-');
    if (parts.length === 1 && ploidy > 1) {
      const t = parts[0];
      if (/^[ACGTN\-]+$/i.test(t) && t.length === ploidy) parts = t.toUpperCase().split('');
      else if (/^\d+$/.test(t) && t.length % ploidy === 0 && t.length / ploidy >= 2 && t.length / ploidy <= 3) {
        const w = t.length / ploidy; parts = [];
        for (let k = 0; k < ploidy; k++) parts.push(String(Number(t.slice(k * w, (k + 1) * w))));
      }
    }
    return parts.map(p => (/^[acgtn]$/.test(p) ? p.toUpperCase() : p));
  }

  /* numeric allele codes sort numerically, everything else alphabetically */
  function sortAlleles(list) {
    const allNum = list.every(v => /^-?\d+(\.\d+)?$/.test(v));
    return allNum ? list.sort((a, b) => Number(a) - Number(b)) : list.sort();
  }

  /* populations, regions and derived counts */
  function finish(d) {
    const popMap = new Map();
    d.ind.forEach((v, i) => {
      const name = v.pop && v.pop !== '' ? v.pop : null;
      if (name == null) return;
      if (!popMap.has(name)) popMap.set(name, { name, idx: [], region: v.region || null });
      popMap.get(name).idx.push(i);
    });
    d.pops = [...popMap.values()];
    d.declaredPops = d.pops.length > 0;
    if (!d.declaredPops) {
      /* no population column: every row is its own operational unit */
      d.pops = d.ind.map((v, i) => ({ name: v.id, idx: [i], region: v.region || null }));
      d.singletons = true;
    } else {
      d.singletons = d.pops.every(p => p.idx.length === 1);
    }
    const regMap = new Map();
    d.pops.forEach((p, pi) => {
      if (!p.region) return;
      if (!regMap.has(p.region)) regMap.set(p.region, { name: p.region, pops: [] });
      regMap.get(p.region).pops.push(pi);
    });
    d.regions = [...regMap.values()];
    d.nInd = d.ind.length;
    d.nLoci = d.loci.length;
    d.nPops = d.pops.length;
    return d;
  }

  /* ================================================================
     4 · PARSERS FOR THE CLASSIC PROGRAMS
     ================================================================ */

  /* .str genotype file: optional marker-name line, then 1 or 2 rows per individual;
     columns: ID [PopData] [PopFlag] [LocData] allele1 ... alleleL */
  function parseStrFile(text, opts) {
    opts = opts || {};
    const lines = text.split(/\r?\n/).filter(l => l.trim() !== '');
    const split = l => l.trim().split(/[\s,;\t]+/);
    let markerNames = null, start = 0;
    const first = split(lines[0]);
    const firstNumeric = first.every(v => /^-?\d+$/.test(v));
    if (!firstNumeric) { markerNames = first; start = 1; }
    const recs = lines.slice(start).map(split);
    const nCols = recs[0].length;
    const nLoci = markerNames ? markerNames.length : null;
    /* how many leading label columns? */
    let nLabel = opts.labelCols != null ? opts.labelCols : (nLoci ? nCols - nLoci : 2);
    if (nLabel < 1) nLabel = 1;
    const rowsPerInd = opts.rowsPerInd || guessRowsPerInd(recs, nLabel);
    const ind = [], geno = [];
    for (let i = 0; i < recs.length; i += rowsPerInd) {
      const r = recs[i];
      ind.push({ id: r[0], pop: nLabel > 1 ? String(r[1]) : null, region: null, lat: null, lon: null });
      const g = [];
      const L = (nCols - nLabel);
      for (let l = 0; l < L; l++) {
        const codes = [];
        for (let k = 0; k < rowsPerInd; k++) codes.push(recs[i + k][nLabel + l]);
        g.push(codes.some(c => c == null || c === '-9') ? null : codes.map(String));
      }
      geno.push(g);
    }
    const L = geno[0].length;
    const loci = [];
    for (let l = 0; l < L; l++) {
      const alleles = new Set();
      geno.forEach(g => { if (g[l]) g[l].forEach(a => alleles.add(a)); });
      loci.push({ name: markerNames ? markerNames[l] : 'Locus' + (l + 1), type: rowsPerInd > 1 ? 'codominant' : 'haploid', ploidy: rowsPerInd, alleles: sortAlleles([...alleles]) });
    }
    return finish({ kind: rowsPerInd > 1 ? 'codominant' : 'haploid', ploidy: rowsPerInd, ind, loci, geno, traits: null, meta: { source: '.str file' } });
  }

  function guessRowsPerInd(recs, nLabel) {
    /* two rows per individual repeat the ID on consecutive lines */
    let repeats = 0;
    for (let i = 0; i + 1 < recs.length; i += 2) if (recs[i][0] === recs[i + 1][0]) repeats++;
    return repeats > recs.length / 4 ? 2 : 1;
  }

  /* .gen population file: title line, locus names (one per line or comma separated),
     then "POP" separated blocks of "name , 001002 003003 ..." */
  function parseGenFile(text) {
    const lines = text.split(/\r?\n/).map(l => l.replace(/\s+$/, ''));
    const locusNames = [];
    let i = 1;
    for (; i < lines.length; i++) {
      const l = lines[i].trim();
      if (/^pop$/i.test(l)) break;
      if (l === '') continue;
      l.split(',').forEach(n => { if (n.trim()) locusNames.push(n.trim()); });
    }
    const ind = [], geno = [];
    let popN = 0;
    for (; i < lines.length; i++) {
      const l = lines[i].trim();
      if (l === '') continue;
      if (/^pop$/i.test(l)) { popN++; continue; }
      const parts = l.split(',');
      const name = (parts[0] || '').trim();
      const codes = (parts.slice(1).join(',') || '').trim().split(/\s+/).filter(Boolean);
      ind.push({ id: name || ('Ind' + (ind.length + 1)), pop: 'Pop' + popN, region: null, lat: null, lon: null });
      geno.push(codes.map(c => {
        const w = c.length >= 6 ? 3 : 2;
        const a = c.slice(0, w), b = c.slice(w) || a;
        return (/^0+$/.test(a) || /^0+$/.test(b)) ? null : [String(Number(a)), String(Number(b))];
      }));
    }
    const L = Math.max(...geno.map(g => g.length));
    const loci = [];
    for (let l = 0; l < L; l++) {
      const alleles = new Set();
      geno.forEach(g => { if (g[l]) g[l].forEach(a => alleles.add(a)); });
      loci.push({ name: locusNames[l] || ('Locus' + (l + 1)), type: 'codominant', ploidy: 2, alleles: sortAlleles([...alleles]) });
    }
    return finish({ kind: 'codominant', ploidy: 2, ind, loci, geno, traits: null, meta: { source: '.gen file' } });
  }

  /* .arp project file — genotypic and haplotypic samples */
  function parseArpFile(text) {
    const dataTypeM = text.match(/DataType\s*=\s*(\w+)/i);
    const dataType = dataTypeM ? dataTypeM[1].toUpperCase() : 'MICROSAT';
    const genoM = text.match(/GenotypicData\s*=\s*(\d)/i);
    const genotypic = genoM ? genoM[1] === '1' : true;
    const blocks = [...text.matchAll(/SampleName\s*=\s*"([^"]*)"[\s\S]*?SampleData\s*=\s*\{([\s\S]*?)\}/gi)];
    const ind = [], geno = [];
    blocks.forEach(b => {
      const popName = b[1].trim();
      const lines = b[2].split(/\r?\n/).map(l => l.trim()).filter(l => l !== '');
      for (let i = 0; i < lines.length; i++) {
        const p = lines[i].split(/\s+/);
        const id = p[0];
        let codes = p.slice(2);
        if (genotypic) {
          const second = (lines[i + 1] || '').trim().split(/\s+/).filter(Boolean);
          const secondIsContinuation = second.length === codes.length;
          const g = codes.map((c, l) => {
            const a = c, bb = secondIsContinuation ? second[l] : c;
            return (a === '?' || bb === '?' || a === '-9') ? null : [String(a), String(bb)];
          });
          ind.push({ id, pop: popName, region: null, lat: null, lon: null });
          geno.push(g);
          if (secondIsContinuation) i++;
        } else {
          ind.push({ id, pop: popName, region: null, lat: null, lon: null });
          geno.push(codes.map(c => (c === '?' ? null : [String(c)])));
        }
      }
    });
    const L = Math.max(...geno.map(g => g.length));
    const loci = [];
    for (let l = 0; l < L; l++) {
      const alleles = new Set();
      geno.forEach(g => { if (g[l]) g[l].forEach(a => alleles.add(a)); });
      loci.push({ name: 'Locus' + (l + 1), type: genotypic ? 'codominant' : 'haploid', ploidy: genotypic ? 2 : 1, alleles: sortAlleles([...alleles]) });
    }
    return finish({ kind: genotypic ? 'codominant' : 'haploid', ploidy: genotypic ? 2 : 1, ind, loci, geno, traits: null, meta: { source: '.arp file (' + dataType + ')' } });
  }

  /* FASTA — sequences become haplotypes; the population is read from the header
     when it is written as ">id | pop | region" (or with two or more spaces between the parts);
     ">id_pop" is not split, since underscores are common inside names */
  function parseFasta(text) {
    const names = [], seqs = [];
    let cur = null;
    text.split(/\r?\n/).forEach(line => {
      if (line.startsWith('>')) { names.push(line.slice(1).trim()); seqs.push(''); cur = seqs.length - 1; }
      else if (cur != null) seqs[cur] += line.replace(/\s+/g, '');
    });
    if (!seqs.length) throw new Error('No sequences found in the FASTA file.');
    const ind = names.map((n, i) => {
      const parts = n.split(/\s*[|]\s*|\s{2,}/);
      return { id: parts[0] || ('Seq' + (i + 1)), pop: parts[1] ? parts[1].trim() : null, region: parts[2] ? parts[2].trim() : null, lat: null, lon: null };
    });
    return seqDataset(ind, seqs, names, { source: 'FASTA' });
  }

  /* sequences → haplotypes (identical sequences) → dataset */
  function seqDataset(ind, seqs, names, meta) {
    /* an RNA alignment writes U where DNA has T: the same base for every analysis */
    const up = seqs.map(s => String(s).toUpperCase().replace(/U/g, 'T'));
    const len = up.length ? up[0].length : 0;
    const ragged = up.some(s => s.length !== len);
    const hapOf = new Map(), hapSeq = [];
    const hapIndex = up.map(s => {
      if (!hapOf.has(s)) { hapOf.set(s, hapSeq.length); hapSeq.push(s); }
      return hapOf.get(s);
    });
    const geno = hapIndex.map(h => [['H' + (h + 1)]]);
    const loci = [{ name: 'Haplotype', type: 'sequence', ploidy: 1, alleles: hapSeq.map((_, i) => 'H' + (i + 1)) }];
    const d = finish({ kind: 'sequence', ploidy: 1, ind, loci, geno, traits: null, meta: Object.assign({ ragged }, meta) });
    d.seqs = { names, aln: up, length: len, ragged, hapSeq, hapIndex };
    return d;
  }

  /* A sample sheet (ID, Population, Region, Latitude, Longitude) completes the
     formats that cannot carry that information: FASTA, VCF, .str and .gen files. */
  function attachSampleSheet(d, rows) {
    const header = rows[0].map(v => String(v ?? '').trim());
    const find = re => header.findIndex(h => re.test(h));
    const cId = find(/^(id|ind|individual|sample|plant|tree|accession|genotype|landrace|name|seq|sequence|otu|clave|individuo|muestra|planta)/i);
    const cPop = find(/^(pop|population|poblaci|site|locality|group|deme|localidad|sitio)/i);
    const cReg = find(/^(region|zone|state|estado|area|province|country|pa[ií]s)/i);
    const cLat = find(/^(lat|latitude|latitud|y)$/i) >= 0 ? find(/^(lat|latitude|latitud|y)$/i) : find(/^lat/i);
    const cLon = find(/^(lon|long|longitude|longitud|x)$/i) >= 0 ? find(/^(lon|long|longitude|longitud|x)$/i) : find(/^lon/i);
    if (cId < 0) throw new Error('The sample sheet needs an ID column (called ID, Sample, Individual…).');
    const key = s => String(s ?? '').trim().toLowerCase();
    const byId = new Map();
    rows.slice(1).forEach(r => { if (!isMissing(r[cId])) byId.set(key(r[cId]), r); });
    let matched = 0;
    const unmatched = [];
    d.ind.forEach(v => {
      const r = byId.get(key(v.id));
      if (!r) { unmatched.push(v.id); return; }
      matched++; byId.delete(key(v.id));
      if (cPop >= 0 && !isMissing(r[cPop])) v.pop = String(r[cPop]).trim();
      if (cReg >= 0 && !isMissing(r[cReg])) v.region = String(r[cReg]).trim();
      const n = c => (c >= 0 && !isMissing(r[c]) && isFinite(Number(String(r[c]).replace(',', '.'))) ? Number(String(r[c]).replace(',', '.')) : null);
      if (cLat >= 0) v.lat = n(cLat);
      if (cLon >= 0) v.lon = n(cLon);
    });
    delete d.singletons;
    finish(d);
    return { matched, unmatched, extra: [...byId.values()].map(r => String(r[cId])), columns: { pop: cPop >= 0, region: cReg >= 0, coords: cLat >= 0 && cLon >= 0 } };
  }

  /* VCF — biallelic SNPs, GT field */
  function parseVcf(text) {
    const lines = text.split(/\r?\n/);
    let sampleNames = [], loci = [], rowsGT = [];
    lines.forEach(line => {
      if (line.startsWith('##') || line.trim() === '') return;
      const f = line.split(/\t/);
      if (line.startsWith('#CHROM')) { sampleNames = f.slice(9); return; }
      if (!sampleNames.length) return;
      const id = f[2] && f[2] !== '.' ? f[2] : f[0] + '_' + f[1];
      const ref = f[3], alt = (f[4] || '').split(',')[0];
      const fmt = (f[8] || 'GT').split(':');
      const gi = fmt.indexOf('GT');
      const calls = f.slice(9).map(s => {
        const gt = s.split(':')[gi < 0 ? 0 : gi];
        if (!gt || gt.startsWith('.')) return null;
        const a = gt.split(/[\/|]/).map(x => (x === '0' ? ref : x === '1' ? alt : null));
        return a.some(x => x == null) ? null : a;
      });
      loci.push({ name: id, type: 'codominant', ploidy: 2, alleles: [ref, alt].filter(Boolean) });
      rowsGT.push(calls);
    });
    const ind = sampleNames.map(n => ({ id: n, pop: null, region: null, lat: null, lon: null }));
    const geno = ind.map((_, i) => rowsGT.map(r => r[i]));
    return finish({ kind: 'codominant', ploidy: 2, ind, loci, geno, traits: null, meta: { source: 'VCF' } });
  }

  /* ================================================================
     5 · QUALITY CONTROL
     ================================================================ */

  function computeQC(d) {
    const nI = d.nInd, nL = d.nLoci;
    const perLocus = [], perInd = new Array(nI).fill(0);
    let totalCells = 0, totalMissing = 0;

    for (let l = 0; l < nL; l++) {
      let missing = 0;
      const counts = new Map();
      let nGenes = 0, hetero = 0, scored = 0;
      for (let i = 0; i < nI; i++) {
        const g = d.geno[i][l];
        totalCells++;
        if (!g) { missing++; perInd[i]++; totalMissing++; continue; }
        scored++;
        if (d.kind === 'dominant') {
          counts.set(String(g[0]), (counts.get(String(g[0])) || 0) + 1);
          nGenes++;
        } else {
          g.forEach(a => { counts.set(String(a), (counts.get(String(a)) || 0) + 1); nGenes++; });
          if (g.length > 1 && new Set(g.map(String)).size > 1) hetero++;
        }
      }
      const nAlleles = d.kind === 'dominant' ? 2 : counts.size;
      const freqs = {};
      counts.forEach((v, k) => { freqs[k] = v / Math.max(1, nGenes); });
      const bandFreq = d.kind === 'dominant' ? (counts.get('1') || 0) / Math.max(1, scored) : null;
      const monomorphic = d.kind === 'dominant' ? (bandFreq === 0 || bandFreq === 1) : counts.size <= 1;
      perLocus.push({
        index: l, name: d.loci[l].name, missing, pMissing: nI ? missing / nI : 0,
        scored, nAlleles: d.kind === 'dominant' ? (monomorphic ? 1 : 2) : nAlleles,
        freqs, bandFreq, monomorphic,
        Ho: d.kind === 'codominant' && scored ? hetero / scored : null,
      });
    }

    /* Duplicate multilocus genotypes = clones or re-sampled plants.
       Only meaningful with several independent loci: a single-locus haplotype
       dataset shares "genotypes" by definition, and trait matrices have none. */
    const clonesMeaningful = nL >= 3 && d.kind !== 'sequence' && d.kind !== 'morph';
    const sigs = new Map(), dups = [];
    if (clonesMeaningful) {
      for (let i = 0; i < nI; i++) {
        /* rows not filled in (or barely scored) all share the signature "?|?|?": they are not clones */
        if (nL - perInd[i] < Math.max(2, Math.ceil(nL / 2))) continue;
        const sig = d.geno[i].map(g => (g ? g.map(String).sort().join('/') : '?')).join('|');
        if (sigs.has(sig)) dups.push([sigs.get(sig), i]); else sigs.set(sig, i);
      }
    }

    /* pairwise identity ignoring missing data, for near-duplicates */
    const nearDups = [];
    if (clonesMeaningful && nI <= 400) {
      for (let i = 0; i < nI; i++) for (let j = i + 1; j < nI; j++) {
        let same = 0, comp = 0;
        for (let l = 0; l < nL; l++) {
          const a = d.geno[i][l], b = d.geno[j][l];
          if (!a || !b) continue;
          comp++;
          if (a.map(String).sort().join('/') === b.map(String).sort().join('/')) same++;
        }
        if (comp >= Math.max(4, nL * 0.5) && same / comp >= 0.95 && same !== comp) nearDups.push([i, j, same / comp]);
      }
    }

    const popSizes = d.pops.map(p => ({ name: p.name, n: p.idx.length }));
    const rare = perLocus.filter(p => p.bandFreq != null && p.bandFreq > 0 && p.bandFreq < 0.05).length;
    const fixed = perLocus.filter(p => p.bandFreq != null && p.bandFreq > 0.95 && p.bandFreq < 1).length;

    return {
      nInd: nI, nLoci: nL, nPops: d.nPops,
      pMissing: totalCells ? totalMissing / totalCells : 0,
      perLocus, perInd: perInd.map((m, i) => ({ index: i, id: d.ind[i].id, pop: d.ind[i].pop, missing: m, pMissing: nL ? m / nL : 0 })),
      monomorphic: perLocus.filter(p => p.monomorphic).map(p => p.name),
      dups, nearDups, clonesMeaningful, popSizes, rare, fixed,
      meanAlleles: perLocus.reduce((a, p) => a + p.nAlleles, 0) / Math.max(1, nL),
    };
  }

  /* Which analyses can honestly be run with these data */
  function capabilities(d, qc) {
    const withReplicates = d.pops.filter(p => p.idx.length >= 2).length;
    const codom = d.kind === 'codominant';
    const diploid = (d.ploidy || 2) === 2;
    const morph = d.kind === 'morph';
    const seq = d.kind === 'sequence';
    /* a single-locus haplotype column is not a multilocus genotype */
    const multilocus = d.nLoci >= 2;
    const polymorphic = qc ? qc.nLoci - qc.monomorphic.length : d.nLoci;
    const noMarkers = 'this file holds traits, not markers';
    return {
      diversity: {
        ok: !morph && d.nLoci > 0 && withReplicates >= 1,
        why: morph ? noMarkers : withReplicates >= 1 ? '' : 'every population has a single sample, so within-population diversity cannot be estimated',
      },
      hwe: {
        ok: codom && diploid && withReplicates >= 1,
        why: morph ? noMarkers : !codom ? 'observed heterozygosity is not visible in ' + d.kind + ' data' : !diploid ? 'Hardy–Weinberg tests, F_IS and null alleles are implemented for diploid genotypes' : withReplicates ? '' : 'no population has replicate individuals',
      },
      linkage: {
        /* the index of association works on any marker type, not just genotypes */
        ok: !morph && !seq && multilocus && withReplicates >= 1,
        why: morph ? noMarkers : seq ? 'a single alignment gives one locus' : !multilocus ? 'at least two loci are needed' : 'no population has replicate individuals',
      },
      amova: {
        ok: !morph && withReplicates >= 2,
        why: morph ? 'AMOVA partitions marker variation; for traits use an analysis of variance or Q_ST' : 'AMOVA needs at least two populations with more than one individual',
      },
      fstats: {
        ok: !morph && withReplicates >= 2,
        why: morph ? 'F-statistics are defined for markers; the trait equivalent is Q_ST' : 'differentiation between populations needs replicate individuals within them',
      },
      distance: { ok: d.nInd >= 3 && (morph || polymorphic >= 1), why: d.nInd >= 3 ? '' : 'at least three units are needed' },
      ordination: { ok: d.nInd >= 3, why: d.nInd >= 3 ? '' : 'at least three units are needed' },
      clustering: {
        ok: !morph && !seq && d.nInd >= 6 && polymorphic >= 5,
        why: morph ? noMarkers : seq ? 'admixture models need several unlinked loci, not one alignment' : d.nInd < 6 ? 'Bayesian clustering needs more individuals' : 'at least five polymorphic loci are needed',
      },
      sequences: { ok: seq, why: 'no aligned sequences were loaded' },
      /* as Block 9 runs them: diploid genotypes, five plants for the selfing rate and ten for bottlenecks and N_e */
      demography: {
        ok: codom && diploid && multilocus && d.pops.some(p => p.idx.length >= 5),
        why: morph ? noMarkers : !codom ? 'bottleneck and N_e estimators assume codominant genotypes' : !diploid ? 'bottleneck, N_e and selfing estimators assume diploid genotypes' : !multilocus ? 'at least two loci are needed' : 'a population with five or more plants is needed (ten for bottleneck tests and N_e)',
      },
      spatial: {
        ok: d.ind.some(v => v.lat != null && isFinite(v.lat)) && d.nInd >= 10,
        why: d.ind.some(v => v.lat != null && isFinite(v.lat)) ? 'more mapped individuals are needed' : 'coordinates were not declared',
      },
    };
  }

  window.Data = {
    MISSING_TOKENS, isMissing, trimRows, readFile, loadExample, sheetRows, parseDelimited,
    sniffFormat, readParameterHeader, readTemplateHeader, cellShapes, guessOrientation, transpose, matrixProfile,
    profileColumn, detectCodominantPairs, uniqueNames, sortAlleles, splitGenotype, seqDataset, attachSampleSheet,
    buildFromTable, parseStrFile, parseGenFile, parseArpFile, parseFasta, parseVcf,
    computeQC, capabilities, finish, ISSUE_TEXT,
  };
})();
