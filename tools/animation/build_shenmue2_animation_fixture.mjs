#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import {
  SHENMUE2_NATIVE_POSE_OUTPUTS,
  SHENMUE2_NATIVE_NON_RENDERED_POSE_OFFSETS,
  SHENMUE2_NATIVE_REQUIRED_RENDER_POSE_OUTPUTS,
  shenmue2PelvisCallbackPhaseErrorDegrees,
  validateShenmue2AnimationFixture,
} from "../lib/Shenmue2AnimationConformance.js";
import {
  nativeControllerRestProfileError,
  shenmue2RestProfileForModelFile,
} from "../lib/Shenmue2NativeRestProfiles.js";
import {
  shenmue2HumanActorCodes,
  shenmue2HumanModelBindings,
  shenmue2RuntimeActorBinding,
} from "../lib/Shenmue2RuntimeActorBinding.js";
import {
  SHENMUE2_SPECIAL_ACTOR_CODES,
  SHENMUE2_SPECIAL_MODEL_BY_ACTOR,
} from "../lib/Shenmue2SpecialActorBinding.js";
import { shenmue2RamSupportsPoseConformance } from
  "../lib/Shenmue2CaptureEvidence.js";
import {
  resolveShenmue2NativeMotionId,
  Shenmue2MotLoader,
} from "../../src/Shenmue2MotLoader.js";

const RAM_BASE = 0x8c000000;
const RAM_END = RAM_BASE + 0x01000000;
const HEAD_MIDDLE_DIRECTION_BLEND_CALLBACK = 0x8c0e7a40;
const PELVIS_PRIMARY_CURRENT_ACTOR_CALLBACK = 0x8c0e7f00;
const PELVIS_CALLBACK_CURRENT_ACTOR = 0x8c24e628;
const PELVIS_CALLBACK_CURRENT_ACTOR_MODE = 0x8c24e7e0;
const PELVIS_CALLBACK_FALLBACK_MODE = 0x8c308334;
const PELVIS_CALLBACK_DIRECTION_BLEND_FRAME = 0x8c308348;
const PELVIS_CALLBACK_DIRECTION_BLEND_END = 0x8c308350;
const PELVIS_CALLBACK_FLAGS = 0x8c30834c;
const PELVIS_CALLBACK_FORCE_COMPLETE = 0x00010000;
const PELVIS_CALLBACK_COMPLETE_EPSILON = 2 ** -23;

// Ordinary humanoid descriptors retain the 69 source curves in source order
// across five solver records. These controller-relative addresses are proven
// by the evaluator calls in FUN_8c1d14e0, FUN_8c1d3000, FUN_8c1d4020, and
// FUN_8c1cf0a0. Each curve applies `sample * scale + base` from +0x34/+0x38;
// non-identity values are live blend state rather than raw MOT data.
const RUNTIME_CURVE_OFFSETS = Object.freeze([
  0x0b0, 0x0f0, 0x130, 0x170, 0x1b0, 0x1f0,
  0x2e0, 0x320, 0x360, 0x428, 0x468, 0x4a8,
  0x520, 0x560, 0x5a0, 0x6a0, 0x6e0, 0x720,
  0x918, 0x958, 0x998, 0xa10, 0xa50, 0xa90,
  0xb90, 0xbd0, 0xc10,
  0xe38, 0xe78, 0xeb8, 0xf30, 0xf70, 0xfb0,
  0x1070, 0x10b0, 0x10f0,
  0x11d8, 0x1218, 0x1258, 0x1310, 0x1350, 0x1390,
  0x1408, 0x1448, 0x1488,
  0x1598, 0x15d8, 0x1618, 0x16d0, 0x1710, 0x1750,
  0x17c8, 0x1808, 0x1848, 0x19c0, 0x1a00, 0x1a40,
  0x1b18, 0x1b58, 0x1b98, 0x1c50, 0x1c90, 0x1cd0,
  0x1d48, 0x1d88, 0x1dc8, 0x1f40, 0x1f80, 0x1fc0,
]);

const ARM_SOLVER_SLOT_OFFSETS = Object.freeze([
  Object.freeze({
    controllerIndex: 14,
    slot: 3,
    slotOffset: 0x1578,
    targetCurveOffsets: Object.freeze([0x17c8, 0x1808, 0x1848]),
    targetCurveIndices: Object.freeze([51, 52, 53]),
  }),
  Object.freeze({
    controllerIndex: 18,
    slot: 4,
    slotOffset: 0x1af8,
    targetCurveOffsets: Object.freeze([0x1d48, 0x1d88, 0x1dc8]),
    targetCurveIndices: Object.freeze([63, 64, 65]),
  }),
]);

