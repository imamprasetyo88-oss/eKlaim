import { useEffect, useState } from "react";
import { api, fmtRp } from "@/lib/api";
import { useAuth, can } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export default function Pengaturan() {
  const { user } = useAuth();
  const [saldo, setSaldo] = useState(null);
  const [newSaldo, setNewSaldo] = useState("");
  const [pw, setPw] = useState({ old: "", new: "" });

  useEffect(() => { api.get("/petty-cash").then(r => { setSaldo(r.data); setNewSaldo(String(r.data.saldo_awal)); }); }, []);

  const saveSaldo = async () => {
    if (!newSaldo || Number(newSaldo) <= 0) return toast.error("Isi nominal");
    if (!window.confirm(`Ubah saldo awal jadi ${fmtRp(Number(newSaldo))}? Ini akan RESET saldo sekarang ke nilai baru.`)) return;
    await api.put("/petty-cash/saldo-awal", { saldo_awal: Number(newSaldo) });
    toast.success("Saldo awal diperbarui");
    api.get("/petty-cash").then(r => setSaldo(r.data));
  };

  const changePw = async () => {
    if (!pw.new || pw.new.length < 6) return toast.error("Min 6 karakter");
    try {
      await api.post("/auth/change-password", { old_password: pw.old, new_password: pw.new });
      toast.success("Password berhasil diubah");
      setPw({ old: "", new: "" });
    } catch (e) { toast.error(e.response?.data?.detail || "Gagal"); }
  };

  return (
    <div className="space-y-6 max-w-2xl" data-testid="settings-page">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900" style={{fontFamily:'Manrope'}}>Pengaturan</h1>
        <p className="text-sm text-slate-500 mt-1">Konfigurasi sistem dan akun Anda.</p>
      </div>

      {can(user, "admin") && saldo && (
        <div className="lyra-card p-6 space-y-3">
          <h3 className="text-sm font-semibold text-slate-800" style={{fontFamily:'Manrope'}}>Petty Cash</h3>
          <div className="text-xs text-slate-500">Saldo awal saat ini: <span className="tabular-nums font-semibold">{fmtRp(saldo.saldo_awal)}</span> · Saldo sekarang: <span className="tabular-nums font-semibold">{fmtRp(saldo.saldo_sekarang)}</span></div>
          <div>
            <Label className="text-xs uppercase text-slate-600">Saldo Awal Baru</Label>
            <Input data-testid="new-saldo" type="number" value={newSaldo} onChange={(e)=>setNewSaldo(e.target.value)} className="tabular-nums font-semibold text-lg"/>
          </div>
          <Button data-testid="btn-save-saldo" onClick={saveSaldo} className="bg-sky-600 hover:bg-sky-700 hover:text-white text-white">Simpan Saldo Awal</Button>
        </div>
      )}

      <div className="lyra-card p-6 space-y-3">
        <h3 className="text-sm font-semibold text-slate-800" style={{fontFamily:'Manrope'}}>Ganti Password</h3>
        <div><Label className="text-xs uppercase text-slate-600">Password Lama</Label><Input type="password" value={pw.old} onChange={(e)=>setPw({...pw, old: e.target.value})}/></div>
        <div><Label className="text-xs uppercase text-slate-600">Password Baru</Label><Input data-testid="new-pw" type="password" value={pw.new} onChange={(e)=>setPw({...pw, new: e.target.value})}/></div>
        <Button data-testid="btn-change-pw" onClick={changePw} className="bg-sky-600 hover:bg-sky-700 hover:text-white text-white">Ubah Password</Button>
      </div>
    </div>
  );
}
