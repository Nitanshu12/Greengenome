import { useEffect, useState, useCallback } from "react";
import { api, downloadBlob } from "../api";
import { useToast } from "../components/Toast";

export default function Packages() {
  const { toast } = useToast();

  const [kits, setKits]               = useState([]);
  const [selectedKit, setSelectedKit] = useState(null);
  const [rows, setRows]               = useState([]);
  const [loadingKits, setLoadingKits] = useState(true);
  const [loadingRows, setLoadingRows] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [search, setSearch]           = useState("");

  // ── Load kit list on mount ──────────────────────────────────
  useEffect(() => {
    setLoadingKits(true);
    api.getKits()
      .then(d => {
        const list = d.kits || [];
        setKits(list);
        // Auto-select first kit if available
        if (list.length > 0) {
          setSelectedKit(list[0]);
        } else {
          setLoadingKits(false);
        }
      })
      .catch(e => {
        toast(e.message, "error");
        setLoadingKits(false);
      });
  }, []);

  // ── Load rows whenever selectedKit changes ──────────────────
  const loadKitData = useCallback((kitName) => {
    if (!kitName) return;

    // Clear old data immediately so user never sees stale rows
    setRows([]);
    setSearch("");
    setLoadingRows(true);

    api.getKitData(kitName)
      .then(d => {
        setRows(d.data || []);
      })
      .catch(e => {
        toast(e.message, "error");
        setRows([]);
      })
      .finally(() => {
        setLoadingRows(false);
        setLoadingKits(false);
      });
  }, []);

  useEffect(() => {
    if (selectedKit) loadKitData(selectedKit);
  }, [selectedKit]);

  // ── Switch kit ──────────────────────────────────────────────
  const switchKit = (name) => {
    if (name === selectedKit) return; // already selected
    setSelectedKit(name);
  };

  // ── Download ────────────────────────────────────────────────
  const handleDownload = async () => {
    if (!selectedKit) return;
    setDownloading(true);
    try {
      const blob = await api.downloadKit(selectedKit);
      downloadBlob(blob, `${selectedKit}.xlsx`);
      toast("Downloaded successfully");
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setDownloading(false);
    }
  };

  // ── Search filter ────────────────────────────────────────────
  const filtered = rows.filter(r =>
    !search ||
    Object.values(r).some(v =>
      String(v).toLowerCase().includes(search.toLowerCase())
    )
  );

  // ── Expiry helpers ───────────────────────────────────────────
  const isExpired = (expiry) => {
    if (!expiry) return false;
    try { return new Date(expiry) < new Date(); } catch { return false; }
  };

  const isWarning = (expiry) => {
    if (!expiry) return false;
    try {
      const d   = new Date(expiry);
      const now = new Date();
      const in30 = new Date();
      in30.setDate(now.getDate() + 30);
      return d >= now && d <= in30;
    } catch { return false; }
  };

  // ── Full page loader (first visit) ──────────────────────────
  if (loadingKits) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 400, gap: 16 }}>
        <div className="spinner" />
        <p style={{ color: "var(--muted)", fontFamily: "var(--mono)", fontSize: 13 }}>Loading kits…</p>
      </div>
    );
  }

  // ── No kits uploaded yet ─────────────────────────────────────
  if (kits.length === 0) {
    return (
      <>
        <div className="page-header">
          <div>
            <div className="page-title">Packages</div>
            <div className="page-sub">No kits available yet</div>
          </div>
        </div>
        <div className="empty-state">
          <div className="empty-icon">📦</div>
          <p style={{ fontWeight: 600, marginBottom: 6 }}>No kits uploaded yet</p>
          <p style={{ fontSize: 12, color: "var(--muted)" }}>Ask an admin to upload an Excel file.</p>
        </div>
      </>
    );
  }

  return (
    <>
      {/* ── Page header ── */}
      <div className="page-header">
        <div>
          <div className="page-title">Packages</div>
          <div className="page-sub">
            {loadingRows
              ? "Loading data…"
              : selectedKit
                ? `${filtered.length} of ${rows.length} rows — ${selectedKit}`
                : "Select a kit"}
          </div>
        </div>
        {selectedKit && (
          <button
            className="btn btn-primary"
            onClick={handleDownload}
            disabled={downloading || loadingRows || rows.length === 0}
          >
            {downloading
              ? <><span className="spinner" style={{ width: 14, height: 14 }} /> Downloading…</>
              : "↓ Download Excel"}
          </button>
        )}
      </div>

      {/* ── Kit selector pills ── */}
      <div className="kit-pills">
        {kits.map(k => (
          <button
            key={k}
            className={`kit-pill ${selectedKit === k ? "active" : ""}`}
            onClick={() => switchKit(k)}
            disabled={loadingRows}
          >
            {k}
          </button>
        ))}
      </div>

      {/* ── Search bar ── */}
      {!loadingRows && rows.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <input
            className="form-input"
            style={{ maxWidth: 340 }}
            placeholder="Search anything in table…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      )}

      {/* ── Loading rows spinner ── */}
      {loadingRows ? (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 80, gap: 16 }}>
          <div className="spinner" />
          <p style={{ color: "var(--muted)", fontFamily: "var(--mono)", fontSize: 13 }}>
            Loading {selectedKit}…
          </p>
        </div>

      /* ── Empty kit ── */
      ) : rows.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📄</div>
          <p>No data found for <strong>{selectedKit}</strong></p>
        </div>

      /* ── Table ── */
      ) : (
        <>
          {/* No search results */}
          {filtered.length === 0 && search && (
            <div className="empty-state" style={{ padding: "40px 0" }}>
              <div className="empty-icon">🔍</div>
              <p>No results for "<strong>{search}</strong>"</p>
              <button
                className="btn btn-ghost btn-sm"
                style={{ marginTop: 12 }}
                onClick={() => setSearch("")}
              >
                Clear search
              </button>
            </div>
          )}

          {filtered.length > 0 && (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Cube</th>
                    <th>Box</th>
                    <th>Items</th>
                    <th>Brand</th>
                    <th>OEM</th>
                    <th>Type</th>
                    <th>Expiry</th>
                    <th>Batch No</th>
                    <th>Document</th>
                    <th>Link</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r, i) => (
                    <tr key={r._id || i}>
                      {/* <td style={{ color: "var(--muted)", textAlign: "right" }}>
                        {r.rowNo ?? i + 1}
                      </td> */}
                      <td>{r.cube || "—"}</td>
                      <td>{r.box || "—"}</td>
                      <td>{r.items || "—"}</td>
                      <td>{r.brand || "—"}</td>
                      <td>{r.oem || "—"}</td>
                      <td>{r.itemType || "—"}</td>

                      {/* Expiry with colour tag */}
                      <td>
                        {r.expiry ? (
                          <span className={`tag ${
                            isExpired(r.expiry)
                              ? "tag-red"
                              : isWarning(r.expiry)
                                ? "tag-amber"
                                : "tag-green"
                          }`}>
                            {r.expiry}
                          </span>
                        ) : "—"}
                      </td>

                      <td>{r.batchNo || "—"}</td>
                      <td>{r.document || "—"}</td>

                      {/* Link */}
                      <td className="td-link">
                        {r.link
                          ? <a href={r.link} target="_blank" rel="noreferrer">↗ Open</a>
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </>
  );
}