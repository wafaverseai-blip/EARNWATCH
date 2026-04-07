const db = require('../lib/db');
const bcrypt = require('bcryptjs');
const { generateToken, setAuthCookie } = require('../lib/auth');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Missing fields' });

  const result = await db.query('SELECT * FROM users WHERE email = $1', [email]);
  const user = result.rows[0];
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  const token = generateToken(user);
  setAuthCookie(res, token);
  res.status(200).json({ success: true, user: { id: user.id, email: user.email, role: user.role, balance: user.balance } });
};
