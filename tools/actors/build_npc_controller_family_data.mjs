#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  authoredControllerFamilyIndexFromMt5,
  inspectMt5ControllerFamily,
} from "../../src/Mt5ControllerFamily.js";

const ASSET_MANIFEST_PATH = path.resolve(
  process.argv[2] || "play/data/scheduled-actor-assets.json",
);
const ASSET_DIRECTORY = path.resolve(
  process.argv[3] || "play/assets/characters",
);
const RAM_EVIDENCE_PATH = path.resolve(
  process.argv[4] || "tools/evidence/npc-controller-family-evidence.json",
);
const EVIDENCE_PATH = path.resolve(
  process.argv[5] || "tools/evidence/npc-controller-family-disc-evidence.json",
);
const WEB_DATA_PATH = path.resolve(
  process.argv[6] || "play/data/npc-controller-target-families.web.js",
);
const ADDITIONAL_ASSET_MANIFEST_PATHS = process.argv
  .slice(7)
  .map(value => path.resolve(value));

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function hex(value, width = 4) {
  return `0x${value.toString(16).padStart(width, "0")}`;
}

const assetManifestPaths = [
  ASSET_MANIFEST_PATH,
  ...ADDITIONAL_ASSET_MANIFEST_PATHS,
];
const manifests = assetManifestPaths.map(manifestPath => (
  JSON.parse(fs.readFileSync(manifestPath, "utf8"))
));
const ramEvidence = fs.existsSync(RAM_EVIDENCE_PATH)
  ? JSON.parse(fs.readFileSync(RAM_EVIDENCE_PATH, "utf8"))
  : null;
const ramFamilyByModel = new Map(
  (ramEvidence?.models || [])
    .filter((model) => Number.isInteger(model.consistentFamilyIndex))
    .map((model) => [model.modelCode, model.consistentFamilyIndex]),
);

const models = manifests.flatMap(manifest => manifest.assets)
  .map((asset) => {
    const modelPath = path.join(ASSET_DIRECTORY, asset.modelFile);
    const bytes = fs.readFileSync(modelPath);
    const modelSha256 = sha256(bytes);
    if (modelSha256 !== asset.modelSha256) {
      throw new Error(
        `${asset.modelFile} does not match its HUMANS provenance hash`,
      );
    }

    const inspection = inspectMt5ControllerFamily(bytes);
    const familyIndex = authoredControllerFamilyIndexFromMt5(bytes);
    if (familyIndex === null) {
      throw new Error(
        `${asset.modelFile} root node type `
        + `${hex(inspection.rootNodeType)} has no authored controller family`,
      );
    }

    const ramFamilyIndex = ramFamilyByModel.get(asset.assetModelCode) ?? null;
    return {
      modelCode: asset.assetModelCode,
      mappedModelCode: asset.mappedModelCode,
      assetModelCode: asset.assetModelCode,
      modelFile: asset.modelFile,
      modelSha256,
      sourceArchive: "HUMANS.AFS",
      sourceEntryIndices: asset.modelEntryIndices,
      hierarchyOffset: inspection.modelOffset,
      rootNodeFlag: hex(inspection.rootNodeFlag, 8),
      rootNodeType: hex(inspection.rootNodeType),
      familyIndex,
      ramFamilyIndex,
      agreesWithRam: ramFamilyIndex === null
        ? null
        : ramFamilyIndex === familyIndex,
    };
  })
  .sort((left, right) => left.modelCode.localeCompare(right.modelCode));

const duplicateModelCodes = models
  .filter((model, index) => (
    index > 0 && model.modelCode === models[index - 1].modelCode
  ))
  .map((model) => model.modelCode);
if (duplicateModelCodes.length > 0) {
  throw new Error(
    `Duplicate model mappings: ${duplicateModelCodes.join(", ")}`,
  );
}

const ramMismatches = models.filter(
  (model) => model.agreesWithRam === false,
);
const missingRamModels = [...ramFamilyByModel.keys()]
  .filter((modelCode) => !models.some((model) => model.modelCode === modelCode))
  .sort();
if (ramMismatches.length > 0 || missingRamModels.length > 0) {
  throw new Error(
    "Disc-derived controller families disagree with retained RAM evidence: "
    + JSON.stringify({ ramMismatches, missingRamModels }),
  );
}

const modelFamilies = Object.fromEntries(
  models.flatMap((model) => {
    const entries = [[model.modelCode, model.familyIndex]];
    if (model.mappedModelCode !== model.modelCode) {
      entries.push([model.mappedModelCode, model.familyIndex]);
    }
    return entries;
  }).sort(([left], [right]) => left.localeCompare(right)),
);
const familyCounts = Object.fromEntries(
  [...models.reduce((counts, model) => {
    counts.set(model.familyIndex, (counts.get(model.familyIndex) || 0) + 1);
    return counts;
  }, new Map())].sort(([left], [right]) => left - right),
);
const evidence = {
  schema: "new-yokosuka-npc-controller-family-disc-evidence-v1",
  sources: {
    executableFunction: "FUN_0c0faef2",
    executableRule: (
      "selected HRCM hierarchy node low word > 0x7000 "
      + "? nodeType - 0x7001 : 0"
    ),
    assetManifests: assetManifestPaths.map(
      manifestPath => path.relative(process.cwd(), manifestPath),
    ),
    assetDirectory: path.relative(process.cwd(), ASSET_DIRECTORY),
    ramCrossCheck: ramEvidence
      ? path.relative(process.cwd(), RAM_EVIDENCE_PATH)
      : null,
  },
  evidenceBoundary: (
    "Each mapping is decoded from the root hierarchy node of the exact CHRM "
    + "bytes extracted from HUMANS.AFS. The asset SHA-256 must match the "
    + "archive provenance manifest. Retained live-RAM observations are an "
    + "independent cross-check and must agree; they are not used to choose "
    + "or infer a family."
  ),
  summary: {
    modelCount: models.length,
    exportedModelCodeCount: Object.keys(modelFamilies).length,
    familyCounts,
    ramCrossCheckCount: models.filter(
      (model) => model.ramFamilyIndex !== null,
    ).length,
    ramMismatchCount: ramMismatches.length,
  },
  models,
};

fs.mkdirSync(path.dirname(EVIDENCE_PATH), { recursive: true });
fs.writeFileSync(EVIDENCE_PATH, `${JSON.stringify(evidence, null, 2)}\n`);
fs.mkdirSync(path.dirname(WEB_DATA_PATH), { recursive: true });
fs.writeFileSync(
  WEB_DATA_PATH,
  [
    "// Generated by tools/actors/build_npc_controller_family_data.mjs.",
    "// Do not hand-edit; values come from original HUMANS CHRM hierarchy node types.",
    `export const NPC_CONTROLLER_FAMILY_BY_MODEL = Object.freeze(${JSON.stringify(modelFamilies, null, 2)});`,
    "",
  ].join("\n"),
);

console.error(`Wrote ${EVIDENCE_PATH}`);
console.error(`Wrote ${WEB_DATA_PATH}`);
console.error(
  `Decoded ${models.length} models; `
  + `${evidence.summary.ramCrossCheckCount} RAM cross-checks agree`,
);
