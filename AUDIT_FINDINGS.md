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
