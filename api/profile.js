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
//     buyshow { owner, key, price }       -> { ok, price, cash }  buy (and destroy) a trophy or framed scorecard off their wall
//                                            (only a win the challenge records confirm, and only at the price the buyer saw)
//
// Admin profiles (api/_admins.js) have a reserved name and a credential in the server's environment (GOLF_ADMIN_<ID>);
// their first sign-in creates them. Nobody else can sign up with an admin's name or become an admin.
// login / load also return { admin: true | false } for the admin rights to come.
//
// Keys: golf:user:<id> (hash: name, salt, hash, created), golf:players (set of ids), golf:sess:<token> (-> id, 30 days from its last use),
// golf:career:<id> (hash: data = career JSON, ver). <id> = the name lower-cased.
//
// Nothing here is sensitive (a game among friends), but passwords are still hashed (scrypt, per-user salt) because
// people reuse passwords. Saves are compare-and-set on `ver`, so a copy that's out of date never overwrites a newer one.

const crypto = require('crypto');
const { redis, readBody, clientIp, rateLimit, sessionId, sessionValue, SESSION_S, CAS, updateCareer } = require('./_redis');
const { isAdmin, adminCred } = require('./_admins');
const { arr, num, tierOf, plain, goodRounds, handicapOf, normCareer, outcomeFor } = require('./_career');
const FORMATS = ['match', 'stroke', 'skins'];
const ID_RE = /^[a-z0-9 _-]{3,12}$/;                // a profile id: the name lower-cased

// ---- the rivalry wall (index.html: rivalItems): a victory trophy per challenge won ("w-<challenge>") and, if its owner
// frames it, the scorecard ("s-<challenge>"). Anyone may buy one off the wall: the buyer pays the owner, and it's
// destroyed for good (career.showcase.destroyed). Price: twice what the win paid, at least $50 — the same in index.html.
//
// THE WALL IS THE SERVER'S RECORD, NOT THE OWNER'S WORD (audit 3.5): a career is whatever its owner's browser saved, so
// its history could claim wins that never happened, at any price. Every friend line other players see, and every piece
// on sale, comes from the challenge's own record (golf:ch:<id>, written only by api/challenge.js): it must be settled,
// this player must be in it, and the result and the money are the record's. Lines that don't check out are dropped.
const wallPrice = (h) => Math.max(50, Math.round(Math.abs(h.net || 0) * 2));
const CH_ID = /^[a-f0-9]{16}$/;
const getChs = async (ids) => (ids.length ? (await redis(ids.map((x) => ['GET', `golf:ch:${x}`]))).map(parse) : []);
// a settled challenge as one player's history line (the same line payOut writes), or null if it isn't theirs / settled
function lineFromRecord(ch, who) {
  if (!ch || ch.status !== 'done' || !ch.result || (ch.from !== who && ch.to !== who)) return null;
  const o = ch.from === who ? ch.to : ch.from, res = ch.result;
  return { friend: o, friendName: (ch.names || {})[o] || o, ch: ch.id, format: FORMATS.includes(ch.format) ? ch.format : 'match', stake: num(ch.stake),
    result: plain(`${outcomeFor(res, who)} · ${res.line}`), net: num((res.net || {})[who]), date: num(ch.finished) };
}
// the friend lines of a career's history that check out against the records (one line per challenge)
async function verifiedFriendLines(c, who) {
  const ids = [...new Set(arr(c.history).filter((h) => h && h.friend && CH_ID.test(String(h.ch || ''))).map((h) => h.ch))].slice(-200);
  return (await getChs(ids)).map((ch) => lineFromRecord(ch, who)).filter(Boolean);
}
// is this piece on the owner's wall right now (their own show / hide / frame choices; destroyed for good)?
function onWall(c, key) {
  const sc = c.showcase && typeof c.showcase === 'object' ? c.showcase : {};
  const m = /^([ws])-([a-f0-9]{16})$/.exec(key);
  if (!m || arr(sc.destroyed).includes(key)) return false;
  return m[1] === 'w' ? !arr(sc.hide).includes(key) : arr(sc.cards).includes(m[2]);
}
// a piece for sale: on the wall, and a win the record confirms → { price, label }, or null
async function wallItem(c, who, key) {
  if (!onWall(c, key)) return null;
  const [ch] = await getChs([key.slice(2)]), h = lineFromRecord(ch, who);
  if (!h || ch.result.winner !== who) return null;
  return { price: wallPrice(h), label: key[0] === 'w' ? `“Beat ${h.friendName}” trophy` : `framed scorecard vs ${h.friendName}` };
}

const NAME_RE = /^[A-Za-z0-9 _-]{3,12}$/;
// (SESSION_S, 30 days from a session's last use, lives in _redis.js with sessionId)
const MAX_CAREER = 250000;                 // bytes of career JSON
// (the compare-and-set script CAS lives in _redis.js)

