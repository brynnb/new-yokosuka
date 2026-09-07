import * as BABYLON from "@babylonjs/core";

const DART_MODEL = "S3_DGCT_DARK310G.MT5";
const DART_TAGS = Object.freeze(["DRT1", "DRT2"]);
const DART_LOCAL_TIP = new BABYLON.Vector3(-0.000695, 0, 0);
const DART_FORWARD = new BABYLON.Vector3(1, 0, 0);
const BOARD_X = -0.162533;
const BOARD_CENTER_Y = 1.416923;
const BOARD_RADIUS = 0.215;
const HOVER_X = -0.72;
const THROW_DURATION = 0.12;
const RESET_WHEN_COOLDOWN_BELOW = 0.18;
const BOARD_DIRECTION = new BABYLON.Vector3(1, 0, 0);
const BOARD_ROTATION = rotationFromForward(BOARD_DIRECTION);
const FLASH_INTERVAL_SECONDS = 0.25;

export const DART_BOARD_CENTERS = Object.freeze([
  Object.freeze([BOARD_X, BOARD_CENTER_Y, -4.599643]),
  Object.freeze([BOARD_X, BOARD_CENTER_Y, -3.699643]),
]);

export function dartAimAtTime(aimTime) {
  return {
    x: Math.sin(aimTime * 2.17) * 0.72,
    y: Math.sin(aimTime * 2.83 + 0.8) * 0.72,
  };
}

export function dartBoardIndexForInteraction(interaction) {
  const z = Number(interaction?.position?.[2]);
  if (!Number.isFinite(z)) return 0;
  return Math.abs(z - DART_BOARD_CENTERS[1][2])
    < Math.abs(z - DART_BOARD_CENTERS[0][2])
    ? 1
    : 0;
}

export function dartCabinetView(interaction) {
  const center = DART_BOARD_CENTERS[
    dartBoardIndexForInteraction(interaction)
  ];
  return {
    center,
    frontNormal: [-1, 0, 0],
    up: [0, 1, 0],
    cameraDistance: 1.42,
    physical: true,
  };
}

function rotationFromForward(direction) {
  const target = direction.normalizeToNew();
  const dot = BABYLON.Vector3.Dot(DART_FORWARD, target);
  if (dot < -0.999999) {
    return BABYLON.Quaternion.RotationAxis(BABYLON.Axis.Y, Math.PI);
  }
  const cross = BABYLON.Vector3.Cross(DART_FORWARD, target);
  return new BABYLON.Quaternion(
    cross.x,
    cross.y,
    cross.z,
    1 + dot,
  ).normalize();
}

function setRootEnabled(root, enabled) {
  root?.setEnabled(Boolean(enabled));
}

function makeDartEmissive(root, tag) {
  const materials = new Map();
  const meshes = [
    ...(root.getClassName?.() === "Mesh" ? [root] : []),
    ...(root.getChildMeshes?.(false) || []),
  ];
  for (const mesh of meshes) {
    const source = mesh.material;
    if (!source) continue;
    let material = materials.get(source);
    if (!material) {
      material = source.clone(`${source.name}_${tag}_emissive`);
      materials.set(source, material);
      if ("emissiveTexture" in material && !material.emissiveTexture) {
        material.emissiveTexture = (
          material.diffuseTexture
          || material.albedoTexture
          || null
        );
      }
      if ("emissiveColor" in material) {
        material.emissiveColor = new BABYLON.Color3(0.85, 0.72, 0.45);
      }
      if ("emissiveIntensity" in material) material.emissiveIntensity = 1.4;
      material.metadata = {
        ...(material.metadata || {}),
        preserveEmissive: true,
        physicalDart: true,
      };
    }
    mesh.material = material;
  }
}

export class DartsPhysicalRuntime {
  constructor({
    onStateChanged = () => {},
    onFlashChanged = () => {},
    getScoreState = () => null,
  } = {}) {
    this.bindings = [];
    this.activeBinding = null;
    this.lastThrow = null;
    this.onStateChanged = onStateChanged;
    this.onFlashChanged = onFlashChanged;
    this.getScoreState = getScoreState;
  }

  bind(placedRoots) {
    this.restore();
    const rootsByTag = new Map();
    for (const root of placedRoots || []) {
      const placement = root._runtimePlacementRecord;
      if (placement?.model !== DART_MODEL) continue;
      rootsByTag.set(placement.runtime?.objectTag, root);
    }
    this.bindings = DART_TAGS.map((tag, index) => {
      const root = rootsByTag.get(tag);
      if (!root) return null;
      for (const node of [root, ...root.getDescendants(false)]) {
        node.unfreezeWorldMatrix?.();
        node.isPickable = false;
      }
      makeDartEmissive(root, tag);
      const center = BABYLON.Vector3.FromArray(DART_BOARD_CENTERS[index]);
      const line = BABYLON.MeshBuilder.CreateLines(
        `darts_aim_line_${index}`,
        { points: [center, center] },
        root.getScene(),
      );
      line.color = new BABYLON.Color3(1, 0.82, 0.32);
      line.alpha = 0.9;
      line.isPickable = false;
      line.alwaysSelectAsActiveMesh = true;
      line.renderingGroupId = 1;
      line.setEnabled(false);
      setRootEnabled(root, false);
      return { root, line, center, index, landedRoots: [] };
    });
  }

