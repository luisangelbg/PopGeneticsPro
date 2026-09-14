/* PopGeneticsPro — global state and shared utilities.
   No ES modules: everything hangs from window so the app also works from file://

   The data model is deliberately marker-agnostic. Every analysis block reads
   `state.data`, never the raw file, so a microsatellite study, an AFLP gel, a
   chloroplast alignment and a morphological matrix all travel through the same
   pipeline. */

const state = {
  /* --- Block 2: data --- */
  fileName: null,
  sheetName: null,
  sheets: [],
  workbook: null,
  format: null,          // 'table' | 'str' | 'gen' | 'arp' | 'fasta' | 'vcf'

  /* The analysis-ready dataset (filled by Block 2, read by everybody else).
     ind    : [{id, pop, region, lat, lon, x, y, ploidy}]
     loci   : [{name, type, alleles:[codes...], ploidy, linkage}]
              type: 'codominant' | 'dominant' | 'haploid' | 'sequence' | 'quantitative' | 'ordinal' | 'nominal'
     geno   : geno[i][l] = array of allele codes of length ploidy (codominant),
              [0|1] (dominant band), [code] (haploid / sequence haplotype),
              or null when the genotype is missing.
     pops   : [{name, idx:[individual indices], region}]
     regions: [{name, pops:[pop indices]}]
     seqs   : {alignment:[strings], sites, haplotypes:[...]} when sequences were loaded
     morph  : {vars:[{name,kind}], values:[[...]]} when morphological traits travel along */
  data: null,

  /* --- results, one slot per block --- */
  freq: null,        // Block 3: allele frequencies and diversity
  hwe: null,         // Block 4: Hardy-Weinberg, F_IS, null alleles, linkage disequilibrium
  fstats: null,      // Block 5: F/G/R statistics, pairwise differentiation
  amova: null,       // Block 5: hierarchical AMOVA
  dist: null,        // Block 6: genetic distance matrices
  ordination: null,  // Block 6: PCoA / NJ / UPGMA
  structure: null,   // Block 7: Bayesian clustering, DAPC, assignment
  dnaseq: null,      // Block 8: haplotype diversity, neutrality tests, networks
  demog: null,       // Block 9: bottlenecks, Ne, spatial genetic structure
  figures: {},       // every figure registered for the report and the ZIP
  /* what the rows are called in the texts: individuals by default, landraces for a
     transposed band matrix with one sample per landrace, or whatever the user picks */
  unit: { s: 'individual', p: 'individuals' },
};
window.state = state;

const UNIT_NAMES = {
  individuals: ['individual', 'individuals'], landraces: ['landrace', 'landraces'], accessions: ['accession', 'accessions'],
  varieties: ['variety', 'varieties'], populations: ['population', 'populations'], clones: ['clone', 'clones'],
  genotypes: ['genotype', 'genotypes'], samples: ['sample', 'samples'], OTUs: ['OTU', 'OTUs'],
};
/* UNIT() → "landraces" · UNIT(false) → "landrace" · UNIT(true, true) → "Landraces" */
function UNIT(plural, cap) {
  const w = plural === false ? state.unit.s : state.unit.p;
  return cap ? w.charAt(0).toUpperCase() + w.slice(1) : w;
}
function setUnit(key) { const u = UNIT_NAMES[key] || UNIT_NAMES.individuals; state.unit = { s: u[0], p: u[1], key: UNIT_NAMES[key] ? key : 'individuals' }; }

