import {
  DEFAULT_THIRD_PERSON_CONTROLLER_OPTIONS,
  ThirdPersonController,
} from "../../src/ThirdPersonController.js";
import {
  MARTIAL_ARTS_FOLLOWUP_STAGES,
  MARTIAL_ARTS_MOVES,
  MARTIAL_ARTS_STRING_STAGES,
} from "../../src/MartialArtsCombat.js";
import {
  CHARACTER_BY_ID,
} from "../config/characters.js";
import {
  EMOTES,
  EMOTE_BLEND_TICKS,
  GAME_TICKS_PER_SECOND,
  LOCOMOTION_BLEND_SECONDS,
  LOCOMOTION_MOTION_FILES,
  LOCOMOTION_STATES,
  PICKER_EMOTE_IDS,
  RUNTIME_EMOTES,
  SEQUENCES,
} from "../config/animations.js";
import { AnimationStateMachine } from "./AnimationStateMachine.js";
import { EmoteController } from "./EmoteController.js";
import {
  playableLocomotionModelYawOffset,
} from "./PlayableLocomotionRuntime.js";
import {
  loadPlayerMotionLibrary,
  prefetchPlayerMotionLibrary,
  PLAYER_COMBAT_CONFIG,
} from "./PlayerMotionLibrary.js";
import { PlayerCombatRuntime } from "./PlayerCombatRuntime.js";
import { createCombatRootMotionApplier } from "../combat/CombatRootMotion.js";
import { Vector3 } from "@babylonjs/core";

