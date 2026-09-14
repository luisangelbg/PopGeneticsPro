/* PopGeneticsPro — Block 2 figures: the genotype matrix itself, missing data,
   the profile of every locus, sample sizes and the band/allele frequency
   spectrum. All built with the Fig engine, so they are editable and exportable. */

const P2 = {};

/* ---------- 1 · the data matrix, individuals × loci ---------- */
/* mode 'matrix' paints the scored state (band present/absent, homozygote /
   heterozygote, allele identity); mode 'missing' paints only what is missing. */
P2.matrixMap = (cfg, D) => {
  const d = D.d, qc = D.qc;
  const nI = d.nInd, nL = d.nLoci;
  const svg = Fig.svg(cfg.width, cfg.height, cfg.theme);
  const labelRoom = cfg.indLabels !== false && nI <= 60 ? 108 : 34;
  const f = Fig.frame(svg, cfg, { margin: { left: labelRoom, right: 30, bottom: 70, top: 56 } });
  const cw = (f.x1 - f.x0) / Math.max(1, nL);
  const ch = (f.y1 - f.y0) / Math.max(1, nI);
  const g = Fig.g();

  const missCol = cfg.missingColor || '#cfd6db';
  const colFor = (i, l) => {
    const gt = d.geno[i][l];
    if (!gt) return missCol;
    if (cfg.mode === 'missing') return cfg.presentColor || Fig.color(cfg.palette, 0);
    if (d.kind === 'dominant') return String(gt[0]) === '1' ? Fig.color(cfg.palette, 0) : (cfg.absentColor || '#eef2f4');
    if (d.kind === 'codominant') {
      const het = new Set(gt.map(String)).size > 1;
      return het ? Fig.color(cfg.palette, 1) : Fig.color(cfg.palette, 0);
    }
    /* haploid / sequence: colour by allele identity */
    const k = d.loci[l].alleles.indexOf(String(gt[0]));
    return Fig.color(cfg.palette, Math.max(0, k));
  };

  for (let i = 0; i < nI; i++) {
    for (let l = 0; l < nL; l++) {
      g.appendChild(Fig.el('rect', {
        x: f.x0 + l * cw, y: f.y0 + i * ch,
        width: Math.max(0.6, cw - (cw > 4 ? 0.6 : 0)), height: Math.max(0.6, ch - (ch > 4 ? 0.6 : 0)),
        fill: colFor(i, l),
      }));
    }
  }
  /* population separators */
  if (cfg.popLines !== false && d.declaredPops) {
    let y = f.y0;
    const order = [];
    d.pops.forEach(p => p.idx.forEach(i => order.push(i)));
    let acc = 0;
    d.pops.forEach((p, pi) => {
      acc += p.idx.length;
      if (pi < d.pops.length - 1)
        g.appendChild(Fig.el('line', { x1: f.x0, x2: f.x1, y1: f.y0 + acc * ch, y2: f.y0 + acc * ch, stroke: f.t.fg, 'stroke-width': 1.2, opacity: 0.65 }));
    });
  }
  if (cfg.indLabels !== false && nI <= 60) {
    d.ind.forEach((v, i) => g.appendChild(Fig.text(f.x0 - 6, f.y0 + i * ch + ch / 2 + 3.5,
      String(v.id).length > 16 ? String(v.id).slice(0, 15) + '…' : String(v.id),
      { size: Math.min(11, ch * 0.85), anchor: 'end', fill: f.t.fg, font: f.font, role: 'tick' })));
  }
  g.appendChild(Fig.el('rect', { x: f.x0, y: f.y0, width: f.x1 - f.x0, height: f.y1 - f.y0, fill: 'none', stroke: f.t.axis, 'stroke-width': 1.2 }));
  g.appendChild(Fig.text((f.x0 + f.x1) / 2, f.y1 + 26, cfg.xlab || `${nL} loci →`, { size: 12, anchor: 'middle', fill: f.t.muted, font: f.font, role: 'axis' }));
  if (labelRoom < 60) g.appendChild(Fig.text(16, (f.y0 + f.y1) / 2, `${nI} individuals`, { size: 12, anchor: 'middle', fill: f.t.muted, font: f.font, rotate: -90, role: 'axis' }));
  f.g.appendChild(g);

  const items = cfg.mode === 'missing'
    ? [{ label: 'scored', color: cfg.presentColor || Fig.color(cfg.palette, 0) }, { label: 'missing', color: missCol }]
    : d.kind === 'dominant'
      ? [{ label: 'band present', color: Fig.color(cfg.palette, 0) }, { label: 'band absent', color: cfg.absentColor || '#eef2f4' }, { label: 'missing', color: missCol }]
      : d.kind === 'codominant'
        ? [{ label: 'homozygote', color: Fig.color(cfg.palette, 0) }, { label: 'heterozygote', color: Fig.color(cfg.palette, 1) }, { label: 'missing', color: missCol }]
        : [{ label: 'allele 1', color: Fig.color(cfg.palette, 0) }, { label: 'allele 2', color: Fig.color(cfg.palette, 1) }, { label: 'missing', color: missCol }];
  Fig.legend(f, items, cfg, { pos: cfg.legendPos || 'bottom' });
  return svg;
};

