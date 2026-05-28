import { useEffect, useState, useCallback } from "react";
import { api } from "../api";
import { useAuth } from "../hooks/useAuth";
import { useToast } from "../components/Toast";

const EMPTY_FORM = {
  item_code: "",
  vendor_code: "",
  business_name: "",
  address: "",
  email: "",
  phone: "",
  contact_person: "",
  offer_price: "",
  lead_time: ""
};

function VendorFormModal({ initial, onSave, onClose, saving, items }) {
  const [form, setForm] = useState(initial || EMPTY_FORM);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal"
        style={{ maxWidth: 660, width: "95%", maxHeight: "90vh", overflowY: "auto" }}
        onClick={e => e.stopPropagation()}
      >
        <div className="modal-title">
          {initial ? "Edit Vendor Link" : "Add Vendor"}
        </div>

        {/* Item select — only on Add */}
        {!initial && (
          <div className="form-group">
            <label className="form-label">Item *</label>
            <select className="form-select" value={form.item_code}
              onChange={e => set("item_code", e.target.value)}>
              <option value="">Select item</option>
              {items.map(it => (
                <option key={it.item_code} value={it.item_code}>
                  {it.item_code} — {it.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Vendor Code + Business Name */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 12 }}>
          <div className="form-group">
            <label className="form-label">Vendor Code *</label>
            <input className="form-input" value={form.vendor_code}
              onChange={e => set("vendor_code", e.target.value)}
              placeholder="e.g. VC0024" />
          </div>
          <div className="form-group">
            <label className="form-label">Business Name *</label>
            <input className="form-input" value={form.business_name}
              onChange={e => set("business_name", e.target.value)}
              placeholder="Company / vendor name" />
          </div>
        </div>

        {/* Address */}
        <div className="form-group">
          <label className="form-label">Address</label>
          <textarea className="form-input" rows={2} value={form.address}
            onChange={e => set("address", e.target.value)}
            placeholder="Full business address"
            style={{ resize: "vertical" }} />
        </div>

        {/* Email + Phone */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div className="form-group">
            <label className="form-label">Email</label>
            <input className="form-input" type="email" value={form.email}
              onChange={e => set("email", e.target.value)}
              placeholder="vendor@email.com" />
          </div>
          <div className="form-group">
            <label className="form-label">Phone</label>
            <input className="form-input" value={form.phone}
              onChange={e => set("phone", e.target.value)}
              placeholder="e.g. 9350209580" />
          </div>
        </div>

        {/* Contact Person + Offer Price + Lead Time */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
          <div className="form-group">
            <label className="form-label">Contact Person</label>
            <input className="form-input" value={form.contact_person}
              onChange={e => set("contact_person", e.target.value)}
              placeholder="e.g. Mr. Shiv" />
          </div>
          <div className="form-group">
            <label className="form-label">Offer Price (₹)</label>
            <input className="form-input" type="number" min="0" step="0.01"
              value={form.offer_price}
              onChange={e => set("offer_price", e.target.value)}
              placeholder="0.00" />
          </div>
          <div className="form-group">
            <label className="form-label">Lead Time</label>
            <input className="form-input" value={form.lead_time}
              onChange={e => set("lead_time", e.target.value)}
              placeholder="e.g. 1 day" />
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2" style={{ marginTop: 4 }}>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary ml-auto" onClick={() => onSave(form)} disabled={saving}>
            {saving ? "Saving…" : initial ? "Save Changes" : "Add Vendor Link"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function VendorList() {
  const { user } = useAuth();
  const { toast } = useToast();
  const isAdmin = ["admin", "superadmin"].includes(user?.role);

  const [vendors, setVendors] = useState([]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const PER_PAGE = 15;

  const [showForm, setShowForm] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    const params = search ? `q=${encodeURIComponent(search)}` : "";
    api.getVendors(params)
      .then(d => { setVendors(d.data); setPage(1); })
      .catch(e => toast(e.message, "error"))
      .finally(() => setLoading(false));
  }, [search]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    api.getItems().then(d => setItems(d.data)).catch(() => {});
  }, []);

  const handleSave = async (form) => {
    if (!editTarget && !form.item_code) {
      toast("Please select an item", "error"); return;
    }
    if (!form.vendor_code.trim() || !form.business_name.trim()) {
      toast("Vendor code and business name are required", "error"); return;
    }
    setSaving(true);
    try {
      if (editTarget) {
        await api.updateVendor(editTarget.id, form);
        toast("Vendor link updated");
      } else {
        await api.createVendor(form);
        toast("Vendor link added");
      }
      setShowForm(false);
      setEditTarget(null);
      load();
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (row) => {
    if (!confirm(`Remove vendor "${row.vendor_code}" link for item "${row.item_code}"? This cannot be undone.`)) return;
    try {
      const res = await api.deleteVendor(row.id);
      toast(res.msg);
      load();
    } catch (e) {
      toast(e.message, "error");
    }
  };

  const openEdit = (row) => { setEditTarget(row); setShowForm(true); };
  const openAdd  = ()    => { setEditTarget(null); setShowForm(true); };

  const totalPages = Math.max(1, Math.ceil(vendors.length / PER_PAGE));
  const pageRows   = vendors.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  return (
    <>
      {/* ── Page Header ── */}
      <div className="page-header">
        <div>
          <div className="page-title">Vendor List</div>
          <div className="page-sub">{vendors.length} vendor link{vendors.length !== 1 ? "s" : ""} in database</div>
        </div>
        {isAdmin && (
          <button className="btn btn-primary" onClick={openAdd}>+ Add Vendor</button>
        )}
      </div>

      {/* ── Filters ── */}
      <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        <input
          className="form-input"
          style={{ maxWidth: 360 }}
          placeholder="Search by item code, name, vendor code or business…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        {search && (
          <button className="btn btn-ghost btn-sm" onClick={() => setSearch("")}>Clear</button>
        )}
      </div>

      {/* ── Table ── */}
      {loading ? (
        <div style={{ textAlign: "center", padding: 60 }}><div className="spinner" /></div>
      ) : vendors.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">🏪</div>
          <div>No vendor links found</div>
          {isAdmin && (
            <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={openAdd}>
              + Add First Vendor
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="table-wrap pkg-table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Item Code</th>
                  <th>Item Name</th>
                  <th>Vendor Code</th>
                  <th>Business Name</th>
                  <th>Address</th>
                  <th>Email</th>
                  <th>Phone</th>
                  <th>Contact Person</th>
                  <th>Offer Price</th>
                  <th>Lead Time</th>
                  {isAdmin && <th>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {pageRows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <span style={{ fontFamily: "monospace", fontWeight: 600, fontSize: 12,
                        background: "var(--border)", padding: "2px 6px", borderRadius: 4 }}>
                        {row.item_code}
                      </span>
                    </td>
                    <td style={{ maxWidth: 200 }}>
                      <div style={{ fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis",
                        whiteSpace: "nowrap", maxWidth: 200 }} title={row.item_name}>
                        {row.item_name}
                      </div>
                    </td>
                    <td>
                      <span style={{ fontFamily: "monospace", fontWeight: 600, fontSize: 12,
                        background: "var(--border)", padding: "2px 6px", borderRadius: 4 }}>
                        {row.vendor_code}
                      </span>
                    </td>
                    <td style={{ maxWidth: 180 }}>
                      <span style={{ fontWeight: 500, display: "block", overflow: "hidden",
                        textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 180 }}
                        title={row.business_name}>
                        {row.business_name}
                      </span>
                    </td>
                    <td style={{ maxWidth: 160 }}>
                      {row.address
                        ? <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis",
                            whiteSpace: "nowrap", maxWidth: 160, fontSize: 12, color: "var(--muted)" }}
                            title={row.address}>{row.address}</span>
                        : <span style={{ color: "var(--muted)" }}>—</span>}
                    </td>
                    <td style={{ maxWidth: 160 }}>
                      {row.email
                        ? <a href={`mailto:${row.email}`}
                            style={{ color: "var(--accent)", display: "block", overflow: "hidden",
                              textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 160, fontSize: 12 }}
                            title={row.email}>{row.email}</a>
                        : <span style={{ color: "var(--muted)" }}>—</span>}
                    </td>
                    <td style={{ color: "var(--muted)" }}>{row.phone || "—"}</td>
                    <td>{row.contact_person || <span style={{ color: "var(--muted)" }}>—</span>}</td>
                    <td>
                      {row.offer_price != null
                        ? <span>₹{Number(row.offer_price).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
                        : <span style={{ color: "var(--muted)" }}>—</span>}
                    </td>
                    <td style={{ color: "var(--muted)" }}>{row.lead_time || "—"}</td>
                    {isAdmin && (
                      <td>
                        <div className="flex gap-2">
                          <button className="btn btn-ghost btn-sm" onClick={() => openEdit(row)}>Edit</button>
                          <button className="btn btn-danger btn-sm" onClick={() => handleDelete(row)}>Delete</button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ── Pagination ── */}
          {totalPages > 1 && (
            <div className="pagination-bar">
              <span className="pagination-info">
                {(page - 1) * PER_PAGE + 1}–{Math.min(page * PER_PAGE, vendors.length)} of {vendors.length}
              </span>
              <div className="pagination-controls">
                <button className="pg-btn" disabled={page === 1} onClick={() => setPage(1)}>«</button>
                <button className="pg-btn" disabled={page === 1} onClick={() => setPage(p => p - 1)}>‹</button>
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
                  .reduce((acc, p, i, arr) => {
                    if (i > 0 && p - arr[i - 1] > 1) acc.push("…");
                    acc.push(p);
                    return acc;
                  }, [])
                  .map((p, i) =>
                    p === "…"
                      ? <span key={`e${i}`} className="pg-ellipsis">…</span>
                      : <button key={p} className={`pg-btn ${p === page ? "pg-active" : ""}`}
                          onClick={() => setPage(p)}>{p}</button>
                  )
                }
                <button className="pg-btn" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>›</button>
                <button className="pg-btn" disabled={page === totalPages} onClick={() => setPage(totalPages)}>»</button>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Add / Edit Modal ── */}
      {showForm && (
        <VendorFormModal
          initial={editTarget ? {
            vendor_code:    editTarget.vendor_code    || "",
            business_name:  editTarget.business_name  || "",
            address:        editTarget.address        || "",
            email:          editTarget.email          || "",
            phone:          editTarget.phone          || "",
            contact_person: editTarget.contact_person || "",
            offer_price:    editTarget.offer_price    ?? "",
            lead_time:      editTarget.lead_time      || ""
          } : null}
          onSave={handleSave}
          onClose={() => { setShowForm(false); setEditTarget(null); }}
          saving={saving}
          items={items}
        />
      )}
    </>
  );
}
