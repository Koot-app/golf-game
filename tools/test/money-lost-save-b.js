// Audit 1.1, run B of 2 (same Chrome profile as run A): the next visit. Open the clubhouse and let it sync.
// Correct: cash stays $1,500 (the $500 was won once). The bug (fixed): $2,000 (the $500 added again by mergeServer).
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 50 && !window.__golf; i++) await sleep(200);
  const g = window.__golf;
  await sleep(600);
  document.querySelector('[data-h=career]').click(); await sleep(3500);       // the clubhouse: syncLoad, then the merged copy is saved
  const post = (action, body = {}) => fetch('/api/profile', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + g.session.token }, body: JSON.stringify({ action, ...body }) }).then((r) => r.json());
  const srv = await post('load');
  return JSON.stringify({ cashOnThisPC: g.career && g.career.cash, serverCash: srv.career.cash, serverVer: srv.ver, shown: document.getElementById('chCash').textContent });
})()
