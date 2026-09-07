import assert from "node:assert/strict";
import test from "node:test";

import {
  SHENMUE2_JAPANESE_AREA_LABELS,
  WORLDS,
} from "../play/config/worlds.js";
import { SHENMUE_II_TRAVEL_DESTINATIONS } from
  "../play/ui/react/SidebarData.js";
import shenmue2BoundaryTransitions, {
  SHENMUE2_TRAVERSABLE_WORLD_DATA,
} from "../src/Shenmue2BoundaryTransitionData.js";

test("S2 default entry headings use the controller-forward axis", () => {
  assert.equal(WORLDS.s2ak00.yaw, -Math.PI);
  assert.equal(WORLDS.s2ar02.yaw, 0);
});

test("S2 loading screens use native Japanese location names", () => {
  assert.equal(WORLDS.s2ak00.japaneseLabel, "開運碼頭");
  assert.equal(WORLDS.s2ar03.japaneseLabel, "クイーンズストリート");
  assert.equal(WORLDS.s2we00.japaneseLabel, "詠黄街");
  assert.equal(WORLDS.s2ws00.japaneseLabel, "菜珍街");
  assert.equal(WORLDS.s2aka3.japaneseLabel, "不要銭宿");
  assert.equal(WORLDS.s2wesm.japaneseLabel, "詠黄百貨");
  assert.equal(WORLDS.s2wsg1.japaneseLabel, "光武館");
  for (const world of Object.values(WORLDS)) {
    if (!world.id.startsWith("s2")) continue;
    // Later-disc exploration uses the documented English fallback until a
    // source-backed Japanese label is catalogued. Existing labels stay exact.
    if (world.evidence?.explorationOnly && !SHENMUE2_JAPANESE_AREA_LABELS[world.nativeArea]) {
      assert.equal(world.japaneseLabel, world.label, world.id);
      continue;
    }
    assert.equal(
      world.japaneseLabel,
      SHENMUE2_JAPANESE_AREA_LABELS[world.nativeArea],
      world.id,
    );
    assert.notEqual(world.japaneseLabel, world.label, world.id);
  }
});

test("every outdoor S2 default uses a real adjacent-zone arrival", () => {
  for (const [worldId] of SHENMUE_II_TRAVEL_DESTINATIONS) {
    const world = WORLDS[worldId];
    const transition = shenmue2BoundaryTransitions.find(
      ({ id }) => id === world.nativeWarp.transitionId,
    );
    assert.ok(transition, worldId);
    assert.equal(transition.activation, "crossing", worldId);
    assert.notEqual(transition.source.worldId, worldId, worldId);
    assert.equal(transition.destination.worldId, worldId, worldId);
    assert.deepEqual(
      [world.spawn.x, world.spawn.y, world.spawn.z],
      transition.destination.browserSpawn.position,
      worldId,
    );
    assert.equal(world.yaw, transition.destination.browserSpawn.yaw, worldId);
  }
});

test("Golden Quarter defaults to its grounded White Dynasty arrival", () => {
  assert.equal(
    WORLDS.s2we00.nativeWarp.transitionId,
    "s2-wr00-fldd-exit-2-to-we00-entry-2",
  );
  assert.deepEqual(
    [WORLDS.s2we00.spawn.x, WORLDS.s2we00.spawn.y, WORLDS.s2we00.spawn.z],
    [-183, 100.6500015258789, 125.0999984741211],
  );
});

test("native S2 interiors are loadable but stay out of the travel sidebar", () => {
  assert.equal(SHENMUE2_TRAVERSABLE_WORLD_DATA.length, 26);
  assert.equal(WORLDS.s2arsf.assetFormat, "MT7");
  assert.equal(WORLDS.s2arsf.prefix, "S2DC_D1_ARSF_MPK00");
  assert.equal(WORLDS.s2arsf.evidence.hiddenFromTravelMenu, true);
  assert.equal(
    SHENMUE_II_TRAVEL_DESTINATIONS.some(([id]) => id === "s2arsf"),
    false,
  );
});
