import { createCombatActorAdapter } from "../combat/CombatActorAdapter.js";
import {
  MARTIAL_ARTS_FOLLOWUP_STAGES,
  MARTIAL_ARTS_MOVES,
  MartialArtsEnemyAI,
} from "../../src/MartialArtsCombat.js";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import { CombatTargetIndicator } from "../combat/CombatTargetIndicator.js";
import { AnimationStateMachine } from "./AnimationStateMachine.js";
import { CombatEncounterRuntime } from "../combat/CombatEncounterRuntime.js";
import { CombatInput } from "../combat/CombatInput.js";
import { createCombatRootMotionApplier } from "../combat/CombatRootMotion.js";

export function combatPlayerAnimationState(encounter, movement) {
  if (!encounter?.controlsActive) return null;
  if (encounter.player.guardHeld) return "combatGuard";
  if (!movement.moving && !movement.turning) return "combatStance";
  return {
    backward: "combatRetreat",
    left: "combatStrafeLeft",
    right: "combatStrafeRight",
  }[movement.combatDirection] || "combatAdvance";
}

export class PlayerCombatRuntime {
  constructor({
    enemyRoot,
    enemyModelOffset,
    playerRoot,
    playerAnimation,
    characterRuntime,
    createCharacterModel,
    enemyCharacter,
    getController,
    getBinding,
    sounds,
    onStateChanged,
    animationConfig,
    combatConfig,
  }) {
    this.enemyRoot = enemyRoot;
    this.enemyModelOffset = enemyModelOffset;
    this.playerRoot = playerRoot;
    this.playerAnimation = playerAnimation;
    this.characterRuntime = characterRuntime;
    this.createCharacterModel = createCharacterModel;
    this.enemyCharacter = enemyCharacter;
    this.getController = getController;
    this.getBinding = getBinding;
    this.sounds = sounds;
    this.onStateChanged = onStateChanged;
    this.animationConfig = animationConfig;
    this.combatConfig = combatConfig;
    this.enemies = [];
    this.encounter = null;
  }

  async load({ motion, fightMotion, supplementalMotions }) {
    try {
      // One active sparring opponent and three stationary practice partners.
      // All use the existing Chai rig and complete hit/throw reactions; no
      // additional assets or substitute combat simulation are needed.
      const roster = [
        { id: "enemy", name: "Chai", placement: { right: 0, forward: 2 }, ai: new MartialArtsEnemyAI() },
        { id: "partner-left", name: "Partner 1", placement: { right: -2, forward: 4 } },
        { id: "partner-center", name: "Partner 2", placement: { right: 0.8, forward: 6 } },
        { id: "partner-right", name: "Partner 3", placement: { right: 2, forward: 4 } },
      ];
      for (const definition of roster) {
        await this.loadEnemy(definition, { motion, fightMotion, supplementalMotions });
      }
      const scene = this.playerRoot.getScene();
      this.targetIndicator = new CombatTargetIndicator(scene, () => this.encounter);
      const input = new CombatInput({
        enableToggle: false,
        targetingEnabled: () => this.controlsActive,
        getBindings: () => ({
          controls: this.getBinding("cancel"),
          hand: this.getBinding("combatHand"),
          leg: this.getBinding("combatLeg"),
          throw: this.getBinding("combatThrow"),
          guard: this.getBinding("combatGuard"),
          run: this.getBinding("run"),
          up: this.getBinding("moveForward"),
          down: this.getBinding("moveBackward"),
          targetLeft: this.getBinding("combatTargetLeft"),
          targetRight: this.getBinding("combatTargetRight"),
        }),
      });
      this.encounter = new CombatEncounterRuntime({
        input,
        playerActor: createCombatActorAdapter({
          root: this.playerRoot, animation: this.playerAnimation,
          playerRoot: this.playerRoot, getController: this.getController,
        }),
        enemies: this.enemies,
        projectTargets: entries => this.targetIndicator.projectTargets(entries),
        sounds: this.sounds,
        reactionSequences: this.combatConfig.reactions,
        onStateChanged: this.onStateChanged,
      });
    } catch (error) {
      this.disposeEnemies();
      throw error;
    }
  }

  async loadEnemy(definition, { motion, fightMotion, supplementalMotions }) {
    const enemyModel = await this.createCharacterModel(this.enemyCharacter);
    if (this.disposed) {
      enemyModel.root.dispose(false, true);
      throw new Error("Combat runtime was disposed");
    }
    const enemyLoader = enemyModel.loader;
    const enemyRoot = enemyModel.root;
    const scene = this.enemyRoot.getScene();
    const first = this.enemies.length === 0;
    const root = first ? this.enemyRoot : new TransformNode(`combat_${definition.id}`, scene);
    const offset = first ? this.enemyModelOffset : new TransformNode(`combat_${definition.id}_offset`, scene);
    offset.parent = root;
    offset.rotation.y = Math.PI;
    enemyRoot.parent = offset;
    root.setEnabled(false);
    const entry = { ...definition, root, offset, modelRoot: enemyRoot, ownsRoot: !first };
    this.enemies.push(entry);
    const animation = entry.animation = this.createOpponentAnimation(root, enemyRoot, enemyLoader, { motion, fightMotion, supplementalMotions });
    // The grounding helper excludes disabled meshes. Enable only for this
    // synchronous pose/bounds query, under the world loading cover.
    root.setEnabled(true);
    animation.apply();
    const minimumY = this.characterRuntime.minimumWorldY(enemyRoot);
    if (Number.isFinite(minimumY)) {
      offset.position.y += -minimumY + 0.003;
      animation.apply();
    }
    const targetHeight = enemyRoot.getHierarchyBoundingVectors(true).max.y - root.position.y + 0.12;
    root.setEnabled(false);
    entry.actor = createCombatActorAdapter({
      root, animation, targetHeight, playerRoot: this.playerRoot,
      getController: this.getController,
      setEnabled: enabled => root.setEnabled(enabled),
    });
  }

