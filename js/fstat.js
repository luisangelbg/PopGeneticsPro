/* PopGeneticsPro — Block 5 engine: population differentiation and AMOVA.

   Methods, named where they are used:
     θ, f, F ............................ Weir & Cockerham (1984), sums of a, b, c over alleles and loci;
                                          haploid version (Weir 1996) for haploid data and band phenotypes
     H_S, H_T, G_ST ..................... Nei (1973) with the sample-size corrections of Nei & Chesser (1983)
     G′_ST .............................. Hedrick (2005)
     D_est .............................. Jost (2008); multilocus from the mean H_S and H_T (harmonic and
                                          arithmetic means of the per-locus values reported alongside)
     AMOVA .............................. Excoffier, Smouse & Quattro (1992); nested designs with unequal
                                          sizes following Excoffier, Smouse and Quattro (1992); locus-by-locus components summed
                                          (so missing data are handled locus by locus); Φ_PT for dominant
                                          data as in Peakall, Smouse and Huff (1995)
     permutation tests .................. individuals among populations (Φ_ST/Φ_PT), individuals among
                                          populations within regions (Φ_SC), populations among regions
                                          (Φ_CT), gene copies among individuals within populations (Φ_IS)
     Nm ................................. Wright's island-model expectation, (1 − F_ST)/(4 F_ST), indicative

   Every Monte Carlo P-value is (b + 1)/(B + 1). */

