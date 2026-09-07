import { NATIVE_HAND_POSE_SLOT_ORDER } from "../../src/NativeHandRig.js";
import {
  nativeAseqGoverningActivityFrame,
  nativeAseqGoverningActivityRange,
} from "./NativeAseqScriptOwnership.mjs";

function offsetHex(value) {
  return `0x${value.toString(16)}`;
}

function exactConstant(argument, label) {
  if (argument?.kind !== "constant" || !Number.isInteger(argument.value)) {
    throw new Error(`${label} is not an exact native constant`);
  }
  return argument.value;
}

function actorTag(argument, label) {
  if (argument?.kind !== "constant" || !/^[\x20-\x7e]{4}$/.test(argument.ascii || "")) {
    throw new Error(`${label} is not an exact four-byte actor tag`);
  }
  return argument.ascii;
}

function operationFrame(bytes, callbackFunction, operation) {
  return nativeAseqGoverningActivityFrame(
    bytes,
    callbackFunction,
    Number.parseInt(operation.callFileOffset, 16),
  );
}

function readHandPoseTable(bytes, argument, label) {
  if (argument?.kind !== "static-pointer" || !Number.isInteger(argument.value)) {
    throw new Error(`${label} has no exact static HAND pose table`);
  }
  const byteLength = NATIVE_HAND_POSE_SLOT_ORDER.length * 3 * 4;
  if (argument.value < 0 || argument.value + byteLength > bytes.length) {
    throw new Error(`${label} HAND pose table leaves the native program`);
  }
  return Object.freeze(Array.from(
    { length: NATIVE_HAND_POSE_SLOT_ORDER.length },
    (_, vectorIndex) => Object.freeze(Array.from(
      { length: 3 },
      (_, axis) => bytes.readInt32LE(argument.value + vectorIndex * 12 + axis * 4),
    )),
  ));
}

function callbackOperations(nativeFunction) {
  if (!nativeFunction || !Array.isArray(nativeFunction.blocks)) {
    throw new TypeError("native ASEQ callback presentation requires a compiled function");
  }
  return nativeFunction.blocks.flatMap(block => block.actions || []).filter(
    action => action.kind === "engineOperation",
  );
}

function precedingOperation(operations, operation, semanticId) {
  const call = Number.parseInt(operation.callFileOffset, 16);
  return operations.filter(candidate => (
    candidate.semanticId === semanticId
    && Number.parseInt(candidate.callFileOffset, 16) < call
  )).at(-1) || null;
}

