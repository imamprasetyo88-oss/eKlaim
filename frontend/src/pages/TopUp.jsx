import { useEffect, useState } from "react";
import { api, fmtRp, fmtDateTime, STATUS_LABEL } from "@/lib/api";
import { useAuth, can } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import FileUploader, { FileList } from "@/components/FileUploader";
import { toast } from "sonner";
import StatusBadge from "@/components/StatusBadge";

function DetailDialog({ topup, onClose, onDone, canApprove }) {
  const [note, setNote] = useState("");
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);

  const approve = async () => {
    if (!files.length) return toast.error("Bukti transfer wajib diunggah");
    setBusy(true);
    try {
      await api.post(`/topups/${topup.id}/approve`, { catatan: note, transfer_proof_ids: files.map(f=>f.id) });
      toast.success("Top-up disetujui & petty cash telah diisi ulang");
      onDone();
    } catch (e) { toast.error(e.response?.data?.detail || "Gagal"); }
    finally { setBusy(false); }
  };
  const reject = async () => {
    setBusy(true);
    try {
      await api.post(`/topups/${topup.id}/reject`, { catatan: note, transfer_proof_ids: [] });
      toast.success("Top-up ditolak");
      onDone();
    } catch (e) { toast.error(e.response?.data?.detail || "Gagal"); }
    finally { setBusy(false); }
  };

  return (
    <Dialog open={!!topup} onOpenChange={(v)=>!v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{topup.code}</DialogTitle></DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="flex justify-between"><span className="text-slate-500">Diminta oleh</span><span className="font-medium">{topup.requested_by_name}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Jumlah</span><span className="font-bold text-lg tabular-nums">{fmtRp(topup.jumlah)}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Waktu</span><span className="tabular-nums">{fmtDateTime(topup.created_at)}</span></div>
          <div className="flex justify-between items-center"><span className="text-slate-500">Status</span><StatusBadge status={topup.status} /></div>
          {topup.catatan && <div className="text-slate-700 bg-slate-50 p-3 rounded italic">"{topup.catatan}"</div>}
          {topup.status === "SELESAI" && topup.transfer_proof_ids?.length > 0 && (
            <div>
              <div className="text-xs uppercase tracking-wider text-slate-500 mb-2">Bukti Transfer</div>
              <FileList files={(topup.transfer_proofs || []).length ? topup.transfer_proofs : topup.transfer_proof_ids.map(id=>({id}))}/>
            </div>
          )}
        </div>
        {canApprove && (
          <>
            <div className="space-y-3 pt-3 border-t border-slate-200">
              <div>
                <div className="text-xs uppercase tracking-wider text-slate-600 mb-2">Bukti Transfer</div>
                <FileUploader files={files} onChange={setFiles} testId="topup-proof-uploader"/>
              </div>
              <Textarea placeholder="Catatan (opsional)" value={note} onChange={(e)=>setNote(e.target.value)} rows={2} data-testid="topup-note"/>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={reject} disabled={busy} className="text-red-700 border-red-200 hover:bg-red-50" data-testid="btn-reject-topup">Tolak</Button>
              <Button onClick={approve} disabled={busy} className="bg-emerald-600 hover:bg-emerald-700 hover:text-white text-white" data-testid="btn-approve-topup">Setujui & Transfer</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function TopUp() {
  const { user } = useAuth();
  const [rows, setRows] = useState([]);
  const [sel, setSel] = useState(null);

  const load = () => api.get("/topups").then(r => setRows(r.data));
  useEffect(() => { load(); }, []);
  const canApprove = user.role === "finance";

  return (
    <div className="space-y-6" data-testid="topup-page">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900" style={{fontFamily:'Manrope'}}>Top-up Petty Cash</h1>
        <p className="text-sm text-slate-500 mt-1">Antrean permintaan top-up petty cash dari verifikator.</p>
      </div>
      <div className="lyra-card p-4">
        <div className="overflow-x-auto lyra-scroll">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs uppercase tracking-wider text-slate-500 border-b border-slate-200">
              <th className="p-2">Kode</th><th className="p-2">Pemohon</th><th className="p-2 text-right">Jumlah</th>
              <th className="p-2">Waktu</th><th className="p-2">Status</th>
            </tr></thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-slate-500 italic">Belum ada request top-up.</td></tr>}
              {rows.map(t => (
                <tr key={t.id} className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer" onClick={()=>setSel(t)} data-testid={`topup-row-${t.code}`}>
                  <td className="p-2 font-medium">{t.code}</td>
                  <td className="p-2 text-slate-700">{t.requested_by_name}</td>
                  <td className="p-2 text-right tabular-nums font-medium">{fmtRp(t.jumlah)}</td>
                  <td className="p-2 text-slate-500 text-xs tabular-nums">{fmtDateTime(t.created_at)}</td>
                  <td className="p-2"><StatusBadge status={t.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {sel && <DetailDialog topup={sel} onClose={()=>setSel(null)} onDone={()=>{ setSel(null); load(); }} canApprove={canApprove && sel.status === "MENUNGGU_FINANCE"} />}
    </div>
  );
}
