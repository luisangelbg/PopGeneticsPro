/* LABG Suite — Copyright (C) 2026 Luis Ángel Barrera-Guzmán.
   Free software under the GNU General Public License, version 3; see LICENSE. */
/* Self-test of the figure editor (js/labg-figedit.js) on a figure of the app
   that is on screen. It is the same in every app of the suite.

     await FigEditSelfTest(key, redraw)

   key     the key of a figure that is drawn and visible (FigEdit.figures())
   redraw  optional async function that makes the app draw the figure again
           (a new language, a new parameter): the edits must survive it

   Returns { pass, fail, lines }. It leaves the figure as it found it. */
window.FigEditSelfTest = async function (key, redraw) {
  const lines = []; let pass = 0, fail = 0;
  const ok = (name, c, info) => { if (c) pass++; else fail++; lines.push((c ? 'ok   ' : 'FAIL ') + name + (c || info == null ? '' : ' → ' + info)); };
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const nums = s => String(s || '').trim().split(/[\s,]+/).map(Number);
  const live = () => FigEdit.findSvg(key);
  let svg = live();
  ok('the figure exists and is drawn', !!svg && svg.childElementCount > 0 && svg.getClientRects().length > 0, key);
  if (!svg) return { pass, fail, lines };
  const saved = FigEdit.has(key) ? JSON.parse(JSON.stringify(FigEdit.get(key))) : null;
  FigEdit.reset(key);
  svg = live();
  const texts = FigEdit.textsOf(svg, false), series = FigEdit.seriesOf(svg);
  const vb0 = svg.getAttribute('viewBox'), markup0 = svg.querySelectorAll('*').length;
  ok('it has texts or colours to edit', texts.length + series.length > 0, texts.length + ' texts, ' + series.length + ' colours');
  const pane = svg.closest(FigEdit.config.panes);
  ok('its pane carries the ✎ button', !!pane && !!pane.querySelector('.fig-ed'));

  const ed = FigEdit.get(key);
  const t0 = texts[0], s0 = series[0];
  if (t0) ed.texts[t0] = { t: 'ZZ editado', bold: true, color: '#ff0000', scale: 1.5 };
  ed.title = 'Título de prueba'; ed.subtitle = 'Subtítulo'; ed.note = 'Nota al pie de prueba'; ed.font = 'times'; ed.fontScale = 1.2; ed.border = true; ed.bg = 'white';
  if (s0) { ed.colors[s0.key] = '#123456'; ed.series[s0.key] = { width: 2, dash: 'dash', opacity: 0.5 }; }
  FigEdit.addNote(key, 'text', { t: 'nota', box: true }); FigEdit.addNote(key, 'arrow'); FigEdit.addNote(key, 'letter');
  const withAxis = !!(svg.dataset.plot && svg.dataset.yr);
  if (withAxis) { FigEdit.addNote(key, 'hline', { t: 'umbral' }); FigEdit.addNote(key, 'band'); }
  const nNotes = ed.notes.length;
  FigEdit.save(); FigEdit.apply(svg, key);

  const check = label => {
    const s = live();
    if (!s) { ok(label + ': the figure is still there', false); return; }
    if (t0) ok(label + ': a text is rewritten, red and bold', [...s.querySelectorAll('text')].some(t => t.textContent === 'ZZ editado' && t.getAttribute('fill') === '#ff0000' && String(t.getAttribute('font-weight')) === '700'));
    ok(label + ': title, subtitle and footnote are inside the figure', !!s.querySelector('[data-fe-part="title"]') && !!s.querySelector('[data-fe-part="subtitle"]') && !!s.querySelector('[data-fe-part="note"]'));
    ok(label + ': the box of the figure grew for them', nums(s.getAttribute('viewBox'))[3] > nums(vb0)[3] && nums(s.getAttribute('viewBox'))[1] < nums(vb0)[1], s.getAttribute('viewBox'));
    if (s0) ok(label + ': a colour is replaced', [...s.querySelectorAll('[data-fe-fill], [data-fe-stroke]')].some(n => (n.getAttribute('data-fe-fill') === s0.key && n.getAttribute('fill') !== s0.key) || (n.getAttribute('data-fe-stroke') === s0.key && n.getAttribute('stroke') !== s0.key)));
    if (s0) ok(label + ': its series is dashed and translucent', [...s.querySelectorAll('[data-fe-fill], [data-fe-stroke]')].some(n => n.style.strokeDasharray && n.style.opacity));
    ok(label + ': the annotations are drawn', s.querySelectorAll('[data-fe-drag^="note:"]').length >= 3 && (!withAxis || s.querySelector('[data-fe-part="notes"]').children.length >= nNotes), s.querySelectorAll('[data-fe-drag^="note:"]').length);
    ok(label + ': every text takes the font', [...s.querySelectorAll('text')].every(t => /Times/.test(t.style.fontFamily)));
    ok(label + ': background and border', (!!s.querySelector('[data-fe-part="bg"]') || !!s.querySelector(':scope > rect[data-bg]')) && !!s.querySelector('[data-fe-part="border"]'));
  };
  check('applied');

  const lg = FigEdit.legendOf(svg);
  if (lg && lg.items.length) {
    ed.legend = { pos: 'br', layout: 'col', box: true, scale: 1.2 };
    FigEdit.apply(live(), key);
    const g = FigEdit.legendOf(live()).g;
    ok('the legend moves, stacks and takes a box', /translate/.test(g.getAttribute('transform') || '') && !!g.querySelector('rect[data-fe-own]'), g.getAttribute('transform'));
    ok('the series is named after its legend entry', series.some(x => x.name));
  }

  /* what the app exports is the edited figure */
  if (window.Fig && Fig.serialize) {
    let out = '';
    try { out = Fig.serialize(Fig.compose && Fig.compose.length <= 2 && !Fig.mount ? Fig.compose(live(), {}) : live()); } catch (e) { out = 'ERROR ' + e.message; }
    ok('the exported SVG carries the edits', /Título de prueba/.test(out) && (!t0 || /ZZ editado/.test(out)), out.slice(0, 120));
    ok('the exported SVG is well formed', !new DOMParser().parseFromString(out, 'image/svg+xml').querySelector('parsererror'));
  }

  if (redraw) {
    await redraw(); await wait(250);
    check('after a redraw');
  }

  FigEdit.reset(key);
  await wait(30);
  const s = live();
  ok('undo: nothing of the editor is left', !s.querySelector('[data-fe-own]'));
  ok('undo: the box is the original', s.getAttribute('viewBox') === vb0, s.getAttribute('viewBox') + ' / ' + vb0);
  ok('undo: the texts are the original', FigEdit.textsOf(s, false).join('|') === texts.join('|') && [...s.querySelectorAll('text')].every(t => t.textContent !== 'ZZ editado'));
  ok('undo: the colours are the original', FigEdit.seriesOf(s).map(x => x.key).sort().join() === series.map(x => x.key).sort().join());
  ok('undo: no inline style is left', [...s.querySelectorAll('*')].every(n => !n.style || (!n.style.fontFamily && !n.style.fontSize && !n.style.strokeDasharray && !n.style.opacity && !n.style.display)));
  ok('undo: same number of elements', s.querySelectorAll('*').length === markup0, s.querySelectorAll('*').length + ' / ' + markup0);
  if (saved) { FigEdit.load(Object.assign(FigEdit.all(), { [key]: saved })); }
  return { pass, fail, lines };
};
