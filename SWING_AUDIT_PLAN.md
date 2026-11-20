# Swing, ball flight and club audit — plan

Written 2026-11-20. This is a second audit, separate from the code audit in `AUDIT_PLAN.md` (finished). That one asked
"is the code correct and safe?". This one asks **"does the golf feel and behave right?"**: the mouse swing, what happens
at impact, how the ball flies and lands, and whether each club and club model plays like what it claims to be.

Each section below is a self-contained brief: a reader with none of the earlier conversations can run it.

## Model and effort for each section

| # | Section | Model | Effort | Why this model |
|---|---|---|---|---|
| S1 | The mouse swing (input → swing numbers) | **Fable 5.2** | high | Timing, sampling and device differences: subtle, and everything else rests on it |
| S2 | Impact (swing numbers + setup + club → launch) | **Fable 5.2** | high | One 190-line function where about 40 terms interact |
| S3 | Ball flight, wind, bounce and roll | **Fable 5.2** | high | Physics judged against real launch-monitor data |
| S4 | The base bag (14 clubs) | Opus 5.5 | high | Measurement against a benchmark table |
| S5 | The club catalogue (career models) | Opus 5.5 | high | Measurement, plus judgment on each model's character |
| S6 | Stats, lies, dispersion and difficulty | Opus 5.5 | high | Monte Carlo runs and tables |
| S7 | Shot shaping, height and spin | Opus 5.5 | high | Measurement of each control's effect |
| S8 | Chipping and putting | Opus 5.5 | high | Same method, on the short game |
| S9 | What the player is shown vs what happens | Opus 5.5 | high | Compare each on-screen number with the real result |
| — | **Fix sessions** | Opus 5.5 | high | Implementation |

To spend less, run everything on Opus 5.5 at high effort. S1–S3 are where the stronger model is most likely to find
what the other misses.

## How to run a section

1. Open a **new** session in this folder, set the model and effort from the table, and say:
   *"Do swing audit section S3 from SWING_AUDIT_PLAN.md."*
2. The auditor follows **The rules** below and writes findings into `SWING_AUDIT_FINDINGS.md`.
3. You read the findings and choose. Then, in a new session on Opus 5.5: *"Fix findings S3.1 and S3.4 from
   SWING_AUDIT_FINDINGS.md."*
4. Tick the section in **Progress** at the bottom.

The sections can be run in any order. S4–S9 are quicker if S2 and S3 are done first, because they explain the numbers.

## The rules

- **Report, don't fix.** Don't change how the game plays. The only edits allowed outside the findings file and
  `tools/test/` are **adding names to the `window.__golf` test hook** at the end of `index.html` (see **Testing**).
- **Measure, don't guess.** Every finding needs numbers: what the game produces, what it should produce, and where the
  "should" comes from (the benchmark table below, a named rule of golf physics, or a design direction below). Put the
  measured table in the findings even when it's all fine: those tables are half the value of this audit.
- **Three kinds of finding.** Say which each one is:
  - **Bug:** the code doesn't do what its own comments or the design directions say.
  - **Realism:** it does what was intended, but real golf differs enough that a golfer would notice.
  - **Feel / balance:** a judgment call for the user (too easy, too punishing, a control that does too little).
- **Severity:** High = a normal player meets it in normal play and it changes scores. Medium = noticeable in some
  situations. Low = polish.
- **Findings format** in `SWING_AUDIT_FINDINGS.md`: a `## Section Sn — <name> (<date>, <model>)` heading, a summary
  table, then one entry per finding numbered Sn.1, Sn.2…:
  ```
  ### S3.1 [High, realism] One-line statement
  - Where: function or table (about line N)
  - Measured: the numbers (a small table or probe output)
  - Expected: the number and its source
  - Why it matters: what the player sees
  - Fix: the suggested change, its size (S / M / L), and what else it would move
  ```
  End with **Checked and fine** (with the measured numbers) and **Noticed for later**.
- **"What else it would move" matters here.** Almost every number in this system feeds others: changing a club's spin
  changes its carry, its curve, its dispersion and its roll. A suggested fix must say what to re-measure after it.
- **The design directions below are decisions, not findings.** Report where the code fails to deliver one. Don't
  propose reversing one.
- **Standing constraints** from the first audit still apply: commit only when asked; don't test against the live site.

