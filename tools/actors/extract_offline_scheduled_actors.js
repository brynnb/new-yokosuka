#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  DESCRIPTOR_DISPATCHER_ADDRESS,
  DESCRIPTOR_CONTINUATION_POINTER_OPERATION,
  DESCRIPTOR_CURRENT_OPERATION_CLEAR_OPERATIONS,
  DESCRIPTOR_EXTENSION_HANDLER_ADDRESS,
  DESCRIPTOR_PASS_THROUGH_OPERATIONS,
  DESCRIPTOR_TERMINAL_OPERATIONS,
  descriptorOperationWordLength,
  OPERATION_ONE_HANDLER_ADDRESS,
} from "../lib/scheduler_descriptor_layout.js";
import {
  decodeLocalTransformRecord,
  decodeOperation16Records,
} from "../lib/scheduler_operation_16.js";
import {
  decodeOperation22MotionCandidates,
} from "../lib/scheduler_operation_22.js";
import { extractMcirLinkedRoutes } from "../lib/scheduler_mcir_extractor.js";

const inputRoots = process.argv.slice(2).filter((argument) => (
  !argument.startsWith("--output=")
));
const outputArgument = process.argv.slice(2).find((argument) => (
  argument.startsWith("--output=")
));
const outputPath = path.resolve(
  outputArgument?.slice("--output=".length)
    || "tools/evidence/offline-scheduled-actors.json",
);
const roots = inputRoots.length
  ? inputRoots.map((root) => path.resolve(root))
  : [
    path.resolve(".disc-work/cycleman"),
    path.resolve("extracted_disc3_v2"),
    path.resolve(".disc-work/mapinfo/disc1"),
    path.resolve(".disc-work/mapinfo/disc2"),
    path.resolve(".disc-work/disc3-processed"),
  ].filter(fs.existsSync);

function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function hexOffset(value) {
  return `0x${value.toString(16)}`;
}

function filesUnder(root) {
  if (fs.statSync(root).isFile()) return [root];
  const files = [];
  const pending = [root];
  while (pending.length) {
    const current = pending.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const child = path.join(current, entry.name);
      if (entry.isDirectory()) pending.push(child);
      else if (entry.isFile()) files.push(child);
    }
  }
  return files.sort();
}

function programHeaders(data) {
  const headers = [];
  for (let cursor = 0; cursor + 8 <= data.length; cursor += 4) {
    const identifier = data.subarray(cursor, cursor + 8).toString("ascii");
    if (/^[A-Z0-9_]{4}PRG1$/.test(identifier)) {
      headers.push({ identifier, actorCode: identifier.slice(0, 4), cursor });
    }
  }
  return headers;
}

function resolveLocalPointer(rawPointer, extent) {
  // The relocation base is four bytes before the PRG1 identifier. This exact
  // rule converts CATB's source 0x1168 to RAM descriptor 0x8cc5a3d0 when its
  // loaded header is 0x8cc5926c.
  const resolved = extent.start - 4 + rawPointer;
  if (resolved < extent.start || resolved >= extent.end || (resolved & 3)) {
    return null;
  }
  return resolved;
}

function descriptorTraversalEnd(data, offset, extent) {
  if (offset === null || offset < extent.start || offset >= extent.end) {
    return null;
  }
  for (let guard = 0; guard < 1024 && offset + 4 <= extent.end; guard++) {
    const operation = data.readUInt32LE(offset);
    const wordLength = descriptorOperationWordLength(
      operation,
      (operandOffset) => (
        operandOffset + 4 <= extent.end
          ? data.readUInt32LE(operandOffset)
          : null
      ),
      offset,
    );
    if (wordLength === null || offset + wordLength * 4 > extent.end) {
      return null;
    }
    offset += wordLength * 4;
    if (DESCRIPTOR_TERMINAL_OPERATIONS.has(operation)) return offset;
  }
  return null;
}

function timetableAt(data, start, extent) {
  const entries = [];
  for (
    let cursor = start, index = 0;
    index < 128 && cursor + 4 <= extent.end;
    cursor += 8, index++
  ) {
    const seconds = data.readUInt32LE(cursor);
    if (seconds === 0xffffffff) {
      // A selector may deliberately target an immediate terminator. The
      // engine treats that as an empty timetable (the actor is absent), so it
      // is a real schedule variant rather than a failed parse.
      return { start, end: cursor + 4, terminator: cursor, entries };
    }
    if (cursor + 8 > extent.end || seconds >= 86400) return null;
    if (entries.length && seconds <= entries.at(-1).startSecond) return null;
    const rawDescriptorPointer = data.readUInt32LE(cursor + 4);
    const descriptor = resolveLocalPointer(rawDescriptorPointer, extent);
    const descriptorEnd = descriptorTraversalEnd(data, descriptor, extent);
    if (descriptorEnd === null) return null;
    entries.push({
      entryOffset: cursor,
      startSecond: seconds,
      rawDescriptorPointer,
      descriptor,
      descriptorEnd,
    });
  }
  return null;
}

