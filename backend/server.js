require("dotenv").config();
const express = require("express");
const session = require("express-session");
const MySQLStore = require("express-mysql-session")(session);
const cors = require("cors");
const path = require("path");
const pool = require("./db/postgres");

const app = express();
const PORT = process.env.PORT || 4000;
const isProd = process.env.NODE_ENV === "production";

// Render / reverse proxy — required for secure cookies and correct client IP
if (process.env.TRUST_PROXY !== "false") {
  app.set("trust proxy", 1);
}

app.use((req, res, next) => {
    if (req.url === '/' || req.url.endsWith('.html')) {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
    }
    next();
});


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
    merged.push("https://infoboard.greengenome.in");
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
      : sessionSameSiteEnv === "lax"
        ? "lax"
        : crossOriginFrontend && isProd
          ? "none"
          : "lax";

const sessionCookieSecure =
  sessionSameSite === "none"
    ? true
    : process.env.SESSION_COOKIE_SECURE === "false"
      ? false
      : isProd;

// Session — stored in MariaDB (same pool as everything else) so it survives
// restarts, and so every request's session check is a local query instead of
// a round trip to a separate database.
const sessionStore = new MySQLStore({}, pool);
sessionStore.onReady().catch(err => {
  console.error("❌ Session store failed to initialize:", err.message);
});

const sessionMw = session({
  secret: process.env.SESSION_SECRET || "change-me-in-production",
  resave: false,
  saveUninitialized: false,
  name: "sid",
  store: sessionStore,
  cookie: {
    httpOnly: true,
    secure: sessionCookieSecure,
    sameSite: sessionSameSite,
    maxAge: 1000 * 60 * 60 * 24 * 7  // 7 days
  }
});

// Skip session on OPTIONS so preflight never hits the session store (avoids 500s without CORS headers)
app.use((req, res, next) => {
  if (req.method === "OPTIONS") return next();
  sessionMw(req, res, next);
});


// Health check (Render / load balancers)
app.get("/health", (req, res) => {
  res.status(200).type("text").send("ok");
});

// ── MariaDB schema bootstrap ──────────────────────────────────
require("./db/initSchema")().catch(err => {
  console.error("Schema init error:", err.message || err.code || err);
});

// ── API Routes ────────────────────────────────────────────────
app.use("/api/auth",    require("./routes/auth"));
app.use("/api/admin",   require("./routes/admin"));
app.use("/api/items",   require("./routes/items"));
app.use("/api/vendors",      require("./routes/vendors"));
app.use("/api/item-vendors",   require("./routes/itemVendors"));
app.use("/api/item-documents",  require("./routes/itemDocuments"));
app.use("/api/batch-documents", require("./routes/batchDocuments"));
app.use("/api/bom-disaster",   require("./routes/bomDisaster"));
app.use("/api/stock-batches",  require("./routes/stockBatches"));
app.use("/api/kit-assembly",      require("./routes/kitAssembly"));
app.use("/api/purchase-orders",  require("./routes/purchaseOrders"));
app.use("/api/sub-kits",         require("./routes/subKits"));
app.use("/api/kit-box-template", require("./routes/kitBoxTemplate"));
app.use("/api/outward",          require("./routes/outward"));
app.use("/api/inventory-transactions", require("./routes/inventoryTransactions"));
app.use("/api",                  require("./routes/kits"));



// ── Serve uploaded files (vendor docs, etc.) ────────────────
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// ── Serve React frontend (production) ────────────────────────
if (isProd) {
  const distPath = path.join(__dirname, "../frontend/dist");
  // Serve JS/CSS/images with long cache (hashed filenames make it safe)
  // index: false so index.html is NOT served here — it goes to the fallback below
  app.use(express.static(distPath, { maxAge: "7d", etag: true, index: false }));
  // SPA fallback — always serve index.html with no-cache so browsers never
  // hold a stale copy that points to old JS bundles
  app.get("*", (req, res) => {
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
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
  console.log(
    `   CORS allowed origins: ${allowedOrigins.length ? allowedOrigins.join(", ") : "(none — dev localhost only)"}`
  );
});