## Design directions the user has given (treat as intended)

1. **Backswing length is the real driver of distance.** The downswing and follow-through are "quite easy" and
   "forgiving". (`TUNE` POWER MODEL.)
2. **Past 100% is only incrementally punishing:** slightly wider dispersion, not a cliff; the distance gained from 100%
   to the maximum is small.
3. **Every extra ask compounds into more uncertainty of finding the centre of the face:** over-100% power, draw or
   fade (and how much), height and spin changes. (`TUNE` SHOT COMPLEXITY.)
4. **Draws roll out; fades have stopping power.**
5. **Draws and fades should be dramatic**, and Dexterity widens the shaping range.
6. **The swing ring must travel back through the ball;** missing it is penalised by degree, as wider dispersion.
7. **Down-and-right through the ball = in-to-out = draw; up-and-right = out-to-in = fade** (matches the on-screen
   golfer; this deliberately reverses the original spec).
8. **Dexterity is the antidote to a difficult shot:** it shrinks the cost of what you ask for. It does not excuse a
   missed contact, the wrong club for the lie, or tilt.
9. **The lie compounds difficulty, and clubs are limited by the lie** ("driver out of a sand trap" should be very high
   risk or not doable).
10. **Tilt** (bad shots in a row): the first is forgiving, then it compounds; Composure offsets it.
11. **Luxury clubs are never better than the best ordinary club:** the money buys the look, not strokes.
12. **The test round is the same for everyone:** all stats 5, the base bag, each hole's fixed wind and green speed.
13. **Putting:** the marker's power read deliberately ignores slope; Perception sets how accurate the reads are.
14. **A career starts as a beginner and climbs to the tour** (user, 2026-11-20). For Dexterity: Dex 1–2 a beginner,
    Dex 8–9 a tour pro's average, Dex 10 the very best (S6.4's re-done table). Power is not yet on this scale (S4.4).

## Benchmarks

**TrackMan PGA Tour averages** (the widely published table; the base bag was built from it). If you have web access,
confirm against a current source and note any difference. Carry is at sea level, no wind.

| Club | Club mph | Attack ° | Ball mph | Smash | Launch ° | Spin rpm | Apex yds | Land ° | Carry yds |
|---|---|---|---|---|---|---|---|---|---|
| Driver | 113 | −1.3 | 167 | 1.48 | 10.9 | 2,686 | 32 | 38 | 275 |
| 3 wood | 107 | −2.9 | 158 | 1.48 | 9.2 | 3,655 | 30 | 43 | 243 |
| 5 wood | 103 | −3.3 | 152 | 1.47 | 9.4 | 4,350 | 31 | 47 | 230 |
| Hybrid | 100 | −3.5 | 146 | 1.46 | 10.2 | 4,437 | 29 | 47 | 225 |
| 3 iron | 98 | −3.1 | 142 | 1.45 | 10.4 | 4,630 | 27 | 46 | 212 |
| 4 iron | 96 | −3.4 | 137 | 1.43 | 11.0 | 4,836 | 28 | 48 | 203 |
| 5 iron | 94 | −3.7 | 132 | 1.41 | 12.1 | 5,361 | 31 | 49 | 194 |
| 6 iron | 92 | −4.1 | 127 | 1.38 | 14.1 | 6,231 | 30 | 50 | 183 |
| 7 iron | 90 | −4.3 | 120 | 1.33 | 16.3 | 7,097 | 32 | 50 | 172 |
| 8 iron | 87 | −4.5 | 115 | 1.32 | 18.1 | 7,998 | 31 | 50 | 160 |
| 9 iron | 85 | −4.7 | 109 | 1.28 | 20.4 | 8,647 | 30 | 51 | 148 |
| PW | 83 | −5.0 | 102 | 1.23 | 24.2 | 9,304 | 29 | 52 | 136 |

**LPGA Tour, for a slower swing:** driver 94 mph club, 140 ball, 13.2° launch, 2,611 rpm, 218 carry; 7 iron 76, 104,
19.0°, 6,699, 141; PW 70, 86, 25.6°, 8,403, 107.

**Rules of thumb** (approximate; say so when you lean on one):
- Start direction is mostly the face: about 85% face / 15% path with a driver, about 75% / 25% with an iron.
- Curve comes from face-to-path; less loft and less backspin mean more curve per degree.
- A headwind costs about twice what the same tailwind gains. A 10 mph crosswind moves a driver roughly 15–20 yds and
  a mid iron roughly 8–10 yds.
