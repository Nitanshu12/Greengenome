import { useEffect, useState, useCallback, useMemo } from "react";
import { api } from "../api";
import { useAuth } from "../hooks/useAuth";
import { useToast } from "../components/Toast";

const UNITS = ["Piece", "Box", "Pack", "Strip", "Vial", "Bottle", "Roll", "Pair", "Set", "Kg", "Litre", "Metre"];
const STATUSES = ["active", "expired", "quarantined", "returned"];

const STATUS_STYLE = {
  active: { background: "#d1fae5", color: "#065f46" },
  expired: { background: "#fee2e2", color: "#991b1b" },
  quarantined: { background: "#fef3c7", color: "#92400e" },
  returned: { background: "#e0e7ff", color: "#3730a3" },
};

const EMPTY_BATCH_FORM = {
  supplier_batch_no: "", item_code: "", vendor_code: "",
  mfg_date: "", expiry_date: "", qty_received: "",
  unit: "", storage_location: "", status: "active", remarks: "",
};

// ── Goods Receipt (Add) Modal ─────────────────────────────────────
function BatchFormModal({ initial, items, vendors, onSave, onClose, saving }) {
  const [form, setForm] = useState(() => initial ?? { ...EMPTY_BATCH_FORM });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const selectedItem = items.find(i => i.item_code === form.item_code);

  useEffect(() => {
    if (selectedItem && !initial) set("unit", selectedItem.unit);
  }, [form.item_code]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal"
        style={{ maxWidth: 660, width: "95%", maxHeight: "90vh", overflowY: "auto" }}
        onClick={e => e.stopPropagation()}
      >
        <div className="modal-title">{initial ? "Edit Batch" : "Record Goods Receipt"}</div>

        {/* Item + Vendor */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div className="form-group">
            <label className="form-label">Item *</label>
            <select className="form-select" value={form.item_code}
              onChange={e => set("item_code", e.target.value)} disabled={!!initial}>
              <option value="">Select item…</option>
              {items.map(i => (
                <option key={i.item_code} value={i.item_code}>
                  {i.item_code} — {i.name}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Vendor</label>
            <select className="form-select" value={form.vendor_code}
              onChange={e => set("vendor_code", e.target.value)}>
              <option value="">Select vendor…</option>
              {vendors.map(v => (
                <option key={v.vendor_code} value={v.vendor_code}>
                  {v.vendor_code} — {v.business_name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Supplier Batch No + Unit */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div className="form-group">
            <label className="form-label">Supplier Batch No</label>
            <input className="form-input" value={form.supplier_batch_no}
              onChange={e => set("supplier_batch_no", e.target.value)}
              placeholder="Number printed on packaging" />
          </div>
          <div className="form-group">
            <label className="form-label">Unit *</label>
            <select className="form-select" value={form.unit}
              onChange={e => set("unit", e.target.value)}>
              <option value="">Select unit…</option>
              {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
        </div>

        {/* Mfg Date + Expiry Date */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div className="form-group">
            <label className="form-label">Manufacturing Date</label>
            <input className="form-input" type="date" value={form.mfg_date}
              onChange={e => set("mfg_date", e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Expiry Date *</label>
            <input className="form-input" type="date" value={form.expiry_date}
              onChange={e => set("expiry_date", e.target.value)} />
          </div>
        </div>

        {/* Qty + Status */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div className="form-group">
            <label className="form-label">Quantity Received *</label>
            <input className="form-input" type="number" min="1" value={form.qty_received}
              onChange={e => set("qty_received", e.target.value)} placeholder="0"
              disabled={!!initial} />
          </div>
          <div className="form-group">
            <label className="form-label">Status</label>
            <select className="form-select" value={form.status}
              onChange={e => set("status", e.target.value)}>
              {STATUSES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
            </select>
          </div>
        </div>

        {/* Storage Location */}
        <div className="form-group">
          <label className="form-label">Storage Location</label>
          <input className="form-input" value={form.storage_location}
            onChange={e => set("storage_location", e.target.value)}
            placeholder="e.g. Shelf B3, Cold Room 1" />
        </div>

        {/* Remarks */}
        <div className="form-group">
          <label className="form-label">Remarks / Special Instructions</label>
          <textarea className="form-input" rows={2} value={form.remarks}
            onChange={e => set("remarks", e.target.value)}
            placeholder="e.g. Cold chain required, restricted handling"
            style={{ resize: "vertical" }} />
        </div>

        <div className="flex gap-2" style={{ marginTop: 4 }}>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary ml-auto" onClick={() => onSave(form)} disabled={saving}>
            {saving ? "Saving…" : initial ? "Save Changes" : "Record Receipt"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Issue Stock Modal ─────────────────────────────────────────────
function IssueModal({ batch, onSave, onClose, saving }) {
  const [qty, setQty] = useState("");
  const [reason, setReason] = useState("");
  const available = batch.qty_received - batch.qty_issued;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 420, width: "95%" }}
        onClick={e => e.stopPropagation()}>
        <div className="modal-title">Issue Stock</div>
        <div style={{
          marginBottom: 16, padding: "10px 14px", background: "var(--border)",
          borderRadius: 8, fontSize: 13
        }}>
          <strong>{batch.item_name}</strong>
          <div style={{ color: "var(--muted)", marginTop: 4 }}>
            Batch #{batch.batch_id}
            {batch.supplier_batch_no ? ` · ${batch.supplier_batch_no}` : ""}
            &nbsp;·&nbsp; Available: <strong>{available} {batch.unit}</strong>
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">Quantity to Issue *</label>
          <input className="form-input" type="number" min="1" max={available}
            value={qty} onChange={e => setQty(e.target.value)} placeholder="0" />
        </div>
        <div className="form-group">
          <label className="form-label">Reason</label>
          <input className="form-input" value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder="e.g. Kit Assembly, Dispensed to patient" />
        </div>
        <div className="flex gap-2" style={{ marginTop: 4 }}>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary ml-auto"
            onClick={() => onSave(qty, reason)} disabled={saving || !qty}>
            {saving ? "Issuing…" : "Confirm Issue"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────
export default function StockBatches() {
  const { user } = useAuth();
  const { toast } = useToast();
  const isAdmin = ["admin", "superadmin"].includes(user?.role);

  const [batches, setBatches] = useState([]);
  const [items, setItems] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterItem, setFilterItem] = useState("");
  const [view, setView] = useState("batches"); // "batches" | "summary"

  const [showForm, setShowForm] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [issueTarget, setIssueTarget] = useState(null);

  const [summary, setSummary] = useState([]);

  const load = useCallback((silent = false) => {
    if (!silent) setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set("q", search);
    if (filterStatus) params.set("status", filterStatus);
    if (filterItem) params.set("item_code", filterItem);
    api.getStockBatches(params.toString())
      .then(d => setBatches(d.data))
      .catch(e => toast(e.message, "error"))
      .finally(() => { if (!silent) setLoading(false); });
  }, [search, filterStatus, filterItem]);

  const loadSummary = useCallback(() => {
    api.getStockSummary()
      .then(d => setSummary(d.data))
      .catch(e => toast(e.message, "error"));
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadSummary(); }, [loadSummary]);

  useEffect(() => {
    api.getItems().then(d => setItems(d.data)).catch(() => { });
    api.getVendors().then(d => setVendors(d.data)).catch(() => { });
  }, []);

  const handleSave = async (form) => {
    if (!form.item_code || !form.expiry_date || !form.qty_received || !form.unit) {
      toast("Item, expiry date, quantity, and unit are required", "error");
      return;
    }
    setSaving(true);
    try {
      if (editTarget) {
        await api.updateStockBatch(editTarget.batch_id, {
          storage_location: form.storage_location,
          status: form.status,
          remarks: form.remarks,
        });
        toast("Batch updated");
      } else {
        await api.createStockBatch(form);
        toast("Goods receipt recorded");
      }
      setShowForm(false);
      setEditTarget(null);
      load(true);
      loadSummary();
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setSaving(false);
    }
  };

  const handleIssue = async (qty, reason) => {
    setSaving(true);
    try {
      await api.issueStock(issueTarget.batch_id, { qty: Number(qty), reason });
      toast(`${qty} ${issueTarget.unit} issued`);
      setIssueTarget(null);
      load(true);
      loadSummary();
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (batch) => {
    if (!confirm(`Delete batch #${batch.batch_id} (${batch.item_name})? This cannot be undone.`)) return;
    try {
      await api.deleteStockBatch(batch.batch_id);
      toast("Batch deleted");
      load(true);
      loadSummary();
    } catch (e) {
      toast(e.message, "error");
    }
  };

  const openEdit = (batch) => {
    setEditTarget(batch);
    setShowForm(true);
  };

  const uniqueItems = [...new Map(batches.map(b => [b.item_code, { item_code: b.item_code, item_name: b.item_name }])).values()];

  const expiryBadge = (dateStr) => {
    if (!dateStr) return null;
    const date = new Date(dateStr);
    if (isNaN(date.getTime()) || date.getFullYear() < 2000) return null;
    const days = Math.ceil((date - new Date()) / (1000 * 60 * 60 * 24));
    if (days < 0) return <span style={{ background: "#fee2e2", color: "#991b1b", borderRadius: 4, padding: "2px 6px", fontSize: 11, marginLeft: 6 }}>Expired</span>;
    if (days <= 90) return <span style={{ background: "#fef3c7", color: "#92400e", borderRadius: 4, padding: "2px 6px", fontSize: 11, marginLeft: 6 }}>{days}d left</span>;
    return null;
  };

  const formatDateMMM_YY = (dateStr) => {
    if (!dateStr) return <span style={{ color: "var(--muted)" }}>NULL</span>;
    const date = new Date(dateStr);
    if (isNaN(date.getTime()) || date.getFullYear() < 2000) {
      return <span style={{ color: "var(--muted)" }}>NULL</span>;
    }
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const m = months[date.getMonth()];
    const y = String(date.getFullYear()).slice(-2);
    return `${m}-${y}`;
  };

  const sortedBatches = useMemo(() => {
    return [...batches].sort((a, b) => {
      const cmp = (a.item_code || "").localeCompare(b.item_code || "", undefined, { numeric: true, sensitivity: "base" });
      if (cmp !== 0) return cmp;
      const dateA = a.expiry_date ? new Date(a.expiry_date).getTime() : 0;
      const dateB = b.expiry_date ? new Date(b.expiry_date).getTime() : 0;
      return dateA - dateB;
    });
  }, [batches]);

  const sortedSummary = useMemo(() => {
    return [...summary].sort((a, b) => {
      return (a.item_code || "").localeCompare(b.item_code || "", undefined, { numeric: true, sensitivity: "base" });
    });
  }, [summary]);

  return (
    <>
      {/* ── Page Header ── */}
      <div className="page-header">
        <div>
          <div className="page-title">Stock Batches</div>
          <div className="page-sub">{batches.length} batches in warehouse</div>
        </div>
        <div className="flex gap-2">
          <button
            className={`btn ${view === "batches" ? "btn-primary" : "btn-ghost"}`}
            onClick={() => setView("batches")}>
            Batch View
          </button>
          <button
            className={`btn ${view === "summary" ? "btn-primary" : "btn-ghost"}`}
            onClick={() => setView("summary")}>
            Summary View
          </button>
          {isAdmin && view === "batches" && (
            <button className="btn btn-primary" onClick={() => { setEditTarget(null); setShowForm(true); }}>
              + Record Receipt
            </button>
          )}
        </div>
      </div>

      {/* ── Summary View ── */}
      {view === "summary" && (
        <>
          <div style={{ marginBottom: 16, fontSize: 13, color: "var(--muted)" }}>
            Current stock in hand per item — computed live from all active, non-expired batches.
          </div>
          {summary.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">📦</div>
              <div>No stock data yet</div>
            </div>
          ) : (
            <div className="table-wrap">
              <table className="items-master-table">
                <thead>
                  <tr>
                    <th>Item Code</th>
                    <th>Item Name</th>
                    <th>Unit</th>
                    <th style={{ textAlign: "right" }}>Qty in Hand</th>
                    <th>Nearest Expiry</th>
                    <th style={{ textAlign: "center" }}>Batches</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedSummary.map(row => (
                    <tr key={row.item_code}>
                      <td>
                        <span style={{
                          fontFamily: "monospace", fontWeight: 600, fontSize: 12,
                          background: "var(--border)", padding: "2px 6px", borderRadius: 4
                        }}>
                          {row.item_code}
                        </span>
                      </td>
                      <td style={{ fontWeight: 500 }}>{row.item_name}</td>
                      <td style={{ color: "var(--muted)" }}>{row.unit}</td>
                      <td style={{
                        textAlign: "right", fontWeight: 700,
                        color: row.qty_in_hand <= 0 ? "#991b1b" : "var(--fg)"
                      }}>
                        {row.qty_in_hand ?? 0}
                      </td>
                      <td>
                        {formatDateMMM_YY(row.nearest_expiry)}
                        {expiryBadge(row.nearest_expiry)}
                      </td>
                      <td style={{ textAlign: "center", color: "var(--muted)" }}>{row.batch_count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ── Batch View ── */}
      {view === "batches" && (
        <>
          {/* Filters */}
          <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
            <input
              className="form-input"
              style={{ maxWidth: 260 }}
              placeholder="Search item, batch no…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            <select className="form-select" style={{ maxWidth: 180 }}
              value={filterItem} onChange={e => setFilterItem(e.target.value)}>
              <option value="">All Items</option>
              {uniqueItems.map(i => (
                <option key={i.item_code} value={i.item_code}>{i.item_code} — {i.item_name}</option>
              ))}
            </select>
            <select className="form-select" style={{ maxWidth: 160 }}
              value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
              <option value="">All Statuses</option>
              {STATUSES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
            </select>
            {(search || filterStatus || filterItem) && (
              <button className="btn btn-ghost btn-sm"
                onClick={() => { setSearch(""); setFilterStatus(""); setFilterItem(""); }}>
                Clear
              </button>
            )}
          </div>

          {loading ? (
            <div style={{ textAlign: "center", padding: 60 }}><div className="spinner" /></div>
          ) : batches.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">📦</div>
              <div>No stock batches found</div>
              {isAdmin && (
                <button className="btn btn-primary" style={{ marginTop: 16 }}
                  onClick={() => { setEditTarget(null); setShowForm(true); }}>
                  + Record First Receipt
                </button>
              )}
            </div>
          ) : (
            <div className="table-wrap">
              <table className="items-master-table">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Item Name</th>
                    <th>Batch No</th>
                    <th>Vendor</th>
                    <th>Mfg Date</th>
                    <th>Expiry Date</th>
                    <th style={{ textAlign: "right" }}>Received</th>
                    <th style={{ textAlign: "right" }}>Issued</th>
                    <th style={{ textAlign: "right" }}>In Hand</th>
                    <th>Location</th>
                    <th>Status</th>
                    {isAdmin && <th>Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {sortedBatches.map(b => {
                    const inHand = b.qty_received - b.qty_issued;
                    return (
                      <tr key={b.batch_id}>
                        {/* Item code + name */}
                        <td>
                          <div style={{ fontSize: 11, color: "var(--muted)", fontFamily: "monospace" }}>
                            {b.item_code}
                          </div>
                        </td>
                        <td>
                          <div style={{
                            fontWeight: 500, maxWidth: 180, overflow: "hidden",
                            textOverflow: "ellipsis", whiteSpace: "nowrap"
                          }} title={b.item_name}>
                            {b.item_name}
                          </div>
                        </td>
                        {/* Batch No */}
                        <td style={{ color: "var(--muted)", fontFamily: "monospace", fontSize: 12 }}>
                          {b.supplier_batch_no || <span style={{ color: "var(--muted)" }}>—</span>}
                        </td>
                        {/* Vendor */}
                        <td style={{
                          fontSize: 12, maxWidth: 140, overflow: "hidden",
                          textOverflow: "ellipsis", whiteSpace: "nowrap"
                        }}
                          title={b.vendor_code}>
                          {b.vendor_code || <span style={{ color: "var(--muted)" }}>—</span>}
                        </td>
                        {/* Mfg Date */}
                        <td style={{ whiteSpace: "nowrap", fontSize: 12, color: "var(--muted)" }}>
                          {formatDateMMM_YY(b.mfg_date)}
                        </td>
                        {/* Expiry Date */}
                        <td style={{ whiteSpace: "nowrap" }}>
                          {formatDateMMM_YY(b.expiry_date)}
                          {expiryBadge(b.expiry_date)}
                        </td>
                        <td style={{ textAlign: "right", color: "var(--muted)" }}>
                          {b.qty_received} {b.unit}
                        </td>
                        <td style={{ textAlign: "right", color: b.qty_issued > 0 ? "var(--fg)" : "var(--muted)" }}>
                          {b.qty_issued} {b.unit}
                        </td>
                        <td style={{
                          textAlign: "right", fontWeight: 700,
                          color: inHand <= 0 ? "#991b1b" : inHand <= 10 ? "#92400e" : "var(--fg)"
                        }}>
                          {inHand} {b.unit}
                        </td>
                        <td style={{
                          fontSize: 12, color: "var(--muted)", maxWidth: 120,
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"
                        }}
                          title={b.storage_location}>
                          {b.storage_location || "NULL"}
                        </td>
                        <td>
                          <span style={{
                            ...STATUS_STYLE[b.status],
                            borderRadius: 4, padding: "2px 8px", fontSize: 11, fontWeight: 600
                          }}>
                            {b.status.charAt(0).toUpperCase() + b.status.slice(1)}
                          </span>
                        </td>
                        {isAdmin && (
                          <td>
                            <div className="flex gap-2">
                              {b.status === "active" && inHand > 0 && (
                                <button className="btn btn-ghost btn-sm"
                                  onClick={() => setIssueTarget(b)}>
                                  Issue
                                </button>
                              )}
                              <button className="btn btn-ghost btn-sm" onClick={() => openEdit(b)}>
                                Edit
                              </button>
                              <button className="btn btn-danger btn-sm" onClick={() => handleDelete(b)}>
                                Delete
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ── Modals ── */}
      {showForm && (
        <BatchFormModal
          initial={editTarget ? {
            item_code: editTarget.item_code ?? "",
            vendor_code: editTarget.vendor_code ?? "",
            supplier_batch_no: editTarget.supplier_batch_no ?? "",
            mfg_date: editTarget.mfg_date ? editTarget.mfg_date.slice(0, 10) : "",
            expiry_date: editTarget.expiry_date ? editTarget.expiry_date.slice(0, 10) : "",
            qty_received: editTarget.qty_received ?? "",
            unit: editTarget.unit ?? "",
            storage_location: editTarget.storage_location ?? "",
            status: editTarget.status ?? "active",
            remarks: editTarget.remarks ?? "",
          } : null}
          items={items}
          vendors={vendors}
          onSave={handleSave}
          onClose={() => { setShowForm(false); setEditTarget(null); }}
          saving={saving}
        />
      )}

      {issueTarget && (
        <IssueModal
          batch={issueTarget}
          onSave={handleIssue}
          onClose={() => setIssueTarget(null)}
          saving={saving}
        />
      )}
    </>
  );
}
