const CUE_BYTE_LENGTH = 8;
const TERMINATOR_BYTE_LENGTH = 4;

export const NATIVE_LIP_SYNC_FORMAT = "shenmue-srf-mouth-cues-v1";
export const NATIVE_LIP_SYNC_TICK_RATE = 60;
export const NATIVE_LIP_SYNC_FRAME_RATE = 30;
export const PACKED_NATIVE_LIP_SYNC_PREFIX = "srf1:";
export const NATIVE_MOUTH_POSE_BY_SRF_SHAPE = Object.freeze([0, 3, 2, 5, 4, 1]);

function dataView(input) {
  if (input instanceof ArrayBuffer) return new DataView(input);
  if (ArrayBuffer.isView(input)) {
    return new DataView(input.buffer, input.byteOffset, input.byteLength);
  }
  throw new TypeError("SRF mouth cues must be binary data");
}

function cue(shape, durationTicks) {
  return Object.freeze({ shape, durationTicks });
}

/** Parse the exact third-block payload from a Shenmue I SRF record. */
export function parseNativeSrfMouthCues(input) {
  const view = dataView(input);
  if (view.byteLength === 0) return Object.freeze([]);
  if (
    view.byteLength < TERMINATOR_BYTE_LENGTH
    || (view.byteLength - TERMINATOR_BYTE_LENGTH) % CUE_BYTE_LENGTH !== 0
    || view.getInt16(view.byteLength - 4, true) !== -1
    || view.getInt16(view.byteLength - 2, true) !== -1
  ) {
    throw new Error("invalid SRF mouth-cue stream layout");
  }
  const cues = [];
  for (let offset = 0; offset < view.byteLength - 4; offset += CUE_BYTE_LENGTH) {
    const shape = view.getInt16(offset, true);
    const channel = view.getInt16(offset + 2, true);
    const durationTicks = view.getInt16(offset + 4, true);
    const reserved = view.getInt16(offset + 6, true);
    if (
      shape < 0
      || shape >= NATIVE_MOUTH_POSE_BY_SRF_SHAPE.length
      || channel !== 2
      || durationTicks <= 0
      || reserved !== 0
    ) {
      throw new Error("invalid SRF mouth-cue record");
    }
    cues.push(cue(shape, durationTicks));
  }
  return Object.freeze(cues);
}

function align(value, alignment = 0x800) {
  return (value + alignment - 1) & ~(alignment - 1);
}

function nativeSrfText(bytes) {
  let byteLength = bytes.byteLength;
  while (byteLength > 0 && bytes[byteLength - 1] === 0) byteLength -= 1;
  const payload = bytes.subarray(0, byteLength);
  if (payload.every(value => value < 0x80)) {
    return new TextDecoder("ascii").decode(payload);
  }
  try {
    return new TextDecoder("euc-jp", { fatal: true }).decode(payload);
  } catch {
    return new TextDecoder("shift_jis").decode(payload);
  }
}

function nativeSrfDisplayText(sourceText) {
  return sourceText.replaceAll("＆", "\n").replaceAll("=@", "...");
}

/** Parse SRF speaker, subtitle, and timing records in their native order. */
export function parseNativeSrfRecords(input) {
  const view = dataView(input);
  const bytes = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
  const decoder = new TextDecoder("ascii");
  const records = [];
  let cursor = 0;
  const remainingIsZero = start => bytes.subarray(start).every(value => value === 0);
  const readBlock = (label) => {
    if (cursor + 4 > view.byteLength) throw new Error(`truncated SRF ${label} block`);
    const length = view.getUint32(cursor, true);
    if (length < 4 || length % 4 || cursor + length > view.byteLength) {
      throw new Error(`invalid SRF ${label} block`);
    }
    const payload = bytes.subarray(cursor + 4, cursor + length);
    cursor += length;
    return payload;
  };
  while (cursor < view.byteLength) {
    if (remainingIsZero(cursor)) break;
    if (cursor + 4 <= view.byteLength && view.getUint32(cursor, true) === 0) {
      let next = align(cursor);
      if (next === cursor) next += 0x800;
      if (next > view.byteLength || bytes.subarray(cursor, next).some(Boolean)) {
        throw new Error("invalid SRF sector padding");
      }
      cursor = next;
      continue;
    }
    const recordOffset = cursor;
    const speakerBytes = readBlock("speaker");
    const textBytes = readBlock("text");
    const timing = readBlock("timing");
    const speakerId = decoder.decode(speakerBytes)
      .replace(/[\0 ]+$/g, "");
    if ([...speakerId].some(character => {
      const code = character.charCodeAt(0);
      return code < 0x20 || code > 0x7e;
    })) throw new Error("invalid SRF speaker ID");
    const sourceText = nativeSrfText(textBytes);
    records.push(Object.freeze({
      index: records.length,
      recordOffset,
      speakerId,
      sourceText,
      displayText: nativeSrfDisplayText(sourceText),
      lipSync: nativeLipSyncDescriptor(parseNativeSrfMouthCues(timing)),
    }));
  }
  return Object.freeze(records);
}

export function nativeLipSyncDescriptor(cues) {
  return Object.freeze({
    format: NATIVE_LIP_SYNC_FORMAT,
    tickRate: NATIVE_LIP_SYNC_TICK_RATE,
    cues: Object.freeze((cues || []).map(value => cue(
      Number(value?.shape),
      Number(value?.durationTicks),
    ))),
  });
}

