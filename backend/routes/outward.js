const express = require("express");
const router = express.Router();
const pool = require("../db/postgres");
const { requireLogin, requireRole } = require("../middleware/auth");

const adminOnly = [requireLogin, requireRole("admin", "superadmin")];

// 80% shelf-life rule, FEFO order — identical to kitAssembly. The past-expiry
// floor is checked unconditionally so a blank mfg_date can never mask a real,
// already-past expiry_date (see kitAssembly.js for the full explanation).
const ELIGIBLE_BATCHES_SQL = `
  SELECT batch_id, supplier_batch_no, expiry_date, mfg_date,
         (qty_received - qty_issued) AS available
  FROM stock_batches
  WHERE item_code = ?
    AND status = 'active'
    AND (qty_received - qty_issued) > 0
    AND (expiry_date IS NULL OR expiry_date >= CURDATE())
    AND (
      mfg_date IS NULL OR expiry_date IS NULL
      OR (DATEDIFF(expiry_date, CURDATE()) / DATEDIFF(expiry_date, mfg_date) * 100 >= 80)
    )
  ORDER BY
    CASE WHEN expiry_date IS NULL THEN 1 ELSE 0 END,
    expiry_date ASC
`;

// GET /api/outward — challan list with per-challan item count
router.get("/", ...adminOnly, async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const [rows] = await conn.query(`
      SELECT dc.id, dc.challan_no, dc.challan_date, dc.party_name,
             dc.shipping_party_name, dc.vehicle_number, dc.status,
             dc.reason, dc.is_returnable, dc.expected_return_date, dc.returned_at,
             dc.created_by, dc.created_at,
             COUNT(DISTINCT dci.item_code) AS item_count
      FROM delivery_challans dc
      LEFT JOIN delivery_challan_items dci ON dci.challan_id = dc.id
      GROUP BY dc.id
      ORDER BY dc.created_at DESC
    `);
    res.json({ data: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
});

// GET /api/outward/stock-preview?item_code=XXX
// Returns FEFO-eligible batches and total available qty for one item.
// Must be defined before /:id so Express doesn't treat "stock-preview" as an id.
router.get("/stock-preview", ...adminOnly, async (req, res) => {
  const { item_code } = req.query;
  if (!item_code) return res.status(400).json({ error: "item_code is required" });
  const conn = await pool.getConnection();
  try {
    const [batches] = await conn.query(ELIGIBLE_BATCHES_SQL, [item_code]);
    const total_available = batches.reduce((s, b) => s + Number(b.available), 0);
    res.json({
      batches: batches.map(b => ({ ...b, available: Number(b.available) })),
      total_available,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
});

// GET /api/outward/:id — full challan with line items + batch detail
router.get("/:id", ...adminOnly, async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const [[challan]] = await conn.query(
      "SELECT * FROM delivery_challans WHERE id = ?",
      [req.params.id]
    );
    if (!challan) return res.status(404).json({ error: "Challan not found" });

    const [items] = await conn.query(`
      SELECT dci.id, dci.item_code, dci.batch_id, dci.qty, dci.unit,
             i.name AS item_name, i.brand, i.category,
             sb.supplier_batch_no, sb.expiry_date, sb.mfg_date, sb.vendor_code
      FROM delivery_challan_items dci
      JOIN items i  ON i.item_code  = dci.item_code
      JOIN stock_batches sb ON sb.batch_id = dci.batch_id
      WHERE dci.challan_id = ?
      ORDER BY dci.id
    `, [req.params.id]);

    res.json({ challan, items });
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
});

// POST /api/outward — create challan, allocate FEFO, deduct stock
router.post("/", ...adminOnly, async (req, res) => {
  const {
    party_name, delivery_address, shipping_party_name, shipping_address, vehicle_number, items,
    reason = "sale", is_returnable = false, expected_return_date = null,
  } = req.body;

  if (!party_name?.trim() || !delivery_address?.trim()) {
    return res.status(400).json({ error: "party_name and delivery_address are required" });
  }
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "At least one item is required" });
  }
  if (!["sale", "demonstration"].includes(reason)) {
    return res.status(400).json({ error: "reason must be 'sale' or 'demonstration'" });
  }
  const returnable = !!is_returnable;

  const conn = await pool.getConnection();
  try {
    await conn.query("START TRANSACTION");

    // Challan number: DC/DDMMYYYY/NN — NN resets each calendar day
    const now = new Date();
    const dd   = String(now.getDate()).padStart(2, "0");
    const mm   = String(now.getMonth() + 1).padStart(2, "0");
    const yyyy = now.getFullYear();
    const [[{ today_count }]] = await conn.query(
      "SELECT COUNT(*) AS today_count FROM delivery_challans WHERE DATE(challan_date) = CURDATE()"
    );
    const serial     = String(Number(today_count) + 1).padStart(2, "0");
    const challan_no = `DC/${dd}${mm}${yyyy}/${serial}`;

    // FEFO allocation per item — each item_code is independent
    const lineItems = []; // { item_code, batch_id, qty }
    for (const { item_code, qty } of items) {
      if (!item_code || !(qty > 0)) continue;
      const [batches] = await conn.query(ELIGIBLE_BATCHES_SQL, [item_code]);
      let remaining = Math.round(Number(qty));
      for (const b of batches) {
        if (remaining <= 0) break;
        const take = Math.min(remaining, Number(b.available));
        if (take > 0) {
          lineItems.push({ item_code, batch_id: b.batch_id, qty: take });
          remaining -= take;
        }
      }
      if (remaining > 0) {
        await conn.query("ROLLBACK");
        const [[itm]] = await conn.query("SELECT name FROM items WHERE item_code = ?", [item_code]);
        return res.status(400).json({
          error: `Insufficient eligible stock for "${itm?.name || item_code}". ` +
                 `Requested ${Math.round(Number(qty))}, shortfall ${remaining}.`,
        });
      }
    }

    // Insert header
    const [result] = await conn.query(
      `INSERT INTO delivery_challans
       (challan_no, challan_date, party_name, delivery_address,
        shipping_party_name, shipping_address, vehicle_number, created_by,
        reason, is_returnable, expected_return_date)
       VALUES (?, CURDATE(), ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        challan_no,
        party_name.trim(),
        delivery_address.trim(),
        (shipping_party_name || party_name).trim(),
        (shipping_address   || delivery_address).trim(),
        vehicle_number?.trim() || null,
        req.session.user?.username || "unknown",
        reason,
        returnable ? 1 : 0,
        returnable ? (expected_return_date || null) : null,
      ]
    );
    const challanId = result.insertId;

    // Insert line items and deduct qty_issued from each batch
    for (const line of lineItems) {
      const [[itm]] = await conn.query("SELECT unit FROM items WHERE item_code = ?", [line.item_code]);
      await conn.query(
        "INSERT INTO delivery_challan_items (challan_id, item_code, batch_id, qty, unit) VALUES (?, ?, ?, ?, ?)",
        [challanId, line.item_code, line.batch_id, line.qty, itm?.unit || null]
      );
      await conn.query(
        "UPDATE stock_batches SET qty_issued = qty_issued + ? WHERE batch_id = ?",
        [line.qty, line.batch_id]
      );
    }

    await conn.query("COMMIT");
    res.status(201).json({ id: challanId, challan_no });
  } catch (err) {
    await conn.query("ROLLBACK");
    console.error("Outward create error:", err.message);
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
});

// PUT /api/outward/:id/cancel — cancel challan and restore stock
router.put("/:id/cancel", ...adminOnly, async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.query("START TRANSACTION");

    const [[challan]] = await conn.query(
      "SELECT id, status FROM delivery_challans WHERE id = ?",
      [req.params.id]
    );
    if (!challan) {
      await conn.query("ROLLBACK");
      return res.status(404).json({ error: "Challan not found" });
    }
    if (challan.status !== "confirmed") {
      await conn.query("ROLLBACK");
      return res.status(400).json({ error: `Challan is already ${challan.status}` });
    }

    const [lines] = await conn.query(
      "SELECT batch_id, qty FROM delivery_challan_items WHERE challan_id = ?",
      [req.params.id]
    );
    for (const line of lines) {
      await conn.query(
        "UPDATE stock_batches SET qty_issued = GREATEST(0, qty_issued - ?) WHERE batch_id = ?",
        [line.qty, line.batch_id]
      );
    }

    await conn.query(
      "UPDATE delivery_challans SET status = 'cancelled' WHERE id = ?",
      [req.params.id]
    );

    await conn.query("COMMIT");
    res.json({ msg: "Challan cancelled and stock restored" });
  } catch (err) {
    await conn.query("ROLLBACK");
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
});

// PUT /api/outward/:id/return — mark a returnable challan as returned and
// restore stock. Distinct from /cancel: this challan legitimately happened
// (e.g. a demonstration) and the goods have physically come back, so it's
// recorded as 'returned', not 'cancelled'.
router.put("/:id/return", ...adminOnly, async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.query("START TRANSACTION");

    const [[challan]] = await conn.query(
      "SELECT id, status, is_returnable FROM delivery_challans WHERE id = ?",
      [req.params.id]
    );
    if (!challan) {
      await conn.query("ROLLBACK");
      return res.status(404).json({ error: "Challan not found" });
    }
    if (!challan.is_returnable) {
      await conn.query("ROLLBACK");
      return res.status(400).json({ error: "This challan was not marked returnable" });
    }
    if (challan.status !== "confirmed") {
      await conn.query("ROLLBACK");
      return res.status(400).json({ error: `Challan is already ${challan.status}` });
    }

    const [lines] = await conn.query(
      "SELECT batch_id, qty FROM delivery_challan_items WHERE challan_id = ?",
      [req.params.id]
    );
    for (const line of lines) {
      await conn.query(
        "UPDATE stock_batches SET qty_issued = GREATEST(0, qty_issued - ?) WHERE batch_id = ?",
        [line.qty, line.batch_id]
      );
    }

    await conn.query(
      "UPDATE delivery_challans SET status = 'returned', returned_at = NOW() WHERE id = ?",
      [req.params.id]
    );

    await conn.query("COMMIT");
    res.json({ msg: "Challan marked as returned and stock restored" });
  } catch (err) {
    await conn.query("ROLLBACK");
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
});

module.exports = router;
