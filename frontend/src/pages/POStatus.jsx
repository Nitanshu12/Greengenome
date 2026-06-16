import { useState, useEffect, Fragment } from "react";
import { api, downloadBlob } from "../api";
import { useToast } from "../components/Toast";
import { useAuth } from "../hooks/useAuth";

const STATUS_STYLE = {
  sent:     { color: "#1d4ed8", bg: "#dbeafe", label: "Open"   },
  short:    { color: "#b45309", bg: "#fef3c7", label: "Short"  },
  received: { color: "#15803d", bg: "#dcfce7", label: "Closed" },
};
const FALLBACK_STYLE = { color: "#6b7280", bg: "#f3f4f6", label: "Cancelled" };

export default function POStatus() {
  const { user } = useAuth();
  const { toast } = useToast();
  const isAdmin = ["admin", "superadmin"].includes(user?.role);

  const [pos, setPOs]           = useState([]);
  const [loading, setLoading]   = useState(true);
  const [downloading, setDownloading]   = useState(null);
  const [cancelling, setCancelling]     = useState(null);
  const [expandedPoId, setExpandedPoId] = useState(null);
  const [poItemsCache, setPoItemsCache] = useState({});
  const [loadingItemsId, setLoadingItemsId] = useState(null);

  useEffect(() => {
    api.getPOs()
      .then(d => setPOs(d.data || []))
      .catch(e => toast(e.message, "error"))
      .finally(() => setLoading(false));
  }, []);

  const handleDownload = async (po) => {
    setDownloading(po.id);
    try {
      const blob = await api.downloadPO(po.id);
      const safeName = (po.po_number || String(po.id)).replace(/\//g, "-");
      downloadBlob(blob, `PO-${safeName}.docx`);
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setDownloading(null);
    }
  };

  const handleCancel = async (po) => {
    if (!confirm(`Cancel PO #${po.po_number}? This cannot be undone.`)) return;
    setCancelling(po.id);
    try {
      await api.updatePOStatus(po.id, "cancelled");
      setPOs(prev => prev.map(p => p.id === po.id ? { ...p, status: "cancelled" } : p));
      toast(`PO #${po.po_number} cancelled`);
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setCancelling(null);
    }
  };

  const handleToggleExpand = async (po) => {
    if (expandedPoId === po.id) { setExpandedPoId(null); return; }
    setExpandedPoId(po.id);
    if (poItemsCache[po.id]) return;
    setLoadingItemsId(po.id);
    try {
      const data = await api.getPOItemsStatus(po.id);
      setPoItemsCache(prev => ({ ...prev, [po.id]: data.items || [] }));
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setLoadingItemsId(null);
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Purchase Orders</div>
          <div className="page-sub">Track all generated POs and update their delivery status</div>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 60 }}><div className="spinner" /></div>
      ) : pos.length === 0 ? (
        <div style={{
          textAlign: "center", padding: "60px 24px",
          color: "var(--muted)", fontSize: 14, lineHeight: 1.7,
        }}>
          No purchase orders generated yet.<br />
          Go to <strong>Create Kit</strong> → select shortfall items → Generate PO.
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>PO #</th>
                <th>Vendor</th>
                <th>Date</th>
                <th style={{ textAlign: "right" }}>Items</th>
                <th style={{ textAlign: "right" }}>Subtotal</th>
                <th style={{ textAlign: "right" }}>GST</th>
                <th style={{ textAlign: "right" }}>Net Total</th>
                <th>Status</th>
                <th>Created By</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {pos.map(po => {
                const s = STATUS_STYLE[po.status] || FALLBACK_STYLE;
                const isExpanded = expandedPoId === po.id;
                const cachedItems = poItemsCache[po.id] || [];
                return (
                  <Fragment key={po.id}>
                    {/* ── Main PO row ── */}
                    <tr style={{ cursor: "pointer" }} onClick={() => handleToggleExpand(po)}>
                      <td>
                        <span style={{ fontFamily: "monospace", fontWeight: 700, fontSize: 13 }}>
                          {po.po_number || "—"}
                        </span>
                      </td>
                      <td>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>
                          {po.business_name || po.vendor_code}
                        </div>
                        <div style={{ fontSize: 11, color: "var(--muted)", fontFamily: "monospace" }}>
                          {po.vendor_code}
                        </div>
                      </td>
                      <td style={{ color: "var(--muted)", fontSize: 12, whiteSpace: "nowrap" }}>
                        {po.created_at
                          ? new Date(po.created_at).toLocaleDateString("en-IN", {
                              day: "2-digit", month: "short", year: "numeric"
                            })
                          : "—"}
                      </td>
                      <td style={{ textAlign: "right", fontWeight: 600 }}>
                        {po.item_count || 0}
                      </td>
                      <td style={{ textAlign: "right", fontSize: 13 }}>
                        ₹{Number(po.total_amount || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </td>
                      <td style={{ textAlign: "right", fontSize: 13, color: "var(--muted)" }}>
                        ₹{Number(po.gst_amount || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </td>
                      <td style={{ textAlign: "right", fontWeight: 700, fontSize: 13 }}>
                        ₹{Number(po.net_total || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </td>
                      <td>
                        <span style={{
                          fontSize: 11, fontWeight: 700,
                          color: s.color, background: s.bg,
                          padding: "3px 10px", borderRadius: 20,
                          border: `1px solid ${s.color}44`,
                          whiteSpace: "nowrap",
                        }}>
                          {s.label}
                        </span>
                      </td>
                      <td style={{ color: "var(--muted)", fontSize: 12 }}>
                        {po.created_by || "—"}
                      </td>
                      <td onClick={e => e.stopPropagation()}>
                        <div className="flex gap-2" style={{ alignItems: "center" }}>
                          <button
                            className="btn btn-ghost btn-sm"
                            onClick={() => handleDownload(po)}
                            disabled={downloading === po.id}
                            style={{ fontSize: 12, whiteSpace: "nowrap" }}
                          >
                            {downloading === po.id ? "…" : "↓ DOCX"}
                          </button>
                          {isAdmin && ["sent", "short"].includes(po.status) && (
                            <button
                              className="btn btn-danger btn-sm"
                              onClick={() => handleCancel(po)}
                              disabled={cancelling === po.id}
                              style={{ fontSize: 12, whiteSpace: "nowrap" }}
                            >
                              {cancelling === po.id ? "…" : "Cancel"}
                            </button>
                          )}
                          <button
                            className="btn btn-ghost btn-sm"
                            onClick={() => handleToggleExpand(po)}
                            style={{ fontSize: 12, whiteSpace: "nowrap", minWidth: 72 }}
                          >
                            {isExpanded ? "▲ Hide" : "▼ Items"}
                          </button>
                        </div>
                      </td>
                    </tr>

                    {/* ── Expanded items detail row ── */}
                    {isExpanded && (
                      <tr>
                        <td colSpan={10} style={{ padding: 0, background: "#f8fafc", borderTop: "none" }}>
                          <div style={{ padding: "16px 24px 20px", borderTop: "2px solid var(--border)" }}>

                            {loadingItemsId === po.id ? (
                              <div style={{ textAlign: "center", padding: 20 }}>
                                <div className="spinner" />
                              </div>
                            ) : (
                              <>
                                <div style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)", marginBottom: 10, textTransform: "uppercase", letterSpacing: 0.5 }}>
                                  Items in PO {po.po_number}
                                </div>
                                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                                  <thead>
                                    <tr style={{ background: "#f1f5f9" }}>
                                      <th style={{ padding: "7px 12px", textAlign: "left", fontWeight: 600, fontSize: 11, color: "var(--muted)", border: "1px solid var(--border)" }}>Code</th>
                                      <th style={{ padding: "7px 12px", textAlign: "left", fontWeight: 600, fontSize: 11, color: "var(--muted)", border: "1px solid var(--border)" }}>Item Name</th>
                                      <th style={{ padding: "7px 12px", textAlign: "right", fontWeight: 600, fontSize: 11, color: "var(--muted)", border: "1px solid var(--border)" }}>Ordered</th>
                                      <th style={{ padding: "7px 12px", textAlign: "right", fontWeight: 600, fontSize: 11, color: "var(--muted)", border: "1px solid var(--border)" }}>Received</th>
                                      <th style={{ padding: "7px 12px", textAlign: "right", fontWeight: 600, fontSize: 11, color: "var(--muted)", border: "1px solid var(--border)" }}>Pending</th>
                                      <th style={{ padding: "7px 12px", textAlign: "center", fontWeight: 600, fontSize: 11, color: "var(--muted)", border: "1px solid var(--border)" }}>Status</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {cachedItems.map(item => {
                                      const isFull    = Number(item.pending_qty) === 0;
                                      const rowBg     = isFull ? "#f0fdf4" : "#fffbeb";
                                      return (
                                        <tr key={item.item_code} style={{ background: rowBg }}>
                                          <td style={{ padding: "8px 12px", border: "1px solid var(--border)" }}>
                                            <span style={{ fontFamily: "monospace", fontWeight: 600, fontSize: 11, background: "var(--border)", padding: "2px 6px", borderRadius: 4 }}>
                                              {item.item_code}
                                            </span>
                                          </td>
                                          <td style={{ padding: "8px 12px", border: "1px solid var(--border)", fontWeight: 500 }}>
                                            {item.item_name}
                                          </td>
                                          <td style={{ padding: "8px 12px", border: "1px solid var(--border)", textAlign: "right", fontWeight: 600 }}>
                                            {Number(item.ordered_qty).toLocaleString("en-IN")}
                                            <span style={{ fontSize: 11, color: "var(--muted)", marginLeft: 4 }}>{item.unit}</span>
                                          </td>
                                          <td style={{ padding: "8px 12px", border: "1px solid var(--border)", textAlign: "right", color: "#15803d", fontWeight: 600 }}>
                                            {Number(item.received_qty).toLocaleString("en-IN")}
                                          </td>
                                          <td style={{ padding: "8px 12px", border: "1px solid var(--border)", textAlign: "right", color: isFull ? "var(--muted)" : "#b45309", fontWeight: 700 }}>
                                            {isFull ? "—" : Number(item.pending_qty).toLocaleString("en-IN")}
                                          </td>
                                          <td style={{ padding: "8px 12px", border: "1px solid var(--border)", textAlign: "center" }}>
                                            {isFull ? (
                                              <span style={{ fontSize: 11, fontWeight: 700, color: "#15803d", background: "#dcfce7", padding: "2px 10px", borderRadius: 10 }}>
                                                ✓ Full
                                              </span>
                                            ) : (
                                              <span style={{ fontSize: 11, fontWeight: 700, color: "#92400e", background: "#fef3c7", padding: "2px 10px", borderRadius: 10 }}>
                                                ⚠ Pending {Number(item.pending_qty).toLocaleString("en-IN")}
                                              </span>
                                            )}
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>

                                {po.status === "short" && (
                                  <div style={{
                                    marginTop: 12, padding: "10px 14px",
                                    background: "#fef9c3", border: "1px solid #fcd34d",
                                    borderRadius: 8, fontSize: 12, color: "#92400e",
                                  }}>
                                    <strong>Pending items remain.</strong> Go to{" "}
                                    <strong>Stock Batches → Add Receipt → Receive Against PO</strong>{" "}
                                    and select this PO to complete receipt. Status will update to <strong>Closed</strong> automatically.
                                  </div>
                                )}
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
