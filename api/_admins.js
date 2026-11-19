// Admin profiles (user request, 2026-11-18): only the profile "Keeto" is an admin, and nobody else can get admin rights.
// The name is reserved (nobody else can sign up with it, in any capitals), and signing in as it checks the password
// against the admin credential, never a stored one.
//
// The credential lives in the Vercel project's environment, NOT in this file (the repo is public, and a hash in a public
// repo can be cracked if the password is short): GOLF_ADMIN_KEETO = "<salt>:<hash>" (scrypt, 32 bytes, hex), made with
// `node tools/admin-hash.js`. Until it's set, nobody can sign in as Keeto. Changing it signs out every admin session made
// with the old one (each admin session remembers which credential it came from: see sessionId() in _redis.js).

const ADMINS = {
  keeto: { name: 'Keeto' },
};
const isAdmin = (id) => Object.prototype.hasOwnProperty.call(ADMINS, String(id || '').toLowerCase());
// the admin's credential from the environment: { name, salt, hash, fp } or null (not set up / malformed)
function adminCred(id, env = process.env) {
  const key = String(id || '').toLowerCase();
  if (!isAdmin(key)) return null;
  const m = /^([a-f0-9]{32}):([a-f0-9]{64})$/.exec(String(env[`GOLF_ADMIN_${key.toUpperCase()}`] || '').trim());
  return m ? { ...ADMINS[key], salt: m[1], hash: m[2], fp: m[2].slice(0, 16) } : null;
}

module.exports = { ADMINS, isAdmin, adminCred };
