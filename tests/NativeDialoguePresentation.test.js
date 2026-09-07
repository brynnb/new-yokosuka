import assert from "node:assert/strict";
import test from "node:test";
import {
  buildNativeDialoguePresentationProgram,
  nativeDialogueCommandReceiver,
  nativeDialogueParticipantFacingTarget,
  nativeDialogueParticipantTableRoute,
  nativeDialogueMessageDuration,
  nativeDialogueMessageParticipant,
  nativeDialoguePresentationMessage,
} from "../play/dialogue/NativeDialoguePresentation.js";

test("native command receiver preserves exact engine dispatch families", () => {
  assert.deepEqual(nativeDialogueCommandReceiver(0x10), {
    path: "inline10",
    queueAddress: null,
    handlers: [],
  });
  assert.deepEqual(nativeDialogueCommandReceiver(0xfc00), {
    path: "inlineFc",
    queueAddress: null,
    handlers: [],
  });
  assert.deepEqual(nativeDialogueCommandReceiver(0x14), {
    path: "queued",
    queueAddress: "0x0c222580",
    enqueueAddress: "0x0c153810",
    dequeueAddress: "0x0c1538a2",
    receiverAddress: "0x0c160efe",
    stateCode: 0x6c,
    participantFacingTargetIndex: 0,
    participantTableIndex: null,
    handlers: ["0x0c16188c"],
  });
  assert.deepEqual(nativeDialogueCommandReceiver(0x8f).handlers, [
    "table:0x0c2243a0",
  ]);
  assert.deepEqual(nativeDialogueCommandReceiver(0x0a).handlers, [
    "0x0c161f22",
  ]);
  assert.deepEqual(
    nativeDialogueParticipantFacingTarget(0x16, {
      participantFacingTargets: [
        [6, 1.5, 86],
        [-57, 1.5, 83],
        [-19.2, 1.5, 76.4],
      ],
    }),
    {
      index: 2,
      scenePosition: [-19.2, 1.5, 76.4],
      controllerType: "FACE",
      appliesControlStateTransition: true,
      handlerAddress: "0x0c16188c",
    },
  );
  assert.equal(
    nativeDialogueParticipantFacingTarget(0x17, {
      participantFacingTargets: [[1, 2, 3]],
    }),
    null,
  );
  assert.deepEqual(
    nativeDialogueParticipantFacingTarget(0x78, {
      participantFacingTargets: [[1, 2, 3]],
    }),
    {
      index: 0,
      scenePosition: [1, 2, 3],
      controllerType: "FACE",
      appliesControlStateTransition: false,
      handlerAddress: "0x0c16188c",
    },
  );
});

test("native participant command ranges preserve their exact table ordinal", () => {
  const participants = ["AKIR", "INE_"];
  assert.deepEqual(
    nativeDialogueParticipantTableRoute(0x32, participants),
    {
      index: 1,
      participantCode: "INE_",
      behavior: "participantControlDispatch",
      handlerAddress: "0x0c16175c",
      selectedParticipantAddress: null,
      motionPoint: {
        nativeOffset: [-0.001, 0, 0],
        nativeAxis: [0, 1, 0],
        requestAddress: "0x0c0fef0e",
      },
    },
  );
  assert.deepEqual(
    nativeDialogueParticipantTableRoute(0x8c, participants),
    {
      index: 1,
      participantCode: "INE_",
      behavior: "selectedParticipantWrite",
      handlerAddress: null,
      selectedParticipantAddress: "0x0c2243a0",
      motionPoint: null,
    },
  );
  assert.deepEqual(
    nativeDialogueParticipantTableRoute(0x33, participants),
    {
      index: 2,
      participantCode: null,
      behavior: "participantControlDispatch",
      handlerAddress: "0x0c16175c",
      selectedParticipantAddress: null,
      motionPoint: {
        nativeOffset: [-0.001, 0, 0],
        nativeAxis: [0, 1, 0],
        requestAddress: "0x0c0fef0e",
      },
    },
  );
  assert.equal(nativeDialogueParticipantTableRoute(0x28, participants), null);
});

test("native local line code selects the authored participant table", () => {
  const participants = ["AKIR", "BOB_"];
  assert.equal(
    nativeDialogueMessageParticipant({ localCode: "A001" }, participants),
    "AKIR",
  );
  assert.equal(
    nativeDialogueMessageParticipant({ localCode: "B004" }, participants),
    "BOB_",
  );
  assert.equal(
    nativeDialogueMessageParticipant({ localCode: "C001" }, participants),
    null,
  );
});

test("native nonzero message float receives the exact half-second pad", () => {
  assert.equal(
    nativeDialogueMessageDuration({ nativeFloat: 1.725000023841858 }),
    2.225000023841858,
  );
  assert.equal(
    nativeDialogueMessageDuration({
      nativeFloat: 0,
      sourceByteLength: 12,
    }),
    2,
  );
  assert.equal(
    nativeDialogueMessageDuration({
      nativeFloat: 0,
      sourceByteLength: 18,
    }),
    2,
  );
  assert.equal(
    nativeDialogueMessageDuration({
      nativeFloat: 0,
      sourceByteLength: 24,
    }),
    2.4,
  );
  assert.equal(
    nativeDialogueMessageDuration({
      nativeFloat: 0,
      sourceByteLength: 36,
    }),
    3,
  );
  assert.equal(nativeDialogueMessageDuration({ nativeFloat: 0 }), null);
});

test("presentation message keeps subtitle labels separate from actor routing", () => {
  const message = nativeDialoguePresentationMessage({
    localCode: "B001",
    speakerId: "XXXX",
    nativeFloat: 1,
  }, ["AKIR", "BOB_"]);
  assert.equal(message.speakerId, "XXXX");
  assert.equal(message.nativeParticipantCode, "BOB_");
  assert.equal(message.nativeDurationSeconds, 1.5);
});

test("presentation program preserves native command ordering and timing", () => {
  const messages = [
    { voiceId: "FIRST", nativeDurationSeconds: 1.5 },
    { voiceId: "SECOND", nativeDurationSeconds: 2 },
  ];
  const result = buildNativeDialoguePresentationProgram([
    {
      kind: "nativeCommand",
      commandWord: 0x14,
      nativeTickAdvance: 1,
      recordOffset: 10,
    },
    {
      kind: "message",
      messageIndex: 3,
      nativeFlags: 2,
      recordOffset: 12,
    },
    {
      kind: "nativeCommand",
      commandWord: 0xfc00,
      nativeTickAdvance: 0,
      recordOffset: 14,
    },
    {
      kind: "message",
      messageIndex: 4,
      nativeFlags: 0,
      recordOffset: 15,
    },
  ], messages);
  assert.equal(result.commands[0].nativeTimeSeconds, 0);
  assert.equal(
    result.commands[0].nativeReceiver.receiverAddress,
    "0x0c160efe",
  );
  assert.equal(result.commands[1].nativeTimeSeconds, 1 / 30);
  assert.equal(result.commands[1].message.voiceId, "FIRST");
  assert.equal(result.commands[2].nativeTimeSeconds, 1 / 30 + 1.5);
  assert.equal(result.commands[3].nativeTimeSeconds, 1 / 30 + 1.5);
  assert.equal(result.nativeDurationSeconds, 1 / 30 + 3.5);
  assert.equal(result.messageCount, 2);
});
