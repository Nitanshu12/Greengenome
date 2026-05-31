require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const XLSX = require("xlsx");
const mysql = require("mysql2/promise");

const pool = mysql.createPool({
  host:     process.env.DB_HOST     || "localhost",
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  charset:  "utf8mb4",
  waitForConnections: true,
  connectionLimit: 5
});

const EXCEL_PATH = process.env.ITEMS_XLSX || "/Users/nitanshugoyal/Downloads/ITEM LIST.xlsx";

function normalizeUnit(raw) {
  const u = String(raw || "").trim().toLowerCase();
  if (!u) return "Piece";
  if (u === "piece" || u === "pieces") return "Piece";
  if (u === "packet" || u === "packets" || u === "pack") return "Pack";
  if (u === "box") return "Box";
  if (u === "bottle" || u === "bottles") return "Bottle";
  if (u === "vial" || u === "vials" || u.startsWith("vial")) return "Vial";
  if (u === "sachet") return "Pack";
  if (u === "tablet" || u === "tablets") return "Piece";
  if (u === "kg") return "Kg";
  if (u === "litre" || u === "liter") return "Litre";
  if (u === "metre" || u === "meter") return "Metre";
  if (u === "roll") return "Roll";
  if (u === "pair") return "Pair";
  if (u === "set") return "Set";
  if (u === "strip") return "Strip";
  return "Piece";
}

async function seed() {
  const wb = XLSX.readFile(EXCEL_PATH);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });

  console.log(`📋 Read ${rows.length} rows from Excel`);

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Clear existing data — item_vendors first (it has a FK to items),
    // then items. SET FOREIGN_KEY_CHECKS = 0 lets us TRUNCATE in any order.
    await conn.query("SET FOREIGN_KEY_CHECKS = 0");
    await conn.query("TRUNCATE TABLE item_vendors");
    await conn.query("TRUNCATE TABLE items");
    await conn.query("SET FOREIGN_KEY_CHECKS = 1");
    console.log("🗑️  Cleared item_vendors and items tables");

    let inserted = 0, skipped = 0, failed = 0;
    const errors = [];

    for (const row of rows) {
      const item_code = String(row["Sr. No"]  || "").trim();
      const name      = String(row["Product"] || "").trim();

      if (!item_code || !name) { skipped++; continue; }

      const category         = String(row["Industry Type"]         || "Other").trim() || "Other";
      const product_category = String(row["Product Category"]      || "").trim() || null;
      const material         = String(row["Material"]              || "").trim() || null;
      const specification    = String(row["SPECIFICATION"]         || "").trim() || null;
      const brand            = String(row["BRAND FOR SPECIAL KIT"] || "").trim() || null;
      const unit             = normalizeUnit(row["UOM"]);
      const unit_cost        = parseFloat(row["Unit Cost"])  || 0;
      const gst_percent      = parseFloat(row["GST %"])      || 0;
      const min_stock        = parseInt(row["MIN STOCK"])    || 0;

      try {
        await conn.query(
          `INSERT INTO items
             (item_code, name, specification,
              category, product_category, material, brand,
              unit, unit_cost, gst_percent, min_stock)
           VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
          [
            item_code, name, specification,
            category, product_category, material, brand,
            unit, unit_cost, gst_percent, min_stock
          ]
        );
        inserted++;
      } catch (err) {
        failed++;
        errors.push({ item_code, error: err.message });
      }
    }

    await conn.commit();

    console.log(`\n✅ Done`);
    console.log(`   Inserted : ${inserted}`);
    console.log(`   Skipped  : ${skipped} (blank Sr. No or Product)`);
    console.log(`   Failed   : ${failed}`);
    if (errors.length) {
      console.log("\n❌ Errors:");
      errors.forEach(e => console.log(`   ${e.item_code}: ${e.error}`));
    }
  } catch (err) {
    await conn.rollback();
    console.error("❌ Seed failed, rolled back:", err.message);
    throw err;
  } finally {
    conn.release();
    await pool.end();
  }
}

seed().catch(err => {
  console.error("Fatal:", err.message);
  process.exit(1);
});
