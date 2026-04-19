import { useEffect, useState } from "react";
import { Outlet, NavLink, useLocation, useNavigate } from "react-router-dom";
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
  const location = useLocation();
  const isAdmin = ["admin", "superadmin"].includes(user?.role);
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    setNavOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 769px)");
    const onChange = () => {
      if (mq.matches) setNavOpen(false);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (!navOpen) return;
    const onKey = (e) => {
      if (e.key === "Escape") setNavOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navOpen]);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 768px)");
    if (!navOpen || !mq.matches) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [navOpen]);

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  return (
    <div className="app-shell">
      {/* ── Topbar ── */}
      <header className="topbar">
        <div className="topbar-left">
          <button
            type="button"
            className="menu-toggle"
            aria-expanded={navOpen}
            aria-controls="app-sidebar"
            onClick={() => setNavOpen((o) => !o)}
          >
            <span className="menu-toggle-icon" aria-hidden>
              {navOpen ? "✕" : "☰"}
            </span>
            <span className="sr-only">{navOpen ? "Close menu" : "Open menu"}</span>
          </button>
          <div className="topbar-logo">dash<span>.</span>kit</div>
        </div>
        <div className="topbar-right">
          <span style={{ color: "var(--muted)", fontSize: 12 }}>{user?.username}</span>
          <span className={`badge-role ${user?.role}`}>{user?.role}</span>
          <button className="btn btn-ghost btn-sm" onClick={handleLogout}>Logout</button>
        </div>
      </header>

      {/* ── Sidebar ── */}
      <aside id="app-sidebar" className={"sidebar" + (navOpen ? " is-open" : "")}>
        <div className="sidebar-mobile-bar">
          <span className="sidebar-mobile-title">Menu</span>
          <button
            type="button"
            className="sidebar-close"
            aria-label="Close menu"
            onClick={() => setNavOpen(false)}
          >
            ✕
          </button>
        </div>
        <div className="sidebar-section">Menu</div>
        {NAV.map(n => (
          <NavLink
            key={n.to}
            to={n.to}
            className={({ isActive }) => "sidebar-link" + (isActive ? " active" : "")}
            onClick={() => setNavOpen(false)}
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
                onClick={() => setNavOpen(false)}
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
        {navOpen && (
          <button
            type="button"
            className="nav-backdrop"
            aria-label="Close menu"
            onClick={() => setNavOpen(false)}
          />
        )}
        <Outlet />
      </main>
    </div>
  );
}
