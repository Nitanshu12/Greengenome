import { useEffect, useState, useCallback } from "react";
import { api } from "../api";
import { useAuth } from "../hooks/useAuth";
import { useToast } from "../components/Toast";

// ── helpers ───────────────────────────────────────────────────────
function stars(n) {
  if (!n) return <span style={{ color: "var(--muted)" }}>—</span>;
  const full = Math.floor(n);
  return (
    <span style={{ color: "#f59e0b", fontWeight: 600, fontSize: 13 }}>
      {"★".repeat(full)}{"☆".repeat(5 - full)}{" "}
      <span style={{ color: "var(--text)", fontSize: 12 }}>{Number(n).toFixed(1)}</span>
    </span>
  );
}

function StatusBadge({ active }) {
  return (
    <span style={{
      fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 10,
      background: active ? "#fee2e2" : "#dcfce7",
      color: active ? "#dc2626" : "#16a34a"
    }}>
      {active ? "Inactive" : "Active"}
    </span>
  );
}

// ── Link / Edit form modal ────────────────────────────────────────
const EMPTY = {
  item_code: "", vendor_code: "",
  offer_price: "", lead_time: "", is_preferred: false,
  payment_terms: "", contract_start_date: "",
  vendor_rating: "", remarks: ""
};

function LinkModal({ initial, items, vendors, onSave, onClose, saving }) {
  const [form, setForm] = useState(initial || EMPTY);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const isEdit = !!initial;

  function handleItemChange(itemCode) {
    const item = items.find(i => i.item_code === itemCode);
    setForm(f => ({
      ...f,
      item_code: itemCode,
      offer_price: !isEdit && item?.unit_cost != null ? String(item.unit_cost) : f.offer_price,
    }));
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 560, width: "95%", maxHeight: "90vh", overflowY: "auto" }}
        onClick={e => e.stopPropagation()}>
        <div className="modal-title">{isEdit ? "Edit Vendor Link" : "Link Vendor to Item"}</div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div className="form-group">
            <label className="form-label">Item *</label>
            <select className="form-input" value={form.item_code}
              onChange={e => handleItemChange(e.target.value)} disabled={isEdit}>
              <option value="">— select item —</option>
              {items.map(i => (
                <option key={i.item_code} value={i.item_code}>
                  {i.item_code} — {i.name}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Vendor *</label>
            <select className="form-input" value={form.vendor_code}
              onChange={e => set("vendor_code", e.target.value)} disabled={isEdit}>
              <option value="">— select vendor —</option>
              {vendors.map(v => (
                <option key={v.vendor_code} value={v.vendor_code}>
                  {v.vendor_code} — {v.business_name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div className="form-group">
            <label className="form-label">Offer Price (₹)</label>
            <input className="form-input" type="number" min="0" step="0.01"
              value={form.offer_price} placeholder="0.00"
              onChange={e => set("offer_price", e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Lead Time</label>
            <input className="form-input" value={form.lead_time} placeholder="e.g. 7 days"
              onChange={e => set("lead_time", e.target.value)} />
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div className="form-group">
            <label className="form-label">Vendor Rating (1–5)</label>
            <input className="form-input" type="number" min="1" max="5" step="0.1"
              value={form.vendor_rating} placeholder="4.5"
              onChange={e => set("vendor_rating", e.target.value)} />
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div className="form-group">
            <label className="form-label">Payment Terms</label>
            <input className="form-input" value={form.payment_terms} placeholder="e.g. Net 30 days"
              onChange={e => set("payment_terms", e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Contract Start Date</label>
            <input className="form-input" type="date" value={form.contract_start_date || ""}
              onChange={e => set("contract_start_date", e.target.value)} />
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">Remarks</label>
          <textarea className="form-input" rows={2} value={form.remarks}
            placeholder="Any notes about this vendor relationship"
            onChange={e => set("remarks", e.target.value)} />
        </div>

        <div className="form-group" style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <input type="checkbox" id="isPref" checked={!!form.is_preferred}
            onChange={e => set("is_preferred", e.target.checked)}
            style={{ width: 16, height: 16, cursor: "pointer" }} />
          <label htmlFor="isPref" className="form-label" style={{ margin: 0, cursor: "pointer" }}>
            Mark as Inactive Vendor for this item
          </label>
        </div>

        <div className="flex gap-2" style={{ marginTop: 8 }}>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary ml-auto" onClick={() => onSave(form)} disabled={saving}>
            {saving ? "Saving…" : isEdit ? "Save Changes" : "Link Vendor"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────
export default function ItemVendors() {
  const { user }  = useAuth();
  const { toast } = useToast();
  const isAdmin   = ["admin", "superadmin"].includes(user?.role);

  const [items,    setItems]    = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [search,   setSearch]   = useState("");
  const [expanded, setExpanded] = useState(new Set());

  const [allItems,   setAllItems]   = useState([]);
  const [allVendors, setAllVendors] = useState([]);
  const [showForm,   setShowForm]   = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [saving,     setSaving]     = useState(false);

  const load = useCallback((silent = false) => {
    if (!silent) setLoading(true);
    const params = search ? `q=${encodeURIComponent(search)}` : "";
    api.getItemVendors(params)
      .then(d => setItems(d.data))
      .catch(e => toast(e.message, "error"))
      .finally(() => { if (!silent) setLoading(false); });
  }, [search]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!isAdmin) return;
    Promise.all([api.getItemsList(), api.getVendorsList()])
      .then(([i, v]) => { setAllItems(i.data); setAllVendors(v.data); })
      .catch(() => {});
  }, [isAdmin]);

  function toggle(code) {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(code) ? next.delete(code) : next.add(code);
      return next;
    });
  }

  async function handleSave(form) {
    if (!form.item_code || !form.vendor_code)
      return toast("Item and vendor are required", "error");
    setSaving(true);
    try {
      if (editTarget) {
        await api.updateLink(editTarget.item_code, editTarget.vendor_code, form);
        toast("Link updated");
      } else {
        await api.linkVendor(form);
        toast("Vendor linked");
      }
      setShowForm(false);
      setEditTarget(null);
      load(true);
    } catch (e) { toast(e.message, "error"); }
    finally { setSaving(false); }
  }

  async function handleDelete(item_code, vendor_code, vendorName) {
    if (!confirm(`Remove ${vendorName} from this item?`)) return;
    try {
      await api.deleteLink(item_code, vendor_code);
      toast("Vendor removed");
      load(true);
    } catch (e) { toast(e.message, "error"); }
  }

  function openEdit(vendor, item_code) {
    setEditTarget({
      item_code,
      vendor_code:         vendor.vendor_code,
      offer_price:         vendor.offer_price ?? "",
      lead_time:           vendor.lead_time ?? "",
      is_preferred:        vendor.is_preferred,
      payment_terms:       vendor.payment_terms ?? "",
      contract_start_date: vendor.contract_start_date
        ? vendor.contract_start_date.slice(0, 10) : "",
      vendor_rating:       vendor.vendor_rating ?? "",
      remarks:             vendor.remarks ?? "",
    });
    setShowForm(true);
  }

  const totalLinks = items.reduce((s, i) => s + i.vendors.length, 0);

  return (
    <>
      {/* Header */}
      <div className="page-header">
        <div>
          <div className="page-title">Item — Vendor Links</div>
          <div className="page-sub">
            {items.length} item{items.length !== 1 ? "s" : ""} · {totalLinks} vendor link{totalLinks !== 1 ? "s" : ""}
          </div>
        </div>
        {isAdmin && (
          <button className="btn btn-primary" onClick={() => { setEditTarget(null); setShowForm(true); }}>
            + Link Vendor
          </button>
        )}
      </div>

      {/* Search */}
      <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        <input className="form-input" style={{ maxWidth: 360 }}
          placeholder="Search by item code or name…"
          value={search} onChange={e => setSearch(e.target.value)} />
        {search && (
          <button className="btn btn-ghost btn-sm" onClick={() => setSearch("")}>Clear</button>
        )}
      </div>

      {/* Content */}
      {loading ? (
        <div style={{ textAlign: "center", padding: 60 }}><div className="spinner" /></div>
      ) : items.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">🔗</div>
          <div>No item-vendor links found</div>
          {isAdmin && (
            <button className="btn btn-primary" style={{ marginTop: 16 }}
              onClick={() => { setEditTarget(null); setShowForm(true); }}>
              + Link First Vendor
            </button>
          )}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {items.map(item => {
            const open = expanded.has(item.item_code);
            return (
              <div key={item.item_code} style={{
                background: "#fff", borderRadius: 12,
                boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
                overflow: "hidden", border: "1px solid var(--border)"
              }}>
                {/* Item row — click to expand */}
                <div onClick={() => toggle(item.item_code)} style={{
                  display: "flex", alignItems: "center", gap: 14,
                  padding: "14px 20px", cursor: "pointer",
                  background: open ? "var(--primary-bg, #f0fdf4)" : "#fff",
                  transition: "background 0.2s"
                }}>
                  <span style={{ fontSize: 13, color: "var(--muted)", minWidth: 16 }}>
                    {open ? "▼" : "►"}
                  </span>
                  <span style={{
                    fontFamily: "monospace", fontWeight: 700, fontSize: 12,
                    background: "var(--border)", padding: "2px 8px", borderRadius: 4
                  }}>
                    {item.item_code}
                  </span>
                  <span style={{ fontWeight: 600, flex: 1 }}>{item.item_name}</span>
                  <span style={{ fontSize: 12, color: "var(--muted)" }}>{item.unit}</span>
                  <span style={{
                    fontSize: 12, fontWeight: 600, padding: "2px 10px", borderRadius: 10,
                    background: item.vendors.length ? "#dbeafe" : "#f1f5f9",
                    color: item.vendors.length ? "#1d4ed8" : "var(--muted)"
                  }}>
                    {item.vendors.length} vendor{item.vendors.length !== 1 ? "s" : ""}
                  </span>
                </div>

                {/* Vendor sub-table */}
                {open && (
                  <div style={{ borderTop: "1px solid var(--border)", overflowX: "hidden" }}>
                    {item.vendors.length === 0 ? (
                      <div style={{ padding: "16px 24px", color: "var(--muted)", fontSize: 14 }}>
                        No vendors linked yet.
                        {isAdmin && (
                          <button className="btn btn-ghost btn-sm" style={{ marginLeft: 12 }}
                            onClick={() => { setEditTarget(null); setShowForm(true); }}>
                            + Link one
                          </button>
                        )}
                      </div>
                    ) : (
                      <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse", tableLayout: "fixed" }}>
                        <thead>
                          <tr style={{ background: "#f8f9fa", color: "var(--muted)", fontSize: 11, textTransform: "uppercase" }}>
                            <th style={{ ...th, width: "15%" }}>Vendor</th>
                            <th style={{ ...th, width: "12%" }}>Contact</th>
                            <th style={{ ...th, width: "9%"  }}>Offer Price</th>
                            <th style={{ ...th, width: "8%"  }}>Lead Time</th>
                            <th style={{ ...th, width: "10%" }}>Payment</th>
                            <th style={{ ...th, width: "10%" }}>Contract Date</th>
                            <th style={{ ...th, width: "9%"  }}>Rating</th>
                            <th style={{ ...th, width: "8%"  }}>Status</th>
                            {isAdmin && <th style={{ ...th, width: "12%" }}>Actions</th>}
                          </tr>
                        </thead>
                        <tbody>
                          {item.vendors.map(v => (
                            <tr key={v.vendor_code} style={{ borderTop: "1px solid var(--border)" }}>
                              <td style={td}>
                                <div style={{ fontWeight: 700, fontSize: 12 }}>{v.vendor_code}</div>
                                <div style={{ color: "var(--muted)", fontSize: 12 }}>{v.business_name}</div>
                              </td>
                              <td style={td}>
                                <div>{v.contact_person || "—"}</div>
                                <div style={{ color: "var(--muted)", fontSize: 12 }}>{v.phone || ""}</div>
                              </td>
                              <td style={{ ...td, fontWeight: 600 }}>
                                {v.offer_price ? `₹${Number(v.offer_price).toLocaleString("en-IN")}` : "—"}
                              </td>
                              <td style={td}>{v.lead_time || "—"}</td>
                              <td style={td}>{v.payment_terms || "—"}</td>
                              <td style={td}>
                                {v.contract_start_date
                                  ? new Date(v.contract_start_date).toLocaleDateString("en-IN")
                                  : "—"}
                              </td>
                              <td style={td}>{stars(v.vendor_rating)}</td>
                              <td style={td}><StatusBadge active={v.is_preferred} /></td>
                              {isAdmin && (
                                <td style={td}>
                                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                                    <button className="btn btn-ghost btn-sm"
                                      onClick={() => openEdit(v, item.item_code)}>
                                      Edit
                                    </button>
                                    <button className="btn btn-danger btn-sm"
                                      onClick={() => handleDelete(item.item_code, v.vendor_code, v.business_name)}>
                                      Remove
                                    </button>
                                  </div>
                                </td>
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Link / Edit modal */}
      {showForm && (
        <LinkModal
          initial={editTarget}
          items={allItems}
          vendors={allVendors}
          onSave={handleSave}
          onClose={() => { setShowForm(false); setEditTarget(null); }}
          saving={saving}
        />
      )}

    </>
  );
}

// ── table cell styles ─────────────────────────────────────────────
const th = { padding: "8px 10px", textAlign: "left", fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" };
const td = { padding: "10px 10px", verticalAlign: "top", overflow: "hidden", textOverflow: "ellipsis" };
