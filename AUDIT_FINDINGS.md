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
| 1.7 | Low | A wall purchase charges the server's price, not the price you confirmed | ✅ Fixed (with 3.5) |
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
- **✅ Fixed 2026-11-20 (the full version).**
  - **What's saved:** the hole in progress (`cr.cur`) on the match, the invitational entry and the friend card. That's
    the hole, strokes, putts, penalties, where the ball lies, where the last shot was played from (for a
    stroke-and-distance drop), the map's shot lines, your tilt, and in a match how far the hustler has got.
  - **When:** as each stroke is hit (`saveHoleProgress` in the shot, chip and putt launches) and again when the ball
    stops (`setupNextShot`). A shot still in the air when the game closes counts, and you play again from where you
    hit it, so reloading can't undo a bad swing.
  - **Resuming:** puts you back where your ball lies, with the toast "Back on hole N, where you left it · Playing X".
    The hustler's plan is seeded, so he carries on from the same stroke.
  - **Cleared** when the hole is finished.

  `money-reload-a.js` / `-b.js`: hole 5 left with 4 strokes, 2 penalties and the ball halfway to the pin (the hustler
  1 stroke in); after reopening: `strokesThisHole 4 · penalties 2 · ball the same · onTee false · hisStrokes 1`.

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
- **Now covered by 2.2**, which has the field-by-field table and the fix design. Fixing 2.2 fixes this.
- **✅ Fixed 2026-11-20, by 2.2's three-way merge.** `money-merge.js` part 1 now gives `driverHere d-prestigio` (it
  was `d-xr16`). `sync-conflicts.js` shows a match settled on the other device is no longer "in progress" here, and
  its result is in the history.

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
- **✅ Fixed 2026-11-20.** Every money move is now one write to the career, carrying its own record, so running it
  again after a failure does nothing twice.
  - **Stakes:** a career lists the challenges holding a stake of its (`escrow`). Taking a stake adds the id, and does
    nothing if it's there; giving it back or paying out removes it, and does nothing if it isn't.
  - **Payouts:** the payout and its history line (which carries the challenge id) are one write; a line already there
    means it was paid. The challenge's `held` / `paid` marks only save work now.
  - **Creating a challenge:** the challenge is written first and the stake taken after, so a request that dies in
    between leaves a challenge that can give the stake back.
  - **Older challenges:** ones made before this (no `esc`) go by `held` as before.
  - **Wall purchases:** the buyer's payment and a pending record (`pendingBuys`) are one write; the owner's side does
    nothing if their "sold" line is there; then the record is cleared. A purchase left half-done is settled on the
    buyer's next load, a minute on: done → cleared, not → money back.
  - **Locks:** a challenge's lock holds the request's own token and is released only by its holder (a Redis script).
  - **The test:** the dev server can now make a chosen storage write fail on demand (`POST /__fail`), so
    `money-steps.js` breaks each move half-way:

    | Broken half-way | After the retry |
    |---|---|
    | Creating a challenge | Called off → the stake is back (1000) |
    | Accepting | Accepted again → $100 taken once (900, not 800) |
    | The payout's "paid" mark | More lists → winner 1100, loser 900, one history line |
    | A purchase, with its refund failing too | The buyer's next load refunds them; the owner isn't paid |

### 1.7 [Low] A wall purchase charges the server's price, not the price you confirmed
- **Where:** `api/profile.js` `buyshow` (about line 207); the confirm dialog in `trophyClick` (about line 12345).
- **Scenario:** the price is twice the win's `net` in the owner's history. The buyer confirms the price their page
  shows; the server works the price out again from the owner's career at that moment and charges that. An owner who
  edits their own save between the two can raise it, up to everything the buyer has.
- **Evidence:** code path traced.
- **Fix (S):** send the confirmed price with the request, and refuse if the server's price is different.
- **✅ Fixed 2026-11-19, with 3.5.** The page sends the price it showed; `buyshow` refuses any other (409 with the
  real price, and the page reloads their wall). The price now comes from the challenge's record, which the owner
  can't edit.

### 1.8 [Low] Small inconsistencies: green fee when nearly broke, invitational wording
- **Green fee:** in `startMatch` (about line 13056), cash of $1 less than the fee waives the whole fee and you keep
  your cash; $1 more and you pay it all. At the country club that's $299 kept versus $300 paid. The caddie's loop fee
  works the same way. Fix (S): when short, take what they have.
- **Invitational, lost on countback:** if you tie on total for third but lose the tie-break, the scorecard says
  "You finish T3 of 13: out of the money" while the payoff screen says "4th". Both are consistent with the rules; the
  wording isn't. Fix (S): say "4th (lost a tie for 3rd on the last three holes)".
- **Invitational payoff screen:** the big number is prize minus entry fee, while "Cash before → after" shows only the
  prize, because the fee was paid at the first tee. The rows underneath explain it, so this is only a note.
