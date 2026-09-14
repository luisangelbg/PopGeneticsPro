/* PopGeneticsPro — hand-drawn SVG illustrations.
   Every picture is generated here, with CSS variable colours, so the whole app
   follows the light/dark theme and nothing depends on external images.
   All functions return an SVG string; the home page injects them. */

(function () {

  /* seeded helpers so every illustration is identical on every reload */
  const R = (seed) => rng(seed);

  function path(d, cls, extra) { return `<path d="${d}" class="${cls}" ${extra || ''}/>`; }
  function txt(x, y, s, cls, size, anchor, extra) {
    return `<text x="${x}" y="${y}" class="${cls || 'art-mut'}" font-size="${size || 8}" text-anchor="${anchor || 'start'}" ${extra || ''}>${s}</text>`;
  }
  function wrap(vb, inner, extra) {
    return `<svg viewBox="${vb}" xmlns="http://www.w3.org/2000/svg" ${extra || ''}>${inner}</svg>`;
  }
  /* smooth polyline through points */
  function poly(pts) { return pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' '); }

  /* ============================================================
     HERO — a double helix whose strands resolve into populations
     and an admixture barplot. The signature image of the app.
     ============================================================ */
  function hero() {
    const W = 520, H = 430;
    let s = '';

    /* soft background discs */
    s += `<defs>
      <radialGradient id="hg1" cx="50%" cy="35%" r="65%">
        <stop offset="0%" stop-color="var(--primary)" stop-opacity="0.16"/>
        <stop offset="100%" stop-color="var(--primary)" stop-opacity="0"/>
      </radialGradient>
      <linearGradient id="hg2" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="var(--accent)" stop-opacity="0.55"/>
        <stop offset="100%" stop-color="var(--accent)" stop-opacity="0.05"/>
      </linearGradient>
    </defs>`;
    s += `<rect x="0" y="0" width="${W}" height="${H}" fill="url(#hg1)"/>`;

    /* ---- the helix ---- */
    const cx = 262, top = 18, bot = 268, turns = 3.1, amp = 74;
    const strand = (phase) => {
      const pts = [];
      for (let t = 0; t <= 1.0001; t += 0.01) {
        const y = top + t * (bot - top);
        const x = cx + amp * Math.sin(2 * Math.PI * turns * t + phase);
        pts.push([x, y]);
      }
      return poly(pts);
    };
    /* rungs = base pairs, coloured as alleles */
    for (let t = 0; t <= 1.0001; t += 0.0345) {
      const y = top + t * (bot - top);
      const x1 = cx + amp * Math.sin(2 * Math.PI * turns * t);
      const x2 = cx + amp * Math.sin(2 * Math.PI * turns * t + Math.PI);
      const depth = Math.abs(Math.sin(2 * Math.PI * turns * t));
      const k = Math.round(t * 28) % 4;
      s += `<line x1="${x1.toFixed(1)}" y1="${y.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y.toFixed(1)}" ` +
        `stroke="var(--c${[1, 2, 3, 8][k]})" stroke-width="2.6" stroke-linecap="round" ` +
        `opacity="${(0.22 + 0.62 * depth).toFixed(2)}" class="helix-rung" style="animation-delay:${(t * 2.4).toFixed(2)}s"/>`;
    }
    s += path(strand(0), 'art-lp', 'stroke-width="4.4" stroke-linecap="round"');
    s += path(strand(Math.PI), 'art-la', 'stroke-width="4.4" stroke-linecap="round"');

    /* ---- individuals sampled from three populations, left and right ---- */
    const r1 = R(7);
    const popsXY = [
      { cx: 74, cy: 76, c: 1, n: 9, lab: 'Pop A' },
      { cx: 60, cy: 196, c: 2, n: 8, lab: 'Pop B' },
      { cx: 452, cy: 122, c: 3, n: 9, lab: 'Pop C' },
    ];
    popsXY.forEach(p => {
      s += `<circle cx="${p.cx}" cy="${p.cy}" r="44" fill="var(--card-bg)" stroke="var(--border)" stroke-dasharray="3 4"/>`;
      for (let i = 0; i < p.n; i++) {
        const a = 2 * Math.PI * (i / p.n) + r1() * 0.5;
        const rr = 12 + r1() * 25;
        const x = p.cx + rr * Math.cos(a), y = p.cy + rr * Math.sin(a);
        s += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="5.4" class="art-c${p.c}" opacity="0.92"/>`;
      }
      s += txt(p.cx, p.cy + 60, p.lab, 'art-mut', 10, 'middle', 'font-weight="700"');
    });

    /* gene flow arrows between populations and the helix */
    s += `<defs><marker id="ah" markerWidth="7" markerHeight="7" refX="6" refY="3.2" orient="auto">
      <path d="M0 0 L7 3.2 L0 6.4 z" fill="var(--text-muted)" opacity="0.6"/></marker></defs>`;
    s += path('M118 92 Q 165 110 190 140', 'art-line', 'stroke-width="1.4" stroke-dasharray="4 4" marker-end="url(#ah)" opacity="0.6"');
    s += path('M104 196 Q 160 200 192 186', 'art-line', 'stroke-width="1.4" stroke-dasharray="4 4" marker-end="url(#ah)" opacity="0.6"');
    s += path('M410 126 Q 372 136 340 150', 'art-line', 'stroke-width="1.4" stroke-dasharray="4 4" marker-end="url(#ah)" opacity="0.6"');

    /* ---- admixture barplot at the bottom: the helix resolved into ancestry ---- */
    const bx = 54, by = 306, bw = 412, bh = 74, N = 46;
    s += `<rect x="${bx - 6}" y="${by - 24}" width="${bw + 12}" height="${bh + 44}" rx="12" fill="var(--card-bg)" stroke="var(--border)"/>`;
    s += txt(bx, by - 9, 'Ancestry of every individual  ·  K = 3', 'art-txt', 10, 'start', 'font-weight="700"');
    const r2 = R(21), w = bw / N;
    for (let i = 0; i < N; i++) {
      /* three demes with a cline in the middle */
      const t = i / (N - 1);
      let q = [0, 0, 0];
      if (t < 0.3) q = [0.9 - 0.1 * r2(), 0.06, 0.04];
      else if (t < 0.42) q = [0.55 + 0.2 * r2(), 0.3 * r2(), 0.2 * r2()];
      else if (t < 0.62) q = [0.12 * r2(), 0.85 - 0.15 * r2(), 0.08];
      else if (t < 0.74) q = [0.1 * r2(), 0.45 + 0.2 * r2(), 0.35 * r2()];
      else q = [0.05, 0.08 * r2(), 0.88 - 0.12 * r2()];
      const tot = q[0] + q[1] + q[2];
      q = q.map(v => v / tot);
      let y0 = by;
      q.forEach((v, k) => {
        const hh = v * bh;
        s += `<rect x="${(bx + i * w).toFixed(2)}" y="${y0.toFixed(2)}" width="${(w + 0.4).toFixed(2)}" height="${hh.toFixed(2)}" class="art-c${k + 1}"/>`;
        y0 += hh;
      });
    }
    s += `<rect x="${bx}" y="${by}" width="${bw}" height="${bh}" fill="none" stroke="var(--border-strong)"/>`;
    [[0.15, 'A'], [0.5, 'B'], [0.85, 'C']].forEach(([f, l]) =>
      s += txt(bx + f * bw, by + bh + 13, l, 'art-mut', 9, 'middle'));

    return wrap(`0 0 ${W} ${H}`, s);
  }

  /* ============================================================
     MARKER TYPES
     ============================================================ */
  /* microsatellite electropherogram: two peaks = heterozygote */
  function ssr() {
    let s = '', W = 220, H = 70;
    const peaks = [[42, 0.55, 1], [78, 0.95, 2], [126, 0.72, 1], [160, 0.5, 2]];
    s += `<line x1="8" y1="${H - 10}" x2="${W - 8}" y2="${H - 10}" class="art-ax"/>`;
    peaks.forEach(([x, h, c], i) => {
      const hh = h * (H - 24);
      s += path(`M${x - 9} ${H - 10} Q ${x - 4} ${H - 10 - hh} ${x} ${H - 10 - hh} Q ${x + 4} ${H - 10 - hh} ${x + 9} ${H - 10}`,
        'art-c' + c, `opacity="${i < 2 ? 0.95 : 0.45}"`);
      if (i < 2) s += txt(x, H - 2, [166, 172][i], 'art-mut', 7.5, 'middle');
    });
    s += txt(W - 10, 14, 'SSR', 'art-mut', 8, 'end');
    return wrap(`0 0 ${W} ${H}`, s);
  }
  /* AFLP / ISSR gel: presence-absence bands */
  function gel() {
    let s = '', W = 220, H = 70;
    const r = R(11);
    s += `<rect x="6" y="6" width="${W - 12}" height="${H - 12}" rx="4" fill="var(--bg-soft)" stroke="var(--border)"/>`;
    for (let lane = 0; lane < 9; lane++) {
      const x = 16 + lane * 22;
      for (let b = 0; b < 7; b++) {
        if (r() < 0.55) {
          const y = 14 + b * 7.2;
          s += `<rect x="${x}" y="${y}" width="15" height="3.4" rx="1.4" class="${r() < 0.35 ? 'art-a' : 'art-p'}" opacity="${(0.45 + r() * 0.5).toFixed(2)}"/>`;
        }
      }
    }
    return wrap(`0 0 ${W} ${H}`, s);
  }
  /* DNA alignment with polymorphic sites highlighted */
  function seqAln() {
    let s = '', W = 220, H = 70;
    const r = R(5), cols = 26, rows = 6, cw = 7.6, ch = 8.4, x0 = 10, y0 = 10;
    const poly = [4, 9, 15, 21];
    for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) {
      const isP = poly.includes(j);
      const k = isP ? (r() < 0.45 ? 1 : 2) : 0;
      s += `<rect x="${x0 + j * cw}" y="${y0 + i * ch}" width="${cw - 1.1}" height="${ch - 1.4}" rx="1.2" ` +
        (k ? `class="art-c${k}" opacity="0.9"` : `fill="var(--border)" opacity="0.5"`) + `/>`;
    }
    poly.forEach(j => s += `<circle cx="${x0 + j * cw + 3.2}" cy="${y0 + rows * ch + 5}" r="1.9" class="art-a"/>`);
    s += txt(W - 8, H - 6, 'polymorphic sites', 'art-mut', 7, 'end');
    return wrap(`0 0 ${W} ${H}`, s);
  }
  /* morphology: leaves of two shapes measured */
  function morph() {
    let s = '', W = 220, H = 70;
    const leaf = (x, y, sc, cls, rot) =>
      `<g transform="translate(${x},${y}) rotate(${rot}) scale(${sc})">` +
      `<path d="M0 0 C 14 -18 34 -18 46 0 C 34 18 14 18 0 0 z" class="${cls}" opacity="0.85"/>` +
      `<path d="M0 0 L46 0" stroke="var(--card-bg)" stroke-width="1.4" fill="none"/></g>`;
    s += leaf(16, 34, 0.72, 'art-p', -12);
    s += leaf(66, 36, 0.95, 'art-p', -6);
    s += leaf(126, 34, 0.8, 'art-a', 8);
    /* a small caliper measuring the last leaf */
    s += path('M124 14 L124 8 M176 14 L176 8 M124 11 L176 11', 'art-line', 'stroke-width="1.2"');
    s += txt(150, 6, 'length', 'art-mut', 7, 'middle');
    s += txt(W - 8, H - 8, 'quantitative traits', 'art-mut', 7, 'end');
    return wrap(`0 0 ${W} ${H}`, s);
  }

  /* ============================================================
     METHOD ILLUSTRATIONS (used in the gallery and the block cards)
     ============================================================ */
  const VB = '0 0 260 120';

  /* allele frequency bars for three populations */
  function freq() {
    let s = '';
    const pops = [[0.52, 0.28, 0.14, 0.06], [0.31, 0.44, 0.17, 0.08], [0.12, 0.22, 0.41, 0.25]];
    const x0 = 22, y0 = 100, bw = 13, gap = 5, gw = 4 * bw + 3 * gap + 16;
    s += `<line x1="14" y1="${y0}" x2="246" y2="${y0}" class="art-ax"/>`;
    pops.forEach((p, pi) => {
      p.forEach((f, ai) => {
        const h = f * 78;
        s += `<rect x="${x0 + pi * gw + ai * (bw + gap)}" y="${y0 - h}" width="${bw}" height="${h}" rx="2" class="art-c${ai + 1}"/>`;
      });
      s += txt(x0 + pi * gw + gw / 2 - 10, y0 + 12, ['Pop A', 'Pop B', 'Pop C'][pi], 'art-mut', 8, 'middle');
    });
    s += txt(8, 22, 'p', 'art-mut', 9, 'middle', 'font-style="italic"');
    return wrap(VB, s);
  }

  /* Hardy-Weinberg: the three genotype curves */
  function hwe() {
    let s = '', x0 = 24, x1 = 244, y0 = 100, y1 = 16;
    const X = p => x0 + p * (x1 - x0), Y = f => y0 - f * (y0 - y1);
    const curve = (fn) => { const pts = []; for (let p = 0; p <= 1.0001; p += 0.02) pts.push([X(p), Y(fn(p))]); return poly(pts); };
    s += `<line x1="${x0}" y1="${y0}" x2="${x1}" y2="${y0}" class="art-ax"/>`;
    s += `<line x1="${x0}" y1="${y0}" x2="${x0}" y2="${y1}" class="art-ax"/>`;
    s += path(curve(p => p * p), 'art-lp', 'stroke-width="2.4"');
    s += path(curve(p => 2 * p * (1 - p)), 'art-la', 'stroke-width="2.4"');
    s += path(curve(p => (1 - p) * (1 - p)), 'art-ls', 'stroke-width="2.4" stroke-dasharray="4 3"');
    s += txt(X(0.87), Y(0.82), 'p²', 'art-p', 9, 'middle', 'font-weight="700"');
    s += txt(X(0.5), Y(0.58), '2pq', 'art-a', 9, 'middle', 'font-weight="700"');
    s += txt(X(0.13), Y(0.82), 'q²', 'art-s', 9, 'middle', 'font-weight="700"');
    s += txt((x0 + x1) / 2, y0 + 13, 'allele frequency p', 'art-mut', 8, 'middle');
    return wrap(VB, s);
  }

  /* pairwise F_ST heatmap, lower triangle */
  function fst() {
    let s = '';
    const n = 6, c = 15, x0 = 40, y0 = 16;
    const v = [[], [0.02], [0.06, 0.05], [0.14, 0.12, 0.09], [0.19, 0.17, 0.13, 0.04], [0.26, 0.24, 0.2, 0.11, 0.07]];
    for (let i = 1; i < n; i++) for (let j = 0; j < i; j++) {
      const f = v[i][j] / 0.28;
      s += `<rect x="${x0 + j * c}" y="${y0 + (i - 1) * c}" width="${c - 1}" height="${c - 1}" rx="1.5" fill="var(--accent)" opacity="${(0.12 + f * 0.85).toFixed(2)}"/>`;
    }
    for (let i = 1; i < n; i++) s += txt(x0 - 4, y0 + (i - 1) * c + 11, 'P' + (i + 1), 'art-mut', 7.5, 'end');
    for (let j = 0; j < n - 1; j++) s += txt(x0 + j * c + 7, y0 + (n - 1) * c + 10, 'P' + (j + 1), 'art-mut', 7.5, 'middle');
    /* legend */
    s += `<defs><linearGradient id="fstg" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="var(--accent)" stop-opacity="0.12"/>
      <stop offset="100%" stop-color="var(--accent)" stop-opacity="0.97"/></linearGradient></defs>`;
    s += `<rect x="160" y="26" width="76" height="9" rx="2" fill="url(#fstg)"/>`;
    s += txt(160, 22, '0', 'art-mut', 7) + txt(236, 22, '0.28', 'art-mut', 7, 'end');
    s += txt(198, 50, 'pairwise F', 'art-txt', 8.5, 'middle', 'font-weight="700"');
    s += txt(222, 52, 'ST', 'art-txt', 6.5, 'middle', 'font-weight="700"');
    return wrap(VB, s);
  }

  /* AMOVA: variance partitioned among regions / among pops / within */
  function amova() {
    let s = '';
    const parts = [[0.17, 1, 'Among regions'], [0.21, 2, 'Among pops'], [0.62, 8, 'Within pops']];
    let x = 20; const W = 220, y = 28, h = 26;
    parts.forEach(([f, c]) => {
      s += `<rect x="${x}" y="${y}" width="${f * W}" height="${h}" class="art-c${c}" rx="3"/>`;
      s += txt(x + f * W / 2, y + 17, (f * 100).toFixed(0) + '%', '', 9, 'middle', 'fill="#fff" font-weight="700"');
      x += f * W;
    });
    /* nested sampling design below */
    const bx = 30;
    s += path(`M${bx + 50} 70 L${bx + 50} 78 M${bx + 15} 78 L${bx + 150} 78 M${bx + 15} 78 L${bx + 15} 86 M${bx + 85} 78 L${bx + 85} 86 M${bx + 150} 78 L${bx + 150} 86`, 'art-line', 'stroke-width="1.2"');
    [0, 70, 135].forEach((dx, i) => {
      for (let k = 0; k < 3; k++) s += `<circle cx="${bx + 8 + dx + k * 8}" cy="${96}" r="3.2" class="art-c${i + 1}"/>`;
      s += txt(bx + 16 + dx, 110, 'region ' + (i + 1), 'art-mut', 7, 'middle');
    });
    parts.forEach(([f, c, lab], i) => s += txt(20 + i * 78, 20, lab, 'art-mut', 7.5));
    return wrap(VB, s);
  }

  /* neighbour-joining tree */
  function tree() {
    let s = '';
    const tips = [['P1', 1], ['P2', 1], ['P3', 2], ['P4', 2], ['P5', 3], ['P6', 3]];
    const y = i => 18 + i * 16.5;
    const L = [[70, 0, 1, 40], [104, 2, 3, 62], [150, 4, 5, 96]];
    tips.forEach((t, i) => {
      const x = [96, 88, 130, 122, 176, 168][i];
      s += `<line x1="${x}" y1="${y(i)}" x2="216" y2="${y(i)}" class="art-line" stroke-width="1.6"/>`;
      s += `<circle cx="216" cy="${y(i)}" r="3.4" class="art-c${t[1]}"/>`;
      s += txt(224, y(i) + 3, t[0], 'art-txt', 8);
    });
    s += path('M96 18 L96 34.5 M88 34.5 L96 34.5', 'art-line', 'stroke-width="1.6"');
    s += path('M96 26 L60 26', 'art-line', 'stroke-width="1.6"');
    s += path('M130 51 L130 67.5 M122 67.5 L130 67.5 M130 59 L60 59', 'art-line', 'stroke-width="1.6"');
    s += path('M176 84 L176 100.5 M168 100.5 L176 100.5 M176 92 L60 92', 'art-line', 'stroke-width="1.6"');
    s += path('M60 26 L60 92 M60 59 L34 59', 'art-line', 'stroke-width="1.6"');
    s += txt(66, 22, '98', 'art-mut', 7) + txt(66, 55, '87', 'art-mut', 7) + txt(66, 88, '100', 'art-mut', 7);
    s += `<line x1="34" y1="108" x2="70" y2="108" class="art-ax"/>` + txt(52, 118, 'Nei D', 'art-mut', 7, 'middle');
    return wrap(VB, s);
  }

  /* PCoA scatter with confidence ellipses */
  function pcoa() {
    let s = '', r = R(3);
    s += `<line x1="24" y1="66" x2="244" y2="66" class="art-ax" stroke-dasharray="3 3"/>`;
    s += `<line x1="132" y1="10" x2="132" y2="112" class="art-ax" stroke-dasharray="3 3"/>`;
    const groups = [[78, 42, 1], [178, 48, 2], [130, 92, 3]];
    groups.forEach(([gx, gy, c], gi) => {
      s += `<ellipse cx="${gx}" cy="${gy}" rx="34" ry="22" transform="rotate(${-20 + gi * 24} ${gx} ${gy})" fill="var(--c${c})" opacity="0.12" stroke="var(--c${c})" stroke-opacity="0.5" stroke-dasharray="3 3"/>`;
      for (let i = 0; i < 11; i++) {
        const x = gx + (r() - 0.5) * 52, y = gy + (r() - 0.5) * 34;
        s += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.3" class="art-c${c}" opacity="0.9"/>`;
      }
    });
    s += txt(244, 78, 'PCoA 1 (34%)', 'art-mut', 7.5, 'end');
    s += txt(126, 14, 'PCoA 2 (19%)', 'art-mut', 7.5, 'end');
    return wrap(VB, s);
  }

  /* admixture barplot with delta-K inset */
  function structure() {
    let s = '', r = R(31);
    const x0 = 14, y0 = 14, W = 168, H = 74, N = 34, w = W / N;
    for (let i = 0; i < N; i++) {
      const t = i / (N - 1);
      let q = t < 0.34 ? [0.88 - 0.12 * r(), 0.07, 0.05]
        : t < 0.44 ? [0.5 * r() + 0.2, 0.5 * r(), 0.2 * r()]
          : t < 0.7 ? [0.08, 0.84 - 0.1 * r(), 0.08]
            : [0.05, 0.1 * r(), 0.85 - 0.1 * r()];
      const tot = q[0] + q[1] + q[2]; q = q.map(v => v / tot);
      let y = y0;
      q.forEach((v, k) => { const hh = v * H; s += `<rect x="${(x0 + i * w).toFixed(2)}" y="${y.toFixed(2)}" width="${(w + 0.3).toFixed(2)}" height="${hh.toFixed(2)}" class="art-c${k + 1}"/>`; y += hh; });
    }
    s += `<rect x="${x0}" y="${y0}" width="${W}" height="${H}" fill="none" stroke="var(--border-strong)"/>`;
    s += txt(x0 + W / 2, y0 + H + 12, 'K = 3', 'art-txt', 8.5, 'middle', 'font-weight="700"');
    /* delta-K inset */
    const ix = 194, iy = 20, iw = 54, ih = 54;
    s += `<rect x="${ix}" y="${iy}" width="${iw}" height="${ih}" rx="4" fill="var(--bg-soft)" stroke="var(--border)"/>`;
    const dk = [0.1, 0.95, 0.22, 0.12, 0.08];
    const pts = dk.map((v, i) => [ix + 7 + i * ((iw - 14) / (dk.length - 1)), iy + ih - 8 - v * (ih - 18)]);
    s += path(poly(pts), 'art-la', 'stroke-width="1.8"');
    pts.forEach((p, i) => s += `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="${i === 1 ? 3.2 : 2}" class="${i === 1 ? 'art-a' : 'art-mut'}"/>`);
    s += txt(ix + iw / 2, iy - 4, 'ΔK', 'art-mut', 7.5, 'middle');
    s += txt(ix + iw / 2, iy + ih + 9, 'K = 2…6', 'art-mut', 6.5, 'middle');
    return wrap(VB, s);
  }

  /* median-joining haplotype network */
  function network() {
    let s = '';
    const nodes = [
      [70, 58, 15, 1, 'H1'], [128, 34, 9, 2, 'H2'], [132, 88, 7, 3, 'H3'],
      [186, 52, 5, 2, 'H4'], [196, 96, 4, 3, 'H5'], [40, 22, 4, 1, 'H6'], [216, 26, 3, 2, 'H7'],
    ];
    const edges = [[0, 1, 2], [0, 2, 3], [1, 3, 1], [2, 4, 2], [0, 5, 1], [3, 6, 1]];
    edges.forEach(([a, b, m]) => {
      const A = nodes[a], B = nodes[b];
      s += `<line x1="${A[0]}" y1="${A[1]}" x2="${B[0]}" y2="${B[1]}" class="art-line" stroke-width="1.5"/>`;
      for (let k = 1; k <= m; k++) {
        const t = k / (m + 1);
        const x = A[0] + t * (B[0] - A[0]), y = A[1] + t * (B[1] - A[1]);
        const ang = Math.atan2(B[1] - A[1], B[0] - A[0]) + Math.PI / 2;
        s += `<line x1="${(x - 3 * Math.cos(ang)).toFixed(1)}" y1="${(y - 3 * Math.sin(ang)).toFixed(1)}" x2="${(x + 3 * Math.cos(ang)).toFixed(1)}" y2="${(y + 3 * Math.sin(ang)).toFixed(1)}" stroke="var(--accent)" stroke-width="1.5"/>`;
      }
    });
    nodes.forEach(([x, y, r, c, lab]) => {
      s += `<circle cx="${x}" cy="${y}" r="${r}" class="art-c${c}" opacity="0.9" stroke="var(--card-bg)" stroke-width="1.5"/>`;
      s += txt(x, y + 3, lab, '', r > 6 ? 8 : 6.5, 'middle', 'fill="#fff" font-weight="700"');
    });
    s += txt(250, 116, 'ticks = mutational steps', 'art-mut', 7, 'end');
    return wrap(VB, s);
  }

  /* mismatch distribution: observed bars vs expected expansion curve */
  function mismatch() {
    let s = '', x0 = 24, y0 = 100;
    const obs = [0.04, 0.12, 0.22, 0.26, 0.18, 0.1, 0.05, 0.03];
    const bw = 24;
    obs.forEach((v, i) => {
      const h = v * 76;
      s += `<rect x="${x0 + i * bw}" y="${y0 - h}" width="${bw - 4}" height="${h}" rx="2" class="art-p" opacity="0.55"/>`;
    });
    const pts = obs.map((v, i) => [x0 + i * bw + (bw - 4) / 2, y0 - (v * 0.96 + 0.012) * 76]);
    s += path(poly(pts), 'art-la', 'stroke-width="2.2"');
    s += `<line x1="${x0 - 4}" y1="${y0}" x2="244" y2="${y0}" class="art-ax"/>`;
    s += txt(134, 114, 'pairwise differences', 'art-mut', 8, 'middle');
    s += txt(240, 24, 'sudden expansion', 'art-a', 7.5, 'end', 'font-weight="700"');
    return wrap(VB, s);
  }

  /* isolation by distance: Mantel scatter */
  function ibd() {
    let s = '', r = R(13), x0 = 28, y0 = 100, x1 = 242, y1 = 16;
    s += `<line x1="${x0}" y1="${y0}" x2="${x1}" y2="${y0}" class="art-ax"/>`;
    s += `<line x1="${x0}" y1="${y0}" x2="${x0}" y2="${y1}" class="art-ax"/>`;
    for (let i = 0; i < 38; i++) {
      const t = r();
      const x = x0 + t * (x1 - x0 - 10);
      const y = y0 - (0.16 + 0.62 * t + (r() - 0.5) * 0.26) * (y0 - y1);
      s += `<circle cx="${x.toFixed(1)}" cy="${Math.max(y1 + 2, Math.min(y0 - 2, y)).toFixed(1)}" r="2.8" class="art-p" opacity="0.62"/>`;
    }
    s += path(`M${x0 + 4} ${y0 - 0.2 * (y0 - y1)} L${x1 - 8} ${y0 - 0.8 * (y0 - y1)}`, 'art-la', 'stroke-width="2.2"');
    s += txt(134, 114, 'ln geographic distance', 'art-mut', 8, 'middle');
    s += txt(x0 + 8, y1 + 8, 'FST / (1 − FST)', 'art-mut', 7.5);
    s += txt(x1 - 6, y0 - 12, 'r = 0.74**', 'art-a', 8, 'end', 'font-weight="700"');
    return wrap(VB, s);
  }

  /* bottleneck: allele frequency class distribution, normal L-shape vs shifted */
  function bottleneck() {
    let s = '';
    const norm = [0.62, 0.17, 0.09, 0.06, 0.04, 0.02];
    const shift = [0.18, 0.3, 0.24, 0.15, 0.08, 0.05];
    const x0 = 26, y0 = 98, bw = 17, gap = 4;
    norm.forEach((v, i) => {
      s += `<rect x="${x0 + i * (bw + gap)}" y="${y0 - v * 72}" width="${bw}" height="${v * 72}" rx="2" class="art-p" opacity="0.85"/>`;
    });
    const x1 = 146;
    shift.forEach((v, i) => {
      s += `<rect x="${x1 + i * (bw + gap)}" y="${y0 - v * 72}" width="${bw}" height="${v * 72}" rx="2" class="art-a" opacity="0.9"/>`;
    });
    s += `<line x1="20" y1="${y0}" x2="246" y2="${y0}" class="art-ax"/>`;
    s += txt(x0 + 44, y0 + 13, 'stable: L-shape', 'art-p', 7.5, 'middle', 'font-weight="700"');
    s += txt(x1 + 44, y0 + 13, 'bottleneck: mode shift', 'art-a', 7.5, 'middle', 'font-weight="700"');
    return wrap(VB, s);
  }

  /* spatial autocorrelogram with permuted confidence envelope */
  function autocorr() {
    let s = '', x0 = 28, y0 = 62, x1 = 242;
    const r = [0.21, 0.13, 0.06, 0.01, -0.03, -0.05, -0.09, -0.12];
    const X = i => x0 + i * ((x1 - x0) / (r.length - 1));
    /* envelope */
    const up = r.map((_, i) => [X(i), y0 - 0.075 * 200]), dn = r.map((_, i) => [X(i), y0 + 0.075 * 200]);
    s += `<path d="${poly(up)} L${X(r.length - 1)} ${y0 + 15} L${x0} ${y0 + 15} z" fill="var(--text-muted)" opacity="0.1"/>`;
    s += path(poly(up), 'art-line', 'stroke-dasharray="3 3" stroke-width="1"');
    s += path(poly(dn), 'art-line', 'stroke-dasharray="3 3" stroke-width="1"');
    s += `<line x1="${x0}" y1="${y0}" x2="${x1}" y2="${y0}" class="art-ax"/>`;
    const pts = r.map((v, i) => [X(i), y0 - v * 200]);
    s += path(poly(pts), 'art-lp', 'stroke-width="2.2"');
    pts.forEach((p, i) => s += `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="3" class="${Math.abs(r[i]) > 0.075 ? 'art-a' : 'art-p'}"/>`);
    s += txt(134, 114, 'distance class (m)', 'art-mut', 8, 'middle');
    s += txt(x0 - 4, y0 - 30, 'r', 'art-mut', 8, 'end', 'font-style="italic"');
    s += txt(x1, 22, 'kinship decays with distance', 'art-mut', 7, 'end');
    return wrap(VB, s);
  }

  /* individual assignment / self-assignment matrix */
  function assign() {
    let s = '';
    const m = [[0.86, 0.09, 0.05], [0.07, 0.81, 0.12], [0.04, 0.14, 0.82]];
    const c = 26, x0 = 78, y0 = 22;
    m.forEach((row, i) => row.forEach((v, j) => {
      s += `<rect x="${x0 + j * c}" y="${y0 + i * c}" width="${c - 2}" height="${c - 2}" rx="3" fill="var(--primary)" opacity="${(0.1 + v * 0.85).toFixed(2)}"/>`;
      s += txt(x0 + j * c + (c - 2) / 2, y0 + i * c + 17, (v * 100).toFixed(0), '', 8.5, 'middle', `fill="${v > 0.5 ? '#fff' : 'var(--text-muted)'}" font-weight="700"`);
    }));
    ['A', 'B', 'C'].forEach((l, i) => {
      s += txt(x0 - 6, y0 + i * c + 17, 'Pop ' + l, 'art-mut', 8, 'end');
      s += txt(x0 + i * c + 12, y0 - 5, l, 'art-mut', 8, 'middle');
    });
    s += txt(x0 + 39, 112, 'assigned to →', 'art-mut', 7.5, 'middle');
    s += txt(196, 40, 'self-', 'art-txt', 8) + txt(196, 50, 'assignment', 'art-txt', 8) + txt(196, 60, 'rate 83%', 'art-a', 8, 'start', 'font-weight="700"');
    return wrap(VB, s);
  }

  /* effective population size / drift trajectories */
  function drift() {
    let s = '', x0 = 24, y0 = 108, y1 = 12, x1 = 244;
    s += `<line x1="${x0}" y1="${y0}" x2="${x1}" y2="${y0}" class="art-ax"/>`;
    s += `<line x1="${x0}" y1="${y0}" x2="${x0}" y2="${y1}" class="art-ax"/>`;
    const cls = ['art-lp', 'art-la', 'art-ls', 'art-l5', 'art-l6'];
    for (let k = 0; k < 5; k++) {
      const r = R(17 + k * 7);
      let p = 0.5; const pts = [[x0, y0 - 0.5 * (y0 - y1)]];
      for (let g = 1; g <= 40; g++) {
        p = Math.max(0, Math.min(1, p + (r() - 0.5) * (k < 2 ? 0.1 : 0.2)));
        pts.push([x0 + g * ((x1 - x0) / 40), y0 - p * (y0 - y1)]);
        if (p === 0 || p === 1) break;
      }
      s += path(poly(pts), cls[k], 'stroke-width="1.8" opacity="0.85"');
    }
    s += txt(134, 118, 'generations', 'art-mut', 8, 'middle');
    s += txt(x0 - 4, y1 + 20, 'p', 'art-mut', 8, 'end', 'font-style="italic"');
    return wrap(VB, s);
  }

  /* mating system: outcrossing vs selfing in a plant */
  function mating() {
    let s = '';
    const flower = (x, y, sc, c) => {
      let g = `<g transform="translate(${x},${y}) scale(${sc})">`;
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        g += `<ellipse cx="${(13 * Math.cos(a)).toFixed(1)}" cy="${(13 * Math.sin(a)).toFixed(1)}" rx="8" ry="5.4" transform="rotate(${(a * 180 / Math.PI).toFixed(0)} ${(13 * Math.cos(a)).toFixed(1)} ${(13 * Math.sin(a)).toFixed(1)})" class="art-c${c}" opacity="0.85"/>`;
      }
      g += `<circle cx="0" cy="0" r="5.5" class="art-gold"/></g>`;
      return g;
    };
    s += flower(52, 46, 1, 1) + flower(150, 40, 0.9, 2) + flower(212, 74, 0.85, 3);
    s += `<defs><marker id="am2" markerWidth="7" markerHeight="7" refX="6" refY="3.2" orient="auto"><path d="M0 0 L7 3.2 L0 6.4 z" fill="var(--accent)"/></marker></defs>`;
    s += path('M72 40 Q 110 20 130 34', 'art-la', 'stroke-width="1.6" marker-end="url(#am2)"');
    s += path('M168 50 Q 196 56 200 62', 'art-la', 'stroke-width="1.6" marker-end="url(#am2)"');
    /* selfing loop */
    s += path('M46 62 C 26 84 72 90 60 66', 'art-lp', 'stroke-width="1.6" marker-end="url(#am2)"');
    s += txt(52, 100, 'selfing', 'art-p', 7.5, 'middle', 'font-weight="700"');
    s += txt(150, 14, 'pollen flow', 'art-a', 7.5, 'middle', 'font-weight="700"');
    s += txt(248, 112, 'tm, ts, biparental inbreeding', 'art-mut', 7, 'end');
    return wrap(VB, s);
  }

  /* linkage disequilibrium triangle */
  function ld() {
    let s = '', n = 8, c = 13, x0 = 46, y0 = 26;
    const r = R(9);
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      const d = j - i;
      const v = Math.max(0, 0.85 * Math.exp(-d / 2.2) + (r() - 0.5) * 0.16);
      const px = x0 + (i + j) / 2 * c, py = y0 + d * c * 0.62;
      s += `<rect x="${px.toFixed(1)}" y="${py.toFixed(1)}" width="${c - 1.5}" height="${c * 0.62 - 1}" rx="1.2" fill="var(--accent)" opacity="${(0.08 + v * 0.9).toFixed(2)}" transform="rotate(0)"/>`;
    }
    for (let i = 0; i < n; i++) s += `<rect x="${x0 + i * c}" y="${y0 - 10}" width="${c - 2}" height="5" rx="1.5" class="art-p"/>`;
    s += txt(x0 - 6, y0 - 6, 'loci', 'art-mut', 7.5, 'end');
    s += txt(134, 116, "r² between locus pairs", 'art-mut', 8, 'middle');
    return wrap(VB, s);
  }

  /* data import: files converging into one table */
  function importArt() {
    let s = '';
    const file = (x, y, lab, c) =>
      `<g transform="translate(${x},${y})"><rect x="0" y="0" width="40" height="30" rx="4" fill="var(--card-bg)" stroke="var(--border-strong)"/>` +
      `<rect x="0" y="0" width="40" height="9" rx="4" class="art-c${c}" opacity="0.85"/>` +
      `<line x1="6" y1="17" x2="34" y2="17" class="art-line" stroke-width="1"/>` +
      `<line x1="6" y1="23" x2="26" y2="23" class="art-line" stroke-width="1"/>` +
      `<text x="20" y="7.2" font-size="5.6" text-anchor="middle" fill="#fff" font-weight="700">${lab}</text></g>`;
    s += file(10, 10, 'XLSX', 1) + file(10, 48, 'FASTA', 8) + file(10, 86, 'VCF', 4);
    s += file(78, 28, '.STR', 2) + file(78, 66, '.GEN', 3);
    s += path('M52 25 Q 120 30 146 46 M52 63 Q 118 62 146 58 M52 101 Q 118 96 146 70 M120 43 Q 138 46 146 50 M120 81 Q 138 72 146 66', 'art-line', 'stroke-width="1.2" stroke-dasharray="3 3"');
    s += `<rect x="148" y="24" width="98" height="70" rx="6" fill="var(--card-bg)" stroke="var(--primary)"/>`;
    for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) {
      s += `<rect x="${154 + j * 18}" y="${32 + i * 12}" width="15" height="8" rx="1.5" fill="var(--primary)" opacity="${i === 0 ? 0.75 : 0.14 + (j % 2) * 0.06}"/>`;
    }
    s += txt(197, 108, 'one tidy genotype table', 'art-mut', 7.5, 'middle');
    return wrap(VB, s);
  }

  /* report / figure export */
  function report() {
    let s = '';
    s += `<rect x="30" y="10" width="88" height="100" rx="6" fill="var(--card-bg)" stroke="var(--border-strong)"/>`;
    s += `<rect x="30" y="10" width="88" height="16" rx="6" class="art-p"/>`;
    s += txt(74, 21, 'RESULTS', '', 7, 'middle', 'fill="#fff" font-weight="700"');
    for (let i = 0; i < 6; i++) s += `<line x1="40" y1="${38 + i * 8}" x2="${108 - (i % 3) * 14}" y2="${38 + i * 8}" class="art-line" stroke-width="1.2"/>`;
    s += `<rect x="40" y="88" width="68" height="14" rx="2" fill="var(--accent)" opacity="0.25"/>`;
    s += `<rect x="136" y="18" width="104" height="52" rx="6" fill="var(--bg-soft)" stroke="var(--border)"/>`;
    const bars = [0.4, 0.7, 0.55, 0.9, 0.62];
    bars.forEach((v, i) => s += `<rect x="${146 + i * 18}" y="${62 - v * 36}" width="12" height="${v * 36}" rx="2" class="art-c${i + 1}"/>`);
    s += txt(188, 86, '900 dpi · PNG · TIFF · SVG', 'art-mut', 7, 'middle');
    s += `<rect x="150" y="94" width="76" height="16" rx="8" class="art-a" opacity="0.9"/>`;
    s += txt(188, 105, 'DOWNLOAD ZIP', '', 6.6, 'middle', 'fill="#fff" font-weight="700"');
    return wrap(VB, s);
  }

  /* diversity indices: a rarefaction-like curve plus tiles */
  function diversity() {
    let s = '', x0 = 26, y0 = 100, x1 = 150, y1 = 18;
    const pts = [];
    for (let i = 0; i <= 30; i++) { const t = i / 30; pts.push([x0 + t * (x1 - x0), y0 - (1 - Math.exp(-3.1 * t)) * (y0 - y1)]); }
    s += `<line x1="${x0}" y1="${y0}" x2="${x1 + 4}" y2="${y0}" class="art-ax"/>`;
    s += `<line x1="${x0}" y1="${y0}" x2="${x0}" y2="${y1}" class="art-ax"/>`;
    s += path(poly(pts), 'art-lp', 'stroke-width="2.4"');
    s += txt(88, 114, 'individuals sampled', 'art-mut', 7.5, 'middle');
    s += txt(x0 + 6, y1 + 6, 'alleles', 'art-mut', 7.5);
    const tiles = [['Na', '6.2', 1], ['Ne', '3.4', 2], ['Ho', '0.61', 3], ['He', '0.68', 8]];
    tiles.forEach((t, i) => {
      const x = 168 + (i % 2) * 44, y = 22 + Math.floor(i / 2) * 42;
      s += `<rect x="${x}" y="${y}" width="38" height="34" rx="5" fill="var(--bg-soft)" stroke="var(--border)"/>`;
      s += txt(x + 19, y + 13, t[0], 'art-mut', 7.5, 'middle', 'font-weight="700"');
      s += txt(x + 19, y + 27, t[1], 'art-txt', 11, 'middle', 'font-weight="800"');
    });
    return wrap(VB, s);
  }

  window.Art = {
    hero, ssr, gel, seqAln, morph,
    freq, hwe, fst, amova, tree, pcoa, structure, network, mismatch, ibd,
    bottleneck, autocorr, assign, drift, mating, ld, importArt, report, diversity,
  };
})();
