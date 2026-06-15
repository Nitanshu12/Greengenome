const router = require("express").Router();
const pool   = require("../db/postgres");
const { requireLogin, requireRole } = require("../middleware/auth");
const {
  Document, Packer, Paragraph, TextRun,
  Table, TableRow, TableCell,
  AlignmentType, WidthType, VerticalAlign,
} = require("docx");

const adminOnly = [requireLogin, requireRole("admin", "superadmin")];

// ── Helpers ───────────────────────────────────────────────────────────────

function formatPoDate(date) {
  const d = date instanceof Date ? date : new Date(date);
  const day = d.getDate();
  const mod100 = day % 100;
  const mod10  = day % 10;
  const suffix = (mod100 >= 11 && mod100 <= 13) ? "th"
    : mod10 === 1 ? "st" : mod10 === 2 ? "nd" : mod10 === 3 ? "rd" : "th";
  const month = d.toLocaleString("en-US", { month: "long" });
  return `${day}${suffix} ${month} ${d.getFullYear()}`;
}

const W_ONES = ["","One","Two","Three","Four","Five","Six","Seven","Eight","Nine",
  "Ten","Eleven","Twelve","Thirteen","Fourteen","Fifteen","Sixteen","Seventeen","Eighteen","Nineteen"];
const W_TENS = ["","","Twenty","Thirty","Forty","Fifty","Sixty","Seventy","Eighty","Ninety"];

function numToWords(n) {
  if (n === 0) return "";
  if (n < 20)  return W_ONES[n];
  if (n < 100) return W_TENS[Math.floor(n / 10)] + (n % 10 ? " " + W_ONES[n % 10] : "");
  if (n < 1000)      return W_ONES[Math.floor(n / 100)] + " Hundred" + (n % 100 ? " " + numToWords(n % 100) : "");
  if (n < 100000)    return numToWords(Math.floor(n / 1000)) + " Thousand" + (n % 1000 ? " " + numToWords(n % 1000) : "");
  if (n < 10000000)  return numToWords(Math.floor(n / 100000)) + " Lakh" + (n % 100000 ? " " + numToWords(n % 100000) : "");
  return numToWords(Math.floor(n / 10000000)) + " Crore" + (n % 10000000 ? " " + numToWords(n % 10000000) : "");
}

function amountInWords(amount) {
  const rupees = Math.floor(amount);
  const paise  = Math.round((amount - rupees) * 100);
  let result = rupees > 0 ? numToWords(rupees) + " Rupees" : "";
  if (paise > 0) result += (result ? " and " : "") + numToWords(paise) + " Paise";
  return (result || "Zero Rupees") + " Only";
}

