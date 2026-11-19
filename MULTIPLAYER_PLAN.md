# Profiles and friends — plan

Player profiles stored on the server, and bets between friends: each player has a password-protected profile that holds
their career, and friends can challenge each other to a round for money. Both play the same course on their own PC,
whenever they like; when both cards are in, the server settles the bet and both see a shared final scorecard.
Handicaps keep bets between unequal players fair.

Build it in **chunks** (M1–M4), testing between them. Read the "Fixed points" section and the chunk you're building;
re-read the code you touch first (other sessions edit `index.html`).

---

## Who decided what

**Stated by the user** (2026-11-18):

- Profiles so several people can each have their own character; password protected.
- No real security needed: a fun web game among friends, nothing sensitive stored.
- Play against a friend on another PC: both have accounts, bet each other within the campaign, play rounds.
- Handicaps for fair bets: agreed between players, or tracked by the game on each profile.
- No need to see the other player's shots; a final scorecard once both have finished is enough.

**My defaults** (the user asked for these, 2026-11-18; each is one rule or constant):

1. **Turn-free challenges.** No live play: each player plays the round whenever they like; results when both cards
   are in. (Live play is a possible later chunk, not planned.)
2. **Handicaps kept automatically** from completed rounds, with a manual override the two players agree on in the
   challenge.
3. **Friends bet cash only, held in escrow.** The stake is taken from both careers when the challenge is accepted and
   paid to the winner at settlement. No credit and no beating between friends, so nobody can end up owing. (The
   loan-shark rule stays for the hustlers.)
4. **An existing career on this PC can be brought into a new profile** when that person signs up.
5. **Passwords are still hashed** on the server (scrypt with a per-user salt), because people reuse passwords, even
   though nothing here is sensitive. No email and no password recovery.
6. **Playing offline stays possible:** "Play on this PC only" keeps today's local career.

---

## Fixed points in the code (verified 2026-11-18)

- **Server.** `api/leaderboard.js` is a Vercel function (CommonJS, `module.exports = async (req, res)`) that talks to
  Upstash Redis through its REST pipeline: `redis(commands)` posts `[[cmd, ...args], ...]` to `${URL}/pipeline` with
  `Authorization: Bearer ${TOKEN}`. `findCreds()` finds the keys under `KV_REST_API_*`, `UPSTASH_REDIS_REST_*` or a
  custom prefix. Copy both helpers into a shared `api/_redis.js` (Vercel does not deploy files starting with `_` as
  endpoints) and use them from the new functions.
- **Career save.** `career` (the object; fields `v, name, seed, cash, rep, tier, tierMax, stats, bag, snapped, out,
  putter, putters, unlocks, match, history, created, stamp`), `CAREER` (start values), `newCareer(name)`,
  `careerLoad()` (also upgrades older saves: fills `out`, `putters`, `tierMax`), `careerSave()` (writes
  `localStorage['golfCareer_v1']`; called after every change), `enterCareer()` / `leaveCareer()`, `retireCareer()`.
