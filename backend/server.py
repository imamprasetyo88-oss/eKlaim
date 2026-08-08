"""eKlaim Lyra & Sunda Kelapa Pustaka - Multi-Tenant Petty Cash & Expense Claim Backend"""
from fastapi import FastAPI, APIRouter, UploadFile, File, HTTPException, Depends, Header, Query
from fastapi.responses import Response
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any, Literal
from datetime import datetime, timezone, timedelta
from pathlib import Path
from passlib.context import CryptContext
from jose import jwt, JWTError
import os, io, uuid, logging, base64, requests
from dotenv import load_dotenv
from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

MONGO_URL = os.environ['MONGO_URL']
DB_NAME = os.environ['DB_NAME']
JWT_SECRET = os.environ.get('JWT_SECRET', 'eklaim-lyra-secret-change-me')
JWT_ALG = 'HS256'
JWT_EXPIRE_HOURS = 24 * 7
EMERGENT_KEY = os.environ.get('EMERGENT_LLM_KEY')
APP_NAME = 'eklaim'

STORAGE_BASE = (os.environ.get("INTEGRATION_PROXY_URL") or "").strip() or "https://integrations.emergentagent.com"
STORAGE_URL = STORAGE_BASE.rstrip("/") + "/objstore/api/v1/storage"

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")

app = FastAPI(title="eKlaim Multi-Tenant API")
api = APIRouter(prefix="/api")
logger = logging.getLogger("eklaim")
logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')

# -------------------- STORAGE --------------------
_storage_key = None
def init_storage(force=False):
    global _storage_key
    if _storage_key and not force:
        return _storage_key
    try:
        r = requests.post(f"{STORAGE_URL}/init", json={"emergent_key": EMERGENT_KEY}, timeout=30)
        r.raise_for_status()
        _storage_key = r.json()["storage_key"]
        return _storage_key
    except Exception as e:
        logger.error(f"Storage init failed: {e}")
        return None

def put_object(path, data, content_type):
    key = init_storage()
    if not key: raise HTTPException(500, "Storage not available")
    r = requests.put(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key, "Content-Type": content_type}, data=data, timeout=120)
    if r.status_code == 404:
        key = init_storage(force=True)
        r = requests.put(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key, "Content-Type": content_type}, data=data, timeout=120)
    r.raise_for_status()
    return r.json()

def get_object(path):
    key = init_storage()
    r = requests.get(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key}, timeout=60)
    if r.status_code == 404:
        key = init_storage(force=True)
        r = requests.get(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key}, timeout=60)
    r.raise_for_status()
    return r.content, r.headers.get("Content-Type", "application/octet-stream")

MIME_TYPES = {"jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png", "gif": "image/gif", "webp": "image/webp", "pdf": "application/pdf"}

# -------------------- HELPERS --------------------
def now_iso(): return datetime.now(timezone.utc).isoformat()
def hash_pw(p): return pwd_ctx.hash(p)
def verify_pw(p, h):
    try: return pwd_ctx.verify(p, h)
    except Exception: return False

def make_token(user):
    return jwt.encode({
        "sub": user["id"], "username": user["username"], "role": user["role"],
        "company_id": user.get("company_id"),
        "exp": datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRE_HOURS),
    }, JWT_SECRET, algorithm=JWT_ALG)

async def current_user(authorization: Optional[str] = Header(None), auth: Optional[str] = Query(None)):
    token = None
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization.split(" ", 1)[1].strip()
    elif auth: token = auth
    if not token: raise HTTPException(401, "Not authenticated")
    try: data = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
    except JWTError: raise HTTPException(401, "Invalid token")
    user = await db.users.find_one({"id": data["sub"]}, {"_id": 0, "password_hash": 0})
    if not user or not user.get("active", True):
        raise HTTPException(401, "User not found or inactive")
    return user

def require_roles(*roles):
    async def _dep(user=Depends(current_user)):
        if user["role"] not in roles: raise HTTPException(403, f"Role required: {roles}")
        return user
    return _dep

def cq(user):
    """Company filter dict — spread into MongoDB queries for tenant isolation."""
    return {"company_id": user["company_id"]}

async def audit(user, action, entity_type, entity_id, meta=None):
    await db.audit.insert_one({
        "id": str(uuid.uuid4()), "company_id": user.get("company_id"),
        "actor_id": user["id"], "actor_name": user.get("name") or user.get("username"),
        "actor_role": user["role"], "action": action,
        "entity_type": entity_type, "entity_id": entity_id, "meta": meta or {},
        "timestamp": now_iso(),
    })

# -------------------- MODELS --------------------
class LoginReq(BaseModel):
    username: str
    password: str
    company_id: str

class CompanyModel(BaseModel):
    code: str
    name: str
    active: bool = True

class UserCreate(BaseModel):
    username: str
    name: str
    password: str
    role: Literal["admin", "user", "verifikator", "atasan", "finance", "auditor"]
    email: Optional[str] = ""

class UserUpdate(BaseModel):
    name: Optional[str] = None
    role: Optional[str] = None
    active: Optional[bool] = None
    email: Optional[str] = None

class PasswordChange(BaseModel):
    old_password: Optional[str] = None
    new_password: str

class CategoryModel(BaseModel):
    code: str
    name: str
    icon: str = "Receipt"
    active: bool = True

class ClaimCreate(BaseModel):
    category_id: str
    tanggal: str
    deskripsi: str
    tujuan: Optional[str] = ""
    jumlah: float
    receipt_ids: List[str] = []

class ClaimAction(BaseModel):
    catatan: Optional[str] = ""
    transfer_proof_ids: List[str] = []

class TopUpCreate(BaseModel):
    jumlah: float
    catatan: Optional[str] = ""

class TopUpApprove(BaseModel):
    catatan: Optional[str] = ""
    transfer_proof_ids: List[str] = []

class PettyCashInit(BaseModel):
    saldo_awal: float

class CashAdvanceCreate(BaseModel):
    category_id: str
    tanggal: str
    deskripsi: str
    tujuan: Optional[str] = ""
    jumlah_um: float

class CashAdvanceAction(BaseModel):
    catatan: Optional[str] = ""
    transfer_proof_ids: List[str] = []

class CashAdvanceRealize(BaseModel):
    jumlah_aktual: float
    receipt_ids: List[str]
    catatan: Optional[str] = ""
    settle_proof_ids: List[str] = []

class AIRequest(BaseModel):
    context: str = "dashboard"
    payload: Dict[str, Any] = {}

# -------------------- COMPANIES --------------------
@api.get("/companies")
async def list_companies_public():
    """Public — untuk dropdown login."""
    return await db.companies.find({"active": {"$ne": False}}, {"_id": 0}).sort("name", 1).to_list(50)

@api.get("/companies/current")
async def current_company(user=Depends(current_user)):
    c = await db.companies.find_one({"id": user["company_id"]}, {"_id": 0})
    return c or {}

