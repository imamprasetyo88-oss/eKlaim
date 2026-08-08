"""eKlaim Lyra - comprehensive backend tests"""
import os, io, uuid, requests, pytest
from PIL import Image

BASE_URL = os.environ['REACT_APP_BACKEND_URL'].rstrip('/') if os.environ.get('REACT_APP_BACKEND_URL') else None
if not BASE_URL:
    # read frontend .env
    with open('/app/frontend/.env') as f:
        for line in f:
            if line.startswith('REACT_APP_BACKEND_URL'):
                BASE_URL = line.split('=', 1)[1].strip().rstrip('/')

API = f"{BASE_URL}/api"

# ------- shared state (dict avoids global keyword mess) -------
S = {}


def _login(username, password):
    r = requests.post(f"{API}/auth/login", json={"username": username, "password": password})
    return r


def _auth_headers(token):
    return {"Authorization": f"Bearer {token}"}


# ---------- SETUP / AUTH ----------
def test_setup_status():
    r = requests.get(f"{API}/setup/status")
    assert r.status_code == 200
    assert r.json().get("admin_exists") is True


def test_setup_init_fails_when_admin_exists():
    r = requests.post(f"{API}/setup/init")
    assert r.status_code == 400


def test_login_admin():
    r = _login("admin", "admin123")
    assert r.status_code == 200
    data = r.json()
    assert "token" in data and data["user"]["role"] == "admin"
    S["admin_token"] = data["token"]
    S["admin_id"] = data["user"]["id"]


def test_login_invalid():
    r = _login("admin", "wrong")
    assert r.status_code == 401


def test_auth_me():
    r = requests.get(f"{API}/auth/me", headers=_auth_headers(S["admin_token"]))
    assert r.status_code == 200
    assert r.json()["username"] == "admin"


# ---------- USERS / ROLE GUARD ----------
def _create_or_ensure_user(username, name, password, role):
    r = requests.post(f"{API}/users",
                      json={"username": username, "name": name, "password": password, "role": role},
                      headers=_auth_headers(S["admin_token"]))
    if r.status_code == 400 and "sudah" in r.text.lower():
        # already exists; look up id
        lr = requests.get(f"{API}/users", headers=_auth_headers(S["admin_token"]))
        for u in lr.json():
            if u["username"] == username:
                # reset password to known one
                requests.post(f"{API}/users/{u['id']}/reset-password",
                              json={"new_password": password},
                              headers=_auth_headers(S["admin_token"]))
                # make sure active
                requests.put(f"{API}/users/{u['id']}",
                             json={"active": True, "role": role},
                             headers=_auth_headers(S["admin_token"]))
                return u["id"]
        pytest.fail(f"cannot find user {username}")
    assert r.status_code == 200, r.text
    return r.json()["id"]


def test_create_role_users_and_login():
    roles = [
        ("budi", "Budi User", "test123", "user"),
        ("verifi", "Vera Verifikator", "test123", "verifikator"),
        ("manager", "Manda Atasan", "test123", "atasan"),
        ("finance", "Fifi Finance", "test123", "finance"),
        ("audit", "Ari Auditor", "test123", "auditor"),
    ]
    for uname, name, pw, role in roles:
        uid = _create_or_ensure_user(uname, name, pw, role)
        lr = _login(uname, pw)
        assert lr.status_code == 200, f"login failed {uname}: {lr.text}"
        S[f"{role}_token"] = lr.json()["token"]
        S[f"{role}_id"] = uid
        S[f"{role}_username"] = uname


def test_non_admin_cannot_create_user():
    r = requests.post(f"{API}/users",
                      json={"username": "hacker", "name": "x", "password": "x", "role": "user"},
                      headers=_auth_headers(S["user_token"]))
    assert r.status_code == 403


# ---------- CATEGORIES ----------
def test_list_categories_seeded():
    r = requests.get(f"{API}/categories", headers=_auth_headers(S["admin_token"]))
    assert r.status_code == 200
    cats = r.json()
    assert len(cats) >= 5
    S["category_id"] = cats[0]["id"]


def test_non_admin_cannot_create_category():
    r = requests.post(f"{API}/categories",
                      json={"code": "TST", "name": "Test", "icon": "Receipt"},
                      headers=_auth_headers(S["user_token"]))
    assert r.status_code == 403


