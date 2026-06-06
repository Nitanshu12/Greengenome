
const API_ROOT = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");
const BASE = `${API_ROOT}/api`;

async function request(method, path, body, isFormData = false) {
  const opts = {
    method,
    credentials: "include",
    headers: isFormData ? {} : { "Content-Type": "application/json" },
    body: body
      ? isFormData
        ? body
        : JSON.stringify(body)
      : undefined
  };

  const res = await fetch(BASE + path, opts);

  // Handle file downloads (blob)
  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("spreadsheet") || contentType.includes("octet-stream")) {
    if (!res.ok) throw new Error("Download failed");
    return res.blob();
  }

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

export const api = {
  // Auth
  login:  (body)          => request("POST", "/auth/login", body),
  logout: ()              => request("POST", "/auth/logout"),
  me:     ()              => request("GET",  "/auth/me"),

  // Dashboard
  dashboard: ()           => request("GET", "/dashboard"),

  // Kits (user)
  getKits:    ()          => request("GET", "/kits"),
  getKitData: (name)      => request("GET", `/kits/${encodeURIComponent(name)}/data`),
  downloadKit: (name)     => request("GET", `/kits/${encodeURIComponent(name)}/download`),
  downloadOriginal: (name)=> request("GET", `/kits/${encodeURIComponent(name)}/download-original`),

  // Admin — kits
  uploadExcel: (formData) => request("POST", "/admin/upload-excel", formData, true),
  adminKits:  ()          => request("GET",  "/admin/kits"),
  deleteKit:  (name)      => request("DELETE", `/admin/kits/${encodeURIComponent(name)}`),

  // Items Master
  getItems:           (params = "") => request("GET", `/items${params ? "?" + params : ""}`),
  getItemCategories:  ()            => request("GET", "/items/categories"),
  getItemCategories2: ()            => request("GET", "/items/categories2"),
  getNextItemCode:    ()            => request("GET", "/items/next-code"),
  createItem:         (body)        => request("POST",   "/items", body),
  updateItem:         (id, body)    => request("PUT",    `/items/${id}`, body),
  deleteItem:         (id)          => request("DELETE", `/items/${id}`),

  // Vendor List
  getVendors:     (params = "") => request("GET",    `/vendors${params ? "?" + params : ""}`),
  createVendor:   (body)        => request("POST",   "/vendors", body),
  updateVendor:   (id, body)    => request("PUT",    `/vendors/${id}`, body),
  deleteVendor:   (id)          => request("DELETE", `/vendors/${id}`),

  // Item-Vendors
  getItemVendors:     (params = "") => request("GET",    `/item-vendors${params ? "?" + params : ""}`),
  getVendorsList:     ()            => request("GET",    "/item-vendors/vendors-list"),
  getItemsList:       ()            => request("GET",    "/item-vendors/items-list"),
  linkVendor:         (body)        => request("POST",   "/item-vendors", body),
  updateLink:         (item_code, vendor_code, body) => request("PUT",    `/item-vendors/${item_code}/${vendor_code}`, body),
  deleteLink:         (item_code, vendor_code)       => request("DELETE", `/item-vendors/${item_code}/${vendor_code}`),
  getDocs:            (vendor_code) => request("GET",    `/item-vendors/documents/${vendor_code}`),
  addDoc:             (body)        => request("POST",   "/item-vendors/documents", body),
  deleteDoc:          (id)          => request("DELETE", `/item-vendors/documents/${id}`),

  // BOM Disaster
  getBom:       (params = "") => request("GET",    `/bom-disaster${params ? "?" + params : ""}`),
  createBom:    (body)        => request("POST",   "/bom-disaster", body),
  updateBom:    (code, body)  => request("PUT",    `/bom-disaster/${encodeURIComponent(code)}`, body),
  deleteBom:    (code)        => request("DELETE", `/bom-disaster/${encodeURIComponent(code)}`),

  // Stock Batches
  getStockBatches:  (params = "") => request("GET",    `/stock-batches${params ? "?" + params : ""}`),
  getStockSummary:  ()            => request("GET",    "/stock-batches/summary"),
  createStockBatch: (body)        => request("POST",   "/stock-batches", body),
  updateStockBatch: (id, body)    => request("PUT",    `/stock-batches/${id}`, body),
  issueStock:       (id, body)    => request("POST",   `/stock-batches/${id}/issue`, body),
  deleteStockBatch: (id)          => request("DELETE", `/stock-batches/${id}`),

  // Admin — users
  getUsers:       ()      => request("GET",   "/admin/users"),
  createUser:     (body)  => request("POST",  "/admin/users", body),
  deleteUser:     (id)    => request("DELETE", `/admin/users/${id}`),
  toggleUser:     (id)    => request("PATCH", `/admin/users/${id}/toggle`),
  resetPassword:  (id, password) => request("PATCH", `/admin/users/${id}/password`, { password })
};

// Trigger browser download from a blob
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
