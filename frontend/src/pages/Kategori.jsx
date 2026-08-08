import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, PencilSimple, Trash } from "@phosphor-icons/react";
import { toast } from "sonner";

export default function Kategori() {
  const [rows, setRows] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ code: "", name: "", icon: "Receipt", active: true });
  const [editId, setEditId] = useState(null);

  const load = () => api.get("/categories").then(r => setRows(r.data));
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!form.code || !form.name) return toast.error("Kode & nama wajib diisi");
    try {
      if (editId) await api.put(`/categories/${editId}`, form);
      else await api.post("/categories", form);
      toast.success("Tersimpan");
      setOpen(false); setForm({ code: "", name: "", icon: "Receipt", active: true }); setEditId(null);
      load();
    } catch (e) { toast.error(e.response?.data?.detail || "Gagal"); }
  };

  const edit = (c) => { setForm({ code: c.code, name: c.name, icon: c.icon || "Receipt", active: c.active }); setEditId(c.id); setOpen(true); };
  const remove = async (c) => { if (!window.confirm(`Nonaktifkan "${c.name}"?`)) return; await api.delete(`/categories/${c.id}`); toast.success("Dinonaktifkan"); load(); };

  return (
    <div className="space-y-6" data-testid="kategori-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900" style={{fontFamily:'Manrope'}}>Kategori Klaim</h1>
          <p className="text-sm text-slate-500 mt-1">Kelola daftar kategori pengeluaran.</p>
        </div>
        <Dialog open={open} onOpenChange={(v)=>{ setOpen(v); if (!v) { setEditId(null); setForm({ code:"", name:"", icon:"Receipt", active:true }); } }}>
          <DialogTrigger asChild><Button data-testid="btn-new-category" className="bg-sky-600 hover:bg-sky-700 hover:text-white text-white"><Plus size={16} className="mr-1.5" weight="bold"/>Kategori Baru</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{editId ? "Edit Kategori" : "Kategori Baru"}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label className="text-xs uppercase text-slate-600">Kode</Label><Input data-testid="cat-code" value={form.code} onChange={(e)=>setForm({...form, code: e.target.value.toUpperCase()})} placeholder="TOL" /></div>
              <div><Label className="text-xs uppercase text-slate-600">Nama</Label><Input data-testid="cat-name" value={form.name} onChange={(e)=>setForm({...form, name: e.target.value})} placeholder="Karcis Tol" /></div>
            </div>
            <DialogFooter><Button variant="outline" onClick={()=>setOpen(false)}>Batal</Button><Button data-testid="btn-save-category" onClick={save} className="bg-sky-600 hover:bg-sky-700 hover:text-white text-white">Simpan</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="lyra-card p-4">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs uppercase tracking-wider text-slate-500 border-b border-slate-200">
            <th className="p-2">Kode</th><th className="p-2">Nama</th><th className="p-2">Status</th><th className="p-2"></th>
          </tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={4} className="p-6 text-center text-slate-500 italic">Belum ada kategori.</td></tr>}
            {rows.map(c => (
              <tr key={c.id} className="border-b border-slate-100 hover:bg-slate-50" data-testid={`cat-row-${c.code}`}>
                <td className="p-2 font-medium">{c.code}</td>
                <td className="p-2 text-slate-700">{c.name}</td>
                <td className="p-2">{c.active ? <span className="text-xs bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded">Aktif</span> : <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded">Nonaktif</span>}</td>
                <td className="p-2 text-right">
                  <button data-testid={`cat-edit-${c.code}`} onClick={()=>edit(c)} className="text-slate-400 hover:text-sky-600 p-1"><PencilSimple size={16} weight="duotone"/></button>
                  <button data-testid={`cat-del-${c.code}`} onClick={()=>remove(c)} className="text-slate-400 hover:text-red-600 p-1 ml-1"><Trash size={16} weight="duotone"/></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
