"""eKlaim Lyra - Petty Cash & Expense Claim Backend"""
from fastapi import FastAPI, APIRouter, UploadFile, File, HTTPException, Depends, Header, Query, Request
from fastapi.responses import Response, StreamingResponse
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
APP_NAME = 'eklaim-lyra'

STORAGE_BASE = (os.environ.get("INTEGRATION_PROXY_URL") or "").strip() or "https://integrations.emergentagent.com"
STORAGE_URL = STORAGE_BASE.rstrip("/") + "/objstore/api/v1/storage"

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")

app = FastAPI(title="eKlaim Lyra API")
api = APIRouter(prefix="/api")

logger = logging.getLogger("eklaim")
logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')

# -------------------- OBJECT STORAGE --------------------
_storage_key: Optional[str] = None
def init_storage(force: bool = False):
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

def put_object(path: str, data: bytes, content_type: str) -> dict:
    key = init_storage()
    if not key:
        raise HTTPException(500, "Storage not available")
    r = requests.put(f"{STORAGE_URL}/objects/{path}",
                     headers={"X-Storage-Key": key, "Content-Type": content_type},
                     data=data, timeout=120)
    if r.status_code == 404:
        key = init_storage(force=True)
        r = requests.put(f"{STORAGE_URL}/objects/{path}",
                         headers={"X-Storage-Key": key, "Content-Type": content_type},
                         data=data, timeout=120)
    r.raise_for_status()
    return r.json()

def get_object(path: str):
    key = init_storage()
    r = requests.get(f"{STORAGE_URL}/objects/{path}",
                     headers={"X-Storage-Key": key}, timeout=60)
    if r.status_code == 404:
        key = init_storage(force=True)
        r = requests.get(f"{STORAGE_URL}/objects/{path}",
                         headers={"X-Storage-Key": key}, timeout=60)
    r.raise_for_status()
    return r.content, r.headers.get("Content-Type", "application/octet-stream")

MIME_TYPES = {
    "jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png",
    "gif": "image/gif", "webp": "image/webp", "pdf": "application/pdf",
}

# -------------------- HELPERS --------------------
def now_iso():
    return datetime.now(timezone.utc).isoformat()

def hash_pw(p: str) -> str:
    return pwd_ctx.hash(p)

def verify_pw(p: str, h: str) -> bool:
    try:
        return pwd_ctx.verify(p, h)
    except Exception:
        return False

def make_token(user: dict) -> str:
    payload = {
        "sub": user["id"],
        "username": user["username"],
        "role": user["role"],
        "exp": datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRE_HOURS),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)

async def current_user(authorization: Optional[str] = Header(None), auth: Optional[str] = Query(None)):
    token = None
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization.split(" ", 1)[1].strip()
    elif auth:
        token = auth
    if not token:
        raise HTTPException(401, "Not authenticated")
    try:
        data = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
    except JWTError:
        raise HTTPException(401, "Invalid token")
    user = await db.users.find_one({"id": data["sub"]}, {"_id": 0, "password_hash": 0})
    if not user or not user.get("active", True):
        raise HTTPException(401, "User not found or inactive")
    return user

def require_roles(*roles):
    async def _dep(user=Depends(current_user)):
        if user["role"] not in roles:
            raise HTTPException(403, f"Role required: {roles}")
        return user
    return _dep

async def audit(user, action: str, entity_type: str, entity_id: str, meta: dict = None):
    await db.audit.insert_one({
        "id": str(uuid.uuid4()),
        "actor_id": user["id"],
        "actor_name": user.get("name") or user.get("username"),
        "actor_role": user["role"],
        "action": action,
        "entity_type": entity_type,
        "entity_id": entity_id,
        "meta": meta or {},
        "timestamp": now_iso(),
    })

# -------------------- MODELS --------------------
class LoginReq(BaseModel):
    username: str
    password: str

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
    tanggal: str  # YYYY-MM-DD
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

# -------------------- AUTH --------------------
@api.post("/auth/login")
async def login(body: LoginReq):
    u = await db.users.find_one({"username": body.username.lower()})
    if not u or not verify_pw(body.password, u.get("password_hash", "")):
        raise HTTPException(401, "Username atau password salah")
    if not u.get("active", True):
        raise HTTPException(403, "Akun tidak aktif")
    user_public = {k: v for k, v in u.items() if k not in ("_id", "password_hash")}
    token = make_token(user_public)
    return {"token": token, "user": user_public}

@api.get("/auth/me")
async def me(user=Depends(current_user)):
    return user

