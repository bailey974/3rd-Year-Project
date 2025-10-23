import React from "react";
import Editor, { OnMount } from "@monaco-editor/react";

type Props = {
  value: string;
  language?: string;      // e.g., "typescript" | "javascript" | "python" | ...
  theme?: "vs-dark" | "light";
  onChange?: (code: string) => void;
};

const CodeEditor: React.FC<Props> = ({
  value,
  language = "typescript",
  theme = "vs-dark",
  onChange
}) => {
  const handleMount: OnMount = (editor, monaco) => {
    // Optional: editor tweaks (minimap, tab size, etc.)
    editor.updateOptions({
      minimap: { enabled: true },
      tabSize: 2,
      insertSpaces: true,
      smoothScrolling: true,
      automaticLayout: true
    });

    // Optional: custom theme sample
    // monaco.editor.defineTheme("my-dark", { base: "vs-dark", inherit: true, rules: [], colors: {} });
    // monaco.editor.setTheme("my-dark");
  };

  return (
    <Editor
      height="100vh"
      defaultLanguage={language}
      value={value}
      theme={theme}
      onMount={handleMount}
      onChange={(v) => onChange?.(v ?? "")}
      options={{
        scrollBeyondLastLine: false,
        wordWrap: "on",
        renderWhitespace: "selection"
      }}
    />
  );
};

export default CodeEditor;
