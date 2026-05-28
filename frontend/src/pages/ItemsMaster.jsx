import { useEffect, useState, useCallback, useMemo } from "react";
import { api } from "../api";
import { useAuth } from "../hooks/useAuth";
import { useToast } from "../components/Toast";

const UNITS = ["Piece", "Box", "Pack", "Strip", "Vial", "Bottle", "Roll", "Pair", "Set", "Kg", "Litre", "Metre"];

const EMPTY_FORM = {
  item_code: "", name: "", specification: "",
  category: "", category2: "", sub_category: "",
  product_category: "", material: "",
  is_reusable: false,
  unit: "", unit_cost: "", gst_percent: "",
  min_stock: ""
};

function ItemFormModal({ initial, nextCode, onSave, onClose, saving, categories, categories2 }) {
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

        {/* ── Row 2: Category grid ── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div className="form-group">
            <label className="form-label">Category *</label>
            <select className="form-select" value={form.category}
              onChange={e => set("category", e.target.value)}>
              <option value="">Select category</option>
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Category 2</label>
            <select className="form-select" value={form.category2}
              onChange={e => set("category2", e.target.value)}>
              <option value="">Select category 2</option>
              {categories2.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Sub Category</label>
            <input className="form-input" value={form.sub_category}
              onChange={e => set("sub_category", e.target.value)} placeholder="Optional" />
          </div>
          <div className="form-group">
            <label className="form-label">Product Category</label>
            <input className="form-input" value={form.product_category}
              onChange={e => set("product_category", e.target.value)} placeholder="Optional" />
          </div>
        </div>

        {/* ── Row 3: Material + Reusable ── */}
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12, alignItems: "end" }}>
          <div className="form-group">
            <label className="form-label">Material</label>
            <input className="form-input" value={form.material}
              onChange={e => set("material", e.target.value)} placeholder="e.g. Stainless Steel" />
          </div>
          <div className="form-group">
            <label className="form-label" style={{ marginBottom: 10 }}>Reusable?</label>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
              <input type="checkbox" checked={form.is_reusable}
                onChange={e => set("is_reusable", e.target.checked)}
                style={{ width: 16, height: 16, accentColor: "var(--accent)" }} />
              <span style={{ fontSize: 13, color: "var(--muted)" }}>Yes, reusable</span>
            </label>
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

        {/* ── Row 5: Stock levels ── */}
        <div className="form-group">
          <label className="form-label">Min Stock</label>
          <input className="form-input" type="number" min="0"
            value={form.min_stock}
            onChange={e => set("min_stock", e.target.value)} placeholder="0" />
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
  const [filterCat2, setFilterCat2] = useState("");
  const [page, setPage] = useState(1);
  const PER_PAGE = 15;

  const [showForm, setShowForm] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [saving, setSaving] = useState(false);
  const [nextItemCode, setNextItemCode] = useState("");

  // Derive distinct category & category2 values from all items (no filter applied)
  const categories = useMemo(() =>
    [...new Set(allItems.map(i => i.category).filter(Boolean))].sort(),
    [allItems]
  );
  const categories2 = useMemo(() =>
    [...new Set(allItems.map(i => i.category2).filter(Boolean))].sort(),
    [allItems]
  );

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set("q", search);
    if (filterCat) params.set("category", filterCat);
    if (filterCat2) params.set("category2", filterCat2);
    const isFiltered = search || filterCat || filterCat2;
    api.getItems(params.toString())
      .then(d => {
        setItems(d.data);
        setPage(1);
        if (!isFiltered) setAllItems(d.data);
      })
      .catch(e => toast(e.message, "error"))
      .finally(() => setLoading(false));
  }, [search, filterCat, filterCat2]);

  useEffect(() => { load(); }, [load]);

  const handleSave = async (form) => {
    if (!form.name.trim() || !form.category || !form.unit) {
      toast("Name, category, and unit are required", "error");
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
      load();
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
      load();
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

  // Pagination
  const totalPages = Math.max(1, Math.ceil(items.length / PER_PAGE));
  const pageItems = items.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  const categoryTag = (cat) => {
    if (!cat) return <span style={{ color: "var(--muted)" }}>—</span>;
    const upper = cat.toUpperCase();
    const cls = upper.includes("PHARMA") ? "tag-blue"
              : upper.includes("NON") ? "tag-green"
              : upper.includes("OPEN") ? "tag-amber"
              : "tag-gray";
    return <span className={`tag ${cls}`}>{cat}</span>;
  };

  return (
    <>
      {/* ── Page Header ── */}
      <div className="page-header">
        <div>
          <div className="page-title">Items Master</div>
          <div className="page-sub">{items.length} items in database</div>
        </div>
        {isAdmin && (
          <button className="btn btn-primary" onClick={openAdd}>
            + Add Item
          </button>
        )}
      </div>

      {/* ── Filters ── */}
      <div style={{
        display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap"
      }}>
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
          <option value="">All Categories</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        {/* <select
          className="form-select"
          style={{ maxWidth: 200 }}
          value={filterCat2}
          onChange={e => setFilterCat2(e.target.value)}
        >
          <option value="">All Category 2</option>
          {categories2.map(c => <option key={c} value={c}>{c}</option>)}
        </select> */}
        {(search || filterCat || filterCat2) && (
          <button className="btn btn-ghost btn-sm"
            onClick={() => { setSearch(""); setFilterCat(""); setFilterCat2(""); }}>
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
          <div className="table-wrap pkg-table-scroll">
            <table>
              <thead>
                <tr>
                  {/* <th>#</th> */}
                  <th>Item Code</th>
                  <th>Name</th>
                  <th>Specification</th>
                  <th>Category</th>
                  <th>Category 2</th>
                  <th>Sub Category</th>
                  <th>Product Category</th>
                  <th>Material</th>
                  <th>Unit</th>
                  <th>Unit Cost</th>
                  <th>GST %</th>
                  <th>Min Stock</th>
                  <th>Reusable</th>
                  {isAdmin && <th>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {pageItems.map((item, idx) => (
                  <tr key={item.item_code}>
                    {/* <td style={{ color: "var(--muted)", fontSize: 12 }}>
                      {(page - 1) * PER_PAGE + idx + 1}
                    </td> */}
                    <td>
                      <span style={{ fontFamily: "monospace", fontWeight: 600, fontSize: 12,
                        background: "var(--border)", padding: "2px 6px", borderRadius: 4 }}>
                        {item.item_code}
                      </span>
                    </td>
                    <td style={{ maxWidth: 200 }}>
                      <div style={{ fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis",
                        whiteSpace: "nowrap", maxWidth: 200 }} title={item.name}>
                        {item.name}
                      </div>
                    </td>
                    <td style={{ maxWidth: 180 }}>
                      {item.specification
                        ? <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis",
                            whiteSpace: "nowrap", maxWidth: 180, fontSize: 12, color: "var(--muted)" }}
                            title={item.specification}>
                            {item.specification}
                          </span>
                        : <span style={{ color: "var(--muted)" }}>—</span>}
                    </td>
                    <td>{categoryTag(item.category)}</td>
                    <td style={{ maxWidth: 140 }}>
                      {item.category2
                        ? <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis",
                            whiteSpace: "nowrap", maxWidth: 140, fontSize: 12 }}
                            title={item.category2}>
                            {item.category2}
                          </span>
                        : <span style={{ color: "var(--muted)" }}>—</span>}
                    </td>
                    <td style={{ maxWidth: 140 }}>
                      {item.sub_category
                        ? <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis",
                            whiteSpace: "nowrap", maxWidth: 140, fontSize: 12 }}
                            title={item.sub_category}>
                            {item.sub_category}
                          </span>
                        : <span style={{ color: "var(--muted)" }}>—</span>}
                    </td>
                    <td style={{ maxWidth: 140 }}>
                      {item.product_category
                        ? <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis",
                            whiteSpace: "nowrap", maxWidth: 140, fontSize: 12 }}
                            title={item.product_category}>
                            {item.product_category}
                          </span>
                        : <span style={{ color: "var(--muted)" }}>—</span>}
                    </td>
                    <td style={{ maxWidth: 130 }}>
                      {item.material
                        ? <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis",
                            whiteSpace: "nowrap", maxWidth: 130, fontSize: 12 }}
                            title={item.material}>
                            {item.material}
                          </span>
                        : <span style={{ color: "var(--muted)" }}>—</span>}
                    </td>
                    <td style={{ color: "var(--muted)" }}>{item.unit}</td>
                    <td>
                      {item.unit_cost > 0
                        ? <span>₹{Number(item.unit_cost).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
                        : <span style={{ color: "var(--muted)" }}>—</span>
                      }
                    </td>
                    <td style={{ color: "var(--muted)" }}>
                      {item.gst_percent > 0 ? `${item.gst_percent}%` : "—"}
                    </td>
                    <td style={{ color: "var(--muted)" }}>{item.min_stock ?? "—"}</td>
                    <td>
                      <span className={`tag ${item.is_reusable ? "tag-green" : "tag-gray"}`}>
                        {item.is_reusable ? "Yes" : "No"}
                      </span>
                    </td>
                    {isAdmin && (
                      <td>
                        <div className="flex gap-2">
                          <button className="btn btn-ghost btn-sm" onClick={() => openEdit(item)}>
                            Edit
                          </button>
                          <button className="btn btn-danger btn-sm" onClick={() => handleDelete(item)}>
                            Delete
                          </button>
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

      {/* ── Add / Edit Modal ── */}
      {showForm && (
        <ItemFormModal
          nextCode={nextItemCode}
          initial={editTarget ? {
            item_code: editTarget.item_code || "",
            name: editTarget.name || "",
            specification: editTarget.specification || "",
            category: editTarget.category || "",
            category2: editTarget.category2 || "",
            sub_category: editTarget.sub_category || "",
            product_category: editTarget.product_category || "",
            material: editTarget.material || "",
            is_reusable: editTarget.is_reusable || false,
            unit: editTarget.unit || "",
            unit_cost: editTarget.unit_cost ?? "",
            gst_percent: editTarget.gst_percent ?? "",
            min_stock: editTarget.min_stock ?? ""
          } : null}
          onSave={handleSave}
          onClose={() => { setShowForm(false); setEditTarget(null); }}
          saving={saving}
          categories={categories}
          categories2={categories2}
        />
      )}
    </>
  );
}
