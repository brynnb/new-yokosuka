import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const evidence = JSON.parse(fs.readFileSync(
  "tools/evidence/spatial-interaction-system-inventory.json",
  "utf8",
));

test("all-disc spatial interaction inventory retains the native subsystem pattern", () => {
  assert.equal(
    evidence.status,
    "exact-operation-launch-record-and-result-routing-inventory",
  );
  assert.equal(evidence.summary.mapinfoScanned, 136);
  assert.equal(evidence.summary.mapsWithOperation0181, 24);
  assert.equal(evidence.summary.operation0181Calls, 96);
  assert.deepEqual(evidence.summary.modeCounts, {
    0: 24,
    1: 24,
    2: 48,
  });
  assert.equal(evidence.summary.modeZeroCallsWithSerializedSource, 21);
  assert.equal(
    evidence.summary.modeZeroCallsWithoutRecoveredLaunchSource,
    3,
  );
  assert.equal(
    evidence.summary.modeZeroCallsWithRecoveredResultRouting,
    24,
  );
  assert.equal(evidence.summary.serializedSpatialRecords, 178);
  assert.equal(evidence.summary.customHalfWidthEntries, 88);
});

test("each installed subsystem has one selector and its lifecycle operations", () => {
  for (const map of evidence.maps) {
    assert.equal(map.modeCounts["0"], 1);
    assert.equal(map.modeCounts["1"], 1);
    assert.equal(map.modeCounts["2"], 2);
    const selector = map.calls.find((call) => call.mode === 0);
    assert.equal(selector.argumentCount, 6);
    assert.equal(
      selector.selectorResultRouting.storedValue,
      "operation 0x0181 result + 1",
    );
    assert.equal(
      selector.selectorResultRouting.arrayElementStrideBytes,
      4,
    );
    if (map.area === "JABE") {
      assert.equal(map.serializedSources.length, 0);
      assert.equal(selector.coroutineLaunches.length, 0);
    } else {
      assert.equal(map.serializedSources.length, 1);
      assert.ok(map.serializedSources[0].recordCount > 0);
      assert.equal(
        map.serializedSources[0].records.length,
        map.serializedSources[0].recordCount,
      );
      assert.equal(
        map.serializedSources[0].terminator.raw,
        "0x47c35000",
      );
      assert.equal(selector.coroutineLaunches.length, 1);
      assert.equal(selector.coroutineLaunches[0].argumentCount, 6);
      assert.equal(
        selector.childArguments.filter((argument) => (
          argument.kind === "static-pointer"
        )).length,
        1,
      );
    }
  }
});
