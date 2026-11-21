// THE ARCADE SITE (user request, 2026-11-21): backninegolf.vercel.app (the Vercel project back9golf; back9golf.vercel.app
// belongs to someone else) is the arcade on its own: nine-hole rounds on the
// three courses, the Top 10 boards, practice and the how-to-play lessons, with no career, and so no money, entry fees,
// prizes or matches anywhere in it. back9tour.vercel.app is the full game (the repo itself).
//
//   node tools/arcade/build.js             write arcade/ (commit it: it's what the arcade's Vercel project deploys)
//   node tools/arcade/build.js --check     exit 1 if arcade/ is out of date, or the page has a word it mustn't
//   node tools/arcade/build.js --lines f   write index.html's arcade version to f with the same line numbers as
//                                          index.html (the tour parts blanked, comments kept): for finding a problem
//   node tools/arcade/build.js --peek f    write the arcade page to f as built, even with words it mustn't have
//
// index.html stays the one source. Markers in it say what is the full game's only; they are comments, so the full
// game runs exactly as written:
//   /*<tour>*/ ... /*</tour>*/        JS, CSS or the api: left out of the arcade (inline, or over many lines)
//   <!--<tour>--> ... <!--</tour>-->  HTML: the same
//   /*arcade: code */                 code only the arcade has (a comment in the full game)
//   <!--arcade: html -->              the same, in HTML
// Inside a template literal a comment would be text, so there the marker goes inside a ${}:
//   ${/*<tour>*/careerOn ? `...` : /*</tour>*//*arcade:*/''}
// The build then strips every comment (they're notes for whoever works on the game), drops the CSS rules whose ids
// and classes no longer appear anywhere in the page, and scans what's left for the words the arcade must not have
// (BANNED). arcade/ also gets the tutorial pictures, the leaderboard (api/leaderboard.js, its markers applied, and
// api/_store.js) and vercel.json, so it deploys on its own: its Vercel project's Root Directory is `arcade`.
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..', '..'), OUT = path.join(ROOT, 'arcade');
const args = process.argv.slice(2), CHECK = args.includes('--check'), LINES = args.includes('--lines') ? args[args.indexOf('--lines') + 1] : null;

