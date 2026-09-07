import assert from "node:assert/strict";
import test from "node:test";
import { AnimationStateMachine } from "../play/characters/AnimationStateMachine.js";

function machine(options = {}) {
  return new AnimationStateMachine({
    renderMatrixByKey: new Map(),
    emotes: [],
    runtimeEmotes: [],
    pickerEmoteIds: new Set(),
    gameTicksPerSecond: 30,
    emoteBlendTicks: 3,
    locomotionBlendSeconds: 0.1,
    locomotionStates: new Set(["idle", "walk", "run", "backpedal"]),
    applyPose() {},
    ...options,
  });
}

test("position-preserving emotes settle at their destination and transfer displacement only on completion", () => {
  const frame = (x, z) => ({poseMatrices: [[1,0,0,0, 0,1,0,0, 0,0,1,0, x,0,z,1]]});
  for (const preserveEndPosition of [false, true]) {
    let actorX = 0, actorZ = 0, cleared = [];
    const emote = {id: "drink", exit: "drink", preserveEndPosition};
    const animation = machine({renderMatrixByKey: new Map([[0,0]]),
      onEmoteCleared: event => {
        cleared.push(event);
        actorX += event.completionTranslation?.[0] || 0;
        actorZ += event.completionTranslation?.[2] || 0;
      }});
    animation.clips = {idle: {frames: [frame(0.1, 0.2)]}, "drink:exit": {frames: [frame(0.1, 0.2), frame(1.1, -0.3)]}};
    animation.prepareEmotePhaseClips([emote]);
    animation.playEmote(emote);
    animation.advanceEmotePhase();
    animation.advanceEmotePhase();
    animation.transition = null; // This test jumps past the timed entry blend.
    animation.tick = 2;
    const before = animation.currentRoutes(0.9).routedMatrices.get(0);
    assert.ok(Math.abs(before[12] - (preserveEndPosition ? 1.1 : 0.1)) < 1e-6);
    animation.advanceEmotePhase();
    const after = animation.currentRoutes(0).routedMatrices.get(0);
    assert.ok(Math.abs(actorX + after[12] - before[12]) < 1e-6);
    assert.ok(Math.abs(actorZ + after[14] - before[14]) < 1e-6);
    assert.equal(cleared.length, 1);
    animation.clearEmote();
    assert.equal(cleared.length, 1, "completion cannot move the actor twice");
    animation.playEmote(emote);
    animation.clearEmote();
    assert.equal(cleared.at(-1).completionTranslation, undefined, "cancellation must not teleport to the unplayed endpoint");
    assert.equal(animation.clips.idle.frames[0].poseMatrices[0][12], 0.1, "shared idle is never translated");
  }
});

test("deferred animation preparation keeps movement ready and builds optional clips once", () => {
  const emote = {id: "bow", entry: "bow-start", loop: "bow-loop", exit: "bow-end"};
  const animation = machine({runtimeEmotes: [emote]});
  const built = [];
  animation.buildClip = (_bank, name) => {
    built.push(name);
    return {name, frames: [{poseMatrices: []}], shoulderRollRawEnd: [0, 0]};
  };
  animation.alignEmotePhaseOrigins = () => {};
  animation.buildPoseBlendClip = () => ({frames: [{poseMatrices: []}]});
  animation.configure({
    motion: {}, supplementalMotions: new Map([["vehicle", {}]]),
    sequences: {idle: "idle", walk: "walk", run: "run", turnLeft: "left", turnRight: "right", forkliftSit: "seat"},
    locomotionMotionFiles: {forkliftSit: "vehicle"},
    scriptedMotions: {1: "script"},
    combatMotion: {}, combatStance: "stance", deferOptional: true,
  });
  assert.deepEqual(built, ["idle", "walk", "run", "left", "right"]);
  assert.equal(animation.clips.forkliftSit.name, "seat");
  assert.equal(animation.clips.forkliftSit.name, "seat");
  assert.equal(built.filter(name => name === "seat").length, 1);
  assert.equal(animation.clips["native-motion:1"].name, "script");
  animation.ensureEmote("bow"); animation.ensureEmote("bow");
  assert.deepEqual(built.slice(-3), ["bow-start", "bow-loop", "bow-end"]);
  assert.deepEqual(animation.phaseStates.get("bow"), ["bow:blendIn", "bow:entry", "bow:loop", "bow:exit", "bow:blendOut"]);
  assert.equal(built.includes("stance"), false);
  assert.equal(animation.clips.combatStance.name, "stance");
});

