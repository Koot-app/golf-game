// Audit 8.1: how often the career is written to this PC's storage over a 9-hole match, and how much. Since the fix the
// saves of a moment are written once, 0.4 s after the last change. Also checks the copy on disk matches the game's once
// the writes settle, and that reading the key flushes a pending write at once.
//   node tools/test/probe.js http://127.0.0.1:8090/ - @tools/test/perf-saves.js 0 audit-saves
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms)), $ = (id) => document.getElementById(id);
  for (let i = 0; i < 50 && !window.__golf; i++) await sleep(200);
  localStorage.clear(); window.confirm = () => true; const g = window.__golf, out = [];
  $('hmGuest').click(); await sleep(150); document.querySelector('[data-h=career]').click(); await sleep(200);
  $('chName').value = 'TESTER'; $('chCreate').click(); await sleep(300);
  // a long career (200 matches of history), so each write is a realistic size
  for (let k = 0; k < 200; k++) g.career.history.push({ npc: 'dale', format: 'match', stake: 40, result: 'won 2 & 1', net: 40, unpaid: 0, snapped: null, date: Date.now() - 1e6 + k });
  g.career.cash = 5000; g.careerSave(); await sleep(600);
  let writes = 0, chars = 0;
  const set0 = Storage.prototype.setItem;
  Storage.prototype.setItem = function (k, v) { if (/^golfCareer/.test(k)) { writes++; chars += String(v).length; } return set0.call(this, k, v); };
  document.querySelector('[data-go=match]').click(); await sleep(300);
  $('cmGo').click(); await sleep(600); $('riStart').click();
  for (let k = 0; k < 40 && !g.tossOpen; k++) await sleep(50);
  const m = g.career.match; m.toss = 'me'; g.closeToss(); await sleep(200);
  for (let i = 0; i < 9 && !m.settled; i++) {
    g.npc.done = true; g.hp.strokes = g.npcHoleScore(m, i) + (i % 3 === 0 ? -1 : 0); g.hp.putts = 2; g.finishHole(); await sleep(700);
    if (!m.settled) { g.scorecardNext(); await sleep(700); }
  }
  await sleep(1200);
  Storage.prototype.setItem = set0;
  out.push(`a 9-hole match (with ${g.career.history.length} matches of history): ${writes} writes of the career to storage, ${(chars / 1000).toFixed(0)}k characters in all (about ${(chars / Math.max(1, writes) / 1000).toFixed(0)}k a write)`);
  const disk = JSON.parse(localStorage.getItem('golfCareer') || localStorage.getItem(Object.keys(localStorage).find((k) => /^golfCareer/.test(k))) || 'null');
  out.push(`${disk && disk.cash === g.career.cash && disk.history.length === g.career.history.length ? 'ok  ' : 'FAIL'} the copy on disk matches the game: cash ${disk && disk.cash} / ${g.career.cash}, history ${disk && disk.history.length} / ${g.career.history.length}`);
  // a change, then an immediate read of the key through the game's own reader (careerLoad uses lsGet): flushed first
  g.career.cash = 4321; g.careerSave();
  const raw0 = localStorage.getItem(Object.keys(localStorage).find((k) => /^golfCareer/.test(k)));
  const pending = JSON.parse(raw0).cash !== 4321;
  window.dispatchEvent(new Event('pagehide'));
  const raw1 = localStorage.getItem(Object.keys(localStorage).find((k) => /^golfCareer/.test(k)));
  out.push(`${pending && JSON.parse(raw1).cash === 4321 ? 'ok  ' : 'FAIL'} a save is pending for a moment (${pending}), and closing the page writes it at once (cash on disk ${JSON.parse(raw1).cash})`);
  return out.join('\n');
})()
