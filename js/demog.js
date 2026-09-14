/* PopGeneticsPro — Block 9 engine: demographic history and fine-scale spatial structure.

   Bottlenecks ......... heterozygosity excess (Cornuet & Luikart 1996): for each locus the
                         expected heterozygosity at mutation–drift equilibrium, given the observed
                         number of alleles and sample size, is obtained by coalescent simulation
                         under the IAM, the SMM and the two-phase model (Di Rienzo et al. 1994),
                         accepting only samples with the observed number of alleles; sign test and
                         standardized-differences test as in Piry, Luikart and Cornuet (1999); the
                         Wilcoxon signed-rank test on normal scores of each locus within its equilibrium
                         distribution (on raw differences the skew of He given k gives false excesses);
                         n(2 − F) independent gene copies simulated when F_IS > 0;
                         mode shift (Luikart et al. 1998); M-ratio (Garza & Williamson 2001)
   Effective size ...... linkage-disequilibrium method (Hill 1981) with the sampling bias
                         corrections of Waples (2006) and the composite Burrows disequilibrium
                         (Weir 1979) (Waples 2006); jackknife over loci;
                         heterozygote-excess method (Pudovkin et al. 1996; Zhdanova & Pudovkin 2008)
   Spatial structure ... kinship of Loiselle et al. (1995) for codominant data, the multivariate
                         autocorrelation r of Smouse & Peakall (1999) for any distance; pairs within
                         populations (combined over them) or all pairs; distance classes, permutation
                         envelope, regression slope b_F on ln(distance),
                         Sp = −b_F/(1 − F₍₁₎) (Vekemans & Hardy 2004), neighbourhood size Nb = 1/Sp
   Mating system ....... equilibrium selfing rate s = 2F/(1 + F) with bootstrap over loci
   Q_ST / P_ST ......... P_ST = c·σ²_B / (c·σ²_B + 2·h²·σ²_W) (Brommer 2011; Leinonen et al. 2013),
                         exact confidence limits from the F distribution of the one-way ANOVA */

