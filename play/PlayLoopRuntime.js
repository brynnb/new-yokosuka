import {
  AdaptiveResolutionController,
} from "./performance/AdaptiveResolutionController.js";

export function fixedStepTiming(fixedDeltaSeconds = 1 / 60) {
  const deltaSeconds = Math.max(0, Number(fixedDeltaSeconds) || 0);
  return {
    wallDeltaSeconds: deltaSeconds,
    deltaSeconds,
    animationDeltaSeconds: deltaSeconds,
  };
}

export function renderFrameTiming(
  elapsedSeconds,
  maximumDeltaSeconds = 0.25,
  maximumAnimationDeltaSeconds = 120,
) {
  const maximum = Number.isFinite(maximumDeltaSeconds)
    ? Math.max(0, maximumDeltaSeconds)
    : 0.25;
  const maximumAnimation = Number.isFinite(maximumAnimationDeltaSeconds)
    ? Math.max(0, maximumAnimationDeltaSeconds)
    : 120;
  const wallDeltaSeconds = Math.max(
    0,
    Number(elapsedSeconds) || 0,
  );
  return {
    wallDeltaSeconds,
    deltaSeconds: Math.min(maximum, wallDeltaSeconds),
    animationDeltaSeconds: Math.min(
      maximumAnimation,
      wallDeltaSeconds,
    ),
  };
}

export function renderHardwareScalingLevel(
  devicePixelRatio,
  maximumPixelRatio = 2,
) {
  const safeMaximum = Number.isFinite(maximumPixelRatio)
    ? Math.max(1, maximumPixelRatio)
    : 2;
  const safeRatio = Number.isFinite(devicePixelRatio)
    ? Math.max(1, devicePixelRatio)
    : 1;
  return 1 / Math.min(safeMaximum, safeRatio);
}

export function fixedStepInterpolationAlpha(
  accumulatedSeconds,
  fixedDeltaSeconds = 1 / 60,
) {
  const step = Math.max(1e-6, Number(fixedDeltaSeconds) || 0);
  return Math.max(
    0,
    Math.min(1, (Number(accumulatedSeconds) || 0) / step),
  );
}

export class PlayLoopRuntime {
  constructor({
    engine,
    scene,
    canvas,
    fixedUpdate,
    fixedPostUpdate = () => {},
    frameUpdate,
    render,
    shouldRender = () => true,
    dispose = () => {},
    fixedDeltaSeconds = 1 / 60,
    shouldAdaptResolution = () => true,
    adaptiveResolutionEnabled = true,
    maximumRenderPixelRatio = 2,
  }) {
    this.engine = engine;
    this.scene = scene;
    this.canvas = canvas;
    this.fixedUpdate = fixedUpdate;
    this.fixedPostUpdate = fixedPostUpdate;
    this.frameUpdate = frameUpdate;
    this.render = render;
    this.shouldRender = shouldRender;
    this.disposeRuntime = dispose;
    this.fixedDeltaSeconds = fixedDeltaSeconds;
    this.shouldAdaptResolution = shouldAdaptResolution;
    this.adaptiveResolutionEnabled = Boolean(adaptiveResolutionEnabled);
    this.adaptiveResolution = new AdaptiveResolutionController({
      devicePixelRatio: window.devicePixelRatio,
      maximumPixelRatio: maximumRenderPixelRatio,
    });
    this.resizeFrame = null;
    this.started = false;
    this.disposed = false;
    this.renderLoop = null;
    this.simulationObserver = null;
    this.postSimulationObserver = null;
    this.renderObserver = null;
    this.previousRenderTime = performance.now();
    this.previousInterpolationTime = this.previousRenderTime;
    this.fixedStepAccumulator = 0;
    this.pendingRenderTiming = renderFrameTiming(0);
    this.resizeObserver = new ResizeObserver(() => this.scheduleResize());
    this.onWindowResize = () => this.scheduleResize();
    this.onVisualResize = () => this.scheduleResize();
    this.onVisibilityChange = () => {
      // Discard Babylon's fixed-step backlog while hidden. The next
      // presentation frame still receives real wall time so cosmetic
      // transitions can finish instead of resuming in slow motion.
      this.engine.resetDeltaTime?.();
      this.fixedStepAccumulator = 0;
      this.previousInterpolationTime = performance.now();
    };
    this.onBeforeUnload = () => this.dispose();
  }

  synchronizeViewportHeight() {
    const visualHeight = window.visualViewport?.height;
    const viewportHeight = (
      Number.isFinite(visualHeight) && visualHeight > 0
    ) ? visualHeight : window.innerHeight;
    if (!Number.isFinite(viewportHeight) || viewportHeight <= 0) return;
    document.documentElement.style.setProperty(
      "--app-viewport-height",
      `${Math.round(viewportHeight)}px`,
    );
  }

  synchronizeRenderScale() {
    this.adaptiveResolution.updateDevicePixelRatio(window.devicePixelRatio);
    const nextLevel = this.adaptiveResolution.hardwareScalingLevel;
    this.applyRenderScale(nextLevel);
  }

