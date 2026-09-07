import assert from "node:assert/strict";
import test from "node:test";
import {
  COMMAND_COMMIT_TICKS,
  COMMAND_BUFFER_TICKS,
  MARTIAL_ARTS_FOLLOWUP_STAGES,
  MARTIAL_ARTS_MOVES,
  MARTIAL_ARTS_STRINGS,
  MARTIAL_ARTS_STRING_STAGES,
  MartialArtsCombat,
  MartialArtsEnemyAI,
  THROW_ACQUISITION_NEAR_DISTANCE,
  actionPhase,
  combatActionDuration,
  createCombatant,
  formatCombatCommand,
  opponentPosition,
  queueCombatCommand,
  setCombatCommandOverride,
  startCombatMove,
  synchronizeCombatVictim,
} from "../src/MartialArtsCombat.js";

function duel(distance = 1) {
  const combat = new MartialArtsCombat();
  const ryo = combat.add(createCombatant({
    id: "ryo",
    team: "player",
    z: 0,
    yaw: 0,
  }));
  const enemy = combat.add(createCombatant({
    id: "enemy",
    team: "enemy",
    z: distance,
    yaw: Math.PI,
  }));
  return { combat, ryo, enemy };
}

test("move phases use authored duration without off-by-one recovery", () => {
  const move = MARTIAL_ARTS_MOVES.tigerKnuckle;
  assert.equal(actionPhase({ tick: 0 }, move), "startup");
  assert.equal(actionPhase({ tick: move.startup - 1 }, move), "startup");
  assert.equal(actionPhase({ tick: move.startup }, move), "active");
  assert.equal(
    actionPhase({ tick: move.startup + move.active }, move),
    "recovery",
  );
  assert.equal(actionPhase({ tick: move.duration - 1 }, move), "recovery");
  assert.equal(actionPhase({ tick: move.duration }, move), "complete");
});

test("enemy variants and terminal pairs retain their authored playback lifetime", () => {
  const { ryo, enemy } = duel(0.6);
  const tackle = MARTIAL_ARTS_MOVES.shoulderBuster;
  assert.equal(startCombatMove(enemy, tackle, {
    lockedTargetId: ryo.id,
    defender: ryo,
  }), true);
  assert.equal(tackle.enemyDuration, 116);
  assert.equal(tackle.enemyVictimDuration, 122);
  assert.equal(combatActionDuration(enemy.action, tackle), 122);
  assert.equal(actionPhase({ ...enemy.action, tick: 121 }, tackle), "recovery");
  assert.equal(actionPhase({ ...enemy.action, tick: 122 }, tackle), "complete");

  const staged = {
    ...enemy.action,
    tick: 115,
    nextFollowupId: "next-stage",
  };
  assert.equal(
    combatActionDuration(staged, tackle),
    tackle.enemyDuration,
    "a queued paired continuation replaces both clips at the actor boundary",
  );
  assert.equal(actionPhase(staged, tackle), "recovery");
  assert.equal(actionPhase({ ...staged, tick: 116 }, tackle), "complete");
});

test("the command buffer chooses a directional move over its simple suffix", () => {
  const fighter = createCombatant({ id: "ryo" });
  queueCombatCommand(fighter, "up");
  queueCombatCommand(fighter, "hand");
  const combat = new MartialArtsCombat();
  combat.add(fighter);
  const events = [
    ...combat.step(),
    ...combat.step(),
    ...combat.step(),
  ];
  assert.equal(fighter.action.moveId, "elbowSlam");
  assert.deepEqual(events[0], {
    type: "move-started",
    combatantId: "ryo",
    moveId: "elbowSlam",
    highProficiency: false,
  });
});

test("native proficiency threshold selects expert animation timing", () => {
  const move = MARTIAL_ARTS_MOVES.bigWheel;
  const novice = createCombatant({ id: "novice", proficiency: 55 });
  const expert = createCombatant({ id: "expert", proficiency: 56 });
  assert.equal(startCombatMove(novice, move), true);
  assert.equal(startCombatMove(expert, move), true);
  assert.equal(novice.action.highProficiency, false);
  assert.equal(expert.action.highProficiency, true);
  assert.equal(
    actionPhase({ tick: 31, highProficiency: true }, move),
    "complete",
  );
  assert.equal(
    actionPhase({ tick: 31, highProficiency: false }, move),
    "recovery",
  );
});

