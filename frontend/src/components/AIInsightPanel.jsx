import { useEffect, useState } from "react";
import { Sparkles, RefreshCw } from "lucide-react";
import { endpoints } from "@/lib/api";

export default function AIInsightPanel({ context = "dashboard" }) {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);

  const load = async () => {
    setLoading(true);
    try {
      const r = await endpoints.ai(context, {});
      setItems(r.insights || []);
    } catch (e) {
      setItems(["AI insights unavailable right now."]);
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [context]);

  return (
    <div className="idss-ai-panel p-5" data-testid="ai-insight-panel">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Sparkles size={16} className="text-blue-600" />
          <h3 className="text-sm font-semibold text-slate-900" style={{fontFamily:'Manrope'}}>AI Insight</h3>
          <span className="text-[10px] uppercase tracking-wider text-blue-700 bg-blue-100 px-2 py-0.5 rounded">GPT 5.6 Terra</span>
        </div>
        <button
          data-testid="ai-refresh-btn"
          onClick={load}
          className="text-slate-500 hover:text-blue-600 transition-colors"
          aria-label="refresh"
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
        </button>
      </div>
      {loading ? (
        <div className="space-y-2">
          {[1,2,3].map(i => <div key={i} className="h-3 bg-slate-100 animate-pulse rounded" />)}
        </div>
      ) : (
        <ul className="space-y-2">
          {items.map((line, i) => (
            <li key={i} data-testid={`ai-insight-${i}`} className="text-sm text-slate-700 flex gap-2">
              <span className="text-blue-600 font-bold">•</span>
              <span>{line}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
