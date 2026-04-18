// Central API helper — all fetch calls go through here
const BASE = "/api";

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
