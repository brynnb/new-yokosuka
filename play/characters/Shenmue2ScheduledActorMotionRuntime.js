import * as BABYLON from "@babylonjs/core";
import {
  SHENMUE2_AREA_MOTION_BANK_FILES,
  Shenmue2MotLoader,
  resolveShenmue2NativeMotionId,
  shenmue2MotionControllerIndicesForSlot,
  shenmue2NpcLocomotionMotionId,
  shenmue2NpcProfileIdleMotionId,
} from "../../src/Shenmue2MotLoader.js";
import {
  mt7BrowserVector,
  mt7FixedTurnRadians,
  mt7SourceRotationQuaternion,
} from "../../src/Mt7Loader.js";

const MOTION_FPS = 30;
export const SHENMUE2_NATIVE_MOTION_BLEND_FRAMES = 8;
export const SHENMUE2_NATIVE_LAYER_BLEND_FRAMES = 12;
export const SHENMUE2_NATIVE_LAYER_SOURCE_TANGENT_SCALE = 0.5;
const SHENMUE2_REFLECT_X = BABYLON.Matrix.Scaling(-1, 1, 1);

function shenmue2FixedTurnRadians(radians) {
  // Slot-zero SH-4 code multiplies radians by 65536 / (2*pi), uses FTRC
  // (truncate toward zero), then feeds the low 16 bits to FSCA.
  const fixedTurn = Math.trunc(radians * 65536 / (Math.PI * 2));
  return (fixedTurn & 0xffff) * Math.PI * 2 / 65536;
}

export function shenmue2NativePelvisRotationQuaternion(rotation) {
  const z = shenmue2FixedTurnRadians(rotation.rx);
  const y = shenmue2FixedTurnRadians(rotation.ry);
  const x = shenmue2FixedTurnRadians(rotation.rz);
  // Dreamcast slot zero calls the Z, Y, then X matrix helpers at
  // 0x8c1e0040, 0x8c1dff90, and 0x8c1dfed0. MT7 rendering reflects native X,
  // so the browser-space conjugate negates the native Z/Y angles and retains
  // X. Babylon's row-vector convention expresses the native call sequence in
  // reverse matrix order; synchronized +0x228 matrices confirm X * Y * Z.
  return BABYLON.Quaternion.FromRotationMatrix(
    BABYLON.Matrix.RotationX(x)
      .multiply(BABYLON.Matrix.RotationY(-y))
      .multiply(BABYLON.Matrix.RotationZ(-z)),
  );
}

export function shenmue2NativeArmAttachmentRotationQuaternion(rotation) {
  const x = shenmue2FixedTurnRadians(rotation.rx);
  const z = shenmue2FixedTurnRadians(rotation.ry);
  const y = shenmue2FixedTurnRadians(rotation.rz);
  // After writing the visible hand at slot +0x408, FUN_8c1cf0a0 writes the
  // rendered attachment terminal at +0x508 from the elbow solver matrix.
  // The terminal consumes the same controller triplet through native X, Y,
  // and Z helpers, whose X-reflected Babylon form is Y(-rz) * Z(-ry) * X(rx).
  // This order reproduces both native attachment outputs across the retained
  // ordinary captures; no model-specific orientation is involved.
  return BABYLON.Quaternion.FromRotationMatrix(
    BABYLON.Matrix.RotationY(-y)
      .multiply(BABYLON.Matrix.RotationZ(-z))
      .multiply(BABYLON.Matrix.RotationX(x)),
  );
}

export function shenmue2NativePelvisOutputRotationQuaternion(
  controller0Rotation,
  controller1Rotation,
) {
  // FUN_8c1d14e0 saves the controller-0 intermediate at +0x228, then applies
  // controller 1's Z/Y/X triplet from descriptors +0x2d8/+0x318/+0x358 and
  // saves the renderer-consumed pelvis matrix at +0x3d8. Controller 1 already
  // contains the roughly quarter-turn authored pelvis basis, so multiplying
  // an MT7 bind quaternion afterward applies that basis twice. Synchronized
  // native matrices across ARI, SEI, SAM, and LLY profiles confirm this exact
  // reflected browser order to within 0.026 degrees.
  return shenmue2NativePelvisRotationQuaternion(
    controller0Rotation,
  ).multiply(shenmue2NativePelvisRotationQuaternion(
    controller1Rotation,
  ));
}

export function shenmue2NativeActorRelativeRotationQuaternion(
  worldMatrix,
  actorRootMatrix,
) {
  // Native solver captures are row-major Dreamcast world matrices. Remove
  // the independently captured actor root, then conjugate by MT7's X-axis
  // reflection. This is the same coordinate conversion used for every native
  // conformance output; no fitted angle or visual correction is involved.
  const relative = BABYLON.Matrix.FromArray(worldMatrix).multiply(
    BABYLON.Matrix.FromArray(actorRootMatrix).invert(),
  );
  const reflected = SHENMUE2_REFLECT_X.multiply(relative).multiply(
    SHENMUE2_REFLECT_X,
  );
  const rotation = BABYLON.Quaternion.Identity();
  if (!reflected.decompose(undefined, rotation, undefined)) return null;
  return rotation.normalize();
}

function shenmue2NativeDirectionBlendMatrix({
  currentFrame,
  blendEndFrame,
  targetForward,
  targetUp,
  sourceForward,
  sourceUp,
}) {
  // Native mode 1 in FUN_8c1d53a0 blends two direction/up pairs rather than
  // evaluating the ordinary compact Z/Y/X branch. The direction uses a
  // shortest-arc spherical blend; the up vector is linear, after which two
  // cross products rebuild an orthonormal basis. FUN_8c1cf0a0 selects this
  // path for the arm-root output when slot +0x00 is 1.
  const amount = BABYLON.Scalar.Clamp(
    currentFrame / Math.max(1e-7, blendEndFrame),
    0,
    1,
  );
  const target = BABYLON.Vector3.FromArray(targetForward).normalize();
  const source = BABYLON.Vector3.FromArray(sourceForward).normalize();
  const dot = BABYLON.Scalar.Clamp(
    BABYLON.Vector3.Dot(source, target),
    -1,
    1,
  );
  let axis = BABYLON.Vector3.Cross(source, target);
  const fullTurn = Math.trunc(
    Math.acos(dot) * 65536 / (Math.PI * 2),
  );
  const blendedTurn = Math.trunc(fullTurn * amount);
  if (axis.lengthSquared() <= 1e-12) {
    axis = BABYLON.Vector3.Cross(
      source,
      BABYLON.Vector3.FromArray(sourceUp),
    );
    if (axis.lengthSquared() <= 1e-12) axis = BABYLON.Axis.Y.clone();
  }
  axis.normalize();
  // FUN_8c1d53a0 receives the full source-to-target angle as a 16-bit turn,
  // converts that integer to float, multiplies by current/end, then truncates
  // again before applying the axis rotation. Keeping both truncations removes
  // the last 0.035-degree residual in the captured JN1 mode-one root.
  const forward = source.rotateByQuaternionToRef(
    BABYLON.Quaternion.RotationAxis(
      axis,
      blendedTurn * Math.PI * 2 / 65536,
    ),
    BABYLON.Vector3.Zero(),
  ).normalize();
  const up = BABYLON.Vector3.FromArray(sourceUp).scale(1 - amount).add(
    BABYLON.Vector3.FromArray(targetUp).scale(amount),
  ).normalize();
  const side = BABYLON.Vector3.Cross(forward, up).normalize();
  const correctedUp = BABYLON.Vector3.Cross(side, forward).normalize();
  const native = BABYLON.Matrix.FromArray([
    forward.x, correctedUp.x, side.x, 0,
    forward.y, correctedUp.y, side.y, 0,
    forward.z, correctedUp.z, side.z, 0,
    0, 0, 0, 1,
  ]);
  return native;
}

export function shenmue2NativeDirectionBlendRotationQuaternion(inputs) {
  const native = shenmue2NativeDirectionBlendMatrix(inputs);
  const browser = SHENMUE2_REFLECT_X
    .multiply(native)
    .multiply(SHENMUE2_REFLECT_X);
  const rotation = BABYLON.Quaternion.Identity();
  browser.decompose(undefined, rotation, undefined);
  return rotation.normalize();
}

export function shenmue2NativePelvisPrimaryRotationQuaternion(
  rotation,
  callback = null,
) {
  return callback?.branch === "direction-up-blend"
    ? shenmue2NativeDirectionBlendRotationQuaternion(
        callback.directionBlend,
      )
    : shenmue2NativePelvisRotationQuaternion(rotation);
}

function shenmue2NativeMatrixDirectionPair(matrix) {
  // FUN_8c1d53a0 stores the native matrix's first two columns as the forward
  // and up vectors in its transition structure.
  return {
    forward: [matrix.m[0], matrix.m[4], matrix.m[8]],
    up: [matrix.m[1], matrix.m[5], matrix.m[9]],
  };
}

function shenmue2NativeDirectionBlendFromMatrices(
  targetMatrix,
  sourceMatrix,
  amount,
) {
  const target = shenmue2NativeMatrixDirectionPair(targetMatrix);
  const source = shenmue2NativeMatrixDirectionPair(sourceMatrix);
  return shenmue2NativeDirectionBlendRotationQuaternion({
    currentFrame: amount,
    blendEndFrame: 1,
    targetForward: target.forward,
    targetUp: target.up,
    sourceForward: source.forward,
    sourceUp: source.up,
  });
}

function shenmue2NativeCompactRotationMatrix(rotation) {
  const z = shenmue2FixedTurnRadians(rotation.rx);
  const y = shenmue2FixedTurnRadians(rotation.ry);
  const x = shenmue2FixedTurnRadians(rotation.rz);
  return BABYLON.Matrix.RotationX(x)
    .multiply(BABYLON.Matrix.RotationY(y))
    .multiply(BABYLON.Matrix.RotationZ(z));
}

export function shenmue2NativeTorsoLocalMatrix({
  rootRotation,
  aimVector,
  terminalRotation,
  pelvisBasisRotationQuaternion,
  segmentLength,
}) {
  const horizontalLength = Math.hypot(aimVector.rx, aimVector.ry);
  const targetLength = Math.hypot(horizontalLength, aimVector.rz);
  if (targetLength <= 1e-7) return null;

  // Slot-1 helper 0x8c1ce200 aligns native X to controller 9 by applying a
  // Z rotation for XY followed by a Y rotation for Z. Controller 8 and 10 use
  // the same fixed-turn Z/Y/X path as slot zero. Slot 1 begins after the live
  // controller-1 pelvis basis, so its local solver basis is that basis's
  // reflected inverse—not an MT7-neutral or fitted quarter turn.
  const aim = BABYLON.Matrix.RotationY(-Math.atan2(
    aimVector.rz,
    horizontalLength,
  )).multiply(BABYLON.Matrix.RotationZ(Math.atan2(
    aimVector.ry,
    aimVector.rx,
  )));
  const browserPelvisBind = BABYLON.Matrix.Compose(
    BABYLON.Vector3.One(),
    pelvisBasisRotationQuaternion,
    BABYLON.Vector3.Zero(),
  );
  const nativeSolverBasis = SHENMUE2_REFLECT_X
    .multiply(browserPelvisBind.clone().invert())
    .multiply(SHENMUE2_REFLECT_X);
  const aimedRoot = aim
    .multiply(shenmue2NativeCompactRotationMatrix(rootRotation))
    .multiply(nativeSolverBasis);
  const nativeLocal = shenmue2NativeCompactRotationMatrix(
    terminalRotation,
  ).multiply(aimedRoot);
  nativeLocal.setTranslation(new BABYLON.Vector3(
    aimedRoot.m[0] * segmentLength,
    aimedRoot.m[1] * segmentLength,
    aimedRoot.m[2] * segmentLength,
  ));
  return SHENMUE2_REFLECT_X
    .multiply(nativeLocal)
    .multiply(SHENMUE2_REFLECT_X);
}

