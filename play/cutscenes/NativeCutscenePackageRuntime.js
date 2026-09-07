import {
  createNativeAseqActivityRuntime,
} from "../events/NativeAseqActivityRuntime.js";
import {
  createNativeAseqActorLookPointPresentation,
} from "../events/NativeAseqActorLookPointPresentation.js";
import {
  createNativeAseqAttachedObjectRuntime,
} from "../events/NativeAseqAttachedObjectRuntime.js";
import {
  createNativeAseqAudioPresentation,
} from "../events/NativeAseqAudioPresentation.js";
import {
  createNativeAseqBabylonActors,
  createNativeAseqBabylonCamera,
} from "../events/NativeAseqBabylonPresentation.js";
import {
  createNativeAseqDialoguePresentation,
} from "../events/NativeAseqDialoguePresentation.js";
import {
  createNativeAseqFacialPresentation,
} from "../events/NativeAseqFacialPresentation.js";
import {
  createNativeAseqHandPresentation,
} from "../events/NativeAseqHandPresentation.js";
import {
  createNativeAseqMapLayerRuntime,
} from "../events/NativeAseqMapLayerRuntime.js";
import {
  createNativeAseqPackageActorRuntime,
} from "../events/NativeAseqPackageActorRuntime.js";
import {
  createNativeAseqPresentationRuntime,
} from "../events/NativeAseqPresentationRuntime.js";
import {
  createNativeCompositeProgramPresentation,
} from "../events/NativeCompositeProgramPresentation.js";
import {
  createNativeAseqSceneObjectRuntime,
} from "../events/NativeAseqSceneObjectRuntime.js";
import {
  createNativeScrollSpritePresentation,
} from "../events/NativeScrollSpritePresentation.js";
import {
  createNativeAseqStandaloneActivityRuntime,
} from "../events/NativeAseqStandaloneActivityRuntime.js";
import {
  createNativeSecondaryMotionPresentation,
} from "../characters/NativeSecondaryMotionRuntime.js";
import {
  createNativeClothPresentation,
} from "../characters/NativeClothBabylonPresentation.js";
import {
  createNativeCutsceneSceneObjectLoader,
} from "./NativeCutsceneSceneObjectLoader.js";
import {
  createNativeCutsceneCharacterLoader,
} from "./NativeCutsceneCharacterLoader.js";
import { createNativeTmnmMotionPresentation } from "../events/NativeTmnmMotionPresentation.js";
import {
  resolveNativeCutsceneFacialAssets,
} from "./NativeCutsceneFacialAssets.js";
import {
  createNativeCutsceneMusicRuntime,
} from "./NativeCutsceneMusicRuntime.js";

function hasDefinitions(value) {
  return value && Object.keys(value).length > 0;
}

function createAssetLoader(definition, fetchArrayBuffer) {
  const urls = new Map(Object.entries(definition.assets));
  return (sourcePath, options) => {
    const url = urls.get(sourcePath);
    if (!url) {
      throw new Error(
        `cutscene package ${definition.id} asset ${sourcePath} is not bundled`,
      );
    }
    return fetchArrayBuffer(url, options);
  };
}

function createAssetUrlResolver(definition) {
  const urls = new Map(Object.entries(definition.assets));
  return (sourcePath) => {
    const url = urls.get(sourcePath);
    if (!url) {
      throw new Error(
        `cutscene package ${definition.id} asset ${sourcePath} is not bundled`,
      );
    }
    return url;
  };
}

function createSpeakerNameResolver(actorDefinitions) {
  const labels = new Map(actorDefinitions.map(definition => (
    [definition.actorCode.toUpperCase(), definition.label]
  )));
  return actorCode => labels.get(String(actorCode || "").toUpperCase()) || null;
}

