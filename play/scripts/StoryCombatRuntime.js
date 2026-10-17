import catalog from "../data/story-combat.json" with { type: "json" };
import { CombatInput } from "../combat/CombatInput.js";
import { CombatEncounterRuntime } from "../combat/CombatEncounterRuntime.js";
import { CombatTargetIndicator } from "../combat/CombatTargetIndicator.js";
import { MartialArtsEnemyAI } from "../../src/MartialArtsCombat.js";
import { combatPlayerAnimationState } from "../characters/PlayerCombatRuntime.js";
import { PLAYER_COMBAT_CONFIG } from "../characters/PlayerMotionLibrary.js";
import { targetRelativeMovement, targetRelativeMovementDirection } from "../../src/ThirdPersonControllerRules.js";

// Story owns encounter lifetime, formations, waves and results. Practice owns
// neither these models nor this input. Both use the same combat/animation core.
export class StoryCombatRuntime {
  constructor({ actors, createCombatActors, scene, getController, getBinding,
    capturePlayerState, restorePlayerState, onIntent, musicControls = null, sounds = null,
    onStateChanged = () => {}, onViewChanged = () => {}, target = window, now = () => performance.now(),
    createIndicator = getEncounter => new CombatTargetIndicator(scene, getEncounter),
  }) {
    Object.assign(this, { actors, createCombatActors, getController, getBinding, capturePlayerState,
      restorePlayerState, onIntent, musicControls, sounds, onStateChanged, onViewChanged, target, now, createIndicator });
    this.active = null;
  }

  get encounter() { return this.active?.encounter || null; }

  async show(view, transaction) {
    if (this.active) {
      if (this.active.transaction !== transaction || this.active.token !== view.token || this.active.definition.id !== view.id) {
        throw new Error("Combat ownership changed without cleanup");
      }
      this.active.serverView = view;
      this.publish();
      return true;
    }
    const definition = catalog.encounters.find(def => def.id === view.id);
    if (!definition || definition.area !== transaction.area) throw new Error(`No combat presentation ${view.id} in ${transaction.area}`);
    const owner = { transaction, definition, serverView: view, token: view.token, controller: new AbortController(),
      snapshot: this.capturePlayerState(), actorsBegun: false, prepared: false, records: null,
      wave: 0, defeated: 0, elapsed: 0, waveDelay: null, intro: 0, outcome: null, sentResult: false,
      pollAt: this.now(), feedback: 0, guard: false, damagedAt: 0 };
    this.active = owner;
    const { signal } = owner.controller;
    try {
      const tags = definition.actors.map(actor => actor.tag);
      await this.actors.prepare(tags, { signal });
      signal.throwIfAborted();
      this.actors.begin(owner, tags);
      owner.actorsBegun = true;
      owner.orientations = tags.map(tag => this.actors.activeActor(tag).root)
        .map(root => [root, root.rotationQuaternion]);
      owner.records = await this.createCombatActors(tags.map(tag => ({ tag, ...this.actors.activeActor(tag) })), signal);
      signal.throwIfAborted();
      owner.input = new CombatInput({ target: this.target, enableToggle: false,
        targetingEnabled: () => Boolean(owner.prepared && owner.serverView.ready && !owner.outcome),
        getBindings: () => ({ controls: this.getBinding("cancel"), hand: this.getBinding("combatHand"),
          leg: this.getBinding("combatLeg"), throw: this.getBinding("combatThrow"), guard: this.getBinding("combatGuard"),
          run: this.getBinding("run"), up: this.getBinding("moveForward"), down: this.getBinding("moveBackward"),
          left: this.getBinding("moveLeft"), right: this.getBinding("moveRight"),
          targetLeft: this.getBinding("combatTargetLeft"), targetRight: this.getBinding("combatTargetRight"),
        }) });
      owner.indicator = this.createIndicator(() => this.encounter);
      this.startWave(owner);
      const controller = this.getController();
      controller.setFirstPerson(false);
      controller.cameraDistance = Math.max(definition.waves?.length ? 6 : 4, controller.cameraDistance);
      controller.cameraPitch = .24;
      this.frameTarget();
      owner.prepared = true;
      if (definition.musicTrack && this.musicControls?.playTemporaryTrack(definition.musicTrack, { gain: 1, loop: true })) owner.musicTrack = definition.musicTrack;
      this.publish();
      this.onIntent("combat_ready", owner.token, null);
      return true;
    } catch (error) {
      if (this.active === owner) this.finish(transaction);
      throw error;
    }
  }