export function shenmue2NativeHeadLocalRotationQuaternion({
  rootRotation,
  middleRotation,
  aimVector,
  middleCallback = null,
}) {
  const horizontalLength = Math.hypot(aimVector.rx, aimVector.ry);
  const targetLength = Math.hypot(horizontalLength, aimVector.rz);
  if (targetLength <= 1e-7) return null;
  // Slot-2 FUN_8c1d4020 applies controller 11's root Z/Y/X rotation, then
  // controller 12's Z/Y/X rotation, and finally uses 0x8c1ce200 to align
  // native X to controller 13's vector. Unlike the torso solver, this path
  // starts in identity local space; no retained MT7 bind correction appears
  // between the three operations. Browser reflection converts the resulting
  // native local basis without changing that order.
  const aim = BABYLON.Matrix.RotationY(-Math.atan2(
    aimVector.rz,
    horizontalLength,
  )).multiply(BABYLON.Matrix.RotationZ(Math.atan2(
    aimVector.ry,
    aimVector.rx,
  )));
  let preAim = shenmue2NativeCompactRotationMatrix(
    middleRotation,
  ).multiply(shenmue2NativeCompactRotationMatrix(rootRotation));
  if (
    middleCallback?.kind === "current-actor-direction-blend"
    && middleCallback.blendAmount > 0
  ) {
    // Ryo's controller-12 callback FUN_8c0e7a40 first runs the ordinary
    // controller-11/12 chain, then blends that completed basis toward one of
    // two fixed native bases by controller +0x26c0. FUN_8c1d53a0 consumes the
    // current matrix columns as its source direction/up pair. This is a
    // separate authored callback path, not a corrective head offset.
    const source = shenmue2NativeMatrixDirectionPair(preAim);
    const alternateBasis = middleCallback.basisVariant !== 0;
    preAim = shenmue2NativeDirectionBlendMatrix({
      currentFrame: middleCallback.blendAmount,
      blendEndFrame: 1,
      targetForward: alternateBasis
        ? [0, Math.SQRT1_2, Math.SQRT1_2]
        : [0, 0, 1],
      targetUp: alternateBasis
        ? [0, -Math.SQRT1_2, Math.SQRT1_2]
        : [0, -1, 0],
      sourceForward: source.forward,
      sourceUp: source.up,
    });
  }
  const nativeLocal = aim.multiply(preAim);
  const browserLocal = SHENMUE2_REFLECT_X
    .multiply(nativeLocal)
    .multiply(SHENMUE2_REFLECT_X);
  const rotation = BABYLON.Quaternion.Identity();
  if (!browserLocal.decompose(undefined, rotation, undefined)) return null;
  return rotation.normalize();
}

export function shenmue2NativeHeadLocalPosition({
  rootRotation,
  neckLength,
  headOffset,
}) {
  if (![neckLength, headOffset].every(Number.isFinite)) return null;
  const rootBasis = shenmue2NativePelvisRotationQuaternion(rootRotation);
  const first = new BABYLON.Vector3(-neckLength, 0, 0);
  const second = new BABYLON.Vector3(-headOffset, 0, 0)
    .rotateByQuaternionToRef(rootBasis, BABYLON.Vector3.Zero());
  return first.add(second);
}

const SHENMUE2_CLIP_REFERENCE_POSES = new WeakMap();

// Rest-record +0x58/+0x64 and +0x80/+0x8c complete the two arm
// root/shoulder translations. The first root component is the `shoulder`
// family discriminator retained in the profile rows below (record +0x50 and
// +0x78); these are the remaining asymmetric components.
const SHENMUE2_NATIVE_ARM_PLACEMENT_BY_PROFILE = Object.freeze({
  ARI: Object.freeze([0.0450, 0.1030, -0.0450, -0.1030]),
  JOY: Object.freeze([0.0480, 0.1000, -0.0480, -0.1000]),
  MEI: Object.freeze([0.0635, 0.1020, -0.0635, -0.1020]),
  BBY: Object.freeze([0.0200, 0.0940, -0.0200, -0.0940]),
  SEI: Object.freeze([0.0220, 0.1030, -0.0220, -0.1030]),
  WON: Object.freeze([0.0260, 0.1340, -0.0260, -0.1340]),
  KMN: Object.freeze([0.0280, 0.1380, -0.0280, -0.1380]),
  SAM: Object.freeze([0.0450, 0.1580, -0.0450, -0.1580]),
  RYO: Object.freeze([0.0550, 0.1670, -0.0550, -0.1670]),
  LLY: Object.freeze([0.0560, 0.1690, -0.0560, -0.1690]),
  HGN: Object.freeze([0.0590, 0.1790, -0.0590, -0.1790]),
  TGY: Object.freeze([0.0560, 0.2740, -0.0560, -0.2740]),
  CHA: Object.freeze([0.0450, 0.1980, -0.0430, -0.1980]),
  SIN: Object.freeze([0.0450, 0.0980, -0.0450, -0.0980]),
  SYE: Object.freeze([0.0300, 0.1180, -0.0300, -0.1180]),
  YUA: Object.freeze([0.0550, 0.1400, -0.0550, -0.1400]),
});

// FUN_8c1cd380 selects one of these native rest-rig records by the model's
// IMGM family. Its copy at 0x8c1cd714 moves source +0xa0 into controller
// +0x35c, the pelvis rest displacement consumed by slot zero. The source-rig
// limb lengths below come from the same records and let an extracted CHRM be
// joined back to its family without a model-name table or visual correction.
const SHENMUE2_NATIVE_REST_PROFILES = Object.freeze([
  ["ARI", 0.1300, 0.17773, 0.2200, 0.0620, -0.1280, 0.077, 0.37553, 0.34694, 0.37554, 0.34694, 0.25645, 0.17052, 0.1600, 0.25647, 0.17052, 0.25645, 0.21214, 0.25647, 0.21211, 0.0420, 0.0420],
  ["JOY", 0.1620, 0.09072, 0.2330, 0.0500, -0.1630, 0.078, 0.36999, 0.47556, 0.36999, 0.47556, 0.22596, 0.19200, 0.1860, 0.22596, 0.19200, 0.22596, 0.25717, 0.22596, 0.25717, 0.0650, 0.0650],
  ["MEI", 0.1179, 0.22578, 0.1939, 0.0854, -0.1109, 0.078, 0.36123, 0.39719, 0.36123, 0.39719, 0.23345, 0.17500, 0.1598, 0.23345, 0.17500, 0.23345, 0.22958, 0.23345, 0.22959, 0.0545, 0.0545],
  ["BBY", 0.0700, 0.12566, 0.1560, 0.0470, -0.0830, 0.046, 0.15878, 0.16811, 0.15878, 0.16812, 0.14377, 0.10634, 0.1140, 0.14377, 0.10633, 0.14377, 0.15207, 0.14377, 0.15206, 0.0450, 0.0450],
  ["SEI", 0.1020, 0.13437, 0.1591, 0.0580, -0.1170, 0.056, 0.22975, 0.24326, 0.22976, 0.24327, 0.20225, 0.10300, 0.1131, 0.20225, 0.10300, 0.20225, 0.17711, 0.20225, 0.17710, 0.0741, 0.0741],
  ["WON", 0.0985, 0.15536, 0.1652, 0.0747, -0.0985, 0.064, 0.30370, 0.32478, 0.30370, 0.32478, 0.22825, 0.12230, 0.1308, 0.22825, 0.12230, 0.22825, 0.17887, 0.22825, 0.17887, 0.0565, 0.0565],
  ["KMN", 0.1007, 0.20940, 0.2339, 0.0530, -0.1017, 0.081, 0.35295, 0.32548, 0.35296, 0.32547, 0.27360, 0.13000, 0.1909, 0.27360, 0.13000, 0.27360, 0.24127, 0.27360, 0.24127, 0.1112, 0.1112],
  ["SAM", 0.1700, 0.16685, 0.24501, 0.0730, -0.1700, 0.081, 0.40565, 0.35694, 0.40565, 0.35694, 0.27797, 0.22954, 0.18201, 0.27803, 0.22943, 0.27797, 0.22923, 0.27803, 0.22917, 0.0000, 0.0000],
  ["RYO", 0.1890, 0.16654, 0.2105, 0.0570, -0.1890, 0.091, 0.41669, 0.42432, 0.41669, 0.42433, 0.28117, 0.19200, 0.1495, 0.28117, 0.19200, 0.28117, 0.24667, 0.28117, 0.24666, 0.0548, 0.0548],
  ["LLY", 0.1339, 0.19336, 0.2526, 0.0850, -0.1609, 0.092, 0.41400, 0.40469, 0.41400, 0.40470, 0.30914, 0.19081, 0.1946, 0.30914, 0.19081, 0.30914, 0.23562, 0.30914, 0.23623, 0.0448, 0.0448],
  ["HGN", 0.1101, 0.22650, 0.2800, 0.0910, -0.1390, 0.097, 0.44092, 0.43866, 0.44091, 0.43866, 0.32923, 0.20322, 0.2180, 0.32924, 0.20322, 0.32923, 0.25093, 0.32924, 0.25159, 0.0480, 0.0480],
  ["TGY", 0.1600, 0.20862, 0.3690, 0.0820, -0.1600, 0.180, 0.49690, 0.47418, 0.49690, 0.47417, 0.36919, 0.24500, 0.2970, 0.36927, 0.24500, 0.36919, 0.30445, 0.36927, 0.30437, 0.0590, 0.0590],
  ["CHA", 0.1941, 0.21793, 0.2010, 0.0500, -0.1310, 0.100, 0.39013, 0.42339, 0.39013, 0.42339, 0.29344, 0.16745, 0.1290, 0.29351, 0.16733, 0.29344, 0.24198, 0.29351, 0.24192, 0.0745, 0.0745],
  ["SIN", 0.1850, 0.18619, 0.1510, 0.0549, -0.1250, 0.062, 0.38120, 0.39855, 0.38119, 0.39855, 0.25133, 0.16710, 0.1280, 0.25134, 0.16710, 0.25133, 0.20789, 0.25134, 0.20787, 0.0407, 0.0407],
  ["SYE", 0.1620, 0.09467, 0.2423, 0.0520, -0.1630, 0.071, 0.38743, 0.47502, 0.38742, 0.47504, 0.26337, 0.19968, 0.1930, 0.26337, 0.19968, 0.26337, 0.23908, 0.26337, 0.23909, 0.0394, 0.0394],
  ["YUA", 0.1099, 0.18513, 0.2710, 0.0687, -0.1099, 0.091, 0.41669, 0.42432, 0.41669, 0.42433, 0.28117, 0.19200, 0.2100, 0.28117, 0.19200, 0.28117, 0.24667, 0.28117, 0.24666, 0.0548, 0.0548],
].map(([
  name,
  pelvisRest,
  torsoSegment,
  neckLength,
  headOffset,
  legRootY,
  legRootZ,
  legUpper,
  legLower,
  mirroredLegUpper,
  mirroredLegLower,
  armUpper,
  armLower,
  shoulder,
  mirroredArmUpper,
  mirroredArmLower,
  armSolverUpper,
  armSolverLower,
  mirroredArmSolverUpper,
  mirroredArmSolverLower,
  armAttachmentLength,
  mirroredArmAttachmentLength,
]) => Object.freeze({
  name,
  pelvisRest,
  torsoSegment,
  neckLength,
  headOffset,
  legRootY,
  legRootZ,
  mirroredArmUpper,
  mirroredArmLower,
  armUpper,
  armLower,
  armSolverUpper,
  armSolverLower,
  mirroredArmSolverUpper,
  mirroredArmSolverLower,
  armAttachmentLength,
  mirroredArmAttachmentLength,
  armRootX: shoulder,
  armRootZ: SHENMUE2_NATIVE_ARM_PLACEMENT_BY_PROFILE[name][0],
  armShoulderZ: SHENMUE2_NATIVE_ARM_PLACEMENT_BY_PROFILE[name][1],
  mirroredArmRootZ: SHENMUE2_NATIVE_ARM_PLACEMENT_BY_PROFILE[name][2],
  mirroredArmShoulderZ: SHENMUE2_NATIVE_ARM_PLACEMENT_BY_PROFILE[name][3],
  mirroredLegUpper,
  mirroredLegLower,
  features: Object.freeze([
    legUpper,
    legLower,
    armUpper,
    armLower,
    shoulder,
  ]),
})));

