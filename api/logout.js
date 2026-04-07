const cookie = require('cookie');

module.exports = (req, res) => {
  res.setHeader('Set-Cookie', cookie.serialize('token', '', {
    httpOnly: true,
    expires: new Date(0),
    path: '/'
  }));
  res.status(200).json({ success: true });
};
