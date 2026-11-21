// FRIENDS INVITATIONALS (user request, 2026-11-20), the server side (api/challenge.js): four players by the API, the host
// invites three, two accept, one declines; the host starts it; cards go in hole by hole; it settles. Stroke play (the
// pot to the lowest net, handicap strokes to the best in the field) and skins (the one lowest net on a hole takes it,
// a tie carries, unclaimed skins go back). Then the edges: a forfeit, calling it off, a start with nobody in.
// DEV server only.
//   node tools/test/probe.js http://127.0.0.1:8090/ - @tools/test/inv-api.js 0 inv-api
(async () => {
  const out = [], say = (ok, t) => out.push(`${(ok ? 'ok' : 'FAIL').padEnd(5)} ${t}`);
  const post = (token, action, body = {}, path = '/api/challenge') => fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify({ action, ...body }) }).then(async (r) => ({ status: r.status, ...(await r.json().catch(() => ({}))) }));
  const tag = Date.now() % 1e7;
  // handicap rounds: gross over par 35 at the muni -> handicaps about 2, 6, 10, 14
  const rounds = (over) => [0, 1, 2].map((k) => ({ gross: 35 + over, par: 35, tier: 1, date: Date.now() - k * 1000 }));
  const mk = async (n, over) => { const r = await post(null, 'signup', { name: n, password: 'testpass1', career: { v: 1, name: n, stats: { power: 2, dex: 2, composure: 2, perception: 2 }, cash: 1000, rep: 0, tier: 1, tierMax: 1, history: [], rounds: rounds(over) } }, '/api/profile'); return { name: n, id: n.toLowerCase(), token: r.token }; };
  const P = [await mk('Ho' + tag, 2), await mk('Aa' + tag, 6), await mk('Bb' + tag, 10), await mk('Cc' + tag, 14)];
  if (P.some((p) => !p.token)) return 'sign-ups refused (rate limit?)';
  const cash = async (p) => { const r = await post(p.token, 'load', {}, '/api/profile'); return r.career ? r.career.cash : NaN; };
  const PARS = [5, 3, 4, 4, 3, 5, 4, 3, 4];
  const play = async (p, id, over) => {                     // nine holes, then the card: par + over[i] on each
    for (let i = 0; i < 9; i++) await post(p.token, 'hole', { id, i, strokes: PARS[i] + over[i], putts: 2, pen: 0 });
    return post(p.token, 'submit', { id, card: PARS.map((x, i) => ({ strokes: x + over[i], putts: 2, pen: 0 })) });
  };
  const [H, A, B, C] = P;
  // ---- 1. stroke play, $100 each, handicaps on
  let r = await post(H.token, 'invite', { to: [A.id, B.id, C.id], format: 'stroke', stake: 100, tier: 1, hcp: 'auto' });
  say(r.status === 200 && r.challenge.kind === 'inv' && r.challenge.players.length === 4, `invite 3 friends to stroke play: ${r.status} ${r.error || `${r.challenge.players.length} players, the host's stake held ${!!r.challenge.held[H.id]}`}`);
  const id = r.challenge.id;
  say((await cash(H)) === 900, `the host's $100 is held at once (cash ${await cash(H)})`);
  r = await post(H.token, 'start', { id }); say(r.status === 400, `start with only the host in is refused: "${r.error}"`);
  r = await post(A.token, 'accept', { id }); say(r.status === 200 && r.challenge.accepted[A.id], `A accepts (cash ${await cash(A)})`);
  r = await post(B.token, 'accept', { id }); say(r.status === 200, `B accepts (cash ${await cash(B)})`);
  r = await post(C.token, 'decline', { id }); say(r.status === 200 && r.challenge.declined[C.id], `C declines (cash ${await cash(C)}, untouched)`);
  r = await post(A.token, 'start', { id }); say(r.status === 400, `only the host starts it: "${r.error}"`);
  r = await post(H.token, 'start', { id });
  const st = r.challenge || {};
  say(r.status === 200 && st.status === 'open' && st.field.length === 3, `the host starts it: ${st.status}, field ${(st.field || []).length} (C left out) · strokes ${JSON.stringify(st.strokes)} (${st.why})`);
  r = await post(C.token, 'hole', { id, i: 0, strokes: 5, putts: 2, pen: 0 }); say(r.status === 400, `C, left out, can't send a hole: "${r.error}"`);
  // gross: H +2, A +4, B +5 a hole spread over the nine; with strokes H 0, A ~4, B ~8 the net decides
  const spread = (n) => PARS.map((_, i) => (i < n % 9 ? 1 : 0) + Math.floor(n / 9));
  await play(H, id, spread(2)); await play(A, id, spread(4));
  r = await play(B, id, spread(5));
  const res = (r.challenge || {}).result || {};
  say(r.challenge && r.challenge.status === 'done', `all three cards in: settled, "${res.line}"`);
  out.push(`      standings (net): ${(res.standings || []).map((s) => `${st.names[s.p]} ${s.net} (gross ${s.gross})`).join(' · ')}`);
  const cs = { H: await cash(H), A: await cash(A), B: await cash(B), C: await cash(C) };
  say(cs.H + cs.A + cs.B === 3000 && cs.C === 1000, `money: ${JSON.stringify(cs)} · the three in the field still hold $3,000 between them, C untouched`);
  // ---- 2. skins, $10 a hole, handicaps off: H wins holes 1-2, A hole 3, ties after, B wins the last
  const before = { H: await cash(H), A: await cash(A), B: await cash(B) };            // (before the invite takes the host's stake)
  r = await post(H.token, 'invite', { to: [A.id, B.id], format: 'skins', stake: 10, tier: 1, hcp: 'off' });
  const sid = r.challenge.id;
  await post(A.token, 'accept', { id: sid }); await post(B.token, 'accept', { id: sid }); await post(H.token, 'start', { id: sid });
  const z = [0, 0, 0, 0, 0, 0, 0, 0, 0], set = (a, k, v) => { const c = a.slice(); c[k] = v; return c; };
  await play(H, sid, set(set(set(set(set(set(set(z, 0, -1), 1, -1), 2, 1), 3, 0), 4, 0), 5, 0), 8, 1));
  await play(A, sid, set(set(set(z, 0, 0), 2, -1), 8, 1));
  r = await play(B, sid, set(z, 8, -1));
  const sr = (r.challenge || {}).result || {}, after = { H: await cash(H), A: await cash(A), B: await cash(B) };
  const d = { H: after.H - before.H, A: after.A - before.A, B: after.B - before.B };
  say(sr.kind === 'played', `skins settled: "${sr.line}" · by hole ${JSON.stringify((sr.skins || {}).byHole)}`);
  say(d.H + d.A + d.B === 0 && d.H === -30 && d.A === -60 && d.B === 90, `skins money moves ${JSON.stringify(d)} (want H −30: 2 skins of $30 less $90 in; A −60; B +90: 6 carried skins) and adds up to nothing`);
  // ---- 3. a forfeit: two play, the third forfeits; the forfeiter's stake stays in the pot
  const b3 = { H: await cash(H), A: await cash(A), B: await cash(B) };
  r = await post(H.token, 'invite', { to: [A.id, B.id], format: 'stroke', stake: 50, tier: 1, hcp: 'off' });
  const fid = r.challenge.id;
  await post(A.token, 'accept', { id: fid }); await post(B.token, 'accept', { id: fid }); await post(H.token, 'start', { id: fid });
  await play(H, fid, z); r = await post(B.token, 'forfeit', { id: fid }); say(r.status === 200 && r.challenge.status === 'open', `B forfeits; it waits for A (${r.challenge && r.challenge.status})`);
  r = await play(A, fid, spread(3));
  const a3 = { H: await cash(H), A: await cash(A), B: await cash(B) };
  say(a3.H - b3.H === 100 && a3.A - b3.A === -50 && a3.B - b3.B === -50, `H wins the $150 pot: moves H ${a3.H - b3.H}, A ${a3.A - b3.A}, B ${a3.B - b3.B} · "${r.challenge && r.challenge.result.line}"`);
  // ---- 4. called off before it starts: every stake back
  r = await post(H.token, 'invite', { to: [A.id, B.id], format: 'stroke', stake: 40, tier: 1, hcp: 'off' });
  const cid = r.challenge.id, b4 = { H: await cash(H), A: await cash(A) };
  await post(A.token, 'accept', { id: cid });
  r = await post(H.token, 'cancel', { id: cid });
  say(r.status === 200 && r.challenge.status === 'closed' && (await cash(H)) === b4.H + 40 && (await cash(A)) === b4.A, `called off: closed, the host's and A's $40 back (H ${await cash(H) - b4.H}, A ${await cash(A) - b4.A} vs after accepting)`);
  // ---- 5. a list from a player's side: the others' cards hidden while it's open
  r = await post(H.token, 'invite', { to: [A.id, B.id], format: 'stroke', stake: 5, tier: 1, hcp: 'off' });
  const lid = r.challenge.id;
  await post(A.token, 'accept', { id: lid }); await post(H.token, 'start', { id: lid }); await play(H, lid, z);
  const la = (await post(A.token, 'list')).challenges.find((c) => c.id === lid);
  say(la && la.cards[H.id] === true && la.holes[H.id] === 9, `A's list: H's card shows only as in (${JSON.stringify(la && la.cards)}), holes ${JSON.stringify(la && la.holes)}`);
  return out.join('\n');
})()
