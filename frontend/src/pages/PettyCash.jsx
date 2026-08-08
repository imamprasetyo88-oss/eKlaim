import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, fmtRp, fmtDateTime } from "@/lib/api";
import { useAuth, can } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Wallet, ArrowUp, ArrowDown, Plus } from "@phosphor-icons/react";
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

export default function PettyCash() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [data, setData] = useState(null);
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");

  const load = () => api.get("/petty-cash").then(r => setData(r.data));
  useEffect(() => { load(); }, []);

  const requestTopup = async () => {
    if (!amount || Number(amount) <= 0) return toast.error("Isi jumlah top-up");
    try {
      await api.post("/topups", { jumlah: Number(amount), catatan: note });
      toast.success("Request top-up dikirim ke Finance");
      setOpen(false); setAmount(""); setNote("");
      load();
    } catch (e) { toast.error(e.response?.data?.detail || "Gagal"); }
  };

  if (!data) return <div className="text-slate-500">Memuat...</div>;
  const pct = data.saldo_awal ? Math.round((data.saldo_sekarang / data.saldo_awal) * 100) : 100;

  return (
    <div className="space-y-6" data-testid="petty-cash-page">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900" style={{fontFamily:'Manrope'}}>Petty Cash</h1>
          <p className="text-sm text-slate-500 mt-1">Kas kecil untuk pembiayaan operasional harian.</p>
        </div>
        {can(user, "verifikator", "admin") && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button data-testid="btn-request-topup" className="bg-sky-600 hover:bg-sky-700 hover:text-white text-white"><Plus size={16} className="mr-1.5" weight="bold"/>Request Top-up</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Request Top-up ke Finance</DialogTitle></DialogHeader>
              <p className="text-sm text-slate-600">Finance akan mentransfer sesuai jumlah yang di-request untuk mengembalikan petty cash ke saldo awal.</p>
              <div>
                <Label className="text-xs uppercase tracking-wider text-slate-600">Jumlah (Rp)</Label>
                <Input data-testid="topup-amount" type="number" min="0" value={amount} onChange={(e)=>setAmount(e.target.value)} className="tabular-nums text-lg font-semibold" />
                {amount > 0 && <div className="text-xs text-slate-500 mt-1 tabular-nums">{fmtRp(amount)}</div>}
                <p className="text-xs text-slate-500 mt-2">Selisih ke saldo awal: <span className="font-semibold tabular-nums">{fmtRp(Math.max(0, data.saldo_awal - data.saldo_sekarang))}</span></p>
              </div>
              <div>
                <Label className="text-xs uppercase tracking-wider text-slate-600">Catatan</Label>
                <Textarea value={note} onChange={(e)=>setNote(e.target.value)} rows={3} placeholder="Contoh: Refill petty cash setelah pembayaran klaim minggu ini" />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={()=>setOpen(false)}>Batal</Button>
                <Button data-testid="btn-submit-topup" onClick={requestTopup} className="bg-sky-600 hover:bg-sky-700 hover:text-white text-white">Kirim ke Finance</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-2 lyra-card p-6 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-sky-50 to-transparent opacity-60 pointer-events-none" />
          <div className="relative">
            <div className="flex items-center gap-2">
              <Wallet size={18} className="text-sky-600" weight="duotone" />
              <div className="kpi-label">Saldo Sekarang</div>
            </div>
            <div className="kpi-value mt-2 tabular-nums" style={{fontSize:'42px'}}>{fmtRp(data.saldo_sekarang)}</div>
            <div className="text-xs text-slate-500 mt-2">dari saldo awal <span className="tabular-nums font-semibold">{fmtRp(data.saldo_awal)}</span></div>
            <div className="mt-4 h-3 bg-slate-100 rounded-full overflow-hidden">
              <div className={`h-full rounded-full transition-all ${rawPct < 30 ? "bg-red-500" : rawPct < 60 ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${pct}%` }} />
            </div>
            <div className="mt-1 text-xs text-slate-500 tabular-nums">
              {surplus > 0 ? <>Utuh + surplus <span className="text-emerald-700 font-semibold">{fmtRp(surplus)}</span></> : <>{Math.round(rawPct)}% dari saldo awal</>}
            </div>
          </div>
        </div>
        <div className="lyra-card p-6">
          <div className="kpi-label">Total Mutasi</div>
          <div className="mt-3 space-y-2">
            <div className="flex items-center gap-2 text-emerald-700">
              <ArrowDown size={16} weight="bold" />
              <span className="text-xs">Masuk (Top-up)</span>
              <span className="ml-auto tabular-nums font-semibold">{fmtRp(data.transactions.filter(t=>t.delta>0).reduce((s,t)=>s+t.delta,0))}</span>
            </div>
            <div className="flex items-center gap-2 text-red-700">
              <ArrowUp size={16} weight="bold" />
              <span className="text-xs">Keluar (Pembayaran)</span>
              <span className="ml-auto tabular-nums font-semibold">{fmtRp(Math.abs(data.transactions.filter(t=>t.delta<0).reduce((s,t)=>s+t.delta,0)))}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="lyra-card p-4">
        <h3 className="text-sm font-semibold text-slate-800 mb-3 px-2" style={{fontFamily:'Manrope'}}>Riwayat Mutasi</h3>
        <div className="overflow-x-auto lyra-scroll">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-slate-500 border-b border-slate-200">
                <th className="p-2">Waktu</th><th className="p-2">Tipe</th><th className="p-2">Deskripsi</th>
                <th className="p-2 text-right">Jumlah</th><th className="p-2 text-right">Saldo Setelah</th><th className="p-2">Oleh</th>
              </tr>
            </thead>
            <tbody>
              {data.transactions.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-slate-500 italic">Belum ada mutasi.</td></tr>}
              {data.transactions.map(t => (
                <tr key={t.id} className="border-b border-slate-100 hover:bg-slate-50" data-testid={`tx-${t.id}`}>
                  <td className="p-2 text-xs text-slate-500 tabular-nums">{fmtDateTime(t.created_at)}</td>
                  <td className="p-2">
                    <span className={`text-xs font-semibold ${t.delta > 0 ? "text-emerald-700" : "text-red-700"}`}>{t.delta > 0 ? "MASUK" : "KELUAR"}</span>
                  </td>
                  <td className="p-2 text-slate-700">{t.description}</td>
                  <td className={`p-2 text-right tabular-nums font-medium ${t.delta > 0 ? "text-emerald-700" : "text-red-700"}`}>{t.delta > 0 ? "+" : "-"}{fmtRp(Math.abs(t.delta))}</td>
                  <td className="p-2 text-right tabular-nums">{fmtRp(t.balance_after)}</td>
                  <td className="p-2 text-xs text-slate-600">{t.actor_name}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
