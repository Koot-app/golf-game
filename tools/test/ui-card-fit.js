// Audit 5.2: a match's scorecard with the press offer up (you're 2 down after 4, and the hustler pressed too), at the
// window size given by PROBE_SIZE. Prints each part's height and whether the press offer and the buttons are on screen
// without scrolling.
//   PROBE_SIZE=1366x768 node tools/test/probe.js http://127.0.0.1:8090/ ui52-1366 @tools/test/ui-card-fit.js 0 audit-fit
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms)), $ = (id) => document.getElementById(id);
  for (let i = 0; i < 50 && !window.__golf; i++) await sleep(200);
  localStorage.clear(); window.confirm = () => true; const g = window.__golf;
  $('hmGuest').click(); await sleep(150); document.querySelector('[data-h=career]').click(); await sleep(200);
  $('chName').value = 'TESTER'; $('chCreate').click(); await sleep(300);
  g.career.cash = 5000; g.careerSave();
  document.querySelector('[data-go=match]').click(); await sleep(300);
  $('cmGo').click(); await sleep(500); $('riStart').click();
  for (let k = 0; k < 40 && !g.tossOpen; k++) await sleep(50);
  const m = g.career.match; m.toss = 'me'; g.closeToss(); await sleep(200);
  // lose holes 1 and 2 (2 down: the press offer), on to hole 3 and lose it too after pressing, then lose 4
  const res = [-1, -1, -1, -1];
  for (let i = 0; i < res.length; i++) {
    g.npc.done = true; g.hp.strokes = Math.max(1, g.npcHoleScore(m, i) - res[i]); g.hp.putts = 2; g.finishHole(); await sleep(80);
    if (i === 1 && $('scPressBox').classList.contains('on') && !$('scPressBox').classList.contains('his')) { $('scPress').click(); await sleep(80); }
    if (i < res.length - 1) { g.scorecardNext(); await sleep(150); }
  }
  await sleep(900);
  const sc = $('scorecard'), H = innerHeight, out = [];
  const box = (el) => { const r = el.getBoundingClientRect(); return { h: Math.round(r.height), top: Math.round(r.top), bottom: Math.round(r.bottom) }; };
  out.push(`window ${innerWidth}×${H} · card ${box(sc).h} px (content ${sc.scrollHeight}, scrolled ${sc.scrollTop}) · press offer up ${$('scPressBox').classList.contains('on')} (${$('scPressBox').classList.contains('his') ? 'his notice' : 'your offer'})`);
  for (const id of ['scCourse', 'scMsg', 'scTable', 'scBets', 'scPressBox', 'scBtns']) {
    const el = $(id) || sc.querySelector(`#${id}`); if (!el) continue;
    const b = box(el), vis = getComputedStyle(el).display !== 'none' && b.h > 0;
    out.push(`  ${id.padEnd(11)} ${vis ? `${String(b.h).padStart(4)} px · ${b.bottom <= Math.min(H, box(sc).bottom) + 1 && b.top >= 0 ? 'on screen' : 'NOT on screen'}` : 'hidden'}`);
  }
  return out.join('\n');
})()