  startWave(owner) {
    const { definition: def } = owner;
    const oldHealth = new Map(owner.encounter ? [owner.encounter.player, ...owner.encounter.enemies.map(e => e.combatant)]
      .filter(c => c.team === "player").map(c => [c.id, c.health]) : []);
    owner.encounter?.setActive(false);
    const spawns = def.waves ? [...def.actors.filter(a => a.tag === "AKIR" || a.team === "ally"), ...def.waves[owner.wave].actors] : def.actors;
    for (const [tag, record] of owner.records) {
      const spawn = spawns.find(s => s.tag === tag);
      record.root.setEnabled(Boolean(spawn));
      if (!spawn) continue;
      record.animation.reset();
      if (owner.wave === 0 || tag !== "AKIR") {
        record.root.position.set(spawn.x, spawn.y, spawn.z);
        record.actor.setYaw(0);
      }
    }
    const player = owner.records.get("AKIR");
    const enemies = spawns.filter(s => s.tag !== "AKIR").map(spawn => ({
      id: spawn.tag, name: def.actorDefinitions.find(a => a.actorCode === spawn.tag).label,
      actor: owner.records.get(spawn.tag).actor, team: spawn.team === "ally" ? "player" : "enemy",
      combatOptions: { maxHealth: spawn.health, minimumHealth: def.practiceDurationMs || spawn.team === "ally" ? 1 : 0, damageScale: spawn.damageScale ?? 1 },
      ai: new MartialArtsEnemyAI(), speedScale: def.enemySpeed / 3,
    }));
    owner.encounter = new CombatEncounterRuntime({ input: owner.input, playerActor: player.actor, enemies,
      playerOptions: { id: "AKIR", maxHealth: def.actors[0].health, minimumHealth: def.practiceDurationMs ? 1 : 0 },
      preservePlacement: true, autoRematch: false, allowControlExit: false, waitForFirstAttack: false,
      maxAttackers: def.maxAttackers, sounds: this.sounds, reactionSequences: PLAYER_COMBAT_CONFIG.reactions,
      projectTargets: entries => owner.indicator.projectTargets(entries),
      onStateChanged: snapshot => this.onStateChanged(snapshot),
    });
    owner.encounter.setActive(true);
    for (const c of owner.encounter.combat.combatants.values()) {
      if (oldHealth.has(c.id)) c.health = oldHealth.get(c.id);
    }
    owner.waveDelay = null;
    owner.intro = (def.waves?.[owner.wave].introMs || 0) / 1000;
    this.frameTarget();
  }

  frameTarget() {
    const owner = this.active, encounter = owner.encounter;
    const boss = owner.definition.waves?.[owner.wave].bossTag;
    if (boss) encounter.player.targetId = boss;
    const p = encounter.playerActor.position(), e = encounter.enemyActor.position();
    const controller = this.getController();
    controller.cameraYaw = Math.atan2(p.x - e.x, p.z - e.z);
    controller.updateCamera(1);
  }

  action(command) {
    const owner = this.active;
    if (owner?.serverView.ready && !owner.outcome) owner.input.pressed.push(command);
  }
  setGuard(value) { if (this.active) this.active.guard = Boolean(value); }

  publish() {
    const owner = this.active;
    if (!owner?.encounter) return;
    const { definition: def, encounter: e } = owner;
    owner.view = { id: def.id, token: owner.token, label: def.label, ready: owner.serverView.ready,
      practice: Boolean(def.practiceDurationMs), remainingMs: Math.max(0, (def.practiceDurationMs || def.timeoutMs) - owner.elapsed * 1000),
      wave: owner.wave + 1, waveCount: def.waves?.length || 1, waveLabel: def.waves?.[owner.wave].label,
      bossTag: def.waves?.[owner.wave].bossTag, intro: owner.intro > 0,
      defeated: owner.defeated + e.opponents.filter(a => a.combatant.defeated).length,
      totalOpponents: def.waves?.reduce((sum, wave) => sum + wave.actors.length, 0),
      actors: [{ id: "AKIR", combatant: e.player }, ...e.enemies].map(({ id, combatant: c }) => ({
        tag: id, x: c.x, z: c.z, health: Math.ceil(c.health), maxHealth: c.maxHealth, team: c.team === "player" && id !== "AKIR" ? "ally" : c.team,
      })),
    };
    this.onViewChanged(owner.view);
  }

