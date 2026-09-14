/* PopGeneticsPro — Block 1: the home page.
   Builds every card, gallery and illustration of the landing page and wires
   the navigation. Content lives here, not in the HTML, so the map of the app
   is one editable list. */

(function () {

  /* ---------------- the ten blocks ---------------- */
  const BLOCKS = [
    { n: 2, key: 'data', t: 'Data & quality control', d: 'Bring in a spreadsheet (.xlsx, .csv), .str, .gen or .arp genotype files, FASTA or VCF, paste your data into the built-in sheet, or design a ready-to-fill template from your sampling plan. Declare populations, regions and coordinates; screen missing data, monomorphic loci, clones and scoring errors.', tag: 'import · QC', art: 'importArt' },
    { n: 3, key: 'div', t: 'Allele frequencies & diversity', d: 'Na, Ne, Ho, He, uHe, Shannon I, PIC, private and locally common alleles, allelic richness by rarefaction, and the fixation index F for every locus and population.', tag: 'diversity', art: 'diversity' },
    { n: 4, key: 'hwe', t: 'Hardy–Weinberg & linkage', d: 'Chi-square and exact HWE tests, F_IS with bootstrap intervals, null-allele estimation, pairwise linkage disequilibrium (r², D′, r_d) and multiple-testing correction.', tag: 'equilibrium', art: 'hwe' },
    { n: 5, key: 'fst', t: 'Differentiation & AMOVA', d: 'Nei’s G_ST, Weir & Cockerham’s θ, Hedrick’s G′_ST, Jost’s D, Φ_PT for dominant and haploid data, hierarchical AMOVA with permutations, pairwise matrices and gene flow.', tag: 'structure', art: 'amova' },
    { n: 6, key: 'dist', t: 'Genetic distance & ordination', d: 'Nei 1972/1978, Cavalli-Sforza, Reynolds, Rogers, Jaccard and Dice; PCoA, NJ and UPGMA trees with bootstrap support — circular or rectangular, with coloured clades, rings and images of the OTUs — Mantel tests and isolation by distance.', tag: 'distance', art: 'tree' },
    { n: 7, key: 'struct', t: 'Bayesian clustering & assignment', d: 'The Bayesian admixture model of Pritchard et al. (2000) run in your browser, ΔK of Evanno, replicate alignment and barplots, DAPC, and individual assignment or migrant detection.', tag: 'clustering', art: 'structure' },
    { n: 8, key: 'dna', t: 'DNA sequences & haplotypes', d: 'Haplotype and nucleotide diversity (h, π, θ_W), Tajima’s D, Fu’s Fs, mismatch distributions, N_ST vs G_ST, median-joining networks, and divergence times: fossil or rate calibration, least-squares and Bayesian relaxed-clock dating on the geological time scale.', tag: 'sequences', art: 'network' },
    { n: 9, key: 'demo', t: 'Demography & spatial structure', d: 'Bottleneck tests (heterozygosity excess, M-ratio, mode shift), effective population size, spatial autocorrelation, kinship coefficients and the Sp statistic.', tag: 'history', art: 'autocorr' },
    { n: 10, key: 'report', t: 'Figures & report', d: 'Every figure is editable — colours, fonts, labels, order — and exports at up to 900 dpi in PNG, TIFF or SVG. One click builds the full report and a ZIP with tables, figures and the methods paragraph.', tag: 'publish', art: 'report' },
  ];

  /* ---------------- marker types ---------------- */
  const MARKERS = [
    { art: 'ssr', t: 'Microsatellites, SNPs, isozymes', s: 'Both alleles are visible, so heterozygotes can be counted directly. The richest data you can bring.', k: 'codominant', kc: 'codom' },
    { art: 'gel', t: 'AFLP, ISSR, RAPD', s: 'A band is present or absent and heterozygotes hide. Allele frequencies are recovered under HWE or with a Bayesian estimator.', k: 'dominant · binary', kc: 'domin' },
    { art: 'seqAln', t: 'DNA sequences, cpDNA, mtDNA', s: 'Aligned sequences become haplotypes, and haplotypes become networks, π and neutrality tests.', k: 'haploid · sequence', kc: 'seq' },
    { art: 'morph', t: 'Morphological characters', s: 'Quantitative, ordinal and binary traits, analysed alongside the markers — including P_ST (or Q_ST) versus F_ST.', k: 'phenotype', kc: 'morph' },
  ];

  /* ---------------- method gallery ---------------- */
  const METHODS = [
    { art: 'freq', fam: 'div', n: 'Allele frequencies', s: 'by locus and population' },
    { art: 'diversity', fam: 'div', n: 'Diversity indices', s: 'Na, Ne, Ho, He, uHe, I, PIC' },
    { art: 'hwe', fam: 'div', n: 'Hardy–Weinberg', s: 'chi-square and exact tests' },
    { art: 'ld', fam: 'div', n: 'Linkage disequilibrium', s: 'r², D′ and multilocus r_d' },
    { art: 'fst', fam: 'str', n: 'Pairwise differentiation', s: 'F_ST, G′_ST, Jost’s D, Φ_PT' },
    { art: 'amova', fam: 'str', n: 'Hierarchical AMOVA', s: 'regions, populations, individuals' },
    { art: 'ibd', fam: 'str', n: 'Isolation by distance', s: 'Mantel test and reduced major axis' },
    { art: 'autocorr', fam: 'str', n: 'Spatial autocorrelation', s: 'correlograms and the Sp statistic' },
    { art: 'tree', fam: 'dst', n: 'NJ and UPGMA trees', s: 'with bootstrap support' },
    { art: 'pcoa', fam: 'dst', n: 'Principal coordinates', s: 'individuals or populations' },
    { art: 'structure', fam: 'bay', n: 'Bayesian clustering', s: 'admixture MCMC and ΔK' },
    { art: 'assign', fam: 'bay', n: 'Assignment tests', s: 'and first-generation migrants' },
    { art: 'network', fam: 'dna', n: 'Haplotype networks', s: 'median-joining' },
    { art: 'tree', fam: 'dna', n: 'Divergence times', s: 'fossils, relaxed clock, 95% HPD' },
    { art: 'mismatch', fam: 'dna', n: 'Mismatch & neutrality', s: 'Tajima’s D, Fu’s Fs, R₂' },
    { art: 'bottleneck', fam: 'dem', n: 'Bottleneck detection', s: 'heterozygosity excess, M-ratio' },
    { art: 'mating', fam: 'dem', n: 'Mating system', s: 'outcrossing rate and kinship' },
    { art: 'drift', fam: 'dem', n: 'Effective population size', s: 'LD, heterozygote-excess, temporal' },
  ];

  const FAM_LABEL = { div: 'diversity', str: 'structure', dst: 'distance', bay: 'clustering', dna: 'sequences', dem: 'demography' };

  /* ---------------- what other programs do ---------------- */
  /* what the platform brings together in one workflow (no other program is named) */
  const COMPARE = [
    ['Runs in the browser, without installing anything', 1],
    ['Codominant, dominant, sequence and morphological data in one place', 1],
    ['Spreadsheet import, a built-in data sheet and ready-to-fill templates', 1],
    ['Hierarchical AMOVA with permutation tests', 1],
    ['Bayesian admixture clustering, DAPC and assignment', 1],
    ['Haplotype networks and neutrality tests', 1],
    ['Molecular dating with fossil calibrations or substitution rates', 1],
    ['Trees with coloured clades and images of the taxa', 1],
    ['Editable, journal-ready figures up to 900 dpi', 1],
    ['Reproducible report with the methods paragraph', 1],
    ['Your data never leave your computer', 1],
  ];
  const COMPARE_COLS = ['PopGeneticsPro'];

  /* ---------------- references ---------------- */
  const REFS = [
    ['Peakall, R., Smouse, P.E. & Huff, D.R. (1995)', 'Evolutionary implications of allozyme and RAPD variation in diploid populations of dioecious buffalograss <i>Buchloë dactyloides</i>. <i>Molecular Ecology</i> 4: 135–148.'],
    ['Excoffier, L., Smouse, P.E. & Quattro, J.M. (1992)', 'Analysis of molecular variance inferred from metric distances among DNA haplotypes: application to human mitochondrial DNA restriction data. <i>Genetics</i> 131: 479–491.'],
    ['Nei, M. (1973)', 'Analysis of gene diversity in subdivided populations. <i>Proceedings of the National Academy of Sciences USA</i> 70: 3321–3323.'],
    ['Nei, M. (1978)', 'Estimation of average heterozygosity and genetic distance from a small number of individuals. <i>Genetics</i> 89: 583–590.'],
    ['Weir, B.S. & Cockerham, C.C. (1984)', 'Estimating F-statistics for the analysis of population structure. <i>Evolution</i> 38: 1358–1370.'],
    ['Pritchard, J.K., Stephens, M. & Donnelly, P. (2000)', 'Inference of population structure using multilocus genotype data. <i>Genetics</i> 155: 945–959.'],
    ['Evanno, G., Regnaut, S. & Goudet, J. (2005)', 'Detecting the number of clusters of individuals using the software […]: a simulation study. <i>Molecular Ecology</i> 14: 2611–2620.'],
    ['Lynch, M. & Milligan, B.G. (1994)', 'Analysis of population genetic structure with RAPD markers. <i>Molecular Ecology</i> 3: 91–99.'],
    ['Jost, L. (2008)', 'G<sub>ST</sub> and its relatives do not measure differentiation. <i>Molecular Ecology</i> 17: 4015–4026.'],
    ['Hedrick, P.W. (2005)', 'A standardized genetic differentiation measure. <i>Evolution</i> 59: 1633–1638.'],
    ['Tajima, F. (1989)', 'Statistical method for testing the neutral mutation hypothesis by DNA polymorphism. <i>Genetics</i> 123: 585–595.'],
    ['Bandelt, H.-J., Forster, P. & Röhl, A. (1999)', 'Median-joining networks for inferring intraspecific phylogenies. <i>Molecular Biology and Evolution</i> 16: 37–48.'],
    ['Cornuet, J.-M. & Luikart, G. (1996)', 'Description and power analysis of two tests for detecting recent population bottlenecks from allele frequency data. <i>Genetics</i> 144: 2001–2014.'],
    ['Vekemans, X. & Hardy, O.J. (2004)', 'New insights from fine-scale spatial genetic structure analyses in plant populations. <i>Molecular Ecology</i> 13: 921–935.'],
    ['Ritland, K. (2002)', 'Extensions of models for the estimation of mating systems using <i>n</i> independent loci. <i>Heredity</i> 88: 221–228.'],
    ['Felsenstein, J. (1981)', 'Evolutionary trees from DNA sequences: a maximum likelihood approach. <i>Journal of Molecular Evolution</i> 17: 368–376.'],
    ['Yang, Z. (1994)', 'Maximum likelihood phylogenetic estimation from DNA sequences with variable rates over sites: approximate methods. <i>Journal of Molecular Evolution</i> 39: 306–314.'],
    ['Drummond, A.J., Ho, S.Y.W., Phillips, M.J. & Rambaut, A. (2006)', 'Relaxed phylogenetics and dating with confidence. <i>PLoS Biology</i> 4: e88.'],
    ['Gernhard, T. (2008)', 'The conditioned reconstructed process. <i>Journal of Theoretical Biology</i> 253: 769–778.'],
    ['To, T.-H., Jung, M., Lycett, S. & Gascuel, O. (2016)', 'Fast dating using least-squares criteria and algorithms. <i>Systematic Biology</i> 65: 82–97.'],
    ['Parham, J.F. et al. (2012)', 'Best practices for justifying fossil calibrations. <i>Systematic Biology</i> 61: 346–359.'],
    ['Wolfe, K.H., Li, W.-H. & Sharp, P.M. (1987)', 'Rates of nucleotide substitution vary greatly among plant mitochondrial, chloroplast, and nuclear DNAs. <i>Proceedings of the National Academy of Sciences USA</i> 84: 9054–9058.'],
    ['Kay, K.M., Whittall, J.B. & Hodges, S.A. (2006)', 'A survey of nuclear ribosomal internal transcribed spacer substitution rates across angiosperms: an approximate molecular clock with life history effects. <i>BMC Evolutionary Biology</i> 6: 36.'],
    ['Cohen, K.M., Finney, S.C., Gibbard, P.L. & Fan, J.-X. (2013, updated)', 'The ICS International Chronostratigraphic Chart. <i>Episodes</i> 36: 199–204. The app uses chart v2020/03.'],
    ['Hale, M.L., Burg, T.M. & Steeves, T.E. (2012)', 'Sampling for microsatellite-based population genetic studies: 25 to 30 individuals per population is enough to accurately estimate allele frequencies. <i>PLoS ONE</i> 7: e45170.'],
  ];

  /* ---------------- renderers ---------------- */
  function renderFeatures() {
    const g = el('featureGrid');
    if (!g) return;
    BLOCKS.forEach(b => {
      const card = mk('div', { class: 'feature' });
      card.innerHTML =
        `<div class="f-num">${b.n}</div>` +
        `<div class="f-art">${Art[b.art] ? Art[b.art]() : ''}</div>` +
        `<div class="f-tag">${b.tag}</div>` +
        `<h3>${b.t}</h3><p>${b.d}</p>`;
      card.addEventListener('click', () => {
        const btn = document.querySelector('.step-btn[data-step="' + b.n + '"]');
        if (btn && btn.disabled) {
          goStep(2);
          const m = el('dataMessages');
          if (m) { clearMessages(m); showMessage(m, 'info', 'Load your data first — every later block reads from here.'); }
        } else goStep(b.n);
      });
      g.appendChild(card);
    });
  }

  function renderMarkers() {
    const g = el('markerStrip');
    if (!g) return;
    MARKERS.forEach(m => {
      const d = mk('div', { class: 'marker' });
      d.innerHTML = (Art[m.art] ? Art[m.art]() : '') +
        `<div class="mk-t">${m.t}</div><div class="mk-s">${m.s}</div>` +
        `<span class="mk-k ${m.kc}">${m.k}</span>`;
      g.appendChild(d);
    });
  }

  function renderMethods() {
    const g = el('methodGallery');
    if (!g) return;
    METHODS.forEach(m => {
      const d = mk('div', { class: 'method-card' });
      d.innerHTML = `<span class="m-fam ${m.fam}">${FAM_LABEL[m.fam]}</span>` +
        (Art[m.art] ? Art[m.art]() : '') +
        `<div class="m-name">${m.n}</div><div class="m-sub">${m.s}</div>`;
      g.appendChild(d);
    });
  }

  function renderCompare() {
    const wrap = el('compareBody');
    if (!wrap) return;
    const mark = v => v === 1 ? '<span class="yes">●</span>' : v === 0.5 ? '<span class="part">◐</span>' : '<span class="no">○</span>';
    let html = '<table class="compare-table"><thead><tr><th>What you need</th>' +
      COMPARE_COLS.map((c, i) => `<th class="${i === 0 ? 'us' : ''}">${c}</th>`).join('') + '</tr></thead><tbody>';
    COMPARE.forEach(row => {
      html += '<tr><td>' + row[0] + '</td>' +
        row.slice(1).map((v, i) => `<td class="${i === 0 ? 'us' : ''}">${mark(v)}</td>`).join('') + '</tr>';
    });
    html += '</tbody></table>';
    wrap.innerHTML = html;
  }

  function renderRefs() {
    const g = el('refList');
    if (!g) return;
    g.innerHTML = REFS.map(r => `<li><b>${r[0]}</b> ${r[1]}</li>`).join('');
  }

  function renderArt() {
    const h = el('heroArt');
    if (h) h.innerHTML = Art.hero();
    /* small illustrations inside the theory accordion */
    const figs = { theoryHwe: 'hwe', theoryFst: 'fst', theoryDrift: 'drift', theoryMating: 'mating' };
    for (const id in figs) { const n = el(id); if (n) n.innerHTML = Art[figs[id]](); }
    /* brand mark: a tiny helix */
    const b = el('brandLogo');
    if (b) b.innerHTML = `<svg viewBox="0 0 30 30" xmlns="http://www.w3.org/2000/svg">
      <path d="M9 3 C 21 9, 9 21, 21 27" fill="none" stroke="var(--primary)" stroke-width="2.6" stroke-linecap="round"/>
      <path d="M21 3 C 9 9, 21 21, 9 27" fill="none" stroke="var(--accent)" stroke-width="2.6" stroke-linecap="round"/>
      <line x1="10.5" y1="8" x2="19.5" y2="8" stroke="var(--c3)" stroke-width="1.8" stroke-linecap="round"/>
      <line x1="10.5" y1="15" x2="19.5" y2="15" stroke="var(--c8)" stroke-width="1.8" stroke-linecap="round"/>
      <line x1="10.5" y1="22" x2="19.5" y2="22" stroke="var(--c3)" stroke-width="1.8" stroke-linecap="round"/></svg>`;
  }

  /* ---------------- navigation ---------------- */
  function wire() {
    els('.step-btn').forEach(b => b.addEventListener('click', () => { if (!b.disabled) goStep(b.dataset.step); }));
    const brand = el('brand');
    if (brand) brand.addEventListener('click', () => goStep(1));
    const scrollTo = id => { const n = el(id); if (n) n.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
    const on = (id, fn) => { const n = el(id); if (n) n.addEventListener('click', fn); };
    on('startBtn', () => goStep(2));
    on('simBtn', () => scrollTo('simulator'));
    on('theoryBtn', () => {
      scrollTo('theory');
      const first = document.querySelector('#theory .acc');
      if (first) first.open = true;
    });
    on('citeBtn', () => scrollTo('cite'));
    on('copyCite', () => {
      const t = el('citeText');
      if (t) navigator.clipboard.writeText(t.textContent.trim()).then(() => {
        const b = el('copyCite'); if (b) { b.textContent = '✓ Copied'; setTimeout(() => b.textContent = 'Copy the citation', 1800); }
      });
    });
  }

  function init() {
    renderArt();
    renderFeatures();
    renderMarkers();
    renderMethods();
    renderCompare();
    renderRefs();
    wire();
  }

  document.addEventListener('DOMContentLoaded', init);
  window.Home = { BLOCKS, METHODS, REFS };
})();
