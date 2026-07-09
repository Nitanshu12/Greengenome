const express = require("express");
const router = express.Router();
const pool = require("../db/postgres");
const { requireLogin, requireRole } = require("../middleware/auth");

// A batch is eligible only if it isn't already past its expiry (checked
// unconditionally — this floor applies even when mfg_date is missing, so a
// blank mfg_date can never mask a real, already-past expiry_date), AND
// separately passes the 80% shelf-life rule whenever both dates are known
// well enough to compute it.
const ELIGIBLE_BATCHES_SQL = `
  SELECT batch_id, (qty_received - qty_issued) AS available, mfg_date, expiry_date
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

// A "pool" is the FEFO-ordered batch list for one raw item_code, fetched once
// and shared by every claim on that item_code within a single assembly run —
// a raw item can be needed both standalone in the BOM and as a sub-kit
// component, and both claims must draw from the same, depleting stock.
function makePoolCache(conn) {
  const cache = new Map();
  return {
    async get(itemCode) {
      if (cache.has(itemCode)) return cache.get(itemCode);
      const [batches] = await conn.query(ELIGIBLE_BATCHES_SQL, [itemCode]);
      const p = { batches: batches.map(b => ({ ...b, available: Number(b.available) })) };
      cache.set(itemCode, p);
      return p;
    },
  };
}

function peekAvailable(p) {
  return p.batches.reduce((s, b) => s + b.available, 0);
}

// Consumes up to `qty` from a pool's batches in FEFO order, mutating it.
// Returns the per-batch usage actually taken (<= qty if the pool runs dry).
function consume(p, qty) {
  let remaining = qty;
  const usage = [];
  for (const b of p.batches) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, b.available);
    if (take > 0) {
      usage.push({ batch_id: b.batch_id, qty: take });
      b.available -= take;
      remaining -= take;
    }
  }
  return usage;
}

// Tops up a single 'partial' kit once new stock has arrived — re-runs FEFO
// allocation, but ONLY for each BOM line's outstanding shortfall
// (totalRequired - alreadyAllocated), never touching what was already
// allocated. Flips the kit to 'assembled' if every line closes, otherwise
// stays 'partial' with whatever remains short. Manages its own transaction
// on the given connection so it can be called standalone (manual "Complete
// Kit" button) or in a loop, one kit per connection (auto-completion after
// a stock receipt).
async function completePartialKit(conn, kitId) {
  await conn.query("START TRANSACTION");

  // Lock the kit row so two concurrent completions (manual click + auto
  // trigger, or two auto triggers) can't both read the same already-allocated
  // snapshot and double-consume the same stock.
  const [[kit]] = await conn.query(
    "SELECT kit_id, kit_name, qty_kits, status FROM assembled_kits WHERE kit_id = ? FOR UPDATE",
    [kitId]
  );
  if (!kit) {
    await conn.query("ROLLBACK");
    return { ok: false, code: 404, error: "Kit not found" };
  }
  if (kit.status !== "partial") {
    await conn.query("ROLLBACK");
    return { ok: false, code: 400, error: `Kit is ${kit.status} — nothing to complete` };
  }

  // What's already allocated, per raw item_code (sub-kit and standalone
  // claims both land here, same as /:kit_id/details).
  const [allocRows] = await conn.query(
    `SELECT item_code, SUM(qty_allocated) AS allocated_qty FROM kit_allocations WHERE kit_id = ? GROUP BY item_code`,
    [kit.kit_id]
  );
  const allocatedMap = {};
  for (const r of allocRows) allocatedMap[r.item_code] = Number(r.allocated_qty);

  const [bomRows] = await conn.query(
    `SELECT bd.item_code, bd.item_name, bd.required_qty, COALESCE(i.is_subkit, 0) AS is_subkit
     FROM bom_disaster bd
     LEFT JOIN items i ON i.item_code = bd.item_code
     ORDER BY bd.item_code`
  );

  const pools = makePoolCache(conn);
  const writes = [];
  const stillShort = [];
  let closedCount = 0;

  for (const bom of bomRows) {
    const totalRequired = bom.required_qty * kit.qty_kits;

    if (!bom.is_subkit) {
      const already = allocatedMap[bom.item_code] || 0;
      const stillNeeded = totalRequired - already;
      if (stillNeeded <= 0) continue; // this line already fully closed — leave it alone

      const p = await pools.get(bom.item_code);
      const usage = consume(p, stillNeeded);
      const gained = usage.reduce((s, u) => s + u.qty, 0);
      for (const u of usage) writes.push({ item_code: bom.item_code, batch_id: u.batch_id, qty: u.qty });

      if (gained >= stillNeeded) closedCount++;
      else stillShort.push({ item_code: bom.item_code, item_name: bom.item_name, shortfall_qty: stillNeeded - gained });
      continue;
    }

    // Sub-kit — same two-phase approach as /create (peek every component's
    // buildable count, then commit the scarcest-limited amount), but only
    // for the ADDITIONAL kits still needed beyond what's already built.
    const [components] = await conn.query(
      `SELECT sc.component_item_code, sc.qty_per_unit, i.name AS component_name
       FROM sub_kit_components sc
       JOIN items i ON i.item_code = sc.component_item_code
       WHERE sc.sub_kit_item_code = ?`,
      [bom.item_code]
    );

    let alreadyBuilt = components.length ? Infinity : 0;
    for (const c of components) {
      const already = allocatedMap[c.component_item_code] || 0;
      alreadyBuilt = Math.min(alreadyBuilt, Math.floor(already / c.qty_per_unit));
    }
    if (alreadyBuilt === Infinity) alreadyBuilt = 0;

    const stillNeededKits = totalRequired - alreadyBuilt;
    if (stillNeededKits <= 0) continue;

    let maxBuildable = stillNeededKits;
    for (const comp of components) {
      const p = await pools.get(comp.component_item_code);
      const buildableFromThis = Math.floor(peekAvailable(p) / comp.qty_per_unit);
      maxBuildable = Math.min(maxBuildable, buildableFromThis);
    }
    maxBuildable = Math.max(0, maxBuildable);

    for (const comp of components) {
      const needQty = comp.qty_per_unit * maxBuildable;
      const p = await pools.get(comp.component_item_code);
      const usage = needQty > 0 ? consume(p, needQty) : [];
      for (const u of usage) writes.push({ item_code: comp.component_item_code, batch_id: u.batch_id, qty: u.qty });
    }

    if (maxBuildable >= stillNeededKits) closedCount++;
    else stillShort.push({ item_code: bom.item_code, item_name: bom.item_name, shortfall_qty: stillNeededKits - maxBuildable, is_subkit: true });
  }

  if (!writes.length) {
    await conn.query("ROLLBACK");
    return {
      ok: false, code: 400, error: "No additional stock is available yet for this kit's shortfalls",
      changed: false, kit_id: kit.kit_id, kit_name: kit.kit_name,
    };
  }

  for (const w of writes) {
    await conn.query(
      `INSERT INTO kit_allocations (kit_id, item_code, batch_id, qty_allocated) VALUES (?, ?, ?, ?)`,
      [kit.kit_id, w.item_code, w.batch_id, w.qty]
    );
    await conn.query(
      `UPDATE stock_batches SET qty_issued = qty_issued + ? WHERE batch_id = ?`,
      [w.qty, w.batch_id]
    );
  }

  const newStatus = stillShort.length > 0 ? "partial" : "assembled";
  await conn.query("UPDATE assembled_kits SET status = ? WHERE kit_id = ?", [newStatus, kit.kit_id]);

  await conn.query("COMMIT");
  return {
    ok: true, changed: true,
    kit_id: kit.kit_id,
    kit_name: kit.kit_name,
    status: newStatus,
    items_completed: closedCount,
    remaining_shortfalls: stillShort,
  };
}

// Runs completePartialKit() over every currently-partial kit — called after
// new stock lands (PO receipt or manual batch add) so shortfalls resolve
// automatically with zero clicks. Each kit gets its own connection and
// transaction, so one kit's failure can't roll back another kit's update or
// the stock receipt that triggered this pass. Returns only the kits that
// actually changed.
async function autoCompletePartialKits() {
  const listConn = await pool.getConnection();
  let kitIds;
  try {
    const [rows] = await listConn.query("SELECT kit_id FROM assembled_kits WHERE status = 'partial'");
    kitIds = rows.map(r => r.kit_id);
  } finally {
    listConn.release();
  }

  const updated = [];
  for (const kitId of kitIds) {
    const conn = await pool.getConnection();
    try {
      const result = await completePartialKit(conn, kitId);
      if (result.ok && result.changed) {
        updated.push({
          kit_id: result.kit_id,
          kit_name: result.kit_name,
          status: result.status,
          items_completed: result.items_completed,
          remaining_shortfalls: result.remaining_shortfalls,
        });
      }
    } catch (err) {
      console.error(`Auto-completion failed for kit #${kitId}:`, err.message);
    } finally {
      conn.release();
    }
  }
  return updated;
}

