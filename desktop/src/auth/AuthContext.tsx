import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { api } from "../api/client";

type User = { id: number | string; email: string; username?: string };

type AuthContextValue = {
  token: string | null;
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const TOKEN_KEY = "auth_access_token";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Load current user if token exists
  useEffect(() => {
    let cancelled = false;

    async function init() {
      setLoading(true);
      try {
        if (token) {
          const me = await api.me(token);
          if (!cancelled) setUser(me);
        } else {
          if (!cancelled) setUser(null);
        }
      } catch {
        // token invalid/expired
        localStorage.removeItem(TOKEN_KEY);
        if (!cancelled) {
          setToken(null);
          setUser(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    init();
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function login(email: string, password: string) {
    const res = await api.login(email, password);
    localStorage.setItem(TOKEN_KEY, res.access);
    setToken(res.access);
    // if backend returns user inline, use it; otherwise /me effect will fetch it
    if (res.user) setUser(res.user);
  }

  async function register(email: string, password: string) {
    const res = await api.register(email, password);
    localStorage.setItem(TOKEN_KEY, res.access);
    setToken(res.access);
    if (res.user) setUser(res.user);
  }

  function logout() {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setUser(null);
  }

  const value = useMemo<AuthContextValue>(
    () => ({ token, user, loading, login, register, logout }),
    [token, user, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
