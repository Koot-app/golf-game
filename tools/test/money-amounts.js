// Audit section 1: are hustler matches paid the right amount, exactly once? Plays random matches (match play with
// presses, and skins), all 9 holes each (so "play on" after an early finish is covered), and compares the cash movement
// with an independent calculation from the hole scores. Then one loan-shark case.
//   node tools/test/probe.js http://127.0.0.1:8090/ - @tools/test/money-amounts.js 0 audit-amounts
// Expected: "mismatches: 0" and the loan-shark line showing cash 0 and one snapped club.
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms)), $ = (id) => document.getElementById(id);
  for (let i = 0; i < 50 && !window.__golf; i++) await sleep(200);
  localStorage.clear(); window.confirm = () => true; const g = window.__golf, FEE = 10, bad = [], seen = { match: 0, skins: 0, early: 0, presses: 0, hisPresses: 0, carries: 0, halved: 0 };
  const key = (c) => window.dispatchEvent(new KeyboardEvent('keydown', { code: c, key: c, bubbles: true }));
  $('hmGuest').click(); await sleep(150); document.querySelector('[data-h=career]').click(); await sleep(200);
  $('chName').value = 'TESTER'; $('chCreate').click(); await sleep(300);
  // the reference: every bet decided when it can't be caught, else on the last hole; skins with carry-overs
  const refNet = (m) => {
    const H = m.holes, sgn = (h) => (h.me < h.npc ? 1 : h.me > h.npc ? -1 : 0);
    if (m.format === 'skins') { let net = 0, carry = 1; for (const h of H) { const s = sgn(h); if (s) { net += s * carry * m.stake; carry = 1; } else carry++; } return net; }
    return [{ from: 0, stake: m.stake }, ...m.presses].reduce((t, b) => {
      let d = 0;
      for (let i = b.from; i < 9; i++) { d += sgn(H[i]); if (Math.abs(d) > 8 - i) break; }
      return t + Math.sign(d) * b.stake;
    }, 0);
  };
  async function tee(format, stake) {
    if (!$('clubhouse').classList.contains('on')) key('KeyJ');
    await sleep(120); document.querySelector('[data-go=match]').click(); await sleep(150);
    document.querySelector(`#cmFmt [data-fmt=${format}]`).click(); await sleep(60);
    const st = $('cmStake'); st.value = stake; st.dispatchEvent(new Event('input', { bubbles: true })); await sleep(60);
    $('cmGo').click(); await sleep(400); $('riStart').click();
    const m = g.career.match;
    for (let k = 0; k < 40 && !g.tossOpen; k++) await sleep(50);      // the tee toss: you have the honour
    m.toss = 'me'; g.closeToss(); await sleep(150);
    return m;
  }
  async function leave() {
    await sleep(650);
    if ($('outcome').classList.contains('on')) $('ocCard_home').click(); else $('scClose').click();
    await sleep(250);
  }
  for (let n = 0; n < 24; n++) {
    g.career.cash = 100000; g.careerSave();
    const format = n % 2 ? 'skins' : 'match', hist0 = g.career.history.length;
    const m = await tee(format, 20), cash0 = g.career.cash;          // (after the green fee)
    let settledAt = -1, cashAtSettle = 0;
    for (let i = 0; i < 9; i++) {
      g.npc.done = true; g.hp.strokes = Math.max(1, g.HOLES[i].par + Math.floor(Math.random() * 4) - (n % 4 < 2 ? 0 : 1));   /* half the matches: a worse golfer, so you're the one who can press */ g.hp.putts = 1; g.finishHole(); await sleep(30);
      if (m.settled && settledAt < 0) { settledAt = i; cashAtSettle = g.career.cash; }
      if (!m.settled && $('scPressBox').classList.contains('on') && !$('scPressBox').classList.contains('his') && Math.random() < 0.7) { $('scPress').click(); await sleep(30); }
      if (i < 8) { g.scorecardNext(); await sleep(90); }
    }
    if (m.holes.filter(Boolean).length < 9) { bad.push(`#${n} ${format}: only holes ${m.holes.map((h, k) => (h ? k + 1 : '-')).join('')} recorded (on hole ${g.hp.holeIdx + 1}, round ${g.round.on ? 'on' : 'off'}, same match ${g.round.match === m}, presses ${JSON.stringify(m.presses)})`); await leave(); continue; }
    const want = refNet(m), got = cashAtSettle - cash0;
    seen[format]++; if (settledAt < 8) seen.early++; seen.presses += m.presses.filter((p) => p.by === 'me').length; seen.hisPresses += m.presses.filter((p) => p.by === 'npc').length;
    if (format === 'skins' && m.holes.some((h) => h.me === h.npc)) seen.carries++; if (!want) seen.halved++;
    const why = [];
    if (got !== want) why.push(`paid ${got}, should be ${want}`);
    if (m.net !== want) why.push(`m.net ${m.net}`);
    if (g.career.cash !== cashAtSettle) why.push(`cash moved again after settling: ${g.career.cash - cashAtSettle}`);
    if (g.career.history.length !== hist0 + 1) why.push(`history entries added: ${g.career.history.length - hist0}`);
    if (100000 - FEE !== cash0) why.push(`green fee: ${100000 - cash0}`);
    if (why.length) bad.push(`#${n} ${format} presses ${JSON.stringify(m.presses)} holes ${m.holes.map((h) => h.me + '/' + h.npc).join(' ')}: ${why.join('; ')}`);
    await leave();
    if (g.career.match) bad.push(`#${n}: career.match not cleared after leaving`);
  }
  // the loan shark: lose a $20 match with $5 in your pocket
  const m = await tee('match', 20); g.career.cash = 5; const snapped0 = g.career.snapped.length;
  for (let i = 0; i < 9 && !m.settled; i++) { g.npc.done = true; g.hp.strokes = g.HOLES[i].par + 5; g.hp.putts = 2; g.finishHole(); await sleep(30); if (!m.settled) { g.scorecardNext(); await sleep(90); } }
  await sleep(1800);
  const shark = `loan shark: owed 20 with $5 -> net ${m.net}, unpaid ${m.unpaid}, cash ${g.career.cash}, clubs snapped ${g.career.snapped.length - snapped0}, beating on screen ${$('beating').classList.contains('on')}`;
  // already below zero (a bad sync could do it): losing wipes the old debt too, and cash ends at 0, not below
  $('btGo').click(); await sleep(400); await leave();
  const m2 = await tee('match', 20); g.career.cash = -450;
  for (let i = 0; i < 9 && !m2.settled; i++) { g.npc.done = true; g.hp.strokes = g.HOLES[i].par + 5; g.hp.putts = 2; g.finishHole(); await sleep(30); if (!m2.settled) { g.scorecardNext(); await sleep(90); } }
  await sleep(300);
  const neg = `already −$450, lose $20 -> unpaid ${m2.unpaid} (want 470), cash ${g.career.cash} (want 0)`;
  return `matches ${JSON.stringify(seen)}\nmismatches: ${bad.length}\n${bad.join('\n')}\n${shark}\n${neg}`;
})()
