import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const evidence = JSON.parse(fs.readFileSync(
  "tools/evidence/d000-hato-invocation-evidence.json",
  "utf8",
));

test("Hato dialogue retains its exact native invocation predicates", () => {
  assert.equal(
    evidence.status,
    "exact-to-native-coroutine-launch",
  );
  assert.equal(
    evidence.generatedTargets.outerDispatcher.targetIndex,
    535,
  );
  assert.equal(evidence.generatedTargets.hatoDialogue.targetIndex, 629);
  assert.deepEqual(
    evidence.generatedTargets.outerDispatcher.invocation,
    {
      operationId: 2,
      callFileOffset: "0x76906",
      targetLiteralFileOffset: "0x76934",
      targetRelativeToScn3: "0x78e44",
      argumentCount: 0,
    },
  );
  assert.deepEqual(
    evidence.directCallChain.map((item) => item.callFileOffset),
    ["0x7a696", "0x7ac72", "0x800d0"],
  );
  assert.deepEqual(
    evidence.predicateAtRoutine0x7abf4.allRequired[0].arguments,
    [11, 100],
  );
  assert.equal(
    evidence.predicateAtRoutine0x7abf4.allRequired[0].requiredResult,
    0,
  );
  assert.deepEqual(
    evidence.predicateAtRoutine0x7abf4.allRequired.slice(1),
    [
      {
        kind: "game-hour-range",
        relativeOffset: "0x000000cc",
        minimumInclusive: 7,
        maximumInclusive: 18,
        semanticMeaning: (
          "SCN3 scene-context hour, populated from the native "
          + "game clock by operation 0x0059"
        ),
      },
      {
        kind: "module-static-value-equality",
        relativeOffset: "0x00000084",
        requiredValue: 6,
        semanticMeaning: (
          "one-based result of native spatial selector "
          + "operation 0x0181; exact zero-based result 5"
        ),
      },
    ],
  );
});
