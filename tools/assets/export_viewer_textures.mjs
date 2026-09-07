#!/usr/bin/env node

import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { PvrDecoder } from "../../src/PvrDecoder.js";

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const DEFAULT_INPUT = path.join(PROJECT_ROOT, "public", "models");
const DEFAULT_OUTPUT = path.join(PROJECT_ROOT, ".disc-work", "texture-images");
const DEFAULT_MAX_BYTES = 10 * 1024 * 1024;
const TIME_VARIANTS = Object.freeze({
  "0": "day",
  "1": "sunset",
  "2": "evening",
  "3": "night",
});
const COLOR_FORMATS = Object.freeze({ 0: "ARGB1555", 1: "RGB565", 2: "ARGB4444" });
const DATA_FORMATS = Object.freeze({
  1: "twiddled",
  2: "twiddled-mipmapped",
  3: "vq",
  4: "vq-mipmapped",
  5: "palettized-4bit",
  6: "palettized-4bit-mipmapped",
  7: "palettized-8bit",
  8: "palettized-8bit-mipmapped",
  9: "rectangle",
  11: "stride",
  13: "twiddled-rectangle",
});

function usage() {
  return `Usage: node tools/assets/export_viewer_textures.mjs [options]

Export the Shenmue I textures consumed by the viewer to ordinary image files.

Options:
  --input DIR          Processed viewer model directory (default: public/models)
  --output DIR         Export directory (default: .disc-work/texture-images)
  --namespace PREFIX   Viewer filename namespace (default: S3)
  --area CODE          Export one area; may be repeated
  --no-embedded        Skip textures embedded in MT5 model files
  --max-mb NUMBER      Maximum size of any image file (default: 10)
  --force              Replace an existing output directory
  --help                Show this help

The S3 namespace is the current consolidated Shenmue I viewer corpus. Numbered
texture packs are exported as day, sunset, evening, and night variants.`;
}

function parseArgs(argv) {
  const options = {
    inputDir: DEFAULT_INPUT,
    outputDir: DEFAULT_OUTPUT,
    namespace: "S3",
    areas: [],
    includeEmbedded: true,
    maxBytes: DEFAULT_MAX_BYTES,
    force: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const value = () => {
      index += 1;
      if (index >= argv.length) throw new Error(`${argument} requires a value`);
      return argv[index];
    };
    if (argument === "--input") options.inputDir = path.resolve(value());
    else if (argument === "--output") options.outputDir = path.resolve(value());
    else if (argument === "--namespace") options.namespace = value().toUpperCase();
    else if (argument === "--area") options.areas.push(value().toUpperCase());
    else if (argument === "--no-embedded") options.includeEmbedded = false;
    else if (argument === "--max-mb") options.maxBytes = Number(value()) * 1024 * 1024;
    else if (argument === "--force") options.force = true;
    else if (argument === "--help" || argument === "-h") options.help = true;
    else throw new Error(`unknown option: ${argument}`);
  }
  if (!/^[A-Z0-9]+$/.test(options.namespace)) {
    throw new Error("--namespace must contain only letters and numbers");
  }
  if (!Number.isFinite(options.maxBytes) || options.maxBytes <= 0) {
    throw new Error("--max-mb must be a positive number");
  }
  return options;
}

function fourCc(bytes, offset) {
  if (offset < 0 || offset + 4 > bytes.length) return "";
  return String.fromCharCode(...bytes.subarray(offset, offset + 4));
}

