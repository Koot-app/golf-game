// Swing audit S6: stats, lies, dispersion and difficulty. Seeded Monte Carlo through computeImpact + the real flight.
// Three swing models: 'game' = the minimap's own assumption (SPREAD), 'human' = S1's estimate of a real hand (more wobble,
// a small ring miss), 'robot' = a perfect swing (only the game's own Dexterity scatter is left).
//   node tools/test/probe.js "http://127.0.0.1:8090/?nohome" - @tools/test/swing-risk.js 0 swing-s6
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 50 && !window.__golf; i++) await sleep(200);
  const g = window.__golf, YD = 0.9144, out = [], C = g.CLUBS;
  const f = (v, n = 1) => (v === null || v === undefined || Number.isNaN(v) ? '—' : v.toFixed(n));
  const pad = (s, n) => String(s).padStart(n), padE = (s, n) => String(s).padEnd(n);
  g.state.slope = 'flat';
  const SU = { face: 0, ballPos: 0, stance: 0, traj: 0, spinCtl: 0 };
  const gauss = (rnd) => { let s = 0; for (let k = 0; k < 6; k++) s += rnd(); return (s - 3) / Math.sqrt(0.5); };
  const SW = {
    game: (rnd, b) => ({ bs: b.bs + g.SPREAD.backswing * (rnd() + rnd() - 1), ds: b.ds, thetaMouse: (b.th || 0) + g.SPREAD.mouseDeg * 2 * (rnd() + rnd() - 1), sigma: g.SPREAD.wobble * rnd(), lateSign: rnd() < 0.5 ? 1 : -1, vImpact: 1, vPeak: 1, miss: 0 }),
    human: (rnd, b) => ({ bs: b.bs + g.SPREAD.backswing * (rnd() + rnd() - 1), ds: b.ds, thetaMouse: (b.th || 0) + g.SPREAD.mouseDeg * 2 * (rnd() + rnd() - 1), sigma: 1.5 + 4 * rnd(), lateSign: rnd() < 0.5 ? 1 : -1, vImpact: 1, vPeak: 1, miss: 0.02 * gauss(rnd) }),
    robot: (rnd, b) => ({ bs: b.bs, ds: b.ds, thetaMouse: b.th || 0, sigma: 0, lateSign: rnd() < 0.5 ? 1 : -1, vImpact: 1, vPeak: 1, miss: 0 }),
  };
  const fly = (r, teed) => {
    const fl = g.createFlight({ ballSpeed: r.ballSpeed, vla: r.vla, dir: r.hla, spin: r.spin, axis: r.axis, release: r.release }, { x: 0, z: 0 }, teed ? 0.04 : 0);
    for (let n = 0; fl.phase !== 'stopped' && n < 30000; n++) g.stepFlight(fl, 1 / 120);
    return { carry: fl.carry / YD, total: -fl.p.z / YD, side: fl.p.x / YD };
  };
  // o: { ci, dex, lie, su, model, bs, ds, th, power, comp, streak, N, teed }
  const mc = (o) => {
    const ci = o.ci, lie = o.lie || 'fairway', teed = o.teed ?? (!!C[ci].tee && lie === 'fairway'), N = o.N || 500, su = o.su || SU;
    const rnd = g.rng32(1000 + ci * 31 + (o.seed || 0)), mk = SW[o.model || 'human'], P = [], flags = {}; let cx = 0, spin = 0, tilt30 = 0, carry = 0;
    const env = { lie, slope: 'flat', power: o.power ?? 5, dex: o.dex ?? 5, composure: o.comp ?? 5, badStreak: o.streak || 0, teed };
    for (let k = 0; k < N; k++) {
      const r = g.computeImpact(mk(rnd, { bs: o.bs ?? 1, ds: o.ds ?? 1, th: o.th }), su, C[ci], env, rnd), x = fly(r, teed);
      P.push(x); cx += r.complexity; spin += r.spin; carry += x.carry; if (Math.abs(r.axis) > 30) tilt30++;
      for (const fl of r.flags) flags[fl] = (flags[fl] || 0) + 1;
    }
    const mx = P.reduce((s, p) => s + p.side, 0) / N, mz = P.reduce((s, p) => s + p.total, 0) / N, mcar = carry / N;
    const sx = Math.sqrt(P.reduce((s, p) => s + (p.side - mx) ** 2, 0) / N), sz = Math.sqrt(P.reduce((s, p) => s + (p.total - mz) ** 2, 0) / N), sc = Math.sqrt(P.reduce((s, p) => s + (p.carry - mcar) ** 2, 0) / N);
    const cs = P.map((p) => p.carry).sort((a, b) => a - b);
    return { mx, mz, mc: mcar, sc, wide: 2 * sx, deep: 2 * sz, cx: cx / N, spin: spin / N, tilt30: tilt30 / N, flags: Object.fromEntries(Object.entries(flags).map(([k, v]) => [k, v / N])), p10: cs[Math.floor(N * 0.1)], p90: cs[Math.floor(N * 0.9)] };
  };
  const cell = (m) => `±${pad(f(m.wide, 1), 4)} × ±${pad(f(m.deep, 1), 4)}`;     // (wide / deep are already 2σ)
  const clubs = [[0, 'Driver'], [3, '3 Hybrid'], [7, '7 Iron'], [10, 'PW'], [12, 'Sand Wedge']];
  // ===================== 1. dispersion by club and Dexterity
  out.push('1. DISPERSION BY CLUB AND DEXTERITY (fairway, driver teed, base clubs, Power 5): 2σ half-width × half-depth in yds (about 95% of shots inside ±)');
  for (const model of ['robot', 'game', 'human']) {
    out.push(`   swing: ${model}${model === 'robot' ? ' (a perfect swing: only the game\'s own scatter)' : model === 'game' ? ' (SPREAD: what the minimap assumes)' : ' (S1\'s estimate of a real hand: wobble 1.5–5.5 px, ring miss ±2% sd)'}`);
    out.push(`   ${padE('club', 12)}${[1, 2, 5, 8, 10].map((d) => padE(`Dex ${d}`, 18)).join('')}`);
    for (const [ci, name] of clubs) out.push(`   ${padE(name, 12)}${[1, 2, 5, 8, 10].map((d) => padE(cell(mc({ ci, dex: d, model, N: 400 })), 18)).join('')}`);
  }
  // driver: how often the spin axis passes 30° (where S3.3 bites), and the fairway rate
  out.push('   driver, human swing: share of shots with the spin axis past 30° · Dex 1 / 2 / 5 / 8 / 10: ' + [1, 2, 5, 8, 10].map((d) => `${f(mc({ ci: 0, dex: d, N: 400 }).tilt30 * 100, 0)}%`).join(' / '));
  // ===================== 2. each ask, alone and stacked
  out.push('', '2. EACH ASK, ALONE AND STACKED (7 iron, human swing): complexity · 2σ half-width × half-depth · mean total');
  const draw = (ci) => { const v = g.solveShape(ci, -1); return { face: v.face, stance: v.stance }; }, fade = (ci) => { const v = g.solveShape(ci, 1); return { face: v.face, stance: v.stance }; };
  const asks = (ci) => [['stock', {}], ['105% backswing', { bs: 1.05 }], ['110% backswing', { bs: 1.10 }], ['115% tempo', { ds: 1.15 }], ['110% + 115%', { bs: 1.10, ds: 1.15 }],
    ['full draw (preset)', { su: { ...SU, ...draw(ci) } }], ['full fade (preset)', { su: { ...SU, ...fade(ci) } }], ['High 1', { su: { ...SU, traj: 1 } }], ['High 2', { su: { ...SU, traj: 2 } }], ['Low 1', { su: { ...SU, traj: -1 } }], ['Low 2', { su: { ...SU, traj: -2 } }],
    ['More spin', { su: { ...SU, spinCtl: 1 } }], ['Less spin', { su: { ...SU, spinCtl: -1 } }], ['High 1 draw (against the grain)', { su: { ...SU, ...draw(ci), traj: 1 } }], ['Low 1 fade (against the grain)', { su: { ...SU, ...fade(ci), traj: -1 } }],
    ['Low 1 draw (with the grain)', { su: { ...SU, ...draw(ci), traj: -1 } }], ['stacked: 110% + draw + High 1 + More spin', { bs: 1.10, su: { ...SU, ...draw(ci), traj: 1, spinCtl: 1 } }]];
  out.push(`   ${padE('ask', 44)}${[2, 5, 8].map((d) => padE(`Dex ${d}`, 34)).join('')}`);
  for (const [name, o] of asks(7)) out.push(`   ${padE(name, 44)}${[2, 5, 8].map((d) => { const m = mc({ ci: 7, dex: d, N: 400, ...o }); return padE(`${f(m.cx, 2)} · ${cell(m)} · ${f(m.mz, 0)}`, 34); }).join('')}`);
  out.push('   driver: stock / 110% / 110% + 115% at Dex 2 and 5 (complexity · spread · mean total):');
  for (const d of [2, 5]) out.push(`      Dex ${d}: ` + [['stock', {}], ['110%', { bs: 1.10 }], ['110% + 115%', { bs: 1.10, ds: 1.15 }]].map(([n, o]) => { const m = mc({ ci: 0, dex: d, N: 400, ...o }); return `${n} ${f(m.cx, 2)} · ${cell(m)} · ${f(m.mz, 0)}`; }).join('   '));
  // ===================== 3. Power
  out.push('', '3. POWER: stock carry at Power 1 / 3 / 5 / 7 / 10, and yards per point; then mean carry from rough and sand (Dex 5, human swing)');
  for (const [ci, name] of clubs) {
    const cs = [1, 3, 5, 7, 10].map((p) => { g.state.power = p; g.state.lie = 'fairway'; return g.stockFlightOf(ci, SU, 1).f.carry / YD; });
    out.push(`   ${padE(name, 12)} ${cs.map((c) => f(c, 0)).join(' / ')} · ${f((cs[4] - cs[0]) / 9, 1)} yds a point`);
  }
  g.state.power = 5;
  for (const lie of ['light', 'heavy', 'fbunker', 'bunker']) {
    const rows = [[7, '7 Iron'], [10, 'PW'], [12, 'SW']].map(([ci, n]) => `${n} ${[1, 5, 10].map((p) => f(mc({ ci, lie, power: p, N: 300 }).mc, 0)).join(' / ')}`);
    out.push(`   ${padE(g.LIES[lie].name, 17)} (Power 1 / 5 / 10): ${rows.join(' · ')}`);
  }
  // ===================== 4. Composure and tilt
  out.push('', '4. TILT (7 iron, Dex 5, human swing): the tilt value, complexity, spread and mean total after 0–6 bad shots in a row');
  out.push(`   ${padE('bad shots', 10)}${[1, 5, 10].map((c) => padE(`Composure ${c}`, 40)).join('')}`);
  for (const n of [0, 1, 2, 3, 4, 5, 6]) out.push(`   ${padE(n, 10)}${[1, 5, 10].map((c) => { const m = mc({ ci: 7, comp: c, streak: n, N: 400 }); return padE(`tilt ${f(g.tiltPenalty(c, n), 2)} · cx ${f(m.cx, 2)} · ${cell(m)} · ${f(m.mz, 0)}`, 40); }).join('')}`);
  out.push('   driver, Composure 5: ' + [0, 2, 4].map((n) => { const m = mc({ ci: 0, streak: n, N: 400 }); return `${n} bad: ${cell(m)}, axis past 30° ${f(m.tilt30 * 100, 0)}%`; }).join(' · '));
  // ===================== 5. Perception: the lie read against the truth
  out.push('', '5. PERCEPTION: the bag\'s carry range from a bad lie (lieRead, over 40 lie seeds) against the true spread of 600 shots (Dex 5, human swing)',
    '   true: mean carry and its 10th–90th percentile · read: average band (lo–hi), how often the true mean falls inside the band, the worst bias');
  for (const lie of ['light', 'heavy', 'fbunker']) {
    for (const [ci, name] of [[7, '7 Iron'], [10, 'PW']]) {
      g.state.lie = lie; const t = mc({ ci, lie, N: 600 }), cells = [];
      for (const per of [1, 5, 10]) {
        g.state.perception = per; let lo = 0, hi = 0, inside = 0, worst = 0;
        for (let s = 0; s < 40; s++) { g.state.lieSeed = 1234567 + s * 7919; const r = g.lieRead(ci); lo += r.carryLo; hi += r.carryHi; if (t.mc >= r.carryLo && t.mc <= r.carryHi) inside++; worst = Math.max(worst, Math.abs(r.carryMid - t.mc)); }
        cells.push(`Per ${per}: ${f(lo / 40, 0)}–${f(hi / 40, 0)}, mean inside ${f(inside / 40 * 100, 0)}%, worst ${f(worst, 0)} off`);
      }
      out.push(`   ${padE(`${g.LIES[lie].name}, ${name}`, 26)} true ${f(t.mc, 0)} (${f(t.p10, 0)}–${f(t.p90, 0)}) · ${cells.join(' · ')}`);
    }
  }
  g.state.lie = 'fairway'; g.state.perception = 5;
  // ===================== 6. lies
  out.push('', '6. LIES (Dex 5, human swing, not teed): mean carry ± sd, mean spin, 2σ half-width, and the outcome flags');
  for (const lie of ['fairway', 'light', 'heavy', 'hardpan', 'fbunker', 'bunker']) {
    const rows = [[12, 'SW'], [7, '7i'], [3, '3H'], [0, 'Dr']].map(([ci, n]) => { const m = mc({ ci, lie, teed: false, N: 400 }); const fl = Object.entries(m.flags).filter(([k]) => !/OVERSWING|DECEL|LOW|HIGH|SPIN/.test(k)).map(([k, v]) => `${k.toLowerCase()} ${f(v * 100, 0)}%`).join(', '); return `${n} ${f(m.mc, 0)}±${f(m.sc, 0)} ${f(m.spin / 1000, 1)}k ±${f(m.wide, 0)}${fl ? ` [${fl}]` : ''}`; });
    out.push(`   ${padE(g.LIES[lie].name, 17)} ${rows.join(' · ')}`);
  }
  // club fit by lie
  out.push('', '   club fit by lie: misfit s (0 fine · under 0.5 risky · 0.5+ near impossible) and the topped / fat chance');
  for (const lie of ['fairway', 'light', 'heavy', 'hardpan', 'fbunker', 'bunker']) {
    const cells = []; for (let ci = 0; ci < 14; ci++) { const fit = g.clubFit(C[ci], lie, false); if (fit.s > 0.02) cells.push(`${C[ci].name.replace(' Wedge', 'W').replace('Pitching', 'P').replace('Hybrid', 'H').replace(' Iron', 'i').replace(' Wood', 'W')} ${f(fit.s, 2)} (${f(fit.mishit * 100, 0)}%)`); }
    out.push(`   ${padE(g.LIES[lie].name, 17)} ${cells.join(' · ') || 'every club fits'}`);
  }
  // ===================== 7. mishits in ordinary play
  out.push('', '7. MISHITS IN ORDINARY PLAY: the longest club that fits the lie (as the game suggests), human swing, 800 shots: flag rates');
  for (const lie of ['fairway', 'light', 'heavy', 'hardpan', 'fbunker', 'bunker']) {
    let ci = 1; while (ci < 13 && g.clubFit(C[ci], lie, false).s > 0.02) ci++;
    const cells = [2, 5].map((d) => { const m = mc({ ci, lie, dex: d, teed: false, N: 800, seed: 5 }); const fl = Object.entries(m.flags).filter(([k]) => /TOPPED|FAT|BLADED|CHUNKED|FLIER|RISKY/.test(k)).map(([k, v]) => `${k.toLowerCase()} ${f(v * 100, 1)}%`).join(', '); return `Dex ${d}: ${fl || 'none'}`; });
    out.push(`   ${padE(g.LIES[lie].name, 17)} ${padE(C[ci].name, 15)} ${cells.join('  ·  ')}`);
  }
  // how bad each mishit is (7 iron from hardpan, light rough flier; driver from heavy rough for topped / fat)
  {
    const sample = (ci, lie, flag, dex = 2) => { const rnd = g.rng32(31337); const env = { lie, slope: 'flat', power: 5, dex, composure: 5, badStreak: 0, teed: false }; const base = g.stockFlightOf(ci, SU, 1).f.carry / YD; let n = 0, c = 0, t = 0;
      for (let k = 0; k < 6000 && n < 200; k++) { const r = g.computeImpact(SW.human(rnd, { bs: 1, ds: 1 }), SU, C[ci], env, rnd); if (!r.flags.includes(flag)) continue; const x = fly(r, false); n++; c += x.carry; t += x.total; }
      return n ? `${flag.toLowerCase()}: carry ${f(c / n, 0)}, total ${f(t / n, 0)} (a clean shot from here ${f(base, 0)} carry; n ${n})` : `${flag.toLowerCase()}: none`; };
    g.state.lie = 'hardpan'; out.push(`   7 iron off hardpan, Dex 2 · ${sample(7, 'hardpan', 'BLADED')} · ${sample(7, 'hardpan', 'CHUNKED')}`);
    g.state.lie = 'light'; out.push(`   7 iron, light rough · ${sample(7, 'light', 'FLIER')}`);
    g.state.lie = 'heavy'; out.push(`   3 wood, heavy rough · ${sample(1, 'heavy', 'TOPPED')} · ${sample(1, 'heavy', 'FAT')}`);
    g.state.lie = 'fairway';
  }
  return out.join('\n');
})()