(function () {

  const mean = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
  const sd = a => { if (a.length < 2) return null; const m = mean(a); return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1)); };
  /* quantile of the F distribution by bisection on its distribution function */
  const qf = (p, df1, df2) => {
    let lo = 0, hi = 1;
    while (S.pf(hi, df1, df2) < p && hi < 1e12) hi *= 2;
    for (let it = 0; it < 200 && hi - lo > 1e-12 * Math.max(1, hi); it++) { const mid = (lo + hi) / 2; if (S.pf(mid, df1, df2) < p) lo = mid; else hi = mid; }
    return (lo + hi) / 2;
  };

  /* ================================================================
     1 · BOTTLENECKS: heterozygosity excess by coalescent simulation
     ================================================================ */
  /* simulate one sample of nGenes under a mutation model; returns {k, He} */
  function simSample(nGenes, theta, model, pSingle, sigma2, r) {
    /* coalescent tree as a list of branches with descendant leaf sets */
    let lineages = Array.from({ length: nGenes }, (_, i) => ({ leaves: [i], len: 0 }));
    const branches = [];
    while (lineages.length > 1) {
      const kk = lineages.length;
      const t = -Math.log(r() || 1e-12) / (kk * (kk - 1) / 2);
      lineages.forEach(b => { b.len += t; });
      const i = Math.floor(r() * kk); let j = Math.floor(r() * (kk - 1)); if (j >= i) j++;
      branches.push(lineages[i], lineages[j]);
      const merged = { leaves: lineages[i].leaves.concat(lineages[j].leaves), len: 0 };
      lineages = lineages.filter((_, q) => q !== i && q !== j); lineages.push(merged);
    }
    const T = branches.reduce((s, b) => s + b.len, 0);
    const lambda = theta * T / 2;
    let M = 0; { const Lm = Math.exp(-lambda); let p = 1; do { M++; p *= r(); } while (p > Lm); M--; }
    const cum = []; let acc = 0; branches.forEach(b => { acc += b.len; cum.push(acc); });
    /* allele state per leaf: IAM → set of mutation ids (any mutation makes a new allele);
       SMM/TPM → integer size = sum of steps */
    const state = new Array(nGenes).fill(0);
    const iamKey = model === 'iam' ? Array.from({ length: nGenes }, () => []) : null;
    /* geometric multi-step: variance σ² of the step size → success probability q with var = (1−q)/q² */
    const q = sigma2 > 0 ? (Math.sqrt(1 + 4 * sigma2) - 1) / (2 * sigma2) : 1;
    for (let m = 0; m < M; m++) {
      const u = r() * T; let bi = 0; while (bi < cum.length - 1 && u > cum[bi]) bi++;
      const leaves = branches[bi].leaves;
      if (model === 'iam') { leaves.forEach(l => iamKey[l].push(m)); continue; }
      let step = 1;
      if (model === 'tpm' && r() > pSingle) { step = 0; do { step++; } while (r() > q); }   // geometric ≥ 1
      const dir = r() < 0.5 ? -1 : 1;
      leaves.forEach(l => { state[l] += dir * step; });
    }
    const counts = new Map();
    if (model === 'iam') iamKey.forEach(keyArr => { const k = keyArr.sort((a, b) => a - b).join(','); counts.set(k, (counts.get(k) || 0) + 1); });
    else state.forEach(s => counts.set(s, (counts.get(s) || 0) + 1));
    let sumSq = 0; counts.forEach(c => { sumSq += (c / nGenes) ** 2; });
    return { k: counts.size, He: (nGenes / (nGenes - 1)) * (1 - sumSq) };
  }
  /* expected He given k alleles in a sample of nGenes: rejection sampling with θ tuned so that E[k] ≈ k */
  function heqGivenK(nGenes, k, model, opts, r) {
    if (k < 2) return null;
    const pSingle = opts.pSingle == null ? 0.95 : opts.pSingle, sigma2 = opts.sigma2 == null ? 12 : opts.sigma2;
    /* start from the IAM expectation E[k] = Σ θ/(θ+i) and tune multiplicatively on pilot runs */
    let theta = 0.5;
    for (let it = 0; it < 60; it++) { let ek = 0; for (let i = 0; i < nGenes; i++) ek += theta / (theta + i); if (ek >= k) break; theta *= 1.25; }
    for (let round = 0; round < 6; round++) {
      let sum = 0; const pilot = 40;
      for (let s = 0; s < pilot; s++) sum += simSample(nGenes, theta, model, pSingle, sigma2, r).k;
      const mk = sum / pilot;
      if (Math.abs(mk - k) < 0.35) break;
      theta *= Math.pow(k / Math.max(1.01, mk), 1.1);
    }
    const target = opts.accept || 300, maxTrials = target * 60;
    const He = [];
    for (let t = 0; t < maxTrials && He.length < target; t++) { const s = simSample(nGenes, theta, model, pSingle, sigma2, r); if (s.k === k) He.push(s.He); }
    if (He.length < 20) return null;
    return { mean: mean(He), sd: sd(He), values: He, n: He.length, theta };
  }
  /* Wilcoxon signed-rank one-tailed P for excess (positive differences) — exact for ≤ 20 loci, normal beyond */
  function wilcoxonExcess(diffs) {
    const d = diffs.filter(v => v !== 0);
    const n = d.length; if (n < 4) return { pExcess: null, pDeficit: null, pTwo: null, n };
    const ranks = d.map(v => Math.abs(v)).map((v, i, arr) => arr.filter(x => x < v).length + (arr.filter(x => x === v).length + 1) / 2);
    let Wplus = 0; d.forEach((v, i) => { if (v > 0) Wplus += ranks[i]; });
    if (n <= 20) {
      /* enumerate all 2^n sign patterns over the ranks */
      const total = 1 << n; const dist = new Map();
      for (let mask = 0; mask < total; mask++) { let w = 0; for (let i = 0; i < n; i++) if (mask & (1 << i)) w += ranks[i]; const key = Math.round(w * 2); dist.set(key, (dist.get(key) || 0) + 1); }
      let ge = 0, le = 0; const key = Math.round(Wplus * 2);
      dist.forEach((c, k) => { if (k >= key) ge += c; if (k <= key) le += c; });
      return { pExcess: ge / total, pDeficit: le / total, pTwo: Math.min(1, 2 * Math.min(ge, le) / total), n, W: Wplus };
    }
    const mu = n * (n + 1) / 4, sig = Math.sqrt(n * (n + 1) * (2 * n + 1) / 24);
    const z = (Wplus - mu) / sig;
    return { pExcess: 1 - S.pnorm(z), pDeficit: S.pnorm(z), pTwo: 2 * (1 - S.pnorm(Math.abs(z))), n, W: Wplus };
  }
  function bottleneck(d, popIdx, opts, r) {
    const idx = d.pops[popIdx].idx;
    const models = opts.models || ['iam', 'tpm', 'smm'];
    const loci = [];
    /* inbreeding: the two copies of a plant descend from one ancestral copy with probability F, so n
       plants carry about n(2 − F) independent copies; the equilibrium is simulated for that many,
       otherwise selfing alone shows as heterozygosity excess */
    let F = 0;
    if (opts.inbreedingAdjust !== false && typeof HWE !== 'undefined') {
      let b = 0, c = 0;
      for (let l = 0; l < d.nLoci; l++) { const T = HWE.genotypeTable(d, idx, l); if (T.k < 2 || T.n < 5) continue; const w = HWE.wcComponents(T); b += w.b; c += w.c; }
      F = (b + c) > 0 ? Math.max(0, 1 - c / (b + c)) : 0;
    }
    for (let l = 0; l < d.nLoci; l++) {
      const cnt = new Map(); let n = 0;
      idx.forEach(i => { const g = d.geno[i][l]; if (!g) return; n++; g.forEach(a => cnt.set(String(a), (cnt.get(String(a)) || 0) + 1)); });
      const nGenes = 2 * n; if (nGenes < 8) continue;
      let sumSq = 0; cnt.forEach(c => { sumSq += (c / nGenes) ** 2; });
      const He = (nGenes / (nGenes - 1)) * (1 - sumSq), k = cnt.size;
      const nSim = F > 0 ? Math.max(k + 2, Math.round(n * (2 - F))) : nGenes;
      const row = { locus: d.loci[l].name, l, n, k, He, nGenes, nSim };
      if (k >= 2) models.forEach(m => {
        const eq = heqGivenK(nSim, k, m, opts, r);
        if (!eq) { row[m] = null; return; }
        const std = eq.sd > 0 ? (He - eq.mean) / eq.sd : 0;
        const pEx = eq.values.filter(v => v >= He).length / eq.n;   // P(Heq ≥ He): small = excess
        /* probability that a locus at equilibrium shows an excess at all (He > mean Heq): the sign
           test adds these up; it must not depend on the observed He */
        const pEq = eq.values.filter(v => v > eq.mean).length / eq.n;
        /* position of the observed He within its own equilibrium distribution (mid-p), as a normal score */
        const below = eq.values.filter(v => v < He - 1e-9).length, tied = eq.values.filter(v => Math.abs(v - He) <= 1e-9).length;
        const u = Math.min(1 - 0.5 / eq.n, Math.max(0.5 / eq.n, (below + 0.5 * tied) / eq.n));
        row[m] = { Heq: eq.mean, sdHeq: eq.sd, diff: He - eq.mean, std, pExcess: pEx, pDeficit: 1 - pEx, pEq, u, z: S.qnorm(u), nAccepted: eq.n };
      });
      loci.push(row);
    }
    /* summary tests per model */
    const tests = {};
    models.forEach(m => {
      const rows = loci.filter(x => x[m]);
      if (!rows.length) { tests[m] = null; return; }
      const diffs = rows.map(x => x[m].diff), stds = rows.map(x => x[m].std);
      const nEx = diffs.filter(v => v > 0).length;
      /* sign test: expected number of loci with excess = Σ P(excess) at equilibrium (Cornuet & Luikart 1996) */
      const expEx = rows.reduce((s, x) => s + x[m].pEq, 0);
      const varEx = rows.reduce((s, x) => s + x[m].pEq * (1 - x[m].pEq), 0);
      const zSign = varEx > 0 ? (nEx - expEx) / Math.sqrt(varEx) : 0;
      const T2 = stds.reduce((s, v) => s + v, 0) / Math.sqrt(stds.length);
      tests[m] = { nLoci: rows.length, nExcess: nEx, nDeficit: diffs.filter(v => v < 0).length, expectedExcess: expEx, pSign: 1 - S.pnorm(zSign), T2, pT2: 1 - S.pnorm(T2), wilcoxon: wilcoxonExcess(rows.map(x => x[m].z)) };
    });
    return { pop: d.pops[popIdx].name, n: idx.length, loci, tests, models, F };
  }

  /* mode shift: allele frequency classes pooled over loci (Luikart et al. 1998) */
  function modeShift(d, popIdx) {
    const idx = d.pops[popIdx].idx;
    const classes = new Array(10).fill(0); let total = 0;
    for (let l = 0; l < d.nLoci; l++) {
      const cnt = new Map(); let n = 0;
      idx.forEach(i => { const g = d.geno[i][l]; if (!g) return; g.forEach(a => { cnt.set(String(a), (cnt.get(String(a)) || 0) + 1); n++; }); });
      cnt.forEach(c => { const f = c / n; classes[Math.min(9, Math.floor(f * 10))]++; total++; });
    }
    const prop = classes.map(c => c / Math.max(1, total));
    return { classes, prop, total, lShaped: classes[0] >= Math.max(...classes.slice(1)), shifted: classes[0] < Math.max(...classes.slice(1)) };
  }

  /* M-ratio: alleles / (range in repeat units + 1); allele codes read as fragment sizes divided by the motif */
  function mRatio(d, popIdx, motif) {
    const idx = d.pops[popIdx].idx, rows = [];
    for (let l = 0; l < d.nLoci; l++) {
      const sizes = new Set();
      idx.forEach(i => { const g = d.geno[i][l]; if (g) g.forEach(a => { const v = Number(a); if (isFinite(v)) sizes.add(v); }); });
      if (sizes.size < 2) continue;
      const vals = [...sizes];
      const range = (Math.max(...vals) - Math.min(...vals)) / (motif || 1);
      rows.push({ locus: d.loci[l].name, k: vals.length, range, M: vals.length / (range + 1) });
    }
    return { rows, mean: mean(rows.map(x => x.M)), nBelow: rows.filter(x => x.M < 0.68).length };
  }

  /* ================================================================
     2 · EFFECTIVE POPULATION SIZE
     ================================================================ */
  /* LD method: composite Burrows Δ for every allele pair of every locus pair */
  function neLD(d, popIdx, opts) {
    const idx = d.pops[popIdx].idx, pcrit = opts.pcrit == null ? 0.02 : opts.pcrit;
    const L = d.nLoci;
    /* per locus: alleles above pcrit, per-individual dosage vectors */
    const loc = [];
    for (let l = 0; l < L; l++) {
      const cnt = new Map(); let n = 0;
      idx.forEach(i => { const g = d.geno[i][l]; if (!g) return; n++; g.forEach(a => cnt.set(String(a), (cnt.get(String(a)) || 0) + 1)); });
      if (n < 5) { loc.push(null); continue; }
      const alleles = [...cnt.keys()].filter(a => cnt.get(a) / (2 * n) >= pcrit && cnt.get(a) / (2 * n) <= 1 - pcrit);
      if (alleles.length < 1) { loc.push(null); continue; }
      /* drop one allele at biallelic loci (it carries no independent information) */
      const use = alleles.length === 2 ? alleles.slice(0, 1) : alleles;
      loc.push({ alleles: use, n });
    }
    const dosage = (i, l, a) => { const g = d.geno[i][l]; if (!g) return null; return g.filter(x => String(x) === a).length; };
    const comparisons = [];   // {la, lb, r2, S}
    for (let a = 0; a < L; a++) for (let b = a + 1; b < L; b++) {
      if (!loc[a] || !loc[b]) continue;
      const ids = idx.filter(i => d.geno[i][a] && d.geno[i][b]); const n = ids.length; if (n < 5) continue;
      const pairR2 = [];
      loc[a].alleles.forEach(A => loc[b].alleles.forEach(B => {
        const xa = ids.map(i => dosage(i, a, A)), xb = ids.map(i => dosage(i, b, B));
        const pA = mean(xa) / 2, pB = mean(xb) / 2;
        const PAA = xa.filter(v => v === 2).length / n, PBB = xb.filter(v => v === 2).length / n;
        const DA = PAA - pA * pA, DB = PBB - pB * pB;                         // Hardy–Weinberg disequilibria
        let s = 0; for (let i = 0; i < n; i++) s += xa[i] * xb[i];
        const delta = (n / (n - 1)) * (s / (2 * n) - 2 * pA * pB);            // composite Burrows Δ, sample corrected
        const den = (pA * (1 - pA) + DA) * (pB * (1 - pB) + DB);
        if (den > 0) pairR2.push(delta * delta / den);
      }));
      if (pairR2.length) comparisons.push({ la: a, lb: b, r2: mean(pairR2), nPairs: pairR2.length, S: n });
    }
    if (comparisons.length < 3) return null;
    const estimate = (comps) => {
      const w = comps.map(c => c.nPairs);
      const r2 = comps.reduce((s, c, i) => s + c.r2 * w[i], 0) / w.reduce((s, v) => s + v, 0);
      const Sh = w.reduce((s, v) => s + v, 0) / comps.reduce((s, c, i) => s + w[i] / c.S, 0);      // harmonic mean sample size
      const expected = Sh >= 30 ? 1 / Sh + 3.19 / (Sh * Sh) : 0.0018 + 0.907 / Sh + 4.44 / (Sh * Sh);
      const rd = r2 - expected;
      let Ne;
      if (rd <= 0) Ne = Infinity;
      else if (Sh >= 30) { const disc = 1 / 9 - 2.76 * rd; Ne = disc >= 0 ? (1 / 3 + Math.sqrt(disc)) / (2 * rd) : (1 / 3) / (2 * rd); }
      else { const disc = 0.308 * 0.308 - 2.08 * rd; Ne = disc >= 0 ? (0.308 + Math.sqrt(disc)) / (2 * rd) : 0.308 / (2 * rd); }
      return { r2, expected, rDrift: rd, Ne, Sh, nComparisons: comps.length };
    };
    const est = estimate(comparisons);
    /* jackknife over loci: drop every comparison involving locus l */
    const lociUsed = [...new Set([].concat(...comparisons.map(c => [c.la, c.lb])))];
    const pseudo = lociUsed.map(l => estimate(comparisons.filter(c => c.la !== l && c.lb !== l))).filter(e => e && isFinite(e.rDrift));
    let ci = null;
    if (pseudo.length > 2) {
      const m = lociUsed.length;
      const rds = pseudo.map(e => e.rDrift), mr = mean(rds);
      const seRd = Math.sqrt((m - 1) / m * rds.reduce((s, v) => s + (v - mr) ** 2, 0));
      const lo = est.rDrift - 1.96 * seRd, hi = est.rDrift + 1.96 * seRd;
      const neOf = rd => rd <= 0 ? Infinity : (est.Sh >= 30 ? (1 / 3 + Math.sqrt(Math.max(0, 1 / 9 - 2.76 * rd))) / (2 * rd) : (0.308 + Math.sqrt(Math.max(0, 0.308 ** 2 - 2.08 * rd))) / (2 * rd));
      ci = [neOf(hi), neOf(lo)];
    }
    return Object.assign(est, { ci, pcrit, nLoci: lociUsed.length });
  }
  /* heterozygote-excess method (Pudovkin et al. 1996) */
  function neHetExcess(d, popIdx) {
    const idx = d.pops[popIdx].idx; const Ds = [];
    for (let l = 0; l < d.nLoci; l++) {
      const cnt = new Map(); let n = 0, het = 0;
      idx.forEach(i => { const g = d.geno[i][l]; if (!g) return; n++; g.forEach(a => cnt.set(String(a), (cnt.get(String(a)) || 0) + 1)); if (String(g[0]) !== String(g[1])) het++; });
      if (n < 5 || cnt.size < 2) continue;
      let sumSq = 0; cnt.forEach(c => { sumSq += (c / (2 * n)) ** 2; });
      /* unbiased He: the plain 1 − Σp² of a sample of n plants falls short by 1/(2n), which alone
         would show as an excess of heterozygotes and give N_e ≈ n in any large population */
      const He = (2 * n / (2 * n - 1)) * (1 - sumSq), Ho = het / n;
      if (He > 0) Ds.push((Ho - He) / He);
    }
    if (!Ds.length) return null;
    const D = mean(Ds);
    const neOf = x => x > 0 ? 1 / (2 * x) + 1 / (2 * (x + 1)) : Infinity;
    /* limits from the spread of D among loci: when D is not clearly above zero the upper limit is ∞ */
    const se = Ds.length > 2 ? sd(Ds) / Math.sqrt(Ds.length) : null;
    return { D, seD: se, nLoci: Ds.length, Ne: neOf(D), ci: se != null ? [neOf(D + 1.96 * se), neOf(D - 1.96 * se)] : null };
  }

  /* ================================================================
     3 · SPATIAL GENETIC STRUCTURE
     ================================================================ */
  /* Loiselle et al. (1995) kinship between two individuals, averaged over loci (weights = allele polymorphism) */
  function loiselleMatrix(d, ids) {
    const n = ids.length, L = d.nLoci;
    /* reference frequencies over the mapped sample */
    const ref = [], nGenes = [];
    for (let l = 0; l < L; l++) { const cnt = new Map(); let g = 0; ids.forEach(i => { const gt = d.geno[i][l]; if (!gt) return; gt.forEach(a => { cnt.set(String(a), (cnt.get(String(a)) || 0) + 1); g++; }); }); const f = new Map(); cnt.forEach((c, a) => f.set(a, c / g)); ref.push(f); nGenes.push(g); }
    const F = Array.from({ length: n }, () => new Array(n).fill(0));
    for (let x = 0; x < n; x++) for (let y = x + 1; y < n; y++) {
      let num = 0, den = 0;
      for (let l = 0; l < L; l++) {
        const gi = d.geno[ids[x]][l], gj = d.geno[ids[y]][l]; if (!gi || !gj) continue;
        ref[l].forEach((p, a) => {
          const pi = gi.filter(v => String(v) === a).length / gi.length, pj = gj.filter(v => String(v) === a).length / gj.length;
          num += (pi - p) * (pj - p) + p * (1 - p) / (nGenes[l] - 1);
          den += p * (1 - p);
        });
      }
      F[x][y] = F[y][x] = den > 0 ? num / den : NaN;
    }
    return F;
  }
  /* Smouse & Peakall (1999) autocorrelation r for a distance class:
     r = Σ_{i≠j} x_ij c_ij / Σ_i x_ii c_ii over ordered pairs, i.e. 2 Σ c_ij / Σ (c_ii + c_jj) over the
     unordered pairs of the class, with C the double-centred matrix of −½ × squared distances */
  function centredMatrix(Dsq, groups) {
    const n = Dsq.length, C = Array.from({ length: n }, () => new Array(n).fill(0));
    groups.forEach(g => {
      const m = g.length, rowM = g.map(i => g.reduce((s, j) => s - 0.5 * Dsq[i][j], 0) / m), gM = rowM.reduce((s, v) => s + v, 0) / m;
      g.forEach((i, a) => g.forEach((j, b) => { C[i][j] = -0.5 * Dsq[i][j] - rowM[a] - rowM[b] + gM; }));
    });
    return C;
  }
  function smousePeakall(C, pairsInClass) {
    let num = 0, den = 0;
    pairsInClass.forEach(([i, j]) => { num += 2 * C[i][j]; den += C[i][i] + C[j][j]; });
    return den > 0 ? num / den : NaN;
  }
  function spatial(d, opts, r) {
    const mapped = i => d.ind[i].lat != null && isFinite(d.ind[i].lat) && d.ind[i].lon != null && isFinite(d.ind[i].lon);
    const ids = [], popOf = [];
    d.pops.forEach((p, pi) => p.idx.forEach(i => { if (mapped(i)) { ids.push(i); popOf.push(pi); } }));
    if (ids.length < 10) return null;
    const n = ids.length;
    const codom = d.kind === 'codominant' && d.ploidy === 2;
    /* scope: fine-scale structure is measured with pairs from the same population; pairs from
       different populations mix in the differentiation among them (Block 5) */
    const byPop = [...new Set(popOf)].map(pi => ({ pi, pos: popOf.map((q, k) => q === pi ? k : -1).filter(k => k >= 0) }));
    const several = d.declaredPops && !d.singletons && byPop.length >= 2;
    const within = several && opts.spScope !== 'all';
    const groups = within ? byPop.filter(g => g.pos.length >= 5).map(g => g.pos) : [ids.map((_, k) => k)];
    const skipped = within ? byPop.filter(g => g.pos.length < 5).map(g => d.pops[g.pi].name) : [];
    const geo = GD.geoMatrix(ids.map(i => ({ lat: d.ind[i].lat, lon: d.ind[i].lon })));
    const pairs = [];
    groups.forEach(g => { for (let a = 0; a < g.length; a++) for (let b = a + 1; b < g.length; b++) { const i = g[a], j = g[b]; if (geo.D[i][j] > 0) pairs.push({ i, j, dist: geo.D[i][j] }); } });
    const base = { n, codom, scope: within ? 'within' : 'all', several, nGroups: groups.length, skipped, method: codom ? 'Loiselle kinship F_ij' : 'Smouse & Peakall r' };
    if (pairs.length < 30) return Object.assign(base, { error: 'fewer than 30 pairs of plants at different locations' + (within ? ' within the populations' : '') });
    /* fine-scale data read better in metres */
    let unit = geo.unit, scale = 1;
    if (unit === 'km' && pairs.every(p => p.dist < 5)) { unit = 'm'; scale = 1000; }
    pairs.forEach(p => { p.dist *= scale; });
    /* pairwise statistic: Loiselle kinship with the reference frequencies of each group, or the
       Smouse–Peakall matrix from a squared distance centred within each group */
    let kin = null, C = null;
    if (codom) {
      kin = Array.from({ length: n }, () => new Array(n).fill(NaN));
      groups.forEach(g => { const K = loiselleMatrix(d, g.map(k => ids[k])); g.forEach((i, a) => g.forEach((j, b) => { kin[i][j] = K[a][b]; })); });
    } else {
      const loci = d.loci.map((_, l) => l);
      const Dsq = GD.indDistance(d, ids, d.kind === 'dominant' ? 'euclid' : 'pdist', loci);
      C = centredMatrix(Dsq, groups);
    }
    /* distance classes: equal number of pairs per class */
    pairs.sort((a, b) => a.dist - b.dist);
    const nClasses = Math.max(2, Math.min(opts.classes || 10, Math.floor(pairs.length / 30)));
    const per = Math.ceil(pairs.length / nClasses);
    const classes = [];
    for (let c = 0; c < nClasses; c++) {
      const set = pairs.slice(c * per, (c + 1) * per); if (!set.length) continue;
      classes.push({ lo: set[0].dist, hi: set[set.length - 1].dist, mean: mean(set.map(p => p.dist)), pairs: set.map(p => [p.i, p.j]), nPairs: set.length });
    }
    const statOf = (cls, perm) => {
      const pr = perm ? cls.pairs.map(([i, j]) => [perm[i], perm[j]]) : cls.pairs;
      if (codom) return mean(pr.map(([i, j]) => kin[i][j]).filter(v => isFinite(v)));
      return smousePeakall(C, pr);
    };
    classes.forEach(c => { c.value = statOf(c, null); });
    /* permutation envelope: individuals shuffled over the locations of their own group */
    const perms = opts.perms || 999;
    const permVals = classes.map(() => []);
    const order = Array.from({ length: n }, (_, i) => i);
    const shuffleGroups = () => groups.forEach(g => { for (let a = g.length - 1; a > 0; a--) { const b = Math.floor(r() * (a + 1)); const t = order[g[a]]; order[g[a]] = order[g[b]]; order[g[b]] = t; } });
    for (let p = 0; p < perms; p++) { shuffleGroups(); classes.forEach((c, ci) => permVals[ci].push(statOf(c, order))); }
    classes.forEach((c, ci) => {
      const v = permVals[ci].sort((a, b) => a - b);
      c.lo95 = S.quantile(v, 0.025); c.hi95 = S.quantile(v, 0.975);
      c.p = (v.filter(x => x >= c.value).length + 1) / (perms + 1);
      c.pTwo = Math.min(1, 2 * Math.min((v.filter(x => x >= c.value).length + 1) / (perms + 1), (v.filter(x => x <= c.value).length + 1) / (perms + 1)));
    });
    /* regression of the pairwise statistic on ln(distance) → b_F, Sp, Nb (codominant) */
    let reg = null, Sp = null, Nb = null, bP = null;
    if (codom) {
      const x = pairs.map(p => Math.log(p.dist)), y = pairs.map(p => kin[p.i][p.j]);
      reg = GD.regression(x, y);
      if (reg) {
        const F1 = classes[0].value;
        Sp = -reg.slope / (1 - F1); Nb = Sp > 0 ? 1 / Sp : Infinity;
        /* permutation P of the slope */
        let le = 0; const nP = Math.min(perms, 499);
        for (let p = 0; p < nP; p++) { shuffleGroups(); const yp = pairs.map(q => kin[order[q.i]][order[q.j]]); const rp = GD.regression(x, yp); if (rp && rp.slope <= reg.slope) le++; }
        bP = (le + 1) / (nP + 1);
      }
    } else {
      /* for distance-based r: regression of r per class on ln(mean distance) */
      reg = GD.regression(classes.map(c => Math.log(c.mean)), classes.map(c => c.value));
    }
    /* extent of positive structure: first class whose value falls inside the envelope */
    let extent = null; for (const c of classes) { if (c.value <= c.hi95) { extent = c.lo; break; } }
    return Object.assign(base, { unit, nPairs: pairs.length, classes, perms, reg, Sp, Nb, bP, extent, meanKinFirst: classes[0].value });
  }

  /* ================================================================
     4 · MATING SYSTEM from F_IS
     ================================================================ */
  function selfing(d, opts, r) {
    const boot = opts.boot || 1000;
    const out = [];
    d.pops.forEach(p => {
      if (p.idx.length < 5) return;
      const perLocus = [];
      for (let l = 0; l < d.nLoci; l++) { const T = HWE.genotypeTable(d, p.idx, l); if (T.k < 2 || T.n < 5) continue; const w = HWE.wcComponents(T); perLocus.push(w); }
      if (perLocus.length < 2) return;
      const fOf = set => { let b = 0, c = 0; set.forEach(w => { b += w.b; c += w.c; }); return (b + c) > 0 ? 1 - c / (b + c) : null; };
      const f = fOf(perLocus);
      const sOf = F => F == null ? null : (F > 0 ? 2 * F / (1 + F) : 0);
      const boots = [];
      for (let b = 0; b < boot; b++) { const pick = []; for (let i = 0; i < perLocus.length; i++) pick.push(perLocus[Math.floor(r() * perLocus.length)]); const v = fOf(pick); if (v != null) boots.push(v); }
      boots.sort((a, b) => a - b);
      out.push({ pop: p.name, n: p.idx.length, nLoci: perLocus.length, f, s: sOf(f), fCI: boots.length ? [S.quantile(boots, 0.025), S.quantile(boots, 0.975)] : null, sCI: boots.length ? [sOf(S.quantile(boots, 0.025)), sOf(S.quantile(boots, 0.975))] : null });
    });
    return out;
  }

  /* ================================================================
     5 · P_ST for traits
     ================================================================ */
  function pst(d, opts, r) {
    const vars = d.traits.vars, V = d.traits.values;
    const c = opts.c == null ? 1 : opts.c, h2 = opts.h2 == null ? 1 : opts.h2;
    const pops = d.pops.filter(p => p.idx.length >= 2);
    const rows = vars.map((v, j) => {
      if (v.kind !== 'quantitative' && v.kind !== 'discrete') return null;
      const groups = pops.map(p => p.idx.map(i => V[i][j]).filter(x => x != null && isFinite(x))).filter(g => g.length >= 2);
      if (groups.length < 2) return null;
      const oneWay = gs => {
        const all = [].concat(...gs), N = all.length, G = gs.length, gm = mean(all);
        let ssb = 0, ssw = 0; gs.forEach(g => { const m = mean(g); ssb += g.length * (m - gm) ** 2; g.forEach(x => { ssw += (x - m) ** 2; }); });
        const msb = ssb / (G - 1), msw = ssw / (N - G);
        const n0 = (N - gs.reduce((s, g) => s + g.length * g.length, 0) / N) / (G - 1);
        const sB = Math.max(0, (msb - msw) / n0), sW = msw;
        const F = msw > 0 ? msb / msw : Infinity;
        return { sB, sW, F, df1: G - 1, df2: N - G, n0, p: isFinite(F) ? 1 - S.pf(F, G - 1, N - G) : 0 };
      };
      const a = oneWay(groups);
      const pstOf = (sB, sW) => (c * sB + 2 * h2 * sW) > 0 ? (c * sB) / (c * sB + 2 * h2 * sW) : 0;
      const P = pstOf(a.sB, a.sW);
      /* exact limits for λ = σ²_B/σ²_W in the one-way random model: F/(1 + n₀λ) follows an F
         distribution with G − 1 and N − G degrees of freedom (Searle, Casella & McCulloch 1992);
         P_ST rises with λ, so the limits carry over. The among-population variance rests on
         G − 1 degrees of freedom, and with few populations the interval is wide. */
      const lam = q => isFinite(a.F) ? Math.max(0, (a.F / qf(q, a.df1, a.df2) - 1) / a.n0) : Infinity;
      const pstOfLam = l => !isFinite(l) ? 1 : (c * l) / (c * l + 2 * h2);
      const ci = [pstOfLam(lam(0.975)), pstOfLam(lam(0.025))];
      return { trait: v.name, sB: a.sB, sW: a.sW, F: a.F, p: a.p, df1: a.df1, df2: a.df2, Pst: P, ci };
    }).filter(Boolean);
    return { rows, c, h2, nPops: pops.length };
  }

  /* ================================================================
     6 · THE WHOLE ANALYSIS
     ================================================================ */
  const DEFAULTS = { accept: 300, models: ['iam', 'tpm', 'smm'], pSingle: 0.95, sigma2: 12, motif: 2, pcrit: 0.02, classes: 10, perms: 999, spScope: 'within', boot: 1000, seed: 1, c: 1, h2: 1 };

  function compute(d, options) {
    const opts = Object.assign({}, DEFAULTS, options || {});
    const r = rng(opts.seed);
    const codom = d.kind === 'codominant' && d.ploidy === 2;
    const R = { opts, codom, kind: d.kind };
    const bigPops = d.pops.map((p, i) => i).filter(i => d.pops[i].idx.length >= 10 && d.declaredPops && !d.singletons);
    if (codom && bigPops.length && opts.doBottleneck !== false) {
      R.bottleneck = bigPops.map(pi => Object.assign(bottleneck(d, pi, opts, r), { modeShift: modeShift(d, pi), mRatio: mRatio(d, pi, opts.motif) }));
    }
    if (codom && bigPops.length) {
      R.ne = bigPops.map(pi => ({ pop: d.pops[pi].name, n: d.pops[pi].idx.length, ld: neLD(d, pi, opts), het: neHetExcess(d, pi) }));
    }
    if (d.kind !== 'morph' && d.nLoci > 0) R.spatial = spatial(d, opts, r);
    if (codom && d.declaredPops && !d.singletons) R.selfing = selfing(d, opts, r);
    if (d.kind === 'morph' && d.traits) R.pst = pst(d, opts, r);
    return R;
  }

  window.Demog = { compute, bottleneck, heqGivenK, simSample, wilcoxonExcess, modeShift, mRatio, neLD, neHetExcess, loiselleMatrix, centredMatrix, smousePeakall, spatial, selfing, pst, qf, DEFAULTS };
})();
