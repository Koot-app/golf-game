// Swing audit fixes S1.1 (the whole downswing must be a swing) and S1.2 (the first swing calibrates): the re-measures.
// Run it in a fresh profile name (no saved calibration) to see S1.2's first-run step.
//   node tools/test/probe.js "http://127.0.0.1:8090/?nohome" - @tools/test/swing-fix6.js 0 swing-fix6-<new name>
// (S1.1's full table is section 10 of tools/test/swing-input.js.)
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 50 && !window.__golf; i++) await sleep(200);
  const g = window.__golf, S = g.state, out = [], f = (v, n = 0) => v.toFixed(n);
  // ---- S1.1: strokes through the real input path (practice on, no ball)
  S.practice = true;
  const run = (name, pts) => {
    g.beginSwing(true); let t = 1000, x = 0, y = 0;
    for (const [dt, nx] of pts) { const steps = Math.max(1, Math.round(dt / 4)); for (let k = 1; k <= steps; k++) { const tx = x + (nx - x) * (k / steps); g.swingSample(tx - (x + (nx - x) * ((k - 1) / steps)), 0, t += dt / steps); } x = nx; }
    const tel = g.telemetry; g.endSwing('silent');
    const sw = tel && tel.sw; out.push(`   ${name.padEnd(62)} ${sw ? `tempo ${f(sw.ds * 100)}% (at the ball ${f(sw.dsImpact * 100)}%, whole downswing ${f(Math.min(9.99, sw.dsWhole) * 100)}%), club speed ×${f(tel.res.clubSpeed / g.CLUBS[S.club].speed / g.powerMult(S.power), 3)}` : 'did not fire'}`);
  };
  S.club = 7; const cal = S.cal, top = -cal.swingPx, vT = cal.vTarget;
  out.push(`S1.1 THE DOWNSWING (7 iron, calibration ${cal.swingPx} counts / ${f(vT, 2)} counts/ms)`);
  // an ordinary swing: accelerating smoothly (constant acceleration: it averages half its impact speed)
  const accel = (ms) => { const n = 40, pts = []; for (let i = 1; i <= n; i++) pts.push([ms / n, top * (1 - (i / n) ** 2)]); pts.push([8, 30]); return pts; };
  run('an ordinary accelerating swing at full tempo', [[400, top], ...accel(2 * cal.swingPx / vT)]);
  run('the same, with a 300 ms pause at the top', [[400, top], [300, top], ...accel(2 * cal.swingPx / vT)]);
  run('a smooth swing that is 25% slower', [[400, top], ...accel(2 * cal.swingPx / vT / 0.75)]);
  run('crawl at 10% tempo, then full tempo for the last 20%', [[400, top], [0.8 * cal.swingPx / (0.1 * vT), top * 0.2], [0.2 * cal.swingPx / vT, 0], [8, 30]]);
  run('crawl at 5% tempo, then full tempo for the last 10%', [[400, top], [0.9 * cal.swingPx / (0.05 * vT), top * 0.1], [0.1 * cal.swingPx / vT, 0], [8, 30]]);
  S.practice = false;
  // ---- S1.2: the first swing ever (no saved calibration in this profile)
  out.push('', `S1.2 THE FIRST SWING (saved calibration in this profile: ${S.calSaved ? 'yes' : 'no'})`);
  const canvas = document.querySelector('canvas'); S.view = 'address';
  const down = () => canvas.dispatchEvent(new PointerEvent('pointerdown', { button: 0, bubbles: true, pointerId: 1 }));
  const toastTxt = () => (document.getElementById('toast') || {}).textContent || '';
  down(); await sleep(50);
  out.push(`   mouse down: calibrating ${S.calibrating}, the message: "${toastTxt().replace(/\s+/g, ' ').slice(0, 120)}"`);
  // a natural stroke: 1,260 counts back, through at 18 counts/ms
  if (g.swing.active) { let t = 5000; for (let i = 1; i <= 50; i++) g.swingSample(-1260 / 50, 0, t += 10); for (let i = 1; i <= 40; i++) g.swingSample(1300 / 40 * (2 * i - 1) / 40, 0, t += 3.5); }
  await sleep(50);
  out.push(`   after that swing: calibrating ${S.calibrating}, calibration ${S.cal.swingPx} counts / ${f(S.cal.vTarget, 1)} counts/ms, saved ${S.calSaved}, a ball launched: ${!!g.shot && !g.shot.done}`);
  out.push(`   the message: "${toastTxt().replace(/\s+/g, ' ').slice(0, 120)}"`);
  g.endSwing('silent'); await sleep(50); S.view = 'address';
  down(); await sleep(50);
  out.push(`   the next mouse down: calibrating ${S.calibrating} (offered once)`);
  g.endSwing('silent');
  return out.join('\n');
})()
