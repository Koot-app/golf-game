// Audit 2.3: a gap in the fix for 1.1 (cash counted twice after a save whose reply is lost).
//   node tools/test/probe.js http://127.0.0.1:8090/ - @tools/test/sync-pend-gap.js 0 audit-pend
// The connection drops as a save goes out (it reaches the server; the reply is lost) and stays down for a while: the game
// tries to save `fails` more times, then the connection comes back. Correct: $1,500 whatever `fails` is.
// The bug (fixed): from 6 failed tries on, $2,000 — only the last 6 unanswered saves were remembered, so the one that
// landed was forgotten. Now 300 are kept.
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms)), $ = (id) => document.getElementById(id);
  for (let i = 0; i < 50 && !window.__golf; i++) await sleep(200);
  localStorage.clear(); const g = window.__golf, out = [];
  $('hmGuest').click(); await sleep(150); document.querySelector('[data-h=career]').click(); await sleep(200);
  document.querySelector('#siTabs [data-si=new]').click(); await sleep(100);
  const name = 'P' + (Date.now() % 1e9);
  $('chName').value = name; $('siPw').value = 'testpass1'; $('chCreate').click(); await sleep(1500);
  if (!g.session) return 'sign-up failed: ' + $('chErr').textContent;
  const realFetch = window.fetch, isSave = (o) => o && /"action":"save"/.test(o.body || '');
  for (const fails of [3, 6, 40]) {
    window.fetch = realFetch;
    g.career.cash = 1000; g.careerSave(); await sleep(2500);                  // synced at $1,000
    // the save reaches the server, the reply doesn't reach the page
    window.fetch = (u, o) => (isSave(o) ? realFetch(u, o).then(() => { throw new TypeError('connection lost'); }) : realFetch(u, o));
    g.career.cash += 500; await g.syncNow();
    // still offline: more saves that go nowhere (a few holes of a match)
    window.fetch = (u, o) => (isSave(o) ? Promise.reject(new TypeError('offline')) : realFetch(u, o));
    for (let k = 0; k < fails; k++) { g.career.stamp = Date.now(); await g.syncNow(); }
    // back online
    window.fetch = realFetch;
    await g.syncNow(); await sleep(1500);
    out.push(`${fails} failed tries while offline -> cash ${g.career.cash} (want 1500)`);
  }
  return out.join('\n');
})()
