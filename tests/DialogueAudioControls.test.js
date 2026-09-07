import assert from "node:assert/strict";
import test from "node:test";
import {
  DialogueAudioControls,
} from "../play/ui/DialogueAudioControls.js";

function input() {
  const listeners = new Map();
  return {
    value: "",
    checked: false,
    addEventListener(type, callback) {
      listeners.set(type, callback);
    },
    removeEventListener(type) {
      listeners.delete(type);
    },
    dispatch(type) {
      listeners.get(type)?.();
    },
  };
}

test("dialogue audio controls reflect and update persistent runtime state", () => {
  const dialogueVolume = input();
  const dialogueMuted = input();
  const changes = [];
  let state = { volume: 0.6, muted: true };
  const controls = new DialogueAudioControls({
    dom: { dialogueVolume, dialogueMuted },
    runtime: {
      getState: () => state,
      setVolume: value => changes.push(["volume", value]),
      setMuted: value => changes.push(["muted", value]),
      reset: () => {
        state = { volume: 1, muted: false };
      },
    },
  });

  assert.equal(dialogueVolume.value, "0.6");
  assert.equal(dialogueMuted.checked, true);
  dialogueVolume.value = "0.35";
  dialogueVolume.dispatch("input");
  dialogueMuted.checked = false;
  dialogueMuted.dispatch("change");
  assert.deepEqual(changes, [
    ["volume", "0.35"],
    ["muted", false],
  ]);
  controls.reset();
  assert.equal(dialogueVolume.value, "1");
  assert.equal(dialogueMuted.checked, false);
  controls.dispose();
});
