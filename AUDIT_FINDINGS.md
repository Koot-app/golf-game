# Audit findings

Findings from the audit in `AUDIT_PLAN.md`, one section at a time. A finding marked **✅ Fixed** has been fixed (with
the date and what changed); the rest are open. To fix some, say for example "Fix findings 1.4 and 1.5 from
AUDIT_FINDINGS.md" in a new session.

## Section 1 — Money and settlement (2026-11-19, Fable 5.2)

**Summary.** The match rules themselves pay correctly: 24 random matches (match play with presses, and skins) each paid
the right amount exactly once. The problems are around the edges: what happens to cash when a save, a reload, a second
device or a friend's challenge gets involved. Eight findings: 1 critical, 2 high, 3 medium, 2 low.

| # | Severity | Finding | Fix size |
|---|---|---|---|
| 1.1 | Critical | A save whose reply is lost makes the next sync count the cash change twice | ✅ Fixed |
| 1.2 | High | Reopen the game mid-match and you can spend the money the bet is riding on | ✅ Fixed |
| 1.3 | High | A friend accepting your challenge can push your cash below zero | ✅ Fixed |
| 1.4 | Medium | Reopening the game restarts the hole you were on, wiping its strokes | M |
| 1.5 | Medium | With two devices, a purchase made on one can be paid for and then lost | M–L |
| 1.6 | Medium | Server payouts and escrow are two steps; a failure between them pays twice or loses the stake | M |
| 1.7 | Low | A wall purchase charges the server's price, not the price you confirmed | S |
| 1.8 | Low | Small inconsistencies: green fee when nearly broke, invitational wording | S |

The probe scripts are in `tools/test/` (`money-*.js`). Each one's header says how to run it and what a correct result
looks like, so they double as regression tests once the fixes are in.

### 1.1 [Critical] A save whose reply is lost makes the next sync count the cash change twice
- **Where:** `mergeServer` (about line 10489), reached from `syncLoad` and from the 409 branch of `syncNow`.
- **Scenario:** signed-in players only.
  1. Something changes your cash (you win $500, or buy a club).
  2. The save reaches the server, but the page never sees the reply. This happens when you close or reload the tab
     within a second or two of the change (the game fires a last save as the tab hides), or when the connection drops
     mid-save.
  3. Next visit, this PC still thinks its copy is unsent, and the server's copy is "newer". `mergeServer` computes
     `server cash + (this PC's cash − cash at the last completed sync)`. But the server's cash already includes the
     change, so it is added a second time.
  4. The doubled figure is then saved to the server.

  It works in both directions: winnings are doubled, and a purchase is charged twice. A $250,000 luxury set bought just
  before closing the tab would cost $500,000.
- **Evidence:** `money-lost-save-a.js` then `money-lost-save-b.js`:
  ```
  run A: server before {cash 1000, ver 2} · server after {cash 1500, ver 3} · this PC {cash 1500, ver 2, baseCash 1000, dirty true}
  run B: cashOnThisPC 2000 · serverCash 2000 · shown "$2,000"
  ```
  The $500 win became $1,000.
- **Limits:** the tab-close variant only applies while the career JSON is under about 64 KB (the browser's limit for a
  save sent during unload); above that the last save isn't sent at all. The dropped-connection variant applies at any
  size.
- **Fix (S–M):** let the merge recognise its own save. Before sending, keep the snapshot being sent (or just its
  `stamp`) in the saved sync state. In `mergeServer`, if the server copy's `stamp` matches that snapshot, treat the
  snapshot as the new base (so only changes made after it are added on). Also skip the merge in `syncLoad` while a save
  is in flight (`sync.busy`); the same double count can happen if a load's reply overtakes a save's.
