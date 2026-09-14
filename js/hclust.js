/* PopGeneticsPro — small clustering engine used by the home page (illustrations and playground).
   Later blocks extend it; the API is kept deliberately close to R's hclust()/cutree()/kmeans().

   HC.dist(points, metric)            -> n×n distance matrix
   HC.agglomerate(D, method)          -> {n, merge, height, order, method}   (merge uses R's sign convention)
   HC.cutree(hc, k)                   -> array of cluster ids 1..k (by observation)
   HC.layout(hc)                      -> {leafX[obs], nodes[step] = {x, y, l, r, members}}
   HC.cophenetic(hc)                  -> n×n cophenetic matrix
   HC.copheneticCor(D, hc)            -> Pearson correlation between D and the cophenetic distances
   KM.run(points, k, opts)            -> {cluster (0-based), centers, wss, iter}
   KM.init / KM.assign / KM.update    -> single steps, for animation
   Geom.hull(points)                  -> convex hull (Andrew's monotone chain)
*/

const HC = {};

HC.dist = (P, metric) => {
  metric = metric || 'euclidean';
  const n = P.length, D = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    let d = 0;
    const a = P[i], b = P[j];
    if (metric === 'manhattan') { for (let t = 0; t < a.length; t++) d += Math.abs(a[t] - b[t]); }
    else if (metric === 'chebyshev') { for (let t = 0; t < a.length; t++) d = Math.max(d, Math.abs(a[t] - b[t])); }
    else { for (let t = 0; t < a.length; t++) d += (a[t] - b[t]) * (a[t] - b[t]); d = Math.sqrt(d); }
    D[i][j] = D[j][i] = d;
  }
  return D;
};

/* Lance–Williams agglomeration. Methods: single, complete, average (UPGMA), weighted (WPGMA / mcquitty),
   centroid (UPGMC), median (WPGMC), ward.D, ward.D2. Centroid, median and ward.D2 work on squared
   distances and report heights on the original scale (as R does for ward.D2). O(n³), fine for n ≤ ~600. */
HC.agglomerate = (D0, method, opts) => {
  method = method || 'average'; opts = opts || {};
  if (method === 'diana') return HC.diana(D0);
  const beta = opts.beta == null ? -0.25 : +opts.beta;
  const n = D0.length;
  const sq = method === 'ward.D2' || method === 'centroid' || method === 'median';
  const D = D0.map(r => r.map(v => sq ? v * v : v));
  const size = new Array(n).fill(1), id = Array.from({ length: n }, (_, i) => -(i + 1));
  const alive = new Array(n).fill(true);
  const merge = [], height = [];
  for (let step = 0; step < n - 1; step++) {
    let best = Infinity, bi = -1, bj = -1;
    for (let i = 0; i < n; i++) if (alive[i]) for (let j = i + 1; j < n; j++) if (alive[j] && D[i][j] < best) { best = D[i][j]; bi = i; bj = j; }
    const ni = size[bi], nj = size[bj], dij = best;
    /* R convention: singletons (negative) listed before clusters; otherwise smaller first */
    const a = id[bi], b = id[bj];
    merge.push((a < 0 && b > 0) || (a < 0 && b < 0 && a > b) || (a > 0 && b > 0 && a > b) ? [b, a] : [a, b]);
    height.push(sq ? Math.sqrt(Math.max(best, 0)) : best);
    for (let k = 0; k < n; k++) if (alive[k] && k !== bi && k !== bj) {
      const nk = size[k], dik = D[bi][k], djk = D[bj][k];
      let d;
      switch (method) {
        case 'single': d = Math.min(dik, djk); break;
        case 'complete': d = Math.max(dik, djk); break;
        case 'weighted': case 'mcquitty': d = (dik + djk) / 2; break;
        case 'centroid': d = (ni * dik + nj * djk) / (ni + nj) - ni * nj * dij / ((ni + nj) * (ni + nj)); break;
        case 'median': d = (dik + djk) / 2 - dij / 4; break;
        case 'ward.D': case 'ward.D2': d = ((ni + nk) * dik + (nj + nk) * djk - nk * dij) / (ni + nj + nk); break;
        case 'flexible': d = (1 - beta) / 2 * (dik + djk) + beta * dij; break;
        default: d = (ni * dik + nj * djk) / (ni + nj);
      }
      D[bi][k] = D[k][bi] = d;
    }
    size[bi] = ni + nj; alive[bj] = false; id[bi] = step + 1;
  }
  const hc = { n, merge, height, method, beta: method === 'flexible' ? beta : undefined };
  hc.order = HC.leafOrder(hc);
  return hc;
};

