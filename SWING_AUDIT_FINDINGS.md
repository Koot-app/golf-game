# Swing, ball flight and club audit — findings

Findings from the audit described in `SWING_AUDIT_PLAN.md`. Each section is added when it is run. Nothing here has
been fixed unless an entry says so.

## Section S1 — The mouse swing (2026-11-20, Fable 5.2)

**Summary.** The swing reader itself is sound: the same stroke gives the same numbers at any mouse report rate, the
path and miss readings are accurate, and all four design directions checked here are delivered. The problems are
around it: how fast the hand has to move, what the default settings mean on a real mouse, and the limits on
calibration.

**How it was tested.** `tools/test/swing-input.js` builds hand strokes in continuous time, samples them the way a
mouse reports (whole counts, a chosen report rate, timing jitter), and feeds them through the game's real input code
(`swingSample`, or `onPointerMove` with its spike filter). `analyzeSwing` then reads them back. Practice mode is on,
so no ball is launched. Every table below is its output.

**What could not be tested here:** a real pointer lock, a real browser's coalesced events, a real OS acceleration
curve, and a real human hand. Where a finding rests on one of those, it says so. `tools/test/swing-mylog.js` is a
console snippet that logs your own swings, to replace my estimates of a human hand with real numbers (see the end of
this section).

**Test hooks added** (the one edit to `index.html` the plan allows): `analyzeSwing`, `computeImpact`, `swingSample`,
`beginSwing`, `endSwing`, `onPointerMove`, `isSpike`, `tempoTarget`, `powerFromBackswing`, `powerFromTempo`, `LIES`,
`SLOPES`, `AERO`, `windVector`, `clubFit`, `solveShape`, `powerMult`, `runChip`, `computePutt`, `analyzePutt` and
`CADDIES` are now on `window.__golf`. Later sections don't need to add them again.

| # | Severity | Kind | Finding | Fix size |
|---|---|---|---|---|
| S1.1 | High | Feel / balance | The downswing can be traced as slowly as you like and still be full power | S–M |
| S1.2 | High | Feel | The default calibration expects a tiny, slow stroke, and nothing tells a new player to calibrate | S |
| S1.3 | Medium | Bug | Calibration's limits are too low for high-DPI mice, and the spike filter distorts the calibrating swing | S |
| S1.4 | Medium | Bug | The spike filter can drop real, fast hand movement | S |
| S1.5 | Medium | Feel / balance | Any backswing past 110% reads exactly 110%, so over-swinging gives perfectly repeatable distance | S |
| S1.6 | Medium | Feel | A 2 mm nudge of the mouse fires a real stroke | S |
| S1.7 | Medium | Realism | A smooth arc of the hand is read as wobble | S |
| S1.8 | Medium | Bug (modelled) | Where the browser can't give raw mouse movement, distance depends on how fast you take the club back | S |
| S1.9 | Low | Feel | A backswing slower than 1 second is cut short | S |
| S1.10 | Low | Bug | After the backswing clock locks, an angled swing misses the ball | S |
| S1.11 | Low | Realism | The path is the average direction of the whole downswing, not the direction through the ball | — |
| S1.12 | Low | Test tool | `debugSwing` doesn't deliver the tempo it's asked for, and leaves the swing active | S |

### S1.1 [High, feel / balance] The downswing can be traced as slowly as you like and still be full power
- **Where:** `analyzeSwing` (about line 7202): tempo is the mouse speed over the last 24 ms before the ball
  (`speedWindowMs`). `swingSample`: the backswing has a 1-second clock, the downswing has none. The calibration's
  Speed slider goes down to 0.5 counts/ms.
