// Audit 2.1 (server side): a sign-in lasts 30 days from its last use, not from when it was made.
//   node tools/test/session-slide.js
// Runs api/_redis.js's sessionId() against a fake Redis: a session with 2 days left is used, and should have 30 again.
const path = require('path');
process.env.KV_REST_API_URL = 'https://fake.upstash.io'; process.env.KV_REST_API_TOKEN = 'tok';
const kv = new Map(), ttl = new Map();
global.fetch = async (url, opts) => ({ ok: true, json: async () => JSON.parse(opts.body).map(([cmd, k, v]) => {
  if (cmd === 'GET') return { result: kv.has(k) ? kv.get(k) : null };
  if (cmd === 'EXPIRE') { if (!kv.has(k)) return { result: 0 }; ttl.set(k, +v); return { result: 1 }; }
  return { error: 'fake: unknown ' + cmd };
}) });
const { sessionId, SESSION_S } = require(path.join(__dirname, '..', '..', 'api', '_redis.js'));
(async () => {
  const tok = 'a'.repeat(64), key = `golf:sess:${tok}`;
  kv.set(key, 'someone'); ttl.set(key, 2 * 24 * 3600);
  const id = await sessionId({ headers: { authorization: `Bearer ${tok}` } });
  const dead = await sessionId({ headers: { authorization: `Bearer ${'b'.repeat(64)}` } });
  console.log(`session -> ${id}; days left after use: ${ttl.get(key) / 86400} (want ${SESSION_S / 86400}); a gone session -> ${dead}, kept gone: ${!kv.has('golf:sess:' + 'b'.repeat(64))}`);
})();
