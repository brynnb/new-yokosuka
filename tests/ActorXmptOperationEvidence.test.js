import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const evidence = JSON.parse(fs.readFileSync(
  new URL(
    "../tools/evidence/actor-xmpt-operation-evidence.json",
    import.meta.url,
  ),
  "utf8",
));
const semantics = JSON.parse(fs.readFileSync(
  new URL("../tools/evidence/native-operation-semantics.json", import.meta.url),
  "utf8",
));

test("XMPT evidence pins exact request, status, and Hato cleanup dataflow", () => {
  assert.equal(evidence.requestOperation.operationHex, "0x0165");
  assert.equal(evidence.requestOperation.recordTag, "XMPT");
  assert.deepEqual(evidence.requestOperation.fixedRequestCoreArguments, {
    selector: 0,
    selectorSource: "handler-pushed literal zero",
  });
  assert.match(
    evidence.requestOperation.arguments[4].meaning,
    /24 supplemental bytes/,
  );
  assert.equal(evidence.stateZeroQueryOperation.operationHex, "0x016e");
  assert.deepEqual(evidence.hatoConversation.targetVector, [
    -121.16000366210938,
    -1.7999999523162842,
    77.94000244140625,
  ]);
  assert.equal(evidence.hatoConversation.requestWord, 42143);
  assert.equal(evidence.hatoConversation.requestDword, "0x8000055e");
  assert.equal(evidence.hatoConversation.requestSelector, 0);
  assert.equal(evidence.hatoConversation.supplementalRecordPointer, 0);
  assert.equal(evidence.hatoConversation.firstControllerState, 3);
  assert.equal(evidence.hatoConversation.waitsWhileQueryReturnsOne, true);
  assert.equal(evidence.hatoConversation.exitsWhenQueryReturnsZero, true);
  assert.equal(
    Object.hasOwn(evidence.hatoConversation, "loopsWhileQueryIsZero"),
    false,
  );
  assert.equal(evidence.controllerUpdate.address, "0x0c0fd1fc");
  assert.deepEqual(evidence.controllerUpdate.initialStateBySelector, {
    0: 3,
    1: 1,
    2: 6,
    3: 1,
    4: 1,
    5: 3,
    6: 6,
  });
  assert.deepEqual(evidence.controllerUpdate.lookPointCoupling, {
    installHelperAddress: "0x0c0fdd24",
    installHelperSha256:
      "ef8fa2f349627b3b44900f4a9246012aa4884a4c2e84408c3187e18d4e547595",
    releaseHelperAddress: "0x0c0fde7e",
    releaseHelperSha256:
      "6cb7a2a16cb424d1b921e69417873300d1c819e6d7ae22fddba783d08f25fa9f",
    recordTag: "LKPT",
    installSelector: 15,
    installSelectorMappedWord: "0x8066",
    releaseSelectorSigned: -15,
    releaseSelectorMappedWord: "0x8066",
    mode: 0,
    admittedXmptSelectors: [1, 3, 4, 6],
  });
  assert.deepEqual(evidence.controllerUpdate.selectorZeroLifecycle, {
    initialState: 3,
    approachState: 3,
    approachWaitState: 4,
    facingConvergenceState: 5,
    finalAlignmentState: 7,
    finalAlignmentWaitState: 8,
    cleanupState: 11,
    terminalState: 0,
    motionRequestSource: "low 16 bits of XMPT +0x20 request dword",
    controllerRequestWordOffset: "actor +0x66",
    nearTargetBoundary: 0.7,
    shortRouteBoundary: 0.05,
    shortRouteOffset: -0.1,
    farRouteOffset: -0.2,
    maximumFacingStepRaw: 2730,
    convergenceDistance: 0.3,
    provenSelectorZeroBehavior:
      "State three prepares the approach endpoint, writes it through the "
      + "actor transform setter, and starts the approach motion. The far "
      + "path used by Hato and D000 selector 61 constructs an endpoint 0.2 "
      + "native units before the supplied target. State four waits for actor "
      + "+0x66 to clear and reads the actor transform back into the XMPT "
      + "record. State five performs bounded facing "
      + "and exact 0.3-unit convergence work. State seven starts the final "
      + "motion against the original target and the request word at XMPT "
      + "+0x88; state eight again waits for actor +0x66 to clear. State "
      + "eleven then falls through native cleanup to terminal state zero.",
  });

  const byOperation = new Map(
    semantics.operations.map(operation => [
      operation.operationHex,
      operation.semanticId,
    ]),
  );
  assert.equal(byOperation.get("0x0165"), "actor-xmpt-request");
  assert.equal(byOperation.get("0x016e"), "actor-xmpt-state-zero-query");
});
