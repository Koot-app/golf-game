// Fix 3.4: a friend round played in the game. Each hole goes to the server as it's finished; the card at the end is
// those holes; the shared card marks a card sent faster than a round can be played (this test plays in seconds).
//   node tools/test/probe.js http://127.0.0.1:8090/ - @tools/test/pvp-round.js 0 audit-pvp
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms)), $ = (id) => document.getElementById(id);
  for (let i = 0; i < 50 && !window.__golf; i++) await sleep(200);
  localStorage.clear(); window.confirm = () => true; const g = window.__golf, out = [];
  const say = (ok, t) => out.push(`${(ok ? 'ok' : 'FAIL').padEnd(5)} ${t}`);
  const post = (path, token, action, body = {}) => fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify({ action, ...body }) }).then(async (r) => ({ status: r.status, ...(await r.json().catch(() => ({}))) }));
  $('hmGuest').click(); await sleep(150); document.querySelector('[data-h=career]').click(); await sleep(200);
  document.querySelector('#siTabs [data-si=new]').click(); await sleep(100);
  const name = 'P' + (Date.now() % 1e9);
  $('chName').value = name; $('siPw').value = 'testpass1'; $('chCreate').click(); await sleep(1500);
  if (!g.session) return 'sign-up failed: ' + $('chErr').textContent;
  const me = g.session.token, myId = g.session.id;
  g.career.cash = 1000; g.careerSave(); await sleep(2500);
  // a friend (straight to the API) challenges me; I accept; they play their round the proper way
  const fname = 'Q' + (Date.now() % 1e9);
  const f = await post('/api/profile', null, 'signup', { name: fname, password: 'testpass1', career: { v: 1, name: fname, stats: { power: 2, dex: 2, composure: 2, perception: 2 }, cash: 1000, rep: 0, tier: 1, tierMax: 1, history: [], rounds: [] } });
  const ch = (await post('/api/challenge', f.token, 'create', { to: myId, format: 'stroke', stake: 50, tier: 1, hcp: 'off' })).challenge;
  await post('/api/challenge', me, 'accept', { id: ch.id });
  const PARS = g.HOLES.map((h) => h.par);
  for (let i = 0; i < 9; i++) await post('/api/challenge', f.token, 'hole', { id: ch.id, i, strokes: PARS[i] + 1, putts: 2, pen: 0 });
  await post('/api/challenge', f.token, 'submit', { id: ch.id, card: PARS.map((p) => ({ strokes: p + 1, putts: 2, pen: 0 })) });
  // now I play mine in the game
  await g.loadFriends(); await sleep(300);
  g.playFriend(ch.id); await sleep(500);
  $('riStart').click(); await sleep(800);
  if (!g.round.pvp) return out.concat([`could not start the friend round (${$('frMsg') && $('frMsg').textContent})`]).join('\n');
  let afterThree = null;
  for (let i = 0; i < 9; i++) {
    g.hp.strokes = PARS[i]; g.hp.putts = 2; g.finishHole(); await sleep(400);
    if (i === 2) {
      const l = await post('/api/challenge', me, 'list'), c = (l.challenges || []).find((x) => x.id === ch.id);
      afterThree = c && c.holes;
    }
    if (i < 8) { g.scorecardNext(); await sleep(300); }
  }
  say(afterThree && afterThree[myId] === 3, `after three holes the server has 3 of mine (holes ${JSON.stringify(afterThree)}; the friend's card is in, so theirs shows 9)`);
  await sleep(2500);
  const l = await post('/api/challenge', me, 'list'), done = (l.challenges || []).find((x) => x.id === ch.id) || {};
  say(done.status === 'done' && done.result && done.result.winner === myId, `the card went in after the 9th and it settled: ${done.status}, "${done.result && done.result.line}"`);
  const msg = $('scMsg').textContent;
  say(done.fast && done.fast[myId] && /Your card was sent all at once/.test(msg), `played in seconds, so the shared card marks it: "${(msg.split('\n').find((x) => /all at once/.test(x)) || '').trim()}"`);
  say(!g.career.pvpCard, 'the friend round is done with on this PC (no card left to send)');
  return out.join('\n');
})()
