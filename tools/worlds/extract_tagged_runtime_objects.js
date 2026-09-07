#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const RAM_BASE = 0x8c000000;
const POINTER_MASK = 0x00ffffff;

function usage() {
  console.error(
    "Usage: node tools/worlds/extract_tagged_runtime_objects.js "
    + "<capture-dir> <unpacked-model-dir> [--out output.json]",
  );
  process.exit(2);
}

function parseArguments(argv) {
  const positional = [];
  let output = null;
  for (let index = 0; index < argv.length; index++) {
    if (argv[index] === "--out") output = argv[++index];
    else positional.push(argv[index]);
  }
  if (positional.length < 2) usage();
  return {
    captureDirectory: path.resolve(positional[0]),
    modelDirectory: path.resolve(positional[1]),
    output: output ? path.resolve(output) : null,
  };
}

function walkFiles(directory) {
  const result = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...walkFiles(fullPath));
    else result.push(fullPath);
  }
  return result;
}

function headerKey(bytes) {
  return bytes.subarray(0, 12).toString("hex");
}

function byteAgreement(left, right) {
  const count = Math.min(left.length, right.length);
  let equal = 0;
  for (let index = 0; index < count; index++) {
    if (left[index] === right[index]) equal++;
  }
  return count ? equal / count : 0;
}

function address(offset) {
  return `0x${(RAM_BASE + offset).toString(16).padStart(8, "0")}`;
}

function normalizedOffset(pointer) {
  return pointer & POINTER_MASK;
}

function isTag(bytes) {
  return /^[A-Za-z0-9_]{4}$/.test(bytes.toString("ascii"));
}

function sourceModels(modelDirectory) {
  return walkFiles(modelDirectory)
    .filter((filename) => /\.(?:CHRM|MAPM|MT5)$/i.test(filename))
    .map((filename) => ({
      filename,
      bytes: fs.readFileSync(filename),
    }))
    .filter((model) => (
      model.bytes.length >= 12
      && model.bytes.toString("ascii", 0, 4) === "HRCM"
    ));
}

function runtimeModels(ram, sources) {
  const sourcesByHeader = new Map();
  for (const source of sources) {
    const key = headerKey(source.bytes);
    const values = sourcesByHeader.get(key) || [];
    values.push(source);
    sourcesByHeader.set(key, values);
  }

  const models = [];
  for (
    let offset = ram.indexOf("HRCM");
    offset >= 0;
    offset = ram.indexOf("HRCM", offset + 4)
  ) {
    if (offset + 12 > ram.length) continue;
    const candidates = sourcesByHeader.get(headerKey(ram.subarray(offset))) || [];
    let best = null;
    for (const source of candidates) {
      if (offset + source.bytes.length > ram.length) continue;
      const agreement = byteAgreement(
        source.bytes,
        ram.subarray(offset, offset + source.bytes.length),
      );
      if (!best || agreement > best.agreement) {
        best = {
          source,
          agreement,
        };
      }
    }
    if (!best || best.agreement < 0.9) continue;
    models.push({
      offset,
      end: offset + best.source.bytes.length,
      address: address(offset),
      source: path.relative(process.cwd(), best.source.filename),
      model: `${path.basename(best.source.filename, path.extname(best.source.filename))}.MT5`,
      agreement: best.agreement,
    });
  }
  return models;
}

function ownerForMesh(runtime, meshOffset) {
  return runtime.find((model) => (
    meshOffset >= model.offset && meshOffset < model.end
  )) || null;
}

function placementClass(position) {
  if (position.some((value) => !Number.isFinite(value))) return "invalid";
  if (Math.max(...position.map(Math.abs)) > 1000) return "parked";
  if (position.every((value) => Math.abs(value) < 0.001)) return "origin-or-inactive";
  if (Math.hypot(position[0], position[2]) < 1) return "possible-parent-local";
  return "world";
}

function extractObjects(ram, runtime) {
  const objects = [];
  for (let offset = 0; offset + 0x16c <= ram.length; offset += 4) {
    if (ram.toString("ascii", offset, offset + 4) !== "TASK") continue;
    const tagBytes = ram.subarray(offset + 0x168, offset + 0x16c);
    if (!isTag(tagBytes)) continue;
    const callback = ram.readUInt32LE(offset + 0x64);

    const renderNodeOffset = normalizedOffset(ram.readUInt32LE(offset + 0x60));
    const meshOffset = (
      renderNodeOffset > 0
      && renderNodeOffset + 8 <= ram.length
    )
      ? normalizedOffset(ram.readUInt32LE(renderNodeOffset + 4))
      : 0;
    const owner = meshOffset ? ownerForMesh(runtime, meshOffset) : null;
    const position = [0x28, 0x2c, 0x30].map(
      (field) => ram.readFloatLE(offset + field),
    );
    const rotationRaw = [0x34, 0x38, 0x3c].map(
      (field) => ram.readUInt32LE(offset + field),
    );
    const rotationDegrees = rotationRaw.map((raw) => {
      const low = raw & 0xffff;
      const signed = low >= 0x8000 ? low - 0x10000 : low;
      return signed * 360 / 0x10000;
    });
    const scale = [0x54, 0x58, 0x5c].map(
      (field) => ram.readFloatLE(offset + field),
    );

    objects.push({
      objectTag: tagBytes.toString("ascii"),
      taskAddress: address(offset),
      callbackAddress: `0x${callback.toString(16).padStart(8, "0")}`,
      model: owner?.model || null,
      modelSource: owner?.source || null,
      modelAddress: owner?.address || null,
      modelAgreement: owner?.agreement || null,
      renderNodeAddress: renderNodeOffset ? address(renderNodeOffset) : null,
      meshAddress: meshOffset ? address(meshOffset) : null,
      placementClass: placementClass(position),
      runtimePosition: position,
      browserPosition: [-position[0], position[1], position[2]],
      runtimeRotationDegrees: rotationDegrees,
      browserRotationDegrees: [
        rotationDegrees[0],
        -rotationDegrees[1],
        -rotationDegrees[2],
      ],
      scale,
    });
  }
  return objects.sort((left, right) => (
    left.taskAddress.localeCompare(right.taskAddress)
  ));
}

const args = parseArguments(process.argv.slice(2));
const ramPath = path.join(args.captureDirectory, "ram.bin");
const ram = fs.readFileSync(ramPath);
const sources = sourceModels(args.modelDirectory);
const runtime = runtimeModels(ram, sources);
const objects = extractObjects(ram, runtime);
const result = {
  schema: "new-yokosuka-tagged-runtime-objects-v1",
  source: {
    captureDirectory: path.relative(process.cwd(), args.captureDirectory),
    ram: path.relative(process.cwd(), ramPath),
    modelDirectory: path.relative(process.cwd(), args.modelDirectory),
    callbackPolicy: "all tagged TASK callbacks with a direct render node",
  },
  summary: {
    sourceModelCount: sources.length,
    matchedRuntimeModelCount: runtime.length,
    objectCount: objects.length,
    modeledObjectCount: objects.filter((object) => object.model).length,
    worldObjectCount: objects.filter(
      (object) => object.placementClass === "world",
    ).length,
    modeledWorldObjectCount: objects.filter(
      (object) => object.model && object.placementClass === "world",
    ).length,
  },
  objects,
};
const encoded = `${JSON.stringify(result, null, 2)}\n`;
if (args.output) {
  fs.mkdirSync(path.dirname(args.output), { recursive: true });
  fs.writeFileSync(args.output, encoded);
  console.log(`Wrote ${args.output} (${objects.length} tagged objects)`);
} else {
  process.stdout.write(encoded);
}
