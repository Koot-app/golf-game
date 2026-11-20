// Swing audit fixes S2.1 (hardpan ramp), S6.1 (low spin counted once) and S4.1 (the comparison club is range-only):
// the re-measures each finding asked for. Human swing = S1's estimate (as in swing-risk.js).
//   node tools/test/probe.js "http://127.0.0.1:8090/?nohome" - @tools/test/swing-fix1.js 0 swing-fix1
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 50 && !window.__golf; i++) await sleep(200);
  const g = window.__golf, YD = 0.9144, out = [], C = g.CLUBS, S = g.state;
  const f = (v, n = 1) => (v === null || v === undefined || Number.isNaN(v) ? '—' : v.toFixed(n));
  const gauss = (rnd) => { let s = 0; for (let k = 0; k < 6; k++) s += rnd(); return (s - 3) / Math.sqrt(0.5); };
  Object.assign(S, { lie: 'fairway', slope: 'flat', power: 5, dex: 5, composure: 5, badStreak: 0, height: 0, spinCtl: 0, shotShape: 'straight', face: 0, stance: 0, ballPos: 0 });
  const SU = { face: 0, ballPos: 0, stance: 0, traj: 0, spinCtl: 0 };
  const human = (rnd, bs = 1, sig = [1.5, 4]) => ({ bs: bs + g.SPREAD.backswing * (rnd() + rnd() - 1), ds: 1, thetaMouse: g.SPREAD.mouseDeg * 2 * (rnd() + rnd() - 1), sigma: sig[0] + sig[1] * rnd(), lateSign: rnd() < 0.5 ? 1 : -1, vImpact: 1, vPeak: 1, miss: 0.02 * gauss(rnd) });
  const fly = (r) => { const fl = g.createFlight({ ballSpeed: r.ballSpeed, vla: r.vla, dir: r.hla, spin: r.spin, axis: r.axis, release: r.release }, { x: 0, z: 0 }, 0); for (let n = 0; fl.phase !== 'stopped' && n < 30000; n++) g.stepFlight(fl, 1 / 120); return fl; };
  const env = (lie, dex) => ({ lie, slope: 'flat', power: 5, dex, composure: 5, badStreak: 0, teed: false });
  // ---- S2.1: hardpan
  out.push('S2.1 HARDPAN: bladed or chunked, % of 1,000 shots (human hand), and the mean carry against a clean fairway shot');
  for (const [ci, name] of [[2, '2 Hybrid'], [7, '7 Iron'], [12, 'Sand Wedge']]) {
    const cells = [];
    for (const dex of [1, 2, 5, 8, 10]) {
      const rnd = g.rng32(11 + ci + dex); let bad = 0, carry = 0; const N = 1000;
      for (let k = 0; k < N; k++) { const r = g.computeImpact(human(rnd), SU, C[ci], env('hardpan', dex), rnd); if (r.flags.includes('BLADED') || r.flags.includes('CHUNKED')) bad++; carry += fly(r).carry / YD; }
      cells.push(`Dex ${dex} ${f(bad / N * 100, 0)}% (${f(carry / N, 0)})`);
    }
    out.push(`   ${name.padEnd(11)} ${cells.join(' · ')}   · fairway stock ${f(g.stockFlightOf(ci, SU, 1).f.carry / YD, 0)}`);
  }
  { const rows = []; for (const mm of [2.9, 3.1, 4, 5.5, 7, 8]) {
    // the chance itself at a set strike: Dex 10 (steady 0.45, so sigma = mm / 0.45; its baseline scatter is only ±0.4 mm)
    const rr = g.rng32(77); let b2 = 0; const N = 2000; for (let k = 0; k < N; k++) { const r = g.computeImpact({ bs: 1, ds: 1, thetaMouse: 0, sigma: mm / 0.45, lateSign: 1, vImpact: 1, vPeak: 1, miss: 0 }, SU, C[7], env('hardpan', 10), rr); if (r.flags.includes('BLADED') || r.flags.includes('CHUNKED')) b2++; }
    rows.push(`${mm} mm ${f(b2 / N * 100, 0)}%`); }
    out.push(`   7 iron, chance by strike (Dex 10, no other scatter): ${rows.join(' · ')}`); }
  { const rnd = g.rng32(3); let bad = 0; for (let k = 0; k < 1000; k++) { const r = g.computeImpact(human(rnd, 1, [1, 2]), { face: 7, ballPos: 0.8, stance: -7, traj: 2, spinCtl: 0, flop: true, align: { face: 7, stance: -7, ballPos: 0.8 } }, C[13], env('hardpan', 5), rnd); if (r.flags.includes('BLADED') || r.flags.includes('CHUNKED')) bad++; } out.push(`   the flop off hardpan (lob wedge, Dex 5; its own rule, unchanged): ${f(bad / 10, 0)}%`); }
  // ---- S6.1: the asks, width × stock
  out.push('', 'S6.1 EACH HEIGHT AND SPIN ASK (7 iron, human, 600 shots): read-out (1 + complexity) → 2σ width, and that width × stock');
  const width = (P) => { const m = P.reduce((s, p) => s + p, 0) / P.length; return 2 * Math.sqrt(P.reduce((s, p) => s + (p - m) ** 2, 0) / P.length) / YD; };
  for (const dex of [2, 5, 8]) {
    const run = (su) => { const rnd = g.rng32(9 + dex), xs = []; let tot = 0; for (let k = 0; k < 600; k++) { const r = g.computeImpact(human(rnd), su, C[7], { ...env('fairway', dex) }, rnd), fl = fly(r); xs.push(fl.p.x); tot += -fl.p.z / YD; } return { w: width(xs), tot: tot / 600 }; };
    const ro = (su) => 1 + g.computeImpact({ bs: 1, ds: 1, thetaMouse: 0, sigma: 0, lateSign: 1, vImpact: 1, vPeak: 1, miss: 0 }, su, C[7], { ...env('fairway', dex), stock: true }, () => 0.5).complexity;
    S.dex = dex; const base = run(SU), cells = [];
    const dr = g.solveShape(7, -1), fd = g.solveShape(7, 1);
    for (const [n, su] of [['stock', SU], ['High 1', { ...SU, traj: 1 }], ['High 2', { ...SU, traj: 2 }], ['Low 1', { ...SU, traj: -1 }], ['Low 2', { ...SU, traj: -2 }], ['More spin', { ...SU, spinCtl: 1 }], ['Less spin', { ...SU, spinCtl: -1 }], ['draw', { ...SU, face: dr.face, stance: dr.stance }], ['Low 1 draw', { ...SU, face: dr.face, stance: dr.stance, traj: -1 }], ['High 1 draw', { ...SU, face: dr.face, stance: dr.stance, traj: 1 }], ['Low 1 fade', { ...SU, face: fd.face, stance: fd.stance, traj: -1 }]]) {
      const m = run(su); cells.push(`${n} ${f(ro(su), 2)}× → ±${f(m.w, 0)} (${f(m.w / base.w, 2)}×), ${f(m.tot, 0)}`);
    }
    out.push(`   Dex ${dex}: ${cells.join(' · ')}`);
  }
  S.dex = 5;
  // driver and wedge Low 2
  for (const [ci, n] of [[0, 'Driver'], [12, 'Sand Wedge']]) {
    const run = (su) => { const rnd = g.rng32(21), xs = []; for (let k = 0; k < 600; k++) { const r = g.computeImpact(human(rnd), su, C[ci], { ...env('fairway', 5), teed: ci === 0 }, rnd); xs.push(fly(r).p.x); } return width(xs); };
    const b = run(SU); out.push(`   ${n}, Dex 5: stock ±${f(b, 0)} · Low 2 ±${f(run({ ...SU, traj: -2 }), 0)} · High 2 ±${f(run({ ...SU, traj: 2 }), 0)}`);
  }
  // the solver still solves
  { let fails = 0, n = 0; for (const h of [-2, -1, 0, 1, 2]) for (let ci = 0; ci < 14; ci++) for (const sg of [-1, 1]) { S.height = h; n++; const v = g.solveShape(ci, sg); const r = g.computeImpact({ bs: 1, ds: 1, thetaMouse: 0, sigma: 0, lateSign: 1, vImpact: 1, vPeak: 1, miss: 0 }, { ...SU, face: v.face, stance: v.stance, traj: h }, C[ci], { ...env('fairway', 5), teed: ci === 0, stock: true }, () => 0.5); const fl = fly(r); if (Math.abs(fl.p.x / YD) > 2 || Math.abs(v.face) >= 10 || Math.abs(v.stance) >= 15) fails++; } S.height = 0; out.push(`   the draw / fade solver, fairway, every club and height: ${fails} of ${n} fail to come back within 2 yds`); }
  // ---- S4.1: the comparison club
  out.push('', 'S4.1 THE COMPARISON CLUB');
  const rows = () => [...document.querySelectorAll('#bagList .bag-row')].map((r) => r.querySelector('span').textContent);
  g.setClub(14);
  out.push(`   on the range: ${rows().length} rows, last "${rows().slice(-1)[0]}", canUseClub(14) ${g.canUseClub(14)}, selected ${C[S.club].name}`);
  g.enterHole(); await sleep(300);
  out.push(`   on a hole: ${rows().length} rows, last "${rows().slice(-1)[0]}", canUseClub(14) ${g.canUseClub(14)}, selected ${C[S.club].name}`);
  g.setClub(14); out.push(`   setClub(14) on a hole leaves ${C[S.club].name} selected`);
  { const seen = new Set(); for (let k = 0; k < 20; k++) { g.setClub(0, 1); seen.add(S.club); } out.push(`   [ ] cycling on a hole visits ${seen.size} clubs, the comparison club ${seen.has(14) ? 'INCLUDED' : 'not included'}`); }
  g.leaveHole(); await sleep(300);
  out.push(`   back on the range: ${rows().length} rows, canUseClub(14) ${g.canUseClub(14)}`);
  g.startRound(); await sleep(500);
  out.push(`   in a test round: round.on ${g.round.on}, ${rows().length} rows, canUseClub(14) ${g.canUseClub(14)}`);
  g.quitRound && g.quitRound(); await sleep(300);
  return out.join('\n');
})()
