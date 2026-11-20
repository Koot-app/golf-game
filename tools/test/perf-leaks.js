// Audit section 8: does anything pile up over a long session? Counts the three.js geometries / materials / textures
// created and freed while 36 holes are built (and played into, briefly), the scene's own size, the page's DOM size and
// the JS heap, and the same over 20 trips through the clubhouse's rooms.
//   node tools/test/probe.js http://127.0.0.1:8090/?nohome - @tools/test/perf-leaks.js 0 audit-perf
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms)), $ = (id) => document.getElementById(id);
  for (let i = 0; i < 50 && !window.__golf; i++) await sleep(200);
  const g = window.__golf, out = [];
  // three.js gives every geometry / material / texture a rising id: the highest seen = how many were ever made.
  let anyGeo = null; g.scene.traverse((o) => { if (!anyGeo && o.geometry) anyGeo = o; });
  const GP = Object.getPrototypeOf(Object.getPrototypeOf(anyGeo.geometry)).dispose ? Object.getPrototypeOf(Object.getPrototypeOf(anyGeo.geometry)) : Object.getPrototypeOf(anyGeo.geometry);
  let disposed = 0; const d0 = GP.dispose; GP.dispose = function () { disposed++; return d0.call(this); };
  const snap = () => {
    let geo = 0, mesh = 0, maxId = 0; const geos = new Set(), mats = new Set(), texs = new Set();
    g.scene.traverse((o) => { mesh++; if (o.geometry) { geos.add(o.geometry); maxId = Math.max(maxId, o.geometry.id); } const ms = o.material ? [].concat(o.material) : []; for (const m of ms) { mats.add(m); for (const k of ['map', 'alphaMap']) if (m[k]) texs.add(m[k]); } });
    return { objects: mesh, geometries: geos.size, materials: mats.size, textures: texs.size, maxGeoId: maxId, dom: document.getElementsByTagName('*').length, heapMB: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : null };
  };
  // nested objects of the hole group (the ones clearHoleGroup's top-level loop wouldn't reach)
  const nested = () => { let n = 0; g.scene.traverse((o) => { if (o.parent && o.parent.parent && o.parent !== g.scene && o.parent.parent !== g.scene && o.geometry) n++; }); return n; };
  const a = snap(), nestedA = nested();
  let made = 0, maxSeen = a.maxGeoId;
  for (let k = 0; k < 36; k++) {
    g.selectHole(k % 9); g.enterHole(); await sleep(150);
    const s = snap(); made += Math.max(0, s.maxGeoId - maxSeen); maxSeen = Math.max(maxSeen, s.maxGeoId);
  }
  g.leaveHole(); await sleep(300);
  const b = snap();
  out.push(`36 holes built: geometries made ≈ ${made} (by id), dispose() called ${disposed} times`);
  out.push(`  scene before: ${JSON.stringify(a)}`);
  out.push(`  scene after : ${JSON.stringify(b)}`);
  out.push(`  geometries nested two levels down (not reached by clearHoleGroup's top-level loop): ${nestedA} at the start`);
  // the clubhouse: open every room 20 times
  const key = (c) => window.dispatchEvent(new KeyboardEvent('keydown', { code: c, key: c, bubbles: true }));
  g.openHome(); await sleep(200); $('hmGuest').click(); await sleep(150); document.querySelector('[data-h=career]').click(); await sleep(200);
  $('chName').value = 'TESTER'; $('chCreate').click(); await sleep(300);
  const c0 = snap();
  for (let k = 0; k < 20; k++) {
    for (const room of ['shop', 'coach', 'caddie', 'trophy', 'bagroom', 'match']) {
      document.querySelector(`.ch-menu [data-go=${room}]`).click(); await sleep(40);
      key('Escape'); await sleep(30);
      if (!$('clubhouse').classList.contains('on')) { key('KeyJ'); await sleep(40); }
    }
  }
  const c1 = snap();
  out.push(`clubhouse, 120 room visits: DOM ${c0.dom} → ${c1.dom} elements · heap ${c0.heapMB} → ${c1.heapMB} MB · scene objects ${c0.objects} → ${c1.objects}`);
  // frame time on the range, the hole, and the clubhouse (rough: requestAnimationFrame intervals over 3 s)
  const fps = async (label) => { let n = 0; const t0 = performance.now(); await new Promise((r) => { const f = () => { n++; if (performance.now() - t0 < 3000) requestAnimationFrame(f); else r(); }; requestAnimationFrame(f); }); out.push(`frames: ${label} ${(n / 3).toFixed(0)} fps (headless, software GPU)`); };
  await fps('clubhouse');
  key('Escape'); await sleep(200); g.selectHole(3); g.enterHole(); await sleep(600);
  await fps('on a hole');
  return out.join('\n');
})()