- **Measured:** a 7 iron, 100% backswing, default calibration (full tempo is 5.76 counts/ms):

  | The downswing | Time | Tempo read | Flags | Club speed |
  |---|---|---|---|---|
  | Steady at full tempo | 0.1 s | 100% | — | ×1.000 |
  | Crawl at 10% tempo, full tempo for the last 20% of the way | 1.2 s | 100% | — | ×1.000 |
  | Crawl at 10%, full tempo for the last 10% | 1.3 s | 60% | — | ×0.964 |
  | Crawl at 5%, then 70% tempo for the last 10% | 2.5 s | 51% | — | ×0.929 |
  | Full tempo, easing to 50% for the last 20% (quitting on it) | 0.2 s | 50% | DECEL | ×0.919 |

  And with the Speed slider at its minimum (0.5 counts/ms, which is 1.6 cm a second on an 800 DPI mouse): a downswing
  taking **1.6 seconds** at that crawl reads `backswing 100%, tempo 100%, club speed ×1.000, flags none`. At two-thirds
  of that speed (2.4 seconds), still ×0.971.
- **Expected:** design direction 1 asks for an easy, forgiving downswing. It doesn't ask for no downswing at all. The
  swing's accuracy skill (wobble, the path, passing through the ball) only exists if the hand is moving at some speed.
- **Why it matters:**
  - A patient player traces the line slowly, flicks the last fifth, and gets full power with almost no wobble, an
    exact path and a clean contact. The only scatter left is the game's own random part.
  - Calibration is a local setting each player picks. In a friend challenge for money, one player can set "full tempo"
    to a crawl and the other can't know.
  - Related: the clock rushes the backswing (1 second) while the downswing is unlimited, the reverse of a golf swing.
  - Related: you can also load 100%, come most of the way down, go back, and swing through from −600 counts. It still
    reads 100% backswing, and the path and wobble come mostly from the first pass.
- **Fix (S–M), options:**
  - A downswing clock: from the top, the ball must be reached within a set multiple of the calibrated time (say
    3×), or it reads as a decel.
  - Read tempo from the whole downswing (its length divided by its time) as well as the last 24 ms, and use the
    lower.
  - Tie the Speed slider's minimum to the Length, so a full downswing can't be calibrated to take more than about
    half a second.

  **What else it would move:** every player's tempo reading (re-check the forgiving band, table 9b below), the decel
  rule, partial shots (their full tempo scales with the square root of the backswing), and `debugSwing`.

### S1.2 [High, feel] The default calibration expects a tiny, slow stroke, and nothing tells a new player to calibrate
- **Where:** `state.cal` default `{ swingPx: 800, vTarget: 5.76 }` (about line 7884); calibration lives in a collapsed
  "⚙ Settings · swing calibration" fold in the side panel. No tip, toast or first-run step mentions it.
- **Measured:** what the default means in hand travel:

  | Mouse DPI | 100% backswing | The ring's free radius | 100% tempo hand speed |
  |---|---|---|---|
  | 400 | 50.8 mm | ±1.78 mm | 36.5 cm/s |
  | 800 | 25.4 mm | ±0.89 mm | 18.3 cm/s |
  | 1,600 | 12.7 mm | ±0.44 mm | 9.1 cm/s |
  | 3,200 | 6.3 mm | ±0.22 mm | 4.6 cm/s |

  A natural stroke (my assumption: 40 mm back, passing the ball at 60 cm/s) on an uncalibrated mouse:

  | DPI | The game reads | Result |
  |---|---|---|
  | 400 | backswing 79%, tempo 115% | short, and flagged OVERSWING for tempo |
  | 800 | backswing 158% → capped at 110%, tempo 115% | the maximum over-swing, every time |
  | 1,600 | backswing 315% → 110%, tempo 115% | the same |

  The maximum over-swing carries a fixed risk: complexity 1.06 at Dexterity 5 and **1.61 at Dexterity 2** (a new
  career). At Dexterity 2 that adds up to ±8.9 mm of strike scatter and ±4.5° of face scatter to every shot.
