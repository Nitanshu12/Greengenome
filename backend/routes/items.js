const router = require("express").Router();
const pool = require("../db/postgres");
const { requireLogin, requireRole } = require("../middleware/auth");

const adminOnly = [requireLogin, requireRole("admin", "superadmin")];

// ── GET /api/items  (search + filter) ────────────────────────
router.get("/", requireLogin, async (req, res) => {
  try {
    const { q = "", category = "", category2 = "", reusable } = req.query;
    const params = [];
    const conditions = [];

    if (q) {
      params.push(`%${q.trim()}%`, `%${q.trim()}%`);
      conditions.push(`(item_code LIKE ? OR name LIKE ?)`);
    }
    if (category) {
      params.push(category);
      conditions.push(`category = ?`);
    }
    if (category2) {
      params.push(category2);
      conditions.push(`category2 = ?`);
    }
    if (reusable !== undefined) {
      params.push(reusable === "true" ? 1 : 0);
      conditions.push(`is_reusable = ?`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const [rows] = await pool.query(
      `SELECT * FROM items ${where} ORDER BY CAST(REGEXP_REPLACE(item_code, '[^0-9]+', '') AS UNSIGNED) ASC, item_code ASC`,
      params
    );
    res.json({ data: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/items/categories ─────────────────────────────────
router.get("/categories", requireLogin, async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT DISTINCT category FROM items WHERE category IS NOT NULL ORDER BY category"
    );
    res.json({ data: rows.map(r => r.category) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/items/categories2 ────────────────────────────────
router.get("/categories2", requireLogin, async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT DISTINCT category2 FROM items WHERE category2 IS NOT NULL ORDER BY category2"
    );
    res.json({ data: rows.map(r => r.category2) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/items/next-code ──────────────────────────────────
router.get("/next-code", requireLogin, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT item_code FROM items
       ORDER BY CAST(REGEXP_REPLACE(item_code, '[^0-9]+', '') AS UNSIGNED) DESC
       LIMIT 1`
    );
    const lastCode = rows[0]?.item_code || "";
    const match = lastCode.match(/^(.*?)(\d+)$/);
    const prefix  = match ? match[1] : "ITM-";
    const lastNum = match ? parseInt(match[2], 10) : 0;
    const padLen  = match ? match[2].length : 3;
    const nextCode = prefix + String(lastNum + 1).padStart(padLen, "0");
    res.json({ next_code: nextCode });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/items/:item_code ─────────────────────────────────
router.get("/:item_code", requireLogin, async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT * FROM items WHERE item_code = ?", [req.params.item_code]);
    if (!rows.length) return res.status(404).json({ error: "Item not found" });
    res.json({ data: rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/items ───────────────────────────────────────────
router.post("/", ...adminOnly, async (req, res) => {
  try {
    const {
      item_code, name, specification,
      category, category2, sub_category, product_category, material,
      is_reusable = false,
      unit, unit_cost = 0, gst_percent = 0,
      min_stock = 0
    } = req.body;

    if (!item_code || !name || !category || !unit) {
      return res.status(400).json({ error: "item_code, name, category, and unit are required" });
    }

    await pool.query(
      `INSERT INTO items
        (item_code, name, specification, category, category2, sub_category,
         product_category, material, is_reusable, unit, unit_cost, gst_percent, min_stock)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        item_code.trim(), name.trim(), specification || null,
        category, category2 || null, sub_category || null,
        product_category || null, material || null,
        is_reusable ? 1 : 0,
        unit, Number(unit_cost), Number(gst_percent),
        Number(min_stock)
      ]
    );
    const [rows] = await pool.query("SELECT * FROM items WHERE item_code = ?", [item_code.trim()]);
    res.status(201).json({ msg: "Item created", data: rows[0] });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") {
      return res.status(400).json({ error: "Item code already exists" });
    }
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /api/items/:item_code ─────────────────────────────────
router.put("/:item_code", ...adminOnly, async (req, res) => {
  try {
    const {
      name, specification,
      category, category2, sub_category, product_category, material,
      is_reusable,
      unit, unit_cost, gst_percent,
      min_stock
    } = req.body;

    if (!name || !category || !unit) {
      return res.status(400).json({ error: "name, category, and unit are required" });
    }

    const [result] = await pool.query(
      `UPDATE items SET
        name=?, specification=?,
        category=?, category2=?, sub_category=?,
        product_category=?, material=?, is_reusable=?,
        unit=?, unit_cost=?, gst_percent=?,
        min_stock=?
       WHERE item_code=?`,
      [
        name.trim(), specification || null,
        category, category2 || null, sub_category || null,
        product_category || null, material || null,
        is_reusable ? 1 : 0,
        unit, Number(unit_cost), Number(gst_percent),
        Number(min_stock),
        req.params.item_code
      ]
    );
    if (result.affectedRows === 0) return res.status(404).json({ error: "Item not found" });
    const [rows] = await pool.query("SELECT * FROM items WHERE item_code = ?", [req.params.item_code]);
    res.json({ msg: "Item updated", data: rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/items/:item_code ──────────────────────────────
router.delete("/:item_code", ...adminOnly, async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT name FROM items WHERE item_code = ?", [req.params.item_code]);
    if (!rows.length) return res.status(404).json({ error: "Item not found" });
    await pool.query("DELETE FROM items WHERE item_code = ?", [req.params.item_code]);
    res.json({ msg: `Item "${rows[0].name}" deleted` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
