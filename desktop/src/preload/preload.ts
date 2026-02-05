// preload.ts
import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("terminalAPI", {
  create: (opts?: { cwd?: string }) => ipcRenderer.invoke("terminal:create", opts),
  write: (id: string, data: string) => ipcRenderer.send("terminal:write", { id, data }),
  resize: (id: string, cols: number, rows: number) =>
    ipcRenderer.send("terminal:resize", { id, cols, rows }),
  kill: (id: string) => ipcRenderer.send("terminal:kill", { id }),

  onData: (cb: (msg: { id: string; data: string }) => void) => {
    const h = (_: any, msg: any) => cb(msg);
    ipcRenderer.on("terminal:data", h);
    return () => ipcRenderer.removeListener("terminal:data", h);
  },
  onExit: (cb: (msg: { id: string }) => void) => {
    const h = (_: any, msg: any) => cb(msg);
    ipcRenderer.on("terminal:exit", h);
    return () => ipcRenderer.removeListener("terminal:exit", h);
  },
});
