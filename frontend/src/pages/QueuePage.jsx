import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, fmtRp, fmtDate } from "@/lib/api";
import StatusBadge from "@/components/StatusBadge";

export default function QueuePage({ status, title, description, testId }) {
  const nav = useNavigate();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    api.get("/claims", { params: { status } }).then(r => setRows(r.data)).finally(()=>setLoading(false));
  }, [status]);

  return (
    <div className="space-y-6" data-testid={testId}>
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900" style={{fontFamily:'Manrope'}}>{title}</h1>
        <p className="text-sm text-slate-500 mt-1">{description}</p>
      </div>
      <div className="lyra-card p-4">
        <div className="text-xs text-slate-500 mb-3 tabular-nums">{rows.length} klaim dalam antrean</div>
        <div className="overflow-x-auto lyra-scroll">
          <table className="w-full text-sm" data-testid="queue-table">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-slate-500 border-b border-slate-200">
                <th className="p-2">Kode</th>
                <th className="p-2">Pengaju</th>
                <th className="p-2">Kategori</th>
                <th className="p-2">Deskripsi</th>
                <th className="p-2 text-right">Jumlah</th>
                <th className="p-2">Tanggal</th>
                <th className="p-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={7} className="p-6 text-center text-slate-500">Memuat...</td></tr>}
              {!loading && rows.length === 0 && <tr><td colSpan={7} className="p-8 text-center text-slate-500 italic">Antrean kosong. Semua terkelola dengan baik 🎉</td></tr>}
              {!loading && rows.map(c => (
                <tr key={c.id} className="border-b border-slate-100 hover:bg-sky-50 cursor-pointer" onClick={()=>nav(`/klaim/${c.id}`)} data-testid={`queue-row-${c.code}`}>
                  <td className="p-2 font-medium text-slate-900">{c.code}</td>
                  <td className="p-2 text-slate-700">{c.user_name}</td>
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
