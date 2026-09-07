import assert from "node:assert/strict";
import test from "node:test";

import {
  createScriptEventDialoguePresenter,
  expandYarnSubstitutions,
  scriptEventLinePresentation,
} from "../play/scripts/ScriptEventDialoguePresenter.js";

function element() {
  return {
    hidden: false,
    textContent: "",
    attributes: new Map(),
    setAttribute(name, value) { this.attributes.set(name, value); },
  };
}

function optionsElement() {
  const children = [];
  const document = {
    createElement: () => ({
      listeners: {},
      addEventListener(type, listener) { this.listeners[type] = listener; },
      focus() { this.focused = true; },
    }),
  };
  return {
    hidden: false,
    ownerDocument: document,
    children,
    append(child) { children.push(child); },
    replaceChildren() { children.length = 0; },
    querySelector() { return children.find(child => !child.disabled) || null; },
  };
}

test("line presentation requires an explicit known speaker and permits optional voice", () => {
  assert.deepEqual(scriptEventLinePresentation({
    text: "Hato: Ain't got time.[br/]Get out.",
    metadata: ["voice:F1030B001", "speaker:HATO"],
  }), {
    speakerCode: "HATO",
    speakerLabel: "Yoshifumi Hato",
    speakerStyle: "other",
    voiceId: "F1030B001",
    text: "Ain't got time.\nGet out.",
  });
  assert.throws(() => scriptEventLinePresentation({
    text: "Someone: Hello", metadata: ["voice:X", "speaker:UNKNOWN"],
  }), /unknown speaker/);
  assert.equal(scriptEventLinePresentation({
    text: "Ryo: A community-authored line.", metadata: ["speaker:AKIR"],
  }).voiceId, null);
  assert.throws(() => scriptEventLinePresentation({
    text: "Ryo: Hello", metadata: [],
  }), /no authored speaker ID/);
});

test("dialogue presenter advances only the currently owned voice", async () => {
  const root = element();
  const speaker = element();
  const sourceText = element();
  const japaneseText = element();
  const options = optionsElement();
  const listeners = [];
  let advances = 0;
  const presenter = createScriptEventDialoguePresenter({
    root, speaker, sourceText, japaneseText, options,
    voiceManifest: { urlFor: async id => `/voice/${id}.m4a` },
    audioFactory: () => ({
      addEventListener: (_type, listener) => listeners.push(listener),
      play: async () => {}, pause() {}, removeAttribute() {}, load() {},
    }),
    onAdvance: () => { advances += 1; },
  });
  await presenter.show({
    text: "Ryo: Hello?",
    metadata: ["voice:SA1093A001", "speaker:AKIR"],
  });
  assert.equal(root.hidden, false);
  assert.equal(speaker.textContent, "Ryo Hazuki");
  assert.equal(sourceText.textContent, "Hello?");
  listeners[0]();
  assert.equal(advances, 1);
  presenter.hide();
  listeners[0]();
  assert.equal(advances, 1);
});

test("unvoiced authored dialogue stays open for manual advance", async () => {
  const root = element();
  let audioCreated = false;
  const presenter = createScriptEventDialoguePresenter({
    root,
    speaker: element(),
    sourceText: element(),
    japaneseText: element(),
    options: optionsElement(),
    audioFactory: () => { audioCreated = true; },
  });
  await presenter.show({
    text: "Ryo: We can add voice later.",
    metadata: ["speaker:AKIR"],
  });
  assert.equal(root.hidden, false);
  assert.equal(audioCreated, false);
});

test("presenter renders exact runtime options and selects an available option", () => {
  const options = optionsElement();
  const selections = [];
  const presenter = createScriptEventDialoguePresenter({
    root: element(), speaker: element(), sourceText: element(),
    japaneseText: element(), options,
    onSelect: optionId => selections.push(optionId),
  });
  presenter.showOptions([
    { id: 3, isAvailable: true, substitutions: ["Harbor"], line: { text: "Ask about {0}" } },
    { id: 4, isAvailable: false, line: { text: "Leave" } },
  ]);
  assert.equal(options.hidden, false);
  assert.equal(options.children[0].textContent, "Ask about Harbor");
  assert.equal(options.children[0].focused, true);
  assert.equal(options.children[1].disabled, true);
  options.children[0].listeners.click();
  assert.deepEqual(selections, [3]);
});

test("Yarn substitutions leave out-of-range markers intact", () => {
  assert.equal(expandYarnSubstitutions("Hello {0} {2}", ["Ryo"]), "Hello Ryo {2}");
});
