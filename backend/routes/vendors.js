const router = require("express").Router();
const pool = require("../db/postgres");
const { requireLogin, requireRole } = require("../middleware/auth");

const adminOnly = [requireLogin, requireRole("admin", "superadmin")];

// GET /api/vendors — flat join: items × vendors × item_vendors
router.get("/", requireLogin, async (req, res) => {
  try {
    const { q = "" } = req.query;
    const params = [];
    let where = "";
    if (q) {
      // $1 = exact (for codes), $2 = fuzzy (for names)
      params.push(q.trim(), `%${q.trim()}%`);
      where = `WHERE (i.item_code ILIKE $1 OR i.name ILIKE $2
                   OR v.vendor_code ILIKE $1 OR v.business_name ILIKE $2)`;
    }
    const { rows } = await pool.query(
      `SELECT iv.id,
              i.item_code, i.name AS item_name,
              v.vendor_code, v.business_name, v.address, v.email, v.phone, v.contact_person,
              iv.offer_price, iv.lead_time
       FROM item_vendors iv
       JOIN items i   ON i.id = iv.item_id
       JOIN vendors v ON v.id = iv.vendor_id
       ${where}
       ORDER BY (regexp_match(i.item_code, '\\d+'))[1]::int ASC, i.item_code ASC`,
      params
    );
    res.json({ data: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/vendors — upsert vendor + create item_vendor link
router.post("/", ...adminOnly, async (req, res) => {
  const client = await pool.connect();
  try {
    const {
      item_id, vendor_code, business_name,
      address, email, phone, contact_person,
      offer_price, lead_time
    } = req.body;

    if (!item_id || !vendor_code || !business_name) {
      return res.status(400).json({ error: "item_id, vendor_code, and business_name are required" });
    }

    await client.query("BEGIN");

    const { rows: vRows } = await client.query(
      `INSERT INTO vendors (vendor_code, business_name, address, email, phone, contact_person)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (vendor_code) DO UPDATE SET
         business_name   = EXCLUDED.business_name,
         address         = EXCLUDED.address,
         email           = EXCLUDED.email,
         phone           = EXCLUDED.phone,
         contact_person  = EXCLUDED.contact_person,
         updated_at      = NOW()
       RETURNING id`,
      [
        vendor_code.trim(), business_name.trim(),
        address || null, email || null, phone || null, contact_person || null
      ]
    );
    const vendor_id = vRows[0].id;

    const { rows } = await client.query(
      `INSERT INTO item_vendors (item_id, vendor_id, offer_price, lead_time)
       VALUES ($1,$2,$3,$4)
       RETURNING id`,
      [
        Number(item_id), vendor_id,
        offer_price !== "" && offer_price != null ? Number(offer_price) : null,
        lead_time || null
      ]
    );

    await client.query("COMMIT");
    res.status(201).json({ msg: "Vendor link created", id: rows[0].id });
  } catch (err) {
    await client.query("ROLLBACK");
    if (err.code === "23505") {
      return res.status(400).json({ error: "This item-vendor combination already exists" });
    }
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// PUT /api/vendors/:id — update vendor info + offer_price + lead_time
router.put("/:id", ...adminOnly, async (req, res) => {
  const client = await pool.connect();
  try {
    const {
      vendor_code, business_name,
      address, email, phone, contact_person,
      offer_price, lead_time
    } = req.body;

    if (!vendor_code || !business_name) {
      return res.status(400).json({ error: "vendor_code and business_name are required" });
    }

    await client.query("BEGIN");

    const { rows: ivRows } = await client.query(
      "SELECT vendor_id FROM item_vendors WHERE id=$1",
      [req.params.id]
    );
    if (!ivRows.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Vendor link not found" });
    }
    const vendor_id = ivRows[0].vendor_id;

    await client.query(
      `UPDATE vendors
       SET vendor_code=$1, business_name=$2, address=$3,
           email=$4, phone=$5, contact_person=$6, updated_at=NOW()
       WHERE id=$7`,
      [
        vendor_code.trim(), business_name.trim(),
        address || null, email || null, phone || null, contact_person || null,
        vendor_id
      ]
    );

    await client.query(
      "UPDATE item_vendors SET offer_price=$1, lead_time=$2 WHERE id=$3",
      [
        offer_price !== "" && offer_price != null ? Number(offer_price) : null,
        lead_time || null,
        req.params.id
      ]
    );

    await client.query("COMMIT");
    res.json({ msg: "Vendor link updated" });
  } catch (err) {
    await client.query("ROLLBACK");
    if (err.code === "23505") {
      return res.status(400).json({ error: "Vendor code already used by another vendor" });
    }
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// DELETE /api/vendors/:id — remove item_vendor link only
router.delete("/:id", ...adminOnly, async (req, res) => {
  try {
    const { rows } = await pool.query(
      "DELETE FROM item_vendors WHERE id=$1 RETURNING id",
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: "Vendor link not found" });
    res.json({ msg: "Vendor link removed" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
