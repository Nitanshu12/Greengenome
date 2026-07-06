import { useEffect, useState, useCallback } from "react";
import { api } from "../api";
import { useAuth } from "../hooks/useAuth";
import { useToast } from "../components/Toast";

const COMPANY = {
  name:    "Green Genome India Pvt Ltd.",
  address: "E-27, GROUND FLOOR, NARAINA, DELHI- 110028",
  phone:   "9318333378",
  email:   "info@greengenome.in",
  gstin:   "07AAGCG6699E1Z7",
  pan:     "AAGCG6699E",
};

function fmtDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtDatePrint(d) {
  if (!d) return "";
  const dt = new Date(d);
  return [
    String(dt.getDate()).padStart(2, "0"),
    String(dt.getMonth() + 1).padStart(2, "0"),
    dt.getFullYear(),
  ].join("-");
}

// Opens a new window with the challan formatted exactly like the Word doc
function openPrintWindow(challan, items) {
  // Consolidate multi-batch allocations of the same item into one print row
  const grouped = new Map();
  items.forEach(item => {
    if (grouped.has(item.item_code)) {
      grouped.get(item.item_code).qty += item.qty;
    } else {
      grouped.set(item.item_code, { ...item });
    }
  });
  const printItems = Array.from(grouped.values());

  const w = window.open("", "_blank", "width=870,height=720");
  w.document.write(`<!DOCTYPE html>
<html><head>
<title>${challan.challan_no}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; font-size: 12px; color: #000; padding: 28px; }
  h1 { text-align: center; font-size: 20px; font-weight: bold;
       border: 2px solid #000; padding: 8px; margin-bottom: 10px; letter-spacing: 1px; }
  .meta { width: 100%; border-collapse: collapse; border: 1px solid #000; margin-bottom: 10px; }
  .meta td { padding: 4px 10px; border-bottom: 1px solid #ddd; }
  .meta td:first-child { font-weight: bold; width: 130px; }
  .meta tr:last-child td { border-bottom: none; }
  .addr-row { display: flex; margin-bottom: 10px; }
  .addr-box { flex: 1; border: 1px solid #000; padding: 10px; line-height: 1.7; }
  .addr-box:first-child { border-right: none; }
  .addr-box .section-title { font-weight: bold; font-size: 13px; border-bottom: 1px solid #ccc; padding-bottom: 4px; margin-bottom: 6px; }
  .ref-row { display: flex; margin-bottom: 10px; }
  .ref-box { flex: 1; border: 1px solid #000; padding: 8px; }
  .ref-box:not(:first-child) { border-left: none; }
  .ref-box b { display: block; font-size: 11px; color: #555; margin-bottom: 2px; }
  .items { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
  .items th, .items td { border: 1px solid #000; padding: 6px 10px; }
  .items th { background: #f0f0f0; font-weight: bold; text-align: center; }
  .items td:first-child, .items td:nth-child(3) { text-align: center; }
  .signature { text-align: right; margin-top: 48px; line-height: 2; }
  .print-btn { display: block; margin: 24px auto 0; padding: 8px 28px;
               font-size: 14px; cursor: pointer; background: #077B4D; color: #fff;
               border: none; border-radius: 6px; }
  @media print { .print-btn { display: none !important; } }
</style>
</head><body>
<h1>Delivery Challan</h1>

<table class="meta">
  <tr><td>Company Name:</td><td>${COMPANY.name}</td></tr>
  <tr><td>Address:</td><td>${COMPANY.address}</td></tr>
  <tr><td>Phone No.:</td><td>${COMPANY.phone}</td></tr>
  <tr><td>Email:</td><td>${COMPANY.email}</td></tr>
  <tr><td>GSTIN:</td><td>${COMPANY.gstin}</td></tr>
  <tr><td>PAN:</td><td>${COMPANY.pan}</td></tr>
</table>

<div class="addr-row">
  <div class="addr-box">
    <div class="section-title">Delivery Challan For:</div>
    <b>Party Name:</b>&nbsp;${challan.party_name}<br/>
    <b>Address:</b>&nbsp;${challan.delivery_address}
  </div>
  <div class="addr-box">
    <div class="section-title">Shipping To:</div>
    <b>Party Name:</b>&nbsp;${challan.shipping_party_name}<br/>
    <b>Address:</b>&nbsp;${challan.shipping_address}
  </div>
</div>

<div class="ref-row">
  <div class="ref-box"><b>Challan No.</b>${challan.challan_no}</div>
  <div class="ref-box"><b>Date</b>${fmtDatePrint(challan.challan_date)}</div>
  <div class="ref-box"><b>Vehicle Number</b>${challan.vehicle_number || ""}</div>
</div>

<table class="items">
  <thead>
    <tr><th>Sr No.</th><th>Item Name</th><th>Quantity</th><th>Unit</th></tr>
  </thead>
  <tbody>
    ${printItems.map((item, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${item.item_name}</td>
      <td>${item.qty}</td>
      <td>${item.unit || ""}</td>
    </tr>`).join("")}
  </tbody>
