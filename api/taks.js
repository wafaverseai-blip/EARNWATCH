const { parseAuthCookie, verifyToken } = require('../lib/auth');
const db = require('../lib/db');

// GET: serve a random ad that still needs views
module.exports = async (req, res) => {
  const token = parseAuthCookie(req);
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  const payload = verifyToken(token);
  if (!payload) return res.status(401).json({ error: 'Unauthorized' });

  if (req.method === 'GET') {
    // Find an active ad that hasn't reached target views
    const adResult = await db.query(
      `SELECT id, title, video_url, target_views, views_served 
       FROM ads 
       WHERE views_served < target_views 
       ORDER BY random() LIMIT 1`
    );
    if (adResult.rows.length === 0) {
      return res.json({ success: false, error: 'No ads available' });
    }
    const ad = adResult.rows[0];
    // Create a task record
    const task = await db.query(
      `INSERT INTO tasks (user_id, ad_id, status) VALUES ($1, $2, 'started') RETURNING id`,
      [payload.id, ad.id]
    );
    res.json({
      success: true,
      taskId: task.rows[0].id,
      videoUrl: ad.video_url,
      title: ad.title
    });
  } 
  else if (req.method === 'POST') {
    // User claims completion after 30 sec
    const { taskId } = req.body;
    if (!taskId) return res.status(400).json({ error: 'Missing taskId' });
    
    // Check task exists, not already credited, belongs to user, and time condition
    const taskRes = await db.query(
      `SELECT t.*, a.target_views, a.views_served, a.advertiser_id 
       FROM tasks t JOIN ads a ON t.ad_id = a.id 
       WHERE t.id = $1 AND t.user_id = $2`,
      [taskId, payload.id]
    );
    const task = taskRes.rows[0];
    if (!task) return res.status(400).json({ error: 'Invalid task' });
    if (task.status === 'completed') return res.status(400).json({ error: 'Already credited' });
    
    // In production, we'd verify the 30s via a client-generated timestamp + server check.
    // For simplicity, we trust the client timer. (We'll add anti‑fraud note later.)
    
    await db.query('BEGIN');
    // Update task
    await db.query(`UPDATE tasks SET status = 'completed', completed_at = NOW() WHERE id = $1`, [taskId]);
    // Increment user balance
    await db.query(`UPDATE users SET balance = balance + 1 WHERE id = $1`, [payload.id]);
    // Increment ad views_served
    await db.query(`UPDATE ads SET views_served = views_served + 1 WHERE id = $1`, [task.ad_id]);
    // Record transaction (user earning)
    await db.query(
      `INSERT INTO transactions (user_id, amount, type, description) VALUES ($1, $2, 'earning', $3)`,
      [payload.id, 1, `Ad view reward for ad #${task.ad_id}`]
    );
    await db.query('COMMIT');
    
    res.json({ success: true });
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
};
