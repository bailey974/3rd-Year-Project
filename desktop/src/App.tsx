import { useState } from "react";
import { dirname } from "@tauri-apps/api/path";

import CodeEditor from "./components/CodeEditor";
import TerminalPanel from "./components/TerminalPanel";
import FileExplorer from "./components/FileExplorer";

export default function App() {
  const [showTerminal, setShowTerminal] = useState(true);

  // Workspace / “currently being accessed” directory
  const [cwd, setCwd] = useState<string | null>(null);

  // Optional: track the last file the user clicked in the explorer
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

        {/* Optional: show active file path */}
        {activeFile && (
          <div
            style={{
              maxWidth: 520,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              color: "#6b7280",
              fontSize: 12,
            }}
            title={activeFile}
          >
            {activeFile}
          </div>
        )}

        <div style={{ marginLeft: "auto" }}>
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
        </div>
      </div>

      {/* Body: Explorer (left) + Main (right) */}
      <div style={{ flex: "1 1 auto", minHeight: 0, display: "flex", minWidth: 0 }}>
        {/* File Explorer sidebar */}
        <aside
          style={{
            width: 300,
            minWidth: 240,
            maxWidth: 420,
            borderRight: "1px solid #e5e7eb",
            flex: "0 0 auto",
            overflow: "hidden",
          }}
        >
          <FileExplorer
            rootDir={cwd}
            onRootDirChange={(dir) => setCwd(dir)}
            onOpenDir={(dir) => setCwd(dir)}
            onOpenFile={async (path) => {
              setActiveFile(path);

              // Set terminal cwd to the file’s directory (best-effort)
              try {
                const dir = await dirname(path);
                setCwd(dir);
              } catch {
                // ignore if path parsing fails (e.g., URI formats)
              }

              // TODO: wire `path` into CodeEditor open-file logic (if/when supported)
              console.log("Open file:", path);
            }}
          />
        </aside>

        {/* Main: Editor + Terminal */}
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
            <CodeEditor />
          </div>

          {/* Terminal dock */}
          {showTerminal && (
            <div
              style={{
                height: 240,
                borderTop: "1px solid #e5e7eb",
                flex: "0 0 auto",
              }}
            >
              <TerminalPanel cwd={cwd ?? undefined} />
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
