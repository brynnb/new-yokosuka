export function cutsceneStopReason(reason) {
  if (reason instanceof Error) return reason.message;
  if (typeof reason === "string") return reason;
  if (!reason || typeof reason !== "object") return "unknown-runtime-stop";
  const head = [
    reason.kind || reason.status || "native-runtime-stop",
    reason.semanticId,
    reason.message,
  ].filter(Boolean).join(":");
  const nested = reason.detail
    ?? reason.result?.reason
    ?? reason.reason
    ?? reason.result;
  if (nested === undefined || nested === reason) return head;
  return `${head}:${cutsceneStopReason(nested)}`;
}

function waitForPreview(promise, signal) {
  let abort;
  const cancelled = new Promise((_, reject) => {
    abort = () => reject(signal.reason);
    if (signal.aborted) abort();
    else signal.addEventListener("abort", abort, { once: true });
  });
  return Promise.race([cancelled, promise]).finally(() => {
    signal.removeEventListener("abort", abort);
  });
}

export class CutscenePreviewRuntime {
  constructor({
    getCutscene,
    getWorld,
    getActiveWorld,
    getController,
    selectWorld,
    cancelWorld = () => {},
    initializeWorld,
    ensureCharacter,
    captureGameplay,
    restoreGameplay,
    showRecoveryError = () => {},
    startDirector,
    stopDirector,
    endDirector,
    dialoguePersistence,
    physicsReady,
    startPlayRuntime,
    disposeMenuBackground,
    setStarting,
    beginLoading,
    finishLoading,
    showNotice,
  }) {
    this.getCutscene = getCutscene;
    this.getWorld = getWorld;
    this.getActiveWorld = getActiveWorld;
    this.getController = getController;
    this.selectWorld = selectWorld;
    this.cancelWorld = cancelWorld;
    this.initializeWorld = initializeWorld;
    this.ensureCharacter = ensureCharacter;
    this.captureGameplay = captureGameplay;
    this.restoreGameplay = restoreGameplay;
    this.showRecoveryError = showRecoveryError;
    this.startDirector = startDirector;
    this.stopDirector = stopDirector;
    this.endDirector = endDirector;
    this.dialoguePersistence = dialoguePersistence;
    this.physicsReady = physicsReady;
    this.startPlayRuntime = startPlayRuntime;
    this.disposeMenuBackground = disposeMenuBackground;
    this.setStarting = setStarting;
    this.beginLoading = beginLoading;
    this.finishLoading = finishLoading;
    this.showNotice = showNotice;
    this.active = null;
    this.startingPreview = null;
    this.endingPreview = null;
    this.gameplayPreview = null;
  }

  get starting() {
    return this.startingPreview !== null || this.endingPreview !== null || this.gameplayPreview?.restoring === true;
  }

  async startLoaded(cutsceneId, { signal = null } = {}) {
    const cutscene = this.getCutscene(cutsceneId);
    const world = cutscene ? this.getWorld(cutscene.worldId) : null;
    if (!cutscene || !world || this.getActiveWorld() !== world) {
      throw new Error(`Cutscene ${cutsceneId} is not loaded`);
    }
    // False is the director's normal cancelled-start result. Actual load or
    // runtime failures reject and keep their original diagnostic evidence.
    return await this.startDirector(cutscene, { signal });
  }

  cancel(reason = "user-cancelled") {
    // X during restoration must not cancel the return trip. Disposal, however,
    // must prevent a late load from reviving gameplay in a destroyed session.
    if (reason === "disposed" && this.gameplayPreview) {
      this.gameplayPreview.controller.abort(new DOMException(reason, "AbortError"));
      this.cancelWorld();
    }
    const preview = this.active || this.startingPreview;
    if (!preview) return this.gameplayPreview !== null;
    if (reason === "user-cancelled" && preview.started) {
      if (!this.endingPreview) {
        this.beginEnding(preview.cutsceneId);
        void this.endDirector(reason).catch(error => {
          if (this.active === preview) this.fail({ id: preview.cutsceneId }, error);
        });
      }
      return true;
    }
    preview.controller.abort(new DOMException(String(reason), "AbortError"));
    if (preview.loadingWorld) this.cancelWorld();
    this.stopDirector(reason);
    if (this.active === preview) this.complete();
    return true;
  }

  complete() {
    const preview = this.active;
    if (!preview) return false;
    this.active = null;
    if (preview.dialogueSandbox) this.dialoguePersistence.endSandbox();
    if (this.endingPreview === preview) {
      this.endingPreview = null;
      this.setStarting(this.starting);
    }
    // The director has already covered the scene before releasing it.
    preview.resolve();
    return true;
  }

  beginEnding(cutsceneId) {
    if (!this.active || this.active.cutsceneId !== cutsceneId) return false;
    this.endingPreview = this.active;
    this.setStarting(true);
    return true;
  }

