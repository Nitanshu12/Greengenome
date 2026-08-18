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
          <label className="form-label">Item</label>
          <select className="form-input" value={form.item_code}
            onChange={e => set("item_code", e.target.value)}>
            <option value="">— unresolved / leave unmatched —</option>
            {items.map(i => (
              <option key={i.item_code} value={i.item_code}>
                {i.is_subkit ? "🧩 " : ""}{i.item_code} — {i.name}
              </option>
            ))}
          </select>
          {isEdit && (
            <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>
              Leave unresolved if no matching item/sub-kit exists yet — the row stays with its raw Excel name.
            </div>
          )}
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
  const { isAdmin, canDelete } = useAuth();
  const { toast } = useToast();

  const [rows, setRows] = useState([]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const [cubeOpen, setCubeOpen] = useState({});
  const [boxOpen, setBoxOpen] = useState({});

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

  const unmatchedCount = useMemo(() => rows.filter(r => r.unmatched).length, [rows]);

  // Group rows -> cubes -> boxes, preserving row_order sequence
  const allGrouped = useMemo(() => {
    const cubeMap = new Map();
    for (const r of rows) {
      if (!cubeMap.has(r.cube_no)) {
        cubeMap.set(r.cube_no, { cube_no: r.cube_no, boxMap: new Map() });
      }
      const cube = cubeMap.get(r.cube_no);
      if (!cube.boxMap.has(r.box_no)) {
        cube.boxMap.set(r.box_no, { box_no: r.box_no, rows: [] });
      }
      cube.boxMap.get(r.box_no).rows.push(r);
    }
    return Array.from(cubeMap.values()).map(cube => ({
      cube_no: cube.cube_no,
      boxes: Array.from(cube.boxMap.values()),
    }));
  }, [rows]);

  const q = search.trim().toLowerCase();
  const isSearching = q.length > 0;

  // While searching, only keep boxes with a matching row, and force those open
  const visibleGrouped = useMemo(() => {
    if (!isSearching) return allGrouped;
    return allGrouped
      .map(cube => ({
        ...cube,
        boxes: cube.boxes
          .map(box => ({
            ...box,
            rows: box.rows.filter(r => r.item_name.toLowerCase().includes(q) || (r.item_code || "").toLowerCase().includes(q)),
          }))
          .filter(box => box.rows.length > 0),
      }))
      .filter(cube => cube.boxes.length > 0);
  }, [allGrouped, isSearching, q]);

  const isCubeOpen = (cube_no) => isSearching || !!cubeOpen[cube_no];
  const isBoxOpen  = (cube_no, box_no) => isSearching || !!boxOpen[`${cube_no}-${box_no}`];

  const handleSave = async (form) => {
    if (!form.cube_no || !form.box_no || !form.qty) {
      toast("Cube, box and quantity are required", "error"); return;
    }
    setSaving(true);
    try {
      if (editTarget) {
        await api.updateKitBoxTemplate(editTarget.id, form);
        toast("Row updated");
      } else {
        if (!form.item_code) { toast("Pick an item for a new row", "error"); setSaving(false); return; }
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
            {rows.length} item placement{rows.length !== 1 ? "s" : ""}
            {unmatchedCount > 0 && (
              <span style={{ color: "#b45309", fontWeight: 600 }}> · {unmatchedCount} unmatched — need linking to an item or sub-kit</span>
            )}
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
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 60 }}><div className="spinner" /></div>
      ) : rows.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📦</div>
          <div>No box template defined yet</div>
        </div>
      ) : visibleGrouped.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">🔍</div>
          <div>No items match "{search}"</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {visibleGrouped.map(cube => {
            const cubeOpenNow = isCubeOpen(cube.cube_no);
            const cubeItemCount = cube.boxes.reduce((s, b) => s + b.rows.length, 0);
            return (
              <div key={cube.cube_no} style={{ border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
                <button
                  onClick={() => setCubeOpen(p => ({ ...p, [cube.cube_no]: !p[cube.cube_no] }))}
                  style={{
                    width: "100%", display: "flex", alignItems: "center", gap: 10,
                    padding: "12px 16px", background: "var(--primary, #077B4D)", color: "#fff",
                    border: "none", cursor: "pointer", textAlign: "left",
                  }}
                >
                  <span style={{ fontWeight: 700, fontSize: 14, flex: 1 }}>CUBE {cube.cube_no}</span>
                  <span style={{ fontSize: 12, opacity: 0.85 }}>
                    {cube.boxes.length} box{cube.boxes.length !== 1 ? "es" : ""} · {cubeItemCount} items
                  </span>
                  <span style={{ transform: cubeOpenNow ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>▾</span>
                </button>

                {cubeOpenNow && (
                  <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 8, background: "var(--bg-alt, #f8f9fa)" }}>
                    {cube.boxes.map(box => {
                      const boxOpenNow = isBoxOpen(cube.cube_no, box.box_no);
                      return (
                        <div key={box.box_no} className="card" style={{ padding: 0, overflow: "hidden" }}>
                          <button
                            onClick={() => setBoxOpen(p => ({ ...p, [`${cube.cube_no}-${box.box_no}`]: !p[`${cube.cube_no}-${box.box_no}`] }))}
                            style={{
                              width: "100%", display: "flex", alignItems: "center", gap: 10,
                              padding: "10px 14px", background: "none", border: "none", cursor: "pointer", textAlign: "left",
                            }}
                          >
                            <span style={{ fontWeight: 600, fontSize: 13, flex: 1 }}>Box {box.box_no}</span>
                            <span style={{ fontSize: 11, color: "var(--muted)" }}>{box.rows.length} item{box.rows.length !== 1 ? "s" : ""}</span>
                            {isAdmin && (
                              <span
                                role="button"
                                onClick={e => { e.stopPropagation(); openAddToBox(cube.cube_no, box.box_no); }}
                                style={{ fontSize: 11, color: "var(--primary, #077B4D)", fontWeight: 600, padding: "2px 8px" }}
                              >
                                + Add Item
                              </span>
                            )}
                            <span style={{ transform: boxOpenNow ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>▾</span>
                          </button>

                          {boxOpenNow && (
                            <div className="table-wrap" style={{ margin: 0, borderTop: "1px solid var(--border)" }}>
                              <table>
                                <thead>
                                  <tr>
                                    <th>Item</th>
                                    <th>Qty</th>
                                    {isAdmin && <th>Actions</th>}
                                  </tr>
                                </thead>
                                <tbody>
                                  {box.rows.map(r => (
                                    <tr key={r.id}>
                                      <td style={{ fontWeight: 500 }}>
                                        {!!r.is_subkit && <span title="Sub-kit">🧩 </span>}
                                        {!r.unmatched && (
                                          <span style={{
                                            fontFamily: "monospace", fontWeight: 600, fontSize: 11,
                                            background: "var(--border)", padding: "2px 6px", borderRadius: 4, marginRight: 8,
                                          }}>
                                            {r.item_code}
                                          </span>
                                        )}
                                        {r.item_name}
                                        {r.unmatched && (
                                          <span style={{
                                            fontSize: 10, fontWeight: 700, color: "#b45309", background: "#fef3c7",
                                            padding: "1px 6px", borderRadius: 10, marginLeft: 8,
                                          }}>
                                            Unmatched
                                          </span>
                                        )}
                                      </td>
                                      <td style={{ fontWeight: 600 }}>{r.qty}</td>
                                      {isAdmin && (
                                        <td>
                                          <div className="flex gap-2">
                                            <button className="btn btn-ghost btn-sm" onClick={() => openEdit(r)}>Edit</button>
                                            {canDelete && (
                                              <button className="btn btn-danger btn-sm" onClick={() => handleDelete(r)}>Delete</button>
                                            )}
                                          </div>
                                        </td>
                                      )}
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showForm && (
        <RowFormModal
          isEdit={!!editTarget}
          initial={editTarget ? {
            id: editTarget.id,
            cube_no: String(editTarget.cube_no),
            box_no: editTarget.box_no,
            item_code: editTarget.item_code || "",
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
