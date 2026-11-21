// Shared by the course traces (t2-trace.js, t3-trace.js): turns a trace in screenshot pixels into a HOLES_Tn block
// and writes it into index.html between "const HOLES_Tn = [" and its "(end of HOLES_Tn ...)" line.
//
// A hole in a trace (pixels of the 923 x 2000 screenshot as displayed, except sizes given in yards):
//   yds, par, hcp, desc, ob, wind [mph, from], stimp, halfWidth, firstCut   as in HOLES
//   ref       the app's own aiming line (tee -> targets -> green): its length IS the scorecard yardage `yds`, which
//             sets the scale
//   back      yards the tee is moved straight back from the traced one (a longer set of tees)
//   path      the centre line, down the middle of the fairway
//   stations  [point on the line, left px, right px]: the fairway's half-widths there, square to the line
//   gaps      [[from point, to point], ...]: no fairway between them
//   green     { c, rx, rz, rot, shape }; pinOff [x, z] yards from its centre (+z = toward the tee)
//   surface   the greenSurface, as source text
//   bunkers   [{ c, rx, rz, rot, type, depth, note }]
//   water / groves / fescue   [{ c, rx, rz, rot }];  trees [{ c, h }] single trees, h metres tall
//   treeGap   metres between the first cut and the tree line (default 7)
const fs = require('fs'), path = require('path');
// green outlines: radius x (1 + sum amp*cos(k*theta - phase)); theta from the green's own +x (0 right, 90 the far side)
const kidney = (at, a2 = 0.08, a3 = 0.09) => [[2, -a2, (2 * at + 720) % 360], [3, -a3, (3 * at + 1080) % 360]];   // a bite out of the edge at `at` degrees
const egg = (at, a = 0.1) => [[1, -a, (at + 360) % 360], [3, a, (3 * at + 1080) % 360]];                           // the narrow end at `at`
const peanut = (a = 0.24) => [[2, -a, 0]];                                                                          // a waist across the middle
const len = (p) => { let L = 0; for (let i = 1; i < p.length; i++) L += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]); return L; };
const n1 = (v) => { const r = Math.round(v * 2) / 2; return Object.is(r, -0) ? 0 : r; }, n0 = (v) => { const r = Math.round(v); return Object.is(r, -0) ? 0 : r; };
const shapeStr = (sh) => `[${sh.map(([k, a, ph]) => `[${k}, ${a}, ${n0(ph)}]`).join(', ')}]`;
const inShape = (g, x, z) => {                               // inEllipse with the shape, in yards (the pin check)
  const X = x, Y = -z, c = Math.cos(g.rot), s = Math.sin(g.rot), u = (X * c + Y * s) / g.rx, v = (-X * s + Y * c) / g.rz, th = Math.atan2(v, u);
  let R = 1; for (const [k, a, ph] of g.shape) R += a * Math.cos(k * th - ph * Math.PI / 180);
  return (u * u + v * v) / (R * R);
};
// opts.width: every fairway half-width x this (a course set up tighter than it was traced)
function build(name, H, opts = {}) {
  const W = opts.width || 1;
  const order = H.map((h, i) => [h.hcp, i]).sort((a, b) => a[0] - b[0]).map(([, i]) => i);          // handicap 1..17 -> stroke index 1..9
  const I = '        ', out = [];
  H.forEach((h, i) => {
    const s = h.yds / len(h.ref);
    let [tx, ty] = h.path[0], pts = h.path;
    if (h.back) {                                            // the tee straight back, on the line of the first leg
      const [bx, by] = h.path[1], d = Math.hypot(tx - bx, ty - by), k = h.back / s / d;
      tx += (tx - bx) * k; ty += (ty - by) * k; pts = [[tx, ty], ...h.path.slice(1)];
    }
    const P = (p) => [n0((p[0] - tx) * s), n0((p[1] - ty) * s)], g = P(h.green.c);
    if (inShape(h.green, h.pinOff[0], h.pinOff[1]) > 0.55) throw new Error(`hole ${i + 1}: the pin is too near the green's edge (${inShape(h.green, h.pinOff[0], h.pinOff[1]).toFixed(2)})`);
    const el = (o) => { const c = P(o.c); return `{ x: ${c[0]}, z: ${c[1]}, rx: ${o.rx}, rz: ${o.rz}${o.rot ? `, rot: ${o.rot}` : ''} }`; };
    const L = [];
    L.push(`${I}{`);
    L.push(`${I}  name: 'Hole ${i + 1}', par: ${h.par}, si: ${order.indexOf(i) + 1}, desc: '${h.desc}', ob: ${h.ob}, wind: { mph: ${h.wind[0]}, from: ${h.wind[1]} }, stimp: ${h.stimp},`);
    L.push(`${I}  path: [${pts.map((p) => `[${P(p).join(', ')}]`).join(', ')}],          // ${n0(len(pts) * s)} yds along the fairway, ${n0(Math.hypot(h.green.c[0] - tx, h.green.c[1] - ty) * s)} from tee to green`);
    L.push(`${I}  halfWidth: ${W === 1 ? h.halfWidth : n1(h.halfWidth * W)}, firstCut: ${h.firstCut},${h.treeGap !== undefined ? ` treeGap: ${h.treeGap},` : ''}`);
    L.push(`${I}  fairway: [${h.stations.map(([p, l, r]) => `[${P(p).join(', ')}, ${n1(l * s * W)}, ${n1(r * s * W)}]`).join(', ')}],`);
    if (h.gaps) L.push(`${I}  fairwayGaps: [${h.gaps.map(([a, b]) => `[[${P(a).join(', ')}], [${P(b).join(', ')}]]`).join(', ')}],`);
    L.push(`${I}  green: { x: ${g[0]}, z: ${g[1]}, rx: ${h.green.rx}, rz: ${h.green.rz}, rot: ${h.green.rot}, shape: ${shapeStr(h.green.shape)} }, pin: [${g[0] + h.pinOff[0]}, ${g[1] + h.pinOff[1]}],`);
    L.push(`${I}  greenSurface: ${h.surface},`);
    L.push(`${I}  bunkers: [`);
    for (const b of h.bunkers) { const c = P(b.c); L.push(`${I}    { x: ${c[0]}, z: ${c[1]}, rx: ${b.rx}, rz: ${b.rz}, rot: ${b.rot}, type: '${b.type}', depth: ${b.depth} },        // ${b.note}`); }
    L.push(`${I}  ],`);
    L.push(`${I}  hardpan: [], water: [${(h.water || []).map(el).join(', ')}],${h.groves ? ` groves: [${h.groves.map(el).join(', ')}],` : ''}`
      + `${h.fescue ? ` fescue: [${h.fescue.map(el).join(', ')}],` : ''}${h.trees ? ` trees: [${h.trees.map((t) => { const c = P(t.c); return `{ x: ${c[0]}, z: ${c[1]}, h: ${t.h} }`; }).join(', ')}],` : ''}`);
    L.push(`${I}},`);
    out.push(L.join('\n'));
    console.error(`hole ${i + 1}: ${s.toFixed(4)} yd/px · line ${n0(len(pts) * s)} yds · tee to green ${n0(Math.hypot(h.green.c[0] - tx, h.green.c[1] - ty) * s)}`);
  });
  const start = `      const ${name} = [`, endLine = `      // (end of ${name}: generated by tools/course)`;
  const block = `${start}\n${out.join('\n')}\n      ];\n${endLine}`;
  if (process.argv.includes('--print')) { console.log(block); return; }
  const file = path.join(__dirname, '..', '..', 'index.html'), src = fs.readFileSync(file, 'utf8');
  const a = src.indexOf(start), b = src.indexOf(endLine);
  if (a < 0 || b < a) throw new Error(`markers for ${name} not found in index.html`);
  fs.writeFileSync(file, src.slice(0, a) + block.replace(/\n/g, src.includes('\r\n') ? '\r\n' : '\n') + src.slice(b + endLine.length));
  console.error(`${name} written to index.html`);
}
module.exports = { kidney, egg, peanut, build };
