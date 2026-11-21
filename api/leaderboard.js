// Shared test-round leaderboard, stored in Upstash Redis (REST API, no dependencies).
//
//   GET  /api/leaderboard?holes=9&course=1   -> { top: [...10], total }      (course 1-3, the arcade's; 1 if left out)
//   POST /api/leaderboard  { name, strokes, putts, par, holes, course, scores: [per-hole strokes] }
//     (signed in, with the session token in Authorization: the profile's name is used instead of `name`)
//                                           -> { entry, rank, total, top }
//   GET  /api/leaderboard?kind=skills&set=range   -> a skills challenge's board: { top: [...10], total }  (set: range,
//                                                    chip, putt or full; full if left out; all: { boards: { set: {...} } })
//   POST /api/leaderboard  { kind: 'skills', set, name, tries: [attempts at each shot] } -> { entry, rank, total, top }
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
// The arcade's three courses (index.html ARCADE), a board each: course 1 is the first course (HOLES, the board there
// has always been: its key is unchanged), 2 is HOLES_T2 and 3 is HOLES_T3 (user request, 2026-11-20). A score must be
// one a real round could have (audit 3.6: nine holes-in-one went straight to the top): no better than two under par on
// any hole (so a hole-in-one only on a par 3), and the round no better than one under par a hole.
const PARS_BY_COURSE = { 1: [5, 3, 4, 4, 3, 5, 4, 3, 4], 2: [4, 5, 4, 4, 3, 4, 3, 5, 4], 3: [4, 4, 4, 5, 4, 3, 5, 3, 4] };
const courseOf = (v) => { const c = parseInt(v === undefined || v === null || v === '' ? '1' : v, 10); return PARS_BY_COURSE[c] ? c : 0; };
const keyOf = (holes, course) => `golf:lb:${holes}h${course > 1 ? `:c${course}` : ''}`;

// The storage helpers (finding the credentials, the Redis pipeline, reading the body, the rate limit) are the shared
// ones in _store.js (audit 9.2: this file used to carry its own copies).
const { findCreds, redis, readBody, clientIp, rateLimit } = require('./_store');
// Who is signed in, and whether that's the admin. The arcade site (tools/arcade/build.js copies this file there, with
// _store.js) has no profiles: there every round is a guest's, under three initials, and nobody can remove one (the
// boards are shared, so the admin does that from the full game).
/*<tour>*/
const { sessionId } = require('./_redis');
const { isAdmin } = require('./_admins');
/*</tour>*/
/*arcade:
const sessionId = async () => null, isAdmin = () => false;
*/

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

