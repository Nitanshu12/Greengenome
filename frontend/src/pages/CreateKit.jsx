import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { api, downloadBlob } from "../api";
import { useAuth } from "../hooks/useAuth";
import { useToast } from "../components/Toast";
import ProgressLoader from "../components/ProgressLoader";

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

// Splits the backend's combined (across all `numKits`) allocated/shortfall
// totals into a per-kit-instance view for display only — the backend never
// tracked allocation per individual kit instance, so this fills kit 1's need
// first, then kit 2's, etc., from the actually-obtained quantity. No DB state
// changes; it's purely how the numbers are grouped on screen.
function splitRowsPerKit(allocated, shortfalls, numKits) {
  const combined = [
    ...(allocated || []).map(r => ({ ...r, _got: r.allocated_qty })),
    ...(shortfalls || []).map(r => ({ ...r, _got: r.available_qty ?? 0 })),
  ];

  const perKit = Array.from({ length: numKits }, () => ({ allocated: [], shortfalls: [] }));

  for (const row of combined) {
    const perKitRequired = row.required_qty / numKits;
    let remainingGot = row._got;
    for (let i = 0; i < numKits; i++) {
      const give = Math.min(perKitRequired, remainingGot);
      remainingGot -= give;
      const shortfall = perKitRequired - give;
      const entry = {
        item_code: row.item_code,
        item_name: row.item_name,
        is_subkit: row.is_subkit,
        required_qty: perKitRequired,
        allocated_qty: give,
        shortfall_qty: shortfall,
      };
      if (shortfall > 0) perKit[i].shortfalls.push(entry);
      else perKit[i].allocated.push(entry);
    }
  }

  return perKit;
}

