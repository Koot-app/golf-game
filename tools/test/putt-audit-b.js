// Putting audit, part B: strokes fed through the game's own stroke reader (swingSample → analyzePutt), then computePutt + stepPutt.
// window.__MODE picks the section: 'b0' (stroke-reading checks), 'b1' (putter table), 'b2' (attribute sensitivity, strategies, stats),
// 'b3' (the putter ranking against a wider tempo spread, and with the tempo the reader really gives). Findings: PUTTING_AUDIT_FINDINGS.md.
//   node tools/test/probe.js "http://127.0.0.1:8090/?nohome" - "@tools/test/putt-audit-b.js" "window.__MODE='b1'"
// Practice mode is on, so no ball is rolled by the game and nothing is saved. b1 takes about 15 s, b2 and b3 about 30 s each.
// In b1 and b2 the stroke's length, path, gate excursion, miss and wobble come from the reader; its TEMPO is drawn around 1.00
// (a player who has learned what reads as pure). b3's last table uses the tempo the reader gives instead.
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 50 && !window.__golf; i++) await sleep(200);
  const g = window.__golf, FT = 0.3048, IN = 0.0254, out = [], P = g.PUTTERS, PUTT = g.PUTT, MODE = window.__MODE || 'b0';
  const f = (v, n = 0) => (v === null || v === undefined || Number.isNaN(v) ? '—' : v.toFixed(n));
  const lerp = (a, b, t) => a + (b - a) * t, clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  g.setMode('putt'); g.state.practice = true; g.setBadStreak(0);
  const px = g.state.cal.swingPx;
  const mj = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * u * (10 - 15 * u + 6 * u * u));
  const cosE = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : 0.5 - 0.5 * Math.cos(Math.PI * u));
  let clock = 1e6;
  // One stroke through the real reader. o: L (share of 100%), slope (dy/dx of the forward stroke), yImp (share of px, where it crosses the
  // ball's line), ratio (true back time ÷ top-to-ball time), tB ms, hold ms at the top, holdJit (counts of y jitter during the hold),
  // wob (share of px), hz (mouse polling), back ('mj' | 'cos'), pxScale (hand counts multiplier is not needed: px is the game's)
  function stroke(o) {
    const L = o.L * px, slope = o.slope || 0, yI = (o.yImp || 0) * px, yT = yI - slope * L, tB = o.tB || (350 + 450 * o.L), hold = o.hold || 0;
    const tF = 2 * tB / (o.ratio || 1), dtS = 1000 / (o.hz || 125), wob = (o.wob || 0) * px, ease = o.back === 'cos' ? cosE : mj;
    const pos = (t) => {
      if (t <= tB) { const u = ease(t / tB); return [-L * u, yT * u]; }
      if (t <= tB + hold) return [-L, yT + (o.holdJit ? Math.round(Math.sin((t - tB) * 0.2)) * o.holdJit : 0)];
      const fr = 2 * mj((t - tB - hold) / tF), x = -L + L * fr;
      return [x, yT + slope * (x + L) + wob * Math.sin(3 * Math.PI * Math.min(1, fr))];
    };
    g.beginSwing(true);
    let lx = 0, ly = 0; const t0 = clock + (o.phase || 0), end = tB + hold + tF;
    for (let t = dtS; t <= end + dtS && g.swing.phase !== 'through'; t += dtS) {
      const [x, y] = pos(t), X = Math.round(x), Y = Math.round(y);
      if (X !== lx || Y !== ly) { g.swingSample(X - lx, Y - ly, t0 + t); lx = X; ly = Y; }
    }
    clock = t0 + end + 500;
    const hit = g.swing.phase === 'through', tel = hit ? g.puttTel : null;
    g.endSwing('silent');
    return tel ? { ...tel.sw } : null;
  }
  const gaussOf = (rnd) => () => { let u = 0, v = 0; while (u === 0) u = rnd(); v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  const cfg = (o = {}) => ({ scaleFt: 40, stimp: 11, composure: 5, badStreak: 0, dex: 5, ...o });

  if (MODE === 'b0') {
    out.push(`px ${px}`);
    // (a) what the game reads for a true 1:1 stroke, by length, back profile and polling rate
    out.push('B0a TEMPO READ for a true 1:1 rhythm (back time = top-to-ball time), straight stroke. len read / tempo read');
    for (const back of ['mj', 'cos']) for (const hz of [125, 1000]) out.push(`   back ${back}, ${hz} Hz: ` + [0.05, 0.08, 0.13, 0.2, 0.33, 0.5, 0.75, 1.0].map((L) => { const s = stroke({ L, ratio: 1, hz, back }); return s ? `${f(L * 100)}%→${f(s.len * 100, 1)}%/${f(s.tempo, 2)}` : `${f(L * 100)}%→no stroke`; }).join('  '));
    out.push('   what that costs with the blade (zone 0.08), back mj 125 Hz: ' + [0.08, 0.13, 0.2, 0.33, 0.5, 0.75].map((L) => { const s = stroke({ L, ratio: 1 }), r = g.computePutt(s, P.blade, cfg({ scaleFt: 15 }), () => 1); return `${f(L * 100)}%: tempo ${f(s.tempo, 2)} → dec ${f(r.dec, 2)} (${f(-(1 - (1 - PUTT.decelSpeed * r.dec) ** 2) * 100)}% distance, ±${f(PUTT.decelTwistDeg * r.dec, 2)}°)`; }).join(' · '));
    out.push('   the true ratio that reads 1.00 (back mj, 125 Hz): ' + [0.08, 0.13, 0.2, 0.33, 0.5, 0.75, 1.0].map((L) => { let lo = 0.8, hi = 2; for (let i = 0; i < 20; i++) { const m = (lo + hi) / 2, s = stroke({ L, ratio: m }); if (s && s.tempo < 1) lo = m; else hi = m; } return `${f(L * 100)}%: ${f(lo, 2)}`; }).join('  '));
    out.push('   natural 2:1 stroke reads: ' + [0.13, 0.33, 0.75].map((L) => { const s = stroke({ L, ratio: 2 }); return `${f(L * 100)}%: ${f(s.tempo, 2)}`; }).join('  '));
    // (b) a pause at the top
    out.push('B0b PAUSE AT THE TOP (true 1:1, 50% stroke): tempo read');
    out.push('   ' + [0, 100, 300, 600].map((h) => `hold ${h} ms still: ${f(stroke({ L: 0.5, hold: h }).tempo, 2)} · with 1-count jitter: ${f(stroke({ L: 0.5, hold: h, holdJit: 1 }).tempo, 2)}`).join('  |  '));
    // (c) path and length read
    out.push('B0c PATH READ: stroke drawn at 1 / 2 / 4 / 8 deg (slope), by length: read deg');
    for (const L of [0.08, 0.13, 0.33, 0.75]) out.push(`   ${f(L * 100)}%: ` + [1, 2, 4, 8].map((a) => { const s = stroke({ L, slope: Math.tan(a * Math.PI / 180) }); return s ? `${a}°→${f(s.thetaMouse, 2)} (exc ${f(s.excursion * 100, 1)}%, miss ${f(s.miss * 100, 1)}%)` : '—'; }).join('  '));
    out.push('   one-count sideways error at the top (quantisation floor), deg of start line with the blade: ' + [0.05, 0.08, 0.13, 0.2, 0.33].map((L) => `${f(L * 100)}%: ${f(Math.atan(1 / (L * px)) * 180 / Math.PI * 0.4, 2)}°`).join('  '));
    // (d) the knee-knocker: tilt's hand shake on a perfectly straight stroke
    out.push('B0d TILT SHAKE on a perfect straight stroke (blade): sd of start line, share that hit the rail, by stroke length');
    for (const [streak, comp] of [[2, 5], [3, 5], [4, 5], [4, 1], [4, 10]]) {
      g.setComposure(comp); g.setBadStreak(streak);
      const cells = [];
      for (const L of [0.13, 0.33, 0.75]) {
        let ss = 0, rail = 0, n = 0, rnd = g.rng32(7 + streak * 31 + comp);
        for (let k = 0; k < 300; k++) { const s = stroke({ L, phase: rnd() * 600 }); if (!s) continue; const r = g.computePutt(s, P.blade, cfg({ scaleFt: 15, composure: comp, badStreak: streak }), rnd); ss += r.start * r.start; rail += r.over > 0 ? 1 : 0; n++; }
        cells.push(`${f(L * 100)}%: sd ${f(Math.sqrt(ss / n), 2)}°, rail ${f(rail / n * 100)}%`);
      }
      out.push(`   streak ${streak}, Composure ${comp} (tilt ${f(g.tiltPenalty(comp, streak), 2)}): ${cells.join(' · ')}`);
    }
    g.setComposure(5); g.setBadStreak(0);
    // (e) the fastest greens: a 10 ft downhill putt on each hole at the country club's stimp
    out.push('B0e COUNTRY CLUB (stimp + 2.5): 10 ft straight downhill at each pin. flat-stroke ft that just dies at the hole; ft past with 5% / 10% more ball speed (cup ignored); same on flat ground');
    try {
      for (let i = 0; i < g.HOLES.length; i++) {
        g.selectHole(i); const S = g.hole.surface, pin = g.hole.pin, st = g.HOLES[i].stimp + 2.5, a = g.rollDecel(st);
        // steepest uphill direction 10 ft away
        let best = null;
        for (let k = 0; k < 72; k++) { const an = k * Math.PI / 36, x = pin.x + Math.cos(an) * 10 * FT, z = pin.z + Math.sin(an) * 10 * FT; if (!S.inside(x, z)) continue; const h = S.h(x, z) - S.h(pin.x, pin.z); if (!best || h > best.h) best = { x, z, h }; }
        const v = g.greenView(S, { x: best.x, z: best.z }); v.decel = a; v.stimp = st; const far = { ...v, hole: { x: 50, z: 50 } };
        const dist = (v0) => { const q = g.createPutt(far, v0, 0, 0); for (let n = 0; q.phase === 'roll' && n < 40000; n++) g.stepPutt(q, 1 / 240); return -q.p.z / FT; };
        let lo = 0.1, hi = 4; for (let n = 0; n < 30; n++) { const m = (lo + hi) / 2; if (dist(m) < 10) lo = m; else hi = m; }
        const flatFt = lo * lo / (2 * a) / FT, sl = S.grad(pin.x, pin.z);
        out.push(`   hole ${i + 1} (stimp ${st}, drop ${f(best.h / IN, 1)} in over 10 ft): flat stroke ${f(flatFt, 1)} ft · +5%: ${f(dist(lo * 1.05) - 10, 1)} ft past · +10%: ${f(dist(lo * 1.10) - 10, 1)} ft past · (flat ground: 1.0 / 2.1)`);
      }
    } catch (e) { out.push('   (failed: ' + e.message + ')'); }
    return out.join('\n');
  }

  // ---------- Monte Carlo ----------
  const HANDS = {
    steady: { ang: 0.8, lat: 0.004, lenAbs: 0.006, lenProp: 0.01, tempo: 0.06 },
    average: { ang: 1.5, lat: 0.008, lenAbs: 0.012, lenProp: 0.02, tempo: 0.12 },
    loose: { ang: 2.5, lat: 0.014, lenAbs: 0.020, lenProp: 0.035, tempo: 0.20 },
  };
  const STIMP = 11, A = g.rollDecel(STIMP);
  const surf = g.makeSurface({ stimp: STIMP, outline: { x: 0, z: -4, rx: 60, rz: 60 } });
  // roll on the flat: straight line to near the cup by kinematics, the game's own stepPutt through the cup
  function rollFlat(dFt, v0, dirDeg) {
    const D = dFt * FT, th = dirDeg * Math.PI / 180, ux = Math.sin(th), uz = -Math.cos(th), sc = D * Math.cos(th), total = v0 * v0 / (2 * A);
    const at = (s) => ({ x: ux * s, z: uz * s }), leave = (p) => Math.hypot(p.x, p.z + D) / FT;
    if (total < sc - 0.3) return { holed: false, leave: leave(at(total)) };
    const s0 = Math.max(0, sc - 0.3), v = Math.sqrt(Math.max(0, v0 * v0 - 2 * A * s0));
    const q = g.createPutt({ ...surf, hole: { x: 0, z: -D } }, v, dirDeg, 0); q.p.x = ux * s0; q.p.z = uz * s0;
    for (let n = 0; q.phase === 'roll' && n < 20000; n++) {
      g.stepPutt(q, 1 / 240);
      const s = q.p.x * ux + q.p.z * uz;
      if (s > sc + 0.3 && !q.inCup) { const sp = Math.hypot(q.v.x, q.v.z), dir = sp > 0 ? { x: q.v.x / sp, z: q.v.z / sp } : { x: ux, z: uz }, more = sp * sp / (2 * A); return { holed: false, lip: q.lip, leave: leave({ x: q.p.x + dir.x * more, z: q.p.z + dir.z * more }) }; }
    }
    return { holed: q.holed, lip: q.lip, leave: q.holed ? 0 : leave(q.p) };
  }
  function handStroke(Lwant, hand, G, rnd, ratio = 1) {
    for (let tries = 0; tries < 4; tries++) {
      const L = clamp(Lwant * (1 + hand.lenProp * G()) + hand.lenAbs * G(), 0.03, 1.12);
      const slope = Math.tan(hand.ang * G() * Math.PI / 180) + hand.lat * G() / L;
      const s = stroke({ L, slope, ratio, yImp: hand.lat * (1 + L) * G(), wob: Math.abs(hand.lat * 0.3 * G()) });
      if (s) return s;
    }
    return null;
  }
  // play one hole out on a flat green. opt: { per, dex, strat: 'pure' | 'jab', scaleRule: 'auto' | 'small' }
  function playHole(d0, putter, hand, opt, rnd, G, stat) {
    let d = d0, n = 0, first = null;
    const perF = ((opt.per || 5) - 1) / 9;
    while (n < 6) {
      const bias = (rnd() * 2 - 1) * lerp(0.10, 0, perF), want = (d + PUTT.diePastFt) * (1 + bias), jab = opt.strat === 'jab';
      const need = jab ? want / 1.21 : want;
      const scale = opt.scaleRule === 'small' ? (need <= 15.5 ? 15 : need <= 41 ? 40 : 90) : (want <= 11 ? 15 : want <= 30 ? 40 : 90);
      const sw = handStroke(need / scale, hand, G, rnd, opt.ratio || 1);
      if (!sw) { n++; continue; }
      // opt.ratio: the hand keeps that true back ÷ forward rhythm and the reader's own tempo is used (with the hand's spread)
      sw.tempo = (opt.ratio ? sw.tempo : jab ? 1.6 : 1) * Math.exp(hand.tempo * G());
      const res = g.computePutt(sw, putter, cfg({ scaleFt: scale, stimp: STIMP, dex: opt.dex || 5 }), rnd), r = rollFlat(d, res.v0, res.start);
      n++;
      if (n === 1) { first = r; if (stat) { stat.n++; stat.ss += res.start * res.start; stat.rail += res.over > 0 ? 1 : 0; stat.loss += res.loss > 0 ? 1 : 0; stat.hot += res.hot > 0 ? 1 : 0; stat.dec += res.dec > 0 ? 1 : 0; stat.th += sw.thetaMouse * sw.thetaMouse; stat.pace += ((res.v0 * res.v0 / (2 * A) / FT) / (d + PUTT.diePastFt) - 1) ** 2; } }
      if (r.holed) break;
      d = Math.max(0.25, r.leave);
    }
    return { n, first };
  }
  function cell(d, putter, hand, opt, N, seed) {
    const rnd = g.rng32(seed), G = gaussOf(rnd), stat = { n: 0, ss: 0, rail: 0, loss: 0, hot: 0, dec: 0, th: 0, pace: 0 };
    let made = 0, three = 0, putts = 0, leave = 0, nm = 0;
    for (let k = 0; k < N; k++) { const h = playHole(d, putter, hand, opt, rnd, G, stat); putts += h.n; if (h.first && h.first.holed) made++; else if (h.first) { leave += h.first.leave; nm++; } if (h.n >= 3) three++; }
    return { make: made / N, three: three / N, e: putts / N, leave: leave / Math.max(1, nm), stat };
  }
  const TOUR = { 3: [0.96, 1.04], 5: [0.77, 1.23], 8: [0.50, 1.50], 10: [0.40, 1.61], 15: [0.23, 1.78], 20: [0.15, 1.87], 30: [0.07, 1.98], 40: [0.04, 2.06], 60: [0.02, 2.21] };
  const MIX = [[5, 2], [10, 2], [20, 2], [30, 2], [45, 1]];      // nine first putts

  if (MODE === 'b1') {
    const DS = [3, 5, 8, 10, 15, 20, 30, 40, 60], N = 1000;
    out.push(`B1 PUTTERS on a flat Stimp ${STIMP} green, Per 5, Dex 5, pure-tempo strategy, auto scale. ${N} holes per cell, each holed out.`);
    out.push('   tour (approx): ' + DS.map((d) => `${d}ft ${f(TOUR[d][0] * 100)}% / ${f(TOUR[d][1], 2)}`).join('  '));
    for (const hk of Object.keys(HANDS)) {
      out.push(`  HAND ${hk} ${JSON.stringify(HANDS[hk])}`);
      for (const pid of ['p-wh2', 'blade', 'p-newport', 'p-pldanser', 'mallet', 'p-spider', 'p-oz1', 'p-atelier']) {
        const cells = [], agg = { n: 0, ss: 0, rail: 0, loss: 0, hot: 0, dec: 0, th: 0, pace: 0 };
        for (const d of DS) { const c = cell(d, P[pid], HANDS[hk], {}, N, 1000 + d * 7); cells.push(`${d}ft ${f(c.make * 100)}%/${f(c.e, 2)}/3p ${f(c.three * 100)}%`); for (const k of Object.keys(agg)) agg[k] += c.stat[k]; }
        out.push(`   ${pid.padEnd(11)} ${cells.join('  ')}  || first putts: start sd ${f(Math.sqrt(agg.ss / agg.n), 2)}° (stroke sd ${f(Math.sqrt(agg.th / agg.n), 2)}°) rail ${f(agg.rail / agg.n * 100)}% off-sweet ${f(agg.loss / agg.n * 100)}% hot ${f(agg.hot / agg.n * 100)}% decel ${f(agg.dec / agg.n * 100)}% pace sd ${f(Math.sqrt(agg.pace / agg.n) * 100, 1)}%`);
        await sleep(0);
      }
    }
    return out.join('\n');
  }

  const N = 1500, per9 = (putter, hand, opt, seedBase = 5000) => { let tot = 0; const parts = []; for (const [d, w] of MIX) { const c = cell(d, putter, hand, opt, N, seedBase + d * 13); tot += c.e * w; parts.push(`${d}ft ${f(c.make * 100)}%/${f(c.e, 3)}/3p ${f(c.three * 100, 1)}%`); } return { tot, txt: parts.join('  ') }; };
  const SHOP_IDS = ['p-wh2', 'p-newport', 'p-pldanser', 'p-spider', 'p-oz1', 'p-atelier'];

  if (MODE === 'b3') {
    out.push(`B3a TEMPO SPREAD: shop putters, putts per nine (same mix as b2), the average hand with its tempo spread widened (its own is 0.12)`);
    for (const sd of [0.12, 0.20, 0.30, 0.40]) { out.push(`   tempo sd ${f(sd, 2)}: ` + SHOP_IDS.map((pid) => `${pid} ${f(per9(P[pid], { ...HANDS.average, tempo: sd }, {}).tot, 2)}`).join('  ')); await sleep(0); }
    out.push('', 'B3b THE READER\'S OWN TEMPO: the average hand keeps one true rhythm (back time ÷ top-to-ball time) for every putt, and the tempo is what the game reads');
    for (const ratio of [1, 1.3, 2]) { out.push(`   true ${ratio}:1: ` + SHOP_IDS.map((pid) => `${pid} ${f(per9(P[pid], HANDS.average, { ratio }).tot, 2)}`).join('  ')); await sleep(0); }
    { const r = per9(P['p-newport'], HANDS.average, { ratio: 1 }), q = per9(P['p-oz1'], HANDS.average, { ratio: 1 }); out.push(`   true 1:1, Newport: ${r.txt}`); out.push(`   true 1:1, OZ.1:    ${q.txt}`); }
    return out.join('\n');
  }

  if (MODE === 'b2') {
    const base = { ...P.blade };
    const VARS = [
      ['base blade (0.030 / 0.40 / 4 / 0.08)', {}],
      ['gate 0.028 (worst)', { gate: 0.028 }], ['gate 0.050 (best)', { gate: 0.050 }],
      ['start line 0.42 (worst)', { pathGain: 0.42 }], ['start line 0.22 (best)', { pathGain: 0.22 }],
      ['sweet 3.5 (worst)', { sweet: 3.5 }], ['sweet 10 (best)', { sweet: 10 }],
      ['tempo 0.03 (worst)', { tempoZone: 0.03 }], ['tempo 0.11 (best)', { tempoZone: 0.11 }],
    ];
    out.push(`B2 ONE ATTRIBUTE AT A TIME on the practice blade. Putts per nine holes (first putts: 2×5, 2×10, 2×20, 2×30, 1×45 ft), flat Stimp ${STIMP}, ${N} holes per cell`);
    for (const hk of Object.keys(HANDS)) {
      out.push(`  HAND ${hk}`);
      let b0 = null;
      for (const [name, ch] of VARS) { const r = per9({ ...base, ...ch }, HANDS[hk], {}); if (b0 === null) b0 = r.tot; out.push(`   ${name.padEnd(38)} ${f(r.tot, 2)} (${r.tot - b0 >= 0 ? '+' : ''}${f(r.tot - b0, 2)})   ${r.txt}`); await sleep(0); }
    }
    out.push('', 'B2b SHOP PUTTERS, putts per nine (same mix), by hand');
    for (const pid of ['p-wh2', 'p-newport', 'p-pldanser', 'p-spider', 'p-oz1', 'p-atelier']) { out.push(`   ${pid.padEnd(11)} ` + Object.keys(HANDS).map((hk) => `${hk} ${f(per9(P[pid], HANDS[hk], {}).tot, 2)}`).join('  ')); await sleep(0); }
    out.push('', 'B2c STRATEGY (average hand): pure tempo vs always jabbing (tempo 1.6, stroke ÷1.21), and always taking the smallest scale that reaches');
    for (const pid of ['blade', 'p-newport', 'p-spider', 'p-oz1']) {
      const a = per9(P[pid], HANDS.average, {}), b = per9(P[pid], HANDS.average, { strat: 'jab' }), c = per9(P[pid], HANDS.average, { scaleRule: 'small' }), d = per9(P[pid], HANDS.average, { strat: 'jab', scaleRule: 'small' });
      out.push(`   ${pid.padEnd(11)} pure ${f(a.tot, 2)} · jab ${f(b.tot, 2)} · small scale ${f(c.tot, 2)} · both ${f(d.tot, 2)}`);
      out.push(`        pure: ${a.txt}`); out.push(`        jab:  ${b.txt}`); out.push(`        small: ${c.txt}`);
      await sleep(0);
    }
    out.push('', 'B2d STATS (average hand, blade): Dexterity and Perception');
    out.push('   Dex: ' + [1, 2, 5, 8, 10].map((dx) => `${dx}: ${f(per9(P.blade, HANDS.average, { dex: dx }).tot, 2)}`).join('  '));
    out.push('   Per: ' + [1, 2, 5, 8, 10].map((pr) => `${pr}: ${f(per9(P.blade, HANDS.average, { per: pr }).tot, 2)}`).join('  '));
    { const r2 = per9(P.blade, HANDS.average, { per: 2 }), r10 = per9(P.blade, HANDS.average, { per: 10 }); out.push(`   Per 2:  ${r2.txt}`); out.push(`   Per 10: ${r10.txt}`); }
    return out.join('\n');
  }
  return 'unknown mode';
})()