function programSelector(data, extent) {
  const relocationBase = extent.start - 4;
  if (relocationBase < 0 || relocationBase + 0xfc > extent.end) return null;
  const pointerSlots = Array.from({ length: 16 }, (_, selectorIndex) => {
    const rawSchedulePointer = data.readUInt32LE(
      relocationBase + 0xbc + selectorIndex * 4,
    );
    return {
      selectorIndex,
      rawSchedulePointer,
      scheduleFileOffset: rawSchedulePointer === 0
        ? null
        : resolveLocalPointer(rawSchedulePointer, extent),
    };
  });
  const conditionCount = data.readUInt32LE(relocationBase + 0x74);
  const rawConditionPointer = data.readUInt32LE(relocationBase + 0x78);
  const conditionOffset = resolveLocalPointer(rawConditionPointer, extent);
  if (
    conditionCount > 256
    || (
      conditionCount > 0
      && (
        conditionOffset === null
        || conditionOffset + conditionCount * 16 > extent.end
      )
    )
  ) {
    return null;
  }
  const conditions = Array.from({ length: conditionCount }, (_, index) => {
    const cursor = conditionOffset + index * 16;
    return {
      conditionIndex: index,
      fileOffset: hexOffset(cursor),
      requiredSetFlags: [
        data.readUInt16LE(cursor),
        data.readUInt16LE(cursor + 4),
      ].filter(Boolean),
      requiredClearFlags: [
        data.readUInt16LE(cursor + 2),
        data.readUInt16LE(cursor + 6),
      ].filter(Boolean),
      startMonth: data[cursor + 8],
      startDay: data[cursor + 9],
      endMonth: data[cursor + 10],
      endDay: data[cursor + 11],
      requiredBaseSelector: data.readInt16LE(cursor + 12),
      targetSelectorIndex: data.readUInt16LE(cursor + 14),
      rawBytes: data.subarray(cursor, cursor + 16).toString("hex"),
    };
  });
  const tables = [];
  const unresolvedTables = [];
  for (const scheduleFileOffset of new Set(
    pointerSlots.map((slot) => slot.scheduleFileOffset).filter(
      (offset) => offset !== null,
    ),
  )) {
    const table = timetableAt(data, scheduleFileOffset, extent);
    if (!table) {
      unresolvedTables.push({
        scheduleFileOffset,
        selectorIndices: pointerSlots
          .filter((slot) => slot.scheduleFileOffset === scheduleFileOffset)
          .map((slot) => slot.selectorIndex),
        reason: "timetable or descriptor stream did not decode within PRG1 extent",
      });
      continue;
    }
    table.selectorIndices = pointerSlots
      .filter((slot) => slot.scheduleFileOffset === scheduleFileOffset)
      .map((slot) => slot.selectorIndex);
    tables.push(table);
  }
  return {
    engineSelectorAddress: "0x0c11a5ec",
    relocationBaseFileOffset: hexOffset(relocationBase),
    defaultRawSchedulePointer: hexOffset(
      data.readUInt32LE(relocationBase),
    ),
    pointerTableFileOffset: hexOffset(relocationBase + 0xbc),
    pointerSlots: pointerSlots.map((slot) => ({
      selectorIndex: slot.selectorIndex,
      rawSchedulePointer: hexOffset(slot.rawSchedulePointer),
      scheduleFileOffset: slot.scheduleFileOffset === null
        ? null
        : hexOffset(slot.scheduleFileOffset),
    })),
    conditionCount,
    rawConditionPointer: hexOffset(rawConditionPointer),
    conditionFileOffset: conditionOffset === null
      ? null
      : hexOffset(conditionOffset),
    conditions,
    unresolvedTables: unresolvedTables.map((table) => ({
      scheduleFileOffset: hexOffset(table.scheduleFileOffset),
      selectorIndices: table.selectorIndices,
      reason: table.reason,
    })),
    tables: tables.sort((left, right) => left.start - right.start),
  };
}

