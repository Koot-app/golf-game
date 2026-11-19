// Audit section 3: what the API lets a signed-in player (or anyone) do. Talks to the DEV server only.
//   node tools/test/devserver.js 8090     (in another terminal; restart it first so the auth rate limit is fresh)
//   node tools/test/sec-api.js [http://127.0.0.1:8090]
// Each line says what was tried, what came back, and whether that is right ("ok") or a finding ("FINDING 3.x").
const BASE = process.argv[2] || 'http://127.0.0.1:8090';
if (!/^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(BASE)) { console.error('Dev server only.'); process.exit(1); }
const post = async (path, token, body) => {
  const r = await fetch(BASE + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify(body) });
  let d = {}; try { d = await r.json(); } catch { /* not JSON */ }
  return { status: r.status, ...d };
};
const P = (token, action, body = {}) => post('/api/profile', token, { action, ...body });
const C = (token, action, body = {}) => post('/api/challenge', token, { action, ...body });
const career = (name, extra = {}) => ({ v: 1, name, seed: 1, cash: 1000, rep: 0, tier: 1, tierMax: 1, stats: { power: 2, dex: 2, composure: 2, perception: 2 },
  bag: { 0: 'd-xr16', 7: 'i-ap1' }, snapped: [], putter: 'p-wh2', out: [], putters: ['p-wh2'], unlocks: {}, match: null, history: [], rounds: [], pvpSeen: [], trophies: [], titles: [], ...extra });
const tag = Date.now() % 1e7, out = [];
const say = (verdict, text) => { out.push(`${verdict.padEnd(12)} ${text}`); };
const pars = [4, 3, 5, 4, 4, 3, 4, 5, 4].map((s) => ({ strokes: s, putts: 2, pen: 0 }));
const change = async (tok, fn) => { const l = await P(tok, 'load'); fn(l.career); return P(tok, 'save', { career: l.career, ver: l.ver }); };

