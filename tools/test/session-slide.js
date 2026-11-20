// Audits 2.1 and 3.9 (server side): a sign-in lasts 30 days from its last use, not from when it was made; but never
// more than 180 days in all. A session made before 3.9 (no "made" time) gets one when it's next used.
//   node tools/test/session-slide.js
// Runs api/_redis.js's sessionId() against a fake Redis.
const path = require('path');
process.env.KV_REST_API_URL = 'https://fake.upstash.io'; process.env.KV_REST_API_TOKEN = 'tok';
const kv = new Map(), ttl = new Map(), sets = new Map();
global.fetch = async (url, opts) => ({ ok: true, json: async () => JSON.parse(opts.body).map(([cmd, k, v, ...rest]) => {
  if (cmd === 'GET') return { result: kv.has(k) ? kv.get(k) : null };
  if (cmd === 'EXPIRE') { if (!kv.has(k)) return { result: 0 }; ttl.set(k, +v); return { result: 1 }; }
  if (cmd === 'SET') { kv.set(k, String(v)); const i = rest.indexOf('EX'); if (i >= 0) ttl.set(k, +rest[i + 1]); return { result: 'OK' }; }
  if (cmd === 'DEL') return { result: kv.delete(k) ? 1 : 0 };
  if (cmd === 'SADD') { if (!sets.has(k)) sets.set(k, new Set()); sets.get(k).add(v); return { result: 1 }; }
  if (cmd === 'SREM') return { result: sets.has(k) && sets.get(k).delete(v) ? 1 : 0 };
  return { error: 'fake: unknown ' + cmd };
}) });
const { sessionId, SESSION_S } = require(path.join(__dirname, '..', '..', 'api', '_redis.js'));
const use = (tok) => sessionId({ headers: { authorization: `Bearer ${tok}` } });
(async () => {
  const out = [], DAY = 86400000;
  // a session made 10 days ago, with 2 days left: used, it has 30 again
  const a = 'a'.repeat(64);
  kv.set(`golf:sess:${a}`, `someone~${Date.now() - 10 * DAY}`); ttl.set(`golf:sess:${a}`, 2 * 24 * 3600);
  const id = await use(a);
  out.push(`${id === 'someone' && ttl.get(`golf:sess:${a}`) === SESSION_S ? 'ok  ' : 'FAIL'} a session in use: ${id}; days left after use ${ttl.get(`golf:sess:${a}`) / 86400} (want ${SESSION_S / 86400})`);
  // a session gone: stays gone
  const dead = await use('b'.repeat(64));
  out.push(`${dead === null && !kv.has(`golf:sess:${'b'.repeat(64)}`) ? 'ok  ' : 'FAIL'} a session that has gone -> ${dead}, kept gone`);
  // a session made 181 days ago, used every day (so never idle 30 days): ends anyway, and comes off the list
  const c = 'c'.repeat(64);
  kv.set(`golf:sess:${c}`, `someone~${Date.now() - 181 * DAY}`); sets.set('golf:sessions:someone', new Set([c]));
  const old = await use(c);
  out.push(`${old === null && !kv.has(`golf:sess:${c}`) && !sets.get('golf:sessions:someone').has(c) ? 'ok  ' : 'FAIL'} a session made 181 days ago -> ${old}; deleted ${!kv.has(`golf:sess:${c}`)}, off the profile's list ${!sets.get('golf:sessions:someone').has(c)}`);
  // a session from before 3.9 (no "made" time): still works, and is stamped now and put on the profile's list
  const d = 'd'.repeat(64);
  kv.set(`golf:sess:${d}`, 'someone');
  const pre = await use(d), v = kv.get(`golf:sess:${d}`);
  out.push(`${pre === 'someone' && /^someone~\d+$/.test(v) && sets.get('golf:sessions:someone').has(d) ? 'ok  ' : 'FAIL'} a session from before: ${pre}; now stored as "${v.replace(/\d+$/, '<now>')}", on the profile's list ${sets.get('golf:sessions:someone').has(d)}`);
  console.log(out.join('\n'));
})();
