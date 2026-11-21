// Challenges between friends (MULTIPLAYER_PLAN.md, M3): one player challenges another to a 9-hole round for money; each
// plays it on their own PC whenever they like, and when both cards are in this file settles the bet, so both players
// always see the same result.
//
//   POST /api/challenge  { action, ... }   (Authorization: Bearer <session token>, as api/profile.js)
//     create  { to, format, stake, tier, hcp }  -> { challenge }      hcp: 'auto' | 'off' | { strokes, to }
//     list                                      -> { challenges: [...newest first], me }
//     create takes the challenger's stake (escrow) at once; accept takes the other player's
//     accept  { id }   (the one challenged)     -> { challenge }      takes the stake from the one challenged (escrow)
//     decline { id }   (the one challenged) / cancel { id } (the challenger): a pending challenge is closed, the
//                                               challenger's stake goes back (so it does when nobody answers in 7 days)
//     submit  { id, card: [{ strokes, putts, pen }] x 9 }  -> { challenge }   settles when both cards are in
//     forfeit { id }                            -> { challenge }      the other player wins
//
// FRIENDS INVITATIONALS (user request, 2026-11-20): the same thing for two or more players. One player invites any
// number of friends to a nine-hole round, stroke play or skins, for a stake each; each invitee accepts (their stake is
// held) or declines; the host starts it once at least two players (the host included) are in, and whoever hasn't
// accepted by then is left out and pays nothing. Then it plays like a challenge: each on their own PC, hole by hole,
// within 7 days. Stroke play: the lowest net total takes the whole pot (a tie splits it). Skins: each hole's skin is
// the stake from every player, won by the one lowest net score, a tie carries. Handicaps: each player gets the strokes
// between their handicap and the best in the field (or none, hcp 'off'; none for anyone if a player has no handicap).
//     invite  { to: [ids], format: 'stroke' | 'skins', stake, tier, hcp: 'auto' | 'off' }  -> { challenge }  (kind 'inv';
//             the host's stake is held at once)
//     accept / decline (an invitee; declining after accepting gives the stake back) · cancel (the host, before it starts)
//     start   { id } (the host) · hole / submit / forfeit as a challenge (players in the field)
// An invitational: { kind: 'inv', id, host, players: [ids, the host first], names, format, stake, tier, hcp, status,
// accepted: { [id]: true }, declined: { [id]: true }, field: [ids who play, fixed at the start], strokes: { [id]: n },
// why, started, deadline, held, cards, holes, forfeits: { [id]: 'forfeit' | 'expired' }, result, paid }.
//
// A challenge (golf:ch:<cid>, JSON): { id, from, to, names, format, stake, tier, hcp, strokes: { player, n }, status:
// 'pending' | 'open' | 'done' | 'closed', created, accepted, deadline, held: { [id]: true }, cards: { [id]: [...] },
// result: { kind, winner, net: { [id]: n }, line, holes }, paid: { [id]: true } }. golf:chs:<id> = the set of a
// player's challenge ids. Changes to one challenge take a short lock (golf:chlock:<cid>), and money moves through
// updateCareer() (compare-and-set on the career), each step marked in `held` / `paid` so nothing is taken or paid twice.

const crypto = require('crypto');
const { redis, readBody, sessionId, updateCareer, rateLimit } = require('./_redis');

const FORMATS = ['match', 'stroke', 'skins'];
const HOLES = 9;
// each hole's stroke index (1 = hardest), by circuit — the `si` in index.html's HOLES (the muni), HOLES_T2 (the club's
// own course) and HOLES_T3 (the country club's own course), both since 2026-11-20
const SI_BASE = [5, 9, 4, 2, 7, 3, 6, 8, 1];
const SI_BY_TIER = { 1: SI_BASE, 2: [7, 5, 3, 6, 1, 8, 2, 9, 4], 3: [3, 7, 5, 4, 6, 8, 1, 9, 2] };
const DAYS = 7 * 24 * 3600 * 1000;               // to play it, once accepted (and how long an unanswered one waits)
const KEEP = 60 * 24 * 3600 * 1000;              // finished challenges drop off the list after this
const MAX_ACTIVE = 12;                           // pending + open challenges a player can be in
const MAX_STAKE = 100000;

// a career's handicap: _career.js (shared with api/profile.js, and the same as handicapOf() in index.html)
const { handicapOf, outcomeFor, invPairs } = require('./_career');
// strokes received on each hole: one on every hole whose stroke index is ≤ n, two on the hardest past 9 (same in index.html)
const holeStrokes = (n, tier) => (SI_BY_TIER[tier] || SI_BASE).map((si) => (si <= n ? 1 : 0) + (si <= n - HOLES ? 1 : 0));
const escrowOf = (ch) => ch.stake * (ch.format === 'skins' ? HOLES : 1);
const other = (ch, id) => (ch.from === id ? ch.to : ch.from);
// (an invitational, or a challenge: everyone it concerns, the ones who may have a stake held)
const isInv = (ch) => ch && ch.kind === 'inv';
const peopleOf = (ch) => (isInv(ch) ? ch.players : [ch.from, ch.to]);
const INV_FORMATS = ['stroke', 'skins'];
const INV_MAX = 16;                              // players in an invitational, the host included
const parse = (s) => { try { return JSON.parse(s); } catch { return null; } };
const fail = (status, message) => Object.assign(new Error(message), { status });

