import { useEffect, useMemo, useRef, useState } from "react";
import Editor, { type Monaco, type OnMount } from "@monaco-editor/react";
import type * as MonacoNs from "monaco-editor";
import { readTextFile } from "@tauri-apps/plugin-fs";
import { MonacoBinding } from "y-monaco";

import { useCollab } from "../collab/CollabProvider";
import { getOrCreateYText, normalizePath } from "../collab/yFiles";

type Props = {
  filePath?: string | null;
};

function inferLanguage(filePath?: string | null): string {
  if (!filePath) return "plaintext";
  const lower = filePath.toLowerCase();

  const ext = lower.split(".").pop() ?? "";
  switch (ext) {
    case "ts":
    case "tsx":
      return "typescript";
    case "js":
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
  const { doc, awareness } = useCollab();

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Guard against out-of-order async loads when switching files quickly
  const loadSeq = useRef(0);

  // Monaco refs
  const editorRef = useRef<MonacoNs.editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<Monaco | null>(null);
  const bindingRef = useRef<MonacoBinding | null>(null);

  const language = useMemo(() => inferLanguage(filePath), [filePath]);

  const handleMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
  };

  // 1) Seed the shared Y.Text from disk (ONLY if it’s empty)
  useEffect(() => {
    const seq = ++loadSeq.current;

    async function seedFromDisk() {
      if (!filePath) {
        setErr(null);
        setLoading(false);
        return;
      }

      const yText = getOrCreateYText(doc, filePath);

      // If room already has content, do NOT overwrite it with local disk.
      if (yText.length > 0) {
        setErr(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      setErr(null);

      try {
        const text = await readTextFile(filePath);

        // file switched while loading
        if (loadSeq.current !== seq) return;

        // still empty? then seed
        if (yText.length === 0) {
          doc.transact(() => {
            yText.insert(0, text);
          });
        }
      } catch (e: any) {
        if (loadSeq.current === seq) {
          // It's fine to still allow editing; we just show the error.
          setErr(e?.message ?? String(e));
        }
      } finally {
        if (loadSeq.current === seq) setLoading(false);
      }
    }

    seedFromDisk();
  }, [doc, filePath]);

  // 2) Ensure Monaco uses the model that corresponds to the currently selected file.
  useEffect(() => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    if (!editor || !monaco) return;

    // No file selected -> a single in-memory model
    if (!filePath) {
      const uri = monaco.Uri.parse("inmemory://model");
      let model = monaco.editor.getModel(uri);
      if (!model) model = monaco.editor.createModel("", "plaintext", uri);
      editor.setModel(model);
      return;
    }

    const uri = monaco.Uri.file(filePath);
    const yText = getOrCreateYText(doc, filePath);
    const yValue = yText.toString();

    let model = monaco.editor.getModel(uri);
    if (!model) {
      model = monaco.editor.createModel(yValue, language, uri);
    } else {
      monaco.editor.setModelLanguage(model, language);
      // If the model is empty but the collaborative doc already has content, seed it.
      if (model.getValueLength() === 0 && yValue.length > 0) {
        model.setValue(yValue);
      }
    }

    editor.setModel(model);
  }, [doc, filePath, language]);

  // 3) Bind Monaco model <-> Y.Text whenever file or editor changes
  useEffect(() => {
    const editor = editorRef.current;

    // cleanup any prior binding
    bindingRef.current?.destroy();
    bindingRef.current = null;

    if (!editor || !filePath) return;

    const model = editor.getModel();
    if (!model) return;

    // presence: show what file I'm on
    (awareness as any).setLocalStateField("activeFile", normalizePath(filePath));

    const yText = getOrCreateYText(doc, filePath);

    bindingRef.current = new MonacoBinding(yText, model, new Set([editor]), awareness);

    return () => {
      bindingRef.current?.destroy();
      bindingRef.current = null;
    };
  }, [doc, awareness, filePath]);

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
          <div
            style={{
              fontSize: 12,
              color: "crimson",
              maxWidth: 520,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
            title={err}
          >
            {err}
          </div>
        )}
      </div>

      <div style={{ flex: "1 1 auto", minHeight: 0 }}>
        <Editor
          theme="vs"
          onMount={handleMount}
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