export class PlayerRuntime {
  constructor({
    scene,
    camera,
    actorRoot,
    modelOffset,
    combatEnemyRoot,
    combatEnemyModelOffset,
    characterRuntime,
    locomotionRuntime,
    getWorld,
    getRaycastIndex,
    getSpawn,
    getSpawnYaw,
    getRunSpeedMultiplier,
    getMouseSensitivity,
    getBinding,
    noClipEnabled,
    presentationMotionDefinitions,
    applySupplementalPose,
    onActionCue,
    onEmoteStarted,
    onEmoteCleared,
    closeEmoteMenu,
    setActiveEmote,
    setCharacterDisabled,
    isReady,
    setActiveCharacter,
    shouldUseOutdoorFootwear,
    persistRunToggle,
    persistLocation,
    markPresenceDirty,
    syncWorldMode,
    onFirstPersonChanged,
    onLoaded,
    combatSounds,
    onCombatStateChanged,
  }) {
    this.scene = scene;
    this.camera = camera;
    this.actorRoot = actorRoot;
    this.modelOffset = modelOffset;
    this.combatEnemyRoot = combatEnemyRoot;
    this.combatEnemyModelOffset = combatEnemyModelOffset;
    this.characterRuntime = characterRuntime;
    this.locomotionRuntime = locomotionRuntime;
    this.getWorld = getWorld;
    this.getRaycastIndex = getRaycastIndex;
    this.getSpawn = getSpawn;
    this.getSpawnYaw = getSpawnYaw;
    this.getRunSpeedMultiplier = getRunSpeedMultiplier;
    this.getMouseSensitivity = getMouseSensitivity;
    this.getBinding = getBinding;
    this.noClipEnabled = noClipEnabled;
    this.presentationMotionDefinitions = presentationMotionDefinitions;
    this.applySupplementalPose = applySupplementalPose;
    this.setCharacterDisabled = setCharacterDisabled;
    this.isReady = isReady;
    this.setActiveCharacter = setActiveCharacter;
    this.shouldUseOutdoorFootwear = shouldUseOutdoorFootwear;
    this.persistRunToggle = persistRunToggle;
    this.persistLocation = persistLocation;
    this.markPresenceDirty = markPresenceDirty;
    this.syncWorldMode = syncWorldMode;
    this.onFirstPersonChanged = onFirstPersonChanged;
    this.onLoaded = onLoaded;
    this.combatSounds = combatSounds;
    this.onCombatStateChanged = onCombatStateChanged;

    this.controller = null;
    this.characterLoader = null;
    this.modelRoot = null;
    this.locomotionModel = null;
    this.activeCharacterId = "ryo";
    this.characterSwitching = false;
    this.loadPromise = null;
    this.combat = null;
    this.disposed = false;

    const applyRootMotion = createCombatRootMotionApplier(
      actorRoot,
      (position) => {
        if (!this.controller?.collider) return;
        this.controller.collider.position.x = position.x;
        this.controller.collider.position.z = position.z;
      },
    );
    this.animation = new AnimationStateMachine({
      renderMatrixByKey: this.characterRuntime.renderMatrixByKey,
      emotes: EMOTES,
      runtimeEmotes: RUNTIME_EMOTES,
      pickerEmoteIds: PICKER_EMOTE_IDS,
      gameTicksPerSecond: GAME_TICKS_PER_SECOND,
      emoteBlendTicks: EMOTE_BLEND_TICKS,
      locomotionBlendSeconds: LOCOMOTION_BLEND_SECONDS,
      locomotionStates: LOCOMOTION_STATES,
      applyPose: ({
        routedMatrices,
        frame,
        nextFrame,
        amount,
        oneShotRootMotion,
      }) => {
        if (!this.modelRoot || !this.characterLoader) return;
        applyRootMotion(
          oneShotRootMotion?.context?.kind === "native-xmpt-motion"
            ? null
            : oneShotRootMotion,
        );
        const nativeLocomotionApplied = this.locomotionRuntime.apply(
          this.locomotionModel,
          this.animation.state,
          (this.animation.tick + amount) / GAME_TICKS_PER_SECOND,
        );
        if (!nativeLocomotionApplied) {
          this.characterRuntime.applyCharacterRigWorldMatrices(
            this.characterLoader,
            this.modelRoot,
            this.animation.state === "forkliftSit"
              ? this.characterRuntime.retargetMirroredForkliftArms(routedMatrices)
              : this.characterRuntime.retarget(routedMatrices),
          );
        }
        this.applySupplementalPose({
          frame,
          nextFrame,
          amount,
          state: this.animation.state,
        });
      },
      onActionCue,
      onEmoteCleared: ({ emote, context, completionTranslation }) => {
        if (completionTranslation) this.commitEmoteDisplacement(completionTranslation);
        setActiveEmote(null);
        onEmoteCleared(emote);
        context?.onComplete?.();
      },
      onEmoteStarted: ({ emote }) => onEmoteStarted(emote),
    });
    this.emotes = new EmoteController({
      animation: this.animation,
      closeMenu: closeEmoteMenu,
      setActiveEmote,
    });
  }

  setInitialCharacter(characterId) {
    if (this.controller || this.loadPromise) {
      throw new Error("The initial character cannot change after loading starts");
    }
    if (!CHARACTER_BY_ID.has(characterId)) {
      throw new Error(`Unknown playable character: ${characterId}`);
    }
    this.activeCharacterId = characterId;
    this.setActiveCharacter(characterId);
  }

  async prefetch(world, signal) {
    const character = CHARACTER_BY_ID.get(this.activeCharacterId);
    await Promise.all([
      this.characterRuntime.prefetch(character, signal),
      character.id === "ryo" ? null : this.characterRuntime.prefetch({
        ...CHARACTER_BY_ID.get("ryo"), outdoorFootwear: null,
      }, signal),
      prefetchPlayerMotionLibrary(world, signal),
    ]);
  }

