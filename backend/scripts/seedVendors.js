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
  const wb = XLSX.readFile(process.env.VENDORS_XLSX || "/Users/nitanshugoyal/Downloads/Vendor's list.xlsx");
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });

  // Columns: 0=item_code, 1=item_name, 2=vendor_code, 3=business_name,
  //          4=address, 5=email, 6=phone, 7=contact_person, 8=offer_price, 9=lead_time
  const dataRows = rows.slice(2); // skip title row + header row

  const vendorMap = {};
  // item_code → vendor_code → { offer_price, lead_time }
  const relMap = {};

  let currentItemCode = null;

  for (const r of dataRows) {
    const rawItemCode     = r[0] ? String(r[0]).trim() : null;
    const rawVendorCode   = r[2] ? String(r[2]).trim() : null;
    const rawBusinessName = r[3] ? String(r[3]).trim() : null;

    if (!rawVendorCode || !rawBusinessName) continue;

    if (rawItemCode) currentItemCode = rawItemCode;
    if (!currentItemCode) continue;

    // Accumulate vendor info
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

    // Item-vendor relationship
    if (!relMap[currentItemCode]) relMap[currentItemCode] = {};
    const existing    = relMap[currentItemCode][rawVendorCode];
    const offerPrice  = r[8] != null && r[8] !== "" ? parseFloat(r[8]) : null;
    const leadTime    = r[9] ? String(r[9]).trim() : null;

    if (!existing || (offerPrice != null && existing.offer_price == null)) {
      relMap[currentItemCode][rawVendorCode] = { offer_price: offerPrice, lead_time: leadTime };
    }
  }

  return { vendorMap, relMap };
}

async function seed() {
  const { vendorMap, relMap } = parseSheet();
  const vendors = Object.values(vendorMap);
  console.log(`📋 Parsed ${vendors.length} vendors, ${Object.keys(relMap).length} item-vendor relationships`);

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // 1. Upsert vendors
    let vendorInserted = 0, vendorUpdated = 0;
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
      if (result.affectedRows === 1) vendorInserted++; else vendorUpdated++;
    }

    // 2. Build vendor_code → id map
    const [vcRows] = await conn.query("SELECT id, vendor_code FROM vendors");
    const vendorIdMap = {};
    for (const row of vcRows) vendorIdMap[row.vendor_code] = row.id;

    // 3. Verify item codes exist
    const itemCodes = Object.keys(relMap);
    const placeholders = itemCodes.map(() => "?").join(",");
    const [icRows] = await conn.query(
      `SELECT item_code FROM items WHERE item_code IN (${placeholders})`,
      itemCodes
    );
    const existingItemCodes = new Set(icRows.map(r => r.item_code));

    const missingItems = itemCodes.filter(c => !existingItemCodes.has(c));
    if (missingItems.length > 0) {
      console.warn(`⚠️  ${missingItems.length} item codes not found in items table (skipped):`);
      missingItems.slice(0, 10).forEach(c => console.warn("   ", c));
      if (missingItems.length > 10) console.warn(`   ... and ${missingItems.length - 10} more`);
    }

    // 4. Upsert item_vendors (item_code is FK directly)
    let relInserted = 0, relUpdated = 0, relSkipped = 0;
    for (const [itemCode, vendorsForItem] of Object.entries(relMap)) {
      if (!existingItemCodes.has(itemCode)) {
        relSkipped += Object.keys(vendorsForItem).length;
        continue;
      }
      for (const [vendorCode, rel] of Object.entries(vendorsForItem)) {
        const vendorId = vendorIdMap[vendorCode];
        if (!vendorId) { relSkipped++; continue; }

        const [result] = await conn.query(
          `INSERT INTO item_vendors (item_code, vendor_id, offer_price, lead_time)
           VALUES (?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
             offer_price = COALESCE(VALUES(offer_price), item_vendors.offer_price),
             lead_time   = COALESCE(VALUES(lead_time), item_vendors.lead_time)`,
          [itemCode, vendorId, rel.offer_price, rel.lead_time]
        );
        if (result.affectedRows === 1) relInserted++; else relUpdated++;
      }
    }

    await conn.commit();

    console.log(`\n✅ Seed complete`);
    console.log(`   Vendors     : ${vendorInserted} inserted, ${vendorUpdated} updated (${vendors.length} total)`);
    console.log(`   Links       : ${relInserted} inserted, ${relUpdated} updated, ${relSkipped} skipped`);
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
