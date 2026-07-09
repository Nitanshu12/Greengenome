const express = require("express");
const router = express.Router();
const pool = require("../db/postgres");
const { requireLogin, requireRole } = require("../middleware/auth");
const { KitFile } = require("../models/Kit");
const { summarizeKitData } = require("../utils/kitExcel");

const adminOnly = [requireLogin, requireRole("admin", "superadmin")];

// Builds the draft rows for a fully-assembled kit by merging kit_box_template
// (cube/box placement) with kit_allocations (the real batches FEFO-issued for
// this kit), then exploding each (box × batch) slice into one row per linked
// document. Never throws on an allocation mismatch — it flags the row
// instead — so generation always succeeds and the admin fixes flagged rows
// in the editable draft rather than the whole run failing.
async function buildDraftRows(conn, kit) {
  const [templateRows] = await conn.query(
    `SELECT t.cube_no, t.box_no, t.item_code, t.qty, t.row_order,
            COALESCE(i.name, t.item_name_raw) AS item_name,
            i.brand, i.is_subkit
     FROM kit_box_template t
     LEFT JOIN items i ON i.item_code = t.item_code
     ORDER BY t.row_order ASC`
  );

  const [subKitComponents] = await conn.query(
    `SELECT sub_kit_item_code, component_item_code, qty_per_unit FROM sub_kit_components`
  );
  const componentsBySubKit = {};
  for (const c of subKitComponents) (componentsBySubKit[c.sub_kit_item_code] ||= []).push(c);

  // This kit's actual allocations, grouped per raw item_code, FEFO-ordered
  // (earliest expiry first) — replaying that order here reproduces which
  // batch went to which box, the same order kit_assembly consumed them in.
  const [allocRows] = await conn.query(
    `SELECT ka.item_code, ka.batch_id, ka.qty_allocated,
            sb.expiry_date, sb.supplier_batch_no
     FROM kit_allocations ka
     JOIN stock_batches sb ON sb.batch_id = ka.batch_id
     WHERE ka.kit_id = ?
     ORDER BY ka.item_code,
              CASE WHEN sb.expiry_date IS NULL THEN 1 ELSE 0 END,
              sb.expiry_date ASC`,
    [kit.kit_id]
  );
  const batchQueues = {};
  for (const a of allocRows) {
    (batchQueues[a.item_code] ||= []).push({
      batch_id: a.batch_id,
      remaining: Number(a.qty_allocated),
      expiry_date: a.expiry_date,
      supplier_batch_no: a.supplier_batch_no,
    });
  }

  const itemCodes = [...new Set(templateRows.map(r => r.item_code).filter(Boolean))];
  const batchIds = [...new Set(allocRows.map(r => r.batch_id))];

  const itemDocs = {};
  if (itemCodes.length) {
    const ph = itemCodes.map(() => "?").join(",");
    const [docs] = await conn.query(
      `SELECT item_code, document_name, document_url FROM item_documents WHERE item_code IN (${ph})`,
      itemCodes
    );
    for (const d of docs) (itemDocs[d.item_code] ||= []).push(d);
  }
  const batchDocs = {};
  if (batchIds.length) {
    const ph = batchIds.map(() => "?").join(",");
    const [docs] = await conn.query(
      `SELECT batch_id, document_name, document_url FROM stock_batch_documents WHERE batch_id IN (${ph})`,
      batchIds
    );
    for (const d of docs) (batchDocs[d.batch_id] ||= []).push(d);
  }

  // Pulls `qty` units of `itemCode` off its FEFO batch queue, mutating it.
  // Returns the slices actually obtained — fewer than requested if the
  // queue runs dry (BOM totals and box-template totals drifted apart).
  function consume(itemCode, qty) {
    const queue = batchQueues[itemCode] || [];
    const slices = [];
    let remaining = qty;
    for (const b of queue) {
      if (remaining <= 0) break;
      if (b.remaining <= 0) continue;
      const take = Math.min(remaining, b.remaining);
      slices.push({ batch_id: b.batch_id, qty: take, expiry_date: b.expiry_date, supplier_batch_no: b.supplier_batch_no });
      b.remaining -= take;
      remaining -= take;
    }
    return { slices, short: remaining };
  }

  const rows = [];
  let rowOrder = 0;
  let flaggedCount = 0;

  // Repeat the whole cube/box structure once per physical kit unit deployed
  // in this run (qty_kits) — each Cube needs its own full set of boxes,
  // drawing onward from the same shared FEFO queues.
  for (let instance = 0; instance < kit.qty_kits; instance++) {
    for (const t of templateRows) {
      if (!t.item_code) continue; // unmatched template row — nothing to allocate against

      if (t.is_subkit) {
        // Packed as ONE pre-assembled unit: synthetic batch = earliest
        // expiry among the batches actually consumed for its components;
        // documents = the sub-kit's own item_documents, not its parts'.
        const comps = componentsBySubKit[t.item_code] || [];
        let earliestExpiry = null;
        let anyShort = false;
        const batchNos = [];
        for (const c of comps) {
          const needQty = c.qty_per_unit * t.qty;
          const { slices, short } = consume(c.component_item_code, needQty);
          if (short > 0) anyShort = true;
          for (const sl of slices) {
            if (sl.expiry_date && (!earliestExpiry || sl.expiry_date < earliestExpiry)) earliestExpiry = sl.expiry_date;
            if (sl.supplier_batch_no) batchNos.push(sl.supplier_batch_no);
          }
        }
        if (anyShort) flaggedCount++;

        const docs = itemDocs[t.item_code] || [];
        const docRows = docs.length ? docs : [{ document_name: null, document_url: null }];
        for (const d of docRows) {
          rows.push({
            row_order: rowOrder++,
            cube_no: String(t.cube_no), box_no: t.box_no,
            item_code: t.item_code, item_name: t.item_name, brand: t.brand || null,
            oem: null, item_type: null,
            batch_id: null, batch_no: batchNos.length ? [...new Set(batchNos)].join(", ") : null,
            expiry_date: earliestExpiry,
            document_name: d.document_name, document_url: d.document_url,
            is_flagged: anyShort,
          });
        }
        continue;
      }

      const { slices, short } = consume(t.item_code, t.qty);
      if (short > 0) flaggedCount++;

      if (!slices.length) {
        rows.push({
          row_order: rowOrder++,
          cube_no: String(t.cube_no), box_no: t.box_no,
          item_code: t.item_code, item_name: t.item_name, brand: t.brand || null,
          oem: null, item_type: null,
          batch_id: null, batch_no: null, expiry_date: null,
          document_name: null, document_url: null,
          is_flagged: true,
        });
        continue;
      }

      for (const sl of slices) {
        const docs = [...(itemDocs[t.item_code] || []), ...(batchDocs[sl.batch_id] || [])];
        const docRows = docs.length ? docs : [{ document_name: null, document_url: null }];
        for (const d of docRows) {
          rows.push({
            row_order: rowOrder++,
            cube_no: String(t.cube_no), box_no: t.box_no,
            item_code: t.item_code, item_name: t.item_name, brand: t.brand || null,
            oem: null, item_type: null,
            batch_id: sl.batch_id, batch_no: sl.supplier_batch_no, expiry_date: sl.expiry_date,
            document_name: d.document_name, document_url: d.document_url,
            is_flagged: short > 0,
          });
        }
      }
    }
  }

  return { rows, flaggedCount };
}

