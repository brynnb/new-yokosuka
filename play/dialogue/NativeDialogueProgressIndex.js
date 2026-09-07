import {
  NATIVE_DIALOGUE_PROGRESS_INDEX_DATA,
} from "../data/dialogue/nativeProgressIndices.generated.js";

const FIXED_INDEX_COUNT =
  NATIVE_DIALOGUE_PROGRESS_INDEX_DATA.fixedIdentities.length;
const DYNAMIC_INDEX_START =
  NATIVE_DIALOGUE_PROGRESS_INDEX_DATA.dynamicIndexStart;
const DYNAMIC_INDEX_COUNT =
  NATIVE_DIALOGUE_PROGRESS_INDEX_DATA.dynamicIndexCount;
const INITIAL_DYNAMIC_CURSOR = DYNAMIC_INDEX_COUNT - 1;

function requireIdentity(identity) {
  if (
    typeof identity !== "string"
    || identity.length !== 4
    || [...identity].some((character) => character.charCodeAt(0) > 0xff)
  ) {
    throw new RangeError(
      `Invalid native four-byte actor identity ${String(identity)}`,
    );
  }
  return identity;
}

export function nativeDialogueFixedProgressIndex(identity) {
  if (typeof identity !== "string" || identity.length !== 4) return null;
  const index = NATIVE_DIALOGUE_PROGRESS_INDEX_DATA
    .indexByIdentity[identity];
  return Number.isInteger(index) ? index : null;
}

export class NativeDialogueProgressIndexAllocator {
  constructor(snapshot = {}) {
    const sourceSlots = snapshot.dynamicIdentities ?? [];
    if (
      sourceSlots.length !== 0
      && sourceSlots.length !== DYNAMIC_INDEX_COUNT
    ) {
      throw new RangeError(
        `Native dialogue dynamic identity pool has ${sourceSlots.length} `
        + `slots; expected ${DYNAMIC_INDEX_COUNT}`,
      );
    }
    this.dynamicIdentities = sourceSlots.length === 0
      ? Array(DYNAMIC_INDEX_COUNT).fill(null)
      : sourceSlots.map((identity) => (
        identity === null ? null : requireIdentity(identity)
      ));
    const cursor = snapshot.dynamicCursor ?? INITIAL_DYNAMIC_CURSOR;
    if (
      !Number.isInteger(cursor)
      || cursor < 0
      || cursor >= DYNAMIC_INDEX_COUNT
    ) {
      throw new RangeError(
        `Invalid native dialogue dynamic identity cursor ${cursor}`,
      );
    }
    this.dynamicCursor = cursor;
  }

  resolve(identity) {
    const actorIdentity = requireIdentity(identity);
    const fixedIndex = nativeDialogueFixedProgressIndex(actorIdentity);

    // The native caller treats lookup result zero as unresolved. AKIR is
    // physically present at fixed slot zero, but this allocator therefore
    // follows the dynamic path for it just as it does for absent identities.
    if (fixedIndex !== null && fixedIndex !== 0) return fixedIndex;

    const existing = this.dynamicIdentities.indexOf(actorIdentity);
    if (existing !== -1) return DYNAMIC_INDEX_START + existing;

    this.dynamicCursor += 1;
    if (this.dynamicCursor >= DYNAMIC_INDEX_COUNT) {
      this.dynamicCursor = 0;
    }
    this.dynamicIdentities[this.dynamicCursor] = actorIdentity;
    return DYNAMIC_INDEX_START + this.dynamicCursor;
  }

  toJSON() {
    return {
      schema: "new-yokosuka-native-dialogue-progress-indices-v1",
      dynamicCursor: this.dynamicCursor,
      dynamicIdentities: [...this.dynamicIdentities],
    };
  }
}

export function createNativeDialogueProgressIndexAllocator(snapshot) {
  return new NativeDialogueProgressIndexAllocator(snapshot);
}

export const NATIVE_DIALOGUE_FIXED_PROGRESS_INDEX_COUNT =
  FIXED_INDEX_COUNT;
export const NATIVE_DIALOGUE_DYNAMIC_PROGRESS_INDEX_START =
  DYNAMIC_INDEX_START;
export const NATIVE_DIALOGUE_DYNAMIC_PROGRESS_INDEX_COUNT =
  DYNAMIC_INDEX_COUNT;
