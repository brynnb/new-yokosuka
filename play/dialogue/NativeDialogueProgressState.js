import {
  NATIVE_DIALOGUE_PROGRESS_INDEX_DATA,
} from "../data/dialogue/nativeProgressIndices.generated.js";

const RECORD_COUNT = 325;
const RECORD_SIZE = 12;
const INITIAL_METRIC_THRESHOLD = 9;

const OFFSETS = Object.freeze({
  selected: 0,
  continuation: 2,
  boundary: 4,
  latest: 6,
  auxiliary: 8,
});

function requireIndex(index) {
  const numeric = Number(index);
  if (!Number.isInteger(numeric) || numeric < 0 || numeric >= RECORD_COUNT) {
    throw new RangeError(`Invalid native dialogue progress index ${index}`);
  }
  return numeric;
}

function requireOffset(value, label) {
  const numeric = Number(value);
  if (!Number.isInteger(numeric) || numeric < 0 || numeric > 0xffff) {
    throw new RangeError(`${label} is not a native unsigned offset`);
  }
  return numeric;
}

function signed24(bytes, offset) {
  const encoded = (
    (bytes[offset] << 16)
    | (bytes[offset + 1] << 8)
    | bytes[offset + 2]
  );
  return encoded & 0x800000 ? encoded | 0xff000000 : encoded;
}

export class NativeDialogueProgressState {
  constructor(snapshot = {}) {
    const source = snapshot.bytes ?? snapshot;
    this.bytes = source instanceof Uint8Array
      ? source.slice()
      : Uint8Array.from(source.length === undefined ? [] : source);
    if (this.bytes.length === 0) {
      this.bytes = new Uint8Array(RECORD_COUNT * RECORD_SIZE);
      const view = new DataView(this.bytes.buffer);
      for (let index = 0; index < RECORD_COUNT; index += 1) {
        view.setFloat32(
          index * RECORD_SIZE + OFFSETS.auxiliary,
          INITIAL_METRIC_THRESHOLD,
          true,
        );
      }
    }
    if (this.bytes.length !== RECORD_COUNT * RECORD_SIZE) {
      throw new RangeError(
        `Native dialogue progress has ${this.bytes.length} bytes; `
        + `expected ${RECORD_COUNT * RECORD_SIZE}`,
      );
    }
    this.view = new DataView(
      this.bytes.buffer,
      this.bytes.byteOffset,
      this.bytes.byteLength,
    );
  }

  record(index) {
    const start = requireIndex(index) * RECORD_SIZE;
    return {
      selectedEntryOffset: this.view.getUint16(start + OFFSETS.selected, true),
      continuationOffset: this.view.getUint16(
        start + OFFSETS.continuation,
        true,
      ),
      authoredBoundaryOffset: this.view.getUint16(
        start + OFFSETS.boundary,
        true,
      ),
      latestResumeOffset: this.view.getUint16(
        start + OFFSETS.latest,
        true,
      ),
      auxiliaryState: this.view.getUint32(
        start + OFFSETS.auxiliary,
        true,
      ),
      metricThreshold: this.view.getFloat32(
        start + OFFSETS.auxiliary,
        true,
      ),
    };
  }

  writeOffset(index, field, value) {
    if (!(field in OFFSETS) || field === "auxiliary") {
      throw new RangeError(`Unknown native dialogue progress field ${field}`);
    }
    const start = requireIndex(index) * RECORD_SIZE;
    this.view.setUint16(
      start + OFFSETS[field],
      requireOffset(value, field),
      true,
    );
  }

  beginSelection(index, selectedEntryOffset) {
    const selected = requireOffset(
      selectedEntryOffset,
      "selectedEntryOffset",
    );
    const current = this.record(index);
    if (current.selectedEntryOffset === selected) return false;
    this.writeOffset(index, "selected", selected);
    this.writeOffset(index, "continuation", 0);
    this.writeOffset(index, "boundary", 0);
    this.writeOffset(index, "latest", 0);
    return true;
  }

  recordProgressOffset(index, offset) {
    this.writeOffset(index, "selected", offset);
  }

