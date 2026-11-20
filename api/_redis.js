// Shared helpers for the API functions (Vercel doesn't deploy files starting with "_" as endpoints).
// Upstash Redis over its REST pipeline; the keys come from the Vercel project's environment variables (see
// leaderboard.js for the story): KV_REST_API_* or UPSTASH_REDIS_REST_* by name or with a custom prefix, or an Upstash
// REDIS_URL connection string as a last resort.

const PAIRS = [['KV_REST_API_URL', 'KV_REST_API_TOKEN'], ['UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN'], ['REDIS_REST_URL', 'REDIS_REST_TOKEN']];
function findCreds(env = process.env) {
  for (const [u, t] of PAIRS) if (env[u] && env[t]) return { url: env[u], token: env[t] };
  for (const k of Object.keys(env).sort()) {
    for (const [u, t] of PAIRS) {
      if (!k.endsWith(`_${u}`) || !env[k]) continue;
      const prefix = k.slice(0, -u.length);
      if (env[prefix + t]) return { url: env[k], token: env[prefix + t] };
    }
  }
  for (const k of Object.keys(env).sort()) {
    if (!/(^|_)(REDIS_URL|KV_URL)$/.test(k)) continue;
    try {
      const u = new URL(env[k]);
      if (/^rediss?:$/.test(u.protocol) && u.hostname.endsWith('.upstash.io') && u.password) return { url: `https://${u.hostname}`, token: decodeURIComponent(u.password) };
    } catch { /* not a URL */ }
  }
  return null;
}

// run several commands in one round trip: [[cmd, ...args], ...] -> [result, ...]
async function redis(commands) {
  const c = findCreds();
  if (!c) throw Object.assign(new Error('Storage is not configured'), { status: 503 });
  const r = await fetch(`${c.url.replace(/\/+$/, '')}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${c.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(commands),
  });
  if (!r.ok) throw new Error(`Upstash ${r.status}`);
  const out = await r.json();
  for (const x of out) if (x && x.error) throw new Error(`Upstash: ${x.error}`);
  return out.map((x) => x.result);
}

// the request's JSON body, always as an object ({} for anything else). (Audit 3.9: Vercel parses the body itself, and a
// body that wasn't an object, say a bare number, fell through to reading the stream it had already read, so the
// function waited until it timed out.)
const asObj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
function readBody(req, limit = 300000) {
  if (req.body !== undefined && req.body !== null && typeof req.body !== 'string') return Promise.resolve(asObj(req.body));
  if (typeof req.body === 'string') return Promise.resolve(asObj(JSON.parse(req.body || '{}')));
  return new Promise((resolve, reject) => {
    let s = '';
    req.on('data', (c) => { s += c; if (s.length > limit) reject(new Error('too large')); });
    req.on('end', () => { try { resolve(asObj(JSON.parse(s || '{}'))); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

const clientIp = (req) => String((req.headers && req.headers['x-forwarded-for']) || (req.socket && req.socket.remoteAddress) || 'unknown').split(',')[0].trim();

// true if this key is still under `max` hits in the current window
async function rateLimit(key, max, windowS) {
  const [, count] = await redis([['SET', key, 0, 'EX', windowS, 'NX'], ['INCR', key]]);
  return count <= max;
}

// the profile id of a request's session (Authorization: Bearer <token>), or null. An admin's session is stored as
// "<id>#<credential fingerprint>" and only counts while that credential is the current one, so changing the admin
// password signs out every session made with the old one (and an admin session without a fingerprint never counts).
// A session lasts SESSION_S from its last use, not from the sign-in (audit 2.1: a fixed 30 days signed every regular
// player out in the middle of playing): each request that uses it pushes the expiry out again. (EXPIRE on a key that
// has gone is a no-op, so a dead session stays dead.)
// Audit 3.9: a session also ends SESSION_MAX_MS after it was made, however much it's used (a stolen token used to work
// for ever), and each profile keeps a set of its sessions (golf:sessions:<id>), so changing the password can sign the
// others out. The value is "<id>[#<fp>]~<made, ms>"; one made before this has no "~", and gets one (now) when next used.
const SESSION_S = 30 * 24 * 3600, SESSION_MAX_MS = 180 * 24 * 3600 * 1000;
const tokenOf = (req) => { const m = /^Bearer ([a-f0-9]{64})$/.exec((req.headers && req.headers.authorization) || ''); return m ? m[1] : null; };
async function sessionId(req) {
  const tok = tokenOf(req);
  if (!tok) return null;
  const [v] = await redis([['GET', `golf:sess:${tok}`], ['EXPIRE', `golf:sess:${tok}`, SESSION_S]]);
  if (!v) return null;
  const [main, made] = String(v).split('~'), [id, fp] = main.split('#');
  if (made && Date.now() - +made > SESSION_MAX_MS) { await redis([['DEL', `golf:sess:${tok}`], ['SREM', `golf:sessions:${id}`, tok]]); return null; }
  if (!made) await redis([['SET', `golf:sess:${tok}`, `${main}~${Date.now()}`, 'EX', SESSION_S], ['SADD', `golf:sessions:${id}`, tok]]);
  if (isAdmin(id)) { const c = adminCred(id); if (!c || fp !== c.fp) return null; }
  return id;
}
// what to store for a new session of this profile
const sessionValue = (id) => `${isAdmin(id) && adminCred(id) ? `${id}#${adminCred(id).fp}` : id}~${Date.now()}`;

// A career is golf:career:<id> = { data (JSON), ver }. Writes are compare-and-set on ver (this Lua script), so a copy
// that's out of date never overwrites a newer one; it returns the new version, or -1.
const CAS = `local v = redis.call('HGET', KEYS[1], 'ver')
if (v or '0') == ARGV[1] then
  local n = tonumber(ARGV[1]) + 1
  redis.call('HSET', KEYS[1], 'data', ARGV[2], 'ver', n)
  return n
end
return -1`;
// change a player's career on the server (escrow, payouts): read it, let fn change it (fn may throw to refuse), write it
// back with compare-and-set, retrying if the player's own PC saved in between. Returns the changed career.
async function updateCareer(id, fn) {
  for (let tries = 0; tries < 6; tries++) {
    const [[data, ver]] = await redis([['HMGET', `golf:career:${id}`, 'data', 'ver']]);
    if (!data) throw Object.assign(new Error('That player has no career'), { status: 404 });
    const c = normCareer(JSON.parse(data));         // (the right types first: a bad save can't block a payout, audit 3.2)
    if (fn(c) === false) return c;                  // (nothing to change: done already, audit 1.6)
    const [n] = await redis([['EVAL', CAS, 1, `golf:career:${id}`, String(+ver || 0), JSON.stringify(c)]]);
    if (n !== -1) {
      try { await redis([['SET', `golf:sum:${id}`, JSON.stringify(summaryOf(c, id))]]); } catch { /* the lists catch up on the next save */ }
      return c;
    }
  }
  throw new Error('Busy — try again');
}

const { isAdmin, adminCred } = require('./_admins');
const { normCareer, summaryOf } = require('./_career');

module.exports = { findCreds, redis, readBody, clientIp, rateLimit, sessionId, sessionValue, tokenOf, SESSION_S, CAS, updateCareer };