export function shenmue2NativeRestProfileForNodes(nodes) {
  const byId = new Map();
  for (const entry of nodes || []) {
    const id = entry?.sourceNode?.id & 0xffff;
    if (!byId.has(id)) byId.set(id, entry.sourceNode);
  }
  const features = [0x11, 0x12, 0x06, 0x07, 0x05].map((id) => (
    Math.abs(Number(byId.get(id)?.position?.[0]))
  ));
  const root = (nodes || []).find((entry) => (
    !entry?.sourceNode?.parentOffset
  ))?.sourceNode || (nodes || [])[0]?.modelFamilySourceNode;
  const modelFamily = ((Number(root?.id) & 0xff) - 1) >>> 0;
  // The model runtime stores the MT7 root's low-byte family minus one at
  // object-data +0x14. SH-4 0x8c0b8ba0 reads that word; 0x8c0f92c0 then uses
  // it to index the byte table at 0x8c24f05c before passing the result to
  // FUN_8c1cd380. The 97-byte table contains three 0..17 banks, saturates the
  // unused tail of each bank to 17, and maps its final entry to record 4.
  // Current humanoid CHRM roots resolve to records 0..15. This authored
  // selector is authoritative; nearest limb dimensions are diagnostics only.
  const bankIndex = modelFamily % 32;
  const restRecordIndex = modelFamily === 96
    ? 4
    : modelFamily <= 95 ? Math.min(bankIndex, 17) : null;
  const profile = Number.isInteger(restRecordIndex)
    ? SHENMUE2_NATIVE_REST_PROFILES[restRecordIndex]
    : null;
  if (!profile || !features.every(Number.isFinite)) return null;
  const error = features.reduce((sum, value, index) => {
    const scale = Math.max(0.05, profile.features[index]);
    return sum + ((value - profile.features[index]) / scale) ** 2;
  }, 0);
  return {
    ...profile,
    error,
    modelFamily,
    restRecordIndex,
    selectorSource: "MT7 root family -> SH-4 table 0x8c24f05c",
  };
}

const SHENMUE2_ARM_SOLVERS = Object.freeze([
  Object.freeze({
    rootId: 0x09,
    upperId: 0x05,
    lowerId: 0x06,
    targetId: 0x07,
    rootController: 14,
    basisController: 15,
    targetController: 16,
    terminalController: 17,
    attachmentId: 0xffbf,
    reverseBend: false,
  }),
  Object.freeze({
    rootId: 0x04,
    upperId: 0x0a,
    lowerId: 0x0b,
    targetId: 0x0c,
    rootController: 18,
    basisController: 19,
    targetController: 20,
    terminalController: 21,
    attachmentId: 0xffbe,
    reverseBend: false,
  }),
]);

const SHENMUE2_LEG_SOLVERS = Object.freeze([
  Object.freeze({
    upperController: 6,
    targetNodeController: 7,
    basisController: 2,
    targetController: 3,
    terminalController: 4,
  }),
  Object.freeze({
    upperController: 3,
    targetNodeController: 4,
    basisController: 5,
    targetController: 6,
    terminalController: 7,
  }),
]);

function safeProjectedNormal(direction, hint) {
  const projected = hint.subtract(direction.scale(
    BABYLON.Vector3.Dot(hint, direction),
  ));
  if (projected.lengthSquared() > 1e-10) return projected.normalize();
  for (const fallback of [BABYLON.Axis.Z, BABYLON.Axis.Y, BABYLON.Axis.X]) {
    const candidate = fallback.subtract(direction.scale(
      BABYLON.Vector3.Dot(fallback, direction),
    ));
    if (candidate.lengthSquared() > 1e-10) return candidate.normalize();
  }
  return BABYLON.Axis.Z.clone();
}
function reflectedNativeCross(left, right) {
  // For reflection F, cross(Fa, Fb) = -F(cross(a, b)). Reversing the operands
  // returns F(cross(a, b)), which is the native result expressed in MT7's
  // X-reflected browser space.
  return BABYLON.Vector3.Cross(right, left);
}

export function solveShenmue2TwoBonePositions(
  rootPosition,
  targetPosition,
  upperLength,
  lowerLength,
  planeHint,
  { reverseBend = false } = {},
) {
  const targetDelta = targetPosition.subtract(rootPosition);
  const targetDistance = Math.max(1e-7, targetDelta.length());
  const direction = targetDelta.scale(1 / targetDistance);
  const planeNormal = safeProjectedNormal(direction, planeHint);
  const along = Math.max(-upperLength, Math.min(
    upperLength,
    (
      upperLength * upperLength
      + targetDistance * targetDistance
      - lowerLength * lowerLength
    ) / (2 * targetDistance),
  ));
  const height = Math.sqrt(Math.max(
    0,
    upperLength * upperLength - along * along,
  ));
  // The native arm subtype bends along cross(direction, planeNormal), while
  // the leg subtype uses the opposite order. MT7 is reflected across X when
  // loaded into Babylon, and a reflection reverses cross-product handedness.
  // Reversing the operands produces the reflected native arm bend; the leg
  // therefore uses the ordinary browser-space order below.
  const bendDirection = (
    reverseBend
      ? BABYLON.Vector3.Cross(direction, planeNormal)
      : reflectedNativeCross(direction, planeNormal)
  ).normalize();
  const jointPosition = rootPosition
    .add(direction.scale(along))
    .add(bendDirection.scale(height));
  return {
    jointPosition,
    targetPosition,
    planeNormal,
  };
}

function xForwardMatrix(direction, planeNormal, position) {
  const forward = direction.normalizeToNew();
  const normal = safeProjectedNormal(forward, planeNormal);
  const middle = BABYLON.Vector3.Cross(normal, forward).normalize();
  return BABYLON.Matrix.FromArray([
    forward.x, forward.y, forward.z, 0,
    middle.x, middle.y, middle.z, 0,
    normal.x, normal.y, normal.z, 0,
    position.x, position.y, position.z, 1,
  ]);
}

function rotationFromRelativeMatrices(world, parentWorld) {
  const local = world.multiply(parentWorld.clone().invert());
  const rotation = BABYLON.Quaternion.Identity();
  local.decompose(undefined, rotation, undefined);
  return rotation.normalize();
}

export function compactTargetDeltaBrowser(
  rotation,
  scale = 1,
) {
  // SH-4 evaluates the target triplet directly as native XYZ, then transforms
  // it through the animated arm basis. MT7's browser conversion reflects X.
  // Both arm slots use this same mapping; bilateral behavior comes from their
  // model-specific shoulder offsets and basis curves.
  return new BABYLON.Vector3(
    -rotation.rx * scale,
    rotation.ry * scale,
    rotation.rz * scale,
  );
}

export function compactLegTargetDeltaBrowser(
  target,
  rootPosition,
  scale = 1,
) {
  // Unlike the arm solver's permuted target triplet, the native leg target is
  // an absolute actor-space foot position. The browser rig evaluates its IK
  // relative to the pelvis, so remove the complete compact root position.
  // MT7's browser conversion also reflects X.
  return new BABYLON.Vector3(
    -(target.rx - rootPosition.x) * scale,
    (target.ry - rootPosition.y) * scale,
    (target.rz - rootPosition.z) * scale,
  );
}

export function compactLegTargetPositionBrowser(
  target,
  rootPosition,
  scale = 1,
) {
  // SH-4 stores the solved foot target at slot-relative +0x5d4/+0xac4 as an
  // absolute actor-space position. Horizontal locomotion belongs to +0x08,
  // so X/Z remove the compact root translation; Y remains absolute from the
  // actor's ground anchor. MT7's browser conversion reflects X.
  return new BABYLON.Vector3(
    -(target.rx - rootPosition.x) * scale,
    target.ry * scale,
    (target.rz - rootPosition.z) * scale,
  );
}

export function shenmue2NativeLegReach(
  sequence,
  nativeRestProfile,
  mirrored = false,
) {
  if (sequence?.name !== "MOTION_MOT") return null;
  const [upper, lower] = mirrored
    ? [
        nativeRestProfile?.mirroredLegUpper,
        nativeRestProfile?.mirroredLegLower,
      ]
    : nativeRestProfile?.features || [];
  // FUN_8c1cd380 copies the two authored leg lengths from the active compact
  // controller's rest record. They belong to the actor body profile, not to
  // the farthest target reached by a particular motion. Inferring reach from
  // a clip that never fully extends its leg shrinks every target (0xf0e6 is
  // the retained counterexample). HUMANS rest-profile lengths independently
  // match the synchronized native solver matrices.
  return Number.isFinite(upper) && Number.isFinite(lower)
    ? upper + lower
    : null;
}

