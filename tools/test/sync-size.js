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
  for (let i = 0; i < 9; i++) { g.npc.done = true; g.hp.strokes = g.HOLES[i].par + (i % 3); g.hp.putts = 2; g.finishHole(); await sleep(40); if (i < 8) { g.scorecardNext(); await sleep(100); if ($('outcome').classList.contains('on') && $('ocCard_on')) { $('ocCard_on').click(); await sleep(100); } } }
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
  // ---- 2.6: the history is trimmed on the next save (the last 300 lines, plus what's kept for good: the first hustler
  // win, the first $1,000 win, the best finish in each invitational, every friend challenge)
  grow(out.matchesToPass250000 + 20);
  g.career.history.splice(10, 0, { friend: 'pal', friendName: 'Pal', ch: 'a'.repeat(16), format: 'match', stake: 50, result: 'won · You win 3 & 2', net: 50, date: hist.date + 10.5 },
    { tour: 'muniopen', format: 'stroke', stake: 250, place: 2, result: '2nd in the Muni Open', net: 450, date: hist.date + 10.6 },
    { npc: 'dale', format: 'match', stake: 40, result: 'won 2 & 1', net: 40, date: hist.date + 10.7 },
    { npc: 'gus', format: 'match', stake: 250, result: 'won 5 & 4', net: 1250, date: hist.date + 10.8 });
  for (const x of g.career.history) if (x.npc === hist.npc && x.net > 0 && x !== g.career.history[12]) x.net = -Math.abs(x.net);   // (only the lines above are wins)
  const before = { lines: g.career.history.length, chars: len(g.career) };
  const v1 = g.sync.ver;
  g.career.cash += 1; g.careerSave(); await sleep(2800);
  const h = g.career.history;
  out.trimmedOnSave = { before, after: { lines: h.length, chars: len(g.career) }, keptFriendLine: h.some((x) => x.friend === 'pal'), keptBestTour: h.some((x) => x.tour === 'muniopen' && x.place === 2),
    keptFirstWin: h.some((x) => x.npc === 'dale' && x.net === 40), keptFirstBigWin: h.some((x) => x.npc === 'gus' && x.net === 1250), syncState: g.sync.state, serverVersionMoved: g.sync.ver !== v1 };
  // ---- something else makes it too big: the save is refused, and the player is told so (not "offline")
  g.career.junk = 'x'.repeat(260000); const v2 = g.sync.ver;
  g.careerSave(); await sleep(2800);
  out.over250000 = { chars: len(g.career), syncState: g.sync.state, whatThePlayerSees: $('chSync').textContent, serverVersionMoved: g.sync.ver !== v2, stillUnsent: g.sync.dirty };
  delete g.career.junk; g.careerSave(); await sleep(2800);
  out.afterRemovingIt = { syncState: g.sync.state };
  return JSON.stringify(out, null, 1);
})()