  async prepareWorld(world, signal) {
    if (!this.motionLibrary) return;
    await this.motionLibrary.ensureWorld(world, signal);
    signal?.throwIfAborted();
    if (this.disposed) throw new Error("Player runtime was disposed");
    if (world.vehicle === "forklift") void this.animation.clips.forkliftSit;
    if (world.id === "mfbt" && !this.combat.encounter) {
      if (!this.combatLoadPromise) {
        this.combatLoadPromise = this.combat.load(this.motionLibrary).catch(error => {
          this.combatLoadPromise = null;
          throw error;
        });
      }
      await this.combatLoadPromise;
      signal?.throwIfAborted();
    }
    if (world.id === "mfbt") {
      // Prepare combat under the destination loading cover, not as a burst
      // on the first punch. Completed clips remain reusable across visits.
      for (const animation of [this.animation, this.combat.enemyAnimation]) {
        await animation.prepareClips(Object.keys(animation.clips)
          .filter(state => state.startsWith("combat")), signal);
      }
    }
  }

  async load() {
    const initialCharacter = CHARACTER_BY_ID.get(this.activeCharacterId);
    const referenceCharacter = CHARACTER_BY_ID.get("ryo");
    const initialModelPromise = this.characterRuntime.createModel(initialCharacter);
    // Runtime matrices are Ryo-authored. Always build retargeting from Ryo's
    // bind pose even when a saved session initially selects another avatar.
    const referenceModelPromise = initialCharacter.id === referenceCharacter.id
      ? initialModelPromise
      : this.characterRuntime.createModel({
        ...referenceCharacter,
        outdoorFootwear: null,
      });
    const [initialModel, referenceModel, motionLibrary] = await Promise.all([
      initialModelPromise,
      referenceModelPromise,
      loadPlayerMotionLibrary({
        world: this.getWorld(),
        configureLocomotion: () => this.locomotionRuntime.configure(),
        presentationMotionDefinitions: this.presentationMotionDefinitions(),
      }),
    ]);
    this.motionLibrary = motionLibrary;

    this.characterLoader = initialModel.loader;
    this.modelRoot = initialModel.root;
    this.modelRoot.parent = this.modelOffset;
    this.locomotionModel = this.locomotionRuntime.createModel(
      initialCharacter,
      initialModel.loader,
      initialModel.root,
    );
    this.characterRuntime.setReferenceBind(
      referenceModel.loader,
      referenceModel.root,
    );
    this.characterRuntime.activeRetargetByRenderKey =
      this.characterRuntime.buildRetargetMatrices(
        initialModel.loader,
        initialModel.root,
      );
    this.syncModelTransform(initialCharacter);
    this.characterRuntime.activeForkliftArmRetargetProfile =
      initialCharacter.mirrorForkliftArmChannels
        ? this.characterRuntime.buildMirroredForkliftArmRetargetProfile(
          initialModel.loader,
          initialModel.root,
        )
        : null;
    this.syncFootwear(initialCharacter.id);
    if (referenceModel.root !== initialModel.root) {
      referenceModel.root.dispose(false, true);
    }

    const { fightMotion, motion, scriptedMotions, supplementalMotions } =
      motionLibrary;
    const { stance, guard, locomotion, reactions } = PLAYER_COMBAT_CONFIG;
    this.animation.configure({
      motion,
      supplementalMotions,
      sequences: SEQUENCES,
      locomotionMotionFiles: LOCOMOTION_MOTION_FILES,
      combatMotion: fightMotion,
      combatMoveMotion: motion,
      combatVictimMotion: motion,
      combatOpponentVictimMotion: fightMotion,
      combatStance: stance,
      combatGuard: guard,
      combatLocomotion: locomotion,
      combatMoves: MARTIAL_ARTS_MOVES,
      combatStrings: MARTIAL_ARTS_STRING_STAGES,
      combatFollowups: MARTIAL_ARTS_FOLLOWUP_STAGES,
      combatReactions: reactions,
      scriptedMotions,
      deferOptional: true,
      combatReactionMotionById: { defeatedIdle: motion },
    });
    this.locomotionRuntime.setRunCadenceScale(
      this.animation.clips.run.speed / this.animation.clips.walk.speed,
    );
    this.combat = new PlayerCombatRuntime({
      enemyRoot: this.combatEnemyRoot,
      enemyModelOffset: this.combatEnemyModelOffset,
      playerRoot: this.actorRoot,
      playerAnimation: this.animation,
      characterRuntime: this.characterRuntime,
      createCharacterModel: character => this.characterRuntime.createModel(character),
      enemyCharacter: CHARACTER_BY_ID.get("chai"),
      getController: () => this.controller,
      getBinding: this.getBinding,
      sounds: this.combatSounds,
      onStateChanged: this.onCombatStateChanged,
      combatConfig: PLAYER_COMBAT_CONFIG,
      animationConfig: {
        renderMatrixByKey: this.characterRuntime.renderMatrixByKey,
        gameTicksPerSecond: GAME_TICKS_PER_SECOND,
        emoteBlendTicks: EMOTE_BLEND_TICKS,
        locomotionBlendSeconds: LOCOMOTION_BLEND_SECONDS,
        locomotionStates: LOCOMOTION_STATES,
        sequences: SEQUENCES,
        locomotionMotionFiles: LOCOMOTION_MOTION_FILES,
      },
    });
    this.groundModel(initialCharacter);
    const world = this.getWorld();
    this.controller = new ThirdPersonController(
      this.scene,
      this.camera,
      this.actorRoot,
      {
        walkSpeed: this.animation.clips.walk.speed,
        runSpeed: this.animation.clips.run.speed,
        runSpeedMultiplier: this.getRunSpeedMultiplier(),
        toggleRun: true,
        toggleAutoRunKey: "KeyQ",
        noClipEnabled: this.noClipEnabled,
        toggleNoClipKey: this.noClipEnabled ? "KeyZ" : null,
        toggleFirstPersonKey: "KeyR",
        getKeyBinding: this.getBinding,
        inputContext: "exploration",
        cameraSensitivity: (
          DEFAULT_THIRD_PERSON_CONTROLLER_OPTIONS.cameraSensitivity
          * this.getMouseSensitivity()
        ),
        onRunToggleChanged: this.persistRunToggle,
        onFirstPersonChanged: this.onFirstPersonChanged,
        terrainMaxHeight: world.terrainMaxHeight ?? Number.POSITIVE_INFINITY,
        raycastIndex: this.getRaycastIndex(),
      },
    );
    this.controller.reset(this.getSpawn(), this.getSpawnYaw());
    await this.onLoaded();
    this.syncWorldMode();
    this.applyAnimationFrame();
  }