/* ---------------- DOM ---------------- */
function el(id) { return document.getElementById(id); }
function els(sel, root) { return [...(root || document).querySelectorAll(sel)]; }
function mk(tag, attrs, html) {
  const n = document.createElement(tag);
  if (attrs) for (const k in attrs) {
    if (k === 'class') n.className = attrs[k];
    else if (k === 'style') n.setAttribute('style', attrs[k]);
    else if (k.startsWith('on') && typeof attrs[k] === 'function') n.addEventListener(k.slice(2), attrs[k]);
    else if (attrs[k] != null) n.setAttribute(k, attrs[k]);
  }
  if (html != null) n.innerHTML = html;
  return n;
}
function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
/* SVG helper: the illustrations and every plot are built as real SVG nodes */
function svgEl(tag, attrs, text) {
  const n = document.createElementNS('http://www.w3.org/2000/svg', tag);
  if (attrs) for (const k in attrs) if (attrs[k] != null) n.setAttribute(k, attrs[k]);
  if (text != null) n.textContent = text;
  return n;
}

function showMessage(container, type, text) {
  if (typeof container === 'string') container = el(container);
  if (!container) return null;
  const div = mk('div', { class: 'msg msg-' + type }, text);
  container.appendChild(div);
  return div;
}
function clearMessages(container) {
  if (typeof container === 'string') container = el(container);
  if (container) container.innerHTML = '';
}

/* Statistic symbols in short labels: F_ST, Φ_PT, N_e, θ_B … get a true
   subscript, and symbols whose case carries meaning (θ, π, Nm, N_e) are kept
   out of the upper-casing that tile labels use, so θ never turns into Θ. */
