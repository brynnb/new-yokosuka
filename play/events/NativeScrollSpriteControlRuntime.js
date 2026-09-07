const SLOT_COUNT = 3;

function requireWord(value, label) {
  if (!Number.isInteger(value)) {
    throw new TypeError(`${label} must be an integer word`);
  }
  return value >>> 0;
}

function requireSlot(value) {
  if (!Number.isInteger(value) || value < 0 || value >= SLOT_COUNT) {
    throw new RangeError("native SCRL slot must be between 0 and 2");
  }
  return value;
}

export class NativeScrollSpriteControlState {
  constructor() {
    this.slots = Array.from({ length: SLOT_COUNT }, () => ({
      active: false,
      transition: null,
      resource: null,
    }));
    this.transitionLocked = false;
    this.transitionRequestId = 0;
    this.signedWord58 = 0;
    this.signedWord5c = 0;
  }

  configureSlot(index, { active, transition = null, resource = null } = {}) {
    const slot = this.slots[requireSlot(index)];
    if (typeof active !== "boolean") {
      throw new TypeError("native SCRL slot activity must be Boolean");
    }
    slot.active = active;
    slot.transition = transition === null ? null : { ...transition };
    slot.resource = resource;
    return this.readSlot(index);
  }

  allocateSlot({ slotIndex, path, name, resource }) {
    const slot = this.slots[requireSlot(slotIndex)];
    if (typeof path !== "string" || path.length === 0) {
      throw new TypeError("native SCRL resource path must be a non-empty string");
    }
    if (typeof name !== "string" || name.length === 0) {
      throw new TypeError("native SCRL resource name must be a non-empty string");
    }
    const previous = this.readSlot(slotIndex);
    slot.active = true;
    slot.transition = null;
    slot.resource = resource ?? Object.freeze({ path, name, slotIndex });
    return { applied: true, slotIndex, path, name, previous, resource: slot.resource };
  }

  configureTransitionLock(locked) {
    if (typeof locked !== "boolean") {
      throw new TypeError("native SCRL transition lock must be Boolean");
    }
    this.transitionLocked = locked;
  }

  releaseSlot({ slotIndex, cleanupMode }) {
    const slot = this.slots[requireSlot(slotIndex)];
    const mode = requireWord(cleanupMode, "native SCRL cleanup mode");
    if (![0, 1].includes(mode)) {
      throw new RangeError("native SCRL cleanup mode must be zero or one");
    }
    if (!slot.active) {
      return { applied: false, nativeNoOp: true, slotIndex };
    }
    const previous = this.readSlot(slotIndex);
    slot.active = false;
    slot.transition = null;
    slot.resource = null;
    return { applied: true, slotIndex, cleanupMode: mode, previous };
  }

  requestTransition({ slotIndex, controlMode, duration }) {
    const slot = this.slots[requireSlot(slotIndex)];
    const mode = requireWord(controlMode, "native SCRL transition mode");
    const frames = requireWord(duration, "native SCRL transition duration");
    if (!slot.active || this.transitionLocked) {
      return {
        applied: false,
        nativeNoOp: true,
        reason: slot.active ? "transition-locked" : "slot-inactive",
        slotIndex,
      };
    }
    const requestId = ++this.transitionRequestId;
    slot.transition = { controlMode: mode, duration: frames, requestId };
    return {
      applied: true,
      slotIndex,
      transition: { ...slot.transition },
    };
  }

  writeSignedWord(field, value) {
    if (!["signedWord58", "signedWord5c"].includes(field)) {
      throw new RangeError("native SCRL signed-word field is invalid");
    }
    const raw = requireWord(value, `native SCRL ${field}`);
    const previous = this[field];
    this[field] = raw << 16 >> 16;
    return { field, previous, value: this[field], rawValue: raw };
  }

  readSlot(index) {
    const slot = this.slots[requireSlot(index)];
    return {
      active: slot.active,
      transition: slot.transition === null ? null : { ...slot.transition },
      resource: slot.resource,
    };
  }

  readGlobals() {
    return {
      transitionLocked: this.transitionLocked,
      signedWord58: this.signedWord58,
      signedWord5c: this.signedWord5c,
    };
  }
}

