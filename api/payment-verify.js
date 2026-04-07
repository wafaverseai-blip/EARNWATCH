const Razorpay = require('razorpay');
const crypto = require('crypto');
const db = require('../lib/db');
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

  const { razorpay_order_id, razorpay_payment_id, razorpay_signature, adTitle, videoUrl, budget } = req.body;
  
  // Verify signature
  const body = razorpay_order_id + '|' + razorpay_payment_id;
  const expectedSignature = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
                                  .update(body)
                                  .digest('hex');
  if (expectedSignature !== razorpay_signature) {
    return res.status(400).json({ success: false, error: 'Invalid signature' });
  }

  // Payment verified – create ad campaign
  const targetViews = Math.floor(budget / 2); // ₹2 per view
  await db.query(
    `INSERT INTO ads (advertiser_id, title, video_url, budget, target_views, views_served) 
     VALUES ($1, $2, $3, $4, $5, 0)`,
    [payload.id, adTitle, videoUrl, budget, targetViews]
  );
  // Record transaction for advertiser payment
  await db.query(
    `INSERT INTO transactions (user_id, amount, type, description) VALUES ($1, $2, 'deposit', $3)`,
    [payload.id, budget, `Ad campaign: ${adTitle}`]
  );

  res.json({ success: true });
};
