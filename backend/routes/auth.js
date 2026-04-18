const router = require("express").Router();
const User = require("../models/User");

// POST /api/auth/login
router.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password)
      return res.status(400).json({ error: "Username and password required" });

    const user = await User.findOne({ username: username.trim() });

    if (!user) return res.status(401).json({ error: "Invalid credentials" });
    if (user.disabled) return res.status(403).json({ error: "Account disabled" });

    const match = await user.comparePassword(password);
    if (!match) return res.status(401).json({ error: "Invalid credentials" });

    // Save to session
    req.session.user = {
      id: user._id,
      username: user.username,
      role: user.role,
      disabled: user.disabled
    };

    res.json({
      msg: "Logged in",
      user: { username: user.username, role: user.role }
    });

  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// POST /api/auth/logout
router.post("/logout", (req, res) => {
  req.session.destroy(() => {
    res.json({ msg: "Logged out" });
  });
});

// GET /api/auth/me  — check who is logged in
router.get("/me", (req, res) => {
  if (!req.session || !req.session.user) {
    return res.status(401).json({ error: "Not logged in" });
  }
  res.json({ user: req.session.user });
});

module.exports = router;
