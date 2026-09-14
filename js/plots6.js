/* PopGeneticsPro — Block 6 figures: phylogenetic-style trees (rectangular and
   equal-angle radial) with bootstrap support, PCoA scatter with hulls or
   ellipses, scree of eigenvalues, distance heat map and isolation by distance. */

const P6 = {};

/* ================================================================
   tree layout helpers
   ================================================================ */
function treeTips(node, out) { out = out || []; if (node.tip != null) out.push(node); node.children.forEach(c => treeTips(c.node, out)); return out; }
function treeDepth(node) { return node.children.length ? Math.max(...node.children.map(c => c.len + treeDepth(c.node))) : 0; }

/* rectangular layout: x = distance from root, y = tip rank */
function layoutRect(root) {
  const tips = treeTips(root); let rank = 0;
  const pos = new Map();
  const walk = (node, x) => {
    if (node.tip != null) { pos.set(node, { x, y: rank++ }); return rank - 1; }
    const ys = node.children.map(c => walk(c.node, x + c.len));
    const y = (Math.min(...node.children.map(c => pos.get(c.node).y)) + Math.max(...node.children.map(c => pos.get(c.node).y))) / 2;
    pos.set(node, { x, y });
    return y;
  };
  walk(root, 0);
  return { pos, nTips: tips.length, maxX: Math.max(...[...pos.values()].map(p => p.x)) };
}
/* equal-angle layout (Felsenstein): each subtree gets a wedge proportional to its tips */
function layoutRadial(root) {
  const count = node => node.tip != null ? 1 : node.children.reduce((s, c) => s + count(c.node), 0);
  const total = count(root);
  const pos = new Map();
  const walk = (node, x, y, a0, a1) => {
    pos.set(node, { x, y });
    let a = a0;
    node.children.forEach(c => {
      const span = (a1 - a0) * count(c.node) / count(node);
      const mid = a + span / 2;
      walk(c.node, x + c.len * Math.cos(mid), y + c.len * Math.sin(mid), a, a + span);
      a += span;
    });
  };
  walk(root, 0, 0, -Math.PI / 2, 1.5 * Math.PI);
  return { pos, nTips: total };
}

