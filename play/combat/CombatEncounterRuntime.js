import {
  COMBAT_TICKS_PER_SECOND,
  MARTIAL_ARTS_MOVES,
  MARTIAL_ARTS_STRINGS,
  MartialArtsCombat,
  MartialArtsEnemyAI,
  createCombatant,
  distanceAndFacing,
  opponentPosition,
  queueCombatCommand,
  setCombatCommandOverride,
  startCombatMove,
} from "../../src/MartialArtsCombat.js";
import {
  positionAuthoredCombatPair,
} from "./CombatChoreography.js";

export const COMBAT_PRACTICE_PLAYER_MAX_HEALTH = 100;

function syncCombatant(combatant, actor) {
  const position = actor.position();
  combatant.x = position.x;
  combatant.z = position.z;
  combatant.yaw = actor.yaw();
}

function containsAttackCommand(commands) {
  return commands.some((command) => (
    command === "hand"
    || command === "leg"
    || command === "throw"
  ));
}

function alignSynchronizedPair(actor, defender, choreographyId, anchor) {
  const authored = positionAuthoredCombatPair(
    actor,
    defender,
    choreographyId,
    { anchor },
  );
  if (authored) return authored;
  const sharedOrigin = (
    actor.activeOneShotRootMotionKind?.() === "pose"
    && defender.activeOneShotRootMotionKind?.() === "pose"
  );
  defender.alignPairedTo?.(actor, {
    distance: sharedOrigin ? 0 : null,
  });
  actor.setSharedPair?.(sharedOrigin);
  defender.setSharedPair?.(sharedOrigin);
  return { sharedOrigin };
}

export class CombatEncounterRuntime {
  constructor({
    input,
    playerActor,
    enemyActor,
    onStateChanged = () => {},
    moves = MARTIAL_ARTS_MOVES,
    enemyAI = new MartialArtsEnemyAI(),
    sounds = null,
    reactionSequences = {},
  }) {
    this.input = input;
    this.playerActor = playerActor;
    this.enemyActor = enemyActor;
    this.onStateChanged = onStateChanged;
    this.moves = moves;
    this.enemyAI = enemyAI;
    this.sounds = sounds;
    this.reactionSequences = reactionSequences;
    this.combat = new MartialArtsCombat({ moves });
    this.player = this.combat.add(createCombatant({
      id: "ryo",
      team: "player",
      maxHealth: COMBAT_PRACTICE_PLAYER_MAX_HEALTH,
      // The recreation currently exposes Ryo's complete learned move scroll.
      // Native expert variants are selected above the executable's >0x37
      // proficiency threshold.
      proficiency: 100,
    }));
    this.enemy = this.combat.add(createCombatant({
      id: "enemy",
      team: "enemy",
    }));
    this.active = false;
    this.aiAccumulator = 0;
    this.enemyOffenseUnlocked = false;
    this.lastEvents = [];
    this.commandResult = null;
    this.commandResultSeconds = 0;
    this.controlsActive = false;
    this.controlsExitRequested = false;
    this.enemyActor.setEnabled(false);
  }

  resetCombatants() {
    this.sounds?.reset();
    this.combat.accumulator = 0;
    this.aiAccumulator = 0;
    this.commandResult = null;
    this.commandResultSeconds = 0;
    // Let the player establish the first exchange. Without this gate Chai's
    // AI starts ticking as soon as the arena finishes loading, so his hit
    // reaction can replace Ryo's first move animation before it is visible.
    this.enemyOffenseUnlocked = false;
    this.enemyAI.cooldown = COMBAT_TICKS_PER_SECOND;
    for (const combatant of [this.player, this.enemy]) {
      combatant.health = combatant.maxHealth;
      combatant.action = null;
      combatant.reaction = null;
      combatant.guardHeld = false;
      combatant.guardStun = 0;
      combatant.hitStun = 0;
      combatant.knockdown = 0;
      combatant.invulnerability = 0;
      combatant.commandQueue.length = 0;
      combatant.commandIdleTicks = 0;
      combatant.stringCommands.length = 0;
      combatant.activeStringId = null;
      combatant.activeFollowupId = null;
      combatant.defeated = false;
    }
    // Defeat and knockdown clips deliberately hold their final frame. Clear
    // that render-side state as well as the simulation state so a fresh bout
    // cannot leave either fighter frozen in the previous round's pose.
    this.playerActor.releaseReaction?.();
    this.enemyActor.releaseReaction?.();
    if (this.enemyActor.placeBeside) {
      this.enemyActor.placeBeside(this.playerActor, 2);
    } else {
      this.enemyActor.placeRelativeTo(this.playerActor, 2);
    }
    syncCombatant(this.player, this.playerActor);
    syncCombatant(this.enemy, this.enemyActor);
  }

