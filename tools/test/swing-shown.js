// Swing audit S9: what the player is shown against what happens. The bag's yardages and the backswing marks (stockShot /
// lieRead) against the average of real swings; the minimap's landing ellipse (landSpread + landArea's widening) against
// where real shots land; the shape preview against real shaped shots; the complexity read-out against real spread.
//   node tools/test/probe.js "http://127.0.0.1:8090/?nohome" - @tools/test/swing-shown.js 0 swing-s9
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 50 && !window.__golf; i++) await sleep(200);
  const g = window.__golf, YD = 0.9144, out = [], C = g.CLUBS, S = g.state;
  const f = (v, n = 1) => (v === null || v === undefined || Number.isNaN(v) ? '—' : v.toFixed(n));
  const pad = (s, n) => String(s).padStart(n), padE = (s, n) => String(s).padEnd(n);
  const short = (n) => n.replace('Pitching Wedge', 'PW').replace('Sand Wedge', 'SW');
  const gauss = (rnd) => { let s = 0; for (let k = 0; k < 6; k++) s += rnd(); return (s - 3) / Math.sqrt(0.5); };
  Object.assign(S, { lie: 'fairway', slope: 'flat', power: 5, dex: 5, composure: 5, badStreak: 0, height: 0, spinCtl: 0, shotShape: 'straight', face: 0, stance: 0, ballPos: 0, perception: 5 });
  const SWM = {
    game: (rnd, bs) => ({ bs: bs + g.SPREAD.backswing * (rnd() + rnd() - 1), ds: 1, thetaMouse: g.SPREAD.mouseDeg * 2 * (rnd() + rnd() - 1), sigma: g.SPREAD.wobble * rnd(), lateSign: rnd() < 0.5 ? 1 : -1, vImpact: 1, vPeak: 1, miss: 0 }),
    human: (rnd, bs) => ({ bs: bs + g.SPREAD.backswing * (rnd() + rnd() - 1), ds: 1, thetaMouse: g.SPREAD.mouseDeg * 2 * (rnd() + rnd() - 1), sigma: 1.5 + 4 * rnd(), lateSign: rnd() < 0.5 ? 1 : -1, vImpact: 1, vPeak: 1, miss: 0.02 * gauss(rnd) }),
  };
  // real shots with the live setup (setup()) and state; positions in the shot's own frame (x right, z down the line, yds)
  const real = (ci, model, N, bs = 1, seed = 1) => {
    const rnd = g.rng32(seed * 7919 + ci), su = g.setup(), teed = !!C[ci].tee && S.lie === 'fairway', P = [];
    const env = { lie: S.lie, slope: 'flat', power: S.power, dex: S.dex, composure: S.composure, badStreak: S.badStreak, teed };
    for (let k = 0; k < N; k++) {
      const r = g.computeImpact(SWM[model](rnd, bs), su, C[ci], env, rnd);
      const fl = g.createFlight({ ballSpeed: r.ballSpeed, vla: r.vla, dir: r.hla, spin: r.spin, axis: r.axis, release: r.release }, { x: 0, z: 0 }, teed ? 0.04 : 0);
      for (let n = 0; fl.phase !== 'stopped' && n < 30000; n++) g.stepFlight(fl, 1 / 120);
      P.push({ x: fl.p.x, z: fl.p.z, carry: fl.carry / YD, total: Math.hypot(fl.p.x, fl.p.z) / YD });
    }
    return P;
  };
  const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
  const clubs = [[0, 'Driver'], [3, '3 Hybrid'], [7, '7 Iron'], [10, 'PW'], [12, 'SW']];
  // ===================== 1. the bag's yardages
  out.push('1. THE BAG\'S YARDAGES (fairway) against the average of 400 real swings: shown carry / total → real mean carry / total');
  for (const dex of [2, 5, 8]) {
    S.dex = dex; const cells = [];
    for (const [ci, n] of clubs) { const st = g.stockShot(ci), h = real(ci, 'human', 400), gm = real(ci, 'game', 400); cells.push(`${n} ${f(st.carry, 0)}/${f(st.total, 0)} → human ${f(mean(h.map((p) => p.carry)), 0)}/${f(mean(h.map((p) => p.total)), 0)}, game ${f(mean(gm.map((p) => p.carry)), 0)}/${f(mean(gm.map((p) => p.total)), 0)}`); }
    out.push(`   Dex ${dex}: ${cells.join(' · ')}`);
  }
  S.dex = 5;
  // ===================== 2. the backswing marks
  out.push('', '2. THE BACKSWING MARKS (the 25 / 50 / 75% labels, lieRead carry) against 400 real partial swings at that backswing (human hand, Dex 5): shown → real mean carry');
  for (const [ci, n] of clubs) out.push(`   ${padE(n, 9)}` + [0.25, 0.5, 0.75].map((bs) => `${f(bs * 100, 0)}%: ${g.lieRead(ci, bs).carryTxt} → ${f(mean(real(ci, 'human', 400, bs).map((p) => p.carry)), 0)}`).join(' · '));
  // ===================== 3. the landing ellipse
  out.push('', '3. THE MINIMAP\'S LANDING AREA (landSpread\'s 2σ ellipse, widened down the line by the lie read as landArea does): share of 600 real shots inside it',
    '   (a true 2σ ellipse holds about 86%)');
  const inside = (ci, model) => {
    const sp = g.landSpread(ci), r = g.lieRead(ci), st = g.stockShot(ci), k2 = st.total > 0 ? r.totalMid / st.total : 1, tot = r.totalMid * YD;
    const sxx = sp.sxx * k2 * k2, szz = (sp.szz + (r.exact ? 0 : (r.half * tot / 2) ** 2)) * k2 * k2, sxz = sp.sxz * k2 * k2, mx = sp.mx * k2, mz = sp.mz * k2;
    const det = sxx * szz - sxz * sxz, P = real(ci, model, 600, 1, 3);
    const n = P.filter((p) => { const dx = p.x - mx, dz = p.z - mz; return (szz * dx * dx - 2 * sxz * dx * dz + sxx * dz * dz) / det <= 4; }).length;
    return `${f(n / P.length * 100, 0)}%`;
  };
  const cases = [['fairway, Dex 5', { dex: 5 }], ['fairway, Dex 1', { dex: 1 }], ['fairway, Dex 10', { dex: 10 }], ['light rough, Dex 5', { lie: 'light' }], ['heavy rough, Dex 5', { lie: 'heavy' }], ['fairway bunker, Dex 5', { lie: 'fbunker' }], ['tilted: 3 bad shots, Dex 5', { badStreak: 3 }], ['Low 2, Dex 5', { height: -2 }], ['draw preset, Dex 5', { shape: 'draw' }]];
  for (const [name, o] of cases) {
    Object.assign(S, { lie: 'fairway', dex: 5, badStreak: 0, height: 0, face: 0, stance: 0, shotShape: 'straight' }); Object.assign(S, { ...o, shape: undefined });
    const cells = [];
    for (const [ci, n] of clubs) {
      S.club = ci;
      if (o.shape) { const v = g.solveShape(ci, -1); S.face = v.face; S.stance = v.stance; S.shotShape = 'draw'; } else { S.face = 0; S.stance = 0; S.shotShape = 'straight'; }
      cells.push(`${n} game ${inside(ci, 'game')} / human ${inside(ci, 'human')}`);
    }
    out.push(`   ${padE(name, 28)} ${cells.join(' · ')}`);
  }
  Object.assign(S, { lie: 'fairway', dex: 5, badStreak: 0, height: 0, face: 0, stance: 0, shotShape: 'straight', club: 7 });
  // ===================== 4. the shape preview
  out.push('', '4. THE SHAPE PREVIEW (stockShot side and total, the preview line\'s end) against the mean of 400 real shaped shots (human, Dex 5)');
  for (const sg of [-1, 1]) {
    const cells = [];
    for (const [ci, n] of clubs) {
      S.club = ci; const v = g.solveShape(ci, sg); S.face = v.face; S.stance = v.stance; S.shotShape = sg < 0 ? 'draw' : 'fade';
      const st = g.stockShot(ci), P = real(ci, 'human', 400);
      cells.push(`${n} preview ${f(st.side, 1)} R, ${f(st.total, 0)} → real ${f(mean(P.map((p) => p.x)) / YD, 1)} R, ${f(mean(P.map((p) => p.total)), 0)}`);
    }
    out.push(`   ${sg < 0 ? 'draw' : 'fade'}: ${cells.join(' · ')}`);
  }
  Object.assign(S, { face: 0, stance: 0, shotShape: 'straight', club: 7 });
  // ===================== 5. the complexity read-out against real spread
  out.push('', '5. THE DIFFICULTY READ-OUT ("1.xx×", the bar) against the real spread it causes (7 iron, Dex 5, human, 400 shots): read-out → 2σ width, as × the stock width');
  {
    const width = (P) => { const m = mean(P.map((p) => p.x)); return 2 * Math.sqrt(mean(P.map((p) => (p.x - m) ** 2))) / YD; };
    const base = width(real(7, 'human', 400)), rows = [];
    const asks = [['stock', {}], ['105%', { bs: 1.05 }], ['110%', { bs: 1.10 }], ['draw', { shape: -1 }], ['fade', { shape: 1 }], ['High 1', { height: 1 }], ['High 2', { height: 2 }], ['Low 1', { height: -1 }], ['Low 2', { height: -2 }], ['More spin', { spin: 1 }], ['Less spin', { spin: -1 }], ['High 1 draw', { height: 1, shape: -1 }], ['Low 1 fade', { height: -1, shape: 1 }]];
    for (const [name, o] of asks) {
      Object.assign(S, { height: o.height || 0, spinCtl: o.spin || 0, face: 0, stance: 0, club: 7 });
      if (o.shape) { const v = g.solveShape(7, o.shape); S.face = v.face; S.stance = v.stance; }
      const su = g.setup(), r = g.computeImpact({ bs: o.bs || 1, ds: 1, thetaMouse: 0, sigma: 0, lateSign: 1, vImpact: 1, vPeak: 1, miss: 0 }, su, C[7], { lie: 'fairway', slope: 'flat', power: 5, dex: 5, composure: 5, badStreak: 0, teed: false, stock: true }, () => 0.5);
      const w = width(real(7, 'human', 400, o.bs || 1, 9));
      rows.push(`${name} ${f(1 + r.complexity, 2)}× → ±${f(w, 0)} (${f(w / base, 2)}×)`);
    }
    out.push(`   ${rows.join(' · ')}`);
    Object.assign(S, { height: 0, spinCtl: 0, face: 0, stance: 0 });
  }
  return out.join('\n');
})()
