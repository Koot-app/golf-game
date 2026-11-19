// Audit 2.4 and 2.5: how big a career gets, and what happens at the two size limits.
//   node tools/test/probe.js http://127.0.0.1:8090/ - @tools/test/sync-size.js 0 audit-size
// The server refuses a career over 250,000 characters (api/profile.js MAX_CAREER); the browser refuses a save sent while
// the tab is closing or hiding (fetch keepalive) over 64 KB. career.history is never trimmed.
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms)), $ = (id) => document.getElementById(id);
  for (let i = 0; i < 50 && !window.__golf; i++) await sleep(200);
  localStorage.clear(); window.confirm = () => true; const g = window.__golf, out = {};
  $('hmGuest').click(); await sleep(150); document.querySelector('[data-h=career]').click(); await sleep(200);
  document.querySelector('#siTabs [data-si=new]').click(); await sleep(100);
  const name = 'S' + (Date.now() % 1e9);
  $('chName').value = name; $('siPw').value = 'testpass1'; $('chCreate').click(); await sleep(1500);
  if (!g.session) return 'sign-up failed: ' + $('chErr').textContent;
  const len = (x) => JSON.stringify(x).length;
  out.freshCareer = len(g.career);
  // one real match, for a real scorecard and history line
  g.career.cash = 5000; g.careerSave();
  document.querySelector('[data-go=match]').click(); await sleep(300);
  $('cmGo').click(); await sleep(500); $('riStart').click();
  for (let k = 0; k < 40 && !g.tossOpen; k++) await sleep(50);
  const m = g.career.match; m.toss = 'me'; g.closeToss(); await sleep(150);
  for (let i = 0; i < 9; i++) { g.npc.done = true; g.hp.strokes = g.HOLES[i].par + (i % 3); g.hp.putts = 2; g.finishHole(); await sleep(40); if (i < 8) { g.scorecardNext(); await sleep(100); } }
  await sleep(700); if ($('outcome').classList.contains('on')) $('ocCard_home').click(); else $('scClose').click(); await sleep(2500);
  const card = g.career.cards[0], hist = g.career.history[0];
  out.oneScorecard = len(card); out.oneHistoryLine = len(hist); out.oneHandicapRound = len(g.career.rounds[0]);
  // an established player: 100 scorecards (the cap), 20 rounds (the cap), one history line per match
  const grow = (matches) => {
    g.career.cards = Array.from({ length: Math.min(100, matches) }, (_, k) => ({ ...card, id: `m${k}-${k * 7919}`, date: card.date + k }));
    g.career.history = Array.from({ length: matches }, (_, k) => ({ ...hist, date: hist.date + k }));
    return len(g.career);
  };
  out.after100Matches = grow(100); out.after500Matches = grow(500);
  let n = 100; while (grow(n) < 64 * 1024 - 200) n += 5; out.matchesToPass64KB = n;
  n = 500; while (grow(n) <= 250000) n += 10; out.matchesToPass250000 = n;
  // ---- over 64 KB: the save sent as the tab hides or closes
  grow(out.matchesToPass64KB + 20); g.career.stamp = Date.now();
  const v0 = g.sync.ver;
  await g.syncNow(true); await sleep(300);
  out.tabHidingSaveOver64KB = { bytes: len(g.career), syncState: g.sync.state, serverVersionMoved: g.sync.ver !== v0, retryQueued: !!g.sync.again };
  await g.syncNow(); await sleep(300);
  out.normalSaveSameCareer = { syncState: g.sync.state, serverVersionMoved: g.sync.ver !== v0 };
  // ---- over the server's limit
  grow(out.matchesToPass250000 + 20); g.careerSave(); await sleep(2800);
  const v1 = g.sync.ver;
  g.career.cash += 1; g.careerSave(); await sleep(2800);
  out.over250000 = { chars: len(g.career), syncState: g.sync.state, whatThePlayerSees: $('chSync').textContent, serverVersionMoved: g.sync.ver !== v1, stillUnsent: g.sync.dirty };
  return JSON.stringify(out, null, 1);
})()