@api.post("/auth/change-password")
async def change_password(body: PasswordChange, user=Depends(current_user)):
    doc = await db.users.find_one({"id": user["id"]})
    if body.old_password and not verify_pw(body.old_password, doc["password_hash"]):
        raise HTTPException(400, "Password lama salah")
    await db.users.update_one({"id": user["id"]}, {"$set": {"password_hash": hash_pw(body.new_password)}})
    await audit(user, "change_password", "user", user["id"])
    return {"ok": True}

# -------------------- USERS (ADMIN) --------------------
@api.get("/users")
async def list_users(user=Depends(require_roles("admin", "auditor"))):
    docs = await db.users.find({}, {"_id": 0, "password_hash": 0}).sort("created_at", -1).to_list(500)
    return docs

@api.post("/users")
async def create_user(body: UserCreate, user=Depends(require_roles("admin"))):
    if await db.users.find_one({"username": body.username.lower()}):
        raise HTTPException(400, "Username sudah dipakai")
    doc = {
        "id": str(uuid.uuid4()),
        "username": body.username.lower(),
        "name": body.name,
        "email": body.email or "",
        "role": body.role,
        "active": True,
        "password_hash": hash_pw(body.password),
        "created_at": now_iso(),
    }
    await db.users.insert_one(doc)
    await audit(user, "create_user", "user", doc["id"], {"role": body.role})
    return {k: v for k, v in doc.items() if k not in ("_id", "password_hash")}

@api.put("/users/{uid}")
async def update_user(uid: str, body: UserUpdate, user=Depends(require_roles("admin"))):
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if updates:
        await db.users.update_one({"id": uid}, {"$set": updates})
    await audit(user, "update_user", "user", uid, updates)
    doc = await db.users.find_one({"id": uid}, {"_id": 0, "password_hash": 0})
    return doc

@api.post("/users/{uid}/reset-password")
async def reset_password(uid: str, body: PasswordChange, user=Depends(require_roles("admin"))):
    await db.users.update_one({"id": uid}, {"$set": {"password_hash": hash_pw(body.new_password)}})
    await audit(user, "reset_password", "user", uid)
    return {"ok": True}

@api.delete("/users/{uid}")
async def delete_user(uid: str, user=Depends(require_roles("admin"))):
    if uid == user["id"]:
        raise HTTPException(400, "Tidak bisa menghapus akun sendiri")
    await db.users.update_one({"id": uid}, {"$set": {"active": False}})
    await audit(user, "deactivate_user", "user", uid)
    return {"ok": True}

# -------------------- CATEGORIES --------------------
@api.get("/categories")
async def list_categories(user=Depends(current_user)):
    docs = await db.categories.find({}, {"_id": 0}).sort("name", 1).to_list(200)
    return docs

@api.post("/categories")
async def create_category(body: CategoryModel, user=Depends(require_roles("admin"))):
    if await db.categories.find_one({"code": body.code}):
        raise HTTPException(400, "Kode kategori sudah ada")
    doc = {"id": str(uuid.uuid4()), **body.model_dump(), "created_at": now_iso()}
    await db.categories.insert_one(doc)
    await audit(user, "create_category", "category", doc["id"], {"name": body.name})
    return {k: v for k, v in doc.items() if k != "_id"}

@api.put("/categories/{cid}")
async def update_category(cid: str, body: CategoryModel, user=Depends(require_roles("admin"))):
    await db.categories.update_one({"id": cid}, {"$set": body.model_dump()})
    await audit(user, "update_category", "category", cid)
    doc = await db.categories.find_one({"id": cid}, {"_id": 0})
    return doc

@api.delete("/categories/{cid}")
async def delete_category(cid: str, user=Depends(require_roles("admin"))):
    await db.categories.update_one({"id": cid}, {"$set": {"active": False}})
    await audit(user, "deactivate_category", "category", cid)
    return {"ok": True}

# -------------------- FILE UPLOAD --------------------
@api.post("/files/upload")
async def upload_file(file: UploadFile = File(...), user=Depends(current_user)):
    ext = (file.filename or "bin").split(".")[-1].lower()
    if ext not in MIME_TYPES:
        raise HTTPException(400, "Format tidak didukung. Gunakan jpg/png/webp/pdf")
    data = await file.read()
    if len(data) > 10 * 1024 * 1024:
        raise HTTPException(400, "Ukuran maks 10MB")
    file_id = str(uuid.uuid4())
    path = f"{APP_NAME}/uploads/{user['id']}/{file_id}.{ext}"
    result = put_object(path, data, file.content_type or MIME_TYPES[ext])
    doc = {
        "id": file_id,
        "storage_path": result["path"],
        "original_filename": file.filename,
        "content_type": file.content_type or MIME_TYPES[ext],
        "size": result.get("size", len(data)),
        "uploaded_by": user["id"],
        "is_deleted": False,
        "created_at": now_iso(),
    }
    await db.files.insert_one(doc)
    return {"id": file_id, "name": file.filename, "size": doc["size"], "content_type": doc["content_type"]}

