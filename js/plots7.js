/* PopGeneticsPro — Block 7 figures: the admixture membership barplot,
   Ln P(D) and Evanno's ΔK against K, Puechmaille's estimators, the BIC curve
   of k-means clustering, the assignment matrix and the L_home / L_max plot. */

const P7 = {};

/* ---------- 1 · membership barplot ---------- */
/* S = {Q (N×K), popOf (index per individual or null), popNames, labels} */
P7.structBar = (cfg, S) => {
  const N = S.Q.length, K = S.Q[0].length;
  const hasPops = S.popOf && S.popNames;
  /* order: by population, then within population by the dominant cluster and its Q */
  let order = S.Q.map((_, i) => i);
  const dom = q => q.indexOf(Math.max(...q));
  if (cfg.sort === 'q') {
    order.sort((a, b) => dom(S.Q[a]) - dom(S.Q[b]) || S.Q[b][dom(S.Q[b])] - S.Q[a][dom(S.Q[a])]);
  } else if (cfg.sort !== 'file' && hasPops) {
    order.sort((a, b) => S.popOf[a] - S.popOf[b] || dom(S.Q[a]) - dom(S.Q[b]) || S.Q[b][dom(S.Q[b])] - S.Q[a][dom(S.Q[a])]);
  } else if (hasPops) order.sort((a, b) => S.popOf[a] - S.popOf[b]);
  const svg = Fig.svg(cfg.width, cfg.height, cfg.theme);
  const showInd = cfg.indLabels && N <= 120;
  const f = Fig.frame(svg, cfg, { margin: { left: 50, right: cfg.legendPos === 'none' ? 20 : 110, bottom: (hasPops ? 60 : 30) + (showInd ? 70 : 0), top: 56 } });
  const gap = hasPops && cfg.gap !== false ? Math.min(10, (f.x1 - f.x0) * 0.01) : 0;
  const nGroups = hasPops ? new Set(order.map(i => S.popOf[i])).size : 1;
  const barW = (f.x1 - f.x0 - gap * (nGroups - 1)) / N;
  const H = f.y1 - f.y0;
  const g = Fig.g();
  let x = f.x0, lastPop = null, groupStart = f.x0;
  const groupSpans = [];
  order.forEach((i, pos) => {
    const p = hasPops ? S.popOf[i] : 0;
    if (lastPop != null && p !== lastPop) { groupSpans.push({ pop: lastPop, x0: groupStart, x1: x }); x += gap; groupStart = x; }
    lastPop = p;
    let y = f.y1;
    for (let k = 0; k < K; k++) {
      const h = S.Q[i][k] * H;
      g.appendChild(Fig.el('rect', { x: x.toFixed(2), y: (y - h).toFixed(2), width: (barW + 0.3).toFixed(2), height: h.toFixed(2), fill: Fig.color(cfg.palette, k) }));
      y -= h;
    }
    if (showInd) g.appendChild(Fig.text(x + barW / 2, f.y1 + (hasPops ? 26 : 8), S.labels[i], { size: Math.min(9, barW * 1.6), anchor: 'end', fill: f.t.muted, font: f.font, rotate: -90, role: 'tick' }));
    x += barW;
  });
  groupSpans.push({ pop: lastPop, x0: groupStart, x1: x });
  g.appendChild(Fig.el('rect', { x: f.x0, y: f.y0, width: f.x1 - f.x0, height: H, fill: 'none', stroke: f.t.axis, 'stroke-width': 1 }));
  if (hasPops) groupSpans.forEach(s => {
    if (cfg.separators !== false && s.x0 > f.x0) g.appendChild(Fig.el('line', { x1: s.x0 - gap / 2, x2: s.x0 - gap / 2, y1: f.y0, y2: f.y1, stroke: f.t.fg, 'stroke-width': gap ? 0 : 1.2 }));
    g.appendChild(Fig.text((s.x0 + s.x1) / 2, f.y1 + 16, S.popNames[s.pop], { size: +cfg.popLabelSize || 11, anchor: (s.x1 - s.x0) < 60 ? 'end' : 'middle', fill: f.t.fg, font: f.font, weight: 'bold', role: 'tick', rotate: (s.x1 - s.x0) < 60 ? -35 : null }));
  });
  /* y axis 0–1 */
  [0, 0.5, 1].forEach(v => {
    g.appendChild(Fig.el('line', { x1: f.x0 - 4, x2: f.x0, y1: f.y1 - v * H, y2: f.y1 - v * H, stroke: f.t.axis }));
    g.appendChild(Fig.text(f.x0 - 8, f.y1 - v * H + 4, v.toFixed(1), { size: 10, anchor: 'end', fill: f.t.fg, font: f.font, role: 'tick' }));
  });
  g.appendChild(Fig.text(16, (f.y0 + f.y1) / 2, cfg.ylab || 'membership Q', { size: 12, anchor: 'middle', fill: f.t.fg, font: f.font, rotate: -90, role: 'axis' }));
  f.g.appendChild(g);
  if (cfg.legendPos !== 'none') Fig.legend(f, Array.from({ length: K }, (_, k) => ({ label: (S.clusterNames && S.clusterNames[k]) || ('Cluster ' + (k + 1)), color: Fig.color(cfg.palette, k) })), cfg, { pos: cfg.legendPos || 'right' });
  return svg;
};

