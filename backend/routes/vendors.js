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
      params.push(`%${q.trim()}%`, `%${q.trim()}%`, `%${q.trim()}%`, `%${q.trim()}%`);
      where = `WHERE (i.item_code LIKE ? OR i.name LIKE ? OR v.vendor_code LIKE ? OR v.business_name LIKE ?)`;
    }
    const [rows] = await pool.query(
      `SELECT iv.id,
              i.item_code, i.name AS item_name,
              v.vendor_code, v.business_name, v.address, v.email, v.phone, v.contact_person,
              iv.offer_price, iv.lead_time
       FROM item_vendors iv
       JOIN items i   ON i.item_code = iv.item_code
       JOIN vendors v ON v.id = iv.vendor_id
       ${where}
       ORDER BY CAST(REGEXP_SUBSTR(i.item_code, '[0-9]+') AS UNSIGNED) ASC, i.item_code ASC`,
      params
    );
    res.json({ data: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/vendors — upsert vendor + create item_vendor link
router.post("/", ...adminOnly, async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const {
      item_code, vendor_code, business_name,
      address, email, phone, contact_person,
      offer_price, lead_time
    } = req.body;

    if (!item_code || !vendor_code || !business_name) {
      return res.status(400).json({ error: "item_code, vendor_code, and business_name are required" });
    }

    await conn.beginTransaction();

    // Upsert vendor
    await conn.query(
      `INSERT INTO vendors (vendor_code, business_name, address, email, phone, contact_person)
       VALUES (?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE
         business_name   = VALUES(business_name),
         address         = VALUES(address),
         email           = VALUES(email),
         phone           = VALUES(phone),
         contact_person  = VALUES(contact_person)`,
      [
        vendor_code.trim(), business_name.trim(),
        address || null, email || null, phone || null, contact_person || null
      ]
    );
    const [[vendor]] = await conn.query("SELECT id FROM vendors WHERE vendor_code = ?", [vendor_code.trim()]);
    const vendor_id = vendor.id;

    const [result] = await conn.query(
      `INSERT INTO item_vendors (item_code, vendor_id, offer_price, lead_time)
       VALUES (?,?,?,?)`,
      [
        item_code,
        vendor_id,
        offer_price !== "" && offer_price != null ? Number(offer_price) : null,
        lead_time || null
      ]
    );

    await conn.commit();
    res.status(201).json({ msg: "Vendor link created", id: result.insertId });
  } catch (err) {
    await conn.rollback();
    if (err.code === "ER_DUP_ENTRY") {
      return res.status(400).json({ error: "This item-vendor combination already exists" });
    }
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
});

// PUT /api/vendors/:id — update vendor info + offer_price + lead_time
router.put("/:id", ...adminOnly, async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const {
      vendor_code, business_name,
      address, email, phone, contact_person,
      offer_price, lead_time
    } = req.body;

    if (!vendor_code || !business_name) {
      return res.status(400).json({ error: "vendor_code and business_name are required" });
    }

    await conn.beginTransaction();

    const [[ivRow]] = await conn.query(
      "SELECT vendor_id FROM item_vendors WHERE id = ?",
      [req.params.id]
    );
    if (!ivRow) {
      await conn.rollback();
      return res.status(404).json({ error: "Vendor link not found" });
    }

    await conn.query(
      `UPDATE vendors
       SET vendor_code=?, business_name=?, address=?, email=?, phone=?, contact_person=?
       WHERE id=?`,
      [
        vendor_code.trim(), business_name.trim(),
        address || null, email || null, phone || null, contact_person || null,
        ivRow.vendor_id
      ]
    );

    await conn.query(
      "UPDATE item_vendors SET offer_price=?, lead_time=? WHERE id=?",
      [
        offer_price !== "" && offer_price != null ? Number(offer_price) : null,
        lead_time || null,
        req.params.id
      ]
    );

    await conn.commit();
    res.json({ msg: "Vendor link updated" });
  } catch (err) {
    await conn.rollback();
    if (err.code === "ER_DUP_ENTRY") {
      return res.status(400).json({ error: "Vendor code already used by another vendor" });
    }
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
});

// DELETE /api/vendors/:id — remove item_vendor link only
router.delete("/:id", ...adminOnly, async (req, res) => {
  try {
    const [result] = await pool.query(
      "DELETE FROM item_vendors WHERE id = ?",
      [req.params.id]
    );
    if (result.affectedRows === 0) return res.status(404).json({ error: "Vendor link not found" });
    res.json({ msg: "Vendor link removed" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
