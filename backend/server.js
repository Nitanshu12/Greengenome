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
    // const User = require("./models/User");
    // const exists = await User.findOne({ username: "admin" });
    // if (!exists) {
    //   await User.create({
    //     username: "admin",
    //     password: "admin123",
    //     role: "admin"
    //   });
    //   console.log("✅ Default admin created → username: admin | password: admin123");
    }
  )
  .catch(err => {
    console.error("❌ MongoDB connection failed:", err.message);
    process.exit(1);
  });

// ── CORS allow-list (Vercel + Render, etc.) ───────────────────
// Why CORS fails: in production, if this list is empty the cors package uses
// origin:false and skips all CORS headers — the browser then blocks cross-origin
// requests from your Vercel UI with "No Access-Control-Allow-Origin".
// Set FRONTEND_URL or ALLOWED_ORIGINS on Render, or rely on the prod default below.
function parseAllowedOrigins() {
  const fromList = (process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim().replace(/\/$/, ""))
    .filter(Boolean);
  const single = (process.env.FRONTEND_URL || "").trim().replace(/\/$/, "");
  const merged = [...fromList];
  if (single && !merged.includes(single)) merged.push(single);
  const noDefault = process.env.CORS_DISABLE_DEFAULT === "1";
  if (isProd && merged.length === 0 && !noDefault) {
    merged.push("https://greengenome.vercel.app");
  }
  return merged;
}

const allowedOrigins = parseAllowedOrigins();
const crossOriginFrontend = allowedOrigins.length > 0;
const devLocalOrigins = ["http://localhost:5173", "http://localhost:3000"];

const corsOrigin =
  crossOriginFrontend
    ? (origin, cb) => {
        if (!origin) return cb(null, true);
        if (allowedOrigins.includes(origin)) return cb(null, true);
        if (!isProd && devLocalOrigins.includes(origin)) return cb(null, true);
        return cb(null, false);
      }
    : isProd
      ? false
      : devLocalOrigins;

// CORS must run before body parsers so OPTIONS preflight is answered correctly
app.use(cors({ origin: corsOrigin, credentials: true }));

// ── Middleware ────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const sessionSameSiteEnv = (process.env.SESSION_COOKIE_SAMESITE || "").toLowerCase();
const sessionSameSite =
  sessionSameSiteEnv === "none"
    ? "none"
    : sessionSameSiteEnv === "strict"
      ? "strict"
      : crossOriginFrontend && isProd
        ? "none"
        : "lax";

const sessionCookieSecure =
  sessionSameSite === "none"
    ? true
    : process.env.SESSION_COOKIE_SECURE === "false"
      ? false
      : isProd;

// Session — stored in MongoDB so it survives restarts
const sessionMw = session({
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
});

// Skip session on OPTIONS so preflight never hits Mongo/session (avoids 500s without CORS headers)
app.use((req, res, next) => {
  if (req.method === "OPTIONS") return next();
  sessionMw(req, res, next);
});

// Health check (Render / load balancers)
app.get("/health", (req, res) => {
  res.status(200).type("text").send("ok");
});

// ── API Routes ────────────────────────────────────────────────
app.use("/api/auth",  require("./routes/auth"));
app.use("/api/admin", require("./routes/admin"));
app.use("/api",       require("./routes/kits"));



// ── Global error handler ──────────────────────────────────────
app.use((err, req, res, next) => {
  console.error("Server error:", err.message);
  res.status(500).json({ error: err.message || "Internal server error" });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server listening on port ${PORT}`);
  console.log(
    `   CORS allowed origins: ${allowedOrigins.length ? allowedOrigins.join(", ") : "(none — dev localhost only)"}`
  );
});