export class NativeCutscenePackageRuntime {
  constructor({
    definition,
    scene,
    camera,
    getPlayerModel,
    syncPlayerTransform,
    scheduledActors,
    motionRuntime,
    audioPreferences,
    dialogueAudio,
    dialogueDom,
    musicControls,
    fetchArrayBuffer,
    getSkybox = null,
    controlActorLookPoint = null,
    onComplete,
    onStopped,
    createCompositeProgramPresentation =
      createNativeCompositeProgramPresentation,
    createScrollSpritePresentation = createNativeScrollSpritePresentation,
  } = {}) {
    if (
      !definition
      || !scene
      || !camera
      || typeof getPlayerModel !== "function"
      || typeof syncPlayerTransform !== "function"
      || typeof fetchArrayBuffer !== "function"
      || typeof onComplete !== "function"
      || typeof onStopped !== "function"
      || typeof createCompositeProgramPresentation !== "function"
      || typeof createScrollSpritePresentation !== "function"
    ) {
      throw new TypeError("native cutscene package runtime dependencies are incomplete");
    }
    this.definition = definition;
    this.onComplete = onComplete;
    this.onStopped = onStopped;
    this.activeCutsceneId = null;
    this.programLease = null;
    this.programSceneState = null;
    this.programPresentationBegun = false;
    this.compositeProgramPresentation = null;
    this.createCompositeProgramPresentation =
      createCompositeProgramPresentation;
    this.loadAsset = createAssetLoader(definition, fetchArrayBuffer);
    this.resolveAssetUrl = createAssetUrlResolver(definition);

    const environment = definition.environment || {};
    this.sceneObjects = hasDefinitions(environment.sceneObjects)
      ? createNativeAseqSceneObjectRuntime({
          definitions: environment.sceneObjects,
          instantiateAsset: createNativeCutsceneSceneObjectLoader({
            scene,
            loadAsset: this.loadAsset,
          }),
        })
      : null;
    this.mapLayers = hasDefinitions(environment.mapLayers)
      ? createNativeAseqMapLayerRuntime({
          definitions: environment.mapLayers,
          geometryMasks: environment.mapGeometryMasks,
        })
      : null;
    this.scrollSprites = hasDefinitions(environment.scrollSprites)
      ? createScrollSpritePresentation({
          scene,
          definitions: environment.scrollSprites,
          loadAsset: this.loadAsset,
          resolveAssetUrl: this.resolveAssetUrl,
          getSkybox,
        })
      : null;
    this.packageActors = hasDefinitions(environment.packageActors)
      ? createNativeAseqPackageActorRuntime({
          definitions: environment.packageActors,
          instantiate: createNativeCutsceneCharacterLoader({
            scene,
            loadAsset: this.loadAsset,
          }),
        })
      : null;

    this.actors = createNativeAseqBabylonActors({
      getPlayerModel,
      syncPlayerTransform,
      scheduledActors,
      motionRuntime,
      sceneObjects: this.sceneObjects,
      packageActors: this.packageActors,
      playerYawOffsetRadians: Math.PI,
      ...definition.actors,
    });
    this.attachedObjects = hasDefinitions(environment.attachedObjects)
      ? createNativeAseqAttachedObjectRuntime({
          definitions: environment.attachedObjects,
          resolveActor: actorTag => this.actors.activeActor(actorTag),
          instantiateAsset: createNativeCutsceneSceneObjectLoader({
            scene,
            loadAsset: this.loadAsset,
          }),
        })
      : null;

    const presentation = definition.presentation || {};
    const facialAssets = resolveNativeCutsceneFacialAssets(
      presentation.facialAssets,
      presentation.facialActorAliases,
    );
    this.facialAssets = facialAssets;
    this.programFaceTable = new Map();
    const faces = hasDefinitions(facialAssets)
      ? createNativeAseqFacialPresentation({
          scene,
          actors: this.actors,
          definitions: facialAssets,
          loadAsset: this.loadAsset,
        })
      : null;
    const hands = hasDefinitions(presentation.handAssets)
      ? createNativeAseqHandPresentation({
          scene,
          actors: this.actors,
          definitions: presentation.handAssets,
          loadAsset: this.loadAsset,
        })
      : null;
    this.audio = createNativeAseqAudioPresentation({
      preferences: audioPreferences,
      dialogueAudio,
      voicePresentation: createNativeAseqDialoguePresentation({
        ...dialogueDom,
        speakerNameForId: createSpeakerNameResolver(definition.actorDefinitions),
      }),
    });
    this.presentation = createNativeAseqPresentationRuntime({
      actors: this.actors,
      camera: createNativeAseqBabylonCamera(camera),
      audio: this.audio,
      faces,
      hands,
      actorLookPoints: typeof controlActorLookPoint === "function"
        ? createNativeAseqActorLookPointPresentation({
            actors: this.actors,
            controlActorLookPoint,
          })
        : null,
      secondaryMotion: createNativeSecondaryMotionPresentation({
        actors: this.actors,
      }),
      cloth: createNativeClothPresentation({
        actors: this.actors,
        definitions: presentation.clothTracks,
        loadAsset: this.loadAsset,
      }),
      nodeMotion: presentation.nodeMotion
        ? createNativeTmnmMotionPresentation({
            actors: this.actors,
            definition: presentation.nodeMotion,
            loadAsset: this.loadAsset,
          })
        : null,
    });
    this.music = createNativeCutsceneMusicRuntime(
      definition.music,
      musicControls,
    );

    this.activityRuntime = createNativeAseqActivityRuntime({
      manifest: definition.playback.manifest,
      audioManifest: definition.playback.audioManifest,
      audioManifests: definition.playback.audioManifests,
      loadAsset: this.loadAsset,
      presentation: this.presentation,
      onActivityPreparing: activity => {
        if ((this.scrollSprites?.beginActivity?.(activity) ?? true) !== true) {
          return false;
        }
        if ((this.sceneObjects?.prepareActivity(activity) ?? true) !== true) {
          return false;
        }
        return this.#applyActivityProgramCues(activity, "before");
      },
      onActivityStarted: activity => (
        this.mapLayers?.applyActivity(activity) ?? true
      ),
      onActivityAdvanced: (activity, frame) => (
        this.#applyActivityProgramCues(activity, "frames", frame)
      ),
      onActivityStopped: (activity, reason) => (
        reason === "complete"
          ? this.#applyActivityProgramCues(activity, "after")
          : true
      ),
    });
    this.playback = createNativeAseqStandaloneActivityRuntime({
      activityRuntime: this.activityRuntime,
      onStarted: activity => (
        this.attachedObjects?.beginActivity(activity) ?? true
      ),
      onComplete: cutsceneId => this.#finish(true, "complete", cutsceneId),
      onStopped: (reason, cutsceneId) => (
        this.#finish(false, reason, cutsceneId)
      ),
    });
  }

