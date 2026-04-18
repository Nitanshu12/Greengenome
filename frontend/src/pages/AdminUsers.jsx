import { useEffect, useState } from "react";
import { api } from "../api";
import { useToast } from "../components/Toast";

function Modal({ title, onClose, children }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-title">{title}</div>
        {children}
      </div>
    </div>
  );
}

export default function AdminUsers() {
  const { toast } = useToast();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [resetTarget, setResetTarget] = useState(null);
  const [form, setForm] = useState({ username: "", password: "", role: "user" });
  const [newPass, setNewPass] = useState("");
  const [saving, setSaving] = useState(false);

  const loadUsers = () => {
    api.getUsers()
      .then(d => setUsers(d.data))
      .catch(e => toast(e.message, "error"))
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadUsers(); }, []);

  const handleCreate = async () => {
    if (!form.username || !form.password) {
      toast("Username and password required", "error");
      return;
    }
    setSaving(true);
    try {
      const res = await api.createUser(form);
      toast(res.msg);
      setShowCreate(false);
      setForm({ username: "", password: "", role: "user" });
      loadUsers();
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id, username) => {
    if (!confirm(`Delete user "${username}"?`)) return;
    try {
      const res = await api.deleteUser(id);
      toast(res.msg);
      loadUsers();
    } catch (e) {
      toast(e.message, "error");
    }
  };

  const handleToggle = async (id) => {
    try {
      const res = await api.toggleUser(id);
      toast(res.msg);
      loadUsers();
    } catch (e) {
      toast(e.message, "error");
    }
  };

  const handleResetPassword = async () => {
    if (!newPass.trim()) { toast("Password required", "error"); return; }
    setSaving(true);
    try {
      const res = await api.resetPassword(resetTarget._id, newPass);
      toast(res.msg);
      setResetTarget(null);
      setNewPass("");
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setSaving(false);
    }
  };

  const roleTag = (role) => {
    const map = { superadmin: "tag-red", admin: "tag-blue", user: "tag-gray" };
    return <span className={`tag ${map[role] || "tag-gray"}`}>{role}</span>;
  };

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-title">Users</div>
          <div className="page-sub">{users.length} total users</div>
        </div>
        <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
          + Create User
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 60 }}><div className="spinner" /></div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Username</th>
                <th>Role</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u._id}>
                  <td style={{ fontWeight: 500 }}>{u.username}</td>
                  <td>{roleTag(u.role)}</td>
                  <td>
                    <span className={`tag ${u.disabled ? "tag-red" : "tag-green"}`}>
                      {u.disabled ? "Disabled" : "Active"}
                    </span>
                  </td>
                  <td>
                    <div className="flex gap-2">
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => handleToggle(u._id)}
                      >
                        {u.disabled ? "Enable" : "Disable"}
                      </button>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => { setResetTarget(u); setNewPass(""); }}
                      >
                        Reset PW
                      </button>
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={() => handleDelete(u._id, u.username)}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create user modal */}
      {showCreate && (
        <Modal title="Create User" onClose={() => setShowCreate(false)}>
          <div className="form-group">
            <label className="form-label">Username</label>
            <input className="form-input" value={form.username}
              onChange={e => setForm(f => ({ ...f, username: e.target.value }))} />
          </div>
          <div className="form-group">
            <label className="form-label">Password</label>
            <input className="form-input" type="password" value={form.password}
              onChange={e => setForm(f => ({ ...f, password: e.target.value }))} />
          </div>
          <div className="form-group">
            <label className="form-label">Role</label>
            <select className="form-select" value={form.role}
              onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
              <option value="user">User</option>
              <option value="admin">Admin</option>
              <option value="superadmin">Superadmin</option>
            </select>
          </div>
          <div className="flex gap-2" style={{ marginTop: 8 }}>
            <button className="btn btn-ghost" onClick={() => setShowCreate(false)}>Cancel</button>
            <button className="btn btn-primary ml-auto" onClick={handleCreate} disabled={saving}>
              {saving ? "Creating…" : "Create User"}
            </button>
          </div>
        </Modal>
      )}

      {/* Reset password modal */}
      {resetTarget && (
        <Modal title={`Reset Password — ${resetTarget.username}`} onClose={() => setResetTarget(null)}>
          <div className="form-group">
            <label className="form-label">New Password</label>
            <input className="form-input" type="password" value={newPass}
              onChange={e => setNewPass(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleResetPassword()} />
          </div>
          <div className="flex gap-2" style={{ marginTop: 8 }}>
            <button className="btn btn-ghost" onClick={() => setResetTarget(null)}>Cancel</button>
            <button className="btn btn-primary ml-auto" onClick={handleResetPassword} disabled={saving}>
              {saving ? "Saving…" : "Reset Password"}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
