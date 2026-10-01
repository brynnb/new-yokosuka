import { Color3, Color4, Layer, RawTexture } from "@babylonjs/core";

function requireText(value, label) {
  if (typeof value !== "string" || !value.trim()) {
    throw new TypeError(`${label} must be non-empty text`);
  }
  return value.trim();
}

function requireAddress(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`${label} must be a non-negative integer`);
  }
  return value;
}

export class NativeAseqMapLayerRuntime {
  constructor({ definitions = [], geometryMasks = [], scene = null, acquireEnvironmentIsolation = null,
    acquireActivityLighting = null } = {}) {
    if (!Array.isArray(definitions)) {
      throw new TypeError("AUTH map visibility requires generated definitions");
    }
    this.definitions = new Map();
    const filenames = new Set();
    for (const value of definitions) {
      const nativeName = requireText(value?.nativeName, "AUTH map visibility name");
      if (this.definitions.has(nativeName)) {
        throw new Error(`AUTH map visibility model ${nativeName} is duplicated`);
      }
      const browserFilename = requireText(
        value.browserFilename,
        `AUTH map visibility ${nativeName} browser filename`,
      );
      const normalizedFilename = browserFilename.toUpperCase();
      if (filenames.has(normalizedFilename)) {
        throw new Error(`AUTH map visibility filename ${browserFilename} is duplicated`);
      }
      filenames.add(normalizedFilename);
      this.definitions.set(nativeName, Object.freeze({
        nativeName,
        browserFilename,
      }));
    }
    if (!Array.isArray(geometryMasks)) {
      throw new TypeError("AUTH map geometry masks must be an array");
    }
    this.geometryMasks = Object.freeze(geometryMasks.map((value, index) => (
      Object.freeze({
        browserFilename: requireText(
          value?.browserFilename,
          `AUTH map geometry mask ${index} browser filename`,
        ),
        nodeAddress: requireAddress(
          value?.nodeAddress,
          `AUTH map geometry mask ${index} node address`,
        ),
      })
    )));
    this.roots = new Map();
    this.maskedGeometry = [];
    this.active = null;
    this.scene = scene;
    this.background = null;
    this.worldRoots = [];
    this.acquireEnvironmentIsolation = acquireEnvironmentIsolation;
    this.releaseEnvironmentIsolation = null;
    this.acquireActivityLighting = acquireActivityLighting;
    this.releaseActivityLighting = null;
    this.lightingPresetIndex = null;
    this.lightingSnapshot = null;
  }

  load(roots) {
    if (!Array.isArray(roots)) {
      throw new TypeError("AUTH map visibility requires loaded world roots");
    }
    this.clear();
    this.worldRoots = roots;
    for (const [nativeName, definition] of this.definitions) {
      const matches = roots.filter(root => (
        root?._filename?.toUpperCase() === definition.browserFilename.toUpperCase()
      ));
      if (matches.length !== 1) {
        throw new Error(
          `AUTH map visibility ${nativeName} expected one ${definition.browserFilename}; `
          + `found ${matches.length}`,
        );
      }
      this.roots.set(nativeName, matches[0]);
    }
    for (const mask of this.geometryMasks) {
      const rootsForMask = roots.filter(root => (
        root?._filename?.toUpperCase() === mask.browserFilename.toUpperCase()
      ));
      if (rootsForMask.length !== 1) {
        throw new Error(
          `AUTH map geometry expected one ${mask.browserFilename}; `
          + `found ${rootsForMask.length}`,
        );
      }
      const nodes = (rootsForMask[0]._mt5Nodes || []).filter(
        node => node?.addr === mask.nodeAddress,
      );
      if (nodes.length !== 1) {
        throw new Error(
          `AUTH map geometry ${mask.browserFilename} expected node `
          + `0x${mask.nodeAddress.toString(16)}; found ${nodes.length}`,
        );
      }
      const mesh = nodes[0].mesh;
      if (typeof mesh?.setEnabled !== "function") {
        throw new Error(
          `AUTH map geometry ${mask.browserFilename} node `
          + `0x${mask.nodeAddress.toString(16)} cannot be hidden`,
        );
      }
      this.maskedGeometry.push({
        mesh,
        enabled: mesh.isEnabled?.() !== false,
      });
      mesh.setEnabled(false);
      mesh.computeWorldMatrix?.(true);
    }
    return this.roots.size;
  }

