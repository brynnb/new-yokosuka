import fs from "node:fs";
import path from "node:path";
import * as BABYLON from "@babylonjs/core";
import { Mt7Loader } from "../../src/Mt7Loader.js";
import {
  resolveShenmue2NativeMotionId,
  Shenmue2MotLoader,
  shenmue2MotionControllerIndicesForSlot,
} from "../../src/Shenmue2MotLoader.js";
import { scheduledMt7HumanoidMotionNodes } from
  "../../play/characters/ScheduledActorRuntime.js";
import { scheduledActorGroundOffset } from
  "../../play/characters/ScheduledActorRuntime.js";
import {
  applyShenmue2Mt7MotionPose,
  evaluateShenmue2Mt7ControllerPose,
  evaluateShenmue2Mt7ControllerVelocity,
  shenmue2NativeActorRelativeRotationQuaternion,
  shenmue2NativePelvisRotationQuaternion,
} from
  "../../play/characters/ScheduledActorMotionRuntime.js";

export const SHENMUE2_NATIVE_POSE_OUTPUTS = Object.freeze([
  Object.freeze({ name: "pelvis", offset: 0x3e0 }),
  Object.freeze({ name: "legAUpper", offset: 0x620 }),
  Object.freeze({ name: "legAKnee", offset: 0x660 }),
  Object.freeze({ name: "legAFoot", offset: 0x760 }),
  Object.freeze({ name: "legBUpper", offset: 0xb10 }),
  Object.freeze({ name: "legBKnee", offset: 0xb50 }),
  Object.freeze({ name: "legBFoot", offset: 0xc50 }),
  Object.freeze({ name: "torso", offset: 0x1168 }),
  Object.freeze({ name: "head", offset: 0x1508 }),
  Object.freeze({ name: "armARoot", offset: 0x1690 }),
  Object.freeze({ name: "armAShoulder", offset: 0x18c8 }),
  Object.freeze({ name: "armAElbow", offset: 0x1908 }),
  Object.freeze({ name: "armAHand", offset: 0x1980 }),
  Object.freeze({ name: "armATerminal", offset: 0x1a80 }),
  Object.freeze({ name: "armBRoot", offset: 0x1c10 }),
  Object.freeze({ name: "armBShoulder", offset: 0x1e48 }),
  Object.freeze({ name: "armBElbow", offset: 0x1e88 }),
  Object.freeze({ name: "armBHand", offset: 0x1f00 }),
  Object.freeze({ name: "armBTerminal", offset: 0x2000 }),
]);

// MDC7 binds matrices to rendered MT7 nodes. Reduced native hierarchies such
// as A06_E deliberately do not render the two intermediate arm-solver roots,
// although the compact controller still computes them at these exact offsets.
// Fixture construction reads these matrices directly from synchronized RAM;
// every visible downstream output remains required as a renderer binding.
export const SHENMUE2_NATIVE_NON_RENDERED_POSE_OFFSETS = Object.freeze([
  0x1690,
  0x1c10,
]);
const SHENMUE2_NATIVE_NON_RENDERED_POSE_OFFSET_SET = new Set(
  SHENMUE2_NATIVE_NON_RENDERED_POSE_OFFSETS,
);
export const SHENMUE2_NATIVE_REQUIRED_RENDER_POSE_OUTPUTS = Object.freeze(
  SHENMUE2_NATIVE_POSE_OUTPUTS.filter(
    ({ offset }) => !SHENMUE2_NATIVE_NON_RENDERED_POSE_OFFSET_SET.has(offset),
  ),
);

const OUTPUT_BY_OFFSET = new Map(SHENMUE2_NATIVE_POSE_OUTPUTS.map(
  (output) => [output.offset, output],
));

const LIMBS = Object.freeze({
  legA: Object.freeze(["legAUpper", "legAKnee", "legAFoot"]),
  legB: Object.freeze(["legBUpper", "legBKnee", "legBFoot"]),
  armA: Object.freeze(["armAShoulder", "armAElbow", "armAHand"]),
  armB: Object.freeze(["armBShoulder", "armBElbow", "armBHand"]),
});

function translation(matrix) {
  const values = matrix.m || matrix;
  return new BABYLON.Vector3(values[12], values[13], values[14]);
}

function bendDegrees([root, joint, target]) {
  const upper = joint.subtract(root).normalize();
  const lower = target.subtract(joint).normalize();
  return Math.acos(BABYLON.Scalar.Clamp(
    BABYLON.Vector3.Dot(upper, lower),
    -1,
    1,
  )) * 180 / Math.PI;
}

function limbMetrics(points) {
  return {
    upperLength: BABYLON.Vector3.Distance(points[0], points[1]),
    lowerLength: BABYLON.Vector3.Distance(points[1], points[2]),
    bendDegrees: bendDegrees(points),
  };
}

function maximum(values) {
  return values.length ? Math.max(...values) : 0;
}

function mean(values) {
  return values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : 0;
}

export function nativePoseByName(frame) {
  const matrices = new Map();
  for (const [rawOffset, matrix] of Object.entries(frame.matrices || {})) {
    const offset = Number(rawOffset);
    const output = OUTPUT_BY_OFFSET.get(offset);
    if (output) matrices.set(output.name, matrix);
  }
  return matrices;
}

export function nativePoseMetrics(frame) {
  const matrices = nativePoseByName(frame);
  const points = new Map([...matrices].map(([name, matrix]) => [
    name,
    translation(matrix),
  ]));
  return {
    outputCount: matrices.size,
    actorRootMatrix: BABYLON.Matrix.FromArray(frame.rootMatrix),
    pelvisPrimaryWorldMatrix:
      frame.nativeSolverInputs?.pelvisPrimaryWorldMatrix?.length === 16
        ? BABYLON.Matrix.FromArray(
            frame.nativeSolverInputs.pelvisPrimaryWorldMatrix,
          )
        : null,
    matrices: new Map([...matrices].map(([name, matrix]) => [
      name,
      BABYLON.Matrix.FromArray(matrix),
    ])),
    points,
    limbs: Object.fromEntries(Object.entries(LIMBS).map(([name, names]) => [
      name,
      limbMetrics(names.map((nodeName) => points.get(nodeName))),
    ])),
  };
}

