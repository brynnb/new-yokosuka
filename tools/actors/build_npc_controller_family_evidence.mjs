#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  discoverProgramExtents,
  normalizedRamPointer,
  ramOffset,
} from "../lib/scheduled_actor_extractor.js";

const CAPTURE_ROOT = path.resolve("captures/pvr");
const SCHEDULED_ACTORS_PATH = path.resolve("play/data/scheduled-actors.json");
const EVIDENCE_PATH = path.resolve(
  "tools/evidence/npc-controller-family-evidence.json",
);
const WEB_DATA_PATH = path.resolve(
  "tools/evidence/npc-controller-family-ram-evidence.web.js",
);

const ACTOR_MINIMUM_LENGTH = 0x1dc;
const ACTOR_CONTROLLER_OFFSET = 0x6c;
const CONTROLLER_MATRIX_ARRAY_OFFSET = 0xb0;
const CONTROLLER_CONTROL_ARRAY_OFFSET = 0xb4;
const CONTROLLER_FAMILY_INDEX_OFFSET = 0x1c4;
const CONTROL_MATRIX_POINTER_OFFSET = 0x44;

function listRamCaptures(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) return listRamCaptures(entryPath);
      return entry.isFile() && entry.name === "ram.bin" ? [entryPath] : [];
    })
    .sort();
}

function occurrences(data, bytes) {
  const result = [];
  let cursor = -1;
  while ((cursor = data.indexOf(bytes, cursor + 1)) !== -1) {
    result.push(cursor);
  }
  return result;
}

function pointerBytes(pointer) {
  const result = Buffer.alloc(4);
  result.writeUInt32LE(pointer >>> 0);
  return result;
}

function pointer(data, offset) {
  if (offset < 0 || offset + 4 > data.length) return null;
  return normalizedRamPointer(data.readUInt32LE(offset), data.length);
}

function validControllerObservation(data, actorOffset) {
  const controllerAddress = pointer(
    data,
    actorOffset + ACTOR_CONTROLLER_OFFSET,
  );
  if (controllerAddress === null) return null;
  const controllerOffset = ramOffset(controllerAddress);
  if (
    controllerOffset < 0
    || controllerOffset + CONTROLLER_FAMILY_INDEX_OFFSET + 4 > data.length
  ) {
    return null;
  }
  const familyIndex = data.readInt32LE(
    controllerOffset + CONTROLLER_FAMILY_INDEX_OFFSET,
  );
  if (familyIndex < 0 || familyIndex > 20) return null;

  // Reject pointer-like false positives by requiring the controller's first
  // native control to point at the first final matrix, as the SH-4 runtime
  // construction code guarantees.
  const matricesAddress = pointer(
    data,
    controllerOffset + CONTROLLER_MATRIX_ARRAY_OFFSET,
  );
  const controlsAddress = pointer(
    data,
    controllerOffset + CONTROLLER_CONTROL_ARRAY_OFFSET,
  );
  if (matricesAddress === null || controlsAddress === null) return null;
  const firstControlOffset = ramOffset(controlsAddress);
  if (firstControlOffset + CONTROL_MATRIX_POINTER_OFFSET + 4 > data.length) {
    return null;
  }
  const firstMatrixAddress = pointer(
    data,
    firstControlOffset + CONTROL_MATRIX_POINTER_OFFSET,
  );
  if (firstMatrixAddress !== matricesAddress) return null;
  return { familyIndex };
}

function captureObservations(data) {
  const observations = [];
  const ambiguities = [];
  for (const program of discoverProgramExtents(data)) {
    const ownerPointer = ((program.programHeader & 0x0fffffff) - 4) >>> 0;
    const actorOffsets = occurrences(data, pointerBytes(ownerPointer))
      .filter((offset) => offset + ACTOR_MINIMUM_LENGTH <= data.length);
    const candidates = actorOffsets
      .map((actorOffset) => validControllerObservation(data, actorOffset))
      .filter((candidate) => Number.isInteger(candidate?.familyIndex));
    if (candidates.length === 1) {
      observations.push({
        actorCode: program.actorCode,
        familyIndex: candidates[0].familyIndex,
      });
    } else if (candidates.length > 1) {
      ambiguities.push({
        actorCode: program.actorCode,
        candidateFamilyIndices: [
          ...new Set(candidates.map((candidate) => candidate.familyIndex)),
        ].sort((a, b) => a - b),
        candidateCount: candidates.length,
      });
    }
  }
  return { observations, ambiguities };
}

function collectActorModels(value, result = new Map()) {
  if (Array.isArray(value)) {
    for (const entry of value) collectActorModels(entry, result);
    return result;
  }
  if (!value || typeof value !== "object") return result;
  if (
    typeof value.actorCode === "string"
    && typeof value.modelCode === "string"
  ) {
    const actorCode = value.actorCode.toUpperCase();
    if (!result.has(actorCode)) result.set(actorCode, new Set());
    result.get(actorCode).add(value.modelCode.toUpperCase());
  }
  for (const child of Object.values(value)) collectActorModels(child, result);
  return result;
}

