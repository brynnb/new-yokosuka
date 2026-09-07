import {
  nativeFloat32FromWord,
} from "./NativeEventNumericRuntime.js";

function actorCodeFromWord(value) {
  if (!Number.isInteger(value)) {
    throw new TypeError("native actor reference is unavailable");
  }
  const word = value >>> 0;
  return String.fromCharCode(
    word & 0xff,
    word >>> 8 & 0xff,
    word >>> 16 & 0xff,
    word >>> 24 & 0xff,
  );
}

function actorCodeArgument(action, readArgument, index) {
  const operand = action.arguments?.[index];
  return typeof operand?.ascii === "string"
    ? operand.ascii
    : actorCodeFromWord(readArgument(index));
}

function signed32(value) {
  return value >> 0;
}

function floatArgument(readArgument, index) {
  return nativeFloat32FromWord(readArgument(index) >>> 0);
}

function vectorFromAddressOperand(operand, context) {
  if (operand?.kind !== "frame-address" && operand?.kind !== "scene-address") {
    return undefined;
  }
  const read = operand.kind === "frame-address"
    ? context.readFrameField
    : (offset) => context.readSceneField?.({
        offset,
        width: 4,
        signedLoad: false,
      });
  if (typeof read !== "function" || !Number.isInteger(operand.offset)) {
    return undefined;
  }
  const words = [0, 4, 8].map((component) => read(operand.offset + component));
  if (!words.every(Number.isInteger)) return undefined;
  return words.map((word) => nativeFloat32FromWord(word >>> 0));
}

function sourceFor(action, context) {
  return {
    functionFileOffset: context.location?.functionId,
    callFileOffset: action.callFileOffset,
  };
}

function stopped(reason) {
  return { status: "stopped", reason };
}

export class NativeFreeConversationState {
  constructor({
    dialogueState,
    managerFlagByte0e = 0x80,
    initialized = true,
  } = {}) {
    this.dialogueState = dialogueState;
    this.managerFlagByte0e = managerFlagByte0e & 0xff;
    this.initialized = Boolean(initialized);
  }

  configureDialogueState(dialogueState) {
    if (
      dialogueState != null
      && (
        typeof dialogueState.read !== "function"
        || typeof dialogueState.write !== "function"
      )
    ) {
      throw new TypeError(
        "native free-conversation dialogue state is invalid",
      );
    }
    this.dialogueState = dialogueState;
    return this;
  }

  execute(suboperation, arguments_) {
    if (suboperation === 0) {
      this.initialized = false;
      this.managerFlagByte0e = 0;
      return 0;
    }
    if (suboperation === 2) {
      this.initialized = true;
      return 1;
    }
    if (suboperation >= 11 && suboperation <= 16) {
      const relative = suboperation - 11;
      const bank = 2 + Math.floor(relative / 2);
      const write = (relative & 1) === 1;
      if (!write) {
        return this.dialogueState?.read?.(bank, arguments_[0]);
      }
      const [index, value] = arguments_;
      return this.dialogueState?.write?.(bank, index, value) ? 1 : undefined;
    }
    if (suboperation === 21) {
      return this.managerFlagByte0e & 0x80;
    }
    return undefined;
  }
}