function controllerTransforms(model) {
  return new Map((model.mt7MotionNodes || [])
    .filter(({ motionNodeIndex }) => Number.isInteger(motionNodeIndex))
    .map((entry) => [entry.motionNodeIndex, entry.transform]));
}

function absolutePosition(transform) {
  transform.computeWorldMatrix?.(true);
  return transform.getAbsolutePosition().clone();
}

function absoluteMatrix(transform) {
  return transform.computeWorldMatrix(true).clone();
}

export function browserPoseMetrics(model) {
  model.renderRoot.computeWorldMatrix?.(true);
  const controller = controllerTransforms(model);
  const legAUpper = controller.get(6);
  const legBUpper = controller.get(3);
  const legAFoot = controller.get(7);
  const legBFoot = controller.get(4);
  const transforms = new Map([
    ["pelvis", controller.get(0)],
    ["torso", controller.get(8)],
    ["head", controller.get(11)],
    // Native target controller 3 drives the authored 0x10 leg chain. The MT7
    // controller map exposes that rendered chain under controller 6.
    ["legAUpper", legAUpper],
    ["legAKnee", legAFoot.parent],
    ["legAFoot", legAFoot],
    ["legBUpper", legBUpper],
    ["legBKnee", legBFoot.parent],
    ["legBFoot", legBFoot],
    ["armARoot", controller.get(14)],
    ["armAShoulder", controller.get(15)],
    ["armAElbow", controller.get(16)],
    ["armAHand", controller.get(17)],
    ["armATerminal", (model.mt7MotionNodes || []).find((entry) => (
      entry.motionTerminal === true
      && (entry.sourceNode?.id & 0xffff) === 0xffbf
    ))?.transform],
    ["armBRoot", controller.get(18)],
    ["armBShoulder", controller.get(19)],
    ["armBElbow", controller.get(20)],
    ["armBHand", controller.get(21)],
    ["armBTerminal", (model.mt7MotionNodes || []).find((entry) => (
      entry.motionTerminal === true
      && (entry.sourceNode?.id & 0xffff) === 0xffbe
    ))?.transform],
  ]);
  for (const [name, transform] of [...transforms]) {
    if (!transform) transforms.delete(name);
  }
  const points = new Map([...transforms].map(([name, transform]) => [
    name,
    absolutePosition(transform),
  ]));
  return {
    outputCount: points.size,
    actorRootMatrix: model.renderRoot.parent.getWorldMatrix().clone(),
    logicalActorRootMatrix: model.logicalActorRootMatrix.clone(),
    horizontalRootDrift: Math.hypot(
      model.renderRoot.position.x - model.standingRenderPosition.x,
      model.renderRoot.position.z - model.standingRenderPosition.z,
    ) * (model.actorScale ?? 1),
    matrices: new Map([...transforms].map(([name, transform]) => [
      name,
      absoluteMatrix(transform),
    ])),
    points,
    limbs: Object.fromEntries(Object.entries(LIMBS).map(([name, names]) => [
      name,
      limbMetrics(names.map((nodeName) => points.get(nodeName))),
    ])),
  };
}

const REFLECT_X = BABYLON.Matrix.Scaling(-1, 1, 1);

function actorRelativeRotation(world, actorRoot, reflectX = false) {
  let relative = world.multiply(actorRoot.clone().invert());
  if (reflectX) {
    relative = REFLECT_X.multiply(relative).multiply(REFLECT_X);
  }
  const rotation = BABYLON.Quaternion.Identity();
  if (!relative.decompose(undefined, rotation, undefined)) return null;
  return rotation.normalize();
}

function rotationErrorDegrees(expected, actual) {
  if (!expected || !actual) return Number.POSITIVE_INFINITY;
  const dot = Math.min(1, Math.abs(BABYLON.Quaternion.Dot(expected, actual)));
  return 2 * Math.acos(dot) * 180 / Math.PI;
}

export function shenmue2PelvisCallbackPhaseErrorDegrees(frame) {
  const inputs = frame?.nativeSolverInputs;
  const callback = inputs?.pelvisPrimaryCallback;
  if (
    callback?.branch !== "fixed-axis"
    || callback.axisSourcesAtCall?.length !== 3
    || !inputs?.pelvisPrimaryWorldMatrix
    || !frame?.rootMatrix
  ) return null;
  const [rx, ry, rz] = callback.axisSourcesAtCall.map(
    ({ evaluatedValue }) => evaluatedValue,
  );
  if (![rx, ry, rz].every(Number.isFinite)) return null;
  return rotationErrorDegrees(
    shenmue2NativeActorRelativeRotationQuaternion(
      inputs.pelvisPrimaryWorldMatrix,
      frame.rootMatrix,
    ),
    shenmue2NativePelvisRotationQuaternion({ rx, ry, rz }),
  );
}

function actorRelativeBrowserPoint(point, pelvis) {
  return point.subtract(pelvis);
}

function pointRelativeToActorRoot(point, actorRootMatrix, reflectX = false) {
  const rootPosition = translation(actorRootMatrix);
  const rootRotation = BABYLON.Quaternion.Identity();
  actorRootMatrix.decompose(undefined, rootRotation, undefined);
  const rotationOnly = BABYLON.Matrix.Compose(
    BABYLON.Vector3.One(),
    rootRotation,
    BABYLON.Vector3.Zero(),
  );
  const relative = BABYLON.Vector3.TransformNormal(
    point.subtract(rootPosition),
    rotationOnly.invert(),
  );
  if (reflectX) relative.x = -relative.x;
  return relative;
}

