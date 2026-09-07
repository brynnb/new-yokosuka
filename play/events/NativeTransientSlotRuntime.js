const SLOT_COUNT = 16;

function requireInteger(value, label) {
  if (!Number.isInteger(value)) {
    throw new TypeError(`${label} must be an integer`);
  }
  return value;
}

function requireSlot(value) {
  requireInteger(value, "native transient slot");
  if (value < 0 || value >= SLOT_COUNT) {
    throw new RangeError(
      `native transient slot must be from 0 through ${SLOT_COUNT - 1}`,
    );
  }
  return value;
}

export class NativeTransientSlotState {
  constructor() {
    this.clear();
  }

  clear() {
    this.slots = Array(SLOT_COUNT).fill(null);
  }

  allocate(value) {
    const rawValue = requireInteger(value, "native transient slot value");
    for (let slot = SLOT_COUNT - 1; slot >= 0; slot -= 1) {
      if (this.slots[slot] !== null) continue;
      const record = Object.freeze({
        activeByte: 1,
        byte1: 0,
        byte2: 0,
        byte3: 0,
        valueWord: (rawValue << 16) >> 16,
      });
      this.slots[slot] = record;
      return { slot, record: { ...record } };
    }
    return { slot: -1, record: null };
  }

  release(slot) {
    const selectedSlot = requireSlot(slot);
    const previous = this.slots[selectedSlot];
    this.slots[selectedSlot] = null;
    return {
      slot: selectedSlot,
      released: previous !== null,
      previous: previous ? { ...previous } : null,
    };
  }

  read(slot) {
    const record = this.slots[requireSlot(slot)];
    return record ? { ...record } : null;
  }
}

export function createNativeTransientSlotSemanticHandlers() {
  return {
    "native-transient-slot-control": async ({ context, readArgument }) => {
      const state = context.nativeTransientSlotState;
      if (!state) {
        return {
          status: "stopped",
          reason: "native-transient-slot-state-missing",
        };
      }
      const mode = readArgument(0);
      try {
        if (mode === 1) {
          const mutation = state.allocate(readArgument(1));
          return {
            status: "continued",
            result: mutation.slot,
            mutation,
          };
        }
        if (mode === 0) {
          return {
            status: "continued",
            mutation: state.release(readArgument(1)),
          };
        }
      } catch (error) {
        return {
          status: "stopped",
          reason: {
            kind: "native-transient-slot-contract-failed",
            message: error instanceof Error ? error.message : String(error),
          },
        };
      }
      return {
        status: "stopped",
        reason: "native-transient-slot-mode-unproven",
      };
    },
  };
}

export function createNativeTransientSlotState() {
  return new NativeTransientSlotState();
}
