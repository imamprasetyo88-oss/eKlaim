import { useEffect, useState } from "react";
import { endpoints, fmt } from "@/lib/api";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Trash2, Plus } from "lucide-react";
import { toast } from "sonner";

function AddItemDialog({ onSaved }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ item_code: "", description: "", category: "", supplier: "", factory: "", lead_time: 30, safety_stock_days: 7, default_buffer_days: 14, boxes_per_pallet: 1, moq_per_pallet: 0, purchase_by_pallet: false });
  const save = async () => {
    try {
      await endpoints.createItem(f);
      toast.success("Item saved");
      setOpen(false); onSaved();
    } catch (e) { toast.error("Failed"); }
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="bg-blue-600 hover:bg-blue-700" data-testid="add-item-btn"><Plus size={14} className="mr-1"/>Add Item</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>New Master Item</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          {["item_code","description","category","supplier","factory"].map(k => (
            <div key={k}>
              <Label className="text-xs">{k.replace("_"," ")}</Label>
              <Input data-testid={`new-item-${k}`} value={f[k]} onChange={(e)=>setF({...f,[k]:e.target.value})} />
            </div>
          ))}
          {["lead_time","safety_stock_days","default_buffer_days","boxes_per_pallet","moq_per_pallet"].map(k => (
            <div key={k}>
              <Label className="text-xs">{k.replace(/_/g," ")}</Label>
              <Input type="number" value={f[k]} onChange={(e)=>setF({...f,[k]:Number(e.target.value)})} />
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button data-testid="save-item-btn" onClick={save} className="bg-blue-600 hover:bg-blue-700">Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AddFactoryDialog({ onSaved }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ factory_name: "", supplier: "", minimum_order_ton: 0, maximum_order_ton: 0, standard_lead_time: 30, purchase_type: "Dynamic", purchase_schedule_day: 25 });
  const save = async () => { await endpoints.createFactory(f); toast.success("Factory saved"); setOpen(false); onSaved(); };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm" className="bg-blue-600 hover:bg-blue-700" data-testid="add-factory-btn"><Plus size={14} className="mr-1"/>Add Factory</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>New Factory</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div><Label className="text-xs">Factory Name</Label><Input value={f.factory_name} onChange={(e)=>setF({...f,factory_name:e.target.value})} /></div>
          <div><Label className="text-xs">Supplier</Label><Input value={f.supplier} onChange={(e)=>setF({...f,supplier:e.target.value})}/></div>
          <div><Label className="text-xs">Min Order (t)</Label><Input type="number" value={f.minimum_order_ton} onChange={(e)=>setF({...f,minimum_order_ton:Number(e.target.value)})}/></div>
          <div><Label className="text-xs">Max Order (t)</Label><Input type="number" value={f.maximum_order_ton} onChange={(e)=>setF({...f,maximum_order_ton:Number(e.target.value)})}/></div>
          <div><Label className="text-xs">Lead Time</Label><Input type="number" value={f.standard_lead_time} onChange={(e)=>setF({...f,standard_lead_time:Number(e.target.value)})}/></div>
          <div><Label className="text-xs">Purchase Day</Label><Input type="number" value={f.purchase_schedule_day} onChange={(e)=>setF({...f,purchase_schedule_day:Number(e.target.value)})}/></div>
          <div className="col-span-2">
            <Label className="text-xs">Purchase Type</Label>
            <select className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm" value={f.purchase_type} onChange={(e)=>setF({...f,purchase_type:e.target.value})}>
              <option>Scheduled</option><option>Dynamic</option>
            </select>
          </div>
        </div>
        <DialogFooter><Button data-testid="save-factory-btn" onClick={save} className="bg-blue-600 hover:bg-blue-700">Save</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AddCampaignDialog({ onSaved }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ name: "", start_date: "", end_date: "", item_code: "", expected_sales_increase_pct: 0 });
  const save = async () => { await endpoints.createCampaign(f); toast.success("Campaign added"); setOpen(false); onSaved(); };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm" className="bg-orange-500 hover:bg-orange-600" data-testid="add-campaign-btn"><Plus size={14} className="mr-1"/>Add Campaign</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>New Campaign</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2"><Label className="text-xs">Name</Label><Input value={f.name} onChange={(e)=>setF({...f,name:e.target.value})}/></div>
          <div><Label className="text-xs">Start</Label><Input type="date" value={f.start_date} onChange={(e)=>setF({...f,start_date:e.target.value})}/></div>
          <div><Label className="text-xs">End</Label><Input type="date" value={f.end_date} onChange={(e)=>setF({...f,end_date:e.target.value})}/></div>
          <div><Label className="text-xs">Item Code (opt)</Label><Input value={f.item_code} onChange={(e)=>setF({...f,item_code:e.target.value})}/></div>
          <div><Label className="text-xs">Sales Increase %</Label><Input type="number" value={f.expected_sales_increase_pct} onChange={(e)=>setF({...f,expected_sales_increase_pct:Number(e.target.value)})}/></div>
        </div>
        <DialogFooter><Button data-testid="save-campaign-btn" onClick={save} className="bg-orange-500 hover:bg-orange-600">Save</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function MasterData() {
  const [items, setItems] = useState([]);
  const [factories, setFactories] = useState([]);
  const [campaigns, setCampaigns] = useState([]);

  const reload = () => {
    endpoints.items().then(setItems).catch(()=>{});
    endpoints.factories().then(setFactories).catch(()=>{});
    endpoints.campaigns().then(setCampaigns).catch(()=>{});
  };
  useEffect(reload, []);

  return (
    <div className="space-y-6" data-testid="master-data-page">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900" style={{fontFamily:'Manrope'}}>Master Data</h1>
        <p className="text-sm text-slate-500 mt-1">Manage items, factories and campaigns.</p>
      </div>

      <Tabs defaultValue="items">
        <TabsList data-testid="master-tabs">
          <TabsTrigger value="items" data-testid="tab-items">Items ({items.length})</TabsTrigger>
          <TabsTrigger value="factories" data-testid="tab-factories">Factories ({factories.length})</TabsTrigger>
          <TabsTrigger value="campaigns" data-testid="tab-campaigns">Campaigns ({campaigns.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="items" className="mt-4">
          <div className="idss-card p-4">
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-sm font-semibold text-slate-800">Master Items</h3>
              <AddItemDialog onSaved={reload} />
            </div>
            <div className="overflow-x-auto idss-scroll">
              <table className="w-full text-sm">
                <thead><tr className="text-left text-xs uppercase text-slate-500 border-b border-slate-200">
                  <th className="p-2">Code</th><th className="p-2">Description</th><th className="p-2">Category</th>
                  <th className="p-2">Supplier</th><th className="p-2">Factory</th>
                  <th className="p-2 text-right">Lead</th><th className="p-2 text-right">Safety</th><th className="p-2 text-right">Buffer</th>
                  <th className="p-2 text-right">MOQ</th><th className="p-2"></th>
                </tr></thead>
                <tbody>
                  {items.length===0 && <tr><td colSpan={10} className="p-6 text-center text-slate-500">No items yet.</td></tr>}
                  {items.map(i=>(
                    <tr key={i.item_code} className="idss-table-row border-b border-slate-100">
                      <td className="p-2 font-medium">{i.item_code}</td>
                      <td className="p-2 text-slate-600 truncate max-w-[200px]">{i.description}</td>
                      <td className="p-2 text-slate-600">{i.category}</td>
                      <td className="p-2 text-slate-600">{i.supplier}</td>
                      <td className="p-2 text-slate-600">{i.factory}</td>
                      <td className="p-2 text-right">{i.lead_time}d</td>
                      <td className="p-2 text-right">{i.safety_stock_days}d</td>
                      <td className="p-2 text-right">{i.default_buffer_days}d</td>
                      <td className="p-2 text-right">{i.moq_per_pallet||"-"}</td>
                      <td className="p-2">
                        <button data-testid={`delete-item-${i.item_code}`} onClick={async()=>{ await endpoints.deleteItem(i.item_code); reload(); }} className="text-slate-400 hover:text-red-600"><Trash2 size={14}/></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="factories" className="mt-4">
          <div className="idss-card p-4">
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-sm font-semibold text-slate-800">Factories</h3>
              <AddFactoryDialog onSaved={reload} />
            </div>
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs uppercase text-slate-500 border-b border-slate-200">
                <th className="p-2">Name</th><th className="p-2">Supplier</th><th className="p-2 text-right">Min Ton</th>
                <th className="p-2 text-right">Max Ton</th><th className="p-2 text-right">Lead</th>
                <th className="p-2">Type</th><th className="p-2 text-right">Day</th><th className="p-2"></th>
              </tr></thead>
              <tbody>
                {factories.length===0 && <tr><td colSpan={8} className="p-6 text-center text-slate-500">No factories yet.</td></tr>}
                {factories.map(f=>(
                  <tr key={f.factory_name} className="idss-table-row border-b border-slate-100">
                    <td className="p-2 font-medium">{f.factory_name}</td>
                    <td className="p-2 text-slate-600">{f.supplier}</td>
                    <td className="p-2 text-right">{fmt.dec(f.minimum_order_ton,1)}</td>
                    <td className="p-2 text-right">{fmt.dec(f.maximum_order_ton,1)}</td>
                    <td className="p-2 text-right">{f.standard_lead_time}d</td>
                    <td className="p-2">{f.purchase_type}</td>
                    <td className="p-2 text-right">{f.purchase_schedule_day||"-"}</td>
                    <td className="p-2">
                      <button data-testid={`delete-factory-${f.factory_name}`} onClick={async()=>{ await endpoints.deleteFactory(f.factory_name); reload(); }} className="text-slate-400 hover:text-red-600"><Trash2 size={14}/></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="campaigns" className="mt-4">
          <div className="idss-card p-4">
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-sm font-semibold text-slate-800">Campaigns</h3>
              <AddCampaignDialog onSaved={reload} />
            </div>
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs uppercase text-slate-500 border-b border-slate-200">
                <th className="p-2">Name</th><th className="p-2">Start</th><th className="p-2">End</th>
                <th className="p-2">Item</th><th className="p-2 text-right">Increase %</th><th className="p-2"></th>
              </tr></thead>
              <tbody>
                {campaigns.length===0 && <tr><td colSpan={6} className="p-6 text-center text-slate-500">No campaigns yet.</td></tr>}
                {campaigns.map(c=>(
                  <tr key={c.id} className="idss-table-row border-b border-slate-100">
                    <td className="p-2 font-medium">{c.name}</td>
                    <td className="p-2 text-slate-600">{fmt.date(c.start_date)}</td>
                    <td className="p-2 text-slate-600">{fmt.date(c.end_date)}</td>
                    <td className="p-2 text-slate-600">{c.item_code || "All"}</td>
                    <td className="p-2 text-right text-orange-600 font-medium">+{c.expected_sales_increase_pct}%</td>
                    <td className="p-2">
                      <button data-testid={`delete-campaign-${c.id}`} onClick={async()=>{ await endpoints.deleteCampaign(c.id); reload(); }} className="text-slate-400 hover:text-red-600"><Trash2 size={14}/></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
