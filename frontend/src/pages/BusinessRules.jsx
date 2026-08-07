import { useEffect, useState } from "react";
import { endpoints } from "@/lib/api";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

export default function BusinessRules() {
  const [rules, setRules] = useState([]);
  useEffect(() => { endpoints.rules().then(setRules).catch(()=>{}); }, []);

  const toggle = async (r) => {
    const next = !r.active;
    setRules(rules.map(x => x.id === r.id ? { ...x, active: next } : x));
    try { await endpoints.updateRule(r.id, { active: next }); toast.success(`${r.name} ${next ? "enabled" : "disabled"}`); }
    catch { toast.error("Update failed"); }
  };

  return (
    <div className="space-y-6" data-testid="rules-page">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900" style={{fontFamily:'Manrope'}}>Business Rules</h1>
        <p className="text-sm text-slate-500 mt-1">All logic driving the recommendations. Enable, disable or review.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {rules.map(r => (
          <div key={r.id} className="idss-card p-5" data-testid={`rule-${r.id}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-semibold text-slate-900" style={{fontFamily:'Manrope'}}>{r.name}</h3>
                  {r.editable ? <Badge variant="outline" className="text-[10px]">Editable</Badge> : <Badge variant="secondary" className="text-[10px]">Core</Badge>}
                </div>
                <p className="text-xs text-slate-500 leading-relaxed">{r.formula}</p>
              </div>
              <Switch data-testid={`rule-toggle-${r.id}`} checked={r.active} onCheckedChange={() => toggle(r)} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
