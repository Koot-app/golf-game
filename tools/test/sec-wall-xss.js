// Audit 3.1: another player's trophy room can run script in your browser. DEV server only.
//   node tools/test/probe.js http://127.0.0.1:8090/ - @tools/test/sec-wall-xss.js 0 audit-xss
// "Mallory" saves a career whose history has HTML in a friend's name, a format and a challenge id (a career is whatever
// the browser sends). "Victim" signs in and opens Mallory's trophy room from Friends.
// Correct: the text shows as text; nothing runs; no element is created.
// The bug: the markup is put into the page as HTML. The harmless marker here proves script ran and could read the
// victim's sign-in token (it only records that it could; it sends nothing anywhere).
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms)), $ = (id) => document.getElementById(id);
  for (let i = 0; i < 50 && !window.__golf; i++) await sleep(200);
  localStorage.clear(); const g = window.__golf;
  $('hmGuest').click(); await sleep(150); document.querySelector('[data-h=career]').click(); await sleep(200);
  document.querySelector('#siTabs [data-si=new]').click(); await sleep(100);
  const tag = Date.now() % 1e7;
  $('chName').value = 'Vi' + tag; $('siPw').value = 'testpass1'; $('chCreate').click(); await sleep(1500);
  if (!g.session) return 'sign-up failed: ' + $('chErr').textContent;
  // Mallory: straight to the API, as anyone can
  const mName = 'Ma' + tag;
  const history = [
    { friend: 'aa', friendName: '<img src=x onerror="window.__ran=\'script ran; token readable: \'+!!localStorage.getItem(\'golfSession\')">', format: 'match', stake: 5, result: 'won', net: 100, date: 1 },
    { friend: 'bb', friendName: 'B', format: '<i id="xss-format"></i>', stake: 5, result: 'won', net: 100, date: 2 },
    { friend: 'cc', friendName: 'C', ch: '"><i id="xss-ch"></i>', format: 'match', stake: 5, result: 'won', net: 100, date: 3 },
  ];
  const mal = await fetch('/api/profile', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'signup', name: mName, password: 'testpass1',
    career: { v: 1, name: mName, stats: { power: 2, dex: 2, composure: 2, perception: 2 }, cash: 100, tier: 1, tierMax: 1, history, rounds: [], showcase: { cards: [] } } }) }).then((r) => r.json());
  if (!mal.token) return 'Mallory sign-up failed: ' + JSON.stringify(mal);
  // the victim: Friends, then Mallory's trophy room
  document.querySelector('[data-go=friends]').click(); await sleep(1800);
  const visit = document.querySelector(`#frList button[data-act=visit][data-to="${mName.toLowerCase()}"]`);
  if (!visit) return 'no visit button for Mallory';
  visit.click(); await sleep(2000);
  return JSON.stringify({ inTheirTrophyRoom: $('clubhouse').classList.contains('trophy'), scriptFromTheirName: window.__ran || 'did not run',
    htmlFromFormat: !!$('xss-format'), htmlFromChallengeId: !!$('xss-ch') }, null, 1);
})()
