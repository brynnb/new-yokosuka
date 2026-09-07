#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const inventoryPath = path.resolve(
  process.argv[2]
    || "tools/evidence/scheduled-actor-capture-inventory.json",
);
const sourceManifestPath = path.resolve(
  process.argv[3] || "tools/evidence/scheduled-actors.json",
);
const outputPath = path.resolve(
  process.argv[4]
    || "tools/evidence/scheduled-actor-attachment-evidence.json",
);
const enginePath = path.resolve(
  process.argv[5] || ".disc-work/exact/1ST_READ.BIN",
);

const inventory = JSON.parse(fs.readFileSync(inventoryPath, "utf8"));
const sourceManifest = JSON.parse(
  fs.readFileSync(sourceManifestPath, "utf8"),
);
const POSITIVE_PATH_CONTROL_SCALE = 0.009259258396923542;
const ENGINE_LOAD_ADDRESS = 0x0c010000;
const NEGATIVE_PATH_CONTROL_SELECTOR_POINTER_ADDRESS = 0x0c1290f4;
const NEGATIVE_PATH_CONTROL_SELECTOR_ADDRESS = 0x0c12ab92;
const NEGATIVE_PATH_CONTROL_MINUS_20_LITERAL_ADDRESS = 0x0c129100;
const ATTACHMENT_OBJECT_CODE_MASK_ADDRESS = 0x0c12abf4;
const FORKLIFT_OBJECT_PREFIX_ADDRESS = 0x0c12ac00;
const FORKLIFT_PATH_STEP_TABLE_POINTER_ADDRESS = 0x0c12ad38;
const FORKLIFT_PATH_STEP_TABLE_ADDRESS = 0x0c2778a4;
const FORKLIFT_PATH_STEP_TABLE_COUNT = 5;
const SCHEDULER_CLOCK_LITERAL_ADDRESS = 0x0c115b08;
const SCHEDULER_CLOCK_LITERAL_LENGTH = 12;
const SCHEDULER_CLOCK_CACHE_POINTER_OFFSET = 4;
const engine = fs.readFileSync(enginePath);
function engineOffset(address) {
  return address - ENGINE_LOAD_ADDRESS;
}
function engineUInt32(address) {
  return engine.readUInt32LE(engineOffset(address));
}
function engineFloat(address) {
  return engine.readFloatLE(engineOffset(address));
}
const executableChecks = new Map([
  [
    NEGATIVE_PATH_CONTROL_SELECTOR_POINTER_ADDRESS,
    NEGATIVE_PATH_CONTROL_SELECTOR_ADDRESS,
  ],
  [NEGATIVE_PATH_CONTROL_MINUS_20_LITERAL_ADDRESS, 0xc1a00000],
  [ATTACHMENT_OBJECT_CODE_MASK_ADDRESS, 0x00ffffff],
  [FORKLIFT_OBJECT_PREFIX_ADDRESS, 0x00304b46],
  [
    FORKLIFT_PATH_STEP_TABLE_POINTER_ADDRESS,
    FORKLIFT_PATH_STEP_TABLE_ADDRESS,
  ],
]);
for (const [address, expected] of executableChecks) {
  if (engineUInt32(address) !== expected) {
    throw new Error(
      `1ST_READ operation-0x1c signature mismatch at 0x${
        address.toString(16)
      }`,
    );
  }
}
const forkliftPathStepTable = Array.from(
  { length: FORKLIFT_PATH_STEP_TABLE_COUNT },
  (_, index) => engineFloat(
    FORKLIFT_PATH_STEP_TABLE_ADDRESS + index * 4,
  ),
);
const positiveTwentyPathStep = Math.fround(
  Math.fround(20) * Math.fround(POSITIVE_PATH_CONTROL_SCALE),
);
if (!forkliftPathStepTable.every(
  (value) => value === positiveTwentyPathStep,
)) {
  throw new Error("Reviewed FK0 path-step table is no longer unanimous");
}
const schedulerClockLiteralOffset = (
  SCHEDULER_CLOCK_LITERAL_ADDRESS - ENGINE_LOAD_ADDRESS
);
const schedulerClockLiteral = engine.subarray(
  schedulerClockLiteralOffset,
  schedulerClockLiteralOffset + SCHEDULER_CLOCK_LITERAL_LENGTH,
);
if (
  schedulerClockLiteral.length !== SCHEDULER_CLOCK_LITERAL_LENGTH
  || schedulerClockLiteral.readUInt32LE(0) !== 0x0c114856
) {
  throw new Error(
    "1ST_READ scheduler clock literal signature does not match "
    + "the reviewed 0x0c115b08 callsite",
  );
}

