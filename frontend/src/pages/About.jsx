import Navbar from "../components/Navbar";
import "../styles/landing.css";
import "../styles/about.css";

const LEADERS = [
  {
    name: "Harbhajan Singh Chhabra",
    role: "30+ Years Experience Chief Executive Officer",
    bio: "A versatile leader with over 30 years of extensive experience across various industries including Healthcare, Agriculture, and Biotechnology. Specialist in business development, strategic partnerships, and innovation-driven growth.",
  },
  {
    name: "Simardeep Singh",
    role: "Strategic Visionary / Managing Director",
    bio: "A dynamic entrepreneur and industry leader with expertise spanning Healthcare, Electric Vehicles (EV), Agriculture, and Defense. Currently focused on revolutionizing healthcare accessibility through digital health screening and portable diagnostics.",
  },
];

export default function About() {
  return (
    <div className="landing-page">

      {/* ===== NAVBAR ===== */}
      <Navbar />

      {/* ===== ABOUT US ===== */}
      <section className="about-section">
        <div className="about-card">
          <h1>About Us</h1>
          <p>
            Green Genome is a pioneering force in the fields of healthcare, biotechnology, and
            sustainable agriculture, Dedicated to transforming lives through innovation and
            technology. Founded with a vision to address critical challenges in human health,
            animal husbandry, and agriculture, we leverage cutting-edge technologies to deliver
            impactful solutions that meet the diverse needs of communities across India and
            beyond. At Green Genome, we are committed to innovation and social responsibility.
            We collaborate with governments, organizations, and communities to implement
            large-scale projects that have a lasting impact. From developing state-of-the-art
            diagnostic tools to leading training initiatives for healthcare professionals, our
            goal is to make a meaningful difference in every sector we serve.
          </p>
        </div>

        <div className="vision-mission-grid">
          <div className="vision-mission-card">
            <h3>Vision</h3>
            <p>Global leader in sustainable innovation.</p>
          </div>
          <div className="vision-mission-card">
            <h3>Mission</h3>
            <ul>
              <li>Healthcare innovation</li>
              <li>Smart agriculture</li>
              <li>Global partnerships</li>
            </ul>
          </div>
        </div>
      </section>

      {/* ===== LEADERSHIP ===== */}
      <section className="leadership-section">
        <h2>Leadership</h2>
        <div className="leadership-grid">
          {LEADERS.map((leader) => (
            <div key={leader.name} className="leader-card">
              <h4>{leader.name}</h4>
              <p className="leader-role">{leader.role}</p>
              <p className="leader-bio">{leader.bio}</p>
            </div>
          ))}
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
