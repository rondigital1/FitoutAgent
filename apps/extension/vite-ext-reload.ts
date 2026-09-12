import type { Plugin } from "vite";
import http from "node:http";

const PORT = 9527;

/** Dev-only: `vite build --watch` serves a version counter; the panel polls it and reloads the extension. */
export function extReloadPlugin(): Plugin {
  let version = Date.now();
  let server: http.Server | null = null;

  const ensureServer = () => {
    if (server) return;
    server = http.createServer((req, res) => {
      res.setHeader("Access-Control-Allow-Origin", "*");
      if (req.url?.startsWith("/version")) {
        res.writeHead(200, { "Content-Type": "text/plain" });
        res.end(String(version));
        return;
      }
      res.writeHead(404);
      res.end();
    });
    server.listen(PORT, "127.0.0.1", () => {
      console.log(`[settlein-reload] watching on http://127.0.0.1:${PORT}/version`);
    });
    server.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE") {
        console.log(`[settlein-reload] port ${PORT} already in use — another watch is fine`);
        server = null;
      } else {
        console.warn("[settlein-reload]", err.message);
      }
    });
  };

  return {
    name: "settlein-ext-reload",
    apply: "build",
    buildStart() {
      // Only meaningful under --watch; harmless for one-shot builds.
      ensureServer();
    },
    writeBundle() {
      version = Date.now();
      console.log(`[settlein-reload] build #${version} — extension will auto-reload`);
    },
    closeBundle() {
      // keep server alive across watch rebuilds
    },
  };
}
