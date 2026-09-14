/* PopGeneticsPro — Block 4 figures: the HWE matrix, F_IS forest plot, F_IS by
   locus (the inbreeding-versus-null-allele diagnostic), null allele heat map,
   pairwise LD triangle and the r̄_d permutation histogram. */

const P4 = {};

/* ---------- 1 · HWE tests: locus × population ---------- */
P4.hweMatrix = (cfg, R) => {
  const test = cfg.test || 'pAdj';
  const nL = R.nLoci, nP = R.pops.length;
  const H = Math.max(300, 130 + nL * (+cfg.rowH || 18));
  const svg = Fig.svg(cfg.width, H, cfg.theme);
  const f = Fig.frame(svg, cfg, { margin: { left: 130, right: 30, bottom: 118, top: 56 } });
  const cw = (f.x1 - f.x0) / nP, ch = (f.y1 - f.y0) / nL;
  const base = Fig.color(cfg.palette, 1);
  const g = Fig.g();
  for (let l = 0; l < nL; l++) {
    for (let p = 0; p < nP; p++) {
      const c = R.cells[p][l];
      const pv = c[test];
      let fill = f.t.bg, txt = '', tcol = f.t.muted;
      if (pv == null) { txt = '·'; }
      else if (pv < 0.001) { fill = base; txt = c.FisNC > 0 ? '−' : '+'; tcol = '#fff'; }
      else if (pv < 0.01) { fill = Fig.alpha(base, 0.7); txt = c.FisNC > 0 ? '−' : '+'; tcol = '#fff'; }
      else if (pv < cfg.alpha) { fill = Fig.alpha(base, 0.38); txt = c.FisNC > 0 ? '−' : '+'; tcol = f.t.fg; }
      g.appendChild(Fig.el('rect', { x: f.x0 + p * cw, y: f.y0 + l * ch, width: cw - 1.5, height: ch - 1.5, fill, stroke: f.t.grid === 'none' ? f.t.axis : f.t.grid, rx: 2 }));
      if (cfg.showP && cw > 46 && ch > 11 && pv != null)
        g.appendChild(Fig.text(f.x0 + p * cw + cw / 2, f.y0 + l * ch + ch / 2 + 3.5, pv < 0.0001 ? '<0.0001' : pv.toFixed(3), { size: Math.min(9.5, ch * 0.7), anchor: 'middle', fill: tcol, font: f.font, role: 'label' }));
      else if (txt)
        g.appendChild(Fig.text(f.x0 + p * cw + cw / 2, f.y0 + l * ch + ch / 2 + 4.5, txt, { size: Math.min(13, ch * 0.9), anchor: 'middle', fill: tcol, font: f.font, weight: 'bold', role: 'label' }));
      if (c.smallExpected && test.startsWith('pChi'))
        g.appendChild(Fig.el('circle', { cx: f.x0 + p * cw + cw - 6, cy: f.y0 + l * ch + 6, r: 2, fill: Fig.color(cfg.palette, 2) }));
    }
    g.appendChild(Fig.text(f.x0 - 6, f.y0 + l * ch + ch / 2 + 3.5, R.locusNames[l], { size: Math.min(11, ch * 0.8), anchor: 'end', fill: f.t.fg, font: f.font, role: 'tick' }));
  }
  R.pops.forEach((p, i) => g.appendChild(Fig.text(f.x0 + i * cw + cw / 2, f.y1 + 8, p, { size: 10.5, anchor: 'end', fill: f.t.fg, font: f.font, rotate: -40, role: 'tick' })));
  f.g.appendChild(g);
  Fig.legend(f, [
    { label: `P < ${cfg.alpha}`, color: Fig.alpha(base, 0.38) }, { label: 'P < 0.01', color: Fig.alpha(base, 0.7) },
    { label: 'P < 0.001', color: base }, { label: '− deficit  + excess of heterozygotes', color: f.t.bg },
  ], cfg, { pos: 'bottom' });
  return svg;
};

