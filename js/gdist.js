/* PopGeneticsPro — Block 6 engine: genetic distances, ordination, trees and
   isolation by distance.

   Population distances (from allele frequencies):
     Nei (1972) standard D and identity I; Nei (1978) unbiased D;
     Cavalli-Sforza & Edwards (1967) chord distance; Reynolds, Weir & Cockerham
     (1983) coancestry distance; Rogers (1972); Prevosti et al. (1975).
     Dominant data: the two states of a band are treated as the alleles of a
     haploid locus for the binary Nei distance.
   Individual distances:
     Smouse & Peakall (1999) codominant genotypic distance; Bowcock et al.
     (1994) proportion of shared alleles; Jaccard, Dice (Nei & Li 1979), simple
     matching and squared Euclidean for bands; p-distance for haplotypes and
     sequences; Gower (1971) for traits.
   Ordination: principal coordinates (Gower 1966), Lingoes (1971) correction.
   Trees: UPGMA (Sokal & Michener 1958, via HC) and neighbour-joining (Saitou &
     Nei 1987); support by bootstrap over loci (Felsenstein 1985).
   Isolation by distance: Mantel (1967) test; Rousset's (1997) regression of
     F_ST/(1 − F_ST) on ln(distance); great-circle distances by the haversine
     formula. */

