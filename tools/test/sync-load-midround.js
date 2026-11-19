// Audit 2.2: the server's copy arrives after an invitational has been resumed.
//   node tools/test/probe.js http://127.0.0.1:8090/ - @tools/test/sync-load-midround.js 0 audit-midround
// syncLoad() checks "not in a round" before it asks the server, not after the answer comes. Here the server has a newer
// copy (a friend's payout, another PC...), the answer is slow (2.5 s, like a cold start), and the player resumes their
// invitational meanwhile. Correct: the round's entry stays the career's entry, and the hole played next is saved.
// The bug (fixed): the career was swapped under the round; the holes played from then on were never saved.
// Now: sameEntry true when the answer arrives (its +$200 merged in), and 2 holes in the round, the career and the server.
// (A hustler match escapes this only because resuming it happens to save at once; a friend round is exposed like this.)
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms)), $ = (id) => document.getElementById(id);
  for (let i = 0; i < 50 && !window.__golf; i++) await sleep(200);
  localStorage.clear(); window.confirm = () => true; const g = window.__golf;
  $('hmGuest').click(); await sleep(150); document.querySelector('[data-h=career]').click(); await sleep(200);
  document.querySelector('#siTabs [data-si=new]').click(); await sleep(100);
  const name = 'L' + (Date.now() % 1e9);
  $('chName').value = name; $('siPw').value = 'testpass1'; $('chCreate').click(); await sleep(1500);
  if (!g.session) return 'sign-up failed: ' + $('chErr').textContent;
  const api = (action, body = {}) => fetch('/api/profile', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + g.session.token }, body: JSON.stringify({ action, ...body }) }).then((r) => r.json());
  const enter = async () => { document.querySelector('[data-go=match]').click(); await sleep(300); if (!$('clubhouse').classList.contains('tour')) { $('cmTours').click(); await sleep(300); } document.querySelector('#toList button[data-tour=muniopen]').click(); await sleep(500); $('riStart').click(); await sleep(700); };
  // the Muni Open, one hole played, then out to the clubhouse as after a reload (the entry stays in the career, resumable)
  g.career.cash = 1000; g.career.rep = 30; g.careerSave();
  await enter();
  if (!g.round.tour) return 'could not enter the invitational: ' + $('toMsg').textContent;
  g.hp.strokes = 4; g.hp.putts = 2; g.finishHole(); await sleep(2800);         // hole 1, synced
  g.round.on = false; g.round.tour = null; document.body.classList.remove('round', 'match', 'hole'); g.hp.on = false; g.hp.done = false;   // "reload"
  document.getElementById('scorecard').classList.remove('on');
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyJ', key: 'KeyJ', bubbles: true })); await sleep(1500);   // the clubhouse (and its own sync)
  // the server's copy moves on (what a friend's payout does): +$200
  const s = await api('load'); s.career.cash += 200; await api('save', { career: s.career, ver: s.ver });
  // a slow answer to "load"
  const realFetch = window.fetch;
  window.fetch = (u, o) => (o && /"action":"load"/.test(o.body || '') ? realFetch(u, o).then((r) => new Promise((res) => setTimeout(() => res(r), 2500))) : realFetch(u, o));
  g.syncLoad();                                                                 // (opening the clubhouse does this)
  await sleep(200);
  await enter();                                                                // Resume, before the answer is back
  const before = { roundOn: g.round.on, sameEntry: g.round.tour === g.career.tour, holes: g.career.tour.holes.length };
  await sleep(3000);                                                            // the answer arrives mid-round
  window.fetch = realFetch;
  const mid = { sameEntry: g.round.tour === g.career.tour, cash: g.career.cash };
  g.hp.strokes = 4; g.hp.putts = 2; g.finishHole(); await sleep(2800);         // hole 2
  const after = { holesInTheRound: g.round.tour.holes.length, holesInTheCareer: g.career.tour ? g.career.tour.holes.length : null, holesOnTheServer: ((await api('load')).career.tour || { holes: [] }).holes.length };
  return JSON.stringify({ before, whenTheAnswerArrives: mid, afterPlayingHole2: after }, null, 1);
})()
