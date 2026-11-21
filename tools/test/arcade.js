// ARCADE (user request, 2026-11-20): the home screen's arcade side. Nine holes on any of the three courses, the same
// stats and clubs for everyone, a Top 10 for each course. Checks: the home screen (no 9-hole tile on the career side,
// three courses on the arcade side); for each course a round played from the home screen (its holes, standard stats,
// the arcade's forgiving bag, its conditions) that goes on ITS board and no other; and the plain holes back afterwards,
// with the range still on the arcade's bag and stats (user request, 2026-11-21: outside a career it always is).
// DEV server only (it posts scores).
//   node tools/test/probe.js http://127.0.0.1:8090/ <shot|-> @tools/test/arcade.js 0 arcade
// (window.__shot = 1 stops on the home screen with the arcade side showing, for a screenshot)
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms)), $ = (id) => document.getElementById(id);
  for (let i = 0; i < 50 && !window.__golf; i++) await sleep(200);
  localStorage.clear(); window.confirm = () => true; const g = window.__golf, out = [];
  const key = (c) => window.dispatchEvent(new KeyboardEvent('keydown', { code: c, key: c, bubbles: true }));
  const board = async (c) => { const j = await (await fetch(`/api/leaderboard?holes=9${c > 1 ? `&course=${c}` : ''}`)).json(); return j.total; };
  g.openHome(); await sleep(300);
  // not picked who's playing yet: the arcade asks for that first
  $('hmArcPlay').click(); await sleep(100);
  out.push(`before picking a player: "${$('hmArcErr').textContent}" · home still open ${document.body.classList.contains('home-on')}`);
  $('hmGuest').click(); await sleep(200);
  out.push(`career side tiles: ${[...document.querySelectorAll('#hmMenu .hm-tiles button')].map((b) => b.querySelector('b').textContent.trim()).join(' | ')}`);
  out.push(`arcade side: ${[...document.querySelectorAll('#hmCourses button')].map((b) => `${b.querySelector('b').textContent} ${b.querySelector('em').firstChild.textContent} (${b.querySelector('i').textContent})${b.classList.contains('on') ? ' [picked]' : ''}`).join(' | ')}`);
  if (window.__shot) { document.querySelector('#hmCourses button[data-arc="3"]').click(); await sleep(900); return out.join('\n'); }
  const before = [await board(1), await board(2), await board(3)];
  let bagRows = [];
  for (const c of [1, 2, 3]) {
    if (!document.body.classList.contains('home-on')) { g.openHome(); await sleep(300); }
    document.querySelector(`#hmCourses button[data-arc="${c}"]`).click(); await sleep(500);
    const head = $('hmBoardH').textContent, btn = $('hmArcPlay').textContent;
    $('hmArcPlay').click(); await sleep(500);
    const intro = document.querySelector('#roundIntro .card-h span').textContent, tag = $('riTag').textContent;
    key('Enter'); await sleep(600);
    const st = g.state, pars = g.HOLES.map((h) => h.par);
    out.push('', `COURSE ${c}: button "${btn}" · board "${head}"`);
    out.push(`   preview "${intro}" (${tag})`);
    out.push(`   in the round: pars ${pars.join(',')} · hole 1 "${g.HOLE.desc}" stimp ${g.HOLE.stimp} wind ${g.HOLE.wind.mph} · stats ${st.power}/${st.dex}/${st.composure}/${st.perception} · career on ${g.careerOn} · driver ${g.CLUBS[0].model || 'base'} · title "${$('htCourse').textContent}"`);
    // the arcade's bag: the same forgiving set for everyone (ARCADE_BAG), with its carries against the range's clubs
    if (c === 1) {
      const M = g.CLUB_MODELS, name = (i) => (g.CLUBS[i].model && M[g.CLUBS[i].model] ? `${M[g.CLUBS[i].model].brand} ${M[g.CLUBS[i].model].name}` : 'BASE');
      out.push(`   bag title "${$('bagTitle').textContent}" · ${g.CLUBS.filter((_, i) => g.canUseClub(i)).length} clubs usable`);
      bagRows = g.CLUBS.map((cl, i) => (g.canUseClub(i) ? { i, n: cl.name, m: name(i), loft: cl.loft, carry: g.stockShot(i).carry, sweet: cl.sweet } : null)).filter(Boolean);
    }
    for (let i = 0; i < 9; i++) { g.hp.strokes = pars[i] + (i === c ? 1 : 0); g.hp.putts = 2; g.finishHole(); await sleep(60); if (i < 8) { g.scorecardNext(); await sleep(150); } }
    await sleep(400); key('Enter'); await sleep(1500);
    out.push(`   saved: "${$('lbNote').textContent}" · board title "${$('scTitle').textContent}" · buttons "${$('scNext').textContent}" | "${$('scClose').textContent}"`);
    $('scClose').click(); await sleep(400);                // (the finished round's second button: back to the home screen)
    out.push(`   after "Back to the home screen": home screen open ${document.body.classList.contains('home-on')} · round on ${g.round.on} · on a hole ${g.hp.on}`);
  }
  const after = [await board(1), await board(2), await board(3)];
  out.push('', `rounds on each course's board, before -> after: ${before.map((b, i) => `course ${i + 1}: ${b} -> ${after[i]}`).join(' · ')}`);
  out.push(`back on the range: pars ${g.HOLES.map((h) => h.par).join(',')} (the plain holes) · round on ${g.round.on}`);
  out.push('', 'THE ARCADE BAG at its stats (all 8) against the range\'s clubs at the standard 5 (stock full swing): loft · carry yds · sweet spot mm');
  for (const r of bagRows) { const b = g.CLUBS[r.i]; out.push(`   ${r.n.padEnd(15)} ${r.m.padEnd(38)} ${r.loft.toFixed(1).padStart(5)}° ${r.carry.toFixed(0).padStart(4)} ${r.sweet.toFixed(1).padStart(5)}   | range: ${b.model ? 'STILL A MODEL' : 'base'} ${b.loft.toFixed(1).padStart(5)}° ${g.stockShot(r.i).carry.toFixed(0).padStart(4)} ${b.sweet.toFixed(1).padStart(5)}`); }
  out.push(`   after the round, on the range: stats ${g.state.power}/${g.state.dex}/${g.state.composure}/${g.state.perception} · driver ${g.CLUBS[0].model || 'base'} · bag "${$('bagTitle').textContent}"`);
  // practice from the arcade side: the same bag and stats (user request); the career side has no practice tiles now
  g.openHome(); await sleep(300);
  out.push('', `career side tiles now: ${[...document.querySelectorAll('#hmMenu .hm-tiles button')].map((b) => b.querySelector('b').textContent.trim()).join(' | ')}`);
  for (const h of ['range', 'chip', 'putt']) {
    if (!document.body.classList.contains('home-on')) { g.openHome(); await sleep(300); }
    document.querySelector(`#hmArcPrac button[data-h="${h}"]`).click(); await sleep(400);
    out.push(`practice ${h}: mode ${g.state.mode} · stats ${g.state.power}/${g.state.dex}/${g.state.composure}/${g.state.perception} · driver ${g.CLUBS[0].model || 'base'} · 7 iron ${g.CLUBS[7].model || 'base'} · SW ${g.CLUBS[12].model || 'base'} · career on ${g.careerOn}`);
  }
  // a bad course is refused by the server
  const bad = await fetch('/api/leaderboard?holes=9&course=7'); out.push(`asking for course 7's board: ${bad.status}`);
  const wrong = await fetch('/api/leaderboard', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'AAA', strokes: 35, putts: 18, par: 35, holes: 9, course: 2, scores: [5, 3, 4, 4, 3, 5, 4, 3, 4] }) });
  out.push(`posting course 1's card (par 35) to course 2 (par 36): ${wrong.status} ${(await wrong.json()).error || ''}`);
  return out.join('\n');
})()
