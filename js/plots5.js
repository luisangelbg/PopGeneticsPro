/* PopGeneticsPro — Block 5 figures: the AMOVA partition, pairwise
   differentiation heat map, locus-by-locus differentiation and the
   "differentiation ladder" that compares G_ST, G′_ST, D and θ per pair. */

const P5 = {};

/* ---------- 1 · AMOVA: where the variation sits ---------- */
P5.amovaBar = (cfg, A) => {
  const svg = Fig.svg(cfg.width, cfg.height, cfg.theme);
  const f = Fig.frame(svg, cfg, { margin: { left: 30, right: 30, bottom: 30, top: 56 } });
  const parts = [];
  if (A.hier) parts.push({ key: 'a', label: 'Among regions', pct: A.pct.a, p: A.p.CT, phi: 'Φ_CT = ' + fmt(A.phi.PhiCT) });
  parts.push({ key: 'b', label: A.hier ? 'Among populations within regions' : 'Among populations', pct: A.pct.b, p: A.hier ? A.p.SC : A.p.ST, phi: (A.hier ? 'Φ_SC = ' + fmt(A.phi.PhiSC) : `Φ_${A.phiName || 'ST'} = ` + fmt(A.phi.PhiST)) });
  if (A.withinInd) parts.push({ key: 'c', label: 'Among individuals within populations', pct: A.pct.c, p: A.p.IS, phi: 'Φ_IS = ' + fmt(A.phi.PhiIS) });
  parts.push({ key: A.withinInd ? 'd' : 'c', label: A.withinInd ? 'Within individuals' : 'Within populations', pct: A.withinInd ? A.pct.d : A.pct.c, p: null, phi: '' });
  /* negative components are drawn as zero-width and reported in the label */
  const shown = parts.map(p => Object.assign({}, p, { w: Math.max(0, p.pct) }));
  const tot = shown.reduce((s, p) => s + p.w, 0) || 1;
  const barY = f.y0 + 30, barH = Math.min(64, (f.y1 - f.y0) * 0.22), W = f.x1 - f.x0;
  const g = Fig.g();
  let x = f.x0;
  shown.forEach((p, i) => {
    const w = W * p.w / tot;
    const col = Fig.color(cfg.palette, i);
    g.appendChild(Fig.el('rect', { x, y: barY, width: Math.max(0, w - 1), height: barH, fill: col, rx: 3 }));
    if (w > 46) g.appendChild(Fig.text(x + w / 2, barY + barH / 2 + 5, (p.pct * 100).toFixed(1) + '%', { size: 13, anchor: 'middle', fill: Fig.onColor(col), font: f.font, weight: 'bold', role: 'label' }));
    x += w;
  });
  g.appendChild(Fig.el('rect', { x: f.x0, y: barY, width: W, height: barH, fill: 'none', stroke: f.t.axis, 'stroke-width': 1 }));
  /* legend rows with Φ and P */
  const ly = barY + barH + 34, lh = 26;
  shown.forEach((p, i) => {
    const col = Fig.color(cfg.palette, i), yy = ly + i * lh;
    g.appendChild(Fig.el('rect', { x: f.x0, y: yy - 11, width: 14, height: 14, fill: col, rx: 3 }));
    g.appendChild(Fig.text(f.x0 + 22, yy, `${p.label}: ${(p.pct * 100).toFixed(1)}%` + (p.pct < 0 ? ' (negative component, read as 0)' : ''), { size: 12, fill: f.t.fg, font: f.font, role: 'label' }));
    const right = p.phi + (p.p != null ? `   P = ${p.p < 0.001 ? '< 0.001' : p.p.toFixed(3)}${p.p < 0.05 ? ' *' : ''}` : '');
    /* ink, not a palette colour, so the Φ of one row is never read as belonging to another segment */
    g.appendChild(Fig.text(f.x1, yy, right, { size: 12, anchor: 'end', fill: p.p != null && p.p < 0.05 ? f.t.fg : f.t.muted, font: f.font, weight: p.p != null && p.p < 0.05 ? 'bold' : 'normal', role: 'label' }));
  });
  g.appendChild(Fig.text(f.x0, ly + shown.length * lh + 6, `${A.B} permutations · ${A.loci} ${A.loci === 1 ? 'locus' : 'loci'} · ${A.N} individuals in ${A.P} populations${A.hier ? ' and ' + A.G + ' regions' : ''}` + (shown.some(p => p.p != null && p.p < 0.05) ? ' · * P < 0.05' : ''), { size: 10, fill: f.t.muted, font: f.font, role: 'label' }));
  f.g.appendChild(g);
  return svg;
};
const fmt = v => (v == null || !isFinite(v)) ? '—' : v.toFixed(3);

