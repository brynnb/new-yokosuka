import * as BABYLON from "@babylonjs/core";
import { arcadeCabinetScreenPoints } from "./ArcadeAttractScreens.js";

export class ArcadeCabinetView {
  constructor({
    scene,
    engine,
    camera,
    dom,
    definitions,
    worldId,
    getActiveWorldId,
    isPickerActive,
    updateAttractScreens,
  }) {
    this.scene = scene;
    this.engine = engine;
    this.camera = camera;
    this.dom = dom;
    this.definitions = definitions;
    this.worldId = worldId;
    this.getActiveWorldId = getActiveWorldId;
    this.isPickerActive = isPickerActive;
    this.updateAttractScreens = updateAttractScreens;
    this.transition = null;
  }

  get focusOnly() {
    return Boolean(this.transition?.focusOnly);
  }

  clearProjection() {
    this.dom.arcadeOverlay.classList.remove(
      "cabinet-mode",
      "cabinet-projected",
    );
    this.dom.arcadeEmulatorFrame.style.visibility = "hidden";
    for (const property of ["left", "top", "width", "height"]) {
      this.dom.arcadeShell.style.removeProperty(property);
    }
  }

  clear() {
    if (this.transition?.savedCameraUp) {
      this.camera.upVector.copyFrom(this.transition.savedCameraUp);
    }
    this.transition = null;
    this.dom.arcadeOverlay.classList.remove(
      "cabinet-mode",
      "cabinet-projected",
      "cabinet-transitioning",
    );
    this.clearProjection();
  }

  setActive(active, game, definitionOverride = null) {
    if (!active) {
      if (!this.transition) {
        this.clear();
        return false;
      }
      const view = this.transition;
      view.phase = "exiting";
      view.startCameraPosition = this.camera.position.clone();
      view.startCameraTarget = this.camera.getTarget().clone();
      view.startCameraUp = this.camera.upVector.clone();
      view.targetCameraPosition = view.homeCameraPosition.clone();
      view.targetCameraTarget = view.homeCameraTarget.clone();
      view.targetCameraUp = view.homeCameraUp.clone();
      view.startedAt = performance.now();
      this.dom.arcadeOverlay.classList.add("cabinet-transitioning");
      return true;
    }

    this.clear();
    const definition = definitionOverride || this.definitions[game?.id];
    if (!definition) return false;
    const center = BABYLON.Vector3.FromArray(definition.center);
    const normal = BABYLON.Vector3.FromArray(
      definition.frontNormal,
    ).normalize();
    const homeCameraPosition = this.camera.position.clone();
    const homeCameraTarget = this.camera.getTarget().clone();
    const homeCameraUp = this.camera.upVector.clone();
    this.transition = {
      phase: "entering",
      focusOnly: Boolean(game?.focusOnly),
      definition,
      center,
      homeCameraPosition,
      homeCameraTarget,
      homeCameraUp,
      targetCameraPosition: center.add(normal.scale(definition.cameraDistance)),
      targetCameraTarget: center,
      targetCameraUp: BABYLON.Vector3.FromArray(definition.up).normalize(),
      startCameraPosition: homeCameraPosition.clone(),
      startCameraTarget: homeCameraTarget.clone(),
      startCameraUp: homeCameraUp.clone(),
      savedCameraUp: homeCameraUp.clone(),
      startedAt: performance.now(),
      transitionDurationMs: 450,
    };
    this.dom.arcadeOverlay.classList.add("cabinet-transitioning");
    if (!game?.focusOnly && game?.mode !== "physical") {
      this.dom.arcadeOverlay.classList.add("arcade-preloading");
    }
    return true;
  }

  projectedBounds(definition) {
    const renderWidth = this.engine.getRenderWidth();
    const renderHeight = this.engine.getRenderHeight();
    const canvasBounds = this.dom.canvas.getBoundingClientRect();
    if (
      renderWidth <= 0
      || renderHeight <= 0
      || canvasBounds.width <= 0
      || canvasBounds.height <= 0
    ) return null;
    const viewport = new BABYLON.Viewport(0, 0, renderWidth, renderHeight);
    const projected = arcadeCabinetScreenPoints(definition).map((point) => (
      BABYLON.Vector3.Project(
        point,
        BABYLON.Matrix.Identity(),
        this.scene.getTransformMatrix(),
        viewport,
      )
    ));
    if (projected.some((point) => !point.asArray().every(Number.isFinite))) {
      return null;
    }
    const xScale = canvasBounds.width / renderWidth;
    const yScale = canvasBounds.height / renderHeight;
    const left = canvasBounds.left
      + Math.min(...projected.map((point) => point.x)) * xScale;
    const right = canvasBounds.left
      + Math.max(...projected.map((point) => point.x)) * xScale;
    const top = canvasBounds.top
      + Math.min(...projected.map((point) => point.y)) * yScale;
    const bottom = canvasBounds.top
      + Math.max(...projected.map((point) => point.y)) * yScale;
    if (right - left < 2 || bottom - top < 2) return null;
    return { left, top, width: right - left, height: bottom - top };
  }

  updateScreen(arcadeGames) {
    const game = arcadeGames?.active ? arcadeGames.game : null;
    const gameId = game?.id || null;
    if (game?.mode === "physical") {
      this.clearProjection();
      return;
    }
    const isEmulator = game?.mode === "emulator";
    const contentReady = isEmulator
      ? (
        arcadeGames?.preloadedEmulatorId === gameId
        && arcadeGames?.preloadedEmulatorStarted
      )
      : Boolean(arcadeGames?.state && !this.dom.arcadeCanvas.hidden);
    const shouldProject = (
      this.getActiveWorldId() === this.worldId
      && !this.isPickerActive()
      && this.transition?.phase === "active"
      && contentReady
      && Boolean(this.definitions[gameId])
    );
    this.updateAttractScreens(shouldProject ? gameId : null);
    if (!shouldProject) {
      this.clearProjection();
      return;
    }
    const bounds = this.projectedBounds(this.definitions[gameId]);
    if (!bounds) {
      this.clearProjection();
      return;
    }
    Object.assign(this.dom.arcadeShell.style, {
      left: `${bounds.left}px`,
      top: `${bounds.top}px`,
      width: `${bounds.width}px`,
      height: `${bounds.height}px`,
    });
    this.dom.arcadeEmulatorFrame.style.visibility = isEmulator
      ? "visible"
      : "hidden";
    this.dom.arcadeOverlay.classList.add(
      "cabinet-mode",
      "cabinet-projected",
    );
    if (!isEmulator) arcadeGames.resize();
  }

  updateTransition(onExited) {
    const view = this.transition;
    if (!view) return;
    const elapsed = performance.now() - view.startedAt;
    const fraction = Math.min(
      1,
      Math.max(0, elapsed / view.transitionDurationMs),
    );
    const blend = fraction * fraction * (3 - 2 * fraction);
    this.camera.position.copyFrom(BABYLON.Vector3.Lerp(
      view.startCameraPosition,
      view.targetCameraPosition,
      blend,
    ));
    this.camera.upVector.copyFrom(BABYLON.Vector3.Lerp(
      view.startCameraUp,
      view.targetCameraUp,
      blend,
    ).normalize());
    this.camera.setTarget(BABYLON.Vector3.Lerp(
      view.startCameraTarget,
      view.targetCameraTarget,
      blend,
    ));
    this.scene.updateTransformMatrix(true);
    if (fraction < 1) return;
    if (view.phase === "exiting") {
      this.clear();
      onExited?.();
      return;
    }
    view.phase = "active";
    this.dom.arcadeOverlay.classList.remove("cabinet-transitioning");
  }
}
