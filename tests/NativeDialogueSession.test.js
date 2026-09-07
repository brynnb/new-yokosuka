import assert from "node:assert/strict";
import test from "node:test";
import {
  createNativeDialogueSession,
} from "../play/dialogue/NativeDialogueSession.js";
import {
  nativeDialogueSelectorResource,
} from "../play/dialogue/NativeDialogueSelector.js";
import {
  createNativeDialogueSnapshot,
} from "../play/dialogue/NativeDialogueSnapshot.js";

test("native dialogue session composes selection, progress, and messages", async () => {
  const session = createNativeDialogueSession({
    actorCode: "BOB_",
    context: {
      readStateBank() {
        return 0;
      },
    },
    randomFloat: () => 0,
  });
  const started = session.start();
  assert.equal(started.status, "started");
  assert.equal(started.progressIndex, 154);
  const source = nativeDialogueSelectorResource("BOB_");
  assert.equal(
    session.progressState.record(154).selectedEntryOffset,
    started.selection.bodyOffset - source.resource.recordRoutingOffset,
  );

  let result;
  do {
    result = await session.next();
  } while (result.status === "event");
  assert.equal(result.status, "messageGroup");
  assert.deepEqual(result.messageIndexes, [0, 2, 5]);
  assert.deepEqual(
    result.messages.map(message => message.voiceId),
    ["XD003A001", "XD003B001", "XD003B004"],
  );
  assert.deepEqual(
    result.messages.map(message => message.nativeParticipantCode),
    ["AKIR", "BOB_", "BOB_"],
  );
  assert.equal(result.presentation.messageCount, 3);
  assert.deepEqual(
    result.presentation.commands
      .filter(command => command.kind === "message")
      .map(command => command.message.voiceId),
    ["XD003A001", "XD003B001", "XD003B004"],
  );
});

test("native dialogue session preserves explicit external event yields", async () => {
  const session = createNativeDialogueSession({
    actorCode: "HATO",
    context: {
      readStateBank() {
        return 0;
      },
    },
    randomFloat: () => 0,
  });
  assert.equal(session.start().status, "started");
  const first = await session.next();
  assert.ok(["event", "messageGroup"].includes(first.status));
  if (first.status === "event") {
    assert.ok(first.event.kind);
  } else {
    assert.ok(first.messages.length > 0);
  }
});

test("the post-opening free-roam state gives Fuku-san his native exchange", async () => {
  const session = createNativeDialogueSession({
    actorCode: "FUKU",
    context: {
      gameDate: new Date("1986-12-04T10:00:00Z"),
      currentMapIdentity: "JHD0",
      playerPosition: [-6.8, 0, -24.7],
      readActorRuntimeValue: () => 0,
    },
    ...createNativeDialogueSnapshot().sessionOptions(),
    randomFloat: () => 0,
  });
  assert.equal(session.start().status, "started");

  let result;
  do {
    result = await session.next();
  } while (result.status === "event");

  assert.equal(result.status, "messageGroup");
  assert.deepEqual(
    result.messages.map((message) => message.voiceId),
    [
      "F1004A007",
      "F1004B006",
      "F1004A008",
      "F1004B007",
      "F1004A009",
      "F1004B008",
    ],
  );
});