- **Expected:** a first swing that feels like the player's own, or a clear step that makes it so.
- **Why it matters:** a new player either swings naturally and is told (by the result, not in words) that every shot
  is a wild over-swing, or learns to make a stroke of an inch or less. On a 1,600 DPI mouse the ring must pass within
  0.44 mm of the ball. Most will never open the Settings fold.
- **Fix (S):** the first time a player addresses the ball with no saved calibration, run the calibration step
  ("make one comfortable, full swing"), and repeat the offer in the caddie tips. **What else it would move:** nothing
  in the model; every player's own numbers.

### S1.3 [Medium, bug] Calibration's limits are too low for high-DPI mice, and the spike filter distorts the calibrating swing
- **Where:** `onImpact` (about line 9108): length clamped to 100–3,000 counts, speed to 0.5–30 counts/ms; the sliders
  have the same limits. `isSpike` uses the **old** calibration while the calibrating swing is made.
- **Measured:** the same natural stroke (40 mm, 60 cm/s), calibrating:

  | DPI | Reports a second | True length, speed | Calibrated to | Reports dropped |
  |---|---|---|---|---|
  | 800 | 1,000 or 125 | 1,260 counts, 18.1 c/ms | 1,260, 17.2 | 0 |
  | 1,600 | 1,000 | 2,520, 36.2 | 2,520, **30.0** (the limit) | 0 |
  | 1,600 | 125 | 2,520, 36.2 | 2,520, **23.6** | 2 |
  | 3,200 | 1,000 | 5,039, 72.3 | **3,000, 30.0** (both limits) | 0 |
  | 3,200 | 125 | 5,039, 72.3 | not calibrated: the swing never registers | 12 |

  In hand travel, the largest calibration allowed is 95 mm and 95 cm/s at 800 DPI, 48 mm and 48 cm/s at 1,600, and
  24 mm and 24 cm/s at 3,200.
- **Why it matters:** a player whose speed is clamped reads over 100% tempo on every normal swing, so every shot
  carries the over-tempo risk (complexity 0.36 at Dexterity 5, 0.55 at Dexterity 2). A 3,200 DPI player can't
  calibrate a comfortable swing at all.
- **Fix (S):** raise the limits (length to about 12,000 counts, speed to about 150 counts/ms) on the clamp and the
  sliders, and relax the spike filter while calibrating. **What else it would move:** nothing for players inside the
  old limits.

### S1.4 [Medium, bug] The spike filter can drop real, fast hand movement
- **Where:** `isSpike` (about line 9542): a report is dropped when it moves more than
  `max(120 counts, 6 × calibrated tempo × time since the last report)`.
- **Measured:** with the default calibration, that drops movement faster than 110 cm/s at 800 DPI, **55 cm/s at
  1,600 DPI** and 27 cm/s at 3,200 DPI when reports arrive once a frame. When they arrive at 1,000 a second, the
  120-count floor makes it far more lenient. In the table above, the 1,600 DPI stroke at 125 reports a second lost 6
  reports in play.
- **Why it matters:** each dropped report is hand travel the ring never makes, so the ring lags the hand: the
  downswing "doesn't get back to the ball", or tempo reads low. The filter exists to remove one fake jump when the
  pointer lock engages; a brisk real swing looks the same to it.
- **Not tested:** whether a real browser delivers reports once a frame or at the mouse's own rate. The code falls
  back to once a frame when the high-rate samples don't add up (`onPointerMove`).
- **Fix (S):** reject a jump only when it is an outlier against its neighbours (one report many times the size of
  the ones either side), or only in the first moments after the lock. **What else it would move:** nothing in the
  model.

### S1.5 [Medium, feel / balance] Any backswing past 110% reads exactly 110%
- **Where:** `analyzeSwing`: `bs = min(1.10, bsRaw)`; `powerFromBackswing`.
- **Measured:** the hand's backswing → what the game reads: 100% → 100.0%, 105% → 105.0%, 110% → 110.0%, 120% →
  **110.0%**, 150% → **110.0%**. And the distance table (9a below): just under 100% is steep (driver 90% → 220 yds,
  100% → 265: about 4.5 yds per 1%; 7 iron about 2.2 yds per 1%), while past 100% it is flat (driver 110% → 277).
