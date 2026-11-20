// Swing audit S8: chipping and putting. Chips: computeImpact (stock or seeded) + runChip on flat ground of one surface,
// as chipTable does. Putts: computePutt + createPutt / stepPutt on makeSurface greens.
//   node tools/test/probe.js "http://127.0.0.1:8090/?nohome" - @tools/test/swing-short.js 0 swing-s8
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 50 && !window.__golf; i++) await sleep(200);
  const g = window.__golf, YD = 0.9144, FT = 0.3048, INCH = 0.0254, out = [], C = g.CLUBS, T = g.CHIP_TYPES, CH = g.CHIP, P = g.PUTT;
  const f = (v, n = 1) => (v === null || v === undefined || Number.isNaN(v) ? '—' : v.toFixed(n));
  const pad = (s, n) => String(s).padStart(n), padE = (s, n) => String(s).padEnd(n);
  const gauss = (rnd) => { let s = 0; for (let k = 0; k < 6; k++) s += rnd(); return (s - 3) / Math.sqrt(0.5); };
  const SW_ = { lw: 13, sw: 12, gw: 11, pw: 10, i9: 9, i7: 7 };
  const short = (n) => n.replace('Pitching Wedge', 'PW').replace('Gap Wedge', 'GW').replace('Sand Wedge', 'SW').replace('Lob Wedge', 'LW');
  // ---- chips
  const flat = (stimp = 11, key = 'green') => ({ decel: g.rollDecel(stimp), stimp, hole: { x: 0, z: -1e5 }, h: () => 0, grad: () => ({ x: 0, z: 0 }), surfAt: () => key, drag: () => (CH.surf[key] || CH.surf.fairway).drag });
  const chipSU = (k, extra = {}) => { const t = T[k]; return { face: t.face, ballPos: t.ballPos, stance: t.stance, traj: t.height, spinCtl: 0, align: { face: t.face, stance: t.stance, ballPos: t.ballPos }, flop: !!t.flop, ...extra }; };
  const env = (lie = 'fairway', dex = 5, stock = true) => ({ lie, slope: 'flat', power: 5, dex, composure: 5, badStreak: 0, teed: false, stock });
  const impact = (ci, su, bs, e = env(), rnd = () => 0.5, sw = {}) => g.computeImpact({ bs, ds: 1, thetaMouse: 0, sigma: 0, lateSign: 1, vImpact: 1, vPeak: 1, miss: 0, ...sw }, su, C[ci], e, rnd);
  const chip = (r, view = flat()) => { const fl = g.runChip(view, { ballSpeed: r.ballSpeed, vla: r.vla, dir: 0, spin: r.spin, axis: 0, release: 0 }); const carry = (fl.carry || 0) / YD, total = Math.hypot(fl.p.x, fl.p.z) / YD; return { carry, total, roll: total - carry }; };
  // the backswing that carries c yds for a club / type / lie (bisection on the stock chip)
  const bsFor = (ci, su, c, lie = 'fairway') => { let lo = 0.04, hi = 1.1; for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; if (chip(impact(ci, su, m, env(lie))).carry < c) lo = m; else hi = m; } return (lo + hi) / 2; };
  // ===================== 1. carry against roll
  out.push('1. CHIPS on a flat Stimp 11 green: carry → roll (yds) and roll ÷ carry, by club, shot type and backswing');
  for (const [k, ci] of [['i7', 7], ['i9', 9], ['pw', 10], ['gw', 11], ['sw', 12], ['lw', 13]]) {
    void k; const rows = [];
    for (const type of ['low', 'stock', 'high', 'flop']) {
      if (T[type].flop && C[ci].loft < CH.flopMinLoft) continue;
      const cells = [0.25, 0.35, 0.5, 0.65].map((bs) => { const x = chip(impact(ci, chipSU(type), bs)); return `${pad(f(x.carry, 1), 4)} → ${pad(f(x.roll, 1), 4)} (${f(x.roll / Math.max(0.1, x.carry), 1)})`; });
      rows.push(`      ${padE(T[type].name, 11)} ${cells.map((c) => padE(c, 21)).join('')}`);
    }
    out.push(`   ${short(C[ci].name)}  (backswing 25% · 35% · 50% · 65%)`, ...rows);
  }
  // ===================== 2. landing surfaces and the check
  out.push('', '2. WHERE IT LANDS (sand wedge stock chip carrying 10 yds; the same chip landing on each surface): roll in yds');
  { const bs = bsFor(12, chipSU('stock'), 10), r = impact(12, chipSU('stock'), bs);
    out.push('   ' + ['green', 'fringe', 'fairway', 'light', 'heavy', 'hardpan', 'bunker'].map((k) => `${k} ${f(chip(r, flat(11, k)).roll, 1)}`).join(' · '));
    for (const [n, su] of [['More spin', chipSU('stock', { spinCtl: 1 })], ['Less spin', chipSU('stock', { spinCtl: -1 })]]) { const r2 = impact(12, su, bsFor(12, su, 10)); out.push(`   ${n}: ${f(r2.spin, 0)} rpm (stock ${f(r.spin, 0)}), roll on the green ${f(chip(r2).roll, 1)}`); }
    out.push(`   the same chip at Stimp 9 / 11 / 13 / 14: roll ${[9, 11, 13, 14].map((s) => f(chip(r, flat(s)).roll, 1)).join(' / ')}`);
  }
  // ===================== 3. the landing read against what happens
  out.push('', '3. THE CHIP MARKER\'S READ against reality (sand wedge stock chip, marker at 12 yds carry, Dex 5, chip-sized human errors:',
    '   backswing ±5% bell, wobble 1–3 px, ring miss ±2% sd): the swing the read asks for, then 600 real chips with that swing');
  for (const lie of ['fairway', 'light', 'heavy', 'hardpan', 'bunker']) {
    const su = chipSU('stock'), bs = bsFor(12, su, 12, lie), rnd = g.rng32(777), cs = [], fl = {};
    for (let k = 0; k < 600; k++) { const r = g.computeImpact({ bs: bs * (1 + 0.05 * (rnd() + rnd() - 1)), ds: 1, thetaMouse: 1.2 * 2 * (rnd() + rnd() - 1), sigma: 1 + 2 * rnd(), lateSign: rnd() < 0.5 ? 1 : -1, vImpact: 1, vPeak: 1, miss: 0.02 * gauss(rnd) }, su, C[12], env(lie, 5, false), rnd); cs.push(chip(r).carry); for (const x of r.flags) fl[x] = (fl[x] || 0) + 1; }
    cs.sort((a, b) => a - b); const mean = cs.reduce((a, b) => a + b, 0) / cs.length, mult = ({ fairway: 1, light: 1.35, heavy: 1.8, hardpan: 1.2, bunker: 1.6 })[lie];
    const band = (per) => { const pf = (per - 1) / 9, half = (0.12 + (0.015 - 0.12) * pf) * mult; return `±${f(half * 100, 0)}%`; };
    const inside = (per) => { const pf = (per - 1) / 9, half = (0.12 + (0.015 - 0.12) * pf) * mult; return cs.filter((c) => Math.abs(c / 12 - 1) <= half).length / cs.length; };
    out.push(`   ${padE(g.LIES[lie].name, 17)} swing ${f(bs * 100, 0)}% · real carry ${f(mean, 1)} (10th–90th ${f(cs[60], 1)}–${f(cs[540], 1)}) · the read's band Per 1 / 5 / 10: ${band(1)} / ${band(5)} / ${band(10)} of the marker; real chips landing inside it ${[1, 5, 10].map((p) => f(inside(p) * 100, 0) + '%').join(' / ')}${Object.keys(fl).length ? ` · flags ${Object.entries(fl).map(([k2, v]) => `${k2.toLowerCase()} ${f(v / 6, 0)}%`).join(', ')}` : ''}`);
  }
  // ===================== 4. the flop
  out.push('', '4. THE FLOP (marker 10 yds carry): complexity, launch, carry → roll; and from hardpan, how often it is bladed or chunked (Dex 2 / 5, 600 chips)');
  for (const ci of [11, 12, 13]) {
    const su = chipSU('flop'), bs = bsFor(ci, su, 10), r = impact(ci, su, bs), x = chip(r), st = impact(ci, chipSU('stock'), bsFor(ci, chipSU('stock'), 10)), xs = chip(st);
    const hp = (dex, type) => { const s2 = chipSU(type), b2 = bsFor(ci, s2, 10, 'hardpan'), rnd = g.rng32(55); let bad = 0; for (let k = 0; k < 600; k++) { const rr = g.computeImpact({ bs: b2, ds: 1, thetaMouse: 0, sigma: 1 + 2 * rnd(), lateSign: rnd() < 0.5 ? 1 : -1, vImpact: 1, vPeak: 1, miss: 0.02 * gauss(rnd) }, s2, C[ci], env('hardpan', dex, false), rnd); if (rr.flags.includes('BLADED') || rr.flags.includes('CHUNKED')) bad++; } return f(bad / 6, 0) + '%'; };
    out.push(`   ${padE(short(C[ci].name), 4)} flop: cx ${f(r.complexity, 2)}, launch ${f(r.vla, 1)}°, swing ${f(bs * 100, 0)}%, ${f(x.carry, 1)} → ${f(x.roll, 1)} · stock: cx ${f(st.complexity, 2)}, launch ${f(st.vla, 1)}°, ${f(xs.carry, 1)} → ${f(xs.roll, 1)} · off hardpan, flop ${hp(2, 'flop')} / ${hp(5, 'flop')}, stock chip ${hp(2, 'stock')} / ${hp(5, 'stock')}`);
  }
  // ===================== 5. the hand-off at 45 yds
  out.push('', '5. THE HAND-OFF AT 45 YDS: the same launch as a chip (inside 45 yds: putting roll on the green, CHIP.surf bounce) and as a full shot',
    '   (outside: stepFlight\'s bounce, SURF roll), landing on a green and on a fairway');
  for (const ci of [10, 12, 13]) {
    for (const c of [30, 42]) {
      const su = chipSU('stock'), bs = bsFor(ci, su, c), r = impact(ci, su, bs), cells = [];
      for (const k of ['green', 'fairway']) {
        const a = chip(r, flat(11, k));
        const fl = g.createFlight({ ballSpeed: r.ballSpeed, vla: r.vla, dir: 0, spin: r.spin, axis: 0, release: 0, ground: () => g.SURF[k] }, { x: 0, z: 0 }, 0);
        for (let n = 0; fl.phase !== 'stopped' && n < 30000; n++) g.stepFlight(fl, 1 / 120);
        const fc = fl.carry / YD, ft = -fl.p.z / YD;
        cells.push(`${k}: chip ${f(a.carry, 1)} → +${f(a.roll, 1)} · full ${f(fc, 1)} → +${f(ft - fc, 1)}`);
      }
      out.push(`   ${padE(short(C[ci].name), 4)} ${c} yd carry (swing ${f(bs * 100, 0)}%): ${cells.join('   ')}`);
    }
  }
  out.push(`   the chip roll at Stimp 9 / 13 for the PW 42-yd chip: ${(() => { const su = chipSU('stock'), r = impact(10, su, bsFor(10, su, 42)); return [9, 13].map((s) => f(chip(r, flat(s)).roll, 1)).join(' / '); })()} (the full shot\'s green roll doesn't read the Stimp: S3.2)`);
  // ===================== 6. putts
  const putter = g.PUTTERS.blade, cfg = (stimp, scale) => ({ scaleFt: scale, stimp, composure: 5, badStreak: 0, dex: 5 });
  const pure = (len) => ({ thetaMouse: 0, excursion: 0, tempo: 1, sigma: 0, lateSign: 1, miss: 0, len });
  const roll = (green, res, aim = 0) => { const q = g.createPutt(green, res.v0, aim + res.start, res.skidFt); for (let n = 0; q.phase === 'roll' && n < 40000; n++) g.stepPutt(q, 1 / 240); return q; };
  const greenOf = (stimp, tilt, dFt) => { const s = g.makeSurface({ stimp, tilt, outline: { x: 0, z: -4, rx: 16.5, rz: 16.5 } }); return { ...s, hole: { x: 0, z: -dFt * FT }, tiltUsed: s.tilt }; };
  out.push('', '6. PUTTS');
  out.push('   a) pace on a flat green: a pure stroke of 50% on the Medium (40 ft) scale, at Stimp 9 / 11.5 / 13: ' + [9, 11.5, 13].map((st) => { const gr = greenOf(st, { x: 0, z: 0 }, 200), q = roll(gr, g.computePutt(pure(0.5), putter, cfg(st, 40))); return `${f(-q.p.z / FT, 1)} ft, start ${f(g.computePutt(pure(0.5), putter, cfg(st, 40)).v0, 2)} m/s`; }).join(' · ') + '  (the stroke sets the distance; the Stimp changes the speed it takes)');
  // b) break against a simple estimate
  out.push('   b) break: aimed straight at the hole with the pace to finish 1.5 ft past; how far it passes the hole (in), against the simple',
    '      estimate ½·(5/7)·g·slope·t² (t = time to reach the hole; no friction on the sideways part, so it runs a little high), and the aim that holes it');
  for (const st of [9, 11.5, 13]) {
    const cells = [];
    for (const [s, dFt] of [[0.01, 10], [0.02, 10], [0.01, 30], [0.02, 30]]) {     // (makeSurface caps the slope near the pin at PUTT.maxSlopeAtPin, 2.2%)
      const gr = greenOf(st, { x: s, z: 0 }, dFt), used = gr.tiltUsed.x, len = (dFt + P.diePastFt) / (dFt <= 11 ? 15 : 40), res = g.computePutt(pure(len), putter, cfg(st, dFt <= 11 ? 15 : 40));
      const q = g.createPutt(gr, res.v0, res.start, res.skidFt); let pass = null;
      for (let n = 0; q.phase === 'roll' && n < 40000; n++) { const z0 = q.p.z; g.stepPutt(q, 1 / 240); if (pass === null && z0 > gr.hole.z && q.p.z <= gr.hole.z) pass = q.p.x; }
      const a = gr.decel, v0 = res.v0, D = dFt * FT, tt = (v0 - Math.sqrt(Math.max(0, v0 * v0 - 2 * a * D))) / a, est = 0.5 * (5 / 7) * 9.81 * used * tt * tt;
      // the aim that holes it
      let holedAt = null; for (let aim = 0; aim <= 12 && holedAt === null; aim += 0.05) for (const sg of [1, -1]) { if (holedAt === null && roll(gr, res, sg * aim).holed) holedAt = aim; }
      cells.push(`${f(used * 100, 1)}% ${dFt} ft: ${pass === null ? 'short' : f(Math.abs(pass) / INCH, 1)} in (est ${f(est / INCH, 1)})${holedAt !== null ? `, holes aimed ${f(Math.tan(holedAt * Math.PI / 180) * D / INCH, 1)} in high` : ', never holes'}`);
    }
    out.push(`      Stimp ${st}: ${cells.join(' · ')}`);
  }
  // c) uphill and downhill
  out.push('   c) uphill / downhill (2%): a stroke for the flat distance (+1.5 ft) finishes this far past (+) or short (−) of the hole, and the flat distance that holes it vs puttTarget\'s "about" figure');
  for (const st of [9, 13]) {
    const cells = [];
    for (const [name, tz] of [['uphill', -0.02], ['downhill', 0.02]]) for (const dFt of [10, 30]) {
      const gr = greenOf(st, { x: 0, z: tz }, dFt), scale = dFt <= 11 ? 15 : 40, q = roll(gr, g.computePutt(pure((dFt + P.diePastFt) / scale), putter, cfg(st, scale)));
      const fin = (-q.p.z - dFt * FT) / FT;
      let need = null; for (let ft = 1; ft <= 80 && need === null; ft += 0.25) { const q2 = roll(gr, g.computePutt(pure(ft / scale), putter, cfg(st, scale))); if (q2.holed) need = ft; }
      const tgt = g.puttTarget({ ...gr, distFt: dFt });
      cells.push(`${name} ${dFt} ft: ${fin > 0 ? '+' : ''}${f(fin, 1)} ft · holes at ${need === null ? '—' : f(need, 1)} ft flat (puttTarget says ${f(tgt.playsFt, 1)})`);
    }
    out.push(`      Stimp ${st}: ${cells.join(' · ')}`);
  }
  // d) the cup
  out.push(`   d) the cup (captureSpeed ${P.captureSpeed} m/s centred, × √(1 − (offset/R)²)): the fastest ball that drops, by how far off centre it crosses the cup, and how far past it would have rolled at Stimp 11`);
  { const gr = greenOf(11, { x: 0, z: 0 }, 6), a = gr.decel, cells = [];
    for (const off of [0, 0.25, 0.5, 0.75, 0.9]) {
      let best = 0; for (let v = 0.3; v <= 3; v += 0.02) { const q = g.createPutt({ ...gr, hole: { x: off * 0.054, z: -6 * FT } }, v, 0, 0); for (let n = 0; q.phase === 'roll' && n < 40000; n++) g.stepPutt(q, 1 / 240); if (q.holed) best = v; }
      // the speed at the cup = what it started with minus 6 ft of friction
      const atCup = Math.sqrt(Math.max(0, best * best - 2 * a * (6 * FT - 0.054))); cells.push(`${f(off * 100, 0)}% off: ${f(atCup, 2)} m/s at the cup (${f(atCup * atCup / (2 * a) / FT, 1)} ft past)`);
    }
    out.push(`      ${cells.join(' · ')}`);
    // lip-outs from 6 ft with ordinary errors
    const rnd = g.rng32(4); let holed = 0, lips = 0; const N = 2000;
    for (let k = 0; k < N; k++) { const sw = { thetaMouse: 1.0 * gauss(rnd), excursion: Math.abs(0.03 * gauss(rnd)), tempo: 1 + 0.08 * gauss(rnd), sigma: 1 + 3 * rnd(), lateSign: rnd() < 0.5 ? 1 : -1, miss: 0, len: (6 + P.diePastFt) / 15 * (1 + 0.06 * gauss(rnd)) }; const res = g.computePutt(sw, putter, cfg(11, 15), rnd); const q = roll(gr, res); if (q.holed) holed++; else if (q.lip) lips++; }
    out.push(`      6 ft putts with ordinary errors (the blade, 2,000): holed ${f(holed / N * 100, 0)}%, lipped out ${f(lips / N * 100, 1)}%`);
  }
  // e) tilt: the gate narrows (knee-knocker)
  out.push('   e) tilt on the greens (blade, 6 and 10 ft, Composure 1 / 5 / 10, 0 / 2 / 4 bad shots): the gate, and % holed with ordinary errors');
  for (const comp of [1, 5, 10]) {
    const cells = [];
    for (const n of [0, 2, 4]) {
      const res6 = [6, 10].map((dFt) => { const gr = greenOf(11, { x: 0, z: 0 }, dFt), rnd = g.rng32(8 + dFt); let h = 0; const N = 1000; for (let k = 0; k < N; k++) { const sw = { thetaMouse: 1.0 * gauss(rnd), excursion: Math.abs(0.03 * gauss(rnd)), tempo: 1 + 0.08 * gauss(rnd), sigma: 1 + 3 * rnd(), lateSign: rnd() < 0.5 ? 1 : -1, miss: 0, len: (dFt + P.diePastFt) / 15 * (1 + 0.06 * gauss(rnd)) }; if (roll(gr, g.computePutt(sw, putter, { ...cfg(11, 15), composure: comp, badStreak: n }, rnd)).holed) h++; } return f(h / N * 100, 0) + '%'; });
      cells.push(`${n} bad: gate ${f(g.puttGate(putter, comp, n), 3)}, ${res6.join(' / ')}`);
    }
    out.push(`      Composure ${comp}: ${cells.join(' · ')}`);
  }
  // f) the marker read (design direction 13)
  out.push('   f) the putting marker (readMarker): code read; the band\'s half-width and the largest bias by Perception are listed in the findings');
  return out.join('\n');
})()
