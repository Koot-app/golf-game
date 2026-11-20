// Swing audit S2, follow-ups: how far spin stacks, strong lofts through the loft-reading rules, the driver off the deck,
// and the hardpan rule's threshold.
//   node tools/test/probe.js "http://127.0.0.1:8090/?nohome" - @tools/test/swing-impact2.js 0 swing-s2b
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 50 && !window.__golf; i++) await sleep(200);
  const g = window.__golf, T = g.TUNE, C = g.CLUBS, YD = 0.9144, out = [];
  const f = (v, n = 1) => (v === null || v === undefined || Number.isNaN(v) ? '—' : v.toFixed(n));
  const SW0 = { bs: 1, ds: 1, thetaMouse: 0, sigma: 0, lateSign: 1, vImpact: 1, vPeak: 1, miss: 0 }, SU0 = { face: 0, ballPos: 0, stance: 0, traj: 0, spinCtl: 0 };
  const ENV0 = { lie: 'fairway', slope: 'flat', power: 5, dex: 5, composure: 5, badStreak: 0 };
  const rng32 = (a) => () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  function shot(club, sw = {}, su = {}, env = {}, rnd = null) {
    club = typeof club === 'number' ? C[club] : club;
    const e = { ...ENV0, ...env }, teed = e.teed !== undefined ? e.teed : (!!club.tee && e.lie === 'fairway');
    const r = g.computeImpact({ ...SW0, ...sw }, { ...SU0, ...su }, club, { ...e, teed, stock: !rnd }, rnd || (() => 0.5));
    const fl = g.createFlight({ ballSpeed: r.ballSpeed, vla: r.vla, dir: r.hla, spin: r.spin, axis: r.axis, release: r.release }, { x: 0, z: 0 }, teed ? 0.04 : 0);
    for (let n = 0; fl.phase !== 'stopped' && n < 30000; n++) g.stepFlight(fl, 1 / 120);
    return { r, carry: fl.carry / YD, total: Math.hypot(fl.p.x, fl.p.z) / YD, side: fl.p.x / YD, apex: fl.apex / YD };
  }
  // ---- 1. spin stacking
  out.push('1. HOW FAR SPIN STACKS (stock swing, fairway): spin rpm · launch ° · apex yds · carry / total yds');
  for (const [ci, name] of [[7, '7 Iron'], [10, 'Pitching Wedge'], [12, 'Sand Wedge'], [13, 'Lob Wedge']]) {
    const rows = [['stock', {}], ['More spin', { spinCtl: 1 }], ['High 2', { traj: 2 }], ['High 2 + More spin', { traj: 2, spinCtl: 1 }], ['High 2 + ball forward + More spin', { traj: 2, ballPos: 1, spinCtl: 1 }]];
    out.push(`   ${name}: ` + rows.map(([n, su]) => { const x = shot(ci, {}, su); return `${n}: ${f(x.r.spin, 0)} · ${f(x.r.vla)} · ${f(x.apex, 0)} · ${f(x.carry, 0)}/${f(x.total, 0)}`; }).join('\n      '));
  }
  // ---- 2. a strong-lofted 7 iron: everything that reads the static loft
  out.push('', '2. A STRONG LOFT, STEP BY STEP (7 iron; the catalogue\'s strongest set takes 6° off the loft, adds 1.8° of dynamic loft and 1.5% of club speed)');
  const base = C[7], steps = [['the base 7 iron (34°)', {}], ['loft −6° only', { loft: base.loft - 6 }], ['+ dynamic loft +1.8°', { loft: base.loft - 6, dynLoft: base.dynLoft + 1.8 }], ['+ club speed ×1.015', { loft: base.loft - 6, dynLoft: base.dynLoft + 1.8, speed: base.speed * 1.015 }], ['+ spin ×0.92 (the full JPX 925 mods)', { loft: base.loft - 6, dynLoft: base.dynLoft + 1.8, speed: base.speed * 1.015, spin: base.spin * 0.92 }]];
  for (const [n, mod] of steps) {
    const club = { ...base, ...mod }, x = shot(club), auth = Math.min(1, Math.max(T.spinAuthMin, (club.loft - T.spinAuthLoLoft) / (T.spinAuthHiLoft - T.spinAuthLoLoft)));
    const fitH = g.clubFit(club, 'heavy', false), fitB = g.clubFit(club, 'bunker', false);
    out.push(`   ${n.padEnd(40)} smash ${f(x.r.smash, 3)} · ball ${f(x.r.ballSpeed)} · launch ${f(x.r.vla)}° · spin ${f(x.r.spin, 0)} · carry ${f(x.carry, 0)} / ${f(x.total, 0)} · spin authority ${f(auth, 2)} · misfit in heavy rough ${f(fitH.s, 2)}, in a bunker ${f(fitB.s, 2)}`);
  }
  // ---- 3. woods off the deck
  out.push('', '3. OFF THE DECK (fairway, not teed): ball mph · carry / total · complexity · mishit chance (topped or fat) · flags');
  for (const ci of [0, 1, 2]) { const x = shot(ci, {}, {}, { teed: false }), t = shot(ci); out.push(`   ${C[ci].name.padEnd(9)} ${f(x.r.ballSpeed)} · ${f(x.carry, 0)}/${f(x.total, 0)} (teed or stock: ${f(t.carry, 0)}/${f(t.total, 0)}) · ${f(x.r.complexity, 2)} · ${f(x.r.fit.mishit * 100, 0)}% · ${x.r.flags.join(', ') || '—'}`); }
  // ---- 4. the hardpan rule: a strike of 3 mm or more is a bladed or chunked shot
  out.push('', '4. HARDPAN: the strike, just under and just over the rule\'s 3 mm (7 iron, no scatter): ball mph · launch ° · carry / total · flags');
  const steady = 1.45 + (0.45 - 1.45) * (4 / 9), hp = (mm, rv) => shot(7, { sigma: mm / steady }, {}, { lie: 'hardpan' }, null), cx0 = shot(7, {}, {}, { lie: 'hardpan' }).r.complexity;
  // (the wobble is multiplied by 1 + 0.3 × complexity before it becomes the strike; allow for it)
  for (const mm of [2.0, 2.9, 3.1, 5.0]) { const x = hp(mm / (1 + T.cxWobble * cx0)); out.push(`   strike ${f(x.r.strike, 2)} mm: ${f(x.r.ballSpeed)} · ${f(x.r.vla)} · ${f(x.carry, 0)}/${f(x.total, 0)} · ${x.r.flags.join(', ') || '—'}`); }
  {
    // with the rule's own coin flip (the no-scatter path always takes the "chunked" side)
    const rnd = rng32(5); let bl = null, ch = null;
    for (let k = 0; k < 200 && (!bl || !ch); k++) {
      const r = g.computeImpact({ ...SW0, sigma: 4 / steady }, SU0, C[7], { ...ENV0, lie: 'hardpan', teed: false, dex: 5 }, rnd);
      if (r.flags.includes('BLADED') && !bl) bl = r; if (r.flags.includes('CHUNKED') && !ch) ch = r;
    }
    const fly = (r) => { const fl = g.createFlight({ ballSpeed: r.ballSpeed, vla: r.vla, dir: r.hla, spin: r.spin, axis: r.axis, release: r.release }, { x: 0, z: 0 }, 0); for (let n = 0; fl.phase !== 'stopped' && n < 30000; n++) g.stepFlight(fl, 1 / 120); return `${f(r.ballSpeed)} mph · launch ${f(r.vla)}° · spin ${f(r.spin, 0)} · ${f(fl.carry / YD, 0)}/${f(Math.hypot(fl.p.x, fl.p.z) / YD, 0)} yds`; };
    out.push(`   a BLADED 7 iron: ${bl ? fly(bl) : '—'} · a CHUNKED one: ${ch ? fly(ch) : '—'} · a clean one: ${fly(shot(7, {}, {}, { lie: 'hardpan' }).r)}`);
  }
  // ---- 5. the same hardpan rates with a steadier and a shakier hand
  out.push('', '5. HARDPAN, 7 iron: % of shots BLADED or CHUNKED, by how steady the hand is (wobble px) and Dexterity (4,000 shots each)');
  for (const wob of [0, 1.25, 2.5, 5]) {
    const cells = [1, 2, 5, 8, 10].map((dex) => {
      const rnd = rng32(900 + dex), bell = () => rnd() + rnd() - 1; let n = 0; const N = 4000;
      for (let k = 0; k < N; k++) { const r = g.computeImpact({ ...SW0, bs: 1 + 0.05 * bell(), thetaMouse: 2.4 * bell(), sigma: wob, lateSign: rnd() < 0.5 ? 1 : -1 }, SU0, C[7], { ...ENV0, lie: 'hardpan', dex, teed: false }, rnd); if (r.flags.includes('BLADED') || r.flags.includes('CHUNKED')) n++; }
      return `Dex ${dex}: ${f(n / N * 100, 0)}%`;
    });
    out.push(`   wobble ${f(wob, 2)} px: ${cells.join(' · ')}`);
  }
  return out.join('\n');
})()
