// Audit section 4: how the hustlers actually score, and whether the shots they are shown playing add up.
//   node tools/test/probe.js http://127.0.0.1:8090/ - @tools/test/match-hustlers.js 0 audit-hustlers
// Part 1: 3,000 nine-hole rounds per hustler from npcHoleScore() (the function a match uses), on their own circuit.
// Part 2: on every hole of a real match, 400 shot plans from npcPlan() for scores drawn the same way, checked:
//         as many strokes as the score, the last one holed, nothing out of bounds, no nonsense sequences.
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms)), $ = (id) => document.getElementById(id);
  for (let i = 0; i < 50 && !window.__golf; i++) await sleep(200);
  localStorage.clear(); window.confirm = () => true; const g = window.__golf, out = [];
  $('hmGuest').click(); await sleep(150); document.querySelector('[data-h=career]').click(); await sleep(200);
  $('chName').value = 'TESTER'; $('chCreate').click(); await sleep(300);
  // (the game's own hustlers: their circuit, listed skill and pips, as they are now)
  const NP = g.NPCS.map((n) => [n.id, n.tier, n.skill, g.npcRating(n)]);
  const pars = g.HOLES.map((h) => h.par), PAR = pars.reduce((a, b) => a + b, 0), rnd = () => (Math.random() * 2 ** 31) >>> 0;
  // ---- part 1
  out.push('hustler  tier pips  skill  avg/hole  avg round   10%  median  90%   best worst  birdie+  double+  aces/1000 par 3s  eagles on par 4/1000');
  const pct = (a, p) => a[Math.min(a.length - 1, Math.floor(a.length * p))];
  for (const [id, tier, skill, pips] of NP) {
    const N = 3000, totals = []; let sum = 0, bird = 0, dbl = 0, aces = 0, p3 = 0, eag4 = 0, p4 = 0;
    for (let k = 0; k < N; k++) {
      const m = { npc: id, tier, no: k + 1, salt: rnd() }; let t = 0;
      for (let i = 0; i < 9; i++) {
        const s = g.npcHoleScore(m, i), d = s - pars[i]; t += s; sum += d;
        if (d <= -1) bird++; if (d >= 2) dbl++;
        if (pars[i] === 3) { p3++; if (s === 1) aces++; }
        if (pars[i] === 4) { p4++; if (s <= 2) eag4++; }
      }
      totals.push(t - PAR);
    }
    totals.sort((a, b) => a - b);
    const f = (v, n = 2) => (v >= 0 ? '+' : '') + v.toFixed(n);
    out.push(`${id.padEnd(8)} ${tier}    ${pips}     ${skill.toFixed(2)}   ${f(sum / (N * 9))}     ${f(sum / N, 1).padStart(5)}      ${String(pct(totals, 0.1)).padStart(3)}  ${String(pct(totals, 0.5)).padStart(4)}   ${String(pct(totals, 0.9)).padStart(3)}   ${String(totals[0]).padStart(4)} ${String(totals[totals.length - 1]).padStart(5)}  ${(100 * bird / (N * 9)).toFixed(1).padStart(5)}%   ${(100 * dbl / (N * 9)).toFixed(1).padStart(5)}%   ${(1000 * aces / p3).toFixed(1).padStart(6)}            ${(1000 * eag4 / p4).toFixed(1).padStart(6)}`);
  }
  // ---- part 2: the plans, on each hole of a match vs Marco (the wildest scorer) and Dale (the worst)
  g.career.cash = 5000; g.careerSave();
  document.querySelector('[data-go=match]').click(); await sleep(300);
  $('cmGo').click(); await sleep(500); $('riStart').click();
  for (let k = 0; k < 40 && !g.tossOpen; k++) await sleep(50);
  const m = g.career.match; m.toss = 'me'; g.closeToss(); await sleep(200);
  const bad = {}, note = (k) => { bad[k] = (bad[k] || 0) + 1; };
  let plans = 0, strokes = 0; const surf = {};
  for (let i = 0; i < 9; i++) {
    const pin = g.hole.pin, dPin = (p) => Math.hypot(pin.x - p.x, pin.z - p.z);
    for (let t = 0; t < 400; t++) {
      const id = t % 2 ? 'marco' : 'dale', fm = { npc: id, tier: 1, no: t + 1, salt: rnd() };
      const S = t < 40 ? Math.max(1, pars[i] - (pars[i] === 3 ? 2 : pars[i] === 5 ? 2 : 1) + (t % 8)) : g.npcHoleScore(fm, i);   // (the first 40: every score he can make, ace to +5)
      const plan = g.npcPlan(fm, i, S); plans++; strokes += plan.length;
      if (plan.length !== S) note(`strokes shown (${plan.length - S > 0 ? 'more' : 'fewer'} than the score)`);
      if (!plan[plan.length - 1].holed || dPin(plan[plan.length - 1].to) > 0.01) note('last stroke not in the hole');
      let putts = 0, nearMiss = 0;
      plan.forEach((st, j) => {
        if (![st.from.x, st.from.z, st.to.x, st.to.z].every(Number.isFinite)) note('a stroke with no position');
        const sf = g.surfaceAt(st.to.x, st.to.z); surf[sf] = (surf[sf] || 0) + 1;
        if (sf === 'ob') note('lands out of bounds (no penalty is counted)');
        if (st.type === 'putt') putts++;
        if (st.type !== 'putt' && j > 0 && dPin(st.from) < 30 && dPin(st.to) > dPin(st.from) + 3) note('a short shot that ends farther from the pin');
        if (st.type !== 'putt' && dPin(st.from) < 40 && !st.holed && g.surfaceAt(st.to.x, st.to.z) !== 'green') nearMiss++;
        if (j > 0 && st.type === 'full' && plan[j - 1].type === 'putt') note('a full shot after a putt');
      });
      if (putts >= 4) note('four or more putts'); if (nearMiss >= 3) note('three or more short shots in a row that miss the green');
    }
    if (i < 8) { g.npc.done = true; g.hp.strokes = pars[i]; g.hp.putts = 2; g.finishHole(); await sleep(60); g.scorecardNext(); await sleep(200); }
  }
  out.push('', `shot plans checked: ${plans} (${strokes} strokes) · where his ball stops: ${Object.entries(surf).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${(100 * v / strokes).toFixed(1)}%`).join(', ')}`);
  out.push(Object.keys(bad).length ? Object.entries(bad).map(([k, v]) => `  ${String(v).padStart(5)} × ${k}`).join('\n') : '  no problems');
  return out.join('\n');
})()