  get id() {
    return this.definition.id;
  }

  get worldId() {
    return this.definition.worldId;
  }

  get active() {
    return Boolean(this.playback.active || this.presentation.active);
  }

  get ownsPresentation() {
    return Boolean(
      this.presentation.active
      || (this.programLease && this.actors.ownsPlayerProgram),
    );
  }

  async start(cutscene, { signal } = {}) {
    signal?.throwIfAborted();
    if (this.activeCutsceneId) {
      throw new Error(`cutscene package ${this.id} is already playing`);
    }
    this.activeCutsceneId = cutscene.id;
    try {
      await this.playback.start({
        id: cutscene.id,
        activity: cutscene.activity,
      }, { signal });
      signal?.throwIfAborted();
      this.music.beginActivity(cutscene.activity);
      return true;
    } catch (error) {
      this.activeCutsceneId = null;
      this.#cleanupPresentation();
      throw error;
    }
  }

  update(deltaSeconds) {
    this.playback.update(deltaSeconds);
    this.attachedObjects?.update(
      this.playback.currentActivityPosition?.()?.frame,
    );
  }

  stop(reason = "stopped") {
    const stopped = this.playback.stop(reason);
    if (this.activityRuntime?.active) {
      this.activityRuntime.rollbackActivity(reason);
    }
    if (this.activeCutsceneId) this.#finish(false, reason);
    else this.#cleanupPresentation();
    return stopped;
  }

