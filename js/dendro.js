/* PopGeneticsPro — dendrogram studio and Block 4 figures (PD.*), built on the Fig engine.
   Dendro.draw() renders one tree into a Fig group in rectangular (vertical / horizontal), triangular or
   radial layout, with colouring by cluster, known group or height gradient, cut line, cluster boxes,
   collapsing, hanging leaves, labels and leaf symbols. */

const Dendro = {};
const TAU = Math.PI * 2;

/* o: { orient:'v'|'h'|'hl'|'radial', x,y,w,h | cx,cy,R,innerR, startAngle, sweep, order, maxH, cl (cluster ids 1..k or null),
        clusterColor(c), neutral, gradient (fn t→colour) | null, stroke, triangle, hang (0–1), collapse, cutH, groups, groupColor(i) } */
Dendro.draw = (g, hc, o) => {
  const n = hc.n, order = o.order || hc.order, L = HC.layout(hc, order);
  const maxH = o.maxH || (Math.max(...hc.height) || 1) * 1.04;
  const cl = o.cl || null;
  const start = o.startAngle == null ? -Math.PI / 2 : o.startAngle, sweep = o.sweep == null ? TAU : o.sweep;
  const innerR = o.innerR || 0;
  const ang = u => start + u * sweep;
  const map = (u, h) => {
    const t = Math.max(0, Math.min(1.2, h / maxH));
    if (o.orient === 'v') return [o.x + u * o.w, o.y + o.h - t * o.h];
    if (o.orient === 'h') return [o.x + o.w - t * o.w, o.y + u * o.h];
    if (o.orient === 'hl') return [o.x + t * o.w, o.y + u * o.h];
    const r = o.R - t * (o.R - innerR), a = ang(u); return [o.cx + r * Math.cos(a), o.cy + r * Math.sin(a)];
  };
  const P = p => `${p[0].toFixed(2)},${p[1].toFixed(2)}`;
  const across = (u1, u2, h) => {
    if (o.orient !== 'radial') return ` L${P(map(u2, h))}`;
    const t = Math.max(0, Math.min(1.2, h / maxH)), r = o.R - t * (o.R - innerR), a1 = ang(u1), a2 = ang(u2);
    return ` A${r.toFixed(2)} ${r.toFixed(2)} 0 ${Math.abs(a2 - a1) > Math.PI ? 1 : 0} ${a2 > a1 ? 1 : 0} ${P(map(u2, h))}`;
  };
  const uLeaf = i => (L.leafX[i] + 0.5) / n;
  const nodeU = s => (L.nodes[s].x + 0.5) / n;
  /* cluster of every node, top nodes of clusters (for collapsing) */
  const clusterOfNode = L.nodes.map(nd => cl && nd.members.every(m => cl[m] === cl[nd.members[0]]) ? cl[nd.members[0]] : 0);
  const parentOf = new Array(n - 1).fill(-1);
  hc.merge.forEach((m, s) => m.forEach(v => { if (v > 0) parentOf[v - 1] = s; }));
  const isTop = L.nodes.map((nd, s) => clusterOfNode[s] > 0 && (parentOf[s] < 0 || clusterOfNode[parentOf[s]] !== clusterOfNode[s]));
  const hidden = new Array(n - 1).fill(false), hiddenLeaf = new Array(n).fill(false);
  if (o.collapse && cl) L.nodes.forEach((nd, s) => { if (isTop[s]) { const stack = [hc.merge[s][0], hc.merge[s][1]]; while (stack.length) { const v = stack.pop(); if (v < 0) hiddenLeaf[-v - 1] = true; else { hidden[v - 1] = true; stack.push(hc.merge[v - 1][0], hc.merge[v - 1][1]); } } } });
  const hangH = i => { if (!o.hang) return 0; const ph = HC.parentHeight(hc)[i]; return Math.max(0, ph - o.hang * maxH); };
  const ph = o.hang ? HC.parentHeight(hc) : null;
  const leafH = i => ph ? Math.max(0, ph[i] - o.hang * maxH) : 0;
  const posOf = v => v < 0 ? [uLeaf(-v - 1), leafH(-v - 1)] : [nodeU(v - 1), L.nodes[v - 1].y];
  const colourOf = s => { const nd = L.nodes[s]; if (o.gradient) return o.gradient(nd.y / maxH); if (o.groupColor && o.colourByGroup) { const gset = new Set(nd.members.map(m => o.groups[m])); return gset.size === 1 ? o.groupColor(nd.members[0]) : o.neutral; } return clusterOfNode[s] ? o.clusterColor(clusterOfNode[s]) : o.neutral; };
  const paths = [];
  L.nodes.forEach((nd, s) => {
    if (hidden[s]) return;
    let [ul, hl] = posOf(nd.l), [ur, hr] = posOf(nd.r);
    if (ul > ur) { [ul, ur] = [ur, ul]; [hl, hr] = [hr, hl]; }
    const col = colourOf(s), sw = o.stroke * (o.gradient ? 1 : 1);
    if (o.collapse && isTop[s]) {
      /* triangle spanning the cluster's leaves */
      const us = nd.members.map(uLeaf), u0 = Math.min(...us), u1 = Math.max(...us);
      const top = map(nodeU(s), nd.y);
      const d = `M${P(top)} L${P(map(u0, 0))}${across(u0, u1, 0)} Z`;
      paths.push(Fig.el('path', { d, fill: Fig.alpha(col, 0.25), stroke: col, 'stroke-width': sw, 'stroke-linejoin': 'round' }));
      return;
    }
    let d;
    if (o.triangle) d = `M${P(map(ul, hl))} L${P(map(nodeU(s), nd.y))} L${P(map(ur, hr))}`;
    else d = `M${P(map(ul, hl))} L${P(map(ul, nd.y))}${across(ul, ur, nd.y)} L${P(map(ur, hr))}`;
    paths.push(Fig.el('path', { d, fill: 'none', stroke: col, 'stroke-width': sw, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
  });
  /* draw neutral branches first so coloured ones stay on top */
  paths.sort((a, b) => (a.getAttribute('stroke') === o.neutral ? 0 : 1) - (b.getAttribute('stroke') === o.neutral ? 0 : 1));
  paths.forEach(p => g.appendChild(p));
  return { map, L, maxH, uLeaf, leafH, hiddenLeaf, isTop, clusterOfNode, ang, order, leafPoint: i => map(uLeaf(i), leafH(i)), clusterSpan: c => { const us = []; for (let i = 0; i < n; i++) if (cl && cl[i] === c) us.push(uLeaf(i)); return us.length ? [Math.min(...us) - 0.5 / n, Math.max(...us) + 0.5 / n] : null; } };
};

/* ---------- the studio figure ---------- */
const PD = {};
PD.clusters = (T, cfg) => {
  const hc = T.hc; let k;
  if (cfg.cutMode === 'height' && cfg.cutHeight > 0) k = 1 + hc.height.filter(v => v > cfg.cutHeight).length;
  else k = Math.max(1, Math.min(+cfg.k || 1, hc.n));
  const cl = HC.cutree(hc, k);
  /* renumber clusters left→right in the current leaf order */
  const order = PD.order(T, cfg), map = new Map(); order.forEach(i => { if (!map.has(cl[i])) map.set(cl[i], map.size + 1); });
  const cl2 = cl.map(c => map.get(c));
  const hs = hc.height.slice().sort((a, b) => a - b);
  const cutH = k > 1 && k <= hc.n ? (cfg.cutMode === 'height' && cfg.cutHeight > 0 ? +cfg.cutHeight : (hs[hc.n - k - 1] + hs[hc.n - k]) / 2) : null;
  return { k, cl: cl2, cutH, order };
};
PD.order = (T, cfg) => {
  const hc = T.hc; let ord;
  if (cfg.leafOrder === 'pcoa' && T.axis) ord = HC.reorder(hc, T.axis);
  else if (cfg.leafOrder === 'group' && T.groups) { const lv = [...new Set(T.groups)]; ord = HC.reorder(hc, T.groups.map(g => lv.indexOf(g))); }
  else if (cfg.leafOrder === 'size') { const mem = HC.members(hc); ord = HC.reorder(hc, T.labels.map((_, i) => -HC.parentHeight(hc)[i])); }
  else if (cfg.leafOrder === 'alpha') { const s = T.labels.map(l => String(l)).slice().sort(); ord = HC.reorder(hc, T.labels.map(l => s.indexOf(String(l)))); }
  else ord = hc.order;
  return cfg.reverse ? ord.slice().reverse() : ord;
};

PD.dendrogram = (cfg, T) => {
  const hc = T.hc, n = hc.n, labels = T.labels;
  const svg = Fig.svg(cfg.width, cfg.height, cfg.theme);
  const layout = cfg.layout || 'rect';
  const orient = layout === 'radial' || layout === 'radialtri' ? 'radial' : layout === 'horizontal' || layout === 'horizontaltri' ? 'h' : 'v';
  const triangle = /tri$/.test(layout);
  const { k, cl, cutH, order } = PD.clusters(T, cfg);
  const showLab = cfg.labels !== 'none' && (cfg.labels === 'all' || n <= 120);
  const fsLab = (+cfg.labelSize || 10) * Fig.fs('label');
  const maxLen = Math.max(...labels.map(l => String(l).length));
  const labSpace = showLab ? maxLen * fsLab * 0.58 + 14 : 8;
  const pointSpace = cfg.leafPoints !== 'none' ? 12 : 0;
  const m = orient === 'v' ? { top: 56, right: 24, bottom: labSpace + pointSpace + 24, left: cfg.axis === false ? 24 : 70 }
    : orient === 'h' ? { top: 56, right: labSpace + pointSpace + 16, bottom: cfg.axis === false ? 24 : 56, left: 20 }
    : { top: 56, right: 24, bottom: 24, left: 24 };
  if (cfg.legendPos === 'bottom') m.bottom += 30;
  const f = Fig.frame(svg, cfg, { margin: m });
  const pal = i => Fig.color(cfg.palette, i);
  const clusterColor = c => cfg.clusterColors && cfg.clusterColors[c - 1] ? cfg.clusterColors[c - 1] : pal(c - 1);
  const gLevels = T.groups ? [...new Set(T.groups)] : null;
  const groupColor = i => Fig.color(cfg.groupPalette || 'vivid', gLevels.indexOf(T.groups[i]));
  const maxH = (Math.max(...hc.height) || 1) * 1.04;
  const geo = orient === 'radial' ? { cx: (f.x0 + f.x1) / 2, cy: (f.y0 + f.y1) / 2, R: Math.min(f.x1 - f.x0, f.y1 - f.y0) / 2 - labSpace - pointSpace, innerR: (+cfg.innerRadius || 0) / 100 * Math.min(f.x1 - f.x0, f.y1 - f.y0) / 2, startAngle: (+cfg.startAngle || -90) * Math.PI / 180, sweep: (+cfg.sweep || 360) * Math.PI / 180 } : { x: f.x0, y: f.y0, w: f.x1 - f.x0, h: f.y1 - f.y0 };
  const colourBy = cfg.colourBy || 'cluster';
  const gradient = colourBy === 'gradient' ? (Fig.colormaps[cfg.cmap] || Fig.colormaps.viridis) : null;
  const o = Object.assign({ orient, order, maxH, cl: colourBy === 'cluster' && k > 1 ? cl : null, clusterColor, neutral: cfg.neutral || f.t.muted, gradient, stroke: +cfg.branchWidth || 1.8, triangle, hang: +cfg.hang || 0, collapse: !!cfg.collapse && k > 1, groups: T.groups, groupColor: gLevels ? groupColor : null, colourByGroup: colourBy === 'group' && !!gLevels }, geo);
  if (colourBy === 'single') { o.cl = null; o.neutral = cfg.singleColor || pal(0); }
  const g = Fig.g();
  /* cluster boxes */
  if (cfg.boxes && k > 1 && cutH != null) {
    const tmp = Dendro.draw(Fig.g(), hc, Object.assign({}, o, { collapse: false }));
    for (let c = 1; c <= k; c++) {
      const span = tmp.clusterSpan(c); if (!span) continue;
      const col = clusterColor(c), hTop = Math.min(cutH, maxH);
      if (orient === 'radial') {
        const a0 = tmp.ang(span[0]), a1 = tmp.ang(span[1]), r0 = geo.R, t = hTop / maxH, r1 = geo.R - t * (geo.R - geo.innerR);
        const big = Math.abs(a1 - a0) > Math.PI ? 1 : 0;
        const d = `M${(geo.cx + r0 * Math.cos(a0)).toFixed(2)},${(geo.cy + r0 * Math.sin(a0)).toFixed(2)} L${(geo.cx + r1 * Math.cos(a0)).toFixed(2)},${(geo.cy + r1 * Math.sin(a0)).toFixed(2)} A${r1.toFixed(2)} ${r1.toFixed(2)} 0 ${big} 1 ${(geo.cx + r1 * Math.cos(a1)).toFixed(2)},${(geo.cy + r1 * Math.sin(a1)).toFixed(2)} L${(geo.cx + r0 * Math.cos(a1)).toFixed(2)},${(geo.cy + r0 * Math.sin(a1)).toFixed(2)} A${r0.toFixed(2)} ${r0.toFixed(2)} 0 ${big} 0 ${(geo.cx + r0 * Math.cos(a0)).toFixed(2)},${(geo.cy + r0 * Math.sin(a0)).toFixed(2)} Z`;
        g.appendChild(Fig.el('path', { d, fill: Fig.alpha(col, +cfg.boxAlpha || 0.12), stroke: col, 'stroke-width': 1, 'stroke-dasharray': cfg.boxDash ? '4 3' : null }));
      } else {
        const p0 = tmp.map(span[0], 0), p1 = tmp.map(span[1], hTop);
        const x = Math.min(p0[0], p1[0]), y = Math.min(p0[1], p1[1]);
        g.appendChild(Fig.el('rect', { x, y, width: Math.abs(p1[0] - p0[0]), height: Math.abs(p1[1] - p0[1]), fill: Fig.alpha(col, +cfg.boxAlpha || 0.12), stroke: col, 'stroke-width': 1, 'stroke-dasharray': cfg.boxDash ? '4 3' : null, rx: 2 }));
        if (cfg.clusterNumbers) { const mid = tmp.map((span[0] + span[1]) / 2, hTop); g.appendChild(Fig.text(orient === 'v' ? mid[0] : mid[0] - 6, orient === 'v' ? mid[1] - 6 : mid[1] + 4, `C${c}`, { size: 11, anchor: orient === 'v' ? 'middle' : 'end', weight: 'bold', fill: col, font: f.font, role: 'label' })); }
      }
    }
  }
  const R = Dendro.draw(g, hc, o);
  /* cut line */
  if (cfg.showCut && k > 1 && cutH != null) {
    const cc = cfg.cutColor || '#d64a6a';
    if (orient === 'radial') { const t = cutH / maxH, r = geo.R - t * (geo.R - geo.innerR); g.appendChild(Fig.el('circle', { cx: geo.cx, cy: geo.cy, r, fill: 'none', stroke: cc, 'stroke-width': 1.4, 'stroke-dasharray': '6 4' })); }
    else { const a = R.map(0, cutH), b = R.map(1, cutH); g.appendChild(Fig.el('line', { x1: a[0], y1: a[1], x2: b[0], y2: b[1], stroke: cc, 'stroke-width': 1.4, 'stroke-dasharray': '6 4' })); g.appendChild(Fig.text(orient === 'v' ? b[0] - 2 : b[0], orient === 'v' ? b[1] - 5 : b[1] - 6, `k = ${k}`, { size: 11, anchor: orient === 'v' ? 'end' : 'middle', fill: cc, font: f.font, weight: 'bold', role: 'label' })); }
  }
  /* leaf points and labels */
  const labColor = i => cfg.labelColour === 'cluster' && k > 1 ? clusterColor(cl[i]) : cfg.labelColour === 'group' && gLevels ? groupColor(i) : f.t.fg;
  for (let i = 0; i < n; i++) {
    if (R.hiddenLeaf[i]) continue;
    const p = R.leafPoint(i);
    if (cfg.leafPoints !== 'none') {
      const pc = cfg.leafPoints === 'group' && gLevels ? groupColor(i) : cfg.leafPoints === 'cluster' && k > 1 ? clusterColor(cl[i]) : pal(0);
      const shape = cfg.leafPoints === 'group' && gLevels && cfg.groupShapes ? Fig.shapes[gLevels.indexOf(T.groups[i]) % Fig.shapes.length] : 'circle';
      let q = p;
      if (orient === 'v') q = [p[0], p[1] + 6]; else if (orient === 'h') q = [p[0] + 6, p[1]]; else { const a = R.ang(R.uLeaf(i)); q = [geo.cx + (geo.R + 6) * Math.cos(a), geo.cy + (geo.R + 6) * Math.sin(a)]; }
      g.appendChild(Fig.marker(q[0], q[1], +cfg.pointSize || 3.5, shape, { fill: pc, stroke: f.t.bg, 'stroke-width': 0.8 }));
    }
    if (!showLab) continue;
    const lab = String(labels[i]), off = 8 + pointSpace;
    if (orient === 'v') g.appendChild(Fig.text(p[0], p[1] + off, lab, { size: +cfg.labelSize || 10, anchor: 'end', rotate: -90 + (+cfg.labelAngle || 0), fill: labColor(i), font: f.font, role: 'label', italic: !!cfg.labelItalic, baseline: 'middle' }));
    else if (orient === 'h') g.appendChild(Fig.text(p[0] + off, p[1] + fsLab * 0.35, lab, { size: +cfg.labelSize || 10, fill: labColor(i), font: f.font, role: 'label', italic: !!cfg.labelItalic }));
    else {
      const a = R.ang(R.uLeaf(i)), deg = a * 180 / Math.PI, flip = Math.cos(a) < -1e-9, rr = geo.R + off;
      const x = geo.cx + rr * Math.cos(a), y = geo.cy + rr * Math.sin(a);
      g.appendChild(Fig.text(x, y, lab, { size: +cfg.labelSize || 10, anchor: flip ? 'end' : 'start', rotate: flip ? deg + 180 : deg, fill: labColor(i), font: f.font, role: 'label', italic: !!cfg.labelItalic, baseline: 'middle' }));
    }
  }
  /* collapsed cluster labels */
  if (o.collapse) R.isTop.forEach((top, s) => { if (!top) return; const nd = R.L.nodes[s], c = R.clusterOfNode[s]; const u = (nd.x + 0.5) / n, p = R.map(u, 0); const txt = `C${c} (n = ${nd.members.length})`; if (orient === 'v') g.appendChild(Fig.text(p[0], p[1] + 10 + pointSpace, txt, { size: +cfg.labelSize || 10, anchor: 'end', rotate: -90, fill: clusterColor(c), font: f.font, weight: 'bold', role: 'label', baseline: 'middle' })); else if (orient === 'h') g.appendChild(Fig.text(p[0] + 8, p[1] + 4, txt, { size: +cfg.labelSize || 10, fill: clusterColor(c), font: f.font, weight: 'bold', role: 'label' })); else { const a = R.ang(u), deg = a * 180 / Math.PI, flip = Math.cos(a) < 0; g.appendChild(Fig.text(geo.cx + (geo.R + 8) * Math.cos(a), geo.cy + (geo.R + 8) * Math.sin(a), txt, { size: +cfg.labelSize || 10, anchor: flip ? 'end' : 'start', rotate: flip ? deg + 180 : deg, fill: clusterColor(c), font: f.font, weight: 'bold', role: 'label', baseline: 'middle' })); } });
  f.g.appendChild(g);
  /* axis */
  if (cfg.axis !== false) {
    const axCfg = Object.assign({}, cfg, { ylab: orient === 'v' ? (cfg.axisTitle || 'Height') : null, xlab: orient === 'h' ? (cfg.axisTitle || 'Height') : null, grid: cfg.grid && orient !== 'radial' });
    if (orient === 'v') Fig.axisY(f, Fig.scaleLinear(0, maxH, f.y1, f.y0), axCfg);
    else if (orient === 'h') Fig.axisX(f, Fig.scaleLinear(0, maxH, f.x1, f.x0), axCfg, { grid: !!cfg.grid });
    else if (cfg.radialAxis) { Fig.ticks(0, maxH, 5).forEach(v => { if (v <= 0 || v > maxH) return; const r = geo.R - v / maxH * (geo.R - geo.innerR); f.g.appendChild(Fig.el('circle', { cx: geo.cx, cy: geo.cy, r, fill: 'none', stroke: f.t.grid === 'none' ? f.t.axis : f.t.grid, 'stroke-dasharray': '2 3' })); f.g.appendChild(Fig.text(geo.cx + 3, geo.cy - r - 2, Fig.fmtTick(v), { size: 9, fill: f.t.muted, font: f.font, role: 'tick' })); }); }
  }
  /* legend */
  const items = [];
  if ((cfg.legend === 'clusters' || cfg.legend === 'both') && k > 1) for (let c = 1; c <= k; c++) items.push({ label: `Cluster ${c} (n = ${cl.filter(x => x === c).length})`, color: clusterColor(c), shape: 'line' });
  if ((cfg.legend === 'groups' || cfg.legend === 'both') && gLevels) gLevels.forEach((l, i) => items.push({ label: l, color: Fig.color(cfg.groupPalette || 'vivid', i), shape: 'circle' }));
  const lp = !cfg.legendPos || cfg.legendPos === 'auto' ? (orient === 'v' ? 'right' : orient === 'h' ? 'left' : 'right') : cfg.legendPos;
  if (items.length && lp !== 'none') Fig.legend(f, items, Object.assign({}, cfg, { legendPos: lp }), { pos: lp });
  return svg;
};

/* ---------- heat map with dendrograms ---------- */
PD.heatmap = (cfg, T) => {
  const hc = T.hc, n = hc.n, X = T.X, vars = T.vars, p = vars.length;
  const svg = Fig.svg(cfg.width, cfg.height, cfg.theme);
  const { k, cl, order } = PD.clusters(T, cfg);
  /* column tree */
  const cols = vars.map((_, j) => X.map(r => r[j]));
  const Z = cols.map(c => { const m = S.mean(c), sd = S.sd(c) || 1; return c.map(v => cfg.scaleCells === false ? v : (v - m) / sd); });
  let colOrder = vars.map((_, j) => j), colTree = null;
  if (cfg.clusterColumns !== false && p > 2) { const Dc = HC.dist(Z.map(c => c), 'euclidean'); colTree = HC.agglomerate(Dc, 'average'); colOrder = colTree.order; }
  const showLab = cfg.labels !== 'none' && (cfg.labels === 'all' || n <= 80);
  const fsLab = (+cfg.labelSize || 9) * Fig.fs('label');
  const labW = showLab ? Math.max(...T.labels.map(l => String(l).length)) * fsLab * 0.58 + 10 : 4;
  const varW = Math.max(...vars.map(v => String(v).length)) * 10 * 0.58 * Fig.fs('tick') + 10;
  const treeW = +cfg.treeSize || 120, colTreeH = colTree ? treeW * 0.6 : 0;
  const f = Fig.frame(svg, cfg, { margin: { top: 56 + colTreeH + (T.groups ? 12 : 0), right: labW + 90, bottom: varW + 16, left: treeW + 12 } });
  const cellW = (f.x1 - f.x0) / p, cellH = (f.y1 - f.y0) / n;
  const cm = Fig.colormaps[cfg.cmap] || Fig.colormaps.rdbu;
  let lo = Infinity, hi = -Infinity; Z.forEach(c => c.forEach(v => { lo = Math.min(lo, v); hi = Math.max(hi, v); }));
  if (cfg.scaleCells !== false) { const a = Math.max(Math.abs(lo), Math.abs(hi)); lo = -a; hi = a; }
  const g = Fig.g();
  order.forEach((obs, i) => colOrder.forEach((j, jj) => g.appendChild(Fig.el('rect', { x: f.x0 + jj * cellW, y: f.y0 + i * cellH, width: cellW + 0.3, height: cellH + 0.3, fill: cm((Z[j][obs] - lo) / ((hi - lo) || 1)) }))));
  /* row tree */
  const pal = i => Fig.color(cfg.palette, i);
  Dendro.draw(g, hc, { orient: 'hl', x: 12, y: f.y0, w: treeW - 6, h: f.y1 - f.y0, order, cl: k > 1 ? cl : null, clusterColor: c => pal(c - 1), neutral: f.t.muted, stroke: 1.4 });
  if (colTree) Dendro.draw(g, colTree, { orient: 'v', x: f.x0, y: f.y0 - colTreeH - (T.groups ? 12 : 0), w: f.x1 - f.x0, h: colTreeH - 4, cl: null, clusterColor: () => f.t.muted, neutral: f.t.muted, stroke: 1.2 });
  /* strips */
  if (T.groups) { const lv = [...new Set(T.groups)]; order.forEach((obs, i) => g.appendChild(Fig.el('rect', { x: f.x1 + 4, y: f.y0 + i * cellH, width: 8, height: cellH + 0.3, fill: Fig.color(cfg.groupPalette || 'vivid', lv.indexOf(T.groups[obs])) }))); }
  if (k > 1) order.forEach((obs, i) => g.appendChild(Fig.el('rect', { x: f.x1 + (T.groups ? 14 : 4), y: f.y0 + i * cellH, width: 8, height: cellH + 0.3, fill: pal(cl[obs] - 1) })));
  if (showLab) order.forEach((obs, i) => g.appendChild(Fig.text(f.x1 + (T.groups ? 26 : 16), f.y0 + i * cellH + cellH / 2 + fsLab * 0.35, T.labels[obs], { size: +cfg.labelSize || 9, fill: k > 1 && cfg.labelColour === 'cluster' ? pal(cl[obs] - 1) : f.t.fg, font: f.font, role: 'label' })));
  colOrder.forEach((j, jj) => g.appendChild(Fig.text(f.x0 + jj * cellW + cellW / 2 + 4, f.y1 + 6, vars[j], { size: 10, anchor: 'end', rotate: -60, fill: f.t.fg, font: f.font, role: 'tick' })));
  g.appendChild(Fig.el('rect', { x: f.x0, y: f.y0, width: f.x1 - f.x0, height: f.y1 - f.y0, fill: 'none', stroke: f.t.axis }));
  /* colour bar */
  const bx = f.W - 60, by = f.y0, bh = Math.min(160, f.y1 - f.y0);
  for (let q = 0; q < 40; q++) g.appendChild(Fig.el('rect', { x: bx, y: by + q * bh / 40, width: 12, height: bh / 40 + 0.5, fill: cm(1 - q / 39) }));
  g.appendChild(Fig.text(bx + 16, by + 4, Fig.fmtTick(+hi.toPrecision(2)), { size: 9, fill: f.t.fg, font: f.font, role: 'tick' }));
  g.appendChild(Fig.text(bx + 16, by + bh + 3, Fig.fmtTick(+lo.toPrecision(2)), { size: 9, fill: f.t.fg, font: f.font, role: 'tick' }));
  g.appendChild(Fig.text(bx + 6, by - 8, cfg.scaleCells === false ? 'value' : 'z', { size: 10, anchor: 'middle', fill: f.t.muted, font: f.font, italic: true, role: 'label' }));
  f.g.appendChild(g);
  return svg;
};

/* ---------- tanglegram ---------- */
PD.tanglegram = (cfg, T2) => {
  const { h1, h2, labels, name1, name2 } = T2, n = h1.n;
  const svg = Fig.svg(cfg.width, cfg.height, cfg.theme);
  const f = Fig.frame(svg, cfg, { margin: { top: 56, right: 24, bottom: 40, left: 24 } });
  const U = cfg.untangle === false ? { order1: h1.order, order2: h2.order, entanglement: HC.entanglement(h1.order, h2.order), crossings: HC.crossings(h1.order, h2.order) } : T2.untangled;
  const k = Math.max(1, +cfg.k || 1), cl = HC.cutree(h1, k);
  const map1 = new Map(); U.order1.forEach(i => { if (!map1.has(cl[i])) map1.set(cl[i], map1.size + 1); });
  const clA = cl.map(c => map1.get(c));
  const pal = i => Fig.color(cfg.palette, i);
  const fs = (+cfg.labelSize || 9) * Fig.fs('label');
  const labW = cfg.labels === 'none' ? 0 : Math.max(...labels.map(l => String(l).length)) * fs * 0.58 + 8;
  const midW = Math.max(120, (f.x1 - f.x0) * (+cfg.gap || 0.3));
  const treeW = (f.x1 - f.x0 - midW) / 2 - labW;
  const g = Fig.g();
  const A = Dendro.draw(g, h1, { orient: 'hl', x: f.x0, y: f.y0, w: treeW, h: f.y1 - f.y0, order: U.order1, cl: k > 1 ? clA : null, clusterColor: c => pal(c - 1), neutral: f.t.muted, stroke: +cfg.branchWidth || 1.6 });
  const B = Dendro.draw(g, h2, { orient: 'h', x: f.x1 - treeW, y: f.y0, w: treeW, h: f.y1 - f.y0, order: U.order2, cl: k > 1 ? clA : null, clusterColor: c => pal(c - 1), neutral: f.t.muted, stroke: +cfg.branchWidth || 1.6 });
  const xa = f.x0 + treeW + labW + 4, xb = f.x1 - treeW - labW - 4;
  for (let i = 0; i < n; i++) {
    const pa = A.leafPoint(i), pb = B.leafPoint(i), col = k > 1 ? pal(clA[i] - 1) : (cfg.lineColor || pal(0));
    g.appendChild(Fig.el('line', { x1: xa, y1: pa[1], x2: xb, y2: pb[1], stroke: col, 'stroke-width': +cfg.lineWidth || 1.2, opacity: 0.85 }));
    if (cfg.labels !== 'none') { g.appendChild(Fig.text(f.x0 + treeW + 4, pa[1] + fs * 0.35, labels[i], { size: +cfg.labelSize || 9, fill: f.t.fg, font: f.font, role: 'label' })); g.appendChild(Fig.text(f.x1 - treeW - 4, pb[1] + fs * 0.35, labels[i], { size: +cfg.labelSize || 9, anchor: 'end', fill: f.t.fg, font: f.font, role: 'label' })); }
  }
  g.appendChild(Fig.text(f.x0 + treeW / 2, f.y0 - 6, name1, { size: 12, anchor: 'middle', weight: 'bold', fill: f.t.fg, font: f.font, role: 'label' }));
  g.appendChild(Fig.text(f.x1 - treeW / 2, f.y0 - 6, name2, { size: 12, anchor: 'middle', weight: 'bold', fill: f.t.fg, font: f.font, role: 'label' }));
  g.appendChild(Fig.text((f.x0 + f.x1) / 2, f.y1 + 22, `entanglement ${U.entanglement.toFixed(3)} · ${U.crossings} crossings · Baker γ ${T2.baker.toFixed(3)} · cophenetic r ${T2.coph.toFixed(3)}${k > 1 ? ` · FM(k=${k}) ${HC.fowlkesMallows(h1, h2, k).toFixed(3)}` : ''}`, { size: 11, anchor: 'middle', fill: f.t.muted, font: f.font, role: 'label' }));
  f.g.appendChild(g);
  return svg;
};

/* ---------- agreement between linkage methods ---------- */
PD.methodsHeat = (cfg, M) => {
  const names = M.names, k = names.length, R = cfg.measure === 'coph' ? M.coph : M.baker;
  const svg = Fig.svg(cfg.width, cfg.height, cfg.theme);
  const f = Fig.frame(svg, cfg, { margin: { left: 150, right: 90, bottom: 130, top: 56 } });
  const cell = Math.min((f.x1 - f.x0) / k, (f.y1 - f.y0) / k), ox = f.x0, oy = f.y0;
  const cm = Fig.colormaps[cfg.cmap] || Fig.colormaps.viridis;
  const g = Fig.g();
  for (let a = 0; a < k; a++) for (let b = 0; b < k; b++) { const r = R[a][b], t = Math.max(0, Math.min(1, r)); g.appendChild(Fig.el('rect', { x: ox + b * cell, y: oy + a * cell, width: cell - 1, height: cell - 1, fill: cm(t), rx: 1 })); if (a !== b) g.appendChild(Fig.text(ox + b * cell + cell / 2, oy + a * cell + cell / 2 + 4, r.toFixed(2), { size: Math.min(11, cell * 0.36), anchor: 'middle', fill: Fig.onColor(cm(t)), font: f.font, role: 'label' })); }
  names.forEach((nm, i) => { g.appendChild(Fig.text(ox - 6, oy + i * cell + cell / 2 + 4, nm, { size: 11, anchor: 'end', fill: f.t.fg, font: f.font, role: 'tick' })); g.appendChild(Fig.text(ox + i * cell + cell / 2, oy + k * cell + 8, nm, { size: 11, anchor: 'end', fill: f.t.fg, font: f.font, role: 'tick', rotate: -45 })); });
  const bx = ox + k * cell + 24, bh = k * cell;
  for (let q = 0; q < 40; q++) g.appendChild(Fig.el('rect', { x: bx, y: oy + q * bh / 40, width: 12, height: bh / 40 + 0.5, fill: cm(1 - q / 39) }));
  g.appendChild(Fig.text(bx + 17, oy + 4, '1', { size: 10, fill: f.t.fg, font: f.font, role: 'tick' }));
  g.appendChild(Fig.text(bx + 17, oy + bh + 4, '0', { size: 10, fill: f.t.fg, font: f.font, role: 'tick' }));
  f.g.appendChild(g);
  return svg;
};

/* ---------- merge-height profile (helps choose the cut) ---------- */
PD.heights = (cfg, T) => {
  const hc = T.hc, n = hc.n, h = hc.height.slice().sort((a, b) => a - b);
  const K = Math.min(+cfg.maxK || 15, n - 1);
  const svg = Fig.svg(cfg.width, cfg.height, cfg.theme);
  const f = Fig.frame(svg, cfg, { margin: { left: 70, right: 24, bottom: 62, top: 56 } });
  const ks = Array.from({ length: K }, (_, i) => i + 1), hs = ks.map(k => h[n - 1 - k] == null ? 0 : h[n - 1 - k]);
  const x = Fig.scaleLinear(0.5, K + 0.5, f.x0, f.x1), y = Fig.scaleLinear(0, Math.max(...hs) * 1.1 || 1, f.y1, f.y0);
  Fig.axisX(f, x, Object.assign({}, cfg, { xlab: cfg.xlab || 'number of clusters k' }), { ticks: ks });
  Fig.axisY(f, y, Object.assign({}, cfg, { ylab: cfg.ylab || 'merge height that produces k clusters' }));
  const g = Fig.g(), c = Fig.color(cfg.palette, 0), sug = HC.suggestK(hc, K).slice(0, 3).map(s => s.k);
  ks.forEach((k, i) => { g.appendChild(Fig.el('rect', { x: x(k) - (x(2) - x(1)) * 0.35, y: y(hs[i]), width: (x(2) - x(1)) * 0.7, height: f.y1 - y(hs[i]), fill: sug.includes(k) ? Fig.color(cfg.palette, 1) : Fig.alpha(c, 0.7), rx: 2 })); if (sug.includes(k)) g.appendChild(Fig.text(x(k), y(hs[i]) - 6, `k = ${k}`, { size: 10, anchor: 'middle', weight: 'bold', fill: Fig.color(cfg.palette, 1), font: f.font, role: 'label' })); });
  g.appendChild(Fig.text(f.x1 - 6, f.y0 + 16, 'highlighted: the largest jumps between successive merges', { size: 10, anchor: 'end', fill: f.t.muted, font: f.font, role: 'label' }));
  f.g.appendChild(g);
  return svg;
};

window.Dendro = Dendro; window.PD = PD;