# -------------------- AUTH --------------------
@api.post("/auth/login")
async def login(body: LoginReq):
    u = await db.users.find_one({"username": body.username.lower(), "company_id": body.company_id})
    if not u or not verify_pw(body.password, u.get("password_hash", "")):
        raise HTTPException(401, "Username atau password salah untuk perusahaan ini")
    if not u.get("active", True):
        raise HTTPException(403, "Akun tidak aktif")
    company = await db.companies.find_one({"id": body.company_id}, {"_id": 0})
    user_public = {k: v for k, v in u.items() if k not in ("_id", "password_hash")}
    return {"token": make_token(user_public), "user": user_public, "company": company}

@api.get("/auth/me")
async def me(user=Depends(current_user)):
    company = await db.companies.find_one({"id": user["company_id"]}, {"_id": 0})
    return {**user, "company": company}

@api.post("/auth/change-password")
async def change_password(body: PasswordChange, user=Depends(current_user)):
    doc = await db.users.find_one({"id": user["id"]})
    if body.old_password and not verify_pw(body.old_password, doc["password_hash"]):
        raise HTTPException(400, "Password lama salah")
    await db.users.update_one({"id": user["id"]}, {"$set": {"password_hash": hash_pw(body.new_password)}})
    await audit(user, "change_password", "user", user["id"])
    return {"ok": True}

# -------------------- USERS (per company) --------------------
@api.get("/users")
async def list_users(user=Depends(require_roles("admin", "auditor"))):
    return await db.users.find(cq(user), {"_id": 0, "password_hash": 0}).sort("created_at", -1).to_list(500)

@api.post("/users")
async def create_user(body: UserCreate, user=Depends(require_roles("admin"))):
    if await db.users.find_one({"username": body.username.lower(), "company_id": user["company_id"]}):
        raise HTTPException(400, "Username sudah dipakai di perusahaan ini")
    doc = {
        "id": str(uuid.uuid4()), "company_id": user["company_id"],
        "username": body.username.lower(), "name": body.name, "email": body.email or "",
        "role": body.role, "active": True,
        "password_hash": hash_pw(body.password), "created_at": now_iso(),
    }
    await db.users.insert_one(doc)
    await audit(user, "create_user", "user", doc["id"], {"role": body.role})
    return {k: v for k, v in doc.items() if k not in ("_id", "password_hash")}

@api.put("/users/{uid}")
async def update_user(uid: str, body: UserUpdate, user=Depends(require_roles("admin"))):
    target = await db.users.find_one({"id": uid, "company_id": user["company_id"]})
    if not target: raise HTTPException(404, "User tidak ditemukan")
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if updates: await db.users.update_one({"id": uid}, {"$set": updates})
    await audit(user, "update_user", "user", uid, updates)
    return await db.users.find_one({"id": uid}, {"_id": 0, "password_hash": 0})

@api.post("/users/{uid}/reset-password")
async def reset_password(uid: str, body: PasswordChange, user=Depends(require_roles("admin"))):
    target = await db.users.find_one({"id": uid, "company_id": user["company_id"]})
    if not target: raise HTTPException(404, "User tidak ditemukan")
    await db.users.update_one({"id": uid}, {"$set": {"password_hash": hash_pw(body.new_password)}})
    await audit(user, "reset_password", "user", uid)
    return {"ok": True}

@api.delete("/users/{uid}")
async def delete_user(uid: str, user=Depends(require_roles("admin"))):
    if uid == user["id"]: raise HTTPException(400, "Tidak bisa menghapus akun sendiri")
    target = await db.users.find_one({"id": uid, "company_id": user["company_id"]})
    if not target: raise HTTPException(404, "User tidak ditemukan")
    await db.users.update_one({"id": uid}, {"$set": {"active": False}})
    await audit(user, "deactivate_user", "user", uid)
    return {"ok": True}

# -------------------- CATEGORIES (per company) --------------------
@api.get("/categories")
async def list_categories(user=Depends(current_user)):
    return await db.categories.find(cq(user), {"_id": 0}).sort("name", 1).to_list(200)

@api.post("/categories")
async def create_category(body: CategoryModel, user=Depends(require_roles("admin"))):
    if await db.categories.find_one({"code": body.code, "company_id": user["company_id"]}):
        raise HTTPException(400, "Kode kategori sudah ada di perusahaan ini")
    doc = {"id": str(uuid.uuid4()), "company_id": user["company_id"], **body.model_dump(), "created_at": now_iso()}
    await db.categories.insert_one(doc)
    await audit(user, "create_category", "category", doc["id"], {"name": body.name})
    return {k: v for k, v in doc.items() if k != "_id"}

@api.put("/categories/{cid}")
async def update_category(cid: str, body: CategoryModel, user=Depends(require_roles("admin"))):
    t = await db.categories.find_one({"id": cid, "company_id": user["company_id"]})
    if not t: raise HTTPException(404, "Kategori tidak ditemukan")
    await db.categories.update_one({"id": cid}, {"$set": body.model_dump()})
    await audit(user, "update_category", "category", cid)
    return await db.categories.find_one({"id": cid}, {"_id": 0})

@api.delete("/categories/{cid}")
async def delete_category(cid: str, user=Depends(require_roles("admin"))):
    t = await db.categories.find_one({"id": cid, "company_id": user["company_id"]})
    if not t: raise HTTPException(404, "Kategori tidak ditemukan")
    await db.categories.update_one({"id": cid}, {"$set": {"active": False}})
    await audit(user, "deactivate_category", "category", cid)
    return {"ok": True}

# -------------------- FILES --------------------
@api.post("/files/upload")
async def upload_file(file: UploadFile = File(...), user=Depends(current_user)):
    ext = (file.filename or "bin").split(".")[-1].lower()
    if ext not in MIME_TYPES: raise HTTPException(400, "Format tidak didukung")
    data = await file.read()
    if len(data) > 10 * 1024 * 1024: raise HTTPException(400, "Ukuran maks 10MB")
    file_id = str(uuid.uuid4())
    path = f"{APP_NAME}/{user['company_id']}/{user['id']}/{file_id}.{ext}"
    result = put_object(path, data, file.content_type or MIME_TYPES[ext])
    doc = {"id": file_id, "company_id": user["company_id"], "storage_path": result["path"],
           "original_filename": file.filename, "content_type": file.content_type or MIME_TYPES[ext],
           "size": result.get("size", len(data)), "uploaded_by": user["id"], "is_deleted": False,
           "created_at": now_iso()}
    await db.files.insert_one(doc)
    return {"id": file_id, "name": file.filename, "size": doc["size"], "content_type": doc["content_type"]}

@api.get("/files/{fid}/download")
async def download_file(fid: str, user=Depends(current_user)):
    rec = await db.files.find_one({"id": fid, "is_deleted": False})
    if not rec: raise HTTPException(404, "File tidak ditemukan")
    if rec.get("company_id") and rec["company_id"] != user["company_id"]:
        raise HTTPException(403, "File tidak dapat diakses")
    data, ct = get_object(rec["storage_path"])
    return Response(content=data, media_type=rec.get("content_type", ct),
                    headers={"Content-Disposition": f'inline; filename="{rec["original_filename"]}"'})

