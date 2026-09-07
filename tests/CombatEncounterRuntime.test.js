import assert from "node:assert/strict";
import test from "node:test";
import { CombatEncounterRuntime } from "../play/combat/CombatEncounterRuntime.js";
import {
  MARTIAL_ARTS_MOVES,
  MARTIAL_ARTS_STRINGS,
  combatActionDuration,
  startCombatMove,
} from "../src/MartialArtsCombat.js";

class Input {
  constructor() {
    this.commands = [];
    this.guarding = false;
    this.toggle = false;
    this.controlsToggle = false;
  }

  consumeCommands() {
    return this.commands.splice(0);
  }

  consumeToggle() {
    const value = this.toggle;
    this.toggle = false;
    return value;
  }

  consumeControlsToggle() {
    const value = this.controlsToggle;
    this.controlsToggle = false;
    return value;
  }

  dispose() {}
}

function actor(x = 0, z = 0, yaw = 0) {
  return {
    x,
    z,
    angle: yaw,
    enabled: true,
    moves: [],
    stringStages: [],
    followupStages: [],
    followupVictims: [],
    opponentVictims: [],
    reactions: [],
    releases: 0,
    rootMotionKinds: {},
    choreographySamples: {},
    activeRootMotionKind: null,
    activeChoreographySample: null,
    poseRootTranslation: null,
    sharedPair: false,
    position() {
      return { x: this.x, z: this.z };
    },
    yaw() {
      return this.angle;
    },
    setYaw(value) {
      this.angle = value;
    },
    keepDistanceFrom(other, minimumDistance) {
      const target = other.position();
      let deltaX = this.x - target.x;
      let deltaZ = this.z - target.z;
      const distance = Math.hypot(deltaX, deltaZ);
      if (distance >= minimumDistance) return false;
      if (distance <= 1e-8) {
        deltaX = -Math.sin(other.yaw());
        deltaZ = -Math.cos(other.yaw());
      } else {
        deltaX /= distance;
        deltaZ /= distance;
      }
      this.x = target.x + deltaX * minimumDistance;
      this.z = target.z + deltaZ * minimumDistance;
      return true;
    },
    alignPairedTo(other, { distance } = {}) {
      const yaw = other.yaw();
      this.angle = yaw;
      if (Number.isFinite(distance)) {
        const position = other.position();
        this.x = position.x + Math.sin(yaw) * distance;
        this.z = position.z + Math.cos(yaw) * distance;
      }
    },
    activeOneShotRootMotionKind() {
      return this.activeRootMotionKind;
    },
    activeOneShotChoreographySample() {
      return this.activeChoreographySample;
    },
    combatVisualPosition() {
      return this.position();
    },
    setSharedPair(active) {
      this.sharedPair = Boolean(active);
    },
    setCombatPosition(nextX, nextZ, nextYaw) {
      this.x = nextX;
      this.z = nextZ;
      this.angle = nextYaw;
    },
    setEnabled(value) {
      this.enabled = value;
    },
    placeRelativeTo(other, distance) {
      const position = other.position();
      this.x = position.x + Math.sin(other.yaw()) * distance;
      this.z = position.z + Math.cos(other.yaw()) * distance;
      this.angle = other.yaw() + Math.PI;
    },
    placeBeside(other, distance) {
      const position = other.position();
      this.x = position.x + Math.cos(other.yaw()) * distance;
      this.z = position.z - Math.sin(other.yaw()) * distance;
      this.angle = other.yaw() - Math.PI / 2;
    },
    moveFacing(distance) {
      this.x += Math.sin(this.angle) * distance;
      this.z += Math.cos(this.angle) * distance;
    },
    playMove(moveId, options) {
      this.moves.push(moveId);
      this.lastMoveOptions = options;
      this.activeRootMotionKind =
        this.rootMotionKinds[`move:${moveId}`] || null;
      this.activeChoreographySample =
        this.choreographySamples[`move:${moveId}`] || null;
    },
    playStringStage(stageId) {
      this.stringStages.push(stageId);
      return true;
    },
    playFollowupStage(stageId, options) {
      this.followupStages.push(stageId);
      this.lastFollowupOptions = options;
      this.activeRootMotionKind =
        this.rootMotionKinds[`followup:${stageId}`] || null;
      this.activeChoreographySample =
        this.choreographySamples[`followup:${stageId}`] || null;
      return true;
    },
    playFollowupVictim(stageId, options) {
      this.followupVictims.push(stageId);
      this.lastFollowupVictimOptions = options;
      this.activeRootMotionKind =
        this.rootMotionKinds[`followup-victim:${stageId}`] || null;
      this.activeChoreographySample =
        this.choreographySamples[`followup-victim:${stageId}`] || null;
      return true;
    },
    playMoveVictim(moveId, options) {
      this.moves.push(`${moveId}:victim`);
      this.lastVictimOptions = options;
      this.activeRootMotionKind =
        this.rootMotionKinds[`victim:${moveId}`] || null;
      this.activeChoreographySample =
        this.choreographySamples[`victim:${moveId}`] || null;
      return true;
    },
    playOpponentMoveVictim(moveId, options) {
      this.opponentVictims.push(moveId);
      this.lastOpponentVictimOptions = options;
      this.activeRootMotionKind =
        this.rootMotionKinds[`opponent-victim:${moveId}`] || null;
      this.activeChoreographySample =
        this.choreographySamples[`opponent-victim:${moveId}`] || null;
      return true;
    },
    playReaction(reaction, options) {
      this.reactions.push(reaction);
      this.lastReactionOptions = options;
    },
    releaseReaction() {
      this.releases += 1;
      this.sharedPair = false;
      this.activeRootMotionKind = null;
      return true;
    },
    releasePaired(options = {}) {
      this.lastReleasePairedOptions = options;
      if (this.sharedPair && this.poseRootTranslation) {
        const [localX, , localZ] = this.poseRootTranslation;
        const forward = -localZ;
        this.x += (
          localX * Math.cos(this.angle) + forward * Math.sin(this.angle)
        );
        this.z += (
          -localX * Math.sin(this.angle) + forward * Math.cos(this.angle)
        );
      }
      this.releases += 1;
      this.sharedPair = false;
      this.activeRootMotionKind = null;
      return true;
    },
  };
}

