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
const isProd = process.env.NODE_ENV === "production";

// Render / reverse proxy — required for secure cookies and correct client IP
if (process.env.TRUST_PROXY !== "false") {
  app.set("trust proxy", 1);
}

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

// CORS — dev: Vite; prod: same-origin by default, or ALLOWED_ORIGINS if frontend is elsewhere
const allowedOrigins = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const corsOrigin =
  isProd && allowedOrigins.length > 0
    ? (origin, cb) => {
        if (!origin) return cb(null, true);
        if (allowedOrigins.includes(origin)) return cb(null, true);
        return cb(null, false);
      }
    : isProd
      ? false
      : ["http://localhost:5173", "http://localhost:3000"];

app.use(cors({ origin: corsOrigin, credentials: true }));

const sessionSameSite =
  process.env.SESSION_COOKIE_SAMESITE === "none"
    ? "none"
    : process.env.SESSION_COOKIE_SAMESITE === "strict"
      ? "strict"
      : "lax";

const sessionCookieSecure =
  sessionSameSite === "none"
    ? true
    : process.env.SESSION_COOKIE_SECURE === "false"
      ? false
      : isProd;

// Session — stored in MongoDB so it survives restarts
app.use(session({
  secret: process.env.SESSION_SECRET || "change-me-in-production",
  resave: false,
  saveUninitialized: false,
  name: "sid",
  store: MongoStore.create({ mongoUrl: MONGO_URI }),
  cookie: {
    httpOnly: true,
    secure: sessionCookieSecure,
    sameSite: sessionSameSite,
    maxAge: 1000 * 60 * 60 * 24 * 7  // 7 days
  }
}));

// Health check (Render / load balancers)
app.get("/health", (req, res) => {
  res.status(200).type("text").send("ok");
});

// ── API Routes ────────────────────────────────────────────────
app.use("/api/auth",  require("./routes/auth"));
app.use("/api/admin", require("./routes/admin"));
app.use("/api",       require("./routes/kits"));

// ── Serve React build in production ──────────────────────────
if (isProd) {
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

app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server listening on port ${PORT}`);
});
