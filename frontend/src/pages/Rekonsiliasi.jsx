import { useEffect, useState } from "react";
import { api, fmtRp } from "@/lib/api";
import { CheckCircle, XCircle, Scales } from "@phosphor-icons/react";

export default function Rekonsiliasi() {
  const [d, setD] = useState(null);
  useEffect(() => { api.get("/reconciliation").then(r => setD(r.data)); }, []);
  if (!d) return <div className="text-slate-500">Memuat...</div>;

  return (
    <div className="space-y-6 max-w-3xl" data-testid="recon-page">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900" style={{fontFamily:'Manrope'}}>Rekonsiliasi Petty Cash</h1>
        <p className="text-sm text-slate-500 mt-1">Verifikasi otomatis kesesuaian saldo dengan riwayat mutasi.</p>
      </div>

      <div className={`lyra-card p-6 border-2 ${d.balanced ? "border-emerald-200 bg-emerald-50/50" : "border-red-200 bg-red-50/50"}`} data-testid="recon-summary">
        <div className="flex items-center gap-3">
          {d.balanced ? <CheckCircle size={40} weight="fill" className="text-emerald-600"/> : <XCircle size={40} weight="fill" className="text-red-600"/>}
          <div>
            <div className="text-2xl font-bold text-slate-900" style={{fontFamily:'Manrope'}}>{d.balanced ? "Saldo Balance ✓" : "Selisih Terdeteksi"}</div>
            <div className="text-sm text-slate-600 mt-1">Berdasarkan {d.tx_count} transaksi tercatat</div>
          </div>
        </div>
      </div>

      <div className="lyra-card p-6">
        <h3 className="text-sm font-semibold text-slate-800 mb-4" style={{fontFamily:'Manrope'}}>Detail Perhitungan</h3>
        <div className="space-y-3 text-sm">
          <div className="flex justify-between py-2 border-b border-slate-100">
            <span className="text-slate-600">Saldo Awal</span>
            <span className="tabular-nums font-medium">{fmtRp(d.saldo_awal)}</span>
          </div>
          <div className="flex justify-between py-2 border-b border-slate-100">
            <span className="text-slate-600">Total Uang Masuk (Top-up)</span>
            <span className="tabular-nums font-medium text-emerald-700">+ {fmtRp(d.total_in)}</span>
          </div>
          <div className="flex justify-between py-2 border-b border-slate-100">
            <span className="text-slate-600">Total Uang Keluar (Pembayaran Klaim)</span>
            <span className="tabular-nums font-medium text-red-700">- {fmtRp(d.total_out)}</span>
          </div>
          <div className="flex justify-between py-2 border-b border-slate-100 font-semibold">
            <span className="text-slate-700">Saldo Seharusnya</span>
            <span className="tabular-nums">{fmtRp(d.expected_saldo)}</span>
          </div>
          <div className="flex justify-between py-2 border-b border-slate-100 font-semibold">
            <span className="text-slate-700">Saldo Aktual (Sistem)</span>
            <span className="tabular-nums">{fmtRp(d.saldo_sekarang)}</span>
          </div>
          <div className={`flex justify-between py-3 text-base font-bold ${d.balanced ? "text-emerald-700" : "text-red-700"}`}>
            <span className="flex items-center gap-2"><Scales size={18} weight="duotone"/> Selisih</span>
            <span className="tabular-nums">{fmtRp(d.selisih)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
