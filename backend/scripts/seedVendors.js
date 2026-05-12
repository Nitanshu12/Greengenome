require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const XLSX = require("xlsx");
const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

function parseSheet() {
  const wb = XLSX.readFile("/Users/nitanshugoyal/Downloads/Vendor's list.xlsx");
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });

  // Columns: 0=item_code, 1=item_name, 2=vendor_code, 3=business_name,
  //          4=address, 5=email, 6=phone, 7=contact_person, 8=offer_price, 9=lead_time
  const dataRows = rows.slice(2); // skip title row + header row

  const vendorMap = {}; // vendor_code → best vendor data seen
  // item_code → vendor_code → { offer_price, lead_time }  (last non-null offer_price wins)
  const relMap = {};

  let currentItemCode = null;

  for (const r of dataRows) {
    const rawItemCode = r[0] ? String(r[0]).trim() : null;
    const rawVendorCode = r[2] ? String(r[2]).trim() : null;
    const rawBusinessName = r[3] ? String(r[3]).trim() : null;

    if (!rawVendorCode || !rawBusinessName) continue;

    if (rawItemCode) currentItemCode = rawItemCode;
    if (!currentItemCode) continue;

    // Accumulate best vendor info (keep most complete record)
    if (!vendorMap[rawVendorCode]) {
      vendorMap[rawVendorCode] = {
        vendor_code: rawVendorCode,
        business_name: rawBusinessName,
        address: null,
        email: null,
        phone: null,
        contact_person: null,
      };
    }
    const v = vendorMap[rawVendorCode];
    // Always prefer longer / richer values
    const addr = r[4] ? String(r[4]).replace(/\r\n/g, " ").replace(/\n/g, " ").trim() : null;
    if (addr && (!v.address || addr.length > v.address.length)) v.address = addr;

    // email is the column that contains @; sometimes email/phone columns are swapped
    const col5 = r[5] ? String(r[5]).trim() : null;
    const col6 = r[6] != null ? String(r[6]).trim() : null;
    const col7 = r[7] ? String(r[7]).trim() : null;

    if (col5 && col5.includes("@") && !v.email) v.email = col5;
    if (col6 && col6.includes("@") && !v.email) v.email = col6;
    if (col7 && col7.includes("@") && !v.email) v.email = col7;

    if (col6 && !col6.includes("@") && !v.phone) v.phone = col6;
    if (col5 && /^\d{7,}$/.test(col5.replace(/\s/g, "")) && !v.phone) v.phone = col5;

    const contactCols = [col5, col6, col7].filter(Boolean);
    for (const c of contactCols) {
      if ((c.startsWith("Mr") || c.startsWith("Ms")) && !v.contact_person) {
        v.contact_person = c;
      }
    }

    // Relationship
    if (!relMap[currentItemCode]) relMap[currentItemCode] = {};
    const existing = relMap[currentItemCode][rawVendorCode];
    const offerPrice = r[8] != null && r[8] !== "" ? parseFloat(r[8]) : null;
    const leadTime = r[9] ? String(r[9]).trim() : null;

    if (!existing || (offerPrice != null && existing.offer_price == null)) {
      relMap[currentItemCode][rawVendorCode] = { offer_price: offerPrice, lead_time: leadTime };
    }
  }

  return { vendorMap, relMap };
}

async function seed() {
  const { vendorMap, relMap } = parseSheet();

  const vendors = Object.values(vendorMap);
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // 1. Upsert vendors
    let vendorInserted = 0, vendorUpdated = 0;
    for (const v of vendors) {
      const res = await client.query(
        `INSERT INTO vendors (vendor_code, business_name, address, email, phone, contact_person)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (vendor_code) DO UPDATE SET
           business_name   = EXCLUDED.business_name,
           address         = COALESCE(EXCLUDED.address, vendors.address),
           email           = COALESCE(EXCLUDED.email, vendors.email),
           phone           = COALESCE(EXCLUDED.phone, vendors.phone),
           contact_person  = COALESCE(EXCLUDED.contact_person, vendors.contact_person),
           updated_at      = NOW()
         RETURNING (xmax = 0) AS inserted`,
        [v.vendor_code, v.business_name, v.address, v.email, v.phone, v.contact_person]
      );
      if (res.rows[0].inserted) vendorInserted++; else vendorUpdated++;
    }

    // 2. Build vendor_code → id map
    const vcRes = await client.query("SELECT id, vendor_code FROM vendors");
    const vendorIdMap = {};
    for (const row of vcRes.rows) vendorIdMap[row.vendor_code] = row.id;

    // 3. Build item_code → id map (only for codes present in our sheet)
    const itemCodes = Object.keys(relMap);
    const icRes = await client.query(
      "SELECT id, item_code FROM items WHERE item_code = ANY($1::text[])",
      [itemCodes]
    );
    const itemIdMap = {};
    for (const row of icRes.rows) itemIdMap[row.item_code] = row.id;

    const missingItems = itemCodes.filter((c) => !itemIdMap[c]);
    if (missingItems.length > 0) {
      console.warn(`⚠️  ${missingItems.length} item codes not found in items table (relationships skipped):`);
      missingItems.slice(0, 10).forEach((c) => console.warn("   ", c));
      if (missingItems.length > 10) console.warn(`   ... and ${missingItems.length - 10} more`);
    }

    // 4. Upsert item_vendors
    let relInserted = 0, relUpdated = 0, relSkipped = 0;
    for (const [itemCode, vendorsForItem] of Object.entries(relMap)) {
      const itemId = itemIdMap[itemCode];
      if (!itemId) { relSkipped += Object.keys(vendorsForItem).length; continue; }

      for (const [vendorCode, rel] of Object.entries(vendorsForItem)) {
        const vendorId = vendorIdMap[vendorCode];
        if (!vendorId) { relSkipped++; continue; }

        const res = await client.query(
          `INSERT INTO item_vendors (item_id, vendor_id, offer_price, lead_time)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (item_id, vendor_id) DO UPDATE SET
             offer_price = COALESCE(EXCLUDED.offer_price, item_vendors.offer_price),
             lead_time   = COALESCE(EXCLUDED.lead_time, item_vendors.lead_time)
           RETURNING (xmax = 0) AS inserted`,
          [itemId, vendorId, rel.offer_price, rel.lead_time]
        );
        if (res.rows[0].inserted) relInserted++; else relUpdated++;
      }
    }

    await client.query("COMMIT");

    console.log(`\n✅ Seed complete`);
    console.log(`   Vendors : ${vendorInserted} inserted, ${vendorUpdated} updated  (${vendors.length} total)`);
    console.log(`   Relationships : ${relInserted} inserted, ${relUpdated} updated, ${relSkipped} skipped`);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("❌ Seed failed, rolled back:", err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch((e) => { console.error(e); process.exit(1); });
