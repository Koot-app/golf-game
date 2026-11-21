// SKILLS CHALLENGE (user request, 2026-11-21): twelve shots to make, scored by the attempts they take. Checks: the home
// screen's tile starts it on the arcade's bag and stats; each shot's rule (a miss says why, the right shot makes it);
// the challenge moves between the range, the chipping green and the putting green by itself and nothing else can;
// real swings on each area are counted and judged; the result, the best score, playing again, and leaving part-way.
// Works on both sites:
//   node tools/test/probe.js http://127.0.0.1:8090/ <shot|-> @tools/test/skills.js 0 skills1
//   node tools/test/probe.js http://127.0.0.1:8091/ <shot|-> @tools/test/skills.js 0 skills2     (the arcade site)
// (window.__shot = 1 stops on the first shot's card, 2 on the result, for a screenshot)
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms)), $ = (id) => document.getElementById(id);
  for (let i = 0; i < 50 && !window.__golf; i++) await sleep(200);
  localStorage.clear(); window.confirm = () => true; const g = window.__golf, out = [];
  const key = (c) => window.dispatchEvent(new KeyboardEvent('keydown', { code: c, key: c, bubbles: true }));
  const say = (ok, t) => out.push(`${(ok ? 'ok' : 'FAIL').padEnd(5)} ${t}`);
  const st = () => `${g.state.power}/${g.state.dex}/${g.state.composure}/${g.state.perception}`;
  const sk = g.sk, N = g.SKILLS.length;
  if (!document.body.classList.contains('home-on')) { g.openHome(); await sleep(300); }
  if ($('hmGuest')) { $('hmGuest').click(); await sleep(200); }
  say($('hmSkillsBest').textContent === 'Not played yet', `home tile: "${$('hmSkills').querySelector('b').textContent}" · "${$('hmSkillsBest').textContent}"`);
  const cfg0 = JSON.stringify(g.state.greenCfg);
  $('hmSkills').click(); await sleep(500);
  say(sk.on && !document.body.classList.contains('home-on') && g.state.mode === 'range' && st() === '8/8/8/8' && g.CLUBS[0].model === 'd-g440k',
    `started: on ${sk.on}, mode ${g.state.mode}, stats ${st()}, driver ${g.CLUBS[0].model}, wind ${g.state.windMph}, card "${$('skName').textContent}" · "${$('skGoal').textContent}" · ${$('skProg').textContent}`);
  say(getComputedStyle($('skCard')).display === 'block' && getComputedStyle($('windDial')).display === 'none' && getComputedStyle($('panel')).display === 'none', 'the card is showing; the wind dial and the area panel are put away');
  if (window.__shot === 1) return out.join('\n');
  // nothing else moves you while it's on
  g.setMode('putt'); key('KeyH'); await sleep(200);
  say(g.state.mode === 'range' && !g.hp.on, `G / H while it's on: still ${g.state.mode}, on a hole ${g.hp.on} · "${$('toast').textContent.replace(/\n/g, ' / ')}"`);
  // a real swing on the range: counted when it's hit, judged when it stops
  g.setClub(10); g.debugSwing({ back: 1, tempo: 1 });
  await sleep(300);
  const hitNow = sk.tries[0];
  for (let i = 0; i < 80 && !(g.shot && g.shot.done); i++) await sleep(250);
  say(hitNow === 1 && !!$('skMsg').textContent, `a real swing (PW at the 150): attempts ${hitNow} as it left, then "${$('skMsg').textContent}"`);
  if (sk.ok) await sleep(2800); else { key('KeyR'); await sleep(200); }
  // each shot's rule, with the result it would report (a miss first where there's a rule to miss)
  const pos = (i, dx = 0) => ({ x: g.PINS[i].pos.x + dx, z: g.PINS[i].pos.z });
  const plays = [
    { miss: { p: pos(2, 30), axis: 0, carry: 170, offline: 30 }, hit: { p: pos(2), axis: 0, carry: 172, offline: 0 } },
    { miss: { p: pos(2), axis: 0, carry: 172, offline: 0 }, hit: { p: pos(1, 5), axis: 0, carry: 150, offline: 3 } },
    { miss: { p: pos(1), axis: 1, carry: 150, offline: 0 }, hit: { p: pos(1), axis: 6, carry: 150, offline: 0 } },
    { miss: { p: pos(1), axis: 6, carry: 150, offline: 0 }, hit: { p: pos(0), axis: -6, carry: 100, offline: 0 } },
    { miss: { p: pos(1), axis: 0, carry: 150, offline: 0 }, pre: () => g.setHeight(-1), hit: { p: pos(3), axis: 0, carry: 220, offline: 0 } },
    { miss: { p: pos(4), axis: 0, carry: 240, offline: 0 }, hit: { p: pos(4), axis: 0, carry: 285, offline: 8 }, miss2: { p: pos(4), axis: 9, carry: 285, offline: 31 } },
    { miss: { holed: false, leftFt: 9 }, hit: { holed: false, leftFt: 4.5 } },
    { miss: { holed: false, leftFt: 1.2 }, hit: { holed: true, leftFt: 0 } },
    { miss: { holed: false, leftFt: 3 }, hit: { holed: true, leftFt: 0 }, wrongType: 'stock' },
    { miss: { holed: false, leftFt: 0.8 }, hit: { holed: true, leftFt: 0 } },
    { miss: { holed: false, leftFt: 2 }, hit: { holed: true, leftFt: 0 } },
    { miss: { holed: false, leftFt: 7 }, hit: { holed: false, leftFt: 2.4 } },
  ];
  const first = sk.i;
  for (let i = first; i < N; i++) {
    const T = g.SKILLS[i], P = plays[i], area = g.state.mode;
    const setupOk = area === T.area && (T.area !== 'chip' || g.state.chipType === ({ 6: 'low', 7: 'stock', 8: 'flop' })[i]);
    const notes = [];
    for (const m of [P.miss, P.miss2].filter(Boolean)) { g.skAttempt(); g.skShotDone(m); notes.push(`miss "${$('skMsg').textContent}"${sk.ok ? ' (WRONGLY MADE)' : ''}`); if (sk.ok) return out.concat('FAIL a miss was counted as made on ' + T.name).join('\n'); }
    if (P.wrongType) { const keep = g.state.chipType; g.applyChipType(P.wrongType, true); g.skAttempt(); g.skShotDone(P.hit); notes.push(`wrong shot type "${$('skMsg').textContent}"`); g.applyChipType(keep, true); }
    if (P.pre) P.pre();
    g.skAttempt(); g.skShotDone(P.hit);
    const made = sk.ok, msg = $('skMsg').textContent;
    say(setupOk && made, `${String(i + 1).padStart(2)} ${T.name} [${area}${T.area === 'chip' ? ', ' + g.state.chipType + ', ' + g.state.chipCfg.pinYd + ' yds' : T.area === 'putt' ? ', ' + g.state.greenCfg.distFt + ' ft' : ''}] "${$('skGoal').textContent}" · ${notes.join(' · ')} · then "${msg}"`);
    const had = sk.tries[i];
    g.debugSwing({ back: 1, tempo: 1 }); await sleep(150);       // made: no swing until the next shot is up
    if (i === first) say(sk.tries[i] === had && !g.swing.active, `a swing while the next shot is coming isn't taken (attempts on it still ${sk.tries[i]})`);
    await sleep(2800);
  }
  const total = sk.tries.reduce((a, b) => a + b, 0);
  say(sk.doneOpen && $('skDone').classList.contains('on') && +$('skDoneTot').textContent === total, `the result: ${$('skDoneTot').textContent} attempts (${sk.tries.join(',')}) · "${$('skDoneTag').textContent}" · "${$('skDoneBest').textContent}" · ${$('skDoneRows').rows.length - 1} rows`);
  if (window.__shot === 2) return out.join('\n');
  // Enter plays it again; a real chip and a real putt are counted and judged too
  key('Enter'); await sleep(500);
  say(sk.on && !sk.doneOpen && sk.i === 0 && sk.tries.every((n) => n === 0), `Enter: a new challenge, shot ${sk.i + 1}, attempts ${sk.tries.reduce((a, b) => a + b, 0)}`);
  for (let i = 0; i < 6; i++) { if (i === 4) g.setHeight(-1); g.skAttempt(); g.skShotDone(plays[i].hit); await sleep(2800); }
  say(g.state.mode === 'chip' && sk.i === 6, `six made: on the chipping green for "${$('skName').textContent}"`);
  g.debugSwing({ back: 0.45, tempo: 1 }); await sleep(300);
  for (let i = 0; i < 80 && !(g.shot && g.shot.done); i++) await sleep(250);
  say(sk.tries[6] === 1 && !!$('skMsg').textContent, `a real chip: attempts ${sk.tries[6]} · "${$('skMsg').textContent}"`);
  if (sk.ok) await sleep(2800); else { key('KeyR'); await sleep(200); g.skAttempt(); g.skShotDone(plays[6].hit); await sleep(2800); }
  for (let i = 7; i < 9; i++) { g.skAttempt(); g.skShotDone(plays[i].hit); await sleep(2800); }
  say(g.state.mode === 'putt' && sk.i === 9 && g.state.greenCfg.distFt === 6, `three chips made: on the putting green, ${g.state.greenCfg.distFt} ft`);
  g.debugSwing({ back: 0.3, tempo: 1 }); await sleep(300);
  for (let i = 0; i < 80 && !(g.puttRun && g.puttRun.done); i++) await sleep(250);
  say(sk.tries[9] === 1 && !!$('skMsg').textContent, `a real putt: attempts ${sk.tries[9]} · "${$('skMsg').textContent}"`);
  // leave part-way: nothing kept, the range's own game back
  key('Escape'); await sleep(500);
  say(!sk.on && document.body.classList.contains('home-on') && JSON.stringify(g.state.greenCfg) === cfg0 && g.state.mode === 'range' && !document.body.classList.contains('skills'),
    `Esc part-way: challenge on ${sk.on}, home open, mode ${g.state.mode}, the practice green as it was ${JSON.stringify(g.state.greenCfg) === cfg0} · tile "${$('hmSkillsBest').textContent}"`);
  say($('hmSkillsBest').textContent === `Your best: ${total}`, `the best is kept: "${$('hmSkillsBest').textContent}"`);
  key('Escape'); await sleep(300);
  say(st() === '8/8/8/8' && g.CLUBS[0].model === 'd-g440k' && getComputedStyle($('panel')).display !== 'none', `back on the range: stats ${st()}, driver ${g.CLUBS[0].model}, the area panel is back`);
  return out.join('\n');
})()
