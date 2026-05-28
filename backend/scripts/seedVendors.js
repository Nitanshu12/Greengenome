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
  const wb = XLSX.readFile("/Users/nitanshugoyal/Downloads/Vendor's list.xlsx");
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });

  // Columns: 0=item_code, 1=item_name, 2=vendor_code, 3=business_name,
  //          4=address, 5=email, 6=phone, 7=contact_person
  const dataRows = rows.slice(2); // skip title + header rows

  const vendorMap = {};

  for (const r of dataRows) {
    const rawVendorCode   = r[2] ? String(r[2]).trim() : null;
    const rawBusinessName = r[3] ? String(r[3]).trim() : null;

    if (!rawVendorCode || !rawBusinessName) continue;

    if (!vendorMap[rawVendorCode]) {
      vendorMap[rawVendorCode] = {
        vendor_code:    rawVendorCode,
        business_name:  rawBusinessName,
        address:        null,
        email:          null,
        phone:          null,
        contact_person: null,
      };
    }

    const v = vendorMap[rawVendorCode];

    const addr = r[4] ? String(r[4]).replace(/\r\n/g, " ").replace(/\n/g, " ").trim() : null;
    if (addr && (!v.address || addr.length > v.address.length)) v.address = addr;

    const col5 = r[5] ? String(r[5]).trim() : null;
    const col6 = r[6] != null ? String(r[6]).trim() : null;
    const col7 = r[7] ? String(r[7]).trim() : null;

    if (col5 && col5.includes("@") && !v.email) v.email = col5;
    if (col6 && col6.includes("@") && !v.email) v.email = col6;
    if (col7 && col7.includes("@") && !v.email) v.email = col7;

    if (col6 && !col6.includes("@") && !v.phone) v.phone = col6;
    if (col5 && /^\d{7,}$/.test(col5.replace(/\s/g, "")) && !v.phone) v.phone = col5;

    for (const c of [col5, col6, col7].filter(Boolean)) {
      if ((c.startsWith("Mr") || c.startsWith("Ms")) && !v.contact_person) {
        v.contact_person = c;
      }
    }
  }

  return Object.values(vendorMap);
}

async function seed() {
  const vendors = parseSheet();
  console.log(`📋 Parsed ${vendors.length} vendors from Excel`);

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    let inserted = 0, updated = 0;
    for (const v of vendors) {
      const [result] = await conn.query(
        `INSERT INTO vendors (vendor_code, business_name, address, email, phone, contact_person)
         VALUES (?,?,?,?,?,?)
         ON DUPLICATE KEY UPDATE
           business_name   = VALUES(business_name),
           address         = COALESCE(VALUES(address), address),
           email           = COALESCE(VALUES(email), email),
           phone           = COALESCE(VALUES(phone), phone),
           contact_person  = COALESCE(VALUES(contact_person), contact_person)`,
        [v.vendor_code, v.business_name, v.address, v.email, v.phone, v.contact_person]
      );
      // affectedRows=1 → insert, affectedRows=2 → update, affectedRows=0 → no change
      if (result.affectedRows === 1) inserted++;
      else updated++;
    }

    await conn.commit();

    console.log(`\n✅ Seed complete`);
    console.log(`   Vendors inserted : ${inserted}`);
    console.log(`   Vendors updated  : ${updated}`);
    console.log(`   Total            : ${vendors.length}`);
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
