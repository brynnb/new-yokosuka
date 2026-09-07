import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  extractScheduledPrograms,
  normalizedRamPointer,
  ramOffset,
} from "../tools/lib/scheduled_actor_extractor.js";

const capturePath = "captures/pvr/20260724-103724-frame-35825/ram.bin";
const fixtures = JSON.parse(fs.readFileSync(
  "tools/evidence/scheduled-actor-regression-fixtures.json",
  "utf8",
));
const captureAvailable = fs.existsSync(capturePath);
const mergedManifestPath = "tools/evidence/scheduled-actors.json";
const mergedManifestAvailable = fs.existsSync(mergedManifestPath);
const mergedManifest = mergedManifestAvailable
  ? JSON.parse(fs.readFileSync(mergedManifestPath, "utf8"))
  : null;
const offlineEvidencePath = "tools/evidence/offline-scheduled-actors.json";
const offlineEvidenceAvailable = fs.existsSync(offlineEvidencePath);
const offlineEvidence = offlineEvidenceAvailable
  ? JSON.parse(fs.readFileSync(offlineEvidencePath, "utf8"))
  : null;
const programs = captureAvailable
  ? extractScheduledPrograms(fs.readFileSync(capturePath))
  : [];

test("structural discovery retains all nine reviewed owners", {
  skip: !captureAvailable,
}, () => {
  for (const fixture of fixtures.programs) {
    const program = programs.find((candidate) => (
      candidate.actorCode === fixture.actorCode
      && candidate.programHeader === fixture.programHeader
    ));
    assert.ok(program, `missing ${fixture.actorCode}`);
    assert.equal(program.scheduleTables.length, 1);
    const table = program.scheduleTables[0];
    assert.equal(table.scheduleTable, fixture.scheduleTable);
    const relocationBase = Number.parseInt(
      program.scheduleSelector.relocationBaseAddress,
      16,
    );
    const rawSchedulePointer = Number.parseInt(
      program.scheduleSelector.selectedRawSchedulePointer,
      16,
    );
    assert.equal(
      Number.parseInt(table.scheduleTable, 16),
      relocationBase + rawSchedulePointer,
      `${fixture.actorCode} table must be the engine-selected root`,
    );
    if (fixture.previouslyReviewedEntry) {
      assert.ok(table.entries.some(
        (entry) => entry.entryAddress === fixture.previouslyReviewedEntry,
      ));
    }
  }
});

test("offline timetable roots and story overrides come only from selector slots", {
  skip: !offlineEvidenceAvailable,
}, () => {
  const sourcePrograms = offlineEvidence.files.flatMap(
    (file) => file.programs,
  );
  for (const program of sourcePrograms) {
    const selector = program.scheduleSelector;
    assert.ok(selector, `${program.actorCode} has no native selector`);
    const slots = new Map(selector.pointerSlots.map(
      (slot) => [slot.selectorIndex, slot.scheduleFileOffset],
    ));
    const referencedRoots = new Set(slots.values());
    assert.deepEqual(
      new Set(program.scheduleTables.map((table) => table.fileOffset)),
      referencedRoots,
      `${program.actorCode} contains a non-selector timetable root`,
    );
    for (const table of program.scheduleTables) {
      assert.deepEqual(
        table.selectorIndices,
        selector.pointerSlots.filter(
          (slot) => slot.scheduleFileOffset === table.fileOffset,
        ).map((slot) => slot.selectorIndex),
      );
    }
    for (const condition of selector.conditions) {
      assert.ok(
        slots.has(condition.targetSelectorIndex),
        `${program.actorCode} condition targets missing selector slot`,
      );
    }
  }

  const hato = sourcePrograms.find((program) => program.actorCode === "HATO");
  assert.ok(hato);
  assert.deepEqual(
    hato.scheduleTables.find(
      (table) => table.fileOffset === "0x153e0",
    ).entries.slice(0, 2).map((entry) => entry.startSecond),
    [60, 21600],
  );
  assert.deepEqual(hato.scheduleSelector.conditions, [{
    conditionIndex: 0,
    fileOffset: "0x153d0",
    requiredSetFlags: [20],
    requiredClearFlags: [100],
    startMonth: 0,
    startDay: 0,
    endMonth: 0,
    endDay: 0,
    requiredBaseSelector: -1,
    targetSelectorIndex: 4,
    rawBytes: "140064000000000000000000ffff0400",
  }]);
});

