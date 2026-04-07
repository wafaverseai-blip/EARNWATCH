const { parseAuthCookie, verifyToken } = require('../lib/auth');
const db = require('../lib/db');

module.exports = async (req, res) => {
  const token = parseAuthCookie(req);
  if (!token) return res.json({ user: null });
  const payload = verifyToken(token);
  if (!payload) return res.json({ user: null });
  const result = await db.query('SELECT id, email, role, balance FROM users WHERE id = $1', [payload.id]);
  res.json({ user: result.rows[0] || null });
};