# ---------- FILE UPLOAD ----------
def _make_png_bytes():
    img = Image.new("RGB", (400, 300), (240, 240, 240))
    # draw some fake "text" pixels
    for i in range(50, 350):
        img.putpixel((i, 100), (0, 0, 0))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def test_upload_and_download_file():
    png = _make_png_bytes()
    r = requests.post(f"{API}/files/upload",
                      headers=_auth_headers(S["user_token"]),
                      files={"file": ("receipt.png", png, "image/png")})
    assert r.status_code == 200, r.text
    fid = r.json()["id"]
    S["file_id_receipt"] = fid

    # download via header
    d = requests.get(f"{API}/files/{fid}/download", headers=_auth_headers(S["user_token"]))
    assert d.status_code == 200
    assert d.headers.get("content-type", "").startswith("image/")

    # download via ?auth= query
    d2 = requests.get(f"{API}/files/{fid}/download?auth={S['user_token']}")
    assert d2.status_code == 200


def test_upload_reject_bad_ext():
    r = requests.post(f"{API}/files/upload",
                      headers=_auth_headers(S["user_token"]),
                      files={"file": ("bad.exe", b"MZ", "application/octet-stream")})
    assert r.status_code == 400


# ---------- OCR ----------
def test_ocr_receipt_returns_json_even_on_fail():
    r = requests.post(f"{API}/ocr/receipt?file_id={S['file_id_receipt']}",
                      headers=_auth_headers(S["user_token"]))
    assert r.status_code == 200
    data = r.json()
    assert "jumlah" in data and "tanggal" in data and "merchant" in data


# ---------- FULL CLAIM WORKFLOW ----------
def test_claim_full_workflow():
    # 1. USER creates claim
    payload = {
        "category_id": S["category_id"],
        "tanggal": "2026-01-15",
        "deskripsi": "TEST_ pembelian ATK",
        "tujuan": "Kantor",
        "jumlah": 150000,
        "receipt_ids": [S["file_id_receipt"]],
    }
    r = requests.post(f"{API}/claims", json=payload, headers=_auth_headers(S["user_token"]))
    assert r.status_code == 200, r.text
    claim = r.json()
    assert claim["status"] == "DRAFT"
    assert claim["code"].startswith("KLM-")
    cid = claim["id"]

    # 2. Submit
    r = requests.post(f"{API}/claims/{cid}/submit", headers=_auth_headers(S["user_token"]))
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "DIAJUKAN"

    # 3. Verifikator approves
    r = requests.post(f"{API}/claims/{cid}/verify?decision=approve",
                      json={"catatan": "OK"},
                      headers=_auth_headers(S["verifikator_token"]))
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "MENUNGGU_APPROVAL"

    # 4. Atasan approves
    r = requests.post(f"{API}/claims/{cid}/approve?decision=approve",
                      json={"catatan": "setuju"},
                      headers=_auth_headers(S["atasan_token"]))
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "MENUNGGU_PEMBAYARAN"

    # petty cash before pay
    r = requests.get(f"{API}/petty-cash", headers=_auth_headers(S["verifikator_token"]))
    saldo_before = r.json()["saldo_sekarang"]

    # 5. Verifikator pays w/ transfer proof
    proof = _make_png_bytes()
    up = requests.post(f"{API}/files/upload",
                       headers=_auth_headers(S["verifikator_token"]),
                       files={"file": ("proof.png", proof, "image/png")})
    assert up.status_code == 200
    proof_id = up.json()["id"]
    r = requests.post(f"{API}/claims/{cid}/pay",
                      json={"catatan": "bayar tunai", "transfer_proof_ids": [proof_id]},
                      headers=_auth_headers(S["verifikator_token"]))
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "DIBAYAR"

    r = requests.get(f"{API}/petty-cash", headers=_auth_headers(S["verifikator_token"]))
    saldo_after = r.json()["saldo_sekarang"]
    assert saldo_after == saldo_before - 150000, f"expected {saldo_before-150000}, got {saldo_after}"
    S["claim_id"] = cid
    S["saldo_after_pay"] = saldo_after


def test_claim_role_guards():
    # user cannot verify
    r = requests.post(f"{API}/claims/{S['claim_id']}/verify?decision=approve",
                      json={}, headers=_auth_headers(S["user_token"]))
    assert r.status_code == 403


