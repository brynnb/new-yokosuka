const SLOT_COUNT = 16;

function requireWord(value, label) {
  if (!Number.isInteger(value) || value < -0x80000000 || value > 0xffffffff) {
    throw new RangeError(`${label} must be a 32-bit word`);
  }
  return value >>> 0;
}

function emptySlot(index) {
  return {
    index,
    recordWord0: 0,
    word4: 0,
    resourceWord8: 0,
    floatWord12: 0,
    floatWord16: 0,
    floatWord20: 0,
    word24: 0,
    resourceWord28: 0,
    word32: 0,
    word36: 0,
    word40: 0,
  };
}

export class NativeOperation018aState {
  constructor() {
    this.clear();
  }

  clear() {
    this.primary = null;
    this.secondary = null;
  }

  // 0xc17b4fc allocates/zeroes AMB1 during room loading, BEFORE room scripts.
  // 0x018b writes the pool while its active pointer is still null. 0x018a is
  // activation, not allocation: recreating slots there loses authored fields.
  initializeRoomPool() {
    this.primary = {
      allocationBytes: SLOT_COUNT * 44,
      allocationTag: "AMB1",
      active: false,
      recordSelector: null,
      setupCommands: [],
      controllerRegistrations: [],
      slotCommands: [],
      slots: Array.from({ length: SLOT_COUNT }, (_, index) => emptySlot(index + 1)),
    };
    this.secondary = null;
  }

  initializePrimary(recordSelector) {
    const selector = requireWord(recordSelector, "native 0x018a primary record selector");
    if (!this.primary) throw new Error("native AMB1 room pool is unavailable");
    Object.assign(this.primary, {
      active: true,
      recordSelector: selector,
      setupCommands: [
        { command: 0x09a0, channel: 1, argument: 25 },
        { command: selector, channel: 0, argument: 0 },
      ],
      controllerRegistrations: Array.from(
        { length: SLOT_COUNT },
        (_, index) => ({ controller: 1, slot: index + 1, kind: 0x07b0, argument: 0 }),
      ),
      slotCommands: Array.from({ length: SLOT_COUNT }, (_, index) => (
        { command: 0x28a0, channel: 1, argument: index + 1 }
      )),
    });
    for (const slot of this.primary.slots) {
      slot.word32 = 0;
      slot.word36 = 0;
      slot.word40 = 0;
    }
    return { applied: true, route: "primary-initialize", recordSelector: selector };
  }

  writePrimarySlot(values, resourceOperand, tableOperand) {
    if (!this.primary) throw new Error("native AMB1 room pool is unavailable");
    if (!Array.isArray(values) || values.length !== 8) {
      throw new TypeError("native 0x018b requires eight argument words");
    }
    const [index, word4, resourceWord8, floatWord12, floatWord16, floatWord20, word24, resourceWord28]
      = values.map((value, i) => requireWord(value, `native 0x018b argument ${i}`));
    if (index < 1 || index > SLOT_COUNT) throw new RangeError("native 0x018b slot must be between 1 and 16");
    if (resourceOperand?.kind !== "static-pointer" || tableOperand?.kind !== "static-pointer") {
      throw new TypeError("native 0x018b pointer provenance is unavailable");
    }
    // These are map-relative pointer operands, not guessed process addresses.
    // Preserve their identity for the owning audio adapter's later dereference.
    const pointers = structuredClone({ resourceOperand, tableOperand });
    Object.assign(this.primary.slots[index - 1], {
      recordWord0: 1, word4, resourceWord8, floatWord12, floatWord16, floatWord20,
      word24, resourceWord28, ...pointers,
    });
    return { applied: true, route: "primary-record-write", slotIndex: index };
  }

  initializeSecondary(recordSelector) {
    const selector = requireWord(recordSelector, "native 0x018a secondary record selector");
    this.secondary = {
      recordSelector: selector,
      setupCommands: [
        { command: 0x09a0, channel: 1, argument: 50 },
        { command: selector, channel: 0, argument: 0 },
      ],
      controllerRegistrations: [3, 2, 1].map(slot => ({
        controller: 3,
        slot,
        kind: 0x07b0,
        argument: 0,
      })),
      initialized: true,
    };
    return { applied: true, route: "secondary-initialize", recordSelector: selector };
  }

