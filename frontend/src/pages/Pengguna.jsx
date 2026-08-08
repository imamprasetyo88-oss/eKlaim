import { useEffect, useState } from "react";
import { api, ROLE_LABEL, fmtDateTime } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, PencilSimple, Key, UserMinus } from "@phosphor-icons/react";
import { toast } from "sonner";

const ROLES = ["user", "verifikator", "atasan", "finance", "auditor", "admin"];

export default function Pengguna() {
  const [rows, setRows] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ username: "", name: "", password: "", role: "user", email: "" });
  const [pwd, setPwd] = useState({ open: false, user: null, val: "" });

  const load = () => api.get("/users").then(r => setRows(r.data));
  useEffect(() => { load(); }, []);

  const create = async () => {
    if (!form.username || !form.name || !form.password) return toast.error("Lengkapi form");
    try {
      await api.post("/users", form);
      toast.success("Pengguna dibuat");
      setOpen(false); setForm({ username: "", name: "", password: "", role: "user", email: "" });
      load();
    } catch (e) { toast.error(e.response?.data?.detail || "Gagal"); }
  };

  const changeRole = async (u, role) => { await api.put(`/users/${u.id}`, { role }); toast.success("Role diperbarui"); load(); };
  const toggle = async (u) => { await api.put(`/users/${u.id}`, { active: !u.active }); load(); };
  const resetPwd = async () => {
    if (!pwd.val || pwd.val.length < 6) return toast.error("Min 6 karakter");
    await api.post(`/users/${pwd.user.id}/reset-password`, { new_password: pwd.val });
    toast.success(`Password ${pwd.user.username} direset`);
    setPwd({ open: false, user: null, val: "" });
  };

  return (
    <div className="space-y-6" data-testid="pengguna-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900" style={{fontFamily:'Manrope'}}>Pengguna</h1>
          <p className="text-sm text-slate-500 mt-1">Kelola akun karyawan dan perannya.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button data-testid="btn-new-user" className="bg-sky-600 hover:bg-sky-700 hover:text-white text-white"><Plus size={16} className="mr-1.5" weight="bold"/>Pengguna Baru</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Pengguna Baru</DialogTitle></DialogHeader>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs uppercase text-slate-600">Username</Label><Input data-testid="user-username" value={form.username} onChange={(e)=>setForm({...form, username: e.target.value.toLowerCase()})}/></div>
              <div><Label className="text-xs uppercase text-slate-600">Nama Lengkap</Label><Input data-testid="user-name" value={form.name} onChange={(e)=>setForm({...form, name: e.target.value})}/></div>
              <div><Label className="text-xs uppercase text-slate-600">Password</Label><Input data-testid="user-password" type="text" value={form.password} onChange={(e)=>setForm({...form, password: e.target.value})}/></div>
              <div><Label className="text-xs uppercase text-slate-600">Email</Label><Input value={form.email} onChange={(e)=>setForm({...form, email: e.target.value})}/></div>
              <div className="col-span-2">
                <Label className="text-xs uppercase text-slate-600">Role</Label>
                <Select value={form.role} onValueChange={(v)=>setForm({...form, role: v})}>
                  <SelectTrigger data-testid="user-role"><SelectValue/></SelectTrigger>
                  <SelectContent>{ROLES.map(r => <SelectItem key={r} value={r}>{ROLE_LABEL[r]}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter><Button variant="outline" onClick={()=>setOpen(false)}>Batal</Button><Button data-testid="btn-save-user" onClick={create} className="bg-sky-600 hover:bg-sky-700 hover:text-white text-white">Simpan</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="lyra-card p-4">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs uppercase tracking-wider text-slate-500 border-b border-slate-200">
            <th className="p-2">Username</th><th className="p-2">Nama</th><th className="p-2">Role</th><th className="p-2">Status</th><th className="p-2">Dibuat</th><th className="p-2"></th>
          </tr></thead>
          <tbody>
            {rows.map(u => (
              <tr key={u.id} className="border-b border-slate-100 hover:bg-slate-50" data-testid={`user-row-${u.username}`}>
                <td className="p-2 font-medium">{u.username}</td>
                <td className="p-2 text-slate-700">{u.name}</td>
                <td className="p-2">
                  <Select value={u.role} onValueChange={(v)=>changeRole(u, v)}>
                    <SelectTrigger className="w-[150px] h-8 text-xs"><SelectValue/></SelectTrigger>
                    <SelectContent>{ROLES.map(r => <SelectItem key={r} value={r}>{ROLE_LABEL[r]}</SelectItem>)}</SelectContent>
                  </Select>
                </td>
                <td className="p-2">
                  {u.active ? <span className="text-xs bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded">Aktif</span> : <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded">Nonaktif</span>}
                </td>
                <td className="p-2 text-xs text-slate-500 tabular-nums">{fmtDateTime(u.created_at)}</td>
                <td className="p-2 text-right">
                  <button data-testid={`reset-pw-${u.username}`} onClick={()=>setPwd({ open: true, user: u, val: "" })} className="text-slate-400 hover:text-sky-600 p-1" title="Reset password"><Key size={16} weight="duotone"/></button>
                  <button data-testid={`toggle-${u.username}`} onClick={()=>toggle(u)} className="text-slate-400 hover:text-amber-600 p-1 ml-1" title={u.active ? "Nonaktifkan" : "Aktifkan"}><UserMinus size={16} weight="duotone"/></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={pwd.open} onOpenChange={(v)=>!v && setPwd({ open: false, user: null, val: "" })}>
        <DialogContent>
          <DialogHeader><DialogTitle>Reset Password: {pwd.user?.username}</DialogTitle></DialogHeader>
          <Input data-testid="new-pwd" value={pwd.val} onChange={(e)=>setPwd({...pwd, val: e.target.value})} placeholder="Password baru (min 6 karakter)" type="text" />
          <DialogFooter>
            <Button variant="outline" onClick={()=>setPwd({ open: false, user: null, val: "" })}>Batal</Button>
            <Button data-testid="btn-reset-pw" onClick={resetPwd} className="bg-sky-600 hover:bg-sky-700 hover:text-white text-white">Reset</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
