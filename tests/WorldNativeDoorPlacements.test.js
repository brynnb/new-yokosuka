import assert from "node:assert/strict";
import test from "node:test";
import {mapTransitionForDoor} from "../src/MapTransitions.js";
import {jomoObjectBehavior} from "../src/JomoObjectRegistry.js";

import {
  WORLDS,
  worldLabelForId,
} from "../play/config/worlds.js";

test("world IDs resolve to human-friendly character-card labels", () => {
  assert.equal(worldLabelForId("exterior"), "Hazuki Residence Grounds");
  assert.equal(worldLabelForId("DJAZ"), "MJQ Jazz Bar");
  assert.equal(worldLabelForId("mfsy"), "New Yokosuka Harbor");
  assert.equal(worldLabelForId("future-zone"), "future-zone");
  assert.equal(worldLabelForId(""), "Unknown Location");
});

test("existing world placements receive exact native door-controller tags", () => {
  const autoDoor = WORLDS.arcade.placements.find(
    (placement) => placement.model === "S3_DGCT_DR17_003.MT5",
  );
  assert.ok(autoDoor);
  assert.equal(autoDoor.runtime.objectTag, "AUTO_DOOR");
  assert.equal(autoDoor.runtime.nativeInteriorDoor, true);
  assert.deepEqual(autoDoor.runtime.nativeControllerWords, [
    "0x000a02ab",
    "0x000b02ab",
  ]);
  assert.equal(autoDoor.runtime.nativeRecordFileOffset, "0x46e04");
});

test("all 25 reverse-backed Shenmue I interiors contain one exact return door", () => {
  const interiors = Object.values(WORLDS).filter(
    (world) => world.evidence?.inboundKind,
  );
  assert.equal(interiors.length, 25);
  for (const world of interiors) {
    const returnDoors = world.placements.filter(
      placement => placement.runtime.nativeInteriorDoor && placement.runtime.nativeRecordFileOffset,
    );
    assert.equal(returnDoors.length, 1, world.id);
  }
});

test("confirmed non-Dobuita interiors use native maps, spawns, and collision areas", () => {
  const expected = {
    jabe: ["JABE", "S1_JABE", [0.699999988079071, 0, 1.309999942779541]],
    mkyu: ["MKYU", "S2_MKYU", [82.80000305175781, 0, 59]],
    ms8s: [
      "MS8S",
      "S2_MS8S",
      [-17, 4.275000095367432, 152.24000549316406],
    ],
  };
  for (const [worldId, [area, prefix, spawn]] of Object.entries(expected)) {
    const world = WORLDS[worldId];
    assert.equal(world.nativeArea, area);
    assert.equal(world.prefix, prefix);
    assert.equal(world.interior, true);
    assert.deepEqual(world.spawn.asArray(), spawn);
    assert.equal(world.placements.filter(p => p.runtime.nativeInteriorDoor).length, worldId === "ms8s" ? 3 : 1);
    assert.equal(world.placements[0].runtime.nativeInteriorDoor, true);
  }
  assert.equal(WORLDS.mkyu.placements[0].runtime.nativeStaticTransition, true);
});

test("exterior placements retain the three exact reverse-door selectors", () => {
  const abeDoor = WORLDS.sakuragaoka.placements.find(
    (placement) => placement.runtime?.staticDoorIndex === 0,
  );
  const loungeDoor = WORLDS.mfsy.placements.find(
    (placement) => placement.runtime?.staticDoorIndex === 18,
  );
  const warehouseDoor = WORLDS.mfsy.placements.find(
    (placement) => placement.runtime?.staticDoorIndex === 26,
  );
  assert.equal(abeDoor.runtime.doorSelector, 0);
  assert.equal(loungeDoor.runtime.doorSelector, 18);
  assert.equal(warehouseDoor.runtime.doorSelector, 26);
});