  setActive(active) {
    const next = Boolean(active);
    if (next === this.active) return false;
    this.input.consumeCommands();
    this.active = next;
    this.controlsActive = next;
    this.controlsExitRequested = false;
    this.enemyActor.setEnabled(next);
    if (next) this.resetCombatants();
    else this.sounds?.reset();
    this.player.guardHeld = false;
    this.enemy.guardHeld = false;
    this.onStateChanged(this.snapshot());
    return true;
  }

  setControlsActive(active) {
    const next = Boolean(active);
    if (!this.active || next === this.controlsActive) return false;
    this.input.discardCommands?.();
    this.input.consumeCommands();
    this.controlsActive = next;
    this.controlsExitRequested = false;
    this.player.guardHeld = false;
    this.enemy.guardHeld = false;
    this.onStateChanged(this.snapshot());
    return true;
  }

  toggle() {
    return this.setActive(!this.active);
  }

  snapshot() {
    const commandFeedback = this.playerCommandFeedback();
    return {
      active: this.active,
      controlsActive: this.controlsActive,
      playerHealth: this.player.health,
      playerMaxHealth: this.player.maxHealth,
      enemyHealth: this.enemy.health,
      enemyMaxHealth: this.enemy.maxHealth,
      playerGuarding: this.player.guardHeld,
      enemyGuarding: this.enemy.guardHeld,
      playerDefeated: this.player.defeated,
      enemyDefeated: this.enemy.defeated,
      playerMoveId: this.player.action?.moveId || null,
      playerActionLabel: this.combat.actionDefinition(
        this.player.action,
      )?.label || null,
      playerInputTokens: commandFeedback.tokens,
      playerResolvedMoveLabel: commandFeedback.moveLabel,
      playerCommandLocked: commandFeedback.locked,
      playerCommandConnected: commandFeedback.connected,
      playerCommandMissed: commandFeedback.missed,
      playerCommandDamage: commandFeedback.damage,
      enemyMoveId: this.enemy.action?.moveId || null,
      playerOpponentPosition: opponentPosition(this.player, this.enemy),
      playerMovementLocked: this.playerMovementLocked,
    };
  }

  validQueuedPlayerCommands() {
    const definitions = [
      ...Object.values(this.moves).map((move) => move.input || []),
      ...MARTIAL_ARTS_STRINGS.map((string) => string.input),
    ];
    const accepted = [];
    for (const command of this.player.commandQueue) {
      const candidate = [...accepted, command];
      if (!definitions.some((input) => (
        candidate.length <= input.length
        && candidate.every((token, index) => token === input[index])
      ))) {
        break;
      }
      accepted.push(command);
    }
    return accepted;
  }

  playerCommandFeedback() {
    const action = this.player.action;
    const actionMove = this.combat.actionDefinition(action);
    const pendingThrowMove = action?.acquisitionStage
      ? this.moves[action.pendingThrowMoveId]
      : null;
    // Grab/Long Grab are range-check animations shared by every throw. The
    // pending throw ID is already the command that the player resolved, so
    // keep its real input and name visible instead of exposing the internal
    // acquisition-stage label.
    if (pendingThrowMove) {
      return {
        tokens: [...(
          pendingThrowMove.nativeInput
          || pendingThrowMove.input
          || []
        )],
        moveLabel: pendingThrowMove.label,
        locked: true,
        connected: false,
        missed: false,
        damage: null,
      };
    }
    if (this.commandResult) return { ...this.commandResult };
    let tokens;
    if (this.player.stringCommands.length > 0) {
      // stringCommands contains only tokens accepted by the native string
      // matcher. An incompatible queued key belongs to a later action and
      // must not visually corrupt the current combination.
      tokens = [...this.player.stringCommands];
    } else if (actionMove && !action?.stringStage) {
      tokens = [...(actionMove.nativeInput || actionMove.input || [])];
    } else {
      tokens = this.validQueuedPlayerCommands();
    }
    const matchingStrings = this.player.stringCommands.length > 0
      ? MARTIAL_ARTS_STRINGS.filter(
        (definition) => (
          this.player.stringCommands.length <= definition.input.length
          && this.player.stringCommands.every(
            (command, index) => (
              command === definition.input[index]
            ),
          )
        ),
      )
      : [];
    const completedString = matchingStrings.find(
      (definition) => (
        definition.input.length === this.player.stringCommands.length
      ),
    );
    const stringWindowOpen = Boolean(
      action
      && actionMove
      && action.tick <= actionMove.startup + actionMove.active + 3
    );
    const canExtendString = Boolean(
      stringWindowOpen
      && matchingStrings.some(
        (definition) => (
          definition.input.length > this.player.stringCommands.length
        ),
      )
    );
    const locked = Boolean(actionMove && !canExtendString);
    const missed = Boolean(
      action
      && actionMove
      && action.tick >= actionMove.startup + actionMove.active
      && action.connected?.size === 0
    );
    const connected = Boolean(action?.connected?.size > 0);
    return {
      tokens,
      moveLabel: completedString?.label || (
        actionMove && (!action?.stringStage || locked)
          ? actionMove.label
          : null
      ),
      locked,
      connected,
      missed,
      damage: connected && Number.isFinite(action?.damageDealt)
        ? action.damageDealt
        : null,
    };
  }

