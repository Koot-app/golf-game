// Swing audit fixes S3.2 (a ball that runs onto the green rolls by the green's rules), S8.2 (the long-club low runner),
// the Dexterity scale (S6.4 again: Dex 1-2 a beginner, 8-9 a tour pro, 10 the best), and the S9.2 re-measure.
//   node tools/test/probe.js "http://127.0.0.1:8090/?nohome" - @tools/test/swing-fix16.js 0 swing-fix16
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 50 && !window.__golf; i++) await sleep(200);
  const g = window.__golf, YD = 0.9144, FT = 0.3048, out = [], C = g.CLUBS, st = g.state, T = g.TUNE;
  const f = (v, n = 1) => (v === null || v === undefined || Number.isNaN(v) ? '—' : v.toFixed(n));
  const padE = (s, n) => String(s).padEnd(n);
  const SU = { face: 0, ballPos: 0, stance: 0, traj: 0, spinCtl: 0 };
  const SW0 = { bs: 1, ds: 1, thetaMouse: 0, sigma: 0, lateSign: 1, vImpact: 1, vPeak: 1, miss: 0 };
  const env = (o = {}) => ({ lie: 'fairway', slope: 'flat', power: 5, dex: 5, composure: 5, badStreak: 0, teed: false, ...o });
  const run = (L, teed) => { const fl = g.createFlight(L, { x: 0, z: 0 }, teed ? 0.04 : 0); for (let n = 0; fl.phase !== 'stopped' && fl.phase !== 'holed' && n < 40000; n++) g.stepFlight(fl, 1 / 240); return fl; };
  st.lie = 'fairway'; st.slope = 'flat'; st.power = 5; st.dex = 5; st.composure = 5; st.badStreak = 0; st.height = 0; st.spinCtl = 0;

  // ===== S3.2: a shot that lands short and runs onto the green
  {
    // a test green: fairway up to `front` yds, then green (its Stimp, a cross-slope `side` m/m to the right)
    const view = (front, stimp, side = 0) => ({ decel: g.rollDecel(stimp), stimp, hole: { x: 0, z: -1e5 }, h: () => 0, grad: () => ({ x: side, z: 0 }), surfAt: (x, z) => (-z > front * YD ? 'green' : 'fairway'), drag: (x, z) => (-z > front * YD ? g.CHIP.surf.green.drag : g.CHIP.surf.fairway.drag) });
    out.push('S3.2 A SHOT THAT LANDS SHORT AND RUNS ONTO THE GREEN: the stock driver (teed) and a 7 iron Low 2, the green starting 8 yds past where it lands',
      '   total yds, and sideways on a 2% cross-slope (before: the fairway\'s roll all the way, the same at every Stimp, and no break)');
    for (const [name, ci, su] of [['Driver', 0, SU], ['7 Iron, Low 2', 7, { ...SU, traj: -2 }]]) {
      const teed = !!C[ci].tee, r = g.computeImpact(SW0, su, C[ci], env({ teed, stock: true }), () => 0.5);
      const L = { ballSpeed: r.ballSpeed, vla: r.vla, dir: 0, spin: r.spin, axis: 0, release: 0, ground: () => g.SURF.fairway };
      const plain = run(L, teed), carry = plain.carry / YD, front = carry + 8;
      const cells = [9, 11.5, 14].map((s) => { const fl = run({ ...L, green: view(front, s) }, teed); return `Stimp ${s}: ${f(-fl.p.z / YD)}`; });
      const sl = run({ ...L, green: view(front, 11.5, 0.02) }, teed);
      out.push(`   ${padE(name, 14)} carry ${f(carry, 0)} · on the fairway all the way ${f(-plain.p.z / YD)} · onto a green ${cells.join(' / ')} · 2% slope, Stimp 11.5: ${f(sl.p.x / YD)} yds right`);
    }
  }

  // ===== S8.2: the low runner
  {
    if (st.mode !== 'chip') { g.setMode('chip'); await sleep(400); }
    st.view = 'address';
    out.push('', `S8.2 THE LOW RUNNER (chip table, flat green Stimp ${f(g.green ? g.green.stimp : NaN, 1)}): carry · roll · roll ÷ carry at a 25% backswing, and yds of total per 1% of backswing (20 → 35%)`,
      '   (before: the 7 iron 1:6 at 25% (S8.1); rule of thumb 1:4 for a 7 iron, 1:3 for a 9 iron, 1:2 for a PW)');
    const at = (rows, bs) => { let a = rows[0]; for (const r of rows) if (r.bs <= bs + 1e-9) a = r; return a; };
    for (const ci of [7, 8, 9, 10]) {
      st.club = ci; g.applyChipType('low', true);
      const cells = [];
      for (const [lbl, h] of [['before (Low 2)', -2], ['now', st.height]]) {
        st.height = h; const rows = g.chipTable(), a = at(rows, 0.26), b20 = at(rows, 0.2), b35 = at(rows, 0.36);
        cells.push(`${lbl}: ${f(a.carry / YD)} · ${f((a.total - a.carry) / YD)} · 1:${f((a.total - a.carry) / Math.max(0.01, a.carry))} · ${f((b35.total - b20.total) / YD / ((b35.bs - b20.bs) * 100), 2)} yd/1%`);
      }
      g.applyChipType('low', true);
      out.push(`   ${padE(C[ci].name, 15)} height ${st.height} · ${cells.join('   |   ')}`);
    }
    g.applyChipType('stock', true); g.setMode('range'); await sleep(300);
    // the smoothness check of swing-fix9.js, at the heights the game now uses (swing-fix9 reads each preset's own height)
    const T2 = g.CHIP_TYPES, vw = { decel: g.rollDecel(11), stimp: 11, hole: { x: 0, z: -1e5 }, h: () => 0, grad: () => ({ x: 0, z: 0 }), surfAt: () => 'green', drag: () => 1 };
    const suOf = (k, ci, hOld) => { const t = T2[k]; return { face: t.face, ballPos: t.ballPos, stance: t.stance, traj: hOld ? t.height : t.heightFor ? t.heightFor(C[ci]) : t.height, spinCtl: 0, align: { face: t.face, stance: t.stance, ballPos: t.ballPos }, flop: !!t.flop }; };
    const tot = (ci, s, bs) => { const r = g.computeImpact({ ...SW0, bs }, s, C[ci], env({ stock: true }), () => 0.5); const fl = g.runChip(vw, { ballSpeed: r.ballSpeed, vla: r.vla, dir: 0, spin: r.spin, axis: 0, release: 0 }); return Math.hypot(fl.p.x, fl.p.z) / YD; };
    for (const hOld of [true, false]) {
      let drops = 0, worst = 0, where = '—';
      for (const ci of [7, 9, 10, 11, 12, 13]) for (const type of ['low', 'stock', 'high']) { let prev = -1; for (let bs = 0.12; bs <= 0.8; bs += 0.02) { const t = tot(ci, suOf(type, ci, hOld), bs); if (t < prev - 1) { drops++; if (prev - t > worst) { worst = prev - t; where = `${C[ci].name} ${type} ${f(bs * 100, 0)}%`; } } prev = Math.max(prev, t); } }
      out.push(`   chip totals that fall by over a yard as the backswing grows (swing-fix9's check), ${hOld ? 'before' : 'now   '}: ${drops} (worst ${f(worst)} yds, ${where})`);
    }
  }

  // ===== Dexterity: the scale
  const sigma = (ci, dex, su = SU, N = 600, seed = 4242) => {
    const rnd = g.rng32(seed + ci), teed = !!C[ci].tee, P = [];
    for (let k = 0; k < N; k++) { const r = g.computeImpact(g.spreadSwing(rnd), su, C[ci], env({ dex, teed }), rnd); const fl = g.createFlight({ ballSpeed: r.ballSpeed, vla: r.vla, dir: r.hla, spin: r.spin, axis: r.axis, release: r.release }, { x: 0, z: 0 }, teed ? 0.04 : 0); for (let n = 0; fl.phase !== 'stopped' && n < 20000; n++) g.stepFlight(fl, 1 / 120); P.push({ x: fl.p.x / YD, z: -fl.p.z / YD }); }
    const m = P.reduce((a, b) => a + b.x, 0) / N;
    return { s: Math.sqrt(P.reduce((a, b) => a + (b.x - m) ** 2, 0) / N), fw: P.filter((p) => Math.abs(p.x) <= 16).length / N };
  };
  {
    out.push('', `DEXTERITY (TUNE.dexSpreadByDex ${JSON.stringify(T.dexSpreadByDex)}): sideways σ in yds with the default hand, 600 swings; the driver's share inside a 32-yd fairway`,
      '   (targets: Dex 1 a beginner, driver ~40 / 7 iron ~11-13; Dex 8-9 a tour pro, ~17-19 (about 60% of fairways) / ~4.5-5; Dex 10 the best, ~15 / ~4)');
    const old = [1.0, 0.898, 0.796, 0.693, 0.591, 0.489, 0.387, 0.284, 0.25, 0.25], now = T.dexSpreadByDex.slice();
    for (let d = 1; d <= 10; d++) {
      T.dexSpreadByDex = old; const db = sigma(0, d), ib = sigma(7, d);
      T.dexSpreadByDex = now; const da = sigma(0, d), ia = sigma(7, d);
      out.push(`   Dex ${String(d).padStart(2)}: driver ${f(db.s)} (${f(db.fw * 100, 0)}%) → ${f(da.s)} (${f(da.fw * 100, 0)}%) · 7 iron ${f(ib.s)} → ${f(ia.s)}`);
    }
    T.dexSpreadByDex = now;
  }

  // ===== S9.2: the difficulty read-out against the real spread
  {
    out.push('', 'S9.2 THE DIFFICULTY READ-OUT ("1.xx×") against the real spread each ask causes (default hand, 800 swings): read-out → sideways σ as × the stock shot\'s');
    const asks = [['105%', { bs: 1.05 }], ['110%', { bs: 1.10 }], ['draw', { shape: -1 }], ['fade', { shape: 1 }], ['High 1', { traj: 1 }], ['High 2', { traj: 2 }], ['Low 1', { traj: -1 }], ['Low 2', { traj: -2 }], ['More spin', { spinCtl: 1 }], ['Less spin', { spinCtl: -1 }], ['High 1 draw', { traj: 1, shape: -1 }], ['Low 1 fade', { traj: -1, shape: 1 }]];
    for (const ci of [7, 0, 10]) for (const dex of [2, 5, 8]) {
      st.dex = dex; st.height = 0; st.spinCtl = 0;
      const base = sigma(ci, dex, SU, 800, 777).s, cells = [];
      for (const [name, o] of asks) {
        st.height = o.traj || 0; st.spinCtl = o.spinCtl || 0;
        const sh = o.shape ? g.solveShape(ci, o.shape) : { face: 0, stance: 0 }, su = { ...SU, traj: o.traj || 0, spinCtl: o.spinCtl || 0, face: sh.face, stance: sh.stance };
        const r = g.computeImpact({ ...SW0, bs: o.bs || 1 }, su, C[ci], env({ dex, teed: !!C[ci].tee, stock: true }), () => 0.5);
        let s;
        if (o.bs) { const rnd = g.rng32(777 + ci), teed = !!C[ci].tee, P = []; for (let k = 0; k < 800; k++) { const sw = { ...g.spreadSwing(rnd) }; sw.bs = sw.bs - 1 + o.bs; const rr = g.computeImpact(sw, su, C[ci], env({ dex, teed }), rnd); const fl = g.createFlight({ ballSpeed: rr.ballSpeed, vla: rr.vla, dir: rr.hla, spin: rr.spin, axis: rr.axis, release: rr.release }, { x: 0, z: 0 }, teed ? 0.04 : 0); for (let n = 0; fl.phase !== 'stopped' && n < 20000; n++) g.stepFlight(fl, 1 / 120); P.push(fl.p.x / YD); } const m = P.reduce((a, b) => a + b, 0) / P.length; s = Math.sqrt(P.reduce((a, b) => a + (b - m) ** 2, 0) / P.length); }
        else s = sigma(ci, dex, su, 800, 777).s;
        cells.push(`${name} ${f(1 + r.complexity, 2)}→${f(s / base, 2)}`);
      }
      out.push(`   ${padE(C[ci].name, 15)} Dex ${dex} (stock σ ${f(base)}): ${cells.join(' · ')}`);
    }
    st.dex = 5; st.height = 0; st.spinCtl = 0;
    // the new read: "spreads N× the stock shot" (spreadRatio, from landSpread) against the real RMS radius of 800 more swings
    out.push('', '   THE NEW SPREAD READ (S9.2 fix): what the card says ("spreads N×") → the real ratio of RMS radii (sideways and depth) from 800 other swings, Dex 5');
    if (st.mode !== 'range') { g.setMode('range'); await sleep(300); }
    st.view = 'address'; st.lie = 'fairway';
    const rms = (ci, su, seed) => { const rnd = g.rng32(seed + ci), teed = !!C[ci].tee, P = []; for (let k = 0; k < 800; k++) { const r = g.computeImpact(g.spreadSwing(rnd), su, C[ci], env({ dex: 5, teed }), rnd); const fl = g.createFlight({ ballSpeed: r.ballSpeed, vla: r.vla, dir: r.hla, spin: r.spin, axis: r.axis, release: r.release }, { x: 0, z: 0 }, teed ? 0.04 : 0); for (let n = 0; fl.phase !== 'stopped' && n < 20000; n++) g.stepFlight(fl, 1 / 120); P.push(fl.p); } const mx = P.reduce((a, b) => a + b.x, 0) / P.length, mz = P.reduce((a, b) => a + b.z, 0) / P.length; return Math.sqrt(P.reduce((a, b) => a + (b.x - mx) ** 2 + (b.z - mz) ** 2, 0) / P.length); };
    for (const ci of [7, 0, 10]) {
      st.club = ci; st.dex = 5;
      const base = rms(ci, SU, 999), cells = [];
      for (const [name, o] of asks.filter(([, o]) => !o.bs)) {
        st.height = o.traj || 0; st.spinCtl = o.spinCtl || 0;
        const sh = o.shape ? g.solveShape(ci, o.shape) : { face: 0, stance: 0 }; st.face = sh.face; st.stance = sh.stance; st.ballPos = 0;
        const t0 = performance.now(), shown = g.spreadRatio(ci), ms = performance.now() - t0;
        const real = rms(ci, g.setup(), 999) / base;
        cells.push(`${name} ${f(shown, 2)}→${f(real, 2)}${ms > 5 ? ` (${f(ms, 0)} ms)` : ''}`);
      }
      out.push(`   ${padE(C[ci].name, 15)} ${cells.join(' · ')}`);
    }
    st.height = 0; st.spinCtl = 0; st.face = 0; st.stance = 0; st.club = 7;
  }
  return out.join('\n');
})()
