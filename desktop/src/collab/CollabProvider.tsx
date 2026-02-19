import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import * as Y from "yjs";
import { HocuspocusProvider } from "@hocuspocus/provider";
import { attachPresenceStyles } from "./presenceStyles";

type Status = "connecting" | "connected" | "disconnected";

type Session = {
  doc: Y.Doc;
  provider: HocuspocusProvider;
  awareness: HocuspocusProvider["awareness"];
};

type CollabContextValue = {
  wsUrl: string;
  roomId: string;
  setRoomId: (id: string) => void;
  doc: Session["doc"];
  awareness: Session["awareness"];
  status: Status;
  lastError: string | null;
};

const CollabContext = createContext<CollabContextValue | null>(null);

function randomColor() {
  const hues = [10, 40, 90, 140, 190, 220, 260, 300];
  const h = hues[Math.floor(Math.random() * hues.length)];
  return `hsl(${h} 80% 55%)`;
}

function normalizeStatus(s: any): Status {
  const v = String(s ?? "").toLowerCase();
  if (v === "connected") return "connected";
  if (v === "disconnected") return "disconnected";
  return "connecting";
}

function stringifyReason(reason: any) {
  if (!reason) return "Unknown error";
  if (typeof reason === "string") return reason;
  if (reason?.message) return String(reason.message);
  try {
    return JSON.stringify(reason);
  } catch {
    return String(reason);
  }
}

export function CollabProvider({
  children,
  defaultRoomId = "default-room",
  wsUrl = "ws://localhost:1234",
  displayName = "Anonymous",
  token,
}: {
  children: React.ReactNode;
  defaultRoomId?: string;
  wsUrl?: string;
  displayName?: string;

  /**
   * Access token (e.g., your Django SimpleJWT access token).
   * Hocuspocus will pass this to server hooks (onAuthenticate). :contentReference[oaicite:3]{index=3}
   */
  token?: string | (() => string | Promise<string>);
}) {
  const [roomId, setRoomId] = useState(defaultRoomId);
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<Status>("connecting");
  const [lastError, setLastError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    // Create everything inside effect (avoids StrictMode reuse issues)
    const doc = new Y.Doc();
    const provider = new HocuspocusProvider({
      url: wsUrl,
      name: roomId,
      document: doc,
      token: token ?? "",
    });

    const awareness = provider.awareness;

    // presence
    awareness.setLocalStateField("user", {
      name: displayName,
      color: randomColor(),
    });

    const detachStyles = attachPresenceStyles(awareness as any);

    const onStatus = (ev: any) => {
      if (!alive) return;
      setStatus(normalizeStatus(ev?.status));
    };

    const onAuthFailed = (ev: any) => {
      if (!alive) return;
      // Hocuspocus emits this when onAuthenticate throws/rejects. :contentReference[oaicite:4]{index=4}
      const msg = stringifyReason(ev?.reason ?? ev);
      setLastError(msg);
      setStatus("disconnected");
    };

    const onAuthenticated = () => {
      if (!alive) return;
      setLastError(null);
    };

    provider.on("status", onStatus);
    provider.on("authenticationFailed", onAuthFailed);
    provider.on("authenticated", onAuthenticated);

    // If the socket closes unexpectedly, surface something useful
    provider.on("close", (ev: any) => {
      if (!alive) return;
      // Don’t overwrite a more specific auth error like "room-full"
      setStatus("disconnected");
      if (!lastError) {
        const code = ev?.code != null ? `code=${ev.code}` : "";
        const reason = ev?.reason ? `reason=${ev.reason}` : "";
        const msg = [code, reason].filter(Boolean).join(" ");
        if (msg) setLastError(msg);
      }
    });

    setSession({ doc, provider, awareness });
    setStatus("connecting");
    setLastError(null);

    return () => {
      alive = false;
      provider.off("status", onStatus);
      provider.off("authenticationFailed", onAuthFailed);
      provider.off("authenticated", onAuthenticated);
      detachStyles?.();
      provider.destroy();
      doc.destroy();
      setSession(null);
    };
    // NOTE: lastError intentionally NOT in deps; we don’t want reconnection loops
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wsUrl, roomId, displayName, token]);

  const value = useMemo<CollabContextValue | null>(() => {
    if (!session) return null;
    return {
      wsUrl,
      roomId,
      setRoomId,
      doc: session.doc,
      awareness: session.awareness,
      status,
      lastError,
    };
  }, [session, wsUrl, roomId, status, lastError]);

  if (!value) {
    return (
      <div style={{ padding: 16, fontFamily: "system-ui", opacity: 0.7 }}>
        Starting collaboration…
      </div>
    );
  }

  if (lastError) {
    return (
      <div style={{ padding: 16, fontFamily: "system-ui" }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Collaboration error</div>
        <div style={{ color: "crimson", whiteSpace: "pre-wrap" }}>{lastError}</div>
        <div style={{ marginTop: 8, opacity: 0.7 }}>
          If this says <b>room-full</b>, the room already has 10 users.
        </div>
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