- **✅ Fixed 2026-11-20:**
  - **The green fee:** short of it, you pay what you have and rake bunkers for the rest. The picker says so ("$10:
    you have $5, so you'll pay that and rake bunkers…"); checked in the game: cash 5 → 0.
  - **The caddie's loop fee is left as it is:** short of it, the caddie sits out and you pay nothing, which is fair
    (taking part of it with no caddie wouldn't be).
  - **Countback:** "You finish 4th of 13 (tied for 3rd on 40, lost on the last three holes): out of the money", and the
    same note on the payoff screen.
  - **The payoff screen's cash line:** says "(the entry was paid at the first tee)".

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

## Section 2 — Saves and sync (2026-11-19, Fable 5.2)

**Summary.** Everyday saving works: one device, one tab, a working connection. The server's version check does its
job, and money the server moves (stakes, payouts, wall sales) reaches this PC correctly. The problems appear when
something is out of step: an expired sign-in, a second tab or device, a dropped connection, or a very large career.
Nine findings: 1 high, 5 medium, 3 low.

| # | Severity | Finding | Fix size |
|---|---|---|---|
| 2.1 | High | Signing in again after your sign-in expires throws away everything not yet saved | ✅ Fixed |
| 2.2 | Medium | A second tab or device with unsent changes overwrites newer purchases and progress (replaces 1.5) | M |
| 2.3 | Medium | The fix for 1.1 has a gap: after six failed saves in a row, cash can still be counted twice | ✅ Fixed |
| 2.4 | Medium | A slow reply from the server can swap the career under an invitational or friend round | ✅ Fixed |
| 2.5 | Medium | Past about 100 matches, the save sent when the tab hides or closes always fails, silently | S |
| 2.6 | Medium | A career grows without limit; at about 1,160 matches every save is refused, shown as "offline" | S–M |
| 2.7 | Low | Careers from the game's earliest versions crash the clubhouse | S |
| 2.8 | Low | Guest careers: two tabs overwrite each other, and storage failures are silent | S |
| 2.9 | Low | Small robustness gaps (retry loop, no retry when offline, half-made profile, starting over) | S |

The probe scripts are `tools/test/sync-*.js`. Each one's header says how to run it and what a correct result is.

### 2.1 [High] Signing in again after your sign-in expires throws away everything not yet saved
- **Where:** `profileSignIn` (about line 10815); `switchPlayer` (about line 10836); the "Sign in again" button
  (about line 14851); `api/profile.js` `newSession` (`SESSION_S`, 30 days).
- **Scenario:** a sign-in lasts exactly 30 days from the moment you signed in. Playing doesn't extend it, so every
  regular player's sign-in will expire, quite possibly in the middle of a session.
  1. The sign-in expires. Saves are refused (401). The game keeps playing from this PC's copy and shows "your sign-in
     has expired — sign in again (home screen)".
  2. You keep playing: win matches, buy clubs. All of it is only on this PC, marked unsent.
  3. You do what the game asks and sign in again. `profileSignIn` takes the server's copy, marks it as synced, and
     writes it over this PC's copy. Everything since step 1 is gone.

  The same happens if you switch player while offline and sign back in later: the unsent copy is on the PC, and the
  sign-in overwrites it.
- **Evidence:** `sync-reauth.js`:
  ```
  afterTheWin:         cash 1500 · rep 5 · syncState "signedout" · unsent true
  homeSays:            "⚠ Your sign-in has expired" · Sign in again shown
  afterSigningInAgain: cash 1000 · rep 0
  ```
- **Fix (M):**
  - In `profileSignIn` (sign in, not sign up): look at this PC's copy for that profile first. If it has unsent
    changes, keep it and merge the server's copy into it with `mergeServer`, as a normal conflict does.
  - On the server, make sign-ins slide: push the session's expiry out another 30 days whenever it's used, so an active
    player is never signed out.
- **✅ Fixed 2026-11-19.**
  - **Client:** `profileSignIn` (signing in, not a new profile) now loads this PC's copy of that profile first. If the
    copy has unsent changes, the game keeps it, merges the server's copy into it (when the server's is newer), and
    sends the result.
  - **Server:** `sessionId` in `api/_redis.js` pushes the session's expiry back to 30 days on every use
    (`EXPIRE`, sent with the `GET`). A session that has already gone stays gone. `SESSION_S` now lives there.
  - The dev server's fake Redis learned `EXPIRE` and `TTL`.
  - Verified with `sync-reauth.js`: `afterSigningInAgain: cash 1500 · rep 5 · onTheServer: cash 1500 · rep 5` (it was
    $1,000 and 0).
  - Verified with `session-slide.js`: a session with 2 days left has 30 again after use, and a gone session stays gone.

### 2.2 [Medium] A second tab or device with unsent changes overwrites newer purchases and progress (replaces 1.5)
- **Where:** `mergeServer` (about line 10497); `syncLoad` (about line 10526).
- **Scenario:** when this PC has unsent changes and the server has a newer copy, `mergeServer` combines only some
  fields and keeps this PC's copy of the rest:

  | Field | What the merge does | Right? |
  |---|---|---|
  | cash | server's cash + what this PC added since its last sync | Yes |
  | history | both copies, de-duplicated, by date | Yes |
  | scorecards (`cards`) | both, by id, the fuller card wins | Yes |
  | handicap rounds | both, by date, last 20 | Yes |
  | wall pieces destroyed | both | Yes |
  | bag, locker, snapped clubs, putters | this PC's | No |
  | stats, shots learned, caddie | this PC's | No |
  | reputation, circuit, trophies, titles | this PC's | No |
  | match, invitational, friend card in progress | this PC's | No |

  For a player with one tab this is fine, because the server itself only ever changes the first five rows. With a
  second tab or a second device it loses things:
  - Tab A buys a driver and saves. Tab B, opened earlier, then saves any change. Tab B takes the lower cash but keeps
    its own bag, and saves that. The money is spent and the driver is gone.
  - A match finished in one tab is still "in progress" in the other, where it can be resumed and settled again.

  "Unsent changes" is easy to have: opening the clubhouse can mark the career changed before the server's copy has
  arrived (clearing a finished match, marking a friend's result as seen).
- **Evidence:** `money-merge.js`, part 1 (from section 1): the other copy pays $300 for a driver; after this copy's
  merge: `cashHere 700 · driverHere d-xr16 · serverCash 700 · serverDriver d-xr16`.
- **Fix (M):**
  - Make the merge three-way. For every field, compare this PC's value with the copy from its last sync (`sync.base`,
    already kept). If this PC hasn't changed the field, take the server's. Only fields changed on both sides need a
    rule, and the five that have one keep it. That fixes every "No" row above when the two copies changed different
    things.
  - For two tabs in one browser, also listen for the other tab's save (the `storage` event). The older tab should
    reload the career when it isn't in a round, or say "the game is open in another tab".
- **✅ Fixed 2026-11-20:** both.
  - **The three-way merge (`mergeServer`):** every field this PC hasn't changed since its last sync takes the server's
    value. A field changed on both sides keeps this PC's, except where a field has its own rule:
    - the old five (cash, history, scorecards, rounds, wall destroyed);
    - trophies, titles and results seen are unions;
    - shots learned: learned on either side counts;
    - stats: the higher level wins;
    - the wall's settings: three-way, field by field.

    The round being played keeps its own match / entry / friend card (2.4). After a merge on a save, the game
    refreshes its clubs, stats and screens.
  - **Two tabs:** when another tab saves this career, this tab takes its copy, provided it isn't in a round and has
    nothing of its own waiting (a guest: no pending write; a profile: nothing unsent). Otherwise it warns "⚠ The
    game is open in another tab", at most once a minute.

  `sync-conflicts.js`:
  - the other device's driver ($300), power lesson and draw all survive this PC's save, alongside this PC's fade and
    reputation;
  - a match settled on the other device is no longer "in progress" here, and its result is in the history.

  `money-merge.js` part 1 now gives `driverHere d-prestigio` (it was `d-xr16`). `sync-guest.js` covers the two-tab
  cases.

### 2.3 [Medium] The fix for 1.1 has a gap: after six failed saves in a row, cash can still be counted twice
- **Where:** `syncNow` (about line 10480): `sync.pend = [...].slice(-6)`.
- **Scenario:** the 1.1 fix remembers the saves whose reply never came back, so a later merge can tell that one of
  them reached the server. It remembers only the last six.
  1. The connection drops just as a save goes out. The save reaches the server; the reply is lost.
  2. The connection stays down while you play a few holes. Each hole tries to save and fails. After six failures the
     save from step 1 has dropped off the list.
  3. The connection returns. The merge no longer knows the step 1 save landed, and adds its cash change again.

  A connection that drops mid-save and stays down for a few minutes is how connections usually drop.
- **Evidence:** `sync-pend-gap.js`:
  ```
  3 failed tries while offline -> cash 1500 (want 1500)
  6 failed tries while offline -> cash 2000 (want 1500)
  ```
- **Fix (S):** don't cap the list at six. The entries are tiny, so keep a few hundred, and clear them only when a
  save is confirmed or a merge has used them (both already happen).
- **✅ Fixed 2026-11-19.**
  - `sync.pend` now keeps the last 300 unanswered saves.
  - `career.saveIds` keeps the last 60 (`SAVE_IDS`, about 1 KB), so a save that landed is still recognised after
    another device has saved over it several times.
  - Verified with `sync-pend-gap.js`: 3, 6 and 40 failed tries all give $1,500.

### 2.4 [Medium] A slow reply from the server can swap the career under an invitational or friend round
- **Where:** `syncLoad` (about line 10526). It checks "not in a round" before it asks the server, and not again when
  the answer arrives. Its "take the server's copy" branch then empties the career object and refills it.
- **Scenario:**
  1. The server has a newer copy (a friend's payout landed overnight, say).
  2. You open the game. `syncLoad` asks for the server's copy; the reply is slow (a cold start can take seconds).
  3. Before it arrives, you resume your invitational or friend round.
  4. The reply arrives and replaces the career's contents. The round is still holding the old entry object, which is
     no longer part of the career.
  5. Every hole from then on is recorded on the detached object and never saved.

  For an invitational, the prize is still paid at the end, but the career still shows the entry as "in progress, thru
  1": it can be resumed, finished and paid again. For a friend round, the finished card can't be sent, and the holes
  have to be played again. A hustler match escapes this only because resuming one happens to save straight away.
- **Evidence:** `sync-load-midround.js`:
  ```
  before:                 roundOn true · sameEntry true · holes 1
  whenTheAnswerArrives:   sameEntry false
  afterPlayingHole2:      holesInTheRound 2 · holesInTheCareer 1 · holesOnTheServer 1
  ```
- **Fix (S):** in `syncLoad`, check `round.on` again after the reply arrives. If a round has started, merge instead
  of replacing (the merge changes fields in place and is safe), or leave it for the next save's conflict to handle.
- **✅ Fixed 2026-11-19.**
  - If a round is on by the time the reply arrives, `syncLoad` merges the server's copy in place (when it's newer) and
    queues a save, so the career object is never swapped out.
  - Verified with `sync-load-midround.js`:
    - `whenTheAnswerArrives: sameEntry true · cash 950` ($1,000 − the $250 entry + the server's $200);
    - `afterPlayingHole2: 2 · 2 · 2` (in the round, the career and the server).

### 2.5 [Medium] Past about 100 matches, the save sent when the tab hides or closes always fails, silently
- **Where:** the `visibilitychange` handler (about line 10613): `clearTimeout(sync.timer); syncNow(true)`.
- **Scenario:** when the tab is hidden or closed with unsent changes, the game cancels its normal queued save and
  sends one marked "keepalive", so it survives the page closing. Browsers refuse keepalive requests over 64 KB. A
  career passes 64 KB at about 100 matches, because every save sends the whole career, including 100 scorecards.
  From then on:
  - the keepalive save fails at once and nothing is sent;
  - the normal save it replaced has been cancelled;
  - nothing retries until the next change or the next visit to the clubhouse.

  So for an established player, switching tabs or closing the game right after a change leaves that change only on
  this PC. Nothing is lost on this PC, but another device won't have it, which feeds 2.2.
- **Evidence:** `sync-size.js`: a career of 71,761 characters:
  `tabHidingSaveOver64KB: syncState "offline" · serverVersionMoved false · retryQueued false`; the same career with a
  normal save: `syncState "ok" · serverVersionMoved true`.
- **Fix (S):** when the tab hides, send a normal save if the career is over about 60 KB (a hidden tab still finishes
  its requests), and keep keepalive for small ones. When the tab becomes visible again with unsent changes, queue a
  save. Trimming what is sent (see 2.6) pushes the limit much further out.
- **✅ Fixed 2026-11-20:** both.
  - When the tab hides with unsent changes, a career over 60,000 characters is sent as a normal request (a hidden
    tab still finishes it). A smaller one still goes as keepalive, which outlives the page closing. If the page
    closes before a normal request finishes, the change is still on this PC (8.1 flushes it as the page goes) and is
    sent on the next visit.
  - When the tab comes back with changes still unsent, a save is queued.

  `sync-size.js`: a 71,990-character career hiding the tab → `syncState "ok" · serverVersionMoved true`. A save that
  failed while the tab was hidden → `afterTabBack "ok" · serverVersionMoved true · stillUnsent false`.

### 2.6 [Medium] A career grows without limit; at about 1,160 matches every save is refused, shown as "offline"
- **Where:** `career.history` (never trimmed); `api/profile.js` `MAX_CAREER` (250,000 characters); `syncNow`'s
  handling of any reply that isn't 200, 409 or 401.
- **Scenario:** each match adds a history line of about 170 characters, for ever. Measured sizes:

  | Career | Characters |
  |---|---|
  | brand new | 498 |
  | 100 matches (100 scorecards) | 68,284 |
  | 500 matches | 137,484 |
  | about 1,160 matches | over 250,000 |

  Past the limit the server answers "Bad save" (400). The game shows that as "⚠ not synced (offline) — will retry",
  and retries for ever with the same result. The career carries on from this PC only, and the player is never told
  why. That is a long way off (a few hundred hours of play), but it is permanent when it arrives.
- **Evidence:** `sync-size.js`: `over250000: chars 255192 · syncState "offline" · whatThePlayerSees "… ⚠ not synced
  (offline) — will retry" · serverVersionMoved false · stillUnsent true`.
- **Fix (S–M):** keep the last few hundred history lines, and fold older ones into running totals (the records and
  trophies that read history need those totals). Show a refused save as its own message, not as "offline".
- **✅ Fixed 2026-11-20:** both, but with kept lines instead of running totals.
  - **The trim (`trimHistory`):** the history keeps its last 300 lines, plus every line that something reads for all
    time: each friend challenge (your record against them, the rivalry wall and its sales), the first hustler win and
    the first $1,000 win (their trophies), and the best finish in each invitational. Only old hustler matches, entries
    and sales go.
  - **Why no running totals:** nothing on screen adds up the old lines (the Scorecards tab counts its own archived
    cards), so there was nothing for totals to feed.
  - **When it runs:** on loading a career, after a merge, and on a save once the history is 20 lines over.
  - **A refused save:** the server answers 413 "This career is too big to save online" when that's the reason. The
    game shows any refused save as "⚠ not saved online: the server turned it down (…). It's kept on this PC", not as
    "offline".

  `sync-size.js`: 1,424 lines (255,758 characters) became 304 lines (90,015) on the next save, which went through;
  the friend line, the best invitational finish, the first win and the first $1,000 win were all kept. A career made
  too big another way shows the new message. Friend lines aren't trimmed, so thousands of challenges could still add
  up; that's far beyond any real player.

### 2.7 [Low] Careers from the game's earliest versions crash the clubhouse
- **Where:** `upgradeCareer` (about line 10420). It fills in `out`, `putters`, `tierMax`, `history`, `rounds`,
  `pvpSeen`, `trophies` and `titles`, but not `unlocks`, `snapped`, `bag` or `putter`.
- **Scenario:** a career saved before the coach, the loan shark or the bag existed throws errors as soon as the
  clubhouse opens, and the shop, coach and match picker don't draw. Only a save from the first day of development
  could be in this state, so in practice this is your own PC if anywhere.
- **Evidence:** `sync-old-saves.js`:
  ```
  ok     · today's shape
  ok     · before the scorecard archive, luxury clubs, caddies, trophies
  ok     · before friends and handicaps
  ok     · before the pro shop
  ERRORS · before the coach (no unlocks)
  ERRORS · before the loan shark (no snapped)
  ERRORS · the first career save (no bag, putter)
  ok     · no reputation or seed
  ```
- **Fix (S):** have `upgradeCareer` fill every field `newCareer` creates, from the same defaults.
- **✅ Fixed 2026-11-20:** `upgradeCareer` now fills every field `newCareer` has, from a fresh career's defaults:
  - a missing field, or one of the wrong kind, is replaced;
  - `stats` and `unlocks` get any key they're missing;
  - a bag is only filled in if there's none (a bag can have more slots than the starter one);
  - `putters` starts from the career's own putter, and `tierMax` from its tier.

  `sync-old-saves.js`: all eight shapes, back to the very first save, open with no errors.

### 2.8 [Low] Guest careers: two tabs overwrite each other, and storage failures are silent
- **Where:** `careerSave` (about line 10439); `lsSet` (about line 10407); `readCareer`.
- **Scenario:**
  - **Two tabs.** Each tab holds its own copy and writes the whole career on every save. Whichever saves last wins,
    so a purchase made in one tab disappears when the other saves. Nothing listens for the other tab.
  - **Storage blocked or full.** `lsSet` swallows the error. A guest in a private window, or with storage full, plays
    a whole session and nothing is kept, with no warning.
  - **A damaged save.** If the stored career can't be read, the game treats it as "no career" and offers to start
    one. Starting one writes over the damaged save, which might have been recoverable.
- **Evidence:** code path traced.
- **Fix (S):** listen for the `storage` event (same as 2.2). Show a warning when a write fails. Before starting a new
  career over an unreadable save, copy the old text to a backup key.
- **✅ Fixed 2026-11-20:** all three.
  - **Two tabs:** the `storage` event (see 2.2).
  - **A failed write:** a toast, and the clubhouse's status line reads "Playing on this PC only · ⚠ this browser
    isn't keeping it (storage is blocked or full)" until a write works again.
  - **A save that can't be read:** it is copied to `<key>_damaged` (or `<key>_damaged_<time>` if that's taken by a
    different one) as soon as it's read, before anything can write over it.

  `sync-guest.js`: all six checks pass.

### 2.9 [Low] Small robustness gaps
- **A copy this version can't read.** If the server's copy fails `upgradeCareer` (for example a future save format
  seen by an old tab), `mergeServer` returns without doing anything and `syncNow` tries again 50 ms later, for ever:
  about 20 requests a second. Fix: stop and tell the player to reload.
- **No retry when offline.** After a failed save the status says "will retry", but nothing does until the next
  change or the next clubhouse visit. Fix: retry on a timer, and on the browser's `online` event.
- **A half-made profile.** `signup` in `api/profile.js` writes the name first and the password in a second step. If
  the second step fails, the name is taken for good and nobody can sign in to it. Fix: write both in one step.
- **Starting over.** "Start your career over" on a profile makes a new career, but if another tab or device has
  unsent changes, the merge brings the old history, scorecards and handicap rounds back into it. Fix: mark a restart
  so a merge doesn't cross it.
- **✅ Fixed 2026-11-20:** all four.
  - **A copy this version can't read:** the merge stops, and the status line says "⚠ a newer version of the game
    saved this career: reload the page". `syncLoad` never replaces this PC's career with an unreadable one.
    `sync-conflicts.js`: 1 request instead of about 40.
  - **Retrying when offline:** a failed save is retried on a timer (15 s, doubling to 5 minutes) and as soon as the
    browser's `online` event fires.
  - **A half-made profile:** the name, salt, hash and creation time are now written in one Redis script (`SIGNUP` in
    `api/profile.js`). A name left half-made the old way (a name with no password) can be signed up again. The dev
    server's fake Redis follows the same rules. Tested: sign-up, a duplicate refused (409) and sign-in. Claiming a
    half-made name couldn't be set up from a test, so that part was only checked by reading the script.
  - **Starting over:** a career's `created` marks which career it is. A merge never crosses a restart: if the
    server's copy is the newer career, it replaces this PC's (a round of the old career is dropped, not settled into
    the new one), with a toast; if this PC's is, nothing from the old career comes across. (Careers without `created`
    count as 0, not "now", so they aren't mistaken for a restart.) `sync-conflicts.js`: the new career replaces this
    PC's (cash $150, no history).

### Checked and fine
- **The version check.** The server only accepts a save made from its current version; an older copy gets a 409 with
  the newer one and merges. No path lets a stale copy write over the server without merging first.
- **Money the server moves.** Stakes held, payouts and wall sales reach this PC correctly whether it has unsent
  changes or not (`money-merge.js` parts 2 and 3, and the cash, history and wall rows of the table in 2.2).
- **A lost reply, then up to five failed saves:** cash is counted once (`sync-pend-gap.js`, the "3 failed tries" line,
  and `money-lost-save-a.js` / `-b.js`).
- **A load while a save is in flight** is skipped, so the two can't cross.
- **A slow load when resuming a hustler match** is safe (`sync-load-midround.js` was first run on a match: the round
  and the career stayed the same object, and the hole was saved).
- **Old saves** from the last four shapes of the career load and open every room (`sync-old-saves.js`).
- **Two profiles in one browser** are kept under separate keys; switching player clears the career, the sync state and
  the friends list from memory, and signs the old session out on the server.
- **A guest career and a profile.** Signing in to an existing profile leaves the guest career alone. "Bring this
  career" only applies to a new profile, and moves it (the guest copy is removed).
- **Scorecard archive:** capped at 100; handicap rounds at 20; friend results seen at 40.

### Noticed for later
- **Section 3:** the server stores whatever career object the browser sends (`cleanCareer` checks only that it's an
  object under the size limit).
- **Section 8:** every `careerSave` writes the whole career to this PC's storage twice (the career and the copy from
  its last sync). At 500 matches that is about 275,000 characters, several times a hole.

