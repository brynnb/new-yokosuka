import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const evidence = JSON.parse(fs.readFileSync(
  new URL("../tools/evidence/d000-interaction-selector-evidence.json", import.meta.url),
));

test("D000 interaction selector preserves the exact native index boundary", () => {
  assert.equal(
    evidence.status,
    "exact-native-spatial-selector-boundary",
  );
  assert.equal(evidence.nativeOperation0181.recordStrideBytes, 24);
  assert.equal(evidence.nativeOperation0181.notSelectedSentinel, -1);
  assert.deepEqual(
    evidence.nativeOperation0181.recordSchema.map(({ offset }) => offset),
    ["0x00", "0x0c", "0x10", "0x14"],
  );
  assert.equal(
    evidence.nativeOperation0181.selectionGeometry.verticalHalfExtent,
    0.3999999761581421,
  );
  assert.equal(
    evidence.nativeOperation0181.selectionGeometry.defaultLateralHalfWidth,
    0.3999999761581421,
  );
  assert.equal(
    evidence.nativeOperation0181.selectionGeometry.longitudinalHalfExtent,
    0.5999999642372131,
  );
  assert.equal(
    evidence.nativeOperation0181.selectionGeometry.facingToleranceDegrees,
    90,
  );
  assert.equal(
    evidence.generatedInteractionCoroutine.sceneSelectorWrite.value,
    "spatial selector result + 1",
  );
  assert.deepEqual(
    evidence.generatedInteractionCoroutine.sceneSelectorReset,
    {
      fileOffset: "0x29e8",
      sceneContextRelativeOffset: "0x84",
      slotIndexLocalFrameOffset: 88,
      value: -1,
      hatoControlWait: {
        functionFileOffset: "0x8002c",
        readFileOffset: "0x80070",
        slotIndex: 0,
        requiredValue: -1,
      },
      exactBoundary: (
        "The generic interaction coroutine owns this reset. "
        + "It is an interaction-selector lifecycle transition, "
        + "not a room-ready timer."
      ),
    },
  );
  assert.deepEqual(
    evidence.generatedInteractionCoroutine.interactionStateLifecycle,
    {
      sceneContextRelativeOffset: "0xb0",
      slotIndexLocalFrameOffset: 88,
      selectedWrite: {
        fileOffset: "0x16e8",
        value: 3,
      },
      consumedReset: {
        fileOffset: "0x29d4",
        value: 0,
      },
      hatoCleanupHandshake: {
        functionFileOffset: "0x8002c",
        orWriteFileOffset: "0x8015c",
        orMask: 1,
        waitReadFileOffset: "0x80164",
        completionValue: 0,
      },
    },
  );
  assert.equal(
    evidence.hatoPredicateConnection.requiredOneBasedSceneSelector,
    6,
  );
  assert.equal(
    evidence.hatoPredicateConnection.requiredZeroBasedSpatialIndex,
    5,
  );
  assert.equal(
    evidence.hatoPredicateConnection.selectedSpatialRecord.index,
    5,
  );
  assert.equal(
    evidence.hatoPredicateConnection.selectedSpatialRecord.lateralHalfWidth,
    0.5,
  );
});

test("D000 authored spatial records remain raw and source-addressable", () => {
  const table = evidence.serializedSpatialSource;
  assert.equal(table.recordCount, 18);
  assert.equal(table.records.length, 18);
  assert.equal(table.records[0].fileOffset, table.tableFileOffset);
  assert.equal(table.records[5].rawHex.length, 48);
  assert.equal(table.records[5].packedFieldsHex.length, 24);
  assert.equal(table.records[5].requiredFacingRaw, 9375);
  assert.equal(table.records[5].selectorFlags, 264);
  assert.equal(table.records[5].usesCustomHalfWidth, true);
  assert.equal(table.records[5].auxiliaryWord, 8);
  assert.equal(table.capturedTableByteExact, true);
  assert.equal(
    table.customHalfWidthOverrides.capturedTableByteExact,
    true,
  );
  assert.deepEqual(
    table.customHalfWidthOverrides.entries.map(
      ({ recordIndex, lateralHalfWidth }) => ({
        recordIndex,
        lateralHalfWidth,
      }),
    ),
    [
      { recordIndex: 0, lateralHalfWidth: 1 },
      { recordIndex: 1, lateralHalfWidth: 1 },
      { recordIndex: 2, lateralHalfWidth: 1 },
      { recordIndex: 3, lateralHalfWidth: 1 },
      { recordIndex: 4, lateralHalfWidth: 0.5 },
      { recordIndex: 5, lateralHalfWidth: 0.5 },
    ],
  );
  assert.equal(table.runtimeContext.count, 18);
  assert.equal(table.runtimeContext.actorTag, "AKIR");
});
