const mongoose = require("mongoose");

const DevItemSchema = new mongoose.Schema({
  item_code:        { type: String, required: true, unique: true },
  name:             { type: String, required: true },
  specification:    { type: String, default: null },
  category:         { type: String, required: true },
  product_category: { type: String, default: null },
  material:         { type: String, default: null },
  brand:            { type: String, default: null },
  unit:             { type: String, required: true },
  unit_cost:        { type: Number, default: 0 },
  gst_percent:      { type: Number, default: 0 },
  min_stock:        { type: Number, default: 0 },
}, { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } });

module.exports = mongoose.model("DevItem", DevItemSchema, "dev_items");
