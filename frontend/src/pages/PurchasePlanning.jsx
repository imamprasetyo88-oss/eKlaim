import { useEffect, useMemo, useState } from "react";
import { endpoints, fmt } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import AIInsightPanel from "@/components/AIInsightPanel";
import { CheckCircle2, AlertTriangle } from "lucide-react";

const URGENCY_STYLE = {
  critical: "bg-red-100 text-red-700",
  high: "bg-orange-100 text-orange-700",
  medium: "bg-amber-100 text-amber-700",
  low: "bg-green-100 text-green-700",
};

export default function PurchasePlanning() {
  const [data, setData] = useState(null);
  const [q, setQ] = useState("");
  const [factory, setFactory] = useState("all");
  const [urgency, setUrgency] = useState("all");

  useEffect(() => {
    endpoints.planning().then(setData).catch(() => setData({ recommendations: [], factory_moq: [] }));
  }, []);

  const filtered = useMemo(() => {
    if (!data) return [];
    return data.recommendations.filter((r) => {
      if (q && !`${r.item_code} ${r.description}`.toLowerCase().includes(q.toLowerCase())) return false;
      if (factory !== "all" && r.factory !== factory) return false;
      if (urgency !== "all" && r.urgency !== urgency) return false;
      return true;
    });
  }, [data, q, factory, urgency]);

  const factoryOptions = useMemo(() => {
    if (!data) return [];
    return [...new Set(data.recommendations.map(r => r.factory).filter(Boolean))];
  }, [data]);

  if (!data) return <div className="text-slate-500">Loading...</div>;

  return (
    <div className="space-y-6" data-testid="planning-page">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900" style={{fontFamily:'Manrope'}}>Purchase Planning</h1>
        <p className="text-sm text-slate-500 mt-1">What to order, when and how much — considering MOQ and campaigns.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 idss-card p-5">
          <h3 className="text-sm font-semibold text-slate-800 mb-3" style={{fontFamily:'Manrope'}}>Factory MOQ Status</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {data.factory_moq.map((m) => (
              <div key={m.factory} data-testid={`moq-${m.factory}`} className={`rounded-lg p-3 border ${m.satisfied ? "bg-green-50 border-green-200" : "bg-orange-50 border-orange-200"}`}>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-semibold text-slate-900">{m.factory}</div>
                    <div className="text-xs text-slate-500">Min: {m.minimum_ton}t · Total: {m.total_tonnage}t</div>
                  </div>
                  {m.satisfied ? <CheckCircle2 className="text-green-600" size={20} /> : <AlertTriangle className="text-orange-600" size={20} />}
                </div>
                {!m.satisfied && m.minimum_ton > 0 && (
                  <div className="text-xs text-orange-700 mt-2">Still needs <span className="font-bold">{m.gap}t</span> to satisfy MOQ</div>
                )}
              </div>
            ))}
            {data.factory_moq.length === 0 && <div className="text-sm text-slate-500 italic">No factories yet — add via Master Data or upload.</div>}
          </div>
        </div>
        <AIInsightPanel context="dashboard" />
      </div>

      <div className="idss-card p-4">
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <Input data-testid="plan-search" placeholder="Search item..." value={q} onChange={(e)=>setQ(e.target.value)} className="max-w-xs" />
          <Select value={factory} onValueChange={setFactory}>
            <SelectTrigger data-testid="plan-factory-filter" className="w-[180px]"><SelectValue placeholder="Factory" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All factories</SelectItem>
              {factoryOptions.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={urgency} onValueChange={setUrgency}>
            <SelectTrigger data-testid="plan-urgency-filter" className="w-[160px]"><SelectValue placeholder="Urgency" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All urgency</SelectItem>
              <SelectItem value="critical">Critical</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="low">Low</SelectItem>
            </SelectContent>
          </Select>
          <div className="ml-auto text-xs text-slate-500">{filtered.length} recommendations</div>
        </div>

        <div className="overflow-x-auto idss-scroll">
          <table className="w-full text-sm" data-testid="plan-table">
            <thead>
              <tr className="text-left text-xs uppercase text-slate-500 border-b border-slate-200">
                <th className="p-2">Item</th>
                <th className="p-2">Factory</th>
                <th className="p-2 text-right">Stock</th>
                <th className="p-2 text-right">Incoming</th>
                <th className="p-2 text-right">Coverage</th>
                <th className="p-2 text-right">Recommended Qty</th>
                <th className="p-2 text-right">Tonnage</th>
                <th className="p-2">Type</th>
                <th className="p-2">Deadline</th>
                <th className="p-2">ABC</th>
                <th className="p-2">Urgency</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && <tr><td colSpan={11} className="p-6 text-center text-slate-500">No recommendations. Upload data or load demo.</td></tr>}
              {filtered.map((r) => (
                <tr key={r.item_code} className="idss-table-row border-b border-slate-100" data-testid={`plan-row-${r.item_code}`}>
                  <td className="p-2">
                    <div className="font-medium text-slate-900">{r.item_code}</div>
                    <div className="text-xs text-slate-500 truncate max-w-[220px]">{r.description}</div>
                  </td>
                  <td className="p-2 text-slate-600">{r.factory}</td>
                  <td className="p-2 text-right">{fmt.num(r.current_stock)}</td>
                  <td className="p-2 text-right text-blue-600">{fmt.num(r.incoming_po)}</td>
                  <td className="p-2 text-right">{r.coverage_days != null ? `${r.coverage_days}d` : "-"}</td>
                  <td className="p-2 text-right font-semibold text-slate-900">{fmt.num(r.recommended_qty)}</td>
                  <td className="p-2 text-right text-slate-500">{fmt.dec(r.tonnage, 2)}t</td>
                  <td className="p-2"><Badge variant="outline" className="text-xs">{r.purchase_type}</Badge></td>
                  <td className="p-2 text-slate-600">{fmt.date(r.purchase_deadline)}</td>
                  <td className="p-2"><Badge variant="outline" className="font-bold">{r.abc}</Badge></td>
                  <td className="p-2"><span className={`text-xs px-2 py-0.5 rounded ${URGENCY_STYLE[r.urgency]}`}>{r.urgency}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
