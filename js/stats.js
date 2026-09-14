/* PopGeneticsPro — numerical core: descriptive statistics and probability distributions.
   Pure JavaScript, validated against R reference values (see tests/). */

const S = {};

/* ================= descriptive ================= */
S.sum = a => a.reduce((s, v) => s + v, 0);
S.mean = a => a.length ? S.sum(a) / a.length : NaN;
S.variance = a => {
  const n = a.length; if (n < 2) return NaN;
  const m = S.mean(a); let s = 0;
  for (const v of a) s += (v - m) * (v - m);
  return s / (n - 1);
};
S.sd = a => Math.sqrt(S.variance(a));
S.se = a => S.sd(a) / Math.sqrt(a.length);
S.min = a => a.reduce((m, v) => v < m ? v : m, Infinity);
S.max = a => a.reduce((m, v) => v > m ? v : m, -Infinity);
S.range = a => S.max(a) - S.min(a);
S.sorted = a => a.slice().sort((x, y) => x - y);
/* R type-7 quantile */
S.quantile = (a, p) => {
  const s = S.sorted(a), n = s.length;
  if (!n) return NaN;
  const h = (n - 1) * p, lo = Math.floor(h), hi = Math.ceil(h);
  return s[lo] + (h - lo) * (s[hi] - s[lo]);
};
S.median = a => S.quantile(a, 0.5);
S.iqr = a => S.quantile(a, 0.75) - S.quantile(a, 0.25);
S.mad = a => { const m = S.median(a); return 1.4826 * S.median(a.map(v => Math.abs(v - m))); };
S.cv = a => 100 * S.sd(a) / S.mean(a);
S.geomean = a => a.every(v => v > 0) ? Math.exp(S.mean(a.map(Math.log))) : NaN;
S.harmean = a => a.every(v => v > 0) ? a.length / S.sum(a.map(v => 1 / v)) : NaN;
/* sample skewness (G1) and excess kurtosis (G2), bias-corrected (type 2 of Joanes and Gill 1998) */
S.skewness = a => {
  const n = a.length; if (n < 3) return NaN;
  const m = S.mean(a), sd = S.sd(a); if (!sd) return 0;
  let s = 0; for (const v of a) s += Math.pow((v - m) / sd, 3);
  return n / ((n - 1) * (n - 2)) * s;
};
S.kurtosis = a => {
  const n = a.length; if (n < 4) return NaN;
  const m = S.mean(a), sd = S.sd(a); if (!sd) return 0;
  let s = 0; for (const v of a) s += Math.pow((v - m) / sd, 4);
  return n * (n + 1) / ((n - 1) * (n - 2) * (n - 3)) * s - 3 * (n - 1) * (n - 1) / ((n - 2) * (n - 3));
};
S.mode = a => {
  const c = new Map(); let best = null, bn = 0;
  a.forEach(v => { const k = c.get(v) || 0; c.set(v, k + 1); if (k + 1 > bn) { bn = k + 1; best = v; } });
  return bn > 1 ? best : NaN;
};
S.sumsq = a => { const m = S.mean(a); return a.reduce((s, v) => s + (v - m) * (v - m), 0); };
S.histogram = (a, k) => {
  const mn = S.min(a), mx = S.max(a);
  k = k || Math.max(5, Math.min(30, Math.ceil(Math.sqrt(a.length))));
  const w = (mx - mn) / k || 1;
  const counts = new Array(k).fill(0);
  a.forEach(v => { let i = Math.floor((v - mn) / w); if (i >= k) i = k - 1; if (i < 0) i = 0; counts[i]++; });
  return { counts, k, min: mn, max: mx, width: w, edges: counts.map((_, i) => mn + i * w).concat([mx]) };
};
/* Sturges / Freedman-Diaconis bin count */
S.nBins = (a, rule) => {
  const n = a.length;
  if (rule === 'fd') { const h = 2 * S.iqr(a) / Math.cbrt(n); return h > 0 ? Math.max(3, Math.min(60, Math.ceil(S.range(a) / h))) : 10; }
  if (rule === 'sqrt') return Math.max(3, Math.ceil(Math.sqrt(n)));
  return Math.max(3, Math.ceil(Math.log2(n) + 1));
};
/* Gaussian kernel density on a grid */
S.kde = (a, grid, bw) => {
  const n = a.length;
  bw = bw || 0.9 * Math.min(S.sd(a), S.iqr(a) / 1.34 || S.sd(a)) * Math.pow(n, -0.2);
  if (!bw) bw = 1;
  return grid.map(x => {
    let s = 0; for (const v of a) { const z = (x - v) / bw; s += Math.exp(-0.5 * z * z); }
    return s / (n * bw * Math.sqrt(2 * Math.PI));
  });
};
/* Tukey boxplot statistics */
S.boxStats = a => {
  const q1 = S.quantile(a, 0.25), q3 = S.quantile(a, 0.75), iqr = q3 - q1;
  const lo = q1 - 1.5 * iqr, hi = q3 + 1.5 * iqr;
  const inside = a.filter(v => v >= lo && v <= hi);
  return {
    q1, q3, median: S.median(a), iqr,
    whiskerLo: inside.length ? S.min(inside) : q1, whiskerHi: inside.length ? S.max(inside) : q3,
    outliers: a.filter(v => v < lo || v > hi), mean: S.mean(a), n: a.length,
  };
};
S.ranks = a => {                       /* average ranks for ties */
  const idx = a.map((v, i) => [v, i]).sort((x, y) => x[0] - y[0]);
  const r = new Array(a.length);
  let i = 0;
  while (i < idx.length) {
    let j = i; while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
    const avg = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) r[idx[k][1]] = avg;
    i = j + 1;
  }
  return r;
};
S.pearson = (x, y) => {
  const n = x.length, mx = S.mean(x), my = S.mean(y);
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { const a = x[i] - mx, b = y[i] - my; sxy += a * b; sxx += a * a; syy += b * b; }
  return sxy / Math.sqrt(sxx * syy);
};
S.spearman = (x, y) => S.pearson(S.ranks(x), S.ranks(y));