/* ---------- 2 · Ln P(D) against K ---------- */
P7.lnPD = (cfg, E) => {
  const rows = E.rows;
  const svg = Fig.svg(cfg.width, cfg.height, cfg.theme);
  const f = Fig.frame(svg, cfg, { margin: { left: 90, right: 30, bottom: 60, top: 56 } });
  const all = [].concat(...rows.map(r => [r.meanL - (r.sdL || 0), r.meanL + (r.sdL || 0)]));
  const dom = Fig.niceDomain(Math.min(...all), Math.max(...all));
  const x = Fig.scaleLinear(rows[0].K - 0.5, rows[rows.length - 1].K + 0.5, f.x0, f.x1);
  const y = Fig.scaleLinear(dom[0], dom[1], f.y1, f.y0);
  Fig.axisY(f, y, Object.assign({}, cfg, { ylab: cfg.ylab || 'mean Ln P(D) ± SD' }));
  Fig.axisX(f, x, Object.assign({}, cfg, { xlab: cfg.xlab || 'K', grid: false }), { ticks: rows.map(r => r.K), fmt: v => String(v) });
  const g = Fig.g();
  g.appendChild(Fig.el('path', { d: rows.map((r, i) => (i ? 'L' : 'M') + x(r.K).toFixed(1) + ' ' + y(r.meanL).toFixed(1)).join(' '), fill: 'none', stroke: Fig.color(cfg.palette, 0), 'stroke-width': 2 }));
  rows.forEach(r => {
    if (r.sdL) { g.appendChild(Fig.el('line', { x1: x(r.K), x2: x(r.K), y1: y(r.meanL - r.sdL), y2: y(r.meanL + r.sdL), stroke: Fig.color(cfg.palette, 0), 'stroke-width': 1.4 })); }
    g.appendChild(Fig.marker(x(r.K), y(r.meanL), 5, 'circle', { fill: r.K === E.bestL ? Fig.color(cfg.palette, 1) : Fig.color(cfg.palette, 0), stroke: f.t.bg, 'stroke-width': 1 }));
  });
  f.g.appendChild(g);
  return svg;
};

