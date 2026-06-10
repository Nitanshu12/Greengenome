import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../hooks/useAuth";
import { useToast } from "../components/Toast";

const EMPTY_FORM = { kit_name: "", qty_kits: 1, notes: "" };

function StatusBadge({ status }) {
  const map = {
    assembled: { label: "Fully Assembled", color: "#16a34a", bg: "#dcfce7" },
    partial:   { label: "Partial — Shortfalls Exist", color: "#b45309", bg: "#fef9c3" },
    cancelled: { label: "Cancelled", color: "#dc2626", bg: "#fee2e2" },
  };
  const s = map[status] || map.assembled;
  return (
    <span style={{
      display: "inline-block",
      padding: "3px 10px",
      borderRadius: 20,
      fontSize: 12,
      fontWeight: 700,
      letterSpacing: 0.3,
      color: s.color,
      background: s.bg,
      border: `1px solid ${s.color}33`,
    }}>
      {s.label}
    </span>
  );
}

function SummaryChip({ count, total, type }) {
  const isGood = type === "allocated";
  return (
    <span style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 6,
      padding: "4px 12px",
      borderRadius: 20,
      fontSize: 13,
      fontWeight: 600,
      color: isGood ? "#15803d" : "#b45309",
      background: isGood ? "#f0fdf4" : "#fffbeb",
      border: `1px solid ${isGood ? "#86efac" : "#fcd34d"}`,
    }}>
      {isGood ? "✓" : "⚠"} {count}{total !== undefined ? ` / ${total}` : ""} {isGood ? "items ready" : "shortfall items"}
    </span>
  );
}

