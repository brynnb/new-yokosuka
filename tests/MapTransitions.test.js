import assert from "node:assert/strict";
import test from "node:test";
import nativeTransitions from "../play/data/native-map-transitions.json" with { type: "json" };

import ju00Placements from "../play/data/ju00-runtime-placements.json" with {
  type: "json",
};
import {
  MAP_TRANSITIONS,
  OBJECT_MAP_TRANSITIONS,
  mapTransitionForDoor,
  mapTransitionForNativeDestination,
  mapTransitionForObject,
} from "../src/MapTransitions.js";

test("all 22 physical Dobuita storefronts retain their reciprocal routes", () => {
  const routes = nativeTransitions.reverseMatchedD000Transitions;
  assert.equal(routes.length, 22);
  assert.equal(new Set(routes.map((route) => route.source.doorSelector)).size, 22);
  for (const route of routes) {
    const actual = mapTransitionForDoor(route.source);
    assert.equal(actual?.id, route.id);
    assert.equal(actual.destination.area, route.destination.area);
    const returning = nativeTransitions.allExactDoorTransitions.find(
      (record) => record.id === route.evidence.returnTransitionId,
    );
    assert.equal(returning.source.area, actual.destination.area);
    assert.equal(returning.destination.area, "D000");
    assert.equal(returning.destination.entry, route.evidence.returnDestinationEntry);
    assert.ok(route.evidence.exteriorDoorDistance < 2.5);
  }
  for (const dispatch of nativeTransitions.d000DirectTransitions) {
    assert.ok(Number.isInteger(dispatch.source.dispatchValue));
    assert.equal(dispatch.source.doorSelector, undefined);
    assert.equal(dispatch.source.model, undefined);
    assert.equal(mapTransitionForDoor(dispatch.source), null);
  }
});

test("the runtime-confirmed JOMO front door resolves to JHD0 entry 2", () => {
  const transition = mapTransitionForDoor({
    worldId: "interior",
    objectTag: "dor0",
    model: "S1_JOMO_DR15_016.MT5",
  });

  assert.equal(transition, MAP_TRANSITIONS[0]);
  assert.deepEqual(transition.destination, {
    worldId: "exterior",
    scene: 1,
    area: "JHD0",
    entry: 2,
    browserSpawn: {
      position: [2.9900002479553223, 0, 1.090000033378601],
      yaw: -0.22568692341767496,
    },
  });
  assert.equal(transition.evidence.operationId, 0x0030);
  assert.equal(transition.evidence.callFileOffset, "0x4434a");
});

test("native destination tuple resolves to the same exact browser route", () => {
  const transition = mapTransitionForNativeDestination({
    scene: 1,
    area: "JHD0",
    entry: 2,
  });
  assert.equal(transition, MAP_TRANSITIONS[0]);
  assert.equal(mapTransitionForNativeDestination({
    scene: 9,
    area: "NONE",
    entry: 0,
  }), null);
});

test("unproven JOMO door associations do not produce speculative warps", () => {
  assert.equal(mapTransitionForDoor({
    worldId: "interior",
    objectTag: "dor1",
    model: "S1_JOMO_DR15_026.MT5",
  }), null);
});

test("the Hazuki exterior doors route inside and into Yamanose", () => {
  const interior = mapTransitionForDoor({
    worldId: "exterior",
    objectTag: "dor0",
    model: "S1_JHD0_DR15_016.MT5",
  });
  assert.equal(interior.destination.worldId, "interior");
  assert.equal(interior.destination.area, "JOMO");
  assert.equal(interior.destination.entry, 0);
  assert.deepEqual(
    interior.destination.browserSpawn.position,
    [-14.71808910369873, 0, 5.410741806030273],
  );

  const gate = mapTransitionForDoor({
    worldId: "exterior",
    objectTag: "dor1",
    model: "S1_JHD0_DR29_000.MT5",
  });
  assert.equal(gate.destination.worldId, "yamanose");
  assert.equal(gate.destination.area, "JU00");
  assert.equal(gate.destination.entry, 1);
  assert.deepEqual(
    gate.destination.browserSpawn,
    {
      position: [
        51.98007583618164,
        7.74480676651001,
        99.62751007080078,
      ],
      yaw: -2 * Math.PI / 3,
    },
  );
  assert.equal(gate.evidence.nativeDestinationArea, "JU00");
  assert.equal(gate.evidence.nativeDestinationEntry, 1);
});

