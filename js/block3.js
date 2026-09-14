/* PopGeneticsPro — Block 3: allele frequencies and genetic diversity.
   Reads state.data, computes with Div, and explains what the numbers mean. */

(function () {

  let R = null;          // the diversity result currently on screen

  /* typical ranges reported in the plant literature, used only to put a number
     in context — never to judge a dataset */
  const TYPICAL = {
    codominant: { lo: 0.45, hi: 0.85, what: 'microsatellites in outcrossing plants usually give He between 0.45 and 0.85; selfing species run lower' },
    dominant: { lo: 0.15, hi: 0.40, what: 'AFLP, ISSR and RAPD markers usually give He between 0.15 and 0.40, because each band has only two states' },
    haploid: { lo: 0.20, hi: 0.80, what: 'haplotype diversity varies widely with the marker and the history of the species' },
    sequence: { lo: 0.20, hi: 0.90, what: 'haplotype diversity varies widely with the marker and the history of the species' },
  };

  function init() {
    if (!el('btnRunDiversity')) return;
    el('btnRunDiversity').addEventListener('click', run);
    el('divLocusIndex').addEventListener('change', renderLocusTable);
    el('btnFreqCSV').addEventListener('click', downloadFreqs);
    el('btnDivCSV').addEventListener('click', downloadSummary);
    el('divDomMethod').addEventListener('change', () => {
      el('divDomFRow').style.display = el('divDomMethod').value === 'bayes' ? '' : 'none';
    });
    el('btnContinue3').addEventListener('click', () => continueAfter(3, 'divMessages'));
    document.addEventListener('stepchange', e => {
      if (String(e.detail.step) === '3') onEnter();
    });
  }

  /* entering the block: adapt the controls to the data and run once */
  function onEnter() {
    const d = state.data;
    if (!d) { showMessage('divMessages', 'error', 'Load your data in Block 2 first.'); return; }
    el('divDomRow').style.display = d.kind === 'dominant' ? '' : 'none';
    el('divDomFRow').style.display = (d.kind === 'dominant' && el('divDomMethod').value === 'bayes') ? '' : 'none';
    el('divMorphRow').style.display = d.kind === 'morph' ? '' : 'none';
    el('divRarefyRow').style.display = d.kind === 'dominant' || d.kind === 'morph' ? 'none' : '';
    /* Block 2 clears state.freq whenever a new dataset is built, so a stale
       result from a previous file is never shown for the current one */
    if (!state.freq) run();
  }

  /* ================================================================
     run
     ================================================================ */
  function run() {
    const d = state.data;
    if (!d) return;
    clearMessages('divMessages');
    const t0 = performance.now();

    if (d.kind === 'morph') {
      R = Div.computeMorph(d, { classes: Number(el('divClasses').value) || 10 });
      state.freq = R;
      renderMorph(d, R);
      el('divResults').style.display = '';
      el('divTiming').textContent = `computed in ${Math.round(performance.now() - t0)} ms`;
      return;
    }

    R = Div.compute(d, {
      domMethod: el('divDomMethod').value,
      domF: Number(el('divDomF').value) || 0,
      polyCriterion: el('divPoly').value,
      rarefyTo: Number(el('divRarefy').value) || null,
      boot: Number(el('divBoot').value) || 0,
      seed: Number(el('divSeed').value) || 1,
    });
    state.freq = R;

    renderTiles(d, R);
    renderInterpretation(d, R);
    renderPopTable(d, R);
    renderLocusTable();
    renderFreqTable(d, R);
    renderPrivate(d, R);
    drawFigures(d, R);
    el('divResults').style.display = '';
    el('divTiming').textContent = `computed in ${Math.round(performance.now() - t0)} ms` +
      (R.opts.boot ? ` · ${R.opts.boot} bootstrap replicates over loci, seed ${R.opts.seed}` : '');
  }

  /* ================================================================
     summary
     ================================================================ */
  function renderTiles(d, R) {
    const o = R.overall;
    const codom = d.kind === 'codominant';
    const tiles = [
      [d.singletons ? UNIT(true, true) : 'Populations', R.nPops, d.singletons ? 'one sample each' : 'compared below'],
      [d.kind === 'dominant' ? 'Bands' : 'Loci', R.nLoci, `${o.nPoly} polymorphic (${fmtPct(o.P)})`],
      ['Alleles found', o.totalAlleles, `${fmtFixed(o.Na, 2)} per locus on average`],
      (d.kind === 'haploid' || d.kind === 'sequence')
        ? ['Haplotype diversity', fmtFixed(o.uHe, 3), "pooled h, Nei's unbiased estimator"]
        : ['He (pooled)', fmtFixed(o.He, 3), 'expected heterozygosity'],
    ];
    if (codom) tiles.push(['Ho (pooled)', fmtFixed(o.Ho, 3), 'observed heterozygosity']);
    if (codom) tiles.push(['F (pooled)', fmtFixed(o.F, 3), o.F > 0.1 ? 'heterozygote deficit' : o.F < -0.1 ? 'heterozygote excess' : 'close to equilibrium',
      o.F > 0.1 ? 'warn' : 'ok']);
    tiles.push(['Private alleles', R.privateAlleles.length, R.privateAlleles.length ? 'see the table below' : 'none']);
    if (d.kind !== 'dominant' && R.g) tiles.push(['<span class="nc">A<sub>r</sub></span> at <span class="nc">g</span> = ' + R.g, fmtFixed(o.Ar, 2), 'rarefied allelic richness']);
    statTiles('divTiles', tiles);
  }

  /* the paragraph a reader of the paper would want */
  function renderInterpretation(d, R) {
    const rows = R.popSummary.filter(r => r.He != null && isFinite(r.He));
    const host = el('divInterpret');
    if (!rows.length) { host.innerHTML = ''; return; }
    const parts = [];
    const codom = d.kind === 'codominant';
    const typ = TYPICAL[d.kind] || TYPICAL.codominant;

    if (d.singletons) {
      parts.push(`<p>Each ${UNIT(false)} holds a single sample, so the columns below describe <b>profiles, not populations</b>: ` +
        `He, Ne and I cannot be estimated within a ${UNIT(false)}. What is meaningful here is the <b>pooled</b> row — the diversity of the ` +
        `whole collection — and the frequency tables, which show what each ${UNIT(false)} carries.</p>`);
      const o = R.overall;
      parts.push(`<p>Across all ${d.nInd} samples, ${o.nPoly} of ${R.nLoci} ${d.kind === 'dominant' ? 'bands are' : 'loci are'} polymorphic ` +
        `(${fmtPct(o.P)}), with a pooled gene diversity of <b>He = ${fmtFixed(o.He, 3)}</b> and ${o.totalAlleles} alleles in total. ${typ.what}.</p>`);
    } else {
      /* haplotype data report Nei's unbiased h; genotypes report He */
      const hap = d.kind === 'haploid' || d.kind === 'sequence';
      const key = hap ? 'uHe' : 'He', sym = hap ? 'h' : 'He';
      const best = rows.slice().sort((a, b) => b[key] - a[key])[0];
      const worst = rows.slice().sort((a, b) => a[key] - b[key])[0];
      const hasCI = !hap && best.ci && worst.ci && best.ci.He && worst.ci.He;
      const overlap = hasCI && worst.ci.He[1] >= best.ci.He[0];
      parts.push(`<p>${hap ? 'Haplotype' : 'Gene'} diversity is highest in <b>${esc(best.pop)}</b> (${sym} = ${fmtFixed(best[key], 3)}` +
        (hasCI ? `, 95% CI ${fmtFixed(best.ci.He[0], 3)}–${fmtFixed(best.ci.He[1], 3)}` : '') +
        `) and lowest in <b>${esc(worst.pop)}</b> (${sym} = ${fmtFixed(worst[key], 3)}` +
        (hasCI ? `, ${fmtFixed(worst.ci.He[0], 3)}–${fmtFixed(worst.ci.He[1], 3)}` : '') + `). ` +
        (!hasCI
          ? (R.nLoci < 3
            ? `With ${R.nLoci === 1 ? 'a single locus' : 'two loci'} there is nothing to resample, so no interval is given and the difference is <b>not tested</b> here.`
            : `No bootstrap interval was computed, so the difference is <b>not tested</b> here.`)
          : overlap
            ? `Their bootstrap intervals overlap, so the difference is <b>not resolved</b> by these loci: treat the populations as comparably diverse.`
            : `Their intervals do not overlap, so the difference is supported by the loci sampled.`) +
        ` For reference, ${typ.what}.</p>`);

      /* unequal sampling */
      const ns = rows.map(r => r.n);
      if (Math.max(...ns) > 2 * Math.min(...ns))
        parts.push(`<p class="callout warn"><b>Sample sizes are uneven</b> (${Math.min(...ns)} to ${Math.max(...ns)} individuals). ` +
          `Na and the number of private alleles rise with sample size, so compare populations with <b>uHe</b> and with ` +
          `<b>Ar</b>, the allelic richness rarefied to ${R.g} gene copies, which are the columns designed for this.</p>`);
    }

    if (codom) {
      const meanF = Div.mean(rows.map(r => r.F).filter(v => v != null && isFinite(v)));
      const nPos = rows.filter(r => r.F > 0.05).length;
      if (meanF > 0.1)
        parts.push(`<p>The mean fixation index is <b>F = ${fmtFixed(meanF, 3)}</b>, a clear heterozygote deficit in ${nPos} of ${rows.length} populations. ` +
          `In plants the usual explanations are selfing or biparental inbreeding, a Wahlund effect from pooling distinct groups, or null alleles at particular loci. ` +
          `Block 4 separates them: inbreeding raises F at every locus by a similar amount, a null allele raises it at one.</p>`);
      else if (meanF < -0.05)
        parts.push(`<p>The mean fixation index is <b>F = ${fmtFixed(meanF, 3)}</b>: slightly more heterozygotes than Hardy–Weinberg predicts. ` +
          `This is what small samples, recent admixture between differentiated sources, or selection favouring heterozygotes look like.</p>`);
      else
        parts.push(`<p>The mean fixation index is <b>F = ${fmtFixed(meanF, 3)}</b>, close to zero: genotype frequencies are near those expected under random mating.</p>`);
    } else if (d.kind === 'dominant') {
      const m = { sqrt: 'the square-root estimator, which assumes Hardy–Weinberg equilibrium', lynch: 'Lynch & Milligan’s (1994) small-sample correction', bayes: `a Bayesian posterior with a uniform prior and F = ${R.opts.domF}` }[R.opts.domMethod];
      parts.push(`<p>Because bands are dominant, heterozygotes are invisible: allele frequencies were recovered with <b>${m}</b>, ` +
        `and He therefore rests on that assumption rather than on counted genotypes. Ho, F<sub>IS</sub> and HWE tests are not defined for these data.</p>`);
    }

    if (R.privateAlleles.length && !d.singletons) {
      const byPop = {};
      R.privateAlleles.forEach(a => { byPop[a.pop] = (byPop[a.pop] || 0) + 1; });
      const top = Object.entries(byPop).sort((a, b) => b[1] - a[1])[0];
      const frequent = R.privateAlleles.filter(a => a.freq >= 0.05).length;
      const nP = R.privateAlleles.length;
      parts.push(`<p><b>${nP} private allele${nP > 1 ? 's' : ''}</b> ${nP > 1 ? 'were' : 'was'} found, most of them in <b>${esc(top[0])}</b> (${top[1]}). ` +
        (frequent === nP
          ? `${nP > 1 ? 'All of them reach' : 'It reaches'} 5% or more within ${nP > 1 ? 'their' : 'its'} population, which is the kind that marks a genuinely distinct gene pool.`
          : frequent === 0
            ? `None reaches 5% within its population: they are rare and may simply reflect sampling.`
            : `${frequent} of them reach 5% or more within their population, which is the kind that marks a genuinely distinct gene pool; the other ${nP - frequent} are rare and may simply reflect sampling.`) +
        `</p>`);
    }
    host.innerHTML = parts.join('');
  }

  /* ================================================================
     tables
     ================================================================ */
  /* the legend above the table follows what the table shows */
  const POP_HINT = el('divPopHint') ? el('divPopHint').innerHTML : '';
  function setPopHint(html, showSe) {
    if (el('divPopHint')) el('divPopHint').innerHTML = html;
    if (el('divSeTitle')) el('divSeTitle').style.display = showSe ? '' : 'none';
  }

  function renderPopTable(d, R) {
    const codom = d.kind === 'codominant';
    const seq = d.kind === 'haploid' || d.kind === 'sequence';
    const dominant = d.kind === 'dominant';
    setPopHint(d.singletons
      ? `One row per ${UNIT(false)}. <b>Bands present</b> in each sample, their share of all bands, and <b>exclusive bands</b> found in that ${UNIT(false)} only.`
      : (POP_HINT || el('divPopHint').innerHTML), !d.singletons);

    /* One sample per unit: the diversity columns are all zero by construction,
       so show what is actually informative — which bands each unit carries. */
    if (d.singletons && dominant) {
      const rows = R.popSummary.concat([Object.assign({}, R.overall, { pop: 'Whole collection', _class: 'total', private: R.privateAlleles.length })]);
      buildTable('divPopTable', [
        { key: 'pop', label: UNIT(false, true) },
        { key: 'n', label: 'Samples', num: true },
        { key: 'bandsPresent', label: 'Bands present', num: true },
        { key: 'pBandsPresent', label: '% of bands', num: true, fmt: v => fmtPct(v, 1) },
        { key: 'private', label: 'Exclusive bands', num: true },
      ], rows);
      el('divSeTable').innerHTML = `<p class="hint" style="margin:0">Standard errors over loci are not meaningful with a single sample per ${UNIT(false)}.</p>`;
      return;
    }

    const cols = [
      { key: 'pop', label: 'Population' },
      { key: 'n', label: 'N', num: true },
      { key: 'Na', label: 'Na', num: true, fmt: v => fmtFixed(v, 2) },
      { key: 'NaF5', label: 'Na<sub>≥5%</sub>', num: true, fmt: v => fmtFixed(v, 2) },
      { key: 'Ne', label: 'Ne', num: true, fmt: v => fmtFixed(v, 2) },
      { key: 'I', label: 'I', num: true, fmt: v => fmtFixed(v, 3) },
    ];
    if (codom) cols.push({ key: 'Ho', label: 'Ho', num: true, fmt: v => fmtFixed(v, 3) });
    cols.push({ key: 'He', label: seq ? 'h' : 'He', num: true, fmt: v => fmtFixed(v, 3) });
    cols.push({ key: 'uHe', label: seq ? 'unbiased h' : 'uHe', num: true, fmt: v => fmtFixed(v, 3) });
    if (codom) cols.push({ key: 'F', label: 'F', num: true, fmt: v => fmtFixed(v, 3) });
    if (codom) cols.push({ key: 'PIC', label: 'PIC', num: true, fmt: v => fmtFixed(v, 3) });
    if (!dominant) cols.push({ key: 'Ar', label: `Ar<sub>(g=${R.g})</sub>`, num: true, fmt: v => fmtFixed(v, 2) });
    if (dominant) cols.push({ key: 'bandsPresent', label: 'Bands present', num: true });
    cols.push({ key: 'P', label: '%P', num: true, fmt: v => fmtPct(v, 1) });
    cols.push({ key: 'private', label: 'Private', num: true });

    const rows = R.popSummary.slice();
    const pooled = Object.assign({}, R.overall, { pop: 'Pooled', _class: 'total', private: R.privateAlleles.length });
    rows.push(pooled);
    buildTable('divPopTable', cols, rows);

    /* a second, smaller table with the standard errors over loci */
    const seCols = [{ key: 'pop', label: 'Population' }];
    ['Na', 'Ne', 'I', 'He', 'uHe'].concat(codom ? ['Ho', 'F'] : []).forEach(k =>
      seCols.push({ key: 'se' + k, label: 'SE ' + k, num: true, fmt: v => fmtFixed(v, 3) }));
    buildTable('divSeTable', seCols, R.popSummary);
  }

  function renderLocusTable() {
    if (!R || R.kind === 'morph') return;
    const key = el('divLocusIndex').value;
    const cols = [{ key: 'locus', label: R.kind === 'dominant' ? 'Band' : 'Locus' }];
    R.popNames.forEach((p, i) => cols.push({ key: 'p' + i, label: esc(p), num: true, fmt: v => fmtFixed(v, key === 'Na' || key === 'NaF5' ? 0 : 3) }));
    cols.push({ key: 'mean', label: 'Mean', num: true, fmt: v => fmtFixed(v, key === 'Na' || key === 'NaF5' ? 2 : 3) });
    const rows = R.locusNames.map((name, l) => {
      const row = { locus: name };
      const vals = [];
      R.popNames.forEach((_, p) => {
        const v = R.cells[p][l][key];
        row['p' + p] = v;
        if (v != null && isFinite(v)) vals.push(v);
      });
      row.mean = vals.length ? Div.mean(vals) : null;
      return row;
    });
    buildTable('divLocusTable', cols, rows, { limit: 250 });
    el('divLocusNote').innerHTML = `<b>${IDX_LABEL[key] || key}</b> for every ${R.kind === 'dominant' ? 'band' : 'locus'} in every population.`;
  }

  function renderFreqTable(d, R) {
    const cols = [
      { key: 'locus', label: d.kind === 'dominant' ? 'Band' : 'Locus' },
      { key: 'allele', label: 'Allele', html: true, get: r => esc(String(r.allele)) + (r.privateTo ? ' <span class="pill domin">private</span>' : '') },
    ];
    R.popNames.forEach((p, i) => cols.push({ key: 'p' + i, label: esc(p), num: true, fmt: v => (v ? fmtFixed(v, 3) : '·') }));
    cols.push({ key: 'overall', label: 'Pooled', num: true, fmt: v => fmtFixed(v, 3) });
    buildTable('divFreqTable', cols, R.freqRows, { limit: 300 });
    el('divFreqNote').textContent =
      `${R.freqRows.length} allele${R.freqRows.length === 1 ? '' : 's'} across ${R.nLoci} ${d.kind === 'dominant' ? 'bands' : 'loci'}` +
      (d.kind === 'dominant' ? ' — for dominant markers the frequency shown is that of the dominant (band-present) allele and its recessive counterpart.' : '.');
  }

  function renderPrivate(d, R) {
    /* the card also carries the locally common alleles, which can exist without any private one */
    if (!R.privateAlleles.length && !R.localCommon.length) {
      el('divPrivateWrap').style.display = 'none';
      el('divPrivateTable').innerHTML = '';
      el('divLocalTable').innerHTML = '';
      return;
    }
    el('divPrivateWrap').style.display = '';
    if (!R.privateAlleles.length) el('divPrivateTable').innerHTML = '<p class="hint" style="padding:6px 12px;margin:0">No allele is confined to a single population.</p>';
    else buildTable('divPrivateTable', [
      { key: 'locus', label: 'Locus' },
      { key: 'allele', label: 'Allele' },
      { key: 'pop', label: 'Only in' },
      { key: 'n', label: 'Copies', num: true },
      { key: 'freq', label: 'Frequency there', num: true, fmt: v => fmtFixed(v, 3) },
      {
        key: 'note', label: '', html: true,
        get: r => r.freq >= 0.05 ? '<span class="pill codom">frequent</span>' : '<span class="pill">rare</span>',
      },
    ], R.privateAlleles.slice().sort((a, b) => b.freq - a.freq), { limit: 120 });

    if (R.localCommon.length) {
      buildTable('divLocalTable', [
        { key: 'locus', label: 'Locus' }, { key: 'allele', label: 'Allele' },
        { key: 'nPops', label: 'Populations', num: true },
        { key: 'threshold', label: 'Confined to', html: true, get: r => `<span class="pill ${r.threshold === '≤ 25%' ? 'domin' : ''}">${r.threshold}</span>` },
        { key: 'pops', label: 'Which ones', get: r => r.pops.join(', ') },
      ], R.localCommon.slice().sort((a, b) => a.nPops - b.nPops), { limit: 80 });
      el('divLocalWrap').style.display = '';
    } else { el('divLocalWrap').style.display = 'none'; el('divLocalTable').innerHTML = ''; }
  }

  /* ================================================================
     figures
     ================================================================ */
  function drawFigures(d, R) {
    const pal = { key: 'palette', label: 'Palette', type: 'select', options: Object.entries(Fig.paletteNames), shared: true };
    const cmapCtl = { key: 'cmap', label: 'Colour map', type: 'select', options: Object.entries(Fig.colormapNames) };
    const mount = (id, spec) => {
      const host = el(id);
      if (!host) return;
      try { Fig.mount(id, spec); }
      catch (e) { console.error(id, e); host.innerHTML = `<div class="msg msg-error">Figure could not be drawn: ${esc(e.message)}</div>`; }
    };
    const codom = d.kind === 'codominant';
    const indexOptions = Object.keys(IDX_LABEL)
      .filter(k => (codom || !['Ho', 'F', 'PIC'].includes(k)) && (d.kind !== 'dominant' || k !== 'Ar'))
      .map(k => [k, IDX_LABEL[k]]);

    /* 1. diversity per population */
    const worthComparing = !d.singletons && R.nPops > 1;
    el('fig3Div').style.display = worthComparing ? '' : 'none';
    if (worthComparing) mount('fig3Div', {
      title: 'Diversity of every population', fileName: 'diversity_by_population', width: 840, height: 500,
      defaults: {
        palette: 'cluster', index: 'He', errors: R.opts.boot ? 'ci' : 'se', values: true,
        sort: 'file', oneColour: false, colourByRegion: false, overallLine: true,
        title: 'Genetic diversity by population',
      },
      controls: [
        { key: 'title', label: 'Title', type: 'text' },
        { key: 'index', label: 'Index', type: 'select', options: indexOptions },
        { key: 'errors', label: 'Error bars', type: 'select', options: [['ci', '95% bootstrap interval'], ['se', 'standard error over loci'], ['none', 'none']] },
        { key: 'sort', label: 'Order', type: 'select', options: [['file', 'as in the file'], ['value', 'by value']] },
        { key: 'oneColour', label: 'A single colour', type: 'checkbox' },
        { key: 'colourByRegion', label: 'Colour by region', type: 'checkbox' },
        { key: 'overallLine', label: 'Show the pooled value', type: 'checkbox' },
        { key: 'values', label: 'Show values', type: 'checkbox' },
        pal,
      ],
      render: cfg => P3.diversityBars(cfg, R),
    });

    /* 2. allele frequencies, one locus at a time */
    mount('fig3Freq', {
      title: 'Allele frequencies, locus by locus', fileName: 'allele_frequencies', width: 860, height: 520,
      defaults: { palette: 'cluster', locus: 0, showPooled: true, values: true, title: `Allele frequencies · ${R.locusNames[0]}` },
      controls: [
        { key: 'title', label: 'Title', type: 'text' },
        { key: 'locus', label: 'Locus', type: 'select', options: R.locusNames.map((n, i) => [String(i), n]) },
        { key: 'showPooled', label: 'Add the pooled column', type: 'checkbox' },
        { key: 'values', label: 'Show values', type: 'checkbox' },
        pal,
      ],
      render: cfg => P3.alleleFreq(cfg, R),
    });

    /* 3. heat map of every allele */
    mount('fig3Heat', {
      title: 'Every allele in every population', fileName: 'allele_frequency_heatmap', width: 820, height: 620,
      defaults: { palette: 'cluster', cmap: 'viridis', maxRows: 60, rowH: 13, values: false, onlyLocus: 'all', minFreq: 0, title: 'Allele frequencies' },
      controls: [
        { key: 'title', label: 'Title', type: 'text' },
        { key: 'onlyLocus', label: 'Show', type: 'select', options: [['all', 'every locus']].concat(R.locusNames.map(n => [n, n])) },
        { key: 'minFreq', label: 'Hide alleles below', type: 'range', min: 0, max: 0.2, step: 0.01 },
        { key: 'maxRows', label: 'Maximum rows', type: 'range', min: 20, max: 200, step: 10 },
        { key: 'rowH', label: 'Row height', type: 'range', min: 8, max: 26, step: 1 },
        { key: 'values', label: 'Print the numbers', type: 'checkbox' },
        cmapCtl,
      ],
      render: cfg => P3.freqHeat(cfg, R),
    });

    /* 4. rarefaction */
    const hasRarefaction = !!R.rarefaction && !d.singletons;
    el('fig3Rare').style.display = hasRarefaction ? '' : 'none';
    if (hasRarefaction) mount('fig3Rare', {
      title: 'Allelic richness against sampling effort', fileName: 'rarefaction', width: 800, height: 470,
      defaults: { palette: 'cluster', showG: true, title: 'Rarefaction: alleles expected in a sample of g gene copies' },
      controls: [{ key: 'title', label: 'Title', type: 'text' }, { key: 'showG', label: 'Mark the common size g', type: 'checkbox' }, pal],
      render: cfg => P3.rarefaction(cfg, R),
    });

    /* 5. Ho vs He */
    el('fig3HoHe').style.display = codom ? '' : 'none';
    if (codom) mount('fig3HoHe', {
      title: 'Observed against expected heterozygosity', fileName: 'ho_vs_he', width: 780, height: 520,
      defaults: { palette: 'cluster', pointSize: 4.5, title: 'Every locus in every population' },
      controls: [{ key: 'title', label: 'Title', type: 'text' }, { key: 'pointSize', label: 'Point size', type: 'range', min: 2, max: 9, step: 0.5 }, pal],
      render: cfg => P3.hoHe(cfg, R),
    });

    /* 6. private alleles — worth plotting even for single-sample units, where
          they are the bands exclusive to one landrace */
    const hasPrivate = R.privateAlleles.length > 0;
    el('fig3Priv').style.display = hasPrivate ? '' : 'none';
    if (hasPrivate) mount('fig3Priv', {
      title: 'Private alleles', fileName: 'private_alleles', width: 780, height: 460,
      defaults: { palette: 'cluster', splitCommon: true, title: 'Alleles found in one population only' },
      controls: [{ key: 'title', label: 'Title', type: 'text' }, { key: 'splitCommon', label: 'Separate the frequent ones', type: 'checkbox' }, pal],
      render: cfg => P3.privateAlleles(cfg, R),
    });
  }

  /* ================================================================
     morphological branch
     ================================================================ */
  function renderMorph(d, R) {
    statTiles('divTiles', [
      ['Populations', R.popSummary.length, 'compared below'],
      ['Traits', R.perTrait.length, 'measured'],
      ['Plants', d.nInd, 'in total'],
      ["H′ (pooled)", fmtFixed(R.overall.Hstd, 3), 'standardised Shannon diversity'],
    ]);
    const best = R.popSummary.slice().sort((a, b) => b.Hstd - a.Hstd)[0];
    const worst = R.popSummary.slice().sort((a, b) => a.Hstd - b.Hstd)[0];
    el('divInterpret').innerHTML =
      `<p>Each quantitative trait was cut into ${R.classes} classes of half a standard deviation around the overall mean, and ` +
      `Shannon's index was computed from the class frequencies and divided by ln(${R.classes}) so that traits and populations are ` +
      `comparable — the standard descriptor of phenotypic diversity in landrace collections.</p>` +
      `<p>Phenotypic diversity is highest in <b>${esc(best.pop)}</b> (H′ = ${fmtFixed(best.Hstd, 3)}) and lowest in ` +
      `<b>${esc(worst.pop)}</b> (H′ = ${fmtFixed(worst.Hstd, 3)}). Values near 1 mean the plants spread evenly over the whole range ` +
      `of the trait; low values mean they cluster into few classes.</p>` +
      `<p class="callout tip"><b>These are traits, not markers.</b> Phenotypic diversity mixes genetic and environmental variation, ` +
      `so it answers a different question from the marker blocks. Comparing trait differentiation with marker differentiation — P<sub>ST</sub> against F<sub>ST</sub> ` +
      `(Q<sub>ST</sub> when the plants were grown in a common garden) — is what tells you whether the trait differences are more than drift, and that comparison lives in Block 9.</p>`;

    setPopHint("Averages over traits. <b>mean H′</b> standardised Shannon diversity of the traits in each population, with its standard error over traits.", false);
    buildTable('divPopTable', [
      { key: 'pop', label: 'Population' },
      { key: 'n', label: 'N', num: true },
      { key: 'nTraits', label: 'Traits', num: true },
      { key: 'Hstd', label: "mean H′", num: true, fmt: v => fmtFixed(v, 3) },
      { key: 'seHstd', label: 'SE', num: true, fmt: v => fmtFixed(v, 3) },
    ], R.popSummary.concat([Object.assign({}, R.overall, { _class: 'total', nTraits: R.perTrait.length })]));
    el('divSeTable').innerHTML = '';

    /* trait × population detail */
    const cols = [{ key: 'name', label: 'Trait' }];
    R.perTrait[0].byPop.forEach((b, i) => cols.push({ key: 'p' + i, label: esc(b.pop), num: true, fmt: v => fmtFixed(v, 3) }));
    cols.push({ key: 'all', label: 'Pooled', num: true, fmt: v => fmtFixed(v, 3) });
    const rows = R.perTrait.map(t => {
      const row = { name: t.name, all: t.overall.Hstd };
      t.byPop.forEach((b, i) => { row['p' + i] = b.Hstd; });
      return row;
    });
    buildTable('divLocusTable', cols, rows);
    el('divLocusNote').innerHTML = "<b>Standardised Shannon diversity H′</b> of every trait in every population.";
    el('divFreqTable').innerHTML = '';
    el('divFreqNote').textContent = '';
    el('divPrivateWrap').style.display = 'none';
    el('divLocalWrap').style.display = 'none';
    ['fig3Div', 'fig3Freq', 'fig3Rare', 'fig3HoHe', 'fig3Priv'].forEach(id => { el(id).style.display = 'none'; });
    el('fig3Heat').style.display = '';
    try {
      Fig.mount('fig3Heat', {
        title: 'Phenotypic diversity by trait and population', fileName: 'phenotypic_diversity', width: 820, height: 520,
        defaults: { cmap: 'ylgn', rowH: 26, values: true, title: "Standardised Shannon diversity H′" },
        controls: [{ key: 'title', label: 'Title', type: 'text' }, { key: 'values', label: 'Print the numbers', type: 'checkbox' },
        { key: 'rowH', label: 'Row height', type: 'range', min: 16, max: 40, step: 2 },
        { key: 'cmap', label: 'Colour map', type: 'select', options: Object.entries(Fig.colormapNames) }],
        render: cfg => P3.morphHeat(cfg, R),
      });
    } catch (e) { console.error(e); }
  }

  /* ================================================================
     downloads
     ================================================================ */
  function downloadFreqs() {
    if (!R || R.kind === 'morph') return;
    const header = ['Locus', 'Allele'].concat(R.popNames, ['Pooled', 'Populations with it', 'Private to']);
    const rows = R.freqRows.map(r => [r.locus, r.allele].concat(
      R.popNames.map((_, i) => (r['p' + i] || 0).toFixed(4)), [r.overall.toFixed(4), r.nPops, r.privateTo || '']));
    download(matrixToCSV(header, rows), slug(state.fileName) + '_allele_frequencies.csv', 'text/csv;charset=utf-8');
  }
  function downloadSummary() {
    if (!R) return;
    if (R.kind === 'morph') {
      const header = ['Population', 'N', 'Traits', 'mean H_std', 'SE'];
      const rows = R.popSummary.map(r => [r.pop, r.n, r.nTraits, fmtFixed(r.Hstd, 4), fmtFixed(r.seHstd, 4)]);
      download(matrixToCSV(header, rows), slug(state.fileName) + '_phenotypic_diversity.csv', 'text/csv;charset=utf-8');
      return;
    }
    const keys = ['n', 'meanN', 'Na', 'NaF5', 'Ne', 'I', 'Ho', 'He', 'uHe', 'F', 'PIC', 'Ar', 'P', 'private'];
    const header = ['Population'].concat(keys).concat(keys.filter(k => !['n', 'meanN', 'P', 'private'].includes(k)).map(k => 'SE_' + k));
    const rows = R.popSummary.concat([Object.assign({}, R.overall, { pop: 'Pooled', private: R.privateAlleles.length })])
      .map(r => [r.pop].concat(keys.map(k => (r[k] == null || !isFinite(r[k])) ? '' : (k === 'P' ? (r[k] * 100).toFixed(2) : Number(r[k]).toFixed(4))))
        .concat(keys.filter(k => !['n', 'meanN', 'P', 'private'].includes(k)).map(k => (r['se' + k] == null ? '' : Number(r['se' + k]).toFixed(4)))));
    download(matrixToCSV(header, rows), slug(state.fileName) + '_diversity_summary.csv', 'text/csv;charset=utf-8');
  }

  document.addEventListener('DOMContentLoaded', init);
  window.B3 = { run, get result() { return R; } };
})();
