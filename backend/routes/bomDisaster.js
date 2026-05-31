const router = require("express").Router();
const pool = require("../db/postgres");
const { requireLogin, requireRole } = require("../middleware/auth");

const adminOnly = [requireLogin, requireRole("admin", "superadmin")];

// GET /api/bom-disaster
router.get("/", requireLogin, async (req, res) => {
  try {
    const { q = "" } = req.query;
    const params = [];
    let where = "";
    if (q) {
      params.push(`%${q.trim()}%`, `%${q.trim()}%`);
      where = `WHERE (item_code LIKE ? OR item_name LIKE ?)`;
    }
    const [rows] = await pool.query(
      `SELECT item_code, item_name, required_qty FROM bom_disaster ${where} ORDER BY item_code ASC`,
      params
    );
    res.json({ data: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/bom-disaster
router.post("/", ...adminOnly, async (req, res) => {
  try {
    const { item_code, item_name, required_qty } = req.body;
    if (!item_code || !item_name) {
      return res.status(400).json({ error: "item_code and item_name are required" });
    }
    await pool.query(
      `INSERT INTO bom_disaster (item_code, item_name, required_qty) VALUES (?,?,?)`,
      [item_code.trim(), item_name.trim(), required_qty || 0]
    );
    res.status(201).json({ msg: "BOM entry added" });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") {
      return res.status(400).json({ error: "Item code already exists in BOM" });
    }
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/bom-disaster/:item_code
router.put("/:item_code", ...adminOnly, async (req, res) => {
  try {
    const { item_name, required_qty } = req.body;
    if (!item_name) {
      return res.status(400).json({ error: "item_name is required" });
    }
    const [result] = await pool.query(
      `UPDATE bom_disaster SET item_name=?, required_qty=? WHERE item_code=?`,
      [item_name.trim(), required_qty || 0, req.params.item_code]
    );
    if (result.affectedRows === 0) return res.status(404).json({ error: "BOM entry not found" });
    res.json({ msg: "BOM entry updated" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/bom-disaster/:item_code
router.delete("/:item_code", ...adminOnly, async (req, res) => {
  try {
    const [result] = await pool.query("DELETE FROM bom_disaster WHERE item_code=?", [req.params.item_code]);
    if (result.affectedRows === 0) return res.status(404).json({ error: "BOM entry not found" });
    res.json({ msg: "BOM entry deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