  configurePrimarySlotResource(index, resourceWord8) {
    if (!this.primary || !Number.isInteger(index) || index < 1 || index > SLOT_COUNT) {
      throw new RangeError("native 0x018a primary slot is unavailable");
    }
    this.primary.slots[index - 1].resourceWord8 = requireWord(
      resourceWord8,
      "native 0x018a slot resource word",
    );
  }

  resetPrimarySlots(selectorValue) {
    const selector = requireWord(selectorValue, "native 0x018a slot selector");
    if (!this.primary?.active) {
      return { applied: false, nativeNoOp: true, reason: "primary-uninitialized" };
    }
    const indices = selector > SLOT_COUNT
      ? Array.from({ length: SLOT_COUNT }, (_, index) => SLOT_COUNT - index)
      : [selector];
    if (indices.some(index => index < 1 || index > SLOT_COUNT)) {
      throw new RangeError("native 0x018a slot selector must be between 1 and 16");
    }
    const controllerRequests = [];
    for (const index of indices) {
      const slot = this.primary.slots[index - 1];
      slot.recordWord0 = 0;
      slot.word32 = 0;
      slot.word36 = 127;
      slot.word40 = 0xffffffff;
      controllerRequests.push({ controller: 1, slot: index, kind: 0x07b0, argument: 0 });
    }
    return {
      applied: true,
      route: "primary-slot-reset",
      selector,
      slotIndices: indices,
      controllerRequests,
    };
  }

  markPrimarySlot(selectorValue) {
    const selector = requireWord(selectorValue, "native 0x018a slot selector");
    if (!this.primary?.active) {
      return { applied: false, nativeNoOp: true, reason: "primary-uninitialized" };
    }
    if (selector < 1 || selector > SLOT_COUNT) {
      throw new RangeError("native 0x018a slot selector must be between 1 and 16");
    }
    const slot = this.primary.slots[selector - 1];
    if (slot.resourceWord8 === 0) {
      return { applied: false, nativeNoOp: true, reason: "slot-resource-null", slotIndex: selector };
    }
    slot.recordWord0 = 1;
    return { applied: true, route: "primary-slot-conditional-mark", slotIndex: selector };
  }

  snapshot() {
    return structuredClone({ primary: this.primary, secondary: this.secondary });
  }

  restore(snapshot) {
    const { primary, secondary } = structuredClone(snapshot);
    this.primary = primary;
    this.secondary = secondary;
  }
}

export function createNativeOperation018aState() {
  return new NativeOperation018aState();
}

export function createNativeOperation018aSemanticHandlers({ state } = {}) {
  const activeState = state || createNativeOperation018aState();
  return {
    "native-operation-018b-primary-record-write": ({ action, readArgument }) => {
      try {
        return { status: "continued", mutation: activeState.writePrimarySlot(
          action.arguments.map((_, i) => readArgument(i)),
          action.arguments[2], action.arguments[7],
        ) };
      } catch (error) {
        return { status: "stopped", reason: error.message };
      }
    },
    "native-operation-018a-primary-initialize": ({ readArgument }) => {
      try {
        return { status: "continued", mutation: activeState.initializePrimary(readArgument(1)) };
      } catch (error) {
        return { status: "stopped", reason: error.message };
      }
    },
    "native-operation-018a-secondary-initialize": ({ readArgument }) => {
      try {
        return { status: "continued", mutation: activeState.initializeSecondary(readArgument(1)) };
      } catch (error) {
        return { status: "stopped", reason: error.message };
      }
    },
    "native-operation-018a-primary-slot-reset": ({ readArgument }) => {
      try {
        return { status: "continued", mutation: activeState.resetPrimarySlots(readArgument(1)) };
      } catch (error) {
        return { status: "stopped", reason: error.message };
      }
    },
    "native-operation-018a-primary-slot-conditional-mark": ({ readArgument }) => {
      try {
        return { status: "continued", mutation: activeState.markPrimarySlot(readArgument(1)) };
      } catch (error) {
        return { status: "stopped", reason: error.message };
      }
    },
  };
}
