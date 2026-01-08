import { useState } from "react";
import CodeEditor from "./components/CodeEditor";
import TerminalPanel from "./components/TerminalPanel";

export default function App() {
  const [showTerminal, setShowTerminal] = useState(true);

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
          <TerminalPanel />
        </div>
      )}
    </div>
  );
}
