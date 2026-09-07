const ADDRESS = Object.freeze({
  flags: 0x0c22476b,
  configurationWord: 0x0c224788,
  primaryIndex: 0x0c22478c,
  word770: 0x0c224770,
  word758: 0x0c224758,
  float75c: 0x0c22475c,
  float760: 0x0c224760,
  float764: 0x0c224764,
  word7cc: 0x0c2247cc,
  word7c8: 0x0c2247c8,
  cleanupArgument0: 0x0c2247d0,
  cleanupArgument1: 0x0c2247d1,
  mode: 0x0c29b130,
  secondaryIndex: 0x0c29b134,
  wordB138: 0x0c29b138,
  selector5Word: 0x0c22483c,
  word840: 0x0c224840,
  word844: 0x0c224844,
  word848: 0x0c224848,
  word84c: 0x0c22484c,
  wordB13c: 0x0c29b13c,
  selectedByteA: 0x0c216cf4,
  selectedByteB: 0x0c216cf3,
  secondaryByte: 0x0c216cf6,
  selectionWord: 0x0c216d24,
});

function requireFieldAccess(readField, writeField) {
  if (typeof readField !== "function" || typeof writeField !== "function") {
    throw new TypeError("native global controller field access is required");
  }
}

function requireInteger(value, label) {
  if (!Number.isInteger(value)) {
    throw new Error(`native global controller ${label} is unavailable`);
  }
  return value;
}

function signed32(value) {
  return value >> 0;
}

function dword(offset, value) {
  return { offset, width: 4, value: value >>> 0 };
}

export class NativeGlobalControllerState {
  constructor({ readField, writeField }) {
    requireFieldAccess(readField, writeField);
    this.readField = readField;
    this.writeField = writeField;
    this.pendingEvents = [];
    this.initializedRange = null;
  }

  enqueueEvent(eventCode) {
    requireInteger(eventCode, "event code");
    this.pendingEvents.push(eventCode >>> 0);
    return this.pendingEvents.length;
  }

  pollEvent() {
    return this.pendingEvents.length > 0
      ? signed32(this.pendingEvents.shift())
      : -1;
  }

  initializeRange({ argument0, argument1, argument2 }) {
    for (const [label, value] of Object.entries({
      argument0,
      argument1,
      argument2,
    })) {
      requireInteger(value, label);
    }
    this.initializedRange = {
      argument0: argument0 >>> 0,
      argument1: argument1 >>> 0,
      argument2: argument2 >>> 0,
    };
    return { ...this.initializedRange };
  }

  planInitialize(configurationWord) {
    requireInteger(configurationWord, "configuration word");
    const flags = requireInteger(
      this.readField({ offset: ADDRESS.flags, width: 1 }),
      "flag byte",
    );
    const writes = [
      { offset: ADDRESS.flags, width: 1, value: flags & 0x1f },
      dword(ADDRESS.configurationWord, configurationWord),
      dword(ADDRESS.primaryIndex, -1),
      dword(ADDRESS.word770, -1),
      dword(ADDRESS.wordB138, -1),
      dword(ADDRESS.secondaryIndex, -1),
      dword(ADDRESS.word758, 0x00006aaa),
      dword(ADDRESS.float75c, 0x40200000),
      dword(ADDRESS.float760, 0x40200000),
      dword(ADDRESS.float764, 0x3f199999),
      dword(ADDRESS.word7cc, 0),
      dword(ADDRESS.word7c8, 0),
      dword(ADDRESS.mode, 0),
      dword(ADDRESS.selector5Word, 0),
      dword(ADDRESS.word840, 0),
      dword(ADDRESS.word844, 0),
      dword(ADDRESS.word848, 0),
      dword(ADDRESS.word84c, 0),
      dword(ADDRESS.wordB13c, 0),
    ];
    this.validateWriteWidths(writes);
    return {
      writes,
      rangeRequest: {
        argument0: 15,
        argument1: 7,
        argument2: 0,
      },
    };
  }

  commit(plan) {
    for (const write of plan.writes) {
      this.writeField(write);
    }
  }

  planReset() {
    const mode = signed32(requireInteger(
      this.readField({ offset: ADDRESS.mode, width: 4 }),
      "mode",
    ));
    let cleanupRequest = null;
    if (mode >= 2 && mode <= 6) {
      cleanupRequest = {
        argument0: requireInteger(
          this.readField({
            offset: ADDRESS.cleanupArgument0,
            width: 1,
          }),
          "cleanup argument zero",
        ),
        argument1: requireInteger(
          this.readField({
            offset: ADDRESS.cleanupArgument1,
            width: 1,
          }),
          "cleanup argument one",
        ),
      };
    }
    const writes = [
      dword(ADDRESS.mode, 0),
      dword(ADDRESS.secondaryIndex, -1),
      dword(ADDRESS.word848, 0),
      dword(ADDRESS.word7cc, 0),
      dword(ADDRESS.word7c8, 0),
    ];
    this.validateWriteWidths(writes);
    return {
      mode,
      cleanupRequest,
      writes,
    };
  }

  validateWriteWidths(writes) {
    for (const { offset, width } of writes) {
      this.readField({ offset, width });
    }
  }

