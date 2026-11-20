// Audit 1.6: a money move that dies half-way (a storage write failing between two steps) is put right by running it
// again, without paying twice or losing a stake. Uses the dev server's failure injection (POST /__fail).
//   node tools/test/devserver.js 8090      (restart it first so sign-ups aren't rate limited)
//   node tools/test/money-steps.js [http://127.0.0.1:8090]
const BASE = process.argv[2] || 'http://127.0.0.1:8090';
if (!/^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(BASE)) { console.error('Dev server only.'); process.exit(1); }
let ip = 0;
const post = async (path, token, body) => {
  const r = await fetch(BASE + path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': `10.9.${(ip = (ip + 1) % 250)}.1`, ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify(body) });
  let d = {}; try { d = await r.json(); } catch { /* not JSON */ }
  return { status: r.status, ...d };
};
const P = (t, action, b = {}) => post('/api/profile', t, { action, ...b }), C = (t, action, b = {}) => post('/api/challenge', t, { action, ...b });
const fail = (cmd, key, skip = 0) => fetch(BASE + '/__fail', { method: 'POST', body: JSON.stringify({ cmd, key, skip }) });
const cash = async (t) => (await P(t, 'load')).career.cash;
const tag = Date.now() % 1e6, out = [], say = (ok, t) => out.push(`${(ok ? 'ok' : 'FAIL').padEnd(5)} ${t}`);
const career = (n) => ({ v: 1, name: n, cash: 1000, rep: 0, tier: 1, tierMax: 1, stats: { power: 2, dex: 2, composure: 2, perception: 2 }, history: [], rounds: [] });
const PARS = [5, 3, 4, 4, 3, 5, 4, 3, 4];
const play = async (t, id, over) => { const card = PARS.map((p) => ({ strokes: p + over, putts: 2, pen: 0 })); for (let i = 0; i < 9; i++) await C(t, 'hole', { id, i, ...card[i] }); return C(t, 'submit', { id, card }); };
(async () => {
  const mk = async (n) => (await P(null, 'signup', { name: n, password: 'pw', career: career(n) })).token;
  const A = await mk(`Ma${tag}`), B = await mk(`Mb${tag}`), aId = `ma${tag}`, bId = `mb${tag}`;
  if (!A || !B) { console.log('sign-ups failed (restart the dev server)'); return; }
  // ---- create: the stake is taken, then the write marking it held fails; calling it off gives it back once
  await fail('SET', 'golf:ch:', 0 + 1);                     // (the 2nd write of the challenge: after the stake is taken)
  const c1 = await C(A, 'create', { to: bId, format: 'match', stake: 100, tier: 1, hcp: 'off' });
  const l1 = await C(A, 'list'), ch1 = (l1.challenges || []).find((x) => x.status === 'pending' && x.stake === 100);
  const mid = await cash(A);
  const cancel = ch1 ? await C(A, 'cancel', { id: ch1.id }) : { status: 0 };
  await C(A, 'list'); const after1 = await cash(A);
  say(c1.status === 500 && ch1 && mid === 900 && cancel.status === 200 && after1 === 1000, `create dies after taking the stake (${c1.status}): the challenge is there, $${1000 - mid} held; called off -> cash ${after1} (want 1000)`);
  // ---- accept: the stake is taken, then the write marking it held fails; accepting again takes nothing twice
  const ch2 = (await C(A, 'create', { to: bId, format: 'match', stake: 100, tier: 1, hcp: 'off' })).challenge;
  await fail('SET', `golf:ch:${ch2.id}`);
  const a1 = await C(B, 'accept', { id: ch2.id });
  const a2 = await C(B, 'accept', { id: ch2.id });
  const bAfterAccept = await cash(B);
  say(a1.status === 500 && a2.status === 200 && bAfterAccept === 900, `accept dies after taking the stake (${a1.status}); accepted again (${a2.status}) -> the friend's cash ${bAfterAccept} (want 900, not 800)`);
  // ---- payout: the winner is paid, then the write marking it paid fails; the next list pays nobody twice
  await play(A, ch2.id, 0);                                 // A plays to par
  const bCard = PARS.map((p) => ({ strokes: p + 2, putts: 2, pen: 0 }));      // B two over a hole: A wins
  for (let i = 0; i < 9; i++) await C(B, 'hole', { id: ch2.id, i, ...bCard[i] });
  await fail('SET', `golf:ch:${ch2.id}`, 1);               // (finish writes it, pays A, then marks A paid: that write)
  const s2 = await C(B, 'submit', { id: ch2.id, card: bCard });
  for (let i = 0; i < 3; i++) await C(A, 'list');
  for (let i = 0; i < 2; i++) await C(B, 'list');
  const aCash = await cash(A), bCash = await cash(B);
  const aLines = (await P(A, 'load')).career.history.filter((h) => h.ch === ch2.id).length;
  say(s2.status === 500 && aCash === 1100 && bCash === 900 && aLines === 1, `the payout's "paid" mark fails (${s2.status}); after more lists: winner ${aCash} (want 1100), loser ${bCash} (want 900), the winner's history lines for it ${aLines} (want 1)`);
  // ---- a wall purchase: the owner's side fails and so does the refund; the buyer's next load (a minute on) settles it
  const T = await mk(`Mt${tag}`);
  await P(A, 'save', { career: { ...(await P(A, 'load')).career, showcase: { cards: [], hide: [] } }, ver: (await P(A, 'load')).ver });
  const price = 200;                                        // twice the win's net ($100)
  const t0 = await cash(T);
  await fail('EVAL', `golf:career:${aId}`);                 // the owner's write fails...
  await fail('EVAL', `golf:career:mt${tag}`, 1);           // ...and so does the buyer's refund (its 2nd write: the 1st is the charge)
  const buy = await P(T, 'buyshow', { owner: aId, key: `w-${ch2.id}`, price });
  const tMid = await cash(T);
  out.push(`      (the purchase: ${buy.status} ${buy.error || ''}; buyer ${t0} -> ${tMid}; waiting a minute for the next load to settle it…)`);
  await new Promise((r) => setTimeout(r, 62000));
  const tEnd = await cash(T), aEnd = await cash(A);
  say(tEnd === t0 && aEnd === 1100, `after a failed purchase, the buyer's next load: buyer ${tEnd} (want ${t0}), owner ${aEnd} (want 1100: not paid for a sale that didn't happen)`);
  console.log(out.join('\n'));
})().catch((e) => { console.log(out.join('\n')); console.error('STOPPED:', e); });
