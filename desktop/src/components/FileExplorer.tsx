// src/components/FileExplorer.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { readDir, readTextFile } from "@tauri-apps/plugin-fs";

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
  /**
   * If provided, FileExplorer will try HTTP routes first.
   * If omitted (or the HTTP call fails), it falls back to Tauri FS plugin.
   */
  requestJson?: RequestJson;

  /** Starting folder (server-dependent). Examples: "", "/", "C:\\Users\\..." */
  initialPath?: string;

  /**
   * Backwards-compatible "selection" callback.
   * If your app already uses `onFileSelect(fileId, fileName)` style, you can keep it.
   * We call it with (fullPath, name).
   */
  onFileSelect?: (filePath: string, fileName?: string) => void;

  /**
   * Called when a file is opened AND its contents were read.
   * (If you only need the path, use onFileSelect or set activePath from parent.)
   */
  onOpenFile?: (filePath: string, content: string) => void;

  /** Optional UI: highlight selected file */
  activePath?: string;

  className?: string;
};

// Minimal shape of @tauri-apps/plugin-fs DirEntry
type TauriDirEntry = {
  name: string;
  isDirectory: boolean;
  isFile: boolean;
  isSymlink: boolean;
};

function isWindowsLikePath(p: string): boolean {
  return /^(?:[A-Za-z]:\\|[A-Za-z]:\/|\\\\)/.test(p) || p.includes("\\");
}

function joinChildPath(parent: string, childName: string): string {
  if (!parent) return childName;

  // If user is at a Windows drive root like "C:" or "C:/" or "C:\"
  const driveOnly = parent.replace(/[\\/]+$/, "");
  if (/^[A-Za-z]:$/.test(driveOnly)) {
    return `${driveOnly}\\${childName}`;
  }

  const sep = isWindowsLikePath(parent) ? "\\" : "/";
  const base = parent.replace(/[\\/]+$/, "");
  if (base === "") return sep + childName;
  if (base === "/") return "/" + childName;
  return base + sep + childName;
}

function parentPath(p: string): string | null {
  const trimmed = p.replace(/[\\/]+$/, "");
  if (!trimmed) return null;

  // Windows drive paths
  const driveMatch = trimmed.match(/^([A-Za-z]:)([\\/].*)?$/);
  if (driveMatch) {
    const drive = driveMatch[1];
    const rest = trimmed.slice(drive.length);
    if (!rest || rest === "\\" || rest === "/") return null; // already at drive root

    const sep = isWindowsLikePath(trimmed) ? "\\" : "/";
    const idx = trimmed.lastIndexOf(sep);
    if (idx <= drive.length) return `${drive}${sep}`;
    return trimmed.slice(0, idx);
  }

  // POSIX
  if (trimmed === "/") return null;
  const idx = trimmed.lastIndexOf("/");
  if (idx <= 0) return "/";
  return trimmed.slice(0, idx);
}

