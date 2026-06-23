import { useEffect, useState, useCallback } from "react";
import { api } from "../api";
import { useAuth } from "../hooks/useAuth";
import { useToast } from "../components/Toast";

const EMPTY_FORM = { item_code: "", name: "", unit: "Set", components: [{ component_item_code: "", qty_per_unit: "" }] };

function SubKitFormModal({ initial, rawItems, onSave, onClose, saving }) {
  const [form, setForm] = useState(initial || EMPTY_FORM);
  const isEdit = !!initial;
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  function setComponent(idx, key, value) {
    setForm(f => ({
      ...f,
      components: f.components.map((c, i) => (i === idx ? { ...c, [key]: value } : c)),
    }));
  }
  function addComponentRow() {
    setForm(f => ({ ...f, components: [...f.components, { component_item_code: "", qty_per_unit: "" }] }));
  }
  function removeComponentRow(idx) {
    setForm(f => ({ ...f, components: f.components.filter((_, i) => i !== idx) }));
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 600, width: "95%", maxHeight: "90vh", overflowY: "auto" }}
        onClick={e => e.stopPropagation()}>
        <div className="modal-title">{isEdit ? "Edit Sub-Kit" : "Define New Sub-Kit"}</div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div className="form-group">
            <label className="form-label">Item Code *</label>
            <input className="form-input" value={form.item_code}
              onChange={e => set("item_code", e.target.value)}
              placeholder="e.g. GGIPL - 462" disabled={isEdit} />
          </div>
          <div className="form-group">
            <label className="form-label">Unit</label>
            <input className="form-input" value={form.unit}
              onChange={e => set("unit", e.target.value)} placeholder="Set" />
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">Sub-Kit Name *</label>
          <input className="form-input" value={form.name}
            onChange={e => set("name", e.target.value)}
            placeholder="e.g. IV Cannulation Kit" />
        </div>

        <div className="form-group">
          <label className="form-label">
            Components — raw items + quantity needed for ONE sub-kit *
          </label>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {form.components.map((c, idx) => (
              <div key={idx} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <select className="form-input" style={{ flex: 1 }}
                  value={c.component_item_code}
                  onChange={e => setComponent(idx, "component_item_code", e.target.value)}>
                  <option value="">— select raw item —</option>
                  {rawItems.map(i => (
                    <option key={i.item_code} value={i.item_code}>{i.item_code} — {i.name}</option>
                  ))}
                </select>
                <input className="form-input" type="number" min="1" style={{ width: 100 }}
                  placeholder="Qty"
                  value={c.qty_per_unit}
                  onChange={e => setComponent(idx, "qty_per_unit", e.target.value)} />
                <button className="btn btn-ghost btn-sm" type="button"
                  onClick={() => removeComponentRow(idx)}
                  disabled={form.components.length === 1}>✕</button>
              </div>
            ))}
          </div>
          <button className="btn btn-ghost btn-sm" type="button" style={{ marginTop: 8 }}
            onClick={addComponentRow}>+ Add Component</button>
        </div>

        <div className="flex gap-2" style={{ marginTop: 4 }}>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary ml-auto" onClick={() => onSave(form)} disabled={saving}>
            {saving ? "Saving…" : isEdit ? "Save Changes" : "Create Sub-Kit"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function SubKitGeneration() {
  const { user } = useAuth();
  const { toast } = useToast();
  const isAdmin = ["admin", "superadmin"].includes(user?.role);

  const [subKits, setSubKits] = useState([]);
  const [rawItems, setRawItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([api.getSubKits(), api.getItems()])
      .then(([sk, items]) => {
        setSubKits(sk.data);
        setRawItems(items.data.filter(i => !i.is_subkit));
      })
      .catch(e => toast(e.message, "error"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = async (form) => {
    if (!form.item_code.trim() || !form.name.trim()) {
      toast("Item code and name are required", "error"); return;
    }
    const components = form.components
      .filter(c => c.component_item_code && c.qty_per_unit)
      .map(c => ({ component_item_code: c.component_item_code, qty_per_unit: Number(c.qty_per_unit) }));
    if (components.length === 0) {
      toast("Add at least one component with a quantity", "error"); return;
    }
    setSaving(true);
    try {
      if (editTarget) {
        await api.updateSubKit(editTarget.item_code, { name: form.name, unit: form.unit, components });
        toast("Sub-kit updated");
      } else {
        await api.createSubKit({ item_code: form.item_code, name: form.name, unit: form.unit, components });
        toast("Sub-kit created");
      }
      setShowForm(false);
      setEditTarget(null);
      load();
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (sk) => {
    if (!confirm(`Delete sub-kit "${sk.name}"? This cannot be undone.`)) return;
    try {
      const res = await api.deleteSubKit(sk.item_code);
      toast(res.msg);
      load();
    } catch (e) {
      toast(e.message, "error");
    }
  };

  const openEdit = (sk) => {
    setEditTarget(sk);
    setShowForm(true);
  };
  const openAdd = () => { setEditTarget(null); setShowForm(true); };

  const filtered = subKits.filter(sk =>
    !search ||
    sk.name.toLowerCase().includes(search.toLowerCase()) ||
    sk.item_code.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-title">Sub-Kit Generation</div>
          <div className="page-sub">
            {subKits.length} sub-kit{subKits.length !== 1 ? "s" : ""} defined — bundles of raw items used as a single line in the BOM
          </div>
        </div>
        {isAdmin && (
          <button className="btn btn-primary" onClick={openAdd}>+ Add Sub-Kit</button>
        )}
      </div>

      <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        <input
          className="form-input"
          style={{ maxWidth: 360 }}
          placeholder="Search by name or item code…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        {search && (
          <button className="btn btn-ghost btn-sm" onClick={() => setSearch("")}>Clear</button>
        )}
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 60 }}><div className="spinner" /></div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">🧩</div>
          <div>No sub-kits defined yet</div>
          {isAdmin && (
            <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={openAdd}>
              + Add First Sub-Kit
            </button>
          )}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {filtered.map(sk => (
            <div key={sk.item_code} className="card" style={{ padding: 18 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontFamily: "monospace", fontWeight: 600, fontSize: 12,
                      background: "var(--border)", padding: "2px 6px", borderRadius: 4 }}>
                      {sk.item_code}
                    </span>
                    <span style={{ fontWeight: 600, fontSize: 15 }}>{sk.name}</span>
                  </div>
                  <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>
                    Unit: {sk.unit} · {sk.components.length} component{sk.components.length !== 1 ? "s" : ""}
                  </div>
                </div>
                {isAdmin && (
                  <div className="flex gap-2">
                    <button className="btn btn-ghost btn-sm" onClick={() => openEdit(sk)}>Edit</button>
                    <button className="btn btn-danger btn-sm" onClick={() => handleDelete(sk)}>Delete</button>
                  </div>
                )}
              </div>

              <div className="table-wrap" style={{ marginTop: 12 }}>
                <table>
                  <thead>
                    <tr>
                      <th>Component Item</th>
                      <th>Qty per Sub-Kit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sk.components.map(c => (
                      <tr key={c.component_item_code}>
                        <td>
                          <span style={{ fontFamily: "monospace", fontSize: 11, color: "var(--muted)", marginRight: 8 }}>
                            {c.component_item_code}
                          </span>
                          {c.component_name}
                        </td>
                        <td style={{ fontWeight: 600 }}>{c.qty_per_unit} {c.component_unit}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <SubKitFormModal
          initial={editTarget ? {
            item_code: editTarget.item_code,
            name: editTarget.name,
            unit: editTarget.unit,
            components: editTarget.components.map(c => ({
              component_item_code: c.component_item_code,
              qty_per_unit: String(c.qty_per_unit),
            })),
          } : null}
          rawItems={rawItems}
          onSave={handleSave}
          onClose={() => { setShowForm(false); setEditTarget(null); }}
          saving={saving}
        />
      )}
    </>
  );
}
