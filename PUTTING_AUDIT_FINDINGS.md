# Putting and putter audit — findings

An audit of the putting stroke, the roll, and the four attributes of the putters in the shop (2026-11-20, Fable 5.2).
Report only: nothing in the game was changed, and nothing here has been fixed unless an entry says so. It follows the
same layout as `SWING_AUDIT_FINDINGS.md`, and picks up two things that audit left open: S5.7 (the putters) and S8's
note that the putting numbers rested on assumed strokes.

**Summary.** The roll is sound: pace, break, the cup and the fast greens all behave. The problems are in the stroke
and in what the putters' numbers do.

- A jabbed stroke was better than a pure one (PT1, fixed 2026-11-20). The fix turned up PT11 (always
  decelerating), fixed the same day. One piece is left: always jabbing still wins with a tight-window mallet and a
  loose rhythm, and its cure waits on deciding what rhythm is pure.
- The tempo number depended on how long the stroke was, so a true pendulum read as a decel (PT2 and PT3, fixed
  2026-11-20). Still open there: a golfer's 2:1 rhythm reads as a jab, by design.
- Of the four putter attributes, start line is worth about 1.3–1.6 putts per nine across the shop's range, pace feel
  about 0.5–0.8, and stability and sweet spot nothing measurable (PT4, PT5). So the putters are a ladder with the
  mallets on top, not a trade (PT6). PT4 and PT5 were fixed 2026-11-20: stability is now worth 0.6 to a loose
  hand, and the sweet spot 0.05 / 0.28 / 0.72 (steady / average / loose). PT6 was then fixed by re-tuning the
  putters: blades for a shaky rhythm, mallets for a shaky line, nothing between them for a steady or average hand.
- Composure, Dexterity and (almost) Perception do not reach the green (PT7, PT8). PT7 was fixed 2026-11-20:
  reaching the green now takes one level of Tilt off, so Tilt and Composure reach the putt and the next tee. PT8
  was fixed the same day: Dexterity steadies the face and the strike, worth 0.5 to 1.5 putts per nine from 1 to 10.

**"Putts per nine"** in this file means total putts to hole out from nine first putts on a flat Stimp 11 green: 5, 5,
10, 10, 20, 20, 30, 30 and 45 ft. 1,500 holes per distance, so differences under about 0.05 are noise.

**How it was tested.** Two probes, run against the working tree (commit `f6575eb` plus the uncommitted bunker work):

- `tools/test/putt-audit-a.js` calls `computePutt`, `createPutt` and `stepPutt` directly. No hand is assumed: it
  measures what a given tempo, miss, gate excursion or start line does. It also reads each hole's green.
- `tools/test/putt-audit-b.js` builds hand strokes in continuous time, samples them as a mouse reports them (whole
  counts, 125 or 1,000 reports a second) and feeds them through the game's real reader (`beginSwing`, `swingSample`,
  then `analyzePutt`). Practice mode is on, so the game rolls no ball and saves nothing. The probe then rolls each putt
  with `computePutt` and `stepPutt` and plays every hole out. `window.__MODE` picks the part: `b0` the reader,
  `b1` every putter by distance, `b2` one attribute at a time, strategies and stats, `b3` tempo checks.

  ```
  node tools/test/probe.js "http://127.0.0.1:8090/?nohome" - "@tools/test/putt-audit-a.js"
  node tools/test/probe.js "http://127.0.0.1:8090/?nohome" - "@tools/test/putt-audit-b.js" "window.__MODE='b2'"
  ```

  No test hooks were added: everything the probes use was already on `window.__golf`.

**What could not be tested here.**

- **A real hand.** No putt has ever been logged: the swing history skips putts. The Monte Carlo uses three assumed
  hands (see "The assumed hands" near the end). Every ranking below was the same for all three, but the absolute make
  rates are estimates.
- **Tempo in the Monte Carlo.** In `b1` and `b2` the stroke's length, path, gate excursion, miss and wobble come from
  the reader, but its tempo is drawn around 1.00, as if the player had learned what reads as pure. `b3` checks what
  happens when that is not true (PT2, PT6).
- **Green reading.** The Monte Carlo greens are flat, so nobody misreads a break. Contoured greens will lower every
  make rate. The read arrows and the aim preview were not audited.
- **A round played end to end.** PT7 is read from the code paths, not played.

`index.html` was being edited by another session during the audit (bunker work, including lines in `stepPutt`). The
putting path through `stepPutt` is unchanged, and every probe gave the same numbers before and after. Line numbers
below will move; the function names won't.