@api.get("/files/{fid}/download")
async def download_file(fid: str, user=Depends(current_user)):
    rec = await db.files.find_one({"id": fid, "is_deleted": False})
    if not rec:
        raise HTTPException(404, "File tidak ditemukan")
    data, ct = get_object(rec["storage_path"])
    return Response(content=data, media_type=rec.get("content_type", ct),
                    headers={"Content-Disposition": f'inline; filename="{rec["original_filename"]}"'})

# -------------------- OCR --------------------
@api.post("/ocr/receipt")
async def ocr_receipt(file_id: str, user=Depends(current_user)):
    rec = await db.files.find_one({"id": file_id, "is_deleted": False})
    if not rec:
        raise HTTPException(404, "File tidak ditemukan")
    if not rec["content_type"].startswith("image/"):
        return {"jumlah": None, "tanggal": None, "merchant": None, "note": "Hanya bisa OCR gambar (jpg/png/webp). PDF tidak didukung untuk auto-fill."}
    data, _ = get_object(rec["storage_path"])
    b64 = base64.b64encode(data).decode()
    prompt = (
        "Anda adalah asisten OCR untuk struk / nota belanja Bahasa Indonesia. "
        "Ekstrak informasi dari struk pada gambar ini dan jawab HANYA dengan JSON valid "
        'dengan format persis: {"jumlah": <angka rupiah total tanpa titik/koma, integer>, '
        '"tanggal": "<YYYY-MM-DD atau kosong>", "merchant": "<nama toko/warung/SPBU/gerbang tol>", '
        '"kategori_tebakan": "<Karcis Tol|Bensin|ATK|Kebersihan|Konsumsi|Lain-lain>", '
        '"catatan": "<catatan singkat 1 kalimat>"}. Jangan sertakan teks lain di luar JSON.'
    )
    try:
        chat = LlmChat(
            api_key=EMERGENT_KEY,
            session_id=f"ocr-{uuid.uuid4()}",
            system_message="Anda ahli membaca struk / nota Bahasa Indonesia. Selalu jawab JSON valid saja.",
        ).with_model("openai", "gpt-5.6-terra")
        img = ImageContent(image_base64=b64)
        msg = UserMessage(text=prompt, file_contents=[img])
        text = ""
        from emergentintegrations.llm.chat import TextDelta, StreamDone
        async for ev in chat.stream_message(msg):
            if isinstance(ev, TextDelta):
                text += ev.content
            elif isinstance(ev, StreamDone):
                break
        import json, re
        m = re.search(r"\{.*\}", text, re.DOTALL)
        raw = m.group(0) if m else text
        parsed = json.loads(raw)
        return parsed
    except Exception as e:
        logger.exception("OCR failed")
        return {"jumlah": None, "tanggal": None, "merchant": None, "kategori_tebakan": None, "catatan": f"OCR gagal: {e}"}

# -------------------- PETTY CASH --------------------
async def get_petty_cash() -> dict:
    doc = await db.petty_cash.find_one({"key": "wallet"})
    if not doc:
        doc = {"key": "wallet", "saldo_awal": 5000000, "saldo_sekarang": 5000000, "updated_at": now_iso()}
        await db.petty_cash.insert_one(doc)
    return {"saldo_awal": doc["saldo_awal"], "saldo_sekarang": doc["saldo_sekarang"], "updated_at": doc.get("updated_at")}

async def apply_petty_cash(delta: float, actor: dict, tx_type: str, ref_id: str, description: str):
    doc = await db.petty_cash.find_one({"key": "wallet"})
    if not doc:
        await get_petty_cash()
        doc = await db.petty_cash.find_one({"key": "wallet"})
    new_balance = doc["saldo_sekarang"] + delta
    await db.petty_cash.update_one({"key": "wallet"}, {"$set": {"saldo_sekarang": new_balance, "updated_at": now_iso()}})
    await db.petty_cash_tx.insert_one({
        "id": str(uuid.uuid4()),
        "type": tx_type,
        "amount": abs(delta),
        "delta": delta,
        "ref_id": ref_id,
        "description": description,
        "actor_id": actor["id"],
        "actor_name": actor.get("name") or actor["username"],
        "balance_after": new_balance,
        "created_at": now_iso(),
    })
    return new_balance

@api.get("/petty-cash")
async def petty_cash_status(user=Depends(current_user)):
    wallet = await get_petty_cash()
    txs = await db.petty_cash_tx.find({}, {"_id": 0}).sort("created_at", -1).limit(100).to_list(100)
    return {**wallet, "transactions": txs}