  setPaused(paused) {
    if (typeof this.playback.setPaused !== "function") return false;
    if (this.playback.setPaused(paused) !== true) return false;
    this.music.setPaused(paused);
    return true;
  }

  seekBySeconds(seconds) {
    if (typeof this.playback.seekBySeconds !== "function") return false;
    const state = this.transportState();
    if (!state.active) return false;
    this.music.setPaused(true);
    try {
      return this.playback.seekBySeconds(seconds);
    } finally {
      this.music.setPaused(state.paused);
    }
  }

  transportState() {
    return this.playback.transportState?.() || Object.freeze({ active: false });
  }

  async loadWorld(meshes, { signal } = {}) {
    try {
      signal?.throwIfAborted();
      // Scene objects and archive-local actors are independent, so retain the
      // parallel load. Waiting for every result before inspecting failures is
      // important: Promise.all would reject early and let the other loader
      // repopulate its state after rollback had already run.
      const results = await Promise.allSettled([
        Promise.resolve().then(() => this.sceneObjects?.load(meshes)),
        Promise.resolve().then(() => this.packageActors?.load()),
        Promise.resolve().then(() => this.scrollSprites?.load()),
      ]);
      const failed = results.find(result => result.status === "rejected");
      if (failed) throw failed.reason;
      signal?.throwIfAborted();

      this.mapLayers?.load(meshes);
      await this.attachedObjects?.load(meshes);
      signal?.throwIfAborted();
    } catch (error) {
      this.clearWorld();
      throw error;
    }
  }

  async prepareCutscene(cutscene, { program, signal } = {}) {
    signal?.throwIfAborted();
    const selections = cutscene.program
      ? this.activityRuntime.catalog.selectionsForProgram(
          program,
          cutscene.program.entryFunction,
        )
      : [cutscene.activity];
    await this.presentation.prepareProgramAssets?.();
    signal?.throwIfAborted();
    await this.activityRuntime.prepareActivities(selections, { signal });
    signal?.throwIfAborted();
    // Native owners can reference actors outside the selected AUTH's tags.
    // Prepare that declared ownership set without warming other world NPCs.
    if (cutscene.program && this.presentation.prepareActors) {
      await this.presentation.prepareActors({ actors: this.definition.actorTags }, { signal });
      signal?.throwIfAborted();
    }
    return true;
  }

