const Razorpay = require('razorpay');
const { parseAuthCookie, verifyToken } = require('../lib/auth');

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const token = parseAuthCookie(req);
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  const payload = verifyToken(token);
  if (!payload) return res.status(401).json({ error: 'Unauthorized' });

  const { amount } = req.body;
  if (!amount || amount < 100) return res.status(400).json({ error: 'Minimum budget ₹100' });

  const options = {
    amount: amount * 100, // paise
    currency: 'INR',
    receipt: `rcpt_${Date.now()}`,
  };
  const order = await razorpay.orders.create(options);
  res.json({
    success: true,
    orderId: order.id,
    amount: order.amount,
    keyId: process.env.RAZORPAY_KEY_ID
  });
};
