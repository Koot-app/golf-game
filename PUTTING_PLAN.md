# Putting v2: contoured greens, overhead view, target marker

Implementation plan. Everything is in `index.html` (one file, about 2,950 lines: HTML, CSS, and one ES module that imports Three.js r160 from a CDN). Find code by function name; line numbers here are as of 2026-11-15 and will drift.

## 1. What the user asked for

1. **Greens that slope in more than one direction.** Today every green is a single tilted plane.
2. **An overhead view** of the green, for reading the slopes.
3. **A target marker** placed in the overhead view at the spot the player wants the ball to go. The game shows how much power that putt needs.
4. **The power figure ignores slope on purpose.** It is the power for a flat putt of that length. The player reads the slopes and adds or removes power themselves. This is the skill in the system.

## 2. Decisions

"User" means the user said it. "Default" means the planner chose it and the user has not confirmed it; build it as written, and keep each one easy to change.

| # | Decision | Status |
|---|---|---|
| D1 | The marker's power is computed from flat distance only. Height difference never enters it. | User (confirmed) |
| D2 | The marker is where a putt would stop on a flat green. It starts on the cup. | User (confirmed) |
| D3 | The marker also sets the aim: aim is the direction from ball to marker. | Default |
| D4 | The old pace bracket (`paceRead`, the amber "pace" band, "plays 18–22 ft · 5 in uphill") is removed. It accounted for elevation, which contradicts D1. | User (confirmed) |
| D5a | Perception sets how accurately the marker's power and its target mark are portrayed. Low Perception shows a wide band that may be off-centre; high Perception shows a tight, true one. See 4.6. | User. The exact numbers are defaults. |
| D5b | Perception also sets how much slope detail the overhead view shows. The slope display is never wrong, only coarser. See 4.7. | Default |
| D6 | Key `V` toggles Green Read ↔ Overhead. You cannot stroke the putt from overhead; `Space` goes to address as usual. | Default |
| D7 | Practice-green sliders "Break" and "Up / down" are replaced by "Tilt", "Contours" and "Ball angle". | Default |
| D8 | After the putt, the monitor shows what the putt actually needed. The answer is only revealed afterwards. | Default |

## 3. How putting works today

Read these before changing anything.

- **The ball never moves from the world origin.** The hole or green is positioned around it. In putting, the frame is: ball at `(0, 0)`, cup straight ahead at `(0, -dist)` (−Z is "toward the cup", +X is right). `state.aim` is degrees right of that line.
- **`makeGreen(cfg)`** (PHYSICS region) returns the green in that frame: `{ distFt, stimp, decel, hole: {x, z}, h(x, z), grad(x, z) }`. Height is a plane (`breakPct`, `elevPct`) plus two sine waves (`undul`). `h(0,0)` is 0.
- **`stepPutt(q, dt)`** rolls the ball using `green.grad` and `green.decel`, and handles capture at `green.hole`. `createPutt(green, v0, dirDeg, skidFt)` and `runPutt(...)` wrap it.
- **`computePutt(sw, putter, cfg)`** turns a stroke into `v0`: `flatFt = strokeLength × scaleFt`, `v0 = sqrt(2 · decel · flatFt)`. So a stroke of P% on a scale of S feet rolls exactly `P × S` feet on a flat green. The marker readout relies on this.
- **`buildGreen()`** rebuilds all green geometry in the putt frame each time the putt changes: surface mesh and bank (`ringsOf`), the 1-ft grid with 5-ft major lines anchored on the ball, break beads, cup and pin. **`animateGreen(now)`** runs per frame: beads and the aim line.
- **`applyGreen(keepView)`** is the single "the putt changed" entry point: `makeGreen` → `buildGreen` → `readPace` → auto-scale → reset aim and state.
- **`readPace()` / `paceRead`** produce the Perception-fuzzed pace bracket. Used in `applyGreen`, `updatePuttHUD` (top bar, Stroke bar bracket `brkBs`, `tmCx` line, `pmFoot`), `drawSwingFx` (amber band) and the `__golf` debug handle.
- **Hole play:** `HOLES[i].greenTilt` is one gradient per green. `enterHolePutt()` converts it to `breakPct` / `elevPct` for the ball's position, writes them into `state.greenCfg` with `undul: 0`, and stores `hp.frame = { beta, u, r }` (u = unit vector toward the cup, r = to its right, in hole coordinates). `advanceHole()` uses `hp.frame` to map the putt's finish back to hole coordinates. `layoutWorld()` turns the hole group so the cup is ahead and drops it 3 m under the putting surface.
- **Practice green:** `state.greenCfg = { distFt, breakPct, elevPct, undul, stimp, seed }`, driven by panel sliders `inPDist`, `inPBreak`, `inPElev`, `inPUnd`, `inPStimp` (bound with `gbind`), and `newPutt()` (key `N`).
- **Camera:** `updateCamera()` has a putt branch with three poses (green read, address, peek) plus the roll camera. It sets `goalPos` / `goalLook`, then `aimCam.lookAt(goalLook)` and slerps.
- **Views:** `state.view` is `'scout'` (green read), `'address'` or `'flight'` (roll). `Space` toggles scout/address in `puttKey()`. A/D aim is applied in `frame()` when `state.view === 'scout' || isPeeking()`.

