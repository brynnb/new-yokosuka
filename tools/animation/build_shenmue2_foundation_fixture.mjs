#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import * as BABYLON from "@babylonjs/core";
import {
  resolveShenmue2NativeMotionId,
  Shenmue2MotLoader,
} from "../../src/Shenmue2MotLoader.js";

const RAM_BASE = 0x8c000000;
const bindingsDirectory = path.resolve(process.argv[2] || ".disc-work");
const outputPath = path.resolve(
  process.argv[3]
    || "tests/fixtures/shenmue2-animation/native-foundation.json",
);
const bankPaths = {
  motion: "play/assets/shenmue2-motion/MOTION.MOT",
  npc: "play/assets/shenmue2-motion/NPC.MOT",
  npcTable: "play/assets/shenmue2-motion/NPC_TBL.MOT",
};
const banks = new Map(Object.entries(bankPaths).map(([name, filename]) => [
  name,
  Shenmue2MotLoader.parse(fs.readFileSync(filename)),
]));
const reflectionX = BABYLON.Matrix.Scaling(-1, 1, 1);

function actorRelativePelvis(rootValues, pelvisValues) {
  const root = BABYLON.Matrix.FromArray(rootValues);
  const pelvis = BABYLON.Matrix.FromArray(pelvisValues);
  const relative = pelvis.multiply(root.clone().invert());
  const reflected = reflectionX.multiply(relative).multiply(reflectionX);
  return reflected.getTranslation().asArray();
}

function slotZeroFrame(ramPath, controllerAddress) {
  const ram = fs.openSync(ramPath, "r");
  try {
    const bytes = Buffer.alloc(4);
    fs.readSync(
      ram,
      bytes,
      0,
      4,
      controllerAddress - RAM_BASE + 0x94,
    );
    return bytes.readFloatLE(0);
  } finally {
    fs.closeSync(ram);
  }
}

const samples = [];
for (const filename of fs.readdirSync(bindingsDirectory).sort()) {
  if (!filename.endsWith("-s2-bindings.json")) continue;
  const report = JSON.parse(fs.readFileSync(
    path.join(bindingsDirectory, filename),
    "utf8",
  ));
  if (!fs.existsSync(report.source?.ramPath || "")) continue;
  for (const controller of report.controllers || []) {
    const pelvis = controller.renderBindings?.find(
      ({ controllerMatrixOffset }) => Number(controllerMatrixOffset) === 0x3e0,
    )?.controllerMatrix;
    if (!pelvis) continue;
    const motionId = Number(controller.currentMotionIds?.[0]);
    const resolved = resolveShenmue2NativeMotionId(motionId);
    const sequence = resolved
      ? banks.get(resolved.bank)?.sequences?.[resolved.sequenceIndex]
      : null;
    if (!sequence?.valid) continue;
    const sampleFrame = slotZeroFrame(
      report.source.ramPath,
      Number(controller.address),
    );
    const compact = Shenmue2MotLoader.evaluateSequence(
      sequence,
      sampleFrame,
    );
    samples.push({
      capture: filename.replace(/-s2-bindings\.json$/, ""),
      controllerAddress: controller.address,
      motionId,
      sampleFrame,
      compactRootPosition: compact.rootPosition,
      nativePelvisFromActorRoot: actorRelativePelvis(
        controller.rootMatrix,
        pelvis,
      ),
    });
  }
}

const fixture = {
  schema: "new-yokosuka-s2-native-foundation-fixture-v1",
  provenance: {
    kind: "Dreamcast synchronized compact-controller captures",
    note: "Controller addresses identify capture-local instances only.",
  },
  motionBanks: bankPaths,
  sampleCount: samples.length,
  motionIds: [...new Set(samples.map(({ motionId }) => motionId))].sort(
    (left, right) => left - right,
  ),
  samples,
};
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(fixture, null, 2)}\n`);
console.error(
  `Wrote ${samples.length} root/pelvis samples across ${fixture.motionIds.length} motions to ${outputPath}`,
);
