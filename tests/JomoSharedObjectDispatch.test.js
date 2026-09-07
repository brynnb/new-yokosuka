import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const evidence = JSON.parse(
  fs.readFileSync(
    new URL(
      "../tools/evidence/jomo-shared-object-dispatch.json",
      import.meta.url,
    ),
    "utf8",
  ),
);

test("decodes JOMO shared groups without emulator interaction", () => {
  assert.equal(evidence.method.runtimeInputRequired, false);
  assert.equal(evidence.method.emulatorClicksRequired, false);
  assert.equal(evidence.summary.groupCount, 15);
  assert.equal(evidence.summary.groupedObjectCount, 73);
});

test("keeps the GGB cabinet pair on one exact shared action", () => {
  const group = evidence.groups.find(({ index }) => index === 1);
  assert.deepEqual(
    group.callbackTokens
      .filter(({ opcode }) => opcode === "0x05a9")
      .map(({ selector, functionFileOffset }) => [
        selector,
        functionFileOffset,
      ]),
    [
      [11, "0x11f50"],
      [10, "0x11ce0"],
      [100, "0x58464"],
    ],
  );
  const action = group.pairedActions.find(
    ({ actionId }) => actionId === 0x1c,
  );
  assert.deepEqual(action.objectTags, ["GGB1", "GGB2"]);
  assert.deepEqual(
    action.records.map((record) => record.interactionOffset[0]),
    [-0.30000001192092896, 0.30000001192092896],
  );
  assert.deepEqual(
    action.records.map((record) => record.route.nodeOrVariant),
    [0x0d, 0x08],
  );
});
