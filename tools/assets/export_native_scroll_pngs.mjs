#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { parseNativeScrollSprite } from "../../src/NativeScrollSprite.js";
import { PvrDecoder } from "../../src/PvrDecoder.js";

function outputPathFor(sourcePath) {
  return sourcePath.replace(/\.(?:SCR[0-2]|SPR)$/i, ".native.png");
}

function decodeScrollSprite(bytes, sourceName) {
  const parsed = parseNativeScrollSprite(bytes, { sourceName });
  const pixels = new Uint8Array(parsed.width * parsed.height * 4);
  let outputRow = 0;
  for (const tile of parsed.tiles) {
    const pvrBytes = bytes.subarray(
      tile.pvrOffset,
      tile.pvrOffset + tile.pvrByteLength,
    );
    const pvr = pvrBytes.buffer.slice(
      pvrBytes.byteOffset,
      pvrBytes.byteOffset + pvrBytes.byteLength,
    );
    const decoded = new PvrDecoder(pvr).decodePixels();
    if (
      !decoded
      || decoded.width !== tile.width
      || decoded.height !== tile.height
    ) {
      throw new Error(`${sourceName} tile ${tile.name} could not be decoded`);
    }
    pixels.set(decoded.pixelData, outputRow * parsed.width * 4);
    outputRow += tile.height;
  }
  return { parsed, pixels };
}

const sourcePaths = process.argv.slice(2);
if (sourcePaths.length === 0) {
  throw new Error("usage: export_native_scroll_pngs.mjs <SCROLL resource> [...]");
}

for (const sourcePath of sourcePaths) {
  const bytes = new Uint8Array(await readFile(sourcePath));
  const { parsed, pixels } = decodeScrollSprite(bytes, path.basename(sourcePath));
  const outputPath = outputPathFor(sourcePath);
  const encoded = spawnSync("magick", [
    "-size", `${parsed.width}x${parsed.height}`,
    "-depth", "8",
    "rgba:-",
    outputPath,
  ], {
    input: pixels,
    maxBuffer: Math.max(1024 * 1024, pixels.length * 2),
  });
  if (encoded.status !== 0) {
    throw new Error(
      `ImageMagick failed for ${sourcePath}: ${encoded.stderr?.toString().trim()}`,
    );
  }
  console.log(`${outputPath} ${parsed.width}x${parsed.height}`);
}
