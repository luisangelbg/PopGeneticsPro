/* PopGeneticsPro — Block 10 UI: report options, preview, HTML / PDF / ZIP export,
   methods paragraph. */

(function () {
let lastHtml = null;

function opts() {
  const sections = {};
  Report.SECTIONS.forEach(s => { const cb = el('rp_' + s.key); sections[s.key] = cb ? cb.checked : true; });
  return {
    title: el('rpTitle').value.trim() || 'Population genetic analysis', author: el('rpAuthor').value.trim(), notes: el('rpNotes').value.trim(),
    sections, methods: el('rpMethods').checked, summary: el('rpExec').checked, draft: el('rpDraft').checked, cite: el('rpCite').checked, rawdata: el('rpRaw').checked,
    zipFmt: el('rpZipFmt').value, zipRes: +el('rpZipRes').value,
  };
}
function availability() {
  const list = el('rpSections'); list.innerHTML = '';
  let ready = 0;
  Report.SECTIONS.forEach(s => {
    const ok = s.ready(); if (ok) ready++;
    const lab = mk('label', { class: 'checkbox-label', style: ok ? '' : 'opacity:.5' });
    lab.innerHTML = `<input type="checkbox" id="rp_${s.key}" ${ok ? 'checked' : 'disabled'}> ${esc(s.title)} <span class="rp-state">${ok ? 'ready' : 'not run yet'}</span>`;
    list.appendChild(lab);
  });
  const figs = Fig.mounted().length;
  const d = state.data;
  statTiles('rpSummary', [
    ['Blocks with results', `${ready} of ${Report.SECTIONS.length}`, 'tick the ones to include'],
    ['Figures as edited', figs, 'embedded as vector graphics'],
    ['Data set', esc(state.fileName || '—'), d ? `${d.nInd} ${UNIT()} · ${d.nLoci} ${d.kind === 'dominant' ? 'bands' : d.kind === 'morph' ? 'traits' : 'loci'}` : ''],
  ]);
  if (!el('rpTitle').value && state.fileName) el('rpTitle').value = `Population genetic analysis of ${state.fileName.replace(/\.[^.]+$/, '').replace(/_/g, ' ')}`;
  ['rpPreview', 'rpHtml', 'rpPrint', 'rpZip', 'rpMethodsBtn'].forEach(id => { el(id).disabled = !ready; });
  el('rpEmpty').style.display = ready ? 'none' : '';
}
function preview() {
  const o = opts();
  lastHtml = Report.build(o);
  const fr = el('rpFrame'); fr.srcdoc = lastHtml; el('rpPreviewWrap').style.display = '';
  el('rpInfo').textContent = `${Math.round(lastHtml.length / 1024)} KB · ${(lastHtml.match(/<figure/g) || []).length} figures · ${(lastHtml.match(/<table/g) || []).length} tables`;
}
async function copyMethods() {
  const txt = Report.methodsText().replace(/<[^>]+>/g, '').replace(/&amp;/g, '&');
  try { await navigator.clipboard.writeText(txt); showMessage('rpMessages', 'success', 'Methods paragraph copied to the clipboard.'); }
  catch (e) { showMessage('rpMessages', 'info', 'Select and copy the text below.'); }
  el('rpMethodsText').value = txt; el('rpMethodsText').style.display = '';
}
function init() {
  if (!el('rpPreview')) return;
  el('rpPreview').addEventListener('click', preview);
  /* every export builds the report again, so a title, a section or a figure changed after
     the preview is never left out */
  el('rpHtml').addEventListener('click', () => { preview(); download(lastHtml, slug(opts().title) + '.html', 'text/html;charset=utf-8'); });
  el('rpPrint').addEventListener('click', () => { preview(); const w = window.open('', '_blank'); if (!w) { showMessage('rpMessages', 'warning', 'Allow pop-ups to print.'); return; } w.document.write(lastHtml); w.document.close(); setTimeout(() => { w.focus(); w.print(); }, 700); });
  el('rpZip').addEventListener('click', async () => { preview(); const b = el('rpZip'); b.disabled = true; b.textContent = 'Packing…'; try { download(await Report.zip(opts(), lastHtml), slug(opts().title) + '_package.zip'); } catch (e) { console.error(e); showMessage('rpMessages', 'error', 'Could not build the package: ' + esc(e.message)); } b.disabled = false; b.textContent = '⬇ Full package (ZIP)'; });
  el('rpMethodsBtn').addEventListener('click', copyMethods);
  document.addEventListener('stepchange', e => { if (String(e.detail.step) === '10') { lastHtml = null; availability(); } });
  availability();
}
document.addEventListener('DOMContentLoaded', init);
window.B10 = { preview, opts, get html() { return lastHtml; } };
})();