- **✅ Fixed 2026-11-19.**
  - Each save gets an id. The id goes into `career.saveIds` (the last 12, carried in the career) and into `sync.pend`
    (`{ id, cash }` for each save whose reply hasn't come back). `pend` is written to disk before the save is sent.
  - `mergeServer` looks for the newest pending id among the server copy's `saveIds`. If one is there, that save landed,
    and its cash is the base. The ids of both copies are merged, and `pend` is cleared after a merge or a confirmed save.
  - `syncLoad` no longer merges while a save is in flight.
  - Verified: `money-lost-save-a.js` then `-b.js` now gives `cashOnThisPC 1500 · serverCash 1500` (it was 2000).
  - The probe also had to change: it now closes Chrome properly. Killing it lost localStorage written in the last
    seconds, which a real tab close doesn't.

### 1.2 [High] Reopen the game mid-match and you can spend the money the bet is riding on
- **Where:** `openClubhouse` / `clubhouseGo` (about lines 10720 and 10859); `settleMatch` (about line 13111).
- **Scenario:** during a match the clubhouse is locked, but after a reload it isn't. The match shows as "Resume your
  match", and the shop, coach, caddies, trophy room and club membership all work as normal. The stake was approved
  against your cash at tee-off, and nothing holds that cash.
  1. You're 4 down for $5,000 with $5,700 in your pocket.
  2. Reload, spend $5,640 on lessons (permanent stats), resume, lose.
  3. The loan-shark rule takes the $60 you have left, wipes the other $4,940, and snaps one club.

  A player could do this deliberately every time a match goes badly. A player could also do it innocently and get a
  beating they didn't expect.
- **Evidence:** `money-reload-a.js` then `money-reload-b.js`:
  ```
  clubhouse:  "Resume your match vs The Shark · 4 DN thru 4 · $5,000 on it", cash 5700, Perception 2
  afterCoach: 6 lessons bought, cash 60, Composure 3, Perception 7
  settled:    lost 5 & 4 · owed 5000 · paid 60 · unpaid 4940 · stats kept · 1 club snapped
  ```
- **Fix (S–M):** while a match is live (`feePaid && !settled`), don't let cash drop below what the live bets could cost.
  The simplest version locks the spending rooms with "Finish or forfeit your match first"; the range and the bag room
  can stay open. Creating or accepting friend challenges should be locked the same way, since they also move cash out.
- **✅ Fixed 2026-11-19.**
  - `liveMatch()` is true when a match has teed off and isn't settled. While it is, these show a "finish it or forfeit
    it first" message instead of spending:
    - the pro shop, coach and caddie rooms (`clubhouseGo`);
    - the country-club membership (`tierClick`);
    - trophy purchases, and buying off a friend's wall (`trophyClick`);
    - challenging or accepting a friend (`friendsClick`, `sendChallenge`).
  - The range, the bag room, the trophy room and Friends still open.
  - Verified: `money-reload-b.js` gives `coachOpened false · lessonsBought 0`, and the lost $5,000 match is paid in full
    (`paid 5000 · unpaid 0`).

### 1.3 [High] A friend accepting your challenge can push your cash below zero
- **Where:** `api/challenge.js` `accept` (about line 252) takes the stake from both careers on the server;
  `mergeServer` on the challenger's PC.
- **Scenario:** the challenger's stake is only taken when the friend accepts, which can be any time in the next week.
  The challenger's PC doesn't know until it next opens the clubhouse.
  1. You have $700 and challenge a friend for $500.
  2. The friend accepts while you're in the pro shop or out on a hustler match. The server now holds $500; your PC
     still shows $700.
  3. You spend $650 (or lose a $600 match your PC thought you could cover).
  4. The next save merges: $200 on the server − $650 spent here = **−$450**.

  With negative cash the loan-shark rule never clears the debt: every later loss counts as "couldn't pay" (a beating
  and a snapped club) while the balance stays negative, and green fees are waived because you're "broke".
- **Evidence:** `money-merge.js`, part 2:
  ```
  created 200 · accepted 200 · serverCashAfterEscrow 200 · cashThisPCShows 700
  after a $650 purchase: cashHere −450 · serverCash −450
  ```
- **Fix (M):** take the challenger's stake when the challenge is created (and give it back on decline, cancel or
  expiry), so their own PC knows before it can spend it. As a safety net, `settleMatch` should treat cash that is
  already negative as part of what's owed and reset it to zero with the beating.