## 4. Design

### 4.1 Surface model (PHYSICS region, pure, no THREE)

A green is now a persistent height field in its own fixed coordinates (metres), independent of where the ball is.

```js
// def: { tilt: {x, z},                          // base plane gradient
//        bumps: [{ x, z, amp, sigma }],         // amp > 0 mound, amp < 0 hollow
//        tiers: [{ x, z, ang, rise, width }],   // a step: rises `rise` over `width` along direction `ang` (radians)
//        outline: { x, z, rx, rz, rot },        // ellipse, same convention as inEllipse()
//        pin: { x, z }, stimp }
function makeSurface(def)   // -> { h(x,z), grad(x,z), inside(x,z,k=1), outline, pin, stimp, decel }
```

- **Bump:** `h += amp · exp(-r² / (2σ²))`. Gradient: `-amp · (dx, dz) / σ² · exp(...)`. Peak slope is `0.607 · amp / σ`.
- **Tier:** `t = ((x-x0)·cos(ang) + (z-z0)·sin(ang)) / width`, `u = clamp(t + 0.5, 0, 1)`, `h += rise · u²(3 - 2u)`. Gradient: `rise · 6u(1-u) / width · (cos, sin)`. Peak slope is `1.5 · rise / width`.
- **Tilt:** `h += tilt.x · x + tilt.z · z`.
- **`inside(x, z, k)`** is `inEllipse(outline, x, z, k) < 1`. `inEllipse` currently lives outside the PHYSICS region; move it in, or duplicate the three lines.
- **Safety fit (`fitSurface`, called by `makeSurface`):** a ball only stops where `(5/7) · g · |grad| < decel`. Sample `|grad|` on a 0.5 m lattice inside the outline. If the maximum exceeds `PUTT.maxSlope = 0.038`, scale every bump `amp` and tier `rise` by `cap / max` and re-check. Then do the same within 1.2 m of the pin against `PUTT.maxSlopeAtPin = 0.022`. 0.038 is safe at the fastest Stimp the slider allows (14).

### 4.2 Putt view (PHYSICS region)

```js
function greenView(surface, ball)   // ball: {x, z} in surface coordinates
// -> the same shape stepPutt / buildGreen / the cameras use today:
//    { distFt, stimp, decel, hole: {x: 0, z: -d}, h, grad, inside, surface, beta, u, r, toSurface(x,z), fromSurface(X,Z) }
```

- `u = normalize(pin - ball)`, `r = (-u.z, u.x)`, `beta = atan2(u.x, -u.z)`. This is the same convention `enterHolePutt` uses now.
- View point `(x, z)` maps to surface point `P = ball + r·x - u·z`.
- `h(x, z) = S.h(P) - S.h(ball)`.
- `grad(x, z) = ( dot(S.grad(P), r), -dot(S.grad(P), u) )`.
- `inside(x, z, k) = S.inside(P.x, P.z, k)`.

`green` (the module-level `let`) becomes a `greenView`. Every existing consumer keeps working, because the shape is unchanged.

### 4.3 Physics change

In `stepPutt`, friction off the putting surface:

```js
const drag = !g.inside ? 1 : g.inside(p.x, p.z) ? 1 : g.inside(p.x, p.z, 1.3) ? PUTT.fringeDrag : PUTT.roughDrag;   // 2.5, 6
const decel = g.decel * drag;   // use for both the friction term and the stop test
```

