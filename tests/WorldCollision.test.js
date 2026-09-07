import test from "node:test";
import assert from "node:assert/strict";
import { NullEngine, Scene } from "@babylonjs/core";
import {
  createMapTransitionInteractionAnchors,
  prepareWorldCollision,
} from "../play/world/WorldCollision.js";

function collisionRoot(filename) {
  const mesh = {
    metadata: {},
    checkCollisions: false,
    isPickable: false,
    getTotalVertices: () => 3,
  };
  return {
    ...mesh,
    _filename: filename,
    getDescendants: () => [],
  };
}

test("generic interior MAP geometry is walkable collision terrain", () => {
  const root = collisionRoot("S1_DBYO_MAP.MT5");

  prepareWorldCollision([root], { interior: true });

  assert.equal(root.checkCollisions, true);
  assert.equal(root.metadata.terrain, true);
});

test("custom imported world geometry is walkable collision terrain", () => {
  const root = collisionRoot("CUSTOM_CINEMA_V6.GLB");
  root.metadata.customWorldGeometry = true;

  prepareWorldCollision([root], { interior: true });

  assert.equal(root.checkCollisions, true);
  assert.equal(root.metadata.terrain, true);
  assert.equal(root.metadata.cameraBlocker, true);
});

test("map transition anchors expose a pickable reciprocal-door target", () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const currentMeshes = [];
  const transition = { id: "cinema-exit" };

  createMapTransitionInteractionAnchors({
    scene,
    currentMeshes,
    interactions: [{
      id: "cinema-exit",
      position: [5.78, 1.26, -6.47],
      size: [0.16, 2.2, 2.2],
      transition,
    }],
  });

  assert.equal(currentMeshes.length, 1);
  assert.equal(currentMeshes[0].isPickable, true);
  assert.equal(currentMeshes[0].checkCollisions, false);
  assert.equal(
    currentMeshes[0].metadata.interactiveMapTransition.transition,
    transition,
  );
  scene.dispose();
  engine.dispose();
});

test("native COLI replaces interior MAP geometry as horizontal collision", () => {
  const root = collisionRoot("S1_DBYO_MAP.MT5");

  prepareWorldCollision([root], {
    interior: true,
    nativeHorizontalCollision: true,
  });

  assert.equal(root.checkCollisions, false);
  assert.equal(root.metadata.terrain, true);
  assert.equal(root.metadata.cameraBlocker, true);
  assert.equal(root.isPickable, true);
});

test("MAP geometry remains walkable support in an exterior world", () => {
  const root = collisionRoot("S1_DBYO_MAP.MT5");

  prepareWorldCollision([root], { interior: false });

  assert.equal(root.checkCollisions, false);
  assert.equal(root.metadata.terrain, true);
});

test("Dobuita structural MAP layers support raised sidewalks", () => {
  const root = collisionRoot("S1_D000_MAP04.MT5");

  prepareWorldCollision([root], {
    nativeHorizontalCollision: true,
  });

  assert.equal(root.checkCollisions, false);
  assert.equal(root.isPickable, true);
  assert.equal(root.metadata.terrain, true);
});

test("interior object models do not become terrain implicitly", () => {
  const root = collisionRoot("S1_DBYO_BAR01G.MT5");

  prepareWorldCollision([root], { interior: true });

  assert.equal(root.checkCollisions, false);
  assert.equal(root.metadata.terrain, false);
});

test("native COLI replaces collision from runtime-placed furniture and props", () => {
  const root = collisionRoot("S1_JOMO_TAN10A.MT5");
  root._runtimePlacement = true;

  prepareWorldCollision([root], {
    interior: true,
    nativeHorizontalCollision: true,
  });

  assert.equal(root.checkCollisions, false);
  assert.equal(root.metadata.terrain, false);
  assert.equal(root.isPickable, true);
});

test("scheduled storefront shutters remain presentation-only", () => {
  const root = collisionRoot("S1_D000_DBS9914G.MT5");
  root._scheduledSceneObject = true;

  prepareWorldCollision([root], {
    nativeHorizontalCollision: true,
  });

  assert.equal(root.checkCollisions, false);
  assert.equal(root.isPickable, false);
  assert.equal(root.metadata.terrain, false);
  assert.equal(root.metadata.cameraBlocker, false);
});

test("native COLI replaces every visual horizontal blocker", () => {
  const root = collisionRoot("S2_MFSY_COL11.MT5");

  prepareWorldCollision([root], {
    nativeHorizontalCollision: true,
  });

  assert.equal(root.checkCollisions, false);
  assert.equal(root.isPickable, true);
});

test("runtime placements retain mesh collision as a non-native fallback", () => {
  const root = collisionRoot("S1_JOMO_TAN10A.MT5");
  root._runtimePlacement = true;

  prepareWorldCollision([root], {
    interior: true,
    nativeHorizontalCollision: false,
  });

  assert.equal(root.checkCollisions, true);
});

test("pool equipment remains non-blocking without native collision", () => {
  const root = collisionRoot("S1_DJAZ_BOLK5DYG.MT5");
  root._runtimePlacement = true;
  root._runtimePlacementRecord = {
    runtime: { poolEquipment: true },
  };

  prepareWorldCollision([root], {
    interior: true,
    nativeHorizontalCollision: false,
  });

  assert.equal(root.checkCollisions, false);
  assert.equal(root.isPickable, true);
});

test("70-man battle map geometry is walkable and blocks the player", () => {
  const root = collisionRoot("S3_MFBT_MAP02.MT5");

  prepareWorldCollision([root]);

  assert.equal(root.checkCollisions, true);
  assert.equal(root.metadata.terrain, true);
});

test("Shenmue II MT7 outdoor maps are walkable collision terrain", () => {
  const root = collisionRoot("S2DC_D1_WN00_MPK00_MAP.MT7");
  prepareWorldCollision([root], { interior: false });
  assert.equal(root.isPickable, true);
  assert.equal(root.checkCollisions, true);
  assert.equal(root.metadata.terrain, true);
  assert.equal(root.metadata.cameraBlocker, true);
});

test("authored Shenmue II water stays visible without blocking traversal", () => {
  const root = collisionRoot("S2DC_D1_AR02_MPK00_MAP16.MT7");
  root.metadata = {
    authoredWater: true,
    surfaceKind: "water",
  };

  prepareWorldCollision([root], { interior: false });

  assert.equal(root.isPickable, true);
  assert.equal(root.checkCollisions, false);
  assert.equal(root.metadata.terrain, false);
  assert.equal(root.metadata.cameraBlocker, false);
  assert.equal(root.metadata.surfaceKind, "water");
});
