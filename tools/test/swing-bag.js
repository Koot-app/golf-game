// Swing audit S4: the base bag. Every club's stock shot (100% backswing and tempo, centred, straight, fairway, no wind)
// at Power 1, 5 and 10, next to the TrackMan tour table; carry gaps; the wedges; what each per-club extra does.
//   node tools/test/probe.js "http://127.0.0.1:8090/?nohome" - @tools/test/swing-bag.js 0 swing-s4
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 50 && !window.__golf; i++) await sleep(200);
  const g = window.__golf, YD = 0.9144, out = [], C = g.CLUBS;
  const f = (v, n = 1) => (v === null || v === undefined || Number.isNaN(v) ? '—' : v.toFixed(n));
  const pad = (s, n) => String(s).padStart(n);
  g.state.lie = 'fairway'; g.state.slope = 'flat'; g.state.dex = 5; g.state.composure = 5; g.state.badStreak = 0;
  const SU = { face: 0, ballPos: 0, stance: 0, traj: 0, spinCtl: 0 };
  // tour rows: club mph, ball mph, smash, launch, spin, apex, land, carry
  const T = { Driver: [113, 167, 1.48, 10.9, 2686, 32, 38, 275], '3 wood': [107, 158, 1.48, 9.2, 3655, 30, 43, 243], '5 wood': [103, 152, 1.47, 9.4, 4350, 31, 47, 230],
    Hybrid: [100, 146, 1.46, 10.2, 4437, 29, 47, 225], '3 iron': [98, 142, 1.45, 10.4, 4630, 27, 46, 212], '4 iron': [96, 137, 1.43, 11.0, 4836, 28, 48, 203],
    '5 iron': [94, 132, 1.41, 12.1, 5361, 31, 49, 194], '6 iron': [92, 127, 1.38, 14.1, 6231, 30, 50, 183], '7 iron': [90, 120, 1.33, 16.3, 7097, 32, 50, 172],
    '8 iron': [87, 115, 1.32, 18.1, 7998, 31, 50, 160], '9 iron': [85, 109, 1.28, 20.4, 8647, 30, 51, 148], PW: [83, 102, 1.23, 24.2, 9304, 29, 52, 136] };
  const BENCH = ['Driver', '3 wood', '5 wood', 'Hybrid', '4 iron', '5 iron', '6 iron', '7 iron', '8 iron', '9 iron', 'PW', null, null, null, '7 iron'];
  // one club's stock shot: fly it ourselves so we also get the landing angle and the roll
  const shot = (ci, su = SU, sw = {}) => {
    const club = C[ci], teed = !!club.tee;
    const r = g.computeImpact({ bs: 1, ds: 1, thetaMouse: 0, sigma: 0, lateSign: 1, vImpact: 1, vPeak: 1, miss: 0, ...sw }, su, club,
      { lie: g.state.lie, slope: 'flat', power: g.state.power, dex: g.state.dex, composure: 5, badStreak: 0, teed, stock: true }, () => 0.5);
    const fl = g.createFlight({ ballSpeed: r.ballSpeed, vla: r.vla, dir: r.hla, spin: r.spin, axis: r.axis, release: r.release }, { x: 0, z: 0 }, teed ? 0.04 : 0);
    let land = null, n = 0;
    while (fl.phase !== 'stopped' && n++ < 30000) { const vy = fl.v.y, vh = Math.hypot(fl.v.x, fl.v.z), had = fl.carry !== null; g.stepFlight(fl, 1 / 120); if (!had && fl.carry !== null) land = Math.atan2(-vy, vh) / Math.PI * 180; }
    return { r, carry: fl.carry / YD, total: Math.hypot(fl.p.x, fl.p.z) / YD, side: fl.p.x / YD, apex: fl.apex / YD, land, t: fl.t };
  };
  const pct = (a, b) => (b ? `${a >= b ? '+' : '−'}${f(Math.abs(a / b - 1) * 100, 0)}%` : '');
  // ---- 1. the table at Power 5, and at Power 1 and 10
  const tables = {};
  for (const P of [5, 1, 10]) {
    g.state.power = P;
    const rows = [];
    out.push('', `1${P === 5 ? '' : P === 1 ? 'b' : 'c'}. STOCK SHOTS AT POWER ${P} (Dexterity 5, fairway, no wind; the driver teed)${P === 5 ? '  ·  in brackets: the tour number, and how far off' : ''}`,
      '   club                    loft  club mph  ball mph  smash  launch   spin rpm        apex yds     land °     carry yds          total  roll');
    for (let ci = 0; ci < C.length; ci++) {
      const s = shot(ci), b = BENCH[ci] && T[BENCH[ci]], R = s.r;
      rows.push(s);
      const br = (v, bv, n, pc) => (P === 5 && b ? `${f(v, n)} (${bv}${pc ? ` ${pct(v, bv)}` : ''})` : f(v, n));
      out.push(`   ${C[ci].name.padEnd(24)}${pad(f(C[ci].loft, 1), 5)}  ${pad(br(R.clubSpeed, b && b[0], 0), 8)}  ${pad(br(R.ballSpeed, b && b[1], 0), 8)}  ${pad(f(R.smash, 2), 5)}  ${pad(br(R.vla, b && b[3], 1), 6)}  ${pad(br(R.spin, b && b[4], 0, true), 15)}  ${pad(br(s.apex, b && b[5], 0, true), 13)}  ${pad(br(s.land, b && b[6], 0), 8)}  ${pad(br(s.carry, b && b[7], 0, true), 13)}  ${pad(f(s.total, 0), 6)}  ${pad(f(s.total - s.carry, 0), 4)}`);
    }
    tables[P] = rows;
  }
  g.state.power = 5;
  // ---- 2. gaps
  out.push('', '2. CARRY GAPS (Power 5), longest to shortest club in the 14-club bag');
  const order = [...Array(14).keys()].sort((a, b) => tables[5][b].carry - tables[5][a].carry);
  const gaps = [];
  for (let k = 1; k < order.length; k++) { const a = order[k - 1], b = order[k]; gaps.push(`${C[a].name} → ${C[b].name}: ${f(tables[5][a].carry - tables[5][b].carry, 0)}`); }
  out.push(`   ${gaps.join('\n   ')}`);
  out.push(`   (bag order by index is ${[...Array(14).keys()].every((v, i) => order[i] === v) ? 'the same as by carry' : 'NOT the same as by carry: ' + order.map((i) => C[i].name).join(', ')})`);
  for (const P of [1, 10]) {
    const gs = []; for (let i = 1; i < 14; i++) gs.push(f(tables[P][i - 1].carry - tables[P][i].carry, 0));
    out.push(`   Power ${P}, gap after each club in bag order: ${gs.join(' · ')}`);
  }
  // ---- 3. per-club extras
  out.push('', '3. WHAT EACH EXTRA DOES (Power 5, Dex 5, stock; one change at a time)');
  // sweet + gear + bulge: strike set through sigma (steady at Dex 5 ≈ 1.006, strikeMmPerPx 1), lateSign +1 = toe, -1 = heel
  const steady = 1.45 + (0.45 - 1.45) * 4 / 9;
  out.push('   a) off-centre: carry lost and yards offline at 6 / 10 / 14 mm toe (+) and heel (−); sweet = mm with no smash loss',
    '      club                    sweet  gear  bulge   toe 6: carry, side   toe 10            toe 14            heel 10           heel 14');
  for (let ci = 0; ci < 14; ci++) {
    const base = shot(ci), cells = [];
    for (const [mm, side] of [[6, 1], [10, 1], [14, 1], [10, -1], [14, -1]]) { const s = shot(ci, SU, { sigma: mm / steady, lateSign: side }); cells.push(`${pad(f(s.carry - base.carry, 0), 4)}, ${pad(f(s.side, 0), 4)} ${s.side < -0.5 ? 'L' : s.side > 0.5 ? 'R' : ' '}`); }
    out.push(`      ${C[ci].name.padEnd(24)}${pad(C[ci].sweet, 4)}  ${pad(f(C[ci].gear, 1), 4)}  ${pad(f(C[ci].bulge, 1), 5)}    ${cells.join('    ')}`);
  }
  // work + curve: a straight face with the mouse swung 5° in-to-out / out-to-in, and the solved draw / fade
  out.push('', '   b) shaping through the bag: work and curve. Yards offline from a square face with the mouse swung 5° in-to-out',
    '      (a hand-made draw) and the axis tilt it makes; and the solved Draw / Fade preset (face, stance, curve in yds)',
    '      club                    work  curve   5° path: side yds, axis°, % of carry   draw preset: face/stance → curve, side   fade preset');
  for (let ci = 0; ci < 14; ci++) {
    const s5 = shot(ci, SU, { thetaMouse: 5 }), pr = [];
    for (const sg of [-1, 1]) {
      const sv = g.solveShape(ci, sg), s = shot(ci, { ...SU, face: sv.face, stance: sv.stance }), st = shot(ci, { ...SU, face: sv.face, stance: sv.stance });
      // curve = how far it bends from where it started: start line from hla, compare carry-point offline with the start line at that distance
      const startOff = Math.tan(s.r.hla * Math.PI / 180) * s.carry;
      pr.push(`${pad(f(sv.face, 1), 5)}/${pad(f(sv.stance, 1), 5)} → ${pad(f(Math.abs(s.side - startOff), 0), 3)}, ${pad(f(st.side, 0), 3)}`);
    }
    out.push(`      ${C[ci].name.padEnd(24)}${pad(f(C[ci].work, 2), 4)}  ${pad(f(C[ci].curve || 1, 2), 5)}   ${pad(f(s5.side, 1), 6)}, ${pad(f(s5.r.axis, 1), 5)}, ${pad(f(Math.abs(s5.side) / s5.carry * 100, 1), 5)}%        ${pr[0]}           ${pr[1]}`);
  }
  // floor: how low each club can go (Low 2) and the spin it keeps
  out.push('', '   c) the loft floor: Low 2 against Mid (launch, spin, apex, carry, total)', '      club                    floor   Mid: launch spin apex carry total   →   Low 2: launch spin apex carry total');
  for (let ci = 0; ci < 14; ci++) {
    const m = shot(ci), l = shot(ci, { ...SU, traj: -2 });
    const row = (s) => `${pad(f(s.r.vla, 1), 5)} ${pad(f(s.r.spin, 0), 5)} ${pad(f(s.apex, 0), 3)} ${pad(f(s.carry, 0), 4)} ${pad(f(s.total, 0), 4)}`;
    out.push(`      ${C[ci].name.padEnd(24)}${pad(f(C[ci].floor, 2), 5)}        ${row(m)}          ${row(l)}`);
  }
  // rescue and bounce
  out.push('', '   d) rescue (hybrids) and bounce (sand wedge): club fit and stock carry from each lie');
  for (const lie of ['light', 'heavy', 'fbunker', 'bunker']) {
    g.state.lie = lie; const cells = [];
    for (const ci of [1, 2, 3, 4, 5, 10, 11, 12, 13]) { const fit = g.clubFit(C[ci], lie, false), s = shot(ci); cells.push(`${C[ci].name.replace(' Wedge', 'W').replace('Pitching', 'P').replace('Sand', 'S').replace('Gap', 'G').replace('Lob', 'L')} ${f(s.carry, 0)}${fit.s > 0.02 ? ` (misfit ${f(fit.s, 2)})` : ''}`); }
    out.push(`      ${g.LIES[lie].name.padEnd(17)} ${cells.join(' · ')}`);
  }
  g.state.lie = 'fairway';
  // the bounce in a greenside bunker: complexity and the lie's random spread with and without the SW's bounce
  {
    const sw = C[12], noB = { ...sw, bounce: 0 }, e = { lie: 'bunker', slope: 'flat', power: 5, dex: 5, composure: 5, badStreak: 0, teed: false };
    const sweep = (club) => { const rnd = (() => { let a = 7; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; })();
      const cs = []; let cx = 0; for (let k = 0; k < 3000; k++) { const r = g.computeImpact({ bs: 1, ds: 1, thetaMouse: 0, sigma: 0, lateSign: 1, vImpact: 1, vPeak: 1, miss: 0 }, SU, club, e, rnd); cs.push(r.ballSpeed); cx += r.complexity; }
      const m = cs.reduce((a, b) => a + b, 0) / cs.length, sd = Math.sqrt(cs.reduce((a, b) => a + (b - m) ** 2, 0) / cs.length); return `complexity ${f(cx / 3000, 2)}, ball speed ${f(m, 1)} ± ${f(sd, 1)} mph`; };
    out.push(`      a full sand wedge from a greenside bunker: with its 12° bounce ${sweep(sw)}; with none ${sweep(noB)}`);
  }
  // ---- 4. the comparison club
  {
    const gi = shot(14), bl = shot(7);
    out.push('', '4. THE COMPARISON CLUB ("7 Iron · Game Improvement", index 14) against the 7 iron',
      `   GI: carry ${f(gi.carry, 0)}, total ${f(gi.total, 0)}, launch ${f(gi.r.vla)}, spin ${f(gi.r.spin, 0)}, apex ${f(gi.apex, 0)} · 7 iron: carry ${f(bl.carry, 0)}, total ${f(bl.total, 0)}, launch ${f(bl.r.vla)}, spin ${f(bl.r.spin, 0)}, apex ${f(bl.apex, 0)}`,
      `   in the bag list outside a career: ${g.careerOn ? '(career is on; cannot tell)' : (() => { const rows = [...document.querySelectorAll('#bagList .bag-row')].map((r) => r.querySelector('span').textContent + ' [' + r.querySelector('kbd').textContent + ']'); return `${rows.length} rows: ${rows.join(', ')}`; })()}`);
  }
  return out.join('\n');
})()
