const express = require("express");
const router = express.Router();
const pool = require("../db/postgres");
const { requireLogin, requireRole } = require("../middleware/auth");

const adminOnly = [requireLogin, requireRole("admin", "superadmin")];
const superadminOnly = [requireLogin, requireRole("superadmin")];

// GET /api/sub-kits — list all sub-kits with their recipe (component items)
router.get("/", ...adminOnly, async (req, res) => {
  try {
    const [subKits] = await pool.query(
      `SELECT item_code, name, unit, is_active FROM items WHERE is_subkit = 1 ORDER BY name`
    );
    if (!subKits.length) return res.json({ data: [] });

    const codes = subKits.map(s => s.item_code);
    const placeholders = codes.map(() => "?").join(",");
    const [components] = await pool.query(
      `SELECT sc.sub_kit_item_code, sc.component_item_code, sc.qty_per_unit,
              i.name AS component_name, i.unit AS component_unit
       FROM sub_kit_components sc
       JOIN items i ON i.item_code = sc.component_item_code
       WHERE sc.sub_kit_item_code IN (${placeholders})
       ORDER BY sc.id`,
      codes
    );

    const byCode = {};
    for (const sk of subKits) byCode[sk.item_code] = { ...sk, components: [] };
    for (const c of components) {
      byCode[c.sub_kit_item_code]?.components.push({
        component_item_code: c.component_item_code,
        component_name: c.component_name,
        component_unit: c.component_unit,
        qty_per_unit: c.qty_per_unit,
      });
    }

    res.json({ data: Object.values(byCode) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/sub-kits — create a sub-kit (auto-creates its items row) + its recipe
router.post("/", ...adminOnly, async (req, res) => {
  const { item_code, name, unit = "Set", components = [] } = req.body;

  if (!item_code || !item_code.trim() || !name || !name.trim()) {
    return res.status(400).json({ error: "item_code and name are required" });
  }
  if (!Array.isArray(components) || components.length === 0) {
    return res.status(400).json({ error: "At least one component item is required" });
  }
  for (const c of components) {
    if (!c.component_item_code || !c.qty_per_unit || Number(c.qty_per_unit) <= 0) {
      return res.status(400).json({ error: "Each component needs an item and a quantity greater than 0" });
    }
  }

  const conn = await pool.getConnection();
  try {
    await conn.query("START TRANSACTION");

    // Components must already exist and must not themselves be sub-kits (no nesting)
    const codes = components.map(c => c.component_item_code);
    const placeholders = codes.map(() => "?").join(",");
    const [found] = await conn.query(
      `SELECT item_code, is_subkit FROM items WHERE item_code IN (${placeholders})`,
      codes
    );
    if (found.length !== new Set(codes).size) {
      await conn.query("ROLLBACK");
      return res.status(400).json({ error: "One or more component items were not found" });
    }
    if (found.some(f => f.is_subkit)) {
      await conn.query("ROLLBACK");
      return res.status(400).json({ error: "A sub-kit cannot contain another sub-kit as a component" });
    }

    await conn.query(
      `INSERT INTO items (item_code, name, category, unit, is_subkit)
       VALUES (?, ?, 'Sub-Kit', ?, 1)`,
      [item_code.trim(), name.trim(), unit || "Set"]
    );

    for (const c of components) {
      await conn.query(
        `INSERT INTO sub_kit_components (sub_kit_item_code, component_item_code, qty_per_unit)
         VALUES (?, ?, ?)`,
        [item_code.trim(), c.component_item_code, Number(c.qty_per_unit)]
      );
    }

    await conn.query("COMMIT");
    res.status(201).json({ msg: "Sub-kit created" });
  } catch (err) {
    await conn.query("ROLLBACK");
    if (err.code === "ER_DUP_ENTRY") {
      return res.status(400).json({ error: "That item code already exists" });
    }
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
});

// PUT /api/sub-kits/:item_code — edit name/unit and replace the recipe
router.put("/:item_code", ...adminOnly, async (req, res) => {
  const { name, unit, components = [] } = req.body;
  const subKitCode = req.params.item_code;

  if (!name || !name.trim()) {
    return res.status(400).json({ error: "name is required" });
  }
  if (!Array.isArray(components) || components.length === 0) {
    return res.status(400).json({ error: "At least one component item is required" });
  }
  for (const c of components) {
    if (!c.component_item_code || !c.qty_per_unit || Number(c.qty_per_unit) <= 0) {
      return res.status(400).json({ error: "Each component needs an item and a quantity greater than 0" });
    }
  }

  const conn = await pool.getConnection();
  try {
    await conn.query("START TRANSACTION");

    const [[existing]] = await conn.query(
      "SELECT item_code FROM items WHERE item_code = ? AND is_subkit = 1",
      [subKitCode]
    );
    if (!existing) {
      await conn.query("ROLLBACK");
      return res.status(404).json({ error: "Sub-kit not found" });
    }

    const codes = components.map(c => c.component_item_code);
    const placeholders = codes.map(() => "?").join(",");
    const [found] = await conn.query(
      `SELECT item_code, is_subkit FROM items WHERE item_code IN (${placeholders})`,
      codes
    );
    if (found.length !== new Set(codes).size) {
      await conn.query("ROLLBACK");
      return res.status(400).json({ error: "One or more component items were not found" });
    }
    if (found.some(f => f.is_subkit)) {
      await conn.query("ROLLBACK");
      return res.status(400).json({ error: "A sub-kit cannot contain another sub-kit as a component" });
    }

    await conn.query(
      `UPDATE items SET name = ?, unit = ? WHERE item_code = ?`,
      [name.trim(), unit || "Set", subKitCode]
    );

    await conn.query(`DELETE FROM sub_kit_components WHERE sub_kit_item_code = ?`, [subKitCode]);
    for (const c of components) {
      await conn.query(
        `INSERT INTO sub_kit_components (sub_kit_item_code, component_item_code, qty_per_unit)
         VALUES (?, ?, ?)`,
        [subKitCode, c.component_item_code, Number(c.qty_per_unit)]
      );
    }

    await conn.query("COMMIT");
    res.json({ msg: "Sub-kit updated" });
  } catch (err) {
    await conn.query("ROLLBACK");
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
});

// DELETE /api/sub-kits/:item_code
router.delete("/:item_code", ...superadminOnly, async (req, res) => {
  try {
    const [[existing]] = await pool.query(
      "SELECT name FROM items WHERE item_code = ? AND is_subkit = 1",
      [req.params.item_code]
    );
    if (!existing) return res.status(404).json({ error: "Sub-kit not found" });

    // sub_kit_components rows cascade automatically (FK ON DELETE CASCADE).
    // stock_batches / kit_box_template rows referencing this item_code block
    // the delete via FK RESTRICT, same as deleting any other item.
    await pool.query("DELETE FROM items WHERE item_code = ?", [req.params.item_code]);
    res.json({ msg: `Sub-kit "${existing.name}" deleted` });
  } catch (err) {
    if (err.code === "ER_ROW_IS_REFERENCED_2" || err.code === "ER_ROW_IS_REFERENCED") {
      return res.status(400).json({ error: "Cannot delete — this sub-kit is referenced by stock batches or the box template" });
    }
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
