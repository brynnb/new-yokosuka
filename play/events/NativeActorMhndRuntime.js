import {
  nativeMhndTargetWords,
  signedNativeMhndWord,
} from "../../src/NativeMhndPose.js";

const RESET_TIMING_POINTER = 0x0c288380;
const SOURCE_WORD_COUNT = 10;

function requireFourcc(value) {
  const fourcc = String(value || "");
  if (fourcc.length !== 4) {
    throw new TypeError("native MHND actor tag must have four bytes");
  }
  return fourcc;
}

function requireDword(value, name) {
  if (!Number.isInteger(value)) {
    throw new TypeError(`native MHND ${name} must be an integer`);
  }
  return value >>> 0;
}

function requireSourceWords(words) {
  if (
    !Array.isArray(words)
    || words.length !== SOURCE_WORD_COUNT
    || words.some(word => !Number.isInteger(word))
  ) {
    throw new TypeError("native MHND source snapshot needs ten dwords");
  }
  return words.map(word => word >>> 0);
}

function targetWords(index, subcontrollerIndex) {
  return nativeMhndTargetWords(index, subcontrollerIndex);
}

function deltaWords(source, target, duration) {
  return source.flatMap((word, index) => {
    const difference = signedNativeMhndWord(target[index])
      - signedNativeMhndWord(word);
    const delta = Math.trunc(difference / duration) >>> 0;
    return [delta, delta];
  });
}

function cloneSubcontroller(controller) {
  if (!controller) return null;
  return {
    nodePointer: controller.nodePointer,
    channel: controller.channel,
    targetIndex: controller.targetIndex,
    duration: controller.duration,
    sourceWords: [...controller.sourceWords],
    targetWords: [...controller.targetWords],
    deltaWords: [...controller.deltaWords],
  };
}

function cloneRecord(record) {
  if (!record) return null;
  return {
    allocatedByRuntime: record.allocatedByRuntime,
    activationRequested: record.activationRequested,
    primary: cloneSubcontroller(record.primary),
    secondary: cloneSubcontroller(record.secondary),
    primaryTargetIndex: record.primaryTargetIndex,
    secondaryTargetIndex: record.secondaryTargetIndex,
    primaryScheduler: { ...record.primaryScheduler },
    secondaryScheduler: { ...record.secondaryScheduler },
  };
}

function cloneActor(actor) {
  if (!actor) return undefined;
  return {
    actorAvailable: actor.actorAvailable,
    controllerAvailable: actor.controllerAvailable,
    allocationAvailable: actor.allocationAvailable,
    sources: actor.sources.map(source => (
      source
        ? {
            nodePointer: source.nodePointer,
            words: [...source.words],
          }
        : null
    )),
    record: cloneRecord(actor.record),
  };
}

function createRecord(allocatedByRuntime) {
  return {
    allocatedByRuntime,
    activationRequested: false,
    primary: null,
    secondary: null,
    primaryTargetIndex: 0xfffffffd,
    secondaryTargetIndex: 0xfffffffd,
    primaryScheduler: { state: 0, timingPointer12: 0, timingPointer16: 0 },
    secondaryScheduler: { state: 0, timingPointer12: 0, timingPointer16: 0 },
  };
}

function clearGeneralFields(record, channel, targetIndex) {
  if (!record) return;
  if (channel === 0 || channel === 2) {
    record.primaryScheduler.state = 0;
    record.primaryTargetIndex = targetIndex >>> 0;
  }
  if (channel === 1 || channel === 2) {
    record.secondaryScheduler.state = 0;
    record.secondaryTargetIndex = targetIndex >>> 0;
  }
}

function objectTagArgument(action, readArgument) {
  const operand = action.arguments?.[0];
  if (operand?.kind === "constant" && typeof operand.ascii === "string") {
    return operand.ascii;
  }
  const value = readArgument(0);
  if (typeof value === "string") return value;
  if (!Number.isInteger(value)) {
    throw new TypeError("native MHND actor tag is unavailable");
  }
  return String.fromCharCode(
    value & 0xff,
    (value >>> 8) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 24) & 0xff,
  );
}

export class NativeActorMhndState {
  constructor() {
    this.actors = new Map();
  }

  configureActor({
    actorTag,
    actorAvailable,
    controllerAvailable = false,
    recordAvailable = false,
    allocationAvailable = false,
    sources = [],
  }) {
    if (
      typeof actorAvailable !== "boolean"
      || typeof controllerAvailable !== "boolean"
      || typeof recordAvailable !== "boolean"
      || typeof allocationAvailable !== "boolean"
    ) {
      throw new TypeError("native MHND availability values must be boolean");
    }
    const configuredSources = [0, 1].map(index => {
      const source = sources[index];
      if (!source) return null;
      return {
        nodePointer: requireDword(source.nodePointer, "source node pointer"),
        words: requireSourceWords(source.words),
      };
    });
    this.actors.set(requireFourcc(actorTag), {
      actorAvailable,
      controllerAvailable,
      allocationAvailable,
      sources: configuredSources,
      record: recordAvailable ? createRecord(false) : null,
    });
  }

