// THE RANGE'S BAG (user request, 2026-11-21): outside a career the range, the chipping green and the putting green play
// the arcade's bag and stats (all 8), however you got there: the range behind the home screen, Esc off the home screen,
// the home screen's practice buttons, after an arcade round, after leaving a career. In a career (the clubhouse's
// range) it's your own bag and stats.
//   node tools/test/probe.js http://127.0.0.1:8090/ - @tools/test/range-bag.js 0 rangebag1
// (on the arcade site, node tools/test/devserver.js 8091 arcade, it checks the parts without a career)
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms)), $ = (id) => document.getElementById(id);
  for (let i = 0; i < 50 && !window.__golf; i++) await sleep(200);
  localStorage.clear(); window.confirm = () => true; const g = window.__golf, out = [];
  const key = (c) => window.dispatchEvent(new KeyboardEvent('keydown', { code: c, key: c, bubbles: true }));
  const say = (ok, t) => out.push(`${(ok ? 'ok' : 'FAIL').padEnd(5)} ${t}`);
  const st = () => `${g.state.power}/${g.state.dex}/${g.state.composure}/${g.state.perception}`;
  const bag = () => `${g.CLUBS[0].model || 'base'} · ${g.CLUBS[7].model || 'base'} · ${g.CLUBS[12].model || 'base'}`;
  const arcade = (where) => say(st() === '8/8/8/8' && bag() === 'd-g440k · i-qimax · w-cbx2', `${where}: stats ${st()}, bag ${bag()} · "${$('bagTitle').textContent}"`);
  const tour = !!$('hmGuest');
  if (!document.body.classList.contains('home-on')) { g.openHome(); await sleep(300); }
  arcade('the range behind the home screen, on load');
  if (tour) { $('hmGuest').click(); await sleep(200); }
  key('Escape'); await sleep(300);
  say(!document.body.classList.contains('home-on'), 'Esc closed the home screen');
  arcade('the range, after Esc');
  g.setMode('chip'); await sleep(300); arcade('the chipping green');
  g.setMode('putt'); await sleep(300); arcade('the putting green');
  g.setMode('range'); await sleep(200);
  key('KeyH'); await sleep(600); arcade('a hole from the range'); key('KeyH'); await sleep(400);
  // an arcade round, then back on the range
  g.openHome(); await sleep(300); $('hmArcPlay').click(); await sleep(400); key('Enter'); await sleep(600);
  arcade('in an arcade round');
  g.quitRound(); await sleep(400); if (document.body.classList.contains('home-on')) { key('Escape'); await sleep(300); }
  arcade('after leaving the arcade round');
  if (!tour) return out.join('\n');
  // a career: the clubhouse's range plays your own bag and stats
  g.openHome(); await sleep(300);
  document.querySelector('[data-h=career]').click(); await sleep(300);
  $('chName').value = 'Bag' + (Date.now() % 1e4); g.createCareer(); await sleep(500);
  document.querySelector('#clubhouse .ch-menu [data-go=range]').click(); await sleep(500);
  const cs = g.careerStats(), want = `${cs.power}/${cs.dex}/${cs.composure}/${cs.perception}`;
  say(g.careerOn && st() === want && g.CLUBS[0].model === g.career.bag[0], `the career's range: career on ${g.careerOn}, stats ${st()} (the career's ${want}), driver ${g.CLUBS[0].model} (the career's ${g.career.bag[0]})`);
  g.setMode('chip'); await sleep(300);
  say(st() === want && g.CLUBS[12].model === g.career.bag[12], `the career's chipping green: stats ${st()}, SW ${g.CLUBS[12].model}`);
  g.setMode('range'); await sleep(200);
  // leave the career: the arcade's again
  g.openClubhouse(); await sleep(300); $('chLeave').click(); await sleep(400);
  say(!g.careerOn, `left the career: toast "${$('toast').textContent.replace(/\n/g, ' / ')}"`);
  if (document.body.classList.contains('home-on')) { key('Escape'); await sleep(300); }
  arcade('the range after leaving the career');
  return out.join('\n');
})()
