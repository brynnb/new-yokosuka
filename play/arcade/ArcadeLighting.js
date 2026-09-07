import * as BABYLON from "@babylonjs/core";
import { ClusteredLightContainer } from "@babylonjs/core/Lights/Clustered/clusteredLightContainer.js";

const TV_LIGHT_COLORS = Object.freeze([
  Object.freeze([1, 0.94, 0.88]),
  Object.freeze([0.9, 0.95, 1]),
  Object.freeze([0.93, 1, 0.94]),
  Object.freeze([1, 0.91, 0.96]),
  Object.freeze([0.96, 0.97, 1]),
]);

export class ArcadeLighting {
  constructor({
    scene,
    cabinetDefinitions,
    pointLights = [],
    spotLights,
    worldId,
    getCurrentMeshes,
    getSkybox,
  }) {
    this.scene = scene;
    this.cabinetDefinitions = cabinetDefinitions;
    this.pointLights = pointLights;
    this.spotLights = spotLights;
    this.worldId = worldId;
    this.getCurrentMeshes = getCurrentMeshes;
    this.getSkybox = getSkybox;
    this.lights = [];
    this.cluster = null;
    this.performanceLightsEnabled = true;
  }

  setPerformanceLightsEnabled(enabled) {
    this.performanceLightsEnabled = Boolean(enabled);
    for (const light of this.lights) {
      light.setEnabled(this.performanceLightsEnabled);
    }
  }

  targetMeshes(definition) {
    let nearest = null;
    if (definition.targetSourceFilename && definition.targetCenter) {
      const targetCenter = BABYLON.Vector3.FromArray(definition.targetCenter);
      const roots = this.getCurrentMeshes().filter(
        (candidate) => (
          candidate._filename === definition.targetSourceFilename
        ),
      );
      nearest = roots.map((root) => {
        root.computeWorldMatrix(true);
        for (const node of root.getDescendants(false)) {
          node.computeWorldMatrix?.(true);
        }
        const bounds = root.getHierarchyBoundingVectors(true);
        const center = bounds.min.add(bounds.max).scale(0.5);
        return {
          root,
          distance: BABYLON.Vector3.DistanceSquared(center, targetCenter),
        };
      }).sort((left, right) => left.distance - right.distance)[0]?.root;
    }
    const targets = new Set(
      nearest?.getChildMeshes(false).filter(
        (mesh) => mesh.getTotalVertices() > 0 && mesh.material,
      ) || [],
    );
    const position = BABYLON.Vector3.FromArray(definition.position);
    const radius = Math.max(0.5, Number(definition.range) || 0) + 0.25;
    const radiusSquared = radius ** 2;
    for (const mesh of this.scene.meshes) {
      if (
        !mesh.isEnabled()
        || mesh.getTotalVertices() <= 0
        || !mesh.material
        || mesh === this.getSkybox()
        || mesh.metadata?.blendedSkyDome
        || mesh.metadata?.lightDebug
        || mesh.metadata?.collisionDebug
      ) continue;
      mesh.computeWorldMatrix(true);
      mesh.refreshBoundingInfo?.();
      const { minimumWorld, maximumWorld } = (
        mesh.getBoundingInfo().boundingBox
      );
      const dx = Math.max(
        minimumWorld.x - position.x,
        0,
        position.x - maximumWorld.x,
      );
      const dy = Math.max(
        minimumWorld.y - position.y,
        0,
        position.y - maximumWorld.y,
      );
      const dz = Math.max(
        minimumWorld.z - position.z,
        0,
        position.z - maximumWorld.z,
      );
      if (dx * dx + dy * dy + dz * dz <= radiusSquared) targets.add(mesh);
    }
    return [...targets];
  }

  refreshTargets(light) {
    const definition = light.metadata?.arcadeFixtureDefinition;
    if (!definition) return;
    const targetMeshes = this.targetMeshes({
      ...definition,
      position: light.position.asArray(),
      direction: light.direction?.asArray(),
      range: light.range,
    });
    light.includedOnlyMeshes = targetMeshes;
    const materials = new Set(
      targetMeshes.map((mesh) => mesh.material).filter(Boolean),
    );
    for (const material of materials) {
      material.unfreeze?.();
      if ("maxSimultaneousLights" in material) {
        material.maxSimultaneousLights = 8;
      }
      material.markAsDirty?.(BABYLON.Material.LightDirtyFlag);
    }
    for (const mesh of targetMeshes) mesh._resyncLightSources?.();
    light.metadata.targetMeshCount = targetMeshes.length;
  }

