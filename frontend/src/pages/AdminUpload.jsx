import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { useToast } from "../components/Toast";

export default function AdminUpload() {
  const { toast } = useToast();
  const fileRef = useRef();
  const [kitName, setKitName] = useState("");
  const [file, setFile] = useState(null);
  const [drag, setDrag] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [kits, setKits] = useState([]);
  const [deleting, setDeleting] = useState(null);

  const loadKits = () => {
    api.adminKits()
      .then(d => setKits(d.data))
      .catch(() => {});
  };

  useEffect(() => { loadKits(); }, []);

  const handleDrop = (e) => {
    e.preventDefault();
    setDrag(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) setFile(dropped);
  };

  const handleUpload = async () => {
    if (!file || !kitName.trim()) {
      toast("Kit name and file are required", "error");
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("kit_name", kitName.trim());
      fd.append("file", file);
      const res = await api.uploadExcel(fd);
      toast(res.msg);
      setFile(null);
      setKitName("");
      if (fileRef.current) fileRef.current.value = "";
      loadKits();
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (kitName) => {
    if (!confirm(`Delete kit "${kitName}" and all its data?`)) return;
    setDeleting(kitName);
    try {
      const res = await api.deleteKit(kitName);
      toast(res.msg);
      loadKits();
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setDeleting(null);
    }
  };

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-title">Upload Excel</div>
          <div className="page-sub">Upload a kit Excel file — existing data for the same kit name will be replaced</div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, alignItems: "start" }}>

        {/* Upload form */}
        <div className="card">
          <div className="card-title">New Upload</div>

          <div className="form-group">
            <label className="form-label">Kit Name</label>
            <input
              className="form-input"
              placeholder="e.g. MedKit-Alpha"
              value={kitName}
              onChange={e => setKitName(e.target.value)}
            />
          </div>

          {/* Dropzone */}
          <div
            className={`dropzone ${drag ? "drag" : ""}`}
            onClick={() => fileRef.current?.click()}
            onDragOver={e => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={handleDrop}
            style={{ marginBottom: 16 }}
          >
            <div className="dropzone-icon">📂</div>
            {file
              ? <><strong style={{ color: "var(--text)" }}>{file.name}</strong><br /><span style={{ fontSize: 11 }}>{(file.size / 1024).toFixed(1)} KB</span></>
              : <><p>Drop Excel file here</p><p style={{ fontSize: 11, marginTop: 4 }}>.xlsx / .xls / .csv — max 20MB</p></>
            }
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              style={{ display: "none" }}
              onChange={e => setFile(e.target.files[0])}
            />
          </div>

          <button
            className="btn btn-primary"
            style={{ width: "100%", justifyContent: "center" }}
            onClick={handleUpload}
            disabled={uploading || !file || !kitName.trim()}
          >
            {uploading
              ? <><span className="spinner" style={{ width: 14, height: 14 }} /> Uploading…</>
              : "↑ Upload & Process"}
          </button>
        </div>

        {/* Existing kits */}
        <div className="card">
          <div className="card-title">Uploaded Kits ({kits.length})</div>

          {kits.length === 0 ? (
            <div className="empty-state" style={{ padding: "30px 0" }}>
              <div className="empty-icon">📦</div>
              <p>No kits uploaded yet</p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {kits.map(kit => (
                <div
                  key={kit._id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "10px 14px",
                    background: "var(--bg)",
                    borderRadius: "var(--radius)",
                    border: "1px solid var(--border)"
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 500 }}>{kit.kitName}</div>
                    <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>
                      {kit.rowCount} rows · {kit.originalFile} ·{" "}
                      {new Date(kit.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                  <button
                    className="btn btn-danger btn-sm"
                    onClick={() => handleDelete(kit.kitName)}
                    disabled={deleting === kit.kitName}
                  >
                    {deleting === kit.kitName ? "…" : "Delete"}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>

      {/* Column mapping guide */}
      <div className="card" style={{ marginTop: 24 }}>
        <div className="card-title">Expected Excel Columns</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {["CUBE","BOX","ITEMS","BRAND","OEM","TYPE / ITEM TYPE","EXPIRY","BATCH / BATCH NO","DOC / DOCUMENT","LINK"].map(col => (
            <span key={col} className="tag tag-blue">{col}</span>
          ))}
        </div>
        <p style={{ marginTop: 12, fontSize: 12, color: "var(--muted)" }}>
          Column names are case-insensitive. Missing columns are safely ignored.
          Uploading the same kit name again will overwrite the existing data.
        </p>
      </div>
    </>
  );
}
