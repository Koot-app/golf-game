# Code audit — plan

Written 2026-11-19 for a step-by-step audit of Back Nine Hustle, one section per session. Each section below is a
self-contained brief: a reader with none of the earlier conversations can run it.

## Model and effort for each section

At the start of each new session, set the model with `/model` and pick the effort level. **Sections 1–4 use Fable 5.2,
everything after them uses Opus 5.5.**

| # | Section | Model | Effort | Why this model |
|---|---|---|---|---|
| 1 | Money and settlement | **Fable 5.2** | high | Bugs here cost players real progress; the logic spans settlement, the loan shark, sync and the server |
| 2 | Saves and sync | **Fable 5.2** | high | Race conditions and merge rules: the subtlest reasoning in the codebase |
| 3 | Server security | **Fable 5.2** | high | The repo is public; an attacker can read every line |
| 4 | Match and hustler logic | **Fable 5.2** | high | Many rule combinations (formats × presses × early finishes) |
| 5 | Screens, overlays and keys | Opus 5.5 | high | A wide state machine but shallow logic |
| 6 | Shot mechanics and tuning | Opus 5.5 | high | Physics edge cases; mostly local reasoning |
| 7 | Economy balance | Opus 5.5 | high | Numbers and judgment; findings are suggestions, not bugs |
| 8 | Performance | Opus 5.5 | high | Leak hunting and measurement |
| 9 | Dead code and cleanup | Opus 5.5 | medium | Mechanical |
| — | **Fix sessions** (after you've read the findings) | Opus 5.5 | high | Implementation |

Fable 5.2 costs about twice as much per token as Opus 5.5 and uses up a plan's allowance faster. Use more than "high"
only to re-check one specific finding. If you want to spend less, run every section on Opus 5.5 at high effort.

## How to run a section

1. Open a **new** session in this folder, set the model and effort from the table, and say:
   *"Do audit section N from AUDIT_PLAN.md."*
2. The auditor follows **The rules for every section** (below) and writes its findings into `AUDIT_FINDINGS.md`.
3. You read the findings and pick what to fix. Then, in a new session on Opus 5.5 at high effort, say for example:
   *"Fix findings 1.2 and 1.4 from AUDIT_FINDINGS.md."*
4. Tick the section in **Progress** at the bottom.

## The rules for every section

- **Report, don't fix.** Don't edit `index.html` or `api/`. The only files you write are `AUDIT_FINDINGS.md` and new
  test scripts under `tools/test/`. Fixing is a separate session, after the user has chosen what to fix.
- **Read the code fresh.** Line numbers below are approximate (taken 2026-11-19); search by the function name. Other
  sessions change the code often.
- **Every finding needs a failure scenario:** concrete steps or state → the wrong result. "This looks fragile" is not
  a finding. Where you can, prove it with a probe script (see **Testing**) and paste the output.
- **Severity:**
  - **Critical:** money, a save or a career is lost or corrupted, or a security hole.
  - **High:** a wrong result a normal player will hit.
  - **Medium:** a wrong result in an edge case.
  - **Low:** polish, clarity or a small inconsistency.
- **Findings format** in `AUDIT_FINDINGS.md`. Add a `## Section N — <name> (<date>, <model>)` heading, then one entry
  per finding, numbered N.1, N.2…:
  ```
  ### N.1 [High] One-line statement of the defect
  - Where: function name (about line N)
  - Scenario: steps/state → what goes wrong
  - Evidence: probe output, or the code path traced
  - Fix: the suggested change and its size (S / M / L)
  ```
  End the section with **Checked and fine:** a short list of what you looked at and found correct, so a later session
  doesn't redo it.
- **Rank** the findings most severe first. A section that finds nothing is a valid result; say so.
- **Standing constraints** (never violate these, not even in a suggested fix):
  - `keeto` is the only admin, ever.
  - The admin password exists only as a salt and hash baked into `api/_admins.js`. Never write a password anywhere.
  - The repo is public, so don't put secrets or a player's personal details in a finding.
  - Commit only when the user asks.
- **Stay in scope.** If you notice something that belongs to another section, add it as a one-liner under
  **Noticed for later** at the end of your section. Don't investigate it.

## Testing

The harness lives in `tools/test/`:

- `node tools/test/devserver.js 8090` serves the game and the real `api/*.js` handlers, with Redis replaced by an
  in-memory fake. It never touches the live database. Run it in the background.
- `node tools/test/probe.js http://127.0.0.1:8090/ <shotName|-> @<script.js>` loads the game in headless Chrome and runs
  the script in the page. It prints the script's return value and any page errors (under PROBLEMS), and saves
  `tools/test/out/<shotName>.png`. The probe needs Node 22 or newer and Chrome.
- `window.__golf` exposes the game's internals to scripts. Read its definition at the very end of `index.html` (about
  line 15756) for the list. Useful entries include `career`, `round`, `hp`, `npc`, `finishHole`, `showScorecard`,
  `scorecardNext`, `npcPlan`, `syncNow`, `syncLoad`, `careerSave`, `TUNE` and `CLUB_MODELS`.
