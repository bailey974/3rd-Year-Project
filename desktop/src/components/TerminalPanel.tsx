import { useEffect, useMemo, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";

type TerminalDataPayload = { id: string; data: string };
type TerminalExitPayload = { id: string };

type Task = { label: string; cmd: string };

type Props = {
  cwd?: string;
};

export default function TerminalPanel({ cwd }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const termIdRef = useRef<string | null>(null);

  // Buffer any output that arrives before we know which id is “ours”
  const pendingByIdRef = useRef<Record<string, string>>({});
  const exitedIdsRef = useRef<Record<string, true>>({});

  const [ready, setReady] = useState(false);
  const [selectedTask, setSelectedTask] = useState<string>("");
  const [statusText, setStatusText] = useState<string>("starting…");

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

  function writeRaw(data: string) {
    const id = termIdRef.current;
    if (!id) return;

    invoke("terminal_write", { id, data }).catch((e) => {
      termRef.current?.writeln(`\r\n[write error] ${String(e)}`);
    });
  }

  function sendLine(line: string) {
    writeRaw(line + "\r\n");
    termRef.current?.focus();
  }

  async function pasteFromClipboard() {
    try {
      const text = await navigator.clipboard.readText();
      if (text) writeRaw(text);
    } catch (e) {
      termRef.current?.writeln(`\r\n[paste error] ${String(e)}`);
    }
  }

  async function copySelection() {
    const term = termRef.current;
    if (!term) return;

    const selection = term.getSelection();
    if (!selection) return;

    try {
      await navigator.clipboard.writeText(selection);
      // VS Code clears selection after copy via context menu
      term.clearSelection();
    } catch (e) {
      term.writeln(`\r\n[copy error] ${String(e)}`);
    }
  }

  function clearLocal() {
    const term = termRef.current;
    if (!term) return;
    // VS Code “trash” clears scrollback locally without sending a shell command.
    term.reset();
    // Nudge the PTY so the prompt redraws cleanly.
    writeRaw("\r");
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
      allowTransparency: true,
      windowsMode: true,
      theme: {
        background: "#0b0f14",
        foreground: "#e5e7eb",
      },
    });

    const fit = new FitAddon();
    term.loadAddon(fit);

    // VS Code-like keybindings:
    // - Ctrl+C: SIGINT (never copy)
    // - Ctrl+Shift+C: Copy selection
    // - Ctrl+V / Ctrl+Shift+V: Paste
    term.attachCustomKeyEventHandler((ev) => {
      if (ev.type !== "keydown") return true;

      const isCtrl = ev.ctrlKey || ev.metaKey;
      const isShift = ev.shiftKey;

      // Copy selection
      if (isCtrl && isShift && ev.code === "KeyC") {
        void copySelection();
        return false;
      }

      // Paste
      if (isCtrl && (ev.code === "KeyV" || (isShift && ev.code === "KeyV"))) {
        void pasteFromClipboard();
        return false;
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
    setStatusText("starting…");

    // Focus management (Monaco often steals focus)
    const focusTerminal = () => term.focus();
    container.addEventListener("mousedown", focusTerminal);

    // Keep PTY size in sync with panel size (not only window resize)
    const ro = new ResizeObserver(() => {
      const id = termIdRef.current;
      if (!id) return;

      fit.fit();
      invoke("terminal_resize", { id, cols: term.cols, rows: term.rows }).catch(() => {});
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
          setStatusText("exited");
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

      // Context menu: VS Code terminal behavior
      // - If there's a selection -> copy
      // - Else -> paste
      const onContextMenu = (e: MouseEvent) => {
        e.preventDefault();
        const t = termRef.current;
        if (t?.hasSelection()) {
          void copySelection();
        } else {
          void pasteFromClipboard();
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
        setStatusText("exited");
        return;
      }

      // 4) Wire input AFTER id is set
      const d = term.onData((data) => {
        invoke("terminal_write", { id, data }).catch(() => {});
      });
      disposeOnData = () => d.dispose();

      // 5) Force a prompt in case the first one was missed
      await invoke("terminal_write", { id, data: "\r" }).catch(() => {});

      // 6) Sync size once more
      fit.fit();
      await invoke("terminal_resize", { id, cols: term.cols, rows: term.rows }).catch(() => {});

      term.writeln("\r\n[terminal ready]");
      setReady(true);
      setStatusText("ready");
      requestAnimationFrame(() => term.focus());
    })().catch((e) => {
      term.writeln(`\r\n[terminal init error] ${String(e)}`);
      setReady(false);
      setStatusText("error");
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
      if (id) invoke("terminal_kill", { id }).catch(() => {});

      term.dispose();
      setReady(false);
    };
  }, [cwd]);

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
        <div style={{ fontSize: 12, opacity: 0.75 }}>{statusText}</div>

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
          onClick={clearLocal}
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