function usage() {
  console.error([
    "Usage: node tools/animation/build_shenmue2_animation_fixture.mjs",
    "  --bindings-dir .disc-work --controller 0x8c8082e8",
    "  --motion-id 0xf086 --model play/assets/.../JN1_L.CHRM",
    "  --motion play/assets/shenmue2-motion/MOTION.MOT --out FIXTURE.json",
    "  [--actor-code 04C_] (joins the actor across RAM allocations)",
    "  [--humans-idx .disc-work/.../HUMANS.IDX]",
    "  [--humans-afs .disc-work/.../HUMANS.AFS] [--status strict-native]",
  ].join("\n"));
}

function argumentsFrom(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[++index];
    if (!key?.startsWith("--") || value === undefined) {
      usage();
      process.exit(2);
    }
    result[key.slice(2)] = value;
  }
  for (const required of [
    "bindings-dir", "controller", "motion-id", "model", "motion", "out",
  ]) {
    if (!result[required]) {
      usage();
      process.exit(2);
    }
  }
  return result;
}

function readSlotFrames(ramPath, controllerAddress) {
  const controllerOffset = controllerAddress - RAM_BASE;
  const descriptor = fs.openSync(ramPath, "r");
  try {
    return [0x94, 0xe20, 0x11b0, 0x1580, 0x1b00].map((offset) => {
      const bytes = Buffer.alloc(4);
      fs.readSync(descriptor, bytes, 0, 4, controllerOffset + offset);
      return bytes.readFloatLE(0);
    });
  } finally {
    fs.closeSync(descriptor);
  }
}

function runtimeCurveValue(ram, offset, sampleFrame) {
  const startTime = ram.readFloatLE(offset);
  const endTime = ram.readFloatLE(offset + 0x10);
  const startValue = ram.readFloatLE(offset + 0x0c);
  const endValue = ram.readFloatLE(offset + 0x1c);
  if (![startTime, endTime, startValue, endValue].every(Number.isFinite)) {
    return null;
  }
  const time = sampleFrame / 30;
  if (time <= startTime) return startValue;
  if (time >= endTime || endTime - startTime <= 1e-7) return endValue;
  const startTangent = ram.readFloatLE(offset + 0x08);
  const endTangent = ram.readFloatLE(offset + 0x14);
  if (![startTangent, endTangent].every(Number.isFinite)) return null;
  const duration = endTime - startTime;
  const amount = (time - startTime) / duration;
  const amount2 = amount * amount;
  const amount3 = amount2 * amount;
  return (
    (2 * amount3 - 3 * amount2 + 1) * startValue
    + (amount3 - 2 * amount2 + amount) * duration * startTangent
    + (-2 * amount3 + 3 * amount2) * endValue
    + (amount3 - amount2) * duration * endTangent
  );
}

function runtimeCurveSlot(curveIndex) {
  if (curveIndex < 27) return 0;
  if (curveIndex < 36) return 1;
  if (curveIndex < 45) return 2;
  if (curveIndex < 57) return 3;
  return 4;
}

function readMatrix(ram, offset) {
  return Array.from({ length: 16 }, (_, index) => (
    ram.readFloatLE(offset + index * 4)
  ));
}

function ramAddressOffset(address, byteCount = 4) {
  if (
    !Number.isInteger(address)
    || address < RAM_BASE
    || address + byteCount > RAM_END
  ) return null;
  return address - RAM_BASE;
}

function readRamUInt32(ram, address) {
  const offset = ramAddressOffset(address);
  return offset === null ? null : ram.readUInt32LE(offset);
}

function readRamFloat(ram, address) {
  const offset = ramAddressOffset(address);
  return offset === null ? null : ram.readFloatLE(offset);
}

