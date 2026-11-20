// Swing audit fix S3.3 (a curving ball's extra lift stops at a 25° tilt): the re-measures. Each table is run with the
// cap off (TUNE.sideLiftMaxDeg 90 = the old 1 / max(0.35, cos tilt), near enough) and on.
//   node tools/test/probe.js "http://127.0.0.1:8090/?nohome" - @tools/test/swing-fix15.js 0 swing-fix15
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 50 && !window.__golf; i++) await sleep(200);
  const g = window.__golf, YD = 0.9144, out = [], C = g.CLUBS, T = g.TUNE, CAP = T.sideLiftMaxDeg;
  const f = (v, n = 1) => (v === null || v === undefined || Number.isNaN(v) ? '—' : v.toFixed(n));
  const padE = (s, n) => String(s).padEnd(n);
  const SU = { face: 0, ballPos: 0, stance: 0, traj: 0, spinCtl: 0 };
  const SW0 = { bs: 1, ds: 1, thetaMouse: 0, sigma: 0, lateSign: 1, vImpact: 1, vPeak: 1, miss: 0 };
  const env = (o = {}) => ({ lie: 'fairway', slope: 'flat', power: 5, dex: 5, composure: 5, badStreak: 0, teed: false, ...o });
  const fly = (L, teed) => { const fl = g.createFlight(L, { x: 0, z: 0 }, teed ? 0.04 : 0); for (let n = 0; fl.phase !== 'stopped' && n < 30000; n++) g.stepFlight(fl, 1 / 120); return { carry: fl.carry / YD, landSide: fl.land ? fl.land.x / YD : 0, side: fl.p.x / YD, total: -fl.p.z / YD }; };
  const withCap = (deg, fn) => { T.sideLiftMaxDeg = deg; try { return fn(); } finally { T.sideLiftMaxDeg = CAP; } };
  // ---- 1. the finding's table: a fixed launch with a tilted axis
  out.push('S3.3 A TILTED SPIN AXIS (carry · yds sideways at landing; "rule" = 0.7 yds per degree per 100 yds of carry): before → after');
  for (const [name, L, teed] of [['Driver (167 mph, 10.9°, 2,686 rpm)', { ballSpeed: 167, vla: 10.9, spin: 2686 }, true], ['7 Iron (120 mph, 16.3°, 7,097 rpm)', { ballSpeed: 120, vla: 16.3, spin: 7097 }, false]]) {
    out.push(`   ${name}`);
    for (const tilt of [5, 10, 20, 25, 30, 40, 60]) {
      const b = withCap(90, () => fly({ ...L, dir: 0, axis: tilt }, teed)), a = fly({ ...L, dir: 0, axis: tilt }, teed);
      out.push(`      ${String(tilt).padStart(2)}°: ${f(b.carry, 0)}, ${f(b.landSide)} → ${f(a.carry, 0)}, ${f(a.landSide)} · rule ${f(0.7 * tilt * a.carry / 100)}`);
    }
  }
  // ---- 2. the set-up shapes sit below the cap
  out.push('', '2. THE SET-UP DRAWS AND FADES: their spin-axis tilt, and the finish (side, total) before → after');
  const S = g.state; S.lie = 'fairway'; S.height = 0; S.spinCtl = 0;
  let maxTilt = 0;
  for (const dex of [1, 5, 10]) {
    S.dex = dex; const cells = [];
    for (const ci of [0, 1, 4, 7, 10]) for (const sg of [-1, 1]) {
      const v = g.solveShape(ci, sg), su = { ...SU, face: v.face, stance: v.stance }, teed = !!C[ci].tee;
      const r = g.computeImpact(SW0, su, C[ci], env({ dex, teed, stock: true }), () => 0.5); maxTilt = Math.max(maxTilt, Math.abs(r.axis));
      const L = { ballSpeed: r.ballSpeed, vla: r.vla, dir: r.hla, spin: r.spin, axis: r.axis, release: r.release };
      const b = withCap(90, () => fly(L, teed)), a = fly(L, teed);
      if (sg === 1 || ci === 0) cells.push(`${C[ci].name} ${sg < 0 ? 'draw' : 'fade'} ${f(Math.abs(r.axis))}° ${f(b.side)}/${f(b.total, 0)} → ${f(a.side)}/${f(a.total, 0)}`);
    }
    out.push(`   Dex ${String(dex).padStart(2)}: ${cells.join(' · ')}`);
  }
  out.push(`   the largest tilt of any solved shape here: ${f(maxTilt)}° (the cap is ${CAP}°)`);
  S.dex = 5;
  // ---- 3. misses
  out.push('', '3. ORDINARY SWINGS, 1,000 each (the default hand): 2σ wide · share with a tilt past 25° · share finishing 40+ yds offline (driver; 25+ for the 4 iron) · the farthest offline: before → after');
  for (const [ci, far] of [[0, 40], [4, 25]]) for (const dex of [1, 3, 5]) {
    const run = () => { const rnd = g.rng32(5151 + ci * 7 + dex), teed = !!C[ci].tee, P = []; let big = 0; for (let k = 0; k < 1000; k++) { const r = g.computeImpact(g.spreadSwing(rnd), SU, C[ci], env({ dex, teed }), rnd); if (Math.abs(r.axis) > 25) big++; P.push(fly({ ballSpeed: r.ballSpeed, vla: r.vla, dir: r.hla, spin: r.spin, axis: r.axis, release: r.release }, teed).side); } const m = P.reduce((a, b) => a + b, 0) / P.length; return { w: 2 * Math.sqrt(P.reduce((a, b) => a + (b - m) ** 2, 0) / P.length), big: big / 10, far: P.filter((x) => Math.abs(x) >= far).length / 10, max: Math.max(...P.map(Math.abs)) }; };
    const b = withCap(90, run), a = run();
    out.push(`   ${padE(C[ci].name, 7)} Dex ${dex}: ${f(b.w)} · ${f(b.big)}% · ${f(b.far)}% · ${f(b.max, 0)} → ${f(a.w)} · ${f(a.big)}% · ${f(a.far)}% · ${f(a.max, 0)}`);
  }
  return out.join('\n');
})()