(async () => {
  // ---- who can act as whom
  let r = await P(null, 'load'); say(r.status === 401 ? 'ok' : 'FINDING', `load with no sign-in -> ${r.status}`);
  r = await P('f'.repeat(64), 'load'); say(r.status === 401 ? 'ok' : 'FINDING', `load with a made-up token -> ${r.status}`);
  r = await P(null, 'signup', { name: 'KEETO', password: 'whatever1', career: career('KEETO') }); say(r.status !== 200 && !r.token ? 'ok' : 'FINDING', `sign up as the admin's name -> ${r.status} ${r.error || ''}`);
  const alice = await P(null, 'signup', { name: 'Al' + tag, password: 'testpass1', career: career('Al' + tag) });
  const mal = await P(null, 'signup', { name: 'Ma' + tag, password: 'aaaa', career: career('Ma' + tag) });
  const trent = await P(null, 'signup', { name: 'Tr' + tag, password: 'testpass1', career: career('Tr' + tag) });
  if (!alice.token || !mal.token || !trent.token) { console.log('sign-ups failed (auth rate limit? restart the dev server):', alice.status, mal.status, trent.status); return; }
  const A = alice.token, M = mal.token, T = trent.token, aId = ('Al' + tag).toLowerCase(), mId = ('Ma' + tag).toLowerCase();
  say('FINDING 3.7', `a 4-character password ("aaaa") is accepted -> ${mal.status}`);
  say(alice.admin || mal.admin ? 'FINDING' : 'ok', `a new profile is not an admin -> admin ${!!alice.admin}`);
  r = await change(M, (c) => { c.name = 'Al' + tag; c.cash = 1000; }); const who = (await P(M, 'load')).career.name;
  say(who === 'Ma' + tag ? 'ok' : 'FINDING', `save a career under another player's name -> stored as ${who}`);

  // ---- a challenge is only its two players'
  let ch = (await C(A, 'create', { to: mId, format: 'match', stake: 500, tier: 1, hcp: 'off' })).challenge;
  r = await C(T, 'accept', { id: ch.id }); say(r.status === 404 ? 'ok' : 'FINDING', `a third player accepts someone else's challenge -> ${r.status}`);
  r = await C(T, 'forfeit', { id: ch.id }); say(r.status === 404 ? 'ok' : 'FINDING', `a third player forfeits someone else's challenge -> ${r.status}`);
  r = await C(A, 'accept', { id: ch.id }); say(r.status === 400 ? 'ok' : 'FINDING', `the challenger accepts their own challenge -> ${r.status}`);

  // ---- 3.4: the card is whatever the browser sends
  await C(M, 'accept', { id: ch.id });
  await C(A, 'submit', { id: ch.id, card: pars });
  r = await C(M, 'submit', { id: ch.id, card: Array.from({ length: 9 }, () => ({ strokes: 1, putts: 0, pen: 0 })) });
  const aCash = (await P(A, 'load')).career.cash;
  say('FINDING 3.4', `nine holes-in-one sent as a card -> ${r.status}, "${r.challenge && r.challenge.result && r.challenge.result.line}"; the honest player's cash 1000 -> ${aCash}`);
  r = await C(M, 'submit', { id: ch.id, card: pars }); say(r.status === 400 ? 'ok' : 'FINDING', `send a second card -> ${r.status}`);

  // ---- 3.2: a career with the wrong shape breaks what everyone shares
  await change(M, (c) => { c.rounds = 'xxx'; });
  const ro = await P(null, 'roster'), pl = await P(A, 'players'), cr = await C(A, 'create', { to: mId, format: 'match', stake: 5, tier: 1, hcp: 'auto' });
  say(ro.status === 200 && pl.status === 200 ? 'ok' : 'FINDING 3.2', `one player saves rounds: "xxx" -> the sign-in list ${ro.status} ${ro.error || ''}, the Friends list ${pl.status}, challenging them ${cr.status}`);
  await change(M, (c) => { c.rounds = []; });
  say((await P(null, 'roster')).status === 200 ? 'ok' : 'FINDING', 'and it recovers when they save a normal career again');

  // ---- 3.2: ... and holds up a payout
  ch = (await C(M, 'create', { to: aId, format: 'match', stake: 200, tier: 1, hcp: 'off' })).challenge;
  await C(A, 'accept', { id: ch.id });
  const before = (await P(A, 'load')).career.cash;
  await change(M, (c) => { c.history = 'x'; });
  await C(M, 'submit', { id: ch.id, card: pars.map((h) => ({ ...h, strokes: h.strokes + 2 })) });
  r = await C(A, 'submit', { id: ch.id, card: pars });
  const l1 = await C(A, 'list'); const mine = (l1.challenges || []).find((x) => x.id === ch.id) || {};
  const after = (await P(A, 'load')).career.cash;
  say(after === before + 400 ? 'ok' : 'FINDING 3.2', `the loser's career has history: "x" -> the winner's submit ${r.status}; "${mine.result && mine.result.line}"; the winner's cash ${before} -> ${after} (should be ${before + 400})`);
  await change(M, (c) => { c.history = []; }); await C(A, 'list');
  say((await P(A, 'load')).career.cash === before + 400 ? 'ok' : 'FINDING', `once the loser's career is normal again, the next list pays the winner -> ${(await P(A, 'load')).career.cash}`);

  // ---- 3.5: the rivalry wall comes from the challenge records, not the owner's history
  const realWin = (await C(A, 'list')).challenges.find((x) => x.status === 'done' && x.result && x.result.winner === aId);   // Alice beat Mal above (the payout test)
  const forged = { friend: mId, friendName: 'Ma' + tag, ch: 'ffffffffffffffff', format: 'match', stake: 5, result: 'won · made up', net: 250000, date: 1 };
  const inflated = { friend: mId, friendName: 'Ma' + tag, ch: realWin.id, format: 'match', stake: 5, result: 'won · inflated', net: 250000, date: 2 };
  await change(A, (c) => { c.history.push(forged, inflated); c.showcase = { cards: [realWin.id] }; });
  const sc = await P(T, 'showcase', { name: aId }), wall = ((sc.player || {}).history || []).filter((h) => h.friend);
  const fakeShown = wall.some((h) => h.ch === forged.ch || /made up|inflated/.test(h.result)), real = wall.filter((h) => h.ch === realWin.id);
  say(!fakeShown && real.length === 1 && real[0].net === 200 ? 'ok' : 'FINDING 3.5', `a made-up win and an inflated real one in the owner's history -> the visitor sees ${wall.length} friend line(s), one per real challenge: made-up one shown ${fakeShown}; the real win once (${real.length}), "${real[0] && real[0].result}" net ${real[0] && real[0].net} (the record says 200)`);
  r = await P(T, 'buyshow', { owner: aId, key: `w-${forged.ch}`, price: 500000 });
  say(r.status === 404 ? 'ok' : 'FINDING 3.5', `buy the made-up trophy -> ${r.status} ${r.error || ''}`);
  await change(T, (c) => { c.cash = 1000; });
  r = await P(T, 'buyshow', { owner: aId, key: `w-${realWin.id}`, price: 500000 });
  say(r.status === 409 && r.price === 400 ? 'ok' : 'FINDING 1.7', `buy the real trophy at the inflated price -> ${r.status} ${r.error || ''}`);
  const tBefore = (await P(T, 'load')).career.cash, aBefore = (await P(A, 'load')).career.cash;
  r = await P(T, 'buyshow', { owner: aId, key: `w-${realWin.id}`, price: 400 });
  const tAfter = (await P(T, 'load')).career.cash, aAfter = (await P(A, 'load')).career.cash;
  say(r.status === 200 && tAfter === tBefore - 400 && aAfter === aBefore + 400 ? 'ok' : 'FINDING', `buy it at the record's price ($400) -> ${r.status}; buyer ${tBefore} -> ${tAfter}, owner ${aBefore} -> ${aAfter}`);
  r = await P(T, 'buyshow', { owner: aId, key: `w-${realWin.id}`, price: 400 });
  say(r.status === 404 ? 'ok' : 'FINDING', `buy the same trophy again -> ${r.status}`);

  // ---- 3.6: the shared Top 10
  const card = (s) => ({ name: 'ZZZ', holes: 9, par: 35, strokes: s.reduce((a, b) => a + b, 0), putts: 9, scores: s });
  r = await post('/api/leaderboard', null, { ...card(Array(9).fill(1)), putts: 0 });
  say(r.status === 400 ? 'ok' : 'FINDING 3.6', `a guest posts nine holes-in-one to the Top 10 -> ${r.status} ${r.error || ''}`);
  r = await post('/api/leaderboard', null, card([3, 1, 2, 2, 1, 3, 2, 1, 2]));
  say(r.status === 400 ? 'ok' : 'FINDING 3.6', `two under on every hole (17, −18) -> ${r.status} ${r.error || ''}`);
  r = await post('/api/leaderboard', null, card([4, 2, 4, 3, 3, 4, 4, 2, 4]));
  const good = r.entry;
  say(r.status === 200 ? 'ok' : 'FINDING', `a great real round (30, −5) -> ${r.status}, rank ${r.rank}`);
  r = await post('/api/leaderboard', T, { action: 'remove', t: good && good.t, id: good && good.id });
  say(r.status === 403 ? 'ok' : 'FINDING', `a player who isn't the admin removes it -> ${r.status}`);
  if (process.env.GOLF_TEST_ADMIN_PW) {                 // (the dev server started with a throwaway GOLF_ADMIN_KEETO)
    const k = await P(null, 'login', { name: 'Keeto', password: process.env.GOLF_TEST_ADMIN_PW });
    r = await post('/api/leaderboard', k.token, { action: 'remove', t: good && good.t, id: good && good.id });
    say(r.status === 200 && !(r.top || []).some((x) => x.t === good.t) ? 'ok' : 'FINDING', `the admin removes it -> ${r.status}, still on the board ${(r.top || []).some((x) => x.t === good.t)}`);
  } else say('skipped', 'the admin removing a round (start the dev server with a test GOLF_ADMIN_KEETO and GOLF_TEST_ADMIN_PW)');

  // ---- 3.3: no limit on what a new profile stores, or on how many there are
  const big = career('Bg' + tag, { cash: 1e12, junk: 'x'.repeat(248000) });
  r = await P(null, 'signup', { name: 'Bg' + tag, password: 'testpass1', career: big });
  const t0 = Date.now(), ro2 = await P(null, 'roster'), ms = Date.now() - t0, row = (ro2.players || []).find((p) => p.name === 'Bg' + tag) || {};
  say('FINDING 3.3', `a new profile with 248,000 characters of junk and $1,000,000,000,000 -> ${r.status}; on the public sign-in list with cash ${row.cash}; that list reads every profile's whole career each time (${(ro2.players || []).length} profiles here, ${ms} ms)`);

  // ---- sign-in attempts are limited per address (last: it locks this address out for a minute)
  const codes = [];
  for (let i = 0; i < 14; i++) codes.push((await P(null, 'login', { name: 'Al' + tag, password: 'wrong' + i })).status);
  say(codes.includes(429) ? 'ok' : 'FINDING', `14 wrong passwords in a row -> ${codes.join(' ')}`);
  console.log(out.join('\n'));
})().catch((e) => { console.log(out.join('\n')); console.error('STOPPED:', e); });
