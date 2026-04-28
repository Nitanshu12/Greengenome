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
  const [currentPage, setCurrentPage] = useState(1);
  const ROWS_PER_PAGE = 20;

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
    setCurrentPage(1);
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

  // ── Pagination ───────────────────────────────────────────────
  const totalPages  = Math.max(1, Math.ceil(filtered.length / ROWS_PER_PAGE));
  const safePage    = Math.min(currentPage, totalPages);
  const pageStart   = (safePage - 1) * ROWS_PER_PAGE;
  const paginated   = filtered.slice(pageStart, pageStart + ROWS_PER_PAGE);

  const goToPage = (p) => setCurrentPage(Math.max(1, Math.min(p, totalPages)));

  // ── Expiry helpers ───────────────────────────────────────────
  const parseExpiryDate = (expiry) => {
    if (!expiry) return null;
    
    if (!isNaN(expiry) && Number(expiry) > 10000) {
      const d = new Date(1899, 11, 30);
      d.setDate(d.getDate() + Number(expiry));
      return d;
    }

    let d = new Date(expiry);
    if (isNaN(d.getTime())) return null;
    
    if (d.getFullYear() > 9999) {
      const excelSerial = d.getFullYear();
      d = new Date(1899, 11, 30);
      d.setDate(d.getDate() + excelSerial);
    }
    return d;
  };

  const isExpired = (expiry) => {
    const d = parseExpiryDate(expiry);
    if (!d) return false;
    return d < new Date();
  };

  const isWarning = (expiry) => {
    const d = parseExpiryDate(expiry);
    if (!d) return false;
    const now = new Date();
    const in30 = new Date();
    in30.setDate(now.getDate() + 30);
    return d >= now && d <= in30;
  };

  const formatExpiry = (expiry) => {
    const d = parseExpiryDate(expiry);
    if (!d) return expiry || "—";
    
    // const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yy = String(d.getFullYear()).slice(-2);
    return `${mm}-${yy}`;
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
          <div className="page-title">Disaster Preparedness Platform</div>
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
            onChange={e => { setSearch(e.target.value); setCurrentPage(1); }}
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
            <>
              <div className="table-wrap pkg-table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>#</th>
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
                    {paginated.map((r, i) => (
                      <tr key={r._id || (pageStart + i)}>
                        <td style={{ color: "var(--muted)", textAlign: "right", minWidth: 40 }}>
                          {pageStart + i + 1}
                        </td>
                        <td>{r.cube || "NA"}</td>
                        <td>{r.box || "NA"}</td>
                        <td>{r.items || "NA"}</td>
                        <td>{r.brand || "NA"}</td>
                        <td>{r.oem || "NA"}</td>
                        <td>{r.itemType || "NA"}</td>

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
                              {formatExpiry(r.expiry)}
                            </span>
                          ) : "NA"}
                        </td>

                        <td>{r.batchNo || "NA"}</td>
                        <td>{r.document || "NA"}</td>

                        {/* Link */}
                        <td className="td-link">
                          {r.link
                            ? <a href={r.link} target="_blank" rel="noreferrer">↗ Open</a>
                            : "NA"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* ── Pagination bar ── */}
              {totalPages > 1 && (
                <div className="pagination-bar">
                  <span className="pagination-info">
                    Showing {pageStart + 1}–{Math.min(pageStart + ROWS_PER_PAGE, filtered.length)} of {filtered.length} rows
                  </span>

                  <div className="pagination-controls">
                    <button
                      className="pg-btn"
                      onClick={() => goToPage(1)}
                      disabled={safePage === 1}
                      title="First page"
                    >«</button>

                    <button
                      className="pg-btn"
                      onClick={() => goToPage(safePage - 1)}
                      disabled={safePage === 1}
                      title="Previous page"
                    >‹</button>

                    {/* Page number pills */}
                    {Array.from({ length: totalPages }, (_, idx) => idx + 1)
                      .filter(p =>
                        p === 1 ||
                        p === totalPages ||
                        Math.abs(p - safePage) <= 2
                      )
                      .reduce((acc, p, i, arr) => {
                        if (i > 0 && p - arr[i - 1] > 1) acc.push("…");
                        acc.push(p);
                        return acc;
                      }, [])
                      .map((p, idx) =>
                        p === "…" ? (
                          <span key={`ellipsis-${idx}`} className="pg-ellipsis">…</span>
                        ) : (
                          <button
                            key={p}
                            className={`pg-btn ${safePage === p ? "pg-active" : ""}`}
                            onClick={() => goToPage(p)}
                          >{p}</button>
                        )
                      )
                    }

                    <button
                      className="pg-btn"
                      onClick={() => goToPage(safePage + 1)}
                      disabled={safePage === totalPages}
                      title="Next page"
                    >›</button>

                    <button
                      className="pg-btn"
                      onClick={() => goToPage(totalPages)}
                      disabled={safePage === totalPages}
                      title="Last page"
                    >»</button>
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}
    </>
  );
}