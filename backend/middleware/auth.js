// Middleware: user must be logged in
function requireLogin(req, res, next) {
  if (!req.session || !req.session.user) {
    return res.status(401).json({ error: "Login required" });
  }
  if (req.session.user.disabled) {
    req.session.destroy();
    return res.status(403).json({ error: "Account disabled" });
  }
  next();
}

// Middleware: user must have one of the given roles
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.session || !req.session.user) {
      return res.status(401).json({ error: "Login required" });
    }
    if (!roles.includes(req.session.user.role)) {
      return res.status(403).json({ error: "Access denied" });
    }
    next();
  };
}

module.exports = { requireLogin, requireRole };