test("each advertised attack button starts its native base action", () => {
  for (const [command, expectedMove] of [
    ["hand", "tigerKnuckle"],
    ["leg", "crescentKick"],
    ["throw", "overthrow"],
  ]) {
    const fighter = createCombatant({ id: `ryo-${command}` });
    queueCombatCommand(fighter, command);
    const combat = new MartialArtsCombat();
    combat.add(fighter);
    combat.step();
    if (command === "throw") {
      assert.equal(fighter.action.moveId, "throwAcquireLong");
      assert.equal(fighter.action.pendingThrowMoveId, expectedMove);
    } else {
      assert.equal(fighter.action.moveId, expectedMove);
    }
  }
});

test("a bare strike starts immediately and accepts its native string cancel", () => {
  const fighter = createCombatant({ id: "ryo" });
  const combat = new MartialArtsCombat();
  combat.add(fighter);
  queueCombatCommand(fighter, "hand");
  assert.equal(
    combat.step().find((event) => event.type === "move-started")?.moveId,
    "tigerKnuckle",
  );
  queueCombatCommand(fighter, "hand");
  assert.equal(
    combat.step().find((event) => event.type === "string-stage-started")
      ?.stageId,
    "comboJabBody",
  );
});

test("native simultaneous, repeated, running, and guard commands resolve", () => {
  for (const [commands, expectedMove] of [
    [["hand", "plus", "leg"], "bigWheel"],
    [["up", "up", "leg", "leg"], "tornadoKick"],
    [["run", "hand"], "mistralFlash"],
    [["run", "guard", "plus", "leg"], "shadowReaper"],
    [["up", "guard", "plus", "throw", "hand"], "shadowBlade"],
  ]) {
    const fighter = createCombatant({
      id: expectedMove,
      team: "player",
      z: 0,
      yaw: 0,
    });
    for (const command of commands) queueCombatCommand(fighter, command);
    const combat = new MartialArtsCombat();
    combat.add(fighter);
    if (MARTIAL_ARTS_MOVES[expectedMove].counterCondition) {
      const enemy = combat.add(createCombatant({
        id: `${expectedMove}-enemy`,
        team: "enemy",
        z: 1,
        yaw: Math.PI,
      }));
      startCombatMove(enemy, MARTIAL_ARTS_MOVES.tigerKnuckle);
    }
    for (let tick = 0; tick < 3; tick += 1) combat.step();
    assert.equal(fighter.action?.moveId, expectedMove);
  }
});

test("move scroll formats native browser commands and positional throws", () => {
  assert.equal(
    formatCombatCommand(MARTIAL_ARTS_MOVES.shadowBlade.displayInput),
    "W I + L J",
  );
  assert.equal(
    formatCombatCommand(MARTIAL_ARTS_MOVES.windmill.displayInput),
    "Shift J + K",
  );
  assert.equal(
    formatCombatCommand(MARTIAL_ARTS_MOVES.backTwistDrop.displayInput),
    "Behind opponent L",
  );
  assert.equal(
    formatCombatCommand(MARTIAL_ARTS_MOVES.tornadoKick.displayInput),
    "W W K",
  );
});

