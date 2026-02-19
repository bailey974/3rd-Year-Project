import http from "http";
import WebSocket, { WebSocketServer } from "ws";
import { setupWSConnection } from "y-websocket/bin/utils.js";

const PORT = Number(process.env.PORT || 1234);
const MAX_USERS_PER_ROOM = 10;

// docName -> count
const roomCounts = new Map();

const server = http.createServer((req, res) => {
  if (req.url === "/healthz") {
    res.writeHead(200, { "content-type": "text/plain" });
    res.end("ok");
    return;
  }
  res.writeHead(404);
  res.end();
});

const wss = new WebSocketServer({ server });

// Basic room limit: y-websocket puts doc name in the URL path, e.g. /my-room
wss.on("connection", (conn, req) => {
  const docName = (req.url || "/").slice(1) || "default";
  const count = (roomCounts.get(docName) || 0) + 1;

  if (count > MAX_USERS_PER_ROOM) {
    // 1008 = Policy Violation; reason becomes visible client-side when close frame is sent
    conn.close(1008, "room-full");
    return;
  }

  roomCounts.set(docName, count);

  conn.on("close", () => {
    const after = (roomCounts.get(docName) || 1) - 1;
    if (after <= 0) roomCounts.delete(docName);
    else roomCounts.set(docName, after);
  });

  // y-websocket wiring
  setupWSConnection(conn, req, { gc: true });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Collab WS listening on :${PORT}`);
});