function actorRelativeNativePoint(point, pelvis, actorRootMatrix) {
  const relative = point.subtract(pelvis);
  const actorRelative = BABYLON.Vector3.TransformNormal(
    relative,
    actorRootMatrix.clone().invert(),
  );
  // MT7 rendering reflects the native Dreamcast X axis in browser space.
  actorRelative.x = -actorRelative.x;
  return actorRelative;
}

function compareFrame(native, browser, sourceFrame) {
  const nativePelvis = native.points.get("pelvis");
  const browserPelvis = browser.points.get("pelvis");
  const comparableNames = [...browser.points.keys()].filter(
    (name) => native.points.has(name),
  );
  const pointErrors = Object.fromEntries(comparableNames.map((name) => {
    const expected = actorRelativeNativePoint(
      native.points.get(name),
      nativePelvis,
      native.actorRootMatrix,
    );
    const actual = actorRelativeBrowserPoint(
      browser.points.get(name),
      browserPelvis,
    );
    return [name, BABYLON.Vector3.Distance(expected, actual)];
  }));
  const orientationErrors = Object.fromEntries(comparableNames.map((name) => [
    name,
    rotationErrorDegrees(
      actorRelativeRotation(
        native.matrices.get(name),
        native.actorRootMatrix,
        true,
      ),
      actorRelativeRotation(
        browser.matrices.get(name),
        browser.actorRootMatrix,
      ),
    ),
  ]));
  const limbs = Object.fromEntries(Object.keys(LIMBS).map((name) => {
    const expected = native.limbs[name];
    const actual = browser.limbs[name];
    return [name, {
      nativeBendDegrees: expected.bendDegrees,
      browserBendDegrees: actual.bendDegrees,
      bendErrorDegrees: Math.abs(
        expected.bendDegrees - actual.bendDegrees
      ),
      nativeLengths: [expected.upperLength, expected.lowerLength],
      browserLengths: [actual.upperLength, actual.lowerLength],
      lengthErrors: [
        Math.abs(expected.upperLength - actual.upperLength),
        Math.abs(expected.lowerLength - actual.lowerLength),
      ],
    }];
  }));
  const rawNativePelvisFromRoot = pointRelativeToActorRoot(
    nativePelvis,
    native.actorRootMatrix,
    true,
  );
  // FUN_8c1d14e0 first loads the scheduled actor root, applies the compact
  // root-height curve, and saves this slot-zero intermediate at +0x230. The
  // scheduled-actor path deliberately ignores compact horizontal root curves;
  // its X/Z travel belongs to the actor root. Dreamcast world matrices near
  // coordinates 200..600 can nevertheless retain sub-millimetre X/Z residue
  // after float32 matrix operations. Comparing that residue to Babylon's
  // deliberately stationary compact root made the result depend on where the
  // actor stood in the world rather than on animation correctness.
  //
  // Remove only the captured slot-zero intermediate's horizontal residue.
  // Preserve it in the report, preserve all vertical motion, and continue to
  // gate browser horizontal drift separately. This is the exact native stage
  // boundary, not a fitted tolerance, clamp, or per-model correction.
  const nativePrimaryFromRoot = native.pelvisPrimaryWorldMatrix
    ? pointRelativeToActorRoot(
        translation(native.pelvisPrimaryWorldMatrix),
        native.actorRootMatrix,
        true,
      )
    : BABYLON.Vector3.Zero();
  const nativePelvisFromRoot = rawNativePelvisFromRoot.subtract(
    new BABYLON.Vector3(
      nativePrimaryFromRoot.x,
      0,
      nativePrimaryFromRoot.z,
    ),
  );
  const browserPelvisFromRoot = pointRelativeToActorRoot(
    browserPelvis,
    browser.logicalActorRootMatrix,
  );
  const pelvisPositionError = BABYLON.Vector3.Distance(
    nativePelvisFromRoot,
    browserPelvisFromRoot,
  );
  const pelvisOrientationErrorDegrees = rotationErrorDegrees(
    actorRelativeRotation(
      native.matrices.get("pelvis"),
      native.actorRootMatrix,
      true,
    ),
    actorRelativeRotation(
      browser.matrices.get("pelvis"),
      browser.logicalActorRootMatrix,
    ),
  );
  return {
    sourceFrame,
    nativeOutputCount: native.outputCount,
    browserOutputCount: browser.outputCount,
    pointErrors,
    orientationErrors,
    limbs,
    foundation: {
      rawNativePelvisFromRoot: rawNativePelvisFromRoot.asArray(),
      nativePrimaryFromRoot: nativePrimaryFromRoot.asArray(),
      discardedNativePrimaryHorizontalResidue: Math.hypot(
        nativePrimaryFromRoot.x,
        nativePrimaryFromRoot.z,
      ),
      nativePelvisFromRoot: nativePelvisFromRoot.asArray(),
      browserPelvisFromRoot: browserPelvisFromRoot.asArray(),
      pelvisPositionError,
      pelvisOrientationErrorDegrees,
      browserHorizontalRootDrift: browser.horizontalRootDrift,
    },
    maximumPointError: maximum(Object.values(pointErrors)),
    maximumOrientationErrorDegrees: maximum(
      Object.values(orientationErrors),
    ),
    maximumBendErrorDegrees: maximum(Object.values(limbs).map(
      ({ bendErrorDegrees }) => bendErrorDegrees,
    )),
    maximumLengthError: maximum(Object.values(limbs).flatMap(
      ({ lengthErrors }) => lengthErrors,
    )),
  };
}

