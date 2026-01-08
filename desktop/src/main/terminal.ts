// main/terminal.ts (MAIN process)
import { ipcMain } from "electron";
import crypto from "node:crypto";
import pty from "node-pty";

type Session = { proc: pty.IPty };
const sessions = new Map<string, Session>();

function defaultShell() {
  if (process.platform === "win32") return "powershell.exe";
  return process.env.SHELL || "bash";
}

ipcMain.handle("terminal:create", (event, opts?: { cwd?: string }) => {
  const id = crypto.randomUUID();
  const proc = pty.spawn(defaultShell(), [], {
    name: "xterm-256color",
    cols: 80,
    rows: 24,
    cwd: opts?.cwd || process.cwd(),
    env: { ...process.env, TERM: "xterm-256color" },
  });

  sessions.set(id, { proc });

  proc.onData((data) => event.sender.send("terminal:data", { id, data }));
  proc.onExit(() => {
    event.sender.send("terminal:exit", { id });
    sessions.delete(id);
  });

  return { id };
});

ipcMain.on("terminal:write", (_e, msg: { id: string; data: string }) => {
  sessions.get(msg.id)?.proc.write(msg.data);
});

ipcMain.on("terminal:resize", (_e, msg: { id: string; cols: number; rows: number }) => {
  sessions.get(msg.id)?.proc.resize(msg.cols, msg.rows);
});

ipcMain.on("terminal:kill", (_e, msg: { id: string }) => {
  sessions.get(msg.id)?.proc.kill();
  sessions.delete(msg.id);
});
