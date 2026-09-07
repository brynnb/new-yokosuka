import crypto from "node:crypto";
import {
  DESCRIPTOR_DISPATCHER_ADDRESS,
  DESCRIPTOR_CONTINUATION_POINTER_OPERATION,
  DESCRIPTOR_CURRENT_OPERATION_CLEAR_OPERATIONS,
  DESCRIPTOR_EXTENSION_HANDLER_ADDRESS,
  DESCRIPTOR_PASS_THROUGH_OPERATIONS,
  DESCRIPTOR_TERMINAL_OPERATIONS,
  descriptorOperationWordLength,
  OPERATION_ONE_HANDLER_ADDRESS,
} from "./scheduler_descriptor_layout.js";
import {
  decodeLocalTransformRecord,
  decodeOperation16Records,
} from "./scheduler_operation_16.js";
import {
  decodeOperation22MotionCandidates,
} from "./scheduler_operation_22.js";

export const RAM_BASE = 0x8c000000;
export const RAM_SIZE = 16 * 1024 * 1024;
const RAM_MASK = 0x00ffffff;
const PROGRAM_IDENTIFIER = /^[A-Z0-9_]{4}PRG1$/;
const AREA_IDENTIFIER = /^[A-Z0-9]{4}$/;

export function ramOffset(address) {
  return address & RAM_MASK;
}

export function runtimeAddress(fileOffset) {
  return RAM_BASE + fileOffset;
}

export function normalizedRamPointer(value, length = RAM_SIZE) {
  const high = (value & 0xff000000) >>> 0;
  if (high !== 0x0c000000 && high !== 0x8c000000) return null;
  const pointerOffset = ramOffset(value);
  if (pointerOffset >= length) return null;
  return runtimeAddress(pointerOffset);
}

export function hexAddress(value) {
  return `0x${value.toString(16).padStart(8, "0")}`;
}

export function timeText(seconds) {
  const hour = Math.floor(seconds / 3600);
  const minute = Math.floor(seconds / 60) % 60;
  const second = seconds % 60;
  return [hour, minute, second]
    .map((value) => String(value).padStart(2, "0"))
    .join(":");
}

export function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function normalizeProgramRelocations(ram, extent) {
  const bytes = Buffer.from(ram.subarray(extent.startOffset, extent.endOffset));
  let relocationCount = 0;
  for (let relativeOffset = 0; relativeOffset + 4 <= bytes.length;
    relativeOffset += 4) {
    const pointer = normalizedRamPointer(
      bytes.readUInt32LE(relativeOffset),
      ram.length,
    );
    if (pointer === null) continue;
    const pointerOffset = ramOffset(pointer);
    if (
      pointerOffset < extent.startOffset
      || pointerOffset >= extent.endOffset
    ) {
      continue;
    }
    // Source MOBJ pointers are relative to four bytes before the PRG1 header.
    bytes.writeUInt32LE(
      pointerOffset - (extent.startOffset - 4),
      relativeOffset,
    );
    relocationCount++;
  }
  return {
    byteSha256: sha256(bytes),
    relocationCount,
  };
}

function isAligned(offset) {
  return (offset & 3) === 0;
}

function descriptorTraversalEnd(ram, descriptor, extent) {
  const start = ramOffset(descriptor);
  if (start < extent.startOffset || start >= extent.endOffset) return null;
  let cursor = start;
  for (
    let guard = 0;
    guard < 1024 && cursor + 4 <= extent.endOffset;
    guard++
  ) {
    const operation = ram.readUInt32LE(cursor);
    const wordLength = descriptorOperationWordLength(
      operation,
      (offset) => (
        offset + 4 <= extent.endOffset ? ram.readUInt32LE(offset) : null
      ),
      cursor,
    );
    if (
      wordLength === null
      || cursor + wordLength * 4 > extent.endOffset
    ) {
      return null;
    }
    cursor += wordLength * 4;
    if (DESCRIPTOR_TERMINAL_OPERATIONS.has(operation)) return cursor;
  }
  return null;
}

