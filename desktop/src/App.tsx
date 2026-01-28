import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  FormEvent,
} from "react";
import {
  HashRouter,
  Routes,
  Route,
  Navigate,
  Link,
  useLocation,
  useNavigate,
} from "react-router-dom";

import { dirname } from "@tauri-apps/api/path";

import CodeEditor from "../src/components/CodeEditor";
import TerminalPanel from "../src/components/TerminalPanel";
import FileExplorer from "../src/components/FileExplorer";

/* =========================
   API (adjust base/endpoints if needed)
========================= */

const API_BASE =
  import.meta.env.VITE_API_BASE_URL?.toString() ?? "http://localhost:8000";

type User = { id: number | string; email: string; username?: string };

type AuthResponse = {
  access: string;
  refresh?: string;
  user?: User;
};

async function requestJson<T>(
  path: string,
  opts: RequestInit & { token?: string | null } = {}
): Promise<T> {
  const headers = new Headers(opts.headers);

  // Only set JSON content-type if not sending FormData
  if (!headers.has("Content-Type") && !(opts.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  if (opts.token) headers.set("Authorization", `Bearer ${opts.token}`);

  const res = await fetch(`${API_BASE}${path}`, {
    ...opts,
    headers,
  });

  if (!res.ok) {
    let msg = `Request failed (${res.status})`;
    try {
      const data = await res.json();
      msg = data?.detail || data?.message || JSON.stringify(data);
    } catch {
      // ignore
    }
    throw new Error(msg);
  }

  return (await res.json()) as T;
}

const api = {
  login: (email: string, password: string) =>
    requestJson<AuthResponse>("/api/auth/login/", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  register: (email: string, password: string) =>
    requestJson<AuthResponse>("/api/auth/register/", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  me: (token: string) =>
    requestJson<User>("/api/auth/me/", {
      method: "GET",
      token,
    }),
};

/* =========================
   Auth Context
========================= */

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

function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(() =>
    localStorage.getItem(TOKEN_KEY)
  );
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Bootstrap /me if token exists
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
    const res = await api.login(email.trim(), password);
    localStorage.setItem(TOKEN_KEY, res.access);
    setToken(res.access);
    if (res.user) setUser(res.user);
  }

  async function register(email: string, password: string) {
    const res = await api.register(email.trim(), password);
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

function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

/* =========================
   Routing Helpers
========================= */

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { token, loading } = useAuth();
  const location = useLocation();

  if (loading) return <div style={{ padding: 24 }}>Loading...</div>;

  if (!token) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <>{children}</>;
}

/* =========================
   Pages
========================= */

function Input({
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      style={{
        padding: "10px 12px",
        border: "1px solid #d1d5db",
        borderRadius: 8,
        outline: "none",
      }}
    />
  );
}

function PrimaryButton({
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      style={{
        padding: "10px 12px",
        border: "1px solid #d1d5db",
        borderRadius: 8,
        background: "#fff",
        cursor: props.disabled ? "not-allowed" : "pointer",
      }}
    >
      {children}
    </button>
  );
}

function LoginPage() {
  const { login } = useAuth();
  const nav = useNavigate();
  const location = useLocation() as any;

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      await login(email, password);
      const dest = location?.state?.from ?? "/";
      nav(dest, { replace: true });
    } catch (ex: any) {
      setErr(ex?.message ?? "Login failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      style={{
        maxWidth: 440,
        margin: "72px auto",
        padding: 24,
        border: "1px solid #e5e7eb",
        borderRadius: 12,
      }}
    >
      <h1 style={{ margin: 0, marginBottom: 16 }}>Login</h1>

      {err && (
        <div style={{ marginBottom: 12, color: "#b91c1c" }}>{err}</div>
      )}

      <form onSubmit={onSubmit} style={{ display: "grid", gap: 12 }}>
        <label style={{ display: "grid", gap: 6 }}>
          <span>Email</span>
          <Input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          <span>Password</span>
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
        </label>

        <PrimaryButton disabled={busy} type="submit">
          {busy ? "Signing in..." : "Sign in"}
        </PrimaryButton>
      </form>

      <div style={{ marginTop: 14 }}>
        No account? <Link to="/register">Create one</Link>
      </div>

      <div style={{ marginTop: 10, fontSize: 12, opacity: 0.75 }}>
        API base: {API_BASE}
      </div>
    </div>
  );
}

function RegisterPage() {
  const { register } = useAuth();
  const nav = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErr(null);

    if (password.length < 8) {
      setErr("Password must be at least 8 characters.");
      return;
    }
    if (password !== password2) {
      setErr("Passwords do not match.");
      return;
    }

    setBusy(true);
    try {
      await register(email, password);
      nav("/", { replace: true });
    } catch (ex: any) {
      setErr(ex?.message ?? "Registration failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      style={{
        maxWidth: 440,
        margin: "72px auto",
        padding: 24,
        border: "1px solid #e5e7eb",
        borderRadius: 12,
      }}
    >
      <h1 style={{ margin: 0, marginBottom: 16 }}>Create account</h1>

      {err && (
        <div style={{ marginBottom: 12, color: "#b91c1c" }}>{err}</div>
      )}

      <form onSubmit={onSubmit} style={{ display: "grid", gap: 12 }}>
        <label style={{ display: "grid", gap: 6 }}>
          <span>Email</span>
          <Input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          <span>Password</span>
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
          />
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          <span>Confirm password</span>
          <Input
            type="password"
            value={password2}
            onChange={(e) => setPassword2(e.target.value)}
            autoComplete="new-password"
          />
        </label>

        <PrimaryButton disabled={busy} type="submit">
          {busy ? "Creating..." : "Create account"}
        </PrimaryButton>
      </form>

      <div style={{ marginTop: 14 }}>
        Already have an account? <Link to="/login">Login</Link>
      </div>

      <div style={{ marginTop: 10, fontSize: 12, opacity: 0.75 }}>
        API base: {API_BASE}
      </div>
    </div>
  );
}

