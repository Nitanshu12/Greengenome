import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "../styles/landing.css";
import logo from '../../static/images/img5.png'
import railtel from '../../static/images/Railtel.png'
import aa from '../../static/images/img3.png'
import aa2 from '../../static/images/img2.png'
// Country/state data for maps
const DATA = {
  countries: [
    {
      name: "Philippines",
      coords: [13.41, 122.56],
      kits: "01",
      org: "Department of Social Welfare and Development (DSWD)",
      contact: "Paul D. Ledesma",
      email: "pdledesma@dswd.gov.ph",
      phone: "+63 917 6337201",
      link: "/country/philippines",
    },
    {
      name: "Sri Lanka",
      coords: [7.87, 80.77],
      kits: "02",
      org: "SLAF Hospital",
      contact: "Commanding Officer",
      phone: "+94 71 777 0739",
      link: "/country/srilanka",
    },
    {
      name: "Jamaica",
      coords: [18.1, -77.29],
      kits: "11",
      org: "Disaster Management",
      contact: "Alvin Gayle",
      phone: "+1 876",
      link: "/country/jamaica",
    },
    {
      name: "Cuba",
      coords: [21.52, -77.78],
      kits: "01",
      org: "Government of Cuba",
      extra: "Hospital gifted",
      link: "/country/cuba",
    },
    {
      name: "Cyprus",
      coords: [35.12, 33.43],
      kits: "01",
      org: "India High Commission",
      link: "/country/cyprus",
    },
    {
      name: "Maldives",
      coords: [3.2, 73.22],
      kits: "02",
      org: "Government of Maldives",
      contact: "President",
      link: "/country/maldives",
    },
  ],
  states: [{ name: "Jharkhand", coords: [23.61, 85.27], kits: "01" }],
};

const customIcon = L.icon({
  iconUrl: "https://cdn-icons-png.flaticon.com/512/684/684908.png",
  iconSize: [30, 30],
});