  beginProgram(detail = {}) {
    if (this.programLease) {
      throw new Error(`cutscene package ${this.id} already owns a native program`);
    }
    if (this.active) {
      throw new Error(
        `cutscene package ${this.id} cannot begin a program during AUTH presentation`,
      );
    }
    const owner = Object.freeze({
      kind: "native-cutscene-package-program",
      packageId: this.id,
      programId: String(detail?.program?.id || ""),
    });
    if (!owner.programId) {
      throw new TypeError(`cutscene package ${this.id} native program ID is required`);
    }
    let actorsBegun = false;
    let compositePresentation = null;
    let compositeBegun = false;
    let scrollSpritesBegun = false;
    const sceneState = detail.sceneState;
    try {
      if (this.actors.beginProgram(owner, this.definition.actorTags) !== true) {
        throw new Error(
          `cutscene package ${this.id} rejected native program ownership`,
        );
      }
      actorsBegun = true;
      if (this.presentation.beginProgram(owner, {
        continuousActivities:
          detail.program?.preview?.kind === "exact-auth-activity-sequence-v1",
        actorTags: this.definition.actorTags,
      }) !== true) {
        throw new Error(
          `cutscene package ${this.id} rejected native program presentation`,
        );
      }
      this.programPresentationBegun = true;
      if (!sceneState) {
        throw new Error(
          `cutscene package ${this.id} native program scene state is unavailable`,
        );
      }
      this.programSceneState = sceneState;
      const facialAssets = this.facialAssets;
      for (const actorTag of this.definition.actorTags) {
        const actorAvailable = Boolean(this.actors.programActor(actorTag));
        const faceAvailable = Boolean(facialAssets[actorTag]);
        sceneState.configureActorOsagState({
          actorTag,
          available: actorAvailable,
          osagNodeBytes: null,
          controllerFlagByte: 0x08,
        });
        sceneState.configureActorControllerWordState({
          actorTag,
          actorAvailable,
          controllerAvailable: actorAvailable,
        });
        sceneState.configureObjectMapcRecord({
          objectTag: actorTag,
          objectAvailable: actorAvailable,
          recordAvailable: actorAvailable,
          controlWord: 0,
        });
        sceneState.configureActorMomtByte6fState({
          objectTag: actorTag,
          actorAvailable,
          momtAvailable: actorAvailable,
          value: 0,
        });
        sceneState.configureActorMomtFlagState({
          objectTag: actorTag,
          actorAvailable,
          momtAvailable: actorAvailable,
          flagsWord: 0,
        });
        sceneState.configureObjectFigpRecord({
          objectTag: actorTag,
          actorAvailable,
          recordAvailable: actorAvailable,
        });
        sceneState.configureActorFaceController({
          actorTag,
          actorAvailable,
          momtAvailable: actorAvailable,
          faceAvailable,
        });
        sceneState.configureActorFaceClipControl({
          actorTag,
          actorAvailable,
          momtAvailable: actorAvailable,
          faceAvailable,
          clipAvailable: faceAvailable,
        });
        this.programFaceTable.set(actorTag, Object.freeze({
          actorTag,
          activity: faceAvailable && actorAvailable ? 1 : 0,
          refreshCount: 0,
        }));
      }
      const nodeMotion = this.definition.presentation?.nodeMotion;
      if (nodeMotion) {
        sceneState.configureObjectTmnmRecord({
          objectTag: nodeMotion.actorTag,
          word0c: 0,
          word10: 0,
          word14: 0,
          word18: 0,
          word1c: 0,
        });
      }
      for (const binding of this.activityRuntime?.embeddedBindings?.() ?? []) {
        sceneState.installNativeEmbeddedAuthBinding(binding);
      }
      for (const [actorTag, definition] of Object.entries(
        this.definition.environment?.packageActors || {},
      )) {
        if (!Number.isSafeInteger(definition.nativeSecondaryMotionRuntimeMode)) {
          continue;
        }
        sceneState.configureNativeSecondaryMotionActor({
          actorTag,
          actorAvailable: Boolean(this.actors.programActor(actorTag)),
          recordAvailable: true,
          modeByte06: definition.nativeSecondaryMotionRuntimeMode,
          flagsByte00: 0,
          initialized: true,
        });
      }
      if (this.scrollSprites) {
        if (this.scrollSprites.begin(owner, sceneState) !== true) {
          throw new Error(
            `cutscene package ${this.id} rejected native scroll sprites`,
          );
        }
        scrollSpritesBegun = true;
      }
      const leasedActors = this.actors.programActors(owner);
      if (!Array.isArray(leasedActors) || leasedActors.length === 0) {
        throw new Error(
          `cutscene package ${this.id} native program actor lease is unavailable`,
        );
      }
      const actorsByTag = new Map();
      for (const actor of leasedActors) {
        const actorTag = String(actor?.actorCode || "").toUpperCase();
        if (!actorTag || !actor?.root || actorsByTag.has(actorTag)) {
          throw new Error(
            `cutscene package ${this.id} native program actor lease is invalid`,
          );
        }
        actorsByTag.set(actorTag, actor);
      }
      const rawStateOnlyActorTags =
        this.definition.playback.stateOnlyActorTags || [];
      if (
        !Array.isArray(rawStateOnlyActorTags)
      ) {
        throw new Error(
          `cutscene package ${this.id} state-only actor list is invalid`,
        );
      }
      const stateOnlyActorTags = rawStateOnlyActorTags.map(
        tag => String(tag || "").toUpperCase(),
      );
      if (
        new Set(stateOnlyActorTags).size !== stateOnlyActorTags.length
        || stateOnlyActorTags.some(tag => !/^[A-Z0-9_]{4}$/.test(tag))
      ) {
        throw new Error(
          `cutscene package ${this.id} state-only actor list is invalid`,
        );
      }
      const presentationActorTags = [
        ...actorsByTag.keys(),
        ...stateOnlyActorTags.filter(tag => !actorsByTag.has(tag)),
      ];
      compositePresentation = this.createCompositeProgramPresentation({
        sceneState,
        resolveProgramActor: (_presentationOwner, actorTag) => (
          this.actors.programActor(actorTag)
          || (stateOnlyActorTags.includes(actorTag)
            ? { actorCode: actorTag, stateOnly: true }
            : null)
        ),
        syncActorTransform: actorTag => {
          if (actorsByTag.has(actorTag)) {
            this.actors.syncProgramActorTransform(owner, actorTag);
          }
        },
      });
      if (compositePresentation.begin(owner, presentationActorTags) !== true) {
        throw new Error(
          `cutscene package ${this.id} rejected composite program presentation`,
        );
      }
      compositeBegun = true;
      this.compositeProgramPresentation = compositePresentation;
      this.programLease = owner;
      return owner;
    } catch (error) {
      const cleanupErrors = [];
      if (sceneState) {
        for (const binding of [
          ...(this.activityRuntime?.embeddedBindings?.() ?? []),
        ].reverse()) {
          try {
            sceneState.uninstallNativeEmbeddedAuthBinding(binding);
          } catch (cleanupError) {
            cleanupErrors.push(cleanupError);
          }
        }
      }
      if (compositeBegun) {
        try {
          if (compositePresentation.end(owner) !== true) {
            throw new Error("native composite presentation cleanup was rejected");
          }
        } catch (cleanupError) {
          cleanupErrors.push(cleanupError);
        }
        this.compositeProgramPresentation = null;
      }
      if (scrollSpritesBegun) {
        try {
          if (this.scrollSprites.end(owner) !== true) {
            throw new Error("native scroll sprite cleanup was rejected");
          }
        } catch (cleanupError) {
          cleanupErrors.push(cleanupError);
        }
      }
      if (this.programPresentationBegun) {
        try {
          if (this.presentation.endProgram(owner) !== true) {
            throw new Error("native program presentation cleanup was rejected");
          }
        } catch (cleanupError) {
          cleanupErrors.push(cleanupError);
        }
        this.programPresentationBegun = false;
      }
      if (actorsBegun) {
        try {
          if (this.actors.endProgram(owner, "begin-failed") !== true) {
            throw new Error("native program actor cleanup was rejected");
          }
        } catch (cleanupError) {
          cleanupErrors.push(cleanupError);
        }
      }
      this.programFaceTable.clear();
      this.programSceneState = null;
      if (cleanupErrors.length > 0) {
        throw new AggregateError(
          [error, ...cleanupErrors],
          `cutscene package ${this.id} program acquisition cleanup failed`,
          { cause: error },
        );
      }
      throw error;
    }
  }

