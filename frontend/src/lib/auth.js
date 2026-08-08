import { createContext, useContext, useEffect, useState } from "react";
import { api } from "@/lib/api";

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const t = localStorage.getItem("eklaim_token");
    if (!t) { setLoading(false); return; }
    api.get("/auth/me").then((r) => setUser(r.data)).catch(() => localStorage.removeItem("eklaim_token")).finally(() => setLoading(false));
  }, []);

  const login = async (username, password, companyId) => {
    const r = await api.post("/auth/login", { username, password, company_id: companyId });
    localStorage.setItem("eklaim_token", r.data.token);
    localStorage.setItem("eklaim_company", JSON.stringify(r.data.company || {}));
    const userWithCompany = { ...r.data.user, company: r.data.company };
    setUser(userWithCompany);
    return userWithCompany;
  };

  const logout = () => {
    localStorage.removeItem("eklaim_token");
    localStorage.removeItem("eklaim_company");
    setUser(null);
    window.location.href = "/login";
  };

  const refresh = async () => {
    const r = await api.get("/auth/me");
    setUser(r.data);
    return r.data;
  };

  return <AuthCtx.Provider value={{ user, loading, login, logout, refresh }}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => useContext(AuthCtx);

export const can = (user, ...roles) => user && roles.includes(user.role);
