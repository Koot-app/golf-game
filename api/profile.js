// Player profiles (MULTIPLAYER_PLAN.md, M1): sign up / sign in with a name and password, and keep each profile's career
// on the server so it follows the player between computers.
//
//   POST /api/profile  { action, ... }   (signed-in actions send  Authorization: Bearer <session token>)
//     signup  { name, password, career }  -> { token, name, career, ver }
//     login   { name, password }          -> { token, name, career, ver }
//     logout                              -> { ok }
//     load                                -> { career, ver }
//     save    { career, ver }             -> { ver }   or 409 { career, ver } when the server has a newer copy
//     players                             -> { players: [{ name, tierMax, cash, rep, handicap, rounds }] }
//     roster  (no session)                -> { players: [{ name, tierMax, cash, handicap, rounds, last, admin }] }  for the sign-in screen
//
// Admin profiles (api/_admins.js) have a reserved name and a baked-in password hash; their first sign-in creates them.
// login / load also return { admin: true | false } for the admin rights to come.
//
// Keys: golf:user:<id> (hash: name, salt, hash, created), golf:players (set of ids), golf:sess:<token> (-> id, 30 days),
// golf:career:<id> (hash: data = career JSON, ver). <id> = the name lower-cased.
//
// Nothing here is sensitive (a game among friends), but passwords are still hashed (scrypt, per-user salt) because
// people reuse passwords. Saves are compare-and-set on `ver`, so a copy that's out of date never overwrites a newer one.

const crypto = require('crypto');
const { redis, readBody, clientIp, rateLimit, sessionId, CAS } = require('./_redis');
const { ADMINS, isAdmin } = require('./_admins');

const NAME_RE = /^[A-Za-z0-9 _-]{3,12}$/;
const SESSION_S = 30 * 24 * 3600;
const MAX_CAREER = 250000;                 // bytes of career JSON
// (the compare-and-set script CAS lives in _redis.js)

const idOf = (name) => String(name).trim().toLowerCase();
// a career's handicap (M2) — the same as handicapOf() in index.html: keep both alike
const HCP = { rating: { 1: 0, 2: 1.5, 3: 3 }, recent: 10, best: 4, factor: 0.96, min: 3 };
function handicapOf(c) {
  const r = ((c && c.rounds) || []).slice(-HCP.recent);
  if (r.length < HCP.min) return null;
  const d = r.map((x) => x.gross - x.par - (HCP.rating[x.tier] || 0)).sort((a, b) => a - b).slice(0, HCP.best);
  return Math.round((d.reduce((a, b) => a + b, 0) / d.length) * HCP.factor * 10) / 10;
}
const hashPw = (pw, salt) => new Promise((resolve, reject) => crypto.scrypt(String(pw), salt, 32, (e, k) => (e ? reject(e) : resolve(k.toString('hex')))));
const parse = (s) => { try { return JSON.parse(s); } catch { return null; } };

