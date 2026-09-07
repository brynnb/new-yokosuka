import * as BABYLON from "@babylonjs/core";

import { parseNativeScrollSprite } from "../../src/NativeScrollSprite.js";
import { PvrDecoder } from "../../src/PvrDecoder.js";

function definitionsOf(value) {
  const definitions = Array.isArray(value) ? value : Object.values(value || {});
  const slots = new Set();
  return definitions.map((definition) => {
    const sourcePath = String(definition?.path || "");
    if (!sourcePath) throw new TypeError("native scroll sprite asset path is required");
    const match = sourcePath.toUpperCase().match(/\.SCR([0-2])$/);
    const slotIndex = definition.nativeSlot ?? (match ? Number(match[1]) : null);
    if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex > 2) {
      throw new Error(`native scroll sprite ${sourcePath} has no native slot`);
    }
    if (
      definition.nativeSlot !== undefined
      && definition.nativeSlot !== slotIndex
    ) throw new Error(`native scroll sprite ${sourcePath} slot metadata changed`);
    if (slots.has(slotIndex)) {
      throw new Error(`native scroll sprite slot ${slotIndex} is duplicated`);
    }
    const textureOffsetY = definition.textureOffsetY ?? 0;
    if (!Number.isFinite(textureOffsetY) || Math.abs(textureOffsetY) > 1) {
      throw new Error(`native scroll sprite ${sourcePath} vertical framing is invalid`);
    }
    const horizontalCoverageScale = definition.horizontalCoverageScale ?? 1;
    if (
      !Number.isFinite(horizontalCoverageScale)
      || horizontalCoverageScale < 1
      || horizontalCoverageScale > 8
    ) {
      throw new Error(`native scroll sprite ${sourcePath} horizontal coverage is invalid`);
    }
    const horizontalWrap = definition.horizontalWrap ?? "clamp";
    if (horizontalWrap !== "clamp" && horizontalWrap !== "mirror") {
      throw new Error(`native scroll sprite ${sourcePath} horizontal wrap is invalid`);
    }
    slots.add(slotIndex);
    return Object.freeze({
      ...definition,
      path: sourcePath,
      slotIndex,
      textureOffsetY,
      horizontalCoverageScale,
      horizontalWrap,
    });
  }).sort((left, right) => left.slotIndex - right.slotIndex);
}

function combineTiles(bytes, parsed) {
  const pixels = new Uint8Array(parsed.width * parsed.height * 4);
  let rowOffset = 0;
  for (const tile of parsed.tiles) {
    const pvrBytes = bytes.slice(
      tile.pvrOffset,
      tile.pvrOffset + tile.pvrByteLength,
    );
    const pvr = pvrBytes.buffer.slice(
      pvrBytes.byteOffset,
      pvrBytes.byteOffset + pvrBytes.byteLength,
    );
    const decoded = new PvrDecoder(pvr).decodePixels();
    if (
      !decoded
      || decoded.width !== tile.width
      || decoded.height !== tile.height
    ) throw new Error(`native scroll sprite ${tile.name} could not be decoded`);
    pixels.set(decoded.pixelData, rowOffset * parsed.width * 4);
    rowOffset += tile.height;
  }
  return pixels;
}

function parsedSpriteFor(definition, value) {
  const bytes = value instanceof Uint8Array
    ? value
    : ArrayBuffer.isView(value)
      ? new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
      : new Uint8Array(value);
  const parsed = parseNativeScrollSprite(bytes, {
    sourceName: definition.path,
    nativeSlot: definition.slotIndex,
  });
  if (parsed.slotIndex !== definition.slotIndex) {
    throw new Error(`native scroll sprite ${definition.path} slot changed`);
  }
  if (
    definition.width !== undefined
    && (parsed.width !== definition.width || parsed.height !== definition.height)
  ) throw new Error(`native scroll sprite ${definition.path} dimensions changed`);
  return { bytes, parsed };
}

function nativeTextureFor(scene, bytes, parsed) {
  const texture = BABYLON.RawTexture.CreateRGBATexture(
    combineTiles(bytes, parsed),
    parsed.width,
    parsed.height,
    scene,
    false,
    false,
    BABYLON.Texture.BILINEAR_SAMPLINGMODE,
  );
  texture.name = `native-scroll-slot-${parsed.slotIndex}`;
  texture.wrapU = BABYLON.Texture.CLAMP_ADDRESSMODE;
  texture.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE;
  return { parsed, texture };
}