test("bare throw selects front, side, and rear native variants", () => {
  const defender = createCombatant({
    id: "defender",
    team: "enemy",
    yaw: 0,
  });
  for (const [position, expectedMove] of [
    [{ x: 0, z: 1, yaw: Math.PI }, "overthrow"],
    [{ x: 1, z: 0, yaw: -Math.PI / 2 }, "darksideHazuki"],
    [{ x: 0, z: -1, yaw: 0 }, "backTwistDrop"],
  ]) {
    const attacker = createCombatant({
      id: expectedMove,
      team: "player",
      ...position,
    });
    assert.equal(
      opponentPosition(attacker, defender),
      expectedMove === "overthrow"
        ? "front"
        : expectedMove === "darksideHazuki"
          ? "side"
          : "back",
    );
    queueCombatCommand(attacker, "throw");
    const combat = new MartialArtsCombat();
    combat.add(attacker);
    combat.add(defender);
    const acquisition = combat.step().find(
      (event) => event.type === "throw-acquisition-started",
    );
    assert.equal(acquisition?.moveId, expectedMove);
    assert.equal(acquisition?.stageId, "throwAcquireNear");
    for (let tick = 0; tick < 26; tick += 1) combat.step();
    assert.equal(attacker.action?.moveId, expectedMove);
  }
});

test("long throw acquisition advances into the selected throw only in range", () => {
  {
    const { combat, ryo } = duel(2);
    queueCombatCommand(ryo, "throw");
    const acquisition = combat.step().find(
      (event) => event.type === "throw-acquisition-started",
    );
    assert.equal(acquisition?.stageId, "throwAcquireLong");
    assert.equal(ryo.action.pendingThrowMoveId, "overthrow");
    // The extracted long grab contributes 0.81982421875 units of authored
    // forward root motion before its continuation is evaluated.
    ryo.z += 0.81982421875;
    const events = Array.from({ length: 26 }, () => combat.step()).flat();
    assert.equal(
      events.find((event) => event.type === "move-started")?.moveId,
      "overthrow",
    );
    assert.equal(ryo.action?.moveId, "overthrow");
  }
  {
    const { combat, ryo } = duel(4);
    queueCombatCommand(ryo, "throw");
    combat.step();
    const events = Array.from({ length: 26 }, () => combat.step()).flat();
    assert.equal(ryo.action, null);
    assert.equal(
      events.find(
        (event) => event.type === "throw-acquisition-failed",
      )?.moveId,
      "overthrow",
    );
  }
});

test("native 1.4-unit discriminator selects short and long grabs", () => {
  for (const [distance, expectedStage] of [
    [THROW_ACQUISITION_NEAR_DISTANCE - 0.001, "throwAcquireNear"],
    [THROW_ACQUISITION_NEAR_DISTANCE, "throwAcquireLong"],
    [THROW_ACQUISITION_NEAR_DISTANCE + 0.001, "throwAcquireLong"],
  ]) {
    const { combat, ryo } = duel(distance);
    queueCombatCommand(ryo, "throw");
    const acquisition = combat.step().find(
      (event) => event.type === "throw-acquisition-started",
    );
    assert.equal(acquisition?.stageId, expectedStage);
  }
});

test("paired victim is locked from animation start rather than hit frame", () => {
  const attacker = createCombatant({ id: "ryo", team: "player" });
  const defender = createCombatant({ id: "enemy", team: "enemy" });
  defender.action = {
    moveId: "tigerKnuckle",
    tick: 3,
    connected: new Set(),
  };
  defender.commandQueue.push("hand");
  const move = MARTIAL_ARTS_MOVES.overthrow;
  assert.equal(startCombatMove(attacker, move, {
    lockedTargetId: defender.id,
    defender,
  }), true);
  assert.equal(defender.action, null);
  assert.equal(defender.commandQueue.length, 0);
  assert.equal(defender.hitStun, move.victimDuration);
  assert.deepEqual(defender.reaction, {
    kind: "paired",
    moveId: "overthrow",
    attackerId: "ryo",
    tick: 0,
  });
  assert.equal(synchronizeCombatVictim(attacker, null, move), false);
});

test("an acquired paired throw cannot become a phantom range miss", () => {
  const combat = new MartialArtsCombat();
  const attacker = combat.add(createCombatant({
    id: "ryo",
    team: "player",
    z: 0,
  }));
  const defender = combat.add(createCombatant({
    id: "enemy",
    team: "enemy",
    z: 1,
  }));
  const move = MARTIAL_ARTS_MOVES.overthrow;
  assert.equal(startCombatMove(attacker, move, {
    lockedTargetId: defender.id,
    defender,
  }), true);
  // Paired actor/victim clips can expose different actor-root trajectories.
  // The simulation target was already acquired before these clips began.
  defender.z = 100;
  const events = Array.from(
    { length: move.startup + 1 },
    () => combat.step(),
  ).flat();
  assert.equal(
    events.some((event) => (
      event.type === "hit"
      && event.moveId === "overthrow"
      && event.defenderId === "enemy"
    )),
    true,
  );
});

