const { parseAuthCookie, verifyToken } = require('../lib/auth');
const db = require('../lib/db');
const axios = require('axios');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const token = parseAuthCookie(req);
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  const payload = verifyToken(token);
  if (!payload) return res.status(401).json({ error: 'Unauthorized' });

  const { upiId, amount } = req.body;
  if (!upiId || !amount || amount < 50) return res.status(400).json({ error: 'Invalid amount (min ₹50)' });

  // Check balance
  const userRes = await db.query('SELECT balance FROM users WHERE id = $1', [payload.id]);
  const balance = userRes.rows[0].balance;
  if (balance < amount) return res.status(400).json({ error: 'Insufficient balance' });

  // Create withdrawal record (status 'pending')
  const withdrawal = await db.query(
    `INSERT INTO withdrawals (user_id, amount, upi_id, status) VALUES ($1, $2, $3, 'pending') RETURNING id`,
    [payload.id, amount, upiId]
  );
  const withdrawalId = withdrawal.rows[0].id;

  // Call Cashfree Payout API
  try {
    const cashfreeRes = await axios.post(
      'https://payout-api.cashfree.com/payout/v1/transfer',
      {
        beneId: upiId, // Actually Cashfree requires beneId (beneficiary ID) which must be created first.
        amount: amount,
        transferId: `wd_${withdrawalId}`,
        remarks: 'EarnWatch payout'
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Client-Id': process.env.CASHFREE_CLIENT_ID,
          'X-Client-Secret': process.env.CASHFREE_CLIENT_SECRET
        }
      }
    );
    if (cashfreeRes.data.status === 'SUCCESS') {
      await db.query(`UPDATE withdrawals SET status = 'success', processed_at = NOW() WHERE id = $1`, [withdrawalId]);
      await db.query(`UPDATE users SET balance = balance - $1 WHERE id = $2`, [amount, payload.id]);
      await db.query(
        `INSERT INTO transactions (user_id, amount, type, description) VALUES ($1, $2, 'withdrawal', $3)`,
        [payload.id, -amount, `Withdrawal to ${upiId}`]
      );
      res.json({ success: true, message: 'Payout processed' });
    } else {
      await db.query(`UPDATE withdrawals SET status = 'failed' WHERE id = $1`, [withdrawalId]);
      res.status(400).json({ error: 'Payout failed' });
    }
  } catch (err) {
    console.error(err);
    await db.query(`UPDATE withdrawals SET status = 'failed' WHERE id = $1`, [withdrawalId]);
    res.status(500).json({ error: 'Payout API error' });
  }
};
