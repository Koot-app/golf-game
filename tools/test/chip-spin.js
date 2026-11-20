// Chip side spin (user request, 2026-11-20): a hand-swung draw or fade path on a chip. The shape's roll-out is scaled
// down for chips (TUNE.chipRelease) and the tilted spin kicks the ball on its first landing (chipKickMs, chipKickRpm):
// cut spin (out-to-in, a fade axis) to the right and checking, hook spin (in-to-out) to the left and releasing.
// Flat Stimp 11.5 green; side in yds (+ right), and how far the ball moved sideways after landing.
//   node tools/test/probe.js "http://127.0.0.1:8090/?nohome" - @tools/test/chip-spin.js 0 chip-spin
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 50 && !window.__golf; i++) await sleep(200);
  const g = window.__golf, YD = 0.9144, C = g.CLUBS, T = g.CHIP_TYPES, TU = g.TUNE, out = [];
  const f = (v, n = 1) => (v >= 0 ? '+' : '') + v.toFixed(n);
  const view = { decel: g.rollDecel(11.5), stimp: 11.5, hole: { x: 0, z: -1e5 }, h: () => 0, grad: () => ({ x: 0, z: 0 }), surfAt: () => 'green', drag: () => 1 };
  const su = (k, ci) => { const t = T[k]; return { face: t.face, ballPos: t.ballPos, stance: t.stance, traj: t.heightFor ? t.heightFor(C[ci]) : t.height, spinCtl: 0, align: { face: t.face, stance: t.stance, ballPos: t.ballPos }, flop: !!t.flop }; };
  const chip = (ci, type, bs, th, lie = 'fairway') => {
    const r = g.computeImpact({ bs, ds: 1, thetaMouse: th, sigma: 0, lateSign: 1, vImpact: 1, vPeak: 1, miss: 0 }, su(type, ci), C[ci], { lie, slope: 'flat', power: 5, dex: 5, composure: 5, badStreak: 0, teed: false, stock: true }, () => 0.5);
    const fl = g.runChip(view, { ballSpeed: r.ballSpeed, vla: r.vla, dir: r.hla, spin: r.spin, axis: r.axis, release: r.release });
    return { r, total: -fl.p.z / YD, side: fl.p.x / YD, kick: (fl.p.x - (fl.land ? fl.land.x : 0)) / YD };
  };
  out.push(`CHIP SIDE SPIN (TUNE.chipRelease ${TU.chipRelease}, chipKickMs ${TU.chipKickMs}, chipKickRpm ${TU.chipKickRpm}); mouse path: − out-to-in (cut), + in-to-out (hook)`,
    '   path: total yds (× the straight chip) · stops yds sideways · of which after landing (the kick) · difficulty');
  for (const [ci, type, bs, lie] of [[12, 'stock', 0.3], [12, 'high', 0.38], [13, 'stock', 0.32], [10, 'low', 0.25], [7, 'low', 0.2], [12, 'stock', 0.36, 'light']]) {
    const base = chip(ci, type, bs, 0, lie);
    out.push(`   ${C[ci].name} ${type} ${bs * 100}%${lie ? ` from ${lie} rough` : ''} (straight: ${base.total.toFixed(1)} yds, ${Math.round(base.r.spin)} rpm)`);
    out.push('      ' + [-10, -5, 5, 10].map((th) => { const c = chip(ci, type, bs, th, lie); return `${th > 0 ? '+' : ''}${th}°: ${c.total.toFixed(1)} (×${(c.total / base.total).toFixed(2)}) · ${f(c.side, 2)} · kick ${f(c.kick, 2)} · cx ${c.r.complexity.toFixed(2)}`; }).join('   '));
  }
  // before: the full-swing release on a chip, and no kick
  const keep = [TU.chipRelease, TU.chipKickMs]; TU.chipRelease = 1; TU.chipKickMs = 0;
  const b0 = chip(10, 'low', 0.25, 0), b5 = chip(10, 'low', 0.25, 5), s10 = chip(12, 'stock', 0.3, 10), s0 = chip(12, 'stock', 0.3, 0);
  [TU.chipRelease, TU.chipKickMs] = keep;
  out.push('', `   before (full release, no kick): PW low runner +5° ran ×${(b5.total / b0.total).toFixed(2)} (${b0.total.toFixed(1)} → ${b5.total.toFixed(1)}); SW stock +10° ×${(s10.total / s0.total).toFixed(2)}, stopping ${f(s10.side, 2)} (no hook back)`);
  return out.join('\n');
})()
