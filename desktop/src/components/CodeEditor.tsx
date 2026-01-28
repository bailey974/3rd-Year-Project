import { useEffect, useMemo, useRef, useState } from "react";
import Editor from "@monaco-editor/react";
import { readTextFile } from "@tauri-apps/plugin-fs";

type Props = {
  filePath?: string | null;
};

function inferLanguage(filePath?: string | null): string {
  if (!filePath) return "plaintext";
  const lower = filePath.toLowerCase();

  const ext = lower.split(".").pop() ?? "";
  switch (ext) {
    case "ts":
      return "typescript";
    case "tsx":
      return "typescript";
    case "js":
      return "javascript";
    case "jsx":
      return "javascript";
    case "json":
      return "json";
    case "html":
      return "html";
    case "css":
      return "css";
    case "md":
      return "markdown";
    case "py":
      return "python";
    case "java":
      return "java";
    case "c":
      return "c";
    case "cpp":
      return "cpp";
    case "rs":
      return "rust";
    case "go":
      return "go";
    case "yml":
    case "yaml":
      return "yaml";
    default:
      return "plaintext";
  }
}

export default function CodeEditor({ filePath }: Props) {
  const [value, setValue] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Guard against out-of-order async loads when switching files quickly
  const loadSeq = useRef(0);

  const language = useMemo(() => inferLanguage(filePath), [filePath]);

  useEffect(() => {
    const seq = ++loadSeq.current;

    async function load() {
      if (!filePath) {
        setValue("");
        setErr(null);
        return;
      }

      setLoading(true);
      setErr(null);

      try {
        const text = await readTextFile(filePath);
        if (loadSeq.current === seq) setValue(text);
      } catch (e: any) {
        if (loadSeq.current === seq) {
          setErr(e?.message ?? String(e));
          setValue("");
        }
      } finally {
        if (loadSeq.current === seq) setLoading(false);
      }
    }

    load();
  }, [filePath]);

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", minHeight: 0 }}>
      <div
        style={{
          padding: "8px 12px",
          borderBottom: "1px solid #e5e7eb",
          display: "flex",
          alignItems: "center",
          gap: 12,
        }}
      >
        <div
          style={{
            fontSize: 12,
            color: "#6b7280",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            flex: 1,
          }}
          title={filePath ?? ""}
        >
          {filePath ?? "No file selected"}
        </div>

        {loading && <div style={{ fontSize: 12, color: "#6b7280" }}>Loading…</div>}
        {err && (
          <div style={{ fontSize: 12, color: "crimson", maxWidth: 520, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={err}>
            {err}
          </div>
        )}
      </div>

      <div style={{ flex: "1 1 auto", minHeight: 0 }}>
        <Editor
          // This helps Monaco keep distinct models per file
          path={filePath ?? "inmemory://model"}
          language={language}
          value={value}
          onChange={(v) => setValue(v ?? "")}
          theme="vs" // switch to "vs-dark" if you prefer
          options={{
            automaticLayout: true,
            minimap: { enabled: false },
            fontSize: 14,
            tabSize: 2,
            insertSpaces: true,
            wordWrap: "on",
            scrollBeyondLastLine: false,
          }}
        />
      </div>
    </div>
  );
}