// ---- the markers
const S = '\u0000';                  // stands where something was taken out (a line left with only this is dropped)
const keepNl = (s) => s.replace(/[^\n]/g, '');
function markers(src, file, keepLines = false) {
  const gone = (m) => (keepLines ? keepNl(m) : S);
  let out = src;
  for (const [open, close] of [['/*<tour>*/', '/*</tour>*/'], ['<!--<tour>-->', '<!--</tour>-->']]) {
    let res = '', i = 0;
    for (;;) {
      const a = out.indexOf(open, i);
      const stray = out.indexOf(close, i);
      if (stray >= 0 && (a < 0 || stray < a)) throw new Error(`${file}: ${close} with no ${open} before it (line ${lineAt(out, stray)})`);
      if (a < 0) { res += out.slice(i); break; }
      const b = out.indexOf(close, a + open.length);
      if (b < 0) throw new Error(`${file}: ${open} never closed (line ${lineAt(out, a)})`);
      const inner = out.slice(a + open.length, b);
      if (inner.includes(open)) throw new Error(`${file}: ${open} inside another (line ${lineAt(out, a)})`);
      res += out.slice(i, a) + gone(out.slice(a, b + close.length));
      i = b + close.length;
    }
    out = res;
  }
  out = out.replace(/\/\*arcade:([\s\S]*?)\*\//g, (m, code) => code.replace(/^ /, ''));
  out = out.replace(/<!--arcade:([\s\S]*?)-->/g, (m, html) => html.replace(/^ /, ''));
  return out;
}
const lineAt = (s, k) => s.slice(0, k).split('\n').length;

// ---- the comments: HTML, CSS in <style>, JS in <script> (strings, template literals and regexes are not comments)
function stripComments(src) {
  let out = '', i = 0;
  const n = src.length;
  const take = (k) => { out += src.slice(i, k); i = k; };
  const drop = (k) => { out += S; i = k; };
  function js(endTag) {
    let prev = '(';                    // the last significant character, to tell a regex from a division
    const stack = [];                  // template literals: the brace depth their ${ opened at
    let brace = 0;
    while (i < n) {
      if (!stack.length && src.startsWith(endTag, i)) return;
      const c = src[i], d = src[i + 1];
      if (c === '/' && d === '/') { const e = src.indexOf('\n', i); drop(e < 0 ? n : e); continue; }
      if (c === '/' && d === '*') { const e = src.indexOf('*/', i + 2); drop(e + 2); continue; }
      if (c === '"' || c === "'") { let k = i + 1; while (k < n && src[k] !== c) { if (src[k] === '\\') k++; k++; } take(k + 1); prev = 'a'; continue; }
      if (c === '`') { take(i + 1); if (template() === 'expr') stack.push(brace); prev = 'a'; continue; }
      if (c === '/' && /[(,=:[!&|?{};+\-*%<>~^]$|^$/.test(prev)) {
        let k = i + 1, cls = false;
        while (k < n) { const ch = src[k]; if (ch === '\\') { k += 2; continue; } if (ch === '[') cls = true; else if (ch === ']') cls = false; else if ((ch === '/' && !cls) || ch === '\n') break; k++; }
        take(k + 1); prev = 'a'; continue;
      }
      if (c === '{') brace++;
      if (c === '}') {
        if (stack.length && brace === stack[stack.length - 1]) { stack.pop(); take(i + 1); if (template() === 'expr') stack.push(brace); prev = 'a'; continue; }
        brace--;
      }
      if (/[\w$]/.test(c)) { let k = i; while (k < n && /[\w$]/.test(src[k])) k++; const w = src.slice(i, k); take(k); prev = /^(return|typeof|case|in|of|do|else|void|yield|await)$/.test(w) ? '(' : 'a'; continue; }
      if (!/\s/.test(c)) prev = /[)\]]/.test(c) ? 'a' : c;
      take(i + 1);
    }
  }
  function template() {                // template text, up to its end (`) or a ${ (back to js until the matching })
    let k = i;
    while (k < n) {
      if (src[k] === '\\') { k += 2; continue; }
      if (src[k] === '`') { take(k + 1); return 'end'; }
      if (src[k] === '$' && src[k + 1] === '{') { take(k + 2); return 'expr'; }
      k++;
    }
    take(n); return 'end';
  }
  function css(endTag) {
    while (i < n && !src.startsWith(endTag, i)) {
      if (src.startsWith('/*', i)) { drop(src.indexOf('*/', i + 2) + 2); continue; }
      if (src[i] === '"' || src[i] === "'") { const q = src[i]; let k = i + 1; while (k < n && src[k] !== q) { if (src[k] === '\\') k++; k++; } take(k + 1); continue; }
      take(i + 1);
    }
  }
  while (i < n) {
    if (src.startsWith('<!--', i)) { drop(src.indexOf('-->', i) + 3); continue; }
    if (/^<script\b/i.test(src.slice(i, i + 7))) { take(src.indexOf('>', i) + 1); js('</script>'); continue; }
    if (/^<style\b/i.test(src.slice(i, i + 6))) { take(src.indexOf('>', i) + 1); css('</style>'); continue; }
    take(i + 1);
  }
  return out;
}
// lines left with nothing but what was taken out go; on the rest, a gap between two words (a/**/b) becomes a space so
// they stay two, and any other gap closes up (so "ones<!--<tour>-->, whatever<!--</tour>-->." reads "ones.")
const tidy = (s) => s.split('\n').filter((l) => !(l.includes(S) && !l.replace(new RegExp(S, 'g'), '').trim()))
  .map((l) => (l.includes(S) ? l.replace(new RegExp(`${S}+`, 'g'), (m, k, str) => (/[\w$]/.test(str[k - 1] || '') && /[\w$]/.test(str[k + m.length] || '') ? ' ' : '')).replace(/[ \t]+$/, '') : l)).join('\n');

// ---- the CSS nothing uses any more: a rule goes when every selector in it names an id or class the page never mentions
function purgeCss(html) {
  const styles = [];
  const rest = html.replace(/(<style\b[^>]*>)([\s\S]*?)(<\/style>)/gi, (m, a, css, b) => { styles.push(css); return a + '\u0001' + b; });
  const words = new Set(rest.match(/[A-Za-z_][\w-]*/g) || []);
  // classes made in code from a prefix: 'lie-' + x, `hm-${x}`, `n${imgs.length}` (a rule naming one is kept)
  // (not a tag's name: <tr${cls}> is a table row, not a class)
  const prefixes = [...new Set([...rest.matchAll(/(?<![\w$<\/-])([A-Za-z][\w-]*)(?:\$\{|['"]\s*\+)/g)].map((m) => m[1]))];
  const known = (t) => words.has(t) || prefixes.some((p) => t.startsWith(p));
  const dropped = [];
  const selOk = (sel) => [...sel.replace(/\[[^\]]*\]/g, '').matchAll(/[#.](-?[A-Za-z_][\w-]*)/g)].every((m) => known(m[1]));
  function block(css) {                // a list of rules (the whole sheet, or inside @media)
    let out = '', i = 0;
    const n = css.length;
    const until = (k, chars) => { let depth = 0, q = null; for (; k < n; k++) { const c = css[k]; if (q) { if (c === '\\') k++; else if (c === q) q = null; continue; } if (c === '"' || c === "'") q = c; else if (c === '(' || c === '[') depth++; else if (c === ')' || c === ']') depth--; else if (!depth && chars.includes(c)) return k; } return n; };
    const close = (k) => { let depth = 0, q = null; for (; k < n; k++) { const c = css[k]; if (q) { if (c === '\\') k++; else if (c === q) q = null; continue; } if (c === '"' || c === "'") q = c; else if (c === '{') depth++; else if (c === '}') { depth--; if (!depth) return k; } } return n; };
    while (i < n) {
      const ws = css.slice(i).match(/^\s*/)[0]; if (ws) { out += ws; i += ws.length; if (i >= n) break; }
      const head = until(i, '{;}');
      if (css[head] === ';' || css[head] === '}' || head >= n) { out += css.slice(i, Math.min(n, head + 1)); i = head + 1; continue; }
      const prelude = css.slice(i, head), end = close(head);
      const body = css.slice(head + 1, end);
      if (prelude.trim().startsWith('@')) {
        if (/^@(media|supports|container|layer)\b/.test(prelude.trim())) { const inner = block(body); if (inner.trim()) out += prelude + '{' + inner + '}'; }
        else out += css.slice(i, end + 1);           // @keyframes, @font-face: kept here (keyframes are checked below)
      } else {
        const sels = splitTop(prelude);
        const keep = sels.filter(selOk);
        for (const s of sels) if (!keep.includes(s)) dropped.push(s.trim());
        if (keep.length) out += keep.map((s) => s.trim()).join(', ') + ' {' + body + '}';
      }
      i = end + 1;
    }
    return out;
  }
  let k = 0;
  const purged = styles.map((css) => {
    let out = block(css);
    // keyframes no rule or script uses any more
    const used = new Set((out.match(/animation(?:-name)?\s*:[^;}]*/g) || []).flatMap((d) => d.split(':')[1].match(/[A-Za-z_][\w-]*/g) || []));
    out = out.replace(/@keyframes\s+([\w-]+)\s*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, (m, name) => (used.has(name) || words.has(name) ? m : (dropped.push('@keyframes ' + name), '')));
    return out;
  });
  return { html: rest.replace(/\u0001/g, () => purged[k++]), dropped };
}
function splitTop(s) { const out = []; let depth = 0, cur = ''; for (const c of s) { if (c === '(' || c === '[') depth++; if (c === ')' || c === ']') depth--; if (c === ',' && !depth) { out.push(cur); cur = ''; } else cur += c; } out.push(cur); return out.filter((x) => x.trim()); }

// ---- what the arcade must not say: every word of the page (identifiers split at their capitals too, so heldCash is
// "held" and "cash"), and a dollar sign before a number or a ${}. Golf's own "white stakes" (out of bounds) are allowed.
const BANNED = ['money', 'cash', 'prize', 'prizes', 'purse', 'fee', 'fees', 'stake', 'stakes', 'bet', 'bets', 'betting', 'wager', 'wagers', 'debt', 'debts', 'owe', 'owed', 'owes', 'owing',
  'credit', 'escrow', 'price', 'prices', 'priced', 'payout', 'payoff', 'pay', 'paid', 'pays', 'buy', 'buys', 'bought', 'sell', 'sells', 'sold', 'shark', 'loan', 'collector',
  'beating', 'dollar', 'dollars', 'casino', 'jackpot', 'wallet', 'deposit', 'winnings'];
const BANNED_START = ['hustl', 'gambl'];
const ALLOWED = [/\bwhite stakes\b/gi, /\bOB stakes\b/g];
// the full game's words: not wrong in themselves, but the arcade has none of these things, so they're listed (not failed)
const CAREER_WORDS = ['career', 'careers', 'clubhouse', 'rival', 'rivals', 'npc', 'coach', 'shop', 'locker', 'trophy', 'invitational', 'invitationals', 'tour', 'friend', 'friends',
  'profile', 'profiles', 'password', 'admin', 'skins', 'hustler'];
function scan(text) {
  let t = text; for (const a of ALLOWED) t = t.replace(a, (m) => ' '.repeat(m.length));
  const hits = [], soft = new Map();
  t.split('\n').forEach((line, li) => {
    for (const m of line.matchAll(/[A-Za-z]+/g)) {
      for (const part of m[0].split(/(?<=[a-z])(?=[A-Z])/)) {
        const w = part.toLowerCase();
        if (BANNED.includes(w) || BANNED_START.some((b) => w.startsWith(b))) hits.push(`${li + 1}: "${w}" in ${line.trim().slice(0, 160)}`);
        else if (CAREER_WORDS.includes(w)) soft.set(w, (soft.get(w) || 0) + 1);
      }
    }
    if (/\$\d|\$\$\{/.test(line)) hits.push(`${li + 1}: a dollar amount in ${line.trim().slice(0, 160)}`);
  });
  return { hits, soft };
}

// ---- the build
// (line endings as git stores them, whatever the checkout has: so a Windows checkout builds the same bytes)
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/\r\n?/g, '\n');
const src = read('index.html');
if (LINES) { fs.writeFileSync(path.resolve(LINES), markers(src, 'index.html', true)); console.log('wrote', LINES); process.exit(0); }

const GEN = (from) => `GENERATED by tools/arcade/build.js from ${from}: change that and run the build, never this file.`;
let page = tidy(stripComments(markers(src, 'index.html')));
const purge = purgeCss(page);
page = purge.html.replace(/^<!DOCTYPE html>\n?/i, `<!DOCTYPE html>\n<!-- ${GEN('index.html')} -->\n`);
const files = new Map();                // path in arcade/ -> Buffer
files.set('index.html', Buffer.from(page));
for (const f of ['leaderboard.js', '_store.js']) files.set(`api/${f}`, Buffer.from(`// ${GEN(`api/${f}`)}\n` + tidy(markers(read(`api/${f}`), `api/${f}`))));
files.set('vercel.json', Buffer.from(read('vercel.json')));
// its own .vercelignore: without one, Vercel falls back to the repo's, which leaves arcade/ out of the full game's site
files.set('.vercelignore', Buffer.from(`# ${GEN('tools/arcade/build.js')}\n# The arcade site's own (it overrides the repo's .vercelignore, which leaves arcade/ out of the full game's site)\n*.md\n`));
for (const f of fs.readdirSync(path.join(ROOT, 'tutorial'))) files.set(`tutorial/${f}`, fs.readFileSync(path.join(ROOT, 'tutorial', f)));

const { hits, soft } = scan(page);
const kb = (b) => `${Math.round(b / 1024)} KB`;
console.log(`arcade/index.html: ${kb(files.get('index.html').length)} (index.html ${kb(Buffer.byteLength(src))}); ${purge.dropped.length} unused CSS selectors dropped`);
if (soft.size) console.log('full-game words left (not an error):', [...soft].map(([w, c]) => `${w} ${c}`).join(', '));
if (hits.length) { console.log(`\n${hits.length} BANNED words in the arcade page:`); for (const h of hits.slice(0, 80)) console.log('  ' + h); if (hits.length > 80) console.log(`  ... and ${hits.length - 80} more`); }

// what's on disk now, to compare (--check) or replace
const onDisk = new Map();
(function walk(dir, rel) { if (!fs.existsSync(dir)) return; for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const r = rel ? `${rel}/${e.name}` : e.name; if (e.isDirectory()) walk(path.join(dir, e.name), r); else { const b = fs.readFileSync(path.join(dir, e.name)); onDisk.set(r, /\.(html|js|json)$/.test(r) ? Buffer.from(b.toString('utf8').replace(/\r\n?/g, '\n')) : b); } } })(OUT, '');
const stale = [...files].filter(([p, b]) => !onDisk.has(p) || !onDisk.get(p).equals(b)).map(([p]) => p).concat([...onDisk.keys()].filter((p) => !files.has(p)));
const PEEK = args.includes('--peek') ? args[args.indexOf('--peek') + 1] : null;     // (the page to a file whatever it says: to look at)
if (PEEK) { fs.writeFileSync(path.resolve(PEEK), page); console.log('wrote', PEEK); process.exit(0); }
if (CHECK) {
  if (stale.length) console.log(`\narcade/ is out of date (${stale.slice(0, 8).join(', ')}${stale.length > 8 ? ', ...' : ''}): run node tools/arcade/build.js`);
  process.exit(stale.length || hits.length ? 1 : 0);
}
if (hits.length) { console.log('\nNot written: the arcade page must have none of these.'); process.exit(1); }
for (const p of onDisk.keys()) if (!files.has(p)) fs.unlinkSync(path.join(OUT, p));
for (const [p, b] of files) { fs.mkdirSync(path.dirname(path.join(OUT, p)), { recursive: true }); if (!onDisk.has(p) || !onDisk.get(p).equals(b)) fs.writeFileSync(path.join(OUT, p), b); }
console.log(stale.length ? `wrote arcade/ (${stale.length} file${stale.length === 1 ? '' : 's'} changed)` : 'arcade/ was already up to date');