# -------------------- OCR --------------------
@api.post("/ocr/receipt")
async def ocr_receipt(file_id: str, user=Depends(current_user)):
    rec = await db.files.find_one({"id": file_id, "is_deleted": False, "company_id": user["company_id"]})
    if not rec: raise HTTPException(404, "File tidak ditemukan")
    if not rec["content_type"].startswith("image/"):
        return {"jumlah": None, "tanggal": None, "merchant": None, "note": "Hanya bisa OCR gambar (jpg/png/webp)."}
    data, _ = get_object(rec["storage_path"])
    b64 = base64.b64encode(data).decode()
    prompt = ("Anda adalah asisten OCR untuk struk/nota Bahasa Indonesia. Ekstrak dan jawab HANYA JSON valid: "
              '{"jumlah": <angka rupiah total integer>, "tanggal": "<YYYY-MM-DD atau kosong>", '
              '"merchant": "<toko/warung/SPBU/tol>", "kategori_tebakan": "<Karcis Tol|Bensin|ATK|Kebersihan|Konsumsi|Lain-lain>", '
              '"catatan": "<singkat 1 kalimat>"}. Tanpa teks lain.')
    try:
        chat = LlmChat(api_key=EMERGENT_KEY, session_id=f"ocr-{uuid.uuid4()}",
                       system_message="Anda ahli membaca struk Bahasa Indonesia. Jawab JSON valid saja.").with_model("openai", "gpt-5.6-terra")
        msg = UserMessage(text=prompt, file_contents=[ImageContent(image_base64=b64)])
        text = ""
        from emergentintegrations.llm.chat import TextDelta, StreamDone
        async for ev in chat.stream_message(msg):
            if isinstance(ev, TextDelta): text += ev.content
            elif isinstance(ev, StreamDone): break
        import json, re
        m = re.search(r"\{.*\}", text, re.DOTALL)
        return json.loads(m.group(0) if m else text)
    except Exception as e:
        logger.exception("OCR failed")
        return {"jumlah": None, "tanggal": None, "merchant": None, "kategori_tebakan": None, "catatan": f"OCR gagal: {e}"}

# -------------------- PETTY CASH (per company) --------------------
def wallet_key(company_id): return f"wallet:{company_id}"

async def get_petty_cash(user):
    doc = await db.petty_cash.find_one({"key": wallet_key(user["company_id"])})
    if not doc:
        doc = {"key": wallet_key(user["company_id"]), "company_id": user["company_id"],
               "saldo_awal": 5000000, "saldo_sekarang": 5000000, "updated_at": now_iso()}
        await db.petty_cash.insert_one(doc)
    return {"saldo_awal": doc["saldo_awal"], "saldo_sekarang": doc["saldo_sekarang"], "updated_at": doc.get("updated_at")}

async def apply_petty_cash(user, delta, tx_type, ref_id, description):
    doc = await db.petty_cash.find_one({"key": wallet_key(user["company_id"])})
    if not doc:
        await get_petty_cash(user)
        doc = await db.petty_cash.find_one({"key": wallet_key(user["company_id"])})
    new_balance = doc["saldo_sekarang"] + delta
    await db.petty_cash.update_one({"key": wallet_key(user["company_id"])},
                                    {"$set": {"saldo_sekarang": new_balance, "updated_at": now_iso()}})
    await db.petty_cash_tx.insert_one({
        "id": str(uuid.uuid4()), "company_id": user["company_id"],
        "type": tx_type, "amount": abs(delta), "delta": delta, "ref_id": ref_id,
        "description": description, "actor_id": user["id"],
        "actor_name": user.get("name") or user["username"],
        "balance_after": new_balance, "created_at": now_iso(),
    })
    return new_balance

@api.get("/petty-cash")
async def petty_cash_status(user=Depends(current_user)):
    wallet = await get_petty_cash(user)
    txs = await db.petty_cash_tx.find(cq(user), {"_id": 0}).sort("created_at", -1).limit(100).to_list(100)
    return {**wallet, "transactions": txs}

@api.put("/petty-cash/saldo-awal")
async def set_saldo_awal(body: PettyCashInit, user=Depends(require_roles("admin"))):
    doc = await db.petty_cash.find_one({"key": wallet_key(user["company_id"])}) or {}
    old = doc.get("saldo_awal", 0)
    await db.petty_cash.update_one(
        {"key": wallet_key(user["company_id"])},
        {"$set": {"key": wallet_key(user["company_id"]), "company_id": user["company_id"],
                  "saldo_awal": body.saldo_awal, "saldo_sekarang": body.saldo_awal, "updated_at": now_iso()}},
        upsert=True,
    )
    await audit(user, "set_saldo_awal", "petty_cash", "wallet", {"old": old, "new": body.saldo_awal})
    return await get_petty_cash(user)

# -------------------- CLAIMS --------------------
async def _gen_code(prefix: str, company_id: str) -> str:
    d = datetime.now(timezone.utc)
    seq = await db.counters.find_one_and_update(
        {"key": f"{company_id}:{prefix}-{d.year}{d.month:02d}"},
        {"$inc": {"n": 1}}, upsert=True, return_document=True,
    )
    n = seq.get("n", 1) if seq else 1
    return f"{prefix}-{d.year}{d.month:02d}-{n:04d}"

async def _claim_to_public(c):
    c = {k: v for k, v in c.items() if k != "_id"}
    fids = list((c.get("receipt_ids") or []) + (c.get("transfer_proof_ids") or []))
    if fids:
        files = await db.files.find({"id": {"$in": fids}}, {"_id": 0, "storage_path": 0}).to_list(50)
        fmap = {f["id"]: f for f in files}
        c["receipts"] = [fmap.get(i) for i in (c.get("receipt_ids") or []) if fmap.get(i)]
        c["transfer_proofs"] = [fmap.get(i) for i in (c.get("transfer_proof_ids") or []) if fmap.get(i)]
    else:
        c["receipts"] = []; c["transfer_proofs"] = []
    return c

def _push_tl(doc, actor, action, note=""):
    tl = doc.get("timeline") or []
    tl.append({"action": action, "actor_id": actor["id"], "actor_name": actor.get("name") or actor["username"],
               "actor_role": actor["role"], "note": note, "at": now_iso()})
    return tl

@api.post("/claims")
async def create_claim(body: ClaimCreate, user=Depends(current_user)):
    cat = await db.categories.find_one({"id": body.category_id, "company_id": user["company_id"]})
    if not cat: raise HTTPException(400, "Kategori tidak ditemukan")
    doc = {
        "id": str(uuid.uuid4()), "company_id": user["company_id"],
        "code": await _gen_code("KLM", user["company_id"]),
        "user_id": user["id"], "user_name": user.get("name") or user["username"],
        "category_id": cat["id"], "category_name": cat["name"], "category_code": cat["code"],
        "tanggal": body.tanggal, "deskripsi": body.deskripsi, "tujuan": body.tujuan or "",
        "jumlah": float(body.jumlah), "receipt_ids": body.receipt_ids, "transfer_proof_ids": [],
        "status": "DRAFT", "timeline": [], "created_at": now_iso(), "updated_at": now_iso(),
    }
    doc["timeline"] = _push_tl(doc, user, "created")
    await db.claims.insert_one(doc)
    await audit(user, "create_claim", "claim", doc["id"], {"code": doc["code"], "jumlah": doc["jumlah"]})
    return await _claim_to_public(doc)

