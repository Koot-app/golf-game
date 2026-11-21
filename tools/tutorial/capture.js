// HOW TO PLAY's pictures (TUTORIAL_PLAN.md): each slide's screenshot, taken from the game itself and saved as
// tutorial/<id>.webp (served with the game; tools/ is not). Run it after any change to how the swing guide, the greens or
// the cards look.
//
//   the dev server first:                       node tools/test/devserver.js 8090
//   node tools/tutorial/capture.js              every picture
//   node tools/tutorial/capture.js putt-03 ...  just those (a prefix works too: putt- for all of putting)
//
// Each picture: a fresh page (nothing saved), "Play as a guest", the arcade's practice area for its lesson (stats all 8,
// the arcade bag: what a new player gets from the home screen), then its stage in tools/tutorial/stages.js sets the scene
// and says what to keep ({ clip: [x, y, w, h] } in the 1600 × 900 window, or the whole window). It prints each file's size
// and the stage's own note (what the shot did), so the wording can be checked against the game: the wording changes,
// never the game (the user, 2026-11-21). Never point it at the live site.
// Needs Node 22+ and Chrome (or set CHROME=path). The window is 1600 × 900 (TUT_SIZE=WxH to change it).
const fs = require('fs'), os = require('os'), path = require('path'), { spawn } = require('child_process');
const BASE = process.env.TUT_BASE || 'http://127.0.0.1:8090/';
const CHROME = process.env.CHROME || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9356, sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// the window: 1600 × 900, so the game's panels (fixed in px) leave more of the green and the course showing; every
// picture is saved 1280 px wide (OUT_W), a crop scaled up to it
const [W, H] = (process.env.TUT_SIZE || '1600x900').split('x').map(Number), OUT_W = 1280;
const OUT = path.join(__dirname, '..', '..', 'tutorial');
const STAGES = fs.readFileSync(path.join(__dirname, 'stages.js'), 'utf8');
if (/^https?:\/\/(?!127\.0\.0\.1|localhost)/.test(BASE)) { console.error('Local dev server only (TUT_BASE)'); process.exit(1); }

(async () => {
  try { await fetch(BASE); } catch { console.error(`No dev server at ${BASE}: node tools/test/devserver.js 8090`); process.exit(1); }
  const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${path.join(os.tmpdir(), 'golf-tutorial-capture')}`,
    `--window-size=${W},${H}`, '--enable-unsafe-swiftshader', '--no-first-run', 'about:blank'], { stdio: 'ignore' });
  let target;
  for (let i = 0; i < 200 && !target; i++) { await sleep(250); try { target = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find((t) => t.type === 'page'); } catch { } }
  const ws = new WebSocket(target.webSocketDebuggerUrl); await new Promise((r) => ws.addEventListener('open', r));
  let id = 0; const pending = new Map(), problems = [];
  ws.addEventListener('message', (e) => { const d = JSON.parse(e.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d.result || d); pending.delete(d.id); } if (d.method === 'Runtime.exceptionThrown') problems.push(d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text); });
  const send = (method, params = {}) => new Promise((r) => { pending.set(++id, r); ws.send(JSON.stringify({ id, method, params })); });
  const ev = async (x) => { const r = await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) problems.push('EVAL ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text)); return r.result?.value; };
  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  const load = async () => { await send('Page.navigate', { url: BASE }); for (let i = 0; i < 60; i++) { await sleep(250); if (await ev('!!window.__golf')) break; } await sleep(400); };

  await load();
  const all = await ev(`${STAGES}; Object.keys(window.__tutStages)`);
  const want = process.argv.slice(2), ids = want.length ? all.filter((k) => want.some((w) => k === w || k.startsWith(w))) : all;
  if (!ids.length) { console.error(`Nothing matches ${want.join(' ')}. Stages: ${all.join(' ')}`); process.exit(1); }
  fs.mkdirSync(OUT, { recursive: true });
  let total = 0;
  for (const k of ids) {
    problems.length = 0;
    await ev('localStorage.clear()'); await load();
    const r = await ev(`${STAGES}; window.__tutRun(${JSON.stringify(k)})`);
    if (!r || r.error) { console.log(`${k.padEnd(10)} FAILED ${r ? r.error : '(no result)'}${problems.length ? `\n   ${problems.join('\n   ')}` : ''}`); continue; }
    await sleep(r.wait || 250);
    const [cx, cy, cw, ch] = r.clip || [0, 0, W, H];
    const shot = await send('Page.captureScreenshot', { format: 'webp', quality: 82, clip: { x: cx, y: cy, width: cw, height: ch, scale: OUT_W / cw } });
    const buf = Buffer.from(shot.data, 'base64'), file = path.join(OUT, `${k}.webp`);
    fs.writeFileSync(file, buf); total += buf.length;
    console.log(`${k.padEnd(10)} ${(buf.length / 1024).toFixed(0).padStart(4)} KB  ${r.note || ''}${r.marks ? `\n   marks (paste into the slide): ${JSON.stringify(r.marks)}` : ''}${problems.length ? `\n   PROBLEMS: ${problems.join(' | ')}` : ''}`);
  }
  console.log(`${ids.length} picture(s), ${(total / 1024).toFixed(0)} KB in ${path.relative(process.cwd(), OUT)}`);
  ws.close();
  try {
    const bw = new WebSocket((await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json()).webSocketDebuggerUrl);
    await new Promise((r) => bw.addEventListener('open', r));
    const gone = new Promise((r) => chrome.on('exit', r));
    bw.send(JSON.stringify({ id: 1, method: 'Browser.close' }));
    await Promise.race([gone, sleep(8000)]);
  } catch { /* fall through */ }
  chrome.kill(); process.exit(0);
})();
