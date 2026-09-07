#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

const PRODUCTS = Object.freeze([
  {
    key: "jet_cola",
    name: "Jet Cola",
    resourceCode: "COKE",
    temperature: "cold",
  },
  {
    key: "fruda_orange",
    name: "Fruda Orange",
    resourceCode: "FATO",
    temperature: "cold",
  },
  {
    key: "fruda_grape",
    name: "Fruda Grape",
    resourceCode: "FATG",
    temperature: "cold",
  },
  {
    key: "jet_soda",
    name: "Jet Soda",
    resourceCode: "SPRT",
    temperature: "cold",
  },
  {
    key: "bell_woods_coffee",
    name: "Bell Wood's Coffee Original Blend",
    resourceCode: "CAFE",
    temperature: "hot",
  },
]);

const SOURCES = Object.freeze([
  {
    worldId: "sakuragaoka",
    file: "play/data/jd00-runtime-placements.json",
  },
  {
    worldId: "dobuita",
    file: "play/data/d000-runtime-placements.json",
  },
  {
    worldId: "mfsy",
    file: "play/data/mfsy-runtime-placements.json",
  },
  {
    worldId: "ma00",
    file: "play/data/mfsy-runtime-placements.json",
  },
  {
    worldId: "ma00race",
    file: "play/data/ma00-race-runtime-placements.json",
  },
]);

function machineKey(worldId, placement, index) {
  const nativeTag = String(placement.runtime?.objectTag || "machine")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const variant = Number.isInteger(placement.runtime?.staticVariantIndex)
    ? placement.runtime.staticVariantIndex
    : index;
  return `${worldId}-${nativeTag}-${variant}`;
}

const machines = [];
for (const source of SOURCES) {
  const filename = path.join(repoRoot, source.file);
  const manifest = JSON.parse(fs.readFileSync(filename, "utf8"));
  const placements = manifest.placements.filter(
    (placement) => /JIHS5/i.test(placement.model),
  );
  for (const [index, placement] of placements.entries()) {
    machines.push({
      id: machineKey(source.worldId, placement, index),
      worldId: source.worldId,
      model: placement.model,
      objectTag: placement.runtime?.objectTag || null,
      position: placement.position,
      rotationDegrees: placement.rotationDegrees || [0, 0, 0],
      interactionRadius: 10,
      source: source.file,
    });
  }
}

const manifest = {
  schema: "new-yokosuka-vending-manifest-v1",
  sourceGame: "Shenmue (non-Japanese Dreamcast release)",
  currency: "JPY",
  unitPrice: 100,
  winningCanChance: {
    numerator: 1,
    denominator: 10,
  },
  products: PRODUCTS,
  prize: {
    key: "winning_can",
    name: "Winning Can",
    resourceCode: "ATRK",
  },
  machines,
};

const output = "play/data/vending-machines.json";
const filename = path.join(repoRoot, output);
fs.mkdirSync(path.dirname(filename), { recursive: true });
fs.writeFileSync(filename, `${JSON.stringify(manifest, null, 2)}\n`);

console.log(
  `Wrote ${machines.length} vending machines and `
  + `${PRODUCTS.length} Shenmue drinks.`,
);
