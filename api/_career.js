// Shared career helpers for the API (Vercel doesn't deploy files starting with "_" as endpoints).
//
// A stored career is whatever a browser sent (api/profile.js save / signup), so the server never trusts its shape
// (audit 3.2: one player's save with `rounds: "xxx"` broke the sign-in list and Friends for everybody, and a career
// with `history: "x"` blocked a friend's payout). normCareer() repairs a career on its way in; the readers below cope
// with a bad one anyway (careers saved before this check).

const arr = (v) => (Array.isArray(v) ? v : []);
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const tierOf = (v) => ([1, 2, 3].includes(v) ? v : 1);
const obj = (v) => v && typeof v === 'object' && !Array.isArray(v);
// a short line of text with nothing that could be markup (for anything shown to other players; "&" stays, as in
// "3 & 2": without "<" it can't start a tag, and the page escapes it anyway)
const plain = (s) => String(s ?? '').replace(/[<>"'`\\]/g, '').slice(0, 200);
const strs = (a, n) => arr(a).filter((x) => typeof x === 'string').slice(-n);

// the handicap rounds that are well formed: { gross, par, tier, date } with numbers
const goodRounds = (c) => arr(c && c.rounds).filter((r) => obj(r) && Number.isFinite(r.gross) && Number.isFinite(r.par) && [1, 2, 3].includes(r.tier) && Number.isFinite(r.date));

// a career's handicap (M2) — the same as handicapOf() in index.html: keep both alike
const HCP = { rating: { 1: 0, 2: 1.5, 3: 3 }, recent: 10, best: 4, factor: 0.96, min: 3 };
function handicapOf(c) {
  const r = goodRounds(c).slice(-HCP.recent);
  if (r.length < HCP.min) return null;
  const d = r.map((x) => x.gross - x.par - (HCP.rating[x.tier] || 0)).sort((a, b) => a - b).slice(0, HCP.best);
  return Math.round((d.reduce((a, b) => a + b, 0) / d.length) * HCP.factor * 10) / 10;
}

// repair a career's shape in place: the fields the server and other players read get the right types (bad entries are
// dropped, not refused, so a player's own game keeps saving)
function normCareer(c) {
  c.cash = num(c.cash); c.rep = num(c.rep);
  c.tier = tierOf(c.tier); c.tierMax = Math.max(c.tier, tierOf(c.tierMax));
  if (!obj(c.stats)) c.stats = {};
  for (const k of ['power', 'dex', 'composure', 'perception']) c.stats[k] = Number.isFinite(c.stats[k]) ? c.stats[k] : 1;
  if (!obj(c.bag)) c.bag = {};
  for (const k of ['out', 'putters', 'snapped', 'pvpSeen', 'saveIds']) c[k] = arr(c[k]);
  // (audit 1.6: the server's own records in a career: the challenges holding a stake, and wall purchases not yet done)
  c.escrow = arr(c.escrow).filter((x) => typeof x === 'string').slice(-50);
  c.pendingBuys = arr(c.pendingBuys).filter(obj).slice(-20);
  c.history = arr(c.history).filter(obj);
  c.rounds = goodRounds(c);
  c.cards = arr(c.cards).filter((x) => obj(x) && typeof x.id === 'string' && Array.isArray(x.sc) && Array.isArray(x.pars));
  c.trophies = strs(c.trophies, 200);
  c.titles = arr(c.titles).filter(obj);
  if (c.showcase !== undefined) {
    const s = obj(c.showcase) ? c.showcase : {};
    c.showcase = { ...s, hide: strs(s.hide, 300), cards: strs(s.cards, 100), destroyed: strs(s.destroyed, 300) };
  }
  return c;
}

// a player's summary for the lists (audit 3.3: the sign-in screen and Friends read these, not the whole careers)
const summaryOf = (c, id) => ({
  id, name: plain(c.name).slice(0, 12), tierMax: tierOf(c.tierMax), cash: num(c.cash), rep: num(c.rep), handicap: handicapOf(c),
  rounds: goodRounds(c).length, last: num(c.stamp), trophies: strs(c.trophies, 40),
});

// a settled challenge's result from one player's side: the word their history line starts with
const outcomeFor = (res, p) => (res.kind === 'refund' ? 'refunded' : !res.winner ? 'halved' : res.winner === p ? 'won' : res.kind === 'played' ? 'lost'
  : res.kind === 'expired' ? 'lost (out of time)' : 'lost (forfeit)');

// A settled friends invitational (api/challenge.js, kind 'inv') as head-to-head results (user request, 2026-11-20): one
// per other player in the field. You beat a player you finished ahead of (stroke play: the lower net total; skins: the
// more money), lose to one ahead of you, halve with one level; a forfeit (or running out of time) is behind everyone
// who finished. The money against each: (your net − theirs) ÷ the field, so the pairs add up to exactly what you won or
// lost (stroke play, winner takes all: the winner is a stake up on each player, two losers are level). Written into each
// player's history line as `vs` (api/challenge.js payOut), and rebuilt from the record for a visited trophy room
// (api/profile.js); index.html's h2h() and rivalItems() count them.
function invPairs(ch, who) {
  const F = arr(ch && ch.field), res = ch && ch.result;
  if (!res || res.kind === 'refund' || !F.includes(who) || !res.net) return [];
  const ff = (ch.forfeits && typeof ch.forfeits === 'object') ? ch.forfeits : {}, st = arr(res.standings);
  const metric = (p) => (ff[p] ? -Infinity : ch.format === 'skins' ? num(res.net[p]) : (() => { const s = st.find((x) => x && x.p === p); return s ? -num(s.net) : -Infinity; })());
  return F.filter((p) => p !== who).map((o) => {
    const a = metric(who), b = metric(o);
    return { id: o, name: plain((ch.names || {})[o] || o).slice(0, 12), r: a > b ? 'won' : a < b ? 'lost' : 'halved', net: Math.round((num(res.net[who]) - num(res.net[o])) / F.length) };
  });
}

module.exports = { arr, num, tierOf, plain, strs, goodRounds, HCP, handicapOf, normCareer, outcomeFor, summaryOf, invPairs };
