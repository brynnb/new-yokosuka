import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import test from "node:test";
import { buildNativeAseqActivityPack, sha256 } from "../tools/lib/NativeAseqActivityPack.mjs";
import { NativeAseqActivityCatalog } from "../play/events/NativeAseqActivityRuntime.js";
import { NativeAseqAudioCatalog } from "../play/events/NativeAseqAudioCatalog.js";
import { parseAuthSequence, resolveAuthMotions } from "../src/AuthSequence.js";
import { parseAuthStrings } from "../src/AuthStrings.js";
import { MotnLoader } from "../src/MotnLoader.js";
import { parseDTPK } from "../tools/lib/dtpk.mjs";
import { parseNativeTalkPoseAsset, nativeTalkActorPoses } from "../src/NativeTalkPoses.js";
import { enrichNativeAseqActivityFrames, validateNativeAseqActivityMetadata } from "../play/events/NativeAseqActivityCommands.js";
import { extractNativeAseqOwnerHandPresentation } from "../tools/lib/NativeAseqCallbackPresentation.mjs";

const json = file => JSON.parse(readFileSync(file));
const previews = json("play/data/events/nativeActivityPreviewPrograms.generated.json");

test("continuations retain source-timed, actor-specific detailed hands and mixed body/HAND order", () => {
  for (const id of ["mail", "dream"]) {
    const manifest = json(`play/assets/introduction/op00-${id}/manifest.json`);
    for (const [actorTag, hand] of Object.entries(manifest.handAssets)) {
      assert.equal(hand.bodyModelCode, manifest.packageActors[actorTag].modelCode);
      for (const record of [hand.left.model, hand.right.model, hand.rig]) {
        const bytes = readFileSync(record.path);
        assert.equal(bytes.length, record.byteLength);
        assert.equal(sha256(bytes), record.sha256);
      }
    }
    const catalog = new NativeAseqActivityCatalog(manifest);
    const selections = previews.programs.find(program => program.id === `preview-s1-op00-${id}`).preview.activities;
    for (const activity of manifest.activities) {
      const record = catalog.resolve(selections.find(selection => selection.slot === activity.slot));
      const sequence = parseAuthSequence(readFileSync(record.assetPath));
      // Exercise real metadata -> runtime commands, not just JSON presence.
      const commands = enrichNativeAseqActivityFrames({ sequence, record, frames: sequence.frames,
        metadata: validateNativeAseqActivityMetadata(manifest) });
      assert.ok(commands);
      for (const cue of [...record.nativeHandPoseCues, ...record.nativeBodyHandPoseCues]) {
        assert.ok(manifest.handAssets[cue.actorTag]);
        assert.ok(sequence.actors.includes(cue.actorTag));
      }
    }
  }
  const mail = json("play/assets/introduction/op00-mail/manifest.json");
  const ine = mail.activities.find(a => a.slot === 25);
  assert.equal(mail.handAssets.INE_.handCode, "INE");
  assert.deepEqual(ine.nativeHandPoseCues.map(c => [c.frame, c.side, c.durationNativeTicks]),
    [[0, "right", 1], [0, "left", 1], [566, "left", 35], [625, "right", 500]]);
  assert.deepEqual(ine.nativeHandComponentCues.map(c => [c.frame, c.side, c.rotationRaw]), [[566, "left", [0, 0, 5097]]]);
  assert.deepEqual([...ine.nativeHandPoseCues, ...ine.nativeBodyHandPoseCues, ...ine.nativeHandComponentCues]
    .sort((a, b) => a.frame - b.frame || a.sourceOrder - b.sourceOrder).map(c => c.callFileOffset),
  ["0x1ffba", "0x10582", "0x105a2", "0x1076a", "0x107ae", "0x10826"]);
  const dream = json("play/assets/introduction/op00-dream/manifest.json");
  assert.deepEqual(Object.fromEntries(Object.entries(dream.handAssets).map(([tag, hand]) => [tag, hand.handCode])),
    { AKI_: "YKD", IWAO: "IWA", SORY: "KOK" });
  const iwao = dream.activities.find(a => a.slot === 37).nativeHandPoseCues;
  assert.deepEqual(iwao.map(c => [c.actorTag, c.side, c.callFileOffset]),
    [["IWAO", "right", "0x1e2d2"], ["IWAO", "left", "0x1e2f2"]]);
  for (const slot of [28, 29]) assert.deepEqual(dream.activities.find(a => a.slot === slot).nativeHandPoseCues
    .map(c => [c.actorTag, c.side, c.frame]), [["AKI_", "right", 0], ["AKI_", "left", 0]]);
});

