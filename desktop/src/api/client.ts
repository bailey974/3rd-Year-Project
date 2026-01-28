const API_BASE =
  import.meta.env.VITE_API_BASE_URL?.toString() ?? "http://localhost:8000";

export type AuthResponse = {
  access: string;
  refresh?: string;
  user?: { id: number | string; email: string; username?: string };
};

async function request<T>(
  path: string,
  opts: RequestInit & { token?: string | null } = {}
): Promise<T> {
  const headers = new Headers(opts.headers);

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

export const api = {
  login: (email: string, password: string) =>
    request<AuthResponse>("/api/auth/login/", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),

  register: (email: string, password: string) =>
    request<AuthResponse>("/api/auth/register/", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),

  me: (token: string) =>
    request<{ id: number | string; email: string; username?: string }>(
      "/api/auth/me/",
      { method: "GET", token }
    ),
};