  ensureLoaded() {
    if (this.controller) return Promise.resolve();
    if (!this.loadPromise) {
      this.loadPromise = this.load().catch((error) => {
        this.loadPromise = null;
        throw error;
      });
    }
    return this.loadPromise;
  }

  syncModelTransform(character) {
    this.modelOffset.rotation.y = (
      Math.PI
      + this.characterRuntime.modelForwardYawOffset(
        this.characterRuntime.activeRetargetByRenderKey,
      )
      + playableLocomotionModelYawOffset(character)
    );
    this.modelOffset.scaling.setAll(character?.modelScale ?? 1);
  }

  commitEmoteDisplacement(translation) {
    // MOTN displacement is in source coordinates: include the character's
    // reflection, model orientation/scale and actor yaw, just as rendering does.
    const content = this.modelRoot._mt5CharacterContentRoot || this.modelRoot;
    const delta = Vector3.TransformNormal(Vector3.FromArray(translation), content.computeWorldMatrix(true));
    this.actorRoot.position.x += delta.x;
    this.actorRoot.position.z += delta.z;
    if (this.controller?.collider) {
      this.controller.collider.position.x = this.actorRoot.position.x;
      this.controller.collider.position.z = this.actorRoot.position.z;
    }
    this.persistLocation();
    this.markPresenceDirty();
  }

  syncFootwear(characterId = this.activeCharacterId) {
    this.characterRuntime.setOutdoorFootwear(
      this.modelRoot,
      this.shouldUseOutdoorFootwear(characterId),
    );
  }