- Tour roll-out on a normal fairway: a driver about 20–30 yds; a 7 iron a few yards; a wedge stops or backs up.
- Typical male amateur: driver about 93 mph club speed, about 215–220 yds total.

## Testing

- Start the dev server (`node tools/test/devserver.js 8090`, in the background) and run page scripts with
  `node tools/test/probe.js "http://127.0.0.1:8090/?nohome" - @tools/test/<script>.js 0 <profile>`. The probe prints the
  script's return value, page errors and anything the security policy blocks. `PROBE_SIZE=1280x720` sets the window.
- `window.__golf` (end of `index.html`) already exposes: `state`, `swing`, `TUNE`, `CLUBS`, `BASE_CLUBS`,
  `CLUB_MODELS`, `modelMods`, `applyCareerClubs`, `setClub`, `stockShot`, `stockFlightOf`, `lieRead`, `landSpread`,
  `spreadAxes`, `SPREAD`, `createFlight`, `stepFlight`, `debugSwing`, `setHeight`, `setSpinCtl`, `applyShot`,
  `setComposure`, `setBadStreak`, `tiltPenalty`, `compOffset`, `CHIP`, `CHIP_TYPES`, `chipTable`, `PUTT`, `PUTTERS`,
  `SURF`, `telemetry`, `shot`, `puttRun`, `puttTel`.
- **Added by S1 (2026-11-20), so they're there now:** `analyzeSwing`, `computeImpact`, `swingSample`, `beginSwing`,
  `endSwing`, `onPointerMove`, `isSpike`, `tempoTarget`, `powerFromBackswing`, `powerFromTempo`, `LIES`, `SLOPES`,
  `AERO`, `windVector`, `clubFit`, `solveShape`, `powerMult`, `runChip`, `computePutt`, `analyzePutt`, `CADDIES`.
  Adding names to `window.__golf` is the one edit to `index.html` this audit allows.
- **Added by S5:** `createPutt`, `stepPutt`, `puttTarget`, `rollDecel`, `puttGate`, `rng32`, `shopStats`, `SHOP`,
  `withClubModel`, `setup`, `careerStats`.
- **From S1:** `debugSwing` reads about 95% tempo when asked for 100% and leaves the swing active. For exact numbers,
  call `computeImpact` directly with the swing numbers you want (`tools/test/swing-input.js` shows how).
- `debugSwing({ back, tempo, angle, wobble, miss, traj })` plays a scripted swing through the real input path.
  `stockFlightOf(clubIndex, setup, backswing)` gives a club's no-scatter shot: `{ r, f }` = launch numbers and the
  finished flight (`f.carry`, `f.apex`, `f.p` in metres; `r.ballSpeed` mph, `r.vla`, `r.spin`, `r.axis`).
- For random behaviour, call `computeImpact` directly with a seeded random function (as `landSpread` does) for a few
  thousand shots; don't rely on 36.
- Existing scripts to copy from: `tools/test/phys-fuzz.js` (flights and putts), `tools/test/phys-drops.js`.
- Name new scripts `tools/test/swing-<topic>.js`. Each prints a table a later session can re-run after a fix.

## Map of the code

All in `index.html` (line numbers approximate, taken 2026-11-20; search by name):

- `TUNE` (7003): every swing and shot tunable, with comments. `CLUBS` (7093): the 14 clubs plus a comparison 7 iron.
- `CHIP`, `CHIP_TYPES` (7123); `LIES` (7151); `SLOPES` (7160); `powerMult`, `compOffset`, `tiltPenalty`, `clubFit`
  (7168–7186); `tempoTarget`, `powerFromBackswing`, `powerFromTempo` (7191–7197).