export function validateShenmue2AnimationFixture(fixture) {
  if (fixture?.schema !== "new-yokosuka-s2-native-pose-fixture-v1") {
    throw new Error(`Unsupported S2 native-pose fixture: ${fixture?.schema}`);
  }
  if (!fixture.modelFile || !fixture.motionFile) {
    throw new Error("S2 native-pose fixture is missing its model or motion file");
  }
  if (!fixture.motionBanks || typeof fixture.motionBanks !== "object") {
    throw new Error("S2 native-pose fixture has no motion-bank paths");
  }
  if (!Number.isInteger(fixture.motionId) || !fixture.frames?.length) {
    throw new Error("S2 native-pose fixture has no motion ID or frames");
  }
  const callbackCoherence = fixture.provenance?.callbackPhaseCoherence;
  if (
    callbackCoherence?.maximumErrorDegrees !== 0.05
    || !Number.isInteger(callbackCoherence.rejectedFrameCount)
    || callbackCoherence.rejectedFrameCount < 0
    || !Array.isArray(callbackCoherence.rejectedFrames)
    || callbackCoherence.rejectedFrames.length
      !== callbackCoherence.rejectedFrameCount
    || callbackCoherence.rejectedFrames.some((rejected) => (
      typeof rejected.source !== "string"
      || !/^0x[0-9a-f]+$/i.test(rejected.controllerAddress || "")
      || !Number.isFinite(rejected.sourceFrame)
      || !Number.isFinite(rejected.errorDegrees)
      || rejected.errorDegrees <= callbackCoherence.maximumErrorDegrees
      || rejected.callbackBranch !== "fixed-axis"
    ))
  ) {
    throw new Error(
      "S2 native-pose fixture has invalid callback phase-coherence provenance",
    );
  }
  const expectedOffsets = SHENMUE2_NATIVE_POSE_OUTPUTS.map(
    ({ offset }) => String(offset),
  );
  const requiredRenderedOffsets = new Set(
    SHENMUE2_NATIVE_REQUIRED_RENDER_POSE_OUTPUTS.map(({ offset }) => offset),
  );
  const permittedDirectOffsets = new Set(
    SHENMUE2_NATIVE_NON_RENDERED_POSE_OFFSETS,
  );
  for (const frame of fixture.frames) {
    if (!/^0x[0-9a-f]+$/i.test(frame.controllerAddress || "")) {
      throw new Error(
        `S2 native fixture frame ${frame.sourceFrame} has no capture-local controller address`,
      );
    }
    if (!Number.isFinite(frame.sourceFrame)) {
      throw new Error("S2 native-pose fixture contains an invalid source frame");
    }
    const matrixProvenance = frame.matrixProvenance;
    if (matrixProvenance) {
      const rendered = matrixProvenance.renderedOffsets;
      const direct = matrixProvenance.directControllerOffsets;
      if (
        !Array.isArray(rendered)
        || !rendered.every(Number.isInteger)
        || !Array.isArray(direct)
        || !direct.every((offset) => permittedDirectOffsets.has(offset))
        || [...requiredRenderedOffsets].some(
          (offset) => !rendered.includes(offset),
        )
      ) {
        throw new Error(
          `S2 native fixture frame ${frame.sourceFrame} has invalid matrix provenance`,
        );
      }
      if (
        direct.length
        && (
          fixture.provenance?.poseMatrices
            ?.requiredVisibleRendererMatrixCount
            !== SHENMUE2_NATIVE_REQUIRED_RENDER_POSE_OUTPUTS.length
          || !SHENMUE2_NATIVE_NON_RENDERED_POSE_OFFSETS.every((offset) => (
            fixture.provenance.poseMatrices
              .permittedDirectControllerOffsets?.includes(offset)
          ))
        )
      ) {
        throw new Error(
          "S2 native-pose fixture has invalid direct-controller matrix provenance",
        );
      }
    }
    if (
      !Array.isArray(frame.rootMatrix)
      || frame.rootMatrix.length !== 16
      || !frame.rootMatrix.every(Number.isFinite)
    ) {
      throw new Error(`S2 native fixture frame ${frame.sourceFrame} has no actor root matrix`);
    }
    if (
      !Array.isArray(frame.slotMotionIds)
      || frame.slotMotionIds.length !== 5
      || !frame.slotMotionIds.every(Number.isInteger)
      || !Array.isArray(frame.slotSampleFrames)
      || frame.slotSampleFrames.length !== 5
      || !frame.slotSampleFrames.every(Number.isFinite)
    ) {
      throw new Error(`S2 native fixture frame ${frame.sourceFrame} has invalid slot state`);
    }
    if (
      frame.nativeSolverInputs?.headAimVector
      && (
        frame.nativeSolverInputs.headAimVector.length !== 3
        || !frame.nativeSolverInputs.headAimVector.every(Number.isFinite)
      )
    ) {
      throw new Error(`S2 native fixture frame ${frame.sourceFrame} has an invalid head aim vector`);
    }
    if (
      frame.nativeSolverInputs?.pelvisPrimaryWorldMatrix
      && (
        frame.nativeSolverInputs.pelvisPrimaryWorldMatrix.length !== 16
        || !frame.nativeSolverInputs.pelvisPrimaryWorldMatrix.every(Number.isFinite)
      )
    ) {
      throw new Error(
        `S2 native fixture frame ${frame.sourceFrame} has an invalid pelvis primary matrix`,
      );
    }
    if (
      frame.nativeSolverInputs?.pelvisRootTranslationMatrix
      && (
        frame.nativeSolverInputs.pelvisRootTranslationMatrix.length !== 16
        || !frame.nativeSolverInputs.pelvisRootTranslationMatrix.every(Number.isFinite)
      )
    ) {
      throw new Error(
        `S2 native fixture frame ${frame.sourceFrame} has an invalid pelvis root-translation matrix`,
      );
    }
    if (frame.nativeSolverInputs?.pelvisPrimaryCallback) {
      const callback = frame.nativeSolverInputs.pelvisPrimaryCallback;
      if (
        callback.kind !== "current-actor-primary-basis"
        || callback.callbackAddress !== 0x8c0e7f00
        || !/^0x[0-9a-f]+$/i.test(callback.contextAddress || "")
        || callback.installedAxisSourceAddresses?.length !== 3
        || callback.installedAxisSourceAddresses.some((address) => (
          !/^0x[0-9a-f]+$/i.test(address)
        ))
        || callback.installedAxisSourceControllerOffsets?.length !== 3
        || callback.installedAxisSourceControllerOffsets.some((offset) => (
          offset !== null && !Number.isInteger(offset)
        ))
        || callback.axisSourcesAtCall?.length !== 3
        || callback.axisSourcesAtCall.some((source) => (
          !source
          || !/^0x[0-9a-f]+$/i.test(source.address || "")
          || !Number.isInteger(source.controllerOffset)
          || !Number.isInteger(source.curveIndex)
          || ![
            source.startTime,
            source.startTangent,
            source.startValue,
            source.endTime,
            source.endTangent,
            source.endValue,
            source.evaluatedValue,
          ].every(Number.isFinite)
        ))
        || !/^0x[0-9a-f]+$/i.test(callback.blendAddress || "")
        || (
          callback.blendAddressControllerOffset !== null
          && !Number.isInteger(callback.blendAddressControllerOffset)
        )
        || !Number.isFinite(callback.capturedBlendAmount)
        || typeof callback.forceComplete !== "boolean"
        || !Number.isFinite(callback.effectiveBlendAmount)
        || !Number.isInteger(callback.mode)
        || !["current-actor+0x88", "global-fallback"].includes(
          callback.modeSource,
        )
        || ![
          "transition-fallback",
          "fixed-axis",
          "direction-up-blend",
          "no-op",
        ].includes(callback.branch)
        || (
          callback.branch === "direction-up-blend"
          && (
            !/^0x[0-9a-f]+$/i.test(
              callback.directionBlend?.address || "",
            )
            || !Number.isInteger(
              callback.directionBlend?.addressControllerOffset,
            )
            || !Number.isFinite(callback.directionBlend?.currentFrame)
            || !Number.isFinite(callback.directionBlend?.blendEndFrame)
            || callback.directionBlend.blendEndFrame <= 0
            || [
              callback.directionBlend.targetForward,
              callback.directionBlend.targetUp,
              callback.directionBlend.sourceForward,
              callback.directionBlend.sourceUp,
            ].some((vector) => (
              !Array.isArray(vector)
              || vector.length !== 3
              || !vector.every(Number.isFinite)
            ))
          )
        )
        || callback.axisSourceSelection
          !== "installed-controller-descriptors"
      ) {
        throw new Error(
          `S2 native fixture frame ${frame.sourceFrame} has an invalid pelvis primary callback`,
        );
      }
    }
    const callbackPhaseErrorDegrees =
      shenmue2PelvisCallbackPhaseErrorDegrees(frame);
    if (
      callbackPhaseErrorDegrees !== null
      && callbackPhaseErrorDegrees
        > callbackCoherence.maximumErrorDegrees
    ) {
      throw new Error(
        `S2 native fixture frame ${frame.sourceFrame} mixes callback phases: `
        + `${callbackPhaseErrorDegrees.toFixed(6)} degrees`,
      );
    }
    if (frame.nativeSolverInputs?.headMiddleCallback) {
      const callback = frame.nativeSolverInputs.headMiddleCallback;
      if (
        callback.kind !== "current-actor-direction-blend"
        || callback.callbackAddress !== 0x8c0e7a40
        || !Number.isFinite(callback.blendAmount)
        || callback.blendAmount < 0
        || callback.blendAmount > 1
        || ![0, 1].includes(callback.basisVariant)
      ) {
        throw new Error(
          `S2 native fixture frame ${frame.sourceFrame} has an invalid head middle callback`,
        );
      }
    }
    if (
      frame.nativeSolverInputs?.terrainAdjustedLegTargets
      && frame.nativeSolverInputs.terrainAdjustedLegTargets.some((target) => (
        ![3, 6].includes(target.controllerIndex)
        || !Array.isArray(target.values)
        || target.values.length !== 3
        || !target.values.every(Number.isFinite)
      ))
    ) {
      throw new Error(`S2 native fixture frame ${frame.sourceFrame} has invalid leg target vectors`);
    }
    if (
      frame.nativeSolverInputs?.curveAffines
      && (
        frame.nativeSolverInputs.curveAffineCount !== 69
        || !frame.nativeSolverInputs.curveAffines.every(({
          curveIndex,
          scale,
          base,
        }) => (
          Number.isInteger(curveIndex)
          && curveIndex >= 0
          && curveIndex < 69
          && Number.isFinite(scale)
          && Number.isFinite(base)
        ))
      )
    ) {
      throw new Error(`S2 native fixture frame ${frame.sourceFrame} has invalid runtime curve affines`);
    }
    if (
      frame.nativeSolverInputs?.evaluatedCurveValues
      && (
        frame.nativeSolverInputs.evaluatedCurveValues.length !== 69
        || !frame.nativeSolverInputs.evaluatedCurveValues.every(Number.isFinite)
      )
    ) {
      throw new Error(`S2 native fixture frame ${frame.sourceFrame} has invalid evaluated curve values`);
    }
    if (frame.nativeSolverInputs?.armSolverStates) {
      for (const state of frame.nativeSolverInputs.armSolverStates) {
        const directionBlends = [
          state.rootDirectionBlend,
          state.basisDirectionBlend,
          state.terminalDirectionBlend,
        ].filter(Boolean);
        const transition = state.layerTransition;
        if (
          ![14, 18].includes(state.controllerIndex)
          || ![0, 1].includes(state.mode)
          || !Number.isFinite(state.currentFrame)
          || !Number.isFinite(state.blendEndFrame)
          || directionBlends.some((blend) => [
            blend.targetForward,
            blend.targetUp,
            blend.sourceForward,
            blend.sourceUp,
          ].some((vector) => (
              !Array.isArray(vector)
              || vector.length !== 3
              || !vector.every(Number.isFinite)
            )))
          || (state.mode === 1 && directionBlends.length !== 3)
          || (
            state.mode === 1
            && (
              ![3, 4].includes(transition?.slot)
              || !Number.isInteger(transition.sourceMotionId)
              || !Number.isInteger(transition.targetMotionId)
              || !Number.isFinite(transition.sourceFrame)
              || transition.currentFrame !== state.currentFrame
              || transition.durationFrames !== state.blendEndFrame
              || transition.sourceTangentScale !== 0.5
              || transition.targetCurveDescriptors?.length !== 3
              || transition.targetCurveDescriptors.some((descriptor) => (
                !Number.isInteger(descriptor.curveIndex)
                || ![
                  descriptor.startTime,
                  descriptor.startTangent,
                  descriptor.startValue,
                  descriptor.endTime,
                  descriptor.endTangent,
                  descriptor.endValue,
                ].every(Number.isFinite)
              ))
            )
          )
        ) {
          throw new Error(`S2 native fixture frame ${frame.sourceFrame} has invalid arm solver mode state`);
        }
      }
    }
    for (const offset of expectedOffsets) {
      const matrix = frame.matrices?.[offset];
      if (
        !Array.isArray(matrix)
        || matrix.length !== 16
        || !matrix.every(Number.isFinite)
      ) {
        throw new Error(`S2 native fixture frame ${frame.sourceFrame} is missing matrix ${offset}`);
      }
    }
  }
  return fixture;
}

