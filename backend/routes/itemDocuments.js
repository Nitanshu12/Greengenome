const router = require("express").Router();
const path   = require("path");
const fs     = require("fs");
const multer = require("multer");
const pool   = require("../db/postgres");
const { requireLogin, requireRole } = require("../middleware/auth");

const adminOnly = [requireLogin, requireRole("admin", "superadmin")];
const superadminOnly = [requireLogin, requireRole("superadmin")];

const docStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, "../uploads/item-docs");
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + "-" + file.originalname.replace(/\s+/g, "_"));
  }
});

const uploadMiddleware = multer({
  storage: docStorage,
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if ([".pdf", ".jpg", ".jpeg", ".png"].includes(ext)) return cb(null, true);
    cb(new Error("Only PDF, JPG, PNG files are allowed"));
  },
  limits: { fileSize: 10 * 1024 * 1024 }
});

// GET /api/item-documents/:item_code
router.get("/:item_code", ...adminOnly, async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT id, document_name, document_url, created_at FROM item_documents WHERE item_code=? ORDER BY id ASC",
      [req.params.item_code]
    );
    res.json({ data: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/item-documents  (add a link)
router.post("/", ...adminOnly, async (req, res) => {
  try {
    const { item_code, document_name, document_url } = req.body;
    if (!item_code || !document_name || !document_url)
      return res.status(400).json({ error: "item_code, document_name and document_url are required" });

    await pool.query(
      "INSERT INTO item_documents (item_code, document_name, document_url) VALUES (?,?,?)",
      [item_code, document_name.trim(), document_url.trim()]
    );
    res.status(201).json({ msg: "Document added" });
  } catch (err) {
    if (err.code === "ER_NO_REFERENCED_ROW_2")
      return res.status(400).json({ error: "item_code does not exist" });
    res.status(500).json({ error: err.message });
  }
});

// POST /api/item-documents/upload  (upload a file)
router.post("/upload", ...adminOnly, uploadMiddleware.single("file"), async (req, res) => {
  try {
    const { item_code, document_name } = req.body;
    if (!item_code || !document_name || !req.file)
      return res.status(400).json({ error: "item_code, document_name and file are required" });

    const document_url = `/uploads/item-docs/${req.file.filename}`;
    await pool.query(
      "INSERT INTO item_documents (item_code, document_name, document_url) VALUES (?,?,?)",
      [item_code, document_name.trim(), document_url]
    );
    res.status(201).json({ msg: "Document uploaded", document_url });
  } catch (err) {
    if (req.file) fs.unlink(req.file.path, () => {});
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/item-documents/:id (superadmin only)
router.delete("/:id", ...superadminOnly, async (req, res) => {
  try {
    const [[doc]] = await pool.query(
      "SELECT id, document_url FROM item_documents WHERE id=?", [req.params.id]
    );
    if (!doc) return res.status(404).json({ error: "Document not found" });

    await pool.query("DELETE FROM item_documents WHERE id=?", [req.params.id]);

    // Clean up uploaded file from disk (skip for external links)
    if (doc.document_url?.startsWith("/uploads/")) {
      const filePath = path.join(__dirname, "..", doc.document_url);
      fs.unlink(filePath, () => {});
    }

    res.json({ msg: "Document deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