test("encounter routes animation events to their native sound banks", () => {
  const calls = [];
  const sounds = {
    start: (channel, cue) => calls.push({ channel, ...cue }),
    stop: (channel) => calls.push({ stop: channel }),
    reset: () => calls.push({ reset: true }),
    update: () => {},
  };
  const runtime = new CombatEncounterRuntime({
    input: new Input(),
    playerActor: actor(),
    enemyActor: actor(),
    sounds,
    reactionSequences: {
      hit: "AKI_AKI_NGR_UDEKIME",
    },
  });
  runtime.processEvent({
    type: "move-started",
    combatantId: "ryo",
    defenderId: "enemy",
    moveId: "tigerKnuckle",
    highProficiency: true,
  });
  runtime.processEvent({
    type: "move-started",
    combatantId: "enemy",
    defenderId: "ryo",
    moveId: "tigerKnuckle",
    highProficiency: false,
  });
  runtime.processEvent({
    type: "hit",
    combatantId: "ryo",
    defenderId: "enemy",
    moveId: "tigerKnuckle",
    highProficiency: true,
    defeated: false,
    knockdown: false,
  });
  assert.deepEqual(calls, [
    {
      channel: "ryo",
      bank: "global",
      sequence: (
        MARTIAL_ARTS_MOVES.tigerKnuckle.highProficiencyAnimation
        || MARTIAL_ARTS_MOVES.tigerKnuckle.animation
      ),
    },
    {
      channel: "enemy",
      bank: "battle",
      sequence:
        MARTIAL_ARTS_MOVES.tigerKnuckle.enemyAnimation,
    },
    {
      channel: "enemy",
      bank: "battle",
      sequence: "AKI_AKI_NGR_UDEKIME",
    },
  ]);
});

test("Combat Practice gives Ryo 100 HP by default", () => {
  const runtime = new CombatEncounterRuntime({
    input: new Input(),
    playerActor: actor(),
    enemyActor: actor(),
  });

  assert.equal(runtime.player.maxHealth, 100);
  assert.equal(runtime.player.health, 100);
  assert.equal(runtime.enemy.maxHealth, 20);
});

test("encounter activation places and reveals an enemy beside the player", () => {
  const input = new Input();
  const player = actor(4, 7, Math.PI / 2);
  const enemy = actor();
  const runtime = new CombatEncounterRuntime({
    input,
    playerActor: player,
    enemyActor: enemy,
  });
  assert.equal(enemy.enabled, false);
  input.toggle = true;
  runtime.update(0);
  assert.equal(runtime.active, true);
  assert.equal(enemy.enabled, true);
  assert.ok(Math.abs(enemy.x - 4) < 1e-8);
  assert.ok(Math.abs(enemy.z - 5) < 1e-8);
});

test("X switches between Free Battle controls and free-roam controls", () => {
  const input = new Input();
  const runtime = new CombatEncounterRuntime({
    input,
    playerActor: actor(),
    enemyActor: actor(),
    enemyAI: { decide: () => ({ kind: "idle" }) },
  });
  runtime.setActive(true);
  assert.equal(runtime.snapshot().controlsActive, true);

  input.controlsToggle = true;
  runtime.update(0);
  assert.equal(runtime.snapshot().controlsActive, false);
  assert.equal(runtime.playerMovementLocked, false);

  input.commands.push("hand");
  runtime.update(1 / 30);
  assert.deepEqual(runtime.playerActor.moves, []);

  input.controlsToggle = true;
  runtime.update(0);
  assert.equal(runtime.snapshot().controlsActive, true);
  input.commands.push("hand");
  runtime.update(1 / 30);
  assert.deepEqual(runtime.playerActor.moves, ["tigerKnuckle"]);
});

test("player commands drive animation, damage, and reaction adapters", () => {
  const input = new Input();
  const player = actor();
  const enemy = actor();
  const snapshots = [];
  const runtime = new CombatEncounterRuntime({
    input,
    playerActor: player,
    enemyActor: enemy,
    enemyAI: { decide: () => ({ kind: "idle" }) },
    onStateChanged: (snapshot) => snapshots.push(snapshot),
  });
  runtime.setActive(true);
  enemy.x = 0;
  enemy.z = 1;
  input.commands.push("hand");
  for (let tick = 0; tick < 10; tick += 1) runtime.update(1 / 30);
  assert.deepEqual(player.moves, ["tigerKnuckle"]);
  assert.equal(runtime.enemy.health, 15);
  assert.deepEqual(enemy.reactions, ["hit"]);
  assert.equal(
    snapshots.some((snapshot) => snapshot.playerCommandDamage === 5),
    true,
  );
  assert.equal(
    snapshots.some((snapshot) => snapshot.playerMoveId === "tigerKnuckle"),
    true,
  );
});

