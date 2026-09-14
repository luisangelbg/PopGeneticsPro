/* PopGeneticsPro — divergence times: molecular clock dating on a fixed topology.

   Written as one self-contained function (DatingCore) so the same code runs on the
   page and inside a Web Worker built from its own source (works from file:// too).

   Substitution models .... JC69, K80, HKY85, GTR (+Γ, 4 discrete categories by the
                             mean method of Yang 1994); reversible Q diagonalised through
                             its symmetrised form
   Likelihood ............. Felsenstein (1981) pruning on compressed site patterns;
                             gaps and IUPAC ambiguities as partial states; per-node scaling
   Branch lengths ......... maximum likelihood by cyclic Brent optimisation; model
                             parameters (κ, GTR exchangeabilities, α) alternately; AIC,
                             AICc and BIC for model choice on the fixed topology
   Fast dating ............ least-squares dating, LSD (To, Jung, Lycett & Gascuel 2016):
                             weighted least squares with variances (b + c/L)/L, ordering
                             and calibration constraints, strict clock; confidence intervals
                             from parametric resampling of the branch lengths with lognormal
                             rate variation among branches (To et al. 2016)
   Bayesian dating ........ MCMC on node ages with a strict or uncorrelated lognormal clock
                             (Drummond et al. 2006), a Yule prior conditioned on the root age
                             (Gernhard 2008) or a constant-size coalescent prior, calibration
                             densities (uniform, offset exponential, offset lognormal, normal),
                             and κ, α sampled; node-slide, root-scale, up–down, rate and
                             branch-rate moves with adaptive tuning; 95% HPD intervals and
                             effective sample sizes (Geyer's initial monotone sequence). */