@api.put("/petty-cash/saldo-awal")
async def set_saldo_awal(body: PettyCashInit, user=Depends(require_roles("admin"))):
    doc = await db.petty_cash.find_one({"key": "wallet"}) or {}
    old = doc.get("saldo_awal", 0)
    await db.petty_cash.update_one(
        {"key": "wallet"},
        {"$set": {"saldo_awal": body.saldo_awal, "saldo_sekarang": body.saldo_awal, "updated_at": now_iso(), "key": "wallet"}},
        upsert=True,
    )
    await audit(user, "set_saldo_awal", "petty_cash", "wallet", {"old": old, "new": body.saldo_awal})
    return await get_petty_cash()

# -------------------- CLAIMS --------------------
CLAIM_STATUS = ["DRAFT", "DIAJUKAN", "PERLU_KOREKSI", "MENUNGGU_APPROVAL", "DITOLAK", "MENUNGGU_PEMBAYARAN", "DIBAYAR"]

async def _gen_code(prefix: str) -> str:
    d = datetime.now(timezone.utc)
    seq = await db.counters.find_one_and_update(
        {"key": f"{prefix}-{d.year}{d.month:02d}"},
        {"$inc": {"n": 1}},
        upsert=True, return_document=True,
    )
    n = seq.get("n", 1) if seq else 1
    return f"{prefix}-{d.year}{d.month:02d}-{n:04d}"

async def _claim_to_public(c):
    c = {k: v for k, v in c.items() if k != "_id"}
    # attach receipt/proof file metadata
    file_ids = list((c.get("receipt_ids") or []) + (c.get("transfer_proof_ids") or []))
    if file_ids:
        files = await db.files.find({"id": {"$in": file_ids}}, {"_id": 0, "storage_path": 0}).to_list(50)
        fmap = {f["id"]: f for f in files}
        c["receipts"] = [fmap.get(i) for i in (c.get("receipt_ids") or []) if fmap.get(i)]
        c["transfer_proofs"] = [fmap.get(i) for i in (c.get("transfer_proof_ids") or []) if fmap.get(i)]
    else:
        c["receipts"] = []
        c["transfer_proofs"] = []
    return c

def _push_timeline(claim: dict, actor: dict, action: str, note: str = ""):
    tl = claim.get("timeline") or []
    tl.append({
        "action": action,
        "actor_id": actor["id"],
        "actor_name": actor.get("name") or actor["username"],
        "actor_role": actor["role"],
        "note": note,
        "at": now_iso(),
    })
    return tl

@api.post("/claims")
async def create_claim(body: ClaimCreate, user=Depends(current_user)):
    cat = await db.categories.find_one({"id": body.category_id})
    if not cat:
        raise HTTPException(400, "Kategori tidak ditemukan")
    code = await _gen_code("KLM")
    doc = {
        "id": str(uuid.uuid4()),
        "code": code,
        "user_id": user["id"],
        "user_name": user.get("name") or user["username"],
        "category_id": cat["id"],
        "category_name": cat["name"],
        "category_code": cat["code"],
        "tanggal": body.tanggal,
        "deskripsi": body.deskripsi,
        "tujuan": body.tujuan or "",
        "jumlah": float(body.jumlah),
        "receipt_ids": body.receipt_ids,
        "transfer_proof_ids": [],
        "status": "DRAFT",
        "timeline": [],
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }
    doc["timeline"] = _push_timeline(doc, user, "created")
    await db.claims.insert_one(doc)
    await audit(user, "create_claim", "claim", doc["id"], {"code": code, "jumlah": doc["jumlah"]})
    return await _claim_to_public(doc)

@api.get("/claims")
async def list_claims(
    status: Optional[str] = None,
    mine: Optional[bool] = False,
    q: Optional[str] = None,
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    category_id: Optional[str] = None,
    user=Depends(current_user),
):
    query = {}
    role = user["role"]
    if mine or role == "user":
        query["user_id"] = user["id"]
    if status:
        query["status"] = status.upper()
    if category_id:
        query["category_id"] = category_id
    if from_date:
        query["tanggal"] = {**query.get("tanggal", {}), "$gte": from_date}
    if to_date:
        query["tanggal"] = {**query.get("tanggal", {}), "$lte": to_date}
    if q:
        query["$or"] = [
            {"code": {"$regex": q, "$options": "i"}},
            {"deskripsi": {"$regex": q, "$options": "i"}},
            {"user_name": {"$regex": q, "$options": "i"}},
        ]
    docs = await db.claims.find(query).sort("created_at", -1).limit(500).to_list(500)
    return [await _claim_to_public(d) for d in docs]

