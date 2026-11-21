// Deep fairway bunkers (user request, 2026-11-20): each fairway bunker is a bowl like the greenside ones (BUNKER),
// shallower, its face toward where it's played out (playTarget). A full shot from one starts on the sand and has to
// clear the face. Prints every fairway bunker's depth and lip, then on hole 1 (or window.__hole) from the back, the
// middle and just short of the face of window.__bi's bunker: each club's face read against the shot actually played
// (stock, through the game's own launch), and the club suggestClub hands you.
//   node tools/test/probe.js "http://127.0.0.1:8090/?nohome" <shot|-> @tools/test/fbunker-depth.js "0" fbunker
// (window.__spot: 'face' | 'mid' | 'back' leaves the ball there at address for a screenshot; window.__view sets the view)
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 50 && !window.__golf; i++) await sleep(200);
  const g = window.__golf, YD = 0.9144, FT = 0.3048, st = g.state, C = g.CLUBS, out = [];
  const f1 = (v, n = 1) => v.toFixed(n);
  out.push('FAIRWAY BUNKERS: depth ft · lip ft (course as built, no tier)');
  for (let h = 0; h < g.HOLES.length; h++) {
    g.selectHole(h);
    const fw = g.hole.dips.filter((d) => d.type === 'fbunker');
    if (fw.length) out.push(`   hole ${h + 1}: ` + fw.map((d) => `${f1(d.D / FT)} ft, lip ${f1(d.L / FT)}`).join(' · '));
  }
  const hi = window.__hole ?? 0, bi = window.__bi ?? 0;
  g.selectHole(hi); g.enterHole(); await sleep(300);
  const d = g.hole.dips.filter((x) => x.type === 'fbunker')[bi];
  const at = (t) => ({ x: d.x + d.gx * t, z: d.z + d.gz * t });
  let edgeT = 0; for (let t = 0; t < 40; t += 0.05) { const p = at(t); if (g.surfaceAt(p.x, p.z) !== 'fbunker') { edgeT = t; break; } }
  const fm = g.BUNKER.fairwayFaceM;
  const spots = { back: -edgeT * 0.5, mid: 0, under: edgeT - fm - 1.5, foot: edgeT - fm - 0.3, face: edgeT - 0.8 };
  // a stock full swing through the game's own launch() (debugSwing with a perfect hand) -> where it finished
  const play = async (ci) => {
    st.club = ci; st.aim = g.holeAim(); st.windMph = 0;
    const keep = { x: g.hp.ball.x, z: g.hp.ball.z };
    const fr = g.fullFaceRead(ci, st.aim);
    g.debugSwing({ back: 1 });
    const f = g.shot.flight, y0 = f.p.y;
    for (let k = 0; k < 40000 && f.phase !== 'stopped'; k++) g.stepFlight(f, 1 / 120);      // (finish it now, not in real time)
    const rx = keep.x + f.p.x, rz = keep.z + f.p.z, s = g.surfaceAt(rx, rz);
    const res = { fr, s, dist: Math.hypot(f.p.x, f.p.z) / YD, vla: g.shot.res.vla, y0 };
    g.hp.ball = keep; g.hp.strokes = 0; g.setupNextShot(); await sleep(30);
    return res;
  };
  for (const name of (window.__spots || ['back', 'mid', 'under', 'foot', 'face'])) {
    const p = at(spots[name]); g.hp.ball = { x: p.x, z: p.z }; g.hp.onTee = false; g.setupNextShot(); await sleep(50);
    const sug = st.club;
    out.push('', `HOLE ${hi + 1} bunker ${bi}, ${name}: ${f1(-g.bunkerH(p.x, p.z) / FT)} ft down, ${st.slope} lie, ${f1(g.hole.pin && Math.hypot(g.hole.pin.x - p.x, g.hole.pin.z - p.z) / YD, 0)} yds to the pin · suggested ${C[sug].name} · rig at ${f1(g.rigY(), 2)} m`);
    const rows = [];
    for (let ci = 1; ci < C.length; ci++) {
      if (C[ci].head === 'putter' || /putter/i.test(C[ci].name) || !g.canUseClub(ci)) continue;
      const r = await play(ci);
      const stays = r.s === 'fbunker' && r.dist < 30;
      rows.push(`${C[ci].name} ${f1(r.vla, 0)}° from y ${f1(r.y0, 2)}:${r.fr ? `face ${f1(r.fr.ft)} ft, read ${r.fr.stays ? 'STAYS' : r.fr.just ? 'only just' : 'out'}` : 'no face'} → ${stays ? 'STAYED IN' : `out, ${f1(r.dist, 0)} yds to ${r.s}`}${r.fr && r.fr.stays !== stays ? ' (READ WRONG)' : ''}`);
    }
    out.push('   ' + rows.join('\n   '));
  }
  if (window.__spot) { const p = at(spots[window.__spot]); g.hp.ball = { x: p.x, z: p.z }; g.hp.onTee = false; g.setupNextShot(); st.view = window.__view || 'address'; await sleep(1500); }
  return out.join('\n');
})()
