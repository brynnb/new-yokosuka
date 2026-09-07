import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const evidenceUrl = new URL(
  "../tools/evidence/dialogue-actor-body-routes.json",
  import.meta.url,
);

test("native actor conversation bodies retain exact message routing", async () => {
  const report = JSON.parse(await readFile(evidenceUrl, "utf8"));
  assert.equal(report.summary.resourceCount, 262);
  assert.equal(report.summary.bodyCount, 4327);
  assert.ok(report.summary.messageGroupCount > 10_000);
  assert.ok(report.summary.selectedResourceMessageIndexCount > 25_000);
  assert.deepEqual(report.summary.runtimeFieldWrites, [
    {
      scope: "manager",
      offset: "0x11",
      value: 66,
      count: 295,
    },
    {
      scope: "manager",
      offset: "0x11",
      value: 67,
      count: 6,
    },
    {
      scope: "person",
      offset: "0x10",
      value: 11,
      count: 233,
    },
    {
      scope: "person",
      offset: "0x10",
      value: 12,
      count: 93,
    },
  ]);

  const bob = report.examples.find((item) => item.actorCode === "BOB_");
  assert.ok(bob);
  assert.deepEqual(
    [...new Set(
      bob.bodies[0].messageSelections.map((item) => item.messageIndex),
    )].sort((a, b) => a - b),
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  );
  assert.equal(bob.bodies[0].dynamicBoundaryCount, 0);
});
