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
  }

  get starting() { return this.startingPreview !== null || this.endingPreview !== null; }

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
    const preview = this.active || this.startingPreview;
    if (!preview) return false;
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
      this.setStarting(this.startingPreview !== null);
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
      this.setStarting(this.startingPreview !== null);
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
    if (this.startingPreview) this.cancel("superseded");
    const request = { controller: new AbortController(), loadingWorld: true };
    const { signal } = request.controller;
    this.startingPreview = request;
    this.showNotice(`Loading ${cutscene.label}...`);
    this.setStarting(true, this.getWorld(cutscene.worldId));
    try {
      await waitForPreview(this.beginLoading(this.getWorld(cutscene.worldId), signal, cutscene.loadingPresentation), signal);
      const loaded = await waitForPreview(this.selectWorld(this.getWorld(cutscene.worldId), {
        controllerState: null,
        persistLocation: false,
        reveal: false,
        loadingPresentation: cutscene.loadingPresentation,
      }), signal);
      request.loadingWorld = false;
      if (!loaded) {
        this.showNotice(`${cutscene.label} could not be loaded.`);
        return false;
      }
      await waitForPreview(this.ensureCharacter(), signal);
      if (await this.startLoaded(cutsceneId, { signal }) !== true) return false;
      await this.finishLoading(signal);
      this.showNotice(`Playing ${cutscene.label}.`);
      return true;
    } catch (error) {
      if (signal.aborted) return false;
      console.error(`Cutscene ${cutscene.id} stopped:`, error);
      this.stopDirector("start-failed");
      this.showNotice(`${cutscene.label} could not start.`);
      return false;
    } finally {
      if (this.startingPreview === request) {
        this.startingPreview = null;
        this.setStarting(this.endingPreview !== null);
      }
    }
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
    this.setStarting(true, world);
    try {
      await waitForPreview(this.beginLoading(world, signal, cutscene.loadingPresentation), signal);
      await waitForPreview(this.physicsReady, signal);
      this.disposeMenuBackground();
      this.startPlayRuntime();
      preview.loadingWorld = true;
      // World preparation also begins loading internally. Forward the same
      // presentation so it cannot replace this scene's caption with world time.
      if (!this.getController()) {
        await waitForPreview(this.initializeWorld({
          initialWorldOverride: world,
          fetchServerState: false,
          persistInitialLocation: false,
          reveal: false,
          loadingPresentation: cutscene.loadingPresentation,
          signal,
        }), signal);
      } else {
        const loaded = await waitForPreview(this.selectWorld(world, {
          controllerState: null,
          persistLocation: false,
          reveal: false,
          loadingPresentation: cutscene.loadingPresentation,
        }), signal);
        if (!loaded) throw new Error(`${cutscene.label} could not be loaded.`);
      }
      preview.loadingWorld = false;
      await waitForPreview(this.ensureCharacter(), signal);
      if (!this.dialoguePersistence.gameplayState()) {
        this.dialoguePersistence.hydrate();
      }
      this.dialoguePersistence.beginSandbox();
      preview.dialogueSandbox = true;
      if (await this.startLoaded(cutsceneId, { signal }) !== true) {
        if (this.active === preview) this.complete();
      } else if (this.active === preview) {
        preview.started = true;
        await this.finishLoading(signal);
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
        this.setStarting(this.endingPreview !== null);
      }
    }
    return completion;
  }
}
