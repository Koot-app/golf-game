// Swing audit S1: the mouse swing. Scripted hand strokes are sampled the way a mouse would report them and fed
// through the game's real input path (swingSample, or onPointerMove with its spike filter), then read back with
// analyzeSwing. Practice mode is on, so no ball is launched.
//   node tools/test/probe.js "http://127.0.0.1:8090/?nohome" - @tools/test/swing-input.js 0 swing-s1
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 50 && !window.__golf; i++) await sleep(200);
  const g = window.__golf, st = g.state, T = g.TUNE, D2R = Math.PI / 180, out = [];
  const cal0 = { ...st.cal };
  st.practice = true;
  const f = (v, n = 2) => (v === null || v === undefined || Number.isNaN(v) ? '—' : v.toFixed(n));
  const rng = (() => { let a = 12345; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; })();

  // ---- a hand stroke in continuous time: back (cosine ease, Tb ms) -> pause -> down (constant acceleration, reaching
  // vImp counts/ms at the ball) -> through (constant speed). Returns pos(t) = { x, y } in counts, and its total time.
  // angle = the downswing's line (deg, + = in-to-out); the backswing goes back on the mirror line unless backAngle is given.
  // sag = a bulge of the downswing off its straight line (counts at mid-stroke), zero at both ends: a hand moving on an arc.
  function mkStroke({ L = 800, vImp = cal0.vTarget, Tb = 500, pause = 0, angle = 0, backAngle = null, wobble = 0, sag = 0, missPx = 0, a2 = 0 }) {
    const Td = 2 * L / vImp, slope = -Math.tan(angle * D2R);
    // y on the way down: yTop - slope*dx - a2*dx^2 (a2 bends the line: a curved, "over the top" stroke)
    const endY = (yTop) => yTop - slope * L - a2 * L * L;
    const yTop = backAngle === null ? slope * L + a2 * L * L + missPx : -Math.tan(backAngle * D2R) * L;
    const pos = (t) => {
      if (t <= Tb) { const u = 0.5 - 0.5 * Math.cos(Math.PI * t / Tb); return { x: -L * u, y: yTop * u }; }
      if (t <= Tb + pause) return { x: -L, y: yTop };
      const tau = t - Tb - pause, dx = tau <= Td ? L * (tau / Td) ** 2 : L + vImp * (tau - Td), u = Math.min(1, dx / L);
      return { x: -L + dx, y: yTop - slope * dx - a2 * dx * dx + wobble * Math.sin(3 * Math.PI * Math.min(1, tau / Td)) + sag * 4 * u * (1 - u) };
    };
    return { pos, total: Tb + pause + Td + 80, Td, L, vImp, endY: endY(yTop) };
  }
  // sample a position function like a mouse: whole counts, one report every 1000 / rate ms (jitter = fraction of that),
  // nothing when it hasn't moved. gain(v) (optional) = the OS's pointer acceleration: counts multiplied by speed.
  function sample(pos, total, rate, { jitter = 0, phase = 0, gain = null } = {}) {
    const dt = 1000 / rate, ev = [], t0 = performance.now() + 5000;
    let px = 0, py = 0, ox = 0, oy = 0, last = 0, gx = 0, gy = 0;
    for (let k = 1; (k - 1) * dt < total; k++) {
      const t = Math.max(last + 0.05, (k - 1 + phase) * dt + (jitter ? (rng() * 2 - 1) * jitter * dt : 0)), p = pos(t);
      let dx = p.x - px, dy = p.y - py;
      if (gain) { const v = Math.hypot(dx, dy) / Math.max(0.05, t - last), k2 = gain(v); dx *= k2; dy *= k2; }
      gx += dx; gy += dy; px = p.x; py = p.y;
      const ix = Math.round(gx) - ox, iy = Math.round(gy) - oy;
      if (ix || iy) { ev.push({ dx: ix, dy: iy, t: t0 + t }); ox += ix; oy += iy; }
      last = t;
    }
    return ev;
  }
  // feed mouse reports through the game. pointer = through onPointerMove (the spike filter), else straight to swingSample.
  function feed(ev, { pointer = false } = {}) {
    if (g.swing.active) g.endSwing('silent');
    g.beginSwing(true);
    for (const e of ev) {
      if (pointer) g.onPointerMove({ movementX: e.dx, movementY: e.dy, timeStamp: e.t });
      else g.swingSample(e.dx, e.dy, e.t);
    }
    const s = g.swing, fired = s.iImp >= 0;
    const r = { fired, phase: s.phase, locked: !!s.backLocked, spikes: s.spikes || 0, top: s.S.length > s.iTop ? -s.S[s.iTop].x : 0,
      sw: fired ? g.analyzeSwing(s.S, s.iTop, s.iImp, st.cal) : null };
    g.endSwing('silent');
    return r;
  }
  const rangeOf = (a) => (a.length ? `${f(Math.min(...a))}..${f(Math.max(...a))}` : '—');

  // =========================== 1. the same stroke at different report rates ===========================
  {
    const sp = mkStroke({ L: 800, angle: 4, wobble: 6 }), W = T.speedWindowMs;
    const dsWant = sp.L * (1 - (1 - W / sp.Td) ** 2) / W / sp.vImp;
    out.push('1. ONE STROKE, DIFFERENT REPORT RATES (100% backswing, 100% tempo at the ball, 4 deg in-to-out, a 6-count wobble)',
      `   downswing ${f(sp.Td, 0)} ms · the tempo the game should read: ${f(dsWant * 100, 1)}% (speed averaged over the last ${W} ms of an accelerating stroke)`,
      '   rate Hz   jitter   backswing %      tempo %          path deg        wobble (px)     miss (% of swing)');
    for (const rate of [1000, 500, 250, 125, 60, 30]) for (const jitter of [0, 0.4]) {
      const B = [], D = [], A = [], Sg = [], M = [];
      for (let k = 0; k < 8; k++) {
        const r = feed(sample(sp.pos, sp.total, rate, { jitter, phase: k / 8 }));
        if (!r.fired) { B.push(NaN); continue; }
        B.push(r.sw.bs * 100); D.push(r.sw.ds * 100); A.push(r.sw.thetaMouse); Sg.push(r.sw.sigma); M.push(r.sw.miss * 100);
      }
      out.push(`   ${String(rate).padStart(5)}    ${jitter ? '±40%' : 'none'}    ${rangeOf(B).padEnd(16)} ${rangeOf(D).padEnd(16)} ${rangeOf(A).padEnd(15)} ${rangeOf(Sg).padEnd(15)} ${rangeOf(M)}`);
    }
  }

  // =========================== 2. debugSwing: asked for vs read back ===========================
  {
    out.push('', '2. debugSwing: WHAT IS ASKED FOR vs WHAT THE GAME READS', '   asked: back / tempo / angle / wobble / miss   ->   read: backswing %, tempo %, path deg, wobble px, miss %');
    for (const a of [{}, { back: 0.5 }, { back: 0.25 }, { back: 1.1 }, { back: 1.2 }, { tempo: 0.7 }, { tempo: 1.15 }, { tempo: 1.4 }, { angle: 5 }, { angle: -10 }, { angle: 20 }, { wobble: 10 }, { miss: 0.1 }, { miss: -0.1 }]) {
      g.swing.active = false; st.view = 'address';
      const r = g.debugSwing(a), sw = r && r.sw;
      out.push(`   ${JSON.stringify(a).padEnd(18)} -> ${sw ? `${f(sw.bs * 100, 1)}%  ${f(sw.ds * 100, 1)}%  ${f(sw.thetaMouse, 2)}°  ${f(sw.sigma, 2)} px  ${f(sw.miss * 100, 1)}%` : 'no swing'}   (left active: ${g.swing.active})`);
      g.swing.active = false;
    }
  }

  // =========================== 3. the backswing clock ===========================
  {
    out.push('', `3. THE BACKSWING CLOCK (${T.backswingTimeMs} ms from the takeaway): a full 100% backswing taken at different speeds`,
      '   backswing time   path   -> fired  locked   backswing read   path read   wobble px   miss %');
    for (const [Tb, angle, pause] of [[500, 0, 0], [900, 0, 0], [1100, 0, 0], [1300, 0, 0], [1600, 0, 0], [2000, 0, 0], [700, 0, 600], [1300, 5, 0], [1300, 10, 0], [1600, 10, 0]]) {
      const sp = mkStroke({ Tb, angle, pause }), r = feed(sample(sp.pos, sp.total, 500));
      out.push(`   ${String(Tb).padStart(5)} ms${pause ? ` + ${pause} pause` : '            '}  ${String(angle).padStart(3)}°  -> ${r.fired ? 'yes' : 'NO '}    ${r.locked ? 'yes' : 'no '}      ${r.sw ? `${f(r.sw.bs * 100, 1)}%`.padEnd(15) : '—'.padEnd(15)}  ${r.sw ? f(r.sw.thetaMouse, 2).padStart(6) + '°' : ''}     ${r.sw ? f(r.sw.sigma, 2).padStart(5) : ''}     ${r.sw ? f(r.sw.miss * 100, 1).padStart(5) : ''}`);
    }
  }

  // =========================== 4. the top of the swing, and small movements ===========================
  {
    out.push('', '4. THE TOP OF THE SWING AND SMALL MOVEMENTS (waypoints, 500 reports a second)');
    // piecewise-linear hand path through [t ms, x, y] waypoints
    const way = (pts) => ({ total: pts[pts.length - 1][0], pos: (t) => { let i = 1; while (i < pts.length - 1 && pts[i][0] < t) i++; const a = pts[i - 1], b = pts[i], u = Math.min(1, Math.max(0, (t - a[0]) / (b[0] - a[0]))); return { x: a[1] + (b[1] - a[1]) * u, y: a[2] + (b[2] - a[2]) * u }; } });
    const cases = [
      ['pause 300 ms at the top', [[0, 0, 0], [400, -800, 0], [700, -800, 0], [900, 60, 0]]],
      ['a bounce at the top: 40 counts forward, back to -780, then down', [[0, 0, 0], [400, -800, 0], [460, -760, 0], [520, -780, 0], [720, 60, 0]]],
      ['a double pump: back to -500, forward 60, back to -800, down', [[0, 0, 0], [300, -500, 0], [360, -440, 0], [600, -800, 0], [800, 60, 0]]],
      ['a waggle: 20 counts left then right', [[0, 0, 0], [80, -20, 0], [160, 20, 0]]],
      ['a nudge: 70 counts left then right (8.75% of the swing length)', [[0, 0, 0], [120, -70, 0], [240, 20, 0]]],
      ['a nudge: 100 counts left then right', [[0, 0, 0], [120, -100, 0], [240, 20, 0]]],
      ['back 800, forward only to -100, back again to -600, then through', [[0, 0, 0], [400, -800, 0], [600, -100, 0], [800, -600, 0], [1000, 60, 0]]],
    ];
    for (const [name, pts] of cases) {
      const w = way(pts), r = feed(sample(w.pos, w.total, 500));
      out.push(`   ${name}: ${r.fired ? `FIRED · backswing ${f(r.sw.bs * 100, 1)}% · tempo ${f(r.sw.ds * 100, 0)}% · wobble ${f(r.sw.sigma, 1)} px` : `no shot (phase "${r.phase}")`}`);
    }
  }

  // =========================== 5. the path angle ===========================
  {
    out.push('', '5. THE PATH ANGLE (a least-squares line through the whole downswing)', '   stroke                                                       -> path read   wobble px   miss %');
    const L = 800, row = (name, o) => { const sp = mkStroke(o), r = feed(sample(sp.pos, sp.total, 1000)); out.push(`   ${name.padEnd(60)} -> ${r.sw ? `${f(r.sw.thetaMouse, 2).padStart(6)}°      ${f(r.sw.sigma, 2).padStart(5)}      ${f(r.sw.miss * 100, 1).padStart(5)}` : 'no shot'}`); };
    for (const a of [2, 5, -5, 10, 14, 20]) row(`straight line, ${a}° (back on the mirror line)`, { angle: a });
    row('straight back, then down on a 5° line (not mirrored)', { angle: 5, backAngle: 0 });
    row('straight back, then down on a 10° line (not mirrored)', { angle: 10, backAngle: 0 });
    // curved: the line's slope changes from s0 at the top to s1 at the ball. slope(dx) = slope + 2*a2*dx (in y-down units)
    const curved = (deg0, deg1) => { const s0 = -Math.tan(deg0 * D2R), s1 = -Math.tan(deg1 * D2R); return { angle: deg0, a2: (s1 - s0) / (2 * L) }; };
    row('curved: 8° out-to-in at the top, square (0°) at the ball', curved(-8, 0));
    row('curved: square at the top, 8° in-to-out at the ball', curved(0, 8));
    row('curved: 6° in-to-out at the top, 6° out-to-in at the ball', curved(6, -6));
    for (const p of [1, 2, 4, 6]) row(`an arc: bulges ${p}% of the swing length off the line at mid-stroke`, { sag: p / 100 * L });
  }

  // =========================== 6. what the default calibration means on a real mouse ===========================
  {
    const px = 800, vT = 800 / 139, mm = (counts, dpi) => counts / dpi * 25.4;
    out.push('', '6. THE DEFAULT CALIBRATION (800 counts, 5.76 counts/ms) IN HAND TRAVEL, BY MOUSE DPI',
      '   DPI    100% backswing   ring radius (free contact)   smallest backswing that fires   100% tempo hand speed   spike filter drops above   largest calibration (3000 counts, 30 counts/ms)');
    for (const dpi of [400, 800, 1600, 3200])
      out.push(`   ${String(dpi).padStart(4)}   ${f(mm(px, dpi), 1).padStart(6)} mm        ±${f(mm(T.contactFree * px, dpi), 2)} mm                     ${f(mm(T.minBackswing * px, dpi), 2).padStart(5)} mm                        ${f(vT / dpi * 2540, 1).padStart(5)} cm/s             ${f(vT * 6 / dpi * 2540, 0).padStart(4)} cm/s                  ${f(mm(3000, dpi), 0).padStart(4)} mm, ${f(30 / dpi * 2540, 0)} cm/s`);
  }

  // =========================== 7. the spike filter and calibration on a high-DPI mouse ===========================
  {
    out.push('', '7. A NATURAL HAND STROKE ON AN UNCALIBRATED MOUSE (through onPointerMove and its spike filter)',
      '   The hand: 40 mm back in 500 ms, then down, passing the ball at 60 cm/s.',
      '   DPI    reports/s   true counts   true speed    -> fired   reports dropped   backswing read   tempo read    | calibrating: length, speed (true values)');
    for (const dpi of [400, 800, 1600, 3200]) for (const rate of [1000, 125]) {
      const L = 40 / 25.4 * dpi, v = 60 * dpi / 2540, sp = mkStroke({ L, vImp: v, Tb: 500 });
      st.cal = { ...cal0 };
      const r = feed(sample(sp.pos, sp.total, rate), { pointer: true });
      st.cal = { ...cal0 }; st.calibrating = true;
      const c = feed(sample(sp.pos, sp.total, rate), { pointer: true });
      const got = { ...st.cal }, calSpikes = c.spikes;
      st.calibrating = false; st.cal = { ...cal0 };
      out.push(`   ${String(dpi).padStart(4)}   ${String(rate).padStart(6)}      ${f(L, 0).padStart(6)}       ${f(v, 1).padStart(5)} c/ms   -> ${r.fired ? 'yes' : 'NO '}      ${String(r.spikes).padStart(4)}             ${r.sw ? `${f(r.sw.bs * 100, 0)}% (raw ${f(r.top / 800 * 100, 0)}%)`.padEnd(15) : (`— (top ${f(r.top, 0)})`).padEnd(15)}  ${r.sw ? `${f(r.sw.ds * 100, 0)}%`.padEnd(11) : '—'.padEnd(11)}   | ${got.swingPx} counts, ${f(got.vTarget, 1)} c/ms (${f(L, 0)}, ${f(v * 0.957, 1)}) · dropped ${calSpikes}`);
    }
    try { localStorage.setItem('golfSwingCal', JSON.stringify(cal0)); } catch { /* fine */ }
  }

  // =========================== 8. pointer acceleration (the fallback lock) ===========================
  {
    // a stand-in for an OS acceleration curve: slow movement 1x, rising to 2.5x at speed (the real curves differ by OS and setting)
    const gain = (v) => 1 + 1.5 * Math.min(1, Math.max(0, (v - 1) / 9));
    out.push('', '8. POINTER ACCELERATION (an ordinary pointer lock, where the OS speeds up fast movement). A stand-in curve: 1x when slow, 2.5x when fast.',
      '   The hand always travels the same 800 raw counts back and returns to where it started.',
      '   backswing time   -> backswing read   tempo read   hand position when the game says "impact" (% of the way back to the ball)');
    for (const Tb of [300, 500, 800, 1000]) {
      const sp = mkStroke({ L: 800, Tb }), ev = sample(sp.pos, sp.total, 500, { gain }), r = feed(ev);
      // where the real hand was at the game's impact: replay the raw stroke to the same time
      const tImp = r.fired ? g.swing.impactAt : 0;
      let handPct = null;
      if (r.fired) { const s = g.swing; /* swing was ended: use the event times instead */ }
      // find the time of the event that crossed x = 0 in accelerated counts
      let acc = 0, top = 0, tCross = null;
      for (const e of ev) { acc += e.dx; top = Math.min(top, acc); if (acc >= 0 && top < -50 && tCross === null) tCross = e.t - ev[0].t + (1000 / 500); }
      if (tCross !== null) { const p = sp.pos(tCross); handPct = (800 + p.x) / 800 * 100; }
      void tImp;
      out.push(`   ${String(Tb).padStart(5)} ms         -> ${r.sw ? `${f(r.sw.bs * 100, 0)}% (raw ${f(r.top / 800 * 100, 0)}%)`.padEnd(16) : '—'.padEnd(16)} ${r.sw ? `${f(r.sw.ds * 100, 0)}%`.padEnd(11) : '—'.padEnd(11)}  ${handPct === null ? '—' : f(handPct, 0) + '%'}`);
    }
  }

  // =========================== 9. the design directions: backswing, tempo, contact, direction ===========================
  {
    const su = { face: 0, ballPos: 0, stance: 0, traj: 0, spinCtl: 0 };
    const shot = (ci, sw) => {
      const club = g.CLUBS[ci], teed = !!club.tee;
      const r = g.computeImpact({ bs: 1, ds: 1, thetaMouse: 0, sigma: 0, lateSign: 1, vImpact: 1, vPeak: 1, miss: 0, ...sw }, su, club, { lie: 'fairway', slope: 'flat', power: 5, dex: 5, composure: 5, badStreak: 0, teed, stock: true }, () => 0.5);
      const fl = g.createFlight({ ballSpeed: r.ballSpeed, vla: r.vla, dir: r.hla, spin: r.spin, axis: r.axis, release: r.release }, { x: 0, z: 0 }, teed ? 0.04 : 0);
      for (let n = 0; fl.phase !== 'stopped' && n < 30000; n++) g.stepFlight(fl, 1 / 120);
      return { r, carry: fl.carry / 0.9144, total: Math.hypot(fl.p.x, fl.p.z) / 0.9144, side: fl.p.x / 0.9144 };
    };
    const clubs = [[0, 'Driver'], [7, '7 Iron'], [12, 'Sand Wedge']];
    out.push('', '9. THE DESIGN DIRECTIONS, MEASURED (a centred, straight swing; all stats 5; carry in yards)',
      '   a. Backswing sets the distance (tempo 100%):',
      `      backswing     ${clubs.map(([, n]) => n.padEnd(22)).join('')}club speed x   added risk (cx.power)`);
    const full = clubs.map(([ci]) => shot(ci, {}).carry);
    for (const bs of [0.25, 0.4, 0.5, 0.6, 0.75, 0.9, 1.0, 1.05, 1.10]) {
      const rs = clubs.map(([ci]) => shot(ci, { bs }));
      out.push(`      ${f(bs * 100, 0).padStart(4)}%        ${rs.map((x, i) => `${f(x.carry, 0).padStart(4)} (${f(x.carry / full[i] * 100, 0)}%)`.padEnd(22)).join('')}${f(g.powerFromBackswing(bs), 3)}          ${f(rs[1].r.cx.power, 2)}`);
    }
    out.push('   b. Tempo is forgiving (backswing 100%):', `      tempo         ${clubs.map(([, n]) => n.padEnd(22)).join('')}club speed x   added risk (cx.power)`);
    for (const ds of [0.3, 0.4, 0.5, 0.6, 0.65, 0.8, 0.9, 1.0, 1.05, 1.15]) {
      const rs = clubs.map(([ci]) => shot(ci, { ds, vImpact: ds, vPeak: Math.max(1, ds) * 0 + ds }));
      out.push(`      ${f(ds * 100, 0).padStart(4)}%        ${rs.map((x, i) => `${f(x.carry, 0).padStart(4)} (${f(x.carry / full[i] * 100, 0)}%)`.padEnd(22)).join('')}${f(g.powerFromTempo(ds), 3)}          ${f(rs[1].r.cx.power, 2)}`);
    }
    const both = shot(7, { bs: 1.10, ds: 1.15 });
    out.push(`      110% backswing AND 115% tempo, 7 iron: ${f(both.carry, 0)} yds (${f(both.carry / full[1] * 100, 1)}% of a stock ${f(full[1], 0)}), added risk ${f(both.r.cx.power, 2)}`);
    out.push('   c. The ring has to pass through the ball (7 iron): how far it misses -> the contact factor on dispersion',
      '      ' + [0, 0.02, 0.035, 0.05, 0.08, 0.12, 0.16, 0.21, 0.3].map((m) => `${f(m * 100, 1)}%: x${f(1 + shot(7, { miss: m }).r.cx.contact, 2)}`).join(' · '));
    out.push('   d. Direction (7 iron, square face and stance): mouse path -> club path, start direction, spin axis, where it finishes');
    for (const a of [5, -5]) { const x = shot(7, { thetaMouse: a }); out.push(`      mouse ${a > 0 ? '+' : ''}${a}° (${a > 0 ? 'down-and-right through the ball' : 'up-and-right through the ball'}): path ${f(x.r.path, 1)}°, starts ${f(x.r.hla, 1)}° ${x.r.hla > 0 ? 'right' : 'left'}, axis ${f(x.r.axis, 1)}° (${x.r.axis < 0 ? 'draw' : 'fade'}), finishes ${f(Math.abs(x.side), 1)} yds ${x.side < 0 ? 'left' : 'right'}`); }
    // e. what the player's wobble is worth
    out.push('   e. Wobble -> strike (7 iron, sweet spot 5 mm; no other scatter): mm off-centre at Dexterity 1 / 5 / 10');
    for (const sg of [1, 2.5, 5, 8, 12]) {
      const mm = [1, 5, 10].map((dex) => Math.abs(g.computeImpact({ bs: 1, ds: 1, thetaMouse: 0, sigma: sg, lateSign: 1, vImpact: 1, vPeak: 1, miss: 0 }, su, g.CLUBS[7], { lie: 'fairway', slope: 'flat', power: 5, dex, composure: 5, badStreak: 0, teed: false, stock: true }, () => 0.5).strike));
      out.push(`      wobble ${f(sg, 1).padStart(4)} px (the hand strays ${f(sg / 2.5, 1)}% of the swing length, RMS): ${mm.map((v) => f(v, 1)).join(' / ')} mm`);
    }
  }
  // =========================== 10. a slow, careful downswing with a quick finish ===========================
  {
    // piecewise-linear in time: back to -800 in 500 ms, then down at a steady `slow` counts/ms to -`last` counts, then the
    // rest at `fast` counts/ms (and on through)
    const stroke = (slow, last, fast) => {
      const t1 = 500, t2 = t1 + (800 - last) / slow, t3 = t2 + (last + 60) / fast;
      return { total: t3, pos: (t) => ({ x: t <= t1 ? -800 * (0.5 - 0.5 * Math.cos(Math.PI * t / t1)) : t <= t2 ? -800 + (t - t1) * slow : -last + (t - t2) * fast, y: 0 }) };
    };
    const su = { face: 0, ballPos: 0, stance: 0, traj: 0, spinCtl: 0 }, vT = cal0.vTarget;
    out.push('', `10. A SLOW DOWNSWING WITH A QUICK FINISH (100% backswing; full tempo is ${f(vT, 2)} counts/ms at the ball)`,
      '   the downswing                                                        time    -> tempo read   peak speed   flags          club speed x');
    for (const [name, slow, last, fast] of [
      ['steady at full tempo all the way', vT, 0, vT],
      ['crawl at 10% tempo, then full tempo for the last 20% (160 counts)', vT * 0.1, 160, vT],
      ['crawl at 10% tempo, then full tempo for the last 10% (80 counts)', vT * 0.1, 80, vT],
      ['crawl at 5% tempo, then 70% tempo for the last 10%', vT * 0.05, 80, vT * 0.7],
      ['crawl at 10% tempo, then 115% tempo for the last 20%', vT * 0.1, 160, vT * 1.15],
      ['full tempo, then easing off to 50% for the last 20% (quitting on it)', vT, 160, vT * 0.5],
      ['crawl at 10% tempo all the way', vT * 0.1, 0, vT * 0.1],
    ]) {
      const s = stroke(slow, last, fast), r = feed(sample(s.pos, s.total, 500));
      if (!r.fired) { out.push(`   ${name}: no shot`); continue; }
      const res = g.computeImpact(r.sw, su, g.CLUBS[7], { lie: 'fairway', slope: 'flat', power: 5, dex: 5, composure: 5, badStreak: 0, teed: false, stock: true }, () => 0.5);
      out.push(`   ${name.padEnd(70)} ${f((s.total - 500) / 1000, 1).padStart(4)} s  -> ${f(r.sw.ds * 100, 0).padStart(4)}%        ${f(r.sw.vPeak / vT * 100, 0).padStart(4)}%        ${(res.flags.join(', ') || '—').padEnd(14)} ${f(res.clubSpeed / g.CLUBS[7].speed, 3)}`);
    }
  }

  // =========================== 11. what the smallest backswings produce ===========================
  {
    const su = { face: 0, ballPos: 0, stance: 0, traj: 0, spinCtl: 0 };
    out.push('', '11. THE SMALLEST BACKSWINGS THAT FIRE A SHOT (tempo as a small nudge reads it, about 40%): where the ball goes',
      '   backswing    Driver (carry / total yds)   7 Iron        Sand Wedge');
    for (const bs of [0.08, 0.10, 0.125, 0.15, 0.20]) {
      const cells = [0, 7, 12].map((ci) => {
        const club = g.CLUBS[ci], teed = !!club.tee;
        const r = g.computeImpact({ bs, ds: 0.4, thetaMouse: 0, sigma: 0, lateSign: 1, vImpact: 0.4, vPeak: 0.4, miss: 0 }, su, club, { lie: 'fairway', slope: 'flat', power: 5, dex: 5, composure: 5, badStreak: 0, teed, stock: true }, () => 0.5);
        const fl = g.createFlight({ ballSpeed: r.ballSpeed, vla: r.vla, dir: r.hla, spin: r.spin, axis: r.axis, release: r.release }, { x: 0, z: 0 }, teed ? 0.04 : 0);
        for (let n = 0; fl.phase !== 'stopped' && n < 30000; n++) g.stepFlight(fl, 1 / 120);
        return `${f(fl.carry / 0.9144, 1)} / ${f(Math.hypot(fl.p.x, fl.p.z) / 0.9144, 1)}`.padEnd(14);
      });
      out.push(`   ${f(bs * 100, 1).padStart(5)}%      ${cells[0].padEnd(27)}  ${cells[1]}${cells[2]}`);
    }
    // any backswing past 110% reads exactly 110%
    const caps = [1.0, 1.05, 1.10, 1.2, 1.5].map((b) => { const sp = mkStroke({ L: 800 * b }), r = feed(sample(sp.pos, sp.total, 1000)); return `${f(b * 100, 0)}% -> ${r.sw ? f(r.sw.bs * 100, 1) + '%' : '—'}`; });
    out.push(`   and at the other end, the hand's backswing -> what the game reads: ${caps.join(' · ')}`);
  }
  st.cal = { ...cal0 }; st.practice = false;
  return out.join('\n');
})()
