import { useEffect, useState, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, fmtRp, fmtDate } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import StatusBadge from "@/components/StatusBadge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, MagnifyingGlass } from "@phosphor-icons/react";

export default function ClaimList() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    const params = { mine: user.role === "user" ? true : false };
    if (status !== "all") params.status = status;
    api.get("/claims", { params }).then(r => setRows(r.data)).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, [status, user.role]);

  const filtered = useMemo(() => rows.filter(r => {
    if (!q) return true;
    const t = q.toLowerCase();
    return r.code.toLowerCase().includes(t) || (r.deskripsi || "").toLowerCase().includes(t) || (r.user_name || "").toLowerCase().includes(t);
  }), [rows, q]);

  return (
    <div className="space-y-6" data-testid="claim-list-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900" style={{fontFamily:'Manrope'}}>{user.role === "user" ? "Klaim Saya" : "Semua Klaim"}</h1>
          <p className="text-sm text-slate-500 mt-1">Daftar pengajuan klaim dan statusnya.</p>
        </div>
        <Button data-testid="btn-new-claim" onClick={() => nav("/klaim/baru")} className="bg-sky-600 hover:bg-sky-700 hover:text-white text-white">
          <Plus size={16} weight="bold" className="mr-1.5" />
          Klaim Baru
        </Button>
      </div>

      <div className="lyra-card p-4">
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <div className="relative flex-1 max-w-md">
            <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input data-testid="search-claim" placeholder="Cari kode, deskripsi, atau nama user..." value={q} onChange={(e)=>setQ(e.target.value)} className="pl-9" />
          </div>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger data-testid="filter-status" className="w-[200px]"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua Status</SelectItem>
              <SelectItem value="DRAFT">Draft</SelectItem>
              <SelectItem value="DIAJUKAN">Diajukan</SelectItem>
              <SelectItem value="PERLU_KOREKSI">Perlu Koreksi</SelectItem>
              <SelectItem value="MENUNGGU_APPROVAL">Menunggu Approval</SelectItem>
              <SelectItem value="MENUNGGU_PEMBAYARAN">Siap Dibayar</SelectItem>
              <SelectItem value="DIBAYAR">Selesai</SelectItem>
              <SelectItem value="DITOLAK">Ditolak</SelectItem>
            </SelectContent>
          </Select>
          <div className="ml-auto text-xs text-slate-500 tabular-nums">{filtered.length} klaim</div>
        </div>

        <div className="overflow-x-auto lyra-scroll">
          <table className="w-full text-sm" data-testid="claim-table">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-slate-500 border-b border-slate-200">
                <th className="p-2">Kode</th>
                {user.role !== "user" && <th className="p-2">Pengaju</th>}
                <th className="p-2">Kategori</th>
                <th className="p-2">Deskripsi</th>
                <th className="p-2 text-right">Jumlah</th>
                <th className="p-2">Tanggal</th>
                <th className="p-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={7} className="p-6 text-center text-slate-500">Memuat...</td></tr>}
              {!loading && filtered.length === 0 && <tr><td colSpan={7} className="p-8 text-center text-slate-500 italic">Belum ada klaim. Klik <b>Klaim Baru</b> untuk mulai.</td></tr>}
              {!loading && filtered.map(c => (
                <tr key={c.id} className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer" onClick={()=>nav(`/klaim/${c.id}`)} data-testid={`claim-row-${c.code}`}>
                  <td className="p-2 font-medium text-slate-900">{c.code}</td>
                  {user.role !== "user" && <td className="p-2 text-slate-700">{c.user_name}</td>}
                  <td className="p-2 text-slate-700">{c.category_name}</td>
                  <td className="p-2 text-slate-600 truncate max-w-[240px]">{c.deskripsi}</td>
                  <td className="p-2 text-right tabular-nums font-medium">{fmtRp(c.jumlah)}</td>
                  <td className="p-2 text-slate-600 tabular-nums">{fmtDate(c.tanggal)}</td>
                  <td className="p-2"><StatusBadge status={c.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
