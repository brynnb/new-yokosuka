import * as BABYLON from "@babylonjs/core";

export const NATIVE_HAND_BONE_COUNT = 71;
export const NATIVE_HAND_VERTEX_COUNT = 306;
export const NATIVE_HAND_POSE_SLOT_ORDER = Object.freeze([
  31, 30, 29, 35, 34, 33, 32, 39, 38, 37, 36,
  43, 42, 41, 40, 47, 46, 45, 44,
]);

const FULL_TURN = Math.PI * 2;
const ANGLE_UNITS_PER_TURN = 0x10000;

function bytes(input, label) {
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  if (ArrayBuffer.isView(input)) {
    return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  }
  throw new TypeError(`${label} must be binary data`);
}

function int16(value) {
  const low = value & 0xffff;
  return low & 0x8000 ? low - 0x10000 : low;
}

export function parseNativeHandRig(input, expected = {}) {
  const data = bytes(input, "native HAND rig");
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  if (view.byteLength < 24) throw new Error("native HAND rig is truncated");
  const offsets = Array.from({ length: 6 }, (_, index) => (
    view.getUint32(index * 4, true)
  ));
  const vertexCount = expected.vertexCount ?? NATIVE_HAND_VERTEX_COUNT;
  if (
    !Number.isInteger(vertexCount)
    || vertexCount < 1
    || offsets[0] !== 0x18
    || offsets[1] - offsets[0] !== 72 * 2
    || offsets[3] - offsets[1] !== NATIVE_HAND_BONE_COUNT * 80
    || offsets.some((offset, index) => (
      offset < 0x18
      || offset > view.byteLength
      || (expected.pointerOffsets && offset !== expected.pointerOffsets[index])
    ))
    || (expected.transformNodeCount ?? NATIVE_HAND_BONE_COUNT)
      !== NATIVE_HAND_BONE_COUNT
  ) throw new Error("native HAND rig has an unexpected layout");

  const traversal = Array.from({ length: NATIVE_HAND_BONE_COUNT }, (_, index) => (
    Object.freeze({
      boneId: view.getUint8(offsets[0] + index * 2),
      childCount: view.getUint8(offsets[0] + index * 2 + 1),
    })
  ));
  const seenBoneIds = new Set(traversal.map(value => value.boneId));
  if (
    traversal[0]?.boneId !== 0
    || seenBoneIds.size !== NATIVE_HAND_BONE_COUNT
    || Math.max(...seenBoneIds) !== NATIVE_HAND_BONE_COUNT - 1
  ) throw new Error("native HAND traversal is invalid");

  const records = traversal.map((entry, index) => {
    const recordOffset = offsets[1] + index * 80;
    const values = Float32Array.from({ length: 20 }, (_, valueIndex) => (
      view.getFloat32(recordOffset + valueIndex * 4, true)
    ));
    return Object.freeze({
      ...entry,
      translationOrLength: values[0],
      baseValues: Object.freeze(Array.from(values.subarray(1, 4))),
      bindMatrix: Object.freeze(Array.from(values.subarray(4, 20))),
    });
  });

  const influenceCounts = Uint8Array.from(
    data.subarray(offsets[2], offsets[2] + vertexCount),
  );
  const influenceCount = influenceCounts.reduce((sum, value) => sum + value, 0);
  if (
    offsets[3] + influenceCount > offsets[4]
    || offsets[4] + influenceCount * 4 > offsets[2]
  ) throw new Error("native HAND influence stream is truncated");
  const influenceBones = Uint8Array.from(
    data.subarray(offsets[3], offsets[3] + influenceCount),
  );
  if (influenceBones.some(value => value >= NATIVE_HAND_BONE_COUNT)) {
    throw new Error("native HAND influence references an unknown bone");
  }
  const influenceWeights = Float32Array.from(
    { length: influenceCount },
    (_, index) => view.getFloat32(offsets[4] + index * 4, true),
  );

  // Prove that the depth-first child counts consume exactly the 71 records.
  let hierarchyCursor = 0;
  const consumeNode = () => {
    const record = records[hierarchyCursor++];
    if (!record) throw new Error("native HAND hierarchy overruns its records");
    for (let child = 0; child < record.childCount; child += 1) consumeNode();
  };
  consumeNode();
  if (hierarchyCursor !== NATIVE_HAND_BONE_COUNT) {
    throw new Error("native HAND hierarchy does not consume every record");
  }

  return Object.freeze({
    boneCount: NATIVE_HAND_BONE_COUNT,
    transformNodeCount: NATIVE_HAND_BONE_COUNT,
    vertexCount,
    offsets: Object.freeze(offsets),
    pointerOffsets: Object.freeze([...offsets]),
    records: Object.freeze(records),
    influenceCounts,
    influenceBones,
    influenceWeights,
  });
}