test("operation-1 routes inherit the native actor area across timetable entries", {
  skip: !offlineEvidenceAvailable,
}, () => {
  const fld5 = offlineEvidence.files.flatMap(
    (file) => file.programs,
  ).find((program) => (
    program.actorCode === "FLD5"
    && program.programFileOffset === "0x11e2c"
  ));
  assert.ok(fld5);
  const lunchRoute = fld5.scheduleTables[0].entries.find(
    (entry) => entry.startSecond === 12 * 3600 + 30 * 60,
  );
  assert.equal(lunchRoute.descriptor.initialArea, "MFSY");
  assert.equal(lunchRoute.descriptor.finalArea, "MFSY");
  assert.deepEqual(
    lunchRoute.descriptor.routes.map((route) => ({
      area: route.area,
      pointCount: route.runtimePoints.length,
    })),
    [
      { area: "MFSY", pointCount: 28 },
      { area: "MFSY", pointCount: 34 },
    ],
  );
});

test("operation 0x16 subordinate streams have exact native record boundaries", {
  skip: !offlineEvidenceAvailable,
}, () => {
  const operations = offlineEvidence.files.flatMap(
    (file) => file.programs.flatMap(
      (program) => program.scheduleTables.flatMap(
        (table) => table.entries.flatMap(
          (entry) => entry.descriptor.operations,
        ),
      ),
    ),
  ).filter((operation) => operation.operation === 0x16);
  assert.equal(operations.length, 680);
  const records = operations.flatMap((operation) => {
    assert.equal(operation.subordinateStream.exactBoundary, true);
    assert.equal(operation.subordinateStream.decodeError, null);
    assert.equal(
      operation.subordinateStream.records.length,
      operation.recordCount,
    );
    assert.equal(operation.subordinateStream.terminator.operation, 0x27);
    return operation.subordinateStream.records;
  });
  assert.equal(records.length, 3355);
  assert.deepEqual(
    [...new Set(records.map((record) => record.operation))].sort(
      (left, right) => left - right,
    ),
    [0x02, 0x07, 0x10, 0x11, 0x1a, 0x2d, 0x2e],
  );
  const expectedExecution = new Map([
    [0x02, { state: 5, handler: "0x0c11f7a0" }],
    [0x07, { state: 5, handler: null }],
    [0x10, { state: 5, handler: "0x0c11d1de" }],
    [0x11, { state: 5, handler: "0x0c11d2b6" }],
    [0x1a, { state: 5, handler: "0x0c11f8dc" }],
    [0x2d, { state: 4, handler: "0x0c11d1de" }],
    [0x2e, { state: 6, handler: "0x0c11d2b6" }],
  ]);
  for (const record of records) {
    const expected = expectedExecution.get(record.operation);
    assert.equal(record.requiredControllerState, expected.state);
    assert.equal(record.handlerAddress || null, expected.handler);
    assert.match(record.semanticStatus, /^engine-proven subordinate /);
  }
  for (const record of records.filter(
    (candidate) => candidate.operation === 0x02,
  )) {
    assert.equal(record.motionStateId, record.controlValue << 16 >> 16);
    assert.equal(record.motionUpdateFlag, 0);
  }
  for (const record of records.filter(
    (candidate) => candidate.operation === 0x1a,
  )) {
    assert.equal(record.motionStateId, record.controlValues[0] << 16 >> 16);
    assert.equal(
      record.motionControlValue,
      record.controlValues[1],
    );
    assert.equal(record.motionTailValue, record.controlValues[2]);
  }
  for (const operation of operations) {
    assert.equal(
      operation.subordinateStream.decodingEvidence.stateMachineAddress,
      "0x0c1264e4",
    );
    assert.equal(
      operation.subordinateStream.decodingEvidence.controllerStateOffset,
      "0x110",
    );
    assert.equal(
      operation.subordinateStream.decodingEvidence.subordinateCursorOffset,
      "0x1dc",
    );
  }
  const placements = records.filter(
    (record) => record.operation === 0x10 || record.operation === 0x2d,
  );
  assert.equal(placements.length, 703);
  for (const placement of placements) {
    assert.equal(placement.byteLength, 48);
    assert.ok(Number.isInteger(placement.auxiliaryControlWord));
    assert.ok(placement.runtimePosition.every(Number.isFinite));
    assert.deepEqual(placement.browserPosition, [
      placement.runtimePosition[0] === 0
        ? 0
        : -placement.runtimePosition[0],
      placement.runtimePosition[1],
      placement.runtimePosition[2],
    ]);
  }
});

