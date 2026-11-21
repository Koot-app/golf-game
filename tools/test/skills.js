// SKILLS CHALLENGES (user requests, 2026-11-21): shots to make, scored by the attempts they take. Four of them: one for
// each practice area (ten shots each) and the full test across all three (fifteen, harder), each with its own world
// Top 10. Checks: the home screen's tile has a button for each and starts it on the arcade's bag and stats; every shot's
// rule (a miss says why, the right shot makes it); the challenge moves between the areas by itself and nothing else can;
// the built putting greens (a crown) and the tucked holes (sand on the side they're tucked); real swings on each area
// are counted and judged; the result, the boards, the best scores, playing again, and leaving part-way.
// Works on both sites:
//   node tools/test/probe.js http://127.0.0.1:8090/ <shot|-> @tools/test/skills.js 0 skills1
//   node tools/test/probe.js http://127.0.0.1:8091/ <shot|-> @tools/test/skills.js 0 skills2     (the arcade site)
// (window.__shot = 1 stops on the first challenge's first card, 2 on its result with the initials box, 3 once it's saved)
// (it posts to the leaderboard: the dev server only)
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms)), $ = (id) => document.getElementById(id);
  for (let i = 0; i < 50 && !window.__golf; i++) await sleep(200);
  localStorage.clear(); window.confirm = () => true; const g = window.__golf, out = [], YD = 0.9144, FT = 0.3048;
  const key = (c) => window.dispatchEvent(new KeyboardEvent('keydown', { code: c, key: c, bubbles: true }));
  const say = (ok, t) => out.push(`${(ok ? 'ok' : 'FAIL').padEnd(5)} ${t}`);
  const st = () => `${g.state.power}/${g.state.dex}/${g.state.composure}/${g.state.perception}`;
  const sk = g.sk, SETS = g.SK_SETS;
  const next = async () => { clearTimeout(sk.timer); g.skNext(); await sleep(60); };      // (a made shot moves on by itself in 2.6 s)
  if (!document.body.classList.contains('home-on')) { g.openHome(); await sleep(300); }
  if ($('hmGuest')) { $('hmGuest').click(); await sleep(200); }
  await sleep(600);
  const btn = (k) => $('hmSkRow').querySelector(`button[data-sk="${k}"]`);
  const tile = () => Object.keys(SETS).map((k) => `${btn(k).querySelector('b').textContent} (${btn(k).querySelector('i').textContent}): ${btn(k).querySelector('em').textContent}`).join(' · ');
  say(Object.keys(SETS).every((k) => btn(k) && btn(k).querySelector('em').textContent === 'Not played yet')
    && SETS.range.shots.length === 10 && SETS.chip.shots.length === 10 && SETS.putt.shots.length === 10 && SETS.full.shots.length === 15, `home tile: ${tile()}`);
  // the server's boards: a card that isn't the challenge's length, a shot with no attempt, a total that doesn't add up,
  // or a challenge that doesn't exist, is refused; every board at once comes back for the tile
  const post = (b) => fetch('/api/leaderboard', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'skills', name: 'ZZZ', ...b }) }).then((r) => r.status);
  const ones = (n) => Array(n).fill(1);
  say(await post({ set: 'range', tries: ones(9) }) === 400 && await post({ set: 'full', tries: ones(10) }) === 400 && await post({ set: 'chip', tries: [0, ...ones(9)] }) === 400
    && await post({ set: 'putt', tries: ones(10), total: 11 }) === 400 && await post({ set: 'nope', tries: ones(10) }) === 400,
    'the server refuses: 9 shots for the range, 10 for the full test, a shot with no attempt, a total that doesn\'t add up, a made-up challenge');
  const all = await fetch('/api/leaderboard?kind=skills&set=all').then((r) => r.json());
  say(all.boards && Object.keys(SETS).every((k) => all.boards[k] && Array.isArray(all.boards[k].top)), `GET set=all: boards ${Object.keys(all.boards || {}).join(', ')}`);

  // each shot: a miss (or more) and the shot that makes it, with what it would report
  const pos = (i, dx = 0) => ({ x: g.PINS[i].pos.x + dx, z: g.PINS[i].pos.z });
  const R = (p, axis = 0, carry = 150, offline = 0) => ({ p, axis, carry, offline, apex: 30 });
  const C = (leftFt, axis = 0, surf = 'green', holed = false) => ({ holed, leftFt, axis, surf });
  const P = (leftFt, longFt = leftFt, holed = false) => ({ holed, leftFt: holed ? 0 : leftFt, longFt: holed ? 0 : longFt });
  const PLAYS = {
    green: { miss: [R(pos(2, 30))], hit: R(pos(2)) },
    g175: { miss: [R(pos(1))], hit: R(pos(2, 5)) },
    w100: { miss: [R(pos(0, 7 * YD))], hit: R(pos(0, 4 * YD)) },
    fade: { miss: [R(pos(1), 1)], hit: R(pos(1), 6) },
    draw: { miss: [R(pos(1), 6)], hit: R(pos(0), -6) },
    low: { miss: [R(pos(1))], pre: () => g.setHeight(-1), hit: R(pos(3)) },
    high: { miss: [R(pos(1))], pre: () => g.setHeight(1), hit: R(pos(1)) },
    carry: { miss: [R(pos(1), 0, 146)], hit: R(pos(1), 0, 137) },
    g225: { miss: [R(pos(2))], hit: R(pos(3)) },
    send: { miss: [R(pos(4), 0, 200), R(pos(4), 9, 330, 31)], hit: R(pos(4), 0, 330, 8) },
    fade175: { miss: [R(pos(1), 6), R(pos(2), 0)], hit: R(pos(2), 6) },
    draw150: { miss: [R(pos(1, 9 * YD), -6), R(pos(1), 2)], hit: R(pos(1, 5 * YD), -6) },
    knock: { miss: [R(pos(1))], pre: () => g.setHeight(-1), hit: R(pos(1)) },
    w100t: { miss: [R(pos(0, 5 * YD))], hit: R(pos(0, 3 * YD)) },
    send2: { miss: [R(pos(4), 0, 330, 17)], hit: R(pos(4), 0, 330, 8) },
    chip: { miss: [C(4.5)], hit: C(2.6) },
    bump: { miss: [C(3.4)], hit: C(1.8) },
    soft: { miss: [C(5)], wrongType: 'stock', hit: C(2) },
    flop: { miss: [C(5)], wrongType: 'stock', hit: C(0, 0, 'green', true) },
    rough: { miss: [C(5)], hit: C(3.5) },
    sand: { miss: [C(7)], hit: C(5) },
    pitch: { miss: [C(6)], hit: C(4) },
    cut: { miss: [C(1.5, 0), C(2, -9), C(7, 12, 'bunker')], hit: C(2.2, 11) },
    hook: { miss: [C(1.5, 0), C(2, 9), C(7, -12, 'bunker')], hit: C(2.2, -11) },
    stiff: { miss: [C(2)], hit: C(1.2) },
    sand2: { miss: [C(5)], hit: C(3) },
    rough2: { miss: [C(5)], hit: C(3) },
    p5: { miss: [P(0.8)], hit: P(0, 0, true) },
    up: { miss: [P(2, -2)], hit: P(0, 0, true) },
    brk: { miss: [P(2)], hit: P(0, 0, true) },
    slider: { miss: [P(1.5)], hit: P(0, 0, true) },
    past: { miss: [P(1, -1), P(2.5, 2.5)], hit: P(1.5, 1.4) },
    crown: { miss: [P(4, -4)], hit: P(2.5) },
    tierUp: { miss: [P(4)], hit: P(2) },
    tierDn: { miss: [P(4)], hit: P(2) },
    swale: { miss: [P(4)], hit: P(2) },
    lag: { miss: [P(5)], hit: P(3.5) },
    slider2: { miss: [P(1)], hit: P(0, 0, true) },
    past2: { miss: [P(1, -1), P(1.8, 1.8)], hit: P(1.2, 1.0) },
    crown2: { miss: [P(2.5)], hit: P(1.5) },
    tiers2: { miss: [P(4)], hit: P(2.5) },
    lag2: { miss: [P(4)], hit: P(2.5) },
  };
  const missingPlays = Object.values(SETS).flatMap((S) => S.ids).filter((id) => !PLAYS[id]);
  say(!missingPlays.length, `every shot has a test play${missingPlays.length ? ` (missing: ${missingPlays.join(', ')})` : ''}`);
  // which side of the ball-to-hole line the chipping green's sand is (+ right)
  const sandSide = () => {
    const gr = g.green, h = gr.hole, hl = Math.hypot(h.x, h.z);
    let s = 0, n = 0;
    for (let x = h.x - 15; x <= h.x + 15; x += 0.5) for (let z = h.z - 15; z <= h.z + 15; z += 0.5) if (gr.surfAt(x, z) === 'bunker' && Math.hypot(x, z) > 4) { s += (-h.z * x + h.x * z) / hl; n++; }
    return n ? s / n : 0;
  };
  // the height of the putting green along the line, ball to hole (inches above the ball)
  const lineH = () => { const gr = g.green, h = gr.hole, a = []; for (let k = 0; k <= 20; k++) a.push((gr.h(h.x * k / 20, h.z * k / 20) - gr.h(0, 0)) / 0.0254); return a; };

  const cfg0 = JSON.stringify(g.state.greenCfg), chip0 = JSON.stringify(g.state.chipCfg);
  let firstSet = true;
  for (const set of ['range', 'chip', 'putt', 'full']) {
    const S = SETS[set], N = S.shots.length;
    if (!document.body.classList.contains('home-on')) { g.openHome(); await sleep(300); }
    btn(set).click(); await sleep(500);
    say(sk.on && sk.set === set && !document.body.classList.contains('home-on') && st() === '8/8/8/8' && g.CLUBS[0].model === 'd-g440k' && g.state.windMph === 0 && $('skTitle').textContent.includes(S.name),
      `${S.name}: started on the ${g.state.mode}, stats ${st()}, driver ${g.CLUBS[0].model}, card "${$('skTitle').textContent}" · "${$('skName').textContent}" · "${$('skGoal').textContent}" · ${$('skProg').textContent}`);
    if (firstSet) {
      say(getComputedStyle($('skCard')).display === 'block' && getComputedStyle($('windDial')).display === 'none' && getComputedStyle($('panel')).display === 'none', 'the card is showing; the wind dial and the area panel are put away');
      if (window.__shot === 1) return out.join('\n');
      g.setMode('putt'); key('KeyH'); await sleep(200);
      say(g.state.mode === 'range' && !g.hp.on, `G / H while it's on: still ${g.state.mode}, on a hole ${g.hp.on} · "${$('toast').textContent.replace(/\n/g, ' / ')}"`);
    }
    // one real swing on this challenge's first area: counted as it's hit, judged when it stops
    const area0 = S.shots[0].area;
    if (set !== 'full') {
      if (area0 === 'range') g.setClub(10);
      g.debugSwing({ back: area0 === 'range' ? 1 : area0 === 'chip' ? 0.2 : 0.3, tempo: 1 });
      await sleep(300);
      const hitNow = sk.tries[0];
      for (let i = 0; i < 80 && !(area0 === 'putt' ? g.puttRun && g.puttRun.done : g.shot && g.shot.done); i++) await sleep(250);
      say(hitNow === 1 && !!$('skMsg').textContent && (area0 !== 'range' || g.trailCount >= 1), `a real ${area0 === 'range' ? 'swing' : area0}: attempts ${hitNow} as it left, then "${$('skMsg').textContent}"${area0 === 'range' ? ` · tracers ${g.trailCount}` : ''}`);
      if (sk.ok) await next(); else { key('KeyR'); await sleep(200); }
      if (sk.i === 1 && area0 === 'range') say(g.trailCount === 0, `made: on to shot 2, the tracers cleared (${g.trailCount} left)`);
    }
    for (let i = sk.i; i < N; i++) {
      const T = g.SKILLS[i], PL = PLAYS[T.id], area = g.state.mode, notes = [];
      if (!PL) { say(false, `${T.id}: no test play`); break; }
      let setupOk = area === T.area;
      if (T.id === 'cut' || T.id === 'hook') { const sd = sandSide(); setupOk = setupOk && (T.id === 'cut' ? sd > 0 : sd < 0); notes.push(`sand ${sd > 0 ? 'right' : 'left'} of the line (${(sd / YD).toFixed(1)} yds), tuck ${g.state.chipCfg.tuck}`); }
      // (user, 2026-11-21: no chip may set you up for failure: the landing the game suggests for the shot it sets up is
      // on the green, not the fringe, so the shot asked for can actually get there)
      if (T.area === 'chip') {
        const gr = g.green, h = gr.hole, hl = Math.hypot(h.x, h.z);
        let edge = 0; while (edge < hl && gr.surfAt(h.x * edge / hl, h.z * edge / hl) !== 'green') edge += 0.05;
        const on = g.state.markDist - edge;
        setupOk = setupOk && on >= 1;
        notes.push(`suggested landing ${on.toFixed(1)} m onto the green (${g.state.chipType}, the hole ${(hl - edge).toFixed(1)} m on)`);
      }
      if (/^(sand|rough)/.test(T.id)) { setupOk = setupOk && g.state.lie === (T.id.startsWith('sand') ? 'bunker' : 'light'); notes.push(`lie ${g.state.lie}, ${g.CLUBS[g.state.club].name}`); }
      if (/crown/.test(T.id)) { const a = lineH(), top = Math.max(...a); setupOk = setupOk && !!g.state.greenCfg.shape && top > a[0] + 1.5 && top > a[20] + 1.5; notes.push(`the crown ${top.toFixed(1)} in above the ball, the hole ${a[20].toFixed(1)}`); }
      if (/tier/.test(T.id)) { const a = lineH(); setupOk = setupOk && (T.id === 'tierDn' ? a[20] < -2 : a[20] > 2); notes.push(`the hole ${a[20].toFixed(1)} in from the ball`); }
      for (const m of PL.miss) { g.skAttempt(); g.skShotDone(m); notes.push(`miss "${$('skMsg').textContent}"`); if (sk.ok) return out.concat(`FAIL a miss was counted as made on ${T.name} (${T.id})`).join('\n'); }
      if (PL.wrongType) { const keep = g.state.chipType; g.applyChipType(PL.wrongType, true); g.skAttempt(); g.skShotDone(PL.hit); notes.push(`wrong shot type "${$('skMsg').textContent}"`); if (sk.ok) return out.concat(`FAIL the wrong shot type made ${T.id}`).join('\n'); g.applyChipType(keep, true); }
      if (PL.pre) PL.pre();
      g.skAttempt(); g.skShotDone(PL.hit);
      const made = sk.ok, msg = $('skMsg').textContent;
      say(setupOk && made, `${String(i + 1).padStart(2)} ${T.name} [${T.id}, ${area}${T.area === 'chip' ? `, ${g.state.chipType}, ${g.state.chipCfg.pinYd} yds` : T.area === 'putt' ? `, ${g.state.greenCfg.distFt} ft${g.state.greenCfg.shape ? ', built' : ''}` : ''}] "${$('skGoal').textContent}" · ${notes.join(' · ')} · then "${msg}"`);
      if (firstSet && i === 1) {
        const had = sk.tries[i];
        g.debugSwing({ back: 1, tempo: 1 }); await sleep(150);
        say(sk.tries[i] === had && !g.swing.active, `a swing while the next shot is coming isn't taken (attempts on it still ${sk.tries[i]})`);
      }
      await next();
    }
    const total = sk.tries.reduce((a, b) => a + b, 0);
    say(sk.doneOpen && $('skDone').classList.contains('on') && +$('skDoneTot').textContent === total && $('skDoneRows').rows.length - 1 === N && $('skDoneH').textContent.includes(S.name),
      `${S.name} done: "${$('skDoneH').textContent}" ${$('skDoneTot').textContent} attempts (${sk.tries.join(',')}) · "${$('skDoneTag').textContent}" · "${$('skDoneBest').textContent}" · ${$('skDoneRows').rows.length - 1} rows`);
    await sleep(600);
    if (firstSet) {
      say($('skEntry').classList.contains('on') && document.activeElement === $('skInit'), `the world Top 10: the initials box is up and focused ("${$('skInit').value}") · "${$('skNote').textContent}"`);
      if (window.__shot === 2) return out.join('\n');
    }
    // save it (every challenge has its own board): the row is highlighted, on this challenge's board only
    $('skInit').value = 'TST'; key('Enter'); await sleep(1200);
    const row = [...$('skBoard').rows].find((r) => r.classList.contains('mine'));
    say(g.skLb.saved && !!row && row.cells[1].textContent === 'TST' && +row.cells[2].textContent === total && !$('skEntry').classList.contains('on'),
      `saved to the ${set} board: "${$('skNote').textContent}" · my row ${row ? `${row.cells[0].textContent}. ${row.cells[1].textContent} ${row.cells[2].textContent}` : 'missing'}`);
    if (firstSet && window.__shot === 3) return out.join('\n');
    if (firstSet) {
      // Enter again plays the same challenge again
      key('Enter'); await sleep(500);
      say(sk.on && sk.set === set && !sk.doneOpen && sk.i === 0 && sk.tries.every((n) => n === 0), `Enter: the ${set} challenge again, shot ${sk.i + 1}, attempts ${sk.tries.reduce((a, b) => a + b, 0)}`);
    }
    key('Escape'); await sleep(500);
    firstSet = false;
  }
  // the tile: each challenge's best, and the world's
  if (!document.body.classList.contains('home-on')) { g.openHome(); await sleep(300); }
  await sleep(800);
  say(Object.keys(SETS).every((k) => /^Your best: \d+$/.test(btn(k).querySelector('em').textContent) && /World best: \d+ · \w+/.test(btn(k).textContent)), `the home tile: ${tile()}`);
  // a real chip and a real putt, in the full test (each area's own counts too)
  btn('full').click(); await sleep(500);
  for (let i = 0; i < 5; i++) { g.skAttempt(); g.skShotDone(PLAYS[g.SKILLS[i].id].pre ? (PLAYS[g.SKILLS[i].id].pre(), PLAYS[g.SKILLS[i].id].hit) : PLAYS[g.SKILLS[i].id].hit); await next(); }
  say(g.state.mode === 'chip' && sk.i === 5 && g.state.lie === 'bunker', `five range shots made: on the chipping green, in the bunker for "${$('skName').textContent}" (${g.CLUBS[g.state.club].name})`);
  g.debugSwing({ back: 0.35, tempo: 1 }); await sleep(300);
  for (let i = 0; i < 80 && !(g.shot && g.shot.done); i++) await sleep(250);
  say(sk.tries[5] === 1 && !!$('skMsg').textContent, `a real bunker shot: attempts ${sk.tries[5]} · "${$('skMsg').textContent}"`);
  if (!sk.ok) { key('KeyR'); await sleep(200); g.skAttempt(); g.skShotDone(PLAYS.sand2.hit); }
  await next();
  for (let i = 6; i < 10; i++) { g.skAttempt(); g.skShotDone(PLAYS[g.SKILLS[i].id].hit); await next(); }
  say(g.state.mode === 'putt' && sk.i === 10 && g.state.greenCfg.shape, `ten made: on a built putting green, ${g.state.greenCfg.distFt} ft`);
  g.debugSwing({ back: 0.3, tempo: 1 }); await sleep(300);
  for (let i = 0; i < 80 && !(g.puttRun && g.puttRun.done); i++) await sleep(250);
  say(sk.tries[10] === 1 && !!$('skMsg').textContent, `a real putt: attempts ${sk.tries[10]} · "${$('skMsg').textContent}"`);
  // leave part-way: nothing kept, the range's own game back (the practice green and chipping green as they were)
  key('Escape'); await sleep(500);
  say(!sk.on && document.body.classList.contains('home-on') && JSON.stringify(g.state.greenCfg) === cfg0 && JSON.stringify(g.state.chipCfg) === chip0 && g.state.lie === 'fairway' && g.state.mode === 'range' && !document.body.classList.contains('skills'),
    `Esc part-way: challenge on ${sk.on}, home open, mode ${g.state.mode}, lie ${g.state.lie}, the practice greens as they were ${JSON.stringify(g.state.greenCfg) === cfg0 && JSON.stringify(g.state.chipCfg) === chip0}`);
  key('Escape'); await sleep(300);
  say(st() === '8/8/8/8' && g.CLUBS[0].model === 'd-g440k' && getComputedStyle($('panel')).display !== 'none', `back on the range: stats ${st()}, driver ${g.CLUBS[0].model}, the area panel is back`);
  return out.join('\n');
})()
