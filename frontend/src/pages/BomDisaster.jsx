import { useEffect, useState, useCallback } from "react";
import { api } from "../api";
import { useAuth } from "../hooks/useAuth";
import { useToast } from "../components/Toast";

const EMPTY_FORM = { item_code: "", item_name: "", required_qty: "" };

function BomFormModal({ initial, onSave, onClose, saving }) {
  const [form, setForm] = useState(initial || EMPTY_FORM);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal"
        style={{ maxWidth: 480, width: "95%" }}
        onClick={e => e.stopPropagation()}
      >
        <div className="modal-title">{initial ? "Edit BOM Entry" : "Add BOM Entry"}</div>

        <div className="form-group">
          <label className="form-label">Item Code *</label>
          <input className="form-input" value={form.item_code}
            onChange={e => set("item_code", e.target.value)}
            placeholder="e.g. GGIPL - 1"
            disabled={!!initial} />
        </div>

        <div className="form-group">
          <label className="form-label">Item Name *</label>
          <input className="form-input" value={form.item_name}
            onChange={e => set("item_name", e.target.value)}
            placeholder="Item description" />
        </div>

        <div className="form-group">
          <label className="form-label">Required Quantity *</label>
          <input className="form-input" type="number" min="0" value={form.required_qty}
            onChange={e => set("required_qty", e.target.value)}
            placeholder="0" />
        </div>

        <div className="flex gap-2" style={{ marginTop: 4 }}>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary ml-auto" onClick={() => onSave(form)} disabled={saving}>
            {saving ? "Saving…" : initial ? "Save Changes" : "Add Entry"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function BomDisaster() {
  const { user } = useAuth();
  const { toast } = useToast();
  const isAdmin = ["admin", "superadmin"].includes(user?.role);

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const PER_PAGE = 20;

  const [showForm, setShowForm] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    const params = search ? `q=${encodeURIComponent(search)}` : "";
    api.getBom(params)
      .then(d => { setRows(d.data); setPage(1); })
      .catch(e => toast(e.message, "error"))
      .finally(() => setLoading(false));
  }, [search]);

  useEffect(() => { load(); }, [load]);

  const handleSave = async (form) => {
    if (!form.item_code.trim() || !form.item_name.trim()) {
      toast("Item code and item name are required", "error"); return;
    }
    setSaving(true);
    try {
      if (editTarget) {
        await api.updateBom(editTarget.item_code, form);
        toast("BOM entry updated");
      } else {
        await api.createBom(form);
        toast("BOM entry added");
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
    if (!confirm(`Delete BOM entry "${row.item_code}"? This cannot be undone.`)) return;
    try {
      const res = await api.deleteBom(row.item_code);
      toast(res.msg);
      load();
    } catch (e) {
      toast(e.message, "error");
    }
  };

  const openEdit = (row) => { setEditTarget(row); setShowForm(true); };
  const openAdd  = ()    => { setEditTarget(null); setShowForm(true); };

  const totalPages = Math.max(1, Math.ceil(rows.length / PER_PAGE));
  const pageRows   = rows.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-title">BOM — Disaster Kit</div>
          <div className="page-sub">{rows.length} item{rows.length !== 1 ? "s" : ""} in Bill of Material</div>
        </div>
        {isAdmin && (
          <button className="btn btn-primary" onClick={openAdd}>+ Add Entry</button>
        )}
      </div>

      <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        <input
          className="form-input"
          style={{ maxWidth: 360 }}
          placeholder="Search by item code or name…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        {search && (
          <button className="btn btn-ghost btn-sm" onClick={() => setSearch("")}>Clear</button>
        )}
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 60 }}><div className="spinner" /></div>
      ) : rows.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📋</div>
          <div>No BOM entries found</div>
          {isAdmin && (
            <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={openAdd}>
              + Add First Entry
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="table-wrap pkg-table-scroll">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Item Code</th>
                  <th>Required Quantity</th>
                  {isAdmin && <th>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {pageRows.map((row, idx) => (
                  <tr key={row.item_code}>
                    <td style={{ color: "var(--muted)", fontSize: 12 }}>
                      {(page - 1) * PER_PAGE + idx + 1}
                    </td>
                    <td>
                      <span style={{ fontFamily: "monospace", fontWeight: 600, fontSize: 12,
                        background: "var(--border)", padding: "2px 6px", borderRadius: 4 }}>
                        {row.item_code}
                      </span>
                    </td>
                    <td style={{ fontWeight: 600 }}>
                      {Number(row.required_qty).toLocaleString("en-IN")}
                    </td>
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

          {totalPages > 1 && (
            <div className="pagination-bar">
              <span className="pagination-info">
                {(page - 1) * PER_PAGE + 1}–{Math.min(page * PER_PAGE, rows.length)} of {rows.length}
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

      {showForm && (
        <BomFormModal
          initial={editTarget ? {
            item_code:    editTarget.item_code,
            item_name:    editTarget.item_name,
            required_qty: editTarget.required_qty ?? ""
          } : null}
          onSave={handleSave}
          onClose={() => { setShowForm(false); setEditTarget(null); }}
          saving={saving}
        />
      )}
    </>
  );
}