  applyActivity(activity) {
    if (!activity?.activityId || !Array.isArray(activity.browserMapVisibility)) {
      throw new TypeError("AUTH activity has no generated browser map visibility");
    }
    if (this.roots.size !== this.definitions.size) {
      throw new Error("AUTH map visibility models are not loaded");
    }
    const states = new Map();
    for (const state of activity.browserMapVisibility) {
      const nativeName = state?.nativeName;
      const definition = this.definitions.get(nativeName);
      if (
        !definition
        || typeof state.visible !== "boolean"
        || states.has(nativeName)
      ) {
        throw new Error(`AUTH activity ${activity.activityId} has invalid browser map visibility`);
      }
      states.set(nativeName, state.visible);
    }
    if (states.size !== this.definitions.size) {
      throw new Error(`AUTH activity ${activity.activityId} has incomplete browser map visibility`);
    }
    const color = activity.browserBackgroundColor;
    const lightingPresetIndex = activity.browserLightingPresetIndex ?? null;
    if (lightingPresetIndex !== null && (!Number.isInteger(lightingPresetIndex)
      || lightingPresetIndex < 0 || lightingPresetIndex > 3 || !this.acquireActivityLighting)) {
      throw new Error(`AUTH activity ${activity.activityId} has invalid lighting ownership`);
    }
    if (activity.browserIsolatedEnvironment !== undefined && typeof activity.browserIsolatedEnvironment !== "boolean") {
      throw new Error(`AUTH activity ${activity.activityId} has invalid environment isolation`);
    }
    if (activity.browserIsolatedStage !== undefined && typeof activity.browserIsolatedStage !== "boolean") {
      throw new Error(`AUTH activity ${activity.activityId} has invalid isolated-stage state`);
    }
    if (color !== undefined && (!this.scene || !Array.isArray(color)
      || color.length !== 4 || !color.every(value => Number.isFinite(value) && value >= 0 && value <= 1))) {
      throw new Error(`AUTH activity ${activity.activityId} has invalid background color`);
    }
    this.active ||= {
      snapshots: new Map([...this.roots].map(([nativeName, root]) => [
        nativeName,
        root.isEnabled?.() !== false,
      ])),
      activityId: null,
      residentSnapshots: null,
    };
    if (lightingPresetIndex !== this.lightingPresetIndex) {
      this.#restoreLighting();
      this.releaseActivityLighting?.();
      this.releaseActivityLighting = null;
      this.lightingPresetIndex = lightingPresetIndex;
      if (lightingPresetIndex !== null) this.releaseActivityLighting = this.acquireActivityLighting(lightingPresetIndex);
    }
    const isolateEnvironment = activity.browserIsolatedStage || activity.browserIsolatedEnvironment;
    if (isolateEnvironment && !this.releaseEnvironmentIsolation) {
      this.releaseEnvironmentIsolation = this.acquireEnvironmentIsolation?.() ?? null;
    } else if (!isolateEnvironment && this.releaseEnvironmentIsolation) {
      this.releaseEnvironmentIsolation();
      this.releaseEnvironmentIsolation = null;
    }
    // An isolated cinematic stage borrows the loaded world as an asset source,
    // not as scenery. Snapshot all resident roots (including placed room props),
    // leaving package-owned actors and scenery outside this list untouched.
    if (activity.browserIsolatedStage && !this.active.residentSnapshots) {
      this.active.residentSnapshots = this.worldRoots.map(root => [root, root.isEnabled?.() !== false]);
    } else if (!activity.browserIsolatedStage && this.active.residentSnapshots) {
      for (const [root, enabled] of this.active.residentSnapshots) root.setEnabled(enabled);
      this.active.residentSnapshots = null;
    }
    for (const [nativeName, definition] of this.definitions) {
      const root = this.roots.get(nativeName);
      root.setEnabled(states.get(nativeName));
      root.computeWorldMatrix?.(true);
      root.metadata = {
        ...(root.metadata || {}),
        nativeAseqMapVisibilityModel: definition.nativeName,
      };
    }
    this.active.activityId = activity.activityId;
    if (activity.browserIsolatedStage) {
      for (const root of this.worldRoots) root.setEnabled(false);
    }
    // A background layer is independent of the gameplay clock's clear-color
    // updates. It cannot cover actors/terrain like a foreground fade overlay.
    if (color) {
      if (!this.background) {
        this.background = new Layer("native-activity-background", null, this.scene, true);
        // Layer shaders always sample a texture, even for a flat color.
        this.background.texture = RawTexture.CreateRGBATexture(
          new Uint8Array([255, 255, 255, 255]), 1, 1, this.scene, false, false,
        );
      }
      this.background.color = Color4.FromArray(color);
    } else {
      this.background?.dispose();
      this.background = null;
    }
    return true;
  }