- **Why it matters:** stopping the backswing at exactly 100% is a real skill, and being 5% short costs a driver
  about 22 yds. Pulling back "too far" needs no skill and gives the same distance every time. The price is a fixed
  risk: complexity 0.52 at Dexterity 5, 0.25 at Dexterity 8 and **0.07 at Dexterity 10**. For a high-Dexterity player
  the best full swing is always "yank it back past the stop".
- **Expected:** design direction 2 (past 100% is only incrementally punishing) is delivered. This is its side
  effect: the cap also removes the one distance skill the swing has.
- **Fix (S), options:** let the risk keep rising past 110% while the speed stays capped; or make the over-swing risk
  less forgiven by Dexterity than the other asks. **What else it would move:** dispersion at the top end (S6).

### S1.6 [Medium, feel] A 2 mm nudge of the mouse fires a real stroke
- **Where:** `swingSample`: a backswing of `minBackswing` (8% = 64 counts at the default) that comes back to the ball
  is a shot.
- **Measured:**
  - a waggle of 20 counts left then right: no shot (correctly ignored);
  - 70 counts left then right: **FIRED, backswing 8.8%**; 100 counts: FIRED, 12.5%.

  64 counts is 2.0 mm of hand travel at 800 DPI and 1.0 mm at 1,600. Where the ball goes:

  | Backswing | Driver (carry / total yds) | 7 Iron | Sand Wedge |
  |---|---|---|---|
  | 8% | 1.2 / 4.2 | 0.8 / 2.3 | 0.6 / 1.0 |
  | 12.5% | 2.6 / 7.9 | 1.9 / 4.6 | 1.4 / 2.3 |
  | 20% | 6.4 / 19.2 | 5.0 / 11.2 | 3.7 / 5.5 |
- **Why it matters:** with the button held, a small adjustment of the hand is a stroke on the card, in a match for
  money. No full shot under about 20% is useful.
- **Fix (S):** for a full swing, treat a backswing under about 20% that returns to the ball as a cancelled waggle
  (back to "ready", as the smaller one already is). Keep the low limit for chips, where short backswings are real
  shots. **What else it would move:** the shortest chip (S8).

### S1.7 [Medium, realism] A smooth arc of the hand is read as wobble
- **Where:** `analyzeSwing`: wobble (`sigma`) is the scatter of the downswing around a **straight** line.
- **Measured:** a perfectly smooth downswing that bulges off its line:

  | Bulge at mid-stroke (% of the swing length) | Wobble read | Strike off-centre at Dexterity 1 / 5 / 10 |
  |---|---|---|
  | 1% | 0.80 px | 1.2 / 0.8 / 0.4 mm |
  | 2% | 1.59 px | 2.3 / 1.6 / 0.7 mm |
  | 4% | 3.15 px | 4.6 / 3.2 / 1.4 mm |
  | 6% | 4.78 px | 6.9 / 4.8 / 2.2 mm |
- **Expected:** a hand pivots at the wrist or elbow, so a mouse stroke is an arc. By geometry the bulge is the
  stroke length divided by 8 times the pivot radius: about 2% for a 25 mm stroke from the wrist (150 mm), 5% for a
  60 mm stroke, 8% for a 95 mm stroke. (An estimate, not a measurement.)
- **Why it matters:** an arc is repeatable, not shaky, but it costs strike quality, and a longer calibrated swing
  costs more. The irons' sweet spot is 5 mm.
- **Fix (S):** take the wobble around a fitted curve (a quadratic), so only shake counts. **What else it would
  move:** every player's wobble falls, so strike scatter and dispersion fall (S6), and the landing ellipse's assumed
  wobble (`SPREAD.wobble`) should fall with it.

