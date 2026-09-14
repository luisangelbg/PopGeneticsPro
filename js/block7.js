/* PopGeneticsPro — Block 7: Bayesian admixture clustering, DAPC and
   assignment tests. The MCMC runs in a Web Worker; everything else is quick. */

(function () {

  const B7 = { struct: null, dapc: null, assign: null, worker: null, running: false };
  window.B7 = B7;

  function init() {
    if (!el('btnRunStruct')) return;
    el('btnRunStruct').addEventListener('click', runStructure);
    el('btnCancelStruct').addEventListener('click', cancelStructure);
    /* a new K lists its own runs first, then draws the consensus */
    el('structKShown').addEventListener('change', () => { fillRunSelect(); drawBarplot(); });
    el('structRunShown').addEventListener('change', drawBarplot);
    el('btnQCSV').addEventListener('click', downloadQ);
    el('btnRunDapc').addEventListener('click', runDapc);
    el('dapcMode').addEventListener('change', () => { el('dapcKmaxRow').style.display = el('dapcMode').value === 'find' ? '' : 'none'; });
    el('btnDapcCSV').addEventListener('click', downloadDapc);
    el('btnRunAssign').addEventListener('click', runAssign);
    el('btnAssignCSV').addEventListener('click', downloadAssign);
    el('btnContinue7').addEventListener('click', () => continueAfter(7, 'structMessages'));
    document.addEventListener('stepchange', e => { if (String(e.detail.step) === '7') onEnter(); });
  }

  function onEnter() {
    const d = state.data;
    if (!d) { showMessage('structMessages', 'error', 'Load your data in Block 2 first.'); return; }
    const hasPops = d.declaredPops && !d.singletons && d.pops.filter(p => p.idx.length >= 2).length >= 2;
    el('structKmax').value = Math.min(10, Math.max(3, (hasPops ? d.pops.length : 3) + 2));
    el('structModel').value = 'admixture';
    el('dapcMode').value = hasPops ? 'pops' : 'find';
    el('dapcMode').querySelector('option[value="pops"]').disabled = !hasPops;
    el('dapcKmaxRow').style.display = el('dapcMode').value === 'find' ? '' : 'none';
    el('assignCard').style.display = hasPops && d.pops.filter(p => p.idx.length >= 5).length >= 2 ? '' : 'none';
    el('structNote').innerHTML = d.kind === 'codominant'
      ? `${d.nInd} ${UNIT()}, ${d.nLoci} loci, ${d.ploidy === 2 ? 'diploid' : 'ploidy ' + d.ploidy} genotypes.`
      : `${d.nInd} ${UNIT()}, ${d.nLoci} ${d.kind === 'dominant' ? 'bands, treated as haploid loci (each band present/absent is one gene copy)' : 'haploid loci'}.`;
    /* reset cached results when the dataset changed */
    if (state.struct == null) { B7.struct = null; el('structResults').style.display = 'none'; }
    if (state.dapc == null) { B7.dapc = null; el('dapcResults').style.display = 'none'; }
    if (state.assign == null) { B7.assign = null; el('assignResults').style.display = 'none'; }
  }

  /* ================================================================
     Bayesian admixture clustering
     ================================================================ */
  function prepareData(d) {
    return Struct.prepare(d.geno, d.nInd, d.nLoci);
  }

  function runStructure() {
    const d = state.data; if (!d || B7.running) return;
    clearMessages('structMessages');
    const Kmin = Math.max(1, Number(el('structKmin').value) || 1), Kmax = Math.max(Kmin, Number(el('structKmax').value) || 5);
    const reps = Math.max(1, Number(el('structReps').value) || 1);
    const burnin = Number(el('structBurnin').value) || 1000, iters = Number(el('structIters').value) || 2000;
    const admixture = el('structModel').value === 'admixture';
    const seed = Number(el('structSeed').value) || 1;
    const D = prepareData(d);
    const jobs = [];
    for (let K = Kmin; K <= Kmax; K++) for (let rp = 0; rp < reps; rp++) jobs.push({ K, rep: rp, seed: seed * 1000 + K * 37 + rp });
    B7.struct = { D, jobs, results: [], opts: { burnin, iters, admixture, seed }, byK: {}, Kmin, Kmax, reps };
    state.struct = B7.struct;
    B7.running = true;
    el('btnRunStruct').disabled = true; el('btnCancelStruct').style.display = '';
    el('structProgress').style.display = '';
    setProgress(0, `0 of ${jobs.length} runs`);
    const t0 = performance.now();
    const onResult = (msg) => {
      B7.struct.results.push({ K: msg.K, rep: msg.rep, result: msg.result });
      setProgress(B7.struct.results.length / jobs.length, `${B7.struct.results.length} of ${jobs.length} runs · K = ${msg.K} rep ${msg.rep + 1} · Ln P(D) = ${msg.result.lnPD.toFixed(1)}`);
    };
    const onDone = (cancelled) => {
      B7.running = false;
      el('btnRunStruct').disabled = false; el('btnCancelStruct').style.display = 'none';
      el('structProgress').style.display = 'none';
      el('structTiming').textContent = `${B7.struct.results.length} runs in ${((performance.now() - t0) / 1000).toFixed(1)} s` + (cancelled ? ' (cancelled — showing the runs that finished)' : '');
      if (B7.struct.results.length) { summariseStructure(d); renderStructure(d); }
    };
    /* A Web Worker built from the engine's own source (a Blob URL, so it also runs when the app is
       opened by double-click); if the browser refuses it, the runs go on the page itself */
    try {
      if (B7.worker) { B7.worker.terminate(); B7.worker = null; }
      const src = StructCore.toString() + '\nStructCore(self);\n' +
        'self.onmessage = e => {\n' +
        '  const { D, jobs, opts } = e.data;\n' +
        '  for (let j = 0; j < jobs.length; j++) {\n' +
        '    const job = jobs[j];\n' +
        '    const result = self.Struct.run(D, Object.assign({}, opts, { K: job.K, seed: job.seed }), frac => self.postMessage({ type: "progress", job: j, frac }));\n' +
        '    self.postMessage({ type: "result", job: j, K: job.K, rep: job.rep, result });\n' +
        '  }\n' +
        '  self.postMessage({ type: "done" });\n' +
        '};\n';
      const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
      const w = new Worker(url);
      URL.revokeObjectURL(url);
      B7.worker = w;
      B7.finish = onDone;
      let heard = false;
      const fallBack = why => { console.warn(why); w.terminate(); B7.worker = null; B7.struct.results = []; runInline(); };
      /* a worker that never answers (a browser that blocks it silently) must not leave the page waiting */
      setTimeout(() => { if (!heard && B7.worker === w) fallBack('worker silent, running on the page'); }, 8000);
      w.onmessage = e => {
        heard = true;
        const m = e.data;
        if (m.type === 'progress') setProgress((B7.struct.results.length + m.frac) / jobs.length, `run ${B7.struct.results.length + 1} of ${jobs.length} · K = ${jobs[m.job].K} · ${(m.frac * 100).toFixed(0)}%`);
        else if (m.type === 'result') onResult(m);
        else if (m.type === 'done') onDone(false);
      };
      w.onerror = err => { if (!heard) fallBack('worker failed, running on the page: ' + (err && err.message)); };
      w.postMessage({ D, jobs, opts: { burnin, iters, admixture } });
    } catch (e) { console.warn('no worker available', e); runInline(); }

    function runInline() {
      let j = 0;
      const step = () => {
        if (!B7.running) { onDone(true); return; }
        if (j >= jobs.length) { onDone(false); return; }
        const job = jobs[j];
        const result = Struct.run(D, { K: job.K, seed: job.seed, burnin, iters, admixture });
        onResult({ K: job.K, rep: job.rep, result });
        j++;
        setTimeout(step, 10);
      };
      setTimeout(step, 10);
    }
  }
  function cancelStructure() {
    B7.running = false;
    /* the worker is busy inside its loop and would read a "cancel" message only at the end:
       stop it at once and keep the runs that already finished */
    if (B7.worker) { B7.worker.terminate(); B7.worker = null; if (B7.finish) B7.finish(true); }
  }
  function setProgress(frac, text) {
    el('structProgressBar').style.width = (Math.min(1, frac) * 100).toFixed(1) + '%';
    el('structProgressText').textContent = text;
  }

  function summariseStructure(d) {
    const S = B7.struct;
    S.byK = {};
    S.results.forEach(r => { (S.byK[r.K] = S.byK[r.K] || []).push(r.result); });
    const Ks = Object.keys(S.byK).map(Number).sort((a, b) => a - b);
    S.consensus = {};
    Ks.forEach(K => { S.consensus[K] = Struct.consensus(S.byK[K]); });
    S.evanno = Struct.evanno(Ks.map(K => ({ K, lnPD: S.byK[K].map(r => r.lnPD) })));
    /* Puechmaille needs populations */
    const hasPops = d.declaredPops && !d.singletons;
    if (hasPops) {
      const popOf = d.ind.map((_, i) => d.pops.findIndex(p => p.idx.includes(i)));
      S.puech = Ks.map(K => {
        const per = S.byK[K].map(r => Struct.puechmaille(r.Q, popOf, d.pops.length, 0.5));
        const med = arr => { const s = arr.slice().sort((a, b) => a - b), h = s.length >> 1; return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2; };
        return { K, medMeaK: med(per.map(p => p.meaK)), maxMeaK: Math.max(...per.map(p => p.meaK)), medMedK: med(per.map(p => p.medK)), maxMedK: Math.max(...per.map(p => p.medK)) };
      });
    } else S.puech = null;
    S.Ks = Ks;
  }

  function renderStructure(d) {
    const S = B7.struct, E = S.evanno;
    el('structResults').style.display = '';
    /* K table */
    /* how many individuals draw at least 80% of their ancestry from one cluster (consensus Q) */
    const strong = K => S.consensus[K] ? S.consensus[K].Q.filter(q => Math.max(...q) >= 0.8).length : null;
    const rows = E.rows.map(r => Object.assign({}, r, S.puech ? S.puech.find(p => p.K === r.K) : {}, { Hprime: S.consensus[r.K] ? S.consensus[r.K].Hprime : null, strong: strong(r.K) }));
    const cols = [
      { key: 'K', label: 'K', num: true }, { key: 'n', label: 'Runs', num: true },
      { key: 'meanL', label: 'mean Ln P(D)', num: true, fmt: v => v.toFixed(1) }, { key: 'sdL', label: 'SD', num: true, fmt: v => v.toFixed(2) },
      { key: 'L1', label: "L′(K)", num: true, fmt: v => v.toFixed(1) }, { key: 'L2', label: "|L″(K)|", num: true, fmt: v => v.toFixed(1) },
      { key: 'deltaK', label: 'ΔK', num: true, html: true, get: r => r.deltaK == null ? '—' : (r.K === E.bestDelta ? `<b class="geno-het">${r.deltaK.toFixed(2)}</b>` : r.deltaK.toFixed(2)) },
      { key: 'Hprime', label: '<span title="replicate similarity (Jakobsson &amp; Rosenberg 2007)">H′</span>', num: true, fmt: v => v.toFixed(3) },
      { key: 'strong', label: `<span title="${UNIT(true, true)} with at least 80% of their ancestry in one cluster">Q ≥ 0.8</span>`, num: true },
    ];
    if (S.puech) ['medMeaK', 'maxMeaK', 'medMedK', 'maxMedK'].forEach(k => cols.push({ key: k, label: k.replace('med', 'Med').replace('max', 'Max'), num: true }));
    buildTable('structKTable', cols, rows);
    /* K selector and run selector */
    const ks = el('structKShown'); ks.innerHTML = '';
    S.Ks.forEach(K => ks.appendChild(mk('option', { value: String(K) }, 'K = ' + K)));
    const prefer = E.bestDelta || (S.Ks.includes(2) ? 2 : S.Ks[0]);
    ks.value = String(prefer);
    fillRunSelect();
    renderStructureInterpretation(d);
    drawKFigures(d);
    drawBarplot();
  }
  function fillRunSelect() {
    const S = B7.struct; const K = Number(el('structKShown').value);
    const rs = el('structRunShown'); rs.innerHTML = '';
    rs.appendChild(mk('option', { value: 'consensus' }, `consensus of ${S.byK[K].length} run${S.byK[K].length > 1 ? 's' : ''} (aligned)`));
    S.byK[K].forEach((r, i) => rs.appendChild(mk('option', { value: String(i) }, `run ${i + 1} · Ln P(D) = ${r.lnPD.toFixed(1)}`)));
  }

  function renderStructureInterpretation(d) {
    const S = B7.struct, E = S.evanno, parts = [];
    const nRuns = S.results.length, admix = S.opts.admixture;
    parts.push(`<p>${nRuns} MCMC runs (${admix ? 'admixture' : 'no-admixture'} model, independent allele frequencies, ${S.opts.burnin.toLocaleString()} burn-in + ${S.opts.iters.toLocaleString()} sampled iterations each) for K = ${S.Kmin} to ${S.Kmax}, ${S.reps} replicate${S.reps > 1 ? 's' : ''} per K.</p>`);
    if (E.bestDelta != null) {
      const row = E.rows.find(r => r.K === E.bestDelta);
      parts.push(`<p><b>Evanno's ΔK peaks at K = ${E.bestDelta}</b> (ΔK = ${row.deltaK.toFixed(1)}), while the mean Ln P(D) is highest at K = ${E.bestL}. ` +
        `ΔK measures how sharply Ln P(D) changes and finds the uppermost level of structure; by construction it cannot return K = 1 and tends to favour K = 2. Ln P(D) usually rises up to the best-supported K and then levels off or falls while the runs spread apart. ` +
        (E.bestL === 1 ? `Here it is highest at K = 1, so the ΔK peak is not evidence of clusters by itself: accept K = ${E.bestDelta} only if its barplot shows groups of ${UNIT()} assigned mostly (Q above 0.8) to different clusters and the replicates agree.`
          : 'When the two disagree, look at the barplots: the right K is the largest one at which every cluster still has individuals assigned mostly to it.') + `</p>`);
    } else parts.push(`<p>ΔK could not be computed: it needs at least three consecutive K values and two replicates per K (for the standard deviation). Mean Ln P(D) is highest at K = ${E.bestL}.</p>`);
    if (S.puech) {
      const last = S.puech[S.puech.length - 1];
      const top = {}; ['medMeaK', 'maxMeaK', 'medMedK', 'maxMedK'].forEach(k => { top[k] = Math.max(...S.puech.map(p => p[k])); });
      const reached = S.puech.find(p => p.medMeaK === top.medMeaK);
      parts.push(`<p>Puechmaille's (2016) estimators, designed for uneven sampling, count at each K the clusters to which at least one population is assigned with mean (MeaK) or median (MedK) membership ≥ 0.5, as the median (Med) or the maximum (Max) over runs. Their largest values estimate K: <b>MedMeaK = ${top.medMeaK}</b>, MaxMeaK = ${top.maxMeaK}, MedMedK = ${top.medMedK}, MaxMedK = ${top.maxMedK}${top.medMeaK && reached ? ` (MedMeaK first reaches ${top.medMeaK} at K = ${reached.K})` : ''}. ` + (() => {
          /* a cluster counted because one population sits just above 0.5 is not much of a cluster */
          if (!top.medMeaK || !reached || reached.K < 2 || !S.consensus[reached.K]) return '';
          const K = reached.K, Q = S.consensus[K].Q;
          const means = d.pops.map(p => Array.from({ length: K }, (_, k) => p.idx.reduce((s, i) => s + Q[i][k], 0) / p.idx.length));
          const peaks = Array.from({ length: K }, (_, k) => Math.max(...means.map(m => m[k]))).filter(v => v >= 0.5);
          const weakest = peaks.length ? Math.min(...peaks) : 1;
          return weakest < 0.6 ? `At K = ${K}, though, the weakest counted cluster reaches a mean membership of only ${weakest.toFixed(2)} in its best population, barely above the 0.5 threshold, so the count is fragile. ` : '';
        })() +
        (last.medMeaK === 0 ? `At K = ${last.K} no cluster reaches 0.5 in any population: the membership is spread thinly across clusters, the signature of a K well above the real structure (or of populations that are not genetically distinct at all).`
          : last.medMeaK < last.K ? `At K = ${last.K} only ${last.medMeaK} of the ${last.K} clusters are used: the surplus clusters are empty or spread thinly, the classic sign of a K set too high.`
          : `Every cluster is still used at the largest K tested (${last.K}), so a higher K may be worth testing.`) + `</p>`);
    }
    const lowH = S.Ks.filter(K => S.consensus[K] && S.consensus[K].Hprime != null && S.consensus[K].Hprime < 0.9);
    if (S.reps > 1) parts.push(`<p>Replicate similarity H′ (Jakobsson & Rosenberg 2007) ${lowH.length ? `drops below 0.90 at K = ${lowH.join(', ')}: at those K the runs converge to different solutions (multimodality), and the consensus barplot averages solutions that do not agree — do not over-read it` : 'stays above 0.90 for every K: the runs agree with each other, so the consensus barplots represent them faithfully (agreement between runs is not, by itself, evidence that the clusters are real)'}.</p>`);
    if (admix) {
      /* α means nothing at K = 1, where every individual has Q = 1 */
      const K2 = S.Ks.includes(E.bestDelta) ? E.bestDelta : E.bestL > 1 ? E.bestL : S.Ks.find(K => K > 1);
      const alpha = K2 ? S.byK[K2].reduce((s, r) => s + r.alpha, 0) / S.byK[K2].length : null;
      if (alpha != null) parts.push(`<p>The admixture parameter α at K = ${K2} is ${alpha.toFixed(2)}${S.byK[K2].length > 1 ? ' (mean of the runs)' : ''}: ${alpha < 0.2 ? 'small, so most individuals draw nearly all their ancestry from a single cluster (discrete groups)' : alpha < 1 ? 'moderate, so many individuals are admixed' : 'large, so ancestry is spread evenly across clusters — either there is little structure, or K is too high'}.</p>`);
    }
    if (state.hwe && state.hwe.ld && state.hwe.ld.perPop.some(p => p.p != null && p.p < 0.05 && p.rd > 0.05))
      parts.push(`<p class="callout warn"><b>Block 4 found significant linkage disequilibrium.</b> The model assumes unlinked loci in equilibrium within clusters; strong LD (selfing, clonality) inflates the apparent number of clusters. Read K conservatively.</p>`);
    el('structInterpret').innerHTML = parts.join('');
  }

  const mount = (id, spec) => { const host = el(id); if (!host) return; try { Fig.mount(id, spec); } catch (e) { console.error(id, e); host.innerHTML = `<div class="msg msg-error">${esc(e.message)}</div>`; } };
  const pal = { key: 'palette', label: 'Palette', type: 'select', options: Object.entries(Fig.paletteNames), shared: true };

  function drawKFigures(d) {
    const S = B7.struct;
    mount('fig7LnPD', { title: 'Ln P(D) against K', fileName: 'structure_lnpd', width: 560, height: 380, defaults: { palette: 'cluster', title: 'Mean Ln P(D) ± SD over replicates' }, controls: [{ key: 'title', label: 'Title', type: 'text' }, pal], render: cfg => P7.lnPD(cfg, S.evanno) });
    mount('fig7DeltaK', { title: "Evanno's ΔK", fileName: 'structure_deltak', width: 560, height: 380, defaults: { palette: 'cluster', title: 'ΔK (Evanno et al. 2005)' }, controls: [{ key: 'title', label: 'Title', type: 'text' }, pal], render: cfg => P7.deltaK(cfg, S.evanno) });
    el('fig7Puech').style.display = S.puech ? '' : 'none';
    if (S.puech) mount('fig7Puech', { title: "Puechmaille's estimators", fileName: 'structure_puechmaille', width: 640, height: 380, defaults: { palette: 'cluster', title: 'Clusters actually used, against K tested' }, controls: [{ key: 'title', label: 'Title', type: 'text' }, pal], render: cfg => P7.puech(cfg, S.puech) });
  }

  function drawBarplot() {
    const S = B7.struct; if (!S || !S.Ks) return;
    const d = state.data;
    const K = Number(el('structKShown').value), which = el('structRunShown').value;
    const Q = which === 'consensus' ? S.consensus[K].Q : S.consensus[K].aligned[Number(which)];
    const hasPops = d.declaredPops && !d.singletons;
    const Sx = { Q, popOf: hasPops ? d.ind.map((_, i) => d.pops.findIndex(p => p.idx.includes(i))) : null, popNames: hasPops ? d.pops.map(p => p.name) : null, labels: d.ind.map(v => v.id) };
    mount('fig7Bar', {
      title: `Membership barplot · K = ${K}`, fileName: `structure_barplot_K${K}`, width: Math.max(760, Math.min(1400, 300 + d.nInd * 9)), height: 420,
      defaults: { palette: 'cluster', sort: 'pop', indLabels: d.nInd <= 60, gap: true, separators: true, popLabelSize: 11, title: `Ancestry of every individual · K = ${K}${which === 'consensus' ? ' (consensus)' : ''}` },
      controls: [
        { key: 'title', label: 'Title', type: 'text' },
        { key: 'sort', label: 'Order of individuals', type: 'select', options: [['pop', 'by population, then by ancestry'], ['q', 'by dominant cluster (ignore populations)'], ['file', 'as in the file']] },
        { key: 'indLabels', label: 'Individual labels', type: 'checkbox' }, { key: 'gap', label: 'Gap between populations', type: 'checkbox' },
        { key: 'popLabelSize', label: 'Population label size', type: 'range', min: 7, max: 16, step: 0.5 }, pal,
      ],
      render: cfg => P7.structBar(cfg, Sx),
    });
    /* per-population mean membership */
    if (hasPops) {
      const rows = d.pops.map((p, pi) => { const row = { pop: p.name, n: p.idx.length }; for (let k = 0; k < K; k++) row['c' + k] = p.idx.reduce((s, i) => s + Q[i][k], 0) / p.idx.length; return row; });
      buildTable('structPopTable', [{ key: 'pop', label: 'Population' }, { key: 'n', label: 'N', num: true }].concat(Array.from({ length: K }, (_, k) => ({ key: 'c' + k, label: 'Cluster ' + (k + 1), num: true, fmt: v => v.toFixed(3) }))), rows);
      el('structPopWrap').style.display = '';
    } else el('structPopWrap').style.display = 'none';
  }

  function downloadQ() {
    const S = B7.struct; if (!S || !S.Ks) return;
    const d = state.data, K = Number(el('structKShown').value), which = el('structRunShown').value;
    const Q = which === 'consensus' ? S.consensus[K].Q : S.consensus[K].aligned[Number(which)];
    const header = ['Individual', 'Population'].concat(Array.from({ length: K }, (_, k) => 'Q' + (k + 1)));
    const rows = d.ind.map((v, i) => [v.id, v.pop || ''].concat(Q[i].map(q => q.toFixed(4))));
    download(matrixToCSV(header, rows), slug(state.fileName) + `_structure_Q_K${K}.csv`, 'text/csv;charset=utf-8');
  }

  /* ================================================================
     DAPC
     ================================================================ */
  function runDapc() {
    const d = state.data; if (!d) return;
    clearMessages('dapcMessages');
    const btn = el('btnRunDapc'); btn.disabled = true;
    setTimeout(() => {
      try {
        const R = DAPC.dapc(d, { mode: el('dapcMode').value, Kmax: Number(el('dapcKmax').value) || 10, nPCA: Number(el('dapcNpca').value) || null, seed: Number(el('structSeed').value) || 1 });
        B7.dapc = R; state.dapc = R;
        renderDapc(d, R);
        el('dapcResults').style.display = '';
      } catch (e) { console.error(e); showMessage('dapcMessages', 'error', 'DAPC failed: ' + esc(e.message)); }
      finally { btn.disabled = false; }
    }, 20);
  }
  function renderDapc(d, R) {
    const L = R.lda;
    const parts = [];
    parts.push(`<p>${R.idx.length} ${UNIT()} × ${R.nAlleles} ${d.kind === 'dominant' ? 'variable bands' : 'allele columns'}. <b>${R.nPCA}</b> principal components were retained (${fmtPct(R.pca.cum[R.nPCA - 1], 1)} of the variance${el('dapcNpca').value ? ', your choice' : '; the default keeps the smaller of "90% explained" and N/3, since retaining too many PCs over-fits the groups'}).</p>`);
    if (R.findClusters) {
      const fc = R.findClusters, last = fc.curve[fc.curve.length - 1].K;
      parts.push(`<p><b>k-means clustering</b> ran on those PCs for K = 1 to ${last}; the BIC is lowest at <b>K = ${fc.bestK}</b>, which was used as the grouping. A shallow BIC curve means the groups are not sharply separated.</p>`);
      if (fc.bestK === last && last > 1) parts.push(`<p class="callout warn"><b>The BIC is still falling at the largest K tried.</b> The curve has no minimum in this range, so K = ${last} is the edge of the search, not an estimate. With few ${UNIT()} the BIC of k-means keeps dropping as K grows: prefer the K at which the curve bends, and read the groups as a convenient partition rather than as genetic populations.</p>`);
    }
    if (L) {
      const loo = L.loo && L.loo.success != null ? L.loo : null;
      parts.push(`<p>The discriminant analysis kept ${L.nDA} ${L.nDA > 1 ? 'axes' : 'axis'}; the first carries ${fmtPct(L.prop[0], 1)} of the between-group variance${L.nDA > 1 ? `, the second ${fmtPct(L.prop[1], 1)}` : ''}. <b>${fmtPct(L.success, 1)}</b> of the ${UNIT()} are re-assigned to their own group by their posterior membership` +
        (loo ? `, and <b>${fmtPct(loo.success, 1)}</b> when each ${UNIT(false)} is classified by a discriminant analysis built without it (leave-one-out${loo.tested < R.idx.length ? `; ${R.idx.length - loo.tested} alone in ${R.idx.length - loo.tested === 1 ? 'its' : 'their'} group cannot be tested` : ''})` : '') + '. ' +
        (R.findClusters ? 'Both are high by construction when the groups came from the data themselves.'
          : `The first figure is optimistic, because the same individuals define the groups; ${loo ? 'report the leave-one-out figure and compare it' : 'compare it'} with the ${(1 / L.gn.length * 100).toFixed(0)}% expected by chance.` +
            (loo && L.success - loo.success > 0.1 ? ` The gap of ${Math.round((L.success - loo.success) * 100)} points is the part of the first figure fitted to these very individuals. To choose the number of principal components, run DAPC with several values and keep the one beyond which the leave-one-out success stops improving.` : '')) + `</p>`);
      const per = loo ? loo.perGroup : L.perGroup;
      const weak = per.map((g, i) => ({ name: R.groupNames[i], n: g.n, rate: g.n ? g.correct / g.n : 0 })).filter(g => g.n > 0 && g.rate < 0.7);
      if (weak.length) parts.push(`<p>The least distinct group${weak.length > 1 ? 's are' : ' is'} ${weak.map(g => `<b>${esc(g.name)}</b> (${fmtPct(g.rate, 0)} re-assigned${loo ? ', leave-one-out' : ''})`).join(', ')}: ${weak.length > 1 ? 'their' : 'its'} individuals overlap with other groups in discriminant space.</p>`);
    } else parts.push('<p>Fewer than two groups: no discriminant analysis is possible.</p>');
    el('dapcInterpret').innerHTML = parts.join('');
    if (L) {
      buildTable('dapcGroupTable', [
        { key: 'name', label: 'Group' }, { key: 'n', label: 'N', num: true }, { key: 'correct', label: 'Re-assigned to it', num: true }, { key: 'rate', label: 'Success', num: true, fmt: v => fmtPct(v, 1) },
        { key: 'loo', label: 'Leave-one-out success', num: true, fmt: v => fmtPct(v, 1) },
      ], L.perGroup.map((g, i) => { const lo = L.loo && L.loo.perGroup[i]; return { name: R.groupNames[i], n: g.n, correct: g.correct, rate: g.n ? g.correct / g.n : null, loo: lo && lo.n ? lo.correct / lo.n : null }; }));
    } else el('dapcGroupTable').innerHTML = '';
    el('fig7Bic').style.display = R.findClusters ? '' : 'none';
    if (R.findClusters) mount('fig7Bic', { title: 'k-means: BIC against K', fileName: 'dapc_bic', width: 600, height: 380, defaults: { palette: 'cluster', title: 'Bayesian information criterion of k-means on the PCs' }, controls: [{ key: 'title', label: 'Title', type: 'text' }, pal], render: cfg => P7.bic(cfg, R.findClusters) });
    if (L) {
      const S = { scores: L.coords, pct: L.prop, labels: R.labels, groupOf: R.groups, groupNames: R.groupNames };
      mount('fig7DapcScatter', {
        title: 'DAPC scatter', fileName: 'dapc_scatter', width: 860, height: 600,
        defaults: { palette: 'cluster', ax1: 1, ax2: L.nDA > 1 ? 2 : 1, envelope: 'ellipse', labels: 'none', centroids: true, shapes: false, pointSize: 4.5, xlab: 'discriminant axis 1', ylab: L.nDA > 1 ? 'discriminant axis 2' : 'discriminant axis 1', title: `DAPC · ${R.nPCA} PCs retained` },
        controls: [{ key: 'title', label: 'Title', type: 'text' }, { key: 'envelope', label: 'Group envelope', type: 'select', options: [['ellipse', '95% ellipse'], ['hull', 'convex hull'], ['none', 'none']] }, { key: 'labels', label: 'Point labels', type: 'select', options: [['none', 'never'], ['auto', 'when ≤ 40 points'], ['all', 'always']] }, { key: 'centroids', label: 'Group centroids', type: 'checkbox' }, { key: 'shapes', label: 'One symbol per group', type: 'checkbox' }, { key: 'pointSize', label: 'Point size', type: 'range', min: 2, max: 10, step: 0.5 }, pal],
        render: cfg => P6.pcoa(cfg, S),
      });
      const hasPops = d.declaredPops && !d.singletons;
      const Sx = { Q: L.post, popOf: hasPops ? R.popOf : null, popNames: hasPops ? d.pops.map(p => p.name) : null, labels: R.labels, clusterNames: R.groupNames };
      mount('fig7Compo', {
        title: 'DAPC membership probabilities (compoplot)', fileName: 'dapc_compoplot', width: Math.max(760, Math.min(1400, 300 + R.idx.length * 9)), height: 400,
        defaults: { palette: 'cluster', sort: 'pop', indLabels: R.idx.length <= 60, gap: true, title: 'Posterior membership of every individual' },
        controls: [{ key: 'title', label: 'Title', type: 'text' }, { key: 'sort', label: 'Order', type: 'select', options: [['pop', 'by population'], ['q', 'by dominant group'], ['file', 'as in the file']] }, { key: 'indLabels', label: 'Individual labels', type: 'checkbox' }, pal],
        render: cfg => P7.structBar(cfg, Sx),
      });
    }
  }
  function downloadDapc() {
    const R = B7.dapc; if (!R || !R.lda) return;
    const header = ['Individual', 'Population', 'Group'].concat(Array.from({ length: R.lda.nDA }, (_, k) => 'DA' + (k + 1))).concat(R.groupNames.map(g => 'post_' + g));
    const rows = R.labels.map((id, i) => [id, state.data.pops[R.popOf[i]] ? state.data.pops[R.popOf[i]].name : '', R.groupNames[R.groups[i]]].concat(R.lda.coords[i].map(v => v.toFixed(5))).concat(R.lda.post[i].map(v => v.toFixed(4))));
    download(matrixToCSV(header, rows), slug(state.fileName) + '_dapc.csv', 'text/csv;charset=utf-8');
  }

  /* ================================================================
     assignment tests
     ================================================================ */
  function runAssign() {
    const d = state.data; if (!d) return;
    clearMessages('assignMessages');
    const btn = el('btnRunAssign'); btn.disabled = true;
    setTimeout(() => {
      try {
        const A = Assign.assignment(d, { method: el('assignMethod').value, sims: Number(el('assignSims').value) || 0, alpha: Number(el('assignAlpha').value) || 0.01, seed: Number(el('structSeed').value) || 1 });
        if (!A) { showMessage('assignMessages', 'warning', 'Assignment needs at least two populations with five or more individuals.'); return; }
        B7.assign = A; state.assign = A;
        renderAssign(d, A);
        el('assignResults').style.display = '';
      } catch (e) { console.error(e); showMessage('assignMessages', 'error', 'Assignment failed: ' + esc(e.message)); }
      finally { btn.disabled = false; }
    }, 20);
  }
  function renderAssign(d, A) {
    const mis = A.rows.filter(r => r.best !== r.home);
    const parts = [];
    parts.push(`<p>Each of the ${A.n} individuals was assigned to the population in which its multilocus genotype is most likely, using ${A.method === 'rannala' ? "Rannala & Mountain's (1997) Bayesian allele frequencies" : "Paetkau's (1995) frequencies with 0.01 for alleles absent from a population"} and leaving the individual out of its own population's frequencies. <b>${fmtPct(A.selfRate, 1)}</b> were assigned to the population they were sampled in; ${mis.length} were not.</p>`);
    if (A.sims > 0) {
      const expected = A.n * A.alpha;
      parts.push(`<p>${A.migrants.length} individual${A.migrants.length === 1 ? '' : 's'} ${A.migrants.length === 1 ? 'is' : 'are'} flagged as likely <b>first-generation migrant${A.migrants.length === 1 ? '' : 's'}</b> (P < ${A.alpha}, from ${A.sims} genotypes simulated per population with the statistic L<sub>home</sub>/L<sub>max</sub>)${A.migrants.length ? ': ' + A.migrants.slice(0, 8).map(r => `<b>${esc(r.id)}</b> (${esc(r.homeName)} → ${esc(r.bestName)}, P = ${r.pMigrant.toFixed(3)})`).join('; ') + (A.migrants.length > 8 ? '…' : '') : ''}. ` +
        `Testing ${A.n} residents at α = ${A.alpha} flags about ${expected < 10 ? expected.toFixed(1) : Math.round(expected)} by chance alone, ${A.migrants.length > 2 * expected + 1 ? 'so this many points to real migration' : 'so a count this small is compatible with no migrants at all: treat the names as candidates to check, not as proven migrants'}. ` +
        `A misassigned individual is not necessarily a migrant either: with weak differentiation many residents fit another population almost as well, and the Monte Carlo P separates the two.</p>`);
    }
    parts.push(`<p>Self-assignment success rises with differentiation and with the number and variability of the loci (Cornuet et al. 1999), so compare it with the ${fmtPct(1 / A.popNames.length, 0)} expected by chance and with F<sub>ST</sub> from Block 5 rather than reading it as an absolute accuracy. Populations that swap many individuals in the matrix below are the least differentiated pairs.</p>`);
    el('assignInterpret').innerHTML = parts.join('');
    /* matrix table */
    const cols = [{ key: 'from', label: 'Sampled in ↓ · assigned to →' }].concat(A.popNames.map((p, j) => ({ key: 'c' + j, label: esc(p), num: true, html: true, get: r => (r.i === j ? `<b>${A.matrix[r.i][j]}</b>` : String(A.matrix[r.i][j])) })), [{ key: 'rate', label: 'Self-assigned', num: true, fmt: v => fmtPct(v, 0) }]);
    buildTable('assignMatrixTable', cols, A.popNames.map((p, i) => ({ from: p, i, rate: A.matrix[i][i] / (A.matrix[i].reduce((s, v) => s + v, 0) || 1) })));
    /* individuals: misassigned and migrants first */
    const rows = A.rows.slice().sort((a, b) => (a.pMigrant ?? 1) - (b.pMigrant ?? 1) || a.lambda - b.lambda);
    buildTable('assignIndTable', [
      { key: 'id', label: 'Individual' }, { key: 'homeName', label: 'Sampled in' }, { key: 'bestName', label: 'Assigned to', html: true, get: r => r.best === r.home ? esc(r.bestName) : `<b class="geno-het">${esc(r.bestName)}</b>` },
      { key: 'llHome', label: 'ln L home', num: true, fmt: v => v.toFixed(2) }, { key: 'llBest', label: 'ln L best', num: true, fmt: v => v.toFixed(2) },
      { key: 'lambda', label: 'ln(L_home/L_max)', num: true, fmt: v => v.toFixed(2) },
      { key: 'pMigrant', label: 'P (migrant test)', num: true, html: true, get: r => r.pMigrant == null ? '—' : (r.pMigrant < A.alpha ? `<b class="geno-het">${r.pMigrant.toFixed(3)}</b>` : r.pMigrant.toFixed(3)) },
    ], rows, { limit: 300 });
    mount('fig7AssignHeat', { title: 'Assignment matrix', fileName: 'assignment_matrix', width: 700, height: 560, defaults: { palette: 'cluster', cmap: 'greens', counts: false, title: 'Where each population’s individuals are assigned' }, controls: [{ key: 'title', label: 'Title', type: 'text' }, { key: 'counts', label: 'Show counts instead of %', type: 'checkbox' }, { key: 'cmap', label: 'Colour map', type: 'select', options: Object.entries(Fig.colormapNames) }], render: cfg => P7.assignHeat(cfg, A) });
    mount('fig7Lod', { title: 'Home against best other population', fileName: 'assignment_lod', width: 760, height: 560, defaults: { palette: 'cluster', alpha: A.alpha, labelMis: true, repel: true, title: 'Log-likelihood of each genotype: home vs. best other population' }, controls: [{ key: 'title', label: 'Title', type: 'text' }, { key: 'labelMis', label: 'Label misassigned individuals', type: 'checkbox' }, { key: 'repel', label: 'Spread overlapping labels apart', type: 'checkbox' }, pal], render: cfg => P7.lod(cfg, A) });
  }
  function downloadAssign() {
    const A = B7.assign; if (!A) return;
    const header = ['Individual', 'Sampled_in', 'Assigned_to'].concat(A.popNames.map(p => 'lnL_' + p)).concat(['ln_Lhome_over_Lmax', 'P_migrant']);
    const rows = A.rows.map(r => [r.id, r.homeName, r.bestName].concat(r.ll.map(v => v.toFixed(4))).concat([r.lambda.toFixed(4), r.pMigrant == null ? '' : r.pMigrant.toFixed(4)]));
    download(matrixToCSV(header, rows), slug(state.fileName) + '_assignment.csv', 'text/csv;charset=utf-8');
  }

  document.addEventListener('DOMContentLoaded', init);
})();