  programContext() {
    return Object.freeze({
      applyNativeTmnmResource: detail => Boolean(
        this.programLease
        && this.presentation.applyNodeMotionResource(this.programLease, detail),
      ),
      resolveNativeFaceTableActor: actorTag => {
        const tag = String(actorTag || "").toUpperCase();
        if (!this.programLease || !this.programFaceTable.has(tag)) return null;
        return this.actors.programActor(tag);
      },
      refreshNativeFaceTable: ({ actorTag, actor }) => {
        const tag = String(actorTag || "").toUpperCase();
        const current = this.programFaceTable.get(tag);
        if (!this.programLease || !current || actor !== this.actors.programActor(tag)) {
          throw new Error(`native FACE table actor ${tag} is not program-owned`);
        }
        const next = Object.freeze({
          ...current,
          refreshCount: current.refreshCount + 1,
        });
        this.programFaceTable.set(tag, next);
        return next;
      },
      queryNativeFaceActorActivity: ({ actorTag, actor }) => {
        const tag = String(actorTag || "").toUpperCase();
        if (!this.programLease || actor !== this.actors.programActor(tag)) return 0;
        return this.programFaceTable.get(tag)?.activity || 0;
      },
    });
  }

  updateProgramPresentation(owner = this.programLease) {
    if (!owner || this.programLease !== owner) return false;
    if (!this.compositeProgramPresentation) {
      throw new Error(
        `cutscene package ${this.id} composite program presentation is unavailable`,
      );
    }
    this.compositeProgramPresentation.update(owner);
    return true;
  }

