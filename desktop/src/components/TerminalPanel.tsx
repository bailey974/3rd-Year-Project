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

  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const termIdRef = useRef<string | null>(null);

  // Buffer any output that arrives before we know which id is “ours”
  const pendingByIdRef = useRef<Record<string, string>>({});
  const exitedIdsRef = useRef<Record<string, true>>({});

  const [ready, setReady] = useState(false);
  const [selectedTask, setSelectedTask] = useState<string>("");

  const tasks: Task[] = useMemo(
    () => [
      // JS/TS
      { label: "pnpm install", cmd: "pnpm install" },
      { label: "pnpm dev", cmd: "pnpm dev" },
      { label: "pnpm test", cmd: "pnpm test" },
      { label: "pnpm lint", cmd: "pnpm lint" },
      { label: "npm install", cmd: "npm install" },
      { label: "npm test", cmd: "npm test" },

      // Rust/Tauri
      { label: "cargo test", cmd: "cargo test" },
      { label: "cargo fmt", cmd: "cargo fmt" },
      { label: "cargo clippy", cmd: "cargo clippy" },

      // Git
      { label: "git status", cmd: "git status" },
      { label: "git diff", cmd: "git diff" },
      { label: "git log --oneline -n 10", cmd: "git log --oneline -n 10" },
    ],
    []
  );

  function sendLine(line: string) {
    const id = termIdRef.current;
    const term = termRef.current;
    if (!id || !term) return;

    invoke("terminal_write", { id, data: line + "\r\n" }).catch((e) => {
      term.writeln(`\r\n[write error] ${String(e)}`);
    });

    term.focus();
  }

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Create terminal
    const term = new Terminal({
      cursorBlink: true,
      convertEol: true,
      fontSize: 13,
      scrollback: 5000,
      disableStdin: false,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);

    // Context menu & Clipboard support
    // 1. Selection + Ctrl+C -> Copy (intercepts SIGINT)
    // 2. Selection + Right Click -> Copy (optional, standard behavior handling)

    term.attachCustomKeyEventHandler((arg) => {
      // ctrl+c
      if (arg.ctrlKey && arg.code === "KeyC" && arg.type === "keydown") {
        const selection = term.getSelection();
        if (selection) {
          navigator.clipboard.writeText(selection);
          return false; // Do not send SIGINT
        }
      }
      // ctrl+v -> allow default paste or handle manually?
      if (arg.ctrlKey && arg.code === "KeyV" && arg.type === "keydown") {
        return true;
      }
      return true;
    });

    term.open(container);

    // Delay first fit until layout has happened
    requestAnimationFrame(() => {
      fit.fit();
      term.focus();
    });

    termRef.current = term;
    fitRef.current = fit;

    term.writeln("[starting shell…]");

    // Focus management (Monaco often steals focus)
    const focusTerminal = () => term.focus();
    container.addEventListener("mousedown", focusTerminal);

    // Keep PTY size in sync with panel size (not only window resize)
    const ro = new ResizeObserver(() => {
      const id = termIdRef.current;
      if (!id) return;
      fit.fit();
      invoke("terminal_resize", { id, cols: term.cols, rows: term.rows }).catch(() => { });
    });
    ro.observe(container);

    let unlistenData: null | (() => void) = null;
    let unlistenExit: null | (() => void) = null;

    let disposeOnData: null | (() => void) = null;
    let removeContextMenu: null | (() => void) = null;

    (async () => {
      // 1) Start listening BEFORE creating the PTY (prevents missing the first prompt)
      unlistenData = await listen<TerminalDataPayload>("terminal:data", (event) => {
        const { id, data } = event.payload;
        const activeId = termIdRef.current;

        if (activeId && id === activeId) {
          term.write(data);
          return;
        }

        // Buffer until we know the activeId
        pendingByIdRef.current[id] = (pendingByIdRef.current[id] ?? "") + data;
      });

      unlistenExit = await listen<TerminalExitPayload>("terminal:exit", (event) => {
        exitedIdsRef.current[event.payload.id] = true;

        const activeId = termIdRef.current;
        if (activeId && event.payload.id === activeId) {
          term.writeln("\r\n[process exited]");
          setReady(false);
        }
      });

      // 2) Create PTY
      const cols = Math.max(10, term.cols || 80);
      const rows = Math.max(5, term.rows || 24);

      const id = await invoke<string>("terminal_create", {
        cols,
        rows,
        cwd: cwd ?? undefined,
      });

      termIdRef.current = id;

      // Update the context menu handler to use the active ID
      const onContextMenu = async (e: MouseEvent) => {
        e.preventDefault();
        try {
          const text = await navigator.clipboard.readText();
          if (text) {
            invoke("terminal_write", { id: termIdRef.current, data: text }).catch(() => { });
          }
        } catch (err) {
          console.error("Failed to read clipboard", err);
        }
      };
      container.addEventListener("contextmenu", onContextMenu);
      removeContextMenu = () => container.removeEventListener("contextmenu", onContextMenu);

      // 3) Flush any buffered output (including the first prompt)
      const buffered = pendingByIdRef.current[id];
      if (buffered) {
        term.write(buffered);
        delete pendingByIdRef.current[id];
      }

      if (exitedIdsRef.current[id]) {
        term.writeln("\r\n[process exited]");
        setReady(false);
        return;
      }

      // 4) Wire input AFTER id is set
      const d = term.onData((data) => {
        invoke("terminal_write", { id, data }).catch(() => { });
      });
      disposeOnData = () => d.dispose();

      // 5) Force a prompt in case the first one was missed
      await invoke("terminal_write", { id, data: "\r" }).catch(() => { });

      // 6) Sync size once more
      fit.fit();
      await invoke("terminal_resize", { id, cols: term.cols, rows: term.rows }).catch(() => { });

      term.writeln("\r\n[terminal ready]");
      setReady(true);
      requestAnimationFrame(() => term.focus());
    })().catch((e) => {
      term.writeln(`\r\n[terminal init error] ${String(e)}`);
      setReady(false);
    });

    return () => {
      container.removeEventListener("mousedown", focusTerminal);
      ro.disconnect();

      if (disposeOnData) disposeOnData();
      if (removeContextMenu) removeContextMenu();

      // These are functions returned by `listen`, they should be called directly
      if (unlistenData) unlistenData();
      if (unlistenExit) unlistenExit();

      const id = termIdRef.current;
      termIdRef.current = null;
      if (id) invoke("terminal_kill", { id }).catch(() => { });

      term.dispose();
      setReady(false);
    };
  }, [cwd]);

  // Use cls on Windows, clear on others (either is harmless if the other isn’t found)
  const clearCmd = "cls";

  return (
    <div style={{ height: "100%", width: "100%", display: "flex", flexDirection: "column" }}>
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
          onClick={() => sendLine(clearCmd)}
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

      <div style={{ flex: "1 1 auto", minHeight: 0, background: "#0b0f14" }}>
        <div ref={containerRef} style={{ height: "100%", width: "100%" }} />
      </div>
    </div>
  );
}
