// Swing audit fixes S1.9, S1.10, S1.12, S2.8, S2.9, S2.10, S2.11, S3.4, S3.5, S6.4 and S9.3: the re-measures.
//   node tools/test/probe.js "http://127.0.0.1:8090/?nohome" - @tools/test/swing-fix14.js 0 swing-fix14
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 50 && !window.__golf; i++) await sleep(200);
  const g = window.__golf, YD = 0.9144, D2R = Math.PI / 180, out = [], C = g.CLUBS, M = g.CLUB_MODELS, st = g.state, T = g.TUNE;
  const f = (v, n = 1) => (v === null || v === undefined || Number.isNaN(v) ? '—' : v.toFixed(n));
  const padE = (s, n) => String(s).padEnd(n), sgn = (v, n = 1) => `${v > 0.05 ? '+' : v < -0.05 ? '−' : '±'}${f(Math.abs(v), n)}`;
  st.lie = 'fairway'; st.slope = 'flat'; st.power = 5; st.dex = 5; st.composure = 5; st.badStreak = 0; st.height = 0; st.spinCtl = 0;
  const SU = { face: 0, ballPos: 0, stance: 0, traj: 0, spinCtl: 0 };
  const SW0 = { bs: 1, ds: 1, thetaMouse: 0, sigma: 0, lateSign: 1, vImpact: 1, vPeak: 1, miss: 0 };
  const env = (o = {}) => ({ lie: 'fairway', slope: 'flat', power: 5, dex: 5, composure: 5, badStreak: 0, teed: false, ...o });
  const fly = (r, teed, extra = {}) => { const fl = g.createFlight({ ballSpeed: r.ballSpeed, vla: r.vla, dir: r.hla, spin: r.spin, axis: r.axis, release: r.release, ...extra }, { x: 0, z: 0 }, teed ? 0.04 : 0); for (let n = 0; fl.phase !== 'stopped' && fl.phase !== 'holed' && n < 30000; n++) g.stepFlight(fl, 1 / 240); return { fl, side: fl.p.x / YD, total: -fl.p.z / YD, carry: fl.carry / YD, roll: (-fl.p.z - (fl.land ? -fl.land.z : 0)) / YD }; };
  const shot = (i, su = {}, sw = {}, e = {}) => { const teed = !!C[i].tee; const r = g.computeImpact({ ...SW0, ...sw }, { ...SU, ...su }, C[i], env({ teed, stock: true, ...e }), () => 0.5); return { r, ...fly(r, teed) }; };
  const apply = (i, id, extra) => { const c = C[i]; for (const k of Object.keys(c)) if (!(k in g.BASE_CLUBS[i])) delete c[k]; Object.assign(c, g.BASE_CLUBS[i]); if (id) Object.assign(c, g.modelMods(M[id], i), { model: id }); if (extra) Object.assign(c, extra); };

  // ===== S1.9 / S1.10: the backswing clock
  {
    st.practice = true;
    const cal = st.cal = { swingPx: 800, vTarget: 800 / 139 }, L = 800;
    // back over Tb ms (cosine ease) on the mirror line, then a constant-acceleration downswing on `angle`, 1 report a ms
    const stroke = (Tb, angle = 0, over = 1) => {
      g.beginSwing(true);
      const slope = -Math.tan(angle * D2R), Lb = L * over, yTop = slope * Lb;
      let t = 1000, x = 0, y = 0;
      const to = (nx, ny) => { g.swingSample(nx - x, ny - y, t += 1); x = nx; y = ny; };
      for (let i = 1; i <= Tb; i++) { const u = 0.5 - 0.5 * Math.cos(Math.PI * i / Tb); to(-Lb * u, yTop * u); }
      const Td = 2 * Lb / cal.vTarget;
      for (let i = 1; i <= Td + 60 && g.swing.phase !== 'through'; i++) { const dx = i <= Td ? Lb * (i / Td) ** 2 : Lb + cal.vTarget * (i - Td); to(-Lb + dx, yTop - slope * dx); }
      const s = g.swing, sw = s.iImp >= 0 ? g.analyzeSwing(s.S, s.iTop, s.iImp, cal) : null, locked = s.backLocked;
      g.endSwing('silent');
      return { sw, locked };
    };
    out.push(`S1.9 THE BACKSWING CLOCK (TUNE.backswingTimeMs ${T.backswingTimeMs}): a full 100% backswing taken in … reads`,
      '   (before, with 1,000 ms: 0.5 s 100% · 1.1 s 99.8% · 1.3 s 93.3% · 1.6 s 77.8% · 2.0 s 59.6%)');
    out.push('   ' + [500, 1100, 1300, 1500, 1600, 2000, 2500].map((Tb) => { const r = stroke(Tb); return `${f(Tb / 1000, 1)} s ${r.sw ? f(r.sw.bs * 100, 1) + '%' : 'no shot'}${r.locked ? ' (locked)' : ''}`; }).join(' · '));
    out.push('', 'S1.10 AN ANGLED STROKE AFTER THE CLOCK LOCKS (10° in-to-out, 100% back over the time shown; then 140% back over 2 s, past the lock): path · wobble · miss',
      '   (before, 1.6 s with the 1,000 ms clock: path 9.52°, wobble 1.62 px, miss −3.8% of the swing)');
    for (const [Tb, over] of [[1000, 1], [1600, 1], [2000, 1], [2500, 1], [2000, 1.4]]) { const r = stroke(Tb, 10, over); out.push(`   ${f(Tb / 1000, 1)} s, ${f(over * 100, 0)}% of the hand's travel: path ${f(r.sw.thetaMouse, 2)}° · wobble ${f(r.sw.sigma, 2)} px · miss ${sgn(r.sw.miss * 100, 2)}% · backswing read ${f(r.sw.bs * 100, 1)}%`); }
    // ===== S1.12
    out.push('', 'S1.12 debugSwing: ASKED → READ (backswing, tempo, path, wobble px) and whether the swing is left active',
      '   (before: tempo 1.0 read 95.0%, 93.9% at a half swing, 90.0% at a quarter; 1.15 read 109.3%; a wobble of 10 added 0.76° of path; left active)');
    for (const a of [{}, { back: 0.5 }, { back: 0.25 }, { tempo: 1.15 }, { tempo: 0.7 }, { angle: 5 }, { wobble: 10 }, { wobble: 10, angle: 5 }]) {
      st.view = 'address';
      const r = g.debugSwing(a), sw = r && r.sw;
      out.push(`   ${padE(JSON.stringify(a), 22)} → ${sw ? `${f(sw.bs * 100, 1)}% · ${f(sw.ds * 100, 1)}% · ${f(sw.thetaMouse, 2)}° · ${f(sw.sigma, 2)} px` : 'no swing'} · active after: ${g.swing.active}`);
    }
    st.practice = false;
  }

  // ===== S2.8: toe and heel strikes
  out.push('', 'S2.8 TOE AND HEEL STRIKES (stock swing): start ° and finish yds (+ right) at a 4 / 8 / 14 mm toe hit, and an 8 mm heel hit',
    '   (before: 7 iron 6.0 / 11.6 / 18.2 yds right; 4 iron at 14 mm 29–31; after S2.7 the 7 iron was 6.8 / 13.2 / 21.1 · the driver: toe 8 mm finishes 6 L)');
  for (const i of [0, 4, 7, 10, 12, 14]) {
    const cells = [4, 8, 14].map((mm) => { const s = shot(i, {}, { sigma: mm / 1.0056 }); return `${f(s.r.hla, 1)}° ${sgn(s.side)}`; });
    const h = shot(i, {}, { sigma: 8 / 1.0056, lateSign: -1 });
    out.push(`   ${padE(C[i].name, 26)} bulge ${padE(f(C[i].bulge, 2), 6)} ${cells.join(' · ')} · heel 8 mm ${sgn(h.side)}`);
  }
  // ===== S2.9: start direction
  out.push('', 'S2.9 THE START LINE: a square face on a 5° in-to-out path (the face\'s share is 100% − start / 5°)', '   (before: 1.25° for every club, a 75% face share)');
  out.push('   ' + [0, 1, 3, 4, 6, 7, 10, 12].map((i) => { const s = shot(i, {}, { thetaMouse: 5 }); return `${C[i].name} ${f(s.r.hla, 2)}° (${f(100 - s.r.hla / 5 * 100, 0)}%)`; }).join(' · '));
  // ===== S2.10: spin and Power
  out.push('', `S2.10 SPIN AND THE POWER STAT (stock; TUNE.spinPowerExp ${T.spinPowerExp}; Power 1 / 5 / 10): club mph · spin · carry / total`,
    '   (before: the 7 iron spun 7,000 at every Power; the rows with spinPowerExp 0 are the old behaviour)');
  for (const exp of [0, T.spinPowerExp]) {
    const keep = T.spinPowerExp; T.spinPowerExp = exp;
    for (const i of [0, 4, 7, 10]) out.push(`   ${exp ? 'now   ' : 'before'} ${padE(C[i].name, 15)} ${[1, 5, 10].map((p) => { const s = shot(i, {}, {}, { power: p, teed: !!C[i].tee }); return `${f(s.r.clubSpeed, 0)} · ${f(s.r.spin, 0)} · ${f(s.carry, 0)} / ${f(s.total, 0)}`; }).join('   |   ')}`);
    T.spinPowerExp = keep;
  }
  // ===== S2.11: the bent lie in the preview
  {
    apply(7, null, { lieBias: 1.5, offset: 0.9 });
    const s = shot(7), rnd = g.rng32(31), P = [];
    for (let k = 0; k < 400; k++) { const r = g.computeImpact(g.spreadSwing(rnd), SU, C[7], env(), rnd); P.push(fly(r, false).side); }
    const mean = P.reduce((a, b) => a + b, 0) / P.length;
    out.push('', 'S2.11 A 7 IRON WITH A +1.5° BENT LIE AND A 0.9° OFFSET: the no-scatter preview against 400 real shots',
      `   preview path ${f(s.r.path, 2)}° (before 0.00°), finishes ${sgn(s.side)} yds (before 4.6 L) · the real shots average ${sgn(mean)} yds`);
    apply(7, null);
  }

  // ===== S3.4: backing up
  out.push('', `S3.4 BACKING UP (stock, roll after landing in yds; TUNE.backKeep ${T.backKeep}, backFrom ${T.backFrom}): on the range's green / a Stimp 11 hole green`,
    '   stock · More · High 2 · High 2 + More   (before, the same measure: nothing came back more than 1.0 yd on either green)');
  for (const i of [9, 10, 12, 13]) {
    const cells = [SU, { spinCtl: 1 }, { traj: 2 }, { traj: 2, spinCtl: 1 }].map((su) => {
      const r = g.computeImpact(SW0, { ...SU, ...su }, C[i], env({ stock: true }), () => 0.5);
      const a = fly(r, false, { ground: () => g.SURF.green }), b = fly(r, false, { green: g.flatChipView(11) });
      return `${f(r.spin, 0)} rpm ${f(a.roll)} / ${f(b.roll)}`;
    });
    out.push(`   ${padE(C[i].name, 15)} ${cells.join(' · ')}`);
  }
  // ===== S3.5: trees
  {
    const H = 15, tree = { x: 0, z: 0, h: H, r: H * 0.3 };
    const part = (tx, tz) => (x, y, z) => (g.treePart({ ...tree, x: tx, z: tz }, x, y, z) ? 0 : -1);
    const partOf = (tx, tz) => (id, x, y, z) => g.treePart({ ...tree, x: tx, z: tz }, x, y, z);
    out.push('', `S3.5 TREES (one ${H} m tree; its canopy from ${f(g.TREE.base * H)} m up, over a ${g.TREE.trunkR} m trunk; 3,000 shots each, finishes measured from the trunk)`,
      '   (before: 7 iron 47% beyond the tree / 27% back toward the player / 25% to the side; drive 60 / 26 / 14; wedge 24 / 24 / 38)');
    const cases = [['a 7 iron from 25 m short', { ballSpeed: 120, vla: 16.3, spin: 7097 }, 25], ['a drive from 60 m short', { ballSpeed: 167, vla: 10.9, spin: 2686 }, 60], ['a wedge from 12 m short', { ballSpeed: 82, vla: 31, spin: 10100 }, 12], ['a punch from 15 m short, under the branches', { ballSpeed: 70, vla: 4, spin: 3000 }, 15]];
    const R = tree.r;
    for (const [name, L, d] of cases) {
      const r2 = g.rng32(7); let back = 0, fwd = 0, side = 0, under = 0, hits = 0, trunk = 0, n = 0;
      for (let k = 0; k < 3000; k++) {
        const off = (r2() * 2 - 1) * 1.5;
        const fl = g.createFlight({ ...L, dir: 0, axis: 0, obstacle: part(off, -d), obstaclePart: partOf(off, -d) }, { x: 0, z: 0 }, 0); fl.rnd = r2;
        let y0 = null, steps = 0;
        while (fl.phase !== 'stopped' && steps++ < 30000) { const h0 = fl.treeHits || 0; g.stepFlight(fl, 1 / 120); if (!h0 && fl.treeHits) y0 = fl.p.y; }
        n++;
        if (!fl.treeHits) continue;
        hits++; if (y0 < g.TREE.base * H) trunk++;
        const dx = fl.p.x - off, dz = fl.p.z + d, dist = Math.hypot(dx, dz);
        if (dist < R) under++; if (dz > R) back++; if (dz < -R) fwd++; if (Math.abs(dx) > R && Math.abs(dz) <= R) side++;
      }
      out.push(`   ${padE(name, 44)} hit ${f(hits / n * 100, 0)}% (trunk ${f(trunk / n * 100, 0)}%) · of the hits: under the tree ${f(under / hits * 100, 0)}% · beyond ${f(fwd / hits * 100, 0)}% · back ${f(back / hits * 100, 0)}% · to the side ${f(side / hits * 100, 0)}%`);
    }
  }
  // ===== S6.4: Dexterity 8-10
  {
    out.push('', `S6.4 DEXTERITY 8 / 9 / 10 (TUNE.dexSpreadMin ${T.dexSpreadMin}; 500 swings): 2σ wide yds, the game's own scatter (a robot swing) and with the default hand`,
      '   (the finding: at Dex 10 the robot 7 iron ±1.2 yds and driver ±5; with the hand ±7 and ±17; a tour pro about ±8–10 and ±30–35)');
    const wide = (i, dex, hand) => { const rnd = g.rng32(4242 + i), teed = !!C[i].tee, P = []; for (let k = 0; k < 500; k++) { const sw = hand ? g.spreadSwing(rnd) : SW0; P.push(fly(g.computeImpact(sw, SU, C[i], env({ dex, teed }), rnd), teed).side); } const m = P.reduce((a, b) => a + b, 0) / P.length; return 2 * Math.sqrt(P.reduce((a, b) => a + (b - m) ** 2, 0) / P.length); };
    for (const min of [0, T.dexSpreadMin]) {
      const keep = T.dexSpreadMin; T.dexSpreadMin = min;
      for (const i of [7, 0]) out.push(`   ${min ? 'now   ' : 'before'} ${padE(C[i].name, 8)} ${[8, 9, 10].map((d) => `Dex ${d}: ±${f(wide(i, d, false) / 2)} robot, ±${f(wide(i, d, true) / 2)} hand`).join(' · ')}`);
      T.dexSpreadMin = keep;
    }
  }
  // ===== S9.3: the preview against the average
  {
    if (st.mode !== 'range') { g.setMode('range'); await sleep(300); }
    st.view = 'address'; st.lie = 'fairway'; st.dex = 5;
    out.push('', 'S9.3 THE SHOT PREVIEW\'S FINISH (yds, + right) against the mean of 1,600 more shaped shots (4 other seeds, the default hand, Dex 5; its own error about ±0.5 yd on the driver)',
      '   (before: the preview was the stock finish; the driver\'s fade finished 0.5 R in the preview and 5.7 R on average)');
    for (const ci of [0, 3, 7]) for (const shape of ['draw', 'fade']) {
      st.club = ci; g.applyShot(shape, true);
      const su = { face: st.face, ballPos: st.ballPos, stance: st.stance, traj: 0, spinCtl: 0 }, stock = g.stockShot(ci), pv = g.previewSide(ci), tr = g.previewTrack(ci);
      const teed = !!C[ci].tee, P = [];
      for (const seed of [1003, 2003, 3003, 4003]) { const rnd = g.rng32(seed); for (let k = 0; k < 400; k++) { const r = g.computeImpact(g.spreadSwing(rnd), su, C[ci], env({ teed }), rnd); const fl = g.createFlight({ ballSpeed: r.ballSpeed, vla: r.vla, dir: r.hla, spin: r.spin, axis: r.axis, release: r.release }, { x: 0, z: 0 }, teed ? 0.04 : 0); for (let m = 0; fl.phase !== 'stopped' && m < 20000; m++) g.stepFlight(fl, 1 / 120); P.push(fl.p.x / YD); } }
      const mean = P.reduce((a, b) => a + b, 0) / P.length, end = tr ? tr[tr.length - 1].x / YD : NaN;
      const t0 = performance.now(); st.composure = 6; g.previewSide(ci); const ms = performance.now() - t0; st.composure = 5;
      out.push(`   ${padE(C[ci].name, 9)} ${shape}: stock finish ${sgn(stock.side)} · preview ${sgn(pv)} (its path ends ${sgn(end)}) · the 1,600 shots ${sgn(mean)} · a fresh preview takes ${f(ms, 0)} ms`);
    }
    g.applyShot('straight', true); st.club = 7;
  }
  return out.join('\n');
})()