test("failed deferred clip preparation remains retryable", () => {
  const animation = machine(); animation.clips = {};
  let attempts = 0;
  animation.registerClip("optional", () => {
    if (++attempts === 1) throw new Error("bank not loaded");
    return {frames: []};
  });
  assert.throws(() => animation.clips.optional, /bank not loaded/);
  assert.deepEqual(animation.clips.optional, {frames: []});
  assert.equal(animation.clips.optional, animation.clips.optional);
  assert.equal(attempts, 2);
});

test("emotes blend from the displayed approach pose while native-direct motions remain unblended", () => {
  const frame = x => ({poseMatrices: [[1,0,0,0, 0,1,0,0, 0,0,1,0, x,0,0,1]]});
  for (const nativeDirect of [false, true]) {
    let displayed;
    const animation = machine({renderMatrixByKey: new Map([[0,0]]),
      applyPose: pose => {displayed = pose.routedMatrices.get(0)[12];}});
    animation.clips = {walk: {frames: [frame(3)]}, idle: {frames: [frame(0)]}, entry: {frames: [frame(0),frame(0),frame(0),frame(0)]}};
    animation.state = "walk"; animation.phaseStates.set("drink", ["entry"]);
    animation.playEmote({id: "drink", nativeDirect});
    assert.equal(displayed, nativeDirect ? 0 : 3);
    if (!nativeDirect) {
      animation.update(.05, "entry"); assert.ok(displayed > 0 && displayed < 3);
      animation.update(.05, "entry"); assert.equal(displayed, 0);
    }
  }
});

test("feature clip preparation observes cancellation before starting another clip", async () => {
  const animation = machine(); animation.clips = {};
  const controller = new AbortController();
  const built = [];
  for (const state of ["first", "second"]) animation.registerClip(state, () => {
    built.push(state); controller.abort(); return {frames: []};
  });
  await assert.rejects(animation.prepareClips(["first", "second"], controller.signal), {name: "AbortError"});
  assert.deepEqual(built, ["first"]);
  await animation.prepareClips(["second"]);
  assert.deepEqual(built, ["first", "second"]);
});

test("locomotion state preserves idle and reverse-walk semantics", () => {
  const animation = machine();
  for (const [turnDirection, state] of [[-1, "turnLeft"], [1, "turnRight"]]) {
    assert.equal(animation.stateForMovement({ moving: false, turning: true, turnDirection }), state);
    assert.equal(animation.stateForMovement({ moving: true, turning: true, turnDirection }), "walk");
  }
  assert.equal(animation.stateForMovement({
    moving: false,
    turning: false,
  }), "idle");
  assert.equal(animation.stateForMovement({
    moving: true,
    turning: false,
    backpedaling: true,
    running: true,
  }), "backpedal");
  assert.equal(animation.locomotionClipState("backpedal"), "walk");
});

test("reset returns playback counters to an idle state", () => {
  const animation = machine();
  animation.state = "run";
  animation.tick = 12;
  animation.accumulator = 0.75;
  animation.transition = {};
  animation.reset();
  assert.equal(animation.state, "idle");
  assert.equal(animation.tick, 0);
  assert.equal(animation.accumulator, 0);
  assert.equal(animation.transition, null);
});