  playerTargetYaw() {
    const player = this.playerActor.position();
    const enemy = this.enemyActor.position();
    return Math.atan2(enemy.x - player.x, enemy.z - player.z);
  }

  get playerMovementLocked() {
    return Boolean(
      this.active
      && this.controlsActive
      && (
        this.player.action
        || this.player.reaction
        || this.player.defeated
      )
    );
  }

  selectPlayerMove(moveId) {
    return setCombatCommandOverride(this.player, moveId, this.moves);
  }

  performPlayerMove(moveId) {
    const move = this.moves[moveId];
    if (
      !move
      || !this.active
      || !this.controlsActive
      || this.player.defeated
    ) {
      return false;
    }
    syncCombatant(this.player, this.playerActor);
    syncCombatant(this.enemy, this.enemyActor);
    if (
      move.positionCondition
      && move.positionCondition !== opponentPosition(this.player, this.enemy)
    ) {
      return false;
    }
    setCombatCommandOverride(this.player, moveId, this.moves);
    for (const command of move.input) {
      queueCombatCommand(this.player, command);
    }
    this.commandResult = null;
    this.commandResultSeconds = 0;
    this.onStateChanged(this.snapshot());
    return true;
  }

  performPlayerString(stringId) {
    const definition = MARTIAL_ARTS_STRINGS.find(
      (candidate) => candidate.id === stringId,
    );
    if (
      !definition
      || !this.active
      || !this.controlsActive
      || this.player.defeated
    ) {
      return false;
    }
    for (const command of definition.input) {
      queueCombatCommand(this.player, command);
    }
    this.commandResult = null;
    this.commandResultSeconds = 0;
    this.onStateChanged(this.snapshot());
    return true;
  }

  executeEnemyDecision(decision) {
    this.enemy.guardHeld = decision.kind === "guard";
    if (Number.isFinite(decision.turnYaw)) {
      this.enemyActor.setYaw(decision.turnYaw);
    }
    if (decision.kind === "approach") {
      this.enemyActor.moveFacing(decision.distance);
    } else if (decision.kind === "retreat") {
      this.enemyActor.moveFacing(-decision.distance);
    } else if (decision.kind === "move") {
      const move = this.moves[decision.moveId];
      if (startCombatMove(this.enemy, move, {
        lockedTargetId: this.player.id,
        defender: this.player,
      })) {
        const pairAnchor = this.enemyActor.combatVisualPosition?.()
          || this.enemyActor.position();
        this.enemyActor.playMove(decision.moveId, {
          holdLastFrame: Boolean(move?.synchronizedVictim),
        });
        this.sounds?.start(this.enemy.id, {
          bank: "battle",
          sequence: move?.enemyAnimation || move?.animation,
        });
        if (move?.synchronizedVictim) {
          // Establish the common authored yaw before a traveling receiver
          // captures its world-space root-motion origin.
          this.playerActor.alignPairedTo?.(this.enemyActor);
          const playVictim = (
            this.playerActor.playOpponentMoveVictim
            || this.playerActor.playMoveVictim
          );
          playVictim?.call(this.playerActor, decision.moveId, {
            highProficiency: this.enemy.action.highProficiency,
            holdLastFrame: true,
          });
          this.sounds?.start(this.player.id, {
            bank: move?.enemyVictimAnimation ? "battle" : "global",
            sequence: move?.enemyVictimAnimation || move?.victimAnimation,
          });
          alignSynchronizedPair(
            this.enemyActor,
            this.playerActor,
            decision.moveId,
            pairAnchor,
          );
        }
      }
    }
  }

