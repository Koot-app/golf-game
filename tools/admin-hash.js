// Make the admin credential for the server's environment. Run it on your own PC:
//
//   node tools/admin-hash.js            (for the profile "keeto")
//
// Type the new password (it isn't shown, and it never leaves your PC); it prints a line like
//   GOLF_ADMIN_KEETO=<salt>:<hash>
// Put that in the Vercel project: Settings → Environment Variables → name GOLF_ADMIN_KEETO, value <salt>:<hash>
// (Production, and Preview if you use it), then redeploy. Only the salt and hash go to Vercel, never the password.
// Use a long password (12+ characters): it's the only thing standing between anyone and the admin profile.

const crypto = require('crypto');
const readline = require('readline');

const id = String(process.argv[2] || 'keeto').toLowerCase();
const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
let hidden = false;
rl._writeToOutput = (s) => { rl.output.write(hidden ? (s.includes('\n') ? '\n' : '') : s); };

rl.question(`New password for "${id}" (12+ characters, hidden): `, (pw) => {
  hidden = false;
  rl.close();
  if (pw.length < 12) { console.log('\nToo short: use at least 12 characters.'); process.exit(1); }
  const salt = crypto.randomBytes(16).toString('hex');
  crypto.scrypt(pw, salt, 32, (e, key) => {
    if (e) { console.error(e); process.exit(1); }
    console.log(`\nAdd this to the Vercel project's environment variables, then redeploy:\n\nGOLF_ADMIN_${id.toUpperCase()}=${salt}:${key.toString('hex')}\n`);
  });
});
hidden = true;