/* ---------- 3 · Evanno's ΔK ---------- */
P7.deltaK = (cfg, E) => {
  const rows = E.rows.filter(r => r.deltaK != null);
  const svg = Fig.svg(cfg.width, cfg.height, cfg.theme);
  const f = Fig.frame(svg, cfg, { margin: { left: 80, right: 30, bottom: 60, top: 56 } });
  if (!rows.length) { f.g.appendChild(Fig.text(f.W / 2, f.H / 2, 'ΔK needs at least three K values and two replicates each.', { size: 12, anchor: 'middle', fill: f.t.muted, font: f.font })); return svg; }
  const x = Fig.scaleLinear(E.rows[0].K - 0.5, E.rows[E.rows.length - 1].K + 0.5, f.x0, f.x1);
  const y = Fig.scaleLinear(0, Math.max(...rows.map(r => r.deltaK)) * 1.15, f.y1, f.y0);
  Fig.axisY(f, y, Object.assign({}, cfg, { ylab: cfg.ylab || 'ΔK' }));
  Fig.axisX(f, x, Object.assign({}, cfg, { xlab: cfg.xlab || 'K', grid: false }), { ticks: E.rows.map(r => r.K), fmt: v => String(v) });
  const g = Fig.g();
  g.appendChild(Fig.el('path', { d: rows.map((r, i) => (i ? 'L' : 'M') + x(r.K).toFixed(1) + ' ' + y(r.deltaK).toFixed(1)).join(' '), fill: 'none', stroke: Fig.color(cfg.palette, 1), 'stroke-width': 2 }));
  rows.forEach(r => g.appendChild(Fig.marker(x(r.K), y(r.deltaK), r.K === E.bestDelta ? 6.5 : 4.5, 'circle', { fill: Fig.color(cfg.palette, 1), stroke: f.t.bg, 'stroke-width': 1 })));
  if (E.bestDelta != null) g.appendChild(Fig.text(x(E.bestDelta), f.y0 + 14, `ΔK peaks at K = ${E.bestDelta}`, { size: 11, anchor: 'middle', fill: Fig.color(cfg.palette, 1), font: f.font, weight: 'bold', role: 'label' }));
  f.g.appendChild(g);
  return svg;
};

/* ---------- 4 · Puechmaille's estimators against K ---------- */
P7.puech = (cfg, rows) => {
  const svg = Fig.svg(cfg.width, cfg.height, cfg.theme);
  const f = Fig.frame(svg, cfg, { margin: { left: 80, right: 150, bottom: 60, top: 56 } });
  const x = Fig.scaleLinear(rows[0].K - 0.5, rows[rows.length - 1].K + 0.5, f.x0, f.x1);
  const top = Math.max(...rows.map(r => Math.max(r.maxMeaK, r.maxMedK, r.K)));
  const y = Fig.scaleLinear(0, top + 1, f.y1, f.y0);
  Fig.axisY(f, y, Object.assign({}, cfg, { ylab: cfg.ylab || 'clusters actually used' }), { count: Math.min(8, top + 1), fmt: v => String(Math.round(v)) });
  Fig.axisX(f, x, Object.assign({}, cfg, { xlab: cfg.xlab || 'K tested', grid: false }), { ticks: rows.map(r => r.K), fmt: v => String(v) });
  const g = Fig.g();
  g.appendChild(Fig.el('line', { x1: x(rows[0].K), y1: y(rows[0].K), x2: x(rows[rows.length - 1].K), y2: y(rows[rows.length - 1].K), stroke: f.t.muted, 'stroke-dasharray': '4 4' }));
  const series = [['medMeaK', 'MedMeaK', 0], ['maxMeaK', 'MaxMeaK', 1], ['medMedK', 'MedMedK', 2], ['maxMedK', 'MaxMedK', 3]];
  series.forEach(([key, lab, c]) => {
    g.appendChild(Fig.el('path', { d: rows.map((r, i) => (i ? 'L' : 'M') + x(r.K).toFixed(1) + ' ' + y(r[key]).toFixed(1)).join(' '), fill: 'none', stroke: Fig.color(cfg.palette, c), 'stroke-width': 1.8 }));
    rows.forEach(r => g.appendChild(Fig.marker(x(r.K), y(r[key]), 4, Fig.shapes[c], { fill: Fig.color(cfg.palette, c) })));
  });
  f.g.appendChild(g);
  Fig.legend(f, series.map(([k, lab, c]) => ({ label: lab, color: Fig.color(cfg.palette, c), shape: 'line' })), cfg, { pos: cfg.legendPos || 'right' });
  return svg;
};

