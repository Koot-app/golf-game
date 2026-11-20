// Swing audit fixes S2.2 (height + More spin stack only so far) and S2.3 (the height risk is charged on the loft the
// club's floor lets you take off): the re-measures.
//   node tools/test/probe.js "http://127.0.0.1:8090/?nohome" - @tools/test/swing-fix12.js 0 swing-fix12
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 50 && !window.__golf; i++) await sleep(200);
  const g = window.__golf, YD = 0.9144, out = [], C = g.CLUBS, M = g.CLUB_MODELS, st = g.state;
  const f = (v, n = 0) => (v === null || v === undefined || Number.isNaN(v) ? '—' : v.toFixed(n));
  const padE = (s, n) => String(s).padEnd(n);
  st.lie = 'fairway'; st.slope = 'flat'; st.power = 5; st.dex = 5; st.composure = 5; st.badStreak = 0; st.height = 0; st.spinCtl = 0;
  const SU = { face: 0, ballPos: 0, stance: 0, traj: 0, spinCtl: 0 };
  const SW0 = { bs: 1, ds: 1, thetaMouse: 0, sigma: 0, lateSign: 1, vImpact: 1, vPeak: 1, miss: 0 };
  const stock = (club, su, lie = 'fairway', ground = 'green') => {
    const teed = !!club.tee && lie === 'fairway';
    const r = g.computeImpact(SW0, su, club, { lie, slope: 'flat', power: 5, dex: 5, composure: 5, badStreak: 0, teed, stock: true }, () => 0.5);
    const fl = g.createFlight({ ballSpeed: r.ballSpeed, vla: r.vla, dir: r.hla, spin: r.spin, axis: r.axis, release: r.release, ground: ground ? () => g.SURF[ground] : null }, { x: 0, z: 0 }, teed ? 0.04 : 0);
    for (let n = 0; fl.phase !== 'stopped' && n < 30000; n++) g.stepFlight(fl, 1 / 120);
    return { r, carry: fl.carry / YD, total: -fl.p.z / YD };
  };
  // ---- S2.2
  out.push('S2.2 SPIN WITH THE HEIGHT AND SPIN ASKS (stock, fairway, onto a green): rpm, and carry / total for the last two',
    '   (before: 7 iron 7,000 / 8,400 / 9,800 / 11,760 / 12,600; PW 9,200 / 11,960 / 12,880 / 16,744 / 17,940; SW 10,100 / 13,130 / 14,140 / 18,382 / 19,695; LW 10,500 / 13,650 / 14,700 / 19,110 / 20,475)',
    '   club             stock · More · High 1 · High 2 · High 2 + More · + ball forward');
  for (const ci of [7, 9, 10, 11, 12, 13]) {
    const cells = [SU, { ...SU, spinCtl: 1 }, { ...SU, traj: 1 }, { ...SU, traj: 2 }, { ...SU, traj: 2, spinCtl: 1 }, { ...SU, traj: 2, spinCtl: 1, ballPos: 1 }].map((su) => stock(C[ci], su));
    out.push(`   ${padE(C[ci].name, 16)} ${cells.map((c) => f(c.r.spin)).join(' · ')}   (High 2 + More: ${f(cells[4].carry)} / ${f(cells[4].total)} · stock ${f(cells[0].carry)} / ${f(cells[0].total)}) · More's risk: alone ${f(cells[1].r.cx.spin, 2)}, on High 2 ${f(cells[4].r.cx.spin, 2)}`);
  }
  out.push('   lower asks are not capped: 7 iron Low 2 / Less spin / Low 2 + Less ' + [{ ...SU, traj: -2 }, { ...SU, spinCtl: -1 }, { ...SU, traj: -2, spinCtl: -1 }].map((su) => f(stock(C[7], su).r.spin)).join(' / '));
  out.push('   from light rough (spinCap): SW stock / More / High 2 + More ' + [SU, { ...SU, spinCtl: 1 }, { ...SU, traj: 2, spinCtl: 1 }].map((su) => f(stock(C[12], su, 'light').r.spin)).join(' / '));
  // a chip with More spin and high: part swings stay well under the cap
  {
    const rnd = () => 0.5, r = g.computeImpact({ ...SW0, bs: 0.4 }, { ...SU, traj: 2, spinCtl: 1 }, C[12], { lie: 'fairway', slope: 'flat', power: 5, dex: 5, composure: 5, badStreak: 0, teed: false, stock: true }, rnd);
    const r0 = g.computeImpact({ ...SW0, bs: 0.4 }, SU, C[12], { lie: 'fairway', slope: 'flat', power: 5, dex: 5, composure: 5, badStreak: 0, teed: false, stock: true }, rnd);
    out.push(`   a 40% sand-wedge swing: stock ${f(r0.spin)} rpm, High 2 + More ${f(r.spin)} rpm (×${f(r.spin / r0.spin, 2)}, the +35% cap)`);
  }
  // ---- S2.3
  const apply = (i, id) => { const c = C[i]; for (const k of Object.keys(c)) if (!(k in g.BASE_CLUBS[i])) delete c[k]; Object.assign(c, g.BASE_CLUBS[i]); if (id) Object.assign(c, g.modelMods(M[id], i), { model: id }); };
  out.push('', 'S2.3 THE HEIGHT LEVELS ON HIGH-FLOOR CLUBS (stock, fairway, no green): loft applied · spin × · launch · carry / total · height risk',
    '   (before, the comparison GI 7 iron: Low 2 −2.7° · 189 / 199 · risk 0.60; Low 1 the same shot · risk 0.25)');
  const rows = [['the comparison GI 7 iron', C[g.CLUBS.length - 1] && C.find((c) => /Game Improvement/.test(c.name))], ['base 7 iron (floor 0.50)', 7, null], ['Qi Max 7 iron (0.85)', 7, 'i-qimax'], ['M2 7 iron (0.80)', 7, 'i-m2'], ['base driver (0.70)', 0, null]];
  for (const [name, a, id] of rows) {
    let club;
    if (typeof a === 'number') { apply(a, id); club = C[a]; } else club = a;
    if (!club) { out.push(`   ${name}: not found`); continue; }
    out.push(`   ${name} (floor ${club.floor}):`);
    const mid = stock(club, SU, 'fairway', null);
    for (const traj of [-2, -1, 0]) {
      const s = stock(club, { ...SU, traj }, 'fairway', null);
      out.push(`      ${padE(traj ? `Low ${-traj}` : 'Mid', 6)} loft ${f(s.r.dynLoft - mid.r.dynLoft, 1)}° · spin ×${f(s.r.spin / mid.r.spin, 2)} · launch ${f(s.r.vla, 1)}° · ${f(s.carry)} / ${f(s.total)} · risk ${f(s.r.cx.height, 2)}`);
    }
    if (typeof a === 'number') apply(a, null);
  }
  // the toast
  {
    const T = document.getElementById('toast'), step = (h) => { T.textContent = ''; g.setHeight(h); return T.textContent.replace(/\n/g, ' | ') || '(no toast)'; };
    apply(7, 'i-qimax'); st.mode !== 'range' && g.setMode('range'); await sleep(200); st.view = 'address'; st.club = 7; st.ballPos = 0;
    g.setHeight(0);
    out.push('', `   the Qi Max 7 iron, Mid → Low 1: ${step(-1)}`, `   Low 1 → Low 2: ${step(-2)}`);
    g.setHeight(0); apply(7, null); g.setHeight(-1);
    out.push(`   the base 7 iron, Low 1 → Low 2: ${step(-2)}`);
    g.setHeight(0);
  }
  return out.join('\n');
})()