  update(transaction, deltaSeconds) {
    const owner = this.active;
    if (!owner || owner.transaction !== transaction) return true;
    // This is a lease keepalive, not a stream of gameplay input. It also keeps
    // long asset preparation alive; the server caps preparation and fight time.
    if (this.now() - owner.pollAt >= 5000 && !owner.sentResult) {
      const action = owner.prepared && !owner.serverView.ready ? "combat_ready" : "combat_poll";
      if (this.onIntent(action, owner.token, null)) owner.pollAt = this.now();
    }
    if (!owner.prepared || !owner.serverView.ready) return true;
    const dt = Math.min(.1, Math.max(0, deltaSeconds));
    const { encounter: e, definition: def } = owner;
    if (!owner.outcome) {
      owner.elapsed += dt;
      owner.intro = Math.max(0, owner.intro - dt);
      const keys = new Set(), bindings = owner.input.getBindings();
      for (const [binding, key] of [["up", "KeyW"], ["down", "KeyS"], ["left", "KeyA"], ["right", "KeyD"]]) {
        if (owner.input.held.has(bindings[binding])) keys.add(key);
      }
      let moving = false;
      if (owner.intro === 0 && owner.waveDelay === null) {
        if (!e.playerMovementLocked && !e.player.defeated) {
          const movement = targetRelativeMovement(keys, e.playerTargetYaw() ?? e.player.yaw);
          const p = e.playerActor.position();
          const speed = def.playerSpeed * (owner.input.held.has(bindings.run) ? 1.5 : 1);
          e.playerActor.setCombatPosition(p.x + movement.x * speed * dt, p.z + movement.z * speed * dt, e.playerActor.yaw());
          moving = movement.lengthSquared() > 0;
        }
        const buttonGuard = owner.guard && !owner.input.held.has(bindings.guard);
        if (buttonGuard) owner.input.held.add(bindings.guard);
        const oldHealth = e.player.health;
        e.update(dt);
        if (e.player.health < oldHealth) owner.damagedAt = owner.elapsed;
        // Retain Story's authored recovery: four HP/sec after three seconds
        // without damage. Practice and any future PvP rules do not inherit it.
        if (!e.player.defeated && owner.elapsed - owner.damagedAt > 3) {
          e.player.health = Math.min(e.player.maxHealth, e.player.health + dt * 4);
        }
        if (buttonGuard) owner.input.held.delete(bindings.guard);
      } else owner.input.discardCommands();
      for (const [tag, record] of owner.records) {
        const c = e.combat.combatants.get(tag);
        if (!c) continue;
        // Paired root motion owns its exact frame positions. Clamp ordinary
        // locomotion only; clipping a throw's two roots independently breaks it.
        if (!c.action && !c.reaction) {
          const p = record.actor.position(), b = def.bounds;
          record.actor.setCombatPosition(Math.max(b.minX, Math.min(b.maxX, p.x)), Math.max(b.minZ, Math.min(b.maxZ, p.z)), record.actor.yaw());
        }
        const state = tag === "AKIR" ? combatPlayerAnimationState(e, { moving, combatDirection: targetRelativeMovementDirection(keys) })
          : c.guardHeld ? "combatGuard" : e.enemies.find(entry => entry.id === tag).movementState || "combatStance";
        record.animation.update(dt, state);
      }
      if (e.player.defeated) owner.outcome = "defeated";
      else if (def.practiceDurationMs && owner.elapsed * 1000 >= def.practiceDurationMs) owner.outcome = "practiced";
      else if (owner.elapsed * 1000 >= def.timeoutMs) owner.outcome = "failure";
      else if (e.enemiesDefeated && !e.playerMovementLocked) {
        if (!def.waves || owner.wave === def.waves.length - 1) owner.outcome = "success";
        else {
          owner.waveDelay ??= (def.waveDelayMs || 0) / 1000;
          owner.waveDelay -= dt;
          if (owner.waveDelay <= 0) {
            owner.defeated += e.opponents.length;
            owner.wave++;
            this.startWave(owner);
          }
        }
      }
      owner.feedback += dt;
      if (owner.feedback >= .1) { owner.feedback = 0; this.publish(); this.onStateChanged(e.snapshot()); }
    }
    this.getController().updateCamera(Math.max(.01, dt));
    if (owner.outcome && !owner.sentResult) {
      owner.input.discardCommands();
      this.publish();
      if (this.onIntent("combat_result", owner.token, { outcome: owner.outcome })) owner.sentResult = true;
    }
    return true;
  }

  finish(transaction) {
    const owner = this.active;
    if (!owner || owner.transaction !== transaction) return false;
    this.active = null;
    owner.controller.abort(new DOMException("Combat presentation released", "AbortError"));
    owner.input?.dispose();
    owner.indicator?.dispose();
    try {
      owner.encounter?.setActive(false);
      for (const record of owner.records?.values() || []) record.animation.reset();
    } finally {
      // Scheduled actors may have a source-order quaternion; combat borrows
      // yaw-only orientation, then returns the original object before the
      // presentation owner restores its saved components (also on load error).
      for (const [root, quaternion] of owner.orientations || []) root.rotationQuaternion = quaternion;
      try { if (owner.actorsBegun) this.actors.end(owner, "stopped"); }
      finally { try { if (owner.musicTrack) this.musicControls.stopTemporaryTrack(owner.musicTrack); }
        finally { this.restorePlayerState(owner.snapshot); } }
    }
    return true;
  }
}
