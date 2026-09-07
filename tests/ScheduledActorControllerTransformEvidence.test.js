import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";

const evidence = JSON.parse(fs.readFileSync(
  new URL(
    "../tools/evidence/scheduled-actor-controller-transform-evidence.json",
    import.meta.url,
  ),
));

test("mode 10 is the live actor controller transform, not mode 11", () => {
  assert.equal(evidence.nativeRoutine.attachmentMatrixHandler, "0x0c11d6fa");
  assert.equal(evidence.nativeRoutine.controllerPointer, "actor +0x6c");
  assert.equal(evidence.summary.observationCount, 2);
  assert.equal(evidence.summary.allFacingValuesMatch, true);
  assert.ok(evidence.summary.maximumCurrentPositionDelta < 0.05);
  assert.ok(evidence.summary.minimumActionToCurrentDistance > 10);
});
