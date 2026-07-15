// One-off: copies every user from the old Mongo `users` collection into the
// new MariaDB `users` table. Password hashes are copied as-is (bcrypt hashes
// are storage-format-agnostic — no re-hash, no password reset needed).
// Safe to re-run: existing usernames are updated in place, not duplicated.
require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const mongoose = require("mongoose");
const mysql = require("mysql2/promise");

const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/dashboard";

const pool = mysql.createPool({
  host:     process.env.DB_HOST     || "localhost",
  port:     process.env.DB_PORT     || 3306,
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  charset:  "utf8mb4",
  waitForConnections: true,
  connectionLimit: 5
});

async function migrate() {
  await mongoose.connect(MONGO_URI);
  console.log("✅ Connected to MongoDB");

  // .lean() bypasses schema hooks — password comes back exactly as stored (already hashed).
  const users = await mongoose.connection.collection("users").find({}).toArray();
  console.log(`📋 Found ${users.length} user(s) in MongoDB`);

  const conn = await pool.getConnection();
  try {
    let inserted = 0, updated = 0;
    for (const u of users) {
      const [result] = await conn.query(
        `INSERT INTO users (username, password_hash, role, disabled, created_at)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           password_hash = VALUES(password_hash),
           role          = VALUES(role),
           disabled      = VALUES(disabled)`,
        [
          u.username,
          u.password,
          u.role || "user",
          u.disabled ? 1 : 0,
          u.createdAt || new Date(),
        ]
      );
      if (result.affectedRows === 1) inserted++; else updated++;
    }
    console.log(`\n✅ Migration complete — ${inserted} inserted, ${updated} updated (${users.length} total)`);
  } finally {
    conn.release();
    await pool.end();
    await mongoose.disconnect();
  }
}

migrate().catch(e => { console.error("❌ Migration failed:", e.message); process.exit(1); });
