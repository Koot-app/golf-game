// Putting audit PT1 (a jabbed stroke beat a pure one): what the fix does. See PUTTING_AUDIT_FINDINGS.md.
//   node tools/test/probe.js "http://127.0.0.1:8090/?nohome" - "@tools/test/putt-fix1.js"
// 1 the tempo response, 2 the break of a jabbed putt, 3 putts per nine for a pure, an always-jab and an always-decel player.
// "Before" in part 3 is the same code with the old constants for the run (hotSpeed 0.10, no scatter, no twist); they are put
// back at the end. Practice mode is on: the game rolls no ball and saves nothing. Takes about a minute.
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 50 && !window.__golf; i++) await sleep(200);
  const g = window.__golf, FT = 0.3048, IN = 0.0254, out = [], P = g.PUTTERS, PUTT = g.PUTT;
  const f = (v, n = 0) => (v === null || v === undefined || Number.isNaN(v) ? '—' : v.toFixed(n));
  const lerp = (a, b, t) => a + (b - a) * t, clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const cfg = (o = {}) => ({ scaleFt: 40, stimp: 11, composure: 5, badStreak: 0, dex: 5, ...o });
  const sw0 = (o = {}) => ({ thetaMouse: 0, excursion: 0, tempo: 1, sigma: 0, lateSign: 1, miss: 0, len: 0.5, ...o });
  const setHot = (o) => { PUTT.hotSpeed = o.hs; PUTT.hotScatter = o.sc; PUTT.hotTwistDeg = o.tw; };
  const REAL = { hs: PUTT.hotSpeed, sc: PUTT.hotScatter, tw: PUTT.hotTwistDeg }, BEFORE = { hs: 0.10, sc: 0, tw: 0 };
  // to try other constants without editing the game: a setup expression such as "window.__HOT={hs:0.12,sc:0.12,tw:1.5}" (put back
  // at the end); "window.__HANDS=['loose']" and "window.__IDS=['p-oz1']" cut part 3 down
  if (window.__HOT) setHot(window.__HOT);
  const KEEP = { hs: PUTT.hotSpeed, sc: PUTT.hotScatter, tw: PUTT.hotTwistDeg };
  out.push(`PUTT.hotSpeed ${PUTT.hotSpeed} · hotScatter ${PUTT.hotScatter} · hotTwistDeg ${PUTT.hotTwistDeg} · skidHotFt ${PUTT.skidHotFt}`);

  // 1 tempo → distance. A 20 ft stroke; for a hot stroke the range of feet rolled and the most the face can twist
  out.push('', '1 TEMPO → feet rolled by a 20 ft stroke (least–most), and the most the face can twist');
  for (const pid of ['p-oz1', 'p-spider', 'blade', 'p-newport']) {
    const cells = [];
    for (const t of [0.7, 0.85, 0.95, 1, 1.1, 1.15, 1.2, 1.3, 1.5, 2.0]) {
      const ft = (rv) => { const r = g.computePutt(sw0({ tempo: t }), P[pid], cfg(), () => rv); return [r.v0 * r.v0 / (2 * g.rollDecel(11)) / FT, Math.abs(r.start), r]; };
      const [lo] = ft(0), [hi, tw, r] = ft(1);
      cells.push(`${t}: ${Math.abs(hi - lo) < 0.05 ? f(hi, 1) : `${f(lo, 1)}–${f(hi, 1)}`}${tw > 0.005 ? ` ±${f(tw, 2)}°` : ''}${r.hot > 0 ? ` skid ${f(r.skidFt, 1)}` : ''}`);
    }
    out.push(`   ${pid.padEnd(10)} ${cells.join('  |  ')}`);
  }

  // 2 the break. A side slope, aimed at the centre of the cup, practice blade. A jab here is the middle of its range (no twist, +10% speed).
  out.push('', '2 BREAK on a side slope, aimed at the cup\'s centre (practice blade; the jab at the middle of its range): where it finishes · the aim that holes it');
  const side = (stimp, pct, ft) => { const s = g.makeSurface({ tilt: { x: pct / 100, z: 0 }, stimp, outline: { x: 0, z: -4, rx: 40, rz: 40 }, pin: { x: 0, z: -ft * FT } }); return g.greenView(s, { x: 0, z: 0 }); };
  const run = (gr, v0, dir, skid) => { const q = g.createPutt(gr, v0, dir, skid); let cross = null; for (let n = 0; q.phase === 'roll' && n < 40000; n++) { g.stepPutt(q, 1 / 240); if (cross === null && q.p.z <= gr.hole.z) cross = q.p.x; } return { q, cross }; };
  for (const [stimp, pct, ft] of [[11, 2, 4], [11, 2, 6], [11, 1, 8], [12.5, 2, 6], [12.5, 2, 10], [14, 2, 6]]) {
    const gr = side(stimp, pct, ft), cells = [];
    for (const [name, tempo, extra] of [['pure', 1, 1.5], ['jab, same stroke', 1.5, 1.5], ['jab, shorter stroke', 1.5, -0.4]]) {
      const r = g.computePutt(sw0({ tempo, len: (ft + extra) / 15 }), P.blade, cfg({ scaleFt: 15, stimp }), () => 0.5), x = run(gr, r.v0, 0, r.skidFt);
      let aim = null; for (let a = 0; a <= 14; a += 0.05) { if (run(gr, r.v0, a, r.skidFt).q.holed) { aim = a; break; } }
      cells.push(`${name}: ${x.q.holed ? 'HOLED' : x.cross === null ? 'short' : f(Math.abs(x.cross) / IN, 1) + ' in low'}, aim ${aim === null ? '—' : f(Math.tan(aim * Math.PI / 180) * ft * 12, 1) + ' in'}`);
    }
    out.push(`   Stimp ${stimp}, ${pct}% slope, ${ft} ft: ${cells.join(' | ')}`);
  }
  { const gr = side(11, 2, 20), v = Math.sqrt(2 * g.rollDecel(11) * 21.5 * FT); out.push('   a pure 20 ft putt, 2%, Stimp 11, 1.5 ft past: inches low with a skid of 0 / 0.5 / 1 / 3 ft: ' + [0, 0.5, 1, 3].map((s) => f(Math.abs(run(gr, v, 0, s).cross) / IN, 1)).join(' / ')); }

  // 3 the score: strokes through the game's own reader, every hole played out on a flat Stimp 11 green
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
  function rollFlat(dFt, v0, dirDeg) {     // a straight line to near the cup by kinematics, then the game's own stepPutt through the cup
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
  function handStroke(Lwant, hand, G) {
    for (let tries = 0; tries < 4; tries++) {
      const L = clamp(Lwant * (1 + hand.lenProp * G()) + hand.lenAbs * G(), 0.03, 1.12);
      const s = stroke({ L, slope: Math.tan(hand.ang * G() * Math.PI / 180) + hand.lat * G() / L, yImp: hand.lat * (1 + L) * G(), wob: Math.abs(hand.lat * 0.3 * G()) });
      if (s) return s;
    }
    return null;
  }
  // strat: 'pure' (tempo around 1.00), 'jab' (around 1.6, the stroke shortened by what a jab adds on average), 'decel' (around 0.55, lengthened by the 23% it loses)
  function playHole(d0, putter, hand, strat, rnd, G, st) {
    let d = d0, n = 0;
    while (n < 6) {
      const want = (d + PUTT.diePastFt) * (1 + (rnd() * 2 - 1) * lerp(0.10, 0, 4 / 9)), need = strat === 'jab' ? want / (1 + PUTT.hotSpeed) ** 2 : strat === 'decel' ? want / (1 - PUTT.decelSpeed) ** 2 : want;
      const scale = want <= 11 ? 15 : want <= 30 ? 40 : 90, sw = handStroke(Math.min(1.1, need / scale), hand, G);
      if (!sw) { n++; continue; }
      sw.tempo = (strat === 'jab' ? 1.6 : strat === 'decel' ? 0.55 : 1) * Math.exp(hand.tempo * G());
      const res = g.computePutt(sw, putter, cfg({ scaleFt: scale, stimp: STIMP }), rnd), r = rollFlat(d, res.v0, res.start);
      n++;
      if (n === 1 && r.holed) st.made++;
      if (r.holed) break;
      d = Math.max(0.25, r.leave);
    }
    if (n >= 3) st.three++;
    return n;
  }
  const MIX = [[5, 2], [10, 2], [20, 2], [30, 2], [45, 1]], N = 1500;
  const per9 = (putter, hand, strat) => {
    let tot = 0; const parts = {};
    for (const [d, w] of MIX) { const rnd = g.rng32(5000 + d * 13), G = gaussOf(rnd), st = { made: 0, three: 0 }; let p = 0; for (let k = 0; k < N; k++) p += playHole(d, putter, hand, strat, rnd, G, st); tot += p / N * w; parts[d] = st; }
    return { tot, parts };
  };
  const IDS = window.__IDS || ['p-wh2', 'p-newport', 'p-pldanser', 'p-spider', 'p-oz1'];
  out.push('', `3 PUTTS PER NINE (first putts 2×5, 2×10, 2×20, 2×30, 1×45 ft; flat Stimp ${STIMP}; ${N} holes a cell). before → after`);
  try {
    for (const hk of window.__HANDS || Object.keys(HANDS)) {
      out.push(`  HAND ${hk}`);
      for (const pid of IDS) {
        const row = [];
        for (const strat of ['pure', 'jab', 'decel']) {
          setHot(BEFORE); const b = per9(P[pid], HANDS[hk], strat);
          setHot(KEEP); const a = strat === 'decel' ? b : per9(P[pid], HANDS[hk], strat);
          row.push(strat === 'decel' ? `decel ${f(a.tot, 2)}` : `${strat} ${f(b.tot, 2)} → ${f(a.tot, 2)}` + (strat === 'jab' && hk === 'average' ? ` (10 ft ${f(b.parts[10].made / N * 100)} → ${f(a.parts[10].made / N * 100)}%, 20 ft ${f(b.parts[20].made / N * 100)} → ${f(a.parts[20].made / N * 100)}%, 45 ft three-putts ${f(b.parts[45].three / N * 100, 1)} → ${f(a.parts[45].three / N * 100, 1)}%)` : ''));
          await sleep(0);
        }
        out.push(`   ${pid.padEnd(11)} ${row.join('  ·  ')}`);
      }
    }
  } finally { setHot(REAL); }
  return out.join('\n');
})()
