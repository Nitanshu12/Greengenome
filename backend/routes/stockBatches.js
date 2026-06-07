const router = require("express").Router();
const pool = require("../db/postgres");
const { requireLogin, requireRole } = require("../middleware/auth");

const adminOnly = [requireLogin, requireRole("admin", "superadmin")];

// ── GET /api/stock-batches/summary ───────────────────────────────
// Returns qty_in_hand per item from the view.
// Used by the Items Master page to show the Stock column.
router.get("/summary", requireLogin, async (req, res) => {
  try {
    const conn = await pool.getConnection();
    try {
      const [rows] = await conn.query(
        `SELECT item_code, item_name, unit, qty_in_hand, nearest_expiry, batch_count
         FROM item_stock_summary
         ORDER BY item_name ASC`
      );
      res.json({ data: rows });
    } finally {
      conn.release();
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/stock-batches ────────────────────────────────────────
// List all batches. Supports ?item_code=, ?status=, ?q= (search).
// Joins items table to bring in item_name.
// qty_in_hand is computed inline (qty_received - qty_issued).
router.get("/", requireLogin, async (req, res) => {
  try {
    const { item_code, status, q } = req.query;
    const params = [];
    const conditions = [];

    if (item_code) {
      conditions.push("sb.item_code = ?");
      params.push(item_code);
    }
    if (status) {
      conditions.push("sb.status = ?");
      params.push(status);
    }
    if (q) {
      conditions.push("(sb.item_code LIKE ? OR i.name LIKE ? OR sb.supplier_batch_no LIKE ?)");
      params.push(`%${q}%`, `%${q}%`, `%${q}%`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    const conn = await pool.getConnection();
    try {
      const [rows] = await conn.query(
        `SELECT
           sb.batch_id,
           sb.supplier_batch_no,
           sb.item_code,
           i.name              AS item_name,
           sb.vendor_code,
           v.business_name     AS vendor_name,
           sb.mfg_date,
           sb.expiry_date,
           sb.qty_received,
           sb.qty_issued,
           (sb.qty_received - sb.qty_issued) AS qty_in_hand,
           sb.unit,
           sb.storage_location,
           sb.status,
           sb.remarks,
           sb.created_at
         FROM stock_batches sb
         JOIN items i ON i.item_code = sb.item_code
         LEFT JOIN vendors v ON v.vendor_code = sb.vendor_code
         ${where}
         ORDER BY sb.item_code ASC, sb.expiry_date ASC`,
        params
      );
      res.json({ data: rows });
    } finally {
      conn.release();
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/stock-batches ───────────────────────────────────────
// Record a new goods receipt (a delivery arrived).
// qty_issued starts at 0 — nothing has been used from this batch yet.
router.post("/", ...adminOnly, async (req, res) => {
  try {
    const {
      supplier_batch_no,
      item_code,
      vendor_code,
      mfg_date,
      expiry_date,
      qty_received,
      unit,
      storage_location,
      status = "active",
      remarks,
    } = req.body;

    if (!item_code || !qty_received || !unit) {
      return res.status(400).json({
        error: "item_code, qty_received, and unit are required",
      });
    }
    if (Number(qty_received) <= 0) {
      return res.status(400).json({ error: "qty_received must be greater than 0" });
    }

    const conn = await pool.getConnection();
    try {
      const [result] = await conn.query(
        `INSERT INTO stock_batches
           (supplier_batch_no, item_code, vendor_code, mfg_date, expiry_date,
            qty_received, unit, storage_location, status, remarks)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          supplier_batch_no || null,
          item_code,
          vendor_code || null,
          mfg_date || null,
          expiry_date || null,
          qty_received,
          unit,
          storage_location || null,
          status,
          remarks || null,
        ]
      );
      res.status(201).json({ msg: "Stock batch created", batch_id: result.insertId });
    } finally {
      conn.release();
    }
  } catch (err) {
    if (err.code === "ER_NO_REFERENCED_ROW_2") {
      return res.status(400).json({ error: "item_code or vendor_code does not exist" });
    }
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /api/stock-batches/:id ────────────────────────────────────
// Update non-quantity fields: location, status, remarks.
// qty_issued is updated separately via the issue-stock endpoint below.
router.put("/:id", ...adminOnly, async (req, res) => {
  try {
    const { storage_location, status, remarks } = req.body;

    const conn = await pool.getConnection();
    try {
      const [result] = await conn.query(
        `UPDATE stock_batches
         SET storage_location = COALESCE(?, storage_location),
             status           = COALESCE(?, status),
             remarks          = COALESCE(?, remarks)
         WHERE batch_id = ?`,
        [
          storage_location ?? null,
          status ?? null,
          remarks ?? null,
          req.params.id,
        ]
      );
      if (result.affectedRows === 0) {
        return res.status(404).json({ error: "Batch not found" });
      }
      res.json({ msg: "Batch updated" });
    } finally {
      conn.release();
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/stock-batches/:id/issue ────────────────────────────
// Deduct qty from a specific batch (e.g. manual issue or kit assembly).
// Validates that enough stock is available before deducting.
router.post("/:id/issue", ...adminOnly, async (req, res) => {
  try {
    const { qty, reason } = req.body;
    if (!qty || Number(qty) <= 0) {
      return res.status(400).json({ error: "qty must be a positive number" });
    }

    const conn = await pool.getConnection();
    try {
      const [[batch]] = await conn.query(
        `SELECT batch_id, qty_received, qty_issued, status
         FROM stock_batches WHERE batch_id = ?`,
        [req.params.id]
      );
      if (!batch) return res.status(404).json({ error: "Batch not found" });
      if (batch.status !== "active") {
        return res.status(400).json({ error: "Cannot issue from a non-active batch" });
      }
      const available = batch.qty_received - batch.qty_issued;
      if (Number(qty) > available) {
        return res.status(400).json({
          error: `Only ${available} units available in this batch`,
        });
      }

      await conn.query(
        `UPDATE stock_batches SET qty_issued = qty_issued + ? WHERE batch_id = ?`,
        [qty, req.params.id]
      );
      res.json({ msg: "Stock issued", qty_issued: qty, reason: reason || null });
    } finally {
      conn.release();
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/stock-batches/:id ────────────────────────────────
// Only allowed if no stock has been issued from this batch.
// Prevents deleting a batch that has already been used in kit assembly.
router.delete("/:id", ...adminOnly, async (req, res) => {
  try {
    const conn = await pool.getConnection();
    try {
      const [[batch]] = await conn.query(
        `SELECT batch_id, qty_issued FROM stock_batches WHERE batch_id = ?`,
        [req.params.id]
      );
      if (!batch) return res.status(404).json({ error: "Batch not found" });
      if (batch.qty_issued > 0) {
        return res.status(400).json({
          error: "Cannot delete a batch that has already had stock issued from it",
        });
      }

      await conn.query(`DELETE FROM stock_batches WHERE batch_id = ?`, [req.params.id]);
      res.json({ msg: "Batch deleted" });
    } finally {
      conn.release();
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