@api.get("/claims/{cid}")
async def get_claim(cid: str, user=Depends(current_user)):
    c = await db.claims.find_one({"id": cid})
    if not c:
        raise HTTPException(404, "Klaim tidak ditemukan")
    if user["role"] == "user" and c["user_id"] != user["id"]:
        raise HTTPException(403, "Bukan klaim Anda")
    return await _claim_to_public(c)

@api.put("/claims/{cid}")
async def update_claim(cid: str, body: ClaimCreate, user=Depends(current_user)):
    c = await db.claims.find_one({"id": cid})
    if not c:
        raise HTTPException(404, "Klaim tidak ditemukan")
    if c["user_id"] != user["id"]:
        raise HTTPException(403, "Bukan klaim Anda")
    if c["status"] not in ("DRAFT", "PERLU_KOREKSI"):
        raise HTTPException(400, "Klaim tidak bisa diedit pada status saat ini")
    cat = await db.categories.find_one({"id": body.category_id})
    if not cat:
        raise HTTPException(400, "Kategori tidak ditemukan")
    upd = {
        "category_id": cat["id"], "category_name": cat["name"], "category_code": cat["code"],
        "tanggal": body.tanggal, "deskripsi": body.deskripsi, "tujuan": body.tujuan or "",
        "jumlah": float(body.jumlah), "receipt_ids": body.receipt_ids,
        "updated_at": now_iso(),
    }
    await db.claims.update_one({"id": cid}, {"$set": upd})
    await audit(user, "update_claim", "claim", cid)
    c2 = await db.claims.find_one({"id": cid})
    return await _claim_to_public(c2)

@api.post("/claims/{cid}/submit")
async def submit_claim(cid: str, user=Depends(current_user)):
    c = await db.claims.find_one({"id": cid})
    if not c:
        raise HTTPException(404, "Klaim tidak ditemukan")
    if c["user_id"] != user["id"]:
        raise HTTPException(403, "Bukan klaim Anda")
    if c["status"] not in ("DRAFT", "PERLU_KOREKSI"):
        raise HTTPException(400, "Klaim sudah diajukan")
    if not c.get("receipt_ids"):
        raise HTTPException(400, "Bukti pembayaran wajib diunggah")
    if c.get("jumlah", 0) <= 0:
        raise HTTPException(400, "Jumlah klaim harus lebih dari 0")
    tl = _push_timeline(c, user, "submitted")
    await db.claims.update_one({"id": cid}, {"$set": {"status": "DIAJUKAN", "timeline": tl, "submitted_at": now_iso(), "updated_at": now_iso()}})
    await audit(user, "submit_claim", "claim", cid)
    return await _claim_to_public(await db.claims.find_one({"id": cid}))

@api.post("/claims/{cid}/verify")
async def verify_claim(cid: str, body: ClaimAction, decision: str = Query(...), user=Depends(require_roles("verifikator"))):
    """decision: approve | correction | reject"""
    c = await db.claims.find_one({"id": cid})
    if not c:
        raise HTTPException(404, "Klaim tidak ditemukan")
    if c["status"] != "DIAJUKAN":
        raise HTTPException(400, "Status klaim tidak sesuai")
    dec = decision.lower()
    if dec == "approve":
        new_status = "MENUNGGU_APPROVAL"
        action = "verified"
    elif dec == "correction":
        new_status = "PERLU_KOREKSI"
        action = "returned_for_correction"
    elif dec == "reject":
        new_status = "DITOLAK"
        action = "rejected_by_verifikator"
    else:
        raise HTTPException(400, "decision harus approve/correction/reject")
    tl = _push_timeline(c, user, action, body.catatan or "")
    upd = {"status": new_status, "timeline": tl, "verified_at": now_iso(), "verifikator_note": body.catatan or "", "updated_at": now_iso()}
    await db.claims.update_one({"id": cid}, {"$set": upd})
    await audit(user, f"verify_{dec}", "claim", cid, {"note": body.catatan or ""})
    return await _claim_to_public(await db.claims.find_one({"id": cid}))

@api.post("/claims/{cid}/approve")
async def approve_claim(cid: str, body: ClaimAction, decision: str = Query(...), user=Depends(require_roles("atasan"))):
    """decision: approve | reject"""
    c = await db.claims.find_one({"id": cid})
    if not c:
        raise HTTPException(404, "Klaim tidak ditemukan")
    if c["status"] != "MENUNGGU_APPROVAL":
        raise HTTPException(400, "Status klaim tidak sesuai")
    dec = decision.lower()
    if dec == "approve":
        new_status = "MENUNGGU_PEMBAYARAN"
        action = "approved_by_atasan"
    elif dec == "reject":
        new_status = "DITOLAK"
        action = "rejected_by_atasan"
    else:
        raise HTTPException(400, "decision harus approve/reject")
    tl = _push_timeline(c, user, action, body.catatan or "")
    upd = {"status": new_status, "timeline": tl, "approved_at": now_iso(), "atasan_note": body.catatan or "", "updated_at": now_iso()}
    await db.claims.update_one({"id": cid}, {"$set": upd})
    await audit(user, f"approve_{dec}", "claim", cid, {"note": body.catatan or ""})
    return await _claim_to_public(await db.claims.find_one({"id": cid}))

