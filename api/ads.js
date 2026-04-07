const { parseAuthCookie, verifyToken } = require('../lib/auth');
const db = require('../lib/db');

module.exports = async (req, res) => {
  const token = parseAuthCookie(req);
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  const payload = verifyToken(token);
  if (!payload) return res.status(401).json({ error: 'Unauthorized' });

  if (req.method === 'GET') {
    const result = await db.query('SELECT * FROM ads WHERE advertiser_id = $1 ORDER BY created_at DESC', [payload.id]);
    res.json({ ads: result.rows });
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
};
