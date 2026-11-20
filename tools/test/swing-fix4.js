// Swing audit fixes S2.4 (work acts once) and S3.1 (the lift and drag refit, with the base bag's speeds re-tuned to keep
// their carries): the re-measures. The full tables are swing-bag.js (S4), swing-flight.js (S3) and swing-risk.js (S6).
//   node tools/test/probe.js "http://127.0.0.1:8090/?nohome" - @tools/test/swing-fix4.js 0 swing-fix4
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 50 && !window.__golf; i++) await sleep(200);
  const g = window.__golf, YD = 0.9144, out = [], C = g.CLUBS, M = g.CLUB_MODELS, S = g.state;
  const f = (v, n = 1) => (v === null || v === undefined || Number.isNaN(v) ? '—' : v.toFixed(n));
  Object.assign(S, { lie: 'fairway', slope: 'flat', power: 5, dex: 5, composure: 5, badStreak: 0, height: 0, spinCtl: 0, face: 0, stance: 0, ballPos: 0 });
  const SU = { face: 0, ballPos: 0, stance: 0, traj: 0, spinCtl: 0 };
  const apply = (i, id) => { const c = C[i]; for (const k of Object.keys(c)) if (!(k in g.BASE_CLUBS[i])) delete c[k]; Object.assign(c, g.BASE_CLUBS[i]); if (id) Object.assign(c, g.modelMods(M[id], i), { model: id }); };
  const env = (dex, ci, stock) => ({ lie: 'fairway', slope: 'flat', power: 5, dex, composure: 5, badStreak: 0, teed: ci === 0, stock });
  const fly = (r, ci, wind) => { const fl = g.createFlight({ ballSpeed: r.ballSpeed, vla: r.vla, dir: r.hla, spin: r.spin, axis: r.axis, release: r.release }, wind || { x: 0, z: 0 }, ci === 0 ? 0.04 : 0); for (let n = 0; fl.phase !== 'stopped' && n < 30000; n++) g.stepFlight(fl, 1 / 120); return fl; };
  const stock = (ci, sw = {}, wind) => { const r = g.computeImpact({ bs: 1, ds: 1, thetaMouse: 0, sigma: 0, lateSign: 1, vImpact: 1, vPeak: 1, miss: 0, ...sw }, SU, C[ci], env(5, ci, true), () => 0.5); return { r, fl: fly(r, ci, wind) }; };
  // ---- S2.4: a 5° mouse path
  out.push('S2.4 A 5° IN-TO-OUT MOUSE PATH WITH A SQUARE FACE: the club path, the spin axis, and where it finishes (yds left)');
  const rows = [[7, null, 'base 7 iron (work 1.0)'], [14, null, 'comparison GI 7 iron (work 0.45)'], [7, 'i-qimax', 'Qi Max 7 iron (work 0.45)'], [7, 'i-wmb', 'Staff Model Blade 7 iron (work 1.15)'], [0, null, 'base driver (work 0.85)'], [3, null, 'base 3 hybrid (work 0.70)'], [12, null, 'base sand wedge (work 0.85)']];
  for (const [ci, id, name] of rows) { apply(ci, id); const s = stock(ci, { thetaMouse: 5 }); out.push(`   ${name.padEnd(38)} path ${f(s.r.path, 2)}°, axis ${f(s.r.axis, 1)}°, finishes ${f(-s.fl.p.x / YD, 1)} yds left`); apply(ci, null); }
  // ---- base bag dispersion (the minimap's assumed swing), against S6's before
  const SP = g.SPREAD, spread = (ci, dex) => { const rnd = g.rng32(1000 + ci * 31), xs = []; for (let k = 0; k < 400; k++) { const r = g.computeImpact({ bs: 1 + SP.backswing * (rnd() + rnd() - 1), ds: 1, thetaMouse: SP.mouseDeg * 2 * (rnd() + rnd() - 1), sigma: SP.wobble * rnd(), lateSign: rnd() < 0.5 ? 1 : -1, vImpact: 1, vPeak: 1, miss: 0 }, SU, C[ci], env(dex, ci, false), rnd); xs.push(fly(r, ci).p.x / YD); } const m = xs.reduce((a, b) => a + b, 0) / xs.length; return 2 * Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length); };
  out.push('', '   the base bag\'s 2σ width, the minimap\'s assumed swing (S6 before both fixes, in brackets):');
  for (const [ci, n, b2, b5] of [[0, 'Driver', 75.4, 50.4], [3, '3 Hybrid', 32.0, 21.5], [7, '7 Iron', 17.0, 11.7], [10, 'PW', 9.1, 6.2], [12, 'Sand Wedge', 5.4, 3.6]]) out.push(`      ${n.padEnd(11)} Dex 2 ±${f(spread(ci, 2), 1)} (±${b2}) · Dex 5 ±${f(spread(ci, 5), 1)} (±${b5})`);
  // ---- S3.1: the bag's height, landing and wind
  out.push('', 'S3.1 THE BASE BAG UNDER THE NEW FLIGHT (stock): club mph · carry / total · apex · landing angle · 10 mph head / tail / cross (yds)');
  for (let ci = 0; ci < 14; ci++) {
    const s = stock(ci), h = stock(ci, {}, g.windVector(10, 0)), t = stock(ci, {}, g.windVector(10, 180)), x = stock(ci, {}, g.windVector(10, 90));
    let land = null; { const r = s.r, fl = g.createFlight({ ballSpeed: r.ballSpeed, vla: r.vla, dir: r.hla, spin: r.spin, axis: r.axis, release: r.release }, { x: 0, z: 0 }, ci === 0 ? 0.04 : 0); for (let n = 0; fl.phase !== 'stopped' && n < 30000; n++) { const vy = fl.v.y, vh = Math.hypot(fl.v.x, fl.v.z), had = fl.carry !== null; g.stepFlight(fl, 1 / 120); if (!had && fl.carry !== null) land = Math.atan2(-vy, vh) * 180 / Math.PI; } }
    out.push(`   ${C[ci].name.padEnd(15)} ${f(s.r.clubSpeed, 1)} · ${f(s.fl.carry / YD, 0)} / ${f(-s.fl.p.z / YD, 0)} · ${f(s.fl.apex / YD, 0)} · ${f(land, 0)}° · ${f((h.fl.carry - s.fl.carry) / YD, 0)} / +${f((t.fl.carry - s.fl.carry) / YD, 0)} / ${f(Math.abs(x.fl.p.x - s.fl.p.x) / YD, 1)}`);
  }
  return out.join('\n');
})()
