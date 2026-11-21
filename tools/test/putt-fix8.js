// Putting audit PT9 (the automatic scale switched long before the smaller scale ran out): what the fix does. See PUTTING_AUDIT_FINDINGS.md.
//   node tools/test/probe.js "http://127.0.0.1:8090/?nohome" - "@tools/test/putt-fix8.js"
// 1 the scale Auto picks by marker distance and Perception, through the game's own readMarker and autoSelectPuttScale;
// 2 putts per nine with the old switch points (the band's middle at 11 and 30 ft) and the new rule (the smallest scale whose
// 100% covers the band's top). Strokes go through the game's own reader; their tempo is drawn around 1.00. Practice mode is
// on: no ball is rolled by the game and nothing is saved. Takes about a minute.
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 50 && !window.__golf; i++) await sleep(200);
  const g = window.__golf, FT = 0.3048, out = [], P = g.PUTTERS, PUTT = g.PUTT;
  const f = (v, n = 0) => (v === null || v === undefined || Number.isNaN(v) ? '—' : v.toFixed(n));
  const lerp = (a, b, t) => a + (b - a) * t, clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  g.setMode('putt'); g.state.practice = true; g.setBadStreak(0); g.state.puttScaleAuto = true;
  out.push(`PUTT.scaleFill ${PUTT.scaleFill} · scales ${PUTT.scales.map((s) => `${s.name} ${s.ft} ft`).join(', ')}`);

  // 1 the real function: move the marker out along the line and note where the scale changes
  out.push('', '1 WHERE AUTO SWITCHES (the marker\'s distance, the game\'s own functions). Each: the last marker distance on the smaller scale → the stroke it asks for there, then just past it');
  const keepPer = g.state.perception;
  for (const per of [1, 5, 10]) {
    g.state.perception = per;
    const at = (ft) => { g.state.markDist = ft * FT; g.readMarker(); g.autoSelectPuttScale(); return g.state.puttScale; };
    const cells = [];
    for (const from of [0, 1]) {
      let last = null;
      for (let ft = 5; ft <= 60; ft += 0.1) { if (at(ft) === from) last = ft; else if (last !== null && at(ft) > from) break; }
      const a = PUTT.scales[from], b = PUTT.scales[from + 1];
      cells.push(`${a.name} → ${b.name} at ${f(last, 1)} ft: ${f(last / a.ft * 100)}% of ${a.name}, then ${f((last + 0.1) / b.ft * 100)}% of ${b.name}`);
    }
    out.push(`   Perception ${per}: ${cells.join('  ·  ')}`);
  }
  g.state.perception = keepPer; g.state.markDist = 20 * FT; g.readMarker(); g.autoSelectPuttScale();
  out.push('   (before: Short → Medium at 11.0 ft: 73% of Short, then 28% of Medium · Medium → Lag at 30.0 ft: 75%, then 33%; the same at every Perception, give or take the read\'s bias)');

  // 2 the score
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
  // the marker is put 1.5 ft past the cup; the read is Perception 5's (its band is ±7.1%, its middle off by up to 5.6%)
  const HALF = lerp(0.12, 0.01, 4 / 9), pick = (rule, mid) => { const hi = mid * (1 + HALF) / 1; return rule === 'old' ? (mid <= 11 ? 15 : mid <= 30 ? 40 : 90) : (PUTT.scales.find((s) => hi <= s.ft * PUTT.scaleFill) || PUTT.scales[PUTT.scales.length - 1]).ft; };
  function playHole(d0, putter, hand, rule, rnd, G, st) {
    let d = d0, n = 0;
    while (n < 6) {
      const want = (d + PUTT.diePastFt) * (1 + (rnd() * 2 - 1) * lerp(0.10, 0, 4 / 9)), scale = pick(rule, want);
      let sw = null;
      for (let tries = 0; tries < 4 && !sw; tries++) {
        const L = clamp(want / scale * (1 + hand.lenProp * G()) + hand.lenAbs * G(), 0.03, 1.12);
        sw = stroke({ L, slope: Math.tan(hand.ang * G() * Math.PI / 180) + hand.lat * G() / L, yImp: hand.lat * (1 + L) * G(), wob: Math.abs(hand.lat * 0.3 * G()) });
      }
      if (!sw) { n++; continue; }
      sw.tempo = Math.exp(hand.tempo * G());
      const res = g.computePutt(sw, putter, { scaleFt: scale, stimp: STIMP, composure: 5, badStreak: 0, dex: 5 }, rnd), r = rollFlat(d, res.v0, res.start);
      n++;
      if (n === 1) { st.n++; st.len += sw.len; if (r.holed) st.made++; else st.leave += r.leave; }
      if (r.holed) break;
      d = Math.max(0.25, r.leave);
    }
    if (n >= 3) st.three++;
    return n;
  }
  const N = window.__N || 1500;
  const cell = (d, putter, hand, rule) => { const rnd = g.rng32(5000 + d * 13), G = gaussOf(rnd), st = { n: 0, made: 0, three: 0, len: 0, leave: 0 }; let p = 0; for (let k = 0; k < N; k++) p += playHole(d, putter, hand, rule, rnd, G, st); return { e: p / N, make: st.made / st.n, three: st.three / N, len: st.len / st.n, leave: st.leave / Math.max(1, st.n - st.made) }; };
  out.push('', `2 PUTTS PER NINE, old switch points → new (first putts 2×5, 2×10, 2×20, 2×30, 1×45 ft; flat Stimp ${STIMP}; ${N} holes a cell)`);
  const MIX = [[5, 2], [10, 2], [20, 2], [30, 2], [45, 1]];
  for (const hk of Object.keys(HANDS)) {
    out.push(`  HAND ${hk}`);
    for (const pid of ['p-wh2', 'p-newport', 'p-spider', 'p-oz1']) {
      let b = 0, a = 0; const by = {};
      for (const [d, w] of MIX) { const o = cell(d, P[pid], HANDS[hk], 'old'), n = cell(d, P[pid], HANDS[hk], 'new'); b += o.e * w; a += n.e * w; by[d] = { o, n }; }
      out.push(`   ${pid.padEnd(10)} ${f(b, 2)} → ${f(a, 2)} (${f(a - b, 2)}) · 10 ft: stroke ${f(by[10].o.len * 100)} → ${f(by[10].n.len * 100)}%, holed ${f(by[10].o.make * 100)} → ${f(by[10].n.make * 100)}% · 30 ft: stroke ${f(by[30].o.len * 100)} → ${f(by[30].n.len * 100)}%, holed ${f(by[30].o.make * 100)} → ${f(by[30].n.make * 100)}%, misses left ${f(by[30].o.leave, 1)} → ${f(by[30].n.leave, 1)} ft, three-putts ${f(by[30].o.three * 100, 1)} → ${f(by[30].n.three * 100, 1)}%`);
      await sleep(0);
    }
  }
  out.push('', '3 IN BETWEEN: the average hand with the Newport 2, first putts of 8 to 40 ft: putts to hole out, old → new (the stroke asked for)');
  out.push('   ' + [8, 10, 12, 14, 16, 20, 25, 28, 32, 36, 40].map((d) => { const o = cell(d, P['p-newport'], HANDS.average, 'old'), n = cell(d, P['p-newport'], HANDS.average, 'new'); return `${d} ft: ${f(o.e, 2)} → ${f(n.e, 2)} (${f(o.len * 100)} → ${f(n.len * 100)}%)`; }).join('  ·  '));
  return out.join('\n');
})()
