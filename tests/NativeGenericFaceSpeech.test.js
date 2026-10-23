import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import * as BABYLON from "@babylonjs/core";
import { loadNativeCharacterModel } from "../play/characters/NativeCharacterModelLoader.js";
import { createNativeAseqFacialPresentation } from "../play/events/NativeAseqFacialPresentation.js";
import { resolveGenericFaceMorph } from "../src/GenericFaceMorph.js";
import { NativeGenericFaceSpeech } from "../src/NativeGenericFaceSpeech.js";
import { nativeLipSyncDescriptor } from "../src/NativeLipSync.js";

const descriptor = nativeLipSyncDescriptor([
  { shape: 5, durationTicks: 60 },
  { shape: 0, durationTicks: 60 },
  { shape: 3, durationTicks: 60 },
]);

async function withMegumi(run, code = "SIA_L") {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  try {
    const bytes = readFileSync(`play/assets/characters/${code}.CHRM`);
    const model = await loadNativeCharacterModel({
      scene, sourceFilename: `${code}.CHRM`,
      modelBuffer: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    });
    const binding = resolveGenericFaceMorph(model);
    assert.ok(binding);
    // Compare the actual float32 GPU representation, not the loader's initial
    // double-precision CPU array before the first updatable-buffer upload.
    const positions = () => Array.from(Float32Array.from(
      binding.meshes[0].mesh.getVerticesData(BABYLON.VertexBuffer.PositionKind),
    ));
    await run({ scene, model, binding, positions });
  } finally {
    scene.dispose();
    engine.dispose();
  }
}

test("shared generic speech reconstructs forward/rewound cues and restores the mouth", () => withMegumi(({ binding, positions }) => {
  const closed = positions();
  const speech = new NativeGenericFaceSpeech(binding);
  assert.equal(speech.start(descriptor), true);
  speech.advance(4);
  const open = positions();
  assert.notDeepEqual(open, closed);
  // The second (closed) 60 Hz cue starts at frame 30 and finishes its eight
  // transition frames before the third cue is prefetched at frame 56.
  speech.seekFrame(46);
  assert.deepEqual(positions(), closed);
  speech.seekFrame(4);
  assert.deepEqual(positions(), open);
  speech.seekFrame(4);
  assert.deepEqual(positions(), open, "buffering/paused time cannot advance the mouth");
  speech.finish();
  speech.advance(8);
  assert.deepEqual(positions(), closed);
  speech.start(descriptor);
  speech.seekFrame(4);
  speech.stop();
  assert.deepEqual(positions(), closed, "cancellation restores the original body geometry");
  assert.equal(speech.start(nativeLipSyncDescriptor([])), false);
  assert.deepEqual(positions(), closed);
}));

test("source-ordered speech restores a distinct rest body after natural completion and cancellation", async () => {
  for (const code of ["TPL_L", "MIB_L"]) await withMegumi(({binding, positions}) => {
    const rest = positions(), speech = new NativeGenericFaceSpeech(binding);
    speech.start(descriptor);
    speech.seekFrame(46);
    assert.deepEqual(positions(), Array.from(binding.meshes[0].closedPositions));
    assert.notDeepEqual(positions(), rest, `${code}: source-zero silence is not the resting body`);
    speech.seekFrame(4);
    assert.deepEqual(positions(), Array.from(binding.meshes[0].openPositions));
    speech.seekFrame(100);
    assert.deepEqual(positions(), rest, "the final closing transition releases the original vertices");
    speech.start(descriptor); speech.seekFrame(3); speech.stop();
    assert.deepEqual(positions(), rest, "cancelled partial transitions cannot change the next binding");
  }, code);
});

test("AUTH uses generic mouths without FACE assets, following voice time across shots", () => withMegumi(async ({ scene, model, positions }) => {
  const faces = createNativeAseqFacialPresentation({
    scene, definitions: {},
    actors: { activeActor: tag => tag === "MEGM" ? { model } : null, componentWorldPosition: () => null },
    loadAsset: () => { throw new Error("embedded mouth must not fetch a FACE"); },
  });
  const closed = positions(), program = {}, first = {}, second = {};
  const cue = { command: { audio: { lipSync: descriptor } }, positionSeconds: 4 / 30 };
  const voiceCues = new Map([["MEGM", cue]]);
  await faces.prepare({ actors: ["MEGM", "CAT_"] });
  assert.equal(faces.beginProgram(program, ["MEGM", "CAT_"]), true);
  faces.begin(first, ["MEGM", "CAT_"]);
  assert.deepEqual([...faces.active.genericFaces.keys()], ["MEGM"]);
  assert.equal(faces.active.faces.size, 0);
  faces.apply(first, { frame: 1, voiceCues });
  const open = positions();
  assert.notDeepEqual(open, closed);
  faces.apply(first, { frame: 30, voiceCues });
  assert.deepEqual(positions(), open, "AUTH time must not advance a stalled voice");
  faces.end(first);
  assert.deepEqual(positions(), closed);
  faces.begin(second, ["MEGM"]);
  faces.apply(second, { frame: 0, voiceCues });
  assert.deepEqual(positions(), open, "re-entering a shot resumes the ongoing speech");
  cue.positionSeconds = 0;
  faces.apply(second, { frame: 1, voiceCues });
  assert.deepEqual(positions(), closed, "rewound audio restarts the morph deterministically");
  cue.positionSeconds = 4 / 30;
  faces.apply(second, { frame: 2, voiceCues });
  faces.apply(second, { frame: 10 });
  assert.deepEqual(positions(), closed, "ended speech closes over eight native frames");
  faces.apply(second, { frame: 11, voiceCues });
  faces.end(second);
  faces.endProgram(program);
  assert.deepEqual(positions(), closed);
  assert.equal(faces.reset(), true);
  const replay = {};
  faces.begin(replay, ["MEGM"]);
  faces.apply(replay, { frame: 4, voiceCues });
  assert.deepEqual(positions(), open, "replay must not accumulate mouth deformation");
  faces.end(replay);
}));
