// Shared test-round leaderboard, stored in Upstash Redis (REST API, no dependencies).
//
//   GET  /api/leaderboard?holes=9            -> { top: [...10], total }
//   POST /api/leaderboard  { name, strokes, putts, par, holes, scores: [per-hole strokes] }
//     (signed in, with the session token in Authorization: the profile's name is used instead of `name`)
//                                           -> { entry, rank, total, top }
//
// Credentials come from the Vercel project's environment variables. Connecting Upstash through Vercel's Storage tab
// sets KV_REST_API_URL / KV_REST_API_TOKEN (possibly with a custom prefix); adding them by hand from the Upstash console
// uses UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN. Any of these work (see findCreds).
//
// Storage: one sorted set per round length, golf:lb:<holes>h. Score = strokes * 1000 + putts, so fewer strokes win and
// fewer putts break a tie; members are JSON strings that start with the 13-digit timestamp, so Redis's own tie order
// (by member) puts the earlier round first. The set is trimmed to the best MAX_KEEP rounds.
//
// The scores are submitted by the browser, so a determined player could post a fake one. The checks below stop
// malformed or impossible rounds and flooding (a few saves per minute per IP), not a careful cheat; the admin can take
// a round off the board (POST { action: 'remove', t, id } with the admin's sign-in).

const MAX_KEEP = 1000;
const TOP_N = 10;
const RATE_MAX = 5, RATE_WINDOW_S = 60;
// the test round's holes (index.html HOLES): the only board there is. A score must be one a real round could have
// (audit 3.6: nine holes-in-one went straight to the top): no better than two under par on any hole (so a hole-in-one
// only on a par 3), and the round no better than one under par a hole.
const PARS = [5, 3, 4, 4, 3, 5, 4, 3, 4];
const PAR = PARS.reduce((a, b) => a + b, 0);

// The storage helpers (finding the credentials, the Redis pipeline, reading the body, the rate limit) are the shared
// ones in _redis.js (audit 9.2: this file used to carry its own copies).
const { findCreds, redis, readBody, clientIp, rateLimit, sessionId } = require('./_redis');
const { isAdmin } = require('./_admins');

const isInt = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
// a signed-in player's round goes on the board under their profile name (taken from their session, never from the
// request); a guest's under three arcade initials
const PROFILE_NAME = /^[A-Za-z0-9 _-]{3,12}$/;

// Only well-formed fields go out, whatever is in the database.
function clean(member) {
  try {
    const e = JSON.parse(member);
    const okName = e.pro ? PROFILE_NAME.test(e.name) : /^[A-Z0-9]{3}$/.test(e.name);
    if (!okName || !isInt(e.strokes, 1, 999) || !isInt(e.putts, 0, 999) || !isInt(e.par, 1, 999)) return null;
    return { t: +e.t || 0, id: /^[a-z0-9]{1,8}$/.test(e.id || '') ? e.id : '', name: e.name, pro: !!e.pro, strokes: e.strokes, putts: e.putts, par: e.par, toPar: e.strokes - e.par };
  } catch { return null; }
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const send = (code, obj) => res.status(code).json(obj);
  // (audit 3.9: this used to answer with the names of the storage settings the server could see; it says nothing more now)
  if (!findCreds()) return send(503, { error: 'Leaderboard storage is not configured' });

  try {
    if (req.method === 'GET') {
      const holes = parseInt((req.query && req.query.holes) || '9', 10);
      if (!isInt(holes, 1, 18)) return send(400, { error: 'Bad holes' });
      const key = `golf:lb:${holes}h`;
      const [members, total] = await redis([['ZRANGE', key, 0, TOP_N - 1], ['ZCARD', key]]);
      return send(200, { top: members.map(clean).filter(Boolean), total });
    }

    if (req.method === 'POST') {
      const b = await readBody(req, 4096);
      // the admin takes an entry off the board: { action: 'remove', t, id } (its time and id, as the board lists them)
      if (b && b.action === 'remove') {
        let me = null;
        try { me = await sessionId(req); } catch { me = null; }
        if (!me || !isAdmin(me)) return send(403, { error: 'Only the admin can remove a round' });
        const key = `golf:lb:${PARS.length}h`;
        const [all] = await redis([['ZRANGE', key, 0, -1]]);
        const hit = (all || []).find((m) => { const e = clean(m); return e && e.t === b.t && e.id === b.id; });
        if (!hit) return send(404, { error: 'That round isn\'t on the board' });
        const [, top, total] = await redis([['ZREM', key, hit], ['ZRANGE', key, 0, TOP_N - 1], ['ZCARD', key]]);
        return send(200, { ok: true, top: top.map(clean).filter(Boolean), total });
      }
      const { strokes, putts, par, holes, scores } = b || {};
      let name = b && b.name, pro = false;
      // signed in: the profile's own name (looked up from the session); a guest: three initials
      let me = null;
      try { me = await sessionId(req); } catch { me = null; }
      if (me) {
        const [pn] = await redis([['HGET', `golf:user:${me}`, 'name']]);
        if (pn && PROFILE_NAME.test(pn)) { name = pn; pro = true; }
      }
      // a believable round: a name, whole numbers, a per-hole card that adds up
      if (!pro && (typeof name !== 'string' || !/^[A-Z0-9]{3}$/.test(name))) return send(400, { error: 'Initials must be 3 letters or digits' });
      if (!isInt(holes, 1, 18) || !isInt(par, holes * 3, holes * 5)) return send(400, { error: 'Bad course' });
      if (!Array.isArray(scores) || scores.length !== holes || !scores.every((s) => isInt(s, 1, 40))) return send(400, { error: 'Bad scorecard' });
      if (!isInt(strokes, holes, holes * 40) || scores.reduce((a, s) => a + s, 0) !== strokes) return send(400, { error: 'Scorecard does not add up' });
      if (!isInt(putts, 0, strokes - 1)) return send(400, { error: 'Bad putts' });
      if (holes !== PARS.length || par !== PAR) return send(400, { error: 'Bad course' });
      if (scores.some((s, i) => s < Math.max(1, PARS[i] - 2)) || strokes < PAR - PARS.length) return send(400, { error: 'That score isn\'t possible' });

      if (!(await rateLimit(`golf:rl:${clientIp(req)}`, RATE_MAX, RATE_WINDOW_S))) return send(429, { error: 'Too many saves — try again in a minute' });

      const key = `golf:lb:${holes}h`, t = Date.now();
      const id = Math.random().toString(36).slice(2, 8);                 // two identical rounds in the same ms stay two
      const member = JSON.stringify({ t, id, name, strokes, putts, par, ...(pro ? { pro: true } : {}) });
      const [, rank, total, top] = await redis([
        ['ZADD', key, strokes * 1000 + putts, member],
        ['ZRANK', key, member],
        ['ZCARD', key],
        ['ZRANGE', key, 0, TOP_N - 1],
        ['ZREMRANGEBYRANK', key, MAX_KEEP, -1],
      ]);
      return send(200, { entry: clean(member), rank: rank + 1, total: Math.min(total, MAX_KEEP), top: top.map(clean).filter(Boolean) });
    }

    res.setHeader('Allow', 'GET, POST');
    return send(405, { error: 'Method not allowed' });
  } catch (e) {
    return send(500, { error: 'Leaderboard unavailable' });
  }
};
