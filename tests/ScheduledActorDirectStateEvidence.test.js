import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const evidence = JSON.parse(fs.readFileSync(
  "tools/evidence/scheduled-actor-direct-state-evidence.json",
  "utf8",
));
const byOperation = new Map(
  evidence.operationFamilies.map((family) => [family.operation, family]),
);

test("direct scheduled-actor state operations retain exact native boundaries", () => {
  assert.equal(
    evidence.schema,
    "new-yokosuka-scheduled-actor-direct-state-evidence-v1",
  );
  assert.deepEqual([...byOperation.keys()], [0x09, 0x0f, 0x28, 0x38]);

  assert.equal(byOperation.get(0x09).handlerAddress, "0x0c1195fc");
  assert.equal(byOperation.get(0x09).actorOffset, "0x14");
  assert.equal(
    byOperation.get(0x09).consumerEvidence.nonOneConsumerAddress,
    "0x0c11ee08",
  );

  assert.equal(byOperation.get(0x0f).actorOffset, "0x90");
  assert.equal(
    byOperation.get(0x0f).consumerEvidence.queryAddress,
    "0x0c119888",
  );

  assert.equal(byOperation.get(0x28).actorOffset, "0x149");
  assert.deepEqual(
    Object.keys(byOperation.get(0x28).summary.valueCounts).sort(),
    ["0", "1"],
  );

  assert.equal(byOperation.get(0x38).actorOffset, "0x1d1");
  assert.equal(
    byOperation.get(0x38).consumerEvidence.refreshAddress,
    "0x0c11a382",
  );
  assert.match(byOperation.get(0x38).evidenceBoundary, /visibility/);
});