const operation24ActorCodes = new Set(sourceManifest.sourceVariants
  .filter((variant) => variant.scheduleTables.some(
    (table) => table.entries.some(
      (entry) => entry.descriptor.operations.some(
        (operation) => operation.operation === 0x24,
      ),
    ),
  ))
  .map((variant) => variant.actorCode));

function resolvedPathStep(operation, attachmentObjectCode) {
  if (operation.pathControlFloat > 0) {
    return Math.fround(
      Math.fround(operation.pathControlFloat)
      * Math.fround(POSITIVE_PATH_CONTROL_SCALE),
    );
  }
  if (
    operation.pathControlFloat === -20
    && attachmentObjectCode.startsWith("FK0")
  ) {
    return forkliftPathStepTable[1];
  }
  return null;
}

const sourceRouteVariants = new Map();
const sourceRouteOperations = [];
for (const variant of sourceManifest.sourceVariants) {
  const routes = variant.scheduleTables.flatMap(
    (table) => table.entries.flatMap(
      (entry) => entry.descriptor.operations.filter(
        (operation) => (
          operation.operation === 0x1c
          && operation.secondaryRoute?.runtimePoints?.length
        ),
      ).map((operation) => ({
        operation,
        journeyStartSecond: entry.startSecond,
      })),
    ),
  ).map((route) => ({
    ...route,
    sourceVariantId: variant.sourceVariantId,
  }));
  sourceRouteOperations.push(...routes.map(({ operation }) => ({
    actorCode: variant.actorCode,
    sourceVariantId: variant.sourceVariantId,
    secondaryObjectCode: operation.secondaryObjectCode,
    sourceOperationFileOffset: operation.fileOffset,
    pointCount: operation.pointCount,
    pathControlFloat: operation.pathControlFloat,
    pathControlValue: operation.pathControlValue,
    resolvedPathStepPerUpdate: resolvedPathStep(
      operation,
      operation.secondaryObjectCode,
    ),
  })));
  sourceRouteVariants.set(
    `${variant.actorCode}:${variant.sourceProgramByteSha256}`,
    routes,
  );
  const actorRoutes = sourceRouteVariants.get(`${variant.actorCode}:*`) || [];
  sourceRouteVariants.set(`${variant.actorCode}:*`, actorRoutes.concat(routes));
}

function hexAddress(offset) {
  return `0x${(0x8c000000 + offset).toString(16)}`;
}

function physicalOffset(pointer, byteLength) {
  const offset = pointer & 0x00ffffff;
  return offset < byteLength ? offset : null;
}

function pointerBytes(pointer) {
  const result = Buffer.alloc(4);
  result.writeUInt32LE(pointer >>> 0);
  return result;
}

function occurrences(data, bytes) {
  const result = [];
  let cursor = -1;
  while ((cursor = data.indexOf(bytes, cursor + 1)) !== -1) {
    result.push(cursor);
  }
  return result;
}