- `analyzeSwing` (7202): mouse samples → backswing, tempo, path angle, wobble, miss.
- `computeImpact` (7260): the impact model, in 10 numbered steps.
- `AERO`, `windVector`, `createFlight`, `stepFlight`, `treeDeflect`, `airStep` (7451–7544): flight, bounce and roll.
- `createChip`, `stepChip`, `runChip` (7549); `PUTT`, `PUTTERS`, `analyzePutt`, `computePutt`, `stepPutt` (7614–7860).
- `state.cal` (7884): the swing calibration (default 800 counts, 139 ms). `isTeed`, `env`, `setup` (7928).
- `SURF` (8519): how each surface takes a landing and a roll.
- `beginSwing`, `swingSample`, `onImpact` (9020–9125): the live input. `onPointerMove`, `isSpike` (9521–9546).
- `launch`, `launchChip`, `updateShot` (9578–9676): the live flight (fixed 1/120 s steps).
- `CLUB_MODELS`, `modelMods`, `applyCareerClubs` (12248–12318): the career catalogue. `CADDIES` (about 12439).
- `stockFlightOf`, `landSpread`, `stockShot`, `SHOT_SHAPES`, `solveShape`, `lieRead`, `renderBag` (14908–15100).
- `debugSwing` (16365).
- The comment block at the very top of the `<script>` lists the deviations from the original specs (AUDIT 1–15,
  P1–P6, C1–C9). `PUTTING_PLAN.md`, `CHIPPING_PLAN.md` and the club tables in `CAMPAIGN_PLAN.md` are the design docs.

---

## S1 — The mouse swing · Fable 5.2 · high

**Goal:** the same hand movement gives the same swing numbers on any mouse, browser and frame rate, and the numbers
mean what the game says they mean.

Read: `beginSwing`, `swingSample`, `onPointerMove`, `isSpike`, `analyzeSwing`, `onImpact`, the calibration code
(`state.calibrating`, `saveCal`), `tempoTarget`, and the swing overlay that draws the ring (`swingFx`, `fxGeom`).

Check:
- **Sample-rate independence.** Feed the same stroke shape through `swingSample` at 60, 125, 500 and 1,000 samples a
  second, with and without timing jitter. Backswing, tempo, path angle, wobble and miss should barely move. The speed
  window is 24 ms: at 60 Hz that's one or two samples.
- **Coalesced events.** `onPointerMove` uses `getCoalescedEvents` and falls back to the single event when the sums
  disagree. What does a browser without them (or a busy frame) do to tempo and wobble?
- **Pointer lock.** `unadjustedMovement` is requested, with a fallback to an ordinary lock. With OS mouse acceleration
  on (the fallback), a fast downswing covers more counts than a slow backswing. What does that do to where "impact"
  falls and to the tempo reading? Which browsers take the fallback?
- **Mouse DPI and calibration.** The default is 800 counts for 100%. On a 400 DPI mouse that is 2 inches of travel; on
  3,200 DPI a quarter of an inch. Is an uncalibrated player on either mouse able to play? Are the calibration bounds
  (100–3,000 counts, 0.5–30 counts/ms) sensible? Does anything tell a new player to calibrate?
- **The backswing clock** (`backswingTimeMs`, 1,000 ms): once it runs out, the top is locked. Is a slow, deliberate
  backswing cut short? What does the player see when that happens?
- **Top-of-swing detection** (`topHysteresis`, `minBackswing`): a pause or a small bounce at the top; a backswing that
  drifts forward and goes back again; a tiny waggle before the takeaway.
- **The path angle** (`thetaMouse`): a least-squares line through the downswing, clamped to ±15°. Does a curved
  (over-the-top) stroke read as its average, its end, or something odd? Does a deliberate 5° stroke read as 5°?
- **Wobble** (`sigma`) and **miss** (ring vs ball): what does a steady human hand actually score? Estimate the typical
  human values, because S6's dispersion numbers depend on them. Is `strikeMmPerPx` in a sensible range at those values?
- **Design directions 1, 2, 6 and 7:** confirm each with `debugSwing` sweeps (backswing 40–110%, tempo 40–115%).
- **`debugSwing` itself:** does it go through the same path as a real swing, so the other sections can trust it?

## S2 — Impact · Fable 5.2 · high

**Goal:** `computeImpact` turns a swing into believable launch numbers, each term does what its comment says, and no
term is counted twice or cancelled by another.

Read: `computeImpact` (all 10 steps), `clubFit`, `powerMult`, `powerFromBackswing`, `powerFromTempo`, `LIES`,
`SLOPES`, and how `setup()` and `env()` are built.

