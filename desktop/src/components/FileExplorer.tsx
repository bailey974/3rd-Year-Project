// src/components/FileExplorer.tsx
import React, { useEffect, useMemo, useState } from "react";

type FsEntry = {
  name: string;
  path: string;
  type: "file" | "dir";
  size?: number;
  modified?: string;
};

type ListResponse = {
  path: string;
  entries: FsEntry[];
};

type ReadResponse = {
  path: string;
  content: string;
};

export type RequestJson = <T = any>(path: string, opts?: RequestInit) => Promise<T>;

type Props = {
  requestJson: RequestJson;

  // starting folder (server-dependent). Examples: "", "/", "C:\\Users\\..."
  initialPath?: string;

  // called when a file is opened
  onOpenFile?: (filePath: string, content: string) => void;

  // optional UI: highlight selected file
  activePath?: string;

  className?: string;
};

export default function FileExplorer({
  requestJson,
  initialPath = "",
  onOpenFile,
  activePath,
  className,
}: Props) {
  const [cwd, setCwd] = useState(initialPath);
  const [entries, setEntries] = useState<FsEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return entries;

    return entries.filter((e) => {
      const hay = `${e.name} ${e.path}`.toLowerCase();
      return hay.includes(q);
    });
  }, [entries, filter]);

  async function refresh(path = cwd) {
    setLoading(true);
    setErr(null);
    try {
      // Adjust this route to your backend
      // Expected: { path, entries: [{name, path, type:'file'|'dir'}...] }
      const data = await requestJson<ListResponse>(`/fs/list?path=${encodeURIComponent(path)}`);

      const sorted = [...(data.entries ?? [])].sort((a, b) => {
        if (a.type !== b.type) return a.type === "dir" ? -1 : 1; // dirs first
        return a.name.localeCompare(b.name);
      });

      setCwd(data.path ?? path);
      setEntries(sorted);
    } catch (e: any) {
      setErr(e?.message ?? "Failed to load directory.");
    } finally {
      setLoading(false);
    }
  }

  async function openEntry(e: FsEntry) {
    if (e.type === "dir") {
      await refresh(e.path);
      return;
    }

    try {
      setLoading(true);
      setErr(null);

      // Adjust this route to your backend
      // Expected: { path, content }
      const data = await requestJson<ReadResponse>(`/fs/read?path=${encodeURIComponent(e.path)}`);

      onOpenFile?.(data.path ?? e.path, data.content ?? "");
    } catch (ex: any) {
      setErr(ex?.message ?? "Failed to open file.");
    } finally {
      setLoading(false);
    }
  }

  function goUp() {
    // Works for both "/" and "C:\..." style paths
    const p = cwd.replace(/[\\\/]+$/, "");
    if (!p) return;

    const sep = p.includes("\\") ? "\\" : "/";
    const idx = p.lastIndexOf(sep);
    if (idx <= 0) {
      // back to root-ish
      refresh(sep);
      return;
    }
    refresh(p.slice(0, idx));
  }

  useEffect(() => {
    refresh(initialPath);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className={className}
      style={{
        display: "flex",
        flexDirection: "column",
        borderRight: "1px solid rgba(255,255,255,0.08)",
        minWidth: 260,
        width: 320,
        height: "100%",
      }}
    >
      {/* Header / Toolbar */}
      <div style={{ padding: 10, display: "flex", gap: 8, alignItems: "center" }}>
        <div style={{ fontWeight: 600, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          Files
        </div>

        <button onClick={goUp} disabled={loading} style={btnStyle}>
          Up
        </button>
        <button onClick={() => refresh()} disabled={loading} style={btnStyle}>
          Refresh
        </button>
      </div>

      {/* Current path */}
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

      {/* Filter */}
      <div style={{ padding: "0 10px 10px 10px" }}>
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter files..."
          style={{
            width: "100%",
            padding: "8px 10px",
            borderRadius: 8,
            border: "1px solid rgba(255,255,255,0.12)",
            background: "transparent",
            color: "inherit",
            outline: "none",
          }}
        />
      </div>

      {/* Errors */}
      {err && (
        <div style={{ padding: "0 10px 10px 10px", color: "#ff7b7b", fontSize: 12 }}>
          {err}
        </div>
      )}

      {/* List */}
      <div style={{ flex: 1, overflow: "auto" }}>
        {loading && entries.length === 0 ? (
          <div style={{ padding: 10, opacity: 0.75 }}>Loading…</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 10, opacity: 0.75 }}>No files.</div>
        ) : (
          filtered.map((e) => {
            const isActive = !!activePath && activePath === e.path;

            return (
              <div
                key={e.path}
                onDoubleClick={() => openEntry(e)}
                onClick={() => e.type === "file" && openEntry(e)}
                title={e.path}
                style={{
                  padding: "8px 10px",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  background: isActive ? "rgba(255,255,255,0.08)" : "transparent",
                }}
              >
                <span style={{ width: 16, textAlign: "center", opacity: 0.9 }}>
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
  border: "1px solid rgba(255,255,255,0.12)",
  background: "transparent",
  color: "inherit",
  cursor: "pointer",
};
