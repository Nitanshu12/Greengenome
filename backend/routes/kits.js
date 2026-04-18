const router = require("express").Router();
const XLSX = require("xlsx");
const path = require("path");
const fs = require("fs");
const { KitItem, KitFile } = require("../models/Kit");
const { requireLogin } = require("../middleware/auth");

// ════════════════════════════════════════════════════════════
// GET all kit names (for sidebar/dropdown)
// GET /api/kits
// ════════════════════════════════════════════════════════════
router.get("/kits", requireLogin, async (req, res) => {
  try {
    const kits = await KitItem.distinct("kitName");
    res.json({ kits: kits.sort() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ════════════════════════════════════════════════════════════
// GET data for a specific kit
// GET /api/kits/:kitName/data
// ════════════════════════════════════════════════════════════
router.get("/kits/:kitName/data", requireLogin, async (req, res) => {
  try {
    const kitName = decodeURIComponent(req.params.kitName);
    const data = await KitItem.find({ kitName }).sort({ rowNo: 1 }).lean();
    res.json({ data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ════════════════════════════════════════════════════════════
// DASHBOARD SUMMARY — charts data
// GET /api/dashboard
// ════════════════════════════════════════════════════════════
router.get("/dashboard", requireLogin, async (req, res) => {
  try {
    // Count kits
    const kits = await KitItem.distinct("kitName");

    // Items per kit
    const itemsPerKit = await KitItem.aggregate([
      { $group: { _id: "$kitName", count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    // Brand distribution
    const brandDist = await KitItem.aggregate([
      { $match: { brand: { $ne: "" } } },
      { $group: { _id: "$brand", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]);

    // Expiry alerts
    const today = new Date();
    const in30 = new Date();
    in30.setDate(today.getDate() + 30);

    const allItems = await KitItem.find({ expiry: { $ne: "" } }).lean();
    let expired = 0, warning = 0;
    for (const item of allItems) {
      try {
        const d = new Date(item.expiry);
        if (isNaN(d.getTime())) continue;
        if (d < today) expired++;
        else if (d <= in30) warning++;
      } catch {}
    }

    // Total counts
    const totalItems = await KitItem.countDocuments();
    const totalFiles = await KitFile.countDocuments();

    res.json({
      summary: {
        kits: kits.length,
        totalItems,
        totalFiles,
        expired,
        warning
      },
      charts: {
        itemsPerKit: {
          labels: itemsPerKit.map(k => k._id),
          values: itemsPerKit.map(k => k.count)
        },
        brandDist: {
          labels: brandDist.map(b => b._id),
          values: brandDist.map(b => b.count)
        }
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ════════════════════════════════════════════════════════════
// DOWNLOAD KIT as Excel
// GET /api/kits/:kitName/download
// ════════════════════════════════════════════════════════════
router.get("/kits/:kitName/download", requireLogin, async (req, res) => {
  try {
    const kitName = decodeURIComponent(req.params.kitName);
    const data = await KitItem.find({ kitName }).sort({ rowNo: 1 }).lean();

    if (!data.length) return res.status(404).json({ error: "No data found for this kit" });

    const rows = data.map(p => ({
      CUBE:     p.cube || "",
      BOX:      p.box || "",
      ITEMS:    p.items || "",
      BRAND:    p.brand || "",
      OEM:      p.oem || "",
      TYPE:     p.itemType || "",
      EXPIRY:   p.expiry || "",
      BATCH:    p.batchNo || "",
      DOCUMENT: p.document || "",
      LINK:     p.link || ""
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, kitName.substring(0, 31));

    const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    const safeName = kitName.replace(/[^a-zA-Z0-9_\-]/g, "_");

    res.setHeader("Content-Disposition", `attachment; filename="${safeName}.xlsx"`);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.send(buffer);

  } catch (err) {
    console.error("Download error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ════════════════════════════════════════════════════════════
// DOWNLOAD ORIGINAL uploaded Excel file
// GET /api/kits/:kitName/download-original
// ════════════════════════════════════════════════════════════
router.get("/kits/:kitName/download-original", requireLogin, async (req, res) => {
  try {
    const kitName = decodeURIComponent(req.params.kitName);
    const kitFile = await KitFile.findOne({ kitName });

    if (!kitFile) return res.status(404).json({ error: "Original file not found" });

    const filePath = path.join(__dirname, "../uploads", kitFile.storedFile);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: "File missing on server" });

    res.download(filePath, kitFile.originalFile);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
