import { useEffect, useState, useMemo } from "react";

export const UNITS = ["Piece", "Box", "Pack", "Strip", "Vial", "Bottle", "Roll", "Pair", "Set", "Kg", "Litre", "Metre"];
export const STATUSES = ["active", "expired", "quarantined", "returned"];

export const EMPTY_BATCH_FORM = {
  supplier_batch_no: "", item_code: "", vendor_code: "",
  mfg_date: "", expiry_date: "", supply_date: "", qty_received: "",
  unit: "", storage_location: "", status: "active", remarks: "",
};

// ── Goods Receipt (Add) / Edit Batch Modal ─────────────────────────
// Shared between Stock Batches and PO Status (edit-from-PO-item) screens.
export default function BatchFormModal({ initial, items, vendors, itemVendors, sentPOs, onSave, onClose, saving }) {
  const [form, setForm]         = useState(() => initial ?? { ...EMPTY_BATCH_FORM });
  const [selectedPoId, setSelectedPoId] = useState("");
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const isAdding = !initial;

  const selectedPO   = sentPOs.find(p => String(p.id) === String(selectedPoId)) || null;
  const resolvedItem = selectedPO?.items?.find(i => i.item_code === form.item_code) || null;
  const isPOMode     = isAdding && !!resolvedItem;

  // When PO changes: auto-select item for single-item POs, otherwise clear
  useEffect(() => {
    if (!isAdding) return;
    if (!selectedPoId) {
      setForm(f => ({ ...f, item_code: "", vendor_code: "", unit: "", qty_received: "" }));
      return;
    }
    if (selectedPO?.items?.length === 1) {
      const it = selectedPO.items[0];
      setForm(f => ({
        ...f,
        item_code: it.item_code, vendor_code: selectedPO.vendor_code,
        unit: it.unit, qty_received: String(it.quantity),
      }));
    } else {
      setForm(f => ({ ...f, item_code: "", vendor_code: "", unit: "", qty_received: "" }));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPoId, isAdding]);

  // When item selected from multi-item PO dropdown: auto-fill vendor/unit/qty
  useEffect(() => {
    if (!isAdding || !selectedPO || !form.item_code) return;
    const poItem = selectedPO.items.find(i => i.item_code === form.item_code);
    if (poItem) {
      setForm(f => ({
        ...f,
        vendor_code: selectedPO.vendor_code,
        unit: poItem.unit,
        qty_received: String(poItem.quantity),
      }));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.item_code, selectedPO?.id]);

  // Manual mode: filter vendors for selected item
  const filteredVendors = useMemo(() => {
    if (!form.item_code) return [];
    const mapping = itemVendors.find(iv => iv.item_code === form.item_code);
    const mapped  = mapping ? mapping.vendors : [];
    if (initial?.vendor_code) {
      const exists = mapped.some(v => v.vendor_code === initial.vendor_code);
      if (!exists) {
        const fv = vendors.find(v => v.vendor_code === initial.vendor_code);
        if (fv) return [...mapped, fv];
      }
    }
    return mapped;
  }, [form.item_code, itemVendors, initial, vendors]);

  // Manual mode: set unit + clear invalid vendor when item changes
  useEffect(() => {
    if (!isAdding || selectedPO) return;
    const item = items.find(i => i.item_code === form.item_code);
    if (item) {
      set("unit", item.unit);
      const mapping = itemVendors.find(iv => iv.item_code === form.item_code);
      const mapped  = mapping ? mapping.vendors : [];
      if (!mapped.some(v => v.vendor_code === form.vendor_code)) set("vendor_code", "");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.item_code]);

  const activeItems = useMemo(() =>
    items.filter(i => i.is_active !== 0 || i.item_code === form.item_code),
    [items, form.item_code]
  );

  // Items shown in dropdown: PO items when PO selected, otherwise all active
  const dropdownItems = selectedPO
    ? selectedPO.items.map(i => ({ item_code: i.item_code, label: `${i.item_code} — ${i.item_name} (${i.quantity} ${i.unit})` }))
    : activeItems.map(i => ({ item_code: i.item_code, label: `${i.item_code} — ${i.name}` }));

  const handleSave = () => {
    onSave({ ...form, po_id: isPOMode ? selectedPO.id : null });
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 660, width: "95%", maxHeight: "90vh", overflowY: "auto" }}
        onClick={e => e.stopPropagation()}>
        <div className="modal-title">{initial ? "Edit Batch" : "Record Goods Receipt"}</div>

        {/* PO selector — add mode only */}
        {isAdding && (
          <div className="form-group">
            <label className="form-label">Purchase Order</label>
            <select className="form-select" value={selectedPoId}
              onChange={e => setSelectedPoId(e.target.value)}>
              <option value="">Select PO</option>
              {sentPOs.map(po => (
                <option key={po.id} value={po.id}>
                  {po.po_number} — {po.business_name || po.vendor_code}
                  {" "}({po.items.length} item{po.items.length !== 1 ? "s" : ""})
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Item + Vendor — single row, behaviour changes based on PO selection */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div className="form-group">
            <label className="form-label">Item *</label>
            <select className="form-select" value={form.item_code}
              onChange={e => set("item_code", e.target.value)}
              disabled={!!initial || (selectedPO?.items?.length === 1)}>
              <option value="">Select item…</option>
              {dropdownItems.map(i => (
                <option key={i.item_code} value={i.item_code}>{i.label}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Vendor</label>
            {selectedPO ? (
              <input className="form-input" disabled
                value={`${selectedPO.vendor_code} — ${selectedPO.business_name || ""}`} />
            ) : (
              <select className="form-select" value={form.vendor_code}
                onChange={e => set("vendor_code", e.target.value)}
                disabled={!form.item_code || !!initial}>
                <option value="">{!form.item_code ? "Select item first…" : "Select vendor…"}</option>
                {filteredVendors.map(v => (
                  <option key={v.vendor_code} value={v.vendor_code}>
                    {v.vendor_code} — {v.business_name}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        {/* Supplier Batch No + Unit */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div className="form-group">
            <label className="form-label">Supplier Batch No</label>
            <input className="form-input" value={form.supplier_batch_no}
              onChange={e => set("supplier_batch_no", e.target.value)}
              placeholder="Number printed on packaging" />
          </div>
          <div className="form-group">
            <label className="form-label">Unit *</label>
            <select className="form-select" value={form.unit}
              onChange={e => set("unit", e.target.value)} disabled={isPOMode}>
              <option value="">Select unit…</option>
              {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
        </div>

        {/* Mfg Date + Expiry Date */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div className="form-group">
            <label className="form-label">Manufacturing Date</label>
            <input className="form-input" type="date" value={form.mfg_date}
              onChange={e => set("mfg_date", e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Expiry Date</label>
            <input className="form-input" type="date" value={form.expiry_date}
              onChange={e => set("expiry_date", e.target.value)} />
          </div>
        </div>

        {/* Supply Date */}
        <div className="form-group">
          <label className="form-label">
            Supply Date
          </label>
          <input className="form-input" type="date" value={form.supply_date}
            onChange={e => set("supply_date", e.target.value)} />
        </div>

        {/* Qty + Status */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div className="form-group">
            <label className="form-label">
              Quantity Received *
              {isPOMode && (
                <span style={{ fontSize: 11, color: "var(--muted)", marginLeft: 6, fontWeight: 400 }}>
                  (pre-filled · editable)
                </span>
              )}
            </label>
            <input className="form-input" type="number" min="1" value={form.qty_received}
              onChange={e => set("qty_received", e.target.value)} placeholder="0"
              disabled={!!initial} />
          </div>
          <div className="form-group">
            <label className="form-label">Status</label>
            <select className="form-select" value={form.status}
              onChange={e => set("status", e.target.value)}>
              {STATUSES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
            </select>
          </div>
        </div>

        {/* Storage Location */}
        <div className="form-group">
          <label className="form-label">Storage Location</label>
          <input className="form-input" value={form.storage_location}
            onChange={e => set("storage_location", e.target.value)}
            placeholder="e.g. Shelf B3, Cold Room 1" />
        </div>

        {/* Remarks */}
        <div className="form-group">
          <label className="form-label">Remarks / Special Instructions</label>
          <textarea className="form-input" rows={2} value={form.remarks}
            onChange={e => set("remarks", e.target.value)}
            placeholder="e.g. Cold chain required, restricted handling"
            style={{ resize: "vertical" }} />
        </div>

        <div className="flex gap-2" style={{ marginTop: 4 }}>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary ml-auto" onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : initial ? "Save Changes" : "Record Receipt"}
          </button>
        </div>
      </div>
    </div>
  );
}
