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

function createActorAdapter({
  root,
  animation,
  playerRoot,
  getController,
  setEnabled = () => {},
  targetHeight = 0,
}) {
  let sharedPair = false;
  const syncCollider = () => {
    const controller = getController();
    if (root !== playerRoot || !controller?.collider) return;
    controller.collider.position.x = root.position.x;
    controller.collider.position.z = root.position.z;
  };
  const releaseOneShot = (blendSeconds = 0.15) => animation.releaseOneShot(
    "combatStance",
    { blendSeconds },
  );
  return {
    position: () => root.getAbsolutePosition(),
    targetPosition() {
      const position = root.getAbsolutePosition();
      return { x: position.x, y: position.y + targetHeight, z: position.z };
    },
    yaw: () => root.rotation.y,
    setYaw: (yaw) => { root.rotation.y = yaw; },
    keepDistanceFrom(other, minimumDistance) {
      const source = root.getAbsolutePosition();
      const target = other.position();
      let deltaX = source.x - target.x;
      let deltaZ = source.z - target.z;
      const distance = Math.hypot(deltaX, deltaZ);
      if (distance >= minimumDistance) return false;
      if (distance <= 1e-8) {
        deltaX = -Math.sin(other.yaw());
        deltaZ = -Math.cos(other.yaw());
      } else {
        deltaX /= distance;
        deltaZ /= distance;
      }
      root.position.x = target.x + deltaX * minimumDistance;
      root.position.z = target.z + deltaZ * minimumDistance;
      syncCollider();
      return true;
    },
    alignPairedTo(other, { distance } = {}) {
      const yaw = other.yaw();
      root.rotation.y = yaw;
      if (!Number.isFinite(distance)) return;
      const source = other.position();
      root.position.x = source.x + Math.sin(yaw) * distance;
      root.position.z = source.z + Math.cos(yaw) * distance;
      syncCollider();
      animation.rebaseOneShotRootMotion();
    },
    activeOneShotRootMotionKind: () => animation.activeOneShotRootMotionKind(),
    activeOneShotChoreographySample: () => (
      animation.activeOneShotChoreographySample()
    ),
    combatVisualPosition() {
      const position = root.getAbsolutePosition();
      const translation = animation.activeOneShotPoseRootTranslation();
      if (!translation) return position;
      const yaw = root.rotation.y;
      const right = translation[0];
      const forward = -translation[2];
      return {
        x: position.x + right * Math.cos(yaw) + forward * Math.sin(yaw),
        y: position.y + translation[1],
        z: position.z - right * Math.sin(yaw) + forward * Math.cos(yaw),
      };
    },
    setSharedPair: (active) => { sharedPair = Boolean(active); },
    releasePaired({ atomic = false } = {}) {
      let committedPoseRoot = false;
      if (sharedPair) {
        const translation = animation.activeOneShotPoseRootTranslation();
        if (translation) {
          const yaw = root.rotation.y;
          const right = translation[0];
          const forward = -translation[2];
          root.position.x += right * Math.cos(yaw) + forward * Math.sin(yaw);
          root.position.z += -right * Math.sin(yaw) + forward * Math.cos(yaw);
          syncCollider();
          committedPoseRoot = true;
        }
      }
      sharedPair = false;
      // The old routed pose still contains the local root offset we just
      // baked into world space. Blending from it would apply that offset twice.
      return releaseOneShot(committedPoseRoot || atomic ? 0 : 0.15);
    },
    setCombatPosition(x, z, yaw) {
      root.position.x = x;
      root.position.z = z;
      root.rotation.y = yaw;
      syncCollider();
      animation.rebaseOneShotRootMotion();
    },
    setEnabled,
    placeAtOffset(other, { right, forward }) {
      const source = other.position();
      const yaw = other.yaw();
      root.position.set(
        source.x + Math.cos(yaw) * right + Math.sin(yaw) * forward,
        source.y,
        source.z - Math.sin(yaw) * right + Math.cos(yaw) * forward,
      );
      root.rotation.y = Math.atan2(source.x - root.position.x, source.z - root.position.z);
    },
    placeRelativeTo(other, distance) {
      const source = other.position();
      const yaw = other.yaw();
      root.position.set(
        source.x + Math.sin(yaw) * distance,
        source.y,
        source.z + Math.cos(yaw) * distance,
      );
      root.rotation.y = yaw + Math.PI;
    },
    placeBeside(other, distance) {
      const source = other.position();
      const yaw = other.yaw();
      root.position.set(
        source.x + Math.cos(yaw) * distance,
        source.y,
        source.z - Math.sin(yaw) * distance,
      );
      root.rotation.y = yaw - Math.PI / 2;
    },
    moveFacing(distance) {
      root.position.x += Math.sin(root.rotation.y) * distance;
      root.position.z += Math.cos(root.rotation.y) * distance;
    },
    playMove: (moveId, options) => animation.playCombatMove(moveId, options),
    playStringStage: (stageId, options) => (
      animation.playCombatStringStage(stageId, options)
    ),
    playFollowupStage: (stageId, options) => (
      animation.playCombatFollowupStage(stageId, options)
    ),
    playFollowupVictim: (stageId, options) => (
      animation.playCombatFollowupVictim(stageId, options)
    ),
    playMoveVictim: (moveId, options) => (
      animation.playCombatMoveVictim(moveId, options)
    ),
    playOpponentMoveVictim: (moveId, options) => (
      animation.playCombatOpponentVictim(moveId, options)
    ),
    playReaction: (reaction) => animation.playCombatReaction(reaction, {
      holdLastFrame: reaction === "defeated" || reaction === "knockdown",
    }),
    releaseReaction() {
      sharedPair = false;
      return releaseOneShot();
    },
  };
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
        playerActor: createActorAdapter({
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
    const enemyRetarget = this.characterRuntime.buildRetargetMatrices(
      enemyLoader,
      enemyRoot,
    );
    const applyRootMotion = createCombatRootMotionApplier(root);
    const animation = entry.animation = new AnimationStateMachine({
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
      combatFollowupMotion: null,
      combatStance: stance,
      combatGuard: guard,
      combatMoves: MARTIAL_ARTS_MOVES,
      combatFollowups: MARTIAL_ARTS_FOLLOWUP_STAGES,
      combatReactions: reactions,
      combatReactionMotionById: { defeatedIdle: motion },
      deferOptional: true,
    });
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
    entry.actor = createActorAdapter({
      root, animation, targetHeight, playerRoot: this.playerRoot,
      getController: this.getController,
      setEnabled: enabled => root.setEnabled(enabled),
    });
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
          ? "combatGuard" : "combatStance";
      entry.animation.update(deltaSeconds, state);
      this.characterRuntime.updateSecondaryMotion(entry.modelRoot, deltaSeconds);
    }
  }
}
