// Audit 6.2, run A of 2: a match, three bad shots in a row on hole 1 (tilt 3), the hole finished, on to hole 2 ... and
// then the tab is closed (the probe ends). Run B opens the game again and resumes the match.
//   node tools/test/probe.js http://127.0.0.1:8090/ - @tools/test/tilt-reload-a.js 0 audit-tilt
//   node tools/test/probe.js http://127.0.0.1:8090/ - @tools/test/tilt-reload-b.js 0 audit-tilt
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms)), $ = (id) => document.getElementById(id);
  for (let i = 0; i < 50 && !window.__golf; i++) await sleep(200);
  localStorage.clear(); window.confirm = () => true; const g = window.__golf;
  $('hmGuest').click(); await sleep(150); document.querySelector('[data-h=career]').click(); await sleep(200);
  $('chName').value = 'TESTER'; $('chCreate').click(); await sleep(300);
  g.career.cash = 1000; g.careerSave();
  document.querySelector('[data-go=match]').click(); await sleep(300);
  $('cmGo').click(); await sleep(600); $('riStart').click(); await sleep(800);
  const m = g.career.match; m.toss = 'me'; if (g.tossOpen) g.closeToss();
  g.setBadStreak(3);                                                                  // three bad shots in a row
  g.npc.done = true; g.hp.strokes = g.npcHoleScore(m, 0); g.hp.putts = 2; g.finishHole(); await sleep(80);
  g.scorecardNext(); await sleep(300);
  const onHole2 = g.state.badStreak;
  await sleep(6000);                                 // (the probe kills Chrome: give localStorage time to reach the disk first)
  return `before the reload: on hole ${g.hp.holeIdx + 1} with tilt ${onHole2} · saved with the match: ${m.tilt}`;
})()
