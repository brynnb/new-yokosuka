import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { extractNativeAseqCallbackHandPresentation } from "../tools/lib/NativeAseqCallbackPresentation.mjs";
import { extractNativeAseqCallbackObjectPresentation } from "../tools/lib/NativeAseqCallbackObjectPresentation.mjs";

const read = file => JSON.parse(fs.readFileSync(new URL(file, import.meta.url)));
const root = path.resolve(import.meta.dirname, "..");
const home = path.resolve(process.env.SHENMUE_DISC2_EXTRACTED_ROOT || "extracted_disc2_v2", "data/SCENE/02/JOMO");
const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
const manifestPath = "../play/assets/hazuki/family-crest/manifest.json";

test("family crest retains the exact callback hand poses and intermediate handguard transfers", {
  skip: !fs.existsSync(path.join(home, "MAPINFO.BIN")) && "requires original Disc 2 JOMO extraction",
}, () => {
  const evidence = read("../tools/evidence/family-crest-callback-ir.json");
  const bytes = fs.readFileSync(path.join(home, "MAPINFO.BIN"));
  assert.equal(sha256(bytes), evidence.source.mapinfoSha256);
  assert.equal(evidence.source.mapEntryFunction, "0x88b70");
  assert.equal(evidence.source.callbackFunction, "0x6f234");
  const functions = [evidence.function, ...evidence.supportingFunctions];
  const input = { bytes, functions, nativeFunction: evidence.function,
    callbackFunction: 0x6f234, activitySlot: 0, durationFrames: 1600 };
  const hands = extractNativeAseqCallbackHandPresentation(input);
  assert.deepEqual(hands.nativeHandComponentLimitations, []);
  assert.equal(hands.nativeHandPoseCues.length, 14);
  assert.equal(hands.nativeHandComponentCues.length, 83);
  const manifest = read(manifestPath), activity = manifest.activities[0];
  assert.equal(activity.durationFrames, 1600);
  for (const key of ["nativeHandPoseCues", "nativeBodyHandPoseCues", "nativeHandComponentCues"])
    assert.deepEqual(activity[key], hands[key]);
  assert.deepEqual(manifest.nativeHandPoseTables, hands.nativeHandPoseTables);
  const props = extractNativeAseqCallbackObjectPresentation({ ...input, objectTags: ["TUBA"] });
  assert.deepEqual(props.attachedObjectCues.map(c => [c.frame,c.action,c.parentActorTag,c.controlId]), [
    [210,"attach","AKIR",18], [295,"detach",undefined,undefined], [396,"attach","INE_",18],
    [572,"detach",undefined,undefined], [572,"attach","INE_",12],
    [865,"detach",undefined,undefined], [865,"attach","INE_",18],
    [898,"detach",undefined,undefined], [898,"attach","AKIR",18],
    [1098,"detach",undefined,undefined], [1098,"attach","AKIR",18],
    [1410,"detach",undefined,undefined],
  ]);
  // Consecutive detach/attach at one source frame selects the final owner.
  // Retain exact grip vectors as well as the abbreviated ownership timeline.
  const lastByFrame = new Map(props.attachedObjectCues.map(cue => [cue.frame, cue]));
  const attached = manifest.attachedObjects.TUBA.attachments;
  assert.deepEqual(attached.map(({activityId, ...cue}) => cue), [...lastByFrame.values()]);
  assert.ok(attached.every(cue => cue.activityId === activity.activityId));
  assert.deepEqual(Object.keys(manifest.handAssets).sort(), ["AKIR", "INE_"]);
});

test("family crest bundles the distinct original loose handguard with embedded textures", {
  skip: !fs.existsSync(path.join(home, "TUB0210G.MT5")) && "requires original Disc 2 JOMO extraction",
}, () => {
  const manifest = read(manifestPath), prop = manifest.attachedObjects.TUBA;
  assert.notEqual(prop.sceneObject, true, "TUBA has no AUTH track and must not borrow a scene-object trajectory");
  assert.ok(prop.assetPath.startsWith("play/assets/hazuki/family-crest/"));
  assert.equal(path.basename(prop.assetPath), "TUB0210G.MT5");
  const original = fs.readFileSync(path.join(home, "TUB0210G.MT5"));
  const bundled = fs.readFileSync(path.join(root, prop.assetPath));
  assert.equal(sha256(original), "65cbbf5d36cea3add3b5184bb9a3027137871ef13c15614df7a58b848fcd09e4");
  assert.equal(sha256(bundled), sha256(original));
  assert.equal(bundled.length, 45548);
  const output = manifest.outputs.find(entry => entry.path === prop.assetPath);
  assert.ok(output, "the runtime asset inventory includes the handguard, not just its manifest");
  assert.equal(output.sha256, sha256(original));
  assert.equal(output.byteLength, original.length);
  const shopProp = path.join(root, "play/assets/dobuita/bunkado-handguard/TUB0210G.CHRM");
  if (fs.existsSync(shopProp)) assert.notEqual(sha256(fs.readFileSync(shopProp)), sha256(bundled));
});

test("family crest keeps its standalone tabletop approximation bounded to the original gap", () => {
  const manifest = read(manifestPath), prop = manifest.attachedObjects.TUBA;
  assert.equal(prop.worldTransforms.length, 1);
  const table = prop.worldTransforms[0];
  assert.equal(table.activityId, manifest.activities[0].activityId);
  assert.equal(table.frame, 325);
  assert.equal(table.lastFrame, 395);
  for (const [i, value] of [4.8504, .3408, .3143].entries())
    assert.ok(Math.abs(table.position[i] - value) < 0.000001);
  assert.deepEqual(table.rotationRaw, [16384, 0, 0]);
  assert.deepEqual(prop.presentation.filter(cue => cue.frame > 0).map(cue => [cue.frame, cue.visible]), [
    [396,false],[412,true],[440,false],[572,true],[847,false],[865,true],[898,true],[1098,true],
  ]);
  assert.ok(prop.presentation.every(cue => cue.activityId === manifest.activities[0].activityId));
});