function DatingCore() {
  'use strict';

  /* ================================================================
     random numbers
     ================================================================ */
  function makeRng(seed) {
    let a = (seed >>> 0) || 1;
    const r = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    r.normal = () => { let u = 0, v = 0; while (u === 0) u = r(); while (v === 0) v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
    r.poisson = lam => {
      if (lam < 30) { const L = Math.exp(-lam); let k = 0, p = 1; do { k++; p *= r(); } while (p > L); return k - 1; }
      return Math.max(0, Math.round(lam + Math.sqrt(lam) * r.normal()));
    };
    return r;
  }

  /* ================================================================
     special functions
     ================================================================ */
  function lgamma(x) {
    const c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
    let y = x, tmp = x + 5.5; tmp -= (x + 0.5) * Math.log(tmp);
    let ser = 1.000000000190015;
    for (let j = 0; j < 6; j++) ser += c[j] / ++y;
    return -tmp + Math.log(2.5066282746310005 * ser / x);
  }
  /* regularised lower incomplete gamma P(a, x) */
  function pgamma(a, x) {
    if (x <= 0) return 0;
    if (x < a + 1) {
      let sum = 1 / a, del = sum, ap = a;
      for (let n = 0; n < 500; n++) { ap++; del *= x / ap; sum += del; if (Math.abs(del) < Math.abs(sum) * 1e-14) break; }
      return sum * Math.exp(-x + a * Math.log(x) - lgamma(a));
    }
    let b = x + 1 - a, c = 1 / 1e-300, d = 1 / b, h = d;
    for (let i = 1; i < 500; i++) {
      const an = -i * (i - a); b += 2;
      d = an * d + b; if (Math.abs(d) < 1e-300) d = 1e-300;
      c = b + an / c; if (Math.abs(c) < 1e-300) c = 1e-300;
      d = 1 / d; const del = d * c; h *= del;
      if (Math.abs(del - 1) < 1e-14) break;
    }
    return 1 - Math.exp(-x + a * Math.log(x) - lgamma(a)) * h;
  }
  /* quantile of Gamma(shape a, rate b) by bisection on the CDF */
  function qgamma(p, a, b) {
    let lo = 0, hi = Math.max(1, a / b);
    while (pgamma(a, hi * b) < p) hi *= 2;
    for (let i = 0; i < 200; i++) { const mid = (lo + hi) / 2; if (pgamma(a, mid * b) < p) lo = mid; else hi = mid; if (hi - lo < 1e-12 * hi) break; }
    return (lo + hi) / 2;
  }
  /* Yang (1994): mean rate of each of k equiprobable categories of Gamma(α, α) */
  function discreteGamma(alpha, k) {
    if (!alpha || !isFinite(alpha) || k <= 1) return { rates: [1], weights: [1] };
    const cuts = [0];
    for (let i = 1; i < k; i++) cuts.push(qgamma(i / k, alpha, alpha));
    cuts.push(Infinity);
    const rates = [];
    for (let i = 0; i < k; i++) {
      const hi = cuts[i + 1] === Infinity ? 1 : pgamma(alpha + 1, cuts[i + 1] * alpha);
      const lo = pgamma(alpha + 1, cuts[i] * alpha);
      rates.push((hi - lo) * k);
    }
    const m = rates.reduce((s, v) => s + v, 0) / k;       // renormalise tiny numerical drift
    return { rates: rates.map(v => v / m), weights: new Array(k).fill(1 / k) };
  }

  /* ================================================================
     alignment → site patterns
     ================================================================ */
  const CODE = {
    A: [1, 0, 0, 0], C: [0, 1, 0, 0], G: [0, 0, 1, 0], T: [0, 0, 0, 1], U: [0, 0, 0, 1],
    R: [1, 0, 1, 0], Y: [0, 1, 0, 1], S: [0, 1, 1, 0], W: [1, 0, 0, 1], K: [0, 0, 1, 1], M: [1, 1, 0, 0],
    B: [0, 1, 1, 1], D: [1, 0, 1, 1], H: [1, 1, 0, 1], V: [1, 1, 1, 0],
  };
  const ANY = [1, 1, 1, 1];
  function compress(seqs) {
    const n = seqs.length, L = Math.min(...seqs.map(s => s.length));
    const map = new Map(), cols = [], weights = [];
    const counts = [0, 0, 0, 0];
    for (let s = 0; s < L; s++) {
      let key = '';
      for (let i = 0; i < n; i++) {
        const ch = (seqs[i][s] || 'N').toUpperCase();
        key += CODE[ch] ? ch : 'N';
        const idx = 'ACGT'.indexOf(ch === 'U' ? 'T' : ch);
        if (idx >= 0) counts[idx]++;
      }
      if (map.has(key)) weights[map.get(key)]++;
      else { map.set(key, cols.length); cols.push(key); weights.push(1); }
    }
    const nPat = cols.length;
    const tips = [];
    for (let i = 0; i < n; i++) {
      const a = new Float64Array(nPat * 4);
      for (let p = 0; p < nPat; p++) { const v = CODE[cols[p][i]] || ANY; a.set(v, p * 4); }
      tips.push(a);
    }
    const tot = counts.reduce((s, v) => s + v, 0) || 1;
    const freqs = counts.map(v => Math.max(v / tot, 1e-4));
    const fs = freqs.reduce((s, v) => s + v, 0);
    /* variable sites (for texts) */
    let variable = 0;
    cols.forEach((c, p) => { const set = new Set(c.replace(/N/g, '').split('')); if (set.size > 1) variable += weights[p]; });
    return { nPat, nSites: L, weights: Float64Array.from(weights), tips, freqs: freqs.map(v => v / fs), variable };
  }

  /* ================================================================
     substitution models
     ================================================================ */
  function jacobi4(A) {
    const n = 4, a = A.map(r => r.slice()), v = [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]];
    for (let sweep = 0; sweep < 60; sweep++) {
      let off = 0;
      for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) off += a[p][q] * a[p][q];
      if (off < 1e-26) break;
      for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) {
        if (Math.abs(a[p][q]) < 1e-300) continue;
        const th = (a[q][q] - a[p][p]) / (2 * a[p][q]);
        const t = (th >= 0 ? 1 : -1) / (Math.abs(th) + Math.sqrt(th * th + 1));
        const c = 1 / Math.sqrt(t * t + 1), s = t * c;
        for (let k = 0; k < n; k++) { const akp = a[k][p], akq = a[k][q]; a[k][p] = c * akp - s * akq; a[k][q] = s * akp + c * akq; }
        for (let k = 0; k < n; k++) { const apk = a[p][k], aqk = a[q][k]; a[p][k] = c * apk - s * aqk; a[q][k] = s * apk + c * aqk; }
        for (let k = 0; k < n; k++) { const vkp = v[k][p], vkq = v[k][q]; v[k][p] = c * vkp - s * vkq; v[k][q] = s * vkp + c * vkq; }
      }
    }
    return { values: [a[0][0], a[1][1], a[2][2], a[3][3]], vectors: v };
  }

  /* spec: {model: 'JC'|'K80'|'HKY'|'GTR', kappa, rates: [AC,AG,AT,CG,CT,GT], freqs, alpha (null = no Γ), ncat} */
  function makeModel(spec) {
    const name = spec.model || 'HKY';
    const pi = name === 'JC' || name === 'K80' ? [0.25, 0.25, 0.25, 0.25] : spec.freqs.slice();
    let ex;                                     // exchangeabilities AC AG AT CG CT GT
    if (name === 'JC') ex = [1, 1, 1, 1, 1, 1];
    else if (name === 'K80' || name === 'HKY') { const k = spec.kappa || 2; ex = [1, k, 1, 1, k, 1]; }
    else ex = (spec.rates || [1, 2, 1, 1, 2, 1]).slice();
    const pairs = [[0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 3]];
    const Q = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]];
    pairs.forEach(([i, j], k) => { Q[i][j] = ex[k] * pi[j]; Q[j][i] = ex[k] * pi[i]; });
    for (let i = 0; i < 4; i++) Q[i][i] = -(Q[i][0] + Q[i][1] + Q[i][2] + Q[i][3] - Q[i][i]);
    let mu = 0; for (let i = 0; i < 4; i++) mu -= pi[i] * Q[i][i];
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) Q[i][j] /= mu;    // one substitution per unit branch length
    const sq = pi.map(Math.sqrt);
    const B = Q.map((row, i) => row.map((q, j) => sq[i] * q / sq[j]));
    for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) { const m = (B[i][j] + B[j][i]) / 2; B[i][j] = B[j][i] = m; }
    const e = jacobi4(B);
    const U = new Float64Array(16), Ui = new Float64Array(16);
    for (let i = 0; i < 4; i++) for (let k = 0; k < 4; k++) { U[i * 4 + k] = e.vectors[i][k] / sq[i]; Ui[k * 4 + i] = e.vectors[i][k] * sq[i]; }
    const g = discreteGamma(spec.alpha, spec.alpha ? (spec.ncat || 4) : 1);
    return { name, pi: Float64Array.from(pi), lambda: Float64Array.from(e.values), U, Ui, catRates: g.rates, catWeights: g.weights, ncat: g.rates.length, spec: Object.assign({}, spec, { model: name }) };
  }
  /* P(t) for one rate category into out[offset..offset+15] */
  function transition(M, t, out, off) {
    const U = M.U, Ui = M.Ui;
    const e0 = Math.exp(M.lambda[0] * t), e1 = Math.exp(M.lambda[1] * t), e2 = Math.exp(M.lambda[2] * t), e3 = Math.exp(M.lambda[3] * t);
    for (let i = 0; i < 4; i++) {
      const u0 = U[i * 4] * e0, u1 = U[i * 4 + 1] * e1, u2 = U[i * 4 + 2] * e2, u3 = U[i * 4 + 3] * e3;
      for (let j = 0; j < 4; j++) {
        const s = u0 * Ui[j] + u1 * Ui[4 + j] + u2 * Ui[8 + j] + u3 * Ui[12 + j];
        out[off + i * 4 + j] = s < 0 ? 0 : s;
      }
    }
  }
  function nParamsModel(spec) {
    const base = spec.model === 'JC' ? 0 : spec.model === 'K80' ? 1 : spec.model === 'HKY' ? 4 : 8;
    return base + (spec.alpha ? 1 : 0);
  }

  /* ================================================================
     tree in flat arrays
     ================================================================ */
  /* node objects {tip, children:[{node,len}]} → arrays; tips keep their .tip index as row of the alignment */
  function flatten(root) {
    const nodes = [], parent = [], len = [], kids = [], tipRow = [];
    const walk = (n, p, l) => {
      const k = nodes.length;
      nodes.push(n); parent.push(p); len.push(l || 0); kids.push([]); tipRow.push(n.tip != null ? n.tip : -1);
      if (p >= 0) kids[p].push(k);
      n.children.forEach(c => walk(c.node, k, c.len));
      return k;
    };
    walk(root, -1, 0);
    const post = [];
    const order = k => { kids[k].forEach(order); post.push(k); };
    order(0);
    return { n: nodes.length, parent, len: Float64Array.from(len), kids, tipRow, post, nodes, isTip: tipRow.map(r => r >= 0) };
  }
  function unflatten(F, lens, ages, extra) {
    const build = k => {
      const src = F.nodes[k];
      const o = { children: F.kids[k].map(c => ({ node: build(c), len: lens ? lens[c] : F.len[c] })) };
      if (src.tip != null) { o.tip = src.tip; o.label = src.label; }
      if (src.support != null) o.support = src.support;
      if (ages) o.age = ages[k];
      if (extra) extra(k, o);
      return o;
    };
    return build(0);
  }

  /* ================================================================
     likelihood with two buffer slots per node (cheap accept / reject)
     ================================================================ */
  function Lik(F, A, M) {
    const nPat = A.nPat, C = M.ncat, sz = C * nPat * 4;
    const partial = [], scale = [], P = [];
    const lslot = new Uint8Array(F.n), pslot = new Uint8Array(F.n);
    for (let k = 0; k < F.n; k++) {
      partial.push(F.isTip[k] ? null : [new Float64Array(sz), new Float64Array(sz)]);
      scale.push(F.isTip[k] ? null : [new Float64Array(nPat), new Float64Array(nPat)]);
      P.push([new Float64Array(C * 16), new Float64Array(C * 16)]);
    }
    const changedL = [], changedP = [];
    let model = M;

    function setModel(m) { model = m; }
    function writeP(k, t, flip) {
      const slot = flip ? 1 - pslot[k] : pslot[k];
      const out = P[k][slot];
      for (let c = 0; c < C; c++) transition(model, Math.max(0, t) * model.catRates[c], out, c * 16);
      if (flip) { pslot[k] = slot; changedP.push(k); }
    }
    function computeNode(k, flip) {
      const slot = flip ? 1 - lslot[k] : lslot[k];
      const out = partial[k][slot], sc = scale[k][slot];
      out.fill(1); sc.fill(0);
      const ch = F.kids[k];
      for (let ci = 0; ci < ch.length; ci++) {
        const c = ch[ci], Pc = P[c][pslot[c]];
        if (F.isTip[c]) {
          const tv = A.tips[F.tipRow[c]];
          for (let r = 0; r < C; r++) {
            const po = r * 16, ro = r * nPat * 4;
            for (let p = 0; p < nPat; p++) {
              const t0 = tv[p * 4], t1 = tv[p * 4 + 1], t2 = tv[p * 4 + 2], t3 = tv[p * 4 + 3];
              const o = ro + p * 4;
              for (let i = 0; i < 4; i++) {
                const b = po + i * 4;
                out[o + i] *= Pc[b] * t0 + Pc[b + 1] * t1 + Pc[b + 2] * t2 + Pc[b + 3] * t3;
              }
            }
          }
        } else {
          const lc = partial[c][lslot[c]], scc = scale[c][lslot[c]];
          for (let p = 0; p < nPat; p++) sc[p] += scc[p];
          for (let r = 0; r < C; r++) {
            const po = r * 16, ro = r * nPat * 4;
            for (let p = 0; p < nPat; p++) {
              const o = ro + p * 4;
              const l0 = lc[o], l1 = lc[o + 1], l2 = lc[o + 2], l3 = lc[o + 3];
              for (let i = 0; i < 4; i++) {
                const b = po + i * 4;
                out[o + i] *= Pc[b] * l0 + Pc[b + 1] * l1 + Pc[b + 2] * l2 + Pc[b + 3] * l3;
              }
            }
          }
        }
      }
      /* scale each pattern so that products of many small numbers never underflow */
      for (let p = 0; p < nPat; p++) {
        let m = 0;
        for (let r = 0; r < C; r++) { const o = r * nPat * 4 + p * 4; for (let i = 0; i < 4; i++) if (out[o + i] > m) m = out[o + i]; }
        if (m > 0 && m < 1e-30) {
          for (let r = 0; r < C; r++) { const o = r * nPat * 4 + p * 4; for (let i = 0; i < 4; i++) out[o + i] /= m; }
          sc[p] += Math.log(m);
        }
      }
      if (flip) { lslot[k] = slot; changedL.push(k); }
    }
    function rootLnL() {
      const k = 0, L = partial[k][lslot[k]], sc = scale[k][lslot[k]];
      let lnL = 0;
      for (let p = 0; p < nPat; p++) {
        let s = 0;
        for (let r = 0; r < C; r++) { const o = r * nPat * 4 + p * 4; s += model.catWeights[r] * (model.pi[0] * L[o] + model.pi[1] * L[o + 1] + model.pi[2] * L[o + 2] + model.pi[3] * L[o + 3]); }
        lnL += A.weights[p] * (Math.log(s > 0 ? s : 1e-300) + sc[p]);
      }
      return lnL;
    }
    /* full evaluation from branch lengths (substitutions per site) */
    function full(lens) {
      for (let k = 1; k < F.n; k++) writeP(k, lens[k], false);
      F.post.forEach(k => { if (!F.isTip[k]) computeNode(k, false); });
      return rootLnL();
    }
    /* proposal: new lengths for some branches; recompute their ancestors only */
    function propose(edgeList, lens) {
      changedL.length = 0; changedP.length = 0;
      const dirty = new Set();
      edgeList.forEach(k => { writeP(k, lens[k], true); let p = F.parent[k]; while (p >= 0 && !dirty.has(p)) { dirty.add(p); p = F.parent[p]; } });
      F.post.forEach(k => { if (dirty.has(k)) computeNode(k, true); });
      return rootLnL();
    }
    function accept() { changedL.length = 0; changedP.length = 0; }
    function reject() {
      changedL.forEach(k => { lslot[k] = 1 - lslot[k]; });
      changedP.forEach(k => { pslot[k] = 1 - pslot[k]; });
      changedL.length = 0; changedP.length = 0;
    }
    return { full, propose, accept, reject, setModel, rootLnL };
  }

  /* ================================================================
     1-D optimisation (Brent 1973)
     ================================================================ */
  function brentMin(f, a, b, tol, maxIt) {
    const gr = 0.3819660112501051;
    let x = a + gr * (b - a), w = x, v = x, fx = f(x), fw = fx, fv = fx, d = 0, e = 0;
    tol = tol || 1e-6;
    for (let it = 0; it < (maxIt || 60); it++) {
      const m = 0.5 * (a + b), tol1 = tol * Math.abs(x) + 1e-10, tol2 = 2 * tol1;
      if (Math.abs(x - m) <= tol2 - 0.5 * (b - a)) break;
      let u, useGolden = true;
      if (Math.abs(e) > tol1) {
        let r = (x - w) * (fx - fv), q = (x - v) * (fx - fw), p = (x - v) * q - (x - w) * r;
        q = 2 * (q - r); if (q > 0) p = -p; q = Math.abs(q);
        const etemp = e; e = d;
        if (!(Math.abs(p) >= Math.abs(0.5 * q * etemp) || p <= q * (a - x) || p >= q * (b - x))) { d = p / q; u = x + d; if (u - a < tol2 || b - u < tol2) d = x < m ? tol1 : -tol1; useGolden = false; }
      }
      if (useGolden) { e = (x < m ? b : a) - x; d = gr * e; }
      u = Math.abs(d) >= tol1 ? x + d : x + (d > 0 ? tol1 : -tol1);
      const fu = f(u);
      if (fu <= fx) { if (u < x) b = x; else a = x; v = w; fv = fw; w = x; fw = fx; x = u; fx = fu; }
      else { if (u < x) a = u; else b = u; if (fu <= fw || w === x) { v = w; fv = fw; w = u; fw = fu; } else if (fu <= fv || v === x || v === w) { v = u; fv = fu; } }
    }
    return { x, f: fx };
  }

  /* ================================================================
     maximum-likelihood branch lengths and model parameters
     ================================================================ */
  function fitML(tree, seqs, spec, opts) {
    opts = opts || {};
    const A = compress(seqs);
    const F = flatten(tree);
    spec = Object.assign({ kappa: 2, rates: [1, 2, 1, 1, 2, 1], alpha: null, ncat: 4 }, spec, { freqs: A.freqs });
    let M = makeModel(spec);
    const lik = Lik(F, A, M);
    const lens = Float64Array.from(F.len, v => Math.max(1e-6, v || 0.01));
    const rootKids = F.kids[0];
    /* the two branches at the root of a reversible model act as one */
    const pairTotal = rootKids.length === 2 ? lens[rootKids[0]] + lens[rootKids[1]] : null;
    let lnL = lik.full(lens);
    const log = [];
    const maxLen = opts.maxLen || 5;
    for (let pass = 0; pass < (opts.passes || 12); pass++) {
      const before = lnL;
      for (let k = 1; k < F.n; k++) {
        if (rootKids.length === 2 && k === rootKids[1]) continue;
        if (rootKids.length === 2 && k === rootKids[0]) {
          const other = rootKids[1];
          const res = brentMin(s => { lens[k] = s / 2; lens[other] = s / 2; const v = -lik.propose([k, other], lens); lik.accept(); return v; }, 1e-7, maxLen * 2, 1e-5, 40);
          lens[k] = res.x / 2; lens[other] = res.x / 2;
        } else {
          const res = brentMin(t => { lens[k] = t; const v = -lik.propose([k], lens); lik.accept(); return v; }, 1e-8, maxLen, 1e-5, 40);
          lens[k] = res.x;
        }
        lnL = lik.full(lens);
      }
      /* model parameters */
      const refit = (key, lo, hi, set) => {
        const res = brentMin(x => { set(Math.exp(x)); M = makeModel(spec); lik.setModel(M); return -lik.full(lens); }, Math.log(lo), Math.log(hi), 1e-4, 40);
        set(Math.exp(res.x)); M = makeModel(spec); lik.setModel(M); lnL = lik.full(lens);
      };
      if (spec.model === 'K80' || spec.model === 'HKY') refit('kappa', 0.05, 200, v => { spec.kappa = v; });
      if (spec.model === 'GTR') for (let r = 0; r < 5; r++) refit('r' + r, 0.005, 200, v => { spec.rates[r] = v; });
      if (spec.alpha) refit('alpha', 0.02, 100, v => { spec.alpha = v; });
      log.push(lnL);
      if (Math.abs(lnL - before) < 1e-3) break;
    }
    const k = nParamsModel(spec) + (F.n - 1) - (rootKids.length === 2 ? 1 : 0);
    const nS = A.nSites;
    const out = {
      lnL, spec: Object.assign({}, spec), k, nSites: nS, nPatterns: A.nPat, variable: A.variable, freqs: A.freqs,
      AIC: -2 * lnL + 2 * k, AICc: -2 * lnL + 2 * k + (nS - k - 1 > 0 ? 2 * k * (k + 1) / (nS - k - 1) : Infinity), BIC: -2 * lnL + k * Math.log(nS),
      tree: unflatten(F, lens), lens: Array.from(lens), passes: log.length,
    };
    if (pairTotal == null && rootKids.length === 2) out.rootPair = true;
    return out;
  }

  function compareModels(tree, seqs, opts) {
    const list = [];
    ['JC', 'K80', 'HKY', 'GTR'].forEach(m => [false, true].forEach(g => list.push({ model: m, alpha: g ? 0.5 : null })));
    const res = list.map(spec => fitML(tree, seqs, spec, opts));
    const best = key => res.reduce((a, b) => (b[key] < a[key] ? b : a));
    const bAICc = best('AICc'), bBIC = best('BIC');
    res.forEach(r => { r.dAICc = r.AICc - bAICc.AICc; r.dBIC = r.BIC - bBIC.BIC; });
    const wsum = res.reduce((s, r) => s + Math.exp(-r.dAICc / 2), 0);
    res.forEach(r => { r.wAICc = Math.exp(-r.dAICc / 2) / wsum; });
    return { fits: res, bestAICc: bAICc, bestBIC: bBIC };
  }

  /* ================================================================
     calibrations
     ================================================================ */
  /* c: {type:'uniform'|'exponential'|'lognormal'|'normal'|'fixed', min, max, mean, sd, offset, M, S} */
  function prepareCalibration(c) {
    const o = Object.assign({}, c);
    const min = c.min != null && isFinite(c.min) ? +c.min : null, max = c.max != null && isFinite(c.max) ? +c.max : null;
    if (o.type === 'exponential') {
      o.offset = min != null ? min : 0;
      o.mean = c.mean || (max != null && max > o.offset ? (max - o.offset) / Math.log(20) : Math.max(o.offset * 0.1, 1e-3));
    } else if (o.type === 'lognormal') {
      o.offset = min != null ? min : 0;
      o.S = c.S || 1;
      o.M = c.M != null ? c.M : Math.log(max != null && max > o.offset ? (max - o.offset) : Math.max(o.offset * 0.1, 1e-3)) - 1.6449 * o.S;
    } else if (o.type === 'normal') {
      o.mean = c.mean != null ? +c.mean : (min != null && max != null ? (min + max) / 2 : min);
      o.sd = c.sd || (min != null && max != null ? (max - min) / 3.92 : Math.abs(o.mean) * 0.1);
    } else if (o.type === 'uniform') {
      o.min = min != null ? min : 0; o.max = max;
    } else if (o.type === 'fixed') { o.value = c.value != null ? +c.value : (min != null ? min : max); }
    o.hardMin = o.type === 'uniform' ? o.min : (o.type === 'exponential' || o.type === 'lognormal') ? o.offset : null;
    o.hardMax = o.type === 'uniform' ? o.max : null;
    /* quantiles for texts and for LSD, which uses intervals */
    o.q = calQuantiles(o);
    return o;
  }
  function calLogDensity(c, a) {
    switch (c.type) {
      case 'uniform': return a >= c.min && (c.max == null || a <= c.max) ? (c.max != null ? -Math.log(c.max - c.min) : 0) : -Infinity;
      case 'exponential': return a < c.offset ? -Infinity : -Math.log(c.mean) - (a - c.offset) / c.mean;
      case 'lognormal': { const x = a - c.offset; if (x <= 0) return -Infinity; const z = (Math.log(x) - c.M) / c.S; return -Math.log(x * c.S * 2.5066282746310002) - z * z / 2; }
      case 'normal': { const z = (a - c.mean) / c.sd; return -Math.log(c.sd * 2.5066282746310002) - z * z / 2; }
      case 'fixed': return Math.abs(a - c.value) < 1e-9 * Math.max(1, c.value) ? 0 : -Infinity;
      default: return 0;
    }
  }
  function qnorm(p) {
    /* Acklam's rational approximation */
    const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
    const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
    const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
    const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
    const pl = 0.02425;
    if (p < pl) { const q = Math.sqrt(-2 * Math.log(p)); return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
    if (p > 1 - pl) { const q = Math.sqrt(-2 * Math.log(1 - p)); return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
    const q = p - 0.5, r = q * q;
    return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  }
  function calQuantiles(c) {
    const Q = p => {
      switch (c.type) {
        case 'uniform': return c.max != null ? c.min + p * (c.max - c.min) : null;
        case 'exponential': return c.offset - c.mean * Math.log(1 - p);
        case 'lognormal': return c.offset + Math.exp(c.M + c.S * qnorm(p));
        case 'normal': return c.mean + c.sd * qnorm(p);
        case 'fixed': return c.value;
        default: return null;
      }
    };
    return { q025: Q(0.025), q50: Q(0.5), q975: Q(0.975) };
  }

  /* ================================================================
     least-squares dating (LSD)
     ================================================================ */
  /* tree: rooted, branch lengths in substitutions/site; L: alignment length.
     calibs: [{node (flat index), lo, hi}] hard bounds on ages; rate: {mean} known rate or null. */
  function lsdCore(F, b, L, bounds, rateFixed, c, init) {
    const n = F.n;
    const w = new Float64Array(n);
    for (let k = 1; k < n; k++) w[k] = L / (b[k] + c / L);          // 1 / variance
    /* The two branches below the root form one branch of the unrooted tree: how its length
       is shared between them is not identifiable from the sequences (outgroup rooting just
       picks a point). They enter as one term, B − ω(2·t_root − t_1 − t_2), so the dating
       places the root on that branch. */
    const RP = F.kids[0] && F.kids[0].length === 2 ? F.kids[0] : null;
    const BR = RP ? b[RP[0]] + b[RP[1]] : 0;
    const wR = RP ? L / (BR + c / L) : 0;
    const isRootKid = k => RP && F.parent[k] === 0;
    const lo = new Float64Array(n), hi = new Float64Array(n).fill(Infinity);
    for (let k = 0; k < n; k++) if (F.isTip[k]) { lo[k] = 0; hi[k] = 0; }
    bounds.forEach(bd => { lo[bd.node] = Math.max(lo[bd.node], bd.lo != null ? bd.lo : 0); if (bd.hi != null) hi[bd.node] = Math.min(hi[bd.node], bd.hi); });
    const age = new Float64Array(n);
    /* start: ages proportional to root-to-tip mean distance */
    if (init) age.set(init);
    else {
      const down = new Float64Array(n);
      F.post.forEach(k => { if (!F.isTip[k]) { let s = 0; F.kids[k].forEach(ch => { s += b[ch] + down[ch]; }); down[k] = s / F.kids[k].length; } });
      const scale0 = bounds.length ? Math.max(...bounds.map(bd => (bd.lo != null && bd.hi != null ? (bd.lo + bd.hi) / 2 : bd.lo != null ? bd.lo * 1.2 : bd.hi) / Math.max(1e-9, down[bd.node]))) : (rateFixed ? 1 / rateFixed : 1);
      for (let k = 0; k < n; k++) age[k] = F.isTip[k] ? 0 : down[k] * (isFinite(scale0) && scale0 > 0 ? scale0 : 1);
    }
    let omega = rateFixed || 1;
    const pre = F.post.slice().reverse();
    const clampNode = k => {
      let mn = lo[k], mx = hi[k];
      F.kids[k].forEach(ch => { mn = Math.max(mn, age[ch]); });
      if (F.parent[k] >= 0) mx = Math.min(mx, age[F.parent[k]]);
      return [mn, mx];
    };
    for (let outer = 0; outer < 400; outer++) {
      /* ages given the rate: block coordinate descent, node by node and clade by clade */
      for (let inner = 0; inner < 30; inner++) {
        let change = 0;
        pre.forEach(k => {
          if (F.isTip[k]) return;
          let num = 0, den = 0;
          if (RP && k === 0) {
            /* 2·t_root = t_1 + t_2 + B/ω */
            num = wR * omega * omega * 2 * (age[RP[0]] + age[RP[1]] + BR / omega); den = wR * omega * omega * 4;
          } else {
            if (isRootKid(k)) { const sib = RP[0] === k ? RP[1] : RP[0]; num += wR * omega * omega * (2 * age[0] - age[sib] - BR / omega); den += wR * omega * omega; }
            else if (F.parent[k] >= 0) { const p = F.parent[k]; num += w[k] * omega * omega * (age[p] - b[k] / omega); den += w[k] * omega * omega; }
            F.kids[k].forEach(ch => { num += w[ch] * omega * omega * (age[ch] + b[ch] / omega); den += w[ch] * omega * omega; });
          }
          let v = den > 0 ? num / den : age[k];
          const [mn, mx] = clampNode(k);
          v = Math.min(Math.max(v, mn), mx >= mn ? mx : mn);
          change = Math.max(change, Math.abs(v - age[k])); age[k] = v;
        });
        /* shifting a whole clade moves nodes blocked by an active ordering constraint */
        F.post.forEach(k => {
          if (F.isTip[k] || F.parent[k] < 0) return;
          const sub = []; const collect = x => { if (!F.isTip[x]) { sub.push(x); F.kids[x].forEach(collect); } }; collect(k);
          const inSub = new Set(sub);
          /* f(δ) = Σ w (r + s ω δ)²: s = +1 for the branch above the clade (it shortens),
             s = −1 for branches to tips inside it (they lengthen); δ* = −Σ w r s ω / Σ w ω² */
          let g1 = 0, g2 = 0;
          sub.forEach(x => {
            const p = F.parent[x];
            if (!inSub.has(p)) {
              if (isRootKid(x)) { const r = BR - omega * (2 * age[0] - age[RP[0]] - age[RP[1]]); g1 += wR * omega * r; g2 += wR * omega * omega; }
              else { const r = b[x] - omega * (age[p] - age[x]); g1 += w[x] * omega * r; g2 += w[x] * omega * omega; }
            }
            F.kids[x].forEach(ch => { if (F.isTip[ch]) { const r = b[ch] - omega * (age[x] - age[ch]); g1 -= w[ch] * omega * r; g2 += w[ch] * omega * omega; } });
          });
          if (g2 <= 0) return;
          let delta = -g1 / g2;
          let dmin = -Infinity, dmax = Infinity;
          sub.forEach(x => {
            dmin = Math.max(dmin, lo[x] - age[x]); dmax = Math.min(dmax, hi[x] - age[x]);
            F.kids[x].forEach(ch => { if (!inSub.has(ch)) dmin = Math.max(dmin, age[ch] - age[x]); });
          });
          dmax = Math.min(dmax, age[F.parent[k]] - age[k]);
          if (dmin > dmax) return;
          delta = Math.min(Math.max(delta, dmin), dmax);
          if (Math.abs(delta) > 1e-12) { sub.forEach(x => { age[x] += delta; }); change = Math.max(change, Math.abs(delta)); }
        });
        if (change < 1e-10 * Math.max(1, age[0])) break;
      }
      if (rateFixed) break;
      let num = 0, den = 0;
      for (let k = 1; k < n; k++) { if (isRootKid(k)) continue; const dt = age[F.parent[k]] - age[k]; num += w[k] * b[k] * dt; den += w[k] * dt * dt; }
      if (RP) { const dt = 2 * age[0] - age[RP[0]] - age[RP[1]]; num += wR * BR * dt; den += wR * dt * dt; }
      const newOmega = den > 0 ? num / den : omega;
      if (Math.abs(newOmega - omega) < 1e-10 * omega) { omega = newOmega; break; }
      omega = newOmega;
    }
    let ss = 0;
    for (let k = 1; k < n; k++) { if (isRootKid(k)) continue; const r = b[k] - omega * (age[F.parent[k]] - age[k]); ss += w[k] * r * r; }
    if (RP) { const r = BR - omega * (2 * age[0] - age[RP[0]] - age[RP[1]]); ss += wR * r * r; }
    return { age, omega, wss: ss };
  }

  function lsd(tree, L, calibs, opts) {
    opts = opts || {};
    const F = flatten(tree);
    const b = Float64Array.from(F.len, v => Math.max(0, v || 0));
    const c = opts.pseudo == null ? 10 : opts.pseudo;
    const prepared = calibs.map(cb => ({ node: cb.node, cal: prepareCalibration(cb) }));
    const boundsOf = (sampleFromInterval, r) => prepared.map(({ node, cal }) => {
      if (cal.type === 'fixed') return { node, lo: cal.value, hi: cal.value };
      if (cal.type === 'normal') {
        const v = sampleFromInterval ? cal.mean + cal.sd * r.normal() : cal.mean;
        return { node, lo: Math.max(0, v), hi: Math.max(0, v) };
      }
      if (cal.type === 'uniform' && cal.max != null) {
        if (sampleFromInterval) { const v = cal.min + r() * (cal.max - cal.min); return { node, lo: v, hi: v }; }
        return { node, lo: cal.min, hi: cal.max };
      }
      return { node, lo: cal.hardMin, hi: cal.hardMax != null ? cal.hardMax : (cal.q.q975 != null ? cal.q.q975 : null) };
    });
    const rateMean = opts.rate && opts.rate.mean ? opts.rate.mean : null;
    if (!rateMean && !prepared.length) throw new Error('Dating needs at least one calibration or a substitution rate.');
    const fit = lsdCore(F, b, L, boundsOf(false), rateMean, c, null);
    /* confidence intervals by resampling */
    const reps = opts.reps == null ? 100 : opts.reps;
    const r = makeRng(opts.seed || 1);
    const sigma = opts.rateSigma == null ? 0.2 : opts.rateSigma;
    const ages = [], omegas = [];
    for (let rep = 0; rep < reps; rep++) {
      const bb = new Float64Array(F.n);
      for (let k = 1; k < F.n; k++) {
        const expected = fit.omega * (fit.age[F.parent[k]] - fit.age[k]) * Math.exp(sigma * r.normal() - sigma * sigma / 2);
        bb[k] = r.poisson(Math.max(0, expected) * L) / L;
      }
      const rate = rateMean ? Math.max(rateMean * 0.01, rateMean + (opts.rate.sd || 0) * r.normal()) : null;
      const fr = lsdCore(F, bb, L, boundsOf(true, r), rate, c, fit.age);
      ages.push(fr.age); omegas.push(fr.omega);
      if (opts.progress && rep % 10 === 0) opts.progress(rep / reps);
    }
    const q = (arr, p) => { const s = arr.slice().sort((x, y) => x - y); const i = (s.length - 1) * p; const a = Math.floor(i); return s[a] + (s[Math.min(s.length - 1, a + 1)] - s[a]) * (i - a); };
    const ci = [];
    for (let k = 0; k < F.n; k++) { const v = ages.map(a => a[k]); ci.push(reps ? [q(v, 0.025), q(v, 0.975)] : null); }
    const out = unflatten(F, null, fit.age, (k, o) => { if (ci[k] && !F.isTip[k]) o.hpd = ci[k]; });
    /* tip-to-root regression (temporal signal is only meaningful for dated tips; here: root-to-tip variation) */
    return { tree: out, rate: fit.omega, rateCI: reps ? [q(omegas, 0.025), q(omegas, 0.975)] : null, rootAge: fit.age[0], rootCI: ci[0], wss: fit.wss, reps };
  }

  /* ================================================================
     Bayesian MCMC on node ages
     ================================================================ */
  function hpd(values, mass) {
    const s = values.slice().sort((a, b) => a - b), n = s.length;
    const m = Math.max(1, Math.floor(mass * n));
    let best = [s[0], s[n - 1]], w = Infinity;
    for (let i = 0; i + m - 1 < n; i++) { const d = s[i + m - 1] - s[i]; if (d < w) { w = d; best = [s[i], s[i + m - 1]]; } }
    return best;
  }
  function ess(x) {
    const n = x.length; if (n < 10) return n;
    const mean = x.reduce((s, v) => s + v, 0) / n;
    let v0 = 0; for (let i = 0; i < n; i++) v0 += (x[i] - mean) ** 2;
    if (v0 <= 0) return n;
    const rho = lag => { let s = 0; for (let i = 0; i + lag < n; i++) s += (x[i] - mean) * (x[i + lag] - mean); return s / v0; };
    /* Geyer (1992): sum pairs of autocorrelations while positive and monotone */
    let sum = -1, prev = Infinity;
    for (let m = 0; 2 * m + 1 < n; m++) {
      const g = rho(2 * m) + rho(2 * m + 1);
      if (g <= 0) break;
      const gg = Math.min(g, prev); sum += 2 * gg; prev = gg;
      if (m > 2000) break;
    }
    return Math.max(1, n / Math.max(1, sum));
  }

  /* opts: {tree (rooted, ML lengths), seqs, spec (fitted), calibs:[{node, type,…}], rate:{mean, sd} | null,
            clock:'strict'|'ucln', treePrior:'yule'|'coalescent', rootMax, iterations, thin, burnin (fraction),
            seed, samplePrior, progress(frac, info)} */
  function mcmc(opts) {
    const r = makeRng(opts.seed || 1);
    const F = flatten(opts.tree);
    const A = compress(opts.seqs);
    const spec = Object.assign({}, opts.spec, { freqs: A.freqs });
    let M = makeModel(spec);
    const lik = Lik(F, A, M);
    const n = F.n, internal = [], nonRootInternal = [];
    for (let k = 0; k < n; k++) if (!F.isTip[k]) { internal.push(k); if (k !== 0) nonRootInternal.push(k); }
    const nTips = n - internal.length;
    const cals = (opts.calibs || []).map(c => Object.assign(prepareCalibration(c), { node: c.node }));
    const calOf = new Map(cals.map(c => [c.node, c]));
    const ucln = opts.clock === 'ucln';
    const coal = opts.treePrior === 'coalescent';
    const samplePrior = !!opts.samplePrior;

    /* ---- initial state ---- */
    const age = new Float64Array(n);
    if (opts.initAges) age.set(opts.initAges);
    else {
      const down = new Float64Array(n);
      F.post.forEach(k => { if (!F.isTip[k]) { let s = 0; F.kids[k].forEach(ch => { s += F.len[ch] + down[ch]; }); down[k] = s / F.kids[k].length; } });
      const rt = opts.rate && opts.rate.mean ? 1 / opts.rate.mean : (cals.length ? Math.max(...cals.map(c => (c.q.q50 || 1) / Math.max(1e-9, down[c.node]))) : 1);
      for (let k = 0; k < n; k++) age[k] = F.isTip[k] ? 0 : down[k] * rt;
    }
    /* make the start strictly ordered and inside the hard bounds */
    const fixOrder = () => {
      F.post.forEach(k => { if (F.isTip[k]) return; let mx = 0; F.kids[k].forEach(ch => { mx = Math.max(mx, age[ch]); }); const c = calOf.get(k); let lo = mx * 1.0001 + 1e-9; if (c && c.hardMin != null) lo = Math.max(lo, c.hardMin * 1.0001); if (age[k] < lo) age[k] = lo; });
      [...F.post].reverse().forEach(k => { if (F.isTip[k]) return; const c = calOf.get(k); if (c && c.hardMax != null && age[k] > c.hardMax) age[k] = c.hardMax * 0.999; });
      F.post.forEach(k => { if (F.isTip[k]) return; let mx = 0; F.kids[k].forEach(ch => { mx = Math.max(mx, age[ch]); }); if (age[k] <= mx) age[k] = mx * 1.001 + 1e-9; });
    };
    fixOrder();
    let totalLen = 0, totalTime = 0;
    for (let k = 1; k < n; k++) { totalLen += F.len[k]; totalTime += age[F.parent[k]] - age[k]; }
    let mu = opts.rate && opts.rate.mean ? opts.rate.mean : Math.max(1e-12, totalLen / Math.max(1e-12, totalTime));
    const muStart = mu;
    let sigma = ucln ? 0.3 : 0;
    const z = new Float64Array(n);                       // branch rate deviates (non-centred)
    let kappa = spec.kappa || 2, alpha = spec.alpha || null;
    let lambda = Math.log(nTips) / Math.max(1e-9, age[0]);
    let theta = age[0] / Math.max(1, 2 * (1 - 1 / nTips));   // coalescent: E[TMRCA] = 2Θ(1 − 1/n)
    /* weakly informative, proper priors centred on the starting values (log-normal, SD 2 in log units):
       improper 1/x priors let unidentified parameters drift to infinity, notably when sampling from the prior */
    const lnPrior = (x, centre, s) => { if (!(x > 0)) return -Infinity; const zz = (Math.log(x) - Math.log(centre)) / s; return -Math.log(x) - zz * zz / 2; };
    const lambda0 = lambda, theta0 = theta;

    const rateOf = k => (ucln ? mu * Math.exp(sigma * z[k] - sigma * sigma / 2) : mu);
    const lens = new Float64Array(n);
    const setLen = k => { lens[k] = rateOf(k) * (age[F.parent[k]] - age[k]); };
    for (let k = 1; k < n; k++) setLen(k);

    /* ---- priors ---- */
    const LN_KAPPA = (x) => { const s = 1.25, zz = (Math.log(x) - 1) / s; return -Math.log(x * s * 2.5066) - zz * zz / 2; };
    function treePriorLn() {
      if (coal) {
        const events = internal.map(k => age[k]).sort((a, b) => a - b);
        let lp = 0, k = nTips, prev = 0;
        for (const t of events) { const dt = t - prev; lp += -Math.log(theta) - (k * (k - 1) / 2) * dt / theta; k--; prev = t; }
        return lp + lnPrior(theta, theta0, 2);
      }
      const root = age[0];
      const denom = Math.log(1 - Math.exp(-lambda * root));
      let lp = 0;
      nonRootInternal.forEach(k => { lp += Math.log(lambda) - lambda * age[k] - denom; });
      lp += lnPrior(lambda, lambda0, 2);
      if (!calOf.has(0) && opts.rootMax) lp += root <= opts.rootMax ? -Math.log(opts.rootMax) : -Infinity;
      return lp;
    }
    function calPriorLn() { let lp = 0; for (const c of cals) { lp += calLogDensity(c, age[c.node]); if (lp === -Infinity) return lp; } return lp; }
    function clockPriorLn() {
      let lp = 0;
      if (opts.rate && opts.rate.mean) {
        const sd = opts.rate.sd || opts.rate.mean * 0.1, zz = (mu - opts.rate.mean) / sd;
        lp += mu > 0 ? -zz * zz / 2 : -Infinity;
      } else lp += lnPrior(mu, muStart, 2.5);
      if (ucln) {
        lp += -Math.log(1 / 3) - sigma * 3;              // σ ~ Exponential(mean 1/3)
        for (let k = 1; k < n; k++) lp += -z[k] * z[k] / 2;
      }
      return lp;
    }
    function substPriorLn() { let lp = 0; if (spec.model === 'K80' || spec.model === 'HKY') lp += LN_KAPPA(kappa); if (alpha) lp += -alpha; return lp; }
    const priorLn = () => treePriorLn() + calPriorLn() + clockPriorLn() + substPriorLn();

    const refreshModel = () => { spec.kappa = kappa; spec.alpha = alpha; M = makeModel(spec); lik.setModel(M); };
    let lnL = samplePrior ? 0 : lik.full(lens);
    let lnP = priorLn();
    if (!isFinite(lnP)) throw new Error('The starting ages violate a calibration: check that the minimum and maximum ages of nested nodes are compatible.');

    /* ---- operators ---- */
    const ops = [];
    const addOp = (name, weight, fn, size) => ops.push({ name, weight, fn, size, tried: 0, acc: 0, tuneTried: 0, tuneAcc: 0 });
    const evalProposal = (edges, full) => {
      if (samplePrior) return 0;
      if (full) return lik.full(lens);
      return lik.propose(edges, lens);
    };
    const commit = (edges, full) => { if (!samplePrior && !full) lik.accept(); };
    const rollback = (edges, full, restore) => { restore(); if (!samplePrior) { if (full) { lik.full(lens); } else lik.reject(); } };

    /* node slide: a uniform draw between the oldest child and the parent */
    addOp('nodeSlide', Math.max(3, nonRootInternal.length), () => {
      if (!nonRootInternal.length) return null;
      const k = nonRootInternal[Math.floor(r() * nonRootInternal.length)];
      let lo = 0; F.kids[k].forEach(ch => { lo = Math.max(lo, age[ch]); });
      const hi = age[F.parent[k]];
      const old = age[k];
      age[k] = lo + r() * (hi - lo);
      const edges = [k].concat(F.kids[k]);
      edges.forEach(setLen);
      return { edges, logHR: 0, restore: () => { age[k] = old; edges.forEach(setLen); } };
    });
    addOp('rootScale', 3, (size) => {
      const old = age[0];
      let lo = 0; F.kids[0].forEach(ch => { lo = Math.max(lo, age[ch]); });
      const f = Math.exp(size * (r() - 0.5));
      const nv = old * f;
      if (nv <= lo) return { reject: true };
      age[0] = nv;
      const edges = F.kids[0].slice();
      edges.forEach(setLen);
      return { edges, logHR: Math.log(f), restore: () => { age[0] = old; edges.forEach(setLen); } };
    }, 0.6);
    /* ages up, rate down: keeps branch lengths and is the key move for clock models */
    addOp('upDown', 4, (size) => {
      const f = Math.exp(size * (r() - 0.5));
      const oldA = Float64Array.from(age), oldMu = mu;
      internal.forEach(k => { age[k] *= f; });
      mu /= f;
      if (opts.rate && opts.rate.mean == null) { /* nothing */ }
      for (let k = 1; k < n; k++) setLen(k);
      /* branch lengths = rate × duration are unchanged, so the likelihood is too */
      return { noLik: true, logHR: (internal.length - 1) * Math.log(f), restore: () => { age.set(oldA); mu = oldMu; for (let k = 1; k < n; k++) setLen(k); } };
    }, 0.5);
    addOp('treeScale', 1, (size) => {
      const f = Math.exp(size * (r() - 0.5));
      const oldA = Float64Array.from(age);
      internal.forEach(k => { age[k] *= f; });
      for (let k = 1; k < n; k++) setLen(k);
      return { full: true, logHR: internal.length * Math.log(f), restore: () => { age.set(oldA); for (let k = 1; k < n; k++) setLen(k); } };
    }, 0.3);
    addOp('rate', ucln ? 2 : 1, (size) => {
      const f = Math.exp(size * (r() - 0.5)), old = mu;
      mu *= f;
      for (let k = 1; k < n; k++) setLen(k);
      return { full: true, logHR: Math.log(f), restore: () => { mu = old; for (let k = 1; k < n; k++) setLen(k); } };
    }, 0.4);
    if (ucln) {
      /* node slide with compensating branch rates: the new age is drawn uniformly as in
         nodeSlide, and the deviates z of the three adjacent branches are shifted so that
         their lengths (rate × duration) stay the same. For a fixed new age the shift is a
         translation (Jacobian 1) and the age draw is symmetric, so the Hastings ratio is 1;
         the likelihood does not change, only the prior. */
      addOp('slideWithRates', Math.max(3, nonRootInternal.length), () => {
        const all = internal;
        const k = all[Math.floor(r() * all.length)];
        let lo = 0; F.kids[k].forEach(ch => { lo = Math.max(lo, age[ch]); });
        const hi = k === 0 ? age[0] * 1.5 + 1e-9 : age[F.parent[k]];
        if (k === 0) return { reject: true };
        const old = age[k];
        const edges = [k].concat(F.kids[k]);
        const oldZ = edges.map(e => z[e]);
        const dur = e => age[F.parent[e]] - age[e];
        const oldDur = edges.map(dur);
        age[k] = lo + r() * (hi - lo);
        let bad = false;
        edges.forEach((e, i) => { const nd = dur(e); if (!(nd > 0) || !(oldDur[i] > 0)) { bad = true; return; } z[e] += (Math.log(oldDur[i]) - Math.log(nd)) / Math.max(sigma, 1e-9); });
        if (bad) { age[k] = old; edges.forEach((e, i) => { z[e] = oldZ[i]; }); return { reject: true }; }
        edges.forEach(setLen);
        return { noLik: true, logHR: 0, restore: () => { age[k] = old; edges.forEach((e, i) => { z[e] = oldZ[i]; }); edges.forEach(setLen); } };
      });
      addOp('branchRate', Math.max(4, Math.round((n - 1) / 2)), (size) => {
        const k = 1 + Math.floor(r() * (n - 1));
        const old = z[k];
        z[k] += size * r.normal();
        setLen(k);
        return { edges: [k], logHR: 0, restore: () => { z[k] = old; setLen(k); } };
      }, 0.8);
      addOp('sigma', 3, (size) => {
        const f = Math.exp(size * (r() - 0.5)), old = sigma;
        sigma *= f;
        for (let k = 1; k < n; k++) setLen(k);
        return { full: true, logHR: Math.log(f), restore: () => { sigma = old; for (let k = 1; k < n; k++) setLen(k); } };
      }, 0.5);
    }
    if (spec.model === 'K80' || spec.model === 'HKY') addOp('kappa', 0.5, (size) => {
      const f = Math.exp(size * (r() - 0.5)), old = kappa;
      kappa *= f; refreshModel();
      return { full: true, logHR: Math.log(f), restore: () => { kappa = old; refreshModel(); } };
    }, 0.4);
    if (alpha) addOp('alpha', 0.5, (size) => {
      const f = Math.exp(size * (r() - 0.5)), old = alpha;
      alpha *= f; refreshModel();
      return { full: true, logHR: Math.log(f), restore: () => { alpha = old; refreshModel(); } };
    }, 0.5);
    addOp(coal ? 'theta' : 'lambda', 2, (size) => {
      const f = Math.exp(size * (r() - 0.5));
      if (coal) { const old = theta; theta *= f; return { noLik: true, logHR: Math.log(f), restore: () => { theta = old; } }; }
      const old = lambda; lambda *= f; return { noLik: true, logHR: Math.log(f), restore: () => { lambda = old; } };
    }, 1.0);

    const totalW = ops.reduce((s, o) => s + o.weight, 0);
    const pick = () => { let u = r() * totalW; for (const o of ops) { u -= o.weight; if (u <= 0) return o; } return ops[ops.length - 1]; };

    /* ---- chain ---- */
    const N = Math.max(1000, Math.floor(opts.iterations || 200000));
    const thin = Math.max(1, Math.floor(opts.thin || Math.max(1, N / 2000)));
    const burnN = Math.floor(N * (opts.burnin == null ? 0.2 : opts.burnin));
    const trace = { state: [], lnL: [], prior: [], posterior: [], rate: [], sigma: [], kappa: [], alpha: [], treeParam: [], rootAge: [] };
    const nodeSamples = internal.map(() => []);
    const rateSamples = ucln ? Array.from({ length: n }, () => []) : null;
    const lensZeroCheck = () => { for (let k = 1; k < n; k++) if (!(lens[k] >= 0) || !isFinite(lens[k])) return false; return true; };
    const t0 = Date.now();
    for (let it = 1; it <= N; it++) {
      const op = pick();
      const pr = op.fn(op.size);
      op.tried++; if (it <= burnN) op.tuneTried++;
      /* a proposal outside the support is a rejection: the current state is still
         recorded below, otherwise the samples would be biased towards the interior */
      step: {
        if (!pr || pr.reject) break step;
        if (!lensZeroCheck()) { pr.restore(); break step; }
        const newP = priorLn();
        if (newP === -Infinity || isNaN(newP)) { pr.restore(); break step; }
        const newL = pr.noLik ? lnL : evalProposal(pr.edges, pr.full);
        const logA = (newL - lnL) + (newP - lnP) + pr.logHR;
        if (Math.log(r()) < logA) {
          lnL = newL; lnP = newP; op.acc++; if (it <= burnN) op.tuneAcc++;
          if (!pr.noLik) commit(pr.edges, pr.full);
        } else {
          if (pr.noLik) pr.restore();
          else rollback(pr.edges, pr.full, pr.restore);
        }
      }
      /* adaptive tuning during burn-in, aiming at ~0.3 acceptance */
      if (it <= burnN && op.size != null && op.tuneTried >= 100) {
        const rate = op.tuneAcc / op.tuneTried;
        op.size *= rate > 0.3 ? 1.15 : 0.87;
        op.size = Math.min(Math.max(op.size, 0.01), 3);
        op.tuneTried = 0; op.tuneAcc = 0;
      }
      if (it > burnN && (it - burnN) % thin === 0) {
        trace.state.push(it); trace.lnL.push(lnL); trace.prior.push(lnP); trace.posterior.push(lnL + lnP);
        trace.rate.push(mu); trace.sigma.push(sigma); trace.kappa.push(kappa); trace.alpha.push(alpha || 0); trace.treeParam.push(coal ? theta : lambda); trace.rootAge.push(age[0]);
        internal.forEach((k, j) => nodeSamples[j].push(age[k]));
        if (ucln) for (let k = 1; k < n; k++) rateSamples[k].push(rateOf(k));
      }
      if (opts.progress && it % Math.max(1, Math.floor(N / 200)) === 0) opts.progress(it / N, { lnL, rootAge: age[0], rate: mu, elapsed: (Date.now() - t0) / 1000 });
      if (opts.cancelled && it % 1000 === 0 && opts.cancelled()) break;
      /* periodic full recomputation guards against drift in the cached partials */
      if (!samplePrior && it % 5000 === 0) lnL = lik.full(lens);
    }

    /* ---- summaries ---- */
    const mean = a => a.reduce((s, v) => s + v, 0) / (a.length || 1);
    const median = a => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[s.length >> 1] : null; };
    const summary = {};
    internal.forEach((k, j) => {
      const v = nodeSamples[j];
      summary[k] = { mean: mean(v), median: median(v), hpd: v.length ? hpd(v, 0.95) : null, ess: ess(v) };
    });
    const essOf = key => (trace[key].length ? ess(trace[key]) : null);
    const out = unflatten(F, null, null, (k, o) => {
      if (F.isTip[k]) { o.age = 0; return; }
      o.age = summary[k].median; o.ageMean = summary[k].mean; o.hpd = summary[k].hpd; o.ess = summary[k].ess;
      if (ucln) { /* rate of the branch above */ }
    });
    /* branch rates (for colouring branches) */
    if (ucln) {
      const walk = (node, k) => { node.children.forEach((c, i) => { const ck = F.kids[k][i]; c.node.rate = mean(rateSamples[ck]); walk(c.node, ck); }); };
      walk(out, 0);
    }
    const params = {
      lnL: { mean: mean(trace.lnL), ess: essOf('lnL') }, posterior: { mean: mean(trace.posterior), ess: essOf('posterior') },
      rate: { mean: mean(trace.rate), median: median(trace.rate), hpd: trace.rate.length ? hpd(trace.rate, 0.95) : null, ess: essOf('rate') },
      rootAge: { mean: mean(trace.rootAge), median: median(trace.rootAge), hpd: trace.rootAge.length ? hpd(trace.rootAge, 0.95) : null, ess: essOf('rootAge') },
    };
    if (ucln) params.sigma = { mean: mean(trace.sigma), hpd: hpd(trace.sigma, 0.95), ess: essOf('sigma') };
    if (spec.model === 'K80' || spec.model === 'HKY') params.kappa = { mean: mean(trace.kappa), hpd: hpd(trace.kappa, 0.95), ess: essOf('kappa') };
    if (alpha) params.alpha = { mean: mean(trace.alpha), hpd: hpd(trace.alpha, 0.95), ess: essOf('alpha') };
    params[coal ? 'theta' : 'lambda'] = { mean: mean(trace.treeParam), hpd: hpd(trace.treeParam, 0.95), ess: essOf('treeParam') };
    return {
      tree: out, trace, params, nodeSummary: summary, internal, nodeSamples, samples: nodeSamples.length ? nodeSamples[0].length : 0,
      operators: ops.map(o => ({ name: o.name, tried: o.tried, acceptance: o.tried ? o.acc / o.tried : null, size: o.size })),
      iterations: N, thin, burnin: burnN, samplePrior, clock: ucln ? 'ucln' : 'strict', treePrior: coal ? 'coalescent' : 'yule', seconds: (Date.now() - t0) / 1000,
    };
  }

  /* ================================================================
     simulation (for validation and teaching)
     ================================================================ */
  function simulateSeqs(tree, L, spec, seed) {
    const r = makeRng(seed || 1);
    const M = makeModel(Object.assign({ freqs: [0.25, 0.25, 0.25, 0.25] }, spec));
    const F = flatten(tree);
    const siteRate = new Float64Array(L);
    for (let s = 0; s < L; s++) siteRate[s] = M.catRates[Math.floor(r() * M.ncat)];
    const states = Array.from({ length: F.n }, () => new Uint8Array(L));
    const draw = probs => { let u = r(), acc = 0; for (let i = 0; i < 4; i++) { acc += probs[i]; if (u <= acc) return i; } return 3; };
    for (let s = 0; s < L; s++) states[0][s] = draw(M.pi);
    const Pm = new Float64Array(16);
    const pre = F.post.slice().reverse();
    const cache = new Map();
    pre.forEach(k => {
      if (k === 0) return;
      const p = F.parent[k];
      for (let s = 0; s < L; s++) {
        const t = F.len[k] * siteRate[s];
        const key = t.toFixed(10);
        let P = cache.get(key);
        if (!P) { P = new Float64Array(16); transition(M, t, P, 0); cache.set(key, P); }
        const i = states[p][s];
        states[k][s] = draw([P[i * 4], P[i * 4 + 1], P[i * 4 + 2], P[i * 4 + 3]]);
      }
    });
    const seqs = [];
    for (let k = 0; k < F.n; k++) if (F.isTip[k]) seqs[F.tipRow[k]] = Array.from(states[k], x => 'ACGT'[x]).join('');
    return seqs;
  }
  /* a random ultrametric Yule tree with given root age */
  function yuleTree(nTips, rootAge, seed) {
    const r = makeRng(seed || 1);
    let lineages = [{ age: 0, node: null }];
    let nodes = Array.from({ length: nTips }, (_, i) => ({ tip: i, label: 'T' + (i + 1), children: [], age: 0 }));
    let pool = nodes.slice();
    let t = 0;
    const ages = [];
    for (let k = nTips; k > 1; k--) { t += -Math.log(r()) / (k * (k - 1) / 2); ages.push(t); }
    const scale = rootAge / t;
    ages.forEach(a => {
      const i = Math.floor(r() * pool.length); let j = Math.floor(r() * (pool.length - 1)); if (j >= i) j++;
      const a1 = pool[i], a2 = pool[j], age = a * scale;
      const nn = { children: [{ node: a1, len: age - a1.age }, { node: a2, len: age - a2.age }], age };
      pool = pool.filter((_, q) => q !== i && q !== j); pool.push(nn);
    });
    return pool[0];
  }

  return {
    makeRng, lgamma, pgamma, qgamma, qnorm, discreteGamma, compress, makeModel, transition, flatten, unflatten, Lik,
    brentMin, fitML, compareModels, prepareCalibration, calLogDensity, calQuantiles, lsd, lsdCore, mcmc, hpd, ess,
    simulateSeqs, yuleTree, nParamsModel,
  };
}