async function refreshFlaggedCount(txnId) {
  const [[{ c }]] = await pool.query(
    `SELECT COUNT(*) AS c FROM inventory_transaction_items WHERE transaction_id = ? AND is_flagged = 1`,
    [txnId]
  );
  await pool.query(`UPDATE inventory_transactions SET flagged_count = ? WHERE id = ?`, [c, txnId]);
}

// GET /api/inventory-transactions
router.get("/", requireLogin, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT t.id, t.kit_id, t.kit_name, t.qty_kits, t.status, t.flagged_count,
              t.generated_by, t.created_at, t.finalized_at,
              COUNT(i.id) AS row_count
       FROM inventory_transactions t
       LEFT JOIN inventory_transaction_items i ON i.transaction_id = t.id
       GROUP BY t.id
       ORDER BY t.created_at DESC`
    );
    res.json({ data: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/inventory-transactions/:id
router.get("/:id", requireLogin, async (req, res) => {
  try {
    const [[txn]] = await pool.query(`SELECT * FROM inventory_transactions WHERE id = ?`, [req.params.id]);
    if (!txn) return res.status(404).json({ error: "Transaction not found" });
    const [items] = await pool.query(
      `SELECT * FROM inventory_transaction_items WHERE transaction_id = ? ORDER BY row_order ASC, id ASC`,
      [req.params.id]
    );
    res.json({ transaction: txn, items });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/inventory-transactions/generate/:kit_id  (admin)
router.post("/generate/:kit_id", ...adminOnly, async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const [[kit]] = await conn.query(
      `SELECT kit_id, kit_name, qty_kits, status FROM assembled_kits WHERE kit_id = ?`,
      [req.params.kit_id]
    );
    if (!kit) { conn.release(); return res.status(404).json({ error: "Kit not found" }); }
    if (kit.status !== "assembled") {
      conn.release();
      return res.status(400).json({ error: "Only fully-assembled kits (no shortfalls) can generate an inventory transaction" });
    }

    const [[existing]] = await conn.query(
      `SELECT id FROM inventory_transactions WHERE kit_id = ? AND status != 'cancelled' LIMIT 1`,
      [kit.kit_id]
    );
    if (existing) {
      conn.release();
      return res.status(409).json({ error: `Kit #${kit.kit_id} already has a transaction (#${existing.id})` });
    }

    const { rows, flaggedCount } = await buildDraftRows(conn, kit);
    if (!rows.length) {
      conn.release();
      return res.status(400).json({ error: "Cube/Box template has no matched items — nothing to generate. Add rows in Cube / Box Template first." });
    }

    await conn.query("START TRANSACTION");

    const generatedBy = req.session.user?.username || "unknown";
    const [txnResult] = await conn.query(
      `INSERT INTO inventory_transactions (kit_id, kit_name, qty_kits, status, flagged_count, generated_by)
       VALUES (?, ?, ?, 'draft', ?, ?)`,
      [kit.kit_id, kit.kit_name, kit.qty_kits, flaggedCount, generatedBy]
    );
    const txnId = txnResult.insertId;

    for (const r of rows) {
      await conn.query(
        `INSERT INTO inventory_transaction_items
           (transaction_id, row_order, cube_no, box_no, item_code, item_name, brand, oem, item_type,
            batch_id, batch_no, expiry_date, document_name, document_url, is_flagged)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [txnId, r.row_order, r.cube_no, r.box_no, r.item_code, r.item_name, r.brand, r.oem, r.item_type,
         r.batch_id, r.batch_no, r.expiry_date, r.document_name, r.document_url, r.is_flagged]
      );
    }

    await conn.query("COMMIT");
    res.status(201).json({ id: txnId, row_count: rows.length, flagged_count: flaggedCount });
  } catch (err) {
    await conn.query("ROLLBACK").catch(() => {});
    console.error("Inventory transaction generation error:", err.message);
    res.status(500).json({ error: err.message || "Generation failed" });
  } finally {
    conn.release();
  }
});

// PUT /api/inventory-transactions/:id/items/:item_id  (admin)
router.put("/:id/items/:item_id", ...adminOnly, async (req, res) => {
  try {
    const [[txn]] = await pool.query(`SELECT status FROM inventory_transactions WHERE id = ?`, [req.params.id]);
    if (!txn) return res.status(404).json({ error: "Transaction not found" });
    if (txn.status !== "draft") return res.status(400).json({ error: `Cannot edit a ${txn.status} transaction` });

    const { cube_no, box_no, item_name, brand, oem, item_type, batch_no, expiry_date, document_name, document_url } = req.body;
    if (!item_name || !item_name.trim()) return res.status(400).json({ error: "Item name is required" });

    const [result] = await pool.query(
      `UPDATE inventory_transaction_items
       SET cube_no = ?, box_no = ?, item_name = ?, brand = ?, oem = ?, item_type = ?,
           batch_no = ?, expiry_date = ?, document_name = ?, document_url = ?, is_flagged = 0
       WHERE id = ? AND transaction_id = ?`,
      [cube_no || null, box_no || null, item_name.trim(), brand || null, oem || null, item_type || null,
       batch_no || null, expiry_date || null, document_name || null, document_url || null,
       req.params.item_id, req.params.id]
    );
    if (result.affectedRows === 0) return res.status(404).json({ error: "Row not found" });
    await refreshFlaggedCount(req.params.id);
    res.json({ msg: "Row updated" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/inventory-transactions/:id/items  (admin) — add a manual row
router.post("/:id/items", ...adminOnly, async (req, res) => {
  try {
    const [[txn]] = await pool.query(`SELECT status FROM inventory_transactions WHERE id = ?`, [req.params.id]);
    if (!txn) return res.status(404).json({ error: "Transaction not found" });
    if (txn.status !== "draft") return res.status(400).json({ error: `Cannot edit a ${txn.status} transaction` });

    const { cube_no, box_no, item_name, brand, oem, item_type, batch_no, expiry_date, document_name, document_url } = req.body;
    if (!item_name || !item_name.trim()) return res.status(400).json({ error: "Item name is required" });

    const [[{ maxOrder }]] = await pool.query(
      `SELECT COALESCE(MAX(row_order), -1) AS maxOrder FROM inventory_transaction_items WHERE transaction_id = ?`,
      [req.params.id]
    );

    await pool.query(
      `INSERT INTO inventory_transaction_items
         (transaction_id, row_order, cube_no, box_no, item_name, brand, oem, item_type, batch_no, expiry_date, document_name, document_url, is_flagged)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
      [req.params.id, maxOrder + 1, cube_no || null, box_no || null, item_name.trim(), brand || null,
       oem || null, item_type || null, batch_no || null, expiry_date || null, document_name || null, document_url || null]
    );
    await refreshFlaggedCount(req.params.id);
    res.status(201).json({ msg: "Row added" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/inventory-transactions/:id/items/:item_id  (admin)
router.delete("/:id/items/:item_id", ...adminOnly, async (req, res) => {
  try {
    const [[txn]] = await pool.query(`SELECT status FROM inventory_transactions WHERE id = ?`, [req.params.id]);
    if (!txn) return res.status(404).json({ error: "Transaction not found" });
    if (txn.status !== "draft") return res.status(400).json({ error: `Cannot edit a ${txn.status} transaction` });

    const [result] = await pool.query(
      `DELETE FROM inventory_transaction_items WHERE id = ? AND transaction_id = ?`,
      [req.params.item_id, req.params.id]
    );
    if (result.affectedRows === 0) return res.status(404).json({ error: "Row not found" });
    await refreshFlaggedCount(req.params.id);
    res.json({ msg: "Row deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/inventory-transactions/:id/finalize  (admin)
// Pushes the current draft rows straight into Kits Information (KitFile in
// MongoDB) — the same document shape the manual Excel upload produces — so
// it shows up in Packages/Dashboard immediately, no re-upload needed.
router.post("/:id/finalize", ...adminOnly, async (req, res) => {
  try {
    const [[txn]] = await pool.query(`SELECT * FROM inventory_transactions WHERE id = ?`, [req.params.id]);
    if (!txn) return res.status(404).json({ error: "Transaction not found" });
    if (txn.status !== "draft") return res.status(400).json({ error: `Transaction is already ${txn.status}` });

    const [items] = await pool.query(
      `SELECT * FROM inventory_transaction_items WHERE transaction_id = ? ORDER BY row_order ASC, id ASC`,
      [req.params.id]
    );
    if (!items.length) return res.status(400).json({ error: "Transaction has no rows to generate" });

    const existingKitFile = await KitFile.findOne({ kitName: txn.kit_name });
    if (existingKitFile) {
      return res.status(409).json({ error: `Kits Information already has a kit named "${txn.kit_name}". Rename or delete the existing one first.` });
    }

    const mapped = items.map((it, i) => ({
      rowNo: i + 1,
      cube: it.cube_no || "",
      box: it.box_no || "",
      items: it.item_name || "",
      brand: it.brand || "",
      oem: it.oem || "",
      itemType: it.item_type || "",
      expiry: it.expiry_date ? new Date(it.expiry_date).toISOString().split("T")[0] : "",
      batchNo: it.batch_no || "",
      document: it.document_name || "",
      link: it.document_url || "",
    }));
    const summaryStats = summarizeKitData(mapped);

    await KitFile.create({
      kitName: txn.kit_name,
      originalFile: null,
      storedFile: null,
      rowCount: mapped.length,
      uploadedBy: req.session.user?.id || null,
      summaryStats: {
        brandCounts: summaryStats.brandCounts,
        expired: summaryStats.expired,
        warning: summaryStats.warning,
      },
      data: mapped,
    });

    await pool.query(
      `UPDATE inventory_transactions SET status = 'finalized', finalized_at = NOW() WHERE id = ?`,
      [req.params.id]
    );

    res.json({ msg: `Kit "${txn.kit_name}" pushed to Kits Information (${mapped.length} rows)` });
  } catch (err) {
    console.error("Finalize error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
