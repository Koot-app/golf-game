// Swing audit fixes S5.1 (forgiveness has costs), S5.2 (GI sets land flatter, spin less) and S5.3 (the shop's Stopping
// bar): the re-measures. The full model tables are tools/test/swing-models.js; this adds what S5.1's fix changed.
//   node tools/test/probe.js "http://127.0.0.1:8090/?nohome" - @tools/test/swing-fix2.js 0 swing-fix2
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 50 && !window.__golf; i++) await sleep(200);
  const g = window.__golf, YD = 0.9144, out = [], C = g.CLUBS, M = g.CLUB_MODELS, S = g.state;
  const f = (v, n = 1) => (v === null || v === undefined || Number.isNaN(v) ? '—' : v.toFixed(n));
  const gauss = (rnd) => { let s = 0; for (let k = 0; k < 6; k++) s += rnd(); return (s - 3) / Math.sqrt(0.5); };
  Object.assign(S, { lie: 'fairway', slope: 'flat', power: 5, dex: 5, composure: 5, badStreak: 0, height: 0, spinCtl: 0 });
  const SU = { face: 0, ballPos: 0, stance: 0, traj: 0, spinCtl: 0 };
  const apply = (i, id) => { const c = C[i]; for (const k of Object.keys(c)) if (!(k in g.BASE_CLUBS[i])) delete c[k]; Object.assign(c, g.BASE_CLUBS[i]); if (id) Object.assign(c, g.modelMods(M[id], i), { model: id }); };
  const game = (rnd) => ({ bs: 1 + g.SPREAD.backswing * (rnd() + rnd() - 1), ds: 1, thetaMouse: g.SPREAD.mouseDeg * 2 * (rnd() + rnd() - 1), sigma: g.SPREAD.wobble * rnd(), lateSign: rnd() < 0.5 ? 1 : -1, vImpact: 1, vPeak: 1, miss: 0 });
  const fly = (r) => { const fl = g.createFlight({ ballSpeed: r.ballSpeed, vla: r.vla, dir: r.hla, spin: r.spin, axis: r.axis, release: r.release }, { x: 0, z: 0 }, 0); for (let n = 0; fl.phase !== 'stopped' && n < 30000; n++) g.stepFlight(fl, 1 / 120); return fl; };
  // a club's spread with a setup: complexity, 2σ width, share within 10 yds of the stock finish
  const spread = (ci, su, dex, N = 500) => {
    const st = fly(g.computeImpact({ bs: 1, ds: 1, thetaMouse: 0, sigma: 0, lateSign: 1, vImpact: 1, vPeak: 1, miss: 0 }, su, C[ci], { lie: 'fairway', slope: 'flat', power: 5, dex, composure: 5, badStreak: 0, teed: false, stock: true }, () => 0.5));
    const rnd = g.rng32(4242 + ci), P = []; let cx = 0;
    for (let k = 0; k < N; k++) { const r = g.computeImpact(game(rnd), su, C[ci], { lie: 'fairway', slope: 'flat', power: 5, dex, composure: 5, badStreak: 0, teed: false }, rnd); cx += r.complexity; P.push(fly(r).p); }
    const mx = P.reduce((s, p) => s + p.x, 0) / N, w = 2 * Math.sqrt(P.reduce((s, p) => s + (p.x - mx) ** 2, 0) / N) / YD;
    return { cx: cx / N, w, hit: P.filter((p) => Math.hypot(p.x - st.p.x, p.z - st.p.z) <= 10 * YD).length / N };
  };
  out.push('S5.1 THE TRADE-OFFS NOW (7 iron; "game" swing as the minimap assumes): straight and with the Draw preset at Dex 2 and 5:',
    '   complexity · 2σ width · within 10 yds; and the roll on a green, the Low 2 apex and the 5° mouse path');
  for (const id of ['i-takomo', 'i-qimax', 'i-jpxhm', 'i-ai200', 'i-zxi7', 'i-620cb', 'i-wmb', 'i-ap1']) {
    apply(7, id);
    const cells = [];
    for (const dex of [2, 5]) { S.dex = dex; const v = g.solveShape(7, -1), a = spread(7, SU, dex), d = spread(7, { ...SU, face: v.face, stance: v.stance }, dex); cells.push(`Dex ${dex}: straight ${f(a.cx, 2)} · ±${f(a.w, 1)} · ${f(a.hit * 100, 0)}%  draw ${f(d.cx, 2)} · ±${f(d.w, 1)} · ${f(d.hit * 100, 0)}%`); }
    S.dex = 5;
    const p5 = fly(g.computeImpact({ bs: 1, ds: 1, thetaMouse: 5, sigma: 0, lateSign: 1, vImpact: 1, vPeak: 1, miss: 0 }, SU, C[7], { lie: 'fairway', slope: 'flat', power: 5, dex: 5, composure: 5, badStreak: 0, teed: false, stock: true }, () => 0.5));
    out.push(`   ${M[id].name.padEnd(18)} work ${f(C[7].work, 2)}, shapeCx ${f(C[7].shapeCx || 1, 2)} · ${cells.join(' · ')} · 5° path ${f(p5.p.x / YD, 1)} yds`);
  }
  apply(7, null);
  // ---- S5.3: the shop's numbers
  out.push('', 'S5.3 THE SHOP\'S BARS: landing angle at the first touchdown, the roll on a green (the Stopping bar: less roll = longer bar)');
  for (const kind of ['iron', 'driver', 'wedge']) {
    const ids = Object.keys(M).filter((k) => M[k].kind === kind);
    out.push(`   ${kind}: ${ids.map((id) => { const s = g.shopStats(id); return `${id} ${f(s.land, 1)}° roll ${f(s.roll, 1)}`; }).join(' · ')}`);
  }
  return out.join('\n');
})()
