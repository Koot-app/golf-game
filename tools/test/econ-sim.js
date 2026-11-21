// Audit section 7: what a player of a given standard can expect to earn, per match and per invitational.
//   node tools/test/probe.js http://127.0.0.1:8090/ - @tools/test/econ-sim.js 0 audit-econ
// The player is modelled like a hustler: per hole, μ over par (on that circuit's conditions) ± 0.9, with a ±0.2 form
// for the day. Match play, no presses, the hustler's own seeded scores (npcHoleScore). EV = what a match is worth on
// average at the hustler's top stake, after the green fee.
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms)), $ = (id) => document.getElementById(id);
  for (let i = 0; i < 50 && !window.__golf; i++) await sleep(200);
  localStorage.clear(); const g = window.__golf, out = [];
  $('hmGuest').click(); await sleep(150); document.querySelector('[data-h=career]').click(); await sleep(200);
  $('chName').value = 'TESTER'; $('chCreate').click(); await sleep(300);
  const pars = g.HOLES.map((h) => h.par), PAR = pars.reduce((a, b) => a + b, 0), rnd = () => (Math.random() * 2 ** 31) >>> 0;
  const gauss = () => Math.sqrt(-2 * Math.log(Math.max(1e-9, Math.random()))) * Math.cos(2 * Math.PI * Math.random());
  const player = (mu) => { const form = 0.2 * gauss(); return pars.map((p) => p + Math.max(-1, Math.min(5, Math.round(mu + form + 0.9 * gauss())))); };
  const HU = [['dale', 1, 80], ['terry', 1, 150], ['sal', 1, 200], ['gus', 1, 250], ['chad', 2, 400], ['marco', 2, 300], ['rita', 2, 500], ['jim', 2, 800], ['whit', 3, 1500], ['ana', 3, 2500], ['duke', 3, 3000], ['vic', 3, 5000]];
  const FEE = { 1: 10, 2: 60, 3: 300 }, MUS = [1.4, 1.0, 0.7, 0.4, 0.1];
  out.push('Win chance and value of a match at the top stake (after the green fee), by the player\'s average over par per hole:');
  out.push('hustler  stake    ' + MUS.map((m) => `μ +${m.toFixed(1)}`.padStart(16)).join(''));
  for (const [id, tier, stake] of HU) {
    const cells = MUS.map((mu) => {
      let w = 0, l = 0; const N = 2000;
      for (let k = 0; k < N; k++) {
        const m = { npc: id, tier, no: k + 1, salt: rnd() }, me = player(mu); let d = 0;
        for (let i = 0; i < 9; i++) { const h = g.npcHoleScore(m, i); d += me[i] < h ? 1 : me[i] > h ? -1 : 0; if (Math.abs(d) > 8 - i) break; }
        if (d > 0) w++; else if (d < 0) l++;
      }
      const ev = stake * (w - l) / N - FEE[tier];
      return `${String(Math.round(100 * w / N)).padStart(3)}% ${(ev >= 0 ? '+$' : '−$') + Math.abs(Math.round(ev))}`.padStart(16);
    });
    out.push(`${id.padEnd(8)} $${String(stake).padEnd(6)}${cells.join('')}`);
  }
  // ---- invitationals: the field is all twelve hustlers on the event's circuit (plus the event's form)
  const TOURS = [['Muni Open', 1, 250, [1500, 700, 400], 0], ['Cedar Hollow Pro-Am', 2, 1500, [9000, 4000, 2000], -0.05], ['Hawthorne Invitational', 3, 7500, [50000, 20000, 10000], -0.1], ['Hustlers\' Classic', 3, 25000, [150000, 60000, 30000], -0.2]];
  out.push('', 'Invitationals: the field\'s top three (to par, median of 2,000 events), and the value of entering by the player\'s average:');
  out.push('event                     entry   1st  2nd  3rd ' + MUS.map((m) => `μ +${m.toFixed(1)}`.padStart(12)).join(''));
  for (const [name, tier, entry, purse, form] of TOURS) {
    const tops = [[], [], []], evs = MUS.map(() => 0), N = 2000;
    for (let k = 0; k < N; k++) {
      const field = HU.map(([id]) => { const m = { npc: id, tier, no: 5000 + k, salt: rnd() }; return pars.reduce((s, _, i) => s + g.npcHoleScore(m, i), 0) - PAR + Math.round(form * 9); }).sort((a, b) => a - b);
      for (let j = 0; j < 3; j++) tops[j].push(field[j]);
      MUS.forEach((mu, x) => { const me = player(mu).reduce((a, b) => a + b, 0) - PAR, place = field.filter((f) => f < me).length; evs[x] += (purse[place] || 0) - entry; });
    }
    const med = (a) => { a.sort((x, y) => x - y); const v = a[Math.floor(a.length / 2)]; return (v > 0 ? '+' : '') + v; };
    out.push(`${name.padEnd(25)} $${String(entry).padEnd(6)} ${med(tops[0]).padStart(3)}  ${med(tops[1]).padStart(3)}  ${med(tops[2]).padStart(3)} ` + evs.map((v) => { const e = v / N; return ((e >= 0 ? '+$' : '−$') + Math.abs(Math.round(e))).padStart(12); }).join(''));
  }
  return out.join('\n');
})()
