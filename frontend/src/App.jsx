import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./hooks/useAuth";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import LandingPage from "./pages/LandingPage";
import Cube from "./pages/Cube";
import About from "./pages/About";
import Contact from "./pages/Contact";
import Services from "./pages/Services";
import Dashboard from "./pages/Dashboard";
import Packages from "./pages/Packages";
import AdminUpload from "./pages/AdminUpload";
import AdminUsers from "./pages/AdminUsers";
import ItemsMaster from "./pages/ItemsMaster";
import VendorList from "./pages/VendorList";
import ItemVendors from "./pages/ItemVendors";
import BomDisaster from "./pages/BomDisaster";
import StockBatches from "./pages/StockBatches";
import CreateKit from "./pages/CreateKit";
import POStatus from "./pages/POStatus";
import SubKitGeneration from "./pages/SubKitGeneration";
import CubeBoxTemplate from "./pages/CubeBoxTemplate";
import Outward from "./pages/Outward";
import InventoryTransactions from "./pages/InventoryTransactions";

function RequireAuth({ children, adminOnly = false, superadminOnly = false, blockRestrictedUser = false }) {
  const { user } = useAuth();
  if (user === undefined) return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh" }}><div className="spinner" /></div>;
  if (!user) return <Navigate to="/login" replace />;
  if (adminOnly && !["admin", "superadmin"].includes(user.role)) return <Navigate to="/dashboard" replace />;
  if (superadminOnly && user.role !== "superadmin") return <Navigate to="/dashboard" replace />;
  // Plain "user" role is scoped to Dashboard + Kits Information only — every
  // other route redirects it back, matching the API-level lockout on the
  // same pages (see backend route files) rather than relying on the sidebar
  // hiding the link alone.
  if (blockRestrictedUser && user.role === "user") return <Navigate to="/dashboard" replace />;
  return children;
}

export default function App() {
  const { user } = useAuth();

  return (
    <Routes>
      {/* Public landing page */}
      <Route path="/" element={<LandingPage />} />
      <Route path="/cube" element={<Cube />} />
      <Route path="/about" element={<About />} />
      <Route path="/contact" element={<Contact />} />
      <Route path="/services" element={<Services />} />
      <Route path="/login" element={user ? <Navigate to="/dashboard" /> : <Login />} />

      {/* Protected app routes — same paths as before */}
      <Route element={<RequireAuth><Layout /></RequireAuth>}>
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="packages" element={<Packages />} />
        <Route path="items-master" element={<RequireAuth blockRestrictedUser><ItemsMaster /></RequireAuth>} />
        <Route path="vendor-list"   element={<RequireAuth blockRestrictedUser><VendorList /></RequireAuth>} />
        <Route path="item-vendors"  element={<RequireAuth blockRestrictedUser><ItemVendors /></RequireAuth>} />
        <Route path="bom-disaster"   element={<RequireAuth blockRestrictedUser><BomDisaster /></RequireAuth>} />
        <Route path="stock-batches"  element={<RequireAuth blockRestrictedUser><StockBatches /></RequireAuth>} />
        <Route path="create-kit"     element={<RequireAuth blockRestrictedUser><CreateKit /></RequireAuth>} />
        <Route path="po-status"      element={<RequireAuth blockRestrictedUser><POStatus /></RequireAuth>} />
        <Route path="sub-kits"          element={<RequireAuth blockRestrictedUser><SubKitGeneration /></RequireAuth>} />
        <Route path="cube-box-template" element={<RequireAuth blockRestrictedUser><CubeBoxTemplate /></RequireAuth>} />
        <Route path="outward"           element={<RequireAuth blockRestrictedUser><Outward /></RequireAuth>} />
        <Route path="inventory-transactions" element={<RequireAuth blockRestrictedUser><InventoryTransactions /></RequireAuth>} />
        <Route path="admin/upload" element={<RequireAuth adminOnly><AdminUpload /></RequireAuth>} />
        <Route path="admin/users" element={<RequireAuth superadminOnly><AdminUsers /></RequireAuth>} />
      </Route>

      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  );
}