function sortedCounts(values) {
  const counts = new Map();
  for (const value of values) counts.set(value, (counts.get(value) || 0) + 1);
  return [...counts]
    .sort(([left], [right]) => left - right)
    .map(([familyIndex, count]) => ({ familyIndex, count }));
}

const capturePaths = listRamCaptures(CAPTURE_ROOT);
const actorModels = collectActorModels(
  JSON.parse(fs.readFileSync(SCHEDULED_ACTORS_PATH, "utf8")),
);
const observationByActor = new Map();
const captureRecords = [];

for (const [captureIndex, capturePath] of capturePaths.entries()) {
  const data = fs.readFileSync(capturePath);
  const { observations, ambiguities } = captureObservations(data);
  if (observations.length || ambiguities.length) {
    const relativePath = path.relative(process.cwd(), capturePath);
    const captureId = crypto.createHash("sha256").update(data).digest("hex");
    captureRecords.push({
      path: relativePath,
      sha256: captureId,
      observations,
      ambiguities,
    });
    for (const observation of observations) {
      if (!observationByActor.has(observation.actorCode)) {
        observationByActor.set(observation.actorCode, []);
      }
      observationByActor.get(observation.actorCode).push({
        familyIndex: observation.familyIndex,
        capture: relativePath,
        captureSha256: captureId,
      });
    }
  }
  if ((captureIndex + 1) % 50 === 0 || captureIndex + 1 === capturePaths.length) {
    console.error(
      `Scanned ${captureIndex + 1}/${capturePaths.length} RAM captures`,
    );
  }
}

const actors = [...observationByActor]
  .sort(([left], [right]) => left.localeCompare(right))
  .map(([actorCode, observations]) => {
    const modelCodes = [...(actorModels.get(actorCode) || [])].sort();
    const familyCounts = sortedCounts(
      observations.map((observation) => observation.familyIndex),
    );
    return {
      actorCode,
      modelCodes,
      familyCounts,
      consistentFamilyIndex: familyCounts.length === 1
        ? familyCounts[0].familyIndex
        : null,
      observationCount: observations.length,
      observations,
    };
  });

const modelEvidence = new Map();
for (const actor of actors) {
  if (actor.consistentFamilyIndex === null) continue;
  for (const modelCode of actor.modelCodes) {
    if (!modelEvidence.has(modelCode)) modelEvidence.set(modelCode, []);
    modelEvidence.get(modelCode).push({
      actorCode: actor.actorCode,
      familyIndex: actor.consistentFamilyIndex,
      observationCount: actor.observationCount,
    });
  }
}

const models = [...modelEvidence]
  .sort(([left], [right]) => left.localeCompare(right))
  .map(([modelCode, actorEvidence]) => {
    const familyIndices = [
      ...new Set(actorEvidence.map((entry) => entry.familyIndex)),
    ].sort((a, b) => a - b);
    return {
      modelCode,
      familyIndices,
      consistentFamilyIndex: familyIndices.length === 1
        ? familyIndices[0]
        : null,
      actors: actorEvidence,
    };
  });

const provenModelFamilies = Object.fromEntries(
  models
    .filter((model) => model.consistentFamilyIndex !== null)
    .map((model) => [model.modelCode, model.consistentFamilyIndex]),
);
const evidence = {
  schema: "new-yokosuka-npc-controller-family-evidence-v1",
  generatedAt: new Date().toISOString(),
  sources: {
    executableControllerField: "actor +0x6c controller, signed word +0x1c4",
    scheduledActorCatalog: path.relative(process.cwd(), SCHEDULED_ACTORS_PATH),
    captureRoot: path.relative(process.cwd(), CAPTURE_ROOT),
    scannedCaptureCount: capturePaths.length,
    contributingCaptureCount: captureRecords.length,
  },
  interpretationPolicy: (
    "A RAM cross-check mapping is emitted only when every resolved live "
    + "observation for every catalogued actor using that model agrees on one "
    + "of the executable's 21 controller-family indices. Conflicts remain "
    + "visible and are never guessed."
  ),
  actors,
  models,
  captures: captureRecords,
};

fs.mkdirSync(path.dirname(EVIDENCE_PATH), { recursive: true });
fs.writeFileSync(EVIDENCE_PATH, `${JSON.stringify(evidence, null, 2)}\n`);
fs.mkdirSync(path.dirname(WEB_DATA_PATH), { recursive: true });
fs.writeFileSync(
  WEB_DATA_PATH,
  [
    "// Generated by tools/actors/build_npc_controller_family_evidence.mjs.",
    "// Independent live-RAM cross-check; runtime data comes from CHRM.",
    `export const NPC_CONTROLLER_FAMILY_BY_MODEL = Object.freeze(${JSON.stringify(provenModelFamilies, null, 2)});`,
    "",
  ].join("\n"),
);

console.error(`Wrote ${EVIDENCE_PATH}`);
console.error(`Wrote ${WEB_DATA_PATH}`);
console.error(
  `Resolved ${Object.keys(provenModelFamilies).length} model controller families`,
);
