// Admin profiles (user request, 2026-11-18): only the profile "Keeto" is an admin, and nobody else can get admin rights.
// The name is reserved (nobody else can sign up with it, in any capitals), and signing in as it checks the password
// against the admin credential below, never a stored one.
//
// The credential is baked in here as a scrypt salt + hash (no plain-text password), as the user chose (2026-11-19).
// The repo is public, so anyone can try to guess the password against this hash on their own computer (audit 3.8): a
// long random password is out of reach, a short one isn't. `node tools/admin-hash.js` makes a strong random password
// and prints its salt + hash to paste below (the old hash stays in the repo's history, so it has to be a new password). Optionally, the Vercel environment
// variable GOLF_ADMIN_KEETO = "<salt>:<hash>" overrides the baked-in one. Each admin session remembers which credential
// it came from (sessionId() in _redis.js), so changing the password signs out every old admin session.

const ADMINS = {
  keeto: { name: 'Keeto', salt: '61645e9b3cbc0f88c81c84e58c6c6381', hash: 'c9145863caa0db00c31eba6130b3583ffd216f279fc738964ea2efb0f98ec547' },
};
const isAdmin = (id) => Object.prototype.hasOwnProperty.call(ADMINS, String(id || '').toLowerCase());
// the admin's credential: the environment's override if set, else the baked-in one → { name, salt, hash, fp } or null
function adminCred(id, env = process.env) {
  const key = String(id || '').toLowerCase();
  if (!isAdmin(key)) return null;
  const m = /^([a-f0-9]{32}):([a-f0-9]{64})$/.exec(String(env[`GOLF_ADMIN_${key.toUpperCase()}`] || '').trim());
  const salt = m ? m[1] : ADMINS[key].salt, hash = m ? m[2] : ADMINS[key].hash;
  return salt && hash ? { name: ADMINS[key].name, salt, hash, fp: hash.slice(0, 16) } : null;
}

module.exports = { ADMINS, isAdmin, adminCred };
