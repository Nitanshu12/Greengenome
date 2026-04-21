import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import "../styles/login.css";

// Import images as modules for production-safe loading
import img1 from "../../static/images/img1.png";
import img6 from "../../static/images/img6.png";
import img5 from "../../static/images/img5.png";

export default function Login() {
  const { login }   = useAuth();
  const navigate    = useNavigate();
  const [form, setForm]       = useState({ username: "", password: "" });
  const [error, setError]     = useState("");
  const [loading, setLoading] = useState(false);
  const [activeSlide, setActiveSlide] = useState(0);
  const timerRef = useRef(null);

  const slides = [
    img1,
    img6,
    img5
  ];

  useEffect(() => {
    timerRef.current = setInterval(() => {
      setActiveSlide(prev => (prev + 1) % slides.length);
    }, 2500);
    return () => clearInterval(timerRef.current);
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(form.username, form.password);
      navigate("/dashboard");
    } catch (err) {
      setError(err.message || "Invalid credentials");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Arial&display=swap');
      `}</style>

      <div className="gg-body">
        <div className="login-wrapper">

          {/* ── LEFT SLIDER ── */}
          <div className="login-left">
            {slides.map((src, i) => (
              <div key={i} className={`slide ${activeSlide === i ? "active" : ""}`}>
                <img src={src} alt={`slide-${i}`} />
              </div>
            ))}
            <div className="slider-text">
              <h2>🌿 Green Genome</h2>
              <p>Healthcare • Smart Tracking</p>
            </div>
          </div>

          {/* ── RIGHT FORM ── */}
          <div className="login-right">
            {/* <div className="login-box"> */}
              <h3>🔐 Login</h3>

              {error && <div className="login-error">{error}</div>}

              <form onSubmit={handleSubmit}>
                <input
                  className="form-control"
                  type="text"
                  name="username"
                  placeholder="Username"
                  autoComplete="username"
                  autoFocus
                  required
                  value={form.username}
                  onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
                />
                <input
                  className="form-control"
                  type="password"
                  name="password"
                  placeholder="Password"
                  autoComplete="current-password"
                  required
                  value={form.password}
                  onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                />
                <button className="btn-login" type="submit" disabled={loading}>
                  {loading
                    ? <><div className="gg-spinner" /> Logging in…</>
                    : "Login"}
                </button>
              </form>

            {/* </div> */}
          </div>

        </div>
      </div>
    </>
  );
}