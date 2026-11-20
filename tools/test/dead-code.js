// Audit section 9: names defined in index.html (functions, consts, lets), CSS ids/classes, and TUNE keys that nothing
// else uses. A name used only where it's defined is a candidate for removal (check each by hand: a name built from
// strings, e.g. `data-go=${room}` or classList.add(view), won't show up as a use).
//   node tools/test/dead-code.js
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', '..', 'index.html'), 'utf8');
const js = src.slice(src.indexOf('<script type="module">'));
const css = src.slice(src.indexOf('<style>'), src.indexOf('</style>'));
const html = src.slice(src.indexOf('</style>'), src.indexOf('<script type="module">'));
const count = (text, name) => (text.match(new RegExp(`(?<![\\w$.])${name.replace(/\$/g, '\\$')}(?![\\w$])`, 'g')) || []).length;
const out = [];
// ---- JS names
const defs = new Set();
for (const m of js.matchAll(/(?:^|\n)\s*(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/g)) defs.add(m[1]);
for (const m of js.matchAll(/(?:^|\n)\s*(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=/g)) defs.add(m[1]);
const exported = (js.match(/window\.__golf = \{([\s\S]*?)\n\s*\};/) || ['', ''])[1];
const unusedJs = [...defs].filter((n) => count(js, n) - count(exported, n) <= 1).sort();
out.push(`JS: ${defs.size} top-level-looking names; used only where defined (or only by the test hook window.__golf): ${unusedJs.length}`);
out.push('  ' + unusedJs.join(', '));
// ---- element ids in the HTML that nothing references
const ids = [...html.matchAll(/\sid="([\w-]+)"/g)].map((m) => m[1]);
const unusedIds = ids.filter((id) => !js.includes(`'${id}'`) && !js.includes(`"${id}"`) && !js.includes(`#${id}`) && !css.includes(`#${id}`) && !html.includes(`for="${id}"`) && !html.includes(`#${id}`));
out.push('', `HTML ids not used by the script or the CSS: ${unusedIds.length}`, '  ' + unusedIds.join(', '));
// ---- CSS classes never used in the HTML or the script
const classes = new Set([...css.matchAll(/\.([a-zA-Z][\w-]*)/g)].map((m) => m[1]).filter((c) => !/^(on|\d)/.test(c) || c.length > 2));
const unusedCls = [...classes].filter((c) => !new RegExp(`[\\s"'\`.]${c}(?![\\w-])`).test(html + js)).sort();
out.push('', `CSS classes not found in the HTML or the script: ${unusedCls.length}`, '  ' + unusedCls.join(', '));
// ---- TUNE keys never read
const tuneBody = (js.match(/const TUNE = \{([\s\S]*?)\n\s{6}\};/) || ['', ''])[1];
const tuneKeys = [...tuneBody.matchAll(/(?:^|[\s,{])([a-zA-Z]\w*)\s*:/g)].map((m) => m[1]);
const unusedTune = [...new Set(tuneKeys)].filter((k) => !new RegExp(`TUNE\\.${k}\\b`).test(js) && !new RegExp(`['"]${k}['"]`).test(js));
out.push('', `TUNE keys never read as TUNE.<key>: ${unusedTune.length}`, '  ' + unusedTune.join(', '));
console.log(out.join('\n'));