export function createNativeScriptedSceneSemanticHandlers({
  requestEventCamera,
  selectCameraMode,
  requestActorMotion,
  readActorMotionStatus,
  readActorControllerStatus,
  writeActorControllerFlagBit3,
  requestActorXmpt,
  readActorXmptStateZero,
  controlActorLookPoint,
  dispatchSoundCommand,
  writeGlobalByteState,
  freeConversationState,
} = {}) {
  return {
    "sound-command-dispatch": async ({ action, context, readArgument }) => {
      if (typeof dispatchSoundCommand !== "function") {
        return stopped("sound-command-adapter-missing");
      }
      const arguments_ = [0, 1, 2].map(index => readArgument(index));
      if (!arguments_.every(Number.isInteger)) {
        return stopped("sound-command-arguments-unavailable");
      }
      const result = await dispatchSoundCommand({
        arguments: arguments_.map(value => value >>> 0),
        source: sourceFor(action, context),
      });
      return Number.isInteger(result)
        ? { result: result >>> 0 }
        : stopped("sound-command-result-unavailable");
    },
    "event-camera-request": async ({ action, context, readArgument }) => {
      if (typeof requestEventCamera !== "function") {
        return stopped("event-camera-adapter-missing");
      }
      const cameraNumber = readArgument(0);
      const actorReferences = [1, 2].map((index) => {
        const value = readArgument(index);
        return value === 0
          ? null
          : actorCodeArgument(action, readArgument, index);
      });
      const accepted = await requestEventCamera({
        cameraNumber,
        actorReferences,
        mode: 6,
        source: sourceFor(action, context),
      });
      return accepted === true
        ? { status: "continued" }
        : stopped("event-camera-request-rejected");
    },
    "camera-state-mode-select": async ({
      action,
      context,
      readArgument,
    }) => {
      if (typeof selectCameraMode !== "function") {
        return stopped("camera-state-mode-adapter-missing");
      }
      const accepted = await selectCameraMode({
        mode: readArgument(0),
        source: sourceFor(action, context),
      });
      return accepted === true
        ? { status: "continued" }
        : stopped("camera-state-mode-request-rejected");
    },
    "actor-motion-request": async ({ action, context, readArgument }) => {
      if (typeof requestActorMotion !== "function") {
        return stopped("actor-motion-request-adapter-missing");
      }
      const accepted = await requestActorMotion({
        actorCode: actorCodeArgument(action, readArgument, 0),
        request: readArgument(1) & 0xffff,
        parameters: [
          floatArgument(readArgument, 2),
          floatArgument(readArgument, 3),
          floatArgument(readArgument, 4),
          floatArgument(readArgument, 5),
        ],
        source: sourceFor(action, context),
      });
      return accepted === true
        ? { status: "continued" }
        : stopped("actor-motion-request-rejected");
    },
    "actor-motion-status-bit-1-query": async ({ action, readArgument }) => {
      if (typeof readActorMotionStatus !== "function") {
        return stopped("actor-motion-status-adapter-missing");
      }
      const value = await readActorMotionStatus({
        actorCode: actorCodeArgument(action, readArgument, 0),
      });
      return Number.isInteger(value)
        ? { result: value & 2 }
        : stopped("actor-motion-status-unavailable");
    },
    "actor-controller-status-query": async ({ action, readArgument }) => {
      const selector = readArgument(1);
      if (![0, 1].includes(selector) || readArgument(2) !== 0) {
        return stopped("actor-controller-status-route-unproved");
      }
      if (typeof readActorControllerStatus !== "function") {
        return {
          status: "continued",
          resultUnavailable: "actor-controller-status-adapter-missing",
        };
      }
      const value = await readActorControllerStatus({
        actorCode: actorCodeArgument(action, readArgument, 0),
        selector,
      });
      return Number.isInteger(value) && value >= -1 && value <= 0x7f
        ? { result: value }
        : {
            status: "continued",
            resultUnavailable: "actor-controller-status-unavailable",
          };
    },
    "actor-controller-flag-bit-3-control": async ({
      action,
      context,
      readArgument,
    }) => {
      if (typeof writeActorControllerFlagBit3 !== "function") {
        return stopped("actor-controller-flag-bit-3-adapter-missing");
      }
      const mode = readArgument(1);
      if (![0, 1].includes(mode)) {
        return stopped("actor-controller-flag-bit-3-mode-unproved");
      }
      const detail = {
        actorCode: actorCodeArgument(action, readArgument, 0),
        enabled: mode === 1,
        source: sourceFor(action, context),
      };
      const accepted = await writeActorControllerFlagBit3(detail);
      return accepted === true
        ? { status: "continued", mutation: detail }
        : stopped("actor-controller-flag-bit-3-write-rejected");
    },
    "conditional-global-byte-write": async ({
      context,
      readArgument,
    }) => {
      if (
        typeof context.readSceneField !== "function"
        || typeof context.writeSceneField !== "function"
      ) {
        return stopped("conditional-global-byte-state-adapter-missing");
      }
      const gate = context.readSceneField({
        offset: 0x0c225251,
        width: 1,
      });
      if (!Number.isInteger(gate)) {
        return stopped("conditional-global-byte-gate-unavailable");
      }
      const value = readArgument(0) & 0xff;
      if ((gate & 0xff) !== 0) {
        context.writeSceneField({
          offset: 0x0c225250,
          width: 1,
          value,
        });
      }
      return {
        status: "continued",
        mutation: {
          applied: (gate & 0xff) !== 0,
          value,
        },
      };
    },
    "actor-xmpt-request": async ({ action, context, readArgument }) => {
      if (typeof requestActorXmpt !== "function") {
        return stopped("actor-xmpt-request-adapter-missing");
      }
      const target = vectorFromAddressOperand(action.arguments?.[1], context);
      if (!target) {
        return stopped("actor-xmpt-target-unavailable");
      }
      if (readArgument(4) !== 0) {
        return stopped("actor-xmpt-supplemental-record-unimplemented");
      }
      const accepted = await requestActorXmpt({
        actorCode: actorCodeArgument(action, readArgument, 0),
        target,
        requestWord: readArgument(2) & 0xffff,
        requestDword: readArgument(3) >>> 0,
        stateSelector: 0,
        source: sourceFor(action, context),
      });
      return accepted === true
        ? { status: "continued" }
        : stopped("actor-xmpt-request-rejected");
    },
    "actor-xmpt-state-zero-query": async ({ action, readArgument }) => {
      if (typeof readActorXmptStateZero !== "function") {
        return stopped("actor-xmpt-state-zero-adapter-missing");
      }
      const value = await readActorXmptStateZero({
        actorCode: actorCodeArgument(action, readArgument, 0),
      });
      return typeof value === "boolean"
        ? { result: value ? 1 : 0 }
        : stopped("actor-xmpt-state-zero-unavailable");
    },
    "actor-xmpt-selector-five-request": async ({
      action,
      context,
      readArgument,
    }) => {
      if (typeof requestActorXmpt !== "function") {
        return stopped("actor-xmpt-request-adapter-missing");
      }
      const target = vectorFromAddressOperand(action.arguments?.[1], context);
      if (!target) {
        return stopped("actor-xmpt-target-unavailable");
      }
      const accepted = await requestActorXmpt({
        actorCode: actorCodeArgument(action, readArgument, 0),
        target,
        requestWord: readArgument(2) & 0xffff,
        requestDword: readArgument(3) >>> 0,
        stateSelector: 5,
        source: sourceFor(action, context),
      });
      return accepted === true
        ? { status: "continued" }
        : stopped("actor-xmpt-request-rejected");
    },
    "actor-xmpt-selector-five-active-query": async ({
      action,
      context,
      readArgument,
    }) => {
      if (typeof context.readActorXmptSelectorActive !== "function") {
        return stopped("actor-xmpt-selector-query-adapter-missing");
      }
      const value = await context.readActorXmptSelectorActive(
        actorCodeArgument(action, readArgument, 0),
        5,
      );
      return typeof value === "boolean"
        ? { result: value ? 1 : 0 }
        : stopped("actor-xmpt-selector-query-unavailable");
    },
    "actor-look-point-control": async ({
      action,
      context,
      readArgument,
    }) => {
      if (typeof controlActorLookPoint !== "function") {
        return stopped("actor-look-point-adapter-missing");
      }
      const targetOperand = action.arguments?.[2];
      let target = null;
      if (!(targetOperand?.kind === "constant" && readArgument(2) === 0)) {
        target = vectorFromAddressOperand(targetOperand, context);
        if (!target) {
          return stopped("actor-look-point-target-unavailable");
        }
      }
      const accepted = await controlActorLookPoint({
        actorCode: actorCodeArgument(action, readArgument, 0),
        selector: signed32(readArgument(1)),
        target,
        mode: readArgument(3),
        source: sourceFor(action, context),
      });
      return accepted === true
        ? { status: "continued" }
        : stopped("actor-look-point-request-rejected");
    },
    "global-byte-state-write": async ({
      action,
      context,
      readArgument,
    }) => {
      if (typeof writeGlobalByteState !== "function") {
        return stopped("global-byte-state-write-adapter-missing");
      }
      const value = readArgument(0) & 0xff;
      const accepted = await writeGlobalByteState({
        value,
        source: sourceFor(action, context),
      });
      return accepted === true
        ? { status: "continued" }
        : stopped("global-byte-state-write-rejected");
    },
    "native-free-conversation-control": async ({
      readArgument,
      action,
    }) => {
      if (!freeConversationState?.execute) {
        return stopped("native-free-conversation-state-missing");
      }
      const suboperation = readArgument(0);
      const arguments_ = Array.from(
        { length: Math.max(0, (action.arguments?.length || 1) - 1) },
        (_, index) => readArgument(index + 1),
      );
      const result = freeConversationState.execute(suboperation, arguments_);
      return result === undefined
        ? stopped(
            `native-free-conversation-suboperation-unhandled:${suboperation}`,
          )
        : { result };
    },
  };
}

export function createNativeFreeConversationState(options) {
  return new NativeFreeConversationState(options);
}
