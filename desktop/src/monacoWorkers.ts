import EditorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import JsonWorker from "monaco-editor/esm/vs/language/json/json.worker?worker";
import CssWorker from "monaco-editor/esm/vs/language/css/css.worker?worker";
import HtmlWorker from "monaco-editor/esm/vs/language/html/html.worker?worker";
import TsWorker from "monaco-editor/esm/vs/language/typescript/ts.worker?worker";

(self as any).MonacoEnvironment = {
  getWorker(_: unknown, label: string) {
    switch (label) {
      case "json":
        return new (JsonWorker as any)();
      case "css":
      case "scss":
      case "less":
        return new (CssWorker as any)();
      case "html":
      case "handlebars":
      case "razor":
        return new (HtmlWorker as any)();
      case "typescript":
      case "javascript":
        return new (TsWorker as any)();
      default:
        return new (EditorWorker as any)();
    }
  },
};
