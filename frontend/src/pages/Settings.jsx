import { useEffect, useState } from "react";
import { endpoints } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { AlertTriangle, Trash2 } from "lucide-react";

export default function Settings() {
  const [s, setS] = useState({ company_name: "", default_buffer_days: 14, safety_stock_days: 7, currency: "USD" });
  useEffect(() => { endpoints.settings().then(setS).catch(()=>{}); }, []);
  const save = async () => {
    try { await endpoints.saveSettings(s); toast.success("Settings saved"); }
    catch { toast.error("Failed"); }
  };
  const clearAll = async () => {
    if (!window.confirm("Delete all data (items, sales, stock, POs, factories)? This cannot be undone.")) return;
    await endpoints.clearAll();
    toast.success("All data cleared");
  };
  return (
    <div className="space-y-6 max-w-2xl" data-testid="settings-page">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900" style={{fontFamily:'Manrope'}}>Settings</h1>
        <p className="text-sm text-slate-500 mt-1">Company defaults for calculations.</p>
      </div>

      <div className="idss-card p-6 space-y-4">
        <div>
          <Label className="text-xs uppercase tracking-wider text-slate-500">Company Name</Label>
          <Input data-testid="settings-company" value={s.company_name || ""} onChange={(e)=>setS({...s, company_name: e.target.value})} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label className="text-xs uppercase tracking-wider text-slate-500">Default Buffer Days</Label>
            <Input type="number" data-testid="settings-buffer" value={s.default_buffer_days} onChange={(e)=>setS({...s, default_buffer_days: Number(e.target.value)})}/>
          </div>
          <div>
            <Label className="text-xs uppercase tracking-wider text-slate-500">Safety Stock Days</Label>
            <Input type="number" data-testid="settings-safety" value={s.safety_stock_days} onChange={(e)=>setS({...s, safety_stock_days: Number(e.target.value)})}/>
          </div>
          <div>
            <Label className="text-xs uppercase tracking-wider text-slate-500">Currency</Label>
            <Input data-testid="settings-currency" value={s.currency || ""} onChange={(e)=>setS({...s, currency: e.target.value})}/>
          </div>
        </div>
        <Button data-testid="settings-save" onClick={save} className="bg-blue-600 hover:bg-blue-700">Save Settings</Button>
      </div>

      <div className="idss-card p-6 border-red-200">
        <div className="flex items-center gap-2 mb-3">
          <AlertTriangle size={16} className="text-red-600" />
          <h3 className="font-semibold text-red-800" style={{fontFamily:'Manrope'}}>Danger Zone</h3>
        </div>
        <p className="text-sm text-slate-600 mb-3">Remove all uploaded data and start fresh.</p>
        <Button data-testid="clear-all-btn" variant="destructive" onClick={clearAll}><Trash2 size={14} className="mr-1.5"/>Clear All Data</Button>
      </div>
    </div>
  );
}
