import { useEffect, useState } from "react";

// A determinate-looking progress bar for actions with no real backend
// progress events (kit assembly, deploy). Animates toward ~92% while the
// request is in flight, snaps to 100% + a green tick the moment `done`
// flips true — gives a "loading start to end, then confirmed" feel instead
// of the request just silently resolving.
export default function ProgressLoader({ active, done, label, doneLabel, size = "md" }) {
  const [pct, setPct] = useState(0);

  useEffect(() => {
    if (!active) { setPct(0); return; }
    setPct(10);
    const id = setInterval(() => {
      setPct(p => (p < 92 ? p + (92 - p) * 0.15 + 0.6 : p));
    }, 150);
    return () => clearInterval(id);
  }, [active]);

  useEffect(() => {
    if (done) setPct(100);
  }, [done]);

  if (!active && !done) return null;

  const barWidth = size === "sm" ? 140 : 220;

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
      {done ? (
        <div style={{
          width: size === "sm" ? 22 : 56, height: size === "sm" ? 22 : 56, borderRadius: "50%",
          background: "#dcfce7", display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: size === "sm" ? 13 : 28, color: "#16a34a", animation: "progressTickPop 0.3s ease",
        }}>
          ✓
        </div>
      ) : (
        <div className="spinner" style={{ width: size === "sm" ? 16 : 32, height: size === "sm" ? 16 : 32 }} />
      )}
      <div style={{ fontWeight: 600, fontSize: size === "sm" ? 12 : 14, color: done ? "#16a34a" : "var(--text)" }}>
        {done ? (doneLabel || "Done!") : label}
      </div>
      <div style={{ width: barWidth, height: size === "sm" ? 4 : 6, borderRadius: 4, background: "var(--border)", overflow: "hidden" }}>
        <div style={{
          height: "100%", borderRadius: 4, width: `${pct}%`,
          background: done ? "#16a34a" : "var(--primary, #077B4D)",
          transition: "width 0.25s ease, background 0.3s ease",
        }} />
      </div>
    </div>
  );
}
