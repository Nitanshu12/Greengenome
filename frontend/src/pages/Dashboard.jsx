import { useEffect, useState } from "react";
import {
  Chart as ChartJS,
  CategoryScale, LinearScale,
  BarElement, ArcElement,
  Tooltip, Legend, Title
} from "chart.js";
import { Bar, Doughnut } from "react-chartjs-2";
import { api } from "../api";

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Tooltip, Legend, Title);

const CHART_COLORS = [
  "#3b82f6","#60a5fa","#22c55e","#f59e0b","#ef4444",
  "#a855f7","#06b6d4","#ec4899","#84cc16","#f97316"
];

const chartDefaults = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      labels: { color: "#6b7280", font: { family: "DM Mono", size: 11 } }
    }
  },
  scales: {
    x: {
      ticks: { color: "#6b7280", font: { family: "DM Mono", size: 11 } },
      grid: { color: "#1e2128" }
    },
    y: {
      ticks: { color: "#6b7280", font: { family: "DM Mono", size: 11 } },
      grid: { color: "#1e2128" }
    }
  }
};

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    api.dashboard()
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 300 }}>
      <div className="spinner" />
    </div>
  );

  if (error) return <div className="empty-state"><div className="empty-icon">⚠</div><p>{error}</p></div>;
  if (!data) return null;

  const { summary, charts } = data;

  const itemsPerKitData = {
    labels: charts.itemsPerKit.labels,
    datasets: [{
      label: "Items",
      data: charts.itemsPerKit.values,
      backgroundColor: CHART_COLORS[0] + "cc",
      borderColor: CHART_COLORS[0],
      borderWidth: 1,
      borderRadius: 4
    }]
  };

  const brandData = {
    labels: charts.brandDist.labels,
    datasets: [{
      data: charts.brandDist.values,
      backgroundColor: CHART_COLORS.map(c => c + "cc"),
      borderColor: "#111318",
      borderWidth: 2
    }]
  };

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-title">Dashboard</div>
          <div className="page-sub">Overview of all kits and inventory</div>
        </div>
      </div>

      {/* ── Stat Cards ── */}
      <div className="stats-grid">
        <StatCard label="Total Kits"  value={summary.kits}       />
        <StatCard label="Total Items" value={summary.totalItems}  />
        <StatCard label="Excel Files" value={summary.totalFiles}  />
        <StatCard label="Expired"     value={summary.expired}     color="red"   />
        <StatCard label="Expiring Soon" value={summary.warning}   color="amber" />
      </div>

      {/* ── Charts ── */}
      {charts.itemsPerKit.labels.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📊</div>
          <p>No data yet. Ask an admin to upload an Excel file.</p>
        </div>
      ) : (
        <div className="charts-grid">
          <div className="chart-box">
            <div className="card-title">Items per Kit</div>
            <div style={{ height: "calc(100% - 30px)" }}>
              <Bar data={itemsPerKitData} options={chartDefaults} />
            </div>
          </div>

          {charts.brandDist.labels.length > 0 && (
            <div className="chart-box">
              <div className="card-title">Brand Distribution</div>
              <div style={{ height: "calc(100% - 30px)" }}>
                <Doughnut
                  data={brandData}
                  options={{
                    ...chartDefaults,
                    scales: undefined,
                    plugins: {
                      ...chartDefaults.plugins,
                      legend: {
                        position: "right",
                        labels: { color: "#6b7280", font: { family: "DM Mono", size: 11 }, boxWidth: 12 }
                      }
                    }
                  }}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Expiry alerts ── */}
      {(summary.expired > 0 || summary.warning > 0) && (
        <div className="card" style={{ borderColor: summary.expired > 0 ? "rgba(239,68,68,.3)" : "rgba(245,158,11,.3)" }}>
          <div className="card-title">⚠ Expiry Alerts</div>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
            {summary.expired > 0 && (
              <span className="tag tag-red">{summary.expired} items expired</span>
            )}
            {summary.warning > 0 && (
              <span className="tag tag-amber">{summary.warning} items expiring in 30 days</span>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function StatCard({ label, value, color }) {
  return (
    <div className={`stat-card ${color || ""}`}>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value ?? "—"}</div>
    </div>
  );
}