/* ---------- 1 · tree ---------- */
/* T = {root, tipColour(tipIndex)→colour|null, tipLabel(tipIndex)→string} */
P6.tree = (cfg, T) => {
  const root = T.root;
  const tips = treeTips(root);
  const n = tips.length;
  const radial = cfg.layout === 'radial';
  const H = radial ? cfg.height : Math.max(300, 90 + n * (+cfg.rowH || 18));
  const svg = Fig.svg(cfg.width, H, cfg.theme);
  const labelRoom = cfg.tipLabels === false ? 20 : Math.min(260, 40 + Math.max(...tips.map(t => String(T.tipLabel(t.tip)).length)) * (+cfg.labelSize || 11) * 0.62);
  const f = Fig.frame(svg, cfg, { margin: { left: 30, right: radial ? 30 : labelRoom, bottom: 50, top: 56 } });
  const g = Fig.g();
  const bw = +cfg.branchWidth || 1.6;
  const support = node => node.support != null && cfg.showSupport !== false && node.support * 100 >= (+cfg.minSupport || 50);
  const supTxt = node => (cfg.supportAs === 'fraction' ? node.support.toFixed(2) : Math.round(node.support * 100));

  if (!radial) {
    const L = layoutRect(root);
    const sx = (f.x1 - f.x0) / (L.maxX || 1), sy = (f.y1 - f.y0) / Math.max(1, n - 1);
    const X = x => f.x0 + x * sx, Y = y => f.y0 + y * sy;
    const walk = node => {
      const p = L.pos.get(node);
      node.children.forEach(c => {
        const q = L.pos.get(c.node);
        g.appendChild(Fig.el('path', { d: `M${X(p.x).toFixed(1)} ${Y(p.y).toFixed(1)} V${Y(q.y).toFixed(1)} H${X(q.x).toFixed(1)}`, fill: 'none', stroke: f.t.fg, 'stroke-width': bw, 'stroke-linejoin': 'round' }));
        if (c.node.tip != null) {
          const col = T.tipColour ? T.tipColour(c.node.tip) : null;
          if (col) g.appendChild(Fig.el('circle', { cx: X(q.x), cy: Y(q.y), r: +cfg.pointSize || 4, fill: col, stroke: f.t.bg, 'stroke-width': 1 }));
          if (cfg.tipLabels !== false) g.appendChild(Fig.text(X(q.x) + 8, Y(q.y) + 4, T.tipLabel(c.node.tip), { size: +cfg.labelSize || 11, fill: cfg.colourLabels && col ? col : f.t.fg, font: f.font, italic: !!cfg.italic, role: 'tick' }));
        } else if (support(c.node)) {
          g.appendChild(Fig.text(X(q.x) - 4, Y(q.y) - 4, supTxt(c.node), { size: +cfg.supportSize || 9.5, anchor: 'end', fill: Fig.color(cfg.palette, 1), font: f.font, weight: 'bold', role: 'label' }));
        }
        walk(c.node);
      });
    };
    walk(root);
    /* scale bar */
    if (cfg.scaleBar !== false && L.maxX > 0) {
      const nice = Fig.ticks(0, L.maxX, 5)[1] || L.maxX / 4;
      const bx = f.x0, by = f.y1 + 28;
      g.appendChild(Fig.el('line', { x1: bx, x2: bx + nice * sx, y1: by, y2: by, stroke: f.t.fg, 'stroke-width': 1.4 }));
      g.appendChild(Fig.text(bx + nice * sx / 2, by - 5, Fig.fmtTick(nice), { size: 10, anchor: 'middle', fill: f.t.muted, font: f.font, role: 'label' }));
    }
  } else {
    const L = layoutRadial(root);
    const xs = [...L.pos.values()].map(p => p.x), ys = [...L.pos.values()].map(p => p.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const pad = cfg.tipLabels === false ? 20 : 90;
    const s = Math.min((f.x1 - f.x0 - 2 * pad) / ((maxX - minX) || 1), (f.y1 - f.y0 - 2 * pad) / ((maxY - minY) || 1));
    const cx = (f.x0 + f.x1) / 2 - ((minX + maxX) / 2) * s, cy = (f.y0 + f.y1) / 2 - ((minY + maxY) / 2) * s;
    const X = x => cx + x * s, Y = y => cy + y * s;
    const walk = node => {
      const p = L.pos.get(node);
      node.children.forEach(c => {
        const q = L.pos.get(c.node);
        g.appendChild(Fig.el('line', { x1: X(p.x), y1: Y(p.y), x2: X(q.x), y2: Y(q.y), stroke: f.t.fg, 'stroke-width': bw, 'stroke-linecap': 'round' }));
        if (c.node.tip != null) {
          const col = T.tipColour ? T.tipColour(c.node.tip) : null;
          if (col) g.appendChild(Fig.el('circle', { cx: X(q.x), cy: Y(q.y), r: +cfg.pointSize || 4, fill: col, stroke: f.t.bg, 'stroke-width': 1 }));
          if (cfg.tipLabels !== false) {
            const ang = Math.atan2(q.y - p.y, q.x - p.x);
            const lx = X(q.x) + Math.cos(ang) * 9, ly = Y(q.y) + Math.sin(ang) * 9;
            const flip = Math.cos(ang) < 0;
            g.appendChild(Fig.text(lx, ly + 4, T.tipLabel(c.node.tip), { size: +cfg.labelSize || 11, anchor: flip ? 'end' : 'start', fill: cfg.colourLabels && col ? col : f.t.fg, font: f.font, italic: !!cfg.italic, role: 'tick', rotate: cfg.rotateLabels ? (flip ? ang * 180 / Math.PI + 180 : ang * 180 / Math.PI) : null }));
          }
        } else if (support(c.node)) {
          g.appendChild(Fig.text(X(q.x) + 3, Y(q.y) - 3, supTxt(c.node), { size: +cfg.supportSize || 9.5, fill: Fig.color(cfg.palette, 1), font: f.font, weight: 'bold', role: 'label' }));
        }
        walk(c.node);
      });
    };
    walk(root);
    if (cfg.scaleBar !== false) {
      const maxLen = treeDepth(root);
      const nice = Fig.ticks(0, maxLen, 5)[1] || maxLen / 4;
      g.appendChild(Fig.el('line', { x1: f.x0, x2: f.x0 + nice * s, y1: f.y1 + 28, y2: f.y1 + 28, stroke: f.t.fg, 'stroke-width': 1.4 }));
      g.appendChild(Fig.text(f.x0 + nice * s / 2, f.y1 + 23, Fig.fmtTick(nice), { size: 10, anchor: 'middle', fill: f.t.muted, font: f.font, role: 'label' }));
    }
  }
  if (T.note) g.appendChild(Fig.text(f.x1, f.H - 8, T.note, { size: 10, anchor: 'end', fill: f.t.muted, font: f.font, role: 'label' }));
  f.g.appendChild(g);
  if (T.legend && cfg.legendPos !== 'none') Fig.legend(f, T.legend, cfg, { pos: cfg.legendPos || (radial ? 'left' : 'right') });
  return svg;
};

/* ================================================================
   2 · PCoA scatter
   ================================================================ */
function convexHull(pts) {
  const P = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (P.length < 3) return P;
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const p of P) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
  for (const p of P.slice().reverse()) { while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}
function ellipse95(pts) {
  const n = pts.length; if (n < 3) return null;
  const mx = pts.reduce((s, p) => s + p[0], 0) / n, my = pts.reduce((s, p) => s + p[1], 0) / n;
  let sxx = 0, syy = 0, sxy = 0;
  pts.forEach(p => { sxx += (p[0] - mx) ** 2; syy += (p[1] - my) ** 2; sxy += (p[0] - mx) * (p[1] - my); });
  sxx /= n - 1; syy /= n - 1; sxy /= n - 1;
  const tr = sxx + syy, det = sxx * syy - sxy * sxy;
  const l1 = tr / 2 + Math.sqrt(Math.max(0, tr * tr / 4 - det)), l2 = tr / 2 - Math.sqrt(Math.max(0, tr * tr / 4 - det));
  /* major axis: eigenvector of the covariance for l1 */
  let a = Math.atan2(l1 - sxx, sxy);
  if (!isFinite(a) || (Math.abs(sxy) < 1e-15 && Math.abs(l1 - sxx) < 1e-15)) a = sxx >= syy ? 0 : Math.PI / 2;
  const k = Math.sqrt(5.991);   // chi-square 2 df, 95%
  const rx = k * Math.sqrt(Math.max(l1, 0)), ry = k * Math.sqrt(Math.max(l2, 0));
  /* the outline in data units: the two axes of a plot rarely have the same
     scale, so the ellipse is traced point by point and mapped afterwards,
     never drawn as a rotated SVG ellipse in pixels */
  const outline = Array.from({ length: 73 }, (_, i) => {
    const t = i / 72 * 2 * Math.PI;
    return [mx + rx * Math.cos(t) * Math.cos(a) - ry * Math.sin(t) * Math.sin(a), my + rx * Math.cos(t) * Math.sin(a) + ry * Math.sin(t) * Math.cos(a)];
  });
  return { cx: mx, cy: my, rx, ry, ang: a * 180 / Math.PI, outline };
}

/* S = {scores, pct, labels, groupOf (index→group index or null), groupNames} */
P6.pcoa = (cfg, S) => {
  const ax = Math.max(0, (+cfg.ax1 || 1) - 1), ay = Math.max(0, (+cfg.ax2 || 2) - 1);
  const svg = Fig.svg(cfg.width, cfg.height, cfg.theme);
  const f = Fig.frame(svg, cfg, { margin: { left: 74, right: cfg.legendPos === 'none' || !S.groupNames ? 30 : 150, bottom: 64, top: 56 } });
  const xs = S.scores.map(s => s[ax] || 0), ys = S.scores.map(s => s[ay] || 0);
  const padX = (Math.max(...xs) - Math.min(...xs)) * 0.08 || 1, padY = (Math.max(...ys) - Math.min(...ys)) * 0.08 || 1;
  const x = Fig.scaleLinear(Math.min(...xs) - padX, Math.max(...xs) + padX, f.x0, f.x1);
  const y = Fig.scaleLinear(Math.min(...ys) - padY, Math.max(...ys) + padY, f.y1, f.y0);
  const pct = k => S.pct[k] != null ? ` (${(S.pct[k] * 100).toFixed(1)}%)` : '';
  Fig.axisY(f, y, Object.assign({}, cfg, { ylab: cfg.ylab || `PCo ${ay + 1}${pct(ay)}` }));
  Fig.axisX(f, x, Object.assign({}, cfg, { xlab: cfg.xlab || `PCo ${ax + 1}${pct(ax)}` }));
  const g = Fig.g();
  g.appendChild(Fig.el('line', { x1: x(0), x2: x(0), y1: f.y0, y2: f.y1, stroke: f.t.grid === 'none' ? f.t.axis : f.t.grid, 'stroke-dasharray': '4 4' }));
  g.appendChild(Fig.el('line', { x1: f.x0, x2: f.x1, y1: y(0), y2: y(0), stroke: f.t.grid === 'none' ? f.t.axis : f.t.grid, 'stroke-dasharray': '4 4' }));
  const groups = S.groupNames || [];
  const colOf = i => S.groupOf && S.groupOf[i] != null && S.groupOf[i] >= 0 ? Fig.color(cfg.palette, S.groupOf[i]) : Fig.color(cfg.palette, 0);
  /* hulls / ellipses per group */
  if (S.groupOf && cfg.envelope && cfg.envelope !== 'none') {
    groups.forEach((gname, gi) => {
      const pts = S.scores.map((s, i) => [xs[i], ys[i]]).filter((_, i) => S.groupOf[i] === gi);
      if (pts.length < 3) return;
      const col = Fig.color(cfg.palette, gi);
      if (cfg.envelope === 'hull') {
        const hull = convexHull(pts);
        g.appendChild(Fig.el('path', { d: hull.map((p, k) => (k ? 'L' : 'M') + x(p[0]).toFixed(1) + ' ' + y(p[1]).toFixed(1)).join(' ') + ' Z', fill: Fig.alpha(col, 0.12), stroke: col, 'stroke-width': 1.2, 'stroke-dasharray': '4 3' }));
      } else {
        const e = ellipse95(pts);
        if (e) g.appendChild(Fig.el('path', { d: e.outline.map((p, k) => (k ? 'L' : 'M') + x(p[0]).toFixed(1) + ' ' + y(p[1]).toFixed(1)).join(' ') + ' Z', fill: Fig.alpha(col, 0.12), stroke: col, 'stroke-width': 1.2, 'stroke-dasharray': '4 3' }));
      }
    });
  }
  const repel = cfg.repel !== false;
  const pointLabels = [];
  const ptR = +cfg.pointSize || 4.5;
  S.scores.forEach((s, i) => {
    const shape = cfg.shapes && S.groupOf ? Fig.shapes[(S.groupOf[i] || 0) % Fig.shapes.length] : 'circle';
    g.appendChild(Fig.marker(x(xs[i]), y(ys[i]), ptR, shape, { fill: Fig.alpha(colOf(i), 0.85), stroke: f.t.bg, 'stroke-width': 0.8 }));
    if (cfg.labels === 'all' || (cfg.labels === 'auto' && S.scores.length <= 40)) {
      if (repel) pointLabels.push({ x: x(xs[i]), y: y(ys[i]), text: S.labels[i], size: +cfg.labelSize || 9.5, r: ptR });
      else g.appendChild(Fig.text(x(xs[i]) + 6, y(ys[i]) - 5, S.labels[i], { size: +cfg.labelSize || 9.5, fill: f.t.fg, font: f.font, role: 'label', halo: f.t.bg }));
    }
  });
  /* group centroids */
  if (S.groupOf && cfg.centroids) {
    groups.forEach((gname, gi) => {
      const pts = S.scores.map((s, i) => [xs[i], ys[i]]).filter((_, i) => S.groupOf[i] === gi);
      if (!pts.length) return;
      const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length, cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
      g.appendChild(Fig.marker(x(cx), y(cy), 7, 'diamond', { fill: Fig.color(cfg.palette, gi), stroke: f.t.fg, 'stroke-width': 1.2 }));
      if (repel) pointLabels.push({ x: x(cx), y: y(cy), text: gname, size: 11, weight: 'bold', r: 8 });
      else g.appendChild(Fig.text(x(cx) + 9, y(cy) + 4, gname, { size: 11, fill: f.t.fg, font: f.font, weight: 'bold', role: 'label', halo: f.t.bg }));
    });
  }
  if (repel) Fig.repelLabels(g, f, pointLabels);
  f.g.appendChild(g);
  if (S.groupNames && cfg.legendPos !== 'none')
    Fig.legend(f, groups.map((gname, gi) => ({ label: gname, color: Fig.color(cfg.palette, gi), shape: 'circle' })), cfg, { pos: cfg.legendPos || 'right' });
  return svg;
};

/* ---------- 3 · scree ---------- */
P6.scree = (cfg, pc) => {
  const vals = pc.values.slice(0, +cfg.axes || 10);
  const svg = Fig.svg(cfg.width, cfg.height, cfg.theme);
  const sumPos = pc.sumPos || 1;
  const pct = vals.map(v => v / sumPos);
  const labels = vals.map((_, i) => 'PCo ' + (i + 1));
  const C = Fig.bandPlot(svg, cfg, labels, [Math.min(0, ...pct), Math.max(...pct) * 1.15],
    { valueLabel: '% of variation (positive eigenvalues)', fmt: v => (v * 100).toFixed(0) + '%', margin: { right: cfg.flip && cfg.cumulative !== false ? 56 : 30 } });
  const f = C.f;
  const g = Fig.g();
  let cum = 0;
  pct.forEach((v, i) => {
    cum += Math.max(0, v);
    g.appendChild(C.bar(i, v, { fill: v >= 0 ? Fig.color(cfg.palette, 0) : Fig.color(cfg.palette, 1), rx: 2 }));
    g.appendChild(C.valueText(C.center(i), Math.max(0, v), (v * 100).toFixed(1) + '%'));
    if (cfg.cumulative !== false) g.appendChild(C.edgeText(C.center(i), 'Σ ' + (cum * 100).toFixed(0) + '%', { fill: f.t.muted }));
  });
  f.g.appendChild(g);
  return svg;
};

/* ---------- 4 · distance heat map ---------- */
P6.distHeat = (cfg, M) => {
  /* M = {D, names, order?} */
  const order = cfg.orderByTree && M.order ? M.order : M.names.map((_, i) => i);
  const n = order.length;
  const svg = Fig.svg(cfg.width, cfg.height, cfg.theme);
  const f = Fig.frame(svg, cfg, { margin: { left: 130, right: 90, bottom: 120, top: 56 } });
  const cell = Math.min((f.x1 - f.x0) / n, (f.y1 - f.y0) / n);
  const cmap = Fig.colormaps[cfg.cmap] || Fig.colormaps.viridis;
  const vals = []; for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (isFinite(M.D[i][j])) vals.push(M.D[i][j]);
  const vmax = Math.max(1e-9, ...vals);
  const g = Fig.g();
  for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) {
    const i = order[a], j = order[b];
    const v = i === j ? 0 : M.D[i][j];
    const x = f.x0 + b * cell, y = f.y0 + a * cell;
    g.appendChild(Fig.el('rect', { x, y, width: cell - 1, height: cell - 1, fill: isFinite(v) ? cmap(v / vmax) : f.t.bg, rx: 1.5 }));
    if (cfg.values !== false && cell > 34 && i !== j && isFinite(v)) g.appendChild(Fig.text(x + cell / 2, y + cell / 2 + 4, v.toFixed(3), { size: Math.min(10, cell * 0.25), anchor: 'middle', fill: v / vmax > 0.55 ? '#fff' : f.t.fg, font: f.font, role: 'label' }));
  }
  order.forEach((i, k) => {
    g.appendChild(Fig.text(f.x0 - 6, f.y0 + k * cell + cell / 2 + 4, M.names[i], { size: Math.min(11, cell * 0.6), anchor: 'end', fill: f.t.fg, font: f.font, role: 'tick' }));
    g.appendChild(Fig.text(f.x0 + k * cell + cell / 2, f.y0 + n * cell + 8, M.names[i], { size: Math.min(11, cell * 0.6), anchor: 'end', fill: f.t.fg, font: f.font, rotate: -45, role: 'tick' }));
  });
  const bx = f.x0 + n * cell + 24, bh = Math.min(180, n * cell);
  for (let k = 0; k < 40; k++) g.appendChild(Fig.el('rect', { x: bx, y: f.y0 + k * bh / 40, width: 13, height: bh / 40 + 0.6, fill: cmap(1 - k / 39) }));
  [[vmax.toFixed(3), f.y0 + 4], ['0', f.y0 + bh + 4]].forEach(([t, yy]) => g.appendChild(Fig.text(bx + 18, yy, t, { size: 9, fill: f.t.fg, font: f.font, role: 'tick' })));
  f.g.appendChild(g);
  return svg;
};

