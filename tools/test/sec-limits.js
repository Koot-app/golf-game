// Fixes 3.3 and 3.7: the sign-up limit per address, the limit on wrong passwords per profile, and changing a password.
// Needs a dev server started with a low sign-up limit (the normal one raises it for the other tests):
//   (PowerShell)  $env:GOLF_SIGNUPS_PER_IP='3'; node tools/test/devserver.js 8091
//   node tools/test/sec-limits.js http://127.0.0.1:8091
// Each request says which address it comes from (X-Forwarded-For, which the dev server and Vercel both read), so the
// per-address limits can be told apart from the per-profile one.
const BASE = process.argv[2] || 'http://127.0.0.1:8091';
if (!/^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(BASE)) { console.error('Dev server only.'); process.exit(1); }
const P = async (from, token, action, body = {}) => {
  const r = await fetch(BASE + '/api/profile', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': from, ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify({ action, ...body }) });
  let d = {}; try { d = await r.json(); } catch { /* not JSON */ }
  return { status: r.status, ...d };
};
const career = (name) => ({ v: 1, name, cash: 150, rep: 0, tier: 1, tierMax: 1, stats: { power: 2, dex: 2, composure: 2, perception: 2 }, history: [], rounds: [] });
const tag = Date.now() % 1e6, out = [], say = (ok, t) => out.push(`${(ok ? 'ok' : 'FAIL').padEnd(5)} ${t}`);
(async () => {
  // ---- 3.3: sign-ups per address per day (3 on this server)
  const codes = [];
  for (let i = 0; i < 4; i++) codes.push((await P('10.0.0.1', null, 'signup', { name: `L${i}x${tag}`, password: 'testpass1', career: career(`L${i}x${tag}`) })).status);
  const other = await P('10.0.0.2', null, 'signup', { name: `Lz${tag}`, password: 'testpass1', career: career(`Lz${tag}`) });
  say(codes.join(' ') === '200 200 200 429' && other.status === 200, `four new profiles from one address -> ${codes.join(' ')}; from another address -> ${other.status}`);
  // ---- 3.7: wrong passwords for one profile, each from a different address: locked after 10, even with the right one
  const name = `L0x${tag}`, wrong = [];
  for (let i = 0; i < 10; i++) wrong.push((await P(`10.1.0.${i}`, null, 'login', { name, password: 'nope' + i })).status);
  const right = await P('10.2.0.1', null, 'login', { name, password: 'testpass1' });
  const elsewhere = await P('10.2.0.2', null, 'login', { name: `L1x${tag}`, password: 'testpass1' });
  say(wrong.every((s) => s === 401) && right.status === 429 && elsewhere.status === 200, `10 wrong passwords for one profile from 10 addresses -> ${wrong.join(' ')}; then the right one -> ${right.status} "${right.error || ''}"; another profile still signs in -> ${elsewhere.status}`);
  // ---- 3.7: changing a password
  const me = elsewhere.token;
  const bad = await P('10.3.0.1', me, 'password', { old: 'wrongold', password: 'newpass12' });
  const short = await P('10.3.0.1', me, 'password', { old: 'testpass1', password: 'short' });
  const good = await P('10.3.0.1', me, 'password', { old: 'testpass1', password: 'newpass12' });
  const oldIn = await P('10.3.0.2', null, 'login', { name: `L1x${tag}`, password: 'testpass1' });
  const newIn = await P('10.3.0.3', null, 'login', { name: `L1x${tag}`, password: 'newpass12' });
  say(bad.status === 401 && short.status === 400 && good.status === 200 && oldIn.status === 401 && newIn.status === 200,
    `change the password: the wrong current one -> ${bad.status}; a new one too short -> ${short.status}; right -> ${good.status}; then the old one -> ${oldIn.status}, the new one -> ${newIn.status}`);
  console.log(out.join('\n'));
})().catch((e) => { console.log(out.join('\n')); console.error('STOPPED:', e); });
