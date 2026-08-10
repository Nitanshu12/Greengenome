import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import logo from "../../static/images/img5.png";

export default function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();
  const isHomePage = location.pathname === "/";

  const closeMenu = () => setMenuOpen(false);

  return (
    <div className="landing-navbar">
      <div className="landing-logo">
        <Link to="/" onClick={closeMenu}>
          <img src={logo} alt="Green Genome Logo" />
        </Link>
      </div>

      <div className={`landing-menu${menuOpen ? " active" : ""}`}>
        <div className="landing-nav-links">
          <a href={isHomePage ? "#home" : "/#home"} onClick={closeMenu}>
            Home
          </a>
          <Link to="/about" onClick={closeMenu}>
            About Us
          </Link>
          <Link to="/services" onClick={closeMenu}>
            Services
          </Link>
          <Link to="/cube" onClick={closeMenu}>
            Cube
          </Link>
          <Link to="/contact" onClick={closeMenu}>
            Contact Us
          </Link>
        </div>
        <div className="landing-menu-login">
          <Link to="/login" className="landing-login-btn" onClick={closeMenu}>
            Login
          </Link>
        </div>
      </div>

      <div
        className="landing-menu-btn"
        onClick={() => setMenuOpen((o) => !o)}
        aria-label="Toggle menu"
      >
        <span />
        <span />
        <span />
      </div>
    </div>
  );
}