export function runShenmue2AnimationConformance(
  fixture,
  {
    repositoryRoot = process.cwd(),
    useCapturedEvaluatedCurveValues = true,
  } = {},
) {
  validateShenmue2AnimationFixture(fixture);
  const modelPath = path.resolve(repositoryRoot, fixture.modelFile);
  const sequenceCache = new Map();
  const sequenceForMotion = (motionId) => {
    if (sequenceCache.has(motionId)) return sequenceCache.get(motionId);
    const resolved = resolveShenmue2NativeMotionId(motionId);
    const bankPath = fixture.motionBanks[resolved?.bank];
    if (!resolved || !bankPath) {
      throw new Error(`Fixture does not provide bank ${resolved?.bank} for motion 0x${motionId.toString(16)}`);
    }
    const sequence = Shenmue2MotLoader.parse(
      fs.readFileSync(path.resolve(repositoryRoot, bankPath)),
      { sequenceIndices: [resolved.sequenceIndex] },
    ).sequences[0];
    if (!sequence?.valid) {
      throw new Error(`Could not decode fixture motion 0x${motionId.toString(16)}`);
    }
    sequenceCache.set(motionId, sequence);
    return sequence;
  };
  const previousLogLevels = BABYLON.Logger.LogLevels;
  BABYLON.Logger.LogLevels = BABYLON.Logger.ErrorLogLevel;
  const engine = new BABYLON.NullEngine({ renderWidth: 16, renderHeight: 16 });
  const scene = new BABYLON.Scene(engine);
  try {
    const [renderRoot] = new Mt7Loader(scene).load(fs.readFileSync(modelPath));
    const unscaledGroundOffset = scheduledActorGroundOffset(renderRoot, 0);
    const actorRoot = new BABYLON.TransformNode("conformance_actor", scene);
    renderRoot.parent = actorRoot;
    const actorScale = fixture.actorScale ?? 1;
    actorRoot.scaling.setAll(actorScale);
    actorRoot.position.y = unscaledGroundOffset * actorScale;
    actorRoot.metadata = {
      scheduledActorGroundOffset: unscaledGroundOffset * actorScale,
    };
    actorRoot.computeWorldMatrix(true);
    const logicalActorRootMatrix = actorRoot.getWorldMatrix().clone();
    logicalActorRootMatrix.setTranslation(BABYLON.Vector3.Zero());
    const model = {
      renderRoot,
      standingRenderPosition: renderRoot.position.clone(),
      mt7MotionNodes: scheduledMt7HumanoidMotionNodes(renderRoot),
      motionTranslationScale: fixture.motionTranslationScale ?? 1,
      actorScale,
      logicalActorRootMatrix,
    };
    const sequence = sequenceForMotion(fixture.motionId);
    const frames = fixture.frames.map((frame) => {
      const nativeMetrics = nativePoseMetrics(frame);
      const primarySequence = sequenceForMotion(frame.slotMotionIds[0]);
      if (!applyShenmue2Mt7MotionPose(
        model,
        primarySequence,
        frame.slotSampleFrames[0],
        {
          preserveHorizontalRoot: false,
          controllerIndices: shenmue2MotionControllerIndicesForSlot(0),
          nativeSolverInputs: frame.nativeSolverInputs ? {
            // Deliberately omit pelvisPrimaryWorldMatrix. This pass gates the
            // production controller-0 calculation against the captured
            // post-callback intermediate rather than allowing that evidence
            // input to conceal an undecoded callback.
            curveAffines: frame.nativeSolverInputs.curveAffines,
            evaluatedCurveValues: useCapturedEvaluatedCurveValues
              ? frame.nativeSolverInputs.evaluatedCurveValues
              : undefined,
            terrainAdjustedLegTargets: (
              frame.nativeSolverInputs.terrainAdjustedLegTargets
            ),
            pelvisPrimaryCallback: (
              frame.nativeSolverInputs.pelvisPrimaryCallback
            ),
          } : null,
        },
      )) {
        throw new Error(
          `Browser rejected primary motion 0x${frame.slotMotionIds[0].toString(16)} at frame ${frame.slotSampleFrames[0]}`,
        );
      }
      const decodedBrowserMetrics = browserPoseMetrics(model);
      const decodedPelvisOrientationErrorDegrees = rotationErrorDegrees(
        actorRelativeRotation(
          nativeMetrics.matrices.get("pelvis"),
          nativeMetrics.actorRootMatrix,
          true,
        ),
        actorRelativeRotation(
          decodedBrowserMetrics.matrices.get("pelvis"),
          decodedBrowserMetrics.logicalActorRootMatrix,
        ),
      );
      for (let slot = 0; slot < 5; slot += 1) {
        const slotMotionId = frame.slotMotionIds[slot];
        const slotSequence = sequenceForMotion(slotMotionId);
        const layeredState = !useCapturedEvaluatedCurveValues
          ? frame.nativeSolverInputs?.armSolverStates?.find((state) => (
              (slot === 3 || slot === 4)
              &&
              state.mode === 1
              && state.controllerIndex === (slot === 3 ? 14 : 18)
            ))
          : null;
        const transition = layeredState?.layerTransition;
        const transitionSourceFrame = transition?.sourceFrame ?? null;
        const transitionSourceSequence = layeredState
          ? sequenceForMotion(transition.sourceMotionId)
          : null;
        if (!applyShenmue2Mt7MotionPose(
          model,
          slotSequence,
          frame.slotSampleFrames[slot],
          {
            // Native +0x08 owns scheduled horizontal travel. The compact
            // root's horizontal curves must not displace the rendered rig a
            // second time when comparing a live scheduled actor.
            preserveHorizontalRoot: false,
            controllerIndices: shenmue2MotionControllerIndicesForSlot(slot),
            blendFromPose: layeredState
              ? evaluateShenmue2Mt7ControllerPose(
                  transitionSourceSequence,
                  transitionSourceFrame,
                )
              : null,
            blendFromVelocity: layeredState
              ? evaluateShenmue2Mt7ControllerVelocity(
                  transitionSourceSequence,
                  transitionSourceFrame,
                )
              : null,
            blendAmount: layeredState
              ? transition.currentFrame / transition.durationFrames
              : 1,
            blendDurationFrames: transition?.durationFrames ?? null,
            nativeSolverInputs: frame.nativeSolverInputs ? {
              pelvisPrimaryWorldMatrix: (
                frame.nativeSolverInputs.pelvisPrimaryWorldMatrix
              ),
              nativeActorRootMatrix: frame.rootMatrix,
              curveAffines: frame.nativeSolverInputs.curveAffines,
              evaluatedCurveValues: useCapturedEvaluatedCurveValues
                ? frame.nativeSolverInputs.evaluatedCurveValues
                : undefined,
              armSolverStates: frame.nativeSolverInputs.armSolverStates,
              ...(slot === 0 ? {
                terrainAdjustedLegTargets: (
                  frame.nativeSolverInputs.terrainAdjustedLegTargets
                ),
              } : {}),
              ...(slot === 2 ? {
                headAimVector: frame.nativeSolverInputs.headAimVector,
                headMiddleCallback: (
                  frame.nativeSolverInputs.headMiddleCallback
                ),
              } : {}),
            } : null,
          },
        )) {
          throw new Error(
            `Browser rejected slot ${slot} motion 0x${slotMotionId.toString(16)} at frame ${frame.slotSampleFrames[slot]}`,
          );
        }
      }
      const compared = compareFrame(
        nativeMetrics,
        browserPoseMetrics(model),
        frame.sourceFrame,
      );
      compared.foundation.decodedPelvisOrientationErrorDegrees = (
        decodedPelvisOrientationErrorDegrees
      );
      return compared;
    });
    const pointErrors = frames.flatMap((frame) => (
      Object.values(frame.pointErrors)
    ));
    const bendErrors = frames.flatMap((frame) => (
      Object.values(frame.limbs).map(({ bendErrorDegrees }) => bendErrorDegrees)
    ));
    const orientationErrors = frames.flatMap((frame) => (
      Object.values(frame.orientationErrors)
    ));
    const lengthErrors = frames.flatMap((frame) => (
      Object.values(frame.limbs).flatMap(({ lengthErrors: values }) => values)
    ));
    const pelvisPositionErrors = frames.map(
      ({ foundation }) => foundation.pelvisPositionError,
    );
    const pelvisOrientationErrors = frames.map(
      ({ foundation }) => foundation.pelvisOrientationErrorDegrees,
    );
    const decodedPelvisOrientationErrors = frames.map(
      ({ foundation }) => (
        foundation.decodedPelvisOrientationErrorDegrees
      ),
    );
    const horizontalRootDrifts = frames.map(
      ({ foundation }) => foundation.browserHorizontalRootDrift,
    );
    return {
      schema: "new-yokosuka-s2-animation-conformance-report-v1",
      fixtureId: fixture.id,
      fixtureStatus: fixture.status || "strict-native",
      curveInputMode: useCapturedEvaluatedCurveValues
        ? "captured-evaluated-values"
        : "decoded-mot-values",
      modelFile: fixture.modelFile,
      motionId: fixture.motionId,
      motionName: sequence.name,
      frameCount: frames.length,
      thresholds: fixture.thresholds,
      regressionThresholds: fixture.regressionThresholds,
      nativeSlotMotionIds: Array.from({ length: 5 }, (_, slot) => (
        [...new Set(fixture.frames.map((frame) => frame.slotMotionIds[slot]))]
      )),
      summary: {
        maximumPelvisPositionError: maximum(pelvisPositionErrors),
        meanPelvisPositionError: mean(pelvisPositionErrors),
        maximumPelvisOrientationErrorDegrees: maximum(
          pelvisOrientationErrors,
        ),
        meanPelvisOrientationErrorDegrees: mean(pelvisOrientationErrors),
        maximumDecodedPelvisOrientationErrorDegrees: maximum(
          decodedPelvisOrientationErrors,
        ),
        meanDecodedPelvisOrientationErrorDegrees: mean(
          decodedPelvisOrientationErrors,
        ),
        maximumHorizontalRootDrift: maximum(horizontalRootDrifts),
        maximumPointError: maximum(pointErrors),
        meanPointError: mean(pointErrors),
        maximumOrientationErrorDegrees: maximum(orientationErrors),
        meanOrientationErrorDegrees: mean(orientationErrors),
        maximumBendErrorDegrees: maximum(bendErrors),
        meanBendErrorDegrees: mean(bendErrors),
        maximumLengthError: maximum(lengthErrors),
        meanLengthError: mean(lengthErrors),
      },
      frames,
    };
  } finally {
    scene.dispose();
    engine.dispose();
    BABYLON.Logger.LogLevels = previousLogLevels;
  }
}

