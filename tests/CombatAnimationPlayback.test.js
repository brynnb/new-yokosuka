import assert from "node:assert/strict";
import {
  existsSync,
  readFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { AnimationStateMachine } from "../play/characters/AnimationStateMachine.js";
import { MotnLoader } from "../src/MotnLoader.js";
import { evaluateRyoMotnFrame } from "../src/RyoMotnRuntime.js";
import {
  MARTIAL_ARTS_FOLLOWUP_STAGES,
  MARTIAL_ARTS_MOVES,
  MARTIAL_ARTS_STRING_STAGES,
} from "../src/MartialArtsCombat.js";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

function firstExisting(relativePaths) {
  const result = relativePaths
    .map((relativePath) => path.resolve(projectRoot, relativePath))
    .find((candidate) => existsSync(candidate));
  assert.ok(result, `missing motion bank: ${relativePaths.join(", ")}`);
  return result;
}

function arrayBufferForFile(filePath) {
  const bytes = readFileSync(filePath);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

function machine() {
  return new AnimationStateMachine({
    renderMatrixByKey: new Map(),
    emotes: [],
    runtimeEmotes: [],
    pickerEmoteIds: new Set(),
    gameTicksPerSecond: 30,
    emoteBlendTicks: 3,
    locomotionBlendSeconds: 0.1,
    locomotionStates: new Set(["idle", "walk", "run", "backpedal"]),
    applyPose() {},
  });
}

function assertPlayableClip(animation, motion, sequenceName) {
  const clip = animation.buildClip(motion, sequenceName, {
    settleLoop: false,
  });
  assert.ok(clip.frames.length > 0, `${sequenceName} has playback frames`);
  const matrixCount = clip.frames[0].poseMatrices.length;
  assert.ok(matrixCount > 0, `${sequenceName} has a skeletal pose`);
  for (const frame of clip.frames) {
    assert.equal(
      frame.poseMatrices.length,
      matrixCount,
      `${sequenceName} keeps a stable skeleton`,
    );
    for (const matrix of frame.poseMatrices) {
      assert.equal(matrix.length, 16, `${sequenceName} uses 4x4 matrices`);
      assert.ok(
        matrix.every(Number.isFinite),
        `${sequenceName} has only finite transforms`,
      );
    }
  }
  const firstPose = clip.frames[0].poseMatrices;
  let maximumPoseDelta = 0;
  for (const frame of clip.frames.slice(1)) {
    for (const [matrixIndex, matrix] of frame.poseMatrices.entries()) {
      const first = firstPose[matrixIndex];
      for (let valueIndex = 0; valueIndex < 16; valueIndex += 1) {
        maximumPoseDelta = Math.max(
          maximumPoseDelta,
          Math.abs(matrix[valueIndex] - first[valueIndex]),
        );
      }
    }
  }
  assert.ok(
    maximumPoseDelta > 1e-4,
    `${sequenceName} changes its skeletal pose across authored frames`,
  );
  return clip;
}

test("native turn aliases produce opposite heading through metadata, not reversed time", () => {
  const names = [45, 90, 135, 180].flatMap(angle => ["L", "R"].map(side =>
    `AKI_AKI_TURN${String(angle).padStart(3, "0")}_${side}`));
  const motion = MotnLoader.parse(arrayBufferForFile(firstExisting([
    ".disc-work/runtime-motion/MOTION.BIN", "extracted_disc3_v2/data/MOTION/MOTION.BIN",
  ])), { sequenceNames: names });
  for (let i = 0; i < names.length; i += 2) {
    const left = motion.getSequence(names[i]);
    const right = motion.getSequence(names[i + 1]);
    assert.equal(left.dataOffset, right.dataOffset);
    assert.deepEqual(left.actionMetadata.mirrorSetup, { mirrored: false, complete: true });
    assert.deepEqual(right.actionMetadata.mirrorSetup, { mirrored: true, complete: true });
    const frame = Math.floor(left.durationFrames / 2);
    const l = evaluateRyoMotnFrame(left, frame, { mirror: false }).matrices[0];
    const r = evaluateRyoMotnFrame(right, frame, { mirror: true }).matrices[0];
    assert.ok(Math.abs(Math.atan2(l[8], l[10]) + Math.atan2(r[8], r[10])) < 1e-6);
    const animation = machine();
    for (const name of [names[i], names[i + 1]]) {
      const clip = animation.buildClip(motion, name, { inPlaceTurn: true });
      assert.ok(clip.frames.every(f => f.poseMatrices.every(m => m.every(Number.isFinite))));
      assert.ok(clip.frames.every(f => Math.abs(Math.atan2(f.poseMatrices[0][8], f.poseMatrices[0][10])) < 1e-6));
    }
  }
});

test("all Ryo, expert, and throw-victim clips decode into finite poses", () => {
  const motionPath = firstExisting([
    ".disc-work/runtime-motion/MOTION.BIN",
    "extracted_disc3_v2/data/MOTION/MOTION.BIN",
  ]);
  const sequenceNames = new Set(
    [
      ...Object.values(MARTIAL_ARTS_MOVES).flatMap((move) => [
        move.animation,
        move.highProficiencyAnimation,
        move.victimAnimation,
        move.highProficiencyVictimAnimation,
      ]),
      ...Object.values(MARTIAL_ARTS_STRING_STAGES).map(
        (stage) => stage.animation,
      ),
      ...Object.values(MARTIAL_ARTS_FOLLOWUP_STAGES).flatMap((stage) => [
        stage.animation,
        stage.victimAnimation,
      ]),
      "YKI_AKI_DOWN_SID_L_LP",
    ].filter(Boolean),
  );
  const motion = MotnLoader.parse(arrayBufferForFile(motionPath), {
    sequenceNames: [...sequenceNames],
  });
  const animation = machine();
  const clips = new Map();
  for (const sequenceName of sequenceNames) {
    clips.set(
      sequenceName,
      assertPlayableClip(animation, motion, sequenceName),
    );
  }
  const tornadoEntry = clips.get("AKI_AKI_BAT_KICK_NIREN1_TOP");
  const tornadoFinish = clips.get("AKI_AKI_BAT_KICK_NIREN1_TOP_MK");
  const entryPose = tornadoEntry.frames.at(-1).poseMatrices;
  const finishPose = tornadoFinish.frames[0].poseMatrices;
  let squaredDifference = 0;
  let comparedValues = 0;
  for (const [matrixIndex, entryMatrix] of entryPose.entries()) {
    const finishMatrix = finishPose[matrixIndex];
    // Compare the 3x3 affine basis. Actor/world translation is separately
    // rebased by the combat root-motion adapter.
    for (const valueIndex of [0, 1, 2, 4, 5, 6, 8, 9, 10]) {
      squaredDifference += (
        entryMatrix[valueIndex] - finishMatrix[valueIndex]
      ) ** 2;
      comparedValues += 1;
    }
  }
  assert.ok(
    Math.sqrt(squaredDifference / comparedValues) < 0.03,
    "Tornado Kick entry ends in the finisher's opening pose",
  );
});

test("all configured Chai attacks, stances, guards, and reactions are playable", () => {
  const fightPath = firstExisting([
    "extracted_disc3_v2/data/SCENE/03/MFBT/M_FGT1.BIN",
  ]);
  const sequenceNames = new Set([
    "YKI_AKI_KAMAE1_LP",
    "DMY_YKI_AKI_KAMAE1_GU_LP",
    "AKI_AKI_NGR_UDEKIME",
    "AKI_AKI_DNGR_UMA_YARARE",
    ...Object.values(MARTIAL_ARTS_MOVES)
      .flatMap((move) => [
        move.enemyAnimation,
        move.enemyVictimAnimation,
      ])
      .filter(Boolean),
  ]);
  const motion = MotnLoader.parse(arrayBufferForFile(fightPath), {
    sequenceNames: [...sequenceNames],
  });
  const animation = machine();
  for (const sequenceName of sequenceNames) {
    assertPlayableClip(animation, motion, sequenceName);
  }
});
