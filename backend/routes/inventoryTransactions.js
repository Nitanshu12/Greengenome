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
            i.brand, i.is_subkit, i.product_category
     FROM kit_box_template t
     LEFT JOIN items i ON i.item_code = t.item_code
     ORDER BY t.row_order ASC`
  );

  const [subKitComponents] = await conn.query(
    `SELECT sc.sub_kit_item_code, sc.component_item_code, sc.qty_per_unit,
            COALESCE(i.name, sc.component_item_code) AS component_name
     FROM sub_kit_components sc
     LEFT JOIN items i ON i.item_code = sc.component_item_code`
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

  // OEM = the vendor that supplied the specific batch a row's units came
  // from (stock_batches.vendor_code -> vendors.business_name) — resolved
  // per batch, not per item, since two batches of the same item can come
  // from different vendors. Raw items only; sub-kits are assembled
  // manually and have no vendor of their own (handled separately below).
  const batchVendorName = {};
  if (batchIds.length) {
    const ph = batchIds.map(() => "?").join(",");
    const [vendRows] = await conn.query(
      `SELECT sb.batch_id, v.business_name
       FROM stock_batches sb
       LEFT JOIN vendors v ON v.vendor_code = sb.vendor_code
       WHERE sb.batch_id IN (${ph})`,
      batchIds
    );
    for (const r of vendRows) if (r.business_name) batchVendorName[r.batch_id] = r.business_name;
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
        // Per-component batch breakdown for this placement — usually every
        // component resolves to one batch (a combined order), but FEFO can
        // split a component across two batches if the nearest-expiry one
        // runs low mid-assembly. There's no single "batch" for the sub-kit
        // itself (it's hand-assembled, not issued from one shelf), so
        // batch_no on the row stays null — this detail is the only place
        // batch info lives for a sub-kit row.
        const detail = [];
        for (const c of comps) {
          const needQty = c.qty_per_unit * t.qty;
          const { slices, short } = consume(c.component_item_code, needQty);
          if (short > 0) anyShort = true;
          const usedBatches = [];
          for (const sl of slices) {
            if (sl.expiry_date && (!earliestExpiry || sl.expiry_date < earliestExpiry)) earliestExpiry = sl.expiry_date;
            usedBatches.push({ batch_id: sl.batch_id, batch_no: sl.supplier_batch_no || null, qty: sl.qty });
          }
          detail.push({
            component_item_code: c.component_item_code,
            component_name: c.component_name,
            total_qty: needQty,
            qty_short: short > 0 ? short : 0,
            batches: usedBatches,
          });
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
            batch_id: null, batch_no: null,
            expiry_date: earliestExpiry,
            document_name: d.document_name, document_url: d.document_url,
            is_flagged: anyShort,
            assembly_detail: detail.length ? JSON.stringify(detail) : null,
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
          oem: null, item_type: t.product_category || null,
          batch_id: null, batch_no: null, expiry_date: null,
          document_name: null, document_url: null,
          is_flagged: true,
          assembly_detail: null,
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
            oem: batchVendorName[sl.batch_id] || null, item_type: t.product_category || null,
            batch_id: sl.batch_id, batch_no: sl.supplier_batch_no, expiry_date: sl.expiry_date,
            document_name: d.document_name, document_url: d.document_url,
            is_flagged: short > 0,
            assembly_detail: null,
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
            batch_id, batch_no, expiry_date, document_name, document_url, is_flagged, assembly_detail)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [txnId, r.row_order, r.cube_no, r.box_no, r.item_code, r.item_name, r.brand, r.oem, r.item_type,
         r.batch_id, r.batch_no, r.expiry_date, r.document_name, r.document_url, r.is_flagged, r.assembly_detail]
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

// POST /api/inventory-transactions/:id/sync  (admin)
// Re-checks two things that can drift after a transaction was generated:
// (1) a row's batch may have since been recalled/expired/quarantined in
//     stock_batches.status — flagged as batch_status_warning, distinct from
//     is_flagged (which means the original allocation itself came up short);
// (2) a row with no document yet may have one (or several) now, if uploaded
//     to Items Master or the batch after generation. Only backfills rows
//     that are currently empty — never overwrites a document already set.
//     If more than one document now matches, the extra ones become new
//     system-generated rows cloned from the original (same cube/box/item/
//     batch/expiry) — mirroring exactly what buildDraftRows does at
//     generation time for an item that already had multiple documents. This
//     is not the manual "Add Row" removed earlier: every field is sourced
//     from real data (item_code/batch_id/item_documents), never typed in.
// Works on draft or finalized transactions (not cancelled). For a finalized
// transaction, changes are also patched into the Mongo KitFile snapshot so
// Packages.jsx picks them up — matched by (cube, box, item, batch) content
// rather than array index, since deleted draft rows would have left gaps in
// row_order that no longer line up with KitFile.data.
router.post("/:id/sync", ...adminOnly, async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const [[txn]] = await conn.query(`SELECT * FROM inventory_transactions WHERE id = ?`, [req.params.id]);
    if (!txn) return res.status(404).json({ error: "Transaction not found" });
    if (txn.status === "cancelled") return res.status(400).json({ error: "Cannot sync a cancelled transaction" });

    const [items] = await conn.query(
      `SELECT * FROM inventory_transaction_items WHERE transaction_id = ?`,
      [req.params.id]
    );

    let docsUpdated = 0, rowsAdded = 0, warningsSet = 0, warningsCleared = 0, oemTypeUpdated = 0;
    // { cube_no, box_no, item_name, batch_no, document_name, document_url, isNewRow }
    const docChanges = [];
    // { cube_no, box_no, item_name, batch_no, oem, item_type }
    const oemTypeChanges = [];

    for (const it of items) {
      let newWarning = 0;
      if (it.batch_id) {
        const [[batch]] = await conn.query(
          "SELECT status FROM stock_batches WHERE batch_id = ?", [it.batch_id]
        );
        newWarning = batch && batch.status !== "active" ? 1 : 0;
      }

      const warnChanged = newWarning !== (it.batch_status_warning || 0);
      if (warnChanged) {
        await conn.query(
          "UPDATE inventory_transaction_items SET batch_status_warning = ? WHERE id = ?",
          [newWarning, it.id]
        );
        if (newWarning) warningsSet++; else warningsCleared++;
      }

      // OEM/Type only apply to raw items — a sub-kit is assembled manually
      // from several components, so it has no single vendor/OEM of its own.
      let newOem = it.oem, newItemType = it.item_type;
      if (it.item_code && (!it.oem || !it.item_type)) {
        const [[itemInfo]] = await conn.query(
          "SELECT is_subkit, product_category FROM items WHERE item_code = ?",
          [it.item_code]
        );
        if (itemInfo && !itemInfo.is_subkit) {
          if (!newItemType && itemInfo.product_category) newItemType = itemInfo.product_category;
          if (!newOem && it.batch_id) {
            const [[vend]] = await conn.query(
              `SELECT v.business_name FROM stock_batches sb
               LEFT JOIN vendors v ON v.vendor_code = sb.vendor_code
               WHERE sb.batch_id = ?`,
              [it.batch_id]
            );
            if (vend?.business_name) newOem = vend.business_name;
          }
        }
      }
      const oemTypeChanged = newOem !== it.oem || newItemType !== it.item_type;
      if (oemTypeChanged) {
        await conn.query(
          "UPDATE inventory_transaction_items SET oem = ?, item_type = ? WHERE id = ?",
          [newOem, newItemType, it.id]
        );
        oemTypeUpdated++;
        oemTypeChanges.push({
          cube_no: it.cube_no, box_no: it.box_no, item_name: it.item_name, batch_no: it.batch_no,
          oem: newOem, item_type: newItemType,
        });
      }

      if (it.document_name || it.document_url) continue; // already has one — never overwrite

      // Gather every currently-available document for this row's item/batch,
      // oldest first, same combination buildDraftRows uses at generation time.
      const docs = [];
      if (it.batch_id) {
        const [batchDocs] = await conn.query(
          "SELECT document_name, document_url FROM stock_batch_documents WHERE batch_id = ? ORDER BY created_at ASC",
          [it.batch_id]
        );
        docs.push(...batchDocs);
      }
      if (it.item_code) {
        const [itemDocs] = await conn.query(
          "SELECT document_name, document_url FROM item_documents WHERE item_code = ? ORDER BY created_at ASC",
          [it.item_code]
        );
        docs.push(...itemDocs);
      }
      if (!docs.length) continue;

      const [first, ...rest] = docs;
      await conn.query(
        "UPDATE inventory_transaction_items SET document_name = ?, document_url = ? WHERE id = ?",
        [first.document_name, first.document_url, it.id]
      );
      docsUpdated++;
      docChanges.push({
        cube_no: it.cube_no, box_no: it.box_no, item_name: it.item_name, batch_no: it.batch_no,
        document_name: first.document_name, document_url: first.document_url, isNewRow: false,
      });

      for (const extra of rest) {
        await conn.query(
          `INSERT INTO inventory_transaction_items
             (transaction_id, row_order, cube_no, box_no, item_code, item_name, brand, oem, item_type,
              batch_id, batch_no, expiry_date, document_name, document_url, is_flagged, batch_status_warning, assembly_detail)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [txn.id, it.row_order, it.cube_no, it.box_no, it.item_code, it.item_name, it.brand, newOem, newItemType,
           it.batch_id, it.batch_no, it.expiry_date, extra.document_name, extra.document_url, it.is_flagged, newWarning,
           it.assembly_detail ? JSON.stringify(it.assembly_detail) : null]
        );
        docsUpdated++;
        rowsAdded++;
        docChanges.push({
          cube_no: it.cube_no, box_no: it.box_no, item_name: it.item_name, batch_no: it.batch_no,
          document_name: extra.document_name, document_url: extra.document_url, isNewRow: true,
        });
      }
    }

    if (txn.status === "draft" && rowsAdded > 0) await refreshFlaggedCount(req.params.id);

    if (txn.status === "finalized" && (docChanges.length > 0 || oemTypeChanges.length > 0)) {
      const kitFile = await KitFile.findOne({ kitName: txn.kit_name });
      if (kitFile) {
        const matchKeyFor = c => row =>
          (row.cube || "") === (c.cube_no || "") &&
          (row.box || "") === (c.box_no || "") &&
          (row.items || "") === (c.item_name || "") &&
          (row.batchNo || "") === (c.batch_no || "");

        for (const chg of oemTypeChanges) {
          const idx = kitFile.data.findIndex(matchKeyFor(chg));
          if (idx !== -1) {
            if (!kitFile.data[idx].oem && chg.oem) kitFile.data[idx].oem = chg.oem;
            if (!kitFile.data[idx].itemType && chg.item_type) kitFile.data[idx].itemType = chg.item_type;
          }
        }

        for (const chg of docChanges) {
          const matchKey = matchKeyFor(chg);

          if (!chg.isNewRow) {
            const idx = kitFile.data.findIndex(row => matchKey(row) && !row.document && !row.link);
            if (idx !== -1) {
              kitFile.data[idx].document = chg.document_name || "";
              kitFile.data[idx].link = chg.document_url || "";
            }
            continue;
          }

          const idx = kitFile.data.findIndex(matchKey);
          const anchor = idx !== -1 ? kitFile.data[idx] : {};
          const newEntry = {
            rowNo: kitFile.data.length + 1,
            cube: chg.cube_no || "", box: chg.box_no || "",
            items: chg.item_name || "", brand: anchor.brand || "", oem: anchor.oem || "",
            itemType: anchor.itemType || "", expiry: anchor.expiry || "", batchNo: chg.batch_no || "",
            document: chg.document_name || "", link: chg.document_url || "",
          };
          if (idx !== -1) kitFile.data.splice(idx + 1, 0, newEntry);
          else kitFile.data.push(newEntry);
        }

        kitFile.data.forEach((row, i) => { row.rowNo = i + 1; });
        kitFile.rowCount = kitFile.data.length;
        const summaryStats = summarizeKitData(kitFile.data);
        kitFile.summaryStats = {
          brandCounts: summaryStats.brandCounts,
          expired: summaryStats.expired,
          warning: summaryStats.warning,
        };
        kitFile.markModified("data");
        await kitFile.save();
      }
    }

    res.json({
      msg: `Synced — ${docsUpdated} document(s) updated${rowsAdded > 0 ? ` (${rowsAdded} new row(s) added for extra documents)` : ""}, ${oemTypeUpdated} OEM/Type field(s) filled, ${warningsSet} batch warning(s) flagged, ${warningsCleared} cleared`,
    });
  } catch (err) {
    console.error("Sync error:", err.message);
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
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
      assemblyDetail: it.assembly_detail || null,
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