function blendedControllerRotation(
  sampled,
  previous,
  controller,
  amount,
  previousVelocity = null,
  durationFrames = null,
) {
  const target = sampled.rotations[controller];
  const source = previous?.rotations?.[controller];
  if (!source || amount >= 1) return target;
  const velocity = previousVelocity?.rotations?.[controller];
  if (velocity && Number.isFinite(durationFrames)) {
    const durationSeconds = durationFrames / MOTION_FPS;
    const t2 = amount * amount;
    const t3 = t2 * amount;
    const sourceWeight = 2 * t3 - 3 * t2 + 1;
    const tangentWeight = t3 - 2 * t2 + amount;
    const targetWeight = -2 * t3 + 3 * t2;
    return Object.fromEntries(["rx", "ry", "rz"].map((channel) => [
      channel,
      sourceWeight * source[channel]
        + tangentWeight
          * durationSeconds
          * velocity[channel]
          * SHENMUE2_NATIVE_LAYER_SOURCE_TANGENT_SCALE
        + targetWeight * target[channel],
    ]));
  }
  return {
    rx: source.rx + (target.rx - source.rx) * amount,
    ry: source.ry + (target.ry - source.ry) * amount,
    rz: source.rz + (target.rz - source.rz) * amount,
  };
}

function blendedRootPosition(sampled, previous, amount) {
  const target = sampled.rootPosition;
  const source = previous?.rootPosition;
  if (!source || amount >= 1) return target;
  return {
    x: source.x + (target.x - source.x) * amount,
    y: source.y + (target.y - source.y) * amount,
    z: source.z + (target.z - source.z) * amount,
  };
}

function initializeShenmue2ArmSolvers(model) {
  if (model.shenmue2ArmSolvers) return model.shenmue2ArmSolvers;
  if (!model.renderRoot?.getWorldMatrix) return null;
  model.renderRoot.computeWorldMatrix?.(true);
  const byController = new Map((model.mt7MotionNodes || [])
    .filter(({ motionNodeIndex }) => Number.isInteger(motionNodeIndex))
    .map((entry) => [entry.motionNodeIndex, entry]));
  const byOffset = new Map((model.mt7MotionNodes || []).map((entry) => [
    entry.sourceNode?.offset,
    entry,
  ]));
  const solvers = SHENMUE2_ARM_SOLVERS.map((definition) => {
    // Controller-index bindings already include the authored parent context
    // used to disambiguate repeated/signed MT7 IDs. Looking up a bare node ID
    // here can select a clothing or terminal duplicate from some families.
    const root = byController.get(definition.rootController)?.transform;
    const basisEntry = byController.get(definition.basisController);
    const upper = basisEntry?.transform;
    const lower = byController.get(definition.targetController)?.transform;
    const target = byController.get(definition.terminalController)?.transform;
    const attachment = (model.mt7MotionNodes || []).find((entry) => (
      entry.motionTerminal === true
      && (entry.sourceNode?.id & 0xffff) === definition.attachmentId
      && (byOffset.get(entry.sourceNode?.parentOffset)?.sourceNode?.id & 0xffff)
        === definition.targetId
    ))?.transform;
    if (![root, upper, lower, target, attachment].every(Boolean)) return null;
    return {
      ...definition,
      root,
      upper,
      lower,
      target,
      attachment,
    };
  }).filter(Boolean);
  model.shenmue2ArmSolvers = solvers;
  return solvers;
}

function initializeShenmue2TorsoSolver(model) {
  if (model.shenmue2TorsoSolver) return model.shenmue2TorsoSolver;
  const byController = new Map((model.mt7MotionNodes || [])
    .filter(({ motionNodeIndex }) => Number.isInteger(motionNodeIndex))
    .map((entry) => [entry.motionNodeIndex, entry]));
  const torso = byController.get(8);
  if (
    !torso?.motionBindPosition
    || !torso.transform
  ) return null;
  model.shenmue2TorsoSolver = {
    transform: torso.transform,
    segmentLength: model.shenmue2NativeRestProfile?.torsoSegment
      ?? torso.motionBindPosition.length(),
  };
  return model.shenmue2TorsoSolver;
}

function applyShenmue2HeadSolver(
  model,
  sampled,
  {
    selectedControllers,
    blendFromPose,
    blendAmount,
    nativeSolverInputs,
  },
) {
  if (selectedControllers && !selectedControllers.has(11)) return false;
  const head = (model.mt7MotionNodes || []).find(
    ({ motionNodeIndex }) => motionNodeIndex === 11,
  )?.transform;
  if (!head) return false;
  const controller = (index) => blendedControllerRotation(
    { rotations: sampled.absoluteRotations },
    blendFromPose?.absoluteRotations
      ? { rotations: blendFromPose.absoluteRotations }
      : null,
    index,
    blendAmount,
  );
  const rotation = shenmue2NativeHeadLocalRotationQuaternion({
    rootRotation: controller(11),
    middleRotation: controller(12),
    aimVector: controller(13),
    middleCallback: nativeSolverInputs?.headMiddleCallback || null,
  });
  if (!rotation) return false;
  const profile = model.shenmue2NativeRestProfile;
  if (
    Number.isFinite(profile?.neckLength)
    && Number.isFinite(profile?.headOffset)
  ) {
    // FUN_8c1d4020 does not place the head at one static MDC7 attachment.
    // It translates by rest-record +0x14, applies controller 11, and only
    // then translates by rest-record +0x28.  The second segment therefore
    // follows the animated neck basis.  This is visible in JJ3: a turned
    // controller 11 changes both the length and lateral component of the
    // final torso-to-head vector even though both authored lengths are fixed.
    const position = shenmue2NativeHeadLocalPosition({
      rootRotation: controller(11),
      neckLength: profile.neckLength,
      headOffset: profile.headOffset,
    });
    head.position.set(position.x, position.y, position.z);
  }
  head.rotationQuaternion = rotation;
  head.computeWorldMatrix?.(true);
  return true;
}

function initializeShenmue2LegSolvers(model) {
  if (model.shenmue2LegSolvers) return model.shenmue2LegSolvers;
  if (!model.renderRoot?.getWorldMatrix) return null;
  model.renderRoot.computeWorldMatrix?.(true);
  const byController = new Map((model.mt7MotionNodes || [])
    .filter(({ motionNodeIndex }) => Number.isInteger(motionNodeIndex))
    .map((entry) => [entry.motionNodeIndex, entry]));
  const inverseModel = model.renderRoot.getWorldMatrix().clone().invert();
  const solvers = SHENMUE2_LEG_SOLVERS.map((definition) => {
    // Resolve both ends by controller context and recover the derived knee
    // from the authored chain between them. Bare MT7 IDs can repeat in
    // optional clothing branches on otherwise valid character families.
    const upper = byController.get(definition.upperController)?.transform;
    const target = byController.get(
      definition.targetNodeController,
    )?.transform;
    const lower = target?.parent;
    const root = upper?.parent;
    if (
      ![root, upper, lower, target].every(Boolean)
      || lower.parent !== upper
    ) return null;
    const bindTargetModel = BABYLON.Vector3.TransformCoordinates(
      target.getAbsolutePosition(),
      inverseModel,
    );
    const bindUpperModel = BABYLON.Vector3.TransformCoordinates(
      upper.getAbsolutePosition(),
      inverseModel,
    );
    const bindLowerModel = BABYLON.Vector3.TransformCoordinates(
      lower.getAbsolutePosition(),
      inverseModel,
    );
    const bindReachModel = BABYLON.Vector3.Distance(
      bindUpperModel,
      bindLowerModel,
    ) + BABYLON.Vector3.Distance(bindLowerModel, bindTargetModel);
    return {
      ...definition,
      root,
      upper,
      lower,
      target,
      bindUpperModel,
      bindTargetModel,
      bindReachModel,
    };
  }).filter(Boolean);
  model.shenmue2LegSolvers = solvers;
  return solvers;
}

