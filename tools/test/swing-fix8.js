// Swing audit fixes S1.4 (the spike filter only drops outliers) and S6.3 (overswing is slightly wider, not twice as
// wide): the re-measures. Strokes go through the real onPointerMove handler with practice on (no ball).
//   node tools/test/probe.js "http://127.0.0.1:8090/?nohome" - @tools/test/swing-fix8.js 0 swing-fix8-<name>
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 50 && !window.__golf; i++) await sleep(200);
  const g = window.__golf, YD = 0.9144, out = [], C = g.CLUBS, S = g.state;
  const f = (v, n = 0) => (v === null || v === undefined || Number.isNaN(v) ? '—' : v.toFixed(n));
  const gauss = (rnd) => { let s = 0; for (let k = 0; k < 6; k++) s += rnd(); return (s - 3) / Math.SQRT1_2; };
  // ---- S1.4: a natural stroke at each DPI and report rate (40 mm back, through at 60 cm/s), with the default calibration
  S.practice = true; S.club = 7; S.cal = { swingPx: 800, vTarget: 800 / 139 };
  const stroke = (dpi, hz, fake = 0) => {
    const cpm = dpi / 25.4, back = 40 * cpm, vBall = 600 * cpm / 1000;     // counts; counts/ms at the ball (60 cm/s)
    const tB = 450, tD = 2 * back / vBall, step = 1000 / hz;                // backswing eased in 450 ms; downswing at constant acceleration
    const pos = (t) => t <= tB ? -back * (0.5 - 0.5 * Math.cos(Math.PI * t / tB)) : t <= tB + tD ? -back + back * ((t - tB) / tD) ** 2 : (t - tB - tD) * vBall;
    g.beginSwing(true); let x = 0, ts = 10000;
    for (let t = step; t <= tB + tD + 40; t += step) {
      let nx = pos(t), dx = Math.round(nx - x); x += dx;
      if (fake && Math.abs(t - tB / 2) < step / 2) dx -= fake;              // a fake jump, as when the pointer lock engages
      g.onPointerMove({ movementX: dx, movementY: 0, timeStamp: ts += step });
      if (g.swing.phase === 'through') break;
    }
    const tel = g.telemetry, fired = g.swing.phase === 'through' || g.swing.iImp >= 0, spikes = g.swing.spikes; g.endSwing('silent');
    return { fired, spikes, bs: fired && tel ? tel.sw.bs : null };
  };
  out.push('S1.4 A NATURAL STROKE (40 mm back, through at 60 cm/s; default calibration) through onPointerMove: fired · reports dropped · backswing read');
  for (const dpi of [800, 1600, 3200]) out.push(`   ${String(dpi).padStart(4)} DPI: ` + [1000, 125, 60].map((hz) => { const r = stroke(dpi, hz); return `${hz} Hz ${r.fired ? 'fired' : 'NO'}, ${r.spikes} dropped${r.bs ? `, ${f(r.bs * 100)}%` : ''}`; }).join(' · '));
  { const a = stroke(800, 125, 2000), b = stroke(800, 125, 0); out.push(`   a fake 2,000-count jump in the middle of the backswing (800 DPI, 125 Hz): ${a.spikes} dropped, backswing read ${f(a.bs * 100)}% (the same stroke without it: ${f(b.bs * 100)}%)`); }
  S.practice = false;
  // ---- S6.3: each power ask, 7 iron and driver, S1's human hand
  out.push('', 'S6.3 OVERSWING (S1\'s human hand, 500 shots): complexity · 2σ width (× the stock shot\'s) · mean total');
  const SU = { face: 0, ballPos: 0, stance: 0, traj: 0, spinCtl: 0 };
  const run = (ci, dex, bs, ds) => { const rnd = g.rng32(1000 + ci * 31), xs = []; let tot = 0, cx = 0; const N = 500;
    for (let k = 0; k < N; k++) { const r = g.computeImpact({ bs: bs + 0.05 * (rnd() + rnd() - 1), ds, thetaMouse: 2.4 * (rnd() + rnd() - 1), sigma: 1.5 + 4 * rnd(), lateSign: rnd() < 0.5 ? 1 : -1, vImpact: 1, vPeak: 1, miss: 0.02 * gauss(rnd) }, SU, C[ci], { lie: 'fairway', slope: 'flat', power: 5, dex, composure: 5, badStreak: 0, teed: ci === 0 }, rnd);
      const fl = g.createFlight({ ballSpeed: r.ballSpeed, vla: r.vla, dir: r.hla, spin: r.spin, axis: r.axis, release: r.release }, { x: 0, z: 0 }, ci === 0 ? 0.04 : 0); for (let n = 0; fl.phase !== 'stopped' && n < 30000; n++) g.stepFlight(fl, 1 / 120); xs.push(fl.p.x); tot += -fl.p.z / YD; cx += r.complexity; }
    const m = xs.reduce((a, b) => a + b, 0) / N; return { w: 2 * Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / N) / YD, tot: tot / N, cx: cx / N }; };
  for (const [ci, n] of [[7, '7 Iron'], [0, 'Driver']]) for (const dex of [2, 5, 8]) {
    const base = run(ci, dex, 1, 1);
    const cells = [['stock', 1, 1], ['105%', 1.05, 1], ['110%', 1.10, 1], ['115% tempo', 1, 1.15], ['110% + 115%', 1.10, 1.15]].map(([name, bs, ds]) => { const r = bs === 1 && ds === 1 ? base : run(ci, dex, bs, ds); return `${name} ${f(r.cx, 2)} · ±${f(r.w)} (${f(r.w / base.w, 2)}×) · ${f(r.tot)}`; });
    out.push(`   ${n.padEnd(7)} Dex ${dex}: ${cells.join('   ')}`);
  }
  return out.join('\n');
})()
