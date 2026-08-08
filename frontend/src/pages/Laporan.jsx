import { useEffect, useState } from "react";
import { api, fmtRp, fmtDate, STATUS_LABEL } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download } from "@phosphor-icons/react";
import { toast } from "sonner";

function toCSV(rows) {
  if (!rows.length) return "";
  const keys = ["code","user_name","category_name","tanggal","jumlah","status","deskripsi","tujuan","created_at","paid_at"];
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return [keys.join(","), ...rows.map(r => keys.map(k => esc(r[k])).join(","))].join("\n");
}

export default function Laporan() {
  const [rows, setRows] = useState([]);
  const [cats, setCats] = useState([]);
  const [filter, setFilter] = useState({ from_date: "", to_date: "", status: "all", category_id: "all" });
  const [loading, setLoading] = useState(false);

  useEffect(() => { api.get("/categories").then(r => setCats(r.data)); }, []);

  const load = async () => {
    setLoading(true);
    const params = {};
    if (filter.from_date) params.from_date = filter.from_date;
    if (filter.to_date) params.to_date = filter.to_date;
    if (filter.status !== "all") params.status = filter.status;
    if (filter.category_id !== "all") params.category_id = filter.category_id;
    try {
      const r = await api.get("/reports/claims", { params });
      setRows(r.data);
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const download = () => {
    if (!rows.length) return toast.error("Tidak ada data");
    const csv = toCSV(rows);
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `laporan_klaim_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Laporan diunduh");
  };

  const total = rows.reduce((s, r) => s + (r.jumlah || 0), 0);
  const totalPaid = rows.filter(r => r.status === "DIBAYAR").reduce((s, r) => s + (r.jumlah || 0), 0);

  return (
    <div className="space-y-6" data-testid="laporan-page">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900" style={{fontFamily:'Manrope'}}>Laporan Klaim</h1>
        <p className="text-sm text-slate-500 mt-1">Filter, ringkasan, dan ekspor untuk kebutuhan Finance.</p>
      </div>

      <div className="lyra-card p-5">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3 mb-4">
          <div><Label className="text-xs uppercase text-slate-600">Dari Tanggal</Label><Input data-testid="filter-from" type="date" value={filter.from_date} onChange={(e)=>setFilter({...filter, from_date: e.target.value})}/></div>
          <div><Label className="text-xs uppercase text-slate-600">Sampai Tanggal</Label><Input data-testid="filter-to" type="date" value={filter.to_date} onChange={(e)=>setFilter({...filter, to_date: e.target.value})}/></div>
          <div>
            <Label className="text-xs uppercase text-slate-600">Status</Label>
            <Select value={filter.status} onValueChange={(v)=>setFilter({...filter, status: v})}>
              <SelectTrigger data-testid="filter-status"><SelectValue/></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua</SelectItem>
                {Object.entries(STATUS_LABEL).map(([k,v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs uppercase text-slate-600">Kategori</Label>
            <Select value={filter.category_id} onValueChange={(v)=>setFilter({...filter, category_id: v})}>
              <SelectTrigger data-testid="filter-cat"><SelectValue/></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua</SelectItem>
                {cats.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end gap-2">
            <Button data-testid="btn-apply" onClick={load} disabled={loading} className="bg-sky-600 hover:bg-sky-700 hover:text-white text-white flex-1">Terapkan</Button>
            <Button data-testid="btn-download" onClick={download} variant="outline"><Download size={16} weight="duotone"/></Button>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="rounded-lg bg-slate-50 p-3"><div className="text-xs uppercase text-slate-500">Jumlah Klaim</div><div className="text-xl font-bold tabular-nums">{rows.length}</div></div>
          <div className="rounded-lg bg-sky-50 p-3"><div className="text-xs uppercase text-sky-700">Total Nilai</div><div className="text-xl font-bold tabular-nums">{fmtRp(total)}</div></div>
          <div className="rounded-lg bg-emerald-50 p-3"><div className="text-xs uppercase text-emerald-700">Sudah Dibayar</div><div className="text-xl font-bold tabular-nums text-emerald-700">{fmtRp(totalPaid)}</div></div>
        </div>

        <div className="overflow-x-auto lyra-scroll">
          <table className="w-full text-sm" data-testid="report-table">
            <thead><tr className="text-left text-xs uppercase tracking-wider text-slate-500 border-b border-slate-200">
              <th className="p-2">Kode</th><th className="p-2">Pengaju</th><th className="p-2">Kategori</th>
              <th className="p-2">Tanggal</th><th className="p-2 text-right">Jumlah</th><th className="p-2">Status</th>
            </tr></thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-slate-500 italic">Tidak ada data.</td></tr>}
              {rows.map(r => (
                <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="p-2 font-medium">{r.code}</td>
                  <td className="p-2 text-slate-700">{r.user_name}</td>
                  <td className="p-2 text-slate-700">{r.category_name}</td>
                  <td className="p-2 text-slate-600 tabular-nums">{fmtDate(r.tanggal)}</td>
                  <td className="p-2 text-right tabular-nums font-medium">{fmtRp(r.jumlah)}</td>
                  <td className="p-2 text-xs">{STATUS_LABEL[r.status] || r.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