test("locomotion callbacks fire on authored contact ticks and loop", () => {
  const cues = [];
  const animation = machine({
    onActionCue: (event) => cues.push([
      event.state,
      event.tick,
      event.cue.contactKind,
    ]),
  });
  const frame = { poseMatrices: [] };
  animation.clips = {
    idle: { frames: [frame] },
    walk: {
      frames: [frame, frame, frame, frame],
      sequence: { name: "walk" },
      surfaceSoundCuesByTick: new Map([
        [0, { contactKind: 0 }],
        [2, { contactKind: 1 }],
      ]),
    },
  };
  animation.update(0, "walk");
  animation.update(2 / 30, "walk");
  animation.update(2 / 30, "walk");
  assert.deepEqual(cues, [
    ["walk", 0, 0],
    ["walk", 2, 1],
    ["walk", 0, 0],
  ]);
});

test("authored emote sound cues fire once on their converted native tick", () => {
  const cues = [];
  const animation = machine({
    onActionCue: (event) => cues.push(event),
  });
  const frame = { poseMatrices: [] };
  animation.clips = {
    idle: { frames: [frame] },
    "dobuitaGacha:loop": {
      frames: Array.from({ length: 540 }, () => frame),
      sequence: { name: "AKI_ASOBU_GATYA" },
      authoredSoundCuesByTick: new Map([
        [360, [{
          frame: 360,
          commandHex: "a9040200",
          bank: "e1gachap",
        }]],
      ]),
    },
  };
  animation.state = "dobuitaGacha:loop";
  animation.update(359 / 30, "dobuitaGacha:loop");
  assert.deepEqual(cues, []);
  animation.update(1 / 30, "dobuitaGacha:loop");
  assert.equal(cues.length, 1);
  assert.equal(cues[0].type, "nativeSound");
  assert.equal(cues[0].tick, 360);
  assert.equal(cues[0].cue.commandHex, "a9040200");
  animation.update(1 / 30, "dobuitaGacha:loop");
  assert.equal(cues.length, 1);
});

test("a network-only interaction emote holds its remote loop", () => {
  const animation = machine({
    runtimeEmotes: [{
      id: "cinemaSit",
      loop: "AKI_AKI_SIT_CHAIR_DOWN_LP",
      holdLoopUntilMovement: true,
    }],
  });
  animation.phaseStates.set("cinemaSit", ["cinemaSit:loop"]);
  animation.clips = {
    "cinemaSit:loop": {
      frames: [
        { poseMatrices: [] },
        { poseMatrices: [] },
      ],
    },
  };

  assert.notEqual(animation.remoteEmoteRoutes("cinemaSit", 60), null);
});

test("one-shot states hold against movement and return to idle", () => {
  const animation = machine();
  animation.clips = {
    idle: { frames: [{ poseMatrices: [] }] },
    walk: { frames: [{ poseMatrices: [] }] },
    run: { frames: [{ poseMatrices: [] }] },
    forkliftSit: { frames: [{ poseMatrices: [] }] },
    combatStance: { frames: [{ poseMatrices: [] }] },
    "combat:tigerKnuckle": {
      frames: [
        { poseMatrices: [] },
        { poseMatrices: [] },
      ],
    },
  };
  let completed = false;
  assert.equal(animation.playCombatMove("tigerKnuckle", {
    onComplete: () => {
      completed = true;
    },
  }), true);
  assert.ok(animation.transition, "combat move blends from the current pose");
  assert.equal(animation.stateForMovement({ moving: true }), "combat:tigerKnuckle");
  // The player frame requests its ordinary combat stance after processing
  // combat events. That request must not overwrite the active move.
  animation.update(1 / 30, "combatStance");
  assert.equal(animation.state, "combat:tigerKnuckle");
  animation.update(1 / 30, "combatStance");
  assert.equal(animation.state, "idle");
  assert.equal(animation.activeOneShot, null);
  assert.equal(completed, true);
});