test("move-scroll preferences resolve native duplicate commands", () => {
  for (const [moveId, commands] of [
    ["pitBlow", ["up", "hand"]],
    ["doubleBlow", ["up", "hand", "plus", "leg"]],
    ["swallowDive", ["down", "leg"]],
    ["nothingSkill", ["down", "up", "leg"]],
  ]) {
    const fighter = createCombatant({ id: moveId });
    assert.equal(setCombatCommandOverride(fighter, moveId), true);
    for (const command of commands) queueCombatCommand(fighter, command);
    const combat = new MartialArtsCombat();
    combat.add(fighter);
    for (let tick = 0; tick < COMMAND_COMMIT_TICKS; tick += 1) combat.step();
    assert.equal(fighter.action?.moveId, moveId);
  }
});

test("a strike damages once during its active window", () => {
  const { combat, ryo, enemy } = duel();
  startCombatMove(ryo, MARTIAL_ARTS_MOVES.tigerKnuckle);
  const events = Array.from(
    { length: MARTIAL_ARTS_MOVES.tigerKnuckle.duration },
    () => combat.step(),
  ).flat();
  assert.equal(enemy.health, 15);
  assert.equal(events.filter((event) => event.type === "hit").length, 1);
  assert.equal(events.filter((event) => event.type === "move-ended").length, 1);
});

test("trace-backed base attacks use their native inclusive hit frames", () => {
  assert.deepEqual(
    MARTIAL_ARTS_MOVES.tigerKnuckle.nativeHitFrames,
    [4, 5],
  );
  assert.deepEqual(
    MARTIAL_ARTS_MOVES.tigerKnuckle.nativeAuthoredPhaseFrames,
    [4, 5, 13],
  );
  assert.equal(MARTIAL_ARTS_MOVES.tigerKnuckle.startup, 4);
  assert.equal(MARTIAL_ARTS_MOVES.tigerKnuckle.active, 2);
  assert.equal(MARTIAL_ARTS_MOVES.tigerKnuckle.damage, 5);
  assert.deepEqual(
    MARTIAL_ARTS_MOVES.crescentKick.nativeHitFrames,
    [7, 9],
  );
  assert.deepEqual(
    MARTIAL_ARTS_MOVES.crescentKick.nativeAuthoredPhaseFrames,
    [6, 8, 22],
  );
  assert.deepEqual(
    MARTIAL_ARTS_MOVES.crescentKick.nativePhaseFrames,
    [7, 9, 24],
  );
  assert.equal(MARTIAL_ARTS_MOVES.crescentKick.startup, 7);
  assert.equal(MARTIAL_ARTS_MOVES.crescentKick.active, 3);
});

test("late recovery input buffers into the next move without stale attacks", () => {
  {
    const fighter = createCombatant({ id: "ryo" });
    const combat = new MartialArtsCombat();
    combat.add(fighter);
    startCombatMove(fighter, MARTIAL_ARTS_MOVES.tigerKnuckle);
    for (
      let tick = 0;
      tick < MARTIAL_ARTS_MOVES.tigerKnuckle.duration - 5;
      tick += 1
    ) {
      combat.step();
    }
    queueCombatCommand(fighter, "leg");
    for (let tick = 0; tick < 8; tick += 1) combat.step();
    assert.equal(fighter.action?.moveId, "crescentKick");
  }
  {
    const fighter = createCombatant({ id: "ryo" });
    const combat = new MartialArtsCombat();
    combat.add(fighter);
    startCombatMove(fighter, MARTIAL_ARTS_MOVES.elbowAssault);
    queueCombatCommand(fighter, "leg");
    for (
      let tick = 0;
      tick < MARTIAL_ARTS_MOVES.elbowAssault.duration + 2;
      tick += 1
    ) {
      combat.step();
    }
    assert.notEqual(fighter.action?.moveId, "crescentKick");
    assert.deepEqual(fighter.commandQueue, []);
  }
});