test("move-list actions submit the selected native move command", () => {
  const player = actor();
  const runtime = new CombatEncounterRuntime({
    input: new Input(),
    playerActor: player,
    enemyActor: actor(0, 1),
    enemyAI: { decide: () => ({ kind: "idle" }) },
  });
  assert.equal(runtime.performPlayerMove("elbowSlam"), false);
  runtime.setActive(true);
  assert.equal(runtime.performPlayerMove("elbowSlam"), true);
  assert.deepEqual(runtime.player.commandQueue, ["up", "hand"]);

  for (let tick = 0; tick < 5; tick += 1) runtime.update(1 / 30);
  assert.deepEqual(player.moves, ["elbowSlam"]);
});

test("move-list combo actions submit the complete native string", () => {
  const runtime = new CombatEncounterRuntime({
    input: new Input(),
    playerActor: actor(),
    enemyActor: actor(0, 1),
    enemyAI: { decide: () => ({ kind: "idle" }) },
  });
  const combo = MARTIAL_ARTS_STRINGS.find(
    (definition) => definition.id === "tigersRage",
  );

  assert.equal(runtime.performPlayerString(combo.id), false);
  runtime.setActive(true);
  assert.equal(runtime.performPlayerString(combo.id), true);
  assert.deepEqual(runtime.player.commandQueue, combo.input);
});

test("move-list positional throws only submit from their native side", () => {
  const player = actor(0, 0, 0);
  const enemy = actor(0, 1, Math.PI);
  const runtime = new CombatEncounterRuntime({
    input: new Input(),
    playerActor: player,
    enemyActor: enemy,
    enemyAI: { decide: () => ({ kind: "idle" }) },
  });
  runtime.setActive(true);
  player.x = 0;
  player.z = 0;
  enemy.x = 0;
  enemy.z = 1;
  enemy.angle = Math.PI;

  assert.equal(runtime.snapshot().playerOpponentPosition, "front");
  assert.equal(runtime.performPlayerMove("darksideHazuki"), false);
  assert.deepEqual(runtime.player.commandQueue, []);

  player.x = 1;
  player.z = 1;
  assert.equal(runtime.performPlayerMove("darksideHazuki"), true);
  assert.equal(runtime.snapshot().playerOpponentPosition, "side");
  assert.deepEqual(runtime.player.commandQueue, ["throw"]);
});

test("crossing an opponent sector refreshes move-list availability", () => {
  const snapshots = [];
  const player = actor(0, 0, 0);
  const enemy = actor(0, 1, Math.PI);
  const runtime = new CombatEncounterRuntime({
    input: new Input(),
    playerActor: player,
    enemyActor: enemy,
    enemyAI: { decide: () => ({ kind: "idle" }) },
    onStateChanged: (snapshot) => snapshots.push(snapshot),
  });
  runtime.setActive(true);
  player.x = 0;
  player.z = 0;
  enemy.x = 0;
  enemy.z = 1;
  enemy.angle = Math.PI;
  runtime.update(0);
  assert.equal(snapshots.at(-1).playerOpponentPosition, "front");

  player.x = 1;
  player.z = 1;
  runtime.update(0);
  assert.equal(snapshots.at(-1).playerOpponentPosition, "side");
});

test("command feedback accumulates accepted keys and names completed strings", () => {
  const input = new Input();
  const player = actor();
  const enemy = actor(0, 1);
  const snapshots = [];
  const runtime = new CombatEncounterRuntime({
    input,
    playerActor: player,
    enemyActor: enemy,
    enemyAI: { decide: () => ({ kind: "idle" }) },
    onStateChanged: (snapshot) => snapshots.push(snapshot),
  });
  runtime.setActive(true);

  input.commands.push("hand");
  runtime.update(1 / 30);
  assert.deepEqual(snapshots.at(-1).playerInputTokens, ["hand"]);
  assert.equal(snapshots.at(-1).playerResolvedMoveLabel, "Tiger Knuckle");
  assert.equal(snapshots.at(-1).playerCommandLocked, false);

  input.commands.push("hand");
  runtime.update(1 / 30);
  assert.deepEqual(snapshots.at(-1).playerInputTokens, ["hand", "hand"]);
  assert.equal(snapshots.at(-1).playerResolvedMoveLabel, null);
  assert.equal(snapshots.at(-1).playerCommandLocked, false);

  input.commands.push("leg");
  runtime.update(1 / 30);
  assert.deepEqual(
    snapshots.at(-1).playerInputTokens,
    ["hand", "hand", "leg"],
  );
  assert.equal(snapshots.at(-1).playerResolvedMoveLabel, "Tiger's Rage");
  assert.equal(snapshots.at(-1).playerCommandLocked, true);

  let remainingTicks = 100;
  while (runtime.player.action && remainingTicks > 0) {
    const snapshot = runtime.snapshot();
    assert.equal(snapshot.playerResolvedMoveLabel, "Tiger's Rage");
    assert.equal(snapshot.playerCommandLocked, true);
    runtime.update(1 / 30);
    remainingTicks -= 1;
  }
  assert.ok(remainingTicks > 0);
  assert.equal(runtime.snapshot().playerResolvedMoveLabel, null);
  assert.equal(runtime.snapshot().playerCommandLocked, false);
});

