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

function waitForPreparation(promise, signal) {
  if (!signal) return promise;
  let abort;
  const cancelled = new Promise((_, reject) => {
    abort = () => reject(signal.reason);
    if (signal.aborted) abort();
    else signal.addEventListener("abort", abort, { once: true });
  });
  // Observe the adapter promise even if it aborted its caller synchronously
  // while being constructed; a late rejection must never become unhandled.
  return Promise.race([cancelled, promise]).finally(() => {
    signal.removeEventListener("abort", abort);
  });
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
    this.startingRuntimes = new Map();
    this.worldGeneration = 0;
    this.activeCutscene = null;
    this.pendingStart = null;
    this.disposed = false;
    this.directActivityRuntime = null;
  }

  get active() {
    return Boolean(
      this.activeCutscene
      || this.pendingStart
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

  async start(cutscene, { signal: callerSignal = null } = {}) {
    if (this.disposed) throw new Error("native cutscene director is disposed");
    if (this.activeCutscene || this.directActivityRuntime) {
      throw new Error("another native cutscene is already active");
    }
    const definition = this.registry.requireForCutscene(cutscene);
    const packageRuntime = this.#runtimeFor(definition);
    if (this.pendingStart) this.stop("superseded");
    const controller = new AbortController();
    const pending = { cutscene, controller };
    this.pendingStart = pending;
    const abortFromCaller = () => {
      if (this.pendingStart === pending || this.activeCutscene?.controller === controller) {
        this.stop("user-cancelled");
      }
    };
    callerSignal?.addEventListener("abort", abortFromCaller, { once: true });
    if (callerSignal?.aborted) abortFromCaller();
    const { signal } = controller;
    let active = null;
    try {
      signal.throwIfAborted();
      let program = null;
      if (cutscene.program && packageRuntime.prepareCutscene) {
        const nativeRuntime = this.programRuntimeOptions?.getNativeRuntime?.();
        program = nativeRuntime?.loadProgram
          ? await waitForPreparation(nativeRuntime.loadProgram(
              cutscene.program.programId, { signal },
            ), signal)
          : nativeRuntime?.program(cutscene.program.programId);
        if (!program) throw new Error(`cutscene ${cutscene.id} native program is unavailable`);
      }
      await waitForPreparation(this.#ensureWorldLoaded(definition, packageRuntime, {
        cutscene, program, signal,
      }), signal);
      signal.throwIfAborted();
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
      active = { cutscene, kind, packageRuntime, runtime, releaseGameplay, controller };
      this.activeCutscene = active;
      this.pendingStart = null;
      // A cancelled start can settle its caller before asynchronous adapters
      // have released their resources. Retain that work as a package barrier
      // so retry cannot acquire a new actor lease beneath late cleanup.
      const starting = Promise.resolve()
        .then(() => {
          signal.throwIfAborted();
          return runtime.start(cutscene, { signal });
        })
        .finally(() => {
          if (this.startingRuntimes.get(definition.id) === starting) {
            this.startingRuntimes.delete(definition.id);
          }
        });
      this.startingRuntimes.set(definition.id, starting);
      const started = await waitForPreparation(starting, signal);
      // A stop may settle an asynchronously preparing native program before
      // start() returns. That is a normal cancelled start, not a second error.
      if (this.activeCutscene !== active) return false;
      if (started !== true) {
        throw new Error(`cutscene ${cutscene.id} native runtime rejected start`);
      }
      return true;
    } catch (error) {
      if (signal.aborted) return false;
      const errors = [error];
      try {
        if (active) active.runtime.stop("start-failed");
      } catch (cleanupError) {
        errors.push(cleanupError);
      } finally {
        if (active && this.activeCutscene === active) this.#releaseActive();
      }
      if (errors.length > 1) {
        throw new AggregateError(
          errors,
          `cutscene ${cutscene.id} failed to start and clean up`,
        );
      }
      throw error;
    } finally {
      if (this.pendingStart === pending) this.pendingStart = null;
      callerSignal?.removeEventListener("abort", abortFromCaller);
    }
  }

  update(deltaSeconds) {
    this.activeCutscene?.runtime.update(deltaSeconds);
  }

  stop(reason = "stopped") {
    const active = this.activeCutscene;
    const errors = [];
    const pending = this.pendingStart;
    if (pending) {
      this.pendingStart = null;
      pending.controller.abort(new DOMException(String(reason), "AbortError"));
      try {
        this.onStopped(pending.cutscene, reason);
      } catch (error) {
        errors.push(error);
      }
    }
    if (active) {
      active.controller?.abort(new DOMException(String(reason), "AbortError"));
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
    if (
      worldId === null
      || this.pendingStart?.cutscene.worldId === worldId
      || this.activeCutscene?.cutscene.worldId === worldId
    ) {
      if (this.pendingStart || this.activeCutscene) this.stop("world-change");
    }
    const definitions = worldId === null
      ? this.registry.definitions()
      : this.registry.forWorld(worldId);
    for (const definition of definitions) {
      this.loadingRuntimes.get(definition.id)?.controller.abort(
        new DOMException("world-change", "AbortError"),
      );
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
    this.disposed = true;
    this.stop("disposed");
    for (const runtime of this.runtimes.values()) runtime.dispose();
    this.loadedRuntimeIds.clear();
    for (const entry of this.loadingRuntimes.values()) {
      entry.controller.abort(new DOMException("disposed", "AbortError"));
    }
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
        const signal = activeProgram?.controller.signal;
        if (
          this.pendingStart
          || (this.activeCutscene && !activeProgram)
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
            { signal },
          );
          const currentProgram = this.activeCutscene?.kind === "program"
            ? this.activeCutscene
            : null;
          if (
            this.pendingStart
            || this.directActivityRuntime
            || (this.activeCutscene && !currentProgram)
            || currentProgram !== activeProgram
          ) {
            throw new Error("another native activity became active while loading");
          }
          this.directActivityRuntime = runtime;
          return await runtime.nativeActivityAdapter().startActivity(detail, { signal });
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

  async #ensureWorldLoaded(definition, runtime, {
    cutscene = null, program = null, signal = null,
  } = {}) {
    signal?.throwIfAborted();
    const starting = this.startingRuntimes.get(definition.id);
    const insideActiveProgram = this.activeCutscene?.kind === "program"
      && this.activeCutscene.packageRuntime === runtime;
    if (starting && !insideActiveProgram) {
      try {
        await waitForPreparation(starting, signal);
      } catch {
        // A rejected/cancelled previous start still has to finish unwinding
        // before a new package generation can safely acquire its resources.
      }
      signal?.throwIfAborted();
      return this.#ensureWorldLoaded(definition, runtime, { cutscene, program, signal });
    }
    const context = this.worldContext;
    if (context?.worldId !== definition.worldId) {
      throw new Error(
        `cutscene package ${definition.id} world ${definition.worldId} is not loaded`,
      );
    }
    const existing = this.loadingRuntimes.get(definition.id);
    if (existing) {
      try {
        await waitForPreparation(existing.promise, signal);
      } catch {
        // A superseded world load is expected to reject after rolling itself
        // back. Serialize the replacement so both generations never mutate
        // the same package runtime concurrently.
      }
      signal?.throwIfAborted();
      return this.#ensureWorldLoaded(definition, runtime, { cutscene, program, signal });
    }
    if (!cutscene && this.loadedRuntimeIds.has(definition.id)) return;
    const controller = new AbortController();
    const preparationSignal = signal
      ? AbortSignal.any([signal, controller.signal]) : controller.signal;
    const entry = { generation: context.generation, promise: null, controller };
    entry.promise = Promise.resolve()
      .then(async () => {
        preparationSignal.throwIfAborted();
        if (!this.loadedRuntimeIds.has(definition.id)) {
          await runtime.loadWorld(context.meshes, { signal: preparationSignal });
        }
        preparationSignal.throwIfAborted();
        if (cutscene && runtime.prepareCutscene) {
          await runtime.prepareCutscene(cutscene, { program, signal: preparationSignal });
        }
        preparationSignal.throwIfAborted();
      })
      .then(() => {
        if (
          this.worldContext !== context
          || this.worldGeneration !== context.generation
        ) {
          throw new Error(
            `cutscene package ${definition.id} world changed while loading`,
          );
        }
        this.loadedRuntimeIds.add(definition.id);
      })
      .catch(error => {
        // Keep this operation registered until all of its work has settled.
        // A replacement must not have its resources cleared by an old load.
        runtime.clearWorld();
        this.loadedRuntimeIds.delete(definition.id);
        throw error;
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