/* ---------- 2 · multilocus F_IS per population with 95% CI ---------- */
P4.fisForest = (cfg, R) => {
  const rows = R.perPop.slice();
  if (cfg.sort === 'value') rows.sort((a, b) => (b.f ?? 0) - (a.f ?? 0));
  const H = Math.max(280, 120 + rows.length * (+cfg.rowH || 34));
  const svg = Fig.svg(cfg.width, H, cfg.theme);
  const f = Fig.frame(svg, cfg, { margin: { left: 150, right: 40, bottom: 60, top: 56 } });
  let lo = -0.2, hi = 0.4;
  rows.forEach(r => { if (r.ci) { lo = Math.min(lo, r.ci[0]); hi = Math.max(hi, r.ci[1]); } if (r.f != null) { lo = Math.min(lo, r.f); hi = Math.max(hi, r.f); } });
  if (cfg.showLoci !== false) R.cells.forEach(row => row.forEach(c => { if (c.FisNC != null && isFinite(c.FisNC)) { lo = Math.min(lo, c.FisNC); hi = Math.max(hi, c.FisNC); } }));
  const dom = Fig.niceDomain(lo, hi);
  const x = Fig.scaleLinear(dom[0], dom[1], f.x0, f.x1);
  const band = Fig.scaleBand(rows.map(r => r.pop), f.y0, f.y1, 0.3);
  Fig.axisX(f, x, Object.assign({}, cfg, { xlab: cfg.xlab || 'F_IS (Weir & Cockerham f, multilocus)' }));
  const g = Fig.g();
  g.appendChild(Fig.el('line', { x1: x(0), x2: x(0), y1: f.y0, y2: f.y1, stroke: f.t.fg, 'stroke-width': 1.2, 'stroke-dasharray': '5 4' }));
  rows.forEach((r, i) => {
    const y = band.center(i);
    const pi = R.pops.indexOf(r.pop);
    const col = Fig.color(cfg.palette, i);
    g.appendChild(Fig.text(f.x0 - 8, y + 4, r.pop, { size: 11, anchor: 'end', fill: f.t.fg, font: f.font, role: 'tick' }));
    /* single-locus values spread vertically in locus order, so the figure is the same at every redraw */
    if (cfg.showLoci !== false && pi >= 0) {
      const nL = R.cells[pi].length;
      R.cells[pi].forEach((c, l) => { if (c.FisNC != null && isFinite(c.FisNC)) g.appendChild(Fig.el('circle', { cx: x(c.FisNC), cy: y + (nL > 1 ? (l / (nL - 1) - 0.5) : 0) * band.bandwidth * 0.5, r: 2.4, fill: Fig.alpha(col, 0.35) })); });
    }
    if (r.ci) g.appendChild(Fig.el('line', { x1: x(r.ci[0]), x2: x(r.ci[1]), y1: y, y2: y, stroke: col, 'stroke-width': 2.4 }));
    if (r.f != null) g.appendChild(Fig.marker(x(r.f), y, 5.5, 'diamond', { fill: col, stroke: f.t.bg, 'stroke-width': 1 }));
    const excludesZero = r.ci && (r.ci[0] > 0 || r.ci[1] < 0);
    if (cfg.values !== false && r.f != null)
      g.appendChild(Fig.text(x(r.ci ? r.ci[1] : r.f) + 8, y + 4, r.f.toFixed(3) + (excludesZero ? ' *' : ''), { size: 10.5, fill: f.t.fg, font: f.font, weight: 'bold', role: 'label', halo: f.t.bg }));
  });
  if (cfg.values !== false && rows.some(r => r.ci && (r.ci[0] > 0 || r.ci[1] < 0)))
    g.appendChild(Fig.text(f.x1, f.y0 - 8, '* the 95% interval excludes zero', { size: 9.5, anchor: 'end', fill: f.t.muted, font: f.font, role: 'label' }));
  f.g.appendChild(g);
  return svg;
};

