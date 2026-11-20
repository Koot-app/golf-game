// Swing audit fixes S2.5 (a mishit lob wedge loses ball speed) and S2.7 (spin-axis tilt per degree of face-to-path
// follows the D-plane from the driver to the 8 iron): the re-measures.
//   node tools/test/probe.js "http://127.0.0.1:8090/?nohome" - @tools/test/swing-fix13.js 0 swing-fix13
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 50 && !window.__golf; i++) await sleep(200);
  const g = window.__golf, YD = 0.9144, D2R = Math.PI / 180, out = [], C = g.CLUBS;
  const f = (v, n = 1) => (v === null || v === undefined || Number.isNaN(v) ? '—' : v.toFixed(n));
  const padE = (s, n) => String(s).padEnd(n);
  const SU = { face: 0, ballPos: 0, stance: 0, traj: 0, spinCtl: 0 };
  const SW0 = { bs: 1, ds: 1, thetaMouse: 0, sigma: 0, lateSign: 1, vImpact: 1, vPeak: 1, miss: 0 };
  const env = (dex, teed, stock) => ({ lie: 'fairway', slope: 'flat', power: 5, dex, composure: 5, badStreak: 0, teed, stock });
  const fly = (r, teed) => { const fl = g.createFlight({ ballSpeed: r.ballSpeed, vla: r.vla, dir: r.hla, spin: r.spin, axis: r.axis, release: r.release }, { x: 0, z: 0 }, teed ? 0.04 : 0); for (let n = 0; fl.phase !== 'stopped' && n < 30000; n++) g.stepFlight(fl, 1 / 120); return { side: fl.p.x / YD, total: -fl.p.z / YD, carry: fl.carry / YD }; };
  const shot = (i, su = {}, sw = {}) => { const teed = !!C[i].tee; const r = g.computeImpact({ ...SW0, ...sw }, { ...SU, ...su }, C[i], env(5, teed, true), () => 0.5); return { r, ...fly(r, teed) }; };
  // ---- S2.5
  out.push('S2.5 BALL SPEED AT A TOE STRIKE (stock swing): smash and ball speed lost at 4 / 8 / 14 / 20 mm',
    '   (before: 14 mm cost the 7 iron −12.0%, PW −10.2%, sand wedge −2.4%, lob wedge 0.0%)');
  for (const i of [0, 4, 7, 9, 10, 11, 12, 13]) {
    const base = shot(i), cells = [4, 8, 14, 20].map((mm) => { const s = shot(i, {}, { sigma: mm / 1.0056 }); return `${f(s.r.strike, 0)} mm ${f(s.r.smash, 3)} ${f((s.r.ballSpeed / base.r.ballSpeed - 1) * 100)}%`; });
    out.push(`   ${padE(C[i].name, 16)} centred ${f(base.r.smash, 3)} · ${cells.join(' · ')}`);
  }
  // ---- S2.7
  out.push('', 'S2.7 SPIN-AXIS TILT PER DEGREE OF FACE-TO-PATH (a 2° open face, straight path), against the D-plane estimate atan(tan 1° / tan spin loft)',
    '   club             curve  game °/°  D-plane  · 2° open finishes (yds right) · a 5° in-to-out mouse path finishes');
  for (let i = 0; i < 14; i++) {
    const a = shot(i, { face: 2 }), p = shot(i, {}, { thetaMouse: 5 }), sl = C[i].dynLoft - C[i].aoa, dpl = Math.atan(Math.tan(D2R) / Math.tan(sl * D2R)) / D2R;
    out.push(`   ${padE(C[i].name, 16)} ${padE(f(C[i].curve || 1, 2), 6)} ${padE(f(a.r.axis / 2, 2), 9)} ${padE(f(dpl, 2), 8)} · ${padE(f(a.side), 6)} · ${f(Math.abs(p.side))} ${p.side < 0 ? 'L' : 'R'}`);
  }
  // dispersion: 500 seeded ordinary swings (SPREAD's default hand), Dex 2 / 5 / 9: 2σ wide, % within 10 yds (20 for the woods)
  out.push('', '   dispersion, 500 ordinary swings (the default hand): 2σ wide yds and % within 10 yds of the stock finish (20 for the driver, 3 wood, hybrids), Dex 2 / 5 / 9');
  for (const i of [0, 1, 3, 4, 5, 7, 8, 10]) {
    const R = i <= 3 ? 20 : 10, cells = [];
    for (const dex of [2, 5, 9]) {
      const rnd = g.rng32(4242 + i), teed = !!C[i].tee, aim = shot(i), P = [];
      for (let k = 0; k < 500; k++) P.push(fly(g.computeImpact(g.spreadSwing(rnd), SU, C[i], env(dex, teed, false), rnd), teed));
      const mx = P.reduce((s, q) => s + q.side, 0) / P.length, sx = Math.sqrt(P.reduce((s, q) => s + (q.side - mx) ** 2, 0) / P.length);
      cells.push(`${f(2 * sx)} · ${f(P.filter((q) => Math.hypot(q.side - aim.side, q.total - aim.total) <= R).length / 5, 0)}%`);
    }
    out.push(`   ${padE(C[i].name, 16)} ${cells.join('  /  ')}`);
  }
  // the shape solver: still quick (it refines its face-to-path now, and backs off a shape the setup can't bring back)
  {
    const S = g.state, saved = [S.lie, S.height], times = [];
    for (const [lie, h] of [['fairway', 0], ['light', -2], ['heavy', -2], ['heavy', 0]]) {
      S.lie = lie; S.height = h;
      for (const ci of [0, 4, 7, 12]) { const t0 = performance.now(); g.solveShape(ci, -1); g.solveShape(ci, 1); times.push(performance.now() - t0); }
    }
    [S.lie, S.height] = saved;
    out.push('', `   solveShape, a draw and a fade (uncached): mean ${f(times.reduce((s, t) => s + t, 0) / times.length, 0)} ms, worst ${f(Math.max(...times), 0)} ms`);
  }
  return out.join('\n');
})()
