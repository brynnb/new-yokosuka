import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const catalog = JSON.parse(fs.readFileSync(
  "play/data/shenmue1-schedule-catalog.json",
  "utf8",
));
const registry = JSON.parse(fs.readFileSync(
  "tools/evidence/scheduled-actor-default-idle-evidence.json",
  "utf8",
));

test("Shenmue I schedule catalog covers every native registry actor", () => {
  assert.equal(catalog.schema, "new-yokosuka-shenmue1-schedule-catalog-v1");
  assert.equal(catalog.summary.nativeRegistryActorCodeCount, 249);
  assert.equal(catalog.summary.sourceActorCodeCount, 249);
  assert.equal(catalog.summary.sourceProgramCount, 265);
  assert.equal(catalog.summary.decodedProgramCount, 265);
  assert.deepEqual(catalog.summary.missingNativeSourceActorCodes, []);

  const sourceCodes = new Set(catalog.programs.map(({ actorCode }) => actorCode));
  assert.deepEqual(
    [...registry.actors]
      .map(({ actorCode }) => actorCode)
      .filter((actorCode) => !sourceCodes.has(actorCode)),
    [],
  );
});

test("complete schedules retain native selector and provenance data", () => {
  for (const program of catalog.programs) {
    assert.match(program.actorCode, /^[A-Z0-9_]{4}$/);
    assert.equal(program.scheduleSelector.pointerSlots.length, 16);
    assert.ok(Array.isArray(program.scheduleSelector.conditions));
    assert.ok(Array.isArray(
      program.scheduleSelector.unresolvedScheduleTables,
    ));
    assert.ok(program.scheduleTables.length > 0);
    assert.ok(program.sourceFiles.length > 0);
    assert.match(program.sourceProgramByteSha256, /^[a-f0-9]{64}$/);
  }
});

test("underscore actor programs include Tom Johnson's complete selectors", () => {
  for (const actorCode of [
    "BUS_",
    "INE_",
    "JOE_",
    "KIM_",
    "ONO_",
    "TOM_",
    "UNO_",
  ]) {
    assert.ok(
      catalog.programs.some((program) => program.actorCode === actorCode),
      actorCode,
    );
  }

  const tomPrograms = catalog.programs.filter(
    ({ actorCode }) => actorCode === "TOM_",
  );
  assert.equal(tomPrograms.length, 2);
  for (const tom of tomPrograms) {
    assert.equal(tom.label, "Tom Johnson");
    assert.equal(tom.modelCode, "AME_L");
    assert.equal(tom.scheduleStatus, "decoded");
    assert.equal(tom.scheduleTables.length, 4);
    assert.deepEqual(
      tom.scheduleTables.map(({ selectorIndices }) => selectorIndices),
      [
        [0, 1, 2, 3, 7, 8, 9, 10, 11, 12, 13, 14, 15],
        [4],
        [5],
        [6],
      ],
    );
    assert.equal(tom.scheduleSelector.conditions.length, 4);
    assert.deepEqual(tom.scheduleSelector.unresolvedScheduleTables, []);
  }
});