function routePoints(data, pointer, count, extent) {
  if (pointer === null || pointer + count * 12 > extent.end) return null;
  const runtimePoints = [];
  const browserPoints = [];
  for (let index = 0; index < count; index++) {
    const cursor = pointer + index * 12;
    const point = [
      data.readFloatLE(cursor),
      data.readFloatLE(cursor + 4),
      data.readFloatLE(cursor + 8),
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

function secondaryRoutePoints(data, pointer, count, extent) {
  if (pointer === null || pointer + count * 8 > extent.end) return null;
  const runtimePoints = [];
  const browserPoints = [];
  for (let index = 0; index < count; index++) {
    const cursor = pointer + index * 8;
    const point = [
      data.readFloatLE(cursor),
      0,
      data.readFloatLE(cursor + 4),
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

function decodeDescriptor(data, entry, end, extent, initialArea = null) {
  const operations = [];
  const routes = [];
  const routeArrayCandidates = [];
  const unresolvedOperations = [];
  let area = initialArea;
  for (let cursor = entry.descriptor; cursor + 4 <= end;) {
    const operation = data.readUInt32LE(cursor);
    const wordLength = descriptorOperationWordLength(
      operation,
      (offset) => offset + 4 <= end ? data.readUInt32LE(offset) : null,
      cursor,
    );
    if (wordLength === null || cursor + wordLength * 4 > end) {
      unresolvedOperations.push({
        operation,
        fileOffset: hexOffset(cursor),
        reason: wordLength === null
          ? "operation has no engine-defined sequential width"
          : "operation extends beyond the owned descriptor bound",
      });
      break;
    }
    const byteLength = wordLength * 4;
    const decoded = {
      operation,
      fileOffset: hexOffset(cursor),
      byteLength,
      rawOperands: data.subarray(cursor + 4, cursor + byteLength).toString("hex"),
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
      const candidate = data.subarray(cursor + 4, cursor + 8).toString("ascii");
      if (/^[A-Z0-9]{4}$/.test(candidate)) {
        area = candidate;
        decoded.area = area;
      } else {
        decoded.areaDecodeError = "operand is not a four-character area ID";
      }
    } else if (operation === 2) {
      decoded.motionStateId = data.readInt16LE(cursor + 4);
      decoded.semanticStatus = (
        "engine-proven actor motion-state selection via 0x0c11f7a0"
      );
    } else if (operation === 3) {
      decoded.runtimePosition = [
        data.readFloatLE(cursor + 4),
        data.readFloatLE(cursor + 8),
        data.readFloatLE(cursor + 12),
      ];
      decoded.browserPosition = [
        -decoded.runtimePosition[0],
        decoded.runtimePosition[1],
        decoded.runtimePosition[2],
      ];
      decoded.facingFixed = data.readInt16LE(cursor + 16);
      decoded.semanticStatus = "engine-proven static position and facing";
    } else if (operation === 7) {
      decoded.durationSeconds = data.readInt32LE(cursor + 4);
      decoded.semanticStatus = "engine-proven descriptor-clock advance";
    } else if (operation === 9) {
      decoded.actorStateValue = data.readUInt32LE(cursor + 4);
      decoded.semanticStatus = "engine-proven direct actor-state field write";
    } else if (operation === 0x0b) {
      decoded.targetCode = data.subarray(cursor + 4, cursor + 8)
        .toString("ascii");
      decoded.runtimeVector = [
        data.readFloatLE(cursor + 8),
        data.readFloatLE(cursor + 12),
        data.readFloatLE(cursor + 16),
      ];
      decoded.controlValue = data.readUInt32LE(cursor + 20);
    } else if (operation === 0x0c || operation === 0x3c) {
      decoded.targetCode = data.subarray(cursor + 4, cursor + 8)
        .toString("ascii");
      decoded.controlFloat = data.readFloatLE(cursor + 8);
    } else if (operation === 0x0f) {
      decoded.actorControlValue = data.readUInt32LE(cursor + 4);
      decoded.semanticStatus = "engine-proven direct actor-control field write";
    } else if (operation === 0x10) {
      decoded.localTransform = decodeLocalTransformRecord(
        data,
        cursor,
        hexOffset,
      );
      decoded.semanticStatus = (
        "engine-proven object/local-transform registration via 0x0c11d1de"
      );
    } else if (operation === 0x11) {
      decoded.objectCode = data.subarray(cursor + 4, cursor + 8)
        .toString("ascii");
      decoded.semanticStatus = (
        "engine-proven registered-object transition via 0x0c11d2b6"
      );
    } else if (operation === 0x16) {
      decoded.targetCode = data.subarray(cursor + 4, cursor + 8)
        .toString("ascii");
      decoded.activationSecond = data.readInt32LE(cursor + 8);
      decoded.recordCount = data.readUInt32LE(cursor + 12);
      decoded.encodedWordLength = data.readUInt32LE(cursor + 16);
      decoded.minimumDelaySeconds = 300;
      decoded.subordinateStream = decodeOperation16Records(
        data,
        cursor,
        decoded.encodedWordLength,
        decoded.recordCount,
        hexOffset,
      );
      decoded.semanticStatus = (
        "engine-proven timed subordinate-command state machine; all nested "
        + "records have exact execution states and handlers, placement "
        + "vectors are decoded, and final motion meanings remain numeric"
      );
    } else if (operation === 0x17) {
      decoded.targetCode = data.subarray(cursor + 4, cursor + 8)
        .toString("ascii");
      decoded.interactionMode = data.readUInt32LE(cursor + 8);
      decoded.interactionModeSigned = data.readInt32LE(cursor + 8);
      decoded.activationSecond = data.readInt32LE(cursor + 12);
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
        data.readFloatLE(cursor + 16),
        data.readFloatLE(cursor + 20),
        data.readFloatLE(cursor + 24),
      ];
      decoded.browserPosition = [
        -decoded.runtimePosition[0],
        decoded.runtimePosition[1],
        decoded.runtimePosition[2],
      ];
      decoded.controlValues = Array.from(
        { length: 7 },
        (_, index) => data.readUInt32LE(cursor + 28 + index * 4),
      );
      decoded.semanticStatus = (
        "engine-proven synchronous linked-actor interaction registration; "
        + "the owner descriptor advances immediately, while external "
        + "linked-actor activation installs operation 0x17 at actor +0xd8 "
        + "and dispatches subtype-specific interaction behavior"
      );
    } else if (operation === 0x18) {
      decoded.targetCode = data.subarray(cursor + 4, cursor + 8)
        .toString("ascii");
      decoded.activationSecond = data.readInt32LE(cursor + 8);
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
        (_, index) => data.readUInt32LE(cursor + 12 + index * 4),
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
      decoded.motionStateId = data.readInt16LE(cursor + 4);
      decoded.motionStateControlWord = data.readUInt32LE(cursor + 4);
      decoded.motionRequestControlValues = [
        data.readUInt32LE(cursor + 8),
        data.readUInt32LE(cursor + 12),
        data.readUInt32LE(cursor + 16),
        data.readUInt32LE(cursor + 20),
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
      decoded.motionStateId = data.readInt16LE(cursor + 4);
      decoded.motionControlValue = data.readUInt32LE(cursor + 8);
      decoded.motionTailValue = data.readUInt32LE(cursor + 12);
      decoded.semanticStatus = (
        "engine-proven actor motion/control selection via 0x0c11f8dc"
      );
    } else if (operation === 0x1c) {
      const pointCount = data.readUInt32LE(cursor + 12);
      const rawPointPointer = data.readUInt32LE(cursor + 16);
      const pointPointer = resolveLocalPointer(rawPointPointer, extent);
      const points = pointCount >= 2 && pointCount <= 0x1000
        ? secondaryRoutePoints(
          data,
          pointPointer,
          pointCount,
          extent,
        )
        : null;
      decoded.secondaryControlWord = data.readUInt32LE(cursor + 4);
      decoded.secondaryObjectCode = data.subarray(cursor + 8, cursor + 12)
        .toString("ascii");
      decoded.pointCount = pointCount;
      decoded.rawPointPointer = hexOffset(rawPointPointer);
      decoded.resolvedFileOffset = pointPointer === null
        ? null
        : hexOffset(pointPointer);
      decoded.pathControlFloat = data.readFloatLE(cursor + 20);
      decoded.pathControlValue = data.readUInt32LE(cursor + 24);
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
      const timeControlValue = data.readInt32LE(cursor + 4);
      const rawCandidatePointer = data.readUInt32LE(cursor + 8);
      const candidatePointer = resolveLocalPointer(
        rawCandidatePointer,
        extent,
      );
      const motionCandidateStream = candidatePointer === null
        ? {
          candidates: [],
          terminator: null,
          exactBoundary: false,
          decodeError: "candidate pointer is not owned by the source program",
          candidateStrideBytes: 16,
        }
        : decodeOperation22MotionCandidates(
          data,
          candidatePointer,
          extent.end,
          hexOffset,
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
      decoded.rawCandidatePointer = hexOffset(rawCandidatePointer);
      decoded.resolvedCandidateFileOffset = candidatePointer === null
        ? null
        : hexOffset(candidatePointer);
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
      decoded.secondaryObjectCode = data.subarray(cursor + 4, cursor + 8)
        .toString("ascii");
      decoded.runtimeVector = [
        data.readFloatLE(cursor + 8),
        data.readFloatLE(cursor + 12),
        data.readFloatLE(cursor + 16),
      ];
      decoded.transformControlWord = data.readUInt32LE(cursor + 20);
      decoded.enabled = data.readUInt32LE(cursor + 24) !== 0;
      decoded.semanticStatus = (
        "engine-proven secondary-object creation/update via 0x0c12b9a0; "
        + "active attachment mirrors linked XYZ/facing into the actor"
      );
    } else if (operation === 0x28) {
      decoded.actorByteValue = data[cursor + 4];
      decoded.semanticStatus = "engine-proven direct actor byte-field write";
    } else if (operation === 0x2a) {
      decoded.sceneObjectCode = data.subarray(cursor + 4, cursor + 8)
        .toString("ascii");
      decoded.sceneObjectControlValue = data.readUInt32LE(cursor + 8);
      decoded.sceneObjectTransitionMode =
        decoded.sceneObjectControlValue + 4;
      decoded.interactionRuntimePosition = [
        data.readFloatLE(cursor + 12),
        data.readFloatLE(cursor + 16),
        data.readFloatLE(cursor + 20),
      ];
      decoded.interactionBrowserPosition = [
        -decoded.interactionRuntimePosition[0],
        decoded.interactionRuntimePosition[1],
        decoded.interactionRuntimePosition[2],
      ];
      decoded.interactionFacingFixed = data.readInt16LE(cursor + 24);
      decoded.interactionFacingControlWord = data.readUInt32LE(cursor + 24);
      decoded.interactionControlFloats = [
        data.readFloatLE(cursor + 28),
        data.readFloatLE(cursor + 32),
      ];
      decoded.semanticStatus = (
        "engine-proven linked scene-object transition via 0x0c0f9efa; "
        + "object code/control stored at actor +0xc8/+0xd4 and mode "
        + "(control + 4) issued through 0x0c0f9c90 with scheduler time; "
        + "trailing interaction payload retained numerically"
      );
    } else if (operation === 0x2b) {
      decoded.residentCharacterCode = data.subarray(cursor + 4, cursor + 8)
        .toString("ascii");
      decoded.semanticStatus = (
        "engine-proven resident character-code lookup via 0x0c1147ec and "
        + "actor character-table index write at +0x08"
      );
    } else if (operation === 0x2f) {
      const modelOverrideBytes = data.subarray(cursor + 4, cursor + 16);
      const terminator = modelOverrideBytes.indexOf(0);
      decoded.modelOverrideCode = modelOverrideBytes.subarray(
        0,
        terminator < 0 ? modelOverrideBytes.length : terminator,
      ).toString("ascii");
      decoded.modelOverrideControlValue = data.readUInt32LE(cursor + 16);
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
      decoded.actionControllerId = data.readUInt32LE(cursor + 4);
      decoded.actionControlValues = [
        data.readUInt32LE(cursor + 8),
        data.readUInt32LE(cursor + 12),
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
      decoded.actorControlValue = data.readUInt32LE(cursor + 4);
      decoded.routeCompletionMotionOverrideId =
        decoded.actorControlValue || null;
      decoded.routeCompletionSelectionStatus =
        decoded.actorControlValue === 0
          ? (
              "native four-candidate actor-definition default-idle "
              + "selection; candidate values unresolved"
            )
          : "exact registered route-completion motion override";
      decoded.semanticStatus = (
        "engine-proven operation-1 route-completion motion override"
      );
    } else if (operation === 0x38) {
      decoded.actorBooleanValue = data.readUInt32LE(cursor + 4) !== 0;
      decoded.semanticStatus = (
        "engine-proven actor boolean-field write and bounds/control refresh"
      );
    } else if (operation === 1) {
      const subtype = data.readUInt32LE(cursor + 4);
      const pointCount = data.readUInt32LE(cursor + 8);
      const rawPointPointer = data.readUInt32LE(cursor + 12);
      const pointPointer = resolveLocalPointer(rawPointPointer, extent);
      const points = pointCount >= 2 && pointCount <= 128
        ? routePoints(data, pointPointer, pointCount, extent)
        : null;
      Object.assign(decoded, {
        subtype: `0x${subtype.toString(16)}`,
        area,
        pointCount,
        rawPointPointer: hexOffset(rawPointPointer),
        resolvedFileOffset: pointPointer === null
          ? null
          : hexOffset(pointPointer),
        routeDecodeStatus: points && area !== null
          ? "proven by operation-1 engine handler"
          : "operands do not resolve to an owned finite XYZ array",
      });
      if (points && area !== null) {
        const candidate = {
          ...decoded,
          pointArrayByteSha256: sha256(data.subarray(
            pointPointer,
            pointPointer + pointCount * 12,
          )),
          firstRuntimePoint: points.runtimePoints[0],
          lastRuntimePoint: points.runtimePoints.at(-1),
          semanticStatus: "proven route array",
        };
        routeArrayCandidates.push(candidate);
        routes.push({
          area,
          subtype: decoded.subtype,
          operationFileOffset: hexOffset(cursor),
          rawPointPointer: hexOffset(rawPointPointer),
          resolvedFileOffset: hexOffset(pointPointer),
          runtimePoints: points.runtimePoints,
          browserPoints: points.browserPoints,
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
    fileOffset: hexOffset(entry.descriptor),
    endFileOffsetExclusive: hexOffset(end),
    rawBytes: data.subarray(entry.descriptor, end).toString("hex"),
    operations,
    unresolvedOperations,
    routeArrayCandidates,
    routes,
    initialArea,
    finalArea: area,
    decodingEvidence: {
      dispatcherAddress: DESCRIPTOR_DISPATCHER_ADDRESS,
      extensionHandlerAddress: DESCRIPTOR_EXTENSION_HANDLER_ADDRESS,
      operationOneHandlerAddress: OPERATION_ONE_HANDLER_ADDRESS,
    },
  };
}

function extractFile(filePath) {
  const data = fs.readFileSync(filePath);
  if (data.subarray(0, 4).toString("ascii") !== "MOBJ") return null;
  const headers = programHeaders(data);
  if (headers.length === 0) return null;
  const programs = headers.map((header, index) => {
    const extent = {
      start: header.cursor,
      end: headers[index + 1]?.cursor ?? data.length,
    };
    const selector = programSelector(data, extent);
    const tables = (selector?.tables || []).map((table) => {
      let inheritedArea = null;
      return {
        fileOffset: hexOffset(table.start),
        terminatorFileOffset: hexOffset(table.terminator),
        selectorIndices: table.selectorIndices,
        entries: table.entries.map((entry) => {
          const descriptor = decodeDescriptor(
            data,
            entry,
            entry.descriptorEnd,
            extent,
            inheritedArea,
          );
          inheritedArea = descriptor.finalArea;
          return {
            entryFileOffset: hexOffset(entry.entryOffset),
            startSecond: entry.startSecond,
            rawDescriptorPointer: hexOffset(entry.rawDescriptorPointer),
            resolvedDescriptorFileOffset: hexOffset(entry.descriptor),
            descriptor,
          };
        }),
      };
    });
    return {
      actorCode: header.actorCode,
      identifier: header.identifier,
      programFileOffset: hexOffset(extent.start),
      programEndFileOffsetExclusive: hexOffset(extent.end),
      byteLength: extent.end - extent.start,
      byteSha256: sha256(data.subarray(extent.start, extent.end)),
      nativeMovementScale: data.readFloatLE(extent.start + 8),
      nativeDefaultPathSpeedPerGameSecond:
        data.readFloatLE(extent.start + 8) / 24,
      relocationBaseFileOffset: hexOffset(extent.start - 4),
      scheduleSelector: selector && {
        engineSelectorAddress: selector.engineSelectorAddress,
        relocationBaseFileOffset: selector.relocationBaseFileOffset,
        defaultRawSchedulePointer: selector.defaultRawSchedulePointer,
        pointerTableFileOffset: selector.pointerTableFileOffset,
        pointerSlots: selector.pointerSlots,
        conditionCount: selector.conditionCount,
        rawConditionPointer: selector.rawConditionPointer,
        conditionFileOffset: selector.conditionFileOffset,
        conditions: selector.conditions,
        unresolvedScheduleTables: selector.unresolvedTables,
      },
      scheduleTables: tables,
      selectedAreas: [...new Set(tables.flatMap((table) => (
        table.entries.flatMap((entry) => (
          entry.descriptor.operations
            .filter((operation) => operation.operation === 8)
            .map((operation) => operation.area)
        ))
      )))].sort(),
    };
  });
  const discMatch = filePath.match(
    /(?:cycleman\/disc|SCENE\/0)([123])(?:\/|$)/,
  );
  return {
    path: path.relative(process.cwd(), filePath),
    inferredDisc: discMatch
      ? Number(discMatch[1])
      : (filePath.includes("disc3") ? 3 : null),
    inferredArea: (
      path.basename(filePath).match(/^CM_([A-Z0-9]{4})\.BIN$/)?.[1]
      || (
        path.basename(filePath) === "CYCLEMAN.BIN"
          ? path.basename(path.dirname(filePath))
          : null
      )
    ),
    sha256: sha256(data),
    byteLength: data.length,
    programCount: programs.length,
    scheduledProgramCount: programs.filter(
      (program) => program.scheduleTables.length > 0,
    ).length,
    linkedRouteTable: extractMcirLinkedRoutes(data),
    programs,
  };
}

const candidateFiles = [...new Set(roots.flatMap(filesUnder))].sort();
const files = [];
for (const [index, filePath] of candidateFiles.entries()) {
  const extracted = extractFile(filePath);
  if (extracted) files.push(extracted);
  if ((index + 1) % 1000 === 0) {
    console.error(`Scanned ${index + 1}/${candidateFiles.length} files.`);
  }
}

const uniquePrograms = new Map();
for (const file of files) {
  for (const program of file.programs) {
    if (program.scheduleTables.length === 0) continue;
    const key = `${program.actorCode}:${program.byteSha256}`;
    if (!uniquePrograms.has(key)) uniquePrograms.set(key, program);
  }
}
const candidateCatalog = new Map();
for (const program of uniquePrograms.values()) {
  for (const table of program.scheduleTables) {
    for (const entry of table.entries) {
      for (const candidate of entry.descriptor.routeArrayCandidates) {
        if (!candidateCatalog.has(candidate.subtype)) {
          candidateCatalog.set(candidate.subtype, {
            subtype: candidate.subtype,
            semanticStatus: candidate.semanticStatus,
            occurrenceCount: 0,
            pointCount: 0,
            actorCodes: new Set(),
            areas: new Set(),
          });
        }
        const catalog = candidateCatalog.get(candidate.subtype);
        catalog.occurrenceCount++;
        catalog.pointCount += candidate.pointCount;
        catalog.actorCodes.add(program.actorCode);
        catalog.areas.add(candidate.area);
      }
    }
  }
}
const routeArrayCandidateCatalog = [...candidateCatalog.values()].map(
  (catalog) => ({
    subtype: catalog.subtype,
    semanticStatus: catalog.semanticStatus,
    occurrenceCount: catalog.occurrenceCount,
    pointCount: catalog.pointCount,
    actorCount: catalog.actorCodes.size,
    actorCodes: [...catalog.actorCodes].sort(),
    areaCount: catalog.areas.size,
    areas: [...catalog.areas].sort(),
  }),
).sort((a, b) => (
  Number.parseInt(a.subtype, 16) - Number.parseInt(b.subtype, 16)
));
const operationCatalogMap = new Map();
for (const program of uniquePrograms.values()) {
  for (const table of program.scheduleTables) {
    for (const entry of table.entries) {
      for (const operation of entry.descriptor.operations) {
        if (!operationCatalogMap.has(operation.operation)) {
          operationCatalogMap.set(operation.operation, {
            operation: operation.operation,
            byteLengths: new Set(),
            semanticStatuses: new Set(),
            occurrenceCount: 0,
            decodedMovementPathCount: 0,
          });
        }
        const catalog = operationCatalogMap.get(operation.operation);
        catalog.byteLengths.add(operation.byteLength);
        if (operation.semanticStatus) {
          catalog.semanticStatuses.add(operation.semanticStatus);
        }
        catalog.occurrenceCount++;
        if (
          operation.operation === 1
          && operation.routeDecodeStatus
            === "proven by operation-1 engine handler"
        ) {
          catalog.decodedMovementPathCount++;
        }
      }
    }
  }
}
function actorWorldPlacementEffect(operation) {
  if (operation === 0) {
    return "descriptor terminal; retains the last proven actor transform";
  }
  if (operation === 1) return "writes actor world position along route";
  if (operation === 3) return "writes actor world position and facing";
  if (operation === 4 || operation === 0x12) {
    return "terminal; retains the last proven actor transform";
  }
  if (operation === 8) return "changes actor native area/world";
  if (DESCRIPTOR_PASS_THROUGH_OPERATIONS.has(operation)) {
    return "no scheduler-side state or actor world-position effect";
  }
  if (DESCRIPTOR_CURRENT_OPERATION_CLEAR_OPERATIONS.has(operation)) {
    return "clears current operation; retains actor world transform";
  }
  if (operation === DESCRIPTOR_CONTINUATION_POINTER_OPERATION) {
    return "registers continuation pointer; retains actor world transform";
  }
  if (operation === 0x30) {
    return "changes actor action controller; retains actor world transform";
  }
  if (operation === 0x2a) {
    return "changes linked scene-object state; retains actor world transform";
  }
  if (operation === 0x2b) {
    return "changes actor resident character selection; retains world transform";
  }
  if (operation === 0x2f) {
    return "changes actor model override; retains actor world transform";
  }
  if (operation === 0x16) {
    return "writes actor world position from shared MCIR linked-route state";
  }
  if (operation === 0x22) {
    return "timed variable-motion gate; retains actor world transform";
  }
  if ([2, 7, 9, 0x0f, 0x10, 0x11, 0x19, 0x1a, 0x1d, 0x24, 0x28, 0x35]
    .includes(operation)) {
    return "no direct actor world-position write";
  }
  if (operation === 0x17) {
    return (
      "synchronous interaction registration; externally activated subtype "
      + "may change actor motion or transform"
    );
  }
  if (operation === 0x18) {
    return "extension-owned dynamic actor state; no direct scheduler position write";
  }
  if (operation === 0x38) {
    return "refreshes actor bounds/control state; no direct world-position write";
  }
  return (
    "no direct scheduler world-position write; downstream actor-task/control "
    + "meaning remains unresolved"
  );
}
const operationCatalog = [...operationCatalogMap.values()].map((catalog) => ({
  operation: catalog.operation,
  operationHex: `0x${catalog.operation.toString(16)}`,
  byteLengths: [...catalog.byteLengths].sort((a, b) => a - b),
  occurrenceCount: catalog.occurrenceCount,
  decodedMovementPathCount: catalog.decodedMovementPathCount,
  actorWorldPlacementEffect: actorWorldPlacementEffect(catalog.operation),
  semanticStatus: catalog.semanticStatuses.size === 1
    ? [...catalog.semanticStatuses][0]
    : (
    [0, 4, 0x12].includes(catalog.operation)
      ? "engine-proven descriptor traversal stop"
      : catalog.operation === 1
        ? "engine-proven movement-path operation"
        : catalog.operation === 3
          ? "engine-proven static position and facing"
          : catalog.operation === 7
            ? "engine-proven descriptor-clock advance"
            : catalog.operation === 8
              ? "engine-proven area selector"
              : catalog.operation === 0x16
                ? (
                  "engine-proven timed subordinate-command operation; "
                  + "123 local-transform records decoded in unique programs"
                )
                : "exact engine-defined boundary; behavior remains numeric"
    ),
})).sort((a, b) => a.operation - b.operation);

const report = {
  schema: "new-yokosuka-offline-scheduled-actors-v1",
  sourceRoots: roots.map((root) => path.relative(process.cwd(), root)),
  relocationRule: (
    "resolved file offset = PRG1 identifier file offset - 4 + raw pointer"
  ),
  decodingBoundary: (
    "Operations are traversed sequentially using the exact word widths from "
    + "the engine dispatcher at 0x0c119444. Operation 1 uses the shared "
    + "movement handler at 0x0c11f948, and operations 0x17, 0x18, and 0x22 "
    + "use the registered extension handler at 0x0c0f5b28. Complete owned "
    + "descriptor bytes remain retained for every timetable entry."
  ),
  files,
  operationCatalog,
  routeArrayCandidateCatalog,
  exactSourceFileGroups: [...Map.groupBy(
    files,
    (file) => file.sha256,
  ).entries()].map(([fileSha256, members]) => ({
    sha256: fileSha256,
    count: members.length,
    members: members.map((file) => file.path).sort(),
  })).sort((a, b) => b.count - a.count || a.sha256.localeCompare(b.sha256)),
  summary: {
    candidateFileCount: candidateFiles.length,
    sourceFileCount: files.length,
    uniqueSourceFileCount: new Set(files.map((file) => file.sha256)).size,
    programCount: files.reduce(
      (count, file) => count + file.programCount,
      0,
    ),
    scheduledProgramCount: files.reduce(
      (count, file) => count + file.scheduledProgramCount,
      0,
    ),
    uniqueScheduledProgramVariantCount: new Set(files.flatMap(
      (file) => file.programs.filter(
        (program) => program.scheduleTables.length > 0,
      ).map((program) => `${program.actorCode}:${program.byteSha256}`),
    )).size,
    routeArrayCandidateSubtypeCount: routeArrayCandidateCatalog.length,
    routeArrayCandidateCount: routeArrayCandidateCatalog.reduce(
      (count, subtype) => count + subtype.occurrenceCount,
      0,
    ),
    provenRoutePointCount: routeArrayCandidateCatalog.reduce(
      (count, subtype) => count + subtype.pointCount,
      0,
    ),
    unresolvedRouteArrayCandidateCount: routeArrayCandidateCatalog.filter(
      (subtype) => subtype.semanticStatus !== "proven route array",
    ).reduce((count, subtype) => count + subtype.occurrenceCount, 0),
    decodedDescriptorOperationCount: [...uniquePrograms.values()].reduce(
      (count, program) => count + program.scheduleTables.reduce(
        (tableCount, table) => tableCount + table.entries.reduce(
          (entryCount, entry) => (
            entryCount + entry.descriptor.operations.length
          ),
          0,
        ),
        0,
      ),
      0,
    ),
    unresolvedDescriptorBoundaryCount: [...uniquePrograms.values()].reduce(
      (count, program) => count + program.scheduleTables.reduce(
        (tableCount, table) => tableCount + table.entries.reduce(
          (entryCount, entry) => (
            entryCount + entry.descriptor.unresolvedOperations.length
          ),
          0,
        ),
        0,
      ),
      0,
    ),
    unresolvedSemanticOperationOccurrenceCount: operationCatalog.filter(
      (operation) => ![
        0, 1, 2, 3, 4, 5, 7, 8, 9, 0x0b, 0x0c, 0x0d, 0x0f,
        0x10, 0x11, 0x12, 0x13, 0x15, 0x19, 0x1a, 0x1b,
        0x1d, 0x1e, 0x1f, 0x20, 0x21, 0x24, 0x28, 0x2b,
        0x2f, 0x35,
        0x36, 0x37, 0x38, 0x39, 0x3a, 0x3b, 0x3c, 0x3d,
      ].includes(operation.operation),
    ).reduce((count, operation) => count + operation.occurrenceCount, 0),
  },
};
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(
  `Wrote ${outputPath}: ${report.summary.programCount} offline programs in `
  + `${report.summary.sourceFileCount} files.`,
);
