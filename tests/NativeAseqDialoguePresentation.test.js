import assert from "node:assert/strict";
import test from "node:test";

import {
  createNativeAseqDialoguePresentation,
} from "../play/events/NativeAseqDialoguePresentation.js";

function element() {
  return {
    hidden: false,
    textContent: "",
    attributes: {},
    children: ["stale"],
    setAttribute(name, value) { this.attributes[name] = value; },
    replaceChildren() { this.children = []; },
  };
}

test("AUTH voices use the regular dialogue overlay and clear by command identity", () => {
  const root = element();
  const speaker = element();
  const sourceText = element();
  const japaneseText = element();
  const options = element();
  const runtime = createNativeAseqDialoguePresentation({
    root,
    speaker,
    sourceText,
    japaneseText,
    options,
  });
  const owner = {};
  const first = {
    audio: {
      kind: "voice",
      speakerId: "IWAO",
      displayText: "Stay back, Ryo.",
    },
  };
  const second = {
    audio: {
      kind: "voice",
      speakerId: "AKIR",
      sourceText: "Father＆wait=@",
    },
  };

  assert.equal(runtime.begin(owner), true);
  assert.equal(runtime.play(owner, first), true);
  assert.equal(root.hidden, false);
  assert.equal(root.attributes["aria-hidden"], "false");
  assert.equal(speaker.textContent, "Iwao Hazuki");
  assert.equal(speaker.attributes["data-dialogue-speaker"], "other");
  assert.equal(sourceText.textContent, "Stay back, Ryo.");
  assert.equal(options.hidden, true);
  assert.deepEqual(options.children, []);

  assert.equal(runtime.play(owner, second), true);
  assert.equal(speaker.textContent, "Ryo Hazuki");
  assert.equal(speaker.attributes["data-dialogue-speaker"], "ryo");
  assert.equal(sourceText.textContent, "Father\nwait...");
  assert.equal(runtime.endVoice(owner, first), true);
  assert.equal(root.hidden, false);
  assert.equal(runtime.endVoice(owner, second), true);
  assert.equal(root.hidden, true);
  assert.equal(runtime.end(owner), true);
});

test("AUTH voices resolve activity-only speaker names from their cutscene package", () => {
  const root = element();
  const speaker = element();
  const runtime = createNativeAseqDialoguePresentation({
    root,
    speaker,
    sourceText: element(),
    japaneseText: element(),
    options: element(),
    speakerNameForId: actorCode => (
      actorCode === "SMTH" ? "Smith Bradley" : null
    ),
  });
  const owner = {};

  runtime.begin(owner);
  runtime.play(owner, {
    audio: {
      kind: "voice",
      speakerId: "SMTH",
      displayText: "Hey, you!",
    },
  });

  assert.equal(speaker.textContent, "Smith Bradley");
  assert.equal(speaker.attributes["data-dialogue-speaker"], "other");
});
