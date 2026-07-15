const router = require("express").Router();
const XLSX = require("xlsx");
const path = require("path");
const fs = require("fs");
const pool = require("../db/postgres");
const { loadKitDataFromFile, summarizeKitData } = require("../utils/kitExcel");
const { parseJsonColumn } = require("../utils/jsonColumn");
const { requireLogin } = require("../middleware/auth");

const uploadsDir = path.join(__dirname, "../uploads");

/** Legacy kit_files rows may lack brand_counts/expired_count/warning_count — derive from the stored Excel once per request. */
function effectiveSummaryStats(kitRow) {
  const brandCounts = parseJsonColumn(kitRow.brand_counts);
  if (
    brandCounts &&
    typeof brandCounts === "object" &&
    typeof kitRow.expired_count === "number" &&
    typeof kitRow.warning_count === "number"
  ) {
    return { brandCounts, expired: kitRow.expired_count, warning: kitRow.warning_count };
  }
  if (!kitRow.stored_file) return { brandCounts: {}, expired: 0, warning: 0 };
  const filePath = path.join(uploadsDir, kitRow.stored_file);
  if (!fs.existsSync(filePath)) return { brandCounts: {}, expired: 0, warning: 0 };
  const rows = loadKitDataFromFile(filePath);
  return summarizeKitData(rows);
}

// ════════════════════════════════════════════════════════════
// GET all kit names (for sidebar/dropdown)
// GET /api/kits
// ════════════════════════════════════════════════════════════
router.get("/kits", requireLogin, async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT DISTINCT kit_name FROM kit_files");
    res.json({ kits: rows.map(r => r.kit_name).sort() });
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
    const [[kitFile]] = await pool.query(
      "SELECT data, stored_file FROM kit_files WHERE kit_name = ?", [kitName]
    );
    if (!kitFile) {
      return res.json({ data: [] });
    }

    const data = parseJsonColumn(kitFile.data);
    if (data && data.length > 0) {
      return res.json({ data });
    }

    if (!kitFile.stored_file) {
      return res.json({ data: [] });
    }
    const filePath = path.join(uploadsDir, kitFile.stored_file);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: "File missing on server" });
    }
    const fallbackData = loadKitDataFromFile(filePath);
    res.json({ data: fallbackData });
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
    const [files] = await pool.query(
      "SELECT kit_name, row_count, brand_counts, expired_count, warning_count, stored_file FROM kit_files"
    );

    const kits = files.length;
    const totalItems = files.reduce((s, f) => s + (f.row_count || 0), 0);
    const totalFiles = files.length;

    const sortedByCount = [...files].sort(
      (a, b) => (b.row_count || 0) - (a.row_count || 0)
    );
    const itemsPerKit = sortedByCount.map(f => ({
      _id: f.kit_name,
      count: f.row_count || 0
    }));

    const mergedBrands = {};
    let expired = 0;
    let warning = 0;
    for (const f of files) {
      const stats = effectiveSummaryStats(f);
      const bc = stats.brandCounts || {};
      for (const [brand, c] of Object.entries(bc)) {
        mergedBrands[brand] = (mergedBrands[brand] || 0) + c;
      }
      expired += stats.expired || 0;
      warning += stats.warning || 0;
    }
    const brandEntries = Object.entries(mergedBrands)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);

    res.json({
      summary: {
        kits,
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
          labels: brandEntries.map(e => e[0]),
          values: brandEntries.map(e => e[1])
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
    const [[kitFile]] = await pool.query(
      "SELECT data, stored_file FROM kit_files WHERE kit_name = ?", [kitName]
    );
    if (!kitFile) {
      return res.status(404).json({ error: "No data found for this kit" });
    }

    let data = [];
    const parsedData = parseJsonColumn(kitFile.data);
    if (parsedData && parsedData.length > 0) {
      data = parsedData;
    } else if (kitFile.stored_file) {
      const filePath = path.join(uploadsDir, kitFile.stored_file);
      if (fs.existsSync(filePath)) {
        data = loadKitDataFromFile(filePath);
      }
    }

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
    const [[kitFile]] = await pool.query(
      "SELECT stored_file, original_file FROM kit_files WHERE kit_name = ?", [kitName]
    );

    if (!kitFile) return res.status(404).json({ error: "Original file not found" });

    const filePath = path.join(uploadsDir, kitFile.stored_file || "");
    if (!kitFile.stored_file || !fs.existsSync(filePath)) {
      return res.redirect(`/api/kits/${encodeURIComponent(kitName)}/download`);
    }

    res.download(filePath, kitFile.original_file);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