/* ---------- 2 · profile of every locus ---------- */
/* dominant data: frequency of the band. Codominant/haploid: number of alleles. */
P2.locusProfile = (cfg, D) => {
  const d = D.d, qc = D.qc;
  const dominant = d.kind === 'dominant';
  let rows = qc.perLocus.map(p => ({
    name: p.name,
    value: dominant ? p.bandFreq : p.nAlleles,
    missing: p.pMissing,
    flag: p.monomorphic ? 'monomorphic' : (dominant && (p.bandFreq < 0.05 || p.bandFreq > 0.95)) ? 'uninformative' : 'ok',
  }));
  if (cfg.sort === 'value') rows = rows.slice().sort((a, b) => b.value - a.value);
  else if (cfg.sort === 'missing') rows = rows.slice().sort((a, b) => b.missing - a.missing);

  const H = Math.max(300, 110 + rows.length * (+cfg.rowH || 16));
  const svg = Fig.svg(cfg.width, H, cfg.theme);
  const f = Fig.frame(svg, cfg, { margin: { left: 132, right: 40, bottom: 60, top: 56 } });
  const maxV = dominant ? 1 : Math.max(2, ...rows.map(r => r.value));
  const x = Fig.scaleLinear(0, maxV, f.x0, f.x1);
  const band = Fig.scaleBand(rows.map(r => r.name), f.y0, f.y1, 0.25);
  Fig.axisX(f, x, Object.assign({}, cfg, { xlab: cfg.xlab || (dominant ? 'frequency of the band' : 'number of alleles') }));
  const COL = { ok: Fig.color(cfg.palette, 0), monomorphic: '#b4bcc2', uninformative: Fig.color(cfg.palette, 1) };
  const g = Fig.g();
  rows.forEach((r, i) => {
    const y = band(i), bw = band.bandwidth;
    g.appendChild(Fig.el('rect', { x: f.x0, y, width: Math.max(1, x(r.value) - f.x0), height: bw, fill: COL[r.flag], rx: 2 }));
    g.appendChild(Fig.text(f.x0 - 6, y + bw / 2 + 3.5, r.name.length > 18 ? r.name.slice(0, 17) + '…' : r.name,
      { size: Math.min(11, bw * 1.1), anchor: 'end', fill: f.t.fg, font: f.font, role: 'tick' }));
    if (cfg.values !== false && bw >= 9)
      g.appendChild(Fig.text(x(r.value) + 5, y + bw / 2 + 3.5, dominant ? r.value.toFixed(2) : String(r.value),
        { size: Math.min(10, bw), fill: f.t.muted, font: f.font, role: 'label' }));
    if (cfg.missingMark !== false && r.missing > 0) {
      g.appendChild(Fig.el('rect', { x: f.x1 + 6, y: y + bw / 2 - 3, width: 12, height: 6, fill: Fig.alpha('#c93a2c', Math.min(1, 0.15 + r.missing * 2)), rx: 1 }));
    }
  });
  if (dominant && cfg.thresholds !== false) {
    [0.05, 0.95].forEach(t => g.appendChild(Fig.el('line', { x1: x(t), x2: x(t), y1: f.y0, y2: f.y1, stroke: Fig.color(cfg.palette, 1), 'stroke-width': 1.2, 'stroke-dasharray': '4 3', opacity: 0.8 })));
  }
  f.g.appendChild(g);
  const items = [{ label: dominant ? 'informative band' : 'polymorphic locus', color: COL.ok }];
  if (rows.some(r => r.flag === 'uninformative')) items.push({ label: 'rare or nearly fixed (<5% or >95%)', color: COL.uninformative });
  if (rows.some(r => r.flag === 'monomorphic')) items.push({ label: 'monomorphic', color: COL.monomorphic });
  Fig.legend(f, items, cfg, { pos: cfg.legendPos || 'bottom' });
  return svg;
};

