/* PopGeneticsPro — Block 8 figures: the haplotype network (pie nodes by
   population, mutational ticks on links, median vectors), the mismatch
   distribution against the sudden-expansion model, diversity per population
   and the map of segregating sites along the alignment. */

const P8 = {};

/* ---------- 1 · haplotype network ---------- */
/* N = {net (seqs, nObs, links, pos), hapTable [{hap,total,byPop}], popNames} */
P8.network = (cfg, N) => {
  const net = N.net, n = net.seqs.length;
  const svg = Fig.svg(cfg.width, cfg.height, cfg.theme);
  const hasPops = N.popNames && N.popNames.length > 1 && cfg.pies !== false;
  const f = Fig.frame(svg, cfg, { margin: { left: 30, right: hasPops && cfg.legendPos !== 'none' ? 150 : 30, bottom: 40, top: 56 } });
  const xs = net.pos.map(p => p.x), ys = net.pos.map(p => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const scale = +cfg.nodeScale || 1;
  const radius = i => i < net.nObs ? scale * (5 + 4.5 * Math.sqrt(N.hapTable[i].total)) : 3.2 * scale;
  const pad = 40 * scale;
  const s = Math.min((f.x1 - f.x0 - 2 * pad) / ((maxX - minX) || 1), (f.y1 - f.y0 - 2 * pad) / ((maxY - minY) || 1));
  const X = x => (f.x0 + f.x1) / 2 + (x - (minX + maxX) / 2) * s, Y = y => (f.y0 + f.y1) / 2 + (y - (minY + maxY) / 2) * s;
  const g = Fig.g();
  /* links with one tick per mutational step (a one-step link carries one tick) */
  net.links.forEach(l => {
    const ax = X(net.pos[l.a].x), ay = Y(net.pos[l.a].y), bx = X(net.pos[l.b].x), by = Y(net.pos[l.b].y);
    g.appendChild(Fig.el('line', { x1: ax, y1: ay, x2: bx, y2: by, stroke: f.t.fg, 'stroke-width': +cfg.linkWidth || 1.4 }));
    if (cfg.ticks !== false && l.d >= 1) {
      const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len;
      const ra = radius(l.a), rb = radius(l.b);
      const free = Math.max(0, len - ra - rb);
      for (let k = 1; k <= l.d; k++) {
        if (l.d > 40) { g.appendChild(Fig.text((ax + bx) / 2 + nx * 8, (ay + by) / 2 + ny * 8, String(l.d), { size: 9, anchor: 'middle', fill: Fig.color(cfg.palette, 1), font: f.font, weight: 'bold', role: 'label' })); break; }
        const t = (ra + free * k / (l.d + 1)) / len;
        const px = ax + dx * t, py = ay + dy * t;
        g.appendChild(Fig.el('line', { x1: px - nx * 4, y1: py - ny * 4, x2: px + nx * 4, y2: py + ny * 4, stroke: Fig.color(cfg.palette, 1), 'stroke-width': 1.6 }));
      }
    } else if (cfg.stepLabels && l.d > 1) g.appendChild(Fig.text((ax + bx) / 2, (ay + by) / 2 - 4, String(l.d), { size: 9, anchor: 'middle', fill: f.t.muted, font: f.font, role: 'label' }));
  });
  /* nodes */
  for (let i = 0; i < n; i++) {
    const cx = X(net.pos[i].x), cy = Y(net.pos[i].y), R = radius(i);
    if (i >= net.nObs) { g.appendChild(Fig.el('circle', { cx, cy, r: R, fill: f.t.fg, opacity: 0.85 })); continue; }
    const row = N.hapTable[i];
    if (hasPops && row.byPop.some(v => v > 0)) {
      const tot = row.byPop.reduce((a, b) => a + b, 0);
      let a0 = -Math.PI / 2;
      row.byPop.forEach((v, p) => {
        if (!v) return;
        const a1 = a0 + 2 * Math.PI * v / tot;
        if (v === tot) g.appendChild(Fig.el('circle', { cx, cy, r: R, fill: Fig.color(cfg.palette, p) }));
        else g.appendChild(Fig.el('path', { d: `M${cx} ${cy} L${cx + R * Math.cos(a0)} ${cy + R * Math.sin(a0)} A${R} ${R} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${cx + R * Math.cos(a1)} ${cy + R * Math.sin(a1)} Z`, fill: Fig.color(cfg.palette, p) }));
        a0 = a1;
      });
    } else g.appendChild(Fig.el('circle', { cx, cy, r: R, fill: Fig.color(cfg.palette, 0) }));
    g.appendChild(Fig.el('circle', { cx, cy, r: R, fill: 'none', stroke: f.t.bg, 'stroke-width': 1.5 }));
    if (cfg.labels !== false) g.appendChild(Fig.text(cx, cy + R + 11, row.hap + (cfg.counts ? ` (${row.total})` : ''), { size: +cfg.labelSize || 10, anchor: 'middle', fill: f.t.fg, font: f.font, weight: 'bold', role: 'label', halo: f.t.bg }));
  }
  f.g.appendChild(g);
  const items = hasPops ? N.popNames.map((p, i) => ({ label: p, color: Fig.color(cfg.palette, i), shape: 'circle' })) : [];
  if (net.nMedian) items.push({ label: 'median vector (unsampled)', color: f.t.fg, shape: 'circle' });
  if (items.length && cfg.legendPos !== 'none') Fig.legend(f, items, cfg, { pos: cfg.legendPos || 'right' });
  g.appendChild(Fig.text(f.x0, f.H - 10, `circle area ∝ number of sequences · ticks = mutational steps · ${net.links.length} links` + (net.nMedian ? ` · ${net.nMedian} median vectors` : ''), { size: 9.5, fill: f.t.muted, font: f.font, role: 'label' }));
  return svg;
};

/* ---------- 2 · mismatch distribution ---------- */
P8.mismatch = (cfg, M) => {
  const obs = M.obs, exp = M.expected;
  const svg = Fig.svg(cfg.width, cfg.height, cfg.theme);
  const top = Math.max(...obs, ...(exp || [0])) * 1.15;
  const labels = obs.map((_, i) => (obs.length > 30 && i % 5 ? '' : String(i)));
  const C = Fig.bandPlot(svg, cfg, labels, [0, top], { valueLabel: 'frequency of pairs', catLabel: 'pairwise nucleotide differences', padding: 0.2, rotate: 0, margin: { left: 80 }, legendLabels: exp && cfg.expected !== false ? ['observed', 'sudden expansion model'] : null });
  const f = C.f;
  const g = Fig.g();
  obs.forEach((v, i) => g.appendChild(C.bar(i, v, { fill: Fig.alpha(Fig.color(cfg.palette, 0), 0.6), rx: 2 })));
  if (exp && cfg.expected !== false) {
    g.appendChild(Fig.el('path', { d: C.path(exp.map((v, i) => [C.center(i), v])), fill: 'none', stroke: Fig.color(cfg.palette, 1), 'stroke-width': 2.4 }));
    exp.forEach((v, i) => g.appendChild(C.marker(C.center(i), v, 3, 'circle', { fill: Fig.color(cfg.palette, 1) })));
  }
  /* under the legend when both sit at the top right */
  const legendRoom = exp && cfg.expected !== false && (cfg.legendPos || 'right') === 'right' ? 2 * 17 * Fig.fs('legend') + 16 : 0;
  if (M.note) g.appendChild(Fig.text(f.x1 - 6, C.flip ? f.y1 - 8 : f.y0 + 14 + legendRoom, M.note, { size: 10.5, anchor: 'end', fill: f.t.fg, font: f.font, weight: 'bold', role: 'label' }));
  f.g.appendChild(g);
  if (exp && cfg.expected !== false) Fig.legend(f, [{ label: 'observed', color: Fig.alpha(Fig.color(cfg.palette, 0), 0.6) }, { label: 'sudden expansion model', color: Fig.color(cfg.palette, 1), shape: 'line' }], cfg, { pos: cfg.legendPos || 'right' });
  return svg;
};

/* ---------- 3 · diversity per population ---------- */
P8.popBars = (cfg, rows) => {
  const key = cfg.index || 'pi';
  const label = { pi: 'nucleotide diversity π', Hd: 'haplotype diversity Hd', h: 'number of haplotypes', k: 'mean pairwise differences k', thetaWsite: 'θ_W per site', S: 'segregating sites' }[key] || key;
  const svg = Fig.svg(cfg.width, cfg.height, cfg.theme);
  const vals = rows.map(r => r[key]).filter(v => v != null && isFinite(v));
  const C = Fig.bandPlot(svg, cfg, rows.map(r => r.name), [0, Math.max(1e-9, ...vals) * 1.15],
    { valueLabel: label, padding: 0.32, margin: { left: 84 }, fmt: v => (key === 'pi' || key === 'thetaWsite') ? v.toFixed(4) : Fig.fmtTick(v) });
  const f = C.f;
  const g = Fig.g();
  rows.forEach((r, i) => {
    const v = r[key]; if (v == null || !isFinite(v)) return;
    g.appendChild(C.bar(i, v, { fill: Fig.color(cfg.palette, i), rx: 3 }));
    g.appendChild(C.valueText(C.center(i), v, (key === 'pi' || key === 'thetaWsite') ? v.toFixed(4) : (key === 'h' || key === 'S') ? String(v) : v.toFixed(3)));
  });
  f.g.appendChild(g);
  return svg;
};

/* ---------- 4 · segregating sites along the alignment ---------- */
P8.siteMap = (cfg, S) => {
  const svg = Fig.svg(cfg.width, cfg.height, cfg.theme);
  const f = Fig.frame(svg, cfg, { margin: { left: 60, right: 30, bottom: 60, top: 56 } });
  const x = Fig.scaleLinear(1, S.length, f.x0, f.x1);
  Fig.axisX(f, x, Object.assign({}, cfg, { xlab: cfg.xlab || 'position in the alignment (bp)', grid: false }));
  const g = Fig.g();
  const yMid = (f.y0 + f.y1) / 2, h = (f.y1 - f.y0) * 0.35;
  g.appendChild(Fig.el('rect', { x: f.x0, y: yMid - h / 2, width: f.x1 - f.x0, height: h, fill: Fig.alpha(Fig.color(cfg.palette, 0), 0.12), stroke: Fig.color(cfg.palette, 0), rx: 4 }));
  S.excludedPositions.forEach(p => g.appendChild(Fig.el('line', { x1: x(p + 1), x2: x(p + 1), y1: yMid - h / 2, y2: yMid + h / 2, stroke: f.t.muted, 'stroke-width': 1, opacity: 0.45 })));
  S.seg.forEach(p => g.appendChild(Fig.el('line', { x1: x(p + 1), x2: x(p + 1), y1: yMid - h / 2 - 8, y2: yMid + h / 2 + 8, stroke: S.informativeSet.has(p) ? Fig.color(cfg.palette, 1) : Fig.color(cfg.palette, 0), 'stroke-width': S.informativeSet.has(p) ? 2 : 1.4 })));
  f.g.appendChild(g);
  Fig.legend(f, [{ label: 'parsimony-informative site', color: Fig.color(cfg.palette, 1) }, { label: 'singleton site', color: Fig.color(cfg.palette, 0) }, { label: 'site excluded (gap / ambiguity)', color: f.t.muted }], cfg, { pos: 'bottom' });
  return svg;
};

window.P8 = P8;
