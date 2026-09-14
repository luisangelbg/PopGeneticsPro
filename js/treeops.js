/* PopGeneticsPro — operations on trees shared by the tree studio and the
   divergence-time analysis.

   Node format used everywhere in the app:
     { tip: index | undefined, label, children: [{ node, len }], support, age, hpd, calib }
   Parents are never stored (the objects can be cloned and posted to a Worker);
   they are rebuilt on demand with index(). */

(function () {

  function isTip(n) { return n.tip != null; }
  function tips(node, out) { out = out || []; if (isTip(node)) out.push(node); node.children.forEach(c => tips(c.node, out)); return out; }
  function nodes(node, out) { out = out || []; out.push(node); node.children.forEach(c => nodes(c.node, out)); return out; }

  /* parent map, branch length to parent and distance from the root */
  function index(root) {
    const parent = new Map(), lenUp = new Map(), depth = new Map(), order = [];
    const walk = (n, d) => {
      depth.set(n, d); order.push(n);
      n.children.forEach(c => { parent.set(c.node, n); lenUp.set(c.node, c.len); walk(c.node, d + (c.len || 0)); });
    };
    walk(root, 0);
    return { parent, lenUp, depth, order, postorder: order.slice().reverse() };
  }

  function clone(node) {
    const out = Object.assign({}, node, { children: node.children.map(c => ({ node: clone(c.node), len: c.len })) });
    if (node.hpd) out.hpd = node.hpd.slice();
    return out;
  }

  function tipSet(node) { return new Set(tips(node).map(t => t.tip)); }

  /* most recent common ancestor of a set of tip indices */
  function mrca(root, tipIdx) {
    const want = new Set(tipIdx);
    if (!want.size) return null;
    let best = null;
    const walk = n => {
      const s = isTip(n) ? (want.has(n.tip) ? 1 : 0) : n.children.reduce((a, c) => a + walk(c.node), 0);
      if (s === want.size && !best) best = n;
      return s;
    };
    walk(root);
    return best;
  }

  function isMonophyletic(root, tipIdx) {
    const m = mrca(root, tipIdx);
    return !!m && tips(m).length === new Set(tipIdx).size;
  }

  /* number of tips below every node */
  function tipCounts(root) {
    const m = new Map();
    const walk = n => { const c = isTip(n) ? 1 : n.children.reduce((a, ch) => a + walk(ch.node), 0); m.set(n, c); return c; };
    walk(root);
    return m;
  }

  function ladderize(root, direction) {
    const counts = tipCounts(root);
    const out = clone(root);
    const cc = tipCounts(out);
    const walk = n => {
      n.children.sort((a, b) => (direction === 'down' ? cc.get(b.node) - cc.get(a.node) : cc.get(a.node) - cc.get(b.node)));
      n.children.forEach(c => walk(c.node));
    };
    if (direction && direction !== 'none') walk(out);
    return direction && direction !== 'none' ? out : clone(root);
  }

  /* Re-root on the branch above `target`, splitting it at fraction `frac` from
     the target. Support values belong to branches (splits): each is stored on the
     node below its branch, so when a branch reverses direction its value moves. */
  function rerootAt(root, target, frac) {
    if (target === root) return clone(root);
    frac = frac == null ? 0.5 : Math.max(0, Math.min(1, frac));
    /* undirected adjacency with the support of each edge */
    const adj = new Map();
    const addEdge = (a, b, len, sup) => {
      if (!adj.has(a)) adj.set(a, []);
      if (!adj.has(b)) adj.set(b, []);
      adj.get(a).push({ to: b, len, sup }); adj.get(b).push({ to: a, len, sup });
    };
    nodes(root).forEach(n => n.children.forEach(c => addEdge(n, c.node, c.len || 0, c.node.support)));
    const ix = index(root);
    const p = ix.parent.get(target);
    const L = ix.lenUp.get(target) || 0;
    const supEdge = target.support;
    const copyNode = n => { const o = Object.assign({}, n, { children: [] }); delete o.support; delete o.age; delete o.hpd; return o; };
    const build = (n, from) => {
      const o = copyNode(n);
      (adj.get(n) || []).forEach(e => {
        if (e.to === from) return;
        const child = build(e.to, n);
        if (e.sup != null && !isTip(e.to)) child.support = e.sup;
        o.children.push({ node: child, len: e.len });
      });
      return o;
    };
    /* build both sides without crossing the root branch */
    const sideT = (() => {
      const o = copyNode(target);
      (adj.get(target) || []).forEach(e => {
        if (e.to === p) return;
        const child = build(e.to, target);
        if (e.sup != null && !isTip(e.to)) child.support = e.sup;
        o.children.push({ node: child, len: e.len });
      });
      return o;
    })();
    const sideP = (() => {
      const o = copyNode(p);
      (adj.get(p) || []).forEach(e => {
        if (e.to === target) return;
        const child = build(e.to, p);
        if (e.sup != null && !isTip(e.to)) child.support = e.sup;
        o.children.push({ node: child, len: e.len });
      });
      return o;
    })();
    if (!isTip(sideT) && supEdge != null) sideT.support = supEdge;
    if (!isTip(sideP) && supEdge != null) sideP.support = supEdge;
    const newRoot = { children: [{ node: sideT, len: L * frac }, { node: sideP, len: L * (1 - frac) }] };
    return collapseUnary(newRoot);
  }

  /* nodes left with a single child (the old root) are merged into their branch */
  function collapseUnary(root) {
    const walk = n => {
      n.children = n.children.map(c => {
        let child = c.node, len = c.len || 0;
        while (!isTip(child) && child.children.length === 1) { len += child.children[0].len || 0; child = child.children[0].node; }
        walk(child);
        return { node: child, len };
      });
    };
    while (!isTip(root) && root.children.length === 1) root = root.children[0].node;
    walk(root);
    return root;
  }

  function rerootOutgroup(root, tipIdx) {
    const want = new Set(tipIdx);
    const all = tips(root).map(t => t.tip);
    if (!want.size || want.size >= all.length) return clone(root);
    /* the outgroup may be monophyletic only on the other side of the current root */
    let m = mrca(root, [...want]);
    if (m && tips(m).length === want.size) return rerootAt(root, m, 0.5);
    const ingroup = all.filter(t => !want.has(t));
    m = mrca(root, ingroup);
    if (m && tips(m).length === ingroup.length && m !== root) return rerootAt(root, m, 0.5);
    return null;          // the outgroup is not monophyletic on this tree
  }

  function midpointRoot(root) {
    const ix = index(root);
    const tipsAll = tips(root);
    if (tipsAll.length < 3) return clone(root);
    /* distances between every pair of tips through their MRCA */
    const adj = new Map();
    nodes(root).forEach(n => n.children.forEach(c => {
      if (!adj.has(n)) adj.set(n, []); if (!adj.has(c.node)) adj.set(c.node, []);
      adj.get(n).push([c.node, c.len || 0]); adj.get(c.node).push([n, c.len || 0]);
    }));
    const far = from => {
      const dist = new Map([[from, 0]]), prev = new Map(), stack = [from];
      while (stack.length) { const u = stack.pop(); (adj.get(u) || []).forEach(([v, w]) => { if (!dist.has(v)) { dist.set(v, dist.get(u) + w); prev.set(v, u); stack.push(v); } }); }
      let best = from; tipsAll.forEach(t => { if (dist.get(t) > dist.get(best)) best = t; });
      return { best, dist, prev };
    };
    const a = far(tipsAll[0]).best;
    const fb = far(a);
    const b = fb.best, total = fb.dist.get(b);
    if (!(total > 0)) return clone(root);
    /* walk back from b towards a until the midpoint is crossed */
    let u = b, acc = 0;
    while (fb.prev.has(u)) {
      const v = fb.prev.get(u);
      const w = fb.dist.get(u) - fb.dist.get(v);
      if (acc + w >= total / 2) {
        const intoEdge = total / 2 - acc;          // distance from u along u→v
        /* the edge is parent→child in one direction or the other */
        if (ix.parent.get(u) === v) return rerootAt(root, u, w ? intoEdge / w : 0.5);
        return rerootAt(root, v, w ? 1 - intoEdge / w : 0.5);
      }
      acc += w; u = v;
    }
    return clone(root);
  }

  /* ---------------- Newick / NEXUS ---------------- */

  /* labels: optional array of tip names; tips found in it take that index, others
     are appended. Internal labels that are numbers become support (0–1). Comments
     [&height=…, height_95%_HPD={a,b}] are read as ages. */
  function parseNewick(text, labels) {
    const s = String(text).trim().replace(/;[\s\S]*$/, '');
    let i = 0;
    const names = labels ? labels.slice() : [];
    const byName = new Map(names.map((n, k) => [String(n), k]));
    const tipIndex = nm => {
      if (byName.has(nm)) return byName.get(nm);
      const alt = nm.replace(/_/g, ' ');
      if (byName.has(alt)) return byName.get(alt);
      const k = names.length; names.push(nm); byName.set(nm, k); return k;
    };
    const skipWs = () => { while (i < s.length && /\s/.test(s[i])) i++; };
    const readLabel = () => {
      skipWs();
      if (s[i] === "'" || s[i] === '"') {
        const q = s[i++]; let out = '';
        while (i < s.length) { if (s[i] === q) { if (s[i + 1] === q) { out += q; i += 2; continue; } i++; break; } out += s[i++]; }
        return out;
      }
      let out = '';
      while (i < s.length && !/[,():;\[\]]/.test(s[i])) out += s[i++];
      return out.trim();
    };
    const readComment = node => {
      skipWs();
      while (s[i] === '[') {
        const end = s.indexOf(']', i);
        const body = s.slice(i + 1, end < 0 ? s.length : end);
        i = end < 0 ? s.length : end + 1;
        const h = body.match(/(?:^|[,&])height(?:_median)?=([-\d.eE]+)/);
        if (h && node) node.age = Number(h[1]);
        const hp = body.match(/height_95%_HPD=\{([-\d.eE]+),([-\d.eE]+)\}/);
        if (hp && node) node.hpd = [Number(hp[1]), Number(hp[2])];
        const po = body.match(/posterior=([-\d.eE]+)/);
        if (po && node) node.support = Number(po[1]);
        skipWs();
      }
    };
    const readLen = () => {
      skipWs();
      if (s[i] !== ':') return null;
      i++; skipWs();
      let out = '';
      while (i < s.length && /[-+\d.eE]/.test(s[i])) out += s[i++];
      return out === '' ? null : Number(out);
    };
    const parseNode = () => {
      skipWs();
      let node;
      if (s[i] === '(') {
        i++;
        node = { children: [] };
        for (;;) {
          const child = parseNode();
          readComment(child);
          const len = readLen();
          readComment(child);
          node.children.push({ node: child, len: len == null ? null : len });
          skipWs();
          if (s[i] === ',') { i++; continue; }
          if (s[i] === ')') { i++; break; }
          throw new Error('Unexpected “' + (s[i] || 'end of text') + '” at position ' + i + ' of the Newick string.');
        }
        const lab = readLabel();
        if (lab !== '') {
          const v = Number(lab);
          if (isFinite(v)) node.support = v > 1 ? v / 100 : v;
          else node.label = lab;
        }
        readComment(node);
      } else {
        const lab = readLabel();
        if (lab === '') throw new Error('A tip without a name at position ' + i + ' of the Newick string.');
        node = { tip: tipIndex(lab), label: lab, children: [] };
        readComment(node);
      }
      return node;
    };
    const root = parseNode();
    readComment(root);
    readLen();
    const hasLengths = nodes(root).some(n => n.children.some(c => c.len != null));
    nodes(root).forEach(n => n.children.forEach(c => { if (c.len == null) c.len = hasLengths ? 0 : 1; }));
    return { root, labels: names, hasLengths };
  }

  function safeName(s) {
    const t = String(s);
    return /^[A-Za-z0-9_.\-]+$/.test(t) ? t : "'" + t.replace(/'/g, "''") + "'";
  }

  /* opts: {labelOf, digits, annotate: node → comment string | null} */
  function toNewick(root, opts) {
    opts = opts || {};
    const labelOf = opts.labelOf || (t => t.label != null ? t.label : 'T' + t.tip);
    const dg = opts.digits == null ? 6 : opts.digits;
    const rec = n => {
      let str = isTip(n) ? safeName(labelOf(n)) : '(' + n.children.map(c => {
        const inner = rec(c.node);
        const ann = opts.annotate ? opts.annotate(c.node) : null;
        return inner + (ann ? '[' + ann + ']' : '') + ':' + Math.max(0, c.len || 0).toFixed(dg);
      }).join(',') + ')' + (n.support != null && opts.support !== false ? (opts.supportAsPercent ? Math.round(n.support * 100) : +n.support.toFixed(4)) : '');
      return str;
    };
    const ann = opts.annotate ? opts.annotate(root) : null;
    return rec(root) + (ann ? '[' + ann + ']' : '') + ';';
  }

  /* NEXUS readable by tree viewers, with ages and 95% HPD intervals as node annotations */
  function toNexus(root, labelOf, title) {
    const tl = tips(root);
    const names = tl.map(t => labelOf(t));
    const annotate = n => {
      const parts = [];
      if (n.age != null) parts.push('height=' + n.age.toFixed(6));
      if (n.hpd) parts.push('height_95%_HPD={' + n.hpd[0].toFixed(6) + ',' + n.hpd[1].toFixed(6) + '}');
      if (n.support != null && !isTip(n)) parts.push('posterior=' + n.support.toFixed(4));
      if (n.calib) parts.push('calibration="' + String(n.calib).replace(/"/g, "'") + '"');
      return parts.length ? '&' + parts.join(',') : null;
    };
    const idx = new Map(tl.map((t, k) => [t.tip, k + 1]));
    const nwk = toNewick(root, { labelOf: t => String(idx.get(t.tip)), annotate, support: false });
    return '#NEXUS\n\nBEGIN TAXA;\n\tDIMENSIONS NTAX=' + names.length + ';\n\tTAXLABELS\n' +
      names.map(n => '\t\t' + safeName(n)).join('\n') + '\n\t;\nEND;\n\nBEGIN TREES;\n\tTRANSLATE\n' +
      names.map((n, k) => '\t\t' + (k + 1) + ' ' + safeName(n)).join(',\n') + '\n\t;\n\tTREE ' + (title ? safeName(title) : 'tree_1') + ' = [&R] ' + nwk + '\nEND;\n';
  }

  /* clades for colouring: cut the tree into k groups by splitting, each time, the
     group whose root is closest to the root of the tree (a horizontal cut) */
  function cutClusters(root, k) {
    const ix = index(root);
    let groups = [root];
    while (groups.length < k) {
      const splittable = groups.filter(n => !isTip(n) && n.children.length > 1);
      if (!splittable.length) break;
      const next = splittable.reduce((a, b) => (ix.depth.get(b) < ix.depth.get(a) ? b : a));
      groups = groups.filter(n => n !== next).concat(next.children.map(c => c.node));
    }
    /* order clusters as the tips are drawn */
    const order = tips(root).map(t => t.tip);
    const first = n => Math.min(...tips(n).map(t => order.indexOf(t.tip)));
    groups.sort((a, b) => first(a) - first(b));
    const clusterOfTip = new Map();
    groups.forEach((g, ci) => tips(g).forEach(t => clusterOfTip.set(t.tip, ci)));
    return { clades: groups, clusterOfTip };
  }

  /* largest subtrees whose tips all share one group */
  function pureClades(root, groupOfTip, minTips) {
    const out = [];
    const walk = n => {
      const ts = tips(n);
      const g = groupOfTip(ts[0].tip);
      const pure = g != null && ts.every(t => groupOfTip(t.tip) === g);
      if (pure) { if (ts.length >= (minTips || 1)) out.push({ node: n, group: g, size: ts.length }); return; }
      n.children.forEach(c => walk(c.node));
    };
    walk(root);
    return out;
  }

  function isUltrametric(root, tol) {
    const ix = index(root);
    const ds = tips(root).map(t => ix.depth.get(t));
    const mx = Math.max(...ds), mn = Math.min(...ds);
    return mx > 0 && (mx - mn) / mx < (tol || 1e-6);
  }

  window.TreeOps = {
    isTip, tips, nodes, index, clone, tipSet, mrca, isMonophyletic, tipCounts, ladderize,
    rerootAt, rerootOutgroup, midpointRoot, collapseUnary, parseNewick, toNewick, toNexus,
    cutClusters, pureClades, isUltrametric, safeName,
  };
})();
