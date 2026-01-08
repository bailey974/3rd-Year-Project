import CodeEditor from "./components/CodeEditor";
import TerminalPanel from "./components/TerminalPanel";

export default function App() {
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      <div style={{ flex: 1, minHeight: 0 }}>
        <CodeEditor />
      </div>
      <div style={{ height: 260 }}>
        <TerminalPanel />
      </div>
    </div>
  );
}