export function createNativeScrollSpriteControlState() {
  return new NativeScrollSpriteControlState();
}

export function createNativeScrollSpriteControlSemanticHandlers({
  queueNativeScrollSpriteResource,
  releaseNativeScrollSpriteResource,
} = {}) {
  return {
    "scroll-sprite-resource-allocation": async ({
      action,
      context,
      readArgument,
    }) => {
      try {
        const mode = readArgument(0);
        if (mode !== 0 && mode !== 1) {
          return { status: "stopped", reason: "native-scroll-allocation-mode-unproved" };
        }
        if (
          action.arguments?.[1]?.kind !== "static-pointer"
          || action.arguments?.[2]?.kind !== "static-pointer"
        ) {
          return { status: "stopped", reason: "native-scroll-resource-pointer-unproved" };
        }
        const resolve = context.resolveNativeStaticString;
        if (typeof resolve !== "function") {
          return { status: "stopped", reason: "native-scroll-static-string-resolver-missing" };
        }
        const pathPointer = readArgument(1);
        const namePointer = readArgument(2);
        const path = resolve(pathPointer);
        const name = resolve(namePointer);
        if (typeof path !== "string" || typeof name !== "string") {
          return { status: "stopped", reason: "native-scroll-resource-string-unavailable" };
        }
        const slotIndex = mode === 0 ? 0 : requireSlot(readArgument(3));
        const queue = queueNativeScrollSpriteResource
          || context.queueNativeScrollSpriteResource;
        if (typeof queue !== "function") {
          return { status: "stopped", reason: "native-scroll-resource-queue-missing" };
        }
        const queued = await queue({
          path,
          name,
          slotIndex,
          source: {
            functionFileOffset: context.location?.functionId,
            callFileOffset: action.callFileOffset,
          },
        });
        if (!queued || queued.resource === undefined || queued.resource === null) {
          return { status: "stopped", reason: "native-scroll-resource-unavailable" };
        }
        const mutation = context.nativeScrollSpriteControlState?.allocateSlot({
          slotIndex,
          path,
          name,
          resource: queued.resource,
        });
        return mutation
          ? { status: "continued", mutation, resource: queued.resource }
          : { status: "stopped", reason: "native-scroll-control-state-missing" };
      } catch (error) {
        return { status: "stopped", reason: error.message };
      }
    },
    "scroll-sprite-slot-release": async ({ context, readArgument }) => {
      try {
        const mutation = context.nativeScrollSpriteControlState?.releaseSlot({
          cleanupMode: readArgument(1),
          slotIndex: readArgument(2),
        });
        if (mutation?.applied) {
          const release = releaseNativeScrollSpriteResource
            || context.releaseNativeScrollSpriteResource;
          await release?.({
            slotIndex: mutation.slotIndex,
            resource: mutation.previous.resource,
          });
        }
        return mutation
          ? { status: "continued", mutation }
          : { status: "stopped", reason: "native-scroll-control-state-missing" };
      } catch (error) {
        return { status: "stopped", reason: error.message };
      }
    },
    "scroll-sprite-transition-request": ({ context, readArgument }) => {
      try {
        const mutation = context.nativeScrollSpriteControlState?.requestTransition({
          controlMode: readArgument(1),
          slotIndex: readArgument(2),
          duration: readArgument(3),
        });
        return mutation
          ? { status: "continued", mutation }
          : { status: "stopped", reason: "native-scroll-control-state-missing" };
      } catch (error) {
        return { status: "stopped", reason: error.message };
      }
    },
    "scroll-sprite-global-signed-word-write": ({ context, readArgument }) => {
      try {
        const mode = readArgument(0);
        const field = mode === 4
          ? "signedWord58"
          : mode === 5
            ? "signedWord5c"
            : null;
        if (field === null) {
          return { status: "stopped", reason: "native-scroll-signed-word-mode-unproved" };
        }
        const mutation = context.nativeScrollSpriteControlState?.writeSignedWord(
          field,
          readArgument(1),
        );
        return mutation
          ? { status: "continued", mutation }
          : { status: "stopped", reason: "native-scroll-control-state-missing" };
      } catch (error) {
        return { status: "stopped", reason: error.message };
      }
    },
  };
}