async function getCareer(id) {
  const [d] = await redis([['HGET', `golf:career:${id}`, 'data']]);
  return parse(d);
}
async function getCh(cid) {
  if (!/^[a-f0-9]{16}$/.test(String(cid))) return null;
  const [s] = await redis([['GET', `golf:ch:${cid}`]]);
  return parse(s);
}
// many at once, in one round trip (audit 3.9: the list read them one call each, so a flooded player's Friends page
// slowed down and could time out); a bad id gives null
async function getChs(cids) {
  const ok = cids.filter((c) => /^[a-f0-9]{16}$/.test(String(c)));
  const rows = ok.length ? await redis(ok.map((c) => ['GET', `golf:ch:${c}`])) : [];
  const by = new Map(ok.map((c, i) => [c, parse(rows[i])]));
  return cids.map((c) => by.get(c) || null);
}
const isActive = (c) => c && (c.status === 'pending' || c.status === 'open');
const putCh = (ch) => redis([['SET', `golf:ch:${ch.id}`, JSON.stringify(ch)]]);
// do fn(challenge) while holding its lock (another request on the same challenge waits its turn or is told to retry).
// The lock holds this request's own token, and is released only if it still does (audit 1.6: a slow request used to
// delete a lock that had run out and been taken by the next one).
const UNLOCK = `if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) end
return 0`;
async function withLock(cid, fn) {
  const key = `golf:chlock:${cid}`, token = crypto.randomBytes(8).toString('hex');
  let got = null;
  for (let i = 0; i < 8 && !got; i++) {
    [got] = await redis([['SET', key, token, 'NX', 'EX', 20]]);
    if (!got) await new Promise((r) => setTimeout(r, 150));
  }
  if (!got) throw fail(409, 'Busy — try again');
  try {
    const ch = await getCh(cid);
    if (!ch) throw fail(404, 'No such challenge');
    return await fn(ch);
  } finally { await redis([['EVAL', UNLOCK, 1, key, token]]); }
}

// ---- AUDIT 1.6: every stake moves in ONE write to the player's career, together with its own record of that move,
// so a request that dies half-way (or a write to the challenge that fails after the money moved) can be run again
// without paying twice or losing the stake:
//   - c.escrow lists the challenges holding a stake of this player's. Taking a stake adds the id (and does nothing if it's
//     already there); giving it back or paying out removes it (and does nothing if it isn't).
//   - a payout writes the history line that carries the challenge id; a line already there means it was paid.
// The challenge's own `held` / `paid` marks are kept, but only to save work: the career's record decides. (A challenge
// made before this has ch.esc unset: its stakes aren't in anyone's escrow, so it goes by `held` as before.)
const escOf = (c) => (Array.isArray(c.escrow) ? c.escrow : []);
const takeStake = (p, ch, E, short) => updateCareer(p, (c) => {
  if (escOf(c).includes(ch.id)) return false;               // taken already
  if ((c.cash || 0) < E) throw fail(400, short);
  c.cash -= E; c.escrow = [...escOf(c), ch.id];
});
const giveBack = (p, ch, E) => updateCareer(p, (c) => {
  if (escOf(c).includes(ch.id)) { c.cash = (c.cash || 0) + E; c.escrow = escOf(c).filter((x) => x !== ch.id); return; }
  if (ch.esc || !(ch.held && ch.held[p])) return false;     // nothing of theirs held (never taken, or given back already)
  c.cash = (c.cash || 0) + E;                               // (an older challenge: as before)
});

// who gets strokes in this challenge: auto = the difference of the two handicaps, rounded, to the higher one
function strokesFor(ch, cFrom, cTo) {
  if (ch.hcp === 'off') return { player: null, n: 0, why: 'off' };
  if (ch.hcp && typeof ch.hcp === 'object') return { player: ch.hcp.n ? ch.hcp.to : null, n: ch.hcp.n, why: 'agreed' };
  const hf = handicapOf(cFrom), ht = handicapOf(cTo);
  if (hf === null || ht === null) return { player: null, n: 0, why: 'nohcp' };
  const n = Math.min(18, Math.round(Math.abs(hf - ht)));
  return { player: n ? (hf > ht ? ch.from : ch.to) : null, n, why: 'auto', hcps: { [ch.from]: hf, [ch.to]: ht } };
}

