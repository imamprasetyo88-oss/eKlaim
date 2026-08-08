import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "sonner";
import { AuthProvider, useAuth } from "@/lib/auth";
import Layout from "@/components/Layout";
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import ClaimList from "@/pages/ClaimList";
import ClaimForm from "@/pages/ClaimForm";
import ClaimDetail from "@/pages/ClaimDetail";
import Verifikasi from "@/pages/Verifikasi";
import Approval from "@/pages/Approval";
import Pembayaran from "@/pages/Pembayaran";
import PettyCash from "@/pages/PettyCash";
import TopUp from "@/pages/TopUp";
import Kategori from "@/pages/Kategori";
import Pengguna from "@/pages/Pengguna";
import Rekonsiliasi from "@/pages/Rekonsiliasi";
import AuditTrail from "@/pages/AuditTrail";
import Laporan from "@/pages/Laporan";
import Pengaturan from "@/pages/Pengaturan";
import UangMuka from "@/pages/UangMuka";
import UangMukaForm from "@/pages/UangMukaForm";
import UangMukaDetail from "@/pages/UangMukaDetail";

function Private({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="grid place-items-center h-screen text-slate-500">Memuat...</div>;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Toaster richColors position="top-right" closeButton />
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<Private><Layout /></Private>}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/klaim" element={<ClaimList />} />
            <Route path="/klaim/baru" element={<ClaimForm />} />
            <Route path="/klaim/:id" element={<ClaimDetail />} />
            <Route path="/klaim/:id/edit" element={<ClaimForm />} />
            <Route path="/verifikasi" element={<Verifikasi />} />
            <Route path="/approval" element={<Approval />} />
            <Route path="/pembayaran" element={<Pembayaran />} />
            <Route path="/uang-muka" element={<UangMuka />} />
            <Route path="/uang-muka/baru" element={<UangMukaForm />} />
            <Route path="/uang-muka/:id" element={<UangMukaDetail />} />
            <Route path="/uang-muka/:id/edit" element={<UangMukaForm />} />
            <Route path="/petty-cash" element={<PettyCash />} />
            <Route path="/top-up" element={<TopUp />} />
            <Route path="/rekonsiliasi" element={<Rekonsiliasi />} />
            <Route path="/kategori" element={<Kategori />} />
            <Route path="/pengguna" element={<Pengguna />} />
            <Route path="/audit-trail" element={<AuditTrail />} />
            <Route path="/laporan" element={<Laporan />} />
            <Route path="/pengaturan" element={<Pengaturan />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
