import React from "react";

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: any }
> {
  state = { error: null };

  static getDerivedStateFromError(error: any) {
    return { error };
  }

  componentDidCatch(error: any, info: any) {
    console.error("Render crash:", error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 16, fontFamily: "monospace", whiteSpace: "pre-wrap" }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>App crashed:</div>
          {String(this.state.error?.stack ?? this.state.error)}
        </div>
      );
    }
    return this.props.children;
  }
}
