// Audit 1.1, run A of 2: a signed-in career saves, but the save's RESPONSE never reaches the page (as when the tab is
// closed or reloaded while a save is in flight: the visibilitychange keepalive save, or any save on a dropped connection).
//   node tools/test/probe.js http://127.0.0.1:8090/ - @tools/test/money-lost-save-a.js "" audit-lostsave
//   node tools/test/probe.js http://127.0.0.1:8090/ - @tools/test/money-lost-save-b.js "" audit-lostsave
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms)), $ = (id) => document.getElementById(id);
  for (let i = 0; i < 50 && !window.__golf; i++) await sleep(200);
  localStorage.clear(); const g = window.__golf;
  // a new profile, through the sign-in form
  $('hmGuest').click(); await sleep(150); document.querySelector('[data-h=career]').click(); await sleep(200);
  document.querySelector('#siTabs [data-si=new]').click(); await sleep(100);
  const name = 'T' + (Date.now() % 1e9);
  $('chName').value = name; $('siPw').value = 'testpass1'; $('chCreate').click(); await sleep(1500);
  if (!g.session) return 'sign-up failed: ' + $('chErr').textContent;
  g.career.cash = 1000; g.careerSave(); await sleep(2500);                    // synced: the server and the base both say $1,000
  const post = (action, body = {}) => fetch('/api/profile', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + g.session.token }, body: JSON.stringify({ action, ...body }) }).then((r) => r.json());
  const before = await post('load');
  // from here on a save reaches the server, but its response is never delivered to the page
  const realFetch = window.fetch;
  window.fetch = (u, o) => { const p = realFetch(u, o); return o && /"action":"save"/.test(o.body || '') ? new Promise(() => {}) : p; };
  g.career.cash += 500; g.careerSave(); await sleep(2500);                    // win $500; the save goes out, the reply is lost
  const after = await post('load');
  const meta = JSON.parse(localStorage.getItem('golfCareer_p_' + g.session.id));
  await sleep(6000);                                 // (the probe kills Chrome: give localStorage time to reach the disk first)
  return JSON.stringify({ name, serverBefore: { cash: before.career.cash, ver: before.ver }, serverAfter: { cash: after.career.cash, ver: after.ver },
    thisPC: { cash: meta.c.cash, ver: meta.s.ver, baseCash: meta.s.base.cash, dirty: meta.s.dirty, pend: meta.s.pend }, serverSaveIds: after.career.saveIds });
})()