test("the Yamanose residence gate returns to the Hazuki grounds", () => {
  const placement = ju00Placements.placements.find(
    (candidate) => candidate.runtime.staticDoorIndex === 18,
  );
  assert.ok(placement);
  const gate = mapTransitionForDoor({
    worldId: "yamanose",
    objectTag: placement.runtime.objectTag,
    model: placement.model,
  });
  assert.ok(gate);
  assert.equal(gate.destination.worldId, "exterior");
  assert.equal(gate.destination.area, "JHD0");
  assert.equal(gate.destination.entry, 1);
  assert.deepEqual(gate.destination.browserSpawn, {
    position: [1, 0, 9.9],
    yaw: Math.PI,
  });
});

test("the Old Warehouse District routes to Warehouse No. 8 and Harbor", () => {
  const warehouseEight = mapTransitionForDoor({
    worldId: "mksg",
    objectTag: "dor3",
    model: "S2_MKSG_DR02_021.MT5",
  });
  assert.ok(warehouseEight);
  assert.equal(warehouseEight.destination.worldId, "ms08");
  assert.equal(warehouseEight.destination.area, "MS08");
  assert.equal(warehouseEight.destination.entry, 0);
  assert.deepEqual(warehouseEight.destination.browserSpawn.position, [
    26.5,
    0,
    -2.299999952316284,
  ]);

  const harbor = mapTransitionForDoor({
    worldId: "mksg",
    objectTag: "dor8",
    model: "S2_MKSG_DR02_021.MT5",
  });
  assert.ok(harbor);
  assert.equal(harbor.destination.worldId, "mfsy");
  assert.equal(harbor.destination.area, "MFSY");
  assert.equal(harbor.destination.entry, 1);
  assert.deepEqual(harbor.destination.browserSpawn, {
    position: [118, 0, -12],
    yaw: Math.PI / 2,
  });
});

test("the Warehouse No. 8 interior door returns to its MKSG doorway", () => {
  const transition = mapTransitionForDoor({
    worldId: "ms08",
    objectTag: "dor0",
    model: "S2_MS08_DR02_021.MT5",
  });
  assert.ok(transition);
  assert.equal(transition.destination.worldId, "mksg");
  assert.deepEqual(transition.destination.browserSpawn.position, [
    24.2,
    0,
    -61.69995880126953,
  ]);
});

test("Abe Store and both harbor interiors have bidirectional door routes", () => {
  const cases = [
    {
      exterior: {
        worldId: "sakuragaoka",
        doorSelector: 0,
        model: "S1_JD00_DR15_024.MT5",
      },
      interior: {
        worldId: "jabe",
        objectTag: "DOOR",
        model: "S1_JABE_DR15_030.MT5",
      },
      interiorWorldId: "jabe",
      returnWorldId: "sakuragaoka",
    },
    {
      exterior: {
        worldId: "mfsy",
        doorSelector: 18,
        model: "S2_MFSY_DR02_021.MT5",
      },
      interior: {
        worldId: "mkyu",
        objectTag: "DR02_001",
        model: "S2_MKYU_DR02_001.MT5",
      },
      interiorWorldId: "mkyu",
      returnWorldId: "mfsy",
    },
    {
      exterior: {
        worldId: "mfsy",
        doorSelector: 26,
        model: "S2_MFSY_DR02_021.MT5",
      },
      interior: {
        worldId: "ms8s",
        objectTag: "MS8S_DOOR",
        model: "S2_MS8S_DR02_026.MT5",
      },
      interiorWorldId: "ms8s",
      returnWorldId: "mfsy",
    },
  ];
  for (const definition of cases) {
    const inbound = mapTransitionForDoor(definition.exterior);
    assert.equal(inbound.destination.worldId, definition.interiorWorldId);
    assert.equal(inbound.destination.entry, 0);
    const outbound = mapTransitionForDoor(definition.interior);
    assert.equal(outbound.destination.worldId, definition.returnWorldId);
  }
});

