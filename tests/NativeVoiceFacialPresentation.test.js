import assert from "node:assert/strict";
import test from "node:test";
import { NativeVoiceFacialPresentation } from "../play/dialogue/NativeVoiceFacialPresentation.js";

const message = { speakerCode: "YAMA", lipSync: "srf1:BRIAAAQA" };
function setup() {
  let actor = { model: { modelCode: "YMA_L" } };
  const calls = [], faces = [];
  let prepare = async () => {};
  const presentation = new NativeVoiceFacialPresentation({
    scene: {}, catalog: {}, getActor: () => actor, loadAsset() {},
    createPresentation: options => {
      const face = {
        prepare: () => prepare(),
        begin: owner => calls.push(["begin", owner]),
        apply: (owner, state) => { calls.push(["apply", owner, state]); return true; },
        end: owner => calls.push(["end", owner]),
        reset: () => calls.push(["reset"]),
        clear: () => calls.push(["clear"]),
      };
      faces.push({ face, options });
      return face;
    },
  });
  return { presentation, calls, faces, actor,
    setActor: value => { actor = value; }, setPrepare: value => { prepare = value; } };
}

test("Story faces follow voice time, stop on body replacement, and reuse prepared assets", async () => {
  const { presentation, calls, faces, setActor } = setup();
  const audio = { currentTime: 0 };
  assert.equal(await presentation.start(message, audio), true);
  assert.deepEqual(faces[0].options.definitions, {}, "generic mouths need no guessed detailed FACE");
  const owner = presentation.active, cue = owner.cue;
  audio.currentTime = 0.9;
  presentation.update(0.1);
  assert.equal(calls.at(-1)[2].voiceCues.get("YAMA"), cue);
  assert.equal(cue.positionSeconds, 0.9);
  presentation.update(0.1);
  assert.equal(cue.positionSeconds, 0.9, "a stalled voice does not advance its mouth");
  audio.currentTime = 0.2;
  presentation.update(0.1);
  assert.equal(cue.positionSeconds, 0.2, "rewound voice is passed through to the shared cue player");
  presentation.stop();
  assert.equal(presentation.active, null);
  assert.ok(calls.some(([kind, value]) => kind === "end" && value === owner));
  await presentation.start(message, audio);
  assert.equal(faces.length, 1);
  setActor({ model: { modelCode: "YMA_L" } });
  assert.equal(presentation.update(0.1), false, "a same-code replacement is still a different body");
  assert.equal(presentation.active, null);
  presentation.clear();
  assert.equal(presentation.cache.size, 0);
  assert.equal(calls.at(-1)[0], "clear");
});

for (const cancel of ["skip", "world", "replace", "new-line"]) {
  test(`late face preparation cannot acquire a body after ${cancel}`, async () => {
    const { presentation, calls, setActor, setPrepare } = setup();
    let resolve;
    setPrepare(() => new Promise(done => { resolve = done; }));
    const pending = presentation.start(message, { currentTime: 0 });
    if (cancel === "skip") presentation.stop();
    if (cancel === "world") presentation.clear();
    if (cancel === "replace") setActor(null);
    if (cancel === "new-line") {
      setPrepare(async () => {});
      await presentation.start(message, { currentTime: 1 });
    }
    resolve();
    assert.equal(await pending, false);
    assert.equal(calls.filter(([kind]) => kind === "begin").length, cancel === "new-line" ? 1 : 0);
    presentation.clear();
  });
}

test("preparation errors remain observable and can be retried; off-stage voices acquire nothing", async () => {
  const { presentation, calls, setPrepare, setActor } = setup();
  setPrepare(async () => { throw new Error("missing FACE asset"); });
  await assert.rejects(presentation.start(message, {}), /missing FACE/);
  assert.equal(presentation.active, null);
  setPrepare(async () => {});
  assert.equal(await presentation.start(message, {}), true);
  presentation.stop();
  const count = calls.length;
  setActor(null);
  assert.equal(await presentation.start(message, {}), false);
  assert.equal(calls.length, count);
});