  processEvent(event) {
    if (event.type === "followup-stage-started") {
      const actor = event.combatantId === this.player.id
        ? this.playerActor
        : this.enemyActor;
      const defender = event.defenderId === this.player.id
        ? this.playerActor
        : this.enemyActor;
      const stage = this.combat.followupStages[event.followupId];
      const pairAnchor = actor.combatVisualPosition?.() || actor.position();
      actor.playFollowupStage?.(event.followupId, {
        blendSeconds: 2 / COMBAT_TICKS_PER_SECOND,
        holdLastFrame: Boolean(stage?.synchronizedVictim),
      });
      this.sounds?.start(event.combatantId, {
        bank: "global",
        sequence: stage?.animation,
      });
      if (stage?.victimAnimation && event.defenderId) {
        defender.alignPairedTo?.(actor);
        defender.playFollowupVictim?.(event.followupId, {
          blendSeconds: 2 / COMBAT_TICKS_PER_SECOND,
          holdLastFrame: true,
        });
        this.sounds?.start(event.defenderId, {
          bank: "global",
          sequence: stage.victimAnimation,
        });
        alignSynchronizedPair(
          actor,
          defender,
          event.followupId,
          pairAnchor,
        );
      }
      return;
    }
    if (event.type === "throw-acquisition-started") {
      const actor = event.combatantId === this.player.id
        ? this.playerActor
        : this.enemyActor;
      actor.playFollowupStage?.(event.stageId, {
        blendSeconds: 2 / COMBAT_TICKS_PER_SECOND,
      });
      const stage = this.combat.followupStages[event.stageId];
      this.sounds?.start(event.combatantId, {
        bank: "global",
        sequence: stage?.animation,
      });
      return;
    }
    if (event.type === "string-stage-started") {
      const actor = event.combatantId === this.player.id
        ? this.playerActor
        : this.enemyActor;
      actor.playStringStage?.(event.stageId, {
        blendSeconds: 2 / COMBAT_TICKS_PER_SECOND,
      });
      this.sounds?.start(event.combatantId, {
        bank: "global",
        sequence: this.combat.stringStages[event.stageId]?.animation,
      });
      return;
    }
    if (event.type === "move-started") {
      const actor = event.combatantId === this.player.id
        ? this.playerActor
        : this.enemyActor;
      const move = this.combat.actionDefinition({ moveId: event.moveId });
      const pairAnchor = actor.combatVisualPosition?.() || actor.position();
      actor.playMove(event.moveId, {
        highProficiency: event.highProficiency,
        holdLastFrame: Boolean(move?.synchronizedVictim),
      });
      const actorIsPlayer = event.combatantId === this.player.id;
      this.sounds?.start(event.combatantId, {
        bank: actorIsPlayer ? "global" : "battle",
        sequence: actorIsPlayer
          ? (
            event.highProficiency && move?.highProficiencyAnimation
              ? move.highProficiencyAnimation
              : move?.animation
          )
          : move?.enemyAnimation || move?.animation,
      });
      if (
        move?.synchronizedVictim
        && event.defenderId
      ) {
        const defender = event.defenderId === this.player.id
          ? this.playerActor
          : this.enemyActor;
        // Actor and victim MOTN clips are authored in one shared orientation.
        // Leaving the victim facing the attacker reverses its extracted root
        // trajectory and makes a shoulder throw travel away from the actor.
        defender.alignPairedTo?.(actor);
        defender.playMoveVictim?.(event.moveId, {
          highProficiency: event.highProficiency,
          holdLastFrame: true,
        });
        this.sounds?.start(event.defenderId, {
          bank: "global",
          sequence: (
            event.highProficiency && move.highProficiencyVictimAnimation
              ? move.highProficiencyVictimAnimation
              : move.victimAnimation
          ),
        });
        alignSynchronizedPair(
          actor,
          defender,
          event.moveId,
          pairAnchor,
        );
      }
      return;
    }
    if (event.type === "repositioned") {
      const attacker = event.attackerId === this.player.id
        ? this.playerActor
        : this.enemyActor;
      attacker.setCombatPosition?.(event.x, event.z, event.yaw);
      return;
    }
    if (event.type === "move-ended") {
      this.sounds?.stop(event.combatantId);
      const move = this.combat.actionDefinition({ moveId: event.moveId });
      if (
        move?.synchronizedVictim
        && event.defenderId
        && !event.continued
      ) {
        const actor = event.combatantId === this.player.id
          ? this.playerActor
          : this.enemyActor;
        const defender = event.defenderId === this.player.id
          ? this.playerActor
          : this.enemyActor;
        const sharedOrigin = (
          actor.activeOneShotRootMotionKind?.() === "pose"
          && defender.activeOneShotRootMotionKind?.() === "pose"
        );
        let transferredFacing = false;
        if (!sharedOrigin) {
          const source = actor.position();
          const target = defender.position();
          const deltaX = target.x - source.x;
          const deltaZ = target.z - source.z;
          // Traveling paired clips hand their final world direction back to
          // stance. A shared pose-root pair has coincident world roots, so its
          // authored yaw remains authoritative instead.
          if (Math.hypot(deltaX, deltaZ) > 1e-6) {
            actor.setYaw(Math.atan2(deltaX, deltaZ));
            transferredFacing = true;
          }
        }
        // A held actor clip owns the pair through its complete authored
        // lifetime. Shared pose-root pairs bake the actor's final local root
        // offset into world space as this one-shot is released.
        if (!actor.releasePaired?.({
          atomic: transferredFacing,
        })) {
          actor.releaseReaction?.();
        }
      }
      return;
    }
    if (event.type === "recovered") {
      const actor = event.combatantId === this.player.id
        ? this.playerActor
        : this.enemyActor;
      if (!actor.releasePaired?.()) actor.releaseReaction?.();
      this.sounds?.stop(event.combatantId);
      return;
    }
    if (event.type === "throw-acquisition-failed") {
      const move = this.moves[event.moveId];
      if (event.combatantId === this.player.id && move) {
        this.commandResult = {
          tokens: [...(move.nativeInput || move.input || [])],
          moveLabel: move.label,
          locked: true,
          connected: false,
          missed: true,
          damage: null,
        };
        this.commandResultSeconds = 0.35;
      }
      return;
    }
    if (event.type !== "hit" && event.type !== "guarded") return;
    const defender = event.defenderId === this.player.id
      ? this.playerActor
      : this.enemyActor;
    const move = this.combat.actionDefinition({ moveId: event.moveId });
    // A synchronized follow-up starts its victim clip alongside Ryo's clip.
    // Its later damage frame must not restart that paired animation.
    if (move?.synchronizedVictim) return;
    if (
      event.type === "hit"
      && (move?.kind === "throw" || move?.kind === "counter")
      && move.victimAnimation
      && !event.defeated
      && defender.playMoveVictim?.(event.moveId, {
        highProficiency: event.highProficiency,
        holdLastFrame: event.knockdown,
      })
    ) {
      this.sounds?.start(event.defenderId, {
        bank: "global",
        sequence: (
          event.highProficiency && move.highProficiencyVictimAnimation
            ? move.highProficiencyVictimAnimation
            : move.victimAnimation
        ),
      });
      return;
    }
    const reaction = event.defeated
      ? "defeated"
      : event.knockdown
        ? "knockdown"
        : event.type === "guarded"
          ? "guard"
          : "hit";
    defender.playReaction(reaction, event);
    this.sounds?.start(event.defenderId, {
      bank: reaction === "defeatedIdle" ? "global" : "battle",
      sequence: this.reactionSequences[reaction],
    });
  }

