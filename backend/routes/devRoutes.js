/**
 * DEV-ONLY routes — mirrors production API but uses MongoDB instead of MariaDB.
 * Mounted in server.js only when NODE_ENV=development.
 */
const router = require("express").Router();
const { requireLogin, requireRole } = require("../middleware/auth");
const DevItem        = require("../models/DevItem");
const DevVendor      = require("../models/DevVendor");
const DevItemVendor  = require("../models/DevItemVendor");
const DevBom         = require("../models/DevBom");
const DevStockBatch  = require("../models/DevStockBatch");

const adminOnly = [requireLogin, requireRole("admin", "superadmin")];

// ── ITEMS ──────────────────────────────────────────────────────────────
router.get("/items", requireLogin, async (req, res) => {
  try {
    const { q = "", category = "" } = req.query;
    const filter = {};
    if (q) filter.$or = [
      { item_code: new RegExp(q, "i") },
      { name: new RegExp(q, "i") }
    ];
    if (category) filter.category = category;
    const items = await DevItem.find(filter).sort({ item_code: 1 }).lean();
    res.json({ data: items });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get("/items/categories", requireLogin, async (req, res) => {
  try {
    const cats = await DevItem.distinct("category");
    res.json({ data: cats.filter(Boolean).sort() });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get("/items/next-code", requireLogin, async (req, res) => {
  try {
    const last = await DevItem.findOne().sort({ item_code: -1 }).lean();
    const lastCode = last?.item_code || "";
    const match = lastCode.match(/^(.*?)(\d+)$/);
    const prefix  = match ? match[1] : "ITM-";
    const lastNum = match ? parseInt(match[2], 10) : 0;
    const padLen  = match ? match[2].length : 3;
    res.json({ next_code: prefix + String(lastNum + 1).padStart(padLen, "0") });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post("/items", ...adminOnly, async (req, res) => {
  try {
    const item = await DevItem.create(req.body);
    res.status(201).json({ msg: "Item created", data: item });
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ error: "Item code already exists" });
    res.status(500).json({ error: err.message });
  }
});

router.put("/items/:item_code", ...adminOnly, async (req, res) => {
  try {
    const item = await DevItem.findOneAndUpdate(
      { item_code: req.params.item_code }, req.body, { new: true }
    );
    if (!item) return res.status(404).json({ error: "Item not found" });
    res.json({ msg: "Item updated", data: item });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete("/items/:item_code", ...adminOnly, async (req, res) => {
  try {
    const item = await DevItem.findOneAndDelete({ item_code: req.params.item_code });
    if (!item) return res.status(404).json({ error: "Item not found" });
    res.json({ msg: `Item "${item.name}" deleted` });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── VENDORS ────────────────────────────────────────────────────────────
router.get("/vendors", requireLogin, async (req, res) => {
  try {
    const { q = "" } = req.query;
    const filter = q ? { $or: [
      { vendor_code: new RegExp(q, "i") },
      { business_name: new RegExp(q, "i") }
    ]} : {};
    const vendors = await DevVendor.find(filter).sort({ vendor_code: 1 }).lean();
    res.json({ data: vendors });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post("/vendors", ...adminOnly, async (req, res) => {
  try {
    const vendor = await DevVendor.create(req.body);
    res.status(201).json({ msg: "Vendor created", data: vendor });
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ error: "Vendor code already exists" });
    res.status(500).json({ error: err.message });
  }
});

router.put("/vendors/:id", ...adminOnly, async (req, res) => {
  try {
    const vendor = await DevVendor.findOneAndUpdate(
      { vendor_code: req.params.id }, req.body, { new: true }
    );
    if (!vendor) return res.status(404).json({ error: "Vendor not found" });
    res.json({ msg: "Vendor updated", data: vendor });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete("/vendors/:id", ...adminOnly, async (req, res) => {
  try {
    const vendor = await DevVendor.findOneAndDelete({ vendor_code: req.params.id });
    if (!vendor) return res.status(404).json({ error: "Vendor not found" });
    res.json({ msg: "Vendor deleted" });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── ITEM-VENDORS ───────────────────────────────────────────────────────
router.get("/item-vendors", requireLogin, async (req, res) => {
  try {
    const links = await DevItemVendor.find().lean();
    const items   = await DevItem.find().lean();
    const vendors = await DevVendor.find().lean();
    const enriched = links.map(l => ({
      ...l,
      item_name:   items.find(i => i.item_code === l.item_code)?.name || l.item_code,
      vendor_name: vendors.find(v => v.vendor_code === l.vendor_code)?.business_name || l.vendor_code,
    }));
    res.json({ data: enriched });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get("/item-vendors/vendors-list", requireLogin, async (req, res) => {
  try {
    const vendors = await DevVendor.find().select("vendor_code business_name").lean();
    res.json({ data: vendors });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get("/item-vendors/items-list", requireLogin, async (req, res) => {
  try {
    const items = await DevItem.find().select("item_code name unit").lean();
    res.json({ data: items });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post("/item-vendors", ...adminOnly, async (req, res) => {
  try {
    const link = await DevItemVendor.create(req.body);
    res.status(201).json({ msg: "Link created", data: link });
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ error: "Link already exists" });
    res.status(500).json({ error: err.message });
  }
});

router.put("/item-vendors/:item_code/:vendor_code", ...adminOnly, async (req, res) => {
  try {
    const link = await DevItemVendor.findOneAndUpdate(
      { item_code: req.params.item_code, vendor_code: req.params.vendor_code },
      req.body, { new: true }
    );
    if (!link) return res.status(404).json({ error: "Link not found" });
    res.json({ msg: "Link updated", data: link });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete("/item-vendors/:item_code/:vendor_code", ...adminOnly, async (req, res) => {
  try {
    await DevItemVendor.findOneAndDelete({
      item_code: req.params.item_code,
      vendor_code: req.params.vendor_code
    });
    res.json({ msg: "Link deleted" });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get("/item-vendors/documents/:vendor_code", requireLogin, async (req, res) => {
  res.json({ data: [] });
});
router.post("/item-vendors/documents", ...adminOnly, async (req, res) => {
  res.json({ msg: "Docs not available in dev mode" });
});
router.delete("/item-vendors/documents/:id", ...adminOnly, async (req, res) => {
  res.json({ msg: "Docs not available in dev mode" });
});

// ── BOM DISASTER ───────────────────────────────────────────────────────
router.get("/bom-disaster", requireLogin, async (req, res) => {
  try {
    const { q = "" } = req.query;
    const filter = q ? { $or: [
      { item_code: new RegExp(q, "i") },
      { item_name: new RegExp(q, "i") }
    ]} : {};
    const bom = await DevBom.find(filter).lean();
    res.json({ data: bom });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post("/bom-disaster", ...adminOnly, async (req, res) => {
  try {
    const entry = await DevBom.create(req.body);
    res.status(201).json({ msg: "BOM entry created", data: entry });
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ error: "BOM entry already exists" });
    res.status(500).json({ error: err.message });
  }
});

router.put("/bom-disaster/:code", ...adminOnly, async (req, res) => {
  try {
    const entry = await DevBom.findOneAndUpdate(
      { item_code: req.params.code }, req.body, { new: true }
    );
    if (!entry) return res.status(404).json({ error: "Entry not found" });
    res.json({ msg: "BOM entry updated", data: entry });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete("/bom-disaster/:code", ...adminOnly, async (req, res) => {
  try {
    await DevBom.findOneAndDelete({ item_code: req.params.code });
    res.json({ msg: "BOM entry deleted" });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── STOCK BATCHES ──────────────────────────────────────────────────────
router.get("/stock-batches/summary", requireLogin, async (req, res) => {
  try {
    const batches = await DevStockBatch.find({ status: "active" }).lean();
    const items   = await DevItem.find().lean();
    const summary = {};
    for (const b of batches) {
      if (!summary[b.item_code]) {
        const item = items.find(i => i.item_code === b.item_code);
        summary[b.item_code] = {
          item_code: b.item_code,
          item_name: item?.name || b.item_code,
          unit: b.unit,
          qty_in_hand: 0,
          batch_count: 0,
        };
      }
      summary[b.item_code].qty_in_hand += b.qty_received - b.qty_issued;
      summary[b.item_code].batch_count += 1;
    }
    res.json({ data: Object.values(summary) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get("/stock-batches", requireLogin, async (req, res) => {
  try {
    const { q = "", status = "", item_code = "" } = req.query;
    const filter = {};
    if (status)    filter.status = status;
    if (item_code) filter.item_code = item_code;
    let batches = await DevStockBatch.find(filter).sort({ created_at: -1 }).lean();
    const items   = await DevItem.find().lean();
    const vendors = await DevVendor.find().lean();
    let enriched = batches.map(b => ({
      ...b,
      batch_id:    b._id.toString(),
      item_name:   items.find(i => i.item_code === b.item_code)?.name || b.item_code,
      vendor_name: vendors.find(v => v.vendor_code === b.vendor_code)?.business_name || null,
      qty_in_hand: b.qty_received - b.qty_issued,
    }));
    if (q) enriched = enriched.filter(b =>
      b.item_code?.toLowerCase().includes(q.toLowerCase()) ||
      b.item_name?.toLowerCase().includes(q.toLowerCase()) ||
      b.supplier_batch_no?.toLowerCase().includes(q.toLowerCase())
    );
    res.json({ data: enriched });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post("/stock-batches", ...adminOnly, async (req, res) => {
  try {
    const batch = await DevStockBatch.create(req.body);
    res.status(201).json({ msg: "Stock batch created", data: { ...batch.toObject(), batch_id: batch._id.toString() } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put("/stock-batches/:id", ...adminOnly, async (req, res) => {
  try {
    const batch = await DevStockBatch.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!batch) return res.status(404).json({ error: "Batch not found" });
    res.json({ msg: "Batch updated", data: { ...batch.toObject(), batch_id: batch._id.toString() } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post("/stock-batches/:id/issue", ...adminOnly, async (req, res) => {
  try {
    const batch = await DevStockBatch.findById(req.params.id);
    if (!batch) return res.status(404).json({ error: "Batch not found" });
    const qty = Number(req.body.qty) || 0;
    const available = batch.qty_received - batch.qty_issued;
    if (qty > available) return res.status(400).json({ error: `Cannot issue more than available (${available})` });
    batch.qty_issued += qty;
    await batch.save();
    res.json({ msg: "Stock issued", data: { ...batch.toObject(), batch_id: batch._id.toString() } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete("/stock-batches/:id", ...adminOnly, async (req, res) => {
  try {
    await DevStockBatch.findByIdAndDelete(req.params.id);
    res.json({ msg: "Batch deleted" });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── DEV SEED endpoint — POST /api/dev/seed ────────────────────────────
router.post("/dev/seed", ...adminOnly, async (req, res) => {
  try {
    await DevItem.deleteMany({});
    await DevVendor.deleteMany({});
    await DevItemVendor.deleteMany({});
    await DevBom.deleteMany({});
    await DevStockBatch.deleteMany({});

    const vendors = await DevVendor.insertMany([
      { vendor_code: "VC0001", business_name: "MedSupply India Pvt Ltd", phone: "9811234567", email: "sales@medsupply.in", contact_person: "Raj Kumar" },
      { vendor_code: "VC0002", business_name: "PharmaCorp Ltd", phone: "9822345678", email: "info@pharmacorp.com", contact_person: "Anjali Singh" },
      { vendor_code: "VC0003", business_name: "SurgTech Solutions", phone: "9833456789", email: "order@surgtech.in", contact_person: "Vikram Sharma" },
    ]);

    const items = await DevItem.insertMany([
      { item_code: "ITM-001", name: "Paracetamol 500mg Tablet", specification: "Strip of 10 tablets", category: "Pharma", unit: "Strip", unit_cost: 25, gst_percent: 12, min_stock: 100 },
      { item_code: "ITM-002", name: "Surgical Gloves (Medium)", specification: "Latex-free, powder-free", category: "Non-Pharma", unit: "Box", unit_cost: 320, gst_percent: 18, min_stock: 50 },
      { item_code: "ITM-003", name: "IV Cannula 20G", specification: "With injection port", category: "Pharma", unit: "Piece", unit_cost: 45, gst_percent: 12, min_stock: 200 },
      { item_code: "ITM-004", name: "Amoxicillin 500mg Cap", specification: "Box of 10 capsules", category: "Pharma", unit: "Box", unit_cost: 85, gst_percent: 12, min_stock: 80 },
      { item_code: "ITM-005", name: "BP Monitor Digital", specification: "Arm type, automatic", category: "Non-Pharma", unit: "Piece", unit_cost: 1500, gst_percent: 18, min_stock: 5 },
    ]);

    await DevStockBatch.insertMany([
      { supplier_batch_no: "GGIPL-001", item_code: "ITM-001", vendor_code: "VC0001", mfg_date: new Date("2024-01-01"), expiry_date: new Date("2026-12-31"), qty_received: 500, qty_issued: 120, unit: "Strip", storage_location: "WAREHOUSE-A", status: "active" },
      { supplier_batch_no: "GGIPL-002", item_code: "ITM-002", vendor_code: "VC0002", mfg_date: new Date("2024-06-01"), expiry_date: new Date("2027-05-31"), qty_received: 100, qty_issued: 20, unit: "Box", storage_location: "WAREHOUSE-B", status: "active" },
      { supplier_batch_no: "GGIPL-003", item_code: "ITM-003", vendor_code: "VC0001", mfg_date: new Date("2024-03-01"), expiry_date: new Date("2026-06-15"), qty_received: 300, qty_issued: 50, unit: "Piece", storage_location: "WAREHOUSE-A", status: "active" },
      { supplier_batch_no: "GGIPL-004", item_code: "ITM-004", vendor_code: "VC0003", mfg_date: new Date("2023-11-01"), expiry_date: new Date("2025-10-31"), qty_received: 200, qty_issued: 200, unit: "Box", storage_location: "WAREHOUSE-C", status: "expired" },
      { supplier_batch_no: "GGIPL-005", item_code: "ITM-005", vendor_code: "VC0002", mfg_date: new Date("2024-09-01"), expiry_date: new Date("2028-08-31"), qty_received: 10, qty_issued: 2, unit: "Piece", storage_location: "WAREHOUSE-B", status: "active" },
    ]);

    res.json({ msg: "✅ Dev seed complete — items, vendors, stock batches loaded into MongoDB" });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── DEV CLEAR endpoint — DELETE /api/dev/clear ────────────────────────
router.delete("/dev/clear", ...adminOnly, async (req, res) => {
  try {
    await DevItem.deleteMany({});
    await DevVendor.deleteMany({});
    await DevItemVendor.deleteMany({});
    await DevBom.deleteMany({});
    await DevStockBatch.deleteMany({});
    res.json({ msg: "✅ All dev data cleared from MongoDB" });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
