// Swing audit fixes S5.7 (the putters make a trade, not a ladder) and the part-swing spin (a pitch keeps more spin than
// its speed): the re-measures.
//   node tools/test/probe.js "http://127.0.0.1:8090/?nohome" - @tools/test/swing-fix9.js 0 swing-fix9
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 50 && !window.__golf; i++) await sleep(200);
  const g = window.__golf, YD = 0.9144, FT = 0.3048, out = [], C = g.CLUBS, T = g.CHIP_TYPES;
  const f = (v, n = 0) => (v === null || v === undefined || Number.isNaN(v) ? '—' : v.toFixed(n));
  const gauss = (rnd) => { let s = 0; for (let k = 0; k < 6; k++) s += rnd(); return (s - 3) / Math.SQRT1_2; };
  // ---- S5.7
  out.push('S5.7 PUTTERS (flat Stimp 11, Dex 5, 1,500 putts each with path ±1°, tempo ±8%, gate |0.03|, wobble 1–4 px, length ±6%): % holed · average leave (ft) · at 40 ft, the share left more than 4 ft away');
  const surf = g.makeSurface({ stimp: 11, outline: { x: 0, z: -4, rx: 16.5, rz: 16.5 } });
  for (const pid of ['blade', 'mallet', 'p-wh2', 'p-newport', 'p-pldanser', 'p-spider', 'p-oz1', 'p-circlet', 'p-atelier']) {
    const P = g.PUTTERS[pid], cells = [];
    for (const [ft, scale] of [[6, 15], [10, 15], [20, 40], [40, 40]]) {
      const rnd = g.rng32(99 + ft); let holed = 0, leave = 0, nm = 0, far = 0; const N = 1500, green = { ...surf, hole: { x: 0, z: -ft * FT } };
      for (let k = 0; k < N; k++) {
        const sw = { thetaMouse: 1.0 * gauss(rnd), excursion: Math.abs(0.03 * gauss(rnd)), tempo: 1 + 0.08 * gauss(rnd), sigma: 1 + 3 * rnd(), lateSign: rnd() < 0.5 ? 1 : -1, miss: 0, len: (ft + g.PUTT.diePastFt) / scale * (1 + 0.06 * gauss(rnd)) };
        const res = g.computePutt(sw, P, { scaleFt: scale, stimp: 11, composure: 5, badStreak: 0, dex: 5 }, rnd), q = g.createPutt(green, res.v0, res.start, res.skidFt);
        for (let n = 0; q.phase === 'roll' && n < 20000; n++) g.stepPutt(q, 1 / 240);
        if (q.holed) holed++; else { const d = Math.hypot(q.p.x - green.hole.x, q.p.z - green.hole.z) / FT; leave += d; nm++; if (d > 4) far++; }
      }
      cells.push(`${ft} ft ${f(holed / N * 100)}%, ${f(leave / Math.max(1, nm), 1)}${ft === 40 ? `, >4 ft ${f(far / N * 100)}%` : ''}`);
    }
    out.push(`   ${(P.name + (P.lux ? ' ✦' : '')).slice(0, 34).padEnd(34)} path ${P.pathGain} · zone ${P.tempoZone} · ${cells.join(' · ')}`);
  }
  // ---- part-swing spin
  const view = (stimp = 11) => ({ decel: g.rollDecel(stimp), stimp, hole: { x: 0, z: -1e5 }, h: () => 0, grad: () => ({ x: 0, z: 0 }), surfAt: () => 'green', drag: () => 1 });
  const su = (k) => { const t = T[k]; return { face: t.face, ballPos: t.ballPos, stance: t.stance, traj: t.height, spinCtl: 0, align: { face: t.face, stance: t.stance, ballPos: t.ballPos }, flop: !!t.flop }; };
  const imp = (ci, s, bs) => g.computeImpact({ bs, ds: 1, thetaMouse: 0, sigma: 0, lateSign: 1, vImpact: 1, vPeak: 1, miss: 0 }, s, C[ci], { lie: 'fairway', slope: 'flat', power: 5, dex: 5, composure: 5, badStreak: 0, teed: false, stock: true }, () => 0.5);
  const chip = (r) => { const fl = g.runChip(view(), { ballSpeed: r.ballSpeed, vla: r.vla, dir: 0, spin: r.spin, axis: 0, release: 0 }); return { c: fl.carry / YD, t: Math.hypot(fl.p.x, fl.p.z) / YD }; };
  const bsFor = (ci, s, c) => { let lo = 0.04, hi = 1.1; for (let i = 0; i < 28; i++) { const m = (lo + hi) / 2; if (chip(imp(ci, s, m)).c < c) lo = m; else hi = m; } return (lo + hi) / 2; };
  out.push('', 'PART-SWING SPIN (stock chip setup, flat Stimp 11 green): spin and roll at each carry');
  for (const [ci, n] of [[10, 'PW'], [12, 'SW'], [13, 'LW']]) out.push(`   ${n.padEnd(3)} ` + [10, 20, 30, 42].map((c) => { const bs = bsFor(ci, su('stock'), c), r = imp(ci, su('stock'), bs), x = chip(r); return `${c} yds (swing ${f(bs * 100)}%): ${f(r.spin)} rpm, roll ${f(x.t - x.c, 1)}`; }).join(' · '));
  // chip ratios and smoothness
  const ratios = [7, 9, 10, 12].map((ci) => { const x = chip(imp(ci, su('stock'), 0.25)); return `${C[ci].name} ${f((x.t - x.c) / x.c, 1)}`; });
  out.push(`   short chips, roll ÷ carry at a 25% swing: ${ratios.join(' · ')} (rules of thumb: 7 iron 4, PW 2, SW 1)`);
  let drops = 0, worst = 0, where = '';
  for (const ci of [7, 9, 10, 11, 12, 13]) for (const type of ['low', 'stock', 'high']) { let prev = -1; for (let bs = 0.12; bs <= 0.8; bs += 0.02) { const x = chip(imp(ci, su(type), bs)); if (x.t < prev - 1) { drops++; if (prev - x.t > worst) { worst = prev - x.t; where = `${C[ci].name} ${type} ${f(bs * 100)}%`; } } prev = Math.max(prev, x.t); } }
  out.push(`   chip totals that fall by over a yard as the backswing grows: ${drops} (worst ${f(worst, 1)} yds, ${where})`);
  // partial full swings: the backswing marks
  out.push(`   the bag's backswing marks (carry at 25 / 50 / 75%): ${[[0, 'Driver'], [7, '7 Iron'], [10, 'PW'], [12, 'SW']].map(([ci, n]) => `${n} ${[0.25, 0.5, 0.75].map((b) => g.lieRead(ci, b).carryTxt).join(' / ')}`).join(' · ')}`);
  return out.join('\n');
})()
