const mongoose = require("mongoose");

const DevStockBatchSchema = new mongoose.Schema({
  supplier_batch_no: { type: String, default: null },
  item_code:         { type: String, required: true },
  vendor_code:       { type: String, default: null },
  mfg_date:          { type: Date, default: null },
  expiry_date:       { type: Date, default: null },
  qty_received:      { type: Number, required: true },
  qty_issued:        { type: Number, default: 0 },
  unit:              { type: String, required: true },
  storage_location:  { type: String, default: null },
  status:            { type: String, enum: ["active","expired","quarantined","returned"], default: "active" },
  remarks:           { type: String, default: null },
}, { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } });

module.exports = mongoose.model("DevStockBatch", DevStockBatchSchema, "dev_stock_batches");