function authoredRadians(baseRadians, poseUnits) {
  const baseUnits = Math.trunc(
    baseRadians * ANGLE_UNITS_PER_TURN / FULL_TURN,
  );
  return (baseUnits + int16(poseUnits)) * FULL_TURN / ANGLE_UNITS_PER_TURN;
}

export function buildNativeHandPalette(rig, pose = null) {
  if (rig?.boneCount !== NATIVE_HAND_BONE_COUNT) {
    throw new TypeError("a parsed native HAND rig is required");
  }
  if (pose && pose.length !== NATIVE_HAND_BONE_COUNT * 3) {
    throw new RangeError("native HAND pose must contain 71 three-axis vectors");
  }
  const poseValues = pose || new Int32Array(NATIVE_HAND_BONE_COUNT * 3);
  const palette = new Float32Array(NATIVE_HAND_BONE_COUNT * 16);
  let cursor = 0;
  const visit = (parentMatrix) => {
    const paletteIndex = cursor;
    const record = rig.records[cursor++];
    const root = record.boneId === 0;
    let current = BABYLON.Matrix.Translation(
      root ? record.baseValues[0] : record.translationOrLength,
      root ? record.baseValues[1] : 0,
      root ? record.baseValues[2] : 0,
    ).multiply(parentMatrix);
    const baseEuler = root ? [0, 0, 0] : record.baseValues;
    const poseOffset = record.boneId * 3;
    const rotationX = authoredRadians(baseEuler[0], poseValues[poseOffset]);
    const rotationY = authoredRadians(baseEuler[1], poseValues[poseOffset + 1]);
    const rotationZ = authoredRadians(baseEuler[2], poseValues[poseOffset + 2]);
    current = BABYLON.Matrix.RotationZ(rotationZ).multiply(current);
    current = BABYLON.Matrix.RotationY(rotationY).multiply(current);
    current = BABYLON.Matrix.RotationX(rotationX).multiply(current);
    palette.set(current.asArray(), paletteIndex * 16);
    for (let child = 0; child < record.childCount; child += 1) visit(current);
  };
  visit(BABYLON.Matrix.Identity());
  return palette;
}