function imageTextureFor(scene, definition, parsed, resolveAssetUrl) {
  if (typeof resolveAssetUrl !== "function") {
    throw new Error(
      `native scroll sprite ${definition.path} image resolver is unavailable`,
    );
  }
  const imageUrl = resolveAssetUrl(definition.imagePath);
  return new Promise((resolve, reject) => {
    let texture = null;
    texture = new BABYLON.Texture(
      imageUrl,
      scene,
      false,
      false,
      BABYLON.Texture.BILINEAR_SAMPLINGMODE,
      () => resolve({ parsed, texture }),
      (message, error) => {
        texture?.dispose();
        reject(error || new Error(
          `native scroll sprite image ${definition.imagePath} failed: ${message}`,
        ));
      },
    );
    texture.name = `native-scroll-slot-${parsed.slotIndex}`;
    texture.wrapU = BABYLON.Texture.CLAMP_ADDRESSMODE;
    texture.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE;
  });
}

function cameraViewOf(scene) {
  const camera = scene.activeCamera;
  if (!camera || typeof camera.getForwardRay !== "function") return null;
  const direction = camera.getForwardRay(1).direction.normalizeToNew();
  let levelUp = BABYLON.Axis.Y.subtract(
    direction.scale(BABYLON.Vector3.Dot(BABYLON.Axis.Y, direction)),
  );
  if (levelUp.lengthSquared() <= 1e-12) {
    levelUp = BABYLON.Axis.Z.subtract(
      direction.scale(BABYLON.Vector3.Dot(BABYLON.Axis.Z, direction)),
    );
  }
  levelUp.normalize();
  const cameraUp = camera.upVector.subtract(
    direction.scale(BABYLON.Vector3.Dot(camera.upVector, direction)),
  ).normalize();
  const roll = Math.atan2(
    BABYLON.Vector3.Dot(
      direction,
      BABYLON.Vector3.Cross(levelUp, cameraUp),
    ),
    BABYLON.Vector3.Dot(levelUp, cameraUp),
  );
  const verticalFov = Number(camera.fov);
  const aspectRatio = Number(scene.getEngine().getAspectRatio(camera));
  if (
    !Number.isFinite(verticalFov)
    || verticalFov <= 0
    || !Number.isFinite(aspectRatio)
    || aspectRatio <= 0
  ) return null;
  return {
    yaw: Math.atan2(direction.x, direction.z),
    pitch: Math.asin(BABYLON.Scalar.Clamp(direction.y, -1, 1)),
    roll,
    verticalFov,
    aspectRatio,
  };
}

function wrappedAngleDelta(value, origin) {
  return Math.atan2(Math.sin(value - origin), Math.cos(value - origin));
}

export class NativeScrollSpritePresentation {
  constructor({
    scene,
    definitions,
    loadAsset,
    resolveAssetUrl = null,
    createImageTexture = imageTextureFor,
    getSkybox = null,
    getDeltaFrames = null,
    getCameraView = null,
  } = {}) {
    if (!scene || typeof loadAsset !== "function") {
      throw new TypeError("native scroll sprite presentation dependencies are incomplete");
    }
    if (typeof createImageTexture !== "function") {
      throw new TypeError("native scroll sprite image texture factory is required");
    }
    this.scene = scene;
    this.definitions = definitionsOf(definitions);
    this.loadAsset = loadAsset;
    this.resolveAssetUrl = typeof resolveAssetUrl === "function"
      ? resolveAssetUrl
      : null;
    this.createImageTexture = createImageTexture;
    this.getSkybox = typeof getSkybox === "function" ? getSkybox : null;
    this.getDeltaFrames = typeof getDeltaFrames === "function"
      ? getDeltaFrames
      : () => Math.max(0, (this.scene.getEngine().getDeltaTime() * 30) / 1000);
    this.getCameraView = typeof getCameraView === "function"
      ? getCameraView
      : () => cameraViewOf(this.scene);
    this.resources = [];
    this.owner = null;
    this.sceneState = null;
    this.slotSnapshots = null;
    this.renderObserver = null;
    this.skyboxSnapshot = null;
    this.currentSlotIndex = null;
    this.activeTransition = null;
    this.lastTransitionRequestId = 0;
    this.cameraAnchor = null;
  }

