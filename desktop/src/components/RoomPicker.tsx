import React, { useState } from "react";
import { useCollab } from "./collab/CollabProvider";

export function RoomPicker() {
  const { roomId, setRoomId, status, awareness } = useCollab();
  const [next, setNext] = useState(roomId);

  const count = awareness.getStates().size; // online users (approx), incl. self

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
    </div>
  );
}
