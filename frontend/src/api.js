
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
  if (contentType.includes("spreadsheet") || contentType.includes("octet-stream") || contentType.includes("wordprocessingml")) {
    if (!res.ok) throw new Error("Download failed");
    return res.blob();
  }

  const data = await res.json();
  if (res.status === 401) {
    // Notify useAuth so it can redirect through React Router.
    // api.js has no React context, so the decision of whether to redirect
    // belongs in useAuth (only redirect if user WAS logged in).
    window.dispatchEvent(new CustomEvent("auth:unauthorized"));
    throw new Error(data.error || "Session expired. Please log in again.");
  }
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
  getDocs:            (item_code)   => request("GET",    `/item-documents/${item_code}`),
  addDoc:             (body)        => request("POST",   "/item-documents", body),
  uploadDoc:          (formData)    => request("POST",   "/item-documents/upload", formData, true),
  deleteDoc:          (id)          => request("DELETE", `/item-documents/${id}`),

  getBatchDocs:       (batch_id)    => request("GET",    `/batch-documents/${batch_id}`),
  addBatchDoc:        (body)        => request("POST",   "/batch-documents", body),
  uploadBatchDoc:     (formData)    => request("POST",   "/batch-documents/upload", formData, true),
  deleteBatchDoc:     (id)          => request("DELETE", `/batch-documents/${id}`),

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

  // Kit Assembly
  createKit:     (body) => request("POST", "/kit-assembly/create", body),
  getKitHistory: ()     => request("GET",  "/kit-assembly/history"),
  getKitDetails: (id)   => request("GET",  `/kit-assembly/${id}/details`),
  cancelKit:     (id)   => request("POST", `/kit-assembly/${id}/cancel`),
  completeKit:   (id)   => request("POST", `/kit-assembly/${id}/complete`),

  // Purchase Orders
  createPO:         (body)       => request("POST",  "/purchase-orders", body),
  getPOs:           ()           => request("GET",   "/purchase-orders"),
  getPODetails:     (id)         => request("GET",   `/purchase-orders/${id}`),
  downloadPO:       (id)         => request("GET",   `/purchase-orders/${id}/download`),
  updatePOStatus:   (id, status) => request("PATCH", `/purchase-orders/${id}/status`, { status }),
  getActivePOItems: ()           => request("GET",   "/purchase-orders/active-items"),
  getPOsForItem:    (item_code)  => request("GET",   `/purchase-orders/for-item/${encodeURIComponent(item_code)}`),
  getSentPOs:          ()        => request("GET",   "/purchase-orders/sent"),
  getPOItemsStatus:    (id)      => request("GET",   `/purchase-orders/${id}/items-status`),
  receivePO:           (body)    => request("POST",  "/stock-batches/receive-po", body),

  // Sub-Kits
  getSubKits:    ()             => request("GET",    "/sub-kits"),
  createSubKit:  (body)         => request("POST",   "/sub-kits", body),
  updateSubKit:  (code, body)   => request("PUT",    `/sub-kits/${encodeURIComponent(code)}`, body),
  deleteSubKit:  (code)         => request("DELETE", `/sub-kits/${encodeURIComponent(code)}`),

  // Cube/Box Template
  getKitBoxTemplate:    ()           => request("GET",    "/kit-box-template"),
  createKitBoxTemplate: (body)       => request("POST",   "/kit-box-template", body),
  updateKitBoxTemplate: (id, body)   => request("PUT",    `/kit-box-template/${id}`, body),
  deleteKitBoxTemplate: (id)         => request("DELETE", `/kit-box-template/${id}`),

  // Outward / Delivery Challans
  getChallans:             ()           => request("GET",  "/outward"),
  getOutwardStockPreview:  (item_code)  => request("GET",  `/outward/stock-preview?item_code=${encodeURIComponent(item_code)}`),
  getChallanDetail:        (id)         => request("GET",  `/outward/${id}`),
  createChallan:           (body)       => request("POST", "/outward", body),
  cancelChallan:           (id)         => request("PUT",  `/outward/${id}/cancel`, {}),
  returnChallan:           (id)         => request("PUT",  `/outward/${id}/return`, {}),

  // Inventory Transactions
  getInventoryTransactions:  ()             => request("GET",    "/inventory-transactions"),
  getInventoryTransaction:   (id)           => request("GET",    `/inventory-transactions/${id}`),
  generateInventoryTxn:      (kit_id)       => request("POST",   `/inventory-transactions/generate/${kit_id}`),
  updateInventoryTxnItem:    (id, itemId, body) => request("PUT",    `/inventory-transactions/${id}/items/${itemId}`, body),
  deleteInventoryTxnItem:    (id, itemId)   => request("DELETE", `/inventory-transactions/${id}/items/${itemId}`),
  finalizeInventoryTxn:      (id)           => request("POST",   `/inventory-transactions/${id}/finalize`, {}),
  syncInventoryTxn:          (id)           => request("POST",   `/inventory-transactions/${id}/sync`, {}),

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