# ---------- TOP-UP ----------
def test_topup_workflow_refills_petty_cash():
    r = requests.post(f"{API}/topups",
                      json={"jumlah": 1000000, "catatan": "topup rutin"},
                      headers=_auth_headers(S["verifikator_token"]))
    assert r.status_code == 200, r.text
    tid = r.json()["id"]
    assert r.json()["status"] == "MENUNGGU_FINANCE"

    proof = _make_png_bytes()
    up = requests.post(f"{API}/files/upload",
                       headers=_auth_headers(S["finance_token"]),
                       files={"file": ("t_proof.png", proof, "image/png")})
    proof_id = up.json()["id"]

    r = requests.post(f"{API}/topups/{tid}/approve",
                      json={"catatan": "sudah tf", "transfer_proof_ids": [proof_id]},
                      headers=_auth_headers(S["finance_token"]))
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "SELESAI"

    r = requests.get(f"{API}/petty-cash", headers=_auth_headers(S["verifikator_token"]))
    saldo_now = r.json()["saldo_sekarang"]
    assert saldo_now == S["saldo_after_pay"] + 1000000


def test_topup_non_verifikator_cannot_request():
    r = requests.post(f"{API}/topups", json={"jumlah": 500000},
                      headers=_auth_headers(S["user_token"]))
    assert r.status_code == 403


# ---------- RECONCILIATION ----------
def test_reconciliation_balanced():
    r = requests.get(f"{API}/reconciliation", headers=_auth_headers(S["admin_token"]))
    assert r.status_code == 200
    d = r.json()
    assert d["balanced"] is True, d
    assert d["total_out"] >= 150000
    assert d["total_in"] >= 1000000


# ---------- DASHBOARD ----------
def test_dashboard_shape():
    r = requests.get(f"{API}/dashboard", headers=_auth_headers(S["admin_token"]))
    assert r.status_code == 200
    d = r.json()
    for key in ("wallet", "counts", "kpi", "trend", "top_categories", "recent"):
        assert key in d
    assert isinstance(d["trend"], list) and len(d["trend"]) == 30


# ---------- AUDIT TRAIL ----------
def test_audit_trail_admin_only():
    r = requests.get(f"{API}/audit-trail", headers=_auth_headers(S["admin_token"]))
    assert r.status_code == 200
    assert isinstance(r.json(), list) and len(r.json()) > 0

    r = requests.get(f"{API}/audit-trail", headers=_auth_headers(S["user_token"]))
    assert r.status_code == 403

    r = requests.get(f"{API}/audit-trail", headers=_auth_headers(S["auditor_token"]))
    assert r.status_code == 200


# ---------- REPORTS ----------
def test_reports_claims():
    r = requests.get(f"{API}/reports/claims", headers=_auth_headers(S["admin_token"]))
    assert r.status_code == 200
    assert isinstance(r.json(), list)


# ---------- CASH ADVANCE (UANG MUKA) FULL FLOW ----------
def _upload_png(token, name="um.png"):
    up = requests.post(f"{API}/files/upload",
                       headers=_auth_headers(token),
                       files={"file": (name, _make_png_bytes(), "image/png")})
    assert up.status_code == 200, up.text
    return up.json()["id"]