test("invalid string extensions do not enter the visible command", () => {
  const input = new Input();
  const runtime = new CombatEncounterRuntime({
    input,
    playerActor: actor(),
    enemyActor: actor(0, 1),
    enemyAI: { decide: () => ({ kind: "idle" }) },
  });
  runtime.setActive(true);

  input.commands.push("hand");
  runtime.update(1 / 30);
  input.commands.push("hand");
  runtime.update(1 / 30);
  assert.deepEqual(
    runtime.snapshot().playerInputTokens,
    ["hand", "hand"],
  );

  input.commands.push("throw");
  runtime.update(1 / 30);
  assert.deepEqual(
    runtime.snapshot().playerInputTokens,
    ["hand", "hand"],
  );
});

test("direction-only command changes are published to the HUD", () => {
  const input = new Input();
  const snapshots = [];
  const runtime = new CombatEncounterRuntime({
    input,
    playerActor: actor(),
    enemyActor: actor(0, 1),
    enemyAI: { decide: () => ({ kind: "idle" }) },
    onStateChanged: (snapshot) => snapshots.push(snapshot),
  });
  runtime.setActive(true);
  const initialCount = snapshots.length;

  input.commands.push("up");
  runtime.update(0);

  assert.equal(snapshots.length, initialCount + 1);
  assert.deepEqual(snapshots.at(-1).playerInputTokens, ["up"]);
  assert.equal(snapshots.at(-1).playerResolvedMoveLabel, null);
});

test("a completed hit window reports a miss only when nothing connected", () => {
  const runtime = new CombatEncounterRuntime({
    input: new Input(),
    playerActor: actor(),
    enemyActor: actor(0, 4),
    enemyAI: { decide: () => ({ kind: "idle" }) },
  });
  runtime.setActive(true);
  const move = MARTIAL_ARTS_MOVES.tigerKnuckle;
  runtime.player.action = {
    moveId: move.id,
    tick: move.startup + move.active,
    connected: new Set(),
  };
  assert.equal(runtime.snapshot().playerCommandMissed, true);

  runtime.player.action.connected.add("enemy");
  assert.equal(runtime.snapshot().playerCommandMissed, false);
  assert.equal(runtime.snapshot().playerCommandDamage, null);
});

test("throws face the target, play native acquisition, then start the throw", () => {
  const input = new Input();
  const player = actor(0, 0, 0);
  const enemy = actor();
  const runtime = new CombatEncounterRuntime({
    input,
    playerActor: player,
    enemyActor: enemy,
    enemyAI: { decide: () => ({ kind: "idle" }) },
  });
  runtime.setActive(true);
  enemy.x = 2;
  enemy.z = 0;
  enemy.angle = -Math.PI / 2;
  input.commands.push("throw");
  const started = runtime.update(1 / 30);
  assert.equal(player.angle, Math.PI / 2);
  assert.equal(
    started.find(
      (event) => event.type === "throw-acquisition-started",
    )?.stageId,
    "throwAcquireLong",
  );
  assert.deepEqual(player.followupStages, ["throwAcquireLong"]);
  assert.deepEqual(runtime.snapshot().playerInputTokens, ["throw"]);
  assert.equal(runtime.snapshot().playerResolvedMoveLabel, "Overthrow");
  assert.equal(runtime.snapshot().playerCommandLocked, true);
  assert.equal(runtime.snapshot().playerCommandConnected, false);
  // Mirror the extracted long clip's actor root motion; the browser adapter
  // applies this continuously while the 26-frame acquisition plays.
  player.x += 0.81982421875;
  const events = [];
  for (let tick = 0; tick < 26; tick += 1) {
    events.push(...runtime.update(1 / 30));
  }
  assert.equal(
    events.find((event) => event.type === "move-started")?.moveId,
    "overthrow",
  );
  assert.deepEqual(player.moves, ["overthrow"]);
  assert.deepEqual(runtime.snapshot().playerInputTokens, ["throw"]);
  assert.equal(runtime.snapshot().playerResolvedMoveLabel, "Overthrow");
  assert.equal(runtime.snapshot().playerCommandLocked, true);
  assert.equal(runtime.snapshot().playerCommandConnected, false);
  for (
    let tick = 0;
    tick <= MARTIAL_ARTS_MOVES.overthrow.startup;
    tick += 1
  ) {
    runtime.update(1 / 30);
  }
  assert.equal(runtime.snapshot().playerCommandConnected, true);
});