/* ---------- 5 · BIC of k-means clustering ---------- */
P7.bic = (cfg, FC) => {
  const rows = FC.curve;
  const svg = Fig.svg(cfg.width, cfg.height, cfg.theme);
  const f = Fig.frame(svg, cfg, { margin: { left: 80, right: 30, bottom: 60, top: 56 } });
  const x = Fig.scaleLinear(0.5, rows.length + 0.5, f.x0, f.x1);
  const dom = Fig.niceDomain(Math.min(...rows.map(r => r.bic)), Math.max(...rows.map(r => r.bic)));
  const y = Fig.scaleLinear(dom[0], dom[1], f.y1, f.y0);
  Fig.axisY(f, y, Object.assign({}, cfg, { ylab: cfg.ylab || 'BIC' }));
  Fig.axisX(f, x, Object.assign({}, cfg, { xlab: cfg.xlab || 'number of clusters K', grid: false }), { ticks: rows.map(r => r.K), fmt: v => String(v) });
  const g = Fig.g();
  g.appendChild(Fig.el('path', { d: rows.map((r, i) => (i ? 'L' : 'M') + x(r.K).toFixed(1) + ' ' + y(r.bic).toFixed(1)).join(' '), fill: 'none', stroke: Fig.color(cfg.palette, 0), 'stroke-width': 2 }));
  rows.forEach(r => g.appendChild(Fig.marker(x(r.K), y(r.bic), r.K === FC.bestK ? 6.5 : 4.5, 'circle', { fill: r.K === FC.bestK ? Fig.color(cfg.palette, 1) : Fig.color(cfg.palette, 0), stroke: f.t.bg, 'stroke-width': 1 })));
  g.appendChild(Fig.text(x(FC.bestK), y(rows[FC.bestK - 1].bic) - 12, `lowest BIC at K = ${FC.bestK}`, { size: 11, anchor: 'middle', fill: Fig.color(cfg.palette, 1), font: f.font, weight: 'bold', role: 'label' }));
  f.g.appendChild(g);
  return svg;
};

/* ---------- 6 · assignment matrix ---------- */
P7.assignHeat = (cfg, A) => {
  const names = A.popNames, n = names.length;
  const svg = Fig.svg(cfg.width, cfg.height, cfg.theme);
  const f = Fig.frame(svg, cfg, { margin: { left: 130, right: 40, bottom: 120, top: 56 } });
  const cell = Math.min((f.x1 - f.x0) / n, (f.y1 - f.y0) / n);
  const cmap = Fig.colormaps[cfg.cmap] || Fig.colormaps.greens;
  const g = Fig.g();
  for (let i = 0; i < n; i++) {
    const tot = A.matrix[i].reduce((s, v) => s + v, 0) || 1;
    for (let j = 0; j < n; j++) {
      const v = A.matrix[i][j] / tot;
      const x = f.x0 + j * cell, y = f.y0 + i * cell;
      g.appendChild(Fig.el('rect', { x, y, width: cell - 2, height: cell - 2, fill: cmap(v), rx: 3, stroke: i === j ? f.t.fg : 'none', 'stroke-width': i === j ? 1.5 : 0 }));
      if (cell > 30) g.appendChild(Fig.text(x + cell / 2, y + cell / 2 + 4, cfg.counts ? String(A.matrix[i][j]) : (v * 100).toFixed(0) + '%', { size: Math.min(12, cell * 0.3), anchor: 'middle', fill: v > 0.55 ? '#fff' : f.t.fg, font: f.font, weight: i === j ? 'bold' : 'normal', role: 'label' }));
    }
  }
  names.forEach((nm, i) => {
    g.appendChild(Fig.text(f.x0 - 6, f.y0 + i * cell + cell / 2 + 4, nm, { size: 11, anchor: 'end', fill: f.t.fg, font: f.font, role: 'tick' }));
    g.appendChild(Fig.text(f.x0 + i * cell + cell / 2, f.y0 + n * cell + 8, nm, { size: 11, anchor: 'end', fill: f.t.fg, font: f.font, rotate: -45, role: 'tick' }));
  });
  g.appendChild(Fig.text(f.x0 - 6, f.y0 - 8, 'sampled in ↓', { size: 10, anchor: 'end', fill: f.t.muted, font: f.font, role: 'label' }));
  g.appendChild(Fig.text(f.x0, f.y0 - 8, 'assigned to →', { size: 10, fill: f.t.muted, font: f.font, role: 'label' }));
  f.g.appendChild(g);
  return svg;
};

