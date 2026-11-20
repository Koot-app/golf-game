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
- **✅ Fixed 2026-11-20:** `analyzeSwing` also reads tempo from the whole downswing, and uses the lower reading. That
  is its average speed from when the club starts down (a pause at the top doesn't count) to the ball, against
  `TUNE.downAvgShare` (40%) of full tempo. An ordinary accelerating swing averages about half its impact speed, so it
  reads above 100% and its impact reading stands. Measured (`tools/test/swing-fix6.js`, and section 10 of
  `swing-input.js`):

  | The downswing | Tempo read: before → after | Club speed: before → after |
  |---|---|---|
  | An ordinary accelerating swing (with or without a 300 ms pause at the top) | 96% → 96% | ×0.996 → ×0.996 |
  | A smooth swing 25% slower | 72% → 72% | ×0.976 → ×0.976 |
  | Crawl at 10%, full tempo for the last 20% | **100% → 31%** | ×1.000 → ×0.711 |
  | Crawl at 10%, full tempo for the last 10% | 60% → 28% | ×0.964 → ×0.662 |
  | Crawl at 5%, then 70% for the last 10% | 51% → 14% | ×0.929 → ×0.394 |
  | Crawl at 10% all the way | 10% → 10% | ×0.308 → ×0.308 |

  The telemetry's tempo shows the lower reading, so the player sees why. A tip says it: "a slow trace with a flick at
  the end reads as a crawl and comes up short". Partial swings and chips use the same rule (their full tempo already
  scales with the backswing). Putts keep their own rhythm reading.
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
- **✅ Fixed 2026-11-20:** the first full swing made on a computer with no saved calibration sets the calibration
  instead of hitting the ball. It's offered once (`golfCalOffered` in local storage), only on a real mouse swing, and
  not on a chip or a putt. Measured in a fresh browser profile (`tools/test/swing-fix6.js`):
  - **Mouse down:** calibration arms and the game says "First, your swing: make one comfortable, FULL swing: the game
    learns its length and speed. This one doesn't hit the ball."
  - **A natural stroke** (1,260 counts back): sets 100% to 1,260 counts and 16.6 counts/ms, launches no ball, and says
    "Swing set: that swing is now 100%. Swing again to play. (⚙ Settings → Calibrate to redo it)".
  - **The next mouse down:** an ordinary swing.

  The swing tips also point to ⚙ Settings → Calibrate, and say "not calibrated yet" until it's done. Moving either
  calibration slider counts as calibrating. S1.3 (calibration's limits for high-DPI mice) is still open: a 3,200 DPI
  player's first swing will clamp at 3,000 counts.
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
- **✅ Fixed 2026-11-20:** the limits are 12,000 counts and 150 counts/ms (`CAL_MAX`), on the calibrating clamp and the
  Settings sliders. While a calibrating swing is made, the spike filter judges it by the fastest calibration allowed.
  The same natural stroke, calibrating (section 7 of `swing-input.js`):

  | DPI, reports a second | Before | After |
  |---|---|---|
  | 800, 1,000 or 125 | 1,260, 17.2 | 1,260, 17.2 |
  | 1,600, 1,000 | 2,520, **30.0** (the limit) | 2,520, 34.3 |
  | 1,600, 125 | 2,520, 23.6 (2 dropped) | 2,520, 34.2 (none dropped) |
  | 3,200, 1,000 | 3,000, 30.0 (both limits) | 5,040, 68.7 |
  | 3,200, 125 | **not calibrated** (12 dropped) | 5,040, 68.4 (none dropped) |

  This also lets S1.2's first-swing step work on any mouse. Before calibrating, a 3,200 DPI mouse's ordinary swing
  at 125 reports a second still doesn't fire; that is S1.4, still open.
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
- **✅ Fixed 2026-11-20:** past the old size limit, a report is now dropped only if it is an outlier. That means more than
  8× the rate of the last 3 reports (floored at the calibrated tempo), or faster than 450 counts/ms, which no hand
  reaches (`SPIKE`). The 45 ms after the lock engages are still dropped. A natural stroke (40 mm back, through at
  60 cm/s, default calibration) through the real `onPointerMove`, measured by `tools/test/swing-fix8.js`:
  - **800, 1,600 and 3,200 DPI, at 1,000, 125 and 60 reports a second:** it fires every time and drops nothing. At
    3,200 DPI and 125 a second it used to drop 12 reports and never fire; at 1,600 and 125 it dropped 6.
  - **A fake 2,000-count jump in the middle of the backswing** (800 DPI, 125 Hz): 1 report dropped, and the backswing
    reads the same as the stroke without it.
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

## Section S2 — Impact (2026-11-20, Fable 5.2)

**Summary.** The impact model is coherent. Its launch numbers match the tour table, every input moves the outputs
in the right direction, and nothing clamps on a fairway lie. No high-severity findings. The four medium ones are a
cliff in the hardpan rule, spin that stacks to twice a tour wedge's, a height level that costs risk and does
nothing on some clubs, and a `work` value that is applied twice.

**How it was tested.** `tools/test/swing-impact.js` and `swing-impact2.js` put exact swing numbers straight into
`computeImpact` (no mouse), one input changed at a time, and fly the result with the game's own flight. Where a
table says "with scatter", it used 4,000 seeded shots and the swing the game itself assumes for a player
(`SPREAD`: backswing 100% ± 5%, path ± 2.4°, wobble 0–2.5 px, the ring through the ball).

| # | Severity | Kind | Finding | Fix size |
|---|---|---|---|---|
| S2.1 | Medium | Feel / balance | On hardpan, a strike 3 mm off-centre is a cliff: about 1 shot in 4 is bladed or chunked at Dexterity 5 | S |
| S2.2 | Medium | Realism | Height and spin stack to 18,000–20,000 rpm on a wedge | S |
| S2.3 | Medium | Bug | Low 2 does nothing more than Low 1 on high-floor clubs, but costs more than twice the risk | S |
| S2.4 | Medium | Feel / balance | A club's `work` is applied twice to a mouse path | S |
| S2.5 | Low | Bug | A lob wedge loses no ball speed however far off-centre it is struck | S |
| S2.6 | Low | Unfinished | Slope lies exist only on the range; every shot on a hole is flat | M |
| S2.7 | Low | Realism | The driver curves about a third more than physics for the same face error; long irons a third less | S |
| S2.8 | Low | Realism | An iron's toe or heel hit pushes and curves the same way, about twice a real one | S |
| S2.9 | Low | Realism | The ball starts 75% toward the face with every club (a driver is nearer 85%) | S |
| S2.10 | Low | Realism | Spin follows the backswing but not the Power stat | S |
| S2.11 | Low | Bug | The no-scatter preview leaves out a used club's bent lie | S |

### S2.1 [Medium → High after S6, feel / balance] On hardpan, a strike 3 mm off-centre is a cliff
- **✅ Fixed 2026-11-20:** the chance of a bladed or chunked shot now grows in a straight line from 0 at 3 mm to
  certain at 8 mm (`TUNE.hardpanMm`, `TUNE.hardpanFullMm`). At a set strike: 2.9 mm 1%, 4 mm 20%, 5.5 mm 49%, 7 mm 81%,
  8 mm 99%. With the human hand, a 7 iron off hardpan goes wrong 53 / 49 / 27 / 5 / 0% of the time at Dexterity 1 / 2
  / 5 / 8 / 10 (it was 75% at Dexterity 2 and 65% at 5). The flop's own hardpan rule (S8) is unchanged.
  `tools/test/swing-fix1.js` re-measures it.
- **Where:** `computeImpact` step 6 (about line 7395): `if (env.lie === 'hardpan' && (mm >= 3 || flopSkull))` sets ball
  speed to 70% and spin to 30%, then a coin flip makes it BLADED (launch × 0.45) or CHUNKED.
- **Measured:** a 7 iron off hardpan, no scatter:

  | Strike | Ball mph | Launch | Carry / total | |
  |---|---|---|---|---|
  | 2.9 mm | 118.0 | 16.5° | 167 / 172 | clean |
  | 3.1 mm | 85.1 | 19.0° | 104 / 124 | CHUNKED |
  | (bladed) | 85.1 | 7.6° | 64 / 98 | BLADED |

  How often, with scatter (4,000 shots each):

  | 7 iron off hardpan | Dexterity 1 | 2 | 5 | 8 | 10 |
  |---|---|---|---|---|---|
  | A perfectly steady hand (wobble 0) | 38% | 31% | 11% | 0% | 0% |
  | Wobble 1.25 px | 46% | 39% | 19% | 0% | 0% |
  | Wobble 2.5 px (the hand strays 1% of the swing) | 65% | 61% | 44% | 9% | 0% |
  | The game's assumed player (wobble 0–2.5) | — | 42% | 23% | — | — |

  The sand wedge is the same (39% at Dexterity 2, 19% at 5). A driver off hardpan is bladed or chunked about 75% of
  the time.
- **Expected:** a tight lie should raise the chance and the cost of a thin or fat shot by degree. Here 2.9 mm is a
  full shot and 3.1 mm loses 60 yds. On a fairway the same players average 1.6–2.4 mm off-centre, so 3 mm is an
  ordinary strike.
- **Why it matters:** hardpan reads on screen as a mild lie ("power 97%"), but for a new career it ruins 2 shots in
  5. From Dexterity 8 it never happens. Nothing between.
- **Fix (S):** ramp it: no effect under about 3 mm, the chance (or the loss) growing to its full size by about 8 mm.
  **What else it would move:** hardpan dispersion (S6), the flop-off-hardpan rule next to it (S8).

### S2.2 [Medium, realism] Height and spin stack to 18,000–20,000 rpm on a wedge
- **Where:** `computeImpact` step 2 and 10: `setupSpin = 1 + loftRaw × (0.2 / 3)` (each height level is ±20% spin, up
  to ×1.5) times `spinGain` (More spin: ×1.30 at full authority). Nothing caps the product.
- **Measured (stock swing, fairway):**

  | | Stock | More spin | High 2 | High 2 + More spin | + ball forward |
  |---|---|---|---|---|---|
  | 7 Iron | 7,000 | 8,400 | 9,800 | 11,760 | 12,600 |
  | Pitching Wedge | 9,200 | 11,960 | 12,880 | 16,744 | 17,940 |
  | Sand Wedge | 10,100 | 13,130 | 14,140 | 18,382 | 19,695 |
  | Lob Wedge | 10,500 | 13,650 | 14,700 | 19,110 | 20,475 |

  The sand wedge at 18,382 rpm carries 88 yds and finishes at 86 (it backs up 2 yds).
- **Expected:** a tour wedge off a clean lie tops out at about 11,000–12,000 rpm. Adding loft raises spin roughly in
  proportion to the spin loft: 3° more on a 7 iron is about +12%, not +20%.
- **Why it matters:** the launch monitor shows numbers no golfer has seen. (S3.4 found the ground effect is capped:
  past about 13,000 rpm the extra spin only shortens the carry, so this is a realism problem more than an exploit.)
- **Fix (S):** cap the total (for example the club's own spin × 1.35), or make a height level worth about 10% spin.
  **What else it would move:** the stopping power of high shots and the More-spin button (S7), spin-back on greens
  (S3), chip check (S8).

### S2.3 [Medium, bug] Low 2 does nothing more than Low 1 on high-floor clubs, but costs more than twice the risk
- **Where:** `computeImpact` step 2: `loftDelta = max(−9 × (1 − floor) / 0.5, loftRaw)`; `cx.height` is charged on the
  level asked for, not the loft actually changed.
- **Measured:** the comparison "7 Iron · Game Improvement" (floor 0.85):

  | Height | Loft asked | Loft applied | Spin × | Launch | Carry / total | Risk charged |
  |---|---|---|---|---|---|---|
  | Low 2 | −6° | **−2.7°** | 0.85 | 15.2° | 189 / 199 | **0.60** |
  | Low 1 | −3° | **−2.7°** | 0.85 | 15.2° | 189 / 199 | 0.25 |
  | Mid | 0 | 0 | 1.00 | 17.5° | 185 / 193 | 0 |

  The base 7 iron (floor 0.50) gets the full −6° (launch 11.3°, 183 / 197). The driver (0.70) gets −5.4°.
- **Why it matters:** floor 0.85 is on the Qi Max, JPX 925, Takomo and Beres irons, and 0.80 on the M2. With those
  sets Low 2 is the same shot as Low 1 for 2.4 times the risk. In a career, Low 2 is the "stinger" bought from the
  coach.
- **Expected:** the floor itself is intended (a forgiving head can't be flighted down). The charge for nothing isn't.
- **Fix (S):** charge the risk on the loft actually changed, and say "this club can't go lower" when a level adds
  nothing. **What else it would move:** nothing else.

### S2.4 [Medium, feel / balance] A club's `work` is applied twice to a mouse path
- **✅ Fixed 2026-11-20:** the mouse path is now the club path for every club, and `work` acts once, on the curve. This
  replaces S5.1's `pathWork` field, which covered career models only. A 5° in-to-out stroke with a square face, before →
  after (also under S3.1's new flight):

  | Club | Finishes left, before → after |
  |---|---|
  | Comparison GI 7 iron (work 0.45) | 1.2 → **5.2** yds |
  | Base 7 iron (work 1.0) | 16.6 → 14.7 |
  | Staff Model Blade 7 iron (work 1.15) | 23.7 → 17.1 |
  | Base driver (work 0.85) | 56 → 68 |
  | Base 3 hybrid (work 0.70) | 22 → 28 |
  | Base sand wedge (work 0.85) | 1.5 → 2.6 |

  With the minimap's assumed swing, the base bag's spread hardly moves (`swing-fix4.js`). At Dexterity 2: driver ±71
  (was ±75), 3 hybrid ±28 (±32), 7 iron ±16 (±17), PW ±10 (±9), sand wedge ±5.7 (±5.4).
- **Where:** `computeImpact` step 1: `path = stance + thetaMouse × club.work`; step 8: `axis = faceToPath × club.work ×
  …`. A shape made with the stance gets `work` once; one made with the mouse gets it twice.
- **Measured:** the same 7 iron with three `work` values:

  | `work` | A 5° mouse path | | A 5° closed stance | |
  |---|---|---|---|---|
  | | club path | finishes | club path | finishes |
  | 0.45 (a game-improvement head) | 2.25° | **1.2 yds** left | 5.00° | 4.9 yds left |
  | 1.00 (the base blade) | 5.00° | 16.6 yds left | 5.00° | 16.6 yds left |
  | 1.15 (a workable blade) | 5.75° | **24.7 yds** left | 5.00° | 19.8 yds left |
- **Why it matters:** with a game-improvement iron the direction of the stroke almost stops mattering: the same 5°
  error costs 1.2 yds, against 16.6 with the base blade and 24.7 with a workable one. That is a 20-to-1 spread
  between the catalogue's ends. A forgiving head should damp it, but this may be more than intended.
- **Fix (S):** apply `work` once (to the curve, not to the path). The 5° stroke would then cost about 5 / 17 / 20 yds.
  **What else it would move:** every model's forgiveness (S5), dispersion by model (S6), the minimap ellipse.

### S2.5 [Low, bug] A lob wedge loses no ball speed however far off-centre it is struck
- **Where:** `smash = max(1.10, 1.49 − 0.00012 × loft² − strikeLoss)`. At 60° the formula is already below the 1.10
  floor, so the strike loss can't lower it.
- **Measured:** ball speed lost at 14 mm off-centre: 7 iron −12.0%, pitching wedge −10.2%, sand wedge **−2.4%**, lob
  wedge **0.0%**.
- **Fix (S):** floor the centred smash, then take the strike loss off it.

### S2.6 [Low, unfinished] Slope lies exist only on the range
- **Where:** `SLOPES` and `computeImpact` handle five slopes. `setupNextShot` sets `state.slope = 'flat'` for every
  shot on a hole; the only way to choose one is the range panel's Slope list.
- **Measured (what they would do):** ball above feet: 7 iron finishes 6.0 yds left, driver 7.8; below feet: 8.7 and
  6.7 right (with a 2 mm toe strike); uphill: launch +3.8°; downhill: −3.9° and the driver loses 17 yds of carry.
- **Why it matters:** the holes have no slopes off the green, so this is a dormant feature, not a bug in play.

### S2.7 [Low, realism] The driver curves about a third more than physics for the same face error
- **Measured:** spin-axis tilt per degree of face-to-path, against the D-plane estimate (`atan(tan 1° / tan spin
  loft)`), and where a 2° open face on a straight path finishes:

  | Club | Game °/° | D-plane °/° | 2° open face finishes |
  |---|---|---|---|
  | Driver | 4.92 | 4.06 | 30.5 yds right |
  | 3 Wood | 2.77 | 3.75 | 21.7 |
  | 4 Iron | 2.04 | 3.29 | 15.5 |
  | 7 Iron | 1.70 | 2.21 | 10.3 |
  | 9 Iron | 1.78 | 1.77 | 7.7 |
  | Sand Wedge | 1.20 | 1.07 | 3.7 |
  | Lob Wedge | 1.17 | 0.90 | 2.8 |

  The driver tilts almost twice as much per degree as the 3 wood (physics: 8% more). The step comes from the per-club
  `curve` trims (0.75 on the 3 wood, 0.62–0.84 on the long irons) that the driver doesn't have.
- **Expected:** by the usual rules a 2° open driver face finishes about 23 yds right. Design direction 5 asks for
  dramatic shaping, so this is a note on the driver's face sensitivity (about 15 yds per degree), not on shaping.
- **For S3 and S6:** how the flight turns tilt into yards, and what this does to driver dispersion.

### S2.8 [Low, realism] An iron's toe or heel hit pushes and curves the same way
- **Measured:** 7 iron, toe hits: 4 mm → 6.0 yds right; 8 mm → 11.6 yds right, ball −4.0%, carry −10; 14 mm → 18.2 yds
  right, ball −12.0%, carry −30. The 4 iron at 14 mm: 29–31 yds offline. The face twists 0.3° per mm, the ball starts
  there, and the open face then adds fade on top.
- **Expected:** on a real iron the small gear effect partly cancels the twist, so the miss is about half this. The
  driver is right: a toe hit starts right and draws back (8 mm: starts 1.2° right, finishes 4.4 yds left).
- **Why it matters little:** on a fairway the average strike is 1.6–2.4 mm, worth 2–4 yds.

### S2.9 [Low, realism] The ball starts 75% toward the face with every club
- **Where:** `hla = 0.75 × face + 0.25 × path`. Measured 75% for all 14 clubs. A driver is nearer 85 / 15, so a
  square face on a 5° path starts 1.25° offline here and about 0.75° in reality.

### S2.10 [Low, realism] Spin follows the backswing but not the Power stat
- **Measured:** 7 iron at Power 1 / 5 / 10: club speed 81 / 90 / 99 mph, spin 7,000 / 7,000 / 7,000. A 75% backswing
  gives 5,250. More club speed makes more spin in reality (about 7,700 at 99 mph).

### S2.11 [Low, bug] The no-scatter preview leaves out a used club's bent lie
- **Measured:** a 7 iron with a bent lie of +1.5° and an offset of 0.9°: the preview's path is 0.00° and it finishes
  4.6 yds left (the offset only); real shots average a path of 1.53°. The bag's numbers and the shape line come from
  the preview. If the bent lie is meant to be a hidden flaw, this is as intended. **For S9.**

### Checked and fine
- **Impact numbers against the tour table** (stock swing, all stats 5; game / tour):

  | Club | Club mph | Ball mph | Smash | Launch ° | Spin rpm |
  |---|---|---|---|---|---|
  | Driver | 112 / 113 | 165 / 167 | 1.48 / 1.48 | 10.7 / 10.9 | 2,600 / 2,686 |
  | 3 Wood | 103 / 107 | 151 / 158 | 1.46 / 1.48 | 9.8 / 9.2 | 3,650 / 3,655 |
  | 2 Hybrid | 100 / 100 | 146 / 146 | 1.46 / 1.46 | 10.9 / 10.2 | 4,300 / 4,437 |
  | 3 Hybrid | 98 / 98 | 142 / 142 | 1.44 / 1.45 | 11.8 / 10.4 | 4,600 / 4,630 |
  | 4 Iron | 95 / 96 | 136 / 137 | 1.43 / 1.43 | 11.0 / 11.0 | 4,850 / 4,836 |
  | 5 Iron | 93 / 94 | 132 / 132 | 1.42 / 1.41 | 12.1 / 12.1 | 5,350 / 5,361 |
  | 6 Iron | 92 / 92 | 128 / 127 | 1.39 / 1.38 | 14.1 / 14.1 | 6,230 / 6,231 |
  | 7 Iron | 90 / 90 | 122 / 120 | 1.35 / 1.33 | 16.4 / 16.3 | 7,000 / 7,097 |
  | 8 Iron | 87 / 87 | 115 / 115 | 1.32 / 1.32 | 18.1 / 18.1 | 8,000 / 7,998 |
  | 9 Iron | 84 / 85 | 107 / 109 | 1.28 / 1.28 | 20.4 / 20.4 | 8,650 / 8,647 |
  | Pitching Wedge | 80 / 83 | 99 / 102 | 1.24 / 1.23 | 24.3 / 24.2 | 9,200 / 9,304 |

  (Hybrids against the tour "hybrid" and "3 iron" rows.) The smash and launch formulas hold. For S4: the 3 wood is
  4 mph and 7 mph of ball speed slow, and the pitching wedge 3 mph slow.
- **One input at a time** (7 iron; the full tables for driver, 7 iron and sand wedge are the script's output):

  | Change | Ball mph | Launch | Spin | Carry / total | Finishes |
  |---|---|---|---|---|---|
  | Stock | 121.6 | 16.4° | 7,000 | 176 / 182 | 0 |
  | Face 2° open | 121.6 | 16.7° | 7,264 | 175 / 180 | 10.3 right |
  | Stance 2° closed | 121.6 | 16.0° | 6,736 | 177 / 185 | 4.2 left |
  | Low 2 / High 2 | 121.6 | 11.3° / 21.5° | 4,200 / 9,800 | 183 / 197 · 165 / 167 | 0 |
  | More spin / less | 120.0 / 121.6 | 15.7° / 16.9° | 8,400 / 5,833 | 168 / 173 · 179 / 188 | 0 |
  | Decel (impact at 40% of peak) | 115.4 | 16.5° | 7,128 | 163 / 170 | 4.6 right |
  | Light / heavy rough | 110.4 / 93.0 | 17.3° / 15.3° | 5,074 / 3,584 | 160 / 170 · 122 / 137 | — |
  | Fairway / greenside bunker | 107.3 / 67.6 | 17.3° / 17.2° | 6,019 / 5,284 | 151 / 159 · 65 / 78 | — |
  | Power 1 / 10 | 109.5 / 133.8 | 16.4° | 7,000 | 152 / 160 · 197 / 203 | 0 |

  Every row moves the right way. Ball position ±1 is exactly one height level. Dexterity changes nothing without
  scatter, as it should. More and less spin do almost nothing to the driver (2,662 / 2,548 rpm), as the comment says.
- **Design direction 4** (draws roll, fades stop): driver fade 268 carry / 283 total (15 of roll), draw 259 / 291 (32
  of roll). 7 iron: 175 / 180 and 177 / 185.
- **Design direction 9** (clubs are limited by the lie): a driver from light rough carries 91 yds (265 teed), from
  heavy rough 36, and tops or fats 44–62% of the time; off the fairway it carries 210 with an 8% mishit chance. A
  7 iron from a greenside bunker carries 65 and is flagged RISKY CLUB.
- **Partial swings.** Speed and spin scale with the backswing and the launch angle holds:

  | Sand wedge backswing | Club mph | Ball mph | Spin | Carry / total |
  |---|---|---|---|---|
  | 50% | 37 | 41 | 5,050 | 31 / 37 |
  | 75% | 55 | 62 | 7,575 | 64 / 68 |
  | 100% | 73 | 82 | 10,100 | 96 / 98 |

  A half backswing is about a third of the distance (29–32% for all three clubs tested). Those are believable pitch
  numbers for that ball speed. `backswingExp` (now 1.0) is the knob if you want distance closer to linear.
- **A strong loft is treated consistently.** Static loft is read in four rules (smash, club fit, spin authority, the
  flop's minimum). Taking 6° off a 7 iron raises smash 1.351 → 1.396 and carry 176 → 183, drops spin authority 0.67 →
  0.47, and makes it a total misfit in a greenside bunker (0.57 → 1.00). The full JPX 925 changes give 187 / 194:
  about a club longer, as its note says. No double counting.
- **Clamps.** On a fairway nothing clamps at Dexterity 2 or 5. The launch limits are never reached on any lie. The
  spin-axis limit is only reached by misfit clubs (a driver from rough). The strike limit (±15 mm) is reached by a
  7 iron from heavy rough on 12% of shots at Dexterity 2 and 0.1% at Dexterity 5.
- **Off-centre driver:** up to 8 mm costs no ball speed (sweet spot 10 mm); 14 mm costs 4.9% and 13–21 yds of carry.
- **The no-scatter and live paths** differ only in scatter, apart from S2.11.
- **Decel** is mild: 5% of ball speed and a 3.4 mm strike.

### Noticed for later
- **S6:** tilt is applied in three places (the mouse path, the strike and the complexity). The same swing (path 3°,
  wobble 3 px) after 0 / 2 / 3 / 4 bad shots at Composure 5: path read 3.0° / 3.8° / 4.8° / 4.8°, strike 3.1 / 4.5 /
  6.6 / 7.7 mm, complexity 0.11 / 0.55 / 1.24 / 1.96. The first bad shot is nearly free (tilt 0.06).
- **S6:** from heavy rough at Dexterity 2 a 7 iron's average strike is 7.5 mm (the lie adds a fixed 3.9 mm).
- **S6:** the driver's baseline face scatter is 1.32× an iron's and its curve per degree is the highest in the bag.
- **S4:** the driver's longest setup is High 1 (275 / 290 against 265 / 286). The 3 wood carries 244 with 151 mph of
  ball speed (tour: 243 with 158).
- **S7:** Low 2 is the longest 7 iron (183 / 197). One height level is ±20% spin.

## Section S3 — Ball flight, wind, bounce and roll (2026-11-20, Fable 5.2)

**Summary.** The flight is accurate where the code says it was fitted (driver, 7 iron, pitching wedge), the wind is
believable, the bounce and roll numbers are sensible, and the time step doesn't matter. Three medium findings: the
clubs between the driver and the 7 iron fly far too high, a full shot's roll on a green ignores the green, and a badly
curving ball flies much further sideways than a real one. No high-severity findings.

**How it was tested.** `tools/test/swing-flight.js` puts ball speed, launch angle and spin straight into
`createFlight` and steps it with `stepFlight`, so the impact model plays no part unless a table says "stock shot".
`swing-trees.js` flies balls at a single tree. `swing-aero-fit.js` is a copy of the air physics in plain Node, used to
try other lift curves; it reproduces the game's carries exactly.

| # | Severity | Kind | Finding | Fix size |
|---|---|---|---|---|
| S3.1 | Medium | Realism | Fairway woods, hybrids and long irons fly 13–44% too high and 3–6% too far | M |
| S3.2 | Medium | Realism | A full shot's roll on a green ignores the green's speed and slope | M |
| S3.3 | Medium | Realism (deliberate) | A badly curving ball keeps its height, so big hooks and slices go far further sideways | S |
| S3.4 | Low | Realism | No shot backs up more than about 1.5 yds, whatever its spin | S |
| S3.5 | Low | Realism | A tree hit sends 1 ball in 4 back toward the player, and trees are solid to the ground | S |
| S3.6 | Low | Realism | Short irons land a few degrees shallow | — |

### S3.1 [Medium, realism] Fairway woods, hybrids and long irons fly 13–44% too high and 3–6% too far
- **✅ Fixed 2026-11-20:** new lift and drag in `AERO` / `airStep`, fitted by `tools/test/swing-aero-fit2.js`. It fits
  carry, apex, landing angle and a 10 mph crosswind together, with the drivers weighted triple. The lift now bends over
  gradually: `0.357·(1 − exp(−(S/0.201)^0.838))`. The drag is `0.186 + 0.124·S + 0.75·max(0, 1 − speed/70)^2.97`, and
  the spin decays over 22.5 s. Over the tour table's 15 rows, before → after:

  | Measure | Before | After |
  |---|---|---|
  | Carry error, typical (worst) | 3.4% (6.3%) | 3.0% (5.0%) |
  | Apex error, typical (worst) | **21% (44%)** | **4.2% (8.5%)** |
  | Landing angle error, typical (worst) | 2.5° (3.8°) | 1.9° (4.1°) |
  | 10 mph crosswind, tour driver / 7 iron | 16.6 / 13.2 yds | 15.6 / 14.0 yds |

  **The base bag's speeds were re-tuned** to keep their carries: driver 113 (was 112), 3 wood 105 (103), 2 / 3 hybrid
  101.5 / 99.2 (100 / 98), 4–9 irons +0.5 to +1.2 mph, PW 82 (80), GW 78.3 (76.5), SW 75.2 (73), LW 67 (65), the
  comparison club 91.5 (91). Most are now at or near the tour's club speeds (S4.3). The bag after, stock (carry /
  total · apex · landing angle):
  - **Woods and hybrids:** driver 266 / 283 · 31 · 41°; 3 wood 243 / 257 · 30 · 42°; 2 hybrid 233 / 244 · 33 · 46°;
    3 hybrid 224 / 234 · 33 · 47°.
  - **Irons:** 4 iron 212 / 222 · 29 · 44°; 5 iron 200 / 209 · 29 · 45°; 6 iron 191 / 198 · 33 · 49°; 7 iron
    176 / 181 · 33 · 51°; 8 iron 161 / 165 · 32 · 51°; 9 iron 145 / 148 · 30 · 51°.
  - **Wedges:** PW 129 / 131 · 30 · 52°; GW 113 / 115 · 28 · 52°; SW 97 / 98 · 25 · 53°; LW 77 / 78 · 22 · 53°.

  Every carry is within a yard of before, and the hybrids now peak at 33 yds instead of 41–42. The driver rolls about
  3 yds less (its landing is a degree steeper). The long irons still land 2–4° shallower than the tour's.
  **What it moved** (re-checked with `swing-fix1` to `swing-fix4.js` and the physics fuzz, which passes):
  - **S5.2's flatter landings now mostly arrive:** the strong-lofted sets land 1.7–4.0° flatter than the blade (JPX
    47.0° against 51.0°, 101 MKII −2.9°, Qi Max −1.7°), and the forgiving sets still roll more.
  - **S6.1's balance improves:** a 7 iron's Low 2 is 1.8× as wide as stock and its High 2 1.4×; the driver's High 2
    ±86 (was ±99).
  - **The draw / fade solver:** 0 of 140 fail.
  - **S7.2:** the driver's Low 2 now ties Mid into a 15 mph wind (249 / 250) and beats it into 25 mph (231 / 224). The
    3 wood stinger is +4 and +13 yds.
  - **S8.1:** a 40 yd PW pitch rolls 12.6 yds (was 14.8). Full shots onto a green roll driver 21, 3 wood 17, 5 iron 11,
    7 iron 5.3 and PW 1.7 at Stimp 11, close to the old rule's numbers.
  - **Chips:** they keep their shape (25% swing: 7 iron 2.6, PW 1.7, sand wedge 1.1). The S8.1 smoothness check is no
    worse than before.
  - **Wind:** 10 mph headwind costs the driver 15 yds and the 7 iron 15 (tailwind +10 / +9).
  - **Tours and hustlers:** `npcClubFor` is only the hustler's club name, so it isn't affected.
- **Where:** `AERO` and `airStep` (about lines 7452 and 7527). Lift is `min(0.305, 1.5 × S + 0.31 × S²)`, where S is the
  ball's spin speed over its air speed.
- **Measured:** the tour table's own launch numbers, flown by the game (game / tour):

  | Row | Carry yds | Apex yds | Landing angle |
  |---|---|---|---|
  | Driver | 271 / 275 (−1.5%) | 32 / 32 | 38° / 38° |
  | 3 wood | 258 / 243 (**+6.3%**) | 38 / 30 (**+26%**) | 45° / 43° |
  | 5 wood | 244 / 230 (+6.1%) | 42 / 31 (+35%) | 48° / 47° |
  | Hybrid | 232 / 225 (+3.2%) | 40 / 29 (+39%) | 47° / 47° |
  | 3 iron | 223 / 212 (+5.4%) | 39 / 27 (**+44%**) | 47° / 46° |
  | 4 iron | 213 / 203 (+4.9%) | 37 / 28 (+32%) | 47° / 48° |
  | 5 iron | 201 / 194 (+3.8%) | 35 / 31 (+13%) | 46° / 49° |
  | 6 iron | 189 / 183 (+3.0%) | 34 / 30 (+13%) | 47° / 50° |
  | 7 iron | 172 / 172 (+0.3%) | 32 / 32 | 47° / 50° |
  | 8 iron | 161 / 160 | 30 / 31 | 47° / 50° |
  | 9 iron | 148 / 148 | 29 / 30 | 47° / 51° |
  | PW | 133 / 136 (−2.1%) | 29 / 29 | 49° / 52° |
  | LPGA driver | 218 / 218 | 25 / 25 | 36° / 37° |
  | LPGA 7 iron | 143 / 141 | 25 / 26 | 43° / 47° |
  | LPGA PW | 106 / 107 | 21 / 23 | 45° / 48° |

  The code's own claim (driver, 7 iron and PW within about 2% of carry) holds. In the game's own bag the result is
  the same: the hybrids' stock shots peak at 41–42 yds, the 4 to 6 irons at 35–36, and the driver at 29.
- **Expected:** tour players hit every club to about the same height, 27–32 yds.
- **Why it happens:** the lift rises in a straight line with S and then hits a ceiling. The 7 iron and shorter are at
  the ceiling (0.305); the driver is low on the line (0.123). In between, a 3 iron gets 0.253, nearly a 7 iron's lift
  at much more speed. Real lift bends over gradually.
- **Why it matters:** the launch monitor shows the apex, and a hybrid that climbs 40% higher than the driver looks
  wrong to a golfer. The extra hang time also means more wind. The base bag's speeds were tuned around it (the 3 wood
  is 7 mph of ball speed slow so that it carries the right 244).
- **Fix (M):** bend the lift curve. `swing-aero-fit.js` tried `lift = 0.329 × (1 − exp(−S / 0.156))` with the drag
  re-fitted: the apex error falls from 21% typical (44% worst) to 5% (9% worst), with carry within 2.6% typical (4.1%
  worst; it was 3.4% and 6.3%). That fit leaves the driver 4% short and the long irons landing 5° shallow, so the
  real job is to fit lift and drag together against carry, apex and landing angle.
  **What else it would move:** every carry in the bag and its yardage read-outs (S4), the 3 wood's and wedges' tuned
  speeds, wind effects, every shape and height number (S7), and the hustler's club table (`npcClubFor`).

### S3.2 [Medium, realism] A full shot's roll on a green ignores the green's speed and slope
- **Mostly fixed with S8.1 (2026-11-20):** a full shot that comes down on the green now rolls by the green's Stimp and
  slopes. One that lands short and runs on keeps the old roll.
- **Where:** `stepFlight`'s roll: a straight line slowing at `rollDecel × SURF[…].roll`. For a green that is always
  2.2 × 0.45 = 0.99 m/s². The hole's Stimp and the green's contours are not read.
- **Measured:** rolling friction (m/s²): a full shot on any green **0.99**; a putt or chip on a green at Stimp 9 /
  10.5 / 11.5 / 12.5 / 14: 0.61 / 0.52 / 0.48 / 0.44 / 0.39. So a full shot's roll dies 1.6 to 2.5 times faster than a
  putt at the same speed, and the same on every course. A stock 7 iron rolls 5.0 yds on a green, a driver 17.1.
- **Expected:** the country club's greens are "lightning" (Stimp 13 to 15) for putts and chips. An approach shot
  should release further there than at the muni (Stimp 9.5 to 11.5), and should follow the slope.
- **Why it matters:** the circuits differ in green speed, but only inside 45 yds. A chip (which uses the real green)
  and a full wedge from just outside 45 yds roll under different rules.
- **Fix (M):** once a full shot is rolling on the green, hand it to the putting roll on the hole's surface, as a chip
  already does. **What else it would move:** approach roll-outs (about double at Stimp 11.5, more on the fast greens),
  holing out from the fairway, and the 45 yd hand-off (S8).

### S3.3 [Medium, realism (deliberate)] A badly curving ball keeps its height
- **Where:** `createFlight`: `sideLift = 1 / max(0.35, cos(tilt))` multiplies the lift of a ball with a tilted spin
  axis. The comment says why: "without this a big hook loses its lift, drops out of the sky and stops curving".
- **Measured:** the tour driver launch with a tilted axis (yds sideways at landing; "rule" = 0.7 yds per degree per
  100 yds of carry):

  | Tilt | Carry | Sideways | Rule | Without the boost: carry, sideways |
  |---|---|---|---|---|
  | 5° | 271 | 10.4 | 9.5 | 270, 10.4 |
  | 10° | 270 | 20.9 | 18.9 | 269, 20.3 |
  | 20° | 268 | 42.5 | 37.5 | 263, 37.7 |
  | 30° | 264 | 65.1 | 55.4 | 253, 50.0 |
  | 40° | 256 | **89.3** | 71.8 | 240, 56.3 |
  | 60° | 223 | **138.2** | 93.8 | 206, 52.5 |

  The 7 iron: 10° → 15.1 yds (rule 12.1), 40° → 66.0 (without the boost 46.8). The PW matches the rule to 20°.
- **Expected:** up to about 15° (an intended draw or fade) the game is within 10–25% of the rule, which suits design
  direction 5. Past 30° a real ball loses height and distance; here it carries almost as far and slides half as far
  again.
- **Why it matters:** the tilts past 30° are not chosen shots. They are misses: a low-Dexterity driver, a wrong club
  from rough. Those end 90–140 yds offline instead of 55.
- **Fix (S):** cap the boost at what a tilt of about 25° gets. **What else it would move:** how often a miss goes out
  of bounds (S6). Solved draws and fades sit below the cap and wouldn't change.

### S3.4 [Low, realism] No shot backs up more than about 1.5 yds
- **Measured (onto a green):** sand wedge with More spin (13,130 rpm): rolls −1.0 yd; High 2 (14,140): −1.4; High 2 +
  More (18,382): −1.4; PW High 2 + More (16,744): −1.5; lob wedge (19,110): −1.3. A stock sand wedge rolls +1.0.
- **Where:** the first bounce keeps between −12% and 88% of the ball's speed; −12% is the floor.
- **Why it matters:** past about 13,000 rpm more spin does nothing on the ground. A tour wedge into a soft green can
  come back 5 yds or more. Together with S2.2: the spin numbers go very high, but the ball doesn't act on them.

### S3.5 [Low, realism] A tree hit sends 1 ball in 4 back toward the player
- **Where:** `treeDeflect`: the ball keeps 12–37% of its speed and turns up to 137° either way.
- **Measured (3,000 shots at one 15 m tree):**

  | Shot | Finishes from the trunk (median, 90%, farthest) | Beyond the tree | Back toward the player | Out to the side |
  |---|---|---|---|---|
  | 7 iron, caught 7 m up | 17 m, 25 m, 30 m | 47% | **27%** | 25% |
  | Drive, caught 12 m up | 30 m, 42 m, 47 m | 60% | **26%** | 14% |
  | Wedge, caught 6 m up | 9 m, 13 m, 17 m | 24% | **24%** | 38% |
- **Also:** each tree is a solid cone from the ground up (6–13 m wide at the base, 10–22 m tall), so there is no
  punching out under the branches of the trees around you. Only the tree your ball is lying under is ignored. A
  rolling ball passes through trees.
- **Why it matters:** a hit costs the whole shot, which is fair. Coming back 20 m behind the tree a quarter of the
  time is harsher than real trees, where most balls drop or carry on.

### S3.6 [Low, realism] Short irons land a few degrees shallow
- **Measured:** 6 iron to PW land at 47–49° against the tour's 50–52° (table in S3.1). The slower LPGA rows fly 6–10%
  low. Both mean slightly more roll than real for a short iron. To be fixed with S3.1's refit, not separately.

### Checked and fine
- **Step size.** Carry and total at 1/30, 1/60, 1/120, 1/240 and 1/1000 s: driver 269.3 / 270.3 / **271.0** / 271.3 /
  271.5; 7 iron 170.9 / 172.0 / **172.5** / 172.7 / 172.8. The game's 1/120 s is within 0.2% of the limit. The preview,
  the live shot and the "skip to the end" key all use 1/120 s, so the preview is the shot.
- **Wind** (the game's stock shots; yds of carry):

  | Shot | 10 mph head | 10 mph tail | Head ÷ tail | 10 mph cross | 20 mph head / tail |
  |---|---|---|---|---|---|
  | Driver | −16 (−6.0%) | +12 | 1.3 | 15.3 yds | −36 / +22 |
  | Driver, Low 2 | −2 | +1 | 2.1 | 4.8 | −5 / +1 |
  | 7 Iron | −16 (−9.1%) | +10 | 1.7 | 13.7 | −40 / +14 |
  | 7 Iron, Low 2 | −10 | +4 | 2.7 | 11.2 | −27 / +3 |
  | 7 Iron, High 2 | −20 | +14 | 1.4 | 15.8 | −48 / +24 |
  | Sand Wedge | −9 (−9.0%) | +6 | 1.4 | 7.7 | −21 / +11 |

  A headwind costs more than a tailwind gains, more so as it strengthens. A low shot is far less affected (the driver
  stinger drifts 4.8 yds against 15.3), a high one more. The driver matches the rules of thumb. The 7 iron's
  crosswind drift is a little strong (rule: 8–10 yds): the stated wind is the wind 15 m up, and irons fly above that.
- **Wind direction.** A wind from the right moves the ball left. On a mirrored course the wind's bearing is mirrored
  with the hole (`variantDef`). A chip's wind is turned into the green's frame.
- **Wind by height:** ×0.54 at 0.5 m, ×0.82 at 5 m, ×1.00 at 15 m, ×1.13 at 30 m. A rolling ball feels none.
- **Spin decay:** a drive lands with 77% of its spin, a 7 iron with 78%, after 6–7 s.
- **Bounce and roll** (stock shots; speed kept through the first bounce → roll-out in yds):

  | Club | Lands at | Fairway | Green | Light rough | Heavy rough | Hardpan | Bunker |
  |---|---|---|---|---|---|---|---|
  | Driver | 37°, 1,995 rpm | 55% → 21.0 | 50% → 17.1 | 41% → 9.4 | 28% → 3.6 | 61% → 30.9 | 14% → 0.5 |
  | 3 Wood | 44°, 2,748 | 47% → 14.6 | 42% → 11.6 | 35% → 6.9 | 23% → 2.7 | 52% → 20.9 | 12% → 0.3 |
  | 5 Iron | 46°, 4,109 | 37% → 9.7 | 33% → 7.6 | 28% → 4.9 | 19% → 2.0 | 41% → 13.5 | 9% → 0.3 |
  | 7 Iron | 47°, 5,459 | 28% → 6.4 | 25% → 5.0 | 21% → 3.4 | 14% → 1.4 | 31% → 8.8 | 7% → 0.2 |
  | Pitching Wedge | 48°, 7,445 | 15% → 2.9 | 13% → 2.2 | 11% → 1.6 | 7% → 0.7 | 16% → 3.8 | 4% → 0.1 |
  | Sand Wedge | 50°, 8,375 | 7% → 1.2 | 7% → 1.0 | 6% → 0.7 | 4% → 0.3 | 8% → 1.6 | 2% → 0.0 |

  The driver's 21 yds of roll on a fairway matches the tour's 20–30. Rough grabs, hardpan runs, sand plugs.
- **Design direction 4** (draws roll, fades stop), the ground part alone, same launch:

  | Club | Full draw | Straight | Full fade |
  |---|---|---|---|
  | Driver | 265 → 294 (roll 29.3) | 265 → 286 (21.0) | 265 → 280 (15.6) |
  | 7 Iron | 176 → 185 (9.5) | 176 → 182 (6.4) | 176 → 180 (4.0) |
  | Pitching Wedge | 128 → 133 (5.0) | 128 → 131 (2.9) | 128 → 129 (0.9) |
- **Odd cases.** Nothing comes near the 30-second cap: the longest tried (a topped ball across a green, a 180 mph
  drive downwind onto hardpan) took 18.5 s. The ball is called stopped below 0.15 m/s, which gives up about 1 cm. A
  4 cm tee makes no difference to carry. Every bounce sequence ends.
- **Trees catch what flies through them.** At driver speed the ball moves 0.62 m between checks. A path through the
  body of a tree is caught every time. Only a path clipping under half a metre of the cone (the outer edge, or the
  top 5%) can slip through: 62% caught at 95% of the tree's height, 19% at 98%. That reads as brushing the leaves.

### Noticed for later
- **S4:** the game's own bag, stock shots (carry, apex): driver 265, 29 · 3 wood 244, 35 · 2 hybrid 232, 41 · 3 hybrid
  223, 42 · 4 iron 211, 36 · 5 iron 200, 35 · 6 iron 190, 35 · 7 iron 176, 33 · 8 iron 160, 30 · 9 iron 145, 28 · PW
  128, 27 · GW 113, 25 · SW 96, 23 · LW 77, 20.
- **S6:** a spin-axis tilt past 30° is where S3.3 bites; count how often each Dexterity gets there.
- **S8:** the full-shot roll and the chip roll on a green differ (S3.2); compare a 44 yd chip with a 46 yd full swing.
- **S9:** the preview flies with no wind and on range turf; check what the bag's totals assume about the ground.

## Section S4 — The base bag (2026-11-20, Opus 5.5)

**Summary.** The base bag is close to the tour table: launch, spin and club speed match within a few percent for
every club the table covers, and 9 of 12 rows carry within 3%. There is no gap under 9 yds or over 21 yds. The
clubs are in carry order, and the per-club extras (sweet spot, gear, bulge, rescue, bounce, curve) each do what
their comments say. Two medium findings. First, the range's comparison club, a forgiving 7 iron, is also in the test
round's bag. It goes a 6 iron's distance with 40% less spread, so the leaderboard round has a 15th club that is
better than the 6 iron. Second, the short end of the bag is stretched: the pitching wedge is 8 yds short of the tour
number, and the wedge gaps are 15–19 yds. Three low findings. No high-severity findings.

**How it was tested.** `tools/test/swing-bag.js` runs `computeImpact` with no scatter (`stock: true`: 100% backswing
and tempo, centred, mouse straight, fairway, flat lie, Dexterity 5). It flies each club with `createFlight` and
`stepFlight` at 1/120 s, which is the same path as `stockFlightOf`, and records the landing angle as well. The
driver is teed. It also measures one change at a time for each extra, and the bag list as the range shows it. A
scratch script flew the bag's own launch numbers under S3.1's suggested lift refit, to see which of the numbers
below depend on S3.1.

| # | Severity | Kind | Finding | Fix size |
|---|---|---|---|---|
| S4.1 | Medium | Bug | The test round's bag includes the comparison 7 iron, a 15th club that beats the 6 iron | S |
| S4.2 | Medium | Realism | The short end is stretched: PW 8 yds short, 7 iron to PW 48 yds (tour 36), wedge gaps 15–19 | S |
| S4.3 | Low | Realism | The driver carries 10 yds less than the tour average, and S3.1's fix would leave the driver and 3 wood shorter still | S |
| S4.4 | Low | Feel / balance | Power 1 hits like a scratch amateur, not a beginner | — |
| S4.5 | Low | Realism | Hybrids miss like irons: a toe hit finishes right | S |

### The bag at Power 5 (game, then tour in brackets)

| Club | Loft | Club mph | Ball mph | Smash | Launch ° | Spin rpm | Apex yds | Land ° | Carry yds | Total | Roll |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Driver (teed) | 10.5 | 112 (113) | 165 (167) | 1.48 | 10.7 (10.9) | 2,600 (2,686) | 29 (32) | 37 (38) | 265 (275, **−4%**) | 286 | 21 |
| 3 Wood | 15 | 103 (107) | 151 (158) | 1.46 | 9.8 (9.2) | 3,650 (3,655) | 35 (30, +17%) | 44 (43) | 244 (243) | 259 | 15 |
| 2 Hybrid (vs 5 wood) | 17 | 100 (103) | 146 (152) | 1.46 | 10.9 (9.4) | 4,300 (4,350) | 41 (31, +32%) | 48 (47) | 232 (230) | 243 | 12 |
| 3 Hybrid (vs hybrid) | 19.5 | 98 (100) | 142 (146) | 1.44 | 11.8 (10.2) | 4,600 (4,437) | 42 (29, +43%) | 48 (47) | 223 (225) | 233 | 11 |
| 4 Iron | 22 | 95 (96) | 136 (137) | 1.43 | 11.0 (11.0) | 4,850 (4,836) | 36 (28, +29%) | 46 (48) | 211 (203, **+4%**) | 222 | 11 |
| 5 Iron | 25 | 93 (94) | 132 (132) | 1.42 | 12.1 (12.1) | 5,350 (5,361) | 35 (31, +12%) | 46 (49) | 200 (194, +3%) | 210 | 10 |
| 6 Iron | 29 | 92 (92) | 128 (127) | 1.39 | 14.1 (14.1) | 6,230 (6,231) | 35 (30, +16%) | 47 (50) | 190 (183, **+4%**) | 198 | 8 |
| 7 Iron | 34 | 90 (90) | 122 (120) | 1.35 | 16.4 (16.3) | 7,000 (7,097) | 33 (32) | 47 (50) | 176 (172, +2%) | 182 | 6 |
| 8 Iron | 38 | 87 (87) | 115 (115) | 1.32 | 18.1 (18.1) | 8,000 (7,998) | 30 (31) | 47 (50) | 160 (160) | 165 | 5 |
| 9 Iron | 42 | 84 (85) | 107 (109) | 1.28 | 20.4 (20.4) | 8,650 (8,647) | 28 (30) | 47 (51) | 145 (148, −2%) | 149 | 4 |
| Pitching Wedge | 46 | 80 (83) | 99 (102) | 1.24 | 24.3 (24.2) | 9,200 (9,304) | 27 (29) | 48 (52) | 128 (136, **−6%**) | 131 | 3 |
| Gap Wedge | 50 | 77 | 91 | 1.19 | 27.3 | 9,600 | 25 | 49 | 113 | 115 | 2 |
| Sand Wedge | 55 | 73 | 82 | 1.13 | 31.1 | 10,100 | 23 | 50 | 96 | 98 | 1 |
| Lob Wedge | 60 | 65 | 72 | 1.10 | 35.3 | 10,500 | 20 | 51 | 77 | 78 | 1 |
| 7 Iron · Game Improvement | 30 | 91 (90) | 126 (120) | 1.38 | 17.5 (16.3) | 6,200 (7,097) | 39 (32) | 50 (50) | 185 (172) | 193 | 7 |

Spin is within 4% on every row. Launch is within 0.2° on every iron; the hybrids launch 1.5° higher than the tour
rows they stand in for. The apex errors are S3.1, and the shallow iron landings are S3.6.

**Under S3.1's refit** (the same launch numbers, flown with the bent lift curve), the carries barely move from the
3 hybrid down (−4 to +1 yds). The driver would drop to 258 and the 3 wood to 236 (see S4.3). The gaps in S4.2 hold
either way.

### S4.1 [Medium, bug] The test round's bag includes the comparison 7 iron, a 15th club that beats the 6 iron
- **✅ Fixed 2026-11-20:** the comparison club is range-only. `rangeOnly(i)` leaves it out of `bagOrder()` and
  `canUseClub()` whenever a hole is in play. Measured: on the range the bag has 15 rows. On a hole and in a test round
  it has 14, `setClub(14)` does nothing, and [ ] cycling visits 14 clubs. Leaving the hole brings it back.
- **Where:** `CLUBS` index 14, "7 Iron · Game Improvement" (about line 7109), "kept for comparing the two equipment
  archetypes". Outside a career, `bagOrder()` lists every club in `CLUBS` and `canUseClub()` returns true for every
  one (about line 12325). The test round never runs in a career (about line 10383).
- **Measured:** the bag list on the range and in a test round has 15 rows, plus the putter, so 16 clubs. The
  comparison club has no number key; it is reached with [ ], the wheel or a click. `suggestClub` never picks it,
  because its loop stops at the lob wedge. Its stock shot carries 185 and finishes at 193, between the 6 iron (190 /
  198) and the 7 iron (176 / 182). Its 2-sigma landing area, from `landSpread`:

  | | Dexterity 2: mean, wide, deep | Dexterity 5: mean, wide, deep |
  |---|---|---|
  | 6 Iron | 196, ±19.2, ±7.3 | 197, ±12.6, ±6.1 |
  | 7 Iron | 181, ±16.0, ±6.8 | 181, ±10.5, ±5.7 |
  | 7 Iron · GI | 191, ±11.2, ±5.1 | 192, ±7.2, ±5.0 |

  On the other measures it plays as described: a strong loft (30°), a big sweet spot (12 mm), low workability
  (0.45), a high spin floor (0.85), and less spin and more height than the blade.
- **Expected:** the test round's bag is "the 14 base clubs" (design direction 12 and this plan). The comparison club
  belongs on the range.
- **Why it matters:** the test round feeds the Top 10 board. A player who notices the extra club gets an
  easier-to-hit 6 iron, with 40% less width at either Dexterity, for every shot from 185 to 195 yds. A player who
  doesn't notice it never gets that advantage.
- **Fix (S):** leave index 14 out of `bagOrder()` and refuse it in `canUseClub()` whenever a hole is in play (`hp.on`).
  Then it shows only on the range. Or remove it, if the range doesn't need it. **What else it would move:** nothing
  else reads index 14. Check that the bag list's keys and the [ ] cycling still line up.

### S4.2 [Medium, realism] The short end is stretched: PW 8 yds short, 7 iron to PW 48 yds, wedge gaps 15–19
- **✅ Fixed 2026-11-20** (after S3.1's refit): new club speeds 8 iron 89, 9 iron 87, PW 85, GW 82.7, SW 80.8, LW 76.7
  (were 88, 85, 82, 78.3, 75.2, 67). The lob wedge's 8 mph drop is gone. Stock carry / total (apex, landing angle):

  | Club | Before | After | Gap to the next club |
  |---|---|---|---|
  | 7 Iron | 176 | 176 / 181 | 13 |
  | 8 Iron | 161 | 163 / 167 (33, 52°) | 13 |
  | 9 Iron | 145 | 150 / 153 (32, 52°) | 14 |
  | PW | 129 | **136** / 138 (33, 54°), the tour's number | 14 |
  | Gap Wedge | 113 | 122 / 124 (32, 54°) | 15 |
  | Sand Wedge | 97 | 107 / 108 (30, 55°) | 14 |
  | Lob Wedge | 77 | 93 / 94 (29, 56°) | — |

  The scoring clubs now cover 40 yds from the 7 iron to the PW (was 48; tour 36). The wedges carry about what the
  rules of thumb give (50° 120–125, 55° 100–115, 60° 90–100). The PW's club speed (85) sits 2 mph above the tour
  average, to make up the flight model's remaining 4% shortfall for it (S3.1).
  **What it moved:**
  - chips gain a little per % of backswing (the chip read follows, since its table is computed live);
  - wedge spread at Dexterity 2 is ±6.6 for the sand wedge (was ±5.7);
  - a sand wedge off hardpan carries 90 at Dexterity 5.
  S5.6 (the GI sets' PW to gap wedge hole) is unchanged and still open.
- **Where:** `CLUBS` speeds for the 9 iron to the lob wedge (about lines 7103–7108): 84, 80, 76.5, 73, 65 mph.
- **Measured:** carry gaps, longest to shortest (Power 5):

  | Pair | Game | Tour |
  |---|---|---|
  | Driver → 3 Wood | 21 | 32 |
  | 3 Wood → 2 Hybrid → 3 Hybrid → 4 Iron | 12, 9, 12 | — |
  | 4 → 5 → 6 → 7 Iron | 11, 10, 14 | 9, 11, 11 |
  | 7 → 8 → 9 Iron → PW | **16, 15, 17** | 12, 12, 12 |
  | PW → GW → SW → LW | **15, 17, 19** | — |

  The 7 iron is 4 yds long and the PW is 8 yds short, so the scoring clubs cover 48 yds instead of 36. The PW is 3 mph
  of club speed slow (80 against 83). Its ball speed is 99 against 102, and it lands at 48° against 52°. The lob
  wedge drops 8 mph from the sand wedge, where every other step in the bag is 2–4 mph. Its full swing carries 77 yds.
  At Power 10 the sand wedge to lob wedge gap is 21.
- **Expected:** tour gaps of about 12 yds from the 7 iron to the PW. For the wedges, the benchmark stops at the PW. As
  a rule of thumb (approximate), a tour full swing carries about 120–125 with a 50°, about 100–115 with a 55° and
  about 90–100 with a 60°. The game gives 113, 96 and 77.
- **Why it matters:** the clubs a player hits most into greens have the widest gaps. More approaches fall between two
  clubs and need a partial swing. A full lob wedge, at 77 yds, is barely past the 45 yd chipping hand-off.
- **Fix (S):** raise the speeds to about 9 iron 85, PW 82.5, GW 79, SW 76, LW 71. That gives about 147 / 133 / 119 /
  103 / 88: gaps of 14, 14, 16 and 15. Do it after S3.1 / S3.6, which move the PW's landing angle and carry by a few
  yards. **What else it would move:** the bag's yardages and the backswing marks, the chip and full-swing hand-off
  (S8), every wedge model's carry (S5), the hustler's club table (`npcClubFor`), and the coach's wedge lessons, if
  any are priced by distance.

### S4.3 [Low, realism] The driver carries 10 yds less than the tour average, and S3.1's fix would shorten it more
- **Measured:** stock driver 112 mph club, 165 ball, 10.7°, 2,600 rpm: 265 carry / 286 total (tour 275 carry). The
  tour row's own launch flies 271 in the game (S3.1), so about half the gap is the slightly low ball speed and launch.
  S2 noted that High 1 is the driver's longest setup (275 / 290), so the stock setup is under-lofted. Under S3.1's
  refit the stock driver would carry 258, and the 3 wood, already 4 mph slow (103 against 107), would carry 236
  against the tour's 243.
- **Why it matters:** only a little. The driver to 3 wood gap is 21 here against 32 on tour, so the 3 wood is a near
  substitute off the tee.
- **Fix (S), with S3.1:** after the lift refit, set the driver to about 114 mph (or raise its `dynLoft` about 1°) and
  the 3 wood to its tour 107. Re-measure the driver's High 1 against Mid. **What else it would move:** tee-shot
  totals on every hole, the driver models (S5), and the shop's driver bars.

### S4.4 [Low, feel / balance] Power 1 hits like a scratch amateur, not a beginner
- **Measured** (stock shots, carry / total):

  | | Driver club mph | Driver | 7 Iron | PW | LW |
  |---|---|---|---|---|---|
  | Power 1 (×0.90) | 101 | 230 / 252 | 152 / 160 | 110 / 113 | 66 / 67 |
  | Power 2 (a new career) | ≈104 | ≈239 / ≈260 | ≈158 | ≈114 | ≈69 |
  | Power 5 | 112 | 265 / 286 | 176 / 182 | 128 / 131 | 77 / 78 |
  | Power 10 (×1.10) | 123 | 296 / 316 | 197 / 203 | 145 / 147 | 88 / 89 |
- **Expected:** a typical male amateur swings the driver at about 93 mph and hits it 215–220 in total (rule of thumb
  above). The LPGA average is 94 mph and 218 carry. Power 1 is about 8 mph and 30 yds beyond the typical amateur. Power
  10 is a long tour hitter (123 mph, 296 carry), which fits.
- **Why it matters:** this is the user's call. The whole stat runs from "a good club player" to "a long tour pro"; it
  never starts at a real beginner. That suits a game where courses are built for these numbers. If a weak start is
  wanted, widen `powerMult` at the bottom (for example 0.82 at Power 1). Power 1's weak shots also land flat (7 iron
  42°, against the LPGA's 47°) because spin doesn't follow Power (S2.10).
- **What else it would move:** every course's difficulty for a new career, and the hustlers' handicaps, if they're
  set against the player's distances.

### S4.5 [Low, realism] Hybrids miss like irons: a toe hit finishes right
- **✅ Fixed 2026-11-20:** the 2 and 3 hybrids' `bulge` is −0.6 (was −0.3). A toe hit now draws back, as with a small
  wood: at 8 / 14 mm the 3 hybrid finishes 3 / 3 yds left (was 4 / 7 right), and a heel hit 3 / 3 right (was 4 / 7
  left). The hybrid models follow it through S5.5's scaling. The base 3 hybrid's spread at Dexterity 2 is ±27.5 (was
  ±27.8 before this change). `tools/test/swing-fix5.js`.
- **Measured:** where an off-centre hit finishes, in yds (+ = right), and the carry lost:

  | Club (sweet, gear, bulge) | Toe 6 mm | Toe 10 | Toe 14 | Heel 10 | Heel 14 |
  |---|---|---|---|---|---|
  | Driver (10, 0.8, −0.7) | −2, 3 L | −4, 4 L | −21, 3 L | +3, 5 R | −13, 4 R |
  | 3 Wood (9, 0.8, −0.6) | 0, 3 L | −4, 5 L | −20, 4 L | −4, 5 R | −19, 4 R |
  | 2 / 3 Hybrid (10, 0.7, −0.3) | 0, **3 R** | 0, **6 R** | −14, **9 R** | 0, 6 L | −14, 9 L |
  | 4 Iron (5, 1.2, 0) | −4, 13 R | −18, 22 R | −33, 29 R | −17, 23 L | −33, 31 L |
  | 7 Iron (5, 1.2, 0) | −4, 9 R | −17, 14 R | −30, 18 R | −15, 15 L | −28, 20 L |

  The woods' bulge beats their face twist, so a toe hit draws back left. The hybrids' bulge (−0.3) is too weak for
  their twist (gear 0.7), so a toe hit pushes and fades, like an iron. (The irons' size is S2.8.)
- **Expected:** a hybrid's head is a small wood, and a toe hit draws, as with a fairway wood, though less.
- **Fix (S):** about −0.6 bulge on both hybrids, so a toe hit finishes near the centre line or a little left. **What
  else it would move:** hybrid dispersion (S6) and the hybrid models (S5).

### Checked and fine
- **The table** above: club speed, smash and spin all match. Carry is within 3% on 9 of the 12 rows (the other three
  are S4.2 and S4.3; the 4 and 6 irons, +4%, are S3.1's lift).
- **Gaps and order:** sorted by carry, the clubs come out in bag order. The narrowest gap is the 2 hybrid to the
  3 hybrid (9 yds), and the 3 hybrid sits 12 yds above the 4 iron. At Power 1 the narrowest gap is 8 (2 to 3 hybrid);
  at Power 10 the widest is 23 (driver to 3 wood).
- **Sweet spot:** no carry is lost inside it, and the loss after it is steady (irons about 4 yds per mm). The wedges'
  floor is S2.5: the sand wedge loses 4 yds at 14 mm and the lob wedge nothing.
- **Shaping through the bag (`curve`, `work`):** the solved presets bend 8–11 yds with every club from the driver to
  the gap wedge, 7 with the sand wedge and 5 with the lob wedge (the solver aims for 5% of the carry), and every one
  comes back to the aim line (0 yds). By hand, a 5° in-to-out mouse path with a square face finishes 22% of the carry
  left with the driver, falling smoothly through the bag (3 wood 15%, 4 iron 14%, 7 iron 9.4%, PW 4.6%, sand wedge
  1.6%). That is the real trend: a lofted club curves less, and its push cancels most of the curve. The driver's size
  is S2.7, and the work counted twice is S2.4.
- **Rescue:** from light rough the 2 hybrid carries 214 against the 4 iron's 188; from heavy rough the 3 hybrid carries
  138 against the 4 iron's 94 and the 5 iron's 117. From a fairway bunker, where `rescue` doesn't apply, the 4 iron
  (180) beats the hybrids (139, 164), which are misfits there. That is a sensible rule.
- **Bounce:** a full sand wedge from a greenside bunker with its 12° of bounce has complexity 0.33 and ball speed
  61.5 ± 3.2 mph. With no bounce it would be 0.54 and ± 4.2.
- **Power 10** is a believable long hitter (the table in S4.4). At Power 10 the hybrids peak at 51–53 yds, which is
  S3.1 growing with speed.

### Noticed for later
- **S7:** the loft floor only binds on the woods and hybrids. Low 2 costs the driver 70 yds of carry and 45 of total
  (195 / 241; apex 9 yds), and the 3 wood 62 and 27 (182 / 232). The hybrids lose 2–6 of carry and gain total. Every
  iron from the 6 iron to the lob wedge carries 4–7 yds *further* at Low 2 (7 iron 183 / 197), so the height ladder
  doubles as an extra club.
- **S9 / interface:** there are 12 number keys. A full 14-club career bag leaves the sand and lob wedges without one.
  On the range the comparison club makes a 15th row.
- **S5:** the shop's model bars are measured on `SHOP.testClub` (iron models on the 7 iron, wedges on the sand
  wedge), so a set's long-iron changes (strong lofts at 80% on the 4 and 5 irons) don't show in its bars.

## Section S5 — The club catalogue (2026-11-20, Opus 5.5)

**Summary.** Each model's numbers are applied as the code says, and the luxury rule holds: no luxury model beats the
best ordinary model on any measured number. The wedges and fairway woods behave like their notes. The trouble is
the trade-offs. A forgiving iron set gives up almost nothing, so the irons form a ladder, and the $580 Takomo is about
the best set in the game. The game-improvement sets land steeper than the blade, the reverse of what the plan
targets. The low-spin drivers are shorter than the forgiving ones even when struck in the middle. A forgiving driver's
toe hit hooks 20–30 yds. One putter, the OZ.1, is best for everyone. The shop's "Stopping" bar measures the wrong
moment.

**How it was tested.** `tools/test/swing-models.js` puts each model on its clubs the way `applyCareerClubs` does,
outside a career. So there are no bent lies, except where a table adds one. It measures stock shots, and 300–500
seeded ordinary swings per case. These use the same swing errors as the minimap's landing area (`SPREAD`: about ±1.2°
of mouse path, up to 2.5 px of wobble, ±5% backswing). "Within 10 yds" means the share of shots that finish within
10 yds of where the stock shot finishes, about a green. Putters are tested on a flat Stimp 11 green with
`computePutt`, `createPutt` and `stepPutt`. Those three, along with `puttTarget`, `rollDecel`, `puttGate`, `rng32`,
`shopStats`, `SHOP`, `withClubModel`, `setup` and `careerStats`, were added to `window.__golf`. Three of the plan's
"≈" lofts were checked against the makers' pages (see "Checked and fine").

| # | Severity | Kind | Finding | Fix size |
|---|---|---|---|---|
| S5.1 | High | Feel / balance | Forgiveness costs almost nothing, so the iron sets are a ladder; the $580 Takomo is about the best | M |
| S5.2 | Medium | Bug | Game-improvement and in-between sets land 2–3° steeper than the blade, not 3–5° flatter | S–M |
| S5.3 | Medium | Bug | The shop's "Stopping" bar reads the angle of the ball's last little hop, not its landing | S |
| S5.4 | Medium | Feel / balance | The low-spin drivers are shorter than the forgiving ones, even from the middle of the face | S |
| S5.5 | Medium | Realism | A forgiving driver's toe hit hooks 20–30 yds; a low-spin one's slices up to 36 | S |
| S5.6 | Medium | Feel / balance | A game-improvement set leaves a 23–27 yd hole between its PW and the gap wedge | S |
| S5.7 | Medium | Feel / balance | One putter is best for everyone: the OZ.1 holes 74% from 20 ft against the blades' 55% | S |
| S5.8 | Low | Feel / balance | The Max D finishes 20 yds left of a straight swing, the Triple Diamond 15 right | S |
| S5.9 | Low | Feel / balance | The starter irons are as accurate as a new blade, and their bent lie is nearly invisible | S |

### The iron sets, 4 iron to PW (stock, Power 5: loft, carry / total, apex)

| Set | 4 Iron | 5 Iron | 6 Iron | 7 Iron | 8 Iron | 9 Iron | PW |
|---|---|---|---|---|---|---|---|
| Base (test round) | 22.0 · 211/222 · 36 | 25.0 · 200/210 · 35 | 29.0 · 190/198 · 35 | 34.0 · 176/182 · 33 | 38.0 · 160/165 · 30 | 42.0 · 145/149 · 28 | 46.0 · 128/131 · 27 |
| AP1 716 (used, starter) | 18.8 · 204/216 · 35 | 21.8 · 195/205 · 34 | 25.0 · 186/194 · 35 | 30.0 · 173/180 · 34 | 34.0 · 158/163 · 31 | 38.0 · 144/148 · 29 | 42.0 · 127/131 · 29 |
| M2 (used) | 17.6 · 214/226 · 38 | 20.6 · 204/214 · 38 | 23.5 · 195/204 · 40 | 28.5 · 182/189 · 38 | 32.5 · 167/172 · 35 | 36.5 · 152/157 · 33 | 40.5 · 135/139 · 32 |
| Qi Max (GI) | 17.6 · 219/230 · 40 | 20.6 · 208/218 · 40 | 23.5 · 199/207 · 42 | 28.5 · 185/192 · 40 | 32.5 · 170/175 · 37 | 36.5 · 155/159 · 35 | 40.5 · 138/141 · 33 |
| JPX 925 HM (GI) | 17.2 · 221/232 · 41 | 20.2 · 210/221 · 41 | 23.0 · 201/209 · 43 | 28.0 · 188/195 · 41 | 32.0 · 172/178 · 38 | 36.0 · 158/162 · 35 | 40.0 · 140/143 · 34 |
| 101 MKII (GI) | 18.0 · 216/227 · 39 | 21.0 · 206/216 · 39 | 24.0 · 196/205 · 40 | 29.0 · 183/190 · 39 | 33.0 · 168/173 · 35 | 37.0 · 153/157 · 33 | 41.0 · 136/139 · 32 |
| Apex Ai200 | 18.8 · 217/228 · 40 | 21.8 · 207/216 · 40 | 25.0 · 197/205 · 41 | 30.0 · 183/190 · 39 | 34.0 · 168/173 · 36 | 38.0 · 153/157 · 34 | 42.0 · 136/138 · 32 |
| ZXi7 | 20.4 · 213/224 · 39 | 23.4 · 202/212 · 38 | 27.0 · 193/200 · 39 | 32.0 · 179/185 · 37 | 36.0 · 163/168 · 34 | 40.0 · 148/152 · 31 | 44.0 · 131/134 · 30 |
| 620 CB | 22.0 · 211/222 · 37 | 25.0 · 200/210 · 35 | 29.0 · 190/198 · 36 | 34.0 · 176/182 · 34 | 38.0 · 160/165 · 31 | 42.0 · 145/149 · 29 | 46.0 · 128/130 · 28 |
| Staff Model Blade | 22.0 · 211/221 · 36 | 25.0 · 200/209 · 35 | 29.0 · 189/197 · 35 | 34.0 · 175/181 · 33 | 38.0 · 159/164 · 30 | 42.0 · 144/148 · 28 | 46.0 · 127/130 · 27 |
| MB Forged | 22.0 · 211/221 · 36 | 25.0 · 200/210 · 35 | 29.0 · 190/197 · 35 | 34.0 · 175/182 · 33 | 38.0 · 159/164 · 30 | 42.0 · 144/148 · 28 | 46.0 · 128/130 · 27 |

(Prestigio plays exactly as the Ai200. Beres 5-Star sits between the Qi Max and the 101 MKII. Sovereign sits between
the ZXi7 and the 620 CB. The full rows, with spin and landing angle, are the script's output.)

### S5.1 [High, feel / balance] Forgiveness costs almost nothing, so the iron sets are a ladder
- **✅ Fixed 2026-11-20** (the finding's three parts; `tools/test/swing-fix2.js`):
  - **The mouse path is damped once.** A model's `work` now acts only on the curve. The mouse path keeps the base
    club's factor (`pathWork`, set in `modelMods`), so the base bag and the test round are unchanged; S2.4 is still
    open for the base clubs. A 5° stroke now finishes 15.5 yds left with the Qi Max (was 6.5), against 19.0 with the
    blade (was 23.7).
  - **Shaping a forgiving head costs more.** The Shape risk is multiplied by `shapeCx` = base `work` ÷ model `work`:
    2.0–2.2× for the game-improvement sets, 1.25–1.43× for the in-between sets, 0.87× for the Wilson blade.
  - **Stopping:** S5.2 below.

  7 iron, the game's assumed swing (complexity · 2σ width · within 10 yds), before → after:

  | Set | Straight, Dex 2 | Draw preset, Dex 2 | Straight, Dex 5 | Roll on a green | Low 2 apex |
  |---|---|---|---|---|---|
  | 101 MKII ($580) | ±8.9, 96% → **±11.5, 88%** | 0.40 · ±16.2 · 73% | 100% → 97% | 5.3 → **7.0** | 35 → 30 |
  | Qi Max | ±9.0, 96% → ±11.3, 89% | 0.41 · ±15.7 · 74% | 100% → 97% | 5.1 → 6.6 | 37 → 32 |
  | JPX 925 HM | ±10.5, 93% → ±13.9, 80% | 0.38 · ±18.4 · 67% | 99% → 93% | 5.3 → 7.4 | 38 → 30 |
  | Apex Ai200 | ±12.0, 87% → ±14.4, 79% | 0.32 · ±18.6 · 67% | 97% → 92% | 5.0 → 6.2 | |
  | ZXi7 | ±12.8, 85% → ±14.6, 79% | 0.30 · ±18.8 · 67% | 96% → 92% | 4.9 → 5.8 | |
  | 620 CB | ±14.4, 80% → ±15.2, 77% | 0.29 · ±19.4 · 64% | 92% → 91% | 5.0 → 5.3 | |
  | Staff Model Blade | ±19.1, 68% → ±18.5, 68% | **0.27** · ±22.7 · 54% | 84% → 85% | **4.8** | **25** |
  | AP1 716 (starter) | ±19.3, 68% → ±22.7, **58%** | 0.33 · ±25.8 · 47% | 85% → 77% | 5.5 → 6.8 | |

  The forgiving sets are still the most accurate to swing straight. That is their whole point, and true of real golf.
  They now pay for it: they run out on the greens (40–55% more roll), cost more risk to shape, and can't flight it
  down. The gap in accuracy is smaller: 88% against 68% at Dexterity 2, where it was 96% against 68%; on the 4 iron
  69% against 43% (was 79%). The starter set is now clearly the worst set (S5.9). If the blades should be the better
  pick for a skilled player, the next lever is their straight-line accuracy at high Dexterity.
- **Measured** (7 iron unless said; "vs blade" is against the Wilson Staff Model Blade; Dexterity 2 is a new career):

  | Set | Price | Carry vs blade | Within 10 yds, Dex 2 / 5 | 4 iron within 10 yds, Dex 2 | 2σ wide, Dex 2 | Draw preset curve | A 5° mouse path | Low 2 apex / carry | Roll on a green |
  |---|---|---|---|---|---|---|---|---|---|
  | 101 MKII | $580 | +8 | **96% / 100%** | **79%** | 8.9 | 10 | 5.9 L | 35 / 187 | 5.3 |
  | Qi Max | $1,100 | +10 | 96% / 100% | 79% | 9.0 | 10 | 6.5 L | 37 / 190 | 5.1 |
  | JPX 925 HM | $1,050 | +13 | 93% / 99% | 73% | 10.5 | 10 | 6.9 L | 38 / 192 | 5.3 |
  | Apex Ai200 | $1,400 | +8 | 87% / 97% | 66% | 12.0 | 10 | 9.7 L | 32 / 191 | 5.0 |
  | ZXi7 | $1,400 | +3 | 85% / 96% | 62% | 12.8 | 10 | 11.0 L | 29 / 186 | 4.9 |
  | 620 CB | $1,600 | 0 | 80% / 92% | 54% | 14.4 | 9 | 14.8 L | 26 / 183 | 5.0 |
  | MB Forged | $1,000 | 0 | 72% / 86% | 48% | 17.3 | 9 | 19.3 L | 25 / 183 | 4.9 |
  | Staff Model Blade | $1,400 | — | **68% / 84%** | **42%** | 19.1 | 9 | 23.7 L | **25 / 183** | 4.8 |
- **Expected:** "Forgiving sets should give up workability and stopping power; blades the reverse." (plan S5,
  `CAMPAIGN_PLAN.md`.)
- **Why the costs don't show:**
  - **Workability:** the Draw and Fade presets are solved for each club. A low-`work` head gets a bigger face and
    stance, and bends the same 9–10 yds as the blade, at the same complexity (the complexity reads the curve asked
    for, not the club). So low `work` only damps the player's own mouse errors (S2.4).
  - **Stopping:** the forgiving sets land steeper than the blade (S5.2), and every set rolls 4.8–5.5 yds on a green.
  - **What's left for the blade:** a lower Low 2 (an apex of 25 against 35–38 yds; S2.3) and hand-made curves.
- **Why it matters:** every career picks irons. The cheapest new set is about the best for any player, and the
  dearest ordinary set (620 CB, $1,600) is one of the worst value. Moving up to a players' set makes a player worse.
- **Fix (M):** make forgiveness cost something a player feels:
  - a preset curve that costs more complexity on a low-`work` head (asking a GI to bend is harder);
  - the spin and landing changes in S5.2, so the GIs really are harder to stop;
  - S2.4's fix, so low `work` damps the mouse less.

  Or decide that the GIs are meant to be best for most players (true of real golf) and give the blades a clear edge
  (spin from rough, a better Low 2, a lower complexity for presets). **Re-measure:** this table, S6's dispersion, and
  the shop bars.

### S5.2 [Medium, bug] Game-improvement and in-between sets land 2–3° steeper than the blade, not 3–5° flatter
- **✅ Fixed 2026-11-20 (as far as the current flight allows):** the sets now take dynamic loft off instead of adding it,
  and spin less. Each model's new values are in `CLUB_MODELS`, and the table in `CAMPAIGN_PLAN.md` is updated. 7 iron
  against the Wilson blade, after:

  | Set | Carry Δ | Spin Δ | Launch Δ | Landing Δ | Roll on a green (blade 4.8) |
  |---|---|---|---|---|---|
  | JPX 925 HM ("lands flattest and runs") | +14 | −1,518 | −2.5° | **−1.2°** (flattest GI) | **7.4** (most) |
  | 101 MKII | +11 | −1,376 | −1.6° | −0.8° | 7.0 |
  | Qi Max ("highest launching; holds greens best of the GIs") | +13 | −1,178 | −1.5° (highest GI) | 0.0° | 6.6 (least GI) |
  | Apex Ai200 | +8 | −960 | −0.9° | −0.2° | 6.2 |
  | ZXi7 | +5 | −669 | −0.5° | −0.2° | 5.8 |
  | 620 CB | +1 | −314 | −0.2° | −0.3° | 5.3 |
  | M2 / AP1 (used) | +10 / −1 | −1,605 / −1,158 | | −0.5° / −1.6° | 7.3 / 6.8 |

  Every set now lands at or flatter than the blade, rolls further, and meets the carry and spin targets. Each model's
  note now matches the measurements. The full 3–5° flatter isn't reachable through the clubs: at 7 iron speeds the
  lift is at its ceiling (S3.1), so less spin barely lowers the flight. Taking 2.5° off the launch flattens the
  landing by only about 1°. It will follow from S3.1's refit. The luxury rule still holds: Beres 5-Star +13 yds and
  85% within 10 yds, against the JPX's +14 and the Qi Max's 89%.
- **Update with S3.1's refit (2026-11-20):** the target is now nearly reached. The strong-lofted sets land 1.7–4.0°
  flatter than the blade (JPX 47.0° against 51.0°).
- **Where:** the iron models' `add.dynLoft` (+1.8 on every set from the AP1 to the Ai200, about lines 12250–12255) and
  their spin factors (0.92–0.97). The plan's table had +0.7 to +1.4 and 0.82–0.90.
- **Measured** (7 iron against the Wilson blade):

  | Set | Carry Δ | Spin Δ | Landing Δ | Target (CAMPAIGN_PLAN.md) |
  |---|---|---|---|---|
  | Qi Max | +10 | −612 | **+3.1°** | +10–14 yds, −1,000 to −1,500 rpm, **3–5° flatter** |
  | JPX 925 HM ("lands flattest and runs") | +13 | −817 | **+3.3°** (the steepest of all) | same |
  | 101 MKII | +8 | −673 | +2.4° | same |
  | Apex Ai200 | +8 | −465 | +2.8° | +3–8 yds, 1–2° flatter |
  | ZXi7 | +3 | −384 | +2.0° | same |
  | 620 CB | 0 | −173 | +0.4° | same |
  | M2 (used) | +7 | −842 | +2.1° | about a blade's distance |
- **Why it happens:** the static loft is cut (5.5° on the Qi Max), but static loft only feeds smash, club fit and spin
  authority. What flies is `dynLoft`, which goes *up* 1.8°, so the GIs launch about 1.5° higher than the blade. The
  research table says the launch should be "about the same", with the spin 1,000–1,500 lower.
- **Fix (S–M):** `dynLoft` about +0 to +0.5 and spin ×0.82–0.86 for the GIs, about ×0.9 for the in-between sets (the
  plan's own values). Then re-tune `speed` so the carry gains stay in the targets. **What else it would move:** S5.1
  (the GIs become harder to stop), the shop's Stopping bar, every career's iron yardages, and the hustlers' tables if
  they use models.

### S5.3 [Medium, bug] The shop's "Stopping" bar reads the angle of the ball's last little hop
- **✅ Fixed 2026-11-20:** `shopStats` now flies the test shot onto a green. It records the landing angle at the first
  touchdown (irons 45.8–47.6°, drivers 36.6–40.4°, wedges 49.6–49.9°). The Stopping bar now shows the roll there (less
  roll gives a longer bar), because the sets' real stopping difference is in their roll more than their angle.
  Measured in the pro shop of a guest career:
  - **Irons:** Wilson blade 100%, MB Forged 97%, 620 CB 83%, ZXi7 67%, Ai200 52%, Qi Max 40%, AP1 34%, 101 MKII 28%,
    M2 18%, JPX 15%.
  - **Wedges:** Vokey SM11 100%, worn SM6 15%.
  - **Drivers:** Triple Diamond 100% (the fade), Max D 15% (the draw).
- **Where:** `shopStats` (about line 12914) records the angle when the flight's phase first changes. That happens
  when the bounces end and the roll starts, not when the ball first lands.
- **Measured:** the shop's `land` against the real first landing: drivers 9–11° (real 37°), irons 31–37° (real
  47–51°), wedges **71–82°** (real 50°). For the irons the bar ranks the blade (37) above the GIs (32–34). That is the
  order the plan wants, but the flight does the opposite (S5.2).
- **Why it matters:** the bar is what a player shops by, and it's measuring noise.
- **Fix (S):** take the angle when `f.carry` is first set (as `swing-bag.js` does), or show the roll on a green
  instead. After S5.2 the true order would also be the intended one.

### S5.4 [Medium, feel / balance] The low-spin drivers are shorter than the forgiving ones, even from the middle
- **✅ Fixed 2026-11-20:** S3.1's refit did most of it. Under the new flight a drive's total hardly changes with spin
  between 2,300 and 3,200 rpm (283–284 yds at the stock launch), so the base driver is no longer under-spun. The
  models' speeds then set the trade-off: low-spin heads ×1.018 (were ×1.012), the G440 K ×0.99 (×0.995), the Max D
  ×0.995 (×1.0). The luxury heads follow the lines they copy: Prestigio ×0.995, Beres ×0.99, and Crown Jewel now the
  Qi4D exactly. Centred carry / total, then carry at 14 mm toe and heel:

  | Driver | Centred | Toe 14 | Heel 14 |
  |---|---|---|---|
  | Qi4D LS (low spin) | **272 / 289** | 250 | 250 |
  | Triple Diamond (low spin, fade) | **272 / 286** | 249 | 248 |
  | Qi4D (all-rounder) / Crown Jewel | 267 / 283 | 252 | 255 |
  | G440 K (max forgiveness) | 265 / 281 | **261** | **264** |
  | Quantum Max D | 265 / 285 | 257 | 261 |
  | Prestigio / Beres 5-Star (luxury) | 266 / 283 · 265 / 282 | 256 · 258 | 259 · 262 |
  | Base driver (the test round) | 266 / 283 | 247 | 250 |

  The low-spin heads now beat the all-rounder by 5 yds of carry from the middle and lose more off-centre. The
  forgiving heads give up 2 yds centred and keep 9–10 more at 14 mm. No luxury head beats the best ordinary one on any
  number. S5.5 (a forgiving head's toe hit hooks) is still open.
- **Measured** (teed; carry and side in yds; side + = right):

  | Driver | Centred: carry / total, spin | Toe 8 mm | Toe 14 mm | Heel 14 mm | Dex 2: mean side, 2σ wide, in a 30-yd fairway | Dex 5 |
  |---|---|---|---|---|---|---|
  | Base | 265 / 286, 2,600 | 262, 4 L | 244, 3 L | 251, 4 R | +1, ±72, 34% | ±49, 49% |
  | XR 16 (starter) | 263 / 282, 2,972 | 262, 7 L | 246, 3 L | 247, 9 L | −4, ±88, 27% | ±61, 41% |
  | M2 (used) | 264 / 284, 2,848 | 263, 7 L | 248, 4 L | 251, 3 L | −2, ±90, 25% | ±62, 41% |
  | **G440 K** (max forgiveness) | **270 / 290**, 2,835 | 267, 20 L | **264**, 30 L | 269, 15 R | −6, ±54, **42%** | ±37, 56% |
  | Quantum Max D | 268 / 292, 2,707 | 266, 30 L | 259, 37 L | 265, 11 L | **−20**, ±58, 33% | ±42, 39% |
  | Qi4D (all-rounder) | 268 / 288, 2,704 | 265, 5 L | 252, 3 L | 258, 4 R | +1, ±72, 34% | ±50, 48% |
  | **Qi4D LS** ("longest from the middle") | 266 / 288, 2,496 | 265, 3 R | **246**, 12 R | 246, 12 L | +1, ±84, 31% | ±59, 44% |
  | Triple Diamond | 267 / 285, 2,500 | 267, 23 R | 245, 36 R | 244, 1 L | **+15**, ±91, 28% | ±66, 38% |
  | Luxury: Prestigio / Beres / Crown Jewel | 270 / 290 · 269 / 290 · 268 / 289 | | | | 37% · 40% · 34% | |
- **Expected:** "low-spin heads should be longer when centred and worse off-centre; forgiving heads the reverse"
  (plan). Qi4D LS: "the longest when you find the middle".
- **Why it happens:** the base driver is slightly under-spun and under-launched for its ball speed (S4.3: High 1 is
  longer than Mid). So any head that adds spin and launch gains, and the low-spin heads lose. The G440 K is the
  longest centred and the most forgiving, so the low-spin heads have no upside.
- **Fix (S):** with S4.3, put the base driver at or a little above the game's optimum spin for 165 mph, so taking spin
  off helps a centred strike. Then check that LS and TD beat the Qi4D by 4–8 yds centred. The LS heads' extra speed
  (×1.012) is the other knob. **Re-measure:** this table and the fairway woods (same lines at half strength).

### S5.5 [Medium, realism] A forgiving driver's toe hit hooks 20–30 yds; a low-spin one's slices up to 36
- **✅ Fixed 2026-11-20:** in `modelMods` a driver or wood model's `bulge` is scaled by its `gear` × `work`. The gear
  is the face twist, and the work turns that twist into curve, so the two still cancel as on the base club. Where a
  drive finishes, relative to the same model's centred drive (yds, + right; toe 8 / toe 14 / heel 8 / heel 14):

  | Driver | Before | After |
  |---|---|---|
  | Base / Qi4D | −4 / −3 / +5 / +4 | −3 / −2 / +4 / +2 |
  | G440 K (forgiving) | −14 / **−24** / +13 / +21 | −1 / −2 / +2 / 0 |
  | Quantum Max D | −10 / −17 / +7 / +9 | −2 / −2 / −2 / −6 |
  | Qi4D LS (low spin) | +2 / +11 / −4 / −13 | −5 / −2 / +5 / +2 |
  | Triple Diamond (low spin) | +8 / +21 / −7 / −16 | −2 / +4 / +8 / +6 |

  (The Max D's and Triple Diamond's centred drives still sit 17 yds left and 12 right: their built-in draw and fade,
  S5.8.) A forgiving head now shows its forgiveness as a straighter miss and more carry kept (G440 K 262 at 14 mm,
  against 252 for the Qi4D). The fairway woods and hybrids follow at half strength. `tools/test/swing-fix5.js`.
- **Where:** `modelMods` multiplies `gear` (the face twist) but leaves `bulge` alone. The base driver's twist and
  bulge nearly cancel (toe 8 mm: 4 yds left). On a G440 K (gear ×0.75) the bulge wins: 20 yds left, 30 at 14 mm. On a
  Triple Diamond (gear ×1.25) the twist wins: 23 and 36 yds right. The same happens in the woods: a G440 K 3 wood's
  toe hit at 10 mm finishes 12 left, against 5 for the base.
- **Expected:** a high-MOI head keeps an off-centre hit straighter, and bulge is shaped to bring a toe hit back
  toward the middle on any head.
- **Why it matters:** the "most forgiving driver going" turns an ordinary toe strike into a hook, and the shop calls
  that forgiveness.
- **Fix (S):** scale `bulge` by the same factor as `gear` in `modelMods` (for drivers and woods), so the two still
  cancel and forgiveness shows as less speed loss and less curve. **What else it would move:** driver and wood
  dispersion (S6), and the fairway percentages above.

### S5.6 [Medium, feel / balance] A game-improvement set leaves a 23–27 yd hole between its PW and the gap wedge
- **✅ Mostly fixed 2026-11-20:** an iron set's loft change now tapers toward the wedge. The 9 iron gets 75% of it and
  the PW 40% (the 4 and 5 irons still 80%). The strong-lofted sets' PWs are now 43.6–44.4° (Takomo's spec page: 43°;
  they were 40–41°). After (with S4.2's speeds; base gap wedge 122):

  | Set | PW loft | 9 iron → PW | PW → GW |
  |---|---|---|---|
  | Base, blades, 620 CB | 46° | 14 | 13–14 |
  | ZXi7 | 45.2° | 15 | 16 |
  | Ai200, M2 | 43.8–44.4° | 17 | 18 |
  | 101 MKII | 44.0° | 17 | 20 |
  | Qi Max, JPX 925 HM | 43.6–43.8° | 18 | **22** (was 25–27) |

  **What's left:** a strong-lofted PW still carries 140–145, so it leaves about 20 yds before a 50° gap wedge. Real
  sets of this kind leave the same gap, which is why they're sold with an approach wedge (about 48°). If the game
  should close it, a model option for the gap wedge's loft (48° with a GI set) is the next step. A stronger taper was
  tried: it gained about 2 yds and pushed the PW lofts past the real ones.
- **Measured** (carry gaps; base gap wedge 113, 3 hybrid 223):

  | Set | 3 hybrid → 4 iron | 9 iron → PW | PW → GW |
  |---|---|---|---|
  | Base, blades, 620 CB | 12 | 17 | 14–15 |
  | ZXi7 | 10 | 17 | 18 |
  | Ai200, 101 MKII, M2 | 5–9 | 17 | 22–23 |
  | Qi Max, Beres | 4 | 17 | 24–25 |
  | JPX 925 HM | **2** | 17 | **27** |
- **Expected:** a strong-lofted set's own PW is about 43° (Takomo's spec page: PW 43°, with a 48° gap wedge in the
  set). The game takes the full 5–6° off the PW, giving 40–41°, while the gap wedge stays at 50°. The 4 iron near the
  3 hybrid is realistic (a GI 4 iron does about a hybrid's job).
- **Why it matters:** with a GI set, 115–135 yds becomes a partial-swing zone. S4.2 already makes the wedge gaps wide.
- **Fix (S):** apply about half the set's loft change to the PW, as the 4 and 5 irons get 80%. That gives about 43°
  and a PW→GW gap of about 17. **What else it would move:** the sets' PW carries (−4 to −6), the 9 iron→PW gap
  (17 → about 12), and S4.2's wedge speeds.

### S5.7 [Medium, feel / balance] One putter is best for everyone: the OZ.1
- **✅ Fixed 2026-11-20:** OZ.1 `pathGain` 0.22 (was 0.18) and `tempoZone` 0.03 (0.045, now the strictest, as its
  note says). The blades' rhythm windows are wider: Newport 2 and Circle T 0.11 (0.09), PLD Anser 0.10 (0.085), White
  Hot 0.085 (0.07). The luxury Atelier mallet now has the Spider's start line and window (0.27, 0.04), just below it.
  The same 1,500 putts each (`tools/test/swing-fix9.js`; % holed, and at 40 ft the share left more than 4 ft away):

  | Putter | 10 ft | 20 ft | 40 ft | 40 ft misses past 4 ft |
  |---|---|---|---|---|
  | OZ.1 (zero-torque) | 94 → 91% | **79 → 70%** | 43 → 34% | 15 → 20% |
  | Spider Tour (mallet) | 93 → 92% | 70% | 31 → 32% | 19 → 18% |
  | PLD Anser (blade) | 94 → 95% | 60 → 64% | 29 → 27% | 10 → **7%** |
  | Newport 2 (blade) | 93 → 94% | 58 → 60% | 27 → 26% | 10 → **6%** |
  | White Hot #1 (starter) | 89 → 91% | 53 → 54% | 24 → 23% | 12 → 10% |
  | Atelier mallet (luxury) | 95 → 93% | 75 → 68% | 35 → 32% | 13 → 18% |

  It's now a trade. The mallets hole more from mid range, and the blades leave long putts close (a third as many
  three-putt-length leaves). By a rough count of expected strokes from 40 ft they come out about even. These numbers
  still rest on the assumed stroke errors.
- **Measured** (2,000 putts each, flat Stimp 11, Dexterity 5, the same stroke errors for every putter: path ±1° sd,
  tempo ±8% sd, gate excursion |0.03| sd, wobble 1–4 px, length ±6% sd; % holed and the average leave of a miss in ft):

  | Putter | gate | pathGain | sweet | tempoZone | 6 ft | 10 ft | 20 ft | 40 ft |
  |---|---|---|---|---|---|---|---|---|
  | White Hot #1 (starter) | 0.028 | 0.42 | 3.5 | 0.07 | 99%, 0.9 | 87%, 1.2 | 50%, 1.7 | 21%, 2.6 |
  | Newport 2 / Circle T | 0.030 | 0.40 | 4 | 0.09 | 100%, 1.4 | 92%, 1.1 | 55%, 1.6 | 23%, 2.4 |
  | PLD Anser | 0.031 | 0.38 | 4.5 | 0.085 | 100%, 0.8 | 92%, 1.1 | 57%, 1.6 | 24%, 2.4 |
  | Spider Tour | 0.050 | 0.27 | 10 | 0.04 | 99%, 0.4 | 92%, 0.9 | 64%, 1.9 | 25%, 3.1 |
  | **OZ.1** | 0.046 | **0.18** | 8 | 0.045 | 99%, 0.5 | **95%, 0.7** | **74%, 1.7** | **36%, 3.0** |
  | Atelier mallet (luxury) | 0.048 | 0.25 | 9 | 0.06 | 100%, 0.4 | 95%, 0.7 | 70%, 1.7 | 30%, 2.7 |
  | (range) Blade / Mallet | 0.030 / 0.048 | 0.40 / 0.28 | 4 / 9 | 0.08 / 0.04 | 99% / 99% | 91% / 93% | 54% / 61% | 23% / 24% |
- **Why it matters:** the start line (`pathGain`) dominates. The blades' "best feel for pace" shows only as misses
  that finish about 0.6 ft closer from 40 ft, which rarely saves a stroke. The OZ.1's note says "strictest on rhythm",
  but its tempo zone (0.045) is wider than the Spider's (0.04).
- **Caveat:** this rests on the stroke errors assumed above. With a wider tempo spread the blades gain. S8 should
  repeat it with the measured human stroke.
- **Fix (S):** narrow the OZ.1's tempo zone (about 0.03) or take its `pathGain` to about 0.22, and give the blades a
  pace edge that saves strokes (for example a smaller length error on long putts). Re-measure this table.

### S5.8 [Low, feel / balance] The Max D finishes 20 yds left of a straight swing, the Triple Diamond 15 right
- **✅ Fixed 2026-11-20:** offsets reduced. Max D 0.6 (was 1.5), Triple Diamond −0.4 (−0.8), Beres 5-Star 0.5 (0.8);
  their fairway-wood versions follow at half. A centred, straight-swung drive now finishes 7 yds left with the Max D
  (was 17), 6 right with the Triple Diamond (was 12) and 6 left with the Beres. That is a "few yards" bias, still the
  most in each direction. `tools/test/swing-fix5.js`.
- **Measured:** mean side of ordinary swings (table in S5.4): Max D (offset 1.5) −20 yds at both Dexterities;
  Triple Diamond (offset −0.8) +15; G440 K −6; Beres 5-Star −10. The stock preview includes the offset, so the shape
  line shows it.
- **Expected:** a draw-biased driver takes a slice back by a few yards, roughly 5–10 (approximate). Here a straight
  swing finishes off a 30-yd fairway, and the Max D's fairway rate (33–39%) is below the base driver's.
- **Fix (S):** offset about 0.6 for the Max D and −0.4 for the Triple Diamond. The woods get half of that.

### S5.9 [Low, feel / balance] The starter irons are as accurate as a new blade; their bent lie is nearly invisible
- **Measured** (AP1 716, 7 iron, Dexterity 2: mean total, mean side, 2σ wide × deep, within 10 yds; light rough spin
  and flier rate):

  | | Mean, side | 2σ | Within 10 yds | Light rough |
  |---|---|---|---|---|
  | AP1 without its flaws | 176, 3.4 L | 10.9 × 5.6 | 91% | 4,705 rpm, 17% |
  | + worn shafts (`consist` 1.8) | 176, 3.6 L | 18.9 × 6.5 | 68% | 4,714, 17% |
  | + worn grooves (`groove` 0.8) | 179, 3.5 L | 11.1 × 5.7 | 90% | 2,956, 21% |
  | As sold | 178, 3.7 L | 19.3 × 6.6 | 68% | 2,962, 21% |
  | As sold, the worst bent lie (1.2°) | 179, **5.0 L** | 19.9 × 6.6 | 66% | 2,919, 21% |
  | A new Staff Model Blade | 179, 0.1 R | 19.1 × 8.3 | 68% | 4,767, 17% |
  | A new 101 MKII ($580) | 189, 3.1 L | 8.9 × 5.4 | 96% | 4,305, 17% |
- **Expected:** "about as far as a blade but with a landing area ~35% wider, fliers from the rough and a fixed push
  or pull on some clubs" (`CAMPAIGN_PLAN.md`). The distance and the rough are right. The width matches the blade's,
  and the worst bent lie moves the ball 1.3 yds.
- **Why it matters little:** the first upgrade is still felt (+11 yds, 96% against 68%). If the starter set should
  be clearly the worst, `consist` about 2.2 and a bias of about ±3° would do it.

### Checked and fine
- **Lofts against the makers' pages:**
  - Qi Max 7 iron: 28° ([Scheels](https://www.scheels.com/p/647298-M2117207),
    [Global Golf](https://www.globalgolf.com/golf-clubs/1088672-taylormade-qi-max-iron-set/?lft=10)). The game has
    28.5°, which is close enough.
  - Takomo 101 MKII: 29° ([takomogolf.com](https://takomogolf.com/products/iron-101-mkii)).
  - Wilson Staff Model Blade: 34°
    ([wilson.com](https://www.wilson.com/pages/golf-pdp-specs-wg1p0385-staffmodelbladeirons)).
  - The rest of the 7 iron lofts fit their categories.
- **Luxury (design direction 11):** Prestigio irons = Ai200, Rose Gold = Opus, Damascus = Vokey SM11, Circle T =
  Newport 2, all exactly. Beres 5-Star irons: +10 yds, 95% within 10 yds; the best ordinary sets are +13 (JPX) and 96%
  (Qi Max / 101 MKII). Sovereign sits inside the in-between sets. Drivers: Prestigio 270 / 290 equals the G440 K, and
  every luxury driver's fairway rate is below the G440 K's 42%. The Crown Jewel is 1 yd past the Qi4D it "plays like",
  inside the rule. The Atelier mallet (70% from 20 ft) is behind the OZ.1 (74%). No luxury model is best on any number.
- **Fairway woods and hybrids** (the driver lines at half strength) differ by at most 3 yds of carry, and spread from
  ±17 (G440 K) to ±23 (Triple Diamond) on the 3 wood. The starter XR hybrid is 10 yds short. The G440 K hybrid's toe
  hit finishes straight, so its half-strength gear happens to fix S4.5.
- **Wedges** (sand wedge, Dexterity 2):
  - The worn SM6 spins 9,090 rpm on a full shot (fresh: 10,100), 3,653 from sand (6,544) and 2,851 from heavy rough
    (5,068), with 23% fliers from light rough (16%). That is "no check from the rough", as its note says.
  - Cavity wedges are a little tighter (±2.1 wide against ±2.7). The CB 12's flop costs 0.66 against 0.55
    ("hard to open up"). The SM11 spins 2% more and flops a little easier.
  - Bounce 10 / 12 / 14 changes a bunker shot's spread only from ±7.4 to ±6.8 yds, which is a small effect, but
    the right way round.
- **Prices** run with category inside each kind. The luxury prices are deliberate.

### Noticed for later
- **S6:** at Dexterity 2 the base driver's ordinary swings spread ±72 yds (2σ) and find a 30-yd fairway 34% of the
  time; at Dexterity 5, ±49 and 49%. Those come from `SPREAD`'s assumed errors; check them with S1's human values.
- **S8:** the putter table above should be redone with measured human stroke errors.
- **S9:** the shop's bars (S5.3), and the bars for irons being measured on the 7 iron only.
- The plan's model tables in `CAMPAIGN_PLAN.md` no longer match the code (dynLoft, spin, gear); update them with S5.2.

## Section S6 — Stats, lies, dispersion and difficulty (2026-11-20, Opus 5.5)

**Summary.** These work as designed:
- Dexterity scales dispersion smoothly.
- The asks compound without a cliff.
- Tilt starts gently and then compounds, and Composure holds it back.
- Power helps more from rough, as its comment says.
- The lies and club fit deliver design direction 9: a driver from a bunker goes 8 yds.

Two medium findings:
- A low shot is about three times as wide as a high one for the same added risk, because low spin is counted
  twice.
- From a bad lie, the bag's carry range is centred on a perfect strike. At high Perception it shows a precise
  number about 10% too long.

The overswing asks are wider than "slightly". Dexterity 10 is tighter than a tour pro. Tilt acts in three places.
Re-measured with a human hand, S2.1's hardpan cliff ruins two shots in three.

**How it was tested.** `tools/test/swing-risk.js` runs 300–800 seeded shots per case through `computeImpact` and the
real flight (base clubs, fairway unless said, Power 5, no wind). There are three swing models:
- **robot:** a perfect swing, so only the game's own Dexterity scatter is left.
- **game:** the minimap's assumption (`SPREAD`).
- **human:** S1's estimate of a real hand. Wobble 1.5–5.5 px, a ring miss of ±2% sd, and otherwise as `SPREAD`. The
  user hasn't logged real swings with `swing-mylog.js` yet, so every "human" number rests on that estimate.

All widths are ±2σ (about 95% of shots inside) in yds.

| # | Severity | Kind | Finding | Fix size |
|---|---|---|---|---|
| S6.1 | Medium | Bug | Low spin is counted twice, so Low 2 is 3× as wide as stock while High 2 adds nothing | S |
| S6.2 | Medium | Bug | From a bad lie the bag's range is centred on a perfect strike: 10% long, and at Perception 10 never right | S–M |
| S6.3 | Medium | Feel / balance | Overswing is 40–100% wider, more than "slightly", and gains nothing at low Dexterity | S |
| S6.4 | Low | Feel / balance | Dexterity 9–10 is tighter than a tour pro, and the game's own scatter there is nearly zero | S |
| S6.5 | Low | Feel / balance | Tilt acts in three places, so its numbers understate it | — |

### Dispersion by club and Dexterity (2σ width × depth, ± yds)

| Club | Swing | Dex 1 | Dex 2 | Dex 5 | Dex 8 | Dex 10 |
|---|---|---|---|---|---|---|
| Driver | robot | 70 × 11 | 63 × 9 | 40 × 6 | 17 × 3 | **5 × 1** |
| | human | 79 × 21 | 74 × 20 | 52 × 15 | 28 × 12 | 17 × 12 |
| 3 Hybrid | human | 34 × 9 | 31 × 9 | 21 × 8 | 12 × 7 | 7 × 7 |
| 7 Iron | robot | 16 × 4 | 14 × 4 | 9 × 2 | 4 × 1 | **1.2 × 0.3** |
| | game (`SPREAD`) | 19 × 8 | 17 × 8 | 12 × 7 | 7 × 6 | 4 × 6 |
| | human | 23 × 14 | 21 × 12 | 16 × 8 | 10 × 6 | 7 × 6 |
| PW | human | 13 × 7 | 12 × 6 | 9 × 5 | 5 × 4 | 3 × 4 |
| Sand Wedge | human | 8 × 4 | 7 × 4 | 5 × 3 | 3 × 3 | 2 × 3 |

Against the benchmarks (approximate): a tour 7 iron finishes within about 8–10 yds either side, so Dexterity 8
(±10) is tour level. Dexterity 5 (±16) is a good amateur. The driver is about 3.3× as wide as the 7 iron at every
level, close to the tour ratio. With the human hand, the share of drives whose spin axis passes 30° (where S3.3
bites) is 5% / 4% / 1% / 0% / 0% at Dexterity 1 / 2 / 5 / 8 / 10.

### S6.1 [Medium, bug] Low spin is counted twice, so Low 2 is 3× as wide as stock while High 2 adds nothing
- **✅ Fixed 2026-11-20:** `lowSpinMult` is read from the club's own spin off the lie (`club.spin × lie.spin`), not
  the spin after the height and spin asks. The spin-loft term in `axisGainFor` is kept. Before → after (2σ width, Dex
  5, human swing):

  | Club | Low 2 | Low 1 | Mid | High 1 | High 2 | More / Less spin |
  |---|---|---|---|---|---|---|
  | 7 Iron | ±56 → **±36** | ±28 → ±23 | ±16 | ±16 → ±18 | ±17 → **±21** | ±16 / ±21 → ±18 / ±19 |
  | 4 Iron | ±53 → ±34 | ±40 → ±33 | ±27 | ±25 → ±29 | ±26 → ±33 | ±27 / ±29 → ±28 / ±28 |
  | 3 Wood | ±49 → ±31 | ±40 → ±31 | ±29 | ±32 → ±38 | ±34 → ±47 | |
  | Driver | ±72 → ±49 | ±60 → ±45 | ±49 | ±63 → ±78 | ±69 → **±99** | ±50 / ±49 → ±52 / ±48 |
  | Sand Wedge | ±13 → ±10 | ±7 | ±5 | ±6 | ±7 | |

  Low and High now both widen the shot, and the read-out is closer to the truth (7 iron, Dex 5: Low 2 reads 1.62× and
  is 2.2× wide, was 3.5×; High 2 reads 1.62× and is 1.26×, was 1.11×). Low is still somewhat wider than High: that's
  the spin-loft term (a de-lofted shot really does tilt more per degree), which the fix keeps on purpose.

  **A side effect to know about:** a high driver or 3 wood is now wider than before (driver High 2 ±69 → ±99). Its
  extra spin used to cancel the longer hang time; now only the spin-loft term does, and for the driver that term sits
  at its cap (`axisGainMax`), so it barely moves. A High 2 drive is a poor shot anyway (281 total against 286). If it
  should be gentler, lower its complexity or let `axisGainMax` follow the spin loft. The draw / fade solver re-solves
  itself: 0 of 140 fairway solves fail. `tools/test/swing-fix1.js` re-measures it.
- **Where:** `computeImpact` steps 2 and 8. Taking loft off (Low) lowers the spin loft, which `axisGainFor` already
  turns into more spin-axis tilt per degree (`1 / sin(spin loft)`). It also lowers the backspin, which raises
  `lowSpinMult`. That multiplies the axis gain again, the baseline face and strike scatter (`clubSpread`), and the
  bulge. High does the reverse in all three places.
- **Measured** (7 iron, human swing; complexity · width × depth · mean total):

  | Ask | Dex 2 | Dex 5 | Dex 8 |
  |---|---|---|---|
  | Stock | 0.15 · 21 × 12 · 177 | 0.08 · 16 × 8 · 180 | 0.04 · 10 × 6 · 181 |
  | High 1 | 0.60 · 21 × 15 · 168 | 0.39 · **16** × 8 · 172 | 0.19 · 9 × 5 · 174 |
  | High 2 | 1.23 · 23 × 18 · 159 | 0.80 · **17** × 10 · 163 | 0.39 · 9 × 5 · 166 |
  | Low 1 | 0.69 · 36 × 20 · 181 | 0.43 · **27** × 12 · 186 | 0.21 · 16 × 8 · 188 |
  | Low 2 | 1.58 · **67** × 34 · 180 | 1.00 · **53** × 24 · 188 | 0.48 · 30 × 11 · 195 |
  | More spin / Less spin | 0.54 · 21 · 167 / 0.33 · 28 · 182 | 0.34 · 16 · 170 / 0.20 · 21 · 185 | |
  | Low 1 draw (with the grain) | 0.83 · 41 · 183 | 0.53 · 35 · 188 | 0.25 · 26 · 192 |
  | High 1 draw (against the grain) | 1.03 · 26 · 168 | 0.67 · 22 · 174 | 0.33 · 15 · 176 |

  At Low 2 the axis gain is about 2.0× stock (spin loft ×1.31, `lowSpinMult` ×1.54) and the baseline scatter 1.25×.
  At High 2 the gain falls to about 0.63×, which cancels the extra complexity.
- **Expected:** design direction 3: height changes in either direction compound into uncertainty. The complexity
  number shows Low 2 and High 2 as similar asks (1.00 and 0.80), and the player sees that number. A knockdown is
  also a real control shot, not the wildest one.
- **Why it matters:** High 2 costs 17 yds and adds no risk. Low 2 is the riskiest shot in the game: wider than a
  stacked 110% + draw + High 1 + More spin (±30 at Dexterity 5). "Against the grain" is also swamped: a low draw (with
  the grain) is wider than a high draw (against it). It is also why "Less spin" widens and "More spin" doesn't.
- **Fix (S):** read `lowSpinMult` from the club's own stock spin (`club.spin`, with the lie), not from the spin after
  the height and spin asks. Club-to-club curve stays as it is; the spin loft term still makes a low shot curve a bit
  more, and the complexity number carries the risk of the ask. **What else it would move:** S7's height and spin
  tables, the solved shapes at Low and High (the solver re-solves itself), the minimap ellipse for those shots, and
  wind play.

### S6.2 [Medium, bug] From a bad lie the bag's range is centred on a perfect strike
- **✅ Fixed 2026-11-20:** `lieRead` now centres a bad lie's band on that lie's real average. The factor (`lieFactor`)
  is a seeded batch of 100 ordinary swings from the lie, against their perfect strike, divided by the same ratio from
  the fairway. So the fairway's number (a perfect strike) stays the reference, and Perception's band and bias work
  as before. The minimap's landing area no longer applies the lie twice. Measured against 600 real shots (Dex 5,
  the human hand; `tools/test/swing-fix7.js`):

  | Lie, club | True mean (10th–90th) | Per 10 band: before → after | True mean inside, Per 1 / 5 / 10: before → after |
  |---|---|---|---|
  | Light rough, 7 iron | 152 (134–169) | — → 151–155 | → 100 / 100 / 100% |
  | Heavy rough, 7 iron | 98 (75–124) | 119–125 (vs 109) → **97–102** | 100 / 65 / **0%** → 100 / 100 / **100%** |
  | Heavy rough, PW | 87 (69–106) | 87–92 (vs 84) → 85–89 | 100 / 100 / 0% → 100 / 100 / 100% |
  | Fairway bunker, 7 iron | 140 (123–157) | 148–153 (vs 144) → 139–143 | 100 / 100 / 0% → 100 / 100 / 100% |
  | Fairway bunker, PW | 112 (101–124) | 107–111 (vs 106) → 111–114 | 100 / 100 / 0% → 100 / 100 / 100% |

  (The true means differ a little from S6's table because the flight and club speeds changed since.) The cost: about
  250 ms of computing the first time the lie changes (every club's batch), then cached. The flights stop where they
  land, and the fairway half is kept for every lie.
- **Where:** `lieRead` (about line 15069) centres its band on `stockShot`, a shot with no scatter: an average lie,
  the strike at the lie's fixed offset, no twist. Perception then narrows the band (to 12% of its width at
  Perception 10) and shrinks a random bias.
- **Measured** (Dexterity 5, human swing, 600 shots; the read is averaged over 40 lie seeds):

  | Lie, club | True carry: mean (10th–90th) | Per 1 band | Per 5 band | Per 10 band | True mean inside the band: Per 1 / 5 / 10 |
  |---|---|---|---|---|---|
  | Light rough, 7 iron | 158 (141–176) | 140–182 | 147–173 | 157–162 | 100% / 100% / 100% |
  | Light rough, PW | 116 (103–129) | 100–131 | 106–125 | 114–118 | 100% / 100% / 100% |
  | Heavy rough, 7 iron | **109** (85–135) | 98–149 | 107–138 | **119–125** | 100% / 65% / **0%** |
  | Heavy rough, PW | 84 (66–102) | 70–107 | 78–101 | 87–92 | 100% / 100% / 0% |
  | Fairway bunker, 7 iron | 144 (129–160) | 132–172 | 139–163 | 148–153 | 100% / 100% / 0% |
  | Fairway bunker, PW | 106 (95–117) | 94–123 | 100–118 | 107–111 | 100% / 100% / 0% |
- **Why it happens:** in heavy rough a real strike is about 2.4 mm further out (the lie) plus the hand's own error,
  past the 5 mm sweet spot, and the grass twists the face. Those cost about 10% on average, and the stock shot has
  none of it. (On a fairway the same gap is 2 yds: 174 against 176.)
- **Why it matters:** the player with the best Perception gets the most confident and most wrong read. A 7 iron from
  heavy rough reads "119–125" and averages 109, with 80% of shots between 85 and 135. The minimap's landing area
  (`landArea`) and the club suggestion use the same read. Design direction 13 says Perception sets accuracy; here a
  high value only sets precision.
- **Fix (S–M):** centre the read on the lie's real average (a seeded batch, as `landSpread` already runs, or a
  per-lie factor). Make it clear the band is the read of the average, or widen it toward the real spread. **What
  else it would move:** the bag's yardages in rough and sand, the minimap ellipse, `suggestClub`, and S9.

### S6.3 [Medium, feel / balance] Overswing is 40–100% wider, and gains nothing at low Dexterity
- **✅ Fixed 2026-11-20:** `TUNE.cxBack` 0.25 (was 0.50) and `TUNE.cxTempo` 0.18 (0.35). S1's human hand, 500 shots
  (`tools/test/swing-fix8.js`; the "before" widths are S6's, under the older flight):

  | 7 Iron | 110% backswing: width × stock, total | 115% tempo | 110% + 115% |
  |---|---|---|---|
  | Dex 2: before → after | 1.43× → **1.26×**; total +3 → **+6** | 1.34×, **+0** → 1.19×, **+2** | 1.92× → **1.51×**; +2 → +6 |
  | Dex 5 | 1.42× → 1.25×; +5 → +6 | 1.33× → 1.18×; +1 → +2 | 1.95× → 1.50×; +5 → +8 |
  | Dex 8 | 1.29× → 1.19×; +6 → +7 | 1.22× → 1.12× | 1.68× → 1.36×; +9 → +10 |
  | **Driver** Dex 2 / 5 / 8 | 1.27× / 1.29× / 1.23× (was 1.47× / 1.50×) | 1.20× / 1.21× / 1.15× | 1.53× / 1.56× / 1.43× (was 1.99× / 2.11×) |

  Over 100% is now a smooth, noticeable cost with a small reward at every Dexterity: a quarter wider at the maximum
  backswing, half again with both maxed. The complexity read-out tracks it (110% at Dex 5 reads 1.28×, and is 1.25×
  as wide).
- **Measured** (human swing; complexity · width × depth · mean total):

  | | Dex 2 | Dex 5 | Dex 8 |
  |---|---|---|---|
  | 7 iron stock | 0.15 · 21 × 12 · 177 | 0.08 · 16 × 8 · 180 | 0.04 · 10 × 6 · 181 |
  | 105% backswing | 0.49 · 26 × 15 · 179 | 0.31 · 19 × 8 · 183 | 0.15 · 12 × 4 · 185 |
  | 110% backswing | 0.83 · 30 × 19 · 180 | 0.53 · 23 × 10 · 185 | 0.26 · 13 × 5 · 187 |
  | 115% tempo | 0.75 · 28 × 18 · **177** | 0.48 · 21 × 11 · 181 | 0.23 · 12 × 6 · 184 |
  | 110% + 115% | 1.67 · **41** × 25 · 179 | 1.08 · **31** × 16 · 185 | 0.52 · 17 × 6 · 190 |
  | Driver stock | 0.27 · 74 × 20 · 280 | 0.14 · 52 × 15 · 282 | |
  | Driver 110% | 0.99 · 109 × 34 · 287 | 0.60 · 78 × 21 · 293 | |
  | Driver 110% + 115% | 1.89 · **147** × 58 · 281 | 1.17 · **110** × 37 · 293 | |
- **Expected:** design direction 2: past 100% "only incrementally punishing: slightly wider dispersion, not a cliff;
  the distance gained … is small". It is smooth, not a cliff, and the gain is small. But 110% widens the shot 40–50%
  and both together double it. At Dexterity 2, 115% tempo gains nothing at all: the 1.5% of speed is lost to worse
  strikes.
- **Why it matters:** for a new career, overswing never pays. That may be the intent; it isn't "slightly wider".
- **Fix (S):** if it should be gentler, lower `cxBack` and `cxTempo` (0.50 and 0.35) by about half, or let Dexterity
  cut them more (`dexRiskMin` 1.75 at Dexterity 1). **Re-measure:** this table, and S9's complexity bar.

### S6.4 [Low, feel / balance] Dexterity 9–10 is tighter than a tour pro; the game's own scatter there is nearly zero
- **Measured:** the table above. At Dexterity 10 the robot swing's 7 iron spreads ±1.2 yds and its driver ±5, against
  ±16 / ±70 at Dexterity 1 (8%, as `TUNE` says). With the human hand, the 7 iron is ±7 (tour about ±8–10) and the
  driver ±17. A tour driver is roughly ±30–35 (approximate, from tour fairway rates of about 60%).
- **Why it matters:** above Dexterity 8 the remaining scatter is the player's own hand. A steady mouse at
  Dexterity 10 hits it straighter than anyone real. This is a judgment call: a maxed stat may be meant to feel
  superhuman.
- **Fix (S):** a floor on `dexSpread` (about 0.25 instead of 0.08) keeps Dexterity 10 at about tour level.

### S6.5 [Low, feel / balance] Tilt acts in three places, so its numbers understate it
- **Where:** tilt multiplies the mouse path (×1 + min(0.6, 0.8 × tilt)), multiplies the strike the same way, and
  adds `(1 + tilt)` to the complexity.
- **Measured** (7 iron, Dex 5, human swing; tilt value · width × depth · mean total):

  | Bad shots in a row | Composure 1 | Composure 5 | Composure 10 |
  |---|---|---|---|
  | 0 | 0 · 16 × 8 · 180 | same | same |
  | 1 | 0.10 · 18 × 9 · 179 | 0.06 · 18 × 9 · 180 | 0.02 · 16 × 8 · 180 |
  | 2 | 0.55 · 29 × 21 · 173 | 0.34 · 24 × 15 · 176 | 0.08 · 18 × 9 · 179 |
  | 3 | 1.35 · 40 × 28 · 167 | 0.84 · 34 × 26 · 169 | 0.20 · 21 × 12 · 178 |
  | 4 | 2.30 · 50 × 29 · 162 | 1.43 · 41 × 28 · 166 | 0.35 · 24 × 15 · 176 |
  | 6 | 4.30 · 72 × 31 · 155 | 2.68 · 55 × 29 · 161 | 0.65 · 31 × 23 · 171 |

  The driver at Composure 5: ±52 → ±74 after 2 bad shots → ±130 after 4, with 19% of drives past a 30° axis.
- **Expected:** design direction 10 (the first forgiving, then compounding, Composure offsets it). That is
  delivered. The note is that a tilt of 0.34 already means +50% width, because of the three places.
- **Fix:** none needed if the user likes the feel. If the ladder's numbers should mean what they say, drop the path
  and strike multipliers and re-tune the ladder.

### S2.1 re-measured with a human hand
Off hardpan, with the human swing and the longest club that fits, 75% of shots are bladed or chunked at Dexterity 2
and 65% at Dexterity 5. A sand wedge is 65%. A bladed 7 iron carries 56 (clean: 167) and a chunked one 98. **S2.1
should be High:** hardpan patches are on the holes (`hole.hardpan`), and the lie reads as mild (97% power).

### Checked and fine
- **Each ask is correctly signed and smooth.** The presets add 20–35% width at Dexterity 2–5 (the committed shape's
  range amplifies errors, 64% at Dexterity 8). Against the grain costs more complexity than with it (Low 1 fade 0.84
  against Low 1 draw 0.53). The full stack (110% + draw + High 1 + More spin) at Dexterity 5 is complexity 1.86,
  ±30 × ±20, 165 total against 180: felt but survivable.
- **Power:** yards per point: driver 7.4, 3 hybrid 5.9, 7 iron 5.0, PW 3.9, sand wedge 3.0. From grabbing lies it's
  worth more, as `lie.grabs` intends. A 7 iron from heavy rough goes 78 / 108 / 144 at Power 1 / 5 / 10 (+85%,
  against +30% on a fairway).
- **Lies** (Dex 5, human; mean carry ± sd):
  - **Fairway:** driver off the deck 192 ± 47 (7% topped or fat).
  - **Light rough:** fliers 14–16% with any club. A flier carries 6 yds further and runs 12 more.
  - **Heavy rough:** 7 iron 108 ± 19, 3 hybrid 129 ± 21.
  - **Fairway bunker:** 7 iron 144 ± 12.
  - **Greenside bunker:** sand wedge 64 ± 6.
  - **Driver from rough and sand (design direction 9):** light rough 51, heavy 14, fairway bunker 16, greenside
    bunker 8. It is topped or fat 40–85% of the time.
- **Club fit:**
  - Fairway: only the driver misfits (0.31, 8% mishit).
  - Heavy rough: the driver, the 3 wood (0.61) and lightly the 2 hybrid and 4 iron (0.22).
  - Fairway bunker: driver to 3 hybrid.
  - Greenside bunker: every club longer than the 8 iron is near impossible.
- **Mishits in ordinary play** (the longest club that fits, 800 shots): none on fairway, heavy rough, fairway bunker
  or greenside bunker; fliers 14% from light rough; only hardpan (above) is a problem.
- **Caddies** (read, not run: it needs a career): `careerStats` adds each caddie's bonus capped at 10. `setStats` puts
  them in `state`, and `computeImpact` reads them through `env()`. A match with an unpaid caddie re-applies the
  player's own stats. The calm caddies walk tilt off between holes (`caddieWalkOff`).

### Noticed for later
- **S7:** Low 2 is the widest shot in the game (S6.1). Low 2 carries 8 yds further than stock at Dexterity 5, so it's
  also the longest 7 iron.
- **S9:** the complexity bar against real dispersion. Low 2 and High 2 read 1.00 and 0.80, but their widths are ±53
  and ±17. The lie read is S6.2.
- **S8:** the putter table in S5.7 should be redone with real stroke errors.
- **To the user:** the "human" numbers here are an estimate. `tools/test/swing-mylog.js` logs your own swings; with
  real values the dispersion table can be re-run in a minute.

## Section S7 — Shot shaping, height and spin (2026-11-20, Opus 5.5)

**Summary.** The draw and fade solver is solid. In 1,260 solves (every club, three lies, every height and spin, both
shapes) it failed once, and every preset comes back to the aim line within half a yard. Draws fly lower with less
spin and fades the reverse, by the amounts the code's comment targets, except the driver and long irons. Spin control
does next to nothing for the driver and a lot for the wedges, as intended. Two medium findings:
- Three of the coach's six lessons (the stinger, the high ball, and the draw or fade) can be had without paying.
- The woods' Low 2 is a knuckleball that is never worth hitting, even into the wind.

**How it was tested.** `tools/test/swing-shape.js` measures each control with no scatter (`computeImpact` stock and
the real flight, Power 5, base clubs, fairway unless said). "Curve" is how far the ball finishes from its own start
line. "Start" is the start line's offset at the carry distance.

| # | Severity | Kind | Finding | Fix size |
|---|---|---|---|---|
| S7.1 | Medium | Bug | The career's shot locks can be got round: ball position gives Low 2 and High 2, the ±2° tweaks give a draw or fade | S |
| S7.2 | Medium | Feel / realism | The driver's and 3 wood's Low 2 launch at 5–6° and peak at 7–9 yds; never worth hitting, even into the wind | S |
| S7.3 | Low | Bug | The driver's draw finishes only 4 yds past its fade (the comment's target is 10), and the 4–6 irons fall short too | S |
| S7.4 | Low | Feel / balance | More spin from rough costs its full risk for almost no extra spin | S |
| S7.5 | Low | Feel | By hand, one 5° stroke curves a driver 5× its preset and a sand wedge half its preset | — |

### The solved draw and fade (Dexterity 5)

| Club | Draw: face / stance → curve, finish | Draw vs straight: carry, total, launch, spin | Fade vs straight | Draw − fade total |
|---|---|---|---|---|
| Driver | 2.0 / 3.1 → 11, 0.1 | −3, +3, −0.3°, −66 | +3, −2, +0.3°, +66 | **+4** |
| 3 Wood | 2.1 / 3.7 → 12, −0.1 | 0, +3, −0.2°, −77 | 0, −3, +0.2°, +77 | +6 |
| 3 Hybrid | 2.1 / 3.9 → 11, −0.1 | 0, +3, −0.2°, −96 | −1, −3, +0.2°, +103 | +5 |
| 4 Iron | 2.1 / 4.1 → 10, 0.1 | 0, +3, −0.2°, −99 | −1, −3, +0.2°, +105 | +5 |
| 7 Iron | 2.2 / 5.1 → 9, 0.0 | +1, +4, −0.6°, −424 | −2, −4, +0.7°, +463 | +8 |
| PW | 2.4 / 6.8 → 8, −0.1 | +1, +4, −0.7°, −622 | −2, −4, +0.7°, +683 | +8 |
| Sand Wedge | 2.3 / 10.0 → 7, 0.0 | +1, +4, −0.8°, −819 | −1, −4, +0.8°, +851 | +7 |
| Lob Wedge | 1.7 / 10.7 → 6, 0.1 | +1, +3, −0.8°, −856 | −1, −3, +0.8°, +856 | +6 |

Dexterity 1 and 10 differ little: the driver bends 13 / 11 / 10 yds at Dexterity 1 / 5 / 10, and the sand wedge 6 / 7 /
9. The solver aims at 5.5% of the carry (14 yds for the driver) and lands a little under it with long clubs. Dexterity's
range shows up as less risk for the same curve (`cx.shape`), not more curve.

### S7.1 [Medium, bug] The career's shot locks can be got round
- **✅ Fixed 2026-11-20** (`tools/test/swing-fix3.js`, keys sent to the game in a new guest career):
  - **Height:** while the stinger or the high ball is unlearned, the height ladder plus ball position is capped at
    one level that way (`heightCapBallPos`, used by the A / D keys, `setHeight` and `enforceUnlocks`). Measured:
    - ball all the way back is one level, and W is then refused;
    - after W, the ball can't go back;
    - after S, it can't go forward.
  - **Shapes:** while the draw and fade are unlearned, the face may sit only 0.5° off the stance
    (`COACH.tweakFtp`). The ±2° limit on each stays, because moving face and stance together only re-aims. The most
    a locked setup can now curve is about 1 yd with the driver, 4 iron or 7 iron (it was 59, 24 and 13).
  - **Still free, by design:** a curve made with the mouse path (design direction 7: the swing itself shapes the
    ball) and the extra spin of High 1, which isn't locked.
- **Where:** `setHeight` refuses Low 2 and High 2 while "the stinger" and "the high ball" are locked. Ball position
  (A / D, ±1) is not limited, and in `computeImpact` a full ball-position move is exactly one height level (`loftRaw
  = ballPos × 3 + traj × 3`). With draw and fade both locked, face and stance are capped at ±2° (`COACH.tweakMax`).
- **Measured:**

  | Club | Low 2 (locked) | Low 1 + ball all the way back | High 2 (locked) | High 1 + ball forward |
  |---|---|---|---|---|
  | Driver | 6.1°, apex 9, 241, cx 0.62 | **6.1°, apex 9, 241, cx 0.62** | apex 61, 281 | apex 61, 281 |
  | 4 Iron | 5.9°, 11, 215, 0.62 | identical | 46, 208 | identical |
  | 7 Iron | 11.3°, 25, 197, 0.62 | identical | 40, 167 | identical |
  | PW | 19.2°, 22, 145, 0.62 | identical | 32, 118 | identical |

  With the ±2° cap (face +2, stance −2), the curve away from the start line is: driver 59 yds, 3 wood 37, 4 iron
  24, 7 iron 13, PW 7. The preset draw is 11, 12, 10, 9 and 8, so the cap allows more curve than the lesson. It
  doesn't come back to the aim line by itself, but the aim is free. A 6° mouse path curves a 7 iron 27 yds with any
  lock. "More spin" (locked) gives a 7 iron 8,400 rpm; High 1 (free) gives the same 8,400.
- **Expected:** the coach sells these as skills ($250–$350 each): "Low 2 (W twice): a flat bullet…", "F sets up a
  right-to-left curve…".
- **Why it matters:** a player who finds the ball-position keys has the stinger and the high ball free. The draw and
  fade lessons buy only the automatic setup.
- **Fix (S):** while a height lesson is locked, cap the total height level (`traj` + `ballPos`) at ±1, which is the
  same number `cx.height` already works out. For the shapes, either cap the tweaks at about ±0.75° (about a
  preset's curve on a driver), or describe the lesson as "the F setup" and leave the hand shapes free. **What else it
  would move:** nothing outside a career.

### S7.2 [Medium, feel / realism] The driver's and 3 wood's Low 2 is never worth hitting, even into the wind
- **✅ Fixed 2026-11-20:** a club under 16° of loft (`TUNE.lowWoodLoft`: the driver and 3 wood) is lowered only 1.5° a
  level (`TUNE.lowWoodDeg`; it was 3°). High levels and every other club are unchanged. After, totals in yds:

  | | Launch, apex | Calm | 15 mph headwind | 25 mph headwind |
  |---|---|---|---|---|
  | 3 Wood, Low 2 (was 4.7°, apex 7, 232 total) | 7.2°, 18 | 254 | **228** | **208** |
  | 3 Wood, Mid | 9.8°, 35 | 259 | 221 | 189 |
  | Driver, Low 2 (was 6.1°, apex 9, 241) | 8.2°, 15 | 262 | 239 | 222 |
  | Driver, Mid | 10.7°, 29 | 286 | 250 | 223 |

  The 3 wood stinger now does what the coach sells: 5 yds short in still air, 7 yds longer into 15 mph and 19 into
  25. The driver's Low 2 is now a usable flat drive rather than a knuckleball. It can't beat Mid into the wind,
  because the stock drive is already a low-spin shot (S4.3); at 25 mph they tie. (A test of launch and spin found no
  setting that beats Mid into 15 mph.)
- **Measured** (straight; launch · apex · spin · carry / total; then the total into a 15 mph headwind):

  | Club | Low 2 | Low 1 | Mid | High 1 | High 2 |
  |---|---|---|---|---|---|
  | Driver | 6.1° · **9** · 1.8k · 195 / 241 · wind 224 | 8.2° · 15 · 2.1k · 229 / 262 · 239 | 10.7° · 29 · 2.6k · 265 / 286 · **250** | 13.3° · 46 · 3.1k · 275 / 290 · 243 | 15.8° · 61 · 3.6k · 269 / 281 · 225 |
  | 3 Wood | 4.7° · **7** · 2.4k · 182 / 232 · 209 | 7.2° · 18 · 2.9k · 231 / 254 · 228 | 9.8° · 35 · 3.6k · 244 / 259 · 221 | 12.3° · 49 · 240 / 251 · 203 | 14.9° · 58 · 232 / 241 · 186 |
  | 2 Hybrid | 7.1° · 20 · 3.2k · 226 / 246 · 220 | 8.4° · 26 · 231 / 248 · 218 | 10.9° · 41 · 232 / 243 · 202 | 226 / 234 · 185 | 219 / 226 · 172 |
  | 4 Iron | 5.9° · 11 · 2.9k · 188 / 215 · **199** | 8.4° · 26 · 212 / 227 · 199 | 11.0° · 36 · 211 / 222 · 184 | 207 / 215 · 173 | 202 / 208 · 164 |
  | 7 Iron | 11.3° · 25 · 4.2k · 183 / 197 · 171 | 13.8° · 30 · 180 / 190 · 160 | 16.4° · 33 · 176 / 182 · 151 | 171 / 175 · 141 | 165 / 167 · 132 |
- **Why it matters:** the coach sells "the stinger" for $300 as "a flat bullet under the wind that runs and runs". With
  the driver and 3 wood it launches at 5–6° and peaks at 7–9 yds (a real stinger launches about 8–10° and peaks around
  15–20 yds; approximate), carries 60–70 yds less, and into a 15 mph wind still finishes 26 (driver) and 12 (3 wood) yds
  behind Mid. From the 4 iron down, Low 2 works: it beats Mid into the wind and is longer in still air.
- **Why it happens:** each height level is 3° of loft for every club, and the woods' spin floors (0.70 and 0.65) let
  them lose nearly all 6°.
- **Fix (S):** fewer degrees per level for clubs under about 16° of loft (about 1.5°), or a higher `floor` for the
  driver and 3 wood. Check that Low 2 driver then beats Mid into a 15 mph wind. **What else it would move:** S6.1
  (low shots' spread), S2.3 (Low 2 on high-floor clubs), the wind table in S3, and the draw solver at Low.

### S7.3 [Low, bug] The driver's draw finishes only 4 yds past its fade, against the comment's 10
- **Where:** the `TUNE` SHOT SHAPE comment: "draw minus fade is about: driver +10 yds total …, irons and wedges +7-9
  yds, spin ~100-200 rpm less with woods and ~900-1700 less with irons and wedges, launch ~0.5-1.5 deg lower".
- **Measured** (draw − fade, Dexterity 5): driver +4 total, −132 rpm, −0.6°. 3 wood +6. 4 / 5 / 6 iron +5 / +6 / +7,
  −204 / −292 / −580 rpm. 7 iron to PW +8, −887 to −1,305 rpm, −1.3° to −1.4°. The short irons and wedges are on
  target; the driver and long irons fall short.
- **Why it matters little:** design direction 4 holds in direction. It's the size for the driver that the comment
  promised.
- **Fix (S):** raise `shapeRoll` for low-lofted clubs, or let the in-air part (`shapeAirMin`) count more below
  20° of loft. Re-measure this table.

### S7.4 [Low, feel / balance] More spin from rough costs its full risk for almost no extra spin
- **Where:** the spin gain is capped by `lie.spinCap` (light rough 0.35, heavy 0.1), but `cx.spin` is not.
- **Measured** (Less / Normal / More: spin, carry, roll on a green):

  | | Fairway | Light rough |
  |---|---|---|
  | 7 Iron | 5,833 / 7,000 / 8,400 · 179 / 176 / 168 · roll 6.4 / 5.0 / 3.7 | 4,233 / 5,074 / **5,427** · 162 / 160 / 155 · roll 9.2 / 8.0 / **7.9** |
  | PW | 6,900 / 9,200 / 11,960 · roll 4.4 / 2.2 / 0.2 | 4,991 / 6,648 / 7,344 · roll 6.9 / 5.0 / 4.6 |
  | Sand Wedge | 7,575 / 10,100 / 13,130 · roll 3.0 / 1.0 / −1.0 | 5,469 / 7,287 / 8,051 · roll 5.1 / 3.4 / 2.9 |

  From light rough, More spin stops a 7 iron 0.1 yds sooner, costs 5 yds of carry, and adds its full complexity.
- **Fix (S):** scale the More-spin complexity by the lie's `spinCap`, or warn "little effect from this lie" as the
  toast already does for low-lofted clubs.

### S7.5 [Low, feel] By hand, one 5° stroke curves a driver 5× its preset and a sand wedge half its preset
- **Measured** (square setup; curve away from the start line, finish, total, complexity):

  | Club | Mouse 5° in-to-out | 10° | The preset draw |
  |---|---|---|---|
  | Driver | 61, 56 L, 281, 0.53 | 161, 154 L, 184, 0.62 | 11, on line, 288, 0.10 |
  | 3 Wood | 41, 37 L, 261 | 98, 90 L, 235 | 12, on line, 262 |
  | 4 Iron | 35, 30 L, 224 | 78, 69 L, 209 | 10, on line, 224 |
  | 7 Iron | 21, 17 L, 188, 0.23 | 46, 38 L, 182 | 9, on line, 186, 0.11 |
  | PW | 9, 6 L, 134 | 21, 15 L, 135 | 8, on line, 134 |
  | Sand Wedge | 3, 2 L, 99 | 8, 5 L, 102 | 7, on line, 101 |

  Out-to-in mirrors it. The preset draw on a driver is the same as about a 1.2° mouse path. One step of the face key
  (0.5°) moves a drive 7.1 yds, a 7 iron 2.5 and a sand wedge 0.9. One step of the stance moves them 4.5 / 0.9 / 0.1.
- **Why it matters:** a hand-made curve is a driver-only skill, and too sensitive to control there. Shaping a wedge
  needs the preset. This is the trend real golf has, but steeper. S2.4 (`work` counted twice) and S2.7 (the driver's
  extra curve) are the parts that make it steeper; fixing those is the fix.

### Checked and fine
- **The solver** (1,260 solves): one failure, a draw from heavy rough with an 8 iron at Low 2 (2.5 yds of curve
  where it wanted 5.2). No face or stance ever hit its limit. Every other preset bends at least half of what was asked
  and finishes within 2 yds of the aim line (on a fairway, within 0.5).
- **Height** is monotonic for every club. Each level moves the launch about 2.5° and the spin about ±20%.
- **High shots in wind:** they lose more into the wind (driver: −56 at High 2, −36 at Mid).
- **Low 2 with an iron** goes about one club further (7 iron 197 total, 6 iron 198). De-lofting does that in real
  golf too; the cost is S6.1's spread.
- **Wedges back up:** High 2 wedges back up about 2 yds.
- **Spin control** does what the comment says: the driver ±2% (2,548 / 2,600 / 2,662), the sand wedge −25% / +30%.
  More spin stops a PW in 0.2 yds and backs a sand wedge up 1 yd. Each costs carry (7 iron −8, PW −9) and a little
  launch (−0.7° to −1.0°).
- **Ball position:** one step (0.1) adds 0.3° of launch and about 2% spin with every club. All the way back (−1) is
  exactly one height level, and costs the same complexity (0.26).
- **Against the grain** is signed correctly (S6).

### Noticed for later
- **S9:** the shape preview line and the solved finish agree by construction (same stock path). S9 should check them
  against a live, hand-swung shot.
- **S9:** the face key's 7 yds a step on the driver means the setup read-out should show the expected finish, not
  only the degrees.

## Section S8 — Chipping and putting (2026-11-20, Opus 5.5)

**Summary.** The short game is mostly sound.
- **Chips:** wedge chips carry and roll in real proportions. Each surface takes a landing believably. The Stimp moves
  a chip's roll, and the landing marker is honest on average from every lie but hardpan.
- **Putts:** they follow rolling-ball physics, and the break grows with the green's speed as it should. The "about"
  figure after a putt is accurate, and the putting marker delivers design direction 13.

Two medium findings:
- At the 45 yd hand-off the same pitch rolls about twice as far as a chip as it does as a full shot.
- A low runner or stock chip with a long club is far too hot: 1% of backswing is about 5 yds.

The cup holds a centred putt only to 1.3 m/s.

**How it was tested.** `tools/test/swing-short.js`:
- **Chips:** `computeImpact` with each chip type's preset (`align` and `flop` as `setup()` builds them), then `runChip`
  on flat ground of one surface, as `chipTable` does.
- **Putts:** `computePutt`, then `createPutt` and `stepPutt` on `makeSurface` greens.
- **"Ordinary errors":** the same as S5.7: path ±1° sd, tempo ±8%, gate excursion |0.03|, wobble 1–4 px, length
  ±6%. For chips: backswing ±5%, wobble 1–3 px, a ring miss ±2% sd.

| # | Severity | Kind | Finding | Fix size |
|---|---|---|---|---|
| S8.1 | Medium | Bug | At the 45 yd hand-off the same pitch rolls about twice as far as a chip as it does as a full shot | M |
| S8.2 | Medium | Feel / realism | A low runner or stock chip with a long club is far too hot: 1% of backswing is about 5 yds | S |
| S8.3 | Low | Realism | The cup holds a centred putt only up to 1.3 m/s; a real one holds about 1.6 | S |

### Chips: carry → roll in yds (roll ÷ carry), flat Stimp 11 green

| Club, type | 25% backswing | 35% | 50% |
|---|---|---|---|
| Sand Wedge, stock | 8.2 → 9.6 (1.2) | 15.9 → 8.8 (0.6) | 31.4 → 9.1 (0.3) |
| Sand Wedge, low runner | 7.2 → 15.7 (2.2) | 14.2 → 16.3 (1.1) | 28.9 → 22.3 (0.8) |
| Sand Wedge, high soft | 8.7 → 3.8 (0.4) | 16.6 → 4.3 (0.3) | 31.9 → 3.1 (0.1) |
| Sand Wedge, flop | 4.2 → 1.0 (0.3) | 8.0 → 1.0 (0.1) | 15.4 → 0.7 (0.0) |
| Lob Wedge, stock | 6.6 → 5.8 (0.9) | 12.7 → 5.3 (0.4) | 24.9 → 5.5 (0.2) |
| PW, stock | 10.2 → 19.6 (1.9) | 20.1 → 18.2 (0.9) | 40.7 → 19.8 (0.5) |
| 9 Iron, stock | 10.7 → 27.7 (2.6) | 21.3 → 26.3 (1.2) | 44.1 → 30.0 (0.7) |
| 7 Iron, stock | 11.6 → 42.9 (3.7) | 23.7 → 41.8 (1.8) | 51.5 → 48.8 (0.9) |
| **7 Iron, low runner** | 6.5 → **62.4 (9.6)** | 13.4 → **109.2 (8.1)** | 30.8 → **173.7 (5.6)** |

For a short chip the rules of thumb (approximate) are sand wedge 1:1, PW 1:2, 9 iron 1:3 and 7 iron 1:4. The stock
chips match them. A flop is nearly all carry, and a high soft chip stops. A sand wedge chip that carries 10 yds rolls
7.2 on the green, 4.2 on the fringe, 3.3 on fairway, 1.3 in light rough, 0.4 in heavy rough, 6.3 on hardpan and 0 in
sand. The same chip rolls 6.3 / 7.2 / 8.1 / 8.5 yds at Stimp 9 / 11 / 13 / 14. More spin takes it from 7.2 to 6.3,
and less spin to 7.9.

### S8.1 [Medium, bug] At the 45 yd hand-off the same pitch rolls twice as far as a chip as it does as a full shot
- **✅ Fixed 2026-11-20, with S3.2's hand-off** (`tools/test/swing-fix3.js`):
  - **One rule:** on a hole, a full shot that comes down on the green now lands with the chip's bounce
    (`chipBounce`, shared with `stepChip`) and rolls with the putting roll on the hole's own green: its Stimp and
    slopes (`fullShotGreen`, `stepFlight`). The same launch now rolls the same as a chip or as a full shot at every
    length: PW 10 / 20 / 30 / 42 yds carry rolls 18.8 / 15.0 / 15.4 / 14.8 both ways. It can hole out through the
    putting cup rule: 2 of 601 straight-at-the-pin pitches dropped.
  - **Fast landings skid:** a ball that lands hard and is still rolling fast gets up to 4× the green's friction. It
    gets none of that if it landed slower than 10 m/s (chips and bump-and-runs, which are meant to run) and all of it
    at 24 m/s or faster (`CHIP.fastV`, `fastSpan`, `fastDrag`, `fastLandLo`, `fastLandHi`). Putts never get it: a
    50% stroke on the 40 ft scale still rolls 20.0 ft.
  - **Measured at Stimp 11:**
    - **Short chips:** they keep about their carry-to-roll ratios. At a 25% swing: sand wedge 1.2, PW 1.9, 9 iron
      2.3, 7 iron 2.7.
    - **A 40 yd PW pitch:** rolls 14.8 yds (was 19.6).
    - **Full shots onto a green:**

      | Club | Before (any Stimp) | After, Stimp 9 / 11 / 13 |
      |---|---|---|
      | Driver | 17 | 23 / 26 / 28 |
      | 3 Wood | 12 | 16 / 18 / 19 |
      | 5 Iron | 8 | 11 / 12 / 13 |
      | 7 Iron | 5 | 6.7 / 7.2 / 7.6 |
      | PW | 2 | 2.4 at every Stimp |
      | Sand Wedge | 1 | 1.0 at every Stimp |

      About 1.4× before, within S3.2's own estimate ("about double").
  - **Later (2026-11-20), the part-swing spin fix:** a part swing now keeps more of its spin than its speed (TUNE
    `partSpin` 1.2: spin follows speedFrac × (1 + 1.2 × speedFrac × (1 − speedFrac)), the same at a full swing, +30% at
    a half). Measured (`tools/test/swing-fix9.js`):
    - **A 40 yd PW pitch:** spins 5,900 rpm (was about 4,700) and rolls **10.3 yds** (was 12.9).
    - **A 40 yd sand wedge pitch:** rolls 4.5 (was 7.0).
    - **The cost:** short chips check a little more. Roll ÷ carry at a 25% swing is now sand wedge 0.6, PW 1.5, 9 iron
      2.0 and 7 iron 2.5 (the rules of thumb are 1, 2, 3 and 4). The chip read shows it, since its table is computed
      live.
    - **Unchanged:** chip totals still rise with the backswing (34 drops over a yard, the worst 21), and the backswing
      marks barely move (7 iron 11 / 48 / 111 at 25 / 50 / 75%).
  - **Not reached (before the part-swing spin fix):** the finding's 5–10 yds for a 40 yd pitch. Most of what's left happens while the ball is still
    hopping. The deeper cause is that a part swing carries too little spin, because spin follows the backswing in a
    straight line (S2's note on partial swings). That would be its own fix.
  - **Side effect:** S8.2 is largely fixed. The 7 iron low runner now totals 48 / 61 / 85 / 104 yds at a 25 / 35 / 50
    / 65% swing (was 69 / 123 / 205 / 185): about 1.3 yds per 1% of backswing instead of 5, and it rises steadily.
    Across every chip club and type, totals that fall as the backswing grows (by over a yard) are down from 44 to 35,
    and the worst from 67 yds to 20.
  - **Still open:** a full shot that lands short and rolls onto the green keeps the old full-shot roll (S3.2's last
    part).
- **Where:** inside `CHIP.maxYd` (45 yds) a shot flies with `createChip` / `stepChip`: it lands with `CHIP.surf`'s
  bounce and rolls with the putting physics. Outside, it flies with `stepFlight`: `SURF`'s bounce, then `rollDecel ×
  SURF.roll` (S3.2).
- **Measured** (the same launch both ways; roll in yds):

  | Club, carry | Onto a green: chip / full | Onto fairway: chip / full |
  |---|---|---|
  | PW, 30 yds | **20.1** / 8.6 | 6.6 / 9.5 |
  | PW, 42 yds | **19.6** / 9.0 | 7.2 / 9.4 |
  | Sand Wedge, 30 yds | 9.3 / 5.1 | 4.5 / 5.9 |
  | Sand Wedge, 42 yds | 7.8 / 4.8 | 4.7 / 5.7 |
  | Lob Wedge, 42 yds | 3.7 / 2.9 | 3.4 / 3.7 |

  The chip's roll also reads the Stimp (the PW 42 yd chip rolls 17.1 at Stimp 9 and 22.2 at 13); the full shot's
  doesn't.
- **Expected:** a 44 yd pitch and a 46 yd pitch with the same club behave alike. A 40 yd PW pitch onto a green rolls
  roughly 5–10 yds (approximate), so the chip's first bounce on a green keeps too much speed at pitch lengths.
- **Why it matters:** from just inside 45 yds a PW pitch onto the green runs 10 yds further than from just outside. The
  chip read's roll figure shows the chip number, so the player is told, but the two rules don't join.
- **Fix (M), with S3.2:** use one landing-and-roll rule for both. Hand a full shot's roll on the green to the putting
  roll (S3.2), and tune the chip's landing on a green (`CHIP.surf.green.keep`, or the steepness and spin terms) so
  a 40 yd pitch rolls about what the full shot does now. **What else it would move:** every chip's roll on a green
  (the table above), the chip read, and approach shots' release.

### S8.2 [Medium, feel / realism] A low runner or stock chip with a long club is far too hot
- **Largely fixed by S8.1 (2026-11-20):** the 7 iron low runner is about 1.3 yds per 1% of backswing (was 5), and
  rises steadily. Its ratio at a 25% swing is still 1:6 (rule of thumb about 1:4).
- **Measured:** the 7 iron low runner carries 6.5 yds and rolls 62 at a 25% backswing. At 35% it's 13 and 109. That
  is about 5 yds of total for each 1% of backswing. The 9 iron low runner is 1:5.4 and the PW 1:3.5. The 7 iron stock
  chip is 1:3.7, which is about right.
- **Why it happens:** the low runner's preset takes off about 9° of loft (the face, ball back, and height −2). That
  reaches the 7 iron's loft floor, so the launch is about 9° with half the spin. It lands shallow, keeps about 75% of
  its speed through the bounce, and then rolls with a putt's friction.
- **Expected:** a bump-and-run with a 7 iron is roughly 1 part carry to 4 parts roll (approximate), and it's the safe
  shot, not the touchiest.
- **Fix (S):** make the low runner's de-loft smaller for clubs under about 40° (for example `height −1` instead of −2
  below the PW), or make a green's `keep` fall with landing speed. **What else it would move:** the chip table and
  marker read for those clubs, and chip-ins.

### S8.3 [Low, realism] The cup holds a centred putt only up to 1.3 m/s
- **✅ Fixed 2026-11-20:** `PUTT.captureSpeed` is 1.6 m/s. The fastest ball that drops (Stimp 11): centred 1.60 m/s (it
  would have run 8.4 ft past; was 5.5), 50% off centre 1.38 (6.3 ft), 75% off 1.06 (3.7 ft), 90% off 0.73 (1.8 ft).
- **Measured** (the fastest ball that drops, by how far from centre it crosses the cup; Stimp 11): centred 1.30 m/s
  (a ball that would have finished 5.5 ft past), 25% off 1.27, 50% off 1.12 (4.1 ft past), 75% off 0.89 (2.6 ft),
  90% off 0.60 (1.2 ft). From 6 ft with ordinary errors, 0.2% of putts lip out.
- **Expected:** about 1.6 m/s for a centred ball (the plan's figure, from Holmes 1991), which is about 8.5 ft past at
  Stimp 11.
- **Fix (S):** `PUTT.captureSpeed` 1.6. A firm, centred putt would then drop as it does in real golf. Lag putts are
  unaffected.

### Checked and fine
- **The chip marker's read against reality** (sand wedge stock chip, marker at 12 yds carry, 600 real chips with the
  backswing the read asks for):

  | Lie | Swing | Real carry: mean (10th–90th) | Read band at Per 1 / 5 / 10 | Real chips inside it |
  |---|---|---|---|---|
  | Fairway | 30% | 12.0 (11.4–12.6) | ±12 / ±7 / ±2% | 100 / 96 / 30% |
  | Light rough | 33% | 12.2 (10.7–14.1), 12% fliers | ±16 / ±10 / ±2% | 87 / 64 / 14% |
  | Heavy rough | 40% | 11.9 (9.7–14.1) | ±22 / ±13 / ±3% | 88 / 65 / 15% |
  | Greenside bunker | 39% | 12.0 (10.3–13.9) | ±19 / ±12 / ±2% | 91 / 68 / 16% |
  | Hardpan | 31% | **9.7** (3.5–12.7), 32% bladed or chunked | ±14 / ±9 / ±2% | 68 / 60 / 16% |

  Unlike full shots (S6.2), the chip read is centred on the true average from every lie but hardpan. The band is the
  read of the swing to make, so at high Perception it is narrower than where real chips land, as designed. Hardpan
  is S2.1: 31% of chips go wrong at Dexterity 5 and 51% at Dexterity 2.
- **The flop:** complexity 1.54 with any 50°+ wedge (the stock chip: 0). It launches at 46–55° and stops within a
  yard. Off hardpan it is bladed or chunked 89–92% of the time, so `flopBladeChance` plus the 1.5 mm rule make it
  nearly impossible there, which reads as intended ("the open blade bounces into the ball's equator").
- **Pace** (design decisions D1 and D2 in `PUTTING_PLAN.md`): a 50% stroke on the 40 ft scale rolls exactly 20.0 ft
  at Stimp 9, 11.5 and 13. The stroke sets the distance and the Stimp sets the speed it takes (2.73 / 2.41 /
  2.27 m/s), so faster greens break more for the same putt.
- **Break** (aimed straight, paced to finish 1.5 ft past; inches past the hole, and the aim that holes it):

  | | 1%, 10 ft | 2%, 10 ft | 1%, 30 ft | 2%, 30 ft |
  |---|---|---|---|---|
  | Stimp 9 | 4.6, aim 2.9 high | 9.3, 7.7 | 17.0, 15.4 | 34.0, 33.1 |
  | Stimp 11.5 | 5.9, 4.1 | 11.8, 10.2 | 21.7, 20.1 | 43.2, 43.2 |
  | Stimp 13 | 6.7, 4.8 | 13.3, 11.8 | 24.5, 23.0 | 48.8, 49.6 |

  This is the rolling-ball model (sideways pull (5/7)·g·slope, friction along the path). The simple estimate that
  ignores friction on the sideways part is 40–55% higher, as expected. A 10-footer on 2% at Stimp 11.5 needs about
  10 in of borrow, which is in the range golfers quote. `makeSurface` caps the slope within 1.2 m of the pin at
  2.2% (`PUTT.maxSlopeAtPin`), so a 4% putt at the hole can't happen.
- **Uphill and downhill** (2%): the flat stroke finishes 0.6 ft short uphill from 10 ft at Stimp 9 (1.3 at Stimp 13),
  and 4.3 / 6.2 ft short from 30 ft. Downhill from 30 ft it runs 6.9 / 10.8 ft past. `puttTarget`'s "about" figure
  is the holing distance plus its 1.5 ft of die-past, to within 0.1 ft in every case.
- **Design direction 13:** `readMarker` uses the flat distance only. Its band is ±12% with a bias up to ±10% at
  Perception 1, and ±1% with no bias at Perception 10. It is fixed for each putt, and the true value is always
  inside. That is delivered.
- **Tilt on the greens:** the gate narrows with tilt (0.030 → 0.017 at 4 bad shots, Composure 1 or 5). With ordinary
  errors, a 10-footer drops 93% → 82%, and at Composure 10 only to 91%. That is a gentle knee-knocker, by design.

### Noticed for later
- **For the user:** with the stroke errors assumed here, putting is far easier than real golf. A 6-footer drops
  99–100% and a 10-footer 91–95%; tour players make about 65% and 40%. Either a real mouse stroke is much less
  straight than 1° sd, or putting needs more scatter. Logging real putts (as `swing-mylog.js` does for full swings)
  would settle it. The putter comparison in S5.7 rests on the same assumption.
- **S9:** the chip read's roll figure comes from `runChip` on flat ground of the marker's surface, so it shows S8.1's
  long roll honestly. Check it against a live chip.

## Section S9 — What the player is shown vs what happens (2026-11-20, Opus 5.5)

**Summary.** On a fairway, the numbers before a shot are honest:
- The bag's carries are within 1–3% of the real average.
- The backswing marks match real partial swings to the yard.
- The telemetry's signs are consistent from the swing to the screen.
- The club-fit warnings quote the real mishit rate.

Two medium findings:
- The minimap's landing area is drawn for a steadier hand than S1's estimate of a real one, so with that hand it
  holds 60–70% of iron shots instead of 86%.
- The difficulty read-out misreports height and spin (the same cause as S6.1).

From rough, the bag's range is S6.2. The driver's fade preview is 5 yds left of where real fades average.

**How it was tested.** `tools/test/swing-shown.js` compares each read-out with 400–600 real seeded shots, using the
"game" (`SPREAD`) and "human" (S1's estimate) swing models from S6. The live read-outs are called directly:
`stockShot`, `lieRead`, `landSpread`, `solveShape`, and `computeImpact` for the complexity. The telemetry and wind
read-outs were checked by reading `updateHUD` against `computeImpact`, `shotNumbers`, `windVector` and S3's
measurements.

| # | Severity | Kind | Finding | Fix size |
|---|---|---|---|---|
| S9.1 | Medium | Feel / balance | The landing area assumes a steadier hand than S1's estimate: 60–70% of iron shots inside, not 86% | S–M |
| S9.2 | Medium | Bug | The difficulty read-out misreports height and spin: High 2 reads 1.62× and costs 1.11×, Low 2 reads 1.62× and costs 3.5× | S (with S6.1) |
| S9.3 | Low | Realism | The driver's fade preview finishes on the aim line; real fades average 5.7 yds right of it | S |

### S9.1 [Medium, feel / balance] The landing area assumes a steadier hand than S1's estimate
- **✅ Fixed 2026-11-20:**
  - **The default hand:** `landSpread`'s swing errors (`spreadSwing`) are now S1's estimate of a real hand: wobble
    1.5–5.5 px, a ring miss of ±2% sd, and the mouse path ±2.4°.
  - **The player's own hand:** once they've made 8 full swings, it samples their own last 30 (`golfSwingHist` in local
    storage). That uses their wobble, their ring miss, and their path's spread about its own average. Chips, putts and
    `debugSwing` aren't recorded.
  - **More shots:** 60 instead of 36, and 100 for the driver.

  Share of 600 real shots (S1's human hand) inside the drawn 2σ ellipse:

  | Case | Driver | 3 Hybrid | 7 Iron | PW | Sand Wedge |
  |---|---|---|---|---|---|
  | Fairway, Dex 5: before → after | 78 → **91%** | 78 → 89% | 62 → **92%** | 65 → 89% | 71 → 88% |
  | Fairway, Dex 1 | 78 → 89% | 81 → 89% | 61 → 92% | 65 → 91% | 70 → 91% |
  | Fairway, Dex 10 | 78 → 91% | 75 → 90% | 60 → 90% | 51 → 89% | **39 → 89%** |
  | Light rough, Dex 5 | 81 → 91% | 89 → 92% | 83 → 92% | 84 → 88% | 86 → 92% |
  | Heavy rough, Dex 5 | 89 → 75% | 83 → 86% | 86 → 87% | 83 → 81% | 82 → 95% |
  | Tilted (3 bad shots), Dex 5 | 75 → 91% | 74 → 92% | 70 → 92% | 67 → 90% | 77 → 90% |

  A true 2σ ellipse holds about 86%; the area now runs slightly generous. The exception is a driver from heavy rough,
  whose topped and fat shots don't fit an ellipse. With 12 steady swings of the player's own (wobble 1 px, path
  ±0.5°), the 7 iron's area narrows from ±18 to ±11 yds, so a steadier player sees a tighter area.
- **Where:** `landSpread` (about line 14924) flies 36 seeded shots with `SPREAD`'s errors: mouse path ±2.4° (bell),
  wobble 0–2.5 px, backswing ±5%, no ring miss. `landArea` widens it down the line by the lie read's band.
- **Measured** (share of 600 real shots inside the drawn 2σ ellipse; a true 2σ ellipse holds about 86%):

  | Case | Driver | 3 Hybrid | 7 Iron | PW | Sand Wedge |
  |---|---|---|---|---|---|
  | Fairway, Dex 5: game swing / human | 76 / 78% | 80 / 78% | 80 / **62%** | 83 / **65%** | 83 / 71% |
  | Fairway, Dex 1 | 82 / 78% | 84 / 81% | 87 / 61% | 85 / 65% | 84 / 70% |
  | Fairway, Dex 10 | 78 / 78% | 78 / 75% | 77 / **60%** | 78 / **51%** | 85 / **39%** |
  | Light rough, Dex 5 | 78 / 81% | 90 / 89% | 86 / 83% | 90 / 84% | 92 / 86% |
  | Heavy rough, Dex 5 | 90 / 89% | 83 / 83% | 87 / 86% | 86 / 83% | 87 / 82% |
  | Fairway bunker, Dex 5 | 82 / 85% | 90 / 89% | 85 / 80% | 87 / 78% | 87 / 79% |
  | Tilted (3 bad shots), Dex 5 | 84 / 75% | 85 / 74% | 87 / 70% | 85 / 67% | 87 / 77% |
  | Low 2, Dex 5 | 82 / 79% | 84 / 80% | 85 / 71% | 82 / 69% | 82 / 74% |
  | Draw preset, Dex 5 | 80 / 80% | 83 / 79% | 84 / 66% | 83 / 72% | 82 / 73% |
- **Why it matters:** with the game's own swing the ellipse is about right (76–92%; the driver a little low, since 36
  shots under-sample its long tails). With the S1 human estimate, the ellipse is too small for every iron and wedge on
  a fairway, and worst at high Dexterity, where the hand is most of what's left (S6.4). From rough the lie's own spread
  dominates, and it's fine.
- **Caveat:** the "human" column rests on S1's estimate. With real logged swings (`swing-mylog.js`) this table
  re-runs in a minute.
- **Fix (S–M):** feed `SPREAD` from the player's own last 20 or so swings (each swing already records its wobble,
  path and ring miss). At least, widen it to S1's estimate (wobble 1.5–5.5 px, ring miss ±2%). Use about 100 shots
  for the driver. **What else it would move:** the minimap only. The yardages don't change.

### S9.2 [Medium, bug] The difficulty read-out misreports height and spin
- **Partly fixed by S6.1 (2026-11-20):** for the 7 iron at Dex 5, Low 2 now reads 1.62× and is 2.2× wide (was 3.5×),
  and High 2 reads 1.62× and is 1.26× (was 1.11×). See S6.1.
- **Where:** the "1.xx×" figure and bar (`updateHUD`, about line 15834) show `1 + complexity`. That's right for what
  `complexity` includes, but S6.1's low-spin effects never reach it.
- **Measured** (7 iron, Dexterity 5, human swing; read-out → real 2σ width, and that width as × the stock shot's):

  | Ask | Read-out | Real width | × stock |
  |---|---|---|---|
  | Stock | 1.00× | ±17 | 1.00× |
  | 105% / 110% backswing | 1.26× / 1.52× | ±21 / ±25 | 1.24× / 1.47× |
  | Draw / fade preset | 1.11× / 1.12× | ±23 / ±21 | 1.37× / 1.24× |
  | **High 1 / High 2** | 1.26× / **1.62×** | ±17 / ±19 | **1.00× / 1.11×** |
  | **Low 1 / Low 2** | 1.26× / **1.62×** | ±30 / **±60** | **1.75× / 3.53×** |
  | More spin / Less spin | 1.24× / 1.10× | ±17 / ±22 | **0.99×** / 1.32× |
  | High 1 draw / Low 1 fade | 1.68× / 1.65× | ±26 / ±37 | 1.54× / 2.17× |
- **Why it matters:** for the power asks the read-out tracks the real spread within 3%. For height and spin it
  points the wrong way. High 2 and More spin look risky and cost nothing; Low 2 looks the same as High 2 and is 3×
  as wide.
- **Fix:** S6.1's fix (`lowSpinMult` from the club's stock spin) should bring these into line. Re-measure with
  section 5 of `swing-shown.js`. If a gap remains, the read-out could show the landing area's real width against the
  stock shot's.

### S9.3 [Low, realism] The driver's fade preview finishes on the aim line; real fades average 5.7 yds right
- **Measured** (preview finish, stock shot, against the mean of 400 real shaped shots, human, Dex 5):
  - **Draws:** −1.1 to −1.3 yds from the preview with the driver, 3 hybrid and 7 iron.
  - **Fades:** driver +5.2 (preview 0.5 R, real 5.7 R), 3 hybrid +1.7, 7 iron +0.8.
  - **Totals:** 1–3 yds short of the preview in both cases.
- **Why it happens:** a scatter error that opens the face adds more curve than one that closes it takes away (the
  shaping range's boost grows with face-to-path, and a big slice keeps its lift, S3.3). So the average fade bends
  further than the stock one, most with the driver.
- **Fix (S):** draw the preview to the mean finish of `landSpread`'s shots (already computed for the ellipse), or
  accept a few yards. The ellipse itself is centred on that mean, so the line and the ellipse disagree by those
  5 yds.

### Checked and fine
- **The bag's yardages** (fairway; shown → real mean carry / total, human swing):

  | | Dex 2 | Dex 5 | Dex 8 |
  |---|---|---|---|
  | Driver 265 / 286 | 260 / 282 | 261 / 283 | 262 / 284 |
  | 3 Hybrid 223 / 233 | 221 / 232 | 221 / 232 | 221 / 232 |
  | 7 Iron 176 / 182 | 171 / 178 | 174 / 180 | 174 / 181 |
  | PW 128 / 131 | 126 / 129 | 127 / 130 | 127 / 130 |
  | Sand Wedge 96 / 98 | 95 / 96 | 96 / 97 | 96 / 97 |

  The bag shows a perfect strike, so the real average is 1–5 yds shorter, at most 3%. From rough and sand see S6.2.
- **The backswing marks** (25 / 50 / 75%): within 1 yd of real partial swings for every club (driver 14 / 62 / 151,
  real 15 / 62 / 151; sand wedge 8 / 31 / 64, real 8 / 31 / 64).
- **The telemetry's signs**, from `computeImpact` to the screen:
  - **Path:** + is in-to-out (a down-and-right mouse stroke).
  - **Face:** + is open (the ball goes right).
  - **Face-to-path:** − is a draw.
  - **Strike:** + is the toe.
  - **Launch H and spin axis:** "R" is right or fade.
  - **Offline:** measured from the aim line, + is right.

  The launch monitor reads the same result object the flight is launched with, and the carry, total and apex come
  from the flight itself, so they agree by construction.
- **The club-fit warnings:** the bag's tooltip quotes `fit.mishit`, and S6 measured the same rates: a driver off the
  fairway 8% (real 7%), from light rough 44% (real 43%).
- **The wind:** "Into" is a wind from the aim line and "R→L" is from the right. `windVector` blows it right to left,
  and S3 measured the ball drifting left. The arrow is turned to point where the wind is going, relative to the
  camera. The chip view turns it into the green's frame.
- **S2.11 (the preview leaves out a used club's bent lie):** S5.9 measured it at 1.3 yds at most (the AP1's worst
  bent lie). Small enough to leave as a hidden flaw.

### Noticed for later
- **S5.3:** the shop's Stopping bar is another read-out that doesn't show the flight.
- **S4.1:** the range and test round bag lists show the comparison 7 iron as a 15th club.
