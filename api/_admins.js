// Admin profiles, baked into the code (user request, 2026-11-18). The name is reserved: nobody else can sign up with
// it, and signing in checks the password against this hash (scrypt, the same as every profile), never the stored one.
// The first sign-in creates the profile if it doesn't exist yet. Admin rights themselves come later; isAdmin(id) is
// what they'll check.
//
// Only a hash is stored here, not the password. A short password can still be guessed from its hash, so before admin
// rights can do anything that matters, use a longer password (regenerate: node -e "const c=require('crypto');
// const s=c.randomBytes(16).toString('hex');c.scrypt('NEW PASSWORD',s,32,(e,k)=>console.log(s,k.toString('hex')))").

const ADMINS = {
  keeto: { name: 'Keeto', salt: '61645e9b3cbc0f88c81c84e58c6c6381', hash: 'c9145863caa0db00c31eba6130b3583ffd216f279fc738964ea2efb0f98ec547' },
};
const isAdmin = (id) => Object.prototype.hasOwnProperty.call(ADMINS, String(id || '').toLowerCase());

module.exports = { ADMINS, isAdmin };
