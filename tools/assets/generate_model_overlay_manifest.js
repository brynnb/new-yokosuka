#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { createHash } from 'node:crypto';
import { isMainThread, parentPort, Worker, workerData } from "node:worker_threads";
import * as BABYLON from "@babylonjs/core";

import { Mt5Loader } from "../../src/Mt5Loader.js";
import { Mt7Loader } from "../../src/Mt7Loader.js";
import { PACKAGED_VIEWER_ASSETS } from "../../src/PackagedViewerAssets.js";
import { detectModelOverlayFaces } from "./model_overlay_analyzer.js";

const DEFAULT_CATALOG = "public/models.json";
const DEFAULT_OUTPUT = "play/data/mt5-overlay-manifest.json";
const DEFAULT_ROOTS = ["public/models", ".disc-work"];

function parseArguments(argv) {
  const options = {
    game: 's1',
    catalog: null,
    output: null,
    roots: [...DEFAULT_ROOTS],
    match: null,
    workers: 4,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--game") options.game = argv[++index];
    else if (argument === "--catalog") options.catalog = argv[++index];
    else if (argument === "--output") options.output = argv[++index];
    else if (argument === "--root") options.roots.push(argv[++index]);
    else if (argument === "--match") options.match = new RegExp(argv[++index], "i");
    else if (argument === "--workers") options.workers = Number(argv[++index]);
    else if (argument === "--help") {
      console.log(
        "Usage: node tools/assets/generate_model_overlay_manifest.js [--game s1|s2] "
        + "[--catalog FILE] [--output FILE] [--root DIRECTORY] "
        + "[--match REGEXP] [--workers COUNT]",
      );
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  if (!['s1', 's2'].includes(options.game)) throw new Error('--game must be s1 or s2');
  options.catalog ||= options.game === 's2' ? '.disc-work/shenmue2-models/viewer-models.json' : DEFAULT_CATALOG;
  options.output ||= options.game === 's2' ? 'play/data/mt7-overlay-manifest.json' : DEFAULT_OUTPUT;
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

export function mt7MapSourcesForCatalog(catalog, catalogPath) {
  return catalog.models.filter(record => record.kind === 'MAPM').map(record => ({
    filename: record.filename.toUpperCase(),
    localFilename: path.join(path.dirname(catalogPath), 'models', record.filename),
    format: 'MT7',
  })).sort((a, b) => a.filename.localeCompare(b.filename));
}

export function writeMt7OverlayShards(manifest, directory = 'public/data/mt7-overlays') {
  const shards = new Map();
  const files = {};
  for (const [filename, definition] of Object.entries(manifest.files)) {
    const area = filename.split('_').slice(0, 3).join('_');
    if (!shards.has(area)) shards.set(area, {});
    shards.get(area)[filename] = definition;
    files[filename] = {byteLength: definition.byteLength, revision: definition.revision,
      shard: `/data/mt7-overlays/${area}.json`};
  }
  fs.mkdirSync(directory, {recursive: true});
  for (const [area, files] of shards) fs.writeFileSync(path.join(directory, `${area}.json`), `${JSON.stringify({files})}\n`);
  return {...manifest, files};
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
    for (const { filename, localFilename, format } of sources) {
      parentPort?.postMessage({analyzing: filename});
      const scene = new BABYLON.Scene(engine);
      try {
        const buffer = arrayBufferForFile(localFilename);
        const loader = format === 'MT7' ? new Mt7Loader(scene) : new Mt5Loader(scene);
        // Empty map variants are valid: parsing succeeds but leaves no faces
        // to analyze. Parse errors still abort instead of publishing partial data.
        await loader.load(buffer);
        const result = detectModelOverlayFaces(scene);
        if (result.overlays.length > 0) {
          files[filename] = {
            byteLength: buffer.byteLength,
            triangleCount: result.triangleCount,
            overlays: result.overlays,
          };
          if (format === 'MT7') files[filename].revision = createHash('sha256')
            .update(JSON.stringify(files[filename])).digest('hex');
        }
      } catch (error) {
        throw new Error(`[model-overlays] ${filename}: ${error.message}`, { cause: error });
      } finally {
        scene.dispose();
      }
      // load() is synchronous for MT7; a microtask-only loop would retain
      // Babylon's deferred disposal callbacks for every map in the batch.
      await new Promise(resolve => setImmediate(resolve));
    }
  } finally {
    engine.dispose();
  }
  return files;
}

async function analyzeInWorkers(sources, count) {
  if (!sources.length) return {};
  // Babylon retains deferred disposal work until the worker yields. Keep
  // batches bounded and recycle workers when scanning an entire disc corpus.
  const batches = [];
  for (let start = 0; start < sources.length; start += 16) batches.push(sources.slice(start, start + 16));
  const workers = new Set();
  const results = [];
  let completed = 0;
  try {
    await Promise.all(Array.from({length: Math.min(count, batches.length)}, async () => {
      while (batches.length) {
        const batch = batches.shift();
        const worker = new Worker(new URL(import.meta.url), {workerData: batch,
          resourceLimits: {maxOldGenerationSizeMb: 1024}});
        workers.add(worker);
        const result = await new Promise((resolve, reject) => {
          let result;
          let activeFile;
          worker.on("message", value => {
            if (value.analyzing) activeFile = value.analyzing;
            else result = value;
          });
          worker.once("error", error => reject(new Error(`Overlay analysis failed at ${activeFile}: ${error.message}`, {cause: error})));
          worker.once("exit", code => {
            if (code !== 0 || !result) reject(new Error(`Overlay worker exited without results (code ${code})`));
            else resolve(result);
          });
        });
        results.push(result);
        workers.delete(worker);
        completed += batch.length;
        if (completed % 128 === 0 || completed === sources.length) console.log(`[model-overlays] ${completed}/${sources.length} analyzed`);
      }
    }));
    return Object.fromEntries(Object.entries(Object.assign({}, ...results))
      .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0));
  } finally {
    batches.length = 0;
    await Promise.all([...workers].map(worker => worker.terminate()));
  }
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const catalog = JSON.parse(fs.readFileSync(options.catalog, "utf8"));
  const sources = (options.game === 's2' ? mt7MapSourcesForCatalog(catalog, options.catalog)
    : mapSourcesForCatalog(catalog, indexLocalModels([...new Set(options.roots)])))
    .filter(({ filename }) => !options.match || options.match.test(filename));
  const available = sources.filter(({ localFilename }) => localFilename && fs.existsSync(localFilename));
  const missing = sources.filter(source => !available.includes(source)).map(source => source.filename);
  console.log(`[model-overlays] analyzing ${available.length} maps using ${options.workers} workers; ${missing.length} missing`);
  if (options.game === 's2' && missing.length) throw new Error(`Missing MT7 maps: ${missing.join(', ')}`);
  const files = await analyzeInWorkers(available, options.workers);
  const analyzed = available.length;

  let manifest = {
    schema: options.game === 's2' ? 'new-yokosuka-mt7-depth-overlays-v1' : 'new-yokosuka-mt5-depth-overlays-v1',
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
  // Only the small index enters application code. Geometry records are JSON
  // fetched for the current area, never a multi-megabyte JavaScript module.
  if (options.game === 's2' && !options.match) manifest = writeMt7OverlayShards(manifest);
  fs.mkdirSync(path.dirname(options.output), { recursive: true });
  fs.writeFileSync(
    options.output,
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  console.log(
    `[model-overlays] wrote ${options.output}: ${analyzed} analyzed, `
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
