import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const evidence = JSON.parse(fs.readFileSync(
  new URL(
    "../tools/evidence/operation-017d-evidence.json",
    import.meta.url,
  ),
  "utf8",
));

test("operation 0x017d evidence pins its request and selector-five lifecycle", () => {
  assert.equal(evidence.operation.operationHex, "0x017d");
  assert.equal(evidence.operation.argumentCount, 4);
  assert.deepEqual(evidence.operation.fixedRequestCoreArguments, {
    routeScalar: -1,
    supplementalRecordPointer: 0,
    selector: 5,
  });
  assert.deepEqual(evidence.selectorFiveLifecycle.farRouteTransition, [3, 8]);
  assert.deepEqual(
    evidence.selectorFiveLifecycle.nearRouteTransition,
    [3, 4, 8],
  );
  assert.deepEqual(evidence.selectorFiveLifecycle.alignmentLoop, [8, 7, 8]);
  assert.deepEqual(
    evidence.selectorFiveLifecycle.completionTransition,
    [8, 11, 0],
  );
  assert.equal(evidence.allDiscInventory.authoredCallCount, 297);
  assert.equal(evidence.allDiscInventory.areaCount, 96);
  assert.deepEqual(evidence.allDiscInventory.callsByDisc, {
    1: 90,
    2: 105,
    3: 102,
  });
  assert.equal(evidence.allDiscInventory.storedResultCount, 0);
});