test("a buffered move starts on the outgoing move's end tick", () => {
  const fighter = createCombatant({ id: "ryo" });
  const combat = new MartialArtsCombat();
  combat.add(fighter);
  const first = MARTIAL_ARTS_MOVES.tigerKnuckle;
  startCombatMove(fighter, first);
  for (let tick = 0; tick < first.duration - 2; tick += 1) combat.step();
  queueCombatCommand(fighter, "leg");
  const events = [
    ...combat.step(),
    ...combat.step(),
  ];
  assert.deepEqual(
    events.map((event) => [event.type, event.moveId]),
    [
      ["move-ended", "tigerKnuckle"],
      ["move-started", "crescentKick"],
    ],
  );
  assert.equal(fighter.action?.moveId, "crescentKick");
});

test("all ten native strings cancel directly through their authored stages", () => {
  for (const definition of MARTIAL_ARTS_STRINGS) {
    const fighter = createCombatant({ id: definition.id });
    const combat = new MartialArtsCombat();
    combat.add(fighter);
    queueCombatCommand(fighter, definition.input[0]);
    const events = [];
    for (let tick = 0; tick < COMMAND_COMMIT_TICKS; tick += 1) {
      events.push(...combat.step());
    }
    for (const command of definition.input.slice(1)) {
      queueCombatCommand(fighter, command);
      events.push(...combat.step());
    }
    const expectedStages = definition.stageIds.filter(Boolean);
    assert.deepEqual(
      events
        .filter((event) => event.type === "string-stage-started")
        .map((event) => event.stageId),
      expectedStages,
      definition.label,
    );
    assert.equal(fighter.activeStringId, definition.id, definition.label);
    assert.equal(
      fighter.action?.moveId,
      expectedStages.at(-1),
      definition.label,
    );
  }
});

test("a rapid input batch preserves every attack in a native string", () => {
  for (const definition of MARTIAL_ARTS_STRINGS) {
    const fighter = createCombatant({ id: `batch-${definition.id}` });
    const combat = new MartialArtsCombat();
    combat.add(fighter);
    for (const command of definition.input) {
      queueCombatCommand(fighter, command);
    }
    const events = [];
    for (let tick = 0; tick <= definition.input.length; tick += 1) {
      events.push(...combat.step());
    }
    assert.deepEqual(
      events
        .filter((event) => event.type === "string-stage-started")
        .map((event) => event.stageId),
      definition.stageIds.filter(Boolean),
      definition.label,
    );
  }
});

test("string-stage timing and damage use the extracted transition clip", () => {
  const { combat, ryo, enemy } = duel();
  queueCombatCommand(ryo, "leg");
  for (let tick = 0; tick < COMMAND_COMMIT_TICKS; tick += 1) combat.step();
  queueCombatCommand(ryo, "leg");
  const transition = combat.step().find(
    (event) => event.type === "string-stage-started",
  );
  assert.equal(transition.stageId, "comboMawashi2");
  assert.equal(
    transition.animation,
    MARTIAL_ARTS_STRING_STAGES.comboMawashi2.animation,
  );
  const stage = MARTIAL_ARTS_STRING_STAGES.comboMawashi2;
  for (let tick = 1; tick <= stage.startup; tick += 1) combat.step();
  assert.equal(enemy.health, enemy.maxHealth - stage.damage);
});

