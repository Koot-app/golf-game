// THE ARCADE SITE (tools/arcade/build.js; user request, 2026-11-21): backninegolf.vercel.app, the arcade on its own. Checks: the home
// screen (its name, no sign-in, no career, the golfer on the left, the lessons, practice, the courses and the Top 10);
// a round on each course played from the home screen that goes on that course's board as a guest's initials; practice
// from the home screen; a lesson's "Try it"; the board on L; Esc from the home screen; that the site has no profile or
// challenge API; and that nothing the player can see on the way says money, cash, a price, an entry fee or a prize.
// Run the arcade site's own dev server (node tools/test/devserver.js 8091 arcade), then:
//   node tools/test/probe.js http://127.0.0.1:8091/ <shot|-> @tools/test/arcade-site.js 0 arcadesite1
// (window.__shot = 1 stops on the home screen, for a screenshot)
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms)), $ = (id) => document.getElementById(id);
  for (let i = 0; i < 50 && !window.__golf; i++) await sleep(200);
  localStorage.clear(); window.confirm = () => true; const g = window.__golf, out = [];
  const key = (c) => window.dispatchEvent(new KeyboardEvent('keydown', { code: c, key: c, bubbles: true }));
  const board = async (c) => { const j = await (await fetch(`/api/leaderboard?holes=9${c > 1 ? `&course=${c}` : ''}`)).json(); return j.total; };
  // every word the player can see, collected as we go: none may be about money
  const BAD = /\b(money|cash|prizes?|purse|fees?|stakes?|bets?|betting|wager\w*|gambl\w*|debts?|owe[sd]?|owing|credit|escrow|prices?|payout|payoff|paid|pay|buy|sell|sold|hustl\w*|shark|loan|collector|dollars?)\b|\$\d/i;
  const seen = [];
  const look = (where) => { const t = document.body.innerText; const m = t.split('\n').filter((l) => BAD.test(l) && !/white stakes/i.test(l)); if (m.length) seen.push(`${where}: ${m.slice(0, 4).join(' | ')}`); };
  if (!document.body.classList.contains('home-on')) { g.openHome(); await sleep(300); }
  await sleep(400);
  out.push(`title "${document.title}" · name "${$('hmTitle').textContent}" · sub "${document.querySelector('.hm-sub').textContent}"`);
  out.push(`career, sign-in and clubhouse in the page: ${['hmWho', 'hmMenu', 'clubhouse', 'beating', 'outcome', 'teeToss', 'btnCareer', 'scBets', 'scPressBox', 'hbNpc', 'tbMe'].filter((id) => $(id)).join(', ') || 'none'}`);
  out.push(`password boxes: ${document.querySelectorAll('input[type=password]').length} · meta description "${(document.querySelector('meta[name=description]') || {}).content}"`);
  out.push(`left column: ${[...document.querySelector('.hm-side').children].map((e) => e.id || e.className).join(', ')} · golfer rows ${document.querySelectorAll('#hmArcStats .hm-st').length} · foot "${(document.querySelector('#hmArcStats .hm-st-foot') || {}).textContent}"`);
  out.push(`lessons ${document.querySelectorAll('#hmLearnTiles [data-tut]').length} · practice ${[...document.querySelectorAll('#hmArcPrac button')].map((b) => b.dataset.h).join('/')} · courses ${[...document.querySelectorAll('#hmCourses button b')].map((b) => b.textContent).join(' | ')}`);
  out.push(`arcade note: "${document.querySelector('.hm-arc-note').textContent}"`);
  look('home');
  if (window.__shot) return out.join('\n');
  // the API: only the leaderboard
  out.push(`api: profile ${(await fetch('/api/profile', { method: 'POST' })).status} · challenge ${(await fetch('/api/challenge', { method: 'POST' })).status} · leaderboard ${(await fetch('/api/leaderboard?holes=9')).status}`);
  const before = [await board(1), await board(2), await board(3)];
  for (const c of [1, 2, 3]) {
    if (!document.body.classList.contains('home-on')) { g.openHome(); await sleep(300); }
    document.querySelector(`#hmCourses button[data-arc="${c}"]`).click(); await sleep(400);
    $('hmArcPlay').click(); await sleep(500);
    out.push('', `COURSE ${c}: preview "${document.querySelector('#roundIntro .card-h span').textContent}" · "${document.querySelector('#roundIntro .ri-note').textContent.slice(0, 120)}…" · button "${$('riStart').textContent}"`);
    look(`preview ${c}`);
    key('Enter'); await sleep(600);
    const st = g.state, pars = g.HOLES.map((h) => h.par);
    out.push(`   in the round: pars ${pars.join(',')} · stats ${st.power}/${st.dex}/${st.composure}/${st.perception} · driver ${g.CLUBS[0].model} · wood ${g.CLUBS[1].model} · 7 iron ${g.CLUBS[7].model} · SW ${g.CLUBS[12].model} · bag "${$('bagTitle').textContent}" · top bar "${$('tbRoundL').textContent}"`);
    look(`round ${c}`);
    for (let i = 0; i < 9; i++) { g.hp.strokes = pars[i] + (i === c ? 1 : 0); g.hp.putts = 2; g.finishHole(); await sleep(60); if (i === 0) look(`card ${c}`); if (i < 8) { g.scorecardNext(); await sleep(150); } }
    await sleep(400);
    out.push(`   last hole: entry screen ${$('scorecard').classList.contains('entry')} · "${$('lbHead').textContent}"`);
    key('Enter'); await sleep(1500);
    out.push(`   saved: "${$('lbNote').textContent}" · "${$('scTitle').textContent}" · buttons "${$('scNext').textContent}" | "${$('scClose').textContent}" · top name ${(g.lbLoad()[0] || {}).name}`);
    look(`board ${c}`);
    $('scClose').click(); await sleep(400);
    out.push(`   then: home open ${document.body.classList.contains('home-on')} · round on ${g.round.on}`);
  }
  const after = [await board(1), await board(2), await board(3)];
  out.push('', `boards before -> after: ${before.map((b, i) => `course ${i + 1}: ${b} -> ${after[i]}`).join(' · ')}`);
  for (const h of ['range', 'chip', 'putt']) {
    if (!document.body.classList.contains('home-on')) { g.openHome(); await sleep(300); }
    document.querySelector(`#hmArcPrac button[data-h="${h}"]`).click(); await sleep(500);
    out.push(`practice ${h}: mode ${g.state.mode} · stats ${g.state.power}/${g.state.dex}/${g.state.composure}/${g.state.perception} · driver ${g.CLUBS[0].model || 'base'} · toast "${$('toast').textContent.replace(/\n/g, ' / ')}"${h === 'putt' ? ` · putter card "${$('ptTag').textContent}" ${$('ptList').children.length} putters, foot "${$('ptFoot').textContent}"` : ''}`);
    look(`practice ${h}`);
  }
  // a hole from the range, H; the tips card; the drop card
  if (g.state.mode !== 'range') g.setMode('range');
  key('KeyH'); await sleep(800);
  out.push(`a hole from the range: on ${g.hp.on} · hint "${$('hint').textContent.slice(0, 90)}"`);
  $('btnTips').click(); await sleep(300); look('tips'); out.push(`tips: "${$('tipsBody').textContent.slice(0, 80)}…"`); key('Escape'); await sleep(200);
  key('KeyU'); await sleep(300); out.push(`drop card: "${document.querySelector('.drop-help').textContent}"`); key('Escape'); await sleep(200);
  key('KeyH'); await sleep(500);
  // each lesson, every slide (tools/test/tutorial.js covers the viewer itself)
  g.openHome(); await sleep(300);
  for (const k of ['swing', 'chip', 'putt']) {
    document.querySelector(`#hmLearnTiles [data-tut="${k}"]`).click(); await sleep(400);
    let n = 0;
    for (let i = 0; i < 14; i++) { look(`lesson ${k}`); n = $('tutPage').textContent; $('tutNext').click(); await sleep(60); }
    out.push(`lesson ${k}: "${$('tutTitle').textContent}" · ${n}`);
    $('tutClose').click(); await sleep(200);
  }
  // the board on L (from the range), then Esc from the home screen back to the game
  key('Escape'); await sleep(300);
  key('KeyL'); await sleep(500); out.push(`L: board "${$('scTitle').textContent}" · "${$('lbHdr').textContent}"`); look('board L'); key('KeyL'); await sleep(200);
  g.openHome(); await sleep(300); key('Escape'); await sleep(300);
  out.push(`Esc on the home screen: home open ${document.body.classList.contains('home-on')}`);
  out.push('', seen.length ? `MONEY WORDS SEEN:\n  ${seen.join('\n  ')}` : 'no money words anywhere the player looked');
  return out.join('\n');
})()
