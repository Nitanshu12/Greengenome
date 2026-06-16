const router = require("express").Router();
const pool = require("../db/postgres");
const { requireLogin, requireRole } = require("../middleware/auth");

const adminOnly = [requireLogin, requireRole("admin", "superadmin")];

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
           sb.po_id,
           po.po_number        AS linked_po_number,
           sb.created_at
         FROM stock_batches sb
         JOIN items i ON i.item_code = sb.item_code
         LEFT JOIN vendors v ON v.vendor_code = sb.vendor_code
         LEFT JOIN purchase_orders po ON po.id = sb.po_id
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
      po_id,
    } = req.body;

    if (!item_code || !qty_received || !unit) {
      return res.status(400).json({
        error: "item_code, qty_received, and unit are required",
      });
    }
    if (Number(qty_received) <= 0) {
      return res.status(400).json({ error: "qty_received must be greater than 0" });
    }

    const parsedPoId = po_id ? parseInt(po_id, 10) : null;

    const conn = await pool.getConnection();
    try {
      const [result] = await conn.query(
        `INSERT INTO stock_batches
           (supplier_batch_no, item_code, vendor_code, mfg_date, expiry_date,
            qty_received, unit, storage_location, status, remarks, po_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
          parsedPoId,
        ]
      );

      // Auto-mark PO as received if all its items now have a linked batch
      if (parsedPoId) {
        const [poItems]     = await conn.query(
          "SELECT item_code FROM purchase_order_items WHERE po_id = ?", [parsedPoId]
        );
        const [linkedItems] = await conn.query(
          "SELECT DISTINCT item_code FROM stock_batches WHERE po_id = ?", [parsedPoId]
        );
        const linkedSet  = new Set(linkedItems.map(r => r.item_code));
        const allArrived = poItems.length > 0 && poItems.every(r => linkedSet.has(r.item_code));
        if (allArrived) {
          await conn.query(
            "UPDATE purchase_orders SET status = 'received' WHERE id = ? AND status IN ('draft','sent')",
            [parsedPoId]
          );
        }
      }

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

// ── POST /api/stock-batches/receive-po ───────────────────────────
// Bulk receive against a PO: creates one batch per item, marks PO received or short.
router.post("/receive-po", ...adminOnly, async (req, res) => {
  const { po_id, storage_location, remarks, items } = req.body;

  if (!po_id) return res.status(400).json({ error: "po_id is required" });
  if (!Array.isArray(items) || items.length === 0)
    return res.status(400).json({ error: "At least one item is required" });

  const conn = await pool.getConnection();
  try {
    await conn.query("START TRANSACTION");

    const [[po]] = await conn.query(
      "SELECT id, vendor_code, status FROM purchase_orders WHERE id = ?",
      [po_id]
    );
    if (!po) {
      await conn.query("ROLLBACK");
      return res.status(404).json({ error: "PO not found" });
    }
    if (!["sent", "short"].includes(po.status)) {
      await conn.query("ROLLBACK");
      return res.status(400).json({ error: `PO is already ${po.status}` });
    }

    const batchIds = [];

    for (const item of items) {
      const { item_code, vendor_code, unit, qty_received } = item;
      if (!item_code || !unit || Number(qty_received) < 1) continue; // skip unprocessed items

      const [result] = await conn.query(
        `INSERT INTO stock_batches
           (item_code, vendor_code, qty_received, unit, storage_location, remarks, po_id, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'active')`,
        [item_code, vendor_code || null, Number(qty_received), unit,
         storage_location || null, remarks || null, po_id]
      );
      batchIds.push(result.insertId);
    }

    // Re-query total received per item across ALL batches (handles partial submissions correctly)
    const [totals] = await conn.query(
      `SELECT poi.item_code, poi.quantity AS ordered_qty,
              COALESCE(SUM(sb.qty_received), 0) AS total_received
       FROM purchase_order_items poi
       LEFT JOIN stock_batches sb ON sb.po_id = ? AND sb.item_code = poi.item_code
       WHERE poi.po_id = ?
       GROUP BY poi.item_code, poi.quantity`,
      [po_id, po_id]
    );
    const allCovered = totals.length > 0 && totals.every(r => Number(r.total_received) >= Number(r.ordered_qty));
    const newStatus = allCovered ? "received" : "short";

    await conn.query(
      "UPDATE purchase_orders SET status = ? WHERE id = ?",
      [newStatus, po_id]
    );

    await conn.query("COMMIT");
    res.status(201).json({ batches_created: batchIds.length, batch_ids: batchIds, po_status: newStatus });
  } catch (err) {
    await conn.query("ROLLBACK");
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
});

// ── PUT /api/stock-batches/:id ────────────────────────────────────
// Update non-quantity fields: location, status, remarks.
// qty_issued is updated separately via the issue-stock endpoint below.
router.put("/:id", ...adminOnly, async (req, res) => {
  try {
    const { storage_location, status, remarks, expiry_date } = req.body;

    const conn = await pool.getConnection();
    try {
      const [result] = await conn.query(
        `UPDATE stock_batches
         SET storage_location = COALESCE(?, storage_location),
             status           = COALESCE(?, status),
             remarks          = COALESCE(?, remarks),
             expiry_date      = ?
         WHERE batch_id = ?`,
        [
          storage_location ?? null,
          status ?? null,
          remarks ?? null,
          expiry_date || null,
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