Nothing else in the roll model changes.

### 4.4 Rendering (`buildGreen`, `animateGreen`)

Keep the current pattern: rebuild everything in the putt frame whenever the putt changes. It is fast (about 10 ms for the largest green) and needs no group transforms.

- **Surface mesh and bank:** generalise `ringsOf` from a circle around the ball–cup midpoint to the surface's outline ellipse. Ring `i` at angle `a` is the outline scaled by `t = i / n`, converted with `green.fromSurface`. Bank rings continue outward at `t > 1` with the same drops as today.
- **1-ft grid:** unchanged in meaning (anchored on the ball, 5-ft major lines). Mask with `green.inside` instead of the disc test.
- **Contour lines (new):** marching squares on a 0.3 m lattice, levels at multiples of the Perception interval **relative to the ball's height**, so the zero line passes through the ball. Dark lines for uphill, light for downhill, draped at `h + 0.010`. Visible in overhead and green-read views.
- **Slope arrows (new):** on a square lattice (spacing from Perception), one flat arrow per node pointing downhill, coloured by steepness: under 1% green, 1–2.5% yellow, over 2.5% red. Use one `InstancedMesh` of a small arrow shape with per-instance colour. Visible in overhead only.
- **Height tint (new, overhead only):** a second mesh sharing the surface geometry, with vertex colours from low (cool, dark) to high (warm, light), about 0.5 opacity.
- **Marker (new):** a ring flat on the surface plus a thin 0.5 m post, so it also shows in the green-read and peek views. Repositioned per frame in `animateGreen`.
- **Aim line:** runs from the ball to the marker instead of `1.15 × dist`.
- **Text** (contour heights, arrow percentages, the marker label): do not make sprites. Draw on the existing full-screen 2D canvas (`#swingFx`) by projecting world points with `Vector3.project(camera)`. Add a `drawPuttPlan()` pass called from `frame()`; `drawSwingFx()` returns early outside the address view, so keep the two separate.

### 4.5 Overhead view

- New value `state.view = 'overhead'`, valid only in putt mode. `V` in `puttKey()` toggles `'scout'` ↔ `'overhead'`. `Space` from overhead goes to `'address'`. Grep every `state.view` comparison; the ones that need `'overhead'` added are the A/D aim condition in `frame()`, `animateGreen`'s `reading` flag, the view label and hints in `updatePuttHUD`, and `applyGreen`'s keep-view logic (panel changes must not kick the player out of overhead).
- **Camera pose** (new branch in `updateCamera`): position directly above the point of interest, looking straight down, `fovGoal = 20`. Do not pass it through `toWorld()`; that rotates by `state.aim`, and the overhead view must stay fixed with the ball at the bottom of the screen and the cup toward the top.
- **Height:** `H = max(Sv/2 / tan(fov/2), Sh/2 / (tan(fov/2) · aspect))`. Two zoom levels, toggled by the mouse wheel (the wheel handler currently only changes clubs and already ignores putt mode): "putt" frames the ball–cup segment with a margin of `max(3 m, 25%)`; "green" frames the whole outline.
- The rig is already hidden when `isPutt() && state.view !== 'address'`.

### 4.6 Marker and power readout