test("a held one-shot remains on its final frame until reset", () => {
  const animation = machine();
  const applied = [];
  let completed = 0;
  animation.applyPose = ({ frame, nextFrame, amount }) => {
    applied.push({
      frame: frame.id,
      nextFrame: nextFrame.id,
      amount,
    });
  };
  animation.clips = {
    idle: { frames: [{ id: "idle", poseMatrices: [] }] },
    "combat-reaction:defeated": {
      frames: [
        { id: "falling", poseMatrices: [] },
        { id: "defeated", poseMatrices: [] },
      ],
    },
  };
  assert.equal(animation.playCombatReaction("defeated", {
    holdLastFrame: true,
    onComplete: () => {
      completed += 1;
    },
  }), true);
  animation.update(1 / 15, "combat-reaction:defeated");
  assert.equal(animation.state, "combat-reaction:defeated");
  assert.equal(animation.tick, 1);
  assert.ok(animation.activeOneShot);
  applied.length = 0;
  for (let frame = 0; frame < 12; frame += 1) {
    animation.update(1 / 120, "combatStance");
    assert.equal(animation.tick, 1);
    assert.equal(animation.accumulator, 0);
  }
  assert.equal(completed, 1);
  assert.deepEqual(
    [...new Set(applied.map(({ frame }) => frame))],
    ["defeated"],
  );
  assert.deepEqual(
    [...new Set(applied.map(({ nextFrame }) => nextFrame))],
    ["defeated"],
  );
  assert.deepEqual(
    [...new Set(applied.map(({ amount }) => amount))],
    [0],
  );
  animation.reset();
  assert.equal(animation.activeOneShot, null);
  assert.equal(animation.state, "idle");
});

test("native motion phase follows the exact fractional MOTN clock", () => {
  const animation = machine();
  const frames = Array.from({ length: 60 }, () => ({
    poseMatrices: [],
    actorTranslation: [0, 0, 0],
  }));
  animation.clips = {
    idle: { frames: [{ poseMatrices: [] }] },
    "native-motion:28683": {
      frames,
      timing: { gameTicksPerCycle: 60 },
    },
  };
  assert.equal(animation.playNativeMotionRequest(0x700b, {
    holdLastFrame: true,
    context: {
      kind: "native-scripted-motion",
      request: 0x700b,
    },
    blendSeconds: 0,
  }), true);
  const revision = animation.activeOneShot.playbackRevision;
  animation.update(1.5 / 30, animation.state);
  assert.deepEqual(animation.nativeMotionPhase(revision), {
    request: 0x700b,
    phase: 1.5,
    gameTicksPerCycle: 60,
  });
  assert.deepEqual(animation.nativeMotionControllerVector(revision), [0, 0, 0]);
  assert.equal(animation.nativeMotionPhase(revision + 1), null);
});

test("a held victim pose blends directly back into combat stance", () => {
  const animation = machine();
  animation.clips = {
    idle: { frames: [{ poseMatrices: [] }] },
    combatStance: { frames: [{ poseMatrices: [] }] },
    "combat:overthrow:victim": {
      frames: [
        { poseMatrices: [] },
        { poseMatrices: [] },
      ],
    },
  };
  animation.playCombatMoveVictim("overthrow", { holdLastFrame: true });
  animation.update(1 / 15, "combatStance");
  assert.ok(animation.activeOneShot);
  assert.equal(animation.tick, 1);
  assert.equal(animation.releaseOneShot("combatStance"), true);
  assert.equal(animation.activeOneShot, null);
  assert.equal(animation.state, "combatStance");
  assert.ok(animation.transition);
});