(function () {

  /* ================================================================
     1 · ALLELE COUNTS per population × locus, from a label vector
     ================================================================ */
  /* labels[i] = population index of individual i (or -1 to skip) */
  function countTables(d, labels, nP, loci) {
    const out = loci.map(() => Array.from({ length: nP }, () => ({ counts: new Map(), n: 0, het: 0, hetBy: new Map() })));
    for (let i = 0; i < d.nInd; i++) {
      const p = labels[i];
      if (p < 0) continue;
      loci.forEach((l, li) => {
        const g = d.geno[i][l];
        if (!g) return;
        const cell = out[li][p];
        cell.n++;
        const seen = new Set();
        g.forEach(a => { const k = String(a); cell.counts.set(k, (cell.counts.get(k) || 0) + 1); seen.add(k); });
        if (seen.size > 1) { cell.het++; seen.forEach(k => cell.hetBy.set(k, (cell.hetBy.get(k) || 0) + 1)); }
      });
    }
    return out;
  }

  /* ================================================================
     2 · WEIR & COCKERHAM (1984)
     ================================================================ */
  /* cells = tables[l] for one locus: array over populations. Returns the
     summed a, b, c over alleles (diploid) or a, b (haploid). */
  function wcLocus(cells, ploidy) {
    const pops = cells.filter(c => c.n >= 2);
    const r = pops.length;
    if (r < 2) return null;
    const alleles = new Set();
    pops.forEach(c => c.counts.forEach((_, k) => alleles.add(k)));
    if (alleles.size < 2) return { a: 0, b: 0, c: 0, r };
    const n = pops.map(c => c.n);
    const nbar = n.reduce((s, v) => s + v, 0) / r;
    const sumN2 = n.reduce((s, v) => s + v * v, 0);
    const nc = (r * nbar - sumN2 / (r * nbar)) / (r - 1);
    let A = 0, Bc = 0, C = 0;
    alleles.forEach(k => {
      const p = pops.map(c => (c.counts.get(k) || 0) / (ploidy * c.n));
      const pbar = p.reduce((s, v, i) => s + n[i] * v, 0) / (r * nbar);
      const s2 = p.reduce((s, v, i) => s + n[i] * (v - pbar) * (v - pbar), 0) / ((r - 1) * nbar);
      if (ploidy === 2) {
        const h = pops.map(c => (c.hetBy.get(k) || 0) / c.n);
        const hbar = h.reduce((s, v, i) => s + n[i] * v, 0) / (r * nbar);
        A += (nbar / nc) * (s2 - (1 / (nbar - 1)) * (pbar * (1 - pbar) - ((r - 1) / r) * s2 - hbar / 4));
        Bc += (nbar / (nbar - 1)) * (pbar * (1 - pbar) - ((r - 1) / r) * s2 - ((2 * nbar - 1) / (4 * nbar)) * hbar);
        C += hbar / 2;
      } else {
        /* haploid: a among populations, b within (Weir 1996) */
        A += (nbar / nc) * (s2 - (1 / (nbar - 1)) * (pbar * (1 - pbar) - ((r - 1) / r) * s2));
        Bc += (nbar / (nbar - 1)) * (pbar * (1 - pbar) - ((r - 1) / r) * s2);
      }
    });
    return { a: A, b: Bc, c: C, r };
  }
  function wcFromSums(S, ploidy) {
    const tot = S.a + S.b + S.c;
    return {
      theta: tot > 0 ? S.a / tot : null,
      f: ploidy === 2 && (S.b + S.c) > 0 ? 1 - S.c / (S.b + S.c) : null,
      F: ploidy === 2 && tot > 0 ? 1 - S.c / tot : null,
    };
  }

  /* ================================================================
     3 · NEI'S STATISTICS, Nei & Chesser corrections, Hedrick, Jost
     ================================================================ */
  function neiLocus(cells, ploidy) {
    const pops = cells.filter(c => c.n >= 1);
    const r = pops.length;
    if (r < 2) return null;
    const alleles = new Set();
    pops.forEach(c => c.counts.forEach((_, k) => alleles.add(k)));
    const nh = r / pops.reduce((s, c) => s + 1 / c.n, 0);          // harmonic mean sample size
    let meanSumSq = 0;
    const pbar = {};
    pops.forEach(c => {
      let ss = 0;
      alleles.forEach(k => { const p = (c.counts.get(k) || 0) / (ploidy * c.n); ss += p * p; pbar[k] = (pbar[k] || 0) + p / r; });
      meanSumSq += ss / r;
    });
    const Ho = ploidy === 2 ? pops.reduce((s, c) => s + c.het / c.n, 0) / r : 0;
    const Hs = (nh / (nh - 1)) * (1 - meanSumSq - (ploidy === 2 ? Ho / (2 * nh) : 0));
    let sumPbar2 = 0; Object.values(pbar).forEach(v => { sumPbar2 += v * v; });
    const Ht = 1 - sumPbar2 + Hs / (nh * r) - (ploidy === 2 ? Ho / (2 * nh * r) : 0);
    const Gst = Ht > 0 ? (Ht - Hs) / Ht : null;
    const GstMax = Ht > 0 ? ((r - 1) * (1 - Hs)) / (r - 1 + Hs) : null;
    const Gprime = Gst != null && GstMax > 0 ? Gst / GstMax : null;
    const D = Hs < 1 ? (r / (r - 1)) * (Ht - Hs) / (1 - Hs) : null;
    return { Ho, Hs, Ht, Dst: Ht - Hs, Gst, Gprime, D, r, nh, k: alleles.size };
  }
  function neiMulti(perLocus) {
    const L = perLocus.filter(x => x);
    if (!L.length) return null;
    const mean = key => L.reduce((s, x) => s + (x[key] || 0), 0) / L.length;
    const Hs = mean('Hs'), Ht = mean('Ht'), Ho = mean('Ho');
    const r = L[0].r;
    const Gst = Ht > 0 ? (Ht - Hs) / Ht : null;
    const GstMax = ((r - 1) * (1 - Hs)) / (r - 1 + Hs);
    const Gprime = Gst != null && GstMax > 0 ? Gst / GstMax : null;
    const Dpooled = Hs < 1 ? (r / (r - 1)) * (Ht - Hs) / (1 - Hs) : null;
    /* The reported D comes from the mean H_S and H_T, like G_ST and G′_ST, so the
       three are comparable and D does not jump when one locus has D ≤ 0. The
       harmonic mean of the per-locus values is kept for reference: it exists only
       when every D is positive, and it is dominated by the least differentiated locus. */
    const Ds = L.map(x => x.D).filter(v => v != null && isFinite(v));
    const allPos = Ds.length > 0 && Ds.every(v => v > 0);
    const Dharm = allPos ? Ds.length / Ds.reduce((s, v) => s + 1 / v, 0) : null;
    return { Ho, Hs, Ht, Dst: Ht - Hs, Gst, Gprime, D: Dpooled, Dharm, Dpooled, Dmean: Ds.length ? Ds.reduce((s, v) => s + v, 0) / Ds.length : null };
  }

  /* ================================================================
     4 · AMOVA
     ================================================================ */
  /* Sums of squares from allele counts: for a set of G gene copies with counts
     C_a, Σ over ordered pairs of δ² (δ² = 1 if the alleles differ) is
     G² − Σ C_a², and SS = that / (2G). Phase never enters. */
  const ssOf = (counts, G) => { if (G <= 0) return 0; let s2 = 0; counts.forEach(v => { s2 += v * v; }); return (G * G - s2) / (2 * G); };

  /* design: {pop: Int32Array pop index per individual (−1 = excluded), region: pop→region index or null, nP, nG}
     returns variance components summed over loci and the SS table */
  function amovaCore(d, design, loci) {
    const k = d.ploidy > 1 && d.kind === 'codominant' ? d.ploidy : 1;
    const withinInd = k > 1;
    const hier = !!design.region;
    const acc = { SSag: 0, SSap: 0, SSai: 0, SSwi: 0, SSwp: 0, SStot: 0, sa: 0, sb: 0, sc: 0, sd: 0 };
    loci.forEach(l => {
      /* per-locus counts by population, region and total, with this locus's sample sizes */
      const popC = Array.from({ length: design.nP }, () => ({ m: new Map(), n: 0 }));
      const regC = hier ? Array.from({ length: design.nG }, () => ({ m: new Map(), n: 0 })) : null;
      const tot = { m: new Map(), n: 0 };
      let ssWI = 0;
      for (let i = 0; i < d.nInd; i++) {
        const p = design.pop[i];
        if (p < 0) continue;
        const g = d.geno[i][l];
        if (!g) continue;
        const pc = popC[p]; pc.n++; tot.n++;
        const rc = hier ? regC[design.region[p]] : null; if (rc) rc.n++;
        if (withinInd) {
          const cm = new Map();
          g.forEach(a => { const key = String(a); cm.set(key, (cm.get(key) || 0) + 1); });
          ssWI += ssOf(cm, k);
        }
        g.forEach(a => {
          const key = String(a);
          pc.m.set(key, (pc.m.get(key) || 0) + 1);
          tot.m.set(key, (tot.m.get(key) || 0) + 1);
          if (rc) rc.m.set(key, (rc.m.get(key) || 0) + 1);
        });
      }
      const usedPops = popC.filter(c => c.n > 0);
      const N = tot.n, P = usedPops.length;
      if (N < 2 || P < 2) return;
      const SStot = ssOf(tot.m, k * N);
      const SSwp = usedPops.reduce((s, c) => s + ssOf(c.m, k * c.n), 0);
      let SSwg = null, G = 0;
      if (hier) { const usedRegs = regC.filter(c => c.n > 0); G = usedRegs.length; SSwg = usedRegs.reduce((s, c) => s + ssOf(c.m, k * c.n), 0); }
      const SSag = hier ? SStot - SSwg : 0;
      const SSap = hier ? SSwg - SSwp : SStot - SSwp;
      const SSai = withinInd ? SSwp - ssWI : SSwp;     // among individuals within pops (or within pops for haploids)
      const SSwi = withinInd ? ssWI : 0;
      /* degrees of freedom and coefficients for this locus */
      const dfag = hier ? G - 1 : 0, dfap = hier ? P - G : P - 1, dfai = N - P, dfwi = withinInd ? N * (k - 1) : 0;
      const sumNp2 = usedPops.reduce((s, c) => s + c.n * c.n, 0);
      let sd = 0, sc = 0, sb = 0, sa = 0;
      const MSwi = withinInd ? SSwi / dfwi : 0;
      const MSai = dfai > 0 ? SSai / dfai : 0;
      const MSap = dfap > 0 ? SSap / dfap : 0;
      if (withinInd) { sd = MSwi; sc = (MSai - sd) / k; }
      else { sc = MSai; }
      if (!hier) {
        const n0 = (N - sumNp2 / N) / (P - 1);
        sb = withinInd ? (MSap - sd - k * sc) / (k * n0) : (MSap - sc) / n0;
      } else {
        /* regions: coefficients n, n′, n″ of Excoffier et al. (1992) */
        const regPops = Array.from({ length: design.nG }, () => []);
        popC.forEach((c, p) => { if (c.n > 0) regPops[design.region[p]].push(c.n); });
        const usedRegPops = regPops.filter(a => a.length);
        const Ng = usedRegPops.map(a => a.reduce((s, v) => s + v, 0));
        const sumWithin = usedRegPops.reduce((s, a, gi) => s + a.reduce((t, v) => t + v * v, 0) / Ng[gi], 0);
        const n = (N - sumWithin) / (P - G);
        const nprime = (sumWithin - sumNp2 / N) / (G - 1);
        const ndbl = (N - Ng.reduce((s, v) => s + v * v, 0) / N) / (G - 1);
        const MSag = dfag > 0 ? SSag / dfag : 0;
        if (withinInd) {
          sb = (MSap - sd - k * sc) / (k * n);
          sa = (MSag - sd - k * sc - k * nprime * sb) / (k * ndbl);
        } else {
          sb = (MSap - sc) / n;
          sa = (MSag - sc - nprime * sb) / ndbl;
        }
      }
      acc.SSag += SSag; acc.SSap += SSap; acc.SSai += SSai; acc.SSwi += SSwi; acc.SSwp += SSwp; acc.SStot += SStot;
      acc.sa += sa; acc.sb += sb; acc.sc += sc; acc.sd += sd;
    });
    const total = acc.sa + acc.sb + acc.sc + acc.sd;
    const phi = {
      PhiST: total > 0 ? (acc.sa + acc.sb) / total : null,                    // among pops (incl. regions) / total
      PhiCT: hier && total > 0 ? acc.sa / total : null,
      PhiSC: hier && (acc.sb + acc.sc + acc.sd) > 0 ? acc.sb / (acc.sb + acc.sc + acc.sd) : null,
      PhiIS: withinInd && (acc.sc + acc.sd) > 0 ? acc.sc / (acc.sc + acc.sd) : null,
      PhiIT: withinInd && total > 0 ? (acc.sa + acc.sb + acc.sc) / total : null,
    };
    return Object.assign(acc, { total, phi, hier, withinInd, k });
  }

  function designFrom(d, popOf, regionOfPop) {
    const nP = Math.max(...popOf) + 1;
    return { pop: popOf, nP, region: regionOfPop || null, nG: regionOfPop ? Math.max(...regionOfPop) + 1 : 0 };
  }

  /* full AMOVA with permutation tests */
  function amova(d, opts, r) {
    const loci = d.loci.map((_, l) => l).filter(l => !(opts.excludeLoci && opts.excludeLoci.has(l)));
    const usedPops = d.pops.map((p, i) => i).filter(i => d.pops[i].idx.length >= 2);
    const popOf = new Int32Array(d.nInd).fill(-1);
    usedPops.forEach((pi, j) => d.pops[pi].idx.forEach(i => { popOf[i] = j; }));
    const hier = opts.hierarchical && d.regions && d.regions.length >= 2;
    let regionOfPop = null;
    if (hier) {
      regionOfPop = usedPops.map(pi => d.regions.findIndex(rg => rg.pops.includes(pi)));
      if (regionOfPop.some(v => v < 0)) regionOfPop = null;
    }
    const design = designFrom(d, popOf, regionOfPop);
    const obs = amovaCore(d, design, loci);
    /* design degrees of freedom (complete-data design) */
    const N = usedPops.reduce((s, pi) => s + d.pops[pi].idx.length, 0), P = usedPops.length;
    const G = design.region ? design.nG : 0;
    const k = obs.k;
    const df = { ag: G ? G - 1 : 0, ap: G ? P - G : P - 1, ai: N - P, wi: obs.withinInd ? N * (k - 1) : 0, tot: obs.withinInd ? k * N - 1 : N - 1 };

    /* permutations */
    const B = opts.perms || 0;
    const counts = { ST: 0, CT: 0, SC: 0, IS: 0 };
    const ran = { ST: 0, CT: 0, SC: 0, IS: 0 };
    const inds = []; for (let i = 0; i < d.nInd; i++) if (popOf[i] >= 0) inds.push(i);
    for (let b = 0; b < B; b++) {
      /* Φ_ST / Φ_PT: individuals among populations */
      const lab = popOf.slice();
      const vals = inds.map(i => lab[i]); shuffle(vals, r); inds.forEach((i, q) => { lab[i] = vals[q]; });
      const s = amovaCore(d, designFrom(d, lab, regionOfPop), loci);
      if (s.phi.PhiST != null) { ran.ST++; if (s.phi.PhiST >= obs.phi.PhiST - 1e-12) counts.ST++; }
      if (design.region) {
        /* Φ_SC: individuals among populations within their region */
        const lab2 = popOf.slice();
        for (let g = 0; g < design.nG; g++) {
          const ig = inds.filter(i => regionOfPop[popOf[i]] === g);
          const v2 = ig.map(i => popOf[i]); shuffle(v2, r); ig.forEach((i, q) => { lab2[i] = v2[q]; });
        }
        const s2 = amovaCore(d, designFrom(d, lab2, regionOfPop), loci);
        if (s2.phi.PhiSC != null) { ran.SC++; if (s2.phi.PhiSC >= obs.phi.PhiSC - 1e-12) counts.SC++; }
        /* Φ_CT: whole populations among regions */
        const reg3 = regionOfPop.slice(); shuffle(reg3, r);
        const s3 = amovaCore(d, designFrom(d, popOf, reg3), loci);
        if (s3.phi.PhiCT != null) { ran.CT++; if (s3.phi.PhiCT >= obs.phi.PhiCT - 1e-12) counts.CT++; }
      }
      if (obs.withinInd) {
        /* Φ_IS: gene copies among individuals within populations, locus by locus */
        const geno = d.geno.map(g => g.slice());
        usedPops.forEach(pi => {
          const idx = d.pops[pi].idx;
          loci.forEach(l => {
            const pool = []; const who = [];
            idx.forEach(i => { const g = d.geno[i][l]; if (g) { who.push(i); g.forEach(a => pool.push(a)); } });
            shuffle(pool, r);
            who.forEach((i, q) => { geno[i][l] = pool.slice(q * k, q * k + k); });
          });
        });
        const s4 = amovaCore(Object.assign({}, d, { geno }), design, loci);
        if (s4.phi.PhiIS != null) { ran.IS++; if (s4.phi.PhiIS >= obs.phi.PhiIS - 1e-12) counts.IS++; }
      }
    }
    const pv = key => ran[key] ? (counts[key] + 1) / (ran[key] + 1) : null;
    /* distinct ways of sharing the populations among the regions with the same
       region sizes (regions of equal size are interchangeable): the Φ_CT test can
       never give a P below about 1 / arrangements */
    let arrangements = null;
    if (design.region) {
      const lf = n => { let s = 0; for (let i = 2; i <= n; i++) s += Math.log(i); return s; };
      const sizes = Array.from({ length: design.nG }, (_, g) => regionOfPop.filter(v => v === g).length).filter(v => v > 0);
      const same = new Map(); sizes.forEach(s => same.set(s, (same.get(s) || 0) + 1));
      arrangements = Math.round(Math.exp(lf(P) - sizes.reduce((s, v) => s + lf(v), 0) - [...same.values()].reduce((s, v) => s + lf(v), 0)));
    }
    return Object.assign(obs, {
      df, N, P, G, B, loci: loci.length, usedPops, arrangements,
      phiName: d.kind === 'dominant' ? 'PT' : 'ST',
      p: { ST: pv('ST'), CT: pv('CT'), SC: pv('SC'), IS: pv('IS') },
      pct: { a: obs.total > 0 ? obs.sa / obs.total : 0, b: obs.total > 0 ? obs.sb / obs.total : 0, c: obs.total > 0 ? obs.sc / obs.total : 0, d: obs.total > 0 ? obs.sd / obs.total : 0 },
    });
  }

  /* ================================================================
     5 · THE WHOLE ANALYSIS
     ================================================================ */
  const DEFAULTS = { perms: 999, permsPair: 199, boot: 1000, hierarchical: true, excludeLoci: null, seed: 1 };

  function compute(d, options) {
    const opts = Object.assign({}, DEFAULTS, options || {});
    const r = rng(opts.seed);
    const codom = d.kind === 'codominant' && d.ploidy === 2;
    const ploidy = codom ? 2 : 1;
    const usedPops = d.pops.map((p, i) => i).filter(i => d.pops[i].idx.length >= 2);
    const loci = d.loci.map((_, l) => l).filter(l => !(opts.excludeLoci && opts.excludeLoci.has(l)));
    const R = { opts, codom, ploidy, kind: d.kind, popNames: usedPops.map(i => d.pops[i].name), usedPops, locusNames: loci.map(l => d.loci[l].name), loci, nLoci: loci.length };

    const popOf = new Int32Array(d.nInd).fill(-1);
    usedPops.forEach((pi, j) => d.pops[pi].idx.forEach(i => { popOf[i] = j; }));
    const tables = countTables(d, popOf, usedPops.length, loci);

    /* --- per locus --- */
    R.perLocus = loci.map((l, li) => {
      const wc = wcLocus(tables[li], ploidy);
      const nei = neiLocus(tables[li], ploidy);
      const st = wc ? wcFromSums(wc, ploidy) : { theta: null, f: null, F: null };
      return Object.assign({ locus: d.loci[l].name, l, wc }, st, nei || {});
    });
    /* --- multilocus --- */
    const sums = { a: 0, b: 0, c: 0 };
    R.perLocus.forEach(x => { if (x.wc) { sums.a += x.wc.a; sums.b += x.wc.b; sums.c += x.wc.c; } });
    R.multi = Object.assign({}, wcFromSums(sums, ploidy), neiMulti(R.perLocus.map(x => (x.Hs != null ? x : null))) || {});
    /* Wright's island model: F_ST = 1/(1 + 4Nm) for nuclear genes of a diploid —
       band markers included, since dominance changes what is seen, not the biology —
       and 1/(1 + 2Nm) for haploid genomes such as organelle haplotypes */
    R.nmK = codom || d.kind === 'dominant' ? 4 : 2;
    R.multi.Nm = R.multi.theta > 0 ? (1 - R.multi.theta) / (R.nmK * R.multi.theta) : null;

    /* jackknife SE and bootstrap CI over loci for the headline estimates */
    const withWC = R.perLocus.filter(x => x.wc);
    const statsOf = set => {
      const s = { a: 0, b: 0, c: 0 }; set.forEach(x => { s.a += x.wc.a; s.b += x.wc.b; s.c += x.wc.c; });
      const w = wcFromSums(s, ploidy), n = neiMulti(set.map(x => (x.Hs != null ? x : null))) || {};
      return { theta: w.theta, f: w.f, F: w.F, Gst: n.Gst, Gprime: n.Gprime, D: n.D };
    };
    R.ci = {}; R.seJack = {};
    if (withWC.length > 2) {
      const keys = ['theta', 'f', 'F', 'Gst', 'Gprime', 'D'];
      const boots = {}; keys.forEach(k => { boots[k] = []; });
      for (let b = 0; b < opts.boot; b++) {
        const pick = []; for (let i = 0; i < withWC.length; i++) pick.push(withWC[Math.floor(r() * withWC.length)]);
        const s = statsOf(pick); keys.forEach(k => { if (s[k] != null && isFinite(s[k])) boots[k].push(s[k]); });
      }
      keys.forEach(k => { const v = boots[k].sort((x, y) => x - y); R.ci[k] = v.length ? [S.quantile(v, 0.025), S.quantile(v, 0.975)] : null; });
      keys.forEach(k => {
        const pseudo = withWC.map((_, i) => statsOf(withWC.filter((__, j) => j !== i))[k]).filter(v => v != null && isFinite(v));
        if (pseudo.length > 1) { const m = pseudo.reduce((s, v) => s + v, 0) / pseudo.length; R.seJack[k] = Math.sqrt((pseudo.length - 1) / pseudo.length * pseudo.reduce((s, v) => s + (v - m) * (v - m), 0)); }
      });
    }
    /* permutation test of the global θ: individuals among populations */
    if (opts.perms > 0 && R.multi.theta != null) {
      const inds = []; for (let i = 0; i < d.nInd; i++) if (popOf[i] >= 0) inds.push(i);
      let ge = 0;
      for (let b = 0; b < opts.perms; b++) {
        const lab = popOf.slice(); const v = inds.map(i => lab[i]); shuffle(v, r); inds.forEach((i, q) => { lab[i] = v[q]; });
        const t = countTables(d, lab, usedPops.length, loci);
        const s = { a: 0, b: 0, c: 0 };
        t.forEach(cells => { const w = wcLocus(cells, ploidy); if (w) { s.a += w.a; s.b += w.b; s.c += w.c; } });
        const th = wcFromSums(s, ploidy).theta;
        if (th != null && th >= R.multi.theta - 1e-12) ge++;
      }
      R.multi.pTheta = (ge + 1) / (opts.perms + 1);
    }

    /* --- AMOVA --- */
    R.amova = amova(d, { perms: opts.perms, hierarchical: opts.hierarchical, excludeLoci: opts.excludeLoci }, r);

    /* --- pairwise --- */
    const nP = usedPops.length;
    R.pairs = [];
    for (let a = 0; a < nP; a++) for (let b = a + 1; b < nP; b++) {
      const lab = new Int32Array(d.nInd).fill(-1);
      d.pops[usedPops[a]].idx.forEach(i => { lab[i] = 0; });
      d.pops[usedPops[b]].idx.forEach(i => { lab[i] = 1; });
      const t = countTables(d, lab, 2, loci);
      const s = { a: 0, b: 0, c: 0 };
      const neis = [];
      t.forEach(cells => { const w = wcLocus(cells, ploidy); if (w) { s.a += w.a; s.b += w.b; s.c += w.c; } const n = neiLocus(cells, ploidy); if (n) neis.push(n); });
      const theta = wcFromSums(s, ploidy).theta;
      const nm = neiMulti(neis) || {};
      /* pairwise AMOVA Φ with its permutation test */
      const sub = { pop: lab, nP: 2, region: null, nG: 0 };
      const am = amovaCore(d, sub, loci);
      let pPhi = null, pTheta = null;
      if (opts.permsPair > 0) {
        const inds = []; for (let i = 0; i < d.nInd; i++) if (lab[i] >= 0) inds.push(i);
        let gePhi = 0, geTh = 0;
        for (let k = 0; k < opts.permsPair; k++) {
          const l2 = lab.slice(); const v = inds.map(i => l2[i]); shuffle(v, r); inds.forEach((i, q) => { l2[i] = v[q]; });
          const am2 = amovaCore(d, { pop: l2, nP: 2, region: null, nG: 0 }, loci);
          if (am2.phi.PhiST != null && am2.phi.PhiST >= am.phi.PhiST - 1e-12) gePhi++;
          const t2 = countTables(d, l2, 2, loci); const s2 = { a: 0, b: 0, c: 0 };
          t2.forEach(cells => { const w = wcLocus(cells, ploidy); if (w) { s2.a += w.a; s2.b += w.b; s2.c += w.c; } });
          const th2 = wcFromSums(s2, ploidy).theta;
          if (th2 != null && theta != null && th2 >= theta - 1e-12) geTh++;
        }
        pPhi = (gePhi + 1) / (opts.permsPair + 1); pTheta = (geTh + 1) / (opts.permsPair + 1);
      }
      R.pairs.push({
        a, b, popA: d.pops[usedPops[a]].name, popB: d.pops[usedPops[b]].name,
        theta, pTheta, phi: am.phi.PhiST, pPhi, Gst: nm.Gst, Gprime: nm.Gprime, D: nm.D, Hs: nm.Hs, Ht: nm.Ht,
        Nm: theta > 0 ? (1 - theta) / (R.nmK * theta) : null,
      });
    }
    /* Holm correction on the pairwise P-values */
    ['pTheta', 'pPhi'].forEach(key => {
      const adj = HWE.adjustP(R.pairs.map(p => p[key]), 'holm');
      R.pairs.forEach((p, i) => { p[key + 'Adj'] = adj[i]; });
    });
    return R;
  }

  window.Fst = { compute, amova, amovaCore, wcLocus, wcFromSums, neiLocus, neiMulti, countTables, DEFAULTS };
})();
