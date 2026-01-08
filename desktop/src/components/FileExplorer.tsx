import React, { useCallback, useEffect, useMemo, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { readDir } from "@tauri-apps/plugin-fs";
import { join } from "@tauri-apps/api/path";

type TreeNode = {
  name: string;
  path: string;
  isDir: boolean;
};

function isUriPath(p: string) {
  return p.startsWith("file://") || p.startsWith("content://");
}

async function childPath(parent: string, name: string): Promise<string> {
  // Desktop: parent is typically an absolute filesystem path -> use join()
  if (!isUriPath(parent)) return join(parent, name);

  // Mobile / URI format: resolve via URL
  const base = parent.endsWith("/") ? parent : `${parent}/`;
  return new URL(name, base).toString();
}

function sortNodes(nodes: TreeNode[]) {
  return [...nodes].sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

export default function FileExplorer(props: {
  /** If provided, explorer shows this folder; otherwise user picks one */
  rootDir?: string | null;
  onRootDirChange?: (dir: string | null) => void;

  /** Wire these to your editor / terminal / viewer */
  onOpenFile?: (path: string) => void;
  onOpenDir?: (path: string) => void;
}) {
  const { rootDir, onRootDirChange, onOpenFile, onOpenDir } = props;

  const [internalRoot, setInternalRoot] = useState<string | null>(rootDir ?? null);
  const effectiveRoot = rootDir ?? internalRoot;

  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [childrenByDir, setChildrenByDir] = useState<Record<string, TreeNode[]>>({});
  const [loadingByDir, setLoadingByDir] = useState<Record<string, boolean>>({});
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // keep internal state in sync if parent controls rootDir
  useEffect(() => {
    if (rootDir !== undefined) setInternalRoot(rootDir);
  }, [rootDir]);

  const setRoot = useCallback(
    (dir: string | null) => {
      setInternalRoot(dir);
      onRootDirChange?.(dir);

      setChildrenByDir({});
      setExpanded(dir ? { [dir]: true } : {});
      setSelectedPath(null);
      setError(null);
    },
    [onRootDirChange]
  );

  const loadDir = useCallback(async (dirPath: string) => {
    try {
      setLoadingByDir((p) => ({ ...p, [dirPath]: true }));
      setError(null);

      const entries = await readDir(dirPath);

      const nodes: TreeNode[] = await Promise.all(
        entries.map(async (e) => ({
          name: e.name ?? "(unknown)",
          isDir: !!e.isDirectory,
          path: await childPath(dirPath, e.name ?? ""),
        }))
      );

      setChildrenByDir((p) => ({ ...p, [dirPath]: sortNodes(nodes) }));
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setLoadingByDir((p) => ({ ...p, [dirPath]: false }));
    }
  }, []);

  // initial load
  useEffect(() => {
    if (!effectiveRoot) return;
    loadDir(effectiveRoot);
    setExpanded((p) => ({ ...p, [effectiveRoot]: true }));
  }, [effectiveRoot, loadDir]);

  const pickFolder = useCallback(async () => {
    const selected = await open({ directory: true, multiple: false });
    if (!selected || Array.isArray(selected)) return;

    setRoot(selected);
  }, [setRoot]);

  const toggleDir = useCallback(
    async (dirPath: string) => {
      setExpanded((p) => ({ ...p, [dirPath]: !p[dirPath] }));

      // lazy-load on first expand
      const alreadyLoaded = childrenByDir[dirPath] !== undefined;
      const willExpand = !expanded[dirPath];
      if (willExpand && !alreadyLoaded) {
        await loadDir(dirPath);
      }
    },
    [childrenByDir, expanded, loadDir]
  );

  const refresh = useCallback(async () => {
    if (!effectiveRoot) return;

    // reload all currently-expanded directories (cheap for small trees; easy + predictable)
    const expandedDirs = Object.entries(expanded)
      .filter(([, v]) => v)
      .map(([k]) => k);

    // ensure root is always included
    const dirs = Array.from(new Set([effectiveRoot, ...expandedDirs]));
    for (const d of dirs) {
      await loadDir(d);
    }
  }, [effectiveRoot, expanded, loadDir]);

  const renderNode = useCallback(
    (node: TreeNode, depth: number) => {
      const isExpanded = !!expanded[node.path];
      const children = childrenByDir[node.path];
      const isLoading = !!loadingByDir[node.path];

      return (
        <div key={node.path}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "4px 8px",
              paddingLeft: 8 + depth * 14,
              cursor: "pointer",
              userSelect: "none",
              background: selectedPath === node.path ? "rgba(255,255,255,0.08)" : "transparent",
            }}
            onClick={() => {
              setSelectedPath(node.path);
              if (node.isDir) onOpenDir?.(node.path);
              else onOpenFile?.(node.path);
            }}
            onDoubleClick={() => {
              if (node.isDir) toggleDir(node.path);
              else onOpenFile?.(node.path);
            }}
            title={node.path}
          >
            {node.isDir ? (
              <span
                style={{ width: 14, display: "inline-block" }}
                onClick={(e) => {
                  e.stopPropagation();
                  toggleDir(node.path);
                }}
              >
                {isExpanded ? "▾" : "▸"}
              </span>
            ) : (
              <span style={{ width: 14, display: "inline-block" }} />
            )}

            <span style={{ opacity: node.isDir ? 1 : 0.9 }}>{node.name}</span>
          </div>

          {node.isDir && isExpanded && (
            <div>
              {isLoading && (
                <div style={{ paddingLeft: 8 + (depth + 1) * 14, paddingTop: 2, opacity: 0.75 }}>
                  Loading…
                </div>
              )}
              {children?.map((c) => renderNode(c, depth + 1))}
            </div>
          )}
        </div>
      );
    },
    [childrenByDir, expanded, loadingByDir, onOpenDir, onOpenFile, selectedPath, toggleDir]
  );

  const rootChildren = useMemo(() => {
    if (!effectiveRoot) return [];
    return childrenByDir[effectiveRoot] ?? [];
  }, [childrenByDir, effectiveRoot]);

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", minWidth: 0 }}>
      <div
        style={{
          padding: "10px 10px 8px",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <div style={{ fontWeight: 600 }}>Explorer</div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={pickFolder} style={{ padding: "4px 8px" }}>
            Open Folder
          </button>
          <button onClick={refresh} style={{ padding: "4px 8px" }} disabled={!effectiveRoot}>
            Refresh
          </button>
        </div>
      </div>

      <div style={{ flex: 1, overflow: "auto" }}>
        {!effectiveRoot ? (
          <div style={{ padding: 10, opacity: 0.85 }}>
            No folder selected. Click <b>Open Folder</b>.
          </div>
        ) : (
          <div>
            {rootChildren.map((n) => renderNode(n, 0))}
            {error && (
              <div style={{ padding: 10, color: "salmon", whiteSpace: "pre-wrap" }}>
                {error}
              </div>
            )}
          </div>
        )}
      </div>

      <div
        style={{
          padding: "8px 10px",
          borderTop: "1px solid rgba(255,255,255,0.08)",
          fontSize: 12,
          opacity: 0.8,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
        title={effectiveRoot ?? ""}
      >
        {effectiveRoot ? effectiveRoot : "—"}
      </div>
    </div>
  );
}