(function () {

  /* ================================================================
     1 · ALLELE FREQUENCY TABLES
     ================================================================ */
  /* freq[p][l] = {f: Map allele→frequency, n: individuals scored, genes} */
  function freqTables(d, loci, popsIdx) {
    return popsIdx.map(pi => loci.map(l => {
      const m = new Map(); let n = 0, genes = 0;
      d.pops[pi].idx.forEach(i => {
        const g = d.geno[i][l]; if (!g) return;
        n++;
        g.forEach(a => { const k = String(a); m.set(k, (m.get(k) || 0) + 1); genes++; });
      });
      const f = new Map(); m.forEach((v, k) => f.set(k, v / genes));
      return { f, n, genes };
    }));
  }

  /* ================================================================
     2 · POPULATION DISTANCES
     ================================================================ */
  const POP_METHODS = {
    nei72: 'Nei (1972) standard genetic distance',
    nei78: 'Nei (1978) unbiased genetic distance',
    cavalli: 'Cavalli-Sforza & Edwards (1967) chord distance',
    reynolds: 'Reynolds, Weir & Cockerham (1983) coancestry distance',
    rogers: 'Rogers (1972) distance',
    prevosti: 'Prevosti (1975) distance',
  };
  /* for aligned sequences: divergence from the differences between sequences,
     not from haplotype identity (Nei & Li 1979) */
  const SEQ_POP_METHODS = {
    da: 'net nucleotide divergence D_A (Nei & Li 1979)',
    dxy: 'mean nucleotide divergence d_XY (Nei & Li 1979)',
  };

  function popDistance(freq, method, ploidy) {
    const P = freq.length, L = freq[0].length;
    const D = Array.from({ length: P }, () => new Array(P).fill(0));
    const I = Array.from({ length: P }, () => new Array(P).fill(1));
    for (let x = 0; x < P; x++) for (let y = x + 1; y < P; y++) {
      let Jx = 0, Jy = 0, Jxy = 0, used = 0, chord = 0, rogers = 0, prev = 0, reyNum = 0, reyDen = 0;
      for (let l = 0; l < L; l++) {
        const a = freq[x][l], b = freq[y][l];
        if (!a.n || !b.n) continue;
        used++;
        const alleles = new Set([...a.f.keys(), ...b.f.keys()]);
        let sx = 0, sy = 0, sxy = 0, ssq = 0, sabs = 0, sroot = 0;
        alleles.forEach(k => {
          const px = a.f.get(k) || 0, py = b.f.get(k) || 0;
          sx += px * px; sy += py * py; sxy += px * py;
          ssq += (px - py) * (px - py); sabs += Math.abs(px - py); sroot += Math.sqrt(px * py);
        });
        if (method === 'nei78') {
          /* unbiased J: (2n Σp² − 1)/(2n − 1) for diploids, (n Σp² − 1)/(n − 1) for haploids */
          const gx = a.genes, gy = b.genes;
          sx = gx > 1 ? (gx * sx - 1) / (gx - 1) : sx;
          sy = gy > 1 ? (gy * sy - 1) / (gy - 1) : sy;
        }
        Jx += sx; Jy += sy; Jxy += sxy;
        chord += Math.sqrt(Math.max(0, 2 * (1 - sroot)));
        rogers += Math.sqrt(Math.max(0, ssq / 2));
        prev += sabs / 2;
        reyNum += ssq; reyDen += 1 - sxy;
      }
      let dist = null, ident = null;
      if (used) {
        Jx /= used; Jy /= used; Jxy /= used;
        ident = Jx > 0 && Jy > 0 ? Jxy / Math.sqrt(Jx * Jy) : null;
        if (method === 'nei72' || method === 'nei78') dist = ident != null && ident > 0 ? -Math.log(Math.min(1, ident)) : (ident === 0 ? Infinity : null);
        else if (method === 'cavalli') dist = (2 / Math.PI) * chord / used;
        else if (method === 'reynolds') dist = reyDen > 0 ? Math.sqrt(Math.max(0, reyNum / (2 * reyDen))) : 0;
        else if (method === 'rogers') dist = rogers / used;
        else if (method === 'prevosti') dist = prev / used;
      }
      D[x][y] = D[y][x] = dist == null ? NaN : dist;
      I[x][y] = I[y][x] = ident == null ? NaN : ident;
    }
    return { D, I };
  }

  /* ================================================================
     3 · INDIVIDUAL DISTANCES
     ================================================================ */
  const IND_METHODS = {
    codominant: { smouse: 'Smouse & Peakall (1999) genotypic distance', dps: 'shared-allele distance (Bowcock et al. 1994)' },
    dominant: { jaccard: 'Jaccard distance', dice: 'Dice distance (Nei & Li 1979)', simple: 'simple matching distance', euclid: 'squared Euclidean distance (band differences)' },
    haploid: { pdist: 'proportion of differing loci' },
    sequence: { pdist: 'p-distance (proportion of differing sites)' },
    morph: { gower: 'Gower (1971) distance' },
  };
  /* coefficients that are already squared Euclidean distances: the PCoA uses
     them as they are instead of squaring them a second time */
  const SQUARED = new Set(['smouse', 'euclid']);

  function indDistance(d, idx, method, loci) {
    const n = idx.length;
    const D = Array.from({ length: n }, () => new Array(n).fill(0));
    if (d.kind === 'morph') return gowerDistance(d, idx);
    if (d.kind === 'sequence' && d.seqs) return seqDistance(d, idx);
    const L = loci.length;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      let s = 0, used = 0, a11 = 0, b01 = 0, c10 = 0, d00 = 0;
      for (const l of loci) {
        const gi = d.geno[idx[i]][l], gj = d.geno[idx[j]][l];
        if (!gi || !gj) continue;
        used++;
        if (d.kind === 'codominant') {
          const A = gi.map(String), B = gj.map(String);
          if (method === 'dps') {
            /* shared alleles counted with multiplicity: min over allele counts */
            const ca = {}, cb = {}; A.forEach(x => ca[x] = (ca[x] || 0) + 1); B.forEach(x => cb[x] = (cb[x] || 0) + 1);
            let shared = 0; Object.keys(ca).forEach(k => { shared += Math.min(ca[k], cb[k] || 0); });
            s += 1 - shared / A.length;
          } else {
            /* Smouse & Peakall squared distance for diploids */
            const same = (A[0] === B[0] && A[1] === B[1]) || (A[0] === B[1] && A[1] === B[0]);
            if (same) continue;
            const hi = A[0] !== A[1], hj = B[0] !== B[1];
            const shared = new Set(A.filter(x => B.includes(x))).size;
            if (!hi && !hj) s += 4;                          // ii vs jj
            else if (hi && hj) s += shared ? 1 : 2;          // ij vs ik → 1 ; ij vs kl → 2
            else s += shared ? 1 : 3;                        // ii vs ij → 1 ; ii vs jk → 3
          }
        } else if (d.kind === 'dominant') {
          const x = String(gi[0]) === '1', y = String(gj[0]) === '1';
          if (x && y) a11++; else if (x || y) { if (x) c10++; else b01++; } else d00++;
        } else {
          if (String(gi[0]) !== String(gj[0])) s += 1;
        }
      }
      let dist;
      if (!used) dist = NaN;
      else if (d.kind === 'codominant') dist = method === 'dps' ? s / used : s * (L / used);
      else if (d.kind === 'dominant') {
        const bc = b01 + c10;
        dist = method === 'jaccard' ? (a11 + bc ? bc / (a11 + bc) : 0)
          : method === 'dice' ? (2 * a11 + bc ? bc / (2 * a11 + bc) : 0)
            : method === 'simple' ? bc / used
              : bc * (L / used);
      } else dist = s / used;
      D[i][j] = D[j][i] = dist;
    }
    return D;
  }

  function gowerDistance(d, idx) {
    const vars = d.traits.vars, V = d.traits.values;
    const n = idx.length;
    const range = vars.map((v, j) => {
      if (v.kind !== 'quantitative' && v.kind !== 'discrete') return null;
      const vals = V.map(r => r[j]).filter(x => x != null && isFinite(x));
      return Math.max(...vals) - Math.min(...vals) || 1;
    });
    const D = Array.from({ length: n }, () => new Array(n).fill(0));
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      let s = 0, w = 0;
      vars.forEach((v, k) => {
        const a = V[idx[i]][k], b = V[idx[j]][k];
        if (a == null || b == null) return;
        w++;
        if (range[k] != null) s += Math.abs(a - b) / range[k];
        else s += String(a) === String(b) ? 0 : 1;
      });
      D[i][j] = D[j][i] = w ? s / w : NaN;
    }
    return D;
  }

  function seqDistance(d, idx) {
    return seqDistanceW(seqSites(d, idx), null);
  }

  /* The sites of an alignment reduced to what a p-distance needs: the columns
     where some pair can differ or lose a comparison (variable sites, gaps,
     ambiguities) are kept base by base; the clean invariant columns only add
     to every comparison. A bootstrap over sites then only reweights columns. */
  function seqSites(d, idx) {
    const aln = d.seqs.aln, n = idx.length;
    const L = Math.min(...idx.map(i => aln[i].length));
    const code = { A: 1, C: 2, G: 3, T: 4 };
    const special = [], clean = [];
    for (let s = 0; s < L; s++) {
      let first = 0, keep = false;
      for (let k = 0; k < n; k++) {
        const c = code[aln[idx[k]][s]] || 0;
        if (!c) { keep = true; break; }
        if (!first) first = c; else if (c !== first) { keep = true; break; }
      }
      (keep ? special : clean).push(s);
    }
    const codes = idx.map(i => Uint8Array.from(special, s => code[aln[i][s]] || 0));
    return { n, L, special, clean, codes };
  }
  /* p-distances with site weights w (null = every site once) */
  function seqDistanceW(S, w) {
    const { n, special, clean, codes } = S;
    let wClean = 0;
    if (w) clean.forEach(s => { wClean += w[s]; }); else wClean = clean.length;
    const ws = w ? Float64Array.from(special, s => w[s]) : null;
    const D = Array.from({ length: n }, () => new Array(n).fill(0));
    for (let i = 0; i < n; i++) {
      const a = codes[i];
      for (let j = i + 1; j < n; j++) {
        const b = codes[j];
        let diff = 0, comp = wClean;
        for (let k = 0; k < a.length; k++) {
          if (!a[k] || !b[k]) continue;
          const wk = ws ? ws[k] : 1;
          comp += wk;
          if (a[k] !== b[k]) diff += wk;
        }
        D[i][j] = D[j][i] = comp ? diff / comp : NaN;
      }
    }
    return D;
  }
  function siteWeights(L, r) {
    const w = new Float64Array(L);
    for (let k = 0; k < L; k++) w[Math.floor(r() * L)]++;
    return w;
  }

  /* d_XY and D_A between populations from a matrix of sequence distances;
     groups = index lists into that matrix */
  function seqPopDistance(D, groups, method) {
    const P = groups.length;
    const within = groups.map(g => {
      if (g.length < 2) return 0;
      let s = 0, c = 0;
      for (let a = 0; a < g.length; a++) for (let b = a + 1; b < g.length; b++) if (isFinite(D[g[a]][g[b]])) { s += D[g[a]][g[b]]; c++; }
      return c ? s / c : 0;
    });
    const M = Array.from({ length: P }, () => new Array(P).fill(0));
    for (let x = 0; x < P; x++) for (let y = x + 1; y < P; y++) {
      let s = 0, c = 0;
      groups[x].forEach(i => groups[y].forEach(j => { if (isFinite(D[i][j])) { s += D[i][j]; c++; } }));
      const dxy = c ? s / c : NaN;
      /* D_A below zero is sampling noise around no net divergence, and is read as zero */
      M[x][y] = M[y][x] = method === 'dxy' ? dxy : Math.max(0, dxy - (within[x] + within[y]) / 2);
    }
    return { D: M, within };
  }

  /* ================================================================
     4 · PRINCIPAL COORDINATES
     ================================================================ */
  /* symmetric Jacobi eigen-decomposition — fine for a few hundred objects */
  function eigenSym(A) {
    const n = A.length;
    const a = A.map(r => r.slice());
    const v = Array.from({ length: n }, (_, i) => { const r = new Array(n).fill(0); r[i] = 1; return r; });
    for (let sweep = 0; sweep < 100; sweep++) {
      let off = 0;
      for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) off += a[p][q] * a[p][q];
      if (off < 1e-20) break;
      for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) {
        if (Math.abs(a[p][q]) < 1e-300) continue;
        const theta = (a[q][q] - a[p][p]) / (2 * a[p][q]);
        const t = (theta >= 0 ? 1 : -1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1), s = t * c;
        for (let k = 0; k < n; k++) {
          const akp = a[k][p], akq = a[k][q];
          a[k][p] = c * akp - s * akq; a[k][q] = s * akp + c * akq;
        }
        for (let k = 0; k < n; k++) {
          const apk = a[p][k], aqk = a[q][k];
          a[p][k] = c * apk - s * aqk; a[q][k] = s * apk + c * aqk;
        }
        for (let k = 0; k < n; k++) {
          const vkp = v[k][p], vkq = v[k][q];
          v[k][p] = c * vkp - s * vkq; v[k][q] = s * vkp + c * vkq;
        }
      }
    }
    const idx = Array.from({ length: n }, (_, i) => i).sort((i, j) => a[j][j] - a[i][i]);
    return { values: idx.map(i => a[i][i]), vectors: idx.map(i => v.map(r => r[i])) };   // vectors[k] = k-th eigenvector
  }

  function pcoa(D, opts) {
    opts = opts || {};
    const n = D.length;
    let D2 = D.map(r => r.map(v => (isFinite(v) ? (opts.squared ? v : v * v) : 0)));
    const run = (Dsq) => {
      const A = Dsq.map(r => r.map(v => -0.5 * v));
      const rowM = A.map(r => r.reduce((s, v) => s + v, 0) / n);
      const colM = rowM;                         // symmetric
      const gM = rowM.reduce((s, v) => s + v, 0) / n;
      const B = A.map((r, i) => r.map((v, j) => v - rowM[i] - colM[j] + gM));
      return eigenSym(B);
    };
    let E = run(D2), lingoes = 0;
    const minEig = Math.min(...E.values);
    if (opts.lingoes && minEig < -1e-9) {
      lingoes = -minEig;
      D2 = D2.map((r, i) => r.map((v, j) => (i === j ? 0 : v + 2 * lingoes)));
      E = run(D2);
    }
    const pos = E.values.filter(v => v > 1e-10);
    const sumPos = pos.reduce((s, v) => s + v, 0);
    const sumAbs = E.values.reduce((s, v) => s + Math.abs(v), 0);
    const nAxes = Math.min(pos.length, opts.axes || 10);
    const scores = Array.from({ length: n }, () => new Array(nAxes).fill(0));
    for (let k = 0; k < nAxes; k++) {
      const lam = Math.sqrt(E.values[k]);
      for (let i = 0; i < n; i++) scores[i][k] = E.vectors[k][i] * lam;
    }
    return {
      values: E.values, scores, nAxes,
      pctPos: E.values.slice(0, nAxes).map(v => v / sumPos),
      pctAbs: E.values.slice(0, nAxes).map(v => v / sumAbs),
      negative: E.values.filter(v => v < -1e-9).length, minEig, lingoes, sumPos,
    };
  }

  /* ================================================================
     5 · TREES
     ================================================================ */
  /* neighbour-joining → unrooted tree as nodes {id, children:[{node,len}], tip?} */
  function neighborJoining(D0, labels) {
    const n = D0.length;
    if (n < 3) return null;
    let nodes = labels.map((lab, i) => ({ id: i, tip: i, label: lab, children: [] }));
    let active = nodes.map((_, i) => i);
    const D = D0.map(r => r.map(v => (isFinite(v) ? v : 0)));
    let nextId = n;
    const dist = new Map();   // key "i:j" for internal nodes
    const get = (a, b) => (a < n && b < n) ? D[a][b] : (dist.get(a + ':' + b) ?? dist.get(b + ':' + a) ?? 0);
    while (active.length > 2) {
      const m = active.length;
      const r = new Map();
      active.forEach(i => { let s = 0; active.forEach(j => { if (j !== i) s += get(i, j); }); r.set(i, s); });
      let best = Infinity, bi = -1, bj = -1;
      for (let x = 0; x < m; x++) for (let y = x + 1; y < m; y++) {
        const i = active[x], j = active[y];
        const q = (m - 2) * get(i, j) - r.get(i) - r.get(j);
        if (q < best) { best = q; bi = i; bj = j; }
      }
      const dij = get(bi, bj);
      let li = dij / 2 + (r.get(bi) - r.get(bj)) / (2 * (m - 2));
      let lj = dij - li;
      /* negative branch lengths are set to zero and the difference moved to the sister (Kuhner & Felsenstein 1994) */
      if (li < 0) { lj += li; li = 0; } if (lj < 0) { li += lj; lj = 0; }
      const u = { id: nextId++, children: [{ node: nodes[bi], len: li }, { node: nodes[bj], len: lj }] };
      nodes[u.id] = u;
      active.forEach(k => { if (k !== bi && k !== bj) dist.set(u.id + ':' + k, (get(bi, k) + get(bj, k) - dij) / 2); });
      active = active.filter(k => k !== bi && k !== bj); active.push(u.id);
    }
    /* join the last two: root the unrooted tree on that final edge */
    const [a, b] = active;
    const len = get(a, b);
    return { id: nextId, children: [{ node: nodes[a], len: len / 2 }, { node: nodes[b], len: len / 2 }], unrooted: true };
  }

  /* hclust result (UPGMA) → rooted node tree with branch lengths = height differences */
  function hcToTree(hc, labels) {
    const n = hc.n;
    const build = (v) => {
      if (v < 0) return { tip: -v - 1, label: labels[-v - 1], children: [], height: 0 };
      const m = hc.merge[v - 1], h = hc.height[v - 1];
      const l = build(m[0]), r = build(m[1]);
      return { children: [{ node: l, len: (h - l.height) / 2 }, { node: r, len: (h - r.height) / 2 }], height: h / 2 * 2 };
    };
    const t = build(n - 1);
    /* UPGMA: node height is half the merge height (ultrametric distance from tips) */
    const fix = (node) => { node.children.forEach(c => { c.len = (node.height - c.node.height) / 2; fix(c.node); }); };
    const root = t; fix(root);
    return root;
  }

  /* splits of a tree: for each internal edge, the set of tips below it (canonical: side without tip 0) */
  function splitsOf(tree, nTips) {
    const out = new Set();
    const tipsBelow = node => {
      if (node.tip != null) return [node.tip];
      const s = []; node.children.forEach(c => s.push(...tipsBelow(c.node))); return s;
    };
    const walk = (node) => {
      node.children.forEach(c => {
        const below = tipsBelow(c.node);
        if (below.length >= 2 && below.length <= nTips - 2) {
          const set = below.includes(0) ? Array.from({ length: nTips }, (_, i) => i).filter(i => !below.includes(i)) : below;
          out.add(set.slice().sort((a, b) => a - b).join(','));
        }
        walk(c.node);
      });
    };
    walk(tree);
    return out;
  }
  /* annotate each internal node of `tree` with support = frequency of its split among bootstrap trees */
  function annotateSupport(tree, boots, nTips) {
    const total = boots.length;
    const tipsBelow = node => { if (node.tip != null) return [node.tip]; const s = []; node.children.forEach(c => s.push(...tipsBelow(c.node))); return s; };
    const walk = node => {
      node.children.forEach(c => {
        /* a branch of length zero joins units that do not differ (identical haplotypes,
           tied distances): the order in which they are joined is arbitrary but repeats in
           every replicate, so its "support" would be an artefact and is not reported */
        if (c.node.tip == null && !(c.len > 1e-12)) { delete c.node.support; delete c.node.splitKey; }
        else if (c.node.tip == null) {
          const below = tipsBelow(c.node);
          if (below.length >= 2 && below.length <= nTips - 2) {
            const set = below.includes(0) ? Array.from({ length: nTips }, (_, i) => i).filter(i => !below.includes(i)) : below;
            const key = set.slice().sort((a, b) => a - b).join(',');
            let cnt = 0; boots.forEach(s => { if (s.has(key)) cnt++; });
            c.node.support = total ? cnt / total : null;
            /* the two sides of the root of a drawn tree are one and the same split */
            c.node.splitKey = key;
          }
        }
        walk(c.node);
      });
    };
    walk(tree);
  }

  /* ================================================================
     6 · GEOGRAPHY, MANTEL, IBD
     ================================================================ */
  function haversine(lat1, lon1, lat2, lon2) {
    const R = 6371.0088, toR = Math.PI / 180;
    const dLat = (lat2 - lat1) * toR, dLon = (lon2 - lon1) * toR;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * toR) * Math.cos(lat2 * toR) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
  }
  function geoMatrix(coords) {
    /* coords: [{lat, lon}] with lat/lon possibly projected x/y (then Euclidean) */
    const n = coords.length;
    const geo = coords.every(c => Math.abs(c.lat) <= 90 && Math.abs(c.lon) <= 180);
    const D = Array.from({ length: n }, () => new Array(n).fill(0));
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      D[i][j] = D[j][i] = geo ? haversine(coords[i].lat, coords[i].lon, coords[j].lat, coords[j].lon)
        : Math.sqrt((coords[i].lat - coords[j].lat) ** 2 + (coords[i].lon - coords[j].lon) ** 2);
    }
    return { D, unit: geo ? 'km' : 'map units' };
  }
  const lower = M => { const v = []; for (let i = 0; i < M.length; i++) for (let j = i + 1; j < M.length; j++) v.push(M[i][j]); return v; };
  function pearson(x, y) {
    const n = x.length; let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0, m = 0;
    for (let i = 0; i < n; i++) { if (!isFinite(x[i]) || !isFinite(y[i])) continue; m++; sx += x[i]; sy += y[i]; sxx += x[i] * x[i]; syy += y[i] * y[i]; sxy += x[i] * y[i]; }
    const vx = sxx - sx * sx / m, vy = syy - sy * sy / m;
    return vx > 0 && vy > 0 ? (sxy - sx * sy / m) / Math.sqrt(vx * vy) : NaN;
  }
  function mantel(A, B, perms, r) {
    const n = A.length;
    const a = lower(A), b = lower(B);
    const obs = pearson(a, b);
    let ge = 0;
    const perm = Array.from({ length: n }, (_, i) => i);
    for (let k = 0; k < perms; k++) {
      shuffle(perm, r);
      const bp = [];
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) bp.push(B[perm[i]][perm[j]]);
      const rr = pearson(a, bp);
      if (rr >= obs - 1e-12) ge++;
    }
    return { r: obs, p: perms ? (ge + 1) / (perms + 1) : null, perms, n };
  }
  function regression(x, y) {
    const pts = x.map((v, i) => [v, y[i]]).filter(p => isFinite(p[0]) && isFinite(p[1]));
    const n = pts.length; if (n < 3) return null;
    const mx = pts.reduce((s, p) => s + p[0], 0) / n, my = pts.reduce((s, p) => s + p[1], 0) / n;
    let sxy = 0, sxx = 0, syy = 0;
    pts.forEach(p => { sxy += (p[0] - mx) * (p[1] - my); sxx += (p[0] - mx) ** 2; syy += (p[1] - my) ** 2; });
    const slope = sxy / sxx, intercept = my - slope * mx, r2 = sxx > 0 && syy > 0 ? sxy * sxy / (sxx * syy) : 0;
    return { slope, intercept, r2, n };
  }

  /* pairwise θ between populations without permutations (for Rousset's plot) */
  function pairwiseTheta(d, popsIdx, loci, ploidy) {
    const P = popsIdx.length;
    const T = Array.from({ length: P }, () => new Array(P).fill(0));
    for (let a = 0; a < P; a++) for (let b = a + 1; b < P; b++) {
      const lab = new Int32Array(d.nInd).fill(-1);
      d.pops[popsIdx[a]].idx.forEach(i => { lab[i] = 0; }); d.pops[popsIdx[b]].idx.forEach(i => { lab[i] = 1; });
      const t = Fst.countTables(d, lab, 2, loci);
      const s = { a: 0, b: 0, c: 0 };
      t.forEach(cells => { const w = Fst.wcLocus(cells, ploidy); if (w) { s.a += w.a; s.b += w.b; s.c += w.c; } });
      T[a][b] = T[b][a] = Fst.wcFromSums(s, ploidy).theta;
    }
    return T;
  }

  /* ================================================================
     7 · THE WHOLE ANALYSIS
     ================================================================ */
  const DEFAULTS = { popMethod: null, indMethod: null, tree: 'nj', boot: 1000, lingoes: false, mantelPerms: 999, seed: 1, popLevel: true };
  /* individual trees get bootstrap support when they are small enough to be read tip by tip */
  const MAX_BOOT_TIPS = 60;

  /* which population coefficients apply to these data, and the default */
  function popMethodsFor(d) {
    const seq = d.kind === 'sequence' && !!d.seqs;
    const list = seq ? Object.assign({}, SEQ_POP_METHODS, POP_METHODS) : Object.assign({}, POP_METHODS);
    return { list, def: seq ? 'da' : 'nei78' };
  }

  function compute(d, options) {
    const opts = Object.assign({}, DEFAULTS, options || {});
    const r = rng(opts.seed);
    const codom = d.kind === 'codominant' && d.ploidy === 2;
    const ploidy = codom ? 2 : 1;
    const loci = d.loci.map((_, l) => l);
    const hasMarkers = d.kind !== 'morph' && d.nLoci > 0;
    const isSeq = d.kind === 'sequence' && !!d.seqs;
    const PM = popMethodsFor(d);
    if (!opts.popMethod || !PM.list[opts.popMethod]) opts.popMethod = PM.def;
    const seqMethod = m => m === 'da' || m === 'dxy';
    const R = { opts, kind: d.kind, codom };

    /* --- individual-level distance (always) --- */
    const allIdx = []; d.pops.forEach(p => p.idx.forEach(i => allIdx.push(i)));
    const indMethod = opts.indMethod || Object.keys(IND_METHODS[d.kind] || IND_METHODS.haploid)[0];
    const sites = isSeq ? seqSites(d, allIdx) : null;
    R.ind = {
      method: indMethod, methodName: (IND_METHODS[d.kind] || IND_METHODS.haploid)[indMethod] || indMethod,
      squared: SQUARED.has(indMethod),
      idx: allIdx, labels: allIdx.map(i => d.ind[i].id), popOf: allIdx.map(i => d.pops.findIndex(p => p.idx.includes(i))),
      D: isSeq ? seqDistanceW(sites, null) : indDistance(d, allIdx, indMethod, loci),
    };
    if (isSeq) R.ind.sites = { length: sites.L, informative: sites.special.length };

    /* --- population-level distance (needs replicated populations and markers) --- */
    const popsIdx = d.pops.map((p, i) => i).filter(i => d.pops[i].idx.length >= 2);
    R.popLevel = hasMarkers && popsIdx.length >= 3 && !d.singletons;
    if (R.popLevel) {
      const names = popsIdx.map(i => d.pops[i].name);
      /* positions of each population's individuals in the individual matrix */
      const groups = popsIdx.map(pi => d.pops[pi].idx.map(i => allIdx.indexOf(i)));
      const freq = freqTables(d, loci, popsIdx);
      const popD = (m, Dind, fr) => seqMethod(m) ? seqPopDistance(Dind, groups, m) : popDistance(fr, m, ploidy);
      const pd = popD(opts.popMethod, R.ind.D, freq);
      R.pop = { method: opts.popMethod, methodName: PM.list[opts.popMethod], names, popsIdx, D: pd.D, I: pd.I || null, within: pd.within || null };
      /* every method at once for the comparison table */
      R.pop.all = {}; Object.keys(PM.list).forEach(m => { R.pop.all[m] = popD(m, R.ind.D, freq).D; });
      R.pop.methods = PM.list;
      /* pairs with no allele in common have an infinite Nei distance: no tree or map can be drawn from them */
      let nonFinite = 0; for (let x = 0; x < names.length; x++) for (let y = x + 1; y < names.length; y++) if (!isFinite(pd.D[x][y])) nonFinite++;
      R.pop.nonFinite = nonFinite;

      if (!nonFinite) {
        /* trees on populations */
        const nj = neighborJoining(pd.D, names);
        const hc = HC.agglomerate(pd.D, 'average');
        const upgma = hcToTree(hc, names);
        R.trees = { nj, upgma, hc, coph: HC.copheneticCor(pd.D, hc) };
        /* bootstrap: over loci, or over alignment sites for sequence divergence */
        const canBoot = seqMethod(opts.popMethod) ? isSeq : loci.length >= 2;
        if (opts.boot > 0 && canBoot) {
          const bootsNJ = [], bootsUP = [];
          for (let b = 0; b < opts.boot; b++) {
            let Db;
            if (seqMethod(opts.popMethod)) Db = seqPopDistance(seqDistanceW(sites, siteWeights(sites.L, r)), groups, opts.popMethod).D;
            else {
              const pick = []; for (let k = 0; k < loci.length; k++) pick.push(loci[Math.floor(r() * loci.length)]);
              Db = popDistance(freqTables(d, pick, popsIdx), opts.popMethod, ploidy).D;
            }
            Db = Db.map(row => row.map(v => (isFinite(v) ? v : 0)));
            const tnj = neighborJoining(Db, names); if (tnj) bootsNJ.push(splitsOf(tnj, names.length));
            bootsUP.push(splitsOf(hcToTree(HC.agglomerate(Db, 'average'), names), names.length));
          }
          if (nj) annotateSupport(nj, bootsNJ, names.length);
          annotateSupport(upgma, bootsUP, names.length);
          R.trees.boot = opts.boot;
          R.trees.bootUnit = seqMethod(opts.popMethod) ? 'sites' : (d.kind === 'dominant' ? 'bands' : 'loci');
        }
      }
    }

    /* --- individual-level trees too (UPGMA only; NJ for ≤ 150 individuals) --- */
    if (allIdx.length >= 3 && allIdx.length <= 400) {
      const Dc = R.ind.D.map(row => row.map(v => (isFinite(v) ? v : 0)));
      const hc = HC.agglomerate(Dc, 'average');
      R.indTrees = { upgma: hcToTree(hc, R.ind.labels), hc, nj: allIdx.length <= 150 ? neighborJoining(Dc, R.ind.labels) : null };
      /* support for small individual trees: landraces with one sample each, sequences of
         species or haplotypes, or any small set of individuals, by resampling loci or sites */
      const n = allIdx.length;
      const canBoot = n >= 4 && n <= MAX_BOOT_TIPS && hasMarkers && (isSeq || loci.length >= 2);
      if (opts.boot > 0 && canBoot) {
        const bootsNJ = [], bootsUP = [];
        for (let b = 0; b < opts.boot; b++) {
          let Db;
          if (isSeq) Db = seqDistanceW(sites, siteWeights(sites.L, r));
          else { const pick = []; for (let k = 0; k < loci.length; k++) pick.push(loci[Math.floor(r() * loci.length)]); Db = indDistance(d, allIdx, indMethod, pick); }
          Db = Db.map(row => row.map(v => (isFinite(v) ? v : 0)));
          if (R.indTrees.nj) { const t = neighborJoining(Db, R.ind.labels); if (t) bootsNJ.push(splitsOf(t, n)); }
          bootsUP.push(splitsOf(hcToTree(HC.agglomerate(Db, 'average'), R.ind.labels), n));
        }
        if (R.indTrees.nj) annotateSupport(R.indTrees.nj, bootsNJ, n);
        annotateSupport(R.indTrees.upgma, bootsUP, n);
        R.indTrees.boot = opts.boot;
        R.indTrees.bootUnit = isSeq ? 'sites' : (d.kind === 'dominant' ? 'bands' : 'loci');
      }
      R.indTrees.coph = HC.copheneticCor(Dc, hc);
    }

    /* --- PCoA on individuals and on populations --- */
    R.pcoaInd = pcoa(R.ind.D, { lingoes: opts.lingoes, axes: 10, squared: R.ind.squared });
    if (R.popLevel && !R.pop.nonFinite) R.pcoaPop = pcoa(R.pop.D, { lingoes: opts.lingoes, axes: 10 });

    /* --- geography --- */
    const withCoords = allIdx.filter(i => d.ind[i].lat != null && isFinite(d.ind[i].lat) && d.ind[i].lon != null && isFinite(d.ind[i].lon));
    if (withCoords.length >= 4) {
      const pos = withCoords.map(i => allIdx.indexOf(i));
      const geo = geoMatrix(withCoords.map(i => ({ lat: d.ind[i].lat, lon: d.ind[i].lon })));
      const Dg = pos.map(a => pos.map(b => R.ind.D[a][b]));
      R.geo = { unit: geo.unit, nInd: withCoords.length };
      R.mantelInd = mantel(Dg, geo.D, opts.mantelPerms, r);
      R.mantelInd.lnGeo = mantel(Dg, geo.D.map(row => row.map(v => (v > 0 ? Math.log(v) : NaN))), opts.mantelPerms, r);
      R.geo.indPairs = { gen: lower(Dg), geo: lower(geo.D) };
      /* population level: centroids, Rousset's regression */
      if (R.popLevel && !R.pop.nonFinite) {
        const cent = popsIdx.map(pi => {
          const ids = d.pops[pi].idx.filter(i => withCoords.includes(i));
          if (!ids.length) return null;
          return { lat: ids.reduce((s, i) => s + d.ind[i].lat, 0) / ids.length, lon: ids.reduce((s, i) => s + d.ind[i].lon, 0) / ids.length, n: ids.length };
        });
        if (cent.every(c => c)) {
          const gp = geoMatrix(cent);
          const theta = pairwiseTheta(d, popsIdx, loci, ploidy);
          const lin = theta.map(row => row.map(v => (v != null && v < 1 ? v / (1 - v) : NaN)));
          const x = lower(gp.D).map(v => (v > 0 ? Math.log(v) : NaN)), y = lower(lin);
          R.ibd = {
            geo: gp.D, theta, lin, unit: gp.unit, names: R.pop.names,
            mantel: mantel(R.pop.D, gp.D, opts.mantelPerms, r),
            mantelLin: mantel(lin.map(row => row.map(v => (isFinite(v) ? v : 0))), gp.D.map(row => row.map(v => (v > 0 ? Math.log(v) : 0))), opts.mantelPerms, r),
            reg: regression(x, y), x, y,
            pairs: (() => { const out = []; for (let a = 0; a < popsIdx.length; a++) for (let b = a + 1; b < popsIdx.length; b++) out.push({ a, b, geo: gp.D[a][b], theta: theta[a][b], lin: lin[a][b] }); return out; })(),
          };
        }
      }
    }
    return R;
  }

  window.GD = { compute, popDistance, indDistance, freqTables, pcoa, eigenSym, neighborJoining, hcToTree, splitsOf, annotateSupport, mantel, regression, haversine, geoMatrix, gowerDistance, seqSites, seqDistanceW, seqPopDistance, popMethodsFor, POP_METHODS, SEQ_POP_METHODS, IND_METHODS, SQUARED, DEFAULTS };
})();
