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

function normalizeReusable(raw) {
  return String(raw || "").trim().toLowerCase().includes("reusable");
}

function normalizeGst(raw) {
  const n = parseFloat(raw);
  if (isNaN(n)) return 0;
  return n > 0 && n < 1 ? Math.round(n * 100 * 100) / 100 : n;
}

async function seed() {
  const wb = XLSX.readFile("/Users/nitanshugoyal/Downloads/Items_master seed .xlsx");
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });

  let inserted = 0, skipped = 0, failed = 0;
  const errors = [];

  for (const row of rows) {
    const item_code = String(row["Item Code"] || "").trim();
    const name      = String(row["Product"]   || "").trim();

    if (!item_code || !name) { skipped++; continue; }

    const category         = String(row["category"]               || "Other").trim() || "Other";
    const category2        = String(row["Category2"]              || "").trim() || null;
    const sub_category     = String(row["__EMPTY"]                || "").trim() || null;
    const product_category = String(row["Product Category"]       || "").trim() || null;
    const material         = String(row["Material"]               || "").trim() || null;
    const specification    = String(row["product Specification"]  || "").trim() || null;
    const is_reusable      = normalizeReusable(row["One time use/Reusable"]) ? 1 : 0;
    const unit             = normalizeUnit(row["Unit"]);
    const unit_cost        = parseFloat(row["Unit Cost (₹)"]) || 0;
    const gst_percent      = normalizeGst(row["gst"]);
    const min_stock        = parseInt(row["Min Threshold"]) || 0;

    try {
      await pool.query(
        `INSERT INTO items
           (item_code, name, specification,
            category, category2, sub_category, product_category, material,
            is_reusable, unit, unit_cost, gst_percent, min_stock)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
         ON DUPLICATE KEY UPDATE item_code = item_code`,
        [
          item_code, name, specification,
          category, category2, sub_category, product_category, material,
          is_reusable, unit, unit_cost, gst_percent, min_stock
        ]
      );
      inserted++;
    } catch (err) {
      failed++;
      errors.push({ item_code, error: err.message });
    }
  }

  console.log(`\n✅ Done`);
  console.log(`   Inserted : ${inserted}`);
  console.log(`   Skipped  : ${skipped} (blank code or name)`);
  console.log(`   Failed   : ${failed}`);
  if (errors.length) {
    console.log("\n❌ Errors:");
    errors.forEach(e => console.log(`   ${e.item_code}: ${e.error}`));
  }

  await pool.end();
}

seed().catch(err => {
  console.error("Fatal:", err.message);
  process.exit(1);
});
