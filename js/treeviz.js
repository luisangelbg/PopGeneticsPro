/* PopGeneticsPro — tree studio: publication trees in the style of the large
   phylogenies published in botanical journals.

   TV.render(cfg, T) → <svg>
   T = {
     root,                                   tree in the app's node format (treeops.js)
     tipLabel(i),                            name of tip i
     tipGroup(i) → group index | null,  groupNames, groupWord ('Population', 'Region'…)
     rings: [{ key, title, kind: 'cat', of(i) → index|null, names }
           | { key, title, kind: 'q', of(i) → [q1…qK], names }],
     timed: true when every node has .age (Ma) — draws a geological time scale,
     canReroot: true for trees whose root is arbitrary (neighbour-joining),
     note, credits(names) → [text]
   }
   Layouts: 'circular' (with an open angle for the time axis), 'rect', 'unrooted'. */

const TV = {};

(function () {
  const TAU = Math.PI * 2;
  let uid = 0;

  const est = (s, size) => String(s).length * size * 0.56;
  const polar = (cx, cy, r, a) => [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  const P = (x, y) => x.toFixed(1) + ' ' + y.toFixed(1);

  function arcPath(cx, cy, r, a0, a1) {
    if (Math.abs(a1 - a0) < 1e-6) return '';
    const [x0, y0] = polar(cx, cy, r, a0), [x1, y1] = polar(cx, cy, r, a1);
    return `M${P(x0, y0)} A${r.toFixed(1)} ${r.toFixed(1)} 0 ${Math.abs(a1 - a0) > Math.PI ? 1 : 0} ${a1 > a0 ? 1 : 0} ${P(x1, y1)}`;
  }
  function sectorPath(cx, cy, r0, r1, a0, a1) {
    r0 = Math.max(0, r0);
    const large = Math.abs(a1 - a0) > Math.PI ? 1 : 0;
    const [ax, ay] = polar(cx, cy, r1, a0), [bx, by] = polar(cx, cy, r1, a1);
    const [c2x, c2y] = polar(cx, cy, r0, a1), [dx, dy] = polar(cx, cy, r0, a0);
    return `M${P(ax, ay)} A${r1.toFixed(1)} ${r1.toFixed(1)} 0 ${large} 1 ${P(bx, by)} L${P(c2x, c2y)} A${r0.toFixed(1)} ${r0.toFixed(1)} 0 ${large} 0 ${P(dx, dy)} Z`;
  }

  /* spread items (sorted by target) so that neighbours are at least `gap` apart
     inside [lo, hi]; returns the positions */
  function relax(targets, gap, lo, hi, wrap) {
    const n = targets.length;
    if (!n) return [];
    const pos = targets.slice();
    for (let it = 0; it < 400; it++) {
      let moved = false;
      for (let k = 0; k < n - 1; k++) {
        const d = pos[k + 1] - pos[k];
        if (d < gap - 1e-9) { const push = (gap - d) / 2; pos[k] -= push; pos[k + 1] += push; moved = true; }
      }
      if (wrap && n > 1) {
        const d = pos[0] + (hi - lo) - pos[n - 1];
        if (d < gap - 1e-9) { const push = (gap - d) / 2; pos[0] += push; pos[n - 1] -= push; moved = true; }
      }
      if (!wrap) {
        if (pos[0] < lo) { const s = lo - pos[0]; for (let k = 0; k < n; k++) pos[k] += s; moved = true; }
        if (pos[n - 1] > hi) { const s = pos[n - 1] - hi; for (let k = 0; k < n; k++) pos[k] -= s; moved = true; }
      }
      /* pull gently back towards the targets so free items stay where they belong */
      for (let k = 0; k < n; k++) pos[k] += (targets[k] - pos[k]) * 0.02;
      if (!moved) break;
    }
    return pos;
  }

  /* ================================================================
     preparation shared by every layout
     ================================================================ */
  function prepare(cfg, T) {
    const O = TreeOps;
    let root = T.root, rootNote = null;
    if (!T.timed && T.canReroot) {
      if (cfg.rooting === 'midpoint') root = O.midpointRoot(root);
      else if (cfg.rooting === 'outgroup' && String(cfg.outgroup || '').trim()) {
        const want = String(cfg.outgroup).split(/[,;]+/).map(s => s.trim().toLowerCase()).filter(Boolean);
        const idx = O.tips(root).filter(t => want.includes(String(T.tipLabel(t.tip)).toLowerCase())).map(t => t.tip);
        const rr = idx.length ? O.rerootOutgroup(root, idx) : null;
        if (rr) root = rr; else rootNote = idx.length ? 'outgroup not monophyletic — root left as it was' : 'outgroup names not found';
      }
    }
    root = O.ladderize(root, cfg.ladderize || 'none');
    const ix = O.index(root);
    const tipsL = O.tips(root);
    const n = tipsL.length;
    const rank = new Map();
    tipsL.forEach((t, k) => rank.set(t, k));
    ix.postorder.forEach(v => {
      if (O.isTip(v)) return;
      const rs = v.children.map(c => rank.get(c.node));
      rank.set(v, (Math.min(...rs) + Math.max(...rs)) / 2);
    });
    /* horizontal coordinate: time from the root, branch length, or levels */
    const X = new Map();
    let maxX = 0, rootAge = null;
    if (T.timed) {
      rootAge = root.age;
      ix.order.forEach(v => { X.set(v, rootAge - (v.age || 0)); });
    } else if (cfg.branches === 'cladogram') {
      const lev = new Map();
      ix.postorder.forEach(v => lev.set(v, O.isTip(v) ? 0 : 1 + Math.max(...v.children.map(c => lev.get(c.node)))));
      const top = lev.get(root);
      ix.order.forEach(v => X.set(v, top - lev.get(v)));
    } else ix.order.forEach(v => X.set(v, ix.depth.get(v)));
    ix.order.forEach(v => { maxX = Math.max(maxX, X.get(v)); });
    if (T.timed && root.hpd) maxX = Math.max(maxX, rootAge);

    /* colour categories: groups of the data, or clusters cut from the tree */
    const pal = cfg.palette || 'cluster';
    let catOfTip = () => null, catNames = [], catWord = '', clades = [];
    const tipCount = O.tipCounts(root);
    if (cfg.colourBy === 'clusters') {
      const k = Math.max(2, Math.min(20, +cfg.k || 3));
      const cut = O.cutClusters(root, k);
      const userNames = String(cfg.clusterNames || '').split(',').map(s => s.trim());
      catNames = cut.clades.map((_, i) => userNames[i] || `Clade ${String.fromCharCode(65 + i)}`);
      catOfTip = i => cut.clusterOfTip.get(i);
      clades = cut.clades.map((node, ci) => ({ node, cat: ci, label: true }));
      catWord = 'Clade';
    } else if (cfg.colourBy === 'groups' && T.tipGroup) {
      catNames = T.groupNames || [];
      catOfTip = i => T.tipGroup(i);
      catWord = T.groupWord || 'Group';
      const pure = O.pureClades(root, catOfTip, 1);
      const allSingle = catNames.length && tipsL.every(t => tipsL.filter(u => catOfTip(u.tip) === catOfTip(t.tip)).length === 1);
      if (!allSingle) {
        const best = new Map();
        pure.forEach(c => { if (!best.has(c.group) || c.size > best.get(c.group).size) best.set(c.group, c); });
        /* tiny pure clades (two plants of a population that happen to pair) add noise, not information */
        const minTips = +cfg.minCladeTips || Math.max(2, Math.round(n * 0.03));
        clades = pure.filter(c => c.size >= minTips).map(c => ({ node: c.node, cat: c.group, label: best.get(c.group) === c }));
      }
    }
    const colour = ci => (ci == null || ci < 0 ? null : (cfg.customColours && cfg.customColours[ci]) || Fig.color(pal, ci));
    const catOfNode = new Map();
    ix.postorder.forEach(v => {
      if (O.isTip(v)) { catOfNode.set(v, catOfTip(v.tip)); return; }
      const cs = v.children.map(c => catOfNode.get(c.node));
      catOfNode.set(v, cs.every(c => c != null && c === cs[0]) ? cs[0] : null);
    });
    /* in cluster mode everything inside a clade takes its colour */
    if (cfg.colourBy === 'clusters') clades.forEach(c => O.nodes(c.node).forEach(v => catOfNode.set(v, c.cat)));
    const cladeRange = node => { const ts = O.tips(node).map(t => rank.get(t)); return [Math.min(...ts), Math.max(...ts)]; };
    clades.forEach(c => { c.range = cladeRange(c.node); c.colour = colour(c.cat); c.name = catNames[c.cat]; });

    /* rings chosen in the editor */
    const rings = (T.rings || []).filter(r => cfg['ring_' + r.key]);

    /* images: of the tips, of the groups/clusters */
    const images = [];
    if (cfg.images && cfg.images !== 'none' && window.OTUImg) {
      if (cfg.images === 'tips') {
        tipsL.forEach(t => { const nm = T.tipLabel(t.tip); const u = OTUImg.url(nm); if (u) images.push({ name: nm, url: u, target: rank.get(t), range: [rank.get(t), rank.get(t)], colour: colour(catOfTip(t.tip)) }); });
      } else {
        catNames.forEach((nm, ci) => {
          const u = OTUImg.url(nm); if (!u) return;
          const ranks = tipsL.filter(t => catOfTip(t.tip) === ci).map(t => rank.get(t));
          if (!ranks.length) return;
          const lab = clades.find(c => c.cat === ci && c.label);
          const rg = lab ? lab.range : [Math.min(...ranks), Math.max(...ranks)];
          images.push({ name: nm, url: u, target: (rg[0] + rg[1]) / 2, range: rg, colour: colour(ci) });
        });
      }
      images.sort((a, b) => a.target - b.target);
    }
    return { root, ix, tipsL, n, rank, X, maxX, rootAge, catOfTip, catOfNode, catNames, catWord, clades, colour, rings, images, rootNote, tipCount };
  }

  /* support: dots (as in large phylogenies) or numbers */
  function supportMark(g, cfg, f, node, x, y, anchor) {
    if (node.support == null || cfg.support === 'none' || TreeOps.isTip(node)) return;
    const v = node.support, min = (+cfg.minSupport || 50) / 100;
    if (v < min) return;
    if (cfg.support === 'numbers') {
      const txt = cfg.supportAs === 'fraction' ? v.toFixed(2) : Math.round(v * 100);
      g.appendChild(Fig.text(x + (anchor === 'end' ? -4 : 3), y - 4, txt, { size: +cfg.supportSize || 9, anchor: anchor || 'start', fill: f.t.muted, font: f.font, role: 'label', halo: f.t.bg, haloWidth: 2.5 }));
    } else {
      const strong = v >= (+cfg.strongSupport || 95) / 100;
      g.appendChild(Fig.el('circle', { cx: x, cy: y, r: (strong ? 3.2 : 2.3) * (+cfg.dotSize || 1), fill: strong ? f.t.fg : f.t.bg, stroke: f.t.fg, 'stroke-width': 1 }));
    }
  }

  function imageNode(defs, cfg, f, item, x, y, size) {
    const g = Fig.g();
    const shape = cfg.imgFrame || 'circle';
    const id = 'tvclip' + (++uid);
    const s = size, h = s / 2;
    if (shape !== 'none') {
      const cp = Fig.el('clipPath', { id });
      cp.appendChild(shape === 'circle' ? Fig.el('circle', { cx: x, cy: y, r: h })
        : Fig.el('rect', { x: x - h, y: y - h, width: s, height: s, rx: shape === 'rounded' ? s * 0.18 : 0 }));
      defs.appendChild(cp);
      if (cfg.imgBackdrop) {
        const bgCol = Fig.alpha(item.colour || f.t.muted, 0.12);
        g.appendChild(shape === 'circle' ? Fig.el('circle', { cx: x, cy: y, r: h, fill: bgCol }) : Fig.el('rect', { x: x - h, y: y - h, width: s, height: s, rx: shape === 'rounded' ? s * 0.18 : 0, fill: bgCol }));
      }
    }
    const im = Fig.el('image', { x: x - h, y: y - h, width: s, height: s, preserveAspectRatio: shape === 'none' ? 'xMidYMid meet' : 'xMidYMid slice', 'clip-path': shape !== 'none' ? `url(#${id})` : null });
    im.setAttribute('href', item.url);
    im.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', item.url);
    g.appendChild(im);
    const bw = +cfg.imgBorder;
    if (shape !== 'none' && bw > 0) {
      const col = cfg.imgBorderColour === 'neutral' ? f.t.muted : (item.colour || f.t.muted);
      g.appendChild(shape === 'circle' ? Fig.el('circle', { cx: x, cy: y, r: h, fill: 'none', stroke: col, 'stroke-width': bw })
        : Fig.el('rect', { x: x - h, y: y - h, width: s, height: s, rx: shape === 'rounded' ? s * 0.18 : 0, fill: 'none', stroke: col, 'stroke-width': bw }));
    }
    if (cfg.imgCaptions) g.appendChild(Fig.text(x, y + h + 11 * Fig.fs('label'), item.name, { size: 9.5, anchor: 'middle', fill: item.colour || f.t.fg, font: f.font, italic: !!cfg.italic, role: 'label' }));
    return g;
  }

  /* the legend of a rectangular tree runs in rows under the plot, where it never
     covers a branch; returns the height it needs when `measureOnly` */
  function legendRows(f, cfg, S, T, extra, x, y, maxW, measureOnly) {
    if (cfg.legendPos === 'none') return 0;
    const items = legendItems(cfg, S, T, extra);
    if (!items.length) return 0;
    const fs = 10.5 * Fig.fs('legend'), lh = fs * 1.7;
    let cx = x, cy = y, rows = 1;
    const g = measureOnly ? null : Fig.g();
    items.forEach(it => {
      const w = it.head ? est(it.head, fs) + 10 : fs + 6 + est(it.label, fs) + 14;
      if (cx + w > x + maxW && cx > x) { cx = x; cy += lh; rows++; }
      if (g) {
        if (it.head) g.appendChild(Fig.text(cx, cy, it.head + ':', { size: 10.5, weight: 'bold', fill: f.t.fg, font: f.font, role: 'legend' }));
        else {
          if (it.shape === 'bar') g.appendChild(Fig.el('rect', { x: cx, y: cy - fs * 0.6, width: fs, height: fs * 0.45, fill: it.color, rx: 1 }));
          else if (it.shape === 'diamond') g.appendChild(Fig.marker(cx + fs / 2, cy - fs * 0.35, fs * 0.4, 'diamond', { fill: it.color }));
          else g.appendChild(Fig.el('rect', { x: cx, y: cy - fs * 0.8, width: fs, height: fs, rx: 2.5, fill: it.color }));
          g.appendChild(Fig.text(cx + fs + 6, cy, it.label, { size: 10.5, fill: f.t.fg, font: f.font, role: 'legend' }));
        }
      }
      cx += w;
    });
    if (g) f.g.appendChild(g);
    return rows * lh;
  }

  function legendItems(cfg, S, T, extra) {
    const items = [];
    if (S.catNames.length && cfg.colourBy !== 'none') {
      items.push({ head: S.catWord || 'Groups' });
      const used = new Set(S.tipsL.map(t => S.catOfTip(t.tip)));
      S.catNames.forEach((nm, i) => { if (used.has(i)) items.push({ label: nm, color: S.colour(i) }); });
    }
    S.rings.forEach(r => {
      if (r.kind === 'cat' && S.catNames === r.names && cfg.colourBy === 'groups') return;
      items.push({ head: r.title });
      r.names.forEach((nm, i) => items.push({ label: nm, color: r.colour ? r.colour(i) : Fig.color(cfg.ringPalette || 'tol', i) }));
    });
    (extra || []).forEach(e => items.push(e));
    return items;
  }

  function legendBox(svg, f, cfg, S, T, extra) {
    if (cfg.legendPos === 'none') return;
    const items = legendItems(cfg, S, T, extra);
    if (!items.length) return;
    const fs = 10.5 * Fig.fs('legend'), lh = fs * 1.5;
    const w = Math.max(...items.map(it => est(it.head || it.label, fs) + (it.head ? 0 : fs + 8))) + 16;
    const h = items.length * lh + 10;
    const pos = cfg.legendPos || 'topleft';
    const x = pos.includes('right') ? f.x1 - w : f.x0;
    const y = pos.includes('bottom') ? f.y1 - h : f.y0;
    const g = Fig.g();
    g.appendChild(Fig.el('rect', { x, y, width: w, height: h, rx: 6, fill: f.t.bg, opacity: 0.9 }));
    items.forEach((it, k) => {
      const yy = y + 8 + k * lh + fs * 0.85;
      if (it.head) { g.appendChild(Fig.text(x + 8, yy, it.head, { size: 10.5, weight: 'bold', fill: f.t.fg, font: f.font, role: 'legend' })); return; }
      if (it.shape === 'bar') g.appendChild(Fig.el('rect', { x: x + 8, y: yy - fs * 0.6, width: fs, height: fs * 0.45, fill: it.color, rx: 1 }));
      else if (it.shape === 'diamond') g.appendChild(Fig.marker(x + 8 + fs / 2, yy - fs * 0.35, fs * 0.4, 'diamond', { fill: it.color }));
      else if (it.shape === 'dot') g.appendChild(Fig.el('circle', { cx: x + 8 + fs / 2, cy: yy - fs * 0.35, r: fs * 0.3, fill: it.color, stroke: f.t.fg }));
      else g.appendChild(Fig.el('rect', { x: x + 8, y: yy - fs * 0.8, width: fs, height: fs, rx: 2.5, fill: it.color }));
      g.appendChild(Fig.text(x + 14 + fs, yy, it.label, { size: 10.5, fill: f.t.fg, font: f.font, role: 'legend', italic: !!it.italic }));
    });
    f.g.appendChild(g);
  }

  function timeExtras(T, cfg) {
    if (!T.timed) return [];
    const out = [];
    if (cfg.hpd !== false) out.push({ label: '95% HPD of node age', color: Fig.alpha(cfg.hpdColour || '#3b6ea8', 0.55), shape: 'bar' });
    if (T.hasCalibrations && cfg.calibMarks !== false) out.push({ label: 'calibrated node', color: cfg.calibColour || '#d9603f', shape: 'diamond' });
    return out;
  }

  const nice = v => (v >= 100 ? Math.round(v) : v >= 10 ? +v.toFixed(0) : v >= 1 ? +v.toFixed(1) : +v.toPrecision(2));

  /* ================================================================
     circular layout
     ================================================================ */
  function circular(cfg, T, S) {
    const W = +cfg.width || 900, H = +cfg.height || 900;
    const svg = Fig.svg(W, H, cfg.theme);
    const defs = Fig.el('defs', {}); svg.appendChild(defs);
    const f = Fig.frame(svg, cfg, { margin: { left: 16, right: 16, top: 50, bottom: 16 } });
    const g = Fig.g(); f.g.appendChild(g);
    const fsTip = (+cfg.labelSize || 10) * Fig.fs('tick');
    const cx = (f.x0 + f.x1) / 2, cy = (f.y0 + f.y1) / 2;
    const R = Math.min(f.x1 - f.x0, f.y1 - f.y0) / 2;
    const open = Math.max(0, Math.min(180, +cfg.openAngle || 0)) * Math.PI / 180;
    const rot = (+cfg.rotate || 0) * Math.PI / 180;
    const a0 = rot + open / 2, span = TAU - open;
    const step = span / S.n;
    const ang = rk => a0 + (rk + 0.5) * step;

    const imgSize = S.images.length ? +cfg.imgSize || 64 : 0;
    const imgBand = imgSize ? imgSize + 18 + (cfg.imgCaptions ? 14 : 0) : 0;
    const arcW = +cfg.arcWidth || 5;
    const anyLabel = S.clades.some(c => c.label) && cfg.cladeLabels !== false;
    const arcBand = cfg.cladeArcs !== false && S.clades.length ? arcW + 8 + (anyLabel ? 13 * Fig.fs('label') + 8 : 0) : 0;
    const ringW = +cfg.ringWidth || 12, ringBand = S.rings.length * (ringW + 3) + (S.rings.length ? 4 : 0);
    const labelBand = cfg.tipLabels === false ? 6 : Math.min(R * 0.35, Math.max(...S.tipsL.map(t => est(T.tipLabel(t.tip), fsTip))) + 12);
    const rTip = Math.max(40, R - imgBand - arcBand - ringBand - labelBand);
    const rIn = rTip * Math.max(0, Math.min(0.6, +cfg.innerHole || 0));
    const rr = x => rIn + (S.maxX ? x / S.maxX : 0) * (rTip - rIn);
    const bw = +cfg.branchWidth || 1.2;
    const fg = f.t.fg;
    const branchCol = v => (cfg.colourBranches !== false ? S.colour(S.catOfNode.get(v)) : null) || fg;

    /* time: epoch bands and circles behind everything */
    if (T.timed && cfg.geoScale !== 'none') {
      const rank = cfg.geoScale || 'epoch';
      const units = GeoTime.within(rank, 0, S.rootAge);
      units.forEach((u, k) => {
        const rOut = rr(S.rootAge - u.top), rInU = rr(Math.max(0, S.rootAge - u.base));
        if (cfg.geoBands !== false && k % 2 === 0) g.appendChild(Fig.el('path', { d: sectorPath(cx, cy, rInU, rOut, a0, a0 + span), fill: f.t.grid === 'none' ? 'rgba(0,0,0,0.05)' : Fig.alpha(f.t.muted, 0.09) }));
      });
      Fig.ticks(0, S.rootAge, 5).forEach(v => {
        if (v > S.rootAge) return;
        g.appendChild(Fig.el('path', { d: arcPath(cx, cy, rr(S.rootAge - v), a0, a0 + span), fill: 'none', stroke: f.t.muted, 'stroke-width': 0.6, 'stroke-dasharray': '2 3', opacity: 0.7 }));
      });
    }

    /* clade shading */
    if (cfg.cladeShade !== false) S.clades.forEach(c => {
      const r0 = rr(S.X.get(c.node)) - 3;
      g.appendChild(Fig.el('path', { d: sectorPath(cx, cy, r0, rTip + labelBand - 4, ang(c.range[0]) - step / 2, ang(c.range[1]) + step / 2), fill: Fig.alpha(c.colour, +cfg.shadeOpacity || 0.14) }));
    });

    /* HPD bars under the branches */
    if (T.timed && cfg.hpd !== false) S.ix.order.forEach(v => {
      if (!v.hpd || TreeOps.isTip(v)) return;
      const a = ang(S.rank.get(v));
      const [x1, y1] = polar(cx, cy, Math.max(rIn * 0.5, rr(S.rootAge - v.hpd[1])), a), [x2, y2] = polar(cx, cy, Math.max(rIn * 0.5, rr(S.rootAge - v.hpd[0])), a);
      g.appendChild(Fig.el('line', { x1, y1, x2, y2, stroke: Fig.alpha(cfg.hpdColour || '#3b6ea8', +cfg.hpdOpacity || 0.45), 'stroke-width': +cfg.hpdWidth || 5, 'stroke-linecap': 'round' }));
    });

    /* branches: an arc at each internal node and a radial segment to each child */
    S.ix.order.forEach(v => {
      if (TreeOps.isTip(v)) return;
      const r = rr(S.X.get(v));
      const ks = v.children.map(c => S.rank.get(c.node));
      const aMin = ang(Math.min(...ks)), aMax = ang(Math.max(...ks));
      g.appendChild(Fig.el('path', { d: arcPath(cx, cy, r, aMin, aMax), fill: 'none', stroke: branchCol(v), 'stroke-width': bw, 'stroke-linecap': 'round' }));
      v.children.forEach(c => {
        const a = ang(S.rank.get(c.node));
        const [x1, y1] = polar(cx, cy, r, a), [x2, y2] = polar(cx, cy, rr(S.X.get(c.node)), a);
        g.appendChild(Fig.el('line', { x1, y1, x2, y2, stroke: branchCol(c.node), 'stroke-width': bw, 'stroke-linecap': 'round' }));
      });
    });
    /* support and calibration marks */
    S.ix.order.forEach(v => {
      if (TreeOps.isTip(v)) return;
      const [x, y] = polar(cx, cy, rr(S.X.get(v)), ang(S.rank.get(v)));
      supportMark(g, cfg, f, v, x, y);
      if (v.calib && cfg.calibMarks !== false) {
        g.appendChild(Fig.marker(x, y, 5, 'diamond', { fill: cfg.calibColour || '#d9603f', stroke: f.t.bg, 'stroke-width': 1 }));
        if (cfg.calibLabels !== false) g.appendChild(Fig.text(x + 6, y - 6, String(v.calibLabel || ''), { size: 9, weight: 'bold', fill: cfg.calibColour || '#d9603f', font: f.font, role: 'label', halo: f.t.bg }));
      }
    });

    /* tips: symbols, aligned leaders and labels */
    const labelR0 = cfg.alignTips && !T.timed ? rTip + 6 : null;
    S.tipsL.forEach(t => {
      const a = ang(S.rank.get(t));
      const rt = rr(S.X.get(t));
      const col = S.colour(S.catOfTip(t.tip));
      if (labelR0 && rt < rTip - 1) {
        const [x1, y1] = polar(cx, cy, rt + 2, a), [x2, y2] = polar(cx, cy, rTip + 2, a);
        g.appendChild(Fig.el('line', { x1, y1, x2, y2, stroke: f.t.muted, 'stroke-width': 0.5, 'stroke-dasharray': '1 2' }));
      }
      if (+cfg.pointSize > 0 && col) { const [x, y] = polar(cx, cy, rt, a); g.appendChild(Fig.el('circle', { cx: x, cy: y, r: +cfg.pointSize, fill: col, stroke: f.t.bg, 'stroke-width': 0.8 })); }
      if (cfg.tipLabels !== false) {
        const r0 = (labelR0 || rt) + 4 + (+cfg.pointSize || 0);
        const [x, y] = polar(cx, cy, r0, a);
        const deg = a * 180 / Math.PI;
        const flip = Math.cos(a) < 0;
        g.appendChild(Fig.text(x, y, T.tipLabel(t.tip), { size: +cfg.labelSize || 10, anchor: flip ? 'end' : 'start', baseline: 'central', fill: cfg.colourLabels && col ? col : fg, font: f.font, italic: !!cfg.italic, role: 'tick', rotate: flip ? deg + 180 : deg }));
      }
    });

    /* rings */
    S.rings.forEach((ring, k) => {
      const r0 = rTip + labelBand + 4 + k * (ringW + 3), r1 = r0 + ringW;
      S.tipsL.forEach(t => {
        const a = ang(S.rank.get(t));
        const aa = a - step / 2, ab = a + step / 2 - Math.min(step * 0.08, 0.004);
        if (ring.kind === 'q') {
          const q = ring.of(t.tip) || [];
          let acc = 0;
          q.forEach((v, j) => { if (v <= 0) return; g.appendChild(Fig.el('path', { d: sectorPath(cx, cy, r0 + acc * ringW, r0 + (acc + v) * ringW, aa, ab), fill: ring.colour ? ring.colour(j) : Fig.color(cfg.palette, j) })); acc += v; });
        } else {
          const ci = ring.of(t.tip);
          if (ci == null) return;
          g.appendChild(Fig.el('path', { d: sectorPath(cx, cy, r0, r1, aa, ab), fill: ring.colour ? ring.colour(ci) : Fig.color(cfg.ringPalette || 'tol', ci) }));
        }
      });
    });

    /* clade arcs and names */
    const rArc = rTip + labelBand + ringBand + 5;
    if (cfg.cladeArcs !== false) S.clades.forEach(c => {
      const aa = ang(c.range[0]) - step * 0.4, ab = ang(c.range[1]) + step * 0.4;
      g.appendChild(Fig.el('path', { d: arcPath(cx, cy, rArc + arcW / 2, aa, ab), fill: 'none', stroke: c.colour, 'stroke-width': arcW, 'stroke-linecap': 'butt' }));
      if (!c.label || cfg.cladeLabels === false) return;
      const mid = (aa + ab) / 2, fsz = 12 * Fig.fs('label');
      const rT = rArc + arcW + 5 + fsz * 0.75;
      const arcLen = (ab - aa) * rT;
      const bottom = Math.sin(mid) > 0;
      if (arcLen > est(c.name, fsz) * 1.05) {
        const pid = 'tvarc' + (++uid);
        defs.appendChild(Fig.el('path', { id: pid, d: bottom ? arcPath(cx, cy, rT + fsz * 0.35, ab, aa).replace(/ 0 ([01]) 1 /, ' 0 $1 0 ') : arcPath(cx, cy, rT - fsz * 0.1, aa, ab) }));
        const tx = Fig.el('text', { 'font-family': f.font, 'font-size': fsz.toFixed(1), 'font-weight': 'bold', fill: c.colour });
        const tp = Fig.el('textPath', { startOffset: '50%', 'text-anchor': 'middle' }, c.name);
        tp.setAttribute('href', '#' + pid); tp.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', '#' + pid);
        tx.appendChild(tp); g.appendChild(tx);
      } else {
        const [x, y] = polar(cx, cy, rArc + arcW + 5, mid);
        const deg = mid * 180 / Math.PI, flip = Math.cos(mid) < 0;
        g.appendChild(Fig.text(x, y, c.name, { size: 11, weight: 'bold', anchor: flip ? 'end' : 'start', baseline: 'central', fill: c.colour, font: f.font, role: 'label', rotate: flip ? deg + 180 : deg }));
      }
    });

    /* images around the circle */
    if (S.images.length) {
      const rImg = R - imgSize / 2 - (cfg.imgCaptions ? 14 : 4);
      let size = imgSize;
      const need = S.images.length * (size + 8) / rImg;
      if (need > span) size = Math.max(16, span * rImg / S.images.length - 8);
      const targets = S.images.map(it => ang(it.target));
      const pos = relax(targets, (size + 8) / rImg, a0 + size / 2 / rImg, a0 + span - size / 2 / rImg, open < 1e-3);
      const rEdge = rArc + (arcBand ? arcW + 2 : 0);
      S.images.forEach((it, k) => {
        const [ix0, iy0] = polar(cx, cy, rEdge, targets[k]);
        const [ix1, iy1] = polar(cx, cy, rImg - size / 2 - 2, pos[k]);
        if (cfg.imgLeaders !== false) g.appendChild(Fig.el('path', { d: `M${P(ix0, iy0)} L${P(ix1, iy1)}`, fill: 'none', stroke: it.colour || f.t.muted, 'stroke-width': 0.8, opacity: 0.8 }));
        const [x, y] = polar(cx, cy, rImg, pos[k]);
        g.appendChild(imageNode(defs, cfg, f, it, x, y, size));
      });
    }

    /* time axis in the open wedge */
    if (T.timed && open > 0.12 && cfg.timeAxis !== false) {
      const axA = rot;
      const ux = Math.cos(axA), uy = Math.sin(axA), nx = -uy, ny = ux;
      const at = r => [cx + r * ux, cy + r * uy];
      const [ax0, ay0] = at(rIn), [ax1, ay1] = at(rTip);
      g.appendChild(Fig.el('line', { x1: ax0, y1: ay0, x2: ax1, y2: ay1, stroke: fg, 'stroke-width': 1 }));
      Fig.ticks(0, S.rootAge, 5).forEach(v => {
        if (v > S.rootAge) return;
        const [x, y] = at(rr(S.rootAge - v));
        g.appendChild(Fig.el('line', { x1: x, y1: y, x2: x + nx * 4, y2: y + ny * 4, stroke: fg, 'stroke-width': 1 }));
        g.appendChild(Fig.text(x + nx * 13, y + ny * 13, Fig.fmtTick(v), { size: 9, anchor: 'middle', baseline: 'central', fill: fg, font: f.font, role: 'tick' }));
      });
      const [lx, ly] = at(rTip + 8);
      g.appendChild(Fig.text(lx, ly, 'Ma', { size: 10, baseline: 'central', fill: fg, font: f.font, role: 'axis' }));
      if (cfg.geoScale !== 'none') {
        const rank = cfg.geoScale || 'epoch';
        GeoTime.within(rank, 0, S.rootAge).forEach(u => {
          const mid = S.rootAge - (Math.min(u.base, S.rootAge) + u.top) / 2;
          const w = rr(S.rootAge - u.top) - rr(Math.max(0, S.rootAge - u.base));
          const nm = w > est(u.name, 8.5) ? u.name : (w > est(u.name.slice(0, 3), 8.5) ? u.name.slice(0, 3) + '.' : '');
          if (!nm) return;
          const [x, y] = at(rr(mid));
          g.appendChild(Fig.text(x - nx * 10, y - ny * 10, nm, { size: 8.5, anchor: 'middle', baseline: 'central', fill: f.t.muted, font: f.font, role: 'label' }));
        });
      }
    }

    legendBox(svg, f, cfg, S, T, timeExtras(T, cfg));
    const notes = [T.note, S.rootNote].filter(Boolean);
    if (notes.length) g.appendChild(Fig.text(f.x1, H - 6, notes.join(' · '), { size: 9.5, anchor: 'end', fill: f.t.muted, font: f.font, role: 'label' }));
    return svg;
  }

  /* ================================================================
     rectangular layout
     ================================================================ */
  function rectangular(cfg, T, S) {
    const W = +cfg.width || 900;
    const rowH = +cfg.rowH || 16;
    const fsTip = (+cfg.labelSize || 10) * Fig.fs('tick');
    const imgSize = S.images.length ? +cfg.imgSize || 56 : 0;
    const geoRows = T.timed && cfg.geoScale !== 'none' ? (cfg.geoScale === 'both' ? 2 : 1) : 0;
    const bottom = T.timed ? 46 + geoRows * 18 : 44;
    const minH = S.images.length ? S.images.length * (imgSize + 10) : 0;
    const labelBand = cfg.tipLabels === false ? 8 : Math.max(...S.tipsL.map(t => est(T.tipLabel(t.tip), fsTip))) + 14;
    const ringW = +cfg.ringWidth || 12, ringBand = S.rings.length * (ringW + 3) + (S.rings.length ? 6 : 0);
    const arcW = +cfg.arcWidth || 5;
    const anyLabel = S.clades.some(c => c.label) && cfg.cladeLabels !== false;
    const cladeBand = cfg.cladeArcs !== false && S.clades.length ? arcW + 8 + (anyLabel ? Math.max(...S.clades.filter(c => c.label).map(c => est(c.name, 11.5 * Fig.fs('label')))) + 10 : 0) : 0;
    const imgBand = imgSize ? imgSize + 40 : 0;
    const legendH = legendRows(null, cfg, S, T, timeExtras(T, cfg), 0, 0, W - 48, true);
    const ringHead = S.rings.length && cfg.ringTitles !== false ? 40 : 0;
    const top0 = (cfg.title ? 50 : 26) + ringHead, bottom0 = bottom + (legendH ? legendH + 14 : 0) + (T.note ? 14 : 0);
    const H = Math.max(+cfg.height || 300, top0 + bottom0 + Math.max(S.n * rowH, minH) + rowH);
    /* half a row of room above the first tip and below the last, so shading never
       reaches the title or the axis */
    const plotH = S.n > 1 ? (H - top0 - bottom0) * (S.n - 1) / S.n : H - top0 - bottom0;
    const halfRow = S.n > 1 ? plotH / (S.n - 1) / 2 : rowH / 2;
    const svg = Fig.svg(W, H, cfg.theme);
    const defs = Fig.el('defs', {}); svg.appendChild(defs);
    const f = Fig.frame(svg, cfg, { margin: { left: 24, right: labelBand + ringBand + cladeBand + imgBand + 10, top: top0 + halfRow + (cfg.title ? 0 : 22), bottom: bottom0 + halfRow } });
    const g = Fig.g(); f.g.appendChild(g);
    const hpdLeft = T.timed && cfg.hpd !== false ? Math.max(0, ...S.ix.order.filter(v => v.hpd).map(v => v.hpd[1] - S.rootAge)) : 0;
    const span = S.maxX + hpdLeft;
    const xs = v => f.x0 + ((v + hpdLeft) / (span || 1)) * (f.x1 - f.x0);
    const ys = rk => f.y0 + (S.n > 1 ? rk / (S.n - 1) : 0.5) * (f.y1 - f.y0);
    const bw = +cfg.branchWidth || 1.4;
    const fg = f.t.fg;
    const branchCol = v => (cfg.colourBranches !== false ? S.colour(S.catOfNode.get(v)) : null) || fg;
    const xTipEnd = f.x1;
    const half = S.n > 1 ? (f.y1 - f.y0) / (S.n - 1) / 2 : rowH / 2;

    /* geological bands and boundaries behind the tree */
    if (T.timed && cfg.geoScale !== 'none') {
      const rank = cfg.geoScale === 'both' ? 'epoch' : (cfg.geoScale || 'epoch');
      const units = GeoTime.within(rank, 0, S.rootAge + hpdLeft);
      units.forEach((u, k) => {
        const xa = xs(S.rootAge - Math.min(u.base, S.rootAge + hpdLeft)), xb = xs(S.rootAge - u.top);
        if (cfg.geoBands !== false && k % 2 === 0) g.appendChild(Fig.el('rect', { x: xa, y: f.y0 - half, width: Math.max(0, xb - xa), height: f.y1 - f.y0 + 2 * half, fill: Fig.alpha(f.t.muted, 0.07) }));
        if (cfg.geoLines) g.appendChild(Fig.el('line', { x1: xa, x2: xa, y1: f.y0 - half, y2: f.y1 + half, stroke: f.t.muted, 'stroke-width': 0.6, 'stroke-dasharray': '3 3' }));
      });
    }

    if (cfg.cladeShade !== false) S.clades.forEach(c => {
      const x0 = xs(S.X.get(c.node)) - 4;
      g.appendChild(Fig.el('rect', { x: x0, y: ys(c.range[0]) - half + 1, width: Math.max(0, xTipEnd + labelBand - 6 - x0), height: ys(c.range[1]) - ys(c.range[0]) + 2 * half - 2, rx: 3, fill: Fig.alpha(c.colour, +cfg.shadeOpacity || 0.14) }));
    });

    if (T.timed && cfg.hpd !== false) S.ix.order.forEach(v => {
      if (!v.hpd || TreeOps.isTip(v)) return;
      const y = ys(S.rank.get(v));
      const xa = xs(S.rootAge - v.hpd[1]), xb = xs(S.rootAge - v.hpd[0]);
      g.appendChild(Fig.el('rect', { x: xa, y: y - (+cfg.hpdWidth || 6) / 2, width: Math.max(1, xb - xa), height: +cfg.hpdWidth || 6, rx: 2, fill: Fig.alpha(cfg.hpdColour || '#3b6ea8', +cfg.hpdOpacity || 0.45) }));
    });

    S.ix.order.forEach(v => {
      if (TreeOps.isTip(v)) return;
      const x = xs(S.X.get(v)), y = ys(S.rank.get(v));
      v.children.forEach(c => {
        const xc = xs(S.X.get(c.node)), yc = ys(S.rank.get(c.node));
        g.appendChild(Fig.el('path', { d: `M${P(x, y)} V${yc.toFixed(1)} H${xc.toFixed(1)}`, fill: 'none', stroke: branchCol(c.node), 'stroke-width': bw, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
      });
    });
    S.ix.order.forEach(v => {
      if (TreeOps.isTip(v)) return;
      const x = xs(S.X.get(v)), y = ys(S.rank.get(v));
      supportMark(g, cfg, f, v, x, y, 'end');
      if (v.calib && cfg.calibMarks !== false) {
        g.appendChild(Fig.marker(x, y, 5, 'diamond', { fill: cfg.calibColour || '#d9603f', stroke: f.t.bg, 'stroke-width': 1 }));
        if (cfg.calibLabels !== false && v.calibLabel) g.appendChild(Fig.text(x - 7, y + 12, String(v.calibLabel), { size: 9, weight: 'bold', anchor: 'end', fill: cfg.calibColour || '#d9603f', font: f.font, role: 'label', halo: f.t.bg }));
      }
      if (T.timed && cfg.nodeAges) g.appendChild(Fig.text(x + 3, y - 5, nice(v.age), { size: 8.5, fill: f.t.muted, font: f.font, role: 'label', halo: f.t.bg }));
    });

    const align = cfg.alignTips && !T.timed;
    S.tipsL.forEach(t => {
      const x = xs(S.X.get(t)), y = ys(S.rank.get(t));
      const col = S.colour(S.catOfTip(t.tip));
      const lx = align ? xTipEnd : x;
      if (align && x < xTipEnd - 2) g.appendChild(Fig.el('line', { x1: x + 2, x2: xTipEnd, y1: y, y2: y, stroke: f.t.muted, 'stroke-width': 0.5, 'stroke-dasharray': '1 2' }));
      if (+cfg.pointSize > 0 && col) g.appendChild(Fig.el('circle', { cx: x, cy: y, r: +cfg.pointSize, fill: col, stroke: f.t.bg, 'stroke-width': 0.8 }));
      if (cfg.tipLabels !== false) g.appendChild(Fig.text(lx + 5 + (+cfg.pointSize || 0), y, T.tipLabel(t.tip), { size: +cfg.labelSize || 10, baseline: 'central', fill: cfg.colourLabels && col ? col : fg, font: f.font, italic: !!cfg.italic, role: 'tick' }));
    });

    const colX = xTipEnd + labelBand;
    S.rings.forEach((ring, k) => {
      const x0 = colX + k * (ringW + 3);
      S.tipsL.forEach(t => {
        const y = ys(S.rank.get(t)), hh = Math.max(2, 2 * half - 1);
        if (ring.kind === 'q') {
          let acc = 0;
          (ring.of(t.tip) || []).forEach((v, j) => { if (v <= 0) return; g.appendChild(Fig.el('rect', { x: x0 + acc * ringW, y: y - hh / 2, width: v * ringW, height: hh, fill: ring.colour ? ring.colour(j) : Fig.color(cfg.palette, j) })); acc += v; });
        } else {
          const ci = ring.of(t.tip); if (ci == null) return;
          g.appendChild(Fig.el('rect', { x: x0, y: y - hh / 2, width: ringW, height: hh, fill: ring.colour ? ring.colour(ci) : Fig.color(cfg.ringPalette || 'tol', ci) }));
        }
      });
      if (cfg.ringTitles !== false) g.appendChild(Fig.text(x0 + ringW / 2, f.y0 - half - 6, ring.title, { size: 8.5, anchor: 'start', fill: f.t.muted, font: f.font, role: 'label', rotate: -50 }));
    });

    const barX = colX + ringBand + 3;
    if (cfg.cladeArcs !== false) S.clades.forEach(c => {
      const y0 = ys(c.range[0]) - half * 0.8, y1 = ys(c.range[1]) + half * 0.8;
      g.appendChild(Fig.el('rect', { x: barX, y: y0, width: arcW, height: Math.max(2, y1 - y0), rx: arcW / 2, fill: c.colour }));
      if (c.label && cfg.cladeLabels !== false) g.appendChild(Fig.text(barX + arcW + 6, (y0 + y1) / 2, c.name, { size: 11.5, weight: 'bold', baseline: 'central', fill: c.colour, font: f.font, role: 'label' }));
    });

    if (S.images.length) {
      let size = imgSize;
      const avail = f.y1 - f.y0 + 2 * half;
      if (S.images.length * (size + 10) > avail + 60) size = Math.max(16, (avail + 60) / S.images.length - 10);
      const xImg = f.x1 + labelBand + ringBand + cladeBand + 26 + size / 2;
      const targets = S.images.map(it => ys(it.target));
      const pos = relax(targets, size + 10 + (cfg.imgCaptions ? 12 : 0), f.y0 - half + size / 2, f.y1 + half - size / 2, false);
      /* leaders start after the clade names, never across them */
      const xEdge = f.x1 + labelBand + ringBand + cladeBand;
      S.images.forEach((it, k) => {
        if (cfg.imgLeaders !== false) g.appendChild(Fig.el('path', { d: `M${P(xEdge, targets[k])} C${P(xEdge + 14, targets[k])} ${P(xImg - size / 2 - 14, pos[k])} ${P(xImg - size / 2 - 2, pos[k])}`, fill: 'none', stroke: it.colour || f.t.muted, 'stroke-width': 0.8, opacity: 0.8 }));
        g.appendChild(imageNode(defs, cfg, f, it, xImg, pos[k], size));
      });
    }

    /* axis: time before present with the geological scale, or a scale bar */
    if (T.timed) {
      const yA = f.y1 + half + 8;
      g.appendChild(Fig.el('line', { x1: f.x0, x2: f.x1, y1: yA, y2: yA, stroke: f.t.axis, 'stroke-width': 1 }));
      Fig.ticks(0, S.rootAge + hpdLeft, 7).forEach(v => {
        const x = xs(S.rootAge - v); if (x < f.x0 - 1) return;
        g.appendChild(Fig.el('line', { x1: x, x2: x, y1: yA, y2: yA + 4, stroke: f.t.axis }));
        g.appendChild(Fig.text(x, yA + 14, Fig.fmtTick(v), { size: 9.5, anchor: 'middle', fill: fg, font: f.font, role: 'tick' }));
      });
      g.appendChild(Fig.text(f.x1 + 6, yA + 14, 'Ma', { size: 10, fill: fg, font: f.font, role: 'axis' }));
      const ranks = cfg.geoScale === 'both' ? ['epoch', 'period'] : cfg.geoScale === 'none' ? [] : [cfg.geoScale || 'epoch'];
      ranks.forEach((rk, row) => {
        const yb = yA + 22 + row * 18;
        GeoTime.within(rk, 0, S.rootAge + hpdLeft).forEach(u => {
          const xa = Math.max(f.x0, xs(S.rootAge - u.base)), xb = Math.min(f.x1, xs(S.rootAge - u.top));
          if (xb - xa <= 0.5) return;
          g.appendChild(Fig.el('rect', { x: xa, y: yb, width: xb - xa, height: 15, fill: cfg.geoColours === false ? Fig.alpha(f.t.muted, 0.12) : u.color, stroke: f.t.bg, 'stroke-width': 0.8 }));
          /* the longest form that fits: Pliocene → Pli. (never Pl., which Pleistocene would share) */
          const nm = [u.name, u.name.slice(0, 3) + '.', u.name.slice(0, 1)].find(s => xb - xa > est(s, 8.5) + 5) || '';
          if (nm) g.appendChild(Fig.text((xa + xb) / 2, yb + 7.5, nm, { size: 8.5, anchor: 'middle', baseline: 'central', fill: '#1b1f2a', font: f.font, role: 'label' }));
        });
      });
    } else if (cfg.scaleBar !== false && S.maxX > 0 && cfg.branches !== 'cladogram') {
      const niceV = Fig.ticks(0, S.maxX, 5)[1] || S.maxX / 4;
      const by = f.y1 + half + 22;
      g.appendChild(Fig.el('line', { x1: f.x0, x2: xs(niceV) - xs(0) + f.x0, y1: by, y2: by, stroke: fg, 'stroke-width': 1.4 }));
      g.appendChild(Fig.text(f.x0 + (xs(niceV) - xs(0)) / 2, by - 5, Fig.fmtTick(niceV), { size: 9.5, anchor: 'middle', fill: f.t.muted, font: f.font, role: 'label' }));
    }

    const legendY = f.y1 + half + bottom + 8;
    legendRows(f, cfg, S, T, timeExtras(T, cfg), f.x0, legendY, W - 48, false);
    const notes = [T.note, S.rootNote].filter(Boolean);
    if (notes.length) g.appendChild(Fig.text(f.x0, H - 8, notes.join(' · '), { size: 9.5, fill: f.t.muted, font: f.font, role: 'label' }));
    return svg;
  }

  /* ================================================================
     unrooted (equal-angle) layout, for trees whose root means nothing
     ================================================================ */
  function unrooted(cfg, T, S) {
    const W = +cfg.width || 860, H = +cfg.height || 760;
    const svg = Fig.svg(W, H, cfg.theme);
    const f = Fig.frame(svg, cfg, { margin: { left: 20, right: 20, top: 50, bottom: 30 } });
    const g = Fig.g(); f.g.appendChild(g);
    const count = S.tipCount;
    const pos = new Map();
    const walk = (v, x, y, aa, ab) => {
      pos.set(v, [x, y]);
      let a = aa;
      v.children.forEach(c => {
        const sp = (ab - aa) * count.get(c.node) / count.get(v);
        const mid = a + sp / 2, len = cfg.branches === 'cladogram' ? 1 : (c.len || 0);
        walk(c.node, x + len * Math.cos(mid), y + len * Math.sin(mid), a, a + sp);
        a += sp;
      });
    };
    walk(S.root, 0, 0, 0, TAU);
    const pts = [...pos.values()];
    const minX = Math.min(...pts.map(p => p[0])), maxX = Math.max(...pts.map(p => p[0])), minY = Math.min(...pts.map(p => p[1])), maxY = Math.max(...pts.map(p => p[1]));
    const pad = cfg.tipLabels === false ? 20 : 80;
    const s = Math.min((f.x1 - f.x0 - 2 * pad) / ((maxX - minX) || 1), (f.y1 - f.y0 - 2 * pad) / ((maxY - minY) || 1));
    const ox = (f.x0 + f.x1) / 2 - (minX + maxX) / 2 * s, oy = (f.y0 + f.y1) / 2 - (minY + maxY) / 2 * s;
    const XY = v => [ox + pos.get(v)[0] * s, oy + pos.get(v)[1] * s];
    const branchCol = v => (cfg.colourBranches !== false ? S.colour(S.catOfNode.get(v)) : null) || f.t.fg;
    S.ix.order.forEach(v => v.children.forEach(c => {
      const [x1, y1] = XY(v), [x2, y2] = XY(c.node);
      g.appendChild(Fig.el('line', { x1, y1, x2, y2, stroke: branchCol(c.node), 'stroke-width': +cfg.branchWidth || 1.3, 'stroke-linecap': 'round' }));
    }));
    S.ix.order.forEach(v => { if (!TreeOps.isTip(v)) { const [x, y] = XY(v); supportMark(g, cfg, f, v, x, y); } });
    S.tipsL.forEach(t => {
      const [x, y] = XY(t);
      const par = S.ix.parent.get(t);
      const [px, py] = par ? XY(par) : [x - 1, y];
      const a = Math.atan2(y - py, x - px), flip = Math.cos(a) < 0;
      const col = S.colour(S.catOfTip(t.tip));
      if (+cfg.pointSize > 0 && col) g.appendChild(Fig.el('circle', { cx: x, cy: y, r: +cfg.pointSize, fill: col, stroke: f.t.bg, 'stroke-width': 0.8 }));
      if (cfg.tipLabels !== false) g.appendChild(Fig.text(x + Math.cos(a) * 7, y + Math.sin(a) * 7, T.tipLabel(t.tip), { size: +cfg.labelSize || 10, anchor: flip ? 'end' : 'start', baseline: 'central', fill: cfg.colourLabels && col ? col : f.t.fg, font: f.font, italic: !!cfg.italic, role: 'tick', rotate: (flip ? a + Math.PI : a) * 180 / Math.PI }));
    });
    legendBox(svg, f, cfg, S, T);
    if (T.note) g.appendChild(Fig.text(W - 10, H - 6, T.note, { size: 9.5, anchor: 'end', fill: f.t.muted, font: f.font, role: 'label' }));
    return svg;
  }

  TV.render = (cfg, T) => {
    const S = prepare(cfg, T);
    if (S.n < 2) { const svg = Fig.svg(cfg.width || 600, 200, cfg.theme); svg.appendChild(Fig.text(20, 100, 'The tree has fewer than two tips.', { size: 13 })); return svg; }
    const layout = cfg.layout || 'circular';
    if (layout === 'rect') return rectangular(cfg, T, S);
    if (layout === 'unrooted') return unrooted(cfg, T, S);
    return circular(cfg, T, S);
  };

  /* the editor controls every tree figure shares; `extra` adds data-specific ones */
  TV.controls = (T, o) => {
    o = o || {};
    const c = [
      { key: 'title', label: 'Title', type: 'text' },
      { key: 'layout', label: 'Layout', type: 'select', options: [['circular', 'circular'], ['rect', 'rectangular'], ['unrooted', 'unrooted (equal angle)']] },
      { key: 'openAngle', label: 'Opening of the circle (°)', type: 'range', min: 0, max: 120, step: 5 },
      { key: 'rotate', label: 'Rotate the circle (°)', type: 'range', min: -180, max: 180, step: 5 },
      { key: 'innerHole', label: 'Empty centre', type: 'range', min: 0, max: 0.5, step: 0.02 },
    ];
    if (!T.timed) c.push({ key: 'branches', label: 'Branch lengths', type: 'select', options: [['phylogram', 'proportional (phylogram)'], ['cladogram', 'ignored, tips aligned (cladogram)']] });
    if (!T.timed) c.push({ key: 'alignTips', label: 'Align tip labels', type: 'checkbox' });
    if (T.canReroot && !T.timed) {
      c.push({ key: 'rooting', label: 'Root', type: 'select', options: [['asis', 'as computed'], ['midpoint', 'midpoint'], ['outgroup', 'outgroup (names below)']] });
      c.push({ key: 'outgroup', label: 'Outgroup tips (comma-separated)', type: 'text' });
    }
    c.push({ key: 'ladderize', label: 'Order of the branches', type: 'select', options: [['none', 'as computed'], ['up', 'ladderized, small clades first'], ['down', 'ladderized, large clades first']] });
    const colourOpts = [['none', 'no colour'], ['clusters', 'clades cut from the tree']];
    if (T.tipGroup) colourOpts.splice(1, 0, ['groups', `by ${String(T.groupWord || 'group').toLowerCase()}`]);
    c.push({ key: 'colourBy', label: 'Colour', type: 'select', options: colourOpts });
    c.push({ key: 'k', label: 'Number of clades (when cut)', type: 'range', min: 2, max: 12, step: 1 });
    c.push({ key: 'clusterNames', label: 'Clade names (comma-separated)', type: 'text' });
    c.push({ key: 'colourBranches', label: 'Colour the branches', type: 'checkbox' });
    c.push({ key: 'cladeShade', label: 'Shade the clades', type: 'checkbox' });
    c.push({ key: 'shadeOpacity', label: 'Shade opacity', type: 'range', min: 0.04, max: 0.5, step: 0.02 });
    c.push({ key: 'cladeArcs', label: 'Clade bars / arcs', type: 'checkbox' });
    c.push({ key: 'cladeLabels', label: 'Clade names', type: 'checkbox' });
    c.push({ key: 'arcWidth', label: 'Arc width', type: 'range', min: 2, max: 14, step: 1 });
    (T.rings || []).forEach(r => c.push({ key: 'ring_' + r.key, label: 'Ring: ' + r.title, type: 'checkbox' }));
    if ((T.rings || []).length) c.push({ key: 'ringWidth', label: 'Ring width', type: 'range', min: 4, max: 30, step: 1 });
    c.push({ key: 'images', label: 'Images', type: 'select', options: [['none', 'none'], ['tips', 'one per tip'], ['groups', 'one per group or clade']] });
    c.push({ key: 'imgSize', label: 'Image size', type: 'range', min: 24, max: 160, step: 2 });
    c.push({ key: 'imgFrame', label: 'Image frame', type: 'select', options: [['circle', 'circle'], ['rounded', 'rounded square'], ['square', 'square'], ['none', 'no frame (whole image)']] });
    c.push({ key: 'imgBorder', label: 'Frame line width', type: 'range', min: 0, max: 6, step: 0.5 });
    c.push({ key: 'imgBorderColour', label: 'Frame colour', type: 'select', options: [['clade', 'colour of the clade'], ['neutral', 'neutral grey']] });
    c.push({ key: 'imgBackdrop', label: 'Tinted backdrop behind images', type: 'checkbox' });
    c.push({ key: 'imgLeaders', label: 'Lines from images to their branch', type: 'checkbox' });
    c.push({ key: 'imgCaptions', label: 'Names under the images', type: 'checkbox' });
    c.push({ key: 'support', label: 'Support', type: 'select', options: [['dots', 'dots at the nodes'], ['numbers', 'numbers'], ['none', 'hidden']] });
    c.push({ key: 'minSupport', label: 'Hide support below (%)', type: 'range', min: 0, max: 95, step: 5 });
    c.push({ key: 'strongSupport', label: 'Filled dot from (%)', type: 'range', min: 50, max: 100, step: 5 });
    if (T.timed) {
      c.push({ key: 'geoScale', label: 'Geological scale', type: 'select', options: [['epoch', 'epochs'], ['period', 'periods'], ['stage', 'stages'], ['both', 'epochs + periods (rectangular)'], ['none', 'none']] });
      c.push({ key: 'geoBands', label: 'Alternate shaded time bands', type: 'checkbox' });
      c.push({ key: 'geoLines', label: 'Dashed boundary lines (rectangular)', type: 'checkbox' });
      c.push({ key: 'geoColours', label: 'ICS colours in the scale', type: 'checkbox' });
      c.push({ key: 'hpd', label: '95% HPD bars', type: 'checkbox' });
      c.push({ key: 'hpdColour', label: 'HPD bar colour', type: 'color' });
      c.push({ key: 'hpdWidth', label: 'HPD bar width', type: 'range', min: 2, max: 14, step: 1 });
      c.push({ key: 'nodeAges', label: 'Print node ages (rectangular)', type: 'checkbox' });
      c.push({ key: 'calibMarks', label: 'Mark calibrated nodes', type: 'checkbox' });
      c.push({ key: 'calibColour', label: 'Calibration colour', type: 'color' });
    } else c.push({ key: 'scaleBar', label: 'Scale bar', type: 'checkbox' });
    c.push({ key: 'tipLabels', label: 'Tip labels', type: 'checkbox' });
    c.push({ key: 'labelSize', label: 'Tip label size', type: 'range', min: 5, max: 16, step: 0.5 });
    c.push({ key: 'italic', label: 'Italic names', type: 'checkbox' });
    c.push({ key: 'colourLabels', label: 'Colour tip labels', type: 'checkbox' });
    c.push({ key: 'pointSize', label: 'Tip symbol size', type: 'range', min: 0, max: 8, step: 0.5 });
    c.push({ key: 'rowH', label: 'Row height (rectangular)', type: 'range', min: 6, max: 40, step: 1 });
    c.push({ key: 'branchWidth', label: 'Branch width', type: 'range', min: 0.4, max: 4, step: 0.1 });
    c.push({ key: 'legendPos', label: 'Legend', type: 'select', options: [['topleft', 'top left'], ['topright', 'top right'], ['bottomleft', 'bottom left'], ['bottomright', 'bottom right'], ['none', 'none']] });
    c.push({ key: 'palette', label: 'Palette', type: 'select', options: Object.entries(Fig.paletteNames), shared: true });
    return c.concat(o.extra || []);
  };

  TV.defaults = (T, o) => Object.assign({
    layout: 'circular', openAngle: T.timed ? 30 : 0, rotate: 0, innerHole: T.timed ? 0.06 : 0.04,
    branches: 'phylogram', alignTips: false, rooting: T.canReroot ? 'midpoint' : 'asis', outgroup: '', ladderize: 'up',
    colourBy: T.tipGroup ? 'groups' : 'clusters', k: 3, clusterNames: '', colourBranches: true, cladeShade: true, shadeOpacity: 0.13,
    cladeArcs: true, cladeLabels: true, arcWidth: 5, ringWidth: 12,
    images: 'none', imgSize: 64, imgFrame: 'circle', imgBorder: 2, imgBorderColour: 'clade', imgBackdrop: false, imgLeaders: true, imgCaptions: false,
    support: 'dots', minSupport: 50, strongSupport: 90,
    geoScale: 'epoch', geoBands: true, geoLines: false, geoColours: true, hpd: true, hpdColour: '#3b6ea8', hpdWidth: 5, nodeAges: false, calibMarks: true, calibColour: '#d9603f',
    scaleBar: true, tipLabels: true, labelSize: 10, italic: false, colourLabels: false, pointSize: 2.5, rowH: 16, branchWidth: 1.2,
    legendPos: 'topleft', palette: 'cluster', width: 900, height: 900,
  }, o || {});

  window.TV = TV;
})();
