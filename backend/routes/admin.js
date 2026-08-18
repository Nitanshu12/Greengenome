const router = require("express").Router();
const multer = require("multer");
const XLSX = require("xlsx");
const path = require("path");
const fs = require("fs");
const bcrypt = require("bcryptjs");
const pool = require("../db/postgres");
const { sheetJsonToKitData, summarizeKitData } = require("../utils/kitExcel");
const { requireLogin, requireRole } = require("../middleware/auth");

// ── Multer setup ──────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, "../uploads");
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const safe = Date.now() + "-" + file.originalname.replace(/\s/g, "_");
    cb(null, safe);
  }
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if ([".xlsx", ".xls", ".csv"].includes(ext)) cb(null, true);
    else cb(new Error("Only Excel/CSV files allowed"));
  },
  limits: { fileSize: 20 * 1024 * 1024 } // 20MB
});

// ════════════════════════════════════════════════════════════
// EXCEL UPLOAD
// POST /api/admin/upload-excel
// ════════════════════════════════════════════════════════════
router.post(
  "/upload-excel",
  requireLogin,
  requireRole("admin", "superadmin"),
  upload.single("file"),
  async (req, res) => {
    try {
      const kitName = (req.body.kit_name || "").trim();
      if (!kitName) return res.status(400).json({ error: "Kit name required" });
      if (!req.file) return res.status(400).json({ error: "File required" });

      const wb = XLSX.readFile(req.file.path);
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rawRows = XLSX.utils.sheet_to_json(ws, { defval: "" });

      if (!rawRows.length) return res.status(400).json({ error: "Excel file is empty" });

      const [[prev]] = await pool.query(
        "SELECT stored_file FROM kit_files WHERE kit_name = ?", [kitName]
      );
      if (prev && prev.stored_file) {
        const oldPath = path.join(__dirname, "../uploads", prev.stored_file);
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      }

      await pool.query("DELETE FROM kit_files WHERE kit_name = ?", [kitName]);

      const mapped = sheetJsonToKitData(rawRows);
      const summaryStats = summarizeKitData(mapped);

      await pool.query(
        `INSERT INTO kit_files
           (kit_name, original_file, stored_file, row_count, uploaded_by, brand_counts, expired_count, warning_count, data)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          kitName,
          req.file.originalname,
          req.file.filename,
          rawRows.length,
          req.session.user.id,
          JSON.stringify(summaryStats.brandCounts),
          summaryStats.expired,
          summaryStats.warning,
          JSON.stringify(mapped),
        ]
      );

      res.json({ msg: `Uploaded ${rawRows.length} rows for kit "${kitName}"`, rows: rawRows.length });
    } catch (err) {
      console.error("Upload error:", err);
      res.status(500).json({ error: err.message });
    }
  }
);

// ════════════════════════════════════════════════════════════
// LIST UPLOADED KITS (with file info)
// GET /api/admin/kits
// ════════════════════════════════════════════════════════════
router.get("/kits", requireLogin, requireRole("admin", "superadmin"), async (req, res) => {
  try {
    const [kits] = await pool.query(
      `SELECT kf.id AS _id, kf.kit_name AS kitName, kf.original_file AS originalFile,
              kf.stored_file AS storedFile, kf.row_count AS rowCount, kf.created_at AS createdAt,
              u.username AS uploadedByUsername
       FROM kit_files kf
       LEFT JOIN users u ON u.id = kf.uploaded_by
       ORDER BY kf.created_at DESC`
    );
    res.json({ data: kits });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ════════════════════════════════════════════════════════════
// DELETE KIT
// DELETE /api/admin/kits/:kitName
// ════════════════════════════════════════════════════════════
router.delete("/kits/:kitName", requireLogin, requireRole("superadmin"), async (req, res) => {
  try {
    const kitName = decodeURIComponent(req.params.kitName);

    const [[kitFile]] = await pool.query(
      "SELECT stored_file FROM kit_files WHERE kit_name = ?", [kitName]
    );
    await pool.query("DELETE FROM kit_files WHERE kit_name = ?", [kitName]);

    if (kitFile && kitFile.stored_file) {
      const filePath = path.join(__dirname, "../uploads", kitFile.stored_file);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }

    res.json({ msg: `Kit "${kitName}" deleted` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ════════════════════════════════════════════════════════════
// USER MANAGEMENT
// ════════════════════════════════════════════════════════════

// GET /api/admin/users — the whole Users screen is superadmin-only now, not
// just create/delete, so this (and toggle/password below) moved off the
// shared admin+superadmin gate too.
router.get("/users", requireLogin, requireRole("superadmin"), async (req, res) => {
  try {
    const [users] = await pool.query(
      "SELECT id AS _id, username, role, disabled, created_at AS createdAt FROM users ORDER BY created_at DESC"
    );
    res.json({ data: users });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/users — creating an account means granting one of the
// three roles, so only superadmin can do it (keeps admin from being able to
// hand itself/anyone else a superadmin account and route around the delete
// restriction below).
router.post("/users", requireLogin, requireRole("superadmin"), async (req, res) => {
  try {
    const { username, password, role } = req.body;
    if (!username || !password) return res.status(400).json({ error: "Username & password required" });

    const [[exists]] = await pool.query("SELECT id FROM users WHERE username = ?", [username]);
    if (exists) return res.status(400).json({ error: "User already exists" });

    const passwordHash = await bcrypt.hash(password, 10);
    const [result] = await pool.query(
      "INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)",
      [username, passwordHash, role || "user"]
    );
    res.json({ msg: "User created", user: { id: result.insertId, username, role: role || "user" } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/admin/users/:id
router.delete("/users/:id", requireLogin, requireRole("superadmin"), async (req, res) => {
  try {
    if (req.params.id === req.session.user.id.toString())
      return res.status(400).json({ error: "Cannot delete yourself" });

    await pool.query("DELETE FROM users WHERE id = ?", [req.params.id]);
    res.json({ msg: "User deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/admin/users/:id/toggle
router.patch("/users/:id/toggle", requireLogin, requireRole("superadmin"), async (req, res) => {
  try {
    const [[user]] = await pool.query("SELECT disabled FROM users WHERE id = ?", [req.params.id]);
    if (!user) return res.status(404).json({ error: "User not found" });

    const newDisabled = user.disabled ? 0 : 1;
    await pool.query("UPDATE users SET disabled = ? WHERE id = ?", [newDisabled, req.params.id]);
    res.json({ msg: `User ${newDisabled ? "disabled" : "enabled"}`, disabled: !!newDisabled });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/admin/users/:id/password
router.patch("/users/:id/password", requireLogin, requireRole("superadmin"), async (req, res) => {
  try {
    const { password } = req.body;
    if (!password) return res.status(400).json({ error: "Password required" });

    const [[user]] = await pool.query("SELECT id FROM users WHERE id = ?", [req.params.id]);
    if (!user) return res.status(404).json({ error: "User not found" });

    const passwordHash = await bcrypt.hash(password, 10);
    await pool.query("UPDATE users SET password_hash = ? WHERE id = ?", [passwordHash, req.params.id]);
    res.json({ msg: "Password reset" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
