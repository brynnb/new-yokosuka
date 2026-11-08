import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync } from "node:fs";
import { parseIpacActivityArchive, sha256 } from "../tools/lib/NativeAseqActivityPack.mjs";

import { parseChrtSceneObjectBindings } from "../tools/lib/chrt_scene_object_bindings.js";

function chrtFixture(imageProperty, uppercase = false) {
  const keyword = value => uppercase ? value.toUpperCase() : value;
  const strings = [
    keyword("DefImage"),
    "BOX_IMAGE",
    imageProperty,
    "BOX_MODEL.MT5",
    keyword("Character"),
    keyword("Image"),
  ];
  const stringOffsets = new Map();
  const encodedStrings = [];
  let cursor = 0x60;
  for (const value of strings) {
    stringOffsets.set(value, cursor);
    const encoded = Buffer.from(`${value}\0`, "ascii");
    encodedStrings.push(encoded);
    cursor += encoded.length;
  }
  const bytes = Buffer.alloc(cursor);
  bytes.write("CHRS", 0, "ascii");
  bytes.writeUInt32LE(0x58, 4);
  bytes.write("STRG", 0x58, "ascii");
  bytes.writeUInt32LE(cursor - 0x58, 0x5c);
  Buffer.concat(encodedStrings).copy(bytes, 0x60);

  const relative = (offset, value) => {
    bytes.writeUInt32LE(stringOffsets.get(value) - offset, offset);
  };
  relative(0x08, keyword("DefImage"));
  bytes.writeUInt32LE(0x23, 0x0c);
  relative(0x10, "BOX_IMAGE");
  bytes.writeUInt32LE(0x04, 0x14);
  relative(0x18, imageProperty);
  bytes.writeUInt32LE(0x19, 0x1c);
  bytes.writeUInt32LE(0x3f800000, 0x20);
  relative(0x24, "BOX_MODEL.MT5");

  relative(0x28, keyword("Character"));
  bytes.writeUInt32LE(0x22, 0x2c);
  bytes.write("TBOX", 0x30, "ascii");
  relative(0x38, keyword("Image"));
  bytes.writeUInt32LE(0x03, 0x3c);
  relative(0x40, "BOX_IMAGE");
  return bytes;
}

test("original TATQ mixed-case records resolve props and nested placements", {
  skip: !existsSync("extracted_files/data/SCENE/01/TATQ/MPK00.PKF"),
}, () => {
  const bytes=readFileSync("extracted_files/data/SCENE/01/TATQ/MPK00.PKF");
  assert.equal(sha256(bytes),"638db6f31e023109852b747ff921a14e3c532001c8ed13d3e3fb1b6885b1c1e0");
  const bindings=parseChrtSceneObjectBindings(parseIpacActivityArchive(bytes).members.find(m=>m.name==="CHARA.CHRT").bytes);
  assert.deepEqual(bindings.map(b=>[b.actorTag,b.model]),[["DOOR","DR01_017"],["KTE1","B03I006G"],["KTE2","B03I007G"],["ISU1","B03I002G"],["ISU2","B03I003G"]]);
  // POSITION here is inside OBJECT, not the intentionally off-stage outer
  // position (113.3, .75, 117.1). Parsing the latter parks props off camera.
  assert.equal(bindings[1].presentation.position[0],Math.fround(-.8953));
  assert.equal(bindings[1].presentation.position[2],Math.fround(-4.3733));
});

test("native image redefinition does not retroactively replace earlier DJAZ props", {
  skip: !existsSync("extracted_files/data/SCENE/01/DJAZ/MPK00.PKF"),
}, () => {
  const bytes=readFileSync("extracted_files/data/SCENE/01/DJAZ/MPK00.PKF");
  assert.equal(sha256(bytes),"bdf69f6aa05e2299d472fff4bdda2b3e398a3919f7252bae0f27a890ce49744b");
  const bindings=parseChrtSceneObjectBindings(parseIpacActivityArchive(bytes).members.find(m=>m.name==="CHARA.CHRT").bytes);
  assert.deepEqual(bindings.filter(b=>b.image==="CYUW").map(b=>[b.actorTag,b.model]),
    [["R_QW","CYUW1H1G"],["B_QW","CYUW1H1G"],["BU05","CYUW101G"]]);
});

