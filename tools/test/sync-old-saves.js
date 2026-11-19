// Audit 2.7: careers saved by older versions of the game still load, and every clubhouse room opens.
//   node tools/test/probe.js http://127.0.0.1:8090/ - @tools/test/sync-old-saves.js 0 audit-old
// Each variant is put in this PC's storage as an old save would be, loaded, and walked through the rooms.
// Expected: every variant "ok" (no page errors), with its cash and name intact. (The probe also prints the page errors
// of the variants that fail, under PROBLEMS.)
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms)), $ = (id) => document.getElementById(id);
  for (let i = 0; i < 50 && !window.__golf; i++) await sleep(200);
  const g = window.__golf, errs = [], out = [];
  window.addEventListener('error', (e) => errs.push(e.message));
  const full = () => ({ v: 1, name: 'OLDIE', seed: 12345, cash: 777, rep: 12, tier: 1, stats: { power: 3, dex: 2, composure: 2, perception: 2 },
    bag: { 0: 'd-xr16', 3: 'h-xr', 5: 'i-ap1', 7: 'i-ap1', 9: 'i-ap1', 10: 'i-ap1', 12: 'w-sm6' }, snapped: [], putter: 'p-wh2', out: [], putters: ['p-wh2'],
    unlocks: { draw: false, fade: false, stinger: false, high: false, flop: false, spin: false }, match: null, history: [], rounds: [], pvpSeen: [], trophies: [], titles: [], created: 1, stamp: 1, tierMax: 1 });
  const without = (...keys) => { const c = full(); for (const k of keys) delete c[k]; return c; };
  const variants = {
    'today\'s shape': full(),
    'before the scorecard archive, luxury clubs, caddies, trophies': without('trophies', 'titles'),
    'before friends and handicaps (no rounds, pvpSeen, tierMax)': without('rounds', 'pvpSeen', 'tierMax', 'trophies', 'titles'),
    'before the pro shop (no out, putters)': without('out', 'putters', 'rounds', 'pvpSeen', 'tierMax', 'trophies', 'titles'),
    'before the coach (no unlocks)': without('unlocks', 'out', 'putters', 'rounds', 'pvpSeen', 'tierMax', 'trophies', 'titles'),
    'before the loan shark (no snapped)': without('snapped', 'unlocks', 'out', 'putters', 'rounds', 'pvpSeen', 'tierMax', 'trophies', 'titles'),
    'the first career save (no bag, putter)': without('bag', 'putter', 'snapped', 'unlocks', 'out', 'putters', 'rounds', 'pvpSeen', 'tierMax', 'trophies', 'titles', 'history'),
    'no reputation or seed': without('rep', 'seed'),
  };
  const key = (c) => window.dispatchEvent(new KeyboardEvent('keydown', { code: c, key: c, bubbles: true }));
  for (const [label, c] of Object.entries(variants)) {
    errs.length = 0;
    try {
      if ($('clubhouse').classList.contains('on')) { key('Escape'); await sleep(100); }
      if (!g.homeOpen) { g.openHome(); await sleep(150); }
      // forget the career in memory (as a fresh page would), put the old save in storage, load it
      const sw = $('hmSwitch'); if (g.career) { sw.click(); await sleep(300); }
      localStorage.clear(); localStorage.setItem('golfCareer_v1', JSON.stringify(c));
      $('hmGuest').click(); await sleep(150);
      document.querySelector('[data-h=career]').click(); await sleep(300);
      const loaded = !!g.career;
      for (const room of ['shop', 'coach', 'caddie', 'trophy', 'bagroom', 'match']) {
        if (!$('clubhouse').classList.contains('on')) { key('KeyJ'); await sleep(150); }
        const b = document.querySelector(`.ch-menu [data-go=${room}]`); if (b) b.click(); await sleep(200);
        key('Escape'); await sleep(120); if (!$('clubhouse').classList.contains('on')) { key('KeyJ'); await sleep(150); }
      }
      out.push(`${errs.length ? 'ERRORS' : loaded ? 'ok' : 'NOT LOADED'} · ${label}${loaded ? ` · ${g.career.name} $${g.career.cash}` : ''}${errs.length ? '\n   ' + [...new Set(errs)].slice(0, 4).join('\n   ') : ''}`);
    } catch (e) { out.push(`THREW · ${label}: ${e.message}`); }
  }
  return out.join('\n');
})()
