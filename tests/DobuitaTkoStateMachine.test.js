import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const evidence = JSON.parse(
  fs.readFileSync(
    new URL(
      "../tools/evidence/d000-tko-state-machine.json",
      import.meta.url,
    ),
    "utf8",
  ),
);

test("recovers the exact D000 TKO time window and story selectors", () => {
  assert.equal(evidence.schema, "new-yokosuka-d000-tko-state-machine-v1");
  assert.deepEqual(evidence.clockWindow.start, { hour: 7, minute: 0 });
  assert.deepEqual(evidence.clockWindow.end, { hour: 19, minute: 0 });
  assert.equal(
    evidence.clockWindow.boundary,
    "start-inclusive, end-exclusive",
  );
  assert.deepEqual(
    evidence.storySelectors.map((selector) => ({
      selector: selector.selector,
      tags: selector.tags,
      variableId: selector.variableRead.variableId,
      resultMask: selector.variableRead.resultMask,
    })),
    [
      {
        selector: 0,
        tags: { primary: "TKOK", transition: "TKOM" },
        variableId: "0x02f3",
        resultMask: "0x2",
      },
      {
        selector: 1,
        tags: { primary: "TKOL", transition: "TKON" },
        variableId: "0x0298",
        resultMask: "0x2",
      },
    ],
  );
  for (const routine of Object.values(evidence.routines)) {
    assert.match(routine.sha256, /^[0-9a-f]{64}$/);
    assert.ok(routine.byteLength > 0);
  }
});