function readNativeSolverInputs(
  ramPath,
  controllerAddress,
  slotSampleFrames,
  slotMotionIds,
  actorCode,
) {
  const controllerOffset = controllerAddress - RAM_BASE;
  const ram = fs.readFileSync(ramPath);
  const headSlotOffset = controllerOffset + 0x11a8;
  const curveAffines = RUNTIME_CURVE_OFFSETS.flatMap((offset, curveIndex) => {
    const scale = ram.readFloatLE(controllerOffset + offset + 0x34);
    const base = ram.readFloatLE(controllerOffset + offset + 0x38);
    if (Math.abs(scale - 1) <= 1e-6 && Math.abs(base) <= 1e-6) return [];
    return [{ curveIndex, offset, scale, base }];
  });
  const evaluatedCurveValues = RUNTIME_CURVE_OFFSETS.map(
    (offset, curveIndex) => runtimeCurveValue(
      ram,
      controllerOffset + offset,
      slotSampleFrames[runtimeCurveSlot(curveIndex)],
    ),
  );
  const armSolverStates = ARM_SOLVER_SLOT_OFFSETS.map(({
    controllerIndex,
    slot,
    slotOffset,
    targetCurveOffsets,
    targetCurveIndices,
  }) => {
    const base = controllerOffset + slotOffset;
    const mode = ram.readUInt32LE(base);
    const state = {
      controllerIndex,
      mode,
      currentFrame: ram.readFloatLE(base + 0x08),
      blendEndFrame: ram.readFloatLE(base + 0x0c),
    };
    if (mode !== 1) return state;
    const directionBlend = (structureOffset) => {
      const vector = (offset) => [0, 4, 8].map(
        (component) => ram.readFloatLE(
          base + structureOffset + offset + component,
        ),
      );
      return {
        targetForward: vector(0x00),
        targetUp: vector(0x0c),
        sourceForward: vector(0x18),
        sourceUp: vector(0x24),
      };
    };
    return {
      ...state,
      rootDirectionBlend: directionBlend(0x0e0),
      basisDirectionBlend: directionBlend(0x218),
      terminalDirectionBlend: directionBlend(0x3d0),
      attachmentDirectionBlend: directionBlend(0x548),
      layerTransition: {
        slot,
        sourceMotionId: slotMotionIds[0],
        targetMotionId: slotMotionIds[slot],
        sourceFrame: slotSampleFrames[0] - state.currentFrame,
        currentFrame: state.currentFrame,
        durationFrames: state.blendEndFrame,
        sourceTangentScale: 0.5,
        targetCurveDescriptors: targetCurveOffsets.map((offset, index) => {
          const descriptor = controllerOffset + offset;
          return {
            curveIndex: targetCurveIndices[index],
            startTime: ram.readFloatLE(descriptor + 0x00),
            startTangent: ram.readFloatLE(descriptor + 0x08),
            startValue: ram.readFloatLE(descriptor + 0x0c),
            endTime: ram.readFloatLE(descriptor + 0x10),
            endTangent: ram.readFloatLE(descriptor + 0x14),
            endValue: ram.readFloatLE(descriptor + 0x1c),
            scale: ram.readFloatLE(descriptor + 0x34),
            base: ram.readFloatLE(descriptor + 0x38),
          };
        }),
      },
    };
  });
  const terrainHeightAdjustments = actorCode === "RYO_"
    ? [-0x510, -0x50c].map(
        (offset) => ram.readFloatLE(controllerOffset + offset),
      )
    : null;
  const headMiddleCallbackAddress = ram.readUInt32LE(
    headSlotOffset + 0x258,
  );
  const pelvisPrimaryCallbackAddress = ram.readUInt32LE(
    controllerOffset + 0x2a8,
  );
  const pelvisPrimaryCallbackContextAddress = ram.readUInt32LE(
    controllerOffset + 0x2ac,
  );
  const headMiddleCallback = headMiddleCallbackAddress
    === HEAD_MIDDLE_DIRECTION_BLEND_CALLBACK
    ? {
        // FUN_8c0e7a40 reads the active compact controller through the
        // render-time current-controller global. Controller +0x26c0 is its
        // blend amount; controller +0x04 selects one of two fixed bases.
        kind: "current-actor-direction-blend",
        callbackAddress: headMiddleCallbackAddress,
        blendAmount: ram.readFloatLE(controllerOffset + 0x26c0),
        basisVariant: ram.readUInt32LE(controllerOffset + 0x04) === 0 ? 0 : 1,
      }
    : null;
  return {
    // At 0x8c1d1856..0x8c1d1876 the slot-zero solver builds the compact root
    // translation in an identity matrix and saves it at controller +0x48
    // before applying controller 0's rotations. For scheduled actors its
    // horizontal components cancel travel already owned by controller +0x08.
    pelvisRootTranslationMatrix: readMatrix(ram, controllerOffset + 0x48),
    // FUN_8c1d14e0 saves controller 0's completed matrix at compact
    // controller +0x230 (the SH-4 function receives controller +0x08 and
    // addresses it as +0x228). This is after the optional slot-zero callback
    // and before controller 1 builds the renderer-consumed pelvis at +0x3e0.
    // Keeping the native intermediate lets conformance distinguish callback
    // behavior from the already-decoded final controller composition.
    pelvisPrimaryWorldMatrix: readMatrix(ram, controllerOffset + 0x230),
    ...(pelvisPrimaryCallbackAddress
      === PELVIS_PRIMARY_CURRENT_ACTOR_CALLBACK ? {
        pelvisPrimaryCallback: {
          kind: "current-actor-primary-basis",
          callbackAddress: pelvisPrimaryCallbackAddress,
          contextAddress: `0x${pelvisPrimaryCallbackContextAddress.toString(16)}`,
          ...(() => {
            const contextOffset = ramAddressOffset(
              pelvisPrimaryCallbackContextAddress,
              0x14,
            );
            if (contextOffset === null) return {};
            const installedAxisSourceAddresses = [0, 4, 8].map(
              (offset) => ram.readUInt32LE(contextOffset + offset),
            );
            const axisSourcesAtCall = installedAxisSourceAddresses.map(
              (address) => {
                const sourceOffset = ramAddressOffset(address, 0x40);
                const controllerRelativeOffset = address - controllerAddress;
                const curveIndex = RUNTIME_CURVE_OFFSETS.indexOf(
                  controllerRelativeOffset,
                );
                if (sourceOffset === null) return null;
                return {
                  address: `0x${address.toString(16)}`,
                  controllerOffset: controllerRelativeOffset,
                  curveIndex: curveIndex >= 0 ? curveIndex : null,
                  startTime: ram.readFloatLE(sourceOffset + 0x00),
                  startTangent: ram.readFloatLE(sourceOffset + 0x08),
                  startValue: ram.readFloatLE(sourceOffset + 0x0c),
                  endTime: ram.readFloatLE(sourceOffset + 0x10),
                  endTangent: ram.readFloatLE(sourceOffset + 0x14),
                  endValue: ram.readFloatLE(sourceOffset + 0x1c),
                  evaluatedValue: runtimeCurveValue(
                    ram,
                    sourceOffset,
                    slotSampleFrames[0],
                  ),
                };
              },
            );
            const blendAddress = ram.readUInt32LE(contextOffset + 0x10);
            const capturedBlendAmount = readRamFloat(ram, blendAddress);
            const forceComplete = (
              readRamUInt32(ram, PELVIS_CALLBACK_FLAGS)
              & PELVIS_CALLBACK_FORCE_COMPLETE
            ) !== 0;
            const blendAmount = forceComplete ? 1 : capturedBlendAmount;
            const currentActorModeEnabled = readRamUInt32(
              ram,
              PELVIS_CALLBACK_CURRENT_ACTOR_MODE,
            ) !== 0;
            const currentActorAddress = readRamUInt32(
              ram,
              PELVIS_CALLBACK_CURRENT_ACTOR,
            );
            const currentActorModeAddress = currentActorModeEnabled
              ? currentActorAddress + 0x88
              : null;
            const mode = currentActorModeEnabled
              ? readRamUInt32(ram, currentActorModeAddress)
              : readRamUInt32(ram, PELVIS_CALLBACK_FALLBACK_MODE);
            const blendComplete = Number.isFinite(blendAmount)
              && Math.abs(blendAmount - 1)
                <= PELVIS_CALLBACK_COMPLETE_EPSILON;
            const branch = !blendComplete
              ? "transition-fallback"
              : mode === 0
                ? "fixed-axis"
                : mode === 1
                  ? "direction-up-blend"
                  : "no-op";
            const directionBlendAddress = ram.readUInt32LE(
              contextOffset + 0x0c,
            );
            const directionBlendOffset = ramAddressOffset(
              directionBlendAddress,
              0x30,
            );
            const directionBlend = (
              branch === "direction-up-blend"
              && directionBlendOffset !== null
            ) ? (() => {
                const vector = (offset) => [0, 4, 8].map(
                  (component) => ram.readFloatLE(
                    directionBlendOffset + offset + component,
                  ),
                );
                return {
                  address: `0x${directionBlendAddress.toString(16)}`,
                  addressControllerOffset:
                    directionBlendAddress - controllerAddress,
                  currentFrame: readRamFloat(
                    ram,
                    PELVIS_CALLBACK_DIRECTION_BLEND_FRAME,
                  ),
                  blendEndFrame: readRamFloat(
                    ram,
                    PELVIS_CALLBACK_DIRECTION_BLEND_END,
                  ),
                  targetForward: vector(0x00),
                  targetUp: vector(0x0c),
                  sourceForward: vector(0x18),
                  sourceUp: vector(0x24),
                };
              })() : null;
            return {
              installedAxisSourceAddresses: installedAxisSourceAddresses.map(
                (address) => `0x${address.toString(16)}`,
              ),
              axisSourcesAtCall,
              installedAxisSourceControllerOffsets: (
                installedAxisSourceAddresses.map((address) => (
                  ramAddressOffset(address) === null
                    ? null
                    : address - controllerAddress
                ))
              ),
              blendAddress: `0x${blendAddress.toString(16)}`,
              blendAddressControllerOffset: ramAddressOffset(blendAddress)
                === null ? null : blendAddress - controllerAddress,
              capturedBlendAmount,
              forceComplete,
              effectiveBlendAmount: blendAmount,
              mode,
              modeSource: currentActorModeEnabled
                ? "current-actor+0x88"
                : "global-fallback",
              branch,
              ...(directionBlend ? { directionBlend } : {}),
              axisSourceSelection: "installed-controller-descriptors",
            };
          })(),
        },
      } : {}),
    // SH-4 FUN_8c1d4020 evaluates the three controller-13 aim curves and
    // writes the solver-consumed vector to slot-2 +0x20/+0x24/+0x28. Runtime
    // look-at behavior can replace the ordinary MOT values before this write.
    headAimVector: [0x20, 0x24, 0x28].map(
      (offset) => ram.readFloatLE(headSlotOffset + offset),
    ),
    ...(headMiddleCallback ? { headMiddleCallback } : {}),
    curveAffineCount: RUNTIME_CURVE_OFFSETS.length,
    curveAffines,
    evaluatedCurveValues,
    ...(terrainHeightAdjustments?.some(
      (value) => Math.abs(value) > 1e-6,
    ) ? {
      // Ryo's player structure embeds the compact controller at +0x500.
      // Its two foot targets at structure +0x00/+0x0c are copied from the
      // animation curves, then independently adjusted for uneven terrain
      // before FUN_8c1d14e0 solves the legs. Preserve those post-ground-query
      // inputs separately; ordinary NPC controllers do not expose this layer.
      terrainAdjustedLegTargets: [
        { controllerIndex: 6, values: [0, 4, 8].map(
          (component) => ram.readFloatLE(controllerOffset - 0x500 + component),
        ) },
        { controllerIndex: 3, values: [0, 4, 8].map(
          (component) => ram.readFloatLE(controllerOffset - 0x4f4 + component),
        ) },
      ],
      terrainHeightAdjustments,
    } : {}),
    armSolverStates,
  };
}