// ---- settlement: net scores per hole after the strokes, then by format
function score(ch) {
  const a = ch.from, b = ch.to, give = holeStrokes(ch.strokes.n, ch.tier);
  const net = (p, i) => ch.cards[p][i].strokes - (p === ch.strokes.player ? give[i] : 0);
  const holes = [];
  for (let i = 0; i < HOLES; i++) holes.push({ [a]: net(a, i), [b]: net(b, i) });
  const E = escrowOf(ch);
  let won = { [a]: 0, [b]: 0 }, line, winner = null;
  const nameOf = (p) => ch.names[p];
  if (ch.format === 'match') {
    let d = 0, dec = '';
    holes.forEach((h, i) => {
      d += h[a] < h[b] ? 1 : h[a] > h[b] ? -1 : 0;
      const left = HOLES - 1 - i;
      if (!dec && Math.abs(d) > left) dec = left ? `${Math.abs(d)} & ${left}` : `${Math.abs(d)} up`;
    });
    winner = d > 0 ? a : d < 0 ? b : null;
    line = winner ? `${nameOf(winner)} wins ${dec}` : 'All square: entries returned';
    if (winner) { won[winner] = 2 * E; } else { won[a] = E; won[b] = E; }
  } else if (ch.format === 'stroke') {
    const ta = holes.reduce((s, h) => s + h[a], 0), tb = holes.reduce((s, h) => s + h[b], 0);
    winner = ta < tb ? a : tb < ta ? b : null;
    line = winner ? `${nameOf(winner)} wins by ${Math.abs(ta - tb)} (net ${Math.min(ta, tb)} to ${Math.max(ta, tb)})` : `Tied on net ${ta}: entries returned`;
    if (winner) won[winner] = 2 * E; else { won[a] = E; won[b] = E; }
  } else {                                                    // skins: each hole a skin from each; a halved hole carries
    let carry = 0, sa = 0, sb = 0;
    for (const h of holes) {
      carry++;
      if (h[a] < h[b]) { sa += carry; carry = 0; } else if (h[b] < h[a]) { sb += carry; carry = 0; }
    }
    const diff = (sa - sb) * ch.stake;                        // unclaimed skins at the end go back to both
    won[a] = E + diff; won[b] = E - diff;
    winner = sa > sb ? a : sb > sa ? b : null;
    line = `Skins ${nameOf(a)} ${sa}, ${nameOf(b)} ${sb}${carry ? ` · ${carry} unclaimed, returned` : ''}${winner ? ` · ${nameOf(winner)} +$${Math.abs(diff)}` : ''}`;
  }
  return { kind: 'played', winner, line, holes, payout: won, net: { [a]: won[a] - E, [b]: won[b] - E } };
}
// someone forfeits (or ran out of time): the other takes the pot
function forfeitResult(ch, loser, why) {
  const w = other(ch, loser), E = escrowOf(ch);
  return { kind: why, winner: w, loser, line: `${ch.names[loser]} ${why === 'expired' ? 'ran out of time' : 'forfeited'}: ${ch.names[w]} wins`, payout: { [w]: 2 * E, [loser]: 0 }, net: { [w]: E, [loser]: -E } };
}
// ---- an invitational's settlement: the field's net scores, then stroke play or skins. Anyone in the field without a
// card (a forfeit, or out of time) plays no part in the scoring but their stake stays in the pot.
function scoreInv(ch) {
  const F = ch.field, N = F.length, E = escrowOf(ch), fin = F.filter((p) => Array.isArray(ch.cards[p]));
  const payout = Object.fromEntries(F.map((p) => [p, 0])), nm = (p) => ch.names[p];
  if (!fin.length) {                                          // nobody played: everyone's stake back
    for (const p of F) payout[p] = E;
    return { kind: 'refund', winner: null, line: 'Nobody played it in time: entries returned', payout, net: Object.fromEntries(F.map((p) => [p, 0])) };
  }
  const give = Object.fromEntries(fin.map((p) => [p, holeStrokes((ch.strokes && ch.strokes[p]) || 0, ch.tier)]));
  const net = (p, i) => ch.cards[p][i].strokes - give[p][i];
  const totals = Object.fromEntries(fin.map((p) => [p, ch.cards[p].reduce((s, _, i) => s + net(p, i), 0)]));
  const standings = fin.map((p) => ({ p, net: totals[p], gross: ch.cards[p].reduce((s, h) => s + h.strokes, 0) })).sort((a, b) => a.net - b.net);
  let line, winner = null, skins = null;
  if (ch.format === 'stroke') {
    const best = standings[0].net, top = standings.filter((s) => s.net === best).map((s) => s.p), pot = N * E;
    const share = Math.floor(pot / top.length);
    top.forEach((p, k) => { payout[p] += share + (k === 0 ? pot - share * top.length : 0); });     // (an odd dollar to the first)
    winner = top.length === 1 ? top[0] : null;
    line = winner ? `${nm(winner)} wins with net ${best}${standings[1] ? `, ${standings[1].net - best} clear` : ''}` : `${top.map(nm).join(' and ')} tie on net ${best}: they split the prize`;
  } else {                                                    // skins: each hole the stake from everyone in the field
    let carry = 0;
    const won = Object.fromEntries(fin.map((p) => [p, 0])), byHole = [];
    for (let i = 0; i < HOLES; i++) {
      carry++;
      const low = Math.min(...fin.map((p) => net(p, i))), at = fin.filter((p) => net(p, i) === low);
      if (at.length === 1) { payout[at[0]] += carry * ch.stake * N; won[at[0]] += carry; byHole.push(at[0]); carry = 0; } else byHole.push(null);
    }
    if (carry) for (const p of F) payout[p] += carry * ch.stake;          // unclaimed skins go back to everyone who put them up
    skins = { won, byHole, unclaimed: carry };
    const order = fin.filter((p) => won[p]).sort((a, b) => won[b] - won[a]);
    line = `Skins ${order.length ? order.map((p) => `${nm(p)} ${won[p]}`).join(', ') : 'none won'}${carry ? ` · ${carry} unclaimed, returned` : ''}`;
  }
  const netMoney = Object.fromEntries(F.map((p) => [p, payout[p] - E]));
  if (!winner) { const best = Math.max(...F.map((p) => netMoney[p])), top = F.filter((p) => netMoney[p] === best); if (best > 0 && top.length === 1) winner = top[0]; }
  return { kind: 'played', winner, line, payout, net: netMoney, standings, skins, forfeits: ch.forfeits || {} };
}
// one player's history word for an invitational: by the money (a forfeit or running out of time says so)
const invOutcome = (ch, res, p) => (res.kind === 'refund' ? 'refunded' : (ch.forfeits || {})[p] ? `lost (${ch.forfeits[p] === 'expired' ? 'out of time' : 'forfeit'})`
  : res.net[p] > 0 ? 'won' : res.net[p] < 0 ? 'lost' : 'halved');
