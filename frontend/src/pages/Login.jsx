import { useEffect, useState } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Receipt, Buildings } from "@phosphor-icons/react";
import { toast } from "sonner";

export default function Login() {
  const { user, login } = useAuth();
  const nav = useNavigate();
  const [companies, setCompanies] = useState([]);
  const [companyId, setCompanyId] = useState("");
  const [username, setU] = useState("");
  const [password, setP] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(null);

  useEffect(() => {
    api.get("/companies").then((r) => {
      setCompanies(r.data);
      if (r.data.length > 0 && !companyId) setCompanyId(r.data[0].id);
    });
    api.get("/setup/status").then((r) => setStatus(r.data)).catch(() => {});
  }, []);

  if (user) return <Navigate to="/" replace />;

  const submit = async (e) => {
    e.preventDefault();
    if (!companyId) return toast.error("Pilih perusahaan");
    setBusy(true);
    try {
      await login(username.trim(), password, companyId);
      toast.success("Berhasil masuk");
      nav("/");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Login gagal");
    } finally { setBusy(false); }
  };

  const initAdmin = async () => {
    if (!companyId) return toast.error("Pilih perusahaan dulu");
    try {
      const r = await api.post(`/setup/init?company_id=${companyId}`);
      toast.success(`Admin dibuat untuk ${r.data.company}. Username: ${r.data.username}, Password: ${r.data.password}`);
      setU(r.data.username); setP(r.data.password);
      const s = await api.get("/setup/status");
      setStatus(s.data);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Gagal inisialisasi");
    }
  };

  const adminMissing = status && companyId && status.admin_exists_by_company && status.admin_exists_by_company[companyId] === false;
  const currentCompanyName = companies.find(c => c.id === companyId)?.name || "";

  return (
    <div className="min-h-screen grid md:grid-cols-2 lyra-login-bg">
      <div className="hidden md:flex flex-col justify-between p-12 relative overflow-hidden">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-lg bg-gradient-to-br from-sky-500 to-sky-700 grid place-items-center text-white shadow-md">
            <Receipt size={24} weight="fill" />
          </div>
          <div>
            <div className="font-bold text-slate-900 text-lg" style={{fontFamily:'Manrope'}}>eKlaim</div>
            <div className="text-xs uppercase text-sky-700 tracking-wider">Multi-Perusahaan</div>
          </div>
        </div>
        <div>
          <h1 className="text-4xl lg:text-5xl font-bold text-slate-900 leading-tight" style={{fontFamily:'Manrope'}}>
            Klaim & Petty Cash <span className="text-sky-600">tanpa ribet.</span>
          </h1>
          <p className="mt-4 text-slate-600 max-w-md leading-relaxed">
            Sistem klaim operasional harian yang mendukung banyak perusahaan dengan data terpisah total.
          </p>
          <div className="mt-8 grid grid-cols-2 gap-4 max-w-md">
            {companies.map((c) => (
              <div key={c.id} className={`p-4 rounded-lg border-2 transition-all ${companyId === c.id ? "border-sky-500 bg-sky-50" : "border-slate-200 bg-white"}`}>
                <Buildings size={20} className="text-sky-600 mb-1" weight="duotone"/>
                <div className="text-sm font-semibold text-slate-900" style={{fontFamily:'Manrope'}}>{c.name}</div>
                <div className="text-xs text-slate-500 mt-0.5">{c.code}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="text-xs text-slate-500">© {new Date().getFullYear()} Data terisolasi per perusahaan.</div>
      </div>

      <div className="flex items-center justify-center p-6 md:p-12">
        <div className="w-full max-w-md">
          <div className="lyra-card p-8">
            <div className="md:hidden flex items-center gap-2 mb-6">
              <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-sky-500 to-sky-700 grid place-items-center text-white">
                <Receipt size={20} weight="fill" />
              </div>
              <div className="font-bold text-slate-900" style={{fontFamily:'Manrope'}}>eKlaim</div>
            </div>
            <h2 className="text-2xl font-bold text-slate-900" style={{fontFamily:'Manrope'}}>Masuk ke akun</h2>
            <p className="text-sm text-slate-500 mt-1">Pilih perusahaan lalu masukkan kredensial Anda.</p>
            <form onSubmit={submit} className="mt-6 space-y-4">
              <div>
                <Label className="text-xs uppercase tracking-wider text-slate-600">Perusahaan</Label>
                <Select value={companyId} onValueChange={setCompanyId}>
                  <SelectTrigger data-testid="login-company"><SelectValue placeholder="Pilih perusahaan"/></SelectTrigger>
                  <SelectContent>
                    {companies.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="username" className="text-xs uppercase tracking-wider text-slate-600">Username</Label>
                <Input id="username" data-testid="login-username" value={username} onChange={(e)=>setU(e.target.value)} required autoComplete="username" />
              </div>
              <div>
                <Label htmlFor="password" className="text-xs uppercase tracking-wider text-slate-600">Password</Label>
                <Input id="password" data-testid="login-password" type="password" value={password} onChange={(e)=>setP(e.target.value)} required autoComplete="current-password" />
              </div>
              <Button data-testid="login-submit" type="submit" disabled={busy || !companyId} className="w-full bg-sky-600 hover:bg-sky-700 hover:text-white text-white h-11 font-semibold">
                {busy ? "Memproses..." : "Masuk"}
              </Button>
            </form>
            {adminMissing && (
              <div className="mt-6 p-4 rounded-lg bg-amber-50 border border-amber-200">
                <div className="text-sm font-semibold text-amber-900">Belum ada admin di {currentCompanyName}</div>
                <p className="text-xs text-amber-800 mt-1">Klik untuk membuat admin awal (username: <b>admin</b>, password: <b>admin123</b>). Segera ganti password setelah login.</p>
                <Button data-testid="init-admin" onClick={initAdmin} variant="outline" className="mt-3 w-full border-amber-400 text-amber-800 hover:bg-amber-100">
                  Buat Admin Awal {currentCompanyName}
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
