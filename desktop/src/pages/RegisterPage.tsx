import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

export default function RegisterPage() {
  const { register } = useAuth();
  const nav = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
      await register(email.trim(), password);
      nav("/", { replace: true });
    } catch (ex: any) {
      setErr(ex?.message ?? "Registration failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ maxWidth: 420, margin: "64px auto", padding: 24, border: "1px solid #e5e7eb", borderRadius: 12 }}>
      <h1 style={{ margin: 0, marginBottom: 16 }}>Create account</h1>

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
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          <span>Confirm password</span>
          <input type="password" value={password2} onChange={(e) => setPassword2(e.target.value)} autoComplete="new-password" />
        </label>

        <button disabled={busy} type="submit">
          {busy ? "Creating..." : "Create account"}
        </button>
      </form>

      <div style={{ marginTop: 14 }}>
        Already have an account? <Link to="/login">Login</Link>
      </div>
    </div>
  );
}
