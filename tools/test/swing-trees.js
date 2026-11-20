// Swing audit S3: trees, one tree at a time (the same cone test as the game's treeAt, on a single tree, so the rest of
// the forest doesn't get in the way), using the game's own stepFlight and treeDeflect.
//   node tools/test/probe.js "http://127.0.0.1:8090/?nohome" - @tools/test/swing-trees.js 0 swing-s3t
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 50 && !window.__golf; i++) await sleep(200);
  const g = window.__golf, YD = 0.9144, out = [];
  const f = (v, n = 1) => (v === null || v === undefined || Number.isNaN(v) ? '—' : v.toFixed(n));
  const rng32 = (a) => () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const H = 15, R = H * 0.3;                              // a median tree: 15 m tall, 9 m across at the ground
  // the tree stands at (tx, tz) in the flight's own frame (the ball starts at 0, 0 and flies toward −z)
  const cone = (tx, tz) => (x, y, z) => { if (y > H || y < -0.5) return -1; const r = R * (1 - Math.max(0, y) / H), dx = x - tx, dz = z - tz; return dx * dx + dz * dz < r * r ? 0 : -1; };
  // ---- 1. is a ball that passes through the cone always caught?
  const rnd = rng32(42);
  out.push('1. A BALL PASSING THROUGH ONE TREE (15 m tall): % of passes caught, by height and by how much of the cone the path crosses',
    '   (a level pass at the given speed; the game checks the ball once every 1/120 s)');
  for (const [mph, name] of [[167, 'driver speed off the face (0.62 m a step)'], [80, 'a ball late in its flight, 80 mph (0.30 m a step)']]) {
    const rows = [];
    for (const frac of [0.3, 0.8, 0.9, 0.95, 0.98]) {
      const y = H * frac, rAt = R * (1 - frac); let hit = 0, n = 0, clipHit = 0, clipN = 0;
      for (let k = 0; k < 2000; k++) {
        const off = (rnd() * 2 - 1) * rAt, chord = 2 * Math.sqrt(Math.max(0, rAt * rAt - off * off));
        const fl = g.createFlight({ ballSpeed: mph, vla: 0, dir: 0, spin: 0, axis: 0, obstacle: cone(off, -20) }, { x: 0, z: 0 }, y);
        fl.p.z = -rnd() * 0.7;
        for (let i = 0; i < 120 && !fl.treeHits && fl.p.z > -30; i++) { fl.v.y = 0; fl.p.y = y; g.stepFlight(fl, 1 / 120); }
        n++; if (fl.treeHits) hit++;
        if (chord < 0.5) { clipN++; if (fl.treeHits) clipHit++; }
      }
      rows.push(`${f(frac * 100, 0)}% up (${f(rAt * 2, 1)} m across): ${f(hit / n * 100, 0)}%${clipN ? ` (paths crossing under 0.5 m of it: ${f(clipHit / clipN * 100, 0)}%)` : ''}`);
    }
    out.push(`   ${name}: ${rows.join(' · ')}`);
  }
  // ---- 2. what a hit does
  out.push('', '2. WHAT A HIT DOES (3,000 shots each, flown at one 15 m tree; where the ball finishes, measured from the trunk)');
  const cases = [['a 7 iron from 25 m short of the tree (it meets the tree about 7 m up)', { ballSpeed: 120, vla: 16.3, spin: 7097 }, 25],
    ['a drive from 60 m short (about 10 m up)', { ballSpeed: 167, vla: 10.9, spin: 2686 }, 60],
    ['a wedge from 12 m short (about 6 m up)', { ballSpeed: 82, vla: 31, spin: 10100 }, 12]];
  for (const [name, L, d] of cases) {
    const N = 3000, ds = [], r2 = rng32(7); let back = 0, under = 0, fwd = 0, hits = 0, side = 0, hitY = 0;
    const clean = (() => { const fl = g.createFlight({ ...L, dir: 0, axis: 0 }, { x: 0, z: 0 }, 0); let n = 0; while (fl.phase !== 'stopped' && n++ < 30000) g.stepFlight(fl, 1 / 120); return -fl.p.z; })();
    for (let k = 0; k < N; k++) {
      const off = (r2() * 2 - 1) * 1.5;                   // within 1.5 m of the trunk's line
      const fl = g.createFlight({ ...L, dir: 0, axis: 0, obstacle: cone(off, -d) }, { x: 0, z: 0 }, 0); fl.rnd = r2;
      let n = 0, y0 = null; while (fl.phase !== 'stopped' && n++ < 30000) { const h0 = fl.treeHits || 0; g.stepFlight(fl, 1 / 120); if (!h0 && fl.treeHits) y0 = fl.p.y; }
      if (!fl.treeHits) continue;
      hits++; hitY += y0;
      const dx = fl.p.x - off, dz = fl.p.z + d, dist = Math.hypot(dx, dz);
      ds.push(dist); if (dist < R) under++; if (dz > R) back++; if (dz < -R) fwd++; if (Math.abs(dx) > R && Math.abs(dz) <= R) side++;
    }
    ds.sort((a, b) => a - b);
    out.push(`   ${name}: caught ${f(hits / N * 100, 0)}% (at ${f(hitY / Math.max(1, hits))} m up) · without the tree it would go ${f(clean / YD, 0)} yds`,
      `      finishes ${f(ds[ds.length >> 1])} m from the trunk (median) · 90% within ${f(ds[Math.floor(ds.length * 0.9)])} m · farthest ${f(ds[ds.length - 1])} m`,
      `      under the tree's own branches ${f(under / hits * 100, 0)}% · beyond it ${f(fwd / hits * 100, 0)}% · back toward the player ${f(back / hits * 100, 0)}% · out to the side ${f(side / hits * 100, 0)}%`);
  }
  return out.join('\n');
})()
