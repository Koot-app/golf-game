// The tier 2 course's holes (HOLES_T2 in index.html), traced from the user's GPS-app screenshots (2026-11-20).
// Everything below is in screenshot pixels (923 x 2000 as displayed) except sizes given in yards; this script scales
// each hole so the app's own aiming line (tee -> targets -> green: `ref`) is the scorecard yardage, turns it into
// the hole's frame (yards, +x right, -z up the screen from the tee) and writes the HOLES_T2 block into index.html.
//   node tools/course/t2-trace.js          (rewrites the block between "const HOLES_T2 = [" and "const HOLES_BASE")
//   node tools/course/t2-trace.js --print  (prints it instead)
// path: the centre line (down the middle of the fairway). stations: [point on the line, left px, right px] = the
// fairway's half-widths there, measured square to the line. green.shape: see kidney / egg / peanut below.
const fs = require('fs'), path = require('path');
// green outlines: radius x (1 + sum amp*cos(k*theta - phase)); theta from the green's own +x (0 right, 90 the far side)
const kidney = (at, a2 = 0.08, a3 = 0.09) => [[2, -a2, (2 * at + 720) % 360], [3, -a3, (3 * at + 1080) % 360]];   // a bite out of the edge at `at` degrees
const egg = (at, a = 0.1) => [[1, -a, (at + 360) % 360], [3, a, (3 * at + 1080) % 360]];                           // the narrow end at `at`
const peanut = (a = 0.24) => [[2, -a, 0]];                                                                          // a waist across the middle
const H = [
  { yds: 315, par: 4, hcp: 13, desc: 'Straight down a tree-lined chute', ob: 36, wind: [6, 20], stimp: 11, halfWidth: 17, firstCut: 8,
    ref: [[552, 1525], [490, 860], [462, 397]],
    path: [[552, 1525], [520, 1190], [495, 1000], [490, 860], [485, 650], [475, 520], [462, 397]],
    stations: [[[520, 1190], 45, 35], [[508, 1100], 68, 55], [[495, 1000], 70, 68], [[490, 860], 65, 65], [[487, 750], 62, 60], [[485, 650], 58, 50], [[482, 585], 45, 34], [[480, 555], 28, 24], [[477, 520], 38, 36], [[470, 470], 30, 30]],
    green: { c: [462, 397], rx: 13, rz: 14.5, rot: 0.15, shape: kidney(-45, 0.07, 0.09) }, pinOff: [-2, 3],
    surface: '{ tilt: { x: -0.006, z: -0.010 }, bumps: [{ x: -4, z: 3, amp: 4, sigma: 4 }, { x: 4, z: -5, amp: -3, sigma: 4 }] }',
    bunkers: [{ c: [455, 322], rx: 10, rz: 6, rot: 0.1, type: 'bunker', depth: 3.5, note: 'behind the green' },
      { c: [568, 770], rx: 5, rz: 5, rot: 0, type: 'fbunker', depth: 2.5, note: 'right edge of the landing zone' }] },
  { yds: 467, par: 5, hcp: 9, desc: 'Dogleg left, then right between the ponds', ob: 45, wind: [9, 200], stimp: 11, halfWidth: 20, firstCut: 8,
    ref: [[432, 1535], [92, 1100], [220, 605], [463, 381]],
    path: [[432, 1535], [270, 1380], [140, 1260], [105, 1100], [130, 950], [180, 790], [222, 610], [340, 490], [463, 381]],
    stations: [[[150, 1290], 12, 12], [[135, 1250], 50, 50], [[105, 1100], 70, 75], [[130, 950], 80, 85], [[180, 790], 65, 70], [[210, 670], 45, 55], [[219, 628], 26, 30], [[223, 604], 7, 7],
      [[263, 559], 7, 7], [[277, 545], 20, 20], [[340, 490], 38, 38], [[400, 435], 36, 34], [[440, 402], 26, 24]],
    gaps: [[[224, 601], [262, 561]]],                         // rough between the lay-up and the approach, at the ponds
    green: { c: [463, 381], rx: 13.5, rz: 11.5, rot: 0, shape: kidney(-115, 0.08, 0.08) }, pinOff: [3, 3],
    surface: '{ tilt: { x: 0.007, z: -0.006 }, tiers: [{ x: 0, z: 0, ang: -0.7, rise: 4, width: 5 }], bumps: [{ x: 5, z: 3, amp: -3, sigma: 4 }] }',
    bunkers: [{ c: [447, 330], rx: 5, rz: 4, rot: 0, type: 'bunker', depth: 3, note: 'behind, left' },
      { c: [440, 437], rx: 9, rz: 6, rot: 0.3, type: 'bunker', depth: 3.5, note: 'front left' },
      { c: [24, 912], rx: 4, rz: 6, rot: 0.1, type: 'fbunker', depth: 2.5, note: 'left of the fairway' },
      { c: [12, 990], rx: 3.5, rz: 4.5, rot: 0, type: 'fbunker', depth: 2.5, note: 'left of the fairway, the second' }],
    water: [{ c: [175, 470], rx: 14, rz: 24 }, { c: [338, 637], rx: 24, rz: 17 }] },
  { yds: 377, par: 4, hcp: 5, desc: 'Dogleg right', ob: 50, wind: [8, 300], stimp: 11.5, halfWidth: 20, firstCut: 8,
    ref: [[478, 1530], [238, 866], [478, 414]],
    path: [[478, 1530], [380, 1340], [240, 1170], [225, 1000], [232, 866], [262, 760], [300, 660], [360, 570], [425, 480], [478, 414]],
    stations: [[[300, 1245], 12, 12], [[240, 1170], 75, 65], [[225, 1000], 90, 75], [[232, 866], 80, 75], [[262, 760], 55, 60], [[295, 670], 34, 38], [[322, 628], 18, 18], [[368, 558], 40, 40], [[430, 475], 36, 36], [[458, 440], 24, 24]],
    green: { c: [478, 414], rx: 10.5, rz: 17, rot: -0.15, shape: egg(-90, 0.1) }, pinOff: [-1, -6],
    surface: '{ tilt: { x: -0.008, z: -0.008 }, bumps: [{ x: 3, z: 4, amp: 4, sigma: 4.5 }, { x: -4, z: -5, amp: -3, sigma: 4 }] }',
    bunkers: [{ c: [415, 407], rx: 4.5, rz: 5, rot: 0, type: 'bunker', depth: 3, note: 'left' },
      { c: [532, 445], rx: 8.5, rz: 8, rot: 0.2, type: 'bunker', depth: 4, note: 'right, the big one' },
      { c: [110, 915], rx: 7, rz: 13, rot: 0.1, type: 'fbunker', depth: 2.5, note: 'left of the landing zone' }],
    water: [{ c: [310, 1485], rx: 31, rz: 17 }] },
  { yds: 334, par: 4, hcp: 11, desc: 'Straightaway, the fairway opening to the right', ob: 40, wind: [12, 10], stimp: 11, halfWidth: 16, firstCut: 7,
    ref: [[463, 1525], [412, 914], [450, 408]],
    path: [[463, 1525], [440, 1100], [412, 914], [420, 700], [440, 560], [450, 408]],
    stations: [[[440, 1100], 8, 8], [[428, 1020], 40, 40], [[412, 914], 42, 58], [[415, 800], 35, 75], [[420, 700], 35, 90], [[432, 610], 37, 88], [[440, 555], 22, 82], [[446, 500], 6, 72], [[449, 458], 0, 55]],
    green: { c: [450, 408], rx: 11.5, rz: 12.5, rot: 0, shape: kidney(-135, 0.07, 0.08) }, pinOff: [3, -2],
    surface: '{ tilt: { x: 0.004, z: -0.011 }, bumps: [{ x: -5, z: 2, amp: 3, sigma: 4 }] }',
    bunkers: [{ c: [397, 432], rx: 3.5, rz: 6.5, rot: 0, type: 'bunker', depth: 3, note: 'left' },
      { c: [443, 472], rx: 5, rz: 6, rot: 0.2, type: 'bunker', depth: 3.5, note: 'front, on the line' },
      { c: [383, 778], rx: 4, rz: 4, rot: 0, type: 'fbunker', depth: 2, note: 'left edge of the fairway' }] },
  { yds: 163, par: 3, hcp: 1, desc: 'Narrow par 3 to a long green, sand both sides', ob: 34, wind: [7, 90], stimp: 12, halfWidth: 7, firstCut: 6,
    ref: [[603, 1415], [478, 440]],
    path: [[603, 1415], [560, 1050], [520, 790], [500, 620], [478, 440]],
    stations: [[[522, 800], 28, 24], [[513, 740], 50, 38], [[504, 650], 45, 24], [[496, 590], 35, 20], [[489, 545], 30, 26]],
    green: { c: [478, 440], rx: 10, rz: 16, rot: 0.2, shape: [...peanut(0.2), [3, 0.05, 90]] }, pinOff: [-1, 6],
    surface: '{ tilt: { x: -0.005, z: -0.009 }, tiers: [{ x: 0, z: -1, ang: -Math.PI / 2, rise: 4, width: 4 }], bumps: [{ x: 3, z: 6, amp: -3, sigma: 3.5 }] }',
    bunkers: [{ c: [357, 375], rx: 3, rz: 4.2, rot: 0, type: 'bunker', depth: 3.5, note: 'back left' },
      { c: [386, 560], rx: 3, rz: 6, rot: 0.2, type: 'bunker', depth: 4, note: 'front left' },
      { c: [580, 490], rx: 2.6, rz: 6, rot: -0.1, type: 'bunker', depth: 3.5, note: 'right' }] },
  { yds: 359, par: 4, hcp: 15, desc: 'Between the ponds, then bending left', ob: 45, wind: [10, 160], stimp: 11.5, halfWidth: 19, firstCut: 7,
    ref: [[372, 1430], [565, 1013], [469, 522]],
    path: [[372, 1430], [440, 1330], [505, 1270], [535, 1150], [562, 1013], [540, 850], [500, 680], [469, 522]],
    stations: [[[482, 1298], 10, 10], [[505, 1270], 50, 48], [[535, 1150], 72, 68], [[562, 1013], 56, 40], [[550, 920], 66, 52], [[540, 850], 74, 50], [[520, 760], 72, 48], [[500, 680], 58, 50], [[490, 640], 42, 42], [[482, 590], 45, 40], [[475, 556], 34, 34]],
    green: { c: [469, 522], rx: 11.5, rz: 14.5, rot: 0, shape: peanut(0.24) }, pinOff: [1, -7],
    surface: '{ tilt: { x: 0.006, z: -0.008 }, bumps: [{ x: -3, z: -3, amp: 4, sigma: 4 }, { x: 4, z: 5, amp: -3, sigma: 4 }] }',
    bunkers: [{ c: [430, 497], rx: 3.5, rz: 4.5, rot: 0, type: 'bunker', depth: 3, note: 'left' },
      { c: [505, 545], rx: 4, rz: 5, rot: 0, type: 'bunker', depth: 3, note: 'front right' }],
    water: [{ c: [452, 1010], rx: 16, rz: 33 }, { c: [650, 985], rx: 17, rz: 30 }] },
  { yds: 180, par: 3, hcp: 3, desc: 'Long par 3 to an angled green', ob: 38, wind: [9, 330], stimp: 12, halfWidth: 12, firstCut: 7,
    ref: [[540, 1490], [441, 417]],
    path: [[540, 1490], [525, 1000], [500, 800], [470, 600], [441, 417]],
    stations: [[[506, 855], 20, 20], [[500, 800], 85, 55], [[485, 700], 105, 75], [[472, 620], 80, 60], [[466, 585], 32, 32], [[460, 545], 24, 30], [[452, 492], 18, 26]],
    green: { c: [441, 417], rx: 10, rz: 14, rot: 0.55, shape: egg(-90, 0.09) }, pinOff: [-2, -4],
    surface: '{ tilt: { x: -0.007, z: -0.006 }, tiers: [{ x: 0, z: 0, ang: 0, rise: 4, width: 5 }], bumps: [{ x: -6, z: 3, amp: -3, sigma: 4 }] }',
    bunkers: [{ c: [522, 383], rx: 4.5, rz: 11, rot: 0.84, type: 'bunker', depth: 4, note: 'back right, a long one along the green' },
      { c: [385, 537], rx: 8.5, rz: 9, rot: -0.2, type: 'bunker', depth: 4, note: 'front left' }],
    water: [{ c: [390, 1265], rx: 18, rz: 33 }] },
  { yds: 455, par: 5, hcp: 17, desc: 'Par 5 bending round a stand of trees', ob: 48, wind: [11, 190], stimp: 11, halfWidth: 16, firstCut: 8,
    ref: [[447, 1625], [468, 971], [393, 602], [447, 457]],      // (the app's line cuts the corner over the trees)
    path: [[447, 1625], [450, 1300], [468, 971], [545, 830], [592, 700], [585, 575], [535, 485], [447, 457]],
    stations: [[[449, 1440], 10, 10], [[450, 1380], 35, 45], [[450, 1300], 32, 65], [[458, 1150], 30, 62], [[466, 1000], 55, 60], [[505, 900], 45, 45], [[545, 830], 45, 42], [[592, 700], 45, 30], [[585, 575], 42, 35], [[535, 485], 40, 35], [[490, 468], 30, 30]],
    green: { c: [447, 457], rx: 11, rz: 13, rot: 0.3, shape: kidney(180, 0.07, 0.08) }, pinOff: [2, -3],
    surface: '{ tilt: { x: 0.005, z: -0.010 }, bumps: [{ x: 3, z: -4, amp: 3, sigma: 4 }, { x: -4, z: 5, amp: -3, sigma: 4 }] }',
    bunkers: [{ c: [420, 875], rx: 6, rz: 6, rot: 0, type: 'fbunker', depth: 3, note: 'inside the corner: guards the cut' },
      { c: [530, 1060], rx: 4.5, rz: 10, rot: 0.1, type: 'fbunker', depth: 2.5, note: 'right of the landing zone' },
      { c: [395, 455], rx: 4, rz: 4, rot: 0, type: 'bunker', depth: 3, note: 'left of the green' }],
    groves: [{ c: [483, 745], rx: 14, rz: 38, rot: 0 }] },      // the trees the hole bends round
  { yds: 327, par: 4, hcp: 7, desc: 'Carry the pond, then bend left', ob: 42, wind: [8, 240], stimp: 11.5, halfWidth: 18, firstCut: 7,
    ref: [[472, 1555], [657, 815], [467, 393]],
    path: [[472, 1555], [560, 1250], [610, 1000], [657, 815], [600, 600], [520, 470], [467, 393]],
    stations: [[[566, 1215], 10, 10], [[575, 1170], 32, 32], [[592, 1100], 32, 32],
      [[642, 868], 50, 85], [[657, 815], 67, 78], [[630, 710], 85, 72], [[600, 600], 95, 55], [[560, 535], 62, 45], [[538, 498], 30, 28], [[510, 455], 22, 22]],
    gaps: [[[598, 1085], [641, 876]]],                          // the pond
    green: { c: [467, 393], rx: 11.5, rz: 12, rot: 0, shape: kidney(-30, 0.1, 0.1) }, pinOff: [-3, 2],
    surface: '{ tilt: { x: -0.006, z: -0.012 }, bumps: [{ x: -3, z: 3, amp: 4, sigma: 4 }] }',
    bunkers: [{ c: [535, 402], rx: 3.5, rz: 4, rot: 0, type: 'bunker', depth: 3, note: 'right' },
      { c: [455, 452], rx: 4, rz: 3.5, rot: 0, type: 'bunker', depth: 3, note: 'front left' },
      { c: [640, 512], rx: 10, rz: 6, rot: 0.1, type: 'fbunker', depth: 2.5, note: 'right of the approach' }],
    water: [{ c: [660, 977], rx: 50, rz: 26 }] },                // (about 100 x 52 yds: the carry off the tee)
];
const len = (p) => { let L = 0; for (let i = 1; i < p.length; i++) L += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]); return L; };
const n1 = (v) => { const r = Math.round(v * 2) / 2; return Object.is(r, -0) ? 0 : r; }, n0 = (v) => { const r = Math.round(v); return Object.is(r, -0) ? 0 : r; };
const order = H.map((h, i) => [h.hcp, i]).sort((a, b) => a[0] - b[0]).map(([, i]) => i);          // handicap 1..17 -> stroke index 1..9
const shapeStr = (sh) => `[${sh.map(([k, a, ph]) => `[${k}, ${a}, ${n0(ph)}]`).join(', ')}]`;
const inShape = (g, x, z) => {                               // inEllipse with the shape, in yards (the pin check)
  const X = x, Y = -z, c = Math.cos(g.rot), s = Math.sin(g.rot), u = (X * c + Y * s) / g.rx, v = (-X * s + Y * c) / g.rz, th = Math.atan2(v, u);
  let R = 1; for (const [k, a, ph] of g.shape) R += a * Math.cos(k * th - ph * Math.PI / 180);
  return (u * u + v * v) / (R * R);
};
const I = '        ', out = [];
H.forEach((h, i) => {
  const s = h.yds / len(h.ref), [tx, ty] = h.tee || h.path[0];
  const P = (p) => [n0((p[0] - tx) * s), n0((p[1] - ty) * s)], g = P(h.green.c);
  if (inShape(h.green, h.pinOff[0], h.pinOff[1]) > 0.55) throw new Error(`hole ${i + 1}: the pin is too near the green's edge (${inShape(h.green, h.pinOff[0], h.pinOff[1]).toFixed(2)})`);
  const el = (o) => { const c = P(o.c); return `{ x: ${c[0]}, z: ${c[1]}, rx: ${o.rx}, rz: ${o.rz}${o.rot ? `, rot: ${o.rot}` : ''} }`; };
  const L = [];
  L.push(`${I}{`);
  L.push(`${I}  name: 'Hole ${i + 1}', par: ${h.par}, si: ${order.indexOf(i) + 1}, desc: '${h.desc}', ob: ${h.ob}, wind: { mph: ${h.wind[0]}, from: ${h.wind[1]} }, stimp: ${h.stimp},`);
  L.push(`${I}  path: [${h.path.map((p) => `[${P(p).join(', ')}]`).join(', ')}],          // ${n0(len(h.path) * s)} yds along the fairway, ${n0(Math.hypot(h.green.c[0] - tx, h.green.c[1] - ty) * s)} from tee to green`);
  L.push(`${I}  halfWidth: ${h.halfWidth}, firstCut: ${h.firstCut},`);
  L.push(`${I}  fairway: [${h.stations.map(([p, l, r]) => `[${P(p).join(', ')}, ${n1(l * s)}, ${n1(r * s)}]`).join(', ')}],`);
  if (h.gaps) L.push(`${I}  fairwayGaps: [${h.gaps.map(([a, b]) => `[[${P(a).join(', ')}], [${P(b).join(', ')}]]`).join(', ')}],`);
  L.push(`${I}  green: { x: ${g[0]}, z: ${g[1]}, rx: ${h.green.rx}, rz: ${h.green.rz}, rot: ${h.green.rot}, shape: ${shapeStr(h.green.shape)} }, pin: [${g[0] + h.pinOff[0]}, ${g[1] + h.pinOff[1]}],`);
  L.push(`${I}  greenSurface: ${h.surface},`);
  L.push(`${I}  bunkers: [`);
  for (const b of h.bunkers) { const c = P(b.c); L.push(`${I}    { x: ${c[0]}, z: ${c[1]}, rx: ${b.rx}, rz: ${b.rz}, rot: ${b.rot}, type: '${b.type}', depth: ${b.depth} },        // ${b.note}`); }
  L.push(`${I}  ],`);
  L.push(`${I}  hardpan: [], water: [${(h.water || []).map(el).join(', ')}],${h.groves ? ` groves: [${h.groves.map(el).join(', ')}],` : ''}`);
  L.push(`${I}},`);
  out.push(L.join('\n'));
  console.error(`hole ${i + 1}: ${s.toFixed(4)} yd/px · line ${n0(len(h.path) * s)} yds · tee to green ${n0(Math.hypot(h.green.c[0] - tx, h.green.c[1] - ty) * s)}`);
});
const block = `      const HOLES_T2 = [\n${out.join('\n')}\n      ];\n`;
if (process.argv.includes('--print')) { console.log(block); process.exit(0); }
const file = path.join(__dirname, '..', '..', 'index.html'), src = fs.readFileSync(file, 'utf8');
const a = src.indexOf('      const HOLES_T2 = ['), b = src.indexOf('      const HOLES_BASE = HOLES.slice();');
if (a < 0 || b < a) throw new Error('markers not found in index.html');
fs.writeFileSync(file, src.slice(0, a) + block.replace(/\n/g, src.includes('\r\n') ? '\r\n' : '\n') + src.slice(b));
console.error('HOLES_T2 written to index.html');
