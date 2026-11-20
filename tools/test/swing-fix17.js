// Swing audit fixes S4.3 (the driver's distance) and S5.6 (a strong-lofted iron set gets an automatic approach wedge
// in the gap wedge's slot): the re-measures.
//   node tools/test/probe.js "http://127.0.0.1:8090/?nohome" - @tools/test/swing-fix17.js 0 swing-fix17
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms)), $ = (id) => document.getElementById(id);
  for (let i = 0; i < 50 && !window.__golf; i++) await sleep(200);
  const g = window.__golf, YD = 0.9144, out = [], C = g.CLUBS, M = g.CLUB_MODELS, B = g.BASE_CLUBS;
  const f = (v, n = 0) => (v === null || v === undefined || Number.isNaN(v) ? '—' : v.toFixed(n));
  const padE = (s, n) => String(s).padEnd(n), sgn = (v) => `${v >= 0 ? '+' : '−'}${f(Math.abs(v))}`;
  const SU = { face: 0, ballPos: 0, stance: 0, traj: 0, spinCtl: 0 };
  const SW0 = { bs: 1, ds: 1, thetaMouse: 0, sigma: 0, lateSign: 1, vImpact: 1, vPeak: 1, miss: 0 };
  const shot = (ci, su = SU) => { const teed = !!C[ci].tee; const r = g.computeImpact(SW0, su, C[ci], { lie: 'fairway', slope: 'flat', power: 5, dex: 5, composure: 5, badStreak: 0, teed, stock: true }, () => 0.5); const fl = g.createFlight({ ballSpeed: r.ballSpeed, vla: r.vla, dir: r.hla, spin: r.spin, axis: r.axis, release: r.release }, { x: 0, z: 0 }, teed ? 0.04 : 0); for (let n = 0; fl.phase !== 'stopped' && n < 30000; n++) g.stepFlight(fl, 1 / 120); return { r, c: fl.carry / YD, t: -fl.p.z / YD }; };
  const apply = (i, id) => { const c = C[i]; for (const k of Object.keys(c)) if (!(k in B[i])) delete c[k]; Object.assign(c, B[i]); if (id) Object.assign(c, g.modelMods(M[id], i), { model: id }); };
  const resetAll = () => { for (let i = 0; i < C.length; i++) apply(i, null); };
  const CI = { PW: 10, GW: 11, SW: 12 };

  // ===== S4.3: the driver
  {
    out.push('S4.3 THE DRIVER (stock, teed, Power 5): club / ball mph, launch, spin · carry / total · High 1 · the 3 wood · each driver model struck centred',
      '   (before: 113 mph, dynLoft 12.8: 266 / 283, High 1 271 / 283; tour 275 carry; the driver–3 wood gap 23, tour 32)');
    resetAll();
    const s = shot(0), h1 = shot(0, { ...SU, traj: 1 }), w3 = shot(1);
    out.push(`   base driver ${f(s.r.clubSpeed, 1)} / ${f(s.r.ballSpeed)} mph, ${f(s.r.vla, 1)}°, ${f(s.r.spin)} rpm · ${f(s.c)} / ${f(s.t)} · High 1 ${f(h1.c)} / ${f(h1.t)} · 3 wood ${f(w3.c)} (gap ${f(s.c - w3.c)})`);
    const rows = Object.keys(M).filter((id) => M[id].kind === 'driver').map((id) => { apply(0, id); const x = shot(0); return `${M[id].name} ${f(x.c)} / ${f(x.t)}`; });
    out.push(`   models, centred: ${rows.join(' · ')}`);
    apply(0, null);
  }

  // ===== S5.6: the approach wedge
  {
    out.push('', `S5.6 THE WEDGE GAPS BY IRON SET (stock carry, yds; the gap wedge's slot with the starter's Vokey SM6; APPROACH: PW ≤ ${g.APPROACH.pwMax}° gets an approach wedge at PW + ${g.APPROACH.step}°)`,
      '   set                          PW loft · PW carry → gap wedge / approach wedge (loft, carry) → sand wedge   (gaps)          before: PW → GW');
    const ironIds = Object.keys(M).filter((id) => M[id].kind === 'iron');
    for (const id of [null, ...ironIds]) {
      resetAll();
      for (let i = 4; i <= CI.PW; i++) apply(i, id);
      apply(CI.GW, 'w-sm6'); apply(CI.SW, 'w-sm6');
      const pw = shot(CI.PW), gwBefore = shot(CI.GW);
      const isAW = id ? g.fitApproachWedge() : false, gw = shot(CI.GW), sw = shot(CI.SW);
      out.push(`   ${padE(id ? `${M[id].name} (${M[id].cat})` : 'base irons', 30)} ${f(C[CI.PW].loft, 1)}° · ${f(pw.c)} → ${isAW ? 'AW' : 'GW'} ${f(C[CI.GW].loft, 1)}° ${f(gw.c)} → SW ${f(sw.c)}   (${f(pw.c - gw.c)} / ${f(gw.c - sw.c)})          ${f(pw.c - gwBefore.c)}`);
    }
    resetAll();
    // the same through a real career: a guest career with a Qi Max set and the starter's wedges
    localStorage.clear(); window.confirm = () => true;
    $('hmGuest') && $('hmGuest').click(); await sleep(150);
    const cb = document.querySelector('[data-h=career]'); if (cb) { cb.click(); await sleep(200); }
    if ($('chName')) { $('chName').value = 'TESTAW'; $('chCreate').click(); await sleep(400); }
    const car = g.career;
    if (car && g.careerOn) {
      const before = `${C[CI.GW].name} ${f(C[CI.GW].loft, 1)}° (model ${C[CI.GW].model || 'none: the starter has no gap wedge'})`;
      car.bag[CI.GW] = 'w-vokey';
      for (let i = 4; i <= CI.PW; i++) car.bag[i] = 'i-qimax';
      g.applyCareerClubs();
      const n = g.bagClubNumbers(CI.GW);
      out.push('', `   in a career: the starter's gap wedge slot is "${before}"; with a Vokey SM11 there and a Qi Max set it is "${C[CI.GW].name} ${f(C[CI.GW].loft, 1)}°" (model ${C[CI.GW].model}), the locker's row: ${n.name} ${f(n.loft, 1)}°, ${f(n.carry)} carry`);
      for (let i = 4; i <= CI.PW; i++) car.bag[i] = 'i-wmb';
      g.applyCareerClubs();
      out.push(`   back to a blade set: "${C[CI.GW].name} ${f(C[CI.GW].loft, 1)}°"; the locker's row now ${g.bagClubNumbers(CI.GW).name} ${f(g.bagClubNumbers(CI.GW).loft, 1)}°`);
    } else out.push('', '   (no career could be started here)');
  }
  return out.join('\n');
})()