const args = argumentsFrom(process.argv.slice(2));
args["humans-idx"] ||= ".disc-work/shenmue2-disc1-native-npc/HUMANS.IDX";
args["humans-afs"] ||= ".disc-work/shenmue2-disc1-native-npc/HUMANS.AFS";
const controllerAddress = Number(args.controller);
const expectedActorCode = args["actor-code"] || null;
const motionId = Number(args["motion-id"]);
const fixtureStatus = args.status || "strict-native";
const exactDiscrepancy = fixtureStatus === "exact-native-discrepancy";
const curveAffinePolicy = args["curve-affine-policy"]
  || (fixtureStatus === "strict-native" ? "identity" : "any");
if (!["any", "identity", "nonidentity"].includes(curveAffinePolicy)) {
  throw new Error(`Unsupported curve-affine policy: ${curveAffinePolicy}`);
}
const bindingsDirectory = path.resolve(args["bindings-dir"]);
const motionBankPaths = {
  motion: args.motion,
  npc: args.npc || "play/assets/shenmue2-motion/NPC.MOT",
  npcTable: args["npc-table"] || "play/assets/shenmue2-motion/NPC_TBL.MOT",
};
const sequenceCache = new Map();
function sequenceForMotion(motionId) {
  if (sequenceCache.has(motionId)) return sequenceCache.get(motionId);
  const resolved = resolveShenmue2NativeMotionId(motionId);
  const bankPath = motionBankPaths[resolved?.bank];
  if (!resolved || !bankPath) {
    throw new Error(`No fixture bank for transition motion 0x${motionId.toString(16)}`);
  }
  const sequence = Shenmue2MotLoader.parse(
    fs.readFileSync(bankPath),
    { sequenceIndices: [resolved.sequenceIndex] },
  ).sequences[0];
  if (!sequence?.valid) {
    throw new Error(`Could not decode transition motion 0x${motionId.toString(16)}`);
  }
  sequenceCache.set(motionId, sequence);
  return sequence;
}

