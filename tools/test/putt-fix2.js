// Putting audit PT2 and PT3 (the tempo reading depended on stroke length, and on mouse jitter during a pause): what the fix does.
//   node tools/test/probe.js "http://127.0.0.1:8090/?nohome" - "@tools/test/putt-fix2.js"
// Every stroke goes through the game's own reader (beginSwing, swingSample). "Old" is the old formula worked out here from the
// same samples (the whole back time from the takeaway threshold ÷ the whole forward time less a pause); "new" is what the game reads.
// Practice mode is on: the game rolls no ball and saves nothing. Takes about a minute.
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 50 && !window.__golf; i++) await sleep(200);
  const g = window.__golf, FT = 0.3048, out = [], P = g.PUTTERS, PUTT = g.PUTT;
  const f = (v, n = 0) => (v === null || v === undefined || Number.isNaN(v) ? '—' : v.toFixed(n));
  const lerp = (a, b, t) => a + (b - a) * t, clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  g.setMode('putt'); g.state.practice = true; g.setBadStreak(0);
  const px = g.state.cal.swingPx;
  const mj = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * u * (10 - 15 * u + 6 * u * u));
  const cosE = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : 0.5 - 0.5 * Math.cos(Math.PI * u));
  const oldTempo = (S, iTop, iImp) => { const pause = Math.max(0, (S[Math.min(iTop + 1, iImp)].t - S[iTop].t) - 40); return Math.max(1, S[iTop].t - S[Math.min(1, iTop)].t) / Math.max(1, S[iImp].t - S[iTop].t - pause); };
  let clock = 1e6;
  // o: L (share of the 100% stroke), ratio (true back time ÷ top-to-ball time), back 'mj' | 'cos', fwd 'hmj' (the first half of a
  // smooth reach, so it is still speeding up at the ball) | 'qcos' (a pendulum's quarter swing) | 'mirror' (the back stroke run
  // backwards), hold ms at the top, holdJit counts, hz, creep ms (the hand drifts 4 counts back and waits before the takeaway),
  // falseStart (goes back 60% of the way, comes forward a third of that, then goes on back), slope, yImp, wob
  function stroke(o) {
    const L = o.L * px, slope = o.slope || 0, yT = (o.yImp || 0) * px - slope * L, tB = o.tB || (350 + 450 * o.L), hold = o.hold || 0;
    const tF = tB / (o.ratio || 1), dtS = 1000 / (o.hz || 125), wob = (o.wob || 0) * px, ease = o.back === 'cos' ? cosE : mj, creep = o.creep || 0;
    const fwd = (u) => (o.fwd === 'qcos' ? 1 - Math.cos(Math.PI / 2 * u) : o.fwd === 'mirror' ? 1 - ease(1 - u) : 2 * mj(u / 2));     // share of the way from the top to the ball
    const fs = o.falseStart ? 0.35 * tB : 0;      // extra time the false start takes
    const back = (t) => {
      if (!o.falseStart) return ease(t / tB);
      const t1 = 0.5 * tB, t2 = t1 + fs;          // to 60%, forward to 40%, then on to 100%
      return t <= t1 ? 0.6 * ease(t / t1) : t <= t2 ? 0.6 - 0.2 * ease((t - t1) / fs) : 0.4 + 0.6 * ease((t - t2) / (tB - t1));
    };
    const tTop = creep + tB + fs;
    const pos = (t) => {
      if (t <= creep) return [-Math.min(4, t / 20), 0];
      if (t <= tTop) { const u = back(t - creep); return [-L * u, yT * u]; }
      if (t <= tTop + hold) return [-L, yT + (o.holdJit ? Math.round(Math.sin((t - tTop) * 0.2)) * o.holdJit : 0)];
      const u = (t - tTop - hold) / tF, fr = u <= 1 ? fwd(u) : 1 + (u - 1) * 2, x = -L + L * fr;
      return [x, yT + slope * (x + L) + wob * Math.sin(3 * Math.PI * Math.min(1, fr))];
    };
    g.beginSwing(true);
    let lx = 0, ly = 0; const t0 = clock, end = tTop + hold + tF * 1.2;
    for (let t = dtS; t <= end + dtS && g.swing.phase !== 'through'; t += dtS) {
      const [x, y] = pos(t), X = Math.round(x), Y = Math.round(y);
      if (X !== lx || Y !== ly) { g.swingSample(X - lx, Y - ly, t0 + t); lx = X; ly = Y; }
    }
    clock = t0 + end + 500;
    const hit = g.swing.phase === 'through', tel = hit ? g.puttTel : null;
    const res = tel ? { ...tel.sw, old: oldTempo(g.swing.S, g.swing.iTop, g.swing.iImp) } : null;
    g.endSwing('silent');
    return res;
  }
  const LENS = [0.05, 0.08, 0.13, 0.2, 0.33, 0.5, 0.75, 1.0], pair = (s) => (s ? `${f(s.old, 2)} → ${f(s.tempo, 2)}` : 'no stroke');

  out.push(`px ${px} · PUTT.tempoSpan ${JSON.stringify(PUTT.tempoSpan)}`);
  out.push('', '1 ONE TRUE RHYTHM AT EVERY LENGTH (back time = top-to-ball time). tempo read, old → new');
  for (const [back, fwd] of [['mj', 'hmj'], ['mj', 'qcos'], ['cos', 'hmj'], ['cos', 'qcos']]) for (const hz of [125, 1000]) out.push(`   back ${back}, forward ${fwd}, ${hz} Hz: ` + LENS.map((L) => `${f(L * 100)}%: ${pair(stroke({ L, back, fwd, hz }))}`).join('  '));
  out.push('   a true 2:1 (back mj, forward hmj): ' + LENS.map((L) => `${f(L * 100)}%: ${pair(stroke({ L, ratio: 2 }))}`).join('  '));
  out.push('   forward at the pace it went back (the back stroke mirrored), mj: ' + LENS.map((L) => `${f(L * 100)}%: ${pair(stroke({ L, fwd: 'mirror' }))}`).join('  '));
  out.push('   the same, cos: ' + LENS.map((L) => `${f(L * 100)}%: ${pair(stroke({ L, back: 'cos', fwd: 'mirror' }))}`).join('  '));
  out.push('   the true rhythm that reads 1.00 now (back mj, forward hmj): ' + LENS.map((L) => { let lo = 0.6, hi = 2; for (let i = 0; i < 20; i++) { const m = (lo + hi) / 2, s = stroke({ L, ratio: m }); if (s && s.tempo < 1) lo = m; else hi = m; } return `${f(L * 100)}%: ${f(lo, 2)}`; }).join('  '));

  out.push('', '2 A PAUSE AT THE TOP (50% stroke, back mj, forward hmj). tempo read, old → new');
  out.push('   ' + [0, 100, 300, 600].map((h) => `${h} ms, still: ${pair(stroke({ L: 0.5, hold: h }))} · one count of jitter: ${pair(stroke({ L: 0.5, hold: h, holdJit: 1 }))}`).join('  |  '));
  out.push('   13% stroke: ' + [0, 300].map((h) => `${h} ms, still: ${pair(stroke({ L: 0.13, hold: h }))} · jitter: ${pair(stroke({ L: 0.13, hold: h, holdJit: 1 }))}`).join('  |  '));

  out.push('', '3 UNTIDY STROKES (back mj, forward hmj). tempo read, old → new');
  out.push('   the hand drifts 4 counts back and waits 600 ms before the takeaway: ' + [0.13, 0.33, 0.75].map((L) => `${f(L * 100)}%: ${pair(stroke({ L, creep: 600 }))}`).join('  '));
  out.push('   a false start (back 60%, forward a little, then on back): ' + [0.13, 0.33, 0.75].map((L) => `${f(L * 100)}%: ${pair(stroke({ L, falseStart: true }))}`).join('  '));
  out.push('   the shortest strokes (2.5% to 6%): ' + [0.025, 0.03, 0.04, 0.05, 0.06].map((L) => `${f(L * 100, 1)}%: ${pair(stroke({ L }))}`).join('  '));

  // 4 debugSwing delivers the tempo it is asked for
  out.push('', '4 debugSwing: tempo asked → read');
  g.state.practice = true;
  for (const back of [0.1, 0.33, 1]) { const cells = []; for (const tempo of [0.7, 1, 1.3]) { const tel = g.debugSwing({ back, tempo }); cells.push(`${tempo} → ${tel && tel.sw ? f(tel.sw.tempo, 2) : '—'}`); g.endSwing('silent'); await sleep(30); } out.push(`   back ${f(back * 100)}%: ${cells.join('  ')}`); }

  // 5 the score: a hand that keeps one true rhythm for every putt, read the old way and the new way
  const gaussOf = (rnd) => () => { let u = 0, v = 0; while (u === 0) u = rnd(); v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  const HAND = { ang: 1.5, lat: 0.008, lenAbs: 0.012, lenProp: 0.02, tempo: 0.12 };      // the audit's average hand
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
  function playHole(d0, putter, o, rnd, G, st) {
    let d = d0, n = 0;
    while (n < 6) {
      const want = (d + PUTT.diePastFt) * (1 + (rnd() * 2 - 1) * lerp(0.10, 0, 4 / 9)), scale = want <= 11 ? 15 : want <= 30 ? 40 : 90;
      let sw = null;
      for (let tries = 0; tries < 4 && !sw; tries++) {
        const L = clamp(want / scale * (1 + HAND.lenProp * G()) + HAND.lenAbs * G(), 0.03, 1.12);
        sw = stroke({ L, ratio: o.ratio, back: o.back, fwd: o.fwd, slope: Math.tan(HAND.ang * G() * Math.PI / 180) + HAND.lat * G() / L, yImp: HAND.lat * (1 + L) * G(), wob: Math.abs(HAND.lat * 0.3 * G()) });
      }
      if (!sw) { n++; continue; }
      sw.tempo = (o.old ? sw.old : sw.tempo) * Math.exp(HAND.tempo * G());
      const res = g.computePutt(sw, putter, { scaleFt: scale, stimp: STIMP, composure: 5, badStreak: 0, dex: 5 }, rnd), r = rollFlat(d, res.v0, res.start);
      n++;
      if (n === 1) { st.n++; st.dec += res.dec > 0 ? 1 : 0; st.hot += res.hot > 0 ? 1 : 0; }
      if (r.holed) break;
      d = Math.max(0.25, r.leave);
    }
    return n;
  }
  const MIX = [[5, 2], [10, 2], [20, 2], [30, 2], [45, 1]], N = 1000;
  const per9 = (putter, o) => { let tot = 0; const st = { n: 0, dec: 0, hot: 0 }; for (const [d, w] of MIX) { const rnd = g.rng32(5000 + d * 13), G = gaussOf(rnd); let p = 0; for (let k = 0; k < N; k++) p += playHole(d, putter, o, rnd, G, st); tot += p / N * w; } return `${f(tot, 2)} (${f(st.dec / st.n * 100)}% slow, ${f(st.hot / st.n * 100)}% quick)`; };
  out.push('', `5 PUTTS PER NINE, the average hand keeping one true rhythm for every putt (first putts 2×5, 2×10, 2×20, 2×30, 1×45 ft; flat Stimp ${STIMP}; ${N} holes a cell). old reader → new reader, with the share of first putts read slow / quick of the window`);
  for (const [name, o] of [['true 1:1, smooth reach back and through (mj, hmj)', { ratio: 1 }], ['true 1:1, pendulum shapes (cos, qcos)', { ratio: 1, back: 'cos', fwd: 'qcos' }], ['true 1.16:1 (mj, hmj)', { ratio: 1.16 }], ['true 1.3:1 (mj, hmj)', { ratio: 1.3 }], ['true 2:1 (mj, hmj)', { ratio: 2 }]]) {
    out.push(`  ${name}`);
    for (const pid of ['p-newport', 'p-spider', 'p-oz1']) { out.push(`   ${pid.padEnd(10)} ${per9(P[pid], { ...o, old: true })}  →  ${per9(P[pid], o)}`); await sleep(0); }
  }
  return out.join('\n');
})()