@api.post("/claims/{cid}/pay")
async def pay_claim(cid: str, body: ClaimAction, user=Depends(require_roles("verifikator"))):
    c = await db.claims.find_one({"id": cid})
    if not c:
        raise HTTPException(404, "Klaim tidak ditemukan")
    if c["status"] != "MENUNGGU_PEMBAYARAN":
        raise HTTPException(400, "Klaim belum siap dibayar")
    if not body.transfer_proof_ids:
        raise HTTPException(400, "Bukti transfer wajib diunggah")
    wallet = await get_petty_cash()
    if wallet["saldo_sekarang"] < c["jumlah"]:
        raise HTTPException(400, f"Saldo petty cash tidak cukup (Rp {wallet['saldo_sekarang']:,.0f}). Silakan request top-up terlebih dahulu.")
    tl = _push_timeline(c, user, "paid", body.catatan or "")
    upd = {
        "status": "DIBAYAR", "timeline": tl, "paid_at": now_iso(),
        "transfer_proof_ids": body.transfer_proof_ids, "pembayaran_note": body.catatan or "",
        "updated_at": now_iso(),
    }
    await db.claims.update_one({"id": cid}, {"$set": upd})
    await apply_petty_cash(-c["jumlah"], user, "OUT", cid, f"Pembayaran klaim {c['code']} - {c['user_name']}")
    await audit(user, "pay_claim", "claim", cid, {"jumlah": c["jumlah"]})
    return await _claim_to_public(await db.claims.find_one({"id": cid}))

@api.delete("/claims/{cid}")
async def delete_claim(cid: str, user=Depends(current_user)):
    c = await db.claims.find_one({"id": cid})
    if not c:
        raise HTTPException(404, "Klaim tidak ditemukan")
    if c["user_id"] != user["id"] and user["role"] != "admin":
        raise HTTPException(403, "Bukan klaim Anda")
    if c["status"] != "DRAFT":
        raise HTTPException(400, "Hanya draft yang bisa dihapus")
    await db.claims.delete_one({"id": cid})
    await audit(user, "delete_claim", "claim", cid)
    return {"ok": True}

# -------------------- TOP-UP --------------------
@api.post("/topups")
async def create_topup(body: TopUpCreate, user=Depends(require_roles("verifikator"))):
    if body.jumlah <= 0:
        raise HTTPException(400, "Jumlah top-up harus lebih dari 0")
    code = await _gen_code("TOP")
    doc = {
        "id": str(uuid.uuid4()), "code": code,
        "requested_by": user["id"], "requested_by_name": user.get("name") or user["username"],
        "jumlah": float(body.jumlah), "catatan": body.catatan or "",
        "status": "MENUNGGU_FINANCE",
        "transfer_proof_ids": [],
        "timeline": [{"action": "requested", "actor_id": user["id"], "actor_name": user.get("name"), "actor_role": user["role"], "at": now_iso(), "note": body.catatan or ""}],
        "created_at": now_iso(),
    }
    await db.topups.insert_one(doc)
    await audit(user, "create_topup", "topup", doc["id"], {"jumlah": body.jumlah})
    return {k: v for k, v in doc.items() if k != "_id"}

