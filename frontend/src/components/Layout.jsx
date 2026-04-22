import { useEffect, useState } from "react";
import { Outlet, NavLink, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import img5 from '../../static/images/img5.png';

const NAV = [
  { to: "/dashboard", icon: "⌂", label: "Dashboard" },
  { to: "/packages",  icon: "📦", label: "Kits Information" },
];

const ADMIN_NAV = [
  { to: "/admin/upload", icon: "↑", label: "Upload Excel" },
  { to: "/admin/users",  icon: "👥", label: "Users" },
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

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  return (
    <div className="app-shell">
      {/* ── Topbar ── */}
      <header className="topbar">
        <div className="topbar-left">
             <img src={img5} alt="Logo" style={{ height: '44px', width: '110px', margin: '5px 0px' }} />
          
          <button
            type="button"
            className="menu-toggle"
            onClick={() => setNavOpen((o) => !o)}
          >
            ☰
          </button>
        </div>
        
        <div className="topbar-center">
          <nav className={`topbar-nav ${navOpen ? 'open' : ''}`}>
             {NAV.map(n => (
               <NavLink
                 key={n.to}
                 to={n.to}
                 className={({ isActive }) => "topbar-nav-link" + (isActive ? " active" : "")}
               >
                 <span className="nav-icon">{n.icon}</span>
                 {n.label}
               </NavLink>
             ))}
             {isAdmin && ADMIN_NAV.map(n => (
               <NavLink
                 key={n.to}
                 to={n.to}
                 className={({ isActive }) => "topbar-nav-link" + (isActive ? " active" : "")}
               >
                 <span className="nav-icon">{n.icon}</span>
                 {n.label}
               </NavLink>
             ))}
          </nav>
        </div>

        <div className="topbar-right">
          <span className="user-name">👤 {user?.username}</span>
          <span className={`badge-role ${user?.role}`}>{user?.role}</span>
          <button className="btn-logout" onClick={handleLogout}>⍈</button>
        </div>
      </header>

      {/* ── Page content ── */}
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}
