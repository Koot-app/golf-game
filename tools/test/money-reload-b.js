// Audit 1.2 and 1.4, run B of 2 (same Chrome profile): the game is opened again with the match still live.
// 1.2: the clubhouse let you spend the cash the bet is riding on (here: lessons), then lose and pay only what's left.
//      Since the fix: the coach (and shop, caddies...) won't open: lessonsBought 0, and the $5,000 loss is paid in full.
// 1.4: the hole in progress starts again from the tee: the two penalty strokes are gone.
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms)), $ = (id) => document.getElementById(id);
  for (let i = 0; i < 50 && !window.__golf; i++) await sleep(200);
  window.confirm = () => true; const g = window.__golf, out = {};
  await sleep(500);
  document.querySelector('[data-h=career]').click(); await sleep(400);
  out.clubhouse = { matchButton: $('chMatchBtn').textContent, cash: g.career.cash, stats: { ...g.career.stats } };
  document.querySelector('[data-go=coach]').click(); await sleep(200);
  let bought = 0;
  for (let n = 0; n < 60; n++) { const b = [...document.querySelectorAll('#coList button[data-lesson]')].filter((x) => !x.disabled).pop(); if (!b) break; b.click(); bought++; await sleep(20); }
  out.afterCoach = { coachOpened: $('clubhouse').classList.contains('coach'), message: $('chMsg').textContent, lessonsBought: bought, cash: g.career.cash, stats: { ...g.career.stats } };
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape', bubbles: true })); await sleep(200);
  $('chMatchBtn').click(); await sleep(900);
  const m = g.career.match; if (g.tossOpen) g.closeToss();
  out.resumed = { onHole: g.hp.holeIdx + 1, strokesThisHole: g.hp.strokes, penalties: g.hp.pen };
  for (let i = m.holes.length; i < 9 && !m.settled; i++) { g.npc.done = true; g.hp.strokes = g.HOLES[i].par + 4; g.hp.putts = 2; g.finishHole(); await sleep(50); if (!m.settled) { g.scorecardNext(); await sleep(150); } }
  await sleep(300);
  out.settled = { result: m.result, owed: 5000, paid: -m.net, unpaid: m.unpaid, cash: g.career.cash, stats: { ...g.career.stats }, snapped: g.career.snapped.length };
  return JSON.stringify(out, null, 1);
})()
