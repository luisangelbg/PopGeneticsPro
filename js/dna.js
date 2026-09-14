/* PopGeneticsPro — Block 8 engine: aligned DNA sequences.

   Sites and haplotypes ..... complete deletion of sites with gaps or ambiguities;
                              haplotypes = identical sequences over the valid sites
   Diversity ................ h, Hd (Nei 1987 eq. 8.4), π (Nei 1987 eq. 10.5, n/(n−1)
                              corrected), k (mean pairwise differences), θ_W (Watterson 1975)
   Neutrality ............... Tajima's D (1989); Fu's Fs (1997) via Ewens' sampling formula;
                              Fu & Li's D* and F* (1993, constants as corrected by Simonsen,
                              Churchill & Aquadro 1995); R₂ (Ramos-Onsins & Rozas 2002).
                              P-values by coalescent simulation (Hudson 1990) with θ = θ_W.
   Mismatch ................. observed distribution; sudden-expansion model of Rogers &
                              Harpending (1992) fitted by least squares (τ, θ₀, θ₁);
                              raggedness r (Harpending 1994)
   Structure ................ G_ST and N_ST (Pons & Petit 1996) with the permutation test of
                              N_ST > G_ST; Φ_ST by AMOVA on nucleotide differences
                              (Excoffier et al. 1992) with permutations
   Network .................. median-joining (Bandelt, Forster & Röhl 1999), ε = 0,
                              force-directed layout */