  applyLightingCue(cue) {
    if (!this.active || !this.scene || !Array.isArray(cue?.ambientColor)
      || cue.ambientColor.length !== 3 || !cue.ambientColor.every(value => Number.isFinite(value) && value >= 0)
      || !Number.isFinite(cue.directionalIntensity) || cue.directionalIntensity < 0) {
      throw new Error("AUTH activity lighting cue is invalid");
    }
    this.lightingSnapshot ||= {
      ambientColor: this.scene.ambientColor.clone(), baseline: [...cue.ambientColor],
      lights: this.scene.lights.map(light => ({ light, intensity: light.intensity })),
    };
    // Preserve the native flash contrast against the selected browser lighting
    // preset. Dreamcast light units are not Babylon light units; relative
    // intensity is a deliberate presentation approximation, not a new clock.
    this.scene.ambientColor = Color3.FromArray(cue.ambientColor);
    const baseline = this.lightingSnapshot.baseline.reduce((sum, value) => sum + value, 0);
    const ambientRatio = baseline > 0 ? cue.ambientColor.reduce((sum, value) => sum + value, 0) / baseline : 1;
    for (const { light, intensity } of this.lightingSnapshot.lights) {
      const type = light.getClassName();
      if (type === "DirectionalLight") light.intensity = intensity * cue.directionalIntensity;
      else if (type === "HemisphericLight") light.intensity = intensity * ambientRatio;
    }
    return true;
  }

  #restoreLighting() {
    if (!this.lightingSnapshot) return;
    this.scene.ambientColor = this.lightingSnapshot.ambientColor;
    for (const { light, intensity } of this.lightingSnapshot.lights) {
      if (!light.isDisposed()) light.intensity = intensity;
    }
    this.lightingSnapshot = null;
  }

  end() {
    this.background?.dispose();
    this.background = null;
    if (!this.active) return true;
    for (const [root, enabled] of this.active.residentSnapshots || []) {
      if (!root.isDisposed?.()) root.setEnabled(enabled);
    }
    for (const [nativeName, enabled] of this.active.snapshots) {
      const root = this.roots.get(nativeName);
      if (!root?.isDisposed?.()) {
        root.setEnabled(enabled);
        root.computeWorldMatrix?.(true);
      }
    }
    this.active = null;
    // Restore borrowed values before the environment owner reapplies current
    // server time/weather. Reversing this order can overwrite its fresh state.
    this.#restoreLighting();
    this.releaseEnvironmentIsolation?.();
    this.releaseEnvironmentIsolation = null;
    this.releaseActivityLighting?.();
    this.releaseActivityLighting = null;
    this.lightingPresetIndex = null;
    return true;
  }

  clear() {
    this.end();
    for (const { mesh, enabled } of this.maskedGeometry) {
      if (!mesh?.isDisposed?.()) {
        mesh.setEnabled(enabled);
        mesh.computeWorldMatrix?.(true);
      }
    }
    this.maskedGeometry = [];
    this.roots.clear();
    this.worldRoots = [];
  }
}

export function createNativeAseqMapLayerRuntime(options) {
  return new NativeAseqMapLayerRuntime(options);
}