const SYM_RE = /(?<![A-Za-z0-9])(r̄|G′|G'|F|Φ|G|P|Q|N|H|I|D|θ)_(ST|IS|IT|CT|SC|PT|RT|S|T|e|A|d|B)(?![A-Za-z0-9])/g;
function symbolHTML(s) {
  return String(s)
    .replace(SYM_RE, '<span class="nc">$1<sub>$2</sub></span>')
    .replace(/(?<![A-Za-z])(Nm|[Ͱ-Ͽ]+)(?![A-Za-z])/g, '<span class="nc">$1</span>');
}
function statTiles(container, tiles) {
  if (typeof container === 'string') container = el(container);
  container.innerHTML = '';
  tiles.forEach(t => {
    const [label, value, sub, level] = Array.isArray(t) ? t : [t.label, t.value, t.sub, t.level];
    const d = mk('div', { class: 'stat-tile' + (level ? ' ' + level : '') });
    d.innerHTML = `<div class="stat-label">${symbolHTML(label)}</div><div class="stat-value">${value}</div>` +
      (sub ? `<div class="stat-sub">${String(sub).replace(SYM_RE, '$1<sub>$2</sub>')}</div>` : '');
    container.appendChild(d);
  });
}

/* Builds a <table>. columns: [{key,label,get?,fmt?,num?,html?}] */
function buildTable(container, columns, rows, opts) {
  opts = opts || {};
  if (typeof container === 'string') container = el(container);
  container.innerHTML = '';
  const table = mk('table');
  if (opts.className) table.className = opts.className;
  if (opts.caption) table.appendChild(mk('caption', null, opts.caption));
  const thead = mk('thead'), trh = mk('tr');
  columns.forEach(c => {
    const th = mk('th', { class: c.num ? 'num' : null });
    th.innerHTML = c.label != null ? c.label : c.key;
    trh.appendChild(th);
  });
  thead.appendChild(trh); table.appendChild(thead);
  const tbody = mk('tbody');
  const shown = opts.limit ? rows.slice(0, opts.limit) : rows;
  shown.forEach(r => {
    const tr = mk('tr');
    if (r && r._class) tr.className = r._class;
    columns.forEach(c => {
      const td = mk('td', { class: c.num ? 'num' : null });
      let v = c.get ? c.get(r) : r[c.key];
      if (c.html) { td.innerHTML = v == null ? '—' : v; tr.appendChild(td); return; }
      if (c.fmt && v != null && v !== '') v = c.fmt(v);
      td.textContent = (v === null || v === undefined || v === '' ||
        (typeof v === 'number' && !isFinite(v))) ? '—' : v;
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  container.appendChild(table);
  if (opts.limit && rows.length > opts.limit) {
    const p = mk('p', { class: 'hint', style: 'padding:6px 12px;margin:0' });
    p.textContent = `Showing ${opts.limit} of ${rows.length} rows.`;
    container.appendChild(p);
  }
  return table;
}

function tableToCSV(table) {
  const rows = [...table.querySelectorAll('tr')].map(tr =>
    [...tr.children].map(td => csvEscape(td.textContent.trim())).join(','));
  return '﻿' + rows.join('\r\n');
}

/* ---------------- numbers ---------------- */
function fmtNum(v, d) {
  if (v === null || v === undefined || v === '' || (typeof v === 'number' && !isFinite(v))) return '—';
  const n = Number(v);
  if (!isFinite(n)) return String(v);
  if (n === 0) return '0';
  const abs = Math.abs(n);
  if (abs < 1e-4 || abs >= 1e7) return n.toExponential(d != null ? d : 2);
  return n.toLocaleString('en-US', { maximumFractionDigits: d != null ? d : 3 });
}
function fmtFixed(v, d) {
  if (v === Infinity) return '∞';
  if (v === -Infinity) return '−∞';
  if (v == null || !isFinite(v)) return '—';
  return Number(v).toFixed(d == null ? 3 : d);
}
function fmtP(p) {
  if (p == null || !isFinite(p)) return '—';
  if (p < 0.0001) return '< 0.0001';
  return Number(p).toFixed(4);
}
/* significance stars, the convention used throughout the genetics literature */
function stars(p) {
  if (p == null || !isFinite(p)) return '';
  if (p < 0.001) return '***';
  if (p < 0.01) return '**';
  if (p < 0.05) return '*';
  return 'ns';
}
function fmtPct(x, d) {
  if (x == null || !isFinite(x)) return '—';
  return (x * 100).toLocaleString('en-US', { maximumFractionDigits: d == null ? 1 : d }) + '%';
}

/* ---------------- CSV / downloads ---------------- */
function csvEscape(v) {
  const s = String(v ?? '');
  return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function matrixToCSV(header, rows) {
  const head = header.map(csvEscape).join(',');
  const body = rows.map(r => r.map(csvEscape).join(','));
  return '﻿' + [head, ...body].join('\r\n');
}
function download(content, filename, mime) {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mime || 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = mk('a', { href: url, download: filename });
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
function slug(s) {
  return String(s || 'popgeneticspro').replace(/\.[^.]+$/, '')
    .normalize('NFD').replace(new RegExp('[\\u0300-\\u036f]', 'g'), '')
    .replace(/[^\w\-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'popgeneticspro';
}

/* ---------------- step navigation ---------------- */
function goStep(n) {
  els('.step-panel').forEach(p => p.classList.toggle('active', p.id === 'panel-' + n));
  els('.step-btn').forEach(b => b.classList.toggle('active', b.dataset.step === String(n)));
  document.body.classList.toggle('on-home', String(n) === '1');
  window.scrollTo({ top: 0, behavior: 'smooth' });
  document.dispatchEvent(new CustomEvent('stepchange', { detail: { step: n } }));
}
function enableStep(n, on) {
  const b = document.querySelector('.step-btn[data-step="' + n + '"]');
  if (b) b.disabled = (on === false);
}

/* "Continue" at the foot of a block: open the next block, or say why it does
   not apply to these data and offer the next one that does. The conditions
   are those set by enableStep in Block 2. */
const STEP_NEEDS = {
  3: 'Block 3 (diversity) needs loci or traits to describe',
  4: 'Block 4 (Hardy–Weinberg and linkage) needs a population with five or more individuals and at least two loci, and does not apply to traits or to a single alignment',
  5: 'Block 5 (F-statistics and AMOVA) needs at least two populations with two or more individuals each, and molecular markers',
  6: 'Block 6 (distances and trees) needs at least three units',
  7: 'Block 7 (Bayesian clustering) needs six or more individuals and three polymorphic markers, and does not apply to traits or to a single alignment',
  8: 'Block 8 (DNA sequences) needs aligned sequences',
  9: 'Block 9 (demography and spatial structure) needs codominant populations with ten or more plants, ten or more mapped individuals, or traits',
};
function continueAfter(step, host) {
  const open = k => { const b = document.querySelector('.step-btn[data-step="' + k + '"]'); return b && !b.disabled; };
  if (open(step + 1)) { goStep(step + 1); return; }
  let k = step + 2;
  while (k <= 10 && !open(k)) k++;
  if (typeof host === 'string') host = el(host);
  if (!host) return;
  host.querySelectorAll('.msg-skip').forEach(n => n.remove());
  const div = showMessage(host, 'info', `${STEP_NEEDS[step + 1] || 'The next block does not apply to these data'}, so it is not available for these data.`);
  div.classList.add('msg-skip');
  if (k <= 10) {
    const go = mk('button', { class: 'btn btn-secondary btn-sm', style: 'margin-left:10px' }, `Go to Block ${k} →`);
    go.addEventListener('click', () => goStep(k));
    div.appendChild(go);
  }
  /* the message box sits at the top of the block, far from the button that was pressed */
  div.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

/* Persisted user preferences (figure style, last settings) */
const Prefs = {
  get(k, d) { try { const v = localStorage.getItem('popgeneticspro:' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('popgeneticspro:' + k, JSON.stringify(v)); } catch (e) { /* ignore */ } },
};

/* ---------------- random numbers ----------------
   Everything stochastic in this app (permutation tests, bootstrap, MCMC, the
   simulator on the home page) draws from a seeded generator, so a run is
   reproducible and the seed can be reported in the methods section. */
function rng(seed) { let s = (seed >>> 0) || 1; return () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; }; }
function randn(r) { let u = 0, v = 0; while (u === 0) u = r(); while (v === 0) v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
/* Binomial draw — the engine of Wright-Fisher sampling. Exact for the small n
   used by the simulator; normal approximation above 200 trials. */
function rbinom(r, n, p) {
  if (p <= 0) return 0;
  if (p >= 1) return n;
  if (n > 200) {
    const x = Math.round(n * p + Math.sqrt(n * p * (1 - p)) * randn(r));
    return Math.max(0, Math.min(n, x));
  }
  let k = 0;
  for (let i = 0; i < n; i++) if (r() < p) k++;
  return k;
}
/* Multinomial draw over a probability vector (allele sampling between generations) */
function rmultinom(r, n, probs) {
  const out = new Array(probs.length).fill(0);
  let rest = n, cum = 0;
  for (let i = 0; i < probs.length - 1 && rest > 0; i++) {
    const pi = probs[i] / (1 - cum);
    const k = rbinom(r, rest, Math.max(0, Math.min(1, pi)));
    out[i] = k; rest -= k; cum += probs[i];
  }
  out[probs.length - 1] = rest;
  return out;
}
/* Fisher-Yates shuffle, in place — permutation tests everywhere */
function shuffle(arr, r) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
  }
  return arr;
}

/* ---------------- cluster / population colours ----------------
   A genetic cluster keeps the same colour across the whole app: the admixture
   barplot, the PCoA scatter, the map and the tree tips all agree. */
const CLUSTER_VARS = ['--c1', '--c2', '--c3', '--c4', '--c5', '--c6', '--c7', '--c8', '--c9', '--c10'];
function clusterColor(i) {
  const css = getComputedStyle(document.documentElement);
  const v = css.getPropertyValue(CLUSTER_VARS[i % CLUSTER_VARS.length]).trim();
  return v || '#146b7a';
}
function clusterClass(i) { return 'art-c' + ((i % 10) + 1); }

Object.assign(window, {
  el, els, mk, esc, svgEl, showMessage, clearMessages, statTiles, buildTable, tableToCSV,
  fmtNum, fmtFixed, fmtP, fmtPct, stars, csvEscape, matrixToCSV, download, slug,
  goStep, enableStep, Prefs, rng, randn, rbinom, rmultinom, shuffle,
  clusterColor, clusterClass, CLUSTER_VARS,
});
