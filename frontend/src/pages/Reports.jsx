import { useState } from "react";
import { endpoints, fmt } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { toast } from "sonner";

const REPORTS = [
  { key: "inventory-health", label: "Inventory Health", desc: "Overall SKU status: healthy, critical, dead stock" },
  { key: "purchase-recommendation", label: "Purchase Recommendation", desc: "What to order per item with tonnage" },
  { key: "factory-moq", label: "Factory MOQ", desc: "MOQ satisfaction per factory" },
  { key: "stock-coverage", label: "Stock Coverage", desc: "Days of coverage per SKU" },
  { key: "dead-stock", label: "Dead Stock", desc: "SKUs with no sales in 90+ days" },
  { key: "slow-moving", label: "Slow Moving", desc: "SKUs with coverage > 60 days" },
  { key: "abc-analysis", label: "ABC Analysis", desc: "SKUs classified A/B/C by sales value" },
  { key: "incoming-po", label: "Incoming PO", desc: "All outstanding purchase orders" },
];

function toCSV(rows) {
  if (!rows || rows.length === 0) return "";
  const keys = Object.keys(rows[0]);
  const escape = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return [keys.join(","), ...rows.map(r => keys.map(k => escape(r[k])).join(","))].join("\n");
}

export default function Reports() {
  const [active, setActive] = useState(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = async (r) => {
    setActive(r); setLoading(true); setData(null);
    try {
      const d = await endpoints.report(r.key);
      setData(Array.isArray(d) ? d : (d.recommendations || d));
    } catch { toast.error("Failed to load"); }
    finally { setLoading(false); }
  };

  const download = () => {
    const rows = Array.isArray(data) ? data : [];
    const csv = toCSV(rows);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${active.key}.csv`; a.click();
    URL.revokeObjectURL(url);
    toast.success("Downloaded CSV");
  };

  const rows = Array.isArray(data) ? data : [];
  const keys = rows[0] ? Object.keys(rows[0]).filter(k => !k.startsWith("_") && k !== "id") : [];

  return (
    <div className="space-y-6" data-testid="reports-page">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900" style={{fontFamily:'Manrope'}}>Reports</h1>
        <p className="text-sm text-slate-500 mt-1">Pre-built reports for decision-makers.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {REPORTS.map(r => (
          <button
            key={r.key}
            data-testid={`report-${r.key}`}
            onClick={() => load(r)}
            className={`idss-card p-4 text-left hover:border-blue-400 transition-colors ${active?.key === r.key ? "border-blue-500 ring-2 ring-blue-100" : ""}`}
          >
            <div className="font-semibold text-slate-900" style={{fontFamily:'Manrope'}}>{r.label}</div>
            <div className="text-xs text-slate-500 mt-1">{r.desc}</div>
          </button>
        ))}
      </div>

      {active && (
        <div className="idss-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-slate-800" style={{fontFamily:'Manrope'}}>{active.label} — {rows.length} rows</h3>
            <Button data-testid="report-download-btn" size="sm" onClick={download} disabled={rows.length === 0} className="bg-blue-600 hover:bg-blue-700"><Download size={14} className="mr-1.5"/>Download CSV</Button>
          </div>
          {loading && <div className="text-sm text-slate-500">Loading...</div>}
          {!loading && rows.length === 0 && <div className="text-sm text-slate-500">No data.</div>}
          {!loading && rows.length > 0 && (
            <div className="overflow-x-auto idss-scroll max-h-[600px]">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-white">
                  <tr className="text-left uppercase text-slate-500 border-b border-slate-200">
                    {keys.map(k => <th key={k} className="p-2 whitespace-nowrap">{k.replace(/_/g," ")}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => (
                    <tr key={i} className="idss-table-row border-b border-slate-100">
                      {keys.map(k => (
                        <td key={k} className="p-2 whitespace-nowrap text-slate-700">
                          {typeof row[k] === "number" ? fmt.num(row[k]) : String(row[k] ?? "")}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
