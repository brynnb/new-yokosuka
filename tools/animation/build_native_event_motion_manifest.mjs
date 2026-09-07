#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { MotnLoader } from "../../src/MotnLoader.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const programPath = resolve(
  process.argv[2]
    || join(repoRoot, "play/data/events/nativeEventPrograms.generated.json"),
);
const motionCandidates = [
  process.argv[3],
  join(repoRoot, ".disc-work/runtime-motion/MOTION.BIN"),
  resolve(repoRoot, ".disc-work/runtime-motion/MOTION.BIN"),
  resolve(
    repoRoot,
  ),
].filter(Boolean);
const motionPath = motionCandidates.find(existsSync);
const outputPath = resolve(
  process.argv[4]
    || join(repoRoot, "play/data/events/nativeEventMotions.generated.json"),
);

if (!motionPath) {
  throw new Error("MOTION.BIN was not found in an exact local Disc extraction");
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function programActions(program) {
  return (program.functions || []).flatMap((definition) => (
      (definition.blocks || []).flatMap((block) => block.actions || [])
  ));
}

const programBytes = readFileSync(programPath);
const programPack = JSON.parse(programBytes);
if (
  programPack.schema !== "new-yokosuka-native-event-program-pack-v1"
) {
  throw new Error("unsupported native event program pack");
}

function constantRequestWord(operand) {
  if (
    operand?.kind !== "constant"
    || !Number.isInteger(operand.value)
  ) {
    return null;
  }
  const request = operand.value & 0xffff;
  return request > 0 ? request : null;
}

function actionRequest(action) {
  if (action.semanticId === "actor-motion-request") {
    return constantRequestWord(action.arguments?.[1]);
  }
  if (action.semanticId === "actor-xmpt-request") {
    return constantRequestWord(action.arguments?.[3]);
  }
  return null;
}

const declaredBanks = new Map();
for (const program of programPack.programs || []) {
  for (const definition of program.motionBanks || []) {
    if (
      !Number.isInteger(definition.requestBank)
      || definition.requestBank <= 0
      || definition.requestBank > 0xff
      || definition.indexRule !== "low-byte one-based"
      || typeof definition.motionFile !== "string"
      || typeof definition.source !== "string"
      || !/^[a-f0-9]{64}$/.test(definition.sha256 || "")
    ) {
      throw new Error(`${program.id} has an invalid native motion bank`);
    }
    const existing = declaredBanks.get(definition.requestBank);
    if (existing && JSON.stringify(existing) !== JSON.stringify(definition)) {
      throw new Error(
        `native motion bank ${definition.requestBank} has conflicting sources`,
      );
    }
    declaredBanks.set(definition.requestBank, definition);
  }
}

const requestDefinitions = new Map();
for (const program of programPack.programs || []) {
  for (const action of programActions(program)) {
    const request = actionRequest(action);
    if (request === null) continue;
    const actorCode = action.arguments?.[0]?.ascii;
    if (request >= 0x0618 && actorCode !== "AKIR") continue;
    const requestBank = request >>> 8;
    const definition = request < 0x0618
      ? null
      : declaredBanks.get(requestBank);
    if (request >= 0x0618 && !definition) {
      throw new Error(
        `${program.id} request 0x${request.toString(16)} has no exact bank`,
      );
    }
    const index = definition ? (request & 0xff) - 1 : request - 1;
    if (index < 0) {
      throw new Error(`native motion request ${request} has invalid index`);
    }
    const current = requestDefinitions.get(request);
    const next = { request, index, definition };
    if (
      current
      && JSON.stringify(current.definition) !== JSON.stringify(definition)
    ) {
      throw new Error(`native motion request ${request} is ambiguous`);
    }
    requestDefinitions.set(request, next);
  }
}

const motionBytes = readFileSync(motionPath);
const parsed = MotnLoader.parse(motionBytes, {
  sequenceIndices: [...requestDefinitions.values()]
    .filter(item => item.definition === null)
    .map(item => item.index),
});
const byIndex = new Map(
  parsed.sequences.map((sequence) => [sequence.index, sequence]),
);
const supplemental = new Map();
for (const definition of declaredBanks.values()) {
  const bytes = readFileSync(resolve(repoRoot, definition.source));
  if (sha256(bytes) !== definition.sha256) {
    throw new Error(`${definition.source} SHA-256 changed`);
  }
  supplemental.set(definition.requestBank, {
    definition,
    bytes,
    motion: MotnLoader.parse(bytes, {
      sequenceIndices: [...requestDefinitions.values()]
        .filter(item => item.definition?.requestBank === definition.requestBank)
        .map(item => item.index),
    }),
  });
}
const motions = [...requestDefinitions.values()]
  .sort((left, right) => left.request - right.request)
  .map(({ request, index, definition }) => {
  const bankMotion = definition
    ? supplemental.get(definition.requestBank).motion
    : parsed;
  const sequence = bankMotion.sequences.find(item => item.index === index);
  if (!sequence?.name || !sequence.valid || !sequence.valueData?.complete) {
    throw new Error(
      `native motion request ${request} did not resolve to a complete sequence`,
    );
  }
  return {
    request,
    index,
    name: sequence.name,
    ...(definition ? { motionFile: definition.motionFile } : {}),
  };
});

const manifest = {
  schema: "new-yokosuka-native-event-motion-manifest-v1",
  generatedFrom: {
    programPackSha256: sha256(programBytes),
    motionBankSha256: sha256(motionBytes),
    bank: "MOTION.BIN",
    indexRule: "one-based request N resolves to zero-based sequence N - 1",
    supplementalBanks: [...supplemental.values()].map(({ definition }) => ({
      requestBank: definition.requestBank,
      motionFile: definition.motionFile,
      source: definition.source,
      sha256: definition.sha256,
      indexRule: definition.indexRule,
    })),
  },
  evidenceBoundary: [
    "Only constant native actor-motion requests and the low request word of constant XMPT controller requests inside the packaged static program closures are included.",
    "Unbanked names and indices are read directly from the exact MOTION.BIN sequence table.",
    "Declared nonzero request banks resolve only through their SHA-256-pinned motion file and explicit low-byte one-based index rule.",
    "Runtime-valued and undeclared-bank requests remain unresolved and fail closed.",
  ],
  motions,
};

writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(
  `Wrote ${motions.length} exact native motion requests to ${outputPath}`,
);