function readScheduleCandidate(ram, startOffset, extent) {
  const entries = [];
  let cursor = startOffset;
  for (let index = 0; index < 128 && cursor + 4 <= extent.endOffset; index++) {
    const seconds = ram.readUInt32LE(cursor);
    if (seconds === 0xffffffff) {
      // Native selector slots can intentionally select an immediate
      // terminator to make the actor absent for that story state.
      return {
        startOffset,
        endOffset: cursor + 4,
        terminatorAddress: runtimeAddress(cursor),
        entries,
      };
    }
    if (cursor + 8 > extent.endOffset || seconds >= 86400) return null;
    if (entries.length && seconds <= entries.at(-1).startSecond) return null;
    const descriptor = normalizedRamPointer(
      ram.readUInt32LE(cursor + 4),
      ram.length,
    );
    const descriptorEndOffset = descriptor === null
      ? null
      : descriptorTraversalEnd(ram, descriptor, extent);
    if (
      descriptor === null
      || !isAligned(ramOffset(descriptor))
      || descriptorEndOffset === null
    ) {
      return null;
    }
    entries.push({
      entryAddress: runtimeAddress(cursor),
      startSecond: seconds,
      startTime: timeText(seconds),
      descriptorAddress: descriptor,
      descriptorEndOffset,
    });
    cursor += 8;
  }
  return null;
}

function discoverScheduleTables(ram, extent) {
  const relocationBase = extent.startOffset - 4;
  if (relocationBase < 0) return [];
  const rawSchedulePointer = ram.readUInt32LE(relocationBase);
  const startOffset = relocationBase + rawSchedulePointer;
  if (
    startOffset < extent.startOffset
    || startOffset >= extent.endOffset
    || !isAligned(startOffset)
  ) {
    return [];
  }
  const selected = readScheduleCandidate(ram, startOffset, extent);
  return selected ? [selected] : [];
}

export function discoverProgramExtents(ram) {
  const headers = [];
  for (let cursor = 0; cursor + 8 <= ram.length; cursor += 4) {
    if (
      ram[cursor + 4] !== 0x50 // P
      || ram[cursor + 5] !== 0x52 // R
      || ram[cursor + 6] !== 0x47 // G
      || ram[cursor + 7] !== 0x31 // 1
    ) {
      continue;
    }
    const identifier = ram.subarray(cursor, cursor + 8).toString("ascii");
    if (PROGRAM_IDENTIFIER.test(identifier)) {
      headers.push({
        actorCode: identifier.slice(0, 4),
        identifier,
        startOffset: cursor,
      });
    }
  }

  return headers.map((header, index) => {
    const next = headers[index + 1];
    if (!next) {
      return {
        ...header,
        programHeader: runtimeAddress(header.startOffset),
        bounded: false,
        unresolvedReason: "no following aligned PRG1 header bounds ownership",
      };
    }
    return {
      ...header,
      programHeader: runtimeAddress(header.startOffset),
      endOffset: next.startOffset,
      endAddressExclusive: runtimeAddress(next.startOffset),
      byteLength: next.startOffset - header.startOffset,
      bounded: true,
    };
  });
}

function readRoutePoints(ram, pointer, count, extent) {
  const start = ramOffset(pointer);
  if (
    start < extent.startOffset
    || start + count * 12 > extent.endOffset
  ) {
    return null;
  }
  const runtimePoints = [];
  const browserPoints = [];
  for (let index = 0; index < count; index++) {
    const pointOffset = start + index * 12;
    const point = [
      ram.readFloatLE(pointOffset),
      ram.readFloatLE(pointOffset + 4),
      ram.readFloatLE(pointOffset + 8),
    ];
    if (
      !point.every(Number.isFinite)
      || point.some((value) => Math.abs(value) > 10_000)
    ) {
      return null;
    }
    runtimePoints.push(point);
    browserPoints.push([-point[0], point[1], point[2]]);
  }
  return { runtimePoints, browserPoints };
}

function readSecondaryRoutePoints(ram, pointer, count, extent) {
  const start = ramOffset(pointer);
  if (
    start < extent.startOffset
    || start + count * 8 > extent.endOffset
  ) {
    return null;
  }
  const runtimePoints = [];
  const browserPoints = [];
  for (let index = 0; index < count; index++) {
    const pointOffset = start + index * 8;
    const point = [
      ram.readFloatLE(pointOffset),
      0,
      ram.readFloatLE(pointOffset + 4),
    ];
    if (
      !point.every(Number.isFinite)
      || point.some((value) => Math.abs(value) > 10_000)
    ) return null;
    runtimePoints.push(point);
    browserPoints.push([-point[0], point[1], point[2]]);
  }
  return { runtimePoints, browserPoints };
}

