import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import "../styles/landing.css";
import "../styles/cube.css";
import logo from "../../static/images/img5.png";

// BHISHM Cube slide deck, in presentation order
import slide1 from "../../static/images/image.png";
import slide2 from "../../static/images/image copy.png";
import slide3 from "../../static/images/image copy 2.png";
import slide4 from "../../static/images/image copy 3.png";
import slide5 from "../../static/images/image copy 4.png";
import slide6 from "../../static/images/image copy 5.png";
import slide7 from "../../static/images/image copy 6.png";
import slide8 from "../../static/images/image copy 7.png";
import slide9 from "../../static/images/image copy 8.png";
import slide10 from "../../static/images/image copy 9.png";
import slide11 from "../../static/images/image copy 10.png";
import slide12 from "../../static/images/image copy 11.png";
import slide13 from "../../static/images/image copy 12.png";
import slide14 from "../../static/images/image copy 13.png";
import slide15 from "../../static/images/image copy 14.png";
import slide16 from "../../static/images/image copy 15.png";
import slide17 from "../../static/images/image copy 16.png";
import slide18 from "../../static/images/image copy 17.png";

const SLIDES = [
  slide1, slide2, slide3, slide4, slide5, slide6, slide7, slide8, slide9,
  slide10, slide11, slide12, slide13, slide14, slide15, slide16, slide17, slide18,
];

const SLIDE_INTERVAL_MS = 3000;

export default function Cube() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeSlide, setActiveSlide] = useState(0);
  const timerRef = useRef(null);

  function startTimer() {
    clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setActiveSlide((prev) => (prev + 1) % SLIDES.length);
    }, SLIDE_INTERVAL_MS);
  }

  useEffect(() => {
    startTimer();
    return () => clearInterval(timerRef.current);
  }, []);

  function goPrev() {
    setActiveSlide((prev) => (prev - 1 + SLIDES.length) % SLIDES.length);
    startTimer();
  }

  function goNext() {
    setActiveSlide((prev) => (prev + 1) % SLIDES.length);
    startTimer();
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
      <section className="cube-hero">
        <h1>BHISHM Cube</h1>
      </section>

      {/* ===== SLIDESHOW ===== */}
      <section className="cube-slideshow-section">
        <div className="cube-slideshow">
          <button
            type="button"
            className="cube-arrow cube-arrow-left"
            onClick={goPrev}
            aria-label="Previous slide"
          >
            &#8249;
          </button>

          <div className="cube-slide-frame">
            {SLIDES.map((src, i) => (
              <div key={i} className={`cube-slide${activeSlide === i ? " active" : ""}`}>
                <img src={src} alt={`BHISHM Cube slide ${i + 1}`} />
              </div>
            ))}
          </div>

          <button
            type="button"
            className="cube-arrow cube-arrow-right"
            onClick={goNext}
            aria-label="Next slide"
          >
            &#8250;
          </button>
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