  get ready() {
    return this.bindings.length === 2 && this.bindings.every(Boolean);
  }

  start(interaction, state) {
    this.stop();
    const index = dartBoardIndexForInteraction(interaction);
    this.activeBinding = this.bindings[index] || null;
    this.lastThrow = null;
    if (!this.activeBinding) return false;
    this.clearLandedDarts(this.activeBinding);
    const scoreState = this.getScoreState(index);
    if (scoreState) {
      state.highScore = scoreState.highScore;
      state.lastScore = scoreState.lastScore;
      state.startingHighScore = scoreState.highScore;
    }
    state.endFlashElapsed = null;
    state.newHighScore = false;
    this.onFlashChanged(index);
    setRootEnabled(this.activeBinding.root, true);
    this.activeBinding.line.setEnabled(true);
    this.update(state);
    return true;
  }

  stop() {
    if (this.activeBinding) {
      this.onFlashChanged(this.activeBinding.index);
    }
    for (const binding of this.bindings) {
      if (!binding) continue;
      setRootEnabled(binding.root, false);
      binding.line.setEnabled(false);
    }
    this.activeBinding = null;
    this.lastThrow = null;
  }

  noteThrow(lastThrow) {
    this.lastThrow = lastThrow
      ? { ...lastThrow, embedded: false }
      : null;
  }

  resetLiveDisplays(state) {
    const binding = this.activeBinding;
    if (!binding || !state) return;
    this.onFlashChanged(binding.index);
    this.onStateChanged({
      ...state,
      score: 0,
      timeBonus: 10,
      over: false,
    }, binding.index);
  }

  targetForAim(aim) {
    const { center } = this.activeBinding;
    return new BABYLON.Vector3(
      center.x - 0.004,
      center.y - aim.y * BOARD_RADIUS,
      center.z + aim.x * BOARD_RADIUS,
    );
  }

  update(state, delta = 0) {
    const binding = this.activeBinding;
    if (!binding || !state) return;
    const liveAim = dartAimAtTime(state.aimTime);
    const showingThrow = (
      this.lastThrow
      && state.throwCooldown > RESET_WHEN_COOLDOWN_BELOW
    );
    const aim = showingThrow ? this.lastThrow : liveAim;
    const target = this.targetForAim(aim);
    const hover = new BABYLON.Vector3(
      HOVER_X,
      target.y,
      target.z,
    );
    const landedRoot = target.subtract(DART_LOCAL_TIP);
    let position = hover;
    if (showingThrow) {
      const elapsed = 0.55 - state.throwCooldown;
      const progress = Math.min(1, Math.max(0, elapsed / THROW_DURATION));
      position = BABYLON.Vector3.Lerp(hover, landedRoot, progress);
      if (progress >= 1 && !this.lastThrow.embedded) {
        this.embedDart(binding, landedRoot);
        this.lastThrow.embedded = true;
      }
    } else if (this.lastThrow) {
      this.lastThrow = null;
    }

    binding.root.position.copyFrom(position);
    binding.root.rotationQuaternion = BOARD_ROTATION.clone();
    binding.root.computeWorldMatrix(true);
    const tip = BABYLON.Vector3.TransformCoordinates(
      DART_LOCAL_TIP,
      binding.root.getWorldMatrix(),
    );
    BABYLON.MeshBuilder.CreateLines(
      binding.line.name,
      { points: [tip, target], instance: binding.line },
      binding.root.getScene(),
    );
    const roundComplete = state.throwsLeft <= 0;
    setRootEnabled(
      binding.root,
      showingThrow ? !this.lastThrow?.embedded : !roundComplete,
    );
    binding.line.setEnabled(!roundComplete && !showingThrow);
    if (state.over && Number.isFinite(state.endFlashElapsed)) {
      state.endFlashElapsed += Math.max(0, Number(delta) || 0);
      const flashOn = (
        Math.floor(state.endFlashElapsed / FLASH_INTERVAL_SECONDS) % 2 === 0
      );
      this.onFlashChanged(binding.index, {
        score: flashOn,
        lastScore: flashOn,
        highScore: state.newHighScore ? flashOn : true,
      });
    }
    this.onStateChanged(state, binding.index);
  }

  embedDart(binding, position) {
    const clone = binding.root.clone(
      `embedded_dart_${binding.index}_${binding.landedRoots.length}`,
      null,
      false,
    );
    if (!clone) return;
    clone.position.copyFrom(position);
    clone.rotationQuaternion = BOARD_ROTATION.clone();
    for (const node of [clone, ...clone.getDescendants(false)]) {
      node.unfreezeWorldMatrix?.();
      node.isPickable = false;
    }
    clone.computeWorldMatrix(true);
    clone.setEnabled(true);
    binding.landedRoots.push(clone);
  }

  clearLandedDarts(binding) {
    for (const root of binding?.landedRoots || []) root.dispose(false, false);
    if (binding) binding.landedRoots = [];
  }

  restore() {
    for (const binding of this.bindings) {
      if (!binding) continue;
      this.clearLandedDarts(binding);
      setRootEnabled(binding.root, true);
      binding.line.dispose();
    }
    this.bindings = [];
    this.activeBinding = null;
    this.lastThrow = null;
  }
}
