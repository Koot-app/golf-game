// Headless-Chrome probe: load the game, run a script in the page, print its result, optionally save a screenshot.
//
//   node tools/test/probe.js <url> <shotName|-> <expr|@file.js> [setup expr|@file.js] [profileName]
//
//   e.g. node tools/test/probe.js http://127.0.0.1:8090/ smoke @tools/test/smoke.js
//
// <expr> is evaluated in the page (it may be an async IIFE; its resolved value is printed). Screenshots go to
// tools/test/out/<shotName>.png (git-ignored). Uncaught page errors are printed under PROBLEMS. Each profileName gets its
// own Chrome profile (localStorage) in the OS temp folder, so two probes can keep separate saves.
// Needs Node 22+ (global fetch and WebSocket) and Chrome at the usual Windows path (or set CHROME=path).
const fs = require('fs'), os = require('os'), path = require('path'), { spawn } = require('child_process');
const rd = (a) => {
  if (!a || !a.startsWith('@')) return a;
  const p = [path.resolve(a.slice(1)), path.join(__dirname, a.slice(1))].find((x) => fs.existsSync(x));
  if (!p) throw new Error('no such script: ' + a.slice(1));
  return fs.readFileSync(p, 'utf8');
};
const [url, shotName, exprA, setupA, prof] = process.argv.slice(2), expr = rd(exprA), setup = rd(setupA);
const CHROME = process.env.CHROME || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9355, sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${path.join(os.tmpdir(), 'golf-probe-' + (prof || 'default'))}`, '--window-size=1600,900', '--enable-unsafe-swiftshader', '--no-first-run', 'about:blank'], { stdio: 'ignore' });
  let target;
  for (let i = 0; i < 200 && !target; i++) { await sleep(250); try { target = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find((t) => t.type === 'page'); } catch { } }
  const ws = new WebSocket(target.webSocketDebuggerUrl); await new Promise((r) => ws.addEventListener('open', r));
  let id = 0; const pending = new Map(), problems = [];
  ws.addEventListener('message', (e) => { const d = JSON.parse(e.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d.result || d); pending.delete(d.id); } if (d.method === 'Runtime.exceptionThrown') problems.push(d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text); });
  const send = (method, params = {}) => new Promise((r) => { pending.set(++id, r); ws.send(JSON.stringify({ id, method, params })); });
  const ev = async (x) => { const r = await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) problems.push('EVAL ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text)); return r.result?.value; };
  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url });
  for (let i = 0; i < 40; i++) { await sleep(300); if (await ev('!!window.__golf')) break; }
  await sleep(500);
  if (setup) { await ev(setup); await sleep(1800); }
  if (expr && expr !== '-') console.log(await ev(expr));
  if (shotName && shotName !== '-') {
    const out = path.join(__dirname, 'out'); fs.mkdirSync(out, { recursive: true });
    fs.writeFileSync(path.join(out, shotName + '.png'), Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
  }
  if (problems.length) console.log('PROBLEMS:\n' + problems.join('\n'));
  ws.close(); chrome.kill(); process.exit(0);
})();
