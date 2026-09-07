import * as BABYLON from "@babylonjs/core";
import { ClusteredLightContainer } from "@babylonjs/core/Lights/Clustered/clusteredLightContainer.js";
import nativeLightCatalog from "../../play/data/shenmue1-native-lights.json" with {
  type: "json",
};

const CLUSTERED_MATERIAL_LIGHTS = 5;
const FALLBACK_MATERIAL_LIGHTS = 8;
const FALLBACK_LOCAL_LIGHTS = 4;
const MATERIAL_WORK_BUDGET_MS = 8;

function yieldMaterialWork() {
  return globalThis.scheduler?.yield
    ? globalThis.scheduler.yield()
    : new Promise(resolve => setTimeout(resolve, 0));
}

function nativeVector(values) {
  return new BABYLON.Vector3(-values[0], values[1], values[2]);
}

function createNativePointLight(scene, area, record) {
  const light = new BABYLON.PointLight(
    `${area.toLowerCase()}_native_light_${record.slot}`,
    nativeVector(record.position),
    scene,
    true,
  );
  light.diffuse = BABYLON.Color3.FromArray(record.color);
  light.specular = light.diffuse.scale(0.15);
  light.intensity = Math.max(0, record.intensity);
  light.range = BABYLON.Scalar.Clamp(record.scalarA, 0.5, 24);
  light.radius = 0.08;
  light.renderPriority = 100;
  light.metadata = {
    ...(light.metadata || {}),
    nativeSceneLight: true,
    nativeArea: area,
    nativeLightRecord: record,
    experimentalRepresentation: "clustered-point",
  };
  return light;
}

export class NativeSceneLighting {
  constructor({ scene, getActorPosition = () => null }) {
    this.scene = scene;
    this.getActorPosition = getActorPosition;
    this.lights = [];
    this.cluster = null;
    this.mode = null;
    this.area = null;
    this.materialState = new Map();
    this.fallbackEnabled = new Set();
    this.generation = 0;
    this.preparing = false;
  }

  async create(world, { signal, yieldWork = yieldMaterialWork } = {}) {
    this.clear();
    signal?.throwIfAborted();
    const generation = this.generation;
    const area = world?.nativePointLightingArea;
    const catalogArea = nativeLightCatalog.areas[area];
    const records = catalogArea?.presets[catalogArea.initialPresetIndex]?.records
      || [];
    if (records.length === 0) return;

    this.area = area;
    this.lights = records.map(
      (record) => createNativePointLight(this.scene, area, record),
    );

    const cluster = new ClusteredLightContainer(
      `${area.toLowerCase()}_native_light_cluster`,
      [],
      this.scene,
    );
    cluster.renderPriority = 100;
    cluster.maxRange = Math.max(
      1,
      ...this.lights.map((light) => light.range),
    );
    if (cluster.isSupported) {
      for (const light of this.lights) cluster.addLight(light);
      this.cluster = cluster;
      this.mode = "clustered";
    } else {
      cluster.dispose(false, true);
      for (const light of this.lights) this.scene.addLight(light);
      this.mode = "fallback";
      for (const light of this.lights) light.setEnabled(false);
      this.updateFallbackLights(true);
    }
    // Babylon's light-budget setter scans scene submeshes. Do not add an
    // unconditional unfreeze + markAsDirty (two more full scans per material).
    // Yield between bounded batches, and keep world readiness pending until
    // every material is configured. Never render a "finished" half-lit world.
    this.preparing = true;
    try {
      while (!this.configureMaterials()) {
        await yieldWork();
        signal?.throwIfAborted();
        if (generation !== this.generation) {
          throw new DOMException("Scene lighting was superseded", "AbortError");
        }
      }
    } finally {
      if (generation === this.generation) this.preparing = false;
    }
  }

  configureMaterials() {
    if (!this.mode) return true;
    const started = performance.now();
    const required = this.mode === "clustered"
      ? CLUSTERED_MATERIAL_LIGHTS
      : FALLBACK_MATERIAL_LIGHTS;
    for (const material of this.scene.materials) {
      if (!("maxSimultaneousLights" in material)) continue;
      if (material.maxSimultaneousLights >= required) continue;
      if (!this.materialState.has(material)) {
        this.materialState.set(material, {
          maxSimultaneousLights: material.maxSimultaneousLights,
          frozen: material.isFrozen === true,
        });
      }
      if (material.isFrozen) material.unfreeze();
      material.maxSimultaneousLights = required;
      if (performance.now() - started >= MATERIAL_WORK_BUDGET_MS) return false;
    }
    return true;
  }

  updateFallbackLights(force = false) {
    if (this.mode !== "fallback") return;
    const actorPosition = this.getActorPosition() || BABYLON.Vector3.Zero();
    const nearest = new Set(
      [...this.lights]
        .sort((a, b) => (
          BABYLON.Vector3.DistanceSquared(a.position, actorPosition)
          - BABYLON.Vector3.DistanceSquared(b.position, actorPosition)
        ))
        .slice(0, FALLBACK_LOCAL_LIGHTS),
    );
    if (
      !force
      && nearest.size === this.fallbackEnabled.size
      && [...nearest].every((light) => this.fallbackEnabled.has(light))
    ) return;
    for (const light of this.fallbackEnabled) {
      if (!nearest.has(light)) light.setEnabled(false);
    }
    for (const light of nearest) {
      if (!this.fallbackEnabled.has(light)) light.setEnabled(true);
    }
    this.fallbackEnabled = nearest;
  }

  update() {
    if (!this.preparing) this.configureMaterials();
    this.updateFallbackLights();
  }

  clear() {
    this.generation++;
    this.preparing = false;
    if (this.cluster) this.cluster.dispose(false, true);
    else for (const light of this.lights) light.dispose();
    this.cluster = null;
    this.lights = [];
    this.mode = null;
    this.area = null;
    this.fallbackEnabled.clear();

    const remainingMaterials = new Set(this.scene.materials);
    for (const [material, previous] of this.materialState) {
      if (!remainingMaterials.has(material)) continue;
      if (material.isFrozen) material.unfreeze();
      material.maxSimultaneousLights = previous.maxSimultaneousLights;
      if (previous.frozen) material.freeze?.();
    }
    this.materialState.clear();
  }

  dispose() {
    this.clear();
  }
}
