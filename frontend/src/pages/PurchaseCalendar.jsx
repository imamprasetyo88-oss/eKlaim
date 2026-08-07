import { useEffect, useState } from "react";
import { endpoints, fmt } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { CalendarDays, Truck, AlertCircle } from "lucide-react";

export default function PurchaseCalendar() {
  const [events, setEvents] = useState([]);
  useEffect(() => { endpoints.calendar().then(setEvents).catch(() => setEvents([])); }, []);

  const today = new Date().toISOString().slice(0, 10);
  const upcoming = events.filter(e => e.date >= today);
  const late = events.filter(e => e.late);
  const groupedByMonth = upcoming.reduce((acc, ev) => {
    const key = ev.date.slice(0, 7);
    (acc[key] = acc[key] || []).push(ev);
    return acc;
  }, {});

  return (
    <div className="space-y-6" data-testid="calendar-page">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900" style={{fontFamily:'Manrope'}}>Purchase Calendar</h1>
        <p className="text-sm text-slate-500 mt-1">Purchase deadlines, ETAs, shipments and factory schedules.</p>
      </div>

      {late.length > 0 && (
        <div className="idss-card p-4 border-red-200 bg-red-50" data-testid="late-po-panel">
          <div className="flex items-center gap-2 mb-2">
            <AlertCircle size={16} className="text-red-600" />
            <h3 className="text-sm font-semibold text-red-800">Late Purchase Orders ({late.length})</h3>
          </div>
          <div className="space-y-1">
            {late.map((e, i) => (
              <div key={i} className="text-xs text-red-700 flex justify-between">
                <span>{e.po_number} — {e.item_code} ({e.factory})</span>
                <span>ETA {fmt.date(e.date)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {Object.keys(groupedByMonth).length === 0 && (
        <div className="idss-card p-8 text-center text-slate-500">No upcoming events. Upload POs or add scheduled factories.</div>
      )}

      {Object.entries(groupedByMonth).map(([month, list]) => (
        <div key={month} className="idss-card p-5" data-testid={`calendar-month-${month}`}>
          <h3 className="text-sm font-semibold text-slate-800 mb-3" style={{fontFamily:'Manrope'}}>
            {new Date(month + "-01").toLocaleDateString(undefined, { year: "numeric", month: "long" })}
          </h3>
          <div className="space-y-2">
            {list.map((e, i) => (
              <div key={i} className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors" data-testid={`calendar-event-${i}`}>
                <div className={`w-10 h-10 rounded-lg grid place-items-center ${e.type === "deadline" ? "bg-orange-100 text-orange-700" : "bg-blue-100 text-blue-700"}`}>
                  {e.type === "deadline" ? <CalendarDays size={18} /> : <Truck size={18} />}
                </div>
                <div className="flex-1">
                  <div className="font-medium text-slate-900 text-sm">
                    {e.type === "deadline" ? "Purchase Deadline" : `PO ${e.po_number}`}
                    <span className="text-slate-500 ml-2 font-normal">— {e.factory}</span>
                  </div>
                  <div className="text-xs text-slate-500">
                    {e.item_code && <span>{e.item_code} · </span>}
                    {e.qty && <span>Qty {fmt.num(e.qty)} · </span>}
                    {e.tonnage && <span>{e.tonnage}t · </span>}
                    {e.supplier}
                  </div>
                </div>
                <Badge variant="outline" className="text-xs">{fmt.date(e.date)}</Badge>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
