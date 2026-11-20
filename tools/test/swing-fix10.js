// Swing audit fixes S1.5 (the risk keeps rising past a 110% backswing) and S1.6 (a full swing needs a 20% backswing to
// fire; chips keep 8%): the re-measures. Practice mode on, so no ball is launched.
//   node tools/test/probe.js "http://127.0.0.1:8090/?nohome" - @tools/test/swing-fix10.js 0 swing-fix10
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 50 && !window.__golf; i++) await sleep(200);
  const g = window.__golf, YD = 0.9144, out = [], C = g.CLUBS, S = g.state;
  const f = (v, n = 0) => (v === null || v === undefined || Number.isNaN(v) ? '—' : v.toFixed(n));
  S.practice = true; S.club = 7; S.cal = { swingPx: 800, vTarget: 800 / 139 };
  // ---- S1.5: backswing past 110%
  out.push('S1.5 THE BACKSWING PAST 110% (debugSwing, 7 iron): backswing read · club speed × · over-swing risk (cx.power) · complexity at Dex 2 / 5 / 10');
  for (const back of [1.0, 1.05, 1.1, 1.2, 1.3, 1.4, 1.6]) {
    const cells = [];
    for (const dex of [2, 5, 10]) { S.dex = dex; const tel = g.debugSwing({ back }); g.endSwing('silent'); cells.push(f(tel.res.complexity, 2)); if (dex === 5) cells.unshift(`${f(tel.sw.bs * 100)}% · ×${f(tel.res.clubSpeed / C[7].speed, 3)} · ${f(tel.res.cx.power, 2)}`); }
    out.push(`   ${f(back * 100).padStart(3)}% back: ${cells[0]} · ${cells.slice(1).join(' / ')}`);
  }
  S.dex = 5;
  // ---- S1.6: small strokes
  const nudge = (counts) => { g.beginSwing(true); let t = 1000; for (let i = 1; i <= 10; i++) g.swingSample(-counts / 10, 0, t += 12); for (let i = 1; i <= 12; i++) g.swingSample((counts + 30) / 12, 0, t += 6); const fired = g.swing.iImp >= 0; g.endSwing('silent'); return fired; };
  out.push('', 'S1.6 SMALL STROKES (counts back, then through; 800 counts = 100%): does it fire?');
  for (const mode of ['range', 'chip']) {
    if (mode === 'chip') g.setMode('chip'); else if (S.mode !== 'range') g.setMode('range');
    await sleep(200); S.view = 'address'; S.practice = true;
    out.push(`   ${mode === 'range' ? 'a full swing' : 'a chip'}: ` + [20, 70, 100, 150, 165, 200, 300].map((c) => `${c} (${f(c / 8, 1)}%) ${nudge(c) ? 'fires' : 'no'}`).join(' · '));
  }
  g.setMode('range'); S.practice = false;
  return out.join('\n');
})()