- **State:** keep `state.aim` (degrees) and add `state.markDist` (metres). Marker position in the putt frame is `heading(state.aim) × markDist`. On a new putt: `aim = 0`, `markDist = dist`.
- **Mouse (overhead only):** in the canvas `pointerdown` handler, and on `pointermove` while the button is held, raycast from the camera through the cursor to the plane `y = 0`, then refine twice so the ray height equals `green.h` at the hit. Convert to `aim` / `markDist`. If the point is off the green, pull it back along the ball→point line (binary search on `green.inside`). Minimum `markDist` 0.3 m.
- **Keys:** A/D rotate the marker around the ball (existing aim code; in overhead use a constant sideways speed of about 0.5 m/s, i.e. `rate = 0.5 / markDist` rad/s). W/S or ↑/↓ move it nearer or farther at 0.6 m/s (add to the `held` handling in `frame()`). `C` returns it to the cup.
- **True power (D1):** `flatFt = markDist / FT`, `pct = flatFt / PUTT.scales[state.puttScale].ft`. Nothing else. Do not call `puttTarget` here. This true value is never shown before the putt; it only feeds the portrayed band below and the after-putt feedback.
- **Portrayed power (D5a):** what the player sees is a band, and Perception sets its accuracy. Adapt the existing `readPace()` into `readMarker()`; the structure is the same, only the input changes from "plays-like" distance to flat distance.

  ```js
  const perF = (state.perception - 1) / 9;
  const bias = (u * 2 - 1) * lerp(0.10, 0, perF);     // u: one random number in 0..1, fixed for this putt (see below)
  const half = lerp(0.12, 0.01, perF);
  markRead = { lo: flatFt * (1 + bias - half), hi: flatFt * (1 + bias + half) };   // recomputed whenever the marker moves
  ```

  - At Perception 1 the band is ±12% wide and its centre can be up to 10% off. At 5 it is about ±7% wide and up to 6% off. At 10 it is ±1% and exactly centred.
  - `|bias|` is always smaller than `half`, so the true power is always inside the band, but not necessarily in the middle. Keep that property if the numbers are retuned.
  - `u` must be fixed per putt, not per frame and not per marker move; otherwise the player can average the error away by wiggling the marker. Seed it from the surface and the ball position, as `readPace` seeds from `green.seed` today, e.g. `rng32((Math.round(ball.x * 10) * 73856093 ^ Math.round(ball.z * 10) * 19349663 ^ surfaceSeed * 83492791) >>> 0)()`. Replaying the same putt gives the same error.
  - Recompute `u`-independent parts when the Perception slider changes.
  - The 1-ft grid stays visible, so a patient player can count the true distance. That is intended: it is a manual read, and the band is the quick one.
- **Auto scale:** when `state.puttScaleAuto`, pick from the band's centre when the marker settles (pointer up, key release, new putt), not while dragging: ≤ 11 ft Short, ≤ 30 ft Medium, else Lag. That leaves headroom to add power for uphill putts. Use the band's centre, not the true value, so the scale choice leaks nothing.
- **Where it shows** (always the band, never the true value; when the band is narrower than 2% of the scale, show a single figure):
  - Overhead: a label beside the marker, e.g. `22–26 ft · 56–65% (flat)`.
  - Top bar `tbSetup`: `Marker 22–26 ft · 56–65% stroke · flat, adjust for slope`.
  - Swing overlay (`drawSwingFx`, putt branch): the amber band stays, but now spans `markRead.lo..hi` and is labelled `MARKER`.
  - Telemetry Stroke bar: `brkBs` spans the same band.
  - `tmCx` line: `Marker <b>56–65%</b> · your stroke <b>63%</b>`.
- **Close the leak in the top bar.** `tbPin` shows the exact distance to the cup today (`green.distFt`), and the HOLED toast prints it too. With the marker on the cup, that exact number is the true flat distance. Before the stroke, show the cup distance through the same band (same `bias` and `half`), and keep the "aimed N in left of the cup" part. The toast after the putt may stay exact.
- **After the putt (D8):** `pmFoot` reads `Marker (flat) 24.0 ft · you hit 25.1 ft · it needed about 27 ft`. The first figure is the true flat distance, so this is where a poor read is exposed. "Needed" comes from the existing `puttTarget(green)` (straight-line energy estimate; keep the word "about").

### 4.7 Perception (D5a, D5b)

Perception does two things. The power band (D5a) is specified in 4.6 and scales continuously. The slope detail (D5b) steps:

| Perception | Arrow spacing | Steepness shown | Contour interval | Power band (from 4.6) |
|---|---|---|---|---|
| 1–3 | 9 ft | 2 colours (gentle / steep) | 4 in | about ±10–12% wide, up to 8–10% off-centre |
| 4–7 | 6 ft | 3 colours | 2 in | about ±5–8% wide, up to 3–7% off-centre |
| 8–10 | 3 ft | 3 colours plus a % label on every other arrow | 1 in | ±1–3% wide, at most 2% off-centre |

The slope display is always true to the surface; only its resolution changes. The power band is the one thing that can mislead.

Bead count and grid opacity keep their current Perception scaling. Rebuild arrows, contours and the power band when the Perception slider changes.

### 4.8 Practice green

