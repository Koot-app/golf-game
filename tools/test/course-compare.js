// The three career courses measured the same way, to check they get harder from tier 1 to tier 3 (user direction,
// 2026-11-20: the third course is the most difficult). Per course: length, the fairway's width and the tree line in
// the landing zone, the sand, the hazards, the greens (size, slope, speed), the wind and the out of bounds.
//   node tools/test/probe.js "http://127.0.0.1:8090/?nohome" - @tools/test/course-compare.js "0" compare
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 50 && !window.__golf; i++) await sleep(200);
  const g = window.__golf, YD = 0.9144, FT = 0.3048, out = [], rows = {};
  const avg = (a) => a.reduce((s, v) => s + v, 0) / Math.max(1, a.length), f = (v, n = 0) => v.toFixed(n);
  for (const t of [1, 2, 3]) {
    g.setCourse(t);
    const m = { yds: 0, par: 0, width: [], minWidth: [], treeLine: [], bunkers: 0, greenside: 0, depth: [], water: 0, fescue: 0, area: [], slope: [], steep: [], stimp: [], wind: [], ob: [], trees: [], narrowGreen: [] };
    for (let i = 0; i < g.HOLES.length; i++) {
      g.selectHole(i); await sleep(10);
      const h = g.hole, def = g.HOLE;
      m.yds += h.length / YD; m.par += def.par; m.stimp.push(def.stimp); m.wind.push(def.wind.mph); m.ob.push(h.ob / YD); m.trees.push(g.holeTrees.length);
      m.bunkers += h.dips.length; m.greenside += h.dips.filter((d) => d.type === 'bunker').length; h.dips.forEach((d) => m.depth.push(d.D / FT));
      m.water += h.water.length; m.fescue += h.fescue.length;
      if (def.par > 3) {                                   // the landing zone: 200 to 270 yds off the tee
        const w = [], tl = [];
        for (let s = 200 * YD; s <= 270 * YD; s += 5 * YD) { w.push((h.fw(s, 1) + h.fw(s, -1)) / YD); tl.push((h.fwBase(s, 1) + h.fwBase(s, -1)) / 2 / YD + (h.cut + h.treeGap) / YD); }
        m.width.push(avg(w)); m.minWidth.push(Math.min(...w)); m.treeLine.push(avg(tl));
      }
      // the green: its area, its average and steepest slope, and how narrow it is
      let n = 0, sl = 0, mx = 0; const gr = h.green, R = Math.max(gr.rx, gr.rz) * 1.4;
      for (let x = gr.x - R; x <= gr.x + R; x += 0.5) for (let z = gr.z - R; z <= gr.z + R; z += 0.5) {
        if (g.inEllipse(gr, x, z) >= 1) continue;
        const gd = h.surface.grad(x, z), s = Math.hypot(gd.x, gd.z); n++; sl += s; if (s > mx) mx = s;
      }
      m.area.push(n * 0.25 / (YD * YD)); m.slope.push(sl / n * 100); m.steep.push(mx * 100); m.narrowGreen.push(Math.min(gr.rx, gr.rz) * 2 / YD);
    }
    rows[t] = m;
  }
  g.setCourse(null);
  const line = (label, fn) => out.push(`${label.padEnd(46)} ${[1, 2, 3].map((t) => String(fn(rows[t])).padStart(12)).join('')}`);
  out.push(`${''.padEnd(46)} ${[1, 2, 3].map((t) => g.TIERS[t].course.replace(/ (Golf|Country) Club| Muni/, '').padStart(12)).join('')}`);
  line('par', (m) => m.par);
  line('yards (along the fairways)', (m) => f(m.yds));
  line('fairway width in the landing zone (yds, avg)', (m) => f(avg(m.width), 1));
  line('  narrowest landing zone', (m) => f(Math.min(...m.minWidth), 1));
  line('tree line from the centre there (yds)', (m) => f(avg(m.treeLine), 1));
  line('trees a hole', (m) => f(avg(m.trees)));
  line('bunkers (greenside)', (m) => `${m.bunkers} (${m.greenside})`);
  line('bunker depth, avg / deepest (ft)', (m) => `${f(avg(m.depth), 1)} / ${f(Math.max(...m.depth), 1)}`);
  line('ponds and creeks / fescue patches', (m) => `${m.water} / ${m.fescue}`);
  line('green area (sq yds, avg)', (m) => f(avg(m.area)));
  line('  narrowest green (yds across)', (m) => f(Math.min(...m.narrowGreen), 1));
  line('green slope, avg / steepest (%)', (m) => `${f(avg(m.slope), 1)} / ${f(Math.max(...m.steep), 1)}`);
  line('green speed (Stimp, avg)', (m) => f(avg(m.stimp), 1));
  line('wind (mph, avg / strongest)', (m) => `${f(avg(m.wind), 1)} / ${Math.max(...m.wind)}`);
  line('out of bounds from the centre line (yds)', (m) => f(avg(m.ob), 1));
  return out.join('\n');
})()