/* ---------- 3 · F_IS locus by locus: inbreeding or null alleles? ---------- */
P4.fisByLocus = (cfg, R) => {
  const nL = R.nLoci;
  const svg = Fig.svg(cfg.width, cfg.height, cfg.theme);
  let lo = -0.3, hi = 0.5;
  R.cells.forEach(row => row.forEach(c => { if (c.FisNC != null && isFinite(c.FisNC)) { lo = Math.min(lo, c.FisNC); hi = Math.max(hi, c.FisNC); } }));
  const dom = Fig.niceDomain(lo, hi);
  const C = Fig.bandPlot(svg, cfg, R.locusNames, dom, { valueLabel: 'F_IS (Nei & Chesser) per population', margin: { right: 200 },
    legendLabels: R.pops.concat(['locus mean', 'outlined: out of HWE', '? suspected null allele']) });
  const f = C.f;
  const g = Fig.g();
  g.appendChild(C.ref(0, { stroke: f.t.fg, 'stroke-width': 1.2, 'stroke-dasharray': '5 4' }));
  /* per-locus mean as a neutral bar behind the points; populations keep the
     colours they have in the F_IS forest plot, and a flagged locus takes the
     first colour not used by a population */
  const flagCol = Fig.color(cfg.palette, R.pops.length);
  R.perLocus.forEach((pl, l) => {
    if (pl.meanFis == null) return;
    g.appendChild(C.bar(l, pl.meanFis, { fill: pl.suspectNull ? Fig.alpha(flagCol, 0.3) : Fig.alpha(f.t.fg, 0.1), rx: 2 }));
    if (pl.suspectNull) g.appendChild(C.textAt(C.center(l), dom[1] - (dom[1] - dom[0]) * (C.flip ? 0.02 : 0.04), '?', { size: 12, fill: flagCol, weight: 'bold' }));
  });
  R.cells.forEach((row, p) => row.forEach((c, l) => {
    if (c.FisNC == null || !isFinite(c.FisNC)) return;
    const sig = c.pAdj != null && c.pAdj < cfg.alpha;
    g.appendChild(C.marker(C.center(l) + (p - (R.pops.length - 1) / 2) * Math.min(6, C.bw / (R.pops.length + 1)), c.FisNC, sig ? 4.6 : 3.4, 'circle',
      { fill: sig ? Fig.color(cfg.palette, p) : Fig.alpha(Fig.color(cfg.palette, p), 0.55), stroke: sig ? f.t.fg : 'none', 'stroke-width': 0.8 }));
  }));
  f.g.appendChild(g);
  const items = R.pops.map((p, i) => ({ label: p, color: Fig.color(cfg.palette, i), shape: 'circle' }));
  items.push({ label: 'locus mean', color: Fig.alpha(f.t.fg, 0.18) });
  if (R.cells.some(row => row.some(c => c.pAdj != null && c.pAdj < cfg.alpha))) items.push({ label: 'outlined: out of HWE', color: f.t.bg, shape: 'circle', stroke: f.t.fg });
  if (R.perLocus.some(pl => pl.suspectNull)) items.push({ label: '? suspected null allele', color: Fig.alpha(flagCol, 0.5) });
  Fig.legend(f, items, cfg, { pos: cfg.legendPos || 'right' });
  return svg;
};

/* ---------- 4 · null allele frequency heat map ---------- */
P4.nullHeat = (cfg, R) => {
  const key = cfg.estimator || 'nullEM';
  const nL = R.nLoci, nP = R.pops.length;
  const H = Math.max(300, 130 + nL * (+cfg.rowH || 18));
  const svg = Fig.svg(cfg.width, H, cfg.theme);
  const f = Fig.frame(svg, cfg, { margin: { left: 130, right: 90, bottom: 118, top: 56 } });
  const cw = (f.x1 - f.x0) / nP, ch = (f.y1 - f.y0) / nL;
  const cmap = Fig.colormaps[cfg.cmap] || Fig.colormaps.heat;
  const top = +cfg.top || 0.3;
  const g = Fig.g();
  for (let l = 0; l < nL; l++) {
    for (let p = 0; p < nP; p++) {
      const v = R.cells[p][l][key];
      const vv = v == null ? null : Math.max(0, v);
      g.appendChild(Fig.el('rect', { x: f.x0 + p * cw, y: f.y0 + l * ch, width: cw - 1.5, height: ch - 1.5, fill: vv == null ? f.t.bg : cmap(Math.min(1, vv / top)), rx: 2, stroke: f.t.grid === 'none' ? f.t.axis : f.t.grid }));
      if (cfg.values !== false && cw > 40 && ch > 11 && v != null)
        g.appendChild(Fig.text(f.x0 + p * cw + cw / 2, f.y0 + l * ch + ch / 2 + 3.5, v.toFixed(3), { size: Math.min(9.5, ch * 0.7), anchor: 'middle', fill: vv / top > 0.55 ? '#fff' : f.t.fg, font: f.font, role: 'label' }));
    }
    g.appendChild(Fig.text(f.x0 - 6, f.y0 + l * ch + ch / 2 + 3.5, R.locusNames[l], { size: Math.min(11, ch * 0.8), anchor: 'end', fill: f.t.fg, font: f.font, role: 'tick' }));
  }
  R.pops.forEach((p, i) => g.appendChild(Fig.text(f.x0 + i * cw + cw / 2, f.y1 + 8, p, { size: 10.5, anchor: 'end', fill: f.t.fg, font: f.font, rotate: -40, role: 'tick' })));
  const bx = f.x1 + 22, bh = Math.min(160, f.y1 - f.y0);
  for (let k = 0; k < 40; k++) g.appendChild(Fig.el('rect', { x: bx, y: f.y0 + k * bh / 40, width: 13, height: bh / 40 + 0.6, fill: cmap(1 - k / 39) }));
  [[top.toFixed(2) + '+', f.y0 + 4], [(top / 2).toFixed(2), f.y0 + bh / 2 + 4], ['0', f.y0 + bh + 4]].forEach(([t, yy]) => g.appendChild(Fig.text(bx + 18, yy, t, { size: 9, fill: f.t.fg, font: f.font, role: 'tick' })));
  f.g.appendChild(g);
  return svg;
};