- `tools/test/regress-handicap.js` is the regression test. It starts a fresh career, forces the scores of three matches
  and abandons a fourth. Use it as the template for new scripts. Run it after any fix:
  `node tools/test/probe.js http://127.0.0.1:8090/ - @tools/test/regress-handicap.js`
  It should print three "Round recorded" lines, then "abandoned: rounds 3", and no PROBLEMS.
- To test two players or two tabs, pass a different profile name as the 5th argument. Each profile gets its own
  localStorage.

## Map of the code

- `index.html` is about 14,650 lines: one ES module using Three.js r160. Rough order, top to bottom:
  1. CSS.
  2. HTML.
  3. `TUNE` (about line 6858): shot tuning.
  4. Physics: `stepFlight`, `stepChip`, `stepPutt`.
  5. Course building: `TIERS` and `buildHole`.
  6. Input and the shot flow: `tiltFromLie` and `finishHole`.
  7. The `CAREER` economy table (about line 10389).
  8. Save and sync: `careerSave` through `syncLoad`.
  9. Clubhouse renderers: the shop, the bag room, trophies and friends.
  10. `CLUB_MODELS` (about line 11784).
  11. Matches: `NPCS` (about line 12759), `matchStatus` through `settleMatch`, then the invitationals and the NPC
      playback (`npcPlan`, `npcPlayStroke`).
  12. The keydown handler (about line 14572).
  13. `frame()` (about line 15682).
- `api/` holds the Vercel functions, all backed by Upstash Redis:
  - `_redis.js`: `redis`, `readBody`, `rateLimit`, `sessionId`, `CAS`, `updateCareer`.
  - `profile.js`: signup, login, roster, logout, load, save, showcase, buyshow, players.
  - `challenge.js`: create, list, decline, cancel, accept, submit; also `withLock`, `payOut` and `expire`.
  - `leaderboard.js`: has its own copy of `redis` and `readBody`.
  - `_admins.js`: `ADMINS`, `isAdmin`, `adminCred`.
- Design docs: `CAMPAIGN_PLAN.md` holds the career and economy design (the chunks, the economy table and the end-game
  features). `MULTIPLAYER_PLAN.md`, `PUTTING_PLAN.md` and `CHIPPING_PLAN.md` cover their own areas. Where the code and
  a plan disagree, report it; don't assume either is right.

---

## Section 1 — Money and settlement · Fable 5.2 · high

**Goal:** every dollar in and out of `career.cash` happens exactly once, for the right amount, and survives a reload.

Code to read:
- **Matches:**
  - The bet helpers: `matchStatus`, `betFinal`, `skinsState`, `matchNet` (about line 12853 onward), `canPress` and
    `playerPress`.
  - `settleMatch(kind)` (about line 13111), `confirmForfeit` (about line 13261), and `showBeating` and `closeBeating`.
  - Where `unpaid` and the loan shark are handled (search `unpaid` and `snapped`).
- **Invitationals:** `startTour` (the entry fee), `settleTour` and `confirmWithdraw`.
- **Shop:**
  - Buying, which happens in `renderShop`'s handlers.
  - `repairPrice` (luxury clubs pay ×0.25), and `luxBuyConfirm`.
  - The coach (`renderCoach`) and caddies (`renderCaddies`), both of which cost money.