function applyShenmue2ArmSolvers(
  model,
  sampled,
  {
    selectedControllers,
    blendFromPose,
    blendAmount,
    blendFromVelocity,
    blendDurationFrames,
    nativeSolverInputs,
  },
) {
  const solvers = initializeShenmue2ArmSolvers(model);
  if (!solvers?.length) return false;
  model.renderRoot.computeWorldMatrix?.(true);
  let applied = false;
  for (const solver of solvers) {
    if (
      selectedControllers
      && !selectedControllers.has(solver.targetController)
    ) continue;
    const rootInput = blendedControllerRotation(
      { rotations: sampled.absoluteRotations },
      blendFromPose?.absoluteRotations
        ? { rotations: blendFromPose.absoluteRotations }
        : null,
      solver.rootController,
      blendAmount,
    );
    // FUN_8c1cf0a0 applies each slot's first Z/Y/X triplet before saving the
    // arm-root output at +0x118. Most retained locomotion frames happen to
    // leave this triplet at identity, but independently layered slot-4 motion
    // 0x80c3 proves it is live: omitting it rotates JN1's entire second arm by
    // 2.4--5.4 degrees while its two-bone lengths and bend remain exact.
    const solverState = nativeSolverInputs?.armSolverStates?.find(
      ({ controllerIndex }) => controllerIndex === solver.rootController,
    );
    const previousRootInput = blendFromPose?.absoluteRotations?.[
      solver.rootController
    ];
    solver.root.rotationQuaternion = solverState?.mode === 1
      ? shenmue2NativeDirectionBlendRotationQuaternion({
          ...solverState,
          ...solverState.rootDirectionBlend,
        })
      : previousRootInput && blendAmount < 1
        ? shenmue2NativeDirectionBlendFromMatrices(
            shenmue2NativeCompactRotationMatrix(
              sampled.absoluteRotations[solver.rootController],
            ),
            shenmue2NativeCompactRotationMatrix(previousRootInput),
            blendAmount,
          )
      : shenmue2NativePelvisRotationQuaternion(rootInput);
    solver.root.computeWorldMatrix?.(true);
    solver.upper.computeWorldMatrix?.(true);
    solver.lower.computeWorldMatrix?.(true);
    solver.target.computeWorldMatrix?.(true);
    const targetInput = blendedControllerRotation(
      { rotations: sampled.absoluteRotations },
      blendFromPose?.absoluteRotations
        ? { rotations: blendFromPose.absoluteRotations }
        : null,
      solver.targetController,
      blendAmount,
      blendFromVelocity?.absoluteRotations
        ? { rotations: blendFromVelocity.absoluteRotations }
        : null,
      blendDurationFrames,
    );
    const terminalInput = blendedControllerRotation(
      { rotations: sampled.absoluteRotations },
      blendFromPose?.absoluteRotations
        ? { rotations: blendFromPose.absoluteRotations }
        : null,
      solver.terminalController,
      blendAmount,
    );
    const shoulderWorld = solver.upper.getAbsolutePosition();
    const elbowWorld = solver.lower.getAbsolutePosition();
    const handWorld = solver.target.getAbsolutePosition();
    const profile = model.shenmue2NativeRestProfile;
    const upperLength = solver.rootController === 14
      ? profile?.armSolverUpper
      : profile?.mirroredArmSolverUpper;
    const lowerLength = solver.rootController === 14
      ? profile?.armSolverLower
      : profile?.mirroredArmSolverLower;
    // Native FUN_8c1cf0a0 solves to the terminal matrix at slot +0x508.
    // The extracted controller-17/21 transform is the intermediate hand
    // attachment at +0x408, so measuring elbow-to-hand here shortens SEI's
    // second solver segment from 0.17711 to 0.103 and falsely makes ordinary
    // compact targets unreachable. FUN_8c1cd380 copies the actual solver
    // lengths from rest-record +0x68/+0x6c and +0x90/+0x94.
    const resolvedUpperLength = upperLength
      ?? BABYLON.Vector3.Distance(shoulderWorld, elbowWorld);
    const resolvedLowerLength = lowerLength
      ?? BABYLON.Vector3.Distance(elbowWorld, handWorld);
    if (resolvedUpperLength <= 1e-7 || resolvedLowerLength <= 1e-7) continue;
    const rootWorld = solver.root.getWorldMatrix();
    const basisInput = blendedControllerRotation(
      { rotations: sampled.absoluteRotations },
      blendFromPose?.absoluteRotations
        ? { rotations: blendFromPose.absoluteRotations }
        : null,
      solver.basisController,
      blendAmount,
    );
    const basisRotation = solverState?.mode === 1
      ? shenmue2NativeDirectionBlendRotationQuaternion({
          ...solverState,
          ...solverState.basisDirectionBlend,
        })
      : blendFromPose?.absoluteRotations?.[solver.basisController]
          && blendAmount < 1
        ? shenmue2NativeDirectionBlendFromMatrices(
            shenmue2NativeCompactRotationMatrix(
              sampled.absoluteRotations[solver.basisController],
            ),
            shenmue2NativeCompactRotationMatrix(
              blendFromPose.absoluteRotations[solver.basisController],
            ),
            blendAmount,
          )
      : shenmue2NativePelvisRotationQuaternion(basisInput);
    const basisLocal = BABYLON.Matrix.Compose(
      BABYLON.Vector3.One(),
      basisRotation,
      BABYLON.Vector3.Zero(),
    );
    const basisWorld = basisLocal.multiply(rootWorld);
    // Controller 16/20 is a vector in the animated two-bone basis, measured
    // from the shoulder. The earlier browser path treated it as an absolute
    // actor-space position, added the static hand position, and used the
    // basis only as an elbow-plane hint. That pushed one arm past full reach
    // throughout ordinary walks. SH-4 passes the absolute compact XYZ vector
    // through the animated root/basis matrices without normalizing it to the
    // clip's largest target. Compact samples are already in native units; the
    // old reach normalization and 0.8339 factor were browser compensation.
    const targetWorld = shoulderWorld.add(BABYLON.Vector3.TransformNormal(
      compactTargetDeltaBrowser(
        targetInput,
        1,
      ),
      basisWorld,
    ));
    const planeHint = BABYLON.Vector3.TransformNormal(
      BABYLON.Axis.Z,
      basisWorld,
    ).normalize();
    const solved = solveShenmue2TwoBonePositions(
      shoulderWorld,
      targetWorld,
      resolvedUpperLength,
      resolvedLowerLength,
      planeHint,
      { reverseBend: solver.reverseBend },
    );
    const upperDirection = solved.jointPosition.subtract(shoulderWorld);
    const lowerDirection = solved.targetPosition.subtract(
      solved.jointPosition,
    );
    const upperWorld = xForwardMatrix(
      upperDirection.scale(-1),
      solved.planeNormal,
      shoulderWorld,
    );
    const lowerWorld = xForwardMatrix(
      lowerDirection.scale(-1),
      solved.planeNormal,
      solved.jointPosition,
    );
    solver.upper.rotationQuaternion = rotationFromRelativeMatrices(
      upperWorld,
      rootWorld,
    );
    solver.upper.computeWorldMatrix?.(true);
    solver.lower.rotationQuaternion = rotationFromRelativeMatrices(
      lowerWorld,
      upperWorld,
    );
    solver.lower.computeWorldMatrix?.(true);
    // Normal FUN_8c1cf0a0 evaluates slot +0x448 and calls the native X-axis
    // helper before writing the visible hand attachment at +0x408. The other
    // terminal channels (+0x488/+0x4c8) are applied only after that write to
    // the separate +0x508 terminal matrix. Controller 17/21 owns this triplet;
    // its first compact component is therefore a literal local-X rotation,
    // not the generic compact Z/Y/X node mapping.
    solver.target.rotationQuaternion = solverState?.mode === 1
      ? shenmue2NativeDirectionBlendRotationQuaternion({
          ...solverState,
          ...solverState.terminalDirectionBlend,
        })
      : blendFromPose?.absoluteRotations?.[solver.terminalController]
          && blendAmount < 1
        ? shenmue2NativeDirectionBlendFromMatrices(
            BABYLON.Matrix.RotationX(shenmue2FixedTurnRadians(
              sampled.absoluteRotations[solver.terminalController].rx,
            )),
            BABYLON.Matrix.RotationX(shenmue2FixedTurnRadians(
              blendFromPose.absoluteRotations[solver.terminalController].rx,
            )),
            blendAmount,
          )
      : BABYLON.Quaternion.RotationAxis(
          BABYLON.Axis.X,
          shenmue2FixedTurnRadians(terminalInput.rx),
        );
    solver.target.computeWorldMatrix?.(true);
    const visibleLowerLength = solver.rootController === 14
      ? profile?.armLower
      : profile?.mirroredArmLower;
    const attachmentLength = solver.rootController === 14
      ? profile?.armAttachmentLength
      : profile?.mirroredArmAttachmentLength;
    if (
      Number.isFinite(visibleLowerLength)
      && Number.isFinite(attachmentLength)
    ) {
      const handWorld = solver.target.getWorldMatrix();
      const attachmentPosition = solver.target.getAbsolutePosition().add(
        BABYLON.Vector3.TransformNormal(
          new BABYLON.Vector3(-attachmentLength, 0, 0),
          handWorld,
        ),
      );
      const attachmentRotation = solverState?.mode === 1
        ? shenmue2NativeDirectionBlendRotationQuaternion({
            ...solverState,
            ...solverState.attachmentDirectionBlend,
          })
        : shenmue2NativeArmAttachmentRotationQuaternion(terminalInput);
      const attachmentWorld = BABYLON.Matrix.Compose(
        BABYLON.Vector3.One(),
        attachmentRotation,
        BABYLON.Vector3.Zero(),
      ).multiply(lowerWorld);
      attachmentWorld.setTranslation(attachmentPosition);
      const parentWorld = solver.attachment.parent?.getWorldMatrix?.()
        || BABYLON.Matrix.Identity();
      solver.attachment.position.copyFrom(
        BABYLON.Vector3.TransformCoordinates(
          attachmentPosition,
          parentWorld.clone().invert(),
        ),
      );
      solver.attachment.rotationQuaternion = rotationFromRelativeMatrices(
        attachmentWorld,
        parentWorld,
      );
      solver.attachment.computeWorldMatrix?.(true);
    }
    applied = true;
  }
  return applied;
}

function applyShenmue2TorsoSolver(
  model,
  sampled,
  {
    selectedControllers,
    blendFromPose,
    blendAmount,
  },
) {
  if (selectedControllers && !selectedControllers.has(8)) return false;
  const solver = initializeShenmue2TorsoSolver(model);
  if (!solver) return false;
  const controller = (index) => blendedControllerRotation(
    { rotations: sampled.absoluteRotations },
    blendFromPose?.absoluteRotations
      ? { rotations: blendFromPose.absoluteRotations }
      : null,
    index,
    blendAmount,
  );
  const local = shenmue2NativeTorsoLocalMatrix({
    rootRotation: controller(8),
    aimVector: controller(9),
    terminalRotation: controller(10),
    // Slot 1 continues from slot 0's live controller-1 pelvis basis. The MT7
    // bind quaternion is only its neutral approximation; using it here leaves
    // every downstream torso/head/arm output rotated by controller 1's
    // animated residual.
    pelvisBasisRotationQuaternion: shenmue2NativePelvisRotationQuaternion(
      controller(1),
    ),
    segmentLength: solver.segmentLength,
  });
  if (!local) return false;
  const rotation = BABYLON.Quaternion.Identity();
  const position = BABYLON.Vector3.Zero();
  if (!local.decompose(undefined, rotation, position)) return false;
  solver.transform.rotationQuaternion = rotation.normalize();
  solver.transform.position.copyFrom(position);
  solver.transform.computeWorldMatrix?.(true);
  return true;
}

