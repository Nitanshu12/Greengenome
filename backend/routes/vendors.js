const router = require("express").Router();
const pool = require("../db/postgres");
const { requireLogin, requireRole } = require("../middleware/auth");

const adminOnly = [requireLogin, requireRole("admin", "superadmin")];
const superadminOnly = [requireLogin, requireRole("superadmin")];

// GET /api/vendors — list all vendors
router.get("/", ...adminOnly, async (req, res) => {
  try {
    const { q = "" } = req.query;
    const params = [];
    let where = "";
    if (q) {
      params.push(`%${q.trim()}%`, `%${q.trim()}%`, `%${q.trim()}%`);
      where = `WHERE (vendor_code LIKE ? OR business_name LIKE ? OR contact_person LIKE ?)`;
    }
    const [rows] = await pool.query(
      `SELECT id, vendor_code, business_name, address, email, phone, contact_person
       FROM vendors
       ${where}
       ORDER BY vendor_code ASC`,
      params
    );
    res.json({ data: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/vendors — add a new vendor
router.post("/", ...adminOnly, async (req, res) => {
  try {
    const { vendor_code, business_name, address, email, phone, contact_person } = req.body;

    if (!vendor_code || !business_name) {
      return res.status(400).json({ error: "vendor_code and business_name are required" });
    }

    const [result] = await pool.query(
      `INSERT INTO vendors (vendor_code, business_name, address, email, phone, contact_person)
       VALUES (?,?,?,?,?,?)`,
      [vendor_code.trim(), business_name.trim(), address || null, email || null, phone || null, contact_person || null]
    );
    const [[vendor]] = await pool.query("SELECT * FROM vendors WHERE id = ?", [result.insertId]);
    res.status(201).json({ msg: "Vendor added", data: vendor });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") {
      return res.status(400).json({ error: "Vendor code already exists" });
    }
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/vendors/:id — update a vendor
router.put("/:id", ...adminOnly, async (req, res) => {
  try {
    const { vendor_code, business_name, address, email, phone, contact_person } = req.body;

    if (!vendor_code || !business_name) {
      return res.status(400).json({ error: "vendor_code and business_name are required" });
    }

    const [result] = await pool.query(
      `UPDATE vendors SET vendor_code=?, business_name=?, address=?, email=?, phone=?, contact_person=? WHERE id=?`,
      [vendor_code.trim(), business_name.trim(), address || null, email || null, phone || null, contact_person || null, req.params.id]
    );
    if (result.affectedRows === 0) return res.status(404).json({ error: "Vendor not found" });
    res.json({ msg: "Vendor updated" });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") {
      return res.status(400).json({ error: "Vendor code already used by another vendor" });
    }
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/vendors/:id — delete vendor (cascades to item_vendors)
router.delete("/:id", ...superadminOnly, async (req, res) => {
  try {
    const [result] = await pool.query("DELETE FROM vendors WHERE id = ?", [req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: "Vendor not found" });
    res.json({ msg: "Vendor deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
