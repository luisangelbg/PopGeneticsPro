/* PopGeneticsPro — Block 8, card 8: divergence times.
   Tree (NJ or imported) → rooted → maximum-likelihood branch lengths → calibrations or
   a rate → LSD and/or Bayesian MCMC → dated tree with the geological scale, node-age
   table, convergence diagnostics and exports for tree viewers and MCMC diagnostic software. */

(function () {

  const DT = { tips: null, fit: null, models: null, lsd: null, mcmc: null, calibs: [], mode: 'calib', running: false, shown: null };
  window.DT = DT;

  const f2 = v => (v == null || !isFinite(v)) ? '—' : (Math.abs(v) >= 100 ? v.toFixed(1) : Math.abs(v) >= 1 ? v.toFixed(2) : v.toPrecision(3));
  const fRate = v => (v == null || !isFinite(v)) ? '—' : v.toExponential(2);

  /* ================================================================ tips */
  function tipsInfo(d, mode) {
    const S = d.seqs;
    const popNames = d.declaredPops && !d.singletons ? d.pops.map(p => p.name) : null;
    const popOfInd = i => (popNames ? d.pops.findIndex(p => p.idx.includes(i)) : -1);
    if (mode === 'haplotypes') {
      const H = S.hapSeq.length;
      const members = Array.from({ length: H }, () => []);
      S.hapIndex.forEach((h, i) => members[h].push(i));
      const labels = members.map((m, h) => (m.length === 1 ? d.ind[m[0]].id : `H${h + 1} (×${m.length})`));
      const seqs = S.hapSeq;
      const shares = popNames ? members.map(m => { const q = new Array(popNames.length).fill(0); m.forEach(i => { const p = popOfInd(i); if (p >= 0) q[p]++; }); return q.map(v => v / Math.max(1, m.length)); }) : null;
      const groupOf = popNames ? members.map(m => { const ps = new Set(m.map(popOfInd)); return ps.size === 1 ? [...ps][0] : null; }) : null;
      return { mode, labels, seqs, members, shares, groupOf, popNames, L: S.length };
    }
    const labels = d.ind.map(v => v.id);
    return { mode, labels, seqs: S.aln, members: labels.map((_, i) => [i]), shares: null, groupOf: popNames ? d.ind.map((_, i) => { const p = popOfInd(i); return p >= 0 ? p : null; }) : null, popNames, L: S.length };
  }

  /* ================================================================ the synthetic example
     data/genera_dating.fasta was simulated (data/generate_dating_example.pl) on this tree,
     branch lengths in Ma, so the dates can be checked against the truth. Genera and fossils
     are invented. */
  const DATING_EXAMPLE = {
    file: 'genera_dating.fasta',
    trueTree: '((Exterocarpus_borealis:20,Exterocarpus_palustris:20):42,(((Fictaria_alba:12,(Fictaria_montana:5,Fictaria_rubra:5):7):22,' +
      '((Modelanthus_gracilis:7,Modelanthus_major:7):11,Modelanthus_minor:18):16):14,((Demoxylon_sylvestre:22,(Demoxylon_orientale:10,Demoxylon_australe:10):12):18,' +
      '((Probocarpa_nana:9,Probocarpa_elata:9):18,(Testiflora_aurea:15,(Testiflora_lutea:6,Testiflora_vernalis:6):9):12):13):8):14);',
    outgroup: ['Exterocarpus_borealis', 'Exterocarpus_palustris'],
    calibs: [
      { label: 'F1', a: 'Fictaria_alba', b: 'Modelanthus_minor', where: 'crown', kind: 'fossil', geo: 'Rupelian', min: 27.82, max: 45, shape: 'lognormal',
        story: 'a flower with the fused five-lobed corona that only Fictaria and Modelanthus have, from Rupelian (Early Oligocene) lake beds; no such flowers in the well-sampled Eocene floras, hence a soft maximum of 45 Ma' },
      { label: 'F2', a: 'Demoxylon_sylvestre', b: 'Demoxylon_australe', where: 'crown', kind: 'fossil', geo: 'Aquitanian', min: 20.44, max: '', shape: 'lognormal',
        story: 'wood with the banded rays of the living Demoxylon subgroups, Aquitanian (earliest Miocene)' },
      { label: 'F3', a: 'Probocarpa_nana', b: 'Probocarpa_elata', where: 'stem', kind: 'fossil', geo: 'Chattian', min: 23.03, max: '', shape: 'exponential',
        story: 'a winged fruit of the Probocarpa lineage without the features of either living species, Chattian (Late Oligocene): a stem calibration' },
      { label: 'S1', a: 'Fictaria_alba', b: 'Testiflora_aurea', where: 'crown', kind: 'secondary', mean: 50, sd: 4,
        story: 'the age of the five-genus clade in a published family-wide dated tree, 50 ± 4 Ma' },
    ],
  };
  /* clade ages of a Newick tree whose branch lengths are times: key = sorted tip names */
  function cladeAges(nwk) {
    let i = 0;
    const s = nwk.trim();
    function parse() {
      const nd = { kids: [], name: '', len: 0 };
      if (s[i] === '(') {
        i++;
        do { if (s[i] === ',') i++; nd.kids.push(parse()); } while (s[i] === ',');
        i++;
      }
      let name = ''; while (i < s.length && !':,();'.includes(s[i])) name += s[i++];
      nd.name = name.trim();
      if (s[i] === ':') { i++; let num = ''; while (i < s.length && !',();'.includes(s[i])) num += s[i++]; nd.len = Number(num); }
      return nd;
    }
    const root = parse();
    const ages = new Map();
    (function walk(nd) {
      if (!nd.kids.length) return { tips: [nd.name], h: 0 };
      const sub = nd.kids.map(walk);
      const h = sub[0].h + nd.kids[0].len;
      const tips = [].concat(...sub.map(x => x.tips));
      ages.set(tips.slice().sort().join('|'), h);
      return { tips, h };
    })(root);
    return ages;
  }
  const isDatingExample = () => !!(window.B2 && B2.example && B2.example.dating && state.fileName === DATING_EXAMPLE.file);
  let TRUE_AGES = null;
  function trueAge(nd) {
    if (!isDatingExample()) return null;
    if (!TRUE_AGES) TRUE_AGES = cladeAges(DATING_EXAMPLE.trueTree);
    const key = TreeOps.tips(nd).map(t => DT.tips.labels[t.tip]).sort().join('|');
    return TRUE_AGES.has(key) ? TRUE_AGES.get(key) : null;
  }

  function renderExampleBox() {
    const box = el('dtExampleBox');
    if (!box) return;
    if (!isDatingExample() || !DT.tips) { box.style.display = 'none'; return; }
    box.style.display = '';
    box.innerHTML = `<b>Practice data set: five invented genera, fictitious fossils.</b>
      The sequences were simulated on a known dated tree (HKY + Γ, relaxed clock of 0.0015 substitutions per site per million years), so every estimate can be
      checked: after dating, the node table adds a <i>Simulated age</i> column. The button sets the outgroup (<i>Exterocarpus</i>) and four calibrations:
      <ul style="margin:6px 0 6px 18px;padding:0">${DATING_EXAMPLE.calibs.map(c => `<li><b style="display:inline">${c.label}</b> · ${c.where} of ${esc(c.a.split('_')[0])}${c.a.split('_')[0] !== c.b.split('_')[0] ? ' + ' + esc(c.b.split('_')[0]) : ''} — ${esc(c.story)}.</li>`).join('')}</ul>
      Then press <i>Build and fit the tree</i>, <i>Run LSD</i> and, if you have a few minutes, the MCMC. Things to notice: LSD assumes one rate for every
      branch, so where a lineage evolved faster (the outgroup here) its dates come out too old; the relaxed-clock MCMC absorbs that. With the default 200 000
      iterations some ESS stay below 200 (in red): raise the iterations for a chain you would publish. Try removing F1's maximum or S1 to see how the ages drift without an upper bound.
      <div class="btn-row" style="margin-top:6px"><button class="btn btn-secondary btn-sm" type="button" id="btnDtExample">Fill in the example setup</button></div>`;
    el('btnDtExample').addEventListener('click', applyExampleSetup);
  }

  function applyExampleSetup() {
    const idx = name => DT.tips.labels.indexOf(name);
    el('dtTips').value = 'sequences';
    DT.tips = tipsInfo(state.data, 'sequences');
    el('dtTopo').value = 'nj'; el('dtNewickWrap').style.display = 'none';
    el('dtRoot').value = 'outgroup'; el('dtOutgroupWrap').style.display = '';
    el('dtOutgroupFilter').value = '';
    renderOutgroup();
    el('dtOutgroup').querySelectorAll('input').forEach(inp => { inp.checked = DATING_EXAMPLE.outgroup.includes(DT.tips.labels[Number(inp.value)]); });
    setMode('calib');
    DT.calibs = [];
    DATING_EXAMPLE.calibs.forEach(c => addCalibration({ label: c.label, a: idx(c.a), b: idx(c.b), where: c.where, kind: c.kind, geo: c.geo || '', min: c.min != null ? c.min : '', max: c.max != null ? c.max : '', shape: c.shape || 'lognormal', mean: c.mean != null ? c.mean : '', sd: c.sd != null ? c.sd : '' }));
    renderCalibrations();
    clearMessages('dtFitMessages');
    showMessage('dtFitMessages', 'success', 'Outgroup and calibrations filled in. Now press “Build and fit the tree”.');
  }

  /* K2P distance with pairwise deletion */
  function k2p(a, b) {
    let P = 0, Q = 0, n = 0;
    const pur = c => c === 'A' || c === 'G';
    for (let s = 0; s < Math.min(a.length, b.length); s++) {
      const x = a[s], y = b[s];
      if (!'ACGT'.includes(x) || !'ACGT'.includes(y)) continue;
      n++;
      if (x !== y) { if (pur(x) === pur(y)) P++; else Q++; }
    }
    if (!n) return 0;
    P /= n; Q /= n;
    const w1 = 1 - 2 * P - Q, w2 = 1 - 2 * Q;
    if (w1 <= 0 || w2 <= 0) return 3;
    return -0.5 * Math.log(w1) - 0.25 * Math.log(w2);
  }

  /* polytomies are resolved with zero-length branches so every method sees a binary tree */
  function resolvePolytomies(node) {
    if (node.children.length > 2) {
      const kids = node.children;
      let cur = kids[0];
      for (let i = 1; i < kids.length - 1; i++) cur = { node: { children: [cur, kids[i]] }, len: 1e-6 };
      node.children = [cur, kids[kids.length - 1]];
    }
    node.children.forEach(c => resolvePolytomies(c.node));
    return node;
  }

  /* ================================================================ UI: setup */
  function init() {
    if (!el('datingCard')) return;
    el('dtTips').addEventListener('change', () => { DT.fit = null; prepare(); });
    el('dtTopo').addEventListener('change', () => { el('dtNewickWrap').style.display = el('dtTopo').value === 'newick' ? '' : 'none'; });
    el('dtRoot').addEventListener('change', () => { el('dtOutgroupWrap').style.display = el('dtRoot').value === 'outgroup' ? '' : 'none'; });
    el('dtOutgroupFilter').addEventListener('input', renderOutgroup);
    el('btnDtNewickFile').addEventListener('click', () => el('dtNewickFile').click());
    el('dtNewickFile').addEventListener('change', e => { const f = e.target.files[0]; if (!f) return; const fr = new FileReader(); fr.onload = () => { el('dtNewick').value = extractNewick(String(fr.result)); }; fr.readAsText(f); });
    el('btnDtFit').addEventListener('click', fitTree);
    els('#dtModeTabs .tab').forEach(b => b.addEventListener('click', () => setMode(b.dataset.mode)));
    el('btnDtAddCal').addEventListener('click', () => { addCalibration(); renderCalibrations(); });
    el('dtRatePreset').addEventListener('change', () => { const v = el('dtRatePreset').value; if (!v) return; const [m, s] = v.split('|'); el('dtRateMean').value = m; el('dtRateSd').value = s; });
    el('btnDtLSD').addEventListener('click', runLSD);
    el('btnDtMCMC').addEventListener('click', runMCMC);
    el('btnDtCancel').addEventListener('click', () => { Dating.cancel(); });
    el('dtShown').addEventListener('change', () => showResult(el('dtShown').value));
    el('btnDtImages').addEventListener('click', openImages);
    el('btnDtNexus').addEventListener('click', () => exportTree('nexus'));
    el('btnDtNewickOut').addEventListener('click', () => exportTree('newick'));
    el('btnDtCSV').addEventListener('click', exportCSV);
    el('btnDtLog').addEventListener('click', exportLog);
    el('dtGeoChart').textContent = GeoTime.CHART;
    if (window.OTUImg) OTUImg.onChange(() => { const api = Fig.registry.fig8TimeTree; if (api && el('fig8TimeTree').firstChild) api.redraw(); });
    document.addEventListener('stepchange', e => { if (String(e.detail.step) === '8') setTimeout(prepare, 50); });
  }

  function extractNewick(text) {
    const m = text.match(/tree\s+[^=]*=\s*(?:\[&[RU]\]\s*)?([^;]+;)/i);
    if (m) {
      /* NEXUS with a translate block */
      const tr = text.match(/translate([\s\S]*?);/i);
      let nwk = m[1];
      if (tr) {
        const map = {};
        tr[1].split(',').forEach(p => { const mm = p.trim().match(/^(\S+)\s+(.+)$/); if (mm) map[mm[1]] = mm[2].replace(/^'|'$/g, ''); });
        nwk = nwk.replace(/([(,])\s*([^():,\[\];]+)/g, (all, pre, lab) => pre + (map[lab.trim()] != null ? "'" + map[lab.trim()] + "'" : lab));
      }
      return nwk;
    }
    return text.trim();
  }

  function prepare() {
    const d = state.data;
    if (!d || d.kind !== 'sequence' || !d.seqs) return;
    /* another data set: nothing fitted, calibrated or dated for the previous one may survive
       (the tip indices of its calibrations and trees point to other sequences) */
    if (DT.data !== d) {
      if (DT.running) Dating.cancel();
      Object.assign(DT, { data: d, tips: null, fit: null, models: null, lsd: null, mcmc: null, calibs: [], outgroup: null, shown: null });
      el('dtResults').style.display = 'none'; el('dtModelWrap').style.display = 'none';
      el('dtFitInfo').textContent = ''; clearMessages('dtFitMessages'); clearMessages('dtRunMessages');
      el('dtOutgroup').innerHTML = ''; el('dtOutgroupFilter').value = '';
      setMode('calib');
    }
    const nHap = d.seqs.hapSeq.length;
    if (!DT.tips) el('dtTips').value = nHap < d.nInd ? 'haplotypes' : 'sequences';
    DT.tips = tipsInfo(d, el('dtTips').value);
    el('dtTipsHelp').textContent = el('dtTips').value === 'haplotypes'
      ? `${nHap} haplotypes from ${d.nInd} sequences. Identical sequences add nothing to a dated tree but time.`
      : `${d.nInd} sequences${nHap < d.nInd ? ` (${nHap} distinct)` : ''}. Use this for one sequence per species or accession.`;
    if (!DT.fit) { el('btnDtLSD').disabled = true; el('btnDtMCMC').disabled = true; }
    if (DT.mode === 'rate' || (nHap < d.nInd && d.declaredPops)) { /* intraspecific data: suggest a rate and the coalescent */
      if (!DT.fit) { el('dtTreePrior').value = 'coalescent'; }
    }
    renderOutgroup();
    renderCalibrations();
    renderExampleBox();
  }

  function renderOutgroup() {
    const host = el('dtOutgroup');
    if (!DT.tips) return;
    const filt = el('dtOutgroupFilter').value.trim().toLowerCase();
    const checked = new Set([...host.querySelectorAll('input:checked')].map(i => Number(i.value)));
    host.innerHTML = '';
    DT.tips.labels.forEach((lab, i) => {
      if (filt && !lab.toLowerCase().includes(filt) && !checked.has(i)) return;
      const l = mk('label', { class: 'dt-tip' });
      l.innerHTML = `<input type="checkbox" value="${i}" ${checked.has(i) ? 'checked' : ''}> ${esc(lab)}`;
      host.appendChild(l);
    });
  }

  function setMode(mode) {
    DT.mode = mode;
    els('#dtModeTabs .tab').forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
    el('dtCalibWrap').style.display = mode === 'calib' ? '' : 'none';
    el('dtRateWrap').style.display = mode === 'rate' ? '' : 'none';
    el('dtTreePrior').value = mode === 'rate' ? 'coalescent' : 'yule';
  }

  /* ================================================================ 1 · tree */
  async function fitTree() {
    const d = state.data;
    if (!d || d.kind !== 'sequence') return;
    clearMessages('dtFitMessages');
    const btn = el('btnDtFit');
    btn.disabled = true; btn.textContent = 'Fitting…';
    DT.tips = tipsInfo(d, el('dtTips').value);
    const T = DT.tips;
    try {
      if (T.labels.length < 3) throw new Error('A tree needs at least three tips.');
      if (T.labels.length > 400) throw new Error(`${T.labels.length} tips are too many to date in the browser; use one tip per haplotype or a subset.`);
      let root;
      if (el('dtTopo').value === 'newick') {
        const txt = el('dtNewick').value.trim();
        if (!txt) throw new Error('Paste or load a Newick tree first.');
        const parsed = TreeOps.parseNewick(extractNewick(txt), T.labels);
        if (parsed.labels.length > T.labels.length) throw new Error('Tips of the tree not found among the sequences: ' + parsed.labels.slice(T.labels.length, T.labels.length + 6).join(', ') + '. The names must match exactly (spaces and underscores are treated alike).');
        const present = new Set(TreeOps.tips(parsed.root).map(t => t.tip));
        const missing = T.labels.filter((_, i) => !present.has(i));
        if (missing.length) throw new Error('Sequences missing from the tree: ' + missing.slice(0, 6).join(', ') + (missing.length > 6 ? '…' : '') + '.');
        root = parsed.root;
      } else {
        const n = T.seqs.length;
        const D = Array.from({ length: n }, () => new Array(n).fill(0));
        for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) D[i][j] = D[j][i] = k2p(T.seqs[i], T.seqs[j]);
        root = GD.neighborJoining(D, T.labels);
      }
      TreeOps.nodes(root).forEach(nd => { if (nd.tip != null) nd.label = T.labels[nd.tip]; nd.children.forEach(c => { if (!(c.len > 0)) c.len = 1e-4; }); });
      resolvePolytomies(root);
      /* rooting */
      if (el('dtRoot').value === 'outgroup') {
        const og = [...el('dtOutgroup').querySelectorAll('input:checked')].map(i => Number(i.value));
        if (!og.length) throw new Error('Tick the outgroup tips, or choose midpoint rooting.');
        const rr = TreeOps.rerootOutgroup(root, og);
        if (!rr) throw new Error('The outgroup is not monophyletic on this tree: choose tips that form one clade, or root at the midpoint.');
        root = rr;
      } else root = TreeOps.midpointRoot(root);
      resolvePolytomies(root);
      DT.outgroup = el('dtRoot').value === 'outgroup' ? [...el('dtOutgroup').querySelectorAll('input:checked')].map(i => Number(i.value)) : null;
      const t0 = performance.now();
      const modelSel = el('dtModel').value;
      if (modelSel === 'auto') {
        el('dtFitInfo').textContent = 'comparing 8 substitution models…';
        const cmp = await Dating.runInWorker('compare', { tree: root, seqs: T.seqs, passes: 6 });
        const useGamma = el('dtGamma').checked;
        DT.models = cmp;
        const best = cmp.fits.filter(f => useGamma || !f.spec.alpha).reduce((a, b) => (b.AICc < a.AICc ? b : a));
        DT.fit = best;
      } else {
        el('dtFitInfo').textContent = 'fitting branch lengths…';
        DT.models = null;
        DT.fit = await Dating.runInWorker('fit', { tree: root, seqs: T.seqs, spec: { model: modelSel, alpha: el('dtGamma').checked ? 0.5 : null }, passes: 10 });
      }
      DT.fit.tree = attachLabels(DT.fit.tree);
      DT.lsd = null; DT.mcmc = null;
      el('dtFitInfo').textContent = `${modelName(DT.fit.spec)} · ln L = ${DT.fit.lnL.toFixed(2)} · ${DT.fit.nSites} sites (${DT.fit.variable} variable) · ${((performance.now() - t0) / 1000).toFixed(1)} s`;
      renderModels();
      el('btnDtLSD').disabled = false; el('btnDtMCMC').disabled = false;
      renderCalibrations();
      showResult('ml');
    } catch (e) {
      console.error(e);
      showMessage('dtFitMessages', 'error', esc(e.message));
      el('dtFitInfo').textContent = '';
    } finally { btn.disabled = false; btn.textContent = 'Build and fit the tree'; }
  }

  function attachLabels(tree) { TreeOps.nodes(tree).forEach(nd => { if (nd.tip != null) nd.label = DT.tips.labels[nd.tip]; }); return tree; }
  const modelName = s => s.model + (s.alpha ? '+Γ' : '');

  function renderModels() {
    if (!DT.models) { el('dtModelWrap').style.display = 'none'; return; }
    el('dtModelWrap').style.display = '';
    const rows = DT.models.fits.slice().sort((a, b) => a.AICc - b.AICc);
    buildTable('dtModelTable', [
      { key: 'm', label: 'Model', html: true, get: r => (r === DT.fit ? '<b>' + esc(modelName(r.spec)) + ' ✓</b>' : esc(modelName(r.spec))) },
      { key: 'k', label: 'Parameters', num: true },
      { key: 'lnL', label: 'ln L', num: true, fmt: v => v.toFixed(2) },
      { key: 'AICc', label: 'AICc', num: true, fmt: v => v.toFixed(2) },
      { key: 'dAICc', label: 'ΔAICc', num: true, fmt: v => v.toFixed(2) },
      { key: 'wAICc', label: 'Akaike weight', num: true, fmt: v => v.toFixed(3) },
      { key: 'BIC', label: 'BIC', num: true, fmt: v => v.toFixed(2) },
      { key: 'par', label: 'Estimates', get: r => [r.spec.kappa && (r.spec.model === 'HKY' || r.spec.model === 'K80') ? 'κ = ' + r.spec.kappa.toFixed(2) : null, r.spec.alpha ? 'α = ' + r.spec.alpha.toFixed(3) : null].filter(Boolean).join(', ') },
    ], rows);
    if (DT.fit.spec.alpha && DT.fit.spec.alpha < 0.03)
      el('dtModelTable').appendChild(mk('p', { class: 'hint', style: 'padding:6px 12px;margin:0' }, `α sits at its lower limit (${DT.fit.spec.alpha.toFixed(3)}): with only ${DT.fit.variable} variable sites of ${DT.fit.nSites}, the Γ distribution is imitating a class of invariable sites. It is harmless for dating, but α will mix poorly in the MCMC; the model without Γ is a sensible alternative.`));
  }

  /* ================================================================ 2 · calibrations */
  function addCalibration(c) {
    const n = DT.calibs.length + 1;
    DT.calibs.push(Object.assign({ label: 'C' + n, a: 0, b: Math.min(1, (DT.tips ? DT.tips.labels.length : 2) - 1), where: 'crown', kind: 'fossil', min: '', max: '', shape: 'lognormal', mean: '', sd: '', geo: '' }, c || {}));
  }

  function geoOptions() {
    const opts = ['<option value="">— geological unit —</option>'];
    ['period', 'epoch', 'stage'].forEach(rank => {
      opts.push(`<optgroup label="${rank === 'stage' ? 'Stages (Cenozoic, Cretaceous)' : rank.charAt(0).toUpperCase() + rank.slice(1) + 's'}">`);
      GeoTime.UNITS.filter(u => u.rank === rank && u.base <= 300).forEach(u => opts.push(`<option value="${esc(u.name)}">${esc(u.name)} (${u.base}–${u.top} Ma)</option>`));
      opts.push('</optgroup>');
    });
    return opts.join('');
  }

  function renderCalibrations() {
    const host = el('dtCalibTable');
    if (!host) return;
    host.innerHTML = '';
    if (!DT.tips) return;
    if (!DT.calibs.length) addCalibration();
    const labels = DT.tips.labels;
    const tipOpts = sel => labels.map((l, i) => `<option value="${i}" ${i === sel ? 'selected' : ''}>${esc(l)}</option>`).join('');
    const t = mk('table');
    t.innerHTML = '<thead><tr><th>Name</th><th>Clade: MRCA of</th><th>and</th><th>Node</th><th>Evidence</th><th>Min / mean (Ma)</th><th>Max / SD (Ma)</th><th>Prior shape</th><th>From the stratigraphy</th><th>Prior 95%</th><th></th></tr></thead>';
    const tb = mk('tbody');
    DT.calibs.forEach((c, i) => {
      const tr = mk('tr');
      const secondary = c.kind === 'secondary';
      tr.innerHTML = `
        <td><input type="text" data-k="label" value="${esc(c.label)}" style="width:60px"></td>
        <td><select data-k="a">${tipOpts(c.a)}</select></td>
        <td><select data-k="b">${tipOpts(c.b)}</select></td>
        <td><select data-k="where"><option value="crown" ${c.where === 'crown' ? 'selected' : ''}>crown</option><option value="stem" ${c.where === 'stem' ? 'selected' : ''}>stem</option></select></td>
        <td><select data-k="kind"><option value="fossil" ${!secondary ? 'selected' : ''}>fossil (minimum)</option><option value="secondary" ${secondary ? 'selected' : ''}>secondary (published age)</option></select></td>
        <td><input type="number" data-k="${secondary ? 'mean' : 'min'}" value="${esc(secondary ? c.mean : c.min)}" step="any" style="width:80px" placeholder="${secondary ? 'mean' : 'min'}"></td>
        <td><input type="number" data-k="${secondary ? 'sd' : 'max'}" value="${esc(secondary ? c.sd : c.max)}" step="any" style="width:80px" placeholder="${secondary ? 'SD' : 'max (optional)'}"></td>
        <td>${secondary ? '<span class="hint" style="margin:0">normal</span>' : `<select data-k="shape"><option value="lognormal" ${c.shape === 'lognormal' ? 'selected' : ''}>lognormal (offset)</option><option value="exponential" ${c.shape === 'exponential' ? 'selected' : ''}>exponential (offset)</option><option value="uniform" ${c.shape === 'uniform' ? 'selected' : ''}>uniform (needs max)</option></select>`}</td>
        <td>${secondary ? '' : `<select data-k="geo" style="max-width:190px">${geoOptions()}</select>`}</td>
        <td class="dt-prior"></td>
        <td><button class="rm" type="button" title="Remove">✕</button></td>`;
      tr.querySelectorAll('[data-k]').forEach(inp => {
        if (inp.dataset.k === 'geo') inp.value = c.geo || '';
        inp.addEventListener('change', () => {
          const k = inp.dataset.k;
          c[k] = ['a', 'b'].includes(k) ? Number(inp.value) : inp.value;
          if (k === 'geo' && inp.value) {
            const u = GeoTime.byName(inp.value);
            /* the rock is at most as old as the base and at least as young as the top of the unit:
               the youngest possible age is the defensible minimum */
            if (u) { c.min = u.top; }
          }
          if (k === 'kind' || k === 'geo') renderCalibrations(); else updatePrior(tr, c);
        });
      });
      tr.querySelector('.rm').addEventListener('click', () => { DT.calibs.splice(i, 1); renderCalibrations(); });
      updatePrior(tr, c);
      tb.appendChild(tr);
    });
    t.appendChild(tb);
    host.appendChild(t);
  }

  function calSpec(c) {
    if (c.kind === 'secondary') return { type: 'normal', mean: +c.mean, sd: +c.sd };
    const min = c.min === '' ? null : +c.min, max = c.max === '' ? null : +c.max;
    return { type: c.shape === 'uniform' && max == null ? 'lognormal' : c.shape, min, max };
  }

  function cladeNote(c) {
    if (!DT.fit) return '';
    const node = TreeOps.mrca(DT.fit.tree, [c.a, c.b]);
    if (!node) return '';
    const n = TreeOps.tips(node).length;
    if (c.where === 'stem' && node === DT.fit.tree) return '<br><span class="geno-miss">the root has no stem</span>';
    return `<br><span class="geno-miss">clade of ${n} tip${n > 1 ? 's' : ''}${node === DT.fit.tree ? ' (the root)' : ''}</span>`;
  }

  function updatePrior(tr, c) {
    const cell = tr.querySelector('.dt-prior');
    try {
      const sp = calSpec(c);
      if (c.kind === 'secondary' ? !(isFinite(sp.mean) && sp.sd > 0) : sp.min == null) { cell.innerHTML = '<span class="geno-miss">enter the ages</span>' + cladeNote(c); return; }
      if (c.shape === 'uniform' && sp.max == null && c.kind !== 'secondary') { cell.innerHTML = '<span class="geno-miss">uniform needs a maximum — lognormal used</span>' + cladeNote(c); }
      const p = Dating.prepareCalibration(sp);
      cell.innerHTML = `${f2(p.q.q025)}–${f2(p.q.q975)} Ma<br><span class="geno-miss">median ${f2(p.q.q50)}${sp.max == null && c.kind !== 'secondary' ? ' · soft tail set to 10% of the minimum' : ''}</span>` + cladeNote(c);
    } catch (e) { cell.textContent = '—'; }
  }

  /* calibrations mapped on a tree: [{node (flat index), label, …spec}] and nodes flagged for drawing */
  function calibrationsOn(tree) {
    if (DT.mode !== 'calib') return [];
    const F = Dating.flatten(tree);
    const ix = TreeOps.index(tree);
    const out = [];
    DT.calibs.forEach(c => {
      const sp = calSpec(c);
      if (c.kind === 'secondary' ? !(isFinite(sp.mean) && sp.sd > 0) : sp.min == null) return;
      let node = TreeOps.mrca(tree, [c.a, c.b]);
      if (!node) return;
      if (c.where === 'stem') { node = ix.parent.get(node); if (!node) throw new Error(`${c.label}: the stem of the root does not exist — use “crown”.`); }
      const k = F.nodes.indexOf(node);
      if (out.some(o => o.node === k)) throw new Error(`${c.label}: two calibrations on the same node.`);
      out.push(Object.assign({ node: k, label: c.label }, sp));
    });
    /* nested calibrations must be compatible */
    out.forEach(a => out.forEach(b => {
      if (a === b) return;
      const na = F.nodes[a.node], nb = F.nodes[b.node];
      if (TreeOps.nodes(na).includes(nb)) {
        const pa = Dating.prepareCalibration(a), pb = Dating.prepareCalibration(b);
        const maxA = pa.hardMax != null ? pa.hardMax : pa.q.q975, minB = pb.hardMin != null ? pb.hardMin : pb.q.q025;
        if (maxA != null && minB != null && maxA < minB) throw new Error(`${a.label} is older than ${b.label} in the tree, but its ages are younger: check them.`);
      }
    }));
    return out;
  }

  function rateSpec() {
    if (DT.mode !== 'rate') return null;
    const m = Number(el('dtRateMean').value), s = Number(el('dtRateSd').value);
    if (!(m > 0)) throw new Error('Enter the substitution rate (per site per million years).');
    return { mean: m, sd: s > 0 ? s : m * 0.1 };
  }

  /* ================================================================ 3 · run */
  async function runLSD() {
    if (!DT.fit || DT.running) return;
    clearMessages('dtRunMessages');
    const btn = el('btnDtLSD'); btn.disabled = true; btn.textContent = 'Dating…';
    try {
      const calibs = calibrationsOn(DT.fit.tree);
      const rate = rateSpec();
      if (!calibs.length && !rate) throw new Error('Add at least one calibration with its ages, or switch to a known substitution rate.');
      const t0 = performance.now();
      const res = await Dating.runInWorker('lsd', { tree: DT.fit.tree, L: DT.fit.nSites, calibs, rate, reps: Number(el('dtLsdReps').value) || 0, rateSigma: Number(el('dtLsdSigma').value) || 0, seed: Number(el('dtSeed').value) || 1 });
      res.tree = decorate(res.tree, calibs);
      res.seconds = (performance.now() - t0) / 1000;
      res.calibs = calibs; res.rateSpec = rate;
      DT.lsd = res;
      showResult('lsd');
    } catch (e) { console.error(e); showMessage('dtRunMessages', 'error', esc(e.message)); }
    finally { btn.disabled = false; btn.textContent = 'Run LSD'; }
  }

  async function runMCMC() {
    if (!DT.fit || DT.running) return;
    clearMessages('dtRunMessages');
    let calibs, rate;
    try {
      calibs = calibrationsOn(DT.fit.tree);
      rate = rateSpec();
      if (!calibs.length && !rate) throw new Error('Add at least one calibration with its ages, or switch to a known substitution rate.');
      if (el('dtTreePrior').value === 'yule' && !rate && !calibs.some(c => c.node === 0) && !(Number(el('dtRootMax').value) > 0) && !calibs.some(c => c.type === 'normal' || c.max != null))
        showMessage('dtRunMessages', 'warning', 'No calibration bounds the root from above: with only minimum ages the dates can drift older. Give a maximum for one calibration, a secondary calibration, or the maximum root age.');
    } catch (e) { showMessage('dtRunMessages', 'error', esc(e.message)); return; }
    DT.running = true;
    el('btnDtMCMC').disabled = true; el('btnDtLSD').disabled = true; el('btnDtCancel').style.display = '';
    el('dtProgress').style.display = '';
    const iterations = Math.max(10000, Number(el('dtIter').value) || 200000);
    const t0 = performance.now();
    try {
      /* start from the LSD solution, which already respects the calibrations */
      let initAges = null;
      try {
        const quick = Dating.lsd(DT.fit.tree, DT.fit.nSites, calibs, { reps: 0, rate });
        initAges = Dating.flatten(quick.tree).nodes.map(nd => nd.age || 0);
      } catch (e) { initAges = null; }
      const payload = {
        tree: DT.fit.tree, seqs: DT.tips.seqs, spec: DT.fit.spec, calibs, rate,
        clock: el('dtClock').value, treePrior: el('dtTreePrior').value, rootMax: Number(el('dtRootMax').value) || null,
        iterations, burnin: (Number(el('dtBurn').value) || 25) / 100, seed: Number(el('dtSeed').value) || 1,
        samplePrior: el('dtPriorOnly').checked, initAges,
      };
      const res = await Dating.runInWorker('mcmc', payload, (f, info) => {
        el('dtProgressBar').style.width = (f * 100).toFixed(1) + '%';
        const eta = info && info.elapsed && f > 0.01 ? info.elapsed * (1 - f) / f : null;
        el('dtProgressText').textContent = `${Math.round(f * 100)}% · root ${info ? f2(info.rootAge) : '—'} Ma · ln L ${info ? info.lnL.toFixed(1) : '—'}${eta != null ? ` · about ${eta < 90 ? Math.round(eta) + ' s' : Math.round(eta / 60) + ' min'} left` : ''}`;
      });
      res.tree = decorate(attachLabels(res.tree), calibs);
      res.calibs = calibs; res.rateSpec = rate; res.payload = { clock: payload.clock, treePrior: payload.treePrior, iterations, burnin: payload.burnin, seed: payload.seed, samplePrior: payload.samplePrior };
      res.wall = (performance.now() - t0) / 1000;
      DT.mcmc = res;
      showResult('mcmc');
    } catch (e) {
      console.error(e);
      showMessage('dtRunMessages', e.message === 'cancelled' ? 'info' : 'error', e.message === 'cancelled' ? 'The MCMC was cancelled.' : 'The MCMC failed: ' + esc(e.message));
    } finally {
      DT.running = false;
      el('btnDtMCMC').disabled = false; el('btnDtLSD').disabled = false; el('btnDtCancel').style.display = 'none';
      el('dtProgress').style.display = 'none';
    }
  }

  /* labels and calibration flags on a dated tree (flat order is the same as on the fitted tree) */
  function decorate(tree, calibs) {
    attachLabels(tree);
    const F = Dating.flatten(tree);
    calibs.forEach(c => { const nd = F.nodes[c.node]; if (nd) { nd.calib = c.label; nd.calibLabel = c.label; } });
    return tree;
  }

  /* ================================================================ results */
  function showResult(which) {
    const avail = [];
    if (DT.fit) avail.push(['ml', `Maximum-likelihood tree (${modelName(DT.fit.spec)}, substitutions per site)`]);
    if (DT.lsd) avail.push(['lsd', 'Dated tree · LSD']);
    if (DT.mcmc) avail.push(['mcmc', DT.mcmc.samplePrior ? 'Dated tree · MCMC sampling the prior only' : 'Dated tree · Bayesian MCMC']);
    const sel = el('dtShown');
    sel.innerHTML = avail.map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join('');
    if (!avail.length) return;
    if (!avail.some(a => a[0] === which)) which = avail[avail.length - 1][0];
    sel.value = which;
    DT.shown = which;
    el('dtResults').style.display = '';
    const timed = which !== 'ml';
    el('btnDtNexus').disabled = !timed; el('btnDtNewickOut').disabled = false; el('btnDtCSV').disabled = !timed;
    el('btnDtLog').style.display = which === 'mcmc' ? '' : 'none';
    el('dtResultsTitle').textContent = timed ? 'The dated tree' : 'The tree to be dated';
    renderTiles(which);
    renderInterpretation(which);
    drawTree(which);
    renderNodeTable(which);
    renderDiagnostics(which);
  }

  function current(which) { return which === 'lsd' ? DT.lsd : which === 'mcmc' ? DT.mcmc : null; }

  function renderTiles(which) {
    const tiles = [];
    const T = DT.tips;
    tiles.push(['Tips', T.labels.length, T.mode === 'haplotypes' ? 'haplotypes' : 'sequences']);
    tiles.push(['Model', modelName(DT.fit.spec), `ln L = ${DT.fit.lnL.toFixed(1)}`]);
    if (which === 'lsd') {
      const R = DT.lsd;
      tiles.push(['Root age', f2(R.rootAge) + ' Ma', R.rootCI ? `95% CI ${f2(R.rootCI[0])}–${f2(R.rootCI[1])}` : '']);
      tiles.push(['Rate', fRate(R.rate), R.rateCI ? `subs/site/Myr · ${fRate(R.rateCI[0])}–${fRate(R.rateCI[1])}` : 'subs/site/Myr']);
    } else if (which === 'mcmc') {
      const R = DT.mcmc, p = R.params;
      tiles.push(['Root age', f2(p.rootAge.median) + ' Ma', p.rootAge.hpd ? `95% HPD ${f2(p.rootAge.hpd[0])}–${f2(p.rootAge.hpd[1])}` : '']);
      tiles.push(['Mean rate', fRate(p.rate.mean), p.rate.hpd ? `${fRate(p.rate.hpd[0])}–${fRate(p.rate.hpd[1])}` : '']);
      if (p.sigma) tiles.push(['Rate heterogeneity σ', p.sigma.mean.toFixed(3), `95% HPD ${p.sigma.hpd[0].toFixed(3)}–${p.sigma.hpd[1].toFixed(3)}`, p.sigma.hpd[0] < 0.1 ? 'ok' : 'warn']);
      const minEss = Math.min(...Object.values(p).map(v => v.ess || Infinity), ...R.internal.map(k => R.nodeSummary[k].ess));
      tiles.push(['Lowest ESS', Math.round(minEss), minEss >= 200 ? 'enough (≥ 200)' : 'too low: run a longer chain', minEss >= 200 ? 'ok' : 'warn']);
    } else {
      const len = TreeOps.nodes(DT.fit.tree).reduce((s, nd) => s + nd.children.reduce((a, c) => a + c.len, 0), 0);
      tiles.push(['Tree length', len.toFixed(4), 'substitutions per site']);
      tiles.push(['Sites', DT.fit.nSites, `${DT.fit.variable} variable, ${DT.fit.nPatterns} patterns`]);
    }
    statTiles('dtTiles', tiles);
  }

  function renderInterpretation(which) {
    const parts = [];
    const R = current(which);
    if (which === 'ml') {
      parts.push(`<p>The tree was ${el('dtTopo').value === 'newick' ? 'imported' : 'built by neighbour-joining on K2P distances'}, rooted ${DT.outgroup ? 'with the outgroup ' + DT.outgroup.map(i => '<i>' + esc(DT.tips.labels[i]) + '</i>').join(', ') : 'at the midpoint'}, and its branch lengths were re-estimated by maximum likelihood under <b>${modelName(DT.fit.spec)}</b>${DT.models ? ` (lowest AICc of the eight models compared on this topology)` : ''}. Now set the clock in step 2 and date it in step 3.</p>`);
    } else if (which === 'lsd') {
      parts.push(`<p><b>Least-squares dating</b> places the root at <b>${f2(R.rootAge)} Ma</b>${R.rootCI ? ` (95% confidence interval ${f2(R.rootCI[0])}–${f2(R.rootCI[1])} Ma)` : ''}, in the ${esc(GeoTime.describe(R.rootAge))}, with a substitution rate of ${fRate(R.rate)} per site per million years${R.rateSpec ? ` (given as ${fRate(R.rateSpec.mean)} ± ${fRate(R.rateSpec.sd)}; its uncertainty is included in the interval)` : ' (estimated from the calibrations)'}. LSD assumes a strict clock${R.rateSpec ? '' : ' and treats the calibrations as hard bounds'}; its intervals come from resampling the branch lengths with a lognormal rate variation of σ = ${el('dtLsdSigma').value} among branches, so they widen with the rate heterogeneity you allow. Use it to explore; report the Bayesian dates.</p>`);
    } else {
      const p = R.params;
      const lowEss = R.internal.filter(k => R.nodeSummary[k].ess < 200).length;
      parts.push(`<p>${R.samplePrior ? '<b>These are the priors, not the results:</b> the chain ignored the sequences. Compare each calibrated node with the run on the data — where the two look alike, the sequences say little about that age. The effective prior of a calibration can differ from the one entered, because calibrations interact with each other and with the tree prior. ' : ''}The Bayesian analysis (${R.clock === 'ucln' ? 'uncorrelated lognormal relaxed clock' : 'strict clock'}, ${R.treePrior === 'yule' ? 'Yule tree prior' : 'constant-size coalescent prior'}, ${R.iterations.toLocaleString('en-US')} generations, ${Math.round(R.burnin / R.iterations * 100)}% burn-in) dates the root to <b>${f2(p.rootAge.median)} Ma</b> (median; 95% HPD ${f2(p.rootAge.hpd[0])}–${f2(p.rootAge.hpd[1])} Ma), in the ${esc(GeoTime.describe(p.rootAge.median))}.</p>`);
      if (p.sigma) parts.push(`<p>The rate heterogeneity among branches is σ = ${p.sigma.mean.toFixed(3)} (95% HPD ${p.sigma.hpd[0].toFixed(3)}–${p.sigma.hpd[1].toFixed(3)}). ${p.sigma.hpd[0] < 0.05 ? 'Its interval reaches values near zero: the data are compatible with a strict clock.' : p.sigma.mean > 1 ? 'Rates differ strongly among lineages (σ > 1): dates depend heavily on the calibrations, and nodes far from them are uncertain.' : 'Rates vary moderately among lineages, which the relaxed clock accommodates.'}</p>`);
      parts.push(`<p>${lowEss ? `<b>${lowEss} node age${lowEss > 1 ? 's have' : ' has'} an effective sample size below 200</b>: the chain has not explored the posterior well enough — run it longer (or with another seed and compare) before reporting.` : 'Every node age has an effective sample size of at least 200, the usual threshold for MCMC diagnostics.'} ${R.treePrior === 'coalescent' ? 'Within a species, node ages are coalescence times of the gene copies, which are older than the splits between populations that carry them.' : ''}</p>`);
    }
    el('dtInterpret').innerHTML = parts.join('');
  }

  function treeSpecFor(which) {
    const T = DT.tips, d = state.data;
    const tree = which === 'ml' ? DT.fit.tree : current(which).tree;
    const spec = {
      root: tree, timed: which !== 'ml', hasCalibrations: which !== 'ml' && (current(which).calibs || []).length > 0,
      tipLabel: i => T.labels[i], rings: [],
      note: which === 'ml' ? `${modelName(DT.fit.spec)} · branch lengths in substitutions per site` : `${which === 'lsd' ? 'LSD' : 'Bayesian MCMC'} · ages in Ma · ${GeoTime.CHART}`,
    };
    if (T.popNames && T.groupOf) {
      spec.tipGroup = i => T.groupOf[i]; spec.groupNames = T.popNames; spec.groupWord = 'Population';
      if (T.shares) spec.rings.push({ key: 'pops', title: 'Populations sharing the haplotype', kind: 'q', names: T.popNames, of: i => T.shares[i], colour: k => Fig.color(Prefs.get('figstyle', {}).palette || 'cluster', k) });
    }
    return spec;
  }

  function drawTree(which) {
    const T = treeSpecFor(which);
    const n = DT.tips.labels.length;
    try {
      Fig.mount('fig8TimeTree', {
        title: which === 'ml' ? 'Maximum-likelihood tree' : 'Dated tree', fileName: which === 'ml' ? 'ml_tree' : 'dated_tree_' + which, width: 900, height: 900,
        defaults: TV.defaults(T, {
          title: which === 'ml' ? 'Maximum-likelihood tree (rooted)' : 'Divergence times', layout: n > 40 ? 'circular' : 'rect', height: n > 40 ? 900 : 480,
          colourBy: T.tipGroup ? 'groups' : 'clusters', k: Math.min(4, Math.max(2, Math.round(n / 6))), italic: DT.tips.mode === 'sequences',
          ring_pops: !!T.rings.length, rowH: n > 60 ? 10 : 20, labelSize: n > 80 ? 7 : 10, support: 'none', geoScale: n > 40 ? 'epoch' : 'both', openAngle: 30,
          cladeShade: T.tipGroup ? false : true, calibMarks: true, nodeAges: which !== 'ml' && n <= 40,
        }),
        controls: TV.controls(T),
        render: cfg => TV.render(cfg, T),
      });
    } catch (e) { console.error(e); el('fig8TimeTree').innerHTML = `<div class="msg msg-error">${esc(e.message)}</div>`; }
  }

  function cladeText(node) {
    const names = TreeOps.tips(node).map(t => DT.tips.labels[t.tip]);
    return names.length <= 4 ? names.join(', ') : `${names.slice(0, 3).join(', ')} … (${names.length} tips)`;
  }

  function renderNodeTable(which) {
    if (which === 'ml') { el('dtNodeTable').innerHTML = '<p class="hint" style="padding:6px 12px">Date the tree to see the ages.</p>'; return; }
    const R = current(which);
    const nodesAll = TreeOps.nodes(R.tree).filter(nd => nd.tip == null);
    const rows = nodesAll.map(nd => ({ nd, clade: cladeText(nd), age: nd.age, lo: nd.hpd ? nd.hpd[0] : null, hi: nd.hpd ? nd.hpd[1] : null, ess: nd.ess, calib: nd.calib || '', geo: GeoTime.describe(nd.age) }))
      .sort((a, b) => b.age - a.age);
    const cols = [
      { key: 'clade', label: 'Clade (tips)' },
      { key: 'age', label: which === 'mcmc' ? 'Median age (Ma)' : 'Age (Ma)', num: true, fmt: f2 },
      { key: 'lo', label: which === 'mcmc' ? '95% HPD from' : '95% CI from', num: true, fmt: f2 },
      { key: 'hi', label: 'to', num: true, fmt: f2 },
      { key: 'geo', label: 'Epoch' },
    ];
    if (which === 'mcmc') cols.push({ key: 'ess', label: 'ESS', num: true, html: true, get: r => (r.ess == null ? '—' : r.ess < 200 ? `<span style="color:var(--danger);font-weight:700">${Math.round(r.ess)}</span>` : String(Math.round(r.ess))) });
    cols.push({ key: 'calib', label: 'Calibration', html: true, get: r => (r.calib ? `<span class="pill domin">${esc(r.calib)}</span>` : '') });
    if (isDatingExample()) {
      rows.forEach(r => { r.truth = trueAge(r.nd); r.inside = r.truth == null || r.lo == null ? null : r.truth >= r.lo && r.truth <= r.hi; });
      cols.push({ key: 'truth', label: 'Simulated age (Ma)', num: true, html: true,
        get: r => (r.truth == null ? '<span class="geno-miss">clade not in the true tree</span>' : `${f2(r.truth)} ${r.inside == null ? '' : r.inside ? '<span style="color:var(--success)">✓ inside</span>' : '<span style="color:var(--danger)">✗ outside</span>'}`) });
    }
    buildTable('dtNodeTable', cols, rows, { limit: 300 });
    if (isDatingExample()) {
      const judged = rows.filter(r => r.inside != null);
      if (judged.length) el('dtNodeTable').appendChild(mk('p', { class: 'hint', style: 'padding:6px 12px;margin:0' },
        `${judged.filter(r => r.inside).length} of ${judged.length} simulated ages fall inside the ${which === 'mcmc' ? '95% HPD' : '95% CI'}. About 95% is expected over many data sets; in a single one a few misses are normal.`));
    }
  }

  function renderDiagnostics(which) {
    const wrap = el('dtMcmcDiag');
    if (which !== 'mcmc') { wrap.style.display = 'none'; el('fig8Trace').innerHTML = ''; el('fig8Calib').innerHTML = ''; return; }
    wrap.style.display = '';
    const R = DT.mcmc, p = R.params;
    const rows = Object.entries(p).map(([k, v]) => ({ name: { lnL: 'log likelihood', posterior: 'log posterior', rate: 'mean clock rate', rootAge: 'root age (Ma)', sigma: 'rate heterogeneity σ', kappa: 'κ (ts/tv)', alpha: 'Γ shape α', lambda: 'Yule birth rate λ', theta: 'coalescent Θ (Ma)' }[k] || k, mean: v.mean, lo: v.hpd ? v.hpd[0] : null, hi: v.hpd ? v.hpd[1] : null, ess: v.ess }));
    buildTable('dtEssTable', [
      { key: 'name', label: 'Parameter' }, { key: 'mean', label: 'Mean', num: true, fmt: v => (Math.abs(v) < 0.01 ? v.toExponential(3) : v.toFixed(3)) },
      { key: 'lo', label: '95% HPD from', num: true, fmt: v => (Math.abs(v) < 0.01 ? v.toExponential(3) : v.toFixed(3)) }, { key: 'hi', label: 'to', num: true, fmt: v => (Math.abs(v) < 0.01 ? v.toExponential(3) : v.toFixed(3)) },
      { key: 'ess', label: 'ESS', num: true, html: true, get: r => (r.ess == null ? '—' : r.ess < 200 ? `<span style="color:var(--danger);font-weight:700">${Math.round(r.ess)}</span>` : String(Math.round(r.ess))) },
    ], rows);
    const pal = { key: 'palette', label: 'Palette', type: 'select', options: Object.entries(Fig.paletteNames), shared: true };
    const traceKeys = [['lnL', 'log likelihood'], ['rootAge', 'root age (Ma)'], ['rate', 'mean rate'], ['posterior', 'log posterior']].concat(p.sigma ? [['sigma', 'σ']] : []);
    Fig.mount('fig8Trace', {
      title: 'Trace of the chain', fileName: 'mcmc_trace', width: 620, height: 380,
      defaults: { palette: 'cluster', param: 'lnL', title: 'Trace after burn-in' },
      controls: [{ key: 'title', label: 'Title', type: 'text' }, { key: 'param', label: 'Parameter', type: 'select', options: traceKeys }, pal],
      render: cfg => P8D.trace(cfg, { x: R.trace.state, y: R.trace[cfg.param], name: (traceKeys.find(t => t[0] === cfg.param) || [])[1] }),
    });
    if (R.calibs && R.calibs.length) {
      Fig.mount('fig8Calib', {
        title: 'Calibrations: prior entered and posterior', fileName: 'calibration_densities', width: 620, height: 380,
        defaults: { palette: 'cluster', title: R.samplePrior ? 'Prior entered and effective prior' : 'Prior entered and posterior age' },
        controls: [{ key: 'title', label: 'Title', type: 'text' }, pal],
        render: cfg => P8D.calib(cfg, R.calibs.map(c => {
          const j = R.internal.indexOf(c.node);
          return { label: c.label, samples: j >= 0 ? R.trace && R.nodeSamples ? R.nodeSamples[j] : null : null, cal: Dating.prepareCalibration(c), summary: R.nodeSummary[c.node] };
        }), R),
      });
    } else el('fig8Calib').innerHTML = '';
  }

  /* ================================================================ exports */
  /* the export texts are built apart from the buttons, so Block 10 can put them in its ZIP */
  function treeFile(fmt, which) {
    const tree = which === 'ml' ? DT.fit.tree : current(which).tree;
    const base = slug(state.fileName) + '_' + (which === 'ml' ? 'ml_tree' : 'dated_' + which);
    const labelOf = t => DT.tips.labels[t.tip];
    let out = tree;
    if (which !== 'ml') {
      /* chronogram: branch lengths in Ma, in the Newick and in the NEXUS, so that a tree viewer
         draws the ages and their intervals on the same time axis as the branches */
      out = TreeOps.clone(tree);
      const walk = nd => nd.children.forEach(c => { c.len = Math.max(0, (nd.age || 0) - (c.node.age || 0)); walk(c.node); });
      walk(out);
    }
    if (fmt === 'nexus') return { name: base + '.nex', data: TreeOps.toNexus(out, labelOf, base) };
    return { name: base + '.nwk', data: TreeOps.toNewick(out, { labelOf, support: false }) + '\n' };
  }
  function exportTree(fmt) { const f = treeFile(fmt, DT.shown); download(f.data, f.name, 'text/plain;charset=utf-8'); }

  function nodeAgesFile(which) {
    const R = current(which); if (!R) return null;
    const rows = TreeOps.nodes(R.tree).filter(nd => nd.tip == null).map(nd => [TreeOps.tips(nd).map(t => DT.tips.labels[t.tip]).join(' | '), TreeOps.tips(nd).length, nd.age, nd.hpd ? nd.hpd[0] : '', nd.hpd ? nd.hpd[1] : '', nd.ess != null ? Math.round(nd.ess) : '', nd.calib || '', GeoTime.describe(nd.age)]);
    return { name: slug(state.fileName) + '_node_ages_' + which + '.csv', data: matrixToCSV(['Clade', 'Tips', which === 'mcmc' ? 'Median age (Ma)' : 'Age (Ma)', 'Lower 95%', 'Upper 95%', 'ESS', 'Calibration', 'Epoch'], rows.map(r => r.map(v => (typeof v === 'number' ? +v.toFixed(6) : v)))) };
  }
  function exportCSV() { const f = nodeAgesFile(DT.shown); if (f) download(f.data, f.name, 'text/csv;charset=utf-8'); }

  function exportLog() { const f = logFile(); if (f) download(f.data, f.name, 'text/plain;charset=utf-8'); }
  function logFile() {
    const R = DT.mcmc; if (!R) return null;
    const keys = ['posterior', 'lnL', 'prior', 'rate'].concat(R.clock === 'ucln' ? ['sigma'] : []).concat(DT.fit.spec.model === 'HKY' || DT.fit.spec.model === 'K80' ? ['kappa'] : []).concat(DT.fit.spec.alpha ? ['alpha'] : []).concat(['treeParam', 'rootAge']);
    const names = { lnL: 'log_likelihood', rate: 'clock_rate', sigma: 'rate_sigma', treeParam: R.treePrior === 'yule' ? 'birth_rate' : 'theta', rootAge: 'root_age' };
    const F = Dating.flatten(R.tree);
    const nodeCols = R.internal.filter(k => k !== 0).map(k => ({ k, name: 'height(' + cladeText(F.nodes[k]).replace(/\s+/g, '_').slice(0, 40) + ')' }));
    const header = ['state'].concat(keys.map(k => names[k] || k)).concat(nodeCols.map(c => c.name));
    const lines = [header.join('\t')];
    for (let s = 0; s < R.trace.state.length; s++) {
      lines.push([R.trace.state[s]].concat(keys.map(k => R.trace[k][s])).concat(nodeCols.map(c => R.nodeSamples[R.internal.indexOf(c.k)][s])).join('\t'));
    }
    return { name: slug(state.fileName) + '_mcmc.log', data: '# PopGeneticsPro MCMC log (tab-delimited; one column per parameter)\n' + lines.join('\n') + '\n' };
  }

  /* every dating result as files: trees (Newick chronogram and NEXUS), node ages, MCMC log */
  DT.files = () => {
    const out = [];
    if (DT.fit && DT.fit.tree) out.push(treeFile('newick', 'ml'));
    ['lsd', 'mcmc'].forEach(w => { if (current(w)) { out.push(treeFile('newick', w), treeFile('nexus', w)); const f = nodeAgesFile(w); if (f) out.push(f); } });
    const lg = logFile(); if (lg) out.push(lg);
    return out;
  };

  /* methods paragraph for the report, with the settings actually used */
  DT.methodsText = () => {
    if (!DT.fit || !(DT.lsd || DT.mcmc)) return '';
    const T = DT.tips, s = [];
    const model = DT.fit.spec;
    const mName = { JC: 'JC69 (Jukes & Cantor 1969)', K80: 'K80 (Kimura 1980)', HKY: 'HKY85 (Hasegawa, Kishino & Yano 1985)', GTR: 'GTR (Tavaré 1986)' }[model.model];
    s.push(`Divergence times were estimated on a fixed topology of ${T.labels.length} ${T.mode === 'haplotypes' ? 'haplotypes' : 'sequences'} (${el('dtTopo').value === 'newick' ? 'an imported tree' : 'a neighbour-joining tree on Kimura two-parameter distances'}) rooted ${DT.outgroup ? 'with an outgroup' : 'at its midpoint'}, whose branch lengths were re-estimated by maximum likelihood (Felsenstein 1981) under ${mName}${model.alpha ? ' with Γ-distributed rates among sites (four categories; Yang 1994)' : ''}${DT.models ? ', the model with the lowest AICc among JC69, K80, HKY85 and GTR with and without Γ on that topology' : ''}.`);
    const R = DT.mcmc || DT.lsd;
    if (R.rateSpec) s.push(`The clock was set by a substitution rate of ${R.rateSpec.mean} ± ${R.rateSpec.sd} substitutions per site per million years.`);
    else if (R.calibs && R.calibs.length) {
      const describe = c => {
        const node = TreeOps.nodes(DT.fit.tree)[0] && Dating.flatten(DT.fit.tree).nodes[c.node];
        const cal = DT.calibs.find(x => x.label === c.label) || {};
        const what = node === DT.fit.tree ? 'the root' : `the ${cal.where || 'crown'} node of the clade ${cladeText(node)}`;
        if (c.type === 'normal') return `${c.label}, a secondary calibration on ${what} (normal prior, mean ${c.mean} Ma, SD ${c.sd} Ma)`;
        const p = Dating.prepareCalibration(c);
        return `${c.label}, a fossil minimum age on ${what} (${c.type === 'uniform' ? `uniform prior between ${c.min} and ${c.max} Ma` : `${c.type === 'lognormal' ? 'offset lognormal' : 'offset exponential'} prior with minimum ${c.min} Ma${c.max != null ? `, 95% of its density below ${c.max} Ma` : ''}; central 95% interval ${f2(p.q.q025)}–${f2(p.q.q975)} Ma`})`;
      };
      s.push(`The clock was calibrated with ${R.calibs.length} calibration${R.calibs.length > 1 ? 's' : ''}: ${R.calibs.map(describe).join('; ')}. Geological ages follow the ${GeoTime.CHART}.`);
    }
    if (DT.lsd) s.push(`A first estimate was obtained by least-squares dating (To et al. 2016) under a strict clock, with confidence intervals from ${DT.lsd.reps} parametric resamplings of the branch lengths with lognormal rate variation among branches (σ = ${el('dtLsdSigma').value}).`);
    if (DT.mcmc) {
      const M = DT.mcmc;
      s.push(`Bayesian dating used Markov chain Monte Carlo on node ages with ${M.clock === 'ucln' ? 'an uncorrelated lognormal relaxed clock (Drummond et al. 2006)' : 'a strict clock'} and ${M.treePrior === 'yule' ? 'a Yule tree prior conditioned on the root age (Gernhard 2008)' : 'a constant-size coalescent tree prior (Kingman 1982)'}${M.samplePrior ? ', sampling from the prior only' : ''}; the chain ran for ${M.iterations.toLocaleString('en-US')} generations, of which the first ${Math.round(M.burnin / M.iterations * 100)}% were discarded as burn-in, sampling every ${M.thin} generations (seed ${M.payload.seed}). Convergence was assessed with effective sample sizes (threshold 200), and node ages are reported as posterior medians with 95% highest posterior density intervals.`);
    }
    return s.join(' ');
  };

  function openImages() {
    if (!DT.tips) return;
    const names = DT.tips.labels.concat(DT.tips.popNames || []);
    OTUImg.openManager({ names: [...new Set(names)], title: 'Images for the dated tree' });
  }

  /* ================================================================ figures */
  const P8D = {};
  P8D.trace = (cfg, S) => {
    const svg = Fig.svg(cfg.width, cfg.height, cfg.theme);
    const f = Fig.frame(svg, cfg, { margin: { left: 76, right: 20, bottom: 56, top: 50 } });
    const ys = S.y || [];
    if (!ys.length) return svg;
    const dx = [S.x[0], S.x[S.x.length - 1]], dy = Fig.niceDomain(Math.min(...ys), Math.max(...ys));
    const x = Fig.scaleLinear(dx[0], dx[1], f.x0, f.x1), y = Fig.scaleLinear(dy[0], dy[1], f.y1, f.y0);
    Fig.axisY(f, y, Object.assign({}, cfg, { ylab: S.name }));
    Fig.axisX(f, x, Object.assign({}, cfg, { xlab: 'generation' }), { fmt: v => (v >= 1e6 ? (v / 1e6) + 'M' : v >= 1e3 ? (v / 1e3) + 'k' : v) });
    const g = Fig.g();
    g.appendChild(Fig.el('path', { d: ys.map((v, i) => (i ? 'L' : 'M') + x(S.x[i]).toFixed(1) + ' ' + y(v).toFixed(1)).join(' '), fill: 'none', stroke: Fig.color(cfg.palette, 0), 'stroke-width': 0.8, opacity: 0.85 }));
    let acc = 0;
    const run = ys.map((v, i) => { acc += v; return acc / (i + 1); });
    g.appendChild(Fig.el('path', { d: run.map((v, i) => (i ? 'L' : 'M') + x(S.x[i]).toFixed(1) + ' ' + y(v).toFixed(1)).join(' '), fill: 'none', stroke: Fig.color(cfg.palette, 1), 'stroke-width': 2 }));
    f.g.appendChild(g);
    Fig.legend(f, [{ label: 'sample', color: Fig.color(cfg.palette, 0), shape: 'line' }, { label: 'running mean', color: Fig.color(cfg.palette, 1), shape: 'line' }], cfg, { pos: 'right' });
    return svg;
  };
  P8D.calib = (cfg, items) => {
    const svg = Fig.svg(cfg.width, Math.max(cfg.height, 120 + items.length * 90), cfg.theme);
    const f = Fig.frame(svg, cfg, { margin: { left: 70, right: 20, bottom: 50, top: 50 } });
    const rowH = (f.y1 - f.y0) / items.length;
    items.forEach((it, i) => {
      const y0 = f.y0 + i * rowH, y1 = y0 + rowH - 16;
      const smp = it.samples || [];
      const lo = Math.min(it.cal.q.q025 != null ? it.cal.q.q025 : Infinity, ...smp.slice(0, 5000)), hi = Math.max(it.cal.q.q975 != null ? it.cal.q.q975 : -Infinity, ...smp.slice(0, 5000));
      const pad = (hi - lo) * 0.15 || 1;
      const x = Fig.scaleLinear(Math.max(0, lo - pad), hi + pad, f.x0, f.x1);
      const bins = 40, w = (x.domain[1] - x.domain[0]) / bins;
      const counts = new Array(bins).fill(0);
      smp.forEach(v => { const b = Math.floor((v - x.domain[0]) / w); if (b >= 0 && b < bins) counts[b]++; });
      const dens = counts.map(c => c / Math.max(1, smp.length) / w);
      const prior = []; for (let b = 0; b <= 120; b++) { const v = x.domain[0] + (x.domain[1] - x.domain[0]) * b / 120; prior.push([v, Math.exp(Dating.calLogDensity(it.cal, v))]); }
      const ymax = Math.max(1e-12, ...dens, ...prior.map(p => (isFinite(p[1]) ? p[1] : 0)));
      const y = v => y1 - (v / ymax) * (y1 - y0 - 14);
      const g = Fig.g();
      dens.forEach((dv, b) => { if (dv > 0) g.appendChild(Fig.el('rect', { x: x(x.domain[0] + b * w), y: y(dv), width: Math.max(0.5, x(x.domain[0] + w) - x(x.domain[0]) - 0.6), height: y1 - y(dv), fill: Fig.alpha(Fig.color(cfg.palette, 0), 0.55) })); });
      g.appendChild(Fig.el('path', { d: prior.map((p, k) => (k ? 'L' : 'M') + x(p[0]).toFixed(1) + ' ' + y(isFinite(p[1]) ? p[1] : 0).toFixed(1)).join(' '), fill: 'none', stroke: Fig.color(cfg.palette, 1), 'stroke-width': 2 }));
      g.appendChild(Fig.el('line', { x1: f.x0, x2: f.x1, y1: y1, y2: y1, stroke: f.t.axis }));
      Fig.ticks(x.domain[0], x.domain[1], 6).forEach(v => { g.appendChild(Fig.el('line', { x1: x(v), x2: x(v), y1: y1, y2: y1 + 4, stroke: f.t.axis })); g.appendChild(Fig.text(x(v), y1 + 14, Fig.fmtTick(v), { size: 9, anchor: 'middle', fill: f.t.fg, font: f.font, role: 'tick' })); });
      g.appendChild(Fig.text(f.x0 - 8, (y0 + y1) / 2, it.label, { size: 12, weight: 'bold', anchor: 'end', fill: f.t.fg, font: f.font, role: 'label' }));
      f.g.appendChild(g);
    });
    f.g.appendChild(Fig.text(f.x1, f.y1 + 30, 'age (Ma)', { size: 11, anchor: 'end', fill: f.t.fg, font: f.font, role: 'axis' }));
    Fig.legend(f, [{ label: 'calibration prior entered', color: Fig.color(cfg.palette, 1), shape: 'line' }, { label: 'MCMC samples of the node', color: Fig.alpha(Fig.color(cfg.palette, 0), 0.55) }], cfg, { pos: 'right' });
    return svg;
  };
  window.P8D = P8D;

  document.addEventListener('DOMContentLoaded', init);
})();
