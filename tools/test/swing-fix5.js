// Swing audit fixes S5.5 (a wood model's bulge follows its gear) and S5.6 (an iron set's PW gets half the loft change):
// the re-measures.
//   node tools/test/probe.js "http://127.0.0.1:8090/?nohome" - @tools/test/swing-fix5.js 0 swing-fix5
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 50 && !window.__golf; i++) await sleep(200);
  const g = window.__golf, YD = 0.9144, out = [], C = g.CLUBS, M = g.CLUB_MODELS;
  const f = (v, n = 0) => (v === null || v === undefined || Number.isNaN(v) ? '—' : v.toFixed(n));
  const SU = { face: 0, ballPos: 0, stance: 0, traj: 0, spinCtl: 0 };
  const apply = (i, id) => { const c = C[i]; for (const k of Object.keys(c)) if (!(k in g.BASE_CLUBS[i])) delete c[k]; Object.assign(c, g.BASE_CLUBS[i]); if (id) Object.assign(c, g.modelMods(M[id], i), { model: id }); };
  const shot = (ci, sw = {}) => { const teed = ci === 0, r = g.computeImpact({ bs: 1, ds: 1, thetaMouse: 0, sigma: 0, lateSign: 1, vImpact: 1, vPeak: 1, miss: 0, ...sw }, SU, C[ci], { lie: 'fairway', slope: 'flat', power: 5, dex: 5, composure: 5, badStreak: 0, teed, stock: true }, () => 0.5);
    const fl = g.createFlight({ ballSpeed: r.ballSpeed, vla: r.vla, dir: r.hla, spin: r.spin, axis: r.axis, release: r.release }, { x: 0, z: 0 }, teed ? 0.04 : 0); for (let n = 0; fl.phase !== 'stopped' && n < 30000; n++) g.stepFlight(fl, 1 / 120); return { c: fl.carry / YD, side: fl.p.x / YD }; };
  const mm = (v) => ({ sigma: Math.abs(v) / 1.0056, lateSign: v > 0 ? 1 : -1 });
  // ---- S5.5
  out.push('S5.5 OFF-CENTRE HITS: where a drive (and a 3 wood) finishes, yds (+ right): centred, toe 8 / 14 mm, heel 8 / 14 mm; and the carry at toe 14');
  const side = (ci) => { const s0 = shot(ci); return [s0.side, ...[8, 14, -8, -14].map((v) => shot(ci, mm(v)).side)].map((v) => `${v >= 0 ? '+' : ''}${f(v)}`).join(' / ') + ` · toe 14 carry ${f(shot(ci, mm(14)).c)}`; };
  for (const id of [null, ...Object.keys(M).filter((k) => M[k].kind === 'driver')]) { apply(0, id); out.push(`   ${(id || 'base driver').padEnd(13)} bulge ${f(C[0].bulge, 2)} · ${side(0)}`); }
  apply(0, null);
  for (const id of [null, ...Object.keys(M).filter((k) => M[k].kind === 'wood')]) { apply(1, id); out.push(`   ${(id || 'base 3 wood').padEnd(13)} bulge ${f(C[1].bulge, 2)} · ${side(1)}`); }
  apply(1, null);
  // ---- S5.6
  out.push('', 'S5.6 EACH IRON SET\'S SHORT END: PW loft, carries of the 9 iron, PW and the base gap wedge, and the gaps');
  const gw = shot(11).c;
  for (const id of [null, ...Object.keys(M).filter((k) => M[k].kind === 'iron')]) {
    apply(9, id); apply(10, id); const n9 = shot(9).c, pw = shot(10).c;
    out.push(`   ${(id || 'base irons').padEnd(13)} PW ${f(C[10].loft, 1)}° · 9 iron ${f(n9)} → PW ${f(pw)} (${f(n9 - pw)}) → GW ${f(gw)} (${f(pw - gw)})`);
  }
  apply(9, null); apply(10, null);
  return out.join('\n');
})()
