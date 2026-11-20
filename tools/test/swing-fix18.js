// Swing audit fix S4.4 (Power 1-2 hit like a beginner; Power 5 and up unchanged): the re-measures, with the old line
// (0.90 + 0.025 a point) alongside.
//   node tools/test/probe.js "http://127.0.0.1:8090/?nohome" - @tools/test/swing-fix18.js 0 swing-fix18
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 50 && !window.__golf; i++) await sleep(200);
  const g = window.__golf, YD = 0.9144, out = [], C = g.CLUBS;
  const f = (v, n = 0) => (v === null || v === undefined || Number.isNaN(v) ? '—' : v.toFixed(n));
  const SU = { face: 0, ballPos: 0, stance: 0, traj: 0, spinCtl: 0 };
  const SW0 = { bs: 1, ds: 1, thetaMouse: 0, sigma: 0, lateSign: 1, vImpact: 1, vPeak: 1, miss: 0 };
  // stock shot at Power p; the old curve is emulated by scaling club speed and spin by old(p) / new(p)
  const oldMult = (p) => (p <= 5 ? 0.90 + (p - 1) * 0.025 : 1.0 + (p - 5) * 0.02);
  const shot = (ci, p, old) => {
    const c = C[ci], teed = !!c.tee, k = old ? oldMult(p) / g.powerMult(p) : 1, club = { ...c, speed: c.speed * k, spin: c.spin * k };
    const r = g.computeImpact(SW0, SU, club, { lie: 'fairway', slope: 'flat', power: p, dex: 5, composure: 5, badStreak: 0, teed, stock: true }, () => 0.5);
    const fl = g.createFlight({ ballSpeed: r.ballSpeed, vla: r.vla, dir: r.hla, spin: r.spin, axis: r.axis, release: r.release }, { x: 0, z: 0 }, teed ? 0.04 : 0);
    for (let n = 0; fl.phase !== 'stopped' && n < 30000; n++) g.stepFlight(fl, 1 / 120);
    return { r, c: fl.carry / YD, t: -fl.p.z / YD };
  };
  out.push('S4.4 POWER 1-10 (stock shots, carry / total; driver club mph): before → after',
    '   (a typical male amateur: about 93 mph and 215-220 total with the driver; the LPGA average 94 mph and 218 carry)');
  for (const p of [1, 2, 3, 4, 5, 6, 8, 10]) {
    const cells = [[0, 'Driver'], [4, '4 Iron'], [7, '7 Iron'], [10, 'PW'], [12, 'SW']].map(([ci, n]) => { const b = shot(ci, p, true), a = shot(ci, p, false); return `${n} ${f(b.c)}/${f(b.t)} → ${f(a.c)}/${f(a.t)}`; });
    const d0 = shot(0, p, true), d1 = shot(0, p, false);
    out.push(`   Power ${String(p).padStart(2)} (×${f(g.powerMult(p), 3)}, driver ${f(d0.r.clubSpeed)} → ${f(d1.r.clubSpeed)} mph): ${cells.join(' · ')}`);
  }
  // the gaps at Power 1: no two clubs too close
  const carries = C.slice(0, 14).map((c, i) => shot(i, 1, false).c);
  const gaps = carries.slice(1).map((v, i) => carries[i] - v);
  out.push('', `   Power 1, the bag's carries: ${carries.map((v) => f(v)).join(' · ')} · the narrowest gap ${f(Math.min(...gaps))}, the widest ${f(Math.max(...gaps))}`);
  return out.join('\n');
})()