test("chase vehicles and hiring actors use original CHRT associations, not archive order", () => {
  for (const [archive, digest, packages] of [
    ["disc2/SCENE/02/D000/CTERST", "8e591075214c8d9c1ba9bf9a3567ae1d795d941c8a0139ccc256227de04a18d1", [
      ["dobuita/jimmy-knock", { DOR1: "DR07_001", DOR2: "DR08_001" }],
    ]],
    ["disc2/SCENE/02/D000/CTERBASE", "0f9028c137fa4df057fad9b8e3e06f09ba98dfc82917977e7ef63ad29010551f", [
      ["dobuita/jimmy-caught", { CAR_: "CARO101G" }],
      ["dobuita/jimmy-escaped", { CAR_: "CARO101G" }],
    ]],
    ["disc3/SCENE/03/MFSY/MARU", "faadd8aecb7e224885eb12d3cbc731215eb64ffb4648649c61c7a9a9272bd280", [
      ["harbor/yada-job-interview", { DOOR: "DR02_021" }],
      ["harbor/mark-job-introduction", { ETC1: "SGJ_L", ETC2: "SGG_L", FORK: "FOKS502G" }],
    ]],
    ["disc3/SCENE/03/MFSY/MARU_KUB", "e1a56ca65b14bcca4393f7a71b856fcfa5b2a97ce9e98650b86b9e7305b19e1b", [
      ["harbor/yada-dismissal", { DOOR: "DR02_001" }],
    ]],
  ]) {
    const source = archive.replace(/^disc([23])\//, "extracted_disc$1_v2/data/");
    const bytes = readFileSync(`${source}.PKF`);
    assert.equal(sha256(bytes), digest);
    const bindings = parseChrtSceneObjectBindings(parseIpacActivityArchive(bytes).members.find(m => m.name === "CHARA.CHRT").bytes);
    const models = parseIpacActivityArchive(readFileSync(`${source}.PKS`)).members;
    for (const [id, expected] of packages) {
      const manifest = JSON.parse(readFileSync(`play/assets/${id}/manifest.json`));
      for (const [tag, model] of Object.entries(expected)) {
        const asset = manifest.packageActors?.[tag] || manifest.sceneObjects[tag];
        assert.equal(asset.modelCode || asset.model, model);
        assert.notEqual(asset.referenceOnly, true);
        assert.deepEqual(asset.sourceBinding, { ...bindings.find(b => b.actorTag === tag),
          archive: `${archive}.PKF`, archiveSha256: digest, member: "CHARA.CHRT" });
        const original = models.find(m => m.name === asset.browserFilename);
        assert.ok(original, `original model for ${id}/${tag}`);
        assert.deepEqual(readFileSync(asset.assetPath), original.bytes);
        assert.ok(manifest.outputs.some(output => output.path === asset.assetPath));
      }
      assert.ok(!manifest.outputs.some(output => output.path.endsWith("/C85N305G.CHRM")));
    }
  }
});

for (const imageProperty of ["Image", "IMAGE"]) {
  for (const uppercase of [false, true]) {
    test(`CHRT accepts ${imageProperty} with uppercase keywords: ${uppercase}`, () => {
      assert.deepEqual(parseChrtSceneObjectBindings(chrtFixture(imageProperty, uppercase)), [{
        actorTag: "TBOX",
        image: "BOX_IMAGE",
        model: "BOX_MODEL",
        characterRecordOffset: 0x30,
        imagePropertyOffset: 0x38,
        defImageRecordOffset: 0x08,
        presentation: null,
      }]);
    });
  }
}
