const router = require("express").Router();
const pool   = require("../db/postgres");
const { requireLogin, requireRole } = require("../middleware/auth");

const adminOnly = [requireLogin, requireRole("admin", "superadmin")];

// ── GET /api/item-vendors ─────────────────────────────────────────
router.get("/", requireLogin, async (req, res) => {
  try {
    const { q = "" } = req.query;
    const params = [];
    let where = "";
    if (q) {
      params.push(`%${q.trim()}%`, `%${q.trim()}%`);
      where = "WHERE (i.item_code LIKE ? OR i.name LIKE ?)";
    }

    const [rows] = await pool.query(`
      SELECT
        i.item_code,
        i.name              AS item_name,
        i.unit,
        iv.offer_price,
        iv.lead_time,
        iv.is_preferred,
        iv.min_order_qty,
        iv.payment_terms,
        iv.contract_start_date,
        iv.vendor_rating,
        iv.remarks,
        v.vendor_code,
        v.business_name,
        v.phone,
        v.email,
        v.contact_person
      FROM items i
      LEFT JOIN item_vendors iv ON iv.item_code = i.item_code
      LEFT JOIN vendors      v  ON v.vendor_code = iv.vendor_code
      ${where}
      ORDER BY CAST(REGEXP_REPLACE(i.item_code, '[^0-9]', '') AS UNSIGNED) ASC, v.vendor_code ASC
    `, params);

    const map = {};
    for (const row of rows) {
      if (!map[row.item_code]) {
        map[row.item_code] = {
          item_code: row.item_code,
          item_name: row.item_name,
          unit:      row.unit,
          vendors:   []
        };
      }
      if (row.vendor_code) {
        map[row.item_code].vendors.push({
          vendor_code:         row.vendor_code,
          business_name:       row.business_name,
          phone:               row.phone,
          email:               row.email,
          contact_person:      row.contact_person,
          offer_price:         row.offer_price,
          lead_time:           row.lead_time,
          is_preferred:        !!row.is_preferred,
          min_order_qty:       row.min_order_qty,
          payment_terms:       row.payment_terms,
          contract_start_date: row.contract_start_date,
          vendor_rating:       row.vendor_rating,
          remarks:             row.remarks,
        });
      }
    }

    res.json({ data: Object.values(map) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/item-vendors/vendors-list ───────────────────────────
router.get("/vendors-list", requireLogin, async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT vendor_code, business_name FROM vendors ORDER BY vendor_code ASC"
    );
    res.json({ data: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/item-vendors/items-list ─────────────────────────────
router.get("/items-list", requireLogin, async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT item_code, name FROM items ORDER BY item_code ASC"
    );
    res.json({ data: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/item-vendors/documents/:vendor_code ─────────────────
router.get("/documents/:vendor_code", requireLogin, async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT id, document_name, document_url, created_at FROM vendor_documents WHERE vendor_code=? ORDER BY id ASC",
      [req.params.vendor_code]
    );
    res.json({ data: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/item-vendors/documents ─────────────────────────────
router.post("/documents", ...adminOnly, async (req, res) => {
  try {
    const { vendor_code, document_name, document_url } = req.body;
    if (!vendor_code || !document_name || !document_url)
      return res.status(400).json({ error: "vendor_code, document_name and document_url are required" });

    await pool.query(
      "INSERT INTO vendor_documents (vendor_code, document_name, document_url) VALUES (?,?,?)",
      [vendor_code, document_name.trim(), document_url.trim()]
    );
    res.status(201).json({ msg: "Document added" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/item-vendors/documents/:id ────────────────────────
router.delete("/documents/:id", ...adminOnly, async (req, res) => {
  try {
    const [result] = await pool.query(
      "DELETE FROM vendor_documents WHERE id=?", [req.params.id]
    );
    if (result.affectedRows === 0)
      return res.status(404).json({ error: "Document not found" });
    res.json({ msg: "Document deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/item-vendors ────────────────────────────────────────
router.post("/", ...adminOnly, async (req, res) => {
  try {
    const {
      item_code, vendor_code, offer_price, lead_time, is_preferred,
      min_order_qty, payment_terms, contract_start_date, vendor_rating, remarks
    } = req.body;

    if (!item_code || !vendor_code)
      return res.status(400).json({ error: "item_code and vendor_code are required" });

    await pool.query(`
      INSERT INTO item_vendors
        (item_code, vendor_code, offer_price, lead_time, is_preferred,
         min_order_qty, payment_terms, contract_start_date, vendor_rating, remarks)
      VALUES (?,?,?,?,?,?,?,?,?,?)
    `, [
      item_code, vendor_code,
      offer_price         || null,
      lead_time           || null,
      is_preferred ? 1 : 0,
      min_order_qty       || null,
      payment_terms       || null,
      contract_start_date || null,
      vendor_rating       || null,
      remarks             || null
    ]);

    res.status(201).json({ msg: "Vendor linked to item" });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY")
      return res.status(400).json({ error: "This vendor is already linked to this item" });
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /api/item-vendors/:item_code/:vendor_code ─────────────────
router.put("/:item_code/:vendor_code", ...adminOnly, async (req, res) => {
  try {
    const {
      offer_price, lead_time, is_preferred,
      min_order_qty, payment_terms, contract_start_date, vendor_rating, remarks
    } = req.body;

    const [result] = await pool.query(`
      UPDATE item_vendors
      SET offer_price=?, lead_time=?, is_preferred=?,
          min_order_qty=?, payment_terms=?, contract_start_date=?,
          vendor_rating=?, remarks=?
      WHERE item_code=? AND vendor_code=?
    `, [
      offer_price         || null,
      lead_time           || null,
      is_preferred ? 1 : 0,
      min_order_qty       || null,
      payment_terms       || null,
      contract_start_date || null,
      vendor_rating       || null,
      remarks             || null,
      req.params.item_code,
      req.params.vendor_code
    ]);

    if (result.affectedRows === 0)
      return res.status(404).json({ error: "Link not found" });

    res.json({ msg: "Updated" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/item-vendors/:item_code/:vendor_code ──────────────
router.delete("/:item_code/:vendor_code", ...adminOnly, async (req, res) => {
  try {
    const [result] = await pool.query(
      "DELETE FROM item_vendors WHERE item_code=? AND vendor_code=?",
      [req.params.item_code, req.params.vendor_code]
    );
    if (result.affectedRows === 0)
      return res.status(404).json({ error: "Link not found" });
    res.json({ msg: "Vendor removed from item" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
