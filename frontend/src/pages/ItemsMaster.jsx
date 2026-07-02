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

function DocsModal({ item, isAdmin, onClose, toast }) {
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
    api.getDocs(item.item_code)
      .then(d => setDocs(d.data))
      .catch(e => toast(e.message, "error"))
      .finally(() => setLoading(false));
  }, [item.item_code]);

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
      fd.append("item_code", item.item_code);
      fd.append("document_name", name.trim());
      await api.uploadDoc(fd);
      const d = await api.getDocs(item.item_code);
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
      await api.addDoc({ item_code: item.item_code, document_name: name.trim(), document_url: link.trim() });
      const d = await api.getDocs(item.item_code);
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
      await api.deleteDoc(id);
      setDocs(d => d.filter(x => x.id !== id));
      toast("Document deleted");
    } catch (e) { toast(e.message, "error"); }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 520, width: "95%", maxHeight: "90vh", overflowY: "auto" }}
        onClick={e => e.stopPropagation()}>
        <div className="modal-title">
          Documents — {item.item_code} · {item.name}
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
                  <input className="form-input" placeholder="e.g. GST Certificate, Quality Report"
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
                    placeholder="https://example.com/document.pdf"
                    value={link} onChange={e => setLink(e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Document Name *</label>
                  <input className="form-input" placeholder="e.g. ISO Certificate"
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

const EMPTY_FORM = {
  item_code: "", name: "", specification: "",
  category: "", product_category: "", material: "", brand: "",
  unit: "", unit_cost: "", gst_percent: "", min_stock: "",
  is_active: true
};

function ItemFormModal({ initial, nextCode, onSave, onClose, saving, categories }) {
  const [form, setForm] = useState(() => {
    if (initial) return initial;
    return { ...EMPTY_FORM, item_code: nextCode || "" };
  });

  useEffect(() => {
    if (!initial && nextCode) setForm(f => ({ ...f, item_code: nextCode }));
  }, [nextCode, initial]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal"
        style={{ maxWidth: 680, width: "95%", maxHeight: "90vh", overflowY: "auto" }}
        onClick={e => e.stopPropagation()}
      >
        <div className="modal-title">
          {initial ? "Edit Item" : "Add New Item"}
        </div>

        {/* ── Row 1: Code + Name ── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 12 }}>
          <div className="form-group">
            <label className="form-label">Item Code</label>
            <input
              className="form-input"
              value={form.item_code}
              readOnly
              style={{ background: "var(--border)", cursor: "default", color: "var(--muted)", fontFamily: "monospace" }}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Name *</label>
            <input className="form-input" value={form.name}
              onChange={e => set("name", e.target.value)} placeholder="Full item name" />
          </div>
        </div>

        {/* ── Specification ── */}
        <div className="form-group">
          <label className="form-label">Specification</label>
          <textarea className="form-input" rows={2} value={form.specification}
            onChange={e => set("specification", e.target.value)}
            placeholder="Technical specification or description"
            style={{ resize: "vertical" }} />
        </div>

        {/* ── Row 2: Industry Type + Product Category ── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div className="form-group">
            <label className="form-label">Industry Type *</label>
            <select className="form-select" value={form.category}
              onChange={e => set("category", e.target.value)}>
              <option value="">Select industry type</option>
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Product Category</label>
            <input className="form-input" value={form.product_category}
              onChange={e => set("product_category", e.target.value)} placeholder="Optional" />
          </div>
        </div>

        {/* ── Row 3: Material + Brand ── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div className="form-group">
            <label className="form-label">Material</label>
            <input className="form-input" value={form.material}
              onChange={e => set("material", e.target.value)} placeholder="e.g. Stainless Steel" />
          </div>
          <div className="form-group">
            <label className="form-label">Brand (Special Kit)</label>
            <input className="form-input" value={form.brand}
              onChange={e => set("brand", e.target.value)} placeholder="Optional" />
          </div>
        </div>

        {/* ── Row 4: Unit + Cost + GST ── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
          <div className="form-group">
            <label className="form-label">Unit *</label>
            <select className="form-select" value={form.unit}
              onChange={e => set("unit", e.target.value)}>
              <option value="">Select unit</option>
              {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Unit Cost (₹)</label>
            <input className="form-input" type="number" min="0" step="0.01"
              value={form.unit_cost}
              onChange={e => set("unit_cost", e.target.value)} placeholder="0.00" />
          </div>
          <div className="form-group">
            <label className="form-label">GST %</label>
            <input className="form-input" type="number" min="0" max="100" step="0.01"
              value={form.gst_percent}
              onChange={e => set("gst_percent", e.target.value)} placeholder="0" />
          </div>
        </div>

        {/* ── Row 5: Min Stock ── */}
        <div className="form-group">
          <label className="form-label">Min Stock</label>
          <input className="form-input" type="number" min="0"
            value={form.min_stock}
            onChange={e => set("min_stock", e.target.value)} placeholder="0" />
        </div>

        {/* ── Active / Inactive ── */}
        <div className="form-group" style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 4 }}>
          <label style={{
            position: "relative", display: "inline-block", width: 44, height: 24, cursor: "pointer"
          }}>
            <input
              type="checkbox"
              checked={!!form.is_active}
              onChange={e => set("is_active", e.target.checked)}
              style={{ opacity: 0, width: 0, height: 0 }}
            />
            <span style={{
              position: "absolute", inset: 0, borderRadius: 12,
              background: form.is_active ? "#22c55e" : "#94a3b8",
              transition: "background .2s"
            }} />
            <span style={{
              position: "absolute", top: 3, left: form.is_active ? 23 : 3,
              width: 18, height: 18, borderRadius: "50%", background: "#fff",
              transition: "left .2s", boxShadow: "0 1px 3px rgba(0,0,0,.2)"
            }} />
          </label>
          <span className="form-label" style={{ margin: 0 }}>
            {form.is_active ? "Active" : "Inactive"}
          </span>
        </div>

        {/* ── Actions ── */}
        <div className="flex gap-2" style={{ marginTop: 4 }}>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary ml-auto" onClick={() => onSave(form)} disabled={saving}>
            {saving ? "Saving…" : initial ? "Save Changes" : "Add Item"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ItemsMaster() {
  const { user } = useAuth();
  const { toast } = useToast();
  const isAdmin = ["admin", "superadmin"].includes(user?.role);

  const [items, setItems] = useState([]);
  const [allItems, setAllItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState("");
  const [page, setPage] = useState(1);
  const PER_PAGE = 15;

  const [showForm, setShowForm] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [saving, setSaving] = useState(false);
  const [nextItemCode, setNextItemCode] = useState("");
  const [docsTarget, setDocsTarget] = useState(null);
  const [itemDocs, setItemDocs] = useState({});

  const categories = useMemo(() =>
    [...new Set(allItems.map(i => i.category).filter(Boolean))].sort(),
    [allItems]
  );

  const load = useCallback((silent = false) => {
    if (!silent) setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set("q", search);
    if (filterCat) params.set("category", filterCat);
    const isFiltered = search || filterCat;
    api.getItems(params.toString())
      .then(d => {
        setItems(d.data);
        if (!silent) setPage(1);
        if (!isFiltered) setAllItems(d.data);
      })
      .catch(e => toast(e.message, "error"))
      .finally(() => { if (!silent) setLoading(false); });
  }, [search, filterCat]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const start = (page - 1) * PER_PAGE;
    const current = items.slice(start, start + PER_PAGE);
    if (!current.length) return;
    Promise.all(
      current.map(item =>
        api.getDocs(item.item_code)
          .then(d => ({ code: item.item_code, docs: d.data }))
          .catch(() => ({ code: item.item_code, docs: [] }))
      )
    ).then(results => {
      setItemDocs(prev => {
        const next = { ...prev };
        results.forEach(({ code, docs }) => { next[code] = docs; });
        return next;
      });
    });
  }, [page, items]);

  const handleSave = async (form) => {
    if (!form.name.trim() || !form.category || !form.unit) {
      toast("Name, industry type, and unit are required", "error");
      return;
    }
    setSaving(true);
    try {
      if (editTarget) {
        await api.updateItem(editTarget.item_code, form);
        toast("Item updated");
      } else {
        await api.createItem(form);
        toast("Item added");
      }
      setShowForm(false);
      setEditTarget(null);
      load(true);
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (item) => {
    if (!confirm(`Delete "${item.name}"? This cannot be undone.`)) return;
    try {
      const res = await api.deleteItem(item.item_code);
      toast(res.msg);
      load(true);
    } catch (e) {
      toast(e.message, "error");
    }
  };

  const openEdit = (item) => {
    setEditTarget(item);
    setShowForm(true);
  };

  const openAdd = async () => {
    setEditTarget(null);
    try {
      const d = await api.getNextItemCode();
      setNextItemCode(d.next_code);
    } catch {
      setNextItemCode("");
    }
    setShowForm(true);
  };

  const totalPages = Math.max(1, Math.ceil(items.length / PER_PAGE));
  const pageItems = items.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  const categoryTag = (cat) => {
    if (!cat) return <span style={{ color: "var(--muted)" }}>NULL</span>;
    const upper = cat.toUpperCase();
    const cls = upper.includes("PHARMA") ? "tag-blue"
              : upper.includes("NON") ? "tag-green"
              : upper.includes("OPEN") ? "tag-amber"
              : "tag-gray";
    return <span className={`tag ${cls}`}>{cat}</span>;
  };

  const truncCell = (val, maxWidth = 160) =>
    val
      ? <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis",
          whiteSpace: "nowrap", maxWidth, fontSize: 12, color: "var(--muted)" }}
          title={val}>{val}</span>
      : <span style={{ color: "var(--muted)" }}>NULL</span>;

  return (
    <>
      {/* ── Page Header ── */}
      <div className="page-header">
        <div>
          <div className="page-title">Items Master</div>
          <div className="page-sub">{items.length} items in database</div>
        </div>
        {isAdmin && (
          <button className="btn btn-primary" onClick={openAdd}>+ Add Item</button>
        )}
      </div>

      {/* ── Filters ── */}
      <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        <input
          className="form-input"
          style={{ maxWidth: 300 }}
          placeholder="Search by name or code…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select
          className="form-select"
          style={{ maxWidth: 200 }}
          value={filterCat}
          onChange={e => setFilterCat(e.target.value)}
        >
          <option value="">All Industry Types</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        {(search || filterCat) && (
          <button className="btn btn-ghost btn-sm"
            onClick={() => { setSearch(""); setFilterCat(""); }}>
            Clear
          </button>
        )}
      </div>

      {/* ── Table ── */}
      {loading ? (
        <div style={{ textAlign: "center", padding: 60 }}><div className="spinner" /></div>
      ) : items.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">🗂</div>
          <div>No items found</div>
          {isAdmin && (
            <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={openAdd}>
              + Add First Item
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="table-wrap" style={{ overflowX: "hidden" }}>
            <table className="items-master-table">
              <thead>
                <tr>
                  <th style={{ width: "7%" }}>Item Code</th>
                  <th style={{ width: "12%" }}>Name</th>
                  <th style={{ width: "9%" }}>Specification</th>
                  <th style={{ width: "8%" }}>Industry Type</th>
                  <th style={{ width: "8%" }}>Product Category</th>
                  <th style={{ width: "7%" }}>Material</th>
                  <th style={{ width: "8%" }}>Brand</th>
                  <th style={{ width: "5%" }}>Unit</th>
                  <th style={{ width: "7%" }}>Unit Cost</th>
                  <th style={{ width: "5%" }}>GST %</th>
                  <th style={{ width: "6%" }}>Min Stock</th>
                  <th style={{ width: "6%" }}>Status</th>
                  {isAdmin && <th style={{ width: "10%" }}>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {pageItems.map((item) => (
                  <tr key={item.item_code}>
                    <td>
                      <span style={{ fontFamily: "monospace", fontWeight: 600, fontSize: 12,
                        background: "var(--border)", padding: "2px 6px", borderRadius: 4 }}>
                        {item.item_code}
                      </span>
                    </td>
                    <td style={{ whiteSpace: "normal" }}>
                      <div style={{
                        fontWeight: 500,
                        lineHeight: "1.25",
                        whiteSpace: "normal",
                        wordBreak: "break-word"
                      }}>
                        {item.name}
                      </div>
                    </td>
                    <td style={{ whiteSpace: "normal" }}>
                      <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: "1.25", whiteSpace: "normal", wordBreak: "break-word" }}>
                        {item.specification || <span style={{ color: "var(--muted)" }}>NULL</span>}
                      </div>
                    </td>
                    <td>{categoryTag(item.category)}</td>
                    <td>{truncCell(item.product_category, 140)}</td>
                    <td>{truncCell(item.material, 130)}</td>
                    <td>{truncCell(item.brand, 140)}</td>
                    <td style={{ color: "var(--muted)" }}>{item.unit}</td>
                    <td>
                      {item.unit_cost > 0
                        ? <span>₹{Number(item.unit_cost).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
                        : <span style={{ color: "var(--muted)" }}>—</span>}
                    </td>
                    <td style={{ color: "var(--muted)" }}>
                      {item.gst_percent > 0 ? `${item.gst_percent}%` : "—"}
                    </td>
                    <td style={{ color: "var(--muted)" }}>{item.min_stock ?? "—"}</td>
                    <td>
                      <span className={`tag ${item.is_active ? "tag-green" : "tag-gray"}`}
                        style={!item.is_active ? { opacity: 0.7 } : {}}>
                        {item.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    {isAdmin && (
                      <td>
                        <div className="flex gap-2">
                          <button className="btn btn-ghost btn-sm" onClick={() => openEdit(item)}>Edit</button>
                          <button className="btn btn-ghost btn-sm" onClick={() => setDocsTarget(item)}>📄 Docs</button>
                          <button className="btn btn-danger btn-sm" onClick={() => handleDelete(item)}>Delete</button>
                        </div>
                        {itemDocs[item.item_code]?.length > 0 && (
                          <div style={{ display: "flex", flexDirection: "column", gap: 3, marginTop: 6 }}>
                            {itemDocs[item.item_code].map(doc => (
                              <a key={doc.id} href={docHref(doc.document_url)} target="_blank" rel="noreferrer"
                                style={{
                                  fontSize: 11, color: "var(--primary)", textDecoration: "none",
                                  display: "flex", alignItems: "center", gap: 3,
                                  overflow: "hidden"
                                }}>
                                <span style={{ flexShrink: 0 }}>
                                  {doc.document_url?.startsWith("http") && !doc.document_url?.includes("/uploads/")
                                    ? "🔗"
                                    : doc.document_url?.toLowerCase().endsWith(".pdf") ? "📄" : "🖼"}
                                </span>
                                <span style={{
                                  overflow: "hidden", textOverflow: "ellipsis",
                                  whiteSpace: "nowrap", maxWidth: 130
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
                ))}
              </tbody>
            </table>
          </div>

          {/* ── Pagination ── */}
          {totalPages > 1 && (
            <div className="pagination-bar">
              <span className="pagination-info">
                {(page - 1) * PER_PAGE + 1}–{Math.min(page * PER_PAGE, items.length)} of {items.length}
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

      {/* ── Documents Modal ── */}
      {docsTarget && (
        <DocsModal
          item={docsTarget}
          isAdmin={isAdmin}
          onClose={() => {
            const code = docsTarget.item_code;
            setDocsTarget(null);
            api.getDocs(code)
              .then(d => setItemDocs(prev => ({ ...prev, [code]: d.data })))
              .catch(() => {});
          }}
          toast={toast}
        />
      )}

      {/* ── Add / Edit Modal ── */}
      {showForm && (
        <ItemFormModal
          nextCode={nextItemCode}
          initial={editTarget ? {
            item_code:        editTarget.item_code        || "",
            name:             editTarget.name             || "",
            specification:    editTarget.specification    || "",
            category:         editTarget.category         || "",
            product_category: editTarget.product_category || "",
            material:         editTarget.material         || "",
            brand:            editTarget.brand            || "",
            unit:             editTarget.unit             || "",
            unit_cost:        editTarget.unit_cost        ?? "",
            gst_percent:      editTarget.gst_percent      ?? "",
            min_stock:        editTarget.min_stock        ?? "",
            is_active:        !!editTarget.is_active
          } : null}
          onSave={handleSave}
          onClose={() => { setShowForm(false); setEditTarget(null); }}
          saving={saving}
          categories={categories}
        />
      )}
    </>
  );
}
