import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";

export type CollabSession = {
  doc: Y.Doc;
  provider: WebsocketProvider;
  awareness: WebsocketProvider["awareness"];
};

export function createCollabSession(wsUrl: string, roomId: string): CollabSession {
  const doc = new Y.Doc();
  const provider = new WebsocketProvider(wsUrl, roomId, doc);

  return { doc, provider, awareness: provider.awareness };
}
