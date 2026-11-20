// Swing audit fixes S1.3 (calibration limits), S6.2 (the lie read is centred on the lie's real average), S9.1 (the
// landing area assumes a real hand, and learns the player's own) and S8.3 (the cup's capture speed): the re-measures.
// Run in a fresh profile name, so no swing history is saved yet.
//   node tools/test/probe.js "http://127.0.0.1:8090/?nohome" - @tools/test/swing-fix7.js 0 swing-fix7-<new name>
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 50 && !window.__golf; i++) await sleep(200);
  const g = window.__golf, YD = 0.9144, FT = 0.3048, out = [], C = g.CLUBS, S = g.state;
  const f = (v, n = 0) => (v === null || v === undefined || Number.isNaN(v) ? '—' : v.toFixed(n));
  const gauss = (rnd) => { let s = 0; for (let k = 0; k < 6; k++) s += rnd(); return (s - 3) / Math.SQRT1_2; };
  Object.assign(S, { lie: 'fairway', slope: 'flat', power: 5, dex: 5, composure: 5, badStreak: 0, height: 0, spinCtl: 0, shotShape: 'straight', face: 0, stance: 0, ballPos: 0, perception: 5 });
  const human = (rnd) => ({ bs: 1 + 0.05 * (rnd() + rnd() - 1), ds: 1, thetaMouse: 2.4 * (rnd() + rnd() - 1), sigma: 1.5 + 4 * rnd(), lateSign: rnd() < 0.5 ? 1 : -1, vImpact: 1, vPeak: 1, miss: 0.02 * gauss(rnd) });
  const fly = (r, teed) => { const fl = g.createFlight({ ballSpeed: r.ballSpeed, vla: r.vla, dir: r.hla, spin: r.spin, axis: r.axis, release: r.release }, { x: 0, z: 0 }, teed ? 0.04 : 0); for (let n = 0; fl.phase !== 'stopped' && n < 30000; n++) g.stepFlight(fl, 1 / 120); return fl; };
  const real = (ci, N, seed, swing = human) => { const rnd = g.rng32(seed * 7919 + ci), su = g.setup(), teed = !!C[ci].tee && S.lie === 'fairway', P = [];
    for (let k = 0; k < N; k++) { const r = g.computeImpact(swing(rnd), su, C[ci], { lie: S.lie, slope: 'flat', power: S.power, dex: S.dex, composure: S.composure, badStreak: S.badStreak, teed }, rnd); const fl = fly(r, teed); P.push({ x: fl.p.x, z: fl.p.z, carry: fl.carry / YD }); } return P; };
  // ---- S1.3
  out.push(`S1.3 CALIBRATION LIMITS: ${g.CAL_MAX.px} counts, ${g.CAL_MAX.v} counts/ms · the Settings sliders: length ${document.getElementById('inSwingPx').max}, speed ${document.getElementById('inVTarget').max}`);
  out.push('   (the calibrating swing at each DPI: section 7 of tools/test/swing-input.js)');
  // ---- S6.2: the lie read against the truth (as S6's table)
  out.push('', 'S6.2 THE BAG\'S RANGE FROM A BAD LIE against 600 real shots (Dex 5, the human hand): true mean carry (10th–90th) · the read at Per 1 / 5 / 10 and how often the true mean is inside it over 40 lie seeds');
  for (const lie of ['light', 'heavy', 'fbunker']) for (const [ci, n] of [[7, '7 Iron'], [10, 'PW']]) {
    S.lie = lie; const P = real(ci, 600, 3).map((p) => p.carry).sort((a, b) => a - b), mean = P.reduce((a, b) => a + b, 0) / P.length, cells = [];
    for (const per of [1, 5, 10]) { S.perception = per; let lo = 0, hi = 0, inside = 0; for (let s = 0; s < 40; s++) { S.lieSeed = 1234567 + s * 7919; const r = g.lieRead(ci); lo += r.carryLo; hi += r.carryHi; if (mean >= r.carryLo && mean <= r.carryHi) inside++; } cells.push(`Per ${per}: ${f(lo / 40)}–${f(hi / 40)}, inside ${f(inside / 40 * 100)}%`); }
    out.push(`   ${(g.LIES[lie].name + ', ' + n).padEnd(24)} true ${f(mean)} (${f(P[60])}–${f(P[540])}) · stock ${f(g.stockShot(ci).carry)} · ${cells.join(' · ')}`);
  }
  S.lie = 'fairway'; S.perception = 5;
  // ---- S9.1: the landing area against real shots
  out.push('', 'S9.1 THE MINIMAP\'S LANDING AREA: share of 600 real shots (S1\'s human hand) inside the drawn 2σ ellipse (a true one holds about 86%)');
  const inside = (ci) => {
    S.club = ci; const sp = g.landSpread(ci), r = g.lieRead(ci), st = g.stockShot(ci), k2 = st.total > 0 ? r.totalMid / (st.total * (r.lieK ? r.lieK.total : 1)) : 1, tot = r.totalMid * YD;
    const sxx = sp.sxx * k2 * k2, szz = (sp.szz + (r.exact ? 0 : (r.half * tot / 2) ** 2)) * k2 * k2, sxz = sp.sxz * k2 * k2, mx = sp.mx * k2, mz = sp.mz * k2, det = sxx * szz - sxz * sxz;
    const P = real(ci, 600, 5); return `${f(P.filter((p) => { const dx = p.x - mx, dz = p.z - mz; return (szz * dx * dx - 2 * sxz * dx * dz + sxx * dz * dz) / det <= 4; }).length / P.length * 100)}%`;
  };
  for (const [name, o] of [['fairway, Dex 5', {}], ['fairway, Dex 1', { dex: 1 }], ['fairway, Dex 10', { dex: 10 }], ['light rough, Dex 5', { lie: 'light' }], ['heavy rough, Dex 5', { lie: 'heavy' }], ['tilted (3 bad shots), Dex 5', { badStreak: 3 }]]) {
    Object.assign(S, { lie: 'fairway', dex: 5, badStreak: 0 }, o);
    out.push(`   ${name.padEnd(28)} ${[[0, 'Driver'], [3, '3 Hybrid'], [7, '7 Iron'], [10, 'PW'], [12, 'SW']].map(([ci, n]) => `${n} ${inside(ci)}`).join(' · ')}`);
  }
  Object.assign(S, { lie: 'fairway', dex: 5, badStreak: 0, club: 7 });
  // the player's own hand: 12 recorded swings that are steadier than the estimate; the ellipse follows
  const before = g.landSpread(7); for (let k = 0; k < 12; k++) g.recordSwing({ thetaMouse: 0.5 * Math.sin(k), sigma: 1.0, miss: 0.005 * Math.cos(k) });
  const after = g.landSpread(7);
  out.push(`   the player's own swings: 12 steady ones recorded (wobble 1 px, path ±0.5°) → the 7 iron's 2σ width ±${f(2 * Math.sqrt(before.sxx) / YD, 1)} → ±${f(2 * Math.sqrt(after.sxx) / YD, 1)} yds (history: ${g.swingHist.length} swings)`);
  // timing: what a lie change costs the bag (every club's read)
  { S.lie = 'heavy'; const t0 = performance.now(); g.renderBag(); const t1 = performance.now(); g.renderBag(); const t2 = performance.now(); S.lie = 'fairway'; out.push(`   the bag after a lie change: ${f(t1 - t0)} ms the first time, ${f(t2 - t1)} ms again (cached)`); }
  // ---- S8.3: the cup
  out.push('', `S8.3 THE CUP (captureSpeed ${g.PUTT.captureSpeed} m/s): the fastest ball that drops, by how far off centre it crosses (Stimp 11)`);
  { const surf = g.makeSurface({ stimp: 11, outline: { x: 0, z: -4, rx: 16.5, rz: 16.5 } }), a = surf.decel, cells = [];
    for (const off of [0, 0.5, 0.75, 0.9]) { let best = 0; for (let v = 0.3; v <= 3; v += 0.02) { const q = g.createPutt({ ...surf, hole: { x: off * 0.054, z: -6 * FT } }, v, 0, 0); for (let n = 0; q.phase === 'roll' && n < 40000; n++) g.stepPutt(q, 1 / 240); if (q.holed) best = v; } const atCup = Math.sqrt(Math.max(0, best * best - 2 * a * (6 * FT - 0.054))); cells.push(`${f(off * 100)}% off: ${f(atCup, 2)} m/s (${f(atCup * atCup / (2 * a) / FT, 1)} ft past)`); }
    out.push(`   ${cells.join(' · ')}`); }
  return out.join('\n');
})()
