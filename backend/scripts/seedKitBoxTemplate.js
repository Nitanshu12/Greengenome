require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const XLSX = require("xlsx");
const mysql = require("mysql2/promise");

const pool = mysql.createPool({
  host:     process.env.DB_HOST     || "localhost",
  port:     process.env.DB_PORT     || 3306,
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  charset:  "utf8mb4",
  waitForConnections: true,
  connectionLimit: 5
});

function normalize(name) {
  return String(name).trim().toUpperCase().replace(/\s+/g, " ");
}

// Cube/box/title are only written on the first row of each box in the
// source sheet — every following row leaves those columns blank, meaning
// "same as above". We carry the last-seen cube/box forward row by row.
function parseSheet() {
  const wb = XLSX.readFile(process.env.BOX_TEMPLATE_XLSX || "/Users/nitanshugoyal/Downloads/CUBE_BOX_Item_Software.xlsx");
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

  // Col A = cube_no, Col C = box_no, Col E = item name, Col F = qty
  const data = [];
  let lastCube = null;
  let lastBox = null;

  for (const r of rows) {
    const cubeCell = r[0];
    const boxCell  = r[2];
    const itemCell = r[4];
    const qtyCell  = r[5];

    if (typeof cubeCell === "number") lastCube = cubeCell;
    if (boxCell !== null && boxCell !== undefined && boxCell !== "") lastBox = boxCell;

    if (!itemCell || lastCube === null || lastBox === null) continue;

    data.push({
      cube_no: lastCube,
      box_no: String(lastBox),
      item_name: String(itemCell).trim(),
      qty: qtyCell != null && qtyCell !== "" ? parseInt(qtyCell, 10) : 1,
    });
  }
  return data;
}

async function seed() {
  const rows = parseSheet();
  console.log(`📦 Parsed ${rows.length} box-template rows from the Excel`);

  const conn = await pool.getConnection();
  try {
    // Excel-pasted item names carry odd Unicode (narrow no-break spaces, en
    // dashes, ×). Target item_name_raw specifically — a table-wide CONVERT
    // fails because item_code is locked by a foreign key constraint.
    await conn.query(`ALTER TABLE kit_box_template MODIFY COLUMN item_name_raw VARCHAR(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL`);

    const [[{ existing }]] = await conn.query("SELECT COUNT(*) AS existing FROM kit_box_template");
    if (existing > 0) {
      console.log(`⚠ kit_box_template already has ${existing} rows — aborting so nothing is overwritten. Truncate it manually first if you want to reseed.`);
      return;
    }

    const [items] = await conn.query("SELECT item_code, name FROM items");
    const byName = new Map();
    for (const i of items) byName.set(normalize(i.name), i.item_code);

    let matched = 0;
    let unmatched = 0;
    let rowOrder = 1;

    await conn.query("START TRANSACTION");
    for (const row of rows) {
      const itemCode = byName.get(normalize(row.item_name)) || null;
      if (itemCode) matched++; else unmatched++;

      await conn.query(
        `INSERT INTO kit_box_template (cube_no, box_no, item_code, item_name_raw, qty, row_order)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [row.cube_no, row.box_no, itemCode, itemCode ? null : row.item_name, row.qty, rowOrder++]
      );
    }
    await conn.query("COMMIT");

    console.log(`✅ Inserted ${rows.length} rows — ${matched} matched to an existing item, ${unmatched} left unmatched (raw name kept, no item_code yet)`);
  } catch (err) {
    await conn.query("ROLLBACK");
    console.error("❌ Seed failed:", err.message);
    throw err;
  } finally {
    conn.release();
    await pool.end();
  }
}

seed().catch(() => process.exit(1));
