#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { isMainThread, parentPort, Worker, workerData } from "node:worker_threads";
import * as BABYLON from "@babylonjs/core";

import { Mt5Loader } from "../../src/Mt5Loader.js";
import { PACKAGED_VIEWER_ASSETS } from "../../src/PackagedViewerAssets.js";
import { detectMt5OverlayFaces } from "./mt5_overlay_analyzer.js";

const DEFAULT_CATALOG = "public/models.json";
const DEFAULT_OUTPUT = "play/data/mt5-overlay-manifest.json";
const DEFAULT_ROOTS = ["public/models", ".disc-work"];

function parseArguments(argv) {
  const options = {
    catalog: DEFAULT_CATALOG,
    output: DEFAULT_OUTPUT,
    roots: [...DEFAULT_ROOTS],
    match: null,
    workers: 4,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--catalog") options.catalog = argv[++index];
    else if (argument === "--output") options.output = argv[++index];
    else if (argument === "--root") options.roots.push(argv[++index]);
    else if (argument === "--match") options.match = new RegExp(argv[++index], "i");
    else if (argument === "--workers") options.workers = Number(argv[++index]);
    else if (argument === "--help") {
      console.log(
        "Usage: node tools/assets/generate_mt5_overlay_manifest.js "
        + "[--catalog FILE] [--output FILE] [--root DIRECTORY] "
        + "[--match REGEXP] [--workers COUNT]",
      );
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  if (!Number.isInteger(options.workers) || options.workers < 1 || options.workers > 6) {
    throw new Error("--workers must be an integer between 1 and 6");
  }
  return options;
}

function walkFiles(directory, output) {
  if (!fs.existsSync(directory)) return;
  const entries = fs.readdirSync(directory, { withFileTypes: true });
  for (const entry of entries) {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) walkFiles(filename, output);
    else if (entry.isFile() && entry.name.toUpperCase().endsWith(".MT5")) {
      output.push(filename);
    }
  }
}

function indexLocalModels(roots) {
  const candidates = [];
  for (const root of roots) walkFiles(root, candidates);
  const index = new Map();
  for (const filename of candidates) {
    const basename = path.basename(filename).toUpperCase();
    const current = index.get(basename);
    const isPublic = filename.startsWith(`public${path.sep}models${path.sep}`);
    const currentIsPublic = current?.startsWith(
      `public${path.sep}models${path.sep}`,
    );
    if (
      !current
      || (isPublic && !currentIsPublic)
      || (isPublic === currentIsPublic && filename.length < current.length)
    ) {
      index.set(basename, filename);
    }
  }
  return index;
}

function isMapModel(filename) {
  return /_MAP(?:_?[A-Z0-9]+)?\.MT5$/i.test(filename);
}

export function mapSourcesForCatalog(catalog, localModels, packagedAssets = PACKAGED_VIEWER_ASSETS) {
  return [...new Set(catalog.map(filename => filename.toUpperCase()))]
    .filter(filename => isMapModel(filename) || /\.MAPM$/i.test(packagedAssets[filename] || ""))
    .sort()
    .map(filename => ({
      filename,
      // Match browser resolution exactly. A stale flat export must not take
      // precedence over the actual package, nor stand in for a missing one.
      localFilename: packagedAssets[filename] || localModels.get(filename),
    }));
}

function arrayBufferForFile(filename) {
  const data = fs.readFileSync(filename);
  return data.buffer.slice(
    data.byteOffset,
    data.byteOffset + data.byteLength,
  );
}

async function analyzeModels(sources) {
  const engine = new BABYLON.NullEngine();
  const files = {};
  try {
    for (const { filename, localFilename } of sources) {
      const scene = new BABYLON.Scene(engine);
      try {
        const buffer = arrayBufferForFile(localFilename);
        const loader = new Mt5Loader(scene);
        // Empty map variants are valid: parsing succeeds but leaves no faces
        // to analyze. Parse errors still abort instead of publishing partial data.
        await loader.load(buffer);
        const result = detectMt5OverlayFaces(scene);
        if (result.overlays.length > 0) {
          files[filename] = {
            byteLength: buffer.byteLength,
            triangleCount: result.triangleCount,
            overlays: result.overlays,
          };
        }
      } catch (error) {
        throw new Error(`[mt5-overlays] ${filename}: ${error.message}`, { cause: error });
      } finally {
        scene.dispose();
      }
    }
  } finally {
    engine.dispose();
  }
  return files;
}

async function analyzeInWorkers(sources, count) {
  const batches = Array.from({ length: Math.min(count, sources.length) }, () => []);
  sources.forEach((source, index) => batches[index % batches.length].push(source));
  const workers = batches.map(batch => new Worker(new URL(import.meta.url), { workerData: batch }));
  try {
    const results = await Promise.all(workers.map(worker => new Promise((resolve, reject) => {
      let result;
      worker.once("message", value => { result = value; });
      worker.once("error", reject);
      worker.once("exit", code => {
        if (code !== 0 || !result) reject(new Error(`Overlay worker exited without results (code ${code})`));
        else resolve(result);
      });
    })));
    return Object.fromEntries(Object.entries(Object.assign({}, ...results))
      .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0));
  } finally {
    await Promise.all(workers.map(worker => worker.terminate()));
  }
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const catalog = JSON.parse(fs.readFileSync(options.catalog, "utf8"));
  const localModels = indexLocalModels([...new Set(options.roots)]);
  const sources = mapSourcesForCatalog(catalog, localModels)
    .filter(({ filename }) => !options.match || options.match.test(filename));
  const available = sources.filter(({ localFilename }) => localFilename && fs.existsSync(localFilename));
  const missing = sources.filter(source => !available.includes(source)).map(source => source.filename);
  console.log(`[mt5-overlays] analyzing ${available.length} maps using ${options.workers} workers; ${missing.length} missing`);
  const files = await analyzeInWorkers(available, options.workers);
  const analyzed = available.length;

  const manifest = {
    schema: "new-yokosuka-mt5-depth-overlays-v1",
    analyzer: {
      maximumPlaneDistance: 0.005,
      minimumNormalAlignment: 0.999,
      minimumCoverage: 0.85,
      maximumDetailAreaRatio: 0.5,
    },
    analyzedFileCount: analyzed,
    missingFileCount: missing.length,
    missingFiles: missing,
    files,
  };
  fs.mkdirSync(path.dirname(options.output), { recursive: true });
  fs.writeFileSync(
    options.output,
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  console.log(
    `[mt5-overlays] wrote ${options.output}: ${analyzed} analyzed, `
    + `${Object.keys(files).length} with overlays, ${missing.length} missing`,
  );
}

if (!isMainThread) {
  parentPort.postMessage(await analyzeModels(workerData));
} else if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
