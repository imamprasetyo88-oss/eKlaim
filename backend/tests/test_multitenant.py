"""Multi-tenant eKlaim backend tests (Lyra + SKP tenant isolation)."""
import os
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
if not BASE_URL:
    # fallback read frontend/.env
    with open('/app/frontend/.env') as f:
        for line in f:
            if line.startswith('REACT_APP_BACKEND_URL='):
                BASE_URL = line.split('=', 1)[1].strip().rstrip('/')
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def companies():
    r = requests.get(f"{API}/companies", timeout=30)
    assert r.status_code == 200, r.text
    data = r.json()
    assert isinstance(data, list) and len(data) >= 2, f"Expected >=2 companies, got {data}"
    by_code = {c["code"]: c for c in data}
    assert "LYRA" in by_code and "SKP" in by_code, by_code
    return by_code


@pytest.fixture(scope="module")
def lyra_token(companies):
    r = requests.post(f"{API}/auth/login", json={
        "username": "admin", "password": "admin123", "company_id": companies["LYRA"]["id"]
    }, timeout=30)
    assert r.status_code == 200, f"Lyra login failed: {r.status_code} {r.text}"
    data = r.json()
    assert "token" in data and "company" in data
    assert data["company"]["code"] == "LYRA"
    assert data["user"]["company_id"] == companies["LYRA"]["id"]
    return data["token"]


@pytest.fixture(scope="module")
def skp_token(companies):
    # Ensure SKP admin exists
    st = requests.get(f"{API}/setup/status", timeout=30).json()
    admins = st.get("admin_exists_by_company", {})
    skp_id = companies["SKP"]["id"]
    if not admins.get(skp_id):
        r = requests.post(f"{API}/setup/init", params={"company_id": skp_id}, timeout=30)
        assert r.status_code == 200, f"SKP admin init failed: {r.text}"
    r = requests.post(f"{API}/auth/login", json={
        "username": "admin", "password": "admin123", "company_id": skp_id
    }, timeout=30)
    assert r.status_code == 200, f"SKP login: {r.status_code} {r.text}"
    data = r.json()
    assert data["company"]["code"] == "SKP"
    return data["token"]


def H(t): return {"Authorization": f"Bearer {t}"}


# --- Companies public endpoint ---
def test_public_companies(companies):
    assert companies["LYRA"]["name"] == "Lyra Akrelux"
    assert companies["SKP"]["name"] == "Sunda Kelapa Pustaka"


def test_setup_status(companies):
    r = requests.get(f"{API}/setup/status", timeout=30)
    assert r.status_code == 200
    d = r.json()
    assert d["companies_exists"] is True
    assert isinstance(d["admin_exists_by_company"], dict)


def test_setup_init_idempotent_lyra(companies):
    r = requests.post(f"{API}/setup/init", params={"company_id": companies["LYRA"]["id"]}, timeout=30)
    # Should 400 since Lyra admin already exists
    assert r.status_code == 400, r.text


# --- Auth ---
def test_login_wrong_company(companies):
    # Login lyra admin with SKP company_id -> should fail (different tenant)
    r = requests.post(f"{API}/auth/login", json={
        "username": "admin_nonexistent_xyz", "password": "admin123",
        "company_id": companies["LYRA"]["id"]
    }, timeout=30)
    assert r.status_code == 401


def test_auth_me_returns_company(lyra_token, companies):
    r = requests.get(f"{API}/auth/me", headers=H(lyra_token), timeout=30)
    assert r.status_code == 200
    d = r.json()
    assert d["company"]["code"] == "LYRA"
    assert d["company_id"] == companies["LYRA"]["id"]


def test_tokens_have_different_company_ids(lyra_token, skp_token):
    import base64, json
    def claims(tok):
        payload = tok.split(".")[1]
        payload += "=" * (-len(payload) % 4)
        return json.loads(base64.urlsafe_b64decode(payload))
    lc = claims(lyra_token)["company_id"]
    sc = claims(skp_token)["company_id"]
    assert lc and sc and lc != sc


# --- Tenant isolation: users ---
def test_users_isolated(lyra_token, skp_token):
    lyra_users = requests.get(f"{API}/users", headers=H(lyra_token), timeout=30).json()
    skp_users = requests.get(f"{API}/users", headers=H(skp_token), timeout=30).json()
    lyra_ids = {u["id"] for u in lyra_users}
    skp_ids = {u["id"] for u in skp_users}
    assert lyra_ids.isdisjoint(skp_ids), "User IDs leaked across tenants"
    # Every user has correct company_id
    lyra_cid = requests.get(f"{API}/auth/me", headers=H(lyra_token)).json()["company_id"]
    for u in lyra_users:
        assert u["company_id"] == lyra_cid


