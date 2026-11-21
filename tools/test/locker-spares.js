// THE LOCKER'S SPARE CLUBS (user request, 2026-11-21: "buying a new club replaces your old one, when it should put your
// old one in your locker"). A local career buys a driver, a wedge and an iron set in the pro shop; each old club must be
// in the locker (career.spares), swap back in free, and an iron set swaps as a whole set. Snapped stays snapped.
//   node tools/test/probe.js "http://127.0.0.1:8090/?nohome" - "@tools/test/locker-spares.js" "1" locker-spares
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms)), $ = (id) => document.getElementById(id);
  for (let i = 0; i < 50 && !window.__golf; i++) await sleep(200);
  const g = window.__golf, out = [], say = (ok, t) => out.push(`${(ok ? 'ok' : 'FAIL').padEnd(5)} ${t}`);
  window.confirm = () => true;
  $('chName').value = 'LOCK' + (Date.now() % 1e4); g.createCareer(); await sleep(500);
  const c = () => g.career, M = g.CLUB_MODELS;
  c().cash = 500000; g.careerSave();
  g.openShop(); await sleep(300);
  const tab = async (k) => { document.querySelector(`#shTabs [data-tab="${k}"]`).click(); await sleep(200); };
  const click = async (sel) => { const b = document.querySelector(sel); if (!b) return false; b.click(); await sleep(250); return true; };
  const bag0 = { ...c().bag };
  out.push(`      starting bag: ${Object.entries(bag0).map(([i, id]) => `${i}:${id}`).join(' ')}`);
  // 1. a new driver: the old one goes to the locker
  const drv = Object.keys(M).find((id) => M[id].kind === 'driver' && M[id].price > 0 && !M[id].lux && id !== bag0[0]);
  await tab('driver');
  const cash1 = c().cash;
  await click(`#shList button[data-buy="${drv}"][data-slots="0"]`);
  say(c().bag[0] === drv && c().spares.some((s) => s.i === 0 && s.id === bag0[0]) && c().cash === cash1 - M[drv].price,
    `bought ${drv}: in the bag ${c().bag[0]}, the old ${bag0[0]} in the locker ${JSON.stringify(c().spares)} · "${$('shMsg').textContent}"`);
  // the shop shows the old one as yours, in the locker, with a free swap and no buy button
  const oldItem = [...document.querySelectorAll('#shList .sh-item')].find((x) => x.querySelector(`button[data-swap="${bag0[0]}"]`));
  say(!!oldItem, `the old driver's shop card: "${oldItem ? oldItem.querySelector('.sh-name').innerText.replace(/\s+/g, ' ') : 'no swap button'}"`);
  // 2. swap it back: free, and the new one goes to the locker
  const cash2 = c().cash;
  await click(`#shList button[data-swap="${bag0[0]}"]`);
  say(c().bag[0] === bag0[0] && c().spares.some((s) => s.i === 0 && s.id === drv) && !c().spares.some((s) => s.id === bag0[0]) && c().cash === cash2,
    `swapped back: bag ${c().bag[0]}, locker ${JSON.stringify(c().spares)}, cash unchanged ${c().cash === cash2} · "${$('shMsg').textContent}"`);
  // 3. a snapped wedge replaced: in the locker snapped; swapped back, it's snapped again (repair in the shop)
  c().snapped = [12]; g.careerSave();
  const wdg = Object.keys(M).find((id) => M[id].kind === 'wedge' && M[id].price > 0 && !M[id].lux && id !== bag0[12]);
  await tab('wedge'); await click(`#shList button[data-buy="${wdg}"][data-slots="12"]`);
  const sw = c().spares.find((s) => s.i === 12);
  say(c().bag[12] === wdg && !c().snapped.includes(12) && sw && sw.snapped, `a new ${wdg} for a snapped sand wedge: the new one isn't snapped, the old one is in the locker snapped (${JSON.stringify(sw)})`);
  await click(`#shList button[data-swap="${bag0[12]}"][data-slot="12"]`);
  say(c().bag[12] === bag0[12] && c().snapped.includes(12) && !!document.querySelector('#shList button[data-repair="12"]'), `swapped the snapped one back: snapped again, with a Repair button · "${$('shMsg').textContent}"`);
  await click(`#shList button[data-swap="${wdg}"][data-slot="12"]`);
  // 4. a new iron set: the old set (5, 7, 9, PW) goes to the locker; back as a whole set, the new set's 4, 6, 8 too
  const irn = Object.keys(M).find((id) => M[id].kind === 'iron' && M[id].price > 0 && !M[id].lux && id !== bag0[7]);
  await tab('iron'); await click(`#shList button[data-buy="${irn}"]`);
  const oldSet = c().spares.filter((s) => s.id === bag0[7]).map((s) => s.i);
  say([4, 5, 6, 7, 8, 9, 10].every((i) => c().bag[i] === irn) && oldSet.join() === '5,7,9,10', `bought the ${irn} irons: 4–PW in the bag, the old set's ${oldSet.join(', ')} in the locker · carried ${g.career ? Object.keys(c().bag).filter((k) => !c().out.includes(+k)).length + 1 : '?'} · "${$('shMsg').textContent}"`);
  await click(`#shList button[data-swap="${bag0[7]}"]`);
  const ironsNow = [4, 5, 6, 7, 8, 9, 10].filter((i) => c().bag[i]).map((i) => `${i}:${c().bag[i]}`);
  const newSet = c().spares.filter((s) => s.id === irn).map((s) => s.i).sort((a, b) => a - b);
  say(ironsNow.join(' ') === [5, 7, 9, 10].map((i) => `${i}:${bag0[7]}`).join(' ') && newSet.join() === '4,5,6,7,8,9,10',
    `the old set swapped back whole: irons ${ironsNow.join(' ')}; the new set's ${newSet.join(', ')} in the locker`);
  // 5. the Your bag tab lists the spares; the locker room shows them; a reload keeps them
  await tab('bag');
  const rows = [...document.querySelectorAll('#shList .sh-row.locker')].map((r) => r.innerText.replace(/\s+/g, ' '));
  say(rows.length >= 3, `Your bag tab, spares: ${rows.map((r) => `"${r}"`).join(' · ')}`);
  g.openBagRoom(); await sleep(500);
  const spareCards = [...document.querySelectorAll('#brList .br-model.spare')].map((x) => x.querySelector('b').textContent);
  say(spareCards.length === 3, `the locker room: ${spareCards.length} spare cards (${spareCards.join(', ')}) · "${$('brSum').innerText.replace(/\s+/g, ' ')}" · ${$('brValue').textContent}`);
  // 6. selling a spare (user request, 2026-11-21): 40% of new, half if snapped, an iron set as a set; gone for good
  g.openShop(); await sleep(300); await tab('bag');
  const sellBtn = (id) => document.querySelector(`#shList button[data-sell="${id}"]`);
  const sellAt = async (id) => { const b = sellBtn(id), cash = c().cash, want = +(b.textContent.replace(/[^0-9]/g, '')); b.click(); await sleep(250); return { got: c().cash - cash, want, msg: $('shMsg').textContent }; };
  const sd = await sellAt(drv);
  say(sd.got === Math.round(M[drv].price * 0.4 / 5) * 5 && sd.got === sd.want && !c().spares.some((s) => s.id === drv), `sold the spare ${drv} (new $${M[drv].price}): +$${sd.got} · "${sd.msg}"`);
  const ss = await sellAt(bag0[12]);
  say(ss.got === 5 && !c().spares.some((s) => s.id === bag0[12]), `sold the snapped used ${bag0[12]} (not sold new): +$${ss.got}`);
  const si = await sellAt(irn);
  say(si.got === Math.round(M[irn].price * 0.4 / 5) * 5 && !c().spares.some((s) => s.id === irn), `sold the spare ${irn} set, all seven (new $${M[irn].price}): +$${si.got}`);
  say(!document.querySelector('#shList button[data-sell]') && c().bag[0] === bag0[0], `nothing left to sell; the bag's clubs never had a Sell button (driver ${c().bag[0]} still in the bag)`);
  // the used set back in, the M2 set bought again: the used set's 4 clubs sell for $5 each
  await tab('iron'); await click(`#shList button[data-buy="${irn}"]`); await tab('bag');
  const su = await sellAt(bag0[7]);
  say(su.got === 20, `sold the used ${bag0[7]} set (5, 7, 9, PW): +$${su.got}`);
  await sleep(700);                                        // (a save is written 400 ms later, audit 8.1)
  const saved = JSON.parse(localStorage.getItem(Object.keys(localStorage).find((k) => /^golfCareer/.test(k))) || '{}');
  say(Array.isArray(saved.spares) && saved.spares.length === c().spares.length, `saved with the career: ${saved.spares && saved.spares.length} spares`);
  return out.join('\n');
})()
