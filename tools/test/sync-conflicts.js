// Fixes 2.2 and 2.9 for a profile: another device's purchases and lessons survive this PC's save (three-way merge);
// a career started over elsewhere replaces this one; a copy from a newer version stops the saves (no endless retry);
// a failed save is retried on a timer and when the browser is back online; sign-up.
//   node tools/test/probe.js http://127.0.0.1:8090/ - @tools/test/sync-conflicts.js 0 audit-conflicts
// (restart the dev server first if other sign-up-heavy probes just ran: sign-ups are limited to 10 a minute)
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms)), $ = (id) => document.getElementById(id);
  for (let i = 0; i < 50 && !window.__golf; i++) await sleep(200);
  localStorage.clear(); window.confirm = () => true; const g = window.__golf, out = [];
  const say = (ok, t) => out.push(`${(ok ? 'ok' : 'FAIL').padEnd(5)} ${t}`);
  const api = (url, token, action, body = {}) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify({ action, ...body }) }).then(async (r) => ({ status: r.status, ...(await r.json().catch(() => ({}))) }));
  $('hmGuest').click(); await sleep(150); document.querySelector('[data-h=career]').click(); await sleep(200);
  document.querySelector('#siTabs [data-si=new]').click(); await sleep(100);
  const name = 'K' + (Date.now() % 1e9);
  $('chName').value = name; $('siPw').value = 'testpass1'; $('chCreate').click(); await sleep(1500);
  if (!g.session) return 'sign-up failed: ' + $('chErr').textContent;
  const me = g.session.token;
  // ---- sign-up (2.9): the name is taken now, and sign-in works
  const su2 = await api('/api/profile', null, 'signup', { name, password: 'otherpass1', career: { v: 1, name, stats: {} } });
  const li = await api('/api/profile', null, 'login', { name, password: 'testpass1' });
  say(su2.status === 409 && li.status === 200, `sign-up made the profile in one step: the same name again ${su2.status}, sign in ${li.status}`);
  g.career.cash = 1000; g.careerSave(); await sleep(2500);
  // ---- 2.2: the other device buys a driver ($300), takes a power lesson and learns the draw; this PC learns the fade
  // and gains reputation, then saves: 409, three-way merge, save again
  const s1 = await api('/api/profile', me, 'load');
  const other = s1.career; other.cash -= 300; other.bag[0] = 'd-prestigio'; other.stats.power = 3; other.unlocks.draw = true; other.stamp = Date.now();
  await api('/api/profile', me, 'save', { career: other, ver: s1.ver });
  g.career.unlocks.fade = true; g.career.rep += 1; g.careerSave(); await sleep(3000);
  const s2 = await api('/api/profile', me, 'load'), c = g.career;
  say(c.cash === 700 && c.bag[0] === 'd-prestigio' && c.stats.power === 3 && c.unlocks.draw && c.unlocks.fade && c.rep === 1 && s2.career.bag[0] === 'd-prestigio',
    `the other device's driver, lesson and shot survive this PC's save: cash ${c.cash}, driver ${c.bag[0]}, power ${c.stats.power}, draw ${c.unlocks.draw}, fade ${c.unlocks.fade}, rep ${c.rep} · on the server: driver ${s2.career.bag[0]}, cash ${s2.career.cash}`);
  // ---- 2.2: a match finished on the other device isn't "in progress" here any more
  const s3 = await api('/api/profile', me, 'load');
  const m = { npc: 'dale', format: 'match', presses: [], stake: 20, tier: 1, no: 9, salt: 5, holes: [], settled: false, feePaid: true };
  await api('/api/profile', me, 'save', { career: { ...s3.career, match: m }, ver: s3.ver });
  await g.syncLoad(); await sleep(300);
  const s4 = await api('/api/profile', me, 'load');
  await api('/api/profile', me, 'save', { career: { ...s4.career, match: null, history: [...s4.career.history, { npc: 'dale', result: 'won 2 & 1', net: 20, date: Date.now() }], cash: s4.career.cash + 20 }, ver: s4.ver });
  const hadMatch = !!g.career.match;
  g.career.pvpSeen = [...(g.career.pvpSeen || []), 'x1']; g.careerSave(); await sleep(3000);
  say(hadMatch && !g.career.match && g.career.history.some((h) => h.npc === 'dale' && h.net === 20), `a match settled on the other device: here it was in progress (${hadMatch}), after this PC's save it's gone (${!g.career.match}) and the result is in the history`);
  // ---- 2.9: offline: a failed save is retried on a timer, and at once when the browser is back online
  const f0 = window.fetch; let down = true, tries = 0;
  window.fetch = function (...a) { if (/profile/.test(String(a[0])) && down) { tries++; return Promise.reject(new TypeError('Failed to fetch')); } return f0.apply(this, a); };
  g.career.rep += 1; g.careerSave(); await sleep(1800);
  const st1 = g.sync.state, retry = g.sync.retryMs;
  down = false; window.dispatchEvent(new Event('online')); await sleep(1200);
  window.fetch = f0;
  say(st1 === 'offline' && retry === 15000 && g.sync.state === 'ok' && !g.sync.dirty, `offline: "${st1}", a retry queued in ${retry / 1000} s; back online: "${g.sync.state}", unsent ${g.sync.dirty}`);
  // ---- 2.9: a copy saved by a newer version of the game: this PC stops and says reload (no request storm)
  const s5 = await api('/api/profile', me, 'load');
  await api('/api/profile', me, 'save', { career: { ...s5.career, v: 2 }, ver: s5.ver });
  let calls = 0; const f1 = window.fetch;
  window.fetch = function (...a) { if (/profile/.test(String(a[0]))) calls++; return f1.apply(this, a); };
  g.career.rep += 1; g.careerSave(); await sleep(3500);
  window.fetch = f1;
  say(calls <= 2 && g.sync.state === 'newer' && /newer version/.test($('chSync').textContent), `a newer version's copy: ${calls} request(s) in 2 s (it was about 40), state "${g.sync.state}", the player sees "${$('chSync').textContent}"`);
  // ---- 2.9: the career was started over on another device: the new career replaces this one, nothing old comes back
  const s6 = await api('/api/profile', me, 'load');
  const fresh = { v: 1, name, seed: 7, cash: 150, rep: 0, tier: 1, tierMax: 1, stats: { power: 2, dex: 2, composure: 2, perception: 2 }, bag: { ...s6.career.bag }, putter: 'p-wh2', history: [], rounds: [], cards: [], created: Date.now() + 1000 };
  await api('/api/profile', me, 'save', { career: fresh, ver: s6.ver });
  g.sync.ver = s6.ver;                                      // (this PC's last sync was before the restart)
  const hist0 = g.career.history.length;
  g.career.rep += 5; g.careerSave(); await sleep(3000);
  say(g.career.cash === 150 && g.career.history.length === 0 && g.career.created === fresh.created && hist0 > 0, `started over elsewhere: this PC now has the new career (cash ${g.career.cash}, history ${g.career.history.length}, was ${hist0}), toast "${$('toast').textContent.replace(/\n/g, ' / ')}"`);
  return out.join('\n');
})()
