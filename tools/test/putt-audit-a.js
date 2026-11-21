// Putting audit, part A: deterministic mechanics (no assumptions about the hand). Findings: PUTTING_AUDIT_FINDINGS.md.
//   node tools/test/probe.js "http://127.0.0.1:8090/?nohome" - "@tools/test/putt-audit-a.js"
// Changes nothing: it calls computePutt / createPutt / stepPutt directly and reads the holes' greens.
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 50 && !window.__golf; i++) await sleep(200);
  const g = window.__golf, FT = 0.3048, IN = 0.0254, out = [], P = g.PUTTERS, PUTT = g.PUTT;
  const f = (v, n = 0) => (v === null || v === undefined || Number.isNaN(v) ? '—' : v.toFixed(n));
  const cfg = (o = {}) => ({ scaleFt: 40, stimp: 11, composure: 5, badStreak: 0, dex: 5, ...o });
  const sw0 = (o = {}) => ({ thetaMouse: 0, excursion: 0, tempo: 1, sigma: 0, lateSign: 1, miss: 0, len: 0.5, ...o });
  const flat = (stimp, ft) => ({ ...g.makeSurface({ stimp, outline: { x: 0, z: -4, rx: 40, rz: 40 } }), hole: { x: 0, z: -ft * FT } });
  const roll = (green, v0, dir, skid = 0) => { const q = g.createPutt(green, v0, dir, skid); for (let n = 0; q.phase === 'roll' && n < 40000; n++) g.stepPutt(q, 1 / 240); return q; };
  const v0For = (stimp, ft) => Math.sqrt(2 * g.rollDecel(stimp) * ft * FT);

  out.push(`cal ${JSON.stringify(g.state.cal)} · PUTT ${JSON.stringify(PUTT)}`);
  out.push('PUTTERS ' + Object.entries(P).map(([k, p]) => `${k}: gate ${p.gate} gain ${p.pathGain} sweet ${p.sweet} zone ${p.tempoZone}`).join(' | '));

  // A1 tempo response: distance multiplier, skid, twist, by putter zone (len 50% of the 40 ft scale = 20 ft)
  out.push('', 'A1 TEMPO → rolled distance (ft, flat stroke 20 ft) · skid ft · max decel twist°');
  for (const pid of ['p-oz1', 'p-spider', 'blade', 'p-wh2', 'p-pldanser', 'p-newport']) {
    const cells = [];
    for (const t of [0.6, 0.7, 0.8, 0.85, 0.9, 0.95, 1, 1.05, 1.1, 1.15, 1.2, 1.3, 1.5, 2.0]) {
      const r = g.computePutt(sw0({ tempo: t }), P[pid], cfg(), () => 1);
      const d = r.v0 * r.v0 / (2 * g.rollDecel(11)) / FT;
      cells.push(`${t}:${f(d, 1)}/${f(r.skidFt, 1)}${r.dec > 0 ? `/±${f(PUTT.decelTwistDeg * r.dec, 2)}` : ''}`);
    }
    out.push(`   ${pid.padEnd(11)} ${cells.join('  ')}`);
  }

  // A2 strike: mm from wobble and miss; pace loss
  out.push('', 'A2 STRIKE mm and rollout loss. rows: miss as a share of the 100% stroke; cols: wobble sigma (spec px) 0 / 1 / 2 / 4');
  for (const pid of ['p-wh2', 'blade', 'p-pldanser', 'p-oz1', 'p-spider']) {
    for (const miss of [0, 0.01, 0.02, 0.03, 0.05, 0.08]) {
      const cells = [0, 1, 2, 4].map((s) => { const r = g.computePutt(sw0({ sigma: s, miss, excursion: miss }), P[pid], cfg(), () => 0.5); return `${f(r.mm, 1)}mm ${r.loss ? '-' + f(r.loss * 100, 1) + '%' : 'pure'} over ${f(r.over, 2)}`; });
      out.push(`   ${pid.padEnd(11)} miss ${f(miss * 100, 0)}%: ${cells.join(' | ')}`);
    }
  }
  // dex effect on mm
  out.push('   Dex effect, blade, sigma 3, miss 0.01: ' + [1, 2, 5, 8, 10].map((d) => { const r = g.computePutt(sw0({ sigma: 3, miss: 0.01, excursion: 0.01 }), P.blade, cfg({ dex: d }), () => 0.5); return `Dex ${d}: ${f(r.mm, 2)} mm ${r.loss ? 'loss ' + f(r.loss * 100, 1) + '%' : 'pure'}`; }).join(' · '));

  // A3 gate → twist
  out.push('', 'A3 GATE: excursion (share of 100% stroke) → max random twist °');
  for (const pid of ['p-wh2', 'blade', 'p-oz1', 'p-spider']) out.push(`   ${pid.padEnd(11)} ` + [0.02, 0.03, 0.04, 0.05, 0.06, 0.08, 0.10, 0.15].map((e) => { const r = g.computePutt(sw0({ excursion: e }), P[pid], cfg(), () => 1); return `${f(e * 100)}%: ${f(r.start, 2)}`; }).join('  '));

  // A4 holing tolerance on a flat green: max start-line error that still drops, by distance and pace; then the stroke-path tolerance per putter
  out.push('', 'A4 TOLERANCE (flat). max start-line error (deg) that still holes, by pace past the hole');
  const tol = (stimp, ft, past) => { const gr = flat(stimp, ft), v0 = v0For(stimp, ft + past); let lo = 0, hi = 12; for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; if (roll(gr, v0, m).holed) lo = m; else hi = m; } return lo; };
  const dists = [2, 3, 4, 5, 6, 8, 10, 15, 20, 30, 40];
  for (const stimp of [9, 11, 13]) for (const past of [0.5, 1.5, 3, 5]) out.push(`   Stimp ${stimp}, ${past} ft past: ` + dists.map((d) => `${d}ft ±${f(tol(stimp, d, past), 2)}`).join('  '));
  out.push('   stroke-path tolerance at Stimp 11, 1.5 ft past (deg of mouse stroke):');
  for (const pid of ['p-wh2', 'blade', 'p-pldanser', 'p-spider', 'p-oz1']) out.push(`   ${pid.padEnd(11)} ` + dists.map((d) => `${d}ft ±${f(tol(11, d, 1.5) / P[pid].pathGain, 1)}`).join('  '));
  // pace window, dead straight
  out.push('   pace window on a dead-straight putt (flat stroke ft that holes), Stimp 11: ' + [3, 6, 10, 20, 40].map((d) => { const gr = flat(11, d); let lo = d - 1, hi = d + 0.5; for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; if (roll(gr, v0For(11, m), 0).holed) hi = m; else lo = m; } const mn = hi; lo = d; hi = d + 30; for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; if (roll(gr, v0For(11, m), 0).holed) lo = m; else hi = m; } return `${d}ft: ${f(mn, 2)}–${f(lo, 1)}`; }).join('  '));

  // A5 the skid: does a jab take the break out?
  out.push('', 'A5 SKID on a side slope (tilted right-to-left). aimed at the cup centre; blade. finish: holed or inches low of the cup at pin-high crossing');
  const side = (stimp, pct, ft) => { const s = g.makeSurface({ tilt: { x: pct / 100, z: 0 }, stimp, outline: { x: 0, z: -4, rx: 40, rz: 40 }, pin: { x: 0, z: -ft * FT } }); return g.greenView(s, { x: 0, z: 0 }); };
  const crossAt = (gr, v0, dir, skid) => { const q = g.createPutt(gr, v0, dir, skid); let prev = { ...q.p }, cross = null; for (let n = 0; q.phase === 'roll' && n < 40000; n++) { g.stepPutt(q, 1 / 240); if (cross === null && q.p.z <= gr.hole.z) cross = q.p.x; prev = { ...q.p }; } return { q, cross }; };
  for (const [stimp, pct, ft] of [[11, 2, 4], [11, 2, 6], [12.5, 2, 6], [12.5, 2, 10], [14, 2, 6], [11, 1, 8]]) {
    const gr = side(stimp, pct, ft), cells = [];
    for (const [name, tempo, extraLen] of [['pure', 1, 1.5], ['jab t1.25', 1.25, 1.5], ['jab t1.5 (same length)', 1.5, 1.5], ['jab t1.5, short stroke', 1.5, -0.4]]) {
      const len = (ft + extraLen) / 15, r = g.computePutt(sw0({ tempo, len }), P.blade, cfg({ scaleFt: 15, stimp }), () => 0.5), x = crossAt(gr, r.v0, 0, r.skidFt);
      // the aim that holes it
      let aimNeed = null; for (let a = 0; a <= 12; a += 0.05) { if (roll(gr, r.v0, a, r.skidFt).holed) { aimNeed = a; break; } }
      cells.push(`${name}: v0 ${f(r.v0, 2)} skid ${f(r.skidFt, 1)}ft → ${x.q.holed ? 'HOLED' : (x.cross === null ? 'short' : f(Math.abs(x.cross) / IN, 1) + ' in low')}, aim to hole ${aimNeed === null ? '—' : f(Math.tan(aimNeed * Math.PI / 180) * ft * 12, 1) + ' in'}`);
    }
    out.push(`   Stimp ${stimp}, ${pct}% side slope, ${ft} ft: ${cells.join(' | ')}`);
  }
  // physics check: break during skid should exist. Compare break of a 20 ft putt with skid 0 vs 1 vs 3.5
  { const gr = side(11, 2, 20); out.push('   20 ft, 2%, Stimp 11, 1.5 past: inches low with skid 0 / 0.5 / 1 / 3 ft: ' + [0, 0.5, 1, 3].map((s) => f(Math.abs(crossAt(gr, v0For(11, 21.5), 0, s).cross) / IN, 1)).join(' / ')); }

  // A6 scale steps: what 1% of stroke is worth at the auto-scale boundaries
  out.push('', 'A6 SCALES: auto scale by marker distance, the stroke % it asks, and ft per 1% of stroke');
  out.push('   ' + [2, 3, 5, 8, 11, 12, 15, 20, 30, 31, 40, 60, 90].map((d) => { const sc = d <= 11 ? 15 : d <= 30 ? 40 : 90; return `${d}ft→${sc}: ${f(d / sc * 100)}% (${f(sc / 100, 2)} ft per 1%, ${f(sc / 100 / d * 100, 1)}% of the putt)`; }).join(' · '));

  // A7 tilt: gate and what the shake does
  out.push('', 'A7 TILT: gate by bad streak (Composure 1 / 5 / 10), blade');
  out.push('   ' + [0, 1, 2, 3, 4, 5].map((n) => `streak ${n}: tilt ${[1, 5, 10].map((c) => f(g.tiltPenalty(c, n), 2)).join('/')} gate ${[1, 5, 10].map((c) => f(g.puttGate(P.blade, c, n), 4)).join('/')}`).join(' · '));

  // A8 perception band
  out.push('', 'A8 PERCEPTION: marker band half-width and the most its centre can be off');
  out.push('   ' + [1, 2, 3, 5, 7, 8, 10].map((p) => { const pf = (p - 1) / 9; return `Per ${p}: ±${f((0.12 + (0.01 - 0.12) * pf) * 100, 1)}%, bias ≤${f(0.10 * (1 - pf) * 100, 1)}%`; }).join(' · '));

  // A9 capture: effective cup width by speed (how far past it would have gone)
  out.push('', 'A9 CUP: share of the cup\'s width that still catches the ball, by how far past it would have run (Stimp 11)');
  out.push('   ' + [0.5, 1, 1.5, 2, 3, 4, 5, 6, 8].map((p) => { const v = v0For(11, p); return `${p}ft past (${f(v, 2)} m/s): ${f(Math.sqrt(Math.max(0, 1 - (v / PUTT.captureSpeed) ** 2)) * 100)}%`; }).join(' · '));

  // A10 hole greens: slope near each pin and stimps by tier
  out.push('', 'A10 COURSE GREENS (tier stimps): hole stimp base; slope % at 5/10/20 ft from each pin (max over 8 directions)');
  try {
    for (let i = 0; i < g.HOLES.length; i++) {
      g.selectHole(i); const S = g.hole.surface, pin = g.hole.pin;
      const mx = (ft) => { let m = 0; for (let a = 0; a < 8; a++) { const x = pin.x + Math.cos(a * Math.PI / 4) * ft * FT, z = pin.z + Math.sin(a * Math.PI / 4) * ft * FT; if (!S.inside(x, z)) continue; const gr = S.grad(x, z); m = Math.max(m, Math.hypot(gr.x, gr.z)); } return m * 100; };
      const gp = S.grad(pin.x, pin.z);
      out.push(`   hole ${i + 1}: stimp ${g.HOLES[i].stimp} · green ${f(S.outline.rx * 2 / FT)}×${f(S.outline.rz * 2 / FT)} ft · at pin ${f(Math.hypot(gp.x, gp.z) * 100, 1)}% · 5ft ${f(mx(5), 1)}% · 10ft ${f(mx(10), 1)}% · 20ft ${f(mx(20), 1)}% · 30ft ${f(mx(30), 1)}%`);
    }
  } catch (e) { out.push('   (hole scan failed: ' + e.message + ')'); }

  // A11 the longest putt each green can ask for, against the Lag scale's ceiling (110% of 90 ft)
  out.push('', 'A11 LONGEST PUTT on each green (1 m grid): farthest point from the pin, and the most a putt plays in flat ft (1.5 ft past, elevation in) at the hole\'s stimp / at +2.5 (country club). The Lag scale tops out at 99 ft');
  try {
    for (let i = 0; i < g.HOLES.length; i++) {
      g.selectHole(i); const S = g.hole.surface, pin = g.hole.pin, o = S.outline, R = Math.max(o.rx, o.rz), fast = g.rollDecel(g.HOLES[i].stimp + 2.5);
      let far = 0, plays = 0, playsF = 0, n = 0, over = 0, overF = 0;
      for (let x = o.x - R; x <= o.x + R; x += 1) for (let z = o.z - R; z <= o.z + R; z += 1) {
        if (!S.inside(x, z)) continue;
        n++; const d = Math.hypot(x - pin.x, z - pin.z) / FT; far = Math.max(far, d);
        if (d < 3) continue;
        const v = g.greenView(S, { x, z }), a = g.puttTarget(v).playsFt, b = g.puttTarget({ ...v, decel: fast }).playsFt;
        plays = Math.max(plays, a); playsF = Math.max(playsF, b); if (a > 99) over++; if (b > 99) overF++;
      }
      out.push(`   hole ${i + 1}: farthest ${f(far)} ft · plays up to ${f(plays)} ft (${f(over / n * 100, 1)}% of the green over 99) · country club ${f(playsF)} ft (${f(overF / n * 100, 1)}% over 99)`);
    }
  } catch (e) { out.push('   (longest-putt scan failed: ' + e.message + ')'); }
  return out.join('\n');
})()