@api.get("/claims")
async def list_claims(status: Optional[str] = None, mine: Optional[bool] = False, user=Depends(current_user)):
    q = {**cq(user)}
    if mine or user["role"] == "user": q["user_id"] = user["id"]
    if status: q["status"] = status.upper()
    docs = await db.claims.find(q).sort("created_at", -1).limit(500).to_list(500)
    return [await _claim_to_public(d) for d in docs]

@api.get("/claims/{cid}")
async def get_claim(cid: str, user=Depends(current_user)):
    c = await db.claims.find_one({"id": cid, **cq(user)})
    if not c: raise HTTPException(404, "Klaim tidak ditemukan")
    if user["role"] == "user" and c["user_id"] != user["id"]: raise HTTPException(403, "Bukan klaim Anda")
    return await _claim_to_public(c)

@api.put("/claims/{cid}")
async def update_claim(cid: str, body: ClaimCreate, user=Depends(current_user)):
    c = await db.claims.find_one({"id": cid, **cq(user)})
    if not c: raise HTTPException(404, "Klaim tidak ditemukan")
    if c["user_id"] != user["id"]: raise HTTPException(403, "Bukan klaim Anda")
    if c["status"] not in ("DRAFT", "PERLU_KOREKSI"): raise HTTPException(400, "Tidak bisa diedit")
    cat = await db.categories.find_one({"id": body.category_id, "company_id": user["company_id"]})
    if not cat: raise HTTPException(400, "Kategori tidak ditemukan")
    await db.claims.update_one({"id": cid}, {"$set": {
        "category_id": cat["id"], "category_name": cat["name"], "category_code": cat["code"],
        "tanggal": body.tanggal, "deskripsi": body.deskripsi, "tujuan": body.tujuan or "",
        "jumlah": float(body.jumlah), "receipt_ids": body.receipt_ids, "updated_at": now_iso(),
    }})
    await audit(user, "update_claim", "claim", cid)
    return await _claim_to_public(await db.claims.find_one({"id": cid}))

@api.post("/claims/{cid}/submit")
async def submit_claim(cid: str, user=Depends(current_user)):
    c = await db.claims.find_one({"id": cid, **cq(user)})
    if not c: raise HTTPException(404, "Klaim tidak ditemukan")
    if c["user_id"] != user["id"]: raise HTTPException(403, "Bukan klaim Anda")
    if c["status"] not in ("DRAFT", "PERLU_KOREKSI"): raise HTTPException(400, "Klaim sudah diajukan")
    if not c.get("receipt_ids"): raise HTTPException(400, "Bukti pembayaran wajib diunggah")
    if c.get("jumlah", 0) <= 0: raise HTTPException(400, "Jumlah harus > 0")
    tl = _push_tl(c, user, "submitted")
    await db.claims.update_one({"id": cid}, {"$set": {"status": "DIAJUKAN", "timeline": tl, "submitted_at": now_iso(), "updated_at": now_iso()}})
    await audit(user, "submit_claim", "claim", cid)
    return await _claim_to_public(await db.claims.find_one({"id": cid}))

@api.post("/claims/{cid}/verify")
async def verify_claim(cid: str, body: ClaimAction, decision: str = Query(...), user=Depends(require_roles("verifikator"))):
    c = await db.claims.find_one({"id": cid, **cq(user)})
    if not c: raise HTTPException(404, "Klaim tidak ditemukan")
    if c["status"] != "DIAJUKAN": raise HTTPException(400, "Status tidak sesuai")
    dec = decision.lower()
    mapping = {"approve": ("MENUNGGU_APPROVAL", "verified"), "correction": ("PERLU_KOREKSI", "returned_for_correction"), "reject": ("DITOLAK", "rejected_by_verifikator")}
    if dec not in mapping: raise HTTPException(400, "decision harus approve/correction/reject")
    new_status, action = mapping[dec]
    tl = _push_tl(c, user, action, body.catatan or "")
    await db.claims.update_one({"id": cid}, {"$set": {"status": new_status, "timeline": tl, "verified_at": now_iso(), "verifikator_note": body.catatan or "", "updated_at": now_iso()}})
    await audit(user, f"verify_{dec}", "claim", cid, {"note": body.catatan or ""})
    return await _claim_to_public(await db.claims.find_one({"id": cid}))

@api.post("/claims/{cid}/approve")
async def approve_claim(cid: str, body: ClaimAction, decision: str = Query(...), user=Depends(require_roles("atasan"))):
    c = await db.claims.find_one({"id": cid, **cq(user)})
    if not c: raise HTTPException(404, "Klaim tidak ditemukan")
    if c["status"] != "MENUNGGU_APPROVAL": raise HTTPException(400, "Status tidak sesuai")
    dec = decision.lower()
    mapping = {"approve": ("MENUNGGU_PEMBAYARAN", "approved_by_atasan"), "reject": ("DITOLAK", "rejected_by_atasan")}
    if dec not in mapping: raise HTTPException(400, "decision harus approve/reject")
    new_status, action = mapping[dec]
    tl = _push_tl(c, user, action, body.catatan or "")
    await db.claims.update_one({"id": cid}, {"$set": {"status": new_status, "timeline": tl, "approved_at": now_iso(), "atasan_note": body.catatan or "", "updated_at": now_iso()}})
    await audit(user, f"approve_{dec}", "claim", cid, {"note": body.catatan or ""})
    return await _claim_to_public(await db.claims.find_one({"id": cid}))

@api.post("/claims/{cid}/pay")
async def pay_claim(cid: str, body: ClaimAction, user=Depends(require_roles("verifikator"))):
    c = await db.claims.find_one({"id": cid, **cq(user)})
    if not c: raise HTTPException(404, "Klaim tidak ditemukan")
    if c["status"] != "MENUNGGU_PEMBAYARAN": raise HTTPException(400, "Belum siap dibayar")
    if not body.transfer_proof_ids: raise HTTPException(400, "Bukti transfer wajib diunggah")
    wallet = await get_petty_cash(user)
    if wallet["saldo_sekarang"] < c["jumlah"]:
        raise HTTPException(400, f"Saldo petty cash tidak cukup (Rp {wallet['saldo_sekarang']:,.0f}). Request top-up dulu.")
    tl = _push_tl(c, user, "paid", body.catatan or "")
    await db.claims.update_one({"id": cid}, {"$set": {
        "status": "DIBAYAR", "timeline": tl, "paid_at": now_iso(),
        "transfer_proof_ids": body.transfer_proof_ids, "pembayaran_note": body.catatan or "", "updated_at": now_iso(),
    }})
    await apply_petty_cash(user, -c["jumlah"], "OUT", cid, f"Pembayaran klaim {c['code']} - {c['user_name']}")
    await audit(user, "pay_claim", "claim", cid, {"jumlah": c["jumlah"]})
    return await _claim_to_public(await db.claims.find_one({"id": cid}))

