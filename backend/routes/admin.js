const router = require("express").Router();
const multer = require("multer");
const XLSX = require("xlsx");
const path = require("path");
const fs = require("fs");
const User = require("../models/User");
const { KitItem, KitFile } = require("../models/Kit");
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

// ── Helper: normalize header names ───────────────────────────
function colVal(row, ...keys) {
  for (const k of keys) {
    const found = Object.keys(row).find(
      h => h.trim().toUpperCase() === k.toUpperCase()
    );
    if (found && row[found] !== null && row[found] !== undefined) {
      return String(row[found]).trim();
    }
  }
  return "";
}

function parseDate(val) {
  if (!val) return "";
  try {
    const d = new Date(val);
    if (isNaN(d.getTime())) return String(val);
    return d.toISOString().split("T")[0];
  } catch {
    return String(val);
  }
}

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

      // Parse Excel
      const wb = XLSX.readFile(req.file.path);
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });

      if (!rows.length) return res.status(400).json({ error: "Excel file is empty" });

      // Delete old data for this kit
      await KitItem.deleteMany({ kitName });
      await KitFile.deleteOne({ kitName });

      // Insert new rows
      const items = rows.map((row, i) => ({
        kitName,
        rowNo: i + 1,
        cube:     colVal(row, "CUBE"),
        box:      colVal(row, "BOX"),
        items:    colVal(row, "ITEMS"),
        brand:    colVal(row, "BRAND"),
        oem:      colVal(row, "OEM"),
        itemType: colVal(row, "TYPE", "ITEM TYPE"),
        expiry:   parseDate(colVal(row, "EXPIRY")),
        batchNo:  colVal(row, "BATCH", "BATCH NO"),
        document: colVal(row, "DOC", "DOCUMENT"),
        link:     colVal(row, "LINK"),
        uploadedBy: req.session.user.id
      }));

      await KitItem.insertMany(items);

      // Track the file record
      await KitFile.create({
        kitName,
        originalFile: req.file.originalname,
        storedFile: req.file.filename,
        rowCount: rows.length,
        uploadedBy: req.session.user.id
      });

      res.json({ msg: `Uploaded ${rows.length} rows for kit "${kitName}"`, rows: rows.length });

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
    const kits = await KitFile.find().sort({ createdAt: -1 }).populate("uploadedBy", "username");
    res.json({ data: kits });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ════════════════════════════════════════════════════════════
// DELETE KIT
// DELETE /api/admin/kits/:kitName
// ════════════════════════════════════════════════════════════
router.delete("/kits/:kitName", requireLogin, requireRole("admin", "superadmin"), async (req, res) => {
  try {
    const kitName = decodeURIComponent(req.params.kitName);

    const kitFile = await KitFile.findOneAndDelete({ kitName });

    // Delete physical file
    if (kitFile && kitFile.storedFile) {
      const filePath = path.join(__dirname, "../uploads", kitFile.storedFile);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }

    await KitItem.deleteMany({ kitName });

    res.json({ msg: `Kit "${kitName}" deleted` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ════════════════════════════════════════════════════════════
// USER MANAGEMENT
// ════════════════════════════════════════════════════════════

// GET /api/admin/users
router.get("/users", requireLogin, requireRole("admin", "superadmin"), async (req, res) => {
  try {
    const users = await User.find({}, "-password").sort({ createdAt: -1 });
    res.json({ data: users });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/users
router.post("/users", requireLogin, requireRole("admin", "superadmin"), async (req, res) => {
  try {
    const { username, password, role } = req.body;
    if (!username || !password) return res.status(400).json({ error: "Username & password required" });

    const exists = await User.findOne({ username });
    if (exists) return res.status(400).json({ error: "User already exists" });

    const user = await User.create({ username, password, role: role || "user" });
    res.json({ msg: "User created", user: { id: user._id, username: user.username, role: user.role } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/admin/users/:id
router.delete("/users/:id", requireLogin, requireRole("admin", "superadmin"), async (req, res) => {
  try {
    if (req.params.id === req.session.user.id.toString())
      return res.status(400).json({ error: "Cannot delete yourself" });

    await User.findByIdAndDelete(req.params.id);
    res.json({ msg: "User deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/admin/users/:id/toggle
router.patch("/users/:id/toggle", requireLogin, requireRole("admin", "superadmin"), async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: "User not found" });
    user.disabled = !user.disabled;
    await user.save();
    res.json({ msg: `User ${user.disabled ? "disabled" : "enabled"}`, disabled: user.disabled });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/admin/users/:id/password
router.patch("/users/:id/password", requireLogin, requireRole("admin", "superadmin"), async (req, res) => {
  try {
    const { password } = req.body;
    if (!password) return res.status(400).json({ error: "Password required" });
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: "User not found" });
    user.password = password; // pre-save hook will hash it
    await user.save();
    res.json({ msg: "Password reset" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
