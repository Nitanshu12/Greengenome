const express = require("express");
const router = express.Router();
const pool = require("../db/postgres");
const { requireLogin, requireRole } = require("../middleware/auth");

// POST /api/kit-assembly/create
// Assembles a kit: allocates stock FIFO (earliest expiry first), records in assembled_kits + kit_allocations,
// increments qty_issued on used stock_batches.
router.post("/create", requireRole("admin", "superadmin"), async (req, res) => {
  const { kit_name, qty_kits = 1, notes = "" } = req.body;

  if (!kit_name || !kit_name.trim()) {
    return res.status(400).json({ error: "Kit name is required" });
  }
  const numKits = parseInt(qty_kits, 10);
  if (isNaN(numKits) || numKits < 1) {
    return res.status(400).json({ error: "Quantity must be at least 1" });
  }

  const conn = await pool.getConnection();
  try {
    await conn.query("START TRANSACTION");

    // 0. Duplicate name check
    const [[existing]] = await conn.query(
      "SELECT kit_id FROM assembled_kits WHERE kit_name = ? AND status != 'cancelled' LIMIT 1",
      [kit_name.trim()]
    );
    if (existing) {
      await conn.query("ROLLBACK");
      return res.status(409).json({ error: `A kit named "${kit_name.trim()}" already exists (Kit #${existing.kit_id}). Use a different name.` });
    }

    // 1. Fetch BOM
    const [bomRows] = await conn.query(
      "SELECT item_code, item_name, required_qty FROM bom_disaster ORDER BY item_code"
    );

    if (!bomRows.length) {
      await conn.query("ROLLBACK");
      return res.status(400).json({ error: "BOM is empty — add items to BOM Disaster first" });
    }

    const allocated = [];
    const shortfalls = [];

    // 2. For each BOM item, greedily allocate from eligible batches FIFO
    for (const bom of bomRows) {
      const totalNeeded = bom.required_qty * numKits;

      // Eligible batches: active, has stock, and passes 80% shelf-life rule
      const [batches] = await conn.query(
        `SELECT batch_id,
                (qty_received - qty_issued) AS available,
                mfg_date, expiry_date
         FROM stock_batches
         WHERE item_code = ?
           AND status = 'active'
           AND (qty_received - qty_issued) > 0
           AND (
             mfg_date IS NULL OR expiry_date IS NULL
             OR (
               DATEDIFF(expiry_date, CURDATE()) / DATEDIFF(expiry_date, mfg_date) * 100 >= 80
             )
           )
         ORDER BY
           CASE WHEN expiry_date IS NULL THEN 1 ELSE 0 END,
           expiry_date ASC`,
        [bom.item_code]
      );

      let remaining = totalNeeded;
      const batchUsage = [];

      for (const batch of batches) {
        if (remaining <= 0) break;
        const take = Math.min(remaining, batch.available);
        batchUsage.push({ batch_id: batch.batch_id, qty: take });
        remaining -= take;
      }

      const allocatedQty = totalNeeded - remaining;
      const availableQty = batches.reduce((s, b) => s + Number(b.available), 0);

      if (remaining > 0) {
        shortfalls.push({
          item_code: bom.item_code,
          item_name: bom.item_name,
          required_qty: totalNeeded,
          available_qty: availableQty,
          shortfall_qty: remaining,
        });
      } else {
        allocated.push({
          item_code: bom.item_code,
          item_name: bom.item_name,
          required_qty: totalNeeded,
          allocated_qty: allocatedQty,
        });
      }

      // Store batch usage for the DB writes below (even partial allocations get recorded)
      bom._batchUsage = batchUsage;
      bom._allocatedQty = allocatedQty;
    }

    // 3. Record the assembled kit
    const kitStatus = shortfalls.length > 0 ? "partial" : "assembled";
    const assembledBy = req.session.user?.username || "unknown";

    const [kitResult] = await conn.query(
      `INSERT INTO assembled_kits (kit_name, qty_kits, assembled_by, notes, status)
       VALUES (?, ?, ?, ?, ?)`,
      [kit_name.trim(), numKits, assembledBy, notes || null, kitStatus]
    );
    const kitId = kitResult.insertId;

    // 4. Write allocations and update qty_issued
    for (const bom of bomRows) {
      if (!bom._batchUsage) continue;
      for (const usage of bom._batchUsage) {
        await conn.query(
          `INSERT INTO kit_allocations (kit_id, item_code, batch_id, qty_allocated)
           VALUES (?, ?, ?, ?)`,
          [kitId, bom.item_code, usage.batch_id, usage.qty]
        );
        await conn.query(
          `UPDATE stock_batches SET qty_issued = qty_issued + ? WHERE batch_id = ?`,
          [usage.qty, usage.batch_id]
        );
      }
    }

    await conn.query("COMMIT");

    res.status(201).json({
      kit_id: kitId,
      kit_name: kit_name.trim(),
      qty_kits: numKits,
      status: kitStatus,
      allocated,
      shortfalls,
    });
  } catch (err) {
    await conn.query("ROLLBACK");
    console.error("Kit assembly error:", err.message);
    res.status(500).json({ error: err.message || "Assembly failed" });
  } finally {
    conn.release();
  }
});

