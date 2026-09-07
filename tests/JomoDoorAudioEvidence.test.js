import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const evidence = JSON.parse(readFileSync(
  new URL("../tools/evidence/jomo-door-audio.json", import.meta.url),
));

test("JOMO preserves exact model-owned door command pairs", () => {
  assert.equal(
    evidence.schema,
    "new-yokosuka-jomo-door-audio-evidence-v3",
  );
  assert.deepEqual(evidence.summary, {
    logicalRecordCount: 18,
    modelAudioRowCount: 7,
    placementCount: 18,
    uniqueCommandCount: 10,
    uniqueCommands: [
      "ab020200",
      "ab020300",
      "ab020400",
      "ab020500",
      "ab020000",
      "ab020100",
      "ab020600",
      "ab020700",
      "ab020800",
      "ab020900",
    ],
  });
  assert.deepEqual(
    evidence.modelAudioRows.map((row) => [
      row.modelCode,
      row.logicalActionType,
      row.commands.map(({ commandHex }) => commandHex),
    ]),
    [
      ["DR15_026", 20, ["ab020200", "ab020300"]],
      ["DR15_029", 20, ["ab020400", "ab020500"]],
      ["DR01_015", 27, ["ab020000", "ab020100"]],
      ["DR15_028", 20, ["ab020600", "ab020700"]],
      ["DR15_016", 15, ["ab020800", "ab020900"]],
      ["DR01_016", 30, ["ab020000", "ab020100"]],
      ["DR23_000", 23, ["ab020200", "ab020300"]],
    ],
  );
});

test("JOMO door placement rows select only authored model/audio rows", () => {
  assert.equal(evidence.tableLayout.placements.wordsPerRecord, 9);
  assert.equal(evidence.placements.length, 18);
  for (const placement of evidence.placements) {
    const row = evidence.modelAudioRows[placement.modelAudioRowIndex];
    assert.ok(row);
    assert.equal(placement.modelCode, row.modelCode);
    assert.equal(placement.scale.length, 3);
    assert.equal(placement.position.length, 3);
  }
});

test("retail and generated-code dataflow close the table-wide phases", () => {
  assert.deepEqual(
    evidence.runtimePolicy.implementedModels,
    evidence.modelAudioRows.map(({ model }) => model),
  );
  assert.deepEqual(
    evidence.modelAudioRows.map((row) => (
      row.commands.map(({ semanticRole }) => semanticRole)
    )),
    evidence.modelAudioRows.map(() => ["openingStart", "closingStart"]),
  );
  assert.deepEqual(
    evidence.runtimePhaseTrace.events.map((event) => [
      event.phase,
      event.stateBefore,
      event.commandHex,
    ]),
    [
      ["openingStart", "closed", "ab020200"],
      ["closingStart", "open", "ab020300"],
      ["openingStart", "closed", "ab020200"],
    ],
  );
  assert.match(
    evidence.runtimePhaseTrace.conclusion,
    /complete open\/close cycle/,
  );
  assert.deepEqual(
    evidence.runtimePairDataflow.events.map((event) => [
      event.phase,
      event.modelAudioElementIndex,
      event.authoredPairIndex,
      event.commandHex,
    ]),
    [
      ["openingStart", 26, 0, "ab020200"],
      ["closingStart", 27, 1, "ab020300"],
    ],
  );
  assert.match(
    evidence.runtimePairDataflow.conclusion,
    /table-wide phase columns/,
  );
  assert.equal(evidence.nativeDataflow.openingCommandReads.length, 7);
  assert.equal(evidence.nativeDataflow.closingCommandReads.length, 6);
  assert.ok(evidence.nativeDataflow.openingCommandReads.every(
    ({ modelAudioRowWord, authoredPairIndex }) => (
      modelAudioRowWord === 2 && authoredPairIndex === 0
    ),
  ));
  assert.ok(evidence.nativeDataflow.closingCommandReads.every(
    ({ modelAudioRowWord, authoredPairIndex }) => (
      modelAudioRowWord === 3 && authoredPairIndex === 1
    ),
  ));
  assert.deepEqual(
    evidence.nativeDataflow.sharedInitializer.installedContextPointers,
    {
      c0: "logical records",
      c4: "logical mapping",
      c8: "model/audio rows",
      cc: "placements",
    },
  );
  assert.deepEqual(
    evidence.nativeDataflow.selector11LogicalSoundReads.map(
      ({ logicalRecordWord }) => logicalRecordWord,
    ),
    [9, 9],
  );
});
