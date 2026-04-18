const mongoose = require("mongoose");

// Each row from an uploaded Excel becomes one KitItem
const KitItemSchema = new mongoose.Schema({
  kitName:  { type: String, required: true, index: true },
  rowNo:    { type: Number },
  cube:     String,
  box:      String,
  items:    String,
  brand:    String,
  oem:      String,
  itemType: String,
  expiry:   String,
  batchNo:  String,
  document: String,
  link:     String,
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  createdAt: { type: Date, default: Date.now }
});

// Each uploaded Excel file is tracked here
const KitFileSchema = new mongoose.Schema({
  kitName:      { type: String, required: true, unique: true },
  originalFile: String,       // original filename
  storedFile:   String,       // filename on disk in /uploads
  rowCount:     Number,
  uploadedBy:   { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  createdAt:    { type: Date, default: Date.now }
});

module.exports = {
  KitItem: mongoose.model("KitItem", KitItemSchema),
  KitFile: mongoose.model("KitFile", KitFileSchema)
};
