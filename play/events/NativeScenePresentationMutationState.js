const PRESENTATION_KINDS = new Set([
  "object-runtime-flag",
  "object-presentation-flag",
  "object-position-vector",
  "object-secondary-vector",
  "object-scale-vector",
  "object-imgm-selection",
]);

function requireObjectTag(value) {
  const objectTag = String(value || "");
  if (
    objectTag.length !== 4
    || [...objectTag].some(character => character.codePointAt(0) > 0xff)
  ) {
    throw new TypeError(
      "native scene presentation mutation requires a four-character object tag",
    );
  }
  return objectTag;
}

function requireVectorWords(value) {
  if (
    !Array.isArray(value)
    || value.length !== 3
    || value.some(word => (
      !Number.isInteger(word) || word < 0 || word > 0xffffffff
    ))
  ) {
    throw new TypeError(
      "native scene presentation vector must contain three uint32 words",
    );
  }
  return Object.freeze(value.map(word => word >>> 0));
}

function normalizeMutation(value) {
  if (!value || !PRESENTATION_KINDS.has(value.kind)) {
    throw new TypeError("native scene presentation mutation kind is invalid");
  }
  const mutation = {
    kind: value.kind,
    objectTag: requireObjectTag(value.objectTag),
  };
  if (value.kind === "object-imgm-selection") {
    if (
      !Number.isInteger(value.selection)
      || value.selection < 0
      || value.selection > 0xff
    ) {
      throw new TypeError(
        "native scene presentation IMGM selection must be a byte",
      );
    }
    mutation.selection = value.selection;
  } else if (
    value.kind === "object-runtime-flag"
    || value.kind === "object-presentation-flag"
  ) {
    if (typeof value.enabled !== "boolean") {
      throw new TypeError(
        "native scene presentation flag mutation must be boolean",
      );
    }
    mutation.enabled = value.enabled;
  } else {
    mutation.associated = Boolean(value.associated);
    mutation.words = requireVectorWords(value.words);
  }
  return mutation;
}

/** Ordered presentation-facing mutations made by one room gameplay state. */
export class NativeScenePresentationMutationState {
  constructor() {
    this.revision = 0;
    this.entries = [];
  }

  record(value) {
    const mutation = normalizeMutation(value);
    const entry = Object.freeze({
      revision: ++this.revision,
      ...mutation,
    });
    this.entries.push(entry);
    return entry;
  }

  currentRevision() {
    return this.revision;
  }

  readAfter(revision = 0) {
    if (
      !Number.isSafeInteger(revision)
      || revision < 0
      || revision > this.revision
    ) {
      throw new RangeError(
        "native scene presentation revision is outside the retained range",
      );
    }
    return Object.freeze({
      revision: this.revision,
      mutations: Object.freeze(
        this.entries.slice(revision).map(entry => Object.freeze({
          ...entry,
          ...(entry.words ? { words: Object.freeze([...entry.words]) } : {}),
        })),
      ),
    });
  }
}

export function createNativeScenePresentationMutationState() {
  return new NativeScenePresentationMutationState();
}
