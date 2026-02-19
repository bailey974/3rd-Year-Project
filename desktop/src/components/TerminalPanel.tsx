import { useEffect, useMemo, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { useCollab } from "../collab/CollabProvider";

type TerminalDataPayload = { id: string; data: string };
type TerminalExitPayload = { id: string };

type Task = { label: string; cmd: string };
type Props = { cwd?: string };

// Shared Yjs keys
const Y_TERM_LOG = "terminal:log"; // Y.Text
const Y_TERM_INPUT = "terminal:input"; // Y.Array<{id,userId,data,createdAt}>
const Y_TERM_POLICY = "terminal:policy"; // Y.Map (already managed by CollabProvider)
const Y_TERM_REQUESTS = "terminal:requests"; // Y.Array<{id,userId,name,createdAt}>

const MAX_SHARED_LOG_CHARS = 200_000;

function makeId(prefix: string) {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? `${prefix}-${(crypto as any).randomUUID()}`
    : `${prefix}-${Math.random().toString(16).slice(2)}-${Date.now().toString(16)}`;
}

export default function TerminalPanel({ cwd }: Props) {
  const {
    doc,
    isHost,
    me,
    members,
    terminalPolicy,
    setTerminalPolicy,
    requestTerminalControl,
    terminalRequests,
  } = useCollab();

  const containerRef = useRef<HTMLDivElement | null>(null);

  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);

  // Host-only PTY id
  const termIdRef = useRef<string | null>(null);

  // Buffer any output that arrives before we know which id is “ours”
  const pendingByIdRef = useRef<Record<string, string>>({});
  const exitedIdsRef = useRef<Record<string, true>>({});

  // Shared state references
  const yLog = useMemo(() => doc.getText(Y_TERM_LOG), [doc]);
  const yInput = useMemo(() => doc.getArray<any>(Y_TERM_INPUT), [doc]);
  const yPolicy = useMemo(() => doc.getMap<any>(Y_TERM_POLICY), [doc]);
  const yRequests = useMemo(() => doc.getArray<any>(Y_TERM_REQUESTS), [doc]);

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

  const shared = terminalPolicy.shared;
  const controller = terminalPolicy.controllerUserId; // null | "*" | userId
  const canGuestSend =
    terminalPolicy.allowGuestInput &&
    (controller === "*" || controller === me.userId);

  const hasLocalPty = isHost; // only host runs the PTY
  const allowLocalInput = hasLocalPty || canGuestSend;

  function appendSharedLog(data: string) {
    if (!shared) return;
    if (!data) return;

    doc.transact(() => {
      const before = yLog.length;
      yLog.insert(before, data);

      // Keep bounded size
      const overflow = yLog.length - MAX_SHARED_LOG_CHARS;
      if (overflow > 0) yLog.delete(0, overflow);
    });
  }

  function writeRawToPty(data: string) {
    const id = termIdRef.current;
    if (!id) return;

    invoke("terminal_write", { id, data }).catch((e) => {
      termRef.current?.writeln(`\r\n[write error] ${String(e)}`);
    });
  }

  function sendLine(line: string) {
    if (hasLocalPty) {
      writeRawToPty(line + "\r\n");
      termRef.current?.focus();
      return;
    }

    // Guest with control: queue input for host
    if (canGuestSend) {
      const item = { id: makeId("in"), userId: me.userId, data: line + "\r\n", createdAt: Date.now() };
      doc.transact(() => yInput.push([item]));
      termRef.current?.focus();
    }
  }

  async function pasteFromClipboard() {
    try {
      const text = await navigator.clipboard.readText();
      if (!text) return;

      if (hasLocalPty) {
        writeRawToPty(text);
      } else if (canGuestSend) {
        const item = { id: makeId("in"), userId: me.userId, data: text, createdAt: Date.now() };
        doc.transact(() => yInput.push([item]));
      }
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
      term.clearSelection();
    } catch (e) {
      term.writeln(`\r\n[copy error] ${String(e)}`);
    }
  }

  function clearLocal() {
    const term = termRef.current;
    if (!term) return;
    term.reset();

    if (hasLocalPty) {
      writeRawToPty("\r");
      term.focus();
    }
  }

  function clearShared() {
    if (!isHost) return;
    doc.transact(() => {
      yLog.delete(0, yLog.length);
    });
  }

  // Create xterm for everyone (viewer/editor/host)
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Create terminal
    const term = new Terminal({
      cursorBlink: true,
      convertEol: true,
      fontSize: 13,
      scrollback: 8000,
      disableStdin: !allowLocalInput,
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

      if (isCtrl && isShift && ev.code === "KeyC") {
        void copySelection();
        return false;
      }

      if (isCtrl && (ev.code === "KeyV" || (isShift && ev.code === "KeyV"))) {
        void pasteFromClipboard();
        return false;
      }

      return true;
    });

    term.open(container);

    requestAnimationFrame(() => {
      fit.fit();
      term.focus();
    });

    termRef.current = term;
    fitRef.current = fit;

    // Show existing shared log for guests (and for host after reconnect)
    const initial = yLog.toString();
    if (initial) term.write(initial);

    // Keep xterm size in sync with panel size
    const ro = new ResizeObserver(() => {
      fit.fit();
      const id = termIdRef.current;
      if (hasLocalPty && id) {
        invoke("terminal_resize", { id, cols: term.cols, rows: term.rows }).catch(() => {});
      }
    });
    ro.observe(container);

    // Context menu: selection => copy, else paste
    const onContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      if (term.hasSelection()) void copySelection();
      else void pasteFromClipboard();
    };
    container.addEventListener("contextmenu", onContextMenu);

    // If guest has control, send typed bytes via Yjs queue
    let disposeOnData: null | (() => void) = null;
    if (!hasLocalPty && canGuestSend) {
      const d = term.onData((data) => {
        const item = { id: makeId("in"), userId: me.userId, data, createdAt: Date.now() };
        doc.transact(() => yInput.push([item]));
      });
      disposeOnData = () => d.dispose();
    }

    // Observe shared log (guests, and host if sharing)
    let lastLen = initial.length;
    const onLog = () => {
      const next = yLog.toString();
      if (next.length <= lastLen) {
        lastLen = next.length;
        return;
      }
      const delta = next.slice(lastLen);
      lastLen = next.length;
      term.write(delta);
    };

    yLog.observe(onLog);

    return () => {
      yLog.unobserve(onLog);
      if (disposeOnData) disposeOnData();

      container.removeEventListener("contextmenu", onContextMenu);
      ro.disconnect();

      term.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containerRef, doc, yLog, yInput, hasLocalPty, canGuestSend, allowLocalInput]);

  // Host: create and manage PTY (Tauri backend) and mirror output into shared log if enabled.
  useEffect(() => {
    if (!hasLocalPty) {
      setReady(false);
      setStatusText(shared ? "shared (view only)" : "not shared");
      return;
    }

    const term = termRef.current;
    const fit = fitRef.current;
    const container = containerRef.current;
    if (!term || !fit || !container) return;

    term.writeln("[starting shell…]");
    setStatusText("starting…");

    let unlistenData: null | (() => void) = null;
    let unlistenExit: null | (() => void) = null;
    let disposeOnData: null | (() => void) = null;

    (async () => {
      // Listen BEFORE creating the PTY (prevents missing the first prompt)
      unlistenData = await listen<TerminalDataPayload>("terminal:data", (event) => {
        const { id, data } = event.payload;
        const activeId = termIdRef.current;

        if (activeId && id === activeId) {
          term.write(data);
          appendSharedLog(data);
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
          appendSharedLog("\r\n[process exited]\r\n");
        }
      });

      // Create PTY
      const cols = Math.max(10, term.cols || 80);
      const rows = Math.max(5, term.rows || 24);

      const id = await invoke<string>("terminal_create", {
        cols,
        rows,
        cwd: cwd ?? undefined,
      });

      termIdRef.current = id;

      // Flush buffered output (including the first prompt)
      const buffered = pendingByIdRef.current[id];
      if (buffered) {
        term.write(buffered);
        appendSharedLog(buffered);
        delete pendingByIdRef.current[id];
      }

      if (exitedIdsRef.current[id]) {
        term.writeln("\r\n[process exited]");
        setReady(false);
        setStatusText("exited");
        appendSharedLog("\r\n[process exited]\r\n");
        return;
      }

      // Wire input AFTER id is set
      const d = term.onData((data) => {
        invoke("terminal_write", { id, data }).catch(() => {});
      });
      disposeOnData = () => d.dispose();

      // Force prompt redraw
      await invoke("terminal_write", { id, data: "\r" }).catch(() => {});

      // Sync size once more
      fit.fit();
      await invoke("terminal_resize", { id, cols: term.cols, rows: term.rows }).catch(() => {});

      term.writeln("\r\n[terminal ready]");
      appendSharedLog("\r\n[terminal ready]\r\n");
      setReady(true);
      setStatusText(shared ? "ready (shared)" : "ready (local)");
      requestAnimationFrame(() => term.focus());
    })().catch((e) => {
      term.writeln(`\r\n[terminal init error] ${String(e)}`);
      appendSharedLog(`\r\n[terminal init error] ${String(e)}\r\n`);
      setReady(false);
      setStatusText("error");
    });

    return () => {
      if (disposeOnData) disposeOnData();

      if (unlistenData) unlistenData();
      if (unlistenExit) unlistenExit();

      const id = termIdRef.current;
      termIdRef.current = null;
      if (id) invoke("terminal_kill", { id }).catch(() => {});

      setReady(false);
    };
  }, [cwd, hasLocalPty, shared]); // rebuild PTY on cwd change; sharing toggles only affects mirroring

  // Host: consume shared input queue (from controller) and send to PTY
  useEffect(() => {
    if (!hasLocalPty) return;

    const onInput = (event: any) => {
      if (!terminalPolicy.allowGuestInput) return;
      const controllerId = terminalPolicy.controllerUserId;
      if (!controllerId) return;

      const items = yInput.toArray();
      if (items.length === 0) return;

      // Consume in-order and clear queue
      const toConsume = items.filter((x: any) => {
        const uid = String(x?.userId ?? "");
        if (!uid) return false;
        if (controllerId === "*") return uid !== me.userId; // any guest
        return uid === controllerId;
      });

      if (toConsume.length === 0) return;

      for (const it of toConsume) {
        const data = String(it.data ?? "");
        if (data) writeRawToPty(data);
      }

      // delete everything (simple; in real impl keep unconsumed)
      doc.transact(() => {
        yInput.delete(0, yInput.length);
      });
    };

    yInput.observe(onInput);
    // run once in case queue already has items
    onInput(null);

    return () => yInput.unobserve(onInput);
  }, [doc, yInput, hasLocalPty, terminalPolicy.allowGuestInput, terminalPolicy.controllerUserId, me.userId]);

  const terminalBody = !isHost && !shared ? (
    <div style={{ padding: 12, color: "#e5e7eb", background: "#0b0f14", height: "100%" }}>
      <div style={{ fontWeight: 700, marginBottom: 6 }}>Terminal not shared</div>
      <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 12 }}>
        Only the host can run commands. Ask the host to share the terminal output if needed.
      </div>
      <button
        onClick={() => requestTerminalControl()}
        style={{
          padding: "6px 10px",
          border: "1px solid #374151",
          background: "#111827",
          color: "#e5e7eb",
          cursor: "pointer",
        }}
      >
        Request access
      </button>
    </div>
  ) : (
    <div style={{ flex: "1 1 auto", minHeight: 0, background: "#0b0f14" }}>
      <div ref={containerRef} style={{ height: "100%", width: "100%" }} />
    </div>
  );

  const pendingMine = terminalRequests.some((r) => r.userId === me.userId);
  const pendingCount = terminalRequests.length;

  const controllerOptions = useMemo(() => {
    const opts: Array<{ value: string; label: string }> = [
      { value: "", label: "Host only" },
      { value: "*", label: "Any guest (dangerous)" },
    ];

    for (const m of members) {
      if (m.userId === me.userId) continue;
      opts.push({ value: m.userId, label: `${m.name} (${m.role})` });
    }

    return opts;
  }, [members, me.userId]);

  function grantNextRequest() {
    if (!isHost) return;
    const next = terminalRequests[0];
    if (!next) return;

    doc.transact(() => {
      // set controller to requester
      yPolicy.set("shared", true);
      yPolicy.set("allowGuestInput", true);
      yPolicy.set("controllerUserId", next.userId);

      // remove request
      const idx = yRequests.toArray().findIndex((x: any) => x?.id === next.id);
      if (idx >= 0) yRequests.delete(idx, 1);
    });
  }

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

        {isHost ? (
          <>
            <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12, opacity: 0.9 }}>
              <input
                type="checkbox"
                checked={shared}
                onChange={(e) => setTerminalPolicy({ shared: e.target.checked })}
              />
              Share output
            </label>

            <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12, opacity: 0.9 }}>
              <input
                type="checkbox"
                checked={terminalPolicy.allowGuestInput}
                disabled={!shared}
                onChange={(e) => setTerminalPolicy({ allowGuestInput: e.target.checked })}
              />
              Allow input
            </label>

            <select
              value={controller ?? ""}
              disabled={!shared || !terminalPolicy.allowGuestInput}
              onChange={(e) => setTerminalPolicy({ controllerUserId: e.target.value || null })}
              style={{ padding: "4px 6px" }}
              title="Who can control the terminal (input is queued to host)"
            >
              {controllerOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>

            {pendingCount > 0 && (
              <button
                onClick={grantNextRequest}
                style={{
                  padding: "4px 10px",
                  border: "1px solid #374151",
                  background: "#111827",
                  color: "#e5e7eb",
                  cursor: "pointer",
                }}
                title="Grant terminal control to the oldest requester"
              >
                Grant request ({pendingCount})
              </button>
            )}

            <button
              onClick={clearShared}
              disabled={!shared}
              style={{
                padding: "4px 10px",
                border: "1px solid #374151",
                background: shared ? "#111827" : "#0b0f14",
                color: "#e5e7eb",
                cursor: shared ? "pointer" : "not-allowed",
              }}
              title="Clears the shared terminal transcript (does not affect the local shell)"
            >
              Clear shared
            </button>
          </>
        ) : shared ? (
          <>
            <div style={{ fontSize: 12, opacity: 0.8 }}>shared</div>
            {canGuestSend ? (
              <div style={{ fontSize: 12, opacity: 0.8 }}>• you have control</div>
            ) : (
              <button
                onClick={() => requestTerminalControl()}
                disabled={pendingMine}
                style={{
                  padding: "4px 10px",
                  border: "1px solid #374151",
                  background: pendingMine ? "#0b0f14" : "#111827",
                  color: "#e5e7eb",
                  cursor: pendingMine ? "not-allowed" : "pointer",
                }}
                title="Request terminal control from host"
              >
                {pendingMine ? "Requested" : "Request control"}
              </button>
            )}
          </>
        ) : null}

        <select
          value={selectedTask}
          onChange={(e) => setSelectedTask(e.target.value)}
          disabled={!hasLocalPty || !ready}
          style={{ marginLeft: 8, padding: "4px 6px" }}
          title="Host-only convenience tasks"
        >
          <option value="">Run task…</option>
          {tasks.map((t) => (
            <option key={t.label} value={t.cmd}>
              {t.label}
            </option>
          ))}
        </select>

        <button
          disabled={!hasLocalPty || !ready || !selectedTask}
          onClick={() => sendLine(selectedTask)}
          style={{
            padding: "4px 10px",
            border: "1px solid #374151",
            background: hasLocalPty && ready && selectedTask ? "#111827" : "#0b0f14",
            color: "#e5e7eb",
            cursor: hasLocalPty && ready && selectedTask ? "pointer" : "not-allowed",
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

      {terminalBody}
    </div>
  );
}
