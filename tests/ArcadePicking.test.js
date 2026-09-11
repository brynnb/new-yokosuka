import assert from "node:assert/strict";
import test from "node:test";
import * as B from "@babylonjs/core";
import { pickArcadeInteraction } from "../play/arcade/ArcadePicking.js";
import { createArcadeInteractionAnchors } from "../play/world/WorldCollision.js";
import { ARCADE_CABINET_VIEWS, YOU_ARCADE_INTERACTIONS } from "../play/config/arcadeFixtures.js";
import { WorldInteractionDispatcher } from "../play/interactions/WorldInteractionDispatcher.js";

function fixture(t, gameId, cameraPosition) {
  const engine = new B.NullEngine({ renderWidth: 800, renderHeight: 600 });
  const scene = new B.Scene(engine);
  const camera = new B.FreeCamera("camera", B.Vector3.FromArray(cameraPosition), scene);
  camera.minZ = 0.01;
  const definition = ARCADE_CABINET_VIEWS[gameId];
  camera.setTarget(B.Vector3.FromArray(definition.center));
  scene.pointerX = 400;
  scene.pointerY = 300;
  const anchors = [];
  createArcadeInteractionAnchors({ scene, currentMeshes: anchors, interactions: YOU_ARCADE_INTERACTIONS, activeWorldId: "arcade", defaultWorldId: "arcade" });
  const screen = new B.Mesh("authored-cabinet-screen", scene);
  const data = new B.VertexData();
  data.positions = [definition.bottomLeft, definition.bottomRight, definition.topRight, definition.topLeft].flat();
  data.indices = [0, 1, 2, 0, 2, 3];
  data.applyToMesh(screen);
  screen.metadata = { terrain: true, cameraBlocker: true };
  scene.render();
  t.after(() => { scene.dispose(); engine.dispose(); });
  return { scene, camera, screen, anchors };
}

for (const [gameId, position, oldWrongTarget] of [
  ["qte", [-3, 1.65, -5], "paddles"],
  ["invaders", [-2, 1.65, 1], "hangon"],
  ["pacman", [-3, 1.65, -1], "astrob"],
]) {
  test(`oblique click on ${gameId} ignores the nearer ${oldWrongTarget} proxy`, t => {
    const { scene, camera } = fixture(t, gameId, position);
    // Reproduce the old predicate: explicit predicates ignore isPickable.
    const oldPick = scene.pick(400, 300, mesh => !!mesh.metadata?.interactiveArcade, false, camera);
    assert.equal(oldPick.pickedMesh.metadata.interactiveArcade.gameId, oldWrongTarget);
    assert.equal(pickArcadeInteraction(scene, camera)?.gameId, gameId);
  });
}

for (const gameId of ["qte", "hangon", "harrier", "astrob", "pacman", "invaders"]) {
  test(`close frontal ${gameId} screen selection uses the same surface rule`, t => {
    const view = ARCADE_CABINET_VIEWS[gameId];
    const position = view.center.map((value, axis) => value + view.frontNormal[axis] * 0.7);
    const { scene, camera } = fixture(t, gameId, position);
    assert.equal(pickArcadeInteraction(scene, camera)?.gameId, gameId);
  });
}

test("walls and visible neighboring surfaces block cabinet selection", t => {
  const { scene, camera, screen } = fixture(t, "qte", [-3, 1.65, -5]);
  const wall = B.MeshBuilder.CreateBox("wall", { size: 0.2 }, scene);
  wall.position.copyFrom(camera.position.add(camera.getForwardRay().direction.scale(0.5)));
  wall.metadata = { cameraBlocker: true };
  scene.render();
  assert.equal(pickArcadeInteraction(scene, camera)?.gameId, undefined);
  wall.setEnabled(false);
  assert.equal(pickArcadeInteraction(scene, camera)?.gameId, "qte");
  screen.setEnabled(false);
  assert.equal(pickArcadeInteraction(scene, camera)?.gameId, undefined, "a proxy alone must not start a machine");
});

test("dispatcher opens the surface-selected game rather than a nearer proxy", t => {
  const { scene, camera } = fixture(t, "qte", [-3, 1.65, -5]);
  const started = [];
  const dispatcher = Object.assign(Object.create(WorldInteractionDispatcher.prototype), {
    scene, camera, getActorPosition: () => ({ x: -1, y: 0, z: -5 }),
    arcade: { getGames: () => ({ start: (...args) => started.push(args) }) },
  });
  dispatcher.handleWorldObject({});
  assert.equal(started.length, 1);
  assert.equal(started[0][0], "qte");
});

test("replacement video screens remain selectable when their baked screen is absent", t => {
  const { scene, camera, screen } = fixture(t, "qte", [-3, 1.65, -5]);
  screen.metadata = { arcadeScreen: true };
  assert.equal(pickArcadeInteraction(scene, camera)?.gameId, "qte");
});

test("floor clicks within a cabinet footprint do not start a game", t => {
  const { scene, camera, screen } = fixture(t, "qte", [-1, 1.65, -5]);
  screen.setEnabled(false);
  const floor = B.MeshBuilder.CreateGround("floor", { width: 20, height: 20 }, scene);
  floor.metadata = { terrain: true };
  camera.setTarget(new B.Vector3(-0.355, 0, -7.637));
  scene.render();
  assert.equal(pickArcadeInteraction(scene, camera)?.gameId, undefined);
});
