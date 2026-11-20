# Campaign mode — plan

A career mode on top of the existing game: you start weak with cheap clubs, hustle NPC golfers for money, and spend the
winnings on gear, lessons and course access to move up three tiers of courses.

Build it in **chunks**. Each chunk ends in something the user can play and test before the next one starts. Each chunk
section below is meant to be enough on its own: read it and the "Fixed points in the code" section, then build.

Everything lives in `index.html` (one ES module, Three.js r160). Re-read the code you touch first; other sessions edit
this file.

---

## Who decided what

**Stated by the user** (from their campaign brief, 2026-11-18):

- Third-person golf RPG with a hub; low starting attributes and low-grade starter clubs.
- Loop: play matches → win wagers → spend on gear, lessons and course access → move up circuits.
- Wagers against NPC golfers: lump-sum match play, skins per hole, mid-round presses.
- You may bet more than your bankroll. Losing a bet you can't cover: the NPC beats you up and snaps a random club, which
  is gone until you buy it again.
- Pro shop: replacement clubs, better clubs, bag loadout.
- Lessons: pay to raise attributes; unlock shot-shaping abilities (draws, fades, low stingers, high / flop shots).
- Hub: an overworld or a clubhouse UI with the shop, practice facility and course select.
- Three tiers: munis and executive tracks with small-time hustlers; semi-private resorts, bigger stakes, tougher
  conditions; private country clubs that need reputation, entry fees and elite gear.
- Build it in chunks to test as we go and save tokens.

**My defaults** (change any of them; each is one constant or one rule):

- The hub starts as a **clubhouse menu** (a DOM overlay), not a walkable overworld. The overworld is a late chunk.
- NPC opponents are **simulated**, not drawn in 3D: their score on each hole is rolled from their skill and revealed
  when you hole out.
- The **test round and its leaderboard stay as they are**: standard stats, the full bag, nothing from the career.
- Losing a bet you can't cover: you pay everything you have, take a beating, and one random club (never the putter)
  is snapped. ~~The rest of the debt is wiped~~ (changed 2026-11-19, audit 7.1: that made betting on credit nearly
  free): the rest goes on your **marker** (`career.debt`), which comes out of your cash when the next match or
  invitational is settled and uses up your credit while you owe it (at least $25 of credit always stays).
- **Quitting a match part-way is a forfeit** (you lose the stake), so reloading can't dodge a loss.
- The economy numbers in the `CAREER` table below.

**Open questions** (answers change a rule, not the structure):

1. ~~After the beating, is the debt wiped (my default), or do you still owe it?~~ You still owe it (audit 7.1).
2. The design PDF listed Charisma. Add it? My suggestion: it improves the terms NPCs offer (bigger stakes, more presses)
   and gives a small shop discount.
3. Clubhouse menu first, overworld later: OK?

---

## Fixed points in the code (verified 2026-11-18)

- `CLUBS` (array of club objects: `speed`, `loft`, `sweet` mm, `gear`, `bulge`, `work`, `floor`, `curve`, ...). The
  bag, keys (`CLUB_KEYS`), `[ ]` / wheel and bag clicks all select by **index** (`state.club`). The last entry,
  `7 Iron · Game Improvement`, is a comparison club; hide it in a career.
- Putters are separate: `PUTTERS.blade`, `PUTTERS.mallet`, chosen by `state.putter`.
- Stats: `state.power`, `state.dex`, `state.composure`, `state.perception` (1-10), set together by `setStats(s)`.
  The test round saves the player's own stats in `round.saved`, plays `ROUND_STATS` (all 5) and restores them in
  `endRound()`. A career does the same with the career's stats.
- Holes: `HOLES[]` (each has `par`, `desc`, `ob`, `wind {mph, from}`, `stimp`), built with `buildHole(i)` then
  `enterHole()`; `leaveHole()` goes back to the range. `applyRoundConditions()` applies a hole's own wind and green
  speed; `holeStimp()` reads it.
- The round: `round` (`on`, `scores[]`, `over`), `startRound()`, `nextRoundHole()`, `quitRound()`, `endRound()`,
  `finishHole()` (records `{strokes, putts, par, pen}` in `round.scores[hp.holeIdx]`), `showScorecard()`,
  `openRoundIntro()` (the course preview). Tilt is `state.badStreak`; `nextRoundHole()` carries it to the next tee.
- Shot types: `SHOT_SHAPES` + `applyShot()` (F), `setHeight()` (W / S, -2..+2), `setSpinCtl()` (B), chip types
  `CHIP_TYPES` + `applyChipType()` (1-4, `flop` needs 50°+ loft). Manual tweaks: face Q/E, stance Z/C, ball A/D.
- Near the green the game picks a chip club with `suggestChipClub()`.
- UI patterns to copy: cards with `.card` / `.card-h`, modal overlays (`#roundIntro`, `#dropCard`, `#tipsCard`) with a key
  intercept near the top of the keydown handler (`lbEntry.active → introOpen → dropOpen → tipsOn → ...`), `toast()`,
  `body` classes for modes (`hole`, `round`, `putt`, `chip`).