export function extractNativeAseqCallbackPresentation({
  bytes,
  callbackFunction,
  nativeFunction,
  durationFrames,
  activitySlot = 0,
} = {}) {
  if (
    !Buffer.isBuffer(bytes)
    || !Number.isSafeInteger(callbackFunction)
    || callbackFunction < 0
    || !Number.isSafeInteger(durationFrames)
    || durationFrames < 1
  ) throw new TypeError("native ASEQ callback presentation inputs are invalid");

  const nativeHandPoseTables = {};
  const nativeHandPoseCues = [];
  const nativeDetailedHandDefaults = [];
  const nativeFaceClipCues = [];
  const nativeFaceControllerCues = [];
  const unresolved = [];
  const operations = callbackOperations(nativeFunction);
  const nativeFaceGazeCues = [];
  for (const operation of operations) {
    const call = Number.parseInt(operation.callFileOffset, 16);
    if (operation.semanticId === "resolved-object-hndl-hndr-vector-install") {
      const actor = actorTag(operation.arguments[0], `${operation.callFileOffset} HAND actor`);
      const sideSelector = exactConstant(
        operation.arguments[1],
        `${operation.callFileOffset} HAND side`,
      );
      const durationNativeTicks = exactConstant(
        operation.arguments[3],
        `${operation.callFileOffset} HAND duration`,
      );
      if ((sideSelector !== 0 && sideSelector !== 1) || durationNativeTicks < 0) {
        throw new Error(`${operation.callFileOffset} has invalid HAND control arguments`);
      }
      const vectors = readHandPoseTable(
        bytes,
        operation.arguments[2],
        operation.callFileOffset,
      );
      const tableOffset = operation.arguments[2].value;
      const tableKey = offsetHex(tableOffset);
      const prior = nativeHandPoseTables[tableKey];
      if (prior && JSON.stringify(prior.vectors) !== JSON.stringify(vectors)) {
        throw new Error(`${tableKey} identifies conflicting HAND pose tables`);
      }
      nativeHandPoseTables[tableKey] = Object.freeze({
        sourceMapinfoOffset: tableKey,
        vectors,
      });
      if (durationNativeTicks === 0) {
        nativeDetailedHandDefaults.push(Object.freeze({
          activitySlot,
          actorTag: actor,
          sides: Object.freeze([sideSelector === 0 ? "left" : "right"]),
          poseTableOffset: tableKey,
          callFileOffset: operation.callFileOffset,
        }));
        continue;
      }
      const frame = operationFrame(bytes, callbackFunction, operation);
      nativeHandPoseCues.push(Object.freeze({
        activitySlot,
        frame,
        actorTag: actor,
        side: sideSelector === 0 ? "left" : "right",
        poseTableOffset: tableKey,
        durationNativeTicks,
        callFileOffset: operation.callFileOffset,
      }));
      continue;
    }
    if (operation.semanticId === "actor-face-clip-control-write") {
      const frame = operationFrame(bytes, callbackFunction, operation);
      const cue = Object.freeze({
        activitySlot,
        frame,
        actorTag: actorTag(
          operation.arguments[0],
          `${operation.callFileOffset} FACE actor`,
        ),
        clipGroup: exactConstant(
          operation.arguments[1],
          `${operation.callFileOffset} FACE clip group`,
        ),
        selector: exactConstant(
          operation.arguments[2],
          `${operation.callFileOffset} FACE selector`,
        ),
        durationNativeTicks: exactConstant(
          operation.arguments[3],
          `${operation.callFileOffset} FACE duration`,
        ),
        callFileOffset: operation.callFileOffset,
      });
      if (
        cue.frame < 0
        || cue.frame >= durationFrames
        || cue.clipGroup < 0
        || cue.selector < 0
        || cue.durationNativeTicks < 1
      ) throw new Error(`${operation.callFileOffset} has invalid FACE clip arguments`);
      nativeFaceClipCues.push(cue);
      continue;
    }
    if (operation.semanticId === "resolved-face-controller-setup") {
      const cue = Object.freeze({
        activitySlot,
        frame: operationFrame(bytes, callbackFunction, operation),
        actorTag: actorTag(
          operation.arguments[0],
          `${operation.callFileOffset} FACE controller actor`,
        ),
        mode: exactConstant(
          operation.arguments[1],
          `${operation.callFileOffset} FACE controller mode`,
        ),
        intervalNativeTicks: exactConstant(
          operation.arguments[2],
          `${operation.callFileOffset} FACE controller interval`,
        ),
        parameter: exactConstant(
          operation.arguments[3],
          `${operation.callFileOffset} FACE controller parameter`,
        ),
        callFileOffset: operation.callFileOffset,
      });
      if (
        cue.frame < 0
        || cue.frame >= durationFrames
        || cue.mode < 0
        || cue.mode > 0xff
        || cue.intervalNativeTicks < 0
        || cue.intervalNativeTicks > 0xffff
        || cue.parameter < 0
        || cue.parameter > 0xff
      ) throw new Error(`${operation.callFileOffset} has invalid FACE controller arguments`);
      nativeFaceControllerCues.push(cue);
      continue;
    }
    if (operation.semanticId === "resolved-object-face-record-request") {
      const actor = actorTag(operation.arguments[0], `${operation.callFileOffset} gaze actor`);
      const mode = exactConstant(operation.arguments[1], `${operation.callFileOffset} gaze mode`);
      try {
        const frame = operationFrame(bytes, callbackFunction, operation);
        if (mode !== 0) throw new Error("exact-frame FACE gaze is not a reset");
        nativeFaceGazeCues.push(Object.freeze({
          activitySlot,
          frame,
          actorTag: actor,
          mode: 0,
          durationNativeTicks: 16,
          callFileOffset: operation.callFileOffset,
        }));
      } catch {
        const range = nativeAseqGoverningActivityRange(bytes, callbackFunction, call);
        const source = precedingOperation(
          operations,
          operation,
          "resolved-object-indexed-vector-query",
        );
        if (
          mode !== 2
          || source?.arguments?.[2]?.kind !== "frame-address"
          || operation.arguments[2]?.kind !== "frame-address"
          || source.arguments[2].offset !== operation.arguments[2].offset
          || exactConstant(source.arguments[1], `${source.callFileOffset} gaze selector`) !== 5
          || exactConstant(source.arguments[3], `${source.callFileOffset} gaze flags`) !== 0x40000000
        ) throw new Error(`${operation.callFileOffset} FACE gaze provenance is unsupported`);
        const targetActor = actorTag(
          source.arguments[0],
          `${source.callFileOffset} gaze target actor`,
        );
        const durationNativeTicks = exactConstant(
          operation.arguments[3],
          `${operation.callFileOffset} gaze duration`,
        );
        for (let frame = range.firstFrame; frame <= range.lastFrame; frame += 1) {
          nativeFaceGazeCues.push(Object.freeze({
            activitySlot,
            frame,
            actorTag: actor,
            mode: 2,
            durationNativeTicks,
            target: Object.freeze({
              kind: "actor-component",
              actorTag: targetActor,
              selector: 5,
              associated: true,
              offset: Object.freeze([0, 0, 0]),
            }),
            callFileOffset: operation.callFileOffset,
          }));
        }
      }
    }
  }
  nativeHandPoseCues.sort((left, right) => left.frame - right.frame);
  nativeFaceClipCues.sort((left, right) => left.frame - right.frame);
  nativeFaceControllerCues.sort((left, right) => left.frame - right.frame);
  nativeFaceGazeCues.sort((left, right) => left.frame - right.frame);
  return Object.freeze({
    nativeHandPoseTables: Object.freeze(nativeHandPoseTables),
    nativeHandPoseCues: Object.freeze(nativeHandPoseCues),
    nativeDetailedHandDefaults: Object.freeze(nativeDetailedHandDefaults),
    nativeFaceClipCues: Object.freeze(nativeFaceClipCues),
    nativeFaceControllerCues: Object.freeze(nativeFaceControllerCues),
    nativeFaceGazeCues: Object.freeze(nativeFaceGazeCues),
    unresolved: Object.freeze(unresolved),
  });
}
