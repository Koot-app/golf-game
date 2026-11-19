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