Check:
- **Term-by-term sensitivity.** From a stock 7 iron, driver and sand wedge, change one input at a time (backswing,
  tempo, path, face, stance, ball position, height, spin, wobble, miss, each lie, each slope, Power, Dexterity) and
  table what moves in the output. Flag any input that does nothing, does the opposite of its comment, or does far more
  than its neighbours.
- **Double counting.** For example: a strong-lofted model lowers `loft`, which raises smash (smash reads static loft),
  and also has its own speed multiplier. Loft also feeds `clubFit`, `spinAuth` and the flop's minimum. List every
  place static loft, dynamic loft and spin are read, and whether each use is right for a modified club.
- **Start direction.** `hla = 0.75 × face + 0.25 × path` for every club. The rule of thumb is about 85 / 15 for a
  driver.
- **Spin axis.** `axisGainFor`, `lowSpinMult`, `curve`, `work`, `shapeBoost`, the ±65° clamp: is the curve per degree
  of face-to-path believable club by club? (Design direction 5 asks for dramatic, so compare the trend, not the size.)
- **Gear effect and bulge:** a toe hit with a driver should draw, a heel hit fade; an iron's off-centre hit twists the
  face open or closed. Check signs and sizes.
- **Smash** (`1.49 − 0.00012 × loft²`, floor 1.10) and the off-centre loss (`0.018` per mm past the sweet spot)
  against the benchmark's smash column.
- **Launch angle** (`0.85 × dynLoft + 0.15 × aoa`) against the benchmark's launch column.
- **Partial swings.** Club speed is linear in backswing (`backswingExp` 1.0), and spin scales with it too. Table carry
  against backswing for a wedge and a 7 iron: is a half backswing a usable half shot, or a dribble?
- **Clamps and floors:** the loft floor (`club.floor`), `setupSpin` 0.5–1.5, `vla` 1.5–55, strike ±15 mm, the mishit
  outcomes (TOPPED, FAT, BLADED, CHUNKED, FLIER). Does any clamp bite in ordinary play?
- **Slopes.** `SLOPES` exists, but `setupNextShot` sets `state.slope = 'flat'` for every shot on a hole. Confirm
  whether slope lies exist anywhere but the range. (A lead spotted while planning.)
- **The order of random draws:** `computeImpact` takes a random function; do the stock (no-scatter) path and the live
  path differ in anything but scatter?

## S3 — Ball flight, wind, bounce and roll · Fable 5.2 · high

**Goal:** given launch numbers, the ball's carry, height, landing angle, curve, wind response and roll match real
golf closely enough that a golfer trusts them.

Read: `AERO`, `createFlight`, `airStep`, `stepFlight`, `windVector`, `SURF`, `treeDeflect`, and `updateShot`.

Check:
- **The benchmark table, row by row.** Launch each row's ball speed, launch angle and spin directly with
  `createFlight` (no impact model) and compare carry, apex and landing angle. The code claims driver, 7 iron and PW
  within about 2% of carry: verify, and extend to all 12 rows and the three LPGA rows (the slower end matters: Power 1
  is 10% slower than the base clubs).
- **Step size.** The game steps at 1/120 s. Run the table at 1/60, 1/240 and 1/1000: how much does carry move? Do the
  preview (`stockFlightOf`) and the live shot (`updateShot`) use the same step, so the preview equals the shot?
- **Spin.** Spin decays with a 25 s time constant; `sideLift` raises lift by 1/cos(tilt) for a curving ball. What does
  a 20° and a 40° axis tilt do to carry and to sideways movement? Is a big hook or slice believable, or does it fly
  further than a straight shot?
- **Wind.** For driver, 7 iron and wedge: 5, 10 and 20 mph head, tail and cross. Compare with the rules of thumb.
  The wind strengthens with height (`shear`, 0.5× near the ground to 1.25× high up): is a low stinger really less
  affected than a high wedge, as it should be? Check the sign convention on a mirrored (resort) hole.
- **First bounce.** `e` and `keep` depend on landing speed, angle and spin. Table the first bounce and total roll for
  each club on fairway, green, rough and sand. Can `keep` go negative (spin-back), and when? Does a wedge back up on a
  green, and a driver run about 20–30 yds on a fairway?
- **Roll.** `rollDecel` is one number scaled by the surface. Draws roll further and fades shorter (`shapeRoll`,
  `shapeKeep`): how many yards for each club, and is that the "draws roll, fades stop" the user asked for?