function rawWords(ram, startOffset, endOffset) {
  const words = [];
  for (let cursor = startOffset; cursor + 4 <= endOffset; cursor += 4) {
    words.push({
      address: hexAddress(runtimeAddress(cursor)),
      value: `0x${ram.readUInt32LE(cursor).toString(16).padStart(8, "0")}`,
    });
  }
  return words;
}

function decodeDescriptor(
  ram,
  entry,
  descriptorEndOffset,
  extent,
  initialArea = null,
) {
  const startOffset = ramOffset(entry.descriptorAddress);
  const endOffset = Math.min(descriptorEndOffset, extent.endOffset);
  const operations = [];
  const routes = [];
  const unresolvedOperationCandidates = [];
  let area = initialArea;

  for (let cursor = startOffset; cursor + 4 <= endOffset;) {
    const operation = ram.readUInt32LE(cursor);
    const wordLength = descriptorOperationWordLength(
      operation,
      (offset) => (
        offset + 4 <= endOffset ? ram.readUInt32LE(offset) : null
      ),
      cursor,
    );
    if (wordLength === null || cursor + wordLength * 4 > endOffset) {
      unresolvedOperationCandidates.push({
        operation,
        address: hexAddress(runtimeAddress(cursor)),
        reason: wordLength === null
          ? "operation has no engine-defined sequential width"
          : "operation extends beyond the owned descriptor bound",
        rawOperands: ram.subarray(
          cursor + 4,
          Math.min(cursor + 16, endOffset),
        ).toString("hex"),
      });
      break;
    }
    const byteLength = wordLength * 4;
    const decoded = {
      operation,
      address: hexAddress(runtimeAddress(cursor)),
      byteLength,
      rawOperands: ram.subarray(cursor + 4, cursor + byteLength).toString("hex"),
    };
    if (DESCRIPTOR_PASS_THROUGH_OPERATIONS.has(operation)) {
      decoded.semanticStatus = (
        "dispatcher-proven synchronous payload skip with no scheduler-side "
        + "state or placement effect"
      );
    } else if (
      DESCRIPTOR_CURRENT_OPERATION_CLEAR_OPERATIONS.has(operation)
    ) {
      decoded.semanticStatus = (
        "dispatcher-proven current-operation clear with no actor-transform "
        + "write"
      );
    } else if (operation === DESCRIPTOR_CONTINUATION_POINTER_OPERATION) {
      decoded.semanticStatus = (
        "dispatcher-proven continuation-pointer registration with no "
        + "actor-transform write"
      );
    } else if (operation === 8) {
      const candidate = ram.subarray(cursor + 4, cursor + 8).toString("ascii");
      if (AREA_IDENTIFIER.test(candidate)) {
        area = candidate;
        decoded.area = area;
      } else {
        decoded.areaDecodeError = "operand is not a four-character area ID";
      }
    } else if (operation === 2) {
      decoded.motionStateId = ram.readInt16LE(cursor + 4);
      decoded.semanticStatus = (
        "engine-proven actor motion-state selection via 0x0c11f7a0"
      );
    } else if (operation === 3) {
      decoded.runtimePosition = [
        ram.readFloatLE(cursor + 4),
        ram.readFloatLE(cursor + 8),
        ram.readFloatLE(cursor + 12),
      ];
      decoded.browserPosition = [
        -decoded.runtimePosition[0],
        decoded.runtimePosition[1],
        decoded.runtimePosition[2],
      ];
      decoded.facingFixed = ram.readInt16LE(cursor + 16);
      decoded.semanticStatus = "engine-proven static position and facing";
    } else if (operation === 7) {
      decoded.durationSeconds = ram.readInt32LE(cursor + 4);
      decoded.semanticStatus = "engine-proven descriptor-clock advance";
    } else if (operation === 9) {
      decoded.actorStateValue = ram.readUInt32LE(cursor + 4);
      decoded.semanticStatus = "engine-proven direct actor-state field write";
    } else if (operation === 0x0b) {
      decoded.targetCode = ram.subarray(cursor + 4, cursor + 8)
        .toString("ascii");
      decoded.runtimeVector = [
        ram.readFloatLE(cursor + 8),
        ram.readFloatLE(cursor + 12),
        ram.readFloatLE(cursor + 16),
      ];
      decoded.controlValue = ram.readUInt32LE(cursor + 20);
    } else if (operation === 0x0c || operation === 0x3c) {
      decoded.targetCode = ram.subarray(cursor + 4, cursor + 8)
        .toString("ascii");
      decoded.controlFloat = ram.readFloatLE(cursor + 8);
    } else if (operation === 0x0f) {
      decoded.actorControlValue = ram.readUInt32LE(cursor + 4);
      decoded.semanticStatus = "engine-proven direct actor-control field write";
    } else if (operation === 0x10) {
      decoded.localTransform = decodeLocalTransformRecord(
        ram,
        cursor,
        (offset) => hexAddress(runtimeAddress(offset)),
      );
      decoded.semanticStatus = (
        "engine-proven object/local-transform registration via 0x0c11d1de"
      );
    } else if (operation === 0x11) {
      decoded.objectCode = ram.subarray(cursor + 4, cursor + 8)
        .toString("ascii");
      decoded.semanticStatus = (
        "engine-proven registered-object transition via 0x0c11d2b6"
      );
    } else if (operation === 0x16) {
      decoded.targetCode = ram.subarray(cursor + 4, cursor + 8)
        .toString("ascii");
      decoded.activationSecond = ram.readInt32LE(cursor + 8);
      decoded.recordCount = ram.readUInt32LE(cursor + 12);
      decoded.encodedWordLength = ram.readUInt32LE(cursor + 16);
      decoded.minimumDelaySeconds = 300;
      decoded.subordinateStream = decodeOperation16Records(
        ram,
        cursor,
        decoded.encodedWordLength,
        decoded.recordCount,
        (offset) => hexAddress(runtimeAddress(offset)),
      );
      decoded.semanticStatus = (
        "engine-proven timed subordinate-command state machine; all nested "
        + "records have exact execution states and handlers, placement "
        + "vectors are decoded, and final motion meanings remain numeric"
      );
    } else if (operation === 0x17) {
      decoded.targetCode = ram.subarray(cursor + 4, cursor + 8)
        .toString("ascii");
      decoded.interactionMode = ram.readUInt32LE(cursor + 8);
      decoded.interactionModeSigned = ram.readInt32LE(cursor + 8);
      decoded.activationSecond = ram.readInt32LE(cursor + 12);
      decoded.timeControlValue = decoded.activationSecond;
      decoded.targetTimeMode = decoded.timeControlValue <= 0
        ? "relative duration"
        : "absolute scheduler second";
      decoded.relativeDurationSeconds = decoded.timeControlValue <= 0
        ? -decoded.timeControlValue
        : null;
      decoded.absoluteTargetSecond = decoded.timeControlValue > 0
        ? decoded.timeControlValue
        : null;
      decoded.runtimePosition = [
        ram.readFloatLE(cursor + 16),
        ram.readFloatLE(cursor + 20),
        ram.readFloatLE(cursor + 24),
      ];
      decoded.browserPosition = [
        -decoded.runtimePosition[0],
        decoded.runtimePosition[1],
        decoded.runtimePosition[2],
      ];
      decoded.controlValues = Array.from(
        { length: 7 },
        (_, index) => ram.readUInt32LE(cursor + 28 + index * 4),
      );
      decoded.semanticStatus = (
        "engine-proven synchronous linked-actor interaction registration; "
        + "the owner descriptor advances immediately, while external "
        + "linked-actor activation installs operation 0x17 at actor +0xd8 "
        + "and dispatches subtype-specific interaction behavior"
      );
    } else if (operation === 0x18) {
      decoded.targetCode = ram.subarray(cursor + 4, cursor + 8)
        .toString("ascii");
      decoded.activationSecond = ram.readInt32LE(cursor + 8);
      decoded.timeControlValue = decoded.activationSecond;
      decoded.targetTimeMode = decoded.timeControlValue <= 0
        ? "relative duration"
        : "absolute scheduler second";
      decoded.relativeDurationSeconds = decoded.timeControlValue <= 0
        ? -decoded.timeControlValue
        : null;
      decoded.absoluteTargetSecond = decoded.timeControlValue > 0
        ? decoded.timeControlValue
        : null;
      decoded.controlValues = Array.from(
        { length: 7 },
        (_, index) => ram.readUInt32LE(cursor + 12 + index * 4),
      );
      decoded.interactionMotionStateIds =
        decoded.controlValues.slice(0, 3).map(
          (value) => value & 0xffff,
        );
      decoded.interactionControlValues =
        decoded.controlValues.slice(3);
      decoded.semanticStatus = (
        "engine-proven timed linked-actor interaction gate via 0x0c0f9812; "
        + "target registry subtypes 1 and 3 dispatch to 0x0c0f8ec0 and "
        + "0x0c0f6b38; nonpositive time operands are relative durations "
        + "and positive operands are absolute scheduler seconds; numeric "
        + "interaction motion/control mappings remain unresolved"
      );
    } else if (operation === 0x19) {
      decoded.motionStateId = ram.readInt16LE(cursor + 4);
      decoded.motionStateControlWord = ram.readUInt32LE(cursor + 4);
      decoded.motionRequestControlValues = [
        ram.readUInt32LE(cursor + 8),
        ram.readUInt32LE(cursor + 12),
        ram.readUInt32LE(cursor + 16),
        ram.readUInt32LE(cursor + 20),
      ];
      decoded.motionRequestEffect = decoded.motionStateControlWord === 0
        ? "tear down the current direct actor motion request"
        : "install or replace the current direct actor motion request";
      decoded.semanticStatus = (
        "engine-proven direct actor motion-controller request via "
        + "0x0c11f804 and 0x0c10d77c; operand one is stored at actor "
        + "+0xf0 and passed as the controller motion-state request"
      );
    } else if (operation === 0x1a) {
      decoded.motionStateId = ram.readInt16LE(cursor + 4);
      decoded.motionControlValue = ram.readUInt32LE(cursor + 8);
      decoded.motionTailValue = ram.readUInt32LE(cursor + 12);
      decoded.semanticStatus = (
        "engine-proven actor motion/control selection via 0x0c11f8dc"
      );
    } else if (operation === 0x1c) {
      const pointCount = ram.readUInt32LE(cursor + 12);
      const rawPointPointer = ram.readUInt32LE(cursor + 16);
      const pointPointer = normalizedRamPointer(
        rawPointPointer,
        ram.length,
      );
      const points = (
        pointCount >= 2
        && pointCount <= 0x1000
        && pointPointer !== null
      ) ? readSecondaryRoutePoints(
        ram,
        pointPointer,
        pointCount,
        extent,
      ) : null;
      decoded.secondaryControlWord = ram.readUInt32LE(cursor + 4);
      decoded.secondaryObjectCode = ram.subarray(cursor + 8, cursor + 12)
        .toString("ascii");
      decoded.pointCount = pointCount;
      decoded.pointPointer = pointPointer === null
        ? null
        : hexAddress(pointPointer);
      decoded.pathControlFloat = ram.readFloatLE(cursor + 20);
      decoded.pathControlValue = ram.readUInt32LE(cursor + 24);
      decoded.pathControlMode = decoded.pathControlFloat > 0
        ? "scaled literal"
        : decoded.pathControlFloat < 0
          ? "attachment speed-table selector"
          : "zero";
      decoded.pathControlSelectorIndex = new Map([
        [-10, 0],
        [-20, 1],
        [-21, 2],
        [-22, 3],
        [-30, 4],
      ]).get(decoded.pathControlFloat) ?? null;
      decoded.secondaryRoute = points && {
        runtimePoints: points.runtimePoints,
        browserPoints: points.browserPoints,
      };
      decoded.routeDecodeStatus = points
        ? "proven attached-object XZ path via 0x0c128a2e"
        : "operands do not resolve to an owned finite XZ array";
      decoded.semanticStatus = (
        "engine-proven routed secondary-object attachment via 0x0c128a2e; "
        + "route pointer/count at actor +0x5c/+0x60; positive path controls "
        + "are scaled by the 0x0c1290f0 float and negative controls select "
        + "an attachment-type speed-table entry through 0x0c12ab92 into "
        + "actor +0x140; source FK0 controls +20 and -20 resolve to the "
        + "same float32 step; "
        + "actor/object synchronization update at 0x0c12ac2e"
      );
    } else if (operation === 0x1d) {
      decoded.semanticStatus = "engine-proven no-op handler at 0x0c11f934";
    } else if (operation === 0x22) {
      const timeControlValue = ram.readInt32LE(cursor + 4);
      const rawCandidatePointer = ram.readUInt32LE(cursor + 8);
      const candidatePointer = normalizedRamPointer(
        rawCandidatePointer,
        ram.length,
      );
      const candidateOffset = candidatePointer === null
        ? null
        : ramOffset(candidatePointer);
      const ownedCandidatePointer = (
        candidateOffset !== null
        && candidateOffset >= extent.startOffset
        && candidateOffset < extent.endOffset
      ) ? candidatePointer : null;
      const motionCandidateStream = ownedCandidatePointer === null
        ? {
          candidates: [],
          terminator: null,
          exactBoundary: false,
          decodeError: "candidate pointer is not owned by the loaded program",
          candidateStrideBytes: 16,
        }
        : decodeOperation22MotionCandidates(
          ram,
          ramOffset(ownedCandidatePointer),
          extent.endOffset,
          (offset) => hexAddress(runtimeAddress(offset)),
        );
      decoded.timeControlValue = timeControlValue;
      decoded.targetTimeMode = timeControlValue < 0
        ? "relative duration"
        : "absolute scheduler second";
      decoded.relativeDurationSeconds = timeControlValue < 0
        ? -timeControlValue
        : null;
      decoded.absoluteTargetSecond = timeControlValue >= 0
        ? timeControlValue
        : null;
      decoded.rawCandidatePointer = hexAddress(rawCandidatePointer);
      decoded.resolvedCandidateAddress = ownedCandidatePointer === null
        ? null
        : hexAddress(ownedCandidatePointer);
      decoded.motionCandidateCount =
        motionCandidateStream.candidates.length;
      decoded.motionCandidates = motionCandidateStream.candidates;
      decoded.uniqueMotionStateIds =
        motionCandidateStream.uniqueMotionStateIds || [];
      decoded.deterministicMotionStateId =
        motionCandidateStream.deterministicMotionStateId ?? null;
      decoded.motionStateSelectionStatus =
        motionCandidateStream.motionStateSelectionStatus
        || "candidate stream unresolved";
      decoded.motionCandidateTerminator =
        motionCandidateStream.terminator;
      decoded.motionCandidateDecodeStatus =
        motionCandidateStream.exactBoundary
          ? "exact owned sentinel-terminated 16-byte candidate array"
          : motionCandidateStream.decodeError;
      decoded.semanticStatus = (
        "engine-proven timed variable-motion gate via 0x0c0f90f2, "
        + "initialized by 0x0c0f8f48 and updated by 0x0c0f8f8c; negative "
        + "time operands are relative durations and nonnegative operands "
        + "are absolute scheduler seconds; numeric motion-state mappings "
        + "remain unresolved"
      );
    } else if (operation === 0x24) {
      decoded.secondaryObjectCode = ram.subarray(cursor + 4, cursor + 8)
        .toString("ascii");
      decoded.runtimeVector = [
        ram.readFloatLE(cursor + 8),
        ram.readFloatLE(cursor + 12),
        ram.readFloatLE(cursor + 16),
      ];
      decoded.transformControlWord = ram.readUInt32LE(cursor + 20);
      decoded.enabled = ram.readUInt32LE(cursor + 24) !== 0;
      decoded.semanticStatus = (
        "engine-proven secondary-object creation/update via 0x0c12b9a0; "
        + "active attachment mirrors linked XYZ/facing into the actor"
      );
    } else if (operation === 0x28) {
      decoded.actorByteValue = ram[cursor + 4];
      decoded.semanticStatus = "engine-proven direct actor byte-field write";
    } else if (operation === 0x2a) {
      decoded.sceneObjectCode = ram.subarray(cursor + 4, cursor + 8)
        .toString("ascii");
      decoded.sceneObjectControlValue = ram.readUInt32LE(cursor + 8);
      decoded.sceneObjectTransitionMode =
        decoded.sceneObjectControlValue + 4;
      decoded.interactionRuntimePosition = [
        ram.readFloatLE(cursor + 12),
        ram.readFloatLE(cursor + 16),
        ram.readFloatLE(cursor + 20),
      ];
      decoded.interactionBrowserPosition = [
        -decoded.interactionRuntimePosition[0],
        decoded.interactionRuntimePosition[1],
        decoded.interactionRuntimePosition[2],
      ];
      decoded.interactionFacingFixed = ram.readInt16LE(cursor + 24);
      decoded.interactionFacingControlWord = ram.readUInt32LE(cursor + 24);
      decoded.interactionControlFloats = [
        ram.readFloatLE(cursor + 28),
        ram.readFloatLE(cursor + 32),
      ];
      decoded.semanticStatus = (
        "engine-proven linked scene-object transition via 0x0c0f9efa; "
        + "object code/control stored at actor +0xc8/+0xd4 and mode "
        + "(control + 4) issued through 0x0c0f9c90 with scheduler time; "
        + "trailing interaction payload retained numerically"
      );
    } else if (operation === 0x2b) {
      decoded.residentCharacterCode = ram.subarray(cursor + 4, cursor + 8)
        .toString("ascii");
      decoded.semanticStatus = (
        "engine-proven resident character-code lookup via 0x0c1147ec and "
        + "actor character-table index write at +0x08"
      );
    } else if (operation === 0x2f) {
      const modelOverrideBytes = ram.subarray(cursor + 4, cursor + 16);
      const terminator = modelOverrideBytes.indexOf(0);
      decoded.modelOverrideCode = modelOverrideBytes.subarray(
        0,
        terminator < 0 ? modelOverrideBytes.length : terminator,
      ).toString("ascii");
      decoded.modelOverrideControlValue = ram.readUInt32LE(cursor + 16);
      decoded.modelOverridePersistent = (
        decoded.modelOverrideControlValue !== 0
      );
      decoded.modelOverrideEffect = decoded.modelOverridePersistent
        ? "refresh and retain the actor model override"
        : "refresh the requested model, then clear the actor override buffer";
      decoded.semanticStatus = (
        "engine-proven actor model override via 0x0c11acd8; name copied to "
        + "actor +0x18e and live model refreshed"
      );
    } else if (operation === 0x30) {
      decoded.actionControllerId = ram.readUInt32LE(cursor + 4);
      decoded.actionControlValues = [
        ram.readUInt32LE(cursor + 8),
        ram.readUInt32LE(cursor + 12),
      ];
      decoded.actionRequestOperand = decoded.actionControlValues[0];
      decoded.actionReservedOperand = decoded.actionControlValues[1];
      decoded.actionControllerMode = decoded.actionControllerId === 0
        ? null
        : 7;
      decoded.actionResolutionBoundary = (
        "mode-7 queued command resolved through the native registered "
        + "motion-bank lookup"
      );
      decoded.actionControllerEffect = decoded.actionControllerId === 0
        ? "tear down the current actor action controller"
        : "install or replace the actor action controller";
      decoded.semanticStatus = (
        "engine-proven actor action-controller request via 0x0c11f026; "
        + "0x0c10d7f6 resolves the exact queued action ID through "
        + "FUN_0c092f14"
      );
    } else if (operation === 0x35) {
      decoded.actorControlValue = ram.readUInt32LE(cursor + 4);
      decoded.semanticStatus = "engine-proven direct actor-control field write";
    } else if (operation === 0x38) {
      decoded.actorBooleanValue = ram.readUInt32LE(cursor + 4) !== 0;
      decoded.semanticStatus = (
        "engine-proven actor boolean-field write and bounds/control refresh"
      );
    } else if (operation === 1) {
      const subtype = ram.readUInt32LE(cursor + 4);
      const pointCount = ram.readUInt32LE(cursor + 8);
      const pointPointer = normalizedRamPointer(
        ram.readUInt32LE(cursor + 12),
        ram.length,
      );
      decoded.subtype = `0x${subtype.toString(16)}`;
      decoded.area = area;
      decoded.pointCount = pointCount;
      decoded.pointPointer = pointPointer === null
        ? null
        : hexAddress(pointPointer);
      const points = (
        area !== null
        && pointCount >= 2
        && pointCount <= 128
        && pointPointer !== null
      ) ? readRoutePoints(ram, pointPointer, pointCount, extent) : null;
      decoded.routeDecodeStatus = points
        ? "proven by operation-1 engine handler"
        : "operands do not resolve to an owned finite XYZ array";
      if (points) {
        routes.push({
          area,
          operationAddress: decoded.address,
          subtype: decoded.subtype,
          pointPointer: decoded.pointPointer,
          runtimePoints: points.runtimePoints,
          browserPoints: points.browserPoints,
          // Compatibility with the reviewed v2 browser manifest.
          points: points.browserPoints,
        });
      }
    }
    operations.push(decoded);
    cursor += byteLength;
    if (DESCRIPTOR_TERMINAL_OPERATIONS.has(operation)) {
      decoded.haltsDescriptorTraversal = true;
      break;
    }
  }

  return {
    descriptorAddress: hexAddress(entry.descriptorAddress),
    descriptorEndAddressExclusive: hexAddress(runtimeAddress(endOffset)),
    rawBytes: ram.subarray(startOffset, endOffset).toString("hex"),
    rawWords: rawWords(ram, startOffset, endOffset),
    decodingEvidence: {
      dispatcherAddress: DESCRIPTOR_DISPATCHER_ADDRESS,
      extensionHandlerAddress: DESCRIPTOR_EXTENSION_HANDLER_ADDRESS,
      operationOneHandlerAddress: OPERATION_ONE_HANDLER_ADDRESS,
    },
    operations,
    unresolvedOperationCandidates,
    routes,
    initialArea,
    finalArea: area,
  };
}