  ownsProgramActor(actorTag) {
    return Boolean(this.programLease && this.actors.programActor(actorTag));
  }

  completeProgram(owner) {
    return this.#endProgram(owner, "complete");
  }

  rollbackProgram(owner, reason = "rolled-back") {
    return this.#endProgram(owner, reason);
  }

  clearWorld() {
    if (this.programLease) {
      try {
        this.#endProgram(this.programLease, "world-cleared");
      } catch {
        // Component clear methods below are the final, independently owned
        // rollback boundary for a damaged presentation lease.
      }
    }
    this.sceneObjects?.clear();
    this.packageActors?.clear();
    this.scrollSprites?.clear();
    this.mapLayers?.clear();
    this.attachedObjects?.clear();
  }

  dispose() {
    this.stop("disposed");
    this.clearWorld();
    this.audio.dispose();
  }

  nativeActivityAdapter() {
    if (!this.activityRuntime) return null;
    return Object.freeze({
      acceptsActivity: detail => this.activityRuntime.acceptsActivity(detail),
      startActivity: async (detail, { signal } = {}) => {
        signal?.throwIfAborted();
        // A native operation can mutate an actor and launch AUTH in the same
        // interpreter turn. Flush the program state before AUTH captures and
        // writes frame zero so the activity never starts from stale roots.
        if (this.programLease) this.updateProgramPresentation();
        const activity = await this.activityRuntime.startActivity(detail, { signal });
        try {
          signal?.throwIfAborted();
          if (this.attachedObjects?.beginActivity(activity) === false) {
            throw new Error(
              `cutscene package ${this.id} rejected attached objects`,
            );
          }
          this.music.beginActivity({ ...detail, ...activity });
          return activity;
        } catch (error) {
          this.activityRuntime.rollbackActivity("package-start-failed");
          this.#cleanupPresentation();
          throw error;
        }
      },
      updateActivity: (detail) => {
        const accepted = this.activityRuntime.updateActivity(detail);
        if (accepted === true) this.attachedObjects?.update(detail.currentFrame);
        if (accepted !== true && this.activityRuntime.lastUpdateError) {
          throw this.activityRuntime.lastUpdateError;
        }
        return accepted;
      },
      stopActivity: (detail) => {
        const stopped = this.activityRuntime.stopActivity(detail);
        if (stopped === true) this.#cleanupPresentation({ completedActivity: true });
        return stopped;
      },
      rollbackActivity: (reason) => {
        const stopped = this.activityRuntime.rollbackActivity(reason);
        if (stopped === true) this.#cleanupPresentation();
        return stopped;
      },
    });
  }

