import assert from "node:assert/strict";
import test from "node:test";
import { Color3, NullEngine, Scene, StandardMaterial } from "@babylonjs/core";
import state from "../src/state.js";
import { applyLightingPreset, clearStoryAmbientFill, createLights } from "../src/lighting.js";
import { SceneStandardMaterial } from "../src/rendering/SceneStandardMaterial.js";
import { timeOfDayPresets } from "../src/constants.js";

test("Story ambient fill applies to default MT materials and restores their original values", () => {
  const names = ["scene", "hemiLight", "skyLight", "directLight", "fillLight", "currentWeather"];
  const previous = Object.fromEntries(names.map(name => [name, state[name]]));
  const engine = new NullEngine();
  const scene = new Scene(engine);
  try {
    state.scene = scene; state.currentWeather = "clear"; createLights(scene);
    const world = new SceneStandardMaterial("prepared-world", scene);
    const actor = new SceneStandardMaterial("actor", scene);
    const authored = new SceneStandardMaterial("authored", scene);
    authored.ambientColor = new Color3(.2, .1, .3);
    const other = new StandardMaterial("non-mt-ui", scene);
    const night = timeOfDayPresets[3].lighting;
    applyLightingPreset(night, .16);
    for (const material of [world, actor]) {
      const contribution = material.ambientColor.multiply(scene.ambientColor);
      for (const channel of contribution.asArray()) assert.ok(Math.abs(channel - .16) < 1e-9);
    }
    assert.deepEqual(authored.ambientColor.asArray(), [.2,.1,.3]);
    assert.deepEqual(other.ambientColor.asArray(), [0,0,0]);
    const lateActor = new SceneStandardMaterial("late-actor", scene);
    applyLightingPreset(night, .16);
    assert.ok(lateActor.ambientColor.r > 0, "late-loaded actors receive the same fill");
    clearStoryAmbientFill();
    for (const material of [world, actor, lateActor]) assert.deepEqual(material.ambientColor.asArray(), [0,0,0]);
    applyLightingPreset(night, .16);
    applyLightingPreset(night);
    for (const material of [world, actor, lateActor]) assert.deepEqual(material.ambientColor.asArray(), [0,0,0]);
    assert.deepEqual(authored.ambientColor.asArray(), [.2,.1,.3]);
    applyLightingPreset(night, .16);
    actor.ambientColor = new Color3(.4,.3,.2);
    applyLightingPreset(night, .16);
    clearStoryAmbientFill();
    assert.deepEqual(actor.ambientColor.asArray(), [.4,.3,.2], "newer material ownership survives cleanup");
  } finally {
    scene.dispose(); engine.dispose();
    for (const name of names) state[name] = previous[name];
  }
});