test("MCIR supplies every operation-0x16 linked route target", {
  skip: !offlineEvidenceAvailable,
}, () => {
  const tables = offlineEvidence.files
    .map((file) => file.linkedRouteTable)
    .filter(Boolean);
  const uniqueTables = new Map(tables.map(
    (table) => [
      table.roots.map((root) => root.targetCode).join(","),
      table,
    ],
  ));
  assert.equal(uniqueTables.size, 2);
  assert.deepEqual(
    [...uniqueTables.values()].map((table) => ({
      roots: table.rootCount,
      groups: table.groupCount,
      leaves: table.leafCount,
      points: table.declaredPointCount,
    })).sort((left, right) => left.roots - right.roots),
    [
      { roots: 11, groups: 23, leaves: 23, points: 170 },
      { roots: 26, groups: 47, leaves: 47, points: 343 },
    ],
  );
  const roots = new Set(tables.flatMap(
    (table) => table.roots.map((root) => root.targetCode),
  ));
  const uniqueRoots = [...uniqueTables.values()].flatMap(
    (table) => table.roots,
  );
  assert.equal(roots.size, 37);
  assert.equal(uniqueRoots.length, roots.size);
  assert.deepEqual(
    uniqueRoots.filter(
      (root) => !root.finalEndpointInvariantAcrossLeaves,
    ).map((root) => root.targetCode).sort(),
    ["FBEA", "HDG1"],
  );
  for (const root of uniqueRoots.filter(
    (candidate) => candidate.finalEndpointInvariantAcrossLeaves,
  )) {
    const leaves = root.groups.flatMap((group) => group.leaves);
    assert.deepEqual(
      root.finalEndpointLeafIndices,
      leaves.map((leaf) => leaf.leafIndex),
    );
    assert.ok(root.finalRuntimeEndpoint.every(Number.isFinite));
    assert.match(root.finalRuntimeEndpointWordHex, /^[a-f0-9]{24}$/);
    const endpointBytes = Buffer.from(
      root.finalRuntimeEndpointWordHex,
      "hex",
    );
    root.finalRuntimeEndpoint.forEach((value, index) => {
      // JSON cannot preserve the sign bit of zero, so compare the decoded
      // bit-exact word numerically while retaining the original word hex.
      const decodedValue = endpointBytes.readFloatLE(index * 4);
      if (decodedValue === 0 && value === 0) return;
      assert.equal(decodedValue, value);
    });
    assert.deepEqual(root.finalBrowserEndpoint, [
      root.finalRuntimeEndpoint[0] === 0
        ? 0
        : -root.finalRuntimeEndpoint[0],
      root.finalRuntimeEndpoint[1],
      root.finalRuntimeEndpoint[2],
    ]);
    for (const leaf of leaves) {
      assert.deepEqual(
        leaf.secondRoute.runtimePoints.at(-1),
        root.finalRuntimeEndpoint,
      );
    }
  }
  const targets = new Set(offlineEvidence.files.flatMap(
    (file) => file.programs.flatMap(
      (program) => program.scheduleTables.flatMap(
        (table) => table.entries.flatMap(
          (entry) => entry.descriptor.operations.filter(
            (operation) => operation.operation === 0x16,
          ).map((operation) => operation.targetCode),
        ),
      ),
    ),
  ));
  assert.equal(targets.size, 30);
  assert.deepEqual(
    [...targets].filter((target) => !roots.has(target)),
    [],
  );
  for (const table of uniqueTables.values()) {
    const points = table.roots.reduce(
      (count, root) => (
        count
        + root.route.runtimePoints.length
        + root.groups.reduce(
          (groupCount, group) => (
            groupCount + group.leaves.reduce(
              (leafCount, leaf) => (
                leafCount
                + leaf.firstRoute.runtimePoints.length
                + leaf.secondRoute.runtimePoints.length
              ),
              0,
            )
          ),
          0,
        )
      ),
      0,
    );
    assert.equal(points, table.declaredPointCount);
  }
});

