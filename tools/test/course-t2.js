// A career course of its own (tier 2: HOLES_T2; tier 3: HOLES_T3, with window.__tier = 3). Builds each
// hole on that course and prints its par, length, fairway gaps and bunkers, checks the switch back to the plain holes,
// and the course-aware pars/stroke indexes used away from the course (tour leaderboard, challenge cards).
//   node tools/test/probe.js "http://127.0.0.1:8090/?nohome" <shot|-> @tools/test/course-t2.js "0" t2
// (window.__shot = i leaves hole i on the tee, scout view, for a screenshot; window.__map = 1 zooms the minimap out)
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 50 && !window.__golf; i++) await sleep(200);
  const g = window.__golf, YD = 0.9144, out = [];
  const plainPars = g.HOLES.map((h) => h.par).join(',');
  const T = window.__tier || 2;
  g.setCourse(T);
  out.push(`TIER ${T}: ${g.TIERS[T].course} · pars ${g.HOLES.map((h) => h.par).join(',')} = ${g.HOLES.reduce((s, h) => s + h.par, 0)} · si ${g.HOLES.map((h) => h.si).join(',')}`);
  let yds = 0;
  for (let i = 0; i < g.HOLES.length; i++) {
    g.selectHole(i); await sleep(20);
    const h = g.hole, def = g.HOLE, L = h.length / YD; yds += L;
    // where the centre line plays as fairway, in 10-yd steps: F fairway, . not
    let line = '';
    for (let s = 0; s <= h.length; s += 10 * YD) {
      const n = h.cl.reduce((b, p) => (Math.abs(p.s - s) < Math.abs(b.s - s) ? p : b), h.cl[0]);
      const k = g.surfaceAt(n.x, n.z); line += k === 'fairway' ? 'F' : k === 'green' ? 'G' : /bunker/.test(k) ? 'B' : k === 'tee' ? 'T' : '.';
    }
    out.push(`  ${def.name} par ${def.par} si ${def.si} · ${L.toFixed(0)} yds (centre line) · ${def.desc} · ${h.dips.length} bunkers (${h.dips.map((d) => (d.D / 0.3048).toFixed(1)).join('/')} ft) · ${g.holeTrees.length} trees · stimp ${def.stimp} wind ${def.wind.mph} mph`);
    out.push(`     ${line}`);
  }
  out.push(`  total ${yds.toFixed(0)} yds`);
  g.setCourse(null);
  out.push(`back to the plain holes: pars ${g.HOLES.map((h) => h.par).join(',')} (${g.HOLES.map((h) => h.par).join(',') === plainPars ? 'as before' : 'CHANGED'}) · hole 1 ${g.HOLES[0].desc}`);
  g.setCourse(1);
  out.push(`tier 1: pars ${g.HOLES.map((h) => h.par).join(',')} (${g.HOLES.map((h) => h.par).join(',') === plainPars ? 'the plain holes' : 'CHANGED'})`);
  g.setCourse(null);
  if (window.__shot !== undefined) {
    g.setCourse(T); g.selectHole(window.__shot); g.enterHole(); await sleep(400);
    if (window.__map) { g.hp.mapZoom = 0; }
    g.state.view = 'scout'; await sleep(1800);
  }
  return out.join('\n');
})()
