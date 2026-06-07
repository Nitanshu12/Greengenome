const mongoose = require("mongoose");

const DevBomSchema = new mongoose.Schema({
  item_code:    { type: String, required: true, unique: true },
  item_name:    { type: String, required: true },
  required_qty: { type: Number, default: 0 },
}, { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } });

module.exports = mongoose.model("DevBom", DevBomSchema, "dev_bom");
