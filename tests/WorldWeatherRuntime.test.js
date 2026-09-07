import assert from "node:assert/strict";
import test from "node:test";
import * as BABYLON from "@babylonjs/core";

import { WorldWeatherRuntime } from "../play/world/WorldWeatherRuntime.js";

test("world weather owns precipitation and follows the active camera", () => {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  const camera = new BABYLON.FreeCamera(
    "camera",
    new BABYLON.Vector3(4, 5, 6),
    scene,
  );
  scene.activeCamera = camera;
  const runtime = new WorldWeatherRuntime({ scene });
  try {
    assert.equal(runtime.apply("snow"), true);
    assert.equal(runtime.weather, "snow");
    assert.ok(runtime.particles?.isStarted());
    assert.equal(runtime.particles.emitRate, 780);
    assert.equal(runtime.particles.minLifeTime, 12);
    assert.equal(runtime.particles.maxLifeTime, 14);
    assert.equal(runtime.particles.getCapacity(), 11000);
    assert.ok(runtime.particles.getActiveCount() > 9000);
    scene.onBeforeRenderObservable.notifyObservers(scene);
    assert.deepEqual(runtime.emitter.position.asArray(), [4, 5, 6]);

    assert.equal(runtime.apply("snow"), false);
    assert.equal(runtime.apply("clear"), true);
    assert.equal(runtime.particles, null);
    assert.equal(runtime.weather, "clear");
  } finally {
    runtime.dispose();
    scene.dispose();
    engine.dispose();
  }
});

test("camera cuts carry the populated precipitation volume into the new shot", () => {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  const camera = new BABYLON.FreeCamera(
    "camera",
    new BABYLON.Vector3(0, 5, 0),
    scene,
  );
  scene.activeCamera = camera;
  const runtime = new WorldWeatherRuntime({ scene });
  try {
    assert.equal(runtime.apply("snow"), true);
    const particles = runtime.particles;
    const activeCount = particles.getActiveCount();
    const original = particles.particles[0].position.clone();

    camera.position.set(30, 9, -20);
    scene.onBeforeRenderObservable.notifyObservers(scene);

    assert.equal(runtime.particles, particles);
    assert.equal(particles.getActiveCount(), activeCount);
    assert.deepEqual(
      particles.particles[0].position.asArray(),
      original.add(new BABYLON.Vector3(30, 4, -20)).asArray(),
    );
    assert.deepEqual(runtime.emitter.position.asArray(), [30, 9, -20]);
  } finally {
    runtime.dispose();
    scene.dispose();
    engine.dispose();
  }
});

test("invalid and non-precipitating weather remain particle-free", () => {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  const runtime = new WorldWeatherRuntime({ scene });
  try {
    assert.equal(runtime.apply("overcast"), true);
    assert.equal(runtime.weather, "overcast");
    assert.equal(runtime.particles, null);
    assert.equal(scene.fogMode, BABYLON.Scene.FOGMODE_EXP2);
    assert.equal(runtime.apply("overcast"), false);
    assert.equal(runtime.apply("unknown"), true);
    assert.equal(runtime.weather, "clear");
    assert.equal(scene.fogMode, BABYLON.Scene.FOGMODE_NONE);
  } finally {
    runtime.dispose();
    scene.dispose();
    engine.dispose();
  }
});

test("precipitation terminates at physical surfaces even when a cutaway hides them", () => {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  const camera = new BABYLON.FreeCamera(
    "camera",
    BABYLON.Vector3.Zero(),
    scene,
  );
  scene.activeCamera = camera;
  const roof = BABYLON.MeshBuilder.CreateBox("roof", {
    width: 10,
    height: 0.5,
    depth: 10,
  }, scene);
  roof.position.y = 3;
  roof.isPickable = true;
  roof.metadata = { cameraBlocker: true };
  roof.computeWorldMatrix(true);
  const runtime = new WorldWeatherRuntime({ scene });
  try {
    assert.equal(runtime.setOccluders([roof]), 1);
    // Cutscene map-layer visibility is a rendering concern. The captured roof
    // remains a physical weather surface while hidden for a camera cutaway.
    roof.setEnabled(false);
    assert.equal(runtime.apply("snow"), true);
    assert.equal(runtime.particles.isStarted(), true);
    assert.equal(runtime.particles.emitRate, 780);
    assert.ok(runtime.particles.getActiveCount() > 0);

    const beneathRoof = runtime.particles.particles.filter(particle => (
      Math.abs(particle.position.x) < 4
      && Math.abs(particle.position.z) < 4
    ));
    assert.ok(beneathRoof.length > 0);
    assert.ok(beneathRoof.every(particle => (
      particle.position.y >= 3.24 || particle.color.a === 0
    )));

    camera.position.x = 20;
    scene.onBeforeRenderObservable.notifyObservers(scene);
    assert.equal(runtime.particles.isStarted(), true);
    assert.equal(runtime.particles.emitRate, 780);
    assert.ok(runtime.particles.getActiveCount() > 9000);
  } finally {
    runtime.dispose();
    scene.dispose();
    engine.dispose();
  }
});
