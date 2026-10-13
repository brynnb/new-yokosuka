import assert from "node:assert/strict";
import test from "node:test";
import { createScriptEventController } from "../play/scripts/ScriptEventController.js";

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
    addEventListener(){},removeEventListener(){},
    createElement: () => ({
      dataset:{},
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

test("challenge prompts own their tokens, touch buttons and timeout lifetime", async () => {
  const calls=[];
  const presenter=createScriptEventDialoguePresenter({root:element(),speaker:element(),sourceText:element(),japaneseText:element(),options:optionsElement(),
    onChallengeResponse:(...args)=>calls.push(args)});
  const token="a".repeat(32);
  presenter.showChallenge({id:"test",label:"Defend yourself",token,index:0,count:2,ready:false});
  await Promise.resolve();assert.deepEqual(calls,[["challenge_ready",token]]);
  presenter.showChallenge({id:"test",label:"Defend yourself",token,index:0,count:2,ready:true,button:"B",deadlineMs:2000,serverTimeMs:0});
  const stale=presenter.dom.options.children[0].listeners.click;
  presenter.dom.options.children[1].listeners.click();assert.deepEqual(calls.at(-1),["challenge_input",token,"B"]);
  presenter.hide();stale();assert.equal(calls.length,2);
  assert.equal(presenter.challengeTimer,null);
});

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

for (const delayedStage of ["lookup", "play"]) {
  test(`Space finishes a server conversation without waiting for voice ${delayedStage}`, { timeout: 1000 }, async () => {
    const root = element();
    const locks = [];
    const audioCallbacks = [];
    let settleVoice;
    let created = 0;
    let nextRequest = 0;
    let requestId;
    let controller;
    const pendingVoice = new Promise(resolve => { settleVoice = resolve; });
    const presenter = createScriptEventDialoguePresenter({
      root, speaker: element(), sourceText: element(), japaneseText: element(), options: optionsElement(),
      voiceManifest: { urlFor: () => delayedStage === "lookup" ? pendingVoice : Promise.resolve("/voice.m4a") },
      audioFactory: () => {
        created++;
        return {
          addEventListener: (_type, listener) => audioCallbacks.push(listener),
          play: () => delayedStage === "play" ? pendingVoice : Promise.resolve(),
          pause() {}, removeAttribute() {}, load() {},
        };
      },
      onAdvance: () => controller.advanceLine(),
    });
    controller = createScriptEventController({
      client: {
        startScriptEvent: (_selector, id) => { requestId = id; return true; },
        advanceScriptEvent: (_run, action, options) => {
          assert.equal(action, "continue");
          requestId = options.requestId;
          return true;
        },
      },
      presentation: {
        begin: () => locks.push(true), execute() {},
        commit: () => locks.push(false), rollback() { assert.fail("must finish, not cancel"); },
      },
      dialogue: presenter,
      createRequestId: () => `request-${++nextRequest}`,
    });
    const started = controller.start({ kind: "talk", actor: "FUKU" });
    await controller.handleYield({ requestId, runId: 1, event: { type: "line" },
      line: { text: "Fuku-san: Ryo-san!", metadata: ["speaker:FUKU", "voice:FUKU_TEST"] } });
    await started;
    assert.equal(presenter.active, true);
    assert.equal(controller.advanceLine(), true);
    await controller.handleYield({ requestId, runId: 1, event: { type: "complete" } });
    assert.equal(controller.status, "idle");
    assert.equal(presenter.active, false);
    assert.equal(root.hidden, true);
    assert.deepEqual(locks, [true, false]);
    settleVoice("/late-voice.m4a");
    await new Promise(resolve => setImmediate(resolve));
    for (const callback of audioCallbacks) callback();
    assert.equal(created, delayedStage === "play" ? 1 : 0);
    assert.equal(controller.status, "idle");
    assert.equal(presenter.audio, null);
    assert.equal(nextRequest, 2, "late voice must not advance another line");
  });
}

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