/* ---------- 5 · isolation by distance ---------- */
/* I = {x, y, xlab, ylab, reg, mantel, labels?} */
P6.ibd = (cfg, I) => {
  const svg = Fig.svg(cfg.width, cfg.height, cfg.theme);
  const f = Fig.frame(svg, cfg, { margin: { left: 80, right: 30, bottom: 64, top: 56 } });
  const pts = I.x.map((v, i) => [v, I.y[i], I.labels ? I.labels[i] : '']).filter(p => isFinite(p[0]) && isFinite(p[1]));
  if (!pts.length) { f.g.appendChild(Fig.text(f.W / 2, f.H / 2, 'No pairs with finite distances.', { size: 13, anchor: 'middle', fill: f.t.muted, font: f.font })); return svg; }
  /* tens of thousands of pairs of plants: extremes by a loop, since spreading them as arguments overflows the stack */
  let xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity;
  pts.forEach(p => { if (p[0] < xMin) xMin = p[0]; if (p[0] > xMax) xMax = p[0]; if (p[1] < yMin) yMin = p[1]; if (p[1] > yMax) yMax = p[1]; });
  const dx = Fig.niceDomain(xMin, xMax), dy = Fig.niceDomain(Math.min(0, yMin), yMax);
  /* distances and linearised F_ST are never negative: the padding of a nice axis must not open a negative range */
  if (xMin >= 0 && dx[0] < 0) dx[0] = 0;
  if (yMin >= 0 && dy[0] < 0) dy[0] = 0;
  const x = Fig.scaleLinear(dx[0], dx[1], f.x0, f.x1), y = Fig.scaleLinear(dy[0], dy[1], f.y1, f.y0);
  Fig.axisY(f, y, Object.assign({}, cfg, { ylab: cfg.ylab || I.ylab }));
  Fig.axisX(f, x, Object.assign({}, cfg, { xlab: cfg.xlab || I.xlab }));
  const g = Fig.g();
  const many = pts.length > 3000;
  const step = many ? Math.ceil(pts.length / 3000) : 1;
  pts.forEach((p, i) => { if (i % step === 0) g.appendChild(Fig.marker(x(p[0]), y(p[1]), many ? 2 : (+cfg.pointSize || 4.5), 'circle', { fill: Fig.alpha(Fig.color(cfg.palette, 0), many ? 0.35 : 0.75) })); });
  if (I.reg && cfg.line !== false) {
    const x0 = xMin, x1 = xMax;
    g.appendChild(Fig.el('line', { x1: x(x0), y1: y(I.reg.intercept + I.reg.slope * x0), x2: x(x1), y2: y(I.reg.intercept + I.reg.slope * x1), stroke: Fig.color(cfg.palette, 1), 'stroke-width': 2.2 }));
  }
  const txt = [];
  if (I.mantel) txt.push(`Mantel r = ${I.mantel.r.toFixed(3)}, P = ${I.mantel.p == null ? '—' : I.mantel.p.toFixed(3)}`);
  if (I.reg) txt.push(`slope = ${I.reg.slope.toExponential(2)}, r² = ${I.reg.r2.toFixed(3)}`);
  g.appendChild(Fig.text(f.x0 + 8, f.y0 + 14, txt.join('   ·   '), { size: 11, fill: f.t.fg, font: f.font, weight: 'bold', role: 'label', halo: f.t.bg }));
  if (cfg.pairLabels && I.labels && pts.length <= 45) {
    if (cfg.repel !== false) Fig.repelLabels(g, f, pts.map(p => ({ x: x(p[0]), y: y(p[1]), text: p[2], size: 8.5, fill: f.t.muted, r: +cfg.pointSize || 4.5 })));
    else pts.forEach(p => g.appendChild(Fig.text(x(p[0]) + 5, y(p[1]) - 4, p[2], { size: 8.5, fill: f.t.muted, font: f.font, role: 'label' })));
  }
  f.g.appendChild(g);
  return svg;
};

window.P6 = P6;
window.TreeUtil = { treeTips, layoutRect, layoutRadial, convexHull, ellipse95 };
