/* PopGeneticsPro — Block 9 figures: heterozygosity excess per locus, the
   mode-shift histogram, N_e with confidence limits, the spatial correlogram,
   kinship against ln(distance) and P_ST per trait. */

const P9 = {};

/* ---------- 1 · He observed against He expected at equilibrium, per locus ---------- */
P9.hetExcess = (cfg, B) => {
  const model = cfg.model || 'tpm';
  const rows = B.loci.filter(x => x[model]);
  const svg = Fig.svg(cfg.width, cfg.height, cfg.theme);
  const vals = [].concat(...rows.map(x => [x.He, x[model].Heq - 2 * x[model].sdHeq, x[model].Heq + 2 * x[model].sdHeq]));
  const dom = Fig.niceDomain(Math.max(0, Math.min(...vals)), Math.min(1, Math.max(...vals)));
  /* the legend sits under the chart, so leave it room below the category labels */
  const C = Fig.bandPlot(svg, cfg, rows.map(x => x.locus), dom, { valueLabel: 'expected heterozygosity', padding: 0.35, legendBottom: (cfg.legendPos || 'bottom') === 'bottom' });
  const f = C.f;
  const g = Fig.g();
  rows.forEach((x, i) => {
    const m = x[model], cx = C.center(i);
    g.appendChild(C.line(cx, Math.max(dom[0], m.Heq - 2 * m.sdHeq), cx, Math.min(dom[1], m.Heq + 2 * m.sdHeq), { stroke: f.t.muted, 'stroke-width': 6, opacity: 0.35, 'stroke-linecap': 'round' }));
    g.appendChild(C.marker(cx, m.Heq, 4.5, 'square', { fill: f.t.muted }));
    const excess = x.He > m.Heq;
    g.appendChild(C.marker(cx, x.He, 6, 'circle', { fill: excess ? Fig.color(cfg.palette, 1) : Fig.color(cfg.palette, 0), stroke: f.t.bg, 'stroke-width': 1 }));
  });
  f.g.appendChild(g);
  Fig.legend(f, [{ label: 'observed He', color: Fig.color(cfg.palette, 0), shape: 'circle' }, { label: 'observed He in excess', color: Fig.color(cfg.palette, 1), shape: 'circle' }, { label: 'equilibrium Heq ± 2 SD (' + model.toUpperCase() + ')', color: f.t.muted }], cfg, { pos: cfg.legendPos || 'bottom' });
  return svg;
};

/* ---------- 2 · allele frequency classes (mode shift) ---------- */
P9.modeShift = (cfg, rows) => {
  /* rows: [{pop, prop:[10]}] */
  const svg = Fig.svg(cfg.width, cfg.height, cfg.theme);
  const labels = Array.from({ length: 10 }, (_, i) => `${(i / 10).toFixed(1)}–${((i + 1) / 10).toFixed(1)}`);
  const top = Math.max(...[].concat(...rows.map(r => r.prop))) * 1.15;
  const C = Fig.bandPlot(svg, cfg, labels, [0, top], { valueLabel: 'proportion of alleles', catLabel: 'allele frequency class', padding: 0.25, rotate: -35, margin: { right: 140 }, fmt: v => (v * 100).toFixed(0) + '%', legendLabels: rows.map(r => r.pop + (r.shifted ? ' (shifted)' : '')) });
  const f = C.f;
  const g = Fig.g();
  const bw = C.bw / rows.length;
  rows.forEach((r, ri) => r.prop.forEach((v, i) => g.appendChild(C.rect(C.start(i) + ri * bw, bw - 1, 0, v, { fill: Fig.color(cfg.palette, ri), rx: 1.5 }))));
  f.g.appendChild(g);
  Fig.legend(f, rows.map((r, i) => ({ label: r.pop + (r.shifted ? ' (shifted)' : ''), color: Fig.color(cfg.palette, i) })), cfg, { pos: cfg.legendPos || 'right' });
  return svg;
};

/* ---------- 3 · N_e with confidence limits ---------- */
P9.neBars = (cfg, rows) => {
  const svg = Fig.svg(cfg.width, cfg.height, cfg.theme);
  const cap = +cfg.cap || 1000;
  const val = v => (v == null || !isFinite(v)) ? cap : Math.min(cap, v);
  const C = Fig.bandPlot(svg, cfg, rows.map(r => r.pop), [0, cap * 1.08], { valueLabel: 'N_e (LD method)', padding: 0.35, margin: { left: 84 }, fmt: v => v >= cap ? `≥ ${cap}` : Fig.fmtTick(v) });
  const f = C.f;
  const g = Fig.g();
  rows.forEach((r, i) => {
    if (!r.ld) return;
    const v = val(r.ld.Ne), cx = C.center(i);
    g.appendChild(C.bar(i, v, { fill: Fig.alpha(Fig.color(cfg.palette, i), isFinite(r.ld.Ne) ? 0.9 : 0.3), rx: 3 }));
    if (r.ld.ci) g.appendChild(C.whisker(cx, val(r.ld.ci[0]), val(r.ld.ci[1]), 0, { stroke: f.t.fg, 'stroke-width': 1.6 }));
    /* the value goes beyond the upper limit, so the whisker never crosses it */
    g.appendChild(C.valueText(cx, r.ld.ci ? Math.max(v, val(r.ld.ci[1])) : v, isFinite(r.ld.Ne) ? Math.round(r.ld.Ne).toString() : '∞', { size: 11, weight: 'bold' }));
  });
  f.g.appendChild(g);
  return svg;
};

