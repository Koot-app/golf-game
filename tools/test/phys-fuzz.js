// Audit section 6: shots at the edges. Part 1: 20,000 random ball flights through the game's own createFlight/stepFlight
// (any speed, launch, spin, curve, wind up to 25 m/s, every surface, a tree in the way) — does every one end, with
// numbers that make sense? Part 2: extreme putts through the real putting green (debugSwing). Part 3: the tilt ladder.
//   node tools/test/probe.js http://127.0.0.1:8090/?nohome - @tools/test/phys-fuzz.js 0 audit-phys
// (Part 1's launches go beyond what the game makes: its launch angle is never below 1.5°, so a "> 600 m" roll from a
//  launch below level is the test's own extreme, not something a player can hit.)
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 50 && !window.__golf; i++) await sleep(200);
  const g = window.__golf, out = [], bad = {}, note = (k, ex) => { if (!bad[k]) bad[k] = { n: 0, ex }; bad[k].n++; };
  const R = (a, b) => a + Math.random() * (b - a), surfs = Object.keys(g.SURF);
  let maxSteps = 0, maxT = 0, maxTotal = 0;
  for (let n = 0; n < 20000; n++) {
    const L = { ballSpeed: R(0, 95), vla: R(1.5, 85), dir: R(-60, 60), spin: R(0, 14000), axis: R(-70, 70), release: R(-1, 1) };
    const sf = surfs[Math.floor(Math.random() * surfs.length)], S = g.SURF[sf];
    const tree = Math.random() < 0.3 ? { x: R(-20, 20), y: R(0, 15), z: -R(5, 150), r: R(2, 6) } : null;
    if (Math.random() < 0.3) { L.ground = () => ({ e: S.e, keep: S.keep, roll: S.roll }); }
    if (tree) L.obstacle = (x, y, z) => (Math.hypot(x - tree.x, y - tree.y, z - tree.z) < tree.r ? 1 : -1);
    const f = g.createFlight(L, { x: R(-25, 25), z: R(-25, 25) }, Math.random() < 0.5 ? 0.04 : 0);
    let steps = 0;
    while (f.phase !== 'stopped' && steps < 200000) { g.stepFlight(f, 1 / 120); steps++; }
    const vals = [f.p.x, f.p.y, f.p.z, f.v.x, f.v.y, f.v.z, f.carry ?? 0, f.apex];
    if (steps >= 200000) note('never stops', JSON.stringify(L));
    if (!vals.every(Number.isFinite)) note('NaN / Infinity in the result', JSON.stringify(L));
    if (f.p.y < -0.001) note('ends below the ground', `${f.p.y.toFixed(3)} ${JSON.stringify(L)}`);
    const tot = Math.hypot(f.p.x, f.p.z);
    if (L.ballSpeed < 85 && tot > 600) note('goes impossibly far (> 600 m)', `${tot.toFixed(0)} m ${JSON.stringify(L)}`);
    if (f.p.y > 0.001 && f.phase === 'stopped') note('stopped in mid-air (the 30 s cap)', `y ${f.p.y.toFixed(1)} ${JSON.stringify(L)}`);
    maxSteps = Math.max(maxSteps, steps); maxT = Math.max(maxT, f.t); maxTotal = Math.max(maxTotal, tot);
  }
  out.push(`flights: 20,000 · longest ${maxSteps} steps (${maxT.toFixed(1)} s of ball time) · farthest ${maxTotal.toFixed(0)} m`);
  out.push(Object.keys(bad).length ? Object.entries(bad).map(([k, v]) => `  ${v.n} × ${k}, e.g. ${v.ex.slice(0, 220)}`).join('\n') : '  no problems');
  // ---- part 2: putts on the practice green, the stroke from tiny to enormous, straight and pulled
  for (const k of Object.keys(bad)) delete bad[k];
  g.setMode('putt'); await sleep(600);
  const res = [];
  for (const back of [0.05, 0.3, 1, 2, 3.5]) {
    for (const angle of [0, 25]) {
      g.swing.active = false; g.newPutt(); await sleep(300);           // (a stroke that never reaches the ball leaves the
      const t0 = performance.now();                                    //  button "held" in a script; a player lets go)
      const tel = g.debugSwing({ back, tempo: 1, angle });
      let k = 0; while (k < 300 && (!g.puttRun || !g.puttRun.done)) { await sleep(100); k++; }
      const pr = g.puttRun, q = pr && pr.sim;
      const s = !tel ? 'no contact' : pr ? `${pr.done ? 'done' : 'STILL ROLLING'} in ${((performance.now() - t0) / 1000).toFixed(1)} s${q ? ` · ${q.phase} · rolled ${(q.rolled / 0.3048).toFixed(0)} ft` : ''}` : 'no putt';
      if (tel && (!pr || !pr.done)) note('a putt that never finishes', `back ${back}, angle ${angle}`);
      if (q && ![q.p.x, q.p.z].every(Number.isFinite)) note('a putt that ends at NaN', `back ${back}`);
      res.push(`back ${back}${angle ? ' pulled' : ''}: ${s}`);
    }
  }
  out.push('', 'putts:', ...res.map((x) => `  ${x}`), Object.keys(bad).length ? Object.entries(bad).map(([k, v]) => `  ${v.n} × ${k} (${v.ex})`).join('\n') : '  no problems');
  // ---- part 3: the tilt ladder, Composure 1 / 5 / 10, 0 to 8 bad shots in a row
  out.push('', 'tilt (difficulty added) by bad shots in a row:', '  composure   ' + [0, 1, 2, 3, 4, 5, 6, 8].map((n) => String(n).padStart(6)).join(''));
  for (const c of [1, 5, 10]) out.push(`  ${String(c).padStart(9)}   ` + [0, 1, 2, 3, 4, 5, 6, 8].map((n) => g.tiltPenalty(c, n).toFixed(2).padStart(6)).join(''));
  return out.join('\n');
})()