  fail(cutscene, reason) {
    const preview = this.active;
    if (!preview || preview.cutsceneId !== cutscene.id) return false;
    this.active = null;
    if (preview.dialogueSandbox) this.dialoguePersistence.endSandbox();
    if (this.endingPreview === preview) {
      this.endingPreview = null;
      this.setStarting(this.starting);
    }
    preview.reject(new Error(
      `Cutscene ${cutscene.id} stopped before completion: ${cutsceneStopReason(reason)}`,
    ));
    return true;
  }

  async requestInGame(cutsceneId) {
    const cutscene = this.getCutscene(cutsceneId);
    if (!cutscene) {
      this.showNotice("That cutscene is not available.");
      return false;
    }
    if (this.active || this.starting || this.gameplayPreview) {
      this.showNotice("Finish the current cutscene preview first.");
      return false;
    }
    let request;
    let error = null;
    try {
      request = {
        snapshot: this.captureGameplay(),
        controller: new AbortController(),
        pendingPreparation: null,
      };
      this.gameplayPreview = request;
      // All preview entry points share the same director ownership, dialogue
      // sandbox and settlement. Only sidebar playback owns a return snapshot.
      await this.playFromMenu(cutsceneId);
    } catch (failure) {
      error = failure;
    }
    if (request) {
      const { signal } = request.controller;
      request.restoring = true;
      this.setStarting(true);
      try {
        // Promise cancellation alone cannot undo a late avatar replacement.
        // Drain the current preparation before restoring the previous session.
        await Promise.allSettled([request.pendingPreparation]);
        signal.throwIfAborted();
        await this.restoreGameplay(request.snapshot, { signal });
        signal.throwIfAborted();
        await this.finishLoading(signal);
      } catch (failure) {
        if (!signal.aborted) {
          error = failure;
          // A failed return must not resume/publish a cinematic stand-in,
          // even when the preview happened to share a normal gameplay map.
          this.cancelWorld();
          this.showRecoveryError("Could not return to your previous session.\nPlease refresh and try again.");
        }
      } finally {
        if (this.gameplayPreview === request) this.gameplayPreview = null;
        this.setStarting(this.starting);
      }
      if (signal.aborted) return false;
    }
    if (!error) return true;
    console.error(`Cutscene ${cutscene.id} stopped:`, error);
    this.showNotice(error.message || `${cutscene.label} could not play.`);
    return false;
  }

  async playFromMenu(cutsceneId) {
    if (this.active) {
      throw new Error("Finish the current cutscene preview first.");
    }
    const cutscene = this.getCutscene(cutsceneId);
    const world = cutscene ? this.getWorld(cutscene.worldId) : null;
    if (!cutscene || !world) throw new Error("That cutscene is not available.");

    const preview = {
      cutsceneId,
      controller: new AbortController(),
      dialogueSandbox: false,
      loadingWorld: false,
    };
    const completion = new Promise((resolve, reject) => {
      Object.assign(preview, { resolve, reject });
    });
    // Ownership begins before physics, world, or avatar preparation. A cancel
    // can settle the menu immediately while underlying loaders unwind safely.
    this.active = preview;
    this.startingPreview = preview;
    void completion.catch(() => {});
    const { signal } = preview.controller;
    const gameplay = this.gameplayPreview;
    const prepare = value => {
      const pending = Promise.resolve(value);
      if (gameplay) gameplay.pendingPreparation = pending;
      return waitForPreview(pending, signal);
    };
    this.setStarting(true, world);
    try {
      await prepare(this.beginLoading(world, signal, cutscene.loadingPresentation));
      await prepare(this.physicsReady);
      this.disposeMenuBackground();
      this.startPlayRuntime();
      preview.loadingWorld = true;
      // World preparation also begins loading internally. Forward the same
      // presentation so it cannot replace this scene's caption with world time.
      if (!this.getController()) {
        await prepare(this.initializeWorld({
          initialWorldOverride: world,
          fetchServerState: false,
          persistInitialLocation: false,
          reveal: false,
          loadingPresentation: cutscene.loadingPresentation,
          signal,
        }));
      } else {
        const loaded = await prepare(this.selectWorld(world, {
          controllerState: null,
          persistLocation: false,
          reveal: false,
          loadingPresentation: cutscene.loadingPresentation,
        }));
        if (!loaded) throw new Error(`${cutscene.label} could not be loaded.`);
      }
      preview.loadingWorld = false;
      await prepare(this.ensureCharacter({ signal }));
      if (!this.dialoguePersistence.gameplayState()) {
        this.dialoguePersistence.hydrate();
      }
      this.dialoguePersistence.beginSandbox();
      preview.dialogueSandbox = true;
      if (await prepare(this.startLoaded(cutsceneId, { signal })) !== true) {
        if (this.active === preview) this.complete();
      } else if (this.active === preview) {
        preview.started = true;
        await prepare(this.finishLoading(signal));
      }
    } catch (error) {
      if (signal.aborted) return completion;
      if (this.active === preview) {
        this.active = null;
        if (preview.dialogueSandbox) this.dialoguePersistence.endSandbox();
      }
      this.stopDirector("start-failed");
      throw error;
    } finally {
      if (this.startingPreview === preview) {
        this.startingPreview = null;
        this.setStarting(this.starting);
      }
    }
    return completion;
  }
}