// THE SKILLS CHALLENGES' boards (user request, 2026-11-21; index.html SK_SETS): ?kind=skills&set= / { kind: 'skills',
// set }. A board for each challenge (one for each practice area, and the full test), the fewest attempts to make all
// its shots; a tie goes to the earlier one (the member starts with its time). A believable card: the attempts at each
// shot, at least one each, adding up to the total. (Like the rounds, the browser sends it, so a careful cheat could
// still post a fake one.)
// (a key names its challenge and shot count: when a challenge changes, a new board, since the scores no longer
// compare. It was one challenge: twelve shots on golf:lb:skills, then thirteen on golf:lb:skills:13)
const SKILLS_SETS = { range: 10, chip: 10, putt: 10, full: 15 };
const skillsSet = (v) => (v === undefined || v === null || v === '' ? 'full' : Object.prototype.hasOwnProperty.call(SKILLS_SETS, v) ? v : '');
const skillsKey = (set) => `golf:lb:skills:${set}:${SKILLS_SETS[set]}`;
const cleanSkills = (set) => (member) => {
  try {
    const e = JSON.parse(member), n = SKILLS_SETS[set];
    const okName = e.pro ? PROFILE_NAME.test(e.name) : /^[A-Z0-9]{3}$/.test(e.name);
    if (!okName || !isInt(e.total, n, n * 99)) return null;
    return { t: +e.t || 0, id: /^[a-z0-9]{1,8}$/.test(e.id || '') ? e.id : '', name: e.name, pro: !!e.pro, total: e.total };
  } catch { return null; }
};

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const send = (code, obj) => res.status(code).json(obj);
  // (audit 3.9: this used to answer with the names of the storage settings the server could see; it says nothing more now)
  if (!findCreds()) return send(503, { error: 'Leaderboard storage is not configured' });

  try {
    if (req.method === 'GET') {
      if (req.query && req.query.kind === 'skills') {
        // every board at once (the home screen's tile), or one
        if (req.query.set === 'all') {
          const sets = Object.keys(SKILLS_SETS);
          const got = await redis(sets.flatMap((k) => [['ZRANGE', skillsKey(k), 0, TOP_N - 1], ['ZCARD', skillsKey(k)]]));
          const boards = {};
          sets.forEach((k, i) => { boards[k] = { top: (got[2 * i] || []).map(cleanSkills(k)).filter(Boolean), total: got[2 * i + 1] || 0 }; });
          return send(200, { boards });
        }
        const set = skillsSet(req.query.set);
        if (!set) return send(400, { error: 'Bad challenge' });
        const [members, total] = await redis([['ZRANGE', skillsKey(set), 0, TOP_N - 1], ['ZCARD', skillsKey(set)]]);
        return send(200, { top: members.map(cleanSkills(set)).filter(Boolean), total });
      }
      const holes = parseInt((req.query && req.query.holes) || '9', 10);
      const course = courseOf(req.query && req.query.course);
      if (!isInt(holes, 1, 18) || !course) return send(400, { error: 'Bad holes' });
      const key = keyOf(holes, course);
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
        const sk = b.kind === 'skills', rc = courseOf(b.course), set = sk ? skillsSet(b.set) : '';
        if (sk ? !set : !rc) return send(400, { error: sk ? 'Bad challenge' : 'Bad course' });
        const key = sk ? skillsKey(set) : keyOf(PARS_BY_COURSE[rc].length, rc), cl = sk ? cleanSkills(set) : clean;
        const [all] = await redis([['ZRANGE', key, 0, -1]]);
        const hit = (all || []).find((m) => { const e = cl(m); return e && e.t === b.t && e.id === b.id; });
        if (!hit) return send(404, { error: 'That round isn\'t on the board' });
        const [, top, total] = await redis([['ZREM', key, hit], ['ZRANGE', key, 0, TOP_N - 1], ['ZCARD', key]]);
        return send(200, { ok: true, top: top.map(cl).filter(Boolean), total });
      }
      let name = b && b.name, pro = false;
      // signed in: the profile's own name (looked up from the session); a guest: three initials
      let me = null;
      try { me = await sessionId(req); } catch { me = null; }
      if (me) {
        const [pn] = await redis([['HGET', `golf:user:${me}`, 'name']]);
        if (pn && PROFILE_NAME.test(pn)) { name = pn; pro = true; }
      }
      if (!pro && (typeof name !== 'string' || !/^[A-Z0-9]{3}$/.test(name))) return send(400, { error: 'Initials must be 3 letters or digits' });
      // a skills challenge: the attempts at each of its shots
      if (b.kind === 'skills') {
        const tries = b.tries, set = skillsSet(b.set);
        if (!set) return send(400, { error: 'Bad challenge' });
        if (!Array.isArray(tries) || tries.length !== SKILLS_SETS[set] || !tries.every((n) => isInt(n, 1, 99))) return send(400, { error: 'Bad card' });
        const SKILLS_KEY = skillsKey(set);
        const sum = tries.reduce((a, n) => a + n, 0);
        if (b.total !== undefined && b.total !== sum) return send(400, { error: 'Card does not add up' });
        if (!(await rateLimit(`golf:rl:${clientIp(req)}`, RATE_MAX, RATE_WINDOW_S))) return send(429, { error: 'Too many saves — try again in a minute' });
        const t = Date.now(), id = Math.random().toString(36).slice(2, 8);
        const member = JSON.stringify({ t, id, name, total: sum, ...(pro ? { pro: true } : {}) });
        const [, rank, total, top] = await redis([
          ['ZADD', SKILLS_KEY, sum, member],
          ['ZRANK', SKILLS_KEY, member],
          ['ZCARD', SKILLS_KEY],
          ['ZRANGE', SKILLS_KEY, 0, TOP_N - 1],
          ['ZREMRANGEBYRANK', SKILLS_KEY, MAX_KEEP, -1],
        ]);
        return send(200, { entry: cleanSkills(set)(member), rank: rank + 1, total: Math.min(total, MAX_KEEP), top: top.map(cleanSkills(set)).filter(Boolean) });
      }
      const { strokes, putts, par, holes, scores } = b || {};
      // a believable round: a name, whole numbers, a per-hole card that adds up
      if (!isInt(holes, 1, 18) || !isInt(par, holes * 3, holes * 5)) return send(400, { error: 'Bad course' });
      if (!Array.isArray(scores) || scores.length !== holes || !scores.every((s) => isInt(s, 1, 40))) return send(400, { error: 'Bad scorecard' });
      if (!isInt(strokes, holes, holes * 40) || scores.reduce((a, s) => a + s, 0) !== strokes) return send(400, { error: 'Scorecard does not add up' });
      if (!isInt(putts, 0, strokes - 1)) return send(400, { error: 'Bad putts' });
      const course = courseOf(b.course), PARS = PARS_BY_COURSE[course], PAR = PARS ? PARS.reduce((a, s) => a + s, 0) : 0;
      if (!course || holes !== PARS.length || par !== PAR) return send(400, { error: 'Bad course' });
      if (scores.some((s, i) => s < Math.max(1, PARS[i] - 2)) || strokes < PAR - PARS.length) return send(400, { error: 'That score isn\'t possible' });

      if (!(await rateLimit(`golf:rl:${clientIp(req)}`, RATE_MAX, RATE_WINDOW_S))) return send(429, { error: 'Too many saves — try again in a minute' });

      const key = keyOf(holes, course), t = Date.now();
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
