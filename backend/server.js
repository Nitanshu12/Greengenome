require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const session = require("express-session");
const MongoStore = require("connect-mongo");
const cors = require("cors");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 4000;
const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/dashboard";

// ── Connect MongoDB ───────────────────────────────────────────
mongoose.connect(MONGO_URI)
  .then(async () => {
    console.log("✅ MongoDB connected");

    // Seed default admin on first run
    const User = require("./models/User");
    const exists = await User.findOne({ username: "admin" });
    if (!exists) {
      await User.create({
        username: "admin",
        password: "admin123",
        role: "admin"
      });
      console.log("✅ Default admin created → username: admin | password: admin123");
    }
  })
  .catch(err => {
    console.error("❌ MongoDB connection failed:", err.message);
    process.exit(1);
  });

// ── Middleware ────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS — allow Vite dev server and same-origin production
app.use(cors({
  origin: process.env.NODE_ENV === "production"
    ? false  // same origin in production (Nginx handles it)
    : ["http://localhost:5173", "http://localhost:3000"],
  credentials: true
}));

// Session — stored in MongoDB so it survives restarts
app.use(session({
  secret: process.env.SESSION_SECRET || "change-me-in-production",
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({ mongoUrl: MONGO_URI }),
  cookie: {
    httpOnly: true,
    secure: false,      // set true if using HTTPS
    maxAge: 1000 * 60 * 60 * 24 * 7  // 7 days
  }
}));

// ── API Routes ────────────────────────────────────────────────
app.use("/api/auth",  require("./routes/auth"));
app.use("/api/admin", require("./routes/admin"));
app.use("/api",       require("./routes/kits"));

// ── Serve React build in production ──────────────────────────
if (process.env.NODE_ENV === "production") {
  const distPath = path.join(__dirname, "../frontend/dist");
  app.use(express.static(distPath));

  // All other routes → React app
  app.get("*", (req, res) => {
    res.sendFile(path.join(distPath, "index.html"));
  });
}

// ── Global error handler ──────────────────────────────────────
app.use((err, req, res, next) => {
  console.error("Server error:", err.message);
  res.status(500).json({ error: err.message || "Internal server error" });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