  resolveProgressRedirect(index, followingOffset, hasSavedContinuation) {
    const following = requireOffset(followingOffset, "followingOffset");
    const record = this.record(index);
    let resolved = following;
    let yieldState5 = false;
    if (!hasSavedContinuation) {
      if (following === record.selectedEntryOffset) {
        if (record.latestResumeOffset !== 0) {
          resolved = record.latestResumeOffset;
        }
        if (resolved < record.authoredBoundaryOffset) {
          resolved = record.authoredBoundaryOffset - 2;
        }
        if (resolved < record.continuationOffset) {
          resolved = record.continuationOffset;
          yieldState5 = true;
        }
      } else {
        this.writeOffset(index, "latest", following);
        this.writeOffset(index, "boundary", 0);
      }
    }
    this.writeOffset(index, "continuation", 0);
    return { offset: resolved, yieldState5 };
  }

  completeState5(index, routingBytes, runtime = {}) {
    const bytes = routingBytes instanceof Uint8Array
      ? routingBytes
      : Uint8Array.from(routingBytes || []);
    const currentOffset = requireOffset(
      runtime.currentOffset,
      "currentOffset",
    );
    let flags1e = Number(runtime.flags1e ?? 0) & 0xffff;

    // Native update 0x0c15cc04 takes the saved progress route only while
    // bit 0 is set and bit 6 is clear. All other completions advance the
    // current pointer by the three deferred bytes following F2.
    if ((flags1e & 0x01) === 0 || (flags1e & 0x40) !== 0) {
      return {
        currentOffset: requireOffset(
          currentOffset + 3,
          "completedCurrentOffset",
        ),
        continuation5cOffset: runtime.continuation5cOffset ?? null,
        flags1e,
        usedProgressContinuation: false,
      };
    }

    const continuationOffset = this.record(index).continuationOffset;
    if (continuationOffset + 3 > bytes.length) {
      throw new RangeError(
        "Native dialogue state-5 continuation exceeds its routing stream",
      );
    }
    const operandEnd = continuationOffset + 3;
    const displacement = signed24(bytes, continuationOffset);
    flags1e &= ~0x01;
    if (displacement === 0) {
      return {
        currentOffset: operandEnd,
        continuation5cOffset: null,
        flags1e,
        usedProgressContinuation: true,
        displacement,
      };
    }
    const target = operandEnd + displacement;
    requireOffset(target, "state5TargetOffset");
    flags1e |= 0x80;
    return {
      currentOffset: target,
      continuation5cOffset: operandEnd,
      flags1e,
      usedProgressContinuation: true,
      displacement,
    };
  }

  bodyContext(index, routingBaseOffset = 0) {
    const progressIndex = requireIndex(index);
    const routingBase = Number(routingBaseOffset);
    return {
      recordNativeDialogueProgressOffset: ({ followingOffset }) => {
        this.recordProgressOffset(
          progressIndex,
          followingOffset - routingBase,
        );
        return true;
      },
      readNativeDialogueProgressRedirect: ({
        followingOffset,
        hasSavedContinuation,
      }) => {
        const result = this.resolveProgressRedirect(
          progressIndex,
          followingOffset - routingBase,
          hasSavedContinuation,
        );
        return {
          offset: routingBase + result.offset,
          yieldState5: result.yieldState5,
        };
      },
      completeNativeDialogueState5: ({
        routingBytes,
        currentOffset,
        continuation5cOffset,
        flags1e,
      }) => this.completeState5(progressIndex, routingBytes, {
        currentOffset,
        continuation5cOffset,
        flags1e,
      }),
    };
  }

  toJSON() {
    return {
      schema: "new-yokosuka-native-dialogue-progress-v1",
      bytes: [...this.bytes],
    };
  }
}

export function createNativeDialogueProgressState(snapshot) {
  return new NativeDialogueProgressState(snapshot);
}

export function nativeDialogueProgressIndexForIdentity(identity) {
  if (typeof identity !== "string" || identity.length !== 4) return null;
  const index = NATIVE_DIALOGUE_PROGRESS_INDEX_DATA
    .indexByIdentity[identity];
  return Number.isInteger(index) ? index : null;
}

export const NATIVE_DIALOGUE_PROGRESS_RECORD_COUNT = RECORD_COUNT;
export const NATIVE_DIALOGUE_DYNAMIC_PROGRESS_INDEX_START =
  NATIVE_DIALOGUE_PROGRESS_INDEX_DATA.dynamicIndexStart;
export const NATIVE_DIALOGUE_DYNAMIC_PROGRESS_INDEX_COUNT =
  NATIVE_DIALOGUE_PROGRESS_INDEX_DATA.dynamicIndexCount;
