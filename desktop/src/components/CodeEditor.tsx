import { useEffect, useMemo, useRef, useState } from "react";
import Editor from "@monaco-editor/react";
import type * as monaco from "monaco-editor";
import { MonacoBinding } from "y-monaco";

import { useCollab } from "../collab/CollabProvider";
import { getOrCreateYText, normalizePath } from "../collab/yFiles";

type Props = {
  filePath?: string | null;

  // content coming from your backend (/fs/read)
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

function accessMessage(reason: string) {
  switch (reason) {
    case "tree_not_shared":
      return "Host has not shared the file tree.";
    case "outside_shared_roots":
      return "This file is outside the shared roots.";
    case "hidden":
      return "This file is hidden by the host.";
    case "excluded":
      return "This file is excluded by the host (cannot be opened).";
    default:
      return "Access denied.";
  }
}

export default function CodeEditor({ filePath, initialContent }: Props) {
  const { doc, awareness, canViewDoc, canEditDoc, effectiveDocLevel, getPathAccess, requestEdit, role, isHost } =
    useCollab();

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Guard against out-of-order async work
  const loadSeq = useRef(0);

  // Monaco refs
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof monaco | null>(null);

  const bindingRef = useRef<MonacoBinding | null>(null);

  const language = useMemo(() => inferLanguage(filePath), [filePath]);

  const canView = useMemo(() => (filePath ? canViewDoc(filePath) : true), [filePath, canViewDoc]);
  const canEdit = useMemo(() => (filePath ? canEditDoc(filePath) : false), [filePath, canEditDoc]);
  const level = useMemo(() => (filePath ? effectiveDocLevel(filePath) : "none"), [filePath, effectiveDocLevel]);

  const accessReason = useMemo(() => {
    if (!filePath) return null;
    const acc = getPathAccess(filePath, { asGuest: !isHost });
    return acc.ok ? null : acc.reason;
  }, [filePath, getPathAccess, isHost]);

  // Ensure the editor is ALWAYS showing the correct model for the clicked file
  useEffect(() => {
    const editor = editorRef.current;
    const monacoApi = monacoRef.current;
    if (!editor || !monacoApi) return;

    // cleanup binding whenever model changes
    bindingRef.current?.destroy();
    bindingRef.current = null;

    if (!filePath || !canView) {
      editor.setModel(null as any);
      return;
    }

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

    editor.updateOptions({ readOnly: !canEdit });
  }, [filePath, language, canView, canEdit]);

  // Seed the shared Y.Text from initialContent (ONLY if it’s empty)
  useEffect(() => {
    const seq = ++loadSeq.current;

    async function seedFromInitialContent() {
      if (!filePath) {
        setErr(null);
        setLoading(false);
        return;
      }

      if (!canView) {
        setErr(accessReason ? accessMessage(accessReason) : "No permission to view this file.");
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
        setErr(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      setErr(null);

      try {
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

    void seedFromInitialContent();
  }, [doc, filePath, initialContent, canView, accessReason]);

  // Bind Monaco model <-> Y.Text and re-bind when Monaco swaps models
  useEffect(() => {
    const editor = editorRef.current;

    // cleanup any prior binding
    bindingRef.current?.destroy();
    bindingRef.current = null;

    if (!editor || !filePath || !canView) return;

    const bind = () => {
      bindingRef.current?.destroy();
      bindingRef.current = null;

      const model = editor.getModel();
      if (!model) return;

      // presence: show what file I'm on
      (awareness as any).setLocalStateField("activeFile", normalizePath(filePath));

      const yText = getOrCreateYText(doc, filePath);

      // MonacoBinding still applies remote updates even if editor is readOnly.
      editor.updateOptions({ readOnly: !canEdit });

      bindingRef.current = new MonacoBinding(yText, model, new Set([editor]), awareness);
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
  }, [doc, awareness, filePath, canView, canEdit]);

  const headerRight = (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      {filePath && (
        <span
          style={{
            fontSize: 12,
            padding: "3px 8px",
            borderRadius: 999,
            border: "1px solid rgba(0,0,0,0.15)",
            background: "rgba(0,0,0,0.03)",
            opacity: 0.9,
          }}
          title={`Role: ${role} • Permission: ${level}`}
        >
          {canEdit ? "Editable" : level === "view" ? "Read-only" : "No access"}
        </span>
      )}

      {filePath && canView && !canEdit && role !== "host" && (
        <button
          onClick={() => requestEdit(filePath)}
          style={{
            padding: "6px 10px",
            borderRadius: 8,
            border: "1px solid #d1d5db",
            background: "#fff",
            cursor: "pointer",
            fontSize: 12,
          }}
          title="Ask the host to grant edit permission for this file"
        >
          Request edit
        </button>
      )}
    </div>
  );

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

        {headerRight}
      </div>

      <div style={{ flex: "1 1 auto", minHeight: 0 }}>
        {!filePath ? (
          <div style={{ padding: 18, opacity: 0.7 }}>Select a file to start.</div>
        ) : !canView ? (
          <div style={{ padding: 18, color: "crimson" }}>
            {accessReason ? accessMessage(accessReason) : "You don't have permission to view this file."}
          </div>
        ) : (
          <Editor
            // model identity is handled explicitly via monaco.editor + setModel
            path={"inmemory://editor"}
            language={language}
            theme="vs"
            onMount={(editor, monacoApi) => {
              editorRef.current = editor;
              monacoRef.current = monacoApi as unknown as typeof monaco;
              editor.updateOptions({ readOnly: !canEdit });
            }}
            options={{
              automaticLayout: true,
              minimap: { enabled: false },
              fontSize: 14,
              tabSize: 2,
              insertSpaces: true,
              wordWrap: "on",
              scrollBeyondLastLine: false,
              readOnly: !canEdit,
              domReadOnly: !canEdit,
            }}
          />
        )}
      </div>
    </div>
  );
}