| # | Severity | Kind | Finding | Fix size |
|---|---|---|---|---|
| PT1 | High | Feel / balance | ✅ Fixed. A jabbed stroke beats a pure one: fixed extra pace, no line penalty, and the skid ignores the break | S |
| PT2 | Medium | Bug | ✅ Fixed. The tempo reading depends on stroke length: a true 1:1 rhythm reads 0.63 to 0.87 | S–M |
| PT3 | Medium | Bug (modelled) | ✅ Fixed with PT2. A pause at the top is only ignored if the mouse is perfectly still | S |
| PT4 | Medium | Feel / balance | ✅ Fixed for a loose hand (worth 0.6); still nothing for a hand that stays in the gate. Stability (the gate) is worth nothing measurable | S |
| PT5 | Medium | Feel / balance | ✅ Fixed (worth 0.05 / 0.28 / 0.72). Sweet spot never matters, and the mallets can't leave theirs | S |
| PT6 | Medium | Feel / balance | ✅ Fixed. The putters are a ladder, not a trade, and the Spider is cheaper than the blades it beats | S, after PT4–PT5 |
| PT7 | Medium | Dead mechanic | ✅ Fixed (the green takes one level off). Tilt cannot be above zero on a green, so Composure does nothing for putting | S, after a decision |
| PT8 | Medium | Feel / balance | ✅ Fixed for Dexterity (1 to 10 is worth 0.5 to 1.5); Perception left as it is. Dexterity changes nothing on the green; Perception is worth about 0.15 putts per nine | S, after a decision |
| PT9 | Medium | Feel | ✅ Fixed (now about 14 and 38 ft). The automatic scale switches at 11 and 30 ft, long before the smaller scale runs out | S |
| PT10 | Low | Shown | ✅ Fixed. Three screens name and scale the same four numbers differently | S |
| PT11 | Medium | Feel / balance | ✅ Fixed for the decel; always jabbing still wins with a tight-window mallet and a loose rhythm (waits on PT2's open question). For a loose tempo, always decelerating beats trying for a pure stroke (found while fixing PT1) | S |

## The stroke

### PT1 [High, feel / balance] A jabbed stroke beats a pure one
- **✅ Fixed 2026-11-20.** Two changes, measured with `tools/test/putt-fix1.js`:
  - **A jab is no longer repeatable** (`computePutt`). A fully jabbed putt now leaves anything from no faster to 24%
    faster (`hotSpeed` 0.12, give or take the new `hotScatter` 0.12), with up to ±1.0° of random twist (the new
    `hotTwistDeg`). Both scale with how far past the window the tempo is, as the decel's twist does.
  - **The skid no longer hides the break** (`stepPutt`). A skidding ball slides, so the slope pulls it with all of
    gravity instead of a rolling ball's 5/7.

  The card's "+N% hot" now shows what that stroke really got, and the tip says a jab runs "hot and offline by a
  different amount each time".

  A 20 ft stroke, feet rolled (least to most) and the most the face can twist:

  | Putter (window) | 1.00 | 1.10 | 1.15 | 1.20 | 1.30 and faster |
  |---|---|---|---|---|---|
  | OZ.1 (±0.03) | 20.0 | 20.0–24.7, ±0.47° | 20.0–28.4, ±0.80° | 20.0–30.8, ±1.0° | 20.0–30.8, ±1.0° |
  | Spider (±0.04) | 20.0 | 20.0–24.0, ±0.40° | 20.0–27.7, ±0.73° | 20.0–30.8, ±1.0° | 20.0–30.8, ±1.0° |
  | Practice blade (±0.08) | 20.0 | 20.0–21.3, ±0.13° | 20.0–24.7, ±0.47° | 20.0–28.4, ±0.80° | 20.0–30.8, ±1.0° |
  | Newport 2 (±0.11) | 20.0 | 20.0 | 20.0–22.6, ±0.27° | 20.0–26.2, ±0.60° | 20.0–30.8, ±1.0° |

  The break, same greens as below (the jab at the middle of its range): where it finishes, then the aim that holes it.

  | Green and putt | Pure, 1.5 ft past | Jab, same stroke | Jab, stroke shortened to the pure pace or softer |
  |---|---|---|---|
  | Stimp 11, 2% slope, 4 ft | 3.6 in low; aim 1.6 in | 3.4 in low; aim 1.7 in (was holed) | 6.4 in low; aim 4.4 in (was holed) |
  | Stimp 11, 2%, 6 ft | 6.2 in low; aim 4.3 in | 5.3 in low; aim 3.8 in | 8.3 in low; aim 6.4 in |
  | Stimp 11, 1%, 8 ft | 4.5 in low; aim 2.6 in | 3.7 in low; aim 2.2 in | 5.1 in low; aim 3.3 in |
  | Stimp 12.5, 2%, 6 ft | 7.0 in low; aim 5.1 in | 6.1 in low; aim 4.4 in | 9.4 in low; aim 7.6 in |
  | Stimp 12.5, 2%, 10 ft | 13.5 in low; aim 11.9 in | 10.6 in low; aim 9.1 in | 13.9 in low; aim 12.3 in |
  | Stimp 14, 2%, 6 ft | 7.9 in low; aim 6.0 in | 6.8 in low; aim 5.1 in | 10.5 in low; aim 8.7 in |

  A jab hit with the same stroke is a firmer putt, so it breaks a little less, as any firmer putt does. It no longer
  goes in straight.

  Putts per nine, before → after. Jab is a tempo around 1.6 with the stroke shortened by what a jab adds on
  average; decel is a tempo around 0.55 with the stroke lengthened (unchanged by this fix, shown for comparison).

  | Hand | Putter | Pure | Always jab | Always decel |
  |---|---|---|---|---|
  | Steady | White Hot | 11.40 → 11.44 | 11.59 → 14.10 | 13.78 |
  | | Newport 2 | 11.15 → 11.15 | 11.47 → 14.06 | 13.76 |
  | | PLD Anser | 11.06 → 11.07 | 11.30 → 14.04 | 13.75 |
  | | Spider | 10.81 → 10.93 | 10.53 → 13.92 | 13.68 |
  | | OZ.1 | 10.66 → 10.86 | 10.13 → 13.91 | 13.71 |
  | Average | White Hot | 13.56 → 13.69 | 13.35 → 14.91 | 14.24 |
  | | Newport 2 | 13.30 → 13.40 | 13.28 → 14.84 | 14.19 |
  | | PLD Anser | 13.20 → 13.29 | 13.16 → 14.85 | 14.16 |
  | | Spider | 13.05 → 13.37 | 12.26 → 14.43 | 13.91 |
  | | OZ.1 | 12.84 → 13.21 | 11.80 → 14.19 | 13.75 |
  | Loose | White Hot | 15.89 → 16.08 | 15.17 → 16.54 | 15.12 |
  | | Newport 2 | 15.54 → 15.76 | 15.15 → 16.44 | 15.05 |
  | | PLD Anser | 15.44 → 15.60 | 14.93 → 16.32 | 14.96 |
  | | Spider | 15.09 → 15.42 | 13.92 → 15.31 | 14.36 |
  | | OZ.1 | 14.78 → 15.25 | 13.43 → 14.94 | 14.21 |

  For the steady and average hands a jab now costs 1.0 to 3.1 putts per nine, a little more than a decel. With the
  OZ.1 the average hand's always-jab game went from 91% holed at 10 ft and no three-putts from 45 ft to 60% and 9%.

  **What is left:** for the loose hand with a mallet, an always-jab game still edges a pure attempt (Spider 15.31
  against 15.42, OZ.1 14.94 against 15.25). That hand does better still by always decelerating, which is a separate
  finding this fix turned up: PT11.

  **What else it moved:**
  - **Ordinary play is a little harder for the tight-window putters.** A slightly quick stroke now twists and
    scatters, as a slightly slow one always did. Pure play costs the average hand 0.09 to 0.13 more putts per nine
    with the blades, 0.32 with the Spider and 0.37 with the OZ.1. That closes most of PT6's gap: Newport 13.40,
    Anser 13.29, Spider 13.37, OZ.1 13.21. The tables in the other entries were measured before this fix.
  - **Every putt breaks about 5% more**, because the pure stroke's short skid used to hide the break too. A 20 ft
    putt across a 2% slope finishes 27.3 in low (was 26.1); a 4 ft putt needs 1.6 in of aim (was 1.4).
  - **A golfer's natural 2:1 rhythm reads as a jab**, so that stroke now scatters where it used to be a steady 21%
    long. PT2's fix did not change this: it made the reading the same at every length, but pure is still 1:1 by
    design. See "What is left" under PT2.
- **Where:** `computePutt` (about line 8069): `hot = clamp((tempo − (1 + tempoZone)) / 0.15, 0, 1)`; the ball leaves
  `1 + 0.10 × hot` faster and skids `2.5 × hot` ft further. A decel adds a random twist (`decelTwistDeg`); hot adds
  none. `stepPutt` (about line 8108): `skidding = q.rolled < q.skid`, and while skidding the slope's pull is zero.
- **Measured: the ceiling.** A 20 ft stroke on the Medium scale, by tempo: feet rolled, with the most the decel can
  twist the face in brackets. The skid is 0.5 ft for every pure stroke and 3.0 ft at the ceiling.

  | Putter (window) | 0.70 | 0.85 | 0.95 | 1.00 | 1.10 | 1.15 | 1.20 | 1.30 | 1.50 | 2.00 |
  |---|---|---|---|---|---|---|---|---|---|---|
  | OZ.1 (±0.03) | 15.5 (±1.5°) | 16.3 (±1.2°) | 19.4 (±0.2°) | 20.0 | 21.9 | 23.3 | 24.2 | 24.2 | 24.2 | 24.2 |
  | Spider (±0.04) | 15.5 (±1.5°) | 16.6 (±1.1°) | 19.7 (±0.1°) | 20.0 | 21.6 | 23.0 | 24.2 | 24.2 | 24.2 | 24.2 |
  | Practice blade (±0.08) | 15.5 (±1.5°) | 17.8 (±0.7°) | 20.0 | 20.0 | 20.5 | 21.9 | 23.3 | 24.2 | 24.2 | 24.2 |
  | Newport 2 (±0.11) | 15.5 (±1.5°) | 18.7 (±0.4°) | 20.0 | 20.0 | 20.0 | 21.1 | 22.5 | 24.2 | 24.2 | 24.2 |

  Past a tempo of 1.18 (OZ.1) to 1.26 (Newport), every stroke rolls exactly 21% further, whatever the tempo. Pull
  back 17% less and the distance is right again, with none of the tempo's scatter left in it. The slow side is not
  symmetrical: 23% less distance and up to ±1.5° of twist.
- **Measured: the break.** A side slope, the practice blade, aimed at the centre of the cup. Each cell is where the
  ball finishes, then how far outside the centre the aim has to be to hole it.

  | Green and putt | Pure, 1.5 ft past | Jab, same stroke | Jab, stroke shortened to the pure pace or softer |
  |---|---|---|---|
  | Stimp 11, 2% slope, 4 ft | 3.3 in low; aim 1.4 in | **holed**; aim 0 | **holed**; aim 0 |
  | Stimp 11, 2%, 6 ft | 5.8 in low; aim 3.9 in | 1.8 in low; aim 0.1 in | 3.5 in low; aim 1.4 in |
  | Stimp 11, 1%, 8 ft | 4.2 in low; aim 2.3 in | 1.7 in low; aim 0.2 in | 2.8 in low; aim 0.8 in |
  | Stimp 12.5, 2%, 6 ft | 6.6 in low; aim 4.7 in | 2.1 in low; aim 0.3 in | 3.9 in low; aim 1.9 in |
  | Stimp 12.5, 2%, 10 ft | 12.8 in low; aim 11.0 in | 6.0 in low; aim 4.4 in | 8.6 in low; aim 6.8 in |
  | Stimp 14, 2%, 6 ft | 7.4 in low; aim 5.5 in | 2.3 in low; aim 0.5 in | 4.4 in low; aim 2.3 in |

  A jabbed 4-footer skids 2.6 of its 4 ft and takes no break for that distance.
- **Measured: the score.** The average hand on a flat green, where the skid cannot even help. Jab means a tempo
  around 1.6 with the stroke shortened by the 21%.

  | Putter | Pure | Always jab | 10 ft holed | 20 ft holed | Three-putts from 45 ft |
  |---|---|---|---|---|---|
  | Practice blade | 13.47 | 13.24 | 65 → 66% | 41 → 45% | 4.6 → 0.2% |
  | Newport 2 | 13.34 | 13.24 | 69 → 66% | 42 → 45% | 2.6 → 0.2% |
  | Spider Tour | 13.08 | **12.24** | 75 → 85% | 46 → 62% | 4.5 → 0.0% |
  | OZ.1 | 12.81 | **11.81** | 79 → 91% | 52 → 69% | 4.6 → 0.0% |

  On the ceiling the tempo window no longer matters, which removes the mallets' only weakness.
- **Expected:** the code's own comment calls a jab a fault ("skids and runs hot"). A fault should cost something.
  On a real green the skid is roughly a tenth to a fifth of the putt, and a sliding ball still feels the slope.
- **Why it matters:**
  - The best way to putt is the stroke the game calls wrong. A player who finds it gains about a stroke per nine
    with a mallet, more on breaking putts, and never three-putts.
  - It needs no skill: any tempo above the ceiling gives the same ball.
  - A golfer's natural rhythm lands there without trying. A true 2:1 stroke reads 1.31 to 1.63 (PT2).
- **Fix (S), options. They combine:**
  - Let the slope act during the skid (drop the `skidding ? 0` in `stepPutt`), and keep the skid only as extra pace.
  - Give the hot side what the decel side has: a random twist, and a pace that keeps climbing or scatters past the
    ramp, so a jab is not repeatable.
  - Tie the hot skid to the putt's length (say at most 15–20% of it), so a 4-footer cannot skid most of its way.

  **What else it would move:** the pure skid is small (a 20 ft putt on a 2% slope finishes 26.9 in low with no skid
  and 26.1 in with its 0.5 ft), so normal putts barely change. Check the aim preview and any opponent putting that
  uses `computePutt`. Re-run the PT1 tables in `putt-audit-a.js` (A1, A5) and `b2`.

### PT2 [Medium, bug] The tempo reading depends on stroke length
- **✅ Fixed 2026-11-20.** Tempo is still back time ÷ forward time, but both are now timed over the same middle
  stretch of the stroke: from 20% to 80% of its length, measured from the ball (`puttTempo`, new, with
  `PUTT.tempoSpan`). The takeaway and the turn at the top are outside that stretch, so neither can skew it. Measured
  with `tools/test/putt-fix2.js`, which works out the old reading from the same samples.

  One true 1:1 rhythm (smooth reach back, speeding up through the ball), by stroke length:

  | Stroke length | 5% | 8% | 13% | 20% | 33% | 50% | 75% | 100% |
  |---|---|---|---|---|---|---|---|---|
  | Tempo read, before | 0.63 | 0.68 | 0.71 | 0.77 | 0.81 | 0.83 | 0.87 | 0.87 |
  | Tempo read, after | 0.84 | 0.86 | 0.88 | 0.86 | 0.87 | 0.87 | 0.87 | 0.87 |
  | True rhythm that reads 1.00, before | — | 1.56 | 1.46 | 1.34 | 1.28 | 1.21 | 1.16 | 1.16 |
  | True rhythm that reads 1.00, after | 1.13 | 1.15 | 1.15 | 1.15 | 1.15 | 1.15 | 1.15 | 1.15 |
  | A true 2:1, before → after | 1.14 → 1.71 | 1.22 → 1.74 | 1.31 → 1.75 | 1.44 → 1.72 | 1.51 → 1.74 | 1.56 → 1.73 | 1.63 → 1.74 | 1.67 → 1.74 |

  The same at 125 and 1,000 reports a second. Long strokes read what they did before; short ones now read the same
  as long ones.

  **What 1.00 means now:** the putter comes forward through the middle of the stroke at the pace it went back. A
  stroke built that way reads 0.99 to 1.02 at every length. A stroke with equal back and forward *times* reads
  between 0.75 and 1.03, depending on how the hand speeds up and slows down (four shapes tried: 0.75, 0.87, 0.89,
  1.03). Before, those four read 0.83 to 0.94 on a full-length stroke and less on anything shorter.

  Putts per nine for the average hand keeping one true rhythm on every putt, old reader → new reader (after PT1's
  fix, so a jab already scatters):

  | The hand's true rhythm | Newport 2 | Spider | OZ.1 |
  |---|---|---|---|
  | 1:1, smooth reach | 14.93 → 14.31 | 15.95 → 14.89 | 16.02 → 15.00 |
  | 1:1, pendulum shapes | 14.25 → 14.06 | 14.99 → 14.65 | 15.08 → 14.68 |
  | 1.16:1 (reads 1.00 now) | 13.57 → 13.35 | 13.80 → 13.26 | 13.82 → 13.19 |
  | 1.3:1 | 13.57 → 13.86 | 13.38 → 13.87 | 13.16 → 13.67 |
  | 2:1 | 16.49 → 16.76 | 16.00 → 16.03 | 15.76 → 15.79 |

  A hand with one steady rhythm can now be pure on every putt (the 1.16 row matches the Monte Carlo's usual
  13.40 / 13.37 / 13.21). A hand that had settled on 1.3:1, which the old reader called pure on mid-length putts,
  now reads 1.13 everywhere and has to slow its forward stroke a little.

  **Also changed:** `debugSwing`'s putting stroke is re-timed for the new reading (asked 0.7 / 1.0 / 1.3, read
  0.70 / 1.00 / 1.30 at 10%, 33% and 100%). The tip reads "1.00× is the same pace back and through, at any stroke
  length (a pause at the top doesn't count)".

  **What is left:**
  - **A golfer's 2:1 still reads as a full jab** (1.74), now at every length. Pure is "the same pace back and
    through" by design (P3). Moving it toward a golf rhythm is one constant, and a decision for the user. Logged
    putts from a real hand would show which rhythm people actually make with a mouse.
  - **A false start** (back, forward a little, back again) reads as a jab: 2.3. It read 1.22 to 1.29 before, which
    was already quick of every window.
  - **Tap-ins** under 5% of a full stroke have little middle to time and read a little low (0.73 to 0.84; they
    read 0.49 to 0.63 before). Below about 3% the old formula is still used.
- **Where:** `analyzePutt` (about line 8058): `tBack = S[iTop].t − S[1].t`. `S[1]` is the first sample `swingSample`
  keeps, and it is taken only once the hand has moved `max(3, 1% of swingPx)` back (8 counts at the default 800). The
  forward time runs from the top sample to the ball, less a pause.
- **Measured:** a true 1:1 rhythm (back time equals the time from the top to the ball), a straight stroke, default
  calibration. The putt column is what that stroke length is for on the Short scale.

  | Stroke length | 5% | 8% | 13% | 20% | 33% | 50% | 75% | 100% |
  |---|---|---|---|---|---|---|---|---|
  | Rolls, Short scale | 0.75 ft | 1.2 ft | 2 ft | 3 ft | 5 ft | 7.5 ft | 11 ft | 15 ft |
  | Tempo read, smooth start (min-jerk) | 0.63 | 0.68 | 0.71 | 0.77 | 0.81 | 0.83 | 0.87 | 0.87 |
  | Tempo read, cosine start | 0.70 | 0.77 | 0.82 | 0.87 | 0.89 | 0.90 | 0.93 | 0.94 |
  | Practice blade's penalty (smooth) | — | −23%, ±1.5° | −23%, ±1.5° | −22%, ±1.5° | −17%, ±1.1° | −13%, ±0.9° | −8%, ±0.5° | — |
  | True rhythm that reads 1.00 | — | 1.56 | 1.46 | 1.34 | 1.28 | 1.21 | 1.16 | 1.16 |

  The same at 125 and 1,000 reports a second (within 0.02). A true 2:1 stroke reads 1.31 at 13%, 1.51 at 33% and
  1.63 at 75%.
- **Why it reads low:** the back stroke's clock starts after the takeaway threshold, and a hand starts slowly. On a
  13% stroke the threshold is the first 8% of the way back, which takes about a fifth of the back stroke's time. The
  slow turn at the top is then charged to the forward stroke, apart from the pause allowance.
- **What it costs:** the average hand, keeping one true rhythm for every putt, with the tempo the game reads (`b3`).
  Putts per nine; the last row is the Monte Carlo's usual assumption for comparison.

  | The hand's true rhythm | White Hot | Newport 2 | PLD Anser | Spider | OZ.1 |
  |---|---|---|---|---|---|
  | 1:1 (a pendulum) | 15.38 | 14.95 | 15.13 | 15.98 | 15.98 |
  | 1.3:1 | 13.51 | 13.38 | 13.29 | 12.98 | 12.57 |
  | 2:1 (a golf stroke), stroke not shortened | 14.91 | 14.70 | 14.51 | 13.53 | 13.02 |
  | Tempo reads 1.00 on average | 13.58 | 13.34 | 13.23 | 13.08 | 12.81 |

  A player who makes the pendulum the game asks for takes 1.6 to 3.2 more putts per nine, and holes 39% from 10 ft
  with the Newport instead of 69%. It is also the one case where the blades beat the mallets (PT6).
- **Expected:** the same rhythm reads the same at any length, and the rhythm the game calls 1.00 is the one it
  describes ("1.00 = a pendulum").
- **Fix (S–M), options:**
  - Start the back clock at the hand's first movement, not at the threshold (keep the time of the first backward
    count seen in the `ready` phase).
  - Or time both halves over the same middle part of the stroke (say from 10% to 90% of its length, each way), so
    neither the takeaway nor the turn counts.
  - Then decide what "pure" is: 1:1 as now, or golf's 2:1. Re-measure the "true rhythm that reads 1.00" row either way.

  **What else it would move:** every player's learned rhythm, the tempo shown in the telemetry, PT1 (a 2:1 stroke
  would stop being hot by default if pure moved toward 2:1), and the balance between blades and mallets.