test("recovered Dobuita interiors use canonical map names", () => {
  const bilingualDumpLabels = {
    arar: "アジア旅行社",
    daza: "アジア旅行社",
    dbhb: "ハートビーツ",
    dhqb: "ハートビーツ",
    dgct: "ゲームセンター",
    gmct: "ゲームセンター",
    dkpa: "カラオケパブ ナナ",
    dkty: "骨董屋",
    dmaj: "大三元",
    dski: "世界旅行社",
    dtky: "理容マエダ",
    dcha: "中華 味壱",
    tatq: "タトゥショップ",
    dbyo: "BAR ヨコスカ",
    djaz: "MJQ",
    dpiz: "ボブズ ピザ",
    drme: "満福軒",
    drht: "バーバー劉",
    drsa: "陶器屋ロシヤ",
    toki: "陶器屋ロシヤ",
    dsba: "そば屋 やま路",
    dsli: "リンダ",
    dslt: "スロットハウス",
    dsus: "宝ずし",
    durn: "ラピス",
    dykz: "永井興業",
    dcbn: "トマトマート",
  };
  for (const [worldId, japaneseLabel] of Object.entries(bilingualDumpLabels)) {
    if (!WORLDS[worldId]) continue;
    assert.equal(WORLDS[worldId].japaneseLabel, japaneseLabel, worldId);
  }
  assert.equal(WORLDS.exterior.japaneseLabel, "芭月家");
  assert.equal(WORLDS.interior.japaneseLabel, "芭月家母屋");
  assert.equal(WORLDS.yamanose.japaneseLabel, "山の瀬");
  assert.equal(WORLDS.sakuragaoka.japaneseLabel, "桜ヶ丘");
  assert.equal(WORLDS.dobuita.japaneseLabel, "ドブ板");
  assert.equal(WORLDS.arcade.japaneseLabel, "ゲームセンター");
  assert.equal(WORLDS.mfsy.japaneseLabel, "新横須賀港");
  assert.equal(WORLDS.mksg.japaneseLabel, "旧倉庫街");
  assert.equal(WORLDS.ms08.japaneseLabel, "第８倉庫");
  for (
    const world
    of Object.values(WORLDS).filter((candidate) => (
      candidate.evidence?.inboundKind
    ))
  ) {
    assert.notEqual(world.label, world.nativeArea);
    assert.notEqual(world.japaneseLabel, world.label);
  }
});

test("Warehouse No. 8 restores three physical upper hinges with one harbor exit", () => {
  const doors = WORLDS.ms8s.placements.filter(p => p.runtime.nativeInteriorDoor);
  assert.deepEqual(doors.map(door => door.runtime.staticDoorIndex), [0,1,2]);
  assert.deepEqual(doors.map(door => door.runtime.objectTag), ["MS8S_DOOR", null, null]);
  assert.deepEqual(doors.map(door => door.runtime.staticDoorResourceName), Array(3).fill("MS8S_DOOR"));
  assert.deepEqual(doors.map(door=>Boolean(mapTransitionForDoor({
    worldId:"ms8s", model:door.model, ...door.runtime,
  }))), [true,false,false]);
  for (const door of doors) {
    assert.equal(door.model, "S2_MS8S_DR02_026.MT5");
    assert.equal(jomoObjectBehavior(door.model, door.runtime.objectTag, door.runtime).kind, "d000-door");
  }
});


test("Warehouse No. 8 places both original invoice envelopes above the upstairs desk", () => {
  const props = WORLDS.ms8s.placements.filter(p => p.runtime.authoredStoryProp);
  assert.deepEqual(props.map(p => p.runtime.objectTag), ["FUT0", "FUT1"]);
  for (const [placement, model, position, rotation] of [
    [props[0], "S2_MS8S_FUTS5K9G.MT5", [-24.01, 5.04, 137.21], [90, 180, 0]],
    [props[1], "S2_MS8S_FUTS5D8G.MT5", [-27.33, 5.032, 139.11], [0, 299.99817, 0]],
  ]) {
    assert.equal(placement.model, model);
    assert.equal(placement.runtime.initiallyEnabled, true);
    placement.position.forEach((value, index) => assert.ok(Math.abs(value - position[index]) < 0.00001));
    placement.rotationDegrees.forEach((value, index) => assert.ok(Math.abs(value - rotation[index]) < 0.00001));
  }
});