(function () {

  const OK = { A: 1, C: 1, G: 1, T: 1 };
  const isTransition = (a, b) => (a === 'A' && b === 'G') || (a === 'G' && b === 'A') || (a === 'C' && b === 'T') || (a === 'T' && b === 'C');

  /* ================================================================
     1 · SITES
     ================================================================ */
  function siteSummary(aln) {
    const n = aln.length, L = Math.min(...aln.map(s => s.length));
    const valid = [], excluded = [];
    for (let s = 0; s < L; s++) { let ok = true; for (let i = 0; i < n; i++) if (!OK[aln[i][s]]) { ok = false; break; } (ok ? valid : excluded).push(s); }
    const seg = [], informative = [], singletonSites = [];
    let ts = 0, tv = 0, eta = 0, multi = 0;
    valid.forEach(s => {
      const counts = {}; for (let i = 0; i < n; i++) counts[aln[i][s]] = (counts[aln[i][s]] || 0) + 1;
      const bases = Object.keys(counts);
      if (bases.length < 2) return;
      seg.push(s);
      eta += bases.length - 1;                     // at least one mutation per extra base
      if (bases.length > 2) multi++;
      const freqs = Object.values(counts).sort((a, b) => b - a);
      if (freqs.length >= 2 && freqs[1] >= 2) informative.push(s);
      if (freqs[freqs.length - 1] === 1 && bases.length === 2) singletonSites.push(s);
      if (bases.length === 2) { if (isTransition(bases[0], bases[1])) ts++; else tv++; }
    });
    return { n, length: L, valid, nValid: valid.length, excluded: excluded.length, seg, S: seg.length, eta, multiallelic: multi, informative: informative.length, singletons: singletonSites.length, ts, tv, tsTv: tv ? ts / tv : null };
  }

  /* ================================================================
     2 · HAPLOTYPES AND DISTANCES
     ================================================================ */
  function haplotypes(aln, valid) {
    const key = s => valid.map(p => s[p]).join('');
    const map = new Map(), hapSeq = [], hapIndex = [];
    aln.forEach(s => { const k = key(s); if (!map.has(k)) { map.set(k, hapSeq.length); hapSeq.push(k); } hapIndex.push(map.get(k)); });
    return { hapSeq, hapIndex, nHap: hapSeq.length };
  }
  function diffCount(a, b) { let d = 0; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) d++; return d; }
  function hapDistMatrix(hapSeq) {
    const H = hapSeq.length, D = Array.from({ length: H }, () => new Array(H).fill(0));
    for (let i = 0; i < H; i++) for (let j = i + 1; j < H; j++) D[i][j] = D[j][i] = diffCount(hapSeq[i], hapSeq[j]);
    return D;
  }

  /* ================================================================
     3 · DIVERSITY for a set of sequences (indices into aln)
     ================================================================ */
  const harm = (n, p) => { let s = 0; for (let i = 1; i < n; i++) s += 1 / Math.pow(i, p); return s; };

  function diversity(idx, hap, hapD, nValid) {
    const n = idx.length;
    if (n < 2) return { n, h: n ? 1 : 0, Hd: null, pi: null, k: null, S: null, thetaW: null, thetaWsite: null, eta_s: null };
    const counts = new Map(); idx.forEach(i => counts.set(hap.hapIndex[i], (counts.get(hap.hapIndex[i]) || 0) + 1));
    let sumSq = 0; counts.forEach(c => { sumSq += (c / n) ** 2; });
    const Hd = (n / (n - 1)) * (1 - sumSq);
    /* mean pairwise differences and segregating sites within the set */
    let k = 0, pairs = 0;
    for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) { k += hapD[hap.hapIndex[idx[a]]][hap.hapIndex[idx[b]]]; pairs++; }
    k /= pairs;
    const seqs = idx.map(i => hap.hapSeq[hap.hapIndex[i]]);
    const L = seqs[0].length;
    let S = 0, eta = 0, eta_s = 0;
    const singletonsBySeq = new Array(n).fill(0);
    for (let s = 0; s < L; s++) {
      const c = {}; for (let i = 0; i < n; i++) c[seqs[i][s]] = (c[seqs[i][s]] || 0) + 1;
      const bases = Object.keys(c); if (bases.length < 2) continue;
      S++; eta += bases.length - 1;
      bases.forEach(bse => { if (c[bse] === 1) { eta_s++; for (let i = 0; i < n; i++) if (seqs[i][s] === bse) singletonsBySeq[i]++; } });
    }
    const a1 = harm(n, 1);
    return { n, h: counts.size, Hd, pi: k / nValid, k, S, eta, thetaW: S / a1, thetaWsite: S / a1 / nValid, eta_s, singletonsBySeq, hapCounts: counts };
  }

  /* ================================================================
     4 · NEUTRALITY STATISTICS from summary quantities
     ================================================================ */
  function tajimaD(n, S, k) {
    if (n < 4 || S === 0) return null;
    const a1 = harm(n, 1), a2 = harm(n, 2);
    const b1 = (n + 1) / (3 * (n - 1)), b2 = 2 * (n * n + n + 3) / (9 * n * (n - 1));
    const c1 = b1 - 1 / a1, c2 = b2 - (n + 2) / (a1 * n) + a2 / (a1 * a1);
    const e1 = c1 / a1, e2 = c2 / (a1 * a1 + a2);
    const denom = Math.sqrt(e1 * S + e2 * S * (S - 1));
    return denom > 0 ? (k - S / a1) / denom : null;
  }
  /* Fu & Li (1993) D* and F* without an outgroup; constants after Simonsen et al. (1995) */
  function fuLi(n, eta, eta_s, k) {
    if (n < 4 || eta === 0) return { Dstar: null, Fstar: null };
    const a1 = harm(n, 1), a2 = harm(n, 2), a1n1 = a1 + 1 / n;
    const cn = n > 2 ? 2 * (n * a1 - 2 * (n - 1)) / ((n - 1) * (n - 2)) : 0;
    const dn = cn + (n - 2) / ((n - 1) * (n - 1)) + (2 / (n - 1)) * (1.5 - (2 * a1n1 - 3) / (n - 2) - 1 / n);
    const vD = (Math.pow(n / (n - 1), 2) * a2 + a1 * a1 * dn - 2 * (n * a1 * (a1 + 1)) / ((n - 1) * (n - 1))) / (a1 * a1 + a2);
    const uD = (n / (n - 1)) * (a1 - n / (n - 1)) - vD;
    const Dstar = (uD * eta + vD * eta * eta) > 0 ? ((n / (n - 1)) * eta - a1 * eta_s) / Math.sqrt(uD * eta + vD * eta * eta) : null;
    const vF = (dn + 2 * (n * n + n + 3) / (9 * n * (n - 1)) - (2 / (n - 1)) * (4 * a2 - 6 + 8 / n)) / (a1 * a1 + a2);
    const uF = (n / (n - 1) + (n + 1) / (3 * (n - 1)) - 4 / (n * (n - 1)) + 2 * (n + 1) / ((n - 1) * (n - 1)) * (a1n1 - 2 * n / (n + 1))) / a1 - vF;
    const Fstar = (uF * eta + vF * eta * eta) > 0 ? (k - ((n - 1) / n) * eta_s) / Math.sqrt(uF * eta + vF * eta * eta) : null;
    return { Dstar, Fstar };
  }
  /* Fu's Fs: S′ = P(K ≥ k_obs | θ = k) from Ewens' sampling formula */
  /* logarithms of the unsigned Stirling numbers of the first kind |s(n, j)|, j = 0..n: in logs they
     do not overflow (|s(n, 1)| = (n − 1)! passes the largest double at n = 171) */
  const logStirlingRows = new Map();
  function logStirling(n) {
    if (logStirlingRows.has(n)) return logStirlingRows.get(n);
    const lse = (a, b) => (a === -Infinity ? b : b === -Infinity ? a : Math.max(a, b) + Math.log1p(Math.exp(-Math.abs(a - b))));
    let row = [0];                                   // log |s(0,0)| = log 1
    for (let m = 1; m <= n; m++) {
      const nr = new Array(m + 1).fill(-Infinity);
      for (let j = 1; j <= m; j++) nr[j] = lse(j - 1 < row.length ? row[j - 1] : -Infinity, j < row.length && m > 1 ? Math.log(m - 1) + row[j] : -Infinity);
      row = nr;
    }
    logStirlingRows.set(n, row);
    return row;
  }
  function fuFs(n, kObs, theta) {
    if (n < 2 || theta <= 0) return null;
    const row = logStirling(n);
    let denom = 0; for (let i = 0; i < n; i++) denom += Math.log(theta + i);
    const probs = []; for (let j = 1; j <= n; j++) probs.push(Math.exp(row[j] + j * Math.log(theta) - denom));
    let Sp = 0; for (let j = kObs; j <= n; j++) Sp += probs[j - 1];
    Sp = Math.min(1 - 1e-12, Math.max(1e-12, Sp));
    return Math.log(Sp / (1 - Sp));
  }
  function r2stat(n, S, k, singletonsBySeq) {
    if (S === 0) return null;
    let s = 0; singletonsBySeq.forEach(u => { s += (u - k / 2) ** 2; });
    return Math.sqrt(s / n) / S;
  }
  function allStats(div) {
    const D = tajimaD(div.n, div.S, div.k);
    /* Fu & Li count mutations (η), not sites: a site with three bases carries at least two */
    const fl = fuLi(div.n, div.eta != null ? div.eta : div.S, div.eta_s, div.k);
    return { D, Fs: fuFs(div.n, div.h, div.k), Dstar: fl.Dstar, Fstar: fl.Fstar, R2: r2stat(div.n, div.S, div.k, div.singletonsBySeq) };
  }

  /* ================================================================
     5 · COALESCENT SIMULATION (Hudson 1990) for P-values
     ================================================================ */
  function simulateSample(n, theta, r) {
    /* build the tree: lineages coalesce at rate k(k−1)/2 in units of 2N generations */
    let lineages = Array.from({ length: n }, (_, i) => ({ leaves: [i], len: 0 }));
    const branches = [];
    while (lineages.length > 1) {
      const kk = lineages.length;
      const t = -Math.log(r() || 1e-12) / (kk * (kk - 1) / 2);
      lineages.forEach(b => { b.len += t; });
      const i = Math.floor(r() * kk); let j = Math.floor(r() * (kk - 1)); if (j >= i) j++;
      const a = lineages[i], b = lineages[j];
      branches.push(a, b);
      lineages = lineages.filter((_, q) => q !== i && q !== j);
      lineages.push({ leaves: a.leaves.concat(b.leaves), len: 0 });
    }
    const T = branches.reduce((s, b) => s + b.len, 0);
    /* Poisson(θT/2) mutations, each on a branch chosen ∝ length */
    const lambda = theta * T / 2;
    let S = 0; { const Lm = Math.exp(-lambda); let p = 1; do { S++; p *= r(); } while (p > Lm); S--; }
    const cum = []; let acc = 0; branches.forEach(b => { acc += b.len; cum.push(acc); });
    const hapSets = Array.from({ length: n }, () => []);
    const singletonsBySeq = new Array(n).fill(0);
    /* pairwise differences, for the raggedness of the simulated mismatch distribution: a mutation
       separates every leaf under its branch from every leaf outside, so the cost is Σ d(n − d) */
    const diff = new Int32Array(n * n), inside = new Uint8Array(n);
    let k = 0, eta_s = 0;
    for (let m = 0; m < S; m++) {
      const u = r() * T; let bi = 0; while (bi < cum.length - 1 && u > cum[bi]) bi++;
      const leaves = branches[bi].leaves;
      leaves.forEach(l => hapSets[l].push(m));
      const d = leaves.length;
      k += d * (n - d);
      inside.fill(0); leaves.forEach(l => { inside[l] = 1; });
      for (const a of leaves) for (let b = 0; b < n; b++) if (!inside[b]) diff[a < b ? a * n + b : b * n + a]++;
      if (d === 1 || d === n - 1) { eta_s++; const who = d === 1 ? leaves : Array.from({ length: n }, (_, i) => i).filter(i => !inside[i]); who.forEach(l => singletonsBySeq[l]++); }
    }
    k /= n * (n - 1) / 2;
    const h = new Set(hapSets.map(s => s.sort((a, b) => a - b).join(','))).size;
    const counts = []; let maxD = 0;
    for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) { const dd = diff[a * n + b]; counts[dd] = (counts[dd] || 0) + 1; if (dd > maxD) maxD = dd; }
    const pairs = n * (n - 1) / 2, mis = []; for (let i = 0; i <= maxD; i++) mis.push((counts[i] || 0) / pairs);
    const rag = raggedness(mis);                      // S = 0 gives [1] and r = 1, the most ragged
    return { n, S, k, eta_s, h, singletonsBySeq, rag };
  }
  function simulateP(n, theta, obs, nSim, r) {
    const keys = ['D', 'Fs', 'Dstar', 'Fstar', 'R2', 'rag'];
    const lower = {}, upper = {}, cnt = {};
    keys.forEach(k => { lower[k] = 0; upper[k] = 0; cnt[k] = 0; });
    for (let s = 0; s < nSim; s++) {
      const sim = simulateSample(n, theta, r);
      const st = { D: tajimaD(sim.n, sim.S, sim.k), Fs: fuFs(sim.n, sim.h, sim.k), R2: r2stat(sim.n, sim.S, sim.k, sim.singletonsBySeq), rag: sim.rag };
      const fl = fuLi(sim.n, sim.S, sim.eta_s, sim.k); st.Dstar = fl.Dstar; st.Fstar = fl.Fstar;
      keys.forEach(k => { if (st[k] == null || obs[k] == null) return; cnt[k]++; if (st[k] <= obs[k] + 1e-12) lower[k]++; if (st[k] >= obs[k] - 1e-12) upper[k]++; });
    }
    const out = {};
    keys.forEach(k => { out[k] = cnt[k] ? { pLower: (lower[k] + 1) / (cnt[k] + 1), pUpper: (upper[k] + 1) / (cnt[k] + 1), pTwo: Math.min(1, 2 * Math.min((lower[k] + 1) / (cnt[k] + 1), (upper[k] + 1) / (cnt[k] + 1))), nSim: cnt[k] } : null; });
    return out;
  }

  /* ================================================================
     6 · MISMATCH DISTRIBUTION and sudden expansion
     ================================================================ */
  function mismatch(idx, hap, hapD) {
    const n = idx.length; const counts = [];
    let maxD = 0;
    for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) { const d = hapD[hap.hapIndex[idx[a]]][hap.hapIndex[idx[b]]]; counts[d] = (counts[d] || 0) + 1; if (d > maxD) maxD = d; }
    const total = n * (n - 1) / 2;
    const obs = []; for (let i = 0; i <= maxD; i++) obs.push((counts[i] || 0) / total);
    return { obs, total, maxD };
  }
  /* F_i(τ, θ0, θ1) of Rogers & Harpending (1992) */
  function expansionModel(tau, th0, th1, maxD) {
    /* in logarithms: with a hundred or more differences τ^j and j! overflow and their ratio becomes NaN */
    const F = (th, i) => Math.exp(i * Math.log(th) - (i + 1) * Math.log(th + 1));
    const lt = Math.log(tau), out = [];
    for (let i = 0; i <= maxD; i++) {
      let s = 0, lfact = 0;
      for (let j = 0; j <= i; j++) { if (j > 0) lfact += Math.log(j); s += Math.exp(j * lt - lfact) * (F(th0, i - j) - F(th1, i - j)); }
      out.push(F(th1, i) + Math.exp(-tau * (th1 + 1) / th1) * s);
    }
    return out;
  }
  function fitExpansion(obs, k) {
    const maxD = obs.length - 1;
    const sse = (tau, th0, th1) => { const e = expansionModel(tau, th0, th1, maxD); let s = 0; for (let i = 0; i <= maxD; i++) s += (obs[i] - e[i]) ** 2; return s; };
    /* coarse grid, then Nelder–Mead on the logarithms of (τ, θ₀, θ₁) from the three best grid points.
       A coordinate search stopped at grid values: on the pine example it left τ = 8, θ₀ = 1 with a sum of
       squares 5% above the optimum (τ = 8.98, θ₀ → 0) */
    const lo = [Math.log(1e-4), Math.log(1e-6), Math.log(1e-2)], hi = [Math.log(1e3), Math.log(1e4), Math.log(1e6)];
    const f = x => { const c = x.map((v, i) => Math.min(hi[i], Math.max(lo[i], v))); const v = sse(Math.exp(c[0]), Math.exp(c[1]), Math.exp(c[2])); return isFinite(v) ? v : Infinity; };
    const grid = [];
    for (const tau of [0.1, 0.5, 1, 2, 3, 4, 6, 8, 10, 15, 20]) for (const th0 of [0.001, 0.01, 0.1, 0.5, 1, 2]) for (const th1 of [10, 100, 1000, 10000]) { const v = sse(tau, th0, th1); grid.push({ x: [tau, th0, th1].map(Math.log), v: isFinite(v) ? v : Infinity }); }
    grid.sort((a, b) => a.v - b.v);
    const nelderMead = x0 => {
      let S = [x0.slice()]; for (let i = 0; i < 3; i++) { const x = x0.slice(); x[i] += 0.7; S.push(x); }
      let V = S.map(f);
      for (let it = 0; it < 600; it++) {
        const o = [0, 1, 2, 3].sort((a, b) => V[a] - V[b]); S = o.map(i => S[i]); V = o.map(i => V[i]);
        if (Math.abs(V[3] - V[0]) < 1e-14) break;
        const c = [0, 1, 2].map(j => (S[0][j] + S[1][j] + S[2][j]) / 3);
        const at = t => c.map((cj, j) => cj + t * (cj - S[3][j]));
        const xr = at(1), fr = f(xr);
        if (fr < V[0]) { const xe = at(2), fe = f(xe); if (fe < fr) { S[3] = xe; V[3] = fe; } else { S[3] = xr; V[3] = fr; } }
        else if (fr < V[2]) { S[3] = xr; V[3] = fr; }
        else { const xc = at(-0.5), fc = f(xc); if (fc < V[3]) { S[3] = xc; V[3] = fc; } else for (let i = 1; i < 4; i++) { S[i] = S[i].map((v, j) => S[0][j] + 0.5 * (v - S[0][j])); V[i] = f(S[i]); } }
      }
      const b = V.indexOf(Math.min(...V)); return { x: S[b].map((v, i) => Math.min(hi[i], Math.max(lo[i], v))), v: V[b] };
    };
    const runs = grid.slice(0, 3).map(g => nelderMead(g.x));
    const top = runs.reduce((a, b) => (b.v < a.v ? b : a));
    const best = { tau: Math.exp(top.x[0]), th0: Math.exp(top.x[1]), th1: Math.exp(top.x[2]), sse: top.v };
    const expected = expansionModel(best.tau, best.th0, best.th1, maxD);
    return { tau: best.tau, theta0: best.th0, theta1: best.th1, sse: best.sse, expected, raggedness: raggedness(obs) };
  }
  /* Harpending (1994): r = Σ_{i=1}^{d+1} (x_i − x_{i−1})², d the largest observed difference and x_{d+1} = 0,
     so the final drop to zero counts too */
  function raggedness(obs) {
    let rag = 0;
    for (let i = 1; i <= obs.length; i++) rag += ((i < obs.length ? obs[i] : 0) - obs[i - 1]) ** 2;
    return rag;
  }

  /* ================================================================
     7 · POPULATION STRUCTURE: G_ST, N_ST (Pons & Petit 1996) and Φ_ST
     ================================================================ */
  function ponsPetit(popsIdx, hap, hapD, nValid, r, perms) {
    const P = popsIdx.length, H = hap.hapSeq.length;
    const freqs = popsIdx.map(idx => { const f = new Array(H).fill(0); idx.forEach(i => f[hap.hapIndex[i]]++); return f.map(v => v / idx.length); });
    const ns = popsIdx.map(idx => idx.length);
    const compute = (Dm) => {
      /* Pons & Petit (1996) eq. 5–8. Within populations, eq. 6:
           v̂_S = (1/n) Σ_k n_k/(n_k − 1) Σ_ij π_ij x_ki x_kj
         Total, eq. 7 (pairs of different populations, so unbiased for the sampling of populations):
           v̂_T = Σ_ij π_ij x̄_i x̄_j − 1/(n(n − 1)) Σ_k Σ_ij π_ij (x_ki − x̄_i)(x_kj − x̄_j)
         h_S and h_T are the same with π_ij = 1 for i ≠ j (Pons & Petit 1995). */
      let hS = 0, vS = 0;
      const pbar = new Array(H).fill(0);
      freqs.forEach((f, p) => {
        let sumSq = 0, v = 0;
        for (let a = 0; a < H; a++) { sumSq += f[a] * f[a]; pbar[a] += f[a] / P; for (let b = 0; b < H; b++) v += f[a] * f[b] * Dm[a][b]; }
        hS += (ns[p] / (ns[p] - 1)) * (1 - sumSq) / P;
        vS += (ns[p] / (ns[p] - 1)) * v / P;
      });
      let sumPbar2 = 0, vT0 = 0;
      for (let a = 0; a < H; a++) { sumPbar2 += pbar[a] * pbar[a]; for (let b = 0; b < H; b++) vT0 += pbar[a] * pbar[b] * Dm[a][b]; }
      let devH = 0, devV = 0;
      freqs.forEach(f => {
        for (let a = 0; a < H; a++) {
          const da = f[a] - pbar[a];
          devH += da * da;
          for (let b = 0; b < H; b++) devV += Dm[a][b] * da * (f[b] - pbar[b]);
        }
      });
      const hT = 1 - sumPbar2 + devH / (P * (P - 1));
      const vT = vT0 - devV / (P * (P - 1));
      return { hS, hT, vS, vT, Gst: hT > 0 ? (hT - hS) / hT : null, Nst: vT > 0 ? (vT - vS) / vT : null };
    };
    const obs = compute(hapD);
    /* test N_ST > G_ST by permuting the haplotype identities in the distance matrix */
    let ge = 0;
    const order = Array.from({ length: H }, (_, i) => i);
    for (let p = 0; p < perms; p++) {
      shuffle(order, r);
      const Dp = order.map(a => order.map(b => hapD[a][b]));
      const s = compute(Dp);
      if (s.Nst != null && obs.Nst != null && s.Nst >= obs.Nst - 1e-12) ge++;
    }
    return Object.assign(obs, { pNst: perms ? (ge + 1) / (perms + 1) : null, perms });
  }
  /* AMOVA on a distance matrix between individuals (two levels), with permutations. distOf must return
     the squared distance δ²: for sequences, the number of differences between two haplotypes already is
     the squared Euclidean distance between them (Excoffier, Smouse & Quattro 1992), so it enters as is */
  function amovaDist(popsIdx, distOf, r, perms) {
    const all = [].concat(...popsIdx);
    const N = all.length, P = popsIdx.length;
    const ss = (set) => { let s = 0; for (let a = 0; a < set.length; a++) for (let b = a + 1; b < set.length; b++) s += distOf(set[a], set[b]); return set.length ? s / set.length : 0; };
    const compute = (groups) => {
      const SStot = ss(all), SSwp = groups.reduce((s, g) => s + ss(g), 0), SSap = SStot - SSwp;
      const n0 = (N - groups.reduce((s, g) => s + g.length * g.length, 0) / N) / (P - 1);
      const MSap = SSap / (P - 1), MSwp = SSwp / (N - P);
      const sb = (MSap - MSwp) / n0, sw = MSwp;
      return { SStot, SSap, SSwp, sb, sw, phi: (sb + sw) > 0 ? sb / (sb + sw) : null, dfA: P - 1, dfW: N - P };
    };
    const obs = compute(popsIdx);
    let ge = 0;
    for (let p = 0; p < perms; p++) {
      const sh = all.slice(); shuffle(sh, r);
      let q = 0; const groups = popsIdx.map(g => { const out = sh.slice(q, q + g.length); q += g.length; return out; });
      const s = compute(groups);
      if (s.phi != null && obs.phi != null && s.phi >= obs.phi - 1e-12) ge++;
    }
    return Object.assign(obs, { p: perms ? (ge + 1) / (perms + 1) : null, perms });
  }

  /* ================================================================
     8 · MEDIAN-JOINING NETWORK (ε = 0)
     ================================================================ */
  function medianJoining(hapSeq, maxMedians) {
    let seqs = hapSeq.slice();
    const nObs = hapSeq.length;
    const dist = (a, b) => diffCount(a, b);
    /* links of the minimum spanning network (all ties kept): Kruskal by distance class */
    const msn = (S) => {
      const n = S.length, D = Array.from({ length: n }, (_, i) => S.map(t => dist(S[i], t)));
      const edges = []; for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) edges.push([D[i][j], i, j]);
      edges.sort((a, b) => a[0] - b[0]);
      const parent = Array.from({ length: n }, (_, i) => i); const find = x => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
      const links = [];
      let q = 0;
      while (q < edges.length) {
        const d = edges[q][0]; const batch = [];
        while (q < edges.length && edges[q][0] === d) { batch.push(edges[q]); q++; }
        /* keep every edge of this class whose endpoints are not yet connected (before merging), then merge */
        const keep = batch.filter(([, i, j]) => find(i) !== find(j));
        keep.forEach(([dd, i, j]) => { links.push({ a: i, b: j, d: dd }); });
        keep.forEach(([, i, j]) => { parent[find(i)] = find(j); });
      }
      return { links, D };
    };
    /* Bandelt, Forster & Röhl (1999), ε = 0:
         1 the minimum spanning network (MSN) of the current sequences;
         2 obsolete median vectors — unsampled nodes with at most two neighbours — are removed, and 1 again;
         3 for every triplet joined by at least two MSN links, the median and its connection cost
           d(m,u) + d(m,v) + d(m,w); every new median with the smallest cost is added;
         4 repeat until no median is added. The final network is the MSN of what remains. */
    const cap = maxMedians || 200;
    let capped = false;
    const pruned = new Set();                         // medians removed as obsolete are not added again
    const prune = () => {
      for (;;) {
        const net = msn(seqs);
        const deg = seqs.map(() => 0); net.links.forEach(l => { deg[l.a]++; deg[l.b]++; });
        const drop = new Set(seqs.map((_, i) => i).filter(i => i >= nObs && deg[i] <= 2));
        if (!drop.size) return net;
        drop.forEach(i => pruned.add(seqs[i]));
        seqs = seqs.filter((_, i) => !drop.has(i));
      }
    };
    for (let round = 0; round < 100; round++) {
      const { links } = prune();
      const adj = seqs.map(() => new Set()); links.forEach(l => { adj[l.a].add(l.b); adj[l.b].add(l.a); });
      const existing = new Set(seqs);
      const cost = new Map(); let minCost = Infinity;
      for (let u = 0; u < seqs.length; u++) for (const v of adj[u]) for (const w of adj[u]) {
        if (v >= w) continue;
        const med = medianSeq(seqs[u], seqs[v], seqs[w]);
        if (existing.has(med) || pruned.has(med)) continue;
        const c = dist(med, seqs[u]) + dist(med, seqs[v]) + dist(med, seqs[w]);
        if (!cost.has(med) || c < cost.get(med)) cost.set(med, c);
        if (c < minCost) minCost = c;
      }
      const add = [...cost].filter(([, c]) => c <= minCost).map(([m]) => m);
      if (add.length && seqs.length - nObs >= cap) { capped = true; break; }
      if (!add.length) break;
      add.slice(0, cap - (seqs.length - nObs)).forEach(m => seqs.push(m));
    }
    const final = prune();
    return { seqs, nObs, links: final.links, nMedian: seqs.length - nObs, capped };
  }
  function medianSeq(a, b, c) {
    let out = '';
    for (let i = 0; i < a.length; i++) out += (a[i] === b[i] || a[i] === c[i]) ? a[i] : (b[i] === c[i] ? b[i] : a[i]);
    return out;
  }
  /* force-directed layout: springs of rest length ∝ mutational steps, repulsion between all nodes */
  function layoutNetwork(net, sizes, seed) {
    const r = rng(seed || 1), n = net.seqs.length;
    const pos = Array.from({ length: n }, () => ({ x: (r() - 0.5) * 200, y: (r() - 0.5) * 200 }));
    const unit = 28;
    for (let it = 0; it < 600; it++) {
      const t = 1 - it / 600;
      const fx = new Array(n).fill(0), fy = new Array(n).fill(0);
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
        let dx = pos[j].x - pos[i].x, dy = pos[j].y - pos[i].y; let d = Math.hypot(dx, dy) || 0.01;
        const minSep = (sizes[i] || 6) + (sizes[j] || 6) + 6;
        const rep = 2500 / (d * d) + (d < minSep ? (minSep - d) * 2 : 0);
        fx[i] -= rep * dx / d; fy[i] -= rep * dy / d; fx[j] += rep * dx / d; fy[j] += rep * dy / d;
      }
      net.links.forEach(l => {
        const i = l.a, j = l.b; let dx = pos[j].x - pos[i].x, dy = pos[j].y - pos[i].y; const d = Math.hypot(dx, dy) || 0.01;
        const rest = unit * Math.sqrt(l.d) + (sizes[i] || 6) + (sizes[j] || 6);
        const f = (d - rest) * 0.08;
        fx[i] += f * dx / d; fy[i] += f * dy / d; fx[j] -= f * dx / d; fy[j] -= f * dy / d;
      });
      for (let i = 0; i < n; i++) { const m = Math.hypot(fx[i], fy[i]) || 1; const step = Math.min(m, 12 * t + 1); pos[i].x += fx[i] / m * step; pos[i].y += fy[i] / m * step; }
    }
    return pos;
  }

  /* ================================================================
     9 · THE WHOLE ANALYSIS
     ================================================================ */
  const DEFAULTS = { sims: 1000, perms: 999, seed: 1, mutationRate: null, generationTime: 1, maxMedians: 100 };

  function compute(d, options) {
    const opts = Object.assign({}, DEFAULTS, options || {});
    const r = rng(opts.seed);
    const aln = d.seqs.aln;
    const sites = siteSummary(aln);
    const hap = haplotypes(aln, sites.valid);
    const hapD = hapDistMatrix(hap.hapSeq);
    const all = aln.map((_, i) => i);
    const R = { opts, sites, hap, hapD, nSeq: aln.length };

    /* total */
    R.total = diversity(all, hap, hapD, sites.nValid);
    R.total.stats = allStats(R.total);
    R.total.mismatch = mismatch(all, hap, hapD);
    R.total.stats.rag = raggedness(R.total.mismatch.obs);
    R.total.p = R.total.n >= 4 && R.total.S > 0 ? simulateP(R.total.n, R.total.thetaW, R.total.stats, opts.sims, r) : null;
    R.total.expansion = R.total.mismatch.obs.length > 2 ? fitExpansion(R.total.mismatch.obs, R.total.k) : null;

    /* per population */
    const usable = d.pops.filter(p => p.idx.length >= 2 && d.declaredPops && !d.singletons);
    R.pops = usable.map(p => {
      const div = diversity(p.idx, hap, hapD, sites.nValid);
      div.name = p.name;
      div.stats = allStats(div);
      div.mismatch = mismatch(p.idx, hap, hapD);
      div.stats.rag = raggedness(div.mismatch.obs);
      div.p = div.n >= 4 && div.S > 0 ? simulateP(div.n, div.thetaW, div.stats, opts.sims, r) : null;
      div.private = 0;
      div.hapCounts.forEach((c, h) => { const elsewhere = usable.some(q => q !== p && q.idx.some(i => hap.hapIndex[i] === h)); if (!elsewhere) div.private++; });
      return div;
    });
    /* haplotype × population table */
    R.hapTable = hap.hapSeq.map((s, h) => ({ hap: 'H' + (h + 1), total: hap.hapIndex.filter(x => x === h).length, byPop: usable.map(p => p.idx.filter(i => hap.hapIndex[i] === h).length) }));
    R.popNames = usable.map(p => p.name);

    /* structure */
    if (usable.length >= 2) {
      R.pp = ponsPetit(usable.map(p => p.idx), hap, hapD, sites.nValid, r, opts.perms);
      R.amova = amovaDist(usable.map(p => p.idx), (i, j) => hapD[hap.hapIndex[i]][hap.hapIndex[j]], r, opts.perms);
    }
    /* network */
    R.net = medianJoining(hap.hapSeq, opts.maxMedians);
    const sizes = R.net.seqs.map((s, i) => (i < R.net.nObs ? 6 + 4 * Math.sqrt(R.hapTable[i].total) : 3));
    R.net.pos = layoutNetwork(R.net, sizes, opts.seed);
    /* time since expansion, if a mutation rate was given: τ = 2ut, u per sequence per generation */
    if (opts.mutationRate && R.total.expansion) {
      const uSeq = opts.mutationRate * sites.nValid;      // rate per site per year → per sequence per year
      R.total.expansion.tYears = R.total.expansion.tau / (2 * uSeq);
      R.total.expansion.tGenerations = R.total.expansion.tYears / (opts.generationTime || 1);
    }
    return R;
  }

  window.DNA = { compute, siteSummary, haplotypes, hapDistMatrix, diversity, tajimaD, fuLi, fuFs, logStirling, r2stat, raggedness, simulateSample, simulateP, mismatch, expansionModel, fitExpansion, ponsPetit, amovaDist, medianJoining, layoutNetwork, DEFAULTS };
})();
