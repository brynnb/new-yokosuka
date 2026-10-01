import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { extractNativeAseqCallbackObjectPresentation } from "../tools/lib/NativeAseqCallbackObjectPresentation.mjs";
import { extractNativeAseqCallbackHandPresentation } from "../tools/lib/NativeAseqCallbackPresentation.mjs";

const manifest = JSON.parse(readFileSync("play/assets/sakuragaoka/evsn/manifest.json"));

test("EVSN keeps source-ordered hand setup and changes for each selected activity", () => {
  const evidence = JSON.parse(readFileSync("tools/evidence/evsn-hand-native-callback-ir.json"));
  const functions = [evidence.function, ...evidence.supportingFunctions];
  const bytes = readFileSync("extracted_files/data/SCENE/01/JD00/MAPINFO.BIN");
  for (const [index, id] of ["0x721f8", "0x72300", "0x729e0", "0x721f8"].entries()) {
    const activity = manifest.activities[index];
    const result = extractNativeAseqCallbackHandPresentation({ bytes, callbackFunction: parseInt(id, 16),
      nativeFunction: functions.find(fn => fn.id === id), functions, activitySlot: activity.slot });
    const visibleActor = cue => activity.actors.includes(cue.actorTag);
    assert.deepEqual(result.nativeHandPoseCues.filter(visibleActor), activity.nativeHandPoseCues);
    assert.deepEqual(result.nativeBodyHandPoseCues.filter(visibleActor), activity.nativeBodyHandPoseCues);
    assert.ok([...result.nativeHandPoseCues, ...result.nativeBodyHandPoseCues]
      .filter(cue => !visibleActor(cue)).every(cue => cue.frame === 0), "only inactive room-actor setup is omitted");
  }
  assert.deepEqual(manifest.activities.map(a => [a.nativeHandPoseCues.length, a.nativeBodyHandPoseCues.length]),
    [[6, 5], [18, 9], [20, 10], [6, 5]]);
  assert.deepEqual(manifest.activities[1].nativeHandPoseCues.filter(c => c.poseTableOffset === "0x790bc")
    .map(c => [c.frame, c.actorTag, c.side]), [[1193, "ENKI", "right"], [1580, "AKIR", "right"], [1580, "AKIR", "left"]]);
  assert.equal(manifest.handAssets.KKEN.mode, "body-only");
  assert.equal(manifest.handAssets.ENKI.rig.vertexCount, 306);
  assert.equal(manifest.handAssets.NGSM.rig.sha256, manifest.handAssets.ENKI.rig.sha256);

  const options = { bytes, callbackFunction: 0x72300, functions, activitySlot: 1 };
  // The source scene-flag predicate may be unknown, but only its playing path
  // starts ASEQ. Never choose between two playing paths or ignore side effects.
  const mutated = structuredClone(evidence.function);
  mutated.blocks.find(b => b.id === "0x72344").actions.push({ kind: "engineOperation", operationId: 0x50,
    arguments: [{ kind: "constant", value: 1 }] });
  assert.throws(() => extractNativeAseqCallbackHandPresentation({ ...options, nativeFunction: mutated }), /no governing ASEQ frame/);
  mutated.blocks.find(b => b.id === "0x72344").actions[0].operationId = 0x81;
  assert.throws(() => extractNativeAseqCallbackHandPresentation({ ...options, nativeFunction: mutated }), /no governing ASEQ frame/);
});

test("EVSN's repeat belongs to the interstitial loop, not the linear cinematic route", () => {
  const pack = JSON.parse(readFileSync("play/data/events/nativeEventPrograms.generated.json"));
  const program = pack.programs.find(p => p.id === "disc1-jd00-nozomi-rescue-owner-0x5b6f8");
  const fn = program.functions.find(f => f.id === "0x74960");
  const query = fn.blocks.flatMap(b => b.actions).find(a => a.callFileOffset === "0x7562a");
  assert.equal(query.operationHex, "0x0088");
  assert.equal(query.resultComparison.constant, 3);
  assert.equal(query.resultComparison.resolvedBranch.comparisonTrueSuccessor, "0x75640");
  assert.deepEqual(fn.blocks.find(b => b.id === "0x75640").successors, ["0x75b94"]);
  assert.equal(fn.blocks.find(b => b.id === "0x75870").actions.at(-1).targetFileOffset, "0x76424");
  assert.deepEqual(fn.blocks.find(b => b.id === "0x75c48").successors, ["0x74c44"]);
  const routes = JSON.parse(readFileSync("tools/data/native-activity-preview-routes.json")).routes;
  for (const [id, lead] of [["S1-EVSN-01", 0], ["S1-EVSN-02", 3]]) {
    assert.deepEqual(routes.find(r => r.cutsceneId === id).activities.map(a => a.slot), [lead, 1, 2]);
  }
});

test("EVSN binds the existing airplane to the child's hand before aftermath playback and releases at its end", () => {
  const ir = JSON.parse(readFileSync("tools/evidence/evsn-aftermath-native-callback-ir.json"));
  const args = {
    bytes: readFileSync("extracted_files/data/SCENE/01/JD00/MAPINFO.BIN"),
    nativeFunction: ir.function, callbackFunction: 0x729e0,
    durationFrames: 1080, activitySlot: 2, objectTags: ["AIRO"],
  };
  const cues = extractNativeAseqCallbackObjectPresentation(args).attachedObjectCues;
  assert.deepEqual(cues.map(c => [c.frame, c.action]), [[0, "attach"], [1080, "detach"]]);
  assert.deepEqual(cues[0].rotationRaw, [35503, 29309, 48241]);
  const prop = manifest.attachedObjects.AIRO;
  assert.equal(prop.sceneObject, true);
  assert.deepEqual(prop.attachments.map(c => [c.activityId, c.frame, c.parentActorTag, c.controlId]), [
    ["EVSN/SEQDATA3.AUTH", 0, "KKEN", 12], ["EVSN/SEQDATA3.AUTH", 1080, undefined, undefined],
  ]);
  const changed = structuredClone(ir.function);
  changed.blocks[0].successors.push("unknown-conditional-path");
  assert.throws(() => extractNativeAseqCallbackObjectPresentation({ ...args, nativeFunction: changed }), /no governing ASEQ frame/);
});