@api.delete("/claims/{cid}")
async def delete_claim(cid: str, user=Depends(current_user)):
    c = await db.claims.find_one({"id": cid, **cq(user)})
    if not c: raise HTTPException(404, "Klaim tidak ditemukan")
    if c["user_id"] != user["id"] and user["role"] != "admin": raise HTTPException(403, "Bukan klaim Anda")
    if c["status"] != "DRAFT": raise HTTPException(400, "Hanya draft yang bisa dihapus")
    await db.claims.delete_one({"id": cid})
    await audit(user, "delete_claim", "claim", cid)
    return {"ok": True}

# -------------------- TOP-UP --------------------
@api.post("/topups")
async def create_topup(body: TopUpCreate, user=Depends(require_roles("verifikator"))):
    if body.jumlah <= 0: raise HTTPException(400, "Jumlah harus > 0")
    doc = {
        "id": str(uuid.uuid4()), "company_id": user["company_id"],
        "code": await _gen_code("TOP", user["company_id"]),
        "requested_by": user["id"], "requested_by_name": user.get("name") or user["username"],
        "jumlah": float(body.jumlah), "catatan": body.catatan or "", "status": "MENUNGGU_FINANCE",
        "transfer_proof_ids": [],
        "timeline": [{"action": "requested", "actor_id": user["id"], "actor_name": user.get("name"), "actor_role": user["role"], "at": now_iso(), "note": body.catatan or ""}],
        "created_at": now_iso(),
    }
    await db.topups.insert_one(doc)
    await audit(user, "create_topup", "topup", doc["id"], {"jumlah": body.jumlah})
    return {k: v for k, v in doc.items() if k != "_id"}

@api.get("/topups")
async def list_topups(user=Depends(current_user)):
    if user["role"] not in ("verifikator", "finance", "admin", "auditor"): raise HTTPException(403, "Role tidak diizinkan")
    return await db.topups.find(cq(user), {"_id": 0}).sort("created_at", -1).to_list(200)

@api.post("/topups/{tid}/approve")
async def approve_topup(tid: str, body: TopUpApprove, user=Depends(require_roles("finance"))):
    if not body.transfer_proof_ids: raise HTTPException(400, "Bukti transfer wajib diunggah")
    t = await db.topups.find_one({"id": tid, **cq(user)})
    if not t: raise HTTPException(404, "Top-up tidak ditemukan")
    if t["status"] != "MENUNGGU_FINANCE": raise HTTPException(400, "Status tidak sesuai")
    tl = t.get("timeline", []) + [{"action": "approved", "actor_id": user["id"], "actor_name": user.get("name"), "actor_role": user["role"], "at": now_iso(), "note": body.catatan or ""}]
    await db.topups.update_one({"id": tid}, {"$set": {"status": "SELESAI", "timeline": tl, "transfer_proof_ids": body.transfer_proof_ids, "approved_at": now_iso()}})
    await apply_petty_cash(user, t["jumlah"], "IN", tid, f"Top-up {t['code']} oleh Finance")
    await audit(user, "approve_topup", "topup", tid, {"jumlah": t["jumlah"]})
    return await db.topups.find_one({"id": tid}, {"_id": 0})

@api.post("/topups/{tid}/reject")
async def reject_topup(tid: str, body: TopUpApprove, user=Depends(require_roles("finance"))):
    t = await db.topups.find_one({"id": tid, **cq(user)})
    if not t or t["status"] != "MENUNGGU_FINANCE": raise HTTPException(400, "Status tidak sesuai")
    tl = t.get("timeline", []) + [{"action": "rejected", "actor_id": user["id"], "actor_name": user.get("name"), "actor_role": user["role"], "at": now_iso(), "note": body.catatan or ""}]
    await db.topups.update_one({"id": tid}, {"$set": {"status": "DITOLAK", "timeline": tl, "rejected_at": now_iso()}})
    await audit(user, "reject_topup", "topup", tid)
    return await db.topups.find_one({"id": tid}, {"_id": 0})

# -------------------- CASH ADVANCE --------------------
async def _ca_to_public(ca):
    ca = {k: v for k, v in ca.items() if k != "_id"}
    fids = list((ca.get("transfer_proof_ids") or []) + (ca.get("receipt_ids") or []) + (ca.get("settle_proof_ids") or []))
    fmap = {}
    if fids:
        files = await db.files.find({"id": {"$in": fids}}, {"_id": 0, "storage_path": 0}).to_list(50)
        fmap = {f["id"]: f for f in files}
    ca["transfer_proofs"] = [fmap.get(i) for i in (ca.get("transfer_proof_ids") or []) if fmap.get(i)]
    ca["receipts"] = [fmap.get(i) for i in (ca.get("receipt_ids") or []) if fmap.get(i)]
    ca["settle_proofs"] = [fmap.get(i) for i in (ca.get("settle_proof_ids") or []) if fmap.get(i)]
    return ca

@api.post("/cash-advances")
async def ca_create(body: CashAdvanceCreate, user=Depends(current_user)):
    cat = await db.categories.find_one({"id": body.category_id, "company_id": user["company_id"]})
    if not cat: raise HTTPException(400, "Kategori tidak ditemukan")
    if body.jumlah_um <= 0: raise HTTPException(400, "Jumlah UM harus > 0")
    doc = {
        "id": str(uuid.uuid4()), "company_id": user["company_id"],
        "code": await _gen_code("UM", user["company_id"]),
        "user_id": user["id"], "user_name": user.get("name") or user["username"],
        "category_id": cat["id"], "category_name": cat["name"], "category_code": cat["code"],
        "tanggal": body.tanggal, "deskripsi": body.deskripsi, "tujuan": body.tujuan or "",
        "jumlah_um": float(body.jumlah_um), "jumlah_aktual": None, "selisih": None,
        "status": "DRAFT_UM", "transfer_proof_ids": [], "receipt_ids": [], "settle_proof_ids": [],
        "timeline": [], "created_at": now_iso(), "updated_at": now_iso(),
    }
    doc["timeline"] = _push_tl(doc, user, "created")
    await db.cash_advances.insert_one(doc)
    await audit(user, "create_cash_advance", "cash_advance", doc["id"], {"code": doc["code"], "jumlah": doc["jumlah_um"]})
    return await _ca_to_public(doc)

@api.get("/cash-advances")
async def ca_list(status: Optional[str] = None, mine: Optional[bool] = False, user=Depends(current_user)):
    q = {**cq(user)}
    if mine or user["role"] == "user": q["user_id"] = user["id"]
    if status: q["status"] = status.upper()
    docs = await db.cash_advances.find(q).sort("created_at", -1).limit(500).to_list(500)
    return [await _ca_to_public(d) for d in docs]

@api.get("/cash-advances/{cid}")
async def ca_get(cid: str, user=Depends(current_user)):
    ca = await db.cash_advances.find_one({"id": cid, **cq(user)})
    if not ca: raise HTTPException(404, "Tidak ditemukan")
    if user["role"] == "user" and ca["user_id"] != user["id"]: raise HTTPException(403, "Bukan milik Anda")
    return await _ca_to_public(ca)

