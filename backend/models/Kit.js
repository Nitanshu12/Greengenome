const mongoose = require("mongoose");

// One document per uploaded kit: file on disk + compact stats (no per-row documents)
const KitFileSchema = new mongoose.Schema({
  kitName:      { type: String, required: true, unique: true },
  originalFile: String,
  storedFile:   String,
  rowCount:     Number,
  uploadedBy:   { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  createdAt:    { type: Date, default: Date.now },
  // Filled on upload — keeps dashboard fast without 1500+ Mongo documents per file
  summaryStats: {
    brandCounts: { type: mongoose.Schema.Types.Mixed, default: {} },
    expired:     { type: Number, default: 0 },
    warning:     { type: Number, default: 0 }
  }
});

module.exports = {
  KitFile: mongoose.model("KitFile", KitFileSchema)
};