/* ---------- 5 · pairwise LD triangle ---------- */
P4.ldTriangle = (cfg, R, pair) => {
  const stat = cfg.stat || 'rd';
  const names = R.locusNames, nL = names.length;
  const svg = Fig.svg(cfg.width, cfg.height, cfg.theme);
  const f = Fig.frame(svg, cfg, { margin: { left: 130, right: 100, bottom: 120, top: 56 } });
  const cmap = Fig.colormaps[cfg.cmap] || Fig.colormaps.viridis;
  const lookup = new Map();
  pair.pairs.forEach(p => { lookup.set(p.a + ':' + p.b, p); lookup.set(p.b + ':' + p.a, p); });
  const scaleMax = stat === 'rd' ? Math.max(0.1, ...pair.pairs.map(p => Math.abs(p.rd || 0))) : 1;
  const g = Fig.g();
  /* lower triangle without the diagonal: rows are loci 2…L, columns loci 1…L−1,
     so no row or column is left empty */
  const n = Math.max(1, nL - 1);
  const cellFit = Math.min((f.x1 - f.x0) / n, (f.y1 - f.y0) / n);
  for (let a = 1; a < nL; a++) for (let b = 0; b < a; b++) {
    const p = lookup.get(a + ':' + b);
    if (!p) continue;
    const v = stat === 'rd' ? p.rd : stat === 'r2' ? p.r2 : p.Dprime;
    const x = f.x0 + b * cellFit, y = f.y0 + (a - 1) * cellFit;
    /* a pair with a locus monomorphic in this sample has no r̄_d: light grey, not white */
    g.appendChild(Fig.el('rect', { x, y, width: Math.max(0.5, cellFit - 1), height: Math.max(0.5, cellFit - 1), fill: v == null ? Fig.alpha(f.t.fg, 0.1) : cmap(Math.min(1, Math.max(0, (stat === 'rd' ? Math.max(0, v) : v) / scaleMax))), rx: cellFit > 6 ? 1.5 : 0 }));
    const pv = stat === 'rd' ? p.pAdj : p.pChi;
    if (cfg.stars !== false && pv != null && pv < cfg.alpha && cellFit > 9)
      g.appendChild(Fig.text(x + cellFit / 2, y + cellFit / 2 + 3.5, pv < 0.001 ? '***' : pv < 0.01 ? '**' : '*', { size: Math.min(10, cellFit * 0.6), anchor: 'middle', fill: (v || 0) / scaleMax > 0.5 ? '#fff' : f.t.fg, font: f.font, role: 'label' }));
  }
  /* with many loci the names would overprint: label every k-th one */
  const tick = Math.max(7.5, Math.min(11, cellFit * 0.75));
  const every = Math.max(1, Math.ceil((tick + 2) / cellFit));
  names.forEach((nm, i) => {
    if (i > 0 && (i - 1) % every === 0) g.appendChild(Fig.text(f.x0 - 6, f.y0 + (i - 1) * cellFit + cellFit / 2 + tick * 0.35, nm, { size: tick, anchor: 'end', fill: f.t.fg, font: f.font, role: 'tick' }));
    if (i < nL - 1 && i % every === 0) g.appendChild(Fig.text(f.x0 + i * cellFit + cellFit / 2, f.y0 + n * cellFit + 8, nm, { size: tick, anchor: 'end', fill: f.t.fg, font: f.font, rotate: -45, role: 'tick' }));
  });
  if (pair.pairs.some(p => (stat === 'rd' ? p.rd : stat === 'r2' ? p.r2 : p.Dprime) == null)) {
    const yy = f.y0 + Math.min(180, n * cellFit) + 44;
    g.appendChild(Fig.el('rect', { x: f.x0 + n * cellFit + 24, y: yy - 9, width: 11, height: 11, fill: Fig.alpha(f.t.fg, 0.1) }));
    g.appendChild(Fig.text(f.x0 + n * cellFit + 40, yy, 'not defined', { size: 9.5, fill: f.t.muted, font: f.font, role: 'label' }));
    g.appendChild(Fig.text(f.x0 + n * cellFit + 40, yy + 12, '(monomorphic)', { size: 9.5, fill: f.t.muted, font: f.font, role: 'label' }));
  }
  const bx = f.x0 + n * cellFit + 24, bh = Math.min(180, n * cellFit);
  for (let k = 0; k < 40; k++) g.appendChild(Fig.el('rect', { x: bx, y: f.y0 + k * bh / 40, width: 13, height: bh / 40 + 0.6, fill: cmap(1 - k / 39) }));
  [[scaleMax.toFixed(2), f.y0 + 4], [(scaleMax / 2).toFixed(2), f.y0 + bh / 2 + 4], ['0', f.y0 + bh + 4]].forEach(([t, yy]) => g.appendChild(Fig.text(bx + 18, yy, t, { size: 9.5, fill: f.t.fg, font: f.font, role: 'tick' })));
  g.appendChild(Fig.text(bx + 6, f.y0 - 10, stat === 'rd' ? 'r̄_d' : stat === 'r2' ? 'r²' : "D′", { size: 11.5, anchor: 'middle', fill: f.t.muted, font: f.font, role: 'label' }));
  if (cfg.stars !== false && pair.pairs.some(p => { const pv = stat === 'rd' ? p.pAdj : p.pChi; return pv != null && pv < cfg.alpha; }))
    g.appendChild(Fig.text(bx - 6, f.y0 + bh + 80, stat === 'rd' ? '* significant after correction' : '* χ² P below α', { size: 9.5, fill: f.t.muted, font: f.font, role: 'label' }));
  f.g.appendChild(g);
  return svg;
};

