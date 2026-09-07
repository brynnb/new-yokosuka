#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import * as BABYLON from "@babylonjs/core";

import { Mt5Loader } from "../../src/Mt5Loader.js";
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
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--catalog") options.catalog = argv[++index];
    else if (argument === "--output") options.output = argv[++index];
    else if (argument === "--root") options.roots.push(argv[++index]);
    else if (argument === "--match") options.match = new RegExp(argv[++index], "i");
    else if (argument === "--help") {
      console.log(
        "Usage: node tools/assets/generate_mt5_overlay_manifest.js "
        + "[--catalog FILE] [--output FILE] [--root DIRECTORY] "
        + "[--match REGEXP]",
      );
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
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

function arrayBufferForFile(filename) {
  const data = fs.readFileSync(filename);
  return data.buffer.slice(
    data.byteOffset,
    data.byteOffset + data.byteLength,
  );
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const catalog = JSON.parse(fs.readFileSync(options.catalog, "utf8"));
  const filenames = catalog
    .filter((filename) => isMapModel(filename))
    .filter((filename) => !options.match || options.match.test(filename))
    .map((filename) => filename.toUpperCase())
    .sort();
  const localModels = indexLocalModels([...new Set(options.roots)]);
  const engine = new BABYLON.NullEngine();
  const files = {};
  const missing = [];
  let analyzed = 0;

  for (const filename of filenames) {
    const localFilename = localModels.get(filename);
    if (!localFilename) {
      missing.push(filename);
      continue;
    }
    const scene = new BABYLON.Scene(engine);
    try {
      const buffer = arrayBufferForFile(localFilename);
      const loader = new Mt5Loader(scene);
      const roots = await loader.load(buffer);
      if (roots.length === 0) continue;
      const result = detectMt5OverlayFaces(scene);
      if (result.overlays.length > 0) {
        files[filename] = {
          byteLength: buffer.byteLength,
          triangleCount: result.triangleCount,
          overlays: result.overlays,
        };
      }
      analyzed++;
      if (analyzed % 25 === 0) {
        console.log(
          `[mt5-overlays] ${analyzed}/${filenames.length - missing.length} `
          + `analyzed; ${Object.keys(files).length} with overlays`,
        );
      }
    } catch (error) {
      console.warn(`[mt5-overlays] ${filename}: ${error.message}`);
    } finally {
      scene.dispose();
    }
  }
  engine.dispose();

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

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