test("every descriptor opcode has an explicit actor-placement classification", {
  skip: !offlineEvidenceAvailable,
}, () => {
  assert.ok(offlineEvidence.operationCatalog.length > 30);
  for (const operation of offlineEvidence.operationCatalog) {
    assert.ok(operation.actorWorldPlacementEffect);
    assert.doesNotMatch(
      operation.actorWorldPlacementEffect,
      /effect unresolved/,
    );
  }
  assert.deepEqual(
    offlineEvidence.operationCatalog.filter(
      (operation) => operation.actorWorldPlacementEffect.startsWith(
        "writes actor world position",
      ),
    ).map((operation) => operation.operation),
    [1, 3, 0x16],
  );
  assert.equal(
    offlineEvidence.operationCatalog.find(
      (operation) => operation.operation === 0x10,
    ).actorWorldPlacementEffect,
    "no direct actor world-position write",
  );
  assert.match(
    offlineEvidence.operationCatalog.find(
      (operation) => operation.operation === 0x24,
    ).semanticStatus,
    /secondary-object creation\/update/,
  );
  assert.match(
    offlineEvidence.operationCatalog.find(
      (operation) => operation.operation === 0x38,
    ).semanticStatus,
    /bounds\/control refresh/,
  );
  const passThrough = offlineEvidence.operationCatalog.filter(
    (operation) => operation.semanticStatus.startsWith(
      "dispatcher-proven synchronous payload skip",
    ),
  );
  assert.equal(
    passThrough.reduce(
      (count, operation) => count + operation.occurrenceCount,
      0,
    ),
    3350,
  );
  assert.deepEqual(
    passThrough.map((operation) => operation.operation),
    [
      0x0b, 0x0c, 0x0d, 0x15, 0x1b,
      0x21, 0x36, 0x37, 0x39, 0x3c, 0x3d,
    ],
  );
  assert.match(
    offlineEvidence.operationCatalog.find(
      (operation) => operation.operation === 0x05,
    ).semanticStatus,
    /current-operation clear/,
  );
  assert.match(
    offlineEvidence.operationCatalog.find(
      (operation) => operation.operation === 0x20,
    ).semanticStatus,
    /continuation-pointer registration/,
  );
  assert.match(
    offlineEvidence.operationCatalog.find(
      (operation) => operation.operation === 0x30,
    ).semanticStatus,
    /actor action-controller request/,
  );
  assert.equal(
    offlineEvidence.operationCatalog.find(
      (operation) => operation.operation === 0x30,
    ).actorWorldPlacementEffect,
    "changes actor action controller; retains actor world transform",
  );
  assert.match(
    offlineEvidence.operationCatalog.find(
      (operation) => operation.operation === 0x2f,
    ).semanticStatus,
    /actor model override/,
  );
  assert.equal(
    offlineEvidence.operationCatalog.find(
      (operation) => operation.operation === 0x2f,
    ).actorWorldPlacementEffect,
    "changes actor model override; retains actor world transform",
  );
  assert.match(
    offlineEvidence.operationCatalog.find(
      (operation) => operation.operation === 0x2a,
    ).semanticStatus,
    /linked scene-object transition/,
  );
  assert.equal(
    offlineEvidence.operationCatalog.find(
      (operation) => operation.operation === 0x2a,
    ).actorWorldPlacementEffect,
    "changes linked scene-object state; retains actor world transform",
  );
  assert.match(
    offlineEvidence.operationCatalog.find(
      (operation) => operation.operation === 0x22,
    ).semanticStatus,
    /timed variable-motion gate/,
  );
  assert.equal(
    offlineEvidence.operationCatalog.find(
      (operation) => operation.operation === 0x22,
    ).actorWorldPlacementEffect,
    "timed variable-motion gate; retains actor world transform",
  );
  assert.match(
    offlineEvidence.operationCatalog.find(
      (operation) => operation.operation === 0x18,
    ).semanticStatus,
    /timed linked-actor interaction gate/,
  );
  assert.equal(
    offlineEvidence.summary.unresolvedSemanticOperationOccurrenceCount,
    1002,
  );
});

