#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const FLYSAVE_MAGIC = Buffer.from("FLYSAVE1", "ascii");
const RZIP_MAGIC = Buffer.from([0x23, 0x52, 0x5a, 0x49, 0x50, 0x76, 0x01, 0x23]);
const DREAMCAST_RAM_SIZE = 0x01000000;

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

export function decompressFlycastState(state) {
  if (!state.subarray(0, 8).equals(FLYSAVE_MAGIC) || state.length < 44) {
    throw new Error("Not a FLYSAVE1 Flycast state");
  }
  const pngSize = state.readUInt32LE(20);
  let position = 24 + pngSize;
  if (!state.subarray(position, position + 8).equals(RZIP_MAGIC)) {
    throw new Error("Flycast state does not contain an RZIP payload");
  }
  const maximumChunkSize = state.readUInt32LE(position + 8);
  const totalSize = Number(state.readBigUInt64LE(position + 12));
  position += 20;
  const chunks = [];
  let inflatedSize = 0;
  while (position + 4 <= state.length && inflatedSize < totalSize) {
    const compressedSize = state.readUInt32LE(position);
    position += 4;
    if (position + compressedSize > state.length) {
      throw new Error("Truncated Flycast RZIP chunk");
    }
    const chunk = zlib.inflateSync(
      state.subarray(position, position + compressedSize),
    );
    if (chunk.length > maximumChunkSize) {
      throw new Error("Flycast RZIP chunk exceeds its declared maximum");
    }
    chunks.push(chunk);
    inflatedSize += chunk.length;
    position += compressedSize;
  }
  const payload = Buffer.concat(chunks);
  if (payload.length !== totalSize) {
    throw new Error(
      `Flycast payload is ${payload.length} bytes, expected ${totalSize}`,
    );
  }
  return { payload, pngSize, maximumChunkSize, chunkCount: chunks.length };
}

function usefulReferenceWindows(referenceRam) {
  const windows = [];
  for (let offset = 0x1000; offset + 256 <= referenceRam.length; offset += 0x10000) {
    const bytes = referenceRam.subarray(offset, offset + 256);
    if (bytes.every((value) => value === bytes[0])) continue;
    windows.push({ offset, bytes });
  }
  return windows;
}

export function locateDreamcastRam(payload, referenceRam) {
  if (referenceRam.length !== DREAMCAST_RAM_SIZE) {
    throw new Error("Reference capture is not a 16 MiB Dreamcast RAM dump");
  }
  const windows = usefulReferenceWindows(referenceRam);
  if (windows.length < 3) {
    throw new Error("Reference RAM lacks enough static identification windows");
  }
  const anchor = windows[0];
  const candidates = [];
  let cursor = -1;
  while ((cursor = payload.indexOf(anchor.bytes, cursor + 1)) >= 0) {
    const start = cursor - anchor.offset;
    if (start < 0 || start + DREAMCAST_RAM_SIZE > payload.length) continue;
    const matchCount = windows.reduce((count, window) => count + Number(
      payload.subarray(
        start + window.offset,
        start + window.offset + window.bytes.length,
      ).equals(window.bytes),
    ), 0);
    candidates.push({ start, matchCount });
  }
  candidates.sort((left, right) => (
    right.matchCount - left.matchCount || left.start - right.start
  ));
  if (
    !candidates.length
    || candidates[0].matchCount < 3
    || candidates[0].matchCount === candidates[1]?.matchCount
  ) {
    throw new Error("Could not identify one unique Dreamcast RAM block");
  }
  return {
    offset: candidates[0].start,
    staticWindowMatchCount: candidates[0].matchCount,
    staticWindowCount: windows.length,
    ram: payload.subarray(
      candidates[0].start,
      candidates[0].start + DREAMCAST_RAM_SIZE,
    ),
  };
}

function parseArguments(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index]?.replace(/^--/, "");
    const value = argv[index + 1];
    if (!name || value === undefined) throw new Error("Incomplete argument");
    options[name] = value;
  }
  for (const required of ["state", "reference-ram", "out"]) {
    if (!options[required]) throw new Error(`Missing --${required}`);
  }
  return options;
}

function run(argv) {
  const options = parseArguments(argv);
  const statePath = path.resolve(options.state);
  const referencePath = path.resolve(options["reference-ram"]);
  const outputPath = path.resolve(options.out);
  const state = fs.readFileSync(statePath);
  const referenceRam = fs.readFileSync(referencePath);
  const decompressed = decompressFlycastState(state);
  const located = locateDreamcastRam(decompressed.payload, referenceRam);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, located.ram);
  const manifest = {
    schema: "new-yokosuka-flycast-savestate-ram-v1",
    sourceState: statePath,
    sourceStateSha256: sha256(state),
    referenceRam: referencePath,
    referenceRamSha256: sha256(referenceRam),
    statePayloadByteLength: decompressed.payload.length,
    statePayloadRamOffset: located.offset,
    staticWindowMatchCount: located.staticWindowMatchCount,
    staticWindowCount: located.staticWindowCount,
    ramByteLength: located.ram.length,
    ramSha256: sha256(located.ram),
    evidenceBoundary: (
      "The reference capture identifies the static Disc 1 executable windows; "
      + "all emitted RAM bytes come from the decompressed Flycast state."
    ),
  };
  fs.writeFileSync(
    path.join(path.dirname(outputPath), "savestate-ram.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  process.stderr.write(
    `Extracted 16 MiB Dreamcast RAM at state payload +0x${located.offset.toString(16)} `
    + `(${located.staticWindowMatchCount}/${located.staticWindowCount} static windows matched)\n`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  run(process.argv.slice(2));
}
