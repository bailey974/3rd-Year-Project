import { useEffect, useMemo, useState } from "react";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";

type Status = "connecting" | "connected" | "disconnected" | "error";

export function useCollab(room: string) {
  // IMPORTANT: must be ws:// not http://
  const wsUrl = (import.meta.env.VITE_YJS_WS_URL as string) || "ws://127.0.0.1:1234";

  const ydoc = useMemo(() => new Y.Doc(), []);
  const [provider, setProvider] = useState<WebsocketProvider | null>(null);
  const [status, setStatus] = useState<Status>("connecting");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let p: WebsocketProvider | null = null;

    try {
      p = new WebsocketProvider(wsUrl, room, ydoc, { connect: true });
      setProvider(p);

      const onStatus = (e: any) => setStatus(e?.status ?? "connecting");
      p.on("status", onStatus);
      p.on("connection-error", () => setStatus("error"));
      p.on("connection-close", () => setStatus("disconnected"));

      return () => {
        try {
          p?.off("status", onStatus);
          p?.destroy();
        } finally {
          ydoc.destroy();
        }
      };
    } catch (e: any) {
      setErr(e?.message ?? String(e));
      setStatus("error");
      ydoc.destroy();
    }
  }, [room, wsUrl, ydoc]);

  return { ydoc, provider, status, err, wsUrl };
}
