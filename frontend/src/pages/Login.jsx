import { useEffect, useState } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Receipt } from "@phosphor-icons/react";
import { toast } from "sonner";

export default function Login() {
  const { user, login } = useAuth();
  const nav = useNavigate();
  const [username, setU] = useState("");
  const [password, setP] = useState("");
  const [busy, setBusy] = useState(false);
  const [needsInit, setNeedsInit] = useState(false);

  useEffect(() => {
    api.get("/setup/status").then((r) => setNeedsInit(!r.data.admin_exists)).catch(()=>{});
  }, []);

  if (user) return <Navigate to="/" replace />;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await login(username.trim(), password);
      toast.success("Berhasil masuk");
      nav("/");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Login gagal");
    } finally { setBusy(false); }
  };

  const initAdmin = async () => {
    try {
      const r = await api.post("/setup/init");
      toast.success(`Admin dibuat. Username: ${r.data.username}, Password: ${r.data.password}`);
      setU(r.data.username);
      setP(r.data.password);
      setNeedsInit(false);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Gagal inisialisasi");
    }
  };

  return (
    <div className="min-h-screen grid md:grid-cols-2 lyra-login-bg">
      <div className="hidden md:flex flex-col justify-between p-12 relative overflow-hidden">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-lg bg-gradient-to-br from-sky-500 to-sky-700 grid place-items-center text-white shadow-md">
            <Receipt size={24} weight="fill" />
          </div>
          <div>
            <div className="font-bold text-slate-900 text-lg" style={{fontFamily:'Manrope'}}>eKlaim Lyra</div>
            <div className="text-xs uppercase text-sky-700 tracking-wider">Lyra Akrelux</div>
          </div>
        </div>
        <div>
          <h1 className="text-4xl lg:text-5xl font-bold text-slate-900 leading-tight" style={{fontFamily:'Manrope'}}>
            Klaim & Petty Cash <span className="text-sky-600">tanpa ribet.</span>
          </h1>
          <p className="mt-4 text-slate-600 max-w-md leading-relaxed">
            Ajukan klaim operasional harian, verifikasi & approval terstruktur, dan lacak saldo petty cash secara real-time.
          </p>
          <div className="mt-8 flex gap-6 text-sm text-slate-600">
            <div>
              <div className="text-2xl font-bold text-slate-900 tabular-nums" style={{fontFamily:'Manrope'}}>1-klik</div>
              <div className="text-xs text-slate-500">OCR foto struk</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-slate-900 tabular-nums" style={{fontFamily:'Manrope'}}>Real-time</div>
              <div className="text-xs text-slate-500">Saldo petty cash</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-slate-900 tabular-nums" style={{fontFamily:'Manrope'}}>6 Peran</div>
              <div className="text-xs text-slate-500">Workflow lengkap</div>
            </div>
          </div>
        </div>
        <div className="text-xs text-slate-500">© {new Date().getFullYear()} Lyra Akrelux. Semua hak dilindungi.</div>
      </div>

      <div className="flex items-center justify-center p-6 md:p-12">
        <div className="w-full max-w-md">
          <div className="lyra-card p-8">
            <div className="md:hidden flex items-center gap-2 mb-6">
              <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-sky-500 to-sky-700 grid place-items-center text-white">
                <Receipt size={20} weight="fill" />
              </div>
              <div className="font-bold text-slate-900" style={{fontFamily:'Manrope'}}>eKlaim Lyra</div>
            </div>
            <h2 className="text-2xl font-bold text-slate-900" style={{fontFamily:'Manrope'}}>Masuk ke akun</h2>
            <p className="text-sm text-slate-500 mt-1">Gunakan kredensial dari administrator perusahaan.</p>
            <form onSubmit={submit} className="mt-6 space-y-4">
              <div>
                <Label htmlFor="username" className="text-xs uppercase tracking-wider text-slate-600">Username</Label>
                <Input id="username" data-testid="login-username" value={username} onChange={(e)=>setU(e.target.value)} required autoFocus autoComplete="username" />
              </div>
              <div>
                <Label htmlFor="password" className="text-xs uppercase tracking-wider text-slate-600">Password</Label>
                <Input id="password" data-testid="login-password" type="password" value={password} onChange={(e)=>setP(e.target.value)} required autoComplete="current-password" />
              </div>
              <Button data-testid="login-submit" type="submit" disabled={busy} className="w-full bg-sky-600 hover:bg-sky-700 hover:text-white text-white h-11 font-semibold">
                {busy ? "Memproses..." : "Masuk"}
              </Button>
            </form>
            {needsInit && (
              <div className="mt-6 p-4 rounded-lg bg-amber-50 border border-amber-200">
                <div className="text-sm font-semibold text-amber-900">Belum ada administrator</div>
                <p className="text-xs text-amber-800 mt-1">Klik tombol di bawah untuk membuat akun admin awal (username: <b>admin</b>, password: <b>admin123</b>). Segera ganti password setelah login.</p>
                <Button data-testid="init-admin" onClick={initAdmin} variant="outline" className="mt-3 w-full border-amber-400 text-amber-800 hover:bg-amber-100">
                  Buat Admin Awal
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
