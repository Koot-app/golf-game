// Deep greenside bunkers (user request, 2026-11-20): each greenside bunker is a bowl (BUNKER), deepest under the face on
// the green side, with a turf lip; chips fly into its walls, a ball under the face needs height to get out, and a full
// shot that comes down in one plays by the same rules. Prints each hole's bunkers, a profile through hole 2's front-right
// pot bunker, chips out of it from the middle and from under the face, and full shots landing in and beside it.
//   node tools/test/probe.js "http://127.0.0.1:8090/?nohome" <shot|-> @tools/test/bunker-depth.js "window.__spot = 'face'" bunker
// (window.__spot: 'face' | 'mid' | 'back' leaves the ball there in chip mode for a screenshot; window.__flat = 1 instead
//  leaves a full-shot view 110 yds out on hole 2)
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 50 && !window.__golf; i++) await sleep(200);
  const g = window.__golf, YD = 0.9144, FT = 0.3048, st = g.state, C = g.CLUBS, out = [];
  const f1 = (v, n = 1) => v.toFixed(n);
  g.selectHole(1); g.enterHole(); await sleep(300);
  const hole = g.hole;
  out.push('GREENSIDE BUNKERS (seated a 1.5 yd collar off the green): depth ft · lip ft · face toward the green');
  out.push(hole.dips.map((d) => `   (${f1(d.x / YD)}, ${f1(d.z / YD)}) ${f1(d.rx / YD, 0)}×${f1(d.rz / YD, 0)} yds: ${f1(d.D / FT)} ft deep, lip ${f1(d.L / FT)} ft`).join('\n'));
  // the profile through the front-right bunker toward the green
  const d = hole.dips[0], gx = d.gx, gz = d.gz;
  const at = (t) => ({ x: d.x + gx * t, z: d.z + gz * t });
  const row = [];
  for (let t = -12; t <= 12; t += 1) { const p = at(t); row.push(`${t > 0 ? '+' : ''}${t}m ${f1(g.bunkerH(p.x, p.z) / FT)}ft ${g.surfaceAt(p.x, p.z)[0]}`); }
  out.push('', 'PROFILE through the first bunker, back → face → green (m from its centre, height ft, surface):', '   ' + row.join(' · '));
  // chips out of it: the ball at the centre and 1.5 m short of the face crest, with the suggested club and marker
  const edgeT = (() => { for (let t = 0; t < 30; t += 0.05) { const p = at(t); if (g.surfaceAt(p.x, p.z) !== 'bunker') return t; } return 0; })();
  const spots = { back: -edgeT * 0.5, mid: 0, face: edgeT - 1.6 };
  const chipFrom = async (name, type, spinCtl = 0) => {
    const p = at(spots[name]); g.hp.ball = { x: p.x, z: p.z }; g.hp.onTee = false; g.setupNextShot(); await sleep(50);
    if (type) g.applyChipType(type, true); st.spinCtl = spinCtl; g.readChipMarker(true);
    const cr = g.chipRead, r = g.computeImpact({ bs: cr.bsTrue, ds: 1, thetaMouse: 0, sigma: 0, lateSign: 1, vImpact: 1, vPeak: 1, miss: 0 }, g.setup(), C[st.club], { ...g.env(), stock: true }, () => 0.5);
    const f = g.runChip(g.green, { ballSpeed: r.ballSpeed, vla: r.vla, dir: st.aim, spin: r.spin, axis: 0, release: 0 });
    const rest = g.green.surfAt(f.p.x, f.p.z), left = Math.hypot(f.p.x - g.green.hole.x, f.p.z - g.green.hole.z);
    return `${name} (${f1(g.bunkerH(p.x, p.z) / FT)} ft down, ${st.slope} lie) ${C[st.club].name} ${st.chipType}: launch ${f1(r.vla)}° · face ${cr.face ? f1(cr.face.ft) + ' ft, read says ' + (cr.face.stays ? 'STAYS' : 'clears') : '—'} · first landing ${f.landSurf} → rests ${rest}, ${f1(left / FT, 0)} ft from the pin`;
  };
  out.push('', 'CHIPS out of it (stock strike at the read\'s backswing, aimed at the pin):');
  for (const s of ['back', 'mid', 'face']) for (const ty of ['stock', 'high', 'flop']) out.push('   ' + await chipFrom(s, ty));
  // under the face, along the line to the pin: how close to the crest each shot type still gets out
  {
    const pn = hole.pin, L0 = Math.hypot(pn.x - d.x, pn.z - d.z), ux = (pn.x - d.x) / L0, uz = (pn.z - d.z) / L0, on = (t) => ({ x: d.x + ux * t, z: d.z + uz * t });
    let e = 0; for (let t = 0; t < 30; t += 0.05) { const p = on(t); if (g.surfaceAt(p.x, p.z) !== 'bunker') { e = t; break; } }
    out.push('', 'UNDER THE FACE, on the line to the pin (m short of the crest): each shot type at the read\'s backswing → where it rests');
    for (const back of [3, 2, 1.5, 1]) {
      const p = on(e - back); g.hp.ball = { x: p.x, z: p.z }; g.setupNextShot();
      const row = [];
      for (const [ty, ci] of [['low', 10], ['stock', 12], ['high', 12], ['flop', 13]]) {
        st.club = ci; g.applyChipType(ty, true); g.readChipMarker(true);
        const cr = g.chipRead, r = g.computeImpact({ bs: cr.bsTrue, ds: 1, thetaMouse: 0, sigma: 0, lateSign: 1, vImpact: 1, vPeak: 1, miss: 0 }, g.setup(), C[st.club], { ...g.env(), stock: true }, () => 0.5);
        const f = g.runChip(g.green, { ballSpeed: r.ballSpeed, vla: r.vla, dir: st.aim, spin: r.spin, axis: 0, release: 0 }), rest = g.green.surfAt(f.p.x, f.p.z);
        row.push(`${ty} ${f1(r.vla, 0)}° → ${rest === 'bunker' ? 'STAYS IN' : rest}${cr.face && cr.face.stays !== (rest === 'bunker') ? ' (READ WRONG)' : ''}`);
      }
      out.push(`   ${back} m (${f1(g.bunkerH(p.x, p.z) / FT)} ft, ${st.slope}, face ${g.chipRead.face ? f1(g.chipRead.face.ft) : '—'} ft): ${row.join(' · ')}`);
    }
  }
  // full shots coming down in it and just short of it
  out.push('', 'FULL SHOTS coming down at 45° with 6,000 rpm onto these points (fired from 20 m back along the line):');
  for (const [nm, t] of [['in the middle', 0], ['on the face', edgeT - 0.4], ['on the lip', edgeT + 0.3], ['short of the bunker', -edgeT - 1.5]]) {
    const p = at(t);
    // fire it from 20 m back along the line so it comes down there
    const from = { x: p.x - gx * 20, z: p.z - gz * 20 }, brg = Math.atan2(gx, -gz) * 180 / Math.PI;
    let best = null;
    for (let v = 12; v <= 26; v += 0.05) {
      const fl = g.createFlight({ ballSpeed: v / 0.44704, vla: 45, dir: brg, spin: 6000, axis: 0, release: 0, ground: (x, z) => g.SURF[g.surfaceAt(from.x + x, from.z + z)], green: g.fullShotGreen(from) }, { x: 0, z: 0 }, 0);
      let k = 0; while (fl.carry === null && fl.phase !== 'stopped' && k++ < 20000) g.stepFlight(fl, 1 / 120);
      if (fl.carry !== null && fl.carry >= 20) { best = v; break; }
    }
    const fl = g.createFlight({ ballSpeed: best / 0.44704, vla: 45, dir: brg, spin: 6000, axis: 0, release: 0, ground: (x, z) => g.SURF[g.surfaceAt(from.x + x, from.z + z)], green: g.fullShotGreen(from) }, { x: 0, z: 0 }, 0);
    let k = 0; while (fl.phase !== 'stopped' && k++ < 40000) g.stepFlight(fl, 1 / 120);
    const rx = from.x + fl.p.x, rz = from.z + fl.p.z;
    out.push(`   ${nm}: lands (${f1(fl.land.x)}, ${f1(fl.land.z)}) m out on ${g.surfaceAt(from.x + fl.land.x, from.z + fl.land.z)} at ${f1(g.bunkerH(from.x + fl.land.x, from.z + fl.land.z) / FT)} ft · rests on ${g.surfaceAt(rx, rz)} ${f1(Math.hypot(rx - from.x - fl.land.x, rz - from.z - fl.land.z) / YD)} yds on, ${f1(g.bunkerH(rx, rz) / FT)} ft`);
  }
  spots.over = -edgeT - 6;                                                // in the rough behind it, chipping over it
  if (window.__spot) { const p = at(spots[window.__spot]); g.hp.ball = { x: p.x, z: p.z }; g.setupNextShot(); g.applyChipType('stock', true); st.view = window.__view || 'scout'; await sleep(1500); }
  if (window.__flat) {
    const pin = hole.pin, d0 = Math.atan2(pin.x, -pin.z), back = 110 * YD;
    g.hp.ball = { x: pin.x - Math.sin(d0) * back, z: pin.z + Math.cos(d0) * back }; g.setupNextShot(); await sleep(1500);
  }
  return out.join('\n');
})()