export default function LandingPage() {
  const worldMapRef = useRef(null);
  const indiaMapRef = useRef(null);
  const worldMapInstance = useRef(null);
  const indiaMapInstance = useRef(null);

  const [menuOpen, setMenuOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalData, setModalData] = useState(null);
  const [formData, setFormData] = useState({ name: "", email: "", subject: "", message: "" });
  const [formMsg, setFormMsg] = useState("");

  // Initialize Leaflet maps once on mount
  useEffect(() => {
    if (worldMapInstance.current || !worldMapRef.current) return;

    worldMapInstance.current = L.map(worldMapRef.current).setView([20, 0], 2);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png").addTo(
      worldMapInstance.current
    );

    DATA.countries.forEach((c) => {
      L.marker(c.coords, { icon: customIcon })
        .addTo(worldMapInstance.current)
        .bindTooltip(`<b>${c.name}</b>`, { direction: "top", offset: [0, -20] })
        .on("click", () => openModal(c));
    });

    indiaMapInstance.current = L.map(indiaMapRef.current).setView([22.5, 80], 5);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png").addTo(
      indiaMapInstance.current
    );

    DATA.states.forEach((s) => {
      L.circleMarker(s.coords, {
        radius: 9,
        fillColor: "#ff5733",
        color: "#fff",
        fillOpacity: 1,
      })
        .addTo(indiaMapInstance.current)
        .bindTooltip(`<b>${s.name}</b>`)
        .on("click", () => openModal(s));
    });

    // Force map tiles to render correctly after layout settles
    setTimeout(() => {
      worldMapInstance.current?.invalidateSize();
      indiaMapInstance.current?.invalidateSize();
    }, 300);

    return () => {
      worldMapInstance.current?.remove();
      indiaMapInstance.current?.remove();
      worldMapInstance.current = null;
      indiaMapInstance.current = null;
    };
  }, []);

  // Close modal on Escape key
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") setModalOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  function openModal(data) {
    setModalData(data);
    setModalOpen(true);
  }

  function handleFormChange(e) {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  async function handleContactSubmit(e) {
    e.preventDefault();
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      const result = await res.json();
      if (res.ok) {
        setFormMsg("✅ Message sent successfully!");
        setFormData({ name: "", email: "", subject: "", message: "" });
      } else {
        setFormMsg("❌ " + result.error);
      }
    } catch {
      setFormMsg("❌ Server error");
    }
  }

  return (
    <div className="landing-page">

      {/* ===== NAVBAR ===== */}
      <div className="landing-navbar">
        <div className="landing-logo">
          <img src={logo} alt="Green Genome Logo" />
        </div>
        <div className={`landing-menu${menuOpen ? " active" : ""}`}>
          <a href="#home">Home</a>
          <a href="#about">About Us</a>
          <a href="#services">Services</a>
          <a href="#cube">Cube</a>
          <a href="#contact">Contact Us</a>
        </div>
        <div className={`landing-menu${menuOpen ? " active" : ""}`}>
          <Link to="/login">Login</Link>
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

      {/* ===== HEADER CARDS ===== */}
      <div className="header-grid">
        <div className="header-card">
          <a href="https://www.railtel.in/" target="_blank" rel="noreferrer">
            <img src={railtel} alt="Railtel" />
          </a>
        </div>
        <div className="header-card">
          <a href="https://www.greengenome.in/" target="_blank" rel="noreferrer">
            <img src={aa} alt="Green Genome" />
          </a>
        </div>
        <div className="header-card">
          <a href="https://www.india.gov.in/" target="_blank" rel="noreferrer">
            <img src="/images/img1.png" alt="India Gov" />
          </a>
        </div>
        <div className="header-card">
          <a href="https://www.greengenome.in/" target="_blank" rel="noreferrer">
            <img src={aa2} alt="Green Genome 2" />
          </a>
        </div>
        <div className="header-card">
          <a href="https://www.greengenome.in/" target="_blank" rel="noreferrer">
            <img src="/images/img5.png" alt="Green Genome 5" />
          </a>
        </div>
      </div>

      {/* ===== CORE SECTORS ===== */}
      <section id="services" className="ops-section">

        <div className="ops-header">
          <h2>Core Sectors</h2>
          <p>Driving universal health coverage through strategic innovation.</p>
        </div>

        {/* Three strength cards */}
        <div className="strengths-container">
          <div className="strength-card">
            <h3>Standardized Operations</h3>
            <p>Uniform protocols across all medical and technical deployment units for consistent excellence.</p>
          </div>
          <div className="strength-card">
            <h3>Technical Expertise</h3>
            <p>Specialized team in Genomics, AI-Diagnostics, and Medical Logistics pushing tech boundaries.</p>
          </div>
          <div className="strength-card">
            <h3>Service Excellence</h3>
            <p>Achieving 98.8% sensitivity in diagnostics with 24/7 localized operational support.</p>
          </div>
        </div>

        {/* Three sector rows */}
        <div className="sectors-list">

          <div className="sector-row">
            <div className="icon-box">
              <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path d="M19 3H5c-1.1 0-1.99.9-1.99 2L3 19c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-1 11h-4v4h-4v-4H6v-4h4V6h4v4h4v4z" />
              </svg>
            </div>
            <div className="sector-content">
              <h3>Healthcare</h3>
              <ul>
                <li>Clinical Laboratories</li>
                <li>Hospital Management</li>
                <li>Tele-Health Systems</li>
                <li>BMyAlly Companion Services</li>
              </ul>
            </div>
          </div>

          <div className="sector-row">
            <div className="icon-box">
              <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path d="M4 10v7h3v-7H4zm6 0v7h3v-7h-3zM2 22h19v-3H2v3zm14-12v7h3v-7h-3zm-4.5-9L2 6v2h19V6l-9.5-5z" />
              </svg>
            </div>
            <div className="sector-content">
              <h3>Infrastructure</h3>
              <ul>
                <li>BHISHM Cube Modular Units</li>
                <li>Diagnostic Lab Setups</li>
                <li>Pneumatic Tube Systems</li>
                <li>Hospital Verifications</li>
              </ul>
            </div>
          </div>

          <div className="sector-row">
            <div className="icon-box">
              <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 3L2 12h3v8h6v-6h2v6h6v-8h3L12 3zm1 11h-2v-2h2v2zm0-4h-2V7h2v3z" />
              </svg>
            </div>
            <div className="sector-content">
              <h3>Biotechnology</h3>
              <ul>
                <li>T-SPOT TB Detection</li>
                <li>Soil Genomics</li>
                <li>Sustainable Agri-tech</li>
                <li>Biotech Research &amp; R&amp;D</li>
              </ul>
            </div>
          </div>

        </div>
      </section>

      {/* ===== CTA CARDS ===== */}
      <div className="cta-container">
        <a
          href="https://www.digitalhealthnews.com/green-genome-unveils-bhishm-cube-as-a-disaster-management-innovation-under-project-aarogya-maitri"
          className="big-cta-btn btn-alt"
          target="_blank"
          rel="noreferrer"
        >
          <div className="cta-text">
            <h3>BHISHM Cube</h3>
            <p>Introducing India's innovative AAROGYA MAITRI BHISHM CUBE</p>
          </div>
          <div className="cta-icon">
            <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z" />
            </svg>
          </div>
        </a>

        <a
          href="https://chintan.indiafoundation.in/articles/india-launches-aarogya-maitri-project-and-global-south-centre-of-excellence-a-beacon-of-hope-for-developing-nations/"
          className="big-cta-btn btn-alt"
          target="_blank"
          rel="noreferrer"
        >
          <div className="cta-text">
            <h3>Aarogya Maitri</h3>
            <p>India Launches 'Aarogya Maitri' Project and Global-South Centre of Excellence: A Beacon of Hope for Developing Nations</p>
          </div>
          <div className="cta-icon">
            <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z" />
            </svg>
          </div>
        </a>

        <a
          href="https://medicalbuyer.co.in/bhishm-cube-showcased-at-maharashtra-sadan/"
          className="big-cta-btn btn-alt"
          target="_blank"
          rel="noreferrer"
        >
          <div className="cta-text">
            <h3>PROJECT BHISHM</h3>
            <p>BHISM Cube Showcase in Maharashtra Sadan</p>
          </div>
          <div className="cta-icon">
            <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z" />
            </svg>
          </div>
        </a>
      </div>

      {/* ===== OUR PRESENCE (MAPS) ===== */}
      <section id="Maps" className="landing-section">
        <div className="section-title">
          <h2>Our Presence</h2>
        </div>
        <div className="map-section">
          <div>
            <h4>Global Map</h4>
            <div ref={worldMapRef} className="map" />
          </div>
          <div>
            <h4>India Map</h4>
            <div ref={indiaMapRef} className="map" />
          </div>
        </div>
      </section>

      {/* ===== MODAL ===== */}
      {modalOpen && (
        <div className="landing-modal" onClick={() => setModalOpen(false)}>
          <div className="landing-modal-content" onClick={(e) => e.stopPropagation()}>
            <span className="close-btn" onClick={() => setModalOpen(false)}>
              ✖
            </span>
            <h3>{modalData?.name}</h3>
            {modalData?.kits && (
              <div className="card-box">
                <b>📦 Kits:</b> {modalData.kits}
              </div>
            )}
            {modalData?.org && (
              <div className="card-box">
                <b>🏢 Organization:</b>
                <br />
                {modalData.org}
              </div>
            )}
            {modalData?.contact && (
              <div className="card-box">
                <b>👤 Contact:</b> {modalData.contact}
              </div>
            )}
            {modalData?.email && (
              <div className="card-box">
                <b>📧 Email:</b> {modalData.email}
              </div>
            )}
            {modalData?.phone && (
              <div className="card-box">
                <b>📞 Phone:</b> {modalData.phone}
              </div>
            )}
            {modalData?.extra && (
              <div className="card-box">{modalData.extra}</div>
            )}
            {modalData?.link && (
              <div style={{ marginTop: 15 }}>
                <button
                  className="action-btn"
                  onClick={() => (window.location.href = modalData.link)}
                >
                  🌐 Open Country Page
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===== GALLERY ===== */}
      <section id="gallery" className="landing-section">
        <div className="section-title">
          <h2>Gallery</h2>
        </div>
        <div className="gallery-grid">
          {["static/images/a1.png", "static/images/a2.png", "static/images/a3.png", "static/images/a4.png"].map((src, i) => (
            <img key={i} src={src} className="gallery-img" alt={`gallery-${i}`} />
          ))}
        </div>
      </section>

      {/* ===== CONTACT ===== */}
      <section id="contact" className="landing-section">
        <div className="container">
          <div className="section-title">
            <h2>CONTACT US</h2>
          </div>
          <div className="contact-wrapper">

            {/* Left — contact info */}
            <div className="contact-info">
              <div className="info-box">
                <div className="info-icon">📍</div>
                <div>
                  <h4>Address</h4>
                  <p>
                    Green Genome India Pvt Ltd,
                    <br />
                    E-27 Lower Ground, Naraina Vihar,
                    <br />
                    New Delhi, India
                  </p>
                </div>
              </div>
              <div className="info-box">
                <div className="info-icon">📞</div>
                <div>
                  <h4>Call Us</h4>
                  <p>+91 9212142739</p>
                </div>
              </div>
              <div className="info-box">
                <div className="info-icon">✉️</div>
                <div>
                  <h4>Email Us</h4>
                  <p>info@greengenome.in</p>
                </div>
              </div>
            </div>

            {/* Right — contact form */}
            <div className="contact-form">
              <form onSubmit={handleContactSubmit}>
                <div className="form-row">
                  <input
                    type="text"
                    name="name"
                    placeholder="Your Name"
                    value={formData.name}
                    onChange={handleFormChange}
                    required
                  />
                  <input
                    type="email"
                    name="email"
                    placeholder="Your Email"
                    value={formData.email}
                    onChange={handleFormChange}
                    required
                  />
                </div>
                <input
                  type="text"
                  name="subject"
                  placeholder="Subject"
                  value={formData.subject}
                  onChange={handleFormChange}
                  required
                />
                <textarea
                  name="message"
                  rows={6}
                  placeholder="Message"
                  value={formData.message}
                  onChange={handleFormChange}
                  required
                />
                <button type="submit">Send Message</button>
              </form>
              {formMsg && <p className="form-message">{formMsg}</p>}
            </div>
          </div>
        </div>
      </section>

      {/* ===== FOOTER ===== */}
      <div className="landing-footer">
        <div className="footer-grid">
          <div>
            <b>Green Genome</b>
            <br />
            Global healthcare system
          </div>
          <div>
            <b>Links</b>
            <br />
            Dashboard
            <br />
            Drive
          </div>
          <div>
            <b>Contact</b>
            <br />
            Email
            <br />
            Phone
          </div>
          <div>
            <b>Social</b>
            <br />
            LinkedIn
            <br />
            Twitter
          </div>
        </div>
      </div>

    </div>
  );
}
