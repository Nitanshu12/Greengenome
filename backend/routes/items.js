const router = require("express").Router();
const pool = require("../db/postgres");
const { requireLogin, requireRole } = require("../middleware/auth");

const adminOnly = [requireLogin, requireRole("admin", "superadmin")];

// ── GET /api/items  (search + filter) ────────────────────────
router.get("/", requireLogin, async (req, res) => {
  try {
    const { q = "", category = "", reusable } = req.query;
    const params = [];
    const conditions = [];

    if (q) {
      params.push(`%${q}%`);
      conditions.push(
        `(name ILIKE $${params.length} OR item_code ILIKE $${params.length})`
      );
    }
    if (category) {
      params.push(category);
      conditions.push(`category = $${params.length}`);
    }
    if (reusable !== undefined) {
      params.push(reusable === "true");
      conditions.push(`is_reusable = $${params.length}`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const { rows } = await pool.query(
      `SELECT * FROM items ${where} ORDER BY id DESC`,
      params
    );
    res.json({ data: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/items/categories  (distinct category list) ──────
router.get("/categories", requireLogin, async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT DISTINCT category FROM items WHERE category IS NOT NULL ORDER BY category"
    );
    res.json({ data: rows.map(r => r.category) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/items/:id ────────────────────────────────────────
router.get("/:id", requireLogin, async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM items WHERE id = $1", [req.params.id]);
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
      min_stock = 0, max_stock
    } = req.body;

    if (!item_code || !name || !category || !unit) {
      return res.status(400).json({ error: "item_code, name, category, and unit are required" });
    }

    const { rows } = await pool.query(
      `INSERT INTO items
        (item_code, name, specification, category, category2, sub_category,
         product_category, material, is_reusable, unit, unit_cost, gst_percent,
         min_stock, max_stock)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       RETURNING *`,
      [
        item_code.trim(), name.trim(), specification || null,
        category, category2 || null, sub_category || null,
        product_category || null, material || null,
        Boolean(is_reusable),
        unit, Number(unit_cost), Number(gst_percent),
        Number(min_stock), max_stock != null ? Number(max_stock) : null
      ]
    );
    res.status(201).json({ msg: "Item created", data: rows[0] });
  } catch (err) {
    if (err.code === "23505") {
      return res.status(400).json({ error: "Item code already exists" });
    }
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /api/items/:id ────────────────────────────────────────
router.put("/:id", ...adminOnly, async (req, res) => {
  try {
    const {
      item_code, name, specification,
      category, category2, sub_category, product_category, material,
      is_reusable,
      unit, unit_cost, gst_percent,
      min_stock, max_stock
    } = req.body;

    if (!item_code || !name || !category || !unit) {
      return res.status(400).json({ error: "item_code, name, category, and unit are required" });
    }

    const { rows } = await pool.query(
      `UPDATE items SET
        item_code=$1, name=$2, specification=$3,
        category=$4, category2=$5, sub_category=$6,
        product_category=$7, material=$8, is_reusable=$9,
        unit=$10, unit_cost=$11, gst_percent=$12,
        min_stock=$13, max_stock=$14
       WHERE id=$15
       RETURNING *`,
      [
        item_code.trim(), name.trim(), specification || null,
        category, category2 || null, sub_category || null,
        product_category || null, material || null,
        Boolean(is_reusable),
        unit, Number(unit_cost), Number(gst_percent),
        Number(min_stock), max_stock != null ? Number(max_stock) : null,
        req.params.id
      ]
    );
    if (!rows.length) return res.status(404).json({ error: "Item not found" });
    res.json({ msg: "Item updated", data: rows[0] });
  } catch (err) {
    if (err.code === "23505") {
      return res.status(400).json({ error: "Item code already exists" });
    }
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/items/:id ─────────────────────────────────────
router.delete("/:id", ...adminOnly, async (req, res) => {
  try {
    const { rows } = await pool.query(
      "DELETE FROM items WHERE id=$1 RETURNING name",
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: "Item not found" });
    res.json({ msg: `Item "${rows[0].name}" deleted` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
