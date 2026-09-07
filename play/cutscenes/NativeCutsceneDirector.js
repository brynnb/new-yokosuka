import {
  createNativeCutscenePackageRuntime,
} from "./NativeCutscenePackageRuntime.js";
import {
  createNativeProgramCutsceneRuntime,
} from "./NativeProgramCutsceneRuntime.js";

function requireFunction(value, label) {
  if (typeof value !== "function") throw new TypeError(`${label} is required`);
  return value;
}

export class NativeCutsceneDirector {
  constructor({
    registry,
    packageRuntimeOptions,
    acquireGameplay,
    onComplete,
    onStopped = () => {},
    createPackageRuntime = createNativeCutscenePackageRuntime,
    createProgramRuntime = createNativeProgramCutsceneRuntime,
    programRuntimeOptions = null,
  } = {}) {
    if (
      !registry
      || typeof registry.requireForCutscene !== "function"
      || typeof registry.definitions !== "function"
    ) {
      throw new TypeError("native cutscene package registry is required");
    }
    this.registry = registry;
    this.acquireGameplay = requireFunction(
      acquireGameplay,
      "native cutscene gameplay ownership adapter",
    );
    this.onComplete = requireFunction(
      onComplete,
      "native cutscene completion adapter",
    );
    this.onStopped = requireFunction(
      onStopped,
      "native cutscene stop adapter",
    );
    this.packageRuntimeOptions = packageRuntimeOptions;
    this.createPackageRuntime = requireFunction(
      createPackageRuntime,
      "native cutscene package runtime factory",
    );
    this.createProgramRuntime = requireFunction(
      createProgramRuntime,
      "native program cutscene runtime factory",
    );
    this.programRuntimeOptions = programRuntimeOptions;
    this.runtimes = new Map();
    this.worldContext = null;
    this.loadedRuntimeIds = new Set();
    this.loadingRuntimes = new Map();
    this.worldGeneration = 0;
    this.activeCutscene = null;
    this.directActivityRuntime = null;
  }

  get active() {
    return Boolean(
      this.activeCutscene
      || this.directActivityRuntime
      || [...this.runtimes.values()].some(runtime => runtime.active),
    );
  }

  get ownsPlayerPresentation() {
    return [...this.runtimes.values()].some(runtime => runtime.ownsPresentation);
  }

  ownsProgramActor(actorTag) {
    const active = this.activeCutscene;
    return Boolean(
      active?.kind === "program"
      && active.packageRuntime.ownsProgramActor(actorTag),
    );
  }

  resolveProgramActorReference(value) {
    let actorTag;
    if (typeof value === "string") {
      actorTag = value.toUpperCase();
    } else if (Number.isInteger(value)) {
      const word = value >>> 0;
      actorTag = String.fromCharCode(
        word & 0xff,
        word >>> 8 & 0xff,
        word >>> 16 & 0xff,
        word >>> 24 & 0xff,
      );
    } else {
      return null;
    }
    return this.ownsProgramActor(actorTag) ? actorTag : null;
  }

  actorDefinitionsForWorld(worldId) {
    return this.registry.actorDefinitionsForWorld(worldId);
  }

  actorTags() {
    return this.registry.actorTags();
  }

  activeProgramSoundCommands() {
    const active = this.activeCutscene;
    return active?.kind === "program"
      ? active.packageRuntime.definition.playback.ownerAudioCommands || []
      : [];
  }

