import { useEffect, useState, useRef } from "react";
import { API, endpoints, fmt } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Upload, FileSpreadsheet, CheckCircle2, XCircle, Download } from "lucide-react";
import { toast } from "sonner";

const KINDS = [
  { key: "master-item", label: "Master Item", desc: "Item Code, Description, Brand, Category, Supplier, Factory, Warehouse, Unit, Lead Time, MOQ..." },
  { key: "sales-history", label: "Sales History", desc: "Date, Item Code, Customer, Sales Qty, Sales Value, Warehouse, Channel" },
  { key: "stock-balance", label: "Stock Balance", desc: "Warehouse, Item Code, Available/Reserved/Blocked/Total Qty, Inventory Value" },
  { key: "po-outstanding", label: "PO Outstanding", desc: "PO Number, Supplier, Factory, Item Code, Qty, ETA, Status, Weight, Tonnage" },
];

function UploadTile({ kind, onDone }) {
  const ref = useRef(null);
  const [busy, setBusy] = useState(false);
  const handle = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    const fd = new FormData();
    fd.append("file", file);
    try {
      const r = await endpoints.upload(kind.key, fd);
      toast.success(`Uploaded ${r.total_rows} rows for ${kind.label}${r.error_count ? ` (${r.error_count} errors)` : ""}`);
      onDone();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Upload failed");
    } finally {
      setBusy(false);
      if (ref.current) ref.current.value = "";
    }
  };
  return (
    <Card className="idss-card" data-testid={`upload-tile-${kind.key}`}>
      <CardContent className="p-5">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-blue-100 text-blue-700 grid place-items-center">
            <FileSpreadsheet size={20} />
          </div>
          <div className="flex-1">
            <div className="font-semibold text-slate-900" style={{fontFamily:'Manrope'}}>{kind.label}</div>
            <div className="text-xs text-slate-500 mt-1">{kind.desc}</div>
          </div>
        </div>
        <input ref={ref} type="file" accept=".xlsx,.xls" onChange={handle} className="hidden" data-testid={`upload-input-${kind.key}`}/>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Button
            data-testid={`template-btn-${kind.key}`}
            variant="outline"
            asChild
          >
            <a href={`${API}/templates/${kind.key}`} download>
              <Download size={14} className="mr-1.5" />
              Template
            </a>
          </Button>
          <Button
            data-testid={`upload-btn-${kind.key}`}
            onClick={() => ref.current?.click()}
            disabled={busy}
            className="bg-blue-600 hover:bg-blue-700"
          >
            <Upload size={14} className="mr-1.5" />
            {busy ? "Uploading..." : "Upload"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function DataUpload() {
  const [history, setHistory] = useState([]);
  const load = () => endpoints.uploadHistory().then(setHistory).catch(() => setHistory([]));
  useEffect(() => { load(); }, []);

  return (
    <div className="space-y-6" data-testid="upload-page">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900" style={{fontFamily:'Manrope'}}>Data Upload</h1>
        <p className="text-sm text-slate-500 mt-1">Download the template, fill in your data, then upload. Duplicate files are rejected automatically.</p>
      </div>

      <div className="idss-ai-panel p-4" data-testid="upload-order-hint">
        <div className="text-xs font-semibold uppercase tracking-wider text-blue-700 mb-2">Recommended Upload Order</div>
        <ol className="text-sm text-slate-700 space-y-1 list-decimal list-inside">
          <li>Add <b>Factories</b> first via Master Data → Factories (used for MOQ rules)</li>
          <li>Upload <b>Master Item</b> — the foundation for all analytics</li>
          <li>Upload <b>Stock Balance</b> — current snapshot (replaces existing stock)</li>
          <li>Upload <b>Sales History</b> — ideally at least 90 days for accurate ABC & coverage</li>
          <li>Upload <b>PO Outstanding</b> — for projected stock & incoming PO timeline</li>
          <li>Add <b>Campaigns</b> via Master Data if you have upcoming promos</li>
        </ol>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {KINDS.map((k) => <UploadTile key={k.key} kind={k} onDone={load} />)}
      </div>

      <div className="idss-card p-5">
        <h3 className="text-sm font-semibold text-slate-800 mb-3" style={{fontFamily:'Manrope'}}>Upload History</h3>
        <div className="overflow-x-auto idss-scroll">
          <table className="w-full text-sm" data-testid="upload-history-table">
            <thead>
              <tr className="text-left text-xs uppercase text-slate-500 border-b border-slate-200">
                <th className="p-2">Time</th>
                <th className="p-2">Type</th>
                <th className="p-2">File</th>
                <th className="p-2 text-right">Rows</th>
                <th className="p-2 text-right">Errors</th>
                <th className="p-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {history.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-slate-500">No uploads yet.</td></tr>}
              {history.map((h) => (
                <tr key={h.id} className="idss-table-row border-b border-slate-100">
                  <td className="p-2 text-slate-500 text-xs">{new Date(h.uploaded_at).toLocaleString()}</td>
                  <td className="p-2">{h.kind}</td>
                  <td className="p-2 text-slate-600 truncate max-w-[240px]">{h.filename}</td>
                  <td className="p-2 text-right">{fmt.num(h.total_rows)}</td>
                  <td className="p-2 text-right text-red-600">{h.error_count || 0}</td>
                  <td className="p-2">
                    {h.status === "success" ? (
                      <span className="inline-flex items-center gap-1 text-xs text-green-700"><CheckCircle2 size={14} /> Success</span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs text-orange-700"><XCircle size={14} /> Partial</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