  ensureRecord(actor) {
    if (actor.record) {
      actor.record.activationRequested = true;
      return actor.record;
    }
    if (!actor.allocationAvailable) return null;
    actor.record = createRecord(true);
    return actor.record;
  }

  applyReset(actor) {
    if (!actor.controllerAvailable) {
      return { applied: false, reason: "actor-mhnd-controller-missing" };
    }
    const record = this.ensureRecord(actor);
    if (!record) {
      return { applied: false, reason: "actor-mhnd-allocation-unavailable" };
    }
    const scheduler = {
      state: 14,
      timingPointer12: RESET_TIMING_POINTER,
      timingPointer16: RESET_TIMING_POINTER,
    };
    record.primaryScheduler = { ...scheduler };
    record.secondaryScheduler = { ...scheduler };
    return {
      applied: true,
      path: "reset-minus-one",
      state: cloneRecord(record),
    };
  }

  applyTimed(actor, channel, index, duration) {
    if (!actor.controllerAvailable) {
      return { applied: false, reason: "actor-mhnd-controller-missing" };
    }
    const selected = channel === 2 ? [0, 1] : [channel];
    const inputs = selected.map(subcontrollerIndex => {
      const source = actor.sources[subcontrollerIndex];
      const target = targetWords(index, subcontrollerIndex);
      return { subcontrollerIndex, source, target };
    });
    if (inputs.some(input => !input.source)) {
      return {
        applied: false,
        reason: "actor-mhnd-source-snapshot-unavailable",
      };
    }
    if (inputs.some(input => !input.target)) {
      return {
        applied: false,
        reason: "actor-mhnd-target-row-unavailable",
      };
    }
    const record = this.ensureRecord(actor);
    if (!record) {
      return { applied: false, reason: "actor-mhnd-allocation-unavailable" };
    }
    clearGeneralFields(record, channel, index);
    for (const input of inputs) {
      const controller = {
        nodePointer: input.source.nodePointer,
        channel: channel >>> 0,
        targetIndex: index >>> 0,
        duration: duration >>> 0,
        sourceWords: [...input.source.words],
        targetWords: [...input.target],
        deltaWords: deltaWords(input.source.words, input.target, duration),
      };
      if (input.subcontrollerIndex === 0) record.primary = controller;
      else record.secondary = controller;
      if (input.subcontrollerIndex === 0) {
        record.primaryTargetIndex = index >>> 0;
      } else {
        record.secondaryTargetIndex = index >>> 0;
      }
    }
    return {
      applied: true,
      path: "timed-controller",
      configuredSubcontrollers: selected,
      state: cloneRecord(record),
    };
  }

  applyRequest({ actorTag, channel, targetIndex, duration }) {
    const actor = this.actors.get(requireFourcc(actorTag));
    if (!actor) {
      return { applied: false, reason: "actor-mhnd-state-unavailable" };
    }
    if (!actor.actorAvailable) {
      return { applied: false, reason: "actor-missing" };
    }
    const channelWord = requireDword(channel, "channel");
    const targetWord = requireDword(targetIndex, "target index");
    const durationWord = requireDword(duration, "duration");
    const signedChannel = channelWord | 0;
    if (signedChannel === -1) return this.applyReset(actor);
    if (signedChannel < 0 || signedChannel >= 3 || (targetWord | 0) >= 15) {
      return { applied: false, reason: "actor-mhnd-native-no-op" };
    }
    if ((durationWord | 0) <= 1) {
      return { applied: false, reason: "actor-mhnd-immediate-route-required" };
    }
    if (!actor.controllerAvailable) {
      clearGeneralFields(actor.record, signedChannel, targetWord);
      return {
        applied: Boolean(actor.record),
        reason: "actor-mhnd-controller-missing",
      };
    }
    return this.applyTimed(
      actor,
      signedChannel,
      targetWord,
      durationWord | 0,
    );
  }

  readActor(actorTag) {
    return cloneActor(this.actors.get(requireFourcc(actorTag)));
  }
}

export function createNativeActorMhndSemanticHandlers({
  applyActorMhndControllerRequest,
} = {}) {
  return {
    "actor-mhnd-controller-request": async ({
      action,
      context,
      readArgument,
    }) => {
      const applyRequest = (
        applyActorMhndControllerRequest
        || context.applyActorMhndControllerRequest
      );
      if (typeof applyRequest !== "function") {
        return {
          status: "stopped",
          reason: "actor-mhnd-controller-adapter-missing",
        };
      }
      const mutation = await applyRequest({
        actorTag: objectTagArgument(action, readArgument),
        channel: readArgument(1),
        targetIndex: readArgument(2),
        duration: readArgument(3),
        source: {
          functionFileOffset: context.location?.functionId,
          callFileOffset: action.callFileOffset,
        },
      });
      if (
        mutation?.reason === "actor-mhnd-state-unavailable"
        || mutation?.reason === "actor-mhnd-source-snapshot-unavailable"
        || mutation?.reason === "actor-mhnd-target-row-unavailable"
        || mutation?.reason === "actor-mhnd-immediate-route-required"
      ) {
        return { status: "stopped", reason: mutation.reason };
      }
      return { status: "continued", mutation };
    },
  };
}

export function createNativeActorMhndState() {
  return new NativeActorMhndState();
}
