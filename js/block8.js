/* PopGeneticsPro — Block 8: aligned DNA sequences — haplotypes, diversity,
   neutrality tests, mismatch distribution, N_ST vs G_ST and the median-joining
   network. Only available when the loaded data are sequences. */

(function () {

  let R = null;

  function init() {
    if (!el('btnRunDna')) return;
    el('btnRunDna').addEventListener('click', run);
    el('btnHapFasta').addEventListener('click', downloadHaplotypes);
    el('btnHapCSV').addEventListener('click', downloadHapTable);
    el('btnNetCSV').addEventListener('click', downloadNetwork);
    el('mismatchScope').addEventListener('change', drawMismatch);
    el('btnContinue8').addEventListener('click', () => continueAfter(8, 'dnaMessages'));
    document.addEventListener('stepchange', e => { if (String(e.detail.step) === '8') onEnter(); });
  }

  function onEnter() {
    const d = state.data;
    if (!d) { showMessage('dnaMessages', 'error', 'Load your data in Block 2 first.'); return; }
    if (d.kind !== 'sequence' || !d.seqs) { showMessage('dnaMessages', 'warning', 'This block needs aligned DNA sequences (a FASTA file loaded in Block 2).'); return; }
    if (!state.dna) run();
  }

  function settings() {
    return {
      sims: Number(el('dnaSims').value) || 0,
      perms: Number(el('dnaPerms').value) || 0,
      mutationRate: Number(el('dnaMu').value) || null,
      generationTime: Number(el('dnaGen').value) || 1,
      seed: Number(el('dnaSeed').value) || 1,
    };
  }

  function run() {
    const d = state.data; if (!d || d.kind !== 'sequence') return;
    clearMessages('dnaMessages');
    const btn = el('btnRunDna'); btn.disabled = true; btn.textContent = 'Computing…';
    const t0 = performance.now();
    setTimeout(() => {
      try {
        R = DNA.compute(d, settings());
        state.dna = R;
        render(d);
        el('dnaResults').style.display = '';
        el('dnaTiming').textContent = `computed in ${((performance.now() - t0) / 1000).toFixed(1)} s · seed ${R.opts.seed}`;
      } catch (e) { console.error(e); showMessage('dnaMessages', 'error', 'The analysis failed: ' + esc(e.message)); }
      finally { btn.disabled = false; btn.textContent = 'Analyse the sequences'; }
    }, 30);
  }

  /* ================================================================ */
  const f3 = v => (v == null || !isFinite(v)) ? '—' : v.toFixed(3);
  const f5 = v => (v == null || !isFinite(v)) ? '—' : v.toFixed(5);
  const pTxt = (p) => p == null ? '' : (p < 0.001 ? '< 0.001' : p.toFixed(3));

  function render(d) {
    renderTiles(d);
    renderInterpretation(d);
    renderSites(d);
    renderHaplotypes(d);
    renderDiversity(d);
    renderStructure(d);
    drawMismatch();
    drawNetwork(d);
  }

  function renderTiles(d) {
    const T = R.total, S = R.sites;
    const tiles = [
      ['Sequences', R.nSeq, `${S.nValid} of ${S.length} sites usable`],
      ['Haplotypes', R.hap.nHap, `Hd = ${f3(T.Hd)}`],
      ['Segregating sites', S.S, `${S.informative} informative, ${S.singletons} singletons`],
      ['π', f5(T.pi), 'nucleotide diversity per site'],
      ["Tajima's D", f3(T.stats.D), T.p && T.p.D ? `P = ${pTxt(T.p.D.pTwo)}` : '', T.p && T.p.D && T.p.D.pTwo < 0.05 ? 'warn' : 'ok'],
      ["Fu's Fs", f3(T.stats.Fs), T.p && T.p.Fs ? `P = ${pTxt(T.p.Fs.pLower)} (one-sided)` : '', T.p && T.p.Fs && T.p.Fs.pLower < 0.02 ? 'warn' : 'ok'],
    ];
    if (R.pp) tiles.push(['N_ST vs G_ST', `${f3(R.pp.Nst)} vs ${f3(R.pp.Gst)}`, `P(N_ST > G_ST) = ${pTxt(R.pp.pNst)}`, R.pp.pNst != null && R.pp.pNst < 0.05 ? 'warn' : 'ok']);
    statTiles('dnaTiles', tiles);
  }

  function renderInterpretation(d) {
    const T = R.total, S = R.sites, parts = [];
    parts.push(`<p>${R.nSeq} sequences of ${S.length} bp; ${S.excluded ? `${S.excluded} sites with gaps or ambiguous bases were excluded (complete deletion), leaving ${S.nValid}` : `all ${S.nValid} sites are usable`}. ` +
      `They collapse into <b>${R.hap.nHap} haplotypes</b> defined by ${S.S} segregating sites (${S.informative} parsimony-informative${S.tsTv != null ? `; transition/transversion ratio ${S.tsTv.toFixed(2)}` : ''}). ` +
      `Haplotype diversity Hd = <b>${f3(T.Hd)}</b> and nucleotide diversity π = <b>${f5(T.pi)}</b> (k = ${f3(T.k)} differences between two random sequences). ` +
      (T.Hd > 0.5 && T.pi < 0.005 ? 'High haplotype diversity with low nucleotide diversity is the classic signature of a <b>recent expansion from a small population</b>: many haplotypes, all closely related (Grant & Bowen 1998).' :
        T.Hd < 0.5 && T.pi < 0.005 ? 'Low diversity in both measures suggests a recent, severe bottleneck or founder event.' :
          T.Hd > 0.5 && T.pi >= 0.005 ? 'High diversity in both measures suggests a large, stable population or admixture of previously separated lineages.' : 'Low haplotype but higher nucleotide diversity points to divergent lineages within a population that lost its intermediate haplotypes.') + `</p>`);
    if (S.multiallelic) parts.push(`<p class="callout warn"><b>${S.multiallelic} of the ${S.S} segregating sites carry three or four different bases.</b> The tests below assume at most one mutation per site (the infinite-sites model), but these sites need at least η = ${S.eta} mutations. θ<sub>W</sub>, Tajima's D and R₂ count sites (S), as is usual, and are distorted by them — D is pushed upwards; Fu &amp; Li's D* and F* count mutations (η). Sequences within a species rarely show many such sites: check the alignment, and read these tests with caution.</p>`);
    if (T.p) {
      const D = T.stats.D, pD = T.p.D ? T.p.D.pTwo : null, Fs = T.stats.Fs, pFs = T.p.Fs ? T.p.Fs.pLower : null, pR2 = T.p.R2 ? T.p.R2.pLower : null;
      /* the tests most sensitive to growth: Fs (one-sided, 0.02) and R₂ (small values, 0.05) */
      const growth = [pFs != null && pFs < 0.02 ? "Fu's Fs" : null, pR2 != null && pR2 < 0.05 ? 'R₂' : null].filter(Boolean);
      parts.push(`<p><b>Neutrality tests</b> (P-values from ${T.p.D ? T.p.D.nSim : 0} coalescent simulations with θ = θ<sub>W</sub>): Tajima's D = ${f3(D)} (P = ${pTxt(pD)}), Fu's Fs = ${f3(Fs)} (P = ${pTxt(pFs)}; Fs is judged significant at P < 0.02), Fu &amp; Li's D* = ${f3(T.stats.Dstar)} and F* = ${f3(T.stats.Fstar)}, R₂ = ${f3(T.stats.R2)}${pR2 != null ? ` (P = ${pTxt(pR2)})` : ''}. ` +
        (D != null && pD != null && pD < 0.05 && D < 0
          ? 'A significantly <b>negative D</b> means an excess of rare variants: population growth after a bottleneck, or a selective sweep. ' +
            (growth.length ? `${growth.join(' and ')}, more sensitive to growth, ${growth.length > 1 ? 'are' : 'is'} significant too, which supports an expansion.` : "Fu's Fs and R₂, the tests most sensitive to growth, are not significant, so selection or a few recent mutations explain the signal as well as an expansion does.")
          : D != null && pD != null && pD < 0.05 && D > 0
            ? 'A significantly <b>positive D</b> means an excess of intermediate-frequency variants: a population contraction, balancing selection, or, most often in plants, a sample that mixes divergent lineages (structure).'
            : growth.length
              ? `Tajima's D is not significant, but ${growth.join(' and ')}, the ${growth.length > 1 ? 'tests' : 'test'} most sensitive to population growth, ${growth.length > 1 ? 'are' : 'is'}: a signal of expansion that D, less powerful, misses.`
              : 'None of the tests departs from the neutral, constant-size expectation; the data do not require a demographic explanation.') + `</p>`);
    }
    if (T.expansion) {
      const E = T.expansion, pr = T.p && T.p.rag ? T.p.rag.pLower : null;
      parts.push(`<p><b>Mismatch distribution</b>: raggedness r = ${E.raggedness.toFixed(4)}${pr != null ? ` (P = ${pTxt(pr)} of a distribution this smooth in a population of constant size)` : ''}. The sudden-expansion model fits τ = ${E.tau.toFixed(2)}, θ₀ = ${E.theta0.toFixed(3)}, θ₁ = ${E.theta1 > 999 ? '∞' : E.theta1.toFixed(1)}` +
        (E.tYears != null ? `; with the mutation rate you gave, τ = 2ut places the expansion about <b>${Math.round(E.tYears).toLocaleString()} years ago</b> (${Math.round(E.tGenerations).toLocaleString()} generations)` : '; give a mutation rate in the settings to convert τ into years') +
        `. ${pr == null ? '' : pr < 0.05 ? 'The distribution is smoother than a stable population usually produces, as a past expansion leaves it; read τ as the time of that expansion.' : 'The distribution is no smoother than a population of constant size produces, so it gives no evidence of expansion and τ should not be read as a date; a ragged, multimodal shape is also what a mixture of divergent lineages leaves behind.'}</p>`);
    }
    if (R.pp && R.amova) {
      parts.push(`<p><b>Phylogeographic structure</b> (Pons &amp; Petit 1996): G<sub>ST</sub> = ${f3(R.pp.Gst)} uses only haplotype identities; N<sub>ST</sub> = ${f3(R.pp.Nst)} also weights how different the haplotypes are. ` +
        (R.pp.pNst != null && R.pp.pNst < 0.05 ? `N<sub>ST</sub> is <b>significantly larger</b> (P = ${pTxt(R.pp.pNst)}): closely related haplotypes tend to occur in the same population, which is phylogeographic structure — lineages sorted in space.` :
          `N<sub>ST</sub> is not significantly larger than G<sub>ST</sub> (P = ${pTxt(R.pp.pNst)}): haplotypes are distributed among populations without regard to their relatedness — no phylogeographic signal beyond the frequency differences.`) +
        ` The AMOVA on nucleotide differences gives Φ<sub>ST</sub> = ${f3(R.amova.phi)} (P = ${pTxt(R.amova.p)}), ${fmtPct(Math.max(0, R.amova.phi), 1)} of the variation among populations. For organelle DNA, compare it with the nuclear F<sub>ST</sub> of the same populations: DNA inherited through seeds (chloroplast in most angiosperms, mitochondria) is usually far more structured than nuclear DNA, because seeds travel less than pollen; in most conifers the chloroplast travels in the pollen.</p>`);
    }
    parts.push(`<p>The median-joining network below contains ${R.net.links.length} links${R.net.nMedian ? ` and ${R.net.nMedian} median vectors (inferred, unsampled haplotypes)` : ''}${R.net.capped ? ` — the search stopped at ${R.net.nMedian} median vectors, so the network may be incomplete` : ''}. Star-like shapes — one central, frequent haplotype surrounded by rare one-step derivatives — are the network's picture of expansion; long branches and reticulations point to old, structured lineages or recombination.</p>`);
    el('dnaInterpret').innerHTML = parts.join('');
  }

  function renderSites(d) {
    const S = R.sites;
    buildTable('dnaSitesTable', [{ key: 'k', label: '' }, { key: 'v', label: '', num: true }], [
      { k: 'Alignment length (bp)', v: S.length }, { k: 'Sites analysed (no gaps or ambiguities in any sequence)', v: S.nValid },
      { k: 'Sites excluded', v: S.excluded }, { k: 'Segregating sites (S)', v: S.S },
      { k: 'Sites with three or four bases', v: S.multiallelic }, { k: 'Minimum number of mutations (η)', v: S.eta },
      { k: 'Parsimony-informative sites', v: S.informative },
      { k: 'Singleton sites', v: S.singletons }, { k: 'Transitions / transversions (biallelic sites)', v: `${S.ts} / ${S.tv}` + (S.tsTv != null ? ` (ratio ${S.tsTv.toFixed(2)})` : '') },
    ]);
    const infSet = new Set();
    /* recompute the informative set for the map */
    const aln = d.seqs.aln, n = aln.length;
    S.seg.forEach(s => { const c = {}; for (let i = 0; i < n; i++) c[aln[i][s]] = (c[aln[i][s]] || 0) + 1; const fr = Object.values(c).sort((a, b) => b - a); if (fr.length >= 2 && fr[1] >= 2) infSet.add(s); });
    const excludedPositions = []; const validSet = new Set(S.valid); for (let s = 0; s < S.length; s++) if (!validSet.has(s)) excludedPositions.push(s);
    try { Fig.mount('fig8Sites', { title: 'Variable sites along the alignment', fileName: 'segregating_sites', width: 900, height: 230, defaults: { palette: 'cluster', title: `${S.S} segregating sites in ${S.length} bp` }, controls: [{ key: 'title', label: 'Title', type: 'text' }], render: cfg => P8.siteMap(cfg, { length: S.length, seg: S.seg, informativeSet: infSet, excludedPositions }) }); } catch (e) { console.error(e); }
  }

  function renderHaplotypes(d) {
    const cols = [{ key: 'hap', label: 'Haplotype' }, { key: 'total', label: 'N', num: true }];
    R.popNames.forEach((p, j) => cols.push({ key: 'p' + j, label: esc(p), num: true, get: r => r.byPop[j] || '·' }));
    cols.push({ key: 'seq', label: 'Variable sites', html: true, get: r => `<span class="geno-cell">${esc(r.varSites)}</span>` });
    /* show only the segregating positions of each haplotype, relative to haplotype 1 */
    const segPos = []; const seqs = R.hap.hapSeq;
    for (let s = 0; s < seqs[0].length; s++) { const b = seqs[0][s]; if (seqs.some(q => q[s] !== b)) segPos.push(s); }
    const rows = R.hapTable.map((r, h) => Object.assign({}, r, { varSites: segPos.map(s => (h === 0 ? seqs[0][s] : (seqs[h][s] === seqs[0][s] ? '.' : seqs[h][s]))).join('') }));
    buildTable('dnaHapTable', cols, rows, { limit: 200 });
    el('dnaHapNote').innerHTML = `${R.hap.nHap} haplotypes. The last column shows only the ${segPos.length} variable positions (alignment positions ${segPos.slice(0, 12).map(s => R.sites.valid[s] + 1).join(', ')}${segPos.length > 12 ? '…' : ''}); a dot means "same as H1".` +
      (R.pops.length ? ` Private haplotypes per population: ${R.pops.map(p => `${esc(p.name)} ${p.private}`).join(', ')}.` : '');
  }

  function renderDiversity(d) {
    const ps = x => ({ pD: x.p && x.p.D ? x.p.D.pTwo : null, pFs: x.p && x.p.Fs ? x.p.Fs.pLower : null, pR2: x.p && x.p.R2 ? x.p.R2.pLower : null, pRag: x.p && x.p.rag ? x.p.rag.pLower : null });
    const rows = R.pops.map(p => Object.assign({ name: p.name }, p, p.stats, ps(p)));
    rows.push(Object.assign({ name: 'All sequences', _class: 'total' }, R.total, R.total.stats, ps(R.total)));
    const sig = (v, p, thr) => v == null ? '—' : (p != null && p < (thr || 0.05) ? `<b class="geno-het">${v.toFixed(3)}</b>` : v.toFixed(3));
    buildTable('dnaDivTable', [
      { key: 'name', label: 'Population' }, { key: 'n', label: 'n', num: true }, { key: 'h', label: 'h', num: true },
      { key: 'Hd', label: 'Hd', num: true, fmt: f3 }, { key: 'S', label: 'S', num: true }, { key: 'k', label: 'k', num: true, fmt: f3 },
      { key: 'pi', label: 'π', num: true, fmt: f5 }, { key: 'thetaWsite', label: 'θ_W (site)', num: true, fmt: f5 },
      { key: 'D', label: "Tajima's D", num: true, html: true, get: r => sig(r.D, r.pD) },
      { key: 'Fs', label: "Fu's Fs", num: true, html: true, get: r => sig(r.Fs, r.pFs, 0.02) },
      { key: 'Dstar', label: 'D*', num: true, fmt: f3 }, { key: 'Fstar', label: 'F*', num: true, fmt: f3 },
      { key: 'R2', label: 'R₂', num: true, html: true, get: r => sig(r.R2, r.pR2) },
      { key: 'rag', label: 'r', num: true, html: true, get: r => (r.rag == null ? '—' : r.pRag != null && r.pRag < 0.05 ? `<b class="geno-het">${r.rag.toFixed(4)}</b>` : r.rag.toFixed(4)) },
    ], rows);
    el('dnaDivNote').innerHTML = 'Bold: significant by coalescent simulation of a neutral population of constant size — Tajima\'s D two-sided at 0.05; R₂ and the raggedness r one-sided for small values (growth) at 0.05; Fs one-sided at 0.02, as Fu recommends. D* and F* are shown without a test. h haplotypes · Hd haplotype diversity · S segregating sites · k mean pairwise differences · π and θ<sub>W</sub> per site · r raggedness of the mismatch distribution (Harpending 1994). Populations with fewer than four sequences are not tested.';
    el('fig8Pops').style.display = R.pops.length >= 2 ? '' : 'none';
    if (R.pops.length >= 2) {
      try { Fig.mount('fig8Pops', { title: 'Diversity per population', fileName: 'sequence_diversity_by_population', width: 760, height: 420, defaults: { palette: 'cluster', index: 'pi', title: 'Sequence diversity by population' }, controls: [{ key: 'title', label: 'Title', type: 'text' }, { key: 'index', label: 'Index', type: 'select', options: [['pi', 'π'], ['Hd', 'Hd'], ['h', 'haplotypes'], ['k', 'k'], ['thetaWsite', 'θ_W'], ['S', 'S']] }, { key: 'palette', label: 'Palette', type: 'select', options: Object.entries(Fig.paletteNames), shared: true }], render: cfg => P8.popBars(cfg, R.pops.map(p => Object.assign({ name: p.name }, p))) }); } catch (e) { console.error(e); }
    }
    /* mismatch scope selector */
    const sel = el('mismatchScope'); sel.innerHTML = ''; sel.appendChild(mk('option', { value: 'all' }, 'All sequences'));
    R.pops.forEach((p, i) => { if (p.n >= 4) sel.appendChild(mk('option', { value: String(i) }, p.name)); });
  }

  function renderStructure(d) {
    const card = el('dnaStructCard');
    if (!R.pp) { card.style.display = 'none'; return; }
    card.style.display = '';
    buildTable('dnaStructTable', [{ key: 'k', label: 'Statistic' }, { key: 'v', label: 'Value', num: true }, { key: 'p', label: 'P' }], [
      { k: 'h_S (within-population haplotype diversity)', v: f3(R.pp.hS), p: '' }, { k: 'h_T (total)', v: f3(R.pp.hT), p: '' },
      { k: 'G_ST (haplotype identity)', v: f3(R.pp.Gst), p: '' },
      { k: 'v_S (within, distance-weighted)', v: f3(R.pp.vS), p: '' }, { k: 'v_T (total, distance-weighted)', v: f3(R.pp.vT), p: '' },
      { k: 'N_ST (distance-weighted)', v: f3(R.pp.Nst), p: `P(N_ST > G_ST) = ${pTxt(R.pp.pNst)} (${R.pp.perms} permutations of haplotypes)` },
      { k: 'Φ_ST (AMOVA on nucleotide differences)', v: f3(R.amova.phi), p: `P = ${pTxt(R.amova.p)} (${R.amova.perms} permutations of sequences)` },
    ]);
    const H = R.hap.nHap;
    el('dnaStructNote').innerHTML = H <= 6
      ? `<b>Note:</b> the N<sub>ST</sub> test permutes haplotype identities over the distance matrix, and with only ${H} haplotypes there are ${[1, 1, 2, 6, 24, 120, 720][H]} possible arrangements — its P-value cannot go much below 1/${[1, 1, 2, 6, 24, 120, 720][H]}. Read the size of N<sub>ST</sub> − G<sub>ST</sub> rather than its significance.`
      : '';
  }

  function drawMismatch() {
    if (!R) return;
    const w = el('mismatchScope').value;
    const src = w === 'all' ? R.total : R.pops[Number(w)];
    const M = src.mismatch;
    const E = w === 'all' ? R.total.expansion : (M.obs.length > 2 ? DNA.fitExpansion(M.obs, src.k) : null);
    try {
      Fig.mount('fig8Mismatch', {
        title: 'Mismatch distribution', fileName: 'mismatch_distribution', width: 780, height: 460,
        defaults: { palette: 'cluster', expected: true, title: `Mismatch distribution · ${w === 'all' ? 'all sequences' : src.name}` },
        controls: [{ key: 'title', label: 'Title', type: 'text' }, { key: 'expected', label: 'Show the sudden-expansion model', type: 'checkbox' }, { key: 'palette', label: 'Palette', type: 'select', options: Object.entries(Fig.paletteNames), shared: true }],
        render: cfg => P8.mismatch(cfg, { obs: M.obs, expected: E ? E.expected : null, note: E ? `τ = ${E.tau.toFixed(2)} · r = ${E.raggedness.toFixed(4)}` : '' }),
      });
    } catch (e) { console.error(e); }
  }

  function drawNetwork(d) {
    try {
      Fig.mount('fig8Network', {
        title: 'Median-joining haplotype network', fileName: 'haplotype_network', width: 900, height: 640,
        defaults: { palette: 'cluster', pies: true, ticks: true, labels: true, counts: false, nodeScale: 1, linkWidth: 1.4, labelSize: 10, title: 'Haplotype network (median-joining, ε = 0)' },
        controls: [
          { key: 'title', label: 'Title', type: 'text' }, { key: 'pies', label: 'Colour by population', type: 'checkbox' }, { key: 'ticks', label: 'Mutational steps as ticks', type: 'checkbox' },
          { key: 'labels', label: 'Haplotype labels', type: 'checkbox' }, { key: 'counts', label: 'Add the counts', type: 'checkbox' },
          { key: 'nodeScale', label: 'Node size', type: 'range', min: 0.4, max: 2.5, step: 0.1 }, { key: 'labelSize', label: 'Label size', type: 'range', min: 6, max: 16, step: 0.5 }, { key: 'linkWidth', label: 'Link width', type: 'range', min: 0.5, max: 4, step: 0.1 },
          { key: 'palette', label: 'Palette', type: 'select', options: Object.entries(Fig.paletteNames), shared: true },
        ],
        render: cfg => P8.network(cfg, { net: R.net, hapTable: R.hapTable, popNames: R.popNames }),
      });
    } catch (e) { console.error(e); el('fig8Network').innerHTML = `<div class="msg msg-error">${esc(e.message)}</div>`; }
  }

  /* ---------- downloads ---------- */
  function downloadHaplotypes() {
    if (!R) return;
    const d = state.data;
    /* full-length representative sequence of each haplotype (first sequence carrying it) */
    const txt = R.hap.hapSeq.map((s, h) => { const i = R.hap.hapIndex.indexOf(h); return `>H${h + 1} n=${R.hapTable[h].total}\n${d.seqs.aln[i].replace(/(.{60})/g, '$1\n')}`; }).join('\n') + '\n';
    download(txt, slug(state.fileName) + '_haplotypes.fasta', 'text/plain;charset=utf-8');
  }
  function downloadHapTable() {
    if (!R) return;
    const header = ['Haplotype', 'N'].concat(R.popNames).concat(['Sequence_at_valid_sites']);
    const rows = R.hapTable.map((r, h) => [r.hap, r.total].concat(r.byPop).concat([R.hap.hapSeq[h]]));
    download(matrixToCSV(header, rows), slug(state.fileName) + '_haplotype_table.csv', 'text/csv;charset=utf-8');
  }
  function downloadNetwork() {
    if (!R) return;
    const name = i => (i < R.net.nObs ? 'H' + (i + 1) : 'mv' + (i - R.net.nObs + 1));
    const rows = R.net.links.map(l => [name(l.a), name(l.b), l.d]);
    download(matrixToCSV(['From', 'To', 'Mutational_steps'], rows), slug(state.fileName) + '_network_links.csv', 'text/csv;charset=utf-8');
  }

  document.addEventListener('DOMContentLoaded', init);
  window.B8 = { run, get result() { return R; } };
})();
