/* PopGeneticsPro — Block 5: differentiation between populations and AMOVA.
   Reports every common estimator side by side, because they disagree for
   good reasons, and says which one to quote for which purpose. */

(function () {

  let R = null;

  function init() {
    if (!el('btnRunFst')) return;
    el('btnRunFst').addEventListener('click', run);
    el('pairStat').addEventListener('change', renderPairTable);
    el('btnFstCSV').addEventListener('click', downloadPerLocus);
    el('btnPairCSV').addEventListener('click', downloadPairs);
    el('btnContinue5').addEventListener('click', () => continueAfter(5, 'fstMessages'));
    document.addEventListener('stepchange', e => { if (String(e.detail.step) === '5') onEnter(); });
  }

  function onEnter() {
    const d = state.data;
    if (!d) { showMessage('fstMessages', 'error', 'Load your data in Block 2 first.'); return; }
    const hasRegions = d.regions && d.regions.length >= 2;
    el('fstHierRow').style.display = hasRegions ? '' : 'none';
    el('fstHierNote').textContent = hasRegions ? `${d.regions.length} regions were declared in Block 2: ${d.regions.map(r => r.name).join(', ')}.` : '';
    const susp = state.hwe && state.hwe.perLocus ? state.hwe.perLocus.filter(l => l.suspectNull) : [];
    el('fstExcludeRow').style.display = susp.length ? '' : 'none';
    el('fstExcludeNote').textContent = susp.length ? `Flagged in Block 4: ${susp.map(l => l.locus).join(', ')}.` : '';
    if (!state.fst) run();
  }

  function settings() {
    const d = state.data;
    let excludeLoci = null;
    if (el('fstExclude').checked && state.hwe && state.hwe.perLocus) {
      excludeLoci = new Set();
      state.hwe.perLocus.forEach((l, i) => { if (l.suspectNull) { const li = d.loci.findIndex(x => x.name === l.locus); if (li >= 0) excludeLoci.add(li); } });
    }
    return {
      perms: Number(el('fstPerms').value) || 0,
      permsPair: Number(el('fstPairPerms').value) || 0,
      boot: Number(el('fstBoot').value) || 0,
      hierarchical: el('fstHier').checked,
      excludeLoci,
      seed: Number(el('fstSeed').value) || 1,
    };
  }

  function run() {
    const d = state.data;
    if (!d) return;
    clearMessages('fstMessages');
    const btn = el('btnRunFst');
    btn.disabled = true; btn.textContent = 'Computing…';
    const t0 = performance.now();
    setTimeout(() => {
      try {
        R = Fst.compute(d, settings());
        state.fst = R;
        render(d);
        el('fstResults').style.display = '';
        el('fstTiming').textContent = `computed in ${((performance.now() - t0) / 1000).toFixed(1)} s · seed ${R.opts.seed}` + (R.opts.excludeLoci && R.opts.excludeLoci.size ? ` · ${R.opts.excludeLoci.size} ${R.opts.excludeLoci.size === 1 ? 'locus' : 'loci'} excluded` : '');
      } catch (e) {
        console.error(e);
        showMessage('fstMessages', 'error', 'The analysis failed: ' + esc(e.message));
      } finally { btn.disabled = false; btn.textContent = 'Compute differentiation'; }
    }, 30);
  }

  /* ================================================================ */
  function render(d) {
    /* menu labels follow the marker type (a <select> cannot hold subscripts) */
    const menuLabel = { theta: R.codom ? 'θ (FST)' : R.kind === 'dominant' ? 'θB' : 'θ (haploid)', phi: `Φ${R.amova.phiName} (AMOVA)`, Gst: 'GST', Gprime: 'G′ST', D: 'Jost D', Nm: 'Nm' };
    [...el('pairStat').options].forEach(o => { if (menuLabel[o.value]) o.textContent = menuLabel[o.value]; });
    renderTiles(d);
    renderInterpretation(d);
    renderGlobalTable(d);
    renderAmova(d);
    renderPairTable();
    drawFigures(d);
  }

  const f3 = v => (v == null || !isFinite(v)) ? '—' : v.toFixed(3);
  const ciTxt = k => R.ci[k] ? `${f3(R.ci[k][0])} to ${f3(R.ci[k][1])}` : '—';
  const pTxt = p => p == null ? '—' : p < 0.001 ? '< 0.001' : p.toFixed(3);

  /* names of the statistics, which depend on the marker type: θ is F_ST for
     genotypes, θ_B for band phenotypes (Φ_PT in the AMOVA), plain haploid θ for
     haplotypes (Φ_ST in the AMOVA) */
  function names() {
    const dom = R.kind === 'dominant';
    return {
      theta: R.codom ? 'θ (F<sub>ST</sub>)' : dom ? 'θ<sub>B</sub>' : 'θ',
      thetaPlain: R.codom ? 'θ (F_ST)' : dom ? 'θ_B' : 'θ (haploid)',
      phi: `Φ<sub>${R.amova.phiName}</sub>`,
      phiPlain: `Φ_${R.amova.phiName} (AMOVA)`,
      Gst: 'G<sub>ST</sub>', Gprime: 'G′<sub>ST</sub>', D: 'Jost’s D', Nm: 'Nm',
    };
  }

  function renderTiles(d) {
    const m = R.multi, A = R.amova, N = names();
    const tiles = [
      [N.thetaPlain, f3(m.theta), R.ci.theta ? `95% CI ${ciTxt('theta')}` : 'no interval with a single locus', null],
      ["G′_ST", f3(m.Gprime), 'Hedrick’s standardised G_ST'],
      ['Jost D', f3(m.D), 'from the mean H_S and H_T'],
      [N.phiPlain, f3(A.phi.PhiST), A.p.ST != null ? `P = ${pTxt(A.p.ST)}` : '', A.p.ST != null && A.p.ST < 0.05 ? 'warn' : 'ok'],
      ['Among populations', fmtPct(Math.max(0, A.pct.a + A.pct.b), 1), 'of the molecular variance'],
    ];
    if (A.hier) tiles.push(['Among regions', fmtPct(Math.max(0, A.pct.a), 1), `Φ_CT = ${f3(A.phi.PhiCT)}, P = ${pTxt(A.p.CT)}`, A.p.CT != null && A.p.CT < 0.05 ? 'warn' : 'ok']);
    if (m.Nm != null) tiles.push(['Nm (indicative)', m.Nm > 50 ? '> 50' : m.Nm.toFixed(2), 'migrants per generation, island model']);
    statTiles('fstTiles', tiles);
  }

  function wrightClass(v) {
    if (v == null) return '';
    if (v < 0.05) return 'little differentiation by Wright’s rule of thumb (< 0.05)';
    if (v < 0.15) return 'moderate differentiation (0.05–0.15)';
    if (v < 0.25) return 'great differentiation (0.15–0.25)';
    return 'very great differentiation (> 0.25)';
  }

  function renderInterpretation(d) {
    const m = R.multi, A = R.amova, parts = [], N = names();
    const haplo = !R.codom && R.kind !== 'dominant';
    const stName = R.codom ? 'F<sub>ST</sub> (Weir &amp; Cockerham’s θ)'
      : R.kind === 'dominant' ? 'θ<sub>B</sub> (Weir &amp; Cockerham’s estimator for haploid units, applied to band phenotypes)'
        : 'θ (Weir &amp; Cockerham’s estimator for haploid data, on haplotype frequencies)';
    const nL = R.nLoci === 1 ? (haplo ? 'one alignment' : 'one locus') : `${R.nLoci} ${R.kind === 'dominant' ? 'bands' : 'loci'}`;
    const pct = fmtPct(Math.max(0, A.pct.a + A.pct.b), 1);
    parts.push(`<p>Across ${nL} and ${R.popNames.length} populations, ${stName} is <b>${f3(m.theta)}</b>` +
      (R.ci.theta ? ` (95% bootstrap interval ${ciTxt('theta')})` : '') +
      (m.pTheta != null ? `, ${m.pTheta < 0.05 ? 'significantly greater than zero' : 'not distinguishable from zero'} by permutation (P = ${pTxt(m.pTheta)})` : '') +
      ` — ${wrightClass(m.theta)}. The AMOVA agrees: <b>${pct}</b> of the molecular variance lies among populations and ` +
      `<b>${fmtPct(Math.max(0, 1 - A.pct.a - A.pct.b), 1)}</b> within them${A.p.ST != null ? ` (P = ${pTxt(A.p.ST)})` : ''}. ` +
      (haplo
        ? `Organelle haplotypes are inherited through one parent and have a smaller effective size than nuclear genes, so they are expected to be more differentiated than nuclear markers from the same populations, most of all when they travel only in seeds.</p>`
        : `Outcrossing plants usually keep most of their nuclear variation, often three quarters or more, within populations; selfing species and those with restricted seed and pollen dispersal place much more among them (Nybom 2004).</p>`));

    /* estimator disagreement */
    if (m.Gst != null && m.D != null && m.Hs != null) {
      if (m.Hs > 0.5 && m.D > 1.8 * Math.max(m.Gst, 0.001))
        parts.push(`<p><b>Read D and G′<sub>ST</sub>, not only G<sub>ST</sub>.</b> Within-population diversity is high (H<sub>S</sub> = ${f3(m.Hs)}), so G<sub>ST</sub> = ${f3(m.Gst)} is capped far below 1 and understates how distinct the gene pools are; ` +
          `Hedrick’s G′<sub>ST</sub> = ${f3(m.Gprime)} and Jost’s D = ${f3(m.D)} correct for that ceiling. Quote θ for the demographic reading (gene flow, N<sub>e</sub>m), and D or G′<sub>ST</sub> for how different the allele pools actually are.</p>`);
      else
        parts.push(`<p>With H<sub>S</sub> = ${f3(m.Hs)}, the ceiling on G<sub>ST</sub> is not biting (G<sub>ST</sub> = ${f3(m.Gst)}, G′<sub>ST</sub> = ${f3(m.Gprime)}, D = ${f3(m.D)}). θ is the estimator to report, with D alongside for comparison with other studies.</p>`);
    }

    /* hierarchy */
    if (A.hier) {
      const sigCT = A.p.CT != null && A.p.CT < 0.05, sigSC = A.p.SC != null && A.p.SC < 0.05;
      const coarse = A.arrangements != null && A.arrangements < 20;
      const lead = sigCT ? 'The regional level matters' : coarse ? 'The regional level cannot be tested with so few populations' : 'The regional level does not add structure';
      parts.push(`<p><b>${lead}</b>: Φ<sub>CT</sub> = ${f3(A.phi.PhiCT)} (${fmtPct(Math.max(0, A.pct.a), 1)} of the variance, P = ${pTxt(A.p.CT)}), while populations within regions account for ${fmtPct(Math.max(0, A.pct.b), 1)} (Φ<sub>SC</sub> = ${f3(A.phi.PhiSC)}, P = ${pTxt(A.p.SC)}). ` +
        (coarse ? `With ${A.P} populations there ${A.arrangements === 1 ? 'is only one way' : `are only ${A.arrangements} distinct ways`} to share them among these regions, so the Φ<sub>CT</sub> test can never give a P below about ${(1 / A.arrangements).toFixed(2)}; judge the regional level by the size of its component. ` : '') +
        (sigCT && A.pct.a > A.pct.b ? 'The regions you declared capture more of the structure than the populations nested inside them — the grouping is real.'
          : sigCT ? 'The regions differ, but populations within the same region differ even more: both levels carry structure.'
            : A.pct.a > A.pct.b ? 'The regional component is the larger of the two, which suggests the grouping is meaningful even if it cannot be shown significant here.'
              : sigSC ? 'Populations differ, but grouping them into these regions explains little: try a grouping suggested by the data (Block 7) rather than by geography.'
                : 'Neither level is strong; the species behaves close to one large population at this scale.') + `</p>`);
    }
    if (A.withinInd && A.phi.PhiIS != null)
      parts.push(`<p>Within populations, Φ<sub>IS</sub> = ${f3(A.phi.PhiIS)} (P = ${pTxt(A.p.IS)}) is the AMOVA’s inbreeding coefficient. It equals Weir &amp; Cockerham’s f for all populations together (${f3(m.f)}, table below), the pooled counterpart of the per-population values of Block 4.</p>`);

    /* pairs */
    if (R.pairs.length) {
      const key = R.codom ? 'theta' : 'phi', pk = R.codom ? 'pThetaAdj' : 'pPhiAdj';
      const sorted = R.pairs.slice().sort((a, b) => (b[key] || 0) - (a[key] || 0));
      const hi = sorted[0], lo = sorted[sorted.length - 1];
      const sig = R.pairs.filter(p => p[pk] != null && p[pk] < 0.05).length;
      const nPairs = R.pairs.length;
      parts.push(`<p>${nPairs === 1 ? 'The only population pair is' : `Of ${nPairs} population pairs, <b>${sig === nPairs ? 'all ' + sig : sig}</b> ${sig === 1 ? 'is' : 'are'}`} ${nPairs === 1 ? (sig ? 'significantly differentiated' : 'not significantly differentiated') : 'significantly differentiated'} after Holm’s correction.` +
        (nPairs > 1 ? ` The most distinct pair is <b>${esc(hi.popA)} × ${esc(hi.popB)}</b> (${N[key]} = ${f3(hi[key])}${hi.Nm != null ? `, Nm ≈ ${hi.Nm > 50 ? '> 50' : hi.Nm.toFixed(1)}` : ''}); the least, <b>${esc(lo.popA)} × ${esc(lo.popB)}</b> (${f3(lo[key])}).` : '') +
        ` Nm is Wright’s island-model conversion and assumes equilibrium, so treat it as an order of magnitude: below 1 migrant per generation, drift wins and populations diverge.` +
        (R.opts.permsPair > 0 && R.opts.permsPair < 1000 ? ` With ${R.opts.permsPair} permutations per pair the smallest possible P is ${(1 / (R.opts.permsPair + 1)).toFixed(3)} before correction.` : '') + `</p>`);
    }
    if (R.opts.excludeLoci && R.opts.excludeLoci.size) {
      const k = R.opts.excludeLoci.size;
      parts.push(`<p class="callout tip"><b>${k === 1 ? 'One locus flagged for null alleles was' : k + ' loci flagged for null alleles were'} left out.</b> Null alleles inflate F<sub>ST</sub> (Chapuis &amp; Estoup 2007); compare with the run that includes them by unticking the box above.</p>`);
    }
    el('fstInterpret').innerHTML = parts.join('');
  }

  function renderGlobalTable(d) {
    const cols = [
      { key: 'locus', label: 'Locus' },
      { key: 'k', label: 'Alleles', num: true },
    ];
    const N = names();
    if (R.codom) cols.push({ key: 'Ho', label: 'H<sub>O</sub>', num: true, fmt: f3 });
    cols.push({ key: 'Hs', label: 'H<sub>S</sub>', num: true, fmt: f3 });
    cols.push({ key: 'Ht', label: 'H<sub>T</sub>', num: true, fmt: f3 });
    cols.push({ key: 'Gst', label: N.Gst, num: true, fmt: f3 });
    cols.push({ key: 'Gprime', label: N.Gprime, num: true, fmt: f3 });
    cols.push({ key: 'D', label: 'Jost D', num: true, fmt: f3 });
    cols.push({ key: 'theta', label: N.theta, num: true, fmt: f3 });
    if (R.codom) { cols.push({ key: 'f', label: 'f (F<sub>IS</sub>)', num: true, fmt: f3 }); cols.push({ key: 'F', label: 'F (F<sub>IT</sub>)', num: true, fmt: f3 }); }
    const rows = R.perLocus.slice();
    rows.push(Object.assign({ locus: 'Multilocus', _class: 'total', k: null }, R.multi));
    rows.push({ locus: '95% CI (bootstrap over loci)', _class: 'dim', Gst: null, Gprime: null, D: null, theta: null, f: null, F: null, ciRow: true });
    const ciCols = cols.map(c => Object.assign({}, c, {
      get: r => r.ciRow ? (['Gst', 'Gprime', 'D', 'theta', 'f', 'F'].includes(c.key) ? ciTxt(c.key) : (c.key === 'locus' ? r.locus : '')) : (c.get ? c.get(r) : r[c.key]),
      fmt: c.fmt ? (v => (typeof v === 'string' ? v : c.fmt(v))) : null,
    }));
    buildTable('fstLocusTable', ciCols, rows);
    const se = Object.keys(R.seJack).filter(k => R.seJack[k] != null).map(k => `${k === 'f' ? 'f' : k === 'F' ? 'F' : N[k] || k} ± ${R.seJack[k].toFixed(3)}`).join(' · ');
    const unit = R.codom ? '' : R.kind === 'dominant'
      ? 'Band phenotypes: each plant is one haploid unit, and H<sub>S</sub>, H<sub>T</sub> are computed on band frequencies. '
      : 'Haplotypes: each sequence is one haploid unit, and H<sub>S</sub>, H<sub>T</sub> are haplotype diversities. ';
    el('fstLocusNote').innerHTML = unit +
      `Multilocus θ${R.codom ? ', f and F are ratios' : ' is a ratio'} of variance components summed over loci; G<sub>ST</sub>, G′<sub>ST</sub> and D come from the mean H<sub>S</sub> and H<sub>T</sub>, so the three are directly comparable. ` +
      (R.nLoci > 1 ? `Averaging the per-locus D instead gives ${f3(R.multi.Dmean)} (arithmetic mean)` + (R.multi.Dharm != null ? ` or ${f3(R.multi.Dharm)} (harmonic mean, which is pulled towards the least differentiated locus)` : '; the harmonic mean is undefined because some per-locus D are ≤ 0') + '; if you compare with a study that averaged per locus, quote the same kind of mean. ' : '') +
      (se ? `Jackknife SE over loci: ${se}.` : '');
  }

  function renderAmova(d) {
    const A = R.amova;
    const rows = [];
    const f2 = v => v == null ? '—' : v.toFixed(3);
    if (A.hier) rows.push({ src: 'Among regions', df: A.df.ag, SS: A.SSag, MS: A.df.ag ? A.SSag / A.df.ag : null, var: A.sa, pct: A.pct.a, phi: 'Φ_CT = ' + f2(A.phi.PhiCT), p: A.p.CT });
    rows.push({ src: A.hier ? 'Among populations within regions' : 'Among populations', df: A.df.ap, SS: A.SSap, MS: A.df.ap ? A.SSap / A.df.ap : null, var: A.sb, pct: A.pct.b, phi: A.hier ? 'Φ_SC = ' + f2(A.phi.PhiSC) : `Φ_${A.phiName} = ` + f2(A.phi.PhiST), p: A.hier ? A.p.SC : A.p.ST });
    if (A.withinInd) {
      rows.push({ src: 'Among individuals within populations', df: A.df.ai, SS: A.SSai, MS: A.df.ai ? A.SSai / A.df.ai : null, var: A.sc, pct: A.pct.c, phi: 'Φ_IS = ' + f2(A.phi.PhiIS), p: A.p.IS });
      rows.push({ src: 'Within individuals', df: A.df.wi, SS: A.SSwi, MS: A.df.wi ? A.SSwi / A.df.wi : null, var: A.sd, pct: A.pct.d, phi: 'Φ_IT = ' + f2(A.phi.PhiIT), p: null });
    } else rows.push({ src: 'Within populations', df: A.df.ai, SS: A.SSai, MS: A.df.ai ? A.SSai / A.df.ai : null, var: A.sc, pct: A.pct.c, phi: '', p: null });
    rows.push({ src: 'Total', _class: 'total', df: A.df.tot, SS: A.SStot, MS: null, var: A.total, pct: 1, phi: A.hier ? `Φ_${A.phiName} = ` + f2(A.phi.PhiST) : '', p: A.hier ? A.p.ST : null });
    rows.forEach(r => { r.phi = r.phi.replace(/Φ_([A-Z]{2})/, 'Φ<sub>$1</sub>'); });
    buildTable('amovaTable', [
      { key: 'src', label: 'Source of variation' },
      { key: 'df', label: 'd.f.', num: true },
      { key: 'SS', label: 'Sum of squares', num: true, fmt: v => v.toFixed(3) },
      { key: 'MS', label: 'Mean square', num: true, fmt: v => v.toFixed(4) },
      { key: 'var', label: 'Variance component', num: true, fmt: v => v.toFixed(4) },
      { key: 'pct', label: '% of total', num: true, fmt: v => (v * 100).toFixed(2) },
      { key: 'phi', label: 'Φ statistic', html: true, get: r => r.phi },
      { key: 'p', label: 'P (permutation)', num: true, html: true, get: r => r.p == null ? '' : (r.p < 0.05 ? `<b class="geno-het">${fmtP(r.p)}</b>` : fmtP(r.p)) },
    ], rows);
    const haplo = !A.withinInd && R.kind !== 'dominant';
    const same = A.hier ? 'without the regional level, ' : '';
    el('amovaNote').innerHTML = `${A.N} individuals in ${A.P} populations${A.hier ? ` and ${A.G} regions` : ''}, ${A.loci} ${R.kind === 'dominant' ? (A.loci === 1 ? 'band' : 'bands') : (A.loci === 1 ? 'locus' : 'loci')}, ${A.B} permutations. ` +
      (A.withinInd ? `Distances between gene copies count the loci at which the two alleles differ (the F<sub>ST</sub>-type AMOVA of Excoffier et al. 1992); ${same}Φ<sub>ST</sub>, Φ<sub>IS</sub> and Φ<sub>IT</sub> equal Weir &amp; Cockerham’s θ, f and F. `
        : haplo ? `Two sequences are at distance 1 if they carry different haplotypes and 0 otherwise; ${same}Φ<sub>ST</sub> equals the haploid θ. The version that weighs how many mutations separate the haplotypes is Φ<sub>ST</sub> in Block 8. `
          : `Distances between individuals count the bands at which they differ, the Φ<sub>PT</sub> AMOVA of Peakall, Smouse &amp; Huff (1995); ${same}it equals θ<sub>B</sub>. `) +
      'Components are computed locus by locus and summed, so missing genotypes only drop out of the loci where they occur. A negative component means less variation than expected at that level and is read as zero.' +
      (A.hier ? ` Φ<sub>${A.phiName}</sub> in the total row is the among-population fraction including the regional level.` : '') +
      (A.hier && A.arrangements != null && A.arrangements < 100 ? ` <b>Note on Φ<sub>CT</sub>:</b> its test permutes whole populations among regions, and ${A.P} populations can be shared among these regions in only ${A.arrangements} distinct ${A.arrangements === 1 ? 'way' : 'ways'}, so its P can never fall below about ${(1 / A.arrangements).toFixed(A.arrangements < 10 ? 2 : 3)} — read the size of the component rather than its P.` : '');
  }

  function renderPairTable() {
    if (!R) return;
    const stat = el('pairStat').value;
    const n = R.popNames.length;
    const look = new Map(); R.pairs.forEach(p => { look.set(p.a + ':' + p.b, p); look.set(p.b + ':' + p.a, p); });
    const pKey = stat === 'phi' ? 'pPhiAdj' : 'pThetaAdj';
    const cols = [{ key: 'name', label: '' }];
    R.popNames.forEach((nm, j) => cols.push({
      key: 'c' + j, label: esc(nm), num: true, html: true,
      get: r => {
        if (r.i === j) return '<span class="geno-miss">—</span>';
        const p = look.get(r.i + ':' + j);
        if (!p) return '';
        if (r.i > j) { const v = p[stat]; return v == null ? '—' : (stat === 'Nm' ? (v > 50 ? '> 50' : v.toFixed(2)) : v.toFixed(3)); }
        const pv = p[pKey];
        return pv == null ? '' : `<span class="${pv < 0.05 ? 'geno-het' : 'geno-miss'}">${pv < 0.001 ? '< 0.001' : pv.toFixed(3)}</span>`;
      },
    }));
    const rows = R.popNames.map((nm, i) => ({ name: nm, i }));
    buildTable('pairTable', cols, rows);
    const N = names();
    el('pairNote').innerHTML = `Below the diagonal: <b>${stat === 'phi' ? N.phi : N[stat] || stat}</b>. Above: P-value of the permutation test (${R.opts.permsPair} permutations of individuals between the two populations, Holm-corrected over ${R.pairs.length} ${R.pairs.length === 1 ? 'pair' : 'pairs'})` +
      (stat === 'phi' ? ` for ${N.phi}.` : ` for ${N.theta}.`) + (stat === 'Nm' ? ` Nm = (1 − θ)/(${R.nmK}θ), ${R.nmK === 4 ? 'the island model for nuclear genes of a diploid' : 'the island model for a haploid genome'}; indicative only.` : '');
  }

  /* ---------- figures ---------- */
  const mount = (id, spec) => { const host = el(id); if (!host) return; try { Fig.mount(id, spec); } catch (e) { console.error(id, e); host.innerHTML = `<div class="msg msg-error">Figure could not be drawn: ${esc(e.message)}</div>`; } };
  const pal = { key: 'palette', label: 'Palette', type: 'select', options: Object.entries(Fig.paletteNames), shared: true };
  const cmapCtl = { key: 'cmap', label: 'Colour map', type: 'select', options: Object.entries(Fig.colormapNames) };

  function drawFigures(d) {
    mount('fig5Amova', {
      title: 'AMOVA: where the molecular variance sits', fileName: 'amova', width: 820, height: 256 + (R.amova.hier ? 26 : 0) + (R.amova.withinInd ? 26 : 0),
      defaults: { palette: 'cluster', title: 'Partition of molecular variance' },
      controls: [{ key: 'title', label: 'Title', type: 'text' }, pal],
      render: cfg => P5.amovaBar(cfg, R.amova),
    });
    const N = names();
    const plain = s => s.replace(/_/g, '');
    const statOpts = [['theta', plain(N.thetaPlain)], ['phi', plain(N.phiPlain)], ['Gst', 'GST'], ['Gprime', 'G′ST'], ['D', 'Jost D'], ['Nm', 'Nm']];
    mount('fig5Pair', {
      /* a few populations do not need a page-sized matrix */
      title: 'Pairwise differentiation', fileName: 'pairwise_fst', width: 820, height: Math.max(360, Math.min(620, 190 + R.popNames.length * 80)),
      defaults: { palette: 'cluster', cmap: 'heat', stat: 'theta', upper: 'p', title: 'Pairwise differentiation between populations' },
      controls: [{ key: 'title', label: 'Title', type: 'text' }, { key: 'stat', label: 'Statistic', type: 'select', options: statOpts }, { key: 'upper', label: 'Above the diagonal', type: 'select', options: [['p', 'P-values'], ['none', 'nothing']] }, cmapCtl, pal],
      render: cfg => P5.pairHeat(cfg, R),
    });
    mount('fig5Locus', {
      title: 'Differentiation locus by locus', fileName: 'fst_by_locus', width: 860, height: 460,
      defaults: { palette: 'cluster', stat: 'theta', sort: 'file', values: true, showCI: true, title: 'Which loci carry the differentiation' },
      controls: [{ key: 'title', label: 'Title', type: 'text' }, { key: 'stat', label: 'Statistic', type: 'select', options: [['theta', plain(N.thetaPlain)], ['Gst', 'GST'], ['Gprime', 'G′ST'], ['D', 'Jost D']] }, { key: 'sort', label: 'Order', type: 'select', options: [['file', 'as in the file'], ['value', 'by value']] }, { key: 'showCI', label: 'Shade the multilocus 95% CI', type: 'checkbox' }, { key: 'values', label: 'Show values', type: 'checkbox' }, pal],
      render: cfg => P5.locusBars(cfg, R),
    });
    el('fig5Ladder').style.display = R.pairs.length >= 2 ? '' : 'none';
    if (R.pairs.length >= 2) mount('fig5Ladder', {
      title: 'Four estimators, pair by pair', fileName: 'differentiation_ladder', width: 880, height: 480,
      defaults: { palette: 'cluster', sort: 'value', maxPairs: 20, title: 'G_ST, G′_ST, Jost D and θ for every population pair' },
      controls: [{ key: 'title', label: 'Title', type: 'text' }, { key: 'sort', label: 'Order', type: 'select', options: [['value', 'by Jost D'], ['file', 'as in the file']] }, { key: 'maxPairs', label: 'Pairs shown', type: 'range', min: 3, max: 45, step: 1 }, pal],
      render: cfg => P5.ladder(cfg, R),
    });
  }

  /* ---------- downloads ---------- */
  const f5 = v => (v == null || !isFinite(v)) ? '' : Number(v).toFixed(5);
  function downloadPerLocus() {
    if (!R) return;
    const header = ['Locus', 'Alleles', 'Ho', 'Hs', 'Ht', 'Gst', 'Gprime_st', 'Jost_D', 'theta', 'f', 'F'];
    const rows = R.perLocus.map(x => [x.locus, x.k, f5(x.Ho), f5(x.Hs), f5(x.Ht), f5(x.Gst), f5(x.Gprime), f5(x.D), f5(x.theta), f5(x.f), f5(x.F)]);
    rows.push(['Multilocus', '', f5(R.multi.Ho), f5(R.multi.Hs), f5(R.multi.Ht), f5(R.multi.Gst), f5(R.multi.Gprime), f5(R.multi.D), f5(R.multi.theta), f5(R.multi.f), f5(R.multi.F)]);
    download(matrixToCSV(header, rows), slug(state.fileName) + '_fstatistics.csv', 'text/csv;charset=utf-8');
  }
  function downloadPairs() {
    if (!R) return;
    const header = ['Pop_A', 'Pop_B', 'theta', 'P_theta', 'P_theta_Holm', 'Phi', 'P_Phi', 'P_Phi_Holm', 'Gst', 'Gprime_st', 'Jost_D', 'Nm'];
    const rows = R.pairs.map(p => [p.popA, p.popB, f5(p.theta), f5(p.pTheta), f5(p.pThetaAdj), f5(p.phi), f5(p.pPhi), f5(p.pPhiAdj), f5(p.Gst), f5(p.Gprime), f5(p.D), f5(p.Nm)]);
    download(matrixToCSV(header, rows), slug(state.fileName) + '_pairwise_differentiation.csv', 'text/csv;charset=utf-8');
  }

  document.addEventListener('DOMContentLoaded', init);
  window.B5 = { run, get result() { return R; } };
})();
