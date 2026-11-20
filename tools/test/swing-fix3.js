// Swing audit fixes S7.1 (shot locks), S7.2 (the woods' Low 2) and S8.1 (one landing-and-roll rule either side of the
// 45 yd hand-off, with S3.2's hand-off of a full shot to the green's roll): the re-measures.
//   node tools/test/probe.js "http://127.0.0.1:8090/?nohome" - @tools/test/swing-fix3.js 0 swing-fix3
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 50 && !window.__golf; i++) await sleep(200);
  const g = window.__golf, YD = 0.9144, out = [], C = g.CLUBS, S = g.state, CH = g.CHIP;
  const f = (v, n = 1) => (v === null || v === undefined || Number.isNaN(v) ? '—' : v.toFixed(n));
  const sgn = (v) => `${v >= 0 ? '+' : '−'}${f(Math.abs(v), 0)}`;
  Object.assign(S, { lie: 'fairway', slope: 'flat', power: 5, dex: 5, composure: 5, badStreak: 0, height: 0, spinCtl: 0, face: 0, stance: 0, ballPos: 0 });
  const SU = { face: 0, ballPos: 0, stance: 0, traj: 0, spinCtl: 0 };
  const imp = (ci, su = SU, bs = 1) => g.computeImpact({ bs, ds: 1, thetaMouse: 0, sigma: 0, lateSign: 1, vImpact: 1, vPeak: 1, miss: 0 }, su, C[ci], { lie: 'fairway', slope: 'flat', power: 5, dex: 5, composure: 5, badStreak: 0, teed: ci === 0, stock: true }, () => 0.5);
  const fly = (r, o = {}) => { const fl = g.createFlight({ ballSpeed: r.ballSpeed, vla: r.vla, dir: o.dir || 0, spin: r.spin, axis: 0, release: 0, green: o.green || null }, o.wind || { x: 0, z: 0 }, o.y0 || 0); let n = 0; for (; fl.phase !== 'stopped' && n < 40000; n++) g.stepFlight(fl, 1 / 120); return { fl, carry: fl.carry / YD, total: Math.hypot(fl.p.x, fl.p.z) / YD, apex: fl.apex / YD, steps: n }; };
  // ===================== S7.2
  out.push('S7.2 THE HEIGHT LADDER (stock, straight): launch · apex · carry / total, and the total into a 15 and a 25 mph headwind');
  for (const [ci, n] of [[0, 'Driver'], [1, '3 Wood'], [2, '2 Hybrid'], [4, '4 Iron'], [7, '7 Iron']]) {
    const cells = [-2, -1, 0].map((h) => { const r = imp(ci, { ...SU, traj: h }), y0 = ci === 0 ? 0.04 : 0, a = fly(r, { y0 }), w15 = fly(r, { y0, wind: g.windVector(15, 0) }), w25 = fly(r, { y0, wind: g.windVector(25, 0) });
      return `${h === 0 ? 'Mid' : `Low ${-h}`} ${f(r.vla, 1)}° · ${f(a.apex, 0)} · ${f(a.carry, 0)}/${f(a.total, 0)} · wind ${f(w15.total, 0)} / ${f(w25.total, 0)}`; });
    out.push(`   ${n.padEnd(9)} ${cells.join('   ')}`);
  }
  // ===================== S8.1
  const view = (stimp = 11, key = 'green') => ({ decel: g.rollDecel(stimp), stimp, hole: { x: 0, z: -1e5 }, h: () => 0, grad: () => ({ x: 0, z: 0 }), surfAt: () => key, drag: () => (CH.surf[key] || CH.surf.fairway).drag });
  const chipSU = { ...SU, align: { face: 0, stance: 0, ballPos: 0 }, flop: false };
  const bsFor = (ci, c) => { let lo = 0.04, hi = 1.1; for (let i = 0; i < 28; i++) { const m = (lo + hi) / 2; if (fly(imp(ci, chipSU, m), { green: view() }).carry < c) lo = m; else hi = m; } return (lo + hi) / 2; };
  out.push('', 'S8.1 ONE RULE EITHER SIDE OF 45 YDS (flat Stimp 11 green): the chip (runChip) and the full shot handed to the green, same launch; roll in yds');
  for (const [ci, n] of [[10, 'PW'], [12, 'SW'], [13, 'LW']]) {
    const cells = [10, 20, 30, 42].map((c) => { const r = imp(ci, chipSU, bsFor(ci, c)), ch = g.runChip(view(), { ballSpeed: r.ballSpeed, vla: r.vla, dir: 0, spin: r.spin, axis: 0, release: 0 }), fu = fly(r, { green: view() });
      return `${c}: chip +${f(Math.hypot(ch.p.x, ch.p.z) / YD - ch.carry / YD)} · full +${f(fu.total - fu.carry)}`; });
    out.push(`   ${n.padEnd(3)} ${cells.join(' · ')}`);
  }
  out.push('   full shots landing on a green (stock), roll at Stimp 9 / 11 / 13 (the old full-shot rule: 17 / 12 / 8 / 5 / 2 / 1 for these clubs, at any Stimp):');
  out.push('   ' + [[0, 'Driver'], [1, '3 Wood'], [5, '5 Iron'], [7, '7 Iron'], [10, 'PW'], [12, 'SW']].map(([ci, n]) => `${n} ${[9, 11, 13].map((s) => { const x = fly(imp(ci), { green: view(s), y0: ci === 0 ? 0.04 : 0 }); return f(x.total - x.carry); }).join(' / ')}`).join(' · '));
  out.push(`   a putt is unchanged: a pure 50% stroke on the 40 ft scale rolls ${(() => { const res = g.computePutt({ thetaMouse: 0, excursion: 0, tempo: 1, sigma: 0, lateSign: 1, miss: 0, len: 0.5 }, g.PUTTERS.blade, { scaleFt: 40, stimp: 11, composure: 5, badStreak: 0, dex: 5 }); const q = g.createPutt({ ...g.makeSurface({ stimp: 11 }), hole: { x: 0, z: -1e3 } }, res.v0, 0, res.skidFt); for (let n = 0; q.phase === 'roll' && n < 40000; n++) g.stepPutt(q, 1 / 240); return f(-q.p.z / 0.3048, 1); })()} ft`);
  // on a real hole: a full pitch from 55 yds that comes down on the green
  g.selectHole && g.selectHole(0); g.enterHole(); await sleep(300);
  const hole = g.hole, pin = hole.pin, dir0 = Math.atan2(pin.x, -pin.z), back = 55 * YD;
  g.hp.ball = { x: pin.x - Math.sin(dir0) * back, z: pin.z + Math.cos(dir0) * back }; g.hp.onTee = false; g.setupNextShot(); await sleep(200);
  const hb = { ...g.hp.ball }, gv = g.fullShotGreen(hb), dirDeg = Math.atan2(pin.x - hb.x, -(pin.z - hb.z)) * 180 / Math.PI;
  out.push(`   on hole 1 (Stimp ${f(g.holeStimp(), 1)}), from ${f(Math.hypot(pin.x - hb.x, pin.z - hb.z) / YD, 0)} yds, ${g.state.view} view, club ${C[S.club].name}, chip mode ${g.state.mode}:`);
  let handed = 0, holed = 0, n = 0, rolls = [];
  for (let bs = 0.45; bs <= 0.75; bs += 0.0005) {
    const r = imp(10, SU, bs), x = fly(r, { green: gv, dir: dirDeg }); n++;
    if (x.fl.g) { handed++; rolls.push(x.total - x.carry); } if (x.fl.holed) holed++;
    if (x.steps >= 40000) out.push(`      NEVER STOPPED at backswing ${f(bs, 3)}`);
  }
  out.push(`      ${n} pitches straight at the pin (PW, backswing 45–75%): ${handed} came down on the green and rolled by the green's rules (roll ${f(Math.min(...rolls))}–${f(Math.max(...rolls))} yds), ${holed} holed out`);
  // the live path: a scripted swing, then R (advanceHole) plays it out
  S.club = 10; S.view = 'address';
  const tel = g.debugSwing({ back: 0.6 }); await sleep(100);
  const sh = g.shot; out.push(`      a live swing (debugSwing 60%): shot ${sh ? 'launched' : 'MISSING'}${tel && tel.res ? `, ball speed ${f(tel.res.ballSpeed, 0)} mph` : ''}`);
  if (sh) { const before = g.hp.strokes; g.advanceHole(); await sleep(200); out.push(`      after R: strokes ${before} → ${g.hp.strokes} · the ball now ${f(Math.hypot(pin.x - g.hp.ball.x, pin.z - g.hp.ball.z) / YD * 3, 1)} ft from the pin · mode ${g.state.mode} · hole done ${g.hp.done}`); }
  g.leaveHole(); await sleep(200);
  // ===================== S7.1: the locks, in a new guest career (everything unlearned)
  out.push('', 'S7.1 THE LOCKS (a new guest career: no lessons; keys sent to the game at address on the range)');
  g.openHome(); await sleep(300); document.querySelector('#hmGuest').click(); await sleep(300); document.querySelector('#hmCareer').click(); await sleep(400);
  const nb = document.querySelector('#chNew'); if (nb && getComputedStyle(nb).display !== 'none') { document.querySelector('#chName').value = 'LockTest'; document.querySelector('#chCreate').click(); await sleep(500); }
  const rangeBtn = document.querySelector('[data-go=range]'); if (rangeBtn) { rangeBtn.click(); await sleep(500); }
  const key = async (code, times = 1) => { for (let i = 0; i < times; i++) { window.dispatchEvent(new KeyboardEvent('keydown', { code, key: code, bubbles: true })); document.dispatchEvent(new KeyboardEvent('keyup', { code, key: code, bubbles: true })); window.dispatchEvent(new KeyboardEvent('keyup', { code, key: code, bubbles: true })); await sleep(30); } };
  out.push(`   career on ${g.careerOn}, mode ${S.mode}, view ${S.view}; unlocks ${JSON.stringify(g.career && g.career.unlocks)}`);
  S.club = 7; S.view = 'address'; Object.assign(S, { height: 0, ballPos: 0, face: 0, stance: 0 });
  await key('KeyA', 15); const b1 = S.ballPos; await key('KeyW'); const h1 = S.height;
  out.push(`   ball back 15 steps: ball position ${f(b1, 1)} (one level, = Low 1); then W: height ${h1} (Low 2 refused: it would be 2 levels)`);
  Object.assign(S, { height: 0, ballPos: 0 }); await key('KeyW'); await key('KeyA', 5);
  out.push(`   W first (Low 1), then ball back 5 steps: ball position ${f(S.ballPos, 1)}, height ${S.height}`);
  Object.assign(S, { height: 0, ballPos: 0 }); await key('KeyS'); await key('KeyD', 5);
  out.push(`   S (High 1), then ball forward 5 steps: ball position ${f(S.ballPos, 1)}, height ${S.height}`);
  Object.assign(S, { height: 0, ballPos: 0, face: 0, stance: 0 }); await key('KeyE', 6); const f1 = S.face; await key('KeyZ', 6);
  out.push(`   face open 6 steps: face ${f(f1, 1)}; then stance 6 steps the other way: stance ${f(S.stance, 1)} (the gap may not pass ${g.COACH.tweakFtp}°)`);
  Object.assign(S, { face: 0, stance: 0 }); for (let i = 0; i < 4; i++) { await key('KeyE'); await key('KeyC'); }
  out.push(`   face and stance together, 4 steps each: face ${f(S.face, 1)}, stance ${f(S.stance, 1)} (a re-aim, allowed up to ${g.COACH.tweakMax}°)`);
  // what the most the capped setup can now curve, against the preset
  Object.assign(S, { face: 0, stance: 0, height: 0, ballPos: 0 });
  const cap = (ci) => { const r = g.computeImpact({ bs: 1, ds: 1, thetaMouse: 0, sigma: 0, lateSign: 1, vImpact: 1, vPeak: 1, miss: 0 }, { ...SU, face: 0.5, stance: 0 }, C[ci], { lie: 'fairway', slope: 'flat', power: S.power, dex: S.dex, composure: 5, badStreak: 0, teed: ci === 0, stock: true }, () => 0.5), x = fly(r, { y0: ci === 0 ? 0.04 : 0 }); return Math.abs(x.fl.p.x / YD - Math.tan(r.hla * Math.PI / 180) * x.total); };
  out.push(`   the most a locked setup can now curve (face 0.5° off the stance): driver ${f(cap(0), 0)} yds, 4 iron ${f(cap(4), 0)}, 7 iron ${f(cap(7), 0)} (it was 56–59, 24, 13 at ±2°)`);
  return out.join('\n');
})()