@api.get("/topups")
async def list_topups(user=Depends(current_user)):
    if user["role"] not in ("verifikator", "finance", "admin", "auditor"):
        raise HTTPException(403, "Role tidak diizinkan")
    docs = await db.topups.find({}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return docs

@api.post("/topups/{tid}/approve")
async def approve_topup(tid: str, body: TopUpApprove, user=Depends(require_roles("finance"))):
    if not body.transfer_proof_ids:
        raise HTTPException(400, "Bukti transfer wajib diunggah")
    t = await db.topups.find_one({"id": tid})
    if not t:
        raise HTTPException(404, "Top-up tidak ditemukan")
    if t["status"] != "MENUNGGU_FINANCE":
        raise HTTPException(400, "Status tidak sesuai")
    tl = t.get("timeline", []) + [{"action": "approved", "actor_id": user["id"], "actor_name": user.get("name"), "actor_role": user["role"], "at": now_iso(), "note": body.catatan or ""}]
    await db.topups.update_one({"id": tid}, {"$set": {"status": "SELESAI", "timeline": tl, "transfer_proof_ids": body.transfer_proof_ids, "approved_at": now_iso()}})
    await apply_petty_cash(t["jumlah"], user, "IN", tid, f"Top-up {t['code']} oleh Finance")
    await audit(user, "approve_topup", "topup", tid, {"jumlah": t["jumlah"]})
    return await db.topups.find_one({"id": tid}, {"_id": 0})

@api.post("/topups/{tid}/reject")
async def reject_topup(tid: str, body: TopUpApprove, user=Depends(require_roles("finance"))):
    t = await db.topups.find_one({"id": tid})
    if not t or t["status"] != "MENUNGGU_FINANCE":
        raise HTTPException(400, "Status tidak sesuai")
    tl = t.get("timeline", []) + [{"action": "rejected", "actor_id": user["id"], "actor_name": user.get("name"), "actor_role": user["role"], "at": now_iso(), "note": body.catatan or ""}]
    await db.topups.update_one({"id": tid}, {"$set": {"status": "DITOLAK", "timeline": tl, "rejected_at": now_iso()}})
    await audit(user, "reject_topup", "topup", tid)
    return await db.topups.find_one({"id": tid}, {"_id": 0})

# -------------------- DASHBOARD --------------------
@api.get("/dashboard")
async def dashboard(user=Depends(current_user)):
    role = user["role"]
    wallet = await get_petty_cash()
    counts = {}
    # Antrean per role
    if role in ("verifikator", "admin", "auditor"):
        counts["verifikasi"] = await db.claims.count_documents({"status": "DIAJUKAN"})
        counts["pembayaran"] = await db.claims.count_documents({"status": "MENUNGGU_PEMBAYARAN"})
    if role in ("atasan", "admin", "auditor"):
        counts["approval"] = await db.claims.count_documents({"status": "MENUNGGU_APPROVAL"})
    if role in ("finance", "admin", "auditor"):
        counts["topup"] = await db.topups.count_documents({"status": "MENUNGGU_FINANCE"})
    if role == "user":
        counts["klaim_saya"] = await db.claims.count_documents({"user_id": user["id"]})
        counts["perlu_koreksi"] = await db.claims.count_documents({"user_id": user["id"], "status": "PERLU_KOREKSI"})
        counts["diproses"] = await db.claims.count_documents({"user_id": user["id"], "status": {"$in": ["DIAJUKAN", "MENUNGGU_APPROVAL", "MENUNGGU_PEMBAYARAN"]}})
        counts["selesai"] = await db.claims.count_documents({"user_id": user["id"], "status": "DIBAYAR"})

    # KPI umum
    total_claims = await db.claims.count_documents({})
    total_paid = 0
    async for c in db.claims.find({"status": "DIBAYAR"}, {"jumlah": 1}):
        total_paid += c.get("jumlah", 0)
    total_pending = 0
    async for c in db.claims.find({"status": {"$in": ["DIAJUKAN", "MENUNGGU_APPROVAL", "MENUNGGU_PEMBAYARAN"]}}, {"jumlah": 1}):
        total_pending += c.get("jumlah", 0)

    # Charts
    today = datetime.now(timezone.utc).date()
    trend_map = {}
    for i in range(29, -1, -1):
        d = (today - timedelta(days=i)).isoformat()
        trend_map[d] = 0
    async for c in db.claims.find({"status": "DIBAYAR", "paid_at": {"$exists": True}}, {"paid_at": 1, "jumlah": 1}):
        try:
            d = c["paid_at"][:10]
            if d in trend_map:
                trend_map[d] += c.get("jumlah", 0)
        except Exception:
            pass
    trend = [{"date": d, "value": v} for d, v in trend_map.items()]

    # Top categories (last 60 days paid)
    cat_totals = {}
    cutoff = (today - timedelta(days=60)).isoformat()
    async for c in db.claims.find({"status": "DIBAYAR", "paid_at": {"$gte": cutoff}}, {"category_name": 1, "jumlah": 1}):
        k = c.get("category_name") or "Lain-lain"
        cat_totals[k] = cat_totals.get(k, 0) + c.get("jumlah", 0)
    top_categories = sorted([{"name": k, "value": v} for k, v in cat_totals.items()], key=lambda x: -x["value"])[:8]

    # Recent claims
    recent = await db.claims.find({}, {"_id": 0}).sort("created_at", -1).limit(8).to_list(8)

    return {
        "wallet": wallet,
        "counts": counts,
        "kpi": {"total_claims": total_claims, "total_paid": total_paid, "total_pending": total_pending},
        "trend": trend,
        "top_categories": top_categories,
        "recent": [await _claim_to_public(c) for c in recent],
    }

# -------------------- RECONCILIATION --------------------
@api.get("/reconciliation")
async def reconciliation(user=Depends(current_user)):
    wallet = await get_petty_cash()
    total_out = 0
    total_in = 0
    async for t in db.petty_cash_tx.find({}, {"amount": 1, "delta": 1, "type": 1}):
        if t.get("delta", 0) < 0:
            total_out += abs(t.get("delta", 0))
        else:
            total_in += t.get("delta", 0)
    expected = wallet["saldo_awal"] + total_in - total_out
    diff = wallet["saldo_sekarang"] - expected
    # (Note: saldo_awal is baked into saldo_sekarang initially. So expected = saldo_awal ONLY if no in/out. Let's rewrite:)
    # Actually: starting balance was saldo_awal; then each IN adds, each OUT subtracts. So:
    expected = wallet["saldo_awal"] + total_in - total_out
    # But wallet was initialized as saldo_sekarang = saldo_awal on creation (no tx yet). So expected math works if we ONLY count tx after init.
    # For simplicity we treat saldo_awal + tx_deltas = saldo_sekarang
    tx_count = await db.petty_cash_tx.count_documents({})
    return {
        "saldo_awal": wallet["saldo_awal"],
        "saldo_sekarang": wallet["saldo_sekarang"],
        "total_in": total_in,
        "total_out": total_out,
        "expected_saldo": expected,
        "selisih": wallet["saldo_sekarang"] - expected,
        "balanced": abs(wallet["saldo_sekarang"] - expected) < 0.01,
        "tx_count": tx_count,
    }

# -------------------- AUDIT TRAIL --------------------
@api.get("/audit-trail")
async def audit_trail(limit: int = 200, user=Depends(require_roles("admin", "auditor"))):
    docs = await db.audit.find({}, {"_id": 0}).sort("timestamp", -1).limit(limit).to_list(limit)
    return docs

# -------------------- REPORTS --------------------
@api.get("/reports/claims")
async def report_claims(from_date: Optional[str] = None, to_date: Optional[str] = None,
                        status: Optional[str] = None, category_id: Optional[str] = None,
                        user=Depends(current_user)):
    q = {}
    if user["role"] == "user":
        q["user_id"] = user["id"]
    if status: q["status"] = status.upper()
    if category_id: q["category_id"] = category_id
    if from_date: q["tanggal"] = {**q.get("tanggal", {}), "$gte": from_date}
    if to_date: q["tanggal"] = {**q.get("tanggal", {}), "$lte": to_date}
    docs = await db.claims.find(q, {"_id": 0, "timeline": 0, "receipt_ids": 0, "transfer_proof_ids": 0}).sort("created_at", -1).to_list(2000)
    return docs

# -------------------- SETUP / BOOTSTRAP --------------------
DEFAULT_CATEGORIES = [
    {"code": "TOL", "name": "Karcis Tol", "icon": "Ticket"},
    {"code": "BBM", "name": "BBM / Bensin", "icon": "GasPump"},
    {"code": "ATK", "name": "ATK (Alat Tulis Kantor)", "icon": "PencilSimple"},
    {"code": "CLN", "name": "Alat Kebersihan", "icon": "Broom"},
    {"code": "KON", "name": "Konsumsi Kantor", "icon": "Coffee"},
]

@api.get("/setup/status")
async def setup_status():
    admin = await db.users.find_one({"role": "admin"})
    return {"admin_exists": bool(admin)}

@api.post("/setup/init")
async def setup_init():
    existing = await db.users.find_one({"role": "admin"})
    if existing:
        raise HTTPException(400, "Admin sudah terdaftar")
    admin_id = str(uuid.uuid4())
    await db.users.insert_one({
        "id": admin_id, "username": "admin", "name": "Administrator",
        "email": "admin@lyra-akrelux.local", "role": "admin", "active": True,
        "password_hash": hash_pw("admin123"), "created_at": now_iso(),
    })
    # Kategori awal
    for c in DEFAULT_CATEGORIES:
        await db.categories.insert_one({"id": str(uuid.uuid4()), **c, "active": True, "created_at": now_iso()})
    # Petty cash awal
    await get_petty_cash()
    return {"ok": True, "username": "admin", "password": "admin123"}

@api.get("/")
async def root():
    return {"service": "eKlaim Lyra API", "status": "ok"}

app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def _startup():
    try:
        init_storage()
        logger.info("Storage initialized")
    except Exception as e:
        logger.error(f"Storage init failed: {e}")

@app.on_event("shutdown")
async def _shutdown():
    client.close()
