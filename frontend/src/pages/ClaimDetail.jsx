import { useEffect, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { api, fmtRp, fmtDate, fmtDateTime, ROLE_LABEL } from "@/lib/api";
import { useAuth, can } from "@/lib/auth";
import StatusBadge from "@/components/StatusBadge";
import { FileList } from "@/components/FileUploader";
import FileUploader from "@/components/FileUploader";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { PencilSimple, Trash, PaperPlaneTilt } from "@phosphor-icons/react";
import { toast } from "sonner";

function ActionDialog({ open, onOpenChange, title, desc, needProof, onConfirm, confirmLabel, confirmClass, testId }) {
  const [note, setNote] = useState("");
  const [files, setFiles] = useState([]);
  return (
    <Dialog open={open} onOpenChange={(v)=>{ onOpenChange(v); if (!v) { setNote(""); setFiles([]); } }}>
      <DialogContent>
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        <p className="text-sm text-slate-600">{desc}</p>
        <Textarea data-testid={`${testId}-note`} value={note} onChange={(e)=>setNote(e.target.value)} placeholder="Catatan (opsional)" rows={3} />
        {needProof && (
          <div>
            <div className="text-xs uppercase tracking-wider text-slate-600 mb-2">Bukti Transfer</div>
            <FileUploader files={files} onChange={setFiles} testId={`${testId}-proof`} />
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={()=>onOpenChange(false)}>Batal</Button>
          <Button
            data-testid={`${testId}-confirm`}
            onClick={()=>{ onConfirm(note, files.map(f=>f.id)); }}
            className={confirmClass || "bg-sky-600 hover:bg-sky-700 hover:text-white text-white"}
          >{confirmLabel}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function ClaimDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const { user } = useAuth();
  const [c, setC] = useState(null);
  const [dlg, setDlg] = useState(null); // "verify-approve", "verify-correction", "verify-reject", "approve", "reject", "pay"

  const load = () => api.get(`/claims/${id}`).then(r => setC(r.data));
  useEffect(() => { load(); }, [id]);

  if (!c) return <div className="text-slate-500">Memuat...</div>;

  const isOwner = c.user_id === user.id;
  const canEdit = isOwner && (c.status === "DRAFT" || c.status === "PERLU_KOREKSI");
  const canSubmit = isOwner && (c.status === "DRAFT" || c.status === "PERLU_KOREKSI") && (c.receipts?.length > 0);
  const canDelete = isOwner && c.status === "DRAFT";
  const canVerify = user.role === "verifikator" && c.status === "DIAJUKAN";
  const canApprove = user.role === "atasan" && c.status === "MENUNGGU_APPROVAL";
  const canPay = user.role === "verifikator" && c.status === "MENUNGGU_PEMBAYARAN";

  const doSubmit = async () => { await api.post(`/claims/${id}/submit`); toast.success("Klaim diajukan"); load(); };
  const doDelete = async () => { if (!window.confirm("Hapus klaim draft ini?")) return; await api.delete(`/claims/${id}`); toast.success("Klaim dihapus"); nav("/klaim"); };

  const doAction = async (endpoint, decision, note, proofs) => {
    try {
      await api.post(`/claims/${id}/${endpoint}${decision ? `?decision=${decision}`:""}`, { catatan: note, transfer_proof_ids: proofs || [] });
      toast.success("Berhasil");
      setDlg(null);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal");
    }
  };

  return (
    <div className="max-w-5xl space-y-6" data-testid="claim-detail-page">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight text-slate-900" style={{fontFamily:'Manrope'}}>{c.code}</h1>
            <StatusBadge status={c.status} />
          </div>
          <p className="text-sm text-slate-500 mt-1">Diajukan oleh <b>{c.user_name}</b> · {fmtDateTime(c.created_at)}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {canEdit && <Button data-testid="btn-edit" variant="outline" onClick={()=>nav(`/klaim/${id}/edit`)}><PencilSimple size={16} className="mr-1.5" weight="duotone"/>Edit</Button>}
          {canDelete && <Button data-testid="btn-delete" variant="outline" onClick={doDelete} className="text-red-700 border-red-200 hover:bg-red-50"><Trash size={16} className="mr-1.5" weight="duotone"/>Hapus</Button>}
          {canSubmit && <Button data-testid="btn-resubmit" onClick={doSubmit} className="bg-sky-600 hover:bg-sky-700 hover:text-white text-white"><PaperPlaneTilt size={16} className="mr-1.5" weight="fill"/>Ajukan</Button>}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="lyra-card p-6">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><div className="text-xs uppercase tracking-wider text-slate-500">Kategori</div><div className="mt-1 text-slate-900 font-medium">{c.category_name}</div></div>
              <div><div className="text-xs uppercase tracking-wider text-slate-500">Tanggal</div><div className="mt-1 text-slate-900 tabular-nums">{fmtDate(c.tanggal)}</div></div>
              <div className="col-span-2"><div className="text-xs uppercase tracking-wider text-slate-500">Deskripsi</div><div className="mt-1 text-slate-900">{c.deskripsi}</div></div>
              {c.tujuan && <div className="col-span-2"><div className="text-xs uppercase tracking-wider text-slate-500">Tujuan</div><div className="mt-1 text-slate-700">{c.tujuan}</div></div>}
              <div><div className="text-xs uppercase tracking-wider text-slate-500">Jumlah</div><div className="mt-1 text-2xl font-bold tabular-nums text-slate-900" style={{fontFamily:'Manrope'}}>{fmtRp(c.jumlah)}</div></div>
            </div>
          </div>

          <div className="lyra-card p-6">
            <h3 className="text-sm font-semibold text-slate-800 mb-3" style={{fontFamily:'Manrope'}}>Bukti Pembayaran</h3>
            <FileList files={c.receipts} />
          </div>

          {c.transfer_proofs?.length > 0 && (
            <div className="lyra-card p-6">
              <h3 className="text-sm font-semibold text-slate-800 mb-3" style={{fontFamily:'Manrope'}}>Bukti Transfer ke User</h3>
              <FileList files={c.transfer_proofs} />
            </div>
          )}

          {/* Actions */}
          {(canVerify || canApprove || canPay) && (
            <div className="lyra-card p-6 bg-sky-50/50 border-sky-200">
              <h3 className="text-sm font-semibold text-slate-800 mb-3" style={{fontFamily:'Manrope'}}>Aksi Anda</h3>
              <div className="flex flex-wrap gap-2">
                {canVerify && <>
                  <Button data-testid="btn-verify-approve" onClick={()=>setDlg("verify-approve")} className="bg-emerald-600 hover:bg-emerald-700 hover:text-white text-white">Setuju & Lanjut ke Atasan</Button>
                  <Button data-testid="btn-verify-correction" onClick={()=>setDlg("verify-correction")} variant="outline" className="border-amber-300 text-amber-800 hover:bg-amber-50">Kembalikan untuk Koreksi</Button>
                  <Button data-testid="btn-verify-reject" onClick={()=>setDlg("verify-reject")} variant="outline" className="text-red-700 border-red-200 hover:bg-red-50">Tolak</Button>
                </>}
                {canApprove && <>
                  <Button data-testid="btn-approve" onClick={()=>setDlg("approve")} className="bg-emerald-600 hover:bg-emerald-700 hover:text-white text-white">Setujui</Button>
                  <Button data-testid="btn-reject" onClick={()=>setDlg("reject")} variant="outline" className="text-red-700 border-red-200 hover:bg-red-50">Tolak</Button>
                </>}
                {canPay && <Button data-testid="btn-pay" onClick={()=>setDlg("pay")} className="bg-sky-600 hover:bg-sky-700 hover:text-white text-white">Bayar & Upload Bukti Transfer</Button>}
              </div>
              {c.verifikator_note && <div className="mt-3 text-xs text-slate-600"><b>Catatan Verifikator:</b> {c.verifikator_note}</div>}
              {c.atasan_note && <div className="mt-1 text-xs text-slate-600"><b>Catatan Atasan:</b> {c.atasan_note}</div>}
            </div>
          )}
        </div>

        <div className="lyra-card p-6">
          <h3 className="text-sm font-semibold text-slate-800 mb-4" style={{fontFamily:'Manrope'}}>Riwayat</h3>
          <ol className="space-y-4">
            {(c.timeline || []).map((t, i) => (
              <li key={i} className="flex gap-3">
                <div className="w-2 h-2 rounded-full bg-sky-500 mt-1.5 shrink-0" />
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

      <ActionDialog open={dlg==="verify-approve"} onOpenChange={(v)=>!v && setDlg(null)} title="Setujui & Lanjutkan ke Atasan"
        desc="Klaim akan diteruskan ke atasan untuk approval final." testId="verify-approve"
        onConfirm={(note)=>doAction("verify", "approve", note)} confirmLabel="Setujui"
        confirmClass="bg-emerald-600 hover:bg-emerald-700 hover:text-white text-white" />
      <ActionDialog open={dlg==="verify-correction"} onOpenChange={(v)=>!v && setDlg(null)} title="Kembalikan untuk Koreksi"
        desc="Klaim akan dikembalikan ke user dengan catatan Anda." testId="verify-correction"
        onConfirm={(note)=>doAction("verify", "correction", note)} confirmLabel="Kembalikan"
        confirmClass="bg-amber-500 hover:bg-amber-600 hover:text-white text-white" />
      <ActionDialog open={dlg==="verify-reject"} onOpenChange={(v)=>!v && setDlg(null)} title="Tolak Klaim"
        desc="Klaim akan ditutup dengan status Ditolak." testId="verify-reject"
        onConfirm={(note)=>doAction("verify", "reject", note)} confirmLabel="Tolak"
        confirmClass="bg-red-600 hover:bg-red-700 hover:text-white text-white" />
      <ActionDialog open={dlg==="approve"} onOpenChange={(v)=>!v && setDlg(null)} title="Setujui Klaim"
        desc="Klaim akan diteruskan ke verifikator untuk dibayarkan dari petty cash." testId="approve"
        onConfirm={(note)=>doAction("approve", "approve", note)} confirmLabel="Setujui"
        confirmClass="bg-emerald-600 hover:bg-emerald-700 hover:text-white text-white" />
      <ActionDialog open={dlg==="reject"} onOpenChange={(v)=>!v && setDlg(null)} title="Tolak Klaim"
        desc="Klaim akan ditutup dengan status Ditolak." testId="reject"
        onConfirm={(note)=>doAction("approve", "reject", note)} confirmLabel="Tolak"
        confirmClass="bg-red-600 hover:bg-red-700 hover:text-white text-white" />
      <ActionDialog open={dlg==="pay"} onOpenChange={(v)=>!v && setDlg(null)} title="Bayar Klaim"
        desc={`Petty cash akan berkurang ${fmtRp(c.jumlah)}. Unggah bukti transfer untuk user.`} testId="pay"
        needProof onConfirm={(note, proofs)=>{ if(!proofs.length) return toast.error("Wajib upload bukti transfer"); doAction("pay", null, note, proofs); }} confirmLabel="Bayarkan"
        confirmClass="bg-sky-600 hover:bg-sky-700 hover:text-white text-white" />
    </div>
  );
}
