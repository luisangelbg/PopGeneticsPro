/* LABG Suite — Copyright (C) 2026 Luis Ángel Barrera-Guzmán.
   Free software under the GNU General Public License, version 3; see LICENSE. */
/* LABG Suite — the editor of each figure (common module).

   A ✎ button on every figure opens a floating panel that works on THAT figure,
   the way a plotting program does:

     General       title, subtitle and footnote inside the figure, font family,
                   sizes, line and point scale, text colour, background, border
     Axes & grid   the titles of the axes, the tick labels, the colour and
                   weight of the axes, the grid and the box of the plot area
     Series        every colour the figure uses, named after its legend
                   entry: colour, line weight, dash, opacity, hide
     Legend        show or hide, eight positions, as drawn / row / column,
                   size, box; it can be dragged on the figure
     Texts         every text one by one: wording, size, bold, italics,
                   colour, hide
     Annotations   notes, arrows, reference lines at a value of either axis,
                   shaded bands and a panel letter; notes and arrows are
                   dragged on the figure

   It needs nothing from the module that drew the figure: it reads the SVG as
   it is. A drawing kit may tag what it draws so the editor finds it —
   data-role="legend" + data-li on the legend, data-role="xlab|ylab|lab" on
   the axis titles, "…tick" on the tick labels, "axis" / "grid" on the lines,
   data-plot / data-xr / data-yr / data-y2r on the SVG — and where a figure
   carries no tags the editor still edits its texts, colours and annotations.

   The edits are kept per figure in this browser and put back every time the
   figure is redrawn or replaced — when the data, the language or the theme
   change — texts are matched by their original wording and colours by their
   original value. The edits are written on the SVG itself (attributes and
   inline styles), so whatever is on screen is what the app exports.

   Configuration (optional), before this script:
     window.LABG_FIGEDIT = { key, panes, exportBtn, title, btnHost, literal }
   or as data-* attributes of the <script> tag. */