// move the money (once per player) and write each player's history entry
async function payOut(ch) {
  if (!ch.result || !ch.result.payout) return ch;
  ch.paid = ch.paid || {};
  if (isInv(ch)) {                                            // an invitational: each player in the field, the same rules
    for (const p of ch.field || []) {
      if (ch.paid[p]) continue;
      const res = ch.result, n = (ch.field || []).length;
      try {
        await updateCareer(p, (c) => {
          const line = (c.history || []).some((h) => h && h.inv && h.ch === ch.id), esc = escOf(c).includes(ch.id);
          if (line) { if (!esc) return false; c.escrow = escOf(c).filter((x) => x !== ch.id); return; }
          if (!esc) return false;
          c.cash = (c.cash || 0) + (res.payout[p] || 0);
          c.escrow = escOf(c).filter((x) => x !== ch.id);
          // (vs: the head-to-head result against each other player, for the records: invPairs in _career.js)
          c.history.push({ inv: true, invName: `${ch.names[ch.host]}'s invitational (${n} players)`, ch: ch.id, format: ch.format, stake: ch.stake, result: `${invOutcome(ch, res, p)} · ${res.line}`, net: res.net[p] || 0, vs: invPairs(ch, p), date: Date.now() });
        });
      } catch { continue; }
      ch.paid[p] = true;
      await putCh(ch);
    }
    return ch;
  }
  for (const p of [ch.from, ch.to]) {
    if (ch.paid[p] || (!ch.esc && !(ch.held && ch.held[p]))) continue;
    const res = ch.result, net = res.net[p];
    const outcome = outcomeFor(res, p);
    // each player on their own (audit 3.2): a failure paying one never stops the other; the unpaid one is retried by
    // `list`. Paid once (audit 1.6): the payout, its history line and the end of the escrow are one write, and a line
    // for this challenge already in the history means it was paid.
    try {
      await updateCareer(p, (c) => {
        const line = (c.history || []).some((h) => h && h.friend && h.ch === ch.id), esc = escOf(c).includes(ch.id);
        if (line) { if (!esc) return false; c.escrow = escOf(c).filter((x) => x !== ch.id); return; }      // paid already
        if (ch.esc && !esc) return false;                   // nothing of theirs was held (shouldn't happen)
        c.cash = (c.cash || 0) + (res.payout[p] || 0);
        c.escrow = escOf(c).filter((x) => x !== ch.id);
        c.history.push({ friend: other(ch, p), friendName: ch.names[other(ch, p)], ch: ch.id, format: ch.format, stake: ch.stake, result: `${outcome} · ${res.line}`, net, date: Date.now() });
      });
    } catch { continue; }
    ch.paid[p] = true;
    await putCh(ch);
  }
  return ch;
}
// a challenge closed without being played (declined, called off, not answered in time): any stake held goes back to
// its owner, once, with no history line (nothing happened). Once (audit 1.6): giveBack only returns a stake the career
// still lists as held.
async function refundHeld(ch) {
  const E = escrowOf(ch);
  ch.paid = ch.paid || {};
  for (const p of peopleOf(ch)) {
    if (ch.paid[p] || (!ch.esc && !(ch.held && ch.held[p]))) continue;
    await giveBack(p, ch, E);
    ch.paid[p] = true;
    await putCh(ch);
  }
  return ch;
}
// a stake held but not yet paid back or out (with escrow records, either player may have one, whatever `held` says)
const owed = (ch) => (isInv(ch) ? (ch.status === 'done' ? ch.field || [] : ch.players).filter((p) => ch.held && ch.held[p]) : [ch.from, ch.to])
  .some((p) => (ch.esc || (ch.held && ch.held[p])) && !(ch.paid || {})[p]);
async function finish(ch, result) {
  ch.status = result.kind === 'refund' ? 'closed' : 'done';
  ch.result = result; ch.finished = Date.now();
  await putCh(ch);
  return payOut(ch);
}
// past the deadline: whoever hasn't sent a card forfeits; if neither has, both get their stakes back
async function expire(ch) {
  if (ch.status !== 'open' || Date.now() <= ch.deadline) return ch;
  if (isInv(ch)) {                                            // an invitational: whoever hasn't a card in ran out of time
    ch.forfeits = ch.forfeits || {};
    for (const p of ch.field) if (!ch.cards[p] && !ch.forfeits[p]) ch.forfeits[p] = 'expired';
    return finish(ch, scoreInv(ch));
  }
  const inA = !!ch.cards[ch.from], inB = !!ch.cards[ch.to];
  if (inA && inB) return finish(ch, score(ch));
  if (inA || inB) return finish(ch, forfeitResult(ch, inA ? ch.to : ch.from, 'expired'));
  const E = escrowOf(ch);
  return finish(ch, { kind: 'refund', winner: null, line: 'Nobody played it in time: entries returned', payout: { [ch.from]: E, [ch.to]: E }, net: { [ch.from]: 0, [ch.to]: 0 } });
}
// what a player sees: the other player's card stays hidden until the challenge is settled
function view(ch, me) {
  if (isInv(ch)) {                                            // an invitational: the others' cards hidden until it settles
    const v = { ...ch, cards: { ...ch.cards } };
    if (ch.status === 'open') {
      for (const p of Object.keys(v.cards)) if (p !== me) v.cards[p] = true;
      v.holes = Object.fromEntries((ch.field || []).map((p) => [p, ((ch.holes || {})[p] || []).length]));
    } else delete v.holes;
    if (v.result) { v.result = { ...v.result }; delete v.result.payout; }
    delete v.paid;
    return v;
  }
  const v = { ...ch, cards: { ...ch.cards } };
  if (ch.status === 'open') {
    const o = other(ch, me); if (v.cards[o]) v.cards[o] = true;
    v.holes = { [me]: ((ch.holes || {})[me] || []).length, [o]: ((ch.holes || {})[o] || []).length };    // (how far each is: counts only)
  } else delete v.holes;
  if (v.result) { v.result = { ...v.result }; delete v.result.payout; }
  delete v.paid;
  return v;
}
function cleanHole(h) {
  const s = h && h.strokes, p = h && h.putts, pen = (h && h.pen) || 0;
  if (!Number.isInteger(s) || s < 1 || s > 30 || !Number.isInteger(p) || p < 0 || p > s || !Number.isInteger(pen) || pen < 0 || pen > s) return null;
  return { strokes: s, putts: p, pen };
}
function cleanCard(card) {
  if (!Array.isArray(card) || card.length !== HOLES) return null;
  const out = card.map(cleanHole);
  return out.every(Boolean) ? out : null;
}
// AUDIT 3.4: the round is played in the browser, so a card is what the browser says. The server can't make cheating
// impossible without playing the shots itself, but it makes it harder and visible:
//   - a score nobody makes is refused: better than three under par on a hole (so a hole-in-one on a par 5), or a round
//     better than one under par a hole (the same floor as the Top 10);
//   - each hole is sent as it's finished (`hole`), in order, and can't be changed once it's in: a hole can't be
//     replayed and the card can't be rewritten at the end; the card is the holes the server has;
//   - when the holes came in faster than a round can be played (the whole card within 3 minutes: sent all at once), the
//     card is marked, and both players see it on the shared card.
// index.html HOLES (the muni), HOLES_T2 (the club) and HOLES_T3 (the country club)
const PARS_BASE = [5, 3, 4, 4, 3, 5, 4, 3, 4];
const PARS_BY_TIER = { 1: PARS_BASE, 2: [4, 5, 4, 4, 3, 4, 3, 5, 4], 3: [4, 4, 4, 5, 4, 3, 5, 3, 4] };
const parsOf = (tier) => PARS_BY_TIER[tier] || PARS_BASE;
const parOf = (tier) => parsOf(tier).reduce((a, b) => a + b, 0);
const holePossible = (h, i, tier) => h.strokes >= Math.max(1, parsOf(tier)[i] - 3);
const MIN_ROUND_MS = 3 * 60 * 1000;

