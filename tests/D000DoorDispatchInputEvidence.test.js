import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const evidence = JSON.parse(fs.readFileSync(
  "tools/evidence/d000-door-dispatch-input-evidence.json",
  "utf8",
));

test("D000 door selector is distinct from operation 0x0031 event state", () => {
  assert.equal(
    evidence.schema,
    "new-yokosuka-d000-door-dispatch-input-evidence-v1",
  );
  assert.equal(evidence.status, "exact");
  assert.deepEqual(evidence.doorCoroutine.eventControlQuery, {
    operation: "0x0031",
    argument: 1,
    callFileOffset: "0x783ea",
    meaning: "current event/coroutine control field; not the logical door selector",
    nativeRecordOffset: 8,
    width: "u16",
  });
  assert.equal(
    evidence.doorCoroutine.selectorInputDataflow.resumedArgumentFrameOffset,
    60,
  );
  assert.equal(
    evidence.doorCoroutine.selectorInputDataflow.selectorLocalFrameOffset,
    48,
  );
  assert.equal(
    evidence.nativeOperation0031.handlerAddress,
    "0x0c16b4c8",
  );
  assert.equal(
    evidence.nativeOperation0031.currentSceneOwnerGlobal,
    "0x0c217488",
  );
  assert.deepEqual(
    evidence.nativeOperation0031.fieldRoutes.map((route) => [
      route.argument,
      route.width,
      route.recordOffset,
    ]),
    [
      [0, "u16", 4],
      [1, "u16", 8],
      [2, "u16", 10],
      [3, "u8", 12],
      [4, "u8", 13],
      [5, "u8", 14],
      [6, "u8", 15],
      [7, "u16", 18],
    ],
  );
  assert.ok(evidence.captureCorpus.d000CaptureCount > 100);
  assert.deepEqual(
    evidence.captureCorpus.operation0031Argument1Values.map(
      ({ value }) => value,
    ),
    [0, 1024, 4096],
  );
  assert.match(evidence.captureCorpus.conclusion, /not D000 logical door/);
  assert.match(evidence.conclusion, /supplier.*remains upstream/i);
  assert.match(evidence.evidenceBoundary, /does not yet prove/);
});
