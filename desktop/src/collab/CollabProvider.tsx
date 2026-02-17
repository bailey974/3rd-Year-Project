import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { createCollabSession } from "./collabClient";
import { attachPresenceStyles } from "./presenceStyles";

type Session = ReturnType<typeof createCollabSession>;

type CollabContextValue = {
  wsUrl: string;
  roomId: string;
  setRoomId: (id: string) => void;
  doc: Session["doc"];
  awareness: Session["awareness"];
  status: "connecting" | "connected" | "disconnected";
};

const CollabContext = createContext<CollabContextValue | null>(null);

function randomColor() {
  const hues = [10, 40, 90, 140, 190, 220, 260, 300];
  const h = hues[Math.floor(Math.random() * hues.length)];
  return `hsl(${h} 80% 55%)`;
}

export function CollabProvider({
  children,
  defaultRoomId = "default-room",
  wsUrl = "ws://localhost:1234",
  displayName = "Anonymous",
}: {
  children: React.ReactNode;
  defaultRoomId?: string;
  wsUrl?: string;
  displayName?: string;
}) {
  const [roomId, setRoomId] = useState(defaultRoomId);
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<CollabContextValue["status"]>("connecting");
  const [initErr, setInitErr] = useState<string | null>(null);

  // IMPORTANT: create+destroy the session inside the effect so React StrictMode doesn't reuse a destroyed instance
  useEffect(() => {
    let s: Session | null = null;

    try {
      s = createCollabSession(wsUrl, roomId);
      setSession(s);
      setInitErr(null);
      setStatus("connecting");

      s.awareness.setLocalStateField("user", {
        name: displayName,
        color: randomColor(),
      });

      const detachStyles = attachPresenceStyles(s.awareness as any);

      const onStatus = (e: any) => setStatus(e?.status ?? "connecting");
      // y-websocket provider emits "status"
      (s.provider as any).on?.("status", onStatus);

      return () => {
        (s?.provider as any).off?.("status", onStatus);
        detachStyles?.();
        s?.provider.destroy();
        s?.doc.destroy();
      };
    } catch (e: any) {
      setInitErr(e?.message ?? String(e));
      setSession(null);
      setStatus("disconnected");
      return () => {};
    }
  }, [wsUrl, roomId, displayName]);

  const value = useMemo<CollabContextValue | null>(() => {
    if (!session) return null;
    return {
      wsUrl,
      roomId,
      setRoomId,
      doc: session.doc,
      awareness: session.awareness,
      status,
    };
  }, [session, wsUrl, roomId, status]);

  // Don’t render children until context exists, otherwise useCollab() in your editor will throw and blank-screen
  if (initErr) {
    return (
      <div style={{ padding: 16, fontFamily: "system-ui" }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Collaboration init failed</div>
        <div style={{ color: "crimson", whiteSpace: "pre-wrap" }}>{initErr}</div>
        <div style={{ marginTop: 8, opacity: 0.7 }}>
          Check CSP (connect-src), and that the websocket server is reachable.
        </div>
      </div>
    );
  }

  if (!value) {
    return (
      <div style={{ padding: 16, fontFamily: "system-ui", opacity: 0.7 }}>
        Starting collaboration…
      </div>
    );
  }

  return <CollabContext.Provider value={value}>{children}</CollabContext.Provider>;
}

export function useCollab() {
  const ctx = useContext(CollabContext);
  if (!ctx) throw new Error("useCollab must be used inside <CollabProvider />");
  return ctx;
}
