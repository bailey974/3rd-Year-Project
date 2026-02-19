import React, { useState } from "react";

export default function ChatPanel() {
  const [messages, setMessages] = useState<Array<{ role: "me" | "system"; text: string }>>([
    { role: "system", text: "Chat panel placeholder (create your real chat UI here)." },
  ]);
  const [input, setInput] = useState("");

  function send() {
    const t = input.trim();
    if (!t) return;
    setMessages((m) => [...m, { role: "me", text: t }]);
    setInput("");
  }

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", minHeight: 0 }}>
      <div style={{ padding: 10, borderBottom: "1px solid #e5e7eb", fontWeight: 600 }}>
        Chat
      </div>

      <div style={{ flex: "1 1 auto", minHeight: 0, overflow: "auto", padding: 10 }}>
        {messages.map((m, i) => (
          <div key={i} style={{ marginBottom: 8, opacity: m.role === "system" ? 0.75 : 1 }}>
            <span style={{ fontWeight: 600, marginRight: 6 }}>
              {m.role === "me" ? "You:" : "System:"}
            </span>
            <span>{m.text}</span>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 8, padding: 10, borderTop: "1px solid #e5e7eb" }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") send();
          }}
          placeholder="Type…"
          style={{
            flex: 1,
            padding: "8px 10px",
            border: "1px solid #d1d5db",
            borderRadius: 8,
            outline: "none",
          }}
        />
        <button
          onClick={send}
          style={{
            padding: "8px 12px",
            border: "1px solid #d1d5db",
            borderRadius: 8,
            background: "#fff",
            cursor: "pointer",
          }}
        >
          Send
        </button>
      </div>
    </div>
  );
}