- `state.greenCfg` becomes `{ distFt, angleDeg, tiltPct, contours, stimp, seed }`.
- **Surface:** a circle of radius 16.5 m. `randomSurface(seed, { tiltPct, contours })` picks a tilt direction, then `round(2 + 6 · contours)` bumps inside an 18 m radius with `σ` 2.5–6 m and `amp` ±(4–14 cm) × `contours`, none centred within 2 m of the origin. `fitSurface` then caps it.
- **Putt placement:** ball and cup sit symmetrically about the centre along `angleDeg`: `cup = centre - dir · d/2`, `ball = centre + dir · d/2`. Every distance up to 90 ft fits.
- **Panel (`.practice-only` block):** Distance (keep `inPDist`), Ball angle 0–359°, Tilt 0–3%, Contours 0–1 (reuse `inPUnd`), Stimp. Remove `inPBreak` and `inPElev` and their `gbind` / `syncPanel` lines.
- **Keys and buttons:** `N` is a new putt on the same green (random distance and angle). A "New green" button, and `Shift+N`, pick a new seed.

### 4.9 Hole play

- Replace `greenTilt` in each `HOLES` entry with `greenSurface`. Positions and `sigma` / `width` are in yards relative to the green's centre; `amp` / `rise` are in inches. `buildHole` converts to metres in hole coordinates and stores `hole.surface = makeSurface(...)` using the hole's existing `green` ellipse and `pin`. Starter values (`fitSurface` keeps them legal):

```js
// Hole 1 (par 5): rises to the back-left, mound back-left, hollow front-right
greenSurface: { tilt: { x: -0.008, z: -0.012 },
  bumps: [{ x: -6, z: -4, amp: 5, sigma: 5 }, { x: 6, z: 5, amp: -4, sigma: 4.5 }, { x: -2, z: 7, amp: 3, sigma: 3.5 }] },
// Hole 2 (par 3): two tiers, upper tier at the back
greenSurface: { tilt: { x: -0.006, z: 0.004 },
  tiers: [{ x: 0, z: -1, ang: -1.2, rise: 4, width: 5 }], bumps: [{ x: 7, z: 4, amp: -3, sigma: 4 }] },
// Hole 3 (par 4): a ridge running through the middle
greenSurface: { tilt: { x: 0.008, z: -0.006 },
  bumps: [{ x: -4, z: 2, amp: 4, sigma: 4 }, { x: 3, z: -3, amp: 4, sigma: 4 }, { x: 8, z: 6, amp: -3, sigma: 5 }] },
```

- `enterHolePutt()`: `green = greenView(hole.surface, hp.ball)`, `hp.frame = { beta: green.beta, u: green.u, r: green.r }`, then the shared "start a putt" path. It no longer writes `breakPct` / `elevPct` into `state.greenCfg`.
- Split `applyGreen` into a shared `startPutt()` (build visuals, reset `aim`, `markDist`, scale, `puttRun`, `puttTel`) and a practice-only step that rebuilds the practice surface from `state.greenCfg`.
- `advanceHole()`'s putt branch and `layoutWorld()` stay as they are.
- `hole.tilt` has no other readers; remove it.

## 5. Build order

Do these in order. Each step leaves the game playable.

1. **Physics.** `makeSurface`, `fitSurface`, `greenView`, the `stepPutt` drag change, `randomSurface`. Check in Node (see section 7):
   - A surface with no tilt, bumps or tiers rolls exactly the pace: 20 ft of pace → 20.0 ft.
   - `grad` matches a finite difference of `h` (step 1e-4) at 50 random points, for a surface with bumps and tiers, in both surface and view coordinates.
   - In a view, `hole` is `(0, -d)` and `h(0, 0)` is 0.
   - After `fitSurface`, sampled max slope ≤ 0.038 overall and ≤ 0.022 near the pin.
   - 500 random putts on random surfaces all stop; none hits the 45 s timeout in `stepPutt`.
   - A putt rolled past one mound curves away from the mound's centre on either side.