function validateNativeLayerTransition(transition) {
  const sourceSequence = sequenceForMotion(transition.sourceMotionId);
  const targetSequence = sequenceForMotion(transition.targetMotionId);
  const duration = Math.max(1, sourceSequence.durationFrames || 1);
  transition.sourceFrame = (
    (transition.sourceFrame % duration) + duration
  ) % duration;
  const source = Shenmue2MotLoader.evaluateSequence(
    sourceSequence,
    transition.sourceFrame,
  );
  const sourceVelocity = Shenmue2MotLoader.evaluateSequenceDerivatives(
    sourceSequence,
    transition.sourceFrame,
  );
  const target = Shenmue2MotLoader.evaluateSequence(targetSequence, 0);
  for (const descriptor of transition.targetCurveDescriptors) {
    const controller = Math.floor((descriptor.curveIndex - 3) / 3);
    const channel = ["rx", "ry", "rz"][(descriptor.curveIndex - 3) % 3];
    const expected = {
      startTime: 0,
      startTangent: sourceVelocity.rotations[controller][channel]
        * transition.sourceTangentScale,
      startValue: source.rotations[controller][channel],
      endTime: transition.durationFrames / 30,
      endTangent: 0,
      // The native layer installer bakes the target curve's affine into the
      // transition endpoint. RRN_L's slot-four transition proves this with
      // non-identity scale 0.9880495: every captured endpoint equals the
      // decoded NPC.MOT frame-zero value * scale + base. The source endpoint
      // and tangent remain in the source layer's coordinate space.
      endValue: (
        target.rotations[controller][channel] * descriptor.scale
        + descriptor.base
      ),
    };
    for (const field of Object.keys(expected)) {
      if (Math.abs(descriptor[field] - expected[field]) > 1e-6) {
        throw new Error(
          `Native layer transition curve ${descriptor.curveIndex} ${field} `
          + `${descriptor[field]} does not match decoded ${expected[field]}`,
        );
      }
    }
  }
}
const expectedRestProfile = shenmue2RestProfileForModelFile(
  path.resolve(args.model),
);
if (
  args["rest-profile"]
  && expectedRestProfile?.name !== args["rest-profile"]
) {
  throw new Error(
    `${args.model} resolves to ${expectedRestProfile?.name || "no profile"}, not ${args["rest-profile"]}`,
  );
}
const samples = [];
const sampleKeys = new Set();
const retainedProfileErrors = [];
let curveAffineRejectedFrameCount = 0;
const callbackPhaseRejectedFrames = [];
const humanActorCodes = shenmue2HumanActorCodes(args["humans-idx"]);
const nativeActorCodes = [
  ...humanActorCodes,
  ...SHENMUE2_SPECIAL_ACTOR_CODES,
];
const humanModelBindings = shenmue2HumanModelBindings(
  args["humans-idx"],
  args["humans-afs"],
);
const expectedModelCode = path.basename(args.model, ".CHRM");
const capturedActorCodes = new Set();
const capturedControllerAddresses = new Set();
for (const filename of fs.readdirSync(bindingsDirectory).sort()) {
  if (!filename.endsWith("-bindings.json")) continue;
  const report = JSON.parse(fs.readFileSync(
    path.join(bindingsDirectory, filename),
    "utf8",
  ));
  if (
    report.schema
      !== "new-yokosuka-shenmue2-runtime-controller-bindings-v2"
  ) continue;
  const controllers = (report.controllers || []).filter((controller) => (
    Number(controller.currentMotionIds?.[0]) === motionId
    && (
      expectedActorCode
      || Number(controller.address) === controllerAddress
    )
  ));
  for (const controller of controllers) {
  const actualControllerAddress = Number(controller.address);
  const profileMatch = nativeControllerRestProfileError(
    controller,
    expectedRestProfile,
  );
  if (
    args["rest-profile"]
    && (!profileMatch || profileMatch.relativeRmsError >= 0.03)
  ) continue;
  const ramPath = report.source?.ramPath;
  if (!ramPath || !fs.existsSync(ramPath)) continue;
  // Offline save states can stop the SH-4 between an input update and its
  // renderer-matrix write. Keep their actor/controller bindings for discovery,
  // but never compare those two scheduler phases as one native pose.
  if (!shenmue2RamSupportsPoseConformance(ramPath)) continue;
  const ram = fs.readFileSync(ramPath);
  const actorBinding = controller.actorBinding
    || shenmue2RuntimeActorBinding(
      ram,
      actualControllerAddress,
      nativeActorCodes,
    );
  if (
    expectedActorCode
    && actorBinding?.actorCode !== expectedActorCode
  ) continue;
  const specialModel = SHENMUE2_SPECIAL_MODEL_BY_ACTOR.get(
    actorBinding?.actorCode,
  );
  const exactModel = humanModelBindings.get(actorBinding?.actorCode)
    || specialModel;
  if (!exactModel) continue;
  if (exactModel.modelCode !== expectedModelCode) {
    throw new Error(
      `${args.controller} is native actor ${actorBinding.actorCode}/`
      + `${exactModel.modelCode}, not ${expectedModelCode}`,
    );
  }
  capturedActorCodes.add(actorBinding.actorCode);
  capturedControllerAddresses.add(controller.address);
  const sampleKey = `${path.resolve(ramPath)}:${controller.address}`;
  if (sampleKeys.has(sampleKey)) continue;
  sampleKeys.add(sampleKey);
  const matrices = Object.fromEntries(controller.renderBindings.map(
    ({ controllerMatrixOffset, controllerMatrix }) => [
      String(controllerMatrixOffset),
      controllerMatrix,
    ],
  ));
  if (SHENMUE2_NATIVE_REQUIRED_RENDER_POSE_OUTPUTS.some(
    ({ offset }) => !matrices[String(offset)],
  )) continue;
  const directControllerMatrixOffsets = [];
  const controllerOffset = actualControllerAddress - RAM_BASE;
  for (const offset of SHENMUE2_NATIVE_NON_RENDERED_POSE_OFFSETS) {
    if (matrices[String(offset)]) continue;
    const matrix = readMatrix(ram, controllerOffset + offset);
    if (!matrix.every(Number.isFinite)) continue;
    matrices[String(offset)] = matrix;
    directControllerMatrixOffsets.push(offset);
  }
  if (SHENMUE2_NATIVE_POSE_OUTPUTS.some(
    ({ offset }) => !matrices[String(offset)],
  )) continue;
  if (profileMatch) retainedProfileErrors.push(profileMatch.relativeRmsError);
  const slotSampleFrames = readSlotFrames(ramPath, actualControllerAddress);
  const nativeSolverInputs = readNativeSolverInputs(
    ramPath,
    actualControllerAddress,
    slotSampleFrames,
    controller.currentMotionIds.map(Number),
    actorBinding.actorCode,
  );
  for (const state of nativeSolverInputs.armSolverStates) {
    if (state.layerTransition) {
      validateNativeLayerTransition(state.layerTransition);
    }
  }
  const hasRuntimeCurveAffines = nativeSolverInputs.curveAffines.length > 0;
  if (
    (curveAffinePolicy === "identity" && hasRuntimeCurveAffines)
    || (curveAffinePolicy === "nonidentity" && !hasRuntimeCurveAffines)
  ) {
    curveAffineRejectedFrameCount += 1;
    continue;
  }
  const sample = {
    controllerAddress: `0x${actualControllerAddress.toString(16)}`,
    sourceFrame: slotSampleFrames[0],
    slotSampleFrames,
    slotMotionIds: controller.currentMotionIds.map(Number),
    nativeSolverInputs,
    rootMatrix: controller.rootMatrix,
    matrices,
    matrixProvenance: {
      renderedOffsets: controller.renderBindings.map(
        ({ controllerMatrixOffset }) => Number(controllerMatrixOffset),
      ).filter((offset, index, offsets) => offsets.indexOf(offset) === index),
      directControllerOffsets: directControllerMatrixOffsets,
    },
    source: path.basename(path.dirname(ramPath)),
  };
  const callbackPhaseErrorDegrees =
    shenmue2PelvisCallbackPhaseErrorDegrees(sample);
  if (
    callbackPhaseErrorDegrees !== null
    && callbackPhaseErrorDegrees > 0.05
  ) {
    callbackPhaseRejectedFrames.push({
      source: sample.source,
      controllerAddress: sample.controllerAddress,
      sourceFrame: sample.sourceFrame,
      errorDegrees: callbackPhaseErrorDegrees,
      callbackBranch: nativeSolverInputs.pelvisPrimaryCallback.branch,
    });
    continue;
  }
  samples.push(sample);
  }
}

