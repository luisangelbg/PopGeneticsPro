/* PopGeneticsPro — Block 3 engine: allele frequencies and genetic diversity.

   Every formula is the published one, named where it is used:
     Na, Ne, I, Ho, He, uHe, F .................. Nei (1973, 1978)
     PIC ........................................ Botstein et al. (1980)
     rarefied allelic richness .................. Hurlbert (1971); El Mousadik & Petit (1996)
     dominant-marker allele frequencies ......... Lynch & Milligan (1994); Zhivotovsky (1999)
     haplotype diversity ........................ Nei (1987), eq. 8.4
     phenotypic Shannon diversity ............... Shannon (1948), applied as in landrace studies

   Nothing here touches the DOM: it takes state.data and returns numbers. */

(function () {

  /* ---------- small numerical helpers ---------- */
  const lgammaCache = new Map();
  function lgamma(x0) {
    /* Lanczos approximation — needed for the combinatorics of rarefaction.
       The argument is never reassigned: `arguments` is live in sloppy mode, so
       shifting x would poison the cache key and silently return wrong values. */
    const hit = lgammaCache.get(x0);
    if (hit !== undefined) return hit;
    const g = 7;
    const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
      -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
    let res;
    if (x0 < 0.5) res = Math.log(Math.PI / Math.sin(Math.PI * x0)) - lgamma(1 - x0);
    else {
      const x = x0 - 1;
      let a = c[0];
      const t = x + g + 0.5;
      for (let i = 1; i < g + 2; i++) a += c[i] / (x + i);
      res = 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
    }
    lgammaCache.set(x0, res);
    return res;
  }
  /* log of the binomial coefficient, safe for the sizes met in practice */
  function lchoose(n, k) {
    if (k < 0 || k > n || n < 0) return -Infinity;
    return lgamma(n + 1) - lgamma(k + 1) - lgamma(n - k + 1);
  }
  function mean(a) { return a.length ? a.reduce((x, y) => x + y, 0) / a.length : null; }
  function sd(a) {
    if (a.length < 2) return null;
    const m = mean(a);
    return Math.sqrt(a.reduce((x, y) => x + (y - m) * (y - m), 0) / (a.length - 1));
  }
  function se(a) { const s = sd(a); return s == null ? null : s / Math.sqrt(a.length); }
  function quantile(sorted, p) {
    if (!sorted.length) return null;
    const i = (sorted.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i);
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
  }

  /* ================================================================
     1 · ALLELE COUNTS
     ================================================================ */

  /* counts[p][l] = Map(allele -> number of gene copies), plus how many
     individuals were scored and how many were heterozygous */
  function alleleCounts(d) {
    const nP = d.pops.length, nL = d.nLoci;
    const counts = [], scored = [], het = [];
    for (let p = 0; p < nP; p++) {
      counts.push([]); scored.push([]); het.push([]);
      for (let l = 0; l < nL; l++) {
        const m = new Map();
        let ns = 0, nh = 0;
        d.pops[p].idx.forEach(i => {
          const g = d.geno[i][l];
          if (!g) return;
          ns++;
          if (d.kind === 'dominant') {
            m.set(String(g[0]), (m.get(String(g[0])) || 0) + 1);
          } else {
            g.forEach(a => m.set(String(a), (m.get(String(a)) || 0) + 1));
            if (g.length > 1 && new Set(g.map(String)).size > 1) nh++;
          }
        });
        counts[p].push(m); scored[p].push(ns); het[p].push(nh);
      }
    }
    return { counts, scored, het };
  }

  /* ================================================================
     2 · DOMINANT MARKERS: from bands to allele frequencies
     ================================================================ */

  /* x = frequency of the recessive phenotype (band absent); q = frequency of the
     null (recessive) allele. Three estimators, because none is right always. */
  function nullAlleleFreq(nAbsent, nScored, method, F) {
    if (!nScored) return null;
    const x = nAbsent / nScored;
    if (method === 'sqrt') return Math.sqrt(x);
    if (method === 'lynch') {
      /* Lynch & Milligan (1994): Taylor-expansion correction for small samples.
         q = √x · [1 + (1 − x) / (8 N x)] ; undefined when no recessive was seen */
      if (x <= 0) return 0;
      return Math.min(1, Math.sqrt(x) * (1 + (1 - x) / (8 * nScored * x)));
    }
    /* Bayesian posterior mean with a uniform prior on q, by quadrature.
       P(band absent | q) = q² + F q (1 − q), so inbreeding can be allowed for
       (Zhivotovsky 1999 uses a beta prior; the uniform case is computed here). */
    const f = F || 0;
    const n0 = nAbsent, n1 = nScored - nAbsent;
    let num = 0, den = 0;
    const steps = 400;
    for (let k = 0; k <= steps; k++) {
      const q = k / steps;
      const pAbs = Math.min(1, Math.max(0, q * q + f * q * (1 - q)));
      /* log-likelihood, guarded at the boundaries */
      const ll = (n0 ? n0 * Math.log(Math.max(pAbs, 1e-12)) : 0) +
        (n1 ? n1 * Math.log(Math.max(1 - pAbs, 1e-12)) : 0);
      const w = Math.exp(ll);
      num += q * w; den += w;
    }
    return den > 0 ? num / den : Math.sqrt(x);
  }

  /* ================================================================
     3 · THE INDICES, for one population × locus
     ================================================================ */

  function cellStats(d, counts, nScored, nHet, opts, l) {
    const kind = d.kind;
    const out = { N: nScored, nGenes: 0, Na: 0, NaF5: 0, Ne: null, I: null, Ho: null, He: null, uHe: null, F: null, PIC: null, freqs: {}, poly: false };
    if (!nScored) return out;

    if (kind === 'dominant') {
      const nBand = counts.get('1') || 0;
      const nAbs = counts.get('0') || 0;
      const q = nullAlleleFreq(nAbs, nScored, opts.domMethod, opts.domF);
      const p = 1 - q;
      out.nGenes = 2 * nScored;
      out.bandFreq = nBand / nScored;
      out.q = q; out.p = p;
      out.freqs = { '1': p, '0': q };          // p = dominant allele, q = recessive
      out.Na = (p > 0 && q > 0) ? 2 : 1;
      out.NaF5 = (p >= 0.05 ? 1 : 0) + (q >= 0.05 ? 1 : 0);
      out.He = 2 * p * q;                       // Nei's gene diversity under HWE
      out.uHe = nScored > 1 ? (2 * nScored / (2 * nScored - 1)) * out.He : out.He;
      out.Ne = out.He < 1 ? 1 / (1 - out.He) : null;
      out.I = -[p, q].filter(v => v > 0).reduce((a, v) => a + v * Math.log(v), 0);
      /* A band is polymorphic when BOTH states are present at appreciable
         frequency. The criterion must be applied to the commoner phenotype, not
         to the band frequency itself: a band absent from every plant (bandFreq
         = 0) is as monomorphic as one present in all of them. */
      out.poly = isPolymorphic(Math.max(out.bandFreq, 1 - out.bandFreq), opts);
      return out;
    }

    /* codominant, haploid and haplotype data all reduce to a frequency vector */
    let nGenes = 0;
    counts.forEach(v => { nGenes += v; });
    out.nGenes = nGenes;
    const freqs = {};
    let sumSq = 0, shannon = 0, maxFreq = 0;
    counts.forEach((v, a) => {
      const f = v / nGenes;
      freqs[a] = f;
      sumSq += f * f;
      if (f > 0) shannon -= f * Math.log(f);
      if (f > maxFreq) maxFreq = f;
      out.Na++;
      if (f >= 0.05) out.NaF5++;
    });
    out.freqs = freqs;
    out.Ne = sumSq > 0 ? 1 / sumSq : null;
    out.I = shannon;
    out.He = 1 - sumSq;
    out.poly = isPolymorphic(maxFreq, opts);

    if (kind === 'codominant') {
      out.Ho = nHet / nScored;
      out.uHe = nScored > 1 ? (2 * nScored / (2 * nScored - 1)) * out.He : out.He;
      out.F = out.He > 0 ? (out.He - out.Ho) / out.He : null;
      /* PIC — Botstein et al. (1980) */
      const f = Object.values(freqs);
      let pic = 1 - sumSq;
      for (let i = 0; i < f.length; i++) for (let j = i + 1; j < f.length; j++) pic -= 2 * f[i] * f[i] * f[j] * f[j];
      out.PIC = pic;
    } else {
      /* haploid / sequence: Nei's (1987) unbiased haplotype diversity */
      out.uHe = nGenes > 1 ? (nGenes / (nGenes - 1)) * out.He : out.He;
      out.h = out.uHe;
    }
    return out;
  }

  function isPolymorphic(maxFreq, opts) {
    if (maxFreq == null) return false;
    if (opts.polyCriterion === 'strict') return maxFreq < 1;
    if (opts.polyCriterion === '99') return maxFreq <= 0.99;
    return maxFreq <= 0.95;
  }

  /* ================================================================
     4 · RAREFIED ALLELIC RICHNESS
     ================================================================ */

  /* Expected number of alleles in a sample of g gene copies drawn without
     replacement — Hurlbert (1971), applied to alleles by El Mousadik & Petit (1996). */
  function rarefy(counts, g) {
    let nGenes = 0;
    counts.forEach(v => { nGenes += v; });
    if (nGenes < g || g < 1) return null;
    let ar = 0;
    counts.forEach(ni => {
      if (ni <= 0) return;
      /* 1 − C(nGenes − ni, g) / C(nGenes, g) */
      const lc = lchoose(nGenes - ni, g) - lchoose(nGenes, g);
      ar += 1 - Math.exp(lc);
    });
    return ar;
  }

  /* ================================================================
     5 · WHOLE ANALYSIS
     ================================================================ */

  const DEFAULTS = {
    domMethod: 'lynch',      // 'sqrt' | 'lynch' | 'bayes'
    domF: 0,                 // inbreeding assumed by the Bayesian estimator
    polyCriterion: '95',     // '95' | '99' | 'strict'
    rarefyTo: null,          // gene copies; null = the smallest population
    boot: 1000,              // bootstrap replicates over loci
    seed: 1,
    level: 'pop',            // 'pop' | 'total'
  };

  function compute(d, options) {
    const opts = Object.assign({}, DEFAULTS, options || {});
    const { counts, scored, het } = alleleCounts(d);
    const nP = d.pops.length, nL = d.nLoci;

    /* --- per population × locus --- */
    const cells = [];
    for (let p = 0; p < nP; p++) {
      cells.push([]);
      for (let l = 0; l < nL; l++) cells[p].push(cellStats(d, counts[p][l], scored[p][l], het[p][l], opts, l));
    }

    /* --- rarefaction size: the smallest number of gene copies available --- */
    let minGenes = Infinity;
    for (let p = 0; p < nP; p++) for (let l = 0; l < nL; l++) {
      const n = cells[p][l].nGenes;
      if (n > 0 && n < minGenes) minGenes = n;
    }
    if (!isFinite(minGenes)) minGenes = 0;
    const g = opts.rarefyTo || minGenes;
    if (d.kind !== 'dominant') {
      for (let p = 0; p < nP; p++) for (let l = 0; l < nL; l++) cells[p][l].Ar = rarefy(counts[p][l], g);
    }

    /* --- private alleles and locally common alleles --- */
    const privateAlleles = [], localCommon = [];
    const totalCounts = [];
    for (let l = 0; l < nL; l++) {
      const inPops = new Map();     // allele -> [pop indices where present]
      const tot = new Map();
      for (let p = 0; p < nP; p++) {
        counts[p][l].forEach((v, a) => {
          if (d.kind === 'dominant' && a === '0') return;   // absence is not an allele to own
          if (v <= 0) return;
          if (!inPops.has(a)) inPops.set(a, []);
          inPops.get(a).push(p);
          tot.set(a, (tot.get(a) || 0) + v);
        });
      }
      totalCounts.push(tot);
      inPops.forEach((pops, a) => {
        if (pops.length === 1) {
          const p = pops[0];
          privateAlleles.push({ locus: d.loci[l].name, locusIndex: l, allele: a, pop: d.pops[p].name, popIndex: p, freq: cells[p][l].freqs[a] || 0, n: counts[p][l].get(a) });
        }
        /* Locally common alleles — reported at two thresholds:
           frequency ≥ 5% but confined to 25% or fewer, and to 50% or fewer,
           of the populations. Both are evidence of restricted gene flow. */
        if (nP >= 4) {
          const common = pops.filter(p => (cells[p][l].freqs[a] || 0) >= 0.05);
          const lim25 = Math.max(1, Math.round(nP * 0.25));
          const lim50 = Math.max(1, Math.round(nP * 0.5));
          if (common.length && common.length <= lim50)
            localCommon.push({
              locus: d.loci[l].name, allele: a, pops: common.map(p => d.pops[p].name),
              nPops: common.length, threshold: common.length <= lim25 ? '≤ 25%' : '≤ 50%',
            });
        }
      });
    }

    /* --- population summaries, averaged over loci, with bootstrap intervals --- */
    const KEYS = ['Na', 'NaF5', 'Ne', 'I', 'Ho', 'He', 'uHe', 'F', 'PIC', 'Ar'];
    const popSummary = [];
    const r = rng(opts.seed);
    for (let p = 0; p < nP; p++) {
      const row = { pop: d.pops[p].name, popIndex: p, n: d.pops[p].idx.length, region: d.pops[p].region };
      const meanN = mean(cells[p].map(c => c.N).filter(v => v != null));
      row.meanN = meanN;
      KEYS.forEach(k => {
        const vals = cells[p].map(c => c[k]).filter(v => v != null && isFinite(v));
        row[k] = vals.length ? mean(vals) : null;
        row['se' + k] = vals.length > 1 ? se(vals) : null;
      });
      /* percentage of polymorphic loci */
      const nPoly = cells[p].filter(c => c.poly).length;
      const nUsable = cells[p].filter(c => c.N > 0).length;
      row.P = nUsable ? nPoly / nUsable : null;
      row.nPoly = nPoly;
      row.private = privateAlleles.filter(a => a.popIndex === p).length;
      row.totalAlleles = cells[p].reduce((a, c) => a + c.Na, 0);
      if (d.kind === 'dominant') {
        row.bandsPresent = cells[p].filter(c => c.bandFreq > 0).length;
        row.pBandsPresent = nUsable ? row.bandsPresent / nUsable : null;
        row.meanBandFreq = mean(cells[p].map(c => c.bandFreq).filter(v => v != null));
      }
      /* bootstrap over loci for the headline indices */
      if (opts.boot > 0 && nL > 2) {
        const boots = { He: [], I: [], Na: [], Ne: [], Ar: [], Ho: [] };
        for (let b = 0; b < opts.boot; b++) {
          const pick = [];
          for (let l = 0; l < nL; l++) pick.push(Math.floor(r() * nL));
          for (const k in boots) {
            const vals = pick.map(l => cells[p][l][k]).filter(v => v != null && isFinite(v));
            if (vals.length) boots[k].push(mean(vals));
          }
        }
        row.ci = {};
        for (const k in boots) {
          const s = boots[k].sort((a, b2) => a - b2);
          row.ci[k] = s.length ? [quantile(s, 0.025), quantile(s, 0.975)] : null;
        }
      }
      popSummary.push(row);
    }

    /* --- the whole sample treated as one population --- */
    const pooled = [];
    for (let l = 0; l < nL; l++) {
      const m = new Map();
      let ns = 0, nh = 0;
      for (let p = 0; p < nP; p++) {
        counts[p][l].forEach((v, a) => m.set(a, (m.get(a) || 0) + v));
        ns += scored[p][l]; nh += het[p][l];
      }
      pooled.push(cellStats(d, m, ns, nh, opts, l));
      pooled[l].Ar = d.kind !== 'dominant' ? rarefy(m, g) : null;
    }
    const overall = { pop: 'All samples pooled', n: d.nInd, meanN: mean(pooled.map(c => c.N)) };
    KEYS.forEach(k => {
      const vals = pooled.map(c => c[k]).filter(v => v != null && isFinite(v));
      overall[k] = vals.length ? mean(vals) : null;
      overall['se' + k] = vals.length > 1 ? se(vals) : null;
    });
    const nPolyAll = pooled.filter(c => c.poly).length;
    overall.P = pooled.length ? nPolyAll / pooled.length : null;
    overall.nPoly = nPolyAll;
    overall.totalAlleles = pooled.reduce((a, c) => a + c.Na, 0);
    if (d.kind === 'dominant') {
      overall.bandsPresent = pooled.filter(c => c.bandFreq > 0).length;
      overall.pBandsPresent = pooled.length ? overall.bandsPresent / pooled.length : null;
      overall.meanBandFreq = mean(pooled.map(c => c.bandFreq).filter(v => v != null));
    }

    /* --- long table of allele frequencies --- */
    const freqRows = [];
    for (let l = 0; l < nL; l++) {
      const alleles = [...totalCounts[l].keys()].sort((a, b) => {
        const na = Number(a), nb = Number(b);
        return isFinite(na) && isFinite(nb) ? na - nb : String(a).localeCompare(String(b));
      });
      alleles.forEach(a => {
        const row = { locus: d.loci[l].name, allele: a };
        for (let p = 0; p < nP; p++) row['p' + p] = cells[p][l].freqs[a] != null ? cells[p][l].freqs[a] : 0;
        row.overall = pooled[l].freqs[a] != null ? pooled[l].freqs[a] : 0;
        row.nPops = d.pops.filter((_, p) => (cells[p][l].freqs[a] || 0) > 0).length;
        row.privateTo = row.nPops === 1 ? d.pops[d.pops.findIndex((_, p) => (cells[p][l].freqs[a] || 0) > 0)].name : null;
        freqRows.push(row);
      });
    }

    /* --- rarefaction curves --- */
    let rarefaction = null;
    if (d.kind !== 'dominant' && minGenes >= 4) {
      const sizes = [];
      const top = Math.max(...[].concat(...cells.map(row => row.map(c => c.nGenes))));
      for (let s = 2; s <= Math.min(top, 200); s += Math.max(1, Math.round(top / 40))) sizes.push(s);
      rarefaction = {
        sizes,
        curves: d.pops.map((pp, p) => ({
          pop: pp.name, popIndex: p,
          values: sizes.map(s => {
            const vals = [];
            for (let l = 0; l < nL; l++) { const v = rarefy(counts[p][l], s); if (v != null) vals.push(v); }
            return vals.length === nL ? mean(vals) : null;
          }),
        })),
      };
    }

    return {
      kind: d.kind, opts, g, minGenes,
      cells, popSummary, overall, pooled,
      privateAlleles, localCommon, freqRows, rarefaction,
      nPops: nP, nLoci: nL,
      popNames: d.pops.map(p => p.name),
      locusNames: d.loci.map(l => l.name),
    };
  }

  /* ================================================================
     6 · MORPHOLOGICAL DIVERSITY
     ================================================================ */

  /* Shannon's index applied to traits, the standard descriptor of phenotypic
     diversity in landrace collections: every quantitative trait is cut into
     classes of half a standard deviation around the overall mean, and H′ is
     computed from the class frequencies and standardised by ln(number of
     classes) so traits and populations are comparable. */
  function computeMorph(d, options) {
    const opts = Object.assign({ classes: 10 }, options || {});
    const vars = d.traits.vars, values = d.traits.values;
    const nP = d.pops.length;
    const perTrait = vars.map((v, j) => {
      const all = values.map(r => r[j]).filter(x => x != null && isFinite(x));
      const m = mean(all), s = sd(all) || 1;
      const quant = v.kind === 'quantitative' || v.kind === 'discrete';
      const cut = x => {
        if (!quant) return String(x);
        const k = Math.floor((x - (m - 2.5 * s)) / (0.5 * s));
        return String(Math.max(0, Math.min(opts.classes - 1, k)));
      };
      const byPop = d.pops.map(pp => {
        const vals = pp.idx.map(i => values[i][j]).filter(x => x != null && (!quant || isFinite(x)));
        const freq = new Map();
        vals.forEach(x => { const c = cut(x); freq.set(c, (freq.get(c) || 0) + 1); });
        let H = 0;
        freq.forEach(v2 => { const p = v2 / vals.length; if (p > 0) H -= p * Math.log(p); });
        const nClasses = quant ? opts.classes : freq.size;
        const nums = quant ? vals.map(Number) : [];
        return {
          pop: pp.name, n: vals.length, classes: freq.size,
          H: H, Hstd: nClasses > 1 ? H / Math.log(nClasses) : null,
          mean: quant ? mean(nums) : null, sd: quant ? sd(nums) : null,
          cv: quant && mean(nums) ? sd(nums) / Math.abs(mean(nums)) : null,
          min: quant && nums.length ? Math.min(...nums) : null,
          max: quant && nums.length ? Math.max(...nums) : null,
        };
      });
      /* overall */
      const freqAll = new Map();
      all.forEach(x => { const c = cut(x); freqAll.set(c, (freqAll.get(c) || 0) + 1); });
      let Hall = 0;
      freqAll.forEach(v2 => { const p = v2 / all.length; if (p > 0) Hall -= p * Math.log(p); });
      return {
        name: v.name, kind: v.kind, byPop,
        overall: { n: all.length, mean: m, sd: s, cv: m ? s / Math.abs(m) : null, H: Hall, Hstd: Hall / Math.log(quant ? opts.classes : freqAll.size || 2) },
      };
    });
    const popSummary = d.pops.map((pp, p) => {
      const hs = perTrait.map(t => t.byPop[p].Hstd).filter(v => v != null && isFinite(v));
      return { pop: pp.name, popIndex: p, n: pp.idx.length, Hstd: mean(hs), seHstd: se(hs), nTraits: perTrait.length };
    });
    const allH = perTrait.map(t => t.overall.Hstd).filter(v => v != null && isFinite(v));
    return { kind: 'morph', perTrait, popSummary, overall: { pop: 'All plants pooled', n: d.nInd, Hstd: mean(allH), seHstd: se(allH) }, classes: opts.classes };
  }

  window.Div = { compute, computeMorph, rarefy, nullAlleleFreq, lchoose, mean, sd, se, quantile, DEFAULTS };
})();
