/* PopGeneticsPro — data template engine (no DOM).

   From a sampling design (what was scored, how many populations, how many plants
   in each, which loci or traits) it writes the sheet the user will fill in:
   PopGeneticsPro CSV or .xlsx, the parameter-row layout, a FASTA skeleton or a sample sheet.
   Row 1 of the PopGeneticsPro layout declares the design, so when the filled
   sheet comes back the app reads it without guessing and checks it against
   what was declared. */

(function () {

  const KINDS = {
    codominant: { dataKind: 'codominant', label: 'Codominant markers', sub: 'SSR / microsatellites, isozymes', art: 'ssr', coding: 'size', lociWord: 'loci', prefix: 'SSR' },
    snp: { dataKind: 'codominant', label: 'SNP genotypes', sub: 'biallelic SNPs, genotyping-by-sequencing calls', art: 'seqAln', coding: 'nucleotide', lociWord: 'SNPs', prefix: 'SNP' },
    dominant: { dataKind: 'dominant', label: 'Dominant markers', sub: 'AFLP, ISSR, RAPD, SRAP — band 1/0', art: 'gel', coding: 'binary', lociWord: 'bands', prefix: 'B' },
    haploid: { dataKind: 'haploid', label: 'Haplotype codes', sub: 'cpSSR, PCR-RFLP, one code per locus', art: 'network', coding: 'code', lociWord: 'loci', prefix: 'cpSSR' },
    sequence: { dataKind: 'sequence', label: 'DNA sequences', sub: 'aligned cpDNA, mtDNA, ITS regions', art: 'seqAln', coding: 'nucleotide', lociWord: 'regions', prefix: 'Region' },
    morph: { dataKind: 'morph', label: 'Morphological traits', sub: 'measurements, counts, scales', art: 'morph', coding: 'value', lociWord: 'traits', prefix: 'Trait' },
  };

  const SIGNATURE = '#PopGeneticsPro template';

  function defaults() {
    return {
      kind: 'codominant', unit: 'individuals', sampling: 'pops', title: '',
      pops: [
        { name: 'Pop1', n: 20, region: '', lat: '', lon: '', group: '' },
        { name: 'Pop2', n: 20, region: '', lat: '', lon: '', group: '' },
        { name: 'Pop3', n: 20, region: '', lat: '', lon: '', group: '' },
      ],
      useRegion: false, useGroup: false, coords: 'none', idStyle: 'pop',
      nLoci: 10, prefix: '', names: '',
      ploidy: 2, genoCells: 'columns', missing: '0',
      bandMode: 'numbered', primers: [{ name: 'UBC807', bands: 12 }, { name: 'UBC808', bands: 10 }],
      orientation: 'rows-are-individuals',
      regions: [{ name: 'trnL-trnF', length: '' }, { name: 'psbA-trnH', length: '' }],
      seqLayout: 'sheet',
      traits: [
        { name: 'PlantHeight', unit: 'cm', type: 'quantitative' },
        { name: 'EarLength', unit: 'cm', type: 'quantitative' },
        { name: 'KernelRows', unit: '', type: 'count' },
      ],
      fill: null,
    };
  }

  const pad = (k, w) => String(k).padStart(w, '0');
  const cleanName = s => String(s ?? '').trim().replace(/[,;"\t\r\n]+/g, ' ').replace(/\s+/g, ' ');
  const idStem = s => cleanName(s).replace(/\s+/g, '_') || 'Pop';

  /* ---------------- names ---------------- */

  /* one name per line; "UBC807 x 12" (or ×, *) expands to UBC807_1 … UBC807_12 */
  function expandNames(text) {
    const out = [];
    String(text || '').split(/\r?\n|,/).map(s => s.trim()).filter(Boolean).forEach(line => {
      const m = line.match(/^(.+?)\s*[x×*]\s*(\d{1,4})$/i);
      if (m) { const k = Math.min(2000, Number(m[2])); for (let b = 1; b <= k; b++) out.push(cleanName(m[1]) + '_' + b); }
      else out.push(cleanName(line));
    });
    return out;
  }

  function locusNames(ds) {
    const K = KINDS[ds.kind];
    if (ds.fill) {
      if (ds.kind === 'morph') return ds.fill.traits.vars.map(v => v.name);
      if (ds.kind === 'sequence') return (ds.fill.meta && ds.fill.meta.regions ? ds.fill.meta.regions.map(r => r.name) : ['Sequence']);
      return ds.fill.loci.map(l => l.name);
    }
    if (ds.kind === 'sequence') return ds.regions.map((r, i) => cleanName(r.name) || 'Region' + (i + 1));
    if (ds.kind === 'morph') return ds.traits.map((t, i) => {
      const nm = idStem(t.name || 'Trait' + (i + 1));
      const u = cleanName(t.unit).replace(/\s+/g, '');
      return u ? nm + '_' + u : nm;
    });
    if (ds.kind === 'dominant' && ds.bandMode === 'primers') {
      const out = [];
      ds.primers.forEach((p, i) => { const k = Math.max(0, Math.min(500, Math.floor(Number(p.bands) || 0))); for (let b = 1; b <= k; b++) out.push(idStem(p.name || 'Primer' + (i + 1)) + '_' + pad(b, String(k).length)); });
      return out;
    }
    const listed = expandNames(ds.names);
    if (listed.length) return listed;
    const n = Math.max(0, Math.min(100000, Math.floor(Number(ds.nLoci) || 0)));
    const prefix = cleanName(ds.prefix) || K.prefix;
    const w = String(n).length;
    return Array.from({ length: n }, (_, i) => prefix + pad(i + 1, Math.max(2, w)));
  }

  /* ---------------- units (rows) ---------------- */

  function unitWord(ds, plural) {
    /* UNIT_NAMES is a top-level const of core.js, so it is not a property of window */
    const table = typeof UNIT_NAMES !== 'undefined' ? UNIT_NAMES : null;
    const u = (table && table[ds.unit]) || ['individual', 'individuals'];
    const w = plural ? u[1] : u[0];
    return w.charAt(0).toUpperCase() + w.slice(1);
  }

  function units(ds) {
    if (ds.fill) {
      return ds.fill.ind.map(v => ({ id: v.id, pop: v.pop, region: v.region, lat: v.lat, lon: v.lon }));
    }
    const out = [];
    if (ds.sampling === 'bulk') {
      ds.pops.forEach((p, i) => out.push({
        id: cleanName(p.name) || unitWord(ds) + (i + 1),
        pop: ds.useGroup ? cleanName(p.group) : null,
        region: ds.useRegion ? cleanName(p.region) : null,
        lat: ds.coords !== 'none' ? p.lat : null, lon: ds.coords !== 'none' ? p.lon : null,
      }));
      return out;
    }
    const total = ds.pops.reduce((a, p) => a + (Math.floor(Number(p.n)) || 0), 0);
    let running = 0;
    ds.pops.forEach((p, i) => {
      const n = Math.max(0, Math.min(5000, Math.floor(Number(p.n)) || 0));
      const name = cleanName(p.name) || 'Pop' + (i + 1);
      const w = Math.max(2, String(n).length);
      for (let k = 1; k <= n; k++) {
        running++;
        out.push({
          id: ds.idStyle === 'pop' ? idStem(name) + '_' + pad(k, w) : ds.idStyle === 'number' ? pad(running, Math.max(3, String(total).length)) : '',
          pop: name,
          region: ds.useRegion ? cleanName(p.region) : null,
          lat: ds.coords === 'pop' ? p.lat : '', lon: ds.coords === 'pop' ? p.lon : '',
        });
      }
    });
    return out;
  }

  /* population order and sizes as they will appear in the sheet */
  function popSizes(ds) {
    const us = units(ds);
    const m = new Map();
    us.forEach(u => { if (u.pop) m.set(u.pop, (m.get(u.pop) || 0) + 1); });
    return [...m.entries()].map(([name, n]) => ({ name, n }));
  }

  /* ---------------- the layout ---------------- */

  function colNames(ds) {
    const bulk = ds.sampling === 'bulk';
    const hasPop = ds.fill ? ds.fill.declaredPops : (bulk ? ds.useGroup : true);
    const hasRegion = ds.fill ? ds.fill.ind.some(v => v.region) : ds.useRegion;
    const hasCoords = ds.fill ? ds.fill.ind.some(v => v.lat != null && isFinite(v.lat)) : ds.coords !== 'none';
    return {
      id: unitWord(ds),
      pop: hasPop ? (bulk && !ds.fill ? 'Group' : 'Population') : null,
      region: hasRegion ? 'Region' : null,
      lat: hasCoords ? 'Latitude' : null,
      lon: hasCoords ? 'Longitude' : null,
    };
  }

  function transposed(ds) { return ds.kind === 'dominant' && ds.orientation === 'rows-are-loci'; }

  function signature(ds) {
    const K = KINDS[ds.kind];
    const names = locusNames(ds);
    const us = units(ds);
    const cols = colNames(ds);
    /* bands as rows have no room for a population column */
    const sizes = transposed(ds) ? [] : popSizes(ds);
    const cells = [SIGNATURE, 'v=1', 'kind=' + K.dataKind];
    if (K.dataKind === 'codominant') cells.push('ploidy=' + ds.ploidy, 'cells=' + ds.genoCells, 'coding=' + (ds.coding || K.coding));
    if (K.dataKind === 'sequence') cells.push('coding=nucleotide');
    cells.push('missing=' + (ds.missing ?? ''), 'unit=' + ds.unit, 'sampling=' + ds.sampling, 'orientation=' + (transposed(ds) ? 'rows-are-loci' : 'rows-are-individuals'),
      'loci=' + names.length, 'units=' + us.length, 'pops=' + sizes.length);
    if (sizes.length) {
      cells.push('sizes=' + sizes.map(s => s.n).join('|'));
      /* names let the check pair each declared size with its population even when a
         misspelled name adds a group in the middle of the sheet */
      const pn = sizes.map(s => String(s.name).replace(/\|/g, '/')).join('|');
      if (pn.length <= 4000) cells.push('popnames=' + pn);
    }
    if (!transposed(ds)) ['id', 'pop', 'region', 'lat', 'lon'].forEach(k => { if (cols[k]) cells.push(k + '=' + cols[k]); });
    cells.push('← keep this row: it tells PopGeneticsPro how to read the sheet');
    return cells;
  }

  function nucleotideNumber(a) { return { A: 1, C: 2, G: 3, T: 4, '-': 5 }[String(a).toUpperCase()] || 0; }

  /* the genotype cells of one unit, in column order */
  function dataCells(ds, i, names) {
    const K = KINDS[ds.kind];
    const d = ds.fill;
    const miss = ds.missing ?? '';
    if (!d) {
      if (K.dataKind === 'codominant' && ds.genoCells === 'columns') return new Array(names.length * ds.ploidy).fill('');
      return new Array(names.length).fill('');
    }
    if (K.dataKind === 'morph') return d.traits.values[i].map(v => (v == null ? miss : v));
    if (K.dataKind === 'sequence') {
      const regs = d.meta && d.meta.regions;
      const s = d.seqs.aln[i];
      if (!regs) return [s];
      let at = 0;
      return regs.map(r => { const part = s.slice(at, at + r.length); at += r.length; return part; });
    }
    const out = [];
    d.geno[i].forEach(g => {
      if (K.dataKind === 'codominant') {
        if (ds.genoCells === 'combined') out.push(g ? g.join('/') : miss);
        else for (let p = 0; p < ds.ploidy; p++) out.push(g ? (g[p] ?? miss) : miss);
      } else out.push(g ? g[0] : miss);
    });
    return out;
  }

  /* header + rows of the PopGeneticsPro layout (without the signature row) */
  function grid(ds) {
    const K = KINDS[ds.kind];
    const names = locusNames(ds);
    const us = units(ds);
    const cols = colNames(ds);
    if (transposed(ds)) {
      const header = ['Band'].concat(us.map(u => u.id));
      const rows = names.map((nm, l) => [nm].concat(us.map((u, i) => (ds.fill ? dataCells(ds, i, names)[l] : ''))));
      return { header, rows };
    }
    const header = [cols.id];
    if (cols.pop) header.push(cols.pop);
    if (cols.region) header.push(cols.region);
    if (cols.lat) header.push(cols.lat, cols.lon);
    if (K.dataKind === 'codominant' && ds.genoCells === 'columns') names.forEach(n => { for (let p = 0; p < ds.ploidy; p++) header.push(n); });
    else names.forEach(n => header.push(n));
    const rows = us.map((u, i) => {
      const r = [u.id];
      if (cols.pop) r.push(u.pop ?? '');
      if (cols.region) r.push(u.region ?? '');
      if (cols.lat) r.push(u.lat ?? '', u.lon ?? '');
      return r.concat(dataCells(ds, i, names));
    });
    return { header, rows };
  }

  function csvCell(v) {
    const s = String(v ?? '');
    return /[",\n;\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function toCSV(rows) { return '﻿' + rows.map(r => r.map(csvCell).join(',')).join('\r\n') + '\r\n'; }

  function pgpRows(ds) {
    const g = grid(ds);
    return [signature(ds), g.header].concat(g.rows);
  }
  function csv(ds) { return toCSV(pgpRows(ds)); }

  /* ---------------- parameter-row layout (row 1: counts; row 2: names; row 3: headers) ---------------- */

  function paramLayoutOK(ds) {
    const K = KINDS[ds.kind];
    if (!['codominant', 'dominant', 'haploid'].includes(K.dataKind)) return { ok: false, why: 'the parameter-row layout has no form for ' + K.lociWord + ' of this kind' };
    if (K.dataKind === 'codominant' && ds.ploidy !== 2) return { ok: false, why: 'the parameter-row layout holds diploid codominant data only' };
    if (transposed(ds)) return { ok: false, why: 'the parameter-row layout needs one row per sample' };
    const cols = colNames(ds);
    if (!cols.pop) return { ok: false, why: 'the parameter-row layout needs a population for every sample' };
    return { ok: true };
  }

  function paramLayoutRows(ds) {
    const K = KINDS[ds.kind];
    const names = locusNames(ds);
    let us = units(ds);
    const cols = colNames(ds);
    /* populations must be contiguous blocks, and so must regions */
    const idx = us.map((u, i) => i);
    const firstPop = new Map(), firstReg = new Map();
    us.forEach((u, i) => { if (!firstPop.has(u.pop)) firstPop.set(u.pop, i); if (!firstReg.has(u.region || '')) firstReg.set(u.region || '', i); });
    idx.sort((a, b) => (cols.region ? firstReg.get(us[a].region || '') - firstReg.get(us[b].region || '') : 0) || firstPop.get(us[a].pop) - firstPop.get(us[b].pop) || a - b);
    const order = idx;
    us = order.map(i => us[i]);
    const pops = [];
    us.forEach(u => { const last = pops[pops.length - 1]; if (last && last.name === u.pop) last.n++; else pops.push({ name: u.pop, n: 1, region: u.region }); });
    const r1 = [names.length, us.length, pops.length].concat(pops.map(p => p.n));
    const r2 = [ds.title || 'PopGeneticsPro template', '', ''].concat(pops.map(p => p.name));
    if (cols.region) {
      const regs = [];
      us.forEach(u => { const last = regs[regs.length - 1]; if (last && last.name === u.region) last.n++; else regs.push({ name: u.region, n: 1 }); });
      r1.push(regs.length, ...regs.map(r => r.n));
      r2.push('', ...regs.map(r => r.name));
    }
    const r3 = ['Sample', 'Pop'];
    if (K.dataKind === 'codominant') names.forEach(n => r3.push(n, ''));
    else names.forEach(n => r3.push(n));
    if (cols.lat) r3.push('', 'Lat', 'Long');
    const miss = K.dataKind === 'dominant' ? -1 : 0;
    const body = us.map((u, k) => {
      const i = order[k];
      const r = [u.id, u.pop];
      if (ds.fill) {
        ds.fill.geno[i].forEach(g => {
          if (K.dataKind === 'codominant') {
            if (!g) r.push(miss, miss);
            else g.forEach(a => r.push(ds.kind === 'snp' || !/^\d+$/.test(a) ? (nucleotideNumber(a) || a) : Number(a)));
          } else r.push(g ? (K.dataKind === 'dominant' ? g[0] : (/^\d+$/.test(g[0]) ? Number(g[0]) : g[0])) : miss);
        });
      } else {
        const n = K.dataKind === 'codominant' ? names.length * 2 : names.length;
        for (let j = 0; j < n; j++) r.push('');
      }
      if (cols.lat) r.push('', u.lat ?? '', u.lon ?? '');
      return r;
    });
    return [r1, r2, r3].concat(body);
  }
  function paramLayoutCSV(ds) { return toCSV(paramLayoutRows(ds)); }

  /* ---------------- sequences ---------------- */

  function fasta(ds) {
    const us = units(ds);
    return us.map((u, i) => {
      const head = '>' + (u.id || 'Seq' + (i + 1)) + (u.pop ? ' | ' + u.pop : '') + (u.region ? ' | ' + u.region : '');
      const s = ds.fill && ds.fill.seqs ? ds.fill.seqs.aln[i] : '';
      return head + '\n' + (s ? s.replace(/(.{60})/g, '$1\n').replace(/\n$/, '') : '');
    }).join('\n') + '\n';
  }

  function sampleSheetRows(ds) {
    const us = units(ds);
    const cols = colNames(ds);
    const header = ['ID'];
    if (cols.pop) header.push('Population');
    if (cols.region) header.push('Region');
    if (cols.lat) header.push('Latitude', 'Longitude');
    return [header].concat(us.map(u => {
      const r = [u.id];
      if (cols.pop) r.push(u.pop ?? '');
      if (cols.region) r.push(u.region ?? '');
      if (cols.lat) r.push(u.lat ?? '', u.lon ?? '');
      return r;
    }));
  }

  /* ---------------- instructions ---------------- */

  function instructions(ds) {
    const K = KINDS[ds.kind];
    const names = locusNames(ds);
    const us = units(ds);
    const sizes = popSizes(ds);
    const cols = colNames(ds);
    const L = [];
    L.push('PopGeneticsPro — how to fill in this template');
    L.push('');
    L.push('DESIGN');
    L.push(`  Data: ${K.label} (${K.sub})`);
    L.push(`  ${unitWord(ds, true)}: ${us.length}` + (sizes.length ? ` in ${sizes.length} ${ds.sampling === 'bulk' ? 'groups' : 'populations'}` : ''));
    sizes.slice(0, 60).forEach(s => L.push(`    ${s.name}: ${s.n}`));
    L.push(`  ${K.lociWord.charAt(0).toUpperCase() + K.lociWord.slice(1)}: ${names.length}`);
    L.push('');
    L.push('GENERAL RULES');
    L.push('  1. Do not delete, move or edit row 1. It declares the layout; the app reads the sheet from it without guessing.');
    L.push('  2. Row 2 holds the column names. You may rename loci/traits, but keep one name per column as generated.');
    L.push(`  3. One row per ${unitWord(ds).toLowerCase()}${transposed(ds) ? ' is NOT used here: in this layout each row is a band and each column a sample.' : '.'} Rows of the same population may be in any order.`);
    L.push('  4. Keep every ID unique. Do not merge cells, add colours with meaning, formulas or comment rows.');
    L.push(`  5. Missing data: ${ds.missing === '' || ds.missing == null ? 'leave the cell empty' : 'write ' + ds.missing + ' (or leave the cell empty)'}.`);
    L.push('  6. Save as .xlsx or .csv and drop the file into Block 2 of PopGeneticsPro.');
    L.push('');
    L.push('HOW TO WRITE THE DATA');
    if (K.dataKind === 'codominant' && ds.genoCells === 'columns') {
      L.push(`  Each locus has ${ds.ploidy} columns with the same name: one allele per column.`);
      L.push(ds.kind === 'snp' ? '  Write nucleotides: A, C, G or T. Example for a heterozygote: A | G.' : '  Write alleles as fragment sizes in bp (e.g. 182 | 186) or as repeat numbers. A homozygote repeats the allele: 182 | 182.');
      L.push('  If one allele failed to amplify, leave BOTH cells as missing: half-scored genotypes are discarded.');
    } else if (K.dataKind === 'codominant') {
      L.push(`  One column per locus; write the whole genotype in one cell, alleles separated by a slash.`);
      L.push(ds.kind === 'snp' ? '  Examples: A/G (heterozygote), C/C (homozygote).' : `  Examples: 182/186 (heterozygote), 182/182 (homozygote)${ds.ploidy > 2 ? ', 182/186/190/190 (tetraploid)' : ''}.`);
      L.push(`  Every genotype must have exactly ${ds.ploidy} alleles.`);
    } else if (K.dataKind === 'dominant') {
      L.push('  1 = band present, 0 = band absent. Nothing else (no 2, no +/−, no blanks for absence).');
      L.push('  Score only bands you can read reliably across all gels; a blank means "not scored", not "absent".');
    } else if (K.dataKind === 'haploid') {
      L.push('  One code per locus: a fragment size (e.g. 142) or a haplotype name (e.g. H3).');
    } else if (K.dataKind === 'sequence') {
      if (ds.seqLayout === 'fasta') {
        L.push('  Paste each aligned sequence under its header line in the FASTA file (header: >ID | Population).');
      } else {
        L.push('  One column per gene region: paste the whole ALIGNED sequence of that region in one cell.');
        L.push('  All sequences of a region must have the same length (use - for gaps, ? or N for unread bases).');
        L.push('  Regions are concatenated in column order; an empty cell becomes ???… of the region length.');
      }
    } else if (K.dataKind === 'morph') {
      L.push('  One column per trait; the unit is part of the column name (e.g. PlantHeight_cm).');
      L.push('  Use a dot or a comma as decimal mark, but never thousands separators.');
      ds.traits.forEach(t => L.push(`    ${cleanName(t.name)}${t.unit ? ' (' + cleanName(t.unit) + ')' : ''}: ${t.type}`));
    }
    if (cols.lat) {
      L.push('');
      L.push('  Coordinates: decimal degrees, latitude first. West longitudes and south latitudes are negative (e.g. 19.4326, -99.1332).');
    }
    L.push('');
    L.push('SAMPLING CHECKS FOR THIS DESIGN');
    advice(ds).forEach(a => L.push('  - ' + a.text.replace(/<[^>]+>/g, '')));
    return L.join('\r\n') + '\r\n';
  }

  /* ---------------- .xlsx workbook ---------------- */

  function xlsx(ds) {
    if (typeof XLSX === 'undefined') throw new Error('The spreadsheet library is not loaded.');
    const wb = XLSX.utils.book_new();
    const K = KINDS[ds.kind];
    const main = ds.kind === 'sequence' && ds.seqLayout === 'fasta' ? sampleSheetRows(ds) : pgpRows(ds);
    const ws = XLSX.utils.aoa_to_sheet(main);
    const header = main[ds.kind === 'sequence' && ds.seqLayout === 'fasta' ? 0 : 1];
    ws['!cols'] = header.map((h, j) => ({ wch: j === 0 ? Math.max(14, ...main.slice(2, 60).map(r => String(r[0] ?? '').length + 2)) : K.dataKind === 'sequence' ? 60 : Math.max(8, String(h ?? '').length + 2) }));
    XLSX.utils.book_append_sheet(wb, ws, ds.kind === 'sequence' && ds.seqLayout === 'fasta' ? 'Samples' : 'Data');
    const ins = XLSX.utils.aoa_to_sheet(instructions(ds).split(/\r?\n/).map(l => [l]));
    ins['!cols'] = [{ wch: 120 }];
    XLSX.utils.book_append_sheet(wb, ins, 'Instructions');
    const sizes = popSizes(ds);
    if (sizes.length) {
      const pd = [['Population', 'Planned n'].concat(ds.useRegion ? ['Region'] : [])].concat(sizes.map(s => {
        const p = ds.pops.find(q => cleanName(q.name) === s.name || cleanName(q.group) === s.name) || {};
        return [s.name, s.n].concat(ds.useRegion ? [p.region || ''] : []);
      }));
      const ps = XLSX.utils.aoa_to_sheet(pd);
      ps['!cols'] = [{ wch: 24 }, { wch: 12 }, { wch: 18 }];
      XLSX.utils.book_append_sheet(wb, ps, 'Design');
    }
    const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    return new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }

  /* ---------------- planning: what this design will allow ---------------- */

  /* a skeleton dataset with the planned structure, for Data.capabilities */
  function mock(ds) {
    const K = KINDS[ds.kind];
    const us = units(ds);
    const names = locusNames(ds);
    const ind = us.map(u => ({ id: u.id, pop: u.pop || null, region: u.region || null, lat: ds.coords !== 'none' ? 0 : null, lon: ds.coords !== 'none' ? 0 : null }));
    const kind = K.dataKind;
    const loci = kind === 'morph' ? [] : kind === 'sequence' ? [{ name: 'Haplotype' }] : names.map(n => ({ name: n }));
    const d = window.Data.finish({ kind, ploidy: kind === 'codominant' ? ds.ploidy : 1, ind, loci, geno: ind.map(() => []), traits: kind === 'morph' ? { vars: names.map(n => ({ name: n })), values: [] } : null, meta: {} });
    return d;
  }

  /* number of distinct ways to allocate populations to regions of the same sizes:
     the permutation test of Φ_CT cannot give a P smaller than its inverse */
  function regionArrangements(sizes) {
    const n = sizes.reduce((a, b) => a + b, 0);
    let lf = x => { let s = 0; for (let k = 2; k <= x; k++) s += Math.log(k); return s; };
    let l = lf(n) - sizes.reduce((a, k) => a + lf(k), 0);
    const mult = {};
    sizes.forEach(k => { mult[k] = (mult[k] || 0) + 1; });
    Object.values(mult).forEach(m => { l -= lf(m); });
    return Math.round(Math.exp(l));
  }

  function advice(ds) {
    const K = KINDS[ds.kind];
    const out = [];
    const add = (level, text) => out.push({ level, text });
    const nL = locusNames(ds).length;
    const us = units(ds);
    const sizes = popSizes(ds);
    const bulk = ds.sampling === 'bulk';
    const minN = sizes.length ? Math.min(...sizes.map(s => s.n)) : 0;
    const dk = K.dataKind;

    if (!us.length) add('error', 'The design has no rows yet: add populations and sample sizes.');
    if (!nL && dk !== 'morph') add('error', `No ${K.lociWord} declared yet.`);
    if (dk === 'morph' && !nL) add('error', 'No traits declared yet.');
    const dupNames = ds.pops.map(p => cleanName(p.name)).filter((n, i, a) => n && a.indexOf(n) !== i);
    if (dupNames.length) add('error', `Repeated ${bulk ? 'unit' : 'population'} names: ${[...new Set(dupNames)].join(', ')}. Each must be unique.`);

    if (bulk) {
      add('info', `One bulk sample per ${unitWord(ds).toLowerCase()}: within-unit diversity, Hardy–Weinberg and F<sub>IS</sub> cannot be estimated. Distances, PCoA, trees and clustering of the ${us.length} units can.`);
      if (ds.useGroup && sizes.length >= 2) add('ok', `The Group column lets AMOVA partition variation among ${sizes.length} groups of ${unitWord(ds, true).toLowerCase()}.`);
      if (dk === 'codominant') add('warning', 'A bulk DNA sample of a codominant marker gives allele presence, not a genotype: consider scoring it as dominant (1/0 per allele) instead.');
    } else if (sizes.length) {
      if (sizes.length < 2) add('warning', 'With a single population, differentiation (F<sub>ST</sub>, AMOVA) and population trees cannot be computed.');
      if (dk === 'codominant' || dk === 'haploid') {
        if (minN < 5) add('error', `The smallest population has ${minN} ${unitWord(ds, minN !== 1).toLowerCase()}: at least 5 are needed for any within-population test, and 20–30 to estimate allele frequencies well (Hale et al. 2012).`);
        else if (minN < 20) add('warning', `The smallest population has ${minN} plants. Allele frequencies of microsatellites stabilise at about 25–30 individuals per population (Hale et al. 2012); rare alleles will be missed below that.`);
        else add('ok', `${minN} or more plants per population: enough for allele frequencies, H<sub>e</sub>, F<sub>IS</sub> and HWE tests.`);
      }
      if (dk === 'dominant') {
        if (minN < 10) add('warning', `Dominant markers need larger samples than codominant ones: with n = ${minN}, the Lynch & Milligan (1994) estimator is unstable. Aim for 20 or more plants per population.`);
        else add('ok', `With n = ${minN}, bands with a frequency above ${fmtShort(1 - 3 / minN)} (1 − 3/N) should be excluded before estimating allele frequencies (Lynch & Milligan 1994); the app reports them.`);
      }
      if (dk === 'sequence' && minN < 10) add('warning', `Neutrality tests and N<sub>ST</sub> have little power with ${minN} sequences per population; 10 or more are recommended.`);
      if (dk === 'morph' && minN < 10) add('warning', `P<sub>ST</sub> and trait means per population are imprecise with ${minN} plants; 10 or more per population are recommended.`);
      if (dk === 'codominant' && minN >= 10) add('info', `Contemporary N<sub>e</sub> (linkage disequilibrium) and bottleneck tests will open in Block 9 for populations of ≥ 10 plants; their precision grows markedly with ≥ 30 plants and ≥ 10 polymorphic loci (Cornuet & Luikart 1996; Waples & Do 2010).`);
    }

    if (dk === 'codominant' || dk === 'haploid') {
      if (nL && nL < 5) add('warning', `${nL} loci: multilocus analyses (Bayesian clustering, assignment, r̄<sub>d</sub>) need at least 5 polymorphic loci, and Bayesian admixture clustering is usually run with 10 or more.`);
      else if (nL >= 10 && ds.kind !== 'snp') add('ok', `${nL} loci are enough for Bayesian clustering and assignment tests.`);
      if (ds.kind === 'snp' && nL < 50) add('info', `SNPs carry less information each than microsatellites: several dozen to hundreds are usually needed to match 10–15 SSR loci.`);
    }
    if (dk === 'dominant' && nL && nL < 50) add('warning', `${nL} bands: dominant data carry little information per band; 50 or more polymorphic bands are advisable for distances and clustering.`);
    if (dk === 'sequence' && ds.seqLayout === 'sheet') add('info', 'Spreadsheet cells hold up to 32 767 characters, far more than a typical chloroplast region; for whole plastomes use the FASTA layout.');

    if (ds.useRegion && !bulk) {
      const regMap = new Map();
      ds.pops.forEach(p => { const r = cleanName(p.region); if (!r) return; regMap.set(r, (regMap.get(r) || 0) + 1); });
      const regSizes = [...regMap.values()];
      const unassigned = ds.pops.filter(p => !cleanName(p.region)).length;
      if (unassigned) add('warning', `${unassigned} population(s) have no region yet.`);
      if (regSizes.length < 2) add('warning', 'A regional AMOVA needs at least two regions.');
      else {
        const arr = regionArrangements(regSizes);
        if (arr < 20) add('warning', `With ${regSizes.join(' + ')} populations per region there ${arr === 1 ? 'is only one way' : `are only ${arr} distinct ways`} to allocate populations to regions, so the smallest attainable P for Φ<sub>CT</sub> is ${fmtShort(1 / arr)}${arr === 1 ? ' and the test cannot be run' : ''} (Fitzpatrick 2009). Add populations per region if Φ<sub>CT</sub> matters.`);
        else add('ok', `${regSizes.length} regions: Φ<sub>CT</sub> can be tested (${arr} distinct allocations of populations to regions).`);
      }
    }
    if (ds.coords === 'ind' && us.length < 30) add('info', 'Fine-scale spatial structure (kinship correlogram, S<sub>p</sub>) needs many mapped plants; about 100 or more are usually recommended (Vekemans & Hardy 2004).');
    if (ds.coords === 'pop' && !bulk) add('info', 'Population coordinates give isolation by distance among populations (Mantel test). Individual coordinates would add fine-scale spatial autocorrelation.');
    if (ds.coords !== 'none' && bulk) add('info', `Coordinates of each ${unitWord(ds).toLowerCase()} allow a Mantel test of isolation by distance among ${unitWord(ds, true).toLowerCase()}.`);
    if (ds.kind === 'snp' && paramLayoutOK(ds).ok) add('info', 'The parameter-row layout holds numbers only: nucleotides are written as A = 1, C = 2, G = 3, T = 4.');
    if (transposed(ds)) {
      const lost = ds.fill ? [ds.fill.declaredPops && !ds.fill.singletons ? 'populations' : null, ds.fill.ind.some(v => v.region) ? 'regions' : null, ds.fill.ind.some(v => v.lat != null && isFinite(v.lat)) ? 'coordinates' : null].filter(Boolean) : [];
      if (lost.length) add('warning', `Bands as rows cannot hold ${lost.join(', ')}: they would be lost in this file. Choose one row per sample to keep them.`);
      else add('info', 'Bands as rows is the layout of a gel reading sheet. It has no room for population, region or coordinate columns, so every column is treated as its own unit.');
    }
    return out;
  }
  function fmtShort(x) { return (Math.round(x * 1000) / 1000).toString(); }

  /* ---------------- design from a loaded dataset (conversion) ---------------- */

  function fromData(d, unitKey) {
    const ds = defaults();
    ds.fill = d;
    ds.unit = unitKey || 'individuals';
    ds.kind = d.kind === 'codominant' ? (d.loci.every(l => l.alleles.every(a => /^[ACGT]$/i.test(a))) ? 'snp' : 'codominant') : d.kind;
    ds.ploidy = d.kind === 'codominant' ? (d.ploidy || 2) : 2;
    ds.genoCells = 'columns';
    /* fragment sizes only if every allele is a number; otherwise plain codes */
    if (d.kind === 'codominant' && ds.kind === 'codominant') ds.coding = d.loci.every(l => l.alleles.every(a => /^-?[0-9]+([.][0-9]+)?$/.test(a))) ? 'size' : 'code';
    ds.missing = d.kind === 'codominant' ? '0' : '';
    ds.sampling = d.declaredPops && !d.singletons ? 'pops' : 'bulk';
    ds.useRegion = d.ind.some(v => v.region);
    ds.coords = d.ind.some(v => v.lat != null && isFinite(v.lat)) ? 'ind' : 'none';
    ds.seqLayout = 'sheet';
    return ds;
  }

  /* ---------------- checking a filled template ---------------- */

  /* spec: from Data.readTemplateHeader or the parameter rows; d: the dataset built */
  function check(spec, d, source) {
    const rows = [];
    const add = (item, declared, found, status, note) => rows.push({ item, declared, found, status, note: note || '' });
    const kindName = { codominant: 'codominant', dominant: 'dominant', haploid: 'haploid', sequence: 'sequences', morph: 'traits' };
    if (spec.kind) add('Data type', kindName[spec.kind] || spec.kind, kindName[d.kind] || d.kind, spec.kind === d.kind ? 'ok' : 'error', spec.kind === d.kind ? '' : 'the marker type was changed after loading');
    if (spec.ploidy && d.kind === 'codominant') add('Ploidy', spec.ploidy, d.ploidy, spec.ploidy === d.ploidy ? 'ok' : 'error');
    if (spec.columnsPerLocus != null) add('Columns per locus', d.kind === 'codominant' ? 2 : 1, spec.columnsPerLocus, (d.kind === 'codominant' ? 2 : 1) === spec.columnsPerLocus ? 'ok' : 'error', 'genetic columns ÷ No. of loci in cell A1');

    const nL = d.kind === 'morph' ? (d.traits ? d.traits.vars.length : 0) : d.kind === 'sequence' ? ((d.meta && d.meta.regions) ? d.meta.regions.length : 1) : d.nLoci;
    const word = d.kind === 'morph' ? 'Traits' : d.kind === 'sequence' ? 'Gene regions' : d.kind === 'dominant' ? 'Bands' : 'Loci';
    if (spec.loci != null) add(word, spec.loci, nL, spec.loci === nL ? 'ok' : 'error', spec.loci === nL ? '' : (nL > spec.loci ? 'extra columns were read as data — check for notes or empty columns at the right' : 'some data columns are missing or were given another role'));
    if (d.kind === 'sequence' && d.seqs) add('Alignment length', '—', d.seqs.length + ' bp', d.seqs.ragged ? 'warning' : 'ok', d.seqs.ragged ? 'sequences differ in length' : 'all sequences the same length');

    const issues = d.issues || [];
    const count = t => { const it = issues.find(x => x.type === t); return it ? it.count : 0; };
    const emptyRows = count('emptyRow');
    if (spec.units != null) add(UNITcap(true), spec.units, d.nInd, spec.units === d.nInd ? (emptyRows ? 'warning' : 'ok') : 'error',
      spec.units === d.nInd ? (emptyRows ? `${emptyRows} row(s) still have no data` : '') : (d.nInd > spec.units ? 'rows were added' : 'rows were deleted'));
    if (spec.pops != null && spec.pops > 0) add(spec.sampling === 'bulk' ? 'Groups' : 'Populations', spec.pops, d.declaredPops ? d.nPops : 0, (d.declaredPops ? d.nPops : 0) === spec.pops ? 'ok' : 'error',
      (d.declaredPops ? d.nPops : 0) === spec.pops ? '' : 'a population name was misspelled, added or removed');

    /* population sizes, in order of appearance */
    const popRows = [];
    const filledIn = p => p.idx.filter(i => d.kind === 'morph' ? d.traits.values[i].some(v => v != null) : d.kind === 'sequence' ? true : d.geno[i].some(g => g != null)).length;
    if (spec.sizes && spec.sizes.length && d.declaredPops) {
      const names = spec.popNames && spec.popNames.length === spec.sizes.length && spec.popNames.every(Boolean) ? spec.popNames : null;
      if (names) {
        /* pair by name; anything left over was not declared */
        const used = new Set();
        names.forEach((nm, k) => {
          const pi = d.pops.findIndex(q => q.name === nm);
          const p = pi >= 0 ? d.pops[pi] : null;
          if (pi >= 0) used.add(pi);
          const found = p ? p.idx.length : 0, filled = p ? filledIn(p) : 0;
          const declared = spec.sizes[k];
          const status = !p ? 'error' : found !== declared ? (source === 'paramHdr' ? 'error' : 'warning') : filled < found ? 'warning' : 'ok';
          popRows.push({ name: nm, declared, found, filled, status,
            note: !p ? 'not found in the sheet' : found < declared ? `${declared - found} row(s) missing` : found > declared ? `${found - declared} row(s) more than planned` : filled < found ? `${found - filled} row(s) still empty` : '' });
        });
        d.pops.forEach((p, pi) => {
          if (used.has(pi)) return;
          const like = names.map(nm => [nm, similar(nm, p.name)]).filter(x => x[1] >= 0).sort((a, b) => a[1] - b[1]).map(x => x[0])[0];
          popRows.push({ name: p.name, declared: '—', found: p.idx.length, filled: filledIn(p), status: 'error',
            note: like ? `not in the design — a misspelling of “${like}”?` : 'not in the design' });
        });
      } else {
        const n = Math.max(spec.sizes.length, d.pops.length);
        for (let k = 0; k < n; k++) {
          const p = d.pops[k];
          const declared = spec.sizes[k];
          const found = p ? p.idx.length : 0, filled = p ? filledIn(p) : 0;
          const status = declared == null || !p ? 'error' : found !== declared ? (source === 'paramHdr' ? 'error' : 'warning') : filled < found ? 'warning' : 'ok';
          popRows.push({ name: p ? p.name : '(missing)', declared: declared ?? '—', found, filled, status,
            note: source === 'paramHdr' && p && found !== declared ? 'the parameter rows define populations by these counts: fix row 1 or the rows' : '' });
        }
      }
    }
    if (spec.pops != null && popRows.some(r => /misspelling/.test(r.note))) {
      const it = rows.find(r => r.item === 'Populations' || r.item === 'Groups');
      if (it) it.note = 'see the table below: ' + popRows.filter(r => /misspelling/.test(r.note)).map(r => `“${r.name}”`).join(', ') + ' looks misspelled';
    }
    const scored = d.kind === 'morph'
      ? d.traits.values.reduce((a, r) => a + r.filter(v => v != null).length, 0) / Math.max(1, d.nInd * nL)
      : d.geno.reduce((a, r) => a + r.filter(g => g != null).length, 0) / Math.max(1, d.nInd * Math.max(1, d.nLoci));
    add('Cells filled in', '100%', Math.round(scored * 1000) / 10 + '%', scored > 0.9 ? 'ok' : scored > 0 ? 'warning' : 'error', scored === 0 ? 'the sheet is still empty' : '');
    const errs = issues.filter(x => x.level === 'error').reduce((a, x) => a + x.count, 0);
    add('Invalid values', 0, errs, errs ? 'error' : 'ok', errs ? 'listed under quality control below' : '');
    return { rows, popRows, ok: rows.every(r => r.status === 'ok') && popRows.every(r => r.status === 'ok') };
  }
  /* distance between two names after ignoring case, spaces and accents: 0 = the same
     name, 1–2 = typing slips, −1 = unrelated */
  function similar(a, b) {
    const n = s => String(s).toLowerCase().normalize('NFD').replace(new RegExp('[\\u0300-\\u036f]', 'g'), '').replace(/[^a-z0-9]/g, '');
    const x = n(a), y = n(b);
    if (x === y) return 0;
    if (Math.abs(x.length - y.length) > 2 || Math.min(x.length, y.length) < 4) return -1;
    const dp = Array.from({ length: x.length + 1 }, (_, i) => [i].concat(new Array(y.length).fill(0)));
    for (let j = 1; j <= y.length; j++) dp[0][j] = j;
    for (let i = 1; i <= x.length; i++) for (let j = 1; j <= y.length; j++)
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1));
    const dist = dp[x.length][y.length];
    return dist <= 2 ? dist : -1;
  }
  function UNITcap(pl) { return typeof UNIT === 'function' ? UNIT(pl, true) : 'Individuals'; }

  window.Tpl = {
    KINDS, SIGNATURE, defaults, expandNames, locusNames, units, popSizes, colNames, signature, grid,
    pgpRows, csv, paramLayoutOK, paramLayoutRows, paramLayoutCSV, fasta, sampleSheetRows, instructions, xlsx,
    mock, advice, regionArrangements, fromData, check, toCSV, unitWord,
  };
})();
