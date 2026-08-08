import { useState, useEffect } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import {
  House, Receipt, CheckCircle, Stamp, Wallet, ArrowsClockwise,
  Users, TagChevron, ChartBar, ClipboardText, Gear, SignOut, ListMagnifyingGlass, Coins, HandCoins, BookOpen,
  List, X, CaretLeft, CaretRight
} from "@phosphor-icons/react";
import { ROLE_LABEL } from "@/lib/api";

const ALL = [
  { to: "/", label: "Dashboard", icon: House, tid: "nav-dashboard", roles: "*" },
  { to: "/klaim/baru", label: "Ajukan Klaim", icon: Receipt, tid: "nav-claim-new", roles: ["user", "admin", "verifikator", "atasan", "finance"] },
  { to: "/klaim", label: "Klaim Saya", icon: ClipboardText, tid: "nav-my-claims", roles: ["user", "admin", "auditor", "verifikator", "atasan", "finance"] },
  { to: "/uang-muka/baru", label: "Ajukan Uang Muka", icon: HandCoins, tid: "nav-um-new", roles: ["user", "admin", "verifikator", "atasan", "finance"] },
  { to: "/uang-muka", label: "Uang Muka", icon: HandCoins, tid: "nav-um", roles: "*" },
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
  { to: "/panduan", label: "Panduan", icon: BookOpen, tid: "nav-panduan", roles: "*" },
  { to: "/pengaturan", label: "Pengaturan", icon: Gear, tid: "nav-settings", roles: ["admin"] },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const nav = ALL.filter((n) => n.roles === "*" || (Array.isArray(n.roles) && n.roles.includes(user?.role)));

  // Desktop collapse (icon-only mode), persisted
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem("eklaim_sidebar_collapsed") === "1"; } catch { return false; }
  });
  useEffect(() => {
    try { localStorage.setItem("eklaim_sidebar_collapsed", collapsed ? "1" : "0"); } catch {}
  }, [collapsed]);

  // Mobile drawer open state
  const [drawerOpen, setDrawerOpen] = useState(false);
  useEffect(() => { setDrawerOpen(false); }, [user]); // reset on login

  const sidebarWidth = collapsed ? "lg:w-16" : "lg:w-64";

  return (
    <div className="flex min-h-screen">
      {/* Mobile backdrop */}
      {drawerOpen && (
        <div
          className="fixed inset-0 bg-slate-900/50 z-30 lg:hidden"
          onClick={() => setDrawerOpen(false)}
          data-testid="sidebar-backdrop"
        />
      )}

      {/* Sidebar - responsive */}
      <aside
        className={`
          bg-white border-r border-slate-200 flex flex-col
          fixed inset-y-0 left-0 z-40 w-64 transform transition-transform duration-200
          ${drawerOpen ? "translate-x-0" : "-translate-x-full"}
          lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 lg:transition-[width] lg:duration-200
          ${sidebarWidth}
        `}
        data-testid="sidebar"
      >
        <div className="px-4 py-5 border-b border-slate-200 flex items-center gap-2">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-sky-500 to-sky-700 grid place-items-center text-white shadow-sm shrink-0">
            <Receipt size={20} weight="fill" />
          </div>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <div className="font-bold text-slate-900 leading-tight" style={{fontFamily:'Manrope'}}>eKlaim</div>
              <div className="text-[10px] uppercase text-slate-500 tracking-wider truncate" data-testid="sidebar-company">
                {user?.company?.name || "—"}
              </div>
            </div>
          )}
          <button
            onClick={() => setDrawerOpen(false)}
            className="lg:hidden p-1.5 text-slate-500 hover:text-slate-900"
            data-testid="sidebar-close"
            aria-label="Tutup menu"
          >
            <X size={20} weight="bold" />
          </button>
        </div>

        <nav className="flex-1 py-3 overflow-y-auto lyra-scroll">
          {nav.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.to === "/"}
              data-testid={n.tid}
              onClick={() => setDrawerOpen(false)}
              title={collapsed ? n.label : undefined}
              className={({ isActive }) =>
                `lyra-sidebar-item relative flex items-center gap-3 py-2.5 mx-2 my-0.5 text-sm text-slate-600 rounded-md hover:bg-slate-50 transition-colors
                ${collapsed ? "lg:justify-center lg:px-0 px-5" : "px-5"}
                ${isActive ? "active" : ""}`
              }
            >
              <n.icon size={18} weight="duotone" className="shrink-0" />
              <span className={collapsed ? "lg:hidden" : ""}>{n.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="p-3 border-t border-slate-200 space-y-1">
          {!collapsed && (
            <div className="px-3 py-2">
              <div className="text-xs font-semibold text-slate-900 truncate">{user?.name || user?.username}</div>
              <div className="text-[10px] uppercase text-sky-700 tracking-wider mt-0.5">{ROLE_LABEL[user?.role] || user?.role}</div>
            </div>
          )}
          <button
            data-testid="btn-logout"
            onClick={logout}
            title={collapsed ? "Keluar" : undefined}
            className={`w-full flex items-center gap-2 py-2 text-sm text-slate-600 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors
              ${collapsed ? "lg:justify-center lg:px-0 px-3" : "px-3"}`}
          >
            <SignOut size={16} weight="duotone" className="shrink-0" />
            <span className={collapsed ? "lg:hidden" : ""}>Keluar</span>
          </button>
          {/* Desktop-only collapse toggle */}
          <button
            data-testid="sidebar-toggle-desktop"
            onClick={() => setCollapsed(!collapsed)}
            title={collapsed ? "Perbesar sidebar" : "Perkecil sidebar"}
            className={`hidden lg:flex w-full items-center gap-2 py-2 text-xs text-slate-500 hover:text-sky-700 hover:bg-sky-50 rounded-md transition-colors
              ${collapsed ? "justify-center px-0" : "px-3"}`}
          >
            {collapsed ? <CaretRight size={14} weight="bold" /> : <><CaretLeft size={14} weight="bold" /><span>Perkecil menu</span></>}
          </button>
        </div>
      </aside>

      <main className="flex-1 min-w-0">
        <header className="sticky top-0 z-20 backdrop-blur-xl bg-white/80 border-b border-slate-200 px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between gap-3">
          <button
            onClick={() => setDrawerOpen(true)}
            className="lg:hidden p-2 -ml-2 text-slate-700 hover:bg-slate-100 rounded-md"
            data-testid="sidebar-open"
            aria-label="Buka menu"
          >
            <List size={22} weight="bold" />
          </button>
          <div className="flex-1 min-w-0">
            <div className="text-xs text-slate-500 hidden sm:block">Sistem Klaim & Petty Cash</div>
            <div className="text-sm font-semibold text-slate-900 truncate" data-testid="header-company">{user?.company?.name || "—"}</div>
          </div>
          <div className="text-xs text-slate-500 tabular-nums hidden md:block">
            {new Date().toLocaleDateString("id-ID", {weekday:"long", day:"numeric", month:"long", year:"numeric"})}
          </div>
          <div className="text-xs text-slate-500 tabular-nums md:hidden">
            {new Date().toLocaleDateString("id-ID", {day:"numeric", month:"short"})}
          </div>
        </header>
        <div className="px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
