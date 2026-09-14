/* PopGeneticsPro — Block 4 engine: Hardy–Weinberg equilibrium, inbreeding,
   null alleles and linkage disequilibrium.

   Methods, named where they are used:
     chi-square goodness of fit ........... classical; df = k(k−1)/2
     exact test ........................... conditional on allele counts, Monte Carlo by
                                            allele shuffling (Guo & Thompson 1992);
                                            one-sided deficit/excess (Rousset & Raymond 1995)
     F_IS ................................. Weir & Cockerham (1984) f; Nei & Chesser (1983)
     equilibrium selfing rate ............. s = 2F/(1+F)
     null alleles ......................... Chakraborty et al. (1992); Brookfield (1996) eq. 1;
                                            EM of Dempster et al. (1977) (Chapuis and Estoup 2007)
     multilocus linkage disequilibrium .... I_A and r̄_d (Brown et al. 1980; Agapow & Burt 2001)
     pairwise LD .......................... r̄_d per pair; r² and D′ for biallelic pairs with
                                            EM haplotype frequencies (Excoffier & Slatkin 1995)
     multiple testing ..................... Bonferroni; Holm (1979); Benjamini & Yekutieli (2001)
     combining tests ...................... Fisher's method

   Every Monte Carlo P-value is (b + 1)/(B + 1), so it is never exactly zero. */

