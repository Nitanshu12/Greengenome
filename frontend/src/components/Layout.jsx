import { useEffect, useState } from "react";
import { Outlet, NavLink, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import img5 from '../../static/images/img5.png';

const NAV = [
  { to: "/dashboard",     icon: "⌂",  label: "Dashboard" },
  { to: "/packages",      icon: "📦", label: "Kits Information" },
  { to: "/items-master",  icon: "🗂", label: "Items Master" },
  { to: "/vendor-list",   icon: "🏪", label: "Vendor List" },
  { to: "/item-vendors",  icon: "🔗", label: "Item — Vendors" },
  { to: "/bom-disaster",  icon: "📋", label: "BOM — Disaster" },
  { to: "/stock-batches", icon: "🏬", label: "Stock Batches" },
  { to: "/create-kit",   icon: "🧰", label: "Create Kit" },
  { to: "/po-status",    icon: "📄", label: "Purchase Orders" },
  { to: "/sub-kits",          icon: "🧩", label: "Sub-Kit Generation" },
  { to: "/cube-box-template", icon: "📐", label: "Cube / Box Template" },
  { to: "/outward",           icon: "📤", label: "Outward" },
];

const ADMIN_NAV = [
  { to: "/admin/upload", icon: "↑", label: "Upload Excel" },
  { to: "/admin/users",  icon: "👥", label: "Users" },
];

const isMobile = () =>
  typeof window !== "undefined" && window.matchMedia("(max-width: 900px)").matches;

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const isAdmin = ["admin", "superadmin"].includes(user?.role);

  // Desktop: collapsed (icon-only) vs expanded
  const [collapsed, setCollapsed] = useState(false);
  // Mobile: drawer open vs closed
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  const handleToggle = () => {
    if (isMobile()) {
      setDrawerOpen((o) => !o);
    } else {
      setCollapsed((c) => !c);
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  const sidebarClass = [
    "sidebar",
    collapsed ? "collapsed" : "",
    drawerOpen ? "open" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={"app-shell" + (collapsed ? " app-collapsed" : "")}>
      {/* ── Sidebar ── */}
      <aside className={sidebarClass}>
        <div className="sidebar-logo">
          <img src={img5} alt="Logo" />
          <button
            type="button"
            className="sidebar-collapse-btn"
            onClick={handleToggle}
            aria-label="Toggle sidebar"
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            ☰
          </button>
        </div>

        <nav className="sidebar-nav">
          <div className="sidebar-section-label">Main</div>
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              title={n.label}
              className={({ isActive }) =>
                "sidebar-link" + (isActive ? " active" : "")
              }
            >
              <span className="nav-icon">{n.icon}</span>
              <span className="nav-label">{n.label}</span>
            </NavLink>
          ))}

          {isAdmin && (
            <>
              <div className="sidebar-section-label">Admin</div>
              {ADMIN_NAV.map((n) => (
                <NavLink
                  key={n.to}
                  to={n.to}
                  title={n.label}
                  className={({ isActive }) =>
                    "sidebar-link" + (isActive ? " active" : "")
                  }
                >
                  <span className="nav-icon">{n.icon}</span>
                  <span className="nav-label">{n.label}</span>
                </NavLink>
              ))}
            </>
          )}
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-user">
            <span className="sidebar-user-avatar">👤</span>
            <div className="sidebar-user-meta">
              <span className="sidebar-user-name">{user?.username}</span>
              {user?.role && (
                <span className="sidebar-user-role">{user.role}</span>
              )}
            </div>
          </div>
          <button
            className="sidebar-logout"
            onClick={handleLogout}
            title="Logout"
          >
            <span>⍈</span> <span className="nav-label">Logout</span>
          </button>
        </div>
      </aside>

      {drawerOpen && (
        <div
          className="sidebar-backdrop"
          onClick={() => setDrawerOpen(false)}
        />
      )}

      {/* ── Content area ── */}
      <div className="content-area">
        <header className="content-topbar">
          <button
            type="button"
            className="menu-toggle mobile-only"
            onClick={handleToggle}
            aria-label="Open menu"
          >
            ☰
          </button>
          <div className="content-topbar-title">
            Arogya Maitri · BHISHM IMS
          </div>
        </header>

        <main className="main-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