/* ================= special functions ================= */
S.lgamma = x => {
  const c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155,
    0.1208650973866179e-2, -0.5395239384953e-5];
  let y = x, t = x + 5.5; t -= (x + 0.5) * Math.log(t);
  let s = 1.000000000190015;
  for (let j = 0; j < 6; j++) s += c[j] / ++y;
  return -t + Math.log(2.5066282746310005 * s / x);
};
S.gamma = x => Math.exp(S.lgamma(x));
/* regularized lower incomplete gamma P(a,x) */
S.gammainc = (a, x) => {
  if (x <= 0) return 0;
  if (x < a + 1) {
    let ap = a, sum = 1 / a, del = sum;
    for (let n = 1; n < 500; n++) { ap += 1; del *= x / ap; sum += del; if (Math.abs(del) < Math.abs(sum) * 1e-15) break; }
    return sum * Math.exp(-x + a * Math.log(x) - S.lgamma(a));
  }
  let b = x + 1 - a, c = 1 / 1e-300, d = 1 / b, h = d;
  for (let i = 1; i < 500; i++) {
    const an = -i * (i - a); b += 2;
    d = an * d + b; if (Math.abs(d) < 1e-300) d = 1e-300;
    c = b + an / c; if (Math.abs(c) < 1e-300) c = 1e-300;
    d = 1 / d; const del = d * c; h *= del;
    if (Math.abs(del - 1) < 1e-15) break;
  }
  return 1 - Math.exp(-x + a * Math.log(x) - S.lgamma(a)) * h;
};
/* regularized incomplete beta I_x(a,b) */
S.betainc = (x, a, b) => {
  if (x <= 0) return 0; if (x >= 1) return 1;
  const bt = Math.exp(S.lgamma(a + b) - S.lgamma(a) - S.lgamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  const cf = (x, a, b) => {
    let qab = a + b, qap = a + 1, qam = a - 1, c = 1, d = 1 - qab * x / qap;
    if (Math.abs(d) < 1e-300) d = 1e-300; d = 1 / d; let h = d;
    for (let m = 1; m <= 500; m++) {
      const m2 = 2 * m;
      let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
      d = 1 + aa * d; if (Math.abs(d) < 1e-300) d = 1e-300;
      c = 1 + aa / c; if (Math.abs(c) < 1e-300) c = 1e-300;
      d = 1 / d; h *= d * c;
      aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
      d = 1 + aa * d; if (Math.abs(d) < 1e-300) d = 1e-300;
      c = 1 + aa / c; if (Math.abs(c) < 1e-300) c = 1e-300;
      d = 1 / d; const del = d * c; h *= del;
      if (Math.abs(del - 1) < 1e-15) break;
    }
    return h;
  };
  return x < (a + 1) / (a + b + 2) ? bt * cf(x, a, b) / a : 1 - bt * cf(1 - x, b, a) / b;
};
S.erf = x => {
  const t = 1 / (1 + 0.5 * Math.abs(x));
  const y = 1 - t * Math.exp(-x * x - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 +
    t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))));
  return x >= 0 ? y : -y;
};

