// Audit 6.2, run B of 2 (same Chrome profile): the game is opened again and the match resumed. Expected: back on hole 2
// with the same tilt (3) as before the reload, not 0.
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms)), $ = (id) => document.getElementById(id);
  for (let i = 0; i < 50 && !window.__golf; i++) await sleep(200);
  window.confirm = () => true; const g = window.__golf;
  await sleep(500);
  document.querySelector('[data-h=career]').click(); await sleep(400);
  $('chMatchBtn').click(); await sleep(900);
  if (g.tossOpen) g.closeToss();
  const t = g.state.badStreak;
  return `${t === 3 ? 'ok' : 'FAIL'}  after the reload: on hole ${g.hp.holeIdx + 1}, round on ${g.round.on}, tilt ${t} (want 3)`;
})()
