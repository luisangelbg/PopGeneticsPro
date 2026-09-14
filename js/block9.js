/* PopGeneticsPro — Block 9: demographic history and fine-scale spatial structure.
   Five sections that appear according to the data: bottlenecks, effective size,
   spatial genetic structure, mating system, P_ST versus F_ST. */

(function () {

  let R = null;

  function init() {
    if (!el('btnRunDemog')) return;
    el('btnRunDemog').addEventListener('click', run);
    el('btlModelShown').addEventListener('change', renderBottleneck);
    el('btlPopShown').addEventListener('change', renderBottleneck);
    el('pstFst').addEventListener('change', renderPst);
    el('btnDemogCSV').addEventListener('click', downloadAll);
    el('btnContinue9').addEventListener('click', () => continueAfter(9, 'demogMessages'));
    document.addEventListener('stepchange', e => { if (String(e.detail.step) === '9') onEnter(); });
  }

  function onEnter() {
    const d = state.data;
    if (!d) { showMessage('demogMessages', 'error', 'Load your data in Block 2 first.'); return; }
    const codom = d.kind === 'codominant' && d.ploidy === 2;
    const bigPops = d.pops.filter(p => p.idx.length >= 10 && d.declaredPops && !d.singletons).length;
    const mapped = d.ind.filter(v => v.lat != null && isFinite(v.lat)).length;
    el('demogBtlRow').style.display = codom && bigPops ? '' : 'none';
    el('demogNeRow').style.display = codom && bigPops ? '' : 'none';
    el('demogSpRow').style.display = mapped >= 10 && d.kind !== 'morph' ? '' : 'none';
    el('spScopeLabel').style.display = d.declaredPops && !d.singletons && d.pops.length >= 2 ? '' : 'none';
    el('demogPstRow').style.display = d.kind === 'morph' ? '' : 'none';
    const avail = [];
    if (codom && bigPops) avail.push(`bottleneck tests and N_e for ${bigPops} population(s) with ≥ 10 plants`);
    if (mapped >= 10 && d.kind !== 'morph') avail.push(`spatial genetic structure on ${mapped} mapped individuals`);
    if (codom && d.declaredPops && !d.singletons) avail.push('selfing rate from F_IS');
    if (d.kind === 'morph') avail.push('P_ST for every quantitative trait');
    el('demogAvail').innerHTML = avail.length ? 'With these data: ' + avail.join(' · ') + '.' : 'None of the analyses of this block applies to these data: they need codominant genotypes with ≥ 10 plants per population, individual coordinates, or quantitative traits.';
    /* a new dataset was built in Block 2: never show the previous file's results while recomputing */
    if (!state.demog) { R = null; el('demogResults').style.display = 'none'; el('demogTiming').textContent = ''; }
    if (!state.demog && avail.length) run();
  }

  function settings() {
    const models = ['iam', 'tpm', 'smm'].filter(m => el('btl_' + m).checked);
    /* a P_crit of 0 is a valid choice (keep every allele): only an empty box takes the default */
    const pcrit = parseFloat(el('nePcrit').value);
    return {
      models: models.length ? models : ['tpm'], accept: Number(el('btlAccept').value) || 300, pSingle: Number(el('btlPSingle').value) || 0.95, sigma2: Number(el('btlSigma').value) || 12,
      motif: Number(el('btlMotif').value) || 2, pcrit: isFinite(pcrit) ? Math.min(0.1, Math.max(0, pcrit)) : 0.02,
      /* the correlogram is read against its permutation envelope, so at least 99 permutations are run */
      classes: Number(el('spClasses').value) || 10, perms: Math.max(99, Number(el('spPerms').value) || 999), spScope: el('spScope').value, boot: 1000,
      c: Number(el('pstC').value) || 1, h2: Number(el('pstH2').value) || 1, seed: Number(el('demogSeed').value) || 1,
    };
  }

  function run() {
    const d = state.data; if (!d) return;
    clearMessages('demogMessages');
    const btn = el('btnRunDemog'); btn.disabled = true; btn.textContent = 'Computing…';
    const t0 = performance.now();
    setTimeout(() => {
      try {
        R = Demog.compute(d, settings());
        state.demog = R;
        render(d);
        el('demogResults').style.display = '';
        el('demogTiming').textContent = `computed in ${((performance.now() - t0) / 1000).toFixed(1)} s · seed ${R.opts.seed}`;
      } catch (e) { console.error(e); showMessage('demogMessages', 'error', 'The analysis failed: ' + esc(e.message)); }
      finally { btn.disabled = false; btn.textContent = 'Run the analyses'; }
    }, 30);
  }

  const f3 = v => (v == null || !isFinite(v)) ? (v === Infinity ? '∞' : '—') : v.toFixed(3);
  const fmtNe = v => v == null ? '—' : isFinite(v) ? Math.round(v).toString() : '∞';
  const pTxt = p => p == null ? '—' : (p < 0.001 ? '< 0.001' : p.toFixed(3));
  const mount = (id, spec) => { const host = el(id); if (!host) return; try { Fig.mount(id, spec); } catch (e) { console.error(id, e); host.innerHTML = `<div class="msg msg-error">${esc(e.message)}</div>`; } };
  const pal = { key: 'palette', label: 'Palette', type: 'select', options: Object.entries(Fig.paletteNames), shared: true };

  function render(d) {
    renderTiles(d);
    renderInterpretation(d);
    renderBottleneckSetup(); renderBottleneck();
    renderNe(d);
    renderSpatial(d);
    renderSelfing(d);
    renderPst();
  }

  function renderTiles(d) {
    const tiles = [];
    if (R.bottleneck) {
      const m = R.opts.models.includes('tpm') ? 'tpm' : R.opts.models[0];
      const both = m !== 'smm' && R.opts.models.includes('smm');
      const excess = (b, mm) => b.tests[mm] && b.tests[mm].wilcoxon.pExcess != null && b.tests[mm].wilcoxon.pExcess < 0.05;
      const sig = R.bottleneck.filter(b => excess(b, m) && (!both || excess(b, 'smm'))).length;
      tiles.push(['Bottleneck signal', `${sig} / ${R.bottleneck.length}`, `populations with heterozygosity excess (${both ? `${m.toUpperCase()} and SMM` : m.toUpperCase()}, Wilcoxon P < 0.05)`, sig ? 'warn' : 'ok']);
      const shifted = R.bottleneck.filter(b => b.modeShift.shifted).length;
      tiles.push(['Mode shift', `${shifted} / ${R.bottleneck.length}`, 'populations without the L-shaped distribution', shifted ? 'warn' : 'ok']);
    }
    if (R.ne) { const v = R.ne.map(x => x.ld && isFinite(x.ld.Ne) ? Math.round(x.ld.Ne) : '∞'); tiles.push(['N_e (LD)', v.join(' · '), R.ne.map(x => x.pop).join(' · ')]); }
    const Sx = R.spatial && !R.spatial.error ? R.spatial : null;
    if (Sx) tiles.push([Sx.codom ? 'Kinship, first class' : 'r, first class', f3(Sx.meanKinFirst), (Sx.classes[0].pTwo < 0.05 ? 'significant spatial structure' : 'no significant structure') + (Sx.scope === 'within' ? ' within populations' : ''), Sx.classes[0].pTwo < 0.05 ? 'warn' : 'ok']);
    if (Sx && Sx.Sp != null) tiles.push(['Sp', f3(Sx.Sp), Sx.Nb != null && isFinite(Sx.Nb) ? `Nb ≈ ${Math.round(Sx.Nb)}` : '']);
    if (R.selfing && R.selfing.length) tiles.push(['Selfing rate', R.selfing.map(s => s.s == null ? '—' : fmtPct(s.s, 0)).join(' · '), R.selfing.map(s => s.pop).join(' · ')]);
    if (R.pst) { const above = R.pst.rows.filter(r => r.p < 0.05).length; tiles.push(['Traits differentiated', `${above} / ${R.pst.rows.length}`, 'ANOVA P < 0.05 among populations']); }
    statTiles('demogTiles', tiles);
  }

  function renderInterpretation(d) {
    const parts = [];
    if (R.bottleneck) {
      const m = R.opts.models.includes('tpm') ? 'tpm' : R.opts.models[0];
      R.bottleneck.forEach(b => {
        const t = b.tests[m]; if (!t) return;
        const w = t.wilcoxon;
        const sig = w.pExcess != null && w.pExcess < 0.05;
        /* the conclusion is firm only when the conservative stepwise model agrees */
        const other = m !== 'smm' && b.tests.smm ? b.tests.smm.wilcoxon : null;
        const agree = other ? other.pExcess != null && other.pExcess < 0.05 : true;
        parts.push(`<p><b>${esc(b.pop)}</b> (n = ${b.n}): under the ${m.toUpperCase()} ${t.nExcess} of ${t.nLoci} loci show more heterozygosity than expected for their number of alleles (${t.expectedExcess.toFixed(1)} expected by chance); Wilcoxon one-tailed P for excess = ${pTxt(w.pExcess)}${other ? ` (SMM: ${pTxt(other.pExcess)})` : ''}, standardized-differences T₂ = ${t.T2.toFixed(2)} (P = ${pTxt(t.pT2)}). ` +
          (sig && agree ? 'This is the signature of a <b>recent bottleneck</b>: rare alleles were lost faster than heterozygosity, so He now exceeds what the surviving alleles predict. '
            : sig ? `The ${m.toUpperCase()} finds an excess but the stepwise model does not: a <b>weak signal</b> that depends on the mutation model. It can also come from a sample that is not at mutation–drift equilibrium for other reasons (allele frequencies more even than drift and mutation produce). `
            : 'No excess: the population has not lost rare alleles recently, at least not enough to detect. ') +
          `The allele-frequency distribution is ${b.modeShift.shifted ? '<b>mode-shifted</b> (the rare-allele class is no longer the largest), which agrees with a bottleneck' : 'L-shaped, as in a stable population'}. ` +
          (b.mRatio.rows.length ? `Garza–Williamson M = ${f3(b.mRatio.mean)} on average (${b.mRatio.nBelow} of ${b.mRatio.rows.length} loci below the 0.68 threshold); M detects older, longer reductions than the heterozygosity test${b.mRatio.mean < 0.68 ? ', and here it does' : ''}. ` : '') +
          (b.F > 0.05 ? `With F<sub>IS</sub> = ${b.F.toFixed(2)}, each plant carries fewer independent gene copies than two; the equilibrium was simulated for n(2 − F) copies so that inbreeding alone does not look like a bottleneck.` : '') + `</p>`);
      });
      parts.push(`<p class="callout tip"><b>Which mutation model to believe.</b> The IAM finds bottlenecks too easily with microsatellites and the strict SMM too rarely; the two-phase model with ${(R.opts.pSingle * 100).toFixed(0)}% single-step changes is the recommended compromise (Piry et al. 1999). A bottleneck is credible when TPM and SMM agree.</p>`);
    }
    if (R.ne) {
      R.ne.forEach(x => {
        if (!x.ld) { parts.push(`<p><b>${esc(x.pop)}</b>: too few locus pairs above the frequency threshold for the LD estimate.</p>`); return; }
        const ld = x.ld;
        parts.push(`<p><b>${esc(x.pop)}</b>: the mean r² over ${ld.nComparisons} locus pairs (${ld.nLoci} loci, alleles above ${ld.pcrit}) is ${ld.r2.toFixed(4)}, of which ${ld.expected.toFixed(4)} is expected from sampling ${ld.Sh.toFixed(1)} plants alone; the remainder gives <b>N<sub>e</sub> = ${isFinite(ld.Ne) ? Math.round(ld.Ne) : '∞'}</b>` +
          (ld.ci ? ` (jackknife 95% CI ${isFinite(ld.ci[0]) ? Math.round(ld.ci[0]) : '∞'}–${isFinite(ld.ci[1]) ? Math.round(ld.ci[1]) : '∞'})` : '') + `. ` +
          (!isFinite(ld.Ne) || (ld.ci && !isFinite(ld.ci[1])) ? 'An infinite upper bound means the sample cannot distinguish the LD from pure sampling noise: N<sub>e</sub> is large relative to the sample, not necessarily unknown. ' : 'Values below 50 mean inbreeding depression is a present danger; below 500, long-term loss of adaptive potential (Franklin 1980; Frankham et al. 2014 raise these to 100 and 1000). ') +
          (x.het ? `The heterozygote-excess method gives N<sub>e</sub> = ${isFinite(x.het.Ne) ? Math.round(x.het.Ne) : '∞'} (D = ${x.het.D.toFixed(3)}${x.het.ci ? `; 95% limits ${fmtNe(x.het.ci[0])}–${fmtNe(x.het.ci[1])}` : ''}); it only has power when N<sub>e</sub> is very small${x.het.ci && !isFinite(x.het.ci[1]) ? ', and here its upper limit is ∞' : ''}.` : '') + `</p>`);
      });
      parts.push(`<p class="callout warn"><b>Assumptions of the LD estimate.</b> Random mating, unlinked loci, discrete generations and a closed population; it estimates the N<sub>e</sub> of the parental generation. Selfing and admixture inflate LD and bias N<sub>e</sub> downward — check Block 4 before quoting it.</p>`);
    }
    if (R.spatial && R.spatial.error) {
      parts.push(`<p><b>Spatial genetic structure</b>: not computed — ${esc(R.spatial.error)}. Fine-scale structure needs a coordinate for each plant; when every plant carries the coordinates of its population, use the population-level isolation by distance of Block 6 instead.</p>`);
    } else if (R.spatial) {
      const Sx = R.spatial, c1 = Sx.classes[0], dp = Sx.unit === 'm' ? 0 : 2;
      const positive = c1.value > c1.hi95, negative = c1.value < c1.lo95;
      const scope = Sx.scope === 'within'
        ? `pairs of plants from the same population (${Sx.nGroups} populations combined${Sx.skipped.length ? `; ${Sx.skipped.map(esc).join(', ')} left out with fewer than 5 mapped plants` : ''})`
        : (Sx.several ? 'all pairs, including plants from different populations' : 'all pairs');
      parts.push(`<p><b>Spatial genetic structure</b> among ${Sx.n} mapped individuals, using ${scope}, in ${Sx.classes.length} distance classes with equal numbers of pairs: ${Sx.codom ? 'Loiselle kinship F<sub>ij</sub>' : 'Smouse &amp; Peakall r'} in the nearest class (up to ${c1.hi.toFixed(dp)} ${Sx.unit}) is ${f3(c1.value)}, ${positive ? '<b>above</b>' : negative ? '<b>below</b>' : 'inside'} the 95% permutation envelope. ` +
        (positive && Sx.extent != null ? `Positive autocorrelation persists up to about <b>${Sx.extent.toFixed(dp)} ${Sx.unit}</b> — the scale beyond which neighbours are no more related than random pairs, a first estimate of the genetic patch size. ` : positive ? 'Neighbours are more related than random pairs at every distance class sampled. ' : 'Neighbours are not more related than distant plants at this scale: seed and pollen move far enough, or the sample is too coarse to see it. ') +
        (Sx.scope === 'all' && Sx.several ? 'Because pairs from different populations are included, the correlogram mixes fine-scale structure with the differentiation among populations (Block 5); choose pairs within populations to measure fine-scale structure alone. ' : '') +
        (Sx.codom && Sx.reg ? `The regression of kinship on ln(distance) has slope b<sub>F</sub> = ${Sx.reg.slope.toExponential(2)} (permutation P = ${pTxt(Sx.bP)}), giving <b>Sp = ${f3(Sx.Sp)}</b>` + (isFinite(Sx.Nb) ? ` and a neighbourhood size Nb ≈ ${Math.round(Sx.Nb)} individuals` : '') + `. For reference (Vekemans &amp; Hardy 2004), Sp averages about 0.013 in outcrossing species and 0.037 in species with mixed mating, and it is higher in selfing species, in herbs than in trees and in sparse populations — Sp is the number to compare across studies.` : '') + `</p>`);
    }
    if (R.selfing && R.selfing.length) {
      parts.push(`<p><b>Mating system</b>: the equilibrium selfing rate implied by F<sub>IS</sub> (s = 2F/(1+F)) is ${R.selfing.map(s => `${esc(s.pop)} ${s.s == null ? '—' : fmtPct(s.s, 0)}${s.sCI ? ` (${fmtPct(Math.max(0, s.sCI[0]), 0)}–${fmtPct(s.sCI[1], 0)})` : ''}`).join(', ')}. This is an inference from adult genotypes, which assumes the deficit comes from selfing alone; biparental inbreeding, null alleles and Wahlund effects all inflate it. A direct estimate needs progeny arrays (mother plants and their seeds, analysed with the mixed-mating model of Ritland 2002).</p>`);
    }
    if (R.pst) {
      const P = R.pst; const fst = Number(el('pstFst').value) || null;
      const above = fst ? P.rows.filter(r => r.ci[0] > fst) : [];
      parts.push(`<p><b>P<sub>ST</sub></b> (the phenotypic analogue of Q<sub>ST</sub>, Brommer 2011) was computed for ${P.rows.length} traits across ${P.nPops} populations with c/h² = ${(P.c / P.h2).toFixed(2)}. ` +
        `The confidence limits are exact for the one-way ANOVA (Searle, Casella &amp; McCulloch 1992): the among-population variance rests on only ${P.nPops - 1} degree${P.nPops === 2 ? '' : 's'} of freedom${P.nPops < 10 ? ', so the intervals are wide — with fewer than 10 populations a P<sub>ST</sub> above F<sub>ST</sub> is hard to demonstrate' : ''}. ` +
        (fst ? `Compared with the neutral F<sub>ST</sub> you entered (${fst.toFixed(3)}), ${above.length} trait${above.length === 1 ? '' : 's'} ${above.length === 1 ? 'has' : 'have'} a P<sub>ST</sub> whose whole confidence interval lies above it${above.length ? ` (${above.map(r => esc(r.trait)).join(', ')}) — more differentiated than drift alone would produce, the signature of <b>divergent selection</b> (local adaptation)` : ''}. Traits with P<sub>ST</sub> below F<sub>ST</sub> would indicate stabilising selection.` : 'Enter the neutral F<sub>ST</sub> from a marker study of the same populations (Block 5 on your marker data) to test each trait against drift.') +
        ` Because P<sub>ST</sub> uses phenotypes, the comparison holds only if the between-population variance is mostly genetic; the c/h² slider lets you see how robust the conclusion is to that assumption.</p>`);
    }
    el('demogInterpret').innerHTML = parts.join('');
  }

  /* ---------- bottleneck ---------- */
  function renderBottleneckSetup() {
    const card = el('btlCard');
    if (!R.bottleneck) { card.style.display = 'none'; return; }
    card.style.display = '';
    const ps = el('btlPopShown'); ps.innerHTML = ''; R.bottleneck.forEach((b, i) => ps.appendChild(mk('option', { value: String(i) }, b.pop)));
    const ms = el('btlModelShown'); ms.innerHTML = ''; R.opts.models.forEach(m => ms.appendChild(mk('option', { value: m }, m.toUpperCase())));
    if (R.opts.models.includes('tpm')) ms.value = 'tpm';
  }
  function renderBottleneck() {
    if (!R || !R.bottleneck) return;
    const B = R.bottleneck[Number(el('btlPopShown').value) || 0], m = el('btlModelShown').value;
    const rows = B.loci.map(x => Object.assign({ locus: x.locus, k: x.k, n: x.n, He: x.He }, x[m] || {}));
    buildTable('btlLocusTable', [
      { key: 'locus', label: 'Locus' }, { key: 'n', label: 'n', num: true }, { key: 'k', label: 'Alleles', num: true },
      { key: 'He', label: 'He observed', num: true, fmt: f3 }, { key: 'Heq', label: 'Heq (equilibrium)', num: true, fmt: f3 }, { key: 'sdHeq', label: 'SD', num: true, fmt: f3 },
      { key: 'diff', label: 'He − Heq', num: true, html: true, get: r => r.diff == null ? '—' : (r.diff > 0 ? `<b class="geno-het">+${r.diff.toFixed(3)}</b>` : r.diff.toFixed(3)) },
      { key: 'std', label: 'Standardized', num: true, fmt: f3 }, { key: 'pExcess', label: 'P(excess)', num: true, fmt: pTxt }, { key: 'nAccepted', label: 'Simulations kept', num: true },
    ], rows);
    const t = B.tests[m];
    buildTable('btlTestTable', [{ key: 'k', label: 'Test' }, { key: 'v', label: 'Result', html: true }], t ? [
      { k: 'Sign test', v: `${t.nExcess} loci with excess, ${t.nDeficit} with deficit; ${t.expectedExcess.toFixed(2)} expected with excess → P = ${esc(pTxt(t.pSign))}` },
      { k: 'Standardized differences', v: `T₂ = ${t.T2.toFixed(3)} → P = ${esc(pTxt(t.pT2))}` },
      { k: 'Wilcoxon signed-rank', v: `one-tailed P (excess) = ${esc(pTxt(t.wilcoxon.pExcess))} · one-tailed P (deficit) = ${esc(pTxt(t.wilcoxon.pDeficit))} · two-tailed P = ${esc(pTxt(t.wilcoxon.pTwo))} (${t.wilcoxon.n} loci; normal scores of each locus within its equilibrium distribution)` },
      { k: 'Inbreeding adjustment', v: B.F > 0 ? `F<sub>IS</sub> = ${B.F.toFixed(3)}: the equilibrium was simulated for n(2 − F) independent gene copies per locus instead of 2n` : 'none needed (F<sub>IS</sub> ≤ 0)' },
      { k: 'Mode shift', v: B.modeShift.shifted ? 'shifted — the 0–0.1 class is not the largest' : 'L-shaped (normal)' },
      { k: 'M-ratio (Garza & Williamson)', v: B.mRatio.rows.length ? `mean M = ${f3(B.mRatio.mean)} · ${B.mRatio.nBelow} of ${B.mRatio.rows.length} loci below 0.68 (motif ${R.opts.motif} bp)` : 'allele codes are not fragment sizes' },
    ] : [{ k: 'No result', v: 'not enough polymorphic loci or accepted simulations' }]);
    mount('fig9Het', { title: 'Heterozygosity excess, locus by locus', fileName: 'bottleneck_heterozygosity', width: 820, height: 440, defaults: { palette: 'cluster', model: m, title: `${B.pop} · He observed vs. equilibrium (${m.toUpperCase()})` }, controls: [{ key: 'title', label: 'Title', type: 'text' }, { key: 'model', label: 'Mutation model', type: 'select', options: R.opts.models.map(x => [x, x.toUpperCase()]) }, pal], render: cfg => P9.hetExcess(cfg, B) });
    mount('fig9Mode', { title: 'Allele frequency classes (mode shift)', fileName: 'bottleneck_mode_shift', width: 820, height: 420, defaults: { palette: 'cluster', title: 'Distribution of allele frequencies: L-shaped or shifted?' }, controls: [{ key: 'title', label: 'Title', type: 'text' }, pal], render: cfg => P9.modeShift(cfg, R.bottleneck.map(b => ({ pop: b.pop, prop: b.modeShift.prop, shifted: b.modeShift.shifted }))) });
  }

  /* ---------- Ne ---------- */
  function renderNe(d) {
    const card = el('neCard');
    if (!R.ne) { card.style.display = 'none'; return; }
    card.style.display = '';
    buildTable('neTable', [
      { key: 'pop', label: 'Population' }, { key: 'n', label: 'n', num: true },
      { key: 'r2', label: 'mean r²', num: true, get: r => r.ld ? r.ld.r2 : null, fmt: v => v.toFixed(5) },
      { key: 'exp', label: 'expected (sampling)', num: true, get: r => r.ld ? r.ld.expected : null, fmt: v => v.toFixed(5) },
      { key: 'pairs', label: 'locus pairs', num: true, get: r => r.ld ? r.ld.nComparisons : null },
      { key: 'Ne', label: 'N<sub>e</sub> (LD)', num: true, get: r => r.ld ? r.ld.Ne : null, fmt: v => isFinite(v) ? Math.round(v).toString() : '∞' },
      { key: 'ci', label: '95% CI (jackknife over loci)', get: r => r.ld && r.ld.ci ? `${isFinite(r.ld.ci[0]) ? Math.round(r.ld.ci[0]) : '∞'} – ${isFinite(r.ld.ci[1]) ? Math.round(r.ld.ci[1]) : '∞'}` : '—' },
      { key: 'NeH', label: 'N<sub>e</sub> (heterozygote excess)', num: true, get: r => r.het ? r.het.Ne : null, fmt: v => isFinite(v) ? Math.round(v).toString() : '∞' },
      { key: 'ciH', label: '95% limits', get: r => r.het && r.het.ci ? `${fmtNe(r.het.ci[0])} – ${fmtNe(r.het.ci[1])}` : '—' },
    ], R.ne);
    mount('fig9Ne', { title: 'Effective population size', fileName: 'ne_ld', width: 720, height: 420, defaults: { palette: 'cluster', cap: 1000, title: 'N_e by the linkage-disequilibrium method' }, controls: [{ key: 'title', label: 'Title', type: 'text' }, { key: 'cap', label: 'Axis ceiling', type: 'number', min: 50, max: 100000, step: 50 }, pal], render: cfg => P9.neBars(cfg, R.ne) });
  }

  /* ---------- spatial ---------- */
  function renderSpatial(d) {
    const card = el('spCard');
    if (!R.spatial || R.spatial.error) { card.style.display = 'none'; return; }
    card.style.display = '';
    const Sx = R.spatial, dp = Sx.unit === 'm' ? 1 : 2;
    buildTable('spTable', [
      { key: 'cls', label: 'Class', get: (r, i) => r.idx },
      { key: 'lo', label: `From (${Sx.unit})`, num: true, fmt: v => v.toFixed(dp) }, { key: 'hi', label: `To (${Sx.unit})`, num: true, fmt: v => v.toFixed(dp) },
      { key: 'nPairs', label: 'Pairs', num: true }, { key: 'value', label: Sx.codom ? 'Loiselle kinship F<sub>ij</sub>' : 'Smouse &amp; Peakall r', num: true, fmt: v => v.toFixed(4) },
      { key: 'env', label: '95% envelope', get: r => `${r.lo95.toFixed(4)} to ${r.hi95.toFixed(4)}` },
      { key: 'pTwo', label: 'P', num: true, html: true, get: r => r.pTwo < 0.05 ? `<b class="geno-het">${pTxt(r.pTwo)}</b>` : pTxt(r.pTwo) },
    ], Sx.classes.map((c, i) => Object.assign({ idx: i + 1 }, c)));
    const within = Sx.scope === 'within';
    el('spNote').innerHTML = (Sx.codom ? `Loiselle et al. (1995) kinship, averaged over loci, with the allele frequencies of ${within ? 'each population' : `the ${Sx.n} mapped plants`} as reference. ` : `Smouse &amp; Peakall (1999) autocorrelation r computed from the ${d.kind === 'dominant' ? 'squared Euclidean distance between band profiles' : 'distance between haplotypes'}${within ? ', centred within each population' : ''}. `) +
      (within ? `Only pairs of plants from the same population enter the ${Sx.nPairs} pairs of the classes; the ${Sx.nGroups} populations are combined. ` : '') +
      `Envelope from ${Sx.perms} random permutations of individuals among locations${within ? ' of their own population' : ''}.` + (Sx.codom && Sx.reg ? ` Regression on ln(distance): slope b<sub>F</sub> = ${Sx.reg.slope.toExponential(3)}, r² = ${Sx.reg.r2.toFixed(3)}, P = ${pTxt(Sx.bP)}; Sp = ${f3(Sx.Sp)}, Nb = ${isFinite(Sx.Nb) ? Math.round(Sx.Nb) : '∞'}.` : '');
    mount('fig9Corr', { title: 'Spatial correlogram', fileName: 'spatial_correlogram', width: 820, height: 460, defaults: { palette: 'cluster', xscale: 'linear', counts: false, title: `${Sx.method} against distance` }, controls: [{ key: 'title', label: 'Title', type: 'text' }, { key: 'xscale', label: 'Distance axis', type: 'select', options: [['linear', 'linear'], ['log', 'logarithmic']] }, { key: 'counts', label: 'Show pairs per class', type: 'checkbox' }, pal], render: cfg => P9.correlogram(cfg, Sx) });
  }

  /* ---------- selfing ---------- */
  function renderSelfing(d) {
    const card = el('selfCard');
    if (!R.selfing || !R.selfing.length) { card.style.display = 'none'; return; }
    card.style.display = '';
    buildTable('selfTable', [
      { key: 'pop', label: 'Population' }, { key: 'n', label: 'n', num: true }, { key: 'nLoci', label: 'Loci', num: true },
      { key: 'f', label: 'F<sub>IS</sub> (W&amp;C f)', num: true, fmt: f3 }, { key: 'fCI', label: '95% CI', get: r => r.fCI ? `${f3(r.fCI[0])} to ${f3(r.fCI[1])}` : '—' },
      { key: 's', label: 'Selfing rate s', num: true, fmt: v => fmtPct(v, 1) }, { key: 'sCI', label: '95% CI', get: r => r.sCI ? `${fmtPct(Math.max(0, r.sCI[0]), 1)} to ${fmtPct(r.sCI[1], 1)}` : '—' },
      { key: 'tm', label: 'Outcrossing t = 1 − s', num: true, get: r => r.s == null ? null : 1 - r.s, fmt: v => fmtPct(v, 1) },
    ], R.selfing);
  }

  /* ---------- P_ST ---------- */
  function renderPst() {
    const card = el('pstCard');
    if (!R || !R.pst) { if (card) card.style.display = 'none'; return; }
    card.style.display = '';
    const fst = Number(el('pstFst').value) || null;
    buildTable('pstTable', [
      { key: 'trait', label: 'Trait' }, { key: 'sB', label: 'σ²<sub>B</sub> (among)', num: true, fmt: v => v.toFixed(4) }, { key: 'sW', label: 'σ²<sub>W</sub> (within)', num: true, fmt: v => v.toFixed(4) },
      { key: 'F', label: 'ANOVA F', num: true, fmt: v => isFinite(v) ? v.toFixed(2) : '∞' }, { key: 'p', label: 'P', num: true, fmt: pTxt },
      { key: 'Pst', label: 'P<sub>ST</sub>', num: true, fmt: f3 }, { key: 'ci', label: '95% CI (exact, F distribution)', get: r => `${f3(r.ci[0])} to ${f3(r.ci[1])}` },
      { key: 'vs', label: fst ? 'vs F<sub>ST</sub>' : '', html: true, get: r => !fst ? '' : (r.ci[0] > fst ? '<span class="pill domin">above F<sub>ST</sub> · divergent selection</span>' : r.ci[1] < fst ? '<span class="pill codom">below F<sub>ST</sub> · stabilising</span>' : '<span class="pill">consistent with drift</span>') },
    ], R.pst.rows);
    mount('fig9Pst', { title: 'P_ST per trait', fileName: 'pst_traits', width: 820, height: 460, defaults: { palette: 'cluster', fst: fst || 0, title: `P_ST with exact 95% intervals (c/h² = ${(R.pst.c / R.pst.h2).toFixed(2)})` }, controls: [{ key: 'title', label: 'Title', type: 'text' }, { key: 'fst', label: 'Reference F_ST line', type: 'number', min: 0, max: 1, step: 0.005 }, pal], render: cfg => P9.pst(cfg, R.pst) });
    renderInterpretation(state.data);
  }

  /* ---------- download ---------- */
  function downloadAll() {
    if (!R) return;
    const rows = [];
    if (R.bottleneck) R.bottleneck.forEach(b => b.loci.forEach(x => R.opts.models.forEach(m => { if (x[m]) rows.push(['bottleneck', b.pop, x.locus, m, x.k, x.He.toFixed(5), x[m].Heq.toFixed(5), x[m].std.toFixed(4), x[m].pExcess.toFixed(4)]); })));
    if (R.ne) R.ne.forEach(x => rows.push(['Ne_LD', x.pop, '', '', x.n, x.ld ? x.ld.r2.toFixed(6) : '', x.ld ? x.ld.expected.toFixed(6) : '', x.ld ? (isFinite(x.ld.Ne) ? x.ld.Ne.toFixed(1) : 'Inf') : '', x.ld && x.ld.ci ? x.ld.ci.map(v => isFinite(v) ? v.toFixed(1) : 'Inf').join(' - ') : '']));
    if (R.spatial && !R.spatial.error) R.spatial.classes.forEach((c, i) => rows.push(['spatial', 'class ' + (i + 1), c.lo.toFixed(3), c.hi.toFixed(3), c.nPairs, c.value.toFixed(5), c.lo95.toFixed(5), c.hi95.toFixed(5), c.pTwo.toFixed(4)]));
    if (R.selfing) R.selfing.forEach(s => rows.push(['selfing', s.pop, '', '', s.n, s.f == null ? '' : s.f.toFixed(4), s.s == null ? '' : s.s.toFixed(4), s.sCI ? s.sCI.map(v => v.toFixed(4)).join(' - ') : '', '']));
    if (R.pst) R.pst.rows.forEach(r => rows.push(['PST', r.trait, '', '', '', r.sB.toFixed(5), r.sW.toFixed(5), r.Pst.toFixed(4), r.ci.map(v => v.toFixed(4)).join(' - ')]));
    download(matrixToCSV(['Section', 'Population_or_item', 'Locus_or_from', 'Model_or_to', 'n_or_k', 'value1', 'value2', 'value3', 'value4'], rows), slug(state.fileName) + '_demography.csv', 'text/csv;charset=utf-8');
  }

  /* one table per analysis with explicit column names, for the ZIP package of Block 10 */
  function tables() {
    if (!R) return [];
    const T = [], n5 = v => (v == null || !isFinite(v)) ? (v === Infinity ? 'Inf' : '') : +v.toFixed(5);
    if (R.bottleneck) T.push({ name: 'bottleneck_by_locus.csv', header: ['Population', 'Locus', 'Model', 'n', 'Alleles', 'He', 'Heq', 'SD_Heq', 'Standardized', 'P_excess', 'Simulations_kept'],
      rows: [].concat(...R.bottleneck.map(b => [].concat(...b.loci.map(x => R.opts.models.filter(m => x[m]).map(m => [b.pop, x.locus, m.toUpperCase(), x.n, x.k, n5(x.He), n5(x[m].Heq), n5(x[m].sdHeq), n5(x[m].std), n5(x[m].pExcess), x[m].nAccepted]))))) });
    if (R.bottleneck) T.push({ name: 'bottleneck_tests.csv', header: ['Population', 'Model', 'F_IS_used', 'Loci', 'Loci_with_excess', 'Expected_with_excess', 'P_sign', 'T2', 'P_T2', 'P_Wilcoxon_excess', 'Mode_shifted', 'Mean_M_ratio'],
      rows: [].concat(...R.bottleneck.map(b => R.opts.models.filter(m => b.tests[m]).map(m => { const t = b.tests[m]; return [b.pop, m.toUpperCase(), n5(b.F), t.nLoci, t.nExcess, n5(t.expectedExcess), n5(t.pSign), n5(t.T2), n5(t.pT2), n5(t.wilcoxon.pExcess), b.modeShift.shifted ? 'yes' : 'no', n5(b.mRatio.mean)]; }))) });
    if (R.ne) T.push({ name: 'effective_size.csv', header: ['Population', 'n', 'Locus_pairs', 'Mean_r2', 'Expected_r2_sampling', 'Ne_LD', 'Ne_LD_lower', 'Ne_LD_upper', 'Het_excess_D', 'Ne_het_excess', 'Ne_het_lower', 'Ne_het_upper'],
      rows: R.ne.map(x => [x.pop, x.n, x.ld ? x.ld.nComparisons : '', x.ld ? n5(x.ld.r2) : '', x.ld ? n5(x.ld.expected) : '', x.ld ? n5(x.ld.Ne) : '', x.ld && x.ld.ci ? n5(x.ld.ci[0]) : '', x.ld && x.ld.ci ? n5(x.ld.ci[1]) : '', x.het ? n5(x.het.D) : '', x.het ? n5(x.het.Ne) : '', x.het && x.het.ci ? n5(x.het.ci[0]) : '', x.het && x.het.ci ? n5(x.het.ci[1]) : '']) });
    if (R.spatial && !R.spatial.error) { const S = R.spatial; T.push({ name: 'spatial_autocorrelation.csv', header: ['Class', `From_${S.unit}`, `To_${S.unit}`, `Mean_${S.unit}`, 'Pairs', S.codom ? 'Kinship_Fij' : 'Smouse_Peakall_r', 'Envelope_lower', 'Envelope_upper', 'P_two_tailed'],
      rows: S.classes.map((c, i) => [i + 1, n5(c.lo), n5(c.hi), n5(c.mean), c.nPairs, n5(c.value), n5(c.lo95), n5(c.hi95), n5(c.pTwo)]).concat(S.codom && S.reg ? [['b_F', n5(S.reg.slope), 'P', n5(S.bP), 'Sp', n5(S.Sp), 'Nb', n5(S.Nb), `pairs ${S.scope}`]] : []) }); }
    if (R.selfing && R.selfing.length) T.push({ name: 'selfing.csv', header: ['Population', 'n', 'Loci', 'F_IS', 'F_IS_lower', 'F_IS_upper', 'Selfing_rate', 'Selfing_lower', 'Selfing_upper'],
      rows: R.selfing.map(s => [s.pop, s.n, s.nLoci, n5(s.f), s.fCI ? n5(s.fCI[0]) : '', s.fCI ? n5(s.fCI[1]) : '', n5(s.s), s.sCI ? n5(Math.max(0, s.sCI[0])) : '', s.sCI ? n5(s.sCI[1]) : '']) });
    if (R.pst) T.push({ name: 'pst.csv', header: ['Trait', 'sigma2_between', 'sigma2_within', 'ANOVA_F', 'P', 'P_ST', 'P_ST_lower', 'P_ST_upper', 'c', 'h2'],
      rows: R.pst.rows.map(r => [r.trait, n5(r.sB), n5(r.sW), n5(r.F), n5(r.p), n5(r.Pst), n5(r.ci[0]), n5(r.ci[1]), R.pst.c, R.pst.h2]) });
    return T;
  }

  document.addEventListener('DOMContentLoaded', init);
  window.B9 = { run, tables, get result() { return R; } };
})();