### S1.8 [Medium, bug (modelled)] Without raw mouse movement, distance depends on how fast you take the club back
- **Where:** `beginSwing` asks for a pointer lock with `unadjustedMovement`, and falls back to an ordinary lock if
  the browser refuses. Nothing records or shows which one it got.
- **Measured (a stand-in acceleration curve, 1× when slow rising to 2.5× when fast; real curves differ):** the hand
  travels the same 800 raw counts back each time:

  | Backswing time | Backswing read | Where the hand is when the game says "impact" |
  |---|---|---|
  | 0.3 s | 138% → 110% | 93% of the way back to the ball |
  | 0.5 s | 117% → 110% | 80% |
  | 0.8 s | 105% | 68% |
  | 1.0 s | 102% | 66% |
- **Expected:** the same hand movement gives the same swing.
- **Not tested:** which browsers refuse. As far as I know, Chrome and Edge on Windows and macOS grant it, and
  Firefox, Safari and Chrome on Linux don't. Worth checking on the browsers your friends use.
- **Fix (S):** remember which lock was granted and say so in Settings ("this browser speeds up fast mouse movement:
  turn off the system's pointer acceleration, or use Chrome or Edge"). **What else it would move:** nothing.

### S1.9 [Low, feel] A backswing slower than 1 second is cut short
- **Where:** `TUNE.backswingTimeMs` (1,000); `swingSample`.
- **Measured:** a full 100% backswing taken in 0.5 s reads 100%; 1.1 s → 99.8%; 1.3 s → **93.3%**; 1.6 s → 77.8%;
  2.0 s → 59.6%. A pause at the top after a quick backswing is fine (100%). The player is told: the ring turns amber
  and shows "BACKSWING LOCKED".
- **Why it matters:** 93% costs a driver about 30 yds. Whether 1 second is the right limit is your call; it reads as
  intended. A stale comment in `drawSwingFx` says the arc "empties over 1.5 s".

### S1.10 [Low, bug] After the backswing clock locks, an angled swing misses the ball
- **Where:** `swingSample`: once locked, `x` is frozen at the top but `y` keeps following the hand.
- **Measured:** a 10° in-to-out stroke with a 1.6 s backswing: path read 9.52° (not 10), wobble 1.62 px (not 0), and
  **miss −3.8%** of the swing length, just outside the ring's free 3.5%. At 1.3 s: miss −1.1%. A straight stroke is
  unaffected.
- **Fix (S):** freeze `y` with `x` while the hand is beyond the locked top.

### S1.11 [Low, realism] The path is the average direction of the whole downswing
- **Measured:** a stroke that starts 8° out-to-in at the top and is square at the ball reads **−4.02°**; square at
  the top and 8° in-to-out at the ball reads +4.02°; 6° one way then 6° the other reads 0.00° (with 2.1 px of
  wobble).
- **Expected:** in golf the path is the club's direction through the ball. For a mouse the average is steadier and
  easier to control, so this may be the better choice. Noted, not a recommendation.

### S1.12 [Low, test tool] `debugSwing` doesn't deliver the tempo it's asked for
- **Measured:** asked for tempo 1.0 it reads 95.0% (93.9% at a half swing, 90.0% at a quarter); asked for 1.15 it
  reads 109.3%. A `wobble` of 10 also adds 0.76° of path. It leaves `swing.active` true, so the next call returns
  null until the caller sets it false.
- **Why it matters:** only for tests. The 5% is the speed window, the same for a real hand. **For later sections:**
  call `computeImpact` directly with exact swing numbers; use `debugSwing` only to exercise the input path.

### Checked and fine
- **Report-rate independence.** One stroke (100% backswing, 4° path, a 6-count wobble) at 1,000 to 30 reports a
  second, with and without ±40% timing jitter:

  | Reports/s | Backswing % | Tempo % | Path ° | Wobble px |
  |---|---|---|---|---|
  | 1,000 | 100.0 | 95.1–95.9 | 4.43–4.44 | 1.10–1.13 |
  | 125 | 100.0 | 93.8–95.9 | 4.42–4.47 | 1.07–1.12 |
  | 60 | 99.9–100.0 | 91.7–96.0 | 4.40–4.49 | 1.02–1.09 |
  | 30 | 99.5–100.0 | 87.7–96.0 | 4.34–4.49 | 0.89–1.06 |

  The spread at 30 a second costs under 0.5% of club speed, because tempo is flat from 65% to 100%.
- **Tempo reads about 4% under the hand's true speed at the ball** (it averages the last 24 ms of an accelerating
  stroke). Harmless, and calibration records it the same way.