- **Clubhouse overlay** `#clubhouse` with views chosen by a class: `.new` (the name form `#chNew`), `.hub`, `.match`,
  `.shop`, `.coach`. `openClubhouse()`, `closeClubhouse()`, `clubKey(e)` (its keys), `updateCareerUI()`,
  `clubhouseGo(where)` (the hub's menu tiles, `button[data-go]`).
- **Rounds.** `round` (`on`, `scores[]`, `over`, `match`), `startMatch()` (a career match is a round with
  `round.match`), `finishHole()` (records `{strokes, putts, par, pen}` into `round.scores[hp.holeIdx]`, then the
  scorecard), `showScorecard(msg)`, `scorecardNext()` / `scorecardClose()`, `matchToClubhouse()`, `endRound()`,
  `confirmForfeit()`. A match's hustler runs through `npc*` functions; a friend round must not create a hustler
  (`npc.plan = null`).
- **Courses.** `HOLES[]` (9 holes, par 35), `TIERS` (per circuit: Stimp, wind, mirrored holes, OB, trees),
  `variantDef()`, `setCourse(tier)` (sets `courseV` and rebuilds the hole). Each hole's wind and Stimp are fixed, so
  two players on the same tier play identical conditions.
- **Money and bets.** `MATCH` (fees, reputation per tier), `money(n)`, `career.history` entries
  `{ npc, format, stake, result, net, date }`.

---

## Server design

### Keys (Upstash Redis)

| Key | Type | Holds |
|---|---|---|
| `golf:user:<id>` | hash | `name` (as typed), `salt`, `hash`, `created` · `<id>` = the name lower-cased |
| `golf:players` | set | every `<id>`, for the friends list |
| `golf:sess:<token>` | string | `<id>`, expires after 30 days · token = 32 random bytes, hex |
| `golf:career:<id>` | hash | `data` (the career JSON), `ver` (integer, +1 on every write) |
| `golf:ch:<cid>` | string | a challenge (JSON, below) |
| `golf:chs:<id>` | set | the challenge ids a player is in |

### Endpoints

`api/profile.js` (POST, JSON body `{ action, ... }`; the session token in an `Authorization: Bearer` header):

| action | in | out |
|---|---|---|
| `signup` | `name`, `password`, `career?` (a local career to bring in) | `token`, `career`, `ver` |
| `login` | `name`, `password` | `token`, `career`, `ver` |
| `logout` | — | ok (deletes the session) |
| `load` | — | `career`, `ver` |
| `save` | `career`, `ver` (the version this copy came from) | `ver` (new) · or **409** with the server's `career` and `ver` |
| `players` | — | `[{ name, handicap, tierMax, cash }]` (for the friends list; nothing private) |

Rules: names 3–12 characters `[A-Za-z0-9 _-]`, unique case-insensitively; passwords at least 4 characters. Hash with
Node's `crypto.scrypt(password, salt, 32)`, compare with `timingSafeEqual`. Rate-limit signup and login per IP (the
leaderboard's `SET NX EX` + `INCR` pattern: 10 tries a minute).

**Saving without losing anything (optimistic concurrency).** Every write is compare-and-set on `ver`, done in one
Lua script (Upstash REST supports `EVAL`):

```lua
if redis.call('HGET', KEYS[1], 'ver') == ARGV[1] then
  redis.call('HSET', KEYS[1], 'data', ARGV[2], 'ver', tonumber(ARGV[1]) + 1) return tonumber(ARGV[1]) + 1
else return -1 end
```

The server changes a career itself only for escrow and settlement (cash, plus a `history` entry and a `rounds` entry):
read, modify, compare-and-set, retry up to 5 times. When a client gets **409**, it **merges**: take the server's
career, then re-apply the client's own changes since its last sync: `cash` by delta (local cash − cash at last sync),
and every other field from the local copy except `history` / `rounds`, which are merged by date.
The client keeps `careerBase` (the copy at the last successful sync) for this.

### Challenges

`api/challenge.js` (POST, `{ action, ... }`, session token required):

| action | who | does |
|---|---|---|
| `create` | A | `to`, `format`, `stake`, `tier`, `hcp` (`auto`, `off`, or `{ strokes, to }`) → a `pending` challenge |
| `list` | anyone | their challenges, newest first (incoming, outgoing, in play, finished) |
| `accept` | B | checks both can cover the stake, **takes it from both careers** (escrow) → `open` |
| `decline` / `cancel` | B / A | `pending` → `closed`, nothing moves |
| `submit` | A or B | their card `[{ strokes, putts }] × 9` (only once; must be `open`); when both are in → **settle** |
| `forfeit` | A or B | the other wins (if the other has submitted or not) |

Challenge JSON:

```js
{ id, from, to, format: 'match' | 'stroke' | 'skins', stake, tier, hcp, strokes: { player: id, n }, // strokes given
  status: 'pending' | 'open' | 'done' | 'closed', created, accepted, deadline,          // deadline = accepted + 7 days
  cards: { [id]: [{ strokes, putts }] }, result: { net: { [id]: n }, lines: [...], winner } }
```

**Settlement** (on the server, so both players see the same result): net scores per hole after handicap strokes, then
by format:

- **Match play:** most holes won (net); halved = stakes returned.
- **Stroke play:** lowest net total; tied = stakes returned.
- **Skins:** a stake per hole (escrow = 9 × the skin), a halved hole carries, unclaimed skins at the end are returned.

The pot goes to the winner's career (compare-and-set), with a `history` entry for each player
(`{ friend: id, format, stake, result, net, date }`) and a `rounds` entry (for the handicap). **Deadline:** checked
whenever a challenge is listed. Past the deadline, a player who hasn't submitted forfeits; if neither has, both get
their stakes back.

The scoring function lives in the server file. The client only displays the stored `result`, so both screens always
agree.

---

## Handicaps

- **What counts:** every completed 9-hole career round: a hustler match played through all 9 holes (including
  practice holes after it was decided), or a friend round. Stored in `career.rounds` (last 20):
  `{ date, gross, par, tier }`.
- **Differential** for a round = `gross − par − TIER_RATING[tier]` with `TIER_RATING = { 1: 0, 2: 1.5, 3: 3 }`
  (harder courses count for more).
- **Handicap index** (9 holes) = the average of the lowest 4 of the last 10 differentials × 0.96, one decimal. Needs
  at least 3 rounds; before that the profile shows "no handicap yet".
- **Strokes in a challenge** (`hcp: 'auto'`): the difference between the two indexes, rounded. The higher-handicap
  player gets one stroke on each hole whose stroke index ≤ the difference (two on the hardest holes past 9).
  `hcp: { strokes, to }` is the agreed manual number; `off` = no strokes. The challenge form shows the result:
  "Gus gets 3 strokes (holes 1, 4 and 7)".
- **Stroke index:** add `si` (1 = hardest … 9 = easiest) to each `HOLES` entry. Default ranking: by how far the
  hustlers' average score is over par on each hole (simulate `npcHoleScore` for a mid hustler), ties by length.
  Mirrored holes keep their `si`.

Code: `handicapOf(career)` and `strokesFor(hcpA, hcpB)`, shared shape on the client (for display) and the server (for
settlement); keep the two copies identical.

---

## Chunks

### M1 — Profiles and server saves (L) — ✅ built 2026-11-18

As built: `api/_redis.js` (`findCreds`, `redis`, `readBody`, `clientIp`, `rateLimit`), `api/profile.js` (all six
actions; save = Lua compare-and-set). Client: `session` (`localStorage.golfSession`), `playMode` (`golfMode`: `local` /
`profile`; a career from before profiles counts as `local`), `careerKey()` — a profile's copy on this PC is ONE key
`golfCareer_p_<id>` = `{ c: career, s: { ver, base, dirty } }` so the career and its sync state can't get out of
step; `sync`, `profileApi()`, `queueSync()` (1.2 s debounce), `syncNow()` (409 → `mergeServer()` → save again),
`syncLoad()` (on opening the clubhouse and 0.4 s after page load), `refreshCareerView()`, a flush on
`visibilitychange`. The clubhouse's `.new` view is "Who's playing?" (`renderSignIn()`, `submitSignIn()`, tabs Sign in /
New profile / Play on this PC only; "Bring <name>'s career" moves the local career into the new profile);
`switchPlayer()` (footer "Switch player"); the footer's `#chSync` shows the sync state; Retire on a profile starts its
career over. Tested with a local dev server that runs the real handlers against an in-memory Upstash (scratchpad
`devserver.js`): sign up with a brought career, wrong password, a second browser signing in, a conflicting save from
another PC merged correctly. Known limit: if a browser is killed in the instant after a successful sync, before it
writes its own copy, the next load can re-apply a change; rare, and fine for a friends' game.

