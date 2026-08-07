import { useEffect, useState } from "react";
import { endpoints, fmt } from "@/lib/api";
import KPICard from "@/components/KPICard";
import AIInsightPanel from "@/components/AIInsightPanel";
import TrafficDot from "@/components/TrafficDot";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell, CartesianGrid } from "recharts";

const COLORS = ["#2563eb", "#f97316", "#16a34a", "#eab308", "#8b5cf6", "#06b6d4", "#ef4444", "#64748b"];

function ChartCard({ title, children, testId }) {
  return (
    <div className="idss-card p-5" data-testid={testId}>
      <h3 className="text-sm font-semibold text-slate-800 mb-3" style={{fontFamily:'Manrope'}}>{title}</h3>
      <div className="h-64">{children}</div>
    </div>
  );
}

function AlertList({ light, items, title }) {
  const bg = {
    red: "bg-red-50 border-red-200",
    orange: "bg-orange-50 border-orange-200",
    yellow: "bg-amber-50 border-amber-200",
    green: "bg-green-50 border-green-200",
  }[light];
  return (
    <div className={`border rounded-lg p-4 ${bg}`} data-testid={`alert-panel-${light}`}>
      <div className="flex items-center gap-2 mb-2">
        <TrafficDot light={light} />
        <h4 className="text-sm font-semibold text-slate-800">{title}</h4>
        <span className="text-xs text-slate-500 ml-auto">{items.length}</span>
      </div>
      <ul className="space-y-1.5 max-h-40 overflow-auto idss-scroll">
        {items.length === 0 && <li className="text-xs text-slate-500 italic">No items</li>}
        {items.map((i, idx) => (
          <li key={idx} className="text-xs text-slate-700 flex justify-between gap-2">
            <span className="font-medium truncate">{i.item_code}</span>
            <span className="text-slate-500 shrink-0">{i.coverage_days != null ? `${i.coverage_days}d` : "-"}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function Dashboard() {
  const [data, setData] = useState(null);
  useEffect(() => {
    endpoints.dashboard().then(setData).catch(() => setData({ kpis: {}, alerts: {red:[],orange:[],yellow:[],green:[]}, charts:{} }));
  }, []);

  if (!data) return <div className="text-slate-500">Loading...</div>;
  const k = data.kpis || {};
  const c = data.charts || {};

  return (
    <div className="space-y-6" data-testid="dashboard-page">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900" style={{fontFamily:'Manrope'}}>Dashboard</h1>
          <p className="text-sm text-slate-500 mt-1">What requires attention today?</p>
        </div>
        <div className="text-xs text-slate-500">Last updated {new Date().toLocaleTimeString()}</div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <KPICard testId="kpi-total-sku" label="Total SKU" value={fmt.num(k.total_sku)} />
        <KPICard testId="kpi-active-sku" label="Active SKU" value={fmt.num(k.active_sku)} tone="blue" />
        <KPICard testId="kpi-inventory-value" label="Inventory Value" value={fmt.money(k.inventory_value)} />
        <KPICard testId="kpi-inventory-qty" label="Inventory Qty" value={fmt.num(k.inventory_qty)} />
        <KPICard testId="kpi-incoming-po" label="Incoming PO" value={fmt.num(k.incoming_po)} tone="blue" />
        <KPICard testId="kpi-stockout" label="Stock Out" value={fmt.num(k.stock_out_sku)} tone="red" />
        <KPICard testId="kpi-critical" label="Critical" value={fmt.num(k.critical_sku)} tone="red" />
        <KPICard testId="kpi-overstock" label="Overstock" value={fmt.num(k.overstock_sku)} tone="yellow" />
        <KPICard testId="kpi-slow-moving" label="Slow Moving" value={fmt.num(k.slow_moving_sku)} tone="yellow" />
        <KPICard testId="kpi-dead-stock" label="Dead Stock" value={fmt.num(k.dead_stock_sku)} tone="red" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4">
          <AlertList light="red" title="Stock Out Risk" items={data.alerts.red} />
          <AlertList light="orange" title="Factory MOQ / PO Late" items={data.alerts.orange} />
          <AlertList light="yellow" title="Slow / Overstock" items={data.alerts.yellow} />
          <AlertList light="green" title="Healthy Inventory" items={data.alerts.green} />
        </div>
        <AIInsightPanel context="dashboard" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard title="Sales Trend (30 days)" testId="chart-sales-trend">
          <ResponsiveContainer>
            <LineChart data={c.sales_trend || []}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(v)=>v?.slice(5)}/>
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip />
              <Line type="monotone" dataKey="value" stroke="#2563eb" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Incoming PO Timeline (next 90 days)" testId="chart-po-timeline">
          <ResponsiveContainer>
            <BarChart data={c.po_timeline || []}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(v)=>v?.slice(5)}/>
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip />
              <Bar dataKey="qty" fill="#f97316" />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Inventory Value by Category" testId="chart-by-category">
          <ResponsiveContainer>
            <PieChart>
              <Pie data={c.by_category || []} dataKey="value" nameKey="name" innerRadius={50} outerRadius={90}>
                {(c.by_category || []).map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Inventory Value by Supplier" testId="chart-by-supplier">
          <ResponsiveContainer>
            <BarChart data={c.by_supplier || []} layout="vertical" margin={{ left: 60 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis type="number" tick={{ fontSize: 10 }} />
              <YAxis dataKey="name" type="category" tick={{ fontSize: 10 }} width={80} />
              <Tooltip />
              <Bar dataKey="value" fill="#2563eb" />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </div>
  );
}
