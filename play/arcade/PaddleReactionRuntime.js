import * as BABYLON from "@babylonjs/core";
import {
  PADDLE_BETWEEN_ROUNDS_SECONDS,
  PaddleReactionGame,
} from "../../src/PaddleReactionGame.js";

const PADDLE_MODEL = "S3_DGCT_BIGM401G.MT5";
const PADDLE_TAGS = Object.freeze(["MIT1", "MIT2", "MIT3"]);
const LAMP_MODEL = "S3_DGCT_BIGM402G.MT5";
const LAMP_TAGS = Object.freeze(["QTL1", "QTL2", "QTL3"]);
const LAMP_COLOR = BABYLON.Color3.FromHexString("#ac589b");
const RAISE_RADIANS = BABYLON.Tools.ToRadians(55);
export const PADDLE_END_FLASH_SECONDS = 5;
const FLASH_INTERVAL_SECONDS = 0.25;

export function paddleReactionIndexForMesh(mesh) {
  for (let node = mesh; node; node = node.parent) {
    const index = node.metadata?.paddleReactionIndex;
    if (Number.isInteger(index) && index >= 0 && index < 3) return index;
  }
  return null;
}

export function paddleRoundLampStates(state) {
  if (
    state?.over
    && Number.isFinite(state.endFlashElapsed)
    && state.endFlashElapsed < PADDLE_END_FLASH_SECONDS
  ) {
    const flashOn = Math.floor(
      state.endFlashElapsed / FLASH_INTERVAL_SECONDS,
    ) % 2 === 0;
    return [flashOn, flashOn, flashOn];
  }
  if (state?.phase === "between-rounds") {
    const elapsed = Math.max(
      0,
      PADDLE_BETWEEN_ROUNDS_SECONDS - state.phaseTimeLeft,
    );
    const flashOn = Math.floor(
      elapsed / 0.25,
    ) % 2 === 0;
    return [flashOn, flashOn, flashOn];
  }
  const activeCount = state
    ? Math.max(1, Math.min(3, 4 - state.round))
    : 3;
  return [0, 1, 2].map((index) => index < activeCount);
}

export function paddleEndFlashVisibility(state) {
  const flashOn = Math.floor(
    Math.max(0, Number(state?.endFlashElapsed) || 0)
      / FLASH_INTERVAL_SECONDS,
  ) % 2 === 0;
  return {
    score: flashOn,
    lastScore: flashOn,
    highScore: state?.newHighScore ? flashOn : true,
  };
}

function distanceSquaredToBounds(point, bounds) {
  const { minimumWorld, maximumWorld } = bounds.boundingBox;
  const dx = Math.max(
    minimumWorld.x - point.x,
    0,
    point.x - maximumWorld.x,
  );
  const dy = Math.max(
    minimumWorld.y - point.y,
    0,
    point.y - maximumWorld.y,
  );
  const dz = Math.max(
    minimumWorld.z - point.z,
    0,
    point.z - maximumWorld.z,
  );
  return dx * dx + dy * dy + dz * dz;
}

function localLampTargets(scene, position, range) {
  const rangeSquared = range ** 2;
  return scene.meshes.filter((mesh) => {
    if (
      !mesh.isEnabled()
      || mesh.getTotalVertices?.() <= 0
      || !mesh.material
      || mesh.metadata?.blendedSkyDome
      || mesh.metadata?.lightDebug
      || mesh.metadata?.collisionDebug
    ) return false;
    mesh.computeWorldMatrix?.(true);
    mesh.refreshBoundingInfo?.();
    const bounds = mesh.getBoundingInfo();
    const size = bounds.boundingBox.extendSizeWorld.scale(2);
    // These small indicator lights should illuminate the cabinet, not consume
    // one of the eight light slots on room-spanning walls and floors.
    if (Math.max(size.x, size.y, size.z) > 5) return false;
    return distanceSquaredToBounds(position, bounds) <= rangeSquared;
  });
}

export class PaddleReactionRuntime {
  constructor({
    game = new PaddleReactionGame(),
    onScoreChanged = () => {},
    onEndFlashChanged = () => {},
  } = {}) {
    this.game = game;
    this.onScoreChanged = onScoreChanged;
    this.onEndFlashChanged = onEndFlashChanged;
    this.bindings = [];
    this.lampBindings = [];
  }

