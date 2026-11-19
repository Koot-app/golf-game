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
//     showcase { name }                   -> { player: { name, trophies, titles, tierMax, rounds, history, showcase, cards } }  their trophy room
//     buyshow { owner, key }              -> { ok, price, cash }  buy (and destroy) a trophy or framed scorecard off their wall
//
// Admin profiles (api/_admins.js) have a reserved name and a credential in the server's environment (GOLF_ADMIN_<ID>);
// their first sign-in creates them. Nobody else can sign up with an admin's name or become an admin.
// login / load also return { admin: true | false } for the admin rights to come.
//
// Keys: golf:user:<id> (hash: name, salt, hash, created), golf:players (set of ids), golf:sess:<token> (-> id, 30 days),
// golf:career:<id> (hash: data = career JSON, ver). <id> = the name lower-cased.
//
// Nothing here is sensitive (a game among friends), but passwords are still hashed (scrypt, per-user salt) because
// people reuse passwords. Saves are compare-and-set on `ver`, so a copy that's out of date never overwrites a newer one.

const crypto = require('crypto');
const { redis, readBody, clientIp, rateLimit, sessionId, sessionValue, CAS, updateCareer } = require('./_redis');
const { isAdmin, adminCred } = require('./_admins');

// ---- the rivalry wall (index.html: rivalItems): a victory trophy per challenge won ("w-<challenge>") and, if its owner
// frames it, the scorecard ("s-<challenge>"). Anyone may buy one off the wall: the buyer pays the owner, and it's
// destroyed for good (career.showcase.destroyed). Price: twice what the win paid, at least $50 — the same in index.html.
const wallPrice = (h) => Math.max(50, Math.round(Math.abs(h.net || 0) * 2));
const winsOf = (c) => (c.history || []).filter((h) => h && h.friend && /^won/.test(h.result || ''));
function wallItem(c, key) {                       // the history line behind a wall item, if it's on the wall right now
  const sc = c.showcase || {}, destroyed = new Set(sc.destroyed || []), hide = new Set(sc.hide || []), cards = new Set(sc.cards || []);
  if (destroyed.has(key)) return null;
  for (const h of winsOf(c)) {
    if (key === `w-${h.ch || h.date}` && !hide.has(key)) return { h, label: `“Beat ${h.friendName || h.friend}” trophy` };
    if (h.ch && key === `s-${h.ch}` && cards.has(h.ch)) return { h, label: `framed scorecard vs ${h.friendName || h.friend}` };
  }
  return null;
}

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
// a career's trophy-room pieces (ids), for the profile list's bragging rights
const tro = (c) => (Array.isArray(c.trophies) ? c.trophies.filter((x) => typeof x === 'string').slice(0, 40) : []);