## Section 3 — Server security (2026-11-19, Fable 5.2)

**Summary.** The basics hold: nobody can act as another player, passwords are hashed and compared safely, `keeto` is
the only admin and no path can make another one, and there are no secrets in the repo or its history. The problems
come from one design fact: **the server stores whatever career a browser sends, and then trusts it** when it shows
that career to other players, computes with it, or prices things from it. Nine findings: 1 critical, 3 high,
4 medium, 1 low.

| # | Severity | Finding | Fix size |
|---|---|---|---|
| 3.1 | Critical | Visiting another player's trophy room can run their script in your browser | ✅ Fixed |
| 3.2 | High | One player's malformed save takes down the sign-in list and Friends for everyone, and can hold up a payout | ✅ Fixed |
| 3.3 | High | Anyone can fill the database and overload the shared lists: no cap on profiles or on data read per request | M |
| 3.4 | High | A friend-challenge card is whatever the browser sends, so a player can post a fake score and take the stake | M–L |
| 3.5 | Medium | The rivalry wall is built from the owner's own save, so wins and prices can be made up | ✅ Fixed |
| 3.6 | Medium | Anyone can put fake scores on the shared Top 10 | ✅ Fixed |
| 3.7 | Medium | Passwords can be 4 characters, and guessing is limited per address only | S |
| 3.8 | Medium | The admin password's hash is public, so its length is the only protection | S |
| 3.9 | Low | Smaller gaps (challenge flooding, sign-ins that never end, no security headers, repo files on the live site) | S |

The probes are `tools/test/sec-api.js` (run with `node`, no browser) and `tools/test/sec-wall-xss.js`. Both refuse to
run against anything but the local dev server.

**Before pushing this section:** the repo is public and the live site serves every file in it, including this one.
Fix 3.1 (and ideally 3.2) first, then commit the findings and the fixes together. (Done: 3.1, 3.2, 3.5 and 3.6 were
fixed before this section was first pushed.)

### 3.1 [Critical] Visiting another player's trophy room can run their script in your browser
- **Where:** `renderTrophies`, the visiting branch (about lines 12267–12277); `rivalItems` (about line 12175);
  `api/profile.js` `showcase` (about line 174), which passes history text through unchanged.
- **Scenario:** the rivalry wall of a visited player is drawn from their history: a friend's name, the format and a
  challenge id go into the page as HTML. The picture of each plaque escapes its text, but the row beside it doesn't.
  Because a career is whatever its owner's browser saved, the owner controls those strings.
  1. An attacker makes a profile and saves a career whose history has markup in a friend's name.
  2. Anyone who opens the attacker's trophy room from Friends runs that markup as script, inside the game's page.
  3. The script can read the visitor's sign-in token and then do anything the visitor can: overwrite their career,
     send challenges, or "buy" a made-up trophy off the attacker's wall with all the visitor's cash (see 3.5).

  If the admin visits, it's the admin's sign-in that is taken.
- **Evidence:** `sec-wall-xss.js` (a harmless marker; it sends nothing anywhere):
  ```
  inTheirTrophyRoom true
  scriptFromTheirName "script ran; token readable: true"
  htmlFromFormat true · htmlFromChallengeId true
  ```
- **Fix (S–M):**
  - **Client:** escape every value from another player before it goes into HTML (one shared helper that also escapes
    quotes), and only use a challenge id that looks like one (16 hex characters) and a format the game knows.
  - **Server:** `showcase` should send only clean values: names that match the profile-name rule, known formats,
    numbers as numbers, and a result line from a fixed set of characters.
  - Both are needed: the client fix closes the hole, the server fix stops the next one like it.
- **✅ Fixed 2026-11-19.**
  - **Client:**
    - A shared `escH()` escapes `& < > " '`. Every value from a career on the rivalry wall goes through it, in
      visitors' rooms and in your own: names, the result, the score line, and the challenge ids and keys in button
      attributes. So do the "bought off your wall" rows and the Scorecards tab's friend names and older result lines.
    - `rivalItems` keeps only a challenge id of 16 hex characters, a format the game knows, and numbers for stake,
      net and date.
    - The plaque pictures use the same helper.
  - **Server:** `showcase` now sends only clean values:
    - friend ids and names that match the profile rules;
    - a known format;
    - finite numbers;
    - result text with markup characters removed (`plain()` in the new `api/_career.js`);
    - titles reduced to `{ id, date, score }`.
  - Verified with `sec-wall-xss.js`: `scriptFromTheirName "did not run" · htmlFromFormat false · htmlFromChallengeId
    false`. An honest wall still shows its record, trophy, score and buy-off price.

### 3.2 [High] One player's malformed save takes down the sign-in list and Friends for everyone, and can hold up a payout
- **Where:** `api/profile.js`: `cleanCareer` (checks only "an object under 250,000 characters"), `handicapOf`,
  `roster`, `players`; `api/challenge.js`: `payOut`, `strokesFor`.
