// Putting audit PT7 (Tilt could not be above zero on a green): the new rule, and what Tilt does to a putt. See PUTTING_AUDIT_FINDINGS.md.
//   node tools/test/probe.js "http://127.0.0.1:8090/?nohome" - "@tools/test/putt-fix6.js"
// 1 the rule, through the game's own tiltFromLie; 2 a real putt on the practice green keeps its Tilt; 3 putts per nine if every
// putt were struck at one Tilt level, by Composure (the average hand, a blade and a mallet). The hand's shake is applied by the
// game's stroke reader, as in play. To try other shake constants: "window.__SHAKE={k:0.006,min:0}".
// Part 2 rolls one real putt on the practice green (not in a round, nothing is saved). Takes about a minute and a half.
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 50 && !window.__golf; i++) await sleep(200);
  const g = window.__golf, FT = 0.3048, out = [], P = g.PUTTERS, PUTT = g.PUTT;
  const f = (v, n = 0) => (v === null || v === undefined || Number.isNaN(v) ? '—' : v.toFixed(n));
  const lerp = (a, b, t) => a + (b - a) * t, clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const REAL = { k: PUTT.tiltShake, min: PUTT.tiltShakeMin };
  if (window.__SHAKE) { PUTT.tiltShake = window.__SHAKE.k; PUTT.tiltShakeMin = window.__SHAKE.min; }
  out.push(`PUTT.tiltShake ${PUTT.tiltShake} · tiltShakeMin ${PUTT.tiltShakeMin}`);
  try {
    // 1 the rule
    out.push('', '1 THE RULE: Tilt level after each finishing lie');
    for (const seq of [['light', 'green'], ['light', 'heavy', 'green'], ['light', 'bunker', 'heavy', 'fringe'], ['light', 'heavy', 'green', 'green'], ['light', 'heavy', 'fairway'], ['light', 'heavy', 'green', 'light'], ['green'], ['light', 'hardpan', 'green']]) {
      g.setBadStreak(0); const got = seq.map((k) => { g.tiltFromLie(k); return `${k} → ${g.state.badStreak}`; });
      out.push('   ' + got.join(' · '));
    }

    // 2 a real putt keeps its Tilt
    g.setMode('putt'); g.state.practice = false; g.setComposure(5); g.setBadStreak(2); await sleep(400);
    const px = g.state.cal.swingPx, mj = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * u * (10 - 15 * u + 6 * u * u));
    {
      g.beginSwing(true); let lx = 0; const t0 = performance.now() + 1000, L = 0.3 * px;
      for (let t = 8; t <= 1400 && g.swing.phase !== 'through'; t += 8) { const x = t <= 500 ? -L * mj(t / 500) : -L + L * 2 * mj((t - 500) / 870), X = Math.round(x); if (X !== lx) { g.swingSample(X - lx, 0, t0 + t); lx = X; } }
      const res = g.puttTel && g.puttTel.res; await sleep(9000);
      out.push('', `2 A REAL PUTT at Tilt ×2, Composure 5, on the practice green: ${res ? `it read "${res.comp}", gate ${f(res.gate * 100, 2)}% (the putter's is ${f(P[g.state.putter].gate * 100, 2)}%)` : 'no stroke'} · Tilt after the ball stopped: ×${g.state.badStreak} (it used to be 0)`);
      g.endSwing('silent');
    }

    // 3 what Tilt does to putting
    g.state.practice = true;
    let clock = 1e6;
    function stroke(o) {
      const L = o.L * px, slope = o.slope || 0, yT = (o.yImp || 0) * px - slope * L, tB = 350 + 450 * o.L, tF = 2 * tB, wob = (o.wob || 0) * px;
      const pos = (t) => {
        if (t <= tB) { const u = mj(t / tB); return [-L * u, yT * u]; }
        const fr = 2 * mj((t - tB) / tF), x = -L + L * fr;
        return [x, yT + slope * (x + L) + wob * Math.sin(3 * Math.PI * Math.min(1, fr))];
      };
      g.beginSwing(true);
      let lx = 0, ly = 0; const t0 = clock + (o.phase || 0), end = tB + tF;
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
    function playHole(d0, putter, comp, streak, rnd, G, st) {
      let d = d0, n = 0;
      while (n < 6) {
        const want = (d + PUTT.diePastFt) * (1 + (rnd() * 2 - 1) * lerp(0.10, 0, 4 / 9)), scale = want <= 11 ? 15 : want <= 30 ? 40 : 90;
        let sw = null;
        for (let tries = 0; tries < 4 && !sw; tries++) {
          const L = clamp(want / scale * (1 + HAND.lenProp * G()) + HAND.lenAbs * G(), 0.03, 1.12);
          sw = stroke({ L, phase: rnd() * 400, slope: Math.tan(HAND.ang * G() * Math.PI / 180) + HAND.lat * G() / L, yImp: HAND.lat * (1 + L) * G(), wob: Math.abs(HAND.lat * 0.3 * G()) });
        }
        if (!sw) { n++; continue; }
        sw.tempo = Math.exp(HAND.tempo * G());
        const res = g.computePutt(sw, putter, { scaleFt: scale, stimp: STIMP, composure: comp, badStreak: streak, dex: 5 }, rnd), r = rollFlat(d, res.v0, res.start);
        n++; st.putts++; if (res.over > 0) st.rail++; if (res.loss > 0) st.off++;
        if (d <= 5 && d0 <= 5 && n === 1) { st.short++; if (r.holed) st.shortIn++; }
        if (r.holed) break;
        d = Math.max(0.25, r.leave);
      }
      return n;
    }
    const MIX = [[5, 2], [10, 2], [20, 2], [30, 2], [45, 1]], N = window.__N || 1000;
    const per9 = (putter, comp, streak) => {
      g.setComposure(comp); g.setBadStreak(streak);
      let tot = 0; const st = { putts: 0, rail: 0, off: 0, short: 0, shortIn: 0 };
      for (const [d, w] of MIX) { const rnd = g.rng32(5000 + d * 13), G = gaussOf(rnd); let p = 0; for (let k = 0; k < N; k++) p += playHole(d, putter, comp, streak, rnd, G, st); tot += p / N * w; }
      return { tot, rail: st.rail / st.putts, off: st.off / st.putts, five: st.shortIn / Math.max(1, st.short) };
    };
    out.push('', `3 PUTTS PER NINE if every putt were struck at one Tilt level (the average hand; first putts 2×5, 2×10, 2×20, 2×30, 1×45 ft; flat Stimp ${STIMP}; ${N} holes a cell). Each cell: Tilt · gate · putts per nine (change from calm) · 5 ft holed · rail hits`);
    for (const pid of window.__IDS || ['p-newport', 'p-spider']) {
      out.push(`  ${pid}`);
      const calm = per9(P[pid], 5, 0);
      out.push(`   calm: ${f(calm.tot, 2)} · 5 ft ${f(calm.five * 100)}% · rail ${f(calm.rail * 100, 1)}%`);
      for (const streak of [1, 2, 3, 4]) {
        const cells = [];
        for (const comp of [1, 5, 10]) { const r = per9(P[pid], comp, streak); cells.push(`Composure ${comp}: Tilt ${f(g.tiltPenalty(comp, streak), 2)} · gate ${f(g.puttGate(P[pid], comp, streak) * 100, 1)}% · ${f(r.tot, 2)} (+${f(r.tot - calm.tot, 2)}) · 5 ft ${f(r.five * 100)}% · rail ${f(r.rail * 100)}%`); await sleep(0); }
        out.push(`   Tilt ×${streak}: ${cells.join('  |  ')}`);
      }
    }
  } finally { PUTT.tiltShake = REAL.k; PUTT.tiltShakeMin = REAL.min; g.setComposure(5); g.setBadStreak(0); }
  return out.join('\n');
})()
