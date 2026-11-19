// Make a new admin password's salt + hash. Run it on your own PC:
//
//   node tools/admin-hash.js            (for the profile "keeto")
//
// Type the new password (it isn't shown, and it never leaves your PC). It prints the salt and hash to paste into
// api/_admins.js (the baked-in credential), and the same as a GOLF_ADMIN_KEETO line if you'd rather keep it in the
// Vercel project's environment variables instead (that one overrides the baked-in one). Never the password itself.
// A long password (12+ characters) is much safer: the repo is public, and a short password's hash can be cracked.

const crypto = require('crypto');
const readline = require('readline');

const id = String(process.argv[2] || 'keeto').toLowerCase();
const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
let hidden = false;
rl._writeToOutput = (s) => { rl.output.write(hidden ? (s.includes('\n') ? '\n' : '') : s); };

rl.question(`New password for "${id}" (12+ characters, hidden): `, (pw) => {
  hidden = false;
  rl.close();
  if (!pw) { console.log('\nNo password typed.'); process.exit(1); }
  if (pw.length < 12) console.log('\n(Short passwords can be cracked from a public repo: 12+ characters is much safer.)');
  const salt = crypto.randomBytes(16).toString('hex');
  crypto.scrypt(pw, salt, 32, (e, key) => {
    if (e) { console.error(e); process.exit(1); }
    const hash = key.toString('hex');
    console.log(`\nIn api/_admins.js, give ${id} this salt and hash:\n\n  salt: '${salt}', hash: '${hash}'\n`
      + `\nOr instead, as a Vercel environment variable (then redeploy):\n\n  GOLF_ADMIN_${id.toUpperCase()}=${salt}:${hash}\n`);
  });
});
hidden = true;