  async start(cutscene) {
    if (this.activeCutscene || this.directActivityRuntime) {
      throw new Error("another native cutscene is already active");
    }
    const definition = this.registry.requireForCutscene(cutscene);
    const packageRuntime = this.#runtimeFor(definition);
    await this.#ensureWorldLoaded(definition, packageRuntime);
    if (this.activeCutscene || this.directActivityRuntime) {
      throw new Error("another native cutscene became active while loading");
    }
    const kind = cutscene.program ? "program" : "package";
    const runtime = kind === "program"
      ? this.#programRuntimeFor(cutscene, packageRuntime)
      : packageRuntime;
    const releaseGameplay = this.acquireGameplay(cutscene);
    if (typeof releaseGameplay !== "function") {
      throw new Error("native cutscene gameplay ownership was not acquired");
    }
    const active = {
      cutscene,
      kind,
      packageRuntime,
      runtime,
      releaseGameplay,
    };
    this.activeCutscene = active;
    try {
      const started = await runtime.start(cutscene);
      // A stop may settle an asynchronously preparing native program before
      // start() returns. That is a normal cancelled start, not a second error.
      if (this.activeCutscene !== active) return false;
      if (started !== true) {
        throw new Error(`cutscene ${cutscene.id} native runtime rejected start`);
      }
      return true;
    } catch (error) {
      const errors = [error];
      try {
        runtime.stop("start-failed");
      } catch (cleanupError) {
        errors.push(cleanupError);
      } finally {
        if (this.activeCutscene === active) this.#releaseActive();
      }
      if (errors.length > 1) {
        throw new AggregateError(
          errors,
          `cutscene ${cutscene.id} failed to start and clean up`,
        );
      }
      throw error;
    }
  }

  update(deltaSeconds) {
    this.activeCutscene?.runtime.update(deltaSeconds);
  }

  stop(reason = "stopped") {
    const active = this.activeCutscene;
    const errors = [];
    if (active) {
      try {
        active.runtime.stop(reason);
      } catch (error) {
        errors.push(error);
      } finally {
        if (this.activeCutscene === active) {
          this.#releaseActive();
          try {
            this.onStopped(active.cutscene, reason);
          } catch (error) {
            errors.push(error);
          }
        }
      }
    }
    if (this.directActivityRuntime) {
      const runtime = this.directActivityRuntime;
      try {
        runtime.nativeActivityAdapter().rollbackActivity(reason);
      } catch (error) {
        errors.push(error);
      } finally {
        if (this.directActivityRuntime === runtime) {
          this.directActivityRuntime = null;
        }
      }
    }
    if (errors.length > 0) {
      throw new AggregateError(errors, `native cutscene ${reason} cleanup failed`);
    }
    return true;
  }

  transportState() {
    return this.activeCutscene?.runtime.transportState()
      || Object.freeze({ active: false });
  }

  togglePaused() {
    const state = this.transportState();
    return state.active
      ? this.activeCutscene.runtime.setPaused(!state.paused)
      : false;
  }

  seekBySeconds(seconds) {
    return this.activeCutscene?.runtime.seekBySeconds(seconds) || false;
  }

  async loadWorld(worldId, meshes) {
    const normalizedWorldId = String(worldId || "");
    if (!normalizedWorldId || !Array.isArray(meshes)) {
      throw new TypeError("native cutscene world roots are required");
    }
    if (this.worldContext) {
      this.clearWorld(this.worldContext.worldId);
    }
    this.worldGeneration += 1;
    this.worldContext = {
      worldId: normalizedWorldId,
      meshes,
      generation: this.worldGeneration,
    };
  }

  clearWorld(worldId = null) {
    const definitions = worldId === null
      ? this.registry.definitions()
      : this.registry.forWorld(worldId);
    for (const definition of definitions) {
      if (!this.loadedRuntimeIds.has(definition.id)) continue;
      this.runtimes.get(definition.id)?.clearWorld();
      this.loadedRuntimeIds.delete(definition.id);
    }
    if (worldId === null || this.worldContext?.worldId === worldId) {
      this.worldGeneration += 1;
      this.worldContext = null;
    }
  }

  dispose() {
    this.stop("disposed");
    for (const runtime of this.runtimes.values()) runtime.dispose();
    this.loadedRuntimeIds.clear();
    this.loadingRuntimes.clear();
    this.worldGeneration += 1;
    this.worldContext = null;
  }

