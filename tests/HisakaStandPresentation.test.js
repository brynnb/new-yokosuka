import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {MotnLoader} from "../src/MotnLoader.js";
import {createScriptEventPresentationCatalog} from "../play/scripts/ScriptEventPresentationCatalog.js";

const read = filename => JSON.parse(fs.readFileSync(filename, "utf8"));
const packageRoot = "play/assets/harbor/hisaka-stand";
const manifest = read(packageRoot + "/manifest.json");
const audio = read("public/audio/world/hisaka-stand/manifest.json");
const evidence = read("tools/evidence/hisaka-harbor-native.json");

test("Hisaka's request, two responses and report select distinct native activities", () => {
  const catalog = createScriptEventPresentationCatalog();
  const parts = ["request", "accept", "decline", "report"];
  for (const [slot, part] of parts.entries()) {
    const entry = catalog.activity("s1.mfsy.hisaka-" + part + ".scene");
    const source = manifest.activities[slot];
    assert.equal(entry.cutscene.packageId, "hisaka-stand");
    assert.equal(entry.cutscene.worldId, "mfsy");
    assert.equal(entry.cutscene.activity.slot, slot);
    assert.deepEqual(entry.cutscene.activity.binding, {primaryPointer: source.primaryPointer, secondaryPointer: source.secondaryPointer});
    assert.equal(source.durationFrames, evidence.activities[slot].durationFrames);
    assert.ok(source.actors.includes("HISA"));
    assert.ok(source.actors.includes("AKIR"));
  }
  assert.deepEqual(manifest.activities.map(a => a.durationFrames), [1650, 330, 170, 260, 10]);
  assert.equal(manifest.activities[0].actors.length, 7);
  assert.deepEqual(manifest.activities[4].actors, ["HISA"]);
  assert.equal(audio.voices.length, 34);
  assert.equal(audio.sounds.length, 10);
  for (const clip of [...audio.voices, ...audio.sounds]) assert.ok(fs.existsSync(clip.asset), clip.asset);
  assert.ok(audio.voices.some(v => v.displayText === "I'll try."));
  assert.ok(audio.voices.some(v => v.displayText === "How did it go, Ryo?"));
});

test("Jo's authored walk resolves within the original global motion bank", () => {
  const bank = manifest.motionBanks.find(b => b.bank === 5);
  const bytes = fs.readFileSync(bank.path);
  const data = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const walk = MotnLoader.parse(data, {sourceSequenceBase: bank.sourceSequenceBase, sequenceIndices:[93]}).sequences;
  assert.equal(walk.length, 1);
  assert.equal(walk[0].index, 93);
  assert.equal(walk[0].sourceIndex, 1373);
  assert.equal(walk[0].name, "AKI_AKI_WALK_SP2_LP");
  const requests = manifest.activities[0].motions.filter(m => m.actorTag === "JOE_");
  assert.equal(requests.length, 19);
  assert.ok(requests.every(m => m.motionBank === 5 && m.sequenceIndex === 93 && m.startFrame === 1 && m.endFrame === 36));
  for (const bad of [NaN, -1, 0xffff]) {
    assert.throws(() => MotnLoader.parse(data, {sourceSequenceBase:bad}), /source sequence base/);
  }
});

test("the Mai alley presents native actor pairs, shot coordinates, handed props and both losses", () => {
  const chapter=read("play/data/story-mai-alley.generated.json"), catalog=createScriptEventPresentationCatalog();
  assert.equal(chapter.scenes.length,17);
  const byKey = key => chapter.scenes.find(s=>s.id==="s1.mfsy.mai-alley."+key);
  const prop = (key,tag) => byKey(key).attachedObjects[tag].attachments[0];
  for (const s of chapter.scenes) {
    assert.deepEqual(s.actors.map(a=>a.tag),["AKIR","HINA","ISYM","NMNO"]);
    assert.equal(catalog.sequence(s.id+".start").scene.id,s.id);
    assert.equal(catalog.sequence(s.id+".finish").scene.id,s.id);
    assert.ok(s.cameraTrack.channels.positionX.times.length>1);
    for(const a of s.actors) assert.equal(a.motion.bank,"maiAlley");
  }
  assert.equal(byKey("first-prompt").actors[0].motion.name,"AKI_QOK_KAWASU_KAMISORI");
  assert.equal(byKey("second-prompt").actors[0].motion.name,"AKI_QOK_TAOSU_KAMISORI");
  assert.equal(byKey("final-prompt").actors[0].motion.name,"AKI_QOK_TAOSU_TETUPIPE");
  assert.equal(prop("first-prompt","SORI").parentActorTag,"ISYM");
  assert.equal(prop("final-prompt","KAKU").parentActorTag,"NMNO");
  assert.equal(prop("win-conversation","KAKU").parentActorTag,"AKIR");
  assert.notEqual(byKey("lose").camera.positionX,byKey("lose-razor").camera.positionX);
  assert.notEqual(byKey("lose").actors[0].motion.name,byKey("lose-razor").actors[0].motion.name);
  for(const stage of chapter.scenes) for(const cue of stage.soundCues || []) assert.ok(fs.existsSync(cue.asset));
});
