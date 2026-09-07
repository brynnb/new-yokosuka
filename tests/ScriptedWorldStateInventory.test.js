import fs from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const report = JSON.parse(
  fs.readFileSync("tools/evidence/scripted-world-state-inventory.json", "utf8"),
);

test("scripted-world inventory covers every extracted scene", () => {
  assert.equal(report.schema, "new-yokosuka-scripted-world-state-inventory-v2");
  assert.ok(report.maps.some((item) => item.scene === 1));
  assert.ok(report.maps.some((item) => item.scene === 2));
  assert.ok(report.maps.some((item) => item.scene === 3));
  assert.equal(report.summary.mapCount, report.maps.length);
});

test("persistent flag calls use only the proven namespace mapping", () => {
  const expected = new Map([
    [11, ["read", 2]],
    [12, ["write", 2]],
    [13, ["read", 3]],
    [14, ["write", 3]],
    [15, ["read", 4]],
    [16, ["write", 4]],
  ]);
  for (const map of report.maps) {
    for (const group of map.operationGroups) {
      if (group.kind !== "persistent-flag") continue;
      const [action, namespace] = expected.get(group.subcommand);
      assert.equal(group.action, action);
      assert.equal(group.namespace, namespace);
    }
  }
});

test("known D000 door flags are present as exact namespace-2 reads", () => {
  const d000 = report.maps.find(
    (item) => item.scene === 1 && item.area === "D000",
  );
  assert.ok(d000);
  const flags = new Set(
    d000.operationGroups
      .filter(
        (group) =>
          group.kind === "persistent-flag" &&
          group.action === "read" &&
          group.namespace === 2,
      )
      .map((group) => group.flagOrIndex),
  );
  for (const flag of [70, 100, 160, 180, 818]) assert.ok(flags.has(flag));
});

test("low-level object-state semantics stay evidence bounded", () => {
  assert.equal(
    report.nativeSemantics["0x001f"].field,
    "resolved object +0x88, mask 0x04",
  );
  assert.match(report.evidenceBoundary, /No open\/closed/);
  assert.ok(report.summary.selectedOperationCounts["0x001f"] > 0);
  assert.ok(report.summary.selectedOperationCounts["0x00a8"] > 0);
});
