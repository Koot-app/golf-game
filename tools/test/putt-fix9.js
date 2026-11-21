// Putting audit PT10 (three screens named and scaled the putter's four bars differently): the bars now. See PUTTING_AUDIT_FINDINGS.md.
//   node tools/test/probe.js "http://127.0.0.1:8090/?nohome" - "@tools/test/putt-fix9.js" "1" putt-bars
// (the "1" is an empty setup expression: PowerShell drops an empty "" argument, which would shift the profile name into its place)
// 1 every putter's four bars from the one function (putterBars); 2 what the three screens actually draw: the putting green's
// putter card, the pro shop's putter tab and the bag screen. Parts of 2 need a career, so the probe makes a local one
// ("PROBE") in its own Chrome profile (the last argument above: nothing of yours is touched).
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 50 && !window.__golf; i++) await sleep(200);
  const g = window.__golf, out = [], P = g.PUTTERS;
  const bars = (root) => [...root.querySelectorAll('.sh-bar, .pt-stat')].map((b) => `${b.querySelector('span').textContent} ${Math.round(parseFloat(b.querySelector('i').style.width))}`).join(' · ');
  out.push('1 THE BARS, from putterBars (Stability / Start line / Sweet spot / Pace feel), with the numbers behind them');
  for (const [id, p] of Object.entries(P)) out.push(`   ${id.padEnd(11)} ${g.putterBars(p).map((b) => String(b.pct).padStart(3)).join(' / ')}   (gate ${p.gate}, start line ${p.pathGain}, sweet ${p.sweet} mm, tempo ±${p.tempoZone})`);
  out.push('   names: ' + g.putterBars(P.blade).map((b) => b.label).join(' · '));

  out.push('', '2 WHAT EACH SCREEN DRAWS');
  g.setMode('putt'); await sleep(400);
  out.push(`   putter card, practice green (${P[g.state.putter].name}): ${bars(document.getElementById('ptStats'))}`);
  try {
    document.getElementById('chName').value = 'PROBE'; g.createCareer(); await sleep(500);
    g.openShop(); await sleep(300);
    const tab = document.querySelector('[data-tab="putter"]'); if (tab) { tab.click(); await sleep(300); }
    const items = [...document.querySelectorAll('#shList .sh-item')];
    out.push(`   pro shop, putter tab (${items.length} putters):`);
    for (const it of items) out.push(`      ${it.querySelector('.sh-name b').textContent.replace('✦ ', '').slice(0, 34).padEnd(34)} ${bars(it)}`);
    g.openBagRoom(); await sleep(400);
    const models = [...document.querySelectorAll('#brList .br-model')], put = models.find((m) => [...m.querySelectorAll('em')].some((e) => e.textContent === 'Putter'));
    out.push(`   bag screen, the putter (${put ? put.querySelector('b').textContent : 'not found'}): ${put ? bars(put) : '—'}`);
    g.setMode('putt'); await sleep(400);
    out.push(`   putter card, in the career (${P[g.state.putter].name}): ${bars(document.getElementById('ptStats'))}`);
  } catch (e) { out.push('   (career screens failed: ' + e.message + ')'); }
  return out.join('\n');
})()
