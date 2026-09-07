import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const evidence = JSON.parse(fs.readFileSync(
  "tools/evidence/d000-time-window-evidence.json",
  "utf8",
));

test("D000 clock-window calls retain exact native game-time boundaries", () => {
  assert.equal(
    evidence.schema,
    "new-yokosuka-d000-time-window-evidence-v2",
  );
  assert.equal(evidence.nativePredicate.fileOffset, "0x7ed70");
  assert.equal(evidence.nativePredicate.dayBoundaryHour, 6);
  assert.equal(evidence.summary.callCount, 19);
  assert.ok(evidence.summary.exactLiteralWindowCount >= 14);
  assert.equal(
    evidence.summary.callCount,
    evidence.summary.exactLiteralWindowCount
      + evidence.summary.dynamicOrNoncanonicalCount,
  );

  const tko = evidence.calls.find(
    (call) => call.callFileOffset === "0x690fc",
  );
  assert.deepEqual(tko.window.start, { hour: 7, minute: 0 });
  assert.deepEqual(tko.window.end, { hour: 19, minute: 0 });
  assert.equal(tko.window.normalizedStartMinute, 7 * 60);
  assert.equal(tko.window.normalizedEndMinute, 19 * 60);
  assert.equal(tko.window.dayBoundaryHour, 6);
  assert.equal(
    tko.resultBranch.classification,
    "exactCanonicalBooleanBranch",
  );
  assert.equal(tko.branchOwnedDirectCalls.trueOnly.length, 0);
  assert.equal(tko.branchOwnedDirectCalls.falseOnly.length, 0);
  assert.equal(tko.branchOwnedDirectCalls.shared.length, 10);
  assert.deepEqual(tko.branchOwnedLocalByteWrites, {
    trueOnly: [{
      writeFileOffset: "0x6911e",
      frameOffset: 2,
      valueSigned: 0,
      valueHex: "0x00",
      valueLoadFileOffset: "0x6911c",
      addressProofFileOffsets: ["0x69118", "0x6911a"],
    }],
    falseOnly: [{
      writeFileOffset: "0x69136",
      frameOffset: 2,
      valueSigned: -1,
      valueHex: "0xff",
      valueLoadFileOffset: "0x69134",
      addressProofFileOffsets: ["0x69130", "0x69132"],
    }],
  });
  assert.ok(tko.directObjectAndPersistentStateCalls.some(
    (call) => call.operation === "0x001f"
      && call.arguments[0] === "TKOK",
  ));
  const overnight = evidence.calls.find(
    (call) => call.callFileOffset === "0x6dadc",
  );
  assert.equal(overnight.window.normalizedStartMinute, 22 * 60);
  assert.equal(overnight.window.normalizedEndMinute, (24 + 5) * 60 + 25);
  assert.equal(evidence.summary.exactCanonicalBooleanBranchCount, 17);
  assert.equal(evidence.summary.runtimeCombinedPredicateCount, 2);
  assert.equal(evidence.summary.branchOwnedLocalByteWriteCount, 8);
  assert.match(evidence.evidenceBoundary, /direct-call reachability/);
});
