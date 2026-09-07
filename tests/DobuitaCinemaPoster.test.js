import assert from "node:assert/strict";
import test from "node:test";
import { existsSync } from "node:fs";
import * as BABYLON from "@babylonjs/core";

import {
  DOBUITA_CINEMA_LOWER_POSTER,
  DOBUITA_CINEMA_POSTER,
  DOBUITA_CINEMA_POSTERS,
  createDobuitaCinemaPoster,
  disposeDobuitaCinemaPoster,
  suppressDobuitaCinemaFacadeFaces,
} from "../play/world/DobuitaCinemaPoster.js";

function indexedMesh(scene, parent, name, faceCount) {
  const mesh = new BABYLON.Mesh(name, scene);
  mesh.setVerticesData(BABYLON.VertexBuffer.PositionKind, [0, 0, 0]);
  mesh.setIndices(Array.from(
    { length: faceCount * 3 },
    (_value, index) => index % 3,
  ));
  mesh.parent = parent;
  return mesh;
}

test("Dobuita cinema poster replaces its panel and foreground decoration", () => {
  assert.equal(
    existsSync("public/assets/cinema/godzilla-vs-biollante-poster.jpg"),
    true,
  );
  assert.equal(DOBUITA_CINEMA_POSTER.imageUrl, (
    "/assets/cinema/godzilla-vs-biollante-poster.jpg"
  ));
  assert.equal(
    existsSync("public/assets/cinema/super-godzilla-vs-biollante-poster.jpg"),
    true,
  );
  assert.equal(DOBUITA_CINEMA_LOWER_POSTER.imageUrl, (
    "/assets/cinema/super-godzilla-vs-biollante-poster.jpg"
  ));
  assert.equal(DOBUITA_CINEMA_POSTERS.length, 2);

  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  const root = new BABYLON.TransformNode("root", scene);
  root._filename = "S1_D000_MAP.MT5";
  const posterNode = new BABYLON.TransformNode("node_55e98", scene);
  posterNode._mt5Node = { addr: 0x55e98 };
  posterNode.parent = root;
  const objectNode = new BABYLON.TransformNode("node_57858", scene);
  objectNode._mt5Node = { addr: 0x57858 };
  objectNode.parent = root;
  const panel = indexedMesh(scene, posterNode, "mt5_tex_43", 36);
  const decoration = indexedMesh(scene, posterNode, "mt5_tex_44", 8);
  const frontageObjects = indexedMesh(
    scene,
    objectNode,
    "mt5_tex_27",
    90,
  );
  const unrelatedNode = new BABYLON.TransformNode("node_other", scene);
  unrelatedNode._mt5Node = { addr: 0x12345 };
  unrelatedNode.parent = root;
  const unrelated = indexedMesh(scene, unrelatedNode, "mt5_tex_27", 90);
  const unrelatedIndices = Array.from(unrelated.getIndices());

  assert.equal(suppressDobuitaCinemaFacadeFaces([root]), 72);
  for (const faceId of [12, 13, 32, 35]) {
    const triangle = panel.getIndices().slice(faceId * 3, faceId * 3 + 3);
    assert.equal(new Set(triangle).size, 3);
  }

  createDobuitaCinemaPoster(scene, [root]);
  for (const faceId of [12, 13, 32, 35]) {
    const triangle = panel.getIndices().slice(faceId * 3, faceId * 3 + 3);
    assert.equal(new Set(triangle).size, 1);
  }
  assert.ok(scene.getMeshByName(DOBUITA_CINEMA_POSTER.name));
  assert.ok(scene.getMeshByName(DOBUITA_CINEMA_LOWER_POSTER.name));
  for (let faceId = 0; faceId < 8; faceId++) {
    const triangle = decoration.getIndices().slice(
      faceId * 3,
      faceId * 3 + 3,
    );
    assert.equal(new Set(triangle).size, 1);
  }
  const removedObjectFaces = [
    ...Array.from({ length: 32 }, (_value, index) => 20 + index),
    ...Array.from({ length: 16 }, (_value, index) => 56 + index),
    ...Array.from({ length: 16 }, (_value, index) => 74 + index),
  ];
  for (const faceId of removedObjectFaces) {
    const triangle = frontageObjects.getIndices().slice(
      faceId * 3,
      faceId * 3 + 3,
    );
    assert.equal(new Set(triangle).size, 1);
  }
  for (const faceId of [52, 53, 54, 55, 72, 73]) {
    const triangle = frontageObjects.getIndices().slice(
      faceId * 3,
      faceId * 3 + 3,
    );
    assert.equal(new Set(triangle).size, 3);
  }
  assert.deepEqual(Array.from(unrelated.getIndices()), unrelatedIndices);
  disposeDobuitaCinemaPoster();
  scene.dispose();
  engine.dispose();
});
