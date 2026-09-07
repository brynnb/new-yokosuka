import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import test from "node:test";

import browserManifest from "../play/data/timed-transition-access.json" with {
  type: "json",
};
import {
  isAlwaysAccessibleInterior,
  isNativeLayerDoorBlocker,
  isPresentationOnlyDoorSelector,
  isTimedAccessControlledDestination,
  timedAccessRuleForTransition,
} from "../play/world/TimedTransitionAccess.js";
import { WORLDS } from "../play/config/worlds.js";
import { MAP_TRANSITIONS } from "../src/MapTransitions.js";
import {
  OUTDOOR_BOUNDARY_TRANSITIONS,
} from "../src/BoundaryTransitions.js";
import {
  TRAVEL_DESTINATIONS,
} from "../play/ui/react/SidebarData.js";

test("the generated browser access projection is complete", () => {
  assert.deepEqual(browserManifest.rules, []);
  assert.deepEqual(browserManifest.presentationOnlyAssociations, []);
});

test("generated access data remains pinned to its exact evidence inputs", () => {
  for (const source of browserManifest.generatedFrom) {
    const bytes = fs.readFileSync(new URL(`../${source.path}`, import.meta.url));
    assert.equal(
      createHash("sha256").update(bytes).digest("hex"),
      source.sha256,
      source.path,
    );
  }
});

test("unproven DCHA access override stays retired", () => {
  assert.equal(timedAccessRuleForTransition("d000-door-30-to-dcha-entry-0"), null);
  for (const world of ["dcha", "dbhb", "dbyo"]) {
    assert.equal(isTimedAccessControlledDestination(world), false);
  }
});

test("every Shenmue sidebar interior is explicitly accessible 24 hours", () => {
  const sidebarInteriorWorldIds = TRAVEL_DESTINATIONS
    .map(([worldId]) => worldId)
    .filter((worldId) => WORLDS[worldId]?.interior === true);
  assert.deepEqual(
    browserManifest.alwaysAccessibleInteriorWorldIds,
    sidebarInteriorWorldIds,
  );
  assert.deepEqual(sidebarInteriorWorldIds, [
    "interior",
    "cinema",
    "arcade",
    "djaz",
  ]);
  for (const worldId of sidebarInteriorWorldIds) {
    assert.equal(isAlwaysAccessibleInterior(worldId), true, worldId);
    assert.equal(isTimedAccessControlledDestination(worldId), false, worldId);
  }
  assert.equal(isAlwaysAccessibleInterior("dcha"), false);
});

test("clock presentation does not imply player portal availability", () => {
  for (const selector of [28, 30, 63]) {
    assert.equal(isPresentationOnlyDoorSelector("dobuita", selector), false);
  }
});

test("unrelated native layers cannot block any Dobuita portal", () => {
  const controlledLayers = [
    8, 10, 11, 12, 13, 14, 17, 18, 19, 20, 21, 22,
  ];
  const portals = MAP_TRANSITIONS.filter((transition) => (
    transition.source.worldId === "dobuita"
      && Number.isInteger(transition.source.doorSelector)
  ));
  assert.equal(portals.length, 22);
  for (const portal of portals) {
    for (const layer of controlledLayers) {
      assert.equal(
        isNativeLayerDoorBlocker(
          portal.source.worldId,
          portal.source.doorSelector,
          layer,
        ),
        false,
        `${portal.id} received an unrelated blocker from layer ${layer}`,
      );
    }
  }
});

test("generic time variants cannot block Shenmue II native doors", () => {
  const nativeDoors = OUTDOOR_BOUNDARY_TRANSITIONS.filter(
    (transition) => transition.source.nativeDoor,
  );
  assert.equal(nativeDoors.length, 17);
  for (const transition of nativeDoors) {
    for (let layer = 0; layer <= 22; layer += 1) {
      assert.equal(
        isNativeLayerDoorBlocker(
          transition.source.worldId,
          undefined,
          layer,
        ),
        false,
        `${transition.id} was blocked by generic layer ${layer}`,
      );
    }
  }
});