test("resolved throw names survive acquisition and a failed grab turns red", () => {
  const input = new Input();
  const runtime = new CombatEncounterRuntime({
    input,
    playerActor: actor(),
    enemyActor: actor(0, 8),
    enemyAI: { decide: () => ({ kind: "idle" }) },
  });
  runtime.setActive(true);
  runtime.enemyActor.z = 8;

  input.commands.push("up", "throw");
  runtime.update(1 / 30);
  assert.deepEqual(runtime.snapshot().playerInputTokens, ["up", "throw"]);
  assert.equal(runtime.snapshot().playerResolvedMoveLabel, "Sweep Throw");
  assert.equal(runtime.snapshot().playerCommandConnected, false);
  assert.equal(runtime.snapshot().playerCommandMissed, false);

  const events = [];
  for (let tick = 0; tick < 26; tick += 1) {
    events.push(...runtime.update(1 / 30));
  }
  assert.equal(
    events.some((event) => event.type === "throw-acquisition-failed"),
    true,
  );
  assert.equal(runtime.snapshot().playerResolvedMoveLabel, "Sweep Throw");
  assert.equal(runtime.snapshot().playerCommandConnected, false);
  assert.equal(runtime.snapshot().playerCommandMissed, true);

  for (let tick = 0; tick < 11; tick += 1) runtime.update(1 / 30);
  assert.equal(runtime.snapshot().playerResolvedMoveLabel, null);
  assert.equal(runtime.snapshot().playerCommandMissed, false);
});

test("rapid player attacks replace the base move with authored string clips", () => {
  const input = new Input();
  const player = actor();
  const enemy = actor();
  const runtime = new CombatEncounterRuntime({
    input,
    playerActor: player,
    enemyActor: enemy,
    enemyAI: { decide: () => ({ kind: "idle" }) },
  });
  runtime.setActive(true);
  input.commands.push("leg");
  for (let tick = 0; tick < 3; tick += 1) runtime.update(1 / 30);
  input.commands.push("leg");
  runtime.update(1 / 30);
  input.commands.push("leg");
  runtime.update(1 / 30);
  assert.deepEqual(player.moves, ["crescentKick"]);
  assert.deepEqual(player.stringStages, [
    "comboMawashi2",
    "comboMawashi3",
  ]);
  assert.equal(runtime.snapshot().playerActionLabel, "Third Roundhouse");
});

test("Shadow Step moves Ryo behind Chai without playing a hit reaction", () => {
  const input = new Input();
  const player = actor(0, 0, 0);
  const enemy = actor(0, 0.6, Math.PI);
  const runtime = new CombatEncounterRuntime({
    input,
    playerActor: player,
    enemyActor: enemy,
    enemyAI: { decide: () => ({ kind: "idle" }) },
  });
  runtime.setActive(true);
  player.x = 0;
  player.z = 0;
  player.angle = 0;
  enemy.x = 0;
  enemy.z = 0.6;
  enemy.angle = Math.PI;
  startCombatMove(runtime.enemy, MARTIAL_ARTS_MOVES.tigerKnuckle);
  input.commands.push("up", "guard", "plus", "throw");
  for (let tick = 0; tick < 16; tick += 1) runtime.update(1 / 30);
  assert.deepEqual(player.moves, ["shadowStep"]);
  assert.ok(player.z > enemy.z);
  assert.equal(runtime.enemy.health, runtime.enemy.maxHealth);
  assert.deepEqual(enemy.reactions, []);
  assert.equal(
    enemy.moves.some((moveId) => moveId.endsWith(":victim")),
    false,
  );
});

test("throw victims hold their final pose until combat recovery", () => {
  const input = new Input();
  const player = actor(0, 0, Math.PI / 2);
  const enemy = actor(1, 0, -Math.PI / 2);
  player.rootMotionKinds["move:overthrow"] = "pose";
  enemy.rootMotionKinds["victim:overthrow"] = "travel";
  const runtime = new CombatEncounterRuntime({
    input,
    playerActor: player,
    enemyActor: enemy,
  });
  runtime.processEvent({
    type: "move-started",
    combatantId: "ryo",
    defenderId: "enemy",
    moveId: "overthrow",
    highProficiency: false,
  });
  runtime.processEvent({
    type: "hit",
    attackerId: "ryo",
    defenderId: "enemy",
    moveId: "overthrow",
    highProficiency: false,
    knockdown: true,
    defeated: false,
  });
  assert.deepEqual(enemy.moves, ["overthrow:victim"]);
  assert.equal(enemy.angle, player.angle);
  assert.equal(
    enemy.x,
    1,
    "a pose/travel pair preserves the receiver's root-motion origin",
  );
  assert.equal(enemy.lastVictimOptions.holdLastFrame, true);
  assert.equal(enemy.releases, 0);
  runtime.processEvent({
    type: "recovered",
    combatantId: "enemy",
    reaction: "knockdown",
  });
  assert.equal(enemy.releases, 1);
});

test("paired throws use their native frame-zero attacker/victim gap", () => {
  const player = actor(4, 6, Math.PI / 2);
  const enemy = actor(4, 7, -Math.PI / 2);
  player.choreographySamples["move:overthrow"] = {
    kind: "pose",
    authoredTranslation: [0, 1.0957, 0],
    embeddedTranslation: [0, 1.0957, 0],
  };
  enemy.choreographySamples["victim:overthrow"] = {
    kind: "travel",
    authoredTranslation: [-0.0062, 0, -0.9224],
    embeddedTranslation: [0, 0, 0],
  };
  const runtime = new CombatEncounterRuntime({
    input: new Input(),
    playerActor: player,
    enemyActor: enemy,
    enemyAI: { decide: () => ({ kind: "idle" }) },
  });

  runtime.processEvent({
    type: "move-started",
    combatantId: "ryo",
    defenderId: "enemy",
    moveId: "overthrow",
    highProficiency: false,
  });

  assert.ok(Math.abs(enemy.x - (4 + 0.9224)) < 1e-12);
  assert.ok(Math.abs(enemy.z - (6 + 0.0062)) < 1e-12);
  assert.equal(player.sharedPair, true);
  assert.equal(enemy.sharedPair, true);
});

