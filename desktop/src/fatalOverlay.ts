function mountOverlay() {
  const el = document.createElement("div");
  el.id = "__fatal_overlay__";
  el.style.position = "fixed";
  el.style.inset = "0";
  el.style.background = "white";
  el.style.color = "crimson";
  el.style.padding = "16px";
  el.style.fontFamily = "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace";
  el.style.fontSize = "12px";
  el.style.whiteSpace = "pre-wrap";
  el.style.overflow = "auto";
  el.style.zIndex = "999999";
  el.textContent = "Fatal error overlay mounted (waiting for errors)...";
  document.body.appendChild(el);
  return el;
}

let overlay: HTMLDivElement | null = null;

function showFatal(title: string, details: unknown) {
  try {
    if (!overlay) overlay = mountOverlay();
    const msg =
      typeof details === "string"
        ? details
        : details instanceof Error
        ? `${details.name}: ${details.message}\n${details.stack ?? ""}`
        : JSON.stringify(details, null, 2);

    overlay.textContent = `❌ ${title}\n\n${msg}`;
  } catch {
    // last resort: do nothing
  }
}

export function installFatalOverlay() {
  window.addEventListener("error", (e) => {
    showFatal("window.error", (e as any)?.error ?? (e as any)?.message ?? e);
  });

  window.addEventListener("unhandledrejection", (e) => {
    showFatal("unhandledrejection", (e as PromiseRejectionEvent).reason);
  });
}
