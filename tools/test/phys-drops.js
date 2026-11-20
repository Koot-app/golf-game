// Audit 6: where an unplayable drop (U) can put the ball. From a ball in each greenside bunker, near the green, which
// lies do the three options give? (Under the real rules, relief from a bunker stays in the bunker unless you take an
// extra stroke; here the drop scores lies, best first.)
//   node tools/test/probe.js http://127.0.0.1:8090/?nohome - @tools/test/phys-drops.js 0 audit-drops
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 50 && !window.__golf; i++) await sleep(200);
  const g = window.__golf, out = [], tally = {};
  for (let h = 0; h < 9; h++) {
    g.selectHole(h); g.enterHole(); await sleep(300);
    const pin = g.hole.pin, found = [];
    // bunker spots within 25 m of the pin
    for (let r = 4; r < 25 && found.length < 6; r += 0.5) for (let a = 0; a < 360 && found.length < 6; a += 7) {
      const x = pin.x + r * Math.cos(a * Math.PI / 180), z = pin.z + r * Math.sin(a * Math.PI / 180);
      if (g.surfaceAt(x, z) === 'bunker' && !found.some((p) => Math.hypot(p.x - x, p.z - z) < 3)) found.push({ x, z });
    }
    for (const p of found) {
      g.hp.ball = { x: p.x, z: p.z }; g.hp.onTee = false; g.hp.lastFrom = { x: p.x, z: p.z + 30, tee: false };
      const o = g.dropOptions();
      const lat = o[1], back = o[2], outB = o[3];
      const key = `lateral → ${lat.lie} · back on the line → ${back.lie}${back.off ? ' (off)' : ''} · ${outB ? `out of the bunker (+${outB.pen}) → ${outB.lie}${outB.off ? ' (off)' : ''}` : 'no 4th option'}`;
      tally[key] = (tally[key] || 0) + 1;
      if (lat.lie === 'On the green' && found.indexOf(p) === 0) out.push(`hole ${h + 1}: from the bunker ${Math.hypot(p.x - pin.x, p.z - pin.z).toFixed(1)} m from the pin, the lateral drop is on the green, ${lat.toPin.toFixed(1)} m from the pin`);
    }
  }
  out.push('', 'from greenside bunkers (all holes):', ...Object.entries(tally).sort((a, b) => b[1] - a[1]).map(([k, v]) => `  ${String(v).padStart(3)} × ${k}`));
  // taking the fourth option (key 4) from a bunker costs two strokes; the card lists four
  g.selectHole(0); g.enterHole(); await sleep(300);
  const pin = g.hole.pin;
  let spot = null;
  for (let r = 4; r < 25 && !spot; r += 0.5) for (let a = 0; a < 360 && !spot; a += 7) { const x = pin.x + r * Math.cos(a * Math.PI / 180), z = pin.z + r * Math.sin(a * Math.PI / 180); if (g.surfaceAt(x, z) === 'bunker') spot = { x, z }; }
  g.hp.ball = { ...spot }; g.hp.onTee = false; g.hp.lastFrom = { x: spot.x, z: spot.z + 30, tee: false }; g.setupNextShot(); await sleep(200);
  const before = g.hp.strokes; g.openDrop(); await sleep(150);
  const listed = document.querySelectorAll('#dropOpts .drop-opt').length, help = document.querySelector('#dropCard .drop-help').textContent;
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Digit4', key: '4', bubbles: true })); await sleep(200);
  out.push('', `bunker drop card: ${listed} options · "${help}" · key 4: strokes ${before} → ${g.hp.strokes} · now on ${g.surfaceAt(g.hp.ball.x, g.hp.ball.z)} · toast "${document.getElementById('toast').textContent.split('\n')[0]}"`);
  return out.join('\n');
})()
