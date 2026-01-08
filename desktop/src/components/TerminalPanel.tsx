import { useEffect, useMemo, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";

type TerminalDataPayload = { id: string; data: string };
type TerminalExitPayload = { id: string };

type Task = { label: string; cmd: string };

export default function TerminalPanel({ cwd }: { cwd?: string }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const termIdRef = useRef<string | null>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);

  const [ready, setReady] = useState(false);
  const [selectedTask, setSelectedTask] = useState<string>("");

  const tasks: Task[] = useMemo(
    () => [
      // JS/TS (Vite/React) common
      { label: "pnpm install", cmd: "pnpm install" },
      { label: "pnpm dev", cmd: "pnpm dev" },
      { label: "pnpm test", cmd: "pnpm test" },
      { label: "pnpm lint", cmd: "pnpm lint" },
      { label: "pnpm format", cmd: "pnpm format" },

      // Rust/Tauri common
      { label: "cargo test", cmd: "cargo test" },
      { label: "cargo fmt", cmd: "cargo fmt" },
      { label: "cargo clippy", cmd: "cargo clippy" },

      // Git common
      { label: "git status", cmd: "git status" },
      { label: "git diff", cmd: "git diff" },
    ],
    []
  );

  function sendLine(line: string) {
    const id = termIdRef.current;
    const term = termRef.current;
    if (!id || !term) return;

    // Show the command immediately for user feedback (optional)
    // The shell will also echo it depending on settings.
    // term.write(`\r\n> ${line}\r\n`);

    invoke("terminal_write", { id, data: line + "\r\n" }).catch((e) => {
      term.writeln(`\r\n[write error] ${String(e)}`);
    });

    term.focus();
  }

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const term = new Terminal({
      cursorBlink: true,
      convertEol: true,
      fontSize: 13,
      scrollback: 5000,
      disableStdin: false,
    });

    const fit = new FitAddon();
    term.loadAddon(fit);

    term.open(container);
    fit.fit();
    term.focus();

    termRef.current = term;
    fitRef.current = fit;

    let unlistenData: null | (() => void) = null;
    let unlistenExit: null | (() => void) = null;

    // Focus on click (important when Monaco steals focus)
    const focusTerminal = () => term.focus();
    container.addEventListener("mousedown", focusTerminal);

    // ResizeObserver handles panel resizing (not just window resize)
    const ro = new ResizeObserver(() => {
      const id = termIdRef.current;
      if (!id) return;
      fit.fit();
      invoke("terminal_resize", { id, cols: term.cols, rows: term.rows }).catch((e) => {
        term.writeln(`\r\n[resize error] ${String(e)}`);
      });
    });
    ro.observe(container);

    (async () => {
      const id = await invoke<string>("terminal_create", {
        cols: term.cols,
        rows: term.rows,
        cwd: cwd ?? undefined,
      });

      termIdRef.current = id;

      unlistenData = await listen<TerminalDataPayload>("terminal:data", (event) => {
        if (event.payload.id !== id) return;
        term.write(event.payload.data);
      });

      unlistenExit = await listen<TerminalExitPayload>("terminal:exit", (event) => {
        if (event.payload.id !== id) return;
        term.writeln("\r\n[process exited]");
        setReady(false);
      });

      // Keystrokes -> PTY
      term.onData((data) => {
        invoke("terminal_write", { id, data }).catch((e) => {
          term.writeln(`\r\n[write error] ${String(e)}`);
        });
      });

      // Initial resize sync
      fit.fit();
      await invoke("terminal_resize", { id, cols: term.cols, rows: term.rows }).catch((e) => {
        term.writeln(`\r\n[initial resize error] ${String(e)}`);
      });

      term.writeln("\r\n[terminal ready]");
      term.writeln("Tip: click inside terminal to focus, then type `dir` (Windows) or `ls` (mac/linux).");
      setReady(true);
      term.focus();
    })().catch((e) => {
      term.writeln(`\r\n[terminal init error] ${String(e)}`);
    });

    return () => {
      container.removeEventListener("mousedown", focusTerminal);
      ro.disconnect();

      if (unlistenData) unlistenData();
      if (unlistenExit) unlistenExit();

      const id = termIdRef.current;
      termIdRef.current = null;
      if (id) {
        invoke("terminal_kill", { id }).catch(() => {});
      }

      term.dispose();
    };
  }, [cwd]);

  return (
    <div style={{ height: "100%", width: "100%", display: "flex", flexDirection: "column" }}>
      {/* Task toolbar */}
      <div
        style={{
          display: "flex",
          gap: 8,
          alignItems: "center",
          padding: "6px 8px",
          borderBottom: "1px solid #1f2937",
          background: "#0b0f14",
          color: "#e5e7eb",
          flex: "0 0 auto",
        }}
      >
        <div style={{ fontWeight: 600 }}>Terminal</div>

        <select
          value={selectedTask}
          onChange={(e) => setSelectedTask(e.target.value)}
          style={{ marginLeft: 8, padding: "4px 6px" }}
        >
          <option value="">Run task…</option>
          {tasks.map((t) => (
            <option key={t.label} value={t.cmd}>
              {t.label}
            </option>
          ))}
        </select>

        <button
          disabled={!ready || !selectedTask}
          onClick={() => sendLine(selectedTask)}
          style={{
            padding: "4px 10px",
            border: "1px solid #374151",
            background: ready && selectedTask ? "#111827" : "#0b0f14",
            color: "#e5e7eb",
            cursor: ready && selectedTask ? "pointer" : "not-allowed",
          }}
        >
          Run
        </button>

        <button
          disabled={!ready}
          onClick={() => sendLine("clear")}
          style={{
            marginLeft: "auto",
            padding: "4px 10px",
            border: "1px solid #374151",
            background: ready ? "#111827" : "#0b0f14",
            color: "#e5e7eb",
            cursor: ready ? "pointer" : "not-allowed",
          }}
        >
          Clear
        </button>
      </div>

      {/* Terminal surface */}
      <div style={{ flex: "1 1 auto", minHeight: 0, background: "#0b0f14" }}>
        <div ref={containerRef} style={{ height: "100%", width: "100%" }} />
      </div>
    </div>
  );
}
