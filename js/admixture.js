/* PopGeneticsPro — Block 7 core: Bayesian clustering of individuals.

   The model is the admixture model of Pritchard, Stephens and Donnelly (2000) with
   independent allele frequencies:
     admixture model    — every gene copy has its own cluster of origin Z,
                          individual i has admixture proportions Q_i ~ Dirichlet(α),
                          α updated by a Metropolis step (uniform prior on (0, 10]);
     no-admixture model — every individual belongs to one cluster.
     P_kl ~ Dirichlet(λ = 1); Gibbs sampling of Z | P, Q ; P | Z ; Q | Z.
   Ln P(D) is Pritchard's estimate: mean(ln L) − var(ln L)/2 over the sampling phase.
   Replicates are aligned by permuting cluster labels (the greedy/exhaustive
   search of Jakobsson and Rosenberg 2007), K is chosen with Evanno's ΔK
   (2005) and Puechmaille's (2016) MedMeaK / MaxMeaK / MedMedK / MaxMedK.

   Pure functions, no DOM. The whole engine lives in StructCore so that block7.js
   can build a Web Worker from its source text (a Blob), which also works when
   the app is opened by double-click. Dominant bands and haplotypes are treated
   as haploid loci (one gene copy per individual). */

function StructCore(root) {

  /* ---------- seeded random numbers (self-contained so the worker needs nothing else) ---------- */
  function makeRng(seed) { let s = (seed >>> 0) || 1; return () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; }; }
  function randn(r) { let u = 0, v = 0; while (u === 0) u = r(); while (v === 0) v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
  /* Gamma(shape, 1) — Marsaglia & Tsang (2000), with the boost for shape < 1 */
  function rgamma(r, shape) {
    if (shape < 1) return rgamma(r, shape + 1) * Math.pow(r() || 1e-12, 1 / shape);
    const d = shape - 1 / 3, c = 1 / Math.sqrt(9 * d);
    for (;;) {
      let x, v;
      do { x = randn(r); v = 1 + c * x; } while (v <= 0);
      v = v * v * v;
      const u = r();
      if (u < 1 - 0.0331 * x * x * x * x) return d * v;
      if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
    }
  }
  function rdirichlet(r, alphas, out) {
    let s = 0;
    for (let k = 0; k < alphas.length; k++) { out[k] = rgamma(r, alphas[k]); s += out[k]; }
    if (s <= 0) { for (let k = 0; k < alphas.length; k++) out[k] = 1 / alphas.length; return out; }
    for (let k = 0; k < alphas.length; k++) out[k] /= s;
    return out;
  }
  function lgamma(x) {
    const c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
    let y = x, tmp = x + 5.5; tmp -= (x + 0.5) * Math.log(tmp);
    let ser = 1.000000000190015; for (let j = 0; j < 6; j++) ser += c[j] / ++y;
    return -tmp + Math.log(2.5066282746310005 * ser / x);
  }

  /* ================================================================
     data preparation: allele codes → integer indices per locus
     ================================================================ */
  /* geno[i][l] = array of allele codes (strings) or null. Returns compact arrays. */
  function prepare(geno, nInd, nLoci) {
    const nAlleles = new Array(nLoci).fill(0);
    const index = Array.from({ length: nLoci }, () => new Map());
    const copies = [];          // flat list of {i, l, a}
    for (let i = 0; i < nInd; i++) for (let l = 0; l < nLoci; l++) {
      const g = geno[i][l]; if (!g) continue;
      for (const code of g) {
        const key = String(code);
        if (!index[l].has(key)) { index[l].set(key, nAlleles[l]); nAlleles[l]++; }
        copies.push({ i, l, a: index[l].get(key) });
      }
    }
    const ci = new Int32Array(copies.length), cl = new Int32Array(copies.length), ca = new Int32Array(copies.length);
    copies.forEach((c, q) => { ci[q] = c.i; cl[q] = c.l; ca[q] = c.a; });
    return { nInd, nLoci, nAlleles, ci, cl, ca, nCopies: copies.length, alleleNames: index.map(m => [...m.keys()]) };
  }

  /* ================================================================
     one MCMC run
     ================================================================ */
  function run(D, opts, onProgress) {
    const K = opts.K, burnin = opts.burnin, iters = opts.iters, admix = opts.admixture !== false;
    const lambda = opts.lambda || 1;
    const r = makeRng(opts.seed || 1);
    const { nInd, nLoci, nAlleles, ci, cl, ca, nCopies } = D;
    const offs = new Int32Array(nLoci + 1);            // allele offset per locus into the flat P arrays
    for (let l = 0; l < nLoci; l++) offs[l + 1] = offs[l] + nAlleles[l];
    const A = offs[nLoci];
    const P = new Float64Array(K * A);                  // P[k*A + offs[l] + a]
    const counts = new Float64Array(K * A);
    const Q = new Float64Array(nInd * K);
    const m = new Float64Array(nInd * K);              // copies of individual i assigned to k
    const Z = new Int32Array(nCopies);
    const zi = new Int32Array(nInd);                   // no-admixture: cluster of each individual
    const copiesOf = Array.from({ length: nInd }, () => []);
    for (let q = 0; q < nCopies; q++) copiesOf[ci[q]].push(q);
    let alpha = opts.alphaInit || 1;
    const rk = new Float64Array(K).fill(1 / K);        // no-admixture: cluster proportions
    const tmp = new Float64Array(K), tmpA = new Float64Array(Math.max(...nAlleles, 1));

    /* init: random assignment */
    if (admix) for (let q = 0; q < nCopies; q++) Z[q] = Math.floor(r() * K);
    else { for (let i = 0; i < nInd; i++) zi[i] = Math.floor(r() * K); for (let q = 0; q < nCopies; q++) Z[q] = zi[ci[q]]; }
    const recount = () => {
      counts.fill(0); m.fill(0);
      for (let q = 0; q < nCopies; q++) { counts[Z[q] * A + offs[cl[q]] + ca[q]]++; m[ci[q] * K + Z[q]]++; }
    };
    const sampleP = () => {
      for (let k = 0; k < K; k++) for (let l = 0; l < nLoci; l++) {
        const na = nAlleles[l], base = k * A + offs[l];
        for (let a = 0; a < na; a++) tmpA[a] = lambda + counts[base + a];
        const out = rdirichlet(r, tmpA.subarray(0, na), new Float64Array(na));
        for (let a = 0; a < na; a++) P[base + a] = Math.max(out[a], 1e-9);
      }
    };
    const sampleQ = () => {
      for (let i = 0; i < nInd; i++) {
        for (let k = 0; k < K; k++) tmp[k] = alpha + m[i * K + k];
        const out = rdirichlet(r, tmp, new Float64Array(K));
        for (let k = 0; k < K; k++) Q[i * K + k] = out[k];
      }
    };
    recount(); sampleP();
    if (admix) sampleQ(); else { for (let i = 0; i < nInd; i++) for (let k = 0; k < K; k++) Q[i * K + k] = zi[i] === k ? 1 : 0; }

    const Qsum = new Float64Array(nInd * K), Psum = new Float64Array(K * A);
    let lnLsum = 0, lnL2sum = 0, nSamp = 0, alphaSum = 0, accepted = 0, proposed = 0;
    const trace = [];
    const total = burnin + iters;

    for (let it = 0; it < total; it++) {
      if (admix) {
        /* Z | P, Q */
        for (let q = 0; q < nCopies; q++) {
          const i = ci[q], off = offs[cl[q]] + ca[q];
          let s = 0;
          for (let k = 0; k < K; k++) { tmp[k] = Q[i * K + k] * P[k * A + off]; s += tmp[k]; }
          let u = r() * s, k = 0;
          while (k < K - 1 && u > tmp[k]) { u -= tmp[k]; k++; }
          Z[q] = k;
        }
        recount(); sampleP(); sampleQ();
        /* α | Q — Metropolis with a normal proposal */
        const prop = alpha + 0.05 * randn(r);
        proposed++;
        if (prop > 0 && prop <= 10) {
          let sumLogQ = 0;
          for (let i = 0; i < nInd * K; i++) sumLogQ += Math.log(Math.max(Q[i], 1e-300));
          const ll = a => nInd * (lgamma(K * a) - K * lgamma(a)) + (a - 1) * sumLogQ;
          if (Math.log(r()) < ll(prop) - ll(alpha)) { alpha = prop; accepted++; }
        }
      } else {
        /* z_i | P, r_k : the whole genotype moves together */
        for (let i = 0; i < nInd; i++) {
          const cps = copiesOf[i];
          let maxv = -Infinity;
          for (let k = 0; k < K; k++) {
            let lp = Math.log(rk[k]);
            for (let t = 0; t < cps.length; t++) { const q = cps[t]; lp += Math.log(P[k * A + offs[cl[q]] + ca[q]]); }
            tmp[k] = lp; if (lp > maxv) maxv = lp;
          }
          let s = 0; for (let k = 0; k < K; k++) { tmp[k] = Math.exp(tmp[k] - maxv); s += tmp[k]; }
          let u = r() * s, k = 0; while (k < K - 1 && u > tmp[k]) { u -= tmp[k]; k++; }
          zi[i] = k; for (let t = 0; t < cps.length; t++) Z[cps[t]] = k;
        }
        recount(); sampleP();
        for (let k = 0; k < K; k++) tmp[k] = 1; for (let i = 0; i < nInd; i++) tmp[zi[i]]++;
        rdirichlet(r, tmp, rk);
        for (let i = 0; i < nInd; i++) for (let k = 0; k < K; k++) Q[i * K + k] = zi[i] === k ? 1 : 0;
      }

      if (it >= burnin) {
        /* log-likelihood with Z integrated out: Σ ln Σ_k Q_ik P_kla */
        let lnL = 0;
        for (let q = 0; q < nCopies; q++) {
          const i = ci[q], off = offs[cl[q]] + ca[q];
          let s = 0; for (let k = 0; k < K; k++) s += Q[i * K + k] * P[k * A + off];
          lnL += Math.log(Math.max(s, 1e-300));
        }
        lnLsum += lnL; lnL2sum += lnL * lnL; nSamp++;
        for (let x = 0; x < Qsum.length; x++) Qsum[x] += Q[x];
        for (let x = 0; x < Psum.length; x++) Psum[x] += P[x];
        alphaSum += alpha;
        if ((it - burnin) % Math.max(1, Math.floor(iters / 200)) === 0) trace.push(lnL);
      }
      if (onProgress && it % 200 === 0) onProgress(it / total);
    }
    const meanLnL = lnLsum / nSamp, varLnL = lnL2sum / nSamp - meanLnL * meanLnL;
    const Qmean = []; for (let i = 0; i < nInd; i++) { const row = []; for (let k = 0; k < K; k++) row.push(Qsum[i * K + k] / nSamp); Qmean.push(row); }
    const Pmean = []; for (let k = 0; k < K; k++) { const per = []; for (let l = 0; l < nLoci; l++) { const v = []; for (let a = 0; a < nAlleles[l]; a++) v.push(Psum[k * A + offs[l] + a] / nSamp); per.push(v); } Pmean.push(per); }
    return {
      K, admixture: admix, burnin, iters, seed: opts.seed,
      Q: Qmean, P: Pmean, meanLnL, varLnL, lnPD: meanLnL - varLnL / 2,
      alpha: admix ? alphaSum / nSamp : null, alphaAcceptance: proposed ? accepted / proposed : null, trace,
    };
  }

  /* ================================================================
     label switching: align a replicate to a reference
     ================================================================ */
  function permutations(n) {
    const out = []; const a = Array.from({ length: n }, (_, i) => i);
    const rec = (k) => { if (k === n) { out.push(a.slice()); return; } for (let i = k; i < n; i++) { [a[k], a[i]] = [a[i], a[k]]; rec(k + 1); [a[k], a[i]] = [a[i], a[k]]; } };
    rec(0); return out;
  }
  function align(Qref, Q) {
    const N = Q.length, K = Q[0].length;
    const score = perm => { let s = 0; for (let i = 0; i < N; i++) for (let k = 0; k < K; k++) s += Qref[i][k] * Q[i][perm[k]]; return s; };
    let best = null, bestS = -Infinity;
    if (K <= 7) permutations(K).forEach(p => { const s = score(p); if (s > bestS) { bestS = s; best = p; } });
    else {
      /* greedy: match the most similar columns first */
      const used = new Set(); best = new Array(K);
      const sim = (k, j) => { let s = 0; for (let i = 0; i < N; i++) s += Qref[i][k] * Q[i][j]; return s; };
      const pairs = []; for (let k = 0; k < K; k++) for (let j = 0; j < K; j++) pairs.push([sim(k, j), k, j]);
      pairs.sort((a, b) => b[0] - a[0]);
      const doneK = new Set();
      pairs.forEach(([s, k, j]) => { if (!doneK.has(k) && !used.has(j)) { best[k] = j; doneK.add(k); used.add(j); } });
    }
    return Q.map(row => best.map(j => row[j]));
  }
  /* The pairwise similarity G (Jakobsson and Rosenberg 2007) between two aligned Q matrices */
  function similarity(Q1, Q2) {
    const N = Q1.length; let s = 0;
    for (let i = 0; i < N; i++) for (let k = 0; k < Q1[0].length; k++) s += (Q1[i][k] - Q2[i][k]) ** 2;
    return 1 - Math.sqrt(s) / Math.sqrt(2 * N);
  }
  function consensus(runs) {
    if (!runs.length) return null;
    const ref = runs.reduce((a, b) => (b.lnPD > a.lnPD ? b : a));   // align everything to the best run
    const aligned = runs.map(rn => (rn === ref ? rn.Q : align(ref.Q, rn.Q)));
    const N = ref.Q.length, K = ref.K;
    const Q = Array.from({ length: N }, (_, i) => Array.from({ length: K }, (_, k) => aligned.reduce((s, q) => s + q[i][k], 0) / aligned.length));
    let sims = [], cnt = 0;
    for (let a = 0; a < aligned.length; a++) for (let b = a + 1; b < aligned.length; b++) { sims.push(similarity(aligned[a], aligned[b])); cnt++; }
    return { Q, aligned, Hprime: cnt ? sims.reduce((s, v) => s + v, 0) / cnt : null, bestRun: ref };
  }

  /* ================================================================
     choosing K
     ================================================================ */
  function evanno(byK) {
    /* byK: [{K, lnPD: [replicates]}] sorted by K */
    const rows = byK.map(x => {
      const v = x.lnPD, n = v.length, mean = v.reduce((s, y) => s + y, 0) / n;
      const sd = n > 1 ? Math.sqrt(v.reduce((s, y) => s + (y - mean) ** 2, 0) / (n - 1)) : null;
      return { K: x.K, n, meanL: mean, sdL: sd, L1: null, L2: null, deltaK: null };
    });
    for (let i = 1; i < rows.length; i++) rows[i].L1 = rows[i].meanL - rows[i - 1].meanL;
    for (let i = 1; i < rows.length - 1; i++) rows[i].L2 = Math.abs(rows[i + 1].L1 - rows[i].L1);
    rows.forEach(rw => { if (rw.L2 != null && rw.sdL != null && rw.sdL > 0) rw.deltaK = rw.L2 / rw.sdL; });
    const withDelta = rows.filter(rw => rw.deltaK != null);
    const bestDelta = withDelta.length ? withDelta.reduce((a, b) => (b.deltaK > a.deltaK ? b : a)).K : null;
    const bestL = rows.reduce((a, b) => (b.meanL > a.meanL ? b : a)).K;
    return { rows, bestDelta, bestL };
  }
  /* Puechmaille (2016): number of clusters to which at least one population is assigned with mean/median membership ≥ threshold */
  function puechmaille(Q, popOf, nPops, thr) {
    thr = thr || 0.5;
    const K = Q[0].length;
    let mea = 0, med = 0;
    for (let k = 0; k < K; k++) {
      let usedMean = false, usedMed = false;
      for (let p = 0; p < nPops; p++) {
        const vals = []; Q.forEach((row, i) => { if (popOf[i] === p) vals.push(row[k]); });
        if (!vals.length) continue;
        const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
        const sorted = vals.slice().sort((a, b) => a - b), h = sorted.length >> 1;
        const median = sorted.length % 2 ? sorted[h] : (sorted[h - 1] + sorted[h]) / 2;
        if (mean >= thr) usedMean = true; if (median >= thr) usedMed = true;
      }
      if (usedMean) mea++; if (usedMed) med++;
    }
    return { meaK: mea, medK: med };
  }

  const API = { prepare, run, align, similarity, consensus, evanno, puechmaille, makeRng, rgamma, rdirichlet, lgamma };
  root.Struct = API;
  return API;
}
StructCore(typeof window !== 'undefined' ? window : self);
