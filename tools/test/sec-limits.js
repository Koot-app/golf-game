// Fixes 3.3, 3.7 and 3.9: the sign-up limit per address, the limit on wrong passwords per profile, changing a password
// (any length: the player's choice) and the other sessions it signs out, a cap on challenges, and odd request bodies.
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
  const short = await P('10.3.0.1', me, 'password', { old: 'testpass1', password: '' });
  const good = await P('10.3.0.1', me, 'password', { old: 'testpass1', password: 'newpass12' });
  const oldIn = await P('10.3.0.2', null, 'login', { name: `L1x${tag}`, password: 'testpass1' });
  const newIn = await P('10.3.0.3', null, 'login', { name: `L1x${tag}`, password: 'newpass12' });
  say(bad.status === 401 && short.status === 400 && good.status === 200 && oldIn.status === 401 && newIn.status === 200,
    `change the password: the wrong current one -> ${bad.status}; an empty new one -> ${short.status}; right -> ${good.status}; then the old one -> ${oldIn.status}, the new one -> ${newIn.status}`);
  // ---- 3.9: changing the password signs the profile's other sessions out (this one stays)
  const pc2 = await P('10.4.0.1', null, 'login', { name: `L1x${tag}`, password: 'newpass12' });
  const pc3 = await P('10.4.0.2', null, 'login', { name: `L1x${tag}`, password: 'newpass12' });
  const ch2 = await P('10.4.0.3', pc2.token, 'password', { old: 'newpass12', password: 'third-pass' });
  const still = (await P('10.4.0.4', pc2.token, 'load')).status, gone = (await P('10.4.0.5', pc3.token, 'load')).status, gone1 = (await P('10.4.0.6', me, 'load')).status;
  say(ch2.status === 200 && still === 200 && gone === 401 && gone1 === 401, `a password change on one PC: ${ch2.status}, "${ch2.signedOut}" others signed out; that PC still works (${still}), the others are signed out (${gone}, ${gone1})`);
  // ---- 3.9: nobody can be flooded with challenges: 12 open at most, on either side
  const tgt = `Tg${tag}`, mk = async (n, ip) => (await P(ip, null, 'signup', { name: n, password: 'testpass1', career: { ...career(n), cash: 10000 } })).token;
  await mk(tgt, '10.5.0.1');
  const C = async (from, token, action, body) => { const r = await fetch(BASE + '/api/challenge', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': from, Authorization: 'Bearer ' + token }, body: JSON.stringify({ action, ...body }) }); return { status: r.status, ...(await r.json().catch(() => ({}))) }; };
  const made = [];
  for (let i = 0; i < 13; i++) { const t = await mk(`F${i}x${tag}`, `10.6.${i}.1`); made.push((await C(`10.6.${i}.1`, t, 'create', { to: tgt.toLowerCase(), format: 'match', stake: 5, tier: 1, hcp: 'off' }))); }
  say(made.slice(0, 12).every((r) => r.status === 200) && made[12].status === 400, `13 players challenge one: the first 12 -> 200, the 13th -> ${made[12].status} "${made[12].error || ''}"`);
  // ---- 3.9: a request body that isn't an object gets an answer at once (it used to wait until the function timed out)
  const t0 = Date.now(); const raw = await fetch(BASE + '/api/profile', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '10.7.0.1' }, body: '5' });
  say(raw.status >= 400 && raw.status < 500 && Date.now() - t0 < 2000, `a body of just "5" -> ${raw.status} in ${Date.now() - t0} ms (read as an empty request: not signed in)`);
  console.log(out.join('\n'));
})().catch((e) => { console.log(out.join('\n')); console.error('STOPPED:', e); });
