require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const XLSX   = require("xlsx");
const pool   = require("../db/postgres");
const path   = require("path");

const FILE = process.argv[2] || path.join(__dirname, "../../VENDOR LIST.xlsx");

async function seed() {
  const wb   = XLSX.readFile(FILE);
  const ws   = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

  // Skip header row
  const data = rows.slice(1);

  const pairs = [];
  let lastItemCode = null;

  for (const row of data) {
    const rawCode   = row[0];   // Sr. No  = item_code
    const rawVendor = row[5];   // VENDOR CODE

    // Forward-fill item_code: if blank, use the last seen code
    if (rawCode !== null && rawCode !== undefined && String(rawCode).trim() !== "") {
      lastItemCode = String(rawCode).trim();
    }

    const vendor_code = rawVendor !== null && rawVendor !== undefined
      ? String(rawVendor).trim()
      : null;

    if (!lastItemCode || !vendor_code) continue; // both must exist to form a link

    pairs.push([lastItemCode, vendor_code]);
  }

  console.log(`📋 Parsed ${pairs.length} item-vendor pairs from Excel`);

  const conn = await pool.getConnection();
  try {
    // Clear existing data
    await conn.query("DELETE FROM item_vendors");
    console.log("🗑️  Cleared existing item_vendors rows");

    let inserted = 0;
    let skipped  = 0;

    for (const [item_code, vendor_code] of pairs) {
      try {
        await conn.query(
          `INSERT INTO item_vendors (item_code, vendor_code) VALUES (?, ?)`,
          [item_code, vendor_code]
        );
        inserted++;
      } catch (err) {
        // FK violation = item_code or vendor_code doesn't exist in master tables
        if (err.code === "ER_NO_REFERENCED_ROW_2") {
          console.warn(`  ⚠️  Skipped (not in master): item=${item_code}, vendor=${vendor_code}`);
          skipped++;
        } else if (err.code === "ER_DUP_ENTRY") {
          console.warn(`  ⚠️  Duplicate skipped: item=${item_code}, vendor=${vendor_code}`);
          skipped++;
        } else {
          throw err;
        }
      }
    }

    console.log(`✅ Inserted: ${inserted}  |  Skipped: ${skipped}`);
  } finally {
    conn.release();
    process.exit(0);
  }
}

seed().catch(err => {
  console.error("❌ Seed failed:", err.message);
  process.exit(1);
});
