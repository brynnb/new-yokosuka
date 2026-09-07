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
    recordSelector: 0x28a0,
    recordWord0: 0,
    resourceWord8: 0,
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

  initializePrimary(recordSelector) {
    const selector = requireWord(recordSelector, "native 0x018a primary record selector");
    this.primary = {
      allocationBytes: 0x09a0,
      allocationUnits: 25,
      recordSelector: selector,
      controllerRegistrations: Array.from(
        { length: SLOT_COUNT },
        (_, index) => ({ controller: 1, slot: index + 1, kind: 0x07b0 }),
      ),
      slots: Array.from({ length: SLOT_COUNT }, (_, index) => emptySlot(index + 1)),
    };
    return { applied: true, route: "primary-initialize", recordSelector: selector };
  }

  initializeSecondary(recordSelector) {
    const selector = requireWord(recordSelector, "native 0x018a secondary record selector");
    this.secondary = {
      allocationBytes: 0x09a0,
      allocationUnits: 50,
      recordSelector: selector,
      controllerRegistrations: [3, 2, 1].map(slot => ({
        controller: 3,
        slot,
        kind: 0x07b0,
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
    if (!this.primary) {
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
    if (!this.primary) {
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
    return {
      primary: this.primary && {
        ...this.primary,
        controllerRegistrations: this.primary.controllerRegistrations.map(value => ({ ...value })),
        slots: this.primary.slots.map(value => ({ ...value })),
      },
      secondary: this.secondary && {
        ...this.secondary,
        controllerRegistrations: this.secondary.controllerRegistrations.map(value => ({ ...value })),
      },
    };
  }
}

export function createNativeOperation018aState() {
  return new NativeOperation018aState();
}

export function createNativeOperation018aSemanticHandlers({ state } = {}) {
  const activeState = state || createNativeOperation018aState();
  return {
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