@api.put("/cash-advances/{cid}")
async def ca_update(cid: str, body: CashAdvanceCreate, user=Depends(current_user)):
    ca = await db.cash_advances.find_one({"id": cid, **cq(user)})
    if not ca: raise HTTPException(404, "Tidak ditemukan")
    if ca["user_id"] != user["id"]: raise HTTPException(403, "Bukan milik Anda")
    if ca["status"] not in ("DRAFT_UM", "PERLU_KOREKSI_UM"): raise HTTPException(400, "Tidak bisa diedit")
    cat = await db.categories.find_one({"id": body.category_id, "company_id": user["company_id"]})
    if not cat: raise HTTPException(400, "Kategori tidak ditemukan")
    await db.cash_advances.update_one({"id": cid}, {"$set": {
        "category_id": cat["id"], "category_name": cat["name"], "category_code": cat["code"],
        "tanggal": body.tanggal, "deskripsi": body.deskripsi, "tujuan": body.tujuan or "",
        "jumlah_um": float(body.jumlah_um), "updated_at": now_iso(),
    }})
    await audit(user, "update_cash_advance", "cash_advance", cid)
    return await _ca_to_public(await db.cash_advances.find_one({"id": cid}))

@api.post("/cash-advances/{cid}/submit")
async def ca_submit(cid: str, user=Depends(current_user)):
    ca = await db.cash_advances.find_one({"id": cid, **cq(user)})
    if not ca: raise HTTPException(404, "Tidak ditemukan")
    if ca["user_id"] != user["id"]: raise HTTPException(403, "Bukan milik Anda")
    if ca["status"] not in ("DRAFT_UM", "PERLU_KOREKSI_UM"): raise HTTPException(400, "Status tidak sesuai")
    tl = _push_tl(ca, user, "submitted")
    await db.cash_advances.update_one({"id": cid}, {"$set": {"status": "MENUNGGU_VERIFIKASI_UM", "timeline": tl, "submitted_at": now_iso(), "updated_at": now_iso()}})
    await audit(user, "submit_cash_advance", "cash_advance", cid)
    return await _ca_to_public(await db.cash_advances.find_one({"id": cid}))

@api.post("/cash-advances/{cid}/verify")
async def ca_verify(cid: str, body: CashAdvanceAction, decision: str = Query(...), user=Depends(require_roles("verifikator"))):
    ca = await db.cash_advances.find_one({"id": cid, **cq(user)})
    if not ca: raise HTTPException(404, "Tidak ditemukan")
    if ca["status"] != "MENUNGGU_VERIFIKASI_UM": raise HTTPException(400, "Status tidak sesuai")
    dec = decision.lower()
    mapping = {"approve": ("MENUNGGU_APPROVAL_UM", "verified"), "correction": ("PERLU_KOREKSI_UM", "returned_for_correction"), "reject": ("DITOLAK_UM", "rejected_by_verifikator")}
    if dec not in mapping: raise HTTPException(400, "decision harus approve/correction/reject")
    ns, action = mapping[dec]
    tl = _push_tl(ca, user, action, body.catatan or "")
    await db.cash_advances.update_one({"id": cid}, {"$set": {"status": ns, "timeline": tl, "verifikator_note": body.catatan or "", "verified_at": now_iso(), "updated_at": now_iso()}})
    await audit(user, f"ca_verify_{dec}", "cash_advance", cid)
    return await _ca_to_public(await db.cash_advances.find_one({"id": cid}))

@api.post("/cash-advances/{cid}/approve")
async def ca_approve(cid: str, body: CashAdvanceAction, decision: str = Query(...), user=Depends(require_roles("atasan"))):
    ca = await db.cash_advances.find_one({"id": cid, **cq(user)})
    if not ca: raise HTTPException(404, "Tidak ditemukan")
    if ca["status"] != "MENUNGGU_APPROVAL_UM": raise HTTPException(400, "Status tidak sesuai")
    dec = decision.lower()
    mapping = {"approve": ("MENUNGGU_TRANSFER_UM", "approved_by_atasan"), "reject": ("DITOLAK_UM", "rejected_by_atasan")}
    if dec not in mapping: raise HTTPException(400, "decision harus approve/reject")
    ns, action = mapping[dec]
    tl = _push_tl(ca, user, action, body.catatan or "")
    await db.cash_advances.update_one({"id": cid}, {"$set": {"status": ns, "timeline": tl, "atasan_note": body.catatan or "", "approved_at": now_iso(), "updated_at": now_iso()}})
    await audit(user, f"ca_approve_{dec}", "cash_advance", cid)
    return await _ca_to_public(await db.cash_advances.find_one({"id": cid}))

@api.post("/cash-advances/{cid}/transfer")
async def ca_transfer(cid: str, body: CashAdvanceAction, user=Depends(require_roles("verifikator"))):
    ca = await db.cash_advances.find_one({"id": cid, **cq(user)})
    if not ca: raise HTTPException(404, "Tidak ditemukan")
    if ca["status"] != "MENUNGGU_TRANSFER_UM": raise HTTPException(400, "Status tidak sesuai")
    if not body.transfer_proof_ids: raise HTTPException(400, "Bukti transfer wajib diunggah")
    wallet = await get_petty_cash(user)
    if wallet["saldo_sekarang"] < ca["jumlah_um"]:
        raise HTTPException(400, f"Saldo petty cash tidak cukup (Rp {wallet['saldo_sekarang']:,.0f}).")
    tl = _push_tl(ca, user, "transferred", body.catatan or "")
    await db.cash_advances.update_one({"id": cid}, {"$set": {
        "status": "MENUNGGU_BUKTI", "timeline": tl, "transfer_proof_ids": body.transfer_proof_ids,
        "transfer_note": body.catatan or "", "transferred_at": now_iso(), "updated_at": now_iso(),
    }})
    await apply_petty_cash(user, -ca["jumlah_um"], "OUT", cid, f"Transfer Uang Muka {ca['code']} ke {ca['user_name']}")
    await audit(user, "ca_transfer", "cash_advance", cid, {"jumlah": ca["jumlah_um"]})
    return await _ca_to_public(await db.cash_advances.find_one({"id": cid}))

@api.post("/cash-advances/{cid}/realize")
async def ca_realize(cid: str, body: CashAdvanceRealize, user=Depends(current_user)):
    ca = await db.cash_advances.find_one({"id": cid, **cq(user)})
    if not ca: raise HTTPException(404, "Tidak ditemukan")
    if ca["user_id"] != user["id"]: raise HTTPException(403, "Bukan milik Anda")
    if ca["status"] != "MENUNGGU_BUKTI": raise HTTPException(400, "Status tidak sesuai")
    if not body.receipt_ids: raise HTTPException(400, "Bukti wajib diunggah")
    if body.jumlah_aktual < 0: raise HTTPException(400, "Jumlah aktual tidak valid")
    selisih = ca["jumlah_um"] - float(body.jumlah_aktual)
    tl = _push_tl(ca, user, "realized", body.catatan or "")
    await db.cash_advances.update_one({"id": cid}, {"$set": {
        "status": "MENUNGGU_KONFIRMASI_UM", "timeline": tl,
        "jumlah_aktual": float(body.jumlah_aktual), "selisih": selisih,
        "receipt_ids": body.receipt_ids, "settle_proof_ids": body.settle_proof_ids or [],
        "realize_note": body.catatan or "", "realized_at": now_iso(), "updated_at": now_iso(),
    }})
    await audit(user, "ca_realize", "cash_advance", cid, {"jumlah_aktual": body.jumlah_aktual, "selisih": selisih})
    return await _ca_to_public(await db.cash_advances.find_one({"id": cid}))