// (sessionId lives in _redis.js)
async function newSession(id) {
  const token = crypto.randomBytes(32).toString('hex');
  await redis([['SET', `golf:sess:${token}`, sessionValue(id), 'EX', SESSION_S]]);     // (an admin's is tied to the current credential)
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
      // a reserved admin name (in any capitals): only its credential from the environment signs in; nobody can sign it up
      if (isAdmin(id)) {
        const admin = adminCred(id);
        if (!admin) return send(action === 'signup' ? 409 : 503, { error: action === 'signup' ? 'That name is reserved' : 'Admin sign-in isn\'t set up on this server' });
        if (pw.length > 128) return send(401, { error: 'Wrong password' });
        const h = await hashPw(pw, admin.salt);
        if (!crypto.timingSafeEqual(Buffer.from(h, 'hex'), Buffer.from(admin.hash, 'hex'))) return send(action === 'signup' ? 409 : 401, { error: action === 'signup' ? 'That name is reserved' : 'Wrong password' });
        // first sign-in (or sign-up) creates the profile; its career comes from the client (or a fresh one on the next save)
        await redis([['HSETNX', `golf:user:${id}`, 'name', admin.name], ['SADD', 'golf:players', id]]);
        const data = action === 'signup' ? cleanCareer(b.career, admin.name) : null;
        if (data) await redis([['HSETNX', `golf:career:${id}`, 'data', data], ['HSETNX', `golf:career:${id}`, 'ver', 1]]);
        const [[cd, cv]] = await redis([['HMGET', `golf:career:${id}`, 'data', 'ver']]);
        return send(200, { token: await newSession(id), name: admin.name, career: parse(cd), ver: +cv || 0, admin: true });
      }
      if (pw.length < 4 || pw.length > 128) return send(400, { error: 'Passwords are at least 4 characters' });

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
        .map(([p, c, n]) => (c ? { name: c.name, tierMax: c.tierMax || 1, cash: c.cash, handicap: handicapOf(c), rounds: (c.rounds || []).length, last: c.stamp || 0, admin: isAdmin(p), trophies: tro(c) }
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
    // another player's trophy room, to visit from Friends: what's on show and what it takes to work out their earned
    // trophies (circuit, titles, recent rounds for the handicap, and the history lines the trophies look at). Their
    // rivalry trophies come with their own show / hide choices (career.showcase.hide). Nothing private (no cash, no bag).
    if (action === 'showcase') {
      const who = idOf(b.name || '');
      const [[data]] = await redis([['HMGET', `golf:career:${who}`, 'data']]);
      const c = parse(data);
      if (!c) return send(404, { error: 'No player with that name' });
      const hist = (c.history || []).filter((h) => h && ((h.npc && h.net > 0) || h.friend || h.net >= 1000))
        .slice(-200).map((h) => ({ npc: h.npc ? 1 : 0, friend: h.friend || null, friendName: h.friendName || null, ch: h.ch || null, format: h.format, stake: h.stake, result: h.result, net: h.net, date: h.date }));
      // the framed scorecards: the settled challenges themselves (both cards), for whoever looks at the wall
      const sc = c.showcase || {}, strs = (a, n) => (Array.isArray(a) ? a.filter((x) => typeof x === 'string').slice(0, n) : []);
      const cids = strs(sc.cards, 20).filter((x) => /^[a-f0-9]{16}$/.test(x));
      const chs = cids.length ? await redis(cids.map((x) => ['GET', `golf:ch:${x}`])) : [];
      const cards = {};
      chs.map(parse).forEach((ch) => {
        if (!ch || ch.status !== 'done' || (ch.from !== who && ch.to !== who) || !ch.result) return;
        cards[ch.id] = { id: ch.id, from: ch.from, to: ch.to, names: ch.names, format: ch.format, stake: ch.stake, tier: ch.tier, strokes: ch.strokes, cards: ch.cards, finished: ch.finished,
          result: { kind: ch.result.kind, winner: ch.result.winner, loser: ch.result.loser, line: ch.result.line, net: ch.result.net } };
      });
      return send(200, { player: {
        name: c.name, trophies: tro(c), titles: (c.titles || []).slice(-40), tierMax: c.tierMax || 1,
        rounds: (c.rounds || []).slice(-10).map((r) => ({ gross: r.gross, par: r.par, tier: r.tier, date: r.date })),
        history: hist, showcase: { hide: strs(sc.hide, 300), cards: cids, destroyed: strs(sc.destroyed, 300) }, cards,
        // their gear, for "their bag" (the clubs and models, the putter, the caddie and the stats; still no cash)
        gear: {
          bag: Object.fromEntries(Object.entries(c.bag || {}).filter(([k, v]) => /^\d{1,2}$/.test(k) && typeof v === 'string').slice(0, 16)),
          out: (c.out || []).filter(Number.isInteger).slice(0, 16), snapped: (c.snapped || []).filter(Number.isInteger).slice(0, 16),
          putter: typeof c.putter === 'string' ? c.putter : null, putters: strs(c.putters, 12), caddie: typeof c.caddie === 'string' ? c.caddie : null,
          stats: c.stats && typeof c.stats === 'object' ? { power: +c.stats.power || 1, dex: +c.stats.dex || 1, composure: +c.stats.composure || 1, perception: +c.stats.perception || 1 } : null,
          seed: Number.isInteger(c.seed) ? c.seed : 0,
        },
      } });
    }
    // buy something off another player's rivalry wall: the buyer pays the owner, and the piece is destroyed for good
    if (action === 'buyshow') {
      const owner = idOf(b.owner || ''), key = String(b.key || '');
      if (!owner || owner === id) return send(400, { error: 'You can\'t buy your own' });
      const [[od]] = await redis([['HMGET', `golf:career:${owner}`, 'data']]);
      const oc = parse(od), it = oc && wallItem(oc, key);
      if (!it) return send(404, { error: 'That isn\'t on their wall any more' });
      const price = wallPrice(it.h), ownerName = oc.name, when = Date.now();
      const buyer = await updateCareer(id, (c) => {
        if ((c.cash || 0) < price) throw Object.assign(new Error(`You need ${'$' + price} to buy it`), { status: 400 });
        c.cash -= price;
        c.history = [...(c.history || []), { sale: 'bought', key, other: owner, otherName: ownerName, net: -price, result: `bought and destroyed ${ownerName}'s ${it.label}`, date: when }];
      });
      try {
        await updateCareer(owner, (c) => {
          const again = wallItem(c, key);                    // (someone else may just have bought it)
          if (!again) throw Object.assign(new Error('Someone just bought it'), { status: 409 });
          const s = c.showcase || {};
          c.showcase = { ...s, destroyed: [...(s.destroyed || []), key], cards: (s.cards || []).filter((x) => `s-${x}` !== key) };
          c.cash = (c.cash || 0) + price;
          c.history = [...(c.history || []), { sale: 'sold', key, other: id, otherName: buyer.name, net: price, result: `${buyer.name} bought and destroyed your ${it.label}`, date: when }];
        });
      } catch (e) {                                          // give the buyer their money back
        await updateCareer(id, (c) => { c.cash = (c.cash || 0) + price; c.history = (c.history || []).filter((h) => !(h.sale === 'bought' && h.key === key && h.date === when)); });
        throw e;
      }
      return send(200, { ok: true, price, cash: buyer.cash });
    }
    if (action === 'players') {
      const [ids] = await redis([['SMEMBERS', 'golf:players']]);
      const list = (ids || []).slice(0, 200);
      const rows = list.length ? await redis(list.map((p) => ['HGET', `golf:career:${p}`, 'data'])) : [];
      const players = rows.map(parse).filter(Boolean).map((c) => ({ name: c.name, tierMax: c.tierMax || 1, cash: c.cash, rep: c.rep, handicap: handicapOf(c), rounds: (c.rounds || []).length, trophies: tro(c) }));
      return send(200, { players });
    }
    return send(400, { error: 'Unknown action' });
  } catch (e) {
    return send(e.status || 500, { error: e.status ? e.message : 'Profiles unavailable' });
  }
};
