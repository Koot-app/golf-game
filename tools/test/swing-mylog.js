// Swing audit S1: log your own swings, to replace the audit's estimates of a human hand with real numbers.
// How: open the game, press F12, paste this whole file into the Console and press Enter. Then hit about 20 full swings
// on the range, trying for a straight, stock 100% shot each time. After each swing it prints that swing's numbers and
// the running average and spread. Copy the last "AFTER n SWINGS" block into the next audit session (S6 uses it).
// It only reads the game's own swing numbers (window.__golf.telemetry); it changes nothing. Reload the page to stop it.
(() => {
  const g = window.__golf, rows = [];
  if (!g) return console.log('The game is not loaded on this page.');
  let last = g.telemetry;
  const stat = (a) => { const m = a.reduce((s, v) => s + v, 0) / a.length, sd = Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / a.length); return `${m.toFixed(2)} ± ${sd.toFixed(2)}`; };
  setInterval(() => {
    const t = g.telemetry;
    if (!t || t === last || !t.sw) return;
    last = t;
    const s = t.sw, r = { backswing: s.bs * 100, tempo: s.ds * 100, path: s.thetaMouse, wobble: s.sigma, miss: s.miss * 100 };
    rows.push(r);
    console.log(`swing ${rows.length}: backswing ${r.backswing.toFixed(1)}% · tempo ${r.tempo.toFixed(0)}% · path ${r.path.toFixed(1)}° · wobble ${r.wobble.toFixed(1)} px · miss ${r.miss.toFixed(1)}% of the swing length`);
    if (rows.length >= 3) console.log(`AFTER ${rows.length} SWINGS (average ± spread): backswing ${stat(rows.map((x) => x.backswing))}% · tempo ${stat(rows.map((x) => x.tempo))}% · path ${stat(rows.map((x) => x.path))}° · wobble ${stat(rows.map((x) => x.wobble))} px · miss ${stat(rows.map((x) => x.miss))}% · calibration ${g.state.cal.swingPx} counts, ${g.state.cal.vTarget.toFixed(1)} counts/ms`);
  }, 200);
  console.log('Logging swings. Hit about 20 full, straight shots on the range.');
})();
