// Swing audit S2: the impact model (computeImpact). Exact swing numbers go straight into computeImpact (no mouse), with
// no scatter unless a section says so, and the launch is flown with the game's own flight.
//   node tools/test/probe.js "http://127.0.0.1:8090/?nohome" - @tools/test/swing-impact.js 0 swing-s2
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 50 && !window.__golf; i++) await sleep(200);
  const g = window.__golf, T = g.TUNE, C = g.CLUBS, D2R = Math.PI / 180, YD = 0.9144, out = [];
  const f = (v, n = 1) => (v === null || v === undefined || Number.isNaN(v) ? '—' : v.toFixed(n));
  const pad = (s, n) => String(s).padStart(n);
  const SW0 = { bs: 1, ds: 1, thetaMouse: 0, sigma: 0, lateSign: 1, vImpact: 1, vPeak: 1, miss: 0 };
  const SU0 = { face: 0, ballPos: 0, stance: 0, traj: 0, spinCtl: 0 };
  const ENV0 = { lie: 'fairway', slope: 'flat', power: 5, dex: 5, composure: 5, badStreak: 0 };
  const rng32 = (a) => () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  // one shot: club (index or object), swing, setup, conditions; stock = no scatter. Returns the impact numbers and the flight.
  function shot(club, sw = {}, su = {}, env = {}, rnd = null) {
    club = typeof club === 'number' ? C[club] : club;
    const e = { ...ENV0, ...env }, teed = e.teed !== undefined ? e.teed : (!!club.tee && e.lie === 'fairway');
    const r = g.computeImpact({ ...SW0, ...sw }, { ...SU0, ...su }, club, { ...e, teed, stock: !rnd }, rnd || (() => 0.5));
    const fl = g.createFlight({ ballSpeed: r.ballSpeed, vla: r.vla, dir: r.hla, spin: r.spin, axis: r.axis, release: r.release }, { x: 0, z: 0 }, teed ? 0.04 : 0);
    for (let n = 0; fl.phase !== 'stopped' && n < 30000; n++) g.stepFlight(fl, 1 / 120);
    return { r, carry: fl.carry / YD, total: Math.hypot(fl.p.x, fl.p.z) / YD, side: fl.p.x / YD, apex: fl.apex / YD };
  }
  const line = (x) => `${pad(f(x.r.ballSpeed), 6)} ${pad(f(x.r.vla), 5)} ${pad(f(x.r.spin, 0), 6)} ${pad(f(x.r.hla), 6)} ${pad(f(x.r.axis), 6)} ${pad(f(x.r.strike), 6)} ${pad(f(x.r.complexity, 2), 5)} ${pad(f(x.carry, 0), 5)} ${pad(f(x.total, 0), 5)} ${pad(f(x.side), 6)}  ${x.r.flags.join(', ')}`;

  // =========================== A. one input at a time ===========================
  out.push('A. ONE INPUT AT A TIME (no scatter; all stats 5 unless changed)',
    '   columns: ball mph · launch ° · spin rpm · start ° (+ right) · spin axis ° (+ fade) · strike mm (+ toe) · complexity · carry · total · finish side yds (+ right) · flags');
  const variations = [
    ['stock', {}, {}, {}],
    ['backswing 75%', { bs: 0.75 }, {}, {}], ['backswing 110%', { bs: 1.10 }, {}, {}],
    ['tempo 50%', { ds: 0.5, vImpact: 0.5, vPeak: 0.5 }, {}, {}], ['tempo 115%', { ds: 1.15 }, {}, {}],
    ['mouse path +5° (in-to-out)', { thetaMouse: 5 }, {}, {}],
    ['face +2° (open)', {}, { face: 2 }, {}], ['stance +2° (closed)', {}, { stance: 2 }, {}],
    ['ball position +1 (forward)', {}, { ballPos: 1 }, {}], ['ball position −1 (back)', {}, { ballPos: -1 }, {}],
    ['height Low 2', {}, { traj: -2 }, {}], ['height Low 1', {}, { traj: -1 }, {}], ['height High 1', {}, { traj: 1 }, {}], ['height High 2', {}, { traj: 2 }, {}],
    ['more spin', {}, { spinCtl: 1 }, {}], ['less spin', {}, { spinCtl: -1 }, {}],
    ['wobble 5 px', { sigma: 5 }, {}, {}], ['ring misses by 10%', { miss: 0.10 }, {}, {}],
    ['decel (impact at 40% of peak speed)', { vImpact: 0.4, vPeak: 1 }, {}, {}],
    ['light rough', {}, {}, { lie: 'light' }], ['heavy rough', {}, {}, { lie: 'heavy' }], ['hardpan', {}, {}, { lie: 'hardpan' }],
    ['fairway bunker', {}, {}, { lie: 'fbunker' }], ['greenside bunker', {}, {}, { lie: 'bunker' }],
    ['ball above feet', {}, {}, { slope: 'above' }], ['ball below feet', {}, {}, { slope: 'below' }], ['uphill', {}, {}, { slope: 'up' }], ['downhill', {}, {}, { slope: 'down' }],
    ['Power 1', {}, {}, { power: 1 }], ['Power 10', {}, {}, { power: 10 }],
    ['Dexterity 1', {}, {}, { dex: 1 }], ['Dexterity 10', {}, {}, { dex: 10 }],
    ['tilted (2 bad shots in a row)', {}, {}, { badStreak: 2 }],
  ];
  for (const [ci, name] of [[0, 'DRIVER (teed)'], [7, '7 IRON'], [12, 'SAND WEDGE']]) {
    out.push(`   ${name}`, `   ${''.padEnd(38)}   ball   vla   spin  start   axis strike    cx carry total   side`);
    for (const [vn, sw, su, env] of variations) out.push(`   ${vn.padEnd(38)} ${line(shot(ci, sw, su, env))}`);
  }

  // =========================== B. the base bag against the tour benchmark ===========================
  const BENCH = { Driver: [113, 167, 1.48, 10.9, 2686], '3 Wood': [107, 158, 1.48, 9.2, 3655], '2 Hybrid': [100, 146, 1.46, 10.2, 4437], '3 Hybrid': [98, 142, 1.45, 10.4, 4630], '4 Iron': [96, 137, 1.43, 11.0, 4836],
    '5 Iron': [94, 132, 1.41, 12.1, 5361], '6 Iron': [92, 127, 1.38, 14.1, 6231], '7 Iron': [90, 120, 1.33, 16.3, 7097], '8 Iron': [87, 115, 1.32, 18.1, 7998], '9 Iron': [85, 109, 1.28, 20.4, 8647], 'Pitching Wedge': [83, 102, 1.23, 24.2, 9304] };
  out.push('', 'B. IMPACT NUMBERS AGAINST THE TOUR TABLE (stock swing, all stats 5). game / tour (the hybrids against the tour "hybrid" and "3 iron" rows)',
    '   club              club mph      ball mph      smash         launch °      spin rpm');
  for (let i = 0; i < 14; i++) {
    const x = shot(i), b = BENCH[C[i].name] || [];
    const c = (v, bv, n) => `${f(v, n)}${bv !== undefined ? ` / ${f(bv, n)}` : ''}`.padEnd(14);
    out.push(`   ${C[i].name.padEnd(16)}  ${c(x.r.clubSpeed, b[0], 0)}${c(x.r.ballSpeed, b[1], 0)}${c(x.r.smash, b[2], 2)}${c(x.r.vla, b[3], 1)}${c(x.r.spin, b[4], 0)}`);
  }

  // =========================== C. start direction and spin axis ===========================
  out.push('', 'C. START DIRECTION AND CURVE: a 2° open face on a straight path, and a square face on a 2° out-to-in path (both face-to-path +2°)',
    '   The D-plane estimate of the axis tilt per degree is atan(tan(1°) / tan(spin loft)), spin loft = dynamic loft − attack angle.',
    '   club              spin loft   axis °/° (game)   (D-plane)   | open face 2°: start °, finish yds   | path −2°: start °, finish yds   | share of start from the face');
  for (let i = 0; i < 14; i++) {
    const a = shot(i, {}, { face: 2 }), b = shot(i, {}, { stance: -2 }), sl = C[i].dynLoft - C[i].aoa;
    const dpl = Math.atan(Math.tan(1 * D2R) / Math.tan(sl * D2R)) / D2R;
    out.push(`   ${C[i].name.padEnd(16)}  ${pad(f(sl), 5)}°      ${pad(f(a.r.axis / 2, 2), 5)}            ${pad(f(dpl, 2), 5)}       |  ${pad(f(a.r.hla, 2), 5)}°, ${pad(f(a.side), 6)}              |  ${pad(f(b.r.hla, 2), 5)}°, ${pad(f(b.side), 6)}           |  ${f(a.r.hla / 2 * 100, 0)}%`);
  }

  // =========================== D. off-centre strikes ===========================
  out.push('', 'D. OFF-CENTRE STRIKES (mm, + toe / − heel; no other scatter). ball speed vs centred · face twist ° · start ° · axis ° · carry vs centred · finish side yds');
  const steady = 1.45 + (0.45 - 1.45) * (4 / 9);      // the Dexterity-5 wobble multiplier, to dial in an exact strike
  for (const [ci, name] of [[0, 'Driver'], [4, '4 Iron'], [7, '7 Iron'], [14, '7 Iron · Game Improvement'], [10, 'Pitching Wedge'], [12, 'Sand Wedge'], [13, 'Lob Wedge']]) {
    const c0 = shot(ci);
    out.push(`   ${name} (sweet spot ${C[ci].sweet} mm, gear ${C[ci].gear}${C[ci].bulge ? `, bulge ${C[ci].bulge}` : ''}, centred smash ${f(c0.r.smash, 3)}):`);
    for (const mm of [-14, -8, -4, 4, 8, 14]) {
      const x = shot(ci, { sigma: Math.abs(mm) / steady, lateSign: mm > 0 ? 1 : -1 });
      out.push(`      ${pad(mm, 4)} mm (read ${pad(f(x.r.strike), 5)}): ball ${pad(f((x.r.ballSpeed / c0.r.ballSpeed - 1) * 100), 5)}% · face ${pad(f(x.r.faceDyn, 2), 5)}° · start ${pad(f(x.r.hla, 2), 5)}° · axis ${pad(f(x.r.axis), 5)}° · carry ${pad(f(x.carry - c0.carry, 0), 4)} · side ${pad(f(x.side), 5)}`);
    }
  }

  // =========================== E. partial swings ===========================
  out.push('', 'E. PARTIAL SWINGS (tempo 100%): club mph · ball mph · launch ° · spin · carry / total yds (carry as % of the full swing)');
  for (const [ci, name] of [[7, '7 Iron'], [10, 'Pitching Wedge'], [12, 'Sand Wedge']]) {
    const full = shot(ci).carry;
    out.push(`   ${name}: ` + [0.25, 0.4, 0.5, 0.6, 0.75, 0.9, 1].map((bs) => { const x = shot(ci, { bs }); return `${f(bs * 100, 0)}%: ${f(x.r.clubSpeed, 0)} · ${f(x.r.ballSpeed, 0)} · ${f(x.r.vla)} · ${f(x.r.spin, 0)} · ${f(x.carry, 0)}/${f(x.total, 0)} (${f(x.carry / full * 100, 0)}%)`; }).join('\n      '));
  }

  // =========================== F. floors and clamps ===========================
  out.push('', 'F. THE HEIGHT LADDER AGAINST EACH CLUB\'S LOFT FLOOR: loft change applied ° · spin × · launch ° · spin rpm · carry/total · the risk charged (cx.height)');
  for (const [ci, name] of [[0, 'Driver (floor 0.70)'], [7, '7 Iron (floor 0.50)'], [14, '7 Iron · Game Improvement (floor 0.85)'], [12, 'Sand Wedge (floor 0.60)']]) {
    out.push(`   ${name}:`);
    for (const traj of [-2, -1, 0, 1, 2]) {
      const x = shot(ci, {}, { traj }), c = C[ci], raw = traj * T.trajLoftDeg;
      const applied = Math.max(-9 * (1 - c.floor) / 0.5, raw), spinX = Math.min(1.5, Math.max(c.floor, 1 + raw * (0.2 / 3)));
      out.push(`      ${(traj === 0 ? 'Mid' : `${traj < 0 ? 'Low' : 'High'} ${Math.abs(traj)}`).padEnd(7)} asked ${pad(raw, 3)}° -> ${pad(f(applied), 5)}° · ×${f(spinX, 2)} · ${pad(f(x.r.vla), 5)}° · ${pad(f(x.r.spin, 0), 6)} · ${pad(f(x.carry, 0), 4)}/${f(x.total, 0).padEnd(4)} · ${f(x.r.cx.height, 2)}`);
    }
  }

  // =========================== G. how often the clamps and mishits happen in play ===========================
  out.push('', 'G. HOW OFTEN CLAMPS AND MISHITS HAPPEN (4,000 shots each, with scatter; the swing the game itself assumes for a player:',
    '   backswing 100% ± 5%, path ± 2.4°, wobble 0–2.5 px, the ring through the ball). % of shots:',
    '   club · lie · Dexterity        strike at ±15 mm   axis at ±65°   launch at a limit   TOPPED   FAT   BLADED   CHUNKED   FLIER   RISKY CLUB   | mean strike mm (abs)');
  for (const [ci, name] of [[0, 'Driver'], [7, '7 Iron'], [12, 'Sand Wedge']]) for (const lie of ['fairway', 'light', 'heavy', 'hardpan', 'fbunker', 'bunker']) for (const dex of [2, 5]) {
    if (ci === 0 && (lie === 'bunker')) continue;
    const rnd = rng32(1000 + ci * 31 + dex), bell = () => rnd() + rnd() - 1, N = 4000, n = { k15: 0, ax: 0, vla: 0, TOPPED: 0, FAT: 0, BLADED: 0, CHUNKED: 0, FLIER: 0, 'RISKY CLUB': 0 };
    let sm = 0;
    for (let k = 0; k < N; k++) {
      const sw = { bs: 1 + 0.05 * bell(), ds: 1, thetaMouse: 2.4 * bell(), sigma: 2.5 * rnd(), lateSign: rnd() < 0.5 ? 1 : -1, vImpact: 1, vPeak: 1, miss: 0 };
      const club = C[ci], teed = !!club.tee && lie === 'fairway';
      const r = g.computeImpact(sw, SU0, club, { ...ENV0, lie, dex, teed }, rnd);
      if (Math.abs(r.strike) >= T.strikeMaxMm - 1e-6) n.k15++;
      if (Math.abs(r.axis) >= T.axisMax - 1e-6) n.ax++;
      if (r.vla <= 1.5 + 1e-6 || r.vla >= 55 - 1e-6) n.vla++;
      for (const fl of r.flags) if (fl in n) n[fl]++;
      sm += Math.abs(r.strike);
    }
    const p = (v) => pad(f(v / N * 100), 6);
    out.push(`   ${name.padEnd(11)} ${lie.padEnd(8)} Dex ${dex}      ${p(n.k15)}            ${p(n.ax)}         ${p(n.vla)}          ${p(n.TOPPED)} ${p(n.FAT)}  ${p(n.BLADED)}   ${p(n.CHUNKED)}   ${p(n.FLIER)}    ${p(n['RISKY CLUB'])}       |  ${f(sm / N, 1)}`);
  }

  // =========================== H. tilt, "work", and what the no-scatter preview leaves out ===========================
  out.push('', 'H. TILT, AT COMPOSURE 5: the same swing (mouse path 3°, wobble 3 px, 7 iron) after 0–4 bad shots in a row');
  for (const n of [0, 1, 2, 3, 4]) {
    const x = shot(7, { thetaMouse: 3, sigma: 3 }, {}, { badStreak: n });
    out.push(`   ${n} bad: tilt ${f(g.tiltPenalty(5, n), 2)} · path read as ${f(x.r.thetaMouse, 2)}° · strike ${f(x.r.strike, 2)} mm · complexity ${f(x.r.complexity, 2)} (so the random strike grows by ±${f(T.cxStrikeMm * x.r.complexity, 1)} mm and the face by ±${f(T.cxFaceDeg * x.r.complexity, 1)}°)`);
  }
  out.push('', '   "WORK": the same 7 iron with work 0.45 / 1.0 / 1.15 (a game-improvement head / the base blade / a workable blade)');
  for (const w of [0.45, 1.0, 1.15]) {
    const club = { ...C[7], work: w }, a = shot(club, { thetaMouse: 5 }), b = shot(club, {}, { stance: 5 });
    out.push(`   work ${f(w, 2)}: a 5° mouse path -> club path ${f(a.r.path, 2)}°, axis ${f(a.r.axis)}°, finishes ${f(a.side)} yds · a 5° closed stance -> path ${f(b.r.path, 2)}°, axis ${f(b.r.axis)}°, finishes ${f(b.side)} yds`);
  }
  {
    const club = { ...C[7], lieBias: 1.5, offset: 0.9 }, st = shot(club), rnd = rng32(77);
    let p = 0, h = 0; const N = 3000;
    for (let k = 0; k < N; k++) { const r = g.computeImpact(SW0, SU0, club, { ...ENV0, teed: false }, rnd); p += r.path; h += r.hla; }
    out.push('', `   A USED CLUB (7 iron with a bent lie of +1.5° and an offset of 0.9°): the no-scatter preview has path ${f(st.r.path, 2)}°, start ${f(st.r.hla, 2)}°, finish ${f(st.side)} yds; real shots average path ${f(p / N, 2)}°, start ${f(h / N, 2)}°`);
  }
  out.push('', '   POWER AND SPIN (stock): club mph · ball mph · spin rpm · carry');
  for (const [ci, name] of [[0, 'Driver'], [7, '7 Iron']]) out.push(`   ${name}: ` + [1, 5, 10].map((p) => { const x = shot(ci, {}, {}, { power: p }); return `Power ${p}: ${f(x.r.clubSpeed, 0)} · ${f(x.r.ballSpeed, 0)} · ${f(x.r.spin, 0)} · ${f(x.carry, 0)}`; }).join('   |   '));
  return out.join('\n');
})()
