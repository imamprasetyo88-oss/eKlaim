import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, fmtRp, fmtDate } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import StatusBadge from "@/components/StatusBadge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, MagnifyingGlass, HandCoins } from "@phosphor-icons/react";

export default function UangMuka() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const params = { mine: user.role === "user" };
    if (status !== "all") params.status = status;
    api.get("/cash-advances", { params }).then(r => setRows(r.data)).finally(() => setLoading(false));
  }, [status, user.role]);

  const filtered = useMemo(() => rows.filter(r => {
    if (!q) return true;
    const t = q.toLowerCase();
    return r.code.toLowerCase().includes(t) || (r.deskripsi || "").toLowerCase().includes(t) || (r.user_name || "").toLowerCase().includes(t);
  }), [rows, q]);

  return (
    <div className="space-y-6" data-testid="um-list-page">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 flex items-center gap-2" style={{fontFamily:'Manrope'}}>
            <HandCoins size={28} weight="duotone" className="text-sky-600" /> Uang Muka
          </h1>
          <p className="text-sm text-slate-500 mt-1">Pengajuan uang muka — dana diberikan dulu, bukti belanja menyusul.</p>
        </div>
        <Button data-testid="btn-new-um" onClick={() => nav("/uang-muka/baru")} className="bg-sky-600 hover:bg-sky-700 hover:text-white text-white">
          <Plus size={16} weight="bold" className="mr-1.5" /> Uang Muka Baru
        </Button>
      </div>

      <div className="lyra-card p-4">
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <div className="relative flex-1 max-w-md">
            <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input data-testid="search-um" placeholder="Cari kode, deskripsi, atau nama user..." value={q} onChange={(e)=>setQ(e.target.value)} className="pl-9" />
          </div>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger data-testid="filter-um-status" className="w-[220px]"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua Status</SelectItem>
              <SelectItem value="DRAFT_UM">Draft</SelectItem>
              <SelectItem value="MENUNGGU_VERIFIKASI_UM">Menunggu Verifikasi</SelectItem>
              <SelectItem value="PERLU_KOREKSI_UM">Perlu Koreksi</SelectItem>
              <SelectItem value="MENUNGGU_APPROVAL_UM">Menunggu Approval</SelectItem>
              <SelectItem value="MENUNGGU_TRANSFER_UM">Menunggu Transfer</SelectItem>
              <SelectItem value="MENUNGGU_BUKTI">Menunggu Bukti</SelectItem>
              <SelectItem value="MENUNGGU_KONFIRMASI_UM">Menunggu Konfirmasi</SelectItem>
              <SelectItem value="SELESAI_UM">Selesai</SelectItem>
              <SelectItem value="DITOLAK_UM">Ditolak</SelectItem>
            </SelectContent>
          </Select>
          <div className="ml-auto text-xs text-slate-500 tabular-nums">{filtered.length} pengajuan</div>
        </div>

        <div className="overflow-x-auto lyra-scroll">
          <table className="w-full text-sm" data-testid="um-table">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-slate-500 border-b border-slate-200">
                <th className="p-2">Kode</th>
                {user.role !== "user" && <th className="p-2">Pengaju</th>}
                <th className="p-2">Kategori</th>
                <th className="p-2">Deskripsi</th>
                <th className="p-2 text-right">Uang Muka</th>
                <th className="p-2 text-right">Aktual</th>
                <th className="p-2 text-right">Selisih</th>
                <th className="p-2">Tanggal</th>
                <th className="p-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={9} className="p-6 text-center text-slate-500">Memuat...</td></tr>}
              {!loading && filtered.length === 0 && <tr><td colSpan={9} className="p-8 text-center text-slate-500 italic">Belum ada uang muka. Klik <b>Uang Muka Baru</b>.</td></tr>}
              {!loading && filtered.map(c => (
                <tr key={c.id} className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer" onClick={()=>nav(`/uang-muka/${c.id}`)} data-testid={`um-row-${c.code}`}>
                  <td className="p-2 font-medium text-slate-900">{c.code}</td>
                  {user.role !== "user" && <td className="p-2 text-slate-700">{c.user_name}</td>}
                  <td className="p-2 text-slate-700">{c.category_name}</td>
                  <td className="p-2 text-slate-600 truncate max-w-[220px]">{c.deskripsi}</td>
                  <td className="p-2 text-right tabular-nums font-medium">{fmtRp(c.jumlah_um)}</td>
                  <td className="p-2 text-right tabular-nums text-slate-600">{c.jumlah_aktual != null ? fmtRp(c.jumlah_aktual) : "-"}</td>
                  <td className={`p-2 text-right tabular-nums ${c.selisih > 0 ? "text-emerald-700" : c.selisih < 0 ? "text-red-700" : "text-slate-500"}`}>
                    {c.selisih != null ? (c.selisih > 0 ? "+" : c.selisih < 0 ? "-" : "") + fmtRp(Math.abs(c.selisih)) : "-"}
                  </td>
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