export function conformanceFailures(report, thresholds = report.thresholds) {
  thresholds ||= {};
  const failures = [];
  for (const [metric, threshold] of [
    ["maximumPelvisPositionError", thresholds.maximumPelvisPositionError],
    [
      "maximumPelvisOrientationErrorDegrees",
      thresholds.maximumPelvisOrientationErrorDegrees,
    ],
    [
      "maximumDecodedPelvisOrientationErrorDegrees",
      thresholds.maximumDecodedPelvisOrientationErrorDegrees,
    ],
    ["maximumHorizontalRootDrift", thresholds.maximumHorizontalRootDrift],
    ["maximumPointError", thresholds.maximumPointError],
    [
      "maximumOrientationErrorDegrees",
      thresholds.maximumOrientationErrorDegrees,
    ],
    ["maximumBendErrorDegrees", thresholds.maximumBendErrorDegrees],
    ["maximumLengthError", thresholds.maximumLengthError],
  ]) {
    if (
      Number.isFinite(threshold)
      && report.summary[metric] > threshold
    ) {
      failures.push({ metric, actual: report.summary[metric], threshold });
    }
  }
  return failures;
}

export function formatShenmue2ConformanceReport(report) {
  const lines = [
    `${report.fixtureId}: ${path.basename(report.modelFile)} / 0x${report.motionId.toString(16)}`,
    `  curve inputs: ${report.curveInputMode}`,
    `  ${report.frameCount} synchronized native frames`,
    `  native slots: ${report.nativeSlotMotionIds.map((ids, slot) => `${slot}=${ids.map((id) => `0x${id.toString(16)}`).join("/")}`).join(", ")}`,
    `  foundation pelvis position: max ${report.summary.maximumPelvisPositionError.toFixed(6)}, mean ${report.summary.meanPelvisPositionError.toFixed(6)}`,
    `  foundation pelvis orientation: max ${report.summary.maximumPelvisOrientationErrorDegrees.toFixed(3)}°, mean ${report.summary.meanPelvisOrientationErrorDegrees.toFixed(3)}°`,
    `  decoded pelvis orientation: max ${report.summary.maximumDecodedPelvisOrientationErrorDegrees.toFixed(3)}°, mean ${report.summary.meanDecodedPelvisOrientationErrorDegrees.toFixed(3)}°`,
    `  foundation horizontal root drift: max ${report.summary.maximumHorizontalRootDrift.toFixed(6)}`,
    `  point error: max ${report.summary.maximumPointError.toFixed(6)}, mean ${report.summary.meanPointError.toFixed(6)}`,
    `  orientation error: max ${report.summary.maximumOrientationErrorDegrees.toFixed(3)}°, mean ${report.summary.meanOrientationErrorDegrees.toFixed(3)}°`,
    `  bend error:  max ${report.summary.maximumBendErrorDegrees.toFixed(3)}°, mean ${report.summary.meanBendErrorDegrees.toFixed(3)}°`,
    `  length error: max ${report.summary.maximumLengthError.toFixed(6)}, mean ${report.summary.meanLengthError.toFixed(6)}`,
  ];
  const worstFrame = [...report.frames].sort(
    (left, right) => right.maximumBendErrorDegrees - left.maximumBendErrorDegrees,
  )[0];
  if (worstFrame) {
    const [limb, comparison] = Object.entries(worstFrame.limbs).sort(
      (left, right) => right[1].bendErrorDegrees - left[1].bendErrorDegrees,
    )[0];
    lines.push(
      `  worst bend: frame ${worstFrame.sourceFrame}, ${limb}, native ${comparison.nativeBendDegrees.toFixed(3)}° / browser ${comparison.browserBendDegrees.toFixed(3)}°`,
    );
  }
  const worstPointFrame = [...report.frames].sort(
    (left, right) => right.maximumPointError - left.maximumPointError,
  )[0];
  if (worstPointFrame) {
    const [pointName, error] = Object.entries(worstPointFrame.pointErrors).sort(
      (left, right) => right[1] - left[1],
    )[0];
    lines.push(
      `  worst point: frame ${worstPointFrame.sourceFrame}, ${pointName}, ${error.toFixed(6)}`,
    );
  }
  const worstOrientationFrame = [...report.frames].sort(
    (left, right) => (
      right.maximumOrientationErrorDegrees
      - left.maximumOrientationErrorDegrees
    ),
  )[0];
  if (worstOrientationFrame) {
    const [pointName, error] = Object.entries(
      worstOrientationFrame.orientationErrors,
    ).sort((left, right) => right[1] - left[1])[0];
    lines.push(
      `  worst orientation: frame ${worstOrientationFrame.sourceFrame}, ${pointName}, ${error.toFixed(3)}°`,
    );
  }
  for (const failure of conformanceFailures(report)) {
    lines.push(
      `  NATIVE MISMATCH ${failure.metric}: ${failure.actual.toFixed(6)} > ${failure.threshold}`,
    );
  }
  const regressions = conformanceFailures(report, report.regressionThresholds);
  for (const failure of regressions) {
    lines.push(
      `  REGRESSION ${failure.metric}: ${failure.actual.toFixed(6)} > ${failure.threshold}`,
    );
  }
  if (!conformanceFailures(report).length) lines.push("  NATIVE PASS");
  else if (!regressions.length) {
    lines.push(
      report.fixtureStatus === "exact-native-discrepancy"
        ? "  Exact native mismatch retained; no regression"
        : "  Known mismatch; no regression",
    );
  }
  return lines.join("\n");
}
