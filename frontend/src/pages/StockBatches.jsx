import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { api } from "../api";
import { useAuth } from "../hooks/useAuth";
import { useToast } from "../components/Toast";

const UNITS = ["Piece", "Box", "Pack", "Strip", "Vial", "Bottle", "Roll", "Pair", "Set", "Kg", "Litre", "Metre"];

const API_ROOT = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");
function docHref(url) {
  if (!url) return "#";
  if (url.startsWith("/uploads/")) return `${API_ROOT}${url}`;
  return url;
}

function BatchDocsModal({ batch, isAdmin, onClose, toast }) {
  const [docs, setDocs]           = useState([]);
  const [loading, setLoading]     = useState(true);
  const [name, setName]           = useState("");
  const [file, setFile]           = useState(null);
  const [dragging, setDragging]   = useState(false);
  const [uploading, setUploading] = useState(false);
  const [mode, setMode]           = useState("file");
  const [link, setLink]           = useState("");
  const fileInputRef              = useRef(null);

  useEffect(() => {
    api.getBatchDocs(batch.batch_id)
      .then(d => setDocs(d.data))
      .catch(e => toast(e.message, "error"))
      .finally(() => setLoading(false));
  }, [batch.batch_id]);

  function pickFile(f) {
    if (!f) return;
    const ext = f.name.split(".").pop().toLowerCase();
    if (!["pdf", "jpg", "jpeg", "png"].includes(ext)) {
      toast("Only PDF, JPG, PNG files are allowed", "error");
      return;
    }
    setFile(f);
    if (!name.trim()) setName(f.name.replace(/\.[^.]+$/, ""));
  }

  function handleDragOver(e) { e.preventDefault(); setDragging(true); }
  function handleDragLeave() { setDragging(false); }
  function handleDrop(e) {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) pickFile(f);
  }

  async function handleUpload() {
    if (!file)        return toast("Please select a file", "error");
    if (!name.trim()) return toast("Document name is required", "error");
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("batch_id", batch.batch_id);
      fd.append("document_name", name.trim());
      await api.uploadBatchDoc(fd);
      const d = await api.getBatchDocs(batch.batch_id);
      setDocs(d.data);
      setFile(null);
      setName("");
      toast("Document uploaded");
    } catch (e) { toast(e.message, "error"); }
    finally { setUploading(false); }
  }

  async function handleAddLink() {
    if (!link.trim()) return toast("URL is required", "error");
    if (!name.trim()) return toast("Document name is required", "error");
    try { new URL(link.trim()); } catch { return toast("Please enter a valid URL", "error"); }
    setUploading(true);
    try {
      await api.addBatchDoc({ batch_id: batch.batch_id, document_name: name.trim(), document_url: link.trim() });
      const d = await api.getBatchDocs(batch.batch_id);
      setDocs(d.data);
      setLink("");
      setName("");
      toast("Link added");
    } catch (e) { toast(e.message, "error"); }
    finally { setUploading(false); }
  }

  async function handleDelete(id) {
    if (!confirm("Delete this document?")) return;
    try {
      await api.deleteBatchDoc(id);
      setDocs(d => d.filter(x => x.id !== id));
      toast("Document deleted");
    } catch (e) { toast(e.message, "error"); }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 520, width: "95%", maxHeight: "90vh", overflowY: "auto" }}
        onClick={e => e.stopPropagation()}>
        <div className="modal-title">
          Documents — Batch #{batch.batch_id} · {batch.item_name}
        </div>

        {loading ? (
          <div style={{ textAlign: "center", padding: 30 }}><div className="spinner" /></div>
        ) : docs.length === 0 ? (
          <div style={{ color: "var(--muted)", padding: "12px 0", fontSize: 14 }}>No documents yet.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
            {docs.map(d => (
              <div key={d.id} style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                background: "var(--bg-alt, #f8f9fa)", borderRadius: 8, padding: "10px 14px"
              }}>
                <a href={docHref(d.document_url)} target="_blank" rel="noreferrer"
                  style={{ fontWeight: 500, color: "var(--primary)", textDecoration: "none", fontSize: 14 }}>
                  {d.document_url?.startsWith("http") && !d.document_url?.includes("/uploads/")
                    ? "🔗"
                    : d.document_url?.toLowerCase().endsWith(".pdf") ? "📄" : "🖼"} {d.document_name}
                </a>
                {isAdmin && (
                  <button className="btn btn-danger btn-sm" onClick={() => handleDelete(d.id)}>Delete</button>
                )}
              </div>
            ))}
          </div>
        )}

        {isAdmin && (
          <div style={{ borderTop: "1px solid var(--border)", paddingTop: 16 }}>
            <div style={{ display: "flex", gap: 0, marginBottom: 16, borderRadius: 8, overflow: "hidden", border: "1px solid var(--border)" }}>
              {[["file", "📂 Upload File"], ["link", "🔗 Add Link"]].map(([key, label]) => (
                <button key={key} onClick={() => { setMode(key); setName(""); setFile(null); setLink(""); }}
                  style={{
                    flex: 1, padding: "8px 0", border: "none", cursor: "pointer", fontWeight: 600,
                    fontSize: 13, transition: "all 0.15s",
                    background: mode === key ? "var(--primary, #2563eb)" : "#f9fafb",
                    color: mode === key ? "#fff" : "var(--muted)"
                  }}>
                  {label}
                </button>
              ))}
            </div>

            {mode === "file" ? (
              <>
                <div
                  onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  style={{
                    border: `2px dashed ${dragging ? "#2563eb" : "var(--border, #d1d5db)"}`,
                    borderRadius: 10, padding: "24px 16px", textAlign: "center",
                    cursor: "pointer", background: dragging ? "#eff6ff" : "#fafafa",
                    transition: "all 0.15s", marginBottom: 12
                  }}
                >
                  <input ref={fileInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png"
                    style={{ display: "none" }} onChange={e => pickFile(e.target.files[0])} />
                  {file ? (
                    <div>
                      <div style={{ fontSize: 28, marginBottom: 6 }}>
                        {file.name.toLowerCase().endsWith(".pdf") ? "📄" : "🖼"}
                      </div>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{file.name}</div>
                      <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>
                        {(file.size / 1024).toFixed(1)} KB · click to change
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div style={{ fontSize: 32, marginBottom: 8 }}>📂</div>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>Drag & drop a file here</div>
                      <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>
                        or click to browse · PDF, JPG, PNG · max 10 MB
                      </div>
                    </div>
                  )}
                </div>
                <div className="form-group">
                  <label className="form-label">Document Name *</label>
                  <input className="form-input" placeholder="e.g. Invoice, Delivery Challan, COA"
                    value={name} onChange={e => setName(e.target.value)} />
                </div>
                <button className="btn btn-primary" onClick={handleUpload} disabled={uploading || !file}>
                  {uploading ? "Uploading…" : "Upload Document"}
                </button>
              </>
            ) : (
              <>
                <div className="form-group">
                  <label className="form-label">URL *</label>
                  <input className="form-input" type="url"
                    placeholder="https://example.com/invoice.pdf"
                    value={link} onChange={e => setLink(e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Document Name *</label>
                  <input className="form-input" placeholder="e.g. Invoice, COA, Delivery Challan"
                    value={name} onChange={e => setName(e.target.value)} />
                </div>
                <button className="btn btn-primary" onClick={handleAddLink}
                  disabled={uploading || !link.trim() || !name.trim()}>
                  {uploading ? "Saving…" : "Add Link"}
                </button>
              </>
            )}
          </div>
        )}

        <div style={{ marginTop: 16 }}>
          <button className="btn btn-ghost" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
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
function BatchFormModal({ initial, items, vendors, itemVendors, onSave, onClose, saving }) {
  const [form, setForm] = useState(() => initial ?? { ...EMPTY_BATCH_FORM });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const selectedItem = items.find(i => i.item_code === form.item_code);

  // Filter vendors based on selected item code
  const filteredVendors = useMemo(() => {
    if (!form.item_code) return [];
    const mapping = itemVendors.find(iv => iv.item_code === form.item_code);
    const mapped = mapping ? mapping.vendors : [];

    // If editing a batch, preserve the initial vendor option in the list
    if (initial && initial.vendor_code) {
      const exists = mapped.some(v => v.vendor_code === initial.vendor_code);
      if (!exists) {
        const fullVendor = vendors.find(v => v.vendor_code === initial.vendor_code);
        if (fullVendor) {
          return [...mapped, fullVendor];
        }
      }
    }
    return mapped;
  }, [form.item_code, itemVendors, initial, vendors]);

  // Effect to set unit and clear invalid vendor when item changes
  useEffect(() => {
    if (selectedItem && !initial) {
      set("unit", selectedItem.unit);

      // Check if current vendor is valid for the new item
      const mapping = itemVendors.find(iv => iv.item_code === form.item_code);
      const mappedVendors = mapping ? mapping.vendors : [];
      const isVendorValid = mappedVendors.some(v => v.vendor_code === form.vendor_code);
      if (!isVendorValid) {
        set("vendor_code", "");
      }
    }
  }, [form.item_code, selectedItem, initial, itemVendors]);

  // Filter items to show only active items (or the current item when editing)
  const activeItems = useMemo(() => {
    return items.filter(i => i.is_active !== 0 || i.item_code === form.item_code);
  }, [items, form.item_code]);

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
              {activeItems.map(i => (
                <option key={i.item_code} value={i.item_code}>
                  {i.item_code} — {i.name}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Vendor</label>
            <select className="form-select" value={form.vendor_code}
              onChange={e => set("vendor_code", e.target.value)}
              disabled={!form.item_code}>
              <option value="">
                {!form.item_code ? "Select an item first…" : "Select vendor…"}
              </option>
              {filteredVendors.map(v => (
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
            <label className="form-label">Expiry Date</label>
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
  const [itemVendors, setItemVendors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterItem, setFilterItem] = useState("");
  const [view, setView] = useState("batches"); // "batches" | "summary"

  const [showForm, setShowForm] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [issueTarget, setIssueTarget] = useState(null);
  const [docsTarget, setDocsTarget] = useState(null);
  const [batchDocs, setBatchDocs] = useState({});

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
    if (!batches.length) return;
    Promise.all(
      batches.map(b =>
        api.getBatchDocs(b.batch_id)
          .then(d => ({ id: b.batch_id, docs: d.data }))
          .catch(() => ({ id: b.batch_id, docs: [] }))
      )
    ).then(results => {
      setBatchDocs(prev => {
        const next = { ...prev };
        results.forEach(({ id, docs }) => { next[id] = docs; });
        return next;
      });
    });
  }, [batches]);

  useEffect(() => {
    api.getItems().then(d => setItems(d.data)).catch(() => { });
    api.getVendors().then(d => setVendors(d.data)).catch(() => { });
    api.getItemVendors().then(d => setItemVendors(d.data)).catch(() => { });
  }, []);

  const handleSave = async (form) => {
    if (!form.item_code || !form.qty_received || !form.unit) {
      toast("Item, quantity, and unit are required", "error");
      return;
    }
    setSaving(true);
    try {
      if (editTarget) {
        await api.updateStockBatch(editTarget.batch_id, {
          storage_location: form.storage_location,
          status: form.status,
          remarks: form.remarks,
          expiry_date: form.expiry_date,
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
    if (isNaN(date.getTime())) return null;
    const days = Math.ceil((date - new Date()) / (1000 * 60 * 60 * 24));
    if (days < 0) return <span style={{ background: "#fee2e2", color: "#991b1b", borderRadius: 4, padding: "2px 6px", fontSize: 11, marginLeft: 6 }}>Expired</span>;
    if (days <= 90) return <span style={{ background: "#fef3c7", color: "#92400e", borderRadius: 4, padding: "2px 6px", fontSize: 11, marginLeft: 6 }}>{days}d left</span>;
    return null;
  };

  const formatDateMMM_YY = (dateStr) => {
    if (!dateStr) return <span style={{ color: "var(--muted)" }}>NULL</span>;
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) {
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
                      <td style={{ whiteSpace: "normal" }}>
                        <div style={{ fontWeight: 500, lineHeight: "1.25", whiteSpace: "normal", wordBreak: "break-word" }}>
                          {row.item_name}
                        </div>
                      </td>
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
                    <th style={{ width: "7%" }}>Item</th>
                    <th style={{ width: "19%" }}>Item Name</th>
                    <th style={{ width: "8%" }}>Batch No</th>
                    <th style={{ width: "7%" }}>Vendor</th>
                    <th style={{ width: "7%" }}>Mfg Date</th>
                    <th style={{ width: "8%" }}>Expiry Date</th>
                    <th style={{ width: "5%", textAlign: "right" }}>Received</th>
                    <th style={{ width: "5%", textAlign: "right" }}>Issued</th>
                    <th style={{ width: "5%", textAlign: "right" }}>In Hand</th>
                    <th style={{ width: "6%" }}>Location</th>
                    <th style={{ width: "7%" }}>Status</th>
                    {isAdmin && <th style={{ width: "16%", minWidth: 165 }}>Actions</th>}
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
                        <td style={{ whiteSpace: "normal" }}>
                          <div style={{
                            fontWeight: 500,
                            lineHeight: "1.25",
                            whiteSpace: "normal",
                            wordBreak: "break-word"
                          }}>
                            {b.item_name}
                          </div>
                        </td>
                        {/* Batch No */}
                        <td style={{ color: "var(--muted)", fontFamily: "monospace", fontSize: 12 }}>
                          {b.supplier_batch_no || <span style={{ color: "var(--muted)" }}>NULL</span>}
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
                          <td style={{ minWidth: 165 }}>
                            <div className="flex" style={{ gap: 5 }}>
                              {b.status === "active" && inHand > 0 && (
                                <button className="btn btn-ghost btn-sm"
                                  onClick={() => setIssueTarget(b)}>
                                  Issue
                                </button>
                              )}
                              <button className="btn btn-ghost btn-sm" onClick={() => openEdit(b)}>
                                Edit
                              </button>
                              <button className="btn btn-ghost btn-sm" onClick={() => setDocsTarget(b)}>
                                📄 Docs
                              </button>
                              <button className="btn btn-danger btn-sm" onClick={() => handleDelete(b)}>
                                Delete
                              </button>
                            </div>
                            {batchDocs[b.batch_id]?.length > 0 && (
                              <div style={{ display: "flex", flexDirection: "column", gap: 3, marginTop: 6 }}>
                                {batchDocs[b.batch_id].map(doc => (
                                  <a key={doc.id} href={docHref(doc.document_url)} target="_blank" rel="noreferrer"
                                    style={{
                                      fontSize: 11, color: "var(--primary)", textDecoration: "none",
                                      display: "flex", alignItems: "center", gap: 3, overflow: "hidden"
                                    }}>
                                    <span style={{ flexShrink: 0 }}>
                                      {doc.document_url?.startsWith("http") && !doc.document_url?.includes("/uploads/")
                                        ? "🔗"
                                        : doc.document_url?.toLowerCase().endsWith(".pdf") ? "📄" : "🖼"}
                                    </span>
                                    <span style={{
                                      overflow: "hidden", textOverflow: "ellipsis",
                                      whiteSpace: "nowrap", maxWidth: 120
                                    }} title={doc.document_name}>
                                      {doc.document_name}
                                    </span>
                                  </a>
                                ))}
                              </div>
                            )}
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
          itemVendors={itemVendors}
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

      {docsTarget && (
        <BatchDocsModal
          batch={docsTarget}
          isAdmin={isAdmin}
          onClose={() => {
            const id = docsTarget.batch_id;
            setDocsTarget(null);
            api.getBatchDocs(id)
              .then(d => setBatchDocs(prev => ({ ...prev, [id]: d.data })))
              .catch(() => {});
          }}
          toast={toast}
        />
      )}
    </>
  );
}
