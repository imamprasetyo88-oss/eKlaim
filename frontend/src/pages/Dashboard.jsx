import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, fmtRp, fmtDate } from "@/lib/api";
import { useAuth, can } from "@/lib/auth";
import StatusBadge from "@/components/StatusBadge";
import { Wallet, TrendUp, Receipt, ClockClockwise, Coins, Stamp, CheckCircle, ArrowUp } from "@phosphor-icons/react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, CartesianGrid } from "recharts";

function Kpi({ label, value, sub, icon: Icon, tone = "slate", testId }) {
  const tones = { slate: "text-slate-900", sky: "text-sky-700", green: "text-emerald-600", amber: "text-amber-600", red: "text-red-600" };
  return (
    <div className="lyra-card p-5" data-testid={testId}>
      <div className="flex items-start justify-between">
        <div>
          <div className="kpi-label">{label}</div>
          <div className={`kpi-value mt-2 tabular-nums ${tones[tone]}`}>{value}</div>
          {sub && <div className="text-xs text-slate-500 mt-1">{sub}</div>}
        </div>
        {Icon && <div className="w-10 h-10 rounded-lg bg-sky-50 text-sky-600 grid place-items-center"><Icon size={20} weight="duotone" /></div>}
      </div>
    </div>
  );
}

function ActionCard({ to, count, label, icon: Icon, testId }) {
  return (
    <Link to={to} data-testid={testId} className="lyra-card lyra-card-hover p-5 flex items-center gap-4">
      <div className="w-12 h-12 rounded-lg bg-sky-50 text-sky-600 grid place-items-center shrink-0">
        <Icon size={24} weight="duotone" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-2xl font-bold text-slate-900 tabular-nums" style={{fontFamily:'Manrope'}}>{count}</div>
        <div className="text-xs text-slate-500">{label}</div>
      </div>
      <ArrowUp size={16} className="text-slate-400 rotate-45" />
    </Link>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const [data, setData] = useState(null);

  useEffect(() => { api.get("/dashboard").then(r => setData(r.data)).catch(() => setData({wallet:{},counts:{},kpi:{},trend:[],top_categories:[],recent:[]})); }, []);

  if (!data) return <div className="text-slate-500">Memuat...</div>;
  const w = data.wallet || {};
  const k = data.kpi || {};
  const c = data.counts || {};
  const pct = w.saldo_awal ? Math.round((w.saldo_sekarang / w.saldo_awal) * 100) : 100;

  return (
    <div className="space-y-6" data-testid="dashboard-page">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900" style={{fontFamily:'Manrope'}}>Selamat datang, {user?.name?.split(" ")[0] || user?.username} 👋</h1>
        <p className="text-sm text-slate-500 mt-1">Ringkasan aktivitas eKlaim Lyra hari ini.</p>
      </div>

      {/* North Star KPI */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="md:col-span-2 lyra-card p-6 relative overflow-hidden" data-testid="kpi-petty-cash">
          <div className="absolute inset-0 bg-gradient-to-br from-sky-50 to-transparent opacity-50 pointer-events-none" />
          <div className="relative">
            <div className="flex items-center gap-2">
              <Wallet size={16} className="text-sky-600" weight="duotone" />
              <div className="kpi-label">Saldo Petty Cash</div>
            </div>
            <div className="kpi-value tabular-nums mt-2 text-slate-900" style={{fontSize:'36px'}}>{fmtRp(w.saldo_sekarang)}</div>
            <div className="text-xs text-slate-500 mt-2">dari saldo awal <span className="tabular-nums font-semibold">{fmtRp(w.saldo_awal)}</span></div>
            <div className="mt-3 h-2 bg-slate-100 rounded-full overflow-hidden">
              <div className={`h-full rounded-full ${pct < 30 ? "bg-red-500" : pct < 60 ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
            </div>
            <div className="mt-1 text-xs text-slate-500 tabular-nums">{pct}% dari saldo awal</div>
          </div>
        </div>
        <Kpi testId="kpi-total-claims" label="Total Klaim" value={k.total_claims || 0} icon={Receipt} sub="Semua status" />
        <Kpi testId="kpi-total-paid" label="Total Dibayar" value={fmtRp(k.total_paid)} icon={CheckCircle} tone="green" sub="Klaim selesai" />
      </div>

      {/* Action queue per role */}
      {Object.keys(c).length > 0 && (
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500 mb-3">Menunggu Aksi Anda</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {c.verifikasi != null && <ActionCard testId="action-verifikasi" to="/verifikasi" count={c.verifikasi} label="Klaim perlu diverifikasi" icon={CheckCircle} />}
            {c.approval != null && <ActionCard testId="action-approval" to="/approval" count={c.approval} label="Klaim perlu di-approve" icon={Stamp} />}
            {c.pembayaran != null && <ActionCard testId="action-pembayaran" to="/pembayaran" count={c.pembayaran} label="Klaim siap dibayar" icon={Coins} />}
            {c.topup != null && <ActionCard testId="action-topup" to="/top-up" count={c.topup} label="Top-up menunggu Anda" icon={ClockClockwise} />}
            {c.perlu_koreksi != null && <ActionCard testId="action-koreksi" to="/klaim" count={c.perlu_koreksi} label="Klaim perlu dikoreksi" icon={ClockClockwise} />}
            {c.diproses != null && <ActionCard testId="action-diproses" to="/klaim" count={c.diproses} label="Klaim sedang diproses" icon={ClockClockwise} />}
            {c.selesai != null && <ActionCard testId="action-selesai" to="/klaim" count={c.selesai} label="Klaim selesai" icon={CheckCircle} />}
          </div>
        </div>
      )}

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 lyra-card p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-slate-800" style={{fontFamily:'Manrope'}}>Tren Pengeluaran (30 hari)</h3>
            <TrendUp size={16} className="text-sky-600" weight="duotone" />
          </div>
          <div className="h-64">
            <ResponsiveContainer>
              <LineChart data={data.trend} margin={{ left: 5, right: 15, top: 5, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(v)=>v?.slice(5)} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={(v)=>`${(v/1000).toFixed(0)}rb`} />
                <Tooltip formatter={(v)=>fmtRp(v)} labelFormatter={(v)=>fmtDate(v)} />
                <Line type="monotone" dataKey="value" stroke="#0284c7" strokeWidth={2.5} dot={{r:2}} activeDot={{r:5}} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="lyra-card p-5">
          <h3 className="text-sm font-semibold text-slate-800 mb-3" style={{fontFamily:'Manrope'}}>Top Kategori (60 hari)</h3>
          <div className="h-64">
            <ResponsiveContainer>
              <BarChart data={data.top_categories} layout="vertical" margin={{ left: 50 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v)=>`${(v/1000).toFixed(0)}rb`} />
                <YAxis dataKey="name" type="category" tick={{ fontSize: 10 }} width={80} />
                <Tooltip formatter={(v)=>fmtRp(v)} />
                <Bar dataKey="value" fill="#0ea5e9" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Recent */}
      <div className="lyra-card p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-slate-800" style={{fontFamily:'Manrope'}}>Klaim Terbaru</h3>
          <Link to="/klaim" className="text-xs text-sky-700 hover:underline">Lihat semua →</Link>
        </div>
        <div className="overflow-x-auto lyra-scroll">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs uppercase tracking-wider text-slate-500 border-b border-slate-200">
              <th className="p-2">Kode</th><th className="p-2">User</th><th className="p-2">Kategori</th>
              <th className="p-2 text-right">Jumlah</th><th className="p-2">Tanggal</th><th className="p-2">Status</th>
            </tr></thead>
            <tbody>
              {(data.recent || []).length === 0 && <tr><td colSpan={6} className="p-6 text-center text-slate-500 italic">Belum ada klaim.</td></tr>}
              {(data.recent || []).map(c => (
                <tr key={c.id} className="border-b border-slate-100 hover:bg-slate-50" data-testid={`recent-${c.code}`}>
                  <td className="p-2 font-medium text-slate-900"><Link to={`/klaim/${c.id}`} className="hover:text-sky-700">{c.code}</Link></td>
                  <td className="p-2 text-slate-700">{c.user_name}</td>
                  <td className="p-2 text-slate-700">{c.category_name}</td>
                  <td className="p-2 text-right tabular-nums font-medium">{fmtRp(c.jumlah)}</td>
                  <td className="p-2 text-slate-600 tabular-nums">{fmtDate(c.tanggal)}</td>
                  <td className="p-2"><StatusBadge status={c.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
