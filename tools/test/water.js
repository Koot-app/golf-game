// WATER (user request, 2026-11-20): the ponds on the tier 2 course are penalty areas. Checks: a shot that comes down
// in a pond stays there; a ball rolling in stops in it (full-shot roll and the chip/putt roll); the drop card's three
// options (stroke and distance, near where it went in, back on the line), that it can't be dismissed, and the penalty;
// and that a hustler's ball never stops in water.
//   node tools/test/probe.js "http://127.0.0.1:8090/?nohome" <shot|-> @tools/test/water.js "0" water
// (window.__shot = 1 leaves the drop card open on hole 9 for a screenshot)
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 50 && !window.__golf; i++) await sleep(200);
  const g = window.__golf, YD = 0.9144, out = [], f1 = (v, n = 1) => v.toFixed(n);
  if (window.__npc) {                                    // (a guest career, for the hustlers' plans: open the page without ?nohome)
    const $ = (id) => document.getElementById(id);
    localStorage.clear(); window.confirm = () => true;
    $('hmGuest').click(); await sleep(150); document.querySelector('[data-h=career]').click(); await sleep(200);
    $('chName').value = 'TESTER'; $('chCreate').click(); await sleep(300);
  }
  g.setCourse(2);
  g.selectHole(8); g.enterHole(); await sleep(300);
  const pond = g.hole.water[0];
  out.push(`hole 9 pond at (${f1(pond.x / YD, 0)}, ${f1(pond.z / YD, 0)}) yds, ${f1(pond.rx * 2 / YD, 0)}×${f1(pond.rz * 2 / YD, 0)} · surface there: ${g.surfaceAt(pond.x, pond.z)}`);
  // 1. a tee shot that comes down in the middle of it
  const brg = Math.atan2(pond.x, -pond.z) * 180 / Math.PI, dist = Math.hypot(pond.x, pond.z);
  let landed = null;
  for (let v = 30; v <= 75; v += 0.25) {
    const fl = g.createFlight({ ballSpeed: v / 0.44704, vla: 16, dir: brg, spin: 3500, axis: 0, release: 0, ground: (x, z) => g.SURF[g.surfaceAt(x, z)], green: g.fullShotGreen({ x: 0, z: 0 }) }, { x: 0, z: 0 }, 0);
    for (let k = 0; k < 20000 && fl.phase !== 'stopped' && fl.carry === null; k++) g.stepFlight(fl, 1 / 120);
    if (fl.carry !== null && fl.carry >= dist) { for (let k = 0; k < 20000 && fl.phase !== 'stopped'; k++) g.stepFlight(fl, 1 / 120); landed = fl; break; }
  }
  out.push(`1. tee shot into it: carried ${f1(landed.carry / YD)} yds, rolled ${f1(Math.hypot(landed.p.x - landed.land.x, landed.p.z - landed.land.z) / YD)} yds after, rests on ${g.surfaceAt(landed.p.x, landed.p.z)}`);
  // 2. a low runner that lands short and rolls in
  const short = { x: pond.x * (1 - (pond.rz + 25) / Math.hypot(pond.x, pond.z)), z: pond.z * (1 - (pond.rz + 25) / Math.hypot(pond.x, pond.z)) };
  let rolled = null;
  for (let v = 20; v <= 75; v += 0.25) {
    const fl = g.createFlight({ ballSpeed: v / 0.44704, vla: 6, dir: brg, spin: 1500, axis: 0, release: 0, ground: (x, z) => g.SURF[g.surfaceAt(x, z)], green: g.fullShotGreen({ x: 0, z: 0 }) }, { x: 0, z: 0 }, 0);
    for (let k = 0; k < 20000 && fl.phase !== 'stopped'; k++) g.stepFlight(fl, 1 / 120);
    if (fl.carry !== null && fl.carry < Math.hypot(short.x, short.z) + 2 && g.surfaceAt(fl.p.x, fl.p.z) === 'water') { rolled = fl; break; }
  }
  out.push(`2. a runner that lands short: ${rolled ? `carried ${f1(rolled.carry / YD)} yds onto ${g.surfaceAt(rolled.land.x, rolled.land.z)}, rolled in and stopped ${f1((Math.hypot(rolled.p.x, rolled.p.z) - Math.hypot(pond.x, pond.z) + pond.rz) / YD)} yds past the edge, on ${g.surfaceAt(rolled.p.x, rolled.p.z)}` : 'NONE rolled in'}`);
  // 3. the chip/putt roll (the chip rules' view of the hole) runs into it and stops
  {
    // (a runner from 12 yds short of the edge, harder each time until it gets there)
    const L0 = Math.hypot(pond.x, pond.z), u = (L0 - pond.rz - 12 * YD) / L0, hb = { x: pond.x * u, z: pond.z * u }, gv = g.fullShotGreen(hb), dx = pond.x - hb.x, dz = pond.z - hb.z, L = Math.hypot(dx, dz);
    let f = null;
    for (let v = 4; v <= 40 && !(f && gv.surfAt(f.p.x, f.p.z) === 'water'); v += 1) f = g.runChip(gv, { ballSpeed: v, vla: 5, dir: Math.atan2(dx, -dz) * 180 / Math.PI, spin: 1500, axis: 0, release: 0 });
    out.push(`3. a chip-rules ball run at it from ${f1((L - pond.rz) / YD, 0)} yds short of the edge: stops on ${gv.surfAt(f.p.x, f.p.z)} at ${f1(f.v ? Math.hypot(f.v.x, f.v.z) : 0, 2)} m/s, ${f1((Math.hypot(f.p.x, f.p.z) - (L - pond.rz)) / YD)} yds past the edge (${f.phase})`);
  }
  // 4. the drop: the ball finished in the pond, hit from the tee
  const strokes0 = g.hp.strokes;
  g.hp.lastFrom = { x: 0, z: 0, tee: true }; g.hp.ball = { x: landed.p.x, z: landed.p.z }; g.hp.onTee = false; g.setupNextShot(); await sleep(100);
  const opts = g.waterDropOptions(), e = g.waterEntry();
  out.push(`4. ball in the water: the drop card is ${g.dropOpen ? 'OPEN' : 'closed'} · it went in at (${f1(e.x / YD, 0)}, ${f1(e.z / YD, 0)}) yds, ${f1(Math.hypot(g.hole.pin.x - e.x, g.hole.pin.z - e.z) / YD, 0)} from the pin`);
  for (const o of opts) out.push(`     ${o.name}: (${f1(o.pos.x / YD, 0)}, ${f1(o.pos.z / YD, 0)}) · ${o.lie} · ${f1(o.toPin / YD, 0)} yds to the pin${o.off ? ' · NOT AVAILABLE' : ''} · ${o.why}`);
  document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape', bubbles: true })); window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape', bubbles: true })); await sleep(50);
  out.push(`   Esc: the card is still ${g.dropOpen ? 'OPEN (as it should be)' : 'CLOSED'}`);
  if (window.__shot) return out.join('\n');
  g.takeDrop(1); await sleep(100);
  out.push(`   took "near where it went in": strokes ${strokes0} -> ${g.hp.strokes} (penalties ${g.hp.pen}) · ball on ${g.surfaceAt(g.hp.ball.x, g.hp.ball.z)} · card ${g.dropOpen ? 'OPEN' : 'closed'} · lie ${g.state.lie}`);
  // 5. a hustler's ball never stops in water, on any hole of this course
  if (g.career) {
    let wet = 0, stops = 0;
    for (const tier of [2, 3]) for (let i = 0; i < 9; i++) {
      g.setCourse(tier); g.selectHole(i);
      if (!g.hole.water.length) continue;
      for (let t = 0; t < 300; t++) {
        const fm = { npc: t % 2 ? 'marco' : 'dale', tier, no: t + 1, salt: t * 7919 }, S = g.npcHoleScore(fm, i);
        for (const st of g.npcPlan(fm, i, S)) { stops++; if (g.surfaceAt(st.to.x, st.to.z) === 'water' && !st.ob) wet++; }
      }
    }
    out.push(`5. hustlers on the holes with water (tiers 2 and 3): ${stops} strokes planned, ${wet} stop in water`);
  } else out.push('5. (no career on this profile: the hustlers\' plans are skipped)');
  g.setCourse(null);
  return out.join('\n');
})()