- **✅ Fixed 2026-11-19.**
  - **Server (`api/challenge.js`):**
    - `create` takes the challenger's stake (and refuses if they can't cover it).
    - `accept` takes only what isn't held yet. A challenge made before this change still takes both stakes, and a
      failure gives back only what that accept took.
    - Decline, cancel and "not answered in 7 days" give the stake back with the new `refundHeld`, once, marked in
      `paid`. `list` also retries a refund that didn't finish.
  - **Client:**
    - `sendChallenge` syncs right after creating, so the new cash shows at once.
    - Friends counts a pending challenge's held stake, and the "how it works" texts say when each stake is held.
  - **Safety net:** `settleMatch` sets cash to 0 when the loan-shark rule applies, so an old negative balance is wiped
    with the beating.
  - `MULTIPLAYER_PLAN.md` is updated to match.
  - Verified with `money-merge.js`:
    - part 2: `cashThisPCShowsAfterCreate 200 · serverCashAfterAccept 200 · canSpend650 false`;
    - part 3: a decline refunds the stake, and a stake you can't cover is refused.
  - Verified with `money-amounts.js`: `already −$450, lose $20 → unpaid 470, cash 0`.

### 1.4 [Medium] Reopening the game restarts the hole you were on, wiping its strokes
- **Where:** `startMatch` (about line 13051) and `startTour` (about line 13375): they resume at
  `hp.holeIdx = holes played` and call `enterHole()`. Nothing about the hole in progress is saved.
- **Scenario:** in a money match or an invitational, hit two balls out of bounds, reload, and you're back on the tee
  with no strokes. The hustler's score for the hole is fixed in advance, so a player can retry a hole until they beat
  it. Friend rounds behave the same way (the "leave" dialog even says so), and there it's the friend's money.
- **Evidence:** `money-reload-a.js` leaves hole 5 with 4 strokes and 2 penalties; `money-reload-b.js` after resuming:
  `onHole 5 · strokesThisHole 0 · penalties 0`.
- **Fix (M):** save the hole in progress after every stroke (hole, strokes, putts, penalties, ball position) on the
  match, the invitational entry and the friend card, and resume from it. A cheaper version saves only the stroke and
  penalty counts and resumes from the tee "playing N+1".

### 1.5 [Medium] With two devices, a purchase made on one can be paid for and then lost
- **Where:** `mergeServer` (about line 10489). It merges cash, history, scorecards, handicap rounds and destroyed wall
  pieces. Everything else (bag, snapped clubs, stats, shots learned, caddie, trophies, the match in progress) is kept
  from this PC, whatever the server had.
- **Scenario:** you buy a driver on the laptop. The desktop still has the game open with an unsent change (for
  example, a match in progress). When the desktop next saves, it takes the laptop's lower cash but keeps its own bag,
  then saves that over the server. The money is gone and so is the driver. The same rule means a match finished on
  one device can be resumed and settled a second time on the other.
- **Evidence:** `money-merge.js`, part 1: the other device pays $300 for a driver (`d-prestigio`); after this PC's
  merge: `cashHere 700 · driverHere d-xr16 · serverCash 700 · serverDriver d-xr16`.
- **Fix (M–L):** this is Section 2's subject (the merge rule for every field); decide it there. The minimum is to
  take the server's copy of any field this PC hasn't changed since its last sync.

### 1.6 [Medium] Server payouts and escrow are two steps; a failure between them pays twice or loses the stake
- **Where:** `api/challenge.js`: `payOut` (about lines 124–140), `accept` (about lines 259–271); `api/profile.js`
  `buyshow` (about lines 208–225).
- **Scenario:** each money move is "change the career" and then "record on the challenge that it's done", as two
  separate writes. If the function dies or the second write fails in between (a timeout, a storage hiccup):
  - `payOut`: the winner's career already has the pot, but `paid` isn't recorded. The next time either player opens
    Friends, `list` sees "held but not paid" and pays the pot again.
  - `accept`: the stake has left the career, but `held` isn't recorded. It's never returned, and a retry takes it a
    second time.
  - `buyshow`: if the owner's update fails and the buyer's refund also fails ("Busy" after six tries), the buyer has
    paid for nothing.