/* DIANA (Kaufman & Rousseeuw): divisive analysis. Each cluster is split by its diameter; the object with
   the largest mean dissimilarity starts the splinter group and objects move while they are closer to it.
   The result is returned in hclust form (merge / height / order) so every tool applies to it. */
HC.diana = D => {
  const n = D.length, nodes = [];
  const mean = (i, set) => { let s = 0, c = 0; for (const j of set) if (j !== i) { s += D[i][j]; c++; } return c ? s / c : 0; };
  function split(members) {
    if (members.length === 1) return { leaf: members[0] };
    let diam = 0; for (let a = 0; a < members.length; a++) for (let b = a + 1; b < members.length; b++) diam = Math.max(diam, D[members[a]][members[b]]);
    let A, B;
    if (members.length === 2) { A = [members[0]]; B = [members[1]]; }
    else {
      let best = -1, s = members[0]; members.forEach(i => { const m = mean(i, members); if (m > best) { best = m; s = i; } });
      B = [s]; A = members.filter(m => m !== s);
      while (A.length > 1) {
        let bd = -Infinity, bi = -1;
        A.forEach(i => { const diff = mean(i, A) - mean(i, B); if (diff > bd) { bd = diff; bi = i; } });
        if (bd > 0) { B.push(bi); A = A.filter(x => x !== bi); } else break;
      }
    }
    const l = split(A), r = split(B);
    nodes.push({ members, height: diam, left: l, right: r, size: members.length });
    return { node: nodes.length - 1 };
  }
  split(Array.from({ length: n }, (_, i) => i));
  const sorted = nodes.map((_, i) => i).sort((a, b) => nodes[a].height - nodes[b].height || nodes[a].size - nodes[b].size);
  const stepOf = new Array(nodes.length); sorted.forEach((ni, s) => stepOf[ni] = s);
  const idOf = ref => ref.leaf != null ? -(ref.leaf + 1) : stepOf[ref.node] + 1;
  const merge = sorted.map(ni => { const nd = nodes[ni]; const a = idOf(nd.left), b = idOf(nd.right); return (a < 0 && b > 0) || (a < 0 && b < 0 && a > b) || (a > 0 && b > 0 && a > b) ? [b, a] : [a, b]; });
  const hc = { n, merge, height: sorted.map(ni => nodes[ni].height), method: 'diana' };
  hc.order = HC.leafOrder(hc);
  return hc;
};

HC.leafOrder = hc => {
  const out = [];
  const walk = v => { if (v < 0) out.push(-v - 1); else { const m = hc.merge[v - 1]; walk(m[0]); walk(m[1]); } };
  if (hc.n === 1) return [0];
  walk(hc.n - 1);
  return out;
};

HC.members = hc => {
  const mem = [];
  for (let s = 0; s < hc.n - 1; s++) {
    const m = hc.merge[s], get = v => v < 0 ? [-v - 1] : mem[v - 1];
    mem.push(get(m[0]).concat(get(m[1])));
  }
  return mem;
};

HC.cutree = (hc, k) => {
  const n = hc.n; k = Math.max(1, Math.min(k, n));
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = i => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  const mem = HC.members(hc);
  for (let s = 0; s < n - k; s++) {
    const ms = mem[s]; const r = find(ms[0]);
    for (let t = 1; t < ms.length; t++) parent[find(ms[t])] = r;
  }
  const map = new Map(); const out = new Array(n);
  for (let i = 0; i < n; i++) { const r = find(i); if (!map.has(r)) map.set(r, map.size + 1); out[i] = map.get(r); }
  return out;
};

/* Unit layout: leaves at x = position in hc.order (0..n-1), nodes at (mean x of children, height) */
HC.layout = (hc, order) => {
  const n = hc.n, leafX = new Array(n);
  (order || hc.order).forEach((obs, i) => leafX[obs] = i);
  const nodes = [], mem = HC.members(hc);
  const xOf = v => v < 0 ? leafX[-v - 1] : nodes[v - 1].x;
  for (let s = 0; s < n - 1; s++) {
    const m = hc.merge[s];
    nodes.push({ x: (xOf(m[0]) + xOf(m[1])) / 2, y: hc.height[s], l: m[0], r: m[1], members: mem[s] });
  }
  return { leafX, nodes };
};

