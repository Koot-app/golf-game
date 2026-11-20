// Fixes 7.1 (the marker: what you couldn't pay is owed, and comes out of your next winnings) and 7.2 (an invitational
// is held every TOUR_GAP matches), plus 5.1 with the beating (lose on the 9th with $0, then N at once).
//   node tools/test/probe.js http://127.0.0.1:8090/ - @tools/test/fix-econ.js 0 audit-fix-econ
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms)), $ = (id) => document.getElementById(id);
  for (let i = 0; i < 50 && !window.__golf; i++) await sleep(200);
  localStorage.clear(); window.confirm = () => true; const g = window.__golf, out = [];
  const say = (ok, t) => out.push(`${(ok ? 'ok' : 'FAIL').padEnd(6)} ${t}`);
  const key = (c) => window.dispatchEvent(new KeyboardEvent('keydown', { code: c, key: c, bubbles: true }));
  const on = (id) => $(id).classList.contains('on');
  $('hmGuest').click(); await sleep(150); document.querySelector('[data-h=career]').click(); await sleep(200);
  $('chName').value = 'TESTER'; $('chCreate').click(); await sleep(300);
  const c = g.career;
  async function tee(stake) {
    if (!on('clubhouse')) key('KeyJ');
    await sleep(150); document.querySelector('[data-go=match]').click(); await sleep(200);
    if (stake) { $('cmStake').value = stake; $('cmStake').dispatchEvent(new Event('input')); }
    $('cmGo').click(); await sleep(400); $('riStart').click();
    const m = g.career.match;
    for (let k = 0; k < 40 && !g.tossOpen; k++) await sleep(50);
    m.toss = 'me'; g.closeToss(); await sleep(150);
    return m;
  }
  const play = async (m, res) => {
    for (let i = 0; i < 9 && !m.settled; i++) { g.npc.done = true; g.hp.strokes = Math.max(1, g.npcHoleScore(m, i) - res); g.hp.putts = 1; g.finishHole(); await sleep(40); if (!m.settled) { g.scorecardNext(); await sleep(120); } }
  };
  // ---- 7.1: broke, lose $40 on credit: cash stays 0, $40 on the marker, a club snapped
  c.cash = 0; c.rep = 0; g.careerSave();
  say(g.creditLeft() === 100, `credit with no marker: ${g.creditLeft()} (100 + 2 × rep 0)`);
  let m = await tee(40);
  const snapped0 = c.snapped.length;
  // lose on the 9th, then N at once (inside the 250 ms before the beating): the beating, then the payoff, still come
  for (let i = 0; i < 9; i++) { g.npc.done = true; g.hp.strokes = g.npcHoleScore(m, i) + (i === 8 ? 1 : 0); g.hp.putts = 1; g.finishHole(); await sleep(40); if (i < 8) { g.scorecardNext(); await sleep(120); } }
  key('KeyN'); await sleep(500);
  const s1 = `beating ${on('beating')} · round ${g.round.on}`;
  await sleep(1300); key('Enter'); await sleep(800);
  say(/beating true · round true/.test(s1) && on('outcome'), `lost on the 9th with $0, N at once: [${s1}] → payoff ${on('outcome')}`);
  say(m.unpaid === 40 && c.debt === 40 && c.cash === 0 && c.snapped.length === snapped0 + 1, `the loss: unpaid ${m.unpaid} · marker ${c.debt} · cash ${c.cash} · clubs snapped ${c.snapped.length - snapped0}`);
  say(/marker/.test($('btSub').textContent), `the beating says: "${$('btSub').textContent}"`);
  key('Enter'); await sleep(400);
  say(/owe \$40/.test($('chCash').textContent) && g.creditLeft() === 60,`clubhouse cash: "${$('chCash').textContent}" · credit left ${g.creditLeft()} (100 − 40, rep now ${c.rep})`);
  // ---- win $30: $30 comes off the marker, cash still 0
  m = await tee(30);
  await play(m, 1); await sleep(900);
  // (Dale presses when he's 2 down, so a win can be worth more than the stake: check the sums, not a fixed number)
  say(c.debt === Math.max(0, 40 - m.net) && c.cash === Math.max(0, m.net - 40) && m.outcome.marker === Math.min(40, m.net), `then won ${m.net}: marker ${c.debt} · cash ${c.cash} · taken ${m.outcome.marker} · payoff row "${[...document.querySelectorAll('#ocCard tr.bad td')].map((x) => x.textContent).join(' | ')}" · card "${$('scMsg').textContent.split('\n').filter((l) => /marker/i.test(l)).join(' ')}"`);
  key('Enter'); await sleep(400);
  // ---- a marker bigger than the win: all the winnings go, the rest is still owed
  c.debt = 1000; c.cash = 0; g.careerSave();
  m = await tee(40);
  await play(m, 1); await sleep(900);
  say(c.debt === 1000 - m.net && c.cash === 0, `owing $1,000, won ${m.net}: marker ${c.debt} · cash ${c.cash} · "${$('scMsg').textContent.split('\n').filter((l) => /marker/i.test(l)).join(' ')}"`);
  key('Enter'); await sleep(400);
  // ---- the credit floor: a huge marker still leaves $25 of credit
  c.debt = 5000; c.cash = 0; g.careerSave();
  say(g.creditLeft() === 25, `marker $5,000: credit left ${g.creditLeft()} (the floor)`);
  c.debt = 0; g.careerSave();
  // ---- 7.2: after an entry in the Muni Open, the next is 5 matches away; forfeits don't count
  const T = g.TOURS[0];
  c.rep = 50; c.history.push({ tour: T.id, format: 'stroke', stake: T.entry, place: 4, result: 'test', net: -T.entry, date: Date.now() });
  say(g.tourWait(T) === 5, `just played the ${T.short}: wait ${g.tourWait(T)}`);
  c.history.push({ npc: 'dale', result: 'forfeited', net: -10, date: Date.now() + 1 });
  say(g.tourWait(T) === 5, `a forfeit doesn't count: wait ${g.tourWait(T)}`);
  for (let k = 0; k < 3; k++) c.history.push({ npc: 'dale', result: 'won 2 & 1', net: 10, date: Date.now() + 2 + k });
  say(g.tourWait(T) === 2, `three matches later: wait ${g.tourWait(T)}`);
  c.cash = 5000; g.careerSave(); key('Escape'); await sleep(100); if (!on('clubhouse')) key('KeyJ'); await sleep(200);
  g.openTours(); await sleep(200);
  const row = [...document.querySelectorAll('#toList .cd-row')][0];
  say(/Next one in 2 matches/.test(row.textContent) && !row.querySelector('button[data-tour]'), `the board: "${row.querySelector('.cd-buy').textContent}"`);
  for (let k = 0; k < 2; k++) c.history.push({ npc: 'dale', result: 'lost 1 down', net: -10, date: Date.now() + 9 + k });
  g.openTours(); await sleep(200);
  const row2 = [...document.querySelectorAll('#toList .cd-row')][0];
  say(g.tourWait(T) === 0 && row2.querySelector('button[data-tour]'), `five matches later: wait ${g.tourWait(T)} · "${row2.querySelector('.cd-buy').textContent}"`);
  say(g.TOURS[2].purse.join('/') === '30000/12000/6000', `Hawthorne purse ${g.TOURS[2].purse.join(' / ')}`);
  return out.join('\n');
})()