test("Arm Break Fire accepts both native synchronized follow-up stages", () => {
  const { combat, ryo, enemy } = duel(0.6);
  const move = MARTIAL_ARTS_MOVES.armBreakFire;
  startCombatMove(ryo, move);
  queueCombatCommand(ryo, "hand");
  const events = [];
  for (let tick = 0; tick < move.duration; tick += 1) {
    events.push(...combat.step());
  }
  assert.equal(ryo.action?.moveId, "armBreakChestStrike");
  assert.equal(ryo.action?.lockedTargetId, enemy.id);

  queueCombatCommand(ryo, "hand");
  queueCombatCommand(ryo, "plus");
  queueCombatCommand(ryo, "leg");
  const second = MARTIAL_ARTS_FOLLOWUP_STAGES.armBreakChestStrike;
  for (let tick = 0; tick < second.duration; tick += 1) {
    events.push(...combat.step());
  }
  assert.equal(ryo.action?.moveId, "armBreakFireFinish");
  assert.equal(ryo.action?.lockedTargetId, enemy.id);
  assert.deepEqual(
    events
      .filter((event) => event.type === "followup-stage-started")
      .map((event) => [
        event.parentMoveId,
        event.followupId,
        event.defenderId,
      ]),
    [
      ["armBreakFire", "armBreakChestStrike", enemy.id],
      ["armBreakChestStrike", "armBreakFireFinish", enemy.id],
    ],
  );
});

test("Swallow Flip only intercepts an incoming strike and reaches its finisher", () => {
  {
    const { combat, ryo } = duel();
    for (const command of ["down", "hand", "leg"]) {
      queueCombatCommand(ryo, command);
    }
    for (let tick = 0; tick < COMMAND_COMMIT_TICKS + 1; tick += 1) {
      combat.step();
    }
    assert.notEqual(ryo.action?.moveId, "swallowFlip");
  }

  const { combat, ryo, enemy } = duel();
  startCombatMove(enemy, MARTIAL_ARTS_MOVES.tigerKnuckle);
  for (const command of ["down", "hand", "leg"]) {
    queueCombatCommand(ryo, command);
  }

  const events = [...combat.step()];
  queueCombatCommand(ryo, "hand");
  for (let tick = 0; tick < 120; tick += 1) {
    events.push(...combat.step());
    if (events.some((event) => (
      event.type === "followup-stage-started"
      && event.followupId === "swallowFlipPunch"
    ))) {
      break;
    }
  }

  assert.ok(events.some((event) => (
    event.type === "move-started"
    && event.moveId === "swallowFlip"
  )));
  assert.ok(events.some((event) => (
    event.type === "hit"
    && event.moveId === "swallowFlip"
    && event.damage === 0
  )));
  assert.ok(events.some((event) => (
    event.type === "followup-stage-started"
    && event.followupId === "swallowFlipThrow"
  )));
  assert.ok(events.some((event) => (
    event.type === "followup-stage-started"
    && event.followupId === "swallowFlipPunch"
  )));
  assert.equal(
    events.some((event) => (
      event.type === "hit"
      && event.attackerId === "enemy"
      && event.defenderId === "ryo"
    )),
    false,
    "the intercepted strike cannot hit through the counter",
  );
  assert.equal(ryo.action?.moveId, "swallowFlipPunch");
});

test("Swallow Flip can be buffered shortly before the incoming strike", () => {
  const { combat, ryo, enemy } = duel();
  for (const command of ["down", "hand", "leg"]) {
    queueCombatCommand(ryo, command);
  }
  for (let tick = 0; tick < 5; tick += 1) combat.step();
  assert.equal(ryo.action, null);
  assert.deepEqual(ryo.commandQueue, ["down", "hand", "leg"]);

  startCombatMove(enemy, MARTIAL_ARTS_MOVES.tigerKnuckle);
  const events = combat.step();
  assert.equal(ryo.action?.moveId, "swallowFlip");
  assert.ok(events.some((event) => (
    event.type === "move-started"
    && event.moveId === "swallowFlip"
  )));
});

