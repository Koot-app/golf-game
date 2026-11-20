// Swing audit S5: the club catalogue. Every career model applied to its clubs (outside a career, so no bent lies unless
// a table says so), measured with no scatter and with a few hundred seeded ordinary swings (the same swing errors the
// minimap's landing area assumes: SPREAD).
//   node tools/test/probe.js "http://127.0.0.1:8090/?nohome" - @tools/test/swing-models.js 0 swing-s5
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 50 && !window.__golf; i++) await sleep(200);
  const g = window.__golf, YD = 0.9144, FT = 0.3048, out = [], C = g.CLUBS, M = g.CLUB_MODELS;
  const f = (v, n = 1) => (v === null || v === undefined || Number.isNaN(v) ? '—' : v.toFixed(n));
  const pad = (s, n) => String(s).padStart(n), padE = (s, n) => String(s).padEnd(n);
  const sgn = (v, n = 0) => `${v > 0 ? '+' : v < 0 ? '−' : '±'}${f(Math.abs(v), n)}`;
  g.state.lie = 'fairway'; g.state.slope = 'flat'; g.state.power = 5; g.state.composure = 5; g.state.badStreak = 0;
  const SU = { face: 0, ballPos: 0, stance: 0, traj: 0, spinCtl: 0 };
  // put a model on club i (as applyCareerClubs does), or the base club with id null
  const apply = (i, id, extra) => { const c = C[i]; for (const k of Object.keys(c)) if (!(k in g.BASE_CLUBS[i])) delete c[k]; Object.assign(c, g.BASE_CLUBS[i]); if (id) Object.assign(c, g.modelMods(M[id], i), { model: id }); if (extra) Object.assign(c, extra); };
  const resetAll = () => { for (let i = 0; i < C.length; i++) apply(i, null); };
  const env = (lie, dex, teed) => ({ lie, slope: 'flat', power: 5, dex, composure: 5, badStreak: 0, teed });
  const surfFn = (k) => (k ? () => g.SURF[k] : null);
  // one flight to rest; returns carry, total (along the line), side, apex, landing angle, and the roll
  const fly = (r, teed, ground) => {
    const fl = g.createFlight({ ballSpeed: r.ballSpeed, vla: r.vla, dir: r.hla, spin: r.spin, axis: r.axis, release: r.release, ground: surfFn(ground) }, { x: 0, z: 0 }, teed ? 0.04 : 0);
    let land = null, n = 0;
    while (fl.phase !== 'stopped' && n++ < 30000) { const vy = fl.v.y, vh = Math.hypot(fl.v.x, fl.v.z), had = fl.carry !== null; g.stepFlight(fl, 1 / 120); if (!had && fl.carry !== null) land = Math.atan2(-vy, vh) * 180 / Math.PI; }
    return { carry: fl.carry / YD, total: -fl.p.z / YD, side: fl.p.x / YD, apex: fl.apex / YD, land, roll: (-fl.p.z - (fl.land ? -fl.land.z : 0)) / YD };
  };
  const stock = (ci, su = SU, sw = {}, lie = 'fairway', ground = null) => {
    const teed = !!C[ci].tee && lie === 'fairway';
    const r = g.computeImpact({ bs: 1, ds: 1, thetaMouse: 0, sigma: 0, lateSign: 1, vImpact: 1, vPeak: 1, miss: 0, ...sw }, su, C[ci], { ...env(lie, 5, teed), stock: true }, () => 0.5);
    return { r, ...fly(r, teed, ground) };
  };
  // N ordinary swings (SPREAD's errors), seeded: mean, 2-sigma width and depth (yds), and the share within R yds of where
  // a stock shot finishes (a green-sized target)
  const mc = (ci, dex, N = 500, lie = 'fairway', R = 10, su = SU) => {
    const rnd = g.rng32(4242 + ci), bell = () => rnd() + rnd() - 1, S = g.SPREAD, teed = !!C[ci].tee && lie === 'fairway';
    const aim = stock(ci, su), P = []; let fl = 0, mis = 0, spin = 0;
    for (let k = 0; k < N; k++) {
      const sw = { bs: 1 + S.backswing * bell(), ds: 1, thetaMouse: S.mouseDeg * 2 * bell(), sigma: S.wobble * rnd(), lateSign: rnd() < 0.5 ? 1 : -1, vImpact: 1, vPeak: 1, miss: 0 };
      const r = g.computeImpact(sw, su, C[ci], env(lie, dex, teed), rnd), x = fly(r, teed);
      P.push(x); spin += r.spin; if (r.flags.includes('FLIER')) fl++; if (r.flags.includes('TOPPED') || r.flags.includes('FAT')) mis++;
    }
    const mx = P.reduce((s, p) => s + p.side, 0) / N, mz = P.reduce((s, p) => s + p.total, 0) / N, mc_ = P.reduce((s, p) => s + p.carry, 0) / N;
    const sx = Math.sqrt(P.reduce((s, p) => s + (p.side - mx) ** 2, 0) / N), sz = Math.sqrt(P.reduce((s, p) => s + (p.total - mz) ** 2, 0) / N), sc = Math.sqrt(P.reduce((s, p) => s + (p.carry - mc_) ** 2, 0) / N);
    const hit = P.filter((p) => Math.hypot(p.side - aim.side, p.total - aim.total) <= R).length / N;
    return { mx, mz, mc: mc_, sx, sz, sc, wide: 2 * sx, deep: 2 * sz, hit, flier: fl / N, mishit: mis / N, spin: spin / N };
  };
  const ironIds = Object.keys(M).filter((id) => M[id].kind === 'iron');
  const IRONS = [4, 5, 6, 7, 8, 9, 10];
  // ===================== 1. iron sets: the whole set
  out.push('1. IRON SETS, 4 iron to PW (stock, Power 5): loft · carry / total · apex · spin · landing angle');
  out.push(`   ${padE('model', 34)}${IRONS.map((i) => padE(C[i].name.replace('Pitching Wedge', 'PW'), 30)).join('')}`);
  const setRows = {};
  for (const id of [null, ...ironIds]) {
    for (const i of IRONS) apply(i, id);
    const cells = IRONS.map((i) => { const s = stock(i); return { i, s, txt: `${f(C[i].loft, 1)} ${f(s.carry, 0)}/${f(s.total, 0)} ${f(s.apex, 0)} ${f(s.r.spin / 1000, 1)}k ${f(s.land, 0)}°` }; });
    setRows[id || 'base'] = cells;
    out.push(`   ${padE(id ? `${M[id].name} (${M[id].cat})` : 'base irons (the test round)', 34)}${cells.map((c) => padE(c.txt, 30)).join('')}`);
  }
  resetAll();
  const ref = { h2: stock(2).carry, h3: stock(3).carry, gw: stock(11).carry, w3: stock(1).carry };
  out.push(`   for the gaps: 2 hybrid ${f(ref.h2, 0)}, 3 hybrid ${f(ref.h3, 0)}, gap wedge ${f(ref.gw, 0)} (base clubs)`);
  out.push('   each set\'s 4 iron against the 3 hybrid, and its PW against the gap wedge (carry gaps):');
  for (const id of ironIds) { const r = setRows[id]; out.push(`      ${padE(M[id].name, 26)} 3 hybrid → 4 iron ${sgn(ref.h3 - r[0].s.carry)} · 9 iron → PW ${sgn(r[5].s.carry - r[6].s.carry)} · PW → GW ${sgn(r[6].s.carry - ref.gw)}`); }
  // ===================== 2. the 7 iron, every model: the claims
  out.push('', '2. EACH IRON MODEL ON ITS 7 IRON, against the Wilson Staff Model Blade (the tuning targets\' reference)',
    '   carry Δ, spin Δ, landing Δ (vs the blade) · roll on a green · Low 2 apex / carry · draw preset curve · a 5° mouse path · toe 10 mm: carry, side · Dex 2 / Dex 5: 2σ wide × deep, % within 10 yds');
  apply(7, 'i-wmb'); const blade = stock(7);
  const r7 = {};
  for (const id of [null, ...ironIds]) {
    apply(7, id);
    const s = stock(7), gr = stock(7, SU, {}, 'fairway', 'green'), lo = stock(7, { ...SU, traj: -2 }), p5 = stock(7, SU, { thetaMouse: 5 }), toe = stock(7, SU, { sigma: 10 / 1.0056, lateSign: 1 });
    const sv = g.solveShape(7, -1), dr = stock(7, { ...SU, face: sv.face, stance: sv.stance }), curve = Math.abs(dr.side - Math.tan(dr.r.hla * Math.PI / 180) * dr.carry);
    const d2 = mc(7, 2), d5 = mc(7, 5);
    r7[id || 'base'] = { s, gr, lo, p5, toe, curve, d2, d5 };
    out.push(`   ${padE(id ? M[id].name : 'base 7 iron', 26)} ${pad(sgn(s.carry - blade.carry), 4)} ${pad(sgn(s.r.spin - blade.r.spin), 6)} ${pad(sgn(s.land - blade.land, 1), 5)}° · green roll ${pad(f(gr.roll, 1), 4)} · Low 2 ${pad(f(lo.apex, 0), 2)} / ${pad(f(lo.carry, 0), 3)} · draw ${pad(f(curve, 0), 2)} · 5° path ${pad(f(p5.side, 1), 5)} · toe ${pad(sgn(toe.carry - s.carry), 3)}, ${pad(f(toe.side, 0), 3)} · ${f(d2.wide, 1)} × ${f(d2.deep, 1)}, ${pad(f(d2.hit * 100, 0), 2)}% / ${f(d5.wide, 1)} × ${f(d5.deep, 1)}, ${pad(f(d5.hit * 100, 0), 2)}%`);
  }
  // the same dispersion on the 4 iron
  out.push('   on the 4 iron (Dex 2 / Dex 5: 2σ wide × deep, % within 10 yds):');
  for (const id of [null, ...ironIds]) { apply(4, id); const d2 = mc(4, 2), d5 = mc(4, 5); out.push(`      ${padE(id ? M[id].name : 'base 4 iron', 26)} ${f(d2.wide, 1)} × ${f(d2.deep, 1)}, ${f(d2.hit * 100, 0)}% / ${f(d5.wide, 1)} × ${f(d5.deep, 1)}, ${f(d5.hit * 100, 0)}%`); }
  resetAll();
  // ===================== 3. the starter set's flaws, one at a time (7 iron, Dex 2 = a new career)
  out.push('', '3. THE STARTER IRONS (AP1 716), 7 iron at Dexterity 2 (a new career): each flaw on its own, then the set as sold');
  const ap = M['i-ap1'], apMods = g.modelMods(ap, 7);
  const variants = [['the AP1 with none of its flaws (consist 1, groove 1, no bent lie)', { consist: 1, groove: 1 }], ['+ worn shafts (consist 1.8)', { groove: 1 }], ['+ worn grooves (groove 0.8)', { consist: 1 }],
    ['as sold, no bent lie', {}], ['as sold, a typical bent lie (0.6°)', { lieBias: 0.6 }], ['as sold, the worst bent lie (1.2°)', { lieBias: 1.2 }]];
  for (const [name, ex] of variants) {
    apply(7, 'i-ap1', ex); const d = mc(7, 2), rl = mc(7, 2, 400, 'light');
    out.push(`   ${padE(name, 64)} mean ${f(d.mz, 0)} (${sgn(d.mx, 1)} side) · 2σ ${f(d.wide, 1)} × ${f(d.deep, 1)} · within 10 yds ${f(d.hit * 100, 0)}% · light rough: spin ${f(rl.spin, 0)}, fliers ${f(rl.flier * 100, 0)}%`);
  }
  void apMods;
  for (const id of ['i-takomo', 'i-zxi7', 'i-wmb']) { apply(7, id); const d = mc(7, 2), rl = mc(7, 2, 400, 'light'); out.push(`   ${padE(`a new ${M[id].name} (${M[id].cat})`, 64)} mean ${f(d.mz, 0)} (${sgn(d.mx, 1)} side) · 2σ ${f(d.wide, 1)} × ${f(d.deep, 1)} · within 10 yds ${f(d.hit * 100, 0)}% · light rough: spin ${f(rl.spin, 0)}, fliers ${f(rl.flier * 100, 0)}%`); }
  resetAll();
  // ===================== 4. drivers
  out.push('', '4. DRIVERS (teed, stock): carry / total, then carry and side at 8 and 14 mm toe (+) and heel (−); then Dex 2 / 5 spread',
    '   model                        carry/total  spin   launch    toe 8      toe 14     heel 8     heel 14    Dex 2: mean side, 2σ wide, % in a 30-yd fairway   Dex 5');
  const drvIds = Object.keys(M).filter((id) => M[id].kind === 'driver');
  for (const id of [null, ...drvIds]) {
    apply(0, id);
    const s = stock(0), cell = (mm, side) => { const x = stock(0, SU, { sigma: mm / 1.0056, lateSign: side }); return `${pad(f(x.carry, 0), 3)} ${pad(f(x.side, 0), 3)}`; };
    const fw = (dex) => { const rnd = g.rng32(777), bell = () => rnd() + rnd() - 1, S = g.SPREAD; let inF = 0, sx = 0, sxx = 0; const N = 500;
      for (let k = 0; k < N; k++) { const r = g.computeImpact({ bs: 1 + S.backswing * bell(), ds: 1, thetaMouse: S.mouseDeg * 2 * bell(), sigma: S.wobble * rnd(), lateSign: rnd() < 0.5 ? 1 : -1, vImpact: 1, vPeak: 1, miss: 0 }, SU, C[0], env('fairway', dex, true), rnd), x = fly(r, true); sx += x.side; sxx += x.side * x.side; if (Math.abs(x.side) <= 15) inF++; }
      const m = sx / N; return `${pad(sgn(m, 1), 5)}, ±${pad(f(2 * Math.sqrt(sxx / N - m * m), 1), 4)}, ${pad(f(inF / N * 100, 0), 2)}%`; };
    out.push(`   ${padE(id ? `${M[id].name} (${M[id].cat})` : 'base driver', 28)} ${pad(f(s.carry, 0), 4)}/${pad(f(s.total, 0), 3)}  ${pad(f(s.r.spin, 0), 4)}  ${pad(f(s.r.vla, 1), 5)}    ${cell(8, 1)}    ${cell(14, 1)}    ${cell(8, -1)}    ${cell(14, -1)}    ${fw(2)}                     ${fw(5)}`);
  }
  resetAll();
  // ===================== 5. fairway woods and hybrids (the driver lines at half strength)
  out.push('', '5. FAIRWAY WOODS / HYBRIDS on the 3 wood and the 3 hybrid: carry / total, Dex 2 2σ wide, toe 10 mm side');
  for (const id of [null, ...Object.keys(M).filter((k) => M[k].kind === 'wood')]) {
    apply(1, id); apply(3, id);
    const a = stock(1), b = stock(3), da = mc(1, 2, 300), db = mc(3, 2, 300), ta = stock(1, SU, { sigma: 10 / 1.0056, lateSign: 1 }), tb = stock(3, SU, { sigma: 10 / 1.0056, lateSign: 1 });
    out.push(`   ${padE(id ? `${M[id].name} (${M[id].price ? '$' + M[id].price : 'starter'})` : 'base', 46)} 3 wood ${f(a.carry, 0)}/${f(a.total, 0)}, ±${f(da.wide / 2, 1)}, toe ${f(ta.side, 0)} · 3 hybrid ${f(b.carry, 0)}/${f(b.total, 0)}, ±${f(db.wide / 2, 1)}, toe ${f(tb.side, 0)}`);
  }
  resetAll();
  // ===================== 6. wedges
  out.push('', '6. WEDGES on the sand wedge (bounce applies) and the lob wedge, Dexterity 2: full carry and spin; from a greenside bunker',
    '   and heavy rough (mean carry ± 1 sd, spin); light rough spin and fliers; the flop\'s complexity (lob wedge); the stock chip spin');
  const wIds = Object.keys(M).filter((id) => M[id].kind === 'wedge');
  const flopSU = { face: 7, ballPos: 0.8, stance: -7, traj: 2, spinCtl: 0, flop: true, align: { face: 7, stance: -7, ballPos: 0.8 } };
  for (const id of [null, ...wIds]) {
    apply(12, id); apply(13, id);
    const s = stock(12), bk = mc(12, 2, 400, 'bunker'), hv = mc(12, 2, 400, 'heavy'), lt = mc(12, 2, 400, 'light');
    const fl = g.computeImpact({ bs: 1, ds: 1, thetaMouse: 0, sigma: 0, lateSign: 1, vImpact: 1, vPeak: 1, miss: 0 }, flopSU, C[13], { ...env('fairway', 2, false), stock: true }, () => 0.5);
    const c = C[12];
    out.push(`   ${padE(id ? `${M[id].name} (${M[id].cat})` : 'base', 30)} bounce ${pad(c.bounce || 0, 2)} · full ${f(s.carry, 0)}, ${f(s.r.spin, 0)} rpm · bunker ${f(bk.mc, 0)} ± ${f(bk.sc, 1)}, ${f(bk.spin, 0)} · heavy ${f(hv.mc, 0)} ± ${f(hv.sc, 1)}, ${f(hv.spin, 0)} · light ${f(lt.spin, 0)}, fliers ${f(lt.flier * 100, 0)}% · flop cx ${f(fl.cx.flop, 2)} (total ${f(fl.complexity, 2)}) · Dex 2 full: ±${f(mc(12, 2, 300).wide / 2, 1)} wide`);
  }
  resetAll();
  // ===================== 7. putters: a flat green, Stimp 11, the same human stroke errors for every putter
  out.push('', '7. PUTTERS on a flat Stimp 11 green, Dexterity 5, 2,000 putts each with the same stroke errors (path ±1° sd, tempo ±8% sd,',
    '   gate excursion |0.03| sd, wobble 1–4 px, length ±6% sd): % holed and the average leave of the misses (ft)');
  const gauss = (rnd) => { let s = 0; for (let k = 0; k < 6; k++) s += rnd(); return (s - 3) / Math.sqrt(0.5); };
  const putters = Object.keys(g.PUTTERS);
  const surf = g.makeSurface({ stimp: 11, outline: { x: 0, z: -4, rx: 16.5, rz: 16.5 } });
  out.push(`   ${padE('putter', 40)} gate  pathGain sweet tempoZone    6 ft          10 ft         20 ft         40 ft`);
  for (const pid of putters) {
    const P = g.PUTTERS[pid], cells = [];
    for (const [ft, scale] of [[6, 15], [10, 15], [20, 40], [40, 40]]) {
      const rnd = g.rng32(99 + ft); let holed = 0, leave = 0, nm = 0; const N = 2000;
      const green = { ...surf, hole: { x: 0, z: -ft * FT } };
      for (let k = 0; k < N; k++) {
        const len = (ft + g.PUTT.diePastFt) / scale * (1 + 0.06 * gauss(rnd));
        const sw = { thetaMouse: 1.0 * gauss(rnd), excursion: Math.abs(0.03 * gauss(rnd)), tempo: 1 + 0.08 * gauss(rnd), sigma: 1 + 3 * rnd(), lateSign: rnd() < 0.5 ? 1 : -1, miss: 0, len };
        const res = g.computePutt(sw, P, { scaleFt: scale, stimp: 11, composure: 5, badStreak: 0, dex: 5 }, rnd);
        const q = g.createPutt(green, res.v0, res.start, res.skidFt);
        for (let n = 0; q.phase === 'roll' && n < 20000; n++) g.stepPutt(q, 1 / 240);
        if (q.holed) holed++; else { leave += Math.hypot(q.p.x - green.hole.x, q.p.z - green.hole.z) / FT; nm++; }
      }
      cells.push(`${pad(f(holed / N * 100, 0), 3)}%, ${f(leave / Math.max(1, nm), 1)}`);
    }
    out.push(`   ${padE(`${P.name}${P.lux ? ' ✦' : ''}`, 40)} ${f(P.gate, 3)} ${pad(f(P.pathGain, 2), 5)} ${pad(f(P.sweet, 1), 6)} ${pad(f(P.tempoZone, 3), 7)}     ${cells.map((c) => padE(c, 14)).join('')}`);
  }
  // ===================== 8. prices and the shop's bars
  out.push('', '8. PRICES AND THE SHOP\'S OWN NUMBERS (shopStats: the test club, standard stats)');
  for (const id of Object.keys(M)) { const s = g.shopStats(id); out.push(`   ${padE(id, 16)} ${padE(M[id].kind, 7)} ${padE(M[id].cat, 17)} $${pad(M[id].price, 6)} · carry ${f(s.carry, 0)} · land ${f(s.land, 0)}° · forgive ${f(s.forgive, 2)} · shape ${f(s.shape, 2)} · offset ${f(s.offset, 1)}`); }
  resetAll();
  return out.join('\n');
})()
