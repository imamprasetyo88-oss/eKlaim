import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  LayoutDashboard, Boxes, ShoppingCart, CalendarDays, Upload,
  Database, Scale, FileBarChart2, Settings as SettingsIcon, Search, Sparkles
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { endpoints } from "@/lib/api";
import { toast } from "sonner";

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, tid: "sidebar-nav-dashboard" },
  { to: "/inventory", label: "Inventory Monitoring", icon: Boxes, tid: "sidebar-nav-inventory" },
  { to: "/purchase-planning", label: "Purchase Planning", icon: ShoppingCart, tid: "sidebar-nav-planning" },
  { to: "/purchase-calendar", label: "Purchase Calendar", icon: CalendarDays, tid: "sidebar-nav-calendar" },
  { to: "/upload", label: "Data Upload", icon: Upload, tid: "sidebar-nav-upload" },
  { to: "/master-data", label: "Master Data", icon: Database, tid: "sidebar-nav-master" },
  { to: "/business-rules", label: "Business Rules", icon: Scale, tid: "sidebar-nav-rules" },
  { to: "/reports", label: "Reports", icon: FileBarChart2, tid: "sidebar-nav-reports" },
  { to: "/settings", label: "Settings", icon: SettingsIcon, tid: "sidebar-nav-settings" },
];

function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [res, setRes] = useState(null);
  const navigate = useNavigate();

  const run = async (val) => {
    setQ(val);
    if (!val || val.length < 2) { setRes(null); return; }
    try {
      const r = await endpoints.search(val);
      setRes(r);
    } catch (e) { console.error(e); }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          data-testid="global-search-trigger"
          className="flex items-center gap-2 text-sm text-slate-500 bg-white border border-slate-200 rounded-md px-3 py-2 min-w-[280px] hover:border-slate-300 transition-colors"
        >
          <Search size={16} />
          <span>Search items, POs, factories...</span>
          <kbd className="ml-auto text-[10px] bg-slate-100 px-1.5 py-0.5 rounded">⌘K</kbd>
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Global Search</DialogTitle></DialogHeader>
        <Input
          data-testid="global-search-input"
          autoFocus
          placeholder="Type at least 2 characters..."
          value={q}
          onChange={(e) => run(e.target.value)}
        />
        {res && (
          <div className="max-h-[420px] overflow-auto space-y-4 mt-2">
            {res.items?.length > 0 && (
              <div>
                <div className="text-xs font-semibold uppercase text-slate-500 mb-2">Items</div>
                {res.items.map((i) => (
                  <button
                    key={i.item_code}
                    data-testid={`search-item-${i.item_code}`}
                    onClick={() => { setOpen(false); navigate("/inventory"); }}
                    className="w-full text-left px-3 py-2 hover:bg-slate-50 rounded flex justify-between"
                  >
                    <span className="font-medium">{i.item_code}</span>
                    <span className="text-slate-500 text-sm truncate ml-4">{i.description}</span>
                  </button>
                ))}
              </div>
            )}
            {res.po?.length > 0 && (
              <div>
                <div className="text-xs font-semibold uppercase text-slate-500 mb-2">Purchase Orders</div>
                {res.po.map((p) => (
                  <div key={p.po_number} className="px-3 py-2 text-sm flex justify-between">
                    <span className="font-medium">{p.po_number}</span>
                    <span className="text-slate-500">{p.factory} — {p.item_code}</span>
                  </div>
                ))}
              </div>
            )}
            {res.factories?.length > 0 && (
              <div>
                <div className="text-xs font-semibold uppercase text-slate-500 mb-2">Factories</div>
                {res.factories.map((f) => (
                  <div key={f.factory_name} className="px-3 py-2 text-sm">{f.factory_name} — {f.supplier}</div>
                ))}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function Layout() {
  const [seeding, setSeeding] = useState(false);
  const seed = async () => {
    setSeeding(true);
    try {
      await endpoints.seedDemo();
      toast.success("Demo data loaded");
      window.location.reload();
    } catch { toast.error("Failed to seed demo"); }
    finally { setSeeding(false); }
  };

  return (
    <div className="flex min-h-screen">
      <aside className="w-64 border-r border-slate-200 bg-white flex flex-col sticky top-0 h-screen" data-testid="sidebar">
        <div className="px-5 py-5 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-600 to-orange-500 grid place-items-center text-white font-bold text-sm">I</div>
            <div>
              <div className="font-bold text-slate-900 leading-tight" style={{fontFamily:'Manrope'}}>IDSS</div>
              <div className="text-[10px] uppercase text-slate-500 tracking-wider">Decision Support</div>
            </div>
          </div>
        </div>
        <nav className="flex-1 py-3 overflow-y-auto">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.to === "/"}
              data-testid={n.tid}
              className={({ isActive }) =>
                `idss-sidebar-item relative flex items-center gap-3 px-5 py-2.5 mx-2 my-0.5 text-sm text-slate-600 rounded-md hover:bg-slate-50 ${isActive ? "active" : ""}`
              }
            >
              <n.icon size={17} />
              <span>{n.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="p-3 border-t border-slate-200">
          <Button
            data-testid="seed-demo-btn"
            variant="outline"
            size="sm"
            className="w-full text-xs"
            onClick={seed}
            disabled={seeding}
          >
            <Sparkles size={14} className="mr-1.5" />
            {seeding ? "Loading..." : "Load Demo Data"}
          </Button>
        </div>
      </aside>

      <main className="flex-1 min-w-0">
        <header className="sticky top-0 z-10 bg-white/90 backdrop-blur-md border-b border-slate-200 px-8 py-3 flex items-center justify-between">
          <GlobalSearch />
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-500">Distribution Co.</span>
            <div className="w-8 h-8 rounded-full bg-slate-200 grid place-items-center text-slate-600 text-xs font-semibold">DC</div>
          </div>
        </header>
        <div className="px-8 py-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
