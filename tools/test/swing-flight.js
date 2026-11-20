// Swing audit S3: ball flight, wind, bounce and roll. Launch numbers go straight into createFlight / stepFlight (no
// impact model) unless a section says it uses the game's own stock shot.
//   node tools/test/probe.js "http://127.0.0.1:8090/?nohome" - @tools/test/swing-flight.js 0 swing-s3
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 50 && !window.__golf; i++) await sleep(200);
  const g = window.__golf, T = g.TUNE, C = g.CLUBS, YD = 0.9144, R2D = 180 / Math.PI, out = [];
  const f = (v, n = 1) => (v === null || v === undefined || Number.isNaN(v) ? '—' : v.toFixed(n));
  const pad = (s, n) => String(s).padStart(n), pct = (a, b) => `${a >= b ? '+' : ''}${f((a / b - 1) * 100)}%`;
  // fly a launch. o: { wind: {x,z}, y0, dt, ground: surface key or fn, release, sideLift, obstacle }
  function fly(L, o = {}) {
    const dt = o.dt || 1 / 120, surf = typeof o.ground === 'string' ? g.SURF[o.ground] : null;
    const fl = g.createFlight({ ...L, dir: L.dir || 0, axis: L.axis || 0, release: o.release || 0, ground: surf ? () => surf : (o.ground || null), obstacle: o.obstacle || null }, o.wind || { x: 0, z: 0 }, o.y0 || 0);
    if (o.sideLift !== undefined) fl.sideLift = o.sideLift;
    if (o.rnd) fl.rnd = o.rnd;
    let land = null, tAir = null, vLand = null, first = null, n = 0;
    while (fl.phase !== 'stopped' && n++ < 400000) {
      const vy = fl.v.y, vh = Math.hypot(fl.v.x, fl.v.z), had = fl.carry !== null, b0 = fl.bounces;
      g.stepFlight(fl, dt);
      if (!had && fl.carry !== null) { land = Math.atan2(-vy, vh) * R2D; tAir = fl.t; vLand = Math.hypot(vy, vh); }
      if (b0 === 0 && fl.bounces === 1) first = { vhBefore: vh, vhAfter: Math.hypot(fl.v.x, fl.v.z) * Math.sign(fl.v.z * -1 || 1), back: fl.v.z > 0 };
    }
    return { carry: fl.carry / YD, total: -fl.p.z / YD, dist: Math.hypot(fl.p.x, fl.p.z) / YD, side: fl.p.x / YD, sideLand: fl.land ? fl.land.x / YD : 0, apex: fl.apex / YD, land, tAir, t: fl.t, vLand, bounces: fl.bounces, first, hits: fl.treeHits || 0, fl };
  }
  const SW0 = { bs: 1, ds: 1, thetaMouse: 0, sigma: 0, lateSign: 1, vImpact: 1, vPeak: 1, miss: 0 }, SU0 = { face: 0, ballPos: 0, stance: 0, traj: 0, spinCtl: 0 };
  const stock = (ci, su = {}) => { const club = C[ci], teed = !!club.tee; const r = g.computeImpact(SW0, { ...SU0, ...su }, club, { lie: 'fairway', slope: 'flat', power: 5, dex: 5, composure: 5, badStreak: 0, teed, stock: true }, () => 0.5); return { L: { ballSpeed: r.ballSpeed, vla: r.vla, spin: r.spin, axis: r.axis, dir: r.hla }, release: r.release, y0: teed ? 0.04 : 0 }; };

  // =========================== A. the tour table, row by row ===========================
  const PGA = [['Driver', 167, 10.9, 2686, 32, 38, 275], ['3 wood', 158, 9.2, 3655, 30, 43, 243], ['5 wood', 152, 9.4, 4350, 31, 47, 230], ['Hybrid', 146, 10.2, 4437, 29, 47, 225], ['3 iron', 142, 10.4, 4630, 27, 46, 212], ['4 iron', 137, 11.0, 4836, 28, 48, 203],
    ['5 iron', 132, 12.1, 5361, 31, 49, 194], ['6 iron', 127, 14.1, 6231, 30, 50, 183], ['7 iron', 120, 16.3, 7097, 32, 50, 172], ['8 iron', 115, 18.1, 7998, 31, 50, 160], ['9 iron', 109, 20.4, 8647, 30, 51, 148], ['PW', 102, 24.2, 9304, 29, 52, 136]];
  const LPGA = [['LPGA driver', 140, 13.2, 2611, 25, 37, 218], ['LPGA 7 iron', 104, 19.0, 6699, 26, 47, 141], ['LPGA PW', 86, 25.6, 8403, 23, 48, 107]];
  out.push('A. THE TOUR TABLE FLOWN BY THE GAME (ball speed, launch and spin in; no wind). game / tour',
    '   row            ball mph  launch  spin     carry yds            apex yds          landing angle     air time');
  for (const [name, bs, vla, spin, apex, land, carry] of [...PGA, ...LPGA]) {
    const x = fly({ ballSpeed: bs, vla, spin });
    out.push(`   ${name.padEnd(13)} ${pad(bs, 5)}    ${pad(f(vla), 5)}  ${pad(spin, 5)}    ${pad(f(x.carry, 0), 4)} / ${pad(carry, 3)} (${pct(x.carry, carry)})   ${pad(f(x.apex, 0), 3)} / ${pad(apex, 2)} (${pct(x.apex, apex)})   ${pad(f(x.land, 0), 3)}° / ${land}°         ${f(x.tAir)} s`);
  }

  // =========================== B. step size ===========================
  out.push('', 'B. STEP SIZE: carry and total (yds) of four launches at different time steps (the game uses 1/120 s everywhere)',
    '   launch            1/30 s           1/60 s           1/120 s          1/240 s          1/1000 s');
  for (const [name, bs, vla, spin] of [PGA[0], PGA[8], PGA[11], ['half wedge', 45, 30, 5000]])
    out.push(`   ${name.padEnd(13)}   ` + [30, 60, 120, 240, 1000].map((h) => { const x = fly({ ballSpeed: bs, vla, spin }, { dt: 1 / h }); return `${f(x.carry, 1)} / ${f(x.total, 1)}`.padEnd(17); }).join(''));

  // =========================== C. a tilted spin axis ===========================
  out.push('', 'C. A TILTED SPIN AXIS (fade; a draw mirrors it): carry · sideways at landing · finish sideways · apex · air time.',
    '   The usual rule: about 0.7 yds of curve per degree of tilt per 100 yds of carry (in brackets).',
    '   "no boost" = the same launch without the game\'s extra lift for a curving ball (sideLift)');
  for (const [name, bs, vla, spin] of [PGA[0], PGA[8], PGA[11]]) {
    out.push(`   ${name} (${bs} mph, ${vla}°, ${spin} rpm):`);
    for (const axis of [0, 5, 10, 20, 30, 40, 60]) {
      const x = fly({ ballSpeed: bs, vla, spin, axis }), y = fly({ ballSpeed: bs, vla, spin, axis }, { sideLift: 1 });
      out.push(`      tilt ${pad(axis, 2)}°: carry ${pad(f(x.carry, 0), 4)} · at landing ${pad(f(x.sideLand), 5)} (rule ${pad(f(0.007 * axis * x.carry), 5)}) · finishes ${pad(f(x.side), 5)} · apex ${pad(f(x.apex, 0), 3)} · ${f(x.tAir)} s   | no boost: carry ${pad(f(y.carry, 0), 4)}, at landing ${pad(f(y.sideLand), 5)}, apex ${pad(f(y.apex, 0), 3)}`);
    }
  }

  // =========================== D. wind ===========================
  out.push('', 'D. WIND (the game\'s stock driver, 7 iron and sand wedge; fairway). Change in carry (yds, %) for head and tail; sideways drift at landing for a crosswind');
  const shots = [['Driver', stock(0)], ['Driver, Low 2', stock(0, { traj: -2 })], ['7 Iron', stock(7)], ['7 Iron, Low 2', stock(7, { traj: -2 })], ['7 Iron, High 2', stock(7, { traj: 2 })], ['Sand Wedge', stock(12)]];
  for (const [name, s] of shots) {
    const base = fly(s.L, { y0: s.y0, release: s.release });
    out.push(`   ${name} (calm: carry ${f(base.carry, 0)}, apex ${f(base.apex, 0)}, ${f(base.tAir)} s in the air):`);
    for (const mph of [5, 10, 20]) {
      const h = fly(s.L, { y0: s.y0, release: s.release, wind: g.windVector(mph, 0) }), t = fly(s.L, { y0: s.y0, release: s.release, wind: g.windVector(mph, 180) }), c = fly(s.L, { y0: s.y0, release: s.release, wind: g.windVector(mph, 90) });
      out.push(`      ${pad(mph, 2)} mph: head ${pad(f(h.carry - base.carry, 0), 4)} (${pct(h.carry, base.carry)}) · tail ${pad('+' + f(t.carry - base.carry, 0), 4)} (${pct(t.carry, base.carry)}) · head costs ${f((base.carry - h.carry) / Math.max(0.1, t.carry - base.carry), 1)}× what tail gains · cross (from the right): ${f(Math.abs(c.sideLand))} yds ${c.sideLand < 0 ? 'left' : 'right'}, carry ${pad(f(c.carry - base.carry, 0), 3)}`);
    }
  }
  out.push(`   wind strength by height (× the stated wind): ` + [0.5, 2, 5, 10, 15, 20, 30, 40].map((y) => `${y} m ×${f(Math.min(1.25, Math.max(0.5, Math.pow(Math.max(y, 0.5) / 15, 0.18))), 2)}`).join(' · '));

  // =========================== E. bounce and roll, by club and surface ===========================
  out.push('', 'E. BOUNCE AND ROLL (the game\'s stock shots): landing angle and speed, spin at landing, then for each surface: speed kept through the first bounce → roll-out in yds (− = it comes back)');
  const surfs = ['fairway', 'green', 'light', 'heavy', 'hardpan', 'fbunker'];
  out.push(`   club               carry  land°  m/s   spin    ` + surfs.map((s) => s.padEnd(16)).join(''));
  for (const ci of [0, 1, 3, 5, 7, 9, 10, 12, 13]) {
    const s = stock(ci), b = fly(s.L, { y0: s.y0, release: s.release });
    const cells = surfs.map((sf) => { const x = fly(s.L, { y0: s.y0, release: s.release, ground: sf }); const kept = x.first ? (x.first.back ? -1 : 1) * Math.abs(x.first.vhAfter) / x.first.vhBefore * 100 : NaN; return `${f(kept, 0)}% → ${f(x.total - x.carry, 1)}`.padEnd(16); });
    out.push(`   ${C[ci].name.padEnd(16)}  ${pad(f(b.carry, 0), 4)}  ${pad(f(b.land, 0), 4)}  ${pad(f(b.vLand, 0), 4)}  ${pad(f(b.fl.rpm, 0), 1) && pad(f(s.L.spin * Math.exp(-b.tAir / g.AERO.spinTau), 0), 6)}   ${cells.join('')}`);
  }
  out.push('   high-spin wedge shots onto a green (does it back up?): ' + [[12, { spinCtl: 1 }, 'SW More spin'], [12, { traj: 2 }, 'SW High 2'], [12, { traj: 2, spinCtl: 1 }, 'SW High 2 + More'], [10, { traj: 2, spinCtl: 1 }, 'PW High 2 + More'], [13, { traj: 2, spinCtl: 1 }, 'LW High 2 + More']].map(([ci, su, n]) => { const s = stock(ci, su), x = fly(s.L, { ground: 'green' }); return `${n}: ${f(s.L.spin, 0)} rpm, carry ${f(x.carry, 0)}, roll ${f(x.total - x.carry, 1)}`; }).join(' · '));
  // green speed: a full shot's roll on the green against the putting model
  const FT = 0.3048, putDecel = (stimp) => g.PUTT.stimpRelease ** 2 / (2 * stimp * FT);
  out.push(`   rolling friction (m/s²): a full shot on the fairway ${f(T.rollDecel, 2)} · a full shot on any green ${f(T.rollDecel * g.SURF.green.roll, 2)} · a putt or chip on a green at Stimp 9 / 10.5 / 11.5 / 12.5 / 14: ${[9, 10.5, 11.5, 12.5, 14].map((s) => f(putDecel(s), 2)).join(' / ')}`);

  // =========================== F. draws roll, fades stop: the ground part ===========================
  out.push('', 'F. THE SHAPE\'S EFFECT ON THE GROUND ONLY (same launch; release +1 = a full draw, −1 = a full fade): carry → total on a fairway');
  for (const ci of [0, 3, 7, 10]) { const s = stock(ci); out.push(`   ${C[ci].name.padEnd(15)} ` + [1, 0.5, 0, -0.5, -1].map((rel) => { const x = fly(s.L, { y0: s.y0, release: rel }); return `${rel > 0 ? 'draw' : rel < 0 ? 'fade' : 'straight'} ${Math.abs(rel) || ''}: ${f(x.carry, 0)} → ${f(x.total, 0)} (roll ${f(x.total - x.carry, 1)})`; }).join(' · ')); }

  // =========================== G. odd starts and endings ===========================
  out.push('', 'G. ODD CASES');
  { const s = stock(0); out.push(`   teed 4 cm against off the ground (driver): carry ${f(fly(s.L, { y0: 0.04 }).carry, 1)} against ${f(fly(s.L, { y0: 0 }).carry, 1)}`); }
  { const a = fly({ ballSpeed: 165, vla: 3, spin: 1500 }, { ground: 'hardpan' }), b = fly({ ballSpeed: 180, vla: 10.7, spin: 2600 }, { ground: 'hardpan', wind: g.windVector(25, 180) }), c = fly({ ballSpeed: 60, vla: 2.5, spin: 800 }, { ground: 'green' });
    out.push(`   a low skimmer on hardpan (165 mph, 3°): ${a.bounces} bounces, ${f(a.t)} s, ${f(a.total, 0)} yds · a 180 mph drive downwind (25 mph) onto hardpan: ${b.bounces} bounces, ${f(b.t)} s, ${f(b.total, 0)} yds · a topped shot onto a green: ${c.bounces} bounces, ${f(c.t)} s, ${f(c.total, 0)} yds (the cap is 30 s)`); }
  { const x = fly({ ballSpeed: 120, vla: 16.3, spin: 7097 }, { ground: 'green' }); out.push(`   the stop rule: the ball is "stopped" below 0.15 m/s; at the fairway's friction that last crawl would be ${f(0.15 ** 2 / (2 * T.rollDecel) * 100, 1)} cm (green: ${f(0.15 ** 2 / (2 * T.rollDecel * g.SURF.green.roll) * 100, 1)} cm)`); void x; }

  // =========================== H. trees ===========================
  out.push('', 'H. TREES (hole 1 of the plain course)');
  g.selectHole(0); g.enterHole(); await sleep(400);
  const trees = g.holeTrees, hs = trees.map((t) => t.h).sort((a, b) => a - b);
  out.push(`   ${trees.length} trees · height ${f(hs[0])}–${f(hs[hs.length - 1])} m (median ${f(hs[hs.length >> 1])}) · a solid cone to the ground, ${f(hs[0] * 0.6)}–${f(hs[hs.length - 1] * 0.6)} m wide at the base`);
  out.push(`   a step at 1/120 s: ${f(167 * 0.44704 / 120, 2)} m at driver ball speed, ${f(120 * 0.44704 / 120, 2)} m for a 7 iron`);
  {
    // fire balls straight at a tree, from 60 m out, at different heights through the cone: is every pass that goes through it caught?
    const t = trees.reduce((a, b) => (Math.abs(b.h - 15) < Math.abs(a.h - 15) ? b : a), trees[0]);
    const rows = [];
    for (const frac of [0.05, 0.3, 0.6, 0.8, 0.9, 0.95, 0.98]) {
      const y = t.h * frac, rAt = t.r * (1 - frac); let hit = 0, n = 0;
      for (let k = 0; k < 400; k++) {
        const off = (k / 400 * 2 - 1) * rAt * 0.98, chord = 2 * Math.sqrt(Math.max(0, rAt * rAt - off * off));
        // a level pass at height y, 74 m/s, starting at a random phase before the tree
        const fl = g.createFlight({ ballSpeed: 165, vla: 0, dir: 0, spin: 0, axis: 0, obstacle: (x, yy, z) => g.treeAt(t.x + off + x, yy, t.z + 30 + z) }, { x: 0, z: 0 }, y);
        fl.p.z = -(Math.random() * 0.7); fl.v.y = 0;
        for (let i = 0; i < 90 && !fl.treeHits; i++) { fl.v.y = 0; fl.p.y = y; g.stepFlight(fl, 1 / 120); }
        n++; if (fl.treeHits) hit++; void chord;
      }
      rows.push(`${f(frac * 100, 0)}% up (cone ${f(rAt * 2, 1)} m across): ${f(hit / n * 100, 0)}%`);
    }
    out.push(`   a ball at driver speed passing through a ${f(t.h)} m tree, caught at each height: ${rows.join(' · ')}`);
    // what a hit does: a 7 iron flown into the tree at mid height, 3,000 times
    const N = 3000; let back = 0, under = 0, sumD = 0, far = 0, fwd = 0; const ds = [];
    for (let k = 0; k < N; k++) {
      const fl = g.createFlight({ ballSpeed: 120, vla: 16.3, dir: 0, spin: 7097, axis: 0, obstacle: (x, yy, z) => g.treeAt(t.x + x, yy, t.z + 55 + z) }, { x: 0, z: 0 }, 0);
      let n = 0; while (fl.phase !== 'stopped' && n++ < 30000) g.stepFlight(fl, 1 / 120);
      if (!fl.treeHits) continue;
      const dx = fl.p.x, dz = fl.p.z + 55, d = Math.hypot(dx, dz);     // from the tree's foot
      ds.push(d); sumD += d; if (d < t.r) under++; if (dz > 0) back++; if (d > 30) far++; if (dz < -t.r) fwd++;
    }
    ds.sort((a, b) => a - b);
    out.push(`   a 7 iron flown into the middle of it (${ds.length} hits of ${N}): the ball finishes ${f(ds[ds.length >> 1])} m from the trunk (median; 90% within ${f(ds[Math.floor(ds.length * 0.9)])} m, the farthest ${f(ds[ds.length - 1])} m) · under its own branches ${f(under / ds.length * 100, 0)}% · on the player's side of the trunk ${f(back / ds.length * 100, 0)}% · past the tree ${f(fwd / ds.length * 100, 0)}%`);
  }
  g.leaveHole();
  return out.join('\n');
})()
