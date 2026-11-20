// Audit 1.2 and 1.4, run A of 2: a $5,000 match at the country club, 4 down after 4 holes, two penalty strokes into
// hole 5 ... and then the tab is closed (the probe ends).
//   node tools/test/probe.js http://127.0.0.1:8090/ - @tools/test/money-reload-a.js 0 audit-reload
//   node tools/test/probe.js http://127.0.0.1:8090/ - @tools/test/money-reload-b.js 0 audit-reload
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms)), $ = (id) => document.getElementById(id);
  for (let i = 0; i < 50 && !window.__golf; i++) await sleep(200);
  localStorage.clear(); window.confirm = () => true; const g = window.__golf;
  $('hmGuest').click(); await sleep(150); document.querySelector('[data-h=career]').click(); await sleep(200);
  $('chName').value = 'TESTER'; $('chCreate').click(); await sleep(300);
  Object.assign(g.career, { cash: 6000, tier: 3, tierMax: 3, rep: 0 }); g.careerSave();
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape', bubbles: true })); await sleep(100);
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyJ', key: 'KeyJ', bubbles: true })); await sleep(300);
  document.querySelector('[data-go=match]').click(); await sleep(300);
  document.querySelector('.cm-npc[data-i="3"]').click(); await sleep(200);          // Vic: plays for up to $5,000
  const st = $('cmStake'); st.value = 5000; st.dispatchEvent(new Event('input', { bubbles: true })); await sleep(100);
  $('cmGo').click(); await sleep(600); $('riStart').click(); await sleep(800);
  const m = g.career.match; m.toss = 'me'; if (g.tossOpen) g.closeToss();
  for (let i = 0; i < 4; i++) { g.npc.done = true; g.hp.strokes = g.HOLES[i].par + 4; g.hp.putts = 2; g.finishHole(); await sleep(50); g.scorecardNext(); await sleep(150); }
  await sleep(1500);                                                                  // (his tee shot, if he has the honour)
  // hole 5: two balls out of bounds already, and the ball now halfway to the pin (as a real stroke ends: setupNextShot)
  const pin = g.hole.pin;
  g.hp.strokes = 4; g.hp.pen = 2; g.hp.onTee = false; g.hp.ball = { x: pin.x * 0.5, z: pin.z * 0.5 }; g.setupNextShot();
  await sleep(6000);                                 // (the probe kills Chrome: give localStorage time to reach the disk first)
  return JSON.stringify({ npc: m.npc, stake: m.stake, holesPlayed: m.holes.length, settled: m.settled, cash: g.career.cash, stats: g.career.stats, onHole: g.hp.holeIdx + 1, strokesThisHole: g.hp.strokes, pen: g.hp.pen, ball: { x: +g.hp.ball.x.toFixed(1), z: +g.hp.ball.z.toFixed(1) }, hisStrokes: g.npc.k });
})()
