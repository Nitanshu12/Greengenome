
require("dotenv").config({ path: require("path").join(__dirname, "../.env") });

const XLSX = require("xlsx");
const pool = require("../db/postgres");

const FILE_PATH = process.argv[2];
if (!FILE_PATH) {
  console.error("Usage: node scripts/seedStockBatches.js /path/to/STOCK\\ LIST.xlsx");
  process.exit(1);
}

function excelDateToStr(serial) {
  if (!serial) return null;
  if (typeof serial === "string" && serial.includes("-")) return serial;
  const d = new Date((serial - 25569) * 86400 * 1000);
  return d.toISOString().slice(0, 10);
}

async function run() {
  const wb = XLSX.readFile(FILE_PATH);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json(ws, { defval: null });
  console.log(`📄 Loaded ${raw.length} rows from Excel`);

  const conn = await pool.getConnection();
  try {
    // 1. Upsert all vendors found in sheet
    const vendorCodes = [...new Set(raw.map(r => r["Vendor Code"]).filter(Boolean))];
    for (const vc of vendorCodes) {
      await conn.query(
        `INSERT IGNORE INTO vendors (vendor_code, business_name) VALUES (?, ?)`,
        [vc.trim(), vc.trim()]
      );
    }
    console.log(`🏪 ${vendorCodes.length} vendors ensured`);

    // 2. Upsert all items found in sheet
    const itemMap = new Map();
    for (const r of raw) {
      const code = r["Item Code"]?.trim();
      const name = r["Item Name"]?.trim();
      if (code && !itemMap.has(code)) itemMap.set(code, name || code);
    }
    for (const [code, name] of itemMap) {
      await conn.query(
        `INSERT IGNORE INTO items (item_code, name, category, unit, unit_cost, gst_percent, min_stock)
         VALUES (?, ?, 'General', 'Piece', 0, 0, 0)`,
        [code, name]
      );
    }
    console.log(`🗂  ${itemMap.size} items ensured`);

    // 3. Insert all stock_batches
    let inserted = 0, skipped = 0;
    for (const r of raw) {
      const itemCode   = r["Item Code"]?.trim();
      if (!itemCode) { skipped++; continue; }

      const vendorCode      = r["Vendor Code"]?.trim() || null;
      const supplierBatchNo = r["Batch No. "]?.toString().trim() || null;
      const mfgDate         = excelDateToStr(r["Mfg Date"]);
      const expiryDate      = excelDateToStr(r["Expiry Date"]) ?? null;
      const qtyReceived     = Number(r["Stock in Hand "]) || 0;
      const storageLocation = r["Storage Location"]?.trim() || null;
      const remarks         = r["Remarks"]?.trim() || null;

      try {
        await conn.query(
          `INSERT IGNORE INTO stock_batches
             (supplier_batch_no, item_code, vendor_code, mfg_date, expiry_date,
              qty_received, qty_issued, unit, storage_location, status, remarks)
           VALUES (?, ?, ?, ?, ?, ?, 0, 'Piece', ?, 'active', ?)`,
          [supplierBatchNo, itemCode, vendorCode, mfgDate, expiryDate,
           qtyReceived, storageLocation, remarks]
        );
        inserted++;
      } catch (err) {
        console.warn(`  ⚠️  Row skipped (${itemCode}): ${err.message}`);
        skipped++;
      }
    }

    console.log(`✅ Done — ${inserted} batches inserted, ${skipped} skipped`);
  } finally {
    conn.release();
    process.exit(0);
  }
}

run().catch(err => {
  console.error("❌ Seed failed:", err.message);
  process.exit(1);
});
