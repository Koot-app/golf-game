// BUNKER AUDIT (user report, 2026-11-20: "seems like I'm just stuck in it"): can you get out of every bunker, from
// anywhere in it? For every bunker on every hole, a grid of spots over the sand; from each, the shot the game sets up
// for you (its club, the marker where it suggests, the read's backswing, a stock strike, aimed at the pin) with each
// shot type, and whether it ends up out of the sand. "career" = only Low and Stock, as a new career has (High Soft and
// the Flop are learned from the coach). Fairway bunkers played as full shots use fullFaceRead with the suggested club.
//   node tools/test/probe.js "http://127.0.0.1:8090/?nohome" - @tools/test/bunker-audit.js "window.__tier = 'cc'" audit
// (window.__tier: a TIERS key for a career course's depths; window.__holes: [indices]; window.__step: grid metres)
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 50 && !window.__golf; i++) await sleep(200);
  const g = window.__golf, YD = 0.9144, FT = 0.3048, st = g.state, C = g.CLUBS, out = [];
  const ci = (n) => C.findIndex((c) => c.name === n), SW = ci('Sand Wedge'), LW = ci('Lob Wedge');
  const pct = (a, n) => `${Math.round(100 * a / Math.max(1, n))}%`.padStart(4);
  const step = window.__step || 1.0;
  if (window.__tier) g.setCourse(window.__tier);
  out.push(`BUNKER AUDIT · course ${window.__tier || 'plain'} · grid ${step} m · stock strike at the read's backswing, aimed at the pin`);
  out.push('   (chip shots: % of spots where it ends up OUT of the sand; "none" = spots no shot type gets out of; launch = SW stock)');
  const combos = [['SW low', SW, 'low'], ['SW stock', SW, 'stock'], ['LW stock', LW, 'stock'], ['SW high', SW, 'high'], ['LW flop', LW, 'flop']];
  const holes = window.__holes || [...Array(g.HOLES.length).keys()];
  let totFull = 0, totFullStays = 0, tot = 0, totStock = 0, totNone = 0, totCareerNone = 0, totReal = 0, totRealOut = 0;
  for (const h of holes) {
    g.selectHole(h); g.enterHole(); await sleep(100);
    for (const [bi, d] of g.hole.dips.entries()) {
      if (window.__bunkers && !window.__bunkers.includes(bi)) continue;
      const t0 = performance.now();
      const c = Math.cos(d.rot), s = Math.sin(d.rot), pts = [];
      for (let u = -d.rx; u <= d.rx; u += step) for (let v = -d.rz; v <= d.rz; v += step) {
        if ((u / d.rx) ** 2 + (v / d.rz) ** 2 > 0.9) continue;
        pts.push({ x: d.x + u * c - v * s, z: d.z - (u * s + v * c) });
      }
      const n = { all: 0, none: 0, careerNone: 0, full: 0, fullStays: 0 }, okBy = {}, vla = [], fails = [];
      for (const p of pts) {
        if (!/bunker/.test(g.surfaceAt(p.x, p.z))) continue;
        g.hp.ball = { x: p.x, z: p.z }; g.hp.onTee = false; g.setupNextShot();
        n.all++;
        if (st.mode !== 'chip') {                        // a full shot: the suggested club's face read
          n.full++; const fr = g.fullFaceRead(st.club, st.aim); if (fr && fr.stays) { n.fullStays++; fails.push(`${g.bunkerH(p.x, p.z) / FT > -9 ? (g.bunkerH(p.x, p.z) / FT).toFixed(1) : ''} ft full ${C[st.club].name}`); }
          continue;
        }
        let any = false, careerAny = false;
        for (const [nm, club, ty] of combos) {
          st.club = club; g.applyChipType(ty, true); g.resetChipMarker();
          const cr = g.chipRead;
          const r = g.computeImpact({ bs: cr.bsTrue, ds: 1, thetaMouse: 0, sigma: 0, lateSign: 1, vImpact: 1, vPeak: 1, miss: 0 }, g.setup(), C[st.club], { ...g.env(), stock: true }, () => 0.5);
          const f = g.runChip(g.green, { ballSpeed: r.ballSpeed, vla: r.vla, dir: st.aim, spin: r.spin, axis: r.axis, release: r.release });
          const ok = g.green.surfAt(f.p.x, f.p.z) !== 'bunker';
          okBy[nm] = (okBy[nm] || 0) + (ok ? 1 : 0);
          if (ok) any = true;
          if (ok && (ty === 'low' || ty === 'stock')) careerAny = true;
          if (nm === 'SW stock') { vla.push(r.vla); if (!ok) fails.push(`${(g.bunkerH(p.x, p.z) / FT).toFixed(1)} ft ${st.slope}${g.chipRead.face ? ` face ${g.chipRead.face.ft.toFixed(1)}` : ''}`); }
        }
        // a real hand: window.__real swings of the default shot (SW stock at the suggested landing) at window.__dex
        // Dexterity, with the game's own scatter and the sand's (its speed, launch and spin vary shot to shot)
        if (window.__real) {
          st.club = SW; g.applyChipType('stock', true); g.resetChipMarker();
          const cr = g.chipRead, rnd = g.rng32(Math.round(p.x * 1000) ^ Math.round(p.z * 777)), gs = () => { let s = 0; for (let k = 0; k < 6; k++) s += rnd(); return (s - 3) / Math.SQRT1_2; };
          for (let k = 0; k < window.__real; k++) {
            const sw = { bs: cr.bsTrue * (1 + 0.04 * gs()), ds: 1, thetaMouse: 1.2 * gs(), sigma: 1 + 2 * rnd(), lateSign: rnd() < 0.5 ? 1 : -1, vImpact: 1, vPeak: 1, miss: 0.02 * gs() };
            const r = g.computeImpact(sw, g.setup(), C[st.club], { ...g.env(), dex: window.__dex || 2, composure: 5, badStreak: 0 }, rnd);
            const f = g.runChip(g.green, { ballSpeed: r.ballSpeed, vla: r.vla, dir: st.aim + r.hla, spin: r.spin, axis: r.axis, release: r.release });
            n.real = (n.real || 0) + 1; if (g.green.surfAt(f.p.x, f.p.z) !== 'bunker') n.realOut = (n.realOut || 0) + 1;
          }
        }
        if (!any) n.none++;
        if (!careerAny) n.careerNone++;
      }
      tot += n.all - n.full; totStock += okBy['SW stock'] || 0; totFull += n.full; totFullStays += n.fullStays; totNone += n.none; totCareerNone += n.careerNone;
      const label = `H${h + 1} #${bi} ${d.type === 'fbunker' ? 'fairway ' : 'greenside'} ${(d.D / FT).toFixed(1)} ft${window.__time ? ` (${((performance.now() - t0) / 1000).toFixed(1)} s)` : ''}`;
      if (n.full === n.all) { out.push(`${label}: ${n.all} spots, full shots: suggested club stays in from ${n.fullStays}`); continue; }
      const lo = Math.min(...vla), hi = Math.max(...vla);
      out.push(`${label}: ${String(n.all).padStart(3)} spots · ${combos.map(([nm]) => `${nm} ${pct(okBy[nm] || 0, n.all - n.full)}`).join(' · ')} · none ${pct(n.none, n.all - n.full)} · career none ${pct(n.careerNone, n.all - n.full)} · launch ${lo.toFixed(0)}–${hi.toFixed(0)}°${n.real ? ` · real swings (Dex ${window.__dex || 2}) out ${pct(n.realOut || 0, n.real)}` : ''}`);
      if (n.real) { totReal += n.real; totRealOut += n.realOut || 0; }
      if (fails.length) out.push(`      SW stock stays in from: ${fails.slice(0, 8).join(' | ')}${fails.length > 8 ? ` … (${fails.length})` : ''}`);
    }
  }
  out.push('', `FULL SHOTS (fairway bunkers) ${totFull} spots · the suggested club stays in from ${totFullStays}`);
  out.push(`CHIPS ${tot} spots · SW stock gets out from ${pct(totStock, tot)} · no shot type gets out from ${pct(totNone, tot)} · career (low/stock only) can't get out from ${pct(totCareerNone, tot)}${totReal ? ` · real swings get out ${pct(totRealOut, totReal)}` : ''}`);
  if (window.__tier) g.setCourse(null);
  return out.join('\n');
})()