  nativeActivityAdapter(getWorldId) {
    requireFunction(getWorldId, "native activity world resolver");
    return Object.freeze({
      startActivity: async (detail) => {
        const activeProgram = this.activeCutscene?.kind === "program"
          ? this.activeCutscene
          : null;
        if (
          (this.activeCutscene && !activeProgram)
          || this.directActivityRuntime
        ) {
          throw new Error("another native activity is already active");
        }
        const runtime = this.#activityRuntimeForBinding(getWorldId(), detail);
        if (activeProgram && runtime !== activeProgram.packageRuntime) {
          throw new Error(
            `native program cutscene ${activeProgram.cutscene.id} cannot use package ${runtime.id}`,
          );
        }
        try {
          await this.#ensureWorldLoaded(
            this.#definitionForRuntime(runtime),
            runtime,
          );
          const currentProgram = this.activeCutscene?.kind === "program"
            ? this.activeCutscene
            : null;
          if (
            this.directActivityRuntime
            || (this.activeCutscene && !currentProgram)
            || currentProgram !== activeProgram
          ) {
            throw new Error("another native activity became active while loading");
          }
          this.directActivityRuntime = runtime;
          return await runtime.nativeActivityAdapter().startActivity(detail);
        } catch (error) {
          if (this.directActivityRuntime === runtime) {
            this.directActivityRuntime = null;
          }
          throw error;
        }
      },
      updateActivity: (detail) => {
        const runtime = this.directActivityRuntime;
        if (!runtime) return false;
        const accepted = runtime.nativeActivityAdapter().updateActivity(detail);
        if (accepted !== true && !runtime.ownsPresentation) {
          this.directActivityRuntime = null;
        }
        return accepted;
      },
      stopActivity: (detail) => {
        const runtime = this.directActivityRuntime;
        if (!runtime) return true;
        const stopped = runtime.nativeActivityAdapter().stopActivity(detail);
        if (stopped === true) this.directActivityRuntime = null;
        return stopped;
      },
      rollbackActivity: (reason) => {
        const runtime = this.directActivityRuntime;
        if (!runtime) return true;
        const stopped = runtime.nativeActivityAdapter().rollbackActivity(reason);
        if (stopped === true) this.directActivityRuntime = null;
        return stopped;
      },
      beginProgram: (detail) => {
        const active = this.activeCutscene;
        if (!active || active.kind !== "program") return null;
        if (detail?.program?.id !== active.cutscene.program.programId) {
          throw new Error(
            `native program ${String(detail?.program?.id)} does not own cutscene ${active.cutscene.id}`,
          );
        }
        const lease = active.packageRuntime.beginProgram(detail);
        return Object.freeze({
          packageId: active.packageRuntime.id,
          lease,
        });
      },
      updateProgram: ({ ownership } = {}) => {
        if (!ownership) return true;
        const runtime = this.runtimes.get(ownership.packageId);
        if (!runtime) {
          throw new Error("native program cutscene package is unavailable");
        }
        return runtime.updateProgramPresentation(ownership.lease);
      },
      completeProgram: ({ ownership } = {}) => (
        this.#endProgramOwnership(ownership, "complete")
      ),
      rollbackProgram: ({ ownership, reason } = {}) => (
        this.#endProgramOwnership(ownership, reason || "rolled-back")
      ),
    });
  }

  #activityRuntimeForBinding(worldId, detail) {
    const candidates = this.registry.forWorld(worldId).map(
      definition => this.#runtimeFor(definition),
    ).filter((runtime) => {
      const adapter = runtime.nativeActivityAdapter();
      return adapter?.acceptsActivity?.(detail) === true;
    });
    if (candidates.length !== 1) {
      throw new Error(
        `world ${worldId} has ${candidates.length} packages for native activity binding`,
      );
    }
    return candidates[0];
  }

  #runtimeFor(definition) {
    if (this.runtimes.has(definition.id)) {
      return this.runtimes.get(definition.id);
    }
    const runtime = this.createPackageRuntime({
      ...this.packageRuntimeOptions,
      definition,
      onComplete: cutsceneId => this.#complete(cutsceneId),
      onStopped: (reason, cutsceneId) => this.#stopped(reason, cutsceneId),
    });
    if (!runtime || runtime.id !== definition.id) {
      throw new Error(`cutscene package ${definition.id} runtime is invalid`);
    }
    this.runtimes.set(definition.id, runtime);
    return runtime;
  }

  #programRuntimeFor(cutscene, packageRuntime) {
    if (!this.programRuntimeOptions) {
      throw new Error(
        `cutscene ${cutscene.id} native program runtime is unavailable`,
      );
    }
    if (!packageRuntime || typeof packageRuntime.programContext !== "function") {
      throw new Error(
        `cutscene ${cutscene.id} package program context is unavailable`,
      );
    }
    const createContext = this.programRuntimeOptions.createContext;
    const runtime = this.createProgramRuntime({
      ...this.programRuntimeOptions,
      createContext: async (detail) => {
        const base = createContext ? await createContext(detail) : {};
        if (!base || typeof base !== "object" || Array.isArray(base)) {
          throw new TypeError("native program cutscene context is invalid");
        }
        return {
          ...base,
          ...packageRuntime.programContext(detail),
        };
      },
      onComplete: cutsceneId => this.#complete(cutsceneId),
      onStopped: (reason, cutsceneId) => this.#stopped(reason, cutsceneId),
    });
    if (!runtime || typeof runtime.start !== "function") {
      throw new Error(`cutscene ${cutscene.id} native program runtime is invalid`);
    }
    return runtime;
  }

  #definitionForRuntime(runtime) {
    const definition = this.registry.definitions().find(
      value => value.id === runtime.id,
    );
    if (!definition) {
      throw new Error(`cutscene package ${runtime.id} is not registered`);
    }
    return definition;
  }

  async #ensureWorldLoaded(definition, runtime) {
    if (this.loadedRuntimeIds.has(definition.id)) return;
    const context = this.worldContext;
    if (context?.worldId !== definition.worldId) {
      throw new Error(
        `cutscene package ${definition.id} world ${definition.worldId} is not loaded`,
      );
    }
    const existing = this.loadingRuntimes.get(definition.id);
    if (existing) {
      if (existing.generation === context.generation) return existing.promise;
      try {
        await existing.promise;
      } catch {
        // A superseded world load is expected to reject after rolling itself
        // back. Serialize the replacement so both generations never mutate
        // the same package runtime concurrently.
      }
      return this.#ensureWorldLoaded(definition, runtime);
    }
    const entry = { generation: context.generation, promise: null };
    entry.promise = Promise.resolve()
      .then(() => runtime.loadWorld(context.meshes))
      .then(() => {
        if (
          this.worldContext !== context
          || this.worldGeneration !== context.generation
        ) {
          runtime.clearWorld();
          throw new Error(
            `cutscene package ${definition.id} world changed while loading`,
          );
        }
        this.loadedRuntimeIds.add(definition.id);
      })
      .finally(() => {
        if (this.loadingRuntimes.get(definition.id) === entry) {
          this.loadingRuntimes.delete(definition.id);
        }
      });
    this.loadingRuntimes.set(definition.id, entry);
    return entry.promise;
  }

  #endProgramOwnership(ownership, reason) {
    if (!ownership) return true;
    const runtime = this.runtimes.get(ownership.packageId);
    if (!runtime) throw new Error("native program cutscene package is unavailable");
    return reason === "complete"
      ? runtime.completeProgram(ownership.lease)
      : runtime.rollbackProgram(ownership.lease, reason);
  }

  #complete(cutsceneId) {
    const active = this.activeCutscene;
    if (!active || active.cutscene.id !== cutsceneId) return;
    this.#releaseActive();
    this.onComplete(active.cutscene);
  }

  #stopped(reason, cutsceneId) {
    const active = this.activeCutscene;
    if (!active || active.cutscene.id !== cutsceneId) return;
    this.#releaseActive();
    this.onStopped(active.cutscene, reason);
  }

  #releaseActive() {
    const active = this.activeCutscene;
    if (!active) return;
    this.activeCutscene = null;
    active.releaseGameplay();
  }
}

export function createNativeCutsceneDirector(options) {
  return new NativeCutsceneDirector(options);
}
