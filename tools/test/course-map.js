// A contact sheet of a course's nine holes, drawn with the game's own map code (drawHoleCourse), tee at the bottom as
// in the GPS screenshots the tier 2 course was traced from: for checking a trace by eye.
//   node tools/test/probe.js "http://127.0.0.1:8090/?nohome" t2-map @tools/test/course-map.js "window.__tier = 2" map
// (window.__tier: a TIERS key, or none for the plain holes; window.__only = i draws hole i alone, large)
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 50 && !window.__golf; i++) await sleep(200);
  const g = window.__golf, YD = 0.9144, out = [];
  if (window.__tier) g.setCourse(window.__tier);
  const cv = document.createElement('canvas'), W = innerWidth, H = innerHeight;
  cv.width = W; cv.height = H; cv.style.cssText = 'position:fixed;left:0;top:0;z-index:99999';
  document.body.appendChild(cv);
  const c = cv.getContext('2d'); c.fillStyle = '#10141a'; c.fillRect(0, 0, W, H);
  const list = window.__only !== undefined ? [window.__only] : [...Array(g.HOLES.length).keys()];
  const cols = list.length === 1 ? 1 : 9, cw = W / cols, ch = H;
  list.forEach((i, k) => {
    const h = g.holeGeom(i), b = h.bounds;
    // the map code lays the hole on its side (tee at the left); turn the cell so the tee is at the bottom
    const T = g.makeMapTransform(b.u0, b.u1, b.v0, b.v1, ch - 30, cw - 8);
    c.save(); c.translate(k * cw + 4, ch - 4); c.rotate(-Math.PI / 2);
    c.beginPath(); c.rect(0, 0, ch - 30, cw - 8); c.clip();
    g.drawHoleCourse(c, T.X, T.Y, T.k, ch - 30, cw - 8, h);
    c.fillStyle = '#ff3b3b'; c.beginPath(); c.arc(T.X(h.pin.x, h.pin.z), T.Y(h.pin.x, h.pin.z), 3, 0, 7); c.fill();
    c.restore();
    c.fillStyle = '#fff'; c.font = 'bold 14px sans-serif'; c.fillText(`${i + 1} · par ${g.HOLES[i].par}`, k * cw + 8, 18);
    out.push(`hole ${i + 1}: ${(h.length / YD).toFixed(0)} yds along the line`);
  });
  await sleep(600);
  return out.join(' · ');
})()
