import {
  copyFileSync,
  createReadStream,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
} from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import runtimeManifest from "./src/runtime-assets.generated.json" with { type: "json" };
import {
  EMULATORJS_FILES,
  emulatorJsCacheRoot,
} from "./scripts/emulatorjs-assets.mjs";

const projectRoot = fileURLToPath(new URL(".", import.meta.url));
const assetDevTarget = "https://pub-c3aa1dfd53424ee9af1b87ad19954589.r2.dev";
const localRyoMotionPath = resolve(
  projectRoot, ".disc-work/runtime-motion/MOTION.BIN",
);
const ryoMotionPath = [
  process.env.SHENMUE_MOTION_PATH,
  localRyoMotionPath,
].filter(Boolean).find(existsSync) || localRyoMotionPath;
const localFightMotionPath = resolve(
  projectRoot,
  "extracted_disc3_v2/data/SCENE/03/MFBT/M_FGT1.BIN",
);
const fightMotionPath = [
  process.env.SHENMUE_FIGHT_MOTION_PATH,
  localFightMotionPath,
].filter(Boolean).find(existsSync) || localFightMotionPath;
const motionAssets = Object.freeze(new Map([
  ["/motion/MOTION.BIN", ryoMotionPath],
  ["/motion/M_FGT1.BIN", fightMotionPath],
]));
const localModelRoots = [
  process.env.SHENMUE_MODEL_PATH,
  resolve(projectRoot, "public/models"),
].filter((root, index, roots) => (
  Boolean(root)
  && roots.indexOf(root) === index
  && existsSync(root)
));
const localShenmue2Root = [
  process.env.SHENMUE2_MODEL_PATH,
  resolve(projectRoot, ".disc-work/shenmue2-models"),
  resolve(projectRoot, ".disc-work/shenmue2-disc1-models"),
].filter(Boolean).find(existsSync);
const emulatorCacheRoot = emulatorJsCacheRoot(projectRoot);

