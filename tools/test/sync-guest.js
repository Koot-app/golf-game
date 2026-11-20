// Fix 2.8 (and 2.2 for two tabs): a guest career. A damaged save is backed up; storage that refuses writes is reported;
// another tab's save is taken (when this tab isn't in a round and has nothing waiting), else a warning.
//   node tools/test/probe.js http://127.0.0.1:8090/ - @tools/test/sync-guest.js 0 audit-guest
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms)), $ = (id) => document.getElementById(id);
  for (let i = 0; i < 50 && !window.__golf; i++) await sleep(200);
  localStorage.clear(); window.confirm = () => true; const g = window.__golf, out = [];
  const say = (ok, t) => out.push(`${(ok ? 'ok' : 'FAIL').padEnd(5)} ${t}`);
  const toastTxt = () => $('toast').textContent.replace(/\n/g, ' / ');
  // ---- a damaged save is backed up before anything can write over it
  const BAD = '{"v":1,"name":"BROKEN", this is not JSON';
  localStorage.setItem('golfCareer_v1', BAD); localStorage.setItem('golfMode', 'local');
  $('hmGuest').click(); await sleep(300);
  say(localStorage.getItem('golfCareer_v1_damaged') === BAD, `a damaged guest save is copied to golfCareer_v1_damaged (${localStorage.getItem('golfCareer_v1_damaged') === BAD})`);
  document.querySelector('[data-h=career]').click(); await sleep(200);
  if (!g.career) { $('chName').value = 'GUEST'; $('chCreate').click(); await sleep(700); }
  say(localStorage.getItem('golfCareer_v1_damaged') === BAD && JSON.parse(localStorage.getItem('golfCareer_v1') || '{}').name === 'GUEST', 'a new career then takes the key, and the backup stays');
  // ---- storage that refuses writes: the player is told, and told again when it works
  const set0 = Storage.prototype.setItem;
  Storage.prototype.setItem = function (k, v) { if (/^golfCareer/.test(k)) throw new DOMException('full', 'QuotaExceededError'); return set0.call(this, k, v); };
  g.career.cash += 5; g.careerSave(); await sleep(700);
  const warned = toastTxt(), status = $('chSync').textContent;
  Storage.prototype.setItem = set0;
  say(/isn't keeping/.test(warned) && /isn't keeping/.test(status), `storage full: toast "${warned.slice(0, 50)}…" · status "${status}"`);
  g.career.cash += 5; g.careerSave(); await sleep(700);
  say(!/isn't keeping/.test($('chSync').textContent), `writes work again: the warning goes ("${$('chSync').textContent}")`);
  // ---- another tab saves this career: this tab takes it
  const theirs = JSON.parse(localStorage.getItem('golfCareer_v1')); theirs.cash = 4242; theirs.bag[0] = 'd-prestigio';
  window.dispatchEvent(new StorageEvent('storage', { key: 'golfCareer_v1', newValue: JSON.stringify(theirs) })); await sleep(100);
  say(g.career.cash === 4242 && g.career.bag[0] === 'd-prestigio' && /\$4,242/.test($('chCash').textContent), `the other tab's save is taken: cash ${g.career.cash}, driver ${g.career.bag[0]}, the hub shows "${$('chCash').textContent}"`);
  // ---- ... but not in the middle of a round: a warning instead
  document.querySelector('[data-go=match]').click(); await sleep(300);
  $('cmGo').click(); await sleep(600); $('riStart').click();
  for (let k = 0; k < 40 && !g.tossOpen; k++) await sleep(50);
  g.career.match.toss = 'me'; g.closeToss(); await sleep(200);
  const mine = g.career.cash, theirs2 = { ...JSON.parse(localStorage.getItem('golfCareer_v1')), cash: 99 };
  window.dispatchEvent(new StorageEvent('storage', { key: 'golfCareer_v1', newValue: JSON.stringify(theirs2) })); await sleep(100);
  say(g.career.cash === mine && /another tab/.test(toastTxt()), `during a round it isn't taken (cash ${g.career.cash}), and the player is warned: "${toastTxt()}"`);
  return out.join('\n');
})()
