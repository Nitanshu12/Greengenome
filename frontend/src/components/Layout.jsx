import { Outlet, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

const NAV = [
  { to: "/dashboard", icon: "▦", label: "Dashboard" },
  { to: "/packages",  icon: "⊞", label: "Packages" },
];

const ADMIN_NAV = [
  { to: "/admin/upload", icon: "↑", label: "Upload Excel" },
  { to: "/admin/users",  icon: "◎", label: "Users" },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const isAdmin = ["admin", "superadmin"].includes(user?.role);

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  return (
    <div className="app-shell">
      {/* ── Topbar ── */}
      <header className="topbar">
        <div className="topbar-logo">dash<span>.</span>kit</div>
        <div className="topbar-right">
          <span style={{ color: "var(--muted)", fontSize: 12 }}>{user?.username}</span>
          <span className={`badge-role ${user?.role}`}>{user?.role}</span>
          <button className="btn btn-ghost btn-sm" onClick={handleLogout}>Logout</button>
        </div>
      </header>

      {/* ── Sidebar ── */}
      <aside className="sidebar">
        <div className="sidebar-section">Menu</div>
        {NAV.map(n => (
          <NavLink
            key={n.to}
            to={n.to}
            className={({ isActive }) => "sidebar-link" + (isActive ? " active" : "")}
          >
            <span className="sidebar-icon">{n.icon}</span>
            {n.label}
          </NavLink>
        ))}

        {isAdmin && (
          <>
            <div className="sidebar-section" style={{ marginTop: 16 }}>Admin</div>
            {ADMIN_NAV.map(n => (
              <NavLink
                key={n.to}
                to={n.to}
                className={({ isActive }) => "sidebar-link" + (isActive ? " active" : "")}
              >
                <span className="sidebar-icon">{n.icon}</span>
                {n.label}
              </NavLink>
            ))}
          </>
        )}
      </aside>

      {/* ── Page content ── */}
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}
