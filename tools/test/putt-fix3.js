// Putting audit PT4 (Stability, the putter's gate, was worth nothing): what the fix does. See PUTTING_AUDIT_FINDINGS.md.
//   node tools/test/probe.js "http://127.0.0.1:8090/?nohome" - "@tools/test/putt-fix3.js"
// 1 what a rail hit does to the start line, 2 putts per nine: the gate alone (the practice blade with the shop's narrowest and
// widest gate) and the shop putters, with how often a putt hits the rail. "Before" is the same code with the old constants for
// the run (railTwistDeg 0.8, railTwistMax 2.0, no pace lost); they are put back at the end. To try others, a setup expression
// such as "window.__RAIL={deg:4,slow:0.3}"; "window.__HANDS=['loose']" cuts part 2 down.
// Strokes go through the game's own reader; their tempo is drawn around 1.00. Practice mode is on: no ball is rolled by the
// game and nothing is saved. Takes about a minute.
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 50 && !window.__golf; i++) await sleep(200);
  const g = window.__golf, FT = 0.3048, out = [], P = g.PUTTERS, PUTT = g.PUTT;
  const f = (v, n = 0) => (v === null || v === undefined || Number.isNaN(v) ? '—' : v.toFixed(n));
  const lerp = (a, b, t) => a + (b - a) * t, clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const setRail = (o) => { PUTT.railTwistDeg = o.deg; PUTT.railTwistMax = o.max; PUTT.railSlow = o.slow; PUTT.railSlowMax = o.slowMax; };
  const now = () => ({ deg: PUTT.railTwistDeg, max: PUTT.railTwistMax, slow: PUTT.railSlow, slowMax: PUTT.railSlowMax });
  const REAL = now(), BEFORE = { deg: 0.8, max: 2.0, slow: 0, slowMax: 0 };
  if (window.__RAIL) setRail({ ...REAL, ...window.__RAIL });
  const KEEP = now();
  out.push(`PUTT.railTwistDeg ${KEEP.deg} · railTwistMax ${KEEP.max} · railSlow ${KEEP.slow} · railSlowMax ${KEEP.slowMax}`);
  const cfg = (o = {}) => ({ scaleFt: 40, stimp: 11, composure: 5, badStreak: 0, dex: 5, ...o });

  out.push('', '1 A RAIL HIT: the most it can twist the start line, by how far the stroke strayed (share of the 100% stroke). before → after');
  for (const pid of ['p-wh2', 'blade', 'p-pldanser', 'p-oz1', 'p-spider']) {
    const tw = (e) => { const r = g.computePutt({ thetaMouse: 0, excursion: e, tempo: 1, sigma: 0, lateSign: 1, miss: 0, len: 0.5 }, P[pid], cfg(), () => 1); return [Math.abs(r.start), 1 - (r.v0 * r.v0 / (2 * g.rollDecel(11)) / FT) / 20]; };
    const cells = [0.03, 0.035, 0.04, 0.05, 0.06, 0.08, 0.10].map((e) => { setRail(BEFORE); const [b] = tw(e); setRail(KEEP); const [a, short] = tw(e); return `${f(e * 100, 1)}%: ${b < 0.005 && a < 0.005 ? '—' : `${f(b, 2)} → ${f(a, 2)}°, ${f(short * 100)}% short`}`; });
    out.push(`   ${pid.padEnd(11)} (gate ${f(P[pid].gate * 100, 1)}%) ${cells.join('  ')}`);
  }

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
      const res = g.computePutt(sw, putter, cfg({ scaleFt: scale, stimp: STIMP }), rnd), r = rollFlat(d, res.v0, res.start);
      n++; st.putts++; if (res.over > 0) { st.rail++; st.over += res.over; }
      if (r.holed) break;
      d = Math.max(0.25, r.leave);
    }
    return n;
  }
  const MIX = [[5, 2], [10, 2], [20, 2], [30, 2], [45, 1]], N = 1500;
  const per9 = (putter, hand) => { let tot = 0; const st = { putts: 0, rail: 0, over: 0 }; for (const [d, w] of MIX) { const rnd = g.rng32(5000 + d * 13), G = gaussOf(rnd); let p = 0; for (let k = 0; k < N; k++) p += playHole(d, putter, hand, rnd, G, st); tot += p / N * w; } return { tot, rail: st.rail / st.putts, over: st.rail ? st.over / st.rail : 0 }; };
  const both = (putter, hand) => { setRail(BEFORE); const b = per9(putter, hand); setRail(KEEP); const a = per9(putter, hand); return { b, a }; };
  out.push('', `2 PUTTS PER NINE (first putts 2×5, 2×10, 2×20, 2×30, 1×45 ft; flat Stimp ${STIMP}; ${N} holes a cell). before → after · the share of putts that hit the rail, and how far outside it they were on average (in gate-widths)`);
  try {
    for (const hk of window.__HANDS || Object.keys(HANDS)) {
      out.push(`  HAND ${hk}`);
      const rows = [['blade, gate 2.8% (the shop\'s narrowest)', { ...P.blade, gate: 0.028 }], ['blade, gate 5.0% (the widest)', { ...P.blade, gate: 0.050 }], ...['p-wh2', 'p-newport', 'p-pldanser', 'p-spider', 'p-oz1'].map((id) => [id, P[id]])];
      const got = [];
      for (const [name, putter] of rows) {
        const r = both(putter, HANDS[hk]); got.push(r);
        out.push(`   ${name.padEnd(40)} ${f(r.b.tot, 2)} → ${f(r.a.tot, 2)} (${r.a.tot - r.b.tot >= 0 ? '+' : ''}${f(r.a.tot - r.b.tot, 2)}) · rail ${f(r.a.rail * 100, 1)}% of putts, ${f(r.a.over, 2)} outside`);
        await sleep(0);
      }
      out.push(`   → the gate alone is worth (narrowest − widest): ${f(got[0].b.tot - got[1].b.tot, 2)} before, ${f(got[0].a.tot - got[1].a.tot, 2)} after`);
    }
  } finally { setRail(REAL); }
  return out.join('\n');
})()
