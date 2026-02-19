import React, { useMemo, useState } from "react";
import { useCollab } from "./collab/CollabProvider";

/**
 * Lightweight room picker. (App.tsx uses a richer dialog; this component is
 * still useful for quick debugging.)
 */
export function RoomPicker() {
  const { roomId, setRoomId, status, members, role, visibility } = useCollab();
  const [next, setNext] = useState(roomId);

  const count = members.length;

  const badge = useMemo(() => {
    if (role === "host") return "Host";
    if (role === "editor") return "Editor";
    return "Viewer";
  }, [role]);

  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
      <span style={{ fontSize: 12, opacity: 0.75 }}>Room</span>
      <input value={next} onChange={(e) => setNext(e.target.value)} style={{ padding: "6px 8px" }} />
      <button onClick={() => setRoomId(next.trim() || "default-room")} style={{ padding: "6px 10px" }}>
        Join
      </button>

      <span style={{ fontSize: 12, opacity: 0.75 }}>
        {status} • {count}/10
      </span>

      <span
        style={{
          fontSize: 12,
          padding: "2px 8px",
          borderRadius: 999,
          border: "1px solid rgba(0,0,0,0.15)",
          background: "rgba(0,0,0,0.04)",
        }}
      >
        {badge}
      </span>

      <span style={{ fontSize: 12, opacity: 0.75 }}>
        tree: {visibility.shareTreeEnabled ? "shared" : "private"}
      </span>
    </div>
  );
}
