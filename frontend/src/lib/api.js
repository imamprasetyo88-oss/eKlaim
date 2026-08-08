import axios from "axios";

const BASE = process.env.REACT_APP_BACKEND_URL;
export const API = `${BASE}/api`;

export const api = axios.create({ baseURL: API, timeout: 90000 });

api.interceptors.request.use((cfg) => {
  const t = localStorage.getItem("eklaim_token");
  if (t) cfg.headers.Authorization = `Bearer ${t}`;
  return cfg;
});

api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401 && !window.location.pathname.startsWith("/login")) {
      localStorage.removeItem("eklaim_token");
      window.location.href = "/login";
    }
    return Promise.reject(err);
  }
);

export const fileUrl = (fid) => {
  const t = localStorage.getItem("eklaim_token");
  return `${API}/files/${fid}/download?auth=${encodeURIComponent(t || "")}`;
};

export const fmtRp = (v) => {
  if (v == null || isNaN(v)) return "Rp -";
  return "Rp " + Math.round(Number(v)).toLocaleString("id-ID");
};

export const fmtDate = (v) => {
  if (!v) return "-";
  try {
    return new Date(v).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
  } catch { return String(v); }
};

export const fmtDateTime = (v) => {
  if (!v) return "-";
  try {
    return new Date(v).toLocaleString("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch { return String(v); }
};

export const STATUS_LABEL = {
  DRAFT: "Draft",
  DIAJUKAN: "Diajukan",
  PERLU_KOREKSI: "Perlu Koreksi",
  MENUNGGU_APPROVAL: "Menunggu Approval",
  DITOLAK: "Ditolak",
  MENUNGGU_PEMBAYARAN: "Siap Dibayar",
  DIBAYAR: "Selesai",
  MENUNGGU_FINANCE: "Menunggu Finance",
  SELESAI: "Selesai",
  DRAFT_UM: "Draft UM",
  MENUNGGU_VERIFIKASI_UM: "Menunggu Verifikasi",
  PERLU_KOREKSI_UM: "Perlu Koreksi",
  DITOLAK_UM: "Ditolak",
  MENUNGGU_APPROVAL_UM: "Menunggu Approval",
  MENUNGGU_TRANSFER_UM: "Menunggu Transfer",
  MENUNGGU_BUKTI: "Menunggu Bukti Realisasi",
  MENUNGGU_KONFIRMASI_UM: "Menunggu Konfirmasi",
  SELESAI_UM: "Selesai",
};

export const ROLE_LABEL = {
  admin: "Administrator",
  user: "User",
  verifikator: "Verifikator",
  atasan: "Atasan",
  finance: "Finance",
  auditor: "Auditor",
};
