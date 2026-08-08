import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, fmtRp } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import FileUploader from "@/components/FileUploader";
import { Sparkle, PaperPlaneTilt, FloppyDisk } from "@phosphor-icons/react";
import { toast } from "sonner";

export default function ClaimForm() {
  const nav = useNavigate();
  const { id } = useParams();
  const isEdit = !!id;
  const [cats, setCats] = useState([]);
  const [form, setForm] = useState({ category_id: "", tanggal: new Date().toISOString().slice(0,10), deskripsi: "", tujuan: "", jumlah: "" });
  const [receipts, setReceipts] = useState([]);
  const [ocrBusy, setOcrBusy] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get("/categories").then(r => setCats(r.data.filter(c => c.active)));
    if (isEdit) {
      api.get(`/claims/${id}`).then(r => {
        const c = r.data;
        setForm({ category_id: c.category_id, tanggal: c.tanggal, deskripsi: c.deskripsi, tujuan: c.tujuan || "", jumlah: String(c.jumlah || "") });
        setReceipts(c.receipts || []);
      });
    }
  }, [id, isEdit]);

  const runOCR = async () => {
    const image = receipts.find(r => (r.content_type || "").startsWith("image/"));
    if (!image) return toast.info("Unggah gambar struk terlebih dahulu");
    setOcrBusy(true);
    try {
      const r = await api.post(`/ocr/receipt?file_id=${image.id}`);
      const d = r.data;
      if (d.jumlah) setForm(f => ({ ...f, jumlah: String(d.jumlah) }));
      if (d.tanggal) setForm(f => ({ ...f, tanggal: d.tanggal }));
      const catGuess = cats.find(c => c.name.toLowerCase().includes((d.kategori_tebakan || "").toLowerCase()));
      if (catGuess && !form.category_id) setForm(f => ({ ...f, category_id: catGuess.id }));
      const desc = [d.merchant, d.catatan].filter(Boolean).join(" — ");
      if (desc && !form.deskripsi) setForm(f => ({ ...f, deskripsi: desc }));
      if (d.note) toast.info(d.note);
      else toast.success("Data struk berhasil diekstrak");
    } catch (e) {
      toast.error("OCR gagal: " + (e.response?.data?.detail || e.message));
    } finally { setOcrBusy(false); }
  };

  const save = async (submit = false) => {
    if (!form.category_id) return toast.error("Pilih kategori");
    if (!form.deskripsi) return toast.error("Isi deskripsi");
    if (!form.jumlah || Number(form.jumlah) <= 0) return toast.error("Jumlah harus lebih dari 0");
    setBusy(true);
    try {
      const payload = { ...form, jumlah: Number(form.jumlah), receipt_ids: receipts.map(r => r.id) };
      const r = isEdit ? await api.put(`/claims/${id}`, payload) : await api.post("/claims", payload);
      const claim = r.data;
      if (submit) {
        if (!receipts.length) { toast.error("Bukti pembayaran wajib diunggah"); setBusy(false); return; }
        await api.post(`/claims/${claim.id}/submit`);
        toast.success("Klaim berhasil diajukan");
      } else {
        toast.success("Klaim tersimpan sebagai draft");
      }
      nav(`/klaim/${claim.id}`);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal menyimpan");
    } finally { setBusy(false); }
  };

  return (
    <div className="max-w-3xl space-y-6" data-testid="claim-form-page">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900" style={{fontFamily:'Manrope'}}>{isEdit ? "Edit Klaim" : "Ajukan Klaim Baru"}</h1>
        <p className="text-sm text-slate-500 mt-1">Isi detail pengeluaran dan unggah bukti pembayaran.</p>
      </div>

      <div className="lyra-card p-6 space-y-5">
        <div>
          <Label className="text-xs uppercase tracking-wider text-slate-600">Bukti Pembayaran (Struk / Nota)</Label>
          <p className="text-xs text-slate-500 mb-2 mt-1">Unggah foto struk. Setelah upload, klik <b>OCR Otomatis</b> untuk isi otomatis jumlah & tanggal.</p>
          <FileUploader files={receipts} onChange={setReceipts} testId="receipts-uploader" />
          {receipts.length > 0 && (
            <Button
              type="button"
              variant="outline"
              onClick={runOCR}
              disabled={ocrBusy}
              data-testid="btn-ocr"
              className="mt-3 border-sky-300 text-sky-700 hover:bg-sky-50 hover:text-sky-800"
            >
              <Sparkle size={16} weight="duotone" className="mr-1.5" />
              {ocrBusy ? "Membaca struk..." : "OCR Otomatis (GPT Vision)"}
            </Button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label className="text-xs uppercase tracking-wider text-slate-600">Kategori</Label>
            <Select value={form.category_id} onValueChange={(v)=>setForm({...form, category_id: v})}>
              <SelectTrigger data-testid="claim-category"><SelectValue placeholder="Pilih kategori" /></SelectTrigger>
              <SelectContent>
                {cats.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs uppercase tracking-wider text-slate-600">Tanggal Pengeluaran</Label>
            <Input data-testid="claim-tanggal" type="date" value={form.tanggal} onChange={(e)=>setForm({...form, tanggal: e.target.value})}/>
          </div>
        </div>

        <div>
          <Label className="text-xs uppercase tracking-wider text-slate-600">Jumlah Klaim (Rp)</Label>
          <Input data-testid="claim-jumlah" type="number" min="0" step="1" value={form.jumlah} onChange={(e)=>setForm({...form, jumlah: e.target.value})} placeholder="0" className="tabular-nums text-lg font-semibold" />
          {form.jumlah > 0 && <div className="text-xs text-slate-500 mt-1 tabular-nums">{fmtRp(form.jumlah)}</div>}
        </div>

        <div>
          <Label className="text-xs uppercase tracking-wider text-slate-600">Deskripsi</Label>
          <Textarea data-testid="claim-deskripsi" value={form.deskripsi} onChange={(e)=>setForm({...form, deskripsi: e.target.value})} placeholder="Contoh: Tol Jakarta-Cikampek PP untuk kunjungan client PT ABC" rows={3}/>
        </div>

        <div>
          <Label className="text-xs uppercase tracking-wider text-slate-600">Keperluan / Tujuan <span className="text-slate-400 normal-case">(opsional)</span></Label>
          <Input data-testid="claim-tujuan" value={form.tujuan} onChange={(e)=>setForm({...form, tujuan: e.target.value})} placeholder="Contoh: Meeting client PT ABC di Bandung" />
        </div>

        <div className="flex flex-wrap gap-3 pt-3 border-t border-slate-200">
          <Button data-testid="btn-save-draft" variant="outline" onClick={() => save(false)} disabled={busy}>
            <FloppyDisk size={16} weight="duotone" className="mr-1.5" />
            Simpan Draft
          </Button>
          <Button data-testid="btn-submit" onClick={() => save(true)} disabled={busy} className="bg-sky-600 hover:bg-sky-700 hover:text-white text-white">
            <PaperPlaneTilt size={16} weight="fill" className="mr-1.5" />
            Ajukan ke Verifikator
          </Button>
          <Button variant="ghost" onClick={()=>nav(-1)} data-testid="btn-cancel">Batal</Button>
        </div>
      </div>
    </div>
  );
}
