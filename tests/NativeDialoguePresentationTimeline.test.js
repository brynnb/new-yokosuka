import assert from "node:assert/strict";
import test from "node:test";
import {
  createNativeDialoguePresentationTimeline,
} from "../play/dialogue/NativeDialoguePresentationTimeline.js";

function sampleProgram() {
  return {
    commands: [
      {
        kind: "nativeCommand",
        commandWord: 0x14,
        nativeTimeSeconds: 0,
      },
      {
        kind: "message",
        messageIndex: 1,
        nativeTimeSeconds: 1 / 30,
        message: { voiceId: "FIRST" },
      },
      {
        kind: "nativeCommand",
        commandWord: 0xfc00,
        nativeTimeSeconds: 1.5 + 1 / 30,
      },
      {
        kind: "message",
        messageIndex: 2,
        nativeTimeSeconds: 1.5 + 1 / 30,
        message: { voiceId: "SECOND" },
      },
    ],
    nativeDurationSeconds: 3.5 + 1 / 30,
  };
}

test("presentation timeline follows native cumulative timestamps", () => {
  const events = [];
  const timeline = createNativeDialoguePresentationTimeline(sampleProgram(), {
    onNativeCommand: command => events.push(["command", command.commandWord]),
    onMessageStart: message => events.push(["start", message.voiceId]),
    onMessageEnd: (message, detail) => events.push([
      "end",
      message.voiceId,
      detail.reason,
      detail.releaseVoiceIfActive,
      detail.clearTextPresentation,
    ]),
    onComplete: () => events.push(["complete"]),
  });

  timeline.start(0);
  assert.deepEqual(events, [["command", 0x14]]);
  timeline.update(1 / 30);
  assert.deepEqual(events.at(-1), ["start", "FIRST"]);
  timeline.update(1.5 + 1 / 30);
  assert.deepEqual(events.slice(-3), [
    ["end", "FIRST", "nativeDeadline", true, true],
    ["command", 0xfc00],
    ["start", "SECOND"],
  ]);
  timeline.update(3.5 + 1 / 30);
  assert.deepEqual(events.slice(-2), [
    ["end", "SECOND", "nativeDeadline", true, true],
    ["complete"],
  ]);
});

test("presentation timeline catches up atomically after a delayed frame", () => {
  const events = [];
  const timeline = createNativeDialoguePresentationTimeline(sampleProgram(), {
    onMessageStart: message => events.push(`start:${message.voiceId}`),
    onMessageEnd: message => events.push(`end:${message.voiceId}`),
    onNativeCommand: command => events.push(`command:${command.commandWord}`),
    onComplete: () => events.push("complete"),
  });
  timeline.start(10);
  assert.deepEqual(events, [
    "command:20",
    "start:FIRST",
    "end:FIRST",
    "command:64512",
    "start:SECOND",
    "end:SECOND",
    "complete",
  ]);
});

test("presentation timeline rejects time reversal", () => {
  const timeline = createNativeDialoguePresentationTimeline(sampleProgram());
  timeline.start(1);
  assert.throws(() => timeline.update(0.5), /cannot go backwards/);
});

test("presentation timeline advances to the next authored line", () => {
  const events = [];
  const timeline = createNativeDialoguePresentationTimeline(sampleProgram(), {
    onMessageStart: message => events.push(`start:${message.voiceId}`),
    onMessageEnd: message => events.push(`end:${message.voiceId}`),
    onNativeCommand: command => events.push(`command:${command.commandWord}`),
    onComplete: () => events.push("complete"),
  });

  timeline.start(1 / 30);
  assert.deepEqual(events, ["command:20", "start:FIRST"]);
  assert.equal(timeline.advance(), true);
  assert.deepEqual(events.slice(-3), [
    "end:FIRST",
    "command:64512",
    "start:SECOND",
  ]);
  assert.equal(timeline.advance(), true);
  assert.deepEqual(events.slice(-2), ["end:SECOND", "complete"]);
});