  queryStatus() {
    const secondaryIndex = signed32(requireInteger(
      this.readField({ offset: ADDRESS.secondaryIndex, width: 4 }),
      "secondary index",
    ));
    if (secondaryIndex >= 0) return secondaryIndex;
    const mode = signed32(requireInteger(
      this.readField({ offset: ADDRESS.mode, width: 4 }),
      "mode",
    ));
    return [2, 3, 5].includes(mode)
      ? -1 - secondaryIndex
      : -1;
  }

  planByteSelection(primaryValue, secondaryValue) {
    requireInteger(primaryValue, "primary byte selection");
    requireInteger(secondaryValue, "secondary byte selection");
    const signedPrimary = (primaryValue << 24) >> 24;
    const selectedPrimary = signedPrimary >= 65
      ? 0
      : primaryValue & 0xff;
    const writes = [
      {
        offset: ADDRESS.selectedByteA,
        width: 1,
        value: selectedPrimary,
      },
      {
        offset: ADDRESS.selectedByteB,
        width: 1,
        value: selectedPrimary,
      },
      {
        offset: ADDRESS.secondaryByte,
        width: 1,
        value: secondaryValue & 0xff,
      },
      {
        offset: ADDRESS.selectionWord,
        width: 2,
        value: 0,
      },
    ];
    this.validateWriteWidths(writes);
    return {
      primaryValue: selectedPrimary,
      secondaryValue: secondaryValue & 0xff,
      writes,
    };
  }
}

export function createNativeGlobalControllerState(fieldAccess) {
  return new NativeGlobalControllerState(fieldAccess);
}

function stopped(reason) {
  return { status: "stopped", reason };
}

function operationSource(action, context) {
  return {
    functionFileOffset: context.location?.functionId,
    callFileOffset: action.callFileOffset,
  };
}

export function createNativeGlobalControllerSemanticHandlers({
  initializeGlobalControllerRange,
  cleanupGlobalControllerRange,
} = {}) {
  return {
    "global-runtime-controller-event-poll": async ({
      context,
      readArgument,
    }) => {
      if (signed32(readArgument(0)) !== -1) {
        return stopped("global-runtime-controller-event-poll-selector-unproven");
      }
      if (typeof context.pollGlobalControllerEvent !== "function") {
        return stopped("global-runtime-controller-event-poll-adapter-missing");
      }
      try {
        return { result: context.pollGlobalControllerEvent() };
      } catch (error) {
        return stopped(error.message);
      }
    },
    "global-runtime-controller-byte-selection": async ({
      context,
      readArgument,
    }) => {
      if (signed32(readArgument(0)) !== 0) {
        return stopped(
          "global-runtime-controller-byte-selection-mode-unproven",
        );
      }
      if (typeof context.writeGlobalControllerByteSelection !== "function") {
        return stopped("global-runtime-controller-byte-selection-state-missing");
      }
      try {
        const mutation = context.writeGlobalControllerByteSelection({
          argument0: readArgument(1),
          argument1: readArgument(2),
        });
        return { status: "continued", mutation };
      } catch (error) {
        return stopped(error.message);
      }
    },
    "global-runtime-controller-initialize": async ({
      action,
      context,
      readArgument,
    }) => {
      if (readArgument(0) !== 0) {
        return stopped("global-runtime-controller-initialize-selector-unproven");
      }
      const planInitialize = context.planGlobalControllerInitialize;
      const commit = context.commitGlobalControllerPlan;
      if (
        typeof planInitialize !== "function"
        || typeof commit !== "function"
      ) {
        return stopped("global-runtime-controller-state-missing");
      }
      const initializeRange = (
        initializeGlobalControllerRange
        || context.initializeGlobalControllerRange
      );
      if (typeof initializeRange !== "function") {
        return stopped("global-runtime-controller-range-adapter-missing");
      }
      let plan;
      try {
        plan = planInitialize(readArgument(1));
      } catch (error) {
        return stopped(error.message);
      }
      commit(plan);
      await initializeRange({
        ...plan.rangeRequest,
        source: operationSource(action, context),
      });
      return { result: -1 };
    },
    "global-runtime-controller-reset": async ({
      action,
      context,
      readArgument,
    }) => {
      if (signed32(readArgument(0)) !== 2) {
        return stopped("global-runtime-controller-reset-selector-unproven");
      }
      const planReset = context.planGlobalControllerReset;
      const commit = context.commitGlobalControllerPlan;
      if (typeof planReset !== "function" || typeof commit !== "function") {
        return stopped("global-runtime-controller-state-missing");
      }
      let plan;
      try {
        plan = planReset();
      } catch (error) {
        return stopped(error.message);
      }
      if (plan.cleanupRequest) {
        const cleanupRange = (
          cleanupGlobalControllerRange
          || context.cleanupGlobalControllerRange
        );
        if (typeof cleanupRange !== "function") {
          return stopped("global-runtime-controller-cleanup-adapter-missing");
        }
        await cleanupRange({
          ...plan.cleanupRequest,
          source: operationSource(action, context),
        });
      }
      commit(plan);
      return { result: 0 };
    },
    "global-runtime-controller-status-query": async ({
      context,
      readArgument,
    }) => {
      if (signed32(readArgument(0)) !== 3) {
        return stopped("global-runtime-controller-query-selector-unproven");
      }
      if (typeof context.queryGlobalControllerStatus !== "function") {
        return stopped("global-runtime-controller-state-missing");
      }
      try {
        return { result: context.queryGlobalControllerStatus() };
      } catch (error) {
        return stopped(error.message);
      }
    },
  };
}
