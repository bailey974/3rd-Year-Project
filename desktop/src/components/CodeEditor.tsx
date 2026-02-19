import { useEffect, useMemo, useRef, useState } from "react";
import Editor from "@monaco-editor/react";
import type * as monaco from "monaco-editor";
import { MonacoBinding } from "y-monaco";

import { useCollab } from "../collab/CollabProvider";
import { getOrCreateYText, normalizePath } from "../collab/yFiles";

type Props = {
  filePath?: string | null;

  // ✅ content coming from your backend (/fs/read)
  // used to seed shared Y.Text when it's empty, so you do NOT rely on Tauri local FS permissions.
  initialContent?: string;
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

function toMonacoUri(monacoApi: typeof monaco, filePath: string) {
  const norm = filePath.replace(/\\/g, "/");

  // Windows: C:/...
  if (/^[a-zA-Z]:\//.test(norm)) {
    return monacoApi.Uri.parse(`file:///${encodeURI(norm)}`);
  }

  // Posix: /...
  if (norm.startsWith("/")) {
    return monacoApi.Uri.parse(`file://${encodeURI(norm)}`);
  }

  return monacoApi.Uri.parse(`file:///${encodeURI(norm)}`);
}

export default function CodeEditor({ filePath, initialContent }: Props) {
  const { doc, awareness } = useCollab();

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Guard against out-of-order async work
  const loadSeq = useRef(0);

  // Monaco refs
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof monaco | null>(null);

  const bindingRef = useRef<MonacoBinding | null>(null);

  const language = useMemo(() => inferLanguage(filePath), [filePath]);

  // ✅ ensure the editor is ALWAYS showing the correct model for the clicked file
  useEffect(() => {
    const editor = editorRef.current;
    const monacoApi = monacoRef.current;
    if (!editor || !monacoApi) return;

    // cleanup binding whenever model changes
    bindingRef.current?.destroy();
    bindingRef.current = null;

    if (!filePath) return;

    const uri = toMonacoUri(monacoApi, filePath);

    let model = monacoApi.editor.getModel(uri);
    if (!model) {
      model = monacoApi.editor.createModel("", language, uri);
    } else {
      const currentLang = monacoApi.editor.getModelLanguage(model);
      if (currentLang !== language) {
        monacoApi.editor.setModelLanguage(model, language);
      }
    }

    if (editor.getModel() !== model) {
      editor.setModel(model);
    }
  }, [filePath, language]);

  // ✅ seed the shared Y.Text from initialContent (ONLY if it’s empty)
  useEffect(() => {
    const seq = ++loadSeq.current;

    async function seedFromInitialContent() {
      if (!filePath) {
        setErr(null);
        setLoading(false);
        return;
      }

      const yText = getOrCreateYText(doc, filePath);

      // If room already has content, do NOT overwrite it.
      if (yText.length > 0) {
        setErr(null);
        setLoading(false);
        return;
      }

      const seed = (initialContent ?? "").toString();
      if (!seed) {
        // no seed available; still allow editing
        setErr(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      setErr(null);

      try {
        // file switched while loading
        if (loadSeq.current !== seq) return;

        if (yText.length === 0) {
          doc.transact(() => {
            yText.insert(0, seed);
          });
        }
      } catch (e: any) {
        if (loadSeq.current === seq) {
          setErr(e?.message ?? String(e));
        }
      } finally {
        if (loadSeq.current === seq) setLoading(false);
      }
    }

    seedFromInitialContent();
  }, [doc, filePath, initialContent]);

  // ✅ bind Monaco model <-> Y.Text and re-bind when Monaco swaps models
  useEffect(() => {
    const editor = editorRef.current;

    // cleanup any prior binding
    bindingRef.current?.destroy();
    bindingRef.current = null;

    if (!editor || !filePath) return;

    const bind = () => {
      bindingRef.current?.destroy();
      bindingRef.current = null;

      const model = editor.getModel();
      if (!model) return;

      // presence: show what file I'm on
      (awareness as any).setLocalStateField("activeFile", normalizePath(filePath));

      const yText = getOrCreateYText(doc, filePath);

      bindingRef.current = new MonacoBinding(
        yText,
        model,
        new Set([editor]),
        awareness
      );
    };

    // bind now
    bind();

    // bind again whenever Monaco swaps model internally
    const disp = editor.onDidChangeModel(() => bind());

    return () => {
      disp.dispose();
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
          // model identity is handled explicitly in the effect via monaco.editor + setModel
          // keep this stable to avoid @monaco-editor/react creating weird URIs on Windows
          path={"inmemory://editor"}
          language={language}
          theme="vs"
          onMount={(editor, monacoApi) => {
            editorRef.current = editor;
            monacoRef.current = monacoApi as unknown as typeof monaco;
          }}
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
