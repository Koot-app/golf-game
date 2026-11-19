// Audit 3.5 / 3.6 (the game's side): a real test round still goes on the world Top 10, and buying a real win off a
// friend's wall still works from the trophy room (the page now sends the price it showed). DEV server only.
//   node tools/test/probe.js http://127.0.0.1:8090/ - @tools/test/sec-ui-paths.js 0 audit-ui
// Expected: "Your round: 1ST" (or another rank) on the board, and "Done: you paid … $400".
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms)), $ = (id) => document.getElementById(id);
  for (let i = 0; i < 50 && !window.__golf; i++) await sleep(200);
  localStorage.clear(); window.confirm = () => true; const g = window.__golf, out = {};
  const key = (c) => window.dispatchEvent(new KeyboardEvent('keydown', { code: c, key: c, bubbles: true }));
  // ---- a test round, as a guest: par on every hole, then the initials and Enter
  $('hmGuest').click(); await sleep(150);
  g.closeHome(); g.startRound(); await sleep(500);
  for (let i = 0; i < 9; i++) { g.hp.strokes = g.HOLES[i].par; g.hp.putts = 2; g.finishHole(); await sleep(60); if (i < 8) { g.scorecardNext(); await sleep(150); } }
  await sleep(400); key('Enter'); await sleep(1500);
  out.testRound = $('lbNote').textContent;
  // ---- a wall purchase: Winner beats Loser (straight to the API), then this page (Buyer) buys the trophy
  const tag = Date.now() % 1e7;
  const api = (url, token, action, body = {}) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify({ action, ...body }) }).then((r) => r.json());
  const mk = (n) => api('/api/profile', null, 'signup', { name: n, password: 'testpass1', career: { v: 1, name: n, stats: { power: 2, dex: 2, composure: 2, perception: 2 }, cash: 1000, tier: 1, tierMax: 1, history: [], rounds: [] } });
  const W = await mk('Wi' + tag), L = await mk('Lo' + tag);
  if (!W.token || !L.token) return JSON.stringify({ ...out, error: 'sign-ups refused (rate limit?)' });
  const wId = ('Wi' + tag).toLowerCase(), lId = ('Lo' + tag).toLowerCase();
  const ch = (await api('/api/challenge', W.token, 'create', { to: lId, format: 'match', stake: 200, tier: 1, hcp: 'off' })).challenge;
  await api('/api/challenge', L.token, 'accept', { id: ch.id });
  const card = (d) => [5, 3, 4, 4, 3, 5, 4, 3, 4].map((p) => ({ strokes: p + d, putts: 2, pen: 0 }));
  await api('/api/challenge', W.token, 'submit', { id: ch.id, card: card(0) });
  await api('/api/challenge', L.token, 'submit', { id: ch.id, card: card(1) });
  await api('/api/challenge', W.token, 'list');                        // (settles the payout)
  // this page signs up as the buyer, with cash, and visits the winner's room from Friends
  document.querySelector('[data-h=career]').click(); await sleep(300);
  if (!$('clubhouse').classList.contains('new')) { key('Escape'); await sleep(100); g.openHome(); await sleep(200); $('hmSwitch').click(); await sleep(300); $('hmGuest').click(); await sleep(150); document.querySelector('[data-h=career]').click(); await sleep(300); }
  document.querySelector('#siTabs [data-si=new]').click(); await sleep(100);
  $('chName').value = 'Bu' + tag; $('siPw').value = 'testpass1'; $('chCreate').click(); await sleep(1500);
  if (!g.session) return JSON.stringify({ ...out, error: 'buyer sign-up failed: ' + $('chErr').textContent });
  g.career.cash = 1000; g.careerSave(); await sleep(2500);
  document.querySelector('[data-go=friends]').click(); await sleep(1800);
  document.querySelector(`#frList button[data-act=visit][data-to="${wId}"]`).click(); await sleep(1800);
  const buy = document.querySelector('#trList button[data-buyshow^="w-"]');
  out.wallShows = [...document.querySelectorAll('#trList .tr-row.rv')].map((r) => r.innerText.replace(/\s+/g, ' ').trim());
  if (!buy) return JSON.stringify({ ...out, error: 'no buy button' }, null, 1);
  buy.click(); await sleep(2500);
  out.afterBuying = { message: $('trMsg').textContent, buyerCash: g.career.cash };
  return JSON.stringify(out, null, 1);
})()
