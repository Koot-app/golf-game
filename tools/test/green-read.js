// The green read card (user request, 2026-11-20): on a hole, G toggles a card with the hole's green from above. It opens
// by itself once the green is in reach, stays closed on a hole once closed, and its detail follows Perception.
//   node tools/test/probe.js "http://127.0.0.1:8090/?nohome" <shot|-> @tools/test/green-read.js "window.__per = 5" green-read
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 50 && !window.__golf; i++) await sleep(200);
  const g = window.__golf, YD = 0.9144, st = g.state, out = [], $ = (id) => document.getElementById(id);
  const key = (c) => document.body.dispatchEvent(new KeyboardEvent('keydown', { code: c, key: c, bubbles: true }));
  const shown = () => getComputedStyle($('greenCard')).display !== 'none';
  st.perception = window.__per || 5;
  g.selectHole(window.__hole || 0); g.enterHole(); await sleep(500);
  out.push(`hole ${g.hp.holeIdx + 1}, on the tee, ${(Math.hypot(g.hole.pin.x - g.hp.ball.x, g.hole.pin.z - g.hp.ball.z) / YD).toFixed(0)} yds out: card ${shown() ? 'shown' : 'hidden'} (in reach ${g.greenInReach()})`);
  key('KeyG'); await sleep(100); out.push(`G: ${shown() ? 'shown' : 'hidden'}`);
  key('KeyG'); await sleep(100); out.push(`G again: ${shown() ? 'shown' : 'hidden'}`);
  // move the ball to 150 yds short of the pin, as after a drive
  const pin = g.hole.pin, d0 = Math.atan2(pin.x, -pin.z), back = (window.__back || 150) * YD;
  g.hp.ball = { x: pin.x - Math.sin(d0) * back, z: pin.z + Math.cos(d0) * back }; g.hp.onTee = false; g.hp.grUser = null; g.setupNextShot(); await sleep(400);
  out.push(`${window.__back || 150} yds out (a new shot, not closed on this hole): card ${shown() ? 'shown' : 'hidden'}`);
  out.push(`text: ${$('grText').innerText.replace(/\n/g, ' | ')}`);
  return out.join('\n');
})()