/** Decode the compact generated-module form: repeated u8 shape/u16le duration. */
export function unpackNativeLipSync(value) {
  if (
    typeof value !== "string"
    || !value.startsWith(PACKED_NATIVE_LIP_SYNC_PREFIX)
  ) {
    throw new TypeError("unsupported packed native lip-sync descriptor");
  }
  const encoded = value.slice(PACKED_NATIVE_LIP_SYNC_PREFIX.length);
  let binary;
  try {
    binary = globalThis.atob(encoded);
  } catch {
    throw new TypeError("packed native lip-sync data is not valid Base64");
  }
  if (binary.length % 3 !== 0) {
    throw new TypeError("packed native lip-sync data has an invalid length");
  }
  const cues = [];
  for (let offset = 0; offset < binary.length; offset += 3) {
    const shape = binary.charCodeAt(offset);
    const durationTicks = (
      binary.charCodeAt(offset + 1)
      | (binary.charCodeAt(offset + 2) << 8)
    );
    if (
      shape >= NATIVE_MOUTH_POSE_BY_SRF_SHAPE.length
      || durationTicks <= 0
    ) {
      throw new TypeError("packed native lip-sync cue is invalid");
    }
    cues.push({ shape, durationTicks });
  }
  return nativeLipSyncDescriptor(cues);
}

export function validateNativeLipSync(value) {
  if (typeof value === "string") return unpackNativeLipSync(value);
  if (
    value?.format !== NATIVE_LIP_SYNC_FORMAT
    || value?.tickRate !== NATIVE_LIP_SYNC_TICK_RATE
    || !Array.isArray(value?.cues)
  ) {
    throw new TypeError("unsupported native lip-sync descriptor");
  }
  return nativeLipSyncDescriptor(value.cues.map((entry) => {
    const shape = Number(entry?.shape);
    const durationTicks = Number(entry?.durationTicks);
    if (
      !Number.isInteger(shape)
      || shape < 0
      || shape >= NATIVE_MOUTH_POSE_BY_SRF_SHAPE.length
      || !Number.isInteger(durationTicks)
      || durationTicks <= 0
    ) {
      throw new TypeError("native lip-sync cue is invalid");
    }
    return { shape, durationTicks };
  }));
}

/**
 * Deterministic SRF cue clock shared by dialogue and AUTH presentation.
 *
 * Cue durations are authored at 60 Hz, then converted by the native state
 * machine to 30 Hz face frames while retaining an odd-tick carry. The next
 * pose is requested during the final four face frames. A zero pose closes the
 * mouth over eight face frames; every speech pose changes over four. Renderers may
 * use `genericOpen` for embedded two-target NPC faces, or `pose` for the
 * separate TALK/FTBL rig.
 */
export class NativeLipSyncCuePlayer {
  constructor() {
    this.stop();
  }

  start(value) {
    const descriptor = validateNativeLipSync(value);
    this.descriptor = descriptor;
    this.cueIndex = -1;
    this.cueFramesRemaining = 0;
    this.durationResidualTicks = 0;
    this.prefetched = false;
    this.transitionTicksRemaining = 0;
    this.pose = 0;
    this.genericOpen = false;
    this.active = descriptor.cues.length > 0;
    if (this.active) this.#beginFirstCue();
    return this.active;
  }

  stop() {
    this.descriptor = null;
    this.cueIndex = -1;
    this.cueFramesRemaining = 0;
    this.durationResidualTicks = 0;
    this.prefetched = false;
    this.transitionTicksRemaining = 0;
    this.pose = 0;
    this.genericOpen = false;
    this.active = false;
  }

  advance(frames = 1) {
    if (!Number.isInteger(frames) || frames < 0) {
      throw new TypeError("native lip-sync frames must be a non-negative integer");
    }
    for (let index = 0; index < frames && this.active; index += 1) {
      if (this.transitionTicksRemaining > 0) {
        this.transitionTicksRemaining -= 1;
      }
      this.cueFramesRemaining -= 1;
      if (this.cueFramesRemaining < 1) {
        this.#beginNextCue();
      } else if (this.cueFramesRemaining < 5 && !this.prefetched) {
        const next = this.descriptor?.cues[this.cueIndex + 1];
        if (next) {
          this.prefetched = true;
          this.#requestPose(next);
        }
      }
    }
    return this.snapshot();
  }

  snapshot() {
    return Object.freeze({
      active: this.active,
      cueIndex: this.cueIndex,
      pose: this.pose,
      genericOpen: this.genericOpen,
      transitionTicksRemaining: this.transitionTicksRemaining,
      cueFramesRemaining: this.cueFramesRemaining,
      durationResidualTicks: this.durationResidualTicks,
      prefetched: this.prefetched,
    });
  }

  #beginFirstCue() {
    this.cueIndex = 0;
    const entry = this.descriptor.cues[0];
    this.#requestPose(entry, 4);
    this.#setDuration(entry.durationTicks);
  }

  #beginNextCue() {
    this.cueIndex += 1;
    const entry = this.descriptor?.cues[this.cueIndex];
    if (!entry) {
      this.active = false;
      this.pose = 0;
      this.genericOpen = false;
      this.transitionTicksRemaining = 8;
      this.cueFramesRemaining = -1;
      return;
    }
    this.prefetched = false;
    this.#requestPose(entry);
    this.#setDuration(entry.durationTicks + this.durationResidualTicks);
  }

  #requestPose(entry, transitionFrames = null) {
    const pose = NATIVE_MOUTH_POSE_BY_SRF_SHAPE[entry.shape];
    this.pose = pose;
    this.genericOpen = pose === 0 ? false : !this.genericOpen;
    this.transitionTicksRemaining = transitionFrames ?? (pose === 0 ? 8 : 4);
  }

  #setDuration(durationTicks) {
    this.cueFramesRemaining = Math.max(1, Math.trunc(durationTicks / 2));
    this.durationResidualTicks = durationTicks - this.cueFramesRemaining * 2;
  }
}