  setAdaptiveResolutionEnabled(enabled) {
    const nextEnabled = Boolean(enabled);
    if (this.adaptiveResolutionEnabled === nextEnabled) return;
    this.adaptiveResolutionEnabled = nextEnabled;
    this.adaptiveResolution.updateDevicePixelRatio(window.devicePixelRatio);
    this.adaptiveResolution.setLevelIndex(0);
    this.adaptiveResolution.resetSamples();
    this.applyRenderScale(this.adaptiveResolution.hardwareScalingLevel);
  }

  setMaximumRenderPixelRatio(maximumPixelRatio) {
    const currentMaximum = this.adaptiveResolution.maximumPixelRatio;
    const nextMaximum = Number(maximumPixelRatio);
    if (
      !Number.isFinite(nextMaximum)
      || nextMaximum <= 0
      || Math.abs(currentMaximum - nextMaximum) < 0.001
    ) {
      return;
    }
    this.adaptiveResolution.setMaximumPixelRatio(
      nextMaximum,
      window.devicePixelRatio,
    );
    this.applyRenderScale(this.adaptiveResolution.hardwareScalingLevel);
  }

  applyRenderScale(nextLevel) {
    if (
      Math.abs(this.engine.getHardwareScalingLevel() - nextLevel)
      < 0.001
    ) {
      return;
    }
    this.engine.setHardwareScalingLevel(nextLevel);
  }

  scheduleResize() {
    if (this.resizeFrame !== null) {
      window.cancelAnimationFrame(this.resizeFrame);
    }
    this.resizeFrame = window.requestAnimationFrame(() => {
      this.resizeFrame = null;
      this.synchronizeViewportHeight();
      this.synchronizeRenderScale();
      this.engine.resize(true);
    });
  }

  start() {
    if (this.started || this.disposed) return;
    this.started = true;
    this.previousRenderTime = performance.now();
    this.previousInterpolationTime = this.previousRenderTime;
    this.fixedStepAccumulator = 0;
    this.synchronizeViewportHeight();
    this.synchronizeRenderScale();
    this.engine.resize(true);
    window.addEventListener("resize", this.onWindowResize);
    window.visualViewport?.addEventListener("resize", this.onVisualResize);
    this.resizeObserver.observe(this.canvas.parentElement);
    window.addEventListener("beforeunload", this.onBeforeUnload);
    document.addEventListener("visibilitychange", this.onVisibilityChange);
    this.simulationObserver = this.scene.onBeforeStepObservable.add(() => {
      this.fixedStepAccumulator = Math.max(
        0,
        this.fixedStepAccumulator - this.fixedDeltaSeconds,
      );
      this.fixedUpdate(fixedStepTiming(this.fixedDeltaSeconds));
    });
    this.postSimulationObserver = this.scene.onAfterStepObservable.add(() => {
      this.fixedPostUpdate(fixedStepTiming(this.fixedDeltaSeconds));
    });
    this.renderObserver = this.scene.onBeforeRenderObservable.add(() => {
      this.frameUpdate({
        ...this.pendingRenderTiming,
        fixedStepAlpha: fixedStepInterpolationAlpha(
          this.fixedStepAccumulator,
          this.fixedDeltaSeconds,
        ),
      });
    });
    this.renderLoop = () => {
      const now = performance.now();
      this.pendingRenderTiming = renderFrameTiming(
        (now - this.previousRenderTime) / 1000,
      );
      this.previousRenderTime = now;
      this.fixedStepAccumulator += (
        now - this.previousInterpolationTime
      ) / 1000;
      this.previousInterpolationTime = now;
      // An opaque HTML loading screen owns presentation during world assembly.
      // Drawing incomplete worlds repeatedly compiles shaders and traverses all
      // meshes for pixels nobody can see. Do not accumulate simulation catch-up.
      if (!this.shouldRender()) {
        this.fixedStepAccumulator = 0;
        return;
      }
      const resolutionChange = this.adaptiveResolution.observeFrame(
        this.pendingRenderTiming.wallDeltaSeconds,
        {
          active: (
            this.adaptiveResolutionEnabled
            && this.shouldAdaptResolution()
          ),
        },
      );
      if (resolutionChange) {
        this.applyRenderScale(resolutionChange.hardwareScalingLevel);
      }
      this.render();
    };
    this.engine.runRenderLoop(this.renderLoop);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    if (this.renderLoop) this.engine.stopRenderLoop(this.renderLoop);
    this.disposeRuntime();
    this.resizeObserver.disconnect();
    window.removeEventListener("resize", this.onWindowResize);
    window.visualViewport?.removeEventListener("resize", this.onVisualResize);
    window.removeEventListener("beforeunload", this.onBeforeUnload);
    document.removeEventListener(
      "visibilitychange",
      this.onVisibilityChange,
    );
    if (this.simulationObserver) {
      this.scene.onBeforeStepObservable.remove(this.simulationObserver);
      this.simulationObserver = null;
    }
    if (this.postSimulationObserver) {
      this.scene.onAfterStepObservable.remove(this.postSimulationObserver);
      this.postSimulationObserver = null;
    }
    if (this.renderObserver) {
      this.scene.onBeforeRenderObservable.remove(this.renderObserver);
      this.renderObserver = null;
    }
    if (this.resizeFrame !== null) {
      window.cancelAnimationFrame(this.resizeFrame);
      this.resizeFrame = null;
    }
  }
}