  createOpponentAnimation(root, enemyRoot, enemyLoader, { motion, fightMotion, supplementalMotions }, yawOffset = 0) {
    const enemyRetarget = this.characterRuntime.buildRetargetMatrices(
      enemyLoader,
      enemyRoot,
    );
    const applyRootMotion = createCombatRootMotionApplier(root, () => {}, () => root.rotation.y - yawOffset);
    const animation = new AnimationStateMachine({
      ...this.animationConfig,
      emotes: [],
      runtimeEmotes: [],
      pickerEmoteIds: new Set(),
      applyPose: ({ routedMatrices, controllerMatrices, oneShotRootMotion }) => {
        applyRootMotion(oneShotRootMotion);
        this.characterRuntime.applyHumanoidAnimationPose(
          enemyLoader,
          enemyRoot,
          this.characterRuntime.retargetWithMap(routedMatrices, enemyRetarget),
          controllerMatrices,
        );
      },
    });
    const { stance, guard, reactions } = this.combatConfig;
    animation.configure({
      motion,
      supplementalMotions,
      sequences: this.animationConfig.sequences,
      locomotionMotionFiles: this.animationConfig.locomotionMotionFiles,
      combatMotion: fightMotion,
      combatMoveMotion: fightMotion,
      combatMoveAnimationProperty: "enemyAnimation",
      combatVictimMotion: motion,
      combatOpponentVictimMotion: fightMotion,
      combatFollowupMotion: null,
      combatStance: stance,
      combatGuard: guard,
      combatLocomotion: this.combatConfig.locomotion,
      combatMoves: MARTIAL_ARTS_MOVES,
      combatFollowups: MARTIAL_ARTS_FOLLOWUP_STAGES,
      combatReactions: reactions,
      combatReactionMotionById: { defeatedIdle: motion },
      deferOptional: true,
    });
    return animation;
  }

  // Borrow the Story presentation owner's models; do not spawn practice Chai
  // or build another animation implementation. The owner restores transforms.
  async prepareStoryActors(records, banks, signal) {
    await banks.fightMotion.ensureLoaded(signal);
    const result = new Map();
    for (const { tag, root, model } of records) {
      signal.throwIfAborted();
      const player = tag === "AKIR";
      root.rotationQuaternion = null;
      const yawOffset = player ? 0 : Math.PI;
      const animation = player ? this.playerAnimation
        : this.createOpponentAnimation(root, model.renderRoot, model.loader, banks, yawOffset);
      animation.reset();
      // Full player move/throw preparation shares Practice's lazy clip cache.
      // NPCs use the same opponent clips; prepare just their initial stance.
      await animation.prepareClips(Object.keys(animation.clips).filter(name =>
        player ? name.startsWith("combat") : ["combatStance", "combatGuard"].includes(name)), signal);
      signal.throwIfAborted();
      animation.setState("combatStance");
      animation.apply();
      root.computeWorldMatrix(true);
      const targetHeight = model.renderRoot.getHierarchyBoundingVectors(true).max.y - root.getAbsolutePosition().y + .12;
      result.set(tag, { root, model, animation, actor: createCombatActorAdapter({
        root, animation, yawOffset, targetHeight, playerRoot: this.playerRoot,
        getController: this.getController, setEnabled: value => root.setEnabled(value),
      }) });
    }
    return result;
  }

  get active() { return this.encounter?.active === true; }
  get controlsActive() { return this.encounter?.controlsActive === true; }
  get playerMovementLocked() { return this.encounter?.playerMovementLocked; }

  playerTargetYaw() { return this.encounter?.playerTargetYaw() ?? null; }
  playerAnimationState(movement) {
    return combatPlayerAnimationState(this.encounter, movement);
  }
  setActive(active) { return this.encounter?.setActive(active); }
  update(deltaSeconds) { this.encounter?.update(deltaSeconds); }
  reset() { for (const entry of this.enemies) entry.animation.reset(); }
  disposeEnemies() {
    this.targetIndicator?.dispose();
    this.targetIndicator = null;
    for (const entry of this.enemies) {
      entry.root.setEnabled(false);
      entry.modelRoot.dispose(false, true);
      if (entry.ownsRoot) entry.root.dispose();
    }
    this.enemies.length = 0;
  }
  dispose() {
    this.disposed = true;
    this.encounter?.dispose();
    this.disposeEnemies();
  }

  updateAnimation(deltaSeconds) {
    if (!this.active) return;
    for (const entry of this.enemies) {
      const state = entry.animation.activeOneShot
        ? entry.animation.state
        : this.encounter.combat.combatants.get(entry.id).guardHeld
          ? "combatGuard" : this.encounter.enemies.find(e => e.id === entry.id).movementState || "combatStance";
      entry.animation.update(deltaSeconds, state);
      this.characterRuntime.updateSecondaryMotion(entry.modelRoot, deltaSeconds);
    }
  }
}
