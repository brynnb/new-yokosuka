const SLOT_COUNT = 70;

function requireSlot(value) {
  if (!Number.isSafeInteger(value) || value < 0 || value >= SLOT_COUNT) {
    throw new RangeError(
      `operation 0x0050 slot must be an integer from 0 through ${SLOT_COUNT - 1}`,
    );
  }
  return value;
}

function requireActivity(detail, slot) {
  if (!detail || typeof detail !== "object" || Array.isArray(detail)) {
    throw new TypeError("operation 0x0050 activity adapter returned no activity");
  }
  if (!Number.isSafeInteger(detail.durationFrames) || detail.durationFrames < 0) {
    throw new RangeError(
      "operation 0x0050 activity duration must be a non-negative frame count",
    );
  }
  const activityId = String(detail.activityId || "").trim();
  if (!activityId) {
    throw new TypeError("operation 0x0050 activity must have an exact identity");
  }
  return Object.freeze({
    activityId,
    slot,
    durationFrames: detail.durationFrames,
    currentFrame: 0,
    stateByte: 1,
    delayedStopLatch: 0,
    word40: 0,
  });
}

export class NativeOperation0050State {
  constructor() {
    this.clear();
  }

  clear() {
    this.active = null;
    this.retainedDelayedStopLatch = 0;
    this.slotWord10 = Array(SLOT_COUNT).fill(0);
  }

  start(slot, activity) {
    const selectedSlot = requireSlot(slot);
    const previous = this.active;
    this.active = requireActivity(activity, selectedSlot);
    this.retainedDelayedStopLatch = 0;
    return { previous, active: this.read() };
  }

  writeSlotWord10(slot, value) {
    const selectedSlot = requireSlot(slot);
    const previous = this.slotWord10[selectedSlot];
    const word10 = value === 0 ? 0 : 1;
    this.slotWord10[selectedSlot] = word10;
    return { slot: selectedSlot, previous, word10 };
  }

  readSlotWord10(slot) {
    return this.slotWord10[requireSlot(slot)];
  }

  activeWord40() {
    return this.active?.word40 ?? 0;
  }

  advance() {
    if (!this.active) return null;
    if (this.active.currentFrame >= this.active.durationFrames) return null;
    const previousFrame = this.active.currentFrame;
    const currentFrame = Math.min(
      this.active.durationFrames,
      previousFrame + 1,
    );
    this.active = Object.freeze({ ...this.active, currentFrame });
    return {
      activityId: this.active.activityId,
      slot: this.active.slot,
      previousFrame,
      currentFrame,
      durationFrames: this.active.durationFrames,
    };
  }

  shouldComplete() {
    return Boolean(
      this.active
      && this.active.currentFrame >= this.active.durationFrames,
    );
  }

  complete() {
    const previous = this.active;
    if (previous) {
      this.retainedDelayedStopLatch = previous.delayedStopLatch;
    }
    this.active = null;
    return previous ? { ...previous } : null;
  }

  delayedStopLatch() {
    return this.active?.delayedStopLatch ?? this.retainedDelayedStopLatch;
  }

  statusByte() {
    return this.active?.stateByte ?? 0;
  }

  read() {
    return this.active ? { ...this.active } : null;
  }
}

function stopped(error) {
  return {
    status: "stopped",
    reason: {
      kind: "native-operation-0050-contract-failed",
      message: error instanceof Error ? error.message : String(error),
    },
  };
}

export function createNativeOperation0050SemanticHandlers({
  startActivity,
  stopActivity = () => true,
} = {}) {
  return {
    "native-operation-0050-aseq-activity-control": async ({
      context,
      readArgument,
    }) => {
      const state = context.nativeOperation0050State;
      const resources = context.nativeOperation013eState;
      if (!state || !resources) {
        return {
          status: "stopped",
          reason: "native-operation-0050-state-missing",
        };
      }
      const rawMode = readArgument(0);
      if (!Number.isInteger(rawMode)) {
        return stopped(new TypeError("operation 0x0050 mode is unavailable"));
      }
      const mode = rawMode >> 0;
      try {
        if (mode >= 0) {
          const slot = requireSlot(mode);
          const binding = resources.read(slot);
          if (!binding) {
            throw new Error(
              `operation 0x0050 slot ${slot} has no installed AUTH resource`,
            );
          }
          if (typeof startActivity !== "function") {
            throw new Error("operation 0x0050 activity adapter is unavailable");
          }
          const previous = state.read();
          if (previous) {
            const stoppedPrevious = await stopActivity({
              reason: "replaced",
              activity: previous,
            });
            if (stoppedPrevious !== true) {
              throw new Error("operation 0x0050 adapter rejected replacement");
            }
            state.complete();
          }
          const activity = await startActivity({ slot, binding });
          try {
            return {
              status: "continued",
              mutation: state.start(slot, activity),
            };
          } catch (error) {
            await stopActivity({ reason: "invalid-start", activity });
            throw error;
          }
        }
        if (mode === -1) {
          if (state.shouldComplete()) {
            const activity = state.read();
            const accepted = await stopActivity({
              reason: "complete",
              activity,
            });
            if (accepted !== true) {
              throw new Error("operation 0x0050 adapter rejected completion");
            }
            state.complete();
          }
          return { result: state.statusByte() };
        }
        if (mode === -7) {
          return { result: state.delayedStopLatch() };
        }
        if (mode === -12) {
          return {
            status: "continued",
            mutation: state.writeSlotWord10(readArgument(1), readArgument(2)),
          };
        }
        if (mode === -10) {
          return { result: state.activeWord40() };
        }
        if (mode === -6) {
          const activity = state.read();
          if (activity) {
            const accepted = await stopActivity({
              reason: "native-stop",
              activity,
            });
            if (accepted !== true) {
              throw new Error("operation 0x0050 adapter rejected native stop");
            }
            state.complete();
          }
          return { status: "continued" };
        }
        if (mode === -9) {
          return { status: "continued" };
        }
      } catch (error) {
        return stopped(error);
      }
      return {
        status: "stopped",
        reason: "native-operation-0050-mode-unproved",
      };
    },
  };
}

export function createNativeOperation0050State() {
  return new NativeOperation0050State();
}