/* ---------- 7 · L_home against the best other population ---------- */
P7.lod = (cfg, A) => {
  const rows = A.rows;
  const svg = Fig.svg(cfg.width, cfg.height, cfg.theme);
  const f = Fig.frame(svg, cfg, { margin: { left: 80, right: 140, bottom: 64, top: 56 } });
  const xs = rows.map(r => r.llHome), ys = rows.map(r => Math.max(...r.ll.filter((_, p) => p !== r.home)));
  const lo = Math.min(...xs, ...ys), hi = Math.max(...xs, ...ys);
  const dom = Fig.niceDomain(lo, hi);
  const x = Fig.scaleLinear(dom[0], dom[1], f.x0, f.x1), y = Fig.scaleLinear(dom[0], dom[1], f.y1, f.y0);
  Fig.axisY(f, y, Object.assign({}, cfg, { ylab: cfg.ylab || 'log-likelihood in the best other population' }));
  Fig.axisX(f, x, Object.assign({}, cfg, { xlab: cfg.xlab || 'log-likelihood in the sampling population' }));
  const g = Fig.g();
  g.appendChild(Fig.el('line', { x1: x(dom[0]), y1: y(dom[0]), x2: x(dom[1]), y2: y(dom[1]), stroke: f.t.muted, 'stroke-dasharray': '5 4', 'stroke-width': 1.3 }));
  g.appendChild(Fig.text(x(dom[1]) - 4, y(dom[1]) + 14, 'above the line: fits another population better', { size: 9.5, anchor: 'end', fill: f.t.muted, font: f.font, role: 'label' }));
  const labelled = [], plain = [];
  rows.forEach((r, i) => {
    const mig = r.pMigrant != null && r.pMigrant < (cfg.alpha || 0.01);
    g.appendChild(Fig.marker(x(xs[i]), y(ys[i]), mig ? 6.5 : 4, 'circle', { fill: Fig.alpha(Fig.color(cfg.palette, r.home), 0.8), stroke: mig ? f.t.fg : f.t.bg, 'stroke-width': mig ? 1.6 : 0.8 }));
    const pt = { x: x(xs[i]), y: y(ys[i]), text: r.id, size: 9, r: mig ? 6.5 : 4 };
    if (mig || (cfg.labelMis && r.best !== r.home)) {
      if (cfg.repel !== false) labelled.push(pt);
      else g.appendChild(Fig.text(pt.x + 6, pt.y - 5, r.id, { size: 9, fill: f.t.fg, font: f.font, role: 'label', halo: f.t.bg }));
    } else plain.push(pt);
  });
  if (labelled.length) Fig.repelLabels(g, f, labelled, { obstacles: plain });
  f.g.appendChild(g);
  Fig.legend(f, A.popNames.map((p, i) => ({ label: p, color: Fig.color(cfg.palette, i), shape: 'circle' })), cfg, { pos: cfg.legendPos || 'right' });
  return svg;
};

window.P7 = P7;
