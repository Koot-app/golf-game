// Swing audit S7: shot shaping, height and spin. Every control at address, measured with no scatter (computeImpact
// stock + the real flight), plus a solver sweep and the career's shot locks.
//   node tools/test/probe.js "http://127.0.0.1:8090/?nohome" - @tools/test/swing-shape.js 0 swing-s7
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 50 && !window.__golf; i++) await sleep(200);
  const g = window.__golf, YD = 0.9144, out = [], C = g.CLUBS, D2R = Math.PI / 180;
  const f = (v, n = 1) => (v === null || v === undefined || Number.isNaN(v) ? '—' : v.toFixed(n));
  const pad = (s, n) => String(s).padStart(n), padE = (s, n) => String(s).padEnd(n);
  const sgn = (v, n = 0) => `${v > 0.05 ? '+' : v < -0.05 ? '−' : '±'}${f(Math.abs(v), n)}`;
  const S = g.state; S.lie = 'fairway'; S.slope = 'flat'; S.power = 5; S.dex = 5; S.composure = 5; S.badStreak = 0; S.height = 0; S.spinCtl = 0; S.shotShape = 'straight';
  const SU = { face: 0, ballPos: 0, stance: 0, traj: 0, spinCtl: 0 };
  const short = (n) => n.replace('Pitching Wedge', 'PW').replace('Gap Wedge', 'GW').replace('Sand Wedge', 'SW').replace('Lob Wedge', 'LW');
  // stock shot: launch numbers, carry / total / side / apex / roll, curve away from the start line; ground and wind optional
  const shot = (ci, su = SU, sw = {}, o = {}) => {
    const club = C[ci], lie = o.lie || S.lie, teed = !!club.tee && lie === 'fairway';
    const r = g.computeImpact({ bs: 1, ds: 1, thetaMouse: 0, sigma: 0, lateSign: 1, vImpact: 1, vPeak: 1, miss: 0, ...sw }, su, club, { lie, slope: 'flat', power: S.power, dex: S.dex, composure: 5, badStreak: 0, teed, stock: true }, () => 0.5);
    const fl = g.createFlight({ ballSpeed: r.ballSpeed, vla: r.vla, dir: r.hla, spin: r.spin, axis: r.axis, release: r.release, ground: o.ground ? () => g.SURF[o.ground] : null }, o.wind || { x: 0, z: 0 }, teed ? 0.04 : 0);
    for (let n = 0; fl.phase !== 'stopped' && n < 30000; n++) g.stepFlight(fl, 1 / 120);
    const carry = fl.carry / YD, side = fl.p.x / YD, total = -fl.p.z / YD;
    return { r, carry, total, side, apex: fl.apex / YD, roll: total - (fl.land ? -fl.land.z / YD : 0), curve: Math.abs(side + Math.tan(r.hla * D2R) * fl.p.z / YD), startYds: Math.tan(r.hla * D2R) * carry };
  };
  const solved = (ci, sg) => { const v = g.solveShape(ci, sg); return { ...SU, face: v.face, stance: v.stance, traj: S.height, spinCtl: S.spinCtl }; };
  // ===================== 1. solved draw and fade, every club, Dex 1 / 5 / 10
  out.push('1. THE SOLVED DRAW AND FADE (fairway, Power 5, height Mid, normal spin): face / stance → curve yds, start yds (+ right), finish yds,',
    '   then against the straight shot: carry Δ, total Δ, launch Δ, spin Δ; and draw total − fade total');
  for (const dex of [1, 5, 10]) {
    S.dex = dex;
    out.push(`   Dexterity ${dex}`, `   ${padE('club', 7)}${padE('draw', 66)}${padE('fade', 66)}draw − fade total`);
    for (let ci = 0; ci < 14; ci++) {
      const st = shot(ci), cells = [], tot = {};
      for (const sg of [-1, 1]) {
        const su = solved(ci, sg), s = shot(ci, su); tot[sg] = s.total;
        cells.push(padE(`${pad(f(su.face, 1), 5)}/${pad(f(su.stance, 1), 5)} → ${pad(f(s.curve, 0), 2)}, start ${pad(f(s.startYds, 0), 3)}, end ${pad(f(s.side, 1), 4)} · ${pad(sgn(s.carry - st.carry), 3)} ${pad(sgn(s.total - st.total), 3)} ${pad(sgn(s.r.vla - st.r.vla, 1), 5)}° ${pad(sgn(s.r.spin - st.r.spin), 5)}`, 66));
      }
      out.push(`   ${padE(short(C[ci].name), 7)}${cells.join('')}${sgn(tot[-1] - tot[1])}`);
    }
  }
  S.dex = 5;
  // ===================== 2. does the solver ever fail?
  out.push('', '2. SOLVER SWEEP (Dex 5): every club × lie (fairway, light, heavy) × height (−2…+2) × spin (−1, 0, +1) × draw / fade.',
    '   A failure: the face at its ±10° limit, the stance at ±15°, the ball finishing more than 2 yds off the aim line, or less than half the curve the solver wanted');
  let tried = 0; const fails = [];
  for (const lie of ['fairway', 'light', 'heavy']) {
    S.lie = lie;
    for (let ci = 0; ci < 14; ci++) for (const h of [-2, -1, 0, 1, 2]) for (const sp of [-1, 0, 1]) for (const sg of [-1, 1]) {
      S.height = h; S.spinCtl = sp; tried++;
      const v = g.solveShape(ci, sg), su = { ...SU, face: v.face, stance: v.stance, traj: h, spinCtl: sp }, s = shot(ci, su, {}, { lie });
      const base = shot(ci, { ...SU, traj: h, spinCtl: sp }, {}, { lie }), want = Math.min(14, Math.max(3.5, 0.055 * base.carry));
      const why = [];
      if (Math.abs(v.face) >= 10) why.push(`face ${v.face}`); if (Math.abs(v.stance) >= 15) why.push(`stance ${v.stance}`);
      if (Math.abs(s.side) > 2) why.push(`finishes ${f(s.side, 1)} yds`); if (s.curve < want * 0.5) why.push(`curve ${f(s.curve, 1)} of ${f(want, 1)}`);
      if (why.length) fails.push(`${lie} ${short(C[ci].name)} h${h} s${sp} ${sg < 0 ? 'draw' : 'fade'}: ${why.join(', ')}`);
    }
  }
  S.lie = 'fairway'; S.height = 0; S.spinCtl = 0;
  out.push(`   ${tried} solves, ${fails.length} failures${fails.length ? ':' : ''}`);
  const byKind = {}; for (const x of fails) { const k = x.split(':')[1].replace(/-?\d+(\.\d+)?/g, 'n').trim(); byKind[k] = (byKind[k] || 0) + 1; }
  out.push(`   by kind: ${Object.entries(byKind).map(([k, n]) => `${k} ×${n}`).join(' · ')}`);
  for (const x of fails.slice(0, 40)) out.push(`      ${x}`);
  if (fails.length > 40) out.push(`      … and ${fails.length - 40} more`);
  // ===================== 3. a hand-swung shape against the preset
  out.push('', '3. A HAND-SWUNG SHAPE (square setup, mouse path ±5° / ±10°; + = in-to-out = draw) against the preset: finish side, curve, total, complexity');
  for (const ci of [0, 1, 4, 7, 10, 12]) {
    const cells = [];
    for (const th of [5, 10, -5, -10]) { const s = shot(ci, SU, { thetaMouse: th }); cells.push(`${pad(th, 3)}°: ${pad(f(s.side, 0), 4)}, curve ${pad(f(s.curve, 0), 3)}, ${f(s.total, 0)}, cx ${f(s.r.complexity, 2)}`); }
    const d = shot(ci, solved(ci, -1));
    out.push(`   ${padE(short(C[ci].name), 7)}${cells.join(' · ')} · preset draw: ${f(d.side, 0)}, curve ${f(d.curve, 0)}, ${f(d.total, 0)}, cx ${f(d.r.complexity, 2)}`);
  }
  // ===================== 4. the height ladder
  out.push('', '4. HEIGHT, Low 2 … High 2 (fairway, straight): launch° · apex · spin · carry / total · roll · complexity',
    '   and into a 15 mph headwind: total (and its loss from calm)');
  for (let ci = 0; ci < 14; ci++) {
    const cells = [];
    for (const h of [-2, -1, 0, 1, 2]) {
      const su = { ...SU, traj: h }, s = shot(ci, su), w = shot(ci, su, {}, { wind: g.windVector(15, 0) });
      cells.push(`${pad(f(s.r.vla, 1), 4)} ${pad(f(s.apex, 0), 2)} ${pad(f(s.r.spin / 1000, 1), 4)}k ${pad(f(s.carry, 0), 3)}/${pad(f(s.total, 0), 3)} ${pad(f(s.roll, 0), 2)} ${f(s.r.complexity, 2)} | wind ${pad(f(w.total, 0), 3)} (${sgn(w.total - s.total)})`);
    }
    out.push(`   ${padE(short(C[ci].name), 7)}${cells.map((c) => padE(c, 52)).join('')}`);
  }
  // ===================== 5. spin control
  out.push('', '5. SPIN CONTROL, Less / Normal / More: spin, launch, carry, and the roll on a green; fairway, then light rough');
  for (const lie of ['fairway', 'light']) {
    out.push(`   ${g.LIES[lie].name}`);
    for (const ci of [0, 1, 4, 7, 9, 10, 12, 13]) {
      const cells = [-1, 0, 1].map((sp) => { const s = shot(ci, { ...SU, spinCtl: sp }, {}, { lie, ground: 'green' }); return `${pad(f(s.r.spin, 0), 5)} ${pad(f(s.r.vla, 1), 4)}° ${pad(f(s.carry, 0), 3)} roll ${pad(f(s.roll, 1), 4)}`; });
      out.push(`      ${padE(short(C[ci].name), 7)}${cells.map((c) => padE(c, 30)).join('')}`);
    }
  }
  // ===================== 6. one step of each hand tweak
  out.push('', '6. ONE STEP OF EACH TWEAK at address (Q/E face 0.5°, Z/C stance 0.5°, A/D ball position 0.1): side, launch, spin, carry, total change');
  for (const ci of [0, 7, 12]) {
    const st = shot(ci), cells = [];
    for (const [n, su] of [['face +0.5 (open)', { ...SU, face: 0.5 }], ['stance +0.5', { ...SU, stance: 0.5 }], ['ball +0.1 (forward)', { ...SU, ballPos: 0.1 }], ['ball −1 (all the way back)', { ...SU, ballPos: -1 }]]) {
      const s = shot(ci, su); cells.push(`${n}: side ${sgn(s.side - st.side, 1)}, launch ${sgn(s.r.vla - st.r.vla, 1)}, spin ${sgn(s.r.spin - st.r.spin)}, ${sgn(s.carry - st.carry)} / ${sgn(s.total - st.total)}, cx ${f(s.r.complexity, 2)}`);
    }
    out.push(`   ${short(C[ci].name)}: ${cells.join(' · ')}`);
  }
  // ===================== 7. the career's shot locks
  out.push('', '7. CAREER SHOT LOCKS: what can still be produced while a shot is locked');
  for (const ci of [0, 1, 4, 7, 10]) {
    const lo2 = shot(ci, { ...SU, traj: -2 }), byBall = shot(ci, { ...SU, traj: -1, ballPos: -1 }), hi2 = shot(ci, { ...SU, traj: 2 }), byBallHi = shot(ci, { ...SU, traj: 1, ballPos: 1 });
    const tw = shot(ci, { ...SU, face: 2, stance: -2 }), twD = shot(ci, { ...SU, face: -2, stance: 2 }), dr = shot(ci, solved(ci, -1)), mouse = shot(ci, SU, { thetaMouse: 6 });
    out.push(`   ${padE(short(C[ci].name), 7)} Low 2 ${f(lo2.r.vla, 1)}° ${f(lo2.apex, 0)} ${f(lo2.total, 0)} cx ${f(lo2.r.complexity, 2)} = Low 1 + ball back ${f(byBall.r.vla, 1)}° ${f(byBall.apex, 0)} ${f(byBall.total, 0)} cx ${f(byBall.r.complexity, 2)}`
      + ` · High 2 ${f(hi2.apex, 0)} ${f(hi2.total, 0)} = High 1 + ball forward ${f(byBallHi.apex, 0)} ${f(byBallHi.total, 0)}`
      + ` · with the ±2° tweak cap: fade ${f(tw.curve, 0)} yds of curve (ends ${f(tw.side, 0)}), draw ${f(twD.curve, 0)} (ends ${f(twD.side, 0)}); the preset draw ${f(dr.curve, 0)}; a 6° mouse path ${f(mouse.curve, 0)} (ends ${f(mouse.side, 0)})`);
  }
  return out.join('\n');
})()