function applyShenmue2LegSolvers(
  model,
  sampled,
  {
    selectedControllers,
    blendFromPose,
    blendAmount,
    sequence,
    nativeSolverInputs,
  },
) {
  const solvers = initializeShenmue2LegSolvers(model);
  if (!solvers?.length) return false;
  model.renderRoot.computeWorldMatrix?.(true);
  const actorWorld = model.renderRoot.parent?.getWorldMatrix?.()
    || BABYLON.Matrix.Identity();
  const actorRotation = BABYLON.Quaternion.Identity();
  actorWorld.decompose(undefined, actorRotation, undefined);
  const actorRotationMatrix = BABYLON.Matrix.Compose(
    BABYLON.Vector3.One(),
    actorRotation,
    BABYLON.Vector3.Zero(),
  );
  const rootPosition = blendedRootPosition(
    { rootPosition: sampled.absoluteRootPosition },
    blendFromPose?.absoluteRootPosition
      ? { rootPosition: blendFromPose.absoluteRootPosition }
      : null,
    blendAmount,
  );
  let applied = false;
  for (const solver of solvers) {
    if (
      selectedControllers
      && !selectedControllers.has(solver.targetController)
    ) continue;
    solver.root.computeWorldMatrix?.(true);
    solver.upper.computeWorldMatrix?.(true);
    solver.lower.computeWorldMatrix?.(true);
    solver.target.computeWorldMatrix?.(true);
    const targetInput = blendedControllerRotation(
      { rotations: sampled.absoluteRotations },
      blendFromPose?.absoluteRotations
        ? { rotations: blendFromPose.absoluteRotations }
        : null,
      solver.targetController,
      blendAmount,
    );
    const terminalInput = blendedControllerRotation(
      { rotations: sampled.absoluteRotations },
      blendFromPose?.absoluteRotations
        ? { rotations: blendFromPose.absoluteRotations }
        : null,
      solver.terminalController,
      blendAmount,
    );
    const hipWorld = solver.upper.getAbsolutePosition();
    const kneeWorld = solver.lower.getAbsolutePosition();
    const footWorld = solver.target.getAbsolutePosition();
    const upperLength = BABYLON.Vector3.Distance(hipWorld, kneeWorld);
    const lowerLength = BABYLON.Vector3.Distance(kneeWorld, footWorld);
    if (upperLength <= 1e-7 || lowerLength <= 1e-7) continue;
    const nativeLegReach = shenmue2NativeLegReach(
      sequence,
      model.shenmue2NativeRestProfile,
      solver.targetController === 6,
    );
    // SH-4 slot zero constructs an absolute actor-space foot target before
    // calling its triangle solver: X/Z remove compact root locomotion while Y
    // remains relative to the actor's ground anchor. Native +0x5d4/+0xac4
    // matrices match this formula within 0.03 mm in ordinary captured frames.
    // Anchoring Y to either the static MT7 hip or compact root Y changes the
    // target distance enough to erase native knee bend near full extension.
    const targetScale = nativeLegReach
      ? (upperLength + lowerLength) / nativeLegReach
      : 1;
    const capturedTargetVector = nativeSolverInputs
      ?.terrainAdjustedLegTargets?.find(
      ({ controllerIndex }) => controllerIndex === solver.targetController,
    )?.values;
    // Ryo's player structure retains the post-ground-query foot vector after
    // compact root X/Z have already been removed. It is the direct input to
    // the shared slot-zero triangle solver, so conformance must neither feed
    // it back through the absolute-MOT conversion nor subtract root twice.
    // Normal playback supplies no captured vector and follows the ordinary
    // decoded target path above.
    const targetOffsetBrowser = capturedTargetVector
      ? new BABYLON.Vector3(
          -capturedTargetVector[0] * targetScale,
          capturedTargetVector[1] * targetScale,
          capturedTargetVector[2] * targetScale,
        )
      : compactLegTargetPositionBrowser(
          targetInput,
          rootPosition,
          targetScale,
        );
    const targetOffsetWorld = BABYLON.Vector3.TransformNormal(
      targetOffsetBrowser,
      actorRotationMatrix,
    );
    const actorOriginWorld = actorWorld.getTranslation();
    const actorGroundOffset = (
      model.renderRoot.parent?.metadata?.scheduledActorGroundOffset ?? 0
    );
    const targetWorld = new BABYLON.Vector3(
      actorOriginWorld.x,
      actorOriginWorld.y - actorGroundOffset,
      actorOriginWorld.z,
    ).add(targetOffsetWorld);
    const rootWorld = solver.root.getWorldMatrix();
    const basisInput = blendedControllerRotation(
      { rotations: sampled.absoluteRotations },
      blendFromPose?.absoluteRotations
        ? { rotations: blendFromPose.absoluteRotations }
        : null,
      solver.basisController,
      blendAmount,
    );
    const basisWorld = BABYLON.Matrix.Compose(
      BABYLON.Vector3.One(),
      shenmue2NativePelvisRotationQuaternion(basisInput),
      BABYLON.Vector3.Zero(),
    ).multiply(rootWorld);
    const planeHint = BABYLON.Vector3.TransformNormal(
      BABYLON.Axis.Z,
      basisWorld,
    ).normalize();
    const solved = solveShenmue2TwoBonePositions(
      hipWorld,
      targetWorld,
      upperLength,
      lowerLength,
      planeHint,
      { reverseBend: true },
    );
    const upperDirection = solved.jointPosition.subtract(hipWorld);
    const lowerDirection = solved.targetPosition.subtract(
      solved.jointPosition,
    );
    const upperWorld = xForwardMatrix(
      upperDirection.scale(-1),
      solved.planeNormal,
      hipWorld,
    );
    const lowerWorld = xForwardMatrix(
      lowerDirection.scale(-1),
      solved.planeNormal,
      solved.jointPosition,
    );
    solver.upper.rotationQuaternion = rotationFromRelativeMatrices(
      upperWorld,
      rootWorld,
    );
    solver.upper.computeWorldMatrix?.(true);
    solver.lower.rotationQuaternion = rotationFromRelativeMatrices(
      lowerWorld,
      upperWorld,
    );
    solver.lower.computeWorldMatrix?.(true);
    // FUN_8c1d14e0 saves its incoming actor matrix through 0x8c1e5fe0 at
    // function entry. After solving each leg it restores that saved 3x3 via
    // 0x8c1e64c0 -> 0x8c1dfb20, then applies controller 4/7's Z, Y, X
    // terminal channels before writing +0x760/+0xc50. The foot is therefore
    // actor-relative, not shin-relative. Captured native matrices match this
    // construction to fixed-turn precision; derive the Babylon child-local
    // quaternion from the desired world matrix so the hierarchy can retain
    // its solved foot position without inheriting the shin's orientation.
    const terminalLocal = BABYLON.Matrix.Compose(
      BABYLON.Vector3.One(),
      shenmue2NativePelvisRotationQuaternion(terminalInput),
      BABYLON.Vector3.Zero(),
    );
    const targetWorldMatrix = terminalLocal.multiply(actorRotationMatrix);
    targetWorldMatrix.setTranslation(solved.targetPosition);
    solver.target.rotationQuaternion = rotationFromRelativeMatrices(
      targetWorldMatrix,
      lowerWorld,
    );
    solver.target.computeWorldMatrix?.(true);
    applied = true;
  }
  return applied;
}

export function evaluateShenmue2Mt7ControllerPose(sequence, frame) {
  const sampled = Shenmue2MotLoader.evaluateSequence(sequence, frame);
  let reference = SHENMUE2_CLIP_REFERENCE_POSES.get(sequence);
  if (!reference) {
    reference = Shenmue2MotLoader.evaluateSequence(sequence, 0);
    SHENMUE2_CLIP_REFERENCE_POSES.set(sequence, reference);
  }
  return {
    absoluteRootPosition: sampled.rootPosition,
    absoluteRotations: sampled.rotations,
    rootPosition: Object.fromEntries(
      ["x", "y", "z"].map((channel) => [
        channel,
        sampled.rootPosition[channel] - reference.rootPosition[channel],
      ]),
    ),
    rotations: sampled.rotations.map((rotation, index) => ({
      rx: rotation.rx - reference.rotations[index].rx,
      ry: rotation.ry - reference.rotations[index].ry,
      rz: rotation.rz - reference.rotations[index].rz,
    })),
  };
}

export function evaluateShenmue2Mt7ControllerVelocity(sequence, frame) {
  const sampled = Shenmue2MotLoader.evaluateSequenceDerivatives(
    sequence,
    frame,
  );
  return {
    absoluteRootPosition: sampled.rootPosition,
    absoluteRotations: sampled.rotations,
    rootPosition: sampled.rootPosition,
    rotations: sampled.rotations,
  };
}

function applyCapturedShenmue2CurveAffines(sampled, curveAffines) {
  for (const { curveIndex, scale, base } of curveAffines || []) {
    if (
      !Number.isInteger(curveIndex)
      || curveIndex < 0
      || curveIndex >= 69
      || !Number.isFinite(scale)
      || !Number.isFinite(base)
    ) continue;
    if (curveIndex < 3) {
      const channel = ["x", "y", "z"][curveIndex];
      sampled.absoluteRootPosition[channel] = (
        sampled.absoluteRootPosition[channel] * scale + base
      );
      sampled.rootPosition[channel] *= scale;
      continue;
    }
    const controller = Math.floor((curveIndex - 3) / 3);
    const channel = ["rx", "ry", "rz"][(curveIndex - 3) % 3];
    sampled.absoluteRotations[controller][channel] = (
      sampled.absoluteRotations[controller][channel] * scale + base
    );
    sampled.rotations[controller][channel] *= scale;
  }
}

function applyCapturedShenmue2CurveValues(sampled, values) {
  if (!Array.isArray(values) || values.length !== 69) return;
  for (let curveIndex = 0; curveIndex < values.length; curveIndex += 1) {
    const value = values[curveIndex];
    if (!Number.isFinite(value)) continue;
    if (curveIndex < 3) {
      sampled.absoluteRootPosition[["x", "y", "z"][curveIndex]] = value;
      continue;
    }
    const controller = Math.floor((curveIndex - 3) / 3);
    const channel = ["rx", "ry", "rz"][(curveIndex - 3) % 3];
    sampled.absoluteRotations[controller][channel] = value;
  }
}

export function configureShenmue2Mt7ControllerHierarchy(model) {
  if (model?.shenmue2ControllerHierarchyConfigured) return true;
  const nodes = model?.mt7MotionNodes || [];
  if (nodes.length < 17) return false;
  const byId = new Map();
  for (const entry of nodes) {
    if (!byId.has(entry.sourceNode.id)) byId.set(entry.sourceNode.id, entry);
  }
  const byController = new Map(nodes
    .filter(({ motionNodeIndex }) => Number.isInteger(motionNodeIndex))
    .map((entry) => [entry.motionNodeIndex, entry]));
  const nativeRestProfile = shenmue2NativeRestProfileForNodes(nodes);
  if (nodes.shenmue2ReducedNativeHierarchy) {
    const torso = byController.get(8);
    if (!torso?.transform || !nativeRestProfile) return false;
    const scene = torso.transform.getScene?.();
    if (!scene) return false;
    // Reduced native CHRM files bind the visible upper arms directly to the
    // torso, but the compact controller still produces the ordinary slot-3/4
    // root matrices. Materialize those two proven solver nodes in the browser
    // hierarchy. They are not guessed render geometry and never draw; their
    // controller indices, parent, and rest placement are shared with the full
    // hierarchy and established by the native solver output.
    for (const [rootId, controllerIndex, upperId] of [
      [0x09, 14, 0x05],
      [0x04, 18, 0x0a],
    ]) {
      if (byController.has(controllerIndex) || !byId.get(upperId)?.transform) {
        return false;
      }
      const transform = new BABYLON.TransformNode(
        `s2_virtual_native_arm_root_${rootId.toString(16)}`,
        scene,
      );
      transform.rotationQuaternion = BABYLON.Quaternion.Identity();
      transform.parent = torso.transform;
      transform.metadata = {
        ...(transform.metadata || {}),
        shenmue2VirtualNativeSolverNode: true,
        nativeControllerIndex: controllerIndex,
      };
      const entry = {
        sourceNode: {
          id: rootId,
          offset: null,
          parentOffset: torso.sourceNode?.offset ?? null,
          position: [0, 0, 0],
          virtualNativeSolverNode: true,
        },
        transform,
        modelFamilySourceNode: torso.modelFamilySourceNode,
        motionNodeIndex: controllerIndex,
        motionControllerKind: "rotation",
        motionSolverSlot: controllerIndex === 14 ? 3 : 4,
        motionTerminal: false,
        motionRoot: false,
        virtualNativeSolverNode: true,
      };
      nodes.push(entry);
      byId.set(rootId, entry);
      byController.set(controllerIndex, entry);
    }
    model.shenmue2VirtualNativeArmRoots = true;
  }
  // The authored MT7 render tree places 0x0e beneath 0x01, but the native
  // runtime matrices prove the anatomical solver tree is the reverse: the
  // pelvis output (+0x3e0 / controller 0) feeds the torso output (+0x1168 /
  // controller 8), and both legs remain attached to the pelvis. Preserve the
  // authored bind pose while installing that runtime topology.
  const pelvis = byController.get(0);
  const torso = byController.get(8);
  if (pelvis?.transform && torso?.transform) {
    const bodyParent = torso.transform.parent;
    if (typeof pelvis.transform.setParent === "function") {
      pelvis.transform.setParent(bodyParent, true);
      pelvis.motionBindRotationQuaternion =
        pelvis.transform.rotationQuaternion?.clone?.() || null;
      pelvis.motionBindPosition = nativeRestProfile
        ? new BABYLON.Vector3(0, nativeRestProfile.pelvisRest, 0)
        : pelvis.transform.position.clone();
      torso.transform.setParent(pelvis.transform, true);
      torso.motionBindRotationQuaternion =
        torso.transform.rotationQuaternion?.clone?.() || null;
      torso.motionBindPosition = torso.transform.position.clone();
    } else {
      pelvis.transform.parent = bodyParent;
      torso.transform.parent = pelvis.transform;
    }
    model.shenmue2NativeRestProfile = nativeRestProfile;
    if (nativeRestProfile) {
      for (const [id, zSign] of [[0x10, 1], [0x15, -1]]) {
        byId.get(id)?.transform?.position?.set(
          0,
          nativeRestProfile.legRootY,
          nativeRestProfile.legRootZ * zSign,
        );
      }
      // The same record supplies slot 3/4's +0x28c/+0x2cc segment lengths.
      // Bound MDC7 records consume those solver matrices directly, so a CHRM
      // variant's standalone local length must not replace the family value.
      for (const [id, length] of [
        // FUN_8c1cd380 copies rest-record +0xc4/+0xc8 and +0xec/+0xf0
        // into the two separate leg solver structures. CHRM variants can
        // retain slightly different standalone limb translations (PG3_L's
        // second shin is the retained example), but native animation uses
        // these four family-record values for its rendered solver matrices.
        [0x11, nativeRestProfile.features[0]],
        [0x12, nativeRestProfile.features[1]],
        [0x16, nativeRestProfile.mirroredLegUpper],
        [0x17, nativeRestProfile.mirroredLegLower],
        [0x06, nativeRestProfile.features[2]],
        [0x0b, nativeRestProfile.mirroredArmUpper],
      ]) {
        const position = byId.get(id)?.transform?.position;
        if (position) {
          position.set(Math.sign(position.x || -1) * length, 0, 0);
        }
      }
      for (const [id, length] of [
        [0x07, nativeRestProfile.features[3]],
        [0x0c, nativeRestProfile.mirroredArmLower],
      ]) {
        const position = byId.get(id)?.transform?.position;
        if (position) {
          position.set(Math.sign(position.x || -1) * length, 0, 0);
        }
      }
    }
  }
  // Native limb solver 3 starts at identity control 0x04 and feeds the 0x0a
  // arm; solver 4 does the same through 0x09 and 0x05. In the static MT7 tree
  // the identity controls are root siblings while each upper arm is already a
  // direct child of the torso. Install the native topology by retaining those
  // authored *local* transforms. Preserving the controls' former world poses
  // here would bake inverse(torso) into them (roughly a 90-degree shoulder
  // error) even though synchronized native matrices show both controls nearly
  // identity-relative-to-torso.
  for (const [rootId, upperId] of [[0x04, 0x0a], [0x09, 0x05]]) {
    const root = byId.get(rootId);
    const upper = byId.get(upperId);
    if (!root?.transform || !upper?.transform || !torso?.transform) continue;
    root.transform.parent = torso.transform;
    root.motionBindRotationQuaternion =
      root.transform.rotationQuaternion?.clone?.()
      || BABYLON.Quaternion.Identity();
    upper.transform.parent = root.transform;
  }
  if (model.shenmue2NativeRestProfile) {
    const profile = model.shenmue2NativeRestProfile;
    for (const [rootId, upperId, rootZ, shoulderZ] of [
      [0x09, 0x05, profile.armRootZ, profile.armShoulderZ],
      [
        0x04,
        0x0a,
        profile.mirroredArmRootZ,
        profile.mirroredArmShoulderZ,
      ],
    ]) {
      byId.get(rootId)?.transform?.position?.set(
        -profile.armRootX,
        0,
        rootZ,
      );
      byId.get(upperId)?.transform?.position?.set(0, 0, shoulderZ);
    }
  }
  model.shenmue2ControllerHierarchyConfigured = true;
  return true;
}