- **The path angle** of a straight stroke: 2° → 1.99°, 5° → 5.01°, 10° → 10.00°, 14° → 13.98°, 20° → 15.00° (the
  clamp).
- **The top of the swing:** a 300 ms pause, a 40-count bounce at the top and a double pump all read 100%.
- **Design direction 1** (backswing sets distance; the downswing is forgiving), carry in yards, all stats 5:

  | Backswing | Driver | 7 Iron | Sand Wedge | | Tempo | Driver | 7 Iron | Sand Wedge |
  |---|---|---|---|---|---|---|---|---|
  | 25% | 14 | 12 | 8 | | 30% | 130 | 102 | 57 |
  | 50% | 62 | 51 | 31 | | 50% | 230 | 159 | 86 |
  | 75% | 151 | 116 | 64 | | 65% | 252 | 169 | 93 |
  | 90% | 220 | 154 | 84 | | 80% | 257 | 172 | 94 |
  | 100% | 265 | 176 | 96 | | 100% | 265 | 176 | 96 |
  | 110% | 277 | 182 | 100 | | 115% | 271 | 179 | 98 |

  Distance is far from linear in backswing (half a backswing is about a quarter to a third of the distance). The
  overlay's yardage marks show this, so it is a feel note for S2, not a finding.
- **Design direction 2** (past 100% is incremental): 110% backswing and 115% tempo together give a 7 iron 185 yds,
  105.1% of stock, for an added risk of 1.02.
- **Design direction 6** (the ring through the ball, penalised by degree): the contact factor is ×1.00 up to a 3.5%
  miss, ×1.17 at 5%, ×1.51 at 8%, ×1.97 at 12%, ×3.00 from 21%. A straight-back, 5°-down stroke misses by 8.8%, as
  that direction's known side effect.
- **Design direction 7** (down-and-right = draw): mouse +5° gives path +5.0°, starts 1.3° right, spin axis −11.5°,
  finishes 16.6 yds left. Mouse −5° mirrors it and finishes 14.6 yds right.

### A human hand: estimates, and how to replace them
S6 needs typical human values for backswing repeatability, path, wobble and miss. I couldn't measure a hand, so:
- The game's own assumption (`SPREAD`, used for the minimap ellipse): backswing ±5%, path ±2.4°, wobble 0–2.5 px,
  miss 0.
- My estimate: wobble 1–3 px from shake on a short stroke, plus 1.5–5 px from the arc (S1.7) on longer ones; miss
  ±1–3% of the swing length, not zero.
- **To get real numbers:** paste `tools/test/swing-mylog.js` into the browser console on the game and hit about 20
  full swings. It prints the average and spread of each number. Give the last line to the S6 session.

### Noticed for later
- **S2:** distance against backswing is steep (table above); `debugSwing` and the bag's backswing marks assume it.
- **S2:** the mouse path is multiplied by the club's `work` (a game-improvement iron turns a 5° stroke into about
  2°).
- **S6:** the over-swing complexity by Dexterity (1.79 / 1.61 / 1.06 / 0.52 / 0.15 at Dexterity 1 / 2 / 5 / 8 / 10 for
  110% + 115%).
- **Not testable headless:** movement between the click and the pointer lock engaging is read as ordinary
  (accelerated) movement, and the first 45 ms after the lock is dropped.