def test_ca_full_flow_surplus():
    """User Rp 500k UM, actual Rp 450k -> selisih +50k returned to petty cash."""
    # baseline saldo
    r = requests.get(f"{API}/petty-cash", headers=_auth_headers(S["verifikator_token"]))
    saldo0 = r.json()["saldo_sekarang"]

    # 1. USER creates cash advance
    payload = {
        "category_id": S["category_id"],
        "tanggal": "2026-01-20",
        "deskripsi": "TEST_ UM belanja ATK kantor",
        "tujuan": "Ace Hardware",
        "jumlah_um": 500000,
    }
    r = requests.post(f"{API}/cash-advances", json=payload,
                      headers=_auth_headers(S["user_token"]))
    assert r.status_code == 200, r.text
    ca = r.json()
    assert ca["status"] == "DRAFT_UM"
    assert ca["code"].startswith("UM-")
    assert ca["jumlah_um"] == 500000
    cid = ca["id"]
    S["ca_id"] = cid

    # 2. jumlah_um must be > 0
    bad = dict(payload)
    bad["jumlah_um"] = 0
    br = requests.post(f"{API}/cash-advances", json=bad,
                      headers=_auth_headers(S["user_token"]))
    assert br.status_code == 400

    # 3. Submit
    r = requests.post(f"{API}/cash-advances/{cid}/submit",
                      headers=_auth_headers(S["user_token"]))
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "MENUNGGU_VERIFIKASI_UM"

    # 4. Verifikator approve
    r = requests.post(f"{API}/cash-advances/{cid}/verify?decision=approve",
                      json={"catatan": "OK"},
                      headers=_auth_headers(S["verifikator_token"]))
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "MENUNGGU_APPROVAL_UM"

    # 5. Atasan approve
    r = requests.post(f"{API}/cash-advances/{cid}/approve?decision=approve",
                      json={"catatan": "setuju"},
                      headers=_auth_headers(S["atasan_token"]))
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "MENUNGGU_TRANSFER_UM"

    # 6. Verifikator transfer requires proof
    r = requests.post(f"{API}/cash-advances/{cid}/transfer",
                      json={"catatan": "tf", "transfer_proof_ids": []},
                      headers=_auth_headers(S["verifikator_token"]))
    assert r.status_code == 400  # bukti wajib

    proof_id = _upload_png(S["verifikator_token"], "um_tf.png")
    r = requests.post(f"{API}/cash-advances/{cid}/transfer",
                      json={"catatan": "tf bca", "transfer_proof_ids": [proof_id]},
                      headers=_auth_headers(S["verifikator_token"]))
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "MENUNGGU_BUKTI"

    r = requests.get(f"{API}/petty-cash", headers=_auth_headers(S["verifikator_token"]))
    saldo_after_transfer = r.json()["saldo_sekarang"]
    assert saldo_after_transfer == saldo0 - 500000, f"expected {saldo0-500000}, got {saldo_after_transfer}"

    # 7. User realize w/ jumlah_aktual 450000 -> selisih +50000
    receipt_id = _upload_png(S["user_token"], "um_r.png")
    r = requests.post(f"{API}/cash-advances/{cid}/realize",
                      json={"jumlah_aktual": 450000, "receipt_ids": [receipt_id], "catatan": "sisa 50rb"},
                      headers=_auth_headers(S["user_token"]))
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["status"] == "MENUNGGU_KONFIRMASI_UM"
    assert body["jumlah_aktual"] == 450000
    assert body["selisih"] == 50000

    # 8. Verifikator confirm -> selisih +50k back to petty cash
    r = requests.post(f"{API}/cash-advances/{cid}/confirm",
                      json={"catatan": "ok"},
                      headers=_auth_headers(S["verifikator_token"]))
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "SELESAI_UM"

    r = requests.get(f"{API}/petty-cash", headers=_auth_headers(S["verifikator_token"]))
    saldo_final = r.json()["saldo_sekarang"]
    # net effect: -500k + 50k = -450k
    assert saldo_final == saldo0 - 450000, f"expected {saldo0-450000}, got {saldo_final}"


def test_ca_deficit_flow():
    """UM 200k, actual 250k -> selisih -50k, petty cash pays extra 50k."""
    r = requests.get(f"{API}/petty-cash", headers=_auth_headers(S["verifikator_token"]))
    saldo0 = r.json()["saldo_sekarang"]

    payload = {
        "category_id": S["category_id"],
        "tanggal": "2026-01-21",
        "deskripsi": "TEST_ UM deficit",
        "tujuan": "warung",
        "jumlah_um": 200000,
    }
    r = requests.post(f"{API}/cash-advances", json=payload,
                      headers=_auth_headers(S["user_token"]))
    cid = r.json()["id"]
    requests.post(f"{API}/cash-advances/{cid}/submit", headers=_auth_headers(S["user_token"]))
    requests.post(f"{API}/cash-advances/{cid}/verify?decision=approve",
                  json={}, headers=_auth_headers(S["verifikator_token"]))
    requests.post(f"{API}/cash-advances/{cid}/approve?decision=approve",
                  json={}, headers=_auth_headers(S["atasan_token"]))
    pf = _upload_png(S["verifikator_token"], "d_tf.png")
    requests.post(f"{API}/cash-advances/{cid}/transfer",
                  json={"transfer_proof_ids": [pf]},
                  headers=_auth_headers(S["verifikator_token"]))
    rc = _upload_png(S["user_token"], "d_r.png")
    r = requests.post(f"{API}/cash-advances/{cid}/realize",
                     json={"jumlah_aktual": 250000, "receipt_ids": [rc]},
                     headers=_auth_headers(S["user_token"]))
    assert r.status_code == 200
    assert r.json()["selisih"] == -50000

    r = requests.post(f"{API}/cash-advances/{cid}/confirm", json={},
                      headers=_auth_headers(S["verifikator_token"]))
    assert r.status_code == 200, r.text

    r = requests.get(f"{API}/petty-cash", headers=_auth_headers(S["verifikator_token"]))
    saldo_final = r.json()["saldo_sekarang"]
    # -200k transfer + -50k extra = -250k
    assert saldo_final == saldo0 - 250000, f"expected {saldo0-250000}, got {saldo_final}"


