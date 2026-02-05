import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { installFatalOverlay } from "./fatalOverlay";
import { CollabProvider } from "./collab/CollabProvider";

installFatalOverlay();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <CollabProvider wsUrl="ws://localhost:1234" defaultRoomId="default-room" displayName="Bailey">
      <App />
    </CollabProvider>
  </React.StrictMode>
);