2. **Wire it in with tilt-only surfaces.** Practice green and hole play both go through `greenView`. Check: on Hole 1 with only `tilt` set, the putt's break and elevation match what the old `enterHolePutt` formula gave for the same ball position.
3. **Rendering.** Outline-shaped mesh and bank, grid mask, contour lines, arrows, height tint. Turn on the bumps and tiers. Check by screenshot in the green-read view.
4. **Overhead view.** `V`, camera branch, wheel zoom, hints. Check by screenshot: ball at the bottom, cup above it, the whole putt in frame, no camera flip while transitioning.
5. **Marker.** State, mouse and key placement, 3D marker, aim line, all five readouts. Replace `readPace` / `paceRead` with `readMarker` / `markRead` everywhere (the usages are listed in section 3). Checks:
   - On a flat surface, a stroke of exactly the true marker % with the marker on the cup holes the putt. On a 2% uphill putt the same stroke finishes short.
   - At Perception 10 the band is within ±1% of the true value. At Perception 1 it is about ±12% wide, the true value is inside it, and its centre is off by up to 10%.
   - Moving the marker back and forth, or waiting, never changes the band's relative error for the same putt. A new putt changes it.
   - Nothing on screen before the stroke shows the true flat distance as a number.
6. **Panel and Perception.** New practice sliders, `N` / `Shift+N`, Perception table.
7. **Regression.** Play Holes 1–3 to the cup. Range shots still work. `G` and `H` still switch modes cleanly.

## 6. Things that will bite you

- **Looking straight down breaks `lookAt`.** `aimCam` has up = +Y, which is degenerate for a vertical view. Set `aimCam.up.set(0, 0, -1)` in the overhead branch and `aimCam.up.set(0, 1, 0)` in every other branch, before `aimCam.lookAt(...)`.
- **Screen direction convention.** In the address view, up the screen is toward the golfer. Drifting up pulls the putt left; drifting down pushes it right. Do not "fix" this. See AUDIT 15 and P2 in the comment at the top of the file.
- **`visible` must be a real boolean.** Three.js only skips objects whose `visible === false`; `undefined` still draws.
- **Turf decals on the range and hole use `polygonOffset`** and can paint over small objects at low camera angles. Inside `puttG`, follow the existing convention instead: real height offsets (`h + 0.008` and up), no polygon offset.
- **Putts can be tiny.** The stroke thresholds for putting are `PUTT.minBack` and `PUTT.topHyst`, not the full-swing ones.
- **The backswing locks 1 second after the takeaway** (`TUNE.backswingTimeMs`), for putts too.
- **`txtCache`.** `setText(id, s)` skips the DOM write if the cached string matches. Anything that writes `textContent` directly must be followed by `txtCache.clear()`, as `setMode` does.
- **Editing on Windows.** Do not push JS through PowerShell double-quoted strings: backticks and `${...}` get eaten. Use the Edit tool for anything containing a template literal.
- **The PHYSICS region must stay pure** (no THREE, no DOM), or the Node checks stop working.

## 7. How to verify

There is no test suite. Two techniques have been used throughout:

- **Pure maths in Node (v24 is installed).** Read `index.html`, take the text between `//#region PHYSICS` and `//#endregion PHYSICS`, and run it with `new Function(block + '\nreturn { makeSurface, greenView, runPutt, ... };')()`.
- **The real page in headless Chrome over the DevTools protocol.** Chrome is at `C:\Program Files\Google\Chrome\Application\chrome.exe`; launch with `--headless=new --remote-debugging-port=<port> --enable-unsafe-swiftshader`. Node's built-in `WebSocket` and `fetch` are enough to drive it. Use `Runtime.evaluate` for assertions, `Page.captureScreenshot` to look at the result, and `Input.dispatchKeyEvent` for keys (a synthetic `KeyboardEvent` on `document` does not reach the game's `window` listener unless it bubbles).
- **Debug handle:** `window.__golf` exposes `state`, `green`, `puttRun`, `puttTel`, `hp`, `hole`, `setMode`, `applyGreen`, `enterHole`, and `debugSwing({ back, tempo, angle })`, which in putt mode feeds a scripted pendulum stroke (`back` is stroke length as a fraction, `tempo: 1` is a pure pendulum). Add the new pieces (`markDist`, the surface) to it.
- The page opens from `file://` as well as from a local server; it only needs network access for the Three.js CDN.

## 8. Not in this plan

- Full shots that land on the green still roll on a flat surface. Feeding `hole.surface` into the full-shot roll (`stepFlight`'s roll phase) is a natural follow-up.
- While putting on a hole, the surroundings still drop 3 m below a raised putting surface. Rendering the contoured green in place is a separate job.
- A solver that finds the ideal line and pace (a grid search over `runPutt`) would allow "ideal: 14 in left, 108% of flat power" feedback after the putt, or a paid caddie read before it. Not required here.
- Grain, moisture, and multiple pin positions per green.
