/* PopGeneticsPro — Block 3 figures: diversity per population, allele frequency
   profiles, rarefaction curves, the Ho–He plot and private alleles. */

const P3 = {};

const IDX_LABEL = {
  Na: 'Na · number of alleles', NaF5: 'Na ≥ 5% · common alleles', Ne: 'Ne · effective alleles',
  I: "I · Shannon's information index", Ho: 'Ho · observed heterozygosity',
  He: 'He · expected heterozygosity', uHe: 'uHe · unbiased expected heterozygosity',
  F: 'F · fixation index', PIC: 'PIC · polymorphic information content',
  Ar: 'Ar · rarefied allelic richness', P: '%P · polymorphic loci', private: 'Private alleles',
};

/* ---------- 1 · one index, every population, with error bars ---------- */
P3.diversityBars = (cfg, R) => {
  const key = cfg.index || 'He';
  const rows = R.popSummary.slice();
  if (cfg.sort === 'value') rows.sort((a, b) => (b[key] ?? -Infinity) - (a[key] ?? -Infinity));
  const svg = Fig.svg(cfg.width, cfg.height, cfg.theme);
  const vals = rows.map(r => r[key]).filter(v => v != null && isFinite(v));
  const errs = rows.map(r => errorOf(r, key, cfg));
  const hi = Math.max(...vals, ...rows.map((r, i) => (r[key] ?? 0) + (errs[i] ? errs[i][1] : 0)));
  const lo = Math.min(0, ...vals, ...rows.map((r, i) => (r[key] ?? 0) - (errs[i] ? errs[i][0] : 0)));
  const dom = Fig.niceDomain(lo, hi, true);
  const regions = [...new Set(rows.map(r => r.region || ''))].filter(Boolean);
  const C = Fig.bandPlot(svg, cfg, rows.map(r => r.pop), dom, { valueLabel: IDX_LABEL[key] || key, padding: 0.32, margin: { left: 78 },
    legendLabels: cfg.colourByRegion && regions.length > 1 ? regions : null });
  const f = C.f;

  const g = Fig.g();
  rows.forEach((r, i) => {
    const v = r[key];
    if (v == null || !isFinite(v)) return;
    const col = cfg.colourByRegion && r.region ? Fig.color(cfg.palette, regions.indexOf(r.region)) : Fig.color(cfg.palette, cfg.oneColour ? 0 : i);
    g.appendChild(C.bar(i, v, { fill: col, rx: 3 }));
    const e = cfg.errors !== 'none' ? errs[i] : null;
    if (e) g.appendChild(C.whisker(C.center(i), v - e[0], v + e[1], Math.min(11, C.bw * 0.3), { stroke: f.t.fg, 'stroke-width': 1.3 }));
    if (cfg.values !== false)
      g.appendChild(C.valueText(C.center(i), e ? (v >= 0 ? v + e[1] : v - e[0]) : v, fmtVal(v, key)));
  });
  /* overall mean as a reference line */
  if (cfg.overallLine !== false && R.overall && R.overall[key] != null && isFinite(R.overall[key])) {
    const v = R.overall[key];
    g.appendChild(C.ref(v, { stroke: Fig.color(cfg.palette, 1), 'stroke-width': 1.4, 'stroke-dasharray': '6 4' }));
    g.appendChild(C.refLabel(v, 'pooled: ' + fmtVal(v, key), { fill: Fig.color(cfg.palette, 1) }));
  }
  f.g.appendChild(g);
  if (cfg.colourByRegion && regions.length > 1)
    Fig.legend(f, regions.map((r, i) => ({ label: r, color: Fig.color(cfg.palette, i) })), cfg, { pos: cfg.legendPos || 'right' });
  return svg;
};
function errorOf(r, key, cfg) {
  if (cfg.errors === 'ci' && r.ci && r.ci[key] && r[key] != null) return [r[key] - r.ci[key][0], r.ci[key][1] - r[key]];
  const s = r['se' + key];
  return s != null && isFinite(s) ? [s, s] : null;
}
function fmtVal(v, key) {
  if (key === 'P') return (v * 100).toFixed(1) + '%';
  if (key === 'Na' || key === 'NaF5' || key === 'private') return v.toFixed(v % 1 ? 2 : 0);
  return v.toFixed(3);
}