### PT3 [Medium, bug (modelled)] A pause at the top is only ignored if the mouse is perfectly still
- **✅ Fixed 2026-11-20 by PT2's change.** The turn at the top is outside the stretch the tempo is timed over, so a
  pause there cannot count, however the mouse moves. The same stroke (`tools/test/putt-fix2.js`, before → after):

  | Hold at the top | 0 ms | 100 ms | 300 ms | 600 ms |
  |---|---|---|---|---|
  | Hand still | 0.83 → 0.87 | 0.84 → 0.87 | 0.84 → 0.87 | 0.83 → 0.87 |
  | One count of jitter | 0.83 → 0.87 | 0.68 → 0.87 | 0.53 → 0.87 | 0.39 → 0.87 |

  A hand that drifts 4 counts back and waits 600 ms before the takeaway reads the same too.
- **Where:** `analyzePutt`: `pause = (S[iTop + 1].t − S[iTop].t) − 40`. Only the gap to the very next sample counts
  as the pause. `swingSample` keeps a sample for any movement, sideways included.
- **Measured:** a true 1:1 rhythm, 50% stroke, holding at the top. Jitter is one count of sideways movement during
  the hold.

  | Hold at the top | 0 ms | 100 ms | 300 ms | 600 ms |
  |---|---|---|---|---|
  | Tempo read, hand still | 0.83 | 0.84 | 0.84 | 0.83 |
  | Tempo read, one count of jitter | 0.83 | 0.68 | 0.53 | 0.39 |

  With the practice blade, 0.68 is already the full decel: 23% short and up to ±1.5° of twist.
- **Not measured:** how much a real hand jitters at rest. On a high-DPI mouse, holding within one count for 300 ms
  is unlikely.
- **Expected:** the code's own comment on that line: "a pause at the top is not part of the stroke".
- **Fix (S):** measure the pause to the first sample that has come forward of the top (by the top hysteresis, or by
  2–3 counts), not to the next sample of any kind.

