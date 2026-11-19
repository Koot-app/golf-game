// Regression: a fresh career plays three hustler matches (forced scores) and abandons a fourth; prints the handicap after
// each. Run against the dev server:  node tools/test/probe.js http://127.0.0.1:8090/ - @tools/test/regress-handicap.js
// Expected: no PROBLEMS; three "Round recorded" lines; the abandoned match doesn't add a round (rounds stays 3).
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 50 && !window.__golf; i++) await sleep(200);
  localStorage.clear(); window.confirm = () => true;
  const g = window.__golf, log = [];
  const key = (c) => window.dispatchEvent(new KeyboardEvent('keydown', { code: c, key: c, bubbles: true }));
  const kpi = () => document.getElementById('chHcp').textContent;
  document.getElementById('hmGuest').click(); await sleep(100); document.querySelector('[data-h=career]').click(); await sleep(100);
  document.getElementById('chName').value = 'TESTER'; document.getElementById('chCreate').click(); await sleep(150);
  g.career.cash = 2000;
  log.push('fresh: handicap shows "' + kpi() + '"');
  // play a whole match: each hole par + over (an array of 9 "over par" numbers)
  async function round(overs, tier = 1) {
    g.career.tier = tier; g.career.tierMax = Math.max(g.career.tierMax, tier);
    if (!document.getElementById('clubhouse').classList.contains('on')) key('KeyJ');
    document.getElementById('chMatchBtn').click(); key('Enter'); key('Enter');
    g.career.match.toss = 'me'; g.closeToss();
    let last = '';
    for (let i = 0; i < 9; i++) {
      g.npc.done = true;
      g.hp.strokes = g.HOLES[i].par + overs[i]; g.hp.putts = 2; g.finishHole();
      last = document.getElementById('scMsg').textContent;
      if (i < 8) g.scorecardNext();
    }
    document.getElementById('scClose').click(); await sleep(100);
    return last.split('\n').filter((l) => /handicap|Round recorded/.test(l)).join(' ');
  }
  log.push('round 1 (+12): ' + await round([2, 1, 1, 2, 1, 2, 1, 1, 1]) + ' | kpi ' + kpi());
  log.push('round 2 (+9): ' + await round([1, 1, 1, 1, 1, 1, 1, 1, 1]) + ' | kpi ' + kpi());
  log.push('round 3 at the resort (+9, rating 1.5): ' + await round([1, 1, 1, 1, 1, 1, 1, 1, 1], 2) + ' | kpi ' + kpi());
  // a match abandoned after 4 holes doesn't count
  if (!document.getElementById('clubhouse').classList.contains('on')) key('KeyJ');
  document.getElementById('chMatchBtn').click(); key('Enter'); key('Enter'); g.career.match.toss = 'me'; g.closeToss();
  for (let i = 0; i < 4; i++) { g.npc.done = true; g.hp.strokes = 4; g.hp.putts = 2; g.finishHole(); g.scorecardNext(); }
  key('KeyH');
  log.push('abandoned: rounds ' + g.career.rounds.length + ' | kpi after reopening ' + (key('KeyJ'), kpi()));
  log.push('tooltip: ' + document.getElementById('chHcpBox').title.replace(/\n/g, ' | '));
  return log.join('\n');
})()
