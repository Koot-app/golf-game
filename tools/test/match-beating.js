// User request (2026-11-20): after the loan shark's beating, you end up in the clubhouse, not on the driving range.
// Through the game's own match flow: a match lost with $0 (beating → payoff screen → clubhouse), and a match forfeited
// with $0 by leaving the course (beating, no payoff screen → clubhouse; it used to leave you on the range).
//   node tools/test/probe.js http://127.0.0.1:8090/ - @tools/test/match-beating.js 0 match-beating
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms)), $ = (id) => document.getElementById(id);
  for (let i = 0; i < 50 && !window.__golf; i++) await sleep(200);
  localStorage.clear(); window.confirm = () => true; const g = window.__golf, out = [];
  const say = (v, t) => out.push(`${v.padEnd(8)} ${t}`);
  const key = (c) => window.dispatchEvent(new KeyboardEvent('keydown', { code: c, key: c, bubbles: true }));
  $('hmGuest').click(); await sleep(150); document.querySelector('[data-h=career]').click(); await sleep(200);
  $('chName').value = 'TESTER'; $('chCreate').click(); await sleep(300);
  async function tee(stake, who = 1) {
    if (!$('clubhouse').classList.contains('on')) key('KeyJ');
    await sleep(150); document.querySelector('[data-go=match]').click(); await sleep(200);
    document.querySelector(`.cm-npc[data-i="${who}"]`).click(); await sleep(100);
    document.querySelector('#cmFmt [data-fmt=match]').click(); await sleep(60);
    const st = $('cmStake'); st.value = stake; st.dispatchEvent(new Event('input', { bubbles: true })); await sleep(60);
    $('cmGo').click(); await sleep(400); $('riStart').click();
    const m = g.career.match;
    for (let k = 0; k < 40 && !g.tossOpen; k++) await sleep(50);
    m.toss = 'me'; g.closeToss(); await sleep(150);
    return m;
  }
  const play = async (m, i, res) => { g.npc.done = true; g.hp.strokes = Math.max(1, g.npcHoleScore(m, i) - res); g.hp.putts = 1; g.finishHole(); await sleep(40); };
  const where = () => `clubhouse ${$('clubhouse').classList.contains('on') ? 'OPEN' : 'closed'} · on a hole ${g.hp.on} · mode ${g.state.mode} · payoff ${$('outcome').classList.contains('on') ? 'open' : 'closed'}`;
  const waitBeating = async () => { for (let k = 0; k < 40 && !$('beating').classList.contains('on'); k++) await sleep(50); const on = $('beating').classList.contains('on'); await sleep(1300); return on; };

  // ---- 1. a match lost with $0: the beating, then the payoff screen, then its "Back to the clubhouse"
  g.career.cash = 100000; let m = await tee(20); g.career.cash = 0;
  for (let i = 0; i < 9 && !m.settled; i++) { await play(m, i, -1); if (!m.settled) { g.scorecardNext(); await sleep(120); } }
  let beat = await waitBeating(), snapped = g.career.snapped.length;
  $('btGo').click(); await sleep(500);
  const payoff = $('outcome').classList.contains('on');
  if (payoff) { $('ocCard_home').click(); await sleep(400); }
  say(beat && payoff && $('clubhouse').classList.contains('on') ? 'ok' : 'PROBLEM', `lost with $0: beating ${beat}, a club snapped (${snapped}), the payoff screen after it ${payoff}, then: ${where()}`);

  // ---- 2. forfeited with $0 by leaving the course (leaveHole, as H and the Leave button do): the beating, no payoff screen → the clubhouse
  g.career.snapped = []; g.career.cash = 100000; m = await tee(20); g.career.cash = 0;
  await play(m, 0, -1); g.scorecardNext(); await sleep(150);
  g.leaveHole(); await sleep(100);
  beat = await waitBeating();
  const before = where();
  $('btGo').click(); await sleep(600);
  say(beat && $('clubhouse').classList.contains('on') ? 'ok' : 'PROBLEM', `forfeited with $0 (leaving the course): beating ${beat} · under the beating: ${before} · after "Pick yourself up": ${where()}`);

  // ---- 3. a forfeit you can pay: no beating, and (as before) you're left where leaving puts you
  g.career.snapped = []; g.career.cash = 100000; m = await tee(20);
  await play(m, 0, -1); g.scorecardNext(); await sleep(150);
  g.leaveHole(); await sleep(900);
  say(!$('beating').classList.contains('on') ? 'ok' : 'PROBLEM', `forfeited with the cash to pay: no beating · ${where()}`);
  return out.join('\n');
})()