test("defeat falls once then loops the grounded idle until reset", () => {
  const animation = machine();
  const applied = [];
  animation.applyPose = ({ frame, nextFrame }) => {
    applied.push([frame.id, nextFrame.id]);
  };
  animation.clips = {
    idle: { frames: [{ id: "idle", poseMatrices: [] }] },
    combatStance: { frames: [{ id: "stance", poseMatrices: [] }] },
    "combat-reaction:defeated": {
      frames: [
        { id: "fall-0", poseMatrices: [] },
        { id: "fall-1", poseMatrices: [] },
      ],
    },
    "combat-reaction:defeatedIdle": {
      frames: [
        { id: "down-0", poseMatrices: [] },
        { id: "down-1", poseMatrices: [] },
      ],
    },
  };

  assert.equal(animation.playCombatReaction("defeated", {
    holdLastFrame: true,
  }), true);
  animation.update(2 / 30, "combatStance");
  assert.equal(animation.state, "combat-reaction:defeatedIdle");
  assert.equal(animation.activeOneShot?.loop, true);

  applied.length = 0;
  for (let frame = 0; frame < 12; frame += 1) {
    animation.update(1 / 60, "combatStance");
  }
  assert.equal(animation.state, "combat-reaction:defeatedIdle");
  assert.equal(animation.activeOneShot?.loop, true);
  assert.ok(applied.every(([frame, nextFrame]) => (
    frame.startsWith("down-")
    && nextFrame.startsWith("down-")
  )));

  assert.equal(animation.releaseOneShot("combatStance"), true);
  assert.equal(animation.state, "combatStance");
  assert.equal(animation.activeOneShot, null);
});

test("traveling combat clips expose interpolated actor root motion", () => {
  const samples = [];
  const animation = machine();
  animation.applyPose = ({ oneShotRootMotion }) => {
    if (oneShotRootMotion) samples.push(oneShotRootMotion);
  };
  animation.clips = {
    idle: { frames: [{ poseMatrices: [], actorTranslation: [0, 0, 0] }] },
    "combat:mistralFlash": {
      rootMotion: { kind: "travel" },
      frames: [
        { poseMatrices: [], actorTranslation: [0, 0, 0] },
        { poseMatrices: [], actorTranslation: [0.25, 0, -1] },
        { poseMatrices: [], actorTranslation: [0.5, 0, -2] },
      ],
    },
  };
  animation.playCombatMove("mistralFlash");
  animation.update(1 / 60, "idle");
  assert.deepEqual(samples.at(-1).translation, [0.125, 0, -0.5]);
  const firstRevision = samples.at(-1).playbackRevision;
  animation.update(1 / 60, "idle");
  assert.deepEqual(samples.at(-1).translation, [0.25, 0, -1]);
  assert.equal(samples.at(-1).playbackRevision, firstRevision);
  assert.equal(animation.rebaseOneShotRootMotion(), true);
  assert.equal(samples.at(-1).generation, 1);
});

test("a held pose-root pair exposes its authored release offset", () => {
  const animation = machine();
  animation.clips = {
    idle: {
      rootMotion: { kind: "pose" },
      frames: [{
        poseMatrices: [[1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]],
      }],
    },
    "combat:paired": {
      rootMotion: { kind: "pose" },
      frames: [
        {
          poseMatrices: [[
            1, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, -1, 1,
          ]],
        },
        {
          poseMatrices: [[
            1, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0.25, 0, -2, 1,
          ]],
        },
      ],
    },
  };
  assert.equal(animation.playCombatMove("paired", {
    holdLastFrame: true,
    blendSeconds: 0,
  }), true);
  animation.update(1 / 30, "idle");
  assert.equal(animation.activeOneShotRootMotionKind(), "pose");
  assert.deepEqual(
    animation.activeOneShotPoseRootTranslation(),
    [0.25, 0, -2],
  );
  assert.deepEqual(animation.activeOneShotChoreographySample(), {
    kind: "pose",
    authoredTranslation: [0, 0, -1],
    embeddedTranslation: [0, 0, -1],
  });
});

