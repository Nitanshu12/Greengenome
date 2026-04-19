const XLSX = require("xlsx");

function colVal(row, ...keys) {
  for (const k of keys) {
    const found = Object.keys(row).find(
      h => h.trim().toUpperCase() === k.toUpperCase()
    );
    if (found && row[found] !== null && row[found] !== undefined) {
      return String(row[found]).trim();
    }
  }
  return "";
}

function parseDate(val) {
  if (!val) return "";
  try {
    const d = new Date(val);
    if (isNaN(d.getTime())) return String(val);
    return d.toISOString().split("T")[0];
  } catch {
    return String(val);
  }
}

/** One logical row for API / UI (matches former KitItem lean shape). */
function sheetRowToKit(row, i) {
  return {
    rowNo: i + 1,
    cube: colVal(row, "CUBE"),
    box: colVal(row, "BOX"),
    items: colVal(row, "ITEMS"),
    brand: colVal(row, "BRAND"),
    oem: colVal(row, "OEM"),
    itemType: colVal(row, "TYPE", "ITEM TYPE"),
    expiry: parseDate(colVal(row, "EXPIRY")),
    batchNo: colVal(row, "BATCH", "BATCH NO"),
    document: colVal(row, "DOC", "DOCUMENT"),
    link: colVal(row, "LINK")
  };
}

function sheetJsonToKitData(rows) {
  return rows.map((row, i) => sheetRowToKit(row, i));
}

/** Compact stats stored on KitFile (one object per kit, not per row). */
function summarizeKitData(mappedRows) {
  const brandCounts = {};
  let expired = 0;
  let warning = 0;
  const today = new Date();
  const in30 = new Date();
  in30.setDate(today.getDate() + 30);

  for (const item of mappedRows) {
    const b = (item.brand || "").trim();
    if (b) brandCounts[b] = (brandCounts[b] || 0) + 1;
    if (!item.expiry) continue;
    try {
      const d = new Date(item.expiry);
      if (isNaN(d.getTime())) continue;
      if (d < today) expired++;
      else if (d <= in30) warning++;
    } catch {
      /* ignore */
    }
  }

  return { brandCounts, expired, warning };
}

function loadKitDataFromFile(filePath) {
  const wb = XLSX.readFile(filePath);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });
  return sheetJsonToKitData(rows);
}

module.exports = {
  sheetJsonToKitData,
  summarizeKitData,
  loadKitDataFromFile
};
