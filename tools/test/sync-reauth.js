// Audit 2.1: a sign-in that has expired (they last 30 days), then "Sign in again".
//   node tools/test/probe.js http://127.0.0.1:8090/ - @tools/test/sync-reauth.js 0 audit-reauth
// The player wins $500 after the sign-in stopped working (the save gets a 401 and stays on this PC), then signs in again
// as the game asks. Correct: $1,500 (and it reaches the server). The bug (fixed): $1,000 — the server's copy replaced
// this PC's unsent progress.
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms)), $ = (id) => document.getElementById(id);
  for (let i = 0; i < 50 && !window.__golf; i++) await sleep(200);
  localStorage.clear(); const g = window.__golf;
  $('hmGuest').click(); await sleep(150); document.querySelector('[data-h=career]').click(); await sleep(200);
  document.querySelector('#siTabs [data-si=new]').click(); await sleep(100);
  const name = 'R' + (Date.now() % 1e9);
  $('chName').value = name; $('siPw').value = 'testpass1'; $('chCreate').click(); await sleep(1500);
  if (!g.session) return 'sign-up failed: ' + $('chErr').textContent;
  g.career.cash = 1000; g.careerSave(); await sleep(2500);                    // synced at $1,000
  // the sign-in expires (here: the session is deleted on the server, as its 30-day expiry does)
  await fetch('/api/profile', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + g.session.token }, body: JSON.stringify({ action: 'logout' }) });
  g.career.cash += 500; g.career.rep += 5; g.careerSave(); await sleep(2500);  // a match won: +$500, +5 reputation; the save is refused
  const out = { afterTheWin: { cash: g.career.cash, rep: g.career.rep, syncState: g.sync.state, unsent: g.sync.dirty } };
  // what the game tells the player to do: home screen → Sign in again → password
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape', bubbles: true })); await sleep(200);
  g.openHome(); await sleep(400);
  out.homeSays = $('hmSync').textContent; out.signInAgainShown = $('hmReauth').style.display !== 'none';
  $('hmReauth').click(); await sleep(2500);
  const card = document.querySelector('#hmRoster .hm-p.on');
  if (!card) return JSON.stringify({ ...out, error: 'no roster card selected' });
  card.querySelector('input').value = 'testpass1'; card.querySelector('[data-signin]').click(); await sleep(2500);
  out.afterSigningInAgain = { signedIn: !!g.session, cash: g.career && g.career.cash, rep: g.career && g.career.rep };
  await sleep(2000);
  const srv = await fetch('/api/profile', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + g.session.token }, body: JSON.stringify({ action: 'load' }) }).then((r) => r.json());
  out.onTheServer = { cash: srv.career.cash, rep: srv.career.rep };
  return JSON.stringify(out, null, 1);
})()