test("owner HAND projection preserves original stage boundaries and defers absent actors", () => {
  const evidence = json("tools/evidence/op00-continuation-native-callback-ir.json");
  const functions = [evidence.function, ...evidence.supportingFunctions];
  const owner = functions.find(fn => fn.id === "0x1dda8");
  const manifest = json("play/assets/introduction/op00-dream/manifest.json");
  const stages = owner.blocks.flatMap(b => b.actions).filter(a => a.operationId === 0x50 && a.arguments[0].value !== 0xffffffff)
    .map(a => ({ slot: a.arguments[0].value, ownerCallFileOffset: a.callFileOffset,
      actors: manifest.activities.find(activity => activity.slot === a.arguments[0].value).actors }));
  const input = { bytes: readFileSync("extracted_files/data/SCENE/01/OP00/MAPINFO.BIN"), nativeFunction: owner, functions, stages };
  const hands = extractNativeAseqOwnerHandPresentation(input);
  assert.ok(!hands.bySlot.get(30).nativeHandPoseCues.some(cue => cue.actorTag === "IWAO"));
  assert.equal(hands.bySlot.get(37).nativeHandPoseCues.filter(cue => cue.actorTag === "IWAO").length, 2);
  assert.throws(() => extractNativeAseqOwnerHandPresentation({ ...input, stages: [...stages].reverse() }), /stage order changed/);
});
for (const [id, slots] of [
  ["mail", [26,27,25]],
  ["dream", [28,...Array.from({ length: 17 }, (_,i) => i+30),29]],
]) test(`OP00 ${id} preserves original scene order and resolves every motion and audio cue`, () => {
  const manifest = json(`play/assets/introduction/op00-${id}/manifest.json`);
  const program = previews.programs.find(p => p.id === `preview-s1-op00-${id}`);
  assert.deepEqual(program.preview.activities.map(a => a.slot), slots);
  const catalog = new NativeAseqActivityCatalog(manifest);
  const motion = new Map(manifest.motionBanks.map(bank => [bank.bank, MotnLoader.parse(readFileSync(bank.path))]));
  const audio = new NativeAseqAudioCatalog(json(`public/audio/world/op00-${id}/manifest.json`));
  for (const selected of program.preview.activities) {
    const record = catalog.resolve(selected);
    const bytes = readFileSync(record.assetPath);
    assert.equal(sha256(bytes), record.sha256);
    const sequence = parseAuthSequence(bytes);
    assert.ok(resolveAuthMotions(sequence, motion).every(m => m.motionValid));
    const strings = parseAuthStrings(bytes).strings;
    for (const command of sequence.frames.flatMap(f => f.commands).filter(c => ["voice","sound"].includes(c.name))) {
      if (command.commandWord === 0xffffffff) continue;
      assert.ok(audio.resolve(command, strings[command.stringIndex]));
    }
  }
  assert.ok(!manifest.actorTags.includes("SINF"), "opening continuation never selects Shenhua");
  if (id === "mail") {
    assert.equal(manifest.packageActors.INE_.modelCode, "INE_M");
    assert.equal(manifest.packageActors.KWMT.modelCode, "UBA_L");
    assert.ok(manifest.sceneObjects.FUTO && manifest.sceneObjects.PSTH);
    assert.deepEqual(manifest.activities.find(a => a.slot === 26).hiddenActors, ["AKIR"]);
  } else {
    assert.equal(manifest.packageActors.AKI_.modelCode, "YKD_M");
    assert.equal(manifest.packageActors.SORY.modelCode, "KOK_M");
    assert.equal(manifest.activities.at(-1).slot, 29);
  }
});

test("Lan Di dream isolates every montage shot but keeps the sleeping and waking bedroom", () => {
  const manifest = json("play/assets/introduction/op00-dream/manifest.json");
  for (const activity of manifest.activities) {
    const bedroom = [28, 29].includes(activity.slot);
    assert.equal(activity.browserIsolatedStage === true, !bedroom, `slot ${activity.slot}`);
    assert.deepEqual(activity.browserBackgroundColor, bedroom ? undefined : [0, 0, 0, 1]);
    assert.deepEqual(activity.browserMapVisibility.filter(state => state.visible).map(state => state.nativeName),
      bedroom ? ["OMO"] : []);
  }
});

