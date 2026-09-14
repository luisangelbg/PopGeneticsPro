/* PopGeneticsPro — Block 7 engines without MCMC:
     DAPC — discriminant analysis of principal components (Jombart, Devillard &
            Balloux 2010): PCA of allele frequencies, optional k-means clustering with K chosen by BIC
            (k-means on the PCs, K chosen by BIC), then LDA on the retained PCs.
     Assignment tests — Paetkau et al. (1995) frequency method and Rannala &
            Mountain (1997) Bayesian method, leave-one-out; first-generation
            migrants by Monte Carlo resampling of genotypes (Paetkau et al. 2004,
            statistic L_home / L_max). */

(function () {

  /* ================================================================
     individual × allele frequency matrix
     ================================================================ */
  function alleleMatrix(d, idx, loci) {
    const cols = [];   // {l, a}
    /* a dominant band is one column (presence); its absence column would only repeat it */
    const colIndex = loci.map(l => { const m = new Map(); d.loci[l].alleles.forEach(a => { if (d.kind === 'dominant' && String(a) !== '1') return; m.set(String(a), cols.length); cols.push({ l, a: String(a) }); }); return m; });
    const X = idx.map(i => {
      const row = new Array(cols.length).fill(NaN);
      loci.forEach((l, li) => {
        const g = d.geno[i][l];
        if (!g) return;
        const m = colIndex[li];
        m.forEach((c) => { row[c] = 0; });
        g.forEach(a => { const c = m.get(String(a)); if (c != null) row[c] += 1 / g.length; });
      });
      return row;
    });
    /* missing → column mean; drop constant columns */
    const keep = [];
    for (let c = 0; c < cols.length; c++) {
      const vals = X.map(r => r[c]).filter(v => !isNaN(v));
      const mean = vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : 0;
      let varies = false;
      X.forEach(r => { if (isNaN(r[c])) r[c] = mean; if (Math.abs(r[c] - mean) > 1e-12) varies = true; });
      if (varies) keep.push(c);
    }
    return { X: X.map(r => keep.map(c => r[c])), cols: keep.map(c => cols[c]) };
  }

  /* ---------- PCA via the n × n Gram matrix (n individuals, many alleles) ---------- */
  function pca(X, maxPC) {
    const n = X.length, p = X[0].length;
    const mean = new Array(p).fill(0);
    X.forEach(r => r.forEach((v, j) => { mean[j] += v / n; }));
    const Xc = X.map(r => r.map((v, j) => v - mean[j]));
    const G = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => { let s = 0; for (let k = 0; k < p; k++) s += Xc[i][k] * Xc[j][k]; return s; }));
    const E = GD.eigenSym(G);
    const total = E.values.filter(v => v > 1e-10).reduce((s, v) => s + v, 0);
    const nPC = Math.min(maxPC || n, E.values.filter(v => v > 1e-10).length);
    const scores = Array.from({ length: n }, () => new Array(nPC).fill(0));
    for (let k = 0; k < nPC; k++) { const lam = Math.sqrt(E.values[k]); for (let i = 0; i < n; i++) scores[i][k] = E.vectors[k][i] * lam; }
    return { scores, eig: E.values.slice(0, nPC).map(v => v / (n - 1)), prop: E.values.slice(0, nPC).map(v => v / total), cum: E.values.slice(0, nPC).map((v, k, arr) => arr.slice(0, k + 1).reduce((s, x) => s + x, 0) / total), Xc, mean, nPC };
  }

  /* ---------- k-means with several starts (k-means++ seeding) ---------- */
  function kmeans(S, K, r, starts) {
    const n = S.length, p = S[0].length;
    const d2 = (a, b) => { let s = 0; for (let k = 0; k < p; k++) s += (a[k] - b[k]) ** 2; return s; };
    let best = null;
    for (let st = 0; st < (starts || 10); st++) {
      const C = [S[Math.floor(r() * n)].slice()];
      while (C.length < K) {
        const dd = S.map(x => Math.min(...C.map(c => d2(x, c))));
        const tot = dd.reduce((s, v) => s + v, 0);
        let u = r() * tot, pick = 0; while (pick < n - 1 && u > dd[pick]) { u -= dd[pick]; pick++; }
        C.push(S[pick].slice());
      }
      let lab = new Array(n).fill(-1);
      for (let it = 0; it < 100; it++) {
        let changed = false;
        for (let i = 0; i < n; i++) { let bi = 0, bd = Infinity; for (let k = 0; k < K; k++) { const v = d2(S[i], C[k]); if (v < bd) { bd = v; bi = k; } } if (lab[i] !== bi) { lab[i] = bi; changed = true; } }
        for (let k = 0; k < K; k++) { const mem = S.filter((_, i) => lab[i] === k); if (!mem.length) continue; for (let j = 0; j < p; j++) C[k][j] = mem.reduce((s, x) => s + x[j], 0) / mem.length; }
        if (!changed) break;
      }
      const wss = S.reduce((s, x, i) => s + d2(x, C[lab[i]]), 0);
      if (!best || wss < best.wss) best = { lab, wss, C };
    }
    return best;
  }
  /* k-means clustering: BIC = n ln(WSS/n) + K ln(n) over K = 1..Kmax */
  function findClusters(S, Kmax, seed) {
    const r = rng(seed || 1), n = S.length;
    const curve = [];
    for (let K = 1; K <= Kmax; K++) {
      /* 50 k-means++ starts: with 10, the partitions of agave at K = 4 to 7 stayed 1–2% above the best sum of squares found */
      const km = kmeans(S, K, r, 50);
      curve.push({ K, wss: km.wss, bic: n * Math.log(km.wss / n) + K * Math.log(n), lab: km.lab });
    }
    const best = curve.reduce((a, b) => (b.bic < a.bic ? b : a));
    return { curve, bestK: best.K, groups: best.lab };
  }

  /* ---------- LDA on the retained PCs ---------- */
  function cholesky(A) {
    const n = A.length, L = Array.from({ length: n }, () => new Array(n).fill(0));
    for (let i = 0; i < n; i++) for (let j = 0; j <= i; j++) {
      let s = A[i][j]; for (let k = 0; k < j; k++) s -= L[i][k] * L[j][k];
      if (i === j) { if (s <= 1e-12) return null; L[i][i] = Math.sqrt(s); } else L[i][j] = s / L[j][j];
    }
    return L;
  }
  function forwardSolve(L, b) { const n = L.length, x = new Array(n); for (let i = 0; i < n; i++) { let s = b[i]; for (let k = 0; k < i; k++) s -= L[i][k] * x[k]; x[i] = s / L[i][i]; } return x; }
  function backSolveT(L, b) { const n = L.length, x = new Array(n); for (let i = n - 1; i >= 0; i--) { let s = b[i]; for (let k = i + 1; k < n; k++) s -= L[k][i] * x[k]; x[i] = s / L[i][i]; } return x; }

  function lda(S, groups, nDA) {
    const n = S.length, p = S[0].length;
    const G = Math.max(...groups) + 1;
    const gm = Array.from({ length: G }, () => new Array(p).fill(0)), gn = new Array(G).fill(0);
    S.forEach((x, i) => { gn[groups[i]]++; x.forEach((v, j) => { gm[groups[i]][j] += v; }); });
    gm.forEach((m, g) => m.forEach((v, j) => { gm[g][j] = gn[g] ? v / gn[g] : 0; }));
    const mean = new Array(p).fill(0); S.forEach(x => x.forEach((v, j) => { mean[j] += v / n; }));
    /* within and between scatter */
    const W = Array.from({ length: p }, () => new Array(p).fill(0)), B = Array.from({ length: p }, () => new Array(p).fill(0));
    S.forEach((x, i) => { const m = gm[groups[i]]; for (let a = 0; a < p; a++) for (let b = 0; b < p; b++) W[a][b] += (x[a] - m[a]) * (x[b] - m[b]); });
    gm.forEach((m, g) => { for (let a = 0; a < p; a++) for (let b = 0; b < p; b++) B[a][b] += gn[g] * (m[a] - mean[a]) * (m[b] - mean[b]); });
    for (let a = 0; a < p; a++) for (let b = 0; b < p; b++) { W[a][b] /= Math.max(1, n - G); B[a][b] /= Math.max(1, G - 1); }
    let L = cholesky(W);
    if (!L) { const ridge = 1e-6 * (W.reduce((s, r, i) => s + r[i], 0) / p || 1); for (let a = 0; a < p; a++) W[a][a] += ridge; L = cholesky(W); }
    if (!L) return null;
    /* M = L⁻¹ B L⁻ᵀ */
    const Linv = []; for (let j = 0; j < p; j++) { const e = new Array(p).fill(0); e[j] = 1; Linv.push(forwardSolve(L, e)); }   // Linv[j] = column j of L⁻¹
    const LB = Array.from({ length: p }, (_, i) => Array.from({ length: p }, (_, j) => { let s = 0; for (let k = 0; k < p; k++) s += Linv[k][i] * B[k][j]; return s; }));   // (L⁻¹ B)
    /* (L⁻¹ B L⁻ᵀ)_ij = Σ_k (L⁻¹B)_ik (L⁻¹)_jk, and (L⁻¹)_jk is Linv[k][j] */
    const M = Array.from({ length: p }, (_, i) => Array.from({ length: p }, (_, j) => { let s = 0; for (let k = 0; k < p; k++) s += LB[i][k] * Linv[k][j]; return s; }));
    const E = GD.eigenSym(M);
    const nd = Math.min(nDA || G - 1, G - 1, p);
    const vectors = []; for (let k = 0; k < nd; k++) vectors.push(backSolveT(L, E.vectors[k]));   // v = L⁻ᵀ u
    const coords = S.map(x => vectors.map(v => x.reduce((s, xi, j) => s + (xi - mean[j]) * v[j], 0)));
    const centroids = gm.map(m => vectors.map(v => m.reduce((s, mi, j) => s + (mi - mean[j]) * v[j], 0)));
    /* posterior membership: Gaussian with the pooled covariance, priors ∝ group size. The
       discriminant vectors satisfy vᵀWv = I, so in discriminant space that covariance is the identity */
    const posterior = c => {
      const lp = centroids.map((mu, g) => Math.log(gn[g] / n) - 0.5 * mu.reduce((s, m, k) => s + (c[k] - m) ** 2, 0));
      const mx = Math.max(...lp); const w = lp.map(v => Math.exp(v - mx)); const tot = w.reduce((s, v) => s + v, 0);
      return w.map(v => v / tot);
    };
    const project = x => vectors.map(v => x.reduce((s, xi, j) => s + (xi - mean[j]) * v[j], 0));
    const post = coords.map(posterior);
    const assigned = post.map(pr => pr.indexOf(Math.max(...pr)));
    const success = assigned.filter((g, i) => g === groups[i]).length / n;
    const perGroup = Array.from({ length: G }, (_, g) => { const idx = groups.map((x, i) => (x === g ? i : -1)).filter(i => i >= 0); return { n: idx.length, correct: idx.filter(i => assigned[i] === g).length }; });
    return { coords, centroids, post, assigned, success, perGroup, eig: E.values.slice(0, nd), prop: E.values.slice(0, nd).map(v => v / E.values.filter(x => x > 0).reduce((s, x) => s + x, 0)), nDA: nd, groups, gn, classify: x => posterior(project(x)) };
  }

  /* Leave-one-out re-assignment: each individual is classified by a discriminant analysis built
     without it. The plain re-assignment rate is optimistic because the same individuals define the
     groups; this one is not (the PCA is shared, but it never sees the group labels). */
  function looSuccess(S, groups, nDA) {
    const n = S.length, G = Math.max(...groups) + 1;
    const perGroup = Array.from({ length: G }, () => ({ n: 0, correct: 0 }));
    for (let i = 0; i < n; i++) {
      const g = groups[i];
      const train = []; for (let j = 0; j < n; j++) if (j !== i) train.push(j);
      const gTrain = train.map(j => groups[j]);
      if (!gTrain.includes(g) || Math.max(...gTrain) + 1 < G) continue;   // the only member of a group
      const L = lda(train.map(j => S[j]), gTrain, nDA);
      if (!L) continue;
      const pr = L.classify(S[i]);
      perGroup[g].n++; if (pr.indexOf(Math.max(...pr)) === g) perGroup[g].correct++;
    }
    const tested = perGroup.reduce((s, x) => s + x.n, 0), correct = perGroup.reduce((s, x) => s + x.correct, 0);
    return { success: tested ? correct / tested : null, tested, perGroup };
  }

  function dapc(d, options) {
    const opts = Object.assign({ mode: 'pops', Kmax: 10, nPCA: null, nDA: null, seed: 1 }, options || {});
    const idx = []; d.pops.forEach(p => p.idx.forEach(i => idx.push(i)));
    const loci = d.loci.map((_, l) => l);
    const A = alleleMatrix(d, idx, loci);
    const n = idx.length;
    const full = pca(A.X, n - 1);
    /* number of PCs: user choice, else the smaller of "explains 90%" and n/3 (Jombart's rule of thumb) */
    let nPCA = opts.nPCA;
    if (!nPCA) { const k90 = full.cum.findIndex(v => v >= 0.9) + 1; nPCA = Math.max(2, Math.min(k90 || full.nPC, Math.floor(n / 3), full.nPC)); }
    nPCA = Math.min(nPCA, full.nPC);
    const S = full.scores.map(r => r.slice(0, nPCA));
    let groups, groupNames, fc = null;
    if (opts.mode === 'find') {
      fc = findClusters(S, Math.min(opts.Kmax, Math.floor(n / 2)), opts.seed);
      groups = fc.groups; groupNames = Array.from({ length: fc.bestK }, (_, k) => 'Cluster ' + (k + 1));
    } else {
      groups = idx.map(i => d.pops.findIndex(p => p.idx.includes(i)));
      groupNames = d.pops.map(p => p.name);
    }
    const G = Math.max(...groups) + 1;
    const L = G >= 2 ? lda(S, groups, opts.nDA || G - 1) : null;
    if (L) L.loo = looSuccess(S, groups, opts.nDA || G - 1);
    return { idx, labels: idx.map(i => d.ind[i].id), popOf: idx.map(i => d.pops.findIndex(p => p.idx.includes(i))), pca: { eig: full.eig, prop: full.prop, cum: full.cum, nPC: full.nPC }, nPCA, groups, groupNames, findClusters: fc, lda: L, nAlleles: A.cols.length };
  }

  /* ================================================================
     ASSIGNMENT TESTS
     ================================================================ */
  function assignment(d, options) {
    const opts = Object.assign({ method: 'rannala', sims: 500, minN: 5, alpha: 0.01, seed: 1 }, options || {});
    const r = rng(opts.seed);
    const pops = d.pops.map((p, i) => i).filter(i => d.pops[i].idx.length >= opts.minN);
    const P = pops.length;
    if (P < 2) return null;
    const loci = d.loci.map((_, l) => l);
    const ploidy = d.kind === 'codominant' ? d.ploidy : 1;
    /* allele counts per pop × locus */
    const counts = pops.map(pi => loci.map(l => { const m = new Map(); let n = 0; d.pops[pi].idx.forEach(i => { const g = d.geno[i][l]; if (!g) return; n += g.length; g.forEach(a => { const k = String(a); m.set(k, (m.get(k) || 0) + 1); }); }); return { m, n }; }));
    const kAll = loci.map(l => d.loci[l].alleles.length);
    /* frequency of allele a in pop p at locus l, optionally removing the copies of one genotype
       (leave-one-out) or replacing the reference counts by a bootstrap resample */
    const freq = (p, l, a, remove, override) => {
      const c = override ? override[l] : counts[p][l]; let na = c.m.get(a) || 0, n = c.n;
      if (remove) { remove.forEach(x => { if (String(x) === a) na--; }); n -= remove.length; }
      if (opts.method === 'rannala') return (na + 1 / kAll[l]) / (n + 1);          // Rannala & Mountain (1997)
      const f = n > 0 ? na / n : 0; return f > 0 ? f : 0.01;                     // Paetkau (1995) with the 0.01 convention
    };
    const logLik = (g /* geno row */, p, homeCopies /* per locus arrays to remove or null */, override) => {
      let ll = 0;
      loci.forEach((l, li) => {
        const gt = g[l]; if (!gt) return;
        const rem = homeCopies ? homeCopies[li] : null;
        if (ploidy === 2 && gt.length === 2) {
          const a = String(gt[0]), b = String(gt[1]);
          const pa = freq(p, l, a, rem, override), pb = freq(p, l, b, rem, override);
          ll += a === b ? Math.log(pa * pa) : Math.log(2 * pa * pb);
        } else gt.forEach(x => { ll += Math.log(freq(p, l, String(x), rem, override)); });
      });
      return ll;
    };
    /* allele counts of a bootstrap resample (with replacement) of one population's individuals */
    const bootCounts = (pi) => {
      const ids = d.pops[pi].idx, n = ids.length;
      return loci.map(l => { const m = new Map(); let tot = 0; for (let s = 0; s < n; s++) { const g = d.geno[ids[Math.floor(r() * n)]][l]; if (!g) continue; tot += g.length; g.forEach(a => { const k = String(a); m.set(k, (m.get(k) || 0) + 1); }); } return { m, n: tot }; });
    };
    const rows = [];
    const matrix = Array.from({ length: P }, () => new Array(P).fill(0));
    pops.forEach((pi, hp) => {
      d.pops[pi].idx.forEach(i => {
        const g = d.geno[i];
        const homeCopies = loci.map(l => (g[l] ? g[l] : null));
        const ll = pops.map((_, p) => logLik(g, p, p === hp ? homeCopies : null));
        let best = 0; ll.forEach((v, p) => { if (v > ll[best]) best = p; });
        /* Paetkau et al. (2004): L_max is the highest likelihood among all populations, home included,
           so the statistic is 0 for a genotype that fits home best and negative otherwise */
        const lambda = ll[hp] - Math.max(...ll);
        rows.push({ i, id: d.ind[i].id, home: hp, best, ll, llHome: ll[hp], llBest: ll[best], lambda, homeName: d.pops[pi].name, bestName: d.pops[pops[best]].name });
        matrix[hp][best]++;
      });
    });
    /* Monte Carlo: how unusual is Λ for a genuine resident? simulate genotypes from the home population */
    if (opts.sims > 0) {
      pops.forEach((pi, hp) => {
        const fr = loci.map(l => { const c = counts[hp][l]; const al = [], cum = []; let acc = 0; c.m.forEach((v, k) => { al.push(k); acc += v / c.n; cum.push(acc); }); return { al, cum }; });
        const draw = l => { const u = r(); const f = fr[l]; let k = 0; while (k < f.cum.length - 1 && u > f.cum[k]) k++; return f.al[k]; };
        /* A real resident is an independent draw from the population, scored against
           frequencies estimated from the OTHER residents. A genotype simulated from the
           estimated frequencies and scored against those same frequencies fits too well.
           So each simulated genotype is scored against an independent bootstrap
           resample of the home population — a fresh estimate with the same sampling
           noise — which puts real and simulated statistics on the same footing. */
        const simStats = [];
        for (let s = 0; s < opts.sims; s++) {
          const g = loci.map(l => (fr[l].al.length ? (ploidy === 2 ? [draw(l), draw(l)] : [draw(l)]) : null));
          const boot = bootCounts(pi);
          const ll = pops.map((_, p) => logLik(g, p, null, p === hp ? boot : null));
          simStats.push(ll[hp] - Math.max(...ll));
        }
        simStats.sort((a, b) => a - b);
        rows.filter(rw => rw.home === hp).forEach(rw => { let below = 0; while (below < simStats.length && simStats[below] <= rw.lambda) below++; rw.pMigrant = (below + 1) / (simStats.length + 1); });
      });
    }
    const self = rows.filter(rw => rw.best === rw.home).length;
    return { method: opts.method, sims: opts.sims, popNames: pops.map(pi => d.pops[pi].name), pops, rows, matrix, selfRate: self / rows.length, n: rows.length,
      migrants: rows.filter(rw => rw.pMigrant != null && rw.pMigrant < opts.alpha), alpha: opts.alpha };
  }

  window.DAPC = { alleleMatrix, pca, kmeans, findClusters, lda, looSuccess, dapc };
  window.Assign = { assignment };
})();