/* ---------- 2 · allele frequencies ---------- */
/* one locus at a time: stacked bars, one column per population */
P3.alleleFreq = (cfg, R) => {
  const l = Math.min(R.nLoci - 1, Math.max(0, +cfg.locus || 0));
  const rows = R.freqRows.filter(r => r.locus === R.locusNames[l]);
  const svg = Fig.svg(cfg.width, cfg.height, cfg.theme);
  const pops = R.popNames.concat(cfg.showPooled !== false ? ['Pooled'] : []);
  const C = Fig.bandPlot(svg, cfg, pops, [0, 1], { valueLabel: 'allele frequency', margin: { right: 128 }, legendLabels: rows.map(r => String(r.allele) + (r.privateTo ? ' ◆' : '')) });
  const f = C.f;
  const g = Fig.g();
  pops.forEach((pop, pi) => {
    let acc = 0;
    rows.forEach((r, ai) => {
      const v = pi < R.nPops ? r['p' + pi] : r.overall;
      if (!v) return;
      const len = Math.abs(C.val(acc) - C.val(acc + v));
      const col = Fig.color(cfg.palette, ai);
      g.appendChild(C.bar(pi, acc + v, { fill: col, stroke: f.t.bg, 'stroke-width': 0.6 }, acc));
      if (cfg.values !== false && len > (C.flip ? 30 : 13) && C.bw > (C.flip ? 13 : 26))
        g.appendChild(C.textAt(C.center(pi), acc + v / 2, v.toFixed(2), { size: 9, fill: Fig.onColor(col) }));
      acc += v;
    });
  });
  f.g.appendChild(g);
  Fig.legend(f, rows.map((r, ai) => ({
    label: String(r.allele) + (r.privateTo ? ' ◆' : ''), color: Fig.color(cfg.palette, ai),
  })), cfg, { pos: cfg.legendPos || 'right' });
  const note = rows.some(r => r.privateTo) ? '◆ private allele' : '';
  if (note) f.g.appendChild(Fig.text(f.x0, f.H - 8, note, { size: 10, fill: f.t.muted, font: f.font, role: 'label' }));
  return svg;
};

