import { useState } from "react";
import { Link } from "react-router-dom";
import "../styles/landing.css";
import logo from "../../static/images/img5.png";

export default function Contact() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [formData, setFormData] = useState({ name: "", email: "", subject: "", message: "" });
  const [formMsg, setFormMsg] = useState("");

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
          <a href="/#home">Home</a>
          <Link to="/about">About Us</Link>
          <Link to="/services">Services</Link>
          <Link to="/cube">Cube</Link>
          <Link to="/contact">Contact Us</Link>
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

      {/* ===== CONTACT ===== */}
      <section className="landing-section contact-section">
        <div className="container">
          <div className="section-title">
            <h2>Contact Us</h2>
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
            Advancing universal health coverage through innovation and technology.
          </div>
          <div>
            <b>Links</b>
            <br />
            BHISM CUBE
            <br />
            ABOUT LEADERSHIP
          </div>
          <div>
            <b>Contact</b>
            <br />
            Email: info@greengenome.in
            <br />
            Phone: +91 [Your Number]
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