function extractProgram(ram, extent) {
  if (!extent.bounded) {
    return {
      actorCode: extent.actorCode,
      identifier: extent.identifier,
      programHeader: hexAddress(extent.programHeader),
      ownership: {
        bounded: false,
        unresolvedReason: extent.unresolvedReason,
      },
      scheduleTables: [],
    };
  }
  const programBytes = ram.subarray(extent.startOffset, extent.endOffset);
  const nativeMovementScale = ram.readFloatLE(extent.startOffset + 8);
  const normalizedProgram = normalizeProgramRelocations(ram, extent);
  const scheduleTables = discoverScheduleTables(ram, extent).map((table) => {
    let inheritedArea = null;
    const entries = table.entries.map((entry) => {
      const descriptor = decodeDescriptor(
        ram,
        entry,
        entry.descriptorEndOffset,
        extent,
        inheritedArea,
      );
      inheritedArea = descriptor.finalArea;
      return {
        entryAddress: hexAddress(entry.entryAddress),
        startSecond: entry.startSecond,
        startTime: entry.startTime,
        descriptorAddress: hexAddress(entry.descriptorAddress),
        descriptor,
      };
    });
    return {
      scheduleTable: hexAddress(runtimeAddress(table.startOffset)),
      scheduleEndAddressExclusive: hexAddress(runtimeAddress(table.endOffset)),
      terminatorAddress: hexAddress(table.terminatorAddress),
      entries,
    };
  });
  return {
    actorCode: extent.actorCode,
    identifier: extent.identifier,
    programHeader: hexAddress(extent.programHeader),
    programEndAddressExclusive: hexAddress(extent.endAddressExclusive),
    byteLength: extent.byteLength,
    byteSha256: sha256(programBytes),
    sourceNormalizedByteSha256: normalizedProgram.byteSha256,
    normalizedRelocationCount: normalizedProgram.relocationCount,
    nativeMovementScale,
    nativeDefaultPathSpeedPerGameSecond: nativeMovementScale / 24,
    scheduleSelector: {
      engineSelectorAddress: "0x0c11a5ec",
      relocationBaseAddress: hexAddress(
        runtimeAddress(extent.startOffset - 4),
      ),
      selectedRawSchedulePointer: `0x${ram.readUInt32LE(
        extent.startOffset - 4,
      ).toString(16)}`,
    },
    ownership: {
      bounded: true,
      rule: "aligned PRG1 header through the next aligned PRG1 header",
    },
    scheduleTables,
  };
}

export function extractScheduledPrograms(ram) {
  if (ram.length !== RAM_SIZE) {
    throw new Error(`Expected a 16 MiB RAM image, got ${ram.length} bytes.`);
  }
  return discoverProgramExtents(ram).map((extent) => extractProgram(ram, extent));
}

export function flattenRoutes(program) {
  return program.scheduleTables.flatMap((table) => table.entries.flatMap(
    (entry) => entry.descriptor.routes,
  ));
}
