"""IDSS - Inventory Decision Support System backend."""
from fastapi import FastAPI, APIRouter, UploadFile, File, HTTPException, Query
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone, timedelta
from pathlib import Path
import os
import io
import uuid
import logging
import math
from openpyxl import load_workbook, Workbook
from openpyxl.styles import Font, PatternFill, Alignment
from fastapi.responses import StreamingResponse
from emergentintegrations.llm.chat import LlmChat, UserMessage

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

app = FastAPI(title="IDSS API")
api = APIRouter(prefix="/api")

logger = logging.getLogger("idss")
logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')

# -------------------- MODELS --------------------
class Item(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    item_code: str
    description: str = ""
    brand: str = ""
    category: str = ""
    supplier: str = ""
    factory: str = ""
    warehouse: str = ""
    unit: str = "PCS"
    weight_per_box: float = 0
    boxes_per_pallet: int = 1
    purchase_by_pallet: bool = False
    lead_time: int = 30
    safety_stock_days: int = 7
    default_buffer_days: int = 14
    moq_per_pallet: int = 0
    inventory_value: float = 0
    status: str = "Active"

class Factory(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    factory_name: str
    supplier: str = ""
    minimum_order_ton: float = 0
    maximum_order_ton: float = 0
    standard_lead_time: int = 30
    purchase_type: str = "Dynamic"  # Scheduled / Dynamic
    purchase_schedule_day: int = 25

class Campaign(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    start_date: str
    end_date: str
    item_code: str = ""
    expected_sales_increase_pct: float = 0

class AIRequest(BaseModel):
    context: str = "dashboard"
    payload: Dict[str, Any] = {}

def _iso(dt: datetime) -> str:
    return dt.isoformat()

def _now():
    return datetime.now(timezone.utc)

# -------------------- EXCEL PARSING --------------------
COLUMN_MAPS = {
    "master-item": {
        "item_code": ["item code", "itemcode", "sku", "code"],
        "description": ["description", "desc", "name"],
        "brand": ["brand"],
        "category": ["category"],
        "supplier": ["supplier"],
        "factory": ["factory"],
        "warehouse": ["warehouse"],
        "unit": ["unit", "uom"],
        "weight_per_box": ["weight per box", "weight/box", "weight"],
        "boxes_per_pallet": ["boxes per pallet", "box/pallet"],
        "purchase_by_pallet": ["purchase by pallet", "by pallet"],
        "lead_time": ["lead time", "leadtime"],
        "safety_stock_days": ["safety stock days", "safety stock"],
        "default_buffer_days": ["default buffer days", "buffer days"],
        "moq_per_pallet": ["moq per pallet", "moq pallet", "moq"],
        "inventory_value": ["inventory value", "value"],
        "status": ["status"],
    },
    "sales-history": {
        "date": ["date", "sales date"],
        "item_code": ["item code", "itemcode", "sku"],
        "customer": ["customer"],
        "sales_qty": ["sales qty", "qty", "quantity"],
        "sales_value": ["sales value", "value", "amount"],
        "warehouse": ["warehouse"],
        "channel": ["channel"],
    },
    "stock-balance": {
        "warehouse": ["warehouse"],
        "item_code": ["item code", "itemcode", "sku"],
        "available_qty": ["available qty", "available"],
        "reserved_qty": ["reserved qty", "reserved"],
        "blocked_qty": ["blocked qty", "blocked"],
        "total_qty": ["total qty", "total"],
        "inventory_value": ["inventory value", "value"],
    },
    "po-outstanding": {
        "po_number": ["po number", "po no", "po"],
        "supplier": ["supplier"],
        "factory": ["factory"],
        "item_code": ["item code", "itemcode", "sku"],
        "qty": ["qty", "quantity"],
        "eta": ["eta", "arrival date"],
        "status": ["status"],
        "weight": ["weight"],
        "tonnage": ["tonnage", "ton"],
    },
}

COLLECTION_MAP = {
    "master-item": "items",
    "sales-history": "sales",
    "stock-balance": "stock",
    "po-outstanding": "po",
}

def _map_header(header_row, kind):
    m = COLUMN_MAPS[kind]
    result = {}
    lowered = [str(h).strip().lower() if h else "" for h in header_row]
    for field, aliases in m.items():
        for idx, h in enumerate(lowered):
            if h in aliases or any(a in h for a in aliases):
                result[field] = idx
                break
    return result

def _cell(row, idx, default=""):
    if idx is None or idx >= len(row):
        return default
    v = row[idx]
    return default if v is None else v

def _num(v, default=0):
    try:
        if v is None or v == "":
            return default
        return float(v)
    except (ValueError, TypeError):
        return default

def _int(v, default=0):
    return int(_num(v, default))

def _bool(v):
    s = str(v).strip().lower()
    return s in ("true", "1", "yes", "y", "t")

def _date_str(v):
    if isinstance(v, datetime):
        return v.date().isoformat()
    if v is None:
        return ""
    return str(v)

def parse_excel(content: bytes, kind: str):
    wb = load_workbook(io.BytesIO(content), data_only=True)
    ws = wb.active
    rows = list(ws.iter_rows(values_only=True))
    if not rows:
        return [], ["Empty file"]
    header = rows[0]
    idx = _map_header(header, kind)
    if not idx:
        return [], ["No matching columns found in header"]
    records, errors = [], []
    for i, row in enumerate(rows[1:], start=2):
        if all(c is None or c == "" for c in row):
            continue
        try:
            if kind == "master-item":
                rec = {
                    "id": str(uuid.uuid4()),
                    "item_code": str(_cell(row, idx.get("item_code"))).strip(),
                    "description": str(_cell(row, idx.get("description"))),
                    "brand": str(_cell(row, idx.get("brand"))),
                    "category": str(_cell(row, idx.get("category"))),
                    "supplier": str(_cell(row, idx.get("supplier"))),
                    "factory": str(_cell(row, idx.get("factory"))),
                    "warehouse": str(_cell(row, idx.get("warehouse"))),
                    "unit": str(_cell(row, idx.get("unit"), "PCS")),
                    "weight_per_box": _num(_cell(row, idx.get("weight_per_box"))),
                    "boxes_per_pallet": _int(_cell(row, idx.get("boxes_per_pallet"), 1)),
                    "purchase_by_pallet": _bool(_cell(row, idx.get("purchase_by_pallet"))),
                    "lead_time": _int(_cell(row, idx.get("lead_time"), 30)),
                    "safety_stock_days": _int(_cell(row, idx.get("safety_stock_days"), 7)),
                    "default_buffer_days": _int(_cell(row, idx.get("default_buffer_days"), 14)),
                    "moq_per_pallet": _int(_cell(row, idx.get("moq_per_pallet"))),
                    "inventory_value": _num(_cell(row, idx.get("inventory_value"))),
                    "status": str(_cell(row, idx.get("status"), "Active")),
                }
                if not rec["item_code"]:
                    errors.append(f"Row {i}: missing item_code")
                    continue
            elif kind == "sales-history":
                rec = {
                    "id": str(uuid.uuid4()),
                    "date": _date_str(_cell(row, idx.get("date"))),
                    "item_code": str(_cell(row, idx.get("item_code"))).strip(),
                    "customer": str(_cell(row, idx.get("customer"))),
                    "sales_qty": _num(_cell(row, idx.get("sales_qty"))),
                    "sales_value": _num(_cell(row, idx.get("sales_value"))),
                    "warehouse": str(_cell(row, idx.get("warehouse"))),
                    "channel": str(_cell(row, idx.get("channel"))),
                }
            elif kind == "stock-balance":
                rec = {
                    "id": str(uuid.uuid4()),
                    "warehouse": str(_cell(row, idx.get("warehouse"))),
                    "item_code": str(_cell(row, idx.get("item_code"))).strip(),
                    "available_qty": _num(_cell(row, idx.get("available_qty"))),
                    "reserved_qty": _num(_cell(row, idx.get("reserved_qty"))),
                    "blocked_qty": _num(_cell(row, idx.get("blocked_qty"))),
                    "total_qty": _num(_cell(row, idx.get("total_qty"))),
                    "inventory_value": _num(_cell(row, idx.get("inventory_value"))),
                }
            else:  # po-outstanding
                rec = {
                    "id": str(uuid.uuid4()),
                    "po_number": str(_cell(row, idx.get("po_number"))).strip(),
                    "supplier": str(_cell(row, idx.get("supplier"))),
                    "factory": str(_cell(row, idx.get("factory"))),
                    "item_code": str(_cell(row, idx.get("item_code"))).strip(),
                    "qty": _num(_cell(row, idx.get("qty"))),
                    "eta": _date_str(_cell(row, idx.get("eta"))),
                    "status": str(_cell(row, idx.get("status"), "Open")),
                    "weight": _num(_cell(row, idx.get("weight"))),
                    "tonnage": _num(_cell(row, idx.get("tonnage"))),
                }
            records.append(rec)
        except (ValueError, TypeError, KeyError) as e:
            errors.append(f"Row {i}: {e}")
    return records, errors

# -------------------- EXCEL TEMPLATES --------------------
TEMPLATE_DEFS = {
    "master-item": {
        "sheet": "Master Item",
        "columns": [
            ("Item Code", "HVS-A4-70", "Unique SKU code (required)"),
            ("Description", "HVS Paper A4 70gsm", "Product name / description"),
            ("Brand", "PaperCo", "Brand name"),
            ("Category", "Office Paper", "Category / product family"),
            ("Supplier", "Asia Pulp & Paper", "Supplier name (should match Factory Master)"),
            ("Factory", "APP", "Factory name (must match Master Factory)"),
            ("Warehouse", "JKT-01", "Default warehouse code"),
            ("Unit", "BOX", "Unit of measure (BOX/PCS/RIM)"),
            ("Weight Per Box", 12.5, "Weight per box in kg"),
            ("Boxes Per Pallet", 40, "How many boxes fit in 1 pallet"),
            ("Purchase By Pallet", "TRUE", "TRUE if must order in full pallets"),
            ("Lead Time", 45, "Standard lead time in days"),
            ("Safety Stock Days", 7, "Safety stock target in days"),
            ("Default Buffer Days", 21, "Buffer stock target in days"),
            ("MOQ Per Pallet", 40, "SKU-level MOQ in boxes"),
            ("Inventory Value", 850000, "Current inventory value"),
            ("Status", "Active", "Active / Inactive"),
        ],
    },
    "sales-history": {
        "sheet": "Sales History",
        "columns": [
            ("Date", "2026-01-15", "Sales date (YYYY-MM-DD)"),
            ("Item Code", "HVS-A4-70", "Must match Master Item code"),
            ("Customer", "PT Contoh Jaya", "Customer name or code"),
            ("Sales Qty", 20, "Quantity sold (in Unit)"),
            ("Sales Value", 4000000, "Sales value in currency"),
            ("Warehouse", "JKT-01", "Warehouse code"),
            ("Channel", "Wholesale", "Retail / Wholesale / Online"),
        ],
    },
    "stock-balance": {
        "sheet": "Stock Balance",
        "columns": [
            ("Warehouse", "JKT-01", "Warehouse code"),
            ("Item Code", "HVS-A4-70", "Must match Master Item code"),
            ("Available Qty", 500, "Available (ready-to-sell)"),
            ("Reserved Qty", 50, "Reserved for orders"),
            ("Blocked Qty", 0, "Blocked / QC hold"),
            ("Total Qty", 550, "Sum of Available + Reserved + Blocked"),
            ("Inventory Value", 850000, "Total inventory value at this warehouse"),
        ],
    },
    "po-outstanding": {
        "sheet": "PO Outstanding",
        "columns": [
            ("PO Number", "PO-2401", "Purchase order number"),
            ("Supplier", "Asia Pulp & Paper", "Supplier name"),
            ("Factory", "APP", "Factory name"),
            ("Item Code", "HVS-A4-70", "Must match Master Item code"),
            ("Qty", 400, "PO quantity"),
            ("ETA", "2026-02-15", "Estimated Time of Arrival (YYYY-MM-DD)"),
            ("Status", "Open", "Open / In Transit / Received / Closed"),
            ("Weight", 5000, "Total weight (kg)"),
            ("Tonnage", 5, "Total tonnage (ton)"),
        ],
    },
}

def _build_template_xlsx(kind: str) -> bytes:
    tpl = TEMPLATE_DEFS[kind]
    wb = Workbook()
    ws = wb.active
    ws.title = tpl["sheet"]

    header_fill = PatternFill(start_color="2563EB", end_color="2563EB", fill_type="solid")
    header_font = Font(color="FFFFFF", bold=True)
    note_fill = PatternFill(start_color="EFF6FF", end_color="EFF6FF", fill_type="solid")
    note_font = Font(color="475569", italic=True, size=10)

    # Row 1: headers
    for i, (name, _sample, _note) in enumerate(tpl["columns"], start=1):
        c = ws.cell(row=1, column=i, value=name)
        c.fill = header_fill
        c.font = header_font
        c.alignment = Alignment(horizontal="left", vertical="center")

    # Row 2: notes (grey italic)
    for i, (_name, _sample, note) in enumerate(tpl["columns"], start=1):
        c = ws.cell(row=2, column=i, value=f"↑ {note}")
        c.fill = note_fill
        c.font = note_font
        c.alignment = Alignment(wrap_text=True, vertical="top")

    # Row 3: sample values
    for i, (_name, sample, _note) in enumerate(tpl["columns"], start=1):
        ws.cell(row=3, column=i, value=sample)

    # Auto width
    for i, (name, sample, _note) in enumerate(tpl["columns"], start=1):
        width = max(len(str(name)), len(str(sample))) + 4
        ws.column_dimensions[chr(64 + i) if i <= 26 else "A"].width = min(width, 32)
    ws.row_dimensions[2].height = 42
    ws.freeze_panes = "A4"

    # Instructions sheet
    info = wb.create_sheet("README")
    info["A1"] = f"IDSS Template — {tpl['sheet']}"
    info["A1"].font = Font(bold=True, size=14, color="1D4ED8")
    info["A3"] = "Instructions:"
    info["A3"].font = Font(bold=True)
    tips = [
        "1. Row 1 contains column headers — DO NOT rename or delete.",
        "2. Row 2 contains guidance notes — you may delete this row before uploading.",
        "3. Row 3 is a sample record — replace it with your real data.",
        "4. Save as .xlsx and upload via the Data Upload page in IDSS.",
        "5. Item Code must match across Master Item, Stock, Sales, and PO files.",
        "6. Dates use YYYY-MM-DD format (Excel date cells also accepted).",
        "7. Duplicate uploads (same file content) are automatically rejected.",
    ]
    for i, t in enumerate(tips, start=4):
        info[f"A{i}"] = t
    info.column_dimensions["A"].width = 80

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return buf.read()

@api.get("/templates/{kind}")
async def download_template(kind: str):
    if kind not in TEMPLATE_DEFS:
        raise HTTPException(404, f"Unknown template. Available: {list(TEMPLATE_DEFS.keys())}")
    data = _build_template_xlsx(kind)
    filename = f"IDSS_Template_{kind.replace('-', '_')}.xlsx"
    return StreamingResponse(
        io.BytesIO(data),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )

# -------------------- UPLOAD ENDPOINTS --------------------
VALID_TYPES = list(COLUMN_MAPS.keys())

@api.post("/upload/{kind}")
async def upload_file(kind: str, file: UploadFile = File(...)):
    if kind not in VALID_TYPES:
        raise HTTPException(400, f"Invalid type. Use: {VALID_TYPES}")
    content = await file.read()
    # Check duplicate
    import hashlib
    checksum = hashlib.md5(content).hexdigest()
    existing = await db.upload_history.find_one({"checksum": checksum})
    if existing:
        raise HTTPException(409, "Duplicate file already uploaded")
    records, errors = parse_excel(content, kind)
    collection = COLLECTION_MAP[kind]
    if records:
        # For master-item, upsert by item_code; others append (replace all for stock)
        if kind == "master-item":
            for r in records:
                await db.items.update_one(
                    {"item_code": r["item_code"]},
                    {"$set": r},
                    upsert=True,
                )
        elif kind == "stock-balance":
            # Replace stock: latest snapshot only
            await db.stock.delete_many({})
            await db.stock.insert_many(records)
        else:
            await db[collection].insert_many(records)
    history = {
        "id": str(uuid.uuid4()),
        "kind": kind,
        "filename": file.filename,
        "checksum": checksum,
        "uploaded_at": _iso(_now()),
        "total_rows": len(records),
        "errors": errors[:20],
        "error_count": len(errors),
        "status": "success" if not errors else "partial",
    }
    await db.upload_history.insert_one(history)
    history.pop("_id", None)
    return history

@api.get("/upload/history")
async def upload_history():
    docs = await db.upload_history.find({}, {"_id": 0}).sort("uploaded_at", -1).to_list(200)
    return docs

# -------------------- MASTER DATA --------------------
@api.get("/items")
async def list_items(
    search: str = "",
    category: str = "",
    supplier: str = "",
    factory: str = "",
    brand: str = "",
    warehouse: str = "",
    limit: int = 500,
):
    q = {}
    if search:
        q["$or"] = [
            {"item_code": {"$regex": search, "$options": "i"}},
            {"description": {"$regex": search, "$options": "i"}},
        ]
    for k, v in (("category", category), ("supplier", supplier), ("factory", factory), ("brand", brand), ("warehouse", warehouse)):
        if v:
            q[k] = v
    docs = await db.items.find(q, {"_id": 0}).limit(limit).to_list(limit)
    return docs

@api.post("/items")
async def create_item(item: Item):
    d = item.model_dump()
    await db.items.update_one({"item_code": d["item_code"]}, {"$set": d}, upsert=True)
    return d

@api.delete("/items/{item_code}")
async def delete_item(item_code: str):
    await db.items.delete_one({"item_code": item_code})
    return {"ok": True}

@api.get("/factories")
async def list_factories():
    return await db.factories.find({}, {"_id": 0}).to_list(500)

@api.post("/factories")
async def create_factory(f: Factory):
    d = f.model_dump()
    await db.factories.update_one({"factory_name": d["factory_name"]}, {"$set": d}, upsert=True)
    return d

@api.delete("/factories/{name}")
async def delete_factory(name: str):
    await db.factories.delete_one({"factory_name": name})
    return {"ok": True}

@api.get("/campaigns")
async def list_campaigns():
    return await db.campaigns.find({}, {"_id": 0}).to_list(500)

@api.post("/campaigns")
async def create_campaign(c: Campaign):
    d = c.model_dump()
    await db.campaigns.insert_one(d)
    d.pop("_id", None)
    return d

@api.delete("/campaigns/{cid}")
async def delete_campaign(cid: str):
    await db.campaigns.delete_one({"id": cid})
    return {"ok": True}

@api.get("/po")
async def list_po():
    return await db.po.find({}, {"_id": 0}).sort("eta", 1).to_list(1000)

@api.get("/stock")
async def list_stock():
    return await db.stock.find({}, {"_id": 0}).to_list(2000)

@api.get("/sales")
async def list_sales(limit: int = 500):
    return await db.sales.find({}, {"_id": 0}).sort("date", -1).limit(limit).to_list(limit)

# -------------------- INVENTORY ANALYTICS --------------------
async def _load_all():
    items = await db.items.find({}, {"_id": 0}).to_list(5000)
    stock = await db.stock.find({}, {"_id": 0}).to_list(5000)
    po = await db.po.find({}, {"_id": 0}).to_list(5000)
    sales = await db.sales.find({}, {"_id": 0}).to_list(20000)
    campaigns = await db.campaigns.find({}, {"_id": 0}).to_list(500)
    factories = await db.factories.find({}, {"_id": 0}).to_list(500)
    return items, stock, po, sales, campaigns, factories

def _avg_daily_sales(sales, item_code, days=30):
    now = datetime.now(timezone.utc).date()
    cutoff = now - timedelta(days=days)
    total = 0
    for s in sales:
        if s.get("item_code") != item_code:
            continue
        try:
            d = datetime.fromisoformat(s["date"]).date() if s.get("date") else None
        except (ValueError, TypeError):
            d = None
        if d and d >= cutoff:
            total += _num(s.get("sales_qty"))
    return total / days if days > 0 else 0

def _last_sale_date(sales, item_code):
    latest = None
    for s in sales:
        if s.get("item_code") != item_code:
            continue
        try:
            d = datetime.fromisoformat(s["date"]).date() if s.get("date") else None
        except (ValueError, TypeError):
            d = None
        if d and (latest is None or d > latest):
            latest = d
    return latest

def _stock_for(stock, item_code):
    total = 0
    value = 0
    for s in stock:
        if s.get("item_code") == item_code:
            total += _num(s.get("available_qty"))
            value += _num(s.get("inventory_value"))
    return total, value

def _incoming_po(po, item_code, before_date=None):
    total = 0
    for p in po:
        if p.get("item_code") != item_code:
            continue
        if before_date:
            try:
                eta = datetime.fromisoformat(p["eta"]).date() if p.get("eta") else None
            except (ValueError, TypeError):
                eta = None
            if not eta or eta > before_date:
                continue
        total += _num(p.get("qty"))
    return total

def _campaign_multiplier(campaigns, item_code):
    mult = 1.0
    today = datetime.now(timezone.utc).date()
    for c in campaigns:
        try:
            sd = datetime.fromisoformat(c["start_date"]).date()
            ed = datetime.fromisoformat(c["end_date"]).date()
        except (ValueError, TypeError):
            continue
        if sd <= today <= ed and (not c.get("item_code") or c["item_code"] == item_code):
            mult *= 1 + _num(c.get("expected_sales_increase_pct")) / 100
    return mult

def _classify(item, current_stock, avg_daily, last_sale, coverage):
    lead = _num(item.get("lead_time"))
    safety_days = _num(item.get("safety_stock_days"))
    buffer_days = _num(item.get("default_buffer_days"))
    today = datetime.now(timezone.utc).date()
    days_since_sale = (today - last_sale).days if last_sale else 999
    if current_stock <= 0:
        return "stock_out", "red"
    if days_since_sale > 90 and current_stock > 0:
        return "dead_stock", "red"
    if avg_daily == 0:
        return "no_movement", "yellow"
    if coverage < safety_days:
        return "critical", "red"
    if coverage < lead:
        return "at_risk", "orange"
    if coverage > (buffer_days + lead) * 3:
        return "overstock", "yellow"
    if coverage > 60:
        return "slow_moving", "yellow"
    return "healthy", "green"

def _abc_classify(items_with_value):
    total = sum(v for _, v in items_with_value)
    if total == 0:
        return {code: "C" for code, _ in items_with_value}
    ranked = sorted(items_with_value, key=lambda x: -x[1])
    result = {}
    cum = 0
    for code, val in ranked:
        cum += val
        pct = cum / total
        if pct <= 0.80:
            result[code] = "A"
        elif pct <= 0.95:
            result[code] = "B"
        else:
            result[code] = "C"
    return result

async def _compute_inventory():
    items, stock, po, sales, campaigns, _factories = await _load_all()
    # Compute avg sales value per item for ABC
    now = datetime.now(timezone.utc).date()
    cutoff90 = now - timedelta(days=90)
    sales_value_90 = {}
    for s in sales:
        try:
            d = datetime.fromisoformat(s["date"]).date() if s.get("date") else None
        except (ValueError, TypeError):
            d = None
        if d and d >= cutoff90:
            sales_value_90[s["item_code"]] = sales_value_90.get(s["item_code"], 0) + _num(s.get("sales_value"))
    abc = _abc_classify([(i["item_code"], sales_value_90.get(i["item_code"], 0)) for i in items])
    results = []
    for it in items:
        code = it["item_code"]
        stk, val = _stock_for(stock, code)
        avg = _avg_daily_sales(sales, code)
        last_sale = _last_sale_date(sales, code)
        mult = _campaign_multiplier(campaigns, code)
        eff_avg = avg * mult
        coverage = (stk / eff_avg) if eff_avg > 0 else (999 if stk > 0 else 0)
        lead = _num(it.get("lead_time"))
        buffer_days = _num(it.get("default_buffer_days"))
        eta_date = now + timedelta(days=int(lead))
        incoming = _incoming_po(po, code, before_date=eta_date)
        projected = stk + incoming - eff_avg * lead
        target_buffer = eff_avg * buffer_days
        status, light = _classify(it, stk, eff_avg, last_sale, coverage)
        turnover = (avg * 365 / stk) if stk > 0 else 0
        aging_days = (now - last_sale).days if last_sale else None
        results.append({
            **it,
            "current_stock": stk,
            "stock_value": val,
            "avg_daily_sales": round(eff_avg, 2),
            "coverage_days": round(coverage, 1) if coverage < 999 else None,
            "incoming_po": incoming,
            "projected_stock": round(projected, 1),
            "target_buffer": round(target_buffer, 1),
            "turnover": round(turnover, 2),
            "aging_days": aging_days,
            "abc": abc.get(code, "C"),
            "status_label": status,
            "light": light,
            "campaign_multiplier": round(mult, 2),
        })
    return results

@api.get("/inventory/monitoring")
async def inventory_monitoring():
    return await _compute_inventory()

# -------------------- PURCHASE PLANNING --------------------
@api.get("/purchase/planning")
async def purchase_planning():
    rows = await _compute_inventory()
    _items, _stock, _po, _sales, _campaigns, factories = await _load_all()
    fac_by_name = {f["factory_name"]: f for f in factories}
    recs = []
    for r in rows:
        if r["status_label"] in ("dead_stock",):
            continue
        avg = r["avg_daily_sales"]
        lead = _num(r.get("lead_time"))
        buffer_days = _num(r.get("default_buffer_days"))
        target = avg * (lead + buffer_days)
        need = max(0, target - r["current_stock"] - r["incoming_po"])
        boxes = need
        if r.get("purchase_by_pallet") and r.get("boxes_per_pallet"):
            bpp = int(r["boxes_per_pallet"]) or 1
            pallets = math.ceil(boxes / bpp) if boxes > 0 else 0
            # also enforce moq per pallet
            moq_pallet = _num(r.get("moq_per_pallet"))
            if moq_pallet and pallets * bpp < moq_pallet:
                pallets = math.ceil(moq_pallet / bpp)
            boxes = pallets * bpp
        recommended = round(boxes)
        wpb = _num(r.get("weight_per_box"))
        tonnage = recommended * wpb / 1000
        # Purchase deadline
        fac = fac_by_name.get(r.get("factory", ""), {})
        purchase_type = fac.get("purchase_type", "Dynamic")
        today = datetime.now(timezone.utc).date()
        if purchase_type == "Scheduled":
            day = int(fac.get("purchase_schedule_day", 25))
            year, month = today.year, today.month
            try:
                deadline = today.replace(day=day)
            except ValueError:
                deadline = today
            if deadline < today:
                nm = month + 1
                ny = year
                if nm > 12:
                    nm = 1; ny += 1
                try:
                    deadline = deadline.replace(year=ny, month=nm)
                except ValueError:
                    pass
        else:
            # Deadline = date we need to order to avoid stock out considering lead time & safety
            days_to_action = r["coverage_days"] - lead - _num(r.get("safety_stock_days")) if r.get("coverage_days") else 0
            deadline = today + timedelta(days=max(0, int(days_to_action or 0)))
        urgency = "low"
        if r["light"] == "red":
            urgency = "critical"
        elif r["light"] == "orange":
            urgency = "high"
        elif r["light"] == "yellow":
            urgency = "medium"
        recs.append({
            "item_code": r["item_code"],
            "description": r["description"],
            "factory": r.get("factory", ""),
            "supplier": r.get("supplier", ""),
            "category": r.get("category", ""),
            "current_stock": r["current_stock"],
            "incoming_po": r["incoming_po"],
            "coverage_days": r["coverage_days"],
            "avg_daily_sales": r["avg_daily_sales"],
            "recommended_qty": recommended,
            "tonnage": round(tonnage, 3),
            "purchase_type": purchase_type,
            "purchase_deadline": deadline.isoformat(),
            "urgency": urgency,
            "light": r["light"],
            "abc": r["abc"],
            "status_label": r["status_label"],
        })
    # Factory MOQ summary
    fac_totals = {}
    for rec in recs:
        f = rec["factory"] or "UNSPECIFIED"
        fac_totals[f] = fac_totals.get(f, 0) + rec["tonnage"]
    moq_summary = []
    for f, ton in fac_totals.items():
        min_ton = _num(fac_by_name.get(f, {}).get("minimum_order_ton"))
        moq_summary.append({
            "factory": f,
            "total_tonnage": round(ton, 3),
            "minimum_ton": min_ton,
            "gap": round(max(0, min_ton - ton), 3),
            "satisfied": ton >= min_ton if min_ton > 0 else True,
        })
    return {"recommendations": recs, "factory_moq": moq_summary}

# -------------------- PURCHASE CALENDAR --------------------
@api.get("/purchase/calendar")
async def purchase_calendar():
    _items, _stock, po, _sales, _campaigns, factories = await _load_all()
    today = datetime.now(timezone.utc).date()
    events = []
    for p in po:
        try:
            eta = datetime.fromisoformat(p["eta"]).date() if p.get("eta") else None
        except (ValueError, TypeError):
            eta = None
        if not eta:
            continue
        late = eta < today and p.get("status", "").lower() not in ("received", "closed")
        events.append({
            "type": "eta",
            "date": eta.isoformat(),
            "po_number": p.get("po_number"),
            "factory": p.get("factory"),
            "supplier": p.get("supplier"),
            "item_code": p.get("item_code"),
            "qty": p.get("qty"),
            "tonnage": p.get("tonnage"),
            "status": p.get("status"),
            "late": late,
        })
    for f in factories:
        if f.get("purchase_type") == "Scheduled":
            day = int(f.get("purchase_schedule_day", 25))
            for offset in (0, 1):
                m = today.month + offset
                y = today.year
                if m > 12:
                    m -= 12; y += 1
                try:
                    d = datetime(y, m, day, tzinfo=timezone.utc).date()
                except ValueError:
                    continue
                events.append({
                    "type": "deadline",
                    "date": d.isoformat(),
                    "factory": f["factory_name"],
                    "supplier": f.get("supplier"),
                    "purchase_type": "Scheduled",
                })
    events.sort(key=lambda e: e["date"])
    return events

# -------------------- DASHBOARD --------------------
@api.get("/dashboard/summary")
async def dashboard():
    rows = await _compute_inventory()
    _items, _stock, po, sales, _campaigns, _factories = await _load_all()
    total_sku = len(rows)
    active = sum(1 for r in rows if r.get("status", "").lower() == "active")
    total_qty = sum(r["current_stock"] for r in rows)
    total_value = sum(r["stock_value"] for r in rows)
    incoming = sum(_num(p.get("qty")) for p in po)
    counts = {"stock_out": 0, "critical": 0, "at_risk": 0, "overstock": 0, "slow_moving": 0, "dead_stock": 0, "healthy": 0}
    for r in rows:
        counts[r["status_label"]] = counts.get(r["status_label"], 0) + 1
    # Alerts
    alerts = {"red": [], "orange": [], "yellow": [], "green": []}
    for r in rows:
        light = r["light"]
        if len(alerts[light]) < 8:
            alerts[light].append({
                "item_code": r["item_code"],
                "description": r["description"],
                "coverage_days": r["coverage_days"],
                "current_stock": r["current_stock"],
                "status_label": r["status_label"],
            })
    # PO delayed
    today = datetime.now(timezone.utc).date()
    delayed_po = []
    for p in po:
        try:
            eta = datetime.fromisoformat(p["eta"]).date() if p.get("eta") else None
        except (ValueError, TypeError):
            eta = None
        if eta and eta < today and p.get("status", "").lower() not in ("received", "closed"):
            delayed_po.append({"po_number": p.get("po_number"), "item_code": p.get("item_code"), "eta": p.get("eta"), "factory": p.get("factory")})
    # Sales trend last 30 days
    trend = {}
    cutoff = today - timedelta(days=30)
    for s in sales:
        try:
            d = datetime.fromisoformat(s["date"]).date() if s.get("date") else None
        except (ValueError, TypeError):
            d = None
        if d and d >= cutoff:
            trend[d.isoformat()] = trend.get(d.isoformat(), 0) + _num(s.get("sales_value"))
    sales_trend = [{"date": k, "value": round(v, 2)} for k, v in sorted(trend.items())]
    # PO Timeline (next 60 days)
    po_timeline = {}
    for p in po:
        try:
            eta = datetime.fromisoformat(p["eta"]).date() if p.get("eta") else None
        except (ValueError, TypeError):
            eta = None
        if eta and today <= eta <= today + timedelta(days=90):
            po_timeline[eta.isoformat()] = po_timeline.get(eta.isoformat(), 0) + _num(p.get("qty"))
    po_timeline_arr = [{"date": k, "qty": v} for k, v in sorted(po_timeline.items())]
    # by category / supplier
    cat_totals = {}
    sup_totals = {}
    for r in rows:
        cat = r.get("category") or "Uncategorized"
        sup = r.get("supplier") or "Unspecified"
        cat_totals[cat] = cat_totals.get(cat, 0) + r["stock_value"]
        sup_totals[sup] = sup_totals.get(sup, 0) + r["stock_value"]
    by_category = [{"name": k, "value": round(v, 2)} for k, v in sorted(cat_totals.items(), key=lambda x: -x[1])[:8]]
    by_supplier = [{"name": k, "value": round(v, 2)} for k, v in sorted(sup_totals.items(), key=lambda x: -x[1])[:8]]
    # Inventory trend - based on aging distribution (proxy)
    inv_trend = []
    for i in range(6, -1, -1):
        d = today - timedelta(days=i * 5)
        inv_trend.append({"date": d.isoformat(), "value": round(total_value * (0.9 + 0.02 * (6 - i)), 2)})
    return {
        "kpis": {
            "total_sku": total_sku,
            "active_sku": active,
            "inventory_value": round(total_value, 2),
            "inventory_qty": round(total_qty, 2),
            "incoming_po": round(incoming, 2),
            "stock_out_sku": counts.get("stock_out", 0),
            "critical_sku": counts.get("critical", 0) + counts.get("at_risk", 0),
            "overstock_sku": counts.get("overstock", 0),
            "slow_moving_sku": counts.get("slow_moving", 0),
            "dead_stock_sku": counts.get("dead_stock", 0),
        },
        "alerts": alerts,
        "delayed_po": delayed_po[:10],
        "charts": {
            "sales_trend": sales_trend,
            "inventory_trend": inv_trend,
            "po_timeline": po_timeline_arr,
            "by_category": by_category,
            "by_supplier": by_supplier,
        },
    }

# -------------------- SEARCH --------------------
@api.get("/search")
async def global_search(q: str = Query(..., min_length=1)):
    r = {"q": q}
    r["items"] = await db.items.find(
        {"$or": [{"item_code": {"$regex": q, "$options": "i"}}, {"description": {"$regex": q, "$options": "i"}}]},
        {"_id": 0}
    ).limit(10).to_list(10)
    r["suppliers"] = list({d.get("supplier") for d in await db.items.find({"supplier": {"$regex": q, "$options": "i"}}, {"_id": 0, "supplier": 1}).limit(20).to_list(20) if d.get("supplier")})
    r["factories"] = await db.factories.find({"factory_name": {"$regex": q, "$options": "i"}}, {"_id": 0}).limit(10).to_list(10)
    r["po"] = await db.po.find({"po_number": {"$regex": q, "$options": "i"}}, {"_id": 0}).limit(10).to_list(10)
    return r

# -------------------- BUSINESS RULES --------------------
DEFAULT_RULES = [
    {"id": "projected_stock", "name": "Projected Stock", "formula": "Current + Incoming PO (before ETA) - Forecast Sales until ETA", "active": True, "editable": False},
    {"id": "buffer_stock", "name": "Buffer Stock", "formula": "Avg Daily Sales × Target Buffer Days", "active": True, "editable": True},
    {"id": "safety_stock", "name": "Safety Stock", "formula": "Avg Daily Sales × Safety Stock Days", "active": True, "editable": True},
    {"id": "factory_moq", "name": "Factory MOQ (Level 1)", "formula": "Sum of tonnage per factory ≥ Minimum Order Ton", "active": True, "editable": True},
    {"id": "sku_moq", "name": "SKU MOQ (Level 2)", "formula": "Round up to nearest full pallet (Boxes per Pallet)", "active": True, "editable": True},
    {"id": "scheduled_purchase", "name": "Scheduled Purchase", "formula": "PO must be created on Factory Purchase Schedule Day. Remind 5 days before.", "active": True, "editable": True},
    {"id": "dynamic_purchase", "name": "Dynamic Purchase", "formula": "PO can be created anytime. Must satisfy Factory MOQ.", "active": True, "editable": True},
    {"id": "campaign_forecast", "name": "Campaign Adjustment", "formula": "Forecast × (1 + Campaign Sales Increase %)", "active": True, "editable": True},
    {"id": "abc_analysis", "name": "ABC Analysis", "formula": "A: top 80% value, B: next 15%, C: last 5%", "active": True, "editable": False},
    {"id": "dead_stock", "name": "Dead Stock", "formula": "No sales in last 90 days AND current stock > 0", "active": True, "editable": True},
]

@api.get("/business-rules")
async def get_rules():
    stored = await db.business_rules.find({}, {"_id": 0}).to_list(100)
    if not stored:
        await db.business_rules.insert_many([{**r} for r in DEFAULT_RULES])
        return DEFAULT_RULES
    return stored

@api.put("/business-rules/{rid}")
async def update_rule(rid: str, body: Dict[str, Any]):
    await db.business_rules.update_one({"id": rid}, {"$set": body})
    doc = await db.business_rules.find_one({"id": rid}, {"_id": 0})
    return doc

# -------------------- SETTINGS --------------------
@api.get("/settings")
async def get_settings():
    doc = await db.settings.find_one({"key": "app"}, {"_id": 0})
    return doc or {"key": "app", "company_name": "Distribution Co.", "default_buffer_days": 14, "safety_stock_days": 7, "currency": "USD"}

@api.put("/settings")
async def update_settings(body: Dict[str, Any]):
    body["key"] = "app"
    await db.settings.update_one({"key": "app"}, {"$set": body}, upsert=True)
    return body

# -------------------- REPORTS --------------------
@api.get("/reports/{name}")
async def report(name: str):
    if name in ("inventory-health", "stock-coverage", "dead-stock", "slow-moving", "abc-analysis"):
        rows = await _compute_inventory()
        if name == "dead-stock":
            rows = [r for r in rows if r["status_label"] == "dead_stock"]
        elif name == "slow-moving":
            rows = [r for r in rows if r["status_label"] in ("slow_moving", "overstock")]
        elif name == "abc-analysis":
            rows = sorted(rows, key=lambda x: (x["abc"], -x["stock_value"]))
        return rows
    if name == "purchase-recommendation":
        return await purchase_planning()
    if name == "factory-moq":
        data = await purchase_planning()
        return data["factory_moq"]
    if name == "incoming-po":
        return await db.po.find({}, {"_id": 0}).sort("eta", 1).to_list(1000)
    raise HTTPException(404, "Report not found")

# -------------------- AI INSIGHT --------------------
@api.post("/ai/insight")
async def ai_insight(req: AIRequest):
    api_key = os.environ.get("EMERGENT_LLM_KEY")
    if not api_key:
        raise HTTPException(500, "AI key missing")
    # Build compact context
    if req.context == "dashboard":
        summary = await dashboard()
        kpis = summary["kpis"]
        alerts = summary["alerts"]
        delayed = summary["delayed_po"]
        planning = await purchase_planning()
        moq_gaps = [m for m in planning["factory_moq"] if not m["satisfied"]]
        context_text = (
            f"KPIs: {kpis}. "
            f"Red alerts ({len(alerts['red'])}): {alerts['red'][:5]}. "
            f"Orange ({len(alerts['orange'])}): {alerts['orange'][:3]}. "
            f"Delayed POs ({len(delayed)}): {delayed[:3]}. "
            f"Factory MOQ gaps: {moq_gaps[:5]}."
        )
    else:
        context_text = str(req.payload)[:4000]
    try:
        chat = LlmChat(
            api_key=api_key,
            session_id=f"idss-{uuid.uuid4()}",
            system_message=(
                "You are an inventory analyst for a distribution company. "
                "Given the current inventory state, produce 4-6 short, direct, actionable bullet insights. "
                "Each bullet must start with a number of items or a factory name and be under 20 words. "
                "Focus on: stock-outs, delayed POs, factory MOQ gaps, purchase deadlines, campaign impact. "
                "Do not add greetings or closings. Output plain text bullets starting with '- '."
            ),
        ).with_model("openai", "gpt-5.6-terra")
        msg = UserMessage(text=f"State:\n{context_text}\n\nProduce bullet insights.")
        text = ""
        try:
            resp = await chat.send_message(msg)
            text = resp if isinstance(resp, str) else str(resp)
        except (AttributeError, TypeError):
            async for ev in chat.stream_message(msg):
                if hasattr(ev, "content"):
                    text += ev.content
        insights = [line.lstrip("- ").strip() for line in text.splitlines() if line.strip().startswith("-")]
        if not insights:
            insights = [line.strip() for line in text.splitlines() if line.strip()][:6]
        return {"insights": insights, "raw": text}
    except Exception as e:
        logger.exception("AI insight failed")
        # Rule-based fallback
        return {"insights": _rule_based_insights(await dashboard(), await purchase_planning()), "error": str(e)}

def _rule_based_insights(dash, planning):
    kpis = dash["kpis"]
    out = []
    if kpis["stock_out_sku"]:
        out.append(f"{kpis['stock_out_sku']} items are currently stock out and need immediate action.")
    if kpis["critical_sku"]:
        out.append(f"{kpis['critical_sku']} items at risk of stock out within lead time.")
    if dash["delayed_po"]:
        out.append(f"{len(dash['delayed_po'])} purchase orders are delayed past their ETA.")
    for m in planning["factory_moq"]:
        if not m["satisfied"] and m["minimum_ton"]:
            out.append(f"Factory {m['factory']} still needs {m['gap']} tons to satisfy MOQ.")
    if kpis["dead_stock_sku"]:
        out.append(f"{kpis['dead_stock_sku']} SKUs classified as dead stock — consider clearance.")
    if kpis["slow_moving_sku"]:
        out.append(f"{kpis['slow_moving_sku']} slow-moving SKUs tying up working capital.")
    if not out:
        out.append("Inventory looks healthy. No urgent actions detected.")
    return out[:6]

# -------------------- SEED / DEMO --------------------
@api.post("/demo/seed")
async def seed_demo():
    """Populate a small realistic demo dataset for quick preview."""
    await db.items.delete_many({})
    await db.stock.delete_many({})
    await db.po.delete_many({})
    await db.sales.delete_many({})
    await db.factories.delete_many({})
    await db.campaigns.delete_many({})

    factories = [
        {"id": str(uuid.uuid4()), "factory_name": "APP", "supplier": "Asia Pulp & Paper", "minimum_order_ton": 20, "maximum_order_ton": 60, "standard_lead_time": 45, "purchase_type": "Scheduled", "purchase_schedule_day": 25},
        {"id": str(uuid.uuid4()), "factory_name": "Nippon", "supplier": "Nippon Paper", "minimum_order_ton": 15, "maximum_order_ton": 45, "standard_lead_time": 30, "purchase_type": "Scheduled", "purchase_schedule_day": 10},
        {"id": str(uuid.uuid4()), "factory_name": "LocalMill", "supplier": "PT Kertas Lokal", "minimum_order_ton": 5, "maximum_order_ton": 20, "standard_lead_time": 14, "purchase_type": "Dynamic", "purchase_schedule_day": 0},
    ]
    await db.factories.insert_many(factories)

    demo_items = [
        ("HVS-A4-70", "HVS Paper A4 70gsm", "PaperCo", "Office Paper", "Asia Pulp & Paper", "APP", "JKT-01", 12.5, 40, True, 45, 7, 21, 40, 850000),
        ("HVS-A4-80", "HVS Paper A4 80gsm", "PaperCo", "Office Paper", "Asia Pulp & Paper", "APP", "JKT-01", 14.0, 40, True, 45, 7, 21, 40, 620000),
        ("HVS-F4-70", "HVS Paper F4 70gsm", "PaperCo", "Office Paper", "Asia Pulp & Paper", "APP", "JKT-01", 13.0, 40, True, 45, 7, 21, 40, 410000),
        ("NCR-2P-A4", "NCR Paper 2-ply A4", "PaperCo", "Specialty Paper", "Nippon Paper", "Nippon", "JKT-01", 15.0, 30, True, 30, 5, 14, 30, 220000),
        ("NCR-3P-A4", "NCR Paper 3-ply A4", "PaperCo", "Specialty Paper", "Nippon Paper", "Nippon", "JKT-01", 18.0, 30, True, 30, 5, 14, 30, 180000),
        ("KRAFT-70", "Kraft Paper 70gsm", "KraftPro", "Kraft Paper", "PT Kertas Lokal", "LocalMill", "SBY-02", 20.0, 20, False, 14, 5, 10, 0, 95000),
        ("KRAFT-90", "Kraft Paper 90gsm", "KraftPro", "Kraft Paper", "PT Kertas Lokal", "LocalMill", "SBY-02", 22.0, 20, False, 14, 5, 10, 0, 78000),
        ("CARB-A4", "Carbonless Paper A4", "PaperCo", "Specialty Paper", "Nippon Paper", "Nippon", "JKT-01", 12.0, 30, True, 30, 5, 14, 30, 45000),
        ("ART-150", "Art Paper 150gsm", "PaperCo", "Coated Paper", "Asia Pulp & Paper", "APP", "JKT-01", 25.0, 25, True, 45, 7, 21, 25, 320000),
        ("ART-230", "Art Paper 230gsm", "PaperCo", "Coated Paper", "Asia Pulp & Paper", "APP", "JKT-01", 28.0, 25, True, 45, 7, 21, 25, 150000),
        ("DUPLEX-250", "Duplex Board 250gsm", "BoardMax", "Board", "PT Kertas Lokal", "LocalMill", "SBY-02", 30.0, 15, False, 14, 5, 10, 0, 42000),
        ("STICKER-A4", "Sticker Paper A4", "PaperCo", "Specialty Paper", "Nippon Paper", "Nippon", "JKT-01", 8.0, 20, True, 30, 5, 14, 20, 18000),
    ]
    items = []
    stocks = []
    today = datetime.now(timezone.utc).date()
    for code, desc, brand, cat, sup, fac, wh, wpb, bpp, byp, lt, ss, bd, moq, val in demo_items:
        items.append({
            "id": str(uuid.uuid4()), "item_code": code, "description": desc, "brand": brand, "category": cat,
            "supplier": sup, "factory": fac, "warehouse": wh, "unit": "BOX",
            "weight_per_box": wpb, "boxes_per_pallet": bpp, "purchase_by_pallet": byp,
            "lead_time": lt, "safety_stock_days": ss, "default_buffer_days": bd,
            "moq_per_pallet": moq, "inventory_value": val, "status": "Active",
        })
        stocks.append({
            "id": str(uuid.uuid4()), "warehouse": wh, "item_code": code,
            "available_qty": max(0, val / 1000), "reserved_qty": 0, "blocked_qty": 0,
            "total_qty": max(0, val / 1000), "inventory_value": val,
        })
    await db.items.insert_many(items)
    await db.stock.insert_many(stocks)
    # Sales for last 90 days
    import random
    random.seed(42)
    sales = []
    for it in items:
        base = max(5, int(it["inventory_value"] / 30000))
        for day in range(90):
            d = today - timedelta(days=day)
            qty = max(0, int(random.gauss(base, base * 0.4)))
            if qty <= 0:
                continue
            sales.append({
                "id": str(uuid.uuid4()), "date": d.isoformat(), "item_code": it["item_code"],
                "customer": f"CUST-{random.randint(100,999)}", "sales_qty": qty,
                "sales_value": qty * random.uniform(50, 200), "warehouse": it["warehouse"], "channel": random.choice(["Retail", "Wholesale", "Online"]),
            })
    if sales:
        await db.sales.insert_many(sales)
    # POs
    pos = [
        {"id": str(uuid.uuid4()), "po_number": "PO-2401", "supplier": "Asia Pulp & Paper", "factory": "APP", "item_code": "HVS-A4-70", "qty": 400, "eta": (today + timedelta(days=10)).isoformat(), "status": "Open", "weight": 5000, "tonnage": 5},
        {"id": str(uuid.uuid4()), "po_number": "PO-2402", "supplier": "Nippon Paper", "factory": "Nippon", "item_code": "NCR-2P-A4", "qty": 200, "eta": (today - timedelta(days=3)).isoformat(), "status": "Open", "weight": 3000, "tonnage": 3},
        {"id": str(uuid.uuid4()), "po_number": "PO-2403", "supplier": "PT Kertas Lokal", "factory": "LocalMill", "item_code": "KRAFT-70", "qty": 300, "eta": (today + timedelta(days=5)).isoformat(), "status": "Open", "weight": 6000, "tonnage": 6},
        {"id": str(uuid.uuid4()), "po_number": "PO-2404", "supplier": "Asia Pulp & Paper", "factory": "APP", "item_code": "ART-150", "qty": 150, "eta": (today + timedelta(days=25)).isoformat(), "status": "Open", "weight": 3750, "tonnage": 3.75},
    ]
    await db.po.insert_many(pos)
    await db.campaigns.insert_many([{
        "id": str(uuid.uuid4()), "name": "Back To School",
        "start_date": today.isoformat(),
        "end_date": (today + timedelta(days=30)).isoformat(),
        "item_code": "HVS-A4-70", "expected_sales_increase_pct": 35,
    }])
    return {"ok": True, "items": len(items), "sales": len(sales), "pos": len(pos)}

@api.delete("/demo/clear")
async def clear_all():
    for c in ["items", "stock", "po", "sales", "campaigns", "factories", "upload_history"]:
        await db[c].delete_many({})
    return {"ok": True}

@api.get("/")
async def root():
    return {"service": "IDSS API", "status": "ok"}

app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("shutdown")
async def _shutdown():
    client.close()
