// Putting audit PT11 (for a loose tempo, always decelerating beat trying for a pure stroke): what the fix does. See PUTTING_AUDIT_FINDINGS.md.
//   node tools/test/probe.js "http://127.0.0.1:8090/?nohome" - "@tools/test/putt-fix10.js"
// 1 the tempo response on the slow side; 2 putts per nine for a player who tries for a pure stroke, one who decelerates every
// putt (tempo around 0.55, the stroke lengthened by the 23% a decel loses) and one who jabs every putt (around 1.6, shortened),
// for five hands. "Before" is the same code with PUTT.decelScatter set to 0 for the run; it is put back at the end. To try
// another value: "window.__SC=0.15"; "window.__HANDS=['loose']" cuts part 2 down. Strokes go through the game's own reader.
// Practice mode is on: no ball is rolled by the game and nothing is saved. Takes about two minutes.
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 50 && !window.__golf; i++) await sleep(200);
  const g = window.__golf, FT = 0.3048, out = [], P = g.PUTTERS, PUTT = g.PUTT;
  const f = (v, n = 0) => (v === null || v === undefined || Number.isNaN(v) ? '—' : v.toFixed(n));
  const lerp = (a, b, t) => a + (b - a) * t, clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const REAL = PUTT.decelScatter, KEEP = window.__SC === undefined ? REAL : window.__SC, REAL_HOT = PUTT.hotTwistDeg;
  PUTT.decelScatter = KEEP;
  if (window.__HOTTW) PUTT.hotTwistDeg = window.__HOTTW;      // (to try a stronger twist on a jab: "window.__HOTTW=1.5")
  out.push(`PUTT.hotSpeed ${PUTT.hotSpeed} · hotScatter ${PUTT.hotScatter} · hotTwistDeg ${PUTT.hotTwistDeg}`);
  out.push(`PUTT.decelSpeed ${PUTT.decelSpeed} · decelScatter ${PUTT.decelScatter} · decelTwistDeg ${PUTT.decelTwistDeg}`);
  const cfg = (o = {}) => ({ scaleFt: 40, stimp: 11, composure: 5, badStreak: 0, dex: 5, ...o });
  try {
    out.push('', '1 TEMPO → feet rolled by a 20 ft stroke (least–most), and the most the face can twist');
    for (const pid of ['p-oz1', 'p-spider', 'p-pldanser', 'p-newport']) {
      const cells = [];
      for (const t of [0.5, 0.7, 0.8, 0.85, 0.9, 0.95, 1]) {
        const ft = (rv) => { const r = g.computePutt({ thetaMouse: 0, excursion: 0, tempo: t, sigma: 0, lateSign: 1, miss: 0, len: 0.5 }, P[pid], cfg(), () => rv); return [r.v0 * r.v0 / (2 * g.rollDecel(11)) / FT, Math.abs(r.start)]; };
        const [a] = ft(0), [b, tw] = ft(1), lo = Math.min(a, b), hi = Math.max(a, b);
        cells.push(`${t}: ${hi - lo < 0.05 ? f(hi, 1) : `${f(lo, 1)}–${f(hi, 1)}`}${tw > 0.005 ? ` ±${f(tw, 2)}°` : ''}`);
      }
      out.push(`   ${pid.padEnd(10)} (±${P[pid].tempoZone}) ${cells.join('  |  ')}`);
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
      'good line, shaky rhythm': { ang: 0.8, lat: 0.004, lenAbs: 0.012, lenProp: 0.02, tempo: 0.20 },
      'good line, very shaky rhythm': { ang: 0.8, lat: 0.004, lenAbs: 0.012, lenProp: 0.02, tempo: 0.30 },
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
    // the scale is the one Auto picks for the stroke the player means to make (they put the marker where that stroke stops)
    const HALF = lerp(0.12, 0.01, 4 / 9), pick = (ft) => (PUTT.scales.find((s) => ft * (1 + HALF) <= s.ft * PUTT.scaleFill) || PUTT.scales[PUTT.scales.length - 1]).ft;
    function playHole(d0, putter, hand, strat, rnd, G) {
      let d = d0, n = 0;
      while (n < 6) {
        const want = (d + PUTT.diePastFt) * (1 + (rnd() * 2 - 1) * lerp(0.10, 0, 4 / 9)), need = strat === 'jab' ? want / (1 + PUTT.hotSpeed) ** 2 : strat === 'decel' ? want / (1 - PUTT.decelSpeed) ** 2 : want, scale = pick(need);
        let sw = null;
        for (let tries = 0; tries < 4 && !sw; tries++) {
          const L = clamp(Math.min(1.1, need / scale) * (1 + hand.lenProp * G()) + hand.lenAbs * G(), 0.03, 1.12);
          sw = stroke({ L, slope: Math.tan(hand.ang * G() * Math.PI / 180) + hand.lat * G() / L, yImp: hand.lat * (1 + L) * G(), wob: Math.abs(hand.lat * 0.3 * G()) });
        }
        if (!sw) { n++; continue; }
        sw.tempo = (strat === 'jab' ? 1.6 : strat === 'decel' ? 0.55 : 1) * Math.exp(hand.tempo * G());
        const res = g.computePutt(sw, putter, cfg({ scaleFt: scale, stimp: STIMP }), rnd), r = rollFlat(d, res.v0, res.start);
        n++;
        if (r.holed) break;
        d = Math.max(0.25, r.leave);
      }
      return n;
    }
    const MIX = [[5, 2], [10, 2], [20, 2], [30, 2], [45, 1]], N = window.__N || 1500;
    const per9 = (putter, hand, strat) => { let tot = 0; for (const [d, w] of MIX) { const rnd = g.rng32(5000 + d * 13), G = gaussOf(rnd); let p = 0; for (let k = 0; k < N; k++) p += playHole(d, putter, hand, strat, rnd, G); tot += p / N * w; } return tot; };
    out.push('', `2 PUTTS PER NINE (first putts 2×5, 2×10, 2×20, 2×30, 1×45 ft; flat Stimp ${STIMP}; ${N} holes a cell). before → after. ✗ marks a strategy that beats trying for a pure stroke`);
    for (const hk of window.__HANDS || Object.keys(HANDS)) {
      out.push(`  HAND ${hk} (tempo spread ${HANDS[hk].tempo})`);
      for (const pid of window.__IDS || ['p-wh2', 'p-newport', 'p-pldanser', 'p-spider', 'p-oz1']) {
        PUTT.decelScatter = 0; const pb = per9(P[pid], HANDS[hk], 'pure'), db = per9(P[pid], HANDS[hk], 'decel');
        PUTT.decelScatter = KEEP; const pa = per9(P[pid], HANDS[hk], 'pure'), da = per9(P[pid], HANDS[hk], 'decel'), ja = per9(P[pid], HANDS[hk], 'jab');
        out.push(`   ${pid.padEnd(11)} pure ${f(pb, 2)} → ${f(pa, 2)}  ·  always decel ${f(db, 2)}${db < pb - 0.05 ? ' ✗' : ''} → ${f(da, 2)}${da < pa - 0.05 ? ' ✗' : ''}  ·  always jab ${f(ja, 2)}${ja < pa - 0.05 ? ' ✗' : ''}`);
        await sleep(0);
      }
    }
  } finally { PUTT.decelScatter = REAL; PUTT.hotTwistDeg = REAL_HOT; }
  return out.join('\n');
})()