function schedulerClock(data) {
  const matches = occurrences(data, schedulerClockLiteral);
  if (matches.length !== 1) {
    return {
      status: matches.length === 0
        ? "scheduler-clock-literal-not-resident"
        : "scheduler-clock-literal-not-unique",
      literalCandidateAddresses: matches.map(hexAddress),
    };
  }
  const literalOffset = matches[0];
  const cachePointer = data.readUInt32LE(
    literalOffset + SCHEDULER_CLOCK_CACHE_POINTER_OFFSET,
  );
  const cacheOffset = physicalOffset(cachePointer, data.length);
  if (cacheOffset === null || cacheOffset + 4 > data.length) {
    return {
      status: "scheduler-clock-cache-pointer-outside-source-ram",
      literalAddress: hexAddress(literalOffset),
      cachePointer: `0x${cachePointer.toString(16)}`,
    };
  }
  const second = data.readUInt32LE(cacheOffset);
  return {
    status: second < 86400
      ? "exact-scheduler-clock-second"
      : "scheduler-clock-second-out-of-range",
    literalAddress: hexAddress(literalOffset),
    cachePointer: `0x${cachePointer.toString(16)}`,
    second,
  };
}

function runtimeVector(data, offset) {
  return [
    data.readFloatLE(offset),
    data.readFloatLE(offset + 4),
    data.readFloatLE(offset + 8),
  ];
}

function browserVector(runtime) {
  return [-runtime[0], runtime[1], runtime[2]];
}

function wordVector(data, offset) {
  return [
    data.readUInt32LE(offset),
    data.readUInt32LE(offset + 4),
    data.readUInt32LE(offset + 8),
  ];
}

function sourceRouteWords(operation) {
  return operation.secondaryRoute.runtimePoints.flatMap((point) => {
    const words = Buffer.alloc(8);
    words.writeFloatLE(point[0], 0);
    words.writeFloatLE(point[2], 4);
    return [words.readUInt32LE(0), words.readUInt32LE(4)];
  });
}

function wordsSha256(words) {
  const data = Buffer.alloc(words.length * 4);
  words.forEach((word, index) => data.writeUInt32LE(word, index * 4));
  return crypto.createHash("sha256").update(data).digest("hex");
}

