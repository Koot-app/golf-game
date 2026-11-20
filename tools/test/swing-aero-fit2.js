// Swing audit fix S3.1: fit the flight's lift and drag to the tour table's carry, apex AND landing angle together
// (swing-aero-fit.js fitted carry and apex only, and left the long irons landing shallow). Plain Node, a copy of the
// game's airStep with no wind. Prints the current curves, the best fit, and the table row by row.
//   node tools/test/swing-aero-fit2.js
const MPH = 0.44704, D2R = Math.PI / 180, RPM2RAD = Math.PI / 30, YD = 0.9144;
const BALL_M = 0.04593, BALL_R = 0.021335, BALL_A = Math.PI * BALL_R * BALL_R, RHO = 1.225, GRAV = 9.81, TAU = 25;
// name, ball mph, launch, spin, apex yds, landing angle, carry yds
const ROWS = [['Driver', 167, 10.9, 2686, 32, 38, 275], ['3 wood', 158, 9.2, 3655, 30, 43, 243], ['5 wood', 152, 9.4, 4350, 31, 47, 230], ['Hybrid', 146, 10.2, 4437, 29, 47, 225], ['3 iron', 142, 10.4, 4630, 27, 46, 212], ['4 iron', 137, 11.0, 4836, 28, 48, 203],
  ['5 iron', 132, 12.1, 5361, 31, 49, 194], ['6 iron', 127, 14.1, 6231, 30, 50, 183], ['7 iron', 120, 16.3, 7097, 32, 50, 172], ['8 iron', 115, 18.1, 7998, 31, 50, 160], ['9 iron', 109, 20.4, 8647, 30, 51, 148], ['PW', 102, 24.2, 9304, 29, 52, 136],
  ['LPGA driver', 140, 13.2, 2611, 25, 37, 218], ['LPGA 7 iron', 104, 19.0, 6699, 26, 47, 141], ['LPGA PW', 86, 25.6, 8403, 23, 48, 107]];
