// Audit 5: one screen, for a screenshot at a given window size. The screen comes from window.__view, set by the probe's
// setup argument:  PROBE_SIZE=1280x720 node tools/test/probe.js http://127.0.0.1:8090/ ui5-shop-1280 @tools/test/ui-shots.js "window.__view='shop'" audit-shots
// Views: card (a match's scorecard mid-round), payoff, shop, bag, trophy. Prints whether the screen's panel fits.
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms)), $ = (id) => document.getElementById(id);
  for (let i = 0; i < 50 && !window.__golf; i++) await sleep(200);
  localStorage.clear(); window.confirm = () => true; const g = window.__golf, view = window.__view || 'card';
  const key = (c) => window.dispatchEvent(new KeyboardEvent('keydown', { code: c, key: c, bubbles: true }));
  $('tossPopup') && ($('tossPopup').style.display = 'none');
  $('hmGuest').click(); await sleep(150); document.querySelector('[data-h=career]').click(); await sleep(200);
  $('chName').value = 'TESTER'; $('chCreate').click(); await sleep(300);
  g.career.cash = 5000; g.careerSave();
  let panel = null;
  if (view === 'shop' || view === 'bag' || view === 'trophy') {
    document.querySelector(`[data-go=${view === 'bag' ? 'bagroom' : view}]`).click(); await sleep(600);
    panel = { shop: 'chShop', bag: 'chBagRoom', trophy: 'chTrophy' }[view];
  } else {
    document.querySelector('[data-go=match]').click(); await sleep(300);
    $('cmGo').click(); await sleep(500); $('riStart').click();
    for (let k = 0; k < 40 && !g.tossOpen; k++) await sleep(50);
    const m = g.career.match; m.toss = 'me'; g.closeToss(); await sleep(200);
    const n = view === 'payoff' ? 9 : 4;
    for (let i = 0; i < n && !m.settled; i++) { g.npc.done = true; g.hp.strokes = Math.max(1, g.npcHoleScore(m, i) - (i === 0 && view === 'card' ? 2 : 1)); g.hp.putts = 2; g.finishHole(); await sleep(50); if (i < n - 1 && !m.settled) { g.scorecardNext(); await sleep(150); } }
    await sleep(1600);
    panel = view === 'payoff' ? 'ocCard' : 'scorecard';
  }
  await sleep(800);
  const el = $(panel) || document.querySelector(`#${panel}`);
  if (!el) return `no panel ${panel}`;
  const r = el.getBoundingClientRect(), W = innerWidth, H = innerHeight;
  const sc = el.scrollHeight > el.clientHeight + 2 ? ` · scrolls inside (${el.scrollHeight} of ${el.clientHeight})` : '';
  const off = [r.left < -1 && 'left', r.top < -1 && 'top', r.right > W + 1 && 'right', r.bottom > H + 1 && 'bottom'].filter(Boolean);
  return `${view} at ${W}×${H}: panel ${Math.round(r.width)}×${Math.round(r.height)} at (${Math.round(r.left)}, ${Math.round(r.top)})${off.length ? ` · CUT OFF: ${off.join(', ')}` : ' · fits'}${sc} · page scrolls ${document.documentElement.scrollHeight > H + 2 || document.documentElement.scrollWidth > W + 2}`;
})()