test("dream sleepwear Ryo has his matching YKD face and source-timed sleep/wake expressions", () => {
  const manifest = json("play/assets/introduction/op00-dream/manifest.json");
  const face = manifest.facialAssets.AKI_;
  assert.equal(face.bodyModelCode, manifest.packageActors.AKI_.modelCode);
  assert.equal(face.faceCode, "YKD");
  for (const record of [face.model, face.table, face.poses]) {
    const bytes = readFileSync(record.path);
    assert.equal(bytes.length, record.byteLength);
    assert.equal(sha256(bytes), record.sha256);
  }
  const poses = nativeTalkActorPoses(parseNativeTalkPoseAsset(readFileSync(face.poses.path)), "AKI_", face.table.sha256);
  assert.equal(poses.upperPoses.length, 80);
  assert.notDeepEqual(poses.upperPoses[24], poses.upperPoses[25], "sleep expression has distinct open/closed eyelids");
  const sleeping = manifest.activities.find(a => a.slot === 28);
  const waking = manifest.activities.find(a => a.slot === 29);
  assert.deepEqual(sleeping.nativeFaceControllerCues.map(c => [c.frame, c.mode, c.intervalNativeTicks]), [[0, 1, 1]]);
  assert.deepEqual(waking.nativeFaceControllerCues.map(c => [c.frame, c.mode, c.intervalNativeTicks]), [[0, 1, 1], [21, 2, 6]]);
  assert.deepEqual(sleeping.nativeFaceClipCues.map(c => c.frame), [0, 51, 71, 86, 95, 125, 160, 210, 230]);
  assert.equal(waking.nativeFaceClipCues.length, 19);
  assert.deepEqual(manifest.nativeFaceCallbackSource.selections.map(s => [s.slot, s.callbackFunction]), [[28, "0x10ce4"], [29, "0x1120c"]]);
  assert.deepEqual(manifest.nativeFaceCallbackSource.selections[1].excludedAfterActivity.map(c => c.frame), [345, 385, 405, 445, 465]);
  for (const activity of [sleeping, waking]) for (const cue of [...activity.nativeFaceClipCues, ...activity.nativeFaceControllerCues]) {
    assert.equal(cue.actorTag, "AKI_");
    assert.ok(cue.frame < activity.durationFrames);
  }
});

test("dream audio records the one absent clothing cue without masking unknown cues", () => {
  const manifest = json("public/audio/world/op00-dream/manifest.json");
  const missing = manifest.sounds.filter(sound => sound.unavailable);
  assert.equal(missing.length, 1);
  assert.equal(missing[0].commandHex, "a9042000");
  const bank = parseDTPK(readFileSync(manifest.sources.soundBank.path));
  assert.ok(!bank.groups.flatMap(group => group.tracks).some(track => track.commandHex === missing[0].commandHex));
  const catalog = new NativeAseqAudioCatalog(manifest);
  const command = { name: "sound", commandWord: 0x2004a9 };
  const cue = catalog.resolve(command, missing[0].sourcePath);
  assert.equal(cue.silent, true);
  assert.deepEqual(cue.assetUrls, []);
  assert.match(cue.unavailableReason, /track 32 is absent/);
  assert.throws(() => catalog.resolve(command, "unknown"), /not catalogued/);
  assert.throws(() => new NativeAseqAudioCatalog({ ...manifest, sounds: [{ ...missing[0], evidence: null }] }), /requires source evidence/);
});

test("shared package compiler extracts pinned embedded AUTH ranges and rejects a changed parent", context => {
  const manifest = json("play/assets/introduction/op00-mail/manifest.json");
  const source = manifest.source.members[0];
  const outputDirectory = mkdtempSync("/var/tmp/op00-embedded-pack-");
  context.after(() => rmSync(outputDirectory, { recursive: true, force: true }));
  const config = { generatedBy: "test", resourceName: "OP00", disc: 1,
    sourceMembers: [{ ...source, sourcePath: source.path }], expectedMembers: [source],
    outputDirectory, outputAssetPrefix: "test", manifestPath: `${outputDirectory}/manifest.json`,
    motionBanks: manifest.motionBanks.map(bank => ({ ...bank, sourcePath: bank.path, assetPath: bank.path })),
    activities: [{ slot: 26, file: source.name, binding: { kind: "map-embedded-slot" } }],
  };
  const result = buildNativeAseqActivityPack(config);
  assert.equal(result.activities[0].sha256, source.sha256);
  assert.equal(result.activities[0].binding.kind, "map-embedded-slot");
  assert.throws(() => buildNativeAseqActivityPack({ ...config,
    sourceMembers: [{ ...config.sourceMembers[0], sourceSha256: "0".repeat(64) }],
  }), /source .* changed/);
});