- **Scenario:** the server reads fields of stored careers as if they had the right type.
  - **Shared lists.** `roster` (the sign-in screen's list, no sign-in needed) and `players` (Friends) compute every
    player's handicap in one pass. If one career has `rounds` as a string, that throws, and the whole request fails
    with "Profiles unavailable". So one player, with one save, removes the profile list from the sign-in screen and
    breaks Friends for everybody, until they save a normal career again. It could also happen by accident, from a
    bug in a future version of the game.
  - **Payouts.** `payOut` pays the challenger first, then the other player. If the challenger's career has `history`
    as a string, the first step throws and the second never runs. A challenger who loses can leave their career
    like that, and the winner's pot is never paid.
- **Evidence:** `sec-api.js`:
  ```
  one player saves rounds: "xxx" -> the sign-in list 500 Profiles unavailable, the Friends list 500, challenging them 500
  the loser's career has history: "x" -> the winner's submit 500; "… wins 5 & 4"; the winner's cash 300 -> 300 (should be 700)
  once the loser's career is normal again, the next list pays the winner -> 700
  ```
- **Fix (M):**
  - Check a career's shape when it is saved: cash a finite number, `rounds` and `history` arrays of plain entries with
    numbers where numbers belong and short strings, and so on. Refuse or repair anything else.
  - Make the shared endpoints defensive: work each player out inside its own try/catch, so one bad career is skipped.
  - In `payOut`, pay each player in its own try/catch, so one failure doesn't block the other.
- **✅ Fixed 2026-11-19.**
  - **New module, `api/_career.js`:**
    - `normCareer()` repairs a career's shape: cash, reputation and circuit as numbers; stats; the arrays; handicap
      rounds, scorecards and history entries of the right kind; and the wall lists.
    - The module also holds the one shared `handicapOf`, which now ignores malformed rounds. `api/profile.js` and
      `api/challenge.js` used to keep their own copies; both now use this one.
  - **Where repairs happen:**
    - every career saved or signed up with (`cleanCareer`);
    - every career the server changes itself (`updateCareer`: payouts, stakes, refunds, wall sales).
  - **The shared lists:** `roster` and `players` work out each player on their own and skip one that fails. They send
    clean numbers only.
  - **Payouts:** `payOut` pays each player in its own try/catch. One that fails stays "held but not paid", and `list`
    retries it.
  - **Verified with `sec-api.js`:**
    - `rounds: "xxx"` gives the sign-in list 200, the Friends list 200, and challenging them 200;
    - a loser's career with `history: "x"` no longer stops the winner's payout (`295 -> 695`).
  - **Verified with `sec-bad-stored.js`** (careers already in the database before this fix): the lists are 200 with
    the broken player shown as `cash 0`; their trophy room is 200; the winner is paid `300 -> 700`.

### 3.3 [High] Anyone can fill the database and overload the shared lists
- **Where:** `api/profile.js`: `signup`, `roster`, `players`; `api/_redis.js` `rateLimit`.
- **Scenario:**
  - **Profiles are free and unlimited.** Sign-up needs no email and no check that a person is there. The only limit
    is 10 sign-ups or sign-ins a minute per address: about 14,000 profiles a day from one address. Each can carry
    250,000 characters of anything, so one address can add over 3 GB a day to a small database. When it is full,
    saves fail for every player.
  - **The lists read whole careers.** `roster` and `players` fetch the complete career of up to 200 profiles on
    every call, to show five numbers each. `roster` needs no sign-in (60 calls a minute per address); `players` has
    no limit at all. With 200 large careers that is up to 50 MB read from the database per call, enough to time the
    request out. Even with honest players it grows: 200 players with 100 matches each is about 14 MB every time
    anyone opens the home screen or Friends.
  - **Other calls have no limit either:** `save` (250,000 characters each), `load`, `showcase`, and the challenge
    `list`.
- **Evidence:** `sec-api.js`: `a new profile with 248,000 characters of junk and $1,000,000,000,000 -> 200; on the
  public sign-in list with cash 1000000000000`. The volumes are worked out from the code (`slice(0, 200)` and a
  whole-career `HGET` per profile).
- **Fix (M):**
  - Keep a small summary per player (name, cash, circuit, handicap, rounds, trophies), written when the career is
    saved. `roster` and `players` read only the summaries.
  - Limit sign-ups much harder (a few per address per day, and a ceiling per day overall), and start new profiles
    with a server-made career, not one sent by the browser.
  - Put a per-player limit on `save`, `players`, `showcase` and `list`.
- **✅ Fixed 2026-11-20:** all but the server-made starting career.
  - **Summaries:** each player has a small summary (`golf:sum:<id>`: name, circuit, cash, reputation, handicap, rounds,
    last played, trophies). It's written on every save and sign-up, and by `updateCareer` (payouts, wall sales).
    `roster` and `players` read only these. A player without one yet gets it worked out from their career once. With
    a 248,000-character profile on the server, the sign-in list came back in 7 ms, 469 characters long.
  - **Sign-ups:** 5 a day from one address, and 300 a day for everyone, on top of the 10 a minute. Both are settings
    (`GOLF_SIGNUPS_PER_IP`, `GOLF_SIGNUPS_PER_DAY`). The dev server raises them for its tests; `sec-limits.js` runs
    one with the real limit.
  - **Per-player limits a minute:** save 120, load 60, Friends list 30, trophy rooms 60, buying off a wall 20,
    password changes 10, the challenge list 60.
  - **Not done:** a new profile still starts with the career its browser sends (the guest career brought into a
    profile is a feature). It's checked for shape and size like every save. The game trusts the browser's career
    everywhere, so a server-made one at sign-up wouldn't stop a made-up cash figure on the next save.

  `sec-api.js` and `sec-limits.js`:
  - four sign-ups from one address → 200 200 200 429;
  - 32 Friends lists in a minute → 429 from the 30th;
  - a save shows on the Friends list straight away.

### 3.4 [High] A friend-challenge card is whatever the browser sends
- **Where:** `api/challenge.js` `submit` and `cleanCard` (each hole 1–30 strokes, putts and penalties in range;
  nothing else).
- **Scenario:** the round is played in the browser and only the nine scores are sent. Anyone can send a card
  straight to the API, without playing, and win the stake. The same goes for softer cheats: replaying a hole
  (finding 1.4), or editing your own handicap rounds to get more strokes in an "auto" handicap challenge.
- **Evidence:** `sec-api.js`: `nine holes-in-one sent as a card -> 200, "… wins 5 & 4"; the honest player's cash
  1000 -> 500`.
- **Fix (M–L):** a server that doesn't simulate the shots can't make this impossible, but it can make it much harder
  and more visible:
  - Send each hole to the server as it is finished (not the card at the end), with the server recording the time, so
    a hole can't be replayed or the card rewritten.
  - Refuse cards that can't be real: a round finished faster than it can be played, or a hole score nobody makes
    (a hole-in-one on a par 5).
  - Work the handicap out on the server from rounds it recorded itself.
  - Both players already see both cards after it settles, which is the social check. A "dispute" note on the shared
    card would add to it.
- **✅ Fixed 2026-11-20:** the first two in full, the third in part.
  - **Hole by hole:** each hole goes to the server as it's finished (`hole`), in order. Once in, a hole can't be
    changed (409), and a hole can't be skipped. The card must be exactly the nine holes sent.
  - **Impossible scores:** a hole better than three under par (so a hole-in-one on a par 5), or a round better than
    one under par a hole, is refused.
  - **Visible speed:** a card whose holes all came in within 3 minutes is marked. Both players see "⚠ …'s card was
    sent all at once, not hole by hole as it was played" on the shared card. It's a mark, not a refusal: an honest
    player who lost the connection mid-round sends the rest at the end and gets the same mark.
  - **What the other player sees:** while a challenge is open, only the number of holes each has sent, never the
    scores.
  - **In the game:** it sends each hole after it's played, sends any missing ones before the card, and carries on
    after a lost reply or a reload (sending a hole that's already in, unchanged, is fine).
  - **Not done:** working out the "auto" handicap from rounds the server recorded itself. The server records no
    rounds but challenge cards, too few for a handicap. A cheat who scripts the API, waits, and sends a believable
    card can still win; only a server that played the shots could stop that.

  `sec-api.js`: nine aces refused (400), a card with no holes sent (409), a changed hole (409), a skipped hole (409),
  a card that isn't the holes sent (409), the right card settles and is marked. `pvp-round.js`: a friend round played
  in the game; the server has 3 holes after hole 3, the card settles after the 9th, and the shared card shows the mark.

### 3.5 [Medium] The rivalry wall is built from the owner's own save
- **Where:** `api/profile.js`: `wallItem`, `wallPrice`, `showcase`, `buyshow`; the client's `rivalItems`.
- **Scenario:** the trophies on a player's wall ("Beat Keith 3 & 2") and their buy-off prices come from that
  player's history, which their browser saved. A player can put up wins that never happened, against anyone, at any
  price. A visitor who buys one pays real cash to the forger. This is also what finding 1.7 rests on.
- **Evidence:** `sec-api.js`: `a win that never happened is on the wall -> "won · made up" vs …, priced at $500000
  by the server`.
- **Fix (M):** the server has the real record of every settled challenge. Build the wall, and price it, from those
  records: a trophy exists only if the challenge is done and this player won it, and the price is twice what that
  result paid.
- **✅ Fixed 2026-11-19.**
  - **What visitors see:** every friend line other players see comes from the challenge records (`golf:ch:<id>`,
    written only by `api/challenge.js`; they're never deleted). `showcase` takes the challenge ids in the owner's
    history, looks each one up, and keeps only challenges that are settled and include this player. It shows the
    record's result and money, once per challenge. Lines with no record, or a record that doesn't match, are dropped.
    The owner still chooses what's shown, hidden or framed. Hustler wins and big scores still come from the career;
    they only decide earned trophies, not money.
  - **What can be bought:** a piece is for sale only if it's on the owner's wall *and* the record says the owner won.
    The price is twice the record's net. Wins with no challenge id (very old ones) are no longer for sale.
  - **1.7 is fixed with it:** the page sends the price it showed, and the server refuses a different one (409, then
    the page reloads their wall and says the new price).
  - The won / lost / halved wording is one shared `outcomeFor()` in `api/_career.js`, used by payouts and the wall.
  - **Verified with `sec-api.js`:**
    - a made-up win and an inflated real one in the owner's history: the made-up one isn't shown; the real one shows
      once, at the record's $200;
    - buying the made-up one gives 404; the real one at the inflated price gives 409 (`it's $400 now`);
    - at $400 it's bought: buyer `1000 -> 600`, owner `695 -> 1095`; buying it again gives 404.
  - **Verified with `sec-ui-paths.js`** (the game's own buttons): the visitor sees the record and the trophy, and
    buying it says "Done: you paid … $400".

### 3.6 [Medium] Anyone can put fake scores on the shared Top 10
- **Where:** `api/leaderboard.js` POST.
- **Scenario:** the board accepts any card that adds up, from anyone, signed in or not, five a minute per address.
  Nine holes-in-one goes straight to the top. The file's own comments accept that a determined player can cheat;
  this is one request, not a determined effort.
- **Evidence:** `sec-api.js`: `a guest posts nine holes-in-one to the Top 10 -> 200, rank 1`.
- **Fix (S):** refuse scores nobody makes (for example more than two under par on a hole, or a round far below the
  best real one), and give the admin a way to remove an entry. Taking only signed-in players' scores would also tie
  each entry to a profile.
- **✅ Fixed 2026-11-19.**
  - **The checks:** `api/leaderboard.js` knows the test round's pars (5 3 4 4 3 5 4 3 4, 35). It refuses any other
    course, any hole better than two under par (so a hole-in-one only on a par 3), and a round better than one under
    par a hole (−9).
  - **Removing a round:** the admin can take one off the board. A ✕ shows on each world-board row for Keeto only, and
    the server checks the admin sign-in (`POST { action: 'remove', t, id }`; anyone else gets 403). Board entries now
    carry their short id for this.
  - Names on the board are escaped too.
  - **Verified with `sec-api.js`:**
    - nine holes-in-one gives 400 ("That score isn't possible"), and so does two under on every hole;
    - a great real round (30, −5) gives 200;
    - removal by a non-admin gives 403, and by the admin 200, after which the round is gone. This was tested with a
      throwaway admin credential that existed only in the local test server's memory.
  - **Verified with `sec-ui-paths.js`:** a real test round still reaches the board ("Your round: 1ST").
- **Still possible:** a believable fake (a 30 posted without playing). Only scoring holes on the server as they're
  played would stop that; it's the same problem as 3.4.

### 3.7 [Medium] Passwords can be 4 characters, and guessing is limited per address only
- **Where:** `api/profile.js` `signup` / `login`.
- **Scenario:** every profile name is public on the sign-in screen. A password needs only 4 characters. Guesses are
  limited to 10 a minute per address, with no limit per profile, so someone can work through the common short
  passwords for a friend's profile in minutes, or from several addresses at once.
- **Evidence:** `sec-api.js`: `a 4-character password ("aaaa") is accepted -> 200`; the per-address limit does work
  (`14 wrong passwords in a row -> 401 ×5 then 429`).
- **Fix (S):** a longer minimum (8), a limit per profile as well as per address (for example 10 wrong tries an hour,
  then a wait), and a way to change a password.
- **✅ Fixed 2026-11-20:** two of three, by the user's choice.
  - **Minimum length: not set (the user's decision, 2026-11-20).** A password's length is up to the player: anything
    from 1 to 128 characters. The 8-character minimum briefly added here was taken out. The per-profile limit below is
    what stops guessing.
  - **Per-profile limit:** 10 wrong passwords for one profile in an hour, from anywhere, and it can't be signed in to
    until the hour is up ("Too many wrong passwords for this profile — try again in N minutes"). The 10 a minute per
    address stays. The trade-off: someone can lock a friend out for an hour on purpose.
  - **Changing a password:** a "Change password" button in the clubhouse footer (profiles only; the admin's is set on
    the server), and the server's `password` action, which checks the current one against the same limit.
  - **Not done:** changing it doesn't sign out other sessions. The server keeps no list of a player's sessions; that
    is part of 3.9.

  `sec-limits.js`: 10 wrong passwords from 10 addresses, then the right one → 429, while another profile still signs
  in. The password change: wrong current 401, empty 400, right 200, then the old one 401 and the new one 200.
  The form was also checked in the game.

### 3.8 [Medium] The admin password's hash is public, so its length is the only protection
- **Where:** `api/_admins.js` (the salt and hash for `keeto`), in a public repo.
- **Scenario:** with the salt and hash, anyone can guess the password on their own computer as fast as they like;
  the server's limits don't apply. The hash is scrypt, which is slow to guess, so a long random password is out of
  reach. A short or common one can be found in hours or days. Whoever finds it can sign in as Keeto. There are no
  admin powers on the server, so what they'd get is that profile's career and the developer tools in their browser.
- **Evidence:** the file itself; its header comment already says the same. The git history holds only this one
  hash, and no plain password.
- **Fix (S):** this is your decision, and the file stays where you put it. If the password is under about 12
  characters, make a new, longer one with `node tools/admin-hash.js` and paste the new salt and hash in.
- **Prepared 2026-11-20; one step left that only the user can do.** The hash already in the repo's history can't be
  taken back, so the fix is a new password.
  - `node tools/admin-hash.js` now makes a strong random password (24 characters, about 138 bits), shown once in your
    own terminal and in no file, with its salt and hash to paste into `api/_admins.js`, or as a `GOLF_ADMIN_KEETO`
    environment variable. `--type` still lets you type your own.
  - Checked with a throwaway profile id: the printed hash matches the password, and the environment line is right.
  - Old admin sessions are signed out by the change already.

### 3.9 [Low] Smaller gaps
- **Flooding a player with challenges.** One profile can have 12 open challenges, but there is no limit on how many
  a target receives. `list` then fetches each challenge with its own database call, so a flooded player's Friends
  page slows down and can time out. Fix: one batched read, and a cap on pending challenges per target.
- **Sign-ins that never end.** Since fix 2.1 a sign-in lasts as long as it's used. There is no "sign out
  everywhere", no password change and no overall time limit, so a stolen token works for ever. Fix: an overall limit
  (say 180 days), and sign out the other sessions when a password changes.
- **No security headers.** There is no `vercel.json`, so no content security policy, and three.js is loaded from a
  public CDN with no integrity check. A policy would have limited what 3.1 could do.
- **Repo files on the live site.** Every file in the repo is served, including the plans, this findings file and the
  test tools. Fix: a `.vercelignore` for `*.md` and `tools/`.
- **Leaderboard when storage isn't set up** answers with the names (never the values) of storage settings it can see.
- **A request body that isn't an object** (a bare number, for example) makes a function wait until it times out.
- **✅ Fixed 2026-11-20:** all six.
  - **Flooding:** the challenge list reads all of a player's challenges in one batched call (`getChs`). A player
    can't be in more than 12 open or pending challenges from either side: the 13th challenger is told "X has 12
    challenges on already". `sec-limits.js`: 12 → 200, the 13th → 400.
  - **Sign-ins that never end:**
    - a session now also ends 180 days after it was made, however much it's used;
    - each profile keeps a list of its sessions, and changing the password signs out all the others (the page
      says how many);
    - a session from before this change gets its start time when it's next used, and joins the list then;
    - dead sessions are pruned from the list at sign-in.

    `session-slide.js`: 30 days again after use; a 181-day-old session ends and leaves the list; an old-format one
    is stamped and listed. `sec-limits.js`: a password change on one PC → the other 3 sessions get 401, this one
    still works.
  - **Security headers:** `vercel.json` sends a content security policy:
    - scripts only from the page and the one three.js file;
    - `connect-src 'self'`: the page can't send anything to another site;
    - no plugins, no `<base>`, no framing.

    Plus `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: same-origin` and a `Permissions-Policy`. Inline
    scripts and styles are still allowed (the game is one inline file with no build step, so a hash would change with
    every edit); the policy's main gain is that an injected script couldn't send data anywhere.

    **three.js** now loads through an import map with its SHA-384 hash (`integrity`), checked against two CDNs. A
    changed file is refused, and the game shows its "could not load" message (tested with a wrong hash). Browsers
    without import-map integrity ignore it and load as before.

    The dev server sends the same headers, and `probe.js` reports anything they block as "SECURITY …". Every in-game
    probe run since shows none, apart from the test's own deliberate request to another site.
  - **Repo files:** `.vercelignore` keeps `*.md` and `tools/` off the live site.
  - **The leaderboard** says only "storage is not configured", with no names of settings.
  - **A body that isn't an object** is read as an empty request (`readBody` always gives an object), and answered
    at once: a body of `5` → 401 in 15 ms.

### Checked and fine
- **Acting as someone else.** Every signed-in action takes the player from the session, never from the request. A
  career saved under another name is stored under your own. A third player can't accept, forfeit or see into
  someone else's challenge (`sec-api.js`: all 404). No token, or a made-up one, gets a 401.
- **Passwords** are hashed with scrypt and a per-user salt, compared in constant time, and never sent back.
- **Session tokens** are 32 random bytes; signing out deletes the token on the server.
- **Admin.** `keeto` is the only entry in `ADMINS`; the name is reserved in any capitals (`sign up as the admin's
  name -> 409`); the environment setting can change the admin's credential but can't add an admin; an admin session
  dies when the credential changes. A new profile is never an admin. The browser only believes "admin" from the
  server's reply in that visit. There are no admin-only server actions, so nothing is enforced in the browser alone.
- **Database commands** are sent as lists of values, so nothing a player types can change a command.
- **Other players' data elsewhere in the page:** names (profile names are limited to letters, digits, space, `-` and
  `_` by the server), challenge lines (made by the server), the leaderboard (checked on the way out), and a visited
  player's bag (every id is looked up in the game's own tables) are safe. The plaque pictures escape their text.
- **What the lists reveal:** `roster` and `players` return name, cash, circuit, handicap, rounds and trophies. No
  password data, no whole careers. This is as designed.
- **Error messages** are generic and don't show internals.
- **Secrets:** none in the files. The whole git history has one admin hash, no tokens and no plain passwords.
- **Cheating in your own career** (editing your own cash or clubs) is possible and accepted, as the plan says.

### Noticed for later
- **Section 4:** an "auto" handicap challenge throws on the server if either career's `rounds` is malformed (part
  of 3.2).
- **Section 9:** `api/leaderboard.js` has its own copies of `findCreds`, `redis` and `readBody`.

## Section 4 — Match and hustler logic (2026-11-19, Fable 5.2)

**Summary.** The rules of a match are right. Every case I tried through the game's own flow came out correctly:
dormie, an early finish and playing on, all square, presses by you and by him, the three-press limit, and skins with
carries. The hustler's shown shots always add up to his score. The findings are about how the hustlers score, and
about a few things the scorecard says. Seven findings: 3 medium, 4 low.

| # | Severity | Finding | Fix size |
|---|---|---|---|
| 4.1 | Medium | Hustlers score well above their listed skill, and more so on the harder circuits | S |
| 4.2 | Medium | "Best case" and "Worst case" on the scorecard are wrong when a bet can only be halved | ✅ Fixed |
| 4.3 | Medium | Impossible scores happen too often: holes-in-one, hole-outs, and nine-hole rounds of 8 or 9 under | ✅ Fixed (holes) |
| 4.4 | Low | A loss you couldn't pay is headed "all square" and isn't counted as a loss | ✅ Fixed |
| 4.5 | Low | The handicap tooltip says "best 4 of the last 3 rounds" | ✅ Fixed |
| 4.6 | Low | Finishing a hole while the hustler is mid-stroke crashes the hole | ✅ Fixed |
| 4.7 | Low | Small things: odd-looking shots on his bad holes, and how often he presses | S |

The probes are `tools/test/match-hustlers.js` (3,000 rounds per hustler, and 3,600 shot plans) and
`tools/test/match-rules.js` (the rule cases).

### 4.1 [Medium] Hustlers score well above their listed skill, and more so on the harder circuits
- **Where:** `npcHoleScore` (about line 13040); `NPCS` (about line 12826); `TIERS` (about line 8534).
- **Scenario:** the comment on `NPCS` says `skill` is "strokes over par per hole on average". But each hole also
  adds a conditions term: `wind mph / 40` plus `0.1` for every point of green speed over 11.5. That term is about
  +0.17 a hole at the muni, +0.36 at the resort and +0.58 at the country club. So every hustler averages worse than
  his number, and the gap grows with the circuit:

  | Hustler | Circuit | Pips | Listed skill | Measured, per hole | Average nine | 10% to 90% of rounds |
  |---|---|---|---|---|---|---|
  | Dale | 1 | 1 | +1.60 | +1.78 | +16.0 | +10 to +22 |
  | Terry | 1 | 2 | +1.20 | +1.37 | +12.4 | +7 to +18 |
  | Sal | 1 | 3 | +0.90 | +1.07 | +9.6 | +4 to +15 |
  | Gus | 1 | 4 | +0.60 | +0.77 | +6.9 | +2 to +12 |
  | Chad | 2 | 4 | +0.55 | +0.91 | +8.2 | +3 to +14 |
  | Marco | 2 | 4 | +0.50 | +0.87 | +7.8 | +1 to +14 |
  | Rita | 2 | 4 | +0.40 | +0.76 | +6.9 | +2 to +12 |
  | Jim | 2 | 5 | +0.30 | +0.66 | +5.9 | +1 to +11 |
  | Whitaker | 3 | 5 | +0.25 | +0.83 | +7.5 | +3 to +12 |
  | Ana | 3 | 5 | +0.10 | +0.67 | +6.1 | +1 to +11 |
  | Duke | 3 | 5 | 0.00 | +0.58 | +5.2 | 0 to +10 |
  | Victor | 3 | 5 | +0.15 | +0.71 | +6.4 | +1 to +12 |

  Two things follow:
  - **The top of the game isn't hard in absolute terms.** Duke, "eleven-time club champion", averages 5 over for
    nine holes at his own club. Whitaker (5 pips, country club) averages worse than Gus (4 pips, muni).
  - **Each round swings a lot.** The "form for the day" is drawn once per match and applied to every hole, worth
    about ±3 strokes over nine on its own. One hustler's rounds range over 10 to 12 strokes.

  You face the same wind and greens, so whether this is too easy depends on how much they cost *you*. That is for
  section 7 to weigh. But the numbers aren't what the code says it intends.
- **Evidence:** `match-hustlers.js`, part 1 (the table above is its output).
- **Fix (S):** a design choice. Either shrink the conditions term (for example wind / 100 and 0.04 per point of
  green speed, about a third of today's), or lower the country-club skills below zero so the best players average
  about par at home. Reducing the form swing (0.32 to about 0.15 a hole) would make a hustler's level more readable.
- **✅ Fixed 2026-11-20:**
  - **`skill` means what it says.** The conditions term is now measured against the circuit's own average
    (`condAvg`: 0.175 a hole at the muni, 0.361 at the resort, 0.586 at the country club). A windy hole still plays
    harder than a calm one, but over nine holes a hustler averages his skill. Invitational fields work the same way.
  - **The skills, set again:**
    - the muni: Dale 1.775, Terry 1.375, Sal 1.075, Gus 0.775. That's old + 0.175, so the muni plays exactly as before
      and the start of the game, tuned in 7.3, is unchanged;
    - the resort: Chad 0.7, Marco 0.65, Rita 0.55, Jim 0.45, about 0.2 a hole stronger than they played;
    - the country club: Whitaker 0.5, Ana 0.3, Victor 0.2, Duke 0.0, so its best average about par at home (Duke
      was +5 for nine).
  - **Pips:** the formula follows the new numbers (Dale 1, Terry 2, Sal 3, Gus 4, the resort 4–5, the country club
    5).
  - **Form for the day:** 0.32 → 0.2 a hole. "Looks sharp / rusty today" shows about as often as before (its line
    moved from 0.18 to 0.11).

  `match-hustlers.js` now reads the game's own hustlers. Each averages his listed skill: Dale +1.77, Gus +0.77, Jim
  +0.45, Whitaker +0.50, Duke −0.01 a hole, and the spread is narrower (Duke −4 to +4 for nine, 10% to 90%).

  `econ-sim.js`, the money ladder now:

  | Where | Breaks even at about | Example |
  |---|---|---|
  | The muni | μ +1.4 (a beginner) | Dale +$23 a match at μ +1.4 |
  | The resort | μ +0.4 | Chad +$81, Rita +$21 at μ +0.4 |
  | The country club | μ +0.1 | Whitaker +$431, Ana +$328, Victor +$210 at μ +0.1; Duke still −$993 there |

  - **Invitationals:** the fields are stronger at the top (the Hawthorne's median winner −2, the Classic's −4). At
    μ +0.1 the Hawthorne is worth about +$6,800 an entry and the Classic +$6,400; at μ +0.4 both lose money.
  - **Knock-on for 7.4:** the end-game money comes more slowly than before, so the trophy room is a longer goal. Worth
    a look once you've played the country club.

### 4.2 [Medium] "Best case" and "Worst case" on the scorecard are wrong when a bet can only be halved
- **Where:** `betsStrip` (about line 12975): `Best case = settled + every live stake`, `Worst case = settled − every
  live stake`. The press box's "up to $X either way" uses the same sum.
- **Scenario:** a bet that is "dormie" can't be won by the player who is behind. Two down with two to play, the
  best you can do is win both and halve the bet. The strip still shows the full stake as the best case. The same
  happens the other way: one up with one to play, the worst is a halved bet, but the strip shows a loss.
- **Evidence:** `match-rules.js`:
  ```
  2 down with 2 to play (the best possible is a halved match, $0): the card says "Best case +$20 win every live bet"
  1 up with 1 to play (the worst possible is a halved match, $0): the card says "Worst case −$20 lose every live bet"
  ```
- **Fix (S):** work each live bet out from its own position. With `diff` holes up and `left` to play: the best is a
  win if `diff + left > 0`, a halve if it's 0; the worst is a loss if `diff − left < 0`, a halve if it's 0. Change the
  sub-labels to "the best that can still happen" and "the worst".
- **✅ Fixed 2026-11-19.**
  - `betsStrip` works each live bet out from its own position:
    - the best is the stake only if `diff + left > 0`;
    - the worst is minus the stake only if `diff − left < 0`;
    - otherwise $0.
  - The sub-labels now read "the best (worst) that can still happen".
  - Verified with `match-rules.js`: 2 down with 2 to play gives `Best case $0`, and 1 up with 1 to play gives
    `Worst case $0`.
  - The press box's "up to $X either way" is still the plain sum of the live stakes, as a ceiling.

### 4.3 [Medium] Impossible scores happen too often
- **Where:** `npcHoleScore`: `par + clamp(Math.round(d), -2, 5)`.
- **Scenario:** the lowest score allowed on any hole is two under par. On a par 3 that is a hole-in-one, and on a
  par 4 it's holing out from the fairway. For a hustler with a wide spread these come up constantly:

  | Hustler | Holes-in-one per 1,000 par 3s | Hole-outs for 2 per 1,000 par 4s |
  |---|---|---|
  | Marco | 30 | 33 |
  | Chad | 9 | 11 |
  | Gus | 8 | 7 |
  | Sal | 7 | 6 |
  | Victor | 4 | 5 |

  Marco makes a hole-in-one on about one par 3 in 33, so roughly one match in eleven. A real golfer's odds are about
  one in several thousand. The round totals have the same problem at the edge: the best of 3,000 rounds was 9 under
  par for nine holes (Victor), with several hustlers at 8 under.
- **Evidence:** `match-hustlers.js`, part 1 (the last two columns, and the "best" column).
- **Fix (S):** floor the hole score at one under par on par 3s and par 4s (two under only on a par 5), and let a
  hole-in-one happen only as its own rare roll. The smaller form swing suggested in 4.1 trims the freak rounds.
- **✅ Fixed 2026-11-19 (the hole scores).**
  - A new `npcClampScore`, used by both `npcHoleScore` and the invitational field's `fieldHoleScore`, sets the best
    score on a hole at one under par on a par 3 or 4 and two under on a par 5. A hole-in-one is its own roll,
    1 in 1,500 par 3s.
  - Verified with `match-hustlers.js`: holes-in-one are down to 0.1–1.1 per 1,000 par 3s for every hustler (Marco
    was 30), and hole-outs for 2 on a par 4 to 0. The averages barely moved (for example Gus +0.77 → +0.79 a hole).
  - **Not changed:** the best rounds are still 7 or 8 under for nine. That comes from the form-for-the-day swing,
    which is part of the 4.1 design decision.
  - Matches already in progress roll their remaining holes with the new rule.

### 4.4 [Low] A loss you couldn't pay is headed "all square" and isn't counted as a loss
- **Where:** `showScorecard` (about line 13840): `m.net ? won/lost : 'all square'`; `renderCardHistory`'s summary.
- **Scenario:** lose a match with no cash. The loan-shark rule sets what you paid (`net`) to $0, and the card's
  heading reads "all square". In the trophy room's Scorecards tab that match shows "$0" and is counted as neither won
  nor lost.
- **Evidence:** `match-rules.js`: `lose with $0 …: the card's heading says "all square"; the archived card's money
  is 0, unpaid 20`; the tab's summary then reads `4–1 won–lost` with that loss left out.
- **Fix (S):** where the result is shown, treat `unpaid > 0` as a loss ("lost: couldn't pay $20").
- **✅ Fixed 2026-11-19.**
  - The scorecard's heading for a settled match comes from one `settledTag()`: "lost $20 · couldn't pay $20".
  - The Scorecards tab counts it as a loss, and its money column says "$0 · couldn't pay $20" in red.
  - Verified with `match-rules.js`: the heading is `lost $20 · couldn't pay $20`, and the tab's summary went from
    `4–1` to `4–2`.

### 4.5 [Low] The handicap tooltip says "best 4 of the last 3 rounds"
- **Where:** `updateCareerUI` (about line 10682).
- **Scenario:** with three rounds the handicap is the average of all three, but the tooltip's wording is fixed at
  "best 4".
- **Evidence:** `regress-handicap.js`, last line: `tooltip: From your best 4 of the last 3 rounds`.
- **Fix (S):** say "best N" with N the smaller of 4 and the rounds counted.
- **✅ Fixed 2026-11-19.** Verified with `regress-handicap.js`: `From your best 3 of the last 3 rounds`.

### 4.6 [Low] Finishing a hole while the hustler is mid-stroke crashes the hole
- **Where:** `finishHole` (about line 10233) and `npcTakeTurns` (about line 13590). When he is busy, `npcTakeTurns`
  calls its callback straight away; the callback is `finishHole`, which calls `npcTakeTurns` again, and so on.
- **Scenario:** it needs your ball to go in while his is moving. In normal play you can't swing during his turn.
  The one gap: when he has the honour, he waits 0.9 seconds before teeing off, and you can start your own swing in
  that time. If that tee shot is a hole-in-one, the hole never finishes. That is very unlikely, but the loop is real.
- **Evidence:** `match-rules.js`: `finish the hole while he is mid-stroke (busy true) -> Maximum call stack size
  exceeded`.
- **Fix (S):** when he is busy, keep the callback and run it when his stroke ends. Also block your swing during the
  0.9 seconds before he tees off.
- **✅ Fixed 2026-11-19.**
  - `npcTakeTurns` no longer calls its callback while he is mid-stroke. It keeps it (`npc.wait`) and runs it once his
    strokes are done.
  - The 0.9 seconds before his tee shot set `npc.starting`, which holds your swing (clicks and keys hurry him
    instead).
  - Verified with `match-rules.js`:
    - finishing mid-stroke gives `no error; he played out (true) and the hole was recorded (true)`;
    - your swing is held at the start of a hole where he has the honour.

### 4.7 [Low] Small things
- **His shots on bad holes.** The shot plans always add up, but on a blow-up hole they can look odd. Of 3,600 plans:
  72 (2%) had a short shot that finished farther from the pin, 31 had three or more short shots in a row that missed
  the green, and 29 (0.8%) had four or more putts. He also never goes out of bounds or takes a drop; the lost strokes
  appear as extra chips and putts.
- **How often he presses.** A hustler's press chance (for example Sal 0.6, Jim 0.3) is rolled again after every hole
  while he is 2 down. That turns "sometimes" into "usually": if he stays 2 down for three holes, Sal presses about 94%
  of the time and Jim about 66% (worked out from the chances, not measured). If "0.3" was meant as "presses in about
  a third of matches", roll once per match.
- **The shot counter** reads "in the air…" for about a second after his ball has stopped.
- **✅ Fixed 2026-11-20:** all three.
  - **His shots on bad holes (`npcPlan`):**
    - every shot before the green goes forward and gets closer, the extra strokes shared out along the way (it used
      to be clamped backwards when there were too many);
    - a shot before the green never stops on the green or its fringe;
    - on a blow-up hole (two or more strokes to spare), half the time his tee shot goes **out of bounds**: the ball
      flies out, a penalty stroke ("+1 penalty, he re-tees, playing 3"), and he plays again from the tee, as you would.

    `match-hustlers.js`, 3,600 plans:

    | Check | Before | After |
    |---|---|---|
    | Four or more putts | 22 | 0 |
    | A shot that stops on the green, then a chip from it | (not checked) 90 | 0 |
    | A short shot that ends farther from the pin | 67 | 15 (0.4%) |
    | Three short shots in a row that miss the green | 38 | 21 (real hacker golf) |

    An out-of-bounds hole was watched in the game: OB, the penalty, a re-tee, and he holed out on his 9th as planned.
  - **Presses:** `press` is now the share of matches he presses in, rolled once a match (`npcPresses`). Measured:
    Sal 59% (0.6), Jim 30% (0.3), Gus 100%, Terry 0%. A presser still presses each time he's 2 down in his newest
    bet, up to the limit of three.
  - **The counter:** once his ball has stopped it shows where it lies, during the moment it's held there too, and
    "re-teeing (out of bounds)" for the penalty stroke.

### Checked and fine
- **Match status** (`match-rules.js`, all "ok"):
  - 2 down with 2 to play stays live, and winning both halves the match ("halved the match: nobody pays", net 0);
  - 1 up with 1 to play, then winning, is "won 2 up";
  - five up after five is "won 5 & 4", and playing on changes nothing.
- **Presses.** Offered after holes 2, 4 and 6 when losing every hole (2 down in the newest bet each time); three at
  most; the match runs until every bet is decided ("lost 5 & 4 · Press 1: lost 4 & 3 · Press 2: lost 3 & 2 · Press 3:
  lost 2 & 1", net −4 stakes). A press can't start on the last hole, because a bet 2 down with one to play is over.
- **His press.** Gus presses when 2 down, from the next hole; the box then is a notice, not an offer; his presses
  count toward the same limit of three.
- **Skins.** Carries add up (four skins on the hole after three halves); a tie on the last hole voids what was
  carried; the net is right.
- **Money.** Covered in section 1 (24 random matches, 0 mismatches).
- **The hustler's shown play.** In 3,600 plans across all nine holes, the strokes shown always equal his score, the
  last one always goes in, and none lands out of bounds. His ball stops on the green 59% of the time, the fairway
  23%, the rough 15% and sand 3%.
- **Turn order.** The tee toss on the first hole, then whoever won the last hole that wasn't halved; after the tee,
  whoever is farther from the pin; he plays out after you hole.
- **Rating pips** follow the listed skill in order (Dale 1 up to the country club's 5).
- **Invitationals** (code reading): the field uses the same scoring function with its own seed per player; ties on
  total go to the better last three holes, then the last hole, and a dead heat goes to you; a withdrawal is recorded
  once and never shows as a best finish.
- **Handicap:** a round counts once, only with all nine holes, including a match decided early and played on; a
  forfeited match doesn't count (`regress-handicap.js`).

### Noticed for later
- **Section 5:** in the first 0.9 seconds of a hole where he has the honour, you can start your swing before he tees
  off (see 4.6).
- **Section 7:** the table in 4.1 is the hustlers' real scoring, for judging stakes and progression. His presses can
  multiply what you stand to lose (noted in section 1).

## Section 5 — Screens, overlays and keys (2026-11-19, Opus 5.5)

**Summary.** The overlays are well ordered. Each one takes the keys ahead of the game (home, the beating, the payoff
screen, the initials, the course preview, the clubhouse, the drop card, tips, the tee toss, the hustler's turn), and
every end-of-match path came out right. Four findings: 2 medium, 2 low. Probes: `tools/test/ui-overlays.js`, and
`tools/test/ui-shots.js` for screenshots (the probe now takes `PROBE_SIZE=1280x720` and similar).

| # | Severity | Finding | Fix size |
|---|---|---|---|
| 5.1 | Medium | The payoff screen is skipped if a match ends on the 9th hole and you press N or Enter at once | S |
| 5.2 | Medium | On most laptop screens the scorecard scrolls: the bets, the press offer and the buttons are below the fold | S–M |
| 5.3 | Low | The game tells you "The test round plays 1 to 6 in order"; it's 9 holes | S |
| 5.4 | Low | Arrow keys on a focused developer slider are swallowed by the game | S |

### 5.1 [Medium] The payoff screen is skipped if a match ends on the 9th hole and you press N or Enter at once
- **Where:** `maybeShowOutcome` (about line 13250) waits 0.45 seconds before `showOutcome`, which then does nothing if
  the round is already over (`if (!round.on) return`). It has already marked the screen as seen.
- **Scenario:** the last hole's scorecard says "Back to the clubhouse (N)". A player who presses N (or clicks) within
  0.45 seconds goes straight to the clubhouse, and the payoff screen never appears for that match. A match decided
  early is fine, because N there plays on and the round is still on.
- **Evidence:** `ui-overlays.js`:
  ```
  won on the 9th, then N at once: … payoff false · clubhouse true · round false · "won 1 up" · payoff marked seen true
  win, then N at once (decided early): … payoff true · round true
  ```
- **Fix (S):** open the payoff screen straight away when there is no beating to wait for. Or, while a payoff is due,
  have the scorecard's N / Enter / Close open it first.
- **✅ Fixed 2026-11-19:** while the payoff screen is due, the scorecard's N / Enter / Close opens it at once
  (`outcomeDue`); while the beating is about to open, they wait for it. `ui-overlays.js` and `fix-econ.js` (a loss on
  the 9th with $0, then N at once) both show the payoff screen now.

### 5.2 [Medium] On most laptop screens the scorecard scrolls: the bets, the press offer and the buttons are below the fold
- **Where:** the scorecard panel (`#scorecard`) during a match. It is 995 pixels tall with two presses on the card.
- **Scenario:** the scorecard fits without scrolling only on screens about 1,000 pixels tall or more. The press offer
  you asked to make loud sits under the table, out of sight until you scroll the card. The message at the top does
  say "you may press (P), how it works is below the card", which helps.

  | Window | Scorecard | Fits? |
  |---|---|---|
  | 1920 × 1080 | 997 px | yes |
  | 1600 × 900 | 860 px, content 995 | scrolls |
  | 1366 × 768 (the most common laptop) | 728 px, content 995 | scrolls |
  | 1280 × 720 | 680 px, content 995 | scrolls |

  The payoff screen, the shop, the bag room and the trophy room all fit at 1024 × 640 (their lists scroll inside, as
  intended).
- **Evidence:** `ui-shots.js` at each size; screenshots in `tools/test/out/ui5-*.png`.
- **Fix (S–M):** when the press offer is up, put it above the table (or scroll it into view when the card opens).
  Making the card's rows shorter on short screens (a `max-height` media query) would bring the buttons up too.
- **✅ Fixed 2026-11-19:** all three.
  - The press offer (and the hustler's press notice) now sits right under the message, above the table.
  - The buttons (Next / Close) stay pinned to the bottom of the card while the rest scrolls.
  - Under 920 px tall, the card is tighter.
  - A new card opens scrolled to the top.

  `ui-card-fit.js` (2 down, with a press already on): the press offer and the buttons are on screen at 1280 × 720,
  1366 × 768, 1600 × 900 and 1920 × 1080. On the smaller sizes the bottom rows of the table and the bets are a
  scroll away.

### 5.3 [Low] The game tells you "The test round plays 1 to 6 in order"
- **Where:** the N key handler (about line 14709), and the comment at about line 10252 ("holes 1-6").
- **Scenario:** press N before finishing a hole in a test round and the toast says the round plays 1 to 6. It has 9
  holes.
- **Fix (S):** say "in order" without the numbers, or use `HOLES.length`.
- **✅ Fixed 2026-11-19:** "The round plays all 9 holes in order" (from `HOLES.length`); the comment is fixed too.

### 5.4 [Low] Arrow keys on a focused developer slider are swallowed
- **Where:** the window keydown handler skips only `<select>` elements, so the arrow keys on a focused range slider
  (wind, green speed, power, etc.) are taken by the game and `preventDefault` stops the slider moving. Admin-only.
- **Fix (S):** skip `input` elements as well.
- **✅ Fixed 2026-11-20:** a focused slider or number box keeps its own arrow, Home, End and Page keys. Every other key
  still drives the game, so clicking a slider doesn't cut you off from the hotkeys. Checked in the game:
  - ArrowRight on a focused slider isn't cancelled (it moves the slider) and the aim doesn't change;
  - the same key on the page still aims;
  - `]` with the slider focused still changes club.

### Checked and fine
- **End of a match, by keys:** win, wait: the scorecard, then the payoff screen, then Enter goes to the clubhouse. A
  match decided early, then N: the payoff screen shows, and play goes on. Lose with $0: the beating (Enter does
  nothing until its button is ready), then the payoff screen, then the clubhouse. On the payoff screen, K shows the
  scorecard; "Back to the clubhouse" leaves.
- **During a match hole:** Esc doesn't open the home screen (it says to finish or leave the round first); J doesn't
  open the clubhouse; H asks, then forfeits and leaves.
- **Typing:** the name and password boxes, the challenge form and the home screen take their own keys first.
- **The hustler's turn:** all keys except K, I and L only hurry him up; since 4.6 the same holds in the moment before
  his tee shot.

## Section 6 — Shot mechanics and tuning (2026-11-19, Opus 5.5)

**Summary.** The physics is robust. 20,000 random flights all ended, with no NaN, nothing under the ground and
nothing impossibly far. Extreme putts all finish. The tilt ladder behaves as designed. Two low findings. Probes:
`tools/test/phys-fuzz.js` and `tools/test/phys-drops.js`.

| # | Severity | Finding | Fix size |
|---|---|---|---|
| 6.1 | Low | An unplayable drop takes the ball out of a greenside bunker for one stroke, sometimes onto the green | S |
| 6.2 | Low | Tilt is forgotten when the game is reopened mid-round | S |

### 6.1 [Low] An unplayable drop takes the ball out of a greenside bunker for one stroke
- **Where:** `dropOptions` (about line 9764). The lateral drop and "back on the line" pick the best lie they can find
  (`dropScore` ranks fairway 6, green 5, light rough 4, bunker 2).
- **Scenario:** in a greenside bunker, U gives a one-stroke drop onto the fairway, the rough, or even the green. Under
  the real rules, relief from a bunker stays in the bunker unless you pay two strokes. Here a hard bunker shot can
  always be swapped for a penalty stroke and an easy chip or a putt.
- **Evidence:** `phys-drops.js`, 54 bunker spots near the pins of all nine holes:
  ```
  lateral → Fairway (33), Greenside bunker (12), Light rough (4), On the green (5)
  ```
  So the ball leaves the sand 78% of the time, onto the green in 5 of 54.
- **Fix (S):** from a bunker, keep the lateral and back-on-the-line drops inside the bunker. Optionally add a fourth
  option, "out of the bunker, back on the line, +2".
- **✅ Fixed 2026-11-19:** both. In a bunker (greenside or fairway), the lateral and back-on-the-line drops stay in
  that bunker, and a fourth option, "Out of the bunker" (key 4), drops back on the line outside it for two strokes.
  `phys-drops.js`: all 54 spots now keep the ball in the sand for one stroke; out for two goes to heavy rough (37),
  light rough (10) or the fairway (7); key 4 adds two strokes.

### 6.2 [Low] Tilt is forgotten when the game is reopened mid-round
- **Where:** `state.badStreak` isn't saved with the match; `enterHole` sets it to 0.
- **Scenario:** three bad shots in a row, reload, and you're calm again on a fresh tee. This is the same gap as 1.4
  (the hole in progress isn't saved), and fixing that should save the tilt too.
- **✅ Fixed 2026-11-19:** a match, an invitational or a friend round saves your tilt at the end of each hole
  (`m.tilt`). Resuming after a reload tees you up with it, less what a calm caddie walks off, the same as walking to
  the next tee (`resumeRoundTilt`). The hole in progress still restarts from the tee (1.4), at the tilt you had on
  that tee. `tilt-reload-a.js` / `-b.js`: tilt 3 before the reload, 3 after.

### Checked and fine
- **Every flight ends:** air has a 30-second cap; the roll always slows down on every surface (the slowest roll is
  still 0.64 m/s² of braking); chips and putts have a 45-second cap. The longest of 20,000 random flights took 27 s of
  ball time.
- **No NaN or Infinity.** Every division by a speed is guarded (`s > 1e-4`).
- **Nothing ends under the ground.** A landing resets the height to the ground.
- **Distances:** the farthest of 20,000 random flights (any launch from 1.5° up, any spin, wind to 25 m/s) went
  365 m. The game never launches below 1.5°, and a topped shot leaves at a third of the speed, so no real shot can run
  away.
- **Trees:** a ball can hit each tree once, keeps 12–37% of its pace, and drops.
- **Putts** from a 2 ft tap to a full 3.5× stroke, straight and pulled, all finish (in 1.4–8.4 s).
- **Tilt:** rough, sand or OB adds a level; fairway, fringe, green or tee clears it; hardpan leaves it. It carries
  between holes of a round (a calm caddie walks some off) and is reset when a hole or round starts, so range practice
  never follows you into a match. The ladder:

  | Composure | 1 bad shot | 2 | 3 | 4 | 6 | 8 |
  |---|---|---|---|---|---|---|
  | 1 | 0.10 | 0.55 | 1.35 | 2.30 | 4.30 | 6.30 |
  | 5 | 0.06 | 0.34 | 0.84 | 1.43 | 2.68 | 3.92 |
  | 10 | 0.02 | 0.08 | 0.20 | 0.35 | 0.65 | 0.95 |

- **Drops never land out of bounds** (OB scores −990), and the lateral drop is never nearer the hole.

## Section 7 — Economy balance (2026-11-19, Opus 5.5)

**Summary.** These are suggestions, not bugs. They come from simulating matches and invitationals against the
hustlers' real scoring (`tools/test/econ-sim.js`). The player is modelled as μ strokes over par per hole on that
circuit, ±0.9, with a small form for the day. The headline: once you're decent, **invitationals pay many times what
matches pay**. And when you're broke, **betting on credit is close to free**.

What a match is worth at the hustler's top stake, after the green fee (win chance · value):

| Hustler | Top stake | μ +1.4 (beginner) | μ +1.0 | μ +0.7 | μ +0.4 | μ +0.1 |
|---|---|---|---|---|---|---|
| Dale | $40 | 64% · +$6 | 84% · +$19 | 92% · +$25 | 97% · +$28 | 99% · +$29 |
| Terry | $80 | 41% · −$15 | 65% · +$23 | 82% · +$47 | 91% · +$59 | 98% · +$67 |
| Sal | $150 | 25% · −$68 | 44% · −$6 | 64% · +$49 | 81% · +$93 | 90% · +$116 |
| Gus | $250 | 12% · −$179 | 28% · −$95 | 49% · +$14 | 67% · +$98 | 81% · +$165 |
| Chad | $400 | 18% · −$281 | 38% · −$109 | 54% · +$25 | 73% · +$158 | 86% · +$256 |
| Rita | $500 | 11% · −$415 | 28% · −$227 | 46% · −$43 | 65% · +$144 | 81% · +$285 |
| Jim | $800 | 8% · −$701 | 21% · −$436 | 39% · −$128 | 60% · +$191 | 77% · +$430 |
| Whitaker | $1,500 | 13% · −$1,291 | 32% · −$687 | 53% · −$37 | 70% · +$451 | 84% · +$819 |
| Duke | $3,000 | 6% · −$2,860 | 17% · −$1,999 | 35% · −$858 | 55% · +$335 | 74% · +$1,413 |
| Victor | $5,000 | 10% · −$4,012 | 26% · −$2,180 | 44% · −$327 | 63% · +$1,543 | 83% · +$3,295 |

What an invitational entry is worth (the field's median winning score in brackets):

| Event | Entry | μ +1.0 | μ +0.7 | μ +0.4 | μ +0.1 |
|---|---|---|---|---|---|
| Muni Open (−2) | $250 | −$225 | −$162 | +$11 | +$325 |
| Palm Crest Pro-Am (0) | $1,500 | −$1,188 | −$371 | +$1,279 | +$3,109 |
| Hawthorne Invitational (+1) | $7,500 | −$4,570 | **+$1,835** | **+$11,815** | **+$24,025** |
| Hustlers' Classic (0) | $25,000 | −$19,675 | −$8,230 | +$17,135 | +$52,490 |

| # | Severity | Finding | Fix size |
|---|---|---|---|
| 7.1 | High (design) | Betting on credit when broke costs almost nothing: a loss is wiped for one snapped club and 10 reputation | S–M |
| 7.2 | High (design) | The Hawthorne Invitational pays about 8× the best match, and can be entered without limit | S |
| 7.3 | Medium (design) | The start is a long grind: a beginner earns about $6 a match | S |
| 7.4 | Low | The end-game money sinks are sized well for invitational money, not for match money | — |

### 7.1 [High, design] Betting on credit when broke costs almost nothing
- **Where:** `settleMatch`'s loan-shark rule (about line 13126); `creditLine` (100 + 2 × reputation).
- **Scenario:** with $0 you can still stake up to your credit line. Lose, and the debt is wiped: one club is snapped
  (a $25–$350 repair) and you lose 10 reputation. Win, and you take the whole stake. For example, broke with 50
  reputation ($200 of credit) against Gus at a 49% win chance:
  - on credit: 0.49 × $200 − 0.51 × (about $100 repair) ≈ **+$47 a match**;
  - with $250 of your own: **+$14 a match**.

  Being broke is better than having money. The hustler's presses add more on top of credit too (noted in section 1).
- **Fix (S–M):** make the debt real. Keep what you couldn't pay as a debt the loan shark takes from your next winnings
  (with interest), and/or scale the cost with the debt (one club per $100 unpaid, reputation in proportion). The
  beating screen already tells the story; it just needs teeth.
- **✅ Fixed 2026-11-19 (the marker):** what you couldn't pay goes on your marker (`career.debt`). It comes out of your
  cash when the next match or invitational is settled (as much as you have), and it uses up your credit while you owe
  it (`creditLeft`: the credit line minus the marker, never below $25, so a broke player can always play for the
  minimum and work it off). The beating and the snapped club stay. So a loss on credit now costs the full stake plus a
  repair and 10 reputation: betting on credit is worse than betting your own money, not better. No interest (the
  beating is the interest). Shown on the beating, the payoff screen ("Off your marker"), the scorecard, the match
  picker and the clubhouse cash ("$0 owe $40"). Scaling the snapped clubs with the debt was left out: a broke player
  with every club snapped can't play or pay for repairs. `fix-econ.js`.

### 7.2 [High, design] The Hawthorne Invitational pays about 8× the best match, and can be entered without limit
- **Where:** `TOURS` (about line 13283).
- **Scenario:** the invitational field is all twelve hustlers on the event's course. At the country club its median
  winning score is +1, but the purse is $50,000 for an entry of $7,500. A player at μ +0.4 gets **+$11,815 an entry**,
  against **+$1,543** for the best match (Victor at $5,000). At μ +0.7, every country-club match loses money while the
  Hawthorne still pays +$1,835. Each event is one nine-hole round, the same as a match, and can be re-entered straight
  away. Once a player can enter it, matches stop mattering, and the end-game sinks (7.4) come quickly.
- **Fix (S):** pick one or two:
  - limit entries (one per event per "season", or once every N matches);
  - make the field stronger (`form` −0.2 to −0.4, as the Classic has);
  - bring the purses into line with the field (Hawthorne $20,000 / $8,000 / $4,000);
  - raise the entry each time you win it.
- **✅ Fixed 2026-11-19:** two of these.
  - Each event is held once every 5 hustler matches (`TOUR_GAP`): after an entry (or a withdrawal), the board says
    "Next one in N matches" until five matches have been played to the end. A forfeit doesn't count.
  - The Hawthorne purse is $30,000 / $12,000 / $6,000 (it was $50,000 / $20,000 / $10,000). By the section 7 numbers
    (purse × 0.6), an entry is worth about +$4,100 at μ +0.4 (it was +$11,800) and loses about $1,900 at μ +0.7. That's
    a big event worth about three good matches, played once every five.
  - The other events are unchanged: the Classic is the end-game money for the trophy room, and the cooldown keeps it
    and the Pro-Am in proportion.

### 7.3 [Medium, design] The start is a long grind
- **Where:** the starting cash ($150), Dale's and Terry's top stakes ($40, $80), the tier 1 green fee ($10).
- **Scenario:** a beginner (μ +1.4) makes about **$6 a match** against Dale and loses money against everyone else.
  The first real upgrades cost $580 (game-improvement irons) and about $600 (a driver), and a first lesson $240: that
  is around 40 matches for the lesson and 100 for irons and a driver. Even at μ +1.0 (Terry, +$23) it's about 25
  matches for the irons. Player skill grows with practice, so the real number is lower, but the first hours are slow.
- **Fix (S):** raise the bottom stakes (Dale $80, Terry $150), take the green fee off at the muni, or make the first
  lessons cheaper (for example $60 × level, not level², up to level 4).
- **✅ Fixed 2026-11-19:** two of these.
  - The muni's top stakes are raised: Dale $40 → $80, Terry $80 → $150, Sal $150 → $200 (Gus stays $250).
  - The first two lessons in each stat cost less: 2→3 is $80 (was $240), 3→4 is $360 (was $540). From 4→5 ($960) on,
    the price is unchanged, so the cost of maxing a stat drops only by $340.
  - The green fee stays.

  `econ-sim.js` now: a beginner (μ +1.4) makes **+$24 a match** against Dale (was +$6); at μ +1.0, +$48 against
  Dale and +$57 against Terry. The first lesson is about 4 matches (was 40), and game-improvement irons about 25 (was
  about 100). Sal still beats a beginner (−$97 at $200), so stepping up is still a choice.

### 7.4 [Low] The end-game money sinks are sized for invitational money
- **The sinks:**
  - every stat to 10: $17,040 a stat, $68,160 in all;
  - the six shots: $1,850;
  - the best caddies: $40,000 plus $400 a match;
  - the trophy room: ten pieces, $444,000 in all;
  - luxury clubs: up to $250,000 for irons and $120,000 for a driver.
- **At match money** (the best country-club match at μ +0.4 is about +$1,500), the trophy room alone is about 300
  matches.
- **At Hawthorne money** (about +$12,000 an entry), it's about 40 events. Fixing 7.2 brings these back into reach only
  slowly. Worth deciding which pace you want before changing either.
- **Related:** Composure 10 removes 85% of tilt, and the top caddies erase it between holes, so late in a career tilt
  barely matters (see the ladder in section 6). That may be intended.
- **✅ Rebalanced 2026-11-20.** Since 7.2 and 4.1, the top of the game pays less.
  - **Income now:** a player about 0.1 over par a hole makes roughly $3,000 a match at the country club, invitationals
    included (the best matches $200–$430, the Hawthorne and the Classic about $6,500 each, once every 5 matches).
  - **What changed:** the pure money sinks are halved: the trophy room's ten pieces ($444,000 → $222,000) and the
    luxury irons, drivers, wedges and putters (e.g. the Atelier irons $250,000 → $125,000, the Crown Jewel driver
    $120,000 → $60,000). Each takes about 70 matches at that level, not 150. Neither changes how anything plays.
  - **Unchanged, as core progression:** lessons (every stat to 10 is still $68,160, about 23 matches at the top) and
    caddies. A top caddie's $400 loop is about what a country-club match makes, which the caddie's bonuses roughly pay
    back. Worth watching when you play.
  - `CAMPAIGN_PLAN.md`'s price tables are updated.

## Section 8 — Performance (2026-11-19, Opus 5.5)

**Summary.** Nothing leaks. Probe: `tools/test/perf-leaks.js`. One low finding.

### 8.1 [Low] Every save writes and sends the whole career
- **Where:** `careerSave` / `saveSyncMeta` write the career and its last-synced copy to this PC's storage on every
  change (several times a hole). `syncNow` sends the whole career.
- **Scenario:** at 500 matches the career is about 137,000 characters, so a hole writes about 275,000 to storage
  several times and uploads 137,000. That's fine on a desktop, but it's wasted work, and it is what eventually hits
  the 64 KB and 250,000 limits (2.5, 2.6).
- **Fix (S):** debounce the storage write like the sync (a few hundred ms), and trim history (2.6). Sending only what
  changed is a bigger change and not needed yet.
- **✅ Fixed 2026-11-19 (the storage write):** `careerSave` now writes the career once, 0.4 s after the last change,
  instead of on every call.
  - Reading that key (`lsGet`, so `careerLoad` and `readCareer`) flushes a pending write first.
  - Writing or clearing the key (`saveSyncMeta` after a sync, a deleted career) replaces it.
  - Hiding or closing the page flushes it.
  - A save for another profile flushes the old one first.

  `perf-saves.js`, a 9-hole match with 200 matches of history: **11 writes, 278k characters** (it was 24 writes,
  608k). In real play the gaps are longer, so more of a hole's saves fall into one write. The upload was already
  debounced (1.2 s) and is unchanged; trimming the history is still 2.6. The reload, lost-save and sync probes give
  the same results as before.

### Checked and fine
- **The course:** over 36 holes built back to back, about 821 geometries were made and `dispose()` ran 858 times, so
  everything built is freed. The scene's size is the same before and after (131–133 objects, 100–102 geometries, 20
  textures). `clearHoleGroup` frees only top-level objects, but the hole's objects are all top-level; nothing nested is
  left behind.
- **The clubhouse:** 120 room visits. The DOM grows once, to 2,474 elements as every room is drawn the first time, and
  stays there at 10, 20, 30 and 40 rounds of visits. No listeners pile up: the dynamic buttons use `onclick` or
  delegated listeners set once.
- **The JS heap** stays at 10–20 MB.
- **Frame rate** is at the cap (144 fps in headless Chrome, both on a hole and in the clubhouse).

## Section 9 — Dead code and cleanup (2026-11-19, Opus 5.5)

**Summary.** Very little dead code for a file this size. Probe: `tools/test/dead-code.js` (it lists candidates; each
one below was checked by hand). All three findings are low.

### 9.1 [Low] Unused code
- **Functions and constants:** `makeGreen` (about line 7653), `runFlight` (7417), `runPutt` (7752), and
  `composureState` (7049). Each has one hit, its definition. `runChip` is used; keep it.
- **A computed value never read:** `pathIntent` in `computeImpact` (about line 7167).
- **CSS:** `.num`, `.tr-wall`, `.tr-plq` (and their nested rules) match nothing in the page or the script.
- **Element ids nothing uses:** `hmNewForm`, `chRoom`, `chCaddieBtn`, `chTrophyBtn`, `chBagBtn`. They're harmless;
  remove them only if tidying.
- **Keep:** `isOB` and `debugSwing` are only used by the test hook (`window.__golf`), and the probes need them.
- **Fix (S):** delete them. A search for each name has no other hit.
- **✅ Fixed 2026-11-19:** all of them deleted. `dead-code.js` now lists only the known false positives (names used
  through spreads or the test hook, ids used by labels, rank classes built as `r${n}`).

### 9.2 [Low] Duplicated helpers
- **Storage helpers:** `api/leaderboard.js` has its own `findCreds`, `redis` and `readBody`, copies of the ones in
  `api/_redis.js`. It already imports `sessionId` from there. Fix (S): use the shared ones.
  **✅ Fixed 2026-11-19:** `leaderboard.js` uses `findCreds`, `redis`, `readBody` (4 KB limit), `clientIp` and
  `rateLimit` from `_redis.js`. `sec-api.js`'s leaderboard checks give the same results.
- **The handicap:** `handicapOf` exists in `index.html` and in `api/_career.js`. That's needed (the browser and the
  server both use it), and both carry a "keep alike" comment. The server's copy now also ignores malformed rounds.

### 9.3 [Low] Stale text and comments
- The player-facing "The test round plays 1 to 6 in order" (see 5.3). The comment above the test round says "holes
  1-6".
- `clubhouseGo`'s last line ("… coming in the next chunks of the campaign") can't be reached: every room is built.
- **`CAMPAIGN_PLAN.md`:**
  - "Later chunks" lists **11 · NPCs on the course** as not yet planned; it's built (the hustler plays his shots on
    the course).
  - The economy table gives iron sets as "$180–$1,500"; the catalogue is $0–$1,600, plus luxury sets to $250,000.
- **Fix (S):** update the text; delete the unreachable line.
- **✅ Fixed 2026-11-19:** all four. `CAMPAIGN_PLAN.md` also now records the marker (7.1) and the invitational changes
  (7.2).
