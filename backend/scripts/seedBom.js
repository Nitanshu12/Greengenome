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

function parseSheet() {
  const wb = XLSX.readFile(process.env.BOM_XLSX || "/Users/nitanshugoyal/Downloads/BILL OF MATERIAL.xlsx");
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });

  // Row 0 = header, data starts at row 1
  // Col 0 = item_code (GGIPL - 1), Col 1 = item_name, Col 2 = required_qty
  const data = [];
  for (const r of rows.slice(1)) {
    const itemCode  = r[0] ? String(r[0]).trim() : null;
    const itemName  = r[1] ? String(r[1]).trim() : null;
    const qty       = r[2] != null && r[2] !== "" ? parseInt(r[2], 10) : 0;

    if (!itemCode || !itemName) continue;
    data.push({ item_code: itemCode, item_name: itemName, required_qty: qty });
  }
  return data;
}

async function seed() {
  const rows = parseSheet();
  console.log(`📋 Parsed ${rows.length} BOM entries`);

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    let inserted = 0, updated = 0;
    for (const r of rows) {
      const [result] = await conn.query(
        `INSERT INTO bom_disaster (item_code, item_name, required_qty)
         VALUES (?,?,?)
         ON DUPLICATE KEY UPDATE
           item_name    = VALUES(item_name),
           required_qty = VALUES(required_qty)`,
        [r.item_code, r.item_name, r.required_qty]
      );
      if (result.affectedRows === 1) inserted++; else updated++;
    }

    await conn.commit();
    console.log(`\n✅ Seed complete`);
    console.log(`   BOM entries: ${inserted} inserted, ${updated} updated`);
  } catch (err) {
    await conn.rollback();
    console.error("❌ Seed failed, rolled back:", err.message);
    throw err;
  } finally {
    conn.release();
    await pool.end();
  }
}

seed().catch(e => { console.error(e); process.exit(1); });