test("combat moves can use a separate motion bank and animation property", () => {
  const animation = machine();
  const built = [];
  animation.buildClip = (motion, name) => {
    built.push([motion, name]);
    return { frames: [{ poseMatrices: [] }] };
  };
  const locomotion = { id: "locomotion" };
  const fight = { id: "fight" };
  const moves = { tiger: {
    id: "tiger",
    animation: "RYO_TIGER",
    enemyAnimation: "ENEMY_TIGER",
    victimAnimation: "ENEMY_HIT",
  } };

  animation.configure({
    motion: locomotion,
    supplementalMotions: new Map(),
    sequences: {
      idle: "IDLE",
      walk: "WALK",
      run: "RUN",
      forkliftSit: "SIT",
      turnLeft: "TURN_LEFT",
      turnRight: "TURN_RIGHT",
    },
    combatMotion: fight,
    combatMoveMotion: locomotion,
    combatVictimMotion: fight,
    combatStance: "STANCE",
    combatMoves: moves,
  });

  assert.ok(built.some(([motion, name]) => (
    motion === locomotion && name === "RYO_TIGER"
  )));
  assert.ok(built.some(([motion, name]) => (
    motion === fight && name === "ENEMY_HIT"
  )));
});

test("victim clips load when the actor has no attack override", () => {
  const animation = machine();
  const built = [];
  animation.buildClip = (motion, name) => {
    built.push([motion, name]);
    return { frames: [{ poseMatrices: [] }] };
  };
  const locomotion = { id: "locomotion" };
  const fight = { id: "fight" };

  animation.configure({
    motion: locomotion,
    supplementalMotions: new Map(),
    sequences: {
      idle: "IDLE",
      walk: "WALK",
      run: "RUN",
      forkliftSit: "SIT",
      turnLeft: "TURN_LEFT",
      turnRight: "TURN_RIGHT",
    },
    combatMotion: fight,
    combatMoveMotion: fight,
    combatMoveAnimationProperty: "enemyAnimation",
    combatVictimMotion: locomotion,
    combatMoves: {
      sweepThrow: {
        id: "sweepThrow",
        animation: "RYO_THROW",
        enemyAnimation: null,
        victimAnimation: "YKI_THROWN",
      },
    },
  });

  assert.equal(animation.clips["combat:sweepThrow"], undefined);
  assert.ok(animation.clips["combat:sweepThrow:victim"]);
  assert.ok(built.some(([motion, name]) => (
    motion === locomotion && name === "YKI_THROWN"
  )));
});

test("forklift locomotion can use its native supplemental motion bank", () => {
  const animation = machine();
  const built = [];
  animation.buildClip = (motion, name) => {
    built.push([motion, name]);
    return { frames: [{ poseMatrices: [] }] };
  };
  const locomotion = { id: "locomotion" };
  const forklift = { id: "native-forklift" };
  animation.configure({
    motion: locomotion,
    supplementalMotions: new Map([["M_FREE.BIN", forklift]]),
    sequences: {
      idle: "IDLE",
      walk: "WALK",
      run: "RUN",
      forkliftSit: "AKI_RIDE_FORKLIFT_LP_F",
      turnLeft: "TURN_LEFT",
      turnRight: "TURN_RIGHT",
    },
    locomotionMotionFiles: {
      forkliftSit: "M_FREE.BIN",
    },
  });
  assert.ok(built.some(([motion, name]) => (
    motion === forklift && name === "AKI_RIDE_FORKLIFT_LP_F"
  )));
});

test("native dialogue clips do not acquire generic emote blend phases", () => {
  const animation = machine();
  const emote = {
    id: "nativeDialogue",
    entry: "SOURCE_MOTION",
    nativeDirect: true,
  };
  animation.runtimeEmotes = [emote];
  animation.clips = {
    idle: { frames: [{ poseMatrices: [] }] },
    "nativeDialogue:entry": { frames: [{ poseMatrices: [] }] },
  };

  animation.prepareEmotePhaseClips();

  assert.deepEqual(
    animation.phaseStates.get("nativeDialogue"),
    ["nativeDialogue:entry"],
  );
  assert.equal(animation.clips["nativeDialogue:blendIn"], undefined);
  assert.equal(animation.clips["nativeDialogue:blendOut"], undefined);
});