  #applyActivityProgramCues(activity, phase, frame = null) {
    const phaseCues = activity?.programPresentationCues?.[phase] || [];
    const cues = phase === "frames"
      ? phaseCues.find(value => value?.frame === frame)?.cues || []
      : phaseCues;
    if (!Array.isArray(cues)) {
      throw new TypeError(
        `AUTH activity ${activity?.activityId} program cues are invalid`,
      );
    }
    if (cues.length === 0) return true;
    if (!this.programLease || !this.programSceneState) {
      throw new Error(
        `AUTH activity ${activity.activityId} program cues require program ownership`,
      );
    }
    for (const cue of cues) {
      if (cue?.kind === "node-motion-resource") {
        if (this.presentation.applyNodeMotionResource(this.programLease, cue) !== true) {
          throw new Error(
            `AUTH activity ${activity.activityId} node-motion cue was rejected`,
          );
        }
        continue;
      }
      if (cue?.kind === "scroll-transition") {
        const mutation = this.programSceneState.scrollSpriteControlState
          ?.requestTransition({
            slotIndex: cue.slotIndex,
            controlMode: cue.controlMode,
            duration: cue.durationFrames,
          });
        if (!mutation?.applied) {
          throw new Error(
            `AUTH activity ${activity.activityId} scroll cue was rejected`,
          );
        }
        continue;
      }
      throw new Error(
        `AUTH activity ${activity.activityId} program cue ${cue?.kind || "<unknown>"} is unsupported`,
      );
    }
    return true;
  }

  #finish(completed, reason, cutsceneId = this.activeCutsceneId) {
    if (!this.activeCutsceneId || cutsceneId !== this.activeCutsceneId) return;
    this.activeCutsceneId = null;
    this.#cleanupPresentation();
    if (completed) this.onComplete(cutsceneId);
    else this.onStopped(reason, cutsceneId);
  }

  #cleanupPresentation({ completedActivity = false } = {}) {
    const errors = [];
    for (const cleanup of [
      () => this.mapLayers?.end(),
      () => this.attachedObjects?.endTrack(),
      () => completedActivity
        ? this.music.endActivity({ programActive: Boolean(this.programLease) })
        : this.music.reset(),
    ]) {
      try {
        cleanup();
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length > 0) {
      throw new AggregateError(
        errors,
        `cutscene package ${this.id} presentation cleanup failed`,
      );
    }
  }

  #endProgram(owner, reason) {
    if (this.programLease !== owner) return false;
    if (this.activityRuntime?.active || this.presentation.active) {
      throw new Error(
        `cutscene package ${this.id} cannot end a native program during AUTH presentation`,
      );
    }
    const errors = [];
    if (this.programSceneState) {
      for (const binding of [
        ...(this.activityRuntime?.embeddedBindings?.() ?? []),
      ].reverse()) {
        try {
          this.programSceneState.uninstallNativeEmbeddedAuthBinding(binding);
        } catch (error) {
          errors.push(error);
        }
      }
    }
    if (this.compositeProgramPresentation) {
      try {
        if (this.compositeProgramPresentation.end(owner) !== true) {
          throw new Error(
            `cutscene package ${this.id} lost composite program presentation`,
          );
        }
      } catch (error) {
        errors.push(error);
      }
      this.compositeProgramPresentation = null;
    }
    if (this.scrollSprites) {
      try {
        if (this.scrollSprites.end(owner) !== true) {
          throw new Error(
            `cutscene package ${this.id} lost native scroll sprite ownership`,
          );
        }
      } catch (error) {
        errors.push(error);
      }
    }
    if (this.programPresentationBegun) {
      try {
        if (this.presentation.endProgram(owner) !== true) {
          throw new Error(
            `cutscene package ${this.id} lost native program presentation`,
          );
        }
      } catch (error) {
        errors.push(error);
      }
      this.programPresentationBegun = false;
    }
    try {
      if (this.actors.endProgram(owner, reason) !== true) {
        throw new Error(
          `cutscene package ${this.id} lost native program ownership`,
        );
      }
    } catch (error) {
      errors.push(error);
    }
    this.programLease = null;
    this.programSceneState = null;
    this.programFaceTable.clear();
    try {
      this.#cleanupPresentation();
    } catch (error) {
      errors.push(error);
    }
    try {
      if (this.presentation.reset() !== true) {
        errors.push(new Error(
          `cutscene package ${this.id} could not reset AUTH presentation state`,
        ));
      }
    } catch (error) {
      errors.push(error);
    }
    if (errors.length > 0) {
      throw new AggregateError(
        errors,
        `cutscene package ${this.id} native program ${reason} cleanup failed`,
      );
    }
    return true;
  }
}

export function createNativeCutscenePackageRuntime(options) {
  return new NativeCutscenePackageRuntime(options);
}
