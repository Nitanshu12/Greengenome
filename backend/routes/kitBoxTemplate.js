const express = require("express");
const router = express.Router();
const pool = require("../db/postgres");
const { requireLogin, requireRole } = require("../middleware/auth");

const adminOnly = [requireLogin, requireRole("admin", "superadmin")];

// GET /api/kit-box-template — full template, item name/brand fetched live via JOIN
router.get("/", requireLogin, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT t.id, t.cube_no, t.box_no, t.item_code, t.qty, t.row_order,
              i.name AS item_name, i.brand, i.unit, i.is_subkit
       FROM kit_box_template t
       JOIN items i ON i.item_code = t.item_code
       ORDER BY t.row_order ASC`
    );
    res.json({ data: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/kit-box-template — add a row (admin)
router.post("/", ...adminOnly, async (req, res) => {
  try {
    const { cube_no, box_no, item_code, qty = 1 } = req.body;
    if (!cube_no || !box_no || !item_code) {
      return res.status(400).json({ error: "cube_no, box_no and item_code are required" });
    }

    const [[{ maxOrder }]] = await pool.query(
      `SELECT COALESCE(MAX(row_order), 0) AS maxOrder FROM kit_box_template`
    );

    await pool.query(
      `INSERT INTO kit_box_template (cube_no, box_no, item_code, qty, row_order)
       VALUES (?, ?, ?, ?, ?)`,
      [Number(cube_no), String(box_no), item_code, Number(qty) || 1, maxOrder + 1]
    );

    res.status(201).json({ msg: "Row added" });
  } catch (err) {
    if (err.code === "ER_NO_REFERENCED_ROW_2" || err.code === "ER_NO_REFERENCED_ROW") {
      return res.status(400).json({ error: "Item not found" });
    }
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/kit-box-template/:id — edit a row (admin)
router.put("/:id", ...adminOnly, async (req, res) => {
  try {
    const { cube_no, box_no, item_code, qty } = req.body;
    if (!cube_no || !box_no || !item_code || !qty) {
      return res.status(400).json({ error: "cube_no, box_no, item_code and qty are required" });
    }

    const [result] = await pool.query(
      `UPDATE kit_box_template SET cube_no = ?, box_no = ?, item_code = ?, qty = ? WHERE id = ?`,
      [Number(cube_no), String(box_no), item_code, Number(qty), req.params.id]
    );
    if (result.affectedRows === 0) return res.status(404).json({ error: "Row not found" });

    res.json({ msg: "Row updated" });
  } catch (err) {
    if (err.code === "ER_NO_REFERENCED_ROW_2" || err.code === "ER_NO_REFERENCED_ROW") {
      return res.status(400).json({ error: "Item not found" });
    }
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/kit-box-template/:id (admin)
router.delete("/:id", ...adminOnly, async (req, res) => {
  try {
    const [result] = await pool.query("DELETE FROM kit_box_template WHERE id = ?", [req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: "Row not found" });
    res.json({ msg: "Row deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