test("discovered timetables are monotonic, terminated, and owner-contained", {
  skip: !captureAvailable,
}, () => {
  for (const program of programs.filter((candidate) => (
    candidate.scheduleTables.length > 0
  ))) {
    const start = Number.parseInt(program.programHeader, 16);
    const end = Number.parseInt(program.programEndAddressExclusive, 16);
    for (const table of program.scheduleTables) {
      assert.ok(Number.parseInt(table.scheduleTable, 16) >= start);
      assert.ok(Number.parseInt(table.terminatorAddress, 16) < end);
      let previous = -1;
      for (const entry of table.entries) {
        assert.ok(entry.startSecond > previous);
        assert.ok(entry.startSecond < 86400);
        previous = entry.startSecond;
        const descriptor = Number.parseInt(entry.descriptorAddress, 16);
        assert.ok(descriptor >= start && descriptor < end);
      }
    }
  }
});

test("CATB 10:13 retains exact runtime and browser route coordinates", {
  skip: !captureAvailable,
}, () => {
  const cat = programs.find((program) => program.actorCode === "CATB");
  const entry = cat.scheduleTables[0].entries.find(
    (candidate) => candidate.startSecond === 10 * 3600 + 13 * 60,
  );
  const route = entry.descriptor.routes.find(
    (candidate) => candidate.subtype === "0x8016",
  );
  assert.equal(route.runtimePoints.length, 39);
  assert.deepEqual(route.runtimePoints[0], [
    -45.56789779663086,
    7,
    98.13996887207031,
  ]);
  assert.deepEqual(route.browserPoints[0], [
    45.56789779663086,
    7,
    98.13996887207031,
  ]);
  assert.deepEqual(route.browserPoints.at(-1), [
    8.27548599243164,
    0.06193799898028374,
    34.242733001708984,
  ]);
  for (let index = 0; index < route.runtimePoints.length; index++) {
    const runtime = route.runtimePoints[index];
    const browser = route.browserPoints[index];
    assert.ok(runtime.every(Number.isFinite));
    assert.deepEqual(browser, [-runtime[0], runtime[1], runtime[2]]);
  }
});

test("pointer aliases normalize without permitting non-RAM pointers", () => {
  assert.equal(normalizedRamPointer(0x0cc5938c), 0x8cc5938c);
  assert.equal(normalizedRamPointer(0x8cc5938c), 0x8cc5938c);
  assert.equal(normalizedRamPointer(0x1cc5938c), null);
  assert.equal(ramOffset(0x8cc5938c), 0xc5938c);
});

test("descriptor bytes round-trip and exact traversal reaches an engine stop", {
  skip: !captureAvailable,
}, () => {
  const program = programs.find((candidate) => candidate.actorCode === "KENI");
  const descriptor = program.scheduleTables[0].entries[0].descriptor;
  const bytes = Buffer.from(descriptor.rawBytes, "hex");
  assert.equal(bytes.length * 2, descriptor.rawBytes.length);
  assert.equal(
    bytes.toString("hex"),
    descriptor.rawWords.map((word) => (
      Buffer.from(word.value.slice(2), "hex").reverse().toString("hex")
    )).join(""),
  );
  assert.equal(descriptor.unresolvedOperationCandidates.length, 0);
  assert.ok([0, 4, 0x12].includes(descriptor.operations.at(-1).operation));
  assert.equal(descriptor.operations.at(-1).haltsDescriptorTraversal, true);
  for (const operation of descriptor.operations) {
    assert.equal(operation.rawOperands.length, (operation.byteLength - 4) * 2);
  }
});