export function scheduledActorShenmue2MotionSelection(model, routeState) {
  // Functions 0x60ed3 and 0x612e4 select locomotion and standing motions from
  // the model family and actor profile respectively.
  const motionId = Number.isInteger(routeState?.nativeMotionId)
    ? routeState.nativeMotionId
    : routeState?.moving
    ? shenmue2NpcLocomotionMotionId(
        model?.motionFamilyIndex ?? model?.actorCode,
      )
    : shenmue2NpcProfileIdleMotionId(
        model?.actorProfile,
        model?.modelVariantIndex ?? 0,
      );
  const resolved = resolveShenmue2NativeMotionId(motionId);
  return resolved ? {
    ...resolved,
    name: `0x${resolved.motionId.toString(16)}`,
    loop: true,
    ...(Number.isFinite(routeState?.nativeMotionRate)
      ? { playbackRate: routeState.nativeMotionRate }
      : {}),
  } : null;
}

export function applyShenmue2Mt7MotionPose(
  model,
  sequence,
  frame,
  {
    preserveHorizontalRoot = true,
    blendFromPose = null,
    blendFromVelocity = null,
    blendAmount = 1,
    blendDurationFrames = null,
    controllerIndices = null,
    nativeSolverInputs = null,
  } = {},
) {
  const nodes = model?.mt7MotionNodes || [];
  if (
    !sequence?.valid
    || !configureShenmue2Mt7ControllerHierarchy(model)
  ) return false;
  initializeShenmue2ArmSolvers(model);
  initializeShenmue2LegSolvers(model);
  // The native solvers consume several constant basis controls which are not
  // direct MT7 Euler deltas. Until their exact matrix composition is ported,
  // route only the directly established controls and normalize them against
  // the clip-start controller pose. This retains authored motion without
  // double-applying solver basis rotations to visible render nodes.
  const sampled = evaluateShenmue2Mt7ControllerPose(sequence, frame);
  if (nativeSolverInputs?.curveAffines?.length) {
    // FUN_8c1cdee0 applies each live descriptor's +0x34 scale and +0x38 base
    // after sampling the MOT curve. Captured conformance inputs preserve that
    // transition/blend state so the procedural solvers can be measured
    // independently. Normal browser playback does not synthesize these
    // values; its own transition controller remains the production source.
    applyCapturedShenmue2CurveAffines(
      sampled,
      nativeSolverInputs.curveAffines,
    );
  }
  if (nativeSolverInputs?.evaluatedCurveValues?.length === 69) {
    // These are values reconstructed from the live descriptor's current
    // Hermite segment using the exact field layout in FUN_8c1cdee0. They are
    // accepted only by the native conformance path and expose MOT decoder or
    // timing mismatches without changing normal browser playback.
    applyCapturedShenmue2CurveValues(
      sampled,
      nativeSolverInputs.evaluatedCurveValues,
    );
  }
  if (
    nativeSolverInputs?.headAimVector?.length === 3
    && nativeSolverInputs.headAimVector.every(Number.isFinite)
  ) {
    // FUN_8c1d4020 consumes the evaluated controller-13 vector after native
    // look-at callbacks have had an opportunity to replace the MOT curve.
    // Captured conformance frames retain that post-evaluation input so the
    // solver can be tested independently from the still-separate look-target
    // scheduling system.
    const [rx, ry, rz] = nativeSolverInputs.headAimVector;
    sampled.absoluteRotations[13] = { rx, ry, rz };
  }
  const selectedControllers = controllerIndices
    ? new Set(controllerIndices)
    : null;
  const transitionAmount = Math.max(0, Math.min(1, blendAmount));
  // Compact-MOT root translation belongs to the controller root, above the
  // pelvis and both legs. Applying it to MT7 node 0x01 moved only the torso,
  // head, and arms and visibly tore a walking character in half. Scheduled
  // routes already own horizontal displacement, so ordinary walkers retain
  // only the whole-model vertical bob here.
  if (
    (!selectedControllers || selectedControllers.has(0))
    && model.renderRoot?.position?.set
  ) {
    const basePosition = model.standingRenderPosition
      || model.shenmue2MotionBaseRenderPosition
      || model.renderRoot.position;
    if (!model.shenmue2MotionBaseRenderPosition) {
      model.shenmue2MotionBaseRenderPosition = basePosition.clone
        ? basePosition.clone()
        : { x: basePosition.x, y: basePosition.y, z: basePosition.z };
    }
    const translationScale = model.motionTranslationScale ?? 1;
    const actorParent = model.renderRoot.parent;
    const actorGroundOffset = (
      actorParent?.metadata?.scheduledActorGroundOffset ?? 0
    );
    const actorScale = BABYLON.Vector3.One();
    actorParent?.getWorldMatrix?.().decompose(actorScale, undefined, undefined);
    const groundOffsetLocal = actorGroundOffset
      / Math.max(1e-7, Math.abs(actorScale.y));
    // Slot zero evaluates the root-position curves as absolute controller
    // values before building the pelvis matrix. Subtracting the clip-start
    // sample removed about 5.5 mm from F086's pelvis height and, near full leg
    // extension, was enough to turn a native bent knee into a straight one.
    const targetOffset = mt7BrowserVector([
      preserveHorizontalRoot
        ? sampled.absoluteRootPosition.x * translationScale
        : 0,
      sampled.absoluteRootPosition.y * translationScale - groundOffsetLocal,
      preserveHorizontalRoot
        ? sampled.absoluteRootPosition.z * translationScale
        : 0,
    ]);
    const previousRoot = blendFromPose?.absoluteRootPosition;
    const previousOffset = previousRoot && transitionAmount < 1
      ? mt7BrowserVector([
          preserveHorizontalRoot ? previousRoot.x * translationScale : 0,
          previousRoot.y * translationScale - groundOffsetLocal,
          preserveHorizontalRoot ? previousRoot.z * translationScale : 0,
        ])
      : null;
    const offset = previousOffset
      ? previousOffset.map((value, index) => (
          value + (targetOffset[index] - value) * transitionAmount
        ))
      : targetOffset;
    model.renderRoot.position.set(
      basePosition.x + offset[0],
      basePosition.y + offset[1],
      basePosition.z + offset[2],
    );
  }
  for (const entry of nodes) {
    const nodeIndex = entry.motionNodeIndex;
    if (!Number.isInteger(nodeIndex)) continue;
    if (selectedControllers && !selectedControllers.has(nodeIndex)) continue;
    // These triplets are native limb-solver inputs, not Euler rotations for
    // the MT7 nodes that consume the resulting matrices. Leaving the authored
    // bind transforms in place is conservative and prevents the severe limb
    // folding produced by applying an IK target as three angles. A later
    // solver pass consumes these retained values explicitly.
    if (
      entry.motionControllerKind === "solverRotation"
      || entry.motionControllerKind === "solverBasis"
      || entry.motionControllerKind === "solverTarget"
      || entry.motionControllerKind === "solverTerminal"
    ) continue;
    const { sourceNode, transform } = entry;
    if (nodeIndex === 0) {
      const capturedPrimaryRotation = (
        nativeSolverInputs?.pelvisPrimaryWorldMatrix?.length === 16
        && nativeSolverInputs?.nativeActorRootMatrix?.length === 16
      ) ? shenmue2NativeActorRelativeRotationQuaternion(
          nativeSolverInputs.pelvisPrimaryWorldMatrix,
          nativeSolverInputs.nativeActorRootMatrix,
        ) : null;
      const primaryRotation = capturedPrimaryRotation
        || shenmue2NativePelvisPrimaryRotationQuaternion(
          sampled.absoluteRotations[0],
          nativeSolverInputs?.pelvisPrimaryCallback,
        );
      const targetRotation = primaryRotation.multiply(
        shenmue2NativePelvisRotationQuaternion(
          sampled.absoluteRotations[1],
        ),
      );
      const previousPrimary = blendFromPose?.absoluteRotations?.[0];
      const previousBasis = blendFromPose?.absoluteRotations?.[1];
      transform.rotationQuaternion = (
        previousPrimary
        && previousBasis
        && transitionAmount < 1
      )
        ? BABYLON.Quaternion.Slerp(
            shenmue2NativePelvisOutputRotationQuaternion(
              previousPrimary,
              previousBasis,
            ),
            targetRotation,
            transitionAmount,
          )
        : targetRotation;
      if (entry.motionBindPosition) {
        // The +0x35c rest displacement is translated after controller 0's
        // intermediate is saved and before controller 1 rotates the final
        // pelvis basis. The later rotations change orientation without
        // rotating this already-installed translation. This ordering is
        // visible at 0x8c1d1928..0x8c1d1a48 and in the synchronized outputs.
        const previousTranslationRotation = previousPrimary
          && transitionAmount < 1
          ? BABYLON.Quaternion.Slerp(
              shenmue2NativePelvisRotationQuaternion(previousPrimary),
              primaryRotation,
              transitionAmount,
            )
          : primaryRotation;
        const pelvisRotation = BABYLON.Matrix.Compose(
          BABYLON.Vector3.One(),
          previousTranslationRotation,
          BABYLON.Vector3.Zero(),
        );
        transform.position.copyFrom(BABYLON.Vector3.TransformNormal(
          entry.motionBindPosition,
          pelvisRotation,
        ));
      }
      continue;
    }
    if (
      (nodeIndex === 14 || nodeIndex === 18)
      && entry.motionBindRotationQuaternion
    ) {
      const targetRotation = shenmue2NativePelvisRotationQuaternion(
        sampled.absoluteRotations[nodeIndex],
      ).multiply(entry.motionBindRotationQuaternion);
      const previousRotation = blendFromPose?.absoluteRotations?.[nodeIndex];
      transform.rotationQuaternion = previousRotation && transitionAmount < 1
        ? BABYLON.Quaternion.Slerp(
            shenmue2NativePelvisRotationQuaternion(
              previousRotation,
            ).multiply(entry.motionBindRotationQuaternion),
            targetRotation,
            transitionAmount,
          )
        : targetRotation;
      continue;
    }
    const delta = sampled.rotations[nodeIndex];
    const base = sourceNode.rotationRaw.map(mt7FixedTurnRadians);
    const deltaRotation = mt7SourceRotationQuaternion([
      delta.rx,
      delta.ry,
      delta.rz,
    ]);
    const targetRotation = entry.motionBindRotationQuaternion
      ? deltaRotation.multiply(entry.motionBindRotationQuaternion)
      : mt7SourceRotationQuaternion([
          base[0] + delta.rx,
          base[1] + delta.ry,
          base[2] + delta.rz,
        ]);
    const previousDelta = blendFromPose?.rotations?.[nodeIndex];
    transform.rotationQuaternion = previousDelta && transitionAmount < 1
      ? BABYLON.Quaternion.Slerp(
          entry.motionBindRotationQuaternion
            ? mt7SourceRotationQuaternion([
                previousDelta.rx,
                previousDelta.ry,
                previousDelta.rz,
              ]).multiply(entry.motionBindRotationQuaternion)
            : mt7SourceRotationQuaternion([
                base[0] + previousDelta.rx,
                base[1] + previousDelta.ry,
                base[2] + previousDelta.rz,
              ]),
          targetRotation,
          transitionAmount,
        )
      : targetRotation;
  }
  model.renderRoot.computeWorldMatrix?.(true);
  applyShenmue2TorsoSolver(model, sampled, {
    selectedControllers,
    blendFromPose,
    blendAmount: transitionAmount,
  });
  applyShenmue2HeadSolver(model, sampled, {
    selectedControllers,
    blendFromPose,
    blendAmount: transitionAmount,
    nativeSolverInputs,
  });
  model.renderRoot.computeWorldMatrix?.(true);
  applyShenmue2ArmSolvers(model, sampled, {
    selectedControllers,
    blendFromPose,
    blendAmount: transitionAmount,
    blendFromVelocity,
    blendDurationFrames,
    nativeSolverInputs,
  });
  applyShenmue2LegSolvers(model, sampled, {
    selectedControllers,
    blendFromPose,
    blendAmount: transitionAmount,
    sequence,
    nativeSolverInputs,
  });
  model.renderRoot.computeWorldMatrix?.(true);
  // MT7 character pieces retain their native controller TransformNodes, while
  // their render vertices use the same cross-part GPU seam influences as S1
  // characters. Upload the solved native node matrices after every pose.
  model.loader?.updateCharacterGpuRig?.(model.renderRoot);
  return true;
}


