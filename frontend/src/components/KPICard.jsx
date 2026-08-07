export default function KPICard({ label, value, sub, tone = "default", testId }) {
  const tones = {
    default: "text-slate-900",
    red: "text-red-600",
    orange: "text-orange-600",
    yellow: "text-amber-600",
    green: "text-green-600",
    blue: "text-blue-600",
  };
  return (
    <div className="idss-card p-4" data-testid={testId}>
      <div className="idss-kpi-label">{label}</div>
      <div className={`idss-kpi-value mt-2 ${tones[tone]}`}>{value}</div>
      {sub && <div className="text-xs text-slate-500 mt-1">{sub}</div>}
    </div>
  );
}
