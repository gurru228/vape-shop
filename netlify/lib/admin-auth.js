// The admin password check for the old (v1, CommonJS) admin functions: constant-time compare, and a wrong
// password is answered only after a pause, so guessing it from a script is slow. Same rule as adminOk in shop.mjs.
const { createHash, timingSafeEqual } = require('crypto');

function adminOk(pw) {
  const want = process.env.ADMIN_PASSWORD;
  if (!want || typeof pw !== 'string') return false;
  return timingSafeEqual(createHash('sha256').update(pw).digest(), createHash('sha256').update(want).digest());
}
const denied = () => new Promise(ok => setTimeout(() => ok({ statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) }), 1200));
const parse = s => { try { return JSON.parse(s || '{}'); } catch (e) { return {}; } };

module.exports = { adminOk, denied, parse };