  create(activeWorldId) {
    this.dispose();
    if (activeWorldId !== this.worldId) return;
    for (const material of this.scene.materials) {
      if ("maxSimultaneousLights" in material) {
        material.maxSimultaneousLights = 8;
      }
    }
    for (const [gameId, definition] of Object.entries(
      this.cabinetDefinitions,
    )) {
      const definitionWorldId = definition.worldId || this.worldId;
      if (
        definitionWorldId !== activeWorldId
        || definition.screenGlow === false
      ) continue;
      const normal = BABYLON.Vector3.FromArray(
        definition.frontNormal,
      ).normalize();
      const position = BABYLON.Vector3.FromArray(definition.center)
        .add(normal.scale(0.14));
      const light = new BABYLON.PointLight(
        `${gameId}_screen_glow`,
        position,
        this.scene,
      );
      light.diffuse = new BABYLON.Color3(1, 0.97, 0.92);
      light.specular = new BABYLON.Color3(0.18, 0.18, 0.18);
      light.intensity = 1;
      light.range = 2.25;
      light.radius = 0.12;
      light.renderPriority = 100;
      light.metadata = {
        ...(light.metadata || {}),
        arcadeScreenGlow: true,
        gameId,
        arcadeFixtureDefinition: {
          position: position.asArray(),
          range: light.range,
        },
      };
      this.refreshTargets(light);
      this.lights.push(light);
      light.setEnabled(this.performanceLightsEnabled);
    }
    for (const definition of this.pointLights) {
      const light = new BABYLON.PointLight(
        definition.name,
        BABYLON.Vector3.FromArray(definition.position),
        this.scene,
      );
      light.diffuse = BABYLON.Color3.FromArray(definition.color);
      light.specular = light.diffuse.scale(0.3);
      light.intensity = definition.intensity;
      light.range = definition.range;
      light.radius = definition.radius;
      light.renderPriority = 100;
      light.metadata = {
        ...(light.metadata || {}),
        arcadeFixtureLight: true,
        arcadeFixtureDefinition: definition,
      };
      this.refreshTargets(light);
      this.lights.push(light);
      light.setEnabled(this.performanceLightsEnabled);
    }
    const pointLights = this.lights.filter(
      (light) => light.getClassName() === "PointLight",
    );
    const cluster = new ClusteredLightContainer(
      "you_arcade_machine_light_cluster",
      [],
      this.scene,
    );
    if (cluster.isSupported) {
      cluster.renderPriority = 100;
      cluster.maxRange = Math.max(
        1,
        ...pointLights.map((light) => light.range),
      );
      for (const light of pointLights) cluster.addLight(light);
      this.cluster = cluster;
    } else {
      cluster.dispose(false, true);
    }
    for (const definition of this.spotLights) {
      const light = new BABYLON.SpotLight(
        definition.name,
        BABYLON.Vector3.FromArray(definition.position),
        BABYLON.Vector3.FromArray(definition.direction).normalize(),
        definition.angle,
        definition.exponent,
        this.scene,
      );
      light.diffuse = new BABYLON.Color3(1, 1, 1);
      light.specular = new BABYLON.Color3(0.3, 0.3, 0.3);
      light.intensity = definition.intensity;
      light.range = definition.range;
      light.radius = 0.08;
      light.renderPriority = 100;
      light.metadata = {
        ...(light.metadata || {}),
        arcadeFixtureLight: true,
        arcadeFixtureDefinition: definition,
        targetMeshCount: 0,
        televisionFlicker: definition.televisionFlicker
          ? {
            baseIntensity: definition.intensity,
            fromIntensity: definition.intensity,
            targetIntensity: definition.intensity,
            fromColor: BABYLON.Color3.White(),
            targetColor: BABYLON.Color3.White(),
            transitionElapsed: 0,
            transitionDuration: 0,
            holdRemaining: 0.5 + Math.random() * 3.5,
          }
          : null,
      };
      this.refreshTargets(light);
      this.lights.push(light);
      light.setEnabled(this.performanceLightsEnabled);
    }
  }

  beginTvChange(light, flicker) {
    const color = TV_LIGHT_COLORS[
      Math.floor(Math.random() * TV_LIGHT_COLORS.length)
    ];
    const targetIntensity = flicker.baseIntensity
      * (0.72 + Math.random() * 0.56);
    const targetColor = BABYLON.Color3.FromArray(color);
    flicker.targetIntensity = targetIntensity;
    flicker.targetColor = targetColor;
    flicker.transitionElapsed = 0;
    flicker.holdRemaining = 0.5 + Math.random() * 3.5;
    if (Math.random() < 0.75) {
      flicker.fromIntensity = targetIntensity;
      flicker.fromColor = targetColor.clone();
      flicker.transitionDuration = 0;
      light.intensity = targetIntensity;
      light.diffuse.copyFrom(targetColor);
      light.specular.copyFrom(targetColor).scaleInPlace(0.3);
      return;
    }
    flicker.fromIntensity = light.intensity;
    flicker.fromColor = light.diffuse.clone();
    flicker.transitionDuration = 0.12 + Math.random() * 0.38;
  }

  update(deltaSeconds, activeWorldId) {
    if (
      activeWorldId !== this.worldId
      || !this.performanceLightsEnabled
    ) return;
    for (const light of this.lights) {
      const flicker = light.metadata?.televisionFlicker;
      if (!flicker) continue;
      if (flicker.transitionElapsed < flicker.transitionDuration) {
        flicker.transitionElapsed = Math.min(
          flicker.transitionDuration,
          flicker.transitionElapsed + Math.max(0, deltaSeconds),
        );
        const progress = flicker.transitionDuration > 0
          ? flicker.transitionElapsed / flicker.transitionDuration
          : 1;
        const eased = progress * progress * (3 - 2 * progress);
        light.intensity = flicker.fromIntensity
          + (flicker.targetIntensity - flicker.fromIntensity) * eased;
        light.diffuse.copyFrom(BABYLON.Color3.Lerp(
          flicker.fromColor,
          flicker.targetColor,
          eased,
        ));
        light.specular.copyFrom(light.diffuse).scaleInPlace(0.3);
      } else {
        flicker.holdRemaining -= Math.max(0, deltaSeconds);
        if (flicker.holdRemaining <= 0) this.beginTvChange(light, flicker);
      }
    }
  }

  dispose() {
    const clusteredLights = new Set(this.cluster?.lights || []);
    this.cluster?.dispose(false, true);
    this.cluster = null;
    for (const light of this.lights.splice(0)) {
      if (!clusteredLights.has(light)) light.dispose();
    }
  }
}