- **Elevated or teed starts** (`y0`), the 30 s cap, the stop speed (0.15 m/s), and bounces that never end.
- **Trees.** A hit keeps 12–37% of pace and turns up to about 140°. Is that fair or brutal? Can a ball pass through
  the trunk between two steps at driver speed?

## S4 — The base bag · Opus 5.5 · high

**Goal:** the 14 base clubs (the test round's bag) produce benchmark numbers, with sensible gaps.

Check, using `stockShot` / `stockFlightOf` at all stats 5:
- **One table:** each club's club speed, ball speed, smash, launch, spin, apex, landing angle, carry and total, next
  to the benchmark row (the hybrids against 5 wood / hybrid / 3 iron). Flag anything more than about 3% off in carry
  or 10% off in spin or height.
- **Gaps:** carry gap between each neighbouring pair. Are any two clubs within 5 yds, or more than 20 apart? Where do
  the 2 and 3 hybrids sit against the 4 iron?
- **The wedges** (GW 50°, SW 55°, LW 60°): the benchmark stops at PW. Are their full-swing carries, heights and spins
  believable (a tour sand wedge full swing is roughly 100–115 yds)? The smash floor (1.10) is reached by about 57°.
- **The comparison club** ("7 Iron · Game Improvement"): is it still used anywhere, and does it play as described?
- **Per-club extras:** `work`, `sweet`, `floor`, `gear`, `bulge`, `curve`, `rescue`, `bounce`. For each, one line on
  what it does (measured) and whether the value fits the club. `curve` runs from 0.62 (4 iron) to 1.8 (wedges):
  does shaping feel consistent through the bag, as its comment intends?
- **Power 1 and Power 10:** the same table at both ends (0.90× and 1.10× club speed). Is a beginner's bag believable
  as an amateur's, and a maxed player's as a long hitter's?

## S5 — The club catalogue · Opus 5.5 · high

**Goal:** each career model plays like its description, costs what it's worth, and no set has gaps or overlaps that a
real set wouldn't.

Read: `CLUB_MODELS`, `modelMods`, `applyCareerClubs`, the putters added to `PUTTERS`, how fairway woods and hybrids
get their models in the shop, `shopStats`, and the club tables in `CAMPAIGN_PLAN.md`.

Check:
- **A full-bag table per iron model** (4 iron to PW with that model applied): loft, carry, apex, spin, landing angle,
  sweet spot, and the 2-sigma dispersion at Dexterity 2 and 5. Strong-lofted sets take up to 6° off the loft (80% of
  that on the 4 and 5 irons): does a game-improvement 4 iron now out-carry the 3 hybrid or even the 2 hybrid? Does a
  game-improvement PW leave a hole before the gap wedge? (A lead spotted while planning.)
- **Does each model match its note?** "The longest; lands flattest and runs", "the most accurate GI", "shapes
  anything, the best stinger", "spins too much, a bit short", "leans to a fade, unforgiving". Measure the claim.
- **Trade-offs, not a ladder.** Forgiving sets should give up workability and stopping power; blades the reverse. Is
  any model simply better than another at the same or a lower price? Is any model never worth buying?
- **The starter bag** (worn AP1 irons, XR 16 driver, XR hybrid, SM6 wedge, White Hot putter): `consist`, `groove`,
  `lieBias` and `offset`. How much worse is it, in strokes or yards of dispersion, than a new set? Is the first
  upgrade felt?
- **Luxury** (design direction 11): confirm no luxury model beats the best ordinary model on any measured number.
- **Drivers:** low-spin heads should be longer when centred and worse off-centre; forgiving heads the reverse.
  Measure carry at 0, 8 and 14 mm off-centre for each.
- **Wedges:** bounce in sand and heavy rough, `flopX`, spin and groove wear. **Putters:** `gate`, `pathGain`, `sweet`,
  `tempoZone`: what each does to a putt, and whether blade and mallet differ the way their names suggest.
- **Real-world sanity:** the lofts and characters are "reputation mapped onto the game, not measurements". Where a
  number contradicts the real club badly enough that an owner would object, say so. The plan marks some lofts "≈".

## S6 — Stats, lies, dispersion and difficulty · Opus 5.5 · high

**Goal:** the risk system (design directions 3, 8, 9 and 10) delivers what was asked, and the dispersion a player
sees is believable for their level.

Check, with a few thousand seeded shots per case and a realistic human swing (the wobble and miss values from S1):
- **Dispersion by club and Dexterity** (1, 2, 5, 8, 10): 2-sigma width and depth in yards. Compare Dexterity 5 with a
  good amateur and Dexterity 10 with a tour player (tour 7 iron: most shots within about 8–10 yds either side). At
  Dexterity 10 the baseline scatter is 8% of Dexterity 1: is the top end robotic?
- **Each ask, alone and stacked:** 105% and 110% backswing, 115% tempo, a full draw or fade, height ±1 and ±2, more or
  less spin, against the grain. Table the complexity number and the resulting dispersion. Is the compounding felt but
  survivable (direction 2: not a cliff)?
- **Power stat:** 1–10 gives 0.90–1.10× club speed. Yards per point by club; and its extra effect out of rough and
  sand (`lie.grabs`).
- **Composure and tilt:** the ladder (0.10, 0.55, 1.35, 2.30, then +1.0) times the Composure offset. What does each
  tilt level do to dispersion in yards? The path and strike are also multiplied when tilted: is tilt counted twice?
- **Perception:** what it changes in full shots (the lie read's band and bias) and whether a low value misleads by a
  believable amount.
- **Caddies:** each one's bonuses applied through `careerStats`: confirm they reach the swing.
- **Lies:** for each lie, the average and spread of carry, spin and direction for a wedge, 7 iron, hybrid and driver;
  the flier rate; the hybrid's "rescue" loft; a high-bounce wedge in sand. Then `clubFit`: for each lie, which clubs
  are fine, risky and near-impossible, and the mishit rate. Does "driver out of a bunker" behave as direction 9 asks?
- **Mishits:** how often TOPPED, FAT, BLADED, CHUNKED and FLIER happen in ordinary play at Dexterity 2 and 5, and how
  bad each is.

## S7 — Shot shaping, height and spin · Opus 5.5 · high

**Goal:** every control at address does something clear, proportionate and true to golf.

Read: `SHOT_SHAPES`, `solveShape`, `applyShot`, `refreshShotType`, `setHeight`, `setSpinCtl`, and the SHOT SHAPE,
SHAPING RANGE, HEIGHT and SPIN parts of `TUNE`.

Check:
- **The solved draw and fade for every club** (and at Dexterity 1, 5 and 10): the face and stance chosen, the curve in
  yards, where it starts, where it finishes (it should come back to the aim line), carry and total against the
  straight shot, launch and spin differences. Compare with the comment's own targets (driver draw about 10 yds longer
  in total; irons 7–9 yds; a draw lower with less spin).
- **Does the solver ever fail?** A club, lie, height or spin where the face clamps (±10°), the stance clamps (±15°),
  or the ball doesn't come back.
- **A hand-swung shape** (mouse path ±5° and ±10° with a square setup) against the preset: similar result?
- **Height:** Low 2 to High 2 for each club: launch, apex, spin, carry, roll. Is the "stinger" a useful shot? Does the
  loft floor stop a low driver doing anything?
- **Spin control:** More and Less for each club, on fairway and from rough (`spinCap`): the change in spin, launch,
  carry and stopping distance. The comment says "next to nothing for the driver, full for the wedges".
- **Ball position, face and stance tweaks by hand:** the size of one step of each.
- **Against the grain** (high draw, low fade): is the extra difficulty noticeable and correctly signed?
- **Shot locks in a career** (draw, fade, stinger, high, spin, flop learned from the coach): can a locked shot still
  be produced by hand tweaks or by the swing path? Is that intended?

## S8 — Chipping and putting · Opus 5.5 · high

**Goal:** the short game behaves like the long game's rules scaled down, and the reads are honest.

Read: `CHIP`, `CHIP_TYPES`, `createChip`, `stepChip`, `chipTable`, `readChipMarker`, `launchChip`; `PUTT`, `PUTTERS`,
`analyzePutt`, `computePutt`, `stepPutt`, `readMarker`; `CHIPPING_PLAN.md` and `PUTTING_PLAN.md`.

Check:
- **Chips:** for each wedge and shot type (low runner, stock, high soft, flop): carry, roll and total against
  backswing; the carry-to-roll ratio (a real stock chip with a sand wedge is roughly 1 part carry to 1 part roll, a
  low runner more roll, a flop mostly carry). Landing on each surface (`CHIP.surf`). The check from leftover backspin.
- **The landing marker's read** against where the ball lands, at Perception 1, 5 and 10 and from each lie.
- **The flop:** its difficulty, the hardpan blade, wide-soled wedges (`flopX`).
- **The hand-off at 45 yds** (`CHIP.maxYd`): a 44 yd chip and a 46 yd full swing with the same club should give
  similar results. Do they?
- **Putts:** distance against stroke length on flat greens at Stimp 9, 11.5 and 13; the break on a 1%, 2% and 4% side
  slope at 10 and 30 ft against a simple physics estimate; uphill and downhill pace; the capture speed at the cup
  (a real cup holds a centred ball up to about 1.6 m/s, far less at the edge); lip-outs.
- **Putter differences** and the gate; tempo zones; the knee-knocker shake when tilted.
- **Design direction 13:** the marker ignores slope and Perception sets the accuracy. Confirm it's delivered.

## S9 — What the player is shown vs what happens · Opus 5.5 · high

**Goal:** every number and picture the game shows before and after a shot matches the shot.

Check:
- **The bag's yardages** (`renderBag`, `stockShot`): for each club, the listed carry and total against the average of
  200 real centred swings (through `debugSwing`) at the same setup. They should agree on a fairway lie.
- **The landing ellipse on the minimap** (`landSpread`, `landArea`): it is built from 36 seeded shots with assumed
  human errors (`SPREAD`). Does about 85% of a realistic player's shots land inside it? Is it honest at Dexterity 1
  and 10, from rough, and when tilted?
- **The lie read** (`lieRead`): the band and bias against the true distribution from each lie.
- **The shape preview line** against the actual flight of a centred, straight-swung shot.
- **The backswing marks** (the partial-swing yardages on the swing overlay) against real partial swings.
- **After the shot:** the launch monitor and telemetry (club speed, ball speed, launch, spin, apex, carry, total,
  offline, face, path, face-to-path, strike) against the flight's own values. Units and signs: is "path +3" always
  in-to-out, "face −2" always closed, "offline" always right-positive?
- **The difficulty read-outs** (the complexity bar, "added risk", RISKY CLUB, the shot name): do they rise with real
  dispersion, and in proportion?
- **Wind arrows and the hole's wind** against the direction the ball actually drifts.

---

## Progress

| # | Section | Done | Findings | Fixed |
|---|---|---|---|---|
| S1 | The mouse swing | ✅ 2026-11-20 | 12 (2 high, 6 medium, 4 low) | S1.1–S1.10, S1.12 (2026-11-20); S1.11 closed, kept as designed |
| S2 | Impact | ✅ 2026-11-20 | 11 (4 medium, 7 low) | S2.1–S2.5, S2.7–S2.11 (2026-11-20); S2.6 closed, range-only by choice |
| S3 | Ball flight, wind, bounce and roll | ✅ 2026-11-20 | 6 (3 medium, 3 low) | S3.1–S3.5 (2026-11-20); S3.6 closed, resolved by S3.1 |
| S4 | The base bag | ✅ 2026-11-20 | 5 (2 medium, 3 low) | S4.1, S4.2, S4.5 (2026-11-20); S4.3 by S3.1's speeds |
| S5 | The club catalogue | ✅ 2026-11-20 | 9 (1 high, 6 medium, 2 low) | S5.1–S5.5, S5.7–S5.9 (2026-11-20); S5.6 mostly |
| S6 | Stats, lies, dispersion and difficulty | ✅ 2026-11-20 | 5 (3 medium, 2 low); S2.1 raised to high | S6.1–S6.4 (2026-11-20; S6.4 re-done as a beginner-to-tour scale); S6.5 closed, kept as designed |
| S7 | Shot shaping, height and spin | ✅ 2026-11-20 | 5 (2 medium, 3 low) | S7.1–S7.4 (2026-11-20); S7.5 closed, resolved by S2.4 / S2.7 |
| S8 | Chipping and putting | ✅ 2026-11-20 | 3 (2 medium, 1 low) | S8.1–S8.3, part-swing spin (2026-11-20) |
| S9 | What the player is shown vs what happens | ✅ 2026-11-20 | 3 (2 medium, 1 low) | S9.1–S9.3 (2026-11-20) |