</table>

<div class="signature">
  Green Genome India Pvt Ltd<br/>
  <strong>Authorised Signature</strong>
</div>

<button class="print-btn" onclick="window.print();setTimeout(()=>window.close(),500);">🖨&nbsp; Print</button>
</body></html>`);
  w.document.close();
  w.focus();
}

// ── Form component ────────────────────────────────────────────
function OutwardForm({ allItems, onDone, onCancel }) {
  const { toast } = useToast();
  const [formItems, setFormItems] = useState([]);
  const [selectedCode, setSelectedCode] = useState("");
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [meta, setMeta] = useState({
    party_name: "", delivery_address: "",
    shipping_party_name: "", shipping_address: "",
    same_as_delivery: false, vehicle_number: "",
  });
  const [saving, setSaving] = useState(false);

  const setMf = (k, v) => setMeta(m => ({ ...m, [k]: v }));

  // Raw items only — sub-kits have no stock batches of their own
  const eligibleItems = allItems.filter(i => !i.is_subkit && i.is_active !== 0);

  const addItem = async () => {
    if (!selectedCode) return;
    if (formItems.find(fi => fi.item_code === selectedCode)) {
      toast("Item already added", "error"); return;
    }
    const item = eligibleItems.find(i => i.item_code === selectedCode);
    if (!item) return;

    setLoadingPreview(true);
    try {
      const preview = await api.getOutwardStockPreview(selectedCode);
      const primary = preview.batches[0];
      setFormItems(fi => [...fi, {
        item_code:        selectedCode,
        item_name:        item.name,
        brand:            item.brand || "—",
        unit:             item.unit,
        qty:              preview.total_available > 0 ? 1 : 0,
        available:        preview.total_available,
        primary_batch_no: primary?.supplier_batch_no || "—",
        primary_expiry:   primary?.expiry_date || null,
      }]);
      setSelectedCode("");
      if (preview.total_available === 0) {
        toast(`No eligible stock for "${item.name}" — add stock batches or check shelf-life rule`, "warn");
      }
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setLoadingPreview(false);
    }
  };

  const handleSubmit = async () => {
    if (!meta.party_name.trim() || !meta.delivery_address.trim()) {
      toast("Party name and delivery address are required", "error"); return;
    }
    if (!formItems.length) {
      toast("Add at least one item", "error"); return;
    }
    const noStock = formItems.find(fi => fi.available === 0);
    if (noStock) { toast(`No eligible stock for "${noStock.item_name}" — remove it or add stock batches first`, "error"); return; }
    const bad = formItems.find(fi => Number(fi.qty) < 1 || Number(fi.qty) > fi.available);
    if (bad) { toast(`Invalid quantity for "${bad.item_name}" — max available is ${bad.available}`, "error"); return; }

    setSaving(true);
    try {
      const result = await api.createChallan({
        party_name:          meta.party_name.trim(),
        delivery_address:    meta.delivery_address.trim(),
        shipping_party_name: meta.same_as_delivery ? meta.party_name.trim() : meta.shipping_party_name.trim(),
        shipping_address:    meta.same_as_delivery ? meta.delivery_address.trim() : meta.shipping_address.trim(),
        vehicle_number:      meta.vehicle_number.trim(),
        items: formItems.map(fi => ({ item_code: fi.item_code, qty: Number(fi.qty) })),
      });
      toast(`${result.challan_no} created successfully`);
      onDone();
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card" style={{ marginBottom: 24, padding: 24 }}>
      <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 20 }}>New Delivery Challan</div>

      {/* Items */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontWeight: 600, marginBottom: 10, color: "var(--primary, #077B4D)" }}>Items</div>
        <div style={{ display: "flex", gap: 8, marginBottom: 14, alignItems: "center" }}>
          <select
            className="form-input"
            style={{ flex: 1 }}
            value={selectedCode}
            onChange={e => setSelectedCode(e.target.value)}
          >
            <option value="">— Select an item —</option>
            {eligibleItems.map(i => (
              <option key={i.item_code} value={i.item_code}>
                {i.item_code} — {i.name}{i.brand ? ` (${i.brand})` : ""}
              </option>
            ))}
          </select>
          <button
            className="btn btn-primary"
            onClick={addItem}
            disabled={!selectedCode || loadingPreview}
            style={{ whiteSpace: "nowrap" }}
          >
            {loadingPreview ? "Loading…" : "+ Add Item"}
          </button>
        </div>

        {formItems.length > 0 && (
          <div className="table-wrap" style={{ margin: 0 }}>
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Item Name</th>
                  <th>Brand</th>
                  <th>Unit</th>
                  <th>Available</th>
                  <th>Primary Batch</th>
                  <th>Expiry</th>
                  <th>Qty</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {formItems.map((fi, idx) => {
                  const over = Number(fi.qty) > fi.available || Number(fi.qty) < 1;
                  return (
                    <tr key={fi.item_code}>
                      <td style={{ color: "var(--muted)", fontSize: 12 }}>{idx + 1}</td>
                      <td style={{ fontWeight: 500 }}>{fi.item_name}</td>
                      <td style={{ color: "var(--muted)", fontSize: 12 }}>{fi.brand}</td>
                      <td>{fi.unit}</td>
                      <td style={{ fontWeight: 600, color: fi.available === 0 ? "#dc2626" : "var(--text)" }}>
                        {fi.available === 0 ? "⚠ No stock" : fi.available}
                      </td>
                      <td style={{ fontFamily: "monospace", fontSize: 12 }}>{fi.primary_batch_no}</td>
                      <td style={{ fontSize: 12 }}>{fmtDate(fi.primary_expiry)}</td>
                      <td>
                        <input
                          type="number"
                          min="1"
                          max={fi.available}
                          className="form-input"
                          style={{ width: 80, border: over ? "1.5px solid #dc2626" : undefined }}
                          value={fi.qty}
                          onChange={e => setFormItems(list =>
                            list.map(x => x.item_code === fi.item_code ? { ...x, qty: e.target.value } : x)
                          )}
                        />
                        {over && (
                          <div style={{ fontSize: 10, color: "#dc2626", marginTop: 2 }}>
                            max {fi.available}
                          </div>
                        )}
                      </td>
                      <td>
                        <button
                          className="btn btn-danger btn-sm"
                          onClick={() => setFormItems(list => list.filter(x => x.item_code !== fi.item_code))}
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Addresses */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 16 }}>
        <div>
          <div style={{ fontWeight: 600, marginBottom: 10, color: "var(--primary, #077B4D)" }}>Delivery Challan For</div>
          <div className="form-group">
            <label className="form-label">Party Name *</label>
            <input
              className="form-input"
              value={meta.party_name}
              onChange={e => setMf("party_name", e.target.value)}
              placeholder="Organisation / person name"
            />
          </div>
          <div className="form-group">
            <label className="form-label">Address *</label>
            <textarea
              className="form-input"
              rows={3}
              value={meta.delivery_address}
              onChange={e => setMf("delivery_address", e.target.value)}
              placeholder="Full delivery address"
              style={{ resize: "vertical" }}
            />
          </div>
        </div>

        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
            <span style={{ fontWeight: 600, color: "var(--primary, #077B4D)" }}>Shipping To</span>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer", color: "var(--muted)" }}>
              <input
                type="checkbox"
                checked={meta.same_as_delivery}
                onChange={e => setMf("same_as_delivery", e.target.checked)}
              />
              Same as Delivery
            </label>
          </div>
          <div className="form-group">
            <label className="form-label">Party Name</label>
            <input
              className="form-input"
              value={meta.same_as_delivery ? meta.party_name : meta.shipping_party_name}
              onChange={e => setMf("shipping_party_name", e.target.value)}
              disabled={meta.same_as_delivery}
              placeholder="Shipping party name"
            />
          </div>
          <div className="form-group">
            <label className="form-label">Address</label>
            <textarea
              className="form-input"
              rows={3}
              value={meta.same_as_delivery ? meta.delivery_address : meta.shipping_address}
              onChange={e => setMf("shipping_address", e.target.value)}
              disabled={meta.same_as_delivery}
              placeholder="Full shipping address"
              style={{ resize: "vertical" }}
            />
          </div>
        </div>
      </div>

      <div className="form-group" style={{ maxWidth: 320 }}>
        <label className="form-label">Vehicle Number</label>
        <input
          className="form-input"
          value={meta.vehicle_number}
          onChange={e => setMf("vehicle_number", e.target.value)}
          placeholder="e.g. DL 01 AB 1234"
        />
      </div>

      <div className="flex gap-2" style={{ marginTop: 12 }}>
        <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
        <button className="btn btn-primary ml-auto" onClick={handleSubmit} disabled={saving}>
          {saving ? "Creating…" : "Create Delivery Challan →"}
        </button>
      </div>
    </div>
  );
}

// ── Single challan accordion card ─────────────────────────────
function ChallanCard({ challan, isOpen, detail, onToggle, onCancel, onPrint }) {
  const cancelled = challan.status === "cancelled";
  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
      {/* Header row */}
      <button
        onClick={onToggle}
        style={{
          width: "100%", display: "flex", alignItems: "center", gap: 10,
          padding: "14px 16px", background: "var(--card, #fff)",
          border: "none", cursor: "pointer", textAlign: "left",
        }}
      >
        <span style={{ fontFamily: "monospace", fontWeight: 700, fontSize: 14, color: "var(--primary, #077B4D)" }}>
          {challan.challan_no}
        </span>
        <span style={{ fontSize: 12, color: "var(--muted)" }}>{fmtDate(challan.challan_date)}</span>
        <span style={{ flex: 1, fontWeight: 500, fontSize: 13 }}>{challan.party_name}</span>
        <span style={{ fontSize: 12, color: "var(--muted)" }}>
          {challan.item_count} item{challan.item_count !== 1 ? "s" : ""}
        </span>
        <span style={{
          fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 10,
          color: cancelled ? "#dc2626" : "#16a34a",
          background: cancelled ? "#fee2e2" : "#dcfce7",
        }}>
          {challan.status}
        </span>
        <button
          className="btn btn-ghost btn-sm"
          style={{ padding: "3px 10px", fontSize: 12 }}
          onClick={e => { e.stopPropagation(); onPrint(); }}
        >
          🖨 Print
        </button>
        {onCancel && !cancelled && (
          <button
            className="btn btn-danger btn-sm"
            style={{ padding: "3px 10px", fontSize: 12 }}
            onClick={e => { e.stopPropagation(); onCancel(); }}
          >
            Cancel
          </button>
        )}
        <span style={{ transform: isOpen ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>▾</span>
      </button>

      {/* Expanded content */}
      {isOpen && (
        <div style={{ borderTop: "1px solid var(--border)", padding: 16, background: "var(--bg-alt, #f8f9fa)" }}>
          {!detail ? (
            <div style={{ textAlign: "center", padding: 24 }}><div className="spinner" /></div>
          ) : (
            <>
              {/* Address / meta grid */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 16 }}>
                <div>
                  <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.5 }}>Delivery Challan For</div>
                  <div style={{ fontWeight: 600 }}>{detail.challan.party_name}</div>
                  <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 3, whiteSpace: "pre-line" }}>{detail.challan.delivery_address}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.5 }}>Shipping To</div>
                  <div style={{ fontWeight: 600 }}>{detail.challan.shipping_party_name}</div>
                  <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 3, whiteSpace: "pre-line" }}>{detail.challan.shipping_address}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.5 }}>Vehicle / Created By</div>
                  <div style={{ fontWeight: 500 }}>{detail.challan.vehicle_number || "—"}</div>
                  <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 3 }}>by {detail.challan.created_by}</div>
                </div>
              </div>

              {/* Items table */}
              <div className="table-wrap" style={{ margin: 0 }}>
                <table>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Item Name</th>
                      <th>Brand</th>
                      <th>Batch No</th>
                      <th>Expiry</th>
                      <th>Qty</th>
                      <th>Unit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.items.map((item, idx) => (
                      <tr key={item.id}>
                        <td style={{ color: "var(--muted)", fontSize: 12 }}>{idx + 1}</td>
                        <td style={{ fontWeight: 500 }}>{item.item_name}</td>
                        <td style={{ color: "var(--muted)", fontSize: 12 }}>{item.brand || "—"}</td>
                        <td style={{ fontFamily: "monospace", fontSize: 12 }}>{item.supplier_batch_no || "—"}</td>
                        <td style={{ fontSize: 12 }}>{fmtDate(item.expiry_date)}</td>
                        <td style={{ fontWeight: 600 }}>{item.qty}</td>
                        <td>{item.unit || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────
export default function Outward() {
  const { user } = useAuth();
  const { toast } = useToast();
  const isAdmin = ["admin", "superadmin"].includes(user?.role);

  const [challans, setChallans] = useState([]);
  const [allItems, setAllItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [openId, setOpenId] = useState(null);
  const [detailCache, setDetailCache] = useState({});

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([api.getChallans(), api.getItems()])
      .then(([c, i]) => { setChallans(c.data); setAllItems(i.data); })
      .catch(e => toast(e.message, "error"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggleChallan = async (id) => {
    if (openId === id) { setOpenId(null); return; }
    setOpenId(id);
    if (!detailCache[id]) {
      try {
        const detail = await api.getChallanDetail(id);
        setDetailCache(c => ({ ...c, [id]: detail }));
      } catch (e) {
        toast(e.message, "error");
      }
    }
  };

  const handleCancel = async (id) => {
    const ch = challans.find(c => c.id === id);
    if (!confirm(`Cancel challan ${ch?.challan_no}?\nStock will be restored.`)) return;
    try {
      await api.cancelChallan(id);
      toast("Challan cancelled — stock restored");
      setDetailCache(c => { const n = { ...c }; delete n[id]; return n; });
      load();
    } catch (e) {
      toast(e.message, "error");
    }
  };

  const handlePrint = async (id) => {
    let detail = detailCache[id];
    if (!detail) {
      try {
        detail = await api.getChallanDetail(id);
        setDetailCache(c => ({ ...c, [id]: detail }));
      } catch (e) {
        toast(e.message, "error"); return;
      }
    }
    openPrintWindow(detail.challan, detail.items);
  };

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-title">Outward</div>
          <div className="page-sub">
            {challans.length} delivery challan{challans.length !== 1 ? "s" : ""}
          </div>
        </div>
        {isAdmin && !showForm && (
          <button className="btn btn-primary" onClick={() => setShowForm(true)}>
            + New Delivery Challan
          </button>
        )}
      </div>

      {showForm && isAdmin && (
        <OutwardForm
          allItems={allItems}
          onDone={() => { setShowForm(false); load(); }}
          onCancel={() => setShowForm(false)}
        />
      )}

      {loading ? (
        <div style={{ textAlign: "center", padding: 60 }}><div className="spinner" /></div>
      ) : challans.length === 0 && !showForm ? (
        <div className="empty-state">
          <div className="empty-icon">📤</div>
          <div>No delivery challans yet</div>
          {isAdmin && <div style={{ marginTop: 8, fontSize: 13, color: "var(--muted)" }}>Click "+ New Delivery Challan" to create one</div>}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: showForm ? 0 : 4 }}>
          {challans.map(ch => (
            <ChallanCard
              key={ch.id}
              challan={ch}
              isOpen={openId === ch.id}
              detail={detailCache[ch.id]}
              onToggle={() => toggleChallan(ch.id)}
              onCancel={isAdmin ? () => handleCancel(ch.id) : undefined}
              onPrint={() => handlePrint(ch.id)}
            />
          ))}
        </div>
      )}
    </>
  );
}