// GET /:kit_id/details and POST /create return slightly different shapes for
// the same data (details nests under `kit`, and its shortfall rows carry the
// obtained amount as `allocated_qty` instead of `available_qty`) — normalize
// to the POST shape so the same render code (and splitRowsPerKit) works for both.
function kitDetailsToResult(details) {
  return {
    kit_id: details.kit.kit_id,
    kit_name: details.kit.kit_name,
    qty_kits: details.kit.qty_kits,
    status: details.kit.status,
    allocated: details.allocated,
    shortfalls: (details.shortfalls || []).map(s => ({ ...s, available_qty: s.allocated_qty })),
  };
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

function CombinedOrderModal({ shortfalls, onClose, toast }) {
  const [loading, setLoading]           = useState(true);
  const [vendorGroups, setVendorGroups] = useState([]);
  const [unlinked, setUnlinked]         = useState([]);
  const [selected, setSelected]         = useState(null);
  const [removed, setRemoved]           = useState(new Set());
  const [generating, setGenerating]     = useState(false);
  const [poItemsMap, setPoItemsMap]     = useState({});

  useEffect(() => {
    Promise.all([api.getItemVendors(), api.getActivePOItems()])
      .then(([ivData, poData]) => {
        const ivMap = {};
        for (const entry of (ivData.data || [])) ivMap[entry.item_code] = entry.vendors || [];

        const vMap = {};
        const noVendor = [];
        for (const sf of shortfalls) {
          const vendors = ivMap[sf.item_code] || [];
          if (vendors.length === 0) { noVendor.push(sf); continue; }
          for (const v of vendors) {
            if (!vMap[v.vendor_code]) vMap[v.vendor_code] = { vendor: v, items: [] };
            vMap[v.vendor_code].items.push({ ...sf, offer_price: v.offer_price || 0 });
          }
        }

        setVendorGroups(Object.values(vMap).sort((a, b) => b.items.length - a.items.length));
        setUnlinked(noVendor);
        setPoItemsMap(poData.data || {});
      })
      .catch(e => toast(e.message, "error"))
      .finally(() => setLoading(false));
  }, []);

  function selectVendor(vendor_code) {
    setSelected(vendor_code);
    setRemoved(new Set());
  }

  function toggleRemove(item_code) {
    setRemoved(prev => {
      const next = new Set(prev);
      next.has(item_code) ? next.delete(item_code) : next.add(item_code);
      return next;
    });
  }

  const selectedGroup  = vendorGroups.find(g => g.vendor.vendor_code === selected);
  const activeItems    = selectedGroup
    ? selectedGroup.items.filter(i => !removed.has(i.item_code) && !poItemsMap[i.item_code])
    : [];
  const canGenerate    = selected && activeItems.length > 0;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 580, width: "95%", maxHeight: "90vh", overflowY: "auto" }}
        onClick={e => e.stopPropagation()}>

        <div className="modal-title">Combined Order — Group by Vendor</div>
        <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 16 }}>
          {shortfalls.length} shortfall item{shortfalls.length !== 1 ? "s" : ""} · select a vendor to raise one combined PO
        </div>

        {loading ? (
          <div style={{ textAlign: "center", padding: 30 }}><div className="spinner" /></div>
        ) : vendorGroups.length === 0 ? (
          <div style={{ background: "#fef9c3", border: "1px solid #fcd34d", borderRadius: 8, padding: "14px 16px", fontSize: 13, color: "#92400e" }}>
            ⚠ None of the shortfall items have vendors linked. Go to the <strong>Item Vendors</strong> page to link vendors first.
          </div>
        ) : (
          <>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
              {vendorGroups.map(({ vendor: v, items }) => {
                const isSel        = selected === v.vendor_code;
                const lockedCount  = items.filter(i => poItemsMap[i.item_code]).length;
                const removedCount = isSel ? items.filter(i => !poItemsMap[i.item_code] && removed.has(i.item_code)).length : 0;
                const activeCount  = items.length - lockedCount - removedCount;

                return (
                  <div key={v.vendor_code} style={{
                    border: `2px solid ${isSel ? "var(--primary, #2563eb)" : "var(--border)"}`,
                    borderRadius: 10, background: isSel ? "#eff6ff" : "var(--bg-alt, #f8f9fa)",
                    transition: "all 0.15s", overflow: "hidden",
                  }}>
                    {/* Vendor header */}
                    <div onClick={() => selectVendor(v.vendor_code)}
                      style={{ padding: "12px 16px", display: "flex", alignItems: "flex-start", gap: 12, cursor: "pointer" }}>
                      <div style={{
                        width: 18, height: 18, borderRadius: "50%", flexShrink: 0, marginTop: 2,
                        border: `2px solid ${isSel ? "var(--primary, #2563eb)" : "var(--muted)"}`,
                        background: isSel ? "var(--primary, #2563eb)" : "transparent",
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}>
                        {isSel && <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#fff" }} />}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3, flexWrap: "wrap" }}>
                          <span style={{
                            fontFamily: "monospace", fontWeight: 700, fontSize: 11,
                            background: isSel ? "#dbeafe" : "var(--border)",
                            color: isSel ? "#1d4ed8" : "var(--muted)",
                            padding: "2px 7px", borderRadius: 4,
                          }}>{v.vendor_code}</span>
                          {!!v.is_preferred && (
                            <span style={{ fontSize: 10, fontWeight: 700, color: "#b45309", background: "#fef3c7", padding: "1px 6px", borderRadius: 10 }}>★ Preferred</span>
                          )}
                          <span style={{ fontSize: 11, color: "var(--muted)", marginLeft: "auto" }}>
                            {isSel
                              ? [
                                  `${activeCount} active`,
                                  lockedCount  > 0 && `${lockedCount} PO exists`,
                                  removedCount > 0 && `${removedCount} removed`,
                                ].filter(Boolean).join(" · ")
                              : `${items.length} shortfall item${items.length !== 1 ? "s" : ""}`}
                          </span>
                        </div>
                        <div style={{ fontWeight: 600, fontSize: 14 }}>{v.business_name}</div>
                        <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 3, display: "flex", gap: 14, flexWrap: "wrap" }}>
                          {v.contact_person && <span>👤 {v.contact_person}</span>}
                          {v.phone && <span>📞 {v.phone}</span>}
                          {v.offer_price > 0 && <span>₹{Number(v.offer_price).toLocaleString("en-IN")}</span>}
                          {v.lead_time && <span>⏱ {v.lead_time}</span>}
                        </div>
                      </div>
                    </div>

                    {/* Item list — only when this vendor is selected */}
                    {isSel && (
                      <div style={{ borderTop: "1px solid var(--border)", background: "#fff" }}>
                        {items.map(item => {
                          const poInfo    = poItemsMap[item.item_code];
                          const isLocked  = !!poInfo;
                          const isRemoved = !isLocked && removed.has(item.item_code);
                          const qty       = item.shortfall_qty ?? item.still_needed;
                          return (
                            <div key={item.item_code} style={{
                              display: "flex", alignItems: "center", gap: 10,
                              padding: "8px 16px",
                              borderBottom: "1px solid var(--border)",
                              opacity: isLocked || isRemoved ? 0.55 : 1,
                              transition: "opacity 0.15s",
                              background: isLocked ? "#fffbeb" : "transparent",
                            }}>
                              <span style={{
                                fontFamily: "monospace", fontSize: 11, fontWeight: 600, flexShrink: 0,
                                background: isLocked ? "#fde68a" : isRemoved ? "var(--border)" : "#dbeafe",
                                color: isLocked ? "#92400e" : isRemoved ? "var(--muted)" : "#1d4ed8",
                                padding: "2px 6px", borderRadius: 4,
                              }}>{item.item_code}</span>
                              <span style={{
                                flex: 1, fontSize: 13, fontWeight: 500,
                                textDecoration: isRemoved ? "line-through" : "none",
                                color: isLocked || isRemoved ? "var(--muted)" : "var(--text)",
                              }}>{item.item_name}</span>
                              {isLocked ? (
                                <span style={{
                                  fontSize: 10, fontWeight: 700, flexShrink: 0,
                                  background: "#fef3c7", color: "#92400e",
                                  border: "1px solid #fcd34d",
                                  padding: "2px 7px", borderRadius: 10,
                                }}>
                                  PO: {poInfo.po_number} · {poInfo.status}
                                </span>
                              ) : (
                                <>
                                  <span style={{
                                    fontSize: 12, fontWeight: 700, flexShrink: 0,
                                    color: isRemoved ? "var(--muted)" : "#dc2626",
                                  }}>
                                    −{Number(qty).toLocaleString("en-IN")}
                                  </span>
                                  <button
                                    onClick={e => { e.stopPropagation(); toggleRemove(item.item_code); }}
                                    title={isRemoved ? "Restore to PO" : "Remove from this PO"}
                                    style={{
                                      background: "none", border: "none", cursor: "pointer",
                                      fontSize: 13, padding: "2px 6px", borderRadius: 4, flexShrink: 0,
                                      color: isRemoved ? "#16a34a" : "#dc2626", fontWeight: 700,
                                    }}>
                                    {isRemoved ? "↩" : "✕"}
                                  </button>
                                </>
                              )}
                            </div>
                          );
                        })}
                        {activeCount === 0 && lockedCount < items.length && (
                          <div style={{ padding: "10px 16px", fontSize: 12, color: "#b45309", background: "#fef9c3", textAlign: "center" }}>
                            All non-locked items removed — restore at least one to generate a PO
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {unlinked.length > 0 && (
              <div style={{ background: "#fef9c3", border: "1px solid #fcd34d", borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "#92400e", marginBottom: 16 }}>
                <div style={{ fontWeight: 700, marginBottom: 4 }}>
                  ⚠ {unlinked.length} item{unlinked.length !== 1 ? "s" : ""} with no vendor linked — order separately:
                </div>
                {unlinked.map(i => (
                  <div key={i.item_code} style={{ display: "flex", gap: 8, marginTop: 3, alignItems: "center" }}>
                    <span style={{ fontFamily: "monospace", fontSize: 11, background: "#fde68a", padding: "1px 5px", borderRadius: 3 }}>{i.item_code}</span>
                    <span>{i.item_name}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
          <button className="btn btn-ghost" onClick={onClose} disabled={generating}>Cancel</button>
          <button className="btn btn-primary" disabled={!canGenerate || generating}
            style={{ opacity: canGenerate && !generating ? 1 : 0.5 }}
            onClick={async () => {
              if (!selectedGroup) return;
              setGenerating(true);
              try {
                const body = {
                  vendor_code: selectedGroup.vendor.vendor_code,
                  items: activeItems.map(item => ({
                    item_code:  item.item_code,
                    item_name:  item.item_name,
                    quantity:   item.shortfall_qty ?? item.still_needed ?? 0,
                    unit_price: Number(item.offer_price) || 0,
                    unit:       item.unit || "",
                  })),
                };
                const r = await api.createPO(body);
                const blob = await api.downloadPO(r.po_id);
                downloadBlob(blob, `PO-${r.po_number.replace("/", "-")}.docx`);
                toast(`Combined PO #${r.po_number} generated and downloaded`);
                onClose();
              } catch (e) {
                toast(e.message, "error");
              } finally {
                setGenerating(false);
              }
            }}>
            {generating
              ? <span style={{ display: "flex", alignItems: "center", gap: 6 }}><span className="spinner" style={{ width: 14, height: 14 }} />Generating…</span>
              : "Generate Combined PO →"}
          </button>
        </div>
      </div>
    </div>
  );
}

function VendorSelectModal({ item, onClose, toast }) {
  const [vendors, setVendors]       = useState([]);
  const [loading, setLoading]       = useState(true);
  const [selected, setSelected]     = useState(null);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    api.getItemVendors()
      .then(d => {
        const entry = (d.data || []).find(iv => iv.item_code === item.item_code);
        setVendors(entry ? entry.vendors : []);
      })
      .catch(e => toast(e.message, "error"))
      .finally(() => setLoading(false));
  }, [item.item_code]);

  async function handleGeneratePO() {
    const selectedVendor = vendors.find(v => v.vendor_code === selected);
    if (!selectedVendor) return;
    setGenerating(true);
    try {
      const body = {
        vendor_code: selectedVendor.vendor_code,
        items: [{
          item_code:  item.item_code,
          item_name:  item.item_name,
          quantity:   shortfall,
          unit_price: Number(selectedVendor.offer_price) || 0,
          unit:       item.unit || "",
        }],
      };
      const r = await api.createPO(body);
      const blob = await api.downloadPO(r.po_id);
      downloadBlob(blob, `PO-${r.po_number.replace("/", "-")}.docx`);
      toast(`PO #${r.po_number} generated and downloaded`);
      onClose();
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setGenerating(false);
    }
  }

  const shortfall = item.still_needed ?? item.shortfall_qty;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 520, width: "95%", maxHeight: "90vh", overflowY: "auto" }}
        onClick={e => e.stopPropagation()}>

        <div className="modal-title">Order Vendors</div>

        {/* Item summary */}
        <div style={{ marginBottom: 16, padding: "10px 14px", background: "var(--border)", borderRadius: 8, fontSize: 13 }}>
          <div style={{ fontFamily: "monospace", fontWeight: 700, fontSize: 11, color: "var(--muted)", marginBottom: 2 }}>
            {item.item_code}
          </div>
          <div style={{ fontWeight: 600, fontSize: 14 }}>{item.item_name}</div>
          <div style={{ marginTop: 4, display: "flex", gap: 16, fontSize: 12, color: "var(--muted)", flexWrap: "wrap" }}>
            {item.required_qty !== undefined && (
              <span>Required: <strong style={{ color: "var(--fg)" }}>{Number(item.required_qty).toLocaleString("en-IN")}</strong></span>
            )}
            <span style={{ color: "#dc2626", fontWeight: 700 }}>
              Shortfall: −{Number(shortfall).toLocaleString("en-IN")}
            </span>
          </div>
        </div>

        {/* Vendor cards */}
        {loading ? (
          <div style={{ textAlign: "center", padding: 30 }}><div className="spinner" /></div>
        ) : vendors.length === 0 ? (
          <div style={{
            background: "#fef9c3", border: "1px solid #fcd34d",
            borderRadius: 8, padding: "14px 16px", fontSize: 13, color: "#92400e"
          }}>
            ⚠ No vendors are linked to this item. Go to the <strong>Item Vendors</strong> page to link vendors first.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
            {vendors.map(v => {
              const isSel = selected === v.vendor_code;
              return (
                <div key={v.vendor_code} onClick={() => setSelected(v.vendor_code)}
                  style={{
                    border: `2px solid ${isSel ? "var(--primary, #2563eb)" : "var(--border)"}`,
                    borderRadius: 10, padding: "12px 16px", cursor: "pointer",
                    background: isSel ? "#eff6ff" : "var(--bg-alt, #f8f9fa)",
                    transition: "all 0.15s", display: "flex", alignItems: "flex-start", gap: 12,
                  }}>
                  {/* Radio dot */}
                  <div style={{
                    width: 18, height: 18, borderRadius: "50%", flexShrink: 0, marginTop: 2,
                    border: `2px solid ${isSel ? "var(--primary, #2563eb)" : "var(--muted)"}`,
                    background: isSel ? "var(--primary, #2563eb)" : "transparent",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    {isSel && <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#fff" }} />}
                  </div>
                  {/* Info */}
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                      <span style={{
                        fontFamily: "monospace", fontWeight: 700, fontSize: 11,
                        background: isSel ? "#dbeafe" : "var(--border)",
                        color: isSel ? "#1d4ed8" : "var(--muted)",
                        padding: "2px 7px", borderRadius: 4,
                      }}>
                        {v.vendor_code}
                      </span>
                      {!!v.is_preferred && (
                        <span style={{ fontSize: 10, fontWeight: 700, color: "#b45309", background: "#fef3c7", padding: "1px 6px", borderRadius: 10 }}>
                          ★ Preferred
                        </span>
                      )}
                    </div>
                    <div style={{ fontWeight: 600, fontSize: 14, color: "var(--text)" }}>{v.business_name}</div>
                    <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 3, display: "flex", gap: 14, flexWrap: "wrap" }}>
                      {v.contact_person && <span>👤 {v.contact_person}</span>}
                      {v.phone && <span>📞 {v.phone}</span>}
                      {v.offer_price > 0 && <span>₹{Number(v.offer_price).toLocaleString("en-IN")}</span>}
                      {v.lead_time && <span>⏱ {v.lead_time}</span>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Footer */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
          <button className="btn btn-ghost" onClick={onClose} disabled={generating}>Cancel</button>
          <button className="btn btn-primary" disabled={!selected || generating} onClick={handleGeneratePO}
            style={{ opacity: selected && !generating ? 1 : 0.5 }}>
            {generating
              ? <span style={{ display: "flex", alignItems: "center", gap: 6 }}><span className="spinner" style={{ width: 14, height: 14 }} />Generating…</span>
              : "Generate PO →"}
          </button>
        </div>
      </div>
    </div>
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
  const [creatingDone, setCreatingDone] = useState(false);
  const [result, setResult] = useState(null);
  const [allocatedOpen, setAllocatedOpen] = useState(true);
  const [shortfallsOpen, setShortfallsOpen] = useState(true);
  const [perKitOpen, setPerKitOpen] = useState({});
  const [perKitSectionOpen, setPerKitSectionOpen] = useState({});
  const [history, setHistory] = useState([]);
  const [historyOpen, setHistoryOpen] = useState(true);
  const [generatingTxnFor, setGeneratingTxnFor] = useState(null);
  const [deployedTick, setDeployedTick] = useState(null); // kit_id currently showing the "Deployed!" tick

  // Kit detail modal
  const [selectedKit, setSelectedKit] = useState(null);
  const [kitDetail, setKitDetail] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  // Vendor select / PO modal
  const [poTarget, setPoTarget] = useState(null);
  const [combinedPOShortfalls, setCombinedPOShortfalls] = useState(null);

  // Items that already have an open PO (draft/sent) — keyed by item_code —
  // so shortfall rows can show "PO drafted" instead of letting the user
  // raise a duplicate order for the same item.
  const [activePOItems, setActivePOItems] = useState({});
  const loadActivePOItems = useCallback(() => {
    api.getActivePOItems().then(d => setActivePOItems(d.data || {})).catch(() => {});
  }, []);

  // Pending shortfalls panel (most recent partial kit)
  const [pendingKit, setPendingKit] = useState(null);
  const [pendingDetail, setPendingDetail] = useState(null);
  const [loadingPending, setLoadingPending] = useState(false);
  const [pendingDismissed, setPendingDismissed] = useState(false);
  const [completingKit, setCompletingKit] = useState(false);

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

        // Restore the most recently created kit's result view — without this,
        // navigating away and back to this page loses the just-created kit's
        // breakdown (it only lived in local state, not on the server).
        const mostRecent = rows.find(h => h.status !== "cancelled");
        if (mostRecent) {
          api.getKitDetails(mostRecent.kit_id)
            .then(details => {
              setResult(kitDetailsToResult(details));
              setPhase("result");
            })
            .catch(() => {});
        }
      })
      .catch(() => {});
  }, [loadPendingKit]);

  useEffect(() => { loadActivePOItems(); }, [loadActivePOItems]);

  // Re-fetch pending details whenever the user switches back to this tab.
  // Covers the common case: user goes to Stock Batches, adds stock, comes back.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        loadActivePOItems();
        if (pendingKit) {
          setLoadingPending(true);
          api.getKitDetails(pendingKit.kit_id)
            .then(data => setPendingDetail(data))
            .catch(() => {})
            .finally(() => setLoadingPending(false));
        }
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [pendingKit, loadActivePOItems]);

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

  const handleCompleteKit = async () => {
    if (!pendingKit) return;
    setCompletingKit(true);
    try {
      const data = await api.completeKit(pendingKit.kit_id);
      toast(
        data.status === "assembled"
          ? `Kit "${pendingKit.kit_name}" fully assembled!`
          : `Kit topped up — ${data.remaining_shortfalls.length} item(s) still short`
      );
      const refreshed = await api.getKitDetails(pendingKit.kit_id);
      setPendingDetail(refreshed);
      api.getKitHistory().then(d => {
        const rows = d.data || [];
        setHistory(rows);
        loadPendingKit(rows);
      }).catch(() => {});
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setCompletingKit(false);
    }
  };

  const handleGenerateTxn = async (kitRow) => {
    setGeneratingTxnFor(kitRow.kit_id);
    try {
      const data = await api.generateInventoryTxn(kitRow.kit_id);
      toast(`Inventory transaction #${data.id} generated (${data.row_count} rows${data.flagged_count ? `, ${data.flagged_count} flagged for review` : ""})`);
      setGeneratingTxnFor(null);
      setDeployedTick(kitRow.kit_id);
      const hist = await api.getKitHistory().catch(() => null);
      if (hist) setHistory(hist.data || []);
      setTimeout(() => {
        setDeployedTick(current => (current === kitRow.kit_id ? null : current));
      }, 1400);
    } catch (e) {
      toast(e.message, "error");
      setGeneratingTxnFor(null);
    }
  };

  // Shared "Deploy Kit" control — used in the Result phase header and the Kit
  // Detail modal. Deploying a kit means generating its Inventory Transaction
  // (the final packed report that pushes into Kits Information), so this is
  // literally the existing generate/view-transaction flow, just gated on
  // shortfalls being fully resolved and surfaced as an always-visible button
  // instead of only appearing once a kit reaches "assembled" in the history table.
  const renderDeployButton = (kitRow, shortfallCount, small = false) => {
    if (!isAdmin) return null;
    const historyEntry = history.find(h => h.kit_id === kitRow.kit_id);
    const hasTxn = historyEntry?.transaction_id;
    const isGenerating = generatingTxnFor === kitRow.kit_id;
    const justDeployed = deployedTick === kitRow.kit_id;
    const disabled = shortfallCount > 0;

    if (isGenerating || justDeployed) {
      return (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          {justDeployed ? (
            <span style={{
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              width: small ? 16 : 18, height: small ? 16 : 18, borderRadius: "50%",
              background: "#dcfce7", color: "#16a34a", fontSize: small ? 10 : 11,
              animation: "progressTickPop 0.3s ease",
            }}>
              ✓
            </span>
          ) : (
            <span className="spinner" style={{ width: small ? 12 : 14, height: small ? 12 : 14 }} />
          )}
          <span style={{
            fontSize: small ? 11 : 12, fontWeight: 700,
            color: justDeployed ? "#16a34a" : "var(--muted)", whiteSpace: "nowrap",
          }}>
            {justDeployed ? "Deployed!" : "Deploying…"}
          </span>
        </span>
      );
    }

    if (hasTxn) {
      return (
        <button
          className="btn btn-primary"
          onClick={() => navigate("/inventory-transactions")}
          style={{ fontSize: small ? 11 : 12, padding: small ? "2px 10px" : "4px 14px", whiteSpace: "nowrap" }}
          title={`Transaction #${historyEntry.transaction_id} (${historyEntry.transaction_status})`}
        >
          🚀 View Deployment →
        </button>
      );
    }
    return (
      <button
        className="btn btn-primary"
        disabled={disabled || isGenerating}
        title={disabled ? `Resolve ${shortfallCount} shortfall item(s) first` : ""}
        onClick={() => handleGenerateTxn(kitRow)}
        style={{
          fontSize: small ? 11 : 12, padding: small ? "2px 10px" : "4px 14px",
          whiteSpace: "nowrap", opacity: disabled ? 0.5 : 1,
        }}
      >
        {isGenerating ? "Deploying…" : "🚀 Deploy Kit →"}
      </button>
    );
  };

  // Shared "Order" cell — shows a disabled "PO drafted" badge instead of the
  // Order button when the item already has an open (draft/sent) PO, so the
  // user can see at a glance that ordering it again would be a duplicate.
  const renderOrderAction = (row, small = false) => {
    const poInfo = activePOItems[row.item_code];
    if (poInfo) {
      return (
        <span style={{
          fontSize: small ? 9 : 10, fontWeight: 700,
          color: "#92400e", background: "#fef3c7",
          border: "1px solid #fcd34d",
          padding: small ? "1px 5px" : "2px 7px", borderRadius: 10,
          whiteSpace: "nowrap", display: "inline-block",
        }}>
          PO: {poInfo.po_number} · {poInfo.status}
        </span>
      );
    }
    return (
      <button
        className="btn btn-ghost btn-sm"
        onClick={() => setPoTarget(row)}
        style={small ? { fontSize: 10, padding: "2px 6px", whiteSpace: "nowrap" } : undefined}
      >
        Order
      </button>
    );
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
    setPhase("creating");
    setCreating(true);
    setCreatingDone(false);
    try {
      const data = await api.createKit({ ...form, qty_kits: qty });
      setCreatingDone(true);
      api.getKitHistory().then(d => {
        const rows = d.data || [];
        setHistory(rows);
        loadPendingKit(rows);
      }).catch(() => {});
      await new Promise(r => setTimeout(r, 650)); // let the tick actually be seen
      setResult(data);
      setPerKitOpen({});
      setPerKitSectionOpen({});
      setPhase("result");
      if (data.status === "assembled") {
        toast(`Kit "${data.kit_name}" fully assembled! Kit ID: #${data.kit_id}`);
      } else {
        toast(`Kit "${data.kit_name}" created with shortfalls. Kit ID: #${data.kit_id}`, "error");
      }
    } catch (e) {
      toast(e.message, "error");
      setPhase("form");
    } finally {
      setCreating(false);
    }
  };

  const handleCreateAnother = () => {
    setForm(EMPTY_FORM);
    setResult(null);
    setPerKitOpen({});
    setPerKitSectionOpen({});
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
    const historyEntry = history.find(h => h.kit_id === kitInfo.kit_id);
    const isDeployed = !!historyEntry?.transaction_id;

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
              {isAdmin && !isCancelled && det && renderDeployButton(kitInfo, det.shortfalls?.length || 0, true)}
              {isAdmin && !isCancelled && !isDeployed && (
                <button
                  className="btn btn-ghost"
                  onClick={handleCancelKit}
                  disabled={cancelling}
                  style={{ color: "#dc2626", borderColor: "#fca5a5", fontSize: 13 }}
                >
                  {cancelling ? "Cancelling…" : "Cancel Kit"}
                </button>
              )}
              {isAdmin && !isCancelled && isDeployed && (
                <span style={{ fontSize: 12, color: "var(--muted)" }} title="Cancel is disabled once a kit is deployed">
                  Deployed — cannot cancel
                </span>
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
                    <div className="table-wrap" style={{ margin: 0, overflowX: "hidden" }}>
                      <table className="kit-alloc-table">
                        <colgroup>
                          <col style={{ width: "12%" }} />
                          <col style={{ width: "26%" }} />
                          <col style={{ width: "10%" }} />
                          <col style={{ width: "10%" }} />
                          <col style={{ width: "42%" }} />
                        </colgroup>
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
                    <div className="table-wrap" style={{ margin: 0, overflowX: "hidden" }}>
                      <table className="kit-alloc-table">
                        <colgroup>
                          <col style={{ width: "14%" }} />
                          <col style={{ width: "40%" }} />
                          <col style={{ width: "15%" }} />
                          <col style={{ width: "15%" }} />
                          <col style={{ width: "16%" }} />
                        </colgroup>
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
      <div style={{ flex: "2 1 480px", minWidth: 0 }}>
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
              display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap",
            }}>
              <span style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                {stillShort.length > 0 && (
                  <span style={{ color: "#dc2626" }}>⚠ {stillShort.length} still need ordering</span>
                )}
                {nowCoverable.length > 0 && (
                  <span style={{ color: "#15803d" }}>✓ {nowCoverable.length} now in stock</span>
                )}
              </span>
              {nowCoverable.length > 0 && (
                <button
                  className="btn btn-primary"
                  onClick={handleCompleteKit}
                  disabled={completingKit}
                  style={{ fontSize: 11, padding: "2px 10px", whiteSpace: "nowrap" }}
                >
                  {completingKit ? "Completing…" : "Complete Kit →"}
                </button>
              )}
              {stillShort.length > 0 && (
                <button
                  className="btn btn-ghost"
                  onClick={() => setCombinedPOShortfalls(stillShort)}
                  style={{ fontSize: 11, padding: "2px 10px", color: "#dc2626", borderColor: "#fca5a5", whiteSpace: "nowrap" }}
                >
                  Combined Order →
                </button>
              )}
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
                <table style={{ fontSize: 12, width: "100%", tableLayout: "fixed", borderCollapse: "collapse" }}>
                  <colgroup>
                    <col style={{ width: 95 }} />
                    <col />
                    <col style={{ width: 48 }} />
                    <col style={{ width: 58 }} />
                    <col style={{ width: 78 }} />
                    <col style={{ width: 52 }} />
                  </colgroup>
                  <thead>
                    <tr>
                      <th style={{ padding: "5px 8px" }}>Code</th>
                      <th style={{ padding: "5px 8px" }}>Item Name</th>
                      <th style={{ textAlign: "right", padding: "5px 8px" }}>Need</th>
                      <th style={{ textAlign: "right", padding: "5px 8px" }}>In Stock</th>
                      <th style={{ textAlign: "right", padding: "5px 8px" }}>Short</th>
                      <th style={{ padding: "5px 4px" }}></th>
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
                        <td style={{ padding: "5px 8px" }}>
                          <span style={{
                            fontFamily: "monospace", fontWeight: 600, fontSize: 10,
                            background: row.now_coverable ? "#dcfce7" : "#fee2e2",
                            color: row.now_coverable ? "#15803d" : "#dc2626",
                            padding: "1px 4px", borderRadius: 3,
                            display: "inline-block", maxWidth: "100%",
                            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                          }}>
                            {row.item_code}
                          </span>
                        </td>
                        <td style={{ padding: "5px 8px", fontWeight: 500, whiteSpace: "normal", wordBreak: "break-word", lineHeight: 1.4 }}>
                          {row.item_name}
                        </td>
                        <td style={{ textAlign: "right", padding: "5px 8px", whiteSpace: "nowrap" }}>
                          {Number(row.shortfall_qty).toLocaleString("en-IN")}
                        </td>
                        <td style={{ textAlign: "right", padding: "5px 8px", fontWeight: 600, whiteSpace: "nowrap",
                          color: row.now_coverable ? "#15803d" : (row.current_available > 0 ? "#b45309" : "var(--muted)"),
                        }}>
                          {Number(row.current_available).toLocaleString("en-IN")}
                        </td>
                        <td style={{ textAlign: "right", padding: "5px 4px" }}>
                          {row.now_coverable ? (
                            <span style={{
                              fontWeight: 700, color: "#15803d", background: "#dcfce7",
                              padding: "1px 5px", borderRadius: 6, fontSize: 10, whiteSpace: "nowrap",
                            }}>
                              ✓ Ready
                            </span>
                          ) : (
                            <span style={{
                              fontWeight: 700, color: "#dc2626", background: "#fee2e2",
                              padding: "1px 5px", borderRadius: 6, fontSize: 10, whiteSpace: "nowrap",
                            }}>
                              −{Number(row.still_needed).toLocaleString("en-IN")}
                            </span>
                          )}
                        </td>
                        <td style={{ padding: "5px 4px", textAlign: "center" }}>
                          {!row.now_coverable && renderOrderAction(row, true)}
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
            <div className="table-wrap" style={{ margin: 0, overflowX: "auto" }}>
              <table style={{ minWidth: 600 }}>
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
                          <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                            <button
                              className="btn btn-ghost btn-sm"
                              onClick={() => handleViewKit(h)}
                              style={{ fontSize: 12, padding: "3px 10px" }}
                            >
                              View
                            </button>
                            {isAdmin && h.status === "assembled" && (
                              h.transaction_id ? (
                                <button
                                  className="btn btn-ghost btn-sm"
                                  onClick={() => navigate("/inventory-transactions")}
                                  style={{ fontSize: 12, padding: "3px 10px" }}
                                  title={`Transaction #${h.transaction_id} (${h.transaction_status})`}
                                >
                                  🧾 View Txn
                                </button>
                              ) : (
                                <button
                                  className="btn btn-primary btn-sm"
                                  onClick={() => handleGenerateTxn(h)}
                                  disabled={generatingTxnFor === h.kit_id}
                                  style={{ fontSize: 12, padding: "3px 10px" }}
                                >
                                  {generatingTxnFor === h.kit_id ? "Generating…" : "🧾 Generate Transaction"}
                                </button>
                              )
                            )}
                          </div>
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
        {poTarget && (
          <VendorSelectModal item={poTarget} onClose={() => { setPoTarget(null); loadActivePOItems(); }} toast={toast} />
        )}
        {combinedPOShortfalls && (
          <CombinedOrderModal shortfalls={combinedPOShortfalls} onClose={() => { setCombinedPOShortfalls(null); loadActivePOItems(); }} toast={toast} />
        )}

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
          flexWrap: "wrap",
        }}>
          {/* Left: form */}
          <div style={{ flex: "1 1 340px", maxWidth: 520, minWidth: 0 }}>
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

  if (phase === "creating") {
    return (
      <div style={{
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        minHeight: 360, gap: 4,
      }}>
        <ProgressLoader
          active={creating}
          done={creatingDone}
          label={`Assembling "${form.kit_name}"…`}
          doneLabel="Kit assembled!"
        />
      </div>
    );
  }

  // ── Result phase ──────────────────────────────────────────────────────────
  const numKits = result.qty_kits;
  const isMulti = numKits > 1;
  const perKitBuckets = isMulti ? splitRowsPerKit(result.allocated, result.shortfalls, numKits) : null;

  return (
    <>
      <KitDetailModal />
      {poTarget && (
        <VendorSelectModal item={poTarget} onClose={() => { setPoTarget(null); loadActivePOItems(); }} toast={toast} />
      )}
      {combinedPOShortfalls && (
        <CombinedOrderModal shortfalls={combinedPOShortfalls} onClose={() => { setCombinedPOShortfalls(null); loadActivePOItems(); }} toast={toast} />
      )}

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
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {renderDeployButton(result, result.shortfalls?.length || 0)}
          <button className="btn btn-ghost" onClick={handleCreateAnother}>
            ← Create Another Kit
          </button>
        </div>
      </div>

      {/* Per-Kit Breakdown — only when more than one kit was requested */}
      {isMulti && (
        <div style={{ marginBottom: 24 }}>
          <div style={{
            fontSize: 12, fontWeight: 700, color: "var(--muted)",
            textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 12,
          }}>
            Per-Kit Breakdown
          </div>
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
            gap: 14,
          }}>
            {perKitBuckets.map((bucket, idx) => {
              const isOpen = !!perKitOpen[idx];
              const hasShort = bucket.shortfalls.length > 0;
              const borderColor = hasShort ? "#fca5a5" : "#86efac";
              return (
                <div key={idx} style={{
                  border: `1.5px solid ${borderColor}`, borderRadius: 12,
                  overflow: "hidden", background: "var(--surface)",
                }}>
                  <button
                    onClick={() => setPerKitOpen(p => ({ ...p, [idx]: !p[idx] }))}
                    style={{
                      width: "100%", display: "flex", alignItems: "center", gap: 10,
                      padding: "12px 14px",
                      background: hasShort ? "#fff7f7" : "#f0fdf4",
                      border: "none", cursor: "pointer", textAlign: "left",
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 14, color: "var(--text)" }}>
                        {result.kit_name} {idx + 1}
                      </div>
                      <div style={{ fontSize: 11, marginTop: 3, display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {hasShort ? (
                          <span style={{ color: "#dc2626", fontWeight: 700 }}>
                            ⚠ {bucket.shortfalls.length} shortfall{bucket.shortfalls.length !== 1 ? "s" : ""}
                          </span>
                        ) : (
                          <span style={{ color: "#15803d", fontWeight: 700 }}>✓ Fully Allocated</span>
                        )}
                        <span style={{ color: "var(--muted)" }}>· {bucket.allocated.length} allocated</span>
                      </div>
                    </div>
                    <span style={{
                      fontSize: 14, color: hasShort ? "#dc2626" : "#16a34a", fontWeight: 700,
                      transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
                      transition: "transform 0.2s", flexShrink: 0,
                    }}>
                      ▾
                    </span>
                  </button>

                  {isOpen && (
                    <div style={{ borderTop: `1px solid ${borderColor}` }}>
                      {bucket.allocated.length > 0 && (() => {
                        const key = `${idx}-allocated`;
                        const sectionOpen = !!perKitSectionOpen[key];
                        return (
                          <div style={{ borderBottom: bucket.shortfalls.length > 0 ? "1px solid var(--border)" : "none" }}>
                            <button
                              onClick={() => setPerKitSectionOpen(p => ({ ...p, [key]: !p[key] }))}
                              style={{
                                width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
                                background: "none", border: "none", cursor: "pointer",
                                padding: "8px 14px", fontSize: 12, fontWeight: 700, color: "#15803d",
                              }}
                            >
                              <span>Allocated ({bucket.allocated.length})</span>
                              <span style={{ transform: sectionOpen ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>▾</span>
                            </button>
                            {sectionOpen && (
                              <div style={{ display: "flex", flexDirection: "column", gap: 4, padding: "0 14px 10px" }}>
                                {bucket.allocated.map(row => (
                                  <div key={row.item_code} style={{
                                    display: "flex", justifyContent: "space-between", gap: 8,
                                    fontSize: 12, padding: "4px 8px", background: "#f0fdf4", borderRadius: 6,
                                  }}>
                                    <span style={{ fontWeight: 500 }}>
                                      {!!row.is_subkit && <span title="Sub-kit">🧩 </span>}{row.item_name}
                                    </span>
                                    <span style={{ color: "#16a34a", fontWeight: 700, flexShrink: 0 }}>
                                      {row.allocated_qty}/{row.required_qty}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })()}
                      {bucket.shortfalls.length > 0 && (() => {
                        const key = `${idx}-shortfall`;
                        const sectionOpen = !!perKitSectionOpen[key];
                        return (
                          <div>
                            <button
                              onClick={() => setPerKitSectionOpen(p => ({ ...p, [key]: !p[key] }))}
                              style={{
                                width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
                                background: "none", border: "none", cursor: "pointer",
                                padding: "8px 14px", fontSize: 12, fontWeight: 700, color: "#dc2626",
                              }}
                            >
                              <span>Shortfall ({bucket.shortfalls.length})</span>
                              <span style={{ transform: sectionOpen ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>▾</span>
                            </button>
                            {sectionOpen && (
                              <div style={{ display: "flex", flexDirection: "column", gap: 4, padding: "0 14px 10px" }}>
                                {bucket.shortfalls.map(row => (
                                  <div key={row.item_code} style={{
                                    display: "flex", justifyContent: "space-between", gap: 8,
                                    fontSize: 12, padding: "4px 8px", background: "#fff7f7", borderRadius: 6,
                                  }}>
                                    <span style={{ fontWeight: 500 }}>
                                      {!!row.is_subkit && <span title="Sub-kit">🧩 </span>}{row.item_name}
                                    </span>
                                    <span style={{ color: "#dc2626", fontWeight: 700, flexShrink: 0 }}>
                                      −{row.shortfall_qty} (got {row.allocated_qty}/{row.required_qty})
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Allocated Items — collapsible (single-kit view only; per-kit cards above cover the multi-kit case) */}
      {!isMulti && result.allocated?.length > 0 && (
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
              <div className="table-wrap" style={{ margin: 0, overflowX: "hidden", maxHeight: 420, overflowY: "auto" }}>
                <table className="kit-alloc-table">
                  <colgroup>
                    <col style={{ width: "12%" }} />
                    <col style={{ width: "44%" }} />
                    <col style={{ width: "12%" }} />
                    <col style={{ width: "12%" }} />
                    <col style={{ width: "20%" }} />
                  </colgroup>
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
              flexWrap: "wrap",
            }}
          >
            <div style={{ width: 4, height: 20, background: "#dc2626", borderRadius: 2, flexShrink: 0 }} />
            <span style={{ fontWeight: 700, fontSize: 15, color: "#dc2626", flex: 1 }}>
              {isMulti ? "Combined Shortfalls — All Kits" : "Shortfall Items"}
            </span>
            <span style={{
              fontSize: 12, color: "#dc2626", fontWeight: 600,
              background: "#fee2e2", padding: "2px 10px", borderRadius: 12, marginRight: 4,
            }}>
              {result.shortfalls.length} items need ordering
            </span>
            <button
              className="btn btn-ghost"
              style={{ fontSize: 12, padding: "4px 12px", marginRight: 4, color: "#dc2626", borderColor: "#fca5a5" }}
              onClick={e => { e.stopPropagation(); setCombinedPOShortfalls(result.shortfalls); }}
            >
              Combined Order →
            </button>
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
              <div className="table-wrap" style={{ margin: 0, overflowX: "hidden", maxHeight: 420, overflowY: "auto" }}>
                <table className="kit-alloc-table">
                  <colgroup>
                    <col style={{ width: "11%" }} />
                    <col style={{ width: "31%" }} />
                    <col style={{ width: "11%" }} />
                    <col style={{ width: "11%" }} />
                    <col style={{ width: "12%" }} />
                    <col style={{ width: "24%" }} />
                  </colgroup>
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
                          {renderOrderAction(row)}
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