const captures = [];
for (const capture of inventory.captures) {
  const relevantPrograms = capture.scheduledPrograms.filter(
    (program) => operation24ActorCodes.has(program.actorCode),
  );
  if (relevantPrograms.length === 0) continue;

  const data = fs.readFileSync(capture.path);
  const clock = schedulerClock(data);
  const actors = [];
  for (const program of relevantPrograms) {
    const programHeader = Number.parseInt(program.programHeader, 16);
    // Native actor records point four bytes before the PRG1 owner header.
    // Runtime pointers use the 0x0c cached alias in the reviewed captures.
    const ownerPointer = ((programHeader & 0x0fffffff) - 4) >>> 0;
    const actorOffsets = occurrences(data, pointerBytes(ownerPointer))
      .filter((offset) => offset + 0x1dc <= data.length);
    if (actorOffsets.length !== 1) {
      actors.push({
        actorCode: program.actorCode,
        programHeader: program.programHeader,
        ownerPointer: `0x${ownerPointer.toString(16)}`,
        status: actorOffsets.length === 0
          ? "runtime-actor-record-not-resident"
          : "runtime-actor-record-not-unique",
        candidateActorRecordAddresses: actorOffsets.map(hexAddress),
      });
      continue;
    }

    const actorOffset = actorOffsets[0];
    const actorPositionWords = wordVector(data, actorOffset + 0x24);
    const actorRuntimePosition = runtimeVector(data, actorOffset + 0x24);
    const attachmentPointer = data.readUInt32LE(actorOffset + 0x98);
    const attachmentOffset = physicalOffset(attachmentPointer, data.length);
    const currentRoutePointer = data.readUInt32LE(actorOffset + 0x5c);
    const currentRouteOffset = physicalOffset(currentRoutePointer, data.length);
    const currentRoutePointCount = data.readUInt16LE(actorOffset + 0x60);
    const currentRouteTargetIndex = data.readUInt16LE(actorOffset + 0x62);
    const runtimeFramePathStep = data.readFloatLE(actorOffset + 0x58);
    const runtimePathStep = data.readFloatLE(actorOffset + 0x140);
    const previousUpdateRuntimePosition = runtimeVector(
      data,
      actorOffset + 0x168,
    );
    const observedUpdateDisplacement = Math.hypot(
      ...actorRuntimePosition.map(
        (value, axis) => value - previousUpdateRuntimePosition[axis],
      ),
    );
    const base = {
      actorCode: program.actorCode,
      programHeader: program.programHeader,
      ownerPointer: `0x${ownerPointer.toString(16)}`,
      actorRecordAddress: hexAddress(actorOffset),
      actorRuntimePosition,
      actorBrowserPosition: browserVector(actorRuntimePosition),
      actorFacingFixed: data.readInt16LE(actorOffset + 0x50),
      attachmentPointer: `0x${attachmentPointer.toString(16)}`,
      currentRoutePointer: `0x${currentRoutePointer.toString(16)}`,
      currentRoutePointCount,
      currentRouteTargetIndex,
      runtimeFramePathStep,
      runtimePathStep,
      previousUpdateRuntimePosition,
      previousUpdateBrowserPosition: browserVector(
        previousUpdateRuntimePosition,
      ),
      observedUpdateDisplacement,
    };
    if (attachmentPointer === 0) {
      actors.push({
        ...base,
        status: "no-active-secondary-object",
      });
      continue;
    }
    if (attachmentOffset === null || attachmentOffset + 0x58 > data.length) {
      actors.push({
        ...base,
        status: "attachment-pointer-outside-source-ram",
      });
      continue;
    }

    const attachedActorCode = data.subarray(
      attachmentOffset,
      attachmentOffset + 4,
    ).toString("ascii");
    const secondaryObjectCode = data.subarray(
      attachmentOffset + 4,
      attachmentOffset + 8,
    ).toString("ascii");
    const area = data.subarray(
      attachmentOffset + 8,
      attachmentOffset + 12,
    ).toString("ascii");
    const objectPositionWords = wordVector(data, attachmentOffset + 0x1c);
    const objectRuntimePosition = runtimeVector(data, attachmentOffset + 0x1c);
    const objectFacingFixed = data.readInt16LE(attachmentOffset + 0x44);
    const actorPositionMatchesObject = actorPositionWords.every(
      (word, index) => word === objectPositionWords[index],
    );
    const actorFacingMatchesObject = (
      data.readUInt16LE(actorOffset + 0x50)
      === data.readUInt16LE(attachmentOffset + 0x44)
    );
    const attachmentOwnsActor = attachedActorCode === program.actorCode;
    const sourceRoutes = sourceRouteVariants.get(
      `${program.actorCode}:${program.sourceNormalizedByteSha256}`,
    ) || sourceRouteVariants.get(`${program.actorCode}:*`) || [];
    const runtimeRouteWords = (
      currentRouteOffset !== null
      && currentRoutePointCount > 0
      && currentRouteOffset + currentRoutePointCount * 8 <= data.length
    ) ? Array.from(
      { length: currentRoutePointCount * 2 },
      (_, index) => data.readUInt32LE(currentRouteOffset + index * 4),
    ) : null;
    const exactSourceRoutes = runtimeRouteWords
      ? sourceRoutes.filter(({ operation }) => {
        if (operation.pointCount !== currentRoutePointCount) return false;
        const sourceWords = sourceRouteWords(operation);
        return sourceWords.length === runtimeRouteWords.length
          && sourceWords.every(
            (word, index) => word === runtimeRouteWords[index],
          );
      })
      : [];
    actors.push({
      ...base,
      attachmentRecordAddress: hexAddress(attachmentOffset),
      attachedActorCode,
      secondaryObjectCode,
      area,
      objectRuntimePosition,
      objectBrowserPosition: browserVector(objectRuntimePosition),
      objectFacingFixed,
      attachmentOwnsActor,
      currentRouteWithinSourceRam: runtimeRouteWords !== null,
      currentRouteExactSourceMatchCount: exactSourceRoutes.length,
      currentRouteExactSourceMatches: exactSourceRoutes.map((match) => ({
        sourceVariantId: match.sourceVariantId,
        journeyStartSecond: match.journeyStartSecond,
        secondaryObjectCode: match.operation.secondaryObjectCode,
        sourceOperationFileOffset: match.operation.fileOffset,
        sourcePointFileOffset: match.operation.resolvedFileOffset,
        pointCount: match.operation.pointCount,
        pathControlFloat: match.operation.pathControlFloat,
        resolvedPathStepPerUpdate: resolvedPathStep(
          match.operation,
          secondaryObjectCode,
        ),
        routePointWordsSha256: wordsSha256(
          sourceRouteWords(match.operation),
        ),
      })),
      observedUpdateDisplacementMatchesFramePathStep: (
        exactSourceRoutes.length > 0
        && Number.isFinite(observedUpdateDisplacement)
        && Math.abs(
          observedUpdateDisplacement - runtimeFramePathStep
        ) <= 0.00001
      ),
      actorPositionMatchesObject,
      actorFacingMatchesObject,
      status: !attachmentOwnsActor
        ? "stale-or-reused-attachment-pointer"
        : actorPositionMatchesObject && actorFacingMatchesObject
          ? "bit-exact-active-attachment"
          : "active-attachment-mismatch",
    });
  }
  captures.push({
    path: capture.path,
    sha256: capture.sha256,
    likelyDisc: capture.likelyDisc,
    likelyArea: capture.likelyArea,
    schedulerClock: clock,
    actors,
  });
}