  update(deltaSeconds) {
    if (this.input.consumeToggle()) this.toggle();
    if (!this.active) {
      this.input.consumeCommands();
      return [];
    }
    if (this.input.consumeControlsToggle?.()) {
      if (!this.controlsActive) {
        this.setControlsActive(true);
      } else if (this.player.defeated || this.enemy.defeated) {
        this.resetCombatants();
        this.setControlsActive(false);
      } else if (
        this.playerMovementLocked
        || this.enemy.action
        || this.enemy.reaction
      ) {
        // Finish an authored attack/reaction pair before returning to normal
        // locomotion so neither actor is stranded in a one-shot pose.
        this.controlsExitRequested = true;
      } else {
        this.setControlsActive(false);
      }
    }
    if (!this.controlsActive) {
      this.input.discardCommands?.();
      this.input.consumeCommands();
      this.player.guardHeld = false;
      return [];
    }

    const previousCommandFeedback = JSON.stringify(
      this.playerCommandFeedback(),
    );
    const previousOpponentPosition = opponentPosition(
      this.player,
      this.enemy,
    );
    const frameSeconds = Math.min(0.1, Math.max(0, deltaSeconds));
    this.sounds?.update(frameSeconds);
    if (this.commandResult) {
      this.commandResultSeconds -= frameSeconds;
      if (this.commandResultSeconds <= 0) {
        this.commandResult = null;
        this.commandResultSeconds = 0;
      }
    }
    const previousPlayerGuard = this.player.guardHeld;
    const previousEnemyGuard = this.enemy.guardHeld;
    syncCombatant(this.player, this.playerActor);
    syncCombatant(this.enemy, this.enemyActor);
    if (
      !this.player.action
      && !this.player.reaction
      && !this.enemy.action
      && !this.enemy.reaction
      && this.playerActor.keepDistanceFrom?.(
        this.enemyActor,
        this.player.radius + this.enemy.radius,
      )
    ) {
      syncCombatant(this.player, this.playerActor);
    }
    const playerFacing = distanceAndFacing(this.player, this.enemy);
    // A synchronized victim clip can outlive the attacker's action: Chai
    // finishes his punches, Ryo kicks him away, then Ryo still has to get
    // back to his feet. Do not buffer commands anywhere in that complete
    // reaction window or they will fire as soon as the recovery event lands.
    const playerRecovering = Boolean(
      this.player.reaction
      && !this.player.defeated
    );
    if (playerRecovering) this.input.discardCommands?.();
    const consumedPlayerCommands = this.input.consumeCommands();
    const playerCommands = playerRecovering
      ? []
      : consumedPlayerCommands;
    if (playerCommands.length > 0) {
      this.commandResult = null;
      this.commandResultSeconds = 0;
    }
    const activePlayerMove = this.combat.actionDefinition(
      this.player.action,
    );
    const pairedFacingLocked = Boolean(
      this.player.action
      && activePlayerMove?.synchronizedVictim
    );
    if (!pairedFacingLocked && !this.player.reaction) {
      this.playerActor.setYaw(playerFacing.targetYaw);
      this.player.yaw = playerFacing.targetYaw;
    }
    // A held defeat pose previously made every later J/K/L press appear
    // broken: the simulation correctly ignored commands from a defeated
    // combatant, but offered no way to start another exchange. Treat the
    // next attack as an explicit rematch and preserve that same input.
    if (
      containsAttackCommand(playerCommands)
      && (this.player.defeated || this.enemy.defeated)
    ) {
      this.resetCombatants();
    }
    for (const command of playerCommands) {
      queueCombatCommand(this.player, command);
    }
    this.player.guardHeld = (
      this.input.guarding
      && !this.player.action
      && !this.player.reaction
    );

    // Do not replay time spent on loading screens or suspended browser tabs
    // as a burst of attacks on the first visible frame.
    if (this.enemyOffenseUnlocked) {
      this.aiAccumulator += frameSeconds * COMBAT_TICKS_PER_SECOND;
      while (this.aiAccumulator >= 1) {
        this.aiAccumulator -= 1;
        syncCombatant(this.enemy, this.enemyActor);
        this.executeEnemyDecision(this.enemyAI.decide(this.enemy, this.player));
      }
    }

    const events = this.combat.update(frameSeconds);
    // A direction or the first half of a chord is not yet an attack. Let Ryo
    // visibly establish the first authored move before Chai's AI clock starts;
    // otherwise Chai can interrupt a still-buffered command and make the
    // player animation appear not to work.
    if (
      !this.enemyOffenseUnlocked
      && events.some((event) => (
        event.type === "move-started"
        && event.combatantId === this.player.id
      ))
    ) {
      this.enemyOffenseUnlocked = true;
    }
    for (const event of events) this.processEvent(event);
    this.lastEvents = events;
    if (
      this.controlsExitRequested
      && !this.playerMovementLocked
      && !this.enemy.action
      && !this.enemy.reaction
    ) {
      this.setControlsActive(false);
    }
    const guardChanged = (
      this.player.guardHeld !== previousPlayerGuard
      || this.enemy.guardHeld !== previousEnemyGuard
    );
    const commandFeedbackChanged = previousCommandFeedback !== JSON.stringify(
      this.playerCommandFeedback(),
    );
    const opponentPositionChanged = previousOpponentPosition !== (
      opponentPosition(this.player, this.enemy)
    );
    if (
      events.length > 0
      || guardChanged
      || commandFeedbackChanged
      || opponentPositionChanged
    ) {
      this.onStateChanged(this.snapshot(), events);
    }
    return events;
  }

  dispose() {
    this.setActive(false);
    this.input.dispose();
  }
}
