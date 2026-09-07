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

export class CutscenePreviewRuntime {
  constructor({
    getCutscene,
    getWorld,
    getActiveWorld,
    getController,
    selectWorld,
    initializeWorld,
    ensureCharacter,
    startDirector,
    stopDirector,
    dialoguePersistence,
    physicsReady,
    startPlayRuntime,
    disposeMenuBackground,
    setStarting,
    showNotice,
  }) {
    this.getCutscene = getCutscene;
    this.getWorld = getWorld;
    this.getActiveWorld = getActiveWorld;
    this.getController = getController;
    this.selectWorld = selectWorld;
    this.initializeWorld = initializeWorld;
    this.ensureCharacter = ensureCharacter;
    this.startDirector = startDirector;
    this.stopDirector = stopDirector;
    this.dialoguePersistence = dialoguePersistence;
    this.physicsReady = physicsReady;
    this.startPlayRuntime = startPlayRuntime;
    this.disposeMenuBackground = disposeMenuBackground;
    this.setStarting = setStarting;
    this.showNotice = showNotice;
    this.active = null;
  }

  async startLoaded(cutsceneId) {
    const cutscene = this.getCutscene(cutsceneId);
    const world = cutscene ? this.getWorld(cutscene.worldId) : null;
    if (!cutscene || !world || this.getActiveWorld() !== world) {
      throw new Error(`Cutscene ${cutsceneId} is not loaded`);
    }
    if (await this.startDirector(cutscene) !== true) {
      throw new Error(`Cutscene ${cutsceneId} native runtime rejected start`);
    }
  }

  complete() {
    const preview = this.active;
    if (!preview) return false;
    this.active = null;
    if (preview.dialogueSandbox) this.dialoguePersistence.endSandbox();
    preview.resolve();
    return true;
  }

  fail(cutscene, reason) {
    const preview = this.active;
    if (!preview) return false;
    this.active = null;
    if (preview.dialogueSandbox) this.dialoguePersistence.endSandbox();
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
    this.showNotice(`Loading ${cutscene.label}...`);
    this.setStarting(true);
    try {
      const loaded = await this.selectWorld(this.getWorld(cutscene.worldId), {
        controllerState: null,
        persistLocation: false,
      });
      if (!loaded) {
        this.showNotice(`${cutscene.label} could not be loaded.`);
        return false;
      }
      await this.ensureCharacter();
      await this.startLoaded(cutsceneId);
      this.showNotice(`Playing ${cutscene.label}.`);
      return true;
    } catch (error) {
      console.error(`Cutscene ${cutscene.id} stopped:`, error);
      this.stopDirector("start-failed");
      this.showNotice(`${cutscene.label} could not start.`);
      return false;
    } finally {
      this.setStarting(false);
    }
  }

  async playFromMenu(cutsceneId) {
    if (this.active) {
      throw new Error("Finish the current cutscene preview first.");
    }
    const cutscene = this.getCutscene(cutsceneId);
    const world = cutscene ? this.getWorld(cutscene.worldId) : null;
    if (!cutscene || !world) throw new Error("That cutscene is not available.");

    this.setStarting(true);
    let completion;
    try {
      await this.physicsReady;
      this.disposeMenuBackground();
      this.startPlayRuntime();
      if (!this.getController()) {
        await this.initializeWorld({
          initialWorldOverride: world,
          fetchServerState: false,
          persistInitialLocation: false,
        });
      } else {
        const loaded = await this.selectWorld(world, {
          controllerState: null,
          persistLocation: false,
        });
        if (!loaded) throw new Error(`${cutscene.label} could not be loaded.`);
      }
      await this.ensureCharacter();
      if (!this.dialoguePersistence.gameplayState()) {
        this.dialoguePersistence.hydrate();
      }
      this.dialoguePersistence.beginSandbox();
      completion = new Promise((resolve, reject) => {
        this.active = {
          cutsceneId,
          dialogueSandbox: true,
          resolve,
          reject,
        };
      });
      // The director may report failure while startLoaded is still pending.
      // Observe that rejection now; the original promise remains the result
      // returned to the caller when startup succeeds.
      void completion.catch(() => {});
      await this.startLoaded(cutsceneId);
    } catch (error) {
      if (this.active?.cutsceneId === cutsceneId) {
        this.active = null;
        this.dialoguePersistence.endSandbox();
      }
      this.stopDirector("start-failed");
      throw error;
    } finally {
      this.setStarting(false);
    }
    return completion;
  }
}
