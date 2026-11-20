// Swing audit fixes S1.7 (wobble around a fitted curve), S1.8 (which mouse lock the browser gave), S7.3 (the driver's
// draw against its fade), S7.4 (More spin from rough) and S5.9 (the starter irons): the re-measures.
//   node tools/test/probe.js "http://127.0.0.1:8090/?nohome" - @tools/test/swing-fix11.js 0 swing-fix11
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 50 && !window.__golf; i++) await sleep(200);
  const g = window.__golf, YD = 0.9144, D2R = Math.PI / 180, out = [], C = g.CLUBS, M = g.CLUB_MODELS, st = g.state;
  const f = (v, n = 1) => (v === null || v === undefined || Number.isNaN(v) ? '—' : v.toFixed(n));
  const padE = (s, n) => String(s).padEnd(n), sgn = (v, n = 0) => `${v > 0.05 ? '+' : v < -0.05 ? '−' : '±'}${f(Math.abs(v), n)}`;
  st.lie = 'fairway'; st.slope = 'flat'; st.power = 5; st.dex = 5; st.composure = 5; st.badStreak = 0; st.height = 0; st.spinCtl = 0;
  const SU = { face: 0, ballPos: 0, stance: 0, traj: 0, spinCtl: 0 };
  const env = (lie, dex, teed, stock) => ({ lie, slope: 'flat', power: 5, dex, composure: 5, badStreak: 0, teed, stock });
  const fly = (r, teed, ground) => {
    const fl = g.createFlight({ ballSpeed: r.ballSpeed, vla: r.vla, dir: r.hla, spin: r.spin, axis: r.axis, release: r.release, ground: ground ? () => g.SURF[ground] : null }, { x: 0, z: 0 }, teed ? 0.04 : 0);
    for (let n = 0; fl.phase !== 'stopped' && n < 30000; n++) g.stepFlight(fl, 1 / 120);
    return { carry: fl.carry / YD, total: -fl.p.z / YD, side: fl.p.x / YD, roll: (-fl.p.z - (fl.land ? -fl.land.z : 0)) / YD };
  };
  const SW0 = { bs: 1, ds: 1, thetaMouse: 0, sigma: 0, lateSign: 1, vImpact: 1, vPeak: 1, miss: 0 };
  const stock = (ci, su = SU, lie = 'fairway', ground = null) => { const teed = !!C[ci].tee && lie === 'fairway'; const r = g.computeImpact(SW0, su, C[ci], env(lie, st.dex, teed, true), () => 0.5); return { r, ...fly(r, teed, ground) }; };

  // ---- S1.7: the wobble of a smooth arc, and of real shake
  {
    st.practice = true;
    const cal = st.cal = { swingPx: 800, vTarget: 800 / 139 }, L = 800;
    // a downswing (constant acceleration, 1 report a ms) with a bulge sag*4u(1-u), a shake wobble*sin(3πu) and a path angle
    const stroke = ({ sag = 0, wobble = 0, angle = 0, a2 = 0 }) => {
      g.beginSwing(true);
      const slope = -Math.tan(angle * D2R), yTop = slope * L + a2 * L * L;
      let t = 1000, x = 0, y = 0;
      const to = (nx, ny) => { g.swingSample(nx - x, ny - y, t += 1); x = nx; y = ny; };
      for (let i = 1; i <= 400; i++) { const u = 0.5 - 0.5 * Math.cos(Math.PI * i / 400); to(-L * u, yTop * u); }
      const Td = 2 * L / cal.vTarget;
      for (let i = 1; i <= Td + 40 && g.swing.phase !== 'through'; i++) {
        const tau = i, dx = tau <= Td ? L * (tau / Td) ** 2 : L + cal.vTarget * (tau - Td), u = Math.min(1, dx / L);
        to(-L + dx, yTop - slope * dx - a2 * dx * dx + wobble * Math.sin(3 * Math.PI * Math.min(1, tau / Td)) + sag * 4 * u * (1 - u));
      }
      const s = g.swing, sw = s.iImp >= 0 ? g.analyzeSwing(s.S, s.iTop, s.iImp, cal) : null;
      g.endSwing('silent');
      return sw;
    };
    out.push('S1.7 THE WOBBLE OF A SMOOTH STROKE (800-count swing, 1,000 reports a second): wobble read px · the fitted bulge · path read',
      '   (before the fix: an arc bulging 1% / 2% / 4% / 6% read 0.80 / 1.59 / 3.15 / 4.78 px)');
    for (const p of [0, 1, 2, 4, 6, 8, 10, 12, 15, 20]) { const sw = stroke({ sag: p / 100 * L }); out.push(`   an arc bulging ${String(p).padStart(2)}% of the swing: wobble ${f(sw.sigma, 2)} px · bulge ${f(-sw.bulge * 100, 1)}% · path ${f(sw.thetaMouse, 2)}°`); }
    for (const [name, o] of [['a 6-count shake, straight', { wobble: 6 }], ['a 6-count shake on a 5% arc', { wobble: 6, sag: 40 }], ['a 12-count shake, straight', { wobble: 12 }], ['a 5° in-to-out line', { angle: 5 }], ['a 5° line on a 5% arc', { angle: 5, sag: 40 }], ['curved: square at the top, 8° in-to-out at the ball', { a2: (-Math.tan(8 * D2R)) / (2 * L) }]]) {
      const sw = stroke(o); out.push(`   ${padE(name, 52)} wobble ${f(sw.sigma, 2)} px · bulge ${f(-sw.bulge * 100, 1)}% · path ${f(sw.thetaMouse, 2)}°`);
    }
    // what a wobble costs at impact: the strike's spread (mm sd over 400 seeded swings), 7 iron
    const strikeSd = (sigma, dex) => { const rnd = g.rng32(99); let s = 0, s2 = 0; for (let k = 0; k < 400; k++) { const r = g.computeImpact({ ...SW0, sigma, lateSign: rnd() < 0.5 ? 1 : -1 }, SU, C[7], env('fairway', dex, false), rnd); s += r.strike; s2 += r.strike * r.strike; } return Math.sqrt(s2 / 400 - (s / 400) ** 2); };
    out.push('   the strike\'s spread (mm sd, 7 iron) at wobble 0 / 1.6 / 3.2 / 4.8 px, Dexterity 1 / 5 / 10:');
    for (const dex of [1, 5, 10]) out.push(`      Dex ${String(dex).padStart(2)}: ${[0, 1.6, 3.2, 4.8].map((s) => f(strikeSd(s, dex), 2)).join(' / ')}`);
    out.push(`   SPREAD (the minimap's assumed hand): wobble ${g.SPREAD.wobbleLo}–${g.SPREAD.wobbleLo + g.SPREAD.wobble} px`);
    st.practice = false;
  }

  // ---- S1.8: the lock the browser gave
  {
    st.practice = true;
    const before = st.mouseLock;
    g.beginSwing(false); await sleep(400);
    const got = st.mouseLock; g.endSwing('silent');
    const note = document.getElementById('mouseLockNote');
    out.push('', `S1.8 THE MOUSE LOCK: before a swing "${before}" · after one (a headless browser, no click, so the raw lock is refused): "${got}"`,
      `   Settings: ${note ? note.textContent : 'no note'}`);
    g.setMouseLock('raw'); out.push(`   granted raw: ${note.textContent}`);
    g.setMouseLock(got);
    const tips = [].concat(g.tipsHTML()).join('');
    out.push(`   the tips mention it: ${/speeds up fast mouse movement/.test(tips) ? 'yes' : 'no'}`);
    st.practice = false;
  }

  // ---- S7.3: draw − fade
  {
    out.push('', 'S7.3 THE SOLVED DRAW MINUS THE SOLVED FADE (Dexterity 5, fairway): total · carry · roll (draw / fade) · spin · launch',
      '   (before the fix, the same measure: driver +6.0, 3 wood +5.8, hybrids +5.5, 4 / 5 / 6 iron +5.7 / +6.0 / +7.0, 7 iron +7.4)');
    for (let ci = 0; ci < 14; ci++) {
      const d = stock(ci, { ...SU, ...g.solveShape(ci, -1) }), fd = stock(ci, { ...SU, ...g.solveShape(ci, 1) });
      const tot = (x) => Math.hypot(x.total, x.side);
      out.push(`   ${padE(C[ci].name, 15)} total ${sgn(tot(d) - tot(fd), 1)} · carry ${sgn(d.carry - fd.carry, 1)} · roll ${f(d.roll, 1)} / ${f(fd.roll, 1)} · spin ${sgn(d.r.spin - fd.r.spin)} · launch ${sgn(d.r.vla - fd.r.vla, 2)}°`);
    }
  }

  // ---- S7.4: More spin from rough
  {
    out.push('', 'S7.4 LESS / NORMAL / MORE SPIN (stock, landing on a green): spin · carry · roll · complexity');
    for (const ci of [7, 10, 12]) for (const lie of ['fairway', 'light', 'heavy']) {
      const cells = [-1, 0, 1].map((s) => stock(ci, { ...SU, spinCtl: s }, lie, 'green'));
      out.push(`   ${padE(C[ci].name, 15)} ${padE(lie, 8)} ${cells.map((c) => f(c.r.spin, 0)).join(' / ')} · ${cells.map((c) => f(c.carry, 0)).join(' / ')} · roll ${cells.map((c) => f(c.roll, 1)).join(' / ')} · cx ${cells.map((c) => f(c.r.complexity, 2)).join(' / ')}`);
    }
    st.club = 7; st.lie = 'light'; st.spinCtl = 0;
    g.setSpinCtl(1); await sleep(50); out.push(`   the toast from light rough: "${(document.getElementById('toast').textContent || '').replace(/\n/g, ' | ')}"`);
    g.setSpinCtl(0, true); st.lie = 'fairway';
    g.setSpinCtl(1); await sleep(50); out.push(`   from the fairway: "${(document.getElementById('toast').textContent || '').replace(/\n/g, ' | ')}"`);
    g.setSpinCtl(0, true);
  }

  // ---- S5.9: the starter irons
  {
    const apply = (i, id, extra) => { const c = C[i]; for (const k of Object.keys(c)) if (!(k in g.BASE_CLUBS[i])) delete c[k]; Object.assign(c, g.BASE_CLUBS[i]); if (id) Object.assign(c, g.modelMods(M[id], i), { model: id }); if (extra) Object.assign(c, extra); };
    // 500 ordinary swings, the finding's sampler (wobble 0-4 px, path ±2.4°, backswing ±5%), so the table compares
    const mc = (ci, dex, N = 500) => {
      const rnd = g.rng32(4242 + ci), bell = () => rnd() + rnd() - 1, aim = stock(ci), P = [];
      for (let k = 0; k < N; k++) { const sw = { ...SW0, bs: 1 + 0.05 * bell(), thetaMouse: 2.4 * bell(), sigma: 4 * rnd(), lateSign: rnd() < 0.5 ? 1 : -1 }; P.push(fly(g.computeImpact(sw, SU, C[ci], env('fairway', dex, false), rnd), false)); }
      const mx = P.reduce((s, p) => s + p.side, 0) / N, mz = P.reduce((s, p) => s + p.total, 0) / N;
      const sx = Math.sqrt(P.reduce((s, p) => s + (p.side - mx) ** 2, 0) / N), sz = Math.sqrt(P.reduce((s, p) => s + (p.total - mz) ** 2, 0) / N);
      return { mx, mz, wide: 2 * sx, deep: 2 * sz, hit: P.filter((p) => Math.hypot(p.side - aim.side, p.total - aim.total) <= 10).length / N };
    };
    const ap = M['i-ap1'];
    out.push('', `S5.9 THE STARTER IRONS (AP1 716: consist ${ap.set.consist}, bent lies up to ±${ap.bias}°), 7 iron, Dexterity 2: mean total, side · 2σ wide × deep · within 10 yds of the stock finish`,
      '   (before the fix: as sold 178, 3.7 L · 19.3 × 6.6 · 68%; the worst bent lie 5.0 L; a new blade 19.1 × 8.3 · 68%; a new 101 MKII 8.9 × 5.4 · 96%)');
    for (const [name, id, ex] of [['as sold, no bent lie', 'i-ap1', {}], ['as sold, a typical bent lie (+1°)', 'i-ap1', { lieBias: 1 }], [`as sold, the worst push (+${ap.bias}°)`, 'i-ap1', { lieBias: ap.bias }], [`as sold, the worst pull (−${ap.bias}°)`, 'i-ap1', { lieBias: -ap.bias }],
      ['a new Staff Model Blade', 'i-wmb', {}], ['a new 101 MKII', 'i-takomo', {}], ['a used M2 (2016), the worst bent lie', 'i-m2', { lieBias: M['i-m2'].bias }]]) {
      apply(7, id, ex); const d = mc(7, 2);
      out.push(`   ${padE(name, 40)} ${f(d.mz, 0)}, ${f(Math.abs(d.mx), 1)} ${d.mx < 0 ? 'L' : 'R'} · ${f(d.wide, 1)} × ${f(d.deep, 1)} · ${f(d.hit * 100, 0)}%`);
    }
    // the bent lie in the locker room's Curve column: a pure push turns the whole flight, so the stock finish is turned by it
    apply(7, 'i-ap1', { lieBias: 2 });
    const straight = g.computeImpact({ ...SW0 }, SU, C[7], env('fairway', 5, false), () => 0.5), real = fly(straight, false);
    apply(7, 'i-ap1', {}); const s0 = stock(7), bb = 2 * D2R, turned = (s0.side * Math.cos(bb) + s0.total * Math.sin(bb));
    out.push(`   a +2° bent lie on a straight swing (no scatter): finishes ${f(real.side, 1)} yds right of the line, carry ${f(real.carry, 0)}; the Curve column's turned stock finish ${f(turned, 1)}`);
    for (let i = 0; i < C.length; i++) apply(i, null);
  }
  return out.join('\n');
})()
