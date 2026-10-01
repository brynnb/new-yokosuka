#!/usr/bin/env node

import path from "node:path";
import { createServer } from "vite";

const root = path.resolve(import.meta.dirname, "../..");
const port = Number(process.env.NY_E2E_SERVER_PORT || 5176);
if (!Number.isInteger(port) || port < 1024 || port > 65535) {
  throw new Error("NY_E2E_SERVER_PORT must be an unprivileged TCP port");
}

// Full cutscenes can take several minutes. A normal dev-server reload during
// concurrent work destroys playback and invalidates its completion evidence.
// This separate local server retains transformed modules until restarted;
// restart it after each cutscene fix. It is not an immutable source snapshot.
const server = await createServer({
  root,
  configFile: path.join(root, "vite.config.js"),
  cacheDir: path.join(root, "node_modules/.vite-cutscene-e2e"),
  logLevel: "error",
  server: { host: "127.0.0.1", port, strictPort: true, hmr: false, watch: null },
});
await server.listen();
console.info(`Cutscene test server: http://127.0.0.1:${port}/play/ (PID ${process.pid})`);
console.info("Hot reload disabled; restart this process after source/asset changes.");
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, async () => {
    await server.close();
    process.exit(0);
  });
}