// GET /api/kit-assembly/history
router.get("/history", requireLogin, async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const [rows] = await conn.query(
      `SELECT kit_id, kit_name, qty_kits, assembled_by, notes, status, created_at
       FROM assembled_kits
       ORDER BY created_at DESC
       LIMIT 50`
    );
    res.json({ data: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
});

// GET /api/kit-assembly/:kit_id/details
router.get("/:kit_id/details", requireLogin, async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const [[kit]] = await conn.query(
      "SELECT * FROM assembled_kits WHERE kit_id = ?",
      [req.params.kit_id]
    );
    if (!kit) return res.status(404).json({ error: "Kit not found" });

    // All allocations for this kit
    const [allocRows] = await conn.query(
      `SELECT ka.item_code, ka.batch_id, ka.qty_allocated,
              sb.expiry_date, sb.supplier_batch_no,
              bd.item_name
       FROM kit_allocations ka
       JOIN stock_batches sb ON sb.batch_id = ka.batch_id
       JOIN bom_disaster  bd ON bd.item_code = ka.item_code
       WHERE ka.kit_id = ?
       ORDER BY ka.item_code`,
      [req.params.kit_id]
    );

    // Group by item_code
    const allocMap = {};
    for (const row of allocRows) {
      if (!allocMap[row.item_code]) {
        allocMap[row.item_code] = { item_code: row.item_code, item_name: row.item_name, allocated_qty: 0, batches: [] };
      }
      allocMap[row.item_code].allocated_qty += Number(row.qty_allocated);
      allocMap[row.item_code].batches.push({
        batch_id: row.batch_id,
        qty: Number(row.qty_allocated),
        expiry_date: row.expiry_date,
        supplier_batch_no: row.supplier_batch_no,
      });
    }

    // Full BOM to compute shortfalls
    const [bomRows] = await conn.query(
      "SELECT item_code, item_name, required_qty FROM bom_disaster ORDER BY item_code"
    );

    const allocated = [];
    const shortfallsRaw = [];

    for (const bom of bomRows) {
      const totalRequired = bom.required_qty * kit.qty_kits;
      const alloc = allocMap[bom.item_code];
      const allocatedQty = alloc ? alloc.allocated_qty : 0;

      if (allocatedQty >= totalRequired) {
        allocated.push({
          item_code: bom.item_code,
          item_name: bom.item_name,
          required_qty: totalRequired,
          allocated_qty: allocatedQty,
          batches: alloc?.batches || [],
        });
      } else {
        shortfallsRaw.push({
          item_code: bom.item_code,
          item_name: bom.item_name,
          required_qty: totalRequired,
          allocated_qty: allocatedQty,
          shortfall_qty: totalRequired - allocatedQty,
        });
      }
    }

    // For every shortfall item, check what is CURRENTLY available in stock
    // (same 80% shelf-life rule as assembly). One batched query instead of N.
    const stockMap = {};
    if (shortfallsRaw.length > 0) {
      const codes = shortfallsRaw.map(s => s.item_code);
      const placeholders = codes.map(() => "?").join(",");
      const [stockRows] = await conn.query(
        `SELECT item_code, SUM(qty_received - qty_issued) AS current_available
         FROM stock_batches
         WHERE item_code IN (${placeholders})
           AND status = 'active'
           AND (qty_received - qty_issued) > 0
           AND (
             mfg_date IS NULL OR expiry_date IS NULL
             OR (DATEDIFF(expiry_date, CURDATE()) / DATEDIFF(expiry_date, mfg_date) * 100 >= 80)
           )
         GROUP BY item_code`,
        codes
      );
      for (const row of stockRows) {
        stockMap[row.item_code] = Number(row.current_available);
      }
    }

    const shortfalls = shortfallsRaw.map(s => {
      const currentAvailable = stockMap[s.item_code] || 0;
      return {
        ...s,
        current_available: currentAvailable,
        now_coverable: currentAvailable >= s.shortfall_qty,
        still_needed: Math.max(0, s.shortfall_qty - currentAvailable),
      };
    });

    res.json({ kit, allocated, shortfalls });
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
});

// POST /api/kit-assembly/:kit_id/cancel
router.post("/:kit_id/cancel", requireRole("admin", "superadmin"), async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.query("START TRANSACTION");

    const [[kit]] = await conn.query(
      "SELECT kit_id, status FROM assembled_kits WHERE kit_id = ?",
      [req.params.kit_id]
    );
    if (!kit) {
      await conn.query("ROLLBACK");
      return res.status(404).json({ error: "Kit not found" });
    }
    if (kit.status === "cancelled") {
      await conn.query("ROLLBACK");
      return res.status(400).json({ error: "Kit is already cancelled" });
    }

    // Get allocations and reverse qty_issued on each batch
    const [allocations] = await conn.query(
      "SELECT batch_id, qty_allocated FROM kit_allocations WHERE kit_id = ?",
      [req.params.kit_id]
    );
    for (const alloc of allocations) {
      await conn.query(
        "UPDATE stock_batches SET qty_issued = GREATEST(0, qty_issued - ?) WHERE batch_id = ?",
        [alloc.qty_allocated, alloc.batch_id]
      );
    }

    await conn.query(
      "UPDATE assembled_kits SET status = 'cancelled' WHERE kit_id = ?",
      [req.params.kit_id]
    );

    await conn.query("COMMIT");
    res.json({ message: "Kit cancelled and stock restored successfully" });
  } catch (err) {
    await conn.query("ROLLBACK");
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
});

module.exports = router;
