# Chipping v1: Wedges, Shot-Type Presets (Low / Stock / High / Flop), Landing-Spot Marker & Contoured Green Rollout

Implementation plan for the Chipping & Short-Game system in `index.html`. Built to pair the **Putting v2 green-reading UI** (contoured 3D green, `V` overhead view, slope arrows, contour lines, break beads, and movable target marker) with the **full-swing mouse mechanics** (backswing length, downswing tempo, path, face, contact ring, and difficulty compounding).

---

## 1. Core Goals & Confirmed Decisions

| # | Decision | Status |
|---|---|---|
| **D1** | **Add 3 new wedges** alongside Pitching Wedge (`46°`): **Gap Wedge (`50°`)**, **Sand Wedge (`55°`)**, and **Lob Wedge (`60°`)**. | User (confirmed) |
| **D2** | **Keep full-swing mouse mechanics** (`analyzeSwing` + `computeImpact`): pull ring left to set backswing carry distance, swing back through the ball with committed tempo and clean ring contact. | User (confirmed) |
| **D3** | **Shot-Type Presets + Manual Fine-Tuning**: provide 4 quick-select presets (**Low Runner**, **Stock Chip**, **High Soft**, **Flop Shot**) that configure address setup (`Ball Position`, `Face`, `Stance`, `Spin`) and flop loft/speed physics, while still allowing manual tweaks (`A/D`, `Q/E`, `Z/C`, `W/S`) at address. | User (confirmed) |
| **D4** | **Putting-style Green-Read & Overhead UI with a Landing-Spot (Carry) Marker**: place the cyan Target Marker where you want the ball to **land**. The HUD & swing overlay show the **carry backswing % band** (fuzzed by `Perception` and lie) plus **estimated flat rollout**, so the player reads how the ball will bounce and roll down the green's contours to the cup. | User (confirmed) |
| **D5** | **Contoured Green Bounce & Rollout Physics**: chips and pitches land on the 3D contoured green (`greenView`), check or release based on descent angle, spin, and surface, and then roll out using the real `stepPutt` slope/break/stimp/cup-capture physics. | Default |
| **D6** | **Where Chipping Mode activates**: (1) **Auto-activates greenside on a hole** when off the green within `45 yds` of the pin, and (2) adds a **Practice Chipping** mode (`Chipping Green`) alongside `Range Sandbox` and `Putting Green`. | User (confirmed) |

---

## 2. Detailed Design

### 2.1 Wedge Lineup (`CLUBS` in `//#region PHYSICS`)

Expand `CLUBS` with three dedicated short-game wedges after `Pitching Wedge` (`46°`):

| Club | Loft | Delivered Loft (`dynLoft`) | Spin (`rpm`) | Speed (`mph`) | Sweet Spot (`mm`) | Full Carry (`yds`) | Special Properties |
|---|---|---|---|---|---|---|---|
| **Pitching Wedge** | `46.0°` | `29.5°` | `9,200` | `80` | `7` | `~128` | Existing (`work: 0.90, floor: 0.60`) |
| **Gap Wedge** | `50.0°` | `33.0°` | `9,600` | `77` | `7` | `~112` | Bridges PW and SW; versatile for 20–110 yd pitches and medium chips |
| **Sand Wedge** | `55.0°` | `37.5°` | `10,100` | `74` | `7` | `~95` | High bounce (`bounce: 12`): forgiving in greenside bunkers & heavy rough; eligible for **Flop Shot** |
| **Lob Wedge** | `60.0°` | `42.5°` | `10,500` | `71` | `6` | `~76` | Maximum loft & stopping power; ideal for **Flop Shot** and tucked pins |

### 2.2 Chipping Shot-Type Presets & Flop Physics

| Preset | Default Setup Applied | Flight & Ground Behavior | Added Difficulty (`cx`) |
|---|---|---|---|
| **1 · Low Runner** (`low`) | `ballPos: -0.6` (Back), `face: -2.0°` (Closed), `stance: +2.0°`, `spin: -2` (Fwd 2) | Low launch (`~16–22°`), reduced spin, shallow landing; hits the green and **releases / rolls out** a long way along the slope. | Low (`Spin +60%` ask, offset by Dexterity) |
| **2 · Stock Chip** (`stock`) | `ballPos: 0.0` (Centre), `face: 0.0°` (Square), `stance: 0.0°`, `spin: 0` (Neutral) | Standard trajectory and balanced carry-to-rollout ratio for the chosen club. | `+0%` (Stock shot) |
| **3 · High Soft** (`high`) | `ballPos: +0.5` (Fwd), `face: +2.5°` (Open), `stance: -2.5°` (Open), `spin: +1` (Back 1) | Higher launch, steeper descent, extra backspin; checks up quickly with minimal rollout. | Moderate (`Spin +25%` ask) |
| **4 · Flop Shot** (`flop`) | Requires wedge (`loft >= 50°`, auto-switches to `Lob Wedge 60°` if a longer club is active). Sets `ballPos: +0.8` (Fwd), `face: +7.0°` (Wide Open), `stance: -7.0°` (Wide Open), `spin: +2` (Back 2) | Slides the wide-open blade under the ball: **`+10°` dynamic loft**, **`0.68×` ball-speed efficiency**, high apex, steep descent, and rapid check-up on landing. | High (`Flop +55%` + `Spin +60%`, plus extra skull/blade risk off `hardpan`) |

### 2.3 Contoured Green Bounce & Roll Physics (`createChip`, `stepChip`)

1. **Air & Bounce Phase over `greenView`**:
   - Ground height at `(x, z)` is read from `green.h(x, z)`.
   - First touchdown records `carry` and `land = { x, z }`.
   - Bounce restitution `e` and horizontal retention `keep` depend on landing surface (`green`, `fringe`, `rough`, `bunker`, `hardpan`), descent angle, and backspin.
2. **Seamless Transition to Contoured Green Roll (`stepPutt`)**:
   - Once vertical bounce velocity drops below threshold, the ball rolls on `green` using `stepPutt` physics (slope gravity `green.grad(x, z)`, Stimp deceleration `green.decel`, fringe/rough drag, and `HOLE_R` cup capture & lip-out).

### 2.4 Putting-Style Green-Read & Overhead UI (`state.mode === 'chip'`)

- **Views**: `1 · Green Read` (`scout`), `Overhead (V)` (`overhead`), `2 · Chip Address` (`address`), `3 · Peek` (`Shift`), and `4 · Flight & Roll` (`flight`).
- **Landing-Spot Target Marker (`readChipMarker`)**:
  - Marker is placed at the desired **landing spot (carry)** via click/drag in Overhead view or `W/A/S/D` / Arrow keys.
  - Shows a Perception-fuzzed **carry distance & backswing % band** (` LANDING ` bracket on the backswing bar and 2D swing overlay) plus **estimated flat rollout** and a dashed rollout preview line on the green.

### 2.5 Practice Chipping Mode & Hole Play Integration

- **Practice Chipping (`Chipping Green`)**: Pin distance `8–45 yds`, Lie selector (`Fairway`, `Light Rough`, `Heavy Rough`, `Greenside Bunker`, `Hardpan`), Slope, Green Tilt, Contours, Stimp, and `New chip (N)` / `New green (Shift+N)`.
- **Hole Play (`hp.on`)**: Automatically activates when off the green within `45 yds` of the pin (`enterHoleChip()`), using the hole's contoured 3D green (`hole.surface`).