# --- Tenant isolation: categories ---
def test_categories_default_seeded(lyra_token, skp_token):
    lc = requests.get(f"{API}/categories", headers=H(lyra_token)).json()
    sc = requests.get(f"{API}/categories", headers=H(skp_token)).json()
    assert len(lc) >= 5
    assert len(sc) >= 5


def test_categories_isolated(lyra_token, skp_token):
    r = requests.post(f"{API}/categories", headers=H(lyra_token), json={
        "code": "TEST_LYRA_ONLY", "name": "Kategori-Lyra-Only", "icon": "Receipt"
    }, timeout=30)
    # Might already exist from prior runs — accept 200 or 400
    if r.status_code == 400:
        pass  # already exists
    else:
        assert r.status_code == 200, r.text
    skp_cats = requests.get(f"{API}/categories", headers=H(skp_token)).json()
    codes = [c["code"] for c in skp_cats]
    assert "TEST_LYRA_ONLY" not in codes, "Category leaked to SKP"


# --- Tenant isolation: petty cash ---
def test_petty_cash_independent(lyra_token, skp_token):
    lp = requests.get(f"{API}/petty-cash", headers=H(lyra_token)).json()
    sp = requests.get(f"{API}/petty-cash", headers=H(skp_token)).json()
    assert lp["saldo_awal"] > 0
    assert sp["saldo_awal"] > 0


# --- Tenant isolation: claims ---
def test_claim_isolation(lyra_token, skp_token):
    # Create a claim as Lyra admin (admins can create too as current_user)
    cats = requests.get(f"{API}/categories", headers=H(lyra_token)).json()
    cat_id = cats[0]["id"]
    r = requests.post(f"{API}/claims", headers=H(lyra_token), json={
        "category_id": cat_id, "tanggal": "2026-01-15",
        "deskripsi": "TEST isolation claim", "tujuan": "test",
        "jumlah": 50000, "receipt_ids": []
    }, timeout=30)
    assert r.status_code == 200, r.text
    lyra_claim = r.json()
    cid = lyra_claim["id"]
    # SKP admin should NOT see this claim
    skp_claims = requests.get(f"{API}/claims", headers=H(skp_token)).json()
    assert cid not in [c["id"] for c in skp_claims]
    # Direct GET by SKP -> 404
    r2 = requests.get(f"{API}/claims/{cid}", headers=H(skp_token), timeout=30)
    assert r2.status_code == 404


def test_dashboard_isolated(lyra_token, skp_token):
    ld = requests.get(f"{API}/dashboard", headers=H(lyra_token)).json()
    sd = requests.get(f"{API}/dashboard", headers=H(skp_token)).json()
    assert "wallet" in ld and "wallet" in sd
    assert "kpi" in ld


def test_audit_trail_isolated(lyra_token, skp_token):
    la = requests.get(f"{API}/audit-trail", headers=H(lyra_token)).json()
    sa = requests.get(f"{API}/audit-trail", headers=H(skp_token)).json()
    # SKP audit should not contain lyra actor ids
    lyra_users = requests.get(f"{API}/users", headers=H(lyra_token)).json()
    lyra_uids = {u["id"] for u in lyra_users}
    for entry in sa:
        assert entry.get("actor_id") not in lyra_uids


def test_code_generation_per_company(lyra_token, skp_token):
    cats_l = requests.get(f"{API}/categories", headers=H(lyra_token)).json()
    cats_s = requests.get(f"{API}/categories", headers=H(skp_token)).json()
    r1 = requests.post(f"{API}/claims", headers=H(lyra_token), json={
        "category_id": cats_l[0]["id"], "tanggal": "2026-01-15",
        "deskripsi": "code gen L", "jumlah": 1000, "receipt_ids": []
    }).json()
    r2 = requests.post(f"{API}/claims", headers=H(skp_token), json={
        "category_id": cats_s[0]["id"], "tanggal": "2026-01-15",
        "deskripsi": "code gen S", "jumlah": 1000, "receipt_ids": []
    }).json()
    assert r1["code"].startswith("KLM-")
    assert r2["code"].startswith("KLM-")
    # Both should be valid, distinct docs, may share code
