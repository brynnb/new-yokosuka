export const NATIVE_TALK_POSE_SCHEMA =
  "new-yokosuka-native-talk-control-poses-v2";

const CONTROL_COUNT = 25;
const CHANNEL_COUNT = 3;
const DELTA_COUNT = CONTROL_COUNT * CHANNEL_COUNT;

function finiteDeltas(value, label) {
  if (
    !Array.isArray(value)
    || value.length !== DELTA_COUNT
    || value.some(entry => !Number.isFinite(entry) || Math.abs(entry) >= 1)
  ) {
    throw new Error(`native TALK ${label} control deltas are invalid`);
  }
  return Float32Array.from(value);
}

export function parseNativeTalkPoseAsset(input) {
  let value;
  if (typeof input === "string") {
    value = JSON.parse(input);
  } else if (input instanceof ArrayBuffer || ArrayBuffer.isView(input)) {
    const bytes = input instanceof ArrayBuffer
      ? new Uint8Array(input)
      : new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
    value = JSON.parse(new TextDecoder().decode(bytes));
  } else {
    value = input;
  }
  if (
    value?.schema !== NATIVE_TALK_POSE_SCHEMA
    || value?.controlCount !== CONTROL_COUNT
    || value?.channelsPerControl !== CHANNEL_COUNT
    || !Number.isInteger(value?.poseDuration)
    || value.poseDuration < 1
    || !value?.actors
  ) {
    throw new Error("native TALK pose asset has an unsupported schema");
  }
  const actors = new Map();
  for (const [actorTag, record] of Object.entries(value.actors)) {
    if (
      !/^[A-Z0-9_]{4}$/.test(actorTag)
      || typeof record?.faceCode !== "string"
      || !/^[a-f0-9]{64}$/.test(record?.tableSha256 || "")
      || !Array.isArray(record?.upperPoses)
      || record.upperPoses.length !== value.poseDuration + 1
      || !Array.isArray(record?.mouthPoses)
      || record.mouthPoses.length !== value.poseDuration + 1
    ) {
      throw new Error(`native TALK actor ${actorTag} is invalid`);
    }
    actors.set(actorTag, Object.freeze({
      actorTag,
      faceCode: record.faceCode,
      tableSha256: record.tableSha256,
      upperPoses: Object.freeze(record.upperPoses.map((pose, index) => (
        finiteDeltas(pose, `${actorTag} upper pose ${index}`)
      ))),
      mouthPoses: Object.freeze(record.mouthPoses.map((pose, index) => (
        finiteDeltas(pose, `${actorTag} mouth pose ${index}`)
      ))),
    }));
  }
  return Object.freeze({
    schema: value.schema,
    controlCount: CONTROL_COUNT,
    poseDuration: value.poseDuration,
    actors,
  });
}

export function nativeTalkActorPoses(asset, actorTag, tableSha256) {
  const record = asset?.actors?.get?.(String(actorTag || "").toUpperCase());
  if (!record || record.tableSha256 !== tableSha256) {
    throw new Error(`native TALK poses do not match ${actorTag} FTBL`);
  }
  return record;
}

/**
 * Keeps an exact FACE/FTBL pair present when its native TALK evaluation has
 * not yet been recovered. Zero controls preserve the source mesh verbatim;
 * callers can still consume voice timing, gaze, and face-clip commands
 * without borrowing incompatible deltas from another model.
 */
export function neutralNativeTalkActorPoses({
  actorTag,
  faceCode,
  tableSha256,
  poseDuration = 79,
} = {}) {
  const tag = String(actorTag || "").toUpperCase();
  if (
    !/^[A-Z0-9_]{4}$/.test(tag)
    || typeof faceCode !== "string"
    || !faceCode
    || !/^[a-f0-9]{64}$/.test(tableSha256 || "")
    || !Number.isInteger(poseDuration)
    || poseDuration < 1
  ) {
    throw new TypeError("neutral native TALK pose declaration is invalid");
  }
  const poses = Object.freeze(Array.from(
    { length: poseDuration + 1 },
    () => new Float32Array(DELTA_COUNT),
  ));
  return Object.freeze({
    actorTag: tag,
    faceCode,
    tableSha256,
    upperPoses: poses,
    mouthPoses: poses,
    neutralFallback: true,
  });
}

export class NativeTalkDeltaTransition {
  constructor(initial) {
    this.current = Float32Array.from(initial);
    this.target = Float32Array.from(initial);
    this.ticksRemaining = 0;
  }

  transition(target, ticks) {
    if (
      !(target instanceof Float32Array)
      || target.length !== this.current.length
      || !Number.isInteger(ticks)
      || ticks <= 0
    ) {
      throw new TypeError("native TALK transition is invalid");
    }
    this.target.set(target);
    this.ticksRemaining = ticks;
  }

  advanceTick() {
    if (this.ticksRemaining <= 0) return false;
    for (let index = 0; index < this.current.length; index += 1) {
      this.current[index] += (
        this.target[index] - this.current[index]
      ) / this.ticksRemaining;
    }
    this.ticksRemaining -= 1;
    if (this.ticksRemaining === 0) this.current.set(this.target);
    return true;
  }
}

/**
 * Apply the two native TALK lanes through the parsed FTBL contribution table.
 * The original executable performs the same two additive passes: upper face
 * first, then speech/expression controls.
 */
export function evaluateNativeTalkVertices({
  sourcePositions,
  vertexContributions,
  upperDeltas,
  mouthDeltas,
}) {
  if (
    !(sourcePositions instanceof Float32Array)
    || !(upperDeltas instanceof Float32Array)
    || !(mouthDeltas instanceof Float32Array)
    || upperDeltas.length !== DELTA_COUNT
    || mouthDeltas.length !== DELTA_COUNT
    || vertexContributions?.length * 3 !== sourcePositions.length
  ) {
    throw new TypeError("native TALK vertex evaluation inputs are invalid");
  }
  const result = Float32Array.from(sourcePositions);
  for (let vertexIndex = 0; vertexIndex < vertexContributions.length; vertexIndex += 1) {
    const outputOffset = vertexIndex * 3;
    for (const { controlIndex, weight } of vertexContributions[vertexIndex]) {
      const deltaOffset = controlIndex * 3;
      result[outputOffset] += (
        upperDeltas[deltaOffset] + mouthDeltas[deltaOffset]
      ) * weight;
      result[outputOffset + 1] += (
        upperDeltas[deltaOffset + 1] + mouthDeltas[deltaOffset + 1]
      ) * weight;
      result[outputOffset + 2] += (
        upperDeltas[deltaOffset + 2] + mouthDeltas[deltaOffset + 2]
      ) * weight;
    }
  }
  return result;
}

export const NATIVE_TALK_CONTROL_COUNT = CONTROL_COUNT;
