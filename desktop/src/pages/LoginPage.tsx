import { FormEvent, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

export default function LoginPage() {
  const { login } = useAuth();
  const nav = useNavigate();
  const location = useLocation() as any;

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      await login(email.trim(), password);
      const dest = location?.state?.from ?? "/";
      nav(dest, { replace: true });
    } catch (ex: any) {
      setErr(ex?.message ?? "Login failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ maxWidth: 420, margin: "64px auto", padding: 24, border: "1px solid #e5e7eb", borderRadius: 12 }}>
      <h1 style={{ margin: 0, marginBottom: 16 }}>Login</h1>

      {err && (
        <div style={{ marginBottom: 12, color: "#b91c1c" }}>
          {err}
        </div>
      )}

      <form onSubmit={onSubmit} style={{ display: "grid", gap: 12 }}>
        <label style={{ display: "grid", gap: 6 }}>
          <span>Email</span>
          <input value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          <span>Password</span>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
        </label>

        <button disabled={busy} type="submit">
          {busy ? "Signing in..." : "Sign in"}
        </button>
      </form>

      <div style={{ marginTop: 14 }}>
        No account? <Link to="/register">Create one</Link>
      </div>
    </div>
  );
}
