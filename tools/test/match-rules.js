// Audit section 4: the rules of a match, case by case, through the game's own flow (finishHole, the scorecard, Press).
//   node tools/test/probe.js http://127.0.0.1:8090/ - @tools/test/match-rules.js 0 audit-rules
// Each line: the case, what the game did, and "ok" or "FINDING 4.x".
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms)), $ = (id) => document.getElementById(id);
  for (let i = 0; i < 50 && !window.__golf; i++) await sleep(200);
  localStorage.clear(); window.confirm = () => true; const g = window.__golf, out = [];
  const say = (v, t) => out.push(`${v.padEnd(12)} ${t}`);
  const key = (c) => window.dispatchEvent(new KeyboardEvent('keydown', { code: c, key: c, bubbles: true }));
  $('hmGuest').click(); await sleep(150); document.querySelector('[data-h=career]').click(); await sleep(200);
  $('chName').value = 'TESTER'; $('chCreate').click(); await sleep(300);
  async function tee(format, stake, who = 3) {            // (Gus: presses whenever he may)
    if (!$('clubhouse').classList.contains('on')) key('KeyJ');
    await sleep(150); document.querySelector('[data-go=match]').click(); await sleep(200);
    document.querySelector(`.cm-npc[data-i="${who}"]`).click(); await sleep(100);
    document.querySelector(`#cmFmt [data-fmt=${format}]`).click(); await sleep(60);
    const st = $('cmStake'); st.value = stake; st.dispatchEvent(new Event('input', { bubbles: true })); await sleep(60);
    $('cmGo').click(); await sleep(400); $('riStart').click();
    const m = g.career.match;
    for (let k = 0; k < 40 && !g.tossOpen; k++) await sleep(50);
    m.toss = 'me'; g.closeToss(); await sleep(150);
    return m;
  }
  // play hole i with a result for me: +1 win it, 0 halve, −1 lose it (his score is the seeded one)
  const play = async (m, i, res) => { g.npc.done = true; g.hp.strokes = Math.max(1, g.npcHoleScore(m, i) - res); g.hp.putts = 1; g.finishHole(); await sleep(40); };
  const next = async () => { g.scorecardNext(); await sleep(120); };
  const leave = async () => { await sleep(700); if ($('beating').classList.contains('on')) { await sleep(1200); $('btGo').click(); await sleep(400); } if ($('outcome').classList.contains('on')) $('ocCard_home').click(); else $('scClose').click(); await sleep(300); };
  const strip = () => [...document.querySelectorAll('#scBets .sb-grid > div')].map((d) => [...d.children].map((c) => c.textContent.trim()).join(' '));
  const reset = () => { g.career.cash = 100000; g.careerSave(); };

  // ---- 1. dormie: 2 down with 2 to play. The best you can do is halve.
  reset(); let m = await tee('match', 20, 1);              // (Terry never presses)
  for (let i = 0; i < 7; i++) { await play(m, i, i < 2 ? -1 : 0); if (i < 6) await next(); }
  let s = strip(), best = s.find((x) => /^Best case/.test(x)) || '';
  say(/^Best case \$0/.test(best) ? 'ok' : 'FINDING 4.2', `2 down with 2 to play (the best possible is a halved match, $0): the card says "${best}"`);
  say(!m.settled ? 'ok' : 'FINDING', `… and the match is still live: settled ${m.settled}, tag "${$('scTag').textContent}"`);
  await next(); await play(m, 7, 1); await next(); await play(m, 8, 1);
  say(m.settled && m.net === 0 && /halved the match/.test(m.result) ? 'ok' : 'FINDING', `win the last two: "${m.result}", net ${m.net}`);
  await leave();

  // ---- 2. dormie up: 1 up with 1 to play. The worst you can do is halve.
  reset(); m = await tee('match', 20, 1);
  for (let i = 0; i < 8; i++) { await play(m, i, i === 0 ? 1 : 0); if (i < 7) await next(); }
  s = strip(); const worst = s.find((x) => /^Worst case/.test(x)) || '';
  say(/^Worst case \$0/.test(worst) ? 'ok' : 'FINDING 4.2', `1 up with 1 to play (the worst possible is a halved match, $0): the card says "${worst}"`);
  await next(); await play(m, 8, 1);
  say(m.settled && m.net === 20 && /won 2 up/.test(m.result) ? 'ok' : 'FINDING', `win the last: "${m.result}", net ${m.net}`);
  await leave();

  // ---- 3. decided early, then played on: nothing more is paid; the result stands
  reset(); m = await tee('match', 20, 1);
  const c0 = g.career.cash;
  for (let i = 0; i < 9; i++) { await play(m, i, i < 5 ? 1 : -1); if (i < 8) await next(); }
  say(m.net === 20 && /won 5 & 4/.test(m.result) && g.career.cash === c0 + 20 ? 'ok' : 'FINDING', `win the first five, lose the last four (played on): "${m.result}", cash ${g.career.cash - c0 >= 0 ? '+' : ''}${g.career.cash - c0}`);
  await leave();

  // ---- 4. presses: offered only when 2 down in the newest bet, three at most, and the match runs until every bet is decided
  reset(); m = await tee('match', 20, 1);
  const offered = [];
  for (let i = 0; i < 9 && !m.settled; i++) {
    await play(m, i, -1);
    const on = $('scPressBox').classList.contains('on') && !$('scPressBox').classList.contains('his');
    if (on) { offered.push(i + 1); $('scPress').click(); await sleep(40); }
    if (!m.settled && i < 8) await next();
  }
  say(offered.join(',') === '2,4,6' && m.presses.length === 3 ? 'ok' : 'FINDING', `lose every hole, press whenever offered: offered after holes ${offered.join(', ')}; ${m.presses.length} presses`);
  say(m.settled && m.holes.length === 8 && m.net === -80 ? 'ok' : 'FINDING', `settled after hole ${m.holes.length} (every bet decided): "${m.result}", net ${m.net}`);
  await leave();

  // ---- 5. his press: Gus (always presses) 2 down → a new bet; you can't press it (all square)
  reset(); m = await tee('match', 20, 3);
  await play(m, 0, 1); await next(); await play(m, 1, 1);
  const his = m.presses.filter((p) => p.by === 'npc').length, box = $('scPressBox');
  say(his === 1 && m.presses[0].from === 2 && box.classList.contains('on') && box.classList.contains('his') ? 'ok' : 'FINDING', `win the first two against Gus: he presses (${his}), from hole ${m.presses[0] && m.presses[0].from + 1}; the box is his notice, not an offer`);
  for (let i = 2; i < 9 && !m.settled; i++) { await next(); await play(m, i, 1); }
  say(m.presses.length === 3 && m.settled ? 'ok' : 'FINDING', `keep winning: ${m.presses.length} presses in all (the limit is 3), "${m.result}", net ${m.net}`);
  await leave();

  // ---- 6. skins: carries, and a tie on the last hole
  reset(); m = await tee('skins', 10, 1);
  const res6 = [0, 0, 0, 1, -1, 0, 0, 0, 0];
  for (let i = 0; i < 9; i++) { await play(m, i, res6[i]); if (i < 8) await next(); }
  say(m.settled && m.net === 30 ? 'ok' : 'FINDING', `halve 1–3, win 4 (4 skins), lose 5 (1 skin), halve 6–9 (the last four skins are void): net ${m.net} (want +30), "${m.result}"`);
  await leave();

  // ---- 7. lost, with nothing to pay it with
  reset(); m = await tee('match', 20, 1); g.career.cash = 0;
  for (let i = 0; i < 9 && !m.settled; i++) { await play(m, i, -1); if (!m.settled) await next(); }
  await sleep(300);
  const tag = $('scTag').textContent, card = g.career.cards[g.career.cards.length - 1];
  say(/^lost .*couldn't pay/.test(tag) ? 'ok' : 'FINDING 4.4', `lose with $0 (he takes it out of your hide): the card's heading says "${tag}"; the archived card's money is ${card.net}, unpaid ${card.unpaid}`);
  await leave();
  key('KeyJ'); await sleep(200); document.querySelector('[data-go=trophy]').click(); await sleep(300);
  document.querySelector('#trTabs [data-trtab=cards]').click(); await sleep(300);
  say('note', `Scorecards tab summary: ${[...document.querySelectorAll('#trList .tr-sum > div')].map((d) => d.innerText.replace(/\s+/g, ' ')).join(' | ')}`);
  key('Escape'); await sleep(200);

  // (8. the handicap tooltip with three rounds, "best 4 of the last 3": see regress-handicap.js's last line)

  // ---- 9. holing out while he is in the middle of a stroke
  reset(); m = await tee('match', 20, 1);
  for (let i = 0; i < 1; i++) { await play(m, 0, 1); await next(); }       // win hole 1 → … he doesn't have the honour; lose it instead:
  await play(m, 1, -1); g.scorecardNext(); await sleep(60);                // he wins hole 2: his honour on hole 3
  const held = g.npc.starting || g.npcTurn;                                // (the 0.9 s before his tee shot: your swing waits)
  await sleep(1240);                                                        // he is teeing off now
  let err = '';
  const wasBusy = g.npc.busy, holes0 = m.holes.length;
  if (wasBusy) { g.hp.strokes = 1; try { g.finishHole(); } catch (e) { err = e.message; } }
  for (let k = 0; k < 60 && m.holes.length === holes0; k++) { g.npcHurry(); await sleep(250); }      // he plays out (hurried), then the card
  say(!wasBusy ? 'skipped' : !err && m.holes.length === holes0 + 1 && g.npc.done ? 'ok' : 'FINDING 4.6', `finish the hole while he is mid-stroke (busy ${wasBusy}) -> ${err || 'no error'}; he played out (${g.npc.done}) and the hole was recorded (${m.holes.length === holes0 + 1})`);
  say(held ? 'ok' : 'FINDING 4.6', `the moment a hole starts with his honour (hole 3): your swing is held (${held})`);
  return out.join('\n');
})()
