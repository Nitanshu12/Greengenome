import { useEffect, useState, useCallback, Fragment } from "react";
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

function RowModal({ initial, onSave, onClose, saving }) {
  const [form, setForm] = useState(initial || EMPTY_ROW);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 560, width: "95%" }} onClick={e => e.stopPropagation()}>
        <div className="modal-title">Edit Row</div>

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
            {saving ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

function TransactionCard({ txn, isOpen, detail, onToggle, onReload, isAdmin, toast }) {
  const [editTarget, setEditTarget] = useState(null);
  const [saving, setSaving] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [expandedRows, setExpandedRows] = useState(new Set());
  const navigate = useNavigate();

  const items = detail?.items || [];
  const isDraft = txn.status === "draft";

  const toggleAssembly = (id) => setExpandedRows(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const handleSave = async (form) => {
    if (!form.item_name || !form.item_name.trim()) { toast("Item name is required", "error"); return; }
    setSaving(true);
    try {
      await api.updateInventoryTxnItem(txn.id, editTarget.id, form);
      toast("Row updated");
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

  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await api.syncInventoryTxn(txn.id);
      toast(res.msg);
      onReload();
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setSyncing(false);
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
              <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center", fontSize: 12, color: "var(--muted)", marginBottom: 10 }}>
                <span>Generated by <strong style={{ color: "var(--text)" }}>{txn.generated_by || "—"}</strong></span>
                <span>{txn.created_at ? new Date(txn.created_at).toLocaleString("en-IN") : "—"}</span>
                {txn.status === "finalized" && (
                  <span style={{ color: "#16a34a", fontWeight: 600 }}>
                    ✓ Pushed to Kits Information{txn.finalized_at ? ` on ${new Date(txn.finalized_at).toLocaleDateString("en-IN")}` : ""} —{" "}
                    <span style={{ textDecoration: "underline", cursor: "pointer" }} onClick={() => navigate("/packages")}>View in Kits Information</span>
                  </span>
                )}
                {isAdmin && (
                  <button
                    className="btn btn-ghost btn-sm"
                    style={{ marginLeft: "auto" }}
                    onClick={handleSync}
                    disabled={syncing}
                    title="Re-check batch status and backfill any documents uploaded after this transaction was generated"
                  >
                    {syncing ? "Syncing…" : "🔄 Sync"}
                  </button>
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
                    ) : items.map(it => {
                      const hasAssembly = Array.isArray(it.assembly_detail) && it.assembly_detail.length > 0;
                      const isExpanded = expandedRows.has(it.id);
                      const rowBg = it.is_flagged ? "#fef2f2" : it.batch_status_warning ? "#fff7ed" : undefined;
                      return (
                      <Fragment key={it.id}>
                      <tr
                        onClick={hasAssembly ? () => toggleAssembly(it.id) : undefined}
                        style={{ background: rowBg, cursor: hasAssembly ? "pointer" : undefined }}
                      >
                        <td>{it.cube_no || "—"}</td>
                        <td>{it.box_no || "—"}</td>
                        <td style={{ fontWeight: 500 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            {hasAssembly && (
                              <span style={{
                                display: "inline-block", flex: "none", color: "var(--muted)",
                                transition: "transform .15s", transform: isExpanded ? "rotate(90deg)" : "none",
                              }}>▸</span>
                            )}
                            {!!it.is_flagged && <span title="Allocation incomplete — check batch/expiry">⚠</span>}
                            {!!it.batch_status_warning && <span title="This batch's status has changed since allocation (recalled/expired/quarantined) — verify before shipping">🚫</span>}
                            {it.item_name || "—"}
                          </div>
                        </td>
                        <td>{it.brand || "—"}</td>
                        <td>{it.oem || "—"}</td>
                        <td>{it.item_type || "—"}</td>
                        <td style={{ fontFamily: "monospace", fontSize: 11 }}>{it.batch_no || "—"}</td>
                        <td>{it.expiry_date ? new Date(it.expiry_date).toLocaleDateString("en-IN") : "—"}</td>
                        <td>
                          {it.document_url
                            ? <a href={it.document_url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}>{it.document_name || "Link"}</a>
                            : (it.document_name || "—")}
                        </td>
                        {isAdmin && isDraft && (
                          <td>
                            <div className="flex gap-2" style={{ flexWrap: "wrap" }} onClick={e => e.stopPropagation()}>
                              <button className="btn btn-ghost btn-sm" onClick={() => setEditTarget(it)}>Edit</button>
                              <button className="btn btn-danger btn-sm" onClick={() => handleDelete(it)}>Delete</button>
                            </div>
                          </td>
                        )}
                      </tr>
                      {hasAssembly && isExpanded && (
                        <tr>
                          <td colSpan={isAdmin && isDraft ? 10 : 9} style={{ background: "var(--bg-alt, #f9fafb)", padding: "10px 18px" }}>
                            <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
                              <thead>
                                <tr style={{ color: "var(--muted)" }}>
                                  <th style={{ textAlign: "left", padding: "3px 8px", fontWeight: 600 }}>Component</th>
                                  <th style={{ textAlign: "left", padding: "3px 8px", fontWeight: 600 }}>Qty used</th>
                                  <th style={{ textAlign: "left", padding: "3px 8px", fontWeight: 600 }}>Batch(es)</th>
                                  <th style={{ textAlign: "left", padding: "3px 8px", fontWeight: 600 }}>Document</th>
                                </tr>
                              </thead>
                              <tbody>
                                {it.assembly_detail.flatMap((d, di) => {
                                  const docs = d.documents && d.documents.length ? d.documents : [null];
                                  return docs.map((doc, dj) => (
                                    <tr key={`${di}-${dj}`}>
                                      {dj === 0 && (
                                        <>
                                          <td rowSpan={docs.length} style={{ padding: "3px 8px" }}>{d.component_name}</td>
                                          <td rowSpan={docs.length} style={{ padding: "3px 8px", fontVariantNumeric: "tabular-nums" }}>{d.total_qty}</td>
                                          <td rowSpan={docs.length} style={{ padding: "3px 8px" }}>
                                            {d.batches.map((b, bi) => (
                                              <span key={bi} style={{
                                                display: "inline-block", fontFamily: "monospace", fontSize: 11,
                                                marginRight: 6, marginBottom: 2, padding: "1px 6px", borderRadius: 5,
                                                border: `1px solid ${d.batches.length > 1 ? "#fbd38d" : "var(--border)"}`,
                                                color: d.batches.length > 1 ? "#92400e" : "inherit",
                                              }}>
                                                {b.batch_no || "—"}{d.batches.length > 1 ? ` ×${b.qty}` : ""}
                                              </span>
                                            ))}
                                            {d.qty_short > 0 && <span style={{ color: "#dc2626", fontSize: 11 }}> ⚠ short {d.qty_short}</span>}
                                          </td>
                                        </>
                                      )}
                                      <td style={{ padding: "3px 8px" }}>
                                        {doc
                                          ? (doc.document_url
                                              ? <a href={doc.document_url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}>{doc.document_name || "Link"}</a>
                                              : (doc.document_name || "—"))
                                          : "—"}
                                      </td>
                                    </tr>
                                  ));
                                })}
                              </tbody>
                            </table>
                          </td>
                        </tr>
                      )}
                      </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {isAdmin && isDraft && (
                <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
                  <button className="btn btn-primary" style={{ marginLeft: "auto" }} onClick={handleFinalize} disabled={finalizing}>
                    {finalizing ? "Generating…" : "Generate Report → Push to Kits Information"}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {editTarget && (
        <RowModal
          initial={{
            cube_no: editTarget.cube_no || "", box_no: editTarget.box_no || "",
            item_name: editTarget.item_name || "", brand: editTarget.brand || "",
            oem: editTarget.oem || "", item_type: editTarget.item_type || "",
            batch_no: editTarget.batch_no || "",
            expiry_date: editTarget.expiry_date ? String(editTarget.expiry_date).slice(0, 10) : "",
            document_name: editTarget.document_name || "", document_url: editTarget.document_url || "",
          }}
          onSave={handleSave}
          onClose={() => setEditTarget(null)}
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