// ---- an invitational's actions (under its lock): see the top
async function invAction(ch, action, me, b) {
  const E = escrowOf(ch), host = ch.host === me;
  if (ch.status === 'pending' && Date.now() > ch.created + DAYS) throw fail(400, 'Nobody started it in time: it\'s closed');
  if (action === 'cancel') {
    if (!host) throw fail(400, 'Only the host can call it off');
    if (ch.status !== 'pending') throw fail(400, 'It has started: play it or forfeit');
    ch.status = 'closed'; ch.finished = Date.now(); ch.result = { kind: 'cancelled', line: `${ch.names[me]} called it off` };
    await putCh(ch);
    return refundHeld(ch);
  }
  if (action === 'accept') {
    if (host) throw fail(400, 'You\'re the host: you\'re in');
    if (ch.status !== 'pending') throw fail(400, 'It isn\'t waiting for answers any more');
    if (ch.declined[me]) throw fail(400, 'You declined it');
    if (ch.accepted[me]) return ch;
    const c = await getCareer(me);
    if (!c) throw fail(404, 'You have no career');
    if ((c.tierMax || 1) < ch.tier) throw fail(400, 'You need that circuit open');
    await takeStake(me, ch, E, `You need $${E} to accept`);
    ch.accepted[me] = true; ch.held[me] = true;
    await putCh(ch);
    return ch;
  }
  if (action === 'decline') {                                  // (or drop out, after accepting: the stake goes back)
    if (host) throw fail(400, 'You\'re the host: call it off instead');
    if (ch.status !== 'pending') throw fail(400, 'It has started: play it or forfeit');
    if (ch.accepted[me]) { await giveBack(me, ch, E); delete ch.accepted[me]; delete ch.held[me]; }
    ch.declined[me] = true;
    if (ch.players.every((p) => p === ch.host || ch.declined[p])) {      // everyone said no: it's off
      ch.status = 'closed'; ch.finished = Date.now(); ch.result = { kind: 'declined', line: 'Everyone declined' };
      await putCh(ch);
      return refundHeld(ch);
    }
    await putCh(ch);
    return ch;
  }
  if (action === 'start') {
    if (!host) throw fail(400, 'Only the host starts it');
    if (ch.status !== 'pending') throw fail(400, 'It has started already');
    const field = ch.players.filter((p) => ch.accepted[p]);
    if (field.length < 2) throw fail(400, 'Wait for at least one friend to accept');
    const cs = await Promise.all(field.map(getCareer));
    ch.strokes = Object.fromEntries(field.map((p) => [p, 0])); ch.why = ch.hcp === 'off' ? 'off' : 'auto';
    if (ch.hcp !== 'off') {                                    // each gets the strokes between their handicap and the best
      const h = cs.map((c) => (c ? handicapOf(c) : null));
      if (h.some((x) => x === null)) ch.why = 'nohcp';
      else { const lo = Math.min(...h); field.forEach((p, k) => { ch.strokes[p] = Math.min(18, Math.round(h[k] - lo)); }); ch.hcps = Object.fromEntries(field.map((p, k) => [p, h[k]])); }
    }
    ch.field = field; ch.status = 'open'; ch.started = Date.now();
    ch.deadline = ch.started + DAYS; ch.forfeits = {};
    await putCh(ch);
    return ch;
  }
  if (ch.status !== 'open') throw fail(400, ch.status === 'pending' ? 'It hasn\'t started yet' : 'That invitational is over');
  if (!ch.field.includes(me)) throw fail(400, 'You\'re not playing in this one');
  if (Date.now() > ch.deadline) return expire(ch);
  const allIn = () => ch.field.every((p) => ch.cards[p] || ch.forfeits[p]);
  if (action === 'hole') {
    if (ch.cards[me] || ch.forfeits[me]) throw fail(400, 'Your card is already in');
    const i = b.i, h = cleanHole(b);
    if (!Number.isInteger(i) || i < 0 || i >= HOLES || !h) throw fail(400, 'That hole doesn\'t look right');
    if (!holePossible(h, i, ch.tier)) throw fail(400, `A ${h.strokes} on a par ${parsOf(ch.tier)[i]} isn't possible`);
    ch.holes = ch.holes || {};
    const mine = ch.holes[me] = ch.holes[me] || [];
    if (i < mine.length) {
      const x = mine[i];
      if (x.strokes !== h.strokes || x.putts !== h.putts || x.pen !== h.pen) throw fail(409, `Hole ${i + 1} is already in, as a ${x.strokes}`);
      return ch;
    }
    if (i > mine.length) throw fail(409, `Send hole ${mine.length + 1} first`);
    mine.push({ ...h, t: Date.now() });
    await putCh(ch);
    return ch;
  }
  if (action === 'submit') {
    if (ch.cards[me] || ch.forfeits[me]) throw fail(400, 'Your card is already in');
    const card = cleanCard(b.card);
    if (!card) throw fail(400, 'That card doesn\'t look right');
    if (card.some((h, i) => !holePossible(h, i, ch.tier)) || card.reduce((s, h) => s + h.strokes, 0) < parOf(ch.tier) - HOLES) throw fail(400, 'That card isn\'t possible');
    const sent = (ch.holes && ch.holes[me]) || [];
    if (sent.length < HOLES) throw fail(409, `Send every hole first (${sent.length} of ${HOLES} are in)`);
    if (card.some((h, i) => h.strokes !== sent[i].strokes || h.putts !== sent[i].putts || h.pen !== sent[i].pen)) throw fail(409, 'That card isn\'t the holes you sent');
    if (Date.now() - sent[0].t < MIN_ROUND_MS) ch.fast = { ...(ch.fast || {}), [me]: true };
    ch.cards[me] = card; ch.submitted = { ...(ch.submitted || {}), [me]: Date.now() };
    if (allIn()) return finish(ch, scoreInv(ch));
    await putCh(ch);
    return ch;
  }
  // forfeit: out of the scoring, the stake stays in the pot
  if (ch.cards[me]) throw fail(400, 'Your card is in: you can\'t forfeit now');
  ch.forfeits[me] = 'forfeit';
  if (allIn()) return finish(ch, scoreInv(ch));
  await putCh(ch);
  return ch;
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const send = (code, obj) => res.status(code).json(obj);
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return send(405, { error: 'Method not allowed' }); }
  try {
    const b = await readBody(req, 20000);
    const me = await sessionId(req);
    if (!me) return send(401, { error: 'Not signed in' });
    const action = b && b.action;

    if (action === 'create') {
      if (!(await rateLimit(`golf:rl:ch:${me}`, 20, 3600))) return send(429, { error: 'Too many challenges this hour' });
      const to = String(b.to || '').trim().toLowerCase(), format = b.format, stake = b.stake, tier = b.tier;
      if (!to || to === me) return send(400, { error: 'Pick a friend to challenge' });
      if (!FORMATS.includes(format)) return send(400, { error: 'Unknown format' });
      if (!Number.isInteger(stake) || stake < 5 || stake > MAX_STAKE) return send(400, { error: 'Entries are $5 or more, in whole dollars' });
      if (![1, 2, 3].includes(tier)) return send(400, { error: 'Unknown circuit' });
      let hcp = 'auto';
      if (b.hcp === 'off') hcp = 'off';
      else if (b.hcp && typeof b.hcp === 'object') {
        const n = b.hcp.strokes, who = String(b.hcp.to || '').toLowerCase();
        if (!Number.isInteger(n) || n < 0 || n > 18 || (n && who !== me && who !== to)) return send(400, { error: 'Agreed strokes are 0–18, to one of you' });
        hcp = { n, to: n ? who : null };
      }
      const [cMe, cTo] = await Promise.all([getCareer(me), getCareer(to)]);
      if (!cTo) return send(404, { error: 'No player with that name' });
      if (!cMe) return send(400, { error: 'Your career isn\'t on the server yet — open the clubhouse and try again' });
      if ((cMe.tierMax || 1) < tier || (cTo.tierMax || 1) < tier) return send(400, { error: 'Pick a circuit you both have open' });
      const E = stake * (format === 'skins' ? HOLES : 1);
      if ((cMe.cash || 0) < E) return send(400, { error: `You need $${E} to put that up` });
      if ((cTo.cash || 0) < E) return send(400, { error: `${cTo.name} can't cover $${E}` });
      const [mine, theirs] = await redis([['SMEMBERS', `golf:chs:${me}`], ['SMEMBERS', `golf:chs:${to}`]]);
      if ((await getChs(mine || [])).filter(isActive).length >= MAX_ACTIVE) return send(400, { error: `You're in ${MAX_ACTIVE} challenges already — finish some first` });
      // (audit 3.9: and a cap on the other side too, so nobody can be flooded with challenges)
      if ((await getChs(theirs || [])).filter(isActive).length >= MAX_ACTIVE) return send(400, { error: `${cTo.name} has ${MAX_ACTIVE} challenges on already — try again later` });
      const ch = { id: crypto.randomBytes(8).toString('hex'), from: me, to, names: { [me]: cMe.name, [to]: cTo.name }, format, stake, tier, hcp, status: 'pending', created: Date.now(), cards: {}, held: {}, esc: true };
      ch.strokes = strokesFor(ch, cMe, cTo);                  // a preview: fixed for good when it's accepted
      // the challenger's stake is held from now, not from the accept: otherwise their own PC, which doesn't hear about
      // the accept until it next syncs, could spend it in the meantime and go below zero (audit 1.3). The challenge is
      // written first and the stake taken after (audit 1.6): if the request dies in between, the challenge is there to
      // give the stake back (refundHeld goes by the escrow record, not by `held`)
      await redis([['SET', `golf:ch:${ch.id}`, JSON.stringify(ch)], ['SADD', `golf:chs:${me}`, ch.id], ['SADD', `golf:chs:${to}`, ch.id]]);
      try { await takeStake(me, ch, E, `You need $${E} to put that up`); }
      catch (e) { await redis([['DEL', `golf:ch:${ch.id}`], ['SREM', `golf:chs:${me}`, ch.id], ['SREM', `golf:chs:${to}`, ch.id]]); throw e; }
      ch.held[me] = true;
      await putCh(ch);
      return send(200, { challenge: view(ch, me) });
    }

    if (action === 'invite') {                               // a friends invitational (see the top)
      if (!(await rateLimit(`golf:rl:ch:${me}`, 20, 3600))) return send(429, { error: 'Too many challenges this hour' });
      const format = b.format, stake = b.stake, tier = b.tier, hcp = b.hcp === 'off' ? 'off' : 'auto';
      const to = [...new Set((Array.isArray(b.to) ? b.to : []).map((x) => String(x || '').trim().toLowerCase()).filter((x) => x && x !== me))];
      if (!to.length) return send(400, { error: 'Invite at least one friend' });
      if (to.length > INV_MAX - 1) return send(400, { error: `An invitational is ${INV_MAX} players at most` });
      if (!INV_FORMATS.includes(format)) return send(400, { error: 'An invitational is stroke play or skins' });
      if (!Number.isInteger(stake) || stake < 5 || stake > MAX_STAKE) return send(400, { error: 'Entries are $5 or more, in whole dollars' });
      if (![1, 2, 3].includes(tier)) return send(400, { error: 'Unknown circuit' });
      const cs = await Promise.all([me, ...to].map(getCareer)), cMe = cs[0];
      if (!cMe) return send(400, { error: 'Your career isn\'t on the server yet — open the clubhouse and try again' });
      const missing = to.filter((_, k) => !cs[k + 1]);
      if (missing.length) return send(404, { error: `No player called ${missing.join(', ')}` });
      const shut = cs.filter((c) => (c.tierMax || 1) < tier).map((c, k) => (c === cMe ? 'you' : c.name));
      if (shut.length) return send(400, { error: `That circuit isn't open to ${shut.join(', ')}` });
      const E = stake * (format === 'skins' ? HOLES : 1);
      if ((cMe.cash || 0) < E) return send(400, { error: `You need $${E} to put that up` });
      const sets = await redis([me, ...to].map((p) => ['SMEMBERS', `golf:chs:${p}`]));
      for (const [k, p] of [me, ...to].entries()) {
        if ((await getChs(sets[k] || [])).filter(isActive).length >= MAX_ACTIVE) return send(400, { error: p === me ? `You're in ${MAX_ACTIVE} challenges already — finish some first` : `${cs[k].name} has ${MAX_ACTIVE} challenges on already — try again later` });
      }
      const players = [me, ...to], names = Object.fromEntries(players.map((p, k) => [p, cs[k].name]));
      const ch = { kind: 'inv', id: crypto.randomBytes(8).toString('hex'), host: me, players, names, format, stake, tier, hcp, status: 'pending', created: Date.now(), accepted: { [me]: true }, declined: {}, cards: {}, held: {}, esc: true };
      // (as a challenge: written first, the host's stake taken after, so a request that dies in between can be refunded)
      await redis([['SET', `golf:ch:${ch.id}`, JSON.stringify(ch)], ...players.map((p) => ['SADD', `golf:chs:${p}`, ch.id])]);
      try { await takeStake(me, ch, E, `You need $${E} to put that up`); }
      catch (e) { await redis([['DEL', `golf:ch:${ch.id}`], ...players.map((p) => ['SREM', `golf:chs:${p}`, ch.id])]); throw e; }
      ch.held[me] = true;
      await putCh(ch);
      return send(200, { challenge: view(ch, me) });
    }

    if (action === 'list') {
      if (!(await rateLimit(`golf:rl:chlist:${me}`, 60, 60))) return send(429, { error: 'Too many requests — wait a minute' });     // (audit 3.3)
      const [ids] = await redis([['SMEMBERS', `golf:chs:${me}`]]);
      const out = [], drop = [], all = await getChs(ids || []);
      for (const [k, cid] of (ids || []).entries()) {
        let ch = all[k];
        if (!ch) { drop.push(cid); continue; }
        const stale = ch.status === 'pending' && Date.now() > ch.created + DAYS;
        const due = (ch.status === 'open' && Date.now() > ch.deadline) || (ch.status === 'done' && ch.result && owed(ch)) || (ch.status === 'closed' && owed(ch));
        if (stale || due) {
          try {
            ch = await withLock(cid, async (c) => {
              if (c.status === 'pending' && Date.now() > c.created + DAYS) { c.status = 'closed'; c.result = { kind: 'unanswered', line: 'Not answered in time' }; c.finished = Date.now(); await putCh(c); return refundHeld(c); }
              if (c.status === 'open') return expire(c);
              if (c.status === 'closed') return c.result && c.result.payout ? payOut(c) : refundHeld(c);
              return payOut(c);
            });
          } catch { /* busy: next time */ }
        }
        if ((ch.status === 'done' || ch.status === 'closed') && Date.now() > (ch.finished || ch.created) + KEEP) { drop.push(cid); continue; }
        out.push(view(ch, me));
      }
      if (drop.length) await redis(drop.map((cid) => ['SREM', `golf:chs:${me}`, cid]));
      const when = (c) => (isInv(c) ? c.started || c.created : c.accepted || c.created);     // (an invitational's `accepted` is who's in)
      out.sort((x, y) => when(y) - when(x));
      return send(200, { challenges: out.slice(0, 60), me });
    }

    const cid = String(b.id || '');
    if (!['accept', 'decline', 'cancel', 'start', 'hole', 'submit', 'forfeit'].includes(action)) return send(400, { error: 'Unknown action' });
    const ch = await withLock(cid, async (ch) => {
      if (!peopleOf(ch).includes(me)) throw fail(404, 'No such challenge');
      if (isInv(ch)) return invAction(ch, action, me, b);
      if (action === 'start') throw fail(400, 'Only an invitational is started');
      if (action === 'decline' || action === 'cancel') {
        if (ch.status !== 'pending') throw fail(400, 'It isn\'t waiting for an answer any more');
        if ((action === 'decline') !== (ch.to === me)) throw fail(400, action === 'decline' ? 'Only the one challenged can decline' : 'Only the challenger can cancel');
        ch.status = 'closed'; ch.finished = Date.now();
        ch.result = { kind: action === 'decline' ? 'declined' : 'cancelled', line: action === 'decline' ? `${ch.names[me]} declined` : `${ch.names[me]} called it off` };
        await putCh(ch);
        return refundHeld(ch);                                 // the challenger's stake goes back
      }
      if (action === 'accept') {
        if (ch.to !== me) throw fail(400, 'Only the one challenged can accept');
        if (ch.status !== 'pending') throw fail(400, 'It isn\'t waiting for an answer any more');
        const [cFrom, cTo] = await Promise.all([getCareer(ch.from), getCareer(ch.to)]);
        if (!cFrom || !cTo) throw fail(404, 'That player has no career');
        if ((cFrom.tierMax || 1) < ch.tier || (cTo.tierMax || 1) < ch.tier) throw fail(400, 'You both need that circuit open');
        ch.strokes = strokesFor(ch, cFrom, cTo);               // the strokes as of now, fixed for the round
        const E = escrowOf(ch), short = (p) => (p === me ? `You need $${E} to accept` : `${ch.names[p]} doesn't have $${E} any more`);
        // (audit 1.6: with escrow records a retry after a lost write takes nothing twice; an older challenge as before)
        const take = (p) => (ch.esc ? takeStake(p, ch, E, short(p)) : updateCareer(p, (c) => { if ((c.cash || 0) < E) throw fail(400, short(p)); c.cash -= E; }));
        const back = (q) => (ch.esc ? giveBack(q, ch, E) : updateCareer(q, (c) => { c.cash = (c.cash || 0) + E; }));
        // (the challenger's stake is normally held since the challenge was made; one made before that rule is taken now)
        const taken = [];
        for (const p of [ch.to, ch.from]) {
          if (ch.held[p]) continue;
          try { await take(p); } catch (e) {
            for (const q of taken) { await back(q); delete ch.held[q]; }    // give back what this accept took
            await putCh(ch);
            throw e;
          }
          ch.held[p] = true; taken.push(p); await putCh(ch);
        }
        ch.status = 'open'; ch.accepted = Date.now(); ch.deadline = ch.accepted + DAYS;
        await putCh(ch);
        return ch;
      }
      if (ch.status !== 'open') throw fail(400, ch.status === 'pending' ? 'It hasn\'t been accepted yet' : 'That challenge is over');
      if (Date.now() > ch.deadline) return expire(ch);
      if (action === 'hole') {                               // one hole, as it's finished (audit 3.4)
        if (ch.cards[me]) throw fail(400, 'Your card is already in');
        const i = b.i, h = cleanHole(b);
        if (!Number.isInteger(i) || i < 0 || i >= HOLES || !h) throw fail(400, 'That hole doesn\'t look right');
        if (!holePossible(h, i, ch.tier)) throw fail(400, `A ${h.strokes} on a par ${parsOf(ch.tier)[i]} isn't possible`);
        ch.holes = ch.holes || {};
        const mine = ch.holes[me] = ch.holes[me] || [];
        if (i < mine.length) {                               // already in: the same again is fine (a lost reply), a change isn't
          const x = mine[i];
          if (x.strokes !== h.strokes || x.putts !== h.putts || x.pen !== h.pen) throw fail(409, `Hole ${i + 1} is already in, as a ${x.strokes}`);
          return ch;
        }
        if (i > mine.length) throw fail(409, `Send hole ${mine.length + 1} first`);
        mine.push({ ...h, t: Date.now() });
        await putCh(ch);
        return ch;
      }
      if (action === 'submit') {
        if (ch.cards[me]) throw fail(400, 'Your card is already in');
        const card = cleanCard(b.card);
        if (!card) throw fail(400, 'That card doesn\'t look right');
        if (card.some((h, i) => !holePossible(h, i, ch.tier)) || card.reduce((s, h) => s + h.strokes, 0) < parOf(ch.tier) - HOLES) throw fail(400, 'That card isn\'t possible');
        // the card must be the holes sent one by one (all nine of them)
        const sent = (ch.holes && ch.holes[me]) || [];
        if (sent.length < HOLES) throw fail(409, `Send every hole first (${sent.length} of ${HOLES} are in)`);
        if (card.some((h, i) => h.strokes !== sent[i].strokes || h.putts !== sent[i].putts || h.pen !== sent[i].pen)) throw fail(409, 'That card isn\'t the holes you sent');
        if (Date.now() - sent[0].t < MIN_ROUND_MS) ch.fast = { ...(ch.fast || {}), [me]: true };     // all at once: marked for both to see
        ch.cards[me] = card; ch.submitted = { ...(ch.submitted || {}), [me]: Date.now() };
        if (ch.cards[ch.from] && ch.cards[ch.to]) return finish(ch, score(ch));
        await putCh(ch);
        return ch;
      }
      return finish(ch, forfeitResult(ch, me, 'forfeit'));     // forfeit
    });
    return send(200, { challenge: view(ch, me) });
  } catch (e) {
    return send(e.status || 500, { error: e.status ? e.message : 'Challenges unavailable' });
  }
};