/* ================= distributions ================= */
S.pnorm = (z, mu, sd) => { z = (z - (mu || 0)) / (sd || 1); return 0.5 * (1 + S.erf(z / Math.SQRT2)); };
S.dnorm = (x, mu, sd) => { mu = mu || 0; sd = sd || 1; const z = (x - mu) / sd; return Math.exp(-0.5 * z * z) / (sd * Math.sqrt(2 * Math.PI)); };
/* Acklam's inverse normal, refined by one Newton step */
S.qnorm = p => {
  if (p <= 0) return -Infinity; if (p >= 1) return Infinity;
  const a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02, 1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
  const b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02, 6.680131188771972e+01, -1.328068155288572e+01];
  const c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00, -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
  const d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00];
  const pl = 0.02425, ph = 1 - pl; let q, r, x;
  if (p < pl) { q = Math.sqrt(-2 * Math.log(p)); x = (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  else if (p <= ph) { q = p - 0.5; r = q * q; x = (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1); }
  else { q = Math.sqrt(-2 * Math.log(1 - p)); x = -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  const e = S.pnorm(x) - p; const u = e * Math.sqrt(2 * Math.PI) * Math.exp(x * x / 2);
  return x - u / (1 + x * u / 2);
};
S.pt = (t, df) => {
  if (!isFinite(t)) return t > 0 ? 1 : 0;
  const x = df / (df + t * t);
  const p = 0.5 * S.betainc(x, df / 2, 0.5);
  return t >= 0 ? 1 - p : p;
};
S.dt = (t, df) => Math.exp(S.lgamma((df + 1) / 2) - S.lgamma(df / 2)) / Math.sqrt(df * Math.PI) * Math.pow(1 + t * t / df, -(df + 1) / 2);
S.pchisq = (x, df) => x <= 0 ? 0 : S.gammainc(df / 2, x / 2);
S.pf = (f, df1, df2) => f <= 0 ? 0 : !isFinite(f) ? 1 : S.betainc(df1 * f / (df1 * f + df2), df1 / 2, df2 / 2);
S.df = (x, d1, d2) => x <= 0 ? 0 : Math.exp(0.5 * (d1 * Math.log(d1 * x) + d2 * Math.log(d2) - (d1 + d2) * Math.log(d1 * x + d2)) - Math.log(x) - (S.lgamma(d1 / 2) + S.lgamma(d2 / 2) - S.lgamma((d1 + d2) / 2)));
/* generic inverse by bisection + secant on a monotone CDF */
S.invert = (cdf, p, lo, hi) => {
  if (p <= 0) return lo; if (p >= 1) return hi;
  let a = lo, b = hi;
  while (cdf(b) < p) { a = b; b = b * 2 + 1; if (b > 1e12) break; }
  for (let i = 0; i < 200; i++) {
    const m = (a + b) / 2, v = cdf(m);
    if (Math.abs(v - p) < 1e-13 || (b - a) < 1e-12 * Math.max(1, Math.abs(m))) return m;
    if (v < p) a = m; else b = m;
  }
  return (a + b) / 2;
};
S.qt = (p, df) => {
  if (p === 0.5) return 0;
  if (p < 0.5) return -S.qt(1 - p, df);
  return S.invert(t => S.pt(t, df), p, 0, 10);
};
S.qchisq = (p, df) => S.invert(x => S.pchisq(x, df), p, 0, Math.max(10, df * 3));
S.qf = (p, d1, d2) => S.invert(f => S.pf(f, d1, d2), p, 0, 10);

/* Studentized range distribution (Tukey). Numerical integration following
   Copenhaver & Holland (1988) as implemented in R's ptukey (single-group case). */
S.ptukey = (q, k, df) => {
  if (q <= 0) return 0;
  if (!isFinite(q)) return 1;
  /* probability that range of k normals ≤ w */
  const wprob = w => {
    const nleg = 12, ihalf = 6;
    const xleg = [0.981560634246719250690549090149, 0.904117256370474856678465866119, 0.769902674194304687036893833213,
      0.587317954286617447296702418941, 0.367831498998180193752691536644, 0.125233408511468915472441369464];
    const aleg = [0.047175336386511827194615961485, 0.106939325995318430960254718194, 0.160078328543346226334652529543,
      0.203167426723065921749064455810, 0.233492536538354808760849898925, 0.249147045813402785000562436043];
    const C1 = -30, C2 = -50, C3 = 60, bb = 8, wlar = 3, wincr1 = 2, wincr2 = 3;
    const qsqz = w * 0.5;
    if (qsqz >= bb) return 1;
    let pr_w = 2 * S.pnorm(qsqz) - 1;
    pr_w = pr_w >= 1 ? 1 : Math.pow(pr_w, k);
    const wincr = w > wlar ? wincr1 : wincr2;
    let blb = qsqz;
    const binc = (bb - qsqz) / wincr;
    let bub = blb + binc;
    let einsum = 0;
    const cc = k - 1;
    for (let wi = 1; wi <= wincr; wi++) {
      let elsum = 0;
      const a = 0.5 * (bub + blb), b = 0.5 * (bub - blb);
      for (let jj = 1; jj <= nleg; jj++) {
        let j, xx;
        if (ihalf < jj) { j = nleg - jj + 1; xx = xleg[j - 1]; } else { j = jj; xx = -xleg[j - 1]; }
        const c = b * xx, ac = a + c;
        const qexpo = ac * ac;
        if (qexpo > C3) break;
        const pplus = 2 * S.pnorm(ac), pminus = 2 * S.pnorm(ac - w);
        let rinsum = pplus * 0.5 - pminus * 0.5;
        if (rinsum >= Math.exp(C1 / cc)) {
          rinsum = aleg[j - 1] * Math.exp(-(0.5 * qexpo)) * Math.pow(rinsum, cc);
          elsum += rinsum;
        }
      }
      elsum *= (2 * b) * k / Math.sqrt(2 * Math.PI);
      einsum += elsum;
      blb = bub; bub += binc;
    }
    pr_w += einsum;
    return pr_w <= Math.exp(C1 / k) ? 0 : Math.min(pr_w, 1);
  };
  if (df > 25000) return wprob(q);
  const nlegq = 16, ihalfq = 8;
  const xlegq = [0.989400934991649932596154173450, 0.944575023073232576077988415535, 0.865631202387831743880467897712,
    0.755404408355003033895101194847, 0.617876244402643748446671764049, 0.458016777657227386342419442984,
    0.281603550779258913230460501460, 0.950125098376374401853193354250e-1];
  const alegq = [0.271524594117540948517805724560e-1, 0.622535239386478928628438369944e-1, 0.951585116824927848099251076022e-1,
    0.124628971255533872052476282192, 0.149595988816576732081501730547, 0.169156519395002538189312079030,
    0.182603415044923588866763667969, 0.189450610455068496285396723208];
  const eps1 = -30, eps2 = 1e-14, dhaf = 100, dquar = 800, deigh = 5000, dlarg = 25000, ulen1 = 1, ulen2 = 0.5, ulen3 = 0.25, ulen4 = 0.125;
  const f2 = df * 0.5;
  let f2lf = f2 * Math.log(df) - df * Math.log(2) - S.lgamma(f2);
  const f21 = f2 - 1;
  const ff4 = df * 0.25;
  const ulen = df <= dhaf ? ulen1 : df <= dquar ? ulen2 : df <= deigh ? ulen3 : ulen4;
  f2lf += Math.log(ulen);
  let ans = 0;
  for (let i = 1; i <= 50; i++) {
    let otsum = 0;
    const twa1 = (2 * i - 1) * ulen;
    for (let jj = 1; jj <= nlegq; jj++) {
      let j, t1;
      if (ihalfq < jj) { j = jj - ihalfq - 1; t1 = f2lf + f21 * Math.log(twa1 + xlegq[j] * ulen) - (xlegq[j] * ulen + twa1) * ff4; }
      else { j = jj - 1; t1 = f2lf + f21 * Math.log(twa1 - xlegq[j] * ulen) + (xlegq[j] * ulen - twa1) * ff4; }
      if (t1 >= eps1) {
        const u = ihalfq < jj ? Math.sqrt(0.5 * (xlegq[j] * ulen + twa1)) : Math.sqrt(0.5 * (-xlegq[j] * ulen + twa1));
        const wprb = wprob(q * u);
        otsum += wprb * alegq[j] * Math.exp(t1);
      }
    }
    if (i * ulen >= 1 && otsum <= eps2) break;
    ans += otsum;
  }
  return Math.min(1, ans);
};
S.qtukey = (p, k, df) => S.invert(q => S.ptukey(q, k, df), p, 0, 8);

/* ================= linear algebra (small) ================= */
S.solve = (A, b) => {                      /* Gaussian elimination with partial pivoting; A n×n */
  const n = A.length, M = A.map((r, i) => r.concat([b[i]]));
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-12) return null;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = 0; r < n; r++) if (r !== c) {
      const f = M[r][c] / M[c][c];
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  return M.map((r, i) => r[n] / r[i]);
};

/* ================= random (seedable) ================= */
S.rng = seed => {
  let s = (seed >>> 0) || 123456789;
  const r = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  r.normal = (mu, sd) => { const u = 1 - r(), v = r(); return (mu || 0) + (sd == null ? 1 : sd) * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  r.shuffle = a => { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
  return r;
};

window.S = S;

/* ================= linear algebra for multivariate work (PopGeneticsPro) ================= */
/* Symmetric eigen-decomposition by cyclic Jacobi rotations. Returns values (descending) and
   vectors[j] = eigenvector j (array of length p). Fine for p up to a few hundred. */
S.eigenSym = A => {
  const n = A.length, a = A.map(r => r.slice()), V = Array.from({ length: n }, (_, i) => { const r = new Array(n).fill(0); r[i] = 1; return r; });
  for (let sweep = 0; sweep < 100; sweep++) {
    let off = 0; for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) off += a[i][j] * a[i][j];
    if (off < 1e-22) break;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) {
      if (Math.abs(a[p][q]) < 1e-300) continue;
      const theta = (a[q][q] - a[p][p]) / (2 * a[p][q]);
      const t = (theta >= 0 ? 1 : -1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
      const c = 1 / Math.sqrt(t * t + 1), s = t * c;
      for (let k = 0; k < n; k++) { const akp = a[k][p], akq = a[k][q]; a[k][p] = c * akp - s * akq; a[k][q] = s * akp + c * akq; }
      for (let k = 0; k < n; k++) { const apk = a[p][k], aqk = a[q][k]; a[p][k] = c * apk - s * aqk; a[q][k] = s * apk + c * aqk; }
      for (let k = 0; k < n; k++) { const vkp = V[k][p], vkq = V[k][q]; V[k][p] = c * vkp - s * vkq; V[k][q] = s * vkp + c * vkq; }
    }
  }
  const idx = a.map((_, i) => i).sort((i, j) => a[j][j] - a[i][i]);
  return { values: idx.map(i => a[i][i]), vectors: idx.map(i => V.map(r => r[i])) };
};
S.colMeans = X => X[0].map((_, j) => S.mean(X.map(r => r[j])));
S.colSds = X => X[0].map((_, j) => S.sd(X.map(r => r[j])));
S.covMatrix = X => {
  const n = X.length, p = X[0].length, m = S.colMeans(X), C = Array.from({ length: p }, () => new Array(p).fill(0));
  for (let i = 0; i < n; i++) for (let a = 0; a < p; a++) { const da = X[i][a] - m[a]; for (let b = a; b < p; b++) C[a][b] += da * (X[i][b] - m[b]); }
  for (let a = 0; a < p; a++) for (let b = a; b < p; b++) { C[a][b] /= (n - 1); C[b][a] = C[a][b]; }
  return C;
};
S.corMatrix = X => {
  const C = S.covMatrix(X), p = C.length, R = C.map(r => r.slice());
  for (let a = 0; a < p; a++) for (let b = 0; b < p; b++) { const d = Math.sqrt(C[a][a] * C[b][b]); R[a][b] = d > 0 ? C[a][b] / d : (a === b ? 1 : 0); }
  return R;
};
/* PCA on a numeric matrix (rows = objects). scale !== false → correlation matrix. */
S.pca = (X, o) => {
  o = o || {};
  const p = X[0].length, m = S.colMeans(X), sd = S.colSds(X);
  const Z = X.map(r => r.map((v, j) => o.scale === false ? v - m[j] : (sd[j] > 0 ? (v - m[j]) / sd[j] : 0)));
  const M = o.scale === false ? S.covMatrix(Z) : S.corMatrix(X);
  const e = S.eigenSym(M);
  const tot = e.values.reduce((a, b) => a + Math.max(b, 0), 0) || 1;
  const k = Math.min(o.k || p, p);
  const scores = Z.map(r => e.vectors.slice(0, k).map(v => r.reduce((s, x, j) => s + x * v[j], 0)));
  return { values: e.values, vectors: e.vectors, pct: e.values.map(v => Math.max(v, 0) / tot), scores, n: X.length, p };
};
/* Classical (metric) multidimensional scaling from a distance matrix. */
S.cmdscale = (D, k) => {
  const n = D.length, B = Array.from({ length: n }, () => new Array(n).fill(0));
  const rm = new Array(n).fill(0); let gm = 0;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { const d2 = D[i][j] * D[i][j]; B[i][j] = d2; rm[i] += d2 / n; gm += d2 / (n * n); }
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) B[i][j] = -0.5 * (B[i][j] - rm[i] - rm[j] + gm);
  const e = S.eigenSym(B);
  const pos = e.values.filter(v => v > 1e-9);
  const kk = Math.max(1, Math.min(k || pos.length, pos.length));
  const points = Array.from({ length: n }, (_, i) => e.vectors.slice(0, kk).map((v, j) => v[i] * Math.sqrt(Math.max(e.values[j], 0))));
  const tot = pos.reduce((a, b) => a + b, 0) || 1;
  return { points, eig: e.values, pct: e.values.slice(0, kk).map(v => Math.max(v, 0) / tot), k: kk };
};
/* Mahalanobis D² through PCA scores (robust to singular covariance): D² = Σ score²/λ over λ > tol. */
S.mahalanobis = X => {
  const n = X.length;
  const pc = S.pca(X, { scale: false });
  const keep = pc.values.map((v, j) => j).filter(j => pc.values[j] > 1e-8 * Math.max(pc.values[0], 1e-12) && j < n - 1);
  const d2 = pc.scores.map(s => keep.reduce((a, j) => a + s[j] * s[j] / pc.values[j], 0));
  const df = Math.max(1, keep.length);
  return { d2, df, threshold: S.qchisq(0.975, df), thresholdStrict: S.qchisq(0.999, df) };
};
S.qbeta = (p, a, b) => S.invert(x => S.betainc(x, a, b), p, 0, 1);
S.inverse = A => {
  const n = A.length, M = A.map((r, i) => r.concat(Array.from({ length: n }, (_, j) => i === j ? 1 : 0)));
  for (let c = 0; c < n; c++) {
    let piv = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
    if (Math.abs(M[piv][c]) < 1e-12) return null;
    [M[c], M[piv]] = [M[piv], M[c]];
    const d = M[c][c]; for (let k = 0; k < 2 * n; k++) M[c][k] /= d;
    for (let r = 0; r < n; r++) if (r !== c) { const f = M[r][c]; if (f) for (let k = 0; k < 2 * n; k++) M[r][k] -= f * M[c][k]; }
  }
  return M.map(r => r.slice(n));
};
