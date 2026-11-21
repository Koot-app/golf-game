// HOW TO PLAY's scenes, one per picture (tools/tutorial/capture.js runs them in the page; ids = the slides' img in
// TUTORIAL in index.html). Each sets up the game through window.__golf and returns { clip: [x, y, w, h], wait, note }:
// clip in the 1600 x 900 window (keep it 16:9), wait (ms) before the picture, note (what the shot did: printed beside the
// file, so the slide's wording can be checked against what the game really did).
window.__tutStages = (() => {
  const g = window.__golf, S = g.state, $ = (id) => document.getElementById(id);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const frames = (n = 2) => new Promise((r) => { const f = () => (n-- <= 0 ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); });
  const key = (code, up = true) => { window.dispatchEvent(new KeyboardEvent('keydown', { code, key: code, bubbles: true })); if (up) window.dispatchEvent(new KeyboardEvent('keyup', { code, key: code, bubbles: true })); };
  const YD = 0.9144, FT = 0.3048;
  // the home screen's "Play as a guest", then the arcade's practice area (as a new player gets it)
  async function open(area) {
    for (const k of ['chip', 'putt']) localStorage.setItem(`golfTipsSeen_${k}`, '1');
    localStorage.setItem('golfTutSeen', '1');
    $('hmGuest').click(); await sleep(150);
    document.querySelector(`#hmArcPrac [data-h=${area}]`).click(); await sleep(700);
    quiet();
  }
  // no toasts, no NEW tags; the tips button (it sits on the pin from above) only where a slide is about it; from above,
  // no wind dial either (it hides what's past the pin, and a green read has no wind)
  let showTips = false;
  function quiet() {
    $('toast').classList.remove('on'); document.body.classList.remove('tipsNew');
    $('btnTips').style.visibility = showTips ? '' : 'hidden';
    $('windDial').style.visibility = S.view === 'overhead' ? 'hidden' : '';
  }
  // wait for the camera to settle after a view change (the swing guide only lines up once it has)
  const settle = async (ms = 1600) => { await sleep(ms); quiet(); await frames(3); };
  // ---- the practice greens: a fixed one (seed, distance, where the ball sits round the hole, tilt %)
  function putGreen({ seed = 7, distFt = 18, angleDeg = 0, tiltPct = 1.5, contours = 0.4, stimp = 11.5 } = {}) {
    Object.assign(S.greenCfg, { seed, distFt, angleDeg, tiltPct, contours, stimp });
    S.puttScaleAuto = true; g.applyGreen();
  }
  function chipGreen({ seed = 7, pinYd = 20, angleDeg = 0, tiltPct = 1.5, contours = 0.4, stimp = 11.5 } = {}) {
    Object.assign(S.greenCfg, { seed, angleDeg, tiltPct, contours, stimp }); S.chipCfg.pinYd = pinYd;
    g.applyChipGreen();
  }
  const holeRise = () => { const G = g.green; return G.h(G.hole.x, G.hole.z) - G.h(0, 0); };      // + uphill to the cup (m)
  // the angle round the hole that makes it most uphill (want +1), downhill (-1), or level across the slope (0)
  function findAngle(cfg, want, build = putGreen) {
    let best = null;
    for (let a = 0; a < 360; a += 10) {
      build({ ...cfg, angleDeg: a });
      const r = holeRise(), score = want === 0 ? -Math.abs(r) : want * r;
      if (!best || score > best.score) best = { a, score, r };
    }
    build({ ...cfg, angleDeg: best.a });
    return best;
  }
  // which side of the line to the hole is higher, halfway along it: +1 right, -1 left
  function highSide() {
    const G = g.green, d = holeDist(), hx = G.hole.x / 2, hz = G.hole.z / 2, rx = -G.hole.z / d, rz = G.hole.x / d;
    return G.h(hx + rx * 0.6, hz + rz * 0.6) > G.h(hx - rx * 0.6, hz - rz * 0.6) ? 1 : -1;
  }
  // the putting marker: flat distance (m) and aim (deg, + right)
  function marker(distM, aimDeg = 0) { S.markDist = distM; S.aim = aimDeg; g.readMarker(); }
  // the chip's landing ring: distance (m) and aim (deg)
  function ring(distM, aimDeg = 0) { g.clampChipMarker(aimDeg, distM); g.readChipMarker(true); }
  const holeDist = () => Math.hypot(g.green.hole.x, g.green.hole.z);
  // a putt's backstroke for the marker: the middle of its band, as a share of a full stroke
  function puttBack() { const m = g.markRead, sc = g.PUTT.scales[S.puttScale]; return ((m.lo + m.hi) / 2) / sc.ft; }
  // a chip's backswing for the ring: the middle of its LANDING band
  function chipBack() { const r = g.chipRead; return (r.bsLo + r.bsHi) / 2; }
  // part of a swing: the ring pulled back to `back` (share of a full swing) and held there
  async function pullBack(back, angle = 0) {
    g.beginSwing(true);
    let t = performance.now();
    const slope = -Math.tan(angle * Math.PI / 180);
    for (let i = 1; i <= 40; i++) g.swingSample(-back * S.cal.swingPx / 40, slope * back * S.cal.swingPx / 40, t += 12);
    await frames(3);
  }
  // a scripted swing, then wait for the ball to stop (it reports where it landed and stopped)
  async function hit(opts) {
    const before = g.shot;
    g.setBadStreak(0);                                     // (no nerves carried in from a shot before: a clean example)
    g.debugSwing(opts);
    for (let i = 0; i < 25 && g.shot === before; i++) await sleep(40);
    for (let i = 0; i < 150 && g.shot && !g.shot.done; i++) await sleep(100);
    await sleep(300);
    const f = g.shot && g.shot.flight;
    if (!f) return {};
    const land = f.land || null, p = f.p;
    // (endW / landW: where it stopped and landed, in the green's frame, for the marks; the flight's own frame is the ball's)
    return { carry: land ? Math.hypot(land.x, land.z) / YD : NaN, total: Math.hypot(p.x, p.z) / YD, side: p.x / YD, kick: land ? (p.x - land.x) / YD : 0,
      back: land ? (Math.hypot(land.x, land.z) - Math.hypot(p.x, p.z)) / YD : 0, endW: { x: p.x, z: p.z }, landW: land ? { x: land.x, z: land.z } : null };
  }
  const yd = (v) => (Number.isFinite(v) ? v.toFixed(1) : '?');
  // crops: the swing guide round the ball at address (putting: the ball sits at the centre, 507 px down), a card in the
  // right-hand column (widened to 16:9, the game to its left)
  const guideClip = ([x, y, w]) => [x, y, w, Math.round(w * 9 / 16)];
  function rightCardClip(id) {
    const r = $(id).getBoundingClientRect(), h = Math.round(r.height + 24), w = Math.round(h * 16 / 9);
    return [Math.round(r.right + 12 - w), Math.round(r.top - 12), w, h];
  }

  // three chips from one spot, cut (-10), straight, hook (+10), then the green from above; where each landed and stopped
  async function threeChips(zoom) {
    await open('chip'); chipGreen({ seed: 23, pinYd: 30, angleDeg: 30, tiltPct: 0.2 }); S.view = 'address'; await settle(2400);
    const out = [], ends = [], landsW = [];
    for (const angle of [-10, 0, 10]) {
      S.view = 'address'; await settle(1800);
      const r = await hit({ back: 0.4, angle }); out.push(`${angle}: side ${yd(r.side)} kick ${yd(r.kick)} total ${yd(r.total)}`);
      ends.push(r.endW); landsW.push(r.landW); g.resetShot(); await sleep(300);
    }
    S.view = 'overhead'; S.puttZoom = zoom; await settle(2200);
    const scr = (p) => g.toScreen(p.x, g.green.h(p.x, p.z), p.z);
    return { note: out.join(' | '), ends: ends.map(scr), lands: landsW.filter(Boolean).map(scr) };
  }
  const LAND = 17;                                          // (yds: on the green, so both chips land on the same surface)
  async function checkChip(type, spin) {
    await open('chip'); chipGreen({ seed: 23, pinYd: 29, angleDeg: 30, tiltPct: 0.2 });
    g.applyChipType(type); g.setSpinCtl(spin, true); ring(LAND * YD, 0); S.view = 'address'; await settle(2400);
    let r = null;
    for (let k = 0; k < 4; k++) { r = await hit({ back: chipBack() }); if (Math.abs(r.carry - LAND) < 1.5) break; g.resetShot(); S.view = 'address'; await settle(1600); }
    S.view = 'overhead'; S.puttZoom = 'putt'; await settle(2200);
    // (chipping's own zoom, ball to hole: the landing sits mid-screen, clear of the read and the key hints along the
    // bottom; the picture runs from just past the hole to just short of the landing ring)
    const G = g.green, h = g.toScreen(G.hole.x, G.h(G.hole.x, G.hole.z), G.hole.z), a = g.toScreen(0, G.h(0, -LAND * YD), -LAND * YD);
    const ht = Math.round(Math.max(260, (a.y - h.y) * 1.5)), w = Math.round(ht * 16 / 9);
    const clip = [Math.round(h.x - w / 2), Math.round(h.y - ht * 0.18), w, ht];
    const end = g.toScreen(r.endW.x, G.h(r.endW.x, r.endW.z), r.endW.z);
    return { note: `${type}, spin ${spin}: carry ${yd(r.carry)}, roll ${yd(r.total - r.carry)}, total ${yd(r.total)}`, wait: 600, clip, marks: [[...mark({ x: end.x + 22, y: end.y }, clip, spin ? 2 : 1), spin ? 1 : 0]] };
  }
  // a full swing on the range held for its replay panel (shown for 2.4 s after impact)
  async function replay(opts, what, club = 7) {
    await open('range'); S.club = club; g.renderBag(); S.view = 'address'; await settle(2600);
    const b = ballScreen(); g.setBadStreak(0);
    g.debugSwing(opts); await sleep(420);
    return { note: `the replay: ${what}`, wait: 20, clip: aroundClip(b.x - 110, b.y - 15, 900) };
  }
  // a 7 iron curving, seen from the tee tracer camera
  // (the game scatters every swing a little, by Dexterity: it takes the first that curves the way the slide says, the
  // face-to-path telling which way it bent, and says how many tries that took)
  async function curve(angle, club = 0, cam = 'player') {
    await open('range'); S.club = club; g.renderBag(); S.flightCam = cam; S.view = 'address'; await settle(2600);
    let r = null, k = 0;
    for (; k < 8; k++) {
      r = await hit({ back: 1.0, angle });
      if (Math.sign(r.side) === -Math.sign(angle) && Math.abs(r.side) >= 8) break;      // (a clear curve, the way the slide says)
      g.resetShot(); S.view = 'address'; await settle(1800);
    }
    await sleep(500); quiet();
    // the picture: the flight's arc down to where it came down (the tracer's points are in the world: the first back at
    // its start height after the apex), and mark 2 there, a little above it
    const P = g.shot.tracer.pts, n = P.length / 3;
    let top = 0; for (let i = 0; i < n; i++) if (P[i * 3 + 1] > P[top * 3 + 1]) top = i;
    let land = n - 1; for (let i = top; i < n; i++) if (P[i * 3 + 1] <= P[1] + 0.3) { land = i; break; }
    const s = g.toScreen(P[land * 3], P[land * 3 + 1], P[land * 3 + 2]), clip = [340, 70, 920, 518];
    return { note: `${g.CLUBS[club].name} ${angle > 0 ? 'in-to-out' : 'out-to-in'} ${Math.abs(angle)} deg: carry ${yd(r.carry)}, finished ${yd(Math.abs(r.side))} yds ${r.side < 0 ? 'left' : 'right'} (try ${k + 1})`,
      clip, marks: [[...mark({ x: s.x, y: s.y - 30 }, clip, 2), 1]] };
  }
  async function pitchSetup() {
    await open('range'); g.selectHole(4); g.enterHole(); await sleep(800);
    const h = g.hole, pin = h.pin, target = 61 * YD;
    let best = null;
    for (const p of h.cl) { const d = Math.hypot(p.x - pin.x, p.z - pin.z); if (!best || Math.abs(d - target) < Math.abs(best.d - target)) best = { p, d }; }
    g.hp.ball = { x: best.p.x, z: best.p.z }; g.hp.onTee = false; g.setupNextShot(); await sleep(400);
    S.club = 13; g.renderBag(); g.setGreenRead(false, true); S.view = 'address'; await settle(2400);
    g.setHeight(1); g.setSpinCtl(1); await settle(500);
  }
  const pinDist = () => Math.hypot(g.hole.pin.x - g.hp.ball.x, g.hole.pin.z - g.hp.ball.z);
  // where the ball sits on the screen (the swing guide and its replay are drawn round it)
  const ballScreen = () => g.toScreen(0, (g.rigY ? g.rigY() : 0) + 0.021, 0);
  // a 16:9 box w wide centred on (x, y), kept inside the window
  function aroundClip(x, y, w) {
    const h = Math.round(w * 9 / 16);
    return [Math.round(Math.min(Math.max(0, x - w / 2), innerWidth - w)), Math.round(Math.min(Math.max(0, y - h / 2), innerHeight - h)), w, h];
  }
  // a numbered mark at a screen point, in % of the clip
  const mark = (p, [cx, cy, cw, ch], n) => [+((p.x - cx) / cw * 100).toFixed(1), +((p.y - cy) / ch * 100).toFixed(1), n];
  const stages = {
    // ---------------------------------------------------------------- PUTTING
    'putt-01': async () => {
      await open('putt'); putGreen({ seed: 11, distFt: 16, angleDeg: 40, tiltPct: 1.6 }); S.view = 'scout'; await settle();
      return { note: `green read, ${S.greenCfg.distFt} ft` };
    },
    'putt-02': async () => {
      await open('putt'); putGreen({ seed: 11, distFt: 22, angleDeg: 70, tiltPct: 2.2 }); S.view = 'overhead'; S.puttZoom = 'putt'; await settle();
      return { note: 'overhead', wait: 900 };
    },
    'putt-03': async () => {
      await open('putt'); const b = findAngle({ seed: 11, distFt: 18, tiltPct: 2.4 }, +1);
      marker(holeDist() * 1.22, 0); S.view = 'overhead'; S.puttZoom = 'putt'; await settle();
      return { note: `uphill ${(b.r / 0.0254).toFixed(1)} in over ${S.greenCfg.distFt} ft; marker ${(S.markDist / FT).toFixed(1)} ft`, wait: 900 };
    },
    'putt-04': async () => {
      await open('putt'); const b = findAngle({ seed: 11, distFt: 18, tiltPct: 2.4 }, 0), hs = highSide();
      marker(holeDist() * 1.05, 7 * hs); S.view = 'overhead'; S.puttZoom = 'putt'; await settle();
      return { note: `across the slope (rise ${(b.r / 0.0254).toFixed(1)} in), high side ${hs > 0 ? 'right' : 'left'}, aimed ${S.aim} deg`, wait: 900 };
    },
    'putt-05': async () => {
      await open('putt'); putGreen({ seed: 11, distFt: 16, angleDeg: 40, tiltPct: 1.2 }); S.view = 'address'; await settle(2200);
      const band = puttBack(); await pullBack(band * 0.8);
      return { note: `backstroke at ${(band * 80).toFixed(0)}%, the band at ${(band * 100).toFixed(0)}%`, wait: 60, clip: guideClip([300, 300, 760]) };
    },
    'putt-06': async () => {
      await open('putt'); putGreen({ seed: 11, distFt: 14, angleDeg: 40, tiltPct: 1.2 }); S.view = 'address'; await settle(2200);
      g.debugSwing({ back: puttBack(), tempo: 1.0 });
      for (let i = 0; i < 60 && (g.puttRun || S.view !== 'flight'); i++) await sleep(200);
      await sleep(600); quiet();
      return { note: 'a smooth stroke', clip: rightCardClip('telemetry') };
    },
    'putt-07': async () => {
      await open('putt'); putGreen({ seed: 11, distFt: 34, angleDeg: 40, tiltPct: 1.2 }); key('BracketRight'); S.view = 'scout'; await settle();
      return { note: `putter ${S.putter}, scale ${g.PUTT.scales[S.puttScale].name}` };
    },

    // ---------------------------------------------------------------- CHIPPING
    'chip-01': async () => {
      await open('chip'); chipGreen({ seed: 23, pinYd: 22, angleDeg: 30, tiltPct: 1.4 }); S.view = 'scout'; await settle(2000);
      return { note: `green read, pin ${S.chipCfg.pinYd} yds, ${g.CLUBS[S.club].name}` };
    },
    'chip-02': async () => {
      await open('chip'); chipGreen({ seed: 23, pinYd: 22, angleDeg: 30, tiltPct: 1.4 }); S.view = 'scout'; await settle(2000);
      return { note: `read: land ${yd(g.chipRead.lo / YD)}-${yd(g.chipRead.hi / YD)}, roll ${yd(g.chipRead.rollM / YD)}` };
    },
    // (from above, chipping's camera is high: the pictures keep the green, where the reading is)
    'chip-03': async () => {
      await open('chip'); chipGreen({ seed: 23, pinYd: 24, angleDeg: 120, tiltPct: 2.4 }); S.view = 'overhead'; S.puttZoom = 'putt'; await settle(2000);
      return { note: 'overhead', wait: 900, clip: [380, 72, 840, 473] };
    },
    'chip-04': async () => {
      await open('chip'); findAngle({ seed: 23, pinYd: 24, tiltPct: 2.4 }, 0, chipGreen); const hs = highSide();
      ring(S.markDist, 6 * hs); S.view = 'overhead'; S.puttZoom = 'putt'; await settle(2000);
      return { note: `across the slope, high side ${hs > 0 ? 'right' : 'left'}, ring aimed ${6 * hs} deg; ${g.chipRead.reach ? 'in reach' : 'OUT OF REACH'}`, wait: 900, clip: [380, 72, 840, 473] };
    },
    'chip-05': async () => {
      await open('chip'); chipGreen({ seed: 23, pinYd: 22, angleDeg: 30, tiltPct: 1.4 }); S.view = 'address'; await settle(2400);
      const b = ballScreen(), band = chipBack(); await pullBack(band * 0.8);
      return { note: `backswing at ${(band * 80).toFixed(0)}%, the LANDING band at ${(band * 100).toFixed(0)}%`, wait: 60, clip: aroundClip(b.x - 185, b.y - 50, 660) };
    },
    // two chips landing on the same spot: a Stock chip with normal spin, a High Soft with more spin (from above)
    'chip-07a': async () => checkChip('stock', 0),
    'chip-07b': async () => checkChip('high', 1),
    // the swing that puts hook spin on a chip (the replay held on screen after impact), then three chips from one spot
    'chip-08a': async () => {
      await open('chip'); chipGreen({ seed: 23, pinYd: 30, angleDeg: 30, tiltPct: 0.2 }); S.view = 'address'; await settle(2400);
      const b = ballScreen();
      g.debugSwing({ back: 0.4, angle: 10 }); await sleep(380);
      return { note: 'the replay: in-to-out 10 deg', wait: 20, clip: aroundClip(b.x - 70, b.y - 25, 700) };
    },
    'chip-08b': async () => {
      const r = await threeChips('green');
      const pts = [...r.ends, ...r.lands], cx = pts.reduce((s, p) => s + p.x, 0) / pts.length, cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
      const clip = aroundClip(cx, cy, 560);
      return { note: r.note, wait: 600, clip, marks: [mark(r.ends[2], clip, 1), mark(r.ends[0], clip, 2)] };
    },
    'chip-09': async () => {
      await open('range'); g.selectHole(1); g.enterHole(); await sleep(800);
      g.hp.ball = { x: 25.6, z: -144.0 }; g.hp.onTee = false; g.setupNextShot(); S.view = 'scout'; await settle(2600);
      return { note: `on hole 2 in ${S.lie}, ${g.CLUBS[S.club].name}, chip type ${S.chipType}, ${(Math.hypot(g.hole.pin.x - 25.6, g.hole.pin.z + 144) / YD).toFixed(0)} yds` };
    },

    // ---------------------------------------------------------------- THE FULL SWING
    'swing-01': async () => {
      await open('range'); g.selectHole(3); g.enterHole(); S.view = 'scout'; await settle(2600);
      return { note: `hole 4 tee, ${g.CLUBS[S.club].name}` };
    },
    // (the guide runs from the ball to the 100% mark, about 450 px to its left)
    'swing-02': async () => {
      await open('range'); S.club = 7; g.renderBag(); S.view = 'address'; await settle(2400);
      const b = ballScreen();
      return { note: `7 iron at address, ball at ${b.x.toFixed(0)}, ${b.y.toFixed(0)}`, clip: aroundClip(b.x - 185, b.y - 50, 660) };
    },
    'swing-03': async () => {
      await open('range'); S.club = 7; g.renderBag(); S.view = 'address'; await settle(2400);
      const b = ballScreen(); await pullBack(0.75);
      return { note: 'backswing at 75%', wait: 40, clip: aroundClip(b.x - 185, b.y - 50, 660) };
    },
    'swing-04': async () => replay({ back: 1.0, angle: 0 }, 'straight'),
    'swing-05a': async () => replay({ back: 1.0, angle: 2 }, 'in-to-out 2 deg', 0),
    'swing-05b': async () => curve(2),
    'swing-06a': async () => replay({ back: 1.0, angle: -2.5 }, 'out-to-in 2.5 deg', 0),
    'swing-06b': async () => curve(-2.5),
    'swing-07': async () => {
      await open('range'); S.club = 7; g.renderBag(); S.flightCam = 'tee'; S.view = 'address'; await settle(2400);
      const r = await hit({ back: 1.0, angle: 1 }); await sleep(400); quiet();
      return { note: `7 iron: carry ${yd(r.carry)}, side ${yd(r.side)}`, clip: rightCardClip('telemetry') };
    },
    'swing-08': async () => {
      await open('range'); S.club = 7; g.renderBag(); S.view = 'address'; await settle(2400);
      g.applyShot('draw'); g.setHeight(1); g.setSpinCtl(1); await settle(600);
      return { note: `set up: ${S.shotShape}, height ${S.height}, spin ${S.spinCtl}` };
    },
    // a high pitch that spins back: a lob wedge, High and More spin, from about 60 yds on hole 5's fairway
    // (the set-up: the guide, the bag's lob wedge and the card's High 1 and More spin; the result: the launch monitor's
    // carry and total, and the green it came down on)
    'swing-09a': async () => {
      await pitchSetup(); const clip = [560, 315, 1040, 585];
      const t = [...document.querySelectorAll('#telemetry .tm-tags span, #telemetry .tag-row span, #telemetry em, #telemetry b')].find((e) => /HIGH 1/i.test(e.textContent));
      const tr = t ? t.getBoundingClientRect() : null;
      return { note: `${g.CLUBS[S.club].name}, height ${S.height}, spin ${S.spinCtl}, ${(pinDist() / YD).toFixed(0)} yds to the pin${tr ? '' : ' (no HIGH 1 tag found for the mark)'}`, clip,
        marks: tr ? [[...mark({ x: tr.left - 14, y: (tr.top + tr.bottom) / 2 }, clip, 1), 0]] : [] };
    },
    'swing-09b': async () => {
      await pitchSetup();
      let r = null;
      for (let k = 0; k < 4; k++) { r = await hit({ back: 0.72 }); if (r.back > 1.5) break; g.resetShot(); await settle(1600); }
      await sleep(800); quiet();
      const clip = [0, 260, 1120, 630];
      // (in the cell's top-right corner, by its label: not on the number)
      const mk = ['lmCarry', 'lmTotal'].map((id) => { const e = $(id).parentElement.getBoundingClientRect(); return [...mark({ x: e.right - 18, y: e.top + 14 }, clip, 2), 1]; });
      return { note: `carry ${yd(r.carry)}, total ${yd(r.total)}: rolled back ${yd(r.back)} yds`, clip, marks: mk };
    },
    'swing-10': async () => {
      await open('range'); const sel = $('inLie'); sel.value = 'light'; sel.dispatchEvent(new Event('change')); S.club = 5; g.renderBag(); S.view = 'scout'; await settle(1800);
      return { note: `lie ${S.lie}` };
    },
  };

  window.__tutRun = async (id) => {
    try { const f = stages[id]; if (!f) return { error: 'no such stage' }; return (await f()) || {}; } catch (e) { return { error: String(e && e.stack || e) }; }
  };
  return stages;
})();