- **Payoff screen:** `settleMatch` and `settleTour` record `outcome`; then `maybeShowOutcome` and `showOutcome`.
- **Server side:**
  - `api/challenge.js`: `payOut`, `finish`, `expire` and `forfeitResult` (friend challenges move money between two
    careers).
  - `api/profile.js`: `buyshow` (buying a piece off a friend's wall: the buyer pays the owner).

Check:
- **Settling twice:** does every settle path guard on `settled`? Try a reload mid-settle, closing the payoff screen
  with each button, `scorecardNext` after a settle, a match decided early and then played on, and a forfeit after the
  match is already decided.
- **Never settling:** a match abandoned in different ways (quit, reload, close the tab, sign out) leaves money on
  neither side, or on the right side. Do the same for a withdrawal from an invitational after its entry fee is paid.
- **Amounts:**
  - The stake times the bets, presses (including a press of a press), skins carry-overs and a final-hole tie.
  - The invitational prize table.
  - Rounding and negative zero.
- **The loan shark:** losing more than your cash, then `unpaid` and the beating. What clubs get snapped, and what if
  there are none to snap? Is the debt collected again next time, or forgotten?
- **The payoff screen:** do the numbers match what was actually applied to `career.cash` (`cashBefore` / `cashAfter`)?
- **Sync and money:** can `mergeServer` (Section 2) bring back an older `cash` and undo a payment or a purchase? Note it
  here only if it's a money bug; the merge rules themselves belong to Section 2.
- **Friend challenges:** are `payOut` and `finish` idempotent under `withLock`? What happens when both players submit at
  once, or a challenge expires while one player is mid-round? Can a player's cash go negative, or be created from
  nothing?

Tests: write `tools/test/money-*.js` scripts. Each forces a scenario through `__golf` and asserts on the cash before and
after.

## Section 2 — Saves and sync · Fable 5.2 · high

**Goal:** a career is never lost, rolled back or corrupted, across reloads, two tabs, two devices, going offline and
signing out.

Code to read:
- The browser side: `careerLoad`, `careerSave`, `apiPost`, `setSync`, `signInExpired`, `queueSync`, `syncNow`,
  `mergeServer` and `syncLoad` (about lines 10426–10549).
- `newCareer`, and where old saves get missing fields filled in (search `career.cards`, `career.rounds` and
  `|| []`-style defaults).
- `archiveRound` and `CARD_KEEP`.
- The server side: `api/profile.js` `load`, `save` and `cleanCareer`, `MAX_CAREER` (250,000 bytes), and the
  `readBody` limit (300,000). In `api/_redis.js`: `CAS` and `updateCareer`.

Check:
- **The version rules:** what happens on a CAS conflict? What wins when the local and server copies have both changed?
  Is there any path where the newer copy loses: a stale tab saving over a fresh one, or a load arriving after a local
  change?
- **`mergeServer`:** for each field (cash, bag, history, rounds, cards, match, tour), is the merge rule right?
  "The fuller card wins" applies to cards. What about cash and an in-progress match?
- **Size:** build a maxed-out career (100 cards, a long history, every club, trophies) and measure
  `JSON.stringify(career).length` against `MAX_CAREER`. What happens when it goes over: a clear message, or saves
  silently failing forever?
- **Old saves:** load a career saved before each recent feature (no `cards`, no `outcome`, no luxury fields, no
  `putters`) and confirm nothing throws and nothing resets.
- **Sign-out and sign-in:** does a guest career merge with or overwrite an account's? Are expired sessions handled? Can
  two players on one browser see each other's career?
- **`keepalive` save on page close:** is it within the browser's 64 KB keepalive limit? What if it isn't?

Tests: use two probe profiles to simulate two tabs or devices against one dev server.

## Section 3 — Server security · Fable 5.2 · high

**Goal:** what an attacker who reads this public repo can do to other players, the database, or the admin account.

Code to read: every file in `api/`, plus every place `index.html` puts server data into the page (search `innerHTML`
near friends, roster, players, leaderboard, challenge and visit code).

Check:
- **Authentication:**
  - Signup and login: how passwords are hashed and compared, and whether the comparison is constant-time.
  - Session tokens (`golf:sess:<token>`): their randomness, expiry and logout.
  - `rateLimit` on login and signup.
  - Whether one player can act as another: by a profile id in the request body versus the session, or by an
    unchecked `id`.
- **Admin:** `isAdmin` and `adminCred`. Can any path make another account an admin? Confirm `keeto` is the only one.
  `applyDevTools` gates the dev tools in the browser; is any admin power enforced only in the browser?
- **Input checks:** sizes (`readBody`), types, `cleanCareer`, `cleanCard`, and leaderboard `clean`. Can a crafted body
  crash a function, store a huge value, or set another player's data?
- **Injection into the page:** player names, card fields, wall items and challenge messages are rendered with
  `innerHTML`. Are all of them escaped? (Script in a friend's name is the classic attack.)
- **Cheating:** the career is saved from the browser, so a player can always edit their own cash. That is accepted;
  note it, don't count it as a finding. What *is* a finding: cheating that affects **other** players. Examples are fake
  friend-challenge scores that take a friend's money, fake leaderboard entries, and buying off a wall for less than the
  price.
- **Leaks:** what `roster` and `players` return about other players (emails? hashes? whole careers?), and whether error
  messages leak internals.
- **Secrets in the repo:** no tokens, keys or plain passwords in the files or in the git history (`git log -p` on
  `api/`).

Don't run anything against the live site (https://vector-lab-g.vercel.app/). Use the dev server only.

## Section 4 — Match and hustler logic · Fable 5.2 · high

**Goal:** the rules of a match are applied correctly in every format, and the hustler plays fairly and believably.

Code to read:
- The match rules: `matchStatus`, `matchBets`, `betFinal`, `betResult`, `skinsState`, `matchNet`, `matchOver`,
  `lastLiveBet`, `canPress`, `playerPress` and `statusText`.
- The hustler: his own press decision (search `press` near the NPC code), `npcPlan` (about line 13461), `npcPlayStroke`
  and `npcHoleScore`.
- The rest: `startMatch`, `renderMatchPicker`, `NPCS` and `npcRating`; the scorecard's `matchRowsHTML` and `betsStrip`;
  `recordCareerRound` and the handicap.

Check:
- **Match status:** "dormie", decided early ("3 & 2"), all square after 9, and a press opened on the last hole. Do
  `matchOver` and the scorecard agree on every case?
- **Presses:** when a press is offered (exactly 2 down?), the limit on presses, pressing a press, and a hustler's press
  versus yours. Does the "Best case / Worst case" in `betsStrip` match what would actually be paid?
- **Skins:** carry-overs, the final hole, and ties on a carried skin.
- **The hustler's play:** does `npcPlan` produce scores that match each hustler's `skill` and rating? Simulate many holes
  per hustler and report the average score versus par, the spread and the worst case. Is the shot counter
  (`holeMapText`) right while his ball is flying or rolling?
- **Invitationals:** the field's scores and placing, ties for a prize place, and `confirmWithdraw`.
- **Handicap:** `recordCareerRound`. A known issue: the tooltip reads "best 4 of the last 3 rounds" when only 3 rounds
  exist. Confirm and log it.

## Section 5 — Screens, overlays and keys · Opus 5.5 · high

**Goal:** no screen gets stuck, no key does two things, and no overlay hides another one the player needs.

Code to read:
- The keydown handler (about line 14572) and its early-return chain: `beatOpen`, `outOpen`, `tossOpen`, `homeOpen`,
  `scMode` (`'round'`, `'pvp'` and `'arch'`).
- The `on` classes and z-index values of `#scorecard`, `#outcome`, `#beating`, `#clubhouse` and the toss popup.
- `clubKey`, `puttKey`, `closeOutcome`, `closeBeating`, `showArchivedCard`/`closeArchivedCard`, `hideScorecard` and
  `scorecardClose`.

Check:
- For each overlay, list how it opens and every way it closes (key, button, Escape). Then find combinations that leave
  the game stuck: an overlay open with no visible way out, keys going to a hidden screen, or the clubhouse opening under
  the payoff screen.
- **The order at the end of a match:** final scorecard, then the beating, then the payoff screen, then the clubhouse.
  Check it with and without a debt, and with a match decided early and played on.
- **Keys that do something while typing in a text field** (the name or chat inputs).
- **Small screens:** take screenshots at 1280×720 and on a phone-sized window (set `Emulation.setDeviceMetricsOverride`
  in a copy of the probe) for the scorecard, the payoff screen, the shop and the bag room.

## Section 6 — Shot mechanics and tuning · Opus 5.5 · high

**Goal:** shots behave believably at the edges, and nothing produces NaN, a ball stuck forever, or a ball through the
ground.

Code to read:
- `TUNE` (about line 6858) and `windVector`.
- The physics steps: `stepFlight`, `stepChip` and `stepPutt`.
- The course: `surfaceAt`, `isOB`, `treeAt`, `landBall`, `dropOptions` and `takeDrop`.
- Tilt: `tiltFromLie`, `tiltPenalty` and `compOffset`.
- Spread and aim: `landSpread`, `stockShot`, `holeAim`, and `launch`/`launchChip`.

Check:
- **Extreme inputs:** maximum and minimum power, full spin, strongest wind, ball against a tree, ball on the edge of a
  green or a hazard, putt from off the green.
- **Every loop terminates:** a ball rolling on a slope, a putt orbiting the cup, a chip on a steep green.
- **Tilt:** the new ladder (`tiltLadder` [0.10, 0.55, 1.35, 2.30], then +1.0 per bad shot) times the Composure offset.
  Is it applied, cleared and displayed consistently?
- **NaN and Infinity:** search for division by a speed or distance that can be zero.

## Section 7 — Economy balance · Opus 5.5 · high

**Goal:** the money curve feels right from the first hustle to the end game. These are suggestions, not bugs.

Code to read:
- The money tables: `CAREER` (about line 10389), the `NPCS` stakes, the `TIERS` requirements and reputation, and the
  invitational entry fees and prizes.
- The prices: `CLUB_MODELS` and `SHOP`, `repairPrice`, the coach's lessons and the caddies.
- Compare the numbers with `CAMPAIGN_PLAN.md`.

Produce:
- A table per tier: typical winnings per match (from the stakes and a likely win rate, using the hustler score
  distribution from Section 4 if it's done), the cost of the gear that tier "expects", and how many matches it takes to
  afford it.
- Where the curve is too flat or too steep: a dead stretch with nothing to buy, a wall you can't climb, or money that
  stops mattering.
- Whether luxury clubs work as a money sink at the point where cash piles up.
- How the loan shark's risk compares with the reward.

## Section 8 — Performance · Opus 5.5 · high

**Goal:** frame rate stays steady and memory stays flat over a long session.

Code to read:
- `frame()` (about line 15682).
- `clearHoleGroup` (it disposes geometry and materials; does it dispose **textures**?), `buildHole`, and the trail
  disposal.
- The clubhouse scenes (`chScene` redraws a 1600×900 SVG).
- Every `addEventListener` and `setInterval` inside a function that runs more than once: do listeners pile up?

Measure: in a probe, play or simulate 18+ holes and open and close the clubhouse 20 times. Record `performance.memory`
(Chrome), `renderer.info` (geometries, textures and programs) and the listener counts before and after. Report anything
that only grows.

## Section 9 — Dead code and cleanup · Opus 5.5 · medium

**Goal:** a list of safe removals and simplifications. Don't touch anything that is merely ugly but correct.

Check:
- Unused functions, CSS classes, HTML ids and `TUNE` keys.
- Duplicated helpers: for example `api/leaderboard.js` has its own `redis`/`readBody`/`findCreds` copies of
  `_redis.js`; and `handicapOf` exists in both `profile.js` and `challenge.js`.
- Stale comments that describe old behaviour.
- `CAMPAIGN_PLAN.md` and the other plans: sections that no longer match the code.

For each item, give the evidence that it's unused (a search with zero hits outside its own definition).

---

## Progress

| # | Section | Done | Findings | Fixed |
|---|---|---|---|---|
| 1 | Money and settlement | ✅ 2026-11-19 | 8 (1 critical, 2 high, 3 medium, 2 low) | 1.1, 1.2, 1.3, 1.7 |
| 2 | Saves and sync | ✅ 2026-11-19 | 9 (1 high, 5 medium, 3 low) | all (2.1–2.9) |
| 3 | Server security | ✅ 2026-11-19 | 9 (1 critical, 3 high, 4 medium, 1 low) | 3.1–3.7, 3.9 (3.8 is yours) |
| 4 | Match and hustler logic | ✅ 2026-11-19 | 7 (3 medium, 4 low) | all (4.1–4.7) |
| 5 | Screens, overlays and keys | ✅ 2026-11-19 | 4 (2 medium, 2 low) | 5.1, 5.2, 5.3 |
| 6 | Shot mechanics and tuning | ✅ 2026-11-19 | 2 (low) | 6.1, 6.2 |
| 7 | Economy balance | ✅ 2026-11-19 | 4 (2 high, 1 medium, 1 low: design) | 7.1, 7.2, 7.3 |
| 8 | Performance | ✅ 2026-11-19 | 1 (low) | 8.1 |
| 9 | Dead code and cleanup | ✅ 2026-11-19 | 3 (low) | 9.1, 9.2, 9.3 |