function copyDirectoryContents(sourceRoot, targetRoot, {
  excludeTopLevel = new Set(),
  relativeDirectory = "",
} = {}) {
  const sourceDirectory = resolve(sourceRoot, relativeDirectory);
  if (!existsSync(sourceDirectory)) return;
  mkdirSync(resolve(targetRoot, relativeDirectory), { recursive: true });
  for (const entry of readdirSync(sourceDirectory, { withFileTypes: true })) {
    if (!relativeDirectory && excludeTopLevel.has(entry.name)) continue;
    const relativePath = relativeDirectory
      ? `${relativeDirectory}/${entry.name}`
      : entry.name;
    if (entry.isDirectory()) {
      copyDirectoryContents(sourceRoot, targetRoot, {
        excludeTopLevel,
        relativeDirectory: relativePath,
      });
      continue;
    }
    // Restored/extracted audio is a development input, never a release input.
    // Keep authored JSON manifests and other public resources in the build.
    if (runtimeManifest.assets[`public/${relativePath}`]
      && !relativePath.endsWith(".json")) continue;
    if (/^(audio|music)\//.test(relativePath) && !relativePath.endsWith(".json")) continue;
    const targetPath = resolve(targetRoot, relativePath);
    mkdirSync(resolve(targetPath, ".."), { recursive: true });
    copyFileSync(resolve(sourceRoot, relativePath), targetPath);
  }
}

function productionPublicAssets() {
  return {
    name: "copy-production-public-assets",
    apply: "build",
    writeBundle(outputOptions) {
      const outputDirectory = outputOptions.dir || resolve(projectRoot, "dist");
      copyDirectoryContents(resolve(projectRoot, "public"), outputDirectory, {
        // Extracted model binaries are local-development inputs. Production
        // resolves them from R2, and copying an ignored local catalog into a
        // build makes local releases huge and unlike clean CI builds.
        excludeTopLevel: new Set(["models"]),
      });
    },
  };
}

function emulatorAssets() {
  return EMULATORJS_FILES.map((file) => {
    const sourcePath = resolve(emulatorCacheRoot, file.sourcePath);
    if (!existsSync(sourcePath)) {
      throw new Error(
        `Missing pinned EmulatorJS asset ${file.sourcePath}; run npm run prepare:arcade`,
      );
    }
    return { fileName: file.outputPath, sourcePath };
  });
}

function contentTypeFor(pathname) {
  if (pathname.endsWith(".html")) return "text/html; charset=utf-8";
  if (pathname.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (pathname.endsWith(".css")) return "text/css; charset=utf-8";
  if (pathname.endsWith(".json")) return "application/json; charset=utf-8";
  if (pathname.endsWith(".wasm")) return "application/wasm";
  if (pathname.endsWith(".zip")) return "application/zip";
  return "application/octet-stream";
}

function serveFile(request, response, sourcePath) {
  response.statusCode = 200;
  response.setHeader("Content-Type", contentTypeFor(sourcePath));
  response.setHeader("Content-Length", String(statSync(sourcePath).size));
  if (request.method === "HEAD") {
    response.end();
    return;
  }
  createReadStream(sourcePath).pipe(response);
}

const canonicalDirectoryPages = new Set([
  "/asset-viewer",
  "/play",
  "/story-review",
]);

function redirectCanonicalDirectoryPages(server) {
  server.middlewares.use((request, response, next) => {
    if (request.method !== "GET" && request.method !== "HEAD") {
      next();
      return;
    }
    const url = new URL(request.url, "http://localhost");
    if (!canonicalDirectoryPages.has(url.pathname)) {
      next();
      return;
    }
    response.statusCode = 308;
    response.setHeader("Location", `${url.pathname}/${url.search}`);
    response.end();
  });
}

function serveMotionAssets(server) {
  server.middlewares.use((request, response, next) => {
    const pathname = new URL(request.url, "http://localhost").pathname;
    const sourcePath = motionAssets.get(pathname);
    if (!sourcePath) {
      next();
      return;
    }
    if (!existsSync(sourcePath)) {
      response.statusCode = 404;
      response.setHeader("Content-Type", "text/plain; charset=utf-8");
      response.end(`Motion source not found: ${sourcePath}`);
      return;
    }
    response.statusCode = 200;
    response.setHeader("Content-Type", "application/octet-stream");
    response.setHeader(
      "Content-Length",
      String(statSync(sourcePath).size),
    );
    if (request.method === "HEAD") {
      response.end();
      return;
    }
    createReadStream(sourcePath).pipe(response);
  });
}

function serveLocalModelAssets(server) {
  if (localModelRoots.length === 0) return;
  server.middlewares.use((request, response, next) => {
    const pathname = new URL(request.url, "http://localhost").pathname;
    if (!pathname.startsWith("/models/")) {
      next();
      return;
    }
    const filename = decodeURIComponent(pathname.slice("/models/".length));
    // The staged Shenmue catalog is flat. Keep requests inside that directory.
    if (!filename || filename.includes("/") || filename.includes("\\")) {
      next();
      return;
    }
    // Local extraction roots may be partial. Resolve each asset independently
    // so a checked-in development subset does not hide files available in a
    // complete staging directory later in the search path.
    const sourcePath = localModelRoots
      .map((root) => resolve(root, filename))
      .find(existsSync);
    if (!sourcePath) {
      next();
      return;
    }
    serveFile(request, response, sourcePath);
  });
}

function serveLocalShenmue2Assets(server) {
  if (!localShenmue2Root) return;
  server.middlewares.use((request, response, next) => {
    const pathname = new URL(request.url, "http://localhost").pathname;
    let relativePath = null;
    if (pathname === "/shenmue2/models.json") {
      relativePath = existsSync(resolve(localShenmue2Root, "viewer-models.json"))
        ? "viewer-models.json"
        : "models.json";
    } else {
      const match = pathname.match(/^\/shenmue2\/(models|textures)\/([^/]+)$/);
      if (match) {
        relativePath = `${match[1]}/${decodeURIComponent(match[2])}`;
      }
    }
    if (!relativePath || relativePath.includes("\\") || relativePath.includes("..")) {
      next();
      return;
    }
    const sourcePath = resolve(localShenmue2Root, relativePath);
    if (!existsSync(sourcePath)) {
      next();
      return;
    }
    serveFile(request, response, sourcePath);
  });
}

function serveArcadeFiles(server) {
  const assets = new Map(emulatorAssets().map((asset) => (
    [`/${asset.fileName}`, asset.sourcePath]
  )));
  assets.set(
    "/arcade/emulator.html",
    resolve(projectRoot, "arcade/emulator.html"),
  );
  assets.set(
    "/arcade/emulator.js",
    resolve(projectRoot, "arcade/emulator.js"),
  );
  server.middlewares.use((request, response, next) => {
    const pathname = new URL(request.url, "http://localhost").pathname;
    const assetPath = assets.get(pathname);
    if (assetPath && existsSync(assetPath)) {
      serveFile(request, response, assetPath);
      return;
    }
    next();
  });
}

function redirectCanonicalAppRoutes(server) {
  const directoryRoutes = new Set(["/asset-viewer", "/play", "/script-editor"]);
  server.middlewares.use((request, response, next) => {
    const url = new URL(request.url, "http://localhost");
    if (!directoryRoutes.has(url.pathname)) {
      next();
      return;
    }
    response.statusCode = 308;
    response.setHeader("Location", `${url.pathname}/${url.search}`);
    response.end();
  });
}

const multiplayerDevPort = Number.parseInt(
  process.env.NEW_YOKOSUKA_DEV_SERVER_PORT || "8080",
  10,
);
const multiplayerDevTarget =
  `http://127.0.0.1:${Number.isInteger(multiplayerDevPort) ? multiplayerDevPort : 8080}`;

export default defineConfig({
  // This package is produced from the sibling Lucky Break worktree and its
  // vendored tarball changes during normal local development. Prebundling it
  // would leave a running Vite server serving an older optimized copy after a
  // sync, even though node_modules and production builds contain the new API.
  optimizeDeps: {
    exclude: ["@brynnb/lucky-break-engine"],
  },
  plugins: [
    react(),
    productionPublicAssets(),
    {
      name: "canonical-directory-pages",
      configureServer: redirectCanonicalDirectoryPages,
      configurePreviewServer: redirectCanonicalDirectoryPages,
    },
    {
      name: "bundle-ryo-motion",
      configureServer(server) {
        redirectCanonicalAppRoutes(server);
        serveMotionAssets(server);
        serveLocalModelAssets(server);
        serveLocalShenmue2Assets(server);
        serveArcadeFiles(server);
      },
      generateBundle() {
        for (const [urlPath, sourcePath] of motionAssets) {
          if (!existsSync(sourcePath)) {
            this.warn(`Motion source not found: ${sourcePath}`);
            continue;
          }
          this.emitFile({
            type: "asset",
            fileName: urlPath.slice(1),
            source: readFileSync(sourcePath),
          });
        }
        for (const asset of emulatorAssets()) {
          this.emitFile({
            type: "asset",
            fileName: asset.fileName,
            source: readFileSync(asset.sourcePath),
          });
        }
      },
    },
  ],
  server: {
    proxy: {
      "/r2-assets": {
        target: assetDevTarget,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/r2-assets/, ""),
      },
      "/ws": {
        target: multiplayerDevTarget,
        ws: true,
      },
      "/api": {
        target: multiplayerDevTarget,
      },
      "/healthz": {
        target: multiplayerDevTarget,
      },
    },
  },
  build: {
    // Publish maps for the open client. The vendored pool engine supplies only
    // compiled JS, with no upstream maps/private TypeScript to compose into these.
    sourcemap: true,
    manifest: false,
    // Copy public assets with the plugin above so local-only extracted models
    // never enter production output. Development still uses Vite's normal
    // public directory and the /models middleware.
    copyPublicDir: false,
    // This project emits thousands of assets. Compressing every output solely
    // to print estimated gzip sizes creates a large end-of-build memory spike
    // on the hosted deploy runner; release compression is handled by Caddy.
    reportCompressedSize: false,
    rollupOptions: {
      input: {
        landing: resolve(projectRoot, "index.html"),
        assetViewer: resolve(projectRoot, "asset-viewer/index.html"),
        play: resolve(projectRoot, "play/index.html"),
        arcadeEmulator: resolve(projectRoot, "arcade/emulator.html"),
      },
      output: {
        entryFileNames: "assets/[hash].js",
        chunkFileNames: "assets/[hash].js",
      },
    },
  },
  worker: {
    rollupOptions: {
      output: {
        entryFileNames: "assets/[hash].js",
        chunkFileNames: "assets/[hash].js",
      },
    },
  },
});