/* ---------- 2 · pairwise heat map, statistic below the diagonal, P above ---------- */
P5.pairHeat = (cfg, R) => {
  const stat = cfg.stat || 'theta';
  const names = R.popNames, n = names.length;
  const svg = Fig.svg(cfg.width, cfg.height, cfg.theme);
  const f = Fig.frame(svg, cfg, { margin: { left: 130, right: 100, bottom: 120, top: 56 } });
  const cell = Math.min((f.x1 - f.x0) / n, (f.y1 - f.y0) / n);
  const cmap = Fig.colormaps[cfg.cmap] || Fig.colormaps.heat;
  const look = new Map(); R.pairs.forEach(p => { look.set(p.a + ':' + p.b, p); look.set(p.b + ':' + p.a, p); });
  const vals = R.pairs.map(p => p[stat]).filter(v => v != null && isFinite(v));
  const vmax = stat === 'Nm' ? Math.max(1, ...vals) : Math.max(0.05, ...vals);
  const pKey = stat === 'phi' ? 'pPhiAdj' : 'pThetaAdj';
  const g = Fig.g();
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const x = f.x0 + j * cell, y = f.y0 + i * cell;
    if (i === j) { g.appendChild(Fig.el('rect', { x, y, width: cell - 1, height: cell - 1, fill: f.t.grid === 'none' ? f.t.bg : f.t.grid, rx: 1.5 })); continue; }
    const p = look.get(i + ':' + j);
    if (i > j) {
      const v = p ? p[stat] : null;
      const t = v == null ? 0 : Math.min(1, Math.max(0, v) / vmax);
      g.appendChild(Fig.el('rect', { x, y, width: cell - 1, height: cell - 1, fill: v == null ? f.t.bg : cmap(t), rx: 1.5 }));
      if (cell > 30 && v != null) g.appendChild(Fig.text(x + cell / 2, y + cell / 2 + 4, stat === 'Nm' ? v.toFixed(1) : v.toFixed(3), { size: Math.min(11, cell * 0.28), anchor: 'middle', fill: t > 0.55 ? '#fff' : f.t.fg, font: f.font, role: 'label' }));
    } else if (cfg.upper !== 'none') {
      const pv = p ? p[pKey] : null;
      const sig = pv != null && pv < 0.05;
      g.appendChild(Fig.el('rect', { x, y, width: cell - 1, height: cell - 1, fill: sig ? Fig.alpha(Fig.color(cfg.palette, 1), pv < 0.001 ? 0.75 : pv < 0.01 ? 0.5 : 0.28) : f.t.bg, stroke: f.t.grid === 'none' ? f.t.axis : f.t.grid, rx: 1.5 }));
      if (cell > 30 && pv != null) g.appendChild(Fig.text(x + cell / 2, y + cell / 2 + 4, pv < 0.001 ? '<0.001' : pv.toFixed(3), { size: Math.min(10, cell * 0.26), anchor: 'middle', fill: f.t.fg, font: f.font, role: 'label' }));
    }
  }
  names.forEach((nm, i) => {
    g.appendChild(Fig.text(f.x0 - 6, f.y0 + i * cell + cell / 2 + 4, nm, { size: 11, anchor: 'end', fill: f.t.fg, font: f.font, role: 'tick' }));
    g.appendChild(Fig.text(f.x0 + i * cell + cell / 2, f.y0 + n * cell + 8, nm, { size: 11, anchor: 'end', fill: f.t.fg, font: f.font, rotate: -45, role: 'tick' }));
  });
  const bx = f.x0 + n * cell + 24, bh = Math.min(180, n * cell);
  for (let k = 0; k < 40; k++) g.appendChild(Fig.el('rect', { x: bx, y: f.y0 + k * bh / 40, width: 13, height: bh / 40 + 0.6, fill: cmap(1 - k / 39) }));
  [[stat === 'Nm' ? vmax.toFixed(1) : vmax.toFixed(2), f.y0 + 4], ['0', f.y0 + bh + 4]].forEach(([t, yy]) => g.appendChild(Fig.text(bx + 18, yy, t, { size: 9, fill: f.t.fg, font: f.font, role: 'tick' })));
  g.appendChild(Fig.text(bx + 6, f.y0 - 8, statLabel(stat, R), { size: 11, anchor: 'middle', fill: f.t.muted, font: f.font, role: 'label' }));
  if (cfg.upper !== 'none') g.appendChild(Fig.text(f.x0 + n * cell, f.y0 - 8, 'above the diagonal: P (Holm-corrected)', { size: 10, anchor: 'end', fill: f.t.muted, font: f.font, role: 'label' }));
  f.g.appendChild(g);
  return svg;
};
const STAT_LABEL = { theta: 'θ (F_ST)', phi: 'Φ', Gst: 'G_ST', Gprime: "G′_ST", D: 'Jost D', Nm: 'Nm' };
/* θ and Φ are named after the marker type: F_ST and Φ_ST for genotypes, θ_B and Φ_PT for bands, θ and Φ_ST for haplotypes */
const statLabel = (stat, R) => {
  if (stat === 'theta') return R.codom ? 'θ (F_ST)' : R.kind === 'dominant' ? 'θ_B' : 'θ';
  if (stat === 'phi') return 'Φ_' + (R.kind === 'dominant' ? 'PT' : 'ST');
  return STAT_LABEL[stat] || stat;
};

