import axios from "axios";

const BASE = process.env.REACT_APP_BACKEND_URL;
export const API = `${BASE}/api`;

export const api = axios.create({ baseURL: API, timeout: 60000 });

export const endpoints = {
  dashboard: () => api.get("/dashboard/summary").then(r => r.data),
  inventory: () => api.get("/inventory/monitoring").then(r => r.data),
  planning: () => api.get("/purchase/planning").then(r => r.data),
  calendar: () => api.get("/purchase/calendar").then(r => r.data),
  items: (params = {}) => api.get("/items", { params }).then(r => r.data),
  factories: () => api.get("/factories").then(r => r.data),
  campaigns: () => api.get("/campaigns").then(r => r.data),
  po: () => api.get("/po").then(r => r.data),
  uploadHistory: () => api.get("/upload/history").then(r => r.data),
  rules: () => api.get("/business-rules").then(r => r.data),
  settings: () => api.get("/settings").then(r => r.data),
  saveSettings: (b) => api.put("/settings", b).then(r => r.data),
  updateRule: (id, b) => api.put(`/business-rules/${id}`, b).then(r => r.data),
  createItem: (b) => api.post("/items", b).then(r => r.data),
  deleteItem: (code) => api.delete(`/items/${code}`).then(r => r.data),
  createFactory: (b) => api.post("/factories", b).then(r => r.data),
  deleteFactory: (name) => api.delete(`/factories/${name}`).then(r => r.data),
  createCampaign: (b) => api.post("/campaigns", b).then(r => r.data),
  deleteCampaign: (id) => api.delete(`/campaigns/${id}`).then(r => r.data),
  ai: (context, payload) => api.post("/ai/insight", { context, payload }).then(r => r.data),
  seedDemo: () => api.post("/demo/seed").then(r => r.data),
  clearAll: () => api.delete("/demo/clear").then(r => r.data),
  report: (name) => api.get(`/reports/${name}`).then(r => r.data),
  search: (q) => api.get("/search", { params: { q } }).then(r => r.data),
  upload: (kind, formData) => api.post(`/upload/${kind}`, formData, { headers: { "Content-Type": "multipart/form-data" } }).then(r => r.data),
};

export const fmt = {
  num: (v) => (v == null ? "-" : Number(v).toLocaleString(undefined, { maximumFractionDigits: 0 })),
  money: (v) => (v == null ? "-" : "$" + Number(v).toLocaleString(undefined, { maximumFractionDigits: 0 })),
  dec: (v, d = 1) => (v == null ? "-" : Number(v).toFixed(d)),
  date: (v) => (v ? new Date(v).toLocaleDateString() : "-"),
};
