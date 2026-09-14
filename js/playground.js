/* PopGeneticsPro — the live simulator on the home page.
   A real Wright-Fisher model of D demes, one biallelic locus, with drift,
   migration (island model), selection, mutation and selfing. Nothing here is a
   cartoon: the same recursion is written in every textbook, and the F_ST panel
   on the right is computed from the simulated allele frequencies, not drawn. */

(function () {

  const sim = {
    N: 50,        // individuals per deme
    D: 6,         // number of demes
    m: 0.01,      // migration rate (island model)
    s: 0,         // selection coefficient favouring allele A (h = 0.5)
    u: 0,         // mutation rate, symmetric
    self: 0,      // selfing rate -> inbreeding F = self/(2 - self), Ne = 2N/(1 + F)
    p0: 0.5,
    seed: 42,
    gen: 0,
    maxGen: 120,
    p: [],        // current allele frequency per deme
    hist: [],     // hist[d] = [p at each generation]
    stats: [],    // {gen, HT, HS, FST, fixed}
    timer: null,
    r: null,
  };

  function reset(keepSeed) {
    if (!keepSeed) sim.seed = Math.floor(Math.random() * 100000) + 1;
    sim.r = rng(sim.seed);
    sim.gen = 0;
    sim.p = new Array(sim.D).fill(sim.p0);
    sim.hist = sim.p.map(p => [p]);
    sim.stats = [];
    record();
    draw();
  }

  /* effective size under partial selfing (Pollak 1987 approximation) */
  function Ne() {
    const F = sim.self / (2 - sim.self);
    return Math.max(2, Math.round(sim.N / (1 + F)));
  }

  function step() {
    if (sim.gen >= sim.maxGen) return false;
    const pbar = sim.p.reduce((a, b) => a + b, 0) / sim.D;
    const ne = Ne(), h = 0.5;
    const next = sim.p.map(p => {
      /* 1. selection: w_AA = 1 + s, w_Aa = 1 + hs, w_aa = 1 */
      if (sim.s !== 0) {
        const q = 1 - p;
        const wbar = p * p * (1 + sim.s) + 2 * p * q * (1 + h * sim.s) + q * q;
        p = (p * p * (1 + sim.s) + p * q * (1 + h * sim.s)) / wbar;
      }
      /* 2. migration: island model toward the metapopulation mean */
      if (sim.m > 0) p = (1 - sim.m) * p + sim.m * pbar;
      /* 3. mutation, symmetric */
      if (sim.u > 0) p = p * (1 - sim.u) + (1 - p) * sim.u;
      /* 4. drift: binomial sampling of 2Ne gene copies */
      return rbinom(sim.r, 2 * ne, Math.max(0, Math.min(1, p))) / (2 * ne);
    });
    sim.p = next;
    sim.gen++;
    sim.p.forEach((p, d) => sim.hist[d].push(p));
    record();
    return true;
  }

  /* Nei's gene diversity partition, recomputed every generation */
  function record() {
    const pbar = sim.p.reduce((a, b) => a + b, 0) / sim.D;
    const HT = 2 * pbar * (1 - pbar);
    const HS = sim.p.reduce((a, p) => a + 2 * p * (1 - p), 0) / sim.D;
    const FST = HT > 0 ? (HT - HS) / HT : 0;
    const fixed = sim.p.filter(p => p === 0 || p === 1).length;
    sim.stats.push({ gen: sim.gen, HT, HS, FST, pbar, fixed });
  }

  /* ---------------- drawing ---------------- */
  function draw() {
    drawTrajectories();
    drawDiversity();
    readout();
  }

  function drawTrajectories() {
    const svg = el('simTraj');
    if (!svg) return;
    const W = 440, H = 290, x0 = 34, x1 = W - 12, y0 = H - 26, y1 = 14;
    const X = g => x0 + (g / sim.maxGen) * (x1 - x0);
    const Y = p => y0 - p * (y0 - y1);
    let s = '';
    /* grid */
    [0, 0.25, 0.5, 0.75, 1].forEach(p => {
      s += `<line x1="${x0}" y1="${Y(p).toFixed(1)}" x2="${x1}" y2="${Y(p).toFixed(1)}" stroke="var(--border)" stroke-dasharray="${p === 0.5 ? '4 4' : '2 5'}"/>`;
      s += `<text x="${x0 - 6}" y="${(Y(p) + 3).toFixed(1)}" font-size="9" text-anchor="end" fill="var(--text-muted)">${p}</text>`;
    });
    s += `<line x1="${x0}" y1="${y0}" x2="${x1}" y2="${y0}" stroke="var(--border-strong)"/>`;
    /* one line per deme */
    sim.hist.forEach((h, d) => {
      const pts = h.map((p, g) => `${g ? 'L' : 'M'}${X(g).toFixed(1)} ${Y(p).toFixed(1)}`).join(' ');
      const fixedNow = h[h.length - 1] === 0 || h[h.length - 1] === 1;
      s += `<path d="${pts}" fill="none" stroke="${clusterColor(d)}" stroke-width="${fixedNow ? 2.6 : 1.9}" opacity="${fixedNow ? 1 : 0.85}" stroke-linejoin="round"/>`;
      const last = h[h.length - 1];
      s += `<circle cx="${X(sim.gen).toFixed(1)}" cy="${Y(last).toFixed(1)}" r="3" fill="${clusterColor(d)}"/>`;
    });
    /* mean allele frequency */
    if (sim.stats.length > 1) {
      const pts = sim.stats.map((t, g) => `${g ? 'L' : 'M'}${X(t.gen).toFixed(1)} ${Y(t.pbar).toFixed(1)}`).join(' ');
      s += `<path d="${pts}" fill="none" stroke="var(--text)" stroke-width="1.6" stroke-dasharray="5 4" opacity="0.75"/>`;
    }
    s += `<text x="${(x0 + x1) / 2}" y="${H - 6}" font-size="10" text-anchor="middle" fill="var(--text-muted)">generations</text>`;
    s += `<text x="12" y="${(y0 + y1) / 2}" font-size="10" text-anchor="middle" fill="var(--text-muted)" font-style="italic" transform="rotate(-90 12 ${(y0 + y1) / 2})">allele frequency p</text>`;
    svg.innerHTML = s;
  }

  function drawDiversity() {
    const svg = el('simDiv');
    if (!svg) return;
    const W = 340, H = 290, x0 = 36, x1 = W - 14, y0 = 150, y1 = 16;
    const X = g => x0 + (g / sim.maxGen) * (x1 - x0);
    const Y = v => y0 - (v / 0.5) * (y0 - y1);
    let s = '';
    [0, 0.25, 0.5].forEach(v => {
      s += `<line x1="${x0}" y1="${Y(v).toFixed(1)}" x2="${x1}" y2="${Y(v).toFixed(1)}" stroke="var(--border)" stroke-dasharray="2 5"/>`;
      s += `<text x="${x0 - 5}" y="${(Y(v) + 3).toFixed(1)}" font-size="8.5" text-anchor="end" fill="var(--text-muted)">${v}</text>`;
    });
    const line = (key, color, dash) => {
      const pts = sim.stats.map((t, i) => `${i ? 'L' : 'M'}${X(t.gen).toFixed(1)} ${Y(t[key]).toFixed(1)}`).join(' ');
      return `<path d="${pts}" fill="none" stroke="${color}" stroke-width="2.2" ${dash ? 'stroke-dasharray="5 4"' : ''}/>`;
    };
    /* expected decay of H_S under pure drift: H_t = H_0 (1 - 1/2Ne)^t */
    const ne = Ne(), H0 = sim.stats.length ? sim.stats[0].HS : 0.5;
    let exp = '';
    for (let g = 0; g <= sim.maxGen; g += 2) {
      const v = H0 * Math.pow(1 - 1 / (2 * ne), g);
      exp += (g ? 'L' : 'M') + X(g).toFixed(1) + ' ' + Y(v).toFixed(1) + ' ';
    }
    s += `<path d="${exp}" fill="none" stroke="var(--text-muted)" stroke-width="1.2" stroke-dasharray="3 3" opacity="0.8"/>`;
    s += line('HT', 'var(--accent)', false);
    s += line('HS', 'var(--primary)', false);
    s += `<line x1="${x0}" y1="${y0}" x2="${x1}" y2="${y0}" stroke="var(--border-strong)"/>`;
    /* legend in the gap between the two panels, where no curve can cover it */
    const sub = t => `<tspan baseline-shift="sub" font-size="7">${t}</tspan>`;
    const ly = y0 + 14;
    s += `<line x1="${x0}" y1="${ly - 3}" x2="${x0 + 14}" y2="${ly - 3}" stroke="var(--accent)" stroke-width="2.2"/><text x="${x0 + 18}" y="${ly}" font-size="9" fill="var(--accent)" font-weight="700">H${sub('T')} total</text>`;
    s += `<line x1="${x0 + 80}" y1="${ly - 3}" x2="${x0 + 94}" y2="${ly - 3}" stroke="var(--primary)" stroke-width="2.2"/><text x="${x0 + 98}" y="${ly}" font-size="9" fill="var(--primary)" font-weight="700">H${sub('S')} within demes</text>`;
    s += `<line x1="${x0 + 196}" y1="${ly - 3}" x2="${x0 + 210}" y2="${ly - 3}" stroke="var(--text-muted)" stroke-width="1.2" stroke-dasharray="3 3"/><text x="${x0 + 214}" y="${ly}" font-size="8" fill="var(--text-muted)">drift only: H₀(1−1/2Nₑ)ᵗ</text>`;

    /* F_ST panel underneath */
    const fy0 = 258, fy1 = 182;
    const FY = v => fy0 - Math.min(1, v) * (fy0 - fy1);
    [0, 0.5, 1].forEach(v => {
      s += `<line x1="${x0}" y1="${FY(v).toFixed(1)}" x2="${x1}" y2="${FY(v).toFixed(1)}" stroke="var(--border)" stroke-dasharray="2 5"/>`;
      s += `<text x="${x0 - 5}" y="${(FY(v) + 3).toFixed(1)}" font-size="8.5" text-anchor="end" fill="var(--text-muted)">${v}</text>`;
    });
    const fpts = sim.stats.map((t, i) => `${i ? 'L' : 'M'}${X(t.gen).toFixed(1)} ${FY(t.FST).toFixed(1)}`).join(' ');
    s += `<path d="${fpts}" fill="none" stroke="var(--c6)" stroke-width="2.4"/>`;
    /* Wright's island-model expectation 1/(1 + 4 N m) */
    if (sim.m > 0) {
      const exp = 1 / (1 + 4 * Ne() * sim.m);
      s += `<line x1="${x0}" y1="${FY(exp).toFixed(1)}" x2="${x1}" y2="${FY(exp).toFixed(1)}" stroke="var(--c6)" stroke-width="1.2" stroke-dasharray="4 3" opacity="0.75"/>`;
      s += `<text x="${x1}" y="${(FY(exp) - 4).toFixed(1)}" font-size="8" text-anchor="end" fill="var(--c6)">expected 1/(1+4Nₑm) = ${exp.toFixed(3)}</text>`;
    }
    s += `<line x1="${x0}" y1="${fy0}" x2="${x1}" y2="${fy0}" stroke="var(--border-strong)"/>`;
    s += `<text x="${x0 + 4}" y="${fy1 - 6}" font-size="9" fill="var(--c6)" font-weight="700">F<tspan baseline-shift="sub" font-size="7">ST</tspan> among demes</text>`;
    s += `<text x="${(x0 + x1) / 2}" y="${H - 6}" font-size="10" text-anchor="middle" fill="var(--text-muted)">generations</text>`;
    svg.innerHTML = s;
  }

  function readout() {
    const t = sim.stats[sim.stats.length - 1] || { HT: 0, HS: 0, FST: 0, fixed: 0, pbar: 0 };
    const set = (id, v) => { const n = el(id); if (n) n.textContent = v; };
    set('rdGen', sim.gen);
    set('rdP', t.pbar.toFixed(3));
    set('rdHs', t.HS.toFixed(3));
    set('rdFst', t.FST.toFixed(3));
    set('rdFixed', t.fixed + ' / ' + sim.D);
    set('rdNe', Ne());
    const st = el('simStatus');
    if (st) {
      const lost = sim.p.filter(p => p === 0).length, fix = sim.p.filter(p => p === 1).length;
      let msg;
      if (sim.gen === 0) msg = `Every deme starts at p = ${sim.p0}. Press <b>Run</b> and watch the lines wander apart — that is drift, and the wandering is what F<sub>ST</sub> measures.`;
      else if (fix === sim.D || lost === sim.D) msg = `<b>All ${sim.D} demes are fixed for the same allele</b> (${fix ? 'A' : 'a'}) after ${sim.gen} generations. No variation is left anywhere: H<sub>S</sub> = H<sub>T</sub> = 0, so F<sub>ST</sub> is undefined (shown as 0). Only mutation can bring variation back.`;
      else if (fix + lost === sim.D) msg = `<b>All ${sim.D} demes are fixed</b> (${fix} for A, ${lost} for a) after ${sim.gen} generations. Within-deme diversity is gone: H<sub>S</sub> = 0 and F<sub>ST</sub> = 1. Only migration or mutation can bring variation back.`;
      else if (sim.m >= 0.05) msg = `With m = ${sim.m}, roughly ${(4 * Ne() * sim.m).toFixed(1)} migrants per generation keep the demes together: F<sub>ST</sub> hovers near ${(1 / (1 + 4 * Ne() * sim.m)).toFixed(3)}.`;
      else msg = `Generation ${sim.gen}: mean p = ${t.pbar.toFixed(3)}, H<sub>S</sub> = ${t.HS.toFixed(3)}, F<sub>ST</sub> = ${t.FST.toFixed(3)}. ${t.fixed ? `<b>${t.fixed} deme(s) already fixed.</b>` : ''}`;
      st.innerHTML = msg;
    }
  }

  /* ---------------- controls ---------------- */
  function run() {
    if (sim.timer) { stop(); return; }
    const btn = el('simRun');
    if (sim.gen >= sim.maxGen) reset(true);
    if (btn) btn.textContent = '❚❚ Pause';
    sim.timer = setInterval(() => {
      const ok = step();
      draw();
      if (!ok) stop();
    }, 70);
  }
  function stop() {
    if (sim.timer) clearInterval(sim.timer);
    sim.timer = null;
    const btn = el('simRun');
    if (btn) btn.textContent = '▶ Run';
  }

  function bindSlider(id, key, fmt, after) {
    const inp = el(id), out = el(id + 'Val');
    if (!inp) return;
    const show = () => { if (out) out.textContent = fmt ? fmt(sim[key]) : sim[key]; };
    inp.value = sim[key];
    show();
    inp.addEventListener('input', () => {
      sim[key] = Number(inp.value);
      show();
      if (after) after();
      draw();
    });
  }

  function init() {
    if (!el('simTraj')) return;
    bindSlider('simN', 'N', v => v, () => reset(true));
    bindSlider('simD', 'D', v => v, () => reset(true));
    bindSlider('simM', 'm', v => v.toFixed(3));
    bindSlider('simS', 's', v => (v > 0 ? '+' : '') + v.toFixed(2));
    bindSlider('simU', 'u', v => (v === 0 ? '0' : v.toExponential(1)));
    bindSlider('simSelf', 'self', v => (v * 100).toFixed(0) + '%');
    const on = (id, fn) => { const n = el(id); if (n) n.addEventListener('click', fn); };
    on('simRun', run);
    on('simStep', () => { stop(); step(); draw(); });
    on('simReset', () => { stop(); reset(true); });
    on('simNew', () => { stop(); reset(false); draw(); });
    const preset = el('simPreset');
    const applyPreset = () => {
      stop();
      const p = {
        drift: { N: 25, D: 6, m: 0, s: 0, u: 0, self: 0 },
        island: { N: 100, D: 6, m: 0.02, s: 0, u: 0, self: 0 },
        selfer: { N: 100, D: 6, m: 0.005, s: 0, u: 0, self: 0.9 },
        select: { N: 100, D: 6, m: 0.01, s: 0.1, u: 0, self: 0 },
        mutdrift: { N: 40, D: 6, m: 0, s: 0, u: 0.001, self: 0 },
      }[preset.value];
      if (p) {
        Object.assign(sim, p);
        ['simN:N', 'simD:D', 'simM:m', 'simS:s', 'simU:u', 'simSelf:self'].forEach(pair => {
          const [id, key] = pair.split(':');
          const inp = el(id); if (inp) { inp.value = sim[key]; inp.dispatchEvent(new Event('input')); }
        });
      }
      reset(true);
    };
    if (preset) preset.addEventListener('change', applyPreset);
    /* start from the scenario shown in the list, so the sliders and the list agree */
    if (preset) applyPreset(); else reset(true);
  }

  document.addEventListener('DOMContentLoaded', init);
  window.Sim = sim;
})();