/* =========================
   Your original app UI (protected)
========================= */

function AppShell() {
  const { user, logout } = useAuth();

  const [showTerminal, setShowTerminal] = useState(true);
  const [cwd, setCwd] = useState<string | null>(null);
  const [activeFile, setActiveFile] = useState<string | null>(null);

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
      {/* Toolbar */}
      <div
        style={{
          height: 44,
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "0 12px",
          borderBottom: "1px solid #e5e7eb",
          flex: "0 0 auto",
        }}
      >
        <div style={{ fontWeight: 600 }}>Collaborative Code Editor</div>

        <div
          style={{
            marginLeft: "auto",
            display: "flex",
            gap: 10,
            alignItems: "center",
          }}
        >
          <div style={{ fontSize: 12, opacity: 0.75 }}>{user?.email}</div>

          <button
            onClick={() => setShowTerminal((v) => !v)}
            style={{
              padding: "6px 10px",
              border: "1px solid #d1d5db",
              borderRadius: 6,
              background: "#fff",
              cursor: "pointer",
            }}
          >
            {showTerminal ? "Hide Terminal" : "Show Terminal"}
          </button>

          <button
            onClick={logout}
            style={{
              padding: "6px 10px",
              border: "1px solid #d1d5db",
              borderRadius: 6,
              background: "#fff",
              cursor: "pointer",
            }}
          >
            Logout
          </button>
        </div>
      </div>

      {/* Body: Explorer + Editor/Terminal */}
      <div style={{ flex: "1 1 auto", minHeight: 0, display: "flex", minWidth: 0 }}>
        <aside
          style={{
            width: 300,
            minWidth: 240,
            maxWidth: 420,
            borderRight: "1px solid #e5e7eb",
            overflow: "hidden",
          }}
        >
          <FileExplorer
            rootDir={cwd}
            onRootDirChange={(dir) => setCwd(dir)}
            onOpenDir={(dir) => setCwd(dir)}
            onOpenFile={async (path) => {
              setActiveFile(path);

              // Optional: keep terminal cwd aligned to the file’s folder
              try {
                const d = await dirname(path);
                setCwd(d);
              } catch {
                // ignore
              }
            }}
          />
        </aside>

        <main
          style={{
            flex: "1 1 auto",
            minWidth: 0,
            minHeight: 0,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          {/* Editor area */}
          <div style={{ flex: "1 1 auto", minHeight: 0 }}>
            <CodeEditor filePath={activeFile} />
          </div>

          {/* Terminal dock */}
          {showTerminal && (
            <div style={{ height: 240, borderTop: "1px solid #e5e7eb" }}>
              <TerminalPanel cwd={cwd ?? undefined} />
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

/* =========================
   App (Router + Provider)
========================= */

export default function App() {
  return (
    <HashRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />

          <Route
            path="/"
            element={
              <ProtectedRoute>
                <AppShell />
              </ProtectedRoute>
            }
          />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </HashRouter>
  );
}
