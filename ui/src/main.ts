import "./styles.css";
import "./ui/app.ts";

// When on localhost, connect to hot-reload server (pnpm hot); refresh when UI rebuilds
if (typeof window !== "undefined" && window.location.hostname === "localhost") {
  const port = 35729;
  try {
    const ws = new WebSocket(`ws://localhost:${port}`);
    ws.onmessage = (e) => {
      if (e.data === "reload") window.location.reload();
    };
  } catch (_) {
    // Reload server not running (e.g. not using pnpm hot)
  }
}