  async load() {
    if (this.resources.length > 0) return true;
    const loaded = [];
    try {
      for (const definition of this.definitions) {
        const value = await this.loadAsset(definition.path);
        const { bytes, parsed } = parsedSpriteFor(definition, value);
        const texture = definition.imagePath
          ? (await this.createImageTexture(
            this.scene,
            definition,
            parsed,
            this.resolveAssetUrl,
          )).texture
          : nativeTextureFor(this.scene, bytes, parsed).texture;
        texture.wrapU = definition.horizontalWrap === "mirror"
          ? BABYLON.Texture.MIRROR_ADDRESSMODE
          : BABYLON.Texture.CLAMP_ADDRESSMODE;
        const layer = new BABYLON.Layer(
          `native-scroll-slot-${parsed.slotIndex}`,
          null,
          this.scene,
          true,
        );
        layer.texture = texture;
        layer.isEnabled = false;
        loaded.push({ definition, parsed, texture, layer });
      }
      this.resources = loaded;
      return true;
    } catch (error) {
      for (const resource of loaded) {
        resource.layer.dispose();
      }
      throw error;
    }
  }

  begin(owner, sceneState) {
    if (this.owner) throw new Error("native scroll sprite presentation is already active");
    if (
      !owner
      || !sceneState?.scrollSpriteControlState
      || typeof sceneState.scrollSpriteControlState.readSlot !== "function"
    ) throw new TypeError("native scroll sprite presentation requires scene ownership state");
    if (this.resources.length !== this.definitions.length) {
      throw new Error("native scroll sprite presentation is not loaded");
    }
    this.owner = owner;
    this.sceneState = sceneState;
    this.slotSnapshots = new Map();
    for (const { parsed, definition } of this.resources) {
      this.slotSnapshots.set(
        parsed.slotIndex,
        sceneState.scrollSpriteControlState.readSlot(parsed.slotIndex),
      );
      if (definition.lifecycle !== "script-allocated") {
        sceneState.scrollSpriteControlState.configureSlot(parsed.slotIndex, {
          active: true,
        });
      }
    }
    this.currentSlotIndex = this.#activeSlotIndices()[0] ?? null;
    this.activeTransition = null;
    this.lastTransitionRequestId = 0;
    this.#resetCameraRegistration();
    this.renderObserver = this.scene.onBeforeRenderObservable.add(() => this.#sync());
    this.#sync();
    return true;
  }

  end(owner) {
    if (!this.owner || owner !== this.owner) return false;
    if (this.renderObserver) {
      this.scene.onBeforeRenderObservable.remove(this.renderObserver);
      this.renderObserver = null;
    }
    for (const resource of this.resources) {
      resource.layer.isEnabled = false;
      resource.texture.uOffset = 0;
      resource.texture.vOffset = 0;
      resource.texture.wAng = 0;
    }
    this.#restoreSkybox();
    for (const [slotIndex, snapshot] of this.slotSnapshots) {
      this.sceneState.scrollSpriteControlState.configureSlot(slotIndex, snapshot);
    }
    this.owner = null;
    this.sceneState = null;
    this.slotSnapshots = null;
    this.currentSlotIndex = null;
    this.activeTransition = null;
    this.lastTransitionRequestId = 0;
    this.cameraAnchor = null;
    return true;
  }

  beginActivity() {
    if (!this.owner) return false;
    this.#resetCameraRegistration();
    return true;
  }

  clear() {
    if (this.owner) this.end(this.owner);
    for (const resource of this.resources) {
      resource.layer.dispose();
    }
    this.resources = [];
    this.#restoreSkybox();
  }

  #sync() {
    if (!this.sceneState) return;
    const slots = new Map(this.resources.map(resource => [
      resource.parsed.slotIndex,
      this.sceneState.scrollSpriteControlState.readSlot(resource.parsed.slotIndex),
    ]));
    const activeSlots = [...slots]
      .filter(([, slot]) => slot.active)
      .map(([slotIndex]) => slotIndex);
    if (!activeSlots.includes(this.currentSlotIndex)) {
      this.currentSlotIndex = activeSlots[0] ?? null;
      this.activeTransition = null;
    }

    const newestTransition = [...slots]
      .filter(([, slot]) => slot.active && Number.isInteger(slot.transition?.requestId))
      .map(([slotIndex, slot]) => ({ slotIndex, ...slot.transition }))
      .sort((left, right) => right.requestId - left.requestId)[0];
    if (
      newestTransition
      && newestTransition.requestId > this.lastTransitionRequestId
    ) {
      this.lastTransitionRequestId = newestTransition.requestId;
      if (newestTransition.slotIndex !== this.currentSlotIndex) {
        this.activeTransition = {
          sourceSlotIndex: this.currentSlotIndex,
          targetSlotIndex: newestTransition.slotIndex,
          durationFrames: Math.max(1, newestTransition.duration),
          elapsedFrames: 0,
        };
      }
    }

    const transition = this.activeTransition;
    if (transition && !activeSlots.includes(transition.targetSlotIndex)) {
      this.activeTransition = null;
    }
    if (this.activeTransition) {
      this.activeTransition.elapsedFrames = Math.min(
        this.activeTransition.durationFrames,
        this.activeTransition.elapsedFrames + this.getDeltaFrames(),
      );
      if (
        this.activeTransition.elapsedFrames
        >= this.activeTransition.durationFrames
      ) {
        this.currentSlotIndex = this.activeTransition.targetSlotIndex;
        this.activeTransition = null;
      }
    }

    for (const resource of this.resources) {
      const slotIndex = resource.parsed.slotIndex;
      let alpha = slotIndex === this.currentSlotIndex ? 1 : 0;
      if (this.activeTransition) {
        const progress = this.activeTransition.elapsedFrames
          / this.activeTransition.durationFrames;
        if (slotIndex === this.activeTransition.sourceSlotIndex) alpha = 1 - progress;
        if (slotIndex === this.activeTransition.targetSlotIndex) alpha = progress;
      }
      resource.layer.color.a = alpha;
      resource.layer.isEnabled = slots.get(slotIndex).active && alpha > 0;
    }
    this.#syncCameraRegistration();
    const backgroundActive = activeSlots.length > 0;
    if (backgroundActive && !this.skyboxSnapshot) {
      const skybox = this.getSkybox?.() || null;
      if (skybox) {
        this.skyboxSnapshot = {
          skybox,
          enabled: skybox.isEnabled?.() !== false,
        };
        skybox.setEnabled(false);
      }
    } else if (!backgroundActive) {
      this.#restoreSkybox();
    }
  }