- **Evidence:** code path traced; not reproduced, because it needs a storage failure injected between two writes. The
  window is small, so this will be rare, but when it happens money is created or destroyed between two real players.
- **Fix (M):** put the "done" mark inside the career write itself, so one atomic write covers both. For example, the
  payout writes its history line (which already carries the challenge id) and skips if a line for that challenge is
  already there; the escrow does the same with a "held" line. The lock is also released without checking who holds it
  (a slow request can release a newer request's lock); worth tightening at the same time.

### 1.7 [Low] A wall purchase charges the server's price, not the price you confirmed
- **Where:** `api/profile.js` `buyshow` (about line 207); the confirm dialog in `trophyClick` (about line 12345).
- **Scenario:** the price is twice the win's `net` in the owner's history. The buyer confirms the price their page
  shows; the server works the price out again from the owner's career at that moment and charges that. An owner who
  edits their own save between the two can raise it, up to everything the buyer has.
- **Evidence:** code path traced.
- **Fix (S):** send the confirmed price with the request, and refuse if the server's price is different.

### 1.8 [Low] Small inconsistencies: green fee when nearly broke, invitational wording
- **Green fee:** in `startMatch` (about line 13056), cash of $1 less than the fee waives the whole fee and you keep
  your cash; $1 more and you pay it all. At the country club that's $299 kept versus $300 paid. The caddie's loop fee
  works the same way. Fix (S): when short, take what they have.
- **Invitational, lost on countback:** if you tie on total for third but lose the tie-break, the scorecard says
  "You finish T3 of 13: out of the money" while the payoff screen says "4th". Both are consistent with the rules; the
  wording isn't. Fix (S): say "4th (lost a tie for 3rd on the last three holes)".
- **Invitational payoff screen:** the big number is prize minus entry fee, while "Cash before → after" shows only the
  prize, because the fee was paid at the first tee. The rows underneath explain it, so this is only a note.

### Checked and fine
- **Amounts:** `money-amounts.js` played 24 random matches to the 9th hole (12 match play, 12 skins; 4 presses by the
  player, 12 by the hustler, 11 with carried skins, 2 decided early, 1 halved) and compared each payout with an
  independent calculation: 0 mismatches.
- **Paid once:** `settleMatch` and `settleTour` guard on `settled`. In the same run, cash never moved again after a
  match settled, including when play continued "for practice"; each match added exactly one history line; the green
  fee was taken once; `career.match` was cleared on leaving.
- **Loan shark:** owing $20 with $5 gives net −5, unpaid 15, cash 0, one club snapped, and the beating shows. With no
  usable club left nothing is snapped (and a match can't be started with none).
- **Forfeit:** always confirmed first; charges every live bet (skins: the carried pot and every hole left); a decided
  bet keeps its result; forfeiting a settled match costs nothing. Leaving the round intro before teeing off costs
  nothing.
- **Shop, coach, caddies, trophies, membership:** every purchase checks cash first and can't be bought twice.
  Luxury repairs use the ×0.25 rule.
- **Invitationals:** the entry fee is taken once at the first tee; a withdrawal records −entry and can't be settled
  again; a reload resumes the entry without charging again.
- **Friend challenges on the server:** two submits at once are serialised by the lock; each pot pays out exactly what
  was held (match, stroke, skins with unclaimed skins returned); nobody's server-side cash can go negative; an expiry
  with one card in is a forfeit, with none is a refund.
- **Payoff screen (matches):** cash before and after, the net and the per-bet rows match what `settleMatch` applied.

### Noticed for later
- **Section 2:** `mergeServer`'s rule for each field (see 1.5); whether `syncLoad` can run while a save is in flight
  (see 1.1); the 64 KB limit on the tab-close save.
- **Section 3:** a friend-round card is whatever the browser sends (`cleanCard` only checks ranges), so a player can
  post any score and take a friend's stake; friend rounds can also replay holes (see 1.4).
- **Section 4:** the handicap tooltip says "best 4 of the last 3 rounds".
- **Section 7:** the hustler's presses can raise what you stand to lose to four times a stake that was capped at your
  cash plus credit, with no say from you. A debt wiped by the loan shark costs one club repair and 10 reputation,
  however big the debt was.