/* ---------- 6 · permutation distribution of r̄_d ---------- */
P4.rdHistogram = (cfg, ld) => {
  const svg = Fig.svg(cfg.width, cfg.height, cfg.theme);
  const f = Fig.frame(svg, cfg, { margin: { left: 74, right: 30, bottom: 64, top: 56 } });
  const perms = ld.perms || [];
  if (!perms.length || ld.rd == null) {
    f.g.appendChild(Fig.text(f.W / 2, f.H / 2, 'No permutations were run for this sample.', { size: 13, anchor: 'middle', fill: f.t.muted, font: f.font }));
    return svg;
  }
  const lo = Math.min(...perms, ld.rd), hi = Math.max(...perms, ld.rd);
  const dom = Fig.niceDomain(lo, hi);
  const nb = +cfg.bins || 30;
  const counts = new Array(nb).fill(0);
  perms.forEach(v => counts[Math.min(nb - 1, Math.max(0, Math.floor((v - dom[0]) / (dom[1] - dom[0]) * nb)))]++);
  const x = Fig.scaleLinear(dom[0], dom[1], f.x0, f.x1);
  const y = Fig.scaleLinear(0, Math.max(...counts) * 1.15, f.y1, f.y0);
  Fig.axisY(f, y, Object.assign({}, cfg, { ylab: cfg.ylab || 'permutations' }));
  Fig.axisX(f, x, Object.assign({}, cfg, { xlab: cfg.xlab || 'r̄_d under free recombination', grid: false }));
  const g = Fig.g();
  const w = (f.x1 - f.x0) / nb;
  counts.forEach((c, i) => g.appendChild(Fig.el('rect', { x: f.x0 + i * w + 0.5, y: y(c), width: w - 1, height: f.y1 - y(c), fill: Fig.alpha(Fig.color(cfg.palette, 0), 0.7), rx: 1.5 })));
  g.appendChild(Fig.el('line', { x1: x(ld.rd), x2: x(ld.rd), y1: f.y0, y2: f.y1, stroke: Fig.color(cfg.palette, 1), 'stroke-width': 2.4 }));
  g.appendChild(Fig.text(x(ld.rd) + (ld.rd > (dom[0] + dom[1]) / 2 ? -6 : 6), f.y0 + 14, `observed r̄_d = ${ld.rd.toFixed(4)}  ·  P = ${ld.p.toFixed(4)}`, { size: 11, anchor: ld.rd > (dom[0] + dom[1]) / 2 ? 'end' : 'start', fill: Fig.color(cfg.palette, 1), font: f.font, weight: 'bold', role: 'label' }));
  f.g.appendChild(g);
  return svg;
};

window.P4 = P4;
