// Putting audit PT8 (Dexterity changed nothing on the green): what the fix does. See PUTTING_AUDIT_FINDINGS.md.
//   node tools/test/probe.js "http://127.0.0.1:8090/?nohome" - "@tools/test/putt-fix7.js"
// 1 what Dexterity does to one stroke (the start line it gives and the strike), 2 putts per nine by Dexterity for three hands
// and three putters. Before the fix every column read the same as Dexterity 5's. To try other constants, a setup expression
// such as "window.__DEX={line:[1.3,0.7],strike:[1.2,0.75]}". Strokes go through the game's own reader; their tempo is drawn
// around 1.00. Practice mode is on: no ball is rolled by the game and nothing is saved. Takes about a minute.
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 50 && !window.__golf; i++) await sleep(200);
  const g = window.__golf, FT = 0.3048, out = [], P = g.PUTTERS, PUTT = g.PUTT;
  const f = (v, n = 0) => (v === null || v === undefined || Number.isNaN(v) ? '—' : v.toFixed(n));
  const lerp = (a, b, t) => a + (b - a) * t, clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const REAL = { line: PUTT.dexLine, strike: PUTT.dexStrike };
  if (window.__DEX) { PUTT.dexLine = window.__DEX.line; PUTT.dexStrike = window.__DEX.strike; }
  out.push(`PUTT.dexLine ${JSON.stringify(PUTT.dexLine)} · dexStrike ${JSON.stringify(PUTT.dexStrike)}`);
  const cfg = (o = {}) => ({ scaleFt: 40, stimp: 11, composure: 5, badStreak: 0, dex: 5, ...o }), DEX = [1, 2, 3, 5, 8, 10];
  try {
    out.push('', '1 ONE STROKE, drawn 2° off line and 1.5% wide of the ball, by Dexterity: the start line and the strike (Newport 2)');
    out.push('   ' + DEX.map((d) => { const r = g.computePutt({ thetaMouse: 2, excursion: 0.015, tempo: 1, sigma: 1, lateSign: 1, miss: -0.015, len: 0.5 }, P['p-newport'], cfg({ dex: d }), () => 0.5); return `Dex ${d}: ${f(r.start, 2)}° · ${f(r.mm, 1)} mm${r.loss ? ` (−${f(r.loss * 100, 1)}% rollout)` : ''}`; }).join('  |  '));

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
    function playHole(d0, putter, hand, dex, rnd, G, st) {
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
        const res = g.computePutt(sw, putter, cfg({ scaleFt: scale, stimp: STIMP, dex }), rnd), r = rollFlat(d, res.v0, res.start);
        n++;
        if (n === 1 && d0 === 10) { st.n++; if (r.holed) st.made++; }
        if (r.holed) break;
        d = Math.max(0.25, r.leave);
      }
      return n;
    }
    const MIX = [[5, 2], [10, 2], [20, 2], [30, 2], [45, 1]], N = window.__N || 1500;
    const per9 = (putter, hand, dex) => { let tot = 0; const st = { n: 0, made: 0 }; for (const [d, w] of MIX) { const rnd = g.rng32(5000 + d * 13), G = gaussOf(rnd); let p = 0; for (let k = 0; k < N; k++) p += playHole(d, putter, hand, dex, rnd, G, st); tot += p / N * w; } return { tot, ten: st.made / st.n }; };
    out.push('', `2 PUTTS PER NINE by Dexterity (first putts 2×5, 2×10, 2×20, 2×30, 1×45 ft; flat Stimp ${STIMP}; ${N} holes a cell), with the share holed from 10 ft`);
    for (const hk of window.__HANDS || Object.keys(HANDS)) {
      out.push(`  HAND ${hk}`);
      for (const pid of ['p-wh2', 'p-newport', 'p-oz1']) {
        const r = DEX.map((d) => per9(P[pid], HANDS[hk], d));
        out.push(`   ${pid.padEnd(10)} ` + DEX.map((d, i) => `Dex ${d}: ${f(r[i].tot, 2)} (${f(r[i].ten * 100)}%)`).join('  ') + `   → Dex 1 to 10 is worth ${f(r[0].tot - r[r.length - 1].tot, 2)}`);
        await sleep(0);
      }
    }
  } finally { PUTT.dexLine = REAL.line; PUTT.dexStrike = REAL.strike; }
  return out.join('\n');
})()