const idOf = (name) => String(name).trim().toLowerCase();
// (a career's handicap, handicapOf, lives in _career.js with the other career readers)
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
// a career the client sent: an object of a sensible size, named after the profile, with its fields repaired to the
// right types (normCareer, audit 3.2)
function cleanCareer(c, name) {
  if (!c || typeof c !== 'object' || Array.isArray(c)) return null;
  normCareer(c);
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
        .map(([p, c, n]) => {                                // (one player at a time: a bad career is skipped, never the list)
          try {
            const name = c && NAME_RE.test(String(c.name)) ? c.name : n;
            if (!NAME_RE.test(String(name))) return null;
            return c ? { name, tierMax: tierOf(c.tierMax), cash: num(c.cash), handicap: handicapOf(c), rounds: goodRounds(c).length, last: num(c.stamp), admin: isAdmin(p), trophies: tro(c) }
              : { name, tierMax: 1, cash: null, handicap: null, rounds: 0, last: 0, admin: isAdmin(p) };     // (an admin who hasn't played yet)
          } catch { return null; }
        }).filter(Boolean);
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
      // (audit 2.6: a career over the size limit says so, and the game shows it, not "offline")
      if (!data && b.career && typeof b.career === 'object' && !Array.isArray(b.career)) return send(413, { error: 'This career is too big to save online' });
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
      // only clean values go out (audit 3.1: a career is whatever its owner's browser saved, and a visitor's page shows
      // these): ids and names that match the profile rules, a known format, finite numbers, plain short text
      // the friend lines (the rivalry wall: records and wins) come from the challenge records, never from the career
      // (audit 3.5); the others (hustler wins and big scores, for their earned trophies) are the career's own
      const own = arr(c.history).filter((h) => h && typeof h === 'object' && !h.friend && !h.sale && ((h.npc && num(h.net) > 0) || num(h.net) >= 1000))
        .slice(-200).map((h) => ({ npc: h.npc ? 1 : 0, friend: null, friendName: null, ch: null, format: FORMATS.includes(h.format) ? h.format : 'match', stake: num(h.stake), result: plain(h.result), net: num(h.net), date: num(h.date) }));
      const hist = [...own, ...(await verifiedFriendLines(c, who))].sort((x, y) => x.date - y.date).slice(-300);
      // the framed scorecards: the settled challenges themselves (both cards), for whoever looks at the wall
      const sc = c.showcase && typeof c.showcase === 'object' ? c.showcase : {}, strs = (a, n) => (Array.isArray(a) ? a.filter((x) => typeof x === 'string').slice(0, n) : []);
      const cids = strs(sc.cards, 20).filter((x) => /^[a-f0-9]{16}$/.test(x));
      const chs = cids.length ? await redis(cids.map((x) => ['GET', `golf:ch:${x}`])) : [];
      const cards = {};
      chs.map(parse).forEach((ch) => {
        if (!ch || ch.status !== 'done' || (ch.from !== who && ch.to !== who) || !ch.result) return;
        cards[ch.id] = { id: ch.id, from: ch.from, to: ch.to, names: ch.names, format: ch.format, stake: ch.stake, tier: ch.tier, strokes: ch.strokes, cards: ch.cards, finished: ch.finished,
          result: { kind: ch.result.kind, winner: ch.result.winner, loser: ch.result.loser, line: ch.result.line, net: ch.result.net } };
      });
      return send(200, { player: {
        name: c.name, trophies: tro(c), titles: arr(c.titles).filter((x) => x && typeof x === 'object').slice(-40).map((x) => ({ id: String(x.id || '').slice(0, 40), date: num(x.date), score: num(x.score) })), tierMax: tierOf(c.tierMax),
        rounds: goodRounds(c).slice(-10).map((r) => ({ gross: r.gross, par: r.par, tier: r.tier, date: r.date })),
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
      const oc = parse(od), it = oc && (await wallItem(oc, owner, key));      // (on the wall, and a win the record confirms)
      if (!it) return send(404, { error: 'That isn\'t on their wall any more' });
      const price = it.price, ownerName = oc.name, when = Date.now();
      // the price the buyer agreed to (audit 1.7): if it isn't the server's, nothing is bought
      if (b.price !== price) return send(409, { error: `The price has changed: it's $${price} now. Have another look.`, price });
      const buyer = await updateCareer(id, (c) => {
        if ((c.cash || 0) < price) throw Object.assign(new Error(`You need ${'$' + price} to buy it`), { status: 400 });
        c.cash -= price;
        c.history = [...(c.history || []), { sale: 'bought', key, other: owner, otherName: ownerName, net: -price, result: `bought and destroyed ${ownerName}'s ${it.label}`, date: when }];
      });
      try {
        await updateCareer(owner, (c) => {
          if (!onWall(c, key)) throw Object.assign(new Error('Someone just bought it'), { status: 409 });     // (or it was just taken down)
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
      const players = rows.map(parse).filter((c) => c && typeof c === 'object').map((c) => {   // (one at a time: a bad career is skipped)
        try {
          if (!NAME_RE.test(String(c.name))) return null;
          return { name: c.name, tierMax: tierOf(c.tierMax), cash: num(c.cash), rep: num(c.rep), handicap: handicapOf(c), rounds: goodRounds(c).length, trophies: tro(c) };
        } catch { return null; }
      }).filter(Boolean);
      return send(200, { players });
    }
    return send(400, { error: 'Unknown action' });
  } catch (e) {
    return send(e.status || 500, { error: e.status ? e.message : 'Profiles unavailable' });
  }
};
