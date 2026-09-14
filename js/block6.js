/* PopGeneticsPro — Block 6: genetic distances, ordination, trees and
   isolation by distance. */

(function () {

  let R = null, lastData = null, treeData = null;

  function init() {
    if (!el('btnRunDist')) return;
    el('btnRunDist').addEventListener('click', run);
    el('popDistShown').addEventListener('change', renderPopMatrix);
    el('btnPopDistCSV').addEventListener('click', () => downloadMatrix('pop'));
    el('btnIndDistCSV').addEventListener('click', () => downloadMatrix('ind'));
    el('btnPcoaCSV').addEventListener('click', downloadScores);
    el('btnNewick').addEventListener('click', downloadNewick);
    el('treeShown').addEventListener('change', drawTree);
    if (el('btnTreeImages')) el('btnTreeImages').addEventListener('click', openImages);
    /* a new or edited image redraws the tree at once */
    if (window.OTUImg) OTUImg.onChange(() => { const api = Fig.registry.fig6Tree; if (api && el('fig6Tree') && el('fig6Tree').firstChild) api.redraw(); });
    el('btnContinue6').addEventListener('click', () => continueAfter(6, 'distMessages'));
    document.addEventListener('stepchange', e => { if (String(e.detail.step) === '6') onEnter(); });
  }

  function onEnter() {
    const d = state.data;
    if (!d) { showMessage('distMessages', 'error', 'Load your data in Block 2 first.'); return; }
    /* individual-distance choices depend on the marker */
    const sel = el('indMethod'); sel.innerHTML = '';
    const opts = GD.IND_METHODS[d.kind] || GD.IND_METHODS.haploid;
    Object.entries(opts).forEach(([k, v]) => sel.appendChild(mk('option', { value: k }, v)));
    const hasMarkers = d.kind !== 'morph' && d.nLoci > 0;
    const popLevel = hasMarkers && d.pops.filter(p => p.idx.length >= 2).length >= 3 && !d.singletons;
    /* population coefficients: sequence divergence first for alignments */
    const PM = GD.popMethodsFor(d);
    /* a new dataset starts from the coefficient suited to its marker; the same dataset keeps the user's choice */
    const keep = lastData === d ? el('popMethod').value : null;
    lastData = d;
    el('popMethod').innerHTML = '';
    Object.entries(PM.list).forEach(([k, v]) => el('popMethod').appendChild(mk('option', { value: k }, esc(nameMenu(v)))));
    el('popMethod').value = keep && PM.list[keep] ? keep : PM.def;
    const shown = el('popDistShown');
    shown.innerHTML = '';
    shown.appendChild(mk('option', { value: 'current' }, 'the coefficient chosen above'));
    Object.entries(PM.list).forEach(([k, v]) => shown.appendChild(mk('option', { value: k }, esc(nameMenu(v)))));
    const isSeq = d.kind === 'sequence' && !!d.seqs;
    const nUnits = d.nInd;
    const indBoot = hasMarkers && nUnits >= 4 && nUnits <= 60 && (isSeq || d.nLoci >= 2);
    el('popMethodRow').style.display = popLevel ? '' : 'none';
    el('bootRow').style.display = popLevel || indBoot ? '' : 'none';
    el('bootRow').querySelector('label').textContent = `Bootstrap replicates over ${isSeq ? 'alignment sites' : d.kind === 'dominant' ? 'bands' : 'loci'} (tree support)`;
    el('distPopNote').style.display = popLevel ? 'none' : '';
    /* wrapped in a span: a bold word must not become the callout's heading line */
    el('distPopNote').innerHTML = '<span>' + (d.singletons
      ? `Each ${UNIT(false)} is a single sample, so the analyses run <b>between ${UNIT()}</b>: distance matrix, PCoA and trees on the ${UNIT()} themselves. Population-level distances need replicate individuals within populations.`
      : (!hasMarkers ? 'Trait data: Gower distances between plants, PCoA and UPGMA/NJ trees on the plants; population-level allele-frequency distances do not apply.' : 'Population-level distances need at least three populations with replicate individuals.')) + '</span>';
    if (!state.gd) run();
  }

  function settings() {
    return {
      popMethod: el('popMethod').value,
      indMethod: el('indMethod').value,
      boot: Number(el('distBoot').value) || 0,
      lingoes: el('distLingoes').checked,
      mantelPerms: Number(el('mantelPerms').value) || 0,
      seed: Number(el('distSeed').value) || 1,
    };
  }

  function run() {
    const d = state.data; if (!d) return;
    clearMessages('distMessages');
    const btn = el('btnRunDist'); btn.disabled = true; btn.textContent = 'Computing…';
    const t0 = performance.now();
    setTimeout(() => {
      try {
        R = GD.compute(d, settings());
        state.gd = R;
        render(d);
        el('distResults').style.display = '';
        el('distTiming').textContent = `computed in ${((performance.now() - t0) / 1000).toFixed(1)} s · seed ${R.opts.seed}`;
      } catch (e) { console.error(e); showMessage('distMessages', 'error', 'The analysis failed: ' + esc(e.message)); }
      finally { btn.disabled = false; btn.textContent = 'Compute distances, ordination and trees'; }
    }, 30);
  }

  /* ================================================================ */
  function render(d) {
    renderTiles(d);
    renderInterpretation(d);
    renderPopMatrix();
    renderIndSummary(d);
    renderPcoa(d);
    fillTreeChoices(d);
    drawTree();
    renderIBD(d);
  }

  /* sequence divergences are small numbers: they keep four decimals */
  const f3 = v => (v == null || !isFinite(v)) ? '—' : (R && /^(da|dxy)$/.test(R.opts.popMethod) && Math.abs(v) < 0.1 && v !== 0 ? v.toFixed(4) : v.toFixed(3));

  /* bootstrap support of a tree, one value per split: the two branches at the
     root of a drawn unrooted tree are the same split and count once */
  function uniqueSupports(root) {
    const seen = new Map();
    const walk = node => node.children.forEach(c => {
      if (c.node.tip == null && c.node.support != null) {
        const k = c.node.splitKey || Math.random();
        if (!seen.has(k)) seen.set(k, { support: c.node.support, node: c.node });
      }
      walk(c.node);
    });
    if (root) walk(root);
    return [...seen.values()];
  }
  const unitWord = u => ({ sites: 'alignment sites', bands: 'bands', loci: 'loci' }[u] || 'loci');
  /* coefficient names carry D_A and d_XY: real subscripts in text, none in menus */
  const nameHTML = s => esc(String(s)).replace(/\b([Dd])_(A|XY)\b/g, '$1<sub>$2</sub>');
  const nameMenu = s => String(s).replace(/\b([Dd])_(A|XY)\b/g, '$1$2');

  function renderTiles(d) {
    const tiles = [];
    const pc = R.pcoaInd;
    const who = d.kind === 'morph' ? 'Plants' : UNIT(true, true);
    tiles.push([`${who} compared`, R.ind.labels.length, R.ind.methodName]);
    if (R.pop) {
      const vals = []; for (let i = 0; i < R.pop.D.length; i++) for (let j = i + 1; j < R.pop.D.length; j++) if (isFinite(R.pop.D[i][j])) vals.push(R.pop.D[i][j]);
      const nm = R.pop.method.startsWith('nei') ? "Nei's D (mean)" : R.pop.method === 'da' ? 'D_A (mean)' : R.pop.method === 'dxy' ? 'd_XY (mean)' : 'Population distance (mean)';
      if (R.pop.nonFinite) tiles.push([nm, '∞', `${R.pop.nonFinite} pair${R.pop.nonFinite > 1 ? 's share' : ' shares'} no allele`, 'warn']);
      else tiles.push([nm, f3(vals.reduce((s, v) => s + v, 0) / vals.length), `range ${f3(Math.min(...vals))}–${f3(Math.max(...vals))}`]);
    }
    tiles.push(['PCoA axes 1 + 2', fmtPct((pc.pctPos[0] || 0) + (pc.pctPos[1] || 0), 1), pc.negative ? `${pc.negative} negative eigenvalue${pc.negative > 1 ? 's' : ''}` : 'no negative eigenvalues', pc.negative && !pc.lingoes ? 'warn' : 'ok']);
    if (R.trees && R.pop.names.length >= 4) tiles.push(['UPGMA cophenetic r', f3(R.trees.coph), R.trees.coph > 0.85 ? 'the tree fits the distances well' : 'the tree distorts the distances', R.trees.coph > 0.85 ? 'ok' : 'warn']);
    else if (!R.pop && R.indTrees && R.indTrees.boot) {
      const s = uniqueSupports(R.indTrees.nj || R.indTrees.upgma);
      tiles.push(['Groupings with ≥ 70% support', `${s.filter(x => x.support >= 0.7).length} of ${s.length}`, `${R.indTrees.nj ? 'NJ' : 'UPGMA'} tree, ${R.indTrees.boot} bootstraps`]);
    }
    if (R.ibd) tiles.push(['Isolation by distance', f3(R.ibd.mantelLin.r), `Mantel P = ${R.ibd.mantelLin.p == null ? '—' : R.ibd.mantelLin.p.toFixed(3)}`, R.ibd.mantelLin.p != null && R.ibd.mantelLin.p < 0.05 ? 'warn' : 'ok']);
    else if (R.mantelInd) tiles.push(['Mantel (individuals)', f3(R.mantelInd.r), `P = ${R.mantelInd.p == null ? '—' : R.mantelInd.p.toFixed(3)}`, R.mantelInd.p != null && R.mantelInd.p < 0.05 ? 'warn' : 'ok']);
    statTiles('distTiles', tiles);
  }

  function supportParagraph(trees, what, unit) {
    const sNJ = uniqueSupports(trees.nj), sUP = uniqueSupports(trees.upgma);
    const strong = s => s.filter(x => x.support >= 0.7).length;
    const nTested = Math.max(sNJ.length, sUP.length);
    if (!nTested)
      return `<p>The trees were bootstrapped ${trees.boot} times over ${unitWord(unit)}, but with three ${what} an unrooted tree has no internal branch to test: any three ${what} can be joined in only one way, so the tree says nothing about groupings — only how long each branch is.</p>`;
    return `<p>The trees were bootstrapped ${trees.boot} times over ${unitWord(unit)}. ` +
      (trees.nj ? `${strong(sNJ)} of ${sNJ.length} grouping${sNJ.length === 1 ? '' : 's'} of the NJ tree` : '') + (trees.nj ? ' and ' : '') +
      `${strong(sUP)} of ${sUP.length} of the UPGMA tree reach 70% support — the usual threshold for calling a grouping robust. ` +
      (Math.max(strong(sNJ), strong(sUP)) === 0 ? `No grouping is robust: with these ${unitWord(unit)}, the branching order between ${what} is not resolved, which is itself a finding (recent divergence, or gene flow).`
        : (strong(sNJ) === sNJ.length && strong(sUP) === sUP.length) ? 'Every grouping is robust.'
          : `Groupings below that threshold should not be interpreted as history; with few ${unitWord(unit)}, low support is the rule rather than the exception.`) +
      ` UPGMA assumes a constant rate of divergence (an ultrametric tree); NJ does not, so when they disagree, NJ is the safer picture and the cophenetic correlation (${f3(trees.coph)}) says how much UPGMA had to distort.</p>`;
  }

  function renderInterpretation(d) {
    const parts = [];
    const pc = R.pcoaInd;
    const who = d.kind === 'morph' ? 'plants' : UNIT();
    if (R.pop && R.pop.nonFinite) {
      parts.push(`<p>With the <b>${nameHTML(R.pop.methodName)}</b>, ${R.pop.nonFinite} of ${R.pop.names.length * (R.pop.names.length - 1) / 2} population pairs share no allele${d.kind === 'sequence' ? ' (no haplotype)' : ''} at all, so their distance is infinite and no population tree or map can be drawn from it. ` +
        (d.kind === 'sequence' ? 'For sequences, choose the <b>net nucleotide divergence D<sub>A</sub></b>, which counts how many sites separate the sequences instead of whether they are identical.' : 'Choose a bounded coefficient such as the Cavalli-Sforza chord or Rogers distance.') +
        ` The ${who} themselves are compared below.</p>`);
    } else if (R.pop) {
      const P = R.pop.D.length;
      let hi = null, lo = null;
      for (let i = 0; i < P; i++) for (let j = i + 1; j < P; j++) {
        const v = R.pop.D[i][j]; if (!isFinite(v)) continue;
        if (!hi || v > hi.v) hi = { v, i, j }; if (!lo || v < lo.v) lo = { v, i, j };
      }
      const isNei = R.pop.method.startsWith('nei');
      parts.push(`<p>With the <b>${nameHTML(R.pop.methodName)}</b>, the most distant populations are <b>${esc(R.pop.names[hi.i])}</b> and <b>${esc(R.pop.names[hi.j])}</b> (D = ${f3(hi.v)}` +
        (isNei && R.pop.I ? `, identity I = ${f3(R.pop.I[hi.i][hi.j])}` : '') + `) and the closest are <b>${esc(R.pop.names[lo.i])}</b> and <b>${esc(R.pop.names[lo.j])}</b> (D = ${f3(lo.v)}). ` +
        (isNei && d.kind !== 'sequence' ? `As a yardstick from allozyme studies, Nei's D is roughly 0.01–0.05 between local populations of one species, 0.1–0.4 between subspecies or well-separated races, and above 1 between species — but it grows with the mutation rate of the marker (microsatellites, for instance, give larger values), so compare only within one marker type.` : '') +
        (R.pop.method === 'da' ? `D<sub>A</sub> is the proportion of sites by which two populations differ beyond the differences already found inside each of them; multiplied by the alignment length it is the net number of differences, and divided by twice the substitution rate per site it estimates the time since they split.` : '') +
        (isNei && d.kind === 'sequence' ? `Nei's D here only asks whether haplotypes are identical; the net nucleotide divergence D<sub>A</sub> also uses how different they are.` : '') + `</p>`);
      if (R.trees && R.trees.boot) parts.push(supportParagraph(R.trees, 'populations', R.trees.bootUnit));
      else if (R.trees && !R.trees.boot && d.nLoci < 2 && !/^(da|dxy)$/.test(R.pop.method)) parts.push(`<p>With a single locus there is nothing to resample, so the population trees carry no bootstrap support.</p>`);
    } else {
      parts.push(`<p>${R.ind.labels.length} ${who} were compared with the <b>${R.ind.methodName}</b>${d.singletons ? ` — each ${UNIT(false)} being a single sample, these are the distances between the ${UNIT()} themselves` : ''}. The PCoA and the trees below are built on that matrix.</p>`);
    }
    if (!R.pop && R.indTrees && R.indTrees.boot) parts.push(supportParagraph(R.indTrees, who, R.indTrees.bootUnit));
    const nonEuclid = d.kind === 'morph' ? 'which is normal for coefficients that mix quantitative and qualitative traits' : 'which is normal for most genetic coefficients';
    parts.push(`<p>The first two principal coordinates carry <b>${fmtPct((pc.pctPos[0] || 0) + (pc.pctPos[1] || 0), 1)}</b> of the variation among ${who}` +
      (pc.negative ? `. ${pc.negative} eigenvalue${pc.negative > 1 ? 's are' : ' is'} negative (smallest ${pc.minEig.toExponential(2)}): the distance is not perfectly Euclidean, ${nonEuclid}; ${pc.lingoes ? `the Lingoes constant ${pc.lingoes.toFixed(4)} was added to make it so` : 'the percentages are computed over the positive eigenvalues only — tick the Lingoes correction if you need them exact'}` : '') +
      (R.ind.squared ? `. The ${R.ind.methodName} is already a squared Euclidean distance, so it enters the PCoA as it is` : '') + '.' +
      (R.pop && d.kind !== 'morph' ? ` A PCoA that separates populations along axis 1 while the AMOVA gives a small Φ<sub>ST</sub> is not a contradiction: ordination shows the pattern of the between-group part, however small that part is.` : '') + `</p>`);
    if (R.ibd) {
      const m = R.ibd.mantelLin, reg = R.ibd.reg, nP = R.ibd.names.length;
      const fact = k => (k <= 1 ? 1 : k * fact(k - 1));
      parts.push(`<p><b>Isolation by distance</b> (Rousset 1997): F<sub>ST</sub>/(1 − F<sub>ST</sub>) against ln(geographic distance in ${R.ibd.unit}) gives ${m.p != null && m.p < 0.05 ? 'a <b>significant</b>' : 'no significant'} correlation (Mantel r = ${f3(m.r)}, P = ${m.p == null ? '—' : m.p.toFixed(3)}${reg ? `; slope ${reg.slope.toExponential(2)}, r² = ${reg.r2.toFixed(3)}` : ''}). ` +
        (m.p != null && m.p < 0.05 ? 'Populations further apart are more differentiated: gene flow is limited by distance, and the slope is inversely proportional to the product of density and squared dispersal distance (4Dπσ² in two dimensions).' : 'Distance does not predict differentiation at this scale: either gene flow is not limited by distance, or the structure follows something other than geography (habitat, altitude, history), or there are too few populations to see it.') +
        (nP <= 6 ? ` With ${nP} populations the Mantel test can only rearrange them in ${fact(nP)} ways, so its P cannot fall below about ${(1 / fact(nP)).toFixed(nP <= 4 ? 2 : 3)} and it has little power; read the slope and the plot rather than the P.` : '') + `</p>`);
      if (R.mantelInd) parts.push(`<p>Between individual plants the Mantel correlation is r = ${f3(R.mantelInd.r)} (P = ${R.mantelInd.p == null ? '—' : R.mantelInd.p.toFixed(3)}). Pairs from the same population are both close together and genetically alike, so at this level the correlation mostly reflects the differences between populations; the population-level test above is the one for isolation by distance, and fine-scale structure within populations is the subject of Block 9.</p>`);
    } else if (R.mantelInd) {
      parts.push(`<p>At the individual level, the Mantel correlation between genetic and geographic distance is r = ${f3(R.mantelInd.r)} (P = ${R.mantelInd.p == null ? '—' : R.mantelInd.p.toFixed(3)}; with ln distance r = ${f3(R.mantelInd.lnGeo.r)}, P = ${R.mantelInd.lnGeo.p == null ? '—' : R.mantelInd.lnGeo.p.toFixed(3)}). Fine-scale spatial structure — how far the correlation extends — is the subject of Block 9.</p>`);
    } else parts.push(`<p>No coordinates were declared in Block 2, so isolation by distance was not tested. Add latitude and longitude (or projected x/y) columns to unlock it.</p>`);
    el('distInterpret').innerHTML = parts.join('');
  }

  /* ---------- matrices ---------- */
  function renderPopMatrix() {
    if (!R) return;
    const wrap = el('popMatrixCard');
    if (!R.pop) { wrap.style.display = 'none'; el('fig6PopHeat').innerHTML = ''; el('popDistTable').innerHTML = ''; el('popCompareTable').innerHTML = ''; return; }
    wrap.style.display = '';
    const m = R.pop.all[el('popDistShown').value] ? el('popDistShown').value : 'current';
    const D = m === 'current' ? R.pop.D : R.pop.all[m];
    const upper = R.pop.method.startsWith('nei') && m === 'current' ? R.pop.I : null;
    const names = R.pop.names;
    const cols = [{ key: 'name', label: '' }];
    names.forEach((nm, j) => cols.push({
      key: 'c' + j, label: esc(nm), num: true, html: true,
      get: r => { const fv = v => (v === Infinity ? '∞' : f3(v)); return r.i === j ? '<span class="geno-miss">—</span>' : (r.i > j ? fv(D[r.i][j]) : (upper ? `<span class="geno-miss">${f3(upper[r.i][j])}</span>` : fv(D[r.i][j]))); },
    }));
    buildTable('popDistTable', cols, names.map((nm, i) => ({ name: nm, i })));
    const biallelic = state.data.loci.every(l => l.alleles.length <= 2);
    el('popDistNote').innerHTML = (m === 'current' ? `<b>${nameHTML(R.pop.methodName)}</b>` : `<b>${nameHTML(R.pop.methods[m])}</b>`) +
      (upper ? " below the diagonal; Nei's genetic identity I above it." : '.') +
      ' Choose another coefficient in the list to compare; the figure and the trees use the one selected in the settings.' +
      (biallelic ? ' Every locus has two alleles (or two band states), and for such loci the Rogers and Prevosti distances are mathematically identical.' : '') +
      (R.pop.nonFinite ? ' ∞ marks pairs that share no allele.' : '');
    /* comparison table of all methods on the same pairs */
    const rows = [];
    const keys = Object.keys(R.pop.methods);
    for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) {
      const row = { pair: names[i] + ' × ' + names[j] };
      keys.forEach(k => { row[k] = R.pop.all[k][i][j]; });
      rows.push(row);
    }
    const short = k => ({ nei72: 'Nei 1972', nei78: 'Nei 1978', cavalli: 'Cavalli-Sforza', reynolds: 'Reynolds', rogers: 'Rogers', prevosti: 'Prevosti', da: 'D<sub>A</sub>', dxy: 'd<sub>XY</sub>' }[k] || k);
    const f3i = v => (v === Infinity ? '∞' : f3(v));
    buildTable('popCompareTable', [{ key: 'pair', label: 'Pair' }].concat(keys.map(k => ({ key: k, label: short(k), num: true, fmt: f3i }))), rows, { limit: 120 });
    const mount = (id, spec) => { try { Fig.mount(id, spec); } catch (e) { console.error(e); } };
    mount('fig6PopHeat', {
      /* a few populations do not need a page-sized matrix */
      title: 'Population distance matrix', fileName: 'population_distances', width: 780, height: Math.max(360, Math.min(620, 190 + names.length * 80)),
      defaults: { cmap: 'viridis', values: true, orderByTree: true, title: R.pop.methodName },
      controls: [{ key: 'title', label: 'Title', type: 'text' }, { key: 'orderByTree', label: 'Order populations as in the UPGMA tree', type: 'checkbox' }, { key: 'values', label: 'Print values', type: 'checkbox' }, { key: 'cmap', label: 'Colour map', type: 'select', options: Object.entries(Fig.colormapNames) }],
      render: cfg => P6.distHeat(cfg, { D: R.pop.D, names, order: R.trees ? R.trees.hc.order : null }),
    });
  }

  function renderIndSummary(d) {
    const D = R.ind.D, n = D.length;
    /* by a loop: with hundreds of plants the pairs are too many to spread as arguments */
    let sum = 0, cnt = 0, lo = Infinity, hi = -Infinity;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) { const v = D[i][j]; if (!isFinite(v)) continue; sum += v; cnt++; if (v < lo) lo = v; if (v > hi) hi = v; }
    el('indDistNote').innerHTML = `<b>${n} × ${n}</b> matrix of the <b>${R.ind.methodName}</b> between ${d.kind === 'morph' ? 'plants' : UNIT()}: mean ${f3(sum / cnt)}, range ${f3(lo)}–${f3(hi)}. ` +
      (R.ind.sites ? `${R.ind.sites.length} aligned sites, ${R.ind.sites.informative} of them variable or with gaps; sites with a gap or an ambiguous base are left out pair by pair. ` : '') +
      (n > 30 ? 'Too large to print here — download it as CSV.' : '');
    if (n <= 30) {
      const cols = [{ key: 'name', label: '' }];
      R.ind.labels.forEach((nm, j) => cols.push({ key: 'c' + j, label: esc(nm), num: true, get: r => (r.i === j ? '—' : f3(D[r.i][j])) }));
      buildTable('indDistTable', cols, R.ind.labels.map((nm, i) => ({ name: nm, i })));
      el('indDistTable').style.display = '';
    } else el('indDistTable').style.display = 'none';
  }

  /* ---------- PCoA ---------- */
  function renderPcoa(d) {
    const pc = R.pcoaInd;
    const rows = pc.values.slice(0, 10).map((v, k) => ({ axis: 'PCo ' + (k + 1), eig: v, pct: k < pc.nAxes ? pc.pctPos[k] : null, cum: k < pc.nAxes ? pc.pctPos.slice(0, k + 1).reduce((s, x) => s + x, 0) : null }));
    buildTable('pcoaTable', [
      { key: 'axis', label: 'Axis' }, { key: 'eig', label: 'Eigenvalue', num: true, fmt: v => v.toFixed(4) },
      { key: 'pct', label: '% of variation', num: true, fmt: v => fmtPct(v, 2) }, { key: 'cum', label: 'Cumulative', num: true, fmt: v => fmtPct(v, 2) },
    ], rows);
    const mount = (id, spec) => { try { Fig.mount(id, spec); } catch (e) { console.error(id, e); el(id).innerHTML = `<div class="msg msg-error">${esc(e.message)}</div>`; } };
    const pal = { key: 'palette', label: 'Palette', type: 'select', options: Object.entries(Fig.paletteNames), shared: true };
    const groupNames = d.singletons ? null : d.pops.map(p => p.name);
    const S = { scores: pc.scores, pct: pc.pctPos, labels: R.ind.labels, groupOf: groupNames ? R.ind.popOf : null, groupNames };
    const axisOpts = Array.from({ length: pc.nAxes }, (_, i) => [String(i + 1), 'PCo ' + (i + 1)]);
    mount('fig6PcoaInd', {
      title: `Principal coordinates of the ${UNIT()}`, fileName: 'pcoa_individuals', width: 860, height: 600,
      defaults: { palette: 'cluster', ax1: 1, ax2: 2, envelope: groupNames ? 'ellipse' : 'none', labels: d.singletons ? 'all' : 'auto', centroids: !!groupNames, shapes: false, pointSize: 4.5, labelSize: 9.5, repel: true, title: 'PCoA · ' + R.ind.methodName },
      controls: [
        { key: 'title', label: 'Title', type: 'text' },
        { key: 'ax1', label: 'Horizontal axis', type: 'select', options: axisOpts }, { key: 'ax2', label: 'Vertical axis', type: 'select', options: axisOpts },
        { key: 'envelope', label: 'Group envelope', type: 'select', options: [['ellipse', '95% ellipse'], ['hull', 'convex hull'], ['none', 'none']] },
        { key: 'labels', label: 'Point labels', type: 'select', options: [['auto', 'when ≤ 40 points'], ['all', 'always'], ['none', 'never']] },
        { key: 'repel', label: 'Spread overlapping labels apart', type: 'checkbox' },
        { key: 'centroids', label: 'Group centroids', type: 'checkbox' }, { key: 'shapes', label: 'One symbol per group', type: 'checkbox' },
        { key: 'pointSize', label: 'Point size', type: 'range', min: 2, max: 10, step: 0.5 }, { key: 'labelSize', label: 'Label size', type: 'range', min: 6, max: 16, step: 0.5 }, pal,
      ],
      render: cfg => P6.pcoa(cfg, S),
    });
    mount('fig6Scree', {
      title: 'How much each axis explains', fileName: 'pcoa_scree', width: 700, height: 380,
      defaults: { palette: 'cluster', axes: 10, cumulative: true, title: 'Eigenvalues of the PCoA' },
      controls: [{ key: 'title', label: 'Title', type: 'text' }, { key: 'axes', label: 'Axes shown', type: 'range', min: 3, max: 15, step: 1 }, { key: 'cumulative', label: 'Cumulative %', type: 'checkbox' }, pal],
      render: cfg => P6.scree(cfg, pc),
    });
    el('fig6PcoaPop').style.display = R.pcoaPop ? '' : 'none';
    if (!R.pcoaPop) el('fig6PcoaPop').innerHTML = '';
    if (R.pcoaPop) {
      const SP = { scores: R.pcoaPop.scores, pct: R.pcoaPop.pctPos, labels: R.pop.names, groupOf: R.pop.names.map((_, i) => i), groupNames: null };
      mount('fig6PcoaPop', {
        title: 'Principal coordinates of the populations', fileName: 'pcoa_populations', width: 780, height: 520,
        defaults: { palette: 'cluster', ax1: 1, ax2: 2, envelope: 'none', labels: 'all', centroids: false, pointSize: 7, labelSize: 11, legendPos: 'none', repel: true, title: 'PCoA of populations · ' + R.pop.methodName },
        controls: [{ key: 'title', label: 'Title', type: 'text' }, { key: 'repel', label: 'Spread overlapping labels apart', type: 'checkbox' },{ key: 'pointSize', label: 'Point size', type: 'range', min: 3, max: 14, step: 0.5 }, { key: 'labelSize', label: 'Label size', type: 'range', min: 7, max: 16, step: 0.5 }, pal],
        render: cfg => P6.pcoa(cfg, SP),
      });
    }
  }

  /* ---------- trees ---------- */
  function fillTreeChoices(d) {
    /* a new dataset opens on its first tree; recomputing the same one keeps the tree on screen */
    const sel = el('treeShown'); const cur = treeData === d ? sel.value : ''; sel.innerHTML = '';
    treeData = d;
    if (R.trees) { sel.appendChild(mk('option', { value: 'popNJ' }, 'Populations · neighbour-joining')); sel.appendChild(mk('option', { value: 'popUPGMA' }, 'Populations · UPGMA')); }
    if (R.indTrees) { const u = d.kind === 'morph' ? 'Plants' : UNIT(true, true); if (R.indTrees.nj) sel.appendChild(mk('option', { value: 'indNJ' }, `${u} · neighbour-joining`)); sel.appendChild(mk('option', { value: 'indUPGMA' }, `${u} · UPGMA`)); }
    if ([...sel.options].some(o => o.value === cur)) sel.value = cur;
  }
  function currentTree() {
    const w = el('treeShown').value;
    if (w === 'popNJ' && R.trees) return { root: R.trees.nj, level: 'pop', name: 'Neighbour-joining tree of populations' };
    if (w === 'popUPGMA' && R.trees) return { root: R.trees.upgma, level: 'pop', name: 'UPGMA tree of populations' };
    if (w === 'indNJ' && R.indTrees) return { root: R.indTrees.nj, level: 'ind', name: `Neighbour-joining tree of ${UNIT()}` };
    if (R.indTrees) return { root: R.indTrees.upgma, level: 'ind', name: `UPGMA tree of ${UNIT()}` };
    return null;
  }
  /* what the tree studio needs to know about the tips of this tree */
  function treeSpec(d, t) {
    const isPop = t.level === 'pop';
    const popIndex = new Map(d.pops.map((p, i) => [p.name, i]));
    const regionNames = d.regions.map(r => r.name);
    const regionOfPop = pi => { const p = d.pops[pi]; return p && p.region ? regionNames.indexOf(p.region) : null; };
    const T = {
      root: t.root,
      canReroot: /NJ$/.test(el('treeShown').value),
      tipLabel: i => (isPop ? R.pop.names[i] : R.ind.labels[i]),
      rings: [],
      note: isPop && R.trees.boot ? `support: % of ${R.trees.boot} bootstrap resamplings of the ${unitWord(R.trees.bootUnit)} · ${R.pop.methodName}`
        : !isPop && R.indTrees.boot ? `support: % of ${R.indTrees.boot} bootstrap resamplings of the ${unitWord(R.indTrees.bootUnit)} · ${R.ind.methodName}`
          : (isPop ? R.pop.methodName : R.ind.methodName),
    };
    if (isPop) {
      if (regionNames.length > 1) {
        T.tipGroup = i => { const r = regionOfPop(popIndex.get(R.pop.names[i])); return r != null && r >= 0 ? r : null; };
        T.groupNames = regionNames; T.groupWord = 'Region';
      }
    } else {
      if (!d.singletons) {
        T.tipGroup = i => (R.ind.popOf[i] >= 0 ? R.ind.popOf[i] : null);
        T.groupNames = d.pops.map(p => p.name); T.groupWord = 'Population';
        T.rings.push({ key: 'pop', title: 'Population', kind: 'cat', of: T.tipGroup, names: T.groupNames, colour: ci => Fig.color(Prefs.get('figstyle', {}).palette || 'cluster', ci) });
      }
      if (regionNames.length > 1) {
        T.rings.push({ key: 'region', title: 'Region', kind: 'cat', names: regionNames, of: i => { const di = R.ind.idx[i]; const rg = d.ind[di].region; const k = regionNames.indexOf(rg); return k >= 0 ? k : null; } });
        if (d.singletons) { T.tipGroup = T.rings[T.rings.length - 1].of; T.groupNames = regionNames; T.groupWord = 'Region'; }
      }
      /* ancestry proportions from Block 7, as a stacked ring */
      const S = state.struct;
      if (S && S.consensus && S.Ks && S.Ks.length) {
        T.structureK = S.Ks.filter(K => K > 1 && S.consensus[K]);
        if (T.structureK.length) {
          T.withCfg = cfg => {
            const K = Number(cfg.structK) || (S.evanno && S.evanno.bestDelta) || T.structureK[0];
            const Q = S.consensus[K] ? S.consensus[K].Q : null;
            const ring = { key: 'structure', title: `Ancestry, K = ${K}`, kind: 'q', names: Array.from({ length: K }, (_, k) => 'Cluster ' + (k + 1)), of: i => (Q ? Q[R.ind.idx[i]] : null), colour: k => Fig.color('vivid', k) };
            return Object.assign({}, T, { rings: T.rings.filter(r => r.key !== 'structure').concat([ring]) });
          };
          T.rings.push({ key: 'structure', title: 'Ancestry (Block 7)', kind: 'q', names: [], of: () => null });
        }
      }
    }
    return T;
  }

  /* images: one per tip (populations, landraces, species) or per group */
  function openImages() {
    const d = state.data; const t = currentTree();
    if (!d || !t) return;
    const T = treeSpec(d, t);
    const tipsN = TreeOps.tips(t.root).map(n => T.tipLabel(n.tip));
    const names = [...new Set((T.groupNames || []).concat(tipsN.length <= 400 ? tipsN : []))];
    OTUImg.openManager({ names, title: 'Images for the tree — ' + (T.groupNames ? `${T.groupWord.toLowerCase()}s and tips` : 'tips') });
  }

  function drawTree() {
    if (!R) return;
    const d = state.data;
    const t = currentTree();
    if (!t || !t.root) { el('fig6Tree').innerHTML = ''; return; }
    const isPop = t.level === 'pop';
    const T = treeSpec(d, t);
    const nTips = isPop ? R.pop.names.length : R.ind.labels.length;
    const boot = isPop ? R.trees.boot : R.indTrees.boot;
    try {
      Fig.mount('fig6Tree', {
        title: t.name, fileName: t.name.toLowerCase().replace(/[^a-z]+/g, '_'), width: 900, height: 900,
        defaults: TV.defaults(T, {
          title: t.name, layout: nTips > 25 ? 'circular' : 'rect', height: nTips > 25 ? 900 : 520,
          labelSize: nTips > 150 ? 6 : nTips > 60 ? 8 : 10.5, tipLabels: nTips <= 300, rowH: nTips > 60 ? 10 : 18,
          support: boot && nTips <= 60 ? 'numbers' : 'dots', pointSize: isPop ? 4 : 2.5,
          images: 'none', ring_pop: false, ring_region: !isPop && d.regions.length > 1, ring_structure: false,
        }),
        controls: TV.controls(T, { extra: T.structureK ? [{ key: 'structK', label: 'K of the ancestry ring', type: 'select', options: T.structureK.map(K => [String(K), 'K = ' + K]) }] : [] }),
        render: cfg => TV.render(cfg, T.withCfg ? T.withCfg(cfg) : T),
      });
    } catch (e) { console.error(e); el('fig6Tree').innerHTML = `<div class="msg msg-error">${esc(e.message)}</div>`; }
    /* support table: one row per split, the smaller side named */
    if (boot) {
      const names = isPop ? R.pop.names : R.ind.labels;
      const rows = uniqueSupports(t.root).map(s => {
        let side = TreeUtil.treeTips(s.node).map(tp => tp.tip);
        if (side.length > nTips / 2) { const inSide = new Set(side); side = names.map((_, i) => i).filter(i => !inSide.has(i)); }
        return { clade: side.map(i => names[i]).join(', '), n: side.length, support: s.support };
      });
      buildTable('treeSupportTable', [{ key: 'clade', label: 'Grouping' }, { key: 'n', label: isPop ? 'Populations' : (d.kind === 'morph' ? 'Plants' : UNIT(true, true)), num: true }, { key: 'support', label: 'Bootstrap support', num: true, fmt: v => fmtPct(v, 0) }], rows.sort((a, b) => b.support - a.support), { limit: 60 });
      el('treeSupportWrap').style.display = rows.length ? '' : 'none';
    } else el('treeSupportWrap').style.display = 'none';
  }

  /* ---------- IBD ---------- */
  function renderIBD(d) {
    const card = el('ibdCard');
    if (!R.ibd && !R.mantelInd) { card.style.display = 'none'; el('fig6IbdPop').innerHTML = ''; el('fig6IbdInd').innerHTML = ''; el('ibdTable').innerHTML = ''; return; }
    card.style.display = '';
    const mount = (id, spec) => { try { Fig.mount(id, spec); } catch (e) { console.error(id, e); } };
    const pal = { key: 'palette', label: 'Palette', type: 'select', options: Object.entries(Fig.paletteNames), shared: true };
    if (R.ibd) {
      buildTable('ibdTable', [
        { key: 'pair', label: 'Pair', get: r => R.ibd.names[r.a] + ' × ' + R.ibd.names[r.b] },
        { key: 'geo', label: `Distance (${R.ibd.unit})`, num: true, fmt: v => v.toFixed(1) },
        { key: 'theta', label: 'θ', num: true, fmt: f3 }, { key: 'lin', label: 'θ/(1−θ)', num: true, fmt: f3 },
      ], R.ibd.pairs.slice().sort((a, b) => a.geo - b.geo), { limit: 120 });
      el('ibdNote').innerHTML = `Mantel test between the population distance matrix (${R.pop.methodName}) and geographic distance: r = ${f3(R.ibd.mantel.r)}, P = ${R.ibd.mantel.p == null ? '—' : R.ibd.mantel.p.toFixed(3)}. Rousset's linearised F<sub>ST</sub> against ln(distance): r = ${f3(R.ibd.mantelLin.r)}, P = ${R.ibd.mantelLin.p == null ? '—' : R.ibd.mantelLin.p.toFixed(3)} (${R.ibd.mantelLin.perms} permutations).`;
      el('fig6IbdPop').style.display = '';
      mount('fig6IbdPop', {
        title: 'Isolation by distance between populations', fileName: 'ibd_populations', width: 780, height: 500,
        defaults: { palette: 'cluster', pointSize: 5, line: true, pairLabels: R.ibd.pairs.length <= 20, repel: true, title: 'Rousset (1997): F_ST/(1 − F_ST) against ln(distance)' },
        controls: [{ key: 'title', label: 'Title', type: 'text' }, { key: 'line', label: 'Regression line', type: 'checkbox' }, { key: 'pairLabels', label: 'Label the pairs', type: 'checkbox' }, { key: 'repel', label: 'Spread overlapping labels apart', type: 'checkbox' },{ key: 'pointSize', label: 'Point size', type: 'range', min: 2, max: 10, step: 0.5 }, pal],
        render: cfg => P6.ibd(cfg, { x: R.ibd.x, y: R.ibd.y, xlab: `ln(geographic distance, ${R.ibd.unit})`, ylab: 'F_ST / (1 − F_ST)', reg: R.ibd.reg, mantel: R.ibd.mantelLin, labels: R.ibd.pairs.map(p => R.ibd.names[p.a] + '×' + R.ibd.names[p.b]) }),
      });
    } else { el('ibdTable').innerHTML = ''; el('ibdNote').innerHTML = `Mantel test between individual genetic and geographic distances (${R.geo.nInd} mapped individuals): r = ${f3(R.mantelInd.r)}, P = ${R.mantelInd.p == null ? '—' : R.mantelInd.p.toFixed(3)}.`; el('fig6IbdPop').style.display = 'none'; }
    if (R.geo && R.geo.indPairs) {
      mount('fig6IbdInd', {
        title: 'Genetic against geographic distance, individual pairs', fileName: 'ibd_individuals', width: 780, height: 480,
        defaults: { palette: 'cluster', pointSize: 3, line: true, title: 'Every pair of mapped individuals' },
        controls: [{ key: 'title', label: 'Title', type: 'text' }, { key: 'line', label: 'Regression line', type: 'checkbox' }, pal],
        render: cfg => P6.ibd(cfg, { x: R.geo.indPairs.geo, y: R.geo.indPairs.gen, xlab: `geographic distance (${R.geo.unit})`, ylab: R.ind.methodName, reg: GD.regression(R.geo.indPairs.geo, R.geo.indPairs.gen), mantel: R.mantelInd }),
      });
    }
  }

  /* ---------- downloads ---------- */
  function downloadMatrix(which) {
    if (!R) return;
    const M = which === 'pop' ? R.pop : R.ind;
    if (!M) return;
    const names = which === 'pop' ? M.names : M.labels;
    const rows = names.map((nm, i) => [nm].concat(M.D[i].map(v => (isFinite(v) ? v.toFixed(6) : ''))));
    download(matrixToCSV([''].concat(names), rows), slug(state.fileName) + (which === 'pop' ? '_population_distances.csv' : '_individual_distances.csv'), 'text/csv;charset=utf-8');
  }
  function downloadScores() {
    if (!R) return;
    const pc = R.pcoaInd;
    const header = [UNIT(false, true), 'Population'].concat(Array.from({ length: pc.nAxes }, (_, k) => 'PCo' + (k + 1)));
    const rows = R.ind.labels.map((nm, i) => [nm, state.data.pops[R.ind.popOf[i]] ? state.data.pops[R.ind.popOf[i]].name : ''].concat(pc.scores[i].map(v => v.toFixed(6))));
    download(matrixToCSV(header, rows), slug(state.fileName) + '_pcoa_scores.csv', 'text/csv;charset=utf-8');
  }
  function toNewick(node, labelOf) {
    const rec = n => {
      if (n.tip != null) return String(labelOf(n.tip)).replace(/[\s,;:()\[\]']/g, '_');
      const inner = n.children.map(c => rec(c.node) + ':' + Math.max(0, c.len).toFixed(6)).join(',');
      return '(' + inner + ')' + (n.support != null ? Math.round(n.support * 100) : '');
    };
    return rec(node) + ';';
  }
  function downloadNewick() {
    if (!R) return;
    const t = currentTree(); if (!t || !t.root) return;
    const lab = t.level === 'pop' ? (i => R.pop.names[i]) : (i => R.ind.labels[i]);
    download(toNewick(t.root, lab) + '\n', slug(state.fileName) + '_' + el('treeShown').value + '.nwk', 'text/plain;charset=utf-8');
  }

  document.addEventListener('DOMContentLoaded', init);
  window.B6 = { run, get result() { return R; }, toNewick };
})();
