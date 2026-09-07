function requireController(controller) {
  if (
    !controller?.id
    || !controller.entryFunction
    || !Array.isArray(controller.dispatches)
    || !controller.maintenance?.countdownCallFileOffset
  ) {
    throw new TypeError("exact native room-controller metadata is required");
  }
  return controller;
}

function fourccWord(value) {
  const code = String(value || "").toUpperCase();
  if (code.length !== 4) {
    throw new TypeError("native room-controller event code must be four characters");
  }
  let word = 0;
  for (let index = 0; index < 4; index += 1) {
    const byte = code.codePointAt(index);
    if (byte > 0xff) {
      throw new TypeError("native room-controller event code must be byte-oriented");
    }
    word |= byte << (index * 8);
  }
  return word >>> 0;
}

function copyInterpreterState(state) {
  return structuredClone({ ...state, steps: 0 });
}

export class NativeRoomControllerLifecycle {
  constructor() {
    this.checkpoints = new Map();
  }

  prepare({ roomController, interaction }) {
    const exactController = requireController(roomController);
    const eventCode = String(interaction?.objectTag || "").toUpperCase();
    const dispatches = exactController.dispatches.filter(dispatch => (
      (dispatch.eventCodes || []).includes(eventCode)
    ));
    if (
      dispatches.length !== 1
      || dispatches[0].targetFunction !== interaction?.entryFunction
    ) {
      throw new Error(
        `native room-controller dispatch for ${eventCode} is not exact`,
      );
    }
    return {
      controller: exactController,
      eventCode,
      eventWord: fourccWord(eventCode),
      entryFunction: exactController.entryFunction,
      interpreterState: this.checkpoints.get(exactController.id) ?? null,
    };
  }

  isInteractionBoundary(execution, result) {
    return Boolean(
      execution
      && result?.status === "yielded"
      && result.location?.functionId === execution.controller.entryFunction
      && result.request?.kind === "native-coroutine-continuation"
      && result.request.scheduler?.kind === "native-scheduler-countdown"
      && result.request.scheduler.callFileOffset
        === execution.controller.maintenance.countdownCallFileOffset
    );
  }

  commit(execution, state) {
    if (!execution || !state) {
      throw new TypeError("native room-controller checkpoint is required");
    }
    this.checkpoints.set(
      execution.controller.id,
      copyInterpreterState(state),
    );
  }

  reset(controllerId = null) {
    if (controllerId === null) {
      const changed = this.checkpoints.size > 0;
      this.checkpoints.clear();
      return changed;
    }
    return this.checkpoints.delete(controllerId);
  }
}

export function createNativeRoomControllerLifecycle() {
  return new NativeRoomControllerLifecycle();
}
