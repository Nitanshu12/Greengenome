const router = require("express").Router();
const multer = require("multer");
const XLSX = require("xlsx");
const path = require("path");
const fs = require("fs");
const User = require("../models/User");
const { KitFile } = require("../models/Kit");
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

      const prev = await KitFile.findOne({ kitName });
      if (prev && prev.storedFile) {
        const oldPath = path.join(__dirname, "../uploads", prev.storedFile);
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      }

      await KitFile.deleteOne({ kitName });

      const mapped = sheetJsonToKitData(rawRows);
      const summaryStats = summarizeKitData(mapped);

      await KitFile.create({
        kitName,
        originalFile: req.file.originalname,
        storedFile: req.file.filename,
        rowCount: rawRows.length,
        uploadedBy: req.session.user.id,
        summaryStats: {
          brandCounts: summaryStats.brandCounts,
          expired: summaryStats.expired,
          warning: summaryStats.warning
        },
        data: mapped
      });

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

    if (kitFile && kitFile.storedFile) {
      const filePath = path.join(__dirname, "../uploads", kitFile.storedFile);
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