  groundModel(character) {
    this.modelOffset.position.y = character.groundOffset ?? 0;
    this.applyAnimationFrame();
    if (character.groundOffset !== null) return;
    const minimumY = this.characterRuntime.minimumWorldY(this.modelRoot);
    if (Number.isFinite(minimumY)) {
      this.modelOffset.position.y += this.actorRoot.position.y - minimumY + 0.003;
      this.applyAnimationFrame();
    }
  }

  async switchCharacter(character, { persist = true } = {}) {
    if (this.characterSwitching || !character) return;
    if (character.id === this.activeCharacterId) return;
    this.characterSwitching = true;
    this.setCharacterDisabled(true);
    try {
      const { loader, root } = await this.characterRuntime.createModel(character);
      const previousRoot = this.modelRoot;
      root.parent = this.modelOffset;
      this.animation.reset();
      this.characterLoader = loader;
      this.modelRoot = root;
      this.locomotionModel = this.locomotionRuntime.createModel(
        character,
        loader,
        root,
      );
      this.characterRuntime.activeRetargetByRenderKey =
        this.characterRuntime.buildRetargetMatrices(loader, root);
      this.syncModelTransform(character);
      this.characterRuntime.activeForkliftArmRetargetProfile =
        character.mirrorForkliftArmChannels
          ? this.characterRuntime.buildMirroredForkliftArmRetargetProfile(loader, root)
          : null;
      this.syncFootwear(character.id);
      this.groundModel(character);
      previousRoot?.dispose(false, true);
      this.activeCharacterId = character.id;
      this.setActiveCharacter(character.id);
      this.syncWorldMode();
      this.markPresenceDirty();
      if (persist) this.persistLocation();
    } catch (error) {
      console.error(error);
    } finally {
      this.characterSwitching = false;
      this.setCharacterDisabled(!this.isReady());
    }
  }

  reset(position = this.getSpawn(), yaw = this.getSpawnYaw(), options = {}) {
    if (!this.controller) return false;
    this.combat?.setActive(false);
    this.controller.reset(position, yaw, {
      snapToTerrain: options.snapToTerrain ?? true,
    });
    this.animation.reset();
    this.combat?.reset();
    this.syncWorldMode();
    this.applyAnimationFrame();
    if (options.persist ?? true) this.persistLocation();
    return true;
  }

  applyAnimationFrame(amount = 0) { this.animation.apply(amount); }
  updateAnimation(deltaSeconds, state) { this.animation.update(deltaSeconds, state); }
  stateForMovement(movement) { return this.animation.stateForMovement(movement); }
  clearEmote() { this.emotes.clear(); }
  playEmote(emote, option, context = null) {
    return this.emotes.play(emote, option, context);
  }
  clipRoutesAt(clipState, tick, options = {}) {
    return this.animation.clipRoutesAt(clipState, tick, options);
  }
  remoteEmoteRoutes(emoteId, elapsedSeconds) {
    return this.animation.remoteEmoteRoutes(emoteId, elapsedSeconds);
  }
  setRaycastIndex(index) { this.controller?.setRaycastIndex(index); }
  setCameraSensitivity(scale) {
    if (this.controller) {
      this.controller.options.cameraSensitivity =
        DEFAULT_THIRD_PERSON_CONTROLLER_OPTIONS.cameraSensitivity * scale;
    }
  }
  setModelVisible(visible) { this.modelRoot?.setEnabled(visible); }
  setVehicleMode(active, driverOffset) {
    if (!this.modelRoot || !this.animation.clips) return;
    if (active) {
      this.modelOffset.position.copyFrom(driverOffset);
      this.animation.setState("forkliftSit");
      this.applyAnimationFrame();
      return;
    }
    this.modelOffset.position.setAll(0);
    this.animation.setState("idle");
    this.groundModel(
      CHARACTER_BY_ID.get(this.activeCharacterId) || CHARACTER_BY_ID.get("ryo"),
    );
  }
  updateCloth(deltaSeconds) {
    this.characterRuntime.updateNativeCloth(this.modelRoot, deltaSeconds);
  }
  dispose() {
    this.disposed = true;
    this.combat?.dispose();
  }
}