def test_ca_correction_and_reject():
    payload = {"category_id": S["category_id"], "tanggal": "2026-01-22",
               "deskripsi": "TEST_ correction", "jumlah_um": 100000}
    r = requests.post(f"{API}/cash-advances", json=payload,
                      headers=_auth_headers(S["user_token"]))
    cid = r.json()["id"]
    requests.post(f"{API}/cash-advances/{cid}/submit", headers=_auth_headers(S["user_token"]))
    r = requests.post(f"{API}/cash-advances/{cid}/verify?decision=correction",
                      json={"catatan": "kurang detail"},
                      headers=_auth_headers(S["verifikator_token"]))
    assert r.status_code == 200
    assert r.json()["status"] == "PERLU_KOREKSI_UM"

    # user resubmits
    requests.post(f"{API}/cash-advances/{cid}/submit", headers=_auth_headers(S["user_token"]))
    r = requests.post(f"{API}/cash-advances/{cid}/verify?decision=reject",
                      json={"catatan": "tidak layak"},
                      headers=_auth_headers(S["verifikator_token"]))
    assert r.status_code == 200
    assert r.json()["status"] == "DITOLAK_UM"


def test_ca_atasan_reject():
    payload = {"category_id": S["category_id"], "tanggal": "2026-01-22",
               "deskripsi": "TEST_ atasan reject", "jumlah_um": 100000}
    r = requests.post(f"{API}/cash-advances", json=payload,
                      headers=_auth_headers(S["user_token"]))
    cid = r.json()["id"]
    requests.post(f"{API}/cash-advances/{cid}/submit", headers=_auth_headers(S["user_token"]))
    requests.post(f"{API}/cash-advances/{cid}/verify?decision=approve",
                  json={}, headers=_auth_headers(S["verifikator_token"]))
    r = requests.post(f"{API}/cash-advances/{cid}/approve?decision=reject",
                     json={"catatan": "budget nggak ada"},
                     headers=_auth_headers(S["atasan_token"]))
    assert r.status_code == 200
    assert r.json()["status"] == "DITOLAK_UM"


def test_ca_delete_draft_only():
    payload = {"category_id": S["category_id"], "tanggal": "2026-01-22",
               "deskripsi": "TEST_ delete draft", "jumlah_um": 10000}
    r = requests.post(f"{API}/cash-advances", json=payload,
                      headers=_auth_headers(S["user_token"]))
    cid = r.json()["id"]
    # owner can delete DRAFT_UM
    r = requests.delete(f"{API}/cash-advances/{cid}",
                       headers=_auth_headers(S["user_token"]))
    assert r.status_code == 200

    # Cannot delete after submit
    r = requests.post(f"{API}/cash-advances", json=payload,
                      headers=_auth_headers(S["user_token"]))
    cid2 = r.json()["id"]
    requests.post(f"{API}/cash-advances/{cid2}/submit", headers=_auth_headers(S["user_token"]))
    r = requests.delete(f"{API}/cash-advances/{cid2}",
                       headers=_auth_headers(S["user_token"]))
    assert r.status_code == 400

    # Non-owner (other user) cannot delete
    r = requests.post(f"{API}/cash-advances", json=payload,
                      headers=_auth_headers(S["user_token"]))
    cid3 = r.json()["id"]
    r = requests.delete(f"{API}/cash-advances/{cid3}",
                        headers=_auth_headers(S["verifikator_token"]))
    assert r.status_code == 403


def test_dashboard_um_counts_present():
    r = requests.get(f"{API}/dashboard", headers=_auth_headers(S["verifikator_token"]))
    assert r.status_code == 200
    counts = r.json()["counts"]
    for k in ("um_verifikasi", "um_transfer", "um_konfirmasi"):
        assert k in counts, f"missing {k}: {counts}"

    r = requests.get(f"{API}/dashboard", headers=_auth_headers(S["atasan_token"]))
    counts = r.json()["counts"]
    assert "um_approval" in counts

    r = requests.get(f"{API}/dashboard", headers=_auth_headers(S["user_token"]))
    counts = r.json()["counts"]
    assert "um_perlu_bukti" in counts
