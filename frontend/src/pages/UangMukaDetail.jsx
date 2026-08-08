import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, fmtRp, fmtDate, fmtDateTime, ROLE_LABEL } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import StatusBadge from "@/components/StatusBadge";
import FileUploader, { FileList } from "@/components/FileUploader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { PencilSimple, Trash, PaperPlaneTilt, HandCoins, ArrowDown } from "@phosphor-icons/react";
import { toast } from "sonner";

function SimpleActionDialog({ open, onOpenChange, title, desc, needProof, onConfirm, confirmLabel, confirmClass, testId }) {
  const [note, setNote] = useState("");
  const [files, setFiles] = useState([]);
  return (
    <Dialog open={open} onOpenChange={(v)=>{ onOpenChange(v); if (!v) { setNote(""); setFiles([]); } }}>
      <DialogContent>
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        <p className="text-sm text-slate-600">{desc}</p>
        <Textarea data-testid={`${testId}-note`} value={note} onChange={(e)=>setNote(e.target.value)} placeholder="Catatan (opsional)" rows={3}/>
        {needProof && (
          <div>
            <div className="text-xs uppercase tracking-wider text-slate-600 mb-2">Bukti Transfer</div>
            <FileUploader files={files} onChange={setFiles} testId={`${testId}-proof`}/>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={()=>onOpenChange(false)}>Batal</Button>
          <Button data-testid={`${testId}-confirm`} onClick={()=>onConfirm(note, files.map(f=>f.id))} className={confirmClass || "bg-sky-600 hover:bg-sky-700 hover:text-white text-white"}>{confirmLabel}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RealizeDialog({ open, onOpenChange, ca, onConfirm }) {
  const [jumlah, setJumlah] = useState("");
  const [receipts, setReceipts] = useState([]);
  const [settleProofs, setSettleProofs] = useState([]);
  const [note, setNote] = useState("");
  const selisih = jumlah ? Number(ca.jumlah_um) - Number(jumlah) : 0;
  const needsReturn = selisih > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Realisasi Belanja</DialogTitle></DialogHeader>
        <p className="text-sm text-slate-600">Upload bukti belanja aktual dan isi jumlah yang benar-benar terpakai.</p>

        <div className="text-xs text-slate-500">Uang muka diterima: <span className="tabular-nums font-semibold text-slate-900">{fmtRp(ca.jumlah_um)}</span></div>

        <div>
          <Label className="text-xs uppercase tracking-wider text-slate-600">Jumlah Aktual Terpakai (Rp)</Label>
          <Input data-testid="realize-jumlah" type="number" min="0" value={jumlah} onChange={(e)=>setJumlah(e.target.value)} className="tabular-nums text-lg font-semibold"/>
          {jumlah > 0 && (
            <div className={`text-xs mt-1 tabular-nums font-semibold ${selisih > 0 ? "text-emerald-700" : selisih < 0 ? "text-red-700" : "text-slate-500"}`}>
              {selisih > 0 ? `Anda perlu kembalikan sisa: ${fmtRp(selisih)}` :
               selisih < 0 ? `Verifikator akan bayar kekurangan: ${fmtRp(Math.abs(selisih))}` :
               "Pas — tidak ada selisih ✓"}
            </div>
          )}
        </div>

        <div>
          <div className="text-xs uppercase tracking-wider text-slate-600 mb-2">Bukti Belanja (Struk / Nota) *</div>
          <FileUploader files={receipts} onChange={setReceipts} testId="realize-receipts"/>
        </div>

        {needsReturn && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
            <div className="text-xs font-semibold text-emerald-800 mb-2 flex items-center gap-1"><ArrowDown size={14} weight="bold"/> Bukti Pengembalian Sisa <span className="text-slate-500 font-normal">(opsional, kalau sudah setor)</span></div>
            <FileUploader files={settleProofs} onChange={setSettleProofs} testId="realize-settle-proof"/>
          </div>
        )}

        <Textarea data-testid="realize-note" value={note} onChange={(e)=>setNote(e.target.value)} placeholder="Catatan (opsional)" rows={2}/>
        <DialogFooter>
          <Button variant="outline" onClick={()=>onOpenChange(false)}>Batal</Button>
          <Button
            data-testid="realize-confirm"
            onClick={()=>{
              if (!jumlah || Number(jumlah) < 0) return toast.error("Isi jumlah aktual");
              if (!receipts.length) return toast.error("Upload bukti belanja");
              onConfirm({ jumlah_aktual: Number(jumlah), receipt_ids: receipts.map(f=>f.id), settle_proof_ids: settleProofs.map(f=>f.id), catatan: note });
            }}
            className="bg-sky-600 hover:bg-sky-700 hover:text-white text-white"
          >Kirim Realisasi</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function UangMukaDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const { user } = useAuth();
  const [ca, setCa] = useState(null);
  const [dlg, setDlg] = useState(null);

  const load = () => api.get(`/cash-advances/${id}`).then(r => setCa(r.data));
  useEffect(() => { load(); }, [id]);

  if (!ca) return <div className="text-slate-500">Memuat...</div>;

  const isOwner = ca.user_id === user.id;
  const canEdit = isOwner && (ca.status === "DRAFT_UM" || ca.status === "PERLU_KOREKSI_UM");
  const canDelete = isOwner && ca.status === "DRAFT_UM";
  const canSubmit = isOwner && (ca.status === "DRAFT_UM" || ca.status === "PERLU_KOREKSI_UM");
  const canVerify = user.role === "verifikator" && ca.status === "MENUNGGU_VERIFIKASI_UM";
  const canApprove = user.role === "atasan" && ca.status === "MENUNGGU_APPROVAL_UM";
  const canTransfer = user.role === "verifikator" && ca.status === "MENUNGGU_TRANSFER_UM";
  const canRealize = isOwner && ca.status === "MENUNGGU_BUKTI";
  const canConfirm = user.role === "verifikator" && ca.status === "MENUNGGU_KONFIRMASI_UM";

  const doSubmit = async () => { await api.post(`/cash-advances/${id}/submit`); toast.success("Uang muka diajukan"); load(); };
  const doDelete = async () => { if (!window.confirm("Hapus draft ini?")) return; await api.delete(`/cash-advances/${id}`); toast.success("Terhapus"); nav("/uang-muka"); };

  const doAction = async (endpoint, decision, body, files) => {
    try {
      const payload = { catatan: body || "", transfer_proof_ids: files || [] };
      await api.post(`/cash-advances/${id}/${endpoint}${decision ? `?decision=${decision}`:""}`, payload);
      toast.success("Berhasil");
      setDlg(null); load();
    } catch (e) { toast.error(e.response?.data?.detail || "Gagal"); }
  };

  const doRealize = async (body) => {
    try {
      await api.post(`/cash-advances/${id}/realize`, body);
      toast.success("Realisasi dikirim ke verifikator");
      setDlg(null); load();
    } catch (e) { toast.error(e.response?.data?.detail || "Gagal"); }
  };

  return (
    <div className="max-w-5xl space-y-6" data-testid="um-detail-page">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-3">
            <HandCoins size={28} weight="duotone" className="text-sky-600"/>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900" style={{fontFamily:'Manrope'}}>{ca.code}</h1>
            <StatusBadge status={ca.status}/>
          </div>
          <p className="text-sm text-slate-500 mt-1">Diajukan oleh <b>{ca.user_name}</b> · {fmtDateTime(ca.created_at)}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {canEdit && <Button data-testid="btn-edit-um" variant="outline" onClick={()=>nav(`/uang-muka/${id}/edit`)}><PencilSimple size={16} className="mr-1.5" weight="duotone"/>Edit</Button>}
          {canDelete && <Button data-testid="btn-delete-um" variant="outline" onClick={doDelete} className="text-red-700 border-red-200 hover:bg-red-50"><Trash size={16} className="mr-1.5" weight="duotone"/>Hapus</Button>}
          {canSubmit && <Button data-testid="btn-submit-um-2" onClick={doSubmit} className="bg-sky-600 hover:bg-sky-700 hover:text-white text-white"><PaperPlaneTilt size={16} className="mr-1.5" weight="fill"/>Ajukan</Button>}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="lyra-card p-6">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><div className="text-xs uppercase tracking-wider text-slate-500">Kategori</div><div className="mt-1 text-slate-900 font-medium">{ca.category_name}</div></div>
              <div><div className="text-xs uppercase tracking-wider text-slate-500">Tanggal</div><div className="mt-1 text-slate-900 tabular-nums">{fmtDate(ca.tanggal)}</div></div>
              <div className="col-span-2"><div className="text-xs uppercase tracking-wider text-slate-500">Deskripsi</div><div className="mt-1 text-slate-900">{ca.deskripsi}</div></div>
              {ca.tujuan && <div className="col-span-2"><div className="text-xs uppercase tracking-wider text-slate-500">Tujuan</div><div className="mt-1 text-slate-700">{ca.tujuan}</div></div>}
              <div><div className="text-xs uppercase tracking-wider text-slate-500">Uang Muka</div><div className="mt-1 text-2xl font-bold tabular-nums text-slate-900" style={{fontFamily:'Manrope'}}>{fmtRp(ca.jumlah_um)}</div></div>
              {ca.jumlah_aktual != null && (
                <div>
                  <div className="text-xs uppercase tracking-wider text-slate-500">Realisasi Aktual</div>
                  <div className="mt-1 text-2xl font-bold tabular-nums text-slate-900" style={{fontFamily:'Manrope'}}>{fmtRp(ca.jumlah_aktual)}</div>
                  {ca.selisih != null && Math.abs(ca.selisih) > 0.01 && (
                    <div className={`text-xs mt-1 font-semibold ${ca.selisih > 0 ? "text-emerald-700" : "text-red-700"}`}>
                      {ca.selisih > 0 ? `Sisa dikembalikan: ${fmtRp(ca.selisih)}` : `Kekurangan dibayar: ${fmtRp(Math.abs(ca.selisih))}`}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {ca.transfer_proofs?.length > 0 && (
            <div className="lyra-card p-6">
              <h3 className="text-sm font-semibold text-slate-800 mb-3" style={{fontFamily:'Manrope'}}>Bukti Transfer Uang Muka</h3>
              <FileList files={ca.transfer_proofs}/>
            </div>
          )}

          {ca.receipts?.length > 0 && (
            <div className="lyra-card p-6">
              <h3 className="text-sm font-semibold text-slate-800 mb-3" style={{fontFamily:'Manrope'}}>Bukti Belanja (Realisasi)</h3>
              <FileList files={ca.receipts}/>
            </div>
          )}

          {ca.settle_proofs?.length > 0 && (
            <div className="lyra-card p-6">
              <h3 className="text-sm font-semibold text-slate-800 mb-3" style={{fontFamily:'Manrope'}}>Bukti Pengembalian Sisa</h3>
              <FileList files={ca.settle_proofs}/>
            </div>
          )}

          {(canVerify || canApprove || canTransfer || canRealize || canConfirm) && (
            <div className="lyra-card p-6 bg-sky-50/50 border-sky-200">
              <h3 className="text-sm font-semibold text-slate-800 mb-3" style={{fontFamily:'Manrope'}}>Aksi Anda</h3>
              <div className="flex flex-wrap gap-2">
                {canVerify && <>
                  <Button data-testid="btn-um-verify-approve" onClick={()=>setDlg("verify-approve")} className="bg-emerald-600 hover:bg-emerald-700 hover:text-white text-white">Setuju & Lanjut ke Atasan</Button>
                  <Button data-testid="btn-um-verify-correction" onClick={()=>setDlg("verify-correction")} variant="outline" className="border-amber-300 text-amber-800 hover:bg-amber-50">Kembalikan Koreksi</Button>
                  <Button data-testid="btn-um-verify-reject" onClick={()=>setDlg("verify-reject")} variant="outline" className="text-red-700 border-red-200 hover:bg-red-50">Tolak</Button>
                </>}
                {canApprove && <>
                  <Button data-testid="btn-um-approve" onClick={()=>setDlg("approve")} className="bg-emerald-600 hover:bg-emerald-700 hover:text-white text-white">Setujui</Button>
                  <Button data-testid="btn-um-reject" onClick={()=>setDlg("reject")} variant="outline" className="text-red-700 border-red-200 hover:bg-red-50">Tolak</Button>
                </>}
                {canTransfer && <Button data-testid="btn-um-transfer" onClick={()=>setDlg("transfer")} className="bg-sky-600 hover:bg-sky-700 hover:text-white text-white">Transfer Uang Muka ke User</Button>}
                {canRealize && <Button data-testid="btn-um-realize" onClick={()=>setDlg("realize")} className="bg-sky-600 hover:bg-sky-700 hover:text-white text-white">Upload Bukti Realisasi</Button>}
                {canConfirm && <Button data-testid="btn-um-confirm" onClick={()=>setDlg("confirm")} className="bg-emerald-600 hover:bg-emerald-700 hover:text-white text-white">Konfirmasi & Settle Petty Cash</Button>}
              </div>
              {ca.verifikator_note && <div className="mt-3 text-xs text-slate-600"><b>Catatan Verifikator:</b> {ca.verifikator_note}</div>}
              {ca.atasan_note && <div className="mt-1 text-xs text-slate-600"><b>Catatan Atasan:</b> {ca.atasan_note}</div>}
              {ca.realize_note && <div className="mt-1 text-xs text-slate-600"><b>Catatan User (Realisasi):</b> {ca.realize_note}</div>}
            </div>
          )}
        </div>

        <div className="lyra-card p-6">
          <h3 className="text-sm font-semibold text-slate-800 mb-4" style={{fontFamily:'Manrope'}}>Riwayat</h3>
          <ol className="space-y-4">
            {(ca.timeline || []).map((t, i) => (
              <li key={i} className="flex gap-3">
                <div className="w-2 h-2 rounded-full bg-sky-500 mt-1.5 shrink-0"/>
                <div className="text-sm flex-1">
                  <div className="font-medium text-slate-900">{t.action.replace(/_/g, " ")}</div>
                  <div className="text-xs text-slate-500">{t.actor_name} <span className="text-sky-700">{ROLE_LABEL[t.actor_role]}</span></div>
                  <div className="text-xs text-slate-500 tabular-nums">{fmtDateTime(t.at)}</div>
                  {t.note && <div className="text-xs italic text-slate-700 mt-1 bg-slate-50 p-2 rounded">"{t.note}"</div>}
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>

      <SimpleActionDialog open={dlg==="verify-approve"} onOpenChange={(v)=>!v && setDlg(null)} title="Setujui Uang Muka" desc="Akan diteruskan ke atasan untuk approval." testId="um-verify-approve"
        onConfirm={(note)=>doAction("verify", "approve", note)} confirmLabel="Setujui" confirmClass="bg-emerald-600 hover:bg-emerald-700 hover:text-white text-white"/>
      <SimpleActionDialog open={dlg==="verify-correction"} onOpenChange={(v)=>!v && setDlg(null)} title="Kembalikan untuk Koreksi" desc="User akan diminta koreksi sebelum diajukan ulang." testId="um-verify-correction"
        onConfirm={(note)=>doAction("verify", "correction", note)} confirmLabel="Kembalikan" confirmClass="bg-amber-500 hover:bg-amber-600 hover:text-white text-white"/>
      <SimpleActionDialog open={dlg==="verify-reject"} onOpenChange={(v)=>!v && setDlg(null)} title="Tolak Uang Muka" desc="Ditolak final." testId="um-verify-reject"
        onConfirm={(note)=>doAction("verify", "reject", note)} confirmLabel="Tolak" confirmClass="bg-red-600 hover:bg-red-700 hover:text-white text-white"/>
      <SimpleActionDialog open={dlg==="approve"} onOpenChange={(v)=>!v && setDlg(null)} title="Setujui Uang Muka" desc="Verifikator akan segera mentransfer uang muka." testId="um-approve"
        onConfirm={(note)=>doAction("approve", "approve", note)} confirmLabel="Setujui" confirmClass="bg-emerald-600 hover:bg-emerald-700 hover:text-white text-white"/>
      <SimpleActionDialog open={dlg==="reject"} onOpenChange={(v)=>!v && setDlg(null)} title="Tolak Uang Muka" desc="Ditolak final." testId="um-reject"
        onConfirm={(note)=>doAction("approve", "reject", note)} confirmLabel="Tolak" confirmClass="bg-red-600 hover:bg-red-700 hover:text-white text-white"/>
      <SimpleActionDialog open={dlg==="transfer"} onOpenChange={(v)=>!v && setDlg(null)} title="Transfer Uang Muka"
        desc={`Petty cash akan berkurang ${fmtRp(ca.jumlah_um)}. Upload bukti transfer ke user.`} testId="um-transfer" needProof
        onConfirm={(note, proofs)=>{ if (!proofs.length) return toast.error("Wajib upload bukti transfer"); doAction("transfer", null, note, proofs); }}
        confirmLabel="Transfer & Catat di Petty Cash" confirmClass="bg-sky-600 hover:bg-sky-700 hover:text-white text-white"/>
      <SimpleActionDialog open={dlg==="confirm"} onOpenChange={(v)=>!v && setDlg(null)} title="Konfirmasi Realisasi"
        desc={ca.selisih != null && Math.abs(ca.selisih) > 0.01
          ? (ca.selisih > 0
              ? `Sisa ${fmtRp(ca.selisih)} akan MASUK ke petty cash. Pastikan user sudah setor.`
              : `Petty cash akan berkurang ${fmtRp(Math.abs(ca.selisih))} untuk bayar kekurangan.`)
          : "Realisasi pas — tidak ada perubahan saldo petty cash."} testId="um-confirm"
        onConfirm={(note)=>doAction("confirm", null, note)} confirmLabel="Konfirmasi & Selesaikan"
        confirmClass="bg-emerald-600 hover:bg-emerald-700 hover:text-white text-white"/>

      {dlg === "realize" && <RealizeDialog open onOpenChange={()=>setDlg(null)} ca={ca} onConfirm={doRealize}/>}
    </div>
  );
}