HC.cophenetic = hc => {
  const n = hc.n, C = Array.from({ length: n }, () => new Array(n).fill(0));
  const mem = HC.members(hc);
  for (let s = 0; s < n - 1; s++) {
    const m = hc.merge[s], get = v => v < 0 ? [-v - 1] : mem[v - 1];
    const A = get(m[0]), B = get(m[1]);
    for (const a of A) for (const b of B) C[a][b] = C[b][a] = hc.height[s];
  }
  return C;
};

HC.copheneticCor = (D, hc) => {
  const C = HC.cophenetic(hc), n = D.length, x = [], y = [];
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) { x.push(D[i][j]); y.push(C[i][j]); }
  const mx = x.reduce((a, b) => a + b, 0) / x.length, my = y.reduce((a, b) => a + b, 0) / y.length;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < x.length; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; syy += (y[i] - my) ** 2; }
  return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : NaN;
};

/* ---------------- k-means ---------------- */
const KM = {};
KM.sqd = (a, b) => { let s = 0; for (let t = 0; t < a.length; t++) s += (a[t] - b[t]) ** 2; return s; };

KM.init = (P, k, r, method) => {
  r = r || Math.random;
  if (method === 'random') { const idx = P.map((_, i) => i); for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; } return idx.slice(0, k).map(i => P[i].slice()); }
  /* k-means++ */
  const C = [P[Math.floor(r() * P.length)].slice()];
  while (C.length < k) {
    const d2 = P.map(p => Math.min(...C.map(c => KM.sqd(p, c))));
    const tot = d2.reduce((a, b) => a + b, 0);
    let u = r() * tot, pick = 0;
    for (let i = 0; i < P.length; i++) { u -= d2[i]; if (u <= 0) { pick = i; break; } pick = i; }
    C.push(P[pick].slice());
  }
  return C;
};
KM.assign = (P, C) => {
  const cluster = new Array(P.length); let wss = 0;
  for (let i = 0; i < P.length; i++) {
    let best = Infinity, bj = 0;
    for (let j = 0; j < C.length; j++) { const d = KM.sqd(P[i], C[j]); if (d < best) { best = d; bj = j; } }
    cluster[i] = bj; wss += best;
  }
  return { cluster, wss };
};
KM.update = (P, cluster, C) => {
  const k = C.length, dim = P[0].length;
  const sum = Array.from({ length: k }, () => new Array(dim).fill(0)), cnt = new Array(k).fill(0);
  P.forEach((p, i) => { const c = cluster[i]; cnt[c]++; for (let t = 0; t < dim; t++) sum[c][t] += p[t]; });
  return C.map((c, j) => cnt[j] ? sum[j].map(v => v / cnt[j]) : c.slice());
};
KM.run = (P, k, o) => {
  o = o || {};
  const r = o.rng || Math.random, maxIter = o.maxIter || 100, nstart = o.nstart || 1;
  let best = null;
  for (let s = 0; s < nstart; s++) {
    let C = KM.init(P, k, r, o.init), res = KM.assign(P, C), iter = 0;
    for (; iter < maxIter; iter++) {
      const C2 = KM.update(P, res.cluster, C), res2 = KM.assign(P, C2);
      const moved = res2.cluster.some((c, i) => c !== res.cluster[i]);
      C = C2; res = res2; if (!moved) break;
    }
    if (!best || res.wss < best.wss) best = { cluster: res.cluster, centers: C, wss: res.wss, iter: iter + 1 };
  }
  return best;
};
/* total sum of squares and per-cluster silhouette (Euclidean) — used by the playground */
KM.tss = P => { const m = P[0].map((_, t) => P.reduce((a, p) => a + p[t], 0) / P.length); return P.reduce((a, p) => a + KM.sqd(p, m), 0); };
KM.silhouette = (P, cluster) => {
  const n = P.length, k = Math.max(...cluster) + 1, s = new Array(n).fill(0);
  const D = HC.dist(P);
  for (let i = 0; i < n; i++) {
    const sums = new Array(k).fill(0), cnt = new Array(k).fill(0);
    for (let j = 0; j < n; j++) if (j !== i) { sums[cluster[j]] += D[i][j]; cnt[cluster[j]]++; }
    const own = cluster[i];
    if (cnt[own] === 0) { s[i] = 0; continue; }
    const a = sums[own] / cnt[own];
    let b = Infinity; for (let c = 0; c < k; c++) if (c !== own && cnt[c]) b = Math.min(b, sums[c] / cnt[c]);
    s[i] = isFinite(b) ? (b - a) / Math.max(a, b) : 0;
  }
  return s;
};

