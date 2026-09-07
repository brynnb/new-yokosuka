import assert from "node:assert/strict";
import test from "node:test";
import {
  createNativeDialogueBodyState,
  loadNativeDialogueMessages,
  loadNativeDialogueMessagesByVoiceId,
  stepNativeDialogueBody,
} from "../play/dialogue/NativeDialogueBody.js";
import {
  nativeDialogueSelectorResource,
  selectNativeDialogueEntry,
} from "../play/dialogue/NativeDialogueSelector.js";
import {
  createNativeDialogueProgressState,
} from "../play/dialogue/NativeDialogueProgressState.js";
import {
  NATIVE_DIALOGUE_SELECTORS,
} from "../play/data/dialogue/nativeActorSelectors.generated.js";

function bobSelection() {
  return selectNativeDialogueEntry("BOB_", {
    readStateBank() {
      return 0;
    },
  });
}

test("native body execution returns BOB's exact first message group", () => {
  const selection = bobSelection();
  assert.equal(selection.status, "selected");
  const context = {
    readStateBank() {
      return 0;
    },
    chooseNativeDialogueRandomBlock() {
      return 0;
    },
  };
  let state = createNativeDialogueBodyState(selection);
  let result;
  do {
    result = stepNativeDialogueBody(state, context);
    state = result.state;
  } while (result.status === "event");
  assert.equal(result.status, "messageGroup");
  assert.deepEqual(result.messageIndexes, [0, 2, 5]);
  assert.equal(result.startOffset, 0x9d);
});

test("native message indexes resolve to exact authored records lazily", async () => {
  const resource = await loadNativeDialogueMessages("BOB_", [0, 2]);
  assert.equal(resource.messages[0].voiceId, "XD003A001");
  assert.equal(resource.messages[0].displayText, "Um...");
  assert.equal(resource.messages[1].speakerId, "XXXX");
});

test("script voice IDs resolve to exact authored records in requested order", async () => {
  const resource = await loadNativeDialogueMessagesByVoiceId(
    "HATO",
    ["F1030B003", "F1030B001"],
  );
  assert.deepEqual(
    resource.messages.map(message => message.voiceId),
    ["F1030B003", "F1030B001"],
  );
  await assert.rejects(
    loadNativeDialogueMessagesByVoiceId("HATO", ["F1030B999"]),
    /HATO voice F1030B999 is unavailable/,
  );
});

test("native body class 0x60 writes its exact persistent story flag", () => {
  const writes = [];
  const source = nativeDialogueSelectorResource("AOKI");
  const result = stepNativeDialogueBody({
    actorCode: "AOKI",
    cursor: 0x7be - source.resource.recordRoutingOffset,
    continuation60: null,
    continuation64: null,
    lastExpression: null,
  }, {
    writeStateBank(bank, index, value) {
      writes.push([bank, index, value]);
      return true;
    },
  });
  assert.deepEqual(writes, [[2, 715, 1]]);
  assert.notEqual(result.status, "unresolved");
});

test("native body class C0 writes exact manager and person fields", () => {
  const writes = [];
  const context = {
    writeNativeDialogueRuntimeField(write) {
      writes.push(write);
    },
  };
  const aoki = nativeDialogueSelectorResource("AOKI");
  const personResult = stepNativeDialogueBody({
    actorCode: "AOKI",
    cursor: 0x748 - aoki.resource.recordRoutingOffset,
    continuation60: null,
    continuation64: null,
    lastExpression: null,
  }, context);
  assert.equal(personResult.state.runtimeFields.person[0x10], 11);
  assert.deepEqual(writes[0], {
    scope: "person",
    offset: 0x10,
    value: 11,
    rawValue: 11,
  });

  const echo = nativeDialogueSelectorResource("ECHO");
  const managerResult = stepNativeDialogueBody({
    actorCode: "ECHO",
    cursor: 0x2bc - echo.resource.recordRoutingOffset,
    continuation60: null,
    continuation64: null,
    lastExpression: null,
  }, context);
  assert.equal(managerResult.state.runtimeFields.manager[0x11], 66);
  assert.deepEqual(writes[1], {
    scope: "manager",
    offset: 0x11,
    value: 66,
    rawValue: 66,
  });
});

test("native body progress writes and redirects use the exact record layout", () => {
  const progress = createNativeDialogueProgressState();
  const akmi = nativeDialogueSelectorResource("AKMI");
  const akmiProgressContext = progress.bodyContext(
    0,
    akmi.resource.recordRoutingOffset,
  );
  const progressWrites = [];
  stepNativeDialogueBody({
    actorCode: "AKMI",
    cursor: 0x1067 - akmi.resource.recordRoutingOffset,
    continuation60: null,
    continuation64: 99,
    lastExpression: null,
  }, {
    ...akmiProgressContext,
    recordNativeDialogueProgressOffset(input) {
      progressWrites.push(input.followingOffset);
      return akmiProgressContext.recordNativeDialogueProgressOffset(input);
    },
  });
  assert.equal(progressWrites[0], 0x1069);

  const hrsk = nativeDialogueSelectorResource("HRSK");
  progress.writeOffset(
    1,
    "selected",
    0x311 - hrsk.resource.recordRoutingOffset,
  );
  progress.writeOffset(
    1,
    "continuation",
    0x400 - hrsk.resource.recordRoutingOffset,
  );
  const result = stepNativeDialogueBody({
    actorCode: "HRSK",
    cursor: 0x30f - hrsk.resource.recordRoutingOffset,
    continuation60: null,
    continuation64: null,
    lastExpression: null,
  }, progress.bodyContext(1, hrsk.resource.recordRoutingOffset));
  assert.equal(result.status, "event");
  assert.equal(result.event.kind, "state5");
  assert.equal(result.event.reason, "progressRedirect");
  assert.equal(
    result.state.cursor + hrsk.resource.recordRoutingOffset,
    0x400,
  );
});

test("native body skips non-yielding E-class payloads before the next event", () => {
  const bytes = Uint8Array.from([
    0xe3, 0,
    0xe5, 2, 0xaa, 0xbb,
    0xe4, 2, 0, 0,
  ]);
  NATIVE_DIALOGUE_SELECTORS.resources.TST_ = {
    actorCode: "TST_",
    recordRoutingOffset: 0,
    base64: Buffer.from(bytes).toString("base64"),
  };
  try {
    const result = stepNativeDialogueBody({
      actorCode: "TST_",
      cursor: 0,
      continuation60: null,
      continuation64: null,
      lastExpression: null,
    });
    assert.equal(result.status, "event");
    assert.equal(result.event.opcode, 0xe4);
    assert.equal(result.event.byteLength, 4);
    assert.equal(result.state.cursor, 10);
  } finally {
    delete NATIVE_DIALOGUE_SELECTORS.resources.TST_;
  }
});

test("native body exposes E1's exact signed native arguments", () => {
  const source = nativeDialogueSelectorResource("MEGM");
  const result = stepNativeDialogueBody({
    actorCode: "MEGM",
    cursor: 0x2ef - source.resource.recordRoutingOffset,
    continuation60: null,
    continuation64: null,
    lastExpression: null,
  });
  assert.equal(result.status, "event");
  assert.equal(result.event.opcode, 0xe1);
  assert.equal(result.event.payloadByte, 0x50);
  assert.deepEqual(result.event.nativeArguments, [0x17, 0x23, 0x19, 0x1a]);
});
