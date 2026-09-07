import {
  MARTIAL_ARTS_FOLLOWUP_STAGES,
  MARTIAL_ARTS_MOVES,
} from "../../src/MartialArtsCombat.js";
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
    this.enemyAnimation = null;
    this.encounter = null;
  }

  async load({ motion, fightMotion, supplementalMotions }) {
    const enemyModel = await this.createCharacterModel(this.enemyCharacter);
    if (this.disposed) {
      enemyModel.root.dispose(false, true);
      throw new Error("Combat runtime was disposed");
    }
    const enemyLoader = enemyModel.loader;
    const enemyRoot = enemyModel.root;
    enemyRoot.parent = this.enemyModelOffset;
    const enemyRetarget = this.characterRuntime.buildRetargetMatrices(
      enemyLoader,
      enemyRoot,
    );
    const applyRootMotion = createCombatRootMotionApplier(this.enemyRoot);
    this.enemyAnimation = new AnimationStateMachine({
      ...this.animationConfig,
      emotes: [],
      runtimeEmotes: [],
      pickerEmoteIds: new Set(),
      applyPose: ({ routedMatrices, oneShotRootMotion }) => {
        applyRootMotion(oneShotRootMotion);
        this.characterRuntime.applyCharacterRigWorldMatrices(
          enemyLoader,
          enemyRoot,
          this.characterRuntime.retargetWithMap(routedMatrices, enemyRetarget),
        );
      },
    });
    const { stance, guard, reactions } = this.combatConfig;
    this.enemyAnimation.configure({
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
    this.enemyAnimation.apply();
    const minimumY = this.characterRuntime.minimumWorldY(enemyRoot);
    if (Number.isFinite(minimumY)) {
      this.enemyModelOffset.position.y += -minimumY + 0.003;
      this.enemyAnimation.apply();
    }
    const input = new CombatInput({
      enableToggle: false,
      getBindings: () => ({
        toggle: "KeyF",
        controls: this.getBinding("cancel"),
        hand: this.getBinding("combatHand"),
        leg: this.getBinding("combatLeg"),
        throw: this.getBinding("combatThrow"),
        guard: this.getBinding("combatGuard"),
        run: this.getBinding("run"),
        up: this.getBinding("moveForward"),
        down: this.getBinding("moveBackward"),
      }),
    });
    this.encounter = new CombatEncounterRuntime({
      input,
      playerActor: createActorAdapter({
        root: this.playerRoot,
        animation: this.playerAnimation,
        playerRoot: this.playerRoot,
        getController: this.getController,
      }),
      enemyActor: createActorAdapter({
        root: this.enemyRoot,
        animation: this.enemyAnimation,
        playerRoot: this.playerRoot,
        getController: this.getController,
        setEnabled: enabled => this.enemyRoot.setEnabled(enabled),
      }),
      sounds: this.sounds,
      reactionSequences: reactions,
      onStateChanged: this.onStateChanged,
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
  reset() { this.enemyAnimation?.reset(); }
  dispose() {
    this.disposed = true;
    this.encounter?.dispose();
  }

  updateAnimation(deltaSeconds) {
    if (!this.active || !this.enemyAnimation) return;
    const state = this.enemyAnimation.activeOneShot
      ? this.enemyAnimation.state
      : this.encounter.enemy.guardHeld
        ? "combatGuard"
        : "combatStance";
    this.enemyAnimation.update(deltaSeconds, state);
  }
}