- Storage pattern: `localStorage` wrapped in try/catch (see the leaderboard's `lbLoad` / `lbSave`).

---

## Data model

One save, `localStorage['golfCareer_v1']`:

```js
career = {
  v: 1, name: 'KEITH', seed: 123456789,         // seed: rolls NPC scores, so a reload can't re-roll them
  cash: 150, rep: 0, tier: 1,
  stats: { power: 2, dex: 2, composure: 2, perception: 2 },
  bag: { 0: 'd-xr16', 3: 'h-xr', 5: 'i-ap1', 7: 'i-ap1', 9: 'i-ap1', 10: 'i-ap1', 12: 'w-sm6' },   // CLUBS index -> model id
                                                  // (see the club catalogue); missing = not owned
  snapped: [5],                                   // owned indices that are broken (not usable until rebought)
  putter: 'p-wh2',
  unlocks: { draw: false, fade: false, stinger: false, high: false, flop: false, spin: false },
  match: null,                                    // the match in progress (below), saved after every hole
  history: [],                                    // finished matches: { npc, format, stake, result, net, date }
  stamp: 0,
}
match = {
  npc: 'gus', format: 'match' | 'skins', stake, course: 1, conditions,   // conditions: { stimpAdd, windMult }
  holes: [{ me, npc }],                           // per hole, filled as holes are finished
  presses: [{ from: hole, stake }],
}
```

## Economy table (`CAREER`, one place)

| Thing | Default |
|---|---|
| Start | $150 cash, rep 0, all stats 2, tier 1 |
| Starter bag | 7 used clubs + a used blade putter, all from around 2015–16 (chunk 2) |
| Club prices | by model, in the club catalogue (iron sets up to $1,600, plus luxury sets up to $125,000; one iron to replace a snapped one = set ÷ 7 × 1.25) |
| Drivers, wedges, putters | by model, in the club catalogue |
| Lesson (+1 to a stat) | $60 × current level² (5→6: $1,500); the first two cheaper (2→3: $80, 3→4: $360; audit 7.3) |
| Shot unlocks | draw $250 · fade $250 · stinger (Low 2) $300 · high (High 2) $300 · spin control $350 · flop $400 |
| Green fee | tier 1 $10 · tier 2 $60 · tier 3 $300 |
| Credit (bet above bankroll) | max stake = cash + 100 + 2 × rep, and never above the NPC's own limit |
| Reputation | win: +5 / +12 / +25 by tier · loss −2 · can't pay −10 |
| Tier gates | tier 2: rep 40 · tier 3: rep 120, $500 entry, a players-cavity or blade iron set and a non-worn driver |

---

## Club catalogue (user request 2026-11-18)

**Stated by the user:** four categories of irons: a worn, ~10-year-old used set that is "all around not great" (the
starting set), game improvement, an in-between option, and blades. Each has 2–3 brands that differ slightly
(forgiveness, distance, descent angle and so on), true to how real clubs in that category behave.

**Real brands and models** (user's choice, 2026-11-18): current 2025–26 irons, and two ~10-year-old sets for the used
category. Each model's character follows published reviews and specs; where a 7-iron loft could not be confirmed it is
marked *≈* and must be checked against the maker's spec sheet when building. Prices are approximate US street prices
for a 4i–PW steel set (tune them to the game's economy). If the game is ever published or sold, real brand and model
names need trademark clearance; for a private project they are fine.

### What the research says (7 iron, average player)

| | Worn used set | Game improvement | In-between (players distance / cavity) | Blade (muscle back) |
|---|---|---|---|---|
| 7-iron loft | ~32–33° (2015-era) | 27–30° | 30–33° | 34–35° |
| Carry vs a blade | −3 to −5 yds | **+10 to +14 yds** | +3 to +8 yds | — |
| Launch | about the same | about the same as a blade (low, deep CG offsets the strong loft) | about the same | — |
| Spin | lower, and much lower from the rough (worn grooves; fliers) | ~1,000–1,500 rpm less | a few hundred rpm less | most |
| Descent (stopping) | a bit flatter | **3–5° flatter**: rolls out, harder to stop | ~1–2° flatter | steepest (~46–47°) |
| Off-centre hits | middling, and inconsistent (mismatched shafts, bent lies) | keep the most ball speed; ~7 yds lost on a toe hit vs 13–17 | in between | lose the most, twist the most |
| Shaping | middling | hardest to curve (offset, low CG) | in between | easiest to curve, easiest to hit low |
| Bias | random push / pull per club | slight draw (offset helps square the face) | slight | none |

Rule of thumb from robot testing: one degree less loft is about one degree flatter landing.

### How each property maps onto the game's club numbers

The current irons in `CLUBS` are players / blade-like (7 iron: loft 34, dynLoft 20, spin 7000, work 1.0, sweet 5 mm,
gear 1.2, floor 0.5). The existing comparison club `7 Iron · Game Improvement` (loft 30, dynLoft 21.3, spin 6200, speed
91, work 0.45, sweet 12, floor 0.85, gear 0.5) is already a fair GI iron. A model is a set of **changes from the base
club**:

| Property | Game field(s) | Notes |
|---|---|---|
| Distance | `loft` (a stronger loft raises smash factor in `computeImpact`), `speed` | the loft change drives most of it, as in real life |
| Launch / descent | `dynLoft` | keep launch near the base: a GI iron's delivered loft drops less than its static loft |
| Spin / stopping | `spin` | flatter descent follows from less spin and stronger loft |
| Forgiveness | `sweet` (ball speed kept off-centre), `gear` (twist on mishits) | |
| Shaping / steadiness | `work` (how much the mouse line turns into curve) | low `work` = forgiving of a crooked swing but hard to shape; the F presets solve for it |
| Hitting it low | `floor` (spin floor: how far the club can be de-lofted) | blades go lowest (stingers) |
| **new** draw bias | `offset` (deg, closes the face) | physics hook below |
| **new** consistency | `consist` (× the random path / face / strike scatter) | worn set > 1, GI < 1 |
| **new** worn grooves | `groove` (× spin; again from rough or sand; more fliers) | 1 = fresh |
| **new** bent lie angles | `lieBias` (deg, per club, fixed) | the worn sets only; rolled once from `career.seed` |

**Physics hooks** (small, inside `computeImpact`, every new field optional and neutral when missing, so the test round
and range don't change):

- `faceDyn -= club.offset || 0` (a closed face: the ball starts and curves a little left).
- The three baseline scatter terms (`basePathDeg`, `baseFaceDeg`, `baseStrikeMm` × `dexSpread`) × `club.consist || 1`.
- `spin *= g`, and from a rough or sand lie `spin *= g` once more, where `g = club.groove || 1`; flier chance
  `lie.flier × (1 + 2 × (1 − g))`.
- `path += club.lieBias || 0`.
- Flop difficulty `CHIP.flopCx × (club.flopX || 1)` (wide-soled cavity wedges, see Wedges).

### Iron models (deltas on the base irons 4i–PW; loft deltas shown for the 7 iron, ×0.8 for 4i–5i)

loft Δ = the model's real 7-iron loft − 34° (the base 7 iron).

| Id | Model | Category | 7i loft | Price (set) | loft Δ | dynLoft Δ | spin × | speed × | sweet × | gear | work | floor | offset | consist | groove | lieBias |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `i-ap1` | Titleist AP1 716 (2015, hand-me-down) | Used | ≈30° | starter | −4 | +0.8 | 0.9 | 0.96 | 1.6 | 0.8 | 0.65 | 0.7 | 0.9 | 1.35 | 0.8 | ±1.2° |
| `i-m2` | TaylorMade M2 (2016, pawn shop) | Used | 28.5° | $200 | −5.5 | +1.0 | 0.8 | 0.99 | 1.8 | 0.7 | 0.55 | 0.8 | 1.1 | 1.4 | 0.75 | ±1.5° |
| `i-qimax` | TaylorMade Qi Max | Game improvement | ≈28.5° | $1,100 | −5.5 | +1.4 | 0.86 | 1.01 | 2.4 | 0.5 | 0.45 | 0.85 | 1.1 | 0.85 | 1 | 0 |
| `i-jpxhm` | Mizuno JPX 925 Hot Metal | Game improvement | 28° | $1,050 | −6 | +1.0 | 0.82 | 1.015 | 2.0 | 0.6 | 0.5 | 0.85 | 0.9 | 0.9 | 1 | 0 |
| `i-takomo` | Takomo 101 MKII | Game improvement | ≈29° | $580 | −5 | +1.1 | 0.86 | 1.0 | 2.1 | 0.55 | 0.5 | 0.85 | 0.8 | 0.8 | 1 | 0 |
| `i-ai200` | Callaway Apex Ai200 | In-between (players distance) | 30° | $1,400 | −4 | +0.7 | 0.9 | 1.01 | 1.8 | 0.7 | 0.7 | 0.7 | 0.6 | 0.92 | 1 | 0 |
| `i-zxi7` | Srixon ZXi7 | In-between (players cavity) | 32° | $1,400 | −2 | +0.4 | 0.95 | 1.0 | 1.5 | 0.85 | 0.8 | 0.65 | 0.4 | 0.92 | 1 | 0 |
| `i-620cb` | Titleist 620 CB | In-between (players cavity) | ≈34° | $1,600 | 0 | +0.2 | 0.99 | 1.0 | 1.3 | 0.95 | 0.92 | 0.6 | 0.3 | 0.95 | 1 | 0 |
| `i-wmb` | Wilson Staff Model Blade (2026) | Blade | ≈34° | $1,400 | 0 | 0 | 1.03 | 1.0 | 0.8 | 1.3 | 1.15 | 0.45 | 0 | 1.0 | 1 | 0 |
| `i-temb` | Tour Edge MB Forged | Blade | ≈34° | ≈$1,000 | 0 | +0.1 | 1.0 | 1.0 | 1.0 | 1.15 | 1.05 | 0.5 | 0.1 | 1.0 | 1 | 0 |

One-line character for the shop (from the reviews): **AP1 716**: a forgiving 2015 cavity, now tired: worn grooves,
mismatched shafts, the odd one pulls or pushes · **M2**: famously long and strong-lofted, but this set is beaten up,
wild and won't stop · **Qi Max**: the most forgiving and highest launching, holds greens best of the GIs · **JPX 925
Hot Metal**: the longest, lands flattest and runs · **Takomo 101 MKII**: the budget pick and the most accurate GI in
testing · **Apex Ai200**: GI-like distance in a players' shape · **ZXi7**: the most forgiving players' cavity, the
all-rounder · **620 CB**: close to a blade with a little help · **Wilson Staff Model Blade**: compact, minimal offset,
tiny sweet spot, shapes anything, the best stinger · **Tour Edge MB Forged**: a true muscle back with a bit more
forgiveness.

Each model's numbers above are my mapping of its reputation onto the game, not measured data; the tuning targets below
keep the categories in the right order.

Irons are bought **as a set** (4i–PW); the set's model applies to every iron you own.

**Tuning targets** (7 iron at Power 5, from the research, checked with `stockFlightOf` and the minimap spread before
shipping): vs the Wilson blade, the GI sets carry +10–14 yds with spin −1,000–1,500 rpm and land 3–5° flatter;
in-between +3–8 yds and 1–2° flatter. The used sets have strong lofts (they were GI-type sets), so they go about as far
as a blade but with a landing area ~35% wider, fliers from the rough and a fixed push or pull on some clubs. Models
within a category differ by only a few yards and a degree or two.

### Woods, wedges and putters (build after the irons, in the same chunks)

Chosen from 2026 reviews and buyer's guides (user request, 2026-11-18), on the same terms as the irons: approximate
prices, ≈ where a detail needs checking against the maker's site when building, and each model's numbers are my
mapping of its reputation onto the game.

### Drivers (deltas on the base Driver, `CLUBS[0]`: speed 112, dynLoft 12.8, spin 2600, sweet 10 mm, gear 0.8, work 0.85)

What the reviews say: max-forgiveness drivers launch highest and spin more, and some have a built-in draw bias;
low-spin drivers go further when struck well but punish mishits more, and the Triple Diamond family leans to a fade.

| Id | Model | Kind | Price | dynLoft Δ | spin × | speed × | sweet × | gear | work | offset | consist |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `d-xr16` | Callaway XR 16 (2016, used) | Used (starter) | starter | +0.3 | 1.15 | 0.97 | 1.0 | 0.9 | 0.85 | 0.3 | 1.3 |
| `d-m2` | TaylorMade M2 (2016, pawn shop) | Used | $90 | 0 | 1.1 | 0.98 | 1.05 | 0.85 | 0.85 | 0.2 | 1.3 |
| `d-g440k` | Ping G440 K | Max forgiveness | ≈$650 | +1.0 | 1.12 | 1.0 | 1.35 | 0.6 | 0.7 | 0.5 | 0.9 |
| `d-maxd` | Callaway Quantum Max D | Max forgiveness (draw) | ≈$600 | +0.6 | 1.08 | 1.0 | 1.25 | 0.7 | 0.7 | 1.5 | 0.95 |
| `d-qi4d` | TaylorMade Qi4D | In-between | ≈$630 | 0 | 1.0 | 1.0 | 1.1 | 0.8 | 0.85 | 0 | 1.0 |
| `d-qi4dls` | TaylorMade Qi4D LS | Low spin | ≈$650 | −0.6 | 0.87 | 1.005 | 0.9 | 0.95 | 0.95 | 0 | 1.0 |
| `d-td` | Callaway Quantum Triple Diamond | Low spin (fade) | ≈$650 | −0.8 | 0.85 | 1.005 | 0.85 | 1.0 | 1.0 | −0.8 | 1.0 |

(A negative `offset` opens the face: a fade bias.) Characters: **XR 16**: an old warhorse, spins too much, a bit
short · **M2 (2016)**: was long in its day, now just loose · **G440 K**: the most forgiving driver going, launches high
· **Quantum Max D**: forgiving and fights a slice · **Qi4D**: the best all-rounder · **Qi4D LS**: the longest when you
find the middle · **Triple Diamond**: very low spin, leans to a fade, unforgiving.

**Fairway woods and hybrids** follow the driver lines (same brand, same kind, the same deltas at half strength). The
starter's 3 hybrid is a used Callaway XR (2015) hybrid (`h-xr`: spin ×1.1, speed ×0.97, consist 1.25).

### Wedges (deltas on GW / SW / LW; bought one at a time)

What the reviews say: cavity-back wedges add forgiveness (and suit beginners) but give up a little spin and
versatility; tour wedges spin the most and have the most grinds; worn grooves can cost close to half the spin on a
pitch, and more from the rough.

| Id | Model | Kind | Price each | spin × | sweet × | gear | work | groove | consist | SW bounce | flop × |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `w-sm6` | Titleist Vokey SM6 (2016, worn) | Used (starter) | starter | 1.0 | 1.0 | 1.05 | 0.85 | 0.75 | 1.15 | 10 | 1.0 |
| `w-cb12` | Callaway CB 12 | Cavity (most forgiving) | ≈$150 | 0.92 | 1.6 | 0.7 | 0.7 | 1 | 0.9 | 14 | 1.2 |
| `w-cbx2` | Cleveland CBX 2 | Cavity | ≈$150 | 0.96 | 1.4 | 0.8 | 0.8 | 1 | 0.92 | 12 | 1.1 |
| `w-opus` | Callaway Opus | Tour | ≈$180 | 1.0 | 1.0 | 1.0 | 0.95 | 1 | 1.0 | 12 | 1.0 |
| `w-vokey` | Titleist Vokey SM11 (≈ check SM10 vs SM11) | Tour | ≈$200 | 1.02 | 1.0 | 1.0 | 1.0 | 1 | 1.0 | 10 | 0.95 |

Characters: **SM6**: a good wedge once, grooves worn smooth: fliers and no check from the rough · **CB 12**: the
easiest wedge to hit, wide sole, hard to open up · **CBX 2**: forgiving with decent spin · **Opus**: tour spin, a
forgiving higher-bounce grind · **Vokey SM11**: the most spin and the most versatile.

New optional field `flopX`: × the flop difficulty (`CHIP.flopCx`), for wide-soled cavity wedges that don't like being
laid open. Optional later: grooves wear a little each round (`groove` −0.01 per round played), so wedges need
replacing.

### Putters (replace the two entries in `PUTTERS`)

The game's putter numbers: `gate` (how wide the rails are), `pathGain` (how much a crooked stroke turns into a crooked
start line), `sweet` (mm), `tempoZone` (how forgiving it is on rhythm). Today's blade is `{gate 0.030, pathGain 0.40,
sweet 4, tempoZone 0.08}` and the mallet `{0.048, 0.28, 9, 0.04}`.

What the reviews say: blades for feel and distance control; mallets for stability; **zero-torque** putters (a new
category) keep the face square through the stroke, so a crooked stroke matters less.

| Id | Model | Kind | Price | gate | pathGain | sweet | tempoZone |
|---|---|---|---|---|---|---|---|
| `p-wh2` | Odyssey White Hot Pro 2.0 #1 (2016, used) | Used blade (starter) | starter | 0.028 | 0.42 | 3.5 | 0.07 |
| `p-newport` | Scotty Cameron Newport 2 | Blade | ≈$450 | 0.030 | 0.40 | 4 | 0.09 |
| `p-pldanser` | Ping PLD Anser | Blade | ≈$450 | 0.031 | 0.38 | 4.5 | 0.085 |
| `p-spider` | TaylorMade Spider Tour | Mallet | ≈$400 | 0.050 | 0.27 | 10 | 0.04 |
| `p-oz1` | LAB Golf OZ.1 | Zero-torque mallet | ≈$600 | 0.046 | 0.18 | 8 | 0.045 |

Characters: **White Hot Pro #1**: a tired blade, small sweet spot · **Newport 2**: the classic, the best feel for pace
· **PLD Anser**: a blade with a touch more forgiveness · **Spider Tour**: the most stable, the widest gate · **OZ.1**:
the face stays square, start lines are the straightest; strictest on rhythm with the mallets.

In a career `state.putter` holds the owned model's id; `PUTTERS` gets these entries added (keep `blade` and `mallet`
for the range and the test round).

---

## Chunks

Sizes: S ≈ an hour of work, M ≈ a session, L ≈ more than one session.

### Chunk 1 — Career shell and save (S) — ✅ built 2026-11-18

As built: `CAREER` (start values, starting bag ids, tier names), `career` / `careerOn` / `clubOpen`, `careerLoad()`,
`careerSave()`, `newCareer()`, `enterCareer()`, `leaveCareer()`, `updateCareerUI()`, `openClubhouse()`,
`closeClubhouse()`, `createCareer()`, `careerToRange()`, `retireCareer()`, `clubhouseGo()`, `clubKey()`; overlay
`#clubhouse` (`.new` form / `.hub`), button `#btnCareer`, key J, `body.career`. `startRound()` leaves the career.
Playing holes (H) inside a career is allowed and uses the career's stats. Match / Shop / Coach say "coming soon".

**Goal:** start a career, see the clubhouse, quit, reload, carry on.

- A **Career** button in the left panel (next to "Test round"). It opens the **clubhouse**: a centred overlay card
  like `#roundIntro`. Top: name, cash, reputation, tier, the four stats. Buttons: **Play a match**, **Pro shop**,
  **Coach**, **Practice range**, **Leave career**. Shop / Coach / Play show "coming soon" for now.
- First open with no save: a new-career screen (3–8 letters, Enter to start). Builds the `career` object above.
- `careerOn` flag and `body.career` class. Entering a career: save the player's own stats and wind (like
  `round.saved`), `setStats(career.stats)`, hide the stat sliders. **Leave career** restores them.
- **Practice range** closes the clubhouse with the career's stats in force. A **Clubhouse** button (and key **J**)
  reopens it.
- `careerSave()` / `careerLoad()` with try/catch; save on every change.
- Test round: if a career is on, the test-round button leaves the career first (or is hidden). The test round must
  still play standard stats.

**Done when:** new career → close → reload the page → Career shows the same name and $150. Stats show 2 on the
range (shorter drives). Leave career → your own stats are back. The test round is unchanged.

### Chunk 2 — Your own bag and the club models (M) — ✅ built 2026-11-18

As built: `BASE_CLUBS`, `CLUB_MODELS` (`add` / `x` / `set` per model, `bias` for used sets), the five putters added to
`PUTTERS` (flagged `model`, kept out of the range's putter list), `modelMods()`, `applyCareerClubs()`, `canUseClub()`,
`bagOrder()` / `usableOrder()` (number keys follow the bag's order in a career), `usableClub()`, `setClub(i, dir)`.
Physics hooks in `computeImpact`: `consist`, `lieBias` (not in the stock / bag numbers, so the player finds it on the
course), `offset`, `groove` (clean lie × `1 − (1 − g) × 0.4`, rough or sand × `g²`, flier chance × `1 + 2(1 − g)`),
`flopX`. `suggestClub`, `suggestChipClub` and the flop switch only pick clubs the career has.

**Tuning (measured, 7 iron at Power 5 vs the Wilson blade):** GI +8 to +13 yds carry, landing 3–4.5° flatter, landing
area ±6–7 yds; in-between +0 to +8, ~1.7° flatter, ±7.6–8.7; blades ±10–11; used sets −2 / +7, 5–6° flatter, ±13.
The game's flight is about twice as sensitive to spin as real data, so the spin cuts are smaller than the research's
1,000–1,500 rpm and launch (`dynLoft`) carries part of the difference. The base driver is already at low spin, so the
low-spin drivers spin ~5% less with a little more ball speed: about the same distance, less forgiving. Drivers measured:
G440 K +2 carry and the narrowest area (±31 yds); Qi4D LS / Triple Diamond level with the Qi4D but ±43–46; used ±48.

**Goal:** the career plays with the clubs you own, and each model plays true to its category (see the club
catalogue).

- Add `CLUB_MODELS` (the catalogue tables: id, name, brand, category, price, the deltas) and the four physics hooks
  (`offset`, `consist`, `groove`, `lieBias`), all neutral when missing.
- Keep `CLUBS` as the base. Add `BASE_CLUBS` (a deep copy made once at start-up) and `applyCareerClubs()`: for every
  owned index, `Object.assign(CLUBS[i], BASE_CLUBS[i], modelMods(model, i))`. This rewrites the clubs **in place**, so
  the dozens of `CLUBS[state.club]` reads need no change. Outside a career (and in the test round) restore every club
  from `BASE_CLUBS`.
- `lieBias` for the worn sets: rolled once per club from `career.seed` (so "your 5 iron pulls" stays true for the whole
  career).
- `stockCache`, `spreadCache` and `shapeCache` must be cleared after any change (their keys don't include the model).
- **A quick check before moving on:** a range-only debug table (or a Node harness over the PHYSICS block) of 7-iron
  carry, total, spin, peak and landing angle for every iron model, against the tuning targets in the catalogue.
- `canUseClub(i)`: owned and not snapped. Every club-change path skips unusable clubs: number keys (toast "Not in your
  bag"), `[ ]` / wheel (skip to the next usable), bag clicks, and `suggestChipClub()`.
- `renderBag()`: in a career, list only owned clubs; snapped ones show struck through with ✕ "snapped". Hide the
  Game Improvement 7 iron. The bag's header shows the iron set's name.
- Starter bag: Driver (`d-xr16`), 3 Hybrid (`h-xr`), 5 / 7 / 9 Iron and Pitching Wedge (`i-ap1`), Sand Wedge
  (`w-sm6`) + putter (`p-wh2`). All used, all from around 2015–16.

**Done when:** in a career the bag shows 7 clubs; keys for missing clubs do nothing; the worn 7 iron goes a few yards
shorter and its minimap landing area is clearly wider than in the test round; the debug table matches the tuning
targets. The test round still has every club at full spec.

### Chunk 3 — The first hustle: match play for a stake (L) — ✅ built 2026-11-18

As built: `MATCH` (fees, min stake, reputation), `NPCS` (tier 1: Dale "Dew Sweeper" Pruitt skill 1.775 / $80, Terry
"Two-Putt" Vance 1.375 / $150, Sal "Sandbag" Moretti 1.075 / $200 (stakes raised in audit 7.3), Gus "Gravel" Haney
0.775 / $250; the skills were re-based in audit 4.1, so they're what each one really averages, with no change in how
the muni plays. Resort: Chad 0.7, Marco 0.65, Rita 0.55, Jim 0.45; country club: Whitaker 0.5, Ana 0.3, Victor 0.2,
Duke 0.0), `matchStatus()`,
`npcHoleScore()` (seed = career seed ^ match no ^ hole), picker `openMatchPicker()` / `renderMatchPicker()` /
`teeOffMatch()` (overlay view `#chMatch`), `startMatch()` (also resumes from `career.match` after a reload),
`matchAfterHole()` (called from `finishHole()`), `settleMatch(kind)`, `confirmForfeit()` (in `leaveHole()` and
`quitRound()`), `matchToClubhouse()`, `openRoundIntro(mode)` + `introStart()` / `introCancel()`. A match is a round with
`round.match`; `body.match`; the scorecard gets the hustler's row and a ▲ ▼ — Match row; no leaderboard. The green fee
is paid on teeing off (cancelling the preview costs nothing). In chunk 3 the stake is capped at cash − fee (credit
comes in chunk 4). The hustlers' skill numbers are first guesses: tune them after play-testing at the starting stats.

**Added (user request, 2026-11-18): the hustler plays on the course, turn by turn, and a tee toss.** `npcPlan(m, i, S)`
lays out strokes that add up to his seeded score (drive, then as far as he can reach, leftovers as short pitches /
chips, the last full shot onto the green at a first-putt distance that fits his putt count, then the putts);
`npcHoleStart()` (from `enterHole()`), `npcTakeTurns(finish, cb)` (from `setupNextShot()`, and from `finishHole()` so
he plays out before the card), `npcPlayStroke()`, `updateNpc(dt)` (orange `npcBall` + `npcTrail`, positions via
`npcWorld()` which handles the green views' frame), `npcCameraPose()` (in `updateCamera()` while `npcTurn`),
`npcHurry()` (Space / Enter / R / click), `matchHonor()` (toss on hole 1, then the last hole someone won), and the tee
toss overlay `#teeToss` (`openToss()` / `closeToss()`, result saved in `career.match.toss`). Turn order: honour on
the tee, then whoever is farther from the pin. Trees are cleared round his ball while he plays.

**Goal:** the first full loop. Pick a hustler, set the stake, play 9 holes against them, win or lose money.

- **NPC roster** (`NPCS`), tier 1 to start, 4 characters. Each: `id`, name, nickname, `tier`, `skill` (average
  strokes over par per hole, e.g. 0.9 for a weak hustler, 0.35 for a good one), `spread` (0.7–1.1), `maxStake`,
  `style` (likes skins / presses / big bets, for later chunks), three or four lines of trash talk (win, lose, press,
  can't pay).
- **Play a match** in the clubhouse: pick an NPC (shows their tier, rough skill as a description, not a number), the
  format (match play only in this chunk), the stake (slider, capped by your credit and their `maxStake`). Pay the
  green fee. Then the course preview (`openRoundIntro()`), then the round.
- Reuse the round flow. Add `round.match` (the `career.match` object). In `finishHole()`, if there is a match:
  roll the NPC's score for that hole (below), store it, update the match and show it on the scorecard (a third row,
  "Gus", and a "Match" row: ▲ won, ▼ lost, — halved, plus "2 UP" / "1 DN" / "AS").
- **NPC score per hole:** `par + clamp(round(skill + spread × gauss()), -2, +4)`, plus difficulty from the
  conditions (`+0.1` per Stimp above 11.5, `+windMph / 40`). Seed the random numbers with `career.seed`, the match
  number and the hole, so it is fixed in advance and a reload gives the same result.
- **Match play:** fewer strokes wins the hole. The match ends as soon as it is decided (e.g. "won 4 & 3"). Offer
  "play the remaining holes for practice" (no money). A tie after 9 is a push: nobody pays.
- **Settlement:** a results card. Win: `cash += stake`, rep up. Loss: `cash -= stake`, rep down. Save after every hole
  (`career.match`) and on settlement. Leaving mid-match = forfeit (default): confirm first.
- Conditions: tier 1 uses the holes' own wind and Stimp (`applyRoundConditions()`).

**Done when:** you can play a full 9-hole match against an NPC, see their hole scores appear as you hole out, see the
match status, and the cash changes by the stake at the end. Reloading mid-match resumes on the next hole with the same
NPC scores. Quitting mid-match costs the stake.

### Chunk 4 — Betting beyond your bankroll and the loan-shark rule (S) — ✅ built 2026-11-18

As built: `MATCH.credit` (`base` 100 + `perRep` 2 × reputation) and `creditLine()`; the picker's stake goes up to
`min(hustler's max, cash − fee + credit)` with the credit part in red (`updateStakeLabel()`, row `#cmCredit`);
`settleMatch()` applies the rule on a loss or forfeit you can't cover (cash to $0, the rest wiped, reputation −10 in
all, `snapRandomClub()`, `career.history` records `unpaid` and the club); `showBeating()` / `closeBeating()` /
`beatKey()` (overlay `#beating`: WHACK! → POW! → CRACK!, the hustler's `cantPay` line). `confirmForfeit()` warns when
the stake is partly on credit. **Added rule (mine):** a broke player works off the green fee by raking bunkers
(`m.feeWorked`), so a career can't get stuck at $0; the stake is then all credit. Snapped clubs can't be repaired
until the pro shop (chunk 5).

**Goal:** the high-roller risk.

- The stake slider goes above your cash, up to the credit line (`cash + 100 + 2 × rep`), with the part you can't cover
  shown in red ("$120 on credit").
- Settlement when you lose more than you have: cash goes to $0, the rest is wiped (default), rep −10, and the
  **beating**: a full-screen comic-style card (shake, "WHACK", the NPC's line), then "He snapped your **5 Iron**".
  Pick a random usable club that isn't the putter; add it to `career.snapped`.
- If every club except the putter is gone, the clubhouse warns you before you can bet again.

**Done when:** losing a bet you can't cover leaves you at $0 with one club snapped, shown struck through in the bag
and unusable on the course until rebought (chunk 5).

### Chunk 5 — Pro shop (M) — ✅ built 2026-11-18

As built: `SHOP` (slots per kind, the club each kind is tested with, bag max 14, minimum repair prices, putter prices
and notes), fairway / hybrid models generated from each new driver line at half strength (`f-*`, ~55% of the driver's
price), `shopStats(id)` (stock swing at standard stats: carry, landing angle, a forgiveness score from sweet / gear /
consist, a shaping score from work / floor), `shopBar()` (normalised within the kind), `openShop()` / `renderShop()`
(tabs Irons, Drivers, Woods & hybrids, Wedges, Putters, Your bag; repairs listed first), `shopBuy()`, `repairPrice()`,
`shopClick()`, demos (`demo`, `startDemo()`, `startPutterDemo()`, `clearDemo()`; cleared on opening the clubhouse,
entering a hole or leaving the career). Save additions: `career.out` (indices in the locker), `career.putters`
(owned putters); `careerLoad()` fills them in for older saves. `canUseClub()` / `bagOrder()` respect the locker and the
demo. One model per club slot: buying a different model for a slot replaces it (no trade-in). New clubs that don't
fit in 14 go to the locker. The used starter models are "Not for sale". Shown as four bars (Distance, Stopping,
Forgiveness, Shaping) plus a bias tag, not a fifth bar.

**Goal:** spend the winnings on clubs.

- Shop card from the clubhouse with tabs: **Irons** (by category: Used, Game improvement, In-between, Blades),
  **Woods**, **Wedges**, **Putters**. Each model: brand, name, price, its one-line character, and five bars worked out
  from the physics (not typed in): **Distance** (7-iron carry), **Stopping** (landing angle and spin), **Forgiveness**
  (`sweet`, `gear`, `consist`), **Shaping** (`work`, `floor`), **Straightness bias** (`offset`, `lieBias`). Owned
  models marked.
- **Try before you buy:** on the range, any shop model can be hit for free (the bag's header says "Demo").
- Buying an iron set replaces the old one (no trade-in to start with). **Repair** a snapped iron at set ÷ 7 × 1.25; a
  snapped wood or wedge at its own price.
- **Bag loadout:** 14 clubs max, putter included. Owned clubs beyond 14 sit in a locker; swap them in and out in the
  shop. (Buying a set gives 4i–PW: 7 clubs.)

**Done when:** switching from the used set to a GI set clearly tightens the minimap landing area and ends the fliers;
a GI 7 iron carries about 10–14 yards more than the blade's and lands flatter; a blade set widens the landing area on
mishits but curves the most; repairing a snapped club makes it
usable; the bag never holds more than 14.

### Chunk 6 — Coach: lessons and unlocks (M) — ✅ built 2026-11-18

As built: `COACH` (lesson price `lessonPerLevel` 60 × level², max 10, hand-tweak limit ±2°, the six unlocks with
prices and one-line descriptions), `shotLocked(k)` (only in a career, only for the six keys), `lockedToast()`,
`enforceUnlocks()` (on entering a career: drops a draw / fade, Low 2 / High 2, spin and the High Soft / Flop chip if
not learned), `updateLockUI()` (`.locked` padlocks on the telemetry pills), `openCoach()` / `renderCoach()` /
`coachClick()` (overlay view `#chCoach`). Gates in `applyShot()`, the F handler (cycles only learned shapes),
`setHeight()`, `setSpinCtl()`, `applyChipType()`, and the Q / E / Z / C tweaks (not in chip mode, where the presets set
the face). The caddie tips' Shaping and Chip shots pages list what's still to learn.

**Goal:** raise stats and learn shots.

- Coach card: each stat with its level, the next lesson's price and a one-line effect (no numbers given away: "longer
  shots", "steadier under pressure"...). Buying a lesson: +1, save, `setStats(career.stats)`.
- Shot unlocks, locked at the start of a career:

  | Unlock | Gates |
  |---|---|
  | Draw / Fade | the F presets (`applyShot`) for that shape |
  | Stinger | height Low 2 (`setHeight(-2)`) |
  | High | height High 2 and chip type 3 High Soft |
  | Flop | chip type 4 Flop |
  | Spin control | B (More / Less spin) |

  Locked options show a padlock in the telemetry card and a toast ("Learn the draw from the coach"). Manual face /
  stance tweaks (Q/E, Z/C) are clamped to ±2° until Draw / Fade are learned, so the presets can't be rebuilt by hand.
  The mouse swing line still bends the ball (that is skill, not a lesson).
- Update the caddie tips to mark locked options.

**Done when:** a new career can't pick Draw, Low 2, High 2, Flop or More spin; after buying the lesson it can, and it
stays unlocked after a reload.

### Chunk 7 — Skins and presses (M) — ✅ built 2026-11-18

As built: `career.match.format` `'match' | 'skins'` (picker: Format buttons or F; a skin is capped at
min(hustler's max ÷ 3, room ÷ 4), minimum $5), `m.presses` `[{ from, by, stake }]`. `matchStatus(m, from)` now takes
a starting hole; `matchBets()`, `betFinal()` (a bet as it stood on the hole it was decided), `betResult()`,
`skinsState()`, `matchNet(m, forfeit)`, `matchOver()`, `matchLine()`, `lastLiveBet()`, `canPress()`, `playerPress()`
(the scorecard's Press button `#scPress`, or P). Hustlers press automatically when 2 down in the latest bet, with a
seeded chance from their `press` (Dale 1, Terry 0, Sal 0.6, Gus 1) and their `press` / `pressed` lines. **Settlement
changed:** all bets (or the skins) now settle together once every bet is decided (match play) or after hole 9 (skins),
so one loan-shark check covers the total. A forfeit loses every bet still in play; in skins it also hands over the
carried pot and a skin for every hole left. Reputation goes by the net result.

**Goal:** the other two bet types.

- **Skins:** a stake per hole. Win the hole outright and you take the skin plus any carried over; a halved hole carries
  the skin to the next one. Unclaimed skins after hole 9 are void. Running total on the scorecard.
- **Presses** (match play): when a side is 2 down, it may press, which starts a new bet of the same stake on the
  remaining holes. The player presses with a button on the scorecard between holes (and **P** there). NPCs press by
  their `style` (an aggressive one always does at 2 down). Each press is its own line on the results card.
- Credit and the loan-shark rule apply to the total owed.

**Done when:** a skins game pays per hole with carry-overs, and a pressed match settles the original bet and each press
separately.

### Chunk 8 — Tiers, reputation and tougher courses (L) — ✅ built 2026-11-18

As built: `TIERS` (course name, `stimpAdd`, `windMult`, `mirror`, `obMult`, `treeMult`, rep, entry, description — the
table below), `variantDef(def, v)` (mirrors the centre line, green, pin, bunkers, hardpan, green slopes and tiers,
wind direction and the "left / right" in the description; scales Stimp, wind, OB and the tree count), `courseV` and
`setCourse(tier)` (set at tee off and on resume, cleared when the round ends or the preview is cancelled; clears
`holeGeomCache`). `buildHole()`, `holeGeom()`, the course preview, the scorecard's wind row and `npcHoleScore()` all
read the variant. Eight new hustlers (tier 2: Chad, Marco, Rita, Jim; tier 3: Whitaker, Ana, Duke, Victor — skill
0.55 → 0.0, max stakes $300 → $5,000). Clubhouse: three circuit tiles (`renderTiers()`, `tierReqs()`, `tierClick()`),
`career.tierMax` (tier 2 opens by itself at 40 reputation; tier 3 needs 120, in-between or blade irons, a non-used
driver and a $500 membership, then "Join"). You choose which open circuit to hustle on; it can't change mid-match.

**Goal:** move up circuits.

- The clubhouse shows the three tiers; locked ones show what they need (rep, entry fee, gear).
- Until new courses exist, each tier plays the same 9 holes with **its own conditions** and **its own NPCs**:

  | Tier | Course | Greens | Wind | Other |
  |---|---|---|---|---|
  | 1 | "Muni" | Stimp −1 | ×0.7 | — |
  | 2 | "Resort" (holes **mirrored** left↔right) | Stimp +1 | ×1.0 | trees thicker |
  | 3 | "Country Club" | Stimp +2.5 | ×1.3 | OB tighter by 20% |

  Mirroring: negate every x in a hole's layout (centre line, green, bunkers, trees, pin). Check `buildHole` and
  `holeGeom` for anything else that is left/right (dogleg text, wind direction `from` → `-from`).
- Four NPCs per tier, stronger and richer higher up (tier 3 `skill` 0.0–0.25, `maxStake` in the thousands).

**Done when:** reaching rep 40 opens tier 2 with faster greens and a mirrored course; tier 3 needs the rep, the fee and
the gear.

### Later chunks (not planned in detail yet)

- **9 · Overworld hub:** a small walkable clubhouse area (the third-person golfer walks between doors: shop, coach,
  first tee, practice range). Replaces the menu buttons with places.
- **10 · New course layouts** for tiers 2 and 3 instead of mirrored holes.
- ~~**11 · NPCs on the course:** a second golfer model that "plays" its scored shots (animated, no physics needed).~~
  Built: the hustler plays his shots on the course during a match.
- **12 · Story beats:** sandbaggers who lie about their skill, rivals, a season finale.

---

## Pitfalls

- **Physics stays pure.** Grades change club objects outside the PHYSICS block; `computeImpact` never reads the career.
- **Caches:** `stockCache`, `shapeCache`, `spreadCache` key on club index, not on the club's numbers. Clear them when
  the models change.
- **Shaping with GI irons:** `solveShape()` clamps face-to-path to 1–9°. With a low-`work` club it may hit the clamp
  and curve less than the 5% target. That is intended (GI irons are hard to shape); the toast should say so ("the
  Qi Max doesn't want to fade").
- **Club indices are shared** by keys, the bag, saves and the test round. Never reorder or remove `CLUBS`; gate usage
  with `canUseClub(i)` instead.
- **Test round and leaderboard:** must stay standard stats and full-spec clubs. Restore everything on leaving a career
  and when starting a test round.
- **Reload exploits:** NPC scores come from the seed; the match is saved after every hole; leaving mid-match forfeits.
- **Modal keys:** every new overlay (clubhouse, shop, coach, results, beating) needs its place in the keydown intercept
  chain, or game keys will fire behind it.
- **Stats at 2** make the game hard. Play-test chunk 1 and 3 at the starting stats and tune `CAREER` before chunk 6.

---

## Caddies (end game) — ✅ built 2026-11-19 (user request)

A money sink for late careers. The caddie shack (a sign in the lobby, its own illustrated room) lists five caddies, each
with a one-time **hire** fee and a **loop** fee paid every hustler match with the green fee (can't pay it: the caddie
sits that match out). One at a time; hiring another replaces yours, no refunds; "Let go" is free.

| Caddie | Needs | Hire | Loop | Effect |
|---|---|---|---|---|
| Scooter Briggs | — | $750 | $15 | +1 Perception |
| "Lefty" Doyle | rep 40 | $3,000 | $40 | +1 Composure, +1 Perception |
| Marisol Vega | Resorts, rep 80 | $8,000 | $90 | +1 Composure, +2 Perception, walks off one level of tilt each hole |
| "Big Walt" Okafor | Country clubs, rep 120 | $15,000 | $150 | +3 Composure, +1 Perception, every hole starts with no tilt |
| Eleanor Finch | Country clubs, rep 200 | $40,000 | $400 | **+2 Dexterity**, +3 Composure, +3 Perception, every hole starts with no tilt |
| "Dutch" Van Rijn | Country clubs, rep 200 | $40,000 | $400 | **+2 Power**, +3 Composure, +3 Perception, every hole starts with no tilt |

The top two (user request, 2026-11-19) cost the same and differ only in Power vs Dexterity: a pick-one trade-off.`nCode: `CADDIES`, `caddieBonus(c)`, `career.caddie`, `caddieOf()`, `caddieOn()`, `careerStats()` (the career's stats plus the caddie's,
never past 10 — Perception's formulas break above 10), `caddieWalkOff(streak)` (in `nextRoundHole()`), the loop fee in
`startMatch()` (`m.caddieFee` / `m.noCaddie`), `openCaddies()` / `renderCaddies()` / `caddieClick()`. The character
sheet shows the caddie's help as green pips. Friend rounds use the caddie without a loop fee.

## Trophy room (end game) — ✅ built 2026-11-19 (user request)

A second money sink with nothing to gain but bragging rights. A sign in the lobby opens the trophy room: two lit glass
cases where each piece bought sits in its own place (so the room fills up), and a top shelf of trophies that are
**earned** (worked out from the career, nothing stored): first hustle won, resort card, country-club member, friendly
fire (beat a friend), the big score ($1,000+ in one match), single figures, scratch golfer.

For sale (`TROPHIES`, `career.trophies` = ids; prices halved in audit 7.4): Gus Haney's betting ledger $1,250 · gutta-percha ball $2,000 ·
hickory mashie $3,750 · persimmon driver $6,000 · long-nose putter $9,000 · featherie ball $15,000 · signed 18th
flag $22,500 · silver claret jug (replica) $37,500 · champion's tartan blazer $50,000 · the golden putter $75,000
(all ten: $222,000; it was $444,000). No selling back.

Bragging: `collectionOf(ids)` → pieces and value, shown on the character sheet, the home card, the profile list on the
sign-in screen and the Friends list (`api/profile.js` `roster` / `players` return each career's `trophies`).
Code: `trophyArt(kind, x, y, s)` draws every piece and cup (also the panel's thumbnails), `chScene('trophy')`,
`openTrophies()` / `renderTrophies()` / `trophyClick()`.

## Invitationals (end game) — ✅ built 2026-11-19 (user request)

9-hole stroke play against a field of all twelve hustlers, on the event's circuit (the first tee: "Play a match" →
🏆 Invitationals). Entry fee paid when you tee off; a purse for the top three; reputation for the top three; a win
puts the event's trophy on the trophy room's earned shelf (`career.titles`).

| Event | Needs | Entry | Purse (1st / 2nd / 3rd) | Field form |
|---|---|---|---|---|
| The Rolling Pines Muni Open | rep 20 | $250 | $1,500 / $700 / $400 | 0 |
| The Palm Crest Pro-Am | Resorts, rep 80 | $1,500 | $9,000 / $4,000 / $2,000 | −0.05 |
| The Hawthorne Members' Invitational | Country clubs, rep 150 | $7,500 | $30,000 / $12,000 / $6,000 (was $50,000 / $20,000 / $10,000: audit 7.2) | −0.1 |
| The Hustlers' Classic | Country clubs, rep 250 | $25,000 | $150,000 / $60,000 / $30,000 | −0.2 |

Each event is held once every `TOUR_GAP` (5) hustler matches: after you play in one (or withdraw), the board says "Next
one in N matches" until you've played five matches to the end (forfeits don't count). Audit 7.2: it could be re-entered
straight away, and an entry paid many times what the best match does.

The field's scores: `fieldHoleScore()` = the hustler's own per-hole formula (seeded by the entry, so a reload can't
change it) plus the event's form (strokes per hole; negative = sharper). `tourStandings()` (cached): totals, ties by
the last three holes, then the last hole; you take a dead heat. The leaderboard shows in the scorecard after every hole
and the position in the top bar. Leaving part-way (H / Withdraw) forfeits the entry; a reload resumes it
(`career.tour`). One round at a time with matches and friend rounds. Code: `TOURS`, `openTours()` / `renderTours()` /
`toursClick()`, `startTour()`, `tourAfterHole()`, `settleTour()`, `confirmWithdraw()`, `tourToClubhouse()`.

### Rivalry trophies and visiting (user request, 2026-11-19) — ✅ built

Made from challenges against friends (`career.history` entries with `friend`): a **plaque per friend** with your record
(won–lost–halved, money) and a **victory trophy for every challenge won** ("Beat Ben · 3 & 2 · Match play · $50").
All are on the trophy room's new **rivalry wall** (under the cases) unless hidden: the trophy room lists them, each with
a show / hide switch (`career.showcase.hide` = keys `r-<friend>` / `w-<challenge>`). Friends has a **🏆 Trophy room**
button on every player: it opens their room read-only (`api/profile.js` `showcase` returns their pieces, titles,
circuit, recent rounds and the history lines the earned trophies need, plus their show / hide choices; no cash, no bag).
Code: `rivalItems()`, `shownRivals()`, `plaqueArt()`, `trophyView` (the visited player), `visitTrophies()`.

### Framed scorecards and buying pieces off a wall (user request, 2026-11-19) — ✅ built

Every challenge you won can also hang as a **framed scorecard** (the shared final card; off until you frame it:
`career.showcase.cards` = challenge ids). Anyone visiting your trophy room can view it full size, and can **buy and
destroy** any victory trophy or framed scorecard on your wall: they pay **you** twice what that win paid (at least $50),
and it's gone for good (`career.showcase.destroyed`). Rivalry plaques (your record) can't be bought. The server does the
transfer (`api/profile.js` `buyshow`: the buyer's career pays, then the owner's career is paid and the piece destroyed,
both compare-and-set; refunded if someone else got there first) and writes a history line on both sides
(`{ sale: 'bought' | 'sold', key, other, net }`, which don't count as challenges). `showcase` returns the framed cards.
`mergeServer()` keeps a piece destroyed even if this PC hadn't heard yet. Direction note: the user said "from the
winners to the losers"; built as the buyer paying the owner (the natural "buy it from them") — flip if asked.

## Luxury clubs (end game) — ✅ built 2026-11-19 (user request)

The user asked for "really high-end clubs, something really extravagant": a money sink, and a way to show off what's in
your bag. A **Luxury** section at the bottom of every pro-shop tab (`lux: true` on the model, gold card with a sheen,
a confirm before buying anything over $5,000):

| Kind | Model | Price (halved in audit 7.4) | Plays like |
|---|---|---|---|
| Irons (set) | Majesty Prestigio (gold) | $20,000 | Apex Ai200 |
| Irons (set) | Honma Beres 5-Star | $30,000 | a game-improvement set (between Qi Max and Hot Metal) |
| Irons (set) | Hawthorne Atelier Sovereign platinum | $125,000 | between ZXi7 and 620 CB |
| Driver | Majesty Prestigio (gold) | $6,000 | forgiving, high launch |
| Driver | Honma Beres 5-Star | $9,000 | about G440 K, slight draw |
| Driver | Hawthorne Atelier Crown Jewel | $60,000 | Qi4D |
| Woods | the three drivers' fairway / hybrid versions | 55% of the driver | (generated as usual) |
| Wedge | Hawthorne Atelier Rose Gold | $4,000 each | Opus |
| Wedge | Hawthorne Atelier Damascus | $7,500 each | Vokey SM11 |
| Putter | Scotty Cameron Circle T tour putter | $12,500 | Newport 2 |
| Putter | Hawthorne Atelier platinum mallet | $45,000 | between Spider and OZ.1 |

**They are never better than the best ordinary club**: the money buys the look, not strokes (so friends' challenges stay
fair). Hawthorne Atelier is made up (the country club's own clubmaker); the Majesty, Honma and Scotty Cameron names are
real luxury lines, and their prices here are the game's. Repairs on a luxury club cost a quarter of the usual formula.

Showing off: ✦ and gold names in the range bag list and the bag room (a "✦ n luxury pieces" tile, and the price on each
model); the golf bag in the trophy room and locker room turns cream and gold with one luxury piece and all gold with
three, with gold heads and sparkles (friends see it when they visit); and at the first tee the hustler eyes your bag
(a line per tier). Code: `isLux`, `luxCount`, `bagLook`, `sparkles`, `luxBuyConfirm`, `LUX_CAT`.

## The payoff screen and the scorecard history — ✅ built 2026-11-19 (user request)

**The payoff screen.** When a hustler match or an invitational is settled (not a forfeit or a withdrawal), a screen
comes up over the final scorecard: "You took his money" / "He took your money" / "Cleaned out" / "All square", or
"Champion!" / "2nd place" / "Out of the money"; the hustler (or the trophy) with his parting line; the money counting up;
a line per bet (or the skins, or prize and entry fee); cash before → after; reputation; coins raining on a win. Buttons:
see the scorecard (K), play on for practice (N, a match decided early), back to the clubhouse (Enter). Shown once
(`outcome.shown`, saved on the match / entry); after the loan shark's beating when there is one.
Code: `settleMatch` / `settleTour` record `outcome`; `maybeShowOutcome`, `showOutcome`, `closeOutcome`, `outcomeKey`.

**The scorecard history.** Every career round's card (matches, invitationals, friend challenges) is archived in
`career.cards` (the last 100), rewritten after every hole so an early finish or a forfeit keeps its card; synced with
the career (merged by id, the fuller copy wins). The trophy room has two tabs: Trophies and **Scorecards (n)**: a
summary (cards, won–lost for money, net, best 9), then every card newest first, by month, with the result and the money;
**View card** redraws it on the paper scorecard, read-only. Results from before cards were kept are listed as lines.
Visitors don't see your history. Code: `archiveRound`, `cardAsMatch`, `renderCardHistory`, `showArchivedCard`; the
scorecard's rows are built by `cardRows` and `matchRowsHTML`, shared by the live card and the archive.