export class Shenmue2ScheduledActorMotionRuntime {
  constructor({ fetchArrayBuffer, bankUrls }) {
    this.fetchArrayBuffer = fetchArrayBuffer;
    this.bankUrls = bankUrls;
    this.sequences = new Map();
    this.playbackStates = new WeakMap();
  }

  async configure(definitions) {
    const needed = definitions.some(
      (definition) => definition.characterAssetFormat === "MT7",
    );
    if (!needed || this.sequences.size > 0) return;
    const nativeBanks = await Promise.all(
      [
        ["npc", "s2Npc"],
        ["npcTable", "s2NpcTable"],
        ["motion", "s2Motion"],
        ...Object.keys(SHENMUE2_AREA_MOTION_BANK_FILES).map(
          (bank) => [bank, bank],
        ),
      ].map(async ([bank, urlKey]) => [
        bank,
        Shenmue2MotLoader.parse(
          await this.fetchArrayBuffer(this.bankUrls[urlKey]),
        ),
      ]),
    );
    this.sequences = new Map(nativeBanks);
  }

  apply(model, routeState, elapsedSeconds) {
    if (
      !model?.loader
      || !model?.renderRoot
      || model.skeletalAnimation === false
    ) {
      return false;
    }
    const selection = scheduledActorShenmue2MotionSelection(
      model,
      routeState,
    );
    const sequence = selection
      ? this.sequences.get(selection.bank)
        ?.sequences?.[selection.sequenceIndex]
      : null;
    if (!sequence?.valid) {
      this.playbackStates.delete(model);
      return false;
    }
    const durationFrames = Math.max(1, sequence.durationFrames || 1);
    const frame = (
      Math.max(0, elapsedSeconds)
      * MOTION_FPS
      * (selection.playbackRate || 1)
    ) % durationFrames;
    const selectionKey = `${selection.bank}:${selection.sequenceIndex}`;
    const previousState = this.playbackStates.get(model);
    const changed = previousState?.selectionKey !== selectionKey;
    const state = changed
      ? {
          selectionKey,
          transitionFromPose: previousState?.lastPose || null,
          lastPose: null,
          explicitSelectionKey: previousState?.explicitSelectionKey || null,
          explicitTransitionFromPose:
            previousState?.explicitTransitionFromPose || null,
          explicitTransitionFromVelocity:
            previousState?.explicitTransitionFromVelocity || null,
          explicitStartedAt: previousState?.explicitStartedAt ?? null,
          lastElapsedSeconds: previousState?.lastElapsedSeconds ?? null,
        }
      : previousState || {
          selectionKey,
          transitionFromPose: null,
          lastPose: null,
          explicitSelectionKey: null,
          explicitTransitionFromPose: null,
          explicitTransitionFromVelocity: null,
          explicitStartedAt: null,
          lastElapsedSeconds: null,
        };
    const blendSeconds = SHENMUE2_NATIVE_MOTION_BLEND_FRAMES / MOTION_FPS;
    const blendAmount = state.transitionFromPose
      ? Math.min(1, Math.max(0, elapsedSeconds) / blendSeconds)
      : 1;
    const applied = applyShenmue2Mt7MotionPose(model, sequence, frame, {
      // Route sampling already applies authored world displacement. Compact
      // horizontal root motion must not move the rendered skeleton twice.
      preserveHorizontalRoot: !routeState,
      blendFromPose: state.transitionFromPose,
      blendAmount,
    });

    const explicitPose = model.explicitPoseMotion;
    const explicitSequence = explicitPose
      ? this.sequences.get(explicitPose.bank)
        ?.sequences?.[explicitPose.sequenceIndex]
      : null;
    const explicitControllerIndices = explicitPose
      ? shenmue2MotionControllerIndicesForSlot(
          explicitPose.nativeMotionSlot,
        )
      : null;
    if (explicitSequence?.valid && explicitControllerIndices) {
      const explicitSelectionKey = [
        explicitPose.bank,
        explicitPose.sequenceIndex,
        explicitPose.nativeMotionSlot,
      ].join(":");
      if (
        state.explicitSelectionKey !== explicitSelectionKey
        || (
          Number.isFinite(state.lastElapsedSeconds)
          && elapsedSeconds < state.lastElapsedSeconds
        )
      ) {
        // Actor layer 1 installs its constant slot-4 pose through a native
        // 12-frame Hermite descriptor. The descriptor starts at the current
        // underlying motion value and half its outgoing velocity; it reaches
        // the layer target with zero velocity. Retained Dreamcast descriptors
        // for 0x80c1/0x80c3/0x80c4/0x80cd/0x80d5/0x80d6/0x80f3 prove this
        // independently of the visible result.
        state.explicitSelectionKey = explicitSelectionKey;
        state.explicitTransitionFromPose =
          evaluateShenmue2Mt7ControllerPose(sequence, frame);
        state.explicitTransitionFromVelocity =
          evaluateShenmue2Mt7ControllerVelocity(sequence, frame);
        state.explicitStartedAt = Math.max(0, elapsedSeconds);
      }
      const explicitElapsedSeconds = Math.max(
        0,
        Math.max(0, elapsedSeconds) - (state.explicitStartedAt || 0),
      );
      const explicitFrame = (
        explicitElapsedSeconds * MOTION_FPS
      ) % Math.max(1, explicitSequence.durationFrames || 1);
      const explicitBlendAmount = Math.min(
        1,
        explicitElapsedSeconds * MOTION_FPS
          / SHENMUE2_NATIVE_LAYER_BLEND_FRAMES,
      );
      // Opcode 0x2d installs actor layer 1. Its controller-group bit selects
      // one native slot, which is evaluated after the ordinary body pose.
      applyShenmue2Mt7MotionPose(
        model,
        explicitSequence,
        explicitFrame,
        {
          preserveHorizontalRoot: false,
          controllerIndices: explicitControllerIndices,
          blendFromPose: state.explicitTransitionFromPose,
          blendFromVelocity: state.explicitTransitionFromVelocity,
          blendAmount: explicitBlendAmount,
          blendDurationFrames: SHENMUE2_NATIVE_LAYER_BLEND_FRAMES,
        },
      );
      if (explicitBlendAmount >= 1) {
        state.explicitTransitionFromPose = null;
        state.explicitTransitionFromVelocity = null;
      }
    } else {
      state.explicitSelectionKey = null;
      state.explicitTransitionFromPose = null;
      state.explicitTransitionFromVelocity = null;
      state.explicitStartedAt = null;
    }

    state.lastPose = evaluateShenmue2Mt7ControllerPose(sequence, frame);
    if (blendAmount >= 1) state.transitionFromPose = null;
    state.lastElapsedSeconds = elapsedSeconds;
    this.playbackStates.set(model, state);
    return applied;
  }
}