function INR(n) {
  return `Rs. ${Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
}

function mkCell(text, { bold = false, align = AlignmentType.LEFT, shading } = {}) {
  return new TableCell({
    verticalAlign: VerticalAlign.CENTER,
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    ...(shading ? { shading } : {}),
    children: [new Paragraph({
      alignment: align,
      children: [new TextRun({ text: String(text ?? ""), bold, size: 20 })],
    })],
  });
}

function spanCell(text, { bold = false, align = AlignmentType.RIGHT, columnSpan = 1, shading } = {}) {
  return new TableCell({
    columnSpan,
    verticalAlign: VerticalAlign.CENTER,
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    ...(shading ? { shading } : {}),
    children: [new Paragraph({
      alignment: align,
      children: [new TextRun({ text: String(text ?? ""), bold, size: 20 })],
    })],
  });
}

async function buildPODoc(po, items, vendorName, leadTime, paymentTerms) {
  const subtotal  = items.reduce((s, i) => s + parseFloat(i.line_total || 0), 0);
  const gstAmount = items.reduce((s, i) => s + parseFloat(i.line_total || 0) * parseFloat(i.gst_percent || 0) / 100, 0);
  const netTotal  = subtotal + gstAmount;
  const dateStr   = formatPoDate(new Date(po.created_at));
  const hdrShade  = { fill: "E8E8E8" };
  const totShade  = { fill: "F5F5F5" };

  const tableRows = [
    // Header row
    new TableRow({
      tableHeader: true,
      children: [
        mkCell("S.No.",         { bold: true, shading: hdrShade }),
        mkCell("Product",       { bold: true, shading: hdrShade }),
        mkCell("Quantity",      { bold: true, align: AlignmentType.RIGHT, shading: hdrShade }),
        mkCell("Price Per Unit",{ bold: true, align: AlignmentType.RIGHT, shading: hdrShade }),
        mkCell("Total",         { bold: true, align: AlignmentType.RIGHT, shading: hdrShade }),
      ],
    }),
    // Item rows
    ...items.map((item, idx) => new TableRow({
      children: [
        mkCell(String(idx + 1)),
        mkCell(item.item_name),
        mkCell(Number(item.quantity).toLocaleString("en-IN"), { align: AlignmentType.RIGHT }),
        mkCell(INR(item.unit_price), { align: AlignmentType.RIGHT }),
        mkCell(INR(item.line_total), { align: AlignmentType.RIGHT }),
      ],
    })),
    // Subtotal
    new TableRow({ children: [
      spanCell("Total", { columnSpan: 4, bold: true, shading: totShade }),
      mkCell(INR(subtotal), { bold: true, align: AlignmentType.RIGHT, shading: totShade }),
    ]}),
    // GST
    new TableRow({ children: [
      spanCell("GST", { columnSpan: 4, shading: totShade }),
      mkCell(INR(gstAmount), { align: AlignmentType.RIGHT, shading: totShade }),
    ]}),
    // Net Total
    new TableRow({ children: [
      spanCell("Net Total", { columnSpan: 4, bold: true, shading: hdrShade }),
      mkCell(INR(netTotal), { bold: true, align: AlignmentType.RIGHT, shading: hdrShade }),
    ]}),
  ];

  const p = (text, opts = {}) => new Paragraph({
    alignment: opts.align || AlignmentType.LEFT,
    spacing: { after: opts.spacingAfter || 0 },
    children: [new TextRun({ text, bold: opts.bold || false, italics: opts.italics || false, size: opts.size || 22 })],
  });

  const blank = () => new Paragraph({ children: [new TextRun({ text: "" })] });

  const doc = new Document({
    sections: [{
      properties: {
        page: { margin: { top: 900, right: 900, bottom: 900, left: 900 } },
      },
      children: [
        p(`Ref: ${po.po_number || "—"}`, { bold: true, size: 24 }),
        blank(),
        p("To,"),
        p(vendorName || "", { bold: true }),
        blank(),
        p("PURCHASE ORDER", { bold: true, size: 32, align: AlignmentType.CENTER }),
        blank(),
        p(`Date: ${dateStr}`),
        blank(),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: tableRows,
        }),
        blank(),
        p(amountInWords(netTotal), { italics: true, size: 20 }),
        blank(),
        p("Term & Conditions", { bold: true }),
        p(`Delivery Time: ${leadTime || ""}`),
        p(`Payment terms: ${paymentTerms || ""}`),
        blank(),
        p("FOR TURN LABS", { bold: true, size: 24, align: AlignmentType.RIGHT }),
      ],
    }],
  });

  return Packer.toBuffer(doc);
}

// ── Routes ────────────────────────────────────────────────────────────────

// POST /api/purchase-orders  — create a new PO
router.post("/", ...adminOnly, async (req, res) => {
  const { vendor_code, items, notes } = req.body;
  if (!vendor_code || !Array.isArray(items) || items.length === 0)
    return res.status(400).json({ error: "vendor_code and at least one item are required" });

  try {
    // Look up gst_percent for each item from the items master
    const enriched = await Promise.all(items.map(async (it) => {
      const [rows] = await pool.query(
        "SELECT gst_percent, unit FROM items WHERE item_code = ?", [it.item_code]
      );
      const master = rows[0] || {};
      const gst_percent = parseFloat(master.gst_percent || 0);
      const unit        = it.unit || master.unit || "";
      const line_total  = parseFloat(it.quantity || 0) * parseFloat(it.unit_price || 0);
      return { ...it, gst_percent, unit, line_total };
    }));

    const total_amount = enriched.reduce((s, i) => s + i.line_total, 0);
    const gst_amount   = enriched.reduce((s, i) => s + i.line_total * i.gst_percent / 100, 0);
    const net_total    = total_amount + gst_amount;
    const created_by   = req.session?.user?.username || null;
    const year2        = new Date().getFullYear().toString().slice(-2);

    const [ins] = await pool.query(
      `INSERT INTO purchase_orders (vendor_code, total_amount, gst_amount, net_total, notes, created_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [vendor_code, total_amount.toFixed(2), gst_amount.toFixed(2), net_total.toFixed(2), notes || null, created_by]
    );
    const po_id     = ins.insertId;
    const po_number = `${po_id}/${year2}`;

    await pool.query("UPDATE purchase_orders SET po_number = ? WHERE id = ?", [po_number, po_id]);

    for (const it of enriched) {
      await pool.query(
        `INSERT INTO purchase_order_items (po_id, item_code, item_name, quantity, unit, unit_price, gst_percent, line_total)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [po_id, it.item_code, it.item_name, it.quantity, it.unit, parseFloat(it.unit_price || 0).toFixed(2),
          it.gst_percent, it.line_total.toFixed(2)]
      );
    }

    res.status(201).json({ po_id, po_number });
  } catch (err) {
    if (err.code === "ER_NO_REFERENCED_ROW_2")
      return res.status(400).json({ error: "vendor_code does not exist" });
    res.status(500).json({ error: err.message });
  }
});

// GET /api/purchase-orders  — list all POs
router.get("/", requireLogin, async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT po.id, po.po_number, po.vendor_code, v.business_name,
             po.status, po.total_amount, po.gst_amount, po.net_total,
             po.notes, po.created_by, po.created_at,
             (SELECT COUNT(*) FROM purchase_order_items poi WHERE poi.po_id = po.id) AS item_count
      FROM purchase_orders po
      LEFT JOIN vendors v ON v.vendor_code = po.vendor_code
      ORDER BY po.id DESC
    `);
    res.json({ data: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/purchase-orders/:id  — single PO with items
router.get("/:id", requireLogin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

    const [[po]] = await pool.query(
      `SELECT po.*, v.business_name
       FROM purchase_orders po LEFT JOIN vendors v ON v.vendor_code = po.vendor_code
       WHERE po.id = ?`, [id]
    );
    if (!po) return res.status(404).json({ error: "PO not found" });

    const [items] = await pool.query(
      "SELECT * FROM purchase_order_items WHERE po_id = ? ORDER BY id ASC", [id]
    );
    res.json({ po, items });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/purchase-orders/:id/status  — update PO status
router.patch("/:id/status", ...adminOnly, async (req, res) => {
  const VALID = ["draft", "sent", "received", "cancelled"];
  const { status } = req.body;
  if (!VALID.includes(status))
    return res.status(400).json({ error: `status must be one of: ${VALID.join(", ")}` });

  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

    const [r] = await pool.query("UPDATE purchase_orders SET status = ? WHERE id = ?", [status, id]);
    if (r.affectedRows === 0) return res.status(404).json({ error: "PO not found" });
    res.json({ msg: "Status updated" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/purchase-orders/:id/download  — generate and stream DOCX
router.get("/:id/download", requireLogin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

    const [[po]] = await pool.query(
      `SELECT po.*, v.business_name
       FROM purchase_orders po LEFT JOIN vendors v ON v.vendor_code = po.vendor_code
       WHERE po.id = ?`, [id]
    );
    if (!po) return res.status(404).json({ error: "PO not found" });

    const [items] = await pool.query(
      "SELECT * FROM purchase_order_items WHERE po_id = ? ORDER BY id ASC", [id]
    );

    // Fetch lead_time and payment_terms for this vendor (any linked item)
    let leadTime = "", paymentTerms = "";
    const [[iv]] = await pool.query(
      "SELECT lead_time, payment_terms FROM item_vendors WHERE vendor_code = ? LIMIT 1",
      [po.vendor_code]
    );
    if (iv) { leadTime = iv.lead_time || ""; paymentTerms = iv.payment_terms || ""; }

    const buffer = await buildPODoc(po, items, po.business_name, leadTime, paymentTerms);
    const safeName = (po.po_number || String(id)).replace(/\//g, "-");

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    res.setHeader("Content-Disposition", `attachment; filename="PO-${safeName}.docx"`);
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