test("paired throws lock facing mid-clip and hand off the final direction", () => {
  const player = actor(0, 0, Math.PI / 2);
  const enemy = actor(-1, 0, Math.PI / 2);
  const runtime = new CombatEncounterRuntime({
    input: new Input(),
    playerActor: player,
    enemyActor: enemy,
    enemyAI: { decide: () => ({ kind: "idle" }) },
  });
  runtime.setActive(true);
  player.x = 0;
  player.z = 0;
  player.angle = Math.PI / 2;
  enemy.x = -1;
  enemy.z = 0;
  enemy.angle = Math.PI / 2;
  runtime.player.action = {
    moveId: "overthrow",
    tick: 20,
    highProficiency: false,
    connected: new Set(["enemy"]),
    lockedTargetId: "enemy",
  };

  runtime.update(0);
  assert.equal(
    player.angle,
    Math.PI / 2,
    "Ryo does not follow Chai across his shoulder during the paired clip",
  );

  runtime.processEvent({
    type: "move-ended",
    combatantId: "ryo",
    defenderId: "enemy",
    moveId: "overthrow",
    continued: true,
  });
  assert.equal(
    player.angle,
    Math.PI / 2,
    "paired follow-up stages retain the shared authored orientation",
  );

  runtime.processEvent({
    type: "move-ended",
    combatantId: "ryo",
    defenderId: "enemy",
    moveId: "overthrow",
  });
  assert.ok(
    Math.abs(player.angle - -Math.PI / 2) < 1e-10,
    "the stance inherits the direction of the completed throw",
  );
  assert.equal(
    player.lastReleasePairedOptions.atomic,
    true,
    "the authored turn is handed to world yaw without double-blending it",
  );
});

test("Chai's Takkule attack uses its matching Ryo victim clip and shared origin", () => {
  const player = actor(2, 3, 0);
  const enemy = actor(1, 1, Math.PI);
  enemy.rootMotionKinds["move:shoulderBuster"] = "pose";
  player.rootMotionKinds["opponent-victim:shoulderBuster"] = "pose";
  const runtime = new CombatEncounterRuntime({
    input: new Input(),
    playerActor: player,
    enemyActor: enemy,
    enemyAI: { decide: () => ({ kind: "idle" }) },
  });
  runtime.setActive(true);
  runtime.executeEnemyDecision({
    kind: "move",
    moveId: "shoulderBuster",
  });

  assert.deepEqual(enemy.moves, ["shoulderBuster"]);
  assert.deepEqual(player.opponentVictims, ["shoulderBuster"]);
  assert.deepEqual(player.moves, []);
  assert.equal(player.angle, enemy.angle);
  assert.equal(player.x, enemy.x);
  assert.equal(player.z, enemy.z);
  assert.equal(enemy.lastMoveOptions.holdLastFrame, true);
  assert.equal(player.lastOpponentVictimOptions.holdLastFrame, true);
  assert.equal(runtime.player.hitStun, 122);
  assert.equal(combatActionDuration(
    runtime.enemy.action,
    MARTIAL_ARTS_MOVES.shoulderBuster,
  ), 122);
  assert.equal(MARTIAL_ARTS_MOVES.shoulderBuster.enemyDuration, 116);
  assert.equal(
    MARTIAL_ARTS_MOVES.shoulderBuster.enemyVictimAnimation,
    "AKI_AKI_NGR_TAKKULE",
  );

  // At the end of a shared pose-root pair, each local authored offset is
  // baked into world space only as that participant leaves its held clip.
  const sharedOrigin = { x: enemy.x, z: enemy.z };
  const sharedYaw = enemy.angle;
  const playerReleasesBeforePairEnd = player.releases;
  enemy.poseRootTranslation = [0.05, 0, 0.22];
  player.poseRootTranslation = [-0.269, 0, -1.759];
  runtime.processEvent({
    type: "move-ended",
    combatantId: "enemy",
    defenderId: "ryo",
    moveId: "shoulderBuster",
  });
  assert.ok(Math.abs(enemy.x - (
    sharedOrigin.x
    + 0.05 * Math.cos(sharedYaw)
    + -0.22 * Math.sin(sharedYaw)
  )) < 1e-10);
  assert.ok(Math.abs(enemy.z - (
    sharedOrigin.z
    - 0.05 * Math.sin(sharedYaw)
    + -0.22 * Math.cos(sharedYaw)
  )) < 1e-10);
  assert.equal(enemy.angle, sharedYaw);
  assert.equal(player.x, sharedOrigin.x);
  assert.equal(player.z, sharedOrigin.z);
  assert.equal(player.releases, playerReleasesBeforePairEnd);

  runtime.processEvent({
    type: "recovered",
    combatantId: "ryo",
    reaction: "knockdown",
  });
  assert.ok(Math.abs(player.x - (
    sharedOrigin.x
    + -0.269 * Math.cos(sharedYaw)
    + 1.759 * Math.sin(sharedYaw)
  )) < 1e-10);
  assert.ok(Math.abs(player.z - (
    sharedOrigin.z
    - -0.269 * Math.sin(sharedYaw)
    + 1.759 * Math.cos(sharedYaw)
  )) < 1e-10);
  assert.equal(player.releases, playerReleasesBeforePairEnd + 1);
});