### PT11 [Medium, feel / balance] For a loose tempo, always decelerating beats trying for a pure stroke
- **✅ Fixed 2026-11-20.** A decel is no longer repeatable in pace: its 12% of lost speed is now give or take 10%
  (`PUTT.decelScatter`, scaled by how far below the window the tempo is, like its twist). A fully decelerated 20 ft
  stroke rolls anywhere from 12.2 to 19.2 ft; it was always 15.5. The card's "−N% short" shows what that stroke
  lost. This is the second of the two options below, the one that does not depend on what "pure" is. Measured with
  `tools/test/putt-fix10.js`.

  Putts per nine, before → after, for a pure attempt and for decelerating every putt, then for jabbing every putt
  as things are now. Two hands are added whose only weakness is rhythm.

  | Hand (tempo spread) | Putter | Pure attempt | Always decel | Always jab |
  |---|---|---|---|---|
  | Steady (0.06) | any | 10.6 to 11.1 | 13.7 → 14.8 | 13.8 to 14.0 |
  | Average (0.12) | any | 13.0 to 13.6 | 13.9–14.5 → 14.9–15.4 | 14.2 to 14.9 |
  | Loose (0.20) | White Hot | 17.19 → 17.11 | **16.57** → 17.68 | 17.28 |
  | | Newport 2 | 16.31 → 16.30 | **16.21** → 17.18 | 16.85 |
  | | PLD Anser | 16.09 → 16.03 | **15.67** → 16.78 | 16.40 |
  | | Spider | 15.46 → 15.50 | **14.65** → 15.69 | **15.37** |
  | | OZ.1 | 15.61 → 15.66 | **14.69** → 15.65 | **15.23** |
  | Good line, shaky rhythm (0.20) | Newport 2 | 12.47 → 12.49 | 13.85 → 14.77 | 14.11 |
  | | OZ.1 | 13.78 → 13.83 | 13.78 → 14.78 | 13.88 |
  | Good line, very shaky rhythm (0.30) | White Hot | 14.11 → 14.15 | **13.90** → 14.69 | 14.40 |
  | | Newport 2 | 13.50 → 13.51 | 13.88 → 14.73 | 14.47 |
  | | Spider | 14.15 → 14.17 | **13.76** → 14.69 | 14.43 |
  | | OZ.1 | 14.55 → 14.62 | **13.85** → 14.78 | **14.23** |

  Bold is a strategy that beat the pure attempt. Decelerating every putt now beats it for no hand and no putter
  (the closest is the loose hand's OZ.1, level at 15.65 against 15.66). Ordinary play barely moved: at most 0.08.

  **What is left: jabbing every putt still wins with a tight-window mallet and a loose rhythm.** OZ.1: 15.23 against
  15.66 for the loose hand and 14.23 against 14.62 for the very shaky one; Spider: 15.37 against 15.50. That hand is
  outside the OZ.1's ±0.03 window on nearly every stroke, so its "pure" attempts are a random mix of full faults
  both ways, and one steady fault is easier to allow for.
  - A stronger twist on a jab (1.0° → 1.5°) was tried and does not cure it: it makes that hand's pure attempts
    worse by as much (OZ.1, loose hand: pure 15.90, jab 15.70, decel 15.65).
  - The cure is the first option below, for the fast side: let the fault keep growing with the tempo. That would
    punish a golfer's 2:1 rhythm far more than now, so it waits on the open question under PT2: what rhythm is pure.
  - It matters less than it reads. For the very shaky hand a blade played straight (Newport 13.51) beats any
    parked mallet. Only for the loose hand is the OZ.1's always-jab game (15.23) the best there is, by 0.27 over
    the Spider played straight.
- **Found 2026-11-20 while fixing PT1.** The audit tried an always-jab game but not an always-decel one.
- **Where:** `computePutt`: `dec = clamp(((1 − tempoZone) − tempo) / 0.15, 0, 1)`. Below a tempo of 0.74 (Newport) to
  0.82 (OZ.1) every stroke is the same ball: 23% short, with up to ±1.5° of twist. Lengthen the stroke by that 23%
  and the pace is right, with none of the tempo's scatter in it.
- **Measured** (`putt-fix1.js`, after PT1's fix): putts per nine, a pure attempt against always decelerating.

  | Hand (tempo spread) | White Hot | Newport 2 | PLD Anser | Spider | OZ.1 |
  |---|---|---|---|---|---|
  | Steady (0.06) | 11.44 / 13.78 | 11.15 / 13.76 | 11.07 / 13.75 | 10.93 / 13.68 | 10.86 / 13.71 |
  | Average (0.12) | 13.69 / 14.24 | 13.40 / 14.19 | 13.29 / 14.16 | 13.37 / 13.91 | 13.21 / 13.75 |
  | Loose (0.20) | 16.08 / **15.12** | 15.76 / **15.05** | 15.60 / **14.96** | 15.42 / **14.36** | 15.25 / **14.21** |

  For the loose hand it is worth 0.6 to 1.1 putts per nine. For the other two it costs 0.5 to 2.9.
- **Why:** it is the same weakness PT1 had. Outside the ramp the fault stops growing, so a hand that cannot stay in
  the window anyway (the loose hand is outside it on most strokes) does better parked on the floor, where its tempo
  no longer changes the distance.
- **Not known:** whether a real hand's tempo is as loose as 0.20. No putt has been logged.
- **Fix (S), options:**
  - Let both faults keep growing past the ramp, so there is no floor or ceiling to park on. This waited on PT2 (the
    reading used to move by 0.3 with the stroke's length, and an open-ended fault would have punished that); PT2 is
    now fixed. It would make a 2:1 rhythm much worse, so settle what "pure" is first (see PT2).
  - Or give the decel a pace scatter like the jab's. Simpler, but it only makes the floor cost more.

### PT9 [Medium, feel] The automatic scale switches long before the smaller scale runs out
- **✅ Fixed 2026-11-20.** `autoSelectPuttScale` now takes the smallest scale whose full stroke still reaches the
  top of the marker's band (`PUTT.scaleFill` 1.0; a stroke can still go to 110%). Measured with
  `tools/test/putt-fix8.js`.

  Where Auto switches, through the game's own functions:

  | | Short → Medium | Medium → Lag |
  |---|---|---|
  | Before (any Perception) | 11.0 ft: 73% of Short, then 28% of Medium | 30.0 ft: 75% of Medium, then 33% of Lag |
  | Perception 1 | 14.2 ft: 95%, then 36% | 37.8 ft: 95%, then 42% |
  | Perception 5 | 14.4 ft: 96%, then 36% | 38.6 ft: 97%, then 43% |
  | Perception 10 | 14.8 ft: 99%, then 37% | 39.6 ft: 99%, then 44% |

  A 10 ft putt with the marker 1.5 ft past the cup is now a 77% stroke on the Short scale (it was 34% on Medium).

  Putts per nine, old switch points → new:

  | Putter | Steady hand | Average hand | Loose hand |
  |---|---|---|---|
  | White Hot | 11.24 → 11.04 | 13.87 → 13.70 | 17.05 → 17.16 |
  | Newport 2 | 10.89 → 10.68 | 13.32 → 13.05 | 16.34 → 16.29 |
  | Spider | 10.93 → 10.72 | 13.35 → 13.06 | 15.67 → 15.48 |
  | OZ.1 | 10.93 → 10.78 | 13.35 → 13.25 | 15.73 → 15.61 |

  - **The gain is at 10 to 13 ft.** Average hand, Newport: 10 ft goes from 1.30 to 1.22 putts and from 70% to 78%
    holed. Around the second switch (28 to 38 ft) nothing measurable changes.
  - **It is smaller than the audit predicted** (0.1 to 0.3, against 0.24 to 0.44). Since PT4 and PT5 a longer
    stroke also costs something: it wanders further from the ball's line, so it clips the rail and misses the sweet
    spot more often.
  - **For the loose hand with the White Hot it is slightly worse** (+0.11), for that reason: the narrowest gate
    and the smallest sweet spot. The scale can still be chosen by hand with 1, 2 and 3.
- **Where:** `autoSelectPuttScale` (about line 9706): the marker's distance up to 11 ft picks Short (15 ft), up to
  30 ft Medium (40 ft), beyond that Lag (90 ft).
- **Measured:** what 1% of stroke length is worth either side of each switch.

  | Marker at | Scale | Stroke asked | 1% of stroke is |
  |---|---|---|---|
  | 11 ft | Short | 73% | 0.15 ft (1.4% of the putt) |
  | 12 ft | Medium | 30% | 0.40 ft (3.3%) |
  | 30 ft | Medium | 75% | 0.40 ft (1.3%) |
  | 31 ft | Lag | 34% | 0.90 ft (2.9%) |

  A 10 ft putt with the marker 1.5 ft past the cup is at 11.5 ft, so it gets the Medium scale and a 29% stroke.
  Taking the smallest scale that reaches instead (Short to 15.5 ft, Medium to 41 ft), average hand:

  | Putter | Auto | Smallest that reaches | 10 ft holed | 30 ft holed |
  |---|---|---|---|---|
  | Practice blade | 13.47 | 13.11 | 65 → 75% | 19 → 26% |
  | Newport 2 | 13.34 | 12.90 | 69 → 81% | 21 → 29% |
  | Spider Tour | 13.08 | 12.77 | 75 → 83% | 23 → 30% |
  | OZ.1 | 12.81 | 12.57 | 79 → 83% | 26 → 33% |
- **Caveat:** part of this is the hand model, where a longer stroke is straighter in degrees and steadier in length.
  The whole-count floor says the same thing without any model: one count sideways at the top of a 5% stroke is 0.57°
  of start line with the blade, 0.22° at 13% and 0.09° at 33%.
- **Why it matters:** a player who switches scale by hand gains a quarter to nearly half a putt per nine over one
  who trusts Auto.
- **Fix (S):** move the switch points to about 90–95% of each scale (14 and 37 ft), leaving room under the 110% cap.

## The putters

The numbers, and the bars the shop draws from them (each bar is scaled from the worst to the best putter in the shop):

| Putter | Price | Stability (`gate`) | Start line (`pathGain`) | Sweet spot (`sweet`) | Pace feel (`tempoZone`) |
|---|---|---|---|---|---|
| White Hot Pro 2.0 #1 (starter) | — | 0.028 · bar 15 | 0.42 · bar 15 | 3.5 mm · bar 15 | ±0.085 · bar 73 |
| Newport 2 | $450 | 0.030 · 23 | 0.40 · 24 | 4 mm · 22 | ±0.11 · 100 |
| PLD Anser | $450 | 0.031 · 27 | 0.38 · 32 | 4.5 mm · 28 | ±0.10 · 89 |
| Spider Tour | $400 | 0.050 · 100 | 0.27 · 79 | 10 mm · 100 | ±0.04 · 26 |
| OZ.1 | $600 | 0.046 · 85 | 0.22 · 100 | 8 mm · 74 | ±0.03 · 15 |
| Circle T (luxury) | $12,500 | as the Newport 2 | | | |
| Atelier mallet (luxury) | $45,000 | 0.048 · 92 | 0.27 · 79 | 9 mm · 87 | ±0.04 · 26 |

What each is worth, changing one number at a time on the practice blade (0.030 / 0.40 / 4 / ±0.08) from the shop's
worst value to its best. Putts per nine, with the change from the blade in brackets:

| Attribute | Value | Steady hand | Average hand | Loose hand |
|---|---|---|---|---|
| The practice blade | | 11.32 | 13.47 | 15.76 |
| Start line | 0.42 (worst) | 11.43 (+0.11) | 13.61 (+0.14) | 15.92 (+0.16) |
| | 0.22 (best) | 10.12 (−1.19) | 12.16 (−1.31) | 14.32 (−1.43) |
| Pace feel | ±0.03 (worst) | 11.71 (+0.39) | 14.00 (+0.53) | 16.34 (+0.58) |
| | ±0.11 (best) | 11.22 (−0.09) | 13.34 (−0.13) | 15.52 (−0.23) |
| Stability | 0.028 (worst) | 11.32 (0.00) | 13.45 (−0.02) | 15.82 (+0.06) |
| | 0.050 (best) | 11.32 (0.00) | 13.51 (+0.04) | 15.75 (−0.01) |
| Sweet spot | 3.5 mm (worst) | 11.32 (0.00) | 13.47 (0.00) | 15.76 (0.00) |
| | 10 mm (best) | 11.32 (0.00) | 13.47 (0.00) | 15.76 (+0.01) |

Worst to best: start line 1.31 / 1.45 / 1.60, pace feel 0.49 / 0.66 / 0.82, stability and sweet spot nothing.

**Start line and pace feel do what they say.** The start line is the stroke's direction times `pathGain`, exactly.
The tempo window is the band around 1.00 with no penalty, and outside it the fault ramps in over 0.15.

### PT4 [Medium, feel / balance] Stability (the gate) is worth nothing measurable
- **✅ Fixed 2026-11-20, for the hand that needs it.** A rail hit now twists the face about three times as much
  (`railTwistDeg` 2.5 per gate-width outside, up to `railTwistMax` 3.0°; was 0.8 up to 2.0°) and takes pace off: 20%
  of the ball's speed per gate-width outside, up to 25% (the new `railSlow`, `railSlowMax`). The card shows it
  ("Clipped the rail — 54% outside the gate · −11% pace"), and the roll reads RAIL, not PURE. Measured with
  `tools/test/putt-fix3.js`.

  What a rail hit does, by how far the stroke strayed: the most it can twist (before → after), then how short the
  ball finishes.

  | Putter (gate) | 3.5% | 4% | 5% | 6% | 8% |
  |---|---|---|---|---|---|
  | White Hot (2.8%) | 0.20 → 0.63°, 10% short | 0.34 → 1.07°, 16% | 0.63 → 1.96°, 29% | 0.91 → 2.86°, 40% | 1.49 → 3.00°, 44% |
  | Practice blade (3.0%) | 0.13 → 0.42°, 7% short | 0.27 → 0.83°, 13% | 0.53 → 1.67°, 25% | 0.80 → 2.50°, 36% | 1.33 → 3.00°, 44% |
  | OZ.1 (4.6%) | — | — | 0.07 → 0.22°, 3% | 0.24 → 0.76°, 12% | 0.59 → 1.85°, 27% |
  | Spider (5.0%) | — | — | — | 0.16 → 0.50°, 8% | 0.48 → 1.50°, 23% |

  Putts per nine, before → after, with how often a putt hits the rail:

  | | Steady hand | Average hand | Loose hand |
  |---|---|---|---|
  | Practice blade, gate 2.8% | 11.25 → 11.25 (never) | 13.59 → 13.63 (4.5%) | 15.99 → 16.53 (30%) |
  | Practice blade, gate 5.0% | 11.25 → 11.25 (never) | 13.62 → 13.62 (never) | 15.95 → 15.94 (3.7%) |
  | **The gate alone is worth** | **0 → 0** | **0 → 0.02** | **0.04 → 0.60** |
  | White Hot | 11.44 → 11.44 | 13.69 → 13.73 | 16.08 → 16.66 |
  | Newport 2 | 11.15 → 11.15 | 13.40 → 13.42 | 15.76 → 16.13 |
  | PLD Anser | 11.07 → 11.07 | 13.29 → 13.30 | 15.60 → 15.97 |
  | Spider | 10.93 → 10.93 | 13.37 → 13.37 | 15.42 → 15.44 |
  | OZ.1 | 10.86 → 10.86 | 13.21 → 13.21 | 15.25 → 15.28 |

  **Why pace as well as twist:** twist alone was tried first. Even at 5° per gate-width the loose hand lost only
  0.07 to 0.12 putts per nine. Rail hits come mostly on long strokes, where a degree of line changes little; what a
  long putt lives on is pace.

  **What is left:** stability is now worth 0.6 putts per nine to a loose hand, about what pace feel is worth, and
  still nothing to the other two. That is what a gate is: it can only matter to a stroke that leaves it. The average
  hand clips a blade's rail once in 22 to 37 putts, and then by a sixth of a gate-width. Whether a real hand wanders
  more than that is not known.

  **What else it moved:** for the loose hand the blades fall 0.3 to 0.6 further behind the mallets (Newport to
  OZ.1: 0.51 → 0.85). PT6 should take that into account. Nothing moved for the other two hands.
- **Where:** `computePutt`: `over = excursion / gate − 1`, and the twist is `min(2.0, 0.8 × over)` degrees times a
  random number from −1 to 1. `analyzePutt`: the excursion is the furthest the stroke strays sideways over the last
  25% of a full stroke before the ball.
- **Measured:** the most a rail hit can twist the start line, by how far the stroke strayed (as a share of the 100%
  stroke). The typical twist is about half of this.

  | Putter (gate) | 3% | 4% | 5% | 6% | 8% | 10% |
  |---|---|---|---|---|---|---|
  | White Hot (2.8%) | 0.06° | 0.34° | 0.63° | 0.91° | 1.49° | 2.00° |
  | Practice blade (3.0%) | — | 0.27° | 0.53° | 0.80° | 1.33° | 1.87° |
  | OZ.1 (4.6%) | — | — | 0.07° | 0.24° | 0.59° | 0.94° |
  | Spider (5.0%) | — | — | — | 0.16° | 0.48° | 0.80° |

  How often the first putt hits the rail: steady hand never; average hand 3–5% with the blades, never with the
  mallets; loose hand 25–31% with the blades, 5–8% with the mallets. The loose hand's start-line spread is already
  1.33° with the blade, so a rail hit a little outside the gate adds nothing visible.
- **Expected:** it is the first bar in the shop, and the Spider's whole pitch ("The most stable: the widest gate").
- **Why it matters:** the player buys a number that does not change a score. The gate matters only by accident,
  through PT5.
- **Fix (S), options:** make a rail hit cost about three times as much (`railTwistDeg` 0.8 → about 2.5), push the
  ball the way the stroke strayed instead of at random, or take pace off as well. Aim for something like half a
  putt per nine across the shop's range for the average hand, then re-run `b2`.

  **What else it would move:** the blades get harder, so do PT6 in the same pass. If Tilt is brought onto the green
  (PT7), its narrowed gate starts to matter too.

### PT5 [Medium, feel / balance] Sweet spot never matters, and the mallets can't leave theirs
- **✅ Fixed 2026-11-20.** Three changes in `computePutt`, measured with `tools/test/putt-fix4.js`:
  - **The gate is out of the strike.** A miss is the same millimetres for every putter (`strikeMm`).
  - **Strikes are a realistic size.** 1% of a full stroke wide of the ball is now 4 mm (it was about 1 mm). The
    average strike went from 0.8 / 1.6 / 2.7 mm (steady / average / loose hand) to 1.9 / 3.7 / 6.3 mm. Before, every
    hand struck every putt inside even the smallest sweet spot, which is why nothing could matter.
  - **No cliff, and line as well as pace.** Inside the sweet spot nothing is lost. Outside it the ball loses 2% of
    its rollout per mm (`strikeLoss`, up to 20%) and starts 0.10° per mm toward that side, toe right and heel left
    (`strikeTwistDeg`, up to 1.0°).

  The strike and what it costs, by how far the stroke missed the ball's line:

  | Putter (sweet spot) | 1% (5 mm) | 2% (9 mm) | 3% (13 mm) | 4% and more (15 mm) |
  |---|---|---|---|---|
  | White Hot (3.5 mm) | −3%, 0.15° | −11%, 0.55° | −19%, 0.95° | −20%, 1.0° |
  | Practice blade (4 mm) | −2%, 0.10° | −10%, 0.50° | −18%, 0.90° | −20%, 1.0° |
  | PLD Anser (4.5 mm) | −1%, 0.05° | −9%, 0.45° | −17%, 0.85° | −20%, 1.0° |
  | OZ.1 (8 mm) | pure | −2%, 0.10° | −10%, 0.50° | −14%, 0.70° |
  | Spider (10 mm) | pure | pure | −6%, 0.30° | −10%, 0.50° |

  Before, the blade lost nothing until a 4% miss (then 6%), and neither mallet lost anything at 8%.

  Putts per nine, before → after, with the share of putts struck outside the sweet spot:

  | | Steady hand | Average hand | Loose hand |
  |---|---|---|---|
  | Practice blade, sweet spot 3.5 mm | 11.25 → 11.30 (14%) | 13.61 → 13.91 (46%) | 16.48 → 17.24 (68%) |
  | Practice blade, sweet spot 10 mm | 11.25 → 11.25 (0%) | 13.61 → 13.63 (3%) | 16.37 → 16.52 (20%) |
  | **The sweet spot alone is worth** | **0 → 0.05** | **0 → 0.28** | **0.12 → 0.72** |
  | White Hot | 11.44 → 11.50 | 13.73 → 14.03 | 16.66 → 17.35 |
  | Newport 2 | 11.15 → 11.21 | 13.42 → 13.70 | 16.13 → 16.80 |
  | PLD Anser | 11.07 → 11.09 | 13.30 → 13.49 | 15.97 → 16.63 |
  | Spider | 10.93 → 10.93 | 13.37 → 13.38 | 15.44 → 15.58 |
  | OZ.1 | 10.86 → 10.86 | 13.21 → 13.27 | 15.28 → 15.57 |

  **What else it moved:**
  - **The mallets now lead for every hand again**: Newport to OZ.1 is 0.35 / 0.43 / 1.23 putts per nine (steady /
    average / loose). That is PT6, and it is now the next thing to fix: all four bars do something, so the putters
    can be re-tuned into a trade.
  - **A stroke that misses wide of a blade's gate is charged twice**: once for the rail (PT4) and once for the
    strike. PT6's re-tune should weigh the two together.
  - **Dexterity still does nothing** (Newport, average hand: 13.70 / 13.70 / 13.69 at Dexterity 1 / 5 / 10). It
    trims only the wobble part of the strike, which is the small part. See PT8.
- **Where:** `computePutt`: `mm = wobble × 1.2 × (1 − 0.4 × dexF) + |miss| / gate × 3`. If `mm` is past `sweet`, the
  ball loses 5% of its rollout at the edge, rising to 12% at 8 mm outside.
- **Measured:** strike and pace lost, by how far the stroke missed the ball's line (ordinary wobble):

  | Putter (sweet spot, gate) | 0 | 1% | 2% | 3% | 5% | 8% |
  |---|---|---|---|---|---|---|
  | White Hot (3.5 mm, 2.8%) | 1.0 mm | 2.1 mm | 3.1 mm | 4.2 mm, −5.6% | 6.3 mm, −7.5% | 9.6 mm, −10.3% |
  | Practice blade (4 mm, 3.0%) | 1.0 mm | 2.0 mm | 3.0 mm | 4.0 mm | 6.0 mm, −6.7% | 9.0 mm, −9.4% |
  | PLD Anser (4.5 mm, 3.1%) | 1.0 mm | 2.0 mm | 2.9 mm | 3.9 mm | 5.8 mm, −6.2% | 8.7 mm, −8.7% |
  | OZ.1 (8 mm, 4.6%) | 1.0 mm | 1.6 mm | 2.3 mm | 2.9 mm | 4.2 mm | 6.2 mm |
  | Spider (10 mm, 5.0%) | 1.0 mm | 1.6 mm | 2.2 mm | 2.8 mm | 4.0 mm | 5.8 mm |

  Share of first putts struck outside the sweet spot: steady hand none; average hand 1% with the White Hot, none
  with anything else; loose hand 17% White Hot, 8% Newport, 4% Anser, none with a mallet.
- **Why it is inert:**
  - The miss is divided by the gate, so a miss of one gate-width is 3 mm for every putter. A wide gate and a big
    sweet spot are the same forgiveness counted twice. A mallet would need a miss of two to three gate-widths.
  - A blade leaves its sweet spot at about the same miss that hits the rail, and then loses 5–7% of a putt that was
    aimed 1.5 ft past the hole. On 10 ft that is 0.7 ft: it still gets there.
  - The strike changes pace only, never direction.
- **Also:** the loss starts at 5% the moment the strike is past the edge. 4.0 mm with the blade loses nothing and
  4.1 mm loses 5%.
- **Expected:** the starter's note is "A tired blade with a small sweet spot". That should be its flaw.
- **Fix (S), options:** take the gate out of the strike (the same millimetres per percent of miss for every
  putter), so the sweet spot is what differs. Start the loss at zero at the edge. Consider a small twist off the toe
  or heel for the blades.

### PT6 [Medium, feel / balance] The putters are a ladder, not a trade
- **✅ Fixed 2026-11-20.** The shop putters' numbers are re-tuned (`Object.assign(PUTTERS, …)`), measured with
  `tools/test/putt-fix5.js`. No mechanics changed. The idea: blades forgive a shaky rhythm, mallets forgive a shaky
  line. The start lines are pulled close together, because that one number was worth more than the other three
  combined.

  | Putter | Gate | Start line | Sweet spot | Tempo window |
  |---|---|---|---|---|
  | White Hot (starter) | 2.8% | 0.42 → **0.38** | 3.5 mm | ±0.085 |
  | Newport 2 / Circle T | 3.0% | 0.40 → **0.34** | 4 mm | ±0.11 → **±0.12** |
  | PLD Anser | 3.1 → **3.4%** | 0.38 → **0.35** | 4.5 → **5.5 mm** | ±0.10 |
  | Spider Tour | 5.0% | 0.27 → **0.31** | 10 mm | ±0.04 → **±0.06** |
  | OZ.1 | 4.6 → **4.4%** | 0.22 → **0.23** | 8 → **7.5 mm** | ±0.03 |
  | Atelier mallet | 4.8% | 0.27 → **0.31** | 9 mm | ±0.04 → **±0.06** |

  Putts per nine, before → after. "Before" is the old numbers on today's mechanics (after PT1 to PT5). The two extra
  hands are lopsided: one has the steady hand's line with the loose hand's rhythm, the other the reverse.

  | Hand | White Hot | Newport 2 | PLD Anser | Spider | OZ.1 |
  |---|---|---|---|---|---|
  | Steady | 11.50 → 11.24 | 11.21 → **10.89** | 11.09 → 10.92 | 10.93 → 10.93 | 10.86 → 10.93 |
  | Average | 14.03 → 13.87 | 13.70 → 13.32 | 13.49 → **13.31** | 13.38 → 13.35 | 13.27 → 13.35 |
  | Loose | 17.35 → 17.05 | 16.80 → 16.34 | 16.63 → 16.15 | 15.58 → **15.67** | 15.57 → 15.73 |
  | Good line, shaky rhythm | 13.48 → 13.32 | 12.98 → **12.60** | 13.02 → 12.85 | 13.67 → 13.41 | 13.87 → 13.90 |
  | Good rhythm, shaky line | 15.89 → 15.66 | 15.59 → 15.19 | 15.28 → 14.90 | 13.69 → 14.07 | 13.60 → **13.72** |

  What that makes each putter:
  - **A steady or average hand scores the same with any of the four bought putters** (within 0.04).
  - **Newport 2:** the best for a shaky rhythm, by 0.25 over the Anser and 0.8 to 1.3 over the mallets.
  - **PLD Anser:** between the Newport and the mallets everywhere, as its note says.
  - **Spider Tour:** the best for a loose hand (0.5 to 0.7 better than the blades), and the kinder mallet on rhythm.
  - **OZ.1:** the best for a good rhythm with a shaky line (0.35 better than the Spider, 1.2 to 1.5 better than the
    blades), and the worst for a shaky rhythm.
  - **White Hot:** last for every hand but one, 0.3 to 0.6 behind the bought blades (0.7 to 0.9 for a loose hand).
    It was 0.6 to 1.8 behind the best putter; now 0.35 to 1.4.

  The shop's notes still match the numbers. The Circle T is still the Newport, and the Atelier still plays just
  below the Spider (15.77 against 15.67 for the loose hand).

  **What is left:**
  - **Prices are unchanged.** The Spider ($400) is the cheapest and is no longer better than the blades for an
    ordinary hand, so the audit's complaint is gone. The OZ.1 ($600) costs the most and is the best for only one
    kind of hand; that is a pricing call for the user.
  - **The practice blade and mallet are untouched** (the range's own, used outside a career). The practice blade's
    start line is still 0.40, wider than any shop putter's now.
  - **All of this rests on the assumed hands.** Which of the five a real player is, nobody has measured.
- **Measured:** putts per nine (`b2`), and for the average hand the first putts holed by distance (`b1`, 1,000 holes
  a cell).

  | Putter | Price | Steady | Average | Loose | Average hand: 10 ft | 20 ft | 30 ft | Three-putts from 60 ft |
  |---|---|---|---|---|---|---|---|---|
  | White Hot (starter) | — | 11.40 | 13.58 | 15.89 | 64% | 38% | 19% | 6% |
  | Newport 2 / Circle T | $450 / $12,500 | 11.22 | 13.34 | 15.52 | 68% | 42% | 21% | 4% |
  | PLD Anser | $450 | 11.11 | 13.23 | 15.45 | 70% | 43% | 23% | 5% |
  | Spider Tour | $400 | 10.79 | 13.08 | 15.03 | 75% | 46% | 25% | 9% |
  | OZ.1 | $600 | 10.67 | 12.81 | 14.80 | 78% | 53% | 27% | 8% |
  | Atelier mallet | $45,000 | 10.79 | 13.08 | 15.02 | 75% | 46% | 25% | 9% |

  The order is the same for all three hands. The starter to the OZ.1 is 0.7 to 1.1 strokes per nine. The Spider
  costs $50 less than either blade and beats both by 0.15 to 0.49.
- **The blades' edge is real but small:** about half as many three-putts from 45–60 ft. That is a few hundredths of
  a stroke per long putt, against the mallets' 5–10 points more holed from 10–20 ft.
- **Does a shakier tempo flip it? No.** The average hand with a wider tempo spread (`b3`):

  | Tempo spread (sd) | White Hot | Newport 2 | PLD Anser | Spider | OZ.1 |
  |---|---|---|---|---|---|
  | 0.12 (the average hand) | 13.58 | 13.34 | 13.23 | 13.08 | 12.81 |
  | 0.20 | 14.36 | 13.90 | 13.89 | 13.87 | 13.68 |
  | 0.30 | 14.94 | 14.63 | 14.57 | 14.45 | 14.23 |
  | 0.40 | 15.31 | 15.05 | 14.98 | 14.80 | 14.61 |

  At 0.20 the blades draw level with the Spider; the OZ.1 leads throughout.
- **The one case the blades win** is a player whose tempo reads low all the time, which is what a true pendulum
  does (PT2): Newport 14.95, Spider and OZ.1 15.98. That is the reader's bias, not a trade the player can see.
- **Against the swing audit:** S5.7's fix note says "It's now a trade", from single putts with assumed stroke
  errors. With strokes through the real reader and every hole played out, the mallets come out ahead. S5.7 warned
  its numbers rested on the assumed errors; these still do, but less.
- **Why it matters:** the shop sells four styles as a choice. For every hand tried there is one right answer, the
  $600 one, and the second-best is the cheapest putter on sale.
- **Fix (S, after PT4 and PT5):** once stability and sweet spot do something, re-tune so each family wins
  somewhere, or accept a ladder and price it as one (the Spider above the blades). Narrowing the start-line range
  is the biggest single lever: 0.42 to 0.22 is worth more than everything else together. Re-run `b1`, `b2`, `b3`.

## Stats and pressure

### PT7 [Medium, dead mechanic] Tilt cannot be above zero on a green
- **✅ Fixed 2026-11-20, with the user's rule: reaching the green or fringe takes one level off.** It used to clear
  Tilt. The fairway and the tee still clear it. A putt that stays on the green leaves Tilt as it is, holed or not; a
  putt that runs off into the rough still adds a level. Measured with `tools/test/putt-fix6.js`.
- **It was wider than putting.** Every hole ends with the ball holed, and holing cleared Tilt, so Tilt was also zero
  at the end of every hole. "In a round it follows you to the next tee" never happened, and the caddies' calm perk
  ("walks off one level of tilt each hole", "every hole starts with no tilt") had nothing to walk off. Both work now:
  `nextRoundHole` and `caddieWalkOff` were already written for it and only ever received zero.
- **The rule, through the game's own `tiltFromLie`:**

  | Finishing lies, in order | Tilt after each |
  |---|---|
  | rough, green | 1, 0 |
  | rough, rough, green | 1, 2, **1** (was 0) |
  | rough, bunker, rough, fringe | 1, 2, 3, **2** (was 0) |
  | rough, rough, green, green (a chip on) | 1, 2, 1, 0 |
  | rough, rough, fairway | 1, 2, 0 |
  | rough, rough, green, then a putt off into the rough | 1, 2, 1, 2 |

  A real putt at Tilt ×2 on the practice green read "tilted" with the gate at 2.64% (the putter's is 3.00%), and
  Tilt was still ×2 when the ball stopped.
- **What Tilt does to a putt.** Nothing in the putting-pressure code changed (its two shake numbers are now named
  `PUTT.tiltShake` and `tiltShakeMin`). It bites harder than the audit's table suggested, because a rail hit now
  costs something (PT4). Extra putts per nine if every putt were struck at that level, average hand:

  | Tilt on the green (how you got there) | Newport 2: Composure 1 / 5 / 10 | Spider: Composure 1 / 5 / 10 |
  |---|---|---|
  | ×1 (two bad lies, then the green) | +0.11 / +0.10 / +0.05 | 0 / 0 / 0 |
  | ×2 (three) | +0.77 / +0.34 / +0.11 | +0.14 / +0.04 / +0.04 |
  | ×3 (four) | +3.26 / +1.30 / +0.17 | +0.70 / +0.30 / 0 |
  | ×4 (five) | +3.37 / +3.46 / +0.35 | +0.73 / +0.71 / +0.06 |

  At ×3 with Composure 1 the Newport holes 72% from 5 ft (98% calm) and clips the rail on 57% of putts.
  - **One level is barely felt**, as the tips say of Tilt in general.
  - **Composure now matters on the green**: at ×3 it is the difference between +3.3 and +0.2 with a blade.
  - **A wide gate shrugs it off.** The mallets lose a fifth of what the blades do. Under pressure they are the
    safer putters, which PT6's table (struck calm) does not show.
- **Also changed:** the Tilt tip, a new "Tilt on the green" tip in the putting tips, the C9 note at the top of the
  file, and `tiltFromLie` is on the test hook.
- **What is left:**
  - **A lay-up calms you more than hitting the green.** From Tilt ×2 a ball that finds the fairway clears it all; one
    that finds the green takes one level off. That follows from the rule as chosen.
  - **The shake has a floor** (`tiltShakeMin` 0.25), so the faintest Tilt shakes as hard as 0.25. It costs under 0.1
    putts per nine, and was left alone.
  - **Not played end to end.** The rule and a live putt were run; a whole round, with Tilt arriving on the next tee
    and a caddie walking it off, was read from the code and not played.
- **Where:** `tiltFromLie` (about line 9643) clears the bad streak when a ball finishes on the green, fringe,
  fairway or tee. It is called after every full shot and chip, and `updatePutt` calls it with `'green'` after any
  putt that stays on the green or its collar. So the ball can only be putted after a shot that cleared the streak.
  A putt that runs off into the rough adds one, but the chip back clears it again.
- **Not played end to end.** This is read from those three call sites.
- **What it switches off:** the narrowed gate (`puttGate`), the shaking hands (`swingSample`'s "knee-knocker") and
  the strike multiplier in `computePutt`. They run only from the dev sliders on the practice green. Composure
  therefore has no effect on putting.
- **For reference, what they would do** (practice blade, a perfectly straight stroke through the reader):

  | Bad streak, Composure | Tilt | Gate | Start-line spread: 13% stroke | 33% | 75% | Rail hits (13% / 33%) |
  |---|---|---|---|---|---|---|
  | 2, Composure 5 | 0.34 | 2.6% | 1.04° | 0.69° | 0.30° | 0 / 0 |
  | 3, Composure 5 | 0.84 | 2.1% | 1.40° | 0.68° | 0.28° | 0 / 0 |
  | 4, Composure 5 | 1.43 | 1.65% | 2.16° | 0.80° | 0.33° | 17% / 16% |
  | 4, Composure 1 | 2.30 | 1.65% | 2.05° | 0.82° | 0.31° | 19% / 16% |
  | 4, Composure 10 | 0.35 | 2.6% | 1.02° | 0.67° | 0.29° | 0 / 0 |

  The shake has a floor (`clamp(tilt, 0.25, 1.4)`), so the faintest Tilt shakes as hard as 0.25. It is also a fixed
  number of counts, so it is rough on a tap-in's short stroke and gentle on a lag.
- **Decision for the user:** should pressure follow the player onto the green? If yes, the streak needs to survive
  reaching the green (for example, clear it on holing out, or drop one level per green hit). If no, this code and
  the Composure wording around putting can go.

### PT8 [Medium, feel / balance] Dexterity changes nothing on the green; Perception very little
- **✅ Fixed 2026-11-20 for Dexterity. Perception is left as it is.** Dexterity now does two things in `computePutt`,
  measured with `tools/test/putt-fix7.js`:
  - **It steadies the face.** The putter's start-line gain is multiplied by 1.16 at Dexterity 1, falling to 0.80 at
    Dexterity 10 (`PUTT.dexLine`).
  - **It tightens the strike.** A miss's millimetres off the middle are multiplied by 1.20 at Dexterity 1, falling
    to 0.75 at 10 (`PUTT.dexStrike`). It already trimmed the wobble part.

  Both are exactly 1 at Dexterity 5, so the test round (everyone at 5) and every table above are unchanged.

  One stroke drawn 2° off line and 1.5% wide of the ball, Newport 2:

  | Dexterity | 1 | 2 | 3 | 5 | 8 | 10 |
  |---|---|---|---|---|---|---|
  | Start line | 1.23° | 1.17° | 1.10° | 0.98° | 0.79° | 0.67° |
  | Strike | 8.4 mm, −8.8% | 8.0 mm, −8.1% | 7.7 mm, −7.4% | 7.0 mm, −6.0% | 5.9 mm, −3.9% | 5.2 mm, −2.4% |

  Putts per nine. Before the fix every column read the same as Dexterity 5's.

  | Hand | Putter | Dex 1 | Dex 2 | Dex 3 | Dex 5 | Dex 8 | Dex 10 | 1 to 10 is worth |
  |---|---|---|---|---|---|---|---|---|
  | Steady | White Hot | 11.68 | 11.60 | 11.50 | 11.24 | 10.90 | 10.70 | 0.97 |
  | | Newport 2 | 11.32 | 11.24 | 11.11 | 10.89 | 10.57 | 10.40 | 0.93 |
  | | OZ.1 | 11.13 | 11.08 | 11.03 | 10.93 | 10.76 | 10.68 | 0.45 |
  | Average | White Hot | 14.28 | 14.14 | 14.07 | 13.87 | 13.48 | 13.16 | 1.11 |
  | | Newport 2 | 13.83 | 13.71 | 13.59 | 13.32 | 12.90 | 12.61 | 1.22 |
  | | OZ.1 | 13.65 | 13.59 | 13.51 | 13.35 | 13.13 | 12.95 | 0.70 |
  | Loose | White Hot | 17.74 | 17.61 | 17.40 | 17.05 | 16.61 | 16.28 | 1.46 |
  | | Newport 2 | 16.95 | 16.77 | 16.60 | 16.34 | 15.82 | 15.49 | 1.46 |
  | | OZ.1 | 16.17 | 16.05 | 15.98 | 15.73 | 15.37 | 15.18 | 0.99 |

  With the Newport the average hand holes 62% from 10 ft at Dexterity 1 and 81% at Dexterity 10.

  **What else it moved:**
  - **A new career putts a little worse than before.** It starts at Dexterity 2 with the White Hot: 0.27 putts per
    nine more for the average hand (0.36 steady, 0.56 loose). The first circuit's hustlers were tuned before this.
  - **Dexterity tilts the putter trade toward the blades.** A blade has more start-line gain and a smaller sweet
    spot for Dexterity to work on. Average hand, Newport against OZ.1: 13.83 against 13.65 at Dexterity 1, level at
    5, 12.61 against 12.95 at 10. Mallets for a beginner's hands, blades for a tour player's.

  **Perception** is unchanged. On a flat green it only moves the pace band, worth about 0.15. Its real job is
  reading a sloped green (how clearly the slope and break are shown), which this audit's flat-green Monte Carlo
  cannot measure. Nothing found says it is broken.
- **Where:** `computePutt` uses Dexterity only in `wobble × 1.2 × (1 − 0.4 × dexF)`, a part of the strike, which
  is inert (PT5). `readMarker` (about line 9685) uses Perception for the pace band: half-width from ±12% to ±1%, and
  its centre off by up to 10% down to 0.
- **Measured:** the average hand with the practice blade, putts per nine.

  | Level | 1 | 2 | 5 | 8 | 10 |
  |---|---|---|---|---|---|
  | Dexterity | 13.47 | 13.47 | 13.47 | 13.47 | 13.47 |
  | Perception | 13.62 | 13.62 | 13.47 | 13.49 | 13.46 |

  Perception here is only the pace band's bias on a flat green. Its effect on how much of the green's break is
  shown was not measured. Power has no part in putting, and Composure has none either (PT7).
- **Why it matters:** in an RPG, a player who levels Dexterity for touch gets nothing on the green, where touch
  matters most.
- **Decision for the user, then S:** if Dexterity should help, it can trim the start line's gain, widen the tempo
  window a little, or soften a rail hit.

## What the player is shown

### PT10 [Low, shown] Three screens name and scale the same four numbers differently
- **✅ Fixed 2026-11-20.** One function, `putterBars`, now makes the four bars for the shop, the bag screen and the
  putting green's putter card. The names are the shop's everywhere: Stability, Start line, Sweet spot, Pace feel.
  Each bar is where the putter's number sits between the least and the most forgiving of all the putters (15 to
  100), so it stays right when the numbers are re-tuned. The hover text on the putter card is updated for what the
  bars do since PT4 and PT5. Measured with `tools/test/putt-fix9.js`, which reads the bars each screen draws:

  | Putter | Stability | Start line | Sweet spot | Pace feel |
  |---|---|---|---|---|
  | White Hot (starter) | 15 | 25 | 15 | 67 |
  | Newport 2 / Circle T | 23 | 45 | 22 | 100 |
  | PLD Anser | 38 | 40 | 41 | 81 |
  | Spider Tour | 100 | 60 | 100 | 43 |
  | OZ.1 | 77 | 100 | 67 | 15 |
  | Atelier mallet | 92 | 60 | 87 | 43 |
  | Practice blade | 23 | 15 | 22 | 62 |
  | Practice mallet | 92 | 75 | 87 | 24 |

  The shop's putter tab, the bag screen and the putter card drew the same four names and the same numbers for the
  same putter (checked with the White Hot in a new career, and all seven putters in the shop).
- **On the bars' weight:** the audit noted four equal-looking bars for attributes worth about 1.5, 0.7, 0 and 0.
  After PT4 to PT6 they are much closer: across the shop's range the start line and pace feel are each worth roughly a
  putt per nine, the sweet spot 0.05 to 0.7 and stability 0 to 0.6, depending on the hand.
- **Test hooks added:** `putterBars`, `createCareer`, `openShop`, `openBagRoom` (and `tiltFromLie`,
  `autoSelectPuttScale` in PT7 and PT9).
- **Where:** `shopPuttersHTML` (about line 13673): Stability, Start line, Sweet spot, Pace feel, each scaled from
  the shop's worst to best as 15–100. The bag screen (about line 13841): Stroke gate, Start line, Sweet spot, Tempo,
  on fixed ranges. `renderPutterCard` (about line 13866): Stroke gate, Start line, Sweet spot, Tempo window, on the
  same fixed ranges.
- **Measured:** the Newport's pace bar is 100 in the shop and off the top of the fixed scale (114%, clamped). The
  OZ.1's is 15 in the shop and 4 on the bag screen.
- **Also:** four bars of equal weight for attributes worth about 1.5, 0.7, 0 and 0 putts per nine.
- **Fix (S):** one set of names and one scale. Worth doing after PT4 and PT5, when all four bars mean something.

## Checked and fine

- **Start line.** `start = stroke direction × pathGain`, exactly. The reader's direction is accurate: a stroke
  drawn at 2° reads 2.00–2.13°, at 8° reads 7.86–7.99°, at every stroke length. Worst case is 1° on an 8% stroke,
  read as 1.29°.
- **Length.** Read exactly (5% reads 5.0%, 100% reads 100.0%), and the pace it gives is exact on all three scales.
- **Report rate.** 125 and 1,000 reports a second give the same tempo within 0.02.
- **A still pause.** With the hand truly still, a hold of 0 to 600 ms at the top reads the same tempo (0.83–0.84).
- **How straight a putt has to be.** The start-line error that still holes, flat, 1.5 ft past the hole. It is the
  cup's real size, and barely changes with the green's speed.

  | Distance | 3 ft | 5 ft | 8 ft | 10 ft | 15 ft | 20 ft | 30 ft |
  |---|---|---|---|---|---|---|---|
  | Start line, Stimp 11 | ±3.07° | ±1.84° | ±1.15° | ±0.92° | ±0.61° | ±0.46° | ±0.31° |
  | Same, 5 ft past | ±2.15° | ±1.29° | ±0.81° | ±0.65° | ±0.43° | ±0.32° | ±0.22° |
  | Stroke direction, White Hot | ±7.3° | ±4.4° | ±2.7° | ±2.2° | ±1.5° | ±1.1° | ±0.7° |
  | Stroke direction, Spider | ±11.4° | ±6.8° | ±4.3° | ±3.4° | ±2.3° | ±1.7° | ±1.1° |
  | Stroke direction, OZ.1 | ±13.9° | ±8.4° | ±5.2° | ±4.2° | ±2.8° | ±2.1° | ±1.4° |
- **Pace window.** A dead-straight 10-footer drops with a stroke worth 9.84 to 18.4 ft.
- **The cup.** It catches 97% of its width at half a foot past, 91% at 1.5 ft, 80% at 3 ft, 64% at 5 ft and 22% at
  8 ft past (`captureSpeed` 1.6, from S8.3).
- **Fast greens.** Country-club speeds (Stimp 13 to 15), 10 ft straight down the steepest line at each pin: 5%
  too much ball speed runs 0.7 to 1.2 ft past, and 10% runs 1.5 to 2.6 ft. On flat ground it is 1.0 and 2.1.
- **Slopes.** 0.3–2.1% at the pins and up to 3.7% ten feet away, inside the caps (2.2% and 3.8%).
- **The longest putt.** The Lag scale tops out at 99 ft (110% of 90). The furthest any point of any green is from
  its pin is 70 ft (hole 5), and the longest any putt plays, uphill at country-club speed, is 76 ft (holes 3 and 9).
- **The pure skid.** A pure stroke's skid (0.15 to 1 ft) barely changes the break: 26.9 in on a 20 ft putt with no
  skid, 26.1 in with its 0.5 ft.
- **The shop's notes** match the numbers: the Newport has the widest tempo window, the Spider the widest gate, the
  OZ.1 the straightest start line and the tightest window, the Circle T is the Newport exactly.
- **The luxury putters** are copies by design: the Atelier scores the same as the Spider (13.08).

## The assumed hands

Three hands, each a stroke with random errors, fed through the real reader:

| Hand | Direction (sd) | Sideways position (share of the full stroke) | Length | Tempo (sd) | Stroke direction read | Start line, blade | Pace, blade |
|---|---|---|---|---|---|---|---|
| Steady | 0.8° | 0.4% | 0.6% + 1% of the stroke | 0.06 | 0.98° | 0.40° | 4.3% |
| Average | 1.5° | 0.8% | 1.2% + 2% | 0.12 | 1.89° | 0.79° | 9.9% |
| Loose | 2.5° | 1.4% | 2.0% + 3.5% | 0.20 | 3.19° | 1.33° | 14.9% |

First putts holed on a flat Stimp 11 green with the practice blade, against approximate tour averages:

| Distance | 3 ft | 5 ft | 8 ft | 10 ft | 15 ft | 20 ft | 30 ft | 40 ft | 60 ft |
|---|---|---|---|---|---|---|---|---|---|
| Tour (approx.) | 96% | 77% | 50% | 40% | 23% | 15% | 7% | 4% | 2% |
| Steady | 100% | 100% | 100% | 96% | 85% | 79% | 47% | 36% | 23% |
| Average | 100% | 98% | 87% | 65% | 52% | 39% | 17% | 14% | 8% |
| Loose | 95% | 81% | 56% | 35% | 28% | 20% | 7% | 7% | 3% |

Only the loose hand is near the tour, and it averages 2.14 putts from 40 ft and 2.30 from 60 (tour about 2.06 and
2.21). That fits S8's note that putting is far easier than real golf, though a flat green with nothing to misread
flatters every hand.

**How to replace the estimates.** `window.__golf.puttTel` holds the last stroke's reading (`sw`) and result (`res`).
A console snippet that logs it after each putt, as `tools/test/swing-mylog.js` does for full swings, would give a
real spread for direction, length, miss and tempo. PT2 and PT6 would be worth re-reading against it.

## Noticed for later

- **Putting precision follows the calibration.** The gate and the miss are shares of the calibrated full swing
  (800 counts by default). A small calibrated swing makes every putt coarser: at the default, one count sideways at
  the top of a 5% stroke is 0.57° of start line with the blade.
- **Real putting rhythm is about 2:1.** The game's pure is 1:1 by design. See the last option under PT2.
- **Not audited:** the green-reading display, the aim preview, opponents' putting, and putting on contoured greens
  in the Monte Carlo.
