#!/usr/bin/env node
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseShenmue2WorldCollisions,
} from "../lib/shenmue2-world-collisions.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const sourceRoot = path.resolve(
  process.env.SHENMUE2_DISC_EXTRACTED_ROOT || process.env.SHENMUE2_DISC1_EXTRACTED_ROOT
    || path.join(repoRoot, ".disc-work/shenmue2-disc1-extracted"),
);
const disc = Number(process.env.SHENMUE2_DISC || 1);
if (![1, 2, 3, 4].includes(disc)) throw new Error('SHENMUE2_DISC must be 1–4');
const scene = String(disc).padStart(2, '0');
const sceneRoot = path.join(sourceRoot, `data/SCENE/${scene}`);
const outputDirectory = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(repoRoot, "public/data/native-collisions");

if (!existsSync(sceneRoot)) {
  throw new Error(`Shenmue II Disc 1 scene extraction not found: ${sceneRoot}`);
}
mkdirSync(outputDirectory, { recursive: true });

let areaCount = 0;
let vertexCount = 0;
let faceCount = 0;
for (const entry of readdirSync(sceneRoot, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const mapinfoPath = path.join(sceneRoot, entry.name, "MAPINFO.BIN");
  if (!existsSync(mapinfoPath)) continue;
  const parsed = parseShenmue2WorldCollisions(readFileSync(mapinfoPath));
  if (parsed.fields.length === 0) continue;
  const area = entry.name.toUpperCase();
  const fields = parsed.fields.map((field) => {
    vertexCount += field.vertices.length;
    faceCount += field.faces.length;
    return {
      id: field.id,
      kind: "mesh",
      fileOffset: field.fileOffset,
      byteLength: field.byteLength,
      footerOffset: field.footerOffset,
      footerRelativeOffsets: field.footerRelativeOffsets,
      positionsOffset: field.positionsOffset,
      facesOffset: field.facesOffset,
      faceDataEnd: field.faceDataEnd,
      controlsOffset: field.controlsOffset,
      controlPointerTableOffset: field.controlPointerTableOffset,
      controls: field.controls,
      vertices: field.vertices,
      // Preserve all eight native words compactly. The first four remain
      // intentionally unnamed until their runtime meaning is proven.
      faces: field.faces.map((face) => [
        ...face.attributes,
        ...face.indices,
      ]),
    };
  });
  const identity = createHash("sha256")
    .update(JSON.stringify(fields.map(({ vertices, faces }) => ({ vertices, faces }))))
    .digest("hex")
    .slice(0, 16);
  const source = {
    disc,
    scene,
    path: `data/SCENE/${scene}/${entry.name}/MAPINFO.BIN`,
    mapinfoSha256: parsed.sha256,
    mapinfoByteLength: parsed.byteLength,
  };
  const outputPath = path.join(outputDirectory, `${area}.json`);
  const previous = existsSync(outputPath) ? JSON.parse(readFileSync(outputPath)) : null;
  if (previous && previous.generatedFrom !== 'Shenmue II MAPINFO.BIN/FLDD') {
    throw new Error(`Refusing to replace another game's collision data: ${outputPath}`);
  }
  writeFileSync(outputPath, `${JSON.stringify({
    format: "new-yokosuka-native-world-collisions-v2",
    generatedFrom: "Shenmue II MAPINFO.BIN/FLDD",
    defaultField: "0000",
    area,
    discVariants: { ...previous?.discVariants, [disc]: identity },
    variants: { ...previous?.variants, [identity]: {
      sources: [...(previous?.variants?.[identity]?.sources || []).filter(s=>s.disc!==disc), source], fields,
    } },
  })}\n`);
  areaCount += 1;
}

console.log(
  `Wrote ${areaCount} Shenmue II FLDD collision areas with `
  + `${vertexCount} vertices and ${faceCount} faces to ${outputDirectory}`,
);