  bind(placedRoots) {
    this.restore();
    const paddleRootsByTag = new Map();
    const lampRootsByTag = new Map();
    for (const root of placedRoots || []) {
      const placement = root._runtimePlacementRecord;
      const tag = placement?.runtime?.objectTag;
      if (placement?.model === PADDLE_MODEL) {
        paddleRootsByTag.set(tag, root);
      } else if (placement?.model === LAMP_MODEL) {
        lampRootsByTag.set(tag, root);
      }
    }
    this.bindings = PADDLE_TAGS.map((tag, index) => {
      const root = paddleRootsByTag.get(tag);
      if (!root) return null;
      for (const node of [root, ...root.getDescendants(false)]) {
        node.unfreezeWorldMatrix?.();
      }
      const hitMeshes = [
        ...(root.getClassName?.() === "Mesh" ? [root] : []),
        ...(root.getChildMeshes?.(false) || []),
      ].filter((mesh) => mesh.getTotalVertices?.() > 0);
      const hitMetadata = hitMeshes.map((mesh) => ({
        mesh,
        previousIndex: mesh.metadata?.paddleReactionIndex,
      }));
      for (const mesh of hitMeshes) {
        mesh.metadata = {
          ...(mesh.metadata || {}),
          paddleReactionIndex: index,
        };
        mesh.isPickable = true;
      }
      const rest = (
        root.rotationQuaternion?.clone()
        || BABYLON.Quaternion.FromEulerAngles(
          root.rotation.x,
          root.rotation.y,
          root.rotation.z,
        )
      );
      root.rotationQuaternion = rest.clone();
      const raised = rest.multiply(
        BABYLON.Quaternion.RotationAxis(BABYLON.Axis.X, RAISE_RADIANS),
      );
      return { root, rest, raised, hitMetadata };
    });
    this.lampBindings = LAMP_TAGS.map((tag) => (
      this.createLampBinding(lampRootsByTag.get(tag), tag)
    ));
    this.applyPoses([0, 0, 0]);
    this.applyLampState(null);
    this.publishScore();
  }

  get ready() {
    return this.bindings.length === 3 && this.bindings.every(Boolean);
  }

  start() {
    const state = this.game.start();
    state.endFlashElapsed = null;
    state.newHighScore = false;
    this.applyPoses(state.paddlePoses);
    this.applyLampState(state);
    this.onEndFlashChanged();
    this.publishScore();
    return state;
  }

  stop() {
    this.game.stop();
    this.applyPoses(this.game.state.paddlePoses);
    this.applyLampState(null);
    this.onEndFlashChanged();
    this.publishScore();
  }

  press(index) {
    const wasOver = this.game.state.over;
    const hit = this.game.press(index);
    if (hit || this.game.state.over !== wasOver) {
      if (!wasOver && this.game.state.over) this.beginEndFlash();
      this.applyPoses(this.game.state.paddlePoses);
      this.applyLampState(this.game.state);
      this.publishScore();
    }
    return hit;
  }

  update(delta) {
    const wasOver = this.game.state.over;
    const state = this.game.update(delta);
    if (!wasOver && state.over) this.beginEndFlash();
    if (state.over && Number.isFinite(state.endFlashElapsed)) {
      state.endFlashElapsed += Math.max(0, Number(delta) || 0);
      this.applyEndFlashVisibility(state);
    }
    this.applyPoses(state.paddlePoses);
    this.applyLampState(state);
    this.publishScore();
    return state;
  }

  publishScore() {
    return this.onScoreChanged(this.game.state.score, this.game.state);
  }

  beginEndFlash() {
    const state = this.game.state;
    state.endFlashElapsed = 0;
    const result = this.publishScore();
    state.newHighScore = Boolean(result?.newHighScore);
    this.applyEndFlashVisibility(state);
  }

  applyEndFlashVisibility(state) {
    this.onEndFlashChanged(paddleEndFlashVisibility(state));
  }

  get endFlashComplete() {
    return (
      this.game.state.over
      && Number(this.game.state.endFlashElapsed) >= PADDLE_END_FLASH_SECONDS
    );
  }

  applyPoses(poses) {
    for (let index = 0; index < this.bindings.length; index++) {
      const binding = this.bindings[index];
      if (!binding) continue;
      BABYLON.Quaternion.SlerpToRef(
        binding.rest,
        binding.raised,
        poses[index] || 0,
        binding.root.rotationQuaternion,
      );
      binding.root.computeWorldMatrix?.(true);
    }
  }