if (!samples.length) {
  throw new Error(
    `No complete synchronized frames matched ${expectedActorCode ? `actor ${expectedActorCode}` : `controller ${args.controller}`}, motion ${args["motion-id"]}, and profile ${args["rest-profile"] || expectedRestProfile?.name || "unknown"}`,
  );
}
if (capturedActorCodes.size !== 1) {
  throw new Error(
    `${args.controller} did not resolve to one exact native actor/model`,
  );
}
const capturedActorCode = [...capturedActorCodes][0];
const capturedSpecialModel = SHENMUE2_SPECIAL_MODEL_BY_ACTOR.get(
  capturedActorCode,
);

const fixture = validateShenmue2AnimationFixture({
  schema: "new-yokosuka-s2-native-pose-fixture-v1",
  status: fixtureStatus,
  id: args.id || `0x${motionId.toString(16)}-${path.basename(args.model, ".CHRM").toLowerCase()}`,
  provenance: {
    kind: "Dreamcast synchronized compact-controller capture",
    controllerAddress: args.controller,
    controllerAddresses: [...capturedControllerAddresses].sort(),
    note: (
      "Controller addresses are capture-local provenance; actor/model/motion "
      + "identity selects frames across allocation changes."
    ),
    captureTiming: "synchronized-pvr-frame",
    modelBinding: {
        actorCode: capturedActorCode,
        modelCode: expectedModelCode,
        restProfile: expectedRestProfile?.name || null,
        evidence: (
          capturedSpecialModel?.evidence
          || "The live native actor record binds this controller to its exact "
          + "HUMANS actor code; HUMANS.IDX/AFS binds that code to this CHRM. "
          + "Post-solver segment lengths independently confirm its authored "
          + "rest profile."
        ),
        exactRenderedModelIdentity: "resolved",
        browserModelSelection: capturedSpecialModel
          ? "Exact captured global character model"
          : "Exact captured HUMANS model",
        maximumRelativeSegmentLengthError: retainedProfileErrors.length
          ? Math.max(...retainedProfileErrors)
          : null,
        acceptanceThreshold: 0.03,
      },
    runtimeCurveAffines: {
      policy: curveAffinePolicy,
      curveCount: RUNTIME_CURVE_OFFSETS.length,
      rejectedFrameCount: curveAffineRejectedFrameCount,
      evidence: (
        "Native runtime curves apply output = MOT sample * scale + base. "
        + "Identity-only fixtures isolate MOT decoding and procedural solvers; "
        + "non-identity captures retain transition/blend state separately."
      ),
    },
    poseMatrices: {
      requiredVisibleRendererMatrixCount:
        SHENMUE2_NATIVE_REQUIRED_RENDER_POSE_OUTPUTS.length,
      permittedDirectControllerOffsets:
        SHENMUE2_NATIVE_NON_RENDERED_POSE_OFFSETS,
      evidence: (
        "MDC7 exposes matrices only for rendered MT7 nodes. Reduced native "
        + "hierarchies omit the two invisible arm roots, so their synchronized "
        + "compact-controller outputs are read directly at +0x1690/+0x1c10; "
        + "all 17 visible solver outputs remain mandatory render bindings."
      ),
    },
    callbackPhaseCoherence: {
      maximumErrorDegrees: 0.05,
      rejectedFrameCount: callbackPhaseRejectedFrames.length,
      rejectedFrames: callbackPhaseRejectedFrames,
      evidence: (
        "A synchronized callback frame must reproduce its captured +0x230 "
        + "controller-0 intermediate from the three descriptors that the "
        + "native callback consumed. Natural same-cycle GDB/SH-4 traces stay "
        + "below 0.024 degrees; larger errors prove that RAM inputs and the "
        + "renderer matrix came from different scheduler phases. Rejected "
        + "frames remain listed here and are not used as browser failures."
      ),
    },
  },
  modelFile: path.relative(process.cwd(), path.resolve(args.model)),
  motionFile: path.relative(process.cwd(), path.resolve(args.motion)),
  motionBanks: {
    ...motionBankPaths,
  },
  motionId,
  actorScale: Number(args["actor-scale"] ?? 10),
  motionTranslationScale: Number(args["motion-translation-scale"] ?? 0.1),
  frames: samples,
  thresholds: {
    maximumPelvisPositionError: 0.000025,
    maximumPelvisOrientationErrorDegrees: 0.3,
    maximumDecodedPelvisOrientationErrorDegrees: 0.3,
    maximumHorizontalRootDrift: 0.000001,
    maximumPointError: 0.01,
    maximumOrientationErrorDegrees: 1.5,
    maximumBendErrorDegrees: 0.5,
    maximumLengthError: 0.0001,
  },
  // The strict CI command prevents the current implementation from getting
  // worse while the tighter thresholds above remain the native-equivalence
  // target. These are deliberately visible in reports, not treated as proof.
  regressionThresholds: {
    maximumPelvisPositionError: Number(
      args["regression-pelvis-position"]
        ?? (exactDiscrepancy ? 0.00005 : 0.03),
    ),
    maximumPelvisOrientationErrorDegrees: Number(
      args["regression-pelvis-orientation"]
        ?? (exactDiscrepancy ? 7.6 : 10),
    ),
    maximumDecodedPelvisOrientationErrorDegrees: Number(
      args["regression-decoded-pelvis-orientation"]
        ?? (exactDiscrepancy ? 7.6 : 10),
    ),
    maximumHorizontalRootDrift: Number(
      args["regression-horizontal-root-drift"] ?? 0.000001,
    ),
    maximumPointError: Number(
      args["regression-point"] ?? (exactDiscrepancy ? 0.04 : 0.53),
    ),
    maximumOrientationErrorDegrees: Number(
      args["regression-orientation"] ?? (exactDiscrepancy ? 8 : 181),
    ),
    maximumBendErrorDegrees: Number(
      args["regression-bend"] ?? (exactDiscrepancy ? 12.1 : 70),
    ),
    maximumLengthError: Number(
      args["regression-length"] ?? (exactDiscrepancy ? 0.0001 : 0.001),
    ),
  },
});
fs.mkdirSync(path.dirname(path.resolve(args.out)), { recursive: true });
fs.writeFileSync(args.out, `${JSON.stringify(fixture, null, 2)}\n`);
console.error(`Wrote ${samples.length} synchronized frames to ${args.out}`);
