import assert from "node:assert/strict";
import test from "node:test";
import * as BABYLON from "@babylonjs/core";
import {
  mt7MapEffectDefinition,
  WORKERS_PIER_FOUNTAIN_EFFECT,
  WORKERS_PIER_FOUNTAIN_JETS_EFFECT,
} from "../src/Mt7MapEffects.js";
import { installWorldMt7MapEffect } from "../src/rendering/MapEffects.js";

test("the shared scene effect scrolls the fountain texture without rotating geometry", () => {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  const root = new BABYLON.Mesh("map18", scene);
  root._mt7MapEffectDefinition = WORKERS_PIER_FOUNTAIN_EFFECT;
  const material = new BABYLON.StandardMaterial("fountain", scene);
  material.diffuseTexture = new BABYLON.RawTexture(
    new Uint8Array([255, 255, 255, 255]),
    1,
    1,
    BABYLON.Engine.TEXTUREFORMAT_RGBA,
    scene,
  );
  const mesh = BABYLON.MeshBuilder.CreatePlane("fountain", {}, scene);
  mesh.metadata = {
    sourceTextureId: WORKERS_PIER_FOUNTAIN_EFFECT.textureId,
  };
  mesh.material = material;
  mesh.parent = root;
  const initialRotation = mesh.rotationQuaternion;

  const runtime = installWorldMt7MapEffect(root);
  runtime.update(2);

  assert.ok(Math.abs(material.diffuseTexture.uOffset - 0.62) < 1e-9);
  assert.equal(material.diffuseTexture.vOffset, 0);
  assert.equal(mesh.rotationQuaternion, initialRotation);
  assert.equal(scene.onBeforeRenderObservable.observers.length, 1);
  root.dispose();
  assert.equal(
    scene.onBeforeRenderObservable.observers[0]._willBeUnregistered,
    true,
  );
  scene.dispose();
  engine.dispose();
});

test("raw parser roots are inert until the shared scene loader installs their effect", () => {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  const root = new BABYLON.Mesh("viewer-map18", scene);
  root._mt7MapEffectDefinition = WORKERS_PIER_FOUNTAIN_EFFECT;

  assert.equal(root._worldMt7MapEffectRuntime, undefined);
  assert.equal(scene.onBeforeRenderObservable.observers.length, 0);
  root.dispose();
  scene.dispose();
  engine.dispose();
});

test("the shared scene effect gives MAP17 fountain jets their faster native texture flow", () => {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  const root = new BABYLON.Mesh("map17", scene);
  root._mt7MapEffectDefinition = WORKERS_PIER_FOUNTAIN_JETS_EFFECT;
  const material = new BABYLON.StandardMaterial("fountain-jets", scene);
  material.diffuseTexture = new BABYLON.RawTexture(
    new Uint8Array([255, 255, 255, 255]),
    1,
    1,
    BABYLON.Engine.TEXTUREFORMAT_RGBA,
    scene,
  );
  const mesh = BABYLON.MeshBuilder.CreatePlane("fountain-jets", {}, scene);
  mesh.metadata = {
    sourceTextureId: WORKERS_PIER_FOUNTAIN_JETS_EFFECT.textureId,
  };
  mesh.material = material;
  mesh.parent = root;

  const runtime = installWorldMt7MapEffect(root);
  runtime.update(2);

  assert.ok(Math.abs(material.diffuseTexture.uOffset - 0.3) < 1e-9);
  assert.equal(material.diffuseTexture.vOffset, 0);
  root.dispose();
  scene.dispose();
  engine.dispose();
});

test("play applies both native UV axes and wraps negative motion", () => {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  const root = new BABYLON.Mesh("map16", scene);
  root._mt7MapEffectDefinition = mt7MapEffectDefinition(
    "S2DC_D1_AR02_MPK00_MAP16.MT7",
    { textures: [], nodes: [] },
  );
  const material = new BABYLON.StandardMaterial("water", scene);
  material.diffuseTexture = new BABYLON.RawTexture(
    new Uint8Array([255, 255, 255, 255]),
    1,
    1,
    BABYLON.Engine.TEXTUREFORMAT_RGBA,
    scene,
  );
  const mesh = BABYLON.MeshBuilder.CreatePlane("water", {}, scene);
  mesh.material = material;
  mesh.parent = root;

  const runtime = installWorldMt7MapEffect(root);
  runtime.update(10);

  assert.ok(Math.abs(material.diffuseTexture.uOffset - 0.03) < 1e-9);
  assert.ok(Math.abs(material.diffuseTexture.vOffset - 0.045) < 1e-9);

  root._worldMt7MapEffectRuntime.dispose();
  root._worldMt7MapEffectRuntime = null;
  root._mt7MapEffectDefinition = {
    scrollUPerSecond: -1.2,
    scrollVPerSecond: 0,
  };
  const negativeRuntime = installWorldMt7MapEffect(root);
  negativeRuntime.update(0.25);
  assert.ok(Math.abs(material.diffuseTexture.uOffset - 0.73) < 1e-9);

  root.dispose();
  scene.dispose();
  engine.dispose();
});
