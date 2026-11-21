// Putting audit PT6 (the putters were a ladder, not a trade): the shop putters across five hands. See PUTTING_AUDIT_FINDINGS.md.
//   node tools/test/probe.js "http://127.0.0.1:8090/?nohome" - "@tools/test/putt-fix5.js"
// Putts per nine for every shop putter, before → after, for the audit's three hands (every error grows together) and two
// lopsided ones (a good line with a shaky rhythm, and the reverse). "Before" is the numbers the putters had (BEFORE below).
// Other modes, by a setup expression:
//   "window.__MODE='sens'"   what each of the four numbers is worth on its own, on a middling putter
//   "window.__SET={'p-newport':{pathGain:0.36}, ...}"   try other numbers without editing the game (merged over the current ones)
// Strokes go through the game's own reader; their tempo is drawn around 1.00. Practice mode is on: no ball is rolled by the
// game and nothing is saved. Takes about half a minute.
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 50 && !window.__golf; i++) await sleep(200);
  const g = window.__golf, FT = 0.3048, out = [], P = g.PUTTERS, PUTT = g.PUTT, MODE = window.__MODE || 'shop';
  const f = (v, n = 0) => (v === null || v === undefined || Number.isNaN(v) ? '—' : v.toFixed(n));
  const lerp = (a, b, t) => a + (b - a) * t, clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const BEFORE = {      // gate, pathGain, sweet, tempoZone as they were when PT6 was measured
    'p-wh2': [0.028, 0.42, 3.5, 0.085], 'p-newport': [0.030, 0.40, 4, 0.11], 'p-pldanser': [0.031, 0.38, 4.5, 0.10],
    'p-spider': [0.050, 0.27, 10, 0.04], 'p-oz1': [0.046, 0.22, 8, 0.03], 'p-atelier': [0.048, 0.27, 9, 0.04],
  };
  const spec = (a) => ({ gate: a[0], pathGain: a[1], sweet: a[2], tempoZone: a[3] }), IDS = Object.keys(BEFORE);
  g.setMode('putt'); g.state.practice = true; g.setBadStreak(0);
  const px = g.state.cal.swingPx, mj = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * u * (10 - 15 * u + 6 * u * u));
  let clock = 1e6;
  function stroke(o) {
    const L = o.L * px, slope = o.slope || 0, yT = (o.yImp || 0) * px - slope * L, tB = 350 + 450 * o.L, tF = 2 * tB, wob = (o.wob || 0) * px;
    const pos = (t) => {
      if (t <= tB) { const u = mj(t / tB); return [-L * u, yT * u]; }
      const fr = 2 * mj((t - tB) / tF), x = -L + L * fr;
      return [x, yT + slope * (x + L) + wob * Math.sin(3 * Math.PI * Math.min(1, fr))];
    };
    g.beginSwing(true);
    let lx = 0, ly = 0; const t0 = clock, end = tB + tF;
    for (let t = 8; t <= end + 8 && g.swing.phase !== 'through'; t += 8) {
      const [x, y] = pos(t), X = Math.round(x), Y = Math.round(y);
      if (X !== lx || Y !== ly) { g.swingSample(X - lx, Y - ly, t0 + t); lx = X; ly = Y; }
    }
    clock = t0 + end + 500;
    const tel = g.swing.phase === 'through' ? g.puttTel : null;
    g.endSwing('silent');
    return tel ? { ...tel.sw } : null;
  }
  const gaussOf = (rnd) => () => { let u = 0, v = 0; while (u === 0) u = rnd(); v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  const HANDS = {
    steady: { ang: 0.8, lat: 0.004, lenAbs: 0.006, lenProp: 0.01, tempo: 0.06 },
    average: { ang: 1.5, lat: 0.008, lenAbs: 0.012, lenProp: 0.02, tempo: 0.12 },
    loose: { ang: 2.5, lat: 0.014, lenAbs: 0.020, lenProp: 0.035, tempo: 0.20 },
    'good line, shaky rhythm': { ang: 0.8, lat: 0.004, lenAbs: 0.012, lenProp: 0.02, tempo: 0.20 },
    'good rhythm, shaky line': { ang: 2.5, lat: 0.014, lenAbs: 0.012, lenProp: 0.02, tempo: 0.06 },
  };
  const STIMP = 11, A = g.rollDecel(STIMP), surf = g.makeSurface({ stimp: STIMP, outline: { x: 0, z: -4, rx: 60, rz: 60 } });
  function rollFlat(dFt, v0, dirDeg) {
    const D = dFt * FT, th = dirDeg * Math.PI / 180, ux = Math.sin(th), uz = -Math.cos(th), sc = D * Math.cos(th), total = v0 * v0 / (2 * A);
    const leave = (p) => Math.hypot(p.x, p.z + D) / FT;
    if (total < sc - 0.3) return { holed: false, leave: leave({ x: ux * total, z: uz * total }) };
    const s0 = Math.max(0, sc - 0.3), v = Math.sqrt(Math.max(0, v0 * v0 - 2 * A * s0));
    const q = g.createPutt({ ...surf, hole: { x: 0, z: -D } }, v, dirDeg, 0); q.p.x = ux * s0; q.p.z = uz * s0;
    for (let n = 0; q.phase === 'roll' && n < 20000; n++) {
      g.stepPutt(q, 1 / 240);
      if (q.p.x * ux + q.p.z * uz > sc + 0.3 && !q.inCup) { const sp = Math.hypot(q.v.x, q.v.z), more = sp * sp / (2 * A); return { holed: false, leave: leave({ x: q.p.x + (sp ? q.v.x / sp : ux) * more, z: q.p.z + (sp ? q.v.z / sp : uz) * more }) }; }
    }
    return { holed: q.holed, leave: q.holed ? 0 : leave(q.p) };
  }
  // The strokes do not depend on the putter, so each hand's are made once and every putter plays the same ones: differences
  // between putters are then the putters', not the dice's. (The roll's random parts — rail, tempo and strike twists — still differ.)
  function playHole(d0, putter, hand, rnd, G, st) {
    let d = d0, n = 0;
    while (n < 6) {
      const want = (d + PUTT.diePastFt) * (1 + (rnd() * 2 - 1) * lerp(0.10, 0, 4 / 9)), scale = want <= 11 ? 15 : want <= 30 ? 40 : 90;
      let sw = null;
      for (let tries = 0; tries < 4 && !sw; tries++) {
        const L = clamp(want / scale * (1 + hand.lenProp * G()) + hand.lenAbs * G(), 0.03, 1.12);
        sw = stroke({ L, slope: Math.tan(hand.ang * G() * Math.PI / 180) + hand.lat * G() / L, yImp: hand.lat * (1 + L) * G(), wob: Math.abs(hand.lat * 0.3 * G()) });
      }
      if (!sw) { n++; continue; }
      sw.tempo = Math.exp(hand.tempo * G());
      const res = g.computePutt(sw, putter, { scaleFt: scale, stimp: STIMP, composure: 5, badStreak: 0, dex: 5 }, rnd), r = rollFlat(d, res.v0, res.start);
      n++;
      if (n === 1) { st.n++; if (r.holed) st.made++; }
      if (r.holed) break;
      d = Math.max(0.25, r.leave);
    }
    if (n >= 3) st.three++;
    return n;
  }
  const MIX = [[5, 2], [10, 2], [20, 2], [30, 2], [45, 1]], N = window.__N || 1500;
  const per9 = (putter, hand) => { let tot = 0; const by = {}; for (const [d, w] of MIX) { const rnd = g.rng32(5000 + d * 13), G = gaussOf(rnd), st = { n: 0, made: 0, three: 0 }; let p = 0; for (let k = 0; k < N; k++) p += playHole(d, putter, hand, rnd, G, st); tot += p / N * w; by[d] = st; } return { tot, by }; };

  if (MODE === 'sens') {
    const base = { gate: 0.040, pathGain: 0.32, sweet: 6, tempoZone: 0.07 };
    out.push(`WHAT EACH NUMBER IS WORTH on a middling putter (gate 4.0%, start line 0.32, sweet spot 6 mm, tempo ±0.07): putts per nine, ${N} holes a cell`);
    const VARS = [['the middling putter', {}], ['gate 2.8%', { gate: 0.028 }], ['gate 5.0%', { gate: 0.050 }], ['start line 0.40', { pathGain: 0.40 }], ['start line 0.26', { pathGain: 0.26 }], ['sweet spot 3.5 mm', { sweet: 3.5 }], ['sweet spot 10 mm', { sweet: 10 }], ['tempo ±0.03', { tempoZone: 0.03 }], ['tempo ±0.12', { tempoZone: 0.12 }]];
    out.push('   ' + ''.padEnd(22) + Object.keys(HANDS).map((h) => h.padStart(26)).join(''));
    const rows = VARS.map(([name]) => [name]);
    for (const hk of Object.keys(HANDS)) { for (let i = 0; i < VARS.length; i++) rows[i].push(per9({ ...base, ...VARS[i][1] }, HANDS[hk]).tot); await sleep(0); }
    for (const r of rows) out.push('   ' + r[0].padEnd(22) + r.slice(1).map((v, i) => `${f(v, 2)} (${v - rows[0][i + 1] >= 0 ? '+' : ''}${f(v - rows[0][i + 1], 2)})`.padStart(26)).join(''));
    return out.join('\n');
  }

  const SET = window.__SET || {}, now = (id) => ({ ...P[id], ...(SET[id] || {}) });
  out.push(`SHOP PUTTERS, putts per nine (first putts 2×5, 2×10, 2×20, 2×30, 1×45 ft; flat Stimp ${STIMP}; ${N} holes a cell). before → after`);
  out.push('   numbers (gate / start line / sweet spot / tempo): ' + IDS.map((id) => { const p = now(id); return `${id} ${BEFORE[id].join(' / ')} → ${[p.gate, p.pathGain, p.sweet, p.tempoZone].join(' / ')}`; }).join('  ·  '));
  for (const hk of window.__HANDS || Object.keys(HANDS)) {
    out.push(`  HAND ${hk}`);
    const res = {};
    for (const id of IDS) { const b = per9({ ...P[id], ...spec(BEFORE[id]) }, HANDS[hk]), a = per9(now(id), HANDS[hk]); res[id] = a.tot; out.push(`   ${id.padEnd(11)} ${f(b.tot, 2)} → ${f(a.tot, 2)}   after: 10 ft ${f(a.by[10].made / a.by[10].n * 100)}% · 20 ft ${f(a.by[20].made / a.by[20].n * 100)}% · three-putts from 45 ft ${f(a.by[45].three / N * 100, 1)}%`); await sleep(0); }
    const order = IDS.filter((id) => id !== 'p-atelier').sort((x, y) => res[x] - res[y]);
    out.push(`   → best to worst: ${order.map((id) => `${id.slice(2)} ${f(res[id], 2)}`).join(' < ')}`);
  }
  return out.join('\n');
})()