function fly(bs, vla, rpm, cl, cd, dt = 1 / 120, tau = cl.tau || TAU) {
  let v = bs * MPH, vy = v * Math.sin(vla * D2R), vz = v * Math.cos(vla * D2R), y = 0, z = 0, apex = 0;
  for (let n = 0; n < 4000; n++) {
    const s = Math.hypot(vy, vz), S = Math.min(1.2, rpm * RPM2RAD * BALL_R / s), k = 0.5 * RHO * BALL_A * s / BALL_M, CD = cd(S, s), CL = cl(S);
    const ay = -GRAV - k * CD * vy + k * CL * vz, az = -k * CD * vz - k * CL * vy, py = vy, pz = vz;
    vy += ay * dt; vz += az * dt; rpm *= Math.exp(-dt / tau); y += vy * dt; z += vz * dt;
    if (y > apex) apex = y;
    if (y <= 0 && vy < 0) return { carry: z / YD, apex: apex / YD, land: Math.atan2(-py, pz) / D2R };
  }
  return { carry: 0, apex: 0, land: 0 };
}
// sideways drift in a 10 mph crosswind (yds), with the game's wind shear (×0.5 near the ground to ×1.25 high up)
function cross(bs, vla, rpm, m, mph = 10, dt = 1 / 120) {
  const tau = m.cl.tau || TAU, wx = mph * MPH;
  let v = bs * MPH, vx = 0, vy = v * Math.sin(vla * D2R), vz = v * Math.cos(vla * D2R), x = 0, y = 0;
  for (let n = 0; n < 4000; n++) {
    const sh = Math.min(1.25, Math.max(0.5, Math.pow(Math.max(y, 0.5) / 15, 0.18))), rx = vx - wx * sh, s = Math.hypot(rx, vy, vz);
    const S = Math.min(1.2, rpm * RPM2RAD * BALL_R / s), k = 0.5 * RHO * BALL_A * s / BALL_M, CD = m.cd(S, s), CL = m.cl(S);
    vx += -k * CD * rx * dt; vy += (-GRAV - k * CD * vy + k * CL * vz) * dt; vz += (-k * CD * vz - k * CL * vy) * dt;
    rpm *= Math.exp(-dt / tau); x += vx * dt; y += vy * dt;
    if (y <= 0 && vy < 0) return Math.abs(x) / YD;
  }
  return 0;
}
// rule of thumb (approximate): a 10 mph crosswind moves a driver 15–20 yds and a mid iron 8–10
const WIND = [['driver', 167, 10.9, 2686, 17.5], ['7 iron', 120, 16.3, 7097, 10]];
const GAME = { cl: (S) => Math.min(0.305, 1.5 * S + 0.31 * S * S), cd: (S, s) => Math.min(0.55, 0.19 + 0.149 * S + 0.169 * Math.max(0, 1 - s / 65)) };
const mk = (p) => { const cl = (S) => p.A * (1 - Math.exp(-Math.pow(S / p.S0, p.q || 1))) + (p.B || 0) * S; cl.tau = p.tau; return { cl, cd: (S, s) => Math.min(0.55, p.d0 + p.d1 * S + p.d3 * S * S + p.d2 * Math.max(0, 1 - s / p.vRef) ** p.e2) }; };
const score = (m) => {
  let c2 = 0, a2 = 0, l2 = 0, wc = 0, wa = 0, wl = 0;
  for (const [, bs, vla, sp, apex, land, carry] of ROWS) {
    const x = fly(bs, vla, sp, m.cl, m.cd), c = x.carry / carry - 1, a = x.apex / apex - 1, l = x.land - land, w = sp < 3000 ? 3 : 1;     // (the drivers count triple)
    c2 += w * c * c; a2 += a * a; l2 += l * l; wc = Math.max(wc, Math.abs(c)); wa = Math.max(wa, Math.abs(a)); wl = Math.max(wl, Math.abs(l));
  }
  const n = ROWS.length + 4;
  let x2 = 0; const xs = WIND.map(([, bs, vla, sp, want]) => { const d = cross(bs, vla, sp, m); x2 += (d / want - 1) ** 2; return d; });
  return { c: Math.sqrt(c2 / n) * 100, a: Math.sqrt(a2 / n) * 100, l: Math.sqrt(l2 / n), wc: wc * 100, wa: wa * 100, wl, x: Math.sqrt(x2 / WIND.length) * 100, xs };
};
// cost: carry matters most (it is what the bag shows), then landing angle (stopping), then apex (what the eye sees), then
// the crosswind drift against the rule of thumb
const cost = (s) => s.c * 5 + s.wc * 1.5 + s.a + s.l * 3 + s.wl + s.x * 0.5;
const show = (name, m) => {
  const s = score(m);
  console.log(`\n${name}\n  carry ${s.c.toFixed(1)}% typical / ${s.wc.toFixed(1)}% worst · apex ${s.a.toFixed(1)}% / ${s.wa.toFixed(1)}% · landing ${s.l.toFixed(1)}° / ${s.wl.toFixed(1)}° · 10 mph crosswind: driver ${s.xs[0].toFixed(1)} yds (rule 15–20), 7 iron ${s.xs[1].toFixed(1)} (8–10)`);
  console.log('  row            carry (tour)   apex (tour)   landing (tour)');
  for (const [n, bs, vla, sp, apex, land, carry] of ROWS) { const x = fly(bs, vla, sp, m.cl, m.cd); console.log(`  ${n.padEnd(13)}  ${x.carry.toFixed(0).padStart(3)} (${carry})      ${x.apex.toFixed(0).padStart(2)} (${apex})       ${x.land.toFixed(0)}° (${land}°)`); }
};
show('THE GAME TODAY: lift = min(0.305, 1.5·S + 0.31·S²), drag = 0.19 + 0.149·S + 0.169·max(0, 1 − speed/65)', GAME);
// coordinate descent from several starts
const LIM = { A: [0.15, 0.7], S0: [0.03, 0.6], d0: [0.10, 0.3], d1: [-0.3, 0.8], d3: [0, 3], d2: [0, 1.2], vRef: [30, 90], e2: [1, 4], tau: [8, 40], B: [-0.6, 0.6], q: [0.6, 2] };
let best = null;
for (const st of [{ A: 0.356, S0: 0.157, d0: 0.179, d1: 0.175, d3: 0, d2: 0.183, vRef: 73, e2: 1, tau: 25, B: 0, q: 1 }, { A: 0.36, S0: 0.16, d0: 0.17, d1: 0.15, d3: 0, d2: 0.5, vRef: 60, e2: 2, tau: 25, B: 0, q: 1 }, { A: 0.38, S0: 0.18, d0: 0.17, d1: 0.15, d3: 0, d2: 0.8, vRef: 70, e2: 3, tau: 20, B: 0, q: 1 },
  { A: 0.34, S0: 0.15, d0: 0.18, d1: 0.2, d3: 0, d2: 0.3, vRef: 50, e2: 1.5, tau: 15, B: 0, q: 1 }, { A: 0.40, S0: 0.2, d0: 0.16, d1: 0.1, d3: 0.3, d2: 0.6, vRef: 80, e2: 2.5, tau: 30, B: 0, q: 1 },
  { A: 0.36, S0: 0.20, d0: 0.184, d1: 0.116, d3: 0, d2: 0.878, vRef: 70, e2: 3, tau: 25.5, B: 0, q: 1 }, { A: 0.36, S0: 0.2, d0: 0.18, d1: 0.12, d3: 0, d2: 1.1, vRef: 85, e2: 4, tau: 25, B: 0, q: 1 }, { A: 0.37, S0: 0.21, d0: 0.17, d1: 0.15, d3: 0, d2: 0.6, vRef: 60, e2: 2, tau: 22, B: 0, q: 1 }]) {
  const p = { ...st }; let c = cost(score(mk(p)));
  const steps = { A: 0.02, S0: 0.02, d0: 0.01, d1: 0.03, d3: 0.1, d2: 0.05, vRef: 4, e2: 0.25, tau: 2, B: 0.03, q: 0.1 };
  for (let round = 0; round < 80; round++) {
    let moved = false;
    for (const k of Object.keys(steps)) for (const sg of [1, -1]) {
      const q = { ...p, [k]: p[k] + sg * steps[k] };
      if (q[k] < LIM[k][0] || q[k] > LIM[k][1]) continue;
      const cq = cost(score(mk(q)));
      if (cq < c - 1e-6) { Object.assign(p, q); c = cq; moved = true; }
    }
    if (!moved) { let any = false; for (const k of Object.keys(steps)) if (steps[k] > (k === 'vRef' || k === 'tau' ? 0.3 : 0.0008)) { steps[k] /= 2; any = true; } if (!any) break; }
  }
  if (!best || c < best.c) best = { p, c };
}
const P = best.p;
show(`THE FIT: lift = ${P.A.toFixed(3)}·(1 − exp(−S / ${P.S0.toFixed(3)})), drag = ${P.d0.toFixed(3)} + ${P.d1.toFixed(3)}·S + ${P.d3.toFixed(3)}·S² + ${P.d2.toFixed(3)}·max(0, 1 − speed / ${P.vRef.toFixed(1)})^${P.e2.toFixed(2)}, spin decay ${P.tau.toFixed(1)} s, + ${P.B.toFixed(3)}·S lift`, mk(P));
console.log(`\nAERO = { lA: ${P.A.toFixed(3)}, lS0: ${P.S0.toFixed(3)}, d0: ${P.d0.toFixed(3)}, d1: ${P.d1.toFixed(3)}, d3: ${P.d3.toFixed(3)}, d2: ${P.d2.toFixed(3)}, vRef: ${P.vRef.toFixed(1)}, e2: ${P.e2.toFixed(2)}, spinTau: ${P.tau.toFixed(1)}, lB: ${P.B.toFixed(3)}, lQ: ${P.q.toFixed(3)} }`);