/* ---------- 3 · sample size per population ---------- */
P2.popSizes = (cfg, D) => {
  const d = D.d;
  const pops = d.pops.slice().sort((a, b) => cfg.sort === 'size' ? b.idx.length - a.idx.length : 0);
  const svg = Fig.svg(cfg.width, cfg.height, cfg.theme);
  const maxN = Math.max(...pops.map(p => p.idx.length), 1);
  /* the "recommended minimum" line is only drawn when it falls inside the data
     range; otherwise it would stretch the canvas for no information */
  const minN = +cfg.minN || 5;
  const showMin = cfg.minLine !== false && minN <= maxN * 1.6;
  const regions = [...new Set(pops.map(p => p.region || ''))];
  const C = Fig.bandPlot(svg, cfg, pops.map(p => p.name), [0, Math.max(maxN, showMin ? minN : 0) * 1.12],
    { valueLabel: 'individuals sampled', legendLabels: cfg.colourByRegion && regions.filter(Boolean).length > 1 ? regions.filter(Boolean) : null });
  const f = C.f;
  const g = Fig.g();
  pops.forEach((p, i) => {
    const n = p.idx.length;
    const col = cfg.colourByRegion && p.region ? Fig.color(cfg.palette, regions.indexOf(p.region)) : Fig.color(cfg.palette, 0);
    g.appendChild(C.bar(i, n, { fill: n < minN ? Fig.alpha(col, 0.4) : col, rx: 3 }));
    g.appendChild(C.valueText(C.center(i), n, String(n), { size: 11 }));
  });
  if (showMin) {
    g.appendChild(C.ref(minN, { stroke: '#c93a2c', 'stroke-width': 1.3, 'stroke-dasharray': '5 4' }));
    g.appendChild(C.refLabel(minN, `n = ${minN}`, { fill: '#c93a2c' }));
  }
  f.g.appendChild(g);
  if (cfg.colourByRegion && regions.filter(Boolean).length > 1)
    Fig.legend(f, regions.filter(Boolean).map((r, i) => ({ label: r, color: Fig.color(cfg.palette, i) })), cfg, { pos: cfg.legendPos || 'right' });
  return svg;
};

/* ---------- 4 · frequency spectrum ---------- */
/* dominant: distribution of band frequencies. codominant: distribution of allele
   frequencies pooled over loci — the shape that bottleneck tests later read. */
P2.spectrum = (cfg, D) => {
  const d = D.d, qc = D.qc;
  const vals = [];
  if (d.kind === 'dominant') qc.perLocus.forEach(p => { if (p.bandFreq != null) vals.push(p.bandFreq); });
  else qc.perLocus.forEach(p => Object.values(p.freqs).forEach(v => vals.push(v)));
  const nb = +cfg.bins || 10;
  const counts = new Array(nb).fill(0);
  vals.forEach(v => counts[Math.min(nb - 1, Math.floor(v * nb))]++);
  const svg = Fig.svg(cfg.width, cfg.height, cfg.theme);
  const f = Fig.frame(svg, cfg, { margin: { left: 74, right: 30, bottom: 64, top: 56 } });
  const y = Fig.scaleLinear(0, Math.max(1, ...counts) * 1.14, f.y1, f.y0);
  const x = Fig.scaleLinear(0, 1, f.x0, f.x1);
  Fig.axisY(f, y, Object.assign({}, cfg, { ylab: cfg.ylab || (d.kind === 'dominant' ? 'number of bands' : 'number of alleles') }));
  Fig.axisX(f, x, Object.assign({}, cfg, { xlab: cfg.xlab || (d.kind === 'dominant' ? 'band frequency' : 'allele frequency'), grid: false }));
  const g = Fig.g();
  const w = (f.x1 - f.x0) / nb;
  counts.forEach((c, i) => {
    const lo = i / nb;
    const col = (d.kind === 'dominant' && (lo < 0.05 || lo >= 0.95)) ? Fig.color(cfg.palette, 1) : Fig.color(cfg.palette, 0);
    g.appendChild(Fig.el('rect', { x: f.x0 + i * w + 1, y: y(c), width: w - 2, height: f.y1 - y(c), fill: col, rx: 2 }));
    if (c > 0) g.appendChild(Fig.text(f.x0 + i * w + w / 2, y(c) - 5, String(c), { size: 10, anchor: 'middle', fill: f.t.muted, font: f.font, role: 'label' }));
  });
  f.g.appendChild(g);
  return svg;
};

window.P2 = P2;