/* ---------- 3 · differentiation locus by locus ---------- */
P5.locusBars = (cfg, R) => {
  const key = cfg.stat || 'theta';
  const rows = R.perLocus.filter(x => x[key] != null && isFinite(x[key]));
  const sorted = cfg.sort === 'value' ? rows.slice().sort((a, b) => b[key] - a[key]) : rows;
  const svg = Fig.svg(cfg.width, cfg.height, cfg.theme);
  const multi = R.multi[key], ci = R.ci[key];
  const lo = Math.min(0, ...rows.map(x => x[key]), ci ? ci[0] : 0), hi = Math.max(0.05, ...rows.map(x => x[key]), ci ? ci[1] : 0);
  const dom = Fig.niceDomain(lo, hi, true);
  const C = Fig.bandPlot(svg, cfg, sorted.map(x => x.locus), dom, { valueLabel: statLabel(key, R) });
  const f = C.f;
  const g = Fig.g();
  if (ci && cfg.showCI !== false) g.appendChild(C.span(ci[0], ci[1], { fill: Fig.alpha(Fig.color(cfg.palette, 1), 0.14) }));
  sorted.forEach((x, i) => {
    const v = x[key];
    const outlier = ci && (v > ci[1] * 2 + 0.02);
    g.appendChild(C.bar(i, v, { fill: outlier ? Fig.color(cfg.palette, 1) : Fig.color(cfg.palette, 0), rx: 2 }));
    if (cfg.values !== false) g.appendChild(C.valueText(C.center(i), v, v.toFixed(3)));
  });
  if (multi != null) {
    g.appendChild(C.ref(multi, { stroke: Fig.color(cfg.palette, 1), 'stroke-width': 1.8, 'stroke-dasharray': '6 4' }));
    g.appendChild(C.refLabel(multi, `multilocus ${multi.toFixed(3)}` + (ci ? ` (${ci[0].toFixed(3)}–${ci[1].toFixed(3)})` : ''), { size: 10.5, fill: Fig.color(cfg.palette, 1), weight: 'bold' }));
  }
  g.appendChild(C.ref(0, { stroke: f.t.axis, 'stroke-width': 1 }));
  f.g.appendChild(g);
  return svg;
};

/* ---------- 4 · the ladder: four estimators per population pair ---------- */
P5.ladder = (cfg, R) => {
  const keys = ['Gst', 'Gprime', 'D', R.codom ? 'theta' : 'phi'];
  const labels = { Gst: 'G_ST', Gprime: "G′_ST", D: 'Jost D', theta: statLabel('theta', R), phi: statLabel('phi', R) };
  let pairs = R.pairs.slice();
  if (cfg.sort !== 'file') pairs.sort((a, b) => (b.D || 0) - (a.D || 0));
  pairs = pairs.slice(0, +cfg.maxPairs || 20);
  const svg = Fig.svg(cfg.width, cfg.height, cfg.theme);
  const vals = [].concat(...pairs.map(p => keys.map(k => p[k]))).filter(v => v != null && isFinite(v));
  const dom = Fig.niceDomain(Math.min(0, ...vals), Math.max(0.05, ...vals), true);
  const C = Fig.bandPlot(svg, cfg, pairs.map(p => p.popA + ' × ' + p.popB), dom, { valueLabel: 'differentiation', padding: 0.28, rotate: -35, legendLabels: keys.map(k => labels[k]) });
  const f = C.f;
  const g = Fig.g();
  const bw = C.bw / keys.length;
  pairs.forEach((p, i) => keys.forEach((k, j) => {
    const v = p[k]; if (v == null || !isFinite(v)) return;
    g.appendChild(C.rect(C.start(i) + j * bw, bw - 1, 0, v, { fill: Fig.color(cfg.palette, j), rx: 1.5 }));
  }));
  g.appendChild(C.ref(0, { stroke: f.t.axis, 'stroke-width': 1 }));
  f.g.appendChild(g);
  Fig.legend(f, keys.map((k, j) => ({ label: labels[k], color: Fig.color(cfg.palette, j) })), cfg, { pos: cfg.legendPos || 'right' });
  return svg;
};

window.P5 = P5;
window.STAT_LABEL5 = STAT_LABEL;
