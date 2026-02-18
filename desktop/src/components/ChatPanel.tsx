import React, { useEffect, useState, useRef } from "react";
import { useCollab } from "../collab/CollabProvider";

type Message = {
    sender: string;
    color: string;
    content: string;
    timestamp: number;
};

export default function ChatPanel() {
    const { doc, awareness } = useCollab();
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState("");
    const messagesEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const yArray = doc.getArray<Message>("chat-messages");

        function update() {
            setMessages(yArray.toArray());
        }

        yArray.observe(update);
        update();

        return () => {
            yArray.unobserve(update);
        };
    }, [doc]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    function send() {
        if (!input.trim()) return;
        const localState = awareness.getLocalState() as any;
        const sender = localState?.user?.name || "Anonymous";
        const color = localState?.user?.color || "#000";

        const msg: Message = {
            sender,
            color,
            content: input,
            timestamp: Date.now(),
        };

        doc.getArray<Message>("chat-messages").push([msg]);
        setInput("");
    }

    return (
        <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
            <div
                style={{
                    padding: "8px 12px",
                    borderBottom: "1px solid #e5e7eb",
                    fontWeight: 600,
                    background: "#f9fafb",
                }}
            >
                Chat
            </div>
            <div
                style={{
                    flex: 1,
                    overflowY: "auto",
                    padding: 12,
                    display: "flex",
                    flexDirection: "column",
                    gap: 12,
                }}
            >
                {messages.map((m, i) => (
                    <div key={i} style={{ display: "flex", flexDirection: "column" }}>
                        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                            <span style={{ color: m.color, fontWeight: 600, fontSize: 13 }}>
                                {m.sender}
                            </span>
                            <span style={{ fontSize: 11, color: "#9ca3af" }}>
                                {new Date(m.timestamp).toLocaleTimeString()}
                            </span>
                        </div>
                        <div
                            style={{
                                marginTop: 2,
                                fontSize: 14,
                                color: "#1f2937",
                                wordBreak: "break-word",
                            }}
                        >
                            {m.content}
                        </div>
                    </div>
                ))}
                <div ref={messagesEndRef} />
            </div>
            <div
                style={{
                    padding: 12,
                    borderTop: "1px solid #e5e7eb",
                    display: "flex",
                    gap: 8,
                    background: "#f9fafb",
                }}
            >
                <input
                    style={{
                        flex: 1,
                        padding: "8px 10px",
                        borderRadius: 6,
                        border: "1px solid #d1d5db",
                        outline: "none",
                        fontSize: 14,
                    }}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && send()}
                    placeholder="Type a message..."
                />
                <button
                    onClick={send}
                    style={{
                        padding: "8px 16px",
                        background: "#2563eb",
                        color: "#fff",
                        border: "none",
                        borderRadius: 6,
                        cursor: "pointer",
                        fontWeight: 500,
                    }}
                >
                    Send
                </button>
            </div>
        </div>
    );
}
