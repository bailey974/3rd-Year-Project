import React from "react";
import CodeEditor from "./components/CodeEditor";
import { pickAndOpenFile, pickAndSaveFile } from "./lib/fs";

export default function App() {
  const [code, setCode] = React.useState<string>("");
  const [path, setPath] = React.useState<string | null>(null);

  return (
    <div style={{ height: "100vh", display: "grid", gridTemplateRows: "auto 1fr" }}>
      <div style={{ padding: 8, display: "flex", gap: 8 }}>
        <button
          onClick={async () => {
            const res = await pickAndOpenFile();
            setPath(res.path);
            setCode(res.content);
          }}
        >
          Open…
        </button>
        <button
          onClick={async () => {
            const saved = await pickAndSaveFile(code);
            if (saved) setPath(saved);
          }}
        >
          Save As…
        </button>
        <div style={{ marginLeft: "auto", opacity: 0.7 }}>
          {path ?? "untitled"}
        </div>
      </div>

      <CodeEditor value={code} onChange={setCode} language="typescript" />
    </div>
  );
}
