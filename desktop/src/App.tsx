import React, { createContext, useContext, useEffect, useMemo, useState, FormEvent } from "react";
import { HashRouter, Routes, Route, Navigate, Link, useLocation, useNavigate } from "react-router-dom";

import CodeEditor from "./components/CodeEditor";
import TerminalPanel from "./components/TerminalPanel";
import FileExplorer from "./components/FileExplorer";
import ChatPanel from "./components/ChatPanel";
import { CollabProvider, useCollab } from "./collab/CollabProvider";

/* =========================
   API
========================= */

const API_BASE = import.meta.env.VITE_API_BASE_URL?.toString() ?? "http://localhost:8000";

type User = { id: number | string; email: string; username?: string };

type AuthResponse = {
  access: string;
  refresh?: string;
  user?: User;
};

async function requestJson<T>(path: string, opts: RequestInit & { token?: string | null } = {}): Promise<T> {
  const headers = new Headers(opts.headers);

  if (!headers.has("Content-Type") && !(opts.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  if (opts.token) headers.set("Authorization", `Bearer ${opts.token}`);

  const res = await fetch(`${API_BASE}${path}`, { ...opts, headers });

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

  // allow empty bodies
  const text = await res.text();
  return (text ? JSON.parse(text) : {}) as T;
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
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

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

  const value = useMemo<AuthContextValue>(() => ({ token, user, loading, login, register, logout }), [
    token,
    user,
    loading,
  ]);

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
   UI bits
========================= */

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
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

function PrimaryButton(
  props: React.ButtonHTMLAttributes<HTMLButtonElement> & { children: React.ReactNode }
) {
  const { children, ...rest } = props;
  return (
    <button
      {...rest}
      style={{
        padding: "10px 12px",
        border: "1px solid #d1d5db",
        borderRadius: 8,
        background: "#fff",
        cursor: rest.disabled ? "not-allowed" : "pointer",
      }}
    >
      {children}
    </button>
  );
}

/* =========================
   Pages
========================= */

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
    <div style={{ maxWidth: 440, margin: "72px auto", padding: 24, border: "1px solid #e5e7eb", borderRadius: 12 }}>
      <h1 style={{ margin: 0, marginBottom: 16 }}>Login</h1>

      {err && <div style={{ marginBottom: 12, color: "#b91c1c" }}>{err}</div>}

      <form onSubmit={onSubmit} style={{ display: "grid", gap: 12 }}>
        <label style={{ display: "grid", gap: 6 }}>
          <span>Email</span>
          <Input value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
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
    <div style={{ maxWidth: 440, margin: "72px auto", padding: 24, border: "1px solid #e5e7eb", borderRadius: 12 }}>
      <h1 style={{ margin: 0, marginBottom: 16 }}>Create account</h1>

      {err && <div style={{ marginBottom: 12, color: "#b91c1c" }}>{err}</div>}

      <form onSubmit={onSubmit} style={{ display: "grid", gap: 12 }}>
        <label style={{ display: "grid", gap: 6 }}>
          <span>Email</span>
          <Input value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
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
    </div>
  );
}

/* =========================
   Helpers
========================= */

function cheapDirname(p: string | null | undefined) {
  if (!p) return null;
  const s = p.replace(/[\\/]+$/, "");
  const sep = s.includes("\\") ? "\\" : "/";
  const i = s.lastIndexOf(sep);
  if (i <= 0) return sep;
  return s.slice(0, i);
}

/* =========================
   Room system (simple, client-side)
========================= */

type RoomMeta = {
  docName: string; // used as roomId for y-websocket/hocuspocus
  name: string;
  joinCode: string;
  maxUsers: number;
};

const ROOM_KEY = "collab_room_meta";

function loadRoomMeta(): RoomMeta | null {
  try {
    const raw = localStorage.getItem(ROOM_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.docName) return null;
    return parsed as RoomMeta;
  } catch {
    return null;
  }
}

function saveRoomMeta(meta: RoomMeta | null) {
  if (!meta) localStorage.removeItem(ROOM_KEY);
  else localStorage.setItem(ROOM_KEY, JSON.stringify(meta));
}

function randomJoinCode(len = 8) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < len; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

function RoomBar({ onOpenRoomDialog, onOpenRequests }: { onOpenRoomDialog: () => void; onOpenRequests: () => void }) {
  const { roomId, status, role, members, visibility, isHost, setShareTreeEnabled, editRequests, terminalRequests } =
    useCollab();

  const pending = (editRequests?.length ?? 0) + (terminalRequests?.length ?? 0);

  const roleLabel = role === "host" ? "Host" : role === "editor" ? "Editor" : "Viewer";

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <button onClick={onOpenRoomDialog} style={btnSm}>
        Rooms
      </button>

      <div style={{ fontSize: 12, opacity: 0.85 }}>
        <b>{roomId}</b> • {status} • {members.length}/10 • {roleLabel} • tree:{visibility.shareTreeEnabled ? "shared" : "private"}
      </div>

      {isHost && (
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, opacity: 0.85 }}>
          <input type="checkbox" checked={visibility.shareTreeEnabled} onChange={(e) => setShareTreeEnabled(e.target.checked)} />
          Share tree
        </label>
      )}

      {pending > 0 && (
        <button onClick={onOpenRequests} style={{ ...btnSm, borderColor: "#111827" }} title="Review requests">
          Requests ({pending})
        </button>
      )}
    </div>
  );
}

function RequestsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { isHost, editRequests, resolveEditRequest, terminalRequests, doc, setTerminalPolicy } = useCollab();

  if (!open) return null;

  const Y_TERM_POLICY = "terminal:policy";
  const Y_TERM_REQUESTS = "terminal:requests";

  const yPolicy = doc.getMap<any>(Y_TERM_POLICY);
  const yReq = doc.getArray<any>(Y_TERM_REQUESTS);

  const grantTerminal = (userId: string) => {
    if (!isHost) return;
    doc.transact(() => {
      yPolicy.set("shared", true);
      yPolicy.set("allowGuestInput", true);
      yPolicy.set("controllerUserId", userId);
      // remove any requests for that user
      const arr = yReq.toArray();
      for (let i = arr.length - 1; i >= 0; i--) {
        if (String(arr[i]?.userId ?? "") === userId) yReq.delete(i, 1);
      }
    });
    // keep provider snapshot in sync (host control)
    setTerminalPolicy({ shared: true, allowGuestInput: true, controllerUserId: userId });
  };

  const denyTerminal = (id: string) => {
    if (!isHost) return;
    const idx = yReq.toArray().findIndex((x: any) => x?.id === id);
    if (idx >= 0) doc.transact(() => yReq.delete(idx, 1));
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.35)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
      }}
      onMouseDown={onClose}
    >
      <div
        style={{ width: 760, maxWidth: "92vw", background: "#fff", borderRadius: 12, padding: 14, border: "1px solid #e5e7eb" }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ fontWeight: 700 }}>Requests</div>
          <div style={{ marginLeft: "auto" }}>
            <button onClick={onClose} style={btnSm}>
              ✕
            </button>
          </div>
        </div>

        {!isHost ? (
          <div style={{ marginTop: 12, opacity: 0.8 }}>Only the host can approve requests.</div>
        ) : (
          <>
            <div style={{ marginTop: 14, fontWeight: 700 }}>Edit requests</div>
            {editRequests.length === 0 ? (
              <div style={{ marginTop: 6, opacity: 0.75, fontSize: 12 }}>No edit requests.</div>
            ) : (
              <div style={{ marginTop: 8, display: "grid", gap: 8 }}>
                {editRequests.map((r) => (
                  <div key={r.id} style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 10, display: "flex", gap: 10, alignItems: "center" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, opacity: 0.8 }}>
                        {r.requestedBy.name} requests edit access
                      </div>
                      <div style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace", fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {r.path}
                      </div>
                    </div>
                    <button onClick={() => resolveEditRequest(r.id, false)} style={btnSm}>
                      Deny
                    </button>
                    <button onClick={() => resolveEditRequest(r.id, true)} style={{ ...btnSm, background: "#111827", color: "#fff", borderColor: "#111827" }}>
                      Approve
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div style={{ marginTop: 18, fontWeight: 700 }}>Terminal requests</div>
            {terminalRequests.length === 0 ? (
              <div style={{ marginTop: 6, opacity: 0.75, fontSize: 12 }}>No terminal requests.</div>
            ) : (
              <div style={{ marginTop: 8, display: "grid", gap: 8 }}>
                {terminalRequests.map((r) => (
                  <div key={r.id} style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 10, display: "flex", gap: 10, alignItems: "center" }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12, opacity: 0.8 }}>{r.name} requests terminal control</div>
                      <div style={{ fontSize: 12, opacity: 0.65 }}>{new Date(r.createdAt).toLocaleString()}</div>
                    </div>
                    <button onClick={() => denyTerminal(r.id)} style={btnSm}>
                      Deny
                    </button>
                    <button onClick={() => grantTerminal(r.userId)} style={{ ...btnSm, background: "#111827", color: "#fff", borderColor: "#111827" }}>
                      Grant
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function RoomDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { setRoomId } = useCollab();

  const [tab, setTab] = useState<"create" | "join">("create");
  const [roomName, setRoomName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setTab("create");
    setRoomName("");
    setJoinCode("");
    setErr(null);
  }, [open]);

  if (!open) return null;

  const createRoom = () => {
    const name = roomName.trim();
    if (name.length < 2) {
      setErr("Room name must be at least 2 characters.");
      return;
    }

    const code = randomJoinCode(8);
    const meta: RoomMeta = { docName: code, name, joinCode: code, maxUsers: 10 };
    saveRoomMeta(meta);

    setRoomId(code);
    onClose();
  };

  const joinRoom = () => {
    const code = joinCode.trim().toUpperCase();
    if (code.length < 4) {
      setErr("Enter a valid join code.");
      return;
    }

    const meta: RoomMeta = { docName: code, name: code, joinCode: code, maxUsers: 10 };
    saveRoomMeta(meta);

    setRoomId(code);
    onClose();
  };

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999 }}
      onMouseDown={onClose}
    >
      <div
        style={{ width: 480, maxWidth: "92vw", background: "#fff", borderRadius: 12, padding: 14, border: "1px solid #e5e7eb" }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ fontWeight: 700 }}>Rooms</div>
          <div style={{ marginLeft: "auto" }}>
            <button onClick={onClose} style={btnSm}>
              ✕
            </button>
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <button onClick={() => setTab("create")} style={{ ...btnSm, background: tab === "create" ? "#f3f4f6" : "#fff" }}>
            Create
          </button>
          <button onClick={() => setTab("join")} style={{ ...btnSm, background: tab === "join" ? "#f3f4f6" : "#fff" }}>
            Join
          </button>
        </div>

        {err && <div style={{ marginTop: 10, color: "crimson", fontSize: 12 }}>{err}</div>}

        {tab === "create" ? (
          <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 12, opacity: 0.75 }}>Room name</span>
              <input
                value={roomName}
                onChange={(e) => setRoomName(e.target.value)}
                placeholder="e.g. Team Alpha"
                style={{ padding: "8px 10px", border: "1px solid #d1d5db", borderRadius: 8, outline: "none" }}
              />
            </label>

            <button
              onClick={createRoom}
              style={{ border: "1px solid #111827", borderRadius: 8, background: "#111827", color: "#fff", padding: "8px 10px", cursor: "pointer" }}
            >
              Create room (max 10)
            </button>
          </div>
        ) : (
          <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 12, opacity: 0.75 }}>Join code</span>
              <input
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value)}
                placeholder="e.g. K7P9Q2XA"
                style={{ padding: "8px 10px", border: "1px solid #d1d5db", borderRadius: 8, outline: "none" }}
              />
            </label>

            <button
              onClick={joinRoom}
              style={{ border: "1px solid #111827", borderRadius: 8, background: "#111827", color: "#fff", padding: "8px 10px", cursor: "pointer" }}
            >
              Join room
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function PeoplePanel() {
  const { members, isHost, setMemberRole, me, role } = useCollab();
  const [open, setOpen] = useState(true);

  return (
    <div style={{ borderBottom: "1px solid #e5e7eb" }}>
      <div style={{ padding: 10, display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ fontWeight: 700, flex: 1 }}>People ({members.length})</div>
        <button onClick={() => setOpen((v) => !v)} style={btnSm}>
          {open ? "Hide" : "Show"}
        </button>
      </div>

      {open && (
        <div style={{ padding: "0 10px 10px 10px", display: "grid", gap: 8 }}>
          {members.map((m) => {
            const self = m.userId === me.userId;
            return (
              <div key={m.userId} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ width: 10, height: 10, borderRadius: 999, background: m.color, display: "inline-block" }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {m.name} {self ? <span style={{ opacity: 0.6 }}>(you)</span> : null}
                  </div>
                  <div style={{ fontSize: 11, opacity: 0.7 }}>{m.role}</div>
                </div>

                {isHost && !self && role === "host" ? (
                  <select
                    value={m.role}
                    onChange={(e) => setMemberRole(m.userId, e.target.value as any)}
                    style={{ padding: "4px 6px", fontSize: 12 }}
                    title="Host can grant editor/viewer role"
                  >
                    <option value="viewer">viewer</option>
                    <option value="editor">editor</option>
                  </select>
                ) : (
                  <span
                    style={{
                      fontSize: 11,
                      padding: "2px 8px",
                      borderRadius: 999,
                      border: "1px solid rgba(0,0,0,0.15)",
                      background: "rgba(0,0,0,0.03)",
                      opacity: 0.85,
                    }}
                  >
                    {m.role}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* =========================
   Main protected app UI
========================= */

function AppShell() {
  const { user, logout, token } = useAuth();

  const [showTerminal, setShowTerminal] = useState(true);
  const [showChat, setShowChat] = useState(true);

  // file open state (only needs the current active file + its initial content)
  const [activePath, setActivePath] = useState<string | undefined>();
  const [activeContent, setActiveContent] = useState<string>("");

  const cwd = cheapDirname(activePath ?? null);

  // Auth wrapper for FileExplorer calls
  const authedRequestJson = useMemo(() => {
    return <T,>(path: string, opts: RequestInit = {}) => requestJson<T>(path, { ...opts, token });
  }, [token]);

  const [roomDialogOpen, setRoomDialogOpen] = useState(false);
  const [requestsOpen, setRequestsOpen] = useState(false);

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
        <div style={{ fontWeight: 600 }}>Room Collaboration Workspace</div>

        <RoomBar onOpenRoomDialog={() => setRoomDialogOpen(true)} onOpenRequests={() => setRequestsOpen(true)} />

        <div style={{ marginLeft: "auto", display: "flex", gap: 10, alignItems: "center" }}>
          <div style={{ fontSize: 12, opacity: 0.75 }}>{user?.email}</div>

          <button onClick={() => setShowTerminal((v) => !v)} style={btnSm}>
            {showTerminal ? "Hide Terminal" : "Show Terminal"}
          </button>

          <button onClick={() => setShowChat((v) => !v)} style={btnSm}>
            {showChat ? "Hide Chat" : "Show Chat"}
          </button>

          <button onClick={logout} style={btnSm}>
            Logout
          </button>
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: "1 1 auto", minHeight: 0, display: "flex", minWidth: 0 }}>
        <aside style={{ width: 340, minWidth: 260, maxWidth: 560, borderRight: "1px solid #e5e7eb", overflow: "hidden" }}>
          <PeoplePanel />
          <div style={{ height: "calc(100% - 0px)" }}>
            <FileExplorer
              requestJson={authedRequestJson}
              activePath={activePath}
              onOpenFile={(path: string, content: string) => {
                setActivePath(path);
                setActiveContent(content ?? "");
              }}
            />
          </div>
        </aside>

        <main style={{ flex: "1 1 auto", minWidth: 0, minHeight: 0, display: "flex", flexDirection: "row" }}>
          <div style={{ flex: "1 1 auto", minWidth: 0, display: "flex", flexDirection: "column" }}>
            <div style={{ flex: "1 1 auto", minHeight: 0 }}>
              <CodeEditor filePath={activePath ?? null} initialContent={activeContent} />
            </div>

            {showTerminal && (
              <div style={{ height: 260, borderTop: "1px solid #e5e7eb" }}>
                <TerminalPanel cwd={cwd ?? undefined} />
              </div>
            )}
          </div>

          {showChat && (
            <div style={{ width: 320, borderLeft: "1px solid #e5e7eb", display: "flex", flexDirection: "column" }}>
              <ChatPanel />
            </div>
          )}
        </main>
      </div>

      <RoomDialog open={roomDialogOpen} onClose={() => setRoomDialogOpen(false)} />
      <RequestsDialog open={requestsOpen} onClose={() => setRequestsOpen(false)} />
    </div>
  );
}

/* =========================
   App (Router + Provider + CollabProvider)
========================= */

function CollabWrapper() {
  const { user, token } = useAuth();
  const meta = loadRoomMeta();

  return (
    <CollabProvider
      defaultRoomId={meta?.docName ?? "main-room"}
      displayName={user?.email?.split("@")[0] ?? "Guest"}
      userId={user?.id ?? user?.email ?? "guest"}
      token={token ?? ""}
    >
      <AppShell />
    </CollabProvider>
  );
}

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
                <CollabWrapper />
              </ProtectedRoute>
            }
          />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </HashRouter>
  );
}

const btnSm: React.CSSProperties = {
  padding: "6px 10px",
  border: "1px solid #d1d5db",
  borderRadius: 6,
  background: "#fff",
  cursor: "pointer",
};
