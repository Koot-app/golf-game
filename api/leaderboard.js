// Shared test-round leaderboard, stored in Upstash Redis (REST API, no dependencies).
//
//   GET  /api/leaderboard?holes=9            -> { top: [...10], total }
//   POST /api/leaderboard  { name, strokes, putts, par, holes, scores: [per-hole strokes] }
//                                           -> { entry, rank, total, top }
//
// Credentials come from the Vercel project's environment variables. Connecting Upstash through Vercel's Storage tab
// sets KV_REST_API_URL / KV_REST_API_TOKEN; adding them by hand from the Upstash console uses UPSTASH_REDIS_REST_URL /
// UPSTASH_REDIS_REST_TOKEN. Either pair works.
//
// Storage: one sorted set per round length, golf:lb:<holes>h. Score = strokes * 1000 + putts, so fewer strokes win and
// fewer putts break a tie; members are JSON strings that start with the 13-digit timestamp, so Redis's own tie order
// (by member) puts the earlier round first. The set is trimmed to the best MAX_KEEP rounds.
//
// The scores are submitted by the browser, so a determined player could post a fake one. The checks below stop
// malformed or impossible rounds and flooding (a few saves per minute per IP), not a careful cheat.

const MAX_KEEP = 1000;
const TOP_N = 10;
const RATE_MAX = 5, RATE_WINDOW_S = 60;

const URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

async function redis(commands) {
  const r = await fetch(`${URL}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(commands),
  });
  if (!r.ok) throw new Error(`Upstash ${r.status}`);
  const out = await r.json();
  for (const x of out) if (x && x.error) throw new Error(`Upstash: ${x.error}`);
  return out.map((x) => x.result);
}

const isInt = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;

// Only well-formed fields go out, whatever is in the database.
function clean(member) {
  try {
    const e = JSON.parse(member);
    if (!/^[A-Z0-9]{3}$/.test(e.name) || !isInt(e.strokes, 1, 999) || !isInt(e.putts, 0, 999) || !isInt(e.par, 1, 999)) return null;
    return { t: +e.t || 0, name: e.name, strokes: e.strokes, putts: e.putts, par: e.par, toPar: e.strokes - e.par };
  } catch { return null; }
}

function readBody(req) {
  if (req.body && typeof req.body === 'object') return Promise.resolve(req.body);
  if (typeof req.body === 'string') return Promise.resolve(JSON.parse(req.body || '{}'));
  return new Promise((resolve, reject) => {
    let s = '';
    req.on('data', (c) => { s += c; if (s.length > 4096) reject(new Error('too large')); });
    req.on('end', () => { try { resolve(JSON.parse(s || '{}')); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const send = (code, obj) => res.status(code).json(obj);
  if (!URL || !TOKEN) return send(503, { error: 'Leaderboard storage is not configured' });

  try {
    if (req.method === 'GET') {
      const holes = parseInt((req.query && req.query.holes) || '9', 10);
      if (!isInt(holes, 1, 18)) return send(400, { error: 'Bad holes' });
      const key = `golf:lb:${holes}h`;
      const [members, total] = await redis([['ZRANGE', key, 0, TOP_N - 1], ['ZCARD', key]]);
      return send(200, { top: members.map(clean).filter(Boolean), total });
    }

    if (req.method === 'POST') {
      const b = await readBody(req);
      const { name, strokes, putts, par, holes, scores } = b || {};
      // a believable round: three initials, whole numbers, a per-hole card that adds up
      if (typeof name !== 'string' || !/^[A-Z0-9]{3}$/.test(name)) return send(400, { error: 'Initials must be 3 letters or digits' });
      if (!isInt(holes, 1, 18) || !isInt(par, holes * 3, holes * 5)) return send(400, { error: 'Bad course' });
      if (!Array.isArray(scores) || scores.length !== holes || !scores.every((s) => isInt(s, 1, 40))) return send(400, { error: 'Bad scorecard' });
      if (!isInt(strokes, holes, holes * 40) || scores.reduce((a, s) => a + s, 0) !== strokes) return send(400, { error: 'Scorecard does not add up' });
      if (!isInt(putts, 0, strokes - 1)) return send(400, { error: 'Bad putts' });

      const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
      const rlKey = `golf:rl:${ip}`;
      const [, count] = await redis([['SET', rlKey, 0, 'EX', RATE_WINDOW_S, 'NX'], ['INCR', rlKey]]);
      if (count > RATE_MAX) return send(429, { error: 'Too many saves — try again in a minute' });

      const key = `golf:lb:${holes}h`, t = Date.now();
      const id = Math.random().toString(36).slice(2, 8);                 // two identical rounds in the same ms stay two
      const member = JSON.stringify({ t, id, name, strokes, putts, par });
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
