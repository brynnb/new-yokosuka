#!/usr/bin/env node
import {createServer} from "vite";
import {mkdir, readFile, writeFile, rename} from "node:fs/promises";
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const port = Number(process.env.SCENERY_LAB_PORT || 5190);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("Invalid SCENERY_LAB_PORT");
const output = resolve(root, ".disc-work/scenery-bundle");
await mkdir(output, {recursive: true});
const server = await createServer({
  root, configFile: resolve(root, "vite.config.js"),
  cacheDir: resolve(root, "node_modules/.vite-scenery-lab"),
  server: {host: "127.0.0.1", port, strictPort: true, hmr: false, watch: null, forwardConsole: false},
  plugins: [{name: "local-scenery-output", configureServer(server) {
    server.middlewares.use(async (req, res, next) => {
      const match = /^\/scenery-output\/(world\.(?:json|bin))$/.exec(req.url);
      if (!match) return next();
      // Only this loopback page may write these two ignored generated files.
      // No arbitrary paths, cross-origin uploads, or production middleware.
      const origin = `http://127.0.0.1:${port}`;
      if (req.headers.host !== `127.0.0.1:${port}` || (req.method === "PUT" && req.headers.origin !== origin)) {
        res.writeHead(403); res.end(); return;
      }
      const path = resolve(output, match[1]);
      try {
        if (req.method === "GET") {
          const data = await readFile(path);
          res.writeHead(200, {"Content-Type": path.endsWith("json") ? "application/json" : "application/octet-stream", "Cache-Control": "no-store"});
          res.end(data);
        } else if (req.method === "PUT") {
          const chunks = []; let length = 0;
          for await (const chunk of req) {
            length += chunk.length;
            if (length > 128 * 1024 * 1024) throw new Error("Bundle exceeds 128 MiB limit");
            chunks.push(chunk);
          }
          await writeFile(`${path}.pending`, Buffer.concat(chunks));
          await rename(`${path}.pending`, path);
          res.writeHead(204); res.end();
        } else { res.writeHead(405); res.end(); }
      } catch (error) {
        res.writeHead(error.code === "ENOENT" ? 404 : 500); res.end(error.message);
      }
    });
  }}],
});
await server.listen();
console.info(`Scenery lab: http://127.0.0.1:${port}/tools/assets/scenery-bundle-lab.html`);
console.info(`Generated output: ${output}. No gameplay or production changes.`);
for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, async () => {await server.close(); process.exit(0);});
