// Audit 1.3 and 1.5 (one run): what mergeServer does with money the SERVER copy moved while this PC had unsent changes.
//   node tools/test/probe.js http://127.0.0.1:8090/ - @tools/test/money-merge.js 0 audit-merge
// Part 1: another device buys a driver for $300 (cash and bag both change on the server); this PC then saves a change.
//         Correct: the driver survives. The bug: cash is $300 down and the driver is gone.
// Part 2: you send a friend a $500 challenge with $700, then they accept while you sit in the pro shop.
//         Since the 1.3 fix the stake is taken when you send it, and this PC picks that up straight away: it shows $200
//         before the accept and after it, so a $650 purchase can't happen. (Before the fix: −$450.)
// Part 3: a $100 challenge the friend declines: your $100 comes back.
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms)), $ = (id) => document.getElementById(id);
  for (let i = 0; i < 50 && !window.__golf; i++) await sleep(200);
  localStorage.clear(); const g = window.__golf, out = {};
  $('hmGuest').click(); await sleep(150); document.querySelector('[data-h=career]').click(); await sleep(200);
  document.querySelector('#siTabs [data-si=new]').click(); await sleep(100);
  const name = 'M' + (Date.now() % 1e9);
  $('chName').value = name; $('siPw').value = 'testpass1'; $('chCreate').click(); await sleep(1500);
  if (!g.session) return 'sign-up failed: ' + $('chErr').textContent;
  const api = (url, token, action, body = {}) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify({ action, ...body }) }).then(async (r) => ({ status: r.status, ...(await r.json()) }));
  const me = g.session.token;
  g.career.cash = 1000; g.careerSave(); await sleep(2500);
  // ---- part 1: "the other device" (straight to the API with the same sign-in)
  const s1 = await api('/api/profile', me, 'load');
  const other = s1.career; other.cash -= 300; other.bag[0] = 'd-prestigio'; other.stamp = Date.now();
  const sv = await api('/api/profile', me, 'save', { career: other, ver: s1.ver });
  out.part1 = { otherDeviceSaved: sv.status, before: { cash: 1000, driver: g.career.bag[0] } };
  g.career.rep += 1; g.careerSave(); await sleep(3000);          // this PC changes something and saves: 409, merge, save again
  const s2 = await api('/api/profile', me, 'load');
  out.part1.after = { cashHere: g.career.cash, driverHere: g.career.bag[0], serverCash: s2.career.cash, serverDriver: s2.career.bag[0] };
  // ---- part 2: a friend accepts a challenge while this PC's copy is stale
  g.career.cash = 700; g.careerSave(); await sleep(2500);
  const fname = 'F' + (Date.now() % 1e9);
  const f = await api('/api/profile', null, 'signup', { name: fname, password: 'testpass1', career: { v: 1, name: fname, stats: { power: 2, dex: 2, composure: 2, perception: 2 }, cash: 700, rep: 0, tier: 1, tierMax: 1, history: [], rounds: [] } });
  const c = await api('/api/challenge', me, 'create', { to: fname, format: 'match', stake: 500, tier: 1, hcp: 'off' });
  await g.syncLoad(); await sleep(300);                         // (what sendChallenge does after a create)
  const shownAfterCreate = g.career.cash;
  const a = await api('/api/challenge', f.token, 'accept', { id: c.challenge && c.challenge.id });
  const s3 = await api('/api/profile', me, 'load');
  out.part2 = { created: c.status, heldAtCreate: !!(c.challenge && c.challenge.held && c.challenge.held[g.session.id]), cashThisPCShowsAfterCreate: shownAfterCreate, accepted: a.status, serverCashAfterAccept: s3.career.cash, friendCashAfterAccept: (await api('/api/profile', f.token, 'load')).career.cash, canSpend650: g.career.cash >= 650 };
  // part 3: decline gives the challenger's stake back; a challenge you can't cover is refused
  const c2 = await api('/api/challenge', me, 'create', { to: fname, format: 'match', stake: 100, tier: 1, hcp: 'off' });
  const s5 = await api('/api/profile', me, 'load');
  const d = await api('/api/challenge', f.token, 'decline', { id: c2.challenge && c2.challenge.id });
  const s6 = await api('/api/profile', me, 'load');
  const c3 = await api('/api/challenge', me, 'create', { to: fname, format: 'match', stake: 5000, tier: 1, hcp: 'off' });
  const s7 = await api('/api/profile', me, 'load');
  out.part3 = { created: c2.status, serverCashAfterCreate: s5.career.cash, declined: d.status, serverCashAfterDecline: s6.career.cash, tooBig: `${c3.status} ${c3.error}`, cashAfterRefused: s7.career.cash };
  return JSON.stringify(out, null, 1);
})()
