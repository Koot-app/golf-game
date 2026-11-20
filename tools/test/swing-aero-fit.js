// Swing audit S3: why the long clubs fly too high, and whether a different lift curve fixes it. A copy of the game's
// air physics (airStep, no wind) in plain Node, checked against the game's own carries, then run with other lift curves
// over the 15 rows of the tour table.
//   node tools/test/swing-aero-fit.js
const MPH = 0.44704, D2R = Math.PI / 180, RPM2RAD = Math.PI / 30, YD = 0.9144;
const BALL_M = 0.04593, BALL_R = 0.021335, BALL_A = Math.PI * BALL_R * BALL_R, RHO = 1.225, GRAV = 9.81;
const AERO = { d0: 0.19, d1: 0.149, d2: 0.169, vRef: 65, l1: 1.5, l2: 0.31, clMax: 0.305, spinTau: 25 };
const ROWS = [['Driver', 167, 10.9, 2686, 32, 38, 275], ['3 wood', 158, 9.2, 3655, 30, 43, 243], ['5 wood', 152, 9.4, 4350, 31, 47, 230], ['Hybrid', 146, 10.2, 4437, 29, 47, 225], ['3 iron', 142, 10.4, 4630, 27, 46, 212], ['4 iron', 137, 11.0, 4836, 28, 48, 203],
  ['5 iron', 132, 12.1, 5361, 31, 49, 194], ['6 iron', 127, 14.1, 6231, 30, 50, 183], ['7 iron', 120, 16.3, 7097, 32, 50, 172], ['8 iron', 115, 18.1, 7998, 31, 50, 160], ['9 iron', 109, 20.4, 8647, 30, 51, 148], ['PW', 102, 24.2, 9304, 29, 52, 136],
  ['LPGA driver', 140, 13.2, 2611, 25, 37, 218], ['LPGA 7 iron', 104, 19.0, 6699, 26, 47, 141], ['LPGA PW', 86, 25.6, 8403, 23, 48, 107]];
// carry, apex (yds) and landing angle for a straight shot. cl(S) and cd(S, s) are the lift and drag curves.
function fly(bs, vla, rpm, cl, cd, dt = 1 / 120) {
  let v = bs * MPH, vy = v * Math.sin(vla * D2R), vz = v * Math.cos(vla * D2R), y = 0, z = 0, apex = 0, t = 0;
  for (;;) {
    const s = Math.hypot(vy, vz), S = Math.min(1.2, rpm * RPM2RAD * BALL_R / s), k = 0.5 * RHO * BALL_A * s / BALL_M, CD = cd(S, s), CL = cl(S);
    const ay = -GRAV - k * CD * vy + k * CL * vz, az = -k * CD * vz - k * CL * vy, py = vy, pz = vz;
    vy += ay * dt; vz += az * dt; rpm *= Math.exp(-dt / AERO.spinTau); y += vy * dt; z += vz * dt; t += dt;
    if (y > apex) apex = y;
    if (y <= 0 && vy < 0) return { carry: z / YD, apex: apex / YD, land: Math.atan2(-py, pz) / D2R, t };
  }
}
const cdGame = (S, s) => Math.min(0.55, AERO.d0 + AERO.d1 * S + AERO.d2 * Math.max(0, 1 - s / AERO.vRef));
const clGame = (S) => Math.min(AERO.clMax, AERO.l1 * S + AERO.l2 * S * S);
const score = (cl, cd) => { let ec = 0, ea = 0, worstC = 0, worstA = 0; for (const [, bs, vla, sp, apex, , carry] of ROWS) { const x = fly(bs, vla, sp, cl, cd), c = x.carry / carry - 1, a = x.apex / apex - 1; ec += c * c; ea += a * a; worstC = Math.max(worstC, Math.abs(c)); worstA = Math.max(worstA, Math.abs(a)); } return { rmsC: Math.sqrt(ec / ROWS.length) * 100, rmsA: Math.sqrt(ea / ROWS.length) * 100, worstC: worstC * 100, worstA: worstA * 100 }; };
const show = (name, cl, cd) => {
  const s = score(cl, cd);
  console.log(`\n${name}: carry error ${s.rmsC.toFixed(1)}% (typical), ${s.worstC.toFixed(1)}% (worst) · apex error ${s.rmsA.toFixed(1)}% (typical), ${s.worstA.toFixed(1)}% (worst)`);
  console.log('   row            lift coeff.   carry (tour)    apex (tour)   landing (tour)');
  for (const [n, bs, vla, sp, apex, land, carry] of ROWS) { const x = fly(bs, vla, sp, cl, cd), S = sp * RPM2RAD * BALL_R / (bs * MPH); console.log(`   ${n.padEnd(13)}  ${cl(S).toFixed(3)}        ${x.carry.toFixed(0).padStart(3)} (${carry})       ${x.apex.toFixed(0).padStart(2)} (${apex})       ${x.land.toFixed(0)}° (${land}°)`); }
};
show('THE GAME\'S CURVES  (lift = min(0.305, 1.5·S + 0.31·S²), S = spin × radius / speed)', clGame, cdGame);
// ---- a concave lift curve: lift = A·(1 − exp(−S / S0)). Search A, S0 and the three drag numbers on a coarse grid.
let best = null;
for (let A = 0.26; A <= 0.42; A += 0.01) for (let S0 = 0.06; S0 <= 0.30; S0 += 0.01) for (let d0 = 0.17; d0 <= 0.25; d0 += 0.01) for (let d1 = 0.0; d1 <= 0.30; d1 += 0.05) {
  const cl = (S) => A * (1 - Math.exp(-S / S0)), cd = (S, s) => Math.min(0.55, d0 + d1 * S + AERO.d2 * Math.max(0, 1 - s / AERO.vRef));
  const s = score(cl, cd), cost = s.rmsC * 3 + s.rmsA;
  if (!best || cost < best.cost) best = { cost, A, S0, d0, d1, s };
}
show(`A CONCAVE LIFT CURVE  (lift = ${best.A.toFixed(2)}·(1 − exp(−S / ${best.S0.toFixed(2)})), drag = ${best.d0.toFixed(2)} + ${best.d1.toFixed(2)}·S + the same low-speed term; the best of a coarse search)`,
  (S) => best.A * (1 - Math.exp(-S / best.S0)), (S, s) => Math.min(0.55, best.d0 + best.d1 * S + AERO.d2 * Math.max(0, 1 - s / AERO.vRef)));