  #activeSlotIndices() {
    return this.resources
      .map(resource => resource.parsed.slotIndex)
      .filter(slotIndex => this.sceneState.scrollSpriteControlState.readSlot(slotIndex).active)
      .sort((left, right) => left - right);
  }

  #syncCameraRegistration() {
    const view = this.getCameraView();
    if (!view) return;
    if (
      ![view.yaw, view.pitch, view.verticalFov, view.aspectRatio]
        .every(Number.isFinite)
      || view.verticalFov <= 0
      || view.aspectRatio <= 0
    ) return;
    if (!this.cameraAnchor) {
      this.cameraAnchor = { ...view };
      return;
    }
    const horizontalFov = 2 * Math.atan(
      Math.tan(view.verticalFov / 2) * view.aspectRatio,
    );
    const yawDelta = wrappedAngleDelta(view.yaw, this.cameraAnchor.yaw);
    const rollDelta = wrappedAngleDelta(
      Number.isFinite(view.roll) ? view.roll : 0,
      Number.isFinite(this.cameraAnchor.roll) ? this.cameraAnchor.roll : 0,
    );
    const horizontalShift = -Math.tan(yawDelta) / Math.tan(horizontalFov / 2);
    const currentHorizon = -Math.tan(view.pitch) / Math.tan(view.verticalFov / 2);
    const anchorHorizon = -Math.tan(this.cameraAnchor.pitch)
      / Math.tan(this.cameraAnchor.verticalFov / 2);
    const verticalShift = currentHorizon - anchorHorizon;
    for (const resource of this.resources) {
      resource.texture.uOffset = -horizontalShift
        / (2 * resource.definition.horizontalCoverageScale);
      // Texture coordinates rotate opposite the visible image. Negating the
      // authored camera roll keeps the distant backdrop locked to the same
      // cinematic horizon as the 3D map geometry.
      resource.texture.wAng = -rollDelta;
      // Babylon's layer UV axis runs opposite the projected camera-space Y
      // used by the native SCRL vertex builder. Looking upward must carry the
      // authored horizon down and out of frame, not pull it toward the top.
      resource.texture.vOffset = resource.definition.textureOffsetY
        - verticalShift / 2;
    }
  }

  #resetCameraRegistration() {
    this.cameraAnchor = null;
    for (const resource of this.resources) {
      resource.texture.uOffset = 0;
      resource.texture.vOffset = resource.definition.textureOffsetY;
      resource.texture.wAng = 0;
    }
  }

  #restoreSkybox() {
    const snapshot = this.skyboxSnapshot;
    this.skyboxSnapshot = null;
    if (!snapshot || snapshot.skybox.isDisposed?.()) return;
    snapshot.skybox.setEnabled(snapshot.enabled);
  }
}

export function createNativeScrollSpritePresentation(options) {
  return new NativeScrollSpritePresentation(options);
}