test("Cross Charge is a paired strike counter rather than a proactive throw", () => {
  const commands = ["up", "up", "guard", "plus", "throw"];
  {
    const { combat, ryo } = duel();
    for (const command of commands) queueCombatCommand(ryo, command);
    for (let tick = 0; tick < COMMAND_BUFFER_TICKS; tick += 1) combat.step();
    assert.equal(ryo.action, null);
  }

  const { combat, ryo, enemy } = duel();
  startCombatMove(enemy, MARTIAL_ARTS_MOVES.crescentKick);
  for (const command of commands) queueCombatCommand(ryo, command);
  const events = [
    ...combat.step(),
    ...combat.step(),
  ];
  assert.ok(events.some((event) => (
    event.type === "move-started"
    && event.moveId === "crossCharge"
  )));
  assert.ok(events.some((event) => (
    event.type === "hit"
    && event.moveId === "crossCharge"
    && event.defenderId === "enemy"
  )));
  assert.equal(
    events.some((event) => (
      event.type === "hit"
      && event.defenderId === "ryo"
    )),
    false,
  );
  assert.equal(MARTIAL_ARTS_MOVES.crossCharge.kind, "counter");
  assert.equal(MARTIAL_ARTS_MOVES.crossCharge.knockdown, false);
});

test("Tornado Kick starts on the first K and cancels into its exact finisher", () => {
  for (const batched of [false, true]) {
    const { combat, ryo } = duel();
    setCombatCommandOverride(ryo, "tornadoKick");
    for (const command of ["up", "up", "leg"]) {
      queueCombatCommand(ryo, command);
    }
    if (batched) queueCombatCommand(ryo, "leg");
    const events = [];
    for (let tick = 0; tick < COMMAND_COMMIT_TICKS; tick += 1) {
      events.push(...combat.step());
    }
    assert.equal(ryo.action?.moveId, "tornadoKick");
    assert.equal(
      ryo.action?.nextFollowupId,
      batched ? "tornadoKickFinish" : null,
    );
    if (!batched) {
      queueCombatCommand(ryo, "leg");
      events.push(...combat.step());
      assert.equal(ryo.action?.nextFollowupId, "tornadoKickFinish");
    }
    while (ryo.action?.moveId === "tornadoKick") {
      events.push(...combat.step());
    }
    assert.equal(ryo.action?.moveId, "tornadoKickFinish");
    assert.equal(
      events.find(
        (event) => event.type === "followup-stage-started",
      )?.followupId,
      "tornadoKickFinish",
    );
  }
});

test("Pit Blow adds its elbow follow-up only at moderate proficiency", () => {
  for (const [proficiency, expectedFollowup] of [
    [55, false],
    [56, true],
  ]) {
    const { combat, ryo } = duel();
    ryo.proficiency = proficiency;
    setCombatCommandOverride(ryo, "pitBlow");
    for (const command of ["up", "hand", "hand"]) {
      queueCombatCommand(ryo, command);
    }
    const events = [];
    for (let tick = 0; tick < COMMAND_COMMIT_TICKS; tick += 1) {
      events.push(...combat.step());
    }
    assert.equal(ryo.action?.moveId, "pitBlow");
    while (ryo.action?.moveId === "pitBlow") {
      events.push(...combat.step());
    }
    assert.equal(
      ryo.action?.moveId === "pitBlowElbow",
      expectedFollowup,
    );
    assert.equal(
      events.some((event) => (
        event.type === "followup-stage-started"
        && event.followupId === "pitBlowElbow"
      )),
      expectedFollowup,
    );
  }
});

test("a missed Arm Break Fire does not start its connected follow-up", () => {
  const { combat, ryo } = duel(10);
  const move = MARTIAL_ARTS_MOVES.armBreakFire;
  startCombatMove(ryo, move);
  queueCombatCommand(ryo, "hand");
  const events = Array.from(
    { length: move.duration },
    () => combat.step(),
  ).flat();
  assert.equal(ryo.action, null);
  assert.equal(
    events.some((event) => event.type === "followup-stage-started"),
    false,
  );
});

