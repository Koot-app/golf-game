// Make a new admin password's salt + hash. Run it on your own PC:
//
//   node tools/admin-hash.js            makes a strong random password for you (audit 3.8), shown once, here only
//   node tools/admin-hash.js --type     lets you type your own instead (hidden as you type)
//   (add a profile id to either, e.g. "node tools/admin-hash.js keeto"; keeto is the default)
//
// It prints the salt and hash to paste into api/_admins.js (the baked-in credential), and the same as a GOLF_ADMIN_KEETO
// line if you'd rather keep it in the Vercel project's environment variables instead (that one overrides the baked-in
// one). Never the password itself in any file. Why a strong one: the repo is public, so anyone can try to guess the
// password against the hash on their own computer, as fast as they like; a short or common password falls to that.
// (The hash already in the repo's history stays there, so the fix is a NEW password, not just a new hash.)

const crypto = require('crypto');
const readline = require('readline');

const args = process.argv.slice(2), typeOwn = args.includes('--type');
const id = String(args.find((a) => !a.startsWith('--')) || 'keeto').toLowerCase();

function finish(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  crypto.scrypt(pw, salt, 32, (e, key) => {
    if (e) { console.error(e); process.exit(1); }
    const hash = key.toString('hex');
    console.log(`\nIn api/_admins.js, give ${id} this salt and hash:\n\n  salt: '${salt}', hash: '${hash}'\n`
      + `\nOr instead, as a Vercel environment variable (then redeploy):\n\n  GOLF_ADMIN_${id.toUpperCase()}=${salt}:${hash}\n`
      + '\nOnce it\'s live, every old admin session is signed out; sign in with the new password.\n');
  });
}

if (!typeOwn) {
  // 24 characters from 54 that are easy to read and type (no 0/O, 1/l/I): about 138 bits, out of reach of guessing
  const abc = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const pick = () => abc[crypto.randomInt(abc.length)];
  const pw = Array.from({ length: 4 }, () => Array.from({ length: 6 }, pick).join('')).join('-');
  console.log(`\nYour new password for "${id}" (shown once: save it in your password manager now):\n\n  ${pw}\n`);
  finish(pw);
} else {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  let hidden = false;
  rl._writeToOutput = (s) => { rl.output.write(hidden ? (s.includes('\n') ? '\n' : '') : s); };
  rl.question(`New password for "${id}" (16+ characters, hidden): `, (pw) => {
    hidden = false;
    rl.close();
    if (!pw) { console.log('\nNo password typed.'); process.exit(1); }
    if (pw.length < 16) console.log('\n(Short passwords can be guessed against a hash in a public repo: 16+ random characters is much safer.)');
    finish(pw);
  });
  hidden = true;
}
