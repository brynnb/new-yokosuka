#!/usr/bin/env node
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseNativeWorldCollisions,
} from "../lib/native-world-collisions.mjs";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const sourceDefinitions = [
  {
    disc: 1,
    scene: "01",
    env: "SHENMUE_DISC1_EXTRACTED_ROOT",
    directories: ["extracted_files"],
  },
  {
    disc: 2,
    scene: "02",
    env: "SHENMUE_DISC2_EXTRACTED_ROOT",
    directories: ["extracted_disc2_v2"],
  },
  {
    disc: 3,
    scene: "03",
    env: "SHENMUE_DISC3_EXTRACTED_ROOT",
    directories: ["extracted_disc3_v2"],
  },
];

function sourceRoot(definition) {
  const candidates = [
    process.env[definition.env],
    ...definition.directories.map((directory) => path.join(repoRoot, directory)),
  ].filter(Boolean);
  const root = candidates.find(existsSync);
  if (!root) {
    throw new Error(
      `Disc ${definition.disc} extraction not found. Tried: ${
        candidates.join(", ")
      }`,
    );
  }
  return root;
}

function compactRecord(record, sectionOffset) {
  return {
    recordOffset: record.fileOffset - sectionOffset,
    code: record.code,
    shapeType: record.shapeType,
    geometry: record.geometry,
  };
}

function compactParsed(parsed, { disc, scene, area, sourcePath }) {
  return {
    source: {
      disc,
      scene,
      path: sourcePath,
      mapinfoSha256: parsed.sha256,
      mapinfoByteLength: parsed.byteLength,
    },
    fields: parsed.containers.flatMap((container) => (
      container.fields
        .filter(({ sections }) => sections.length > 0)
        .map((field) => ({
          id: field.id,
          fileOffset: field.fileOffset,
          byteLength: field.byteLength,
          sections: field.sections.map((section) => ({
            fileOffset: section.fileOffset,
            payloadByteLength: section.payloadByteLength,
            records: section.records.map((record) => (
              compactRecord(record, section.fileOffset)
            )),
          })),
        }))
    )),
    area,
  };
}

const outputDirectory = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(repoRoot, "public/data/native-collisions");
const candidatesByArea = new Map();

for (const definition of sourceDefinitions) {
  const root = sourceRoot(definition);
  const sceneRoot = path.join(root, "data", "SCENE", definition.scene);
  for (const entry of readdirSync(sceneRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const absolute = path.join(sceneRoot, entry.name, "MAPINFO.BIN");
    if (!existsSync(absolute)) continue;
    const parsed = parseNativeWorldCollisions(readFileSync(absolute));
    if (parsed.containers.length === 0) continue;
    const area = entry.name.toUpperCase();
    const candidate = compactParsed(parsed, {
      disc: definition.disc,
      scene: definition.scene,
      area,
      sourcePath: `data/SCENE/${definition.scene}/${entry.name}/MAPINFO.BIN`,
    });
    if (!candidatesByArea.has(area)) candidatesByArea.set(area, []);
    candidatesByArea.get(area).push(candidate);
  }
}

const areas = {};
for (const [area, candidates] of candidatesByArea) {
  const variants = {};
  const discVariants = {};
  for (const candidate of candidates) {
    const authoredCollision = candidate.fields.map((field) => ({
      id: field.id,
      sections: field.sections.map((section) => ({
        records: section.records.map((record) => ({
          code: record.code,
          shapeType: record.shapeType,
          geometry: record.geometry,
        })),
      })),
    }));
    const identity = createHash("sha256")
      .update(JSON.stringify(authoredCollision))
      .digest("hex")
      .slice(0, 16);
    discVariants[String(candidate.source.disc)] = identity;
    if (!variants[identity]) {
      variants[identity] = {
        sources: [candidate.source],
        fields: candidate.fields,
      };
    } else {
      variants[identity].sources.push(candidate.source);
    }
  }
  areas[area] = { discVariants, variants };
}

const manifest = {
  format: "new-yokosuka-native-world-collisions-v1",
  generatedFrom: "Shenmue I MAPINFO.BIN/COLS/COLI",
  defaultField: "0000",
  areas: Object.keys(areas).sort(),
};
mkdirSync(outputDirectory, { recursive: true });
for (const entry of readdirSync(outputDirectory, { withFileTypes: true })) {
  if (entry.isFile() && entry.name.endsWith(".json")) {
    unlinkSync(path.join(outputDirectory, entry.name));
  }
}
for (const [area, definition] of Object.entries(areas)) {
  writeFileSync(
    path.join(outputDirectory, `${area}.json`),
    `${JSON.stringify({
      format: manifest.format,
      generatedFrom: manifest.generatedFrom,
      defaultField: manifest.defaultField,
      area,
      ...definition,
    })}\n`,
  );
}
writeFileSync(
  path.join(outputDirectory, "index.json"),
  `${JSON.stringify(manifest)}\n`,
);

const variants = Object.values(areas).flatMap(({ variants: value }) => (
  Object.values(value)
));
const recordCount = variants.reduce((total, variant) => (
  total + variant.fields.reduce((fieldTotal, field) => (
    fieldTotal + field.sections.reduce(
      (sectionTotal, section) => sectionTotal + section.records.length,
      0,
    )
  ), 0)
), 0);
console.log(
  `Wrote ${Object.keys(areas).length} areas, ${variants.length} variants, `
  + `${recordCount} COLI records to ${outputDirectory}`,
);
