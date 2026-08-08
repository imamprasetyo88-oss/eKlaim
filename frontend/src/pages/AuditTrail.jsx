import { useEffect, useState } from "react";
import { api, fmtDateTime, ROLE_LABEL } from "@/lib/api";

export default function AuditTrail() {
  const [rows, setRows] = useState([]);
  useEffect(() => { api.get("/audit-trail").then(r => setRows(r.data)); }, []);
  return (
    <div className="space-y-6" data-testid="audit-page">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900" style={{fontFamily:'Manrope'}}>Audit Trail</h1>
        <p className="text-sm text-slate-500 mt-1">Rekam jejak setiap aksi di sistem.</p>
      </div>
      <div className="lyra-card p-4">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs uppercase tracking-wider text-slate-500 border-b border-slate-200">
            <th className="p-2">Waktu</th><th className="p-2">Aktor</th><th className="p-2">Aksi</th><th className="p-2">Entitas</th><th className="p-2">Detail</th>
          </tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-slate-500 italic">Belum ada aktivitas.</td></tr>}
            {rows.map(r => (
              <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50" data-testid={`audit-${r.id}`}>
                <td className="p-2 text-xs text-slate-500 tabular-nums">{fmtDateTime(r.timestamp)}</td>
                <td className="p-2"><div className="text-slate-900 font-medium">{r.actor_name}</div><div className="text-xs text-slate-500">{ROLE_LABEL[r.actor_role] || r.actor_role}</div></td>
                <td className="p-2"><code className="text-xs bg-slate-100 px-2 py-0.5 rounded">{r.action}</code></td>
                <td className="p-2 text-slate-700">{r.entity_type}</td>
                <td className="p-2 text-xs text-slate-500 max-w-md truncate">{JSON.stringify(r.meta)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