test("the authored You Arcade auto door returns to exact Dobuita entry 6", () => {
  const transition = mapTransitionForDoor({
    worldId: "arcade",
    objectTag: "AUTO_DOOR",
    // /play uses the Disc 3 asset; the canonical exact route is first
    // authored on Disc 1. Native area/model stems make that variant explicit.
    model: "S3_DGCT_DR17_003.MT5",
  });
  assert.ok(transition);
  assert.equal(transition.source.area, "DGCT");
  assert.equal(transition.destination.area, "D000");
  assert.equal(transition.destination.entry, 6);
  assert.deepEqual(transition.destination.browserSpawn.position, [
    -22.25,
    0,
    31.719999313354492,
  ]);
  assert.ok(Math.abs(
    transition.destination.browserSpawn.yaw
      - 3.1000538153949573,
  ) < 1e-9);
});

test("Dobuita physical doors are not overwritten by unrelated script arguments", () => {
  const timedShop = mapTransitionForDoor({
    worldId: "dobuita",
    doorSelector: 30,
    model: "S1_D000_DR02_016.MT5",
  });
  assert.equal(timedShop.destination.area, "DBHB");
  assert.equal(timedShop.authorization, undefined);

  assert.equal(mapTransitionForDoor({
    worldId: "dobuita",
    doorSelector: 63,
    model: "S1_D000_DR02_017.MT5",
  }).destination.area, "DBYO");

  // Physical door 28 is the restaurant, even though dispatcher argument 28
  // goes to Heartbeats. These identifiers are not interchangeable.
  assert.equal(mapTransitionForDoor({
    worldId: "dobuita",
    doorSelector: 28,
    model: "S1_D000_DR15_013.MT5",
  }).destination.area, "DCHA");

  const mjq = mapTransitionForDoor({
    worldId: "dobuita",
    doorSelector: 0,
    model: "S1_D000_DR28_001.MT5",
  });
  assert.equal(mjq.destination.area, "DJAZ");
  assert.equal(mjq.authorization, undefined);

  const arcade = mapTransitionForDoor({
    worldId: "dobuita",
    doorSelector: 64,
    model: "S1_D000_DR17_002.MT5",
  });
  assert.equal(arcade.destination.area, "DGCT");
  assert.equal(arcade.authorization, undefined);
  assert.deepEqual(arcade.destination.browserSpawn.position, [
    -2.700000047683716,
    0,
    -0.846999999973923,
  ]);
});

test("ordinary Old Warehouse doors do not become speculative portals", () => {
  for (const objectTag of [
    "CPAM", "dor1", "dor2", "dor4", "dor5", "dor6", "dor7", "dor9",
  ]) {
    assert.equal(mapTransitionForDoor({
      worldId: "mksg",
      objectTag,
      model: "S2_MKSG_DR02_021.MT5",
    }), null);
  }
});

test("clicking Dobuita's captured bus travels to the requested harbor point", () => {
  const transition = mapTransitionForObject({
    worldId: "dobuita",
    objectTag: "BUS_",
    model: "S1_D000_BUSS530G.MT5",
  });

  assert.equal(transition, OBJECT_MAP_TRANSITIONS[0]);
  assert.deepEqual(transition.source.browserPosition, [
    -50.346893,
    0,
    5.975222,
  ]);
  assert.deepEqual(transition.destination, {
    worldId: "mfsy",
    scene: 2,
    area: "MFSY",
    entry: null,
    browserSpawn: {
      position: [130.5, 0, 140.6],
      yaw: Math.PI,
    },
  });
});

test("the Dobuita bus travel does not attach to the driver or another world", () => {
  assert.equal(mapTransitionForObject({
    worldId: "dobuita",
    objectTag: "BUSS",
    model: "S1_D000_C85M201G.MT5",
  }), null);
  assert.equal(mapTransitionForObject({
    worldId: "mfsy",
    objectTag: "BUS_",
    model: "S1_D000_BUSS530G.MT5",
  }), null);
});
