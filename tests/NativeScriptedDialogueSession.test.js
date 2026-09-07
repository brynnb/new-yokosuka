import assert from "node:assert/strict";
import test from "node:test";

import {
  createNativeDialogueSession,
} from "../play/dialogue/NativeDialogueSession.js";

test("scripted session presents exact extracted voice IDs then completes", async () => {
  const source = {
    functionFileOffset: "0x7fa98",
    callFileOffset: "0x7faae",
  };
  const session = createNativeDialogueSession({
    kind: "scripted",
    actorCode: "HATO",
    voiceIds: ["F1030B001"],
    source,
  });

  const started = session.start();
  assert.equal(started.status, "started");
  assert.equal(started.kind, "scripted");
  assert.equal(started.actorCode, "HATO");
  assert.deepEqual(started.voiceIds, ["F1030B001"]);

  const group = await session.next();
  assert.equal(group.status, "messageGroup");
  assert.equal(group.kind, "scripted");
  assert.deepEqual(
    group.messages.map(message => message.voiceId),
    ["F1030B001"],
  );
  assert.equal(group.messages[0].displayText, (
    "Ain't got time for punk kids.\nGet out of here."
  ));
  assert.equal(group.messages[0].nativeParticipantCode, "HATO");
  assert.deepEqual(
    group.presentation.commands.map(command => command.kind),
    ["message"],
  );
  assert.equal(group.source, source);

  const complete = await session.next();
  assert.deepEqual(complete, {
    status: "complete",
    kind: "scripted",
    actorCode: "HATO",
    source,
  });
});

test("scripted session fails closed for invalid voice requests", () => {
  const session = createNativeDialogueSession({
    kind: "scripted",
    actorCode: "HATO",
    voiceIds: ["not-a-native-id"],
  });
  assert.deepEqual(session.start(), {
    status: "unresolved",
    actorCode: "HATO",
    reasons: ["scriptedSession:voiceIds"],
  });
});

test("phone-book monologue uses its exact scene-script subtitle archive", async () => {
  const session = createNativeDialogueSession({
    kind: "scripted",
    actorCode: "AKIR",
    voiceIds: [
      "SA1071A001",
      "SA1071A002",
      "SA1071A003",
      "SA1071A004",
    ],
  });

  assert.equal(session.start().status, "started");
  const group = await session.next();
  assert.equal(group.status, "messageGroup");
  assert.deepEqual(
    group.messages.map(message => message.displayText),
    [
      "It's not listed...",
      "It's not in here.",
      "Guess I can't find it in the phone book.",
      "Ahh, there's no time for this.",
    ],
  );
  assert.deepEqual(
    group.messages.map(message => message.nativeParticipantCode),
    ["AKIR", "AKIR", "AKIR", "AKIR"],
  );
  assert.deepEqual(
    group.messages.map(message => message.nativeDurationSeconds),
    [12160 / 14000, 12160 / 14000, 24448 / 14000, 32640 / 14000],
  );
  assert.equal(group.presentation.nativeDurationSeconds > 5, true);
});