(function () {
  'use strict';
  if (window.FigEdit && window.FigEdit.__labg) return;
  const me = document.currentScript;
  const dset = me ? me.dataset : {};
  const appSlug = (document.title || 'labg').split(/[\s—–·|:-]+/)[0].toLowerCase().replace(/[^a-z0-9]+/g, '') || 'labg';
  const CFG = Object.assign({
    key: appSlug + ':figedit',
    panes: '.pg-pane, [data-fig], .fig-block',     /* what holds one figure */
    exportBtn: '.fig-dl',                          /* the pane's own export button, if any */
    title: '.pg-title, .fig-head h4',              /* where the pane names its figure */
    btnHost: '.fig-head',                          /* if the pane has it, the ✎ button goes inside */
    skip: 'button, .fig-ed, .fe-panel, [data-fe-skip], .fig-editor, .fig-tools',
    minSize: 90,                                   /* smaller SVGs are icons, not figures */
    literal: null,                                 /* true: plain colours; null: decided per figure */
  }, window.LABG_FIGEDIT || {});
  ['key', 'panes', 'exportBtn', 'title', 'btnHost', 'skip'].forEach(k => { if (dset[k]) CFG[k] = dset[k]; });

  const NS = 'http://www.w3.org/2000/svg';
  const lang = () => ((document.documentElement.lang || 'es').slice(0, 2) === 'en' ? 'en' : 'es');
  const T = (es, en) => (lang() === 'en' ? en : es);
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const mk = (tag, attrs, html) => { const n = document.createElement(tag); for (const k in (attrs || {})) if (attrs[k] != null) n.setAttribute(k, attrs[k]); if (html != null) n.innerHTML = html; return n; };
  const svgEl = (tag, attrs, text) => { const n = document.createElementNS(NS, tag); for (const k in (attrs || {})) if (attrs[k] != null) n.setAttribute(k, attrs[k]); if (text != null) n.textContent = text; return n; };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const nums = s => String(s || '').trim().split(/[\s,]+/).map(Number);
  const slug = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
  const SHAPES = 'path, line, rect, circle, polyline, polygon, ellipse';

  let E = {};
  try { E = JSON.parse(localStorage.getItem(CFG.key) || '{}') || {}; } catch (e) { E = {}; }
  const save = () => { try { localStorage.setItem(CFG.key, JSON.stringify(E)); } catch (e) { /* storage blocked */ } };

  const FONTS = {
    '': ['La de la figura', 'As the figure draws it', ''],
    sans: ['Sans', 'Sans', 'system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif'],
    humanist: ['Sans humanista', 'Humanist sans', '"Segoe UI", "Helvetica Neue", Arial, sans-serif'],
    arial: ['Arial / Helvetica', 'Arial / Helvetica', 'Arial, Helvetica, sans-serif'],
    serif: ['Serif', 'Serif', 'Georgia, Cambria, "Times New Roman", serif'],
    times: ['Times New Roman', 'Times New Roman', '"Times New Roman", Times, serif'],
    classic: ['Serif clásica', 'Classic serif', '"Palatino Linotype", "Book Antiqua", Palatino, serif'],
    condensed: ['Sans estrecha', 'Condensed sans', '"Arial Narrow", "Roboto Condensed", sans-serif'],
    mono: ['Monoespaciada', 'Monospace', 'ui-monospace, Consolas, "Courier New", monospace'],
  };
  const DASH = { solid: 'none', dash: '6 4', dot: '1.5 3.5', dashdot: '7 3 1.5 3' };
  const POS = [['orig', 'donde la dibuja la figura', 'where the figure draws it'], ['tl', 'dentro, arriba a la izquierda', 'inside, top left'], ['tr', 'dentro, arriba a la derecha', 'inside, top right'],
    ['bl', 'dentro, abajo a la izquierda', 'inside, bottom left'], ['br', 'dentro, abajo a la derecha', 'inside, bottom right'], ['tc', 'arriba, al centro', 'top, centred'],
    ['below', 'debajo de la figura', 'below the figure'], ['belowc', 'debajo, al centro', 'below, centred']];
  const LAYOUT = [['', 'como la dibuja la figura', 'as the figure draws it'], ['row', 'en fila', 'as a row'], ['col', 'en columna', 'as a column']];
  const GENERAL = ['font', 'fontScale', 'lineScale', 'markerScale', 'textColor', 'bg', 'bgColor', 'border', 'tickScale', 'tickColor', 'axisColor', 'axisWidth', 'grid', 'gridDash', 'gridOpacity', 'gridColor', 'box'];

  const blank = () => ({ texts: {}, colors: {}, series: {}, legend: {}, notes: [] });
  function edits(id) {
    const d = (E[id] = E[id] || blank());
    ['texts', 'colors', 'series', 'legend'].forEach(k => { if (!d[k] || typeof d[k] !== 'object') d[k] = {}; });
    if (!Array.isArray(d.notes)) d.notes = [];
    return d;
  }
  const has = id => !!E[id];
  const isEmpty = d => !d || (Object.keys(d).every(k => ['texts', 'colors', 'series', 'legend', 'notes'].includes(k)) && !Object.keys(d.texts || {}).length && !Object.keys(d.colors || {}).length && !Object.keys(d.series || {}).length && !Object.keys(d.legend || {}).length && !(d.notes || []).length);

  /* ---------------- which SVG is a figure, and what it is called ---------------- */
  function svgOf(pane) {
    const list = pane.querySelectorAll('svg');
    for (let i = 0; i < list.length; i++) {
      const s = list[i];
      if (s.closest(CFG.skip)) continue;
      if (s.closest(CFG.panes) !== pane) continue;
      const vb = nums(s.getAttribute('viewBox'));
      const w = vb.length === 4 && isFinite(vb[2]) ? vb[2] : +s.getAttribute('width') || 0;
      if (w && w < CFG.minSize) continue;
      return s;
    }
    return null;
  }
  const paneOf = svg => svg.closest(CFG.panes);
  function titleOf(pane) {
    const tt = pane && pane.querySelector(CFG.title);
    if (!tt) return '';
    const sp = tt.querySelector(`[data-l="${lang()}"]`);
    return (sp ? sp.textContent : tt.textContent).trim();
  }
  const keys = new WeakMap();
  function keyOf(svg, pane) {
    if (svg.id) return svg.id;
    if (keys.has(svg)) return keys.get(svg);
    pane = pane || paneOf(svg);
    let k = '';
    if (pane) {
      const tt = pane.querySelector(CFG.title);
      k = pane.getAttribute('data-fig-key') || pane.id || (pane.getAttribute('data-fig') || '')
        || (svg.parentElement && svg.parentElement !== pane && svg.parentElement.id) || (tt ? 't:' + slug(tt.textContent) : '');
      if (!k) k = 'n:' + [...document.querySelectorAll(CFG.panes)].indexOf(pane);
    } else k = 'x:' + slug(svg.getAttribute('aria-label') || 'svg');
    keys.set(svg, k);
    return k;
  }
  function figures(root) {
    const out = [];
    const r = root && root.nodeType === 1 ? root : document;
    const add = p => { const s = svgOf(p); if (s) out.push({ pane: p, svg: s, key: keyOf(s, p) }); };
    if (r !== document && r.matches && r.matches(CFG.panes)) add(r);
    r.querySelectorAll(CFG.panes).forEach(add);
    return out;
  }
  function findSvg(key) {
    if (!key) return null;
    const byId = document.getElementById(key);
    if (byId && byId.tagName.toLowerCase() === 'svg') return byId;
    const f = figures().find(x => x.key === key);
    return f ? f.svg : null;
  }

  /* ---------------- colours as the eye sees them ---------------- */
  const probe = () => { let p = document.getElementById('figEditProbe'); if (!p) { p = mk('span', { id: 'figEditProbe', style: 'display:none' }); document.body.appendChild(p); } return p; };
  function rgba(value, ctxEl) {
    if (!value || value === 'none' || value === 'transparent' || /^url\(/.test(value)) return null;
    let v = value;
    if (/var\(/.test(v)) { const m = v.match(/var\((--[\w-]+)/); v = m ? getComputedStyle(ctxEl || document.documentElement).getPropertyValue(m[1]).trim() : ''; }
    if (!v) return null;
    const p = probe(); p.style.color = ''; p.style.color = v;
    if (!p.style.color) return null;
    const m = getComputedStyle(p).color.match(/[\d.]+/g);
    if (!m) return null;
    return [+m[0], +m[1], +m[2], m[3] == null ? 1 : +m[3]];
  }
  const hexOf = c => '#' + c.slice(0, 3).map(x => Math.round(x).toString(16).padStart(2, '0')).join('');
  function toHex(value, ctxEl) { const c = rgba(value, ctxEl); return c ? hexOf(c) : null; }
  /* a new colour keeps the transparency the original had */
  function recolour(orig, hex, ctxEl) {
    const c = rgba(orig, ctxEl);
    if (!c || c[3] >= 0.999) return hex;
    const n = rgba(hex);
    return n ? `rgba(${n[0]},${n[1]},${n[2]},${c[3]})` : hex;
  }

  /* ---------------- helpers on the SVG ---------------- */
  const own = (tag, attrs, text) => { const n = svgEl(tag, attrs, text); n.setAttribute('data-fe-own', '1'); return n; };
  function remember(n, attr, key) { if (!n.hasAttribute(key)) n.setAttribute(key, n.getAttribute(attr) == null ? '' : n.getAttribute(attr)); return n.getAttribute(key); }
  const boxOf = svg => {
    const vb = svg.getAttribute('viewBox');
    if (vb) return vb;
    const w = parseFloat(svg.getAttribute('width')) || 700, h = parseFloat(svg.getAttribute('height')) || 320;
    return `0 0 ${w} ${h}`;
  };
  const baseBox = svg => nums(svg.dataset.feVb0 || boxOf(svg));
  const plotRect = svg => { const p = nums(svg.dataset.plot); return p.length === 4 && p.every(isFinite) ? { l: p[0], t: p[1], w: p[2], h: p[3] } : null; };
  const range = (svg, k) => { const r = nums(svg.dataset[k]); return r.length === 2 && r.every(isFinite) && r[1] !== r[0] ? r : null; };
  function wrap(text, perLine) {
    const out = []; let line = '';
    String(text).split(/\s+/).forEach(w => { if ((line + ' ' + w).trim().length > perLine) { if (line) out.push(line); line = w; } else line = (line + ' ' + w).trim(); });
    if (line) out.push(line);
    return out.slice(0, 5);
  }
  const roleOf = n => n.getAttribute('data-role') || '';
  const isTick = t => /tick$/.test(roleOf(t));
  const isOwn = n => n.hasAttribute('data-fe-own') || !!n.closest('[data-fe-own]');
  const origText = t => (t.hasAttribute('data-fe-t') ? t.getAttribute('data-fe-t') : t.textContent);

  function kind(n, K) {
    const r = roleOf(n);
    if (r === 'grid' || r === 'axis') return r;
    if (r === 'legend-box' || n.hasAttribute('data-bg') || n.hasAttribute('data-figbg')) return 'skip';
    const c = n.getAttribute('class') || '';
    if (/(^|\s)art-grid(\s|$)/.test(c)) return 'grid';
    if (/(^|\s)art-ax(\s|$)/.test(c)) return 'axis';
    /* a figure drawn with plain colours: its axis-aligned lines in the axis or grid colour of its theme */
    if (K && (K.ax || K.gr) && n.tagName === 'line') {
      const a = k => +n.getAttribute(k);
      if (Math.abs(a('x1') - a('x2')) < 0.01 || Math.abs(a('y1') - a('y2')) < 0.01) {
        const s = String(n.hasAttribute('data-fe-stroke') ? n.getAttribute('data-fe-stroke') : n.getAttribute('stroke') || '').toLowerCase();
        if (s && s === K.gr) return 'grid';
        if (s && s === K.ax) return 'axis';
      }
    }
    return 'series';
  }
  /* how the editor's own nodes are painted: with the figure's CSS variables, or
     with plain colours when the figure is drawn with plain colours */
  function ink(svg) {
    const bgR = svg.querySelector(':scope > rect[data-bg]');
    const literal = CFG.literal != null ? !!CFG.literal : !!bgR;
    if (!literal) return { literal, bgR, text: null, muted: null, card: 'var(--card-bg)', line: 'var(--border-strong)', note: 'var(--text)', font: null };
    let t = null;
    const ts = svg.querySelectorAll('text');
    for (let i = 0; i < ts.length && !t; i++) if (!isOwn(ts[i])) t = ts[i];
    const fill = t ? (t.getAttribute('data-fe-fill') || t.getAttribute('fill')) : null;
    const text = fill && fill !== 'none' ? fill : '#1b1f2a';
    const b0 = bgR ? (bgR.getAttribute('data-fe-fill') || bgR.getAttribute('fill')) : null;
    const card = b0 && b0 !== 'none' ? b0 : '#ffffff';
    /* the theme the figure was drawn with (Fig.themes of the Fig.mount family) names its axis and grid colours */
    let ax = null, gr = null;
    const F = window.Fig, lc = v => String(v || '').toLowerCase();
    if (F && F.themes) {
      const fills = new Set();
      for (let i = 0; i < ts.length && i < 40; i++) if (!isOwn(ts[i])) fills.add(lc(ts[i].getAttribute('data-fe-fill') || ts[i].getAttribute('fill')));
      const th = Object.keys(F.themes).map(k => F.themes[k]).find(x => x && lc(x.bg) === lc(card) && fills.has(lc(x.fg)));
      if (th) {
        if (th.axis && th.axis !== 'none' && lc(th.axis) !== lc(th.fg)) ax = lc(th.axis);
        if (th.grid && th.grid !== 'none' && lc(th.grid) !== lc(th.fg)) gr = lc(th.grid);
      }
    }
    return { literal, bgR, text, muted: text, card, line: text, note: text, font: t ? t.getAttribute('font-family') : null, ax, gr };
  }
  /* the entries of the legend the drawing kit tagged: [{i, mark, text, key, label}] */
  function legendOf(svg) {
    const g = svg.querySelector('[data-role="legend"]');
    if (!g) return null;
    const items = new Map();
    g.querySelectorAll('[data-li]').forEach(n => {
      const i = +n.getAttribute('data-li');
      if (!items.has(i)) items.set(i, { i, mark: null, text: null, nodes: [] });
      const it = items.get(i);
      it.nodes.push(n);
      if (n.tagName === 'text') it.text = n; else if (!it.mark) it.mark = n;
    });
    const list = [...items.values()].sort((a, b) => a.i - b.i).filter(x => x.mark && x.text);
    list.forEach(x => {
      const m = x.mark, at = a => m.getAttribute('data-fe-' + a) || m.getAttribute(a) || '';
      const f = at('fill'), s = at('stroke');
      x.key = m.tagName === 'line' || !f || f === 'none' ? (s && s !== 'none' ? s : f) : f;
      x.label = origText(x.text);
    });
    return { g, items: list };
  }
  const html0 = new WeakMap();   /* the markup of a text that carried <tspan>s, to put it back */

  /* ---------------- applying the edits to an SVG ---------------- */
  let busy = false, mo = null;
  const pendingVis = new WeakSet();
  let ro = null;
  function apply(svg, key) {
    if (!svg) return;
    key = key || keyOf(svg);
    if (!has(key)) return;
    const was = busy; busy = true;
    try { applyNow(svg, edits(key)); svg.setAttribute('data-fe-ok', '1'); } catch (e) { console.error('FigEdit', e); }
    if (key === cur) { svg.classList.add('fe-editing'); arm(svg); }
    if (mo && !was) mo.takeRecords();
    busy = was;
    if (!svg.getClientRects().length && svg.isConnected) {
      if (!ro && window.ResizeObserver) ro = new ResizeObserver(list => list.forEach(en => { const s = en.target; if (s.getClientRects().length && pendingVis.has(s)) { pendingVis.delete(s); ro.unobserve(s); apply(s); } }));
      if (ro && !pendingVis.has(svg)) { pendingVis.add(svg); ro.observe(svg); }
    }
  }
  function applyNow(svg, ed) {
    /* the box the figure was drawn in: ours may be larger (title, footnote, legend below) */
    const vbNow = boxOf(svg);
    if (!(svg.dataset.feVbx === vbNow && svg.dataset.feVb0)) {
      svg.dataset.feVb0 = vbNow;
      svg.dataset.feWh0 = [svg.getAttribute('height') || '', svg.dataset.h || ''].join('|');
    }
    const [bx, by, bw, bh] = nums(svg.dataset.feVb0);
    svg.querySelectorAll('[data-fe-own]').forEach(n => n.remove());
    const rendered = svg.getClientRects().length > 0;
    const pr = plotRect(svg);
    const K = ink(svg);
    const famOn = ed.font && FONTS[ed.font] ? FONTS[ed.font][2] : null;
    const fScale = ed.fontScale || 1;

    /* texts */
    svg.querySelectorAll('text').forEach(t => {
      const orig = t.hasAttribute('data-fe-t') ? t.getAttribute('data-fe-t') : (t.setAttribute('data-fe-t', t.textContent), t.textContent);
      const fs0 = parseFloat(remember(t, 'font-size', 'data-fe-fs')) || parseFloat(getComputedStyleSafe(t, 'fontSize')) || 10;
      const te = ed.texts[orig] || {};
      const tick = isTick(t);
      t.style.fontFamily = famOn || '';
      if (te.t != null && te.t !== orig) {
        if (t.textContent !== te.t) { if (t.childElementCount && !html0.has(t)) html0.set(t, t.innerHTML); t.textContent = te.t; }
      } else if (t.textContent !== orig) { if (html0.has(t)) t.innerHTML = html0.get(t); else t.textContent = orig; }
      const k = fScale * (te.scale || 1) * (tick ? (ed.tickScale || 1) : 1);
      t.style.fontSize = Math.abs(k - 1) > 1e-6 ? (fs0 * k).toFixed(2) + 'px' : '';
      remember(t, 'font-weight', 'data-fe-fw');
      if (te.bold != null) t.setAttribute('font-weight', te.bold ? 700 : 400);
      else { const w0 = t.getAttribute('data-fe-fw'); if (w0) t.setAttribute('font-weight', w0); else t.removeAttribute('font-weight'); }
      remember(t, 'font-style', 'data-fe-fi');
      if (te.italic) t.setAttribute('font-style', 'italic');
      else { const i0 = t.getAttribute('data-fe-fi'); if (i0) t.setAttribute('font-style', i0); else t.removeAttribute('font-style'); }
      remember(t, 'fill', 'data-fe-fill');
      const col = te.color || (tick && ed.tickColor) || ed.textColor;
      if (col) t.setAttribute('fill', col);
      else { const f0 = t.getAttribute('data-fe-fill'); if (f0) t.setAttribute('fill', f0); else t.removeAttribute('fill'); }
      t.style.display = te.hidden ? 'none' : '';
    });

    /* lines, bars, points: colours and the style of each series */
    svg.querySelectorAll(SHAPES).forEach(n => {
      if (n.closest('defs, clipPath, mask, pattern, marker')) return;
      const kd = kind(n, K);
      if (kd === 'skip') return;
      const sw0 = remember(n, 'stroke-width', 'data-fe-sw');
      if (kd === 'grid') {
        n.style.display = ed.grid === false ? 'none' : '';
        n.style.strokeDasharray = ed.gridDash && DASH[ed.gridDash] ? DASH[ed.gridDash] : '';
        n.style.opacity = ed.gridOpacity != null ? ed.gridOpacity : '';
        n.style.stroke = ed.gridColor || '';
        return;
      }
      if (kd === 'axis') {
        n.style.stroke = ed.axisColor || '';
        n.style.strokeWidth = ed.axisWidth && ed.axisWidth !== 1 ? ((sw0 === '' ? 1 : +sw0) * ed.axisWidth).toFixed(2) + 'px' : '';
        return;
      }
      const f0 = remember(n, 'fill', 'data-fe-fill'), s0 = remember(n, 'stroke', 'data-fe-stroke');
      [['fill', f0], ['stroke', s0]].forEach(([a, o]) => {
        if (!o) return;
        const mapped = ed.colors[o];
        if (mapped) n.setAttribute(a, recolour(o, mapped, svg)); else if (n.getAttribute(a) !== o) n.setAttribute(a, o);
      });
      const se = (s0 && s0 !== 'none' && ed.series[s0]) || (f0 && f0 !== 'none' && ed.series[f0]) || null;
      const k = (ed.lineScale || 1) * (se && se.width ? se.width : 1);
      n.style.strokeWidth = Math.abs(k - 1) > 1e-6 && (sw0 !== '' || (s0 && s0 !== 'none')) ? ((sw0 === '' ? 1 : +sw0) * k).toFixed(2) + 'px' : '';
      n.style.strokeDasharray = se && se.dash && DASH[se.dash] ? DASH[se.dash] : '';
      const op0 = remember(n, 'opacity', 'data-fe-op');
      n.style.opacity = se && se.opacity != null && se.opacity !== 1 ? ((op0 === '' ? 1 : +op0) * se.opacity).toFixed(3) : '';
      n.style.display = se && se.hidden ? 'none' : '';
      if (n.tagName === 'circle') { const r0 = +remember(n, 'r', 'data-fe-r'); if (ed.markerScale && ed.markerScale !== 1) n.setAttribute('r', (r0 * ed.markerScale).toFixed(2)); else if (n.getAttribute('r') !== String(r0) && n.hasAttribute('data-fe-r')) n.setAttribute('r', n.getAttribute('data-fe-r')); }
    });

    /* the legend: entries, layout, size, place */
    let below = 0;
    const lg = legendOf(svg), L = ed.legend || {};
    if (lg) {
      const g = lg.g;
      const tr0 = remember(g, 'transform', 'data-fe-tr');
      if (tr0) g.setAttribute('transform', tr0); else g.removeAttribute('transform');
      g.style.display = L.hidden ? 'none' : '';
      const layout = L.layout || (L.vertical ? 'col' : '');
      const frame = g.querySelector('[data-role="legend-box"]');
      if (frame) frame.style.display = layout || (L.scale && L.scale !== 1) ? 'none' : '';
      lg.items.forEach(it => {
        it.nodes.forEach(n => { const t0 = remember(n, 'transform', 'data-fe-tr'); if (t0) n.setAttribute('transform', t0); else n.removeAttribute('transform'); });
        it.off = !!((ed.series[it.key] && ed.series[it.key].hidden) || (ed.texts[it.label] && ed.texts[it.label].hidden));
        it.text.style.display = it.off ? 'none' : '';
        if (it.off && ed.texts[it.label] && ed.texts[it.label].hidden) it.nodes.forEach(n => { if (n !== it.text) n.style.display = 'none'; });
      });
      if (rendered && !L.hidden && lg.items.length) {
        const bbox = n => { try { return n.getBBox(); } catch (e) { return null; } };
        if (layout) {
          const on = lg.items.filter(it => !it.off);
          const boxes = on.map(it => {
            let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
            it.nodes.forEach(n => { const b = bbox(n); if (!b) return; x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.width); y1 = Math.max(y1, b.y + b.height); });
            return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
          });
          if (boxes.length && boxes.every(b => isFinite(b.x) && isFinite(b.w))) {
            const X0 = Math.min(...boxes.map(b => b.x)), Y0 = Math.min(...boxes.map(b => b.y));
            const lh = Math.max(...boxes.map(b => b.h)) * 1.3;
            let cx = X0;
            on.forEach((it, k) => {
              const b = boxes[k];
              const tx = layout === 'col' ? X0 : cx, ty = layout === 'col' ? Y0 + k * lh : Y0;
              cx += b.w + 14;
              const dx = tx - b.x, dy = ty - b.y;
              if (Math.abs(dx) > 0.05 || Math.abs(dy) > 0.05) it.nodes.forEach(n => { const t0 = n.getAttribute('data-fe-tr'); n.setAttribute('transform', `translate(${dx.toFixed(1)} ${dy.toFixed(1)})` + (t0 ? ' ' + t0 : '')); });
            });
          }
        }
        const bb = bbox(g);
        if (bb && bb.width > 0) {
          /* where the legend sits in the figure's own coordinates */
          let M = null;
          try { M = svg.getScreenCTM().inverse().multiply(g.getScreenCTM()); } catch (e) { M = null; }
          const sx = M ? M.a : 1, sy = M ? M.d : 1;
          const ox = M ? M.a * bb.x + M.e : bb.x, oy = M ? M.d * bb.y + M.f : bb.y;
          const s = L.scale || 1, w = bb.width * sx * s, h = bb.height * sy * s;
          const P = pr || { l: bx + bw * 0.1, t: by + bh * 0.08, w: bw * 0.84, h: bh * 0.74 };
          let X = ox, Y = oy;
          const pos = L.pos || 'orig';
          if (pos === 'tl') { X = P.l + 8; Y = P.t + 8; }
          else if (pos === 'tr') { X = P.l + P.w - w - 8; Y = P.t + 8; }
          else if (pos === 'bl') { X = P.l + 8; Y = P.t + P.h - h - 8; }
          else if (pos === 'br') { X = P.l + P.w - w - 8; Y = P.t + P.h - h - 8; }
          else if (pos === 'tc') { X = bx + (bw - w) / 2; }
          else if (pos === 'below' || pos === 'belowc') { X = pos === 'below' ? P.l : bx + (bw - w) / 2; Y = by + bh + 4; below = h + 10; }
          X += L.dx || 0; Y += L.dy || 0;
          if (L.box) g.insertBefore(own('rect', { x: bb.x - 5, y: bb.y - 4, width: bb.width + 10, height: bb.height + 8, rx: 3, fill: K.card, stroke: K.line, 'stroke-width': 0.8, opacity: 0.94 }), g.firstChild);
          if (s !== 1 || Math.abs(X - ox) > 0.05 || Math.abs(Y - oy) > 0.05)
            g.setAttribute('transform', `translate(${X.toFixed(1)} ${Y.toFixed(1)}) scale(${s}) translate(${(-ox).toFixed(1)} ${(-oy).toFixed(1)})` + (tr0 ? ' ' + tr0 : ''));
          g.setAttribute('data-fe-drag', 'legend');
        }
      }
    }

    /* title, subtitle and footnote enlarge the box of the figure */
    const ts = ed.titleScale || 1;
    let top = 0;
    if (ed.title) top += 19 * ts;
    if (ed.subtitle) top += 14 * ts;
    if (top) top += 5;
    const u = Math.max(1, bw / 700);    /* figures drawn on a larger canvas get proportionally larger additions */
    top *= u;
    const noteLines = ed.note ? wrap(ed.note, Math.floor(bw / (5.2 * u))) : [];
    const bottom = below + (noteLines.length ? (noteLines.length * 12 + 8) * u : 0);
    const txt = (attrs, text, muted) => {
      const a = Object.assign({}, attrs);
      if (K.literal) { if (!a.fill) a.fill = ed.textColor || (muted ? K.muted : K.text); if (muted && !ed.textColor) a.opacity = 0.78; if (K.font) a['font-family'] = K.font; }
      else { a.class = muted ? 'art-mut' : 'art-txt'; if (ed.textColor && !a.fill) a.fill = ed.textColor; }
      const t = own('text', a, text);
      if (famOn) t.style.fontFamily = famOn;
      return t;
    };
    const centre = ed.titleAlign === 'center';
    let ty = by - top;
    if (ed.title) { ty += 15 * ts * u; svg.appendChild(txt({ x: centre ? bx + bw / 2 : bx + 8 * u, y: ty, 'font-size': (13.5 * ts * fScale * u).toFixed(2), 'font-weight': 700, 'text-anchor': centre ? 'middle' : 'start', 'data-fe-part': 'title' }, ed.title)); }
    if (ed.subtitle) { ty += (ed.title ? 14 : 12) * ts * u; svg.appendChild(txt({ x: centre ? bx + bw / 2 : bx + 8 * u, y: ty, 'font-size': (10.5 * ts * fScale * u).toFixed(2), 'text-anchor': centre ? 'middle' : 'start', 'data-fe-part': 'subtitle' }, ed.subtitle, true)); }
    noteLines.forEach((line, i) => svg.appendChild(txt({ x: bx + 8 * u, y: by + bh + below + (12 + i * 12) * u, 'font-size': (9.5 * fScale * u).toFixed(2), 'data-fe-part': 'note' }, line, true)));
    const wh0 = (svg.dataset.feWh0 || '|').split('|');
    const sizeTo = k => {
      if (wh0[0] !== '' && isFinite(+wh0[0])) svg.setAttribute('height', (+wh0[0] * k).toFixed(1));
      if (wh0[1] !== '' && isFinite(+wh0[1])) svg.dataset.h = String(+(+wh0[1] * k).toFixed(1));
    };
    if (top || bottom) {
      const vbx = `${bx} ${(by - top).toFixed(1)} ${bw} ${(bh + top + bottom).toFixed(1)}`;
      svg.setAttribute('viewBox', vbx); svg.dataset.feVbx = vbx;
      sizeTo((bh + top + bottom) / bh);
    } else if (svg.dataset.feVbx) { svg.setAttribute('viewBox', svg.dataset.feVb0); delete svg.dataset.feVbx; sizeTo(1); }
    const [vx, vy, vw, vh] = nums(boxOf(svg));

    /* background and border */
    const bgCol = ed.bg && ed.bg !== 'none' ? (ed.bg === 'white' ? '#ffffff' : ed.bgColor || '#ffffff') : null;
    if (K.bgR) {
      const r = K.bgR, f0 = remember(r, 'fill', 'data-fe-fill');
      r.setAttribute('fill', bgCol || f0 || 'none');
      const y0 = remember(r, 'y', 'data-fe-y'), h0 = remember(r, 'height', 'data-fe-h');
      if (top || bottom) { r.setAttribute('y', vy); r.setAttribute('height', vh); }
      else { r.setAttribute('y', y0 || 0); if (h0) r.setAttribute('height', h0); }
    } else if (bgCol) svg.insertBefore(own('rect', { x: vx, y: vy, width: vw, height: vh, fill: bgCol, 'data-fe-part': 'bg' }), svg.firstChild);
    const axAttrs = K.literal ? { stroke: ed.axisColor || K.line } : { class: 'art-ax', style: ed.axisColor ? `stroke:${ed.axisColor}` : null };
    if (ed.box && pr) svg.appendChild(own('rect', Object.assign({ x: pr.l, y: pr.t, width: pr.w, height: pr.h, fill: 'none', 'stroke-width': 1.2 * (ed.axisWidth || 1), 'data-fe-part': 'box' }, axAttrs)));
    if (ed.border) svg.appendChild(own('rect', Object.assign({ x: vx + 0.6, y: vy + 0.6, width: vw - 1.2, height: vh - 1.2, fill: 'none', 'stroke-width': 1 * u, 'data-fe-part': 'border' }, axAttrs)));

    /* annotations */
    if (ed.notes && ed.notes.length) {
      const layer = own('g', { 'data-fe-part': 'notes' });
      svg.appendChild(layer);   /* attached first: a boxed note measures its own text */
      const yr = range(svg, 'yr'), y2r = range(svg, 'y2r'), xr = range(svg, 'xr');
      const fx = v => bx + v * bw, fy = v => by + v * bh;
      const ntxt = (attrs, text) => { const a = Object.assign({}, attrs); if (K.literal && K.font) a['font-family'] = K.font; const t = own('text', a, text); if (famOn) t.style.fontFamily = famOn; return t; };
      ed.notes.forEach(nt => {
        const col = nt.color || K.note;
        const drag = { 'data-fe-drag': 'note:' + nt.id };
        if (nt.type === 'text' || nt.type === 'letter') {
          const size = (nt.size || (nt.type === 'letter' ? 16 : 10)) * fScale * u;
          const t = ntxt(Object.assign({ x: fx(nt.x), y: fy(nt.y), 'font-size': size.toFixed(2), fill: col, 'font-weight': nt.bold || nt.type === 'letter' ? 700 : 400, 'font-style': nt.italic ? 'italic' : null, 'text-anchor': nt.anchor || 'start' }, drag), nt.t || '');
          layer.appendChild(t);
          if (nt.box && rendered) {
            let bb = null; try { bb = t.getBBox(); } catch (e) { bb = null; }
            if (bb && bb.width) layer.insertBefore(own('rect', { x: bb.x - 4, y: bb.y - 2, width: bb.width + 8, height: bb.height + 4, rx: 3, fill: K.card, stroke: col, 'stroke-width': 0.7, opacity: 0.92 }), t);
          }
        } else if (nt.type === 'arrow') {
          const x1 = fx(nt.x), y1 = fy(nt.y), x2 = fx(nt.x2), y2 = fy(nt.y2), w = (nt.width || 1.4) * u;
          const a = Math.atan2(y2 - y1, x2 - x1), h = 6 * u + w * 1.6;
          const g = own('g', drag);
          g.appendChild(own('line', { x1, y1, x2: x2 - Math.cos(a) * h * 0.6, y2: y2 - Math.sin(a) * h * 0.6, stroke: col, 'stroke-width': w, 'stroke-linecap': 'round', 'stroke-dasharray': nt.dash && DASH[nt.dash] !== 'none' ? DASH[nt.dash] : null }));
          g.appendChild(own('path', { d: `M${x2.toFixed(1)} ${y2.toFixed(1)}L${(x2 - Math.cos(a - 0.42) * h).toFixed(1)} ${(y2 - Math.sin(a - 0.42) * h).toFixed(1)}L${(x2 - Math.cos(a + 0.42) * h).toFixed(1)} ${(y2 - Math.sin(a + 0.42) * h).toFixed(1)}Z`, fill: col }));
          g.appendChild(own('line', { x1, y1, x2, y2, stroke: 'transparent', 'stroke-width': 10 * u }));
          if (nt.t) g.appendChild(ntxt({ x: x1, y: y1 - 4 * u, 'font-size': ((nt.size || 9.5) * fScale * u).toFixed(2), fill: col, 'text-anchor': x2 >= x1 ? 'end' : 'start' }, nt.t));
          layer.appendChild(g);
        } else if (pr && (nt.type === 'hline' || nt.type === 'band')) {
          const r = nt.axis === 'y2' && y2r ? y2r : yr;
          if (!r) return;
          const Y = v => pr.t + pr.h - (v - r[0]) / (r[1] - r[0]) * pr.h;
          const inside = v => v >= Math.min(r[0], r[1]) && v <= Math.max(r[0], r[1]);
          const ds = DASH[nt.dash || 'dash'] === 'none' ? null : DASH[nt.dash || 'dash'];
          if (nt.type === 'hline' && isFinite(nt.v) && inside(nt.v)) {
            layer.appendChild(own('line', { x1: pr.l, x2: pr.l + pr.w, y1: Y(nt.v), y2: Y(nt.v), stroke: col, 'stroke-width': (nt.width || 1.3) * u, 'stroke-dasharray': ds }));
            if (nt.t) layer.appendChild(ntxt({ x: nt.right ? pr.l + pr.w - 4 * u : pr.l + 5 * u, y: Y(nt.v) - 3 * u, 'font-size': ((nt.size || 9) * fScale * u).toFixed(2), fill: col, 'font-weight': 600, 'text-anchor': nt.right ? 'end' : 'start' }, nt.t));
          } else if (nt.type === 'band' && isFinite(nt.v) && isFinite(nt.v2)) {
            const a = clamp(Y(Math.max(nt.v, nt.v2)), pr.t, pr.t + pr.h), b = clamp(Y(Math.min(nt.v, nt.v2)), pr.t, pr.t + pr.h);
            layer.appendChild(own('rect', { x: pr.l, y: Math.min(a, b), width: pr.w, height: Math.abs(b - a), fill: col, opacity: nt.opacity == null ? 0.14 : nt.opacity }));
            if (nt.t) layer.appendChild(ntxt({ x: pr.l + 5 * u, y: Math.min(a, b) + 11 * u, 'font-size': ((nt.size || 9) * fScale * u).toFixed(2), fill: col, 'font-weight': 600 }, nt.t));
          }
        } else if (pr && nt.type === 'vline' && xr && isFinite(nt.v)) {
          const X = pr.l + (nt.v - xr[0]) / (xr[1] - xr[0]) * pr.w;
          if (X < pr.l - 0.5 || X > pr.l + pr.w + 0.5) return;
          const ds = DASH[nt.dash || 'dash'] === 'none' ? null : DASH[nt.dash || 'dash'];
          layer.appendChild(own('line', { x1: X, x2: X, y1: pr.t, y2: pr.t + pr.h, stroke: col, 'stroke-width': (nt.width || 1.3) * u, 'stroke-dasharray': ds }));
          if (nt.t) layer.appendChild(ntxt({ x: X + 4 * u, y: pr.t + 11 * u, 'font-size': ((nt.size || 9) * fScale * u).toFixed(2), fill: col, 'font-weight': 600 }, nt.t));
        }
      });
    }
  }
  function getComputedStyleSafe(n, prop) { try { return n.isConnected ? getComputedStyle(n)[prop] : ''; } catch (e) { return ''; } }

  /* ---------------- what the panel lists ---------------- */
  function textsOf(svg, withTicks) {
    const seen = new Map();
    svg.querySelectorAll('text').forEach(t => {
      if (isOwn(t)) return;
      if (!withTicks && isTick(t)) return;
      const o = origText(t);
      if (o.trim() && !seen.has(o)) seen.set(o, roleOf(t));
    });
    return [...seen.keys()];
  }
  function seriesOf(svg) {
    const m = new Map();
    const names = new Map();
    const K = ink(svg);
    const lg = legendOf(svg);
    if (lg) lg.items.forEach(it => { if (it.key && !names.has(it.key)) names.set(it.key, it.label); });
    svg.querySelectorAll(SHAPES).forEach(n => {
      if (n.closest('defs, clipPath, mask, pattern, marker') || isOwn(n)) return;
      if (kind(n, K) !== 'series') return;
      ['fill', 'stroke'].forEach(a => {
        const o = n.getAttribute('data-fe-' + a) || n.getAttribute(a);
        if (!o || o === 'none' || o === 'transparent') return;
        if (!m.has(o)) { const hx = toHex(o, svg); if (!hx) return; m.set(o, { key: o, hex: hx, n: 0, line: false, name: names.get(o) || '' }); }
        const r = m.get(o); r.n++; if (a === 'stroke') r.line = true;
      });
    });
    return [...m.values()].sort((a, b) => (b.name ? 1 : 0) - (a.name ? 1 : 0) || b.n - a.n).slice(0, 30);
  }
  function axisTitles(svg) {
    const out = [], seen = new Set();
    svg.querySelectorAll('text[data-role]').forEach(t => {
      const r = roleOf(t);
      if (!/lab$/.test(r) || isOwn(t)) return;
      const o = origText(t);
      if (!o.trim() || seen.has(o)) return;
      seen.add(o); out.push({ role: r, orig: o });
    });
    return out;
  }
  const hasAxes = svg => { const K = ink(svg); const list = svg.querySelectorAll('line, path, rect'); for (let i = 0; i < list.length; i++) { if (isOwn(list[i])) continue; const k = kind(list[i], K); if (k === 'axis' || k === 'grid') return true; } return false; };

  /* ---------------- the panel ---------------- */
  let panel = null, cur = null, tab = 'general', cache = { texts: [], series: [] }, showTicks = false;
  const row = (lab, ctl, cls) => `<label class="fe-row${cls ? ' ' + cls : ''}"><span>${lab}</span>${ctl}</label>`;
  const rng = (attr, v, lo, hi, step, suf) => `<input type="range" min="${lo}" max="${hi}" step="${step}" value="${v}" ${attr}><b>${(+v).toFixed(2)}${suf == null ? '×' : suf}</b>`;
  const colOpt = (name, v, def) => `<span class="fe-col"><input type="color" value="${v || def}" data-feg="${name}"><button type="button" class="fe-b fe-clear${v ? ' on' : ''}" data-fe-clear="${name}" title="${esc(T('quitar: volver al color de la figura', 'clear: back to the figure\'s colour'))}">${v ? '✓' : '—'}</button></span>`;
  const sel = (attr, v, opts) => `<select ${attr}>${opts.map(([k, es, en]) => `<option value="${k}"${(v || '') === k ? ' selected' : ''}>${esc(T(es, en))}</option>`).join('')}</select>`;
  const chk = (attr, on, es, en) => `<label class="fe-check"><input type="checkbox" ${attr}${on ? ' checked' : ''}> ${T(es, en)}</label>`;
  const DASH_OPTS = [['', 'como está', 'as drawn'], ['solid', 'continua', 'solid'], ['dash', 'guiones', 'dashed'], ['dot', 'puntos', 'dotted'], ['dashdot', 'guion y punto', 'dash-dot']];
  const TABS = [['general', 'General', 'General'], ['axes', 'Ejes y rejilla', 'Axes & grid'], ['series', 'Series', 'Series'], ['legend', 'Leyenda', 'Legend'], ['texts', 'Textos', 'Texts'], ['notes', 'Anotaciones', 'Annotations']];

  function body(svg) {
    const ed = edits(cur);
    if (tab === 'general') {
      return `<div class="fe-grid">
        <h4>${T('Título dentro de la figura', 'Title inside the figure')}</h4>
        <input type="text" class="fe-wide" data-feg="title" value="${esc(ed.title || '')}" placeholder="${esc(T('Título (vacío = sin título)', 'Title (empty = none)'))}">
        <input type="text" class="fe-wide" data-feg="subtitle" value="${esc(ed.subtitle || '')}" placeholder="${esc(T('Subtítulo', 'Subtitle'))}">
        <input type="text" class="fe-wide" data-feg="note" value="${esc(ed.note || '')}" placeholder="${esc(T('Nota al pie: fuente de los datos, periodo, n…', 'Footnote: data source, period, n…'))}">
        ${row(T('Tamaño y alineación del título', 'Title size and alignment'), rng('data-feg="titleScale"', ed.titleScale || 1, 0.7, 1.8, 0.05) + sel('data-feg="titleAlign"', ed.titleAlign || 'left', [['left', 'izquierda', 'left'], ['center', 'centro', 'centre']]), 'fe-row3')}
        <h4>${T('Tipografía y trazo', 'Type and stroke')}</h4>
        ${row(T('Familia tipográfica', 'Font family'), `<select data-feg="font">${Object.keys(FONTS).map(k => `<option value="${k}"${(ed.font || '') === k ? ' selected' : ''}>${esc(T(FONTS[k][0], FONTS[k][1]))}</option>`).join('')}</select>`)}
        ${row(T('Tamaño de todos los textos', 'Size of every text'), rng('data-feg="fontScale"', ed.fontScale || 1, 0.6, 2.2, 0.05))}
        ${row(T('Color de todos los textos', 'Colour of every text'), colOpt('textColor', ed.textColor, '#152230'))}
        ${row(T('Grosor de las líneas', 'Line weight'), rng('data-feg="lineScale"', ed.lineScale || 1, 0.3, 3, 0.05))}
        ${row(T('Tamaño de los puntos', 'Point size'), rng('data-feg="markerScale"', ed.markerScale || 1, 0.3, 3, 0.05))}
        <h4>${T('Fondo y marco', 'Background and frame')}</h4>
        ${row(T('Fondo', 'Background'), sel('data-feg="bg"', ed.bg || 'none', [['none', 'el de la figura', 'the figure\'s own'], ['white', 'blanco', 'white'], ['custom', 'color propio', 'own colour']]) + ` <input type="color" data-feg="bgColor" value="${ed.bgColor || '#ffffff'}">`, 'fe-row3')}
        ${chk('data-feg="border"', ed.border, 'Marco alrededor de toda la figura', 'Border around the whole figure')}
      </div>`;
    }
    if (tab === 'axes') {
      const ax = axisTitles(svg), pr = plotRect(svg);
      const NAME = { xlab: ['Título del eje X', 'X-axis title'], ylab: ['Título del eje Y', 'Y-axis title'], y2lab: ['Título del eje Y derecho', 'Right Y-axis title'] };
      const name = r => (NAME[r] ? T(NAME[r][0], NAME[r][1]) : T('Título de eje', 'Axis title'));
      return `<div class="fe-grid">
        <h4>${T('Títulos de los ejes', 'Axis titles')}</h4>
        ${ax.length ? ax.map(a => { const te = ed.texts[a.orig] || {}; return `<div class="fe-t fe-ax" data-fe-o="${esc(a.orig)}"><span class="fe-lab">${name(a.role)}</span>
          <input type="text" data-fet="t" value="${esc(te.t != null ? te.t : a.orig)}"><input type="range" min="0.5" max="2.5" step="0.05" value="${te.scale || 1}" data-fet="scale" title="${esc(T('tamaño', 'size'))}">
          <button type="button" class="fe-b${te.hidden ? ' on' : ''}" data-fet="hidden" title="${esc(T('ocultar', 'hide'))}">⦸</button></div>`; }).join('') : `<p class="fe-hint">${T('Esta figura no marca cuáles son sus títulos de eje; todos sus textos están en la pestaña Textos.', 'This figure does not mark its axis titles; all its texts are in the Texts tab.')}</p>`}
        <h4>${T('Marcas y números de los ejes', 'Ticks and axis numbers')}</h4>
        ${row(T('Tamaño de los números', 'Size of the numbers'), rng('data-feg="tickScale"', ed.tickScale || 1, 0.6, 2, 0.05))}
        ${row(T('Color de los números', 'Colour of the numbers'), colOpt('tickColor', ed.tickColor, '#5a6b7a'))}
        ${row(T('Color de los ejes', 'Axis colour'), colOpt('axisColor', ed.axisColor, '#8a97a3'))}
        ${row(T('Grosor de los ejes', 'Axis weight'), rng('data-feg="axisWidth"', ed.axisWidth || 1, 0.4, 3, 0.05))}
        ${pr ? chk('data-feg="box"', ed.box, 'Recuadro alrededor del área de trazado (ejes superior y derecho)', 'Box around the plot area (top and right axes)') : ''}
        <h4>${T('Rejilla', 'Grid')}</h4>
        ${chk('data-feg="grid"', ed.grid !== false, 'Líneas de la rejilla', 'Grid lines')}
        ${row(T('Trazo de la rejilla', 'Grid stroke'), sel('data-feg="gridDash"', ed.gridDash || '', DASH_OPTS))}
        ${row(T('Intensidad de la rejilla', 'Grid strength'), rng('data-feg="gridOpacity"', ed.gridOpacity == null ? 0.55 : ed.gridOpacity, 0.1, 1, 0.05, ''))}
        ${row(T('Color de la rejilla', 'Grid colour'), colOpt('gridColor', ed.gridColor, '#bfcdd9'))}
        ${hasAxes(svg) ? '' : `<p class="fe-hint">${T('Esta figura no marca sus ejes ni su rejilla: sus líneas aparecen en la pestaña Series, por color.', 'This figure does not mark its axes or grid: its lines are in the Series tab, by colour.')}</p>`}
      </div>`;
    }
    if (tab === 'series') {
      const list = cache.series;
      return `<p class="fe-hint">${T('Cada color que usa la figura, con el nombre que le da la leyenda. Cambia el color, el grosor, el trazo o la opacidad, u oculta la serie.', 'Every colour the figure uses, named after its legend entry. Change the colour, the weight, the stroke or the opacity, or hide the series.')}</p>
        <div class="fe-series">${list.map((c, i) => { const se = ed.series[c.key] || {}; return `<div class="fe-s" data-fe-i="${i}">
          <input type="color" data-fes="color" value="${ed.colors[c.key] || c.hex}">
          <span class="fe-sname" title="${esc(c.key)}">${c.name ? esc(c.name) : `<i>${c.n} ${T('elementos', 'elements')}</i>`}${ed.colors[c.key] ? ' ✓' : ''}</span>
          <input type="range" min="0.3" max="3" step="0.05" value="${se.width || 1}" data-fes="width" title="${esc(T('grosor', 'weight'))}"${c.line ? '' : ' disabled'}>
          ${sel('data-fes="dash"', se.dash || '', DASH_OPTS)}
          <input type="range" min="0.1" max="1" step="0.05" value="${se.opacity == null ? 1 : se.opacity}" data-fes="opacity" title="${esc(T('opacidad', 'opacity'))}">
          <button type="button" class="fe-b${se.hidden ? ' on' : ''}" data-fes="hidden" title="${esc(T('ocultar la serie', 'hide the series'))}">⦸</button></div>`; }).join('')}</div>
        <div class="fe-legend-key">${T('color · nombre · grosor · trazo · opacidad · ocultar', 'colour · name · weight · stroke · opacity · hide')}${Object.keys(ed.colors).length ? ` · <button type="button" class="fe-link" data-fe-nocolors>${T('volver a los colores de la figura', 'back to the figure\'s colours')}</button>` : ''}</div>`;
    }
    if (tab === 'legend') {
      const lg = legendOf(svg), L = ed.legend;
      if (!lg) return `<p class="fe-hint">${T('Esta figura no tiene una leyenda aparte: sus rótulos están dentro del dibujo y se editan en la pestaña Textos; sus colores, en la pestaña Series.', 'This figure has no separate legend: its labels are inside the drawing and are edited in the Texts tab; its colours, in the Series tab.')}</p>`;
      return `<div class="fe-grid">
        ${chk('data-fel="show"', !L.hidden, 'Mostrar la leyenda', 'Show the legend')}
        ${row(T('Posición', 'Position'), sel('data-fel="pos"', L.pos || 'orig', POS))}
        ${row(T('Disposición', 'Layout'), sel('data-fel="layout"', L.layout || (L.vertical ? 'col' : ''), LAYOUT))}
        ${chk('data-fel="box"', L.box, 'Con recuadro y fondo', 'With a box and background')}
        ${row(T('Tamaño', 'Size'), rng('data-fel="scale"', L.scale || 1, 0.6, 2, 0.05))}
        <p class="fe-hint">${T('También puedes <b>arrastrarla</b> sobre la figura con el ratón.', 'You can also <b>drag it</b> on the figure with the mouse.')} ${L.dx || L.dy ? `<button type="button" class="fe-btn" data-fe-lreset>${T('Deshacer el arrastre', 'Undo the drag')}</button>` : ''}</p>
        <h4>${T('Entradas', 'Entries')}</h4>
        <div class="fe-texts">${lg.items.map(it => { const te = ed.texts[it.label] || {}; return `<div class="fe-t fe-leg" data-fe-o="${esc(it.label)}"><span class="fe-sw" style="background:${ed.colors[it.key] || toHex(it.key, svg) || '#888'}"></span>
          <input type="text" data-fet="t" value="${esc(te.t != null ? te.t : it.label)}"><button type="button" class="fe-b${te.hidden ? ' on' : ''}" data-fet="hidden" title="${esc(T('ocultar la entrada', 'hide the entry'))}">⦸</button></div>`; }).join('')}</div>
      </div>`;
    }
    if (tab === 'texts') {
      const list = cache.texts;
      const anyTick = !!svg.querySelector('text[data-role$="tick"]');
      return `<p class="fe-hint">${T('Cada texto de la figura, por su redacción original. Escribe otro, cambia su tamaño, su estilo o su color, u ocúltalo. Con el editor abierto, <b>haz clic en un texto de la figura</b> para saltar a su renglón.', 'Every text of the figure, by its original wording. Type another, change its size, style or colour, or hide it. With the editor open, <b>click a text on the figure</b> to jump to its row.')}</p>
        ${anyTick ? chk('data-fe-ticks', showTicks, 'Listar también los números de los ejes', 'List the axis numbers too') : ''}
        <div class="fe-texts">${list.map((o, i) => { const te = ed.texts[o] || {}; return `<div class="fe-t" data-fe-i="${i}">
          <input type="text" data-fet="t" value="${esc(te.t != null ? te.t : o)}" title="${esc(o)}">
          <input type="range" min="0.5" max="2.5" step="0.05" value="${te.scale || 1}" data-fet="scale" title="${esc(T('tamaño', 'size'))}">
          <button type="button" class="fe-b${te.bold ? ' on' : ''}" data-fet="bold" title="${esc(T('negrita', 'bold'))}"><b>${T('N', 'B')}</b></button><button type="button" class="fe-b${te.italic ? ' on' : ''}" data-fet="italic" title="${esc(T('cursiva', 'italic'))}"><i>${T('K', 'I')}</i></button>
          <input type="color" data-fet="color" value="${te.color || '#152230'}"><button type="button" class="fe-b${te.hidden ? ' on' : ''}" data-fet="hidden" title="${esc(T('ocultar', 'hide'))}">⦸</button></div>`; }).join('') || `<p class="fe-hint">${T('Esta figura no tiene textos.', 'This figure has no texts.')}</p>`}</div>`;
    }
    /* annotations */
    const pr = plotRect(svg), yr = range(svg, 'yr'), xr = range(svg, 'xr'), y2r = range(svg, 'y2r');
    const can = pr && yr;
    const KIND = { text: ['Nota', 'Note'], letter: ['Letra de panel', 'Panel letter'], arrow: ['Flecha', 'Arrow'], hline: ['Línea horizontal', 'Horizontal line'], vline: ['Línea vertical', 'Vertical line'], band: ['Banda', 'Band'] };
    const f = v => (isFinite(v) ? +(+v).toPrecision(4) : '');
    return `<p class="fe-hint">${T('Añade lo que la figura necesita para explicarse sola. Las notas, las letras y las flechas <b>se arrastran</b> sobre la figura; las líneas y las bandas se colocan en un valor del eje.', 'Add what the figure needs to explain itself. Notes, letters and arrows <b>are dragged</b> on the figure; lines and bands sit at a value of the axis.')}</p>
      <div class="fe-add">
        <button type="button" class="fe-btn" data-fe-add="text">+ ${T('Nota', 'Note')}</button>
        <button type="button" class="fe-btn" data-fe-add="arrow">+ ${T('Flecha', 'Arrow')}</button>
        <button type="button" class="fe-btn" data-fe-add="letter">+ ${T('Letra de panel', 'Panel letter')}</button>
        ${can ? `<button type="button" class="fe-btn" data-fe-add="hline">+ ${T('Línea horizontal', 'Horizontal line')}</button>` : ''}
        ${pr && xr ? `<button type="button" class="fe-btn" data-fe-add="vline">+ ${T('Línea vertical', 'Vertical line')}</button>` : ''}
        ${can ? `<button type="button" class="fe-btn" data-fe-add="band">+ ${T('Banda', 'Band')}</button>` : ''}
      </div>
      ${can ? `<p class="fe-hint fe-range">${T('Eje Y', 'Y axis')}: ${f(yr[0])} – ${f(yr[1])}${y2r ? ` · ${T('eje derecho', 'right axis')}: ${f(y2r[0])} – ${f(y2r[1])}` : ''}${xr ? ` · ${T('eje X', 'X axis')}: ${f(xr[0])} – ${f(xr[1])}` : ''}</p>` : `<p class="fe-hint fe-range">${T('Esta figura no declara ejes numéricos: admite notas, flechas y letras de panel.', 'This figure declares no numeric axes: it takes notes, arrows and panel letters.')}</p>`}
      <div class="fe-notes">${(ed.notes || []).map(nt => `<div class="fe-n" data-fe-id="${nt.id}">
        <div class="fe-n-head"><b>${T(KIND[nt.type][0], KIND[nt.type][1])}</b><button type="button" class="fe-b" data-fe-del="${nt.id}" title="${esc(T('quitar', 'remove'))}">✕</button></div>
        <div class="fe-n-body">
          <input type="text" data-fen="t" value="${esc(nt.t || '')}" placeholder="${esc(T('texto', 'text'))}">
          ${nt.type === 'hline' || nt.type === 'vline' || nt.type === 'band' ? `<input type="number" step="any" data-fen="v" value="${f(nt.v)}" title="${esc(T('valor del eje', 'axis value'))}">` : ''}
          ${nt.type === 'band' ? `<input type="number" step="any" data-fen="v2" value="${f(nt.v2)}" title="${esc(T('hasta', 'to'))}">` : ''}
          ${(nt.type === 'hline' || nt.type === 'band') && y2r ? sel('data-fen="axis"', nt.axis || 'y', [['y', 'eje Y', 'Y axis'], ['y2', 'eje derecho', 'right axis']]) : ''}
          <input type="color" data-fen="color" value="${nt.color || '#c0406a'}">
          ${nt.type === 'text' || nt.type === 'letter' ? `<input type="range" min="7" max="28" step="0.5" value="${nt.size || (nt.type === 'letter' ? 16 : 10)}" data-fen="size" title="${esc(T('tamaño', 'size'))}"><button type="button" class="fe-b${nt.bold ? ' on' : ''}" data-fen="bold"><b>${T('N', 'B')}</b></button><button type="button" class="fe-b${nt.italic ? ' on' : ''}" data-fen="italic"><i>${T('K', 'I')}</i></button>${nt.type === 'text' ? `<button type="button" class="fe-b${nt.box ? ' on' : ''}" data-fen="box" title="${esc(T('con recuadro', 'boxed'))}">▭</button>` : ''}` : ''}
          ${nt.type === 'arrow' || nt.type === 'hline' || nt.type === 'vline' ? `<input type="range" min="0.5" max="4" step="0.1" value="${nt.width || 1.3}" data-fen="width" title="${esc(T('grosor', 'weight'))}">${sel('data-fen="dash"', nt.dash || (nt.type === 'arrow' ? 'solid' : 'dash'), DASH_OPTS.slice(1))}` : ''}
          ${nt.type === 'band' ? `<input type="range" min="0.05" max="0.6" step="0.01" value="${nt.opacity == null ? 0.14 : nt.opacity}" data-fen="opacity" title="${esc(T('opacidad', 'opacity'))}">` : ''}
          ${nt.type === 'hline' ? `<button type="button" class="fe-b${nt.right ? ' on' : ''}" data-fen="right" title="${esc(T('rótulo a la derecha', 'label on the right'))}">→</button>` : ''}
        </div></div>`).join('') || `<p class="fe-hint">${T('Todavía no hay anotaciones en esta figura.', 'No annotations on this figure yet.')}</p>`}</div>`;
  }
  function render() {
    const svg = findSvg(cur);
    if (!svg || !panel) return hide();
    cache = { texts: textsOf(svg, showTicks), series: seriesOf(svg) };
    const was = busy; busy = true;
    panel.querySelector('.fe-title').textContent = T('✎ Editar esta figura', '✎ Edit this figure');
    panel.querySelector('.fe-which').textContent = titleOf(paneOf(svg));
    panel.querySelector('.fe-tabs').innerHTML = TABS.map(([k, es, en]) => `<button type="button" class="fe-tab${k === tab ? ' on' : ''}" data-fe-tab="${k}">${T(es, en)}</button>`).join('');
    panel.querySelector('.fe-body').innerHTML = body(svg);
    const pane = paneOf(svg), ex = pane && CFG.exportBtn ? pane.querySelector(CFG.exportBtn) : null;
    panel.querySelector('.fe-foot').innerHTML = `<button type="button" class="fe-btn" data-fe-reset>${T('Deshacer todo en esta figura', 'Undo everything on this figure')}</button><button type="button" class="fe-btn" data-fe-copy>${T('Copiar el estilo a todas las figuras', 'Copy the style to every figure')}</button>${ex ? `<button type="button" class="fe-btn pri" data-fe-export>${T('⤓ Exportar', '⤓ Export')}</button>` : ''}`;
    if (mo && !was) mo.takeRecords();
    busy = was;
  }
  const commit = () => { save(); const svg = findSvg(cur); if (svg) apply(svg, cur); };
  let nid = 0;
  const newId = () => 'n' + Date.now().toString(36) + (nid++);
  function addNote(id, type, o) {
    const svg = findSvg(id), ed = edits(id);
    const yr = svg ? range(svg, 'yr') : null, xr = svg ? range(svg, 'xr') : null;
    const k = ed.notes.filter(n => n.type === type).length;
    const base = { id: newId(), type, color: '#c0406a' };
    const d = type === 'text' ? { t: T('Nota', 'Note'), x: 0.3 + 0.04 * k, y: 0.3 + 0.06 * k, size: 10 }
      : type === 'letter' ? { t: String.fromCharCode(65 + k), x: 0.012, y: 0.07, size: 16, color: null, bold: true }
      : type === 'arrow' ? { t: '', x: 0.36 + 0.03 * k, y: 0.3 + 0.05 * k, x2: 0.48 + 0.03 * k, y2: 0.44 + 0.05 * k, width: 1.4 }
      : type === 'hline' ? { t: '', v: yr ? +((yr[0] + yr[1]) / 2).toPrecision(3) : 0, dash: 'dash' }
      : type === 'vline' ? { t: '', v: xr ? +((xr[0] + xr[1]) / 2).toPrecision(3) : 0, dash: 'dash' }
      : { t: '', v: yr ? +(yr[0] + (yr[1] - yr[0]) * 0.55).toPrecision(3) : 0, v2: yr ? +(yr[0] + (yr[1] - yr[0]) * 0.75).toPrecision(3) : 1, opacity: 0.14 };
    const nt = Object.assign(base, d, o || {});
    if (nt.color == null) delete nt.color;
    ed.notes.push(nt);
    return nt;
  }
  function reset(id) {
    const svg = findSvg(id);
    E[id] = blank();
    if (svg) apply(svg, id);
    delete E[id]; save();
  }
  function ensure() {
    if (panel) return panel;
    css();
    panel = mk('div', { class: 'fe-panel', id: 'figEditPanel' });
    panel.style.display = 'none';
    panel.innerHTML = `<div class="fe-head fe-handle"><b class="fe-title"></b><span class="fe-which"></span><button type="button" class="fe-x" data-fe-close aria-label="Cerrar / Close">✕</button></div>
      <div class="fe-tabs"></div><div class="fe-body"></div><div class="fe-foot"></div>`;
    document.body.appendChild(panel);
    const textRow = n => { const r = n.closest('.fe-t'); return r.hasAttribute('data-fe-o') ? r.getAttribute('data-fe-o') : cache.texts[+r.getAttribute('data-fe-i')]; };
    panel.addEventListener('click', e => {
      const hit = s => e.target.closest(s);
      if (hit('[data-fe-close]')) return hide();
      const tb = hit('.fe-tab'); if (tb) { tab = tb.getAttribute('data-fe-tab'); render(); return; }
      if (hit('[data-fe-reset]')) { reset(cur); render(); return; }
      if (hit('[data-fe-export]')) { const svg = findSvg(cur), pane = svg && paneOf(svg), b = pane && pane.querySelector(CFG.exportBtn); if (b) b.click(); return; }
      if (hit('[data-fe-copy]')) {
        const g = edits(cur);
        let n = 0;
        figures().forEach(f => { if (f.key === cur) return; const d = edits(f.key); GENERAL.forEach(k => { if (g[k] === undefined) delete d[k]; else d[k] = g[k]; }); apply(f.svg, f.key); n++; });
        save();
        hit('[data-fe-copy]').textContent = T(`Copiado a ${n} figuras ✓`, `Copied to ${n} figures ✓`);
        return;
      }
      if (hit('[data-fe-nocolors]')) { edits(cur).colors = {}; commit(); render(); return; }
      if (hit('[data-fe-lreset]')) { const L = edits(cur).legend; delete L.dx; delete L.dy; commit(); render(); return; }
      const cl = hit('.fe-clear');
      if (cl) { delete edits(cur)[cl.getAttribute('data-fe-clear')]; commit(); render(); return; }
      const add = hit('[data-fe-add]'); if (add) { addNote(cur, add.getAttribute('data-fe-add')); commit(); render(); return; }
      const del = hit('[data-fe-del]'); if (del) { const ed = edits(cur); ed.notes = ed.notes.filter(n => n.id !== del.getAttribute('data-fe-del')); commit(); render(); return; }
      const b = hit('.fe-b');
      if (!b) return;
      const ed = edits(cur);
      if (b.hasAttribute('data-fet')) {
        const o = textRow(b), te = (ed.texts[o] = ed.texts[o] || {}), k = b.getAttribute('data-fet');
        te[k] = !te[k]; if (!te[k]) delete te[k]; b.classList.toggle('on', !!te[k]); commit();
      } else if (b.hasAttribute('data-fes')) {
        const c = cache.series[+b.closest('.fe-s').getAttribute('data-fe-i')], se = (ed.series[c.key] = ed.series[c.key] || {});
        se.hidden = !se.hidden; b.classList.toggle('on', se.hidden); commit();
      } else if (b.hasAttribute('data-fen')) {
        const nt = ed.notes.find(n => n.id === b.closest('.fe-n').getAttribute('data-fe-id')); if (!nt) return;
        const k = b.getAttribute('data-fen');
        nt[k] = !nt[k]; b.classList.toggle('on', !!nt[k]); commit();
      }
    });
    const onInput = e => {
      const t = e.target, ed = edits(cur);
      const at = k => t.getAttribute(k);
      const val = t.type === 'checkbox' ? t.checked : t.type === 'range' || t.type === 'number' ? +t.value : t.value;
      const lab = () => { if (t.type === 'range') { const b = t.nextElementSibling; if (b && b.tagName === 'B') b.textContent = (+t.value).toFixed(2) + (/Opacity/.test(at('data-feg') || '') ? '' : '×'); } };
      if (t.hasAttribute('data-fe-ticks')) { showTicks = t.checked; render(); return; }
      if (t.hasAttribute('data-feg')) {
        const g = at('data-feg');
        if (g === 'grid') ed.grid = t.checked;
        else if (t.type === 'text') { if (t.value.trim()) ed[g] = t.value; else delete ed[g]; }
        else if (val === '' || val === false || (t.type === 'range' && g !== 'gridOpacity' && Math.abs(val - 1) < 1e-9)) delete ed[g];
        else ed[g] = val;
        lab(); commit();
        if (t.type === 'color') { const c = t.parentElement.querySelector('.fe-clear'); if (c) { c.classList.add('on'); c.textContent = '✓'; } }
        return;
      }
      if (t.hasAttribute('data-fel')) {
        const L = ed.legend, k = at('data-fel');
        if (k === 'show') { if (t.checked) delete L.hidden; else L.hidden = true; }
        else if (k === 'pos') { if (val === 'orig') delete L.pos; else L.pos = val; delete L.dx; delete L.dy; }
        else if (k === 'layout') { delete L.vertical; if (val) L.layout = val; else delete L.layout; }
        else if (val === false || (k === 'scale' && Math.abs(val - 1) < 1e-9)) delete L[k];
        else L[k] = val;
        lab(); commit(); return;
      }
      if (t.hasAttribute('data-fet')) {
        const r = t.closest('.fe-t'), o = r.hasAttribute('data-fe-o') ? r.getAttribute('data-fe-o') : cache.texts[+r.getAttribute('data-fe-i')], te = (ed.texts[o] = ed.texts[o] || {}), k = at('data-fet');
        if (k === 't') { if (t.value === o) delete te.t; else te.t = t.value; }
        else if (k === 'scale' && Math.abs(val - 1) < 1e-9) delete te.scale;
        else te[k] = val;
        if (!Object.keys(te).length) delete ed.texts[o];
        commit(); return;
      }
      if (t.hasAttribute('data-fes')) {
        const c = cache.series[+t.closest('.fe-s').getAttribute('data-fe-i')]; if (!c) return;
        const k = at('data-fes');
        if (k === 'color') ed.colors[c.key] = t.value;
        else { const se = (ed.series[c.key] = ed.series[c.key] || {}); if (val === '') delete se[k]; else se[k] = val; }
        commit(); return;
      }
      if (t.hasAttribute('data-fen')) {
        const nt = ed.notes.find(n => n.id === t.closest('.fe-n').getAttribute('data-fe-id')); if (!nt) return;
        nt[at('data-fen')] = val; commit();
      }
    };
    panel.addEventListener('input', onInput);
    panel.addEventListener('change', e => { if (e.target.tagName === 'SELECT' || e.target.type === 'checkbox') onInput(e); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && cur && panel.style.display !== 'none') hide(); });
    /* the panel is moved by its header */
    let mv = null;
    panel.querySelector('.fe-handle').addEventListener('pointerdown', e => { if (e.target.closest('button')) return; mv = { x: e.clientX, y: e.clientY, l: panel.offsetLeft, t: panel.offsetTop }; e.preventDefault(); });
    window.addEventListener('pointermove', e => { if (!mv) return; panel.style.left = Math.max(4, mv.l + e.clientX - mv.x) + 'px'; panel.style.top = Math.max(4, mv.t + e.clientY - mv.y) + 'px'; });
    window.addEventListener('pointerup', () => { mv = null; });
    return panel;
  }

  /* ---------------- dragging on the figure ---------------- */
  let drag = null;
  function svgPoint(svg, e) { const p = svg.createSVGPoint(); p.x = e.clientX; p.y = e.clientY; const m = svg.getScreenCTM(); return m ? p.matrixTransform(m.inverse()) : { x: 0, y: 0 }; }
  function onDown(e) {
    const svg = e.currentTarget;
    if (!cur || keyOf(svg) !== cur || !panel || panel.style.display === 'none') return;
    const h = e.target.closest('[data-fe-drag]');
    if (h && svg.contains(h)) {
      const p = svgPoint(svg, e), what = h.getAttribute('data-fe-drag'), ed = edits(cur);
      drag = { svg, what, p, moved: false };
      if (what === 'legend') drag.start = { dx: ed.legend.dx || 0, dy: ed.legend.dy || 0 };
      else { const nt = ed.notes.find(n => 'note:' + n.id === what); if (!nt) { drag = null; return; } drag.nt = nt; drag.start = { x: nt.x, y: nt.y, x2: nt.x2, y2: nt.y2 }; }
      try { svg.setPointerCapture(e.pointerId); } catch (err) { /* no capture: the move still works */ }
      e.preventDefault(); e.stopPropagation();
      return;
    }
    /* a click on a text of the figure opens its row */
    const t = e.target.closest('text');
    if (t && !isOwn(t)) {
      const o = origText(t);
      if (isTick(t)) showTicks = true;
      tab = 'texts'; render();
      const i = cache.texts.indexOf(o), r = panel.querySelector(`.fe-t[data-fe-i="${i}"] input[type=text]`);
      if (r) { r.scrollIntoView({ block: 'center' }); r.focus(); r.select(); e.preventDefault(); }
    }
  }
  function onMove(e) {
    if (!drag) return;
    const p = svgPoint(drag.svg, e), dx = p.x - drag.p.x, dy = p.y - drag.p.y;
    if (Math.abs(dx) + Math.abs(dy) < 0.5) return;
    drag.moved = true;
    const ed = edits(cur), bb = baseBox(drag.svg), bw = bb[2], bh = bb[3];
    if (drag.what === 'legend') { ed.legend.dx = +(drag.start.dx + dx).toFixed(1); ed.legend.dy = +(drag.start.dy + dy).toFixed(1); }
    else {
      const nt = drag.nt;
      nt.x = +(drag.start.x + dx / bw).toFixed(4); nt.y = +(drag.start.y + dy / bh).toFixed(4);
      if (nt.type === 'arrow') { nt.x2 = +(drag.start.x2 + dx / bw).toFixed(4); nt.y2 = +(drag.start.y2 + dy / bh).toFixed(4); }
    }
    apply(drag.svg, cur);
  }
  function onUp() { if (!drag) return; const moved = drag.moved; drag = null; if (moved) { save(); if (tab === 'legend') render(); } }
  const armed = new WeakSet();
  function arm(svg) {
    if (armed.has(svg)) return;
    armed.add(svg);
    svg.addEventListener('pointerdown', onDown);
    svg.addEventListener('pointermove', onMove);
    svg.addEventListener('pointerup', onUp);
    svg.addEventListener('pointercancel', onUp);
  }

  function show(btn, svg) {
    ensure();
    if (cur) { const prev = findSvg(cur); if (prev) prev.classList.remove('fe-editing'); }
    cur = keyOf(svg);
    edits(cur);
    arm(svg);
    apply(svg, cur);
    svg.classList.add('fe-editing');
    panel.style.display = 'block';
    /* beside the figure when there is room, below it otherwise: the figure stays in sight */
    const r = (paneOf(svg) || svg).getBoundingClientRect();
    const w = Math.min(460, window.innerWidth - 16);
    let left, top = Math.max(8, r.top) + window.scrollY;
    if (window.innerWidth - r.right >= w + 16) left = r.right + 8;
    else if (r.left >= w + 16) left = r.left - w - 8;
    else {
      /* a figure as wide as the page: below it if that is in sight, otherwise over its right side (the panel is dragged by its header) */
      left = Math.max(8, Math.min(r.right - w - 8, window.innerWidth - w - 8));
      top = (window.innerHeight - r.bottom >= 280 ? r.bottom + 6 : Math.max(8, r.top) + 44) + window.scrollY;
    }
    panel.style.top = top + 'px';
    panel.style.left = (left + window.scrollX) + 'px';
    render();
  }
  function hide() {
    if (panel) panel.style.display = 'none';
    if (cur) { const svg = findSvg(cur); if (svg) svg.classList.remove('fe-editing'); if (E[cur] && isEmpty(E[cur])) { delete E[cur]; save(); } }
    cur = null;
  }

  /* every figure gets its ✎ button, and every edited figure gets its edits */
  const btnTitle = () => T('Editar esta figura: títulos, ejes, series, leyenda, textos y anotaciones', 'Edit this figure: titles, axes, series, legend, texts and annotations');
  function decorate(root) {
    css();
    const was = busy; busy = true;
    figures(root).forEach(f => {
      const pane = f.pane;
      if (has(f.key) && !f.svg.hasAttribute('data-fe-ok')) apply(f.svg, f.key);
      if (pane.querySelector('.fig-ed')) return;
      const host = (CFG.btnHost && pane.querySelector(CFG.btnHost)) || null;
      const dl = !host && CFG.exportBtn ? pane.querySelector(':scope > ' + CFG.exportBtn.split(',')[0]) : null;
      const b = mk('button', { class: 'fig-ed' + (host ? ' fig-ed-inline' : dl ? '' : ' fig-ed-solo'), type: 'button', title: btnTitle(), 'aria-label': btnTitle() }, '✎');
      b.addEventListener('click', e => {
        e.stopPropagation(); e.preventDefault();
        const svg = svgOf(pane);
        if (!svg || !svg.childElementCount) return;
        if (cur === keyOf(svg, pane) && panel && panel.style.display !== 'none') hide(); else show(b, svg);
      });
      if (!host && getComputedStyle(pane).position === 'static') pane.style.position = 'relative';
      (host || pane).appendChild(b);
    });
    if (mo && !was) mo.takeRecords();
    busy = was;
  }

  /* figures are redrawn, or replaced by a new SVG, at any time: the edits go back on */
  const queue = new Set();
  let scan = false, timer = null;
  function flush() {
    timer = null;
    const list = [...queue]; queue.clear();
    const doScan = scan; scan = false;
    let redrawCur = false;
    list.forEach(svg => {
      if (!svg.isConnected || svg.closest(CFG.skip)) return;
      const pane = paneOf(svg);
      if (!pane || svgOf(pane) !== svg) return;
      const key = keyOf(svg, pane);
      if (has(key)) { apply(svg, key); if (key === cur) redrawCur = true; }
    });
    if (doScan) { decorate(); if (cur) { const s = findSvg(cur); if (s && !s.classList.contains('fe-editing')) { s.classList.add('fe-editing'); arm(s); redrawCur = true; } } }
    if (redrawCur && panel && panel.style.display !== 'none' && !panel.contains(document.activeElement) && !drag) render();
  }
  function observe() {
    if (mo || !window.MutationObserver || !document.body) return;
    mo = new MutationObserver(recs => {
      if (busy) return;
      for (let i = 0; i < recs.length; i++) {
        const t = recs[i].target;
        if (t.nodeType !== 1 || (panel && panel.contains(t))) continue;
        const s = t.closest('svg');
        if (s) { queue.add(s); continue; }
        const add = recs[i].addedNodes;
        for (let j = 0; j < add.length && !scan; j++) {
          const n = add[j];
          if (n.nodeType === 1 && !n.classList.contains('fig-ed') && (n.tagName.toLowerCase() === 'svg' || (n.querySelector && (n.querySelector('svg') || n.matches(CFG.panes))))) scan = true;
        }
      }
      if ((queue.size || scan) && !timer) timer = setTimeout(flush, 0);
    });
    mo.observe(document.body, { childList: true, subtree: true });
    new MutationObserver(() => {
      document.querySelectorAll('.fig-ed').forEach(b => { b.title = btnTitle(); b.setAttribute('aria-label', btnTitle()); });
      if (panel && cur && panel.style.display !== 'none') setTimeout(render, 40);
    }).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
  }

  /* ---------------- for exports that draw the figure again ---------------- */
  /* the edits of figure `key`, put on an SVG node the app drew off screen */
  function applyTo(svg, key) {
    if (!svg || !has(key) || isEmpty(E[key])) return svg;
    const was = busy; busy = true;
    let host = null;
    try {
      if (!svg.isConnected) { host = mk('div', { style: 'position:fixed;left:-100000px;top:0;width:4000px;visibility:hidden;pointer-events:none', 'data-fe-skip': '1' }); document.body.appendChild(host); host.appendChild(svg); }
      applyNow(svg, edits(key));
    } catch (e) { console.error('FigEdit', e); }
    if (host) { host.removeChild(svg); host.remove(); }
    if (mo && !was) mo.takeRecords();
    busy = was;
    return svg;
  }
  const strip = svg => { [svg, ...svg.querySelectorAll('*')].forEach(n => { [...n.attributes].forEach(a => { if (/^data-fe-/.test(a.name) || a.name === 'data-li') n.removeAttribute(a.name); }); }); svg.classList.remove('fe-editing'); if (!svg.getAttribute('class')) svg.removeAttribute('class'); return svg; };
  /* the same for an SVG kept as text: returns the edited text */
  function bakeString(text, key) {
    if (!text || !has(key) || isEmpty(E[key])) return text;
    const was = busy; busy = true;
    let out = text;
    const host = mk('div', { style: 'position:fixed;left:-100000px;top:0;width:4000px;visibility:hidden;pointer-events:none', 'data-fe-skip': '1' });
    try {
      document.body.appendChild(host);
      host.innerHTML = String(text).replace(/^\s*<\?xml[^>]*\?>\s*/, '');
      const svg = host.querySelector('svg');
      if (svg) { applyNow(svg, edits(key)); strip(svg); out = (/^\s*<\?xml/.test(text) ? text.match(/^\s*<\?xml[^>]*\?>\s*/)[0] : '') + svg.outerHTML; }
    } catch (e) { console.error('FigEdit', e); }
    host.remove();
    if (mo && !was) mo.takeRecords();
    busy = was;
    return out;
  }

  /* how many figures carry edits, and what kind: for a report's calculation record */
  function summary() {
    const out = {};
    Object.keys(E).forEach(id => { const d = E[id]; if (isEmpty(d)) return; out[id] = { title: d.title || null, texts: Object.keys(d.texts || {}).length, colours: Object.keys(d.colors || {}).length, series: Object.keys(d.series || {}).length, legend: Object.keys(d.legend || {}).length > 0, annotations: (d.notes || []).length, font: d.font || null }; });
    return out;
  }
  function load(obj) {
    if (!obj || typeof obj !== 'object') return;
    const before = Object.keys(E);
    E = JSON.parse(JSON.stringify(obj)); save();
    figures().forEach(f => { if (has(f.key)) apply(f.svg, f.key); else if (before.includes(f.key)) { E[f.key] = blank(); apply(f.svg, f.key); delete E[f.key]; } });
  }

  /* ---------------- the look of the button and the panel ---------------- */
  let cssDone = false;
  function css() {
    if (cssDone) return;
    cssDone = true;
    const s = document.createElement('style');
    s.id = 'figEditCss';
    s.textContent = `
.fig-ed{position:absolute;top:5px;right:34px;width:24px;height:24px;border-radius:7px;border:1px solid var(--border,#d5dde5);background:var(--card-bg,#fff);color:var(--text-muted,#5a6b7a);font:inherit;font-size:.82rem;line-height:1;cursor:pointer;opacity:0;transition:opacity .15s,color .15s,border-color .15s;z-index:2;padding:0}
.fig-ed.fig-ed-solo{right:5px}
.fig-ed.fig-ed-inline{position:static;opacity:1;margin-left:auto;flex:none}
*:hover>.fig-ed,.fig-ed:focus-visible{opacity:1}
.fig-ed:hover{color:var(--primary-text,var(--primary,#1f6f9f));border-color:var(--primary,#1f6f9f)}
@media (hover:none){.fig-ed{opacity:.85}}
@media print{.fig-ed,.fe-panel{display:none!important}}
svg.fe-editing{outline:2px dashed var(--primary,#1f6f9f);outline-offset:-2px;border-radius:4px}
svg.fe-editing [data-fe-drag]{cursor:move}
svg.fe-editing text{cursor:pointer}
svg.fe-editing [data-fe-drag] text{cursor:move}
.fe-panel{position:absolute;z-index:1250;width:460px;max-width:calc(100vw - 16px);max-height:min(82vh,720px);overflow-y:auto;background:var(--card-bg,#fff);color:var(--text,#152230);border:1px solid var(--border-strong,#b9c4cf);border-radius:12px;box-shadow:0 14px 40px rgba(0,0,0,.22);padding:10px 12px 12px;font-size:.84rem;line-height:1.35;text-align:left}
.fe-panel *{box-sizing:border-box}
.fe-head{display:flex;align-items:center;gap:8px}
.fe-handle{cursor:move;user-select:none}
.fe-title{font-size:.86rem;white-space:nowrap}
.fe-which{flex:1;font-size:.72rem;color:var(--text-muted,#5a6b7a);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.fe-x{border:0;background:none;color:var(--text-muted,#5a6b7a);font-size:.95rem;cursor:pointer;padding:2px 6px;border-radius:6px}
.fe-x:hover{background:var(--bg-soft,#f1f4f7);color:var(--text,#152230)}
.fe-tabs{display:flex;flex-wrap:wrap;gap:4px;margin:6px 0 10px}
.fe-tab{font:inherit;font-size:.76rem;border:1px solid var(--border,#d5dde5);background:var(--bg-soft,#f1f4f7);color:var(--text-muted,#5a6b7a);padding:4px 9px;border-radius:8px;cursor:pointer}
.fe-tab.on{background:var(--primary-soft,#e3eef6);color:var(--primary-text,var(--primary,#1f6f9f));border-color:var(--primary,#1f6f9f);font-weight:700}
.fe-body h4{font-size:.68rem;text-transform:uppercase;letter-spacing:.06em;color:var(--text-muted,#5a6b7a);margin:8px 0 2px;font-weight:700}
.fe-body h4:first-child{margin-top:0}
.fe-hint{font-size:.76rem;margin:0 0 6px;color:var(--text-muted,#5a6b7a)}
.fe-grid{display:flex;flex-direction:column;gap:7px}
.fe-check{display:flex;align-items:center;gap:6px;font-size:.78rem;cursor:pointer;margin:0}
.fe-check input{width:auto;margin:0}
.fe-panel input[type=text],.fe-panel input[type=number],.fe-panel select{font:inherit;color:var(--text,#152230);background:var(--card-bg,#fff);border:1px solid var(--border,#d5dde5);border-radius:6px;height:auto;margin:0;width:auto}
.fe-panel input[type=range]{margin:0;padding:0;height:auto}
.fe-panel input[type=color]{border:1px solid var(--border,#d5dde5);border-radius:5px;background:none;cursor:pointer;margin:0}
.fe-panel input.fe-wide{width:100%;font-size:.8rem;padding:5px 8px}
.fe-row{display:grid;grid-template-columns:170px 1fr 44px;align-items:center;gap:6px;font-size:.76rem;margin:0}
.fe-row.fe-row3{grid-template-columns:170px 1fr auto auto}
.fe-row select{font-size:.76rem;min-width:0;padding:4px 6px}
.fe-row b{font-size:.72rem;color:var(--text-muted,#5a6b7a);text-align:right;font-weight:600}
.fe-row input[type=range]{min-width:0;width:100%}
.fe-col{display:inline-flex;align-items:center;gap:4px;grid-column:2 / -1}
.fe-col input[type=color],.fe-row input[type=color]{width:40px;height:24px;padding:0}
.fe-texts,.fe-series,.fe-notes{display:flex;flex-direction:column;gap:5px}
.fe-t{display:grid;grid-template-columns:1fr 70px 24px 24px 30px 24px;gap:4px;align-items:center}
.fe-t.fe-ax{grid-template-columns:120px 1fr 70px 24px}
.fe-t.fe-leg{grid-template-columns:14px 1fr 24px}
.fe-lab{font-size:.74rem;color:var(--text-muted,#5a6b7a)}
.fe-sw{width:12px;height:12px;border-radius:3px;border:1px solid var(--border,#d5dde5)}
.fe-t input[type=text],.fe-n input[type=text],.fe-n input[type=number]{font-size:.76rem;padding:3px 6px;min-width:0;width:100%}
.fe-t input[type=color],.fe-s input[type=color],.fe-n input[type=color]{width:30px;height:22px;padding:0}
.fe-t input[type=range],.fe-s input[type=range],.fe-n input[type=range]{min-width:0;width:100%}
.fe-b{font:inherit;font-size:.74rem;border:1px solid var(--border,#d5dde5);background:var(--card-bg,#fff);border-radius:6px;height:22px;min-width:24px;cursor:pointer;color:var(--text,#152230);padding:0 4px}
.fe-b.on{background:var(--primary,#1f6f9f);color:var(--on-primary,#fff);border-color:var(--primary,#1f6f9f)}
.fe-s{display:grid;grid-template-columns:30px minmax(0,1fr) 62px 92px 56px 24px;gap:4px;align-items:center;font-size:.76rem}
.fe-s select{font-size:.72rem;padding:2px 4px;min-width:0;width:100%}
.fe-sname{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.fe-sname i{color:var(--text-muted,#5a6b7a)}
.fe-legend-key{font-size:.68rem;color:var(--text-muted,#5a6b7a);margin-top:6px}
.fe-link{border:0;background:none;padding:0;font:inherit;color:var(--primary-text,var(--primary,#1f6f9f));text-decoration:underline;cursor:pointer}
.fe-add{display:flex;flex-wrap:wrap;gap:5px;margin:0 0 6px}
.fe-btn{font:inherit;font-size:.76rem;border:1px solid var(--border-strong,#b9c4cf);background:var(--card-bg,#fff);color:var(--text,#152230);border-radius:8px;padding:4px 9px;cursor:pointer}
.fe-btn:hover{border-color:var(--primary,#1f6f9f)}
.fe-btn.pri{background:var(--primary,#1f6f9f);color:var(--on-primary,#fff);border-color:var(--primary,#1f6f9f);font-weight:600}
.fe-range{font-family:var(--mono,ui-monospace,Consolas,monospace);font-size:.7rem!important}
.fe-n{border:1px solid var(--border,#d5dde5);border-radius:8px;padding:5px 7px;background:var(--bg-soft,#f1f4f7)}
.fe-n-head{display:flex;justify-content:space-between;align-items:center;font-size:.74rem;margin-bottom:4px}
.fe-n-body{display:flex;flex-wrap:wrap;gap:4px;align-items:center}
.fe-n-body input[type=text]{flex:1 1 140px;width:auto}
.fe-n-body input[type=number]{width:78px}
.fe-n-body input[type=range]{width:70px}
.fe-n-body select{font-size:.72rem;padding:2px 4px}
.fe-foot{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px;border-top:1px solid var(--border,#d5dde5);padding-top:8px}`;
    (document.head || document.documentElement).appendChild(s);
  }

  const FigEdit = { __labg: true, config: CFG, apply, applyTo, bakeString, strip, decorate, show, hide, reset, addNote, summary, load, FONTS, POS, DASH,
    get: id => edits(id), has, all: () => JSON.parse(JSON.stringify(E)), save, keyOf, findSvg, figures,
    textsOf, seriesOf, legendOf, axisTitles, toHex, _isEmpty: isEmpty, _render: () => { if (panel && cur) render(); }, _cur: () => cur };
  window.FigEdit = FigEdit;

  function start() { observe(); decorate(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
