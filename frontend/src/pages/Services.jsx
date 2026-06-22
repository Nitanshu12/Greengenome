import { useLayoutEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import "../styles/landing.css";
import "../styles/services.css";
import logo from "../../static/images/img5.png";
import service1 from "../../static/images/Service1.png";
import service2 from "../../static/images/Service2.png";
import service3 from "../../static/images/Service3.png";
import service4 from "../../static/images/Service4.png";

gsap.registerPlugin(ScrollTrigger);

const SERVICES = [
  {
    title: "Healthcare Solutions",
    description:
      "We bridge the gap in clinical diagnostics and medical support through advanced technology and reliable infrastructure.",
    bullets: [
      "24-Hour Clinical Laboratory Operations",
      "High-End Diagnostic Equipment Supply",
      "Integrated Hospital Verification (360 Connect)",
      "Corporate Health Screening Programs",
    ],
    image: service1,
  },
  {
    title: "Diagnostic Excellence",
    description:
      "Our labs are equipped with the latest automated analyzers for precise and timely results.",
    bullets: [
      "Latent TB Detection (T-SPOT/ELISPOT)",
      "Biochemistry & Immunoassay",
      "Hematology & Flow Cytometry",
      "Real-time AI Analytics for Lab Reports",
    ],
    image: service2,
  },
  {
    title: "Mobilab Innovation",
    description:
      'A "Lab-on-Wheels" concept designed to reach rural and underserved populations across India.',
    bullets: [
      "Point-of-care testing in remote areas",
      "Cloud-integrated reporting systems",
      "Sustainable, energy-efficient mobile units",
      "Community Health Camp Support",
    ],
    image: service3,
  },
  {
    title: "Sustainable Agriculture",
    description:
      "Integrating biotech with farming to optimize resources and increase crop yields.",
    bullets: [
      "Soil Health & Genomic Analysis",
      "Precision Farming Technology",
      "Organic Farming Support & Training",
    ],
    image: service4,
  },
];

export default function Services() {
  const [menuOpen, setMenuOpen] = useState(false);
  const listRef = useRef(null);

  // GSAP ScrollTrigger drives the fade/slide-in on each row as it enters
  // the viewport. useLayoutEffect (not useEffect) so the hidden start state
  // is applied before the browser paints, avoiding a flash of visible content.
  useLayoutEffect(() => {
    const ctx = gsap.context(() => {
      const rows = gsap.utils.toArray(".service-row");
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      rows.forEach((row) => {
        if (reduceMotion) {
          gsap.set(row, { opacity: 1, y: 0 });
          return;
        }

        gsap.fromTo(
          row,
          { opacity: 0, y: 60 },
          {
            opacity: 1,
            y: 0,
            duration: 0.9,
            ease: "power2.out",
            scrollTrigger: {
              trigger: row,
              start: "top 85%",
              toggleActions: "play none none none",
            },
          }
        );
      });
    }, listRef);

    return () => ctx.revert();
  }, []);

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

      {/* ===== HERO ===== */}
      <section className="services-hero">
        <h1>Our Specialized Services</h1>
        <p>
          Empowering healthcare, agriculture, and biotechnology through innovative diagnostics
          and sustainable technology solutions.
        </p>
      </section>

      {/* ===== SERVICE ROWS ===== */}
      <section className="services-list" ref={listRef}>
        {SERVICES.map((service, i) => (
          <div
            key={service.title}
            className={`service-row${i % 2 === 1 ? " reverse" : ""}`}
          >
            <div className="service-media">
              <img src={service.image} alt={service.title} className="service-media-img" />
            </div>
            <div className="service-content">
              <h2>{service.title}</h2>
              <p>{service.description}</p>
              <ul>
                {service.bullets.map((bullet) => (
                  <li key={bullet}>{bullet}</li>
                ))}
              </ul>
            </div>
          </div>
        ))}
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