// (sessionId lives in _redis.js)
async function newSession(id) {
  const token = crypto.randomBytes(32).toString('hex');
  await redis([['SET', `golf:sess:${token}`, id, 'EX', SESSION_S]]);
  return token;
}
// a career the client sent: an object of a sensible size, named after the profile
function cleanCareer(c, name) {
  if (!c || typeof c !== 'object' || Array.isArray(c)) return null;
  c.name = name;
  const s = JSON.stringify(c);
  return s.length <= MAX_CAREER ? s : null;
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const send = (code, obj) => res.status(code).json(obj);
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return send(405, { error: 'Method not allowed' }); }
  try {
    const b = await readBody(req);
    const action = b && b.action;

    if (action === 'signup' || action === 'login') {
      if (!(await rateLimit(`golf:rl:auth:${clientIp(req)}`, 10, 60))) return send(429, { error: 'Too many tries — wait a minute' });
      const name = String(b.name || '').trim(), id = idOf(name), pw = String(b.password || '');
      if (!NAME_RE.test(name)) return send(400, { error: 'Names are 3–12 letters, numbers, spaces, - or _' });
      const admin = ADMINS[id];                                // a reserved admin name: its baked-in password, any length
      if (!admin && (pw.length < 4 || pw.length > 128)) return send(400, { error: 'Passwords are at least 4 characters' });
      if (admin) {
        const h = await hashPw(pw, admin.salt);
        if (!crypto.timingSafeEqual(Buffer.from(h, 'hex'), Buffer.from(admin.hash, 'hex'))) return send(action === 'signup' ? 409 : 401, { error: action === 'signup' ? 'That name is reserved' : 'Wrong password' });
        // first sign-in (or sign-up) creates the profile; its career comes from the client (or a fresh one on the next save)
        await redis([['HSETNX', `golf:user:${id}`, 'name', admin.name], ['SADD', 'golf:players', id]]);
        const data = action === 'signup' ? cleanCareer(b.career, admin.name) : null;
        if (data) await redis([['HSETNX', `golf:career:${id}`, 'data', data], ['HSETNX', `golf:career:${id}`, 'ver', 1]]);
        const [[cd, cv]] = await redis([['HMGET', `golf:career:${id}`, 'data', 'ver']]);
        return send(200, { token: await newSession(id), name: admin.name, career: parse(cd), ver: +cv || 0, admin: true });
      }

      if (action === 'signup') {
        const data = cleanCareer(b.career, name);
        if (!data) return send(400, { error: 'No career to save' });
        const salt = crypto.randomBytes(16).toString('hex'), hash = await hashPw(pw, salt);
        const [fresh] = await redis([['HSETNX', `golf:user:${id}`, 'name', name]]);
        if (!fresh) return send(409, { error: 'That name is taken' });
        await redis([
          ['HSET', `golf:user:${id}`, 'salt', salt, 'hash', hash, 'created', Date.now()],
          ['SADD', 'golf:players', id],
          ['HSET', `golf:career:${id}`, 'data', data, 'ver', 1],
        ]);
        return send(200, { token: await newSession(id), name, career: JSON.parse(data), ver: 1 });
      }

      const [u] = await redis([['HGETALL', `golf:user:${id}`]]);
      const user = {};
      if (Array.isArray(u)) for (let i = 0; i < u.length; i += 2) user[u[i]] = u[i + 1];      // (Upstash returns [k, v, k, v])
      else if (u && typeof u === 'object') Object.assign(user, u);
      if (!user.hash) return send(401, { error: 'No profile with that name' });
      const hash = await hashPw(pw, user.salt);
      if (!crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(user.hash, 'hex'))) return send(401, { error: 'Wrong password' });
      const [data, ver] = await redis([['HMGET', `golf:career:${id}`, 'data', 'ver']]).then(([r]) => r);
      return send(200, { token: await newSession(id), name: user.name, career: parse(data), ver: +ver || 0, admin: false });
    }

    // the sign-in screen's list of profiles (no session needed; nothing private: name, handicap, cash, circuit)
    if (action === 'roster') {
      if (!(await rateLimit(`golf:rl:roster:${clientIp(req)}`, 60, 60))) return send(429, { error: 'Too many requests — wait a minute' });
      const [ids] = await redis([['SMEMBERS', 'golf:players']]);
      const list = (ids || []).slice(0, 200);
      const rows = list.length ? await redis(list.flatMap((p) => [['HGET', `golf:career:${p}`, 'data'], ['HGET', `golf:user:${p}`, 'name']])) : [];
      const players = list.map((p, i) => [p, parse(rows[2 * i]), rows[2 * i + 1]]).filter(([, c, n]) => c || n)
        .map(([p, c, n]) => (c ? { name: c.name, tierMax: c.tierMax || 1, cash: c.cash, handicap: handicapOf(c), rounds: (c.rounds || []).length, last: c.stamp || 0, admin: isAdmin(p) }
          : { name: n, tierMax: 1, cash: null, handicap: null, rounds: 0, last: 0, admin: isAdmin(p) }));     // (an admin who hasn't played yet)
      return send(200, { players });
    }

    // ---- everything else needs a session
    const id = await sessionId(req);
    if (!id) return send(401, { error: 'Not signed in' });

    if (action === 'logout') {
      const m = /^Bearer ([a-f0-9]{64})$/.exec(req.headers.authorization);
      await redis([['DEL', `golf:sess:${m[1]}`]]);
      return send(200, { ok: true });
    }
    if (action === 'load') {
      const [[data, ver]] = await redis([['HMGET', `golf:career:${id}`, 'data', 'ver']]);
      return send(200, { career: parse(data), ver: +ver || 0, admin: isAdmin(id) });
    }
    if (action === 'save') {
      const [name] = await redis([['HGET', `golf:user:${id}`, 'name']]);
      const data = cleanCareer(b.career, name || id);
      if (!data || !Number.isInteger(b.ver) || b.ver < 0) return send(400, { error: 'Bad save' });
      const [ver] = await redis([['EVAL', CAS, 1, `golf:career:${id}`, String(b.ver), data]]);
      if (ver === -1) {
        const [[cur, cv]] = await redis([['HMGET', `golf:career:${id}`, 'data', 'ver']]);
        return send(409, { error: 'There is a newer copy', career: parse(cur), ver: +cv || 0 });
      }
      return send(200, { ver });
    }
    if (action === 'players') {
      const [ids] = await redis([['SMEMBERS', 'golf:players']]);
      const list = (ids || []).slice(0, 200);
      const rows = list.length ? await redis(list.map((p) => ['HGET', `golf:career:${p}`, 'data'])) : [];
      const players = rows.map(parse).filter(Boolean).map((c) => ({ name: c.name, tierMax: c.tierMax || 1, cash: c.cash, rep: c.rep, handicap: handicapOf(c), rounds: (c.rounds || []).length }));
      return send(200, { players });
    }
    return send(400, { error: 'Unknown action' });
  } catch (e) {
    return send(e.status || 500, { error: e.status ? e.message : 'Profiles unavailable' });
  }
};