/* ---------- 4 · spatial correlogram ---------- */
P9.correlogram = (cfg, Sx) => {
  const cls = Sx.classes;
  const svg = Fig.svg(cfg.width, cfg.height, cfg.theme);
  const f = Fig.frame(svg, cfg, { margin: { left: 80, right: 30, bottom: 64, top: 56 } });
  const xs = cls.map(c => cfg.xscale === 'log' ? Math.log(c.mean) : c.mean);
  const vals = [].concat(...cls.map(c => [c.value, c.lo95, c.hi95])).filter(v => isFinite(v));
  const dom = Fig.niceDomain(Math.min(...vals), Math.max(...vals));
  const x = Fig.scaleLinear(Math.min(...xs), Math.max(...xs), f.x0 + 10, f.x1 - 10), y = Fig.scaleLinear(dom[0], dom[1], f.y1, f.y0);
  Fig.axisY(f, y, Object.assign({}, cfg, { ylab: cfg.ylab || Sx.method }));
  Fig.axisX(f, x, Object.assign({}, cfg, { xlab: cfg.xlab || (cfg.xscale === 'log' ? `ln(distance, ${Sx.unit})` : `distance class (mean, ${Sx.unit})`), grid: false }));
  const g = Fig.g();
  /* permutation envelope */
  g.appendChild(Fig.el('path', { d: cls.map((c, i) => (i ? 'L' : 'M') + x(xs[i]).toFixed(1) + ' ' + y(c.hi95).toFixed(1)).join(' ') + ' ' + cls.slice().reverse().map((c, i) => 'L' + x(xs[cls.length - 1 - i]).toFixed(1) + ' ' + y(c.lo95).toFixed(1)).join(' ') + ' Z', fill: Fig.alpha(f.t.muted, 0.15), stroke: 'none' }));
  g.appendChild(Fig.el('path', { d: cls.map((c, i) => (i ? 'L' : 'M') + x(xs[i]).toFixed(1) + ' ' + y(c.hi95).toFixed(1)).join(' '), fill: 'none', stroke: f.t.muted, 'stroke-dasharray': '4 3' }));
  g.appendChild(Fig.el('path', { d: cls.map((c, i) => (i ? 'L' : 'M') + x(xs[i]).toFixed(1) + ' ' + y(c.lo95).toFixed(1)).join(' '), fill: 'none', stroke: f.t.muted, 'stroke-dasharray': '4 3' }));
  if (dom[0] <= 0 && dom[1] >= 0) g.appendChild(Fig.el('line', { x1: f.x0, x2: f.x1, y1: y(0), y2: y(0), stroke: f.t.axis }));
  g.appendChild(Fig.el('path', { d: cls.map((c, i) => (i ? 'L' : 'M') + x(xs[i]).toFixed(1) + ' ' + y(c.value).toFixed(1)).join(' '), fill: 'none', stroke: Fig.color(cfg.palette, 0), 'stroke-width': 2.2 }));
  cls.forEach((c, i) => g.appendChild(Fig.marker(x(xs[i]), y(c.value), c.pTwo < 0.05 ? 6 : 4.5, 'circle', { fill: c.pTwo < 0.05 ? Fig.color(cfg.palette, 1) : Fig.color(cfg.palette, 0), stroke: f.t.bg, 'stroke-width': 1 })));
  if (cfg.counts) cls.forEach((c, i) => g.appendChild(Fig.text(x(xs[i]), f.y1 - 6, String(c.nPairs), { size: 8.5, anchor: 'middle', fill: f.t.muted, font: f.font, role: 'label' })));
  f.g.appendChild(g);
  Fig.legend(f, [{ label: 'observed', color: Fig.color(cfg.palette, 0), shape: 'line' }, { label: 'outside the 95% envelope', color: Fig.color(cfg.palette, 1), shape: 'circle' }, { label: `95% permutation envelope (${Sx.perms})`, color: Fig.alpha(f.t.muted, 0.3) }], cfg, { pos: cfg.legendPos || 'right' });
  return svg;
};

/* ---------- 5 · P_ST per trait against a reference F_ST ---------- */
P9.pst = (cfg, Pst) => {
  const rows = Pst.rows;
  const svg = Fig.svg(cfg.width, cfg.height, cfg.theme);
  const top = Math.min(1, Math.max(...rows.map(r => r.ci[1]), cfg.fst || 0) * 1.15);
  const C = Fig.bandPlot(svg, cfg, rows.map(r => r.trait), [0, top], { valueLabel: 'P_ST', padding: 0.35 });
  const f = C.f;
  const g = Fig.g();
  rows.forEach((r, i) => {
    const cx = C.center(i);
    const above = cfg.fst != null && r.ci[0] > cfg.fst;
    g.appendChild(C.bar(i, r.Pst, { fill: above ? Fig.color(cfg.palette, 1) : Fig.color(cfg.palette, 0), rx: 3 }));
    g.appendChild(C.whisker(cx, r.ci[0], r.ci[1], 0, { stroke: f.t.fg, 'stroke-width': 1.5 }));
  });
  if (cfg.fst != null && cfg.fst > 0) {
    /* in the ink colour: the bars above F_ST share the accent colour and would hide the line */
    g.appendChild(C.ref(+cfg.fst, { stroke: f.t.fg, 'stroke-width': 1.8, 'stroke-dasharray': '6 4' }));
    g.appendChild(C.refLabel(+cfg.fst, `neutral F_ST = ${(+cfg.fst).toFixed(3)}`, { size: 10.5, fill: f.t.fg, weight: 'bold', haloWidth: 3 }));
  }
  f.g.appendChild(g);
  return svg;
};

window.P9 = P9;
