import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const readJson = file => JSON.parse(fs.readFileSync(file, "utf8"));
const route = readJson("tools/scripting/story-investigation.json").routes.find(row => row.id === "nozomi-flowers");
const regionPath = "play/data/story-regions.json";
const region = readJson(regionPath).regions.find(row => row.id === route.bounds);
const serverRegionPath = path.resolve(process.env.NEW_YOKOSUKA_SERVER_DIR || "../new-yokosuka-server-story-mode",
  "internal/scriptevent/story_regions.json");
const discPath = path.resolve(process.env.SHENMUE_DISC2_EXTRACTED_ROOT || "extracted_disc2_v2",
  "data/SCENE/02/JOMO/MAPINFO.BIN");
const discOptions = { skip: !fs.existsSync(discPath) && "requires original extracted Disc 2 JOMO" };

test("the optional altar region and Story route use the same admission and completion flags", () => {
  assert.equal(region.id, "s1.jomo.nozomi-flowers");
  for (const key of ["area", "actor", "trigger", "requiredFlags", "excludedFlags", "completedFlag"]) {
    assert.deepEqual(region[key], route[key], key);
  }
  assert.equal(region.worldId, "interior");
  assert.equal(route.trigger, "enter");
  assert.equal(route.actor, "AKIR");
  assert.deepEqual(route.participants, ["INE_"]);
  assert.deepEqual(route.requiredFlags, ["story.s1.boat-ticket-collection.completed"]);
  assert.equal(route.sameDayAs, "story.s1.jimmy-promise.day");
});

test("the server and client agree on the flower trigger", {
  skip: !fs.existsSync(serverRegionPath) && "requires the companion Story server checkout",
}, () => {
  const server = readJson(serverRegionPath).regions.find(row => row.id === region.id);
  assert.deepEqual(server, region);
});

test("the original one-time bank gate and native X/Z rectangle lead to room command 32", discOptions, () => {
  const map = fs.readFileSync(discPath);
  assert.equal(createHash("sha256").update(map).digest("hex"), "6a4e6e8d8e71aa450fef6922ebe0036776a94cb498710a562e4418a9338037fe");
  assert.equal(map.readUInt16LE(0x41a90), 0xe502); // current scene/disc == 2
  // Function 0x41a72 combines three bank-2 predicates with logical AND.
  // Read the flag literals and their comparison immediates from the SH-4 code.
  const predicates = [[0x41b18, 0x41ac2], [0x41b1c, 0x41ae0], [0x41b20, 0x41b02]]
    .map(([literal, compare]) => {
      assert.equal(map.readUInt16LE(compare) >> 8, 0xe5); // mov #imm,r5
      return [map.readUInt32LE(literal), map.readUInt8(compare)];
    });
  assert.deepEqual(predicates, [[370, 1], [924, 0], [380, 0]]);
  assert.deepEqual(route.excludedNativeFlags, predicates.filter(([, value]) => value === 0).map(([flag]) => `2:${flag}`));
  assert.deepEqual(route.nativeEffects, [{address: "2:" + map.readUInt32LE(0x41bd8), value: 1}]);
  assert.equal(map.toString("ascii", 0x41b94, 0x41b98), region.actor);
  assert.equal(map.readUInt16LE(0x41b6c), 0xe50a); // operation 10: actor X/Z bounds
  const browserCorners = [[0x41b84, 0x41b88], [0x41b8c, 0x41b90]]
    .map(([x, z]) => [-map.readFloatLE(x), map.readFloatLE(z)]);
  for (const [component, axis] of [[0, 0], [1, 2]]) {
    const coords = browserCorners.map(corner => corner[component]);
    assert.equal(Math.fround(region.min[axis]), Math.min(...coords));
    assert.equal(Math.fround(region.max[axis]), Math.max(...coords));
  }
  // Entering this rectangle sets 924 before dispatch in the original.
  // The adapted Story event settles its state on player acknowledgement.
  assert.equal(map.readUInt32LE(0x41bd8), 924);
  assert.equal(map.readUInt16LE(0x41b9c), 0xe401); // value 1
  assert.equal(map.readUInt16LE(0x41ba0), 0xe60c); // bank write
  assert.equal(map.readUInt16LE(0x41bc4), 0xe520); // command 32
  assert.equal(map.readUInt16LE(0x8cea2), map.readUInt16LE(0x41bc4));
  assert.equal(0x8ceba + 4 + map.readInt32LE(0x8cec4), 0x743cc);
});

test("the native flower owner launches its frame callback and selects the checked AUTH", discOptions, () => {
  const map = fs.readFileSync(discPath);
  const scn3 = 8;
  assert.equal(map.toString("ascii", scn3, scn3 + 4), "SCN3");
  assert.equal(scn3 + map.readUInt32LE(0x745b8), 0x747f4); // child at 0x7453e
  assert.equal(map.readUInt16LE(0x74538), 0xe502); // launch child
  assert.equal(map.readUInt16LE(0x74548), 0xe550); // start ASEQ
  const slot = map.readUInt8(0x74544);
  assert.equal(slot, 36);
  const scex = scn3 + map.readUInt32LE(scn3 + 4);
  assert.equal(map.toString("ascii", scex, scex + 4), "SCEX");
  let track = scex + 8;
  for (let index = 0; index < slot; index++) {
    assert.equal(map.toString("ascii", track, track + 4), "TRCK");
    const size = map.readUInt32LE(track + 4);
    assert.ok(size >= 8);
    track += size; // Empty 8-byte tracks are real slots.
  }
  assert.equal(track, 0xc1728);
  assert.equal(map.toString("ascii", track + 8, track + 12), "ASEQ");
  assert.equal(map.readUInt32LE(track + 20), 1248);
  const bytes = map.subarray(track, track + map.readUInt32LE(track + 4));
  const source = route.nativeSources.find(item => item.role === "original-altar-film");
  assert.equal(source.locator, "disc2/SCENE/02/JOMO/MAPINFO.BIN#AUTH/0x" + track.toString(16));
  assert.equal(createHash("sha256").update(bytes).digest("hex"), source.sha256);
});
