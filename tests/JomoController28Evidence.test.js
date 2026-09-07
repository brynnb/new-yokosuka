import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const evidence = JSON.parse(readFileSync(
  new URL(
    "../tools/evidence/jomo-controller28-evidence.json",
    import.meta.url,
  ),
));

test("JOMO selected-record setup configures controller 28", () => {
  assert.equal(
    evidence.schema,
    "new-yokosuka-jomo-controller28-evidence-v1",
  );
  assert.equal(evidence.selectedRecordSetup.controllerId, 28);
  assert.deepEqual(
    evidence.selectedRecordSetup.calls.map((call) => [
      call.callFileOffset,
      call.operationId,
      call.selector ?? null,
    ]),
    [
      ["0x83798", "0x006a", null],
      ["0x837b4", "0x0066", 2],
      ["0x837cc", "0x0066", 4],
      ["0x837e4", "0x0066", 5],
      ["0x83800", "0x0066", 6],
      ["0x83818", "0x0066", 10],
    ],
  );
});

test("the two static pointers are four-float parameter tables", () => {
  assert.deepEqual(
    evidence.selectedRecordSetup.parameterTables.map((table) => ({
      fileOffset: table.fileOffset,
      selector: table.usedBySelector,
      words: table.words,
    })),
    [
      {
        fileOffset: "0x0009c670",
        selector: 2,
        words: [
          "0x3f47ae14",
          "0x3f51eb85",
          "0x3f170a3d",
          "0x3eeb851f",
        ],
      },
      {
        fileOffset: "0x0009c680",
        selector: 6,
        words: [
          "0x3f63d70a",
          "0x3f63d70a",
          "0x3e051eb8",
          "0x3ec7ae14",
        ],
      },
    ],
  );
  for (const table of evidence.selectedRecordSetup.parameterTables) {
    assert.equal(
      table.classification,
      "four-float-controller-parameter-table",
    );
  }
});

test("selector 2 copies four source floats into controller fields", () => {
  assert.deepEqual(
    evidence.engine.operation0066.selector2Semantics,
    {
      targetAddress: "0x0c0eb1d0",
      source: "four consecutive float words at supplied pointer",
      primaryControllerDestinationOffsets: [
        "0x08",
        "0x0c",
        "0x10",
        "0x14",
      ],
      secondaryController: "same four values are mirrored",
    },
  );
  assert.equal(
    evidence.motionBoundary.policy,
    "do-not-infer-motion-or-audio-from-debug-strings",
  );
  assert.match(evidence.motionBoundary.unresolved, /do not identify Ryo/);
});