// ---- the same lift shape, now letting the low-speed drag term move too (d2 and the speed it fades out at), refined by
// stepping one number at a time from several starting points
const mk = (p) => [(S) => p.A * (1 - Math.exp(-S / p.S0)), (S, s) => Math.min(0.55, p.d0 + p.d1 * S + p.d2 * Math.max(0, 1 - s / p.vRef))];
const costOf = (p) => { const s = score(...mk(p)); return s.rmsC * 3 + s.rmsA + s.worstC; };
let top = null;
for (const start of [{ A: best.A, S0: best.S0, d0: best.d0, d1: best.d1, d2: 0.169, vRef: 65 }, { A: 0.36, S0: 0.2, d0: 0.17, d1: 0.15, d2: 0.3, vRef: 80 }, { A: 0.32, S0: 0.14, d0: 0.15, d1: 0.2, d2: 0.4, vRef: 90 }, { A: 0.4, S0: 0.25, d0: 0.19, d1: 0.05, d2: 0.2, vRef: 75 }]) {
  const p = { ...start }; let c = costOf(p);
  const steps = { A: 0.02, S0: 0.02, d0: 0.01, d1: 0.03, d2: 0.04, vRef: 5 };
  for (let round = 0; round < 60; round++) {
    let moved = false;
    for (const k of Object.keys(steps)) for (const sg of [1, -1]) {
      const q = { ...p, [k]: p[k] + sg * steps[k] };
      if (q.A <= 0.1 || q.S0 <= 0.02 || q.d0 <= 0.05 || q.d1 < 0 || q.d2 < 0 || q.vRef < 40) continue;
      const cq = costOf(q);
      if (cq < c - 1e-6) { Object.assign(p, q); c = cq; moved = true; }
    }
    if (!moved) { let any = false; for (const k of Object.keys(steps)) if (steps[k] > (k === 'vRef' ? 0.6 : 0.0012)) { steps[k] /= 2; any = true; } if (!any) break; }
  }
  if (!top || c < top.c) top = { p, c };
}
const P = top.p;
show(`THE SAME LIFT SHAPE WITH THE DRAG RE-FITTED  (lift = ${P.A.toFixed(3)}·(1 − exp(−S / ${P.S0.toFixed(3)})), drag = ${P.d0.toFixed(3)} + ${P.d1.toFixed(3)}·S + ${P.d2.toFixed(3)}·max(0, 1 − speed / ${P.vRef.toFixed(1)}))`, ...mk(P));
