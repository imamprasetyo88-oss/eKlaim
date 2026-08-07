import { useEffect, useMemo, useState } from "react";
import { endpoints, fmt } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import TrafficDot from "@/components/TrafficDot";
import AIInsightPanel from "@/components/AIInsightPanel";

const STATUS_STYLE = {
  stock_out: "bg-red-100 text-red-700",
  critical: "bg-red-100 text-red-700",
  at_risk: "bg-orange-100 text-orange-700",
  overstock: "bg-amber-100 text-amber-700",
  slow_moving: "bg-amber-100 text-amber-700",
  dead_stock: "bg-red-100 text-red-700",
  healthy: "bg-green-100 text-green-700",
  no_movement: "bg-slate-100 text-slate-600",
};

export default function InventoryMonitoring() {
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState("");
  const [abcFilter, setAbc] = useState("all");
  const [statusFilter, setStatus] = useState("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    endpoints.inventory().then((d) => { setRows(d); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => rows.filter(r => {
    if (q && !`${r.item_code} ${r.description}`.toLowerCase().includes(q.toLowerCase())) return false;
    if (abcFilter !== "all" && r.abc !== abcFilter) return false;
    if (statusFilter !== "all" && r.status_label !== statusFilter) return false;
    return true;
  }), [rows, q, abcFilter, statusFilter]);

  return (
    <div className="space-y-6" data-testid="inventory-page">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900" style={{fontFamily:'Manrope'}}>Inventory Monitoring</h1>
        <p className="text-sm text-slate-500 mt-1">Current stock, projections, ABC analysis and coverage.</p>
      </div>

      <AIInsightPanel context="inventory" />

      <div className="idss-card p-4">
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <Input data-testid="inv-search" placeholder="Search item..." value={q} onChange={(e)=>setQ(e.target.value)} className="max-w-xs" />
          <Select value={abcFilter} onValueChange={setAbc}>
            <SelectTrigger data-testid="inv-abc-filter" className="w-[140px]"><SelectValue placeholder="ABC" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All ABC</SelectItem>
              <SelectItem value="A">A</SelectItem>
              <SelectItem value="B">B</SelectItem>
              <SelectItem value="C">C</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatus}>
            <SelectTrigger data-testid="inv-status-filter" className="w-[180px]"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="stock_out">Stock Out</SelectItem>
              <SelectItem value="critical">Critical</SelectItem>
              <SelectItem value="at_risk">At Risk</SelectItem>
              <SelectItem value="healthy">Healthy</SelectItem>
              <SelectItem value="overstock">Overstock</SelectItem>
              <SelectItem value="slow_moving">Slow Moving</SelectItem>
              <SelectItem value="dead_stock">Dead Stock</SelectItem>
            </SelectContent>
          </Select>
          <div className="ml-auto text-xs text-slate-500">{filtered.length} of {rows.length}</div>
        </div>

        <div className="overflow-x-auto idss-scroll">
          <table className="w-full text-sm" data-testid="inv-table">
            <thead>
              <tr className="text-left text-xs uppercase text-slate-500 border-b border-slate-200">
                <th className="p-2"></th>
                <th className="p-2">Item</th>
                <th className="p-2">Category</th>
                <th className="p-2">Factory</th>
                <th className="p-2 text-right">Stock</th>
                <th className="p-2 text-right">Incoming</th>
                <th className="p-2 text-right">Projected</th>
                <th className="p-2 text-right">Avg/Day</th>
                <th className="p-2 text-right">Coverage</th>
                <th className="p-2 text-right">Buffer</th>
                <th className="p-2 text-right">Turnover</th>
                <th className="p-2 text-right">Aging</th>
                <th className="p-2">ABC</th>
                <th className="p-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={14} className="p-6 text-center text-slate-500">Loading...</td></tr>}
              {!loading && filtered.length === 0 && <tr><td colSpan={14} className="p-6 text-center text-slate-500">No items. Upload Master Item or load demo data.</td></tr>}
              {filtered.map((r) => (
                <tr key={r.item_code} className="idss-table-row border-b border-slate-100" data-testid={`inv-row-${r.item_code}`}>
                  <td className="p-2"><TrafficDot light={r.light} /></td>
                  <td className="p-2">
                    <div className="font-medium text-slate-900">{r.item_code}</div>
                    <div className="text-xs text-slate-500 truncate max-w-[220px]">{r.description}</div>
                  </td>
                  <td className="p-2 text-slate-600">{r.category}</td>
                  <td className="p-2 text-slate-600">{r.factory}</td>
                  <td className="p-2 text-right">{fmt.num(r.current_stock)}</td>
                  <td className="p-2 text-right text-blue-600">{fmt.num(r.incoming_po)}</td>
                  <td className="p-2 text-right">{fmt.num(r.projected_stock)}</td>
                  <td className="p-2 text-right">{fmt.dec(r.avg_daily_sales, 1)}</td>
                  <td className="p-2 text-right">{r.coverage_days != null ? `${r.coverage_days}d` : "-"}</td>
                  <td className="p-2 text-right text-slate-500">{fmt.num(r.target_buffer)}</td>
                  <td className="p-2 text-right">{fmt.dec(r.turnover, 2)}</td>
                  <td className="p-2 text-right text-slate-500">{r.aging_days != null ? `${r.aging_days}d` : "-"}</td>
                  <td className="p-2"><Badge variant="outline" className="font-bold">{r.abc}</Badge></td>
                  <td className="p-2"><span className={`text-xs px-2 py-0.5 rounded ${STATUS_STYLE[r.status_label] || "bg-slate-100"}`}>{r.status_label.replace("_"," ")}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