/* ---------- 3 · heat map of allele frequencies ---------- */
P3.freqHeat = (cfg, R) => {
  let rows = R.freqRows;
  if (cfg.onlyLocus && cfg.onlyLocus !== 'all') rows = rows.filter(r => r.locus === cfg.onlyLocus);
  if (cfg.minFreq) rows = rows.filter(r => r.overall >= +cfg.minFreq);
  const maxRows = +cfg.maxRows || 60;
  const trimmed = rows.length > maxRows;
  if (trimmed) rows = rows.slice().sort((a, b) => b.overall - a.overall).slice(0, maxRows);
  const H = Math.max(320, 120 + rows.length * (+cfg.rowH || 13));
  const svg = Fig.svg(cfg.width, H, cfg.theme);
  const f = Fig.frame(svg, cfg, { margin: { left: 140, right: 84, bottom: 108, top: 56 } });
  const cw = (f.x1 - f.x0) / Math.max(1, R.nPops);
  const ch = (f.y1 - f.y0) / Math.max(1, rows.length);
  const cmap = Fig.colormaps[cfg.cmap] || Fig.colormaps.viridis;
  const g = Fig.g();
  rows.forEach((r, i) => {
    for (let p = 0; p < R.nPops; p++) {
      const v = r['p' + p] || 0;
      g.appendChild(Fig.el('rect', { x: f.x0 + p * cw, y: f.y0 + i * ch, width: cw - 0.5, height: Math.max(1, ch - 0.5), fill: v === 0 ? f.t.bg : cmap(v) }));
      if (cfg.values && ch > 11 && cw > 34)
        g.appendChild(Fig.text(f.x0 + p * cw + cw / 2, f.y0 + i * ch + ch / 2 + 3, v ? v.toFixed(2) : '', { size: 8, anchor: 'middle', fill: v > 0.5 ? '#fff' : f.t.fg, font: f.font, role: 'label' }));
    }
    if (ch > 7) g.appendChild(Fig.text(f.x0 - 6, f.y0 + i * ch + ch / 2 + 3, `${r.locus} · ${r.allele}`,
      { size: Math.min(10, ch * 0.85), anchor: 'end', fill: r.privateTo ? Fig.color(cfg.palette, 1) : f.t.fg, font: f.font, role: 'tick' }));
  });
  R.popNames.forEach((p, i) => g.appendChild(Fig.text(f.x0 + i * cw + cw / 2, f.y1 + 8, p,
    { size: 10, anchor: 'end', fill: f.t.fg, font: f.font, rotate: -45, role: 'tick' })));
  /* colour bar */
  const bx = f.x1 + 22, bh = Math.min(180, f.y1 - f.y0);
  for (let k = 0; k < 40; k++) g.appendChild(Fig.el('rect', { x: bx, y: f.y0 + k * bh / 40, width: 13, height: bh / 40 + 0.6, fill: cmap(1 - k / 39) }));
  [['1.0', f.y0 + 4], ['0.5', f.y0 + bh / 2 + 4], ['0', f.y0 + bh + 4]].forEach(([t, yy]) =>
    g.appendChild(Fig.text(bx + 18, yy, t, { size: 9, fill: f.t.fg, font: f.font, role: 'tick' })));
  g.appendChild(Fig.text(bx + 6, f.y0 - 8, 'freq', { size: 10, anchor: 'middle', fill: f.t.muted, font: f.font, role: 'label' }));
  f.g.appendChild(g);
  if (trimmed) f.g.appendChild(Fig.text(f.x0, f.H - 8, `showing the ${maxRows} most frequent alleles of ${R.freqRows.length}`, { size: 10, fill: f.t.muted, font: f.font, role: 'label' }));
  return svg;
};