/* ---------------- geometry ---------------- */
const Geom = {};
Geom.hull = pts => {
  const P = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (P.length < 3) return P;
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = []; for (const p of P) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop(); lower.push(p); }
  const upper = []; for (let i = P.length - 1; i >= 0; i--) { const p = P[i]; while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop(); upper.push(p); }
  upper.pop(); lower.pop();
  return lower.concat(upper);
};
/* smooth closed path through hull vertices (Catmull–Rom → cubic Bézier), padded outwards by `pad` */
Geom.blobPath = (hull, pad) => {
  if (hull.length < 3) return '';
  pad = pad || 0;
  const cx = hull.reduce((a, p) => a + p[0], 0) / hull.length, cy = hull.reduce((a, p) => a + p[1], 0) / hull.length;
  const H = hull.map(p => { const dx = p[0] - cx, dy = p[1] - cy, l = Math.hypot(dx, dy) || 1; return [p[0] + dx / l * pad, p[1] + dy / l * pad]; });
  const n = H.length; let d = `M${H[0][0].toFixed(1)},${H[0][1].toFixed(1)}`;
  for (let i = 0; i < n; i++) {
    const p0 = H[(i - 1 + n) % n], p1 = H[i], p2 = H[(i + 1) % n], p3 = H[(i + 2) % n];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6], c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d + ' Z';
};