@api.post("/cash-advances/{cid}/confirm")
async def ca_confirm(cid: str, body: CashAdvanceAction, user=Depends(require_roles("verifikator"))):
    ca = await db.cash_advances.find_one({"id": cid, **cq(user)})
    if not ca: raise HTTPException(404, "Tidak ditemukan")
    if ca["status"] != "MENUNGGU_KONFIRMASI_UM": raise HTTPException(400, "Status tidak sesuai")
    selisih = ca.get("selisih", 0) or 0
    if abs(selisih) > 0.01:
        if selisih > 0:
            await apply_petty_cash(user, selisih, "IN", cid, f"Pengembalian sisa UM {ca['code']} dari {ca['user_name']}")
        else:
            wallet = await get_petty_cash(user)
            if wallet["saldo_sekarang"] < abs(selisih):
                raise HTTPException(400, f"Saldo tidak cukup untuk bayar kekurangan (butuh Rp {abs(selisih):,.0f}).")
            await apply_petty_cash(user, selisih, "OUT", cid, f"Tambahan realisasi UM {ca['code']} untuk {ca['user_name']}")
    tl = _push_tl(ca, user, "confirmed_settlement", body.catatan or "")
    await db.cash_advances.update_one({"id": cid}, {"$set": {"status": "SELESAI_UM", "timeline": tl, "confirm_note": body.catatan or "", "confirmed_at": now_iso(), "updated_at": now_iso()}})
    await audit(user, "ca_confirm", "cash_advance", cid, {"selisih": selisih})
    return await _ca_to_public(await db.cash_advances.find_one({"id": cid}))

@api.delete("/cash-advances/{cid}")
async def ca_delete(cid: str, user=Depends(current_user)):
    ca = await db.cash_advances.find_one({"id": cid, **cq(user)})
    if not ca: raise HTTPException(404, "Tidak ditemukan")
    if ca["user_id"] != user["id"] and user["role"] != "admin": raise HTTPException(403, "Bukan milik Anda")
    if ca["status"] != "DRAFT_UM": raise HTTPException(400, "Hanya draft yang bisa dihapus")
    await db.cash_advances.delete_one({"id": cid})
    await audit(user, "delete_cash_advance", "cash_advance", cid)
    return {"ok": True}

# -------------------- DASHBOARD --------------------
@api.get("/dashboard")
async def dashboard(user=Depends(current_user)):
    role = user["role"]
    wallet = await get_petty_cash(user)
    counts = {}
    if role in ("verifikator", "admin", "auditor"):
        counts["verifikasi"] = await db.claims.count_documents({**cq(user), "status": "DIAJUKAN"})
        counts["pembayaran"] = await db.claims.count_documents({**cq(user), "status": "MENUNGGU_PEMBAYARAN"})
        counts["um_verifikasi"] = await db.cash_advances.count_documents({**cq(user), "status": "MENUNGGU_VERIFIKASI_UM"})
        counts["um_transfer"] = await db.cash_advances.count_documents({**cq(user), "status": "MENUNGGU_TRANSFER_UM"})
        counts["um_konfirmasi"] = await db.cash_advances.count_documents({**cq(user), "status": "MENUNGGU_KONFIRMASI_UM"})
    if role in ("atasan", "admin", "auditor"):
        counts["approval"] = await db.claims.count_documents({**cq(user), "status": "MENUNGGU_APPROVAL"})
        counts["um_approval"] = await db.cash_advances.count_documents({**cq(user), "status": "MENUNGGU_APPROVAL_UM"})
    if role in ("finance", "admin", "auditor"):
        counts["topup"] = await db.topups.count_documents({**cq(user), "status": "MENUNGGU_FINANCE"})
    if role == "user":
        base = {**cq(user), "user_id": user["id"]}
        counts["klaim_saya"] = await db.claims.count_documents(base)
        counts["perlu_koreksi"] = await db.claims.count_documents({**base, "status": "PERLU_KOREKSI"})
        counts["diproses"] = await db.claims.count_documents({**base, "status": {"$in": ["DIAJUKAN", "MENUNGGU_APPROVAL", "MENUNGGU_PEMBAYARAN"]}})
        counts["selesai"] = await db.claims.count_documents({**base, "status": "DIBAYAR"})
        counts["um_perlu_bukti"] = await db.cash_advances.count_documents({**base, "status": "MENUNGGU_BUKTI"})
        counts["um_perlu_koreksi"] = await db.cash_advances.count_documents({**base, "status": "PERLU_KOREKSI_UM"})

    total_claims = await db.claims.count_documents(cq(user))
    total_paid = 0
    async for c in db.claims.find({**cq(user), "status": "DIBAYAR"}, {"jumlah": 1}):
        total_paid += c.get("jumlah", 0)
    total_pending = 0
    async for c in db.claims.find({**cq(user), "status": {"$in": ["DIAJUKAN", "MENUNGGU_APPROVAL", "MENUNGGU_PEMBAYARAN"]}}, {"jumlah": 1}):
        total_pending += c.get("jumlah", 0)

    today = datetime.now(timezone.utc).date()
    trend_map = {(today - timedelta(days=i)).isoformat(): 0 for i in range(29, -1, -1)}
    async for c in db.claims.find({**cq(user), "status": "DIBAYAR", "paid_at": {"$exists": True}}, {"paid_at": 1, "jumlah": 1}):
        try:
            d = c["paid_at"][:10]
            if d in trend_map: trend_map[d] += c.get("jumlah", 0)
        except Exception: pass
    trend = [{"date": d, "value": v} for d, v in trend_map.items()]

    cat_totals = {}
    cutoff = (today - timedelta(days=60)).isoformat()
    async for c in db.claims.find({**cq(user), "status": "DIBAYAR", "paid_at": {"$gte": cutoff}}, {"category_name": 1, "jumlah": 1}):
        k = c.get("category_name") or "Lain-lain"
        cat_totals[k] = cat_totals.get(k, 0) + c.get("jumlah", 0)
    top_categories = sorted([{"name": k, "value": v} for k, v in cat_totals.items()], key=lambda x: -x["value"])[:8]

    recent = await db.claims.find(cq(user), {"_id": 0}).sort("created_at", -1).limit(8).to_list(8)

    return {
        "wallet": wallet, "counts": counts,
        "kpi": {"total_claims": total_claims, "total_paid": total_paid, "total_pending": total_pending},
        "trend": trend, "top_categories": top_categories,
        "recent": [await _claim_to_public(c) for c in recent],
    }