export default function FileExplorer({
  requestJson,
  initialPath = "",
  onFileSelect,
  onOpenFile,
  activePath,
  className,
}: Props) {
  const [cwd, setCwd] = useState(initialPath);
  const [entries, setEntries] = useState<FsEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  // internal selection fallback if parent doesn't provide activePath
  const [internalActive, setInternalActive] = useState<string | null>(null);

  // Guard against out-of-order async loads
  const refreshSeq = useRef(0);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return entries;

    return entries.filter((e) => {
      const hay = `${e.name} ${e.path}`.toLowerCase();
      return hay.includes(q);
    });
  }, [entries, filter]);

  function normalizeEntryType(type: any): "file" | "dir" {
    const t = String(type ?? "").toLowerCase();
    return t === "dir" || t === "directory" ? "dir" : "file";
  }

  async function listViaHttp(path: string): Promise<ListResponse> {
    // Expected: { path, entries: [{name, path, type:'file'|'dir'}...] }
    return await requestJson!(`/fs/list?path=${encodeURIComponent(path)}`);
  }

  async function listViaTauri(path: string): Promise<ListResponse> {
    const dir = await readDir(path);
    const mapped: FsEntry[] = (dir as unknown as TauriDirEntry[])
      .filter((d) => !!d?.name)
      .map((d) => ({
        name: d.name,
        path: joinChildPath(path, d.name),
        type: d.isDirectory ? "dir" : "file",
      }));

    return { path, entries: mapped };
  }

  async function refresh(path = cwd) {
    const seq = ++refreshSeq.current;
    setLoading(true);
    setErr(null);

    try {
      let data: ListResponse | null = null;

      // Try HTTP first (if available)
      if (requestJson) {
        try {
          data = await listViaHttp(path);
        } catch {
          data = null;
        }
      }

      // Fallback to Tauri FS
      if (!data) {
        data = await listViaTauri(path);
      }

      if (refreshSeq.current !== seq) return;

      const sorted = [...(data.entries ?? [])]
        .map((e) => ({ ...e, type: normalizeEntryType((e as any).type) }))
        .sort((a, b) => {
          if (a.type !== b.type) return a.type === "dir" ? -1 : 1; // dirs first
          return a.name.localeCompare(b.name);
        });

      setCwd(data.path ?? path);
      setEntries(sorted);

      setInternalActive((prev) => {
        if (!prev) return prev;
        const stillThere = sorted.some((e) => e.path === prev);
        return stillThere ? prev : null;
      });
    } catch (e: any) {
      if (refreshSeq.current === seq) setErr(e?.message ?? "Failed to load directory.");
    } finally {
      if (refreshSeq.current === seq) setLoading(false);
    }
  }

  async function readViaHttp(path: string): Promise<ReadResponse> {
    // Expected: { path, content }
    return await requestJson!(`/fs/read?path=${encodeURIComponent(path)}`);
  }

  async function readViaTauri(path: string): Promise<ReadResponse> {
    const content = await readTextFile(path);
    return { path, content };
  }

  async function openEntry(entry: FsEntry) {
    if (entry.type === "dir") {
      await refresh(entry.path);
      return;
    }

    const seq = ++refreshSeq.current;
    setLoading(true);
    setErr(null);

    try {
      let data: ReadResponse | null = null;

      if (requestJson) {
        try {
          data = await readViaHttp(entry.path);
        } catch {
          data = null;
        }
      }

      if (!data) {
        data = await readViaTauri(entry.path);
      }

      if (refreshSeq.current !== seq) return;

      const finalPath = data.path ?? entry.path;
      setInternalActive(finalPath);

      // Call BOTH callbacks for compatibility (extra args are ignored in JS)
      onFileSelect?.(finalPath, entry.name);
      onOpenFile?.(finalPath, data.content ?? "");
    } catch (ex: any) {
      if (refreshSeq.current === seq) setErr(ex?.message ?? "Failed to open file.");
    } finally {
      if (refreshSeq.current === seq) setLoading(false);
    }
  }

  function goUp() {
    const p = parentPath(cwd);
    if (!p) return;
    refresh(p);
  }

  useEffect(() => {
    refresh(initialPath);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const effectiveActive = activePath ?? internalActive;

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
        <div
          style={{
            fontWeight: 600,
            flex: 1,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
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
          placeholder="Filter files…"
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
            const isActive = !!effectiveActive && effectiveActive === e.path;
            const isDir = e.type === "dir";

            return (
              <div
                key={e.path}
                onClick={() => {
                  setInternalActive(e.path);

                  if (!isDir) {
                    // Immediate "open" signal (path only) — feels like VS Code
                    onFileSelect?.(e.path, e.name);
                    // Also try to read content (if onOpenFile is wired)
                    void openEntry(e);
                  }
                }}
                onDoubleClick={() => {
                  if (isDir) void openEntry(e);
                }}
                title={e.path}
                style={{
                  padding: "8px 10px",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  background: isActive ? "rgba(255,255,255,0.08)" : "transparent",
                  userSelect: "none",
                }}
              >
                <span style={{ width: 16, textAlign: "center", opacity: 0.9 }}>
                  {isDir ? "📁" : "📄"}
                </span>
                <span
                  style={{
                    flex: 1,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
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