/* ================= Block 4 additions: tree diagnostics and comparison ================= */
/* height of the merge that first absorbs each leaf */
HC.parentHeight = hc => {
  const ph = new Array(hc.n).fill(0), mem = HC.members(hc);
  for (let s = 0; s < hc.n - 1; s++) hc.merge[s].forEach(v => { if (v < 0) ph[-v - 1] = hc.height[s]; });
  return ph;
};
/* agglomerative coefficient (agnes) / divisive coefficient (diana): mean(1 − h(i)/h_max) */
HC.coefficient = hc => { const mx = Math.max(...hc.height) || 1; return S.mean(HC.parentHeight(hc).map(h => 1 - h / mx)); };
HC.cutHeight = (hc, h) => HC.cutree(hc, 1 + hc.height.filter(v => v > h).length);
HC.reversals = hc => { let r = 0; for (let s = 0; s < hc.n - 1; s++) hc.merge[s].forEach(v => { if (v > 0 && hc.height[v - 1] > hc.height[s] + 1e-12) r++; }); return r; };
/* candidate k from the largest jumps between successive merge heights */
HC.suggestK = (hc, maxK) => {
  const n = hc.n, h = hc.height.slice().sort((a, b) => a - b), mx = h[n - 2] || 1, out = [];
  for (let k = 2; k <= Math.min(maxK || 12, n - 1); k++) { const gap = h[n - k] - h[n - k - 1]; out.push({ k, gap, rel: gap / mx, height: (h[n - k] + h[n - k - 1]) / 2 }); }
  return out.sort((a, b) => b.gap - a.gap);
};
/* rotate the children of every node so that the subtree with the smaller mean weight comes first */
HC.reorder = (hc, weights) => {
  const mem = HC.members(hc), out = [];
  const wmean = v => v < 0 ? weights[-v - 1] : S.mean(mem[v - 1].map(i => weights[i]));
  const walk = v => { if (v < 0) { out.push(-v - 1); return; } let [a, b] = hc.merge[v - 1]; if (wmean(a) > wmean(b)) [a, b] = [b, a]; walk(a); walk(b); };
  if (hc.n === 1) return [0];
  walk(hc.n - 1);
  return out;
};
/* step at which every pair of leaves first shares a cluster (for Baker's gamma) */
HC.mergeLevel = hc => {
  const n = hc.n, M = Array.from({ length: n }, () => new Array(n).fill(0)), mem = HC.members(hc);
  for (let s = 0; s < n - 1; s++) { const m = hc.merge[s], get = v => v < 0 ? [-v - 1] : mem[v - 1]; const A = get(m[0]), B = get(m[1]); for (const a of A) for (const b of B) M[a][b] = M[b][a] = s + 1; }
  return M;
};
HC.upper = M => { const v = []; for (let i = 0; i < M.length; i++) for (let j = i + 1; j < M.length; j++) v.push(M[i][j]); return v; };
HC.bakerGamma = (h1, h2) => S.spearman(HC.upper(HC.mergeLevel(h1)), HC.upper(HC.mergeLevel(h2)));
HC.copheneticBetween = (h1, h2) => S.pearson(HC.upper(HC.cophenetic(h1)), HC.upper(HC.cophenetic(h2)));
HC.contingency = (a, b) => {
  const la = [...new Set(a)], lb = [...new Set(b)], M = la.map(() => lb.map(() => 0));
  a.forEach((x, i) => M[la.indexOf(x)][lb.indexOf(b[i])]++);
  return { la, lb, M };
};
HC.ari = (a, b) => {
  const { M } = HC.contingency(a, b), n = a.length, c2 = x => x * (x - 1) / 2;
  const sumIJ = M.flat().reduce((s, v) => s + c2(v), 0);
  const sumI = M.map(r => c2(r.reduce((s, v) => s + v, 0))).reduce((s, v) => s + v, 0);
  const sumJ = M[0].map((_, j) => c2(M.reduce((s, r) => s + r[j], 0))).reduce((s, v) => s + v, 0);
  const exp = sumI * sumJ / c2(n), mx = (sumI + sumJ) / 2;
  return mx - exp === 0 ? 1 : (sumIJ - exp) / (mx - exp);
};
HC.fowlkesMallows = (h1, h2, k) => {
  const { M } = HC.contingency(HC.cutree(h1, k), HC.cutree(h2, k)), n = h1.n;
  const T = M.flat().reduce((s, v) => s + v * v, 0) - n;
  const P = M.map(r => r.reduce((s, v) => s + v, 0) ** 2).reduce((s, v) => s + v, 0) - n;
  const Q = M[0].map((_, j) => M.reduce((s, r) => s + r[j], 0) ** 2).reduce((s, v) => s + v, 0) - n;
  return P > 0 && Q > 0 ? T / Math.sqrt(P * Q) : 0;
};
/* tanglegram: rotate both trees to reduce the entanglement of their leaf orders */
HC.positions = order => { const p = new Array(order.length); order.forEach((obs, i) => p[obs] = i); return p; };
HC.entanglement = (o1, o2, L) => {
  L = L || 1.5; const n = o1.length, p1 = HC.positions(o1), p2 = HC.positions(o2);
  let s = 0, worst = 0; for (let i = 0; i < n; i++) { s += Math.pow(Math.abs(p1[i] - p2[i]), L); worst += Math.pow(Math.abs(i - (n - 1 - i)), L); }
  return worst ? s / worst : 0;
};
HC.crossings = (o1, o2) => { const p1 = HC.positions(o1), p2 = HC.positions(o2); let c = 0; for (let i = 0; i < o1.length; i++) for (let j = i + 1; j < o1.length; j++) if ((p1[i] - p1[j]) * (p2[i] - p2[j]) < 0) c++; return c; };
HC.untangle = (h1, h2) => {
  let o1 = h1.order, o2 = h2.order, best = { o1, o2, ent: HC.entanglement(o1, o2) };
  const tryPair = (a, b) => { const e = HC.entanglement(a, b); if (e < best.ent) best = { o1: a, o2: b, ent: e }; };
  for (let it = 0; it < 4; it++) {
    o2 = HC.reorder(h2, HC.positions(o1)); tryPair(o1, o2);
    o1 = HC.reorder(h1, HC.positions(o2)); tryPair(o1, o2);
  }
  tryPair(best.o1, best.o2.slice().reverse());
  return { order1: best.o1, order2: best.o2, entanglement: best.ent, crossings: HC.crossings(best.o1, best.o2) };
};

Object.assign(window, { HC, KM, Geom });