test("Arm Break Fire follow-ups replace both synchronized actor clips", () => {
  const player = actor();
  const enemy = actor();
  const runtime = new CombatEncounterRuntime({
    input: new Input(),
    playerActor: player,
    enemyActor: enemy,
  });
  runtime.processEvent({
    type: "followup-stage-started",
    combatantId: "ryo",
    defenderId: "enemy",
    parentMoveId: "armBreakFire",
    followupId: "armBreakChestStrike",
  });
  runtime.processEvent({
    type: "followup-stage-started",
    combatantId: "ryo",
    defenderId: "enemy",
    parentMoveId: "armBreakChestStrike",
    followupId: "armBreakFireFinish",
  });
  assert.deepEqual(player.followupStages, [
    "armBreakChestStrike",
    "armBreakFireFinish",
  ]);
  assert.deepEqual(enemy.followupVictims, [
    "armBreakChestStrike",
    "armBreakFireFinish",
  ]);
  assert.equal(enemy.lastFollowupVictimOptions.holdLastFrame, true);

  runtime.processEvent({
    type: "hit",
    attackerId: "ryo",
    defenderId: "enemy",
    moveId: "armBreakFireFinish",
    knockdown: true,
    defeated: false,
  });
  assert.deepEqual(enemy.reactions, []);
  assert.deepEqual(enemy.followupVictims, [
    "armBreakChestStrike",
    "armBreakFireFinish",
  ]);
});

test("Tornado Kick follow-up changes Ryo without replacing Chai's pose", () => {
  const player = actor();
  const enemy = actor();
  const runtime = new CombatEncounterRuntime({
    input: new Input(),
    playerActor: player,
    enemyActor: enemy,
  });
  runtime.processEvent({
    type: "followup-stage-started",
    combatantId: "ryo",
    defenderId: "enemy",
    parentMoveId: "tornadoKick",
    followupId: "tornadoKickFinish",
  });
  assert.deepEqual(player.followupStages, ["tornadoKickFinish"]);
  assert.deepEqual(enemy.followupVictims, []);
});

test("Swallow Flip replaces both actors through intercept, flip, and punch", () => {
  const player = actor();
  const enemy = actor();
  const runtime = new CombatEncounterRuntime({
    input: new Input(),
    playerActor: player,
    enemyActor: enemy,
  });
  runtime.processEvent({
    type: "move-started",
    combatantId: "ryo",
    defenderId: "enemy",
    moveId: "swallowFlip",
    highProficiency: false,
  });
  runtime.processEvent({
    type: "hit",
    attackerId: "ryo",
    defenderId: "enemy",
    moveId: "swallowFlip",
    knockdown: false,
    defeated: false,
  });
  for (const [parentMoveId, followupId] of [
    ["swallowFlip", "swallowFlipThrow"],
    ["swallowFlipThrow", "swallowFlipPunch"],
  ]) {
    runtime.processEvent({
      type: "followup-stage-started",
      combatantId: "ryo",
      defenderId: "enemy",
      parentMoveId,
      followupId,
    });
  }
  assert.deepEqual(player.moves, ["swallowFlip"]);
  assert.deepEqual(enemy.moves, ["swallowFlip:victim"]);
  assert.deepEqual(player.followupStages, [
    "swallowFlipThrow",
    "swallowFlipPunch",
  ]);
  assert.deepEqual(enemy.followupVictims, [
    "swallowFlipThrow",
    "swallowFlipPunch",
  ]);
});

test("holding guard faces the target and blocks enemy strikes", () => {
  const input = new Input();
  const player = actor();
  const enemy = actor(1, 0, 0);
  const runtime = new CombatEncounterRuntime({
    input,
    playerActor: player,
    enemyActor: enemy,
    enemyAI: { decide: () => ({ kind: "idle" }) },
  });
  runtime.setActive(true);
  player.angle = 0;
  enemy.x = 1;
  enemy.z = 0;
  input.guarding = true;
  runtime.update(1 / 30);
  assert.ok(Math.abs(player.angle - Math.PI / 2) < 1e-8);
  assert.equal(runtime.player.guardHeld, true);
});

test("pressing and releasing guard immediately updates encounter UI", () => {
  const input = new Input();
  const snapshots = [];
  const runtime = new CombatEncounterRuntime({
    input,
    playerActor: actor(),
    enemyActor: actor(),
    enemyAI: { decide: () => ({ kind: "idle" }) },
    onStateChanged: (snapshot) => snapshots.push(snapshot),
  });
  runtime.setActive(true);
  snapshots.length = 0;

  input.guarding = true;
  runtime.update(1 / 30);
  assert.equal(snapshots.at(-1).playerGuarding, true);

  input.guarding = false;
  runtime.update(1 / 30);
  assert.equal(snapshots.at(-1).playerGuarding, false);
});

test("activation clears commands queued while combat was inactive", () => {
  const input = new Input();
  const player = actor();
  const enemy = actor();
  const runtime = new CombatEncounterRuntime({
    input,
    playerActor: player,
    enemyActor: enemy,
    enemyAI: { decide: () => ({ kind: "idle" }) },
  });
  input.commands.push("hand");
  for (let tick = 0; tick < 3; tick += 1) runtime.update(1 / 30);
  runtime.setActive(true);
  runtime.update(1 / 30);
  assert.deepEqual(player.moves, []);
});