function uint32(bytes, offset) {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    .getUint32(offset, true);
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function textureId(bytes) {
  const hex = Buffer.from(bytes).toString("hex");
  const ascii = Buffer.from(bytes)
    .toString("ascii")
    .replace(/\0+$/g, "")
    .replace(/[^\x20-\x7e]/g, "?");
  return { hex, ascii };
}

export function parseTexturePack(bytes) {
  const entries = [];
  let offset = 0;
  while (offset < bytes.length) {
    if (offset + 12 > bytes.length) {
      throw new Error(`truncated texture-pack record at byte ${offset}`);
    }
    const length = uint32(bytes, offset + 8);
    const payloadOffset = offset + 12;
    if (length === 0 || payloadOffset + length > bytes.length) {
      throw new Error(`invalid texture-pack record length ${length} at byte ${offset}`);
    }
    entries.push({
      ...textureId(bytes.subarray(offset, offset + 8)),
      pvr: bytes.subarray(payloadOffset, payloadOffset + length),
    });
    offset = payloadOffset + length;
  }
  return entries;
}

export function parseEmbeddedMt5Textures(bytes) {
  if (bytes.length < 16 || fourCc(bytes, 0) !== "HRCM") return [];
  const texdOffset = uint32(bytes, 4);
  if (texdOffset <= 0 || texdOffset + 12 > bytes.length) return [];
  if (fourCc(bytes, texdOffset) !== "TEXD") return [];
  const headerSize = uint32(bytes, texdOffset + 4);
  const textureCount = uint32(bytes, texdOffset + 8);
  let offset = texdOffset + headerSize;
  let seen = 0;
  const entries = [];

  while (seen < textureCount && offset + 8 <= bytes.length) {
    const marker = fourCc(bytes, offset);
    const nodeSize = uint32(bytes, offset + 4);
    const nodeEnd = offset + nodeSize;
    if (nodeSize < 8 || nodeEnd > bytes.length) break;

    if (marker === "NAME") {
      seen += Math.min(Math.floor((nodeSize - 8) / 8), textureCount - seen);
    } else if (marker === "TEXN") {
      const id = textureId(bytes.subarray(offset + 8, offset + 16));
      let pvrOffset = offset + 16;
      while (pvrOffset + 8 <= nodeEnd && fourCc(bytes, pvrOffset) !== "PVRT") {
        pvrOffset += 1;
      }
      if (pvrOffset + 8 <= nodeEnd) {
        const pvrSize = uint32(bytes, pvrOffset + 4);
        const pvrEnd = pvrOffset + 8 + pvrSize;
        if (pvrSize > 0 && pvrEnd <= nodeEnd) {
          entries.push({ ...id, pvr: bytes.subarray(pvrOffset, pvrEnd) });
        }
      }
      seen += 1;
    } else if (marker === "PVRT") {
      const pvrSize = uint32(bytes, offset + 4);
      const pvrEnd = offset + 8 + pvrSize;
      if (pvrSize > 0 && pvrEnd <= nodeEnd) {
        entries.push({
          hex: `embedded-${String(seen).padStart(4, "0")}`,
          ascii: "",
          pvr: bytes.subarray(offset, pvrEnd),
        });
      }
      seen += 1;
    }
    offset = nodeEnd;
  }
  return entries;
}

function decodePvr(pvr) {
  const decoded = new PvrDecoder(pvr.buffer, pvr.byteOffset, pvr.byteLength)
    .decodePixels();
  if (!decoded) throw new Error("PVR decoder returned no pixels");
  let alphaMin = 255;
  let alphaMax = 0;
  for (let offset = 3; offset < decoded.pixelData.length; offset += 4) {
    alphaMin = Math.min(alphaMin, decoded.pixelData[offset]);
    alphaMax = Math.max(alphaMax, decoded.pixelData[offset]);
  }
  return { ...decoded, alphaMin, alphaMax };
}

async function encodeTexture(decoded, maxBytes) {
  const image = sharp(decoded.pixelData, {
    raw: { width: decoded.width, height: decoded.height, channels: 4 },
  });
  const png = await image.png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer();
  if (png.length <= maxBytes) return { buffer: png, extension: "png", lossless: true };

  const losslessWebp = await image.webp({ lossless: true, effort: 6 }).toBuffer();
  if (losslessWebp.length <= maxBytes) {
    return { buffer: losslessWebp, extension: "webp", lossless: true };
  }
  for (const quality of [92, 85, 75, 60, 45]) {
    const webp = await image.webp({ quality, alphaQuality: 100, effort: 6 }).toBuffer();
    if (webp.length <= maxBytes) {
      return { buffer: webp, extension: "webp", lossless: false, quality };
    }
  }
  throw new Error(
    `${decoded.width}x${decoded.height} texture cannot fit within the configured image-size limit`,
  );
}

function xmlEscape(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

async function writeContactSheets(groupDirectory, records, maxBytes) {
  const pageSize = 100;
  const columns = 10;
  const tileWidth = 160;
  const tileHeight = 184;
  for (let start = 0; start < records.length; start += pageSize) {
    const page = records.slice(start, start + pageSize);
    const rows = Math.ceil(page.length / columns);
    const width = columns * tileWidth;
    const height = rows * tileHeight;
    const labels = page.map((record, index) => {
      const x = (index % columns) * tileWidth;
      const y = Math.floor(index / columns) * tileHeight;
      return `<text x="${x + 6}" y="${y + 177}" fill="#f4f4f4" font-family="monospace" font-size="12">${xmlEscape(record.textureIdAscii || record.textureIdHex)}</text>`;
    }).join("");
    const background = Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><defs><pattern id="c" width="20" height="20" patternUnits="userSpaceOnUse"><rect width="20" height="20" fill="#777"/><rect width="10" height="10" fill="#999"/><rect x="10" y="10" width="10" height="10" fill="#999"/></pattern></defs><rect width="100%" height="100%" fill="#202020"/>${page.map((_, index) => { const x = (index % columns) * tileWidth + 6; const y = Math.floor(index / columns) * tileHeight + 6; return `<rect x="${x}" y="${y}" width="148" height="148" fill="url(#c)"/>`; }).join("")}${labels}</svg>`);
    const composites = await Promise.all(page.map(async (record, index) => ({
      input: await sharp(record.absoluteFile)
        .resize(148, 148, { fit: "contain", kernel: "nearest" })
        .toBuffer(),
      left: (index % columns) * tileWidth + 6,
      top: Math.floor(index / columns) * tileHeight + 6,
    })));
    const sheet = sharp(background).composite(composites);
    let encoded = await sheet.webp({ quality: 88, effort: 6 }).toBuffer();
    if (encoded.length > maxBytes) {
      encoded = await sheet.webp({ quality: 65, effort: 6 }).toBuffer();
    }
    if (encoded.length > maxBytes) throw new Error("contact sheet exceeds image-size limit");
    const pageNumber = String(Math.floor(start / pageSize) + 1).padStart(3, "0");
    writeFileSync(path.join(groupDirectory, `contact-sheet-${pageNumber}.webp`), encoded);
  }
}

function parsePackFilename(filename, namespace) {
  const pattern = new RegExp(`^${namespace}_([A-Z0-9]+)_textures(?:_([0-3]))?\\.bin$`, "i");
  const match = filename.match(pattern);
  if (!match) return null;
  return {
    area: match[1].toUpperCase(),
    variant: match[2] === undefined ? "base" : TIME_VARIANTS[match[2]],
  };
}

function parseModelFilename(filename, namespace) {
  const pattern = new RegExp(`^${namespace}_([A-Z0-9]+)_(.+)\\.MT5$`, "i");
  const match = filename.match(pattern);
  return match ? { area: match[1].toUpperCase(), model: match[2] } : null;
}

function csvValue(value) {
  const text = value === undefined || value === null ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

async function mapWithConcurrency(items, worker, concurrency = 4) {
  let cursor = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      await worker(items[index], index);
    }
  });
  await Promise.all(runners);
}

export async function exportViewerTextures(options) {
  const inputDir = path.resolve(options.inputDir || DEFAULT_INPUT);
  const outputDir = path.resolve(options.outputDir || DEFAULT_OUTPUT);
  const namespace = (options.namespace || "S3").toUpperCase();
  const areaFilter = new Set((options.areas || []).map((area) => area.toUpperCase()));
  const maxBytes = options.maxBytes || DEFAULT_MAX_BYTES;
  const includeEmbedded = options.includeEmbedded !== false;
  if (!existsSync(inputDir)) throw new Error(`input directory does not exist: ${inputDir}`);
  if (existsSync(outputDir)) {
    if (!options.force) throw new Error(`output directory already exists: ${outputDir} (use --force to replace it)`);
    rmSync(outputDir, { recursive: true });
  }
  mkdirSync(outputDir, { recursive: true });

  const filenames = readdirSync(inputDir).sort((left, right) => left.localeCompare(right));
  const sources = [];
  for (const filename of filenames) {
    const pack = parsePackFilename(filename, namespace);
    if (pack && (areaFilter.size === 0 || areaFilter.has(pack.area))) {
      const entries = parseTexturePack(readFileSync(path.join(inputDir, filename)));
      entries.forEach((entry, sourceIndex) => sources.push({
        kind: "pack",
        area: pack.area,
        variant: pack.variant,
        model: "",
        sourceFile: filename,
        sourceIndex,
        ...entry,
      }));
      continue;
    }
    if (!includeEmbedded) continue;
    const model = parseModelFilename(filename, namespace);
    if (!model || (areaFilter.size > 0 && !areaFilter.has(model.area))) continue;
    const entries = parseEmbeddedMt5Textures(readFileSync(path.join(inputDir, filename)));
    entries.forEach((entry, sourceIndex) => sources.push({
      kind: "embedded",
      area: model.area,
      variant: "embedded",
      model: model.model,
      sourceFile: filename,
      sourceIndex,
      ...entry,
    }));
  }

  const records = new Array(sources.length);
  await mapWithConcurrency(sources, async (source, index) => {
    const decoded = decodePvr(source.pvr);
    const encoded = await encodeTexture(decoded, maxBytes);
    const groupParts = source.kind === "pack"
      ? ["areas", source.area, source.variant]
      : ["embedded", source.area, source.model];
    const groupDirectory = path.join(outputDir, ...groupParts);
    mkdirSync(groupDirectory, { recursive: true });
    const basename = `${String(source.sourceIndex).padStart(4, "0")}-${source.hex}`;
    const absoluteFile = path.join(groupDirectory, `${basename}.${encoded.extension}`);
    writeFileSync(absoluteFile, encoded.buffer);
    records[index] = {
      kind: source.kind,
      area: source.area,
      variant: source.variant,
      model: source.model,
      sourceFile: source.sourceFile,
      sourceIndex: source.sourceIndex,
      textureIdHex: source.hex,
      textureIdAscii: source.ascii,
      width: decoded.width,
      height: decoded.height,
      colorFormat: COLOR_FORMATS[decoded.colorFormat] || `unknown-${decoded.colorFormat}`,
      dataFormat: DATA_FORMATS[decoded.dataFormat] || `unknown-${decoded.dataFormat}`,
      hasAlphaChannel: decoded.hasAlpha,
      usesTransparency: decoded.alphaMin < 255,
      alphaMin: decoded.alphaMin,
      alphaMax: decoded.alphaMax,
      imageFormat: encoded.extension,
      lossless: encoded.lossless,
      quality: encoded.quality ?? "",
      imageBytes: encoded.buffer.length,
      sourceSha256: sha256(source.pvr),
      pixelsSha256: sha256(decoded.pixelData),
      file: path.relative(outputDir, absoluteFile).split(path.sep).join("/"),
      absoluteFile,
    };
  });

  const firstByPixels = new Map();
  for (const record of records) {
    const key = `${record.width}x${record.height}:${record.pixelsSha256}`;
    record.duplicateOf = firstByPixels.get(key) || "";
    if (!record.duplicateOf) firstByPixels.set(key, record.file);
  }

  const groups = new Map();
  for (const record of records) {
    const directory = path.dirname(record.absoluteFile);
    if (!groups.has(directory)) groups.set(directory, []);
    groups.get(directory).push(record);
  }
  for (const [directory, groupRecords] of groups) {
    await writeContactSheets(directory, groupRecords, maxBytes);
  }

  const publicRecords = records.map(({ absoluteFile: _absoluteFile, ...record }) => record);
  writeFileSync(path.join(outputDir, "manifest.json"), `${JSON.stringify({
    schema: "new-yokosuka-viewer-texture-export-v1",
    namespace,
    sourceDirectory: path.basename(inputDir),
    maxImageBytes: maxBytes,
    textureCount: records.length,
    uniquePixelCount: firstByPixels.size,
    records: publicRecords,
  }, null, 2)}\n`);
  const csvColumns = Object.keys(publicRecords[0] || {});
  const csv = [csvColumns.join(","), ...publicRecords.map((record) => (
    csvColumns.map((column) => csvValue(record[column])).join(",")
  ))].join("\n");
  writeFileSync(path.join(outputDir, "manifest.csv"), `${csv}\n`);
  writeFileSync(path.join(outputDir, "README.txt"), `Shenmue I viewer texture export

This directory contains the environment and model textures consumed by the
New Yokosuka viewer. It intentionally excludes unrelated UI, sky, and other
game resources.

areas/AREA/base/              Base texture packs
areas/AREA/day/               Daytime texture overrides
areas/AREA/sunset/            Sunset texture overrides
areas/AREA/evening/           Evening texture overrides
areas/AREA/night/             Night texture overrides
embedded/AREA/MODEL/          Textures stored inside individual MT5 models

Each source group includes paginated contact sheets. manifest.json and
manifest.csv record source identity, dimensions, Dreamcast formats, alpha use,
hashes, duplicate relationships, and the exported image path.

Textures: ${records.length}
Unique decoded images: ${firstByPixels.size}
Maximum image file size: ${Math.round(maxBytes / 1024 / 1024)} MiB
`);
  return {
    inputDir,
    outputDir,
    textureCount: records.length,
    uniquePixelCount: firstByPixels.size,
    groupCount: groups.size,
    records: publicRecords,
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(usage());
    return;
  }
  console.log(`Exporting ${options.namespace} viewer textures from ${options.inputDir}`);
  const result = await exportViewerTextures(options);
  console.log(
    `Exported ${result.textureCount} textures (${result.uniquePixelCount} unique) `
    + `in ${result.groupCount} source groups to ${result.outputDir}`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`Texture export failed: ${error.message}`);
    process.exitCode = 1;
  });
}