@api.get("/reconciliation")
async def reconciliation(user=Depends(current_user)):
    wallet = await get_petty_cash(user)
    total_in = 0; total_out = 0
    async for t in db.petty_cash_tx.find(cq(user), {"delta": 1}):
        if t.get("delta", 0) < 0: total_out += abs(t.get("delta", 0))
        else: total_in += t.get("delta", 0)
    expected = wallet["saldo_awal"] + total_in - total_out
    tx_count = await db.petty_cash_tx.count_documents(cq(user))
    return {"saldo_awal": wallet["saldo_awal"], "saldo_sekarang": wallet["saldo_sekarang"],
            "total_in": total_in, "total_out": total_out, "expected_saldo": expected,
            "selisih": wallet["saldo_sekarang"] - expected,
            "balanced": abs(wallet["saldo_sekarang"] - expected) < 0.01, "tx_count": tx_count}

@api.get("/audit-trail")
async def audit_trail(limit: int = 200, user=Depends(require_roles("admin", "auditor"))):
    return await db.audit.find(cq(user), {"_id": 0}).sort("timestamp", -1).limit(limit).to_list(limit)

@api.get("/reports/claims")
async def report_claims(from_date: Optional[str] = None, to_date: Optional[str] = None,
                        status: Optional[str] = None, category_id: Optional[str] = None,
                        user=Depends(current_user)):
    q = {**cq(user)}
    if user["role"] == "user": q["user_id"] = user["id"]
    if status: q["status"] = status.upper()
    if category_id: q["category_id"] = category_id
    if from_date: q["tanggal"] = {**q.get("tanggal", {}), "$gte": from_date}
    if to_date: q["tanggal"] = {**q.get("tanggal", {}), "$lte": to_date}
    return await db.claims.find(q, {"_id": 0, "timeline": 0, "receipt_ids": 0, "transfer_proof_ids": 0}).sort("created_at", -1).to_list(2000)

# -------------------- SETUP / BOOTSTRAP --------------------
DEFAULT_COMPANIES = [
    {"code": "LYRA", "name": "Lyra Akrelux"},
    {"code": "SKP",  "name": "Sunda Kelapa Pustaka"},
]
DEFAULT_CATEGORIES = [
    {"code": "TOL", "name": "Karcis Tol", "icon": "Ticket"},
    {"code": "BBM", "name": "BBM / Bensin", "icon": "GasPump"},
    {"code": "ATK", "name": "ATK (Alat Tulis Kantor)", "icon": "PencilSimple"},
    {"code": "CLN", "name": "Alat Kebersihan", "icon": "Broom"},
    {"code": "KON", "name": "Konsumsi Kantor", "icon": "Coffee"},
]

async def _seed_company_defaults(company_id: str):
    for c in DEFAULT_CATEGORIES:
        existing = await db.categories.find_one({"code": c["code"], "company_id": company_id})
        if not existing:
            await db.categories.insert_one({"id": str(uuid.uuid4()), "company_id": company_id, **c, "active": True, "created_at": now_iso()})
    if not await db.petty_cash.find_one({"key": wallet_key(company_id)}):
        await db.petty_cash.insert_one({"key": wallet_key(company_id), "company_id": company_id,
                                        "saldo_awal": 5000000, "saldo_sekarang": 5000000, "updated_at": now_iso()})

@api.get("/setup/status")
async def setup_status():
    companies = await db.companies.find({}, {"_id": 0}).to_list(50)
    admins_by_company = {}
    for c in companies:
        admin = await db.users.find_one({"role": "admin", "company_id": c["id"]})
        admins_by_company[c["id"]] = bool(admin)
    return {"companies_exists": len(companies) > 0, "companies": companies, "admin_exists_by_company": admins_by_company}

@api.post("/setup/init")
async def setup_init(company_id: Optional[str] = None):
    """Init tenant: pastikan 2 perusahaan ada. Kalau company_id diberikan, buat admin awal utk perusahaan itu."""
    # Ensure companies exist
    for c in DEFAULT_COMPANIES:
        existing = await db.companies.find_one({"code": c["code"]})
        if not existing:
            comp_id = str(uuid.uuid4())
            await db.companies.insert_one({"id": comp_id, **c, "active": True, "created_at": now_iso()})
            await _seed_company_defaults(comp_id)

    # Attach legacy admin (no company_id) to Lyra
    lyra = await db.companies.find_one({"code": "LYRA"})
    if lyra:
        await db.users.update_many({"role": "admin", "company_id": {"$exists": False}},
                                    {"$set": {"company_id": lyra["id"]}})
        await _seed_company_defaults(lyra["id"])
    skp = await db.companies.find_one({"code": "SKP"})
    if skp: await _seed_company_defaults(skp["id"])

    if company_id:
        target = await db.companies.find_one({"id": company_id})
        if not target: raise HTTPException(404, "Perusahaan tidak ditemukan")
        existing_admin = await db.users.find_one({"role": "admin", "company_id": company_id})
        if existing_admin:
            raise HTTPException(400, "Admin sudah terdaftar untuk perusahaan ini")
        admin_id = str(uuid.uuid4())
        await db.users.insert_one({
            "id": admin_id, "company_id": company_id,
            "username": "admin", "name": f"Administrator {target['name']}",
            "email": f"admin@{target['code'].lower()}.local", "role": "admin", "active": True,
            "password_hash": hash_pw("admin123"), "created_at": now_iso(),
        })
        await _seed_company_defaults(company_id)
        return {"ok": True, "company": target["name"], "username": "admin", "password": "admin123"}

    return {"ok": True, "companies": len(DEFAULT_COMPANIES)}

@api.post("/setup/reset-testing")
async def reset_testing_data():
    """Hapus semua data testing (klaim, UM, top-up, user selain admin, kategori custom). Reset petty cash."""
    await db.claims.delete_many({})
    await db.cash_advances.delete_many({})
    await db.topups.delete_many({})
    await db.petty_cash_tx.delete_many({})
    await db.audit.delete_many({})
    await db.counters.delete_many({})
    await db.files.delete_many({})
    await db.categories.delete_many({})
    await db.users.delete_many({"role": {"$ne": "admin"}})
    await db.petty_cash.delete_many({})
    # Re-seed defaults for each company
    for c in await db.companies.find({}, {"_id": 0}).to_list(50):
        await _seed_company_defaults(c["id"])
    return {"ok": True}

@api.get("/")
async def root():
    return {"service": "eKlaim Multi-Tenant API", "status": "ok"}

app.include_router(api)
app.add_middleware(CORSMiddleware, allow_credentials=True,
                   allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
                   allow_methods=["*"], allow_headers=["*"])

@app.on_event("startup")
async def _startup():
    try:
        init_storage()
        # Auto-ensure companies exist on startup
        for c in DEFAULT_COMPANIES:
            existing = await db.companies.find_one({"code": c["code"]})
            if not existing:
                comp_id = str(uuid.uuid4())
                await db.companies.insert_one({"id": comp_id, **c, "active": True, "created_at": now_iso()})
                await _seed_company_defaults(comp_id)
        # Attach legacy admin to Lyra if none set
        lyra = await db.companies.find_one({"code": "LYRA"})
        if lyra:
            await db.users.update_many({"role": "admin", "company_id": {"$exists": False}},
                                        {"$set": {"company_id": lyra["id"]}})
        logger.info("Startup init OK")
    except Exception as e:
        logger.error(f"Startup init failed: {e}")

@app.on_event("shutdown")
async def _shutdown():
    client.close()