test("operation 1 decodes every engine-handled movement subtype", {
  skip: !captureAvailable,
}, () => {
  const routes = programs.flatMap((program) => (
    program.scheduleTables.flatMap((table) => (
      table.entries.flatMap((entry) => entry.descriptor.routes)
    ))
  ));
  assert.ok(routes.some((route) => route.subtype === "0x8016"));
  assert.ok(routes.some((route) => route.subtype !== "0x8016"));
  for (const route of routes) {
    assert.ok(route.runtimePoints.length >= 2);
    assert.equal(route.runtimePoints.length, route.browserPoints.length);
  }
});

test("CATB ownership cannot be reassigned to a bicycle", {
  skip: !captureAvailable,
}, () => {
  const cat = programs.find((program) => program.actorCode === "CATB");
  assert.equal(cat.identifier, "CATBPRG1");
  assert.notEqual(cat.actorCode, "BIKE");
  assert.ok(cat.scheduleTables.every((table) => (
    Number.parseInt(table.scheduleTable, 16)
      < Number.parseInt(cat.programEndAddressExclusive, 16)
  )));
});

test("cross-capture variants and provenance have deterministic ordering", {
  skip: !mergedManifestAvailable,
}, () => {
  const variantIds = mergedManifest.variants.map(
    (variant) => variant.variantId,
  );
  assert.deepEqual(variantIds, [...variantIds].sort());
  assert.equal(new Set(variantIds).size, variantIds.length);
  for (const variant of mergedManifest.variants) {
    const capturePaths = variant.sourceCaptures.map(
      (source) => source.capturePath,
    );
    assert.deepEqual(capturePaths, [...capturePaths].sort());
  }
});

test("byte-different variants sharing an actor code remain separate", {
  skip: !mergedManifestAvailable,
}, () => {
  const enki = mergedManifest.variants.filter(
    (variant) => variant.actorCode === "ENKI",
  );
  assert.ok(enki.length >= 2);
  assert.equal(
    new Set(enki.map((variant) => variant.programByteSha256)).size,
    enki.length,
  );
});

test("character identity is exact-ID evidence, not schedule proximity", {
  skip: !mergedManifestAvailable,
}, () => {
  const cat = mergedManifest.variants.find(
    (variant) => variant.actorCode === "CATB",
  );
  assert.equal(cat.characterMapping.modelCode, "CT4_M");
  assert.equal(
    cat.characterMapping.evidence,
    "public/data/chars.csv exact actor ID",
  );
  assert.notEqual(cat.characterMapping.modelCode, "BIKE");
});

test("all observed CATB source pointer differences obey one relocation rule", {
  skip: !captureAvailable,
}, () => {
  const evidence = JSON.parse(fs.readFileSync(
    "tools/evidence/scheduled-actor-offline-relocation.json",
    "utf8",
  ));
  const base = (
    0x0c000000
    + (Number.parseInt(evidence.ramProgramHeader, 16) & 0x00ffffff)
    - 4
  );
  assert.equal(evidence.comparison.differingWordCount, 18);
  assert.equal(
    evidence.relocatedWords.length,
    evidence.comparison.differingWordCount,
  );
  for (const word of evidence.relocatedWords) {
    assert.equal(
      base + Number.parseInt(word.source, 16),
      Number.parseInt(word.ram, 16),
    );
  }
  assert.match(evidence.conclusion, /Every byte difference/);
  const cat = programs.find((program) => program.actorCode === "CATB");
  assert.equal(
    cat.sourceNormalizedByteSha256,
    evidence.sourceProgramSha256,
  );
  assert.equal(
    cat.normalizedRelocationCount,
    evidence.comparison.differingWordCount,
  );
});
