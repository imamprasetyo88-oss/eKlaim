import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { useAuth, can } from "@/lib/auth";
import {
  House, Receipt, CheckCircle, Stamp, Wallet, ArrowsClockwise,
  Users, TagChevron, ChartBar, ClipboardText, Gear, SignOut, ListMagnifyingGlass, Coins
} from "@phosphor-icons/react";
import { ROLE_LABEL } from "@/lib/api";

const ALL = [
  { to: "/", label: "Dashboard", icon: House, tid: "nav-dashboard", roles: "*" },
  { to: "/klaim/baru", label: "Ajukan Klaim", icon: Receipt, tid: "nav-claim-new", roles: ["user", "admin", "verifikator", "atasan", "finance"] },
  { to: "/klaim", label: "Klaim Saya", icon: ClipboardText, tid: "nav-my-claims", roles: ["user", "admin", "auditor", "verifikator", "atasan", "finance"] },
  { to: "/verifikasi", label: "Verifikasi", icon: CheckCircle, tid: "nav-verifikasi", roles: ["verifikator", "admin", "auditor"] },
  { to: "/approval", label: "Approval Atasan", icon: Stamp, tid: "nav-approval", roles: ["atasan", "admin", "auditor"] },
  { to: "/pembayaran", label: "Pembayaran", icon: Coins, tid: "nav-pembayaran", roles: ["verifikator", "admin", "auditor"] },
  { to: "/petty-cash", label: "Petty Cash", icon: Wallet, tid: "nav-petty", roles: ["verifikator", "admin", "finance", "auditor"] },
  { to: "/top-up", label: "Top-up Petty Cash", icon: ArrowsClockwise, tid: "nav-topup", roles: ["verifikator", "finance", "admin", "auditor"] },
  { to: "/rekonsiliasi", label: "Rekonsiliasi", icon: ChartBar, tid: "nav-recon", roles: ["admin", "auditor", "verifikator", "finance"] },
  { to: "/laporan", label: "Laporan", icon: ChartBar, tid: "nav-report", roles: "*" },
  { to: "/kategori", label: "Kategori", icon: TagChevron, tid: "nav-kategori", roles: ["admin"] },
  { to: "/pengguna", label: "Pengguna", icon: Users, tid: "nav-pengguna", roles: ["admin"] },
  { to: "/audit-trail", label: "Audit Trail", icon: ListMagnifyingGlass, tid: "nav-audit", roles: ["admin", "auditor"] },
  { to: "/pengaturan", label: "Pengaturan", icon: Gear, tid: "nav-settings", roles: ["admin"] },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const nav = ALL.filter((n) => n.roles === "*" || (Array.isArray(n.roles) && n.roles.includes(user?.role)));

  return (
    <div className="flex min-h-screen">
      <aside className="w-64 border-r border-slate-200 bg-white flex flex-col sticky top-0 h-screen" data-testid="sidebar">
        <div className="px-5 py-5 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-sky-500 to-sky-700 grid place-items-center text-white shadow-sm">
              <Receipt size={20} weight="fill" />
            </div>
            <div>
              <div className="font-bold text-slate-900 leading-tight" style={{fontFamily:'Manrope'}}>eKlaim Lyra</div>
              <div className="text-[10px] uppercase text-slate-500 tracking-wider">Lyra Akrelux</div>
            </div>
          </div>
        </div>
        <nav className="flex-1 py-3 overflow-y-auto lyra-scroll">
          {nav.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.to === "/"}
              data-testid={n.tid}
              className={({ isActive }) =>
                `lyra-sidebar-item relative flex items-center gap-3 px-5 py-2.5 mx-2 my-0.5 text-sm text-slate-600 rounded-md hover:bg-slate-50 ${isActive ? "active" : ""}`
              }
            >
              <n.icon size={18} weight="duotone" />
              <span>{n.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="p-3 border-t border-slate-200">
          <div className="px-3 py-2">
            <div className="text-xs font-semibold text-slate-900">{user?.name || user?.username}</div>
            <div className="text-[10px] uppercase text-sky-700 tracking-wider mt-0.5">{ROLE_LABEL[user?.role] || user?.role}</div>
          </div>
          <button
            data-testid="btn-logout"
            onClick={logout}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-600 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
          >
            <SignOut size={16} weight="duotone" />
            Keluar
          </button>
        </div>
      </aside>

      <main className="flex-1 min-w-0">
        <header className="sticky top-0 z-10 backdrop-blur-xl bg-white/80 border-b border-slate-200 px-8 py-3 flex items-center justify-between">
          <div>
            <div className="text-xs text-slate-500">Sistem Klaim & Petty Cash</div>
            <div className="text-sm font-semibold text-slate-900">Lyra Akrelux</div>
          </div>
          <div className="text-xs text-slate-500 tabular-nums">{new Date().toLocaleDateString("id-ID", {weekday:"long", day:"numeric", month:"long", year:"numeric"})}</div>
        </header>
        <div className="px-8 py-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
