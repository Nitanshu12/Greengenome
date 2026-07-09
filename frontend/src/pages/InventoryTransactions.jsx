import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../hooks/useAuth";
import { useToast } from "../components/Toast";

const EMPTY_ROW = {
  cube_no: "", box_no: "", item_name: "", brand: "", oem: "", item_type: "",
  batch_no: "", expiry_date: "", document_name: "", document_url: "",
};

function StatusBadge({ status }) {
  const map = {
    draft:     { label: "Draft",     color: "#b45309", bg: "#fef9c3" },
    finalized: { label: "Finalized", color: "#16a34a", bg: "#dcfce7" },
    cancelled: { label: "Cancelled", color: "#dc2626", bg: "#fee2e2" },
  };
  const s = map[status] || map.draft;
  return (
    <span style={{
      display: "inline-block", padding: "3px 10px", borderRadius: 20,
      fontSize: 11, fontWeight: 700, letterSpacing: 0.3,
      color: s.color, background: s.bg, border: `1px solid ${s.color}33`,
    }}>
      {s.label}
    </span>
  );
}

function RowModal({ isEdit, initial, onSave, onClose, saving }) {
  const [form, setForm] = useState(initial || EMPTY_ROW);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 560, width: "95%" }} onClick={e => e.stopPropagation()}>
        <div className="modal-title">{isEdit ? "Edit Row" : "Add Row"}</div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div className="form-group">
            <label className="form-label">Cube</label>
            <input className="form-input" value={form.cube_no} onChange={e => set("cube_no", e.target.value)} placeholder="1" />
          </div>
          <div className="form-group">
            <label className="form-label">Box</label>
            <input className="form-input" value={form.box_no} onChange={e => set("box_no", e.target.value)} placeholder="1" />
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">Item Name *</label>
          <input className="form-input" value={form.item_name} onChange={e => set("item_name", e.target.value)} placeholder="Item name" />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div className="form-group">
            <label className="form-label">Brand</label>
            <input className="form-input" value={form.brand} onChange={e => set("brand", e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">OEM</label>
            <input className="form-input" value={form.oem} onChange={e => set("oem", e.target.value)} />
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div className="form-group">
            <label className="form-label">Type</label>
            <input className="form-input" value={form.item_type} onChange={e => set("item_type", e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Batch No</label>
            <input className="form-input" value={form.batch_no} onChange={e => set("batch_no", e.target.value)} />
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">Expiry Date</label>
          <input className="form-input" type="date" value={form.expiry_date || ""} onChange={e => set("expiry_date", e.target.value)} />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div className="form-group">
            <label className="form-label">Document Name</label>
            <input className="form-input" value={form.document_name} onChange={e => set("document_name", e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Document Link</label>
            <input className="form-input" value={form.document_url} onChange={e => set("document_url", e.target.value)} placeholder="https://…" />
          </div>
        </div>

        <div className="flex gap-2" style={{ marginTop: 4 }}>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary ml-auto" onClick={() => onSave(form)} disabled={saving}>
            {saving ? "Saving…" : isEdit ? "Save Changes" : "Add Row"}
          </button>
        </div>
      </div>
    </div>
  );
}

function TransactionCard({ txn, isOpen, detail, onToggle, onReload, isAdmin, toast }) {
  const [showForm, setShowForm] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [saving, setSaving] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const navigate = useNavigate();

  const items = detail?.items || [];
  const isDraft = txn.status === "draft";

  const handleSave = async (form) => {
    if (!form.item_name || !form.item_name.trim()) { toast("Item name is required", "error"); return; }
    setSaving(true);
    try {
      if (editTarget) {
        await api.updateInventoryTxnItem(txn.id, editTarget.id, form);
        toast("Row updated");
      } else {
        await api.addInventoryTxnItem(txn.id, form);
        toast("Row added");
      }
      setShowForm(false);
      setEditTarget(null);
      onReload();
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (item) => {
    if (!confirm(`Remove "${item.item_name}" from this transaction?`)) return;
    try {
      await api.deleteInventoryTxnItem(txn.id, item.id);
      toast("Row deleted");
      onReload();
    } catch (e) {
      toast(e.message, "error");
    }
  };

  const handleFinalize = async () => {
    if (!confirm(
      `Generate the final report and push "${txn.kit_name}" (${items.length} rows) straight into Kits Information?\n\nThis cannot be undone — the draft will be locked after this.`
    )) return;
    setFinalizing(true);
    try {
      const res = await api.finalizeInventoryTxn(txn.id);
      toast(res.msg);
      onReload();
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setFinalizing(false);
    }
  };

  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
      <button
        onClick={onToggle}
        style={{
          width: "100%", display: "flex", alignItems: "center", gap: 10,
          padding: "12px 16px", background: "var(--primary, #077B4D)", color: "#fff",
          border: "none", cursor: "pointer", textAlign: "left",
        }}
      >
        <span style={{ fontWeight: 700, fontSize: 14 }}>Kit #{txn.kit_id} — {txn.kit_name}</span>
        <span style={{ fontSize: 12, opacity: 0.85 }}>Qty {txn.qty_kits}</span>
        <span style={{ marginLeft: "auto" }}><StatusBadge status={txn.status} /></span>
        <span style={{ fontSize: 12, opacity: 0.85 }}>
          {txn.row_count} row{txn.row_count !== 1 ? "s" : ""}
          {txn.flagged_count > 0 && <span style={{ color: "#fecaca", fontWeight: 700 }}> · ⚠ {txn.flagged_count} flagged</span>}
        </span>
        <span style={{ transform: isOpen ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>▾</span>
      </button>

      {isOpen && (
        <div style={{ padding: 12, background: "var(--bg-alt, #f8f9fa)" }}>
          {!detail ? (
            <div style={{ textAlign: "center", padding: 24 }}><div className="spinner" /></div>
          ) : (
            <>
              <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 12, color: "var(--muted)", marginBottom: 10 }}>
                <span>Generated by <strong style={{ color: "var(--text)" }}>{txn.generated_by || "—"}</strong></span>
                <span>{txn.created_at ? new Date(txn.created_at).toLocaleString("en-IN") : "—"}</span>
                {txn.status === "finalized" && (
                  <span style={{ color: "#16a34a", fontWeight: 600 }}>
                    ✓ Pushed to Kits Information{txn.finalized_at ? ` on ${new Date(txn.finalized_at).toLocaleDateString("en-IN")}` : ""} —{" "}
                    <span style={{ textDecoration: "underline", cursor: "pointer" }} onClick={() => navigate("/packages")}>View in Kits Information</span>
                  </span>
                )}
              </div>

              <div className="table-wrap" style={{ margin: 0, overflowX: "hidden" }}>
                <table className="txn-items-table">
                  <colgroup>
                    <col style={{ width: "4%" }} />
                    <col style={{ width: "4%" }} />
                    <col style={{ width: isAdmin && isDraft ? "26%" : "30%" }} />
                    <col style={{ width: "11%" }} />
                    <col style={{ width: "9%" }} />
                    <col style={{ width: "9%" }} />
                    <col style={{ width: "9%" }} />
                    <col style={{ width: "8%" }} />
                    <col style={{ width: isAdmin && isDraft ? "10%" : "16%" }} />
                    {isAdmin && isDraft && <col style={{ width: "10%" }} />}
                  </colgroup>
                  <thead>
                    <tr>
                      <th>Cube</th><th>Box</th><th>Item</th><th>Brand</th><th>OEM</th><th>Type</th>
                      <th>Batch No</th><th>Expiry</th><th>Document</th>
                      {isAdmin && isDraft && <th>Actions</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {items.length === 0 ? (
                      <tr><td colSpan={isAdmin && isDraft ? 10 : 9} style={{ textAlign: "center", color: "var(--muted)", padding: 20 }}>No rows</td></tr>
                    ) : items.map(it => (
                      <tr key={it.id} style={it.is_flagged ? { background: "#fef2f2" } : undefined}>
                        <td>{it.cube_no || "—"}</td>
                        <td>{it.box_no || "—"}</td>
                        <td style={{ fontWeight: 500 }}>
                          {!!it.is_flagged && <span title="Allocation incomplete — check batch/expiry" style={{ marginRight: 6 }}>⚠</span>}
                          {it.item_name || "—"}
                        </td>
                        <td>{it.brand || "—"}</td>
                        <td>{it.oem || "—"}</td>
                        <td>{it.item_type || "—"}</td>
                        <td style={{ fontFamily: "monospace", fontSize: 11 }}>{it.batch_no || "—"}</td>
                        <td>{it.expiry_date ? new Date(it.expiry_date).toLocaleDateString("en-IN") : "—"}</td>
                        <td>
                          {it.document_url
                            ? <a href={it.document_url} target="_blank" rel="noreferrer">{it.document_name || "Link"}</a>
                            : (it.document_name || "—")}
                        </td>
                        {isAdmin && isDraft && (
                          <td>
                            <div className="flex gap-2" style={{ flexWrap: "wrap" }}>
                              <button className="btn btn-ghost btn-sm" onClick={() => { setEditTarget(it); setShowForm(true); }}>Edit</button>
                              <button className="btn btn-danger btn-sm" onClick={() => handleDelete(it)}>Delete</button>
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {isAdmin && isDraft && (
                <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => { setEditTarget(null); setShowForm(true); }}>+ Add Row</button>
                  <button className="btn btn-primary" style={{ marginLeft: "auto" }} onClick={handleFinalize} disabled={finalizing}>
                    {finalizing ? "Generating…" : "Generate Report → Push to Kits Information"}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {showForm && (
        <RowModal
          isEdit={!!editTarget}
          initial={editTarget ? {
            cube_no: editTarget.cube_no || "", box_no: editTarget.box_no || "",
            item_name: editTarget.item_name || "", brand: editTarget.brand || "",
            oem: editTarget.oem || "", item_type: editTarget.item_type || "",
            batch_no: editTarget.batch_no || "",
            expiry_date: editTarget.expiry_date ? String(editTarget.expiry_date).slice(0, 10) : "",
            document_name: editTarget.document_name || "", document_url: editTarget.document_url || "",
          } : null}
          onSave={handleSave}
          onClose={() => { setShowForm(false); setEditTarget(null); }}
          saving={saving}
        />
      )}
    </div>
  );
}

export default function InventoryTransactions() {
  const { user } = useAuth();
  const { toast } = useToast();
  const isAdmin = ["admin", "superadmin"].includes(user?.role);

  const [txns, setTxns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState(null);
  const [detailCache, setDetailCache] = useState({});

  const loadList = useCallback(() => {
    setLoading(true);
    api.getInventoryTransactions()
      .then(d => setTxns(d.data || []))
      .catch(e => toast(e.message, "error"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadList(); }, [loadList]);

  const loadDetail = useCallback((id) => {
    api.getInventoryTransaction(id)
      .then(d => setDetailCache(c => ({ ...c, [id]: d })))
      .catch(e => toast(e.message, "error"));
  }, []);

  const handleToggle = (id) => {
    if (openId === id) { setOpenId(null); return; }
    setOpenId(id);
    loadDetail(id);
  };

  const handleReload = (id) => {
    loadList();
    loadDetail(id);
  };

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-title">Inventory Transactions</div>
          <div className="page-sub">
            Packing-list drafts generated from fully-assembled kits — edit rows, then push the final report to Kits Information.
          </div>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 60 }}><div className="spinner" /></div>
      ) : txns.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">🧾</div>
          <div>No inventory transactions yet</div>
          <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>
            Fully assemble a kit in Create Kit, then click "Generate Transaction" on it.
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {txns.map(t => (
            <TransactionCard
              key={t.id}
              txn={t}
              isOpen={openId === t.id}
              detail={detailCache[t.id]}
              onToggle={() => handleToggle(t.id)}
              onReload={() => handleReload(t.id)}
              isAdmin={isAdmin}
              toast={toast}
            />
          ))}
        </div>
      )}
    </>
  );
}
