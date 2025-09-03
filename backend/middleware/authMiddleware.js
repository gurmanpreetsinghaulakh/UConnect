const jwt = require('jsonwebtoken');

module.exports = function (req, res, next) {
  const token = req.cookies?.token || req.header('Authorization')?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ ok:false, message: "No token, authorization denied" });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded.user; // {_id, role}
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ ok:false, message: "Token expired, please login again" });
    }
    res.status(401).json({ ok:false, message: "Token is not valid" });
  }
};
