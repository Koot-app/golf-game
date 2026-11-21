// HOW TO PLAY (TUTORIAL_PLAN.md; user request, 2026-11-21): the lessons on the home screen. Every lesson, every slide:
// its pictures load (tutorial/<id>.webp), its marks sit on a picture, no more than three lines; the keys; Done back to
// the three; Esc back to the home screen with nothing behind reacting; "Try it" (not signed in: a message; as a guest:
// that practice area); the caddie tips' 📖 button opens the lesson for where you are. DEV server only.
//   node tools/test/probe.js http://127.0.0.1:8090/ - @tools/test/tutorial.js 0 tutorial
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms)), $ = (id) => document.getElementById(id);
  for (let i = 0; i < 50 && !window.__golf; i++) await sleep(200);
  localStorage.clear(); const g = window.__golf, out = [];
  const say = (ok, t) => out.push(`${(ok ? 'ok' : 'FAIL').padEnd(5)} ${t}`);
  const key = (code) => window.dispatchEvent(new KeyboardEvent('keydown', { code, key: code, bubbles: true }));
  const open = () => document.body.classList.contains('tut-on');
  // to a lesson's last slide (one more → would finish it)
  const toLast = async () => { const n = +$('tutPage').textContent.split('/')[1]; for (let i = 1; i < n; i++) key('ArrowRight'); await sleep(100); };
  g.openHome(); await sleep(600);
  if ($('home').classList.contains('menu')) { $('hmSwitch').click(); await sleep(400); }     // (signed out: this profile may remember a guest)
  const tiles = [...document.querySelectorAll('#hmLearnTiles [data-tut]')];
  say(tiles.length === 3 && $('hmLearn').classList.contains('new'), `the home screen's block: ${tiles.map((b) => b.querySelector('b').textContent).join(' · ')} · NEW tag ${$('hmLearn').classList.contains('new')}`);
  // every lesson, every slide
  for (const cat of ['swing', 'chip', 'putt']) {
    document.querySelector(`#hmLearnTiles [data-tut=${cat}]`).click(); await sleep(150);
    const n = +$('tutPage').textContent.split('/')[1], bad = [];
    let pics = 0, marks = 0;
    for (let p = 0; p < n; p++) {
      const imgs = [...document.querySelectorAll('#tutBody .tut-img img')];
      for (let k = 0; k < 40 && imgs.some((im) => !im.complete); k++) await sleep(50);
      for (const im of imgs) { pics++; if (!im.naturalWidth) bad.push(`${p + 1}: ${im.getAttribute('src')} did not load`); }
      const lines = document.querySelectorAll('#tutBody .tut-pts li').length;
      if (lines < 1 || lines > 3) bad.push(`${p + 1}: ${lines} lines`);
      for (const m of document.querySelectorAll('#tutBody .tut-mark')) {
        marks++;
        const x = parseFloat(m.style.left), y = parseFloat(m.style.top);
        if (!(x >= 0 && x <= 100 && y >= 0 && y <= 100)) bad.push(`${p + 1}: a mark off its picture (${x}, ${y})`);
        if (+m.textContent > lines) bad.push(`${p + 1}: mark ${m.textContent} with only ${lines} lines`);
      }
      if (document.querySelector('#tutBody .tut-ph[style*="grid"]')) bad.push(`${p + 1}: a "picture to come" panel showing`);
      if (p < n - 1) key('ArrowRight'); await sleep(60);
    }
    say(!bad.length, `${$('tutTitle').textContent}: ${n} slides, ${pics} pictures, ${marks} marks${bad.length ? ` · ${bad.join(' · ')}` : ''}`);
    key('Enter'); await sleep(150);                                                // Done on the last slide: back to the three
    say(open() && $('tut').classList.contains('cats') && document.querySelector(`#tutBody [data-tut=${cat}] .tc-n.done`), `Done: back to the three lessons, ${cat} marked done`);
    key('Escape'); await sleep(150);
  }
  // keys in the viewer: ← back, Home to the three, 1-3 open one; Esc closes and nothing behind moved
  document.querySelector('#hmLearnTiles [data-tut=chip]').click(); await sleep(100);
  key('ArrowRight'); key('ArrowRight'); key('ArrowLeft'); await sleep(80);
  const pg = $('tutPage').textContent;
  key('Home'); await sleep(80); const atCats = $('tut').classList.contains('cats');
  key('Digit3'); await sleep(80); const t3 = $('tutTitle').textContent;
  key('Escape'); await sleep(150);
  say(pg.startsWith('2 /') && atCats && /Putting/.test(t3) && !open() && g.homeOpen, `keys: → → ← to ${pg}, Home to the three ${atCats}, 3 opens "${t3}", Esc closes (home still open ${g.homeOpen})`);
  say(!$('hmLearn').classList.contains('new') && /✓ done/.test($('hmLearnTiles').textContent), `after: no NEW tag, the tiles say ✓ done`);
  // "Try it" before anyone's playing: a message, nothing opens
  document.querySelector('#hmLearnTiles [data-tut=putt]').click(); await sleep(100);
  await toLast();
  const tryShown = $('tutTry').offsetParent !== null, tryTxt = $('tutTry').textContent;
  $('tutTry').click(); await sleep(200);
  say(tryShown && !open() && g.homeOpen && /guest/.test($('hmErr').textContent), `"${tryTxt}" before signing in: "${$('hmErr').textContent}" (button shown ${tryShown}, lesson closed ${!open()}, home open ${g.homeOpen}, page was ${$('tutPage').textContent})`);
  // as a guest: it opens the arcade's putting green
  $('hmGuest').click(); await sleep(300);
  document.querySelector('#hmLearnTiles [data-tut=putt]').click(); await sleep(100);
  await toLast();
  $('tutTry').click(); await sleep(900);
  say(!g.homeOpen && g.state.mode === 'putt', `as a guest, Try it: home closed ${!g.homeOpen}, mode ${g.state.mode}`);
  // the caddie tips' button: the lesson for where you are, and no Try it (you're already playing)
  g.setTips(true); await sleep(200);
  $('tipsTut').click(); await sleep(200);
  const fromTips = $('tutTitle').textContent;
  await toLast();
  say(open() && /Putting/.test(fromTips) && !document.body.classList.contains('tips') && $('tutTry').offsetParent === null, `from the putting tips: "${fromTips}", the tips closed, no Try it on the last slide`);
  key('Escape'); await sleep(150);
  say(!open() && !g.homeOpen && g.state.mode === 'putt', 'Esc: back to the putting green');
  return out.join('\n');
})()