**Goal:** sign up, sign in on another PC, the same career is there.

- `api/_redis.js` (shared helpers), `api/profile.js` (the table above).
- Clubhouse `.new` view becomes a sign-in screen: **Sign in** / **New profile** (name, password), and
  **Play on this PC only** (today's local career). Enter submits; errors inline ("That name is taken", "Wrong
  password").
- On new profile, if a local career exists: "Bring your local career (KEITH, $840)?" → `signup` with `career`.
- Client: `session = { token, id, name }` in `localStorage['golfSession']`; `careerSave()` writes locally as now and
  also queues a server save (debounced 1.5 s, and immediately when a match settles or a purchase happens); `ver` and
  `careerBase` are kept; 409 → merge (above) and save again.
- On opening the clubhouse while signed in: `load` first (another PC may have played).
- Clubhouse footer: "Signed in as KEITH · Switch profile · Sign out". The Career button shows the profile's name.
- Offline or server errors: keep playing on the local copy, show "Not synced" in the footer, retry on the next save.

**Done when:** two browsers (or one normal, one private window) can sign up two profiles; signing in as the first one
in the second browser shows the same cash and clubs; buying a club in one and reopening the clubhouse in the other
shows it; a stale save gets 409 and merges without losing the purchase.

### Admin profile (user request, 2026-11-18) — ✅ built

`api/_admins.js`: `ADMINS` (the reserved profile **Keeto**, with a scrypt salt + hash of its password — no
plain-text password in the code) and `isAdmin(id)`. In `api/profile.js`: a reserved name can't be signed up by anyone
else ("That name is reserved"); signing in checks the baked-in hash (any password length); the first sign-in creates
the profile (the client then sends a fresh career). `login` / `load` return `admin`; the client keeps
`session.admin` and the clubhouse footer shows "👑 admin". **No admin rights yet** — they'll check `isAdmin(id)` on
the server (never trust the client's flag). Before any admin right can change other players' data, switch to a
longer password (the hash of a 3-letter password can be guessed if the repo is public).

### M2 — Handicaps (S) — ✅ built 2026-11-18

As built: `si` on every hole in `HOLES` (1 = hardest), ranked from length per par, wind, green speed, OB width,
fairway width and bunkers: holes 1–9 have stroke indexes **5, 9, 4, 2, 7, 3, 6, 8, 1** (hole 9 hardest, hole 2
easiest; par 3s are the easiest, as for handicap golfers). `HCP` and `handicapOf()` in both
`index.html` and `api/profile.js` (keep alike); `fmtHcp()` (a plus handicap shows "+"); `recordCareerRound(m)` (from
`finishHole()`: once per match, when all 9 holes were played in that round — practice holes after a decided match
count; an abandoned match doesn't); `career.rounds` (`upgradeCareer()` / `newCareer()`; merged by date in
`mergeServer()`). The clubhouse header shows the handicap ("3 / 3 rounds" until there is one; the recent rounds on
hover); the scorecard after hole 9 says "Round recorded… Handicap 9.4 → 9.1"; `players` returns `handicap` and
`rounds`. Friend rounds (M3) must call the same recording.

- `si` on every hole (ranking above), `career.rounds`, recording a round in `finishHole()` when hole 9 is holed and
  all 9 were played in this round.
- `handicapOf()`; shown in the clubhouse header ("Handicap 6.4" / "No handicap yet · 1 of 3 rounds") and in `players`.

**Done when:** after 3 completed matches the clubhouse shows a handicap that moves sensibly (lower after good
rounds); harder circuits count for more.

### M3 — Challenges (L) — ✅ built 2026-11-18

As built: `api/challenge.js` (create / list / accept / decline / cancel / submit / forfeit). Shared helpers moved to
`api/_redis.js`: `sessionId`, `CAS`, `updateCareer(id, fn)` (read, change, compare-and-set, retry). Each change to a
challenge holds a short lock (`golf:chlock:<cid>`, `SET NX EX 20`); escrow and payouts are marked per player in
`held` / `paid`, so a retry never takes or pays twice (`list` finishes any unpaid payout). Differences from the spec
above: the **server doesn't add a `rounds` entry** — each client records its own handicap round after hole 9 (as in
hustler matches), so it isn't counted twice; the other player's card stays **hidden until settled** (`list` shows
only that it's in); a **forfeit** gives the other player the whole pot (all 9 skins in skins); an unanswered challenge
closes after 7 days; finished ones drop off the list after 60. History entries:
`{ friend, friendName, ch, format, stake, result, net, date }`. Client: `fr` (players + challenges), `loadFriends()`
(also quietly on opening the clubhouse, for the tile's "1 challenge waiting for you"), `openFriends()` /
`renderFriends()` / `friendsClick()`, the form `openChalForm()` / `renderChalForm()` / `sendChallenge()` (stake capped
by both players' cash; circuits both have open; Auto / Agreed / Off with the strokes spelled out), `playFriend()` →
course preview (`openRoundIntro('pvp')`) → `startFriendRound()`; `round.pvp` = `career.pvpCard`
`{ id, tier, format, stake, vs, vsName, deadline, n, mine, holes }`; `pvpAfterHole()`, `submitPvp()` (kept and
offered as "Send your card" if it can't be sent), `confirmLeavePvp()`, `pvpToClubhouse()`; `holeStrokes(n)` (same as
the server's). The scorecard shows your strokes (●) and your net. Tested with two browsers on the local dev server:
A challenged B for $50 match play, B accepted (both dropped $50), B played and sent, A left after 4 holes, resumed and
finished; the server settled "Ann wins 3 & 2", A's career +$100, both lists agree; also all three formats, ties,
forfeits, decline / cancel and refusals through the API.

- `api/challenge.js` (the table above), with escrow and settlement.
- Clubhouse menu: **🤝 Friends** → the players list (name, handicap, circuit) with **Challenge**, and the challenges
  list grouped: *Waiting for you* (Accept / Decline), *Waiting for them* (Cancel), *To play* (Play / Resume),
  *Finished* (View).
- Challenge form: opponent, format (Match play / Stroke play / Skins), stake (≤ what both have; shows the escrow),
  circuit (one both have open), handicap (Auto, showing the strokes / Agreed: N strokes to X / Off).
- Playing it: `startFriendRound(ch)` — a round with `round.pvp = ch`, `setCourse(ch.tier)`, no hustler, no tee toss,
  no presses; the scorecard shows only your own card (plus "vs KEITH · match play, $50 · you get 2 strokes"). The card
  in progress is saved in `career.pvpCard` so leaving and coming back resumes it. After hole 9: `submit`, then a
  "Waiting for Gus's card" screen.
- Leaving a friend round asks first: "Leave now? You can resume it until <deadline>." (No forfeit on leaving.)

**Done when:** A challenges B for $50 match play; B accepts and both careers drop $50; each plays on their own PC; when
the second card is in, the winner's career gets $100 and both see the same result.

### M4 — Results and history (M)

- **Shared final scorecard** (`#scorecard` in a `.pvp` mode): both players' gross scores, the strokes received (dots on
  those holes), net scores, the match / skins row as in hustler matches, and the money. Opened from *Finished*, and
  automatically when the clubhouse opens and a new result is waiting ("Gus's card is in: you won 2 & 1, +$100").
- **Friends board:** each friend's record against you (W-L-H) and money won or lost.
- While waiting for the other card: check `list` every 20 s while the waiting screen is open (no other polling).

**Done when:** after a settled challenge, both players get the result on their next clubhouse visit, can reopen the
shared card any time, and see the head-to-head record.

---

## Pitfalls

- **Never let a server change be overwritten.** Every career write goes through compare-and-set; the client must
  merge on 409, never retry blindly with its old copy.
- **One round at a time.** A hustler match and a friend round can't both be in progress (`career.match` vs
  `career.pvpCard`); the menus must refuse.
- **Escrow is real money in the career.** The challenge list must show held stakes ("$50 held in a challenge with
  Gus") so the cash drop isn't confusing.
- **Test round and leaderboard:** unchanged; signing in doesn't affect them.
- **Fairness is honour-based.** Scores are sent by each player's browser. Fine among friends; no cheat-proofing
  planned.
- **Same conditions:** both players' rounds must use the same tier (`setCourse(ch.tier)`) and the holes' fixed wind
  and Stimp. Nothing about a friend round may depend on a random roll.
- **Keys in the URL / logs:** session tokens go in a header, never the query string.
