const SLOT_COUNT = 70;

function requirePointer(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative pointer`);
  }
  return value;
}

function requireSlot(value) {
  if (!Number.isSafeInteger(value) || value < 0 || value >= SLOT_COUNT) {
    throw new RangeError(
      `operation 0x013e slot must be an integer from 0 through ${SLOT_COUNT - 1}`,
    );
  }
  return value;
}

function bindingKey(slot, primaryPointer, secondaryPointer) {
  return `${slot}:${primaryPointer}:${secondaryPointer}`;
}

export class NativeOperation013eState {
  constructor() {
    this.clear();
  }

  clear() {
    this.declaredBindings = new Set();
    this.slots = Array(SLOT_COUNT).fill(null);
  }

  prepareProgramBindings(program) {
    const bindings = program?.operation013eStaticBindings ?? [];
    if (!Array.isArray(bindings)) {
      throw new TypeError(
        "native operation 0x013e program bindings must be an array",
      );
    }
    const declaredBindings = new Set();
    for (const binding of bindings) {
      const slot = requireSlot(binding?.slot);
      const primaryPointer = requirePointer(
        binding?.primaryPointer,
        "operation 0x013e primary resource",
      );
      const secondaryPointer = requirePointer(
        binding?.secondaryPointer,
        "operation 0x013e secondary resource",
      );
      declaredBindings.add(bindingKey(slot, primaryPointer, secondaryPointer));
    }
    this.declaredBindings = declaredBindings;
    return bindings.length;
  }

  installEmbedded({ slot, activityId }) {
    const selectedSlot = requireSlot(slot);
    const identity = String(activityId || "").trim();
    if (!identity) {
      throw new TypeError("embedded AUTH activity identity is required");
    }
    if (this.slots[selectedSlot] !== null) {
      throw new Error(`operation 0x0050 slot ${selectedSlot} is already occupied`);
    }
    const binding = Object.freeze({
      kind: "map-embedded-slot",
      activityId: identity,
    });
    this.slots[selectedSlot] = binding;
    return { slot: selectedSlot, binding };
  }

  uninstallEmbedded({ slot, activityId }) {
    const selectedSlot = requireSlot(slot);
    const identity = String(activityId || "").trim();
    if (!identity) {
      throw new TypeError("embedded AUTH activity identity is required");
    }
    const binding = this.slots[selectedSlot];
    if (binding === null) {
      return { slot: selectedSlot, released: false, previous: null };
    }
    if (
      binding.kind !== "map-embedded-slot"
      || binding.activityId !== identity
    ) {
      throw new Error(
        `operation 0x0050 slot ${selectedSlot} is not owned by ${identity}`,
      );
    }
    this.slots[selectedSlot] = null;
    return { slot: selectedSlot, released: true, previous: binding };
  }

  bind({ slot, primaryPointer, secondaryPointer }) {
    const selectedSlot = requireSlot(slot);
    const primary = requirePointer(
      primaryPointer,
      "operation 0x013e primary resource",
    );
    const secondary = requirePointer(
      secondaryPointer,
      "operation 0x013e secondary resource",
    );
    const requestedKey = bindingKey(selectedSlot, primary, secondary);
    if (!this.declaredBindings.has(requestedKey)) {
      throw new Error(
        "operation 0x013e slot and resource pair are not declared by the active program"
          + ` (requested ${requestedKey}; declared ${[...this.declaredBindings].join(", ") || "none"})`,
      );
    }
    const previous = this.slots[selectedSlot];
    const binding = Object.freeze({
      primaryPointer: primary,
      secondaryPointer: secondary,
    });
    this.slots[selectedSlot] = binding;
    return { slot: selectedSlot, previous, binding };
  }

  release(slot) {
    const selectedSlot = requireSlot(slot);
    const previous = this.slots[selectedSlot];
    this.slots[selectedSlot] = null;
    return {
      slot: selectedSlot,
      previous,
      released: previous !== null,
    };
  }

  read(slot) {
    const binding = this.slots[requireSlot(slot)];
    return binding ? { ...binding } : null;
  }
}

export function createNativeOperation013eSemanticHandlers() {
  return {
    "native-operation-013e-resource-slot-control": async ({
      context,
      readArgument,
    }) => {
      const state = context.nativeOperation013eState;
      if (!state) {
        return {
          status: "stopped",
          reason: "native-operation-013e-state-missing",
        };
      }
      const mode = readArgument(0);
      const slot = readArgument(1);
      try {
        if (mode === 0) {
          return {
            status: "continued",
            mutation: state.bind({
              slot,
              primaryPointer: readArgument(2),
              secondaryPointer: readArgument(3),
            }),
          };
        }
        if (mode === 1) {
          return {
            status: "continued",
            mutation: state.release(slot),
          };
        }
      } catch (error) {
        return {
          status: "stopped",
          reason: {
            kind: "native-operation-013e-contract-failed",
            message: error instanceof Error ? error.message : String(error),
          },
        };
      }
      return {
        status: "stopped",
        reason: "native-operation-013e-mode-unproved",
      };
    },
  };
}

export function createNativeOperation013eState() {
  return new NativeOperation013eState();
}