const observations = captures.flatMap((capture) => capture.actors);
const exact = observations.filter(
  (actor) => actor.status === "bit-exact-active-attachment",
);
const synchronizedRouteGroups = [];
for (const capture of captures) {
  const groups = new Map();
  for (const actor of capture.actors) {
    if (
      actor.status !== "bit-exact-active-attachment"
      || actor.currentRouteExactSourceMatchCount === 0
    ) continue;
    for (const match of actor.currentRouteExactSourceMatches) {
      const key = [
        match.routePointWordsSha256,
        actor.secondaryObjectCode,
        actor.currentRouteTargetIndex,
        actor.runtimeFramePathStep,
        ...actor.actorRuntimePosition,
        ...actor.previousUpdateRuntimePosition,
      ].join(":");
      const group = groups.get(key) || {
        capturePath: capture.path,
        captureSha256: capture.sha256,
        likelyDisc: capture.likelyDisc,
        likelyArea: capture.likelyArea,
        schedulerClockSecond: capture.schedulerClock.second,
        routePointWordsSha256: match.routePointWordsSha256,
        secondaryObjectCode: actor.secondaryObjectCode,
        currentRouteTargetIndex: actor.currentRouteTargetIndex,
        runtimeFramePathStep: actor.runtimeFramePathStep,
        actorRuntimePosition: actor.actorRuntimePosition,
        previousUpdateRuntimePosition: actor.previousUpdateRuntimePosition,
        actors: [],
      };
      if (!group.actors.some(
        (candidate) => candidate.actorCode === actor.actorCode
          && candidate.sourceVariantId === match.sourceVariantId,
      )) {
        group.actors.push({
          actorCode: actor.actorCode,
          sourceVariantId: match.sourceVariantId,
          journeyStartSecond: match.journeyStartSecond,
          sourceOperationFileOffset: match.sourceOperationFileOffset,
          sourcePointFileOffset: match.sourcePointFileOffset,
        });
      }
      groups.set(key, group);
    }
  }
  synchronizedRouteGroups.push(
    ...[...groups.values()].filter((group) => group.actors.length > 1),
  );
}
for (const group of synchronizedRouteGroups) {
  group.actors.sort((left, right) => (
    left.actorCode.localeCompare(right.actorCode)
    || left.sourceVariantId.localeCompare(right.sourceVariantId)
  ));
  group.distinctJourneyStartSeconds = [...new Set(
    group.actors.map((actor) => actor.journeyStartSecond),
  )].sort((left, right) => left - right);
  group.journeyStartSecondSpan = (
    group.distinctJourneyStartSeconds.at(-1)
    - group.distinctJourneyStartSeconds[0]
  );
}
const synchronizedRouteStateSignatures = new Set(
  synchronizedRouteGroups.map((group) => [
    group.likelyDisc,
    group.likelyArea,
    group.schedulerClockSecond,
    group.routePointWordsSha256,
    group.secondaryObjectCode,
    group.currentRouteTargetIndex,
    group.runtimeFramePathStep,
    ...group.actorRuntimePosition,
    ...group.previousUpdateRuntimePosition,
    group.actors.map((actor) => (
      `${actor.actorCode}:${actor.journeyStartSecond}`
    )).join(","),
  ].join(":")),
);
const report = {
  schema: "new-yokosuka-scheduled-actor-attachment-evidence-v1",
  generatedFrom: [
    path.relative(process.cwd(), inventoryPath),
    path.relative(process.cwd(), sourceManifestPath),
    path.relative(process.cwd(), enginePath),
  ],
  evidenceBoundary: (
    "Actor records are discovered from their relocated PRG1 owner pointer, "
    + "not a fixed RAM address. Operation-0x24 handler 0x0c12b9a0 proves the "
    + "actor +0x98 secondary-object link. Active linked records store owner "
    + "code at +0x00, object code at +0x04, area at +0x08, XYZ at +0x1c, "
    + "and facing at +0x44. The report compares those fields bit-for-bit "
    + "against actor XYZ at +0x24 and facing at +0x50. For active routed "
    + "attachments it also compares the actor +0x5c route array against the "
    + "offline source XZ words byte-for-byte. The reviewed routed update "
    + "copies actor +0x140 into the per-update +0x58 path step; the report "
    + "also measures current XYZ against the adjacent +0x168 prior-position "
    + "vector rather than inferring movement from screenshots. Positive "
    + "controls use the literal scale at 0x0c1290f0; negative controls call "
    + "0x0c12ab92 and select an attachment-type table entry. All 114 source "
    + "routes resolve: the 65 FK0 -20 selectors choose table index 1, whose "
    + "float is bit-identical to the 49 scaled +20 controls. Finally, "
    + "owner records with byte-identical route arrays are grouped only when "
    + "their target index, current/prior positions, and frame step are exact; "
    + "this tests whether route phase follows each timetable start."
  ),
  handlerEvidence: {
    descriptorDispatchPointerAddress: "0x0c11979c",
    descriptorDispatchTargetAddress: "0x0c12b9a0",
    actorAttachmentPointerOffset: "0x98",
    actorPositionOffset: "0x24",
    actorFacingOffset: "0x50",
    actorRoutePointerOffset: "0x5c",
    actorRoutePointCountOffset: "0x60",
    actorRouteTargetIndexOffset: "0x62",
    actorFramePathStepOffset: "0x58",
    actorPathStepOffset: "0x140",
    actorPreviousUpdatePositionOffset: "0x168",
    routedMovementFunctionAddress: "0x0c12751a",
    framePathStepPreparationAddress: "0x0c127a9a",
    positivePathControlScaleAddress: "0x0c1290f0",
    positivePathControlScale: POSITIVE_PATH_CONTROL_SCALE,
    positivePathControlRule: (
      "pathControlFloat * positivePathControlScale"
    ),
    negativePathControlSelectorAddress:
      "0x0c12ab92",
    negativePathControlSelectorPointerAddress:
      "0x0c1290f4",
    negativeTwentyLiteralAddress: "0x0c129100",
    negativeTwentyRule: (
      "-20 selects index 1 from the attachment-type path-step table"
    ),
    attachmentObjectCodeMask: "0x00ffffff",
    forkliftObjectPrefix: "FK0",
    forkliftPathStepTablePointerAddress: "0x0c12ad38",
    forkliftPathStepTableAddress: "0x0c2778a4",
    forkliftPathStepTable,
    forkliftNegativeTwentyPathStep: forkliftPathStepTable[1],
    positiveTwentyPathStep,
    forkliftSignedTwentyEquivalence: (
      "FK0 table index 1 equals float32(20 * 0x0c1290f0)"
    ),
    schedulerClockFunctionAddress: "0x0c114856",
    schedulerClockLiteralAddress: "0x0c115b08",
    schedulerClockDiscovery: (
      "find the unique reviewed 1ST_READ literal signature in each RAM "
      + "capture, then follow its embedded cache pointer"
    ),
    attachmentOwnerCodeOffset: "0x00",
    attachmentObjectCodeOffset: "0x04",
    attachmentAreaOffset: "0x08",
    attachmentPositionOffset: "0x1c",
    attachmentFacingOffset: "0x44",
  },
  summary: {
    sourceRouteOperationCount: sourceRouteOperations.length,
    sourceRouteActorCodeCount: new Set(sourceRouteOperations.map(
      (operation) => operation.actorCode,
    )).size,
    sourceRoutePointCount: sourceRouteOperations.reduce(
      (count, operation) => count + operation.pointCount,
      0,
    ),
    sourcePositiveTwentyRouteOperationCount:
      sourceRouteOperations.filter(
        (operation) => operation.pathControlFloat === 20,
      ).length,
    sourceNegativeTwentyRouteOperationCount:
      sourceRouteOperations.filter(
        (operation) => operation.pathControlFloat === -20,
      ).length,
    sourceResolvedPathStepOperationCount:
      sourceRouteOperations.filter(
        (operation) => Number.isFinite(
          operation.resolvedPathStepPerUpdate,
        ),
      ).length,
    operation24ActorCodeCount: operation24ActorCodes.size,
    relevantCaptureCount: captures.length,
    runtimeActorObservationCount: observations.length,
    activeAttachmentObservationCount: observations.filter(
      (actor) => actor.attachmentOwnsActor,
    ).length,
    bitExactActiveAttachmentCount: exact.length,
    activeRoutedAttachmentObservationCount: exact.filter(
      (actor) => actor.currentRoutePointCount > 0,
    ).length,
    exactSourceRouteArrayObservationCount: exact.filter(
      (actor) => actor.currentRouteExactSourceMatchCount > 0,
    ).length,
    exactSourceRouteFrameDisplacementMatchCount: exact.filter(
      (actor) => (
        actor.currentRouteExactSourceMatchCount > 0
        && actor.observedUpdateDisplacementMatchesFramePathStep
      ),
    ).length,
    exactSourceRouteResolvedPathStepMatchCount: exact.filter(
      (actor) => actor.currentRouteExactSourceMatches.some(
        (route) => (
          Number.isFinite(route.resolvedPathStepPerUpdate)
          && route.resolvedPathStepPerUpdate === actor.runtimePathStep
        ),
      ),
    ).length,
    synchronizedSharedRouteGroupCount: synchronizedRouteGroups.length,
    uniqueSynchronizedSharedRouteStateCount:
      synchronizedRouteStateSignatures.size,
    synchronizedSharedRouteGroupsWithDifferentJourneyStarts:
      synchronizedRouteGroups.filter(
        (group) => group.distinctJourneyStartSeconds.length > 1,
      ).length,
    maximumSynchronizedJourneyStartSecondSpan: Math.max(
      0,
      ...synchronizedRouteGroups.map(
        (group) => group.journeyStartSecondSpan,
      ),
    ),
    unmatchedSourceRouteArrayObservationCount: exact.filter(
      (actor) => (
        actor.currentRoutePointCount > 0
        && actor.currentRouteExactSourceMatchCount === 0
      ),
    ).length,
    exactSchedulerClockCaptureCount: captures.filter(
      (capture) => (
        capture.schedulerClock.status === "exact-scheduler-clock-second"
      ),
    ).length,
    activeAttachmentActorCodes: [...new Set(
      exact.map((actor) => actor.actorCode),
    )].sort(),
    activeSecondaryObjectCodes: [...new Set(
      exact.map((actor) => actor.secondaryObjectCode),
    )].sort(),
    mismatchCount: observations.filter(
      (actor) => actor.status.endsWith("mismatch"),
    ).length,
    staleOrReusedAttachmentPointerCount: observations.filter(
      (actor) => actor.status === "stale-or-reused-attachment-pointer",
    ).length,
  },
  synchronizedRouteGroups,
  sourceRouteOperations,
  captures,
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(
  `Wrote ${outputPath}: ${exact.length} bit-exact active attachment `
  + `observations across ${captures.length} relevant captures.`,
);
