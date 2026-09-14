/* PopGeneticsPro — Block 10: self-contained HTML report, print-to-PDF and ZIP package.
   The report takes the tables and interpretations exactly as shown in the app (DOM
   snapshots) and every figure as the user left it (Fig.mounted()), drafts a methods
   paragraph with the settings actually used, and cites the software and the methods. */

(function () {
const Report = {};
let figN = 0, tabN = 0;

/* ---------- software citation (kept in sync with CITATION.cff) ---------- */
Report.CITE = {
  author: 'Barrera-Guzmán, L. Á.', year: 2026, version: '1.0.0',
  title: 'PopGeneticsPro: a browser-based platform for plant population genetics with codominant, dominant, sequence and morphological data',
  doi: null, url: 'https://github.com/luisangelbg/PopGeneticsPro', repo: 'https://github.com/luisangelbg/PopGeneticsPro', online: 'https://luisangelbg.github.io/PopGeneticsPro/',
};
Report.citation = () => { const c = Report.CITE; return `${c.author} (${c.year}). ${c.title} (Version ${c.version}) [Computer software]. ${c.doi ? 'Zenodo. https://doi.org/' + c.doi : c.url}`; };
Report.citeSection = () => {
  const c = Report.CITE;
  return `<h2 id="cite">How to cite</h2><div class="methods"><p>If this analysis is published, please cite the software and the original method papers named in the Methods section:</p>` +
    `<p class="cite">${esc(c.author)} (${c.year}). <i>${esc(c.title)}</i> (Version ${c.version}) [Computer software]. ${c.doi ? `Zenodo. <a href="https://doi.org/${c.doi}">https://doi.org/${c.doi}</a>` : `<a href="${c.url}">${c.url}</a>`}</p>` +
    `<p class="hint">Source code: <a href="${c.repo}">${c.repo}</a> · online version: <a href="${c.online}">${c.online}</a> · license GPL-3.0-or-later.${c.doi ? '' : ' A version DOI will be added when the release is archived in Zenodo.'}</p>` +
    `<p class="hint">BibTeX:</p><pre>@software{barrera_guzman_popgeneticspro_${c.year},
  author  = {Barrera-Guzmán, Luis Ángel},
  title   = {${c.title}},
  year    = {${c.year}},
  version = {${c.version}},${c.doi ? `\n  doi     = {${c.doi}},` : ''}
  url     = {${c.doi ? 'https://doi.org/' + c.doi : c.url}}
}</pre></div>`;
};

/* ---------- descriptive labels for tables that have no caption in the app ---------- */
const TABLE_LABELS = {
  locusTable: 'Quality control, locus by locus', dupBox: 'Repeated and near-identical multilocus genotypes',
  divPopTable: 'Genetic diversity of every population (means over loci)', divSeTable: 'Standard errors over loci of the diversity indices', divLocusTable: 'Diversity index, locus by population', divFreqTable: 'Allele frequencies by population', divPrivateTable: 'Private alleles', divLocalTable: 'Locally common alleles',
  hweTable: 'Hardy–Weinberg tests, locus by population', fisTable: 'Inbreeding coefficient F_IS of every population', fisLocusTable: 'F_IS and null-allele diagnostic, locus by locus', nullTable: 'Estimated null allele frequencies', ldTable: 'Multilocus linkage disequilibrium (I_A and r̄_d)', ldPairTable: 'Strongest pairwise linkage disequilibrium',
  amovaTable: 'Analysis of molecular variance', fstLocusTable: 'F-statistics and differentiation estimators, locus by locus', pairTable: 'Pairwise differentiation between populations (below the diagonal) and P-values (above)',
  popDistTable: 'Genetic distance between populations', popCompareTable: 'Every population distance coefficient, pair by pair', indDistTable: 'Genetic distance between individuals', pcoaTable: 'Eigenvalues of the principal coordinates analysis', treeSupportTable: 'Bootstrap support of the groupings of the tree', ibdTable: 'Geographic and genetic distance between population pairs',
  structKTable: 'Choice of K: Ln P(D), Evanno’s ΔK, replicate similarity and Puechmaille’s estimators', structPopTable: 'Mean cluster membership by population', dapcGroupTable: 'DAPC re-assignment success by group', assignMatrixTable: 'Assignment matrix: population of origin against population of assignment', assignIndTable: 'Assignment of every individual',
  dnaSitesTable: 'Sites of the alignment', dnaHapTable: 'Haplotypes and their distribution among populations', dnaDivTable: 'Sequence diversity and neutrality tests', dnaStructTable: 'Structure among populations from sequences (G_ST, N_ST, Φ_ST)',
  btlTestTable: 'Bottleneck tests', btlLocusTable: 'Heterozygosity excess, locus by locus', neTable: 'Effective population size', spTable: 'Spatial autocorrelation by distance class', selfTable: 'Selfing rate inferred from F_IS', pstTable: 'P_ST of every trait',
};
/* ---------- analysis context appended to figure captions ---------- */
function figContext(hostId) {
  const d = state.data;
  if (hostId.startsWith('fig2')) return d ? `${d.nInd} individuals, ${d.nLoci} ${d.kind === 'dominant' ? 'bands' : 'loci'}` : '';
  if (hostId.startsWith('fig3')) return state.freq && state.freq.opts ? `polymorphism criterion ${state.freq.opts.polyCriterion === 'strict' ? 'strict' : state.freq.opts.polyCriterion + '%'}${state.freq.g ? `, rarefaction to ${state.freq.g} gene copies` : ''}` : '';
  if (hostId.startsWith('fig4')) return state.hwe ? `${state.hwe.opts.permsHWE} permutations per exact test, ${state.hwe.opts.adjust} correction` : '';
  if (hostId.startsWith('fig5')) return state.fst ? `${state.fst.opts.perms} permutations, ${state.fst.opts.boot} bootstrap replicates over loci` : '';
  if (hostId.startsWith('fig6')) return state.gd ? (state.gd.pop ? state.gd.pop.methodName : state.gd.ind.methodName) : '';
  if (hostId.startsWith('fig7')) return state.struct && state.struct.opts ? `${state.struct.opts.admixture ? 'admixture' : 'no-admixture'} model, ${state.struct.opts.burnin} + ${state.struct.opts.iters} iterations, ${state.struct.reps} replicates per K` : '';
  if (hostId.startsWith('fig8')) return state.dna ? `${state.dna.nSeq} sequences, ${state.dna.sites.nValid} sites analysed` : '';
  if (hostId.startsWith('fig9')) return state.demog ? `seed ${state.demog.opts.seed}` : '';
  return '';
}

function visible(id) { const n = el(id); if (!n) return false; if (n.style.display === 'none') return false; for (let p = n.parentElement; p && p !== document.body; p = p.parentElement) { if (p.classList.contains('step-panel')) continue; if (p.style && p.style.display === 'none') return false; } return n.textContent.trim().length > 0 || n.querySelector('svg'); }
function grab(id, cls) {
  if (!visible(id)) return '';
  const live = el(id), n = live.cloneNode(true);
  const liveSel = live.querySelectorAll('select'), liveInp = live.querySelectorAll('input[type=text]');
  n.querySelectorAll('select').forEach((s, i) => { const src = liveSel[i]; s.replaceWith(document.createTextNode(src && src.options[src.selectedIndex] ? src.options[src.selectedIndex].text : '')); });
  n.querySelectorAll('input[type=text]').forEach((s, i) => { const src = liveInp[i]; s.replaceWith(document.createTextNode(src ? src.value : '')); });
  n.querySelectorAll('button, input, details.fig-editor, .fig-tools').forEach(x => x.remove());
  const tables = [...n.querySelectorAll('table')];
  tables.forEach((t, i) => {
    tabN++;
    let cap = t.querySelector('caption');
    if (!cap) { cap = document.createElement('caption'); t.insertBefore(cap, t.firstChild); cap.innerHTML = Fig.subHTML((TABLE_LABELS[id] || 'Results') + (tables.length > 1 ? ` (${i + 1} of ${tables.length})` : '')); }
    cap.innerHTML = `<b>Table ${tabN}.</b> ${cap.innerHTML}`;
    /* a short table prints on one page with its caption; long ones may break */
    if (t.querySelectorAll('tbody tr').length <= 25) t.classList.add('nobreak');
  });
  return `<div class="${cls || ''}">${n.innerHTML}</div>`;
}
function figures(prefix) {
  const test = typeof prefix === 'function' ? prefix : a => a.hostId.startsWith(prefix);
  return Fig.mounted().filter(test).map(a => {
    figN++;
    const clone = a.svg.cloneNode(true); clone.removeAttribute('width'); clone.removeAttribute('height'); clone.setAttribute('style', 'width:100%;height:auto');
    const cap1 = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
    const sub = a.cfg && a.cfg.subtitle ? esc(cap1(String(a.cfg.subtitle).trim())) : '';
    const cap = [Fig.subHTML(a.title), sub, esc(cap1(figContext(a.hostId)))].filter(Boolean).map(s => { s = s.replace(/[.;\s]+$/, ''); return s + (/[?!]$/.test(s) ? '' : '.'); }).join(' ');
    return `<figure class="nobreak">${new XMLSerializer().serializeToString(clone)}<figcaption><b>Figure ${figN}.</b> ${cap}</figcaption></figure>`;
  }).join('');
}

/* ---------- executive summary ---------- */
const f3 = v => (v == null || !isFinite(v)) ? '—' : v.toFixed(3);
Report.summaryTiles = () => {
  const t = [];
  const sub = x => String(x).replace(Fig.SUB_RE, '$1<sub>$2</sub>');
  const tile = (l, v, s, lv) => t.push(`<div class="stat-tile${lv ? ' ' + lv : ''}"><div class="stat-label">${l}</div><div class="stat-value">${sub(v)}</div>${s ? `<div class="stat-sub">${sub(s)}</div>` : ''}</div>`);
  const d = state.data;
  if (d) tile('Data', `${d.nInd} ${UNIT()}`, `${d.nLoci} ${d.kind === 'dominant' ? 'bands' : d.kind === 'sequence' ? 'alignment' : d.kind === 'morph' ? 'traits' : 'loci'} · ${d.declaredPops ? d.nPops + ' populations' : 'no populations'} · ${d.kind}`);
  if (state.freq && state.freq.overall && state.freq.kind !== 'morph') tile('Gene diversity', 'He = ' + f3(state.freq.overall.He), `${state.freq.overall.nPoly} of ${state.freq.nLoci} polymorphic${state.freq.privateAlleles ? ' · ' + state.freq.privateAlleles.length + ' private alleles' : ''}`);
  if (state.hwe && state.hwe.codom) { const fs = state.hwe.perPop.map(p => p.f).filter(v => v != null); const m = fs.length ? fs.reduce((a, b) => a + b, 0) / fs.length : null; tile('Inbreeding', 'F_IS = ' + f3(m), m > 0.1 ? 'heterozygote deficit' : 'near random mating', m > 0.1 ? 'warn' : 'ok'); }
  if (state.fst) { const m = state.fst.multi; tile('Differentiation', 'θ = ' + f3(m.theta), `G′_ST ${f3(m.Gprime)} · D ${f3(m.D)} · ${fmtPct(Math.max(0, state.fst.amova.pct.a + state.fst.amova.pct.b), 1)} among populations`, m.pTheta != null && m.pTheta < 0.05 ? 'warn' : 'ok'); }
  if (state.gd && state.gd.ibd) tile('Isolation by distance', 'r = ' + f3(state.gd.ibd.mantelLin.r), `Mantel P = ${state.gd.ibd.mantelLin.p == null ? '—' : state.gd.ibd.mantelLin.p.toFixed(3)}`, state.gd.ibd.mantelLin.p != null && state.gd.ibd.mantelLin.p < 0.05 ? 'warn' : 'ok');
  if (state.struct && state.struct.evanno) { const E = state.struct.evanno; tile('Genetic clusters', E.bestDelta && E.bestDelta !== E.bestL ? `K = ${E.bestDelta} or ${E.bestL}` : `K = ${E.bestDelta || E.bestL}`, E.bestDelta ? (E.bestDelta !== E.bestL ? `ΔK peaks at ${E.bestDelta}, Ln P(D) at ${E.bestL}` : 'by Evanno’s ΔK and mean Ln P(D)') : 'by mean Ln P(D)'); }
  if (state.assign) tile('Self-assignment', fmtPct(state.assign.selfRate, 1), `${state.assign.migrants.length} likely migrant${state.assign.migrants.length === 1 ? '' : 's'}`);
  if (state.dna) tile('Sequences', `${state.dna.hap.nHap} haplotypes`, `Hd ${f3(state.dna.total.Hd)} · π ${state.dna.total.pi.toFixed(5)} · Tajima’s D ${f3(state.dna.total.stats.D)}`);
  if (window.DT && (DT.mcmc || DT.lsd)) {
    const age = DT.mcmc ? DT.mcmc.params.rootAge.median : DT.lsd.rootAge, ci = DT.mcmc ? DT.mcmc.params.rootAge.hpd : DT.lsd.rootCI;
    tile('Root age', (age >= 1 ? age.toFixed(1) : age.toPrecision(2)) + ' Ma', ci ? `95% ${DT.mcmc ? 'HPD' : 'CI'} ${ci[0].toPrecision(3)}–${ci[1].toPrecision(3)} · ${DT.mcmc ? 'Bayesian' : 'LSD'}` : '');
  }
  if (state.demog && state.demog.spatial && !state.demog.spatial.error) tile('Spatial structure', (state.demog.spatial.Sp != null ? 'Sp = ' + f3(state.demog.spatial.Sp) : 'r₁ = ' + f3(state.demog.spatial.meanKinFirst)), state.demog.spatial.classes[0].pTwo < 0.05 ? 'neighbours are related' : 'no fine-scale structure');
  return t.length ? `<div class="results-summary">${t.join('')}</div>` : '';
};

/* ---------- drafted results section: the interpretations the blocks already wrote ---------- */
Report.resultsText = () => {
  const ids = ['divInterpret', 'hweInterpret', 'fstInterpret', 'distInterpret', 'structInterpret', 'dapcInterpret', 'assignInterpret', 'dnaInterpret', 'dtInterpret', 'demogInterpret'];
  const parts = ids.filter(visible).map(id => { const n = el(id).cloneNode(true); n.querySelectorAll('.callout').forEach(x => x.remove()); return n.innerHTML; }).filter(s => s.trim());
  return parts.length ? `<div class="methods"><b>Draft for the results section</b> (edit freely; every number comes from the analyses above)${parts.join('')}</div>` : '';
};

/* ---------- auto-drafted methods paragraph ---------- */
Report.methodsText = () => {
  const p = [], d = state.data;
  if (!d) return '';
  const kindTxt = { codominant: 'codominant genotypes', dominant: 'dominant (presence/absence) markers', haploid: 'haploid genotypes', sequence: 'aligned DNA sequences', morph: 'morphological traits' }[d.kind] || d.kind;
  p.push(`The data set (${esc(state.fileName || 'table')}) comprised ${d.nInd} ${UNIT()}${d.declaredPops ? ` from ${d.nPops} populations${d.regions && d.regions.length ? ` grouped in ${d.regions.length} regions` : ''}` : ''} scored for ${d.nLoci} ${d.kind === 'dominant' ? 'bands' : d.kind === 'sequence' ? 'alignment' : d.kind === 'morph' ? 'traits' : 'loci'} (${kindTxt}${d.kind === 'codominant' ? `, ploidy ${d.ploidy}` : ''}). ` +
    `Data were screened for missing genotypes, monomorphic loci and repeated multilocus genotypes before analysis${state.qc ? ` (${fmtPct(state.qc.pMissing)} missing data, ${state.qc.monomorphic.length} monomorphic ${d.kind === 'dominant' ? 'bands' : 'loci'}, ${state.qc.dups.length} repeated genotypes)` : ''}.`);
  if (state.freq && state.freq.kind !== 'morph') {
    const o = state.freq.opts;
    p.push(`Genetic diversity was described per population by the number of alleles (Na), effective number of alleles (Ne = 1/Σp²), Shannon's information index (I), observed and expected heterozygosity (Ho, He; Nei 1973) and unbiased He (Nei 1978), the fixation index F = (He − Ho)/He, the polymorphic information content (Botstein et al. 1980), the percentage of polymorphic loci (${o.polyCriterion === 'strict' ? 'any second allele' : o.polyCriterion + '% criterion'})${state.freq.g ? `, and allelic richness rarefied to ${state.freq.g} gene copies (Hurlbert 1971; El Mousadik & Petit 1996)` : ''}; private and locally common alleles were listed${o.boot ? `, and 95% intervals were obtained by ${o.boot} bootstrap replicates over loci` : ''}.` +
      (d.kind === 'dominant' ? ` For dominant markers allele frequencies were estimated from the frequency of the null phenotype with ${o.domMethod === 'sqrt' ? 'the square-root method assuming Hardy–Weinberg equilibrium' : o.domMethod === 'lynch' ? 'the Taylor-expansion estimator of Lynch & Milligan (1994)' : `a Bayesian posterior mean with uniform prior and F = ${o.domF} (after Zhivotovsky 1999)`}.` : '') +
      (d.kind === 'sequence' || d.kind === 'haploid' ? ' Haplotype diversity followed Nei (1987).' : ''));
  }
  if (state.freq && state.freq.kind === 'morph') p.push(`Phenotypic diversity was described per population with Shannon's index computed on ${state.freq.classes} classes of half a standard deviation per trait and standardised by ln(number of classes).`);
  if (state.hwe) {
    const o = state.hwe.opts;
    if (state.hwe.codom) p.push(`Departures from Hardy–Weinberg equilibrium were tested per locus and population with an exact test conditional on allele counts (Guo & Thompson 1992; ${o.permsHWE} Monte Carlo permutations of gene copies), with one-sided versions for heterozygote deficit and excess (Rousset & Raymond 1995) and a chi-square test for comparison; P-values were corrected for multiple testing by ${{ holm: "Holm's sequential Bonferroni", bonferroni: 'Bonferroni', bh: 'the Benjamini–Hochberg false discovery rate', by: 'the Benjamini–Yekutieli false discovery rate', none: 'no correction' }[o.adjust]} and combined across loci and populations with Fisher's method. ` +
      `Inbreeding coefficients were estimated as Weir & Cockerham's (1984) f, multilocus as ratios of summed variance components with jackknife standard errors and 1 000 bootstrap replicates over loci, and as Nei & Chesser's (1983) F_IS; the equilibrium selfing rate was derived as s = 2F/(1 + F). Null allele frequencies were estimated with the EM algorithm of Dempster et al. (1977; Chapuis & Estoup 2007)${o.missingAsNull ? ', treating non-amplifying genotypes as null homozygotes' : ''}, and with the estimators of Brookfield (1996) and Chakraborty et al. (1992).`);
    if (state.hwe.ld) p.push(`Multilocus linkage disequilibrium was measured with the index of association and its standardised form r̄_d (Agapow & Burt 2001; ${o.permsLD} permutations of loci among individuals), and between locus pairs by pairwise r̄_d${state.ldPairs && state.ldPairs.pairs.some(x => x.r2 != null) ? ' and, for biallelic pairs, r² and D′ from haplotype frequencies estimated by expectation–maximisation (Excoffier & Slatkin 1995)' : ''}.`);
  }
  if (state.fst) {
    const o = state.fst.opts, A = state.fst.amova;
    p.push(`Population differentiation was estimated with Weir & Cockerham's (1984) θ${state.fst.codom ? ', f and F' : ' (haploid form, Weir 1996)'}, Nei's (1973) G_ST with the sample-size corrections of Nei & Chesser (1983), Hedrick's (2005) G′_ST and Jost's (2008) D${o.excludeLoci && o.excludeLoci.size ? `, after excluding ${o.excludeLoci.size} ${o.excludeLoci.size === 1 ? 'locus' : 'loci'} flagged for null alleles` : ''}; multilocus θ used ratios of summed variance components, multilocus G_ST, G′_ST and D were computed from the mean H_S and H_T over loci, and 95% intervals came from ${o.boot} bootstrap replicates over loci. ` +
      `The distribution of molecular variance among ${A.hier ? 'regions, populations within regions' : 'populations'}${A.withinInd ? ', individuals within populations and within individuals' : ' and within populations'} was analysed by AMOVA (Excoffier, Smouse & Quattro 1992) on ${A.withinInd ? 'the number of allelic differences between gene copies' : state.fst.kind === 'dominant' ? 'the number of differing bands between individuals' : 'haplotype identity between sequences'}, with ${A.B} permutations of the appropriate units for each Φ statistic, and pairwise ${state.fst.codom ? 'θ' : 'Φ_' + (A.phiName || 'PT')} between populations was tested with ${o.permsPair} permutations (Holm-corrected). Nm was derived from θ under Wright's island model as an indicative value only.`);
  }
  if (state.gd) {
    const G = state.gd, o = G.opts;
    const unitW = u => ({ sites: 'alignment sites', bands: 'bands', loci: 'loci' }[u] || 'loci');
    const indBoot = !G.trees && G.indTrees && G.indTrees.boot;
    p.push(`${G.pop ? `Genetic distances between populations were computed as the ${G.pop.methodName}; ` : ''}distances between ${G.kind === 'morph' ? 'plants' : UNIT()} used the ${G.ind.methodName}. ` +
      `Relationships were displayed by principal coordinates analysis (Gower 1966${G.ind.squared ? ', on the squared distances as they are' : ''}${o.lingoes ? ', with the Lingoes correction for negative eigenvalues' : ''})` +
      (G.trees ? ` and by neighbour-joining (Saitou & Nei 1987) and UPGMA trees of populations${G.trees.boot ? `, with node support from ${G.trees.boot} bootstrap resamplings of the ${unitW(G.trees.bootUnit)} (Felsenstein 1985)` : ''}` : '') +
      (indBoot ? ` and by neighbour-joining (Saitou & Nei 1987) and UPGMA trees of the ${G.kind === 'morph' ? 'plants' : UNIT()}, with node support from ${G.indTrees.boot} bootstrap resamplings of the ${unitW(G.indTrees.bootUnit)} (Felsenstein 1985)` : '') + '.' +
      (G.ibd ? ` Isolation by distance was tested by the Mantel test (${o.mantelPerms} permutations) between genetic and geographic (great-circle) distances, and by the regression of F_ST/(1 − F_ST) on the logarithm of distance (Rousset 1997).` : G.mantelInd ? ` Isolation by distance was tested at the individual level with the Mantel test (${o.mantelPerms} permutations).` : ''));
  }
  if (state.struct && state.struct.evanno) {
    const St = state.struct, o = St.opts;
    p.push(`Genetic clusters were inferred with the Bayesian clustering model of Pritchard, Stephens & Donnelly (2000; ${o.admixture ? 'admixture' : 'no-admixture'} model with independent allele frequencies) implemented in PopGeneticsPro: for K = ${St.Kmin} to ${St.Kmax}, ${St.reps} independent runs of ${o.burnin.toLocaleString()} burn-in and ${o.iters.toLocaleString()} sampled iterations each${d.kind !== 'codominant' ? ', treating each band as a haploid locus' : ''}. Replicates were aligned by permutation of cluster labels (Jakobsson & Rosenberg 2007) and their similarity H′ reported; the number of clusters was assessed with Ln P(D), Evanno's ΔK (Evanno et al. 2005)${St.puech ? ' and the MedMeaK/MaxMeaK/MedMedK/MaxMedK estimators of Puechmaille (2016)' : ''}.`);
  }
  if (state.dapc) { const D = state.dapc; p.push(`A discriminant analysis of principal components (Jombart et al. 2010) was run on ${D.nPCA} principal components of the allele frequencies${D.findClusters ? `, with groups identified by k-means clustering (K chosen by BIC, K = ${D.findClusters.bestK})` : ', using the sampled populations as groups'}${D.lda && D.lda.loo && D.lda.loo.success != null ? `; re-assignment success was ${(D.lda.success * 100).toFixed(1)}% and ${(D.lda.loo.success * 100).toFixed(1)}% under leave-one-out cross-validation` : ''}.`); }
  if (state.assign) { const A = state.assign; p.push(`Individuals were assigned to populations by the likelihood of their multilocus genotype using ${A.method === 'rannala' ? "Rannala & Mountain's (1997) Bayesian" : "Paetkau et al.'s (1995) frequency"} method with leave-one-out${A.sims ? `, and first-generation migrants were detected with a Monte Carlo test based on Paetkau et al. (2004) (statistic L_home/L_max; ${A.sims} genotypes simulated per population and scored against bootstrap resamples of it; α = ${A.alpha})` : ''}.`); }
  if (state.dna) {
    const N = state.dna, o = N.opts;
    p.push(`Sequences were analysed after complete deletion of sites with gaps or ambiguous bases. Haplotype diversity (Hd) and nucleotide diversity (π) followed Nei (1987), θ_W Watterson (1975); neutrality was tested with Tajima's D (1989), Fu's Fs (1997), Fu & Li's D* and F* (1993) and R₂ (Ramos-Onsins & Rozas 2002), with P-values from ${o.sims} coalescent simulations (Hudson 1990) with θ = θ_W. The mismatch distribution was compared with the sudden-expansion model of Rogers & Harpending (1992), and its raggedness index (Harpending 1994) was tested against the same coalescent simulations of a population of constant size. ` +
      (N.pp ? `Phylogeographic structure was assessed by comparing N_ST with G_ST (Pons & Petit 1996; ${o.perms} permutations of haplotypes) and by AMOVA on nucleotide differences. ` : '') +
      `Relationships among haplotypes were displayed in a median-joining network (Bandelt, Forster & Röhl 1999; ε = 0).`);
  }
  if (window.DT && DT.methodsText) { const t = DT.methodsText(); if (t) p.push(t); }
  if (state.demog) {
    const D = state.demog, o = D.opts, s = [];
    if (D.bottleneck) s.push(`recent bottlenecks were tested by the heterozygosity-excess method of Cornuet & Luikart (1996) under the ${o.models.map(m => m.toUpperCase()).join(', ').replace(/, ([^,]+)$/, ' and $1')} mutation model${o.models.length > 1 ? 's' : ''}${o.models.includes('tpm') ? ` (TPM with ${(o.pSingle * 100).toFixed(0)}% single-step mutations and variance ${o.sigma2})` : ''}, obtaining the equilibrium heterozygosity by ${o.accept} coalescent simulations per locus conditioned on the observed number of alleles (for n(2 − F) independent gene copies when F_IS > 0), and evaluated with the sign and standardized-differences tests and with a Wilcoxon signed-rank test on the normal scores of each locus within its equilibrium distribution (Piry et al. 1999), together with the mode-shift indicator (Luikart et al. 1998) and the M-ratio (Garza & Williamson 2001)`);
    if (D.ne) s.push(`effective population size was estimated by the linkage-disequilibrium method (Hill 1981) with the bias corrections of Waples (2006) and the composite disequilibrium of Weir (1979), excluding alleles below ${o.pcrit}, with jackknife confidence limits over loci, and by the heterozygote-excess method (Pudovkin et al. 1996)`);
    if (D.spatial && !D.spatial.error) s.push(`fine-scale spatial genetic structure was analysed with ${D.spatial.codom ? "Loiselle et al.'s (1995) kinship coefficient" : "Smouse & Peakall's (1999) autocorrelation coefficient"} using ${D.spatial.scope === 'within' ? `pairs of individuals from the same population (${D.spatial.nGroups} populations combined)` : 'all pairs of individuals'}, over ${D.spatial.classes.length} distance classes with equal numbers of pairs, a 95% envelope from ${D.spatial.perms} permutations of individuals among locations${D.spatial.scope === 'within' ? ' within populations' : ''}${D.spatial.codom ? ', and the Sp statistic of Vekemans & Hardy (2004)' : ''}`);
    if (D.pst) s.push(`P_ST was computed per trait as cσ²_B/(cσ²_B + 2h²σ²_W) with c/h² = ${(o.c / o.h2).toFixed(2)} (Brommer 2011; Leinonen et al. 2013), with exact confidence limits from the F distribution of the one-way ANOVA (Searle, Casella & McCulloch 1992)`);
    if (s.length) p.push(s.join('; ').replace(/^./, c => c.toUpperCase()) + '.');
  }
  p.push(`All computations were carried out in PopGeneticsPro version ${Report.CITE.version} (${Report.CITE.author.replace(/,.*/, '')}, ${Report.CITE.year}; ${Report.CITE.doi ? 'https://doi.org/' + Report.CITE.doi : Report.CITE.url}), a browser-based platform for plant population genetics; every stochastic procedure used a fixed random seed reported in the settings of each block.`);
  return p.join(' ');
};

/* ---------- appendices ---------- */
function genotypeTable() {
  const d = state.data; if (!d) return '';
  tabN++;
  const header = ['Individual', 'Population'].concat(d.kind === 'morph' ? d.traits.vars.map(v => v.name) : d.loci.map(l => l.name));
  const rows = d.ind.map((v, i) => [v.id, v.pop || ''].concat(d.kind === 'morph' ? d.traits.values[i].map(x => x == null ? '' : x) : d.geno[i].map(g => g ? g.join('/') : '')));
  return `<div class="table-scroll"><table><caption><b>Table ${tabN}.</b> Data as analysed (${rows.length} individuals)</caption><thead><tr>${header.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(x => `<td>${esc(String(x))}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}

const CSS = `
body{font-family:sans-serif;color:#14262b;background:#fff;max-width:1100px;margin:0 auto;padding:28px 36px;line-height:1.5;font-size:14px}
h1{font-size:1.9rem;letter-spacing:-.5px;margin:0 0 4px}h2{font-size:1.35rem;margin:34px 0 8px;padding-bottom:4px;border-bottom:2px solid #146b7a}h3{font-size:1.05rem;margin:18px 0 6px}h4{font-size:.78rem;margin:14px 0 6px;text-transform:uppercase;letter-spacing:.06em;color:#5d7379}
.meta{color:#5d7379;margin-bottom:22px}.meta b{color:#14262b}
table{border-collapse:collapse;width:100%;font-size:12.5px;margin:8px 0 14px}caption{caption-side:top;text-align:left;padding:6px 0;font-weight:600;font-size:12.5px}
th{background:#e8eff1;text-align:left;padding:6px 9px;border-bottom:1px solid #d8e3e6}td{padding:5px 9px;border-bottom:1px solid #eee;vertical-align:top}td.num,th.num{text-align:right;font-variant-numeric:tabular-nums}tr.dim td{color:#888}tr.total td{font-weight:700;border-top:2px solid #bccdd2}
.table-scroll{overflow-x:auto}
.results-summary{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin:12px 0}.stat-tile{background:#f0f5f6;border-radius:8px;padding:9px 12px}.stat-label{font-size:.68rem;color:#5d7379;text-transform:uppercase;letter-spacing:.05em;font-weight:600}.stat-value{font-size:1.15rem;font-weight:700}.stat-sub{font-size:.72rem;color:#5d7379}
.stat-tile.ok{box-shadow:inset 3px 0 0 #2f9e44}.stat-tile.warn{box-shadow:inset 3px 0 0 #d98a1c}.stat-tile.bad{box-shadow:inset 3px 0 0 #c93a2c}
.messages .msg,.msg{padding:8px 12px;border-radius:8px;font-size:.86rem;margin-bottom:6px;border:1px solid #d8e3e6}.msg-error{background:#fbeceb}.msg-warning{background:#fdf3e4}.msg-success{background:#eaf6ec}.msg-info{background:#e8f1f3}
.callout{border-left:3px solid #146b7a;background:#f0f5f6;padding:8px 12px;border-radius:0 8px 8px 0;margin:10px 0;font-size:.88rem}.callout.warn{border-left-color:#d98a1c}.callout.crit{border-left-color:#c93a2c}.callout.tip{border-left-color:#2f8fb8}
.cap-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:8px}.cap{display:flex;gap:10px;border:1px solid #d8e3e6;border-radius:9px;padding:8px 11px}.cap.off{opacity:.6}.cap-mark{font-weight:800}.cap-name{font-weight:600;font-size:.88rem}.cap-block{font-size:.64rem;text-transform:uppercase;color:#5d7379;margin-left:4px}.cap-sub{font-size:.78rem;color:#5d7379}
.pill{display:inline-block;font-size:.68rem;padding:1px 7px;border-radius:999px;background:#e8eff1;color:#555}.geno-het{color:#d9603f}.geno-miss{color:#999}.geno-cell{font-family:monospace;font-size:.8rem}.hint{color:#5d7379;font-size:.84rem}
figure{margin:16px 0;page-break-inside:avoid}figcaption{font-size:.84rem;color:#444;margin-top:4px}
.cite{padding-left:2em;text-indent:-2em}pre{background:#f0f5f6;border-radius:8px;padding:10px 12px;font-size:12px;overflow-x:auto}
.methods{background:#fbfdfd;border:1px solid #d8e3e6;border-radius:10px;padding:14px 18px;font-size:.92rem}.methods p{margin:8px 0}.toc{columns:2;font-size:.9rem}.toc li{margin-bottom:2px}.notes{white-space:pre-wrap}
.toc{list-style:none;padding-left:0}
@media print{body{padding:0;max-width:none;font-size:12px}h2,h3,h4{page-break-after:avoid;break-after:avoid}table{font-size:11px}a{color:inherit;text-decoration:none}.nobreak,.results-summary,.stat-tile,.callout{page-break-inside:avoid;break-inside:avoid}figure svg{max-height:4.4in}pre{white-space:pre-wrap;word-break:break-word;overflow:visible}.table-scroll{overflow:visible}}`;

/* ---------- build ---------- */
Report.SECTIONS = [
  { key: 'data', title: 'Data and quality control', ready: () => !!state.data, body: () => grab('qcTiles', 'results-summary') + grab('qcMessages', 'messages') + grab('locusTable', 'table-scroll') + grab('dupBox', 'table-scroll') + figures('fig2') + '<h4>Analyses available with these data</h4>' + grab('capGrid', 'cap-grid') },
  { key: 'div', title: 'Allele frequencies and genetic diversity', ready: () => !!state.freq, body: () => grab('divTiles', 'results-summary') + grab('divInterpret') + grab('divPopTable', 'table-scroll') + grab('divSeTable', 'table-scroll') + grab('divLocusTable', 'table-scroll') + grab('divPrivateTable', 'table-scroll') + grab('divLocalTable', 'table-scroll') + figures('fig3') },
  { key: 'hwe', title: 'Hardy–Weinberg equilibrium, inbreeding, null alleles and linkage', ready: () => !!state.hwe, body: () => grab('hweTiles', 'results-summary') + grab('hweInterpret') + grab('hweTable', 'table-scroll') + grab('fisTable', 'table-scroll') + grab('fisLocusTable', 'table-scroll') + grab('nullTable', 'table-scroll') + grab('ldTable', 'table-scroll') + grab('ldPairTable', 'table-scroll') + figures('fig4') },
  { key: 'fst', title: 'Differentiation and AMOVA', ready: () => !!state.fst, body: () => grab('fstTiles', 'results-summary') + grab('fstInterpret') + grab('amovaTable', 'table-scroll') + grab('amovaNote', 'hint') + grab('fstLocusTable', 'table-scroll') + grab('fstLocusNote', 'hint') + grab('pairTable', 'table-scroll') + grab('pairNote', 'hint') + figures('fig5') },
  { key: 'dist', title: 'Genetic distances, ordination and trees', ready: () => !!state.gd, body: () => grab('distTiles', 'results-summary') + grab('distInterpret') + grab('popDistTable', 'table-scroll') + grab('popCompareTable', 'table-scroll') + grab('indDistNote', 'hint') + grab('pcoaTable', 'table-scroll') + grab('treeSupportTable', 'table-scroll') + grab('ibdNote', 'hint') + grab('ibdTable', 'table-scroll') + figures('fig6') },
  { key: 'struct', title: 'Bayesian clustering, DAPC and assignment', ready: () => !!(state.struct && state.struct.evanno) || !!state.dapc || !!state.assign, body: () => grab('structInterpret') + grab('structKTable', 'table-scroll') + grab('structPopTable', 'table-scroll') + figures(a => /^fig7(LnPD|DeltaK|Puech|Bar)/.test(a.hostId)) + grab('dapcInterpret') + grab('dapcGroupTable', 'table-scroll') + figures(a => /^fig7(Bic|DapcScatter|Compo)/.test(a.hostId)) + grab('assignInterpret') + grab('assignMatrixTable', 'table-scroll') + figures(a => /^fig7(AssignHeat|Lod)/.test(a.hostId)) + grab('assignIndTable', 'table-scroll') },
  { key: 'dna', title: 'DNA sequences and haplotypes', ready: () => !!state.dna, body: () => grab('dnaTiles', 'results-summary') + grab('dnaInterpret') + grab('dnaSitesTable', 'table-scroll') + grab('dnaHapTable', 'table-scroll') + grab('dnaDivTable', 'table-scroll') + grab('dnaDivNote', 'hint') + grab('dnaStructTable', 'table-scroll') + grab('dnaStructNote', 'hint') + figures(a => a.hostId.startsWith('fig8') && !/^fig8(TimeTree|Trace|Calib)/.test(a.hostId)) },
  { key: 'dating', title: 'Divergence times', ready: () => !!(window.DT && (DT.lsd || DT.mcmc)), body: () => grab('dtTiles', 'results-summary') + grab('dtInterpret') + figures(a => /^fig8TimeTree/.test(a.hostId)) + grab('dtNodeTable', 'table-scroll') + grab('dtModelTable', 'table-scroll') + grab('dtEssTable', 'table-scroll') + figures(a => /^fig8(Trace|Calib)/.test(a.hostId)) },
  { key: 'demog', title: 'Demographic history and spatial structure', ready: () => !!state.demog, body: () => grab('demogTiles', 'results-summary') + grab('demogInterpret') + grab('btlTestTable', 'table-scroll') + grab('btlLocusTable', 'table-scroll') + grab('neTable', 'table-scroll') + grab('spNote', 'hint') + grab('spTable', 'table-scroll') + grab('selfTable', 'table-scroll') + grab('pstTable', 'table-scroll') + figures('fig9') },
];

Report.build = o => {
  figN = 0; tabN = 0;
  const S = [];
  Report.SECTIONS.forEach(s => { if (o.sections[s.key] && s.ready()) { const body = s.body(); if (body && body.replace(/<div class="[^"]*"><\/div>/g, '').replace(/<h4>[^<]*<\/h4>/g, '').trim()) S.push({ title: s.title, body }); } });
  const summary = o.summary !== false ? (() => { const t = Report.summaryTiles(), r = o.draft !== false ? Report.resultsText() : ''; return t || r ? `<h2 id="summary">Summary</h2>${t}${r}` : ''; })() : '';
  /* symbols such as F_ST get real subscripts in the report; the plain-text copy keeps them as typed */
  const methods = o.methods ? `<h2 id="methods">Methods</h2><div class="methods"><p>${Report.methodsText().replace(Fig.SUB_RE, '$1<sub>$2</sub>')}</p></div>` : '';
  const cite = o.cite !== false ? Report.citeSection() : '';
  const appendix = o.rawdata ? '<h2 id="appA">Appendix · Data as analysed</h2>' + genotypeTable() : '';
  const toc = (summary ? '<li><a href="#summary">Summary</a></li>' : '') + S.map((s, i) => `<li><a href="#s${i + 1}">${i + 1}. ${esc(s.title)}</a></li>`).join('') + (methods ? '<li><a href="#methods">Methods</a></li>' : '') + (cite ? '<li><a href="#cite">How to cite</a></li>' : '') + (appendix ? '<li><a href="#appA">Appendix</a></li>' : '');
  const date = new Date().toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' });
  const d = state.data;
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>${esc(o.title)}</title><style>${CSS}</style></head><body>
<h1>${esc(o.title)}</h1>
<div class="meta">${o.author ? `<b>${esc(o.author)}</b> · ` : ''}${date}${state.fileName ? ` · data: <b>${esc(state.fileName)}</b>` : ''}${d ? ` · ${d.nInd} ${UNIT()}, ${d.nLoci} ${d.kind === 'dominant' ? 'bands' : d.kind === 'sequence' ? 'alignment' : d.kind === 'morph' ? 'traits' : 'loci'}${d.declaredPops ? `, ${d.nPops} populations` : ''}` : ''}</div>
${o.notes ? `<p class="notes">${esc(o.notes)}</p>` : ''}
<ul class="toc">${toc}</ul>
${summary}
${S.map((s, i) => `<h2 id="s${i + 1}">${i + 1}. ${esc(s.title)}</h2>${s.body}`).join('')}
${methods}
${cite}
${appendix}
<p class="hint" style="margin-top:40px">Generated by PopGeneticsPro ${Report.CITE.version} on ${new Date().toISOString().slice(0, 19).replace('T', ' ')}. Figures are embedded as vector graphics and print at full resolution.</p>
</body></html>`;
};

/* ---------- ZIP package ---------- */
Report.zip = async (o, html) => {
  const files = [{ name: 'report.html', data: html }];
  const scale = +o.zipRes || 4, dpi = scale * 75;
  const d = state.data;
  const f5 = v => (v == null || !isFinite(v)) ? '' : Number(v).toFixed(5);
  if (d) {
    const header = ['Individual', 'Population', 'Region', 'Latitude', 'Longitude'].concat(d.kind === 'morph' ? d.traits.vars.map(v => v.name) : [].concat(...d.loci.map(l => (d.kind === 'codominant' ? Array.from({ length: d.ploidy }, () => l.name) : [l.name]))));
    const rows = d.ind.map((v, i) => [v.id, v.pop || '', v.region || '', v.lat == null ? '' : v.lat, v.lon == null ? '' : v.lon].concat(d.kind === 'morph' ? d.traits.values[i].map(x => x == null ? '' : x) : [].concat(...d.geno[i].map(g => (d.kind === 'codominant' ? (g ? g : Array.from({ length: d.ploidy }, () => '')) : [g ? g[0] : ''])))));
    files.push({ name: 'data/data_as_analysed.csv', data: matrixToCSV(header, rows) });
  }
  if (state.freq && state.freq.freqRows) {
    const F = state.freq;
    files.push({ name: 'tables/allele_frequencies.csv', data: matrixToCSV(['Locus', 'Allele'].concat(F.popNames, ['Pooled']), F.freqRows.map(r => [r.locus, r.allele].concat(F.popNames.map((_, i) => f5(r['p' + i] || 0)), [f5(r.overall)]))) });
    const keys = ['n', 'Na', 'NaF5', 'Ne', 'I', 'Ho', 'He', 'uHe', 'F', 'PIC', 'Ar', 'P', 'private'];
    files.push({ name: 'tables/diversity_summary.csv', data: matrixToCSV(['Population'].concat(keys), F.popSummary.concat([Object.assign({}, F.overall, { pop: 'Pooled', private: F.privateAlleles.length })]).map(r => [r.pop].concat(keys.map(k => f5(r[k]))))) });
  }
  if (state.hwe && state.hwe.codom) {
    const H = state.hwe, rows = [];
    H.cells.forEach((row, p) => row.forEach((c, l) => rows.push([H.pops[p], H.locusNames[l], c.n, c.k, f5(c.Ho), f5(c.FisNC), f5(c.pExact), f5(c.pAdj), f5(c.pDeficit), f5(c.nullEM)])));
    files.push({ name: 'tables/hwe_fis_null.csv', data: matrixToCSV(['Population', 'Locus', 'N', 'Alleles', 'Ho', 'Fis', 'P_exact', 'P_adjusted', 'P_deficit', 'null_EM'], rows) });
  }
  if (state.fst) {
    const F = state.fst;
    files.push({ name: 'tables/fstatistics_by_locus.csv', data: matrixToCSV(['Locus', 'Hs', 'Ht', 'Gst', 'Gprime_st', 'Jost_D', 'theta', 'f', 'F'], F.perLocus.concat([Object.assign({ locus: 'Multilocus' }, F.multi)]).map(x => [x.locus, f5(x.Hs), f5(x.Ht), f5(x.Gst), f5(x.Gprime), f5(x.D), f5(x.theta), f5(x.f), f5(x.F)])) });
    files.push({ name: 'tables/pairwise_differentiation.csv', data: matrixToCSV(['Pop_A', 'Pop_B', 'theta', 'P_theta_Holm', 'Phi', 'P_Phi_Holm', 'Gst', 'Gprime_st', 'Jost_D', 'Nm'], F.pairs.map(p => [p.popA, p.popB, f5(p.theta), f5(p.pThetaAdj), f5(p.phi), f5(p.pPhiAdj), f5(p.Gst), f5(p.Gprime), f5(p.D), f5(p.Nm)])) });
  }
  if (state.gd) {
    const G = state.gd;
    if (G.pop) files.push({ name: 'tables/population_distances.csv', data: matrixToCSV([''].concat(G.pop.names), G.pop.names.map((nm, i) => [nm].concat(G.pop.D[i].map(v => f5(v))))) });
    files.push({ name: 'tables/individual_distances.csv', data: matrixToCSV([''].concat(G.ind.labels), G.ind.labels.map((nm, i) => [nm].concat(G.ind.D[i].map(v => f5(v))))) });
    files.push({ name: 'tables/pcoa_scores.csv', data: matrixToCSV([UNIT(false, true)].concat(Array.from({ length: G.pcoaInd.nAxes }, (_, k) => 'PCo' + (k + 1))), G.ind.labels.map((nm, i) => [nm].concat(G.pcoaInd.scores[i].map(v => f5(v))))) });
    if (G.trees) { const lab = i => G.pop.names[i]; if (G.trees.nj) files.push({ name: 'trees/populations_NJ.nwk', data: B6.toNewick(G.trees.nj, lab) + '\n' }); files.push({ name: 'trees/populations_UPGMA.nwk', data: B6.toNewick(G.trees.upgma, lab) + '\n' }); }
    if (G.indTrees && G.indTrees.boot) { const lab = i => G.ind.labels[i]; if (G.indTrees.nj) files.push({ name: 'trees/' + UNIT() + '_NJ.nwk', data: B6.toNewick(G.indTrees.nj, lab) + '\n' }); files.push({ name: 'trees/' + UNIT() + '_UPGMA.nwk', data: B6.toNewick(G.indTrees.upgma, lab) + '\n' }); }
  }
  if (state.struct && state.struct.consensus) {
    const St = state.struct;
    St.Ks.forEach(K => { const Q = St.consensus[K].Q; files.push({ name: `tables/structure_Q_K${K}.csv`, data: matrixToCSV(['Individual', 'Population'].concat(Array.from({ length: K }, (_, k) => 'Q' + (k + 1))), d.ind.map((v, i) => [v.id, v.pop || ''].concat(Q[i].map(q => q.toFixed(4))))) }); });
    files.push({ name: 'tables/structure_K_choice.csv', data: matrixToCSV(['K', 'runs', 'mean_LnPD', 'sd_LnPD', 'deltaK', 'Hprime'], St.evanno.rows.map(r => [r.K, r.n, f5(r.meanL), f5(r.sdL), f5(r.deltaK), f5(St.consensus[r.K] ? St.consensus[r.K].Hprime : null)])) });
  }
  if (state.assign) files.push({ name: 'tables/assignment.csv', data: matrixToCSV(['Individual', 'Sampled_in', 'Assigned_to', 'ln_Lhome_over_Lmax', 'P_migrant'], state.assign.rows.map(r => [r.id, r.homeName, r.bestName, f5(r.lambda), f5(r.pMigrant)])) });
  if (state.dna) { const N = state.dna; files.push({ name: 'tables/haplotypes.csv', data: matrixToCSV(['Haplotype', 'N'].concat(N.popNames), N.hapTable.map(h => [h.hap, h.total].concat(h.byPop))) }); files.push({ name: 'data/haplotypes.fasta', data: N.hap.hapSeq.map((s, h) => `>H${h + 1} n=${N.hapTable[h].total}\n${d.seqs.aln[N.hap.hapIndex.indexOf(h)].replace(/(.{60})/g, '$1\n')}`).join('\n') + '\n' }); }
  if (state.demog && window.B9 && B9.tables) B9.tables().forEach(t => files.push({ name: 'tables/' + t.name, data: matrixToCSV(t.header, t.rows) }));
  if (window.DT && (DT.lsd || DT.mcmc) && DT.files) DT.files().forEach(f => files.push({ name: (/\.csv$/.test(f.name) ? 'tables/' : /\.log$/.test(f.name) ? 'dating/' : 'trees/') + f.name, data: f.data }));
  files.push({ name: 'methods.txt', data: Report.methodsText().replace(/<[^>]+>/g, '').replace(/&amp;/g, '&') });
  const figs = Fig.mounted(); const used = new Set();
  for (const f of figs) {
    let nm = f.fileName; let q = 2; while (used.has(nm)) nm = f.fileName + '_' + q++; used.add(nm);
    files.push({ name: `figures/svg/${nm}.svg`, data: Fig.serialize(f.svg) });
    if (o.zipFmt !== 'svg') { try { const blob = await Fig.toRaster(f.svg, { format: o.zipFmt, scale, dpi, background: '#ffffff' }); files.push({ name: `figures/${o.zipFmt}/${nm}.${o.zipFmt === 'tiff' ? 'tif' : o.zipFmt}`, data: blob }); } catch (e) { console.error(e); } }
  }
  files.push({ name: 'README.txt', data: `${o.title}\n\nGenerated by PopGeneticsPro ${Report.CITE.version} on ${new Date().toISOString()}\nReport: report.html (open in any browser; print to PDF from the browser)\nData: data/ (as analysed; haplotypes as FASTA when sequences were loaded)\nTables: tables/ (CSV) · Trees: trees/ (Newick; NEXUS for dated trees)${window.DT && DT.mcmc ? ' · MCMC log: dating/' : ''}\nFigures: figures/svg (vector)${o.zipFmt !== 'svg' ? ` and figures/${o.zipFmt} (${dpi} dpi)` : ''}\nMethods paragraph: methods.txt\n` });
  return Zip.build(files);
};
window.Report = Report;
})();