// POST /api/kit-assembly/create
// Assembles a kit: expands sub-kit BOM lines into their raw components,
// allocates everything FEFO (earliest expiry first, 80%-rule applied),
// records in assembled_kits + kit_allocations (always against raw item_codes —
// a sub-kit never gets its own stock batch), increments qty_issued.
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

    // 1. Fetch BOM, tagged with whether each line is a sub-kit
    const [bomRows] = await conn.query(
      `SELECT bd.item_code, bd.item_name, bd.required_qty, COALESCE(i.is_subkit, 0) AS is_subkit
       FROM bom_disaster bd
       LEFT JOIN items i ON i.item_code = bd.item_code
       ORDER BY bd.item_code`
    );

    if (!bomRows.length) {
      await conn.query("ROLLBACK");
      return res.status(400).json({ error: "BOM is empty — add items to BOM Disaster first" });
    }

    const pools = makePoolCache(conn);
    const allocated = [];
    const shortfalls = [];
    const writes = []; // { item_code, batch_id, qty } — always a RAW item_code

    for (const bom of bomRows) {
      if (!bom.is_subkit) {
        // ── Raw item — same FEFO allocation as before, just via the shared pool ──
        const totalNeeded = bom.required_qty * numKits;
        const p = await pools.get(bom.item_code);
        const usage = consume(p, totalNeeded);
        const allocatedQty = usage.reduce((s, u) => s + u.qty, 0);
        const remaining = totalNeeded - allocatedQty;

        for (const u of usage) writes.push({ item_code: bom.item_code, batch_id: u.batch_id, qty: u.qty });

        if (remaining > 0) {
          shortfalls.push({
            item_code: bom.item_code,
            item_name: bom.item_name,
            required_qty: totalNeeded,
            available_qty: allocatedQty,
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
        continue;
      }

      // ── Sub-kit — expand into its recipe, build only as many COMPLETE
      // sub-kits as the scarcest component allows (no partial/unusable kits) ──
      const [components] = await conn.query(
        `SELECT sc.component_item_code, sc.qty_per_unit, i.name AS component_name
         FROM sub_kit_components sc
         JOIN items i ON i.item_code = sc.component_item_code
         WHERE sc.sub_kit_item_code = ?`,
        [bom.item_code]
      );
      const neededKits = bom.required_qty * numKits;

      // Phase 1: peek how many complete kits each component alone could supply
      let maxBuildable = neededKits;
      const componentInfo = [];
      for (const comp of components) {
        const p = await pools.get(comp.component_item_code);
        const buildableFromThis = Math.floor(peekAvailable(p) / comp.qty_per_unit);
        componentInfo.push({ ...comp, buildableFromThis });
        maxBuildable = Math.min(maxBuildable, buildableFromThis);
      }
      maxBuildable = Math.max(0, maxBuildable);

      // Phase 2: commit consumption for exactly maxBuildable kits' worth of each component
      const componentDetail = [];
      for (const comp of componentInfo) {
        const needQty = comp.qty_per_unit * maxBuildable;
        const p = await pools.get(comp.component_item_code);
        const usage = needQty > 0 ? consume(p, needQty) : [];
        for (const u of usage) writes.push({ item_code: comp.component_item_code, batch_id: u.batch_id, qty: u.qty });
        componentDetail.push({
          item_code: comp.component_item_code,
          item_name: comp.component_name,
          qty_per_unit: comp.qty_per_unit,
          buildable_kits: comp.buildableFromThis,
        });
      }

      const shortfallKits = neededKits - maxBuildable;
      if (shortfallKits > 0) {
        shortfalls.push({
          item_code: bom.item_code,
          item_name: bom.item_name,
          required_qty: neededKits,
          available_qty: maxBuildable,
          shortfall_qty: shortfallKits,
          is_subkit: true,
          components: componentDetail,
        });
      } else {
        allocated.push({
          item_code: bom.item_code,
          item_name: bom.item_name,
          required_qty: neededKits,
          allocated_qty: maxBuildable,
          is_subkit: true,
        });
      }
    }

    // 2. Record the assembled kit
    const kitStatus = shortfalls.length > 0 ? "partial" : "assembled";
    const assembledBy = req.session.user?.username || "unknown";

    const [kitResult] = await conn.query(
      `INSERT INTO assembled_kits (kit_name, qty_kits, assembled_by, notes, status)
       VALUES (?, ?, ?, ?, ?)`,
      [kit_name.trim(), numKits, assembledBy, notes || null, kitStatus]
    );
    const kitId = kitResult.insertId;

    // 3. Write allocations and update qty_issued — always against raw item_codes
    for (const w of writes) {
      await conn.query(
        `INSERT INTO kit_allocations (kit_id, item_code, batch_id, qty_allocated)
         VALUES (?, ?, ?, ?)`,
        [kitId, w.item_code, w.batch_id, w.qty]
      );
      await conn.query(
        `UPDATE stock_batches SET qty_issued = qty_issued + ? WHERE batch_id = ?`,
        [w.qty, w.batch_id]
      );
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
    // LEFT JOIN so the UI can tell whether an assembled kit already has an
    // inventory transaction generated (and disable "Generate" to avoid the
    // duplicate the DB's uq_kit_status constraint would reject anyway).
    const [rows] = await conn.query(
      `SELECT ak.kit_id, ak.kit_name, ak.qty_kits, ak.assembled_by, ak.notes, ak.status, ak.created_at,
              it.id AS transaction_id, it.status AS transaction_status
       FROM assembled_kits ak
       LEFT JOIN inventory_transactions it
         ON it.kit_id = ak.kit_id AND it.status != 'cancelled'
       ORDER BY ak.created_at DESC
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

    // All allocations for this kit — always keyed by RAW item_code
    const [allocRows] = await conn.query(
      `SELECT ka.item_code, ka.batch_id, ka.qty_allocated,
              sb.expiry_date, sb.supplier_batch_no,
              i.name AS item_name
       FROM kit_allocations ka
       JOIN stock_batches sb ON sb.batch_id = ka.batch_id
       JOIN items i ON i.item_code = ka.item_code
       WHERE ka.kit_id = ?
       ORDER BY ka.item_code`,
      [req.params.kit_id]
    );

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

    // Full BOM, tagged with is_subkit, to compute shortfalls
    const [bomRows] = await conn.query(
      `SELECT bd.item_code, bd.item_name, bd.required_qty, COALESCE(i.is_subkit, 0) AS is_subkit
       FROM bom_disaster bd
       LEFT JOIN items i ON i.item_code = bd.item_code
       ORDER BY bd.item_code`
    );

    // Recipes for every sub-kit line, fetched in one batch
    const subKitCodes = bomRows.filter(b => b.is_subkit).map(b => b.item_code);
    const componentsBySubKit = {};
    if (subKitCodes.length) {
      const placeholders = subKitCodes.map(() => "?").join(",");
      const [comps] = await conn.query(
        `SELECT sc.sub_kit_item_code, sc.component_item_code, sc.qty_per_unit, i.name AS component_name
         FROM sub_kit_components sc
         JOIN items i ON i.item_code = sc.component_item_code
         WHERE sc.sub_kit_item_code IN (${placeholders})`,
        subKitCodes
      );
      for (const c of comps) (componentsBySubKit[c.sub_kit_item_code] ||= []).push(c);
    }

    const allocated = [];
    const shortfallsRaw = [];

    for (const bom of bomRows) {
      const totalRequired = bom.required_qty * kit.qty_kits;

      if (!bom.is_subkit) {
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
        continue;
      }

      // Sub-kit — "complete kits built so far" = the scarcest component's contribution
      const comps = componentsBySubKit[bom.item_code] || [];
      let builtKits = comps.length ? Infinity : 0;
      const componentDetail = comps.map(c => {
        const allocQty = allocMap[c.component_item_code]?.allocated_qty || 0;
        const builtFromThis = Math.floor(allocQty / c.qty_per_unit);
        builtKits = Math.min(builtKits, builtFromThis);
        return {
          item_code: c.component_item_code,
          item_name: c.component_name,
          qty_per_unit: c.qty_per_unit,
          allocated_qty: allocQty,
        };
      });
      if (builtKits === Infinity) builtKits = 0;

      if (builtKits >= totalRequired) {
        allocated.push({
          item_code: bom.item_code,
          item_name: bom.item_name,
          required_qty: totalRequired,
          allocated_qty: builtKits,
          is_subkit: true,
          components: componentDetail,
        });
      } else {
        shortfallsRaw.push({
          item_code: bom.item_code,
          item_name: bom.item_name,
          required_qty: totalRequired,
          allocated_qty: builtKits,
          shortfall_qty: totalRequired - builtKits,
          is_subkit: true,
          components: componentDetail,
        });
      }
    }

    // For every shortfall, check what's CURRENTLY available (same 80% rule)
    // so the UI can flag "now coverable" shortfalls. One batched query for
    // every raw item_code involved — standalone shortfalls plus every
    // component of every short sub-kit.
    const rawCodesToCheck = new Set();
    for (const s of shortfallsRaw) {
      if (s.is_subkit) s.components.forEach(c => rawCodesToCheck.add(c.item_code));
      else rawCodesToCheck.add(s.item_code);
    }

    const stockMap = {};
    if (rawCodesToCheck.size > 0) {
      const codes = [...rawCodesToCheck];
      const placeholders = codes.map(() => "?").join(",");
      const [stockRows] = await conn.query(
        `SELECT item_code, SUM(qty_received - qty_issued) AS current_available
         FROM stock_batches
         WHERE item_code IN (${placeholders})
           AND status = 'active'
           AND (qty_received - qty_issued) > 0
           AND (expiry_date IS NULL OR expiry_date >= CURDATE())
           AND (
             mfg_date IS NULL OR expiry_date IS NULL
             OR (DATEDIFF(expiry_date, CURDATE()) / DATEDIFF(expiry_date, mfg_date) * 100 >= 80)
           )
         GROUP BY item_code`,
        codes
      );
      for (const row of stockRows) stockMap[row.item_code] = Number(row.current_available);
    }

    const shortfalls = shortfallsRaw.map(s => {
      if (!s.is_subkit) {
        const currentAvailable = stockMap[s.item_code] || 0;
        return {
          ...s,
          current_available: currentAvailable,
          now_coverable: currentAvailable >= s.shortfall_qty,
          still_needed: Math.max(0, s.shortfall_qty - currentAvailable),
        };
      }
      // Sub-kit: "now coverable" kit count = scarcest component's current stock / its qty_per_unit
      const currentBuildable = s.components.reduce((min, c) => {
        const avail = stockMap[c.item_code] || 0;
        return Math.min(min, Math.floor(avail / c.qty_per_unit));
      }, Infinity);
      const buildableNow = currentBuildable === Infinity ? 0 : Math.max(0, currentBuildable);
      return {
        ...s,
        current_available: buildableNow,
        now_coverable: buildableNow >= s.shortfall_qty,
        still_needed: Math.max(0, s.shortfall_qty - buildableNow),
      };
    });

    res.json({ kit, allocated, shortfalls });
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
});

// POST /api/kit-assembly/:kit_id/complete
// Manual fallback for completePartialKit() — normally shortfalls resolve on
// their own via autoCompletePartialKits() right after stock is received, but
// this stays available for edge cases (e.g. stock that arrived before this
// feature existed, or a retry after a transient failure).
router.post("/:kit_id/complete", requireRole("admin", "superadmin"), async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const result = await completePartialKit(conn, req.params.kit_id);
    if (!result.ok) return res.status(result.code).json({ error: result.error });
    res.json({
      kit_id: result.kit_id,
      status: result.status,
      items_completed: result.items_completed,
      remaining_shortfalls: result.remaining_shortfalls,
    });
  } catch (err) {
    console.error("Kit completion error:", err.message);
    res.status(500).json({ error: err.message || "Completion failed" });
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
module.exports.autoCompletePartialKits = autoCompletePartialKits;