(function () {

  const logFact = n => S.lgamma(n + 1);

  /* ================================================================
     1 · GENOTYPE TABLE for one locus in one population
     ================================================================ */
  function genotypeTable(d, idx, l) {
    const alleles = [], aIndex = new Map();
    const genos = [];           // [ai, aj] with ai <= aj
    let blanks = 0;
    idx.forEach(i => {
      const g = d.geno[i][l];
      if (!g) { blanks++; return; }
      const codes = g.map(String);
      codes.forEach(c => { if (!aIndex.has(c)) { aIndex.set(c, alleles.length); alleles.push(c); } });
      let a = aIndex.get(codes[0]), b = aIndex.get(codes[1] != null ? codes[1] : codes[0]);
      if (a > b) { const t = a; a = b; b = t; }
      genos.push([a, b]);
    });
    const k = alleles.length, n = genos.length;
    const alleleCount = new Array(k).fill(0);
    const cell = new Array(k * k).fill(0);     // upper triangle, index a*k+b with a<=b
    let het = 0;
    genos.forEach(([a, b]) => { alleleCount[a]++; alleleCount[b]++; cell[a * k + b]++; if (a !== b) het++; });
    return { alleles, k, n, genos, alleleCount, cell, het, blanks };
  }

  /* ================================================================
     2 · HARDY–WEINBERG TESTS
     ================================================================ */

  /* chi-square goodness of fit on genotype counts */
  function chiSquareHWE(T) {
    const { k, n, alleleCount, cell } = T;
    if (k < 2 || n < 2) return { chi2: null, df: 0, p: null, smallExpected: false };
    const p = alleleCount.map(c => c / (2 * n));
    let chi2 = 0, small = false;
    for (let a = 0; a < k; a++) for (let b = a; b < k; b++) {
      const E = a === b ? n * p[a] * p[a] : 2 * n * p[a] * p[b];
      if (E <= 0) continue;
      if (E < 5) small = true;
      const O = cell[a * k + b];
      chi2 += (O - E) * (O - E) / E;
    }
    const df = k * (k - 1) / 2;
    return { chi2, df, p: 1 - S.pchisq(chi2, df), smallExpected: small };
  }

  /* the part of the log-probability of a genotype table that changes when
     alleles are re-paired: n_het·ln2 − Σ ln(n_ij!)  (Levene 1949) */
  function tableStat(cell, het) {
    let s = het * Math.LN2;
    for (let i = 0; i < cell.length; i++) if (cell[i] > 1) s -= logFact(cell[i]);
    return s;
  }

  /* Monte Carlo exact test: shuffle the 2n gene copies and re-pair them. Each
     table so produced is a draw from the conditional distribution under HWE. */
  function exactHWE(T, B, r) {
    const { k, n, alleleCount, het } = T;
    if (k < 2 || n < 2 || B < 1) return { pExact: null, pDeficit: null, pExcess: null, B: 0 };
    const obsStat = tableStat(T.cell, het);
    const pool = [];
    alleleCount.forEach((c, a) => { for (let i = 0; i < c; i++) pool.push(a); });
    const cell = new Array(k * k);
    let le = 0, hetLE = 0, hetGE = 0;
    for (let b = 0; b < B; b++) {
      shuffle(pool, r);
      cell.fill(0);
      let h = 0;
      for (let i = 0; i < pool.length; i += 2) {
        let a = pool[i], c = pool[i + 1];
        if (a > c) { const t = a; a = c; c = t; }
        cell[a * k + c]++;
        if (a !== c) h++;
      }
      if (tableStat(cell, h) <= obsStat + 1e-12) le++;
      if (h <= het) hetLE++;
      if (h >= het) hetGE++;
    }
    return {
      pExact: (le + 1) / (B + 1),
      pDeficit: (hetLE + 1) / (B + 1),   // fewer heterozygotes than the observed is at least as extreme
      pExcess: (hetGE + 1) / (B + 1),
      B,
    };
  }

  /* ================================================================
     3 · INBREEDING COEFFICIENTS
     ================================================================ */

  /* Weir & Cockerham (1984) variance components for a single sample:
     b (between individuals within the sample) and c (within individuals),
     summed over alleles. f = 1 − Σc / Σ(b + c). */
  function wcComponents(T) {
    const { k, n, alleleCount, cell } = T;
    if (n < 2) return { b: 0, c: 0 };
    let sb = 0, sc = 0;
    for (let a = 0; a < k; a++) {
      const p = alleleCount[a] / (2 * n);
      let hetA = 0;                         // heterozygotes carrying allele a
      for (let b = 0; b < k; b++) if (b !== a) hetA += cell[Math.min(a, b) * k + Math.max(a, b)];
      const hbar = hetA / n;
      const b = (n / (n - 1)) * (p * (1 - p) - ((2 * n - 1) / (4 * n)) * hbar);
      const c = hbar / 2;
      sb += b; sc += c;
    }
    return { b: sb, c: sc };
  }

  /* Nei & Chesser (1983) unbiased within-population F_IS */
  function neiChesser(T) {
    const { n, alleleCount, het } = T;
    if (n < 2) return { Ho: null, Hs: null, Fis: null };
    const Ho = het / n;
    let sumSq = 0;
    alleleCount.forEach(c => { const p = c / (2 * n); sumSq += p * p; });
    const Hs = (n / (n - 1)) * (1 - sumSq - Ho / (2 * n));
    return { Ho, Hs, Fis: Hs > 0 ? 1 - Ho / Hs : null };
  }

  /* ================================================================
     4 · NULL ALLELES
     ================================================================ */
  function nullAlleles(T, opts) {
    const { k, n, alleleCount, cell, het, blanks } = T;
    if (k < 2 || n < 5) return { chakraborty: null, brookfield: null, em: null };
    const Ho = het / n;
    let sumSq = 0;
    alleleCount.forEach(c => { const p = c / (2 * n); sumSq += p * p; });
    const He = 1 - sumSq;
    const chak = (He + Ho) > 0 ? (He - Ho) / (He + Ho) : null;
    const brook = (He - Ho) / (1 + He);

    /* EM: observed homozygotes AA may be A/null; blanks may be null/null */
    const useBlanks = !!opts.missingAsNull;
    const N = n + (useBlanks ? blanks : 0);
    const homObs = new Array(k), hetCount = new Array(k).fill(0);
    for (let a = 0; a < k; a++) {
      homObs[a] = cell[a * k + a];
      for (let b = 0; b < k; b++) if (b !== a) hetCount[a] += cell[Math.min(a, b) * k + Math.max(a, b)];
    }
    let rNull = Math.max(0.01, Math.min(0.5, brook > 0 ? brook : 0.01));
    let p = alleleCount.map(c => (c / (2 * n)) * (1 - rNull));
    for (let it = 0; it < 5000; it++) {
      let nullCopies = useBlanks ? 2 * blanks : 0;
      const pNew = new Array(k);
      for (let a = 0; a < k; a++) {
        const denom = p[a] * p[a] + 2 * p[a] * rNull;
        const aNull = denom > 0 ? homObs[a] * (2 * p[a] * rNull) / denom : 0;
        const trueAA = homObs[a] - aNull;
        pNew[a] = (2 * trueAA + hetCount[a] + aNull) / (2 * N);
        nullCopies += aNull;
      }
      const rNew = nullCopies / (2 * N);
      const delta = Math.abs(rNew - rNull) + pNew.reduce((s, v, a) => s + Math.abs(v - p[a]), 0);
      p = pNew; rNull = rNew;
      if (delta < 1e-10) break;
    }
    return { chakraborty: chak, brookfield: brook, em: rNull, He, Ho };
  }

  /* ================================================================
     5 · MULTIPLE TESTING AND COMBINED TESTS
     ================================================================ */
  function adjustP(pvals, method) {
    const m = pvals.filter(p => p != null && isFinite(p)).length;
    if (!m || method === 'none') return pvals.slice();
    const idx = pvals.map((p, i) => [p, i]).filter(x => x[0] != null && isFinite(x[0])).sort((a, b) => a[0] - b[0]);
    const out = pvals.slice();
    if (method === 'bonferroni') idx.forEach(([p, i]) => { out[i] = Math.min(1, p * m); });
    else if (method === 'holm') {
      let run = 0;
      idx.forEach(([p, i], rank) => { run = Math.max(run, Math.min(1, p * (m - rank))); out[i] = run; });
    } else if (method === 'by' || method === 'bh') {
      let cm = 1;
      if (method === 'by') { cm = 0; for (let i = 1; i <= m; i++) cm += 1 / i; }
      let run = 1;
      for (let rank = m - 1; rank >= 0; rank--) {
        const [p, i] = idx[rank];
        run = Math.min(run, Math.min(1, p * m * cm / (rank + 1)));
        out[i] = run;
      }
    }
    return out;
  }
  /* Fisher's method: −2 Σ ln p ~ χ² with 2k degrees of freedom */
  function fisherCombine(pvals) {
    const ps = pvals.filter(p => p != null && isFinite(p) && p > 0);
    if (!ps.length) return { X: null, df: 0, p: null };
    const X = -2 * ps.reduce((s, p) => s + Math.log(p), 0);
    return { X, df: 2 * ps.length, p: 1 - S.pchisq(X, 2 * ps.length), k: ps.length };
  }

  /* ================================================================
     6 · LINKAGE DISEQUILIBRIUM
     ================================================================ */

  /* per-locus vector of pairwise distances between individuals (upper
     triangle, i<j). Diploid: number of allele copies not shared (0, 1, 2).
     Dominant / haploid: 0 or 1. Missing → mean distance of the locus. */
  function locusDistanceVector(d, idx, l) {
    const n = idx.length;
    const m = n * (n - 1) / 2;
    const v = new Float64Array(m);
    const miss = new Uint8Array(m);
    let q = 0, sum = 0, cnt = 0;
    for (let i = 0; i < n; i++) {
      const gi = d.geno[idx[i]][l];
      for (let j = i + 1; j < n; j++, q++) {
        const gj = d.geno[idx[j]][l];
        if (!gi || !gj) { miss[q] = 1; continue; }
        let dist;
        if (gi.length === 1) dist = String(gi[0]) === String(gj[0]) ? 0 : 1;
        else {
          const a1 = String(gi[0]), a2 = String(gi[1]), b1 = String(gj[0]), b2 = String(gj[1]);
          const shared = (a1 === b1 && a2 === b2) || (a1 === b2 && a2 === b1) ? 2
            : (a1 === b1 || a1 === b2 || a2 === b1 || a2 === b2) ? 1 : 0;
          dist = 2 - shared;
        }
        v[q] = dist; sum += dist; cnt++;
      }
    }
    const mean = cnt ? sum / cnt : 0;
    for (let i = 0; i < m; i++) if (miss[i]) v[i] = mean;
    return v;
  }
  function variance(v) {
    let s = 0, s2 = 0;
    for (let i = 0; i < v.length; i++) { s += v[i]; s2 += v[i] * v[i]; }
    const n = v.length;
    return n > 1 ? (s2 - s * s / n) / (n - 1) : 0;
  }
  /* I_A and r̄_d from a set of locus distance vectors */
  function iaFromVectors(vecs) {
    const L = vecs.length, m = vecs[0].length;
    const D = new Float64Array(m);
    const V = vecs.map(v => variance(v));
    for (let l = 0; l < L; l++) { const v = vecs[l]; for (let i = 0; i < m; i++) D[i] += v[i]; }
    const VD = variance(D);
    const sumV = V.reduce((a, b) => a + b, 0);
    let denom = 0;
    for (let a = 0; a < L; a++) for (let b = a + 1; b < L; b++) denom += Math.sqrt(V[a] * V[b]);
    return { Ia: sumV > 0 ? VD / sumV - 1 : null, rd: denom > 0 ? (VD - sumV) / (2 * denom) : null, VD, V };
  }
  /* Genotypes of one locus as integer codes, for fast permutations: A = first
     allele, B = second (−2 when haploid or a band), −1 = missing. The mean
     distance, used for missing pairs, does not change when genotypes are shuffled. */
  function locusCodes(d, idx, l) {
    const n = idx.length, A = new Int32Array(n), B = new Int32Array(n), map = new Map();
    const code = x => { const s = String(x); if (!map.has(s)) map.set(s, map.size); return map.get(s); };
    for (let i = 0; i < n; i++) {
      const g = d.geno[idx[i]][l];
      if (!g) { A[i] = -1; B[i] = -1; }
      else if (g.length === 1) { A[i] = code(g[0]); B[i] = -2; }
      else { A[i] = code(g[0]); B[i] = code(g[1]); }
    }
    let s = 0, c = 0;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (A[i] >= 0 && A[j] >= 0) { s += codeDist(A, B, i, j); c++; }
    const mean = c ? s / c : 0;
    /* each individual gets a genotype class (0 = missing) and the distances
       between classes go in a small table, so a permutation is only look-ups */
    const cls = new Int32Array(n), reps = [-1], key = new Map();
    for (let i = 0; i < n; i++) {
      if (A[i] < 0) { cls[i] = 0; continue; }
      const k = B[i] === -2 ? A[i] + 'h' : Math.min(A[i], B[i]) + '/' + Math.max(A[i], B[i]);
      if (!key.has(k)) { key.set(k, reps.length); reps.push(i); }
      cls[i] = key.get(k);
    }
    const G = reps.length, T = new Float64Array(G * G);
    for (let a = 0; a < G; a++) for (let b = 0; b < G; b++)
      T[a * G + b] = (a === 0 || b === 0) ? mean : codeDist(A, B, reps[a], reps[b]);
    return { A, B, mean, n, cls, T, G };
  }
  function codeDist(A, B, i, j) {
    const a1 = A[i], a2 = B[i], b1 = A[j], b2 = B[j];
    if (a2 === -2) return a1 === b1 ? 0 : 1;
    const shared = (a1 === b1 && a2 === b2) || (a1 === b2 && a2 === b1) ? 2
      : (a1 === b1 || a1 === b2 || a2 === b1 || a2 === b2) ? 1 : 0;
    return 2 - shared;
  }
  /* the distance vector of a locus after shuffling its genotypes among the
     individuals; draws the same random numbers as shuffling the sample itself */
  function shuffledCodes(C, r, out) {
    const n = C.n, perm = new Array(n);
    for (let i = 0; i < n; i++) perm[i] = i;
    shuffle(perm, r);
    const { cls, T, G } = C;
    const c = new Int32Array(n);
    for (let i = 0; i < n; i++) c[i] = cls[perm[i]];
    let q = 0;
    for (let i = 0; i < n; i++) {
      const row = c[i] * G;
      for (let j = i + 1; j < n; j++, q++) out[q] = T[row + c[j]];
    }
    return out;
  }
  function multilocusLD(d, idx, loci, B, r) {
    const vecs = loci.map(l => locusDistanceVector(d, idx, l));
    const obs = iaFromVectors(vecs);
    const perms = [];
    let ge = 0;
    if (obs.rd != null && B > 0) {
      /* the variance of each locus is the same in every permutation; only the
         variance of the summed distances changes */
      const codes = loci.map(l => locusCodes(d, idx, l));
      const m = vecs[0].length, D = new Float64Array(m), tmp = new Float64Array(m);
      const sumV = obs.V.reduce((a, b) => a + b, 0);
      let denom = 0;
      for (let a = 0; a < loci.length; a++) for (let b = a + 1; b < loci.length; b++) denom += Math.sqrt(obs.V[a] * obs.V[b]);
      for (let b = 0; b < B; b++) {
        D.fill(0);
        codes.forEach(C => { shuffledCodes(C, r, tmp); for (let q = 0; q < m; q++) D[q] += tmp[q]; });
        const rd = (variance(D) - sumV) / (2 * denom);
        perms.push(rd);
        if (rd >= obs.rd - 1e-12) ge++;
      }
    }
    return { Ia: obs.Ia, rd: obs.rd, p: B && obs.rd != null ? (ge + 1) / (B + 1) : null, perms, B, n: idx.length, nLoci: loci.length };
  }
  function correlation(a, b) {
    let sa = 0, sb = 0, saa = 0, sbb = 0, sab = 0;
    const n = a.length;
    for (let i = 0; i < n; i++) { sa += a[i]; sb += b[i]; saa += a[i] * a[i]; sbb += b[i] * b[i]; sab += a[i] * b[i]; }
    const va = saa - sa * sa / n, vb = sbb - sb * sb / n, cab = sab - sa * sb / n;
    return va > 0 && vb > 0 ? cab / Math.sqrt(va * vb) : null;
  }

  /* r² and D′ for two biallelic loci. Codominant diploids: EM for haplotype
     frequencies (double heterozygotes are ambiguous). Haploid / dominant: the
     two-locus phenotypes are the haplotypes. */
  function biallelicLD(d, idx, l1, l2) {
    const codes = [l1, l2].map(l => d.loci[l].alleles.map(String).slice(0, 2));
    if (codes[0].length < 2 || codes[1].length < 2) return null;
    const A = codes[0][0], B = codes[1][0];
    let n = 0;
    if (d.ploidy === 1 || d.kind !== 'codominant') {
      const cnt = [0, 0, 0, 0];   // AB, Ab, aB, ab
      idx.forEach(i => {
        const g1 = d.geno[i][l1], g2 = d.geno[i][l2];
        if (!g1 || !g2) return;
        const a = String(g1[0]) === A ? 0 : 1, b = String(g2[0]) === B ? 0 : 1;
        cnt[a * 2 + b]++; n++;
      });
      if (n < 4) return null;
      return ldFromHap(cnt.map(c => c / n), n);
    }
    /* diploid EM */
    const classes = [];   // per individual: list of compatible haplotype pairs [h1,h2]
    idx.forEach(i => {
      const g1 = d.geno[i][l1], g2 = d.geno[i][l2];
      if (!g1 || !g2) return;
      const a = g1.map(x => (String(x) === A ? 0 : 1)), b = g2.map(x => (String(x) === B ? 0 : 1));
      const h = (x, y) => x * 2 + y;
      if (a[0] !== a[1] && b[0] !== b[1]) classes.push([[h(0, 0), h(1, 1)], [h(0, 1), h(1, 0)]]);
      else classes.push([[h(a[0], b[0]), h(a[1], b[1])]]);
      n++;
    });
    if (n < 4) return null;
    let f = [0.25, 0.25, 0.25, 0.25];
    for (let it = 0; it < 200; it++) {
      const cnt = [0, 0, 0, 0];
      classes.forEach(cl => {
        if (cl.length === 1) { cnt[cl[0][0]]++; cnt[cl[0][1]]++; return; }
        const w1 = f[cl[0][0]] * f[cl[0][1]], w2 = f[cl[1][0]] * f[cl[1][1]];
        const tot = w1 + w2 || 1;
        cnt[cl[0][0]] += w1 / tot; cnt[cl[0][1]] += w1 / tot;
        cnt[cl[1][0]] += w2 / tot; cnt[cl[1][1]] += w2 / tot;
      });
      const fn = cnt.map(c => c / (2 * n));
      const delta = fn.reduce((s, v, k) => s + Math.abs(v - f[k]), 0);
      f = fn;
      if (delta < 1e-9) break;
    }
    return ldFromHap(f, 2 * n);
  }
  function ldFromHap(f, nHap) {
    const pA = f[0] + f[1], pB = f[0] + f[2];
    const D = f[0] - pA * pB;
    const Dmax = D >= 0 ? Math.min(pA * (1 - pB), (1 - pA) * pB) : Math.min(pA * pB, (1 - pA) * (1 - pB));
    const denom = pA * (1 - pA) * pB * (1 - pB);
    const r2 = denom > 0 ? D * D / denom : null;
    return { D, Dprime: Dmax > 0 ? Math.abs(D) / Dmax : null, r2, chi2: r2 != null ? nHap * r2 : null, p: r2 != null ? 1 - S.pchisq(nHap * r2, 1) : null, pA, pB };
  }

  function pairwiseLD(d, idx, loci, Bpair, r, onProgress) {
    const vecs = loci.map(l => locusDistanceVector(d, idx, l));
    const codes = loci.map(l => locusCodes(d, idx, l));
    const tmp = new Float64Array(vecs.length ? vecs[0].length : 0);
    const pairs = [];
    const allBiallelic = loci.every(l => d.loci[l].alleles.length <= 2);
    for (let a = 0; a < loci.length; a++) for (let b = a + 1; b < loci.length; b++) {
      const rd = correlation(vecs[a], vecs[b]);
      let p = null;
      if (Bpair > 0 && rd != null) {
        let ge = 0;
        for (let k = 0; k < Bpair; k++) {
          const pv = shuffledCodes(codes[b], r, tmp);
          const rr = correlation(vecs[a], pv);
          if (rr != null && rr >= rd - 1e-12) ge++;
        }
        p = (ge + 1) / (Bpair + 1);
      }
      const bi = (d.loci[loci[a]].alleles.length <= 2 && d.loci[loci[b]].alleles.length <= 2) ? biallelicLD(d, idx, loci[a], loci[b]) : null;
      pairs.push({ a: loci[a], b: loci[b], la: d.loci[loci[a]].name, lb: d.loci[loci[b]].name, rd, p, r2: bi ? bi.r2 : null, Dprime: bi ? bi.Dprime : null, pChi: bi ? bi.p : null });
      if (onProgress) onProgress(pairs.length);
    }
    return { pairs, allBiallelic, B: Bpair };
  }

  /* ================================================================
     7 · THE WHOLE ANALYSIS
     ================================================================ */
  const DEFAULTS = { permsHWE: 1000, permsLD: 999, permsPair: 199, adjust: 'holm', alpha: 0.05, missingAsNull: false, ldScope: 'pop', seed: 1 };

  function compute(d, options) {
    const opts = Object.assign({}, DEFAULTS, options || {});
    const r = rng(opts.seed);
    const codom = d.kind === 'codominant' && d.ploidy === 2;
    const pops = d.pops.filter(p => p.idx.length >= 2);
    const nL = d.nLoci;
    const R = { opts, codom, pops: pops.map(p => p.name), popIdx: pops.map(p => d.pops.indexOf(p)), locusNames: d.loci.map(l => l.name), nLoci: nL };

    if (codom) {
      /* --- HWE, F_IS and null alleles for every population × locus --- */
      R.cells = pops.map(pop => d.loci.map((_, l) => {
        const T = genotypeTable(d, pop.idx, l);
        const chi = chiSquareHWE(T);
        const ex = exactHWE(T, opts.permsHWE, r);
        const nc = neiChesser(T);
        const wc = wcComponents(T);
        const nul = nullAlleles(T, opts);
        return {
          n: T.n, k: T.k, het: T.het, blanks: T.blanks,
          chi2: chi.chi2, dfChi: chi.df, pChi: chi.p, smallExpected: chi.smallExpected,
          pExact: ex.pExact, pDeficit: ex.pDeficit, pExcess: ex.pExcess,
          Ho: nc.Ho, Hs: nc.Hs, FisNC: nc.Fis,
          wcB: wc.b, wcC: wc.c, fWC: (wc.b + wc.c) > 0 ? 1 - wc.c / (wc.b + wc.c) : null,
          nullChak: nul.chakraborty, nullBrook: nul.brookfield, nullEM: nul.em,
        };
      }));

      /* --- adjusted P-values across all tests --- */
      const flat = [];
      R.cells.forEach((row, p) => row.forEach((c, l) => flat.push({ p, l, pv: c.pExact })));
      const adj = adjustP(flat.map(x => x.pv), opts.adjust);
      flat.forEach((x, i) => { R.cells[x.p][x.l].pAdj = adj[i]; });
      const adjChi = adjustP(flat.map(x => R.cells[x.p][x.l].pChi), opts.adjust);
      flat.forEach((x, i) => { R.cells[x.p][x.l].pChiAdj = adjChi[i]; });

      /* --- per population: multilocus f with jackknife and bootstrap --- */
      R.perPop = pops.map((pop, p) => {
        const row = R.cells[p];
        const usable = row.map((c, l) => l).filter(l => row[l].fWC != null && row[l].k >= 2);
        const ratio = ls => { let b = 0, c = 0; ls.forEach(l => { b += row[l].wcB; c += row[l].wcC; }); return (b + c) > 0 ? 1 - c / (b + c) : null; };
        const f = ratio(usable);
        /* jackknife over loci */
        let seJack = null;
        if (usable.length > 2) {
          const pseudo = usable.map(l => ratio(usable.filter(x => x !== l))).filter(v => v != null);
          const m = pseudo.reduce((a, b) => a + b, 0) / pseudo.length;
          seJack = Math.sqrt((pseudo.length - 1) / pseudo.length * pseudo.reduce((a, v) => a + (v - m) * (v - m), 0));
        }
        /* bootstrap over loci */
        let ci = null;
        if (usable.length > 2) {
          const boots = [];
          for (let b = 0; b < 1000; b++) {
            const pick = []; for (let i = 0; i < usable.length; i++) pick.push(usable[Math.floor(r() * usable.length)]);
            const v = ratio(pick); if (v != null) boots.push(v);
          }
          boots.sort((a, b) => a - b);
          ci = [S.quantile(boots, 0.025), S.quantile(boots, 0.975)];
        }
        const fisNC = row.map(c => c.FisNC).filter(v => v != null && isFinite(v));
        const nSig = row.filter(c => c.pAdj != null && c.pAdj < opts.alpha).length;
        const nDef = row.filter(c => c.pAdj != null && c.pAdj < opts.alpha && c.FisNC > 0).length;
        const nExc = row.filter(c => c.pAdj != null && c.pAdj < opts.alpha && c.FisNC < 0).length;
        const nTested = row.filter(c => c.pExact != null).length;
        const fisherAll = fisherCombine(row.map(c => c.pExact));
        return {
          pop: pop.name, n: pop.idx.length, f, seJack, ci,
          fisNC: fisNC.length ? fisNC.reduce((a, b) => a + b, 0) / fisNC.length : null,
          selfing: f != null && f > 0 ? 2 * f / (1 + f) : (f != null ? 0 : null),
          nSig, nDef, nExc, nTested, fisherP: fisherAll.p,
          meanNull: mean(row.map(c => c.nullEM).filter(v => v != null)),
        };
      });

      /* --- per locus across populations: how consistent is the deficit? --- */
      R.perLocus = d.loci.map((loc, l) => {
        const col = R.cells.map(row => row[l]);
        const fis = col.map(c => c.FisNC).filter(v => v != null && isFinite(v));
        const nSig = col.filter(c => c.pAdj != null && c.pAdj < opts.alpha).length;
        const nDef = col.filter(c => c.pAdj != null && c.pAdj < opts.alpha && c.FisNC > 0).length;
        const nulls = col.map(c => c.nullEM).filter(v => v != null);
        return {
          locus: loc.name, k: Math.max(...col.map(c => c.k)),
          meanFis: fis.length ? fis.reduce((a, b) => a + b, 0) / fis.length : null,
          nSig, nDef, nPops: col.filter(c => c.pExact != null).length,
          meanNull: mean(nulls), maxNull: nulls.length ? Math.max(...nulls) : null,
          fisherP: fisherCombine(col.map(c => c.pExact)).p,
          suspectNull: nDef >= Math.max(1, Math.ceil(col.length * 0.5)) && mean(nulls) > 0.05,
        };
      });
    }

    /* --- linkage disequilibrium --- */
    if (nL >= 2 && d.kind !== 'sequence' && d.kind !== 'morph') {
      const loci = d.loci.map((_, l) => l);
      R.ld = { perPop: [], pooled: null };
      pops.forEach(pop => {
        if (pop.idx.length < 5) { R.ld.perPop.push({ pop: pop.name, n: pop.idx.length, rd: null, Ia: null, p: null, tooSmall: true }); return; }
        const m = multilocusLD(d, pop.idx, loci, opts.permsLD, r);
        R.ld.perPop.push(Object.assign({ pop: pop.name }, m));
      });
      const all = []; d.pops.forEach(p => p.idx.forEach(i => all.push(i)));
      R.ld.pooled = Object.assign({ pop: 'All samples pooled' }, multilocusLD(d, all, loci, opts.permsLD, r));
    }
    return R;
  }

  /* pairwise LD for one scope, run on demand (it is the expensive part) */
  function computePairwise(d, scope, options) {
    const opts = Object.assign({}, DEFAULTS, options || {});
    const r = rng(opts.seed + 7);
    let idx;
    if (scope === 'pooled') { idx = []; d.pops.forEach(p => p.idx.forEach(i => idx.push(i))); }
    else idx = d.pops[scope].idx.slice();
    const loci = d.loci.map((_, l) => l);
    const res = pairwiseLD(d, idx, loci, opts.permsPair, r);
    const adj = adjustP(res.pairs.map(p => p.p), opts.adjust);
    res.pairs.forEach((p, i) => { p.pAdj = adj[i]; });
    res.n = idx.length;
    res.scope = scope === 'pooled' ? 'All samples pooled' : d.pops[scope].name;
    return res;
  }

  function mean(a) { return a.length ? a.reduce((x, y) => x + y, 0) / a.length : null; }

  window.HWE = { compute, computePairwise, genotypeTable, chiSquareHWE, exactHWE, wcComponents, neiChesser, nullAlleles, adjustP, fisherCombine, multilocusLD, pairwiseLD, biallelicLD, locusDistanceVector, iaFromVectors, DEFAULTS };
})();
