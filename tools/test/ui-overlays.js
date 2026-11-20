// Audit section 5: screens, overlays and keys at the end of a match, and the screens that matter at a smaller size.
//   node tools/test/probe.js http://127.0.0.1:8090/ - @tools/test/ui-overlays.js 0 audit-ui5
//   (and for screenshots at another size: set PROBE_SIZE=1280x720 first; they go to tools/test/out/ui5-*.png)
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms)), $ = (id) => document.getElementById(id);
  for (let i = 0; i < 50 && !window.__golf; i++) await sleep(200);
  localStorage.clear(); window.confirm = () => true; const g = window.__golf, out = [];
  const say = (v, t) => out.push(`${v.padEnd(12)} ${t}`);
  const key = (c) => window.dispatchEvent(new KeyboardEvent('keydown', { code: c, key: c, bubbles: true }));
  const on = (id) => $(id).classList.contains('on');
  const state = () => `scorecard ${on('scorecard')} · beating ${on('beating')} · payoff ${on('outcome')} · clubhouse ${on('clubhouse')} · round ${g.round.on}`;
  $('hmGuest').click(); await sleep(150); document.querySelector('[data-h=career]').click(); await sleep(200);
  $('chName').value = 'TESTER'; $('chCreate').click(); await sleep(300);
  async function tee() {
    if (!on('clubhouse')) key('KeyJ');
    await sleep(150); document.querySelector('[data-go=match]').click(); await sleep(200);
    $('cmGo').click(); await sleep(400); $('riStart').click();
    const m = g.career.match;
    for (let k = 0; k < 40 && !g.tossOpen; k++) await sleep(50);
    m.toss = 'me'; g.closeToss(); await sleep(150);
    return m;
  }
  const playAll = async (m, res, fast = false) => {
    for (let i = 0; i < 9 && !m.settled; i++) { g.npc.done = true; g.hp.strokes = Math.max(1, g.npcHoleScore(m, i) - res); g.hp.putts = 1; g.finishHole(); await sleep(40); if (!m.settled) { g.scorecardNext(); await sleep(120); } }
  };
  // ---- 1. win a match, then press N straight away (inside the 0.45 s before the payoff screen opens)
  g.career.cash = 1000; g.careerSave(); let m = await tee();
  await playAll(m, 1); key('KeyN'); await sleep(900);
  say(on('outcome') ? 'ok' : 'FINDING 5.1', `win, then N at once: ${state()} · payoff marked seen ${m.outcome && m.outcome.shown}`);
  if (on('outcome')) $('ocCard_home').click(); else if (g.round.on) $('scClose').click(); await sleep(300);
  // ---- 1b. a match decided on the 9th, then N straight away (N then goes to the clubhouse)
  m = await tee();
  for (let i = 0; i < 9; i++) { g.npc.done = true; g.hp.strokes = Math.max(1, g.npcHoleScore(m, i) - (i === 8 ? 1 : 0)); g.hp.putts = 1; g.finishHole(); await sleep(40); if (i < 8) { g.scorecardNext(); await sleep(120); } }
  key('KeyN'); await sleep(900);
  say(on('outcome') ? 'ok' : 'FINDING 5.1', `won on the 9th, then N at once: ${state()} · "${m.result}" · payoff marked seen ${m.outcome && m.outcome.shown}`);
  if (on('outcome')) $('ocCard_home').click(); await sleep(300);
  // ---- 2. the same, at a normal pace: scorecard, payoff, then Enter → clubhouse
  m = await tee(); await playAll(m, 1); await sleep(900);
  say(on('outcome') ? 'ok' : 'FINDING', `win, then wait: ${state()}`);
  key('Enter'); await sleep(400);
  say(on('clubhouse') && !g.round.on ? 'ok' : 'FINDING', `Enter on the payoff screen: ${state()}`);
  // ---- 3. lose with no money: the beating, then the payoff, then the clubhouse, all by keys
  m = await tee(); g.career.cash = 0;
  await playAll(m, -1); await sleep(400);
  const s1 = state(); key('Enter'); await sleep(200);                     // (too early: the beating's button isn't ready)
  await sleep(1300); key('Enter'); await sleep(800);
  const s2 = state(); key('Enter'); await sleep(400);
  say(/beating true/.test(s1) && /payoff true/.test(s2) && on('clubhouse') ? 'ok' : 'FINDING', `lose with $0, Enter Enter: [${s1}] → [${s2}] → [${state()}]`);
  // ---- 4. K on the payoff screen shows the card; then the card's own close goes to the clubhouse
  g.career.cash = 1000; g.careerSave(); m = await tee(); await playAll(m, 1); await sleep(900);
  key('KeyK'); await sleep(300); const s3 = state();
  key('KeyK'); await sleep(200); const s4 = state();
  say(/scorecard true .* payoff false/.test(s3) ? 'ok' : 'FINDING', `K on the payoff screen: [${s3}]; K again: [${s4}]`);
  $('scClose').click(); await sleep(300);
  say(on('clubhouse') && !g.round.on ? 'ok' : 'FINDING', `then "Back to the clubhouse": ${state()}`);
  // ---- 5. typing in the challenge form's number box doesn't drive the game (the clubhouse takes the keys)
  // ---- 6. Esc / J / H during a hole of a match
  m = await tee(); key('Escape'); await sleep(300);
  const s6 = `home ${g.homeOpen}`; key('KeyJ'); await sleep(300);
  say(!g.homeOpen && !on('clubhouse') && g.round.on ? 'ok' : 'FINDING', `Esc and J during a match hole: ${s6}, clubhouse ${on('clubhouse')}, still in the round ${g.round.on}`);
  key('KeyH'); await sleep(400);
  say(!g.round.on && m.settled && /forfeit/.test(m.result) ? 'ok' : 'FINDING', `H (confirmed) forfeits and leaves: round ${g.round.on}, "${m.result}"`);
  return out.join('\n');
})()