/* on the page: the engine, plus a Worker built from this very source */
if (typeof window !== 'undefined') {
  window.Dating = DatingCore();
  window.Dating.runInWorker = (cmd, payload, onProgress) => new Promise((resolve, reject) => {
    let w;
    try {
      const src = DatingCore.toString() + '\nconst D = DatingCore();\nself.onmessage = e => {\n  const m = e.data; let cancel = false;\n  if (m.cancel) { self.__cancel = true; return; }\n  try {\n    const p = Object.assign({}, m.payload, { progress: (f, info) => self.postMessage({ type: "progress", f, info }), cancelled: () => !!self.__cancel });\n    const res = m.cmd === "mcmc" ? D.mcmc(p) : m.cmd === "lsd" ? D.lsd(p.tree, p.L, p.calibs, p) : m.cmd === "compare" ? D.compareModels(p.tree, p.seqs, p) : D.fitML(p.tree, p.seqs, p.spec, p);\n    self.postMessage({ type: "done", res });\n  } catch (err) { self.postMessage({ type: "error", message: err.message }); }\n};\n';
      const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
      w = new Worker(url);
      URL.revokeObjectURL(url);
    } catch (e) {
      /* no Worker available: run on the page */
      try {
        const p = Object.assign({}, payload, { progress: onProgress });
        const D = window.Dating;
        resolve(cmd === 'mcmc' ? D.mcmc(p) : cmd === 'lsd' ? D.lsd(p.tree, p.L, p.calibs, p) : cmd === 'compare' ? D.compareModels(p.tree, p.seqs, p) : D.fitML(p.tree, p.seqs, p.spec, p));
      } catch (err) { reject(err); }
      return;
    }
    window.Dating._worker = w; window.Dating._reject = reject;
    let heard = false;
    const onPage = () => {
      try {
        const p = Object.assign({}, payload, { progress: onProgress });
        const D = window.Dating;
        resolve(cmd === 'mcmc' ? D.mcmc(p) : cmd === 'lsd' ? D.lsd(p.tree, p.L, p.calibs, p) : cmd === 'compare' ? D.compareModels(p.tree, p.seqs, p) : D.fitML(p.tree, p.seqs, p.spec, p));
      } catch (err) { reject(err); }
    };
    w.onmessage = e => {
      const m = e.data;
      heard = true;
      if (m.type === 'progress') { if (onProgress) onProgress(m.f, m.info); }
      else if (m.type === 'done') { w.terminate(); window.Dating._worker = null; resolve(m.res); }
      else if (m.type === 'error') { w.terminate(); window.Dating._worker = null; reject(new Error(m.message)); }
    };
    /* a worker the browser refuses to start (some file:// settings) fails before saying anything: run on the page */
    w.onerror = e => { w.terminate(); window.Dating._worker = null; if (!heard) onPage(); else reject(new Error(e.message || 'The worker failed.')); };
    w.postMessage({ cmd, payload });
  });
  /* a running MCMC never reads its messages, so cancelling means stopping the worker */
  window.Dating.cancel = () => { const w = window.Dating._worker; if (w) { w.terminate(); window.Dating._worker = null; if (window.Dating._reject) window.Dating._reject(new Error('cancelled')); } };
}
