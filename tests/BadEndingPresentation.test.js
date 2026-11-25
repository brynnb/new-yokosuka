import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { NullEngine, Scene } from "@babylonjs/core";
import { Mt5Loader } from "../src/Mt5Loader.js";
import { parseAuthSequence } from "../src/AuthSequence.js";

const read = file => JSON.parse(fs.readFileSync(file));
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const folder = "play/assets/hazuki/bad-ending";
const pack = read(folder + "/manifest.json");
const src = read("tools/evidence/bad-ending-source.json");
const disc = path.resolve(process.env.SHENMUE_DISC1_EXTRACTED_ROOT || "extracted_files", "data/SCENE/01");

test("the bedroom ending plays the three original BETD tracks under one owner", () => {
  const index = read("play/data/events/nativeEventProgramIndex.generated.json");
  const entry = index.programs.find(row => row.id === "story-s1-jomo-bad-ending");
  const bytes = fs.readFileSync("public" + entry.asset.path);
  assert.equal(sha(bytes), entry.asset.sha256);
  const program = JSON.parse(bytes);
  assert.equal(program.preview.worldId, "interior");
  assert.equal(program.preview.packageId, "bad-ending");
  assert.deepEqual(program.preview.activities.map(a => a.activityId), pack.activities.map(a => a.activityId));
  assert.deepEqual(pack.activities.map(a => a.durationFrames), [265,193,995]);
  for (const [index, activity] of pack.activities.entries()) {
    const film = fs.readFileSync(folder + "/" + activity.archiveMember);
    assert.equal(sha(film),src.shots[index].sha256);
    assert.deepEqual(parseAuthSequence(film).actors, activity.actors);
    assert.equal(activity.browserIsolatedStage,true);
    assert.equal(activity.browserLightingPresetIndex,1);
    assert.deepEqual(activity.nativeSceneObjectStates.filter(o => o.presented).map(o => o.actorTag).sort(), Object.keys(pack.sceneObjects).sort());
  }
});

test("the leased courtyard, its six props, and the original cast resolve locally", () => {
  assert.deepEqual(Object.values(pack.sceneObjects).filter(row => /^MAP/.test(row.model)).map(row => row.model),
    ["MAP","MAP01","MAP02","MAP03","MAP08","MAP10","MAP06"]);
  for (const placement of read("tools/evidence/betd-mapinfo-placements.json").placements) {
    const obj = pack.sceneObjects[placement.runtime.objectTag];
    assert.deepEqual(obj.initialPresentation.position, placement.position);
    assert.deepEqual(obj.initialPresentation.rotationDegrees, placement.rotationDegrees);
  }
  assert.deepEqual(Object.fromEntries(Object.entries(pack.packageActors).map(([tag,actor])=>[tag,actor.modelCode])),
    {FUKU:"FUB_M", SORY:"KOK_M", KURA:"BLA_M", AKIR:"YKB_M"});
  assert.equal(sha(fs.readFileSync(pack.packageActors.AKIR.assetPath)),src.ryo.bodySha256);
  assert.equal(pack.sceneObjects.RM02.referenceOnly,true);
  assert.ok(Object.values(pack.sceneObjects).every(obj => obj.browserFilename.startsWith("S1_BETD_")));
  const assets=read("src/runtime-assets.generated.json").assets;
  for (const obj of [...Object.values(pack.packageActors),...Object.values(pack.sceneObjects)]) {
    for (const file of [obj.assetPath,obj.textureAssetPath]) assert.equal(sha(fs.readFileSync(file)),assets[file].sha256,file);
  }
});

test("BETD's package-owned layers instantiate in the renderer, including its empty marker layer", async () => {
  const engine = new NullEngine();
  const load = file => Uint8Array.from(fs.readFileSync(file)).buffer;
  const textures = load(folder + "/textures.bin");
  try {
    for (const [tag, object] of Object.entries(pack.sceneObjects)) {
      const scene = new Scene(engine);
      try {
        const roots = await new Mt5Loader(scene).load(load(object.assetPath), textures);
        assert.equal(roots.length, object.referenceOnly ? 0 : 1, tag);
        if (roots.length) assert.ok(roots[0].getChildMeshes().length > 0, tag);
      } finally {
        scene.dispose();
      }
    }
  } finally {
    engine.dispose();
  }
});

test("BETD Ryo's YKB face and table exactly match the shared facial assets", {
  skip: !fs.existsSync(path.join(disc,"MODEL/FACE/YKB_F.MT5")) && "requires original Disc 1 face assets",
}, () => {
  for (const code of ["YKB","YKC"]) {
    for (const [suffix, digest] of [["_F.MT5",src.ryo.faceSha256],["_FTBL.BIN",src.ryo.tableSha256]]) {
      assert.equal(sha(fs.readFileSync(path.join(disc,"MODEL/FACE",code+suffix))),digest);
    }
  }
});

test("eleven retail lines, sixteen sound effects and the original BETD score resolve", () => {
  const audio=read("public/audio/world/bad-ending/manifest.json");
  assert.deepEqual(audio.voices.map(v=>v.voiceId),[
    "01BEDAA001","01BEDAA002","01BEDAA003","01BEDAA004","01BEDAA005",
    "01BEDAB001","01BEDAB002","01BEDAB003","01BEDAC001","01BEDAC002","01BEDAC003"]);
  assert.equal(audio.sounds.length,16);
  for (const item of [...audio.voices,...audio.sounds]) {
    assert.equal(item.unavailable,undefined);
    assert.equal(sha(fs.readFileSync(item.asset)),item.sha256,item.asset);
  }
  const music=read("public/music/manifest.json").tracks.bgm127;
  assert.equal(music.source.bankSha256,src.musicSha256);
  const rec=read("src/runtime-assets.generated.json").assets["public"+music.url];
  assert.equal(sha(fs.readFileSync("public"+music.url)),rec.sha256);
});

test("original bedtime gate compares April 15 or later and requests a 16:00 BETD film", {
  skip: !fs.existsSync(path.join(disc,"JOMO/MAPINFO.BIN")) && "requires original Disc 1 map",
}, () => {
  const b=fs.readFileSync(path.join(disc,"JOMO/MAPINFO.BIN"));
  assert.equal(sha(b),"4af865fbb62a06e917d6625149f4bcf77fa6a6bba19b08b8433440f96712a2b9");
  assert.equal(b.readUInt16LE(0x4de30),0xe50f); // day 15
  assert.equal(b.readUInt16LE(0x4de32),0x3453); // cmp/ge
  assert.equal(b.readUInt16LE(0x4de40),0xe604); // April
  assert.equal(b.readUInt16LE(0x4de42),0x3560); // cmp/eq
  assert.equal(b.readUInt16LE(0x4de82),0xe510); // hour 16
  assert.equal(b.toString("ascii",0x4df24,0x4df28),"BETD");
  assert.equal(b.readUInt16LE(0x4dedc),0xe601); // disc 1
});