/* ---------- 4 · rarefaction curves ---------- */
P3.rarefaction = (cfg, R) => {
  const svg = Fig.svg(cfg.width, cfg.height, cfg.theme);
  const f = Fig.frame(svg, cfg, { margin: { left: 74, right: 140, bottom: 64, top: 56 } });
  if (!R.rarefaction) {
    f.g.appendChild(Fig.text(f.W / 2, f.H / 2, 'Rarefaction is not defined for dominant markers.', { size: 13, anchor: 'middle', fill: f.t.muted, font: f.font }));
    return svg;
  }
  const { sizes, curves } = R.rarefaction;
  const allV = [].concat(...curves.map(c => c.values.filter(v => v != null)));
  const y = Fig.scaleLinear(0, Math.max(...allV) * 1.08, f.y1, f.y0);
  const x = Fig.scaleLinear(sizes[0], sizes[sizes.length - 1], f.x0, f.x1);
  Fig.axisY(f, y, Object.assign({}, cfg, { ylab: cfg.ylab || 'expected number of alleles' }));
  Fig.axisX(f, x, Object.assign({}, cfg, { xlab: cfg.xlab || 'gene copies sampled', grid: false }));
  const g = Fig.g();
  curves.forEach((c, i) => {
    const pts = [];
    c.values.forEach((v, k) => { if (v != null) pts.push([x(sizes[k]), y(v)]); });
    if (!pts.length) return;
    g.appendChild(Fig.el('path', {
      d: pts.map((p, k) => (k ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' '),
      fill: 'none', stroke: Fig.color(cfg.palette, i), 'stroke-width': 2.2,
    }));
    const last = pts[pts.length - 1];
    g.appendChild(Fig.marker(last[0], last[1], 3.4, 'circle', { fill: Fig.color(cfg.palette, i) }));
  });
  /* the common sample size used for Ar */
  if (cfg.showG !== false && R.g) {
    g.appendChild(Fig.el('line', { x1: x(R.g), x2: x(R.g), y1: f.y0, y2: f.y1, stroke: f.t.muted, 'stroke-width': 1.2, 'stroke-dasharray': '5 4' }));
    /* written on the side of the line with room for it */
    const leftSide = x(R.g) > (f.x0 + f.x1) / 2;
    g.appendChild(Fig.text(x(R.g) + (leftSide ? -5 : 5), f.y1 - 10, `Ar computed at g = ${R.g}`, { size: 10, anchor: leftSide ? 'end' : 'start', fill: f.t.muted, font: f.font, role: 'label', halo: f.t.bg }));
  }
  f.g.appendChild(g);
  Fig.legend(f, curves.map((c, i) => ({ label: c.pop, color: Fig.color(cfg.palette, i), shape: 'line' })), cfg, { pos: cfg.legendPos || 'right' });
  return svg;
};

/* ---------- 5 · Ho against He, locus by locus ---------- */
P3.hoHe = (cfg, R) => {
  const svg = Fig.svg(cfg.width, cfg.height, cfg.theme);
  const f = Fig.frame(svg, cfg, { margin: { left: 74, right: 132, bottom: 64, top: 56 } });
  const pts = [];
  R.cells.forEach((row, p) => row.forEach((c, l) => {
    if (c.Ho != null && c.He != null && isFinite(c.Ho) && isFinite(c.He)) pts.push({ p, l, Ho: c.Ho, He: c.He });
  }));
  const hi = Math.max(0.1, ...pts.map(q => Math.max(q.Ho, q.He))) * 1.05;
  const x = Fig.scaleLinear(0, hi, f.x0, f.x1), y = Fig.scaleLinear(0, hi, f.y1, f.y0);
  Fig.axisY(f, y, Object.assign({}, cfg, { ylab: cfg.ylab || 'Ho · observed heterozygosity' }));
  Fig.axisX(f, x, Object.assign({}, cfg, { xlab: cfg.xlab || 'He · expected heterozygosity' }));
  const g = Fig.g();
  g.appendChild(Fig.el('line', { x1: x(0), y1: y(0), x2: x(hi), y2: y(hi), stroke: f.t.muted, 'stroke-width': 1.4, 'stroke-dasharray': '5 4' }));
  g.appendChild(Fig.text(x(hi) - 4, y(hi) + 14, 'Ho = He', { size: 10, anchor: 'end', fill: f.t.muted, font: f.font, role: 'label' }));
  pts.forEach(q => g.appendChild(Fig.marker(x(q.He), y(q.Ho), +cfg.pointSize || 4, 'circle',
    { fill: Fig.alpha(Fig.color(cfg.palette, q.p), 0.78), stroke: Fig.color(cfg.palette, q.p), 'stroke-width': 0.8 })));
  /* how many loci fall below the line = heterozygote deficit */
  const below = pts.filter(q => q.Ho < q.He).length;
  g.appendChild(Fig.text(f.x0 + 8, f.y0 + 14, `${below} of ${pts.length} points below the line (heterozygote deficit)`,
    { size: 10, fill: f.t.muted, font: f.font, role: 'label' }));
  f.g.appendChild(g);
  Fig.legend(f, R.popNames.map((p, i) => ({ label: p, color: Fig.color(cfg.palette, i), shape: 'circle' })), cfg, { pos: cfg.legendPos || 'right' });
  return svg;
};

/* ---------- 6 · private alleles ---------- */
P3.privateAlleles = (cfg, R) => {
  const counts = R.popNames.map((p, i) => ({
    pop: p, n: R.privateAlleles.filter(a => a.popIndex === i).length,
    common: R.privateAlleles.filter(a => a.popIndex === i && a.freq >= 0.05).length,
  }));
  const svg = Fig.svg(cfg.width, cfg.height, cfg.theme);
  const C = Fig.bandPlot(svg, cfg, counts.map(c => c.pop), [0, Math.max(1, ...counts.map(c => c.n)) * 1.15],
    { valueLabel: 'private alleles', padding: 0.32, margin: cfg.splitCommon !== false && (cfg.legendPos || 'right') === 'right' ? { right: 230 } : {} });
  const f = C.f;
  const g = Fig.g();
  counts.forEach((c, i) => {
    g.appendChild(C.bar(i, c.n, { fill: Fig.alpha(Fig.color(cfg.palette, 0), 0.45), rx: 3 }));
    if (cfg.splitCommon !== false)
      g.appendChild(C.bar(i, c.common, { fill: Fig.color(cfg.palette, 0), rx: 3 }));
    g.appendChild(C.valueText(C.center(i), c.n, String(c.n), { size: 11 }));
  });
  f.g.appendChild(g);
  if (cfg.splitCommon !== false)
    Fig.legend(f, [
      { label: 'private and frequent (≥ 5%)', color: Fig.color(cfg.palette, 0) },
      { label: 'private but rare', color: Fig.alpha(Fig.color(cfg.palette, 0), 0.45) },
    ], cfg, { pos: cfg.legendPos || 'right' });
  return svg;
};

/* ---------- 7 · morphological diversity: H′ by trait and population ---------- */
P3.morphHeat = (cfg, R) => {
  const traits = R.perTrait;
  const pops = traits[0].byPop.map(b => b.pop);
  const H = Math.max(320, 120 + traits.length * (+cfg.rowH || 26));
  const svg = Fig.svg(cfg.width, H, cfg.theme);
  const f = Fig.frame(svg, cfg, { margin: { left: 160, right: 96, bottom: 104, top: 56 } });
  const cw = (f.x1 - f.x0) / Math.max(1, pops.length);
  const ch = (f.y1 - f.y0) / Math.max(1, traits.length);
  const cmap = Fig.colormaps[cfg.cmap] || Fig.colormaps.ylgn;
  const g = Fig.g();
  traits.forEach((t, i) => {
    t.byPop.forEach((b, p) => {
      const v = b.Hstd == null ? 0 : b.Hstd;
      g.appendChild(Fig.el('rect', { x: f.x0 + p * cw, y: f.y0 + i * ch, width: cw - 1, height: ch - 1, fill: cmap(v), rx: 2 }));
      if (cfg.values !== false && cw > 40)
        g.appendChild(Fig.text(f.x0 + p * cw + cw / 2, f.y0 + i * ch + ch / 2 + 3.5, v.toFixed(2),
          { size: 9.5, anchor: 'middle', fill: v > 0.55 ? '#fff' : f.t.fg, font: f.font, role: 'label' }));
    });
    g.appendChild(Fig.text(f.x0 - 6, f.y0 + i * ch + ch / 2 + 3.5, t.name, { size: 10.5, anchor: 'end', fill: f.t.fg, font: f.font, role: 'tick' }));
  });
  pops.forEach((p, i) => g.appendChild(Fig.text(f.x0 + i * cw + cw / 2, f.y1 + 8, p, { size: 10.5, anchor: 'end', fill: f.t.fg, font: f.font, rotate: -45, role: 'tick' })));
  const bx = f.x1 + 24, bh = Math.min(160, f.y1 - f.y0);
  for (let k = 0; k < 40; k++) g.appendChild(Fig.el('rect', { x: bx, y: f.y0 + k * bh / 40, width: 13, height: bh / 40 + 0.6, fill: cmap(1 - k / 39) }));
  [['1', f.y0 + 4], ['0.5', f.y0 + bh / 2 + 4], ['0', f.y0 + bh + 4]].forEach(([t, yy]) =>
    g.appendChild(Fig.text(bx + 18, yy, t, { size: 9, fill: f.t.fg, font: f.font, role: 'tick' })));
  g.appendChild(Fig.text(bx + 6, f.y0 - 8, "H′", { size: 10, anchor: 'middle', fill: f.t.muted, font: f.font, role: 'label' }));
  f.g.appendChild(g);
  return svg;
};

window.P3 = P3;
window.IDX_LABEL = IDX_LABEL;
