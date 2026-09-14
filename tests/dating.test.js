/* PopGeneticsPro — validation of the divergence-time engine (js/dating.js).
   Load in the running app (browser console):
     const s = document.createElement('script'); s.src = 'tests/dating.test.js'; document.body.appendChild(s);
   then:  await DatingTests.basic()   ·   await DatingTests.lsdCoverage(20)   ·   DatingTests.lsdRootPlacement(10)
          await DatingTests.priorOnly() ·   await DatingTests.mcmcCoverage(8, 'strict'|'ucln', simSigma) */

window.DatingTests = (function () {
  const D = window.Dating;

  function basic() {
    const out = {};
    const M = D.makeModel({ model: 'GTR', rates: [1.3, 4.1, 0.7, 1.1, 5.2, 1], freqs: [0.31, 0.19, 0.22, 0.28], alpha: null });
    const P = new Float64Array(16); D.transition(M, 0.37, P, 0);
    let rowErr = 0, revErr = 0, statErr = 0;
    for (let i = 0; i < 4; i++) { let s = 0; for (let j = 0; j < 4; j++) { s += P[i * 4 + j]; revErr = Math.max(revErr, Math.abs(M.pi[i] * P[i * 4 + j] - M.pi[j] * P[j * 4 + i])); } rowErr = Math.max(rowErr, Math.abs(s - 1)); }
    for (let j = 0; j < 4; j++) { let s = 0; for (let i = 0; i < 4; i++) s += M.pi[i] * P[i * 4 + j]; statErr = Math.max(statErr, Math.abs(s - M.pi[j])); }
    out.transition = { rowErr, revErr, statErr, pass: rowErr < 1e-12 && revErr < 1e-12 && statErr < 1e-12 };
    const g = D.discreteGamma(0.5, 4).rates, yang = [0.03338, 0.25191, 0.82026, 2.89445];
    out.gamma = { got: g, yang1994: yang, pass: g.every((v, i) => Math.abs(v - yang[i]) < 5e-5) };
    const MJ = D.makeModel({ model: 'JC', freqs: [0.25, 0.25, 0.25, 0.25] });
    const s1 = 'ACGTACGTTTGACCAGTAGGCATACGATTACAGGAC', s2 = 'ACGTTCGTTTGACCGGTAGGCATTCGATAACAGGAC';
    const tree2 = { children: [{ node: { tip: 0, children: [] }, len: 0.1 }, { node: { tip: 1, children: [] }, len: 0.15 }] };
    const F2 = D.flatten(tree2); const lnL = D.Lik(F2, D.compress([s1, s2]), MJ).full(F2.len);
    const t = 0.25, pd = 0.25 - 0.25 * Math.exp(-4 * t / 3), ps = 0.25 + 0.75 * Math.exp(-4 * t / 3);
    let an = 0; for (let i = 0; i < s1.length; i++) an += Math.log(0.25 * (s1[i] === s2[i] ? ps : pd));
    out.jcTwoTaxa = { engine: lnL, analytic: an, pass: Math.abs(lnL - an) < 1e-9 };
    const MG = D.makeModel({ model: 'GTR', rates: [1.3, 4.1, 0.7, 1.1, 5.2, 1], freqs: [0.31, 0.19, 0.22, 0.28], alpha: 0.7, ncat: 4 });
    const tips = [0, 1, 2, 3].map(i => ({ tip: i, children: [] }));
    const tree4 = { children: [{ node: { children: [{ node: tips[0], len: 0.12 }, { node: tips[1], len: 0.3 }] }, len: 0.05 }, { node: { children: [{ node: tips[2], len: 0.21 }, { node: tips[3], len: 0.08 }] }, len: 0.4 }] };
    const r = D.makeRng(3); const seqs4 = [0, 1, 2, 3].map(() => Array.from({ length: 60 }, () => 'ACGTNR-'[Math.floor(r() * 7)]).join(''));
    const F4 = D.flatten(tree4); const eng = D.Lik(F4, D.compress(seqs4), MG).full(F4.len);
    const CODE = { A: [1, 0, 0, 0], C: [0, 1, 0, 0], G: [0, 0, 1, 0], T: [0, 0, 0, 1], N: [1, 1, 1, 1], R: [1, 0, 1, 0], '-': [1, 1, 1, 1] };
    const Pm = (tt, c) => { const o = new Float64Array(16); D.transition(MG, tt * MG.catRates[c], o, 0); return o; };
    let brute = 0;
    for (let s = 0; s < 60; s++) {
      let site = 0;
      for (let c = 0; c < MG.ncat; c++) {
        const pa = Pm(0.05, c), pb = Pm(0.4, c), p0 = Pm(0.12, c), p1 = Pm(0.3, c), p2 = Pm(0.21, c), p3 = Pm(0.08, c);
        const leaf = (PP, from, ch) => { const v = CODE[ch]; let q = 0; for (let j = 0; j < 4; j++) q += PP[from * 4 + j] * v[j]; return q; };
        let sc = 0;
        for (let x = 0; x < 4; x++) for (let y = 0; y < 4; y++) for (let z = 0; z < 4; z++)
          sc += MG.pi[x] * pa[x * 4 + y] * pb[x * 4 + z] * leaf(p0, y, seqs4[0][s]) * leaf(p1, y, seqs4[1][s]) * leaf(p2, z, seqs4[2][s]) * leaf(p3, z, seqs4[3][s]);
        site += MG.catWeights[c] * sc;
      }
      brute += Math.log(site);
    }
    out.pruningVsBruteForce = { engine: eng, brute, pass: Math.abs(eng - brute) < 1e-9 };
    const fit = D.fitML(tree2, [s1, s2], { model: 'JC' });
    const p = [...s1].filter((c, i) => c !== s2[i]).length / s1.length;
    const an2 = -0.75 * Math.log(1 - 4 * p / 3);
    out.mlDistance = { ml: fit.lens[1] + fit.lens[2], analytic: an2, pass: Math.abs(fit.lens[1] + fit.lens[2] - an2) < 1e-4 };
    /* ESS of an AR(1) series: N(1 − ρ)/(1 + ρ) */
    const rr = D.makeRng(9), x = []; let v = 0; for (let i = 0; i < 20000; i++) { v = 0.9 * v + rr.normal(); x.push(v); }
    const e = D.ess(x), expected = 20000 * 0.1 / 1.9;
    out.essAR1 = { ess: e, expected, pass: Math.abs(e / expected - 1) < 0.25 };
    return out;
  }

  const toSubs = (node, rate, r, sigma) => ({ tip: node.tip, label: node.label, children: node.children.map(c => ({ node: toSubs(c.node, rate, r, sigma), len: c.len * rate * (sigma ? Math.exp(sigma * r.normal() - sigma * sigma / 2) : 1) })) });

  function lsdCoverage(reps, sigma) {
    let cov = 0, cnt = 0, sse = 0;
    for (let rep = 1; rep <= (reps || 20); rep++) {
      const timeTree = D.yuleTree(20, 50, 300 + rep);
      const subTree = toSubs(timeTree, 0.003);
      const seqs = D.simulateSeqs(subTree, 1500, { model: 'HKY', kappa: 4, freqs: [0.3, 0.2, 0.2, 0.3] }, 900 + rep);
      const fit = D.fitML(JSON.parse(JSON.stringify(subTree)), seqs, { model: 'HKY' }, { passes: 6 });
      const trueF = D.flatten(timeTree);
      const res = D.lsd(fit.tree, 1500, [{ node: 0, type: 'fixed', value: 50 }], { reps: 100, seed: rep, rateSigma: sigma == null ? 0.2 : sigma });
      D.flatten(res.tree).nodes.forEach((nd, k) => { if (nd.tip != null || k === 0) return; const tru = trueF.nodes[k].age; cnt++; sse += (nd.age - tru) ** 2; if (tru >= nd.hpd[0] && tru <= nd.hpd[1]) cov++; });
    }
    return { coverage95: cov / cnt, rmseMa: Math.sqrt(sse / cnt), nodes: cnt };
  }

  /* The split of the root branch between its two sides is not identifiable: moving the root
     along that branch must not change any age, and a known rate must recover the true root. */
  function lsdRootPlacement(reps) {
    let maxShift = 0, sse = 0, cnt = 0, cov = 0;
    for (let rep = 1; rep <= (reps || 10); rep++) {
      const timeTree = D.yuleTree(20, 50, 700 + rep);
      const subTree = toSubs(timeTree, 0.003);
      const seqs = D.simulateSeqs(subTree, 1500, { model: 'HKY', kappa: 4, freqs: [0.3, 0.2, 0.2, 0.3] }, 1700 + rep);
      const fit = D.fitML(JSON.parse(JSON.stringify(subTree)), seqs, { model: 'HKY' }, { passes: 6 });
      const moved = JSON.parse(JSON.stringify(fit.tree));
      const [c1, c2] = moved.children, B = c1.len + c2.len;
      c1.len = 0.9 * B; c2.len = 0.1 * B;
      const rate = { mean: 0.003, sd: 0.0003 };
      const a = D.lsd(fit.tree, 1500, [], { reps: 100, seed: rep, rate });
      const bRes = D.lsd(moved, 1500, [], { reps: 0, rate });
      const fa = D.flatten(a.tree).nodes, fb = D.flatten(bRes.tree).nodes, trueF = D.flatten(timeTree);
      fa.forEach((nd, k) => {
        if (nd.tip != null) return;
        maxShift = Math.max(maxShift, Math.abs(nd.age - fb[k].age));
        const tru = trueF.nodes[k].age; cnt++; sse += (nd.age - tru) ** 2; if (tru >= nd.hpd[0] && tru <= nd.hpd[1]) cov++;
      });
    }
    return { maxAgeChangeWhenRootMoves: maxShift, coverage95: cov / cnt, rmseMa: Math.sqrt(sse / cnt), nodes: cnt, pass: maxShift < 1e-3 };
  }

  async function priorOnly() {
    const timeTree = D.yuleTree(12, 50, 77);
    const subTree = toSubs(timeTree, 0.003);
    const seqs = D.simulateSeqs(subTree, 800, { model: 'HKY', kappa: 4 }, 5);
    const res = await D.runInWorker('mcmc', { tree: subTree, seqs, spec: { model: 'HKY', kappa: 4 }, calibs: [{ node: 0, type: 'uniform', min: 40, max: 60 }], samplePrior: true, iterations: 600000, thin: 150, burnin: 0.1, seed: 11 });
    const ra = res.trace.rootAge, n = ra.length;
    const mean = ra.reduce((s, v) => s + v, 0) / n, sd = Math.sqrt(ra.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1));
    const s = ra.slice().sort((a, b) => a - b); let ks = 0;
    s.forEach((v, i) => { const F = (v - 40) / 20; ks = Math.max(ks, Math.abs(F - (i + 1) / n), Math.abs(F - i / n)); });
    const crit = 1.36 / Math.sqrt(res.params.rootAge.ess);
    return { mean, sd, expectedSd: 20 / Math.sqrt(12), ks, ksCritical95: crit, pass: ks < crit && Math.abs(mean - 50) < 1 };
  }

  async function mcmcCoverage(reps, clock, simSigma, iterations) {
    let cov = 0, cnt = 0, sse = 0; const runs = [];
    for (let rep = 1; rep <= (reps || 8); rep++) {
      const timeTree = D.yuleTree(16, 50, 500 + rep);
      const subTree = toSubs(timeTree, 0.003, D.makeRng(40 + rep), simSigma || 0);
      const seqs = D.simulateSeqs(subTree, 1000, { model: 'HKY', kappa: 4, freqs: [0.3, 0.2, 0.2, 0.3] }, 800 + rep);
      const fit = D.fitML(JSON.parse(JSON.stringify(subTree)), seqs, { model: 'HKY' }, { passes: 5 });
      const cal = [{ node: 0, type: 'normal', mean: 50, sd: 2.5 }];
      const init = D.flatten(D.lsd(fit.tree, 1000, cal, { reps: 0 }).tree).nodes.map(nd => nd.age || 0);
      const t0 = performance.now();
      const res = await D.runInWorker('mcmc', { tree: fit.tree, seqs, spec: fit.spec, calibs: cal, clock: clock || 'strict', iterations: iterations || 150000, burnin: 0.25, seed: rep, initAges: init });
      const trueF = D.flatten(timeTree), estF = D.flatten(res.tree);
      let c = 0, m = 0;
      estF.nodes.forEach((nd, k) => { if (nd.tip != null) return; const tru = trueF.nodes[k].age; m++; sse += (nd.age - tru) ** 2; if (tru >= nd.hpd[0] && tru <= nd.hpd[1]) c++; });
      cov += c; cnt += m;
      runs.push({ rep, covered: c + '/' + m, essRoot: Math.round(res.params.rootAge.ess), essLnL: Math.round(res.params.lnL.ess), rate: +res.params.rate.mean.toFixed(5), sigma: res.params.sigma ? +res.params.sigma.mean.toFixed(3) : null, seconds: +((performance.now() - t0) / 1000).toFixed(1) });
    }
    return { coverage95: cov / cnt, rmseMa: Math.sqrt(sse / cnt), nodes: cnt, runs };
  }

  return { basic, lsdCoverage, lsdRootPlacement, priorOnly, mcmcCoverage };
})();
