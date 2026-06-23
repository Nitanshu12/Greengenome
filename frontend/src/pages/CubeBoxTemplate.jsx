import { useEffect, useState, useCallback, useMemo } from "react";
import { api } from "../api";
import { useAuth } from "../hooks/useAuth";
import { useToast } from "../components/Toast";

const EMPTY_FORM = { cube_no: "", box_no: "", item_code: "", qty: "1" };

function RowFormModal({ isEdit, initial, items, onSave, onClose, saving }) {
  const [form, setForm] = useState(initial || EMPTY_FORM);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 480, width: "95%" }} onClick={e => e.stopPropagation()}>
        <div className="modal-title">{isEdit ? "Edit Box Item" : "Add Box Item"}</div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div className="form-group">
            <label className="form-label">Cube No *</label>
            <input className="form-input" type="number" min="1" value={form.cube_no}
              onChange={e => set("cube_no", e.target.value)} placeholder="1" />
          </div>
          <div className="form-group">
            <label className="form-label">Box No *</label>
            <input className="form-input" value={form.box_no}
              onChange={e => set("box_no", e.target.value)} placeholder="e.g. 1" />
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">Item *</label>
          <select className="form-input" value={form.item_code}
            onChange={e => set("item_code", e.target.value)}>
            <option value="">— select item —</option>
            {items.map(i => (
              <option key={i.item_code} value={i.item_code}>
                {i.is_subkit ? "🧩 " : ""}{i.item_code} — {i.name}
              </option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label className="form-label">Quantity *</label>
          <input className="form-input" type="number" min="1" value={form.qty}
            onChange={e => set("qty", e.target.value)} placeholder="1" />
        </div>

        <div className="flex gap-2" style={{ marginTop: 4 }}>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary ml-auto" onClick={() => onSave(form)} disabled={saving}>
            {saving ? "Saving…" : isEdit ? "Save Changes" : "Add Item"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function CubeBoxTemplate() {
  const { user } = useAuth();
  const { toast } = useToast();
  const isAdmin = ["admin", "superadmin"].includes(user?.role);

  const [rows, setRows] = useState([]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activeCube, setActiveCube] = useState(null); // null = all cubes

  const [showForm, setShowForm] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [addContext, setAddContext] = useState(null); // { cube_no, box_no } to prefill
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([api.getKitBoxTemplate(), api.getItems()])
      .then(([t, i]) => { setRows(t.data); setItems(i.data); })
      .catch(e => toast(e.message, "error"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const cubeNumbers = useMemo(
    () => [...new Set(rows.map(r => r.cube_no))].sort((a, b) => a - b),
    [rows]
  );

  // Group rows -> cubes -> boxes, preserving row_order sequence
  const grouped = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = rows.filter(r => {
      if (activeCube !== null && r.cube_no !== activeCube) return false;
      if (!q) return true;
      return r.item_name.toLowerCase().includes(q) || r.item_code.toLowerCase().includes(q);
    });

    const cubes = [];
    let curCube = null, curBox = null;
    for (const r of filtered) {
      if (!curCube || curCube.cube_no !== r.cube_no) {
        curCube = { cube_no: r.cube_no, boxes: [] };
        cubes.push(curCube);
        curBox = null;
      }
      if (!curBox || curBox.box_no !== r.box_no) {
        curBox = { box_no: r.box_no, rows: [] };
        curCube.boxes.push(curBox);
      }
      curBox.rows.push(r);
    }
    return cubes;
  }, [rows, search, activeCube]);

  const handleSave = async (form) => {
    if (!form.cube_no || !form.box_no || !form.item_code || !form.qty) {
      toast("All fields are required", "error"); return;
    }
    setSaving(true);
    try {
      if (editTarget) {
        await api.updateKitBoxTemplate(editTarget.id, form);
        toast("Row updated");
      } else {
        await api.createKitBoxTemplate(form);
        toast("Item added to box");
      }
      setShowForm(false);
      setEditTarget(null);
      setAddContext(null);
      load();
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (row) => {
    if (!confirm(`Remove "${row.item_name}" from Cube ${row.cube_no} / Box ${row.box_no}?`)) return;
    try {
      const res = await api.deleteKitBoxTemplate(row.id);
      toast(res.msg);
      load();
    } catch (e) {
      toast(e.message, "error");
    }
  };

  const openEdit = (row) => { setEditTarget(row); setAddContext(null); setShowForm(true); };
  const openAddToBox = (cube_no, box_no) => {
    setEditTarget(null);
    setAddContext({ cube_no, box_no });
    setShowForm(true);
  };

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-title">Cube / Box Template</div>
          <div className="page-sub">
            {rows.length} item placement{rows.length !== 1 ? "s" : ""} across {cubeNumbers.length} cube{cubeNumbers.length !== 1 ? "s" : ""} — the fixed packing layout used for every deployed kit
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap", alignItems: "center" }}>
        <input
          className="form-input"
          style={{ maxWidth: 360 }}
          placeholder="Search by item name or code…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        {search && (
          <button className="btn btn-ghost btn-sm" onClick={() => setSearch("")}>Clear</button>
        )}

        <div style={{ display: "flex", gap: 6, marginLeft: "auto" }}>
          <button
            className={`btn btn-sm ${activeCube === null ? "btn-primary" : "btn-ghost"}`}
            onClick={() => setActiveCube(null)}
          >
            All Cubes
          </button>
          {cubeNumbers.map(c => (
            <button
              key={c}
              className={`btn btn-sm ${activeCube === c ? "btn-primary" : "btn-ghost"}`}
              onClick={() => setActiveCube(c)}
            >
              Cube {c}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 60 }}><div className="spinner" /></div>
      ) : rows.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📦</div>
          <div>No box template defined yet</div>
        </div>
      ) : grouped.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">🔍</div>
          <div>No items match "{search}"</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
          {grouped.map(cube => (
            <div key={cube.cube_no}>
              <div style={{
                fontSize: 16, fontWeight: 700, padding: "8px 14px", borderRadius: 8,
                background: "var(--primary, #077B4D)", color: "#fff", marginBottom: 14,
                display: "inline-block"
              }}>
                CUBE {cube.cube_no}
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {cube.boxes.map(box => (
                  <div key={box.box_no} className="card" style={{ padding: 14 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>
                        Box {box.box_no}
                      </div>
                      {isAdmin && (
                        <button className="btn btn-ghost btn-sm" onClick={() => openAddToBox(cube.cube_no, box.box_no)}>
                          + Add Item
                        </button>
                      )}
                    </div>
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>Item Code</th>
                            <th>Item Name</th>
                            <th>Qty</th>
                            {isAdmin && <th>Actions</th>}
                          </tr>
                        </thead>
                        <tbody>
                          {box.rows.map(r => (
                            <tr key={r.id}>
                              <td>
                                <span style={{ fontFamily: "monospace", fontWeight: 600, fontSize: 12,
                                  background: "var(--border)", padding: "2px 6px", borderRadius: 4 }}>
                                  {r.item_code}
                                </span>
                              </td>
                              <td style={{ fontWeight: 500 }}>
                                {r.is_subkit && <span title="Sub-kit">🧩 </span>}
                                {r.item_name}
                              </td>
                              <td style={{ fontWeight: 600 }}>{r.qty}</td>
                              {isAdmin && (
                                <td>
                                  <div className="flex gap-2">
                                    <button className="btn btn-ghost btn-sm" onClick={() => openEdit(r)}>Edit</button>
                                    <button className="btn btn-danger btn-sm" onClick={() => handleDelete(r)}>Delete</button>
                                  </div>
                                </td>
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <RowFormModal
          isEdit={!!editTarget}
          initial={editTarget ? {
            id: editTarget.id,
            cube_no: String(editTarget.cube_no),
            box_no: editTarget.box_no,
            item_code: editTarget.item_code,
            qty: String(editTarget.qty),
          } : addContext ? {
            cube_no: String(addContext.cube_no),
            box_no: addContext.box_no,
            item_code: "",
            qty: "1",
          } : null}
          items={items}
          onSave={handleSave}
          onClose={() => { setShowForm(false); setEditTarget(null); setAddContext(null); }}
          saving={saving}
        />
      )}
    </>
  );
}