  createLampBinding(root, tag) {
    if (!root) return null;
    const scene = root.getScene();
    root.computeWorldMatrix?.(true);
    const materialBindings = [];
    for (const mesh of root.getChildMeshes?.(false) || []) {
      if (!mesh.material) continue;
      const originalMaterial = mesh.material;
      const material = originalMaterial.clone(
        `${originalMaterial.name}_${tag}_illuminated`,
      );
      if (!material) continue;
      material.metadata = {
        ...(material.metadata || {}),
        preserveEmissive: true,
        paddleRoundLamp: tag,
      };
      material.backFaceCulling = false;
      if ("twoSidedLighting" in material) material.twoSidedLighting = true;
      if ("emissiveTexture" in material && !material.emissiveTexture) {
        material.emissiveTexture = material.diffuseTexture || null;
      }
      if ("maxSimultaneousLights" in material) {
        material.maxSimultaneousLights = 8;
      }
      mesh.material = material;
      materialBindings.push({ mesh, originalMaterial, material });
    }

    const position = root.getAbsolutePosition().add(
      new BABYLON.Vector3(0, 0, 0.1),
    );
    const light = new BABYLON.PointLight(
      `paddle_round_lamp_${tag}`,
      position,
      scene,
    );
    light.diffuse.copyFrom(LAMP_COLOR);
    light.specular.copyFrom(LAMP_COLOR).scaleInPlace(0.35);
    light.intensity = 0.8;
    light.range = 1.8;
    light.radius = 0.06;
    light.renderPriority = 110;
    light.metadata = {
      ...(light.metadata || {}),
      arcadeFixtureLight: true,
      paddleRoundLamp: tag,
    };
    const lightTargets = localLampTargets(scene, position, light.range);
    light.includedOnlyMeshes = lightTargets;
    for (const mesh of lightTargets) {
      if ("maxSimultaneousLights" in mesh.material) {
        mesh.material.maxSimultaneousLights = 8;
      }
      mesh._resyncLightSources?.();
    }
    return {
      root,
      materialBindings,
      light,
      lightTargets,
      enabled: null,
    };
  }

  applyLampState(state) {
    const lampStates = paddleRoundLampStates(state);
    for (let index = 0; index < this.lampBindings.length; index++) {
      const binding = this.lampBindings[index];
      if (!binding) continue;
      const enabled = lampStates[index];
      if (binding.enabled === enabled) continue;
      binding.enabled = enabled;
      binding.light.setEnabled(enabled);
      binding.light.intensity = enabled ? 0.8 : 0;
      for (const mesh of binding.lightTargets) {
        mesh._resyncLightSources?.();
        mesh.material?.markAsDirty?.(BABYLON.Material.LightDirtyFlag);
      }
      for (const { material } of binding.materialBindings) {
        if (material.emissiveColor) {
          material.emissiveColor.copyFrom(
            enabled ? LAMP_COLOR.scale(1.4) : BABYLON.Color3.Black(),
          );
        }
        if ("emissiveIntensity" in material) {
          material.emissiveIntensity = enabled ? 1.4 : 0;
        }
        material.markAsDirty?.(BABYLON.Material.AllDirtyFlag);
      }
    }
  }

  restore() {
    for (const binding of this.bindings) {
      if (!binding?.root || binding.root.isDisposed?.()) continue;
      binding.root.rotationQuaternion?.copyFrom(binding.rest);
      binding.root.computeWorldMatrix?.(true);
      for (const { mesh, previousIndex } of binding.hitMetadata || []) {
        if (mesh.isDisposed?.()) continue;
        if (previousIndex === undefined) {
          delete mesh.metadata?.paddleReactionIndex;
        } else {
          mesh.metadata.paddleReactionIndex = previousIndex;
        }
      }
    }
    this.bindings = [];
    for (const binding of this.lampBindings) {
      if (!binding) continue;
      binding.light?.dispose();
      for (const {
        mesh,
        originalMaterial,
        material,
      } of binding.materialBindings) {
        if (!mesh.isDisposed?.()) mesh.material = originalMaterial;
        material.dispose();
      }
    }
    this.lampBindings = [];
  }
}
