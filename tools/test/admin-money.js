// The admin's money (user request, 2026-11-20): the admin profile sees an "Add money" row in the clubhouse and can add
// cash to its own career, which syncs to the server; anyone else doesn't see it.
// Needs a dev server started with a THROWAWAY admin credential (never the real one), e.g. in PowerShell:
//   $c = node -e "const c=require('crypto'),s=c.randomBytes(16).toString('hex');console.log(s+':'+c.scryptSync('test-admin-pw',s,32).toString('hex'))"
//   $env:GOLF_ADMIN_KEETO=$c; node tools/test/devserver.js 8091
//   node tools/test/probe.js http://127.0.0.1:8091/ admin-money @tools/test/admin-money.js 0 audit-admin
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms)), $ = (id) => document.getElementById(id);
  for (let i = 0; i < 50 && !window.__golf; i++) await sleep(200);
  localStorage.clear(); window.confirm = () => true; const g = window.__golf, out = [];
  const say = (ok, t) => out.push(`${(ok ? 'ok' : 'FAIL').padEnd(5)} ${t}`);
  const shown = () => getComputedStyle($('chAdmin')).display !== 'none';
  // ---- a normal profile: no admin row
  $('hmGuest').click(); await sleep(150); document.querySelector('[data-h=career]').click(); await sleep(200);
  document.querySelector('#siTabs [data-si=new]').click(); await sleep(100);
  $('chName').value = 'N' + (Date.now() % 1e9); $('siPw').value = 'pw'; $('chCreate').click(); await sleep(1500);
  say(g.session && !shown(), `a normal profile: signed in ${!!g.session}, the admin row shown ${shown()}`);
  // ---- the admin: sign in as Keeto (the dev server's throwaway credential)
  $('chSwitch').click(); await sleep(800);
  document.querySelector('[data-h=career]') && document.querySelector('[data-h=career]').click(); await sleep(300);
  document.querySelector('#siTabs [data-si=in]').click(); await sleep(100);
  $('chName').value = 'Keeto'; $('siPw').value = 'test-admin-pw'; $('chCreate').click(); await sleep(2500);
  if (!g.session || g.session.id !== 'keeto') return out.concat(`could not sign in as Keeto: ${$('chErr').textContent}`).join('\n');
  say(shown(), `signed in as Keeto: the admin row shown ${shown()}`);
  const c0 = g.career.cash;
  document.querySelector('#chAdmin button[data-add="100000"]').click(); await sleep(200);
  $('chAdminAmt').value = '2500'; $('chAdminAmt').dispatchEvent(new KeyboardEvent('keydown', { code: 'Enter', key: 'Enter', bubbles: true })); await sleep(200);
  const c1 = g.career.cash;
  say(c1 === c0 + 102500 && /\$102,500|\$\d/.test($('chCash').textContent), `+$100,000 and 2,500 (Enter): cash ${c0} -> ${c1}; "${$('chAdminMsg').textContent}"; the hub shows ${$('chCash').textContent}`);
  $('chAdminAmt').value = '0'; $('chAdminGo').click(); await sleep(100);
  say(g.career.cash === c1 && /\$1 to/.test($('chAdminMsg').textContent), `an amount of 0 is refused: "${$('chAdminMsg').textContent}"`);
  // reputation: +50 then +200 (the resort's circuit asks for 40, the invitationals more)
  const r0 = g.career.rep || 0;
  document.querySelector('#chAdmin button[data-rep="50"]').click(); await sleep(100);
  document.querySelector('#chAdmin button[data-rep="200"]').click(); await sleep(200);
  say(g.career.rep === r0 + 250 && $('chRep').textContent === String(r0 + 250), `+50 and +200 reputation: ${r0} -> ${g.career.rep}; the hub shows ${$('chRep').textContent}; "${$('chAdminMsg').textContent}"`);
  await sleep(3000);                                                                         // (the save goes to the server)
  const srv = await fetch('/api/profile', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + g.session.token }, body: JSON.stringify({ action: 'load' }) }).then((r) => r.json());
  say(srv.career && srv.career.cash === c1 && srv.career.rep === r0 + 250 && !(srv.career.history || []).some((h) => h.net >= 1000), `on the server: cash ${srv.career && srv.career.cash} (want ${c1}), reputation ${srv.career && srv.career.rep}, no history line (so no "big score" trophy), totals added $${srv.career && srv.career.adminAdded} and ${srv.career && srv.career.adminRep} rep`);
  return out.join('\n');
})()