export default function CreateKit() {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const isAdmin = ["admin", "superadmin"].includes(user?.role);

  const [phase, setPhase] = useState("form");
  const [form, setForm] = useState(EMPTY_FORM);
  const [creating, setCreating] = useState(false);
  const [result, setResult] = useState(null);
  const [allocatedOpen, setAllocatedOpen] = useState(true);
  const [shortfallsOpen, setShortfallsOpen] = useState(true);
  const [history, setHistory] = useState([]);
  const [historyOpen, setHistoryOpen] = useState(true);

  // Kit detail modal
  const [selectedKit, setSelectedKit] = useState(null);
  const [kitDetail, setKitDetail] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  // Pending shortfalls panel (most recent partial kit)
  const [pendingKit, setPendingKit] = useState(null);
  const [pendingDetail, setPendingDetail] = useState(null);
  const [loadingPending, setLoadingPending] = useState(false);
  const [pendingDismissed, setPendingDismissed] = useState(false);

  const loadPendingKit = useCallback(async (historyRows) => {
    const recent = historyRows.find(h => h.status === "partial");
    if (!recent) { setPendingKit(null); setPendingDetail(null); return; }
    // Same kit already loaded — no refetch needed
    setPendingKit(prev => {
      if (prev?.kit_id === recent.kit_id) return prev;
      return recent;
    });
    setPendingDismissed(false);
    setLoadingPending(true);
    try {
      const data = await api.getKitDetails(recent.kit_id);
      setPendingDetail(data);
    } catch (_) {
      setPendingDetail(null);
    } finally {
      setLoadingPending(false);
    }
  }, []);

  useEffect(() => {
    api.getKitHistory()
      .then(d => {
        const rows = d.data || [];
        setHistory(rows);
        loadPendingKit(rows);
      })
      .catch(() => {});
  }, [loadPendingKit]);

  // Re-fetch pending details whenever the user switches back to this tab.
  // Covers the common case: user goes to Stock Batches, adds stock, comes back.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible" && pendingKit) {
        setLoadingPending(true);
        api.getKitDetails(pendingKit.kit_id)
          .then(data => setPendingDetail(data))
          .catch(() => {})
          .finally(() => setLoadingPending(false));
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [pendingKit]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleViewKit = async (kitRow) => {
    setSelectedKit(kitRow);
    setKitDetail(null);
    setLoadingDetail(true);
    try {
      const data = await api.getKitDetails(kitRow.kit_id);
      setKitDetail(data);
    } catch (e) {
      toast(e.message, "error");
      setSelectedKit(null);
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleCancelKit = async () => {
    if (!window.confirm(
      `Cancel kit "${selectedKit.kit_name}"?\n\nThis will restore all allocated stock back to their batches.`
    )) return;
    setCancelling(true);
    try {
      await api.cancelKit(selectedKit.kit_id);
      toast(`Kit #${selectedKit.kit_id} cancelled — stock restored`);
      setSelectedKit(null);
      setKitDetail(null);
      api.getKitHistory().then(d => {
        const rows = d.data || [];
        setHistory(rows);
        loadPendingKit(rows);
      }).catch(() => {});
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setCancelling(false);
    }
  };

  const handleCreate = async () => {
    if (!form.kit_name.trim()) {
      toast("Kit name is required", "error");
      return;
    }
    const qty = parseInt(form.qty_kits, 10);
    if (isNaN(qty) || qty < 1) {
      toast("Quantity must be at least 1", "error");
      return;
    }
    const duplicate = history.find(
      h => h.kit_name.toLowerCase() === form.kit_name.trim().toLowerCase() && h.status !== "cancelled"
    );
    if (duplicate) {
      toast(
        `A kit named "${form.kit_name.trim()}" already exists (Kit #${duplicate.kit_id}). Use a different name.`,
        "error"
      );
      return;
    }
    setCreating(true);
    try {
      const data = await api.createKit({ ...form, qty_kits: qty });
      setResult(data);
      setPhase("result");
      api.getKitHistory().then(d => {
        const rows = d.data || [];
        setHistory(rows);
        loadPendingKit(rows);
      }).catch(() => {});
      if (data.status === "assembled") {
        toast(`Kit "${data.kit_name}" fully assembled! Kit ID: #${data.kit_id}`);
      } else {
        toast(`Kit "${data.kit_name}" created with shortfalls. Kit ID: #${data.kit_id}`, "error");
      }
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setCreating(false);
    }
  };

  const handleCreateAnother = () => {
    setForm(EMPTY_FORM);
    setResult(null);
    setPhase("form");
  };

  const handleOrderShortfalls = () => {
    navigate("/stock-batches");
  };

  const totalItems = result
    ? (result.allocated?.length || 0) + (result.shortfalls?.length || 0)
    : 0;

  const statusStyle = {
    assembled: { color: "#15803d", bg: "#dcfce7" },
    partial:   { color: "#b45309", bg: "#fef9c3" },
    cancelled: { color: "#dc2626", bg: "#fee2e2" },
  };

  // ── Kit Detail Modal ──────────────────────────────────────────────────────
  const KitDetailModal = () => {
    if (!selectedKit) return null;
    const det = kitDetail;
    const kitInfo = det?.kit || selectedKit;
    const isCancelled = kitInfo.status === "cancelled";

    return (
      <div
        onClick={() => setSelectedKit(null)}
        style={{
          position: "fixed", inset: 0,
          background: "rgba(0,0,0,0.45)",
          zIndex: 1000,
          display: "flex", alignItems: "flex-start", justifyContent: "center",
          padding: "40px 16px",
          overflowY: "auto",
        }}
      >
        <div
          onClick={e => e.stopPropagation()}
          style={{
            background: "var(--surface)",
            borderRadius: 14,
            width: "100%",
            maxWidth: 860,
            boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
            overflow: "hidden",
          }}
        >
          <div style={{
            padding: "20px 24px 16px",
            borderBottom: "1px solid var(--border)",
            display: "flex", alignItems: "flex-start", gap: 12,
          }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <span style={{ fontFamily: "monospace", fontWeight: 700, fontSize: 13, color: "var(--muted)" }}>
                  Kit #{kitInfo.kit_id}
                </span>
                <StatusBadge status={kitInfo.status} />
              </div>
              <div style={{ fontSize: 18, fontWeight: 700, color: "var(--text)", marginTop: 4 }}>
                {kitInfo.kit_name}
              </div>
              <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 6, display: "flex", gap: 20, flexWrap: "wrap" }}>
                <span>Qty: <strong style={{ color: "var(--text)" }}>{kitInfo.qty_kits}</strong></span>
                <span>By: <strong style={{ color: "var(--text)" }}>{kitInfo.assembled_by || "—"}</strong></span>
                <span>Date: <strong style={{ color: "var(--text)" }}>
                  {kitInfo.created_at
                    ? new Date(kitInfo.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
                    : "—"}
                </strong></span>
                {kitInfo.notes && (
                  <span>Notes: <strong style={{ color: "var(--text)" }}>{kitInfo.notes}</strong></span>
                )}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
              {isAdmin && !isCancelled && (
                <button
                  className="btn btn-ghost"
                  onClick={handleCancelKit}
                  disabled={cancelling}
                  style={{ color: "#dc2626", borderColor: "#fca5a5", fontSize: 13 }}
                >
                  {cancelling ? "Cancelling…" : "Cancel Kit"}
                </button>
              )}
              <button
                onClick={() => setSelectedKit(null)}
                style={{
                  background: "none", border: "none",
                  cursor: "pointer", fontSize: 20,
                  color: "var(--muted)", lineHeight: 1,
                  padding: "4px 8px",
                }}
              >
                ✕
              </button>
            </div>
          </div>

          <div style={{ padding: "20px 24px" }}>
            {loadingDetail ? (
              <div style={{ textAlign: "center", padding: "40px 0", color: "var(--muted)", fontSize: 14 }}>
                Loading kit details…
              </div>
            ) : det ? (
              <>
                {det.allocated.length > 0 && (
                  <div style={{ marginBottom: 24 }}>
                    <div style={{
                      display: "flex", alignItems: "center", gap: 8,
                      marginBottom: 10, paddingBottom: 8,
                      borderBottom: "2px solid #86efac",
                    }}>
                      <div style={{ width: 4, height: 18, background: "#16a34a", borderRadius: 2 }} />
                      <span style={{ fontWeight: 700, color: "#15803d", fontSize: 14, flex: 1 }}>
                        Allocated Items
                      </span>
                      <span style={{
                        fontSize: 11, fontWeight: 600, color: "#15803d",
                        background: "#dcfce7", padding: "2px 8px", borderRadius: 10,
                      }}>
                        {det.allocated.length} items
                      </span>
                    </div>
                    <div className="table-wrap" style={{ margin: 0 }}>
                      <table>
                        <thead>
                          <tr>
                            <th>Item Code</th>
                            <th>Item Name</th>
                            <th style={{ textAlign: "right" }}>Required</th>
                            <th style={{ textAlign: "right" }}>Allocated</th>
                            <th>Batches Used</th>
                          </tr>
                        </thead>
                        <tbody>
                          {det.allocated.map(row => (
                            <tr key={row.item_code} style={{ borderLeft: "3px solid #86efac" }}>
                              <td>
                                <span style={{
                                  fontFamily: "monospace", fontWeight: 600, fontSize: 12,
                                  background: "#dcfce7", color: "#15803d",
                                  padding: "2px 7px", borderRadius: 4,
                                }}>
                                  {row.item_code}
                                </span>
                              </td>
                              <td style={{ fontWeight: 500 }}>{row.item_name}</td>
                              <td style={{ textAlign: "right" }}>{Number(row.required_qty).toLocaleString("en-IN")}</td>
                              <td style={{ textAlign: "right", color: "#16a34a", fontWeight: 700 }}>
                                {Number(row.allocated_qty).toLocaleString("en-IN")}
                              </td>
                              <td style={{ fontSize: 12, color: "var(--muted)" }}>
                                {row.batches?.map(b => (
                                  <span key={b.batch_id} style={{ marginRight: 8, whiteSpace: "nowrap" }}>
                                    #{b.batch_id}&nbsp;({b.qty}
                                    {b.expiry_date
                                      ? `, exp ${new Date(b.expiry_date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" })}`
                                      : ""})
                                  </span>
                                ))}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {det.shortfalls.length > 0 && (
                  <div>
                    <div style={{
                      display: "flex", alignItems: "center", gap: 8,
                      marginBottom: 10, paddingBottom: 8,
                      borderBottom: "2px solid #fca5a5",
                    }}>
                      <div style={{ width: 4, height: 18, background: "#dc2626", borderRadius: 2 }} />
                      <span style={{ fontWeight: 700, color: "#dc2626", fontSize: 14, flex: 1 }}>
                        Shortfall Items
                      </span>
                      <span style={{
                        fontSize: 11, fontWeight: 600, color: "#dc2626",
                        background: "#fee2e2", padding: "2px 8px", borderRadius: 10,
                      }}>
                        {det.shortfalls.length} items
                      </span>
                    </div>
                    <div className="table-wrap" style={{ margin: 0 }}>
                      <table>
                        <thead>
                          <tr>
                            <th>Item Code</th>
                            <th>Item Name</th>
                            <th style={{ textAlign: "right" }}>Required</th>
                            <th style={{ textAlign: "right" }}>Allocated</th>
                            <th style={{ textAlign: "right" }}>Shortfall</th>
                          </tr>
                        </thead>
                        <tbody>
                          {det.shortfalls.map(row => (
                            <tr key={row.item_code} style={{ borderLeft: "3px solid #fca5a5" }}>
                              <td>
                                <span style={{
                                  fontFamily: "monospace", fontWeight: 600, fontSize: 12,
                                  background: "#fee2e2", color: "#dc2626",
                                  padding: "2px 7px", borderRadius: 4,
                                }}>
                                  {row.item_code}
                                </span>
                              </td>
                              <td style={{ fontWeight: 500 }}>{row.item_name}</td>
                              <td style={{ textAlign: "right" }}>{Number(row.required_qty).toLocaleString("en-IN")}</td>
                              <td style={{ textAlign: "right", color: "var(--muted)" }}>
                                {Number(row.allocated_qty).toLocaleString("en-IN")}
                              </td>
                              <td style={{ textAlign: "right" }}>
                                <span style={{
                                  fontWeight: 700, color: "#dc2626", background: "#fee2e2",
                                  padding: "2px 8px", borderRadius: 10, fontSize: 12,
                                }}>
                                  −{Number(row.shortfall_qty).toLocaleString("en-IN")}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {det.allocated.length === 0 && det.shortfalls.length === 0 && (
                  <div style={{ textAlign: "center", padding: "24px 0", color: "var(--muted)" }}>
                    No allocation data found for this kit.
                  </div>
                )}
              </>
            ) : null}
          </div>
        </div>
      </div>
    );
  };

  // ── Pending Shortfalls Panel ──────────────────────────────────────────────
  const PendingShortfallsPanel = () => {
    if (!pendingKit || pendingDismissed) return null;
    if (!pendingDetail && !loadingPending) return null;

    const shortfalls = pendingDetail?.shortfalls || [];
    const stillShort   = shortfalls.filter(r => !r.now_coverable);
    const nowCoverable = shortfalls.filter(r => r.now_coverable);
    if (!loadingPending && shortfalls.length === 0) return null;

    const kitInfo = pendingDetail?.kit || pendingKit;

    const recheck = () => {
      setLoadingPending(true);
      api.getKitDetails(pendingKit.kit_id)
        .then(data => setPendingDetail(data))
        .catch(() => {})
        .finally(() => setLoadingPending(false));
    };

    return (
      <div style={{ flex: 1, minWidth: 0, zoom: 0.85 }}>
        <div style={{
          background: "var(--surface)",
          border: `1.5px solid ${stillShort.length === 0 ? "#86efac" : "#fca5a5"}`,
          borderRadius: 12,
          overflow: "hidden",
        }}>
          {/* Header */}
          <div style={{
            padding: "14px 16px 12px",
            background: stillShort.length === 0 ? "#f0fdf4" : "#fff7f7",
            borderBottom: `1px solid ${stillShort.length === 0 ? "#86efac" : "#fca5a5"}`,
            display: "flex", alignItems: "flex-start", gap: 10,
          }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span style={{
                  fontSize: 11, fontWeight: 800, letterSpacing: 0.8,
                  color: stillShort.length === 0 ? "#15803d" : "#b45309",
                  textTransform: "uppercase",
                }}>
                  {stillShort.length === 0 ? "Shortfalls Resolved ✓" : "Pending Shortfalls"}
                </span>
                <StatusBadge status={stillShort.length === 0 ? "assembled" : "partial"} />
              </div>
              <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text)", marginTop: 3 }}>
                {kitInfo.kit_name}
              </div>
              <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2, display: "flex", gap: 12, flexWrap: "wrap" }}>
                <span>Kit <strong style={{ color: "var(--text)" }}>#{kitInfo.kit_id}</strong></span>
                <span>Qty: <strong style={{ color: "var(--text)" }}>{kitInfo.qty_kits}</strong></span>
                {kitInfo.created_at && (
                  <span>{new Date(kitInfo.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</span>
                )}
              </div>
            </div>
            <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
              <button
                onClick={recheck}
                disabled={loadingPending}
                title="Recheck current stock levels"
                style={{
                  background: "none",
                  border: "1px solid var(--border)",
                  borderRadius: 6,
                  cursor: loadingPending ? "default" : "pointer",
                  fontSize: 13, color: "var(--muted)",
                  padding: "2px 8px", lineHeight: 1.6,
                }}
              >
                {loadingPending ? "…" : "↻"}
              </button>
              <button
                onClick={() => setPendingDismissed(true)}
                title="Dismiss for this session"
                style={{
                  background: "none", border: "none",
                  cursor: "pointer", fontSize: 16,
                  color: "var(--muted)", lineHeight: 1,
                  padding: "2px 6px",
                }}
              >
                ✕
              </button>
            </div>
          </div>

          {/* Summary bar */}
          {!loadingPending && (
            <div style={{
              padding: "7px 16px",
              background: "#fffbeb",
              borderBottom: "1px solid #fde68a",
              fontSize: 12, fontWeight: 600,
              display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
            }}>
              <span style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                {stillShort.length > 0 && (
                  <span style={{ color: "#dc2626" }}>⚠ {stillShort.length} still need ordering</span>
                )}
                {nowCoverable.length > 0 && (
                  <span style={{ color: "#15803d" }}>✓ {nowCoverable.length} now in stock — reorder kit to allocate</span>
                )}
              </span>
              <button
                className="btn btn-ghost"
                onClick={() => handleViewKit(pendingKit)}
                style={{ fontSize: 11, padding: "2px 10px", color: "var(--muted)", whiteSpace: "nowrap" }}
              >
                Full Details →
              </button>
            </div>
          )}

          {/* Table */}
          <div>
            {loadingPending ? (
              <div style={{ padding: "24px", textAlign: "center", color: "var(--muted)", fontSize: 13 }}>
                Checking stock levels…
              </div>
            ) : (
              <div className="table-wrap" style={{ margin: 0 }}>
                <table style={{ fontSize: 13 }}>
                  <thead>
                    <tr>
                      <th style={{ padding: "8px 10px" }}>Item Code</th>
                      <th style={{ padding: "8px 10px" }}>Item Name</th>
                      <th style={{ textAlign: "right", padding: "8px 10px" }}>Need</th>
                      <th style={{ textAlign: "right", padding: "8px 10px" }}>In Stock Now</th>
                      <th style={{ textAlign: "right", padding: "8px 10px" }}>Still Short</th>
                      <th style={{ padding: "8px 10px" }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {shortfalls.map(row => (
                      <tr
                        key={row.item_code}
                        style={{
                          borderLeft: `3px solid ${row.now_coverable ? "#86efac" : "#fca5a5"}`,
                          background: row.now_coverable ? "#f0fdf4" : undefined,
                        }}
                      >
                        <td style={{ padding: "6px 10px" }}>
                          <span style={{
                            fontFamily: "monospace", fontWeight: 600, fontSize: 11,
                            background: row.now_coverable ? "#dcfce7" : "#fee2e2",
                            color: row.now_coverable ? "#15803d" : "#dc2626",
                            padding: "2px 6px", borderRadius: 4,
                          }}>
                            {row.item_code}
                          </span>
                        </td>
                        <td style={{ padding: "6px 10px", fontWeight: 500, maxWidth: 180 }}>
                          {row.item_name}
                        </td>
                        <td style={{ textAlign: "right", padding: "6px 10px" }}>
                          {Number(row.shortfall_qty).toLocaleString("en-IN")}
                        </td>
                        <td style={{ textAlign: "right", padding: "6px 10px", fontWeight: 600,
                          color: row.now_coverable ? "#15803d" : (row.current_available > 0 ? "#b45309" : "var(--muted)"),
                        }}>
                          {Number(row.current_available).toLocaleString("en-IN")}
                        </td>
                        <td style={{ textAlign: "right", padding: "6px 10px" }}>
                          {row.now_coverable ? (
                            <span style={{
                              fontWeight: 700, color: "#15803d", background: "#dcfce7",
                              padding: "2px 7px", borderRadius: 8, fontSize: 11,
                            }}>
                              Ready ✓
                            </span>
                          ) : (
                            <span style={{
                              fontWeight: 700, color: "#dc2626", background: "#fee2e2",
                              padding: "2px 7px", borderRadius: 8, fontSize: 11,
                            }}>
                              −{Number(row.still_needed).toLocaleString("en-IN")}
                            </span>
                          )}
                        </td>
                        <td style={{ padding: "6px 10px" }}>
                          {!row.now_coverable && (
                            <button
                              className="btn btn-ghost btn-sm"
                              onClick={() => navigate(`/stock-batches?item_code=${encodeURIComponent(row.item_code)}`)}
                              style={{ fontSize: 11, padding: "2px 8px", whiteSpace: "nowrap" }}
                            >
                              Order
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  // ── History section ───────────────────────────────────────────────────────
  const HistorySection = () => (
    <div style={{ marginTop: 32 }}>
      <button
        onClick={() => setHistoryOpen(o => !o)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "12px 16px",
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: historyOpen ? "10px 10px 0 0" : 10,
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        <span style={{ fontWeight: 700, fontSize: 15, color: "var(--text)", flex: 1 }}>
          Kit Assembly History
        </span>
        <span style={{
          fontSize: 12, color: "var(--muted)", fontWeight: 600,
          background: "var(--border)", padding: "2px 10px", borderRadius: 12, marginRight: 8,
        }}>
          {history.length} kits
        </span>
        <span style={{
          fontSize: 16, color: "var(--muted)", fontWeight: 700,
          transform: historyOpen ? "rotate(180deg)" : "rotate(0deg)",
          transition: "transform 0.2s", display: "inline-block",
        }}>
          ▾
        </span>
      </button>

      {historyOpen && (
        <div style={{ border: "1px solid var(--border)", borderTop: "none", borderRadius: "0 0 10px 10px", overflow: "hidden" }}>
          {history.length === 0 ? (
            <div style={{ padding: "24px", textAlign: "center", color: "var(--muted)", fontSize: 13 }}>
              No kits assembled yet
            </div>
          ) : (
            <div className="table-wrap" style={{ margin: 0 }}>
              <table>
                <thead>
                  <tr>
                    <th>Kit ID</th>
                    <th>Kit Name</th>
                    <th style={{ textAlign: "right" }}>Qty</th>
                    <th>Status</th>
                    <th>Assembled By</th>
                    <th>Date</th>
                    <th>Notes</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {history.map(h => {
                    const s = statusStyle[h.status] || statusStyle.assembled;
                    return (
                      <tr key={h.kit_id}>
                        <td>
                          <span style={{ fontFamily: "monospace", fontWeight: 700, fontSize: 12 }}>
                            #{h.kit_id}
                          </span>
                        </td>
                        <td style={{ fontWeight: 600 }}>{h.kit_name}</td>
                        <td style={{ textAlign: "right", fontWeight: 600 }}>{h.qty_kits}</td>
                        <td>
                          <span style={{
                            fontSize: 11, fontWeight: 700,
                            color: s.color, background: s.bg,
                            padding: "2px 8px", borderRadius: 10,
                          }}>
                            {h.status === "assembled" ? "✓ Assembled" : h.status === "partial" ? "⚠ Partial" : "✗ Cancelled"}
                          </span>
                        </td>
                        <td style={{ color: "var(--muted)", fontSize: 13 }}>{h.assembled_by || "—"}</td>
                        <td style={{ color: "var(--muted)", fontSize: 12, whiteSpace: "nowrap" }}>
                          {h.created_at
                            ? new Date(h.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
                            : "—"}
                        </td>
                        <td style={{ color: "var(--muted)", fontSize: 12 }}>{h.notes || "—"}</td>
                        <td>
                          <button
                            className="btn btn-ghost btn-sm"
                            onClick={() => handleViewKit(h)}
                            style={{ fontSize: 12, padding: "3px 10px" }}
                          >
                            View
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );

  // ── Form phase ────────────────────────────────────────────────────────────
  if (phase === "form") {
    const hasPending = pendingKit && !pendingDismissed &&
      (loadingPending || (pendingDetail?.shortfalls?.length > 0));

    return (
      <>
        <KitDetailModal />

        <div className="page-header">
          <div>
            <div className="page-title">Create Kit</div>
            <div className="page-sub">Assemble a disaster response kit from BOM · FIFO allocation · 80% shelf-life rule</div>
          </div>
        </div>

        {!isAdmin && (
          <div style={{
            background: "#fef9c3",
            border: "1px solid #fcd34d",
            borderRadius: 8,
            padding: "12px 16px",
            marginBottom: 20,
            fontSize: 13,
            color: "#92400e",
          }}>
            You have view-only access. Only admins can assemble kits.
          </div>
        )}

        {/* Two-column layout when pending shortfalls exist */}
        <div style={{
          display: "flex",
          gap: 24,
          alignItems: "flex-start",
        }}>
          {/* Left: form */}
          <div style={{ flex: "0 0 auto", width: hasPending ? 460 : 560 }}>
            <div style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 12,
              padding: "28px 28px 24px",
            }}>
              <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 20, color: "var(--text)" }}>
                Kit Details
              </div>

              <div className="form-group">
                <label className="form-label">Kit Name *</label>
                <input
                  className="form-input"
                  placeholder="e.g. BHISHM Alpha Kit"
                  value={form.kit_name}
                  onChange={e => set("kit_name", e.target.value)}
                  disabled={!isAdmin || creating}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Number of Kits</label>
                <input
                  className="form-input"
                  type="number"
                  min="1"
                  style={{ maxWidth: 120 }}
                  value={form.qty_kits}
                  onChange={e => set("qty_kits", e.target.value)}
                  disabled={!isAdmin || creating}
                />
                <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>
                  Required quantities from BOM will be multiplied by this number
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Notes (optional)</label>
                <input
                  className="form-input"
                  placeholder="e.g. Deployment batch for flood relief"
                  value={form.notes}
                  onChange={e => set("notes", e.target.value)}
                  disabled={!isAdmin || creating}
                />
              </div>

              <div style={{ marginTop: 8 }}>
                <button
                  className="btn btn-primary"
                  onClick={handleCreate}
                  disabled={!isAdmin || creating}
                  style={{ minWidth: 140 }}
                >
                  {creating ? (
                    <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span className="spinner" style={{ width: 14, height: 14 }} />
                      Assembling…
                    </span>
                  ) : "Create Kit →"}
                </button>
              </div>
            </div>

            {/* <div style={{
              marginTop: 16,
              padding: "12px 16px",
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              fontSize: 12,
              color: "var(--muted)",
              lineHeight: 1.6,
            }}>
              <strong style={{ color: "var(--text)" }}>How this works:</strong>
              <ul style={{ margin: "6px 0 0 0", paddingLeft: 18 }}>
                <li>Required quantities are read from BOM — Disaster</li>
                <li>Stock is allocated FIFO (earliest expiry date first)</li>
                <li>Batches must have ≥ 80% shelf life remaining to be eligible</li>
                <li>Allocated stock is deducted from batch issued quantities immediately</li>
              </ul>
            </div> */}
          </div>

          {/* Right: pending shortfalls panel */}
          <PendingShortfallsPanel />
        </div>

        <HistorySection />
      </>
    );
  }

  // ── Result phase ──────────────────────────────────────────────────────────
  return (
    <>
      <KitDetailModal />

      <div className="page-header" style={{ flexWrap: "wrap", gap: 12 }}>
        <div>
          <div className="page-title" style={{ display: "flex", alignItems: "center", gap: 12 }}>
            Kit &ldquo;{result.kit_name}&rdquo; &times; {result.qty_kits}
            <StatusBadge status={result.status} />
          </div>
          <div className="page-sub" style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
            <span>Kit ID: <strong>#{result.kit_id}</strong></span>
            <span>·</span>
            <SummaryChip count={result.allocated?.length || 0} total={totalItems} type="allocated" />
            {result.shortfalls?.length > 0 && (
              <SummaryChip count={result.shortfalls.length} type="shortfall" />
            )}
          </div>
        </div>
        <button className="btn btn-ghost" onClick={handleCreateAnother}>
          ← Create Another Kit
        </button>
      </div>

      {/* Allocated Items — collapsible */}
      {result.allocated?.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <button
            onClick={() => setAllocatedOpen(o => !o)}
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "12px 16px",
              background: allocatedOpen ? "#f0fdf4" : "var(--surface)",
              border: "1px solid #86efac",
              borderRadius: allocatedOpen ? "10px 10px 0 0" : 10,
              cursor: "pointer",
              textAlign: "left",
            }}
          >
            <div style={{ width: 4, height: 20, background: "#16a34a", borderRadius: 2, flexShrink: 0 }} />
            <span style={{ fontWeight: 700, fontSize: 15, color: "#15803d", flex: 1 }}>
              Allocated Items
            </span>
            <span style={{
              fontSize: 12, color: "#16a34a", fontWeight: 600,
              background: "#dcfce7", padding: "2px 10px", borderRadius: 12, marginRight: 8,
            }}>
              {result.allocated.length} items fully stocked
            </span>
            <span style={{
              fontSize: 16, color: "#16a34a", fontWeight: 700,
              transform: allocatedOpen ? "rotate(180deg)" : "rotate(0deg)",
              transition: "transform 0.2s",
              display: "inline-block",
            }}>
              ▾
            </span>
          </button>

          {allocatedOpen && (
            <div style={{ border: "1px solid #86efac", borderTop: "none", borderRadius: "0 0 10px 10px", overflow: "hidden" }}>
              <div className="table-wrap" style={{ margin: 0 }}>
                <table>
                  <thead>
                    <tr>
                      <th>Item Code</th>
                      <th>Item Name</th>
                      <th style={{ textAlign: "right" }}>Required</th>
                      <th style={{ textAlign: "right" }}>Allocated</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.allocated.map(row => (
                      <tr key={row.item_code} style={{ borderLeft: "3px solid #86efac" }}>
                        <td>
                          <span style={{
                            fontFamily: "monospace", fontWeight: 600, fontSize: 12,
                            background: "#dcfce7", color: "#15803d",
                            padding: "2px 7px", borderRadius: 4,
                          }}>
                            {row.item_code}
                          </span>
                        </td>
                        <td style={{ fontWeight: 500 }}>{row.item_name}</td>
                        <td style={{ textAlign: "right" }}>
                          {Number(row.required_qty).toLocaleString("en-IN")}
                        </td>
                        <td style={{ textAlign: "right", color: "#16a34a", fontWeight: 700 }}>
                          {Number(row.allocated_qty).toLocaleString("en-IN")}
                        </td>
                        <td>
                          <span style={{
                            fontSize: 11, fontWeight: 700,
                            color: "#15803d", background: "#dcfce7",
                            padding: "2px 8px", borderRadius: 10,
                          }}>
                            ✓ Allocated
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Shortfall Items — collapsible */}
      {result.shortfalls?.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <button
            onClick={() => setShortfallsOpen(o => !o)}
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "12px 16px",
              background: shortfallsOpen ? "#fff7f7" : "var(--surface)",
              border: "1px solid #fca5a5",
              borderRadius: shortfallsOpen ? "10px 10px 0 0" : 10,
              cursor: "pointer",
              textAlign: "left",
            }}
          >
            <div style={{ width: 4, height: 20, background: "#dc2626", borderRadius: 2, flexShrink: 0 }} />
            <span style={{ fontWeight: 700, fontSize: 15, color: "#dc2626", flex: 1 }}>
              Shortfall Items
            </span>
            <span style={{
              fontSize: 12, color: "#dc2626", fontWeight: 600,
              background: "#fee2e2", padding: "2px 10px", borderRadius: 12, marginRight: 4,
            }}>
              {result.shortfalls.length} items need ordering
            </span>
            <button
              className="btn btn-primary"
              style={{ background: "#dc2626", borderColor: "#dc2626", fontSize: 12, padding: "4px 12px", marginRight: 8 }}
              onClick={e => { e.stopPropagation(); handleOrderShortfalls(); }}
            >
              Create Order →
            </button>
            <span style={{
              fontSize: 16, color: "#dc2626", fontWeight: 700,
              transform: shortfallsOpen ? "rotate(180deg)" : "rotate(0deg)",
              transition: "transform 0.2s",
              display: "inline-block",
            }}>
              ▾
            </span>
          </button>

          {shortfallsOpen && (
            <div style={{ border: "1px solid #fca5a5", borderTop: "none", borderRadius: "0 0 10px 10px", overflow: "hidden" }}>
              <div className="table-wrap" style={{ margin: 0 }}>
                <table>
                  <thead>
                    <tr>
                      <th>Item Code</th>
                      <th>Item Name</th>
                      <th style={{ textAlign: "right" }}>Required</th>
                      <th style={{ textAlign: "right" }}>Available</th>
                      <th style={{ textAlign: "right" }}>Shortfall</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.shortfalls.map(row => (
                      <tr key={row.item_code} style={{ borderLeft: "3px solid #fca5a5" }}>
                        <td>
                          <span style={{
                            fontFamily: "monospace", fontWeight: 600, fontSize: 12,
                            background: "#fee2e2", color: "#dc2626",
                            padding: "2px 7px", borderRadius: 4,
                          }}>
                            {row.item_code}
                          </span>
                        </td>
                        <td style={{ fontWeight: 500 }}>{row.item_name}</td>
                        <td style={{ textAlign: "right" }}>
                          {Number(row.required_qty).toLocaleString("en-IN")}
                        </td>
                        <td style={{ textAlign: "right", color: "var(--muted)" }}>
                          {Number(row.available_qty).toLocaleString("en-IN")}
                        </td>
                        <td style={{ textAlign: "right" }}>
                          <span style={{
                            fontWeight: 700, color: "#dc2626", background: "#fee2e2",
                            padding: "2px 8px", borderRadius: 10, fontSize: 12,
                          }}>
                            −{Number(row.shortfall_qty).toLocaleString("en-IN")}
                          </span>
                        </td>
                        <td>
                          <button
                            className="btn btn-ghost btn-sm"
                            onClick={() => navigate(`/stock-batches?item_code=${encodeURIComponent(row.item_code)}`)}
                          >
                            Order
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {result.shortfalls?.length === 0 && (
        <div style={{
          marginTop: 16,
          padding: "16px 20px",
          background: "#f0fdf4",
          border: "1px solid #86efac",
          borderRadius: 10,
          color: "#15803d",
          fontWeight: 600,
          fontSize: 14,
        }}>
          All items fully allocated. Kit is ready for deployment.
        </div>
      )}

      <HistorySection />
    </>
  );
}
