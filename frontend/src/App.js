import "@/App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Toaster } from "sonner";
import Layout from "@/components/Layout";
import Dashboard from "@/pages/Dashboard";
import InventoryMonitoring from "@/pages/InventoryMonitoring";
import PurchasePlanning from "@/pages/PurchasePlanning";
import PurchaseCalendar from "@/pages/PurchaseCalendar";
import DataUpload from "@/pages/DataUpload";
import MasterData from "@/pages/MasterData";
import BusinessRules from "@/pages/BusinessRules";
import Reports from "@/pages/Reports";
import Settings from "@/pages/Settings";

function App() {
  return (
    <BrowserRouter>
      <Toaster richColors position="top-right" />
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/inventory" element={<InventoryMonitoring />} />
          <Route path="/purchase-planning" element={<PurchasePlanning />} />
          <Route path="/purchase-calendar" element={<PurchaseCalendar />} />
          <Route path="/upload" element={<DataUpload />} />
          <Route path="/master-data" element={<MasterData />} />
          <Route path="/business-rules" element={<BusinessRules />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/settings" element={<Settings />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
