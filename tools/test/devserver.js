// Local test server: the game's static files + the real api/*.js handlers, with Upstash replaced by an in-memory fake.
//
//   node tools/test/devserver.js [port] [root]   (default 8090; then open http://127.0.0.1:8090/)
//
// root is the site's folder, relative to the repo: left out, the full game (the repo itself); `arcade` serves the
// standalone arcade site that tools/arcade/build.js writes, with its own api/ and vercel.json, as Vercel would.
// Nothing touches the real database: every Redis command goes to the Map-based fake below, which is wiped on restart.
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..', '..', process.argv[3] || '.'), PORT = +process.argv[2] || 8090;
process.env.KV_REST_API_URL = 'https://fake.upstash.io'; process.env.KV_REST_API_TOKEN = 'tok';
// the tests make many profiles from one address: the real limits (5 a day per address, 300 a day for everyone, audit
// 3.3) would stop them. Start it with GOLF_SIGNUPS_PER_IP=5 to try the real limit.
process.env.GOLF_SIGNUPS_PER_IP = process.env.GOLF_SIGNUPS_PER_IP || '100000'; process.env.GOLF_SIGNUPS_PER_DAY = process.env.GOLF_SIGNUPS_PER_DAY || '100000';
const kv = new Map(), hashes = new Map(), sets = new Map(), exp = new Map();
const alive = (k) => { if (exp.has(k) && exp.get(k) < Date.now()) { kv.delete(k); exp.delete(k); } return kv.has(k); };
const H = (k) => { if (!hashes.has(k)) hashes.set(k, new Map()); return hashes.get(k); };
const zsets = new Map(), zs = (k) => { if (!zsets.has(k)) zsets.set(k, []); return zsets.get(k); };
// failure injection for the tests (audit 1.6): POST /__fail { cmd, key, skip } makes the (skip+1)th matching command
// fail once, as a storage hiccup between two writes would. key matches the start of the command's key. Each POST adds
// one; { clear: true } drops them all.
let failPlans = [];
function run(c) {
  const [cmd, ...a] = c, key = String(cmd.toUpperCase() === 'EVAL' ? a[2] : a[0]);
  for (const p of failPlans) {
    if (cmd.toUpperCase() !== p.cmd || !key.startsWith(p.key)) continue;
    if (p.skip > 0) { p.skip--; continue; }
    failPlans = failPlans.filter((x) => x !== p);
    return { error: 'injected failure' };
  }
  return run0(c);
}
function run0([cmd, ...a]) {
  switch (cmd.toUpperCase()) {
    case 'SET': { const k = a[0]; if (a.includes('NX') && alive(k)) return null; kv.set(k, String(a[1])); const ei = a.indexOf('EX'); if (ei > 0) exp.set(k, Date.now() + a[ei + 1] * 1000); return 'OK'; }
    case 'GET': return alive(a[0]) ? kv.get(a[0]) : null;
    case 'EXPIRE': if (!alive(a[0])) return 0; exp.set(a[0], Date.now() + a[1] * 1000); return 1;
    case 'TTL': return !alive(a[0]) ? -2 : exp.has(a[0]) ? Math.ceil((exp.get(a[0]) - Date.now()) / 1000) : -1;
    case 'DEL': return kv.delete(a[0]) || hashes.delete(a[0]) ? 1 : 0;
    case 'INCR': { const v = (alive(a[0]) ? +kv.get(a[0]) : 0) + 1; kv.set(a[0], String(v)); return v; }
    case 'HSETNX': { const h = H(a[0]); if (h.has(a[1])) return 0; h.set(a[1], String(a[2])); return 1; }
    case 'HSET': { const h = H(a[0]); for (let i = 1; i < a.length; i += 2) h.set(a[i], String(a[i + 1])); return 1; }
    case 'HGET': return hashes.has(a[0]) && hashes.get(a[0]).has(a[1]) ? hashes.get(a[0]).get(a[1]) : null;
    case 'HMGET': return a.slice(1).map((f) => (hashes.has(a[0]) && hashes.get(a[0]).has(f) ? hashes.get(a[0]).get(f) : null));
    case 'HGETALL': return hashes.has(a[0]) ? [...hashes.get(a[0])].flat() : [];
    case 'SADD': { if (!sets.has(a[0])) sets.set(a[0], new Set()); sets.get(a[0]).add(String(a[1])); return 1; }
    case 'SREM': return sets.has(a[0]) && sets.get(a[0]).delete(String(a[1])) ? 1 : 0;
    case 'SMEMBERS': return sets.has(a[0]) ? [...sets.get(a[0])] : [];
    // sorted sets (the leaderboard): [ [score, member], ... ] kept sorted
    case 'ZADD': { const z = zs(a[0]); z.push([+a[1], String(a[2])]); z.sort((x, y) => x[0] - y[0] || (x[1] < y[1] ? -1 : 1)); return 1; }
    case 'ZRANK': { const i = zs(a[0]).findIndex((x) => x[1] === String(a[1])); return i < 0 ? null : i; }
    case 'ZCARD': return zs(a[0]).length;
    case 'ZREM': { const z = zs(a[0]), i = z.findIndex((x) => x[1] === String(a[1])); if (i < 0) return 0; z.splice(i, 1); return 1; }
    case 'ZRANGE': { const z = zs(a[0]), e = +a[2] < 0 ? z.length + +a[2] : +a[2]; return z.slice(+a[1], e + 1).map((x) => x[1]); }
    case 'ZREMRANGEBYRANK': { const z = zs(a[0]); if (+a[1] < z.length) z.splice(+a[1]); return 0; }
    case 'EVAL': {   // the scripts: a lock's release (only by its holder), the sign-up (name and password at once), the CAS save
      if (/'DEL'/.test(a[0])) { const [, , key, token] = a; if (alive(key) && kv.get(key) === String(token)) { kv.delete(key); return 1; } return 0; }
      if (/'hash'/.test(a[0])) {
        const [, , key, name, salt, hash, created] = a, h = H(key);
        if (h.has('name') && h.has('hash')) return 0;
        h.set('name', name); h.set('salt', salt); h.set('hash', hash); h.set('created', created); return 1;
      }
      const [, , key, want, data] = a, h = H(key), v = h.get('ver') || '0';
      if (v !== String(want)) return -1;
      const n = +want + 1; h.set('data', data); h.set('ver', String(n)); return n;
    }
    default: return { error: 'fake: unknown ' + cmd };
  }
}
const realFetch = global.fetch;
global.fetch = async (url, opts) => {
  if (!String(url).startsWith('https://fake.upstash.io')) return realFetch(url, opts);
  const out = JSON.parse(opts.body).map((c) => { const r = run(c); return r && r.error ? r : { result: r }; });
  return { ok: true, status: 200, json: async () => out };
};
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.md': 'text/plain', '.webp': 'image/webp' };
// the live site's headers (vercel.json: the content security policy and the rest, audit 3.9), so the tests run under them
let SITE_HEADERS = [];
try { SITE_HEADERS = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8')).headers.filter((h) => h.source === '/(.*)').flatMap((h) => h.headers); } catch { /* none */ }
http.createServer(async (req, res) => {
  for (const h of SITE_HEADERS) res.setHeader(h.key, h.value);
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/__fail' && req.method === 'POST') {          // (tests only: see failPlan)
    let body = ''; for await (const c of req) body += c;
    const p = JSON.parse(body || '{}');
    if (p.clear) failPlans = []; else if (p.cmd) failPlans.push({ cmd: String(p.cmd).toUpperCase(), key: String(p.key || ''), skip: +p.skip || 0 });
    res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"ok":true}'); return;
  }
  if (u.pathname.startsWith('/api/')) {
    const name = u.pathname.slice(5).replace(/[^a-z_]/g, '');
    let body = '';
    for await (const c of req) body += c;
    const r = { method: req.method, headers: req.headers, query: Object.fromEntries(u.searchParams), body: body ? JSON.parse(body) : {}, socket: req.socket };
    const w = { code: 200, setHeader: (k, v) => res.setHeader(k, v), status(c) { this.code = c; return this; }, json(o) { res.writeHead(this.code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); } };
    const f = path.join(ROOT, 'api', name + '.js');
    if (!fs.existsSync(f)) { res.writeHead(404); res.end(); return; }          // (the arcade site has only the leaderboard)
    try { delete require.cache[require.resolve(f)]; await require(f)(r, w); }
    catch (e) { res.writeHead(500); res.end(String(e)); }
    return;
  }
  const f = path.join(ROOT, u.pathname.endsWith('/') ? u.pathname + 'index.html' : u.pathname);
  if (!f.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
  fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
}).listen(PORT, '127.0.0.1', () => console.log('dev server on http://127.0.0.1:' + PORT + '/'));
