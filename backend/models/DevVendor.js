const mongoose = require("mongoose");

const DevVendorSchema = new mongoose.Schema({
  vendor_code:     { type: String, required: true, unique: true },
  business_name:   { type: String, required: true },
  address:         { type: String, default: null },
  email:           { type: String, default: null },
  phone:           { type: String, default: null },
  contact_person:  { type: String, default: null },
}, { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } });

module.exports = mongoose.model("DevVendor", DevVendorSchema, "dev_vendors");
