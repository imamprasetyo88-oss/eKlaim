import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, fmtRp } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PaperPlaneTilt, FloppyDisk, HandCoins } from "@phosphor-icons/react";
import { toast } from "sonner";

export default function UangMukaForm() {
  const nav = useNavigate();
  const { id } = useParams();
  const isEdit = !!id;
  const [cats, setCats] = useState([]);
  const [form, setForm] = useState({ category_id: "", tanggal: new Date().toISOString().slice(0,10), deskripsi: "", tujuan: "", jumlah_um: "" });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get("/categories").then(r => setCats(r.data.filter(c => c.active)));
    if (isEdit) {
      api.get(`/cash-advances/${id}`).then(r => {
        const c = r.data;
        setForm({ category_id: c.category_id, tanggal: c.tanggal, deskripsi: c.deskripsi, tujuan: c.tujuan || "", jumlah_um: String(c.jumlah_um || "") });
      });
    }
  }, [id, isEdit]);

  const save = async (submit = false) => {
    if (!form.category_id) return toast.error("Pilih kategori");
    if (!form.deskripsi) return toast.error("Isi deskripsi");
    if (!form.jumlah_um || Number(form.jumlah_um) <= 0) return toast.error("Jumlah uang muka harus lebih dari 0");
    setBusy(true);
    try {
      const payload = { ...form, jumlah_um: Number(form.jumlah_um) };
      const r = isEdit ? await api.put(`/cash-advances/${id}`, payload) : await api.post("/cash-advances", payload);
      const ca = r.data;
      if (submit) {
        await api.post(`/cash-advances/${ca.id}/submit`);
        toast.success("Uang muka diajukan");
      } else {
        toast.success("Draft tersimpan");
      }
      nav(`/uang-muka/${ca.id}`);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal");
    } finally { setBusy(false); }
  };

  return (
    <div className="max-w-3xl space-y-6" data-testid="um-form-page">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 flex items-center gap-2" style={{fontFamily:'Manrope'}}>
          <HandCoins size={28} weight="duotone" className="text-sky-600" />
          {isEdit ? "Edit Uang Muka" : "Ajukan Uang Muka"}
        </h1>
        <p className="text-sm text-slate-500 mt-1">Uang akan diberikan dulu. Bukti pembelian dilampirkan setelah realisasi.</p>
      </div>

      <div className="lyra-card p-6 space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label className="text-xs uppercase tracking-wider text-slate-600">Kategori</Label>
            <Select value={form.category_id} onValueChange={(v)=>setForm({...form, category_id: v})}>
              <SelectTrigger data-testid="um-category"><SelectValue placeholder="Pilih kategori"/></SelectTrigger>
              <SelectContent>{cats.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs uppercase tracking-wider text-slate-600">Tanggal Rencana</Label>
            <Input data-testid="um-tanggal" type="date" value={form.tanggal} onChange={(e)=>setForm({...form, tanggal: e.target.value})}/>
          </div>
        </div>

        <div>
          <Label className="text-xs uppercase tracking-wider text-slate-600">Jumlah Uang Muka (Rp)</Label>
          <Input data-testid="um-jumlah" type="number" min="0" step="1" value={form.jumlah_um} onChange={(e)=>setForm({...form, jumlah_um: e.target.value})} className="tabular-nums text-lg font-semibold" placeholder="0"/>
          {form.jumlah_um > 0 && <div className="text-xs text-slate-500 mt-1 tabular-nums">{fmtRp(form.jumlah_um)}</div>}
        </div>

        <div>
          <Label className="text-xs uppercase tracking-wider text-slate-600">Deskripsi Keperluan</Label>
          <Textarea data-testid="um-deskripsi" value={form.deskripsi} onChange={(e)=>setForm({...form, deskripsi: e.target.value})} placeholder="Contoh: Beli ATK untuk pantry dan meeting room" rows={3}/>
        </div>

        <div>
          <Label className="text-xs uppercase tracking-wider text-slate-600">Tujuan / Lokasi <span className="text-slate-400 normal-case">(opsional)</span></Label>
          <Input data-testid="um-tujuan" value={form.tujuan} onChange={(e)=>setForm({...form, tujuan: e.target.value})} placeholder="Contoh: Belanja di Ace Hardware BSD"/>
        </div>

        <div className="p-3 bg-sky-50 border border-sky-200 rounded-lg text-xs text-sky-800">
          💡 <b>Cara kerja:</b> Setelah diajukan → verifikasi → approval atasan → verifikator transfer uang → Anda belanja → upload bukti aktual + isi jumlah asli → verifikator konfirmasi. Selisih otomatis diselesaikan lewat petty cash.
        </div>

        <div className="flex flex-wrap gap-3 pt-3 border-t border-slate-200">
          <Button data-testid="btn-save-draft-um" variant="outline" onClick={() => save(false)} disabled={busy}>
            <FloppyDisk size={16} weight="duotone" className="mr-1.5"/>Simpan Draft
          </Button>
          <Button data-testid="btn-submit-um" onClick={() => save(true)} disabled={busy} className="bg-sky-600 hover:bg-sky-700 hover:text-white text-white">
            <PaperPlaneTilt size={16} weight="fill" className="mr-1.5"/>Ajukan
          </Button>
          <Button variant="ghost" onClick={()=>nav(-1)}>Batal</Button>
        </div>
      </div>
    </div>
  );
}