test("range and facing prevent hits behind or too far from the attacker", () => {
  for (const enemy of [
    createCombatant({ id: "behind", team: "enemy", z: -1 }),
    createCombatant({ id: "far", team: "enemy", z: 10 }),
  ]) {
    const combat = new MartialArtsCombat();
    const ryo = combat.add(createCombatant({
      id: "ryo",
      team: "player",
      yaw: 0,
    }));
    combat.add(enemy);
    startCombatMove(ryo, MARTIAL_ARTS_MOVES.tigerKnuckle);
    for (let tick = 0; tick < 20; tick += 1) combat.step();
    assert.equal(enemy.health, 20);
  }
});

test("guard blocks strikes while throws defeat guard", () => {
  {
    const { combat, ryo, enemy } = duel();
    enemy.guardHeld = true;
    const move = MARTIAL_ARTS_MOVES.sideReaperKick;
    startCombatMove(ryo, move);
    for (let tick = 0; tick <= move.startup; tick += 1) combat.step();
    assert.equal(enemy.health, 20);
    assert.equal(enemy.reaction.kind, "guard");
    assert.equal(enemy.knockdown, 0);
  }
  {
    const { combat, ryo, enemy } = duel(0.6);
    enemy.guardHeld = true;
    const move = MARTIAL_ARTS_MOVES.shoulderBuster;
    startCombatMove(ryo, move);
    for (let tick = 0; tick <= move.startup; tick += 1) combat.step();
    assert.equal(
      enemy.health,
      enemy.maxHealth - MARTIAL_ARTS_MOVES.shoulderBuster.damage,
    );
    assert.equal(enemy.reaction.kind, "knockdown");
    assert.ok(enemy.knockdown > 0);
  }
});

test("Shadow Step evades behind the opponent without damaging or stunning", () => {
  const { combat, ryo, enemy } = duel(0.6);
  const move = MARTIAL_ARTS_MOVES.shadowStep;
  startCombatMove(ryo, move);
  const events = [];
  for (let tick = 0; tick <= move.startup; tick += 1) {
    events.push(...combat.step());
  }
  const repositioned = events.find(
    (event) => event.type === "repositioned",
  );
  assert.ok(repositioned);
  assert.equal(repositioned.moveId, "shadowStep");
  assert.equal(enemy.health, enemy.maxHealth);
  assert.equal(enemy.hitStun, 0);
  assert.equal(enemy.knockdown, 0);
  assert.equal(enemy.reaction, null);
  assert.equal(opponentPosition(ryo, enemy), "back");
});

test("lethal hits mark defeat and prevent further commands", () => {
  const { combat, ryo, enemy } = duel();
  enemy.health = 2;
  startCombatMove(ryo, MARTIAL_ARTS_MOVES.tigerKnuckle);
  for (let tick = 0; tick < 10; tick += 1) combat.step();
  assert.equal(enemy.health, 0);
  assert.equal(enemy.defeated, true);
  assert.equal(enemy.reaction.kind, "defeated");
  assert.equal(queueCombatCommand(enemy, "hand"), false);
});

test("fixed-step updates are deterministic across frame rates", () => {
  const run = (delta, frames) => {
    const { combat, ryo, enemy } = duel();
    startCombatMove(ryo, MARTIAL_ARTS_MOVES.tigerKnuckle);
    const events = [];
    for (let frame = 0; frame < frames; frame += 1) {
      events.push(...combat.update(delta));
    }
    return { tick: combat.tick, health: enemy.health, events };
  };
  const sixty = run(1 / 60, 60);
  const thirty = run(1 / 30, 30);
  assert.equal(sixty.tick, thirty.tick);
  assert.equal(sixty.health, thirty.health);
  assert.deepEqual(sixty.events, thirty.events);
});

test("enemy AI approaches, guards, and selects attacks deterministically", () => {
  const enemy = createCombatant({ id: "enemy", team: "enemy", z: 3 });
  const target = createCombatant({ id: "ryo", team: "player" });
  const rolls = [0.1, 0.8];
  const ai = new MartialArtsEnemyAI({
    random: () => rolls.shift() ?? 0,
  });
  assert.equal(ai.decide(enemy, target).kind, "approach");
  enemy.z = 1;
  const decision = ai.decide(enemy, target);
  assert.equal(decision.kind, "move");
  assert.equal(decision.moveId, "crescentKick");
});
