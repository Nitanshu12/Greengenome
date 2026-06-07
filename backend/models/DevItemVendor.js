const mongoose = require("mongoose");

const DevItemVendorSchema = new mongoose.Schema({
  item_code:           { type: String, required: true },
  vendor_code:         { type: String, required: true },
  offer_price:         { type: Number, default: null },
  lead_time:           { type: String, default: null },
  is_preferred:        { type: Boolean, default: false },
  min_order_qty:       { type: Number, default: null },
  payment_terms:       { type: String, default: null },
  vendor_rating:       { type: Number, default: null },
  remarks:             { type: String, default: null },
  status:              { type: String, default: "active" },
}, { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } });

DevItemVendorSchema.index({ item_code: 1, vendor_code: 1 }, { unique: true });

module.exports = mongoose.model("DevItemVendor", DevItemVendorSchema, "dev_item_vendors");
