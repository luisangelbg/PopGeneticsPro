/* PopGeneticsPro — Block 4: Hardy–Weinberg equilibrium, inbreeding, null
   alleles and linkage disequilibrium. The block's job is not only to test but
   to tell inbreeding, null alleles and population mixture apart. */

(function () {

  let R = null, PAIR = null;

  function init() {
    if (!el('btnRunHWE')) return;
    el('btnRunHWE').addEventListener('click', run);
    el('hweTestShown').addEventListener('change', renderHWETable);
    el('nullEstimator').addEventListener('change', renderNullTable);
    el('ldScope').addEventListener('change', runPairwise);
    el('btnHweCSV').addEventListener('click', downloadHWE);
    el('btnLdCSV').addEventListener('click', downloadLD);
    el('btnContinue4').addEventListener('click', () => continueAfter(4, 'hweMessages'));
    document.addEventListener('stepchange', e => { if (String(e.detail.step) === '4') onEnter(); });
  }

  function onEnter() {
    const d = state.data;
    if (!d) { showMessage('hweMessages', 'error', 'Load your data in Block 2 first.'); return; }
    const codom = d.kind === 'codominant' && d.ploidy === 2;
    ['hweCardTests', 'hweCardFis', 'hweCardNull'].forEach(id => { el(id).style.display = codom ? '' : 'none'; });
    el('hweOnlyLD').style.display = codom ? 'none' : '';
    /* codominant genotypes of a polyploid show their heterozygotes, but the tests are written for diploids */
    if (!codom) el('hweOnlyLD').innerHTML = d.kind === 'codominant'
      ? `<b>${d.ploidy}-ploid genotypes.</b> Hardy–Weinberg tests, F<sub>IS</sub> and null-allele estimates are implemented for diploids only. Linkage disequilibrium between markers is still measurable and is reported below.`
      : '<b>Dominant or haploid data.</b> Heterozygotes cannot be seen, so Hardy–Weinberg tests, F<sub>IS</sub> and null-allele estimates are not defined. Linkage disequilibrium between markers is still measurable and is reported below.';
    ['hwePermsRow', 'hweMissingNullRow'].forEach(id => { el(id).style.display = codom ? '' : 'none'; });
    /* LD scope selector */
    const sel = el('ldScope');
    sel.innerHTML = '';
    d.pops.forEach((p, i) => { if (p.idx.length >= 5) sel.appendChild(mk('option', { value: String(i) }, `${p.name} (n = ${p.idx.length})`)); });
    sel.appendChild(mk('option', { value: 'pooled' }, `All samples pooled (n = ${d.nInd})`));
    if (!state.hwe) run();
  }

  /* ================================================================ */
  function settings() {
    return {
      permsHWE: Number(el('hwePerms').value) || 0,
      permsLD: Number(el('ldPerms').value) || 0,
      permsPair: Number(el('ldPairPerms').value) || 0,
      adjust: el('hweAdjust').value,
      alpha: Number(el('hweAlpha').value) || 0.05,
      missingAsNull: el('hweMissingNull').checked,
      seed: Number(el('hweSeed').value) || 1,
    };
  }

  function run() {
    const d = state.data;
    if (!d) return;
    clearMessages('hweMessages');
    const t0 = performance.now();
    const btn = el('btnRunHWE');
    btn.disabled = true; btn.textContent = 'Computing…';
    setTimeout(() => {
      try {
        R = HWE.compute(d, settings());
        state.hwe = R;
        renderAll(d);
        el('hweResults').style.display = '';
        el('hweTiming').textContent = `computed in ${((performance.now() - t0) / 1000).toFixed(1)} s · seed ${R.opts.seed}`;
        runPairwise();
      } catch (e) {
        console.error(e);
        showMessage('hweMessages', 'error', 'The analysis failed: ' + esc(e.message));
      } finally { btn.disabled = false; btn.textContent = 'Run the tests'; }
    }, 30);
  }

  function runPairwise() {
    const d = state.data;
    if (!d || !R || !R.ld) return;
    const scope = el('ldScope').value;
    const nPairs = d.nLoci * (d.nLoci - 1) / 2;
    el('ldPairNote').textContent = `Computing ${nPairs} pairs…`;
    /* never leave the pairs of a previous sample or dataset on screen */
    PAIR = null; state.ldPairs = null;
    ['ldPairTable', 'fig4LD', 'fig4RdHist'].forEach(id => { el(id).innerHTML = ''; });
    setTimeout(() => {
      const s = settings();
      /* keep the pairwise permutations affordable on large band matrices */
      if (nPairs > 400 && s.permsPair > 99) s.permsPair = 99;
      PAIR = HWE.computePairwise(d, scope === 'pooled' ? 'pooled' : Number(scope), s);
      state.ldPairs = PAIR;
      renderPairwise(d);
    }, 20);
  }

  /* ================================================================ */
  function renderAll(d) {
    if (R.codom) {
      renderTiles(d);
      renderInterpretation(d);
      renderHWETable();
      renderFisTable();
      renderNullTable();
    } else {
      const sigLD = R.ld ? R.ld.perPop.filter(p => p.p != null && p.p < R.opts.alpha).length : 0;
      statTiles('hweTiles', [
        [d.kind === 'dominant' ? 'Bands' : 'Loci', d.nLoci, 'tested for linkage'],
        ['Populations', R.ld ? R.ld.perPop.filter(p => !p.tooSmall).length : 0, 'with enough plants (n ≥ 5)'],
        ['Significant LD', sigLD, 'populations with r̄<sub>d</sub> above chance', sigLD ? 'warn' : 'ok'],
      ]);
      el('hweInterpret').innerHTML =
        `<p>With ${d.kind} markers the heterozygote is invisible, so there is no Hardy–Weinberg test, no F<sub>IS</sub> and no null-allele estimate to report: ` +
        `those need counted genotypes. What can be asked of bands is whether they are <b>inherited independently</b>, and that is answered below.</p>` +
        ldParagraph();
    }
    renderLDTable(d);
    drawFigures(d);
  }

  /* the reading of multilocus LD, shared by the codominant and dominant branches */
  function ldParagraph() {
    if (!R.ld) return '';
    const alpha = R.opts.alpha;
    const tested = R.ld.perPop.filter(p => !p.tooSmall);
    const sigLD = tested.filter(p => p.p != null && p.p < alpha);
    const strong = sigLD.filter(p => p.rd != null && p.rd > 0.05);
    if (!tested.length) return `<p>No population has the five or more plants needed to test linkage disequilibrium; only the pooled sample is reported.</p>`;
    /* association that appears only when populations are pooled comes from their different allele frequencies */
    const pooled = R.ld.pooled;
    const pooledNote = !sigLD.length && pooled && pooled.p != null && pooled.p < alpha && tested.length > 1
      ? `<p>In the <b>pooled sample</b>, however, r̄<sub>d</sub> = ${pooled.rd.toFixed(4)} is significant (P = ${fmtP(pooled.p)}). Loci that are independent within every population become associated when populations with different allele frequencies are put together — a sign of <b>differentiation</b>, not of physical linkage.</p>`
      : '';
    if (sigLD.length)
      return `<p>Multilocus linkage disequilibrium (r̄<sub>d</sub>) is significant in ${sigLD.length} of ${tested.length} populations (${sigLD.map(p => `${esc(p.pop)} r̄<sub>d</sub> = ${fmtFixed(p.rd, 4)}`).join('; ')}). ` +
        (strong.length ? `Values this size mean the loci are not being reshuffled every generation: <b>selfing, clonality, or recent admixture</b> are the usual causes in plants. Analyses that assume independent loci (Bayesian clustering, assignment) should be read with that in mind.` : `The values are small: statistically detectable, but not enough to bias analyses that assume independent loci.`) + `</p>`;
    return `<p>No population shows significant multilocus linkage disequilibrium (r̄<sub>d</sub> between ${fmtFixed(Math.min(...tested.map(p => p.rd)), 4)} and ${fmtFixed(Math.max(...tested.map(p => p.rd)), 4)}): the markers behave as independent loci, which is what the clustering and assignment methods of Block 7 assume. Individual pairs may still stand out below; with many pairs, a few will by chance alone.</p>` + pooledNote;
  }

  function renderTiles(d) {
    const cells = [].concat(...R.cells);
    const tested = cells.filter(c => c.pExact != null);
    const sig = tested.filter(c => c.pAdj < R.opts.alpha);
    const def = sig.filter(c => c.FisNC > 0).length;
    const fs = R.perPop.map(p => p.f).filter(v => v != null);
    const meanF = fs.length ? fs.reduce((a, b) => a + b, 0) / fs.length : null;
    const suspect = R.perLocus.filter(l => l.suspectNull).length;
    statTiles('hweTiles', [
      ['HWE tests', tested.length, `${R.pops.length} populations × ${R.nLoci} loci`],
      ['Out of equilibrium', sig.length, `${fmtPct(sig.length / Math.max(1, tested.length))} after ${adjName(R.opts.adjust)}`, sig.length / Math.max(1, tested.length) > 0.3 ? 'warn' : 'ok'],
      ['Heterozygote deficits', def, `${sig.length - def} excesses`, def > sig.length - def ? 'warn' : 'ok'],
      ['Mean F<sub>IS</sub>', fmtFixed(meanF, 3), meanF > 0.1 ? 'inbreeding signal' : meanF < -0.05 ? 'excess of heterozygotes' : 'near random mating', meanF > 0.1 ? 'warn' : 'ok'],
      ['Suspected null alleles', suspect, suspect ? 'loci flagged below' : 'no locus flagged', suspect ? 'warn' : 'ok'],
    ]);
  }

  const adjName = m => ({ none: 'no correction', bonferroni: 'Bonferroni', holm: 'Holm’s sequential Bonferroni', bh: 'Benjamini–Hochberg FDR', by: 'Benjamini–Yekutieli FDR' }[m] || m);

  function renderInterpretation(d) {
    const parts = [];
    const cells = [].concat(...R.cells);
    const tested = cells.filter(c => c.pExact != null);
    const sig = tested.filter(c => c.pAdj < R.opts.alpha);
    const def = sig.filter(c => c.FisNC > 0).length, exc = sig.length - def;
    const alpha = R.opts.alpha;

    parts.push(`<p>Of ${tested.length} exact tests (${R.opts.permsHWE} allele permutations each), <b>${sig.length}</b> ${sig.length === 1 ? 'rejects' : 'reject'} Hardy–Weinberg at α = ${alpha} after ${adjName(R.opts.adjust)}` +
      (sig.length ? `: ${def} with fewer heterozygotes than expected and ${exc} with more.` : '.') +
      (R.opts.adjust === 'none' ? ` With ${tested.length} tests and no correction, about ${Math.round(tested.length * alpha)} would be expected to reject by chance alone.` : '') + `</p>`);

    /* the diagnostic */
    const susp = R.perLocus.filter(l => l.suspectNull);
    const popsInbred = R.perPop.filter(p => p.f != null && p.ci && p.ci[0] > 0);
    const popsExcess = R.perPop.filter(p => p.f != null && p.ci && p.ci[1] < 0);
    const lociDefConsistent = R.perLocus.filter(l => l.meanFis > 0.05).length;
    if (popsInbred.length && lociDefConsistent >= R.nLoci * 0.6 && susp.length < R.nLoci * 0.5) {
      parts.push(`<p><b>The deficit is genome-wide, not locus-specific</b>: ${lociDefConsistent} of ${R.nLoci} loci show positive F<sub>IS</sub> on average, and ${popsInbred.length === 1 ? 'one population has' : popsInbred.length + ' populations have'} a multilocus f whose 95% interval excludes zero (${popsInbred.map(p => `${esc(p.pop)} f = ${p.f.toFixed(3)}`).join('; ')}). ` +
        `That pattern points to <b>inbreeding</b> — selfing, mating between relatives, or a Wahlund effect if a "population" actually mixes two gene pools. ` +
        `If mixed mating is the cause, the equilibrium selfing rate implied by f is ${popsInbred.map(p => `${esc(p.pop)} s ≈ ${(p.selfing * 100).toFixed(0)}%`).join(', ')} (s = 2F/(1+F)).</p>`);
    } else if (susp.length) {
      parts.push(`<p><b>The deficit is concentrated in particular loci</b>: ${susp.map(l => `<b>${esc(l.locus)}</b> (mean F<sub>IS</sub> ${l.meanFis.toFixed(3)}, deficit in ${l.nDef} of ${l.nPops} populations, estimated null frequency ${l.meanNull.toFixed(3)})`).join('; ')}. ` +
        `A locus that departs in most populations while the others behave is the signature of a <b>null allele</b>. The usual remedy is to drop the locus: Block 5 lets you recompute F<sub>ST</sub> and the AMOVA without the flagged loci, so you can see how much they were inflating the differentiation.</p>`);
    } else if (popsExcess.length) {
      parts.push(`<p>${popsExcess.length === 1 ? 'One population shows' : popsExcess.length + ' populations show'} a significant <b>excess</b> of heterozygotes (${popsExcess.map(p => `${esc(p.pop)} f = ${p.f.toFixed(3)}`).join('; ')}). In plants this is what clonal reproduction, a recent cross between differentiated sources, or selection favouring heterozygotes look like — and, in small samples, simple chance.</p>`);
    } else if (!sig.length) {
      parts.push(`<p>Genotype frequencies are consistent with random mating in every population: F<sub>IS</sub> intervals include zero and no locus stands out. The loci can be treated as neutral, unlinked codominant markers in the blocks that follow.</p>`);
    } else {
      parts.push(`<p>The departures are scattered — no population is inbred across the board and no locus fails everywhere. That is the pattern of sampling noise, occasional scoring error, or weak structure. It does not justify dropping loci.</p>`);
    }
    if (susp.length && popsInbred.length && lociDefConsistent >= R.nLoci * 0.6)
      parts.push(`<p class="callout warn"><b>Both signals are present.</b> ${susp.length === 1 ? 'One locus looks like a null-allele carrier' : susp.length + ' loci look like null-allele carriers'} on top of a general deficit. Estimate inbreeding from the loci that are <i>not</i> flagged, and report both.</p>`);

    parts.push(ldParagraph());
    el('hweInterpret').innerHTML = parts.join('');
  }

  /* ---------- tables ---------- */
  function renderHWETable() {
    if (!R || !R.codom) return;
    const key = el('hweTestShown').value;
    const cols = [{ key: 'locus', label: 'Locus' }];
    R.pops.forEach((p, i) => cols.push({
      key: 'p' + i, label: esc(p), html: true, num: true,
      get: r => {
        const c = r.cells[i];
        if (!c || c[key] == null) return '<span class="geno-miss">—</span>';
        const v = c[key];
        const pv = key === 'FisNC' ? c.pAdj : (key === 'pChi' ? c.pChiAdj : key === 'pExact' ? c.pAdj : v);
        const sig = pv != null && pv < R.opts.alpha;
        const txt = key === 'FisNC' ? fmtFixed(v, 3) : (v < 0.0001 ? '<0.0001' : v.toFixed(4));
        const mark = key === 'FisNC' ? '' : (c.FisNC > 0 ? ' −' : c.FisNC < 0 ? ' +' : '');
        const warn = key.startsWith('pChi') && c.smallExpected ? ' <span class="hint" title="expected counts below 5">†</span>' : '';
        return sig ? `<b class="geno-het">${txt}${mark}</b>${warn}` : `${txt}${mark}${warn}`;
      },
    }));
    cols.push({ key: 'fisher', label: 'Fisher (all pops)', num: true, get: r => r.fisherP, fmt: v => fmtP(v) });
    const rows = R.locusNames.map((name, l) => ({ locus: name, cells: R.pops.map((_, p) => R.cells[p][l]), fisherP: R.perLocus[l].fisherP }));
    buildTable('hweTable', cols, rows);
    const note = {
      pExact: 'Monte Carlo exact test P-value (raw); bold = significant after correction',
      pAdj: `exact test P-value corrected by ${adjName(R.opts.adjust)}`,
      pDeficit: 'one-sided P for a heterozygote deficit (Rousset & Raymond 1995)',
      pExcess: 'one-sided P for a heterozygote excess',
      pChi: 'chi-square goodness of fit (raw); † = expected counts below 5, use the exact test',
      FisNC: 'F_IS of Nei & Chesser (1983); bold = locus out of HWE after correction',
    }[key];
    el('hweTableNote').innerHTML = `${note}. <b>−</b> fewer heterozygotes than expected, <b>+</b> more. The last column combines the populations with Fisher's method.`;
  }

  function renderFisTable() {
    buildTable('fisTable', [
      { key: 'pop', label: 'Population' },
      { key: 'n', label: 'N', num: true },
      { key: 'f', label: 'f (W&C)', num: true, fmt: v => fmtFixed(v, 3) },
      { key: 'ci', label: '95% CI (bootstrap over loci)', get: r => r.ci ? `${fmtFixed(r.ci[0], 3)} to ${fmtFixed(r.ci[1], 3)}` : '—' },
      { key: 'seJack', label: 'SE (jackknife)', num: true, fmt: v => fmtFixed(v, 3) },
      { key: 'fisNC', label: 'F<sub>IS</sub> (N&amp;C, mean)', num: true, fmt: v => fmtFixed(v, 3) },
      { key: 'selfing', label: 'Selfing rate s', num: true, fmt: v => fmtPct(v, 0) },
      { key: 'nDef', label: 'Loci in deficit', num: true },
      { key: 'nExc', label: 'Loci in excess', num: true },
      { key: 'fisherP', label: 'Fisher (all loci)', num: true, fmt: v => fmtP(v) },
    ], R.perPop);
    buildTable('fisLocusTable', [
      { key: 'locus', label: 'Locus' },
      { key: 'k', label: 'Alleles', num: true },
      { key: 'meanFis', label: 'Mean F<sub>IS</sub>', num: true, fmt: v => fmtFixed(v, 3) },
      { key: 'nDef', label: 'Pops in deficit', num: true },
      { key: 'nSig', label: 'Pops out of HWE', num: true },
      { key: 'nPops', label: 'Pops tested', num: true },
      { key: 'fisherP', label: 'Fisher (all pops)', num: true, fmt: v => fmtP(v) },
      { key: 'meanNull', label: 'Null freq. (EM)', num: true, fmt: v => fmtFixed(v, 3) },
      { key: 'flag', label: '', html: true, get: r => r.suspectNull ? '<span class="pill domin">suspected null allele</span>' : '' },
    ], R.perLocus);
  }

  function renderNullTable() {
    if (!R || !R.codom) return;
    const key = el('nullEstimator').value;
    const cols = [{ key: 'locus', label: 'Locus' }];
    R.pops.forEach((p, i) => cols.push({
      key: 'p' + i, label: esc(p), html: true, num: true,
      get: r => { const v = r.cells[i][key]; if (v == null) return '—'; return v > 0.2 ? `<b class="geno-het">${fmtFixed(v, 3)}</b>` : v > 0.05 ? `<b>${fmtFixed(v, 3)}</b>` : fmtFixed(v, 3); },
    }));
    cols.push({ key: 'mean', label: 'Mean', num: true, fmt: v => fmtFixed(v, 3) });
    const rows = R.locusNames.map((name, l) => {
      const cells = R.pops.map((_, p) => R.cells[p][l]);
      const vals = cells.map(c => c[key]).filter(v => v != null);
      return { locus: name, cells, mean: vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null };
    });
    buildTable('nullTable', cols, rows);
    el('nullNote').innerHTML = {
      nullEM: 'EM estimate of Dempster et al. (1977), the estimator also used for the ENA correction of Chapuis & Estoup (2007)' + (R.opts.missingAsNull ? ', treating non-amplifying individuals as null homozygotes' : ''),
      nullBrook: 'Brookfield (1996) estimator 1: r = (He − Ho)/(1 + He)',
      nullChak: 'Chakraborty et al. (1992): r = (He − Ho)/(He + Ho)',
    }[key] + '. Values above 0.05 are in bold; above 0.20 they distort F<sub>ST</sub> and assignment noticeably. All three estimators attribute the whole heterozygote deficit to null alleles, so in an inbred population they overestimate.';
  }

  function renderLDTable(d) {
    if (!R.ld) { el('hweCardLD').style.display = 'none'; return; }
    el('hweCardLD').style.display = '';
    const rows = R.ld.perPop.concat([Object.assign({ _class: 'total' }, R.ld.pooled)]);
    buildTable('ldTable', [
      { key: 'pop', label: 'Sample' },
      { key: 'n', label: 'N', num: true },
      { key: 'Ia', label: 'I<sub>A</sub>', num: true, fmt: v => fmtFixed(v, 3) },
      { key: 'rd', label: 'r̄<sub>d</sub>', num: true, fmt: v => fmtFixed(v, 4) },
      { key: 'p', label: 'P (permutation)', num: true, html: true, get: r => r.tooSmall ? '<span class="hint">too few plants</span>' : (r.p == null ? '—' : (r.p < R.opts.alpha ? `<b class="geno-het">${fmtP(r.p)}</b>` : fmtP(r.p))) },
      { key: 'B', label: 'Permutations', num: true },
    ], rows);
  }

  function renderPairwise(d) {
    if (!PAIR) return;
    const sig = PAIR.pairs.filter(p => p.pAdj != null && p.pAdj < R.opts.alpha).length;
    el('ldPairNote').innerHTML = `<b>${PAIR.pairs.length} pairs</b> in <b>${esc(PAIR.scope)}</b> (n = ${PAIR.n}): ${sig} significant after ${adjName(R.opts.adjust)}` +
      (PAIR.B ? ` (${PAIR.B} permutations per pair)` : ' (no permutations)') +
      (PAIR.allBiallelic ? '. Every locus is biallelic, so r² and D′ are also reported.' : '.');
    const top = PAIR.pairs.slice().sort((a, b) => (b.rd || 0) - (a.rd || 0)).slice(0, 40);
    const cols = [
      { key: 'la', label: 'Locus A' }, { key: 'lb', label: 'Locus B' },
      { key: 'rd', label: 'r̄<sub>d</sub>', num: true, fmt: v => fmtFixed(v, 4) },
      { key: 'p', label: 'P', num: true, fmt: v => fmtP(v) },
      { key: 'pAdj', label: 'P adjusted', num: true, html: true, get: r => r.pAdj == null ? '—' : (r.pAdj < R.opts.alpha ? `<b class="geno-het">${fmtP(r.pAdj)}</b>` : fmtP(r.pAdj)) },
    ];
    if (PAIR.pairs.some(p => p.r2 != null)) {
      cols.push({ key: 'r2', label: 'r²', num: true, fmt: v => fmtFixed(v, 3) });
      cols.push({ key: 'Dprime', label: "D′", num: true, fmt: v => fmtFixed(v, 3) });
      cols.push({ key: 'pChi', label: 'P (χ²)', num: true, fmt: v => fmtP(v) });
    }
    buildTable('ldPairTable', cols, top);
    drawLDFigures(d);
  }

  /* ---------- figures ---------- */
  const mount = (id, spec) => {
    const host = el(id);
    if (!host) return;
    try { Fig.mount(id, spec); }
    catch (e) { console.error(id, e); host.innerHTML = `<div class="msg msg-error">Figure could not be drawn: ${esc(e.message)}</div>`; }
  };
  const pal = { key: 'palette', label: 'Palette', type: 'select', options: Object.entries(Fig.paletteNames), shared: true };
  const cmapCtl = { key: 'cmap', label: 'Colour map', type: 'select', options: Object.entries(Fig.colormapNames) };

  function drawFigures(d) {
    if (R.codom) {
      mount('fig4Hwe', {
        title: 'Hardy–Weinberg tests at a glance', fileName: 'hwe_matrix', width: 820, height: 520,
        defaults: { palette: 'cluster', test: 'pAdj', alpha: R.opts.alpha, showP: false, rowH: Math.max(14, Math.min(26, 420 / R.nLoci)), title: 'Departures from Hardy–Weinberg equilibrium' },
        controls: [
          { key: 'title', label: 'Title', type: 'text' },
          { key: 'test', label: 'Test shown', type: 'select', options: [['pAdj', 'exact test, corrected'], ['pExact', 'exact test, raw'], ['pDeficit', 'one-sided deficit'], ['pExcess', 'one-sided excess'], ['pChiAdj', 'chi-square, corrected']] },
          { key: 'showP', label: 'Print the P-values', type: 'checkbox' },
          { key: 'rowH', label: 'Row height', type: 'range', min: 10, max: 36, step: 1 }, pal,
        ],
        render: cfg => P4.hweMatrix(cfg, R),
      });
      mount('fig4Forest', {
        title: 'Inbreeding coefficient of every population', fileName: 'fis_forest', width: 820, height: 420,
        defaults: { palette: 'cluster', showLoci: true, values: true, sort: 'file', alpha: R.opts.alpha, title: 'Multilocus F_IS with 95% bootstrap intervals' },
        controls: [{ key: 'title', label: 'Title', type: 'text' }, { key: 'showLoci', label: 'Show the single-locus values', type: 'checkbox' }, { key: 'sort', label: 'Order', type: 'select', options: [['file', 'as in the file'], ['value', 'by F_IS']] }, { key: 'values', label: 'Show values', type: 'checkbox' }, pal],
        render: cfg => P4.fisForest(cfg, R),
      });
      mount('fig4ByLocus', {
        title: 'Inbreeding or null alleles? F_IS locus by locus', fileName: 'fis_by_locus', width: 880, height: 480,
        defaults: { palette: 'cluster', alpha: R.opts.alpha, title: 'A general deficit means inbreeding; a single deviant locus means a null allele' },
        controls: [{ key: 'title', label: 'Title', type: 'text' }, pal],
        render: cfg => P4.fisByLocus(cfg, R),
      });
      mount('fig4Null', {
        title: 'Estimated null allele frequencies', fileName: 'null_alleles', width: 820, height: 520,
        defaults: { palette: 'cluster', cmap: 'heat', estimator: 'nullEM', top: 0.3, values: true, rowH: Math.max(14, Math.min(26, 420 / R.nLoci)), title: 'Null allele frequency (EM estimate)' },
        controls: [{ key: 'title', label: 'Title', type: 'text' }, { key: 'estimator', label: 'Estimator', type: 'select', options: [['nullEM', 'EM (Dempster)'], ['nullBrook', 'Brookfield 1'], ['nullChak', 'Chakraborty']] }, { key: 'top', label: 'Colour scale maximum', type: 'range', min: 0.1, max: 0.6, step: 0.05 }, { key: 'values', label: 'Print the numbers', type: 'checkbox' }, cmapCtl],
        render: cfg => P4.nullHeat(cfg, R),
      });
    }
  }

  function drawLDFigures(d) {
    if (!PAIR) return;
    mount('fig4LD', {
      title: 'Pairwise linkage disequilibrium', fileName: 'ld_pairwise', width: 820, height: 620,
      defaults: { palette: 'cluster', cmap: 'viridis', stat: 'rd', stars: true, alpha: R.opts.alpha, title: `Pairwise linkage disequilibrium · ${PAIR.scope}` },
      controls: [
        { key: 'title', label: 'Title', type: 'text' },
        { key: 'stat', label: 'Statistic', type: 'select', options: [['rd', 'r̄d (any marker)']].concat(PAIR.pairs.some(p => p.r2 != null) ? [['r2', 'r² (biallelic)'], ['Dprime', 'D′ (biallelic)']] : []) },
        { key: 'stars', label: 'Mark significant pairs', type: 'checkbox' }, cmapCtl,
      ],
      render: cfg => P4.ldTriangle(cfg, R, PAIR),
    });
    const scope = el('ldScope').value;
    const ld = scope === 'pooled' ? R.ld.pooled : R.ld.perPop.find(p => p.pop === d.pops[Number(scope)].name);
    mount('fig4RdHist', {
      title: 'Is the multilocus association more than chance?', fileName: 'rd_permutations', width: 780, height: 420,
      defaults: { palette: 'cluster', bins: 30, title: `r̄_d against ${ld && ld.B ? ld.B : 0} permutations · ${ld ? ld.pop : ''}` },
      controls: [{ key: 'title', label: 'Title', type: 'text' }, { key: 'bins', label: 'Classes', type: 'range', min: 10, max: 60, step: 5 }, pal],
      render: cfg => P4.rdHistogram(cfg, ld || {}),
    });
  }

  /* ---------- downloads ---------- */
  function downloadHWE() {
    if (!R || !R.codom) return;
    const header = ['Population', 'Locus', 'N', 'Alleles', 'Ho', 'Hs', 'Fis_NeiChesser', 'f_WC', 'chi2', 'df', 'P_chi2', 'small_expected', 'P_exact', 'P_exact_adjusted', 'P_deficit', 'P_excess', 'null_EM', 'null_Brookfield', 'null_Chakraborty'];
    const rows = [];
    R.cells.forEach((row, p) => row.forEach((c, l) => rows.push([R.pops[p], R.locusNames[l], c.n, c.k, f4(c.Ho), f4(c.Hs), f4(c.FisNC), f4(c.fWC), f4(c.chi2), c.dfChi, f4(c.pChi), c.smallExpected ? 'yes' : 'no', f4(c.pExact), f4(c.pAdj), f4(c.pDeficit), f4(c.pExcess), f4(c.nullEM), f4(c.nullBrook), f4(c.nullChak)])));
    download(matrixToCSV(header, rows), slug(state.fileName) + '_hwe_fis_null.csv', 'text/csv;charset=utf-8');
  }
  function downloadLD() {
    if (!PAIR) return;
    const header = ['Scope', 'Locus_A', 'Locus_B', 'rd', 'P', 'P_adjusted', 'r2', 'Dprime', 'P_chi2'];
    const rows = PAIR.pairs.map(p => [PAIR.scope, p.la, p.lb, f4(p.rd), f4(p.p), f4(p.pAdj), f4(p.r2), f4(p.Dprime), f4(p.pChi)]);
    download(matrixToCSV(header, rows), slug(state.fileName) + '_ld_pairwise.csv', 'text/csv;charset=utf-8');
  }
  const f4 = v => (v == null || !isFinite(v)) ? '' : Number(v).toFixed(5);

  document.addEventListener('DOMContentLoaded', init);
  window.B4 = { run, get result() { return R; }, get pairs() { return PAIR; } };
})();
