# How-to-play tutorial: plan

A handoff plan. It is written so that someone with none of the conversation can build it.
Line numbers are from 2026-11-21 and will drift: search for the names.

## Status: built (2026-11-21), T1 to T5

The user asked for it "front and center" on the home screen, so the block sits in a middle column between the
career side and the arcade (`.hm-mid` / `#hmLearn`), shown signed out and signed in. In the same request: the career
side shows your golfer's stats with the arcade's golfer drawing (`renderCareerStats`, `golferSvg`).

What was built, and where it differs from the plan below:
- **Viewer:** `#tut`, `TUTORIAL`, `openTut` / `renderTut` / `tutKey` / `tutTry` in `index.html`, after the caddie tips.
  Pair slides widen the box to 1280 px. Keys: 1-3, → / Enter / Space, ← / Backspace, Home (all lessons), Esc.
- **Slides:** full swing 10, chipping 9, putting 7, wording as in section 4 with small corrections found while
  staging (each matches what the stage's shot did: see the capture notes).
- **Pictures:** 30 WebP files in `tutorial/`, about 1.2 MB in all. Taken at a **1600 × 900** window (the game's
  panels are fixed in px, so a bigger window shows more of the course) and saved 1280 wide.
  `node tools/tutorial/capture.js [ids or prefixes]` with the dev server running; scenes in
  `tools/tutorial/stages.js`. A stage that computes marks (where a ball stopped, the launch monitor's cells) prints
  them: paste them into the slide's `marks`.
- **One test-only export** added to `window.__golf`: `toScreen(x, y, z)`, a world point's screen spot (for crops and
  marks). It changes nothing in play.
- **Draw and fade** are shown with the driver (2° in-to-out, 2.5° out-to-in) from the "from where you stand" camera:
  a 7 iron's curve barely shows from there. The game scatters every swing a little (Dexterity 8), so the stage retries
  until the ball curves the way the slide says by at least 8 yds.
- **Side spin on a chip** (the user's example): three chips from one spot, cut / straight / hook, from above, with
  where each stopped marked. **Spin back** is a 61-yd lob wedge pitch, High + More spin: the launch monitor's carry
  (61) and total (57) marked. No game mechanics were changed for any picture (section 1).
- **Test:** `tools/test/tutorial.js` (every slide's pictures load, marks on their pictures, at most three lines, the
  keys, Done, Esc, Try it signed out and as a guest, the caddie tips' button).

## 1. What the user asked for

> "plan how to make a how-to tutorial … one for how to putt, how to chip, and how to swing an iron,
> driver, whatever you'd categorize that one as. And look at our current caddy tips. I think that's a
> good starting point because I want to use visuals. These will be like screenshots from the game. We
> need to teach people how to swing the club, how to hit a draw or fade manually, how chipping and
> putting works. I want them to be three distinct categories so they can just click on one of them at
> a time, and go through a number of slides with pictures, and it will give them a quick understanding
> of how the game works."

### Decided by the user

- Three separate categories, opened one at a time: **putting**, **chipping**, and the **full swing**
  (driver, woods, irons).
- Each is a short run of **slides with pictures**. The pictures are **screenshots from the game**.
- The caddie tips are the starting point for the content.
- It must teach: how to swing, how to hit a **draw or fade by hand**, how chipping works, how putting
  works.
- The aim is a **quick** understanding, not a manual.
- (Added 2026-11-21.) The pictures should show **cause and effect**: what you did, then what the ball
  did. The user's examples: "a manual draw spin on a chip and then showing the resulting tracer line
  and rollout", and "how to put backspin on a chip so it rolls backwards. Etc." See section 3.5.
- (Decided 2026-11-21, after the measurements in 3.5.) **No changes to the game's spin mechanics.**
  "This is just trying to get an accurate how-to-play tutorial." Keep the slide showing that a draw or
  fade swing by hand puts side spin on a chip and changes its roll-out. Backspin that rolls the ball
  back belongs to a high pitch shot only, as the game plays today: show it there, not on a chip.
- **The tutorial must be accurate to the game as it is.** Where the wording and the game disagree, the
  wording changes, never the game.

### My defaults (the user has not ruled on these; change them freely)

| # | Default | Why |
|---|---------|-----|
| D1 | The entry point is the **home screen**, shown signed out and signed in | A new player sees it before anything else |
| D2 | The caddie tips stay as they are; the tutorial is a separate, shorter thing that links to them | The tips are live and situational ("this shot: Shape × Lie"); the tutorial is fixed and visual |
| D3 | 7 to 10 slides per category, each one picture (or a did-this / got-that pair), a title and at most three short lines | "Quick understanding" |
| D4 | Numbered callouts are drawn by the page over the screenshot, not painted into the image | Wording can change without re-shooting; text stays sharp |
| D5 | Screenshots are taken by a script, not by hand | The UI changes often; one command re-shoots them all |
| D6 | Screenshots show the **arcade** set-up (stats all 8, the arcade bag) | It is what a new player gets from the home screen's Range / Chipping / Putting tiles |
| D7 | Images are WebP, 1280 × 720 or a crop of it, in a new `tutorial/` folder at the repo root | See section 3.4 |
| D8 | The last slide of each category has a "Try it" button that opens the matching practice area | Read, then do |
| D9 | It never opens by itself. The home block carries a NEW tag until one category has been opened | Not in the way of returning players |

## 2. What exists now

Everything is in `index.html` (one Three.js module) plus `api/` on Vercel.

### 2.1 The caddie tips (the content source)

- `tipsHTML()` (about line 11594) returns an array of pages. `sec(title, sub, items, tone, extra)`
  builds one page: a heading, a bullet list, and an optional diagram.
- There are three sets, picked by mode: putting (`isPutt()`), chipping (`isChip()`), and the full swing
  (everything else). Page titles today:
  - **Putting:** How to putt · Reading the green · The putting card · Putters & green speed · Tilt on
    the green.
  - **Chipping:** How to chip · Chip shots · Views & the read · Your lie.
  - **Full swing:** How to swing · The swing card · Reading the strike · Shaping the shot · Wind ·
    Your lie · Tilt · Difficulty · Hazards.
- Diagrams drawn in SVG / HTML, reusable in slides where a diagram beats a screenshot:
  `tipsGuideSvg(mode)` (the swing guide, with `'chip'` and `'putt'` variants), `tipsChipSvg(cur)` (the
  four chip shots side-on), `tipsSwingCard()`, `tipsPuttCard(putter)`, `tipsStrikeCard(club)`,
  `tipsTiltLadder()`, `tipsFaces(club)`.
- The window: `#tipsCard` (a `.card`, 520 px wide, `z-index: 6`), shown by `body.tips`. State:
  `tipsOn`, `tipsPage`, `tipsCount`. `setTips(on)`, `tipsGo(d)`, `tipsKey(e)`, `updateTips()`.
- The tips are **not available on the home screen or the driving range**: `tipsAvail()` is
  `hp.on || isPutt() || isChip()`. The button is `#btnTips` (key I).
- A "seen" flag per set lives in `localStorage` (`golfTipsSeen_chip`, `golfTipsSeen_putt`) and drives a
  pulsing NEW tag (`body.tipsNew`).

### 2.2 The home screen

- `#home` (about line 6718), `z-index: 6`, shown by `body.home-on`. `openHome()`, `closeHome()`,
  `renderHome()`, `homeKey(e)`, `homeOpen`.
- Left column `.hm-side`: the brand, then `#hmWho` (signed out: pick a profile, or guest) **or**
  `#hmMenu` (signed in: the Career tile). The left column has spare room below these.
- Right column `#hmArcade`: the arcade courses, Play, the practice tiles
  (`#hmArcPrac [data-h=range|chip|putt]`), the Top 10. It already scrolls at 900 px tall: add nothing
  there.
- `homeGo(what)` opens Range / Chipping / Putting with the arcade set-up (`arcadePractice`).
  `homeSigned()` is true once a profile or guest is picked; the practice tiles refuse before that.

### 2.3 Keys

One `keydown` listener (about line 17313) hands the event to the first open overlay, in this order:
`homeOpen` → `beatOpen` → `outOpen` → `lbEntry.active` → `introOpen` → `clubOpen` → `dropOpen` →
`tipsOn` → `tossOpen` → the game. **The tutorial opens over the home screen, so its check must come
before `homeOpen`.**

### 2.4 Hosting limits that matter

- `.vercelignore` drops `tools/` and `*.md` from the live site. **Images must not live under
  `tools/`.**
- `vercel.json` sets a CSP with `img-src 'self' data: blob:`. Images served from the site's own
  folder are allowed; an outside image host is not.
- The repo is public. Screenshots must show no real profile names (use a guest).

### 2.5 The screenshot tool

- `tools/test/probe.js` starts headless Chrome, loads a URL, runs a script in the page, and saves
  **one** PNG of the whole window to `tools/test/out/` (git-ignored). Window size comes from
  `PROBE_SIZE` (default 1600x900). It uses the Chrome DevTools Protocol directly
  (`Page.captureScreenshot`).
- `tools/test/devserver.js 8090` serves the game locally with a fake database. **Never point any tool
  at the live site.**
- `window.__golf` (about line 18590) exposes internals for tests. Useful here: `state`, `setMode`,
  `selectHole`, `enterHole`, `hp`, `setupNextShot`, `debugSwing({ back, tempo, angle, wobble, miss })`,
  `beginSwing(true)`, `swingSample(dx, dy, t)`, `endSwing`, `CLUBS`. Check the export list before
  relying on a name, and add what is missing (the list is for tools only).
- Staging examples to copy from: `tools/test/green-read.js` (put the ball at a spot on a hole:
  `g.hp.ball = {x, z}; g.setupNextShot()`), `tools/test/swing-fix10.js` (scripted swings),
  `tools/test/ui-shots.js` (one screen per run).

## 3. The design

### 3.1 The viewer

A new overlay, `#tutCard`, separate from `#tipsCard`.

- **Size:** `width: min(940px, calc(100vw - 32px))`, `max-height: calc(100vh - 32px)`, scrolls inside
  if it must. `z-index` above `#home` (7 or more). A dark backdrop behind it.
- **Two screens:**
  1. **Chooser:** three large tiles, "⛳ The full swing · driver, woods and irons", "🪃 Chipping",
     "🕳️ Putting", each with its slide count and a ✓ once finished. Keys 1 / 2 / 3.
  2. **Slides:** the picture on top in a fixed 16:9 box, then the title and up to three lines, then
     Back · dots · Next, the same footer as the tips window. "Next" on the last slide reads "Done ✓".
     A "‹ All lessons" link goes back to the chooser.
- **Keys:** → / Enter / Space next, ← / Backspace back, Esc closes (back to wherever it was opened
  from). Handle them in a `tutKey(e)` called first in the `keydown` listener, and `preventDefault`
  them so nothing reaches `homeKey` or the game.
- **State:** `tutOpen`, `tutCat` (`null` = chooser), `tutPage`. Body class `tut`.
- **Callouts:** each slide may list marks as `[x%, y%]`. Draw each as a numbered disc over the picture
  (reuse the `.tnum` look from the tips), numbered to match the lines below. Positions are in percent
  so they hold at any size.
- **Pictures:** an `<img>` with `width` / `height` set and `decoding="async"`. Preload the next slide's
  image when a slide is shown. On `error`, show a plain panel with the slide's title, so the viewer
  works before the screenshots exist.
- **Diagram slides:** a slide may give `svg: () => tipsChipSvg('stock')` in place of an image.

### 3.2 The data

One constant in `index.html`:

```js
const TUTORIAL = {
  swing: { name: 'The full swing', sub: 'driver, woods and irons', icon: '⛳', go: 'range', slides: [
    { img: 'swing-01', t: 'Look, aim, pick a club', pts: ['…', '…'], marks: [[50, 40], [88, 30]] },
    …
  ] },
  chip: { name: 'Chipping', icon: '🪃', go: 'chip', slides: [ … ] },
  putt: { name: 'Putting',  icon: '🕳️', go: 'putt', slides: [ … ] },
};
```

`img: 'swing-01'` loads `tutorial/swing-01.webp`. A pair is `img: ['chip-08a', 'chip-08b']` (3.5).
`go` is what "Try it" passes to `homeGo`.

### 3.3 Where it opens from

1. **Home screen (D1).** A block at the bottom of `.hm-side`, outside `#hmWho` and `#hmMenu` so both
   states show it: a heading "📖 How to play" and three buttons that open their category directly.
   NEW tag until `localStorage.golfTutSeen` is set (D9).
2. **The tips window.** A small "📖 How-to slides" button in `#tipsCard`'s header that opens the
   category matching `tipsKind()` (`'putt'`, `'chip'`, otherwise `swing`).
3. **"Try it" on the last slide (D8).** If `homeSigned()`: close the tutorial and the home screen and
   call `homeGo(cat.go)`. If not: close the tutorial and show "Pick who's playing, or play as a guest"
   in `#hmErr`.

Do not open it mid-round from anywhere else: `openHome()` already refuses during a round.

### 3.4 The pictures

- **Folder:** `tutorial/` at the repo root (deployed; see 2.4). Names `swing-01.webp` … `putt-07.webp`.
- **Format:** WebP, quality about 82, taken at a 1280 × 720 window (`deviceScaleFactor: 1`). A full
  frame should land near 60–120 KB. Budget: about 31 images (26 slides, five of them pairs), under
  4 MB in total, loaded one slide at a time.
- **Crops:** where a slide is about one part of the screen (the swing guide, the telemetry card), pass
  a `clip` rectangle to `Page.captureScreenshot` so the part fills the slide. Keep 16:9.
- **A new tool, `tools/tutorial/capture.js`:** copy the Chrome start-up and protocol code from
  `tools/test/probe.js`, then, for each slide id:
  1. load `http://127.0.0.1:8090/` in a Chrome profile of its own, `localStorage.clear()`, reload;
  2. click `#hmGuest`, then the arcade practice tile for the category (D6);
  3. run that slide's stage function from `tools/tutorial/stages.js` (in the page), which sets the
     scene and returns `{ clip }` or nothing;
  4. wait two animation frames, capture, write `tutorial/<id>.webp`.
  `node tools/tutorial/capture.js` shoots everything; `node tools/tutorial/capture.js putt-03`
  shoots one. Print each file's size.
- **Fixed scenes.** Practice greens are random. Set `state.greenCfg.seed`, `distFt`, `angleDeg` and
  `state.chipCfg.pinYd` to chosen values and rebuild, or use a hole's own green (fixed). Pick a green
  with an obvious slope so the marbles and the break read at a glance. Calm wind unless the slide is
  about wind.
- **Moments in time.** A swing guide mid-backswing: `beginSwing(true)`, feed a few `swingSample`
  steps, capture at once (the backswing times out after `TUNE.backswingTimeMs`). The "YOUR SWING"
  replay panel shows for 2.4 s after impact (`REPLAY_HOLD_MS`): capture about 0.6 s after
  `debugSwing`. A curving ball flight: capture during `state.view === 'flight'`.

### 3.5 Cause-and-effect slides

The user wants slides that pair the swing with its result. Build them like this.

- **Two pictures on one slide.** A slide may give `img: ['chip-06a', 'chip-06b']`: left, what you did
  (the "YOUR SWING" replay panel, or the set-up); right, what the ball did (the tracer and where it
  stopped). Side by side on a wide window, stacked on a narrow one, with a "→" between. Captions under
  each: "Your swing" and "The result".
- **Comparisons in one frame.** On the practice greens and the range, tracers stay on screen until
  **T** clears them (`trails`, `clearTrails()`), and a chip's tracer is drawn too (thinner). So a stage
  can hit two or three shots from the same spot and capture them together: a straight chip beside a
  hook-spin chip is the clearest picture of what the spin does. Mark each tracer with a numbered
  callout. Check at build time that the tracer follows the ball along the ground as well as in the
  air; if it stops at the landing, the roll needs the overhead view with the ball's final spot marked.
- **The camera for the result.** View 4 ("Flight & Roll") after a chip; for a curve seen from behind,
  the flight camera "from where you stand" (`state.flightCam`).
- **Same swing every time.** Stage the shots with `debugSwing({ back, angle })`, not random swings, and
  check the result before capturing (the game adds its own scatter by Dexterity): retry until the ball
  finishes within a yard of the expected spot, or stage with the scatter seeded.

**What the game can show today.** Measured 2026-11-21 with the arcade's stats (all 8), a flat green,
Stimp 11.5, perfect contact (`computeImpact` + `runChip`, the method in `tools/test/chip-spin.js`).
Re-measure before staging; tuning changes.

| Shot | Result |
|------|--------|
| Sand wedge, Stock chip, 40% back, straight | carries 27 yds, rolls 6.7 |
| The same, swung **+10° in-to-out** (hook spin, "a draw swing") | kicks **2.5 yds left** on landing, rolls **10.2** |
| The same, swung **−10° out-to-in** (cut spin) | kicks **2.2 yds right**, rolls **4.5** |
| Sand wedge, Stock, 45% back: normal spin → **More spin (B)** | roll 5.8 → 3.7 yds |
| Sand wedge, **High Soft** + More spin, 45% back | roll 1.5 yds: it checks and stops |
| Lob wedge, High Soft + More spin, **60% back (46 yd carry)** | rolls **back 3.6 yds** |
| Lob wedge, High Soft, 80% back (71 yd carry) | rolls **back 6.1 yds** (8.8 into a 3% upslope) |
| Any Flop | stops within 1–3 yds, never comes back |

So:

- **Side spin on a chip by hand is real and photographs well** inside chipping range.
- **A ball that rolls backwards needs a lot of spin and a steep landing, which the game gives only
  from about 45 yds out and further.** Inside the chipping range (the game chips within 45 yds; the
  practice green's pin is 8–45 yds) more spin makes the ball **check and stop**, not come back. The
  rule is `backUp()` in `chipBounce()` (`TUNE.backKeep`, `TUNE.backFrom`).
- This plan therefore shows "check it up" in the chipping lesson and "spin it back" as a **high pitch
  of 50–70 yds** in the full-swing lesson. The user confirmed this on 2026-11-21: the mechanics stay
  as they are (section 1). Do not touch `backUp()`, `TUNE.backKeep` / `backFrom`, `chipKickMs` or any
  other tuning to make a picture work: pick a shot the game already produces.

Other cause-and-effect pairs worth a slide (each is already in the lists below or can replace a
plainer slide): a draw and a fade from the tee with both tracers; low and high with the same club; a
Low Runner and a Flop to the same pin; an uphill and a downhill putt with the same stroke; a smooth
stroke and a jabbed one ("PURE" beside "SKID").

## 4. The slides (first draft of the wording)

Short lines, plain words, no numbers the player has to remember. Each slide names its picture and how
to stage it. Marks are numbered to the lines.

### 4.1 The full swing (driver, woods, irons): 10 slides

| # | Title | Lines | Picture |
|---|-------|-------|---------|
| 1 | Look, aim, pick a club | ① **A / D** turn your aim. ② The bag shows how far each club goes: **[ ]** or the wheel picks one. ③ **Space** steps in to the ball. | A hole's tee in the behind-the-ball view (view 1), full frame. Marks: the aim line, the bag, the key hints. |
| 2 | The swing guide | ① The ring is your club. ② The white marks are how far back: 100% is a full swing. ③ Hold **left-click** to start. | Address view (view 2), cropped to the guide round the ball. |
| 3 | Back for distance | ① Pull the ring **left** along the line. ② The further back, the further it goes. ③ Past 100% adds a little distance and a little risk. | Mid-backswing at about 75%, same crop. |
| 4 | Through the ball | ① Swing the ring back **through the ball**. ② Keep it moving: slowing down comes up short and crooked. ③ Missing the ball costs the most. | The "YOUR SWING" replay panel after a clean straight swing ("Ring came through the ball"). |
| 5 | A draw, by hand | ① Swing **down and right** through the ball. ② It curves right to left and runs out further. ③ Steeper swing, bigger curve. | The replay panel after `debugSwing({ angle: 4 })` ("In-to-out … adds draw"), with the curving flight if one frame holds both; otherwise the replay. |
| 6 | A fade, by hand | ① Swing **up and right** through the ball. ② It curves left to right and lands soft. ③ Along the line is straight. | The same with `angle: -4`. |
| 7 | What your swing did | ① **Backswing:** how far back. ② **Downswing:** how briskly you came through. ③ **Strike:** where on the face. Off the sweet spot loses distance. | The Swing Telemetry card and the club face after a shot, cropped (bottom right). |
| 8 | Set it up before you swing | ① **F** sets a draw or fade, **W / S** lower or higher, **B** more or less spin. ② Each one adds **difficulty**. ③ Stack several and good swings start to miss. | Address with a draw and "High" set, the card showing the Difficulty bar raised. |
| 9 | Spin it back (a high pitch) | ① A lofted wedge, **High** (S) and **More spin** (B), from 50 to 70 yards. ② It lands steep, bites, and rolls **back**. ③ Land it past the pin. | **Pair** (3.5). Left: address with the lob wedge, High and More spin set. Right: the tracer into a green and the ball rolled back toward you. Stage on a hole: ball on the fairway about 60 yds from the pin, `debugSwing({ back: 0.7 })`; check it came back 3 yds or more. |
| 10 | Driver, irons, and where the ball lies | ① The driver is for the tee: longest, least forgiving. ② From rough or sand take more loft: the bag marks risky clubs ⚠ and wrong ones ✕. ③ More in **💡 Caddie tips (I)** on any hole: wind, lies, tilt, hazards. | The bag panel with the ball in light rough (ranges and ⚠ showing). Then "Try it on the range". |

Slides 5 and 6 are **pairs** too: left the replay panel, right the tracer curving, seen from where you
stand. If one frame holds both (the replay shows for 2.4 s while the ball flies), one picture will do.

Direction check (the user's own rule, already in the game and the tips): **down-right through the
ball = in-to-out = draw; up-right = out-to-in = fade.** The golfer on screen stands above the line.

### 4.2 Chipping: 9 slides

| # | Title | Lines | Picture |
|---|-------|-------|---------|
| 1 | Near the green, you chip | ① Close to the green the game switches to chipping and picks a club. ② The cyan ring is where the ball will **land**. | The chipping green in the behind-the-ball view, ring and dashed roll line visible. |
| 2 | Aim at the landing spot, not the pin | ① **W A S D** move the ring. ② The dashed amber line is how far it rolls on a **flat** green. ③ The read at the bottom gives the carry and the roll. | The same view, cropped to ring, roll line and the read. |
| 3 | Read the slope from above | ① **V** looks straight down. ② The white marbles roll downhill: faster where it is steeper. ③ Click or drag to place the ring. | The chipping overhead on a clearly sloping green. |
| 4 | Let the slope do its part | ① Uphill stops sooner; downhill runs on. ② A side slope carries it to the low side: land it on the high side. | Overhead with the ring set on the high side of the pin. |
| 5 | The chip swing | ① **Space** steps in. Pull the ring back into the amber **LANDING** band. ② Swing straight through the ball. ③ The band is the length that carries to your ring. | Chip address mid-backswing, the ring in the band, cropped to the guide. |
| 6 | Four ways to chip it | ① **1 Low runner:** lands early, runs like a putt. ② **2 Stock**, **3 High soft:** less run each time. ③ **4 Flop:** straight up, stops dead, the hardest. | The diagram from `tipsChipSvg()` (not a screenshot). |
| 7 | Make it check | ① **B** adds spin: the ball bites and stops sooner. ② **High Soft** with more spin stops almost where it lands. ③ Wedges only, and not from rough or sand. | **Pair** (3.5). Left: the chip card with More spin set. Right: two tracers from one spot, sand wedge Stock at 45% back, ① normal spin (rolls about 6 yds), ② More spin (about 4). |
| 8 | Side spin, by hand | ① Swing **down and right** (a draw swing): it kicks **left** when it lands and runs on. ② Swing **up and right** (a cut): it kicks **right** and checks. ③ A spinning wedge does it most; a low runner hardly at all. | **Pair** (3.5). Left: the "YOUR SWING" replay after `debugSwing({ back: 0.4, angle: 10 })` ("In-to-out … "). Right: three tracers from one spot with the sand wedge, Stock: ① cut (−10°), ② straight, ③ hook (+10°), seen from above or from behind, the three finishing spots marked. |
| 9 | From rough and sand | ① It comes out with less spin and runs further: land it shorter. ② Under a bunker's face, go **High** or **Flop**. | A chip from a greenside bunker on a hole. Then "Try it on the chipping green". |

A chip that rolls **backwards** is not in this lesson: see 3.5 (the game only does it from further
out) and slide 9 of the full swing.

### 4.3 Putting: 7 slides

| # | Title | Lines | Picture |
|---|-------|-------|---------|
| 1 | The marker is your putt | ① The cyan marker is where a **flat** putt would stop. It starts on the cup. ② **W A S D** move it. | The putting green in the behind-the-ball view. |
| 2 | Read the slope from above | ① **V** looks straight down. ② The marbles roll downhill; the lines mark each inch of height. ③ Click or drag the marker. | The putting overhead on a green with clear break. |
| 3 | Pace: uphill and downhill | ① Uphill: set the marker **past** the cup. ② Downhill: set it **short**. ③ Fast greens roll further and break more. | Overhead, an uphill putt with the marker beyond the cup. |
| 4 | Line: aim up the slope | ① The ball falls toward the low side. ② Set the marker on the **high** side and let it drop in. | Overhead, a side-slope putt with the marker on the high side. |
| 5 | The stroke | ① Pull back into the amber **MARKER** band: that is your pace. ② Stroke through at the **same rhythm** you took it back. ③ Stay between the **GATE** rails. | Putt address mid-backstroke, cropped to band and gate. |
| 6 | What the stroke did | ① **Tempo** 1.00× is even. Faster jabs it long; slower leaves it short. ② **Roll:** PURE, or what went wrong. | The Putting Telemetry card after a stroke, cropped. |
| 7 | Putters, and the long ones | ① **[ ]** switches putter: a blade forgives rhythm, a mallet forgives line. ② **1 2 3** set how far a full stroke rolls; Auto picks for you. | The putter card (top right) and the scale read. Then "Try it on the putting green". |

Check every key and every claim against the hint bar and `tipsHTML()` at build time: both are the
source of truth, and both change.

## 5. Build order

Build one step, let the user look, then the next.

1. **T1: the viewer, with no pictures.** `#tutCard`, `TUTORIAL` with the wording above, the chooser,
   keys, the home block. Images fall back to the title panel.
   *Check:* opens from the home screen signed out and as a guest; 1 / 2 / 3, arrows, Enter, Esc all
   work; typing in the home screen's name and password boxes still works with the tutorial closed;
   nothing behind it reacts while it is open; it fits at 1280 × 720 and at a phone width.
2. **T2: the capture tool and the putting pictures.** `tools/tutorial/capture.js`, `stages.js`, the
   seven `putt-*.webp`. Putting first: it has the fewest moving parts.
   *Check:* each file exists, is under about 150 KB, and shows no profile name; the user reviews the
   seven slides in the viewer and corrects wording or framing.
3. **T3: chipping pictures.** Same checks.
4. **T4: full-swing pictures.** Same checks, plus: the draw slide's ball curves right to left and the
   fade's left to right in the picture.
5. **T5: the rest.** The tips-window link, "Try it" buttons, ✓ and NEW flags, and a test
   `tools/test/tutorial.js` that opens each category, steps through every slide, and reports any image
   that failed to load (`naturalWidth === 0`), any slide with more than three lines, and whether Esc
   returns to the home screen.

After each step: `node --check` on the extracted module script, and the existing `tools/test/arcade.js`
and `inv-ui.js` (both use the home screen) still pass.

## 6. Pitfalls

- **Key order.** If `tutKey` is not checked before `homeOpen`, Enter and Esc go to the home screen
  behind the card.
- **`<i>` inside a styled block.** Home-screen styles target `i` and `b` broadly. On 2026-11-21 a rule
  for a description `<i>` also caught the pips' `<i>`. Give the tutorial's elements their own classes.
- **Stale pictures.** A screenshot shows the HUD as it was. After any change to the swing guide, the
  greens' overhead, or the telemetry cards, re-run the capture. Say so in the commit that changes them.
- **The deploy.** `tutorial/` must not be added to `.vercelignore`, and nothing may load from another
  host (CSP).
- **The swing guide lines up only when the camera has settled** (`fxAlpha` near 1 in the address
  view). Wait for it before a capture, or the ring is missing.
- **Scripted swings.** `debugSwing` returns `null` during a flight or an active swing. In practice
  mode (`state.practice`) no ball is launched: use it for guide-only shots, not for flight shots.
- **Career locks.** In a career, the set-up draw and fade (F) are bought from the coach. The pictures
  come from the arcade set-up, where nothing is locked. Confirm that swinging on a crooked path by
  hand is never locked before the wording promises it everywhere.
- **Headless rendering.** The probe runs Chrome with SwiftShader; colours and shadows can differ a
  little from a real GPU. If the pictures look flat, take them with a visible Chrome instead (same
  protocol, drop `--headless=new`).
- **Size creep.** 31 full-frame PNGs would be about 40 MB. Keep WebP, keep the window at 1280 × 720.
- **Don't promise what the game doesn't do.** Every cause-and-effect slide's wording must match a
  result the stage actually produced (3.5): the capture script should print each shot's carry, roll
  and sideways kick beside the file it saved.

## 7. Open questions for the user

1. Is the home screen's left column the right place for the "How to play" block (D1)?
2. Should a brand-new visitor be offered the tutorial once, automatically, or only see the NEW tag (D9)?
3. Is one "full swing" category right, or should the driver get its own (the user said "whatever
   you'd categorize that one as": this plan keeps it as one)?
4. Are wind, lies, tilt and hazards fine left to the caddie tips (D2), with one line pointing there?

(A fifth question, whether short chips should be re-tuned to spin back, was answered on 2026-11-21:
no. See section 1.)
