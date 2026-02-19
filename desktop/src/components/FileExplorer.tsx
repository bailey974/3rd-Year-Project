import React, { useEffect, useMemo, useState } from "react";

type AnyEntry = any;

type NormalEntry = {
  name: string;
  path: string;
  type: "file" | "dir";
};

type ListResponse = {
  path: string;
  entries: AnyEntry[];
};

type ReadResponse =
  | { content: string } // expected
  | { data: string } // fallback
  | string; // fallback

export type RequestJson = <T = any>(path: string, opts?: RequestInit) => Promise<T>;

type Props = {
  requestJson: RequestJson;
  initialPath?: string;
  activePath?: string;
  onOpenFile?: (path: string, content?: string) => void;
};

function normalizeEntry(e: AnyEntry): NormalEntry {
  const rawPath: string =
    e.path ?? e.full_path ?? e.file_path ?? e.filePath ?? e.abs_path ?? "";
  const rawName: string =
    e.name ?? e.filename ?? e.base ?? e.basename ?? rawPath.split(/[\\/]/).pop() ?? "";

  const isDir =
    e.type === "dir" ||
    e.kind === "dir" ||
    e.is_dir === true ||
    e.isDir === true ||
    e.directory === true;

  return {
    name: rawName,
    path: rawPath,
    type: isDir ? "dir" : "file",
  };
}

export default function FileExplorer({
  requestJson,
  initialPath = "",
  activePath,
  onOpenFile,
}: Props) {
  const [cwd, setCwd] = useState(initialPath);
  const [entries, setEntries] = useState<NormalEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter((x) => {
      const hay = `${x.name} ${x.path}`.toLowerCase();
      return hay.includes(q);
    });
  }, [entries, filter]);

  async function refresh(path = cwd) {
    setLoading(true);
    setErr(null);
    try {
      const res = await requestJson<ListResponse>(
        `/fs/list?path=${encodeURIComponent(path)}`
      );

      const normalized = (res.entries ?? []).map(normalizeEntry);

      normalized.sort((a, b) => {
        if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
        return a.name.localeCompare(b.name);
      });

      setCwd(res.path ?? path);
      setEntries(normalized);
    } catch (e: any) {
      setErr(e?.message ?? "Failed to load directory");
    } finally {
      setLoading(false);
    }
  }

  function goUp() {
    const p = (cwd ?? "").replace(/[\\\/]+$/, "");
    if (!p) return;

    const sep = p.includes("\\") ? "\\" : "/";
    const idx = p.lastIndexOf(sep);

    if (idx <= 0) refresh(sep);
    else refresh(p.slice(0, idx));
  }

  async function openEntry(e: NormalEntry) {
    if (e.type === "dir") {
      await refresh(e.path);
      return;
    }

    // ✅ CRITICAL: always fire immediately so App can set activePath and CodeEditor can react
    onOpenFile?.(e.path);

    // Optional: try to read content from backend; but don't block opening on it
    try {
      const readRes = await requestJson<ReadResponse>(
        `/fs/read?path=${encodeURIComponent(e.path)}`
      );

      const content =
        typeof readRes === "string"
          ? readRes
          : (readRes as any)?.content ?? (readRes as any)?.data ?? "";

      if (typeof content === "string") {
        onOpenFile?.(e.path, content);
      }
    } catch {
      // ignore read failure; file is still "opened" by path selection
    }
  }

  useEffect(() => {
    void refresh(initialPath);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <div style={{ padding: 10, display: "flex", gap: 8, alignItems: "center" }}>
        <div style={{ fontWeight: 700, flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}>
          Files
        </div>
        <button onClick={goUp} disabled={loading} style={btnStyle}>Up</button>
        <button onClick={() => refresh()} disabled={loading} style={btnStyle}>Refresh</button>
      </div>

      <div
        title={cwd}
        style={{
          padding: "0 10px 10px 10px",
          fontSize: 12,
          opacity: 0.75,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {cwd || "(root)"}
      </div>

      <div style={{ padding: "0 10px 10px 10px" }}>
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter..."
          style={{
            width: "100%",
            padding: "8px 10px",
            borderRadius: 8,
            border: "1px solid #d1d5db",
            outline: "none",
          }}
        />
      </div>

      {err && (
        <div style={{ padding: "0 10px 10px 10px", color: "crimson", fontSize: 12 }}>
          {err}
        </div>
      )}

      <div style={{ flex: 1, overflow: "auto" }}>
        {loading && entries.length === 0 ? (
          <div style={{ padding: 10, opacity: 0.75 }}>Loading…</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 10, opacity: 0.75 }}>No entries.</div>
        ) : (
          filtered.map((e) => {
            const isActive = !!activePath && activePath === e.path;
            return (
              <div
                key={e.path}
                onClick={() => void openEntry(e)}
                onDoubleClick={() => void openEntry(e)}
                title={e.path}
                style={{
                  padding: "8px 10px",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  background: isActive ? "rgba(0,0,0,0.06)" : "transparent",
                }}
              >
                <span style={{ width: 18, textAlign: "center" }}>
                  {e.type === "dir" ? "📁" : "📄"}
                </span>
                <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {e.name}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  padding: "6px 10px",
  borderRadius: 8,
  border: "1px solid #d1d5db",
  background: "#fff",
  cursor: "pointer",
};
