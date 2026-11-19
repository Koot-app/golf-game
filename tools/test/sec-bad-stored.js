// Audit 3.2: careers stored BEFORE the save-time check (bad shapes already in the database) don't break anyone else.
//   node tools/test/sec-bad-stored.js
// Loads api/profile.js and api/challenge.js against an in-memory fake Redis holding one good and one broken career,
// then calls the sign-in list, Friends, a trophy room, and a challenge payout to the broken player's opponent.
const path = require('path');
process.env.KV_REST_API_URL = 'https://fake.upstash.io'; process.env.KV_REST_API_TOKEN = 'tok';
const kv = new Map(), hashes = new Map(), sets = new Map();
const H = (k) => { if (!hashes.has(k)) hashes.set(k, new Map()); return hashes.get(k); };
function run([cmd, ...a]) {
  switch (cmd) {
    case 'GET': return kv.has(a[0]) ? kv.get(a[0]) : null;
    case 'SET': if (a.includes('NX') && kv.has(a[0])) return null; kv.set(a[0], String(a[1])); return 'OK';
    case 'DEL': return kv.delete(a[0]) ? 1 : 0;
    case 'INCR': { const v = (+kv.get(a[0]) || 0) + 1; kv.set(a[0], String(v)); return v; }
    case 'EXPIRE': return kv.has(a[0]) ? 1 : 0;
    case 'HGET': return hashes.has(a[0]) && hashes.get(a[0]).has(a[1]) ? hashes.get(a[0]).get(a[1]) : null;
    case 'HMGET': return a.slice(1).map((f) => (hashes.has(a[0]) && hashes.get(a[0]).has(f) ? hashes.get(a[0]).get(f) : null));
    case 'HSET': { const h = H(a[0]); for (let i = 1; i < a.length; i += 2) h.set(a[i], String(a[i + 1])); return 1; }
    case 'SMEMBERS': return sets.has(a[0]) ? [...sets.get(a[0])] : [];
    case 'SADD': { if (!sets.has(a[0])) sets.set(a[0], new Set()); sets.get(a[0]).add(String(a[1])); return 1; }
    case 'EVAL': { const [, , key, want, data] = a, h = H(key), v = h.get('ver') || '0'; if (v !== String(want)) return -1; h.set('data', data); h.set('ver', String(+want + 1)); return +want + 1; }
    default: return { error: 'fake: unknown ' + cmd };
  }
}
global.fetch = async (url, opts) => ({ ok: true, json: async () => JSON.parse(opts.body).map((c) => { const r = run(c); return r && r.error ? r : { result: r }; }) });
const api = (f) => require(path.join(__dirname, '..', '..', 'api', f));
const profile = api('profile.js'), challenge = api('challenge.js');
const call = (fn, token, body) => new Promise((resolve) => {
  const res = { code: 200, setHeader() {}, status(c) { this.code = c; return this; }, json(o) { resolve({ status: this.code, ...o }); } };
  fn({ method: 'POST', headers: token ? { authorization: `Bearer ${token}` } : {}, body, socket: {} }, res);
});
const good = { v: 1, name: 'Goodie', cash: 300, stats: {}, history: [], rounds: [], tierMax: 1 };
const bad = { v: 1, name: 'Broken', cash: 'lots', stats: 7, history: 'x', rounds: 'xxx', titles: 5, showcase: 'no', tierMax: 'ten' };
for (const [id, c] of [['goodie', good], ['broken', bad]]) { H(`golf:career:${id}`).set('data', JSON.stringify(c)); H(`golf:career:${id}`).set('ver', '1'); H(`golf:user:${id}`).set('name', c.name); run(['SADD', 'golf:players', id]); }
const tG = 'a'.repeat(64); kv.set(`golf:sess:${tG}`, 'goodie');
// a challenge Goodie won against Broken, both stakes held, not yet paid
const cid = 'abcdefabcdef0123', E = 200;
const holes = Array.from({ length: 9 }, () => ({ strokes: 4, putts: 2, pen: 0 }));
kv.set(`golf:ch:${cid}`, JSON.stringify({ id: cid, from: 'broken', to: 'goodie', names: { broken: 'Broken', goodie: 'Goodie' }, format: 'match', stake: E, tier: 1, hcp: 'off', status: 'done',
  created: 1, accepted: 1, deadline: Date.now() + 1e9, finished: Date.now(), held: { broken: true, goodie: true }, cards: { broken: holes.map((h) => ({ ...h, strokes: 6 })), goodie: holes }, strokes: { player: null, n: 0 },
  result: { kind: 'played', winner: 'goodie', line: 'Goodie wins 5 & 4', holes: [], payout: { goodie: 2 * E, broken: 0 }, net: { goodie: E, broken: -E } } }));
run(['SADD', 'golf:chs:goodie', cid]);
(async () => {
  const ro = await call(profile, null, { action: 'roster' });
  console.log(`sign-in list: ${ro.status} · ${(ro.players || []).map((p) => `${p.name} cash ${p.cash} tier ${p.tierMax} rounds ${p.rounds}`).join(' | ')}`);
  const pl = await call(profile, tG, { action: 'players' });
  console.log(`Friends list: ${pl.status} · ${(pl.players || []).map((p) => `${p.name} cash ${p.cash}`).join(' | ')}`);
  const sc = await call(profile, tG, { action: 'showcase', name: 'broken' });
  console.log(`Broken's trophy room: ${sc.status} · history ${JSON.stringify(sc.player && sc.player.history)} · titles ${JSON.stringify(sc.player && sc.player.titles)}`);
  const li = await call(challenge, tG, { action: 'list' });
  const paid = JSON.parse(hashes.get('golf:career:goodie').get('data')).cash;
  console.log(`challenge list (pays out): ${li.status} · Goodie's cash 300 -> ${paid} (want ${300 + 2 * E}) · Broken's career after: history ${JSON.stringify(JSON.parse(hashes.get('golf:career:broken').get('data')).history.length)} line(s), cash ${JSON.parse(hashes.get('golf:career:broken').get('data')).cash}`);
})();