test("an attack restarts a defeated bout and releases held poses", () => {
  const input = new Input();
  const player = actor();
  const enemy = actor();
  const runtime = new CombatEncounterRuntime({
    input,
    playerActor: player,
    enemyActor: enemy,
    enemyAI: { decide: () => ({ kind: "idle" }) },
  });
  runtime.setActive(true);
  const releasesAfterActivation = {
    player: player.releases,
    enemy: enemy.releases,
  };
  runtime.player.health = 0;
  runtime.player.defeated = true;

  input.commands.push("hand");
  for (let tick = 0; tick < 3; tick += 1) runtime.update(1 / 30);

  assert.equal(runtime.player.health, runtime.player.maxHealth);
  assert.equal(runtime.enemy.health, runtime.enemy.maxHealth);
  assert.equal(runtime.player.defeated, false);
  assert.equal(player.releases, releasesAfterActivation.player + 1);
  assert.equal(enemy.releases, releasesAfterActivation.enemy + 1);
  assert.deepEqual(player.moves, ["tigerKnuckle"]);
});

test("Chai waits for player input before beginning the first exchange", () => {
  const input = new Input();
  let decisions = 0;
  const runtime = new CombatEncounterRuntime({
    input,
    playerActor: actor(),
    enemyActor: actor(),
    enemyAI: {
      cooldown: 0,
      decide: () => {
        decisions += 1;
        return { kind: "move", moveId: "tigerKnuckle" };
      },
    },
  });
  runtime.setActive(true);

  for (let tick = 0; tick < 90; tick += 1) runtime.update(1 / 30);
  assert.equal(decisions, 0);
  assert.equal(runtime.player.health, runtime.player.maxHealth);

  input.commands.push("hand");
  for (let tick = 0; tick < 3; tick += 1) runtime.update(1 / 30);
  assert.ok(decisions > 0);
  assert.deepEqual(runtime.playerActor.moves, ["tigerKnuckle"]);
});

test("an active action or reaction locks player locomotion", () => {
  const input = new Input();
  const runtime = new CombatEncounterRuntime({
    input,
    playerActor: actor(),
    enemyActor: actor(),
    enemyAI: { decide: () => ({ kind: "idle" }) },
  });
  runtime.setActive(true);
  assert.equal(runtime.playerMovementLocked, false);
  runtime.player.action = { moveId: "tigerKnuckle", tick: 0, connected: new Set() };
  assert.equal(runtime.playerMovementLocked, true);
  runtime.player.action = null;
  runtime.player.reaction = { kind: "hit", tick: 0 };
  assert.equal(runtime.playerMovementLocked, true);
});

test("combat controls keep Ryo facing Chai and prevent fighter overlap", () => {
  const player = actor(0, 0, 1);
  const enemy = actor(0.1, 0, 0);
  const runtime = new CombatEncounterRuntime({
    input: new Input(),
    playerActor: player,
    enemyActor: enemy,
    enemyAI: { decide: () => ({ kind: "idle" }) },
  });
  runtime.setActive(true);
  player.x = 0;
  player.z = 0;
  enemy.x = 0.1;
  enemy.z = 0;

  runtime.update(1 / 30);

  assert.ok(Math.abs(player.angle - Math.PI / 2) < 1e-12);
  assert.ok(
    Math.hypot(player.x - enemy.x, player.z - enemy.z)
      >= runtime.player.radius + runtime.enemy.radius - 1e-12,
  );
  assert.ok(Math.abs(runtime.playerTargetYaw() - Math.PI / 2) < 1e-12);
});

test("player commands are discarded until a knockdown recovery completes", () => {
  const input = new Input();
  const runtime = new CombatEncounterRuntime({
    input,
    playerActor: actor(),
    enemyActor: actor(),
    enemyAI: { decide: () => ({ kind: "idle" }) },
  });
  runtime.setActive(true);
  runtime.player.reaction = {
    kind: "knockdown",
    moveId: "shoulderBuster",
    attackerId: "enemy",
    tick: 0,
  };
  runtime.player.knockdown = 2;

  input.commands.push("hand");
  runtime.update(0);
  assert.deepEqual(runtime.player.commandQueue, []);
  assert.deepEqual(runtime.snapshot().playerInputTokens, []);

  input.commands.push("leg");
  runtime.update(2 / 30);
  assert.equal(runtime.player.reaction, null);
  assert.deepEqual(
    runtime.player.commandQueue,
    [],
    "the key pressed before Ryo got up is not queued on the recovery frame",
  );
  assert.deepEqual(runtime.playerActor.moves, []);

  input.commands.push("hand");
  runtime.update(1 / 30);
  assert.deepEqual(runtime.playerActor.moves, ["tigerKnuckle"]);
});

test("a resumed frame cannot replay loading time as enemy attacks", () => {
  const input = new Input();
  const runtime = new CombatEncounterRuntime({
    input,
    playerActor: actor(),
    enemyActor: actor(),
  });
  runtime.setActive(true);
  runtime.update(10);
  assert.equal(runtime.combat.tick, 3);
  assert.equal(runtime.player.health, runtime.player.maxHealth);
});
