// FRIENDS INVITATIONALS in the game (user request, 2026-11-20). This page signs up as a player; two friends (by the API)
// host and join an invitational with this player in it; the player accepts from the Friends page, plays the round in
// the game (each hole to the server as it's finished), and sees the final card with all three. Then the player hosts
// one from the invitational form. DEV server only.
//   node tools/test/probe.js http://127.0.0.1:8090/ <shot|-> @tools/test/inv-ui.js 0 inv-ui
// (window.__shot = 1 stops on the final card for a screenshot; = 2 on the Friends page with the hosted one)
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms)), $ = (id) => document.getElementById(id);
  for (let i = 0; i < 50 && !window.__golf; i++) await sleep(200);
  localStorage.clear(); window.confirm = () => true; const g = window.__golf, out = [];
  const say = (ok, t) => out.push(`${(ok ? 'ok' : 'FAIL').padEnd(5)} ${t}`);
  const post = (path, token, action, body = {}) => fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify({ action, ...body }) }).then(async (r) => ({ status: r.status, ...(await r.json().catch(() => ({}))) }));
  $('hmGuest').click(); await sleep(150); document.querySelector('[data-h=career]').click(); await sleep(200);
  document.querySelector('#siTabs [data-si=new]').click(); await sleep(100);
  const tag = Date.now() % 1e7, name = 'Me' + tag;
  $('chName').value = name; $('siPw').value = 'testpass1'; $('chCreate').click(); await sleep(1500);
  if (!g.session) return 'sign-up failed: ' + $('chErr').textContent;
  const me = g.session.token, myId = g.session.id;
  g.career.cash = 1000; g.careerSave(); await sleep(2500);
  const mk = async (n) => { const r = await post('/api/profile', null, 'signup', { name: n, password: 'testpass1', career: { v: 1, name: n, stats: { power: 2, dex: 2, composure: 2, perception: 2 }, cash: 1000, rep: 0, tier: 1, tierMax: 1, history: [], rounds: [] } }); return { id: n.toLowerCase(), token: r.token, name: n }; };
  const H = await mk('Ho' + tag), F = await mk('Fr' + tag);
  const r0 = await post('/api/challenge', H.token, 'invite', { to: [myId, F.id], format: 'stroke', stake: 50, tier: 1, hcp: 'off' });
  const id = r0.challenge.id;
  // the Friends page: the invitation waits for me
  g.openClubhouse(); await sleep(300); g.openFriends(); await sleep(1800);
  const acc = document.querySelector(`#frList button[data-act=accept][data-id="${id}"]`);
  say(!!acc, `the invitation is on the Friends page under "Waiting for you": "${acc ? acc.closest('.fr-ch').innerText.replace(/\s+/g, ' ').slice(0, 160) : 'not there'}"`);
  acc.click(); await sleep(2500);
  say(/You're in/.test($('frMsg').textContent), `accepted: "${$('frMsg').textContent}" · cash ${g.career.cash}`);
  await post('/api/challenge', F.token, 'accept', { id });
  await post('/api/challenge', H.token, 'start', { id });
  const PARS = g.HOLES.map((h) => h.par);
  const play = async (p, over) => { for (let i = 0; i < 9; i++) await post('/api/challenge', p.token, 'hole', { id, i, strokes: PARS[i] + over, putts: 2, pen: 0 }); return post('/api/challenge', p.token, 'submit', { id, card: PARS.map((x) => ({ strokes: x + over, putts: 2, pen: 0 })) }); };
  await play(H, 1); await play(F, 2);
  // I play mine in the game
  await g.loadFriends(); await sleep(300);
  const pl = document.querySelector(`#frList button[data-act=play][data-id="${id}"]`);
  say(!!pl, `it's under "To play" with a Play button`);
  g.playFriend(id); await sleep(500);
  out.push(`      preview: "${document.querySelector('#roundIntro .card-h span').textContent}" · "${document.querySelector('#roundIntro .ri-note').textContent.slice(0, 150)}…"`);
  $('riStart').click(); await sleep(800);
  if (!g.round.pvp) return out.concat(['FAIL  could not start the round']).join('\n');
  for (let i = 0; i < 9; i++) { g.hp.strokes = PARS[i]; g.hp.putts = 2; g.finishHole(); await sleep(400); if (i < 8) { g.scorecardNext(); await sleep(300); } }
  await sleep(3000);
  const l = await post('/api/challenge', me, 'list'), done = (l.challenges || []).find((x) => x.id === id) || {};
  say(done.status === 'done' && done.result && done.result.winner === myId, `every card in, it settled: "${done.result && done.result.line}" · my money ${done.result && done.result.net[myId]}`);
  const rows = [...$('scTable').querySelectorAll('tr')].map((r) => r.innerText.replace(/\s+/g, ' ').trim());
  say(/invitational/.test($('scTitle').textContent) && rows.length === 5, `the final card: "${$('scTitle').textContent}" · ${rows.length - 2} player rows`);
  out.push(`      ${rows.slice(2).join('\n      ')}`);
  out.push(`      "${$('scMsg').textContent.replace(/\n/g, ' / ')}"`);
  if (window.__shot === 1) return out.join('\n');
  // I host one: the form, pick both friends, send
  $('scNext').click(); await sleep(1500);
  if (!$('clubhouse').classList.contains('friends')) { g.openClubhouse(); await sleep(300); g.openFriends(); await sleep(1500); }
  $('frInvBtn').click(); await sleep(300);
  say($('chChal').classList.contains('inv') && $('ccPickRow').offsetParent !== null, `the invitational form is open: "${$('ccTitle').textContent}" · match play shown ${document.querySelector('#ccFmt [data-fmt=match]').offsetParent !== null}`);
  document.querySelector(`#ccPick button[data-pick="${H.id}"]`).click(); await sleep(100);
  document.querySelector(`#ccPick button[data-pick="${F.id}"]`).click(); await sleep(100);
  document.querySelector('#ccFmt [data-fmt=skins]').click(); await sleep(100);
  out.push(`      form: "${$('ccTitle').textContent}" · "${$('ccEscrow').textContent}" · button "${$('ccGo').textContent}"`);
  $('ccGo').click(); await sleep(2500);
  say(/Invitations sent/.test($('frMsg').textContent), `sent: "${$('frMsg').textContent}"`);
  const mine = ((await post('/api/challenge', me, 'list')).challenges || []).find((x) => x.kind === 'inv' && x.host === myId);
  say(mine && mine.players.length === 3 && mine.format === 'skins', `the server has it: ${mine && mine.players.length} players, ${mine && mine.format}, my stake held ${mine && mine.held[myId]}`);
  await post('/api/challenge', H.token, 'accept', { id: mine.id });
  await g.loadFriends(); await sleep(500);
  const startB = document.querySelector(`#frList button[data-act=start][data-id="${mine.id}"]`);
  say(!!startB, `once a friend is in, the host gets a Start button: "${startB ? startB.textContent : 'none'}"`);
  return out.join('\n');
})()