export function deformNativeHandVertices(rig, source, pose, sideFlag) {
  if (!Number.isInteger(rig?.vertexCount) || rig.vertexCount < 1) {
    throw new TypeError("a parsed native HAND rig is required");
  }
  if (!source || source.length !== rig.vertexCount * 6) {
    throw new RangeError(
      `native HAND source must contain ${rig.vertexCount} position/normal pairs`,
    );
  }
  if (sideFlag !== 1 && sideFlag !== 2 && sideFlag !== 3) {
    throw new RangeError("native HAND side flag must be 1, 2, or 3");
  }
  const palette = buildNativeHandPalette(rig, pose);
  const output = new Float32Array(source.length);
  const flipZ = sideFlag === 1 || sideFlag === 3;
  let influenceCursor = 0;
  for (let vertex = 0; vertex < rig.vertexCount; vertex += 1) {
    const sourceOffset = vertex * 6;
    const x = source[sourceOffset];
    const y = source[sourceOffset + 1];
    const z = source[sourceOffset + 2];
    const nx = source[sourceOffset + 3];
    const ny = source[sourceOffset + 4];
    const nz = source[sourceOffset + 5];
    let px = y;
    let py = -x;
    let pz = flipZ ? -z : z;
    let ex = y + ny;
    let ey = -(x + nx);
    let ez = flipZ ? -(z + nz) : z + nz;
    const originalPx = px;
    const originalPy = py;
    const originalPz = pz;
    const originalEx = ex;
    const originalEy = ey;
    const originalEz = ez;
    const influenceEnd = influenceCursor + rig.influenceCounts[vertex];
    for (; influenceCursor < influenceEnd; influenceCursor += 1) {
      const bone = rig.influenceBones[influenceCursor];
      const weight = rig.influenceWeights[influenceCursor];
      const bind = rig.records[bone].bindMatrix;
      const currentOffset = bone * 16;
      const transform = (ix, iy, iz) => {
        const dx = ix - bind[12];
        const dy = iy - bind[13];
        const dz = iz - bind[14];
        const lx = bind[0] * dx + bind[1] * dy + bind[2] * dz;
        const ly = bind[4] * dx + bind[5] * dy + bind[6] * dz;
        const lz = bind[8] * dx + bind[9] * dy + bind[10] * dz;
        return [
          palette[currentOffset + 12]
            + palette[currentOffset] * lx
            + palette[currentOffset + 4] * ly
            + palette[currentOffset + 8] * lz,
          palette[currentOffset + 13]
            + palette[currentOffset + 1] * lx
            + palette[currentOffset + 5] * ly
            + palette[currentOffset + 9] * lz,
          palette[currentOffset + 14]
            + palette[currentOffset + 2] * lx
            + palette[currentOffset + 6] * ly
            + palette[currentOffset + 10] * lz,
        ];
      };
      const worldPoint = transform(originalPx, originalPy, originalPz);
      const worldEndpoint = transform(originalEx, originalEy, originalEz);
      px += weight * (worldPoint[0] - originalPx);
      py += weight * (worldPoint[1] - originalPy);
      pz += weight * (worldPoint[2] - originalPz);
      ex += weight * (worldEndpoint[0] - originalEx);
      ey += weight * (worldEndpoint[1] - originalEy);
      ez += weight * (worldEndpoint[2] - originalEz);
    }
    output[sourceOffset] = -py;
    output[sourceOffset + 1] = px;
    output[sourceOffset + 2] = flipZ ? -pz : pz;
    output[sourceOffset + 3] = -(ey - py);
    output[sourceOffset + 4] = ex - px;
    output[sourceOffset + 5] = flipZ ? -(ez - pz) : ez - pz;
  }
  return output;
}

export function nativeHandPoseTarget(vectors, slotOrder = NATIVE_HAND_POSE_SLOT_ORDER) {
  if (!Array.isArray(vectors) || vectors.length !== slotOrder.length) {
    throw new RangeError("native HAND command must contain 19 vectors");
  }
  const target = new Int32Array(NATIVE_HAND_BONE_COUNT * 3);
  vectors.forEach((vector, index) => {
    if (!Array.isArray(vector) || vector.length !== 3) {
      throw new RangeError(`native HAND vector ${index} is invalid`);
    }
    const offset = slotOrder[index] * 3;
    target[offset] = vector[0] | 0;
    target[offset + 1] = vector[1] | 0;
    target[offset + 2] = vector[2] | 0;
  });
  return target;
}

export function stepNativeHandPoseTransition(state) {
  if (!state?.active || state.remainingNativeTicks < 1) return false;
  const divisor = Math.max(1, Math.trunc(state.remainingNativeTicks / 2));
  state.remainingNativeTicks -= 2;
  let completionCandidate = state.remainingNativeTicks < 1;
  if (completionCandidate) state.remainingNativeTicks = 1;
  for (let index = 0; index < state.current.length; index += 1) {
    const difference = int16(state.target[index] - state.current[index]);
    const step = Math.trunc(difference / divisor);
    state.current[index] = (state.current[index] + step) | 0;
    if (step !== 0) completionCandidate = false;
  }
  if (completionCandidate) {
    state.active = false;
    state.remainingNativeTicks = 0;
  }
  return true;
}
