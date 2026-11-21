// The tier 3 course, Hawthorne Country Club (HOLES_T3 in index.html): the hardest of the three (user request,
// 2026-11-20). Traced from the user's GPS-app screenshots of a real tree-lined parkland front nine, with the hole
// details from the course guide they supplied (bunkers, green shapes and slopes, the maple on 3, the creek on 7, the
// fescue off the 9th tee). The trace is in screenshot pixels; trace-lib.js explains the fields.
//   node tools/course/t3-trace.js          (rewrites HOLES_T3 in index.html)
//   node tools/course/t3-trace.js --print  (prints it instead)
// yds is the yardage of the tees in the screenshots (it sets the scale); back moves each tee to the back tees, so the
// course plays 3,329 yds. hcp is the guide's handicap. The real course's hills are not modelled (the ground is flat).
// Bunker depths are before the tier's x1.3 (TIERS[3].bunkerDepth).
const { kidney, egg, peanut, build } = require('./trace-lib');
const H = [
  { yds: 363, back: 3, par: 4, hcp: 5, desc: 'Straight par 4 to a green wrapped in sand', ob: 40, wind: [10, 30], stimp: 11.5, halfWidth: 15, firstCut: 5, treeGap: 3,
    ref: [[410, 1532], [413, 940], [456, 383]],
    path: [[410, 1532], [432, 1300], [420, 1000], [419, 900], [422, 700], [432, 500], [456, 383]],
    stations: [[[433, 1300], 55, 57], [[424, 1150], 58, 62], [[420, 1000], 58, 60], [[419, 900], 60, 58], [[421, 800], 56, 54], [[424, 700], 50, 46], [[428, 600], 44, 40], [[433, 500], 38, 37], [[442, 440], 30, 32], [[450, 410], 22, 24]],
    green: { c: [456, 383], rx: 12.5, rz: 12, rot: 0, shape: kidney(40, 0.04, 0.05) }, pinOff: [-3, 2],
    surface: '{ tilt: { x: -0.006, z: -0.015 }, bumps: [{ x: 4, z: -3, amp: 3, sigma: 4 }, { x: -4, z: 4, amp: -3, sigma: 4 }] }',      // back to front, left to right
    bunkers: [{ c: [478, 320], rx: 11, rz: 4.5, rot: 0.1, type: 'bunker', depth: 4, note: 'the sweeping bunker: round the back' },
      { c: [525, 360], rx: 5, rz: 10, rot: -0.2, type: 'bunker', depth: 4.5, note: 'the sweeping bunker: down the right side' },
      { c: [553, 312], rx: 3.5, rz: 3.5, rot: 0, type: 'bunker', depth: 3, note: 'tucked behind it, back right' }] },
  { yds: 350, back: 5, par: 4, hcp: 13, desc: 'Short and tight, bending left to a two-tier green', ob: 36, wind: [8, 280], stimp: 12, halfWidth: 15, firstCut: 5, treeGap: 2,
    ref: [[476, 1537], [648, 802], [466, 391]],
    path: [[476, 1537], [545, 1380], [588, 1240], [612, 1100], [630, 1000], [640, 900], [647, 802], [637, 700], [605, 600], [560, 500], [520, 440], [466, 391]],
    stations: [[[588, 1240], 48, 48], [[612, 1100], 50, 51], [[630, 1000], 52, 52], [[640, 900], 53, 53], [[647, 802], 55, 55], [[637, 700], 54, 54], [[605, 600], 48, 48], [[560, 500], 42, 42], [[522, 442], 30, 30], [[497, 417], 20, 20]],
    green: { c: [466, 391], rx: 10, rz: 17.5, rot: 0.89, shape: peanut(0.14) }, pinOff: [-6, -5],                                       // long, angled away to the left
    surface: '{ tilt: { x: 0.008, z: -0.004 }, tiers: [{ x: 0, z: 0, ang: -2.46, rise: 6, width: 5 }], bumps: [{ x: 3, z: 5, amp: -3, sigma: 4 }] }',      // two tiers (the back one higher), right to left
    bunkers: [{ c: [462, 470], rx: 9, rz: 7, rot: 0.2, type: 'bunker', depth: 4.5, note: 'front left, the large one' },
      { c: [448, 322], rx: 9, rz: 3.5, rot: 0.15, type: 'bunker', depth: 4, note: 'along the right edge' },
      { c: [520, 362], rx: 5, rz: 6, rot: -0.6, type: 'bunker', depth: 4, note: 'back right' }] },
  { yds: 358, back: 16, par: 4, hcp: 9, desc: 'Dogleg right round the maple and the cross bunkers', ob: 42, wind: [10, 250], stimp: 11.5, halfWidth: 18, firstCut: 5, treeGap: 3,
    ref: [[341, 1510], [221, 832], [461, 410]],
    path: [[341, 1510], [262, 1250], [235, 1160], [230, 1000], [228, 832], [262, 745], [330, 660], [400, 575], [445, 500], [461, 410]],
    stations: [[[236, 1160], 60, 60], [[232, 1080], 65, 66], [[230, 1000], 66, 62], [[229, 900], 66, 56], [[228, 832], 64, 66], [[262, 745], 66, 64], [[330, 660], 66, 62], [[400, 575], 62, 56], [[440, 510], 50, 46], [[452, 470], 32, 32]],
    green: { c: [461, 410], rx: 10.5, rz: 16, rot: 0, shape: egg(-90, 0.06) }, pinOff: [2, -5],
    surface: '{ tilt: { x: -0.004, z: -0.017 }, bumps: [{ x: -3, z: -4, amp: 3, sigma: 4 }, { x: 4, z: 5, amp: -3, sigma: 4 }] }',      // steeply back to front
    bunkers: [{ c: [350, 835], rx: 7, rz: 9, rot: -0.5, type: 'fbunker', depth: 3, note: 'cross bunker on the corner, the first' },
      { c: [410, 772], rx: 5, rz: 8, rot: -0.5, type: 'fbunker', depth: 3, note: 'cross bunker on the corner, the second' },
      { c: [400, 438], rx: 4.5, rz: 13, rot: 0.1, type: 'bunker', depth: 4.5, note: 'left of the green, long and deep' },
      { c: [530, 432], rx: 4.5, rz: 11.5, rot: -0.25, type: 'bunker', depth: 4.5, note: 'right of the green, long and deep' },
      { c: [556, 572], rx: 6, rz: 9, rot: 0.2, type: 'fbunker', depth: 3, note: 'short right of the green' }],
    trees: [{ c: [300, 952], h: 24 }] },                         // the solo maple: play left of it, or take on the corner
  { yds: 451, back: 5, par: 5, hcp: 7, desc: 'Short par 5 bending left to a saddle green ringed with sand', ob: 42, wind: [9, 200], stimp: 12, halfWidth: 16, firstCut: 5, treeGap: 3,
    ref: [[476, 1563], [622, 930], [515, 518], [456, 391]],
    path: [[476, 1563], [515, 1440], [543, 1340], [568, 1200], [588, 1100], [605, 1000], [615, 930], [615, 800], [602, 700], [575, 600], [532, 518], [495, 455], [456, 391]],
    stations: [[[543, 1340], 40, 40], [[568, 1200], 42, 42], [[588, 1100], 42, 42], [[605, 1000], 44, 44], [[615, 930], 48, 48], [[615, 800], 48, 48], [[602, 700], 50, 50], [[575, 600], 50, 50], [[532, 518], 46, 46], [[498, 460], 34, 20], [[475, 425], 22, 14]],
    green: { c: [456, 391], rx: 10, rz: 18.5, rot: 0.43, shape: peanut(0.2) }, pinOff: [-3, -6],
    surface: '{ tilt: { x: 0, z: -0.006 }, bumps: [{ x: -7, z: 0, amp: 5, sigma: 4.5 }, { x: 7, z: 0, amp: 5, sigma: 4.5 }, { x: 0, z: -10, amp: -4, sigma: 5 }, { x: 0, z: 10, amp: -4, sigma: 5 }] }',      // a saddle
    bunkers: [{ c: [690, 902], rx: 5.5, rz: 8.5, rot: 0, type: 'fbunker', depth: 3, note: 'right edge of the landing zone' },
      { c: [438, 452], rx: 5, rz: 5, rot: 0, type: 'bunker', depth: 3.5, note: 'front left' },
      { c: [507, 442], rx: 4.5, rz: 6, rot: 0.4, type: 'bunker', depth: 4.5, note: 'front right: the one to avoid' },
      { c: [502, 385], rx: 4, rz: 7, rot: 0.4, type: 'bunker', depth: 4, note: 'right' }] },
  { yds: 394, back: 8, par: 4, hcp: 11, desc: 'Narrow chute curving left to a big tilted green', ob: 36, wind: [12, 340], stimp: 12, halfWidth: 14, firstCut: 5, treeGap: 2,
    ref: [[407, 1527], [535, 878], [451, 397]],
    path: [[407, 1527], [445, 1330], [472, 1185], [490, 1100], [512, 1000], [538, 878], [547, 800], [540, 700], [522, 600], [505, 500], [488, 450], [451, 397]],
    stations: [[[472, 1185], 40, 41], [[490, 1100], 42, 43], [[512, 1000], 44, 45], [[538, 878], 45, 47], [[547, 800], 45, 46], [[540, 700], 43, 43], [[522, 600], 40, 40], [[505, 500], 38, 38], [[488, 452], 30, 30], [[470, 425], 20, 20]],
    green: { c: [451, 397], rx: 15, rz: 13.5, rot: 0, shape: kidney(-125, 0.05, 0.06) }, pinOff: [4, -3],
    surface: '{ tilt: { x: 0.010, z: -0.016 }, bumps: [{ x: -5, z: 2, amp: 3, sigma: 5 }] }',      // steeply back to front and right to left
    bunkers: [{ c: [438, 458], rx: 6.5, rz: 7.5, rot: 0.2, type: 'bunker', depth: 4.5, note: 'front left, the big one' }] },
  { yds: 187, back: 36, par: 3, hcp: 15, desc: 'Long par 3 to a green falling hard to the front', ob: 38, wind: [10, 20], stimp: 12.5, halfWidth: 13, firstCut: 5, treeGap: 3,
    ref: [[502, 1385], [459, 420]],
    path: [[502, 1385], [495, 1100], [490, 960], [486, 700], [480, 550], [459, 420]],
    stations: [[[490, 960], 68, 72], [[488, 900], 72, 76], [[486, 700], 74, 78], [[482, 550], 70, 74], [[476, 490], 52, 58], [[470, 465], 32, 38]],
    green: { c: [459, 420], rx: 9.5, rz: 13, rot: 0.48, shape: egg(-90, 0.06) }, pinOff: [-2, -3],
    surface: '{ tilt: { x: 0.011, z: -0.019 }, bumps: [{ x: 2, z: 4, amp: -2, sigma: 4 }] }',      // very steeply back to front, right to left
    bunkers: [{ c: [370, 355], rx: 5.5, rz: 5, rot: 0, type: 'bunker', depth: 4.5, note: 'left, the back lobe' },
      { c: [366, 468], rx: 5.5, rz: 6, rot: 0, type: 'bunker', depth: 4.5, note: 'left, the front lobe' },
      { c: [520, 345], rx: 4.5, rz: 10, rot: 0.6, type: 'bunker', depth: 5, note: 'right, running back' },
      { c: [555, 405], rx: 6, rz: 5.5, rot: 0, type: 'bunker', depth: 4.5, note: 'front right' }] },
  { yds: 554, back: 6, par: 5, hcp: 1, desc: 'The long par 5: a narrowing lay-up, then over the creek', ob: 40, wind: [11, 170], stimp: 11.5, halfWidth: 16, firstCut: 5, treeGap: 3,
    ref: [[477, 1782], [355, 1155], [433, 682], [459, 298]],      // (the tee is below the screenshot: 233 yds back from the first target)
    path: [[477, 1782], [430, 1560], [382, 1420], [372, 1300], [355, 1155], [360, 1000], [372, 900], [388, 800], [408, 682], [412, 600], [415, 520], [425, 480], [440, 400], [459, 298]],
    stations: [[[382, 1420], 50, 51], [[372, 1300], 51, 52], [[355, 1155], 54, 54], [[360, 1000], 50, 50], [[372, 900], 47, 47], [[388, 800], 42, 42], [[408, 682], 37, 37], [[412, 600], 34, 34], [[415, 520], 31, 31], [[424, 483], 26, 24],
      [[441, 396], 20, 20], [[450, 350], 18, 18]],
    gaps: [[[425, 479], [441, 398]]],                           // the creek and the tall grass in front of the green
    green: { c: [459, 298], rx: 12, rz: 17, rot: 0, shape: egg(-90, 0.04) }, pinOff: [2, -6],
    surface: '{ tilt: { x: 0.002, z: -0.003 }, tiers: [{ x: 0, z: 1, ang: -Math.PI / 2, rise: 8, width: 9 }], bumps: [{ x: -5, z: 6, amp: -2, sigma: 4 }] }',      // flat at the back, then down to the front
    bunkers: [{ c: [418, 1075], rx: 5, rz: 7.5, rot: 0.1, type: 'fbunker', depth: 3, note: 'right edge of the landing zone' }],
    water: [{ c: [432, 440], rx: 26, rz: 3, rot: 0.15 }],        // the creek across the fairway
    fescue: [{ c: [432, 442], rx: 30, rz: 9, rot: 0.15 }] },     // the tall grass either side of it
  { yds: 146, back: 5, par: 3, hcp: 17, desc: 'Short par 3 to a sliver of green pinched by sand', ob: 34, wind: [9, 60], stimp: 12.5, halfWidth: 12, firstCut: 5, treeGap: 3,
    ref: [[487, 1368], [454, 455]],
    path: [[487, 1368], [478, 1100], [468, 835], [460, 700], [452, 600], [462, 468]],
    stations: [[[468, 835], 12, 12], [[465, 800], 60, 58], [[460, 700], 95, 95], [[456, 640], 88, 88], [[452, 605], 50, 52]],
    green: { c: [462, 468], rx: 6, rz: 17.5, rot: -0.17, shape: [[3, 0.04, 90]] }, pinOff: [0, -5],            // very narrow, 35 yds deep
    surface: '{ tilt: { x: 0.002, z: -0.014 }, bumps: [{ x: 0, z: -6, amp: 2, sigma: 4 }, { x: 1, z: 7, amp: -2, sigma: 4 }] }',
    bunkers: [{ c: [388, 405], rx: 4.5, rz: 11, rot: -0.3, type: 'bunker', depth: 5, note: 'left, the long one' },
      { c: [350, 545], rx: 7, rz: 9, rot: 0.3, type: 'bunker', depth: 4.5, note: 'left, its lower lobe' },
      { c: [540, 478], rx: 4.5, rz: 8, rot: -0.2, type: 'bunker', depth: 5, note: 'right' }],
    water: [{ c: [532, 292], rx: 12, rz: 6 }],                   // the pond over the back, to the right
    fescue: [{ c: [462, 305], rx: 16, rz: 7 }] },                // and thick brush straight over the back
  { yds: 413, back: 29, par: 4, hcp: 3, desc: 'Long par 4 over the fescue, into the wind, to a rolling green', ob: 40, wind: [14, 0], stimp: 12, halfWidth: 15, firstCut: 5, treeGap: 3,
    ref: [[467, 1537], [491, 975], [464, 453]],
    path: [[467, 1537], [485, 1170], [491, 975], [487, 800], [483, 600], [478, 520], [464, 453]],
    stations: [[[487, 1172], 38, 40], [[490, 1100], 44, 44], [[491, 975], 50, 52], [[488, 800], 47, 46], [[485, 700], 44, 44], [[483, 600], 42, 41], [[479, 520], 38, 39], [[474, 495], 26, 28]],
    green: { c: [464, 453], rx: 12.5, rz: 15.5, rot: 0, shape: kidney(170, 0.05, 0.07) }, pinOff: [3, -4],
    surface: '{ tilt: { x: 0.003, z: -0.010 }, bumps: [{ x: -5, z: -5, amp: 5, sigma: 3.5 }, { x: 5, z: -2, amp: -4, sigma: 3.5 }, { x: -3, z: 5, amp: -4, sigma: 3.5 }, { x: 5, z: 7, amp: 4, sigma: 3.5 }, { x: 0, z: 0, amp: 3, sigma: 3 }] }',      // heavily undulating
    bunkers: [{ c: [415, 492], rx: 11, rz: 5, rot: 0.15, type: 'bunker', depth: 4.5, note: 'front left, across the corner' },
      { c: [412, 442], rx: 3.5, rz: 6.5, rot: 0, type: 'bunker', depth: 3, note: 'left (small, so shallower)' },
      { c: [522, 445], rx: 6.5, rz: 9, rot: 0.2, type: 'bunker', depth: 4.5, note: 'right' },
      { c: [490, 390], rx: 6.5, rz: 5, rot: -0.3, type: 'bunker', depth: 4, note: 'back right' }],
    fescue: [{ c: [478, 1345], rx: 24, rz: 44 }] },              // low fescue to carry off the tee
];
// (width: the fairways are set up at 0.78 of the traced width. As traced they averaged 35 yds across in the landing
// zone, wider than the muni's 31; the hardest course should have the tightest: about 27.)
build('HOLES_T3', H, { width: 0.78 });
