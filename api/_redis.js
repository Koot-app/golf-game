// Shared helpers for the API functions (Vercel doesn't deploy files starting with "_" as endpoints): sessions and the
// career on the server. The storage itself (Upstash Redis, the request body, the rate limit) is in _store.js, and is
// passed on from here unchanged, so every function can keep asking this file for it.
const { findCreds, redis, readBody, clientIp, rateLimit } = require('./_store');

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
