import { useEffect, useState } from "react";
import { api, downloadBlob } from "../api";
import { useToast } from "../components/Toast";

export default function Packages() {
  const { toast } = useToast();
  const [kits, setKits] = useState([]);
  const [selectedKit, setSelectedKit] = useState(null);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [search, setSearch] = useState("");

  // Load kit list
  useEffect(() => {
    api.getKits()
      .then(d => {
        setKits(d.kits);
        if (d.kits.length > 0) setSelectedKit(d.kits[0]);
      })
      .catch(e => toast(e.message, "error"));
  }, []);

  // Load rows when kit changes
  useEffect(() => {
    if (!selectedKit) return;
    setLoading(true);
    setSearch("");
    api.getKitData(selectedKit)
      .then(d => setRows(d.data))
      .catch(e => toast(e.message, "error"))
      .finally(() => setLoading(false));
  }, [selectedKit]);

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

  // Filter rows by search
  const filtered = rows.filter(r =>
    !search || Object.values(r).some(v =>
      String(v).toLowerCase().includes(search.toLowerCase())
    )
  );

  const isExpired = (expiry) => {
    if (!expiry) return false;
    try { return new Date(expiry) < new Date(); } catch { return false; }
  };

  const isWarning = (expiry) => {
    if (!expiry) return false;
    try {
      const d = new Date(expiry);
      const in30 = new Date();
      in30.setDate(in30.getDate() + 30);
      return d >= new Date() && d <= in30;
    } catch { return false; }
  };

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-title">Packages</div>
          <div className="page-sub">
            {selectedKit
              ? `${filtered.length} of ${rows.length} rows — ${selectedKit}`
              : "Select a kit to view data"}
          </div>
        </div>
        {selectedKit && (
          <button
            className="btn btn-primary"
            onClick={handleDownload}
            disabled={downloading || !rows.length}
          >
            {downloading
              ? <><span className="spinner" style={{ width: 14, height: 14 }} /> Downloading…</>
              : "↓ Download Excel"}
          </button>
        )}
      </div>

      {/* Kit selector pills */}
      {kits.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📦</div>
          <p>No kits available. Ask an admin to upload an Excel file.</p>
        </div>
      ) : (
        <>
          <div className="kit-pills">
            {kits.map(k => (
              <button
                key={k}
                className={`kit-pill ${selectedKit === k ? "active" : ""}`}
                onClick={() => setSelectedKit(k)}
              >
                {k}
              </button>
            ))}
          </div>

          {/* Search */}
          {rows.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <input
                className="form-input"
                style={{ maxWidth: 320 }}
                placeholder="Search in table…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
          )}

          {/* Table */}
          {loading ? (
            <div style={{ textAlign: "center", padding: 60 }}>
              <div className="spinner" />
            </div>
          ) : rows.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">📄</div>
              <p>No data for this kit.</p>
            </div>
          ) : (
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
                    <tr key={i}>
                      <td>{r.cube}</td>
                      <td>{r.box}</td>
                      <td>{r.items}</td>
                      <td>{r.brand}</td>
                      <td>{r.oem}</td>
                      <td>{r.itemType}</td>
                      <td>
                        {r.expiry ? (
                          <span className={`tag ${isExpired(r.expiry) ? "tag-red" : isWarning(r.expiry) ? "tag-amber" : "tag-green"}`}>
                            {r.expiry}
                          </span>
                        ) : "—"}
                      </td>
                      <td>{r.batchNo}</td>
                      <td>{r.document}</td>
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
