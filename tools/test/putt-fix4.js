// Putting audit PT5 (the sweet spot never mattered, and a mallet could not leave its own): what the fix does. See PUTTING_AUDIT_FINDINGS.md.
//   node tools/test/probe.js "http://127.0.0.1:8090/?nohome" - "@tools/test/putt-fix4.js"
// 1 the strike and what it costs, by how far the stroke missed the ball's line; 2 putts per nine: the sweet spot alone (the practice
// blade with the shop's smallest and biggest) and the shop putters, with how often a putt is struck outside the sweet spot;
// 3 Dexterity. "Before" is the old rule worked out here for the same strokes (the miss divided by the gate, 5% lost at the edge
// rising to 12%, no twist). To try other constants, a setup expression such as "window.__STRIKE={mm:200,loss:0.04}";
// "window.__HANDS=['loose']" cuts part 2 down. Strokes go through the game's own reader; their tempo is drawn around 1.00.
// Practice mode is on: no ball is rolled by the game and nothing is saved. Takes about a minute.
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 50 && !window.__golf; i++) await sleep(200);
  const g = window.__golf, FT = 0.3048, out = [], P = g.PUTTERS, PUTT = g.PUTT;
  const f = (v, n = 0) => (v === null || v === undefined || Number.isNaN(v) ? '—' : v.toFixed(n));
  const lerp = (a, b, t) => a + (b - a) * t, clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const KEYS = { mm: 'strikeMm', loss: 'strikeLoss', lossMax: 'strikeLossMax', tw: 'strikeTwistDeg', twMax: 'strikeTwistMax' };
  const REAL = Object.fromEntries(Object.entries(KEYS).map(([k, n]) => [k, PUTT[n]])), setS = (o) => { for (const [k, n] of Object.entries(KEYS)) PUTT[n] = o[k]; };
  if (window.__STRIKE) setS({ ...REAL, ...window.__STRIKE });
  out.push('PUTT ' + Object.values(KEYS).map((n) => `${n} ${PUTT[n]}`).join(' · '));
  const cfg = (o = {}) => ({ scaleFt: 40, stimp: 11, composure: 5, badStreak: 0, dex: 5, ...o });
  // the old rule, for the same stroke: returns the old strike (mm), its rollout loss, and the result's ball speed and start line under it
  const old = (sw, putter, res, dex = 5) => {
    const mm = Math.min(15, sw.sigma * 1.2 * (1 - 0.4 * (dex - 1) / 9) + Math.abs(sw.miss || 0) / res.gate * 3), loss = mm > putter.sweet ? lerp(0.05, 0.12, clamp((mm - putter.sweet) / 8, 0, 1)) : 0;
    const off = Math.max(0, Math.abs(res.strike) - putter.sweet), tw = off > 0 ? Math.sign(res.strike) * Math.min(PUTT.strikeTwistMax, PUTT.strikeTwistDeg * off) : 0;
    return { mm, loss, v0: res.v0 * Math.sqrt((1 - loss) / (1 - res.loss)), start: res.start - tw };
  };
  try {
    out.push('', '1 THE STRIKE by how far the stroke missed the ball\'s line (share of the 100% stroke), ordinary wobble. before → after: mm, rollout lost, and the start line it adds');
    for (const pid of ['p-wh2', 'blade', 'p-pldanser', 'p-oz1', 'p-spider']) {
      const cells = [0, 0.01, 0.02, 0.03, 0.04, 0.05, 0.08].map((miss) => {
        const sw = { thetaMouse: 0, excursion: 0, tempo: 1, sigma: 1, lateSign: 1, miss: -miss, len: 0.5 }, r = g.computePutt(sw, P[pid], cfg(), () => 0.5), o = old(sw, P[pid], r);
        return `${f(miss * 100)}%: ${f(o.mm, 1)} mm${o.loss ? ' −' + f(o.loss * 100, 1) + '%' : ''} → ${f(r.mm, 1)} mm${r.loss ? ` −${f(r.loss * 100, 1)}% ${r.start >= 0 ? '+' : ''}${f(r.start, 2)}°` : ''}`;
      });
      out.push(`   ${pid.padEnd(11)} (sweet ${P[pid].sweet} mm) ${cells.join('  |  ')}`);
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
    function playHole(d0, putter, hand, o, rnd, G, st) {
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
        const dex = o.dex || 5, res = g.computePutt(sw, putter, cfg({ scaleFt: scale, stimp: STIMP, dex }), rnd), use = o.before ? old(sw, putter, res, dex) : res, r = rollFlat(d, use.v0, use.start);
        n++; st.putts++; st.mm += use.mm; if (use.loss > 0) { st.off++; st.loss += use.loss; }
        if (r.holed) break;
        d = Math.max(0.25, r.leave);
      }
      return n;
    }
    const MIX = [[5, 2], [10, 2], [20, 2], [30, 2], [45, 1]], N = 1500;
    const per9 = (putter, hand, o = {}) => { let tot = 0; const st = { putts: 0, off: 0, loss: 0, mm: 0 }; for (const [d, w] of MIX) { const rnd = g.rng32(5000 + d * 13), G = gaussOf(rnd); let p = 0; for (let k = 0; k < N; k++) p += playHole(d, putter, hand, o, rnd, G, st); tot += p / N * w; } return { tot, off: st.off / st.putts, loss: st.off ? st.loss / st.off : 0, mm: st.mm / st.putts }; };
    out.push('', `2 PUTTS PER NINE (first putts 2×5, 2×10, 2×20, 2×30, 1×45 ft; flat Stimp ${STIMP}; ${N} holes a cell). before → after · the average strike · the share of putts struck outside the sweet spot (before → after) and the rollout those lose on average`);
    for (const hk of window.__HANDS || Object.keys(HANDS)) {
      out.push(`  HAND ${hk}`);
      const rows = [['blade, sweet 3.5 mm (the shop\'s smallest)', { ...P.blade, sweet: 3.5 }], ['blade, sweet 10 mm (the biggest)', { ...P.blade, sweet: 10 }], ...['p-wh2', 'p-newport', 'p-pldanser', 'p-spider', 'p-oz1'].map((id) => [id, P[id]])], got = [];
      for (const [name, putter] of rows) {
        const b = per9(putter, HANDS[hk], { before: true }), a = per9(putter, HANDS[hk]); got.push({ b, a });
        out.push(`   ${name.padEnd(40)} ${f(b.tot, 2)} → ${f(a.tot, 2)} (${a.tot - b.tot >= 0 ? '+' : ''}${f(a.tot - b.tot, 2)}) · ${f(a.mm, 1)} mm · outside ${f(b.off * 100)} → ${f(a.off * 100)}% of putts, −${f(a.loss * 100, 1)}%`);
        await sleep(0);
      }
      out.push(`   → the sweet spot alone is worth (smallest − biggest): ${f(got[0].b.tot - got[1].b.tot, 2)} before, ${f(got[0].a.tot - got[1].a.tot, 2)} after`);
    }
    out.push('', '3 DEXTERITY (the average and loose hands, Newport 2 and the White Hot): putts per nine after, by Dexterity 1 / 5 / 10');
    for (const hk of ['average', 'loose']) for (const pid of ['p-wh2', 'p-newport']) { out.push(`   ${hk}, ${pid}: ` + [1, 5, 10].map((dex) => `${f(per9(P[pid], HANDS[hk], { dex }).tot, 2)}`).join(' / ')); await sleep(0); }
  } finally { setS(REAL); }
  return out.join('\n');
})()
