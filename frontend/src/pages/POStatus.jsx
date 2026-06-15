import { useState, useEffect } from "react";
import { api, downloadBlob } from "../api";
import { useToast } from "../components/Toast";
import { useAuth } from "../hooks/useAuth";

const STATUS_STYLE = {
  draft:     { color: "#6b7280", bg: "#f3f4f6",  label: "Draft" },
  sent:      { color: "#1d4ed8", bg: "#dbeafe",  label: "Sent" },
  received:  { color: "#15803d", bg: "#dcfce7",  label: "Received" },
  cancelled: { color: "#dc2626", bg: "#fee2e2",  label: "Cancelled" },
};

export default function POStatus() {
  const { user } = useAuth();
  const { toast } = useToast();
  const isAdmin = ["admin", "superadmin"].includes(user?.role);

  const [pos, setPOs]           = useState([]);
  const [loading, setLoading]   = useState(true);
  const [downloading, setDownloading] = useState(null);
  const [cancelling, setCancelling]   = useState(null);

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
                const s = STATUS_STYLE[po.status] || STATUS_STYLE.draft;
                return (
                  <tr key={po.id}>
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
                    <td>
                      <div className="flex gap-2">
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => handleDownload(po)}
                          disabled={downloading === po.id}
                          style={{ fontSize: 12, whiteSpace: "nowrap" }}
                        >
                          {downloading === po.id ? "…" : "↓ DOCX"}
                        </button>
                        {isAdmin && po.status === "sent" && (
                          <button
                            className="btn btn-danger btn-sm"
                            onClick={() => handleCancel(po)}
                            disabled={cancelling === po.id}
                            style={{ fontSize: 12, whiteSpace: "nowrap" }}
                          >
                            {cancelling === po.id ? "…" : "Cancel"}
                          </button>
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
  );
}
